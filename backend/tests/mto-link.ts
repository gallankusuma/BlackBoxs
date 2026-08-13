/**
 * Tes tautan MTO → RAB (EST-MTO-013..016).
 * Prasyarat: backend jalan. Jalankan: npm run test:mto-link
 */
const API = process.env.API || 'http://localhost:3005/api';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'master@admin.com';
const ADMIN_PASS = process.env.ADMIN_PASS || 'master';

let pass = 0, fail = 0;
const chk = (label: string, actual: unknown, expected: unknown) => {
  if (actual === expected) { pass++; console.log(`  ok   ${label} → ${JSON.stringify(actual)}`); }
  else { fail++; console.log(`  FAIL ${label} → dapat ${JSON.stringify(actual)}, harusnya ${JSON.stringify(expected)}`); }
};
async function call(method: string, path: string, body?: unknown, token?: string) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  let json: any = null; try { json = JSON.parse(text); } catch { /* */ }
  return { status: res.status, json };
}

async function main() {
  const stamp = Date.now().toString().slice(-6);
  console.log('0. Persiapan');
  const master: string = (await call('POST', '/auth/login', { email: ADMIN_EMAIL, password: ADMIN_PASS })).json?.token;
  if (!master) { console.log('  FAIL login'); process.exit(1); }
  pass++; console.log('  ok   login master');

  const prop = await call('POST', '/estimator/proposals',
    { project_name: `Uji MTO ${stamp}`, status: 'draft' }, master);
  const propId = prop.json?.id ?? prop.json?.data?.id;
  chk('proposal dibuat', !!propId, true);

  const el = await call('POST', `/estimator/proposals/${propId}/mto`, {
    element_type: 'foundation', element_name: 'P1',
    parameters: { L: 1, W: 1, H: 0.3, depth: 1.2, qty: 12, waste_pct: 5 },
  }, master);
  const elementId = el.json?.id;
  chk('elemen MTO dibuat', !!elementId, true);
  chk('galian dihitung server', el.json?.lines?.find((l: any) => l.code === 'FND-EXCV')?.net_quantity, 36.864);

  console.log('\n1. Daftar kuantitas memakai kode baris kalkulator');
  const qty = await call('GET', `/estimator/proposals/${propId}/mto-quantities`, undefined, master);
  const avail = qty.json?.elements?.[0]?.available || [];
  chk('ada pilihan FND-EXCV', avail.some((a: any) => a.line_code === 'FND-EXCV'), true);
  chk('lantai kerja kini bisa ditautkan', avail.some((a: any) => a.line_code === 'FND-LEAN'), true);

  console.log('\n2. Kuantitas TIDAK diambil dari klien (EST-MTO-013)');
  // Butuh AHSP bersatuan m3 sebagai dasar item RAB
  const ahsp = await call('POST', '/estimator/ahsp', {
    kode: `TST.${stamp}`, name: `Galian Tanah Uji ${stamp}`, satuan: 'm3', status: 'active',
  }, master);
  const ahspId = ahsp.json?.id ?? ahsp.json?.data?.id;
  chk('AHSP uji dibuat', !!ahspId, true);

  const item = await call('POST', `/estimator/proposals/${propId}/items`, { ahsp_id: ahspId, qty: 1 }, master);
  const itemId = item.json?.id ?? item.json?.data?.id;
  chk('item RAB dibuat', !!itemId, true);

  // Klien mencoba menyuntik angka sendiri
  const linked = await call('PUT', `/estimator/proposals/${propId}/items/${itemId}/mto-link`, {
    element_id: elementId, line_code: 'FND-EXCV', value: 999999, unit: 'm3',
  }, master);
  chk('tautan tersimpan', linked.status, 200);
  chk('angka klien 999999 DIABAIKAN', linked.json?.mto_link?.value !== 999999, true);
  chk('dipakai angka server (36.864)', linked.json?.mto_link?.value, 36.864);

  console.log('\n2b. Elemen milik proposal lain ditolak');
  const other = await call('POST', '/estimator/proposals', { project_name: `Proposal Lain ${stamp}` }, master);
  const otherEl = await call('POST', `/estimator/proposals/${other.json?.id}/mto`, {
    element_type: 'foundation', element_name: 'X', parameters: { L: 1, W: 1, H: 0.3, depth: 1, qty: 1 },
  }, master);
  const cross = await call('PUT', `/estimator/proposals/${propId}/items/${itemId}/mto-link`, {
    element_id: otherEl.json?.id, line_code: 'FND-EXCV',
  }, master);
  chk('elemen dari proposal lain ditolak', cross.status, 404);
  chk('kode ELEMENT_NOT_IN_PROPOSAL', cross.json?.code, 'ELEMENT_NOT_IN_PROPOSAL');

  console.log('\n3. Satuan harus sepadan (EST-MTO-014)');
  const mismatch = await call('PUT', `/estimator/proposals/${propId}/items/${itemId}/mto-link`, {
    element_id: elementId, line_code: 'FND-REBAR',
  }, master);
  chk('kg ke item m3 ditolak', mismatch.status, 409);
  chk('kode UNIT_MISMATCH', mismatch.json?.code, 'UNIT_MISMATCH');

  console.log('\n4. RAB ikut menyesuaikan saat MTO berubah (EST-MTO-015)');
  const upd = await call('PUT', `/estimator/proposals/${propId}/mto/${elementId}`, {
    element_type: 'foundation', element_name: 'P1',
    parameters: { L: 1, W: 1, H: 0.3, depth: 2.4, qty: 12, waste_pct: 5 },
  }, master);
  chk('galian jadi dua kali lipat', upd.json?.lines?.find((l: any) => l.code === 'FND-EXCV')?.net_quantity, 73.728);
  chk('item RAB tertaut ikut disinkronkan', Number(upd.json?.rab_items_synced) >= 1, true);

  // GET items membalas ARRAY langsung, bukan objek berkunci
  const items = await call('GET', `/estimator/proposals/${propId}/items`, undefined, master);
  const rows = Array.isArray(items.json) ? items.json : (items.json?.items || items.json?.data || []);
  const row = rows.find((i: any) => Number(i.id) === Number(itemId));
  chk('qty RAB mengikuti MTO baru', Number(row?.qty), 73.728);

  console.log('\n5. Proposal terkunci setelah submitted (EST-MTO-016)');
  // Transisi statusnya bertahap: draft → review → submitted
  await call('PUT', `/estimator/proposals/${propId}/status`, { status: 'review' }, master);
  const toSubmitted = await call('PUT', `/estimator/proposals/${propId}/status`, { status: 'submitted' }, master);
  chk('proposal jadi submitted', toSubmitted.status, 200);
  const blocked = await call('POST', `/estimator/proposals/${propId}/mto`, {
    element_type: 'column', element_name: 'K1', parameters: { B: 0.4, H: 0.4 },
  }, master);
  chk('tambah MTO ditolak', blocked.status, 409);
  chk('kode PROPOSAL_LOCKED', blocked.json?.code, 'PROPOSAL_LOCKED');
  chk('ubah MTO ditolak',
    (await call('PUT', `/estimator/proposals/${propId}/mto/${elementId}`,
      { parameters: { L: 2, W: 2, H: 0.3, depth: 1.2, qty: 12 } }, master)).status, 409);
  chk('hapus MTO ditolak',
    (await call('DELETE', `/estimator/proposals/${propId}/mto/${elementId}`, undefined, master)).status, 409);

  console.log('\n6. Menyimpan elemen yang sama tidak membuat duplikat (EST-MTO-018)');
  const propDup = await call('POST', '/estimator/proposals', { project_name: `Uji duplikat ${stamp}` }, master);
  const dupId = propDup.json?.id;
  const body = { element_type: 'column', element_name: 'K1', parameters: { B: 0.4, H: 0.4, qty_per_floor: 5 } };
  const save1 = await call('POST', `/estimator/proposals/${dupId}/mto`, body, master);
  const save2 = await call('POST', `/estimator/proposals/${dupId}/mto`, body, master);
  chk('id sama pada simpan kedua', save1.json?.id, save2.json?.id);
  chk('ditandai sebagai pembaruan', save2.json?.updated, true);
  const listDup = await call('GET', `/estimator/proposals/${dupId}/mto`, undefined, master);
  chk('hanya ada SATU elemen', (listDup.json?.elements || []).length, 1);

  console.log('\n7. MTO proposal tidak bisa diubah lewat proposal lain (EST-MTO-017)');
  const propOther = await call('POST', '/estimator/proposals', { project_name: `Proposal Ketiga ${stamp}` }, master);
  const crossEdit = await call('PUT', `/estimator/proposals/${propOther.json?.id}/mto/${save1.json?.id}`,
    { parameters: { B: 9, H: 9 } }, master);
  chk('menyunting elemen milik proposal lain ditolak', crossEdit.status, 404);
  const stillThere = await call('GET', `/estimator/proposals/${dupId}/mto`, undefined, master);
  chk('parameter aslinya tidak berubah',
    Number(stillThere.json?.elements?.[0]?.parameters?.B), 0.4);

  console.log('\n8. RAB memakai NET, procurement memakai GROSS (EST-MTO-R13)');
  // Sengaja memakai baris ber-waste 5% — tes lama memakai FND-EXCV yang waste-nya
  // 0%, sehingga net dan gross sama dan defaultnya yang keliru tidak pernah kelihatan.
  const propNet = await call('POST', '/estimator/proposals', { project_name: `Uji net/gross ${stamp}` }, master);
  const pid = propNet.json?.id;
  const elNet = await call('POST', `/estimator/proposals/${pid}/mto`, {
    element_type: 'slab', element_name: 'S1',
    parameters: { slab_type: 'concrete', area: 1000, thickness: 0.1, waste_pct: 5 },
  }, master);
  const concLine = elNet.json?.lines?.find((l: any) => l.code === 'SLB-CONC');
  chk('net 100 m³', concLine?.net_quantity, 100);
  chk('gross 105 m³ (waste 5%)', concLine?.gross_quantity, 105);

  const ahspNet = await call('POST', '/estimator/ahsp', {
    kode: `TSTN.${stamp}`, name: `Beton Uji ${stamp}`, satuan: 'm3', status: 'active',
    // Harga satuan dihitung dari komponen; tanpa ini harganya 0 dan direct_cost
    // tidak akan pernah bergerak — tes jadi tidak membuktikan apa pun.
    items: [{ section: 'B', resource_type: 'material', resource_name: 'Beton K-250',
              resource_satuan: 'm3', koefisien: 1, resource_harga: 1000000 }],
  }, master);
  const itemNet = await call('POST', `/estimator/proposals/${pid}/items`,
    { ahsp_id: ahspNet.json?.id, qty: 1 }, master);
  const itemNetId = itemNet.json?.id;

  const linkNet = await call('PUT', `/estimator/proposals/${pid}/items/${itemNetId}/mto-link`,
    { element_id: elNet.json?.id, line_code: 'SLB-CONC' }, master);
  chk('tautan tersimpan', linkNet.status, 200);
  chk('RAB memakai NET, bukan gross', linkNet.json?.mto_link?.value, 100);
  chk('gross tetap tercatat untuk procurement', linkNet.json?.mto_link?.gross_quantity, 105);

  console.log('\n9. Ringkasan proposal ikut dihitung ulang (EST-MTO-R14)');
  const readDirectCost = async () => {
    const r = (await call('GET', `/estimator/proposals/${pid}`, undefined, master)).json;
    const p = r?.data ?? r?.proposal ?? r;
    return Number(p?.direct_cost ?? 0);
  };
  const dc1 = await readDirectCost();
  chk('harga satuan AHSP tidak nol', dc1 > 0, true);
  await call('PUT', `/estimator/proposals/${pid}/mto/${elNet.json?.id}`, {
    element_type: 'slab', element_name: 'S1',
    parameters: { slab_type: 'concrete', area: 1500, thickness: 0.1, waste_pct: 5 },
  }, master);
  const rows14 = await call('GET', `/estimator/proposals/${pid}/items`, undefined, master);
  const row14 = (Array.isArray(rows14.json) ? rows14.json : []).find((i: any) => Number(i.id) === Number(itemNetId));
  chk('qty RAB ikut naik ke 150 (net)', Number(row14?.qty), 150);
  const dc2 = await readDirectCost();
  chk('direct_cost proposal ikut berubah', dc2 !== dc1, true);
  // Invariant yang diminta reviewer: header = jumlah barisnya
  const allRows = Array.isArray(rows14.json) ? rows14.json : [];
  const sumRows = allRows.reduce((t: number, i: any) => t + Number(i.total_price || 0), 0);
  chk('direct_cost = SUM(total_price)', Math.round(dc2), Math.round(sumRows));

  console.log('\n10. Ganti subtype tidak boleh meninggalkan RAB basi (EST-MTO-R15)');
  const propSub = await call('POST', '/estimator/proposals', { project_name: `Uji subtype ${stamp}` }, master);
  const sid = propSub.json?.id;
  const elCol = await call('POST', `/estimator/proposals/${sid}/mto`, {
    element_type: 'column', element_name: 'K1',
    parameters: { col_type: 'beton', B: 0.4, H: 0.4, height_per_floor: 3, floors: 1, qty_per_floor: 10 },
  }, master);
  const ahspCol = await call('POST', '/estimator/ahsp', {
    kode: `TSTC.${stamp}`, name: `Beton Kolom Uji ${stamp}`, satuan: 'm3', status: 'active',
  }, master);
  const itemCol = await call('POST', `/estimator/proposals/${sid}/items`, { ahsp_id: ahspCol.json?.id, qty: 1 }, master);
  await call('PUT', `/estimator/proposals/${sid}/items/${itemCol.json?.id}/mto-link`,
    { element_id: elCol.json?.id, line_code: 'COL-CONC' }, master);

  const toWf = await call('PUT', `/estimator/proposals/${sid}/mto/${elCol.json?.id}`, {
    element_type: 'column', element_name: 'K1',
    parameters: { col_type: 'wf', wf_profile: 'WF200x100', height_per_floor: 3, floors: 1, qty_per_floor: 10 },
  }, master);
  chk('ganti beton → WF ditolak selagi COL-CONC masih ditaut', toWf.status, 409);
  chk('kode LINKED_MTO_LINE_INVALID', toWf.json?.code, 'LINKED_MTO_LINE_INVALID');

  console.log('\n11. MTO yang masih ditaut tidak bisa dihapus (EST-MTO-R16)');
  const delLinked = await call('DELETE', `/estimator/proposals/${sid}/mto/${elCol.json?.id}`, undefined, master);
  chk('hapus ditolak', delLinked.status, 409);
  chk('kode MTO_HAS_LINKED_RAB', delLinked.json?.code, 'MTO_HAS_LINKED_RAB');
  chk('setelah tautan dilepas, boleh dihapus',
    (await call('DELETE', `/estimator/proposals/${sid}/items/${itemCol.json?.id}/mto-link`, undefined, master)).status < 300
    && (await call('DELETE', `/estimator/proposals/${sid}/mto/${elCol.json?.id}`, undefined, master)).status, 200);

  console.log('\n12. Proposal terkunci mengunci RAB juga (EST-MTO-R18)');
  await call('PUT', `/estimator/proposals/${pid}/status`, { status: 'review' }, master);
  await call('PUT', `/estimator/proposals/${pid}/status`, { status: 'submitted' }, master);
  chk('tambah item RAB ditolak',
    (await call('POST', `/estimator/proposals/${pid}/items`, { ahsp_id: ahspNet.json?.id, qty: 1 }, master)).status, 409);
  chk('ubah qty item RAB ditolak',
    (await call('PUT', `/estimator/proposals/${pid}/items/${itemNetId}`, { qty: 99999 }, master)).status, 409);
  chk('hapus item RAB ditolak',
    (await call('DELETE', `/estimator/proposals/${pid}/items/${itemNetId}`, undefined, master)).status, 409);
  chk('link MTO ditolak',
    (await call('PUT', `/estimator/proposals/${pid}/items/${itemNetId}/mto-link`,
      { element_id: elNet.json?.id, line_code: 'SLB-CONC' }, master)).status, 409);
  chk('unlink MTO ditolak',
    (await call('DELETE', `/estimator/proposals/${pid}/items/${itemNetId}/mto-link`, undefined, master)).status, 409);

  console.log('\n13. 409 harus MEMBATALKAN perubahan MTO, bukan menyisakannya (EST-MTO-R20)');
  const propR20 = await call('POST', '/estimator/proposals', { project_name: `Uji rollback ${stamp}` }, master);
  const r20 = propR20.json?.id;
  const elR20 = await call('POST', `/estimator/proposals/${r20}/mto`, {
    element_type: 'column', element_name: 'K1',
    parameters: { col_type: 'beton', B: 0.4, H: 0.4, height_per_floor: 3, floors: 1, qty_per_floor: 10 },
  }, master);
  const ahspR20 = await call('POST', '/estimator/ahsp', {
    kode: `TSTR.${stamp}`, name: `Beton R20 ${stamp}`, satuan: 'm3', status: 'active',
    items: [{ section: 'B', resource_type: 'material', resource_name: 'Beton', resource_satuan: 'm3', koefisien: 1, resource_harga: 1000000 }],
  }, master);
  const itemR20 = await call('POST', `/estimator/proposals/${r20}/items`, { ahsp_id: ahspR20.json?.id, qty: 1 }, master);
  await call('PUT', `/estimator/proposals/${r20}/items/${itemR20.json?.id}/mto-link`,
    { element_id: elR20.json?.id, line_code: 'COL-CONC' }, master);

  const gagal = await call('PUT', `/estimator/proposals/${r20}/mto/${elR20.json?.id}`, {
    element_type: 'column', element_name: 'K1',
    parameters: { col_type: 'wf', wf_profile: 'WF200x100', height_per_floor: 3, floors: 1, qty_per_floor: 10 },
  }, master);
  chk('ditolak 409', gagal.status, 409);
  const afterR20 = await call('GET', `/estimator/proposals/${r20}/mto`, undefined, master);
  const elemR20 = (afterR20.json?.elements || [])[0];
  chk('MTO TIDAK ikut berubah — masih beton', elemR20?.parameters?.col_type, 'beton');
  chk('baris COL-CONC masih ada', (elemR20?.lines || []).some((l: any) => l.code === 'COL-CONC'), true);

  console.log('\n14. Item proposal lain tidak bisa disentuh lewat proposal draft (EST-MTO-R21)');
  // pid sudah submitted dari bagian 12; propDraft masih draft
  const propDraft = await call('POST', '/estimator/proposals', { project_name: `Draft penyusup ${stamp}` }, master);
  const draftId = propDraft.json?.id;
  const bypassUpdate = await call('PUT', `/estimator/proposals/${draftId}/items/${itemNetId}`, { qty: 99999 }, master);
  chk('ubah item milik proposal terkunci lewat URL draft ditolak', bypassUpdate.status, 404);
  chk('kode ITEM_NOT_IN_PROPOSAL', bypassUpdate.json?.code, 'ITEM_NOT_IN_PROPOSAL');
  const bypassDelete = await call('DELETE', `/estimator/proposals/${draftId}/items/${itemNetId}`, undefined, master);
  chk('hapus lewat URL draft ditolak', bypassDelete.status, 404);
  const stillRows = await call('GET', `/estimator/proposals/${pid}/items`, undefined, master);
  const stillRow = (Array.isArray(stillRows.json) ? stillRows.json : []).find((i: any) => Number(i.id) === Number(itemNetId));
  chk('qty aslinya tidak berubah', Number(stillRow?.qty), 150);

  console.log('\n15. Status tidak bisa dilompati lewat update umum (EST-MTO-R22)');
  const propR22 = await call('POST', '/estimator/proposals', { project_name: `Uji status ${stamp}` }, master);
  const r22 = propR22.json?.id;
  const jump = await call('PUT', `/estimator/proposals/${r22}`, { project_name: 'X', status: 'deal' }, master);
  chk('menyetel status lewat PUT umum ditolak', jump.status, 400);
  chk('kode USE_STATUS_ENDPOINT', jump.json?.code, 'USE_STATUS_ENDPOINT');
  const cek22 = await call('GET', `/estimator/proposals/${r22}`, undefined, master);
  const st22 = (cek22.json?.data ?? cek22.json)?.status;
  chk('status tetap draft', st22, 'draft');
  chk('ubah proposal terkunci ditolak',
    (await call('PUT', `/estimator/proposals/${pid}`, { project_name: 'Diubah' }, master)).status, 409);

  console.log('\n16. Apply template ikut terkunci (EST-MTO-R23)');
  chk('apply-template pada proposal submitted ditolak',
    (await call('POST', `/estimator/proposals/${pid}/apply-template`,
      { template_sections: [{ code: 'A', name: 'Pekerjaan Uji' }] }, master)).status, 409);

  console.log('\n17. State proposal DEAL ikut terkunci (matriks reviewer #3, #7, #9)');
  const propDeal = await call('POST', '/estimator/proposals', { project_name: `Uji deal ${stamp}` }, master);
  const dealId = propDeal.json?.id;
  const ahspDeal = await call('POST', '/estimator/ahsp', {
    kode: `TSTD.${stamp}`, name: `Beton Deal ${stamp}`, satuan: 'm3', status: 'active',
    items: [{ section: 'B', resource_type: 'material', resource_name: 'Beton', resource_satuan: 'm3', koefisien: 1, resource_harga: 500000 }],
  }, master);
  const itemDeal = await call('POST', `/estimator/proposals/${dealId}/items`, { ahsp_id: ahspDeal.json?.id, qty: 2 }, master);
  for (const st of ['review', 'submitted', 'deal']) {
    await call('PUT', `/estimator/proposals/${dealId}/status`, { status: st }, master);
  }
  const cekDeal = await call('GET', `/estimator/proposals/${dealId}`, undefined, master);
  const stDeal = (cekDeal.json?.data ?? cekDeal.json)?.status;
  chk('proposal mencapai status deal', stDeal, 'deal');

  chk('#3 hapus item deal lewat URL draft ditolak',
    (await call('DELETE', `/estimator/proposals/${draftId}/items/${itemDeal.json?.id}`, undefined, master)).status, 404);
  chk('#7 apply-template pada deal ditolak',
    (await call('POST', `/estimator/proposals/${dealId}/apply-template`,
      { template_sections: [{ code: 'A', name: 'Tambahan' }] }, master)).status, 409);
  const delDeal = await call('DELETE', `/estimator/proposals/${dealId}`, undefined, master);
  chk('#9 hapus proposal deal ditolak', delDeal.status, 409);
  chk('kode PROPOSAL_LOCKED', delDeal.json?.code, 'PROPOSAL_LOCKED');
  chk('proposal deal masih ada',
    (await call('GET', `/estimator/proposals/${dealId}`, undefined, master)).status, 200);

  console.log('\n18. Status mundur lewat endpoint status ditolak (matriks #4)');
  const mundur = await call('PUT', `/estimator/proposals/${dealId}/status`, { status: 'draft' }, master);
  chk('deal → draft ditolak', mundur.status >= 400, true);
  const stillDeal = await call('GET', `/estimator/proposals/${dealId}`, undefined, master);
  chk('status tetap deal', (stillDeal.json?.data ?? stillDeal.json)?.status, 'deal');

  console.log('\n19. Proposal draft biasa tetap boleh dihapus (kontrol negatif)');
  const propHapus = await call('POST', '/estimator/proposals', { project_name: `Uji hapus ${stamp}` }, master);
  chk('draft boleh dihapus',
    (await call('DELETE', `/estimator/proposals/${propHapus.json?.id}`, undefined, master)).status, 200);

  console.log('\n20. Link dan hapus MTO bersamaan tidak menyisakan tautan yatim (matriks #10)');
  const propRace = await call('POST', '/estimator/proposals', { project_name: `Uji race ${stamp}` }, master);
  const raceId = propRace.json?.id;
  const elRace = await call('POST', `/estimator/proposals/${raceId}/mto`, {
    element_type: 'slab', element_name: 'S1',
    parameters: { slab_type: 'concrete', area: 100, thickness: 0.12, waste_pct: 5 },
  }, master);
  const ahspRace = await call('POST', '/estimator/ahsp', {
    kode: `TSTX.${stamp}`, name: `Beton Race ${stamp}`, satuan: 'm3', status: 'active',
    items: [{ section: 'B', resource_type: 'material', resource_name: 'Beton', resource_satuan: 'm3', koefisien: 1, resource_harga: 100000 }],
  }, master);
  const itemRace = await call('POST', `/estimator/proposals/${raceId}/items`, { ahsp_id: ahspRace.json?.id, qty: 1 }, master);

  const [linkRes, delRes] = await Promise.all([
    call('PUT', `/estimator/proposals/${raceId}/items/${itemRace.json?.id}/mto-link`,
      { element_id: elRace.json?.id, line_code: 'SLB-CONC' }, master),
    call('DELETE', `/estimator/proposals/${raceId}/mto/${elRace.json?.id}`, undefined, master),
  ]);
  const linkOk = linkRes.status === 200;
  const delOk = delRes.status === 200;
  chk('tidak mungkin dua-duanya berhasil', linkOk && delOk, false);

  // Apa pun yang menang, tidak boleh ada item RAB menunjuk elemen yang sudah hilang
  const elemsLeft = (await call('GET', `/estimator/proposals/${raceId}/mto`, undefined, master)).json?.elements || [];
  const idsLeft = new Set(elemsLeft.map((e: any) => Number(e.id)));
  const rowsRace = await call('GET', `/estimator/proposals/${raceId}/items`, undefined, master);
  const orphan = (Array.isArray(rowsRace.json) ? rowsRace.json : []).filter((i: any) => {
    if (!i.mto_link) return false;
    const l = typeof i.mto_link === 'string' ? JSON.parse(i.mto_link) : i.mto_link;
    return l?.element_id && !idsLeft.has(Number(l.element_id));
  });
  chk('tidak ada tautan RAB yang yatim', orphan.length, 0);

  console.log(`\n=== ${pass} lulus, ${fail} gagal ===`);
  process.exit(fail ? 1 : 0);
}
main().catch(e => { console.error('Tes gagal dijalankan:', e.message); process.exit(1); });
