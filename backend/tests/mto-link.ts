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

  console.log(`\n=== ${pass} lulus, ${fail} gagal ===`);
  process.exit(fail ? 1 : 0);
}
main().catch(e => { console.error('Tes gagal dijalankan:', e.message); process.exit(1); });
