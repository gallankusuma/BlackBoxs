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

  console.log('\n7. AST-014 — validasi input backend');
  const bad = async (payload: any) => (await call('POST', '/assets',
    { category_id: cat.id, name: 'Uji Validasi', ...payload }, master)).status;

  chk('harga negatif', await bad({ purchase_price: -1 }), 400);
  chk('nilai residu negatif', await bad({ salvage_value: -5 }), 400);
  chk('residu > harga', await bad({ purchase_price: 100, salvage_value: 200 }), 400);
  chk('umur ekonomis nol', await bad({ useful_life_years: 0 }), 400);
  chk('umur ekonomis negatif', await bad({ useful_life_years: -3 }), 400);
  chk('umur ekonomis pecahan', await bad({ useful_life_years: 2.5 }), 400);
  chk('status tidak dikenal', await bad({ status: 'ngawur' }), 400);
  chk('metode depresiasi tidak dikenal', await bad({ depreciation_method: 'ngawur' }), 400);
  // new Date() terlalu longgar: '32 Februari' jadi tahun 2032, dan '2026-02-30'
  // digeser diam-diam ke 2 Maret. Keduanya harus ditolak.
  chk('tanggal ngawur', await bad({ purchase_date: '32 Februari' }), 400);
  chk('tanggal meluber (2026-02-30)', await bad({ purchase_date: '2026-02-30' }), 400);
  chk('bulan di luar rentang', await bad({ purchase_date: '2026-13-01' }), 400);
  chk('tanggal ISO yang benar diterima',
    (await call('POST', '/assets', { category_id: cat.id, name: 'Tanggal OK', purchase_date: '2026-02-28' }, master)).status, 201);
  chk('harga bukan angka', await bad({ purchase_price: 'mahal' }), 400);
  chk('disposed tanpa tanggal', await bad({ status: 'disposed' }), 400);

  console.log('\n   Foreign key → 404/409, bukan 500 berisi nama constraint');
  const fkCat = await call('POST', '/assets', { category_id: 999999, name: 'X' }, master);
  chk('kategori tidak ada → 404', fkCat.status, 404);
  chk('pesan SQL tidak bocor', /constraint|FOREIGN KEY|erp_/i.test(fkCat.text), false);

  chk('P&ID tidak ada → 404',
    (await call('POST', '/assets', { category_id: cat.id, name: 'X', pnid_id: 999999 }, master)).status, 404);
  chk('production line tidak ada → 404',
    (await call('POST', '/assets', { category_id: cat.id, name: 'X', production_line_id: 999999 }, master)).status, 404);
  chk('P&ID bukan milik line yang dipilih → 409',
    (await call('POST', '/assets',
      { category_id: cat.id, name: 'X', pnid_id: pnid2.json?.id, production_line_id: lineId }, master)).status, 409);

  console.log('\n   Child record untuk aset yang tidak ada');
  chk('maintenance → 404',
    (await call('POST', '/assets/999999/maintenance', { performed_at: '2026-01-01' }, master)).status, 404);
  chk('riwayat pembelian → 404',
    (await call('POST', '/assets/999999/purchase-history', { amount: 100, purchase_date: '2026-01-01' }, master)).status, 404);
  chk('biaya maintenance negatif → 400',
    (await call('POST', `/assets/${assetId}/maintenance`, { performed_at: '2026-01-01', cost: -100 }, master)).status, 400);
  chk('nilai penambahan negatif → 400',
    (await call('POST', `/assets/${assetId}/purchase-history`, { amount: -50, purchase_date: '2026-01-01' }, master)).status, 400);

  console.log('\n8. AST-003 & AST-010 — depresiasi lewat API');
  const landCat = (cats.json?.data || []).find((c: any) => c.code === 'LAND');
  chk('kategori Tanah ada', !!landCat, true);

  const land = await call('POST', '/assets', {
    category_id: landCat.id, name: 'Tanah Uji',
    purchase_date: '2020-01-01', purchase_price: 500_000_000, useful_life_years: 20,
  }, master);
  const landRow = (await call('GET', `/assets/${land.json?.id}`, undefined, master)).json?.data;
  chk('tanah: akumulasi penyusutan nol', Number(landRow?.accumulated_depreciation), 0);
  chk('tanah: nilai buku = harga perolehan', Number(landRow?.book_value), 500_000_000);
  chk('tanah: ada alasannya', !!landRow?.depreciation_note, true);

  const machCat = (cats.json?.data || []).find((c: any) => c.code === 'MACH');
  const sl = await call('POST', '/assets', {
    category_id: machCat.id, name: 'Mesin SL',
    purchase_date: '2020-01-01', purchase_price: 120_000_000,
    salvage_value: 20_000_000, useful_life_years: 10, depreciation_method: 'straight_line',
  }, master);
  const db = await call('POST', '/assets', {
    category_id: machCat.id, name: 'Mesin DB',
    purchase_date: '2020-01-01', purchase_price: 120_000_000,
    salvage_value: 20_000_000, useful_life_years: 10, depreciation_method: 'declining_balance',
  }, master);

  const slRow = (await call('GET', `/assets/${sl.json?.id}?as_of_date=2021-01-01`, undefined, master)).json?.data;
  const dbRow = (await call('GET', `/assets/${db.json?.id}?as_of_date=2021-01-01`, undefined, master)).json?.data;
  chk('garis lurus 12 bulan = 10 juta', Number(slRow?.accumulated_depreciation), 10_000_000);
  chk('saldo menurun BERBEDA dari garis lurus',
    Number(dbRow?.accumulated_depreciation) !== Number(slRow?.accumulated_depreciation), true);
  chk('saldo menurun lebih besar di tahun awal',
    Number(dbRow?.accumulated_depreciation) > Number(slRow?.accumulated_depreciation), true);

  // as_of_date benar-benar berpengaruh
  const later = (await call('GET', `/assets/${sl.json?.id}?as_of_date=2023-01-01`, undefined, master)).json?.data;
  chk('as_of_date 3 tahun = 30 juta', Number(later?.accumulated_depreciation), 30_000_000);

  // Tanggal siap pakai menggeser awal depresiasi
  await call('PATCH', `/assets/${sl.json?.id}`, { in_service_date: '2020-07-01' }, master);
  const delayed = (await call('GET', `/assets/${sl.json?.id}?as_of_date=2021-01-01`, undefined, master)).json?.data;
  chk('in_service_date menggeser awal depresiasi', Number(delayed?.accumulated_depreciation), 5_000_000);

  for (const id of [land.json?.id, sl.json?.id, db.json?.id]) {
    if (id) await call('DELETE', `/assets/${id}`, undefined, master);
  }

  console.log('\n9. AST-004 — capital addition masuk basis depresiasi');
  const capAsset = await call('POST', '/assets', {
    category_id: machCat.id, name: 'Mesin Capital',
    purchase_date: '2020-01-01', purchase_price: 120_000_000,
    salvage_value: 0, useful_life_years: 10, depreciation_method: 'straight_line',
  }, master);
  const capId = capAsset.json?.id;

  const beforeAdd = (await call('GET', `/assets/${capId}?as_of_date=2022-01-01`, undefined, master)).json?.data;
  chk('sebelum ada penambahan: 24 bulan × 1 juta', Number(beforeAdd?.accumulated_depreciation), 24_000_000);

  // KOMPATIBILITAS: entri tanpa entry_type harus default 'expense' dan TIDAK
  // mengubah angka apa pun — inilah yang menjaga data produksi lama tetap sama.
  await call('POST', `/assets/${capId}/purchase-history`,
    { description: 'Servis rutin', amount: 30_000_000, purchase_date: '2021-01-01' }, master);
  const afterExpense = (await call('GET', `/assets/${capId}?as_of_date=2022-01-01`, undefined, master)).json?.data;
  chk('entri tanpa jenis → tidak mengubah penyusutan',
    Number(afterExpense?.accumulated_depreciation), 24_000_000);
  chk('entri tanpa jenis → tidak mengubah nilai buku',
    Number(afterExpense?.book_value), Number(beforeAdd?.book_value));

  // Baru capital_addition yang menambah basis
  await call('POST', `/assets/${capId}/purchase-history`, {
    description: 'Upgrade motor', amount: 36_000_000,
    purchase_date: '2021-01-01', entry_type: 'capital_addition',
  }, master);
  const afterCapital = (await call('GET', `/assets/${capId}?as_of_date=2022-01-01`, undefined, master)).json?.data;

  chk('capital addition menambah total cost',
    Number(afterCapital?.total_capitalized_cost), 156_000_000);
  chk('penambahan tercatat', Number(afterCapital?.capitalized_additions), 36_000_000);
  // Induk 24 juta + penambahan 36jt/108 bulan × 12 bulan = 4 juta
  chk('penyusutan memakai basis terbaru',
    Number(afterCapital?.accumulated_depreciation), 28_000_000);
  chk('nilai buku ikut basis baru', Number(afterCapital?.book_value), 128_000_000);

  // Histori sebelum tanggal kapitalisasi tidak berubah
  const beforeCapDate = (await call('GET', `/assets/${capId}?as_of_date=2020-07-01`, undefined, master)).json?.data;
  chk('histori sebelum kapitalisasi tidak berubah',
    Number(beforeCapDate?.accumulated_depreciation), 6_000_000);

  chk('jenis transaksi tidak dikenal ditolak',
    (await call('POST', `/assets/${capId}/purchase-history`,
      { amount: 1000, purchase_date: '2021-01-01', entry_type: 'ngawur' }, master)).status, 400);

  await call('DELETE', `/assets/${capId}`, undefined, master);

  console.log('\n10. Master admin tetap berfungsi penuh');
  const masterCheck = await call('GET', '/users/profile/me', undefined, master);
  chk('master bisa baca profilnya', masterCheck.status, 200);
  chk('master masih level 10', Number(masterCheck.json?.data?.user_level), 10);
  const masterCreate = await call('POST', '/assets',
    { category_id: machCat.id, name: 'Cek Master' }, master);
  chk('master bisa membuat aset (FK created_by valid)', masterCreate.status, 201);
  if (masterCreate.json?.id) await call('DELETE', `/assets/${masterCreate.json.id}`, undefined, master);

  console.log('\n11. AST-011 — depreciation ledger & period lock');

  const ledgerAsset = await call('POST', '/assets', {
    category_id: machCat.id, name: 'Mesin Ledger',
    purchase_date: '2020-01-01', purchase_price: 120_000_000,
    salvage_value: 0, useful_life_years: 10, depreciation_method: 'straight_line',
  }, master);
  const ledgerId = ledgerAsset.json?.id;

  // KOMPATIBILITAS: sebelum ada periode ditutup, perilaku harus identik
  const beforeLock = (await call('GET', `/assets/${ledgerId}?as_of_date=2021-01-01`, undefined, master)).json?.data;
  chk('sebelum ada period lock: hitung dinamis seperti biasa',
    Number(beforeLock?.accumulated_depreciation), 12_000_000);
  chk('tidak ada penanda locked', beforeLock?.locked_through, undefined);

  // Yang bermakna bukan "tabelnya kosong" — periode yang pernah dibuka kembali
  // tetap meninggalkan barisnya — melainkan tidak ada yang berstatus tertutup.
  const periodsBefore = await call('GET', '/assets/depreciation/periods', undefined, master);
  chk('tidak ada periode tertutup di awal',
    (periodsBefore.json?.data || []).filter((p: any) => p.status === 'closed').length, 0);

  // Tutup Januari 2020 lalu Februari 2020
  const closeJan = await call('POST', '/assets/depreciation/periods/close',
    { period_year: 2020, period_month: 1 }, master);
  chk('tutup periode 1/2020', closeJan.status, 201);
  chk('ada entri yang diposting', closeJan.json?.posted_count > 0, true);

  chk('menutup periode yang sama dua kali ditolak',
    (await call('POST', '/assets/depreciation/periods/close', { period_year: 2020, period_month: 1 }, master)).status, 409);
  chk('melompati bulan ditolak',
    (await call('POST', '/assets/depreciation/periods/close', { period_year: 2020, period_month: 5 }, master)).status, 409);
  chk('periode belum berakhir ditolak',
    (await call('POST', '/assets/depreciation/periods/close', { period_year: 2099, period_month: 12 }, master)).status, 400);

  await call('POST', '/assets/depreciation/periods/close', { period_year: 2020, period_month: 2 }, master);

  const ledger = await call('GET', `/assets/${ledgerId}/depreciation-ledger`, undefined, master);
  chk('ledger punya 2 baris', (ledger.json?.data || []).length, 2);

  const afterLock = (await call('GET', `/assets/${ledgerId}?as_of_date=2021-01-01`, undefined, master)).json?.data;
  chk('angka tetap sama setelah periode ditutup',
    Number(afterLock?.accumulated_depreciation), 12_000_000);
  chk('penanda locked muncul', !!afterLock?.locked_through, true);

  console.log('\n   Inti AST-011: perubahan estimasi tidak lagi mengubah periode terkunci');
  // Naikkan harga perolehan. Tanpa ledger, akumulasi Feb 2020 ikut berubah.
  await call('PATCH', `/assets/${ledgerId}`, { purchase_price: 240_000_000 }, master);

  // Konvensi aplikasi ini: yang dihitung adalah BULAN PENUH yang sudah lewat,
  // jadi aset yang dibeli 1 Jan baru mencatat 1 bulan saat akhir Februari.
  // Konvensi lama dipertahankan supaya angka aset di produksi tidak bergeser.
  const lockedRow = (await call('GET', `/assets/${ledgerId}/depreciation-ledger`, undefined, master)).json?.data
    ?.find((r: any) => Number(r.period_month) === 2);
  chk('nilai ledger Feb 2020 TIDAK berubah meski harga dinaikkan',
    Number(lockedRow?.accumulated_after), 1_000_000);

  const afterEdit = (await call('GET', `/assets/${ledgerId}?as_of_date=2021-01-01`, undefined, master)).json?.data;
  chk('periode terkunci memakai nilai ledger, bukan hitung ulang',
    Number(afterEdit?.locked_accumulated), 1_000_000);
  chk('perubahan estimasi berlaku prospektif',
    Number(afterEdit?.accumulated_depreciation) > 12_000_000, true);

  console.log('\n   Buka kembali periode');
  chk('membuka periode di tengah ditolak',
    (await call('POST', '/assets/depreciation/periods/reopen', { period_year: 2020, period_month: 1 }, master)).status, 409);
  chk('membuka periode terakhir boleh',
    (await call('POST', '/assets/depreciation/periods/reopen', { period_year: 2020, period_month: 2 }, master)).status, 200);
  chk('ledger periode itu ikut terhapus',
    ((await call('GET', `/assets/${ledgerId}/depreciation-ledger`, undefined, master)).json?.data || []).length, 1);

  chk('tutup periode butuh permission',
    (await call('POST', '/assets/depreciation/periods/close', { period_year: 2020, period_month: 3 }, undefined)).status, 401);

  // Kembalikan ke keadaan semula supaya tes bisa diulang
  await call('POST', '/assets/depreciation/periods/reopen', { period_year: 2020, period_month: 1 }, master);
  await call('DELETE', `/assets/${ledgerId}`, undefined, master);

  console.log('\n12. AST-006 — disposal workflow');

  const mkAsset = async (name: string) => (await call('POST', '/assets', {
    category_id: machCat.id, name,
    purchase_date: '2020-01-01', purchase_price: 120_000_000,
    salvage_value: 0, useful_life_years: 10, depreciation_method: 'straight_line',
  }, master)).json?.id;

  const dispA = await mkAsset('Mesin Disposal A');

  // Perubahan status langsung tidak lagi diterima
  const direct = await call('PATCH', `/assets/${dispA}`, { status: 'disposed', disposed_date: '2026-01-31' }, master);
  chk('ubah status ke disposed langsung ditolak', direct.status, 409);
  chk('diarahkan ke alur disposal', direct.json?.code, 'DISPOSAL_WORKFLOW_REQUIRED');

  chk('permintaan tanpa alasan ditolak',
    (await call('POST', `/assets/${dispA}/disposal-request`, {}, master)).status, 400);
  chk('metode disposal tidak dikenal ditolak',
    (await call('POST', `/assets/${dispA}/disposal-request`,
      { reason: 'Rusak', disposal_method: 'ngawur' }, master)).status, 400);

  const req1 = await call('POST', `/assets/${dispA}/disposal-request`, {
    reason: 'Mesin rusak berat, biaya perbaikan melebihi nilai buku',
    disposal_method: 'sold', buyer: 'CV Besi Tua', planned_date: '2026-01-31', proceeds: 20_000_000,
  }, master);
  chk('permintaan disposal dibuat', req1.status, 201);
  const disposalId = req1.json?.id;

  const afterReq = (await call('GET', `/assets/${dispA}`, undefined, master)).json?.data;
  chk('status aset jadi disposal_requested', afterReq?.status, 'disposal_requested');
  chk('permintaan ganda ditolak',
    (await call('POST', `/assets/${dispA}/disposal-request`, { reason: 'lagi' }, master)).status, 409);

  // Nilai buku 31 Jan 2026: 120jt − (72 bulan × 1jt) = 48jt. Proceeds 20jt → rugi 28jt
  const approve = await call('POST', `/assets/disposals/${disposalId}/approve`,
    { disposal_date: '2026-01-31', proceeds: 20_000_000 }, master);
  chk('disposal disetujui', approve.status, 200);
  chk('nilai buku saat disposal dihitung', Number(approve.json?.book_value_at_disposal), 48_000_000);
  chk('gain/loss = proceeds − nilai buku', Number(approve.json?.gain_loss), -28_000_000);
  chk('ditandai sebagai loss', approve.json?.result, 'loss');

  const disposedAsset = (await call('GET', `/assets/${dispA}`, undefined, master)).json?.data;
  chk('status jadi disposed', disposedAsset?.status, 'disposed');
  chk('tanggal disposal tersimpan', String(disposedAsset?.disposed_date).slice(0, 10), '2026-01-31');
  chk('depresiasi berhenti di tanggal disposal',
    Number(disposedAsset?.accumulated_depreciation), 72_000_000);

  chk('menyetujui dua kali ditolak',
    (await call('POST', `/assets/disposals/${disposalId}/approve`, {}, master)).status, 409);
  chk('aset disposed tidak bisa diaktifkan lewat edit biasa',
    (await call('PATCH', `/assets/${dispA}`, { status: 'active' }, master)).json?.code, 'REVERSAL_REQUIRED');

  console.log('\n   Pembatalan resmi');
  chk('pembatalan tanpa alasan ditolak',
    (await call('POST', `/assets/disposals/${disposalId}/reverse`, {}, master)).status, 400);
  chk('pembatalan resmi berhasil',
    (await call('POST', `/assets/disposals/${disposalId}/reverse`, { reason: 'Salah input aset' }, master)).status, 200);
  const reversed = (await call('GET', `/assets/${dispA}`, undefined, master)).json?.data;
  chk('aset kembali aktif', reversed?.status, 'active');
  chk('tanggal disposal dikosongkan', reversed?.disposed_date, null);

  console.log('\n   Penolakan & gain');
  const dispB = await mkAsset('Mesin Disposal B');
  const req2 = await call('POST', `/assets/${dispB}/disposal-request`, { reason: 'Sudah tidak dipakai' }, master);
  chk('penolakan tanpa alasan ditolak',
    (await call('POST', `/assets/disposals/${req2.json?.id}/reject`, {}, master)).status, 400);
  chk('permintaan ditolak',
    (await call('POST', `/assets/disposals/${req2.json?.id}/reject`, { reason: 'Masih layak pakai' }, master)).status, 200);
  chk('aset kembali ke status semula',
    (await call('GET', `/assets/${dispB}`, undefined, master)).json?.data?.status, 'active');

  // Dijual di atas nilai buku → gain
  const req3 = await call('POST', `/assets/${dispB}/disposal-request`,
    { reason: 'Ada penawaran bagus', disposal_method: 'sold', proceeds: 60_000_000 }, master);
  const gainRes = await call('POST', `/assets/disposals/${req3.json?.id}/approve`,
    { disposal_date: '2026-01-31', proceeds: 60_000_000 }, master);
  chk('dijual di atas nilai buku → gain', Number(gainRes.json?.gain_loss), 12_000_000);
  chk('ditandai sebagai gain', gainRes.json?.result, 'gain');

  const history = await call('GET', `/assets/${dispA}/disposals`, undefined, master);
  chk('riwayat disposal tersimpan', (history.json?.data || []).length >= 1, true);
  chk('jejak siapa yang menyetujui ada', !!(history.json?.data || [])[0]?.approved_by_name, true);

  for (const id of [dispA, dispB]) await call('DELETE', `/assets/${id}`, undefined, master);

  console.log('\n13. Tanggal tidak bergeser zona waktu');
  // Kolom DATE dulu dikembalikan sebagai objek Date, sehingga 2026-01-31 di
  // database menjadi '2026-01-30T17:00:00.000Z' di respons (WIB +07). Frontend
  // mengisi form dengan substring(0,10) → tampil 30 Jan → disimpan → tanggalnya
  // benar-benar mundur satu hari setiap kali aset dibuka lalu disimpan.
  const dateAsset = await call('POST', '/assets', {
    category_id: machCat.id, name: 'Uji Tanggal', purchase_date: '2026-01-31',
  }, master);
  const dateId = dateAsset.json?.id;
  const fetched = (await call('GET', `/assets/${dateId}`, undefined, master)).json?.data;
  chk('purchase_date kembali persis seperti disimpan', String(fetched?.purchase_date), '2026-01-31');
  chk('substring(0,10) menghasilkan tanggal yang benar',
    String(fetched?.purchase_date).substring(0, 10), '2026-01-31');

  // Simulasi siklus buka → simpan yang dulu menggeser tanggal
  await call('PATCH', `/assets/${dateId}`,
    { purchase_date: String(fetched?.purchase_date).substring(0, 10) }, master);
  const roundTrip = (await call('GET', `/assets/${dateId}`, undefined, master)).json?.data;
  chk('buka lalu simpan tidak menggeser tanggal',
    String(roundTrip?.purchase_date).substring(0, 10), '2026-01-31');

  await call('DELETE', `/assets/${dateId}`, undefined, master);

  console.log('\n14. AST-005 — penghapusan aset tidak lagi permanen');
  const delAsset = await call('POST', '/assets', {
    category_id: machCat.id, name: 'Mesin Hapus',
    purchase_date: '2020-01-01', purchase_price: 50_000_000, useful_life_years: 5,
  }, master);
  const delId = delAsset.json?.id;

  // Beri jejak: dokumen + maintenance + riwayat pembelian
  const fd = new FormData();
  fd.append('file', new Blob([Buffer.from('%PDF-1.4\ntest', 'latin1')], { type: 'application/pdf' }), 'bukti.pdf');
  await fetch(`${API}/assets/${delId}/documents`, {
    method: 'POST', headers: { Authorization: `Bearer ${master}` }, body: fd,
  });
  await call('POST', `/assets/${delId}/maintenance`, { performed_at: '2024-01-01', cost: 500_000 }, master);
  await call('POST', `/assets/${delId}/purchase-history`, { amount: 1_000_000, purchase_date: '2024-01-01' }, master);

  const del = await call('DELETE', `/assets/${delId}`, { reason: 'Salah input' }, master);
  chk('penghapusan berhasil', del.status, 200);
  chk('aset hilang dari daftar', (await call('GET', `/assets/${delId}`, undefined, master)).status, 404);
  chk('menghapus dua kali ditolak', (await call('DELETE', `/assets/${delId}`, {}, master)).status, 409);

  // Inti AST-005: jejaknya TIDAK ikut terhapus
  const rows: any = await call('GET', `/assets?include_deleted=1`, undefined, master);
  const deletedRow = (rows.json?.data || []).find((a: any) => a.id === delId);
  chk('aset masih ada di database', !!deletedRow, true);
  chk('alasan penghapusan tercatat', deletedRow?.deletion_reason, 'Salah input');
  chk('siapa yang menghapus tercatat', !!deletedRow?.deleted_by, true);

  const restore = await call('POST', `/assets/${delId}/restore`, {}, master);
  chk('aset bisa dipulihkan', restore.status, 200);
  const restored = (await call('GET', `/assets/${delId}`, undefined, master)).json?.data;
  chk('aset kembali muncul', !!restored, true);
  chk('dokumen tetap utuh',
    ((await call('GET', `/assets/${delId}/documents`, undefined, master)).json?.data || []).length, 1);
  chk('maintenance tetap utuh',
    ((await call('GET', `/assets/${delId}/maintenance`, undefined, master)).json?.data || []).length, 1);
  chk('riwayat pembelian tetap utuh',
    ((await call('GET', `/assets/${delId}/purchase-history`, undefined, master)).json?.data || []).length, 1);

  await call('DELETE', `/assets/${delId}`, { reason: 'bersih-bersih' }, master);

  console.log('\n15. AST-013 — menghapus master yang masih dipakai');
  const lineC = await call('POST', '/assets/production-lines',
    { code: `LN${stamp}C`, name: `Line Uji C ${stamp}` }, master);
  const pnidC = await call('POST', `/assets/production-lines/${lineC.json?.id}/pnids`,
    { code: `PID-${stamp}C`, title: 'P&ID Uji C' }, master);
  const attached = await call('POST', '/assets', {
    category_id: machCat.id, name: 'Aset Menempel', pnid_id: pnidC.json?.id,
  }, master);

  const lineBusy = await call('DELETE', `/assets/production-lines/${lineC.json?.id}`, undefined, master);
  chk('line yang masih dipakai ditolak', lineBusy.status, 409);
  chk('jumlah terdampak disebutkan', lineBusy.json?.assets >= 1, true);

  const pnidBusy = await call('DELETE', `/assets/pnids/${pnidC.json?.id}`, undefined, master);
  chk('P&ID yang masih dipakai ditolak', pnidBusy.status, 409);
  chk('jumlah aset disebutkan', Number(pnidBusy.json?.assets), 1);

  // Lepas asetnya secara sengaja
  const detach = await call('DELETE', `/assets/pnids/${pnidC.json?.id}?detach_assets=1`, undefined, master);
  chk('bisa dilepas kalau disengaja', detach.status, 200);
  chk('jumlah yang dilepas dilaporkan', Number(detach.json?.detached_assets), 1);
  chk('aset tetap ada, hanya lepas dari P&ID',
    (await call('GET', `/assets/${attached.json?.id}`, undefined, master)).json?.data?.pnid_id, null);

  await call('DELETE', `/assets/${attached.json?.id}`, { reason: 'bersih-bersih' }, master);
  chk('line bisa dinonaktifkan setelah kosong',
    (await call('DELETE', `/assets/production-lines/${lineC.json?.id}`, undefined, master)).status, 200);

  console.log('\n16. Bersih-bersih');
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
