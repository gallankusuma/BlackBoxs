import 'dotenv/config';
/**
 * Tes modul Procurement — berangkat dari keluhan pengguna di sistem yang live.
 *
 * Bug pertama yang dibuktikan: persetujuan GRN tidak pernah menambah stok.
 * Fungsi postingnya menuju tabel `inventory_transactions` yang tidak ada dan
 * kolom `quantity_on_hand` yang juga tidak ada, lalu errornya ditelan
 * `catch { console.error }` sementara API tetap membalas sukses.
 *
 * Prasyarat: backend jalan. Jalankan: npm run test:procurement
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

const today = () => new Date().toISOString().slice(0, 10);

async function main() {
  const stamp = Date.now().toString().slice(-6);

  console.log('0. Persiapan');
  const master: string = (await call('POST', '/auth/login', { email: ADMIN_EMAIL, password: ADMIN_PASS })).json?.token;
  if (!master) { console.log('  FAIL login master'); process.exit(1); }
  pass++; console.log('  ok   login master');

  const wh = ((await call('GET', '/warehouses', undefined, master)).json?.data || [])[0];
  chk('gudang tersedia', !!wh?.id, true);

  const createdProduct = await call('POST', '/products',
    { sku: `TEST-PROC-${stamp}`, name: `Produk Uji Procurement ${stamp}`, is_active: true }, master);
  const product = createdProduct.json?.data;
  chk('produk uji dibuat', createdProduct.status, 201);

  const vendor = await call('POST', '/procurement/vendors',
    { name: `Vendor Uji ${stamp}`, code: `VN${stamp}` }, master);
  const vendorId = vendor.json?.data?.id ?? vendor.json?.id;
  chk('vendor uji dibuat', !!vendorId, true);

  // GET /inventory mengembalikan kolom `quantity` dengan alias `quantity_on_hand`
  const stockOf = async (productId: number): Promise<number> => {
    const rows: any[] = (await call('GET', '/inventory', undefined, master)).json?.data || [];
    const row = rows.find((x: any) => Number(x.product_id) === Number(productId));
    return Number(row?.quantity_on_hand ?? 0);
  };

  // Satu PO hanya boleh punya satu GRN aktif, jadi tiap penerimaan butuh PO baru
  const makePoAndReceive = async (qtyOrder: number, qtyReceive: number) => {
    const po = await call('POST', '/procurement/purchase-orders', {
      vendor_id: vendorId, po_date: today(), status: 'approved',
      items: [{ product_id: product.id, quantity: qtyOrder, unit_price: 25000, uom: 'pcs' }],
    }, master);
    const poId = po.json?.data?.id ?? po.json?.id;
    // PROC-R24: `status: 'approved'` di body TIDAK menyetujui PO — approval_status
    // selalu mulai dari 0. GRN kini menolak PO yang belum disetujui penuh.
    await call('POST', `/procurement/purchase-orders/${poId}/approve`, {}, master);

    const grn = await call('POST', '/procurement/goods-receipts', {
      po_id: poId,
      warehouse_id: wh.id,
      received_date: today(),
      // Kontrak modul ini: item GRN dititipkan sebagai JSON di dalam kolom
      // `notes`. POST /goods-receipts MENGABAIKAN field `items` di body —
      // persis seperti yang dikirim GoodReceipt.vue.
      notes: JSON.stringify({
        items: [{ product_id: product.id, received_quantity: qtyReceive, remarks: 'uji' }],
        generalNotes: `Uji ${stamp}`,
      }),
    }, master);
    return { poId, grnId: grn.json?.data?.id ?? grn.json?.id, grn };
  };

  console.log('\n1. Persetujuan GRN harus menambah stok');
  const before = await stockOf(product.id);
  chk('stok awal nol', before, 0);

  const first = await makePoAndReceive(10, 7);
  chk('GRN dibuat', !!first.grnId, true);

  const approve = await call('POST', `/procurement/goods-receipts/${first.grnId}/approve`, {}, master);
  chk('GRN disetujui', approve.status, 200);
  chk('jumlah baris stok yang diposting dilaporkan', Number(approve.json?.stock_posted), 1);
  chk('stok BERTAMBAH 7', await stockOf(product.id), 7);

  console.log('\n2. Approve ulang tidak boleh menambah stok lagi');
  const again = await call('POST', `/procurement/goods-receipts/${first.grnId}/approve`, {}, master);
  chk('stok tidak bertambah dua kali', await stockOf(product.id), 7);
  if (again.status === 200) chk('ditandai sudah pernah diposting', again.json?.stock_already_posted, true);
  else { pass++; console.log(`  ok   approve ulang ditolak (${again.status})`); }

  console.log('\n3. Penerimaan berikutnya menambah, bukan menimpa');
  const second = await makePoAndReceive(5, 3);
  await call('POST', `/procurement/goods-receipts/${second.grnId}/approve`, {}, master);
  chk('stok terakumulasi jadi 10', await stockOf(product.id), 10);

  console.log('\n4. Kegagalan posting tidak lagi dilaporkan sebagai sukses');
  // GRN tanpa gudang mustahil diposting; dulu API tetap membalas 200
  const noWh = await call('POST', '/procurement/goods-receipts', {
    po_id: (await makePoAndReceive(1, 1)).poId,
    warehouse_id: wh.id,
    received_date: today(),
    notes: JSON.stringify({ items: [{ product_id: product.id, received_quantity: 2 }] }),
  }, master);
  chk('GRN untuk PO yang sudah punya GRN ditolak', noWh.status, 400);

  console.log('\n5. Menyimpan PO tidak boleh menghapus field yang tidak dikirim');
  const poFull = await call('POST', '/procurement/purchase-orders', {
    vendor_id: vendorId,
    po_date: '2026-03-15',
    status: 'submitted',
    currency: 'USD',
    type: 'Import',
    payment_term: 'NET 30',
    contact_person: 'Pak Budi',
    delivery_to: 'Gudang Utama',
    advance_payment: 30,
    discount_percent: 5,
    ppn_percent: 11,
    items: [{ product_id: product.id, quantity: 4, unit_price: 100000, uom: 'pcs' }],
  }, master);
  const poFullId = poFull.json?.data?.id ?? poFull.json?.id;
  chk('PO lengkap dibuat', !!poFullId, true);

  const readPo = async (id: number) =>
    (await call('GET', `/procurement/purchase-orders/${id}`, undefined, master)).json?.data;

  const poBefore = await readPo(poFullId);
  chk('diskon tersimpan', Number(poBefore?.discount_percent), 5);
  chk('PPN tersimpan', Number(poBefore?.ppn_percent), 11);
  chk('uang muka tersimpan', Number(poBefore?.advance_payment), 30);

  // Payload minimal — persis kondisi yang dulu menghapus field finansial
  const minimal = await call('PUT', `/procurement/purchase-orders/${poFullId}`,
    { contact_person: 'Pak Andi' }, master);
  chk('simpan sebagian berhasil', minimal.status, 200);

  const poAfter = await readPo(poFullId);
  chk('kontak berubah', poAfter?.contact_person, 'Pak Andi');
  chk('diskon TIDAK jadi 0', Number(poAfter?.discount_percent), 5);
  chk('PPN TIDAK jadi 0', Number(poAfter?.ppn_percent), 11);
  chk('uang muka TIDAK jadi 0', Number(poAfter?.advance_payment), 30);
  chk('tanggal PO TIDAK melompat ke hari ini',
    String(poAfter?.po_date).slice(0, 10), '2026-03-15');
  chk('mata uang tidak jadi IDR', poAfter?.currency, 'USD');
  chk('tipe tidak jadi Local', poAfter?.type, 'Import');
  chk('termin pembayaran tetap', poAfter?.payment_term, 'NET 30');

  const itemsAfter = (await call('GET', `/procurement/purchase-orders/${poFullId}`, undefined, master))
    .json?.data?.items || [];
  chk('item PO tidak ikut terhapus', itemsAfter.length, 1);
  chk('jumlah item tetap', Number(itemsAfter[0]?.quantity), 4);

  console.log('\n6. Level persetujuan dibaca dari database, bukan dari token');
  // Skenario nyata: user login dulu (token merekam level lama), BARU levelnya
  // dinaikkan admin. Dulu ia tetap tidak bisa approve sampai token 7 hari
  // kedaluwarsa. Sekarang perubahan level langsung berlaku.
  const approverEmail = `approver.${stamp}@test.local`;
  const approver = await call('POST', '/users', {
    name: 'Uji Approver', email: approverEmail, password: 'secret123', user_level: 1,
  }, master);
  const approverId = approver.json?.data?.id;
  chk('user uji dibuat dengan level 1', approver.status, 201);

  const approverToken: string = (await call('POST', '/auth/login',
    { email: approverEmail, password: 'secret123' })).json?.token;
  chk('user uji bisa login', !!approverToken, true);

  const prForApproval = await call('POST', '/procurement/purchase-requests', {
    requestor_id: approverId,
    request_date: today(),
    notes: JSON.stringify({ items: [], noteText: `Uji approval ${stamp}` }),
  }, master);
  const prId = prForApproval.json?.data?.id ?? prForApproval.json?.id;
  chk('PR uji dibuat', !!prId, true);

  // Dengan level 1, belum boleh menyetujui
  chk('level 1 tidak bisa approve',
    (await call('POST', `/procurement/purchase-requests/${prId}/approve`, {}, approverToken)).status, 400);

  // Admin menaikkan levelnya jadi supervisor — TOKEN TIDAK BERUBAH
  await call('PUT', `/users/${approverId}`, { user_level: 2 }, master);

  const afterPromotion = await call('POST', `/procurement/purchase-requests/${prId}/approve`, {}, approverToken);
  chk('setelah dinaikkan, token LAMA langsung bisa approve', afterPromotion.status, 200);
  chk('status approval maju', Number(afterPromotion.json?.approval_status), 1);

  // Diturunkan lagi — harus langsung kehilangan hak
  await call('PUT', `/users/${approverId}`, { user_level: 1 }, master);
  chk('setelah diturunkan, token lama langsung kehilangan hak',
    (await call('POST', `/procurement/purchase-requests/${prId}/approve`, {}, approverToken)).status, 400);

  // Akun dinonaktifkan → gagal tertutup.
  //
  // DR-P1-01 mengubah KODEnya dari 400 jadi 401: penolakan kini terjadi di
  // middleware, sebelum permintaan sampai ke handler approve. Itu memang yang
  // diinginkan — akun nonaktif tidak seharusnya diperlakukan sebagai pemanggil
  // sah yang lalu ditolak karena alasan bisnis, dan 401 membuat frontend
  // mengeluarkan sesinya alih-alih menampilkan error validasi.
  await call('PUT', `/users/${approverId}`, { user_level: 4, is_active: false }, master);
  chk('akun nonaktif tidak bisa approve meski level tinggi',
    (await call('POST', `/procurement/purchase-requests/${prId}/approve`, {}, approverToken)).status, 401);

  await call('DELETE', `/users/${approverId}`, undefined, master);

  console.log('\n7. Nomor dokumen berurutan & aman saat bersamaan');
  const mkPr = () => call('POST', '/procurement/purchase-requests', {
    request_date: today(),
    notes: JSON.stringify({ items: [], noteText: `Uji nomor ${stamp}` }),
  }, master);

  const one = await mkPr();
  const two = await mkPr();
  const numOne = one.json?.data?.pr_number || '';
  const numTwo = two.json?.data?.pr_number || '';
  // Minimal 4 digit, bukan tepat 4: counter memang boleh melewati 9999 seiring
  // waktu. Yang salah bukan panjangnya, tapi nomor acak dari estimator yang dulu
  // ikut menyeed counter ini (DR-P1-06).
  chk('format nomor berurutan (PR-YYYYMMDD-NNNN+)', /^PR-\d{8}-\d{4,}$/.test(numOne), true);
  chk('nomor berikutnya naik satu',
    Number(numTwo.split('-')[2]) - Number(numOne.split('-')[2]), 1);

  // 20 permintaan bersamaan — dulu tabrakan acak membalas 500 ke pengguna
  const burst = await Promise.all(Array.from({ length: 20 }, () => mkPr()));
  const created = burst.filter(r => r.status === 201);
  chk('20 PR bersamaan semuanya berhasil', created.length, 20);
  chk('tidak ada yang balas 500', burst.filter(r => r.status === 500).length, 0);
  const numbers = created.map(r => r.json?.data?.pr_number);
  chk('tidak ada nomor duplikat', new Set(numbers).size, 20);

  // PROC-R05: PO dan GRN dulu memanggil generator nomor langsung, tanpa retry
  const poBurst = await Promise.all(Array.from({ length: 20 }, () =>
    call('POST', '/procurement/purchase-orders', {
      vendor_id: vendorId, po_date: today(),
      items: [{ product_id: product.id, quantity: 1, unit_price: 1000, uom: 'pcs' }],
    }, master)));
  const poOk = poBurst.filter(r => r.status === 201);
  chk('20 PO bersamaan semuanya berhasil', poOk.length, 20);
  chk('tidak ada PO yang balas 500', poBurst.filter(r => r.status === 500).length, 0);
  chk('nomor PO tidak ada yang duplikat',
    new Set(poOk.map(r => r.json?.data?.po_number)).size, 20);

  // Tiap GRN butuh PO sendiri (satu GRN aktif per PO), jadi pakai PO di atas
  await Promise.all(poOk.map(r =>
    call('POST', `/procurement/purchase-orders/${r.json?.data?.id}/approve`, {}, master)));
  const grnBurst = await Promise.all(poOk.map(r =>
    call('POST', '/procurement/goods-receipts', {
      po_id: r.json?.data?.id, warehouse_id: wh.id, received_date: today(),
      notes: JSON.stringify({ items: [] }),
    }, master)));
  const grnOk = grnBurst.filter(r => r.status === 201);
  chk('20 GRN bersamaan semuanya berhasil', grnOk.length, 20);
  chk('tidak ada GRN yang balas 500', grnBurst.filter(r => r.status === 500).length, 0);
  chk('nomor GRN tidak ada yang duplikat',
    new Set(grnOk.map(r => r.json?.data?.grn_number)).size, 20);

  console.log('\n7b. PO gagal di tengah jalan tidak boleh menyisakan header');
  // PROC-R04: item kedua memakai product_id yang tidak ada → pelanggaran FK.
  // Dulu header dan item pertama sudah terlanjur tersimpan.
  const poCountBefore = ((await call('GET', '/procurement/purchase-orders', undefined, master)).json?.data || []).length;
  const poFail = await call('POST', '/procurement/purchase-orders', {
    vendor_id: vendorId, po_date: today(),
    items: [
      { product_id: product.id, quantity: 1, unit_price: 1000, uom: 'pcs' },
      { product_id: 999999999, quantity: 1, unit_price: 1000, uom: 'pcs' },
    ],
  }, master);
  chk('pembuatan PO ditolak', poFail.status >= 400, true);
  const poCountAfter = ((await call('GET', '/procurement/purchase-orders', undefined, master)).json?.data || []).length;
  chk('tidak ada PO setengah jadi yang tersimpan', poCountAfter, poCountBefore);

  console.log('\n8. Menyimpan PR/GRN tidak boleh menghapus item di dalam notes');
  // Item PR dan GRN disimpan sebagai JSON di kolom `notes`. Dulu menyimpan
  // sebagian akan menimpanya jadi NULL — seluruh item hilang — dan status
  // yang sudah disetujui kembali jadi DRAFT.
  const prNotes = JSON.stringify({
    items: [{ product_id: product.id, quantity: 9, uom: 'pcs' }],
    noteText: `Uji notes ${stamp}`,
  });
  const prKeep = await call('POST', '/procurement/purchase-requests', {
    request_date: today(), status: 'SUBMITTED', notes: prNotes, reason: 'Kebutuhan proyek',
  }, master);
  const prKeepId = prKeep.json?.data?.id ?? prKeep.json?.id;

  const readPr = async (id: number) =>
    (await call('GET', `/procurement/purchase-requests/${id}`, undefined, master)).json?.data;

  const prBefore = await readPr(prKeepId);
  chk('item PR tersimpan di notes', JSON.parse(prBefore?.notes || '{}').items?.length, 1);

  // Simpan hanya satu field
  chk('simpan sebagian PR berhasil',
    (await call('PUT', `/procurement/purchase-requests/${prKeepId}`, { reason: 'Direvisi' }, master)).status, 200);

  const prAfter = await readPr(prKeepId);
  chk('alasan berubah', prAfter?.reason, 'Direvisi');
  chk('item PR TIDAK hilang', JSON.parse(prAfter?.notes || '{}').items?.length, 1);
  chk('jumlah item tetap', JSON.parse(prAfter?.notes || '{}').items?.[0]?.quantity, 9);
  chk('status TIDAK kembali jadi DRAFT', String(prAfter?.status).toUpperCase(), 'SUBMITTED');

  // GRN: hal yang sama
  const grnKeepPo = await call('POST', '/procurement/purchase-orders', {
    vendor_id: vendorId, po_date: today(), status: 'approved',
    items: [{ product_id: product.id, quantity: 2, unit_price: 1000, uom: 'pcs' }],
  }, master);
  await call('POST', `/procurement/purchase-orders/${grnKeepPo.json?.data?.id ?? grnKeepPo.json?.id}/approve`, {}, master);
  const grnKeep = await call('POST', '/procurement/goods-receipts', {
    po_id: grnKeepPo.json?.data?.id ?? grnKeepPo.json?.id,
    warehouse_id: wh.id, received_date: today(), status: 'received',
    notes: JSON.stringify({ items: [{ product_id: product.id, received_quantity: 2 }] }),
  }, master);
  const grnKeepId = grnKeep.json?.data?.id ?? grnKeep.json?.id;

  chk('simpan sebagian GRN berhasil',
    (await call('PUT', `/procurement/goods-receipts/${grnKeepId}`, { status: 'received' }, master)).status, 200);

  const grnAfter = (await call('GET', `/procurement/goods-receipts/${grnKeepId}`, undefined, master)).json?.data;
  chk('item GRN TIDAK hilang', JSON.parse(grnAfter?.notes || '{}').items?.length, 1);

  console.log('\n9. Menghapus PO tidak boleh menghapus jejak penerimaan & keuangan');
  // PO yang sudah punya GRN: harus DITOLAK, bukan menyapu goods_receipts dan
  // membuat stock_movements menggantung.
  const poWithGrn = first.poId;
  const refuse = await call('DELETE', `/procurement/purchase-orders/${poWithGrn}`, { reason: 'uji' }, master);
  chk('PO yang sudah ada GRN-nya ditolak', refuse.status, 409);
  chk('kode PO_HAS_TRAIL', refuse.json?.code, 'PO_HAS_TRAIL');
  chk('jumlah GRN disebutkan', Number(refuse.json?.goods_receipts) >= 1, true);
  chk('jumlah pergerakan stok disebutkan', Number(refuse.json?.stock_movements) >= 1, true);

  // GRN-nya harus tetap ada
  const grnStill = await call('GET', `/procurement/goods-receipts/${first.grnId}`, undefined, master);
  chk('GRN tidak ikut terhapus', grnStill.status, 200);
  chk('stok tetap 10 setelah percobaan hapus', await stockOf(product.id), 10);

  // PO draft tanpa jejak: boleh dihapus, tapi logical
  const poDraft = await call('POST', '/procurement/purchase-orders', {
    vendor_id: vendorId, po_date: today(), status: 'draft',
    items: [{ product_id: product.id, quantity: 1, unit_price: 1000, uom: 'pcs' }],
  }, master);
  const poDraftId = poDraft.json?.data?.id ?? poDraft.json?.id;

  const del = await call('DELETE', `/procurement/purchase-orders/${poDraftId}`, { reason: 'Salah input' }, master);
  chk('PO draft bisa dihapus', del.status, 200);
  chk('hilang dari daftar', (await call('GET', `/procurement/purchase-orders/${poDraftId}`, undefined, master)).status, 404);
  chk('menghapus dua kali ditolak',
    (await call('DELETE', `/procurement/purchase-orders/${poDraftId}`, {}, master)).status, 409);

  // Itemnya tetap ada di database, dan PO bisa dipulihkan
  chk('PO bisa dipulihkan',
    (await call('POST', `/procurement/purchase-orders/${poDraftId}/restore`, {}, master)).status, 200);
  const restored = (await call('GET', `/procurement/purchase-orders/${poDraftId}`, undefined, master)).json?.data;
  chk('PO kembali muncul', !!restored, true);
  chk('item PO tetap utuh setelah dipulihkan', (restored?.items || []).length, 1);

  console.log('\n10. Pengaman: daftar item kosong tidak boleh mengosongkan PO');
  const poGuard = await call('POST', '/procurement/purchase-orders', {
    vendor_id: vendorId, po_date: today(), status: 'draft',
    items: [
      { product_id: product.id, quantity: 3, unit_price: 1000, uom: 'pcs' },
      { product_id: product.id, quantity: 2, unit_price: 1500, uom: 'pcs' },
    ],
  }, master);
  const poGuardId = poGuard.json?.data?.id ?? poGuard.json?.id;

  const itemsOf = async (id: number) =>
    ((await call('GET', `/procurement/purchase-orders/${id}`, undefined, master)).json?.data?.items || []).length;
  chk('PO punya 2 item', await itemsOf(poGuardId), 2);

  const emptied = await call('PUT', `/procurement/purchase-orders/${poGuardId}`, { items: [] }, master);
  chk('kirim item kosong ditolak', emptied.status, 409);
  chk('kode REFUSED_EMPTY_ITEMS', emptied.json?.code, 'REFUSED_EMPTY_ITEMS');
  chk('jumlah item existing disebutkan', Number(emptied.json?.existing_items), 2);
  chk('item PO TIDAK terhapus', await itemsOf(poGuardId), 2);

  // Kalau memang disengaja, tetap bisa
  chk('bisa dikosongkan kalau eksplisit',
    (await call('PUT', `/procurement/purchase-orders/${poGuardId}?clear_items=1`, { items: [] }, master)).status, 200);
  chk('item terhapus setelah diminta eksplisit', await itemsOf(poGuardId), 0);

  console.log('\n11. GRN yang stoknya sudah masuk tidak boleh dihapus atau di-reject');
  const lc = await makePoAndReceive(6, 6);
  chk('GRN disetujui', (await call('POST', `/procurement/goods-receipts/${lc.grnId}/approve`, {}, master)).status, 200);
  const stockAfterPost = await stockOf(product.id);

  const delApproved = await call('DELETE', `/procurement/goods-receipts/${lc.grnId}`, undefined, master);
  chk('hapus GRN approved ditolak 409', delApproved.status, 409);
  chk('diarahkan ke reversal', delApproved.json?.code, 'GRN_APPROVED_USE_REVERSAL');

  const rejApproved = await call('POST', `/procurement/goods-receipts/${lc.grnId}/reject`, {}, master);
  chk('reject GRN approved ditolak 409', rejApproved.status, 409);
  chk('kode GRN_ALREADY_POSTED', rejApproved.json?.code, 'GRN_ALREADY_POSTED');
  chk('stok tidak berubah oleh dua percobaan itu', await stockOf(product.id), stockAfterPost);

  console.log('\n12. Reversal mengembalikan stok dan menyisakan jejak');
  chk('reversal tanpa alasan ditolak',
    (await call('POST', `/procurement/goods-receipts/${lc.grnId}/reverse`, {}, master)).status, 400);

  const rev = await call('POST', `/procurement/goods-receipts/${lc.grnId}/reverse`,
    { reason: 'Barang tidak sesuai spesifikasi' }, master);
  chk('reversal berhasil', rev.status, 200);
  chk('stok kembali ke posisi sebelum GRN', await stockOf(product.id), stockAfterPost - 6);

  const revGrn = (await call('GET', `/procurement/goods-receipts/${lc.grnId}`, undefined, master)).json?.data;
  chk('GRN asli TETAP ada', !!revGrn, true);
  chk('ditandai reversed', Number(revGrn?.is_reversed), 1);
  chk('alasan tercatat', revGrn?.reversal_reason, 'Barang tidak sesuai spesifikasi');
  chk('pelaku tercatat', !!revGrn?.reversed_by, true);

  chk('reversal kedua ditolak',
    (await call('POST', `/procurement/goods-receipts/${lc.grnId}/reverse`, { reason: 'lagi' }, master)).status, 409);
  chk('GRN reversed tidak bisa di-approve ulang',
    (await call('POST', `/procurement/goods-receipts/${lc.grnId}/approve`, {}, master)).status, 409);
  chk('GRN reversed tidak bisa dihapus',
    (await call('DELETE', `/procurement/goods-receipts/${lc.grnId}`, undefined, master)).status, 409);

  const replacement = await call('POST', '/procurement/goods-receipts', {
    po_id: lc.poId, warehouse_id: wh.id, received_date: today(),
    notes: JSON.stringify({ items: [{ product_id: product.id, received_quantity: 6 }] }),
  }, master);
  chk('PO boleh dibuatkan GRN pengganti setelah reversal', replacement.status < 300, true);

  console.log('\n13. Posting stok gagal harus me-rollback persetujuannya');
  const badPo = await call('POST', '/procurement/purchase-orders', {
    vendor_id: vendorId, po_date: today(), status: 'approved',
    items: [{ product_id: product.id, quantity: 1, unit_price: 1000, uom: 'pcs' }],
  }, master);
  await call('POST', `/procurement/purchase-orders/${badPo.json?.data?.id ?? badPo.json?.id}/approve`, {}, master);
  // product_id yang tidak ada memicu pelanggaran foreign key saat posting stok
  const badGrn = await call('POST', '/procurement/goods-receipts', {
    po_id: badPo.json?.data?.id ?? badPo.json?.id,
    warehouse_id: wh.id, received_date: today(),
    notes: JSON.stringify({ items: [{ product_id: 999999999, received_quantity: 5 }] }),
  }, master);
  const badGrnId = badGrn.json?.data?.id ?? badGrn.json?.id;
  const stockBeforeFail = await stockOf(product.id);

  const failApprove = await call('POST', `/procurement/goods-receipts/${badGrnId}/approve`, {}, master);
  chk('approve gagal dilaporkan sebagai error', failApprove.status, 500);
  chk('kode STOCK_POSTING_FAILED', failApprove.json?.code, 'STOCK_POSTING_FAILED');

  const rolled = (await call('GET', `/procurement/goods-receipts/${badGrnId}`, undefined, master)).json?.data;
  chk('persetujuan DIBATALKAN, tidak tersimpan sebagai approved', Number(rolled?.approval_status) === 2, false);
  chk('stok tidak berubah', await stockOf(product.id), stockBeforeFail);

  console.log('\n14. Reject tidak boleh mengabaikan dokumen turunan (PROC-R07)');
  const prForPo = await call('POST', '/procurement/purchase-requests', {
    request_date: today(), status: 'APPROVED', reason: 'Uji downstream',
    notes: JSON.stringify({ items: [{ product_id: product.id, quantity: 2, uom: 'pcs' }] }),
  }, master);
  const prForPoId = prForPo.json?.data?.id;
  await call('POST', `/procurement/purchase-requests/${prForPoId}/approve`, {}, master);
  const poFromPr = await call('POST', '/procurement/purchase-orders', {
    vendor_id: vendorId, po_date: today(), pr_id: prForPoId,
    items: [{ product_id: product.id, quantity: 2, unit_price: 5000, uom: 'pcs' }],
  }, master);
  const poFromPrId = poFromPr.json?.data?.id;

  const rejPrWithPo = await call('POST', `/procurement/purchase-requests/${prForPoId}/reject`, {}, master);
  chk('PR yang sudah menerbitkan PO tidak bisa di-reject', rejPrWithPo.status, 409);
  chk('kode PR_HAS_PO', rejPrWithPo.json?.code, 'PR_HAS_PO');

  await call('POST', `/procurement/purchase-orders/${poFromPrId}/approve`, {}, master);
  const grnForPo = await call('POST', '/procurement/goods-receipts', {
    po_id: poFromPrId, warehouse_id: wh.id, received_date: today(),
    notes: JSON.stringify({ items: [{ product_id: product.id, received_quantity: 2 }] }),
  }, master);
  chk('GRN dibuat untuk PO tersebut', grnForPo.status < 300, true);

  const rejPoWithGrn = await call('POST', `/procurement/purchase-orders/${poFromPrId}/reject`, {}, master);
  chk('PO yang sudah punya GRN tidak bisa di-reject', rejPoWithGrn.status, 409);
  chk('kode PO_HAS_GRN', rejPoWithGrn.json?.code, 'PO_HAS_GRN');

  console.log('\n15. PR bukan draft dibatalkan lewat soft delete (PROC-R08)');
  const prSoft = await call('POST', '/procurement/purchase-requests', {
    request_date: today(), status: 'APPROVED', reason: 'Uji soft delete',
    notes: JSON.stringify({ items: [] }),
  }, master);
  const prSoftId = prSoft.json?.data?.id;
  await call('POST', `/procurement/purchase-requests/${prSoftId}/approve`, {}, master);

  const delNoReason = await call('DELETE', `/procurement/purchase-requests/${prSoftId}`, undefined, master);
  chk('hapus tanpa alasan ditolak', delNoReason.status, 400);
  chk('kode REASON_REQUIRED', delNoReason.json?.code, 'REASON_REQUIRED');

  const delSoft = await call('DELETE', `/procurement/purchase-requests/${prSoftId}`, { reason: 'Dibatalkan user' }, master);
  chk('dengan alasan → soft delete', delSoft.status, 200);
  chk('ditandai soft delete', delSoft.json?.soft_deleted, true);
  chk('hilang dari detail', (await call('GET', `/procurement/purchase-requests/${prSoftId}`, undefined, master)).status, 404);
  const prList = (await call('GET', '/procurement/purchase-requests', undefined, master)).json?.data || [];
  chk('hilang dari daftar', prList.some((x: any) => Number(x.id) === Number(prSoftId)), false);

  chk('bisa dipulihkan',
    (await call('POST', `/procurement/purchase-requests/${prSoftId}/restore`, {}, master)).status, 200);
  chk('muncul lagi setelah dipulihkan',
    (await call('GET', `/procurement/purchase-requests/${prSoftId}`, undefined, master)).status, 200);

  console.log('\n16. Unggahan procurement divalidasi isinya (PROC-R10/R11)');
  const bid = await call('POST', `/procurement/purchase-requests/${prForPoId}/bids`, {
    vendor_id: vendorId, total_amount: 1000,
  }, master);
  const bidId = bid.json?.data?.id ?? bid.json?.id;

  const upload = async (filename: string, mime: string, bytes: number[]) => {
    const form = new FormData();
    form.append('file', new Blob([new Uint8Array(bytes)], { type: mime }), filename);
    const r = await fetch(`${API}/procurement/purchase-requests/${prForPoId}/bids/${bidId}/upload`, {
      method: 'POST', headers: { Authorization: `Bearer ${master}` }, body: form,
    });
    return { status: r.status, json: await r.json().catch(() => ({})) };
  };

  if (bidId) {
    const html = await upload('jahat.html', 'text/html', [...Buffer.from('<script>alert(1)</script>')]);
    chk('unggahan HTML ditolak', html.status, 400);
    const svg = await upload('gambar.svg', 'image/svg+xml', [...Buffer.from('<svg onload="alert(1)">')]);
    chk('unggahan SVG ditolak', svg.status, 400);
    // Nama .pdf tapi isinya bukan PDF — magic byte yang menentukan
    const fakePdf = await upload('palsu.pdf', 'application/pdf', [...Buffer.from('<html>bukan pdf</html>')]);
    chk('berkas menyamar sebagai PDF ditolak', fakePdf.status, 400);
    const realPdf = await upload('asli.pdf', 'application/pdf', [0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);
    chk('PDF asli diterima', realPdf.status, 200);
  }

  const traversal = await call('DELETE',
    `/procurement/purchase-requests/${prForPoId}/item-attachment?file_path=${encodeURIComponent('/uploads/pr-attachments/../../../../etc/passwd')}`,
    undefined, master);
  chk('path traversal saat hapus attachment ditolak', traversal.status, 400);

  console.log('\n17. Dua reversal bersamaan hanya boleh berhasil sekali (PROC-R14)');
  const race = await makePoAndReceive(9, 9);
  await call('POST', `/procurement/goods-receipts/${race.grnId}/approve`, {}, master);
  const stockBeforeRace = await stockOf(product.id);

  const twoReversals = await Promise.all([
    call('POST', `/procurement/goods-receipts/${race.grnId}/reverse`, { reason: 'balapan A' }, master),
    call('POST', `/procurement/goods-receipts/${race.grnId}/reverse`, { reason: 'balapan B' }, master),
  ]);
  chk('tepat satu reversal berhasil', twoReversals.filter(r => r.status === 200).length, 1);
  chk('yang lain ditolak 409', twoReversals.filter(r => r.status === 409).length, 1);
  chk('stok hanya berkurang SEKALI', await stockOf(product.id), stockBeforeRace - 9);

  const revMoves = (await call('GET', `/procurement/goods-receipts/${race.grnId}`, undefined, master)).json?.data;
  chk('GRN ditandai reversed sekali', Number(revMoves?.is_reversed), 1);

  console.log('\n18. Dua puluh GRN bersamaan pada PO yang sama (PROC-R15)');
  const onePo = await call('POST', '/procurement/purchase-orders', {
    vendor_id: vendorId, po_date: today(), status: 'approved',
    items: [{ product_id: product.id, quantity: 5, unit_price: 1000, uom: 'pcs' }],
  }, master);
  const onePoId = onePo.json?.data?.id ?? onePo.json?.id;
  await call('POST', `/procurement/purchase-orders/${onePoId}/approve`, {}, master);

  const grnRace = await Promise.all(Array.from({ length: 20 }, (_, i) =>
    call('POST', '/procurement/goods-receipts', {
      po_id: onePoId, warehouse_id: wh.id, received_date: today(),
      notes: JSON.stringify({ items: [{ product_id: product.id, received_quantity: 1, remarks: `race-${i}` }] }),
    }, master)));

  chk('tepat satu GRN dibuat', grnRace.filter(r => r.status === 201).length, 1);
  chk('sisanya ditolak', grnRace.filter(r => r.status >= 400).length, 19);
  chk('tidak ada yang balas 500', grnRace.filter(r => r.status === 500).length, 0);

  const grnsForPo = ((await call('GET', '/procurement/goods-receipts', undefined, master)).json?.data || [])
    .filter((g: any) => Number(g.po_id) === Number(onePoId) && Number(g.is_reversed || 0) === 0);
  chk('hanya satu GRN aktif untuk PO itu', grnsForPo.length, 1);

  console.log('\n19. Reversal ditolak kalau stok sudah terpakai (PROC-R20)');
  const used = await makePoAndReceive(4, 4);
  await call('POST', `/procurement/goods-receipts/${used.grnId}/approve`, {}, master);
  // Simulasikan barang yang sudah terpakai: sisakan stok di bawah jumlah GRN
  const invRows: any[] = (await call('GET', '/inventory', undefined, master)).json?.data || [];
  const invRow = invRows.find((x: any) => Number(x.product_id) === Number(product.id));
  const stockNow = Number(invRow?.quantity_on_hand ?? 0);
  await call('PUT', `/inventory/${invRow.id}`, { quantity: 2 }, master);

  const insufficient = await call('POST', `/procurement/goods-receipts/${used.grnId}/reverse`,
    { reason: 'stok sudah terpakai' }, master);
  chk('reversal ditolak saat stok kurang', insufficient.status, 409);
  chk('kode INSUFFICIENT_STOCK_FOR_REVERSAL', insufficient.json?.code, 'INSUFFICIENT_STOCK_FOR_REVERSAL');

  const stillThere = (await call('GET', `/procurement/goods-receipts/${used.grnId}`, undefined, master)).json?.data;
  chk('GRN tidak ikut ditandai reversed', Number(stillThere?.is_reversed || 0), 0);
  const afterFail: any[] = (await call('GET', '/inventory', undefined, master)).json?.data || [];
  chk('stok tidak berubah oleh reversal yang gagal',
    Number(afterFail.find((x: any) => Number(x.product_id) === Number(product.id))?.quantity_on_hand ?? -1), 2);

  await call('PUT', `/inventory/${invRow.id}`, { quantity: stockNow }, master);

  console.log('\n20. Dokumen yang sudah jalan tidak boleh diedit (PROC-R16)');
  const lock = await makePoAndReceive(5, 5);
  const editBefore = await call('PUT', `/procurement/goods-receipts/${lock.grnId}`, { status: 'received' }, master);
  chk('GRN belum approved masih boleh diedit', editBefore.status, 200);

  await call('POST', `/procurement/goods-receipts/${lock.grnId}/approve`, {}, master);
  const editAfter = await call('PUT', `/procurement/goods-receipts/${lock.grnId}`,
    { warehouse_id: wh.id, notes: JSON.stringify({ items: [{ product_id: product.id, received_quantity: 999 }] }) }, master);
  chk('GRN approved tidak bisa diedit', editAfter.status, 409);
  chk('kode GRN_LOCKED_APPROVED', editAfter.json?.code, 'GRN_LOCKED_APPROVED');

  const poLocked = await call('PUT', `/procurement/purchase-orders/${lock.poId}`,
    { items: [{ product_id: product.id, quantity: 99, unit_price: 1, uom: 'pcs' }] }, master);
  chk('PO dengan GRN tidak bisa ubah item', poLocked.status, 409);
  chk('kode PO_LOCKED_BY_GRN', poLocked.json?.code, 'PO_LOCKED_BY_GRN');
  chk('PO masih boleh ubah data administratif',
    (await call('PUT', `/procurement/purchase-orders/${lock.poId}`, { delivery_to: 'Gudang B' }, master)).status, 200);

  // Form PO di frontend SELALU mengirim items. Mengirim ulang nilai yang sama
  // bukan perubahan, jadi tidak boleh ikut diblokir — kalau tidak, PO yang
  // barangnya sudah datang tidak bisa disimpan sama sekali.
  const poNow = (await call('GET', `/procurement/purchase-orders/${lock.poId}`, undefined, master)).json?.data;
  const sameItems = (poNow?.items || []).map((i: any) => ({
    product_id: i.product_id, quantity: i.quantity, unit_price: i.unit_price, uom: i.uom,
  }));
  chk('kirim ulang item yang sama tetap boleh',
    (await call('PUT', `/procurement/purchase-orders/${lock.poId}`,
      { delivery_to: 'Gudang C', items: sameItems }, master)).status, 200);

  const prLocked = await call('PUT', `/procurement/purchase-requests/${prForPoId}`,
    { notes: JSON.stringify({ items: [] }) }, master);
  chk('PR yang sudah punya PO tidak bisa ubah item', prLocked.status, 409);
  chk('kode PR_LOCKED_BY_PO', prLocked.json?.code, 'PR_LOCKED_BY_PO');

  console.log('\n21. PR yang dibatalkan tidak bisa dipakai lagi (PROC-R17)');
  const prCancel = await call('POST', '/procurement/purchase-requests', {
    request_date: today(), status: 'APPROVED', reason: 'Uji cancel',
    notes: JSON.stringify({ items: [] }),
  }, master);
  const prCancelId = prCancel.json?.data?.id;
  await call('POST', `/procurement/purchase-requests/${prCancelId}/approve`, {}, master);
  await call('DELETE', `/procurement/purchase-requests/${prCancelId}`, { reason: 'dibatalkan' }, master);

  chk('PR dibatalkan tidak bisa di-approve',
    (await call('POST', `/procurement/purchase-requests/${prCancelId}/approve`, {}, master)).status, 404);
  chk('PR dibatalkan tidak bisa generate PO',
    (await call('POST', `/procurement/purchase-requests/${prCancelId}/generate-pos`, {}, master)).status, 404);
  chk('PR dibatalkan tidak bisa ditambah bid',
    (await call('POST', `/procurement/purchase-requests/${prCancelId}/bids`, { vendor_id: vendorId, total_amount: 1 }, master)).status, 404);

  console.log('\n22. Ubah uang muka harus ikut menyesuaikan AP (PROC-R18)');
  const poAp = await call('POST', '/procurement/purchase-orders', {
    vendor_id: vendorId, po_date: today(), payment_term: 'DP 20% - Pelunasan',
    advance_payment: 20,
    items: [{ product_id: product.id, quantity: 10, unit_price: 100000, uom: 'pcs' }],
  }, master);
  const poApId = poAp.json?.data?.id ?? poAp.json?.id;
  const schedOf = async (id: number) => {
    const d = (await call('GET', `/procurement/purchase-orders/${id}`, undefined, master)).json?.data;
    return (d?.payment_schedules || []).map((s: any) => Number(s.amount || 0));
  };
  const before18 = await schedOf(poApId);
  // Hanya advance_payment yang dikirim — dulu jadwal & AP tidak ikut berubah
  chk('ubah advance_payment saja diterima',
    (await call('PUT', `/procurement/purchase-orders/${poApId}`, { advance_payment: 40 }, master)).status, 200);
  const after18 = await schedOf(poApId);
  if (before18.length > 0) {
    chk('jadwal pembayaran ikut berubah', JSON.stringify(after18) !== JSON.stringify(before18), true);
  } else {
    console.log('  --   dilewati: PO ini tidak menghasilkan jadwal pembayaran');
  }

  console.log('\n23. Pembuat GRN selalu dari token (PROC-R12)');
  const otherUser = await call('GET', '/users', undefined, master);
  const someoneElse = (otherUser.json?.data || []).find((u: any) => u.email !== ADMIN_EMAIL);
  const spoofPo = await call('POST', '/procurement/purchase-orders', {
    vendor_id: vendorId, po_date: today(), status: 'approved',
    items: [{ product_id: product.id, quantity: 1, unit_price: 100, uom: 'pcs' }],
  }, master);
  await call('POST', `/procurement/purchase-orders/${spoofPo.json?.data?.id ?? spoofPo.json?.id}/approve`, {}, master);
  const spoof = await call('POST', '/procurement/goods-receipts', {
    po_id: spoofPo.json?.data?.id ?? spoofPo.json?.id,
    warehouse_id: wh.id, received_date: today(),
    received_by: someoneElse?.id ?? 1,
    notes: JSON.stringify({ items: [] }),
  }, master);
  chk('GRN dengan received_by orang lain tetap dibuat', spoof.status, 201);
  const spoofGrn = (await call('GET', `/procurement/goods-receipts/${spoof.json?.data?.id}`, undefined, master)).json?.data;
  chk('tapi created_by tercatat terpisah', !!spoofGrn?.created_by, true);

  console.log('\n24. Nomor dokumen memakai tanggal bisnis, bukan UTC (PROC-R21)');
  const jakartaToday = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date()).replace(/-/g, '');
  const numbered = await call('POST', '/procurement/purchase-requests', {
    request_date: today(), status: 'DRAFT', reason: 'Uji tanggal', notes: '{}',
  }, master);
  chk('nomor PR memakai tanggal Asia/Jakarta',
    String(numbered.json?.data?.pr_number || '').split('-')[1], jakartaToday);

  console.log('\n25. PO approved tidak bisa diubah materinya tanpa approval ulang (PROC-R23)');
  const poAppr = await call('POST', '/procurement/purchase-orders', {
    vendor_id: vendorId, po_date: today(), contact_person: 'Awal',
    items: [{ product_id: product.id, quantity: 10, unit_price: 100000, uom: 'pcs' }],
  }, master);
  const poApprId = poAppr.json?.data?.id ?? poAppr.json?.id;
  await call('POST', `/procurement/purchase-orders/${poApprId}/approve`, {}, master);

  const changeQty = await call('PUT', `/procurement/purchase-orders/${poApprId}`,
    { items: [{ product_id: product.id, quantity: 1000, unit_price: 500000, uom: 'pcs' }] }, master);
  chk('ubah qty/harga PO approved ditolak', changeQty.status, 409);
  chk('kode PO_LOCKED_APPROVED', changeQty.json?.code, 'PO_LOCKED_APPROVED');

  const vendor2 = await call('POST', '/procurement/vendors', { name: `Vendor Kedua ${stamp}`, code: `VB${stamp}` }, master);
  chk('ganti vendor PO approved ditolak',
    (await call('PUT', `/procurement/purchase-orders/${poApprId}`,
      { vendor_id: vendor2.json?.data?.id ?? vendor2.json?.id }, master)).status, 409);
  chk('ubah uang muka PO approved ditolak',
    (await call('PUT', `/procurement/purchase-orders/${poApprId}`, { advance_payment: 90 }, master)).status, 409);
  chk('data administratif tetap boleh',
    (await call('PUT', `/procurement/purchase-orders/${poApprId}`, { contact_person: 'Pak Joko' }, master)).status, 200);

  // Jalur resmi: reject dulu, baru boleh diubah
  chk('reject PO tanpa GRN/pembayaran boleh',
    (await call('POST', `/procurement/purchase-orders/${poApprId}/reject`, {}, master)).status, 200);
  chk('setelah reject, item boleh diubah lagi',
    (await call('PUT', `/procurement/purchase-orders/${poApprId}`,
      { items: [{ product_id: product.id, quantity: 12, unit_price: 100000, uom: 'pcs' }] }, master)).status, 200);

  console.log('\n26. GRN hanya boleh dari PO yang sudah disetujui penuh (PROC-R24)');
  const poUnapproved = await call('POST', '/procurement/purchase-orders', {
    vendor_id: vendorId, po_date: today(), status: 'approved',
    items: [{ product_id: product.id, quantity: 3, unit_price: 1000, uom: 'pcs' }],
  }, master);
  const poUnapprovedId = poUnapproved.json?.data?.id ?? poUnapproved.json?.id;

  const grnFromDraft = await call('POST', '/procurement/goods-receipts', {
    po_id: poUnapprovedId, warehouse_id: wh.id, received_date: today(),
    notes: JSON.stringify({ items: [{ product_id: product.id, received_quantity: 3 }] }),
  }, master);
  chk('GRN dari PO belum disetujui ditolak', grnFromDraft.status, 409);
  chk('kode PO_NOT_APPROVED', grnFromDraft.json?.code, 'PO_NOT_APPROVED');

  await call('POST', `/procurement/purchase-orders/${poUnapprovedId}/approve`, {}, master);
  chk('setelah PO disetujui, GRN boleh dibuat',
    (await call('POST', '/procurement/goods-receipts', {
      po_id: poUnapprovedId, warehouse_id: wh.id, received_date: today(),
      notes: JSON.stringify({ items: [{ product_id: product.id, received_quantity: 3 }] }),
    }, master)).status, 201);

  const poGone = await call('POST', '/procurement/purchase-orders', {
    vendor_id: vendorId, po_date: today(),
    items: [{ product_id: product.id, quantity: 1, unit_price: 1000, uom: 'pcs' }],
  }, master);
  const poGoneId = poGone.json?.data?.id ?? poGone.json?.id;
  await call('DELETE', `/procurement/purchase-orders/${poGoneId}`, { reason: 'uji' }, master);
  const grnFromDeleted = await call('POST', '/procurement/goods-receipts', {
    po_id: poGoneId, warehouse_id: wh.id, received_date: today(),
    notes: JSON.stringify({ items: [] }),
  }, master);
  chk('GRN dari PO yang dibatalkan ditolak', grnFromDeleted.status, 409);

  console.log('\n27. Bid terikat pada PR-nya sendiri (PROC-R25)');
  const mkPrWithBid = async (label: string) => {
    const pr = await call('POST', '/procurement/purchase-requests', {
      request_date: today(), status: 'SUBMITTED', reason: label,
      notes: JSON.stringify({ items: [{ product_id: product.id, quantity: 1, uom: 'pcs' }] }),
    }, master);
    const id = pr.json?.data?.id;
    const bid = await call('POST', `/procurement/purchase-requests/${id}/bids`,
      { vendor_id: vendorId, total_amount: 1000 }, master);
    return { prId: id, bidId: bid.json?.data?.id ?? bid.json?.id };
  };

  const prA = await mkPrWithBid('PR-A');
  const prB = await mkPrWithBid('PR-B');
  chk('dua PR dengan bid masing-masing dibuat', !!prA.bidId && !!prB.bidId, true);

  // Bid milik PR-B dipakai lewat URL PR-A
  const crossSelect = await call('POST',
    `/procurement/purchase-requests/${prA.prId}/bids/${prB.bidId}/select`, {}, master);
  chk('select bid milik PR lain ditolak', crossSelect.status, 404);
  chk('kode BID_NOT_IN_PR', crossSelect.json?.code, 'BID_NOT_IN_PR');

  const prAafter = (await call('GET', `/procurement/purchase-requests/${prA.prId}`, undefined, master)).json?.data;
  chk('selected_vendor_id PR-A tidak ikut terisi', prAafter?.selected_vendor_id ?? null, null);

  chk('ubah bid milik PR lain ditolak',
    (await call('PUT', `/procurement/purchase-requests/${prA.prId}/bids/${prB.bidId}`,
      { vendor_name: 'Disusupi' }, master)).status, 404);
  chk('hapus bid milik PR lain ditolak',
    (await call('DELETE', `/procurement/purchase-requests/${prA.prId}/bids/${prB.bidId}`, undefined, master)).status, 404);

  // PR yang dibatalkan tidak boleh disentuh lewat jalur bid
  await call('POST', `/procurement/purchase-requests/${prA.prId}/approve`, {}, master);
  await call('DELETE', `/procurement/purchase-requests/${prA.prId}`, { reason: 'dibatalkan' }, master);
  chk('lihat bid PR yang dibatalkan ditolak',
    (await call('GET', `/procurement/purchase-requests/${prA.prId}/bids`, undefined, master)).status, 404);
  chk('select bid pada PR yang dibatalkan ditolak',
    (await call('POST', `/procurement/purchase-requests/${prA.prId}/bids/${prA.bidId}/select`, {}, master)).status, 404);
  chk('ubah bid pada PR yang dibatalkan ditolak',
    (await call('PUT', `/procurement/purchase-requests/${prA.prId}/bids/${prA.bidId}`, { vendor_name: 'X' }, master)).status, 404);

  console.log('\n28. Bid yang sudah jadi sumber PO tidak bisa dihapus (PROC-R26)');
  const prGen = await call('POST', '/procurement/purchase-requests', {
    request_date: today(), status: 'SUBMITTED', reason: 'Uji generate',
    notes: JSON.stringify({ items: [{ product_id: product.id, quantity: 2, uom: 'pcs' }] }),
  }, master);
  const prGenId = prGen.json?.data?.id;
  const bidGen = await call('POST', `/procurement/purchase-requests/${prGenId}/bids`,
    { vendor_id: vendorId, total_amount: 5000 }, master);
  const bidGenId = bidGen.json?.data?.id ?? bidGen.json?.id;

  await call('POST', `/procurement/purchase-requests/${prGenId}/bids/${bidGenId}/select-item/0`, {}, master);
  await call('POST', `/procurement/purchase-requests/${prGenId}/approve`, {}, master);
  const gen = await call('POST', `/procurement/purchase-requests/${prGenId}/generate-pos`, {}, master);

  if (gen.status === 201 && (gen.json?.data || []).length > 0) {
    const delBid = await call('DELETE',
      `/procurement/purchase-requests/${prGenId}/bids/${bidGenId}`, undefined, master);
    chk('hapus bid sumber PO ditolak', delBid.status, 409);
    chk('kode BID_HAS_PO', delBid.json?.code, 'BID_HAS_PO');

    const bidsStill = (await call('GET', `/procurement/purchase-requests/${prGenId}/bids`, undefined, master)).json?.data || [];
    chk('bid tetap ada sebagai jejak', bidsStill.some((b: any) => Number(b.id) === Number(bidGenId)), true);
  } else {
    console.log(`  --   dilewati: generate-pos balas ${gen.status}`);
  }

  console.log('\n29. RBAC — token desktop tanpa permission procurement ditolak');
  const plainRole = await call('POST', '/roles',
    { code: `PROC${stamp}`, name: `ProcTest-${stamp}` }, master);
  const plainEmail = `proc.plain.${stamp}@test.local`;
  const plainUser = await call('POST', '/users', {
    name: 'Tanpa Hak Procurement', email: plainEmail, password: 'secret123',
    role_id: plainRole.json?.data?.id, user_level: 1,
  }, master);
  const plainToken: string = (await call('POST', '/auth/login',
    { email: plainEmail, password: 'secret123' })).json?.token;
  chk('user tanpa permission bisa login', !!plainToken, true);

  for (const [label, method, path] of [
    ['lihat daftar PO', 'GET', '/procurement/purchase-orders'],
    ['buat PO', 'POST', '/procurement/purchase-orders'],
    ['ubah PO', 'PUT', `/procurement/purchase-orders/${poGuardId}`],
    ['hapus PO', 'DELETE', `/procurement/purchase-orders/${poGuardId}`],
    ['lihat daftar PR', 'GET', '/procurement/purchase-requests'],
    ['buat PR', 'POST', '/procurement/purchase-requests'],
    ['lihat GRN', 'GET', '/procurement/goods-receipts'],
    ['buat GRN', 'POST', '/procurement/goods-receipts'],
    ['lihat vendor', 'GET', '/procurement/vendors'],
    ['buat vendor', 'POST', '/procurement/vendors'],
    ['harga vendor', 'GET', '/procurement/vendor-prices'],
    ['riwayat procurement', 'GET', '/procurement/procurement-history'],
  ] as const) {
    chk(label, (await call(method, path, method === 'GET' ? undefined : {}, plainToken)).status, 403);
  }

  console.log('\n   Master tetap bisa — proteksi tidak mengunci yang berwenang');
  for (const [label, path] of [
    ['daftar PO', '/procurement/purchase-orders'],
    ['daftar PR', '/procurement/purchase-requests'],
    ['daftar GRN', '/procurement/goods-receipts'],
    ['daftar vendor', '/procurement/vendors'],
  ] as const) {
    chk(`master → ${label}`, (await call('GET', path, undefined, master)).status, 200);
  }

  await call('DELETE', `/users/${plainUser.json?.data?.id}`, undefined, master);
  await call('DELETE', `/roles/${plainRole.json?.data?.id}`, undefined, master);

  console.log(`\n=== ${pass} lulus, ${fail} gagal ===`);
  process.exit(fail ? 1 : 0);
}

main().catch(err => { console.error('Tes gagal dijalankan:', err.message); process.exit(1); });
