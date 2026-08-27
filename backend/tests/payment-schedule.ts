import 'dotenv/config';
/**
 * Tes Payment Schedule (kurva kas / rencana billing).
 *
 * Bug yang dibuktikan:
 *
 * 1. Handler membaca `proposals.total_price` — kolom yang TIDAK PERNAH ADA,
 *    di dev maupun produksi. Setiap permintaan berakhir `ER_BAD_FIELD_ERROR`
 *    dan tab ini tidak pernah sekali pun berhasil dimuat. Frontend hanya
 *    menulis errornya ke console, jadi kegagalannya tak terlihat siapa pun.
 * 2. Item tanpa durasi dilewati `continue`, padahal nilainya sudah ikut di
 *    total kontrak — uangnya lenyap dari kurva tanpa jejak.
 * 3. Batas bulan memakai tengah malam HARI TERAKHIR, sementara rentang item
 *    setengah terbuka. Aktivitas yang melintasi pergantian bulan kehilangan
 *    satu hari alokasi; aktivitas satu hari tepat di akhir bulan kehilangan
 *    seluruh bobotnya.
 * 4. Tidak ada invarian jumlah = nilai kontrak, sementara footer di layar
 *    selalu mencetak 100%.
 *
 * Prasyarat: backend jalan. Jalankan: npm run test:payment-schedule
 */
const API = process.env.API || 'http://localhost:3005/api';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'master@admin.com';
const ADMIN_PASS = process.env.ADMIN_PASS || process.env.MASTER_PASSWORD || 'master';

let pass = 0, fail = 0;
const chk = (label: string, actual: unknown, expected: unknown) => {
  if (actual === expected) { pass++; console.log(`  ok   ${label} → ${JSON.stringify(actual)}`); }
  else { fail++; console.log(`  FAIL ${label} → dapat ${JSON.stringify(actual)}, harusnya ${JSON.stringify(expected)}`); }
};

async function call(method: string, path: string, body?: unknown, token?: string) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  let json: any = null;
  try { json = JSON.parse(text); } catch { /* bukan JSON */ }
  return { status: res.status, json, text };
}

const sen = (v: unknown) => Math.round(Number(v || 0) * 100);

async function main() {
  const stamp = Date.now().toString().slice(-7);
  const bersihkan: Array<() => Promise<unknown>> = [];

  console.log('0. Persiapan');
  const master: string = (await call('POST', '/auth/login', { email: ADMIN_EMAIL, password: ADMIN_PASS })).json?.token;
  if (!master) { console.log('  FAIL login master'); process.exit(1); }
  pass++; console.log('  ok   login master');

  const { dbRun } = await import('../src/config/database');

  try {
    // AHSP tanpa item tenaga (section A) → durasi otomatisnya 0. Itu justru yang
    // ingin diuji: item semacam ini dulu dibuang dari distribusi.
    const buatAhsp = async (nama: string, harga: number, denganTenaga: boolean) => {
      const items: any[] = [
        { section: 'B', resource_type: 'material', resource_name: 'Bahan Uji',
          resource_satuan: 'm3', koefisien: 1, resource_harga: harga },
      ];
      if (denganTenaga) {
        items.push({ section: 'A', resource_type: 'labor', resource_name: 'Tukang',
                     resource_satuan: 'OH', koefisien: 8, resource_harga: 0 });
      }
      const r = await call('POST', '/estimator/ahsp', {
        kode: `TEST-PS-${stamp}-${nama}`, name: `AHSP PS ${nama} ${stamp}`, satuan: 'm3', status: 'active', items,
      }, master);
      chk(`AHSP ${nama} dibuat`, r.status, 201);
      return r.json?.id;
    };

    const ahspKerja = await buatAhsp('KERJA', 1000000, true);
    const ahspTanpaTenaga = await buatAhsp('MILESTONE', 500000, false);

    const buatProposal = async (nama: string) => {
      const r = await call('POST', '/estimator/proposals', { project_name: nama, status: 'draft' }, master);
      const id = r.json?.id ?? r.json?.data?.id;
      bersihkan.push(() => call('DELETE', `/estimator/proposals/${id}`, undefined, master));
      return id;
    };

    const tambahItem = (propId: number, ahsp_id: number, qty: number) =>
      call('POST', `/estimator/proposals/${propId}/items`, { ahsp_id, qty }, master);

    const setOverride = async (propId: number, itemId: number, startDay: number, duration: number) => {
      await dbRun(
        `INSERT INTO schedule_overrides (proposal_item_id, start_day_override, duration_days_override)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE start_day_override = VALUES(start_day_override),
                                 duration_days_override = VALUES(duration_days_override)`,
        [itemId, startDay, duration]
      );
      bersihkan.push(() => dbRun('DELETE FROM schedule_overrides WHERE proposal_item_id = ?', [itemId]));
    };

    const itemsOf = async (propId: number) => {
      const r = await call('GET', `/estimator/proposals/${propId}/items`, undefined, master);
      return (r.json?.data ?? r.json ?? []) as any[];
    };

    const jadwal = (propId: number, startDate: string) =>
      call('GET', `/estimator/proposals/${propId}/payment-schedule?start_date=${startDate}`, undefined, master);

    // ── 1. Endpointnya hidup sama sekali ────────────────────────────────────
    console.log('\n1. Endpoint menjawab, bukan 500');
    const p1 = await buatProposal(`PS dasar ${stamp}`);
    await tambahItem(p1, ahspKerja, 10);
    const j1 = await jadwal(p1, '2026-03-10');
    chk('payment-schedule 200 (dulu selalu 500)', j1.status, 200);
    chk('nilai kontrak terbaca > 0', Number(j1.json?.total_contract) > 0, true);

    console.log('\n2. Proposal tak dikenal → 404, bukan diam-diam nol');
    chk('id asing ditolak', (await jadwal(99999999, '2026-03-10')).status, 404);

    // ── 3. Item tanpa durasi tidak menguap ──────────────────────────────────
    console.log('\n3. Item tanpa durasi tetap masuk kurva');
    const p2 = await buatProposal(`PS tanpa durasi ${stamp}`);
    await tambahItem(p2, ahspTanpaTenaga, 4);        // tanpa tenaga → durasi 0
    const j2 = await jadwal(p2, '2026-03-10');
    chk('jadwal terbentuk meski durasi 0', (j2.json?.monthly || []).length > 0, true);
    chk('seluruh nilai kontrak terjadwal',
      sen(j2.json?.scheduled_amount), sen(j2.json?.total_contract));
    chk('dinyatakan balance', j2.json?.reconciled, true);
    chk('tidak ada nilai tersisa', sen(j2.json?.unallocated_amount), 0);

    // ── 4. Campuran: ada yang berdurasi, ada yang tidak ─────────────────────
    console.log('\n4. Campuran item berdurasi dan milestone tetap balance');
    const p3 = await buatProposal(`PS campuran ${stamp}`);
    await tambahItem(p3, ahspKerja, 10);
    await tambahItem(p3, ahspTanpaTenaga, 3);
    const j3 = await jadwal(p3, '2026-03-10');
    chk('jumlah bulan = nilai kontrak',
      sen(j3.json?.scheduled_amount), sen(j3.json?.total_contract));
    chk('jumlah planned_amount tiap bulan = kontrak',
      (j3.json?.monthly || []).reduce((a: number, m: any) => a + sen(m.planned_amount), 0),
      sen(j3.json?.total_contract));
    chk('kumulatif bobot berakhir 100%',
      Number((j3.json?.monthly || []).slice(-1)[0]?.cumulative_bobot), 100);
    chk('kumulatif nilai berakhir = kontrak',
      sen((j3.json?.monthly || []).slice(-1)[0]?.cumulative_amount), sen(j3.json?.total_contract));

    // ── 5. Satu hari tepat di akhir bulan ───────────────────────────────────
    // Dengan batas bulan lama (tengah malam hari terakhir), irisannya nol dan
    // seluruh bobot item ini hilang.
    console.log('\n5. Aktivitas satu hari tepat di akhir bulan tidak hilang');
    const p4 = await buatProposal(`PS akhir bulan ${stamp}`);
    await tambahItem(p4, ahspKerja, 5);
    const it4 = await itemsOf(p4);
    chk('item p4 ada', it4.length, 1);
    // start_date 2026-03-01, mulai hari ke-30 → 31 Maret, durasi 1 hari.
    await setOverride(p4, it4[0].id, 30, 1);
    const j4 = await jadwal(p4, '2026-03-01');
    chk('bulan Maret terisi', (j4.json?.monthly || []).some((m: any) => m.month === '2026-03'), true);
    chk('seluruh nilai terjadwal', sen(j4.json?.scheduled_amount), sen(j4.json?.total_contract));
    chk('balance', j4.json?.reconciled, true);

    // ── 6. Lintas pergantian bulan ──────────────────────────────────────────
    console.log('\n6. Aktivitas lintas bulan terbagi tanpa kehilangan hari');
    const p5 = await buatProposal(`PS lintas bulan ${stamp}`);
    await tambahItem(p5, ahspKerja, 5);
    const it5 = await itemsOf(p5);
    // Mulai 30 Maret, durasi 4 hari → 30,31 Maret + 1,2 April = 2 hari : 2 hari.
    await setOverride(p5, it5[0].id, 29, 4);
    const j5 = await jadwal(p5, '2026-03-01');
    const bulan5 = j5.json?.monthly || [];
    chk('terbagi ke 2 bulan', bulan5.length, 2);
    chk('Maret dapat separuh', Number(bulan5[0]?.planned_bobot), 50);
    chk('April dapat separuh', Number(bulan5[1]?.planned_bobot), 50);
    chk('tidak ada hari yang hilang', sen(j5.json?.scheduled_amount), sen(j5.json?.total_contract));

    // ── 7. Durasi pecahan ───────────────────────────────────────────────────
    // Versi lama membulatkan durasi dengan Math.round, jadi 0,4 hari → 0 hari
    // dan nilainya hilang seluruhnya.
    console.log('\n7. Durasi pecahan di bawah satu hari tidak dibulatkan jadi nol');
    const p6 = await buatProposal(`PS pecahan ${stamp}`);
    await tambahItem(p6, ahspKerja, 5);
    const it6 = await itemsOf(p6);
    await setOverride(p6, it6[0].id, 0, 0.4);
    const j6 = await jadwal(p6, '2026-03-10');
    chk('tetap terjadwal', (j6.json?.monthly || []).length > 0, true);
    chk('nilainya utuh', sen(j6.json?.scheduled_amount), sen(j6.json?.total_contract));

    // ── 8. Nilai pecahan & pembulatan ───────────────────────────────────────
    console.log('\n8. Sisa pembulatan tidak menguap');
    const ahspGanjil = await buatAhsp('GANJIL', 333333.33, true);
    const p7 = await buatProposal(`PS pembulatan ${stamp}`);
    await tambahItem(p7, ahspGanjil, 3);
    await tambahItem(p7, ahspGanjil, 7);
    await tambahItem(p7, ahspKerja, 1);
    const it7 = await itemsOf(p7);
    // Sebar ke tiga bulan supaya pembagiannya menghasilkan pecahan sen.
    await setOverride(p7, it7[0].id, 0, 45);
    await setOverride(p7, it7[1].id, 10, 33);
    await setOverride(p7, it7[2].id, 5, 7);
    const j7 = await jadwal(p7, '2026-01-20');
    chk('jumlah bulanan = kontrak persis',
      (j7.json?.monthly || []).reduce((a: number, m: any) => a + sen(m.planned_amount), 0),
      sen(j7.json?.total_contract));
    chk('kumulatif bobot berakhir tepat 100%',
      Number((j7.json?.monthly || []).slice(-1)[0]?.cumulative_bobot), 100);
    chk('dinyatakan balance', j7.json?.reconciled, true);

  } finally {
    console.log('\n9. Bersih-bersih');
    let sisa = 0;
    for (const hapus of bersihkan.reverse()) {
      try { await hapus(); } catch { sisa++; }
    }
    chk('data uji terhapus', sisa, 0);
  }

  console.log(`\n=== ${pass} lulus, ${fail} gagal ===`);
  process.exit(fail ? 1 : 0);
}

main().catch(err => { console.error('Tes gagal dijalankan:', err.message); process.exit(1); });
