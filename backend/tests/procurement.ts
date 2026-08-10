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

  // Akun dinonaktifkan → gagal tertutup
  await call('PUT', `/users/${approverId}`, { user_level: 4, is_active: false }, master);
  chk('akun nonaktif tidak bisa approve meski level tinggi',
    (await call('POST', `/procurement/purchase-requests/${prId}/approve`, {}, approverToken)).status, 400);

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
  chk('format nomor berurutan (PR-YYYYMMDD-NNNN)', /^PR-\d{8}-\d{4}$/.test(numOne), true);
  chk('nomor berikutnya naik satu',
    Number(numTwo.split('-')[2]) - Number(numOne.split('-')[2]), 1);

  // 15 permintaan bersamaan — dulu tabrakan acak membalas 500 ke pengguna
  const burst = await Promise.all(Array.from({ length: 15 }, () => mkPr()));
  const created = burst.filter(r => r.status === 201);
  chk('15 PR bersamaan semuanya berhasil', created.length, 15);
  chk('tidak ada yang balas 500', burst.filter(r => r.status === 500).length, 0);
  const numbers = created.map(r => r.json?.data?.pr_number);
  chk('tidak ada nomor duplikat', new Set(numbers).size, 15);

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

  console.log(`\n=== ${pass} lulus, ${fail} gagal ===`);
  process.exit(fail ? 1 : 0);
}

main().catch(err => { console.error('Tes gagal dijalankan:', err.message); process.exit(1); });
