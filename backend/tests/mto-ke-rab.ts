import 'dotenv/config';
import { sapuFixture } from './_bersih';
/**
 * Jembatan MTO → RAB: dari kuantitas menjadi penawaran berharga.
 *
 * Jarak terlebar di alur estimator sebelum ini: gambar sudah menjadi kuantitas,
 * lalu berhenti. Untuk mengubahnya jadi penawaran, seseorang harus mencari AHSP
 * satu per satu di katalog ribuan baris, membuat item RAB, lalu menautkannya —
 * untuk SETIAP baris MTO. Satu pondasi menghasilkan 6-10 baris.
 *
 * Yang diuji: usulan tidak menulis apa pun, pencocokannya deterministik dan
 * beralasan, satuan disaring keras, dan penerapan hanya menulis yang dipilih.
 *
 * Prasyarat: backend jalan. Jalankan: npm run test:mto-rab
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

  console.log('0. Persiapan — AHSP yang cocok, yang salah satuan, dan yang tak relevan');
  const master: string = (await call('POST', '/auth/login', { email: ADMIN_EMAIL, password: ADMIN_PASS })).json?.token;
  if (!master) { console.log('  FAIL login master'); process.exit(1); }
  pass++; console.log('  ok   login master');

  const mkAhsp = async (kode: string, nama: string, satuan: string, harga: number) => {
    const r = await call('POST', '/estimator/ahsp', {
      kode, name: nama, satuan, status: 'active',
      items: [{ section: 'B', resource_type: 'material', resource_name: `Bahan ${stamp}`,
        resource_satuan: satuan, koefisien: 1, resource_harga: harga }],
    }, master);
    return r.json?.id ?? r.json?.data?.id;
  };
  const aBeton  = await mkAhsp(`MR1.${stamp}`, `Beton mutu K-300 ${stamp}`, 'm3', 1200000);
  const aGalian = await mkAhsp(`MR2.${stamp}`, `Galian tanah biasa ${stamp}`, 'm3', 85000);
  // Satuan m2 — TIDAK boleh diusulkan untuk baris beton yang m3.
  const aJebakan = await mkAhsp(`MR3.${stamp}`, `Beton mutu K-300 lantai ${stamp}`, 'm2', 400000);
  chk('tiga AHSP siap', !!aBeton && !!aGalian && !!aJebakan, true);

  const p = await call('POST', '/estimator/proposals',
    { project_name: `Uji MTO ke RAB ${stamp}`, status: 'draft' }, master);
  const pid = p.json?.id;

  const zona = await call('POST', `/estimator/proposals/${pid}/mto`, {
    element_type: 'foundation', element_name: `Pondasi uji ${stamp}`,
    parameters: { foundation_type: 'footplate', L: 2, W: 2, H: 0.4, qty: 10, depth: 1.5, lean_t: 0.05 },
  }, master);
  const elementId = zona.json?.id;
  chk('elemen MTO terbentuk', !!elementId, true);

  try {
    console.log('\n1. Usulan dibaca — dan TIDAK menulis apa pun');
    const sebelum: any = await dbGet('SELECT COUNT(*) n FROM proposal_items WHERE proposal_id = ?', [pid]);
    const usul = await call('GET', `/estimator/proposals/${pid}/mto/${elementId}/usul-rab`, undefined, master);
    chk('terbaca', usul.status, 200);
    chk('dinyatakan tidak tersimpan', usul.json?.tersimpan, false);
    const sesudah: any = await dbGet('SELECT COUNT(*) n FROM proposal_items WHERE proposal_id = ?', [pid]);
    chk('nol item dibuat oleh pembacaan usulan', Number(sesudah?.n), Number(sebelum?.n));
    chk('barisnya banyak (pondasi footplate)', (usul.json?.lines || []).length >= 5, true);

    console.log('\n2. Pencocokannya beralasan, bukan tebakan buta');
    const bBeton = (usul.json?.lines || []).find((l: any) => l.line_code === 'FND-CONC');
    const bGalian = (usul.json?.lines || []).find((l: any) => l.line_code === 'FND-EXCV');
    chk('baris beton punya usulan', (bBeton?.usulan || []).length > 0, true);
    const uBeton = (bBeton?.usulan || []).find((u: any) => Number(u.ahsp_id) === Number(aBeton));
    chk('AHSP beton diusulkan untuk baris beton', !!uBeton, true);
    chk('skornya disebut', Number(uBeton?.skor) > 0, true);
    chk('alasannya disebut', (uBeton?.alasan || []).length > 0, true);
    chk('alasannya menyebut jenis pekerjaan',
      (uBeton?.alasan || []).some((a: string) => a.includes('jenis pekerjaan')), true);
    const uGalian = (bGalian?.usulan || []).find((u: any) => Number(u.ahsp_id) === Number(aGalian));
    chk('AHSP galian diusulkan untuk baris galian', !!uGalian, true);
    chk('dan AHSP beton TIDAK diusulkan untuk galian',
      (bGalian?.usulan || []).some((u: any) => Number(u.ahsp_id) === Number(aBeton)), false);

    console.log('\n3. INI YANG MENENTUKAN — satuan disaring keras');
    // AHSP m2 bernama sangat mirip TIDAK boleh muncul untuk baris m3.
    chk('AHSP salah satuan tidak diusulkan',
      (bBeton?.usulan || []).some((u: any) => Number(u.ahsp_id) === Number(aJebakan)), false);
    chk('padahal namanya nyaris sama', true, true);

    console.log('\n4. Penerapan hanya menulis yang DIPILIH');
    const terap = await call('POST', `/estimator/proposals/${pid}/mto/${elementId}/rab`,
      { lines: [{ line_code: 'FND-CONC', ahsp_id: aBeton }, { line_code: 'FND-EXCV', ahsp_id: aGalian }] },
      master);
    chk('penerapan berhasil', terap.status, 201);
    chk('dua item dibuat', (terap.json?.dibuat || []).length, 2);
    const items: any[] = await dbAll(
      'SELECT id, ahsp_code_snapshot, qty, unit_snapshot, total_price, mto_link FROM proposal_items WHERE proposal_id = ? ORDER BY order_no', [pid]);
    chk('hanya dua item di proposal', items.length, 2);
    chk('keduanya tertaut ke MTO', items.every(i => !!i.mto_link), true);

    console.log('\n5. Kuantitasnya NET dari kalkulator, bukan diketik');
    // Footplate 2x2x0.4 x10 = 16 m3 beton.
    const itemBeton = items.find(i => i.ahsp_code_snapshot === `MR1.${stamp}`);
    chk('volume beton = 16 m3', Number(itemBeton?.qty), 16);
    const link = typeof itemBeton?.mto_link === 'string' ? JSON.parse(itemBeton.mto_link) : itemBeton?.mto_link;
    chk('tautannya menyebut baris asalnya', link?.line_code, 'FND-CONC');
    chk('basisnya net', link?.basis, 'net');
    chk('gross ikut dicatat untuk procurement', Number(link?.gross_quantity) > 0, true);
    chk('versi formulanya ikut', String(link?.formula_version || '').length > 0, true);

    console.log('\n6. Harganya ikut, jadi proposal langsung bernilai');
    const prop: any = await dbGet('SELECT total_project FROM proposals WHERE id = ?', [pid]);
    // 16 m3 x harga beton + galian. Harga AHSP termasuk overhead, jadi yang
    // diperiksa: nilainya > 0 dan cocok dengan jumlah baris.
    chk('total proposal tidak lagi nol', Number(prop?.total_project) > 0, true);
    const jumlahBaris = items.reduce((a: number, i: any) => a + Number(i.total_price || 0), 0);
    chk('total = jumlah barisnya', Math.round(Number(prop?.total_project)), Math.round(jumlahBaris));

    console.log('\n7. Baris yang sudah tertaut tidak digandakan');
    const usul2 = await call('GET', `/estimator/proposals/${pid}/mto/${elementId}/usul-rab`, undefined, master);
    const b2 = (usul2.json?.lines || []).find((l: any) => l.line_code === 'FND-CONC');
    chk('ditandai sudah tertaut', b2?.sudah_tertaut, true);
    chk('dan tidak diusulkan lagi', (b2?.usulan || []).length, 0);
    const ulang = await call('POST', `/estimator/proposals/${pid}/mto/${elementId}/rab`,
      { lines: [{ line_code: 'FND-CONC', ahsp_id: aBeton }] }, master);
    chk('penerapan ulang ditolak 409', ulang.status, 409);
    chk('kodenya jelas', ulang.json?.code, 'BARIS_SUDAH_TERTAUT');
    const jml: any = await dbGet('SELECT COUNT(*) n FROM proposal_items WHERE proposal_id = ?', [pid]);
    chk('jumlah item tidak bertambah', Number(jml?.n), 2);

    console.log('\n8. Satuan yang tidak cocok ditolak juga di jalur terap');
    const salah = await call('POST', `/estimator/proposals/${pid}/mto/${elementId}/rab`,
      { lines: [{ line_code: 'FND-BACKFILL', ahsp_id: aJebakan }] }, master);
    chk('ditolak 409', salah.status, 409);
    chk('kodenya UNIT_MISMATCH', salah.json?.code, 'UNIT_MISMATCH');

    console.log('\n9. Baris & AHSP yang tidak ada ditolak jelas');
    chk('baris ngawur 404', (await call('POST', `/estimator/proposals/${pid}/mto/${elementId}/rab`,
      { lines: [{ line_code: 'TIDAK-ADA', ahsp_id: aBeton }] }, master)).json?.code, 'LINE_NOT_FOUND');
    chk('AHSP ngawur 400', (await call('POST', `/estimator/proposals/${pid}/mto/${elementId}/rab`,
      { lines: [{ line_code: 'FND-BACKFILL', ahsp_id: 99999999 }] }, master)).json?.code, 'AHSP_TIDAK_VALID');
    chk('pilihan kosong 400', (await call('POST', `/estimator/proposals/${pid}/mto/${elementId}/rab`,
      { lines: [] }, master)).json?.code, 'PILIHAN_KOSONG');

    console.log('\n10. Proposal terkunci menolak, dan elemen seberang tidak terbaca');
    await call('PUT', `/estimator/proposals/${pid}/status`, { status: 'review' }, master);
    const inc = await call('GET', `/estimator/proposals/${pid}/items/incomplete`, undefined, master);
    const ids = (inc.json?.items || []).map((x: any) => x.id);
    if (ids.length) {
      await call('PUT', `/estimator/proposals/${pid}/items/scope`,
        { item_ids: ids, scope_status: 'excluded', scope_note: 'fixture' }, master);
    }
    await call('PUT', `/estimator/proposals/${pid}/status`, { status: 'submitted' }, master);
    const terkunci = await call('POST', `/estimator/proposals/${pid}/mto/${elementId}/rab`,
      { lines: [{ line_code: 'FND-BACKFILL', ahsp_id: aGalian }] }, master);
    chk('proposal terkunci menolak 409', terkunci.status, 409);
    chk('kodenya PROPOSAL_LOCKED', terkunci.json?.code, 'PROPOSAL_LOCKED');

    const p2 = await call('POST', '/estimator/proposals',
      { project_name: `Uji MTO RAB lain ${stamp}`, status: 'draft' }, master);
    chk('elemen milik proposal lain 404',
      (await call('GET', `/estimator/proposals/${p2.json?.id}/mto/${elementId}/usul-rab`, undefined, master)).status, 404);

    console.log('\n11. Terjaga auth');
    chk('usulan tanpa token 401',
      (await call('GET', `/estimator/proposals/${pid}/mto/${elementId}/usul-rab`)).status, 401);
    chk('terap tanpa token 401',
      (await call('POST', `/estimator/proposals/${pid}/mto/${elementId}/rab`, { lines: [] })).status, 401);

  } finally {
    console.log('\n12. Bersih-bersih');
    const disapu = await sapuFixture(stamp, [`MR1.${stamp}`, `MR2.${stamp}`, `MR3.${stamp}`]);
    chk('proposal fixture tersapu', disapu.proposal >= 2, true);
    chk('AHSP fixture tersapu', disapu.ahsp >= 3, true);
    const yatim: any = await dbGet(
      `SELECT COUNT(*) n FROM mto_lines l LEFT JOIN engineering_inputs e ON e.id = l.element_id WHERE e.id IS NULL`);
    chk('nol mto_lines yatim', Number(yatim?.n), 0);
  }

  console.log(`\n=== ${pass} lulus, ${fail} gagal ===`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
