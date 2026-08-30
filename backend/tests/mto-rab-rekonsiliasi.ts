import 'dotenv/config';
import { sapuFixture } from './_bersih';
/**
 * Rekonsiliasi MTO ↔ RAB untuk seluruh proposal.
 *
 * Jembatan per-zona sudah ada, tapi ia hanya menjawab satu zona pada satu
 * waktu. Dua pertanyaan yang tidak bisa dijawab siapa pun sebelum ini:
 *
 *   - berapa banyak pekerjaan yang sudah dihitung MTO tapi BELUM masuk anggaran;
 *   - berapa nilai RAB yang kuantitasnya diketik tangan TANPA dasar MTO.
 *
 * Arah kedua yang paling sering luput. Baris tanpa tautan tidak otomatis salah
 * — mobilisasi dan K3 memang tidak punya perhitungan teknis — tapi ia tidak
 * bisa ditelusuri ke gambar, jadi jumlahnya harus terlihat.
 *
 * Prasyarat: backend jalan. Jalankan: npm run test:mto-rab-rekon
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

  console.log('0. Persiapan — dua zona MTO + satu baris RAB tanpa dasar');
  const master: string = (await call('POST', '/auth/login', { email: ADMIN_EMAIL, password: ADMIN_PASS })).json?.token;
  if (!master) { console.log('  FAIL login master'); process.exit(1); }
  pass++; console.log('  ok   login master');

  const mkAhsp = async (kode: string, nama: string, satuan: string, harga: number) =>
    (await call('POST', '/estimator/ahsp', {
      kode, name: nama, satuan, status: 'active',
      items: [{ section: 'B', resource_type: 'material', resource_name: `Bahan ${stamp}`,
        resource_satuan: satuan, koefisien: 1, resource_harga: harga }],
    }, master)).json?.id;
  const aBeton  = await mkAhsp(`RK1.${stamp}`, `Beton mutu K-300 ${stamp}`, 'm3', 1200000);
  const aGalian = await mkAhsp(`RK2.${stamp}`, `Galian tanah biasa ${stamp}`, 'm3', 85000);
  const aMobil  = await mkAhsp(`RK3.${stamp}`, `Mobilisasi alat ${stamp}`, 'unit', 25000000);

  const p = await call('POST', '/estimator/proposals',
    { project_name: `Uji rekonsiliasi ${stamp}`, status: 'draft' }, master);
  const pid = p.json?.id;

  const zona1 = await call('POST', `/estimator/proposals/${pid}/mto`, {
    element_type: 'foundation', element_name: `Pondasi A ${stamp}`,
    parameters: { foundation_type: 'footplate', L: 2, W: 2, H: 0.4, qty: 10, depth: 1.5, lean_t: 0.05 },
  }, master);
  const zona2 = await call('POST', `/estimator/proposals/${pid}/mto`, {
    element_type: 'foundation', element_name: `Pondasi B ${stamp}`,
    parameters: { foundation_type: 'footplate', L: 1.5, W: 1.5, H: 0.35, qty: 6, depth: 1.2, lean_t: 0.05 },
  }, master);
  chk('dua zona siap', !!zona1.json?.id && !!zona2.json?.id, true);

  // Baris RAB tanpa dasar MTO — mobilisasi, yang memang tidak punya perhitungan.
  const mobil = await call('POST', `/estimator/proposals/${pid}/items`,
    { ahsp_id: aMobil, qty: 1 }, master);
  chk('baris tanpa dasar MTO dibuat', !!mobil.json?.id, true);

  try {
    console.log('\n1. Rekonsiliasi menjawab SELURUH proposal sekaligus');
    const r = await call('GET', `/estimator/proposals/${pid}/mto-rab`, undefined, master);
    chk('terbaca', r.status, 200);
    chk('dinyatakan tidak menulis', r.json?.tersimpan, false);
    chk('dua zona terbaca', r.json?.ringkasan?.jml_zona, 2);
    chk('barisnya banyak (2 zona pondasi)', r.json?.ringkasan?.jml_baris_mto >= 10, true);
    chk('belum satu pun masuk RAB', r.json?.ringkasan?.sudah_di_rab, 0);
    chk('cakupannya 0%', Number(r.json?.ringkasan?.cakupan_pct), 0);

    console.log('\n2. INI YANG SEBELUMNYA TIDAK TERLIHAT — RAB tanpa dasar MTO');
    chk('satu baris tanpa dasar', r.json?.rab_tanpa_dasar_mto?.jumlah, 1);
    chk('nilainya disebut', Number(r.json?.rab_tanpa_dasar_mto?.nilai) > 0, true);
    chk('barisnya bisa dikenali', r.json?.rab_tanpa_dasar_mto?.items?.[0]?.kode, `RK3.${stamp}`);
    // Seluruh nilai proposal saat ini tidak bisa ditelusuri ke gambar.
    chk('nilai tertelusur 0%', Number(r.json?.ringkasan?.nilai_tertelusur_pct), 0);
    chk('dan disertai keterangan kenapa itu tidak otomatis salah',
      String(r.json?.rab_tanpa_dasar_mto?.catatan || '').length > 40, true);

    console.log('\n3. Penerapan MASSAL lintas zona — satu putaran, bukan dua');
    const semua: any[] = [];
    for (const z of r.json?.zona || []) {
      for (const b of z.lines) {
        const u = (b.usulan || []).find((x: any) =>
          Number(x.ahsp_id) === Number(aBeton) || Number(x.ahsp_id) === Number(aGalian));
        if (u) semua.push({ element_id: z.element_id, line_code: b.line_code, ahsp_id: u.ahsp_id });
      }
    }
    chk('baris dari KEDUA zona terkumpul',
      new Set(semua.map(x => x.element_id)).size, 2);
    const terap = await call('POST', `/estimator/proposals/${pid}/mto-rab/terapkan`,
      { lines: semua }, master);
    chk('berhasil', terap.status, 201);
    chk('semua terbuat', (terap.json?.dibuat || []).length, semua.length);
    chk('tidak ada yang dilewati', (terap.json?.dilewati || []).length, 0);
    chk('total proposal ikut naik', Number(terap.json?.total_project) > 0, true);

    console.log('\n4. Rekonsiliasi kedua menunjukkan perubahannya');
    const r2 = await call('GET', `/estimator/proposals/${pid}/mto-rab`, undefined, master);
    chk('yang tertaut bertambah', r2.json?.ringkasan?.sudah_di_rab, semua.length);
    chk('nilai berdasar MTO kini > 0', Number(r2.json?.ringkasan?.nilai_rab_berdasar_mto) > 0, true);
    chk('nilai tertelusur naik dari 0', Number(r2.json?.ringkasan?.nilai_tertelusur_pct) > 0, true);
    chk('mobilisasi tetap dilaporkan tanpa dasar', r2.json?.rab_tanpa_dasar_mto?.jumlah, 1);
    const barisBeton = (r2.json?.zona || [])[0]?.lines?.find((b: any) => b.line_code === 'FND-CONC');
    chk('baris yang sudah masuk ditandai', barisBeton?.sudah_di_rab, true);
    chk('dan tidak diusulkan lagi', (barisBeton?.usulan || []).length, 0);
    chk('selisih qty RAB vs MTO dilaporkan', Number(barisBeton?.selisih_qty), 0);

    console.log('\n5. Selisih kuantitas TERLIHAT kalau item tertaut diubah manual');
    await dbRun('UPDATE proposal_items SET qty = qty + 5 WHERE id = ?', [barisBeton.item_id]);
    const r3 = await call('GET', `/estimator/proposals/${pid}/mto-rab`, undefined, master);
    const b3 = (r3.json?.zona || [])[0]?.lines?.find((b: any) => b.line_code === 'FND-CONC');
    chk('selisihnya muncul, bukan diasumsikan sinkron', Number(b3?.selisih_qty), 5);

    console.log('\n6. Aturannya tidak dilonggarkan di jalur massal');
    // Baris yang sudah tertaut dilewati, bukan digandakan.
    const ulang = await call('POST', `/estimator/proposals/${pid}/mto-rab/terapkan`,
      { lines: [semua[0]] }, master);
    chk('dilewati, bukan dibuat ulang', (ulang.json?.dibuat || []).length, 0);
    chk('sebabnya disebut',
      String(ulang.json?.dilewati?.[0]?.sebab || '').includes('sudah tertaut'), true);
    // Satuan tetap saringan keras.
    const salahSatuan = await call('POST', `/estimator/proposals/${pid}/mto-rab/terapkan`,
      { lines: [{ element_id: zona2.json?.id, line_code: 'FND-BACKFILL', ahsp_id: aMobil }] }, master);
    chk('satuan tidak cocok dilewati', (salahSatuan.json?.dibuat || []).length, 0);
    chk('dan sebabnya menyebut satuan',
      String(salahSatuan.json?.dilewati?.[0]?.sebab || '').toLowerCase().includes('satuan'), true);
    chk('elemen milik proposal lain dilewati', (await call('POST',
      `/estimator/proposals/${pid}/mto-rab/terapkan`,
      { lines: [{ element_id: 99999999, line_code: 'FND-CONC', ahsp_id: aBeton }] }, master))
      .json?.dilewati?.length, 1);
    chk('pilihan kosong ditolak 400', (await call('POST',
      `/estimator/proposals/${pid}/mto-rab/terapkan`, { lines: [] }, master)).json?.code, 'PILIHAN_KOSONG');

    console.log('\n7. Proposal terkunci menolak, pembacaan tetap boleh');
    await dbRun("UPDATE proposals SET status = 'submitted' WHERE id = ?", [pid]);
    chk('penerapan ditolak 409', (await call('POST',
      `/estimator/proposals/${pid}/mto-rab/terapkan`, { lines: [semua[0]] }, master)).status, 409);
    chk('tapi rekonsiliasi tetap terbaca',
      (await call('GET', `/estimator/proposals/${pid}/mto-rab`, undefined, master)).status, 200);

    console.log('\n8. Terjaga auth & proposal tak dikenal');
    chk('tanpa token 401', (await call('GET', `/estimator/proposals/${pid}/mto-rab`)).status, 401);
    chk('proposal tidak ada 404',
      (await call('GET', '/estimator/proposals/99999999/mto-rab', undefined, master)).status, 404);

    console.log('\n9. Layar memakainya, dan tidak menelan yang dilewati');
    const { readFileSync } = await import('fs');
    const { join } = await import('path');
    const layar = readFileSync(
      join(__dirname, '..', '..', 'frontend', 'src', 'views', 'EstimatorProposalEditor.vue'), 'utf8');
    chk('layar membaca rekonsiliasi', layar.includes('/mto-rab`'), true);
    chk('dan memakai jalur massal', layar.includes('/mto-rab/terapkan'), true);
    // Angka nilai tertelusur harus tampil — itu inti panelnya.
    chk('nilai tertelusur ditampilkan', layar.includes('nilai_tertelusur_pct'), true);
    chk('RAB tanpa dasar MTO ditampilkan', layar.includes('rab_tanpa_dasar_mto'), true);
    // Baris yang belum punya AHSP padanan dibedakan dari yang belum dikerjakan:
    // yang pertama tidak bisa diselesaikan dengan menekan tombol.
    chk('yang tanpa padanan katalog dibedakan', layar.includes('belum_ada_usulan'), true);
    chk('yang dilewati dilaporkan, bukan ditelan',
      /dilewati[\s\S]{0,400}alert/.test(layar), true);

  } finally {
    console.log('\n10. Bersih-bersih');
    const disapu = await sapuFixture(stamp, [`RK1.${stamp}`, `RK2.${stamp}`, `RK3.${stamp}`]);
    chk('proposal fixture tersapu', disapu.proposal >= 1, true);
    chk('AHSP fixture tersapu', disapu.ahsp >= 3, true);
    const yatim: any = await dbGet(
      `SELECT COUNT(*) n FROM mto_lines l LEFT JOIN engineering_inputs e ON e.id = l.element_id WHERE e.id IS NULL`);
    chk('nol mto_lines yatim', Number(yatim?.n), 0);
  }

  console.log(`\n=== ${pass} lulus, ${fail} gagal ===`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
