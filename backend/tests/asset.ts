/**
 * Tes modul Asset Management (AST-002 dst. dari review tim reviewer).
 *
 * Fokus utama: membuktikan bahwa update parsial tidak menghapus field yang
 * tidak dikirim klien — dulu mengubah nama aset saja sudah melepasnya dari
 * P&ID dan menghapus spesifikasinya.
 *
 * Prasyarat: backend jalan. Jalankan: npm run test:asset
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
  const stamp = Date.now().toString().slice(-6);

  console.log('0. Persiapan');
  const master: string = (await call('POST', '/auth/login', { email: ADMIN_EMAIL, password: ADMIN_PASS })).json?.token;
  if (!master) { console.log('  FAIL login master'); process.exit(1); }
  pass++; console.log('  ok   login master');

  const cats = await call('GET', '/assets/categories', undefined, master);
  // Kategori yang butuh production line, supaya P&ID relevan
  const cat = (cats.json?.data || []).find((c: any) => c.requires_production_line) || (cats.json?.data || [])[0];
  chk('kategori aset tersedia', !!cat, true);

  const line = await call('POST', '/assets/production-lines',
    { code: `LN${stamp}`, name: `Line Uji ${stamp}` }, master);
  const lineId = line.json?.id;
  chk('production line uji dibuat', line.status, 201);

  const pnid = await call('POST', `/assets/production-lines/${lineId}/pnids`,
    { code: `PID-${stamp}`, title: 'P&ID Uji' }, master);
  const pnidId = pnid.json?.id;
  chk('P&ID uji dibuat', pnid.status, 201);

  const created = await call('POST', '/assets', {
    category_id: cat.id,
    production_line_id: lineId,
    pnid_id: pnidId,
    pnid_tag: 'PT-101',
    name: 'Pompa Uji',
    location: 'Area A',
    spec: { merk: 'Grundfos', daya_kw: 15 },
    purchase_date: '2024-01-15',
    purchase_price: 100000000,
    vendor: 'PT Vendor',
    useful_life_years: 10,
    salvage_value: 10000000,
    depreciation_method: 'straight_line',
  }, master);
  const assetId = created.json?.id;
  chk('aset uji dibuat', created.status, 201);

  const before = (await call('GET', `/assets/${assetId}`, undefined, master)).json?.data;
  chk('pnid_id tersimpan', before?.pnid_id, pnidId);
  chk('spec tersimpan', before?.spec?.merk, 'Grundfos');
  chk('harga tersimpan', Number(before?.purchase_price), 100000000);

  console.log('\n1. AST-002 — edit parsial tidak boleh menghapus field lain');
  // Persis payload yang dikirim AssetDetail.vue: tanpa pnid_id, tanpa spec
  const edit = await call('PUT', `/assets/${assetId}`, {
    name: 'Pompa Uji (diubah)',
    status: 'active',
    category_id: cat.id,
    production_line_id: lineId,
    pnid_tag: 'PT-101',
    location: 'Area A',
    purchase_date: '2024-01-15',
    purchase_price: 100000000,
    vendor: 'PT Vendor',
    useful_life_years: 10,
    salvage_value: 10000000,
    depreciation_method: 'straight_line',
    disposed_date: null,
    notes: null,
  }, master);
  chk('edit berhasil', edit.status, 200);

  const after = (await call('GET', `/assets/${assetId}`, undefined, master)).json?.data;
  chk('nama berubah', after?.name, 'Pompa Uji (diubah)');
  chk('pnid_id TETAP UTUH', after?.pnid_id, pnidId);
  chk('spec TETAP UTUH', after?.spec?.merk, 'Grundfos');
  chk('spec.daya_kw tetap', after?.spec?.daya_kw, 15);

  console.log('\n2. Update hanya satu field tidak mereset field finansial');
  const patch = await call('PATCH', `/assets/${assetId}`, { name: 'Pompa Uji v3' }, master);
  chk('PATCH berhasil', patch.status, 200);
  const p = (await call('GET', `/assets/${assetId}`, undefined, master)).json?.data;
  chk('nama berubah', p?.name, 'Pompa Uji v3');
  chk('harga perolehan tetap', Number(p?.purchase_price), 100000000);
  chk('umur ekonomis tetap', Number(p?.useful_life_years), 10);
  chk('nilai residu tetap', Number(p?.salvage_value), 10000000);
  chk('status tetap active', p?.status, 'active');
  chk('pnid_id tetap', p?.pnid_id, pnidId);
  chk('vendor tetap', p?.vendor, 'PT Vendor');

  console.log('\n3. Null eksplisit tetap dihormati');
  await call('PATCH', `/assets/${assetId}`, { vendor: null }, master);
  const n = (await call('GET', `/assets/${assetId}`, undefined, master)).json?.data;
  chk('vendor dikosongkan saat dikirim null', n?.vendor, null);
  chk('pnid_id tetap tidak tersentuh', n?.pnid_id, pnidId);

  console.log('\n4. Mengubah P&ID ikut menyesuaikan production line');
  const line2 = await call('POST', '/assets/production-lines',
    { code: `LN${stamp}B`, name: `Line Uji B ${stamp}` }, master);
  const pnid2 = await call('POST', `/assets/production-lines/${line2.json?.id}/pnids`,
    { code: `PID-${stamp}B`, title: 'P&ID Uji B' }, master);
  await call('PATCH', `/assets/${assetId}`, { pnid_id: pnid2.json?.id }, master);
  const moved = (await call('GET', `/assets/${assetId}`, undefined, master)).json?.data;
  chk('pnid_id pindah', moved?.pnid_id, pnid2.json?.id);
  chk('production_line_id ikut menyesuaikan', moved?.production_line_id, line2.json?.id);
  chk('spec tetap selamat', moved?.spec?.merk, 'Grundfos');

  console.log('\n5. AST-008 — validasi upload dokumen');
  const upload = async (filename: string, mime: string, content: Buffer | string) => {
    const fd = new FormData();
    fd.append('file', new Blob([content], { type: mime }), filename);
    fd.append('doc_title', 'Uji');
    const res = await fetch(`${API}/assets/${assetId}/documents`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${master}` },
      body: fd,
    });
    return { status: res.status, text: await res.text() };
  };

  const PDF = Buffer.from('%PDF-1.4\n%âãÏÓ\ntest', 'latin1');
  const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);

  chk('PDF asli diterima', (await upload('manual.pdf', 'application/pdf', PDF)).status, 201);
  chk('PNG asli diterima', (await upload('foto.png', 'image/png', PNG)).status, 201);

  chk('HTML ditolak', (await upload('jahat.html', 'text/html', '<script>alert(1)</script>')).status, 400);
  chk('SVG ditolak', (await upload('jahat.svg', 'image/svg+xml', '<svg onload="alert(1)"/>')).status, 400);
  chk('executable ditolak', (await upload('jahat.exe', 'application/octet-stream', 'MZ\x90\x00')).status, 400);
  chk('skrip shell ditolak', (await upload('jahat.sh', 'text/x-sh', '#!/bin/sh\nrm -rf /')).status, 400);

  // Inti magic-byte: ekstensi dan MIME berbohong, isinya HTML
  const fake = await upload('menyamar.pdf', 'application/pdf', '<html><script>alert(1)</script></html>');
  chk('ekstensi palsu (.pdf berisi HTML) ditolak', fake.status, 400);
  chk('alasannya isi tidak cocok', /tidak cocok dengan ekstensi/i.test(fake.text), true);

  // MIME berbohong tapi ekstensi benar
  chk('MIME tidak cocok ekstensi ditolak',
    (await upload('manual.pdf', 'image/png', PDF)).status, 400);

  const tooBig = Buffer.concat([PDF, Buffer.alloc(21 * 1024 * 1024)]);
  chk('berkas > 20 MB ditolak', (await upload('besar.pdf', 'application/pdf', tooBig)).status, 413);

  const docs = (await call('GET', `/assets/${assetId}/documents`, undefined, master)).json?.data || [];
  chk('hanya 2 berkas sah yang tersimpan', docs.length, 2);
  chk('nama server diacak (bukan nama asli)', /^[0-9a-f-]{36}\.(pdf|png)$/.test(docs[0]?.file_path || ''), true);
  chk('nama asli tetap tersimpan sebagai metadata', /\.(pdf|png)$/.test(docs[0]?.file_name || ''), true);

  console.log('\n6. AST-009 — asset code aman terhadap request bersamaan');
  const N = 20;
  const results = await Promise.all(
    Array.from({ length: N }, (_, i) =>
      call('POST', '/assets', { category_id: cat.id, name: `Concurrent ${stamp}-${i}` }, master))
  );
  const okCreates = results.filter(r => r.status === 201);
  chk(`${N} request paralel semuanya berhasil`, okCreates.length, N);

  const codes = okCreates.map(r => r.json?.asset_code);
  chk('tidak ada asset_code duplikat', new Set(codes).size, N);
  chk('tidak ada yang balas 500', results.filter(r => r.status === 500).length, 0);

  for (const r of okCreates) await call('DELETE', `/assets/${r.json.id}`, undefined, master);

  console.log('\n7. Bersih-bersih');
  await call('DELETE', `/assets/${assetId}`, undefined, master);
  await call('DELETE', `/assets/pnids/${pnidId}`, undefined, master);
  await call('DELETE', `/assets/pnids/${pnid2.json?.id}`, undefined, master);
  await call('DELETE', `/assets/production-lines/${lineId}`, undefined, master);
  await call('DELETE', `/assets/production-lines/${line2.json?.id}`, undefined, master);
  const gone = await call('GET', `/assets/${assetId}`, undefined, master);
  chk('aset uji terhapus', gone.status, 404);

  console.log(`\n=== ${pass} lulus, ${fail} gagal ===`);
  process.exit(fail ? 1 : 0);
}

main().catch(err => { console.error('Tes gagal dijalankan:', err.message); process.exit(1); });
