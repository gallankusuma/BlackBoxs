import 'dotenv/config';
import { sapuFixture } from './_bersih';
/**
 * SCHED-R57 (lanjutan) — basis sumber daya `/resume` ikut dibekukan.
 *
 * Cacatnya terverifikasi di kode: `GET /proposals/:id/resume` membaca
 * `ahsp_items` LIVE — koefisien MAUPUN `resource_harga` — lalu mengalikannya
 * dengan qty item. Akibatnya untuk penawaran yang SUDAH DIKIRIM:
 *
 * 1. kebutuhan material/tenaga/alat bergeser begitu master AHSP disunting;
 * 2. biaya sumber dayanya berhenti sejalan dengan `unit_price_snapshot` yang
 *    dipakai BOQ penawaran itu sendiri.
 *
 * Procurement plan dan mobilization plan dibangun dari layar ini.
 *
 * Prasyarat: backend jalan. Jalankan: npm run test:resume
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

const cari = (list: any[], nama: string) => (list || []).find((x: any) => x.resource_name === nama);

async function main() {
  const stamp = Date.now().toString().slice(-7);
  const { dbGet, dbAll, dbRun } = await import('../src/config/database');

  console.log('0. Persiapan');
  const master: string = (await call('POST', '/auth/login', { email: ADMIN_EMAIL, password: ADMIN_PASS })).json?.token;
  if (!master) { console.log('  FAIL login master'); process.exit(1); }
  pass++; console.log('  ok   login master');

  // Tiga bagian AHSP sekaligus: A tenaga, B material, C alat — supaya
  // ketiganya benar-benar terbukti ikut dibekukan, bukan hanya salah satu.
  const ahsp = await call('POST', '/estimator/ahsp', {
    kode: `RSM.${stamp}`, name: `Beton Resume ${stamp}`, satuan: 'm3', status: 'active',
    items: [
      { section: 'A', resource_type: 'labor', resource_name: `Tukang ${stamp}`,
        resource_satuan: 'OH', koefisien: 2, resource_harga: 150000 },
      { section: 'B', resource_type: 'material', resource_name: `Semen ${stamp}`,
        resource_satuan: 'zak', koefisien: 5, resource_harga: 60000 },
      { section: 'C', resource_type: 'equipment', resource_name: `Molen ${stamp}`,
        resource_satuan: 'jam', koefisien: 0.5, resource_harga: 200000 },
    ],
  }, master);
  const ahspId = ahsp.json?.id ?? ahsp.json?.data?.id;
  chk('AHSP tiga bagian dibuat', !!ahspId, true);

  const p = await call('POST', '/estimator/proposals',
    { project_name: `Uji resume ${stamp}`, status: 'draft' }, master);
  const pid = p.json?.id;
  const it = await call('POST', `/estimator/proposals/${pid}/items`, { ahsp_id: ahspId, qty: 10 }, master);
  chk('proposal + item siap', !!pid && !!it.json?.id, true);

  try {
    console.log('\n1. Resume draft dihitung live — itu memang benar');
    const r1 = await call('GET', `/estimator/proposals/${pid}/resume`, undefined, master);
    chk('resume terbaca', r1.status, 200);
    chk('sumbernya dinyatakan live', r1.json?.sumber, 'live');
    // 10 m3 x koefisien.
    chk('tenaga 10 x 2 = 20 OH', Number(cari(r1.json?.labor, `Tukang ${stamp}`)?.total_qty), 20);
    chk('material 10 x 5 = 50 zak', Number(cari(r1.json?.materials, `Semen ${stamp}`)?.total_qty), 50);
    chk('alat 10 x 0,5 = 5 jam', Number(cari(r1.json?.equipment, `Molen ${stamp}`)?.total_qty), 5);
    chk('biaya material 50 x 60.000', Number(cari(r1.json?.materials, `Semen ${stamp}`)?.total_cost), 3000000);
    chk('total tenaga 20 x 150.000', Number(r1.json?.totals?.labor_cost), 3000000);
    chk('total alat 5 x 200.000', Number(r1.json?.totals?.equipment_cost), 1000000);

    console.log('\n2. Submit membekukan basis sumber dayanya');
    const inc = await call('GET', `/estimator/proposals/${pid}/items/incomplete`, undefined, master);
    const ids = (inc.json?.items || []).map((x: any) => x.id);
    if (ids.length) {
      await call('PUT', `/estimator/proposals/${pid}/items/scope`,
        { item_ids: ids, scope_status: 'excluded', scope_note: 'fixture' }, master);
    }
    await call('PUT', `/estimator/proposals/${pid}/status`, { status: 'review' }, master);
    await call('PUT', `/estimator/proposals/${pid}/status`, { status: 'submitted' }, master);

    const rev: any = await dbGet(
      `SELECT id, revision_no, resource_checksum, resource_line_count
       FROM proposal_revisions WHERE proposal_id = ? ORDER BY revision_no DESC LIMIT 1`, [pid]);
    chk('revisi punya checksum sumber daya', String(rev?.resource_checksum || '').length, 64);
    chk('tiga baris sumber daya dipotret', Number(rev?.resource_line_count), 3);
    const potret: any[] = await dbAll(
      'SELECT * FROM proposal_revision_resource WHERE revision_id = ? ORDER BY line_no', [rev.id]);
    chk('ketiga bagian ikut, bukan salah satu',
      potret.map((x: any) => x.section).sort().join(''), 'ABC');
    // Harga saat dibekukan ikut tersimpan — inilah yang membuat biayanya tetap
    // sejalan dengan BOQ walau master dinaikkan.
    chk('harga saat beku ikut tersimpan',
      Number(potret.find((x: any) => x.section === 'B')?.resource_harga), 60000);

    console.log('\n3. INI YANG MENENTUKAN — master diubah setelah dikirim ke client');
    // Dua-duanya digeser: koefisien (menggeser KUANTITAS) dan harga
    // (menggeser BIAYA). Cacatnya memang dua, jadi dibuktikan dua-duanya.
    await dbRun(`UPDATE ahsp_items SET koefisien = koefisien * 3 WHERE ahsp_id = ?`, [ahspId]);
    await dbRun(`UPDATE ahsp_items SET resource_harga = resource_harga * 10 WHERE ahsp_id = ?`, [ahspId]);
    const cek: any = await dbGet(
      `SELECT koefisien, resource_harga FROM ahsp_items WHERE ahsp_id = ? AND section = 'B'`, [ahspId]);
    chk('master benar-benar berubah (koef 5 → 15)', Number(cek?.koefisien), 15);
    chk('dan harganya (60.000 → 600.000)', Number(cek?.resource_harga), 600000);

    const r2 = await call('GET', `/estimator/proposals/${pid}/resume`, undefined, master);
    chk('resume dibaca dari POTRET', r2.json?.sumber, 'snapshot');
    chk('revisinya disebut', Number(r2.json?.revision_no), Number(rev.revision_no));
    chk('kuantitas material TIDAK bergeser', Number(cari(r2.json?.materials, `Semen ${stamp}`)?.total_qty), 50);
    chk('kuantitas tenaga TIDAK bergeser', Number(cari(r2.json?.labor, `Tukang ${stamp}`)?.total_qty), 20);
    chk('kuantitas alat TIDAK bergeser', Number(cari(r2.json?.equipment, `Molen ${stamp}`)?.total_qty), 5);
    chk('harga satuannya pun tetap harga saat dikirim',
      Number(cari(r2.json?.materials, `Semen ${stamp}`)?.resource_harga), 60000);
    chk('biaya material TIDAK bergeser', Number(r2.json?.totals?.material_cost), 3000000);
    chk('biaya tenaga TIDAK bergeser', Number(r2.json?.totals?.labor_cost), 3000000);
    chk('biaya alat TIDAK bergeser', Number(r2.json?.totals?.equipment_cost), 1000000);

    console.log('\n4. Hitung ulang dengan master sekarang masih bisa — tapi harus diminta');
    const r3 = await call('GET', `/estimator/proposals/${pid}/resume?hitung_ulang=1`, undefined, master);
    chk('sumbernya live', r3.json?.sumber, 'live');
    chk('kuantitasnya memang 3x (50 → 150)',
      Number(cari(r3.json?.materials, `Semen ${stamp}`)?.total_qty), 150);
    // 150 zak x 600.000 = 90.000.000 — 30x lipat dari 3.000.000.
    chk('dan biayanya 30x lipat (3jt → 90jt)', Number(r3.json?.totals?.material_cost), 90000000);
    chk('yang membuktikan potretnya benar-benar menahan pergeseran',
      Number(r2.json?.totals?.material_cost) !== Number(r3.json?.totals?.material_cost), true);

    console.log('\n5. Agregasi tetap benar saat satu sumber daya dipakai dua item');
    const p2 = await call('POST', '/estimator/proposals',
      { project_name: `Uji resume agregasi ${stamp}`, status: 'draft' }, master);
    const pid2 = p2.json?.id;
    await call('POST', `/estimator/proposals/${pid2}/items`, { ahsp_id: ahspId, qty: 2 }, master);
    await call('POST', `/estimator/proposals/${pid2}/items`, { ahsp_id: ahspId, qty: 3 }, master);
    const r4 = await call('GET', `/estimator/proposals/${pid2}/resume`, undefined, master);
    // Koefisien sekarang 15 (sudah dikali 3 di atas): (2 + 3) x 15 = 75.
    chk('dua item AHSP sama dijumlahkan, bukan ditimpa',
      Number(cari(r4.json?.materials, `Semen ${stamp}`)?.total_qty), 75);
    chk('sumber AHSP-nya dicatat sekali', (cari(r4.json?.materials, `Semen ${stamp}`)?.sources || []).length, 1);
    chk('rincian per item tetap dua baris',
      (r4.json?.materials_detail || []).filter((x: any) => x.resource_name === `Semen ${stamp}`).length, 2);

    console.log('\n6. Durasi work package berasal dari tenaga AHSP, bukan dikarang');
    // Sebelumnya server mengirim duration_days: 0 dengan catatan "frontend can
    // edit", dan layar mengisinya Math.max(7, ceil(qty/10)*7) — 10 m3 menjadi
    // 7 hari, angka yang tidak ada hubungannya dengan tenaga AHSP. Tab itu
    // bernama "Master Schedule", jadi satu proposal menampilkan dua jadwal
    // berbeda di dua tempat.
    const wp = (r2.json?.schedule_items || [])[0];
    chk('work package punya durasi', Number(wp?.duration_days) > 0, true);
    // Potret: 20 OH tenaga / 8 pekerja bawaan = 2,5 hari.
    chk('durasinya dari OH tenaga (20/8 = 2,5), bukan qty/10', Number(wp?.duration_days), 2.5);
    chk('bukan 7 hari karangan qty/10', Number(wp?.duration_days) === 7, false);

    // Draft (jalur live) juga, supaya nolnya tidak diam-diam kembali.
    const wpLive = (r4?.json?.schedule_items || [])[0];
    chk('draft pun punya durasi nyata', Number(wpLive?.duration_days) > 0, true);

    console.log('\n7. Terjaga auth & proposal tak dikenal');
    const tanpa = await call('GET', `/estimator/proposals/${pid}/resume`);
    chk('tanpa token 401', tanpa.status, 401);
    const hilang = await call('GET', '/estimator/proposals/99999999/resume', undefined, master);
    chk('proposal tidak ada memberi 404', hilang.status, 404);

  } finally {
    console.log('\n8. Bersih-bersih');
    const disapu = await sapuFixture(stamp, [`RSM.${stamp}`]);
    // Dua proposal dibuat di tes ini — keduanya harus tersapu.
    chk('kedua proposal fixture tersapu', disapu.proposal >= 2, true);
    chk('AHSP fixture ikut tersapu', disapu.ahsp >= 1, true);
    const yatim: any = await dbGet(
      `SELECT COUNT(*) n FROM proposal_revision_resource r
       LEFT JOIN proposal_revisions pr ON pr.id = r.revision_id WHERE pr.id IS NULL`);
    chk('nol baris sumber daya tanpa revisi (FK cascade)', Number(yatim?.n), 0);
  }

  console.log(`\n=== ${pass} lulus, ${fail} gagal ===`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
