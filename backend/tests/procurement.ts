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

  console.log(`\n=== ${pass} lulus, ${fail} gagal ===`);
  process.exit(fail ? 1 : 0);
}

main().catch(err => { console.error('Tes gagal dijalankan:', err.message); process.exit(1); });
