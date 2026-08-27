import 'dotenv/config';
/**
 * Tes kepemilikan & kunci pada schedule override / progress.
 *
 * Bug yang dibuktikan: empat route schedule tidak pernah mengikat id item ke id
 * proposal di URL. `PUT` menerima `proposal_item_id` dari body, `DELETE`/`GET`
 * memakai `:itemId` saja, dan `:id` di URL tidak dipakai untuk apa pun. Siapa
 * pun yang terautentikasi dan menebak id item bisa membaca atau menimpa jadwal
 * proposal milik orang lain — cukup menyebut proposalnya sendiri di URL.
 *
 * Tidak ada pula pemeriksaan status, jadi tanggal/durasi dan progress pada
 * proposal yang sudah dikirim atau menjadi kontrak tetap bisa berubah tanpa
 * revisi — kurva kas dan bukti baseline ikut bergeser diam-diam.
 *
 * Prasyarat: backend jalan. Jalankan: npm run test:schedule-ownership
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

async function main() {
  const stamp = Date.now().toString().slice(-7);
  const bersihkan: Array<() => Promise<unknown>> = [];

  console.log('0. Persiapan');
  const master: string = (await call('POST', '/auth/login', { email: ADMIN_EMAIL, password: ADMIN_PASS })).json?.token;
  if (!master) { console.log('  FAIL login master'); process.exit(1); }
  pass++; console.log('  ok   login master');

  const { dbGet, dbAll } = await import('../src/config/database');

  try {
    const ahsp = await call('POST', '/estimator/ahsp', {
      kode: `TEST-SCH-${stamp}`, name: `AHSP Jadwal ${stamp}`, satuan: 'm3', status: 'active',
      items: [{ section: 'A', resource_type: 'labor', resource_name: 'Tukang',
                resource_satuan: 'OH', koefisien: 4, resource_harga: 150000 }],
    }, master);
    chk('AHSP uji dibuat', ahsp.status, 201);
    const ahspId = ahsp.json?.id;

    const buatProposalBeritem = async (nama: string) => {
      const p = await call('POST', '/estimator/proposals', { project_name: nama, status: 'draft' }, master);
      const id = p.json?.id ?? p.json?.data?.id;
      bersihkan.push(() => call('DELETE', `/estimator/proposals/${id}`, undefined, master));
      await call('POST', `/estimator/proposals/${id}/items`, { ahsp_id: ahspId, qty: 5 }, master);
      const its = await call('GET', `/estimator/proposals/${id}/items`, undefined, master);
      const item = (its.json?.data ?? its.json ?? [])[0];
      return { id, itemId: item?.id };
    };

    const A = await buatProposalBeritem(`Jadwal A ${stamp}`);
    const B = await buatProposalBeritem(`Jadwal B ${stamp}`);
    chk('proposal A punya item', !!A.itemId, true);
    chk('proposal B punya item', !!B.itemId, true);

    // ── 1. Milik sendiri tetap bisa ─────────────────────────────────────────
    console.log('\n1. Override atas item sendiri tetap berhasil');
    chk('simpan override A', (await call('PUT', `/estimator/proposals/${A.id}/schedule/overrides`,
      { proposal_item_id: A.itemId, start_day_override: 3, duration_days_override: 5 }, master)).status, 200);
    const cekA: any = await dbGet('SELECT start_day_override FROM schedule_overrides WHERE proposal_item_id = ?', [A.itemId]);
    chk('tersimpan di database', Number(cekA?.start_day_override), 3);

    // ── 2. Item milik proposal lain ditolak ────────────────────────────────
    console.log('\n2. Item proposal lain ditolak, tidak ditimpa');
    const silang = await call('PUT', `/estimator/proposals/${A.id}/schedule/overrides`,
      { proposal_item_id: B.itemId, start_day_override: 999, duration_days_override: 999 }, master);
    chk('override lintas proposal ditolak', silang.status, 404);
    chk('kodenya jelas', silang.json?.code, 'ITEM_BUKAN_MILIK_PROPOSAL');
    const cekB = await dbAll('SELECT * FROM schedule_overrides WHERE proposal_item_id = ?', [B.itemId]);
    // Inti temuannya: sebelum perbaikan, baris ini ADA karena ditulis lewat URL milik A.
    chk('jadwal B tidak ikut tertulis', cekB.length, 0);

    console.log('\n3. Hapus override lintas proposal ditolak');
    // B dibuatkan override sah lebih dulu lewat URL-nya sendiri.
    chk('override B dibuat lewat URL B', (await call('PUT', `/estimator/proposals/${B.id}/schedule/overrides`,
      { proposal_item_id: B.itemId, start_day_override: 7, duration_days_override: 2 }, master)).status, 200);
    const hapusSilang = await call('DELETE', `/estimator/proposals/${A.id}/schedule/overrides/${B.itemId}`, undefined, master);
    chk('DELETE lintas proposal ditolak', hapusSilang.status, 404);
    const masihAda = await dbAll('SELECT * FROM schedule_overrides WHERE proposal_item_id = ?', [B.itemId]);
    chk('override B masih utuh', masihAda.length, 1);

    // ── 4. Progress: tulis & baca lintas proposal ──────────────────────────
    console.log('\n4. Progress lintas proposal ditolak dua arah');
    chk('progress atas item sendiri berhasil',
      (await call('PUT', `/estimator/proposals/${A.id}/schedule-progress`,
        { proposal_item_id: A.itemId, unit_number: 1, step_code: 'FAB', step_name: 'Fabrikasi', status: 'done' },
        master)).status, 200);

    const tulisSilang = await call('PUT', `/estimator/proposals/${A.id}/schedule-progress`,
      { proposal_item_id: B.itemId, unit_number: 1, step_code: 'FAB', step_name: 'Disusupi', status: 'done' }, master);
    chk('tulis progress lintas proposal ditolak', tulisSilang.status, 404);
    chk('progress B tidak tersentuh',
      (await dbAll('SELECT * FROM schedule_progress WHERE proposal_item_id = ?', [B.itemId])).length, 0);

    const bacaSilang = await call('GET', `/estimator/proposals/${B.id}/schedule-progress/${A.itemId}`, undefined, master);
    chk('baca progress lintas proposal → 404, bukan bocor', bacaSilang.status, 404);
    chk('tidak mengembalikan baris', Array.isArray(bacaSilang.json) ? bacaSilang.json.length : 0, 0);

    const bacaSendiri = await call('GET', `/estimator/proposals/${A.id}/schedule-progress/${A.itemId}`, undefined, master);
    chk('baca progress sendiri tetap 200', bacaSendiri.status, 200);
    chk('isinya terbaca', (bacaSendiri.json || []).length, 1);

    // ── 5. Proposal terkunci ────────────────────────────────────────────────
    console.log('\n5. Proposal submitted terkunci untuk jadwal & progress');
    await call('PUT', `/estimator/proposals/${A.id}/status`, { status: 'review' }, master);
    chk('A jadi submitted',
      (await call('PUT', `/estimator/proposals/${A.id}/status`, { status: 'submitted' }, master)).status, 200);

    const ovTerkunci = await call('PUT', `/estimator/proposals/${A.id}/schedule/overrides`,
      { proposal_item_id: A.itemId, start_day_override: 42, duration_days_override: 42 }, master);
    chk('override pada submitted ditolak 409', ovTerkunci.status, 409);
    chk('kodenya PROPOSAL_LOCKED', ovTerkunci.json?.code, 'PROPOSAL_LOCKED');
    const tetap: any = await dbGet('SELECT start_day_override FROM schedule_overrides WHERE proposal_item_id = ?', [A.itemId]);
    chk('nilai lama tidak berubah', Number(tetap?.start_day_override), 3);

    chk('DELETE override pada submitted ditolak 409',
      (await call('DELETE', `/estimator/proposals/${A.id}/schedule/overrides/${A.itemId}`, undefined, master)).status, 409);
    chk('progress pada submitted ditolak 409',
      (await call('PUT', `/estimator/proposals/${A.id}/schedule-progress`,
        { proposal_item_id: A.itemId, unit_number: 1, step_code: 'FAB', step_name: 'Fabrikasi', status: 'pending' },
        master)).status, 409);
    // Membaca tetap boleh — yang dikunci adalah perubahan, bukan visibilitas.
    chk('baca progress pada submitted tetap 200',
      (await call('GET', `/estimator/proposals/${A.id}/schedule-progress/${A.itemId}`, undefined, master)).status, 200);

    // ── 6. proposal_item_id wajib ───────────────────────────────────────────
    console.log('\n6. Permintaan tanpa proposal_item_id ditolak, bukan 500');
    chk('override tanpa item id → 400',
      (await call('PUT', `/estimator/proposals/${B.id}/schedule/overrides`, { start_day_override: 1 }, master)).status, 400);
    chk('progress tanpa item id → 400',
      (await call('PUT', `/estimator/proposals/${B.id}/schedule-progress`, { unit_number: 1, step_code: 'X' }, master)).status, 400);

    // ── 7. FK menghapus baris jadwal saat itemnya dihapus ──────────────────
    console.log('\n7. Item dihapus → baris jadwalnya ikut hilang (tidak jadi yatim)');
    const fk = await dbAll(
      `SELECT CONSTRAINT_NAME FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN ('schedule_overrides','schedule_progress')
         AND REFERENCED_TABLE_NAME = 'proposal_items'`);
    chk('FK terpasang di kedua tabel', fk.length, 2);

    chk('item B dihapus',
      (await call('DELETE', `/estimator/proposals/${B.id}/items/${B.itemId}`, undefined, master)).status, 200);
    chk('override B ikut terhapus',
      (await dbAll('SELECT * FROM schedule_overrides WHERE proposal_item_id = ?', [B.itemId])).length, 0);

    // ── 8. Nilai jadwal dibatasi ────────────────────────────────────────────
    //
    // Kolomnya DECIMAL(10,2), jadi sanggup menerima ~99.999.999 hari, dan
    // route-nya dulu menuliskannya apa adanya. Terukur sebelum perbaikan: satu
    // override durasi 99.999.999 hari membuat SATU permintaan payment-schedule
    // berjalan 80,7 detik dan membentuk 3.284.816 objek bulan. Nilainya
    // tersimpan, jadi setiap pembukaan tab mengulang beban yang sama.
    console.log('\n8. Nilai jadwal di luar batas ditolak');
    const propBatas = await buatProposalBeritem(`Jadwal batas ${stamp}`);

    const tolakan: Array<[string, any]> = [
      ['durasi 99.999.999 hari', { start_day_override: 0, duration_days_override: 99999999 }],
      ['durasi negatif',         { start_day_override: 0, duration_days_override: -50 }],
      ['start_day negatif',      { start_day_override: -9999, duration_days_override: 5 }],
      ['durasi bukan angka',     { start_day_override: 0, duration_days_override: 'abc' }],
      // JSON tidak bisa membawa Infinity — `JSON.stringify(1e999)` menjadi
      // `null`, yang justru terbaca sebagai "tidak diisi". Yang benar-benar
      // sampai ke server adalah bentuk teksnya.
      ['durasi "Infinity"',      { start_day_override: 0, duration_days_override: 'Infinity' }],
      ['durasi NaN (teks)',      { start_day_override: 0, duration_days_override: 'NaN' }],
    ];
    for (const [label, body] of tolakan) {
      const r = await call('PUT', `/estimator/proposals/${propBatas.id}/schedule/overrides`,
        { proposal_item_id: propBatas.itemId, ...body }, master);
      chk(`${label} ditolak 400`, r.status, 400);
    }
    chk('tidak ada override tersimpan dari nilai liar',
      (await dbAll('SELECT * FROM schedule_overrides WHERE proposal_item_id = ?', [propBatas.itemId])).length, 0);

    const wajar = await call('PUT', `/estimator/proposals/${propBatas.id}/schedule/overrides`,
      { proposal_item_id: propBatas.itemId, start_day_override: 10, duration_days_override: 45 }, master);
    chk('nilai wajar tetap diterima', wajar.status, 200);

    // Batasnya persis: 3650 hari lolos, 3651 ditolak.
    chk('tepat di batas (3650 hari) diterima',
      (await call('PUT', `/estimator/proposals/${propBatas.id}/schedule/overrides`,
        { proposal_item_id: propBatas.itemId, start_day_override: 0, duration_days_override: 3650 }, master)).status, 200);
    chk('sehari di atas batas ditolak',
      (await call('PUT', `/estimator/proposals/${propBatas.id}/schedule/overrides`,
        { proposal_item_id: propBatas.itemId, start_day_override: 0, duration_days_override: 3651 }, master)).status, 400);

    console.log('\n9. Payment schedule tetap responsif dan berbatas');
    const t0 = Date.now();
    const ps = await call('GET',
      `/estimator/proposals/${propBatas.id}/payment-schedule?start_date=2026-01-01`, undefined, master);
    const lamaMs = Date.now() - t0;
    chk('payment-schedule menjawab 200', ps.status, 200);
    // 3650 hari ≈ 121 bulan. Dulu bisa jutaan.
    chk('jumlah bulan wajar (< 200)', (ps.json?.monthly || []).length < 200, true);
    chk(`selesai cepat (${lamaMs}ms < 5000ms)`, lamaMs < 5000, true);

    chk('start_date ngawur ditolak 400',
      (await call('GET', `/estimator/proposals/${propBatas.id}/payment-schedule?start_date=bukan-tanggal`,
        undefined, master)).status, 400);
    // Pembagi nol/negatif tidak boleh merambat jadi Infinity ke seluruh kurva.
    const psNol = await call('GET',
      `/estimator/proposals/${propBatas.id}/payment-schedule?start_date=2026-01-01&workers_per_day=0&hours_per_day=-5`,
      undefined, master);
    chk('workers/hours tidak valid → pakai bawaan, bukan Infinity', psNol.status, 200);
    chk('nilainya tetap berhingga',
      (psNol.json?.monthly || []).every((m: any) => Number.isFinite(Number(m.planned_amount))), true);

  } finally {
    console.log('\n10. Bersih-bersih');
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
