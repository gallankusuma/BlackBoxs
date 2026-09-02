import 'dotenv/config';
/**
 * Angka yang dilihat penyetuju di Approval Inbox (PROC-INBOX-01).
 *
 * Layar itu menghitung jumlah item dan nilai dokumen dari
 * `purchase_request_items` dan `grn_items` — dua tabel yang ada di skema
 * lengkap dengan foreign key, tapi **tidak pernah ditulis kode mana pun**.
 * Itemnya sebenarnya disimpan sebagai JSON di kolom `notes`, dan modulnya
 * sendiri (posting stok GRN, bid tabulation PR) memang membacanya dari situ.
 *
 * Akibatnya penyetuju melihat "0 item" dan nilai PR "Rp 0" saat memutuskan
 * menyetujui atau menolak. Diverifikasi: produksi 54 PR / 10 GRN dengan NOL
 * baris di kedua tabel itu; lokal 10.521 PR / 8.136 GRN, juga nol.
 *
 * Yang diuji di sini bukan "endpointnya 200", melainkan **angkanya benar dan
 * bukan nol** — sebuah nol yang salah di layar approval jauh lebih berbahaya
 * daripada error, karena ia terlihat seperti jawaban.
 *
 * Prasyarat: backend jalan. Jalankan: npm run test:inbox-item
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
  return { status: res.status, json };
}

const today = () => new Date().toISOString().slice(0, 10);

async function main() {
  const stamp = Date.now().toString().slice(-7);
  const { dbRun, dbAll } = await import('../src/config/database');

  const master: string = (await call('POST', '/auth/login', { email: ADMIN_EMAIL, password: ADMIN_PASS })).json?.token;
  if (!master) { console.log('  FAIL login master'); process.exit(1); }
  pass++; console.log('0. Persiapan\n  ok   login master');

  const wh: any = ((await call('GET', '/warehouses', undefined, master)).json?.data || [])[0];
  const produk = (await call('POST', '/products', { sku: `TEST-INBOX-${stamp}`, name: `Produk Inbox ${stamp}`, is_active: true }, master)).json?.data;
  const vendorId = (await call('POST', '/procurement/vendors', { name: `Vendor Inbox ${stamp}`, code: `VI${stamp}` }, master)).json?.data?.id;

  // PR dengan angka yang SENGAJA tidak bulat, supaya kalau kode diam-diam
  // memakai nilai lain (mis. estimatedTotal yang disimpan layar) ketahuan.
  const prItems = [
    { productId: produk.id, productName: 'A', name: 'A', qty: 3, uom: 'pcs', price: 1_250_000 },
    { productId: produk.id, productName: 'B', name: 'B', qty: 2, uom: 'pcs', price: 400_500 },
  ];
  const nilaiPr = 3 * 1_250_000 + 2 * 400_500; // 4.551.000
  const pr = await call('POST', '/procurement/purchase-requests', {
    department: 'Uji', request_date: today(), status: 'submitted',
    notes: JSON.stringify({ noteText: 'uji inbox', items: prItems, estimatedTotal: 999 }),
    requester_id: null,
  }, master);
  const prId = pr.json?.data?.id ?? pr.json?.id;
  chk('PR uji dibuat', !!prId, true);

  // GRN dengan dua item
  const po = await call('POST', '/procurement/purchase-orders', {
    vendor_id: vendorId, po_date: today(), status: 'approved',
    items: [{ product_id: produk.id, quantity: 20, unit_price: 1000, uom: 'pcs' }],
  }, master);
  const poId = po.json?.data?.id ?? po.json?.id;
  await call('POST', `/procurement/purchase-orders/${poId}/approve`, {}, master);
  const grn = await call('POST', '/procurement/goods-receipts', {
    po_id: poId, warehouse_id: wh.id, received_date: today(),
    notes: JSON.stringify({ items: [
      { product_id: produk.id, received_quantity: 7, remarks: 'a' },
      { product_id: produk.id, received_quantity: 4.5, remarks: 'b' },
    ] }),
  }, master);
  const grnId = grn.json?.data?.id ?? grn.json?.id;
  chk('GRN uji dibuat', !!grnId, true);

  // GRN kedua dengan notes yang BUKAN JSON — harus ditangani, bukan meledak.
  const po2 = await call('POST', '/procurement/purchase-orders', {
    vendor_id: vendorId, po_date: today(), status: 'approved',
    items: [{ product_id: produk.id, quantity: 5, unit_price: 1000, uom: 'pcs' }],
  }, master);
  const po2Id = po2.json?.data?.id ?? po2.json?.id;
  await call('POST', `/procurement/purchase-orders/${po2Id}/approve`, {}, master);
  const grnRusak = await call('POST', '/procurement/goods-receipts', {
    po_id: po2Id, warehouse_id: wh.id, received_date: today(),
    notes: 'catatan biasa, bukan JSON sama sekali',
  }, master);
  const grnRusakId = grnRusak.json?.data?.id ?? grnRusak.json?.id;

  // Baris inbox dibuat langsung supaya tesnya menguji PENGAYAAN-nya, bukan
  // mesin approval-nya (yang punya tesnya sendiri).
  const nomor = (t: string) => `UJI-${t}-${stamp}`;
  const dibuat: number[] = [];
  for (const [tipe, id] of [['purchase_request', prId], ['grn', grnId], ['grn', grnRusakId]] as [string, number][]) {
    const r = await dbRun(
      `INSERT INTO approval_requests (request_number, module, entity_type, entity_id, requester_id, current_step, status)
       VALUES (?, 'procurement', ?, ?, NULL, 1, 'pending')`,
      [`${nomor(tipe)}-${id}`, tipe, id]
    );
    dibuat.push(r.insertId);
  }
  chk('3 baris inbox uji dibuat', dibuat.length, 3);

  // ── Yang diuji ──────────────────────────────────────────────────────────
  console.log('\n1. Angka di inbox harus benar, bukan nol');
  const inbox = await call('GET', '/approval/inbox', undefined, master);
  chk('inbox → 200', inbox.status, 200);
  const baris: any[] = inbox.json?.data || [];

  const cariPr = baris.find(b => b.entity_type === 'purchase_request' && Number(b.entity_id) === Number(prId));
  chk('PR uji muncul di inbox', !!cariPr, true);
  chk('jumlah item PR benar (bukan 0)', Number(cariPr?.entity?.item_count), 2);
  // estimatedTotal di notes sengaja diisi 999; kalau angka itu yang dipakai,
  // asersi ini gagal — nilainya harus dihitung dari qty x price.
  chk('nilai PR dihitung dari qty x price', Number(cariPr?.entity?.estimated_total), nilaiPr);

  const cariGrn = baris.find(b => b.entity_type === 'grn' && Number(b.entity_id) === Number(grnId));
  chk('GRN uji muncul di inbox', !!cariGrn, true);
  chk('jumlah item GRN benar (bukan 0)', Number(cariGrn?.entity?.item_count), 2);
  chk('total qty diterima benar (termasuk pecahan)', Number(cariGrn?.entity?.total_qty_received), 11.5);

  console.log('\n2. Notes yang tidak bisa dibaca tidak boleh meledak');
  const cariRusak = baris.find(b => b.entity_type === 'grn' && Number(b.entity_id) === Number(grnRusakId));
  chk('GRN bernotes non-JSON tetap muncul', !!cariRusak, true);
  chk('  item_count jatuh ke 0, bukan error', Number(cariRusak?.entity?.item_count), 0);
  chk('  total qty 0', Number(cariRusak?.entity?.total_qty_received), 0);

  console.log('\n3. Cabang yang memang sehat tidak ikut rusak');
  // purchase_order_items DAN fund_request_items benar-benar terisi, jadi kedua
  // cabang itu tidak diubah. Diperiksa supaya perbaikan ini tidak menyeret
  // yang lain.
  const poRow = await dbRun(
    `INSERT INTO approval_requests (request_number, module, entity_type, entity_id, requester_id, current_step, status)
     VALUES (?, 'procurement', 'purchase_order', ?, NULL, 1, 'pending')`,
    [`UJI-po-${stamp}-${poId}`, poId]
  );
  dibuat.push(poRow.insertId);
  const inbox2 = await call('GET', '/approval/inbox', undefined, master);
  const cariPo = (inbox2.json?.data || []).find((b: any) => b.entity_type === 'purchase_order' && Number(b.entity_id) === Number(poId));
  chk('PO muncul dengan jumlah item dari tabelnya', Number(cariPo?.entity?.item_count), 1);

  // ── 4. Tidak ada jenis yang diam-diam kosong ────────────────────────────
  //
  // Inilah penjagaan yang paling penting di berkas ini. Ketiga cacat yang baru
  // diperbaiki (kolom `order_date`, `requester_id`, `priority` yang tidak ada)
  // TIDAK menghasilkan error yang terlihat: query melempar, `catch` di
  // pengayaan menelannya, dan entity-nya diset null. Layarnya cuma kosong, dan
  // itu tidak bisa dibedakan dari "memang belum ada datanya".
  console.log('\n4. Setiap jenis dokumen benar-benar terisi, bukan null');
  const fr: any = (await dbAll('SELECT id FROM fund_requests LIMIT 1'))[0];
  if (fr) {
    const frRow = await dbRun(
      `INSERT INTO approval_requests (request_number, module, entity_type, entity_id, requester_id, current_step, status)
       VALUES (?, 'finance', 'fund_request', ?, NULL, 1, 'pending')`,
      [`UJI-fr-${stamp}-${fr.id}`, fr.id]
    );
    dibuat.push(frRow.insertId);
  } else {
    console.log('       (tidak ada fund_request di database ini — jenis itu dilewati)');
  }

  const inbox3 = await call('GET', '/approval/inbox', undefined, master);
  const punyaEntity = (tipe: string, id: number) => {
    const b = (inbox3.json?.data || []).find((x: any) => x.entity_type === tipe && Number(x.entity_id) === Number(id));
    return !!b && b.entity !== null && b.entity !== undefined;
  };
  chk('purchase_request terisi', punyaEntity('purchase_request', prId), true);
  chk('purchase_order terisi', punyaEntity('purchase_order', poId), true);
  chk('grn terisi', punyaEntity('grn', grnId), true);
  if (fr) chk('fund_request terisi', punyaEntity('fund_request', fr.id), true);

  // ── 5. Datanya benar TIDAK ADA GUNANYA kalau tidak dirender ─────────────
  //
  // Sebelum perbaikan ini hanya `fund_request` yang punya blok ringkasan di
  // layar; PR, PO, dan GRN tampil sebagai "Entity #123" saja. Artinya backend
  // yang benar pun tetap tidak menolong penyetuju. Perbandingan angka di atas
  // tidak akan menangkap kemunduran itu — hanya pemindaian sumber yang bisa.
  console.log('\n5. Layar merender ringkasan untuk setiap jenis');
  const fsMod = await import('fs');
  const layar = fsMod.readFileSync('../frontend/src/views/ApprovalInbox.vue', 'utf8');
  const tanpaRingkasan = ['fund_request', 'purchase_request', 'purchase_order', 'grn']
    .filter(t => !new RegExp(`item\\.entity_type === '${t}' && item\\.entity`).test(layar));
  chk('setiap jenis punya blok ringkasan di layar', tanpaRingkasan, []);

  // ── bersih-bersih ───────────────────────────────────────────────────────
  console.log('\n6. Bersih-bersih fixture');
  await dbRun(`DELETE FROM approval_requests WHERE id IN (${dibuat.map(() => '?').join(',')})`, dibuat);
  chk('baris inbox uji terhapus',
    (await dbAll(`SELECT id FROM approval_requests WHERE id IN (${dibuat.map(() => '?').join(',')})`, dibuat)).length, 0);

  console.log(`\n${pass} lulus, ${fail} gagal`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch(e => { console.error(e); process.exit(1); });
