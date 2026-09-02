import 'dotenv/config';
/**
 * Lampiran GRN — surat jalan & foto per item (PROC-GRN-DOC-01).
 *
 * Yang dijaga paling keras di sini ADA TIGA, dan tidak satu pun berbunyi
 * "unggahannya berhasil":
 *
 *   1. **Berkasnya tidak bocor.** `uploads/grn/` bukan folder publik nginx,
 *      jadi `/uploads/grn/<berkas>` harus 403 — bukti penerimaan barang tidak
 *      boleh terunduh siapa pun yang menebak URL-nya. Ini persis cacat yang
 *      pernah membuka 181 dokumen bisnis di produksi.
 *   2. **Isi berkas diperiksa, bukan namanya.** Berkas ber-ekstensi .jpg yang
 *      isinya bukan gambar harus ditolak.
 *   3. **Kunci setelah approve benar-benar berlaku.** Keputusan pemilik
 *      (2 September 2026): sesudah GRN disetujui penuh berkas masih boleh
 *      DITAMBAH tapi tidak boleh DIHAPUS — stoknya sudah bertambah, dan bukti
 *      yang bisa dihapus setelah barangnya masuk tidak lagi berguna sebagai
 *      bukti. Keduanya diuji, bukan hanya penolakannya.
 *
 * Prasyarat: backend jalan. Jalankan: npm run test:grn-lampiran
 */
const API = process.env.API || 'http://localhost:3005/api';
const BASE = API.replace(/\/api$/, '');
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
  return { status: res.status, json };
}

async function unggah(path: string, token: string | undefined, berkas: { nama: string; tipe: string; isi: Buffer }[], extra: Record<string, string> = {}) {
  const fd = new FormData();
  for (const b of berkas) fd.append('file', new Blob([new Uint8Array(b.isi)], { type: b.tipe }), b.nama);
  for (const [k, v] of Object.entries(extra)) fd.append(k, v);
  const res = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: fd,
  });
  const text = await res.text();
  let json: any = null; try { json = JSON.parse(text); } catch {}
  return { status: res.status, json };
}

const today = () => new Date().toISOString().slice(0, 10);
// Byte awal yang benar-benar dikenali validator (magic bytes), bukan sekadar ekstensi.
const PDF = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.from('uji surat jalan')]);
const JPG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from('uji foto barang')]);
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from('uji foto png')]);
const PALSU = Buffer.from('ini teks biasa, bukan gambar sama sekali');

async function main() {
  const stamp = Date.now().toString().slice(-7);
  const fs = await import('fs');
  const pathMod = await import('path');
  const { dbGet, dbAll, dbRun } = await import('../src/config/database');

  const master: string = (await call('POST', '/auth/login', { email: ADMIN_EMAIL, password: ADMIN_PASS })).json?.token;
  if (!master) { console.log('  FAIL login master'); process.exit(1); }
  pass++; console.log('0. Persiapan\n  ok   login master');

  const wh: any = ((await call('GET', '/warehouses', undefined, master)).json?.data || [])[0];
  const produk = (await call('POST', '/products', { sku: `TEST-GRN-${stamp}`, name: `Produk GRN ${stamp}`, is_active: true }, master)).json?.data;
  const produkLain = (await call('POST', '/products', { sku: `TEST-GRN-X-${stamp}`, name: `Produk Luar ${stamp}`, is_active: true }, master)).json?.data;
  const vendorId = (await call('POST', '/procurement/vendors', { name: `Vendor GRN ${stamp}`, code: `VG${stamp}` }, master)).json?.data?.id;
  chk('fixture produk, vendor, gudang siap', !!(produk?.id && produkLain?.id && vendorId && wh?.id), true);

  const buatGrn = async (qty: number) => {
    const po = await call('POST', '/procurement/purchase-orders', {
      vendor_id: vendorId, po_date: today(), status: 'approved',
      items: [{ product_id: produk.id, quantity: qty, unit_price: 1000, uom: 'pcs' }],
    }, master);
    const poId = po.json?.data?.id ?? po.json?.id;
    await call('POST', `/procurement/purchase-orders/${poId}/approve`, {}, master);
    const grn = await call('POST', '/procurement/goods-receipts', {
      po_id: poId, warehouse_id: wh.id, received_date: today(),
      notes: JSON.stringify({ items: [{ product_id: produk.id, received_quantity: qty, remarks: 'uji' }] }),
    }, master);
    return { poId, grnId: grn.json?.data?.id ?? grn.json?.id };
  };

  const { grnId } = await buatGrn(5);
  chk('GRN uji dibuat', !!grnId, true);

  // ── 1. Unggah ───────────────────────────────────────────────────────────
  console.log('\n1. Surat jalan & foto per item');
  const doc = await unggah(`/procurement/goods-receipts/${grnId}/documents`, master, [{ nama: 'surat-jalan.pdf', tipe: 'application/pdf', isi: PDF }]);
  chk('unggah surat jalan → 201', doc.status, 201);
  const docId = doc.json?.data?.[0]?.id;

  const foto = await unggah(`/procurement/goods-receipts/${grnId}/photos`, master, [
    { nama: 'barang-1.jpg', tipe: 'image/jpeg', isi: JPG },
    { nama: 'barang-2.png', tipe: 'image/png', isi: PNG },
  ], { product_id: String(produk.id) });
  chk('unggah 2 foto item → 201', foto.status, 201);
  const fotoId = foto.json?.data?.[0]?.id;

  // Satu permintaan mengembalikan dokumen DAN foto — mengambil foto per baris
  // item akan mengulang cacat N+1 yang baru dibereskan di layar PO.
  const lampiran = await call('GET', `/procurement/goods-receipts/${grnId}/attachments`, undefined, master);
  chk('attachments → 200', lampiran.status, 200);
  chk('dokumen & foto datang dalam SATU permintaan',
    [lampiran.json?.data?.documents?.length, lampiran.json?.data?.photos?.length], [1, 2]);
  chk('belum terkunci (GRN masih draft)', lampiran.json?.data?.locked, false);

  // ── 2. Yang harus ditolak ───────────────────────────────────────────────
  console.log('\n2. Yang harus ditolak');
  const salahProduk = await unggah(`/procurement/goods-receipts/${grnId}/photos`, master,
    [{ nama: 'x.jpg', tipe: 'image/jpeg', isi: JPG }], { product_id: String(produkLain.id) });
  chk('foto untuk produk di luar GRN ditolak', [salahProduk.status, salahProduk.json?.code], [400, 'PRODUK_BUKAN_MILIK_GRN']);

  const tanpaProduk = await unggah(`/procurement/goods-receipts/${grnId}/photos`, master,
    [{ nama: 'x.jpg', tipe: 'image/jpeg', isi: JPG }]);
  chk('foto tanpa product_id ditolak', [tanpaProduk.status, tanpaProduk.json?.code], [400, 'PRODUCT_ID_WAJIB']);

  const pdfKeFoto = await unggah(`/procurement/goods-receipts/${grnId}/photos`, master,
    [{ nama: 'bukan-foto.pdf', tipe: 'application/pdf', isi: PDF }], { product_id: String(produk.id) });
  chk('PDF ke kolom foto ditolak', pdfKeFoto.status, 400);

  // Ekstensi bisa dikarang siapa saja; yang diperiksa isinya.
  const palsu = await unggah(`/procurement/goods-receipts/${grnId}/documents`, master,
    [{ nama: 'menyamar.jpg', tipe: 'image/jpeg', isi: PALSU }]);
  chk('berkas ber-ekstensi .jpg yang isinya bukan gambar ditolak', palsu.status, 400);

  const setelahTolakan = await call('GET', `/procurement/goods-receipts/${grnId}/attachments`, undefined, master);
  chk('tidak ada berkas separuh yang tersimpan dari penolakan di atas',
    [setelahTolakan.json?.data?.documents?.length, setelahTolakan.json?.data?.photos?.length], [1, 2]);

  // ── 3. Berkasnya tidak boleh bocor ──────────────────────────────────────
  console.log('\n3. Bukti penerimaan tidak terbuka tanpa token');
  const barisDoc: any = await dbGet('SELECT file_path FROM grn_documents WHERE id = ?', [docId]);
  const urlPublik = `${BASE}${barisDoc.file_path}`;
  const publik = await fetch(urlPublik);
  chk('/uploads/grn/<berkas> tanpa token → 403', publik.status, 403);

  chk('unduh dokumen dengan token → 200',
    (await fetch(`${API}/procurement/goods-receipts/${grnId}/documents/${docId}/download`, { headers: { Authorization: `Bearer ${master}` } })).status, 200);
  chk('unduh dokumen tanpa token → 401',
    (await fetch(`${API}/procurement/goods-receipts/${grnId}/documents/${docId}/download`)).status, 401);
  chk('daftar lampiran tanpa token → 401', (await call('GET', `/procurement/goods-receipts/${grnId}/attachments`)).status, 401);
  chk('unggah tanpa token → 401', (await unggah(`/procurement/goods-receipts/${grnId}/documents`, undefined, [{ nama: 'a.pdf', tipe: 'application/pdf', isi: PDF }])).status, 401);

  // ── 4. Hapus sebelum approve ────────────────────────────────────────────
  console.log('\n4. Sebelum disetujui, lampiran masih boleh dihapus');
  const barisFoto: any = await dbGet('SELECT file_path FROM grn_item_photos WHERE id = ?', [fotoId]);
  const berkasFoto = pathMod.join(process.cwd(), 'uploads', 'grn', pathMod.basename(barisFoto.file_path));
  chk('berkas foto ada di disk', fs.existsSync(berkasFoto), true);

  chk('hapus foto → 200', (await call('DELETE', `/procurement/goods-receipts/${grnId}/photos/${fotoId}`, undefined, master)).status, 200);
  chk('berkasnya ikut hilang dari disk', fs.existsSync(berkasFoto), false);

  // ── 5. Setelah disetujui: boleh tambah, TIDAK boleh hapus ───────────────
  console.log('\n5. Setelah disetujui penuh');
  const setuju = await call('POST', `/procurement/goods-receipts/${grnId}/approve`, {}, master);
  chk('GRN disetujui penuh', setuju.status, 200);

  const lampiranTerkunci = await call('GET', `/procurement/goods-receipts/${grnId}/attachments`, undefined, master);
  chk('layar diberi tahu sudah terkunci', lampiranTerkunci.json?.data?.locked, true);

  const tambahSetelahApprove = await unggah(`/procurement/goods-receipts/${grnId}/documents`, master,
    [{ nama: 'susulan.pdf', tipe: 'application/pdf', isi: PDF }]);
  chk('MASIH boleh menambah berkas → 201', tambahSetelahApprove.status, 201);

  const hapusSetelahApprove = await call('DELETE', `/procurement/goods-receipts/${grnId}/documents/${docId}`, undefined, master);
  chk('TIDAK boleh menghapus lagi', [hapusSetelahApprove.status, hapusSetelahApprove.json?.code], [409, 'GRN_SUDAH_DISETUJUI']);
  chk('dokumennya memang masih ada',
    (await call('GET', `/procurement/goods-receipts/${grnId}/attachments`, undefined, master)).json?.data?.documents?.length, 2);

  // ── 6. Menghapus GRN membersihkan berkasnya ─────────────────────────────
  console.log('\n6. Menghapus GRN tidak meninggalkan berkas yatim');
  const kedua = await buatGrn(3);
  await unggah(`/procurement/goods-receipts/${kedua.grnId}/documents`, master, [{ nama: 'sj2.pdf', tipe: 'application/pdf', isi: PDF }]);
  const barisKedua: any[] = await dbAll('SELECT file_path FROM grn_documents WHERE grn_id = ?', [kedua.grnId]);
  const berkasKedua = barisKedua.map(r => pathMod.join(process.cwd(), 'uploads', 'grn', pathMod.basename(r.file_path)));
  chk('berkas GRN kedua ada di disk', berkasKedua.every(f => fs.existsSync(f)), true);

  chk('GRN kedua dihapus', (await call('DELETE', `/procurement/goods-receipts/${kedua.grnId}`, undefined, master)).status, 200);
  chk('berkasnya ikut terhapus, tidak jadi yatim', berkasKedua.some(f => fs.existsSync(f)), false);
  chk('barisnya ikut hilang', (await dbAll('SELECT id FROM grn_documents WHERE grn_id = ?', [kedua.grnId])).length, 0);

  // ── bersih-bersih ───────────────────────────────────────────────────────
  console.log('\n7. Bersih-bersih fixture');
  const sisa: any[] = await dbAll('SELECT file_path FROM grn_documents WHERE grn_id = ?', [grnId]);
  for (const r of sisa) {
    const f = pathMod.join(process.cwd(), 'uploads', 'grn', pathMod.basename(r.file_path));
    if (fs.existsSync(f)) fs.unlinkSync(f);
  }
  await dbRun('DELETE FROM grn_item_photos WHERE grn_id = ?', [grnId]);
  await dbRun('DELETE FROM grn_documents WHERE grn_id = ?', [grnId]);
  chk('lampiran fixture dibersihkan', (await dbAll('SELECT id FROM grn_documents WHERE grn_id = ?', [grnId])).length, 0);

  console.log(`\n${pass} lulus, ${fail} gagal`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch(e => { console.error(e); process.exit(1); });
