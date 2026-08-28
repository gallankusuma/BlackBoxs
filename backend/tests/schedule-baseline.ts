import 'dotenv/config';
import { sapuFixture } from './_bersih';
/**
 * SCHED-R57 — master schedule yang reproducible.
 *
 * Dua cacat yang membuatnya tidak reproducible, keduanya terbukti di kode:
 *
 * 1. **Parameter jadwal tidak pernah disimpan.** `workers_per_day`,
 *    `hours_per_day`, dan `start_date` hanya query parameter, dan layar
 *    menginisialisasi tanggal mulai dari `new Date()` — jam browser. Membuka
 *    proposal yang SAMA besok menghasilkan tanggal berbeda.
 * 2. **Jadwal dihitung ulang dari master LIVE tiap request.** Begitu komposisi
 *    AHSP diperbaiki, durasi dan tanggal selesai proposal yang sudah dikirim ke
 *    client ikut berubah — tanpa satu pun tindakan estimator.
 *
 * Akibatnya baseline tender, mobilization plan, dan cash-flow tidak bisa
 * direkonsiliasi dengan apa yang benar-benar dikirim.
 *
 * Prasyarat: backend jalan. Jalankan: npm run test:jadwal
 */
const API = process.env.API || 'http://localhost:3005/api';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'master@admin.com';
const ADMIN_PASS = process.env.ADMIN_PASS || process.env.MASTER_PASSWORD || 'master';

let pass = 0, fail = 0;
const chk = (label: string, actual: unknown, expected: unknown) => {
  if (JSON.stringify(actual) === JSON.stringify(expected)) {
    pass++; console.log(`  ok   ${label} → ${JSON.stringify(actual)}`);
  } else {
    fail++; console.log(`  FAIL ${label} → dapat ${JSON.stringify(actual)}, harusnya ${JSON.stringify(expected)}`);
  }
};

async function call(method: string, path: string, body?: unknown, token?: string) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  let json: any = null; try { json = JSON.parse(text); } catch {}
  return { status: res.status, json, text };
}

async function main() {
  const stamp = Date.now().toString().slice(-7);
  const { dbGet, dbAll, dbRun } = await import('../src/config/database');

  console.log('0. Persiapan');
  const master: string = (await call('POST', '/auth/login', { email: ADMIN_EMAIL, password: ADMIN_PASS })).json?.token;
  if (!master) { console.log('  FAIL login master'); process.exit(1); }
  pass++; console.log('  ok   login master');

  // AHSP dengan tenaga di section A — itulah yang menentukan durasi.
  const ahsp = await call('POST', '/estimator/ahsp', {
    kode: `SCH.${stamp}`, name: `Beton Jadwal ${stamp}`, satuan: 'm3', status: 'active',
    items: [
      { section: 'A', resource_type: 'labor', resource_name: 'Pekerja',
        resource_satuan: 'OH', koefisien: 2, resource_harga: 150000 },
      { section: 'B', resource_type: 'material', resource_name: 'Bahan',
        resource_satuan: 'm3', koefisien: 1, resource_harga: 1000000 },
    ],
  }, master);
  const ahspId = ahsp.json?.id ?? ahsp.json?.data?.id;
  chk('AHSP dengan tenaga dibuat', !!ahspId, true);

  const p = await call('POST', '/estimator/proposals',
    { project_name: `Uji jadwal ${stamp}`, status: 'draft' }, master);
  const pid = p.json?.id;
  const it = await call('POST', `/estimator/proposals/${pid}/items`, { ahsp_id: ahspId, qty: 40 }, master);
  const itemId = it.json?.id;
  chk('proposal + item siap', !!pid && !!itemId, true);

  try {
    console.log('\n1. Parameter jadwal bisa DISIMPAN pada proposalnya');
    const simpan = await call('PUT', `/estimator/proposals/${pid}/schedule-params`, {
      start_date: '2026-03-25', workers_per_day: 10, hours_per_day: 8, workdays_per_week: 6,
    }, master);
    chk('tersimpan', simpan.status, 200);
    chk('tanggal mulai kembali sama', simpan.json?.settings?.start_date, '2026-03-25');
    chk('pekerja per hari kembali sama', simpan.json?.settings?.workers_per_day, 10);

    console.log('\n2. Dibaca ulang TANPA query parameter — inilah yang dulu hilang');
    // Sebelumnya tanpa query, jadwal memakai default 8/8 dan tanggal hari ini
    // dari jam browser. Sekarang harus memakai yang tersimpan.
    const j1 = await call('GET', `/estimator/proposals/${pid}/schedule`, undefined, master);
    chk('jadwal terbaca', j1.status, 200);
    chk('memakai parameter tersimpan, bukan default',
      j1.json?.settings?.workers_per_day, 10);
    chk('dan tanggal tersimpan, bukan hari ini', j1.json?.settings?.start_date, '2026-03-25');
    chk('sumbernya dinyatakan', j1.json?.sumber, 'live');
    const tugas1 = (j1.json?.wbs || []).find((w: any) => w.type === 'item');
    chk('ada baris pekerjaan', !!tugas1, true);
    // 40 m3 x 2 OH = 80 OH; 10 pekerja x (8/8) = 10/hari → 8 hari.
    chk('durasi = 80 OH / 10 pekerja = 8 hari', Number(tugas1?.duration_days), 8);
    chk('tanggal mulai ikut terhitung', tugas1?.start_date, '2026-03-25');

    console.log('\n3. Submit MEMBEKUKAN jadwalnya bersama revisinya');
    const inc = await call('GET', `/estimator/proposals/${pid}/items/incomplete`, undefined, master);
    const ids = (inc.json?.items || []).map((x: any) => x.id);
    if (ids.length) {
      await call('PUT', `/estimator/proposals/${pid}/items/scope`,
        { item_ids: ids, scope_status: 'excluded', scope_note: 'fixture' }, master);
    }
    await call('PUT', `/estimator/proposals/${pid}/status`, { status: 'review' }, master);
    await call('PUT', `/estimator/proposals/${pid}/status`, { status: 'submitted' }, master);

    const rev: any = await dbGet(
      `SELECT id, revision_no, schedule_total_days, schedule_checksum, schedule_start_date,
              schedule_workers_per_day FROM proposal_revisions
       WHERE proposal_id = ? ORDER BY revision_no DESC LIMIT 1`, [pid]);
    chk('revisi punya checksum jadwal', String(rev?.schedule_checksum || '').length, 64);
    chk('total durasinya tersimpan', Number(rev?.schedule_total_days), 8);
    chk('parameternya ikut menempel di revisi', Number(rev?.schedule_workers_per_day), 10);
    const barisRev: any[] = await dbAll(
      'SELECT * FROM proposal_revision_schedule WHERE revision_id = ? ORDER BY line_no', [rev.id]);
    chk('baris jadwal ikut dipotret', barisRev.length > 0, true);
    // Komposisi tenaga ikut dipotret — tanpa itu "kenapa durasinya 8 hari"
    // hanya bisa dijawab dengan menghitung ulang dari master.
    const komponen = (() => {
      const b = barisRev.find(x => x.row_type === 'item');
      try { return typeof b?.labor_components === 'string' ? JSON.parse(b.labor_components) : b?.labor_components; }
      catch { return []; }
    })();
    chk('komposisi tenaga ikut dipotret', Array.isArray(komponen) && komponen.length > 0, true);
    chk('dan menyebut 80 OH', Number(komponen?.[0]?.oh), 80);

    console.log('\n4. INI YANG PALING PENTING — master AHSP diubah setelah submit');
    // Koefisien tenaga digandakan: kalau jadwal dihitung ulang dari master,
    // durasinya akan berubah 8 → 16 hari pada penawaran yang SUDAH DIKIRIM.
    await dbRun(
      `UPDATE ahsp_items SET koefisien = koefisien * 2 WHERE ahsp_id = ? AND section = 'A'`,
      [ahspId]);
    const sesudahUbah: any = await dbGet(
      `SELECT koefisien FROM ahsp_items WHERE ahsp_id = ? AND section = 'A' LIMIT 1`, [ahspId]);
    chk('master benar-benar berubah (koefisien 2 → 4)', Number(sesudahUbah?.koefisien), 4);

    const j2 = await call('GET', `/estimator/proposals/${pid}/schedule`, undefined, master);
    chk('jadwal dibaca dari POTRET, bukan dihitung ulang', j2.json?.sumber, 'snapshot');
    chk('total durasinya TIDAK bergeser', Number(j2.json?.total_duration_days), 8);
    const tugas2 = (j2.json?.wbs || []).find((w: any) => w.type === 'item');
    chk('durasi barisnya TIDAK bergeser', Number(tugas2?.duration_days), 8);
    chk('tanggalnya pun tidak bergeser', tugas2?.start_date, '2026-03-25');
    chk('checksumnya dilaporkan', j2.json?.schedule_checksum, rev.schedule_checksum);
    chk('nomor revisinya disebut', Number(j2.json?.revision_no), Number(rev.revision_no));

    console.log('\n5. Perhitungan ulang masih bisa diminta secara EKSPLISIT');
    // Untuk membandingkan "kalau dihitung dengan master sekarang" — tapi harus
    // diminta, tidak pernah terjadi diam-diam.
    const j3 = await call('GET', `/estimator/proposals/${pid}/schedule?hitung_ulang=1`, undefined, master);
    chk('sumbernya live', j3.json?.sumber, 'live');
    const tugas3 = (j3.json?.wbs || []).find((w: any) => w.type === 'item');
    chk('dan durasinya memang berbeda (160 OH / 10 = 16 hari)',
      Number(tugas3?.duration_days), 16);
    chk('yang membuktikan potretnya benar-benar menahan perubahan',
      Number(tugas2?.duration_days) !== Number(tugas3?.duration_days), true);

    console.log('\n5b. Kurva kas membaca potret yang SAMA, bukan menghitung sendiri');
    // Dua endpoint yang masing-masing menghitung durasi dari master live adalah
    // dua sumber kebenaran. Kalau kurva kas ikut bergeser sementara Gantt tidak,
    // selisihnya tidak bisa dijelaskan ke siapa pun.
    const kas = await call('GET', `/estimator/proposals/${pid}/payment-schedule`, undefined, master);
    chk('payment-schedule terbaca', kas.status, 200);
    chk('sumbernya potret', kas.json?.sumber, 'snapshot');
    chk('revisi yang sama disebut', Number(kas.json?.revision_no), Number(rev.revision_no));
    chk('tanggal mulainya ikut potret, bukan hari ini', kas.json?.start_date, '2026-03-25');
    chk('kurvanya balance ke nilai revisi', kas.json?.reconciled, true);
    const bulanPotret = (kas.json?.monthly || []).length;
    chk('ada bulan terisi', bulanPotret > 0, true);

    const kasLive = await call('GET',
      `/estimator/proposals/${pid}/payment-schedule?hitung_ulang=1`, undefined, master);
    chk('hitung ulang eksplisit memberi live', kasLive.json?.sumber, 'live');
    // Durasi 8 → 16 hari menggeser sebaran bulannya; kalau tidak, potretnya
    // tidak sedang menahan apa-apa.
    // Label bulannya bisa saja sama; yang harus berbeda adalah PORSInya.
    // 25 Maret + 8 hari → Maret 87,5% / April 12,5%. + 16 hari → 43,75/56,25.
    const porsiPotret = JSON.stringify((kas.json?.monthly || [])
      .map((m: any) => `${m.label}:${Number(m.planned_bobot).toFixed(2)}`));
    const porsiLive = JSON.stringify((kasLive.json?.monthly || [])
      .map((m: any) => `${m.label}:${Number(m.planned_bobot).toFixed(2)}`));
    chk('sebaran nilainya memang berbeda kalau dihitung ulang',
      porsiPotret !== porsiLive, true);
    chk('dan yang live pun tetap balance', kasLive.json?.reconciled, true);

    console.log('\n6. Proposal terkunci menolak perubahan parameter');
    const tolak = await call('PUT', `/estimator/proposals/${pid}/schedule-params`,
      { start_date: '2027-01-01' }, master);
    chk('ditolak 409', tolak.status, 409);
    chk('kodenya PROPOSAL_LOCKED', tolak.json?.code, 'PROPOSAL_LOCKED');
    const masih: any = await dbGet('SELECT schedule_start_date FROM proposals WHERE id = ?', [pid]);
    chk('tanggalnya tidak berubah', String(masih?.schedule_start_date).slice(0, 10), '2026-03-25');

    console.log('\n7. Parameter tidak masuk akal ditolak, bukan dibulatkan diam-diam');
    const p2 = await call('POST', '/estimator/proposals',
      { project_name: `Uji jadwal validasi ${stamp}`, status: 'draft' }, master);
    const pid2 = p2.json?.id;
    for (const [body, sebab] of [
      [{ workers_per_day: 0 }, 'nol pekerja → durasi tak hingga'],
      [{ hours_per_day: 200 }, '200 jam sehari'],
      [{ workdays_per_week: 9 }, '9 hari seminggu'],
      [{ start_date: '02-03-2026' }, 'format tanggal terbalik'],
    ] as any[]) {
      const r = await call('PUT', `/estimator/proposals/${pid2}/schedule-params`, body, master);
      chk(`ditolak: ${sebab}`, r.status, 400);
    }
    const sah = await call('PUT', `/estimator/proposals/${pid2}/schedule-params`,
      { start_date: '2026-05-04', workers_per_day: 6, hours_per_day: 7 }, master);
    chk('yang wajar diterima', sah.status, 200);

    console.log('\n8. Terjaga auth');
    chk('simpan parameter tanpa token 401',
      (await call('PUT', `/estimator/proposals/${pid2}/schedule-params`, { workers_per_day: 5 })).status, 401);
    chk('proposal tidak ada memberi 404',
      (await call('GET', '/estimator/proposals/999999999/schedule', undefined, master)).status, 404);

  } finally {
    console.log('\n9. Bersih-bersih');
    const disapu = await sapuFixture(stamp);
    chk('fixture tersapu', disapu.proposal >= 1, true);
    const yatim: any = await dbGet(
      `SELECT COUNT(*) n FROM proposal_revision_schedule s
       WHERE NOT EXISTS (SELECT 1 FROM proposal_revisions r WHERE r.id = s.revision_id)`);
    chk('nol baris jadwal tanpa revisi (FK cascade)', Number(yatim?.n), 0);
  }

  console.log(`\n=== ${pass} lulus, ${fail} gagal ===`);
  process.exit(fail ? 1 : 0);
}
main().catch(e => { console.error('Tes gagal dijalankan:', e.message); process.exit(1); });
