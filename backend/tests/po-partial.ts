import 'dotenv/config';
/**
 * Satu PR boleh melahirkan beberapa PO (PROC-PARTIAL-01).
 *
 * Dilaporkan pemilik: dari 4 item PR, baru 1 yang diterbitkan PO, dan sisanya
 * ditolak — "PR ini sudah memiliki 1 PO. PR tidak bisa digunakan lagi untuk PO
 * baru."
 *
 * Ada TIGA lapis di balik itu, dan yang ketiga paling berbahaya:
 *
 *   1. Penolakan mentah begitu `pr.status = 'PO_GENERATED'`. Itu bertentangan
 *      dengan layarnya sendiri (yang menampilkan "Remaining" dan tombol "Max")
 *      dan membuat pemeriksaan sisa per-item di bawahnya TIDAK PERNAH tercapai.
 *   2. `pr_bid_items` tidak punya kolom `product_id` — hanya `item_index` dan
 *      `item_name` — sehingga PO hasil tabulasi bid lahir dengan product_id
 *      NULL.
 *   3. Perhitungan sisa mengelompokkan per `product_id` dan MEMBUANG yang NULL.
 *      Akibatnya barang yang sudah dipesan tidak terhitung: layar menampilkan
 *      "Remaining: 4" untuk item yang 1-nya sudah dipesan.
 *
 * Kalau hanya lapis 1 yang dibuka, pengguna bisa memesan BERLEBIH tanpa satu
 * pun peringatan. Karena itu tes ini menguji ketiganya sekaligus, dan yang
 * paling keras dijaga adalah penolakan atas kelebihan.
 *
 * Prasyarat: backend jalan. Jalankan: npm run test:po-partial
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
  const { dbGet, dbAll, dbRun } = await import('../src/config/database');

  const master: string = (await call('POST', '/auth/login', { email: ADMIN_EMAIL, password: ADMIN_PASS })).json?.token;
  if (!master) { console.log('  FAIL login master'); process.exit(1); }
  pass++; console.log('0. Persiapan\n  ok   login master');

  const mk = async (suffix: string) => (await call('POST', '/products',
    { sku: `TEST-PARTIAL-${suffix}-${stamp}`, name: `Produk Partial ${suffix} ${stamp}`, is_active: true }, master)).json?.data;
  const pA = await mk('A'), pB = await mk('B');
  const vendorId = (await call('POST', '/procurement/vendors', { name: `Vendor Partial ${stamp}`, code: `VP${stamp}` }, master)).json?.data?.id;
  chk('fixture produk & vendor siap', !!(pA?.id && pB?.id && vendorId), true);

  // PR dengan dua item: A qty 4, B qty 1 — persis bentuk yang dipakai layar PR.
  const prNotes = {
    items: [
      { productId: pA.id, productName: pA.name, name: pA.name, qty: 4, uom: 'ROLL', price: 1000 },
      { productId: pB.id, productName: pB.name, name: pB.name, qty: 1, uom: 'ROLL', price: 2000 },
    ],
  };
  const pr = await call('POST', '/procurement/purchase-requests', {
    department: 'Uji', request_date: today(), status: 'submitted', notes: JSON.stringify(prNotes),
  }, master);
  const prId = pr.json?.data?.id ?? pr.json?.id;
  await dbRun('UPDATE purchase_requests SET approval_status = 2 WHERE id = ?', [prId]);
  chk('PR uji dibuat & disetujui penuh', !!prId, true);

  // ── 1. PO pertama, MENIRU hasil tabulasi bid: item TANPA product_id ──────
  console.log('\n1. PO pertama lahir tanpa product_id (seperti hasil tabulasi bid)');
  const po1 = await call('POST', '/procurement/purchase-orders', {
    vendor_id: vendorId, pr_id: prId, po_date: today(),
    items: [{ product_id: pA.id, quantity: 1, unit_price: 1000, uom: 'ROLL' }],
  }, master);
  const po1Id = po1.json?.data?.id ?? po1.json?.id;
  chk('PO pertama dibuat', po1.status >= 200 && po1.status < 300, true);
  // Identitas produknya sengaja dihapus, meniru PO hasil generate-pos.
  await dbRun('UPDATE purchase_order_items SET product_id = NULL, notes = ? WHERE purchase_order_id = ?', [pA.name, po1Id]);
  await dbRun("UPDATE purchase_requests SET status = 'PO_GENERATED' WHERE id = ?", [prId]);
  chk('item PO pertama kini tanpa product_id',
    (await dbGet('SELECT product_id FROM purchase_order_items WHERE purchase_order_id = ?', [po1Id]) as any)?.product_id, null);

  // ── 2. Sisa yang dilaporkan layar harus sudah dikurangi ─────────────────
  console.log('\n2. Sisa yang dilihat layar sudah memperhitungkan yang tanpa product_id');
  const alok = await call('GET', '/procurement/purchase-orders/allocations', undefined, master);
  const alokPr = (alok.json?.data || {})[String(prId)] || {};
  // Inilah cacat yang membuat layar menampilkan "Remaining: 4" untuk barang
  // yang 1-nya sudah dipesan.
  chk('produk A tercatat sudah dipesan 1', Number(alokPr[String(pA.id)] || 0), 1);
  chk('produk B belum dipesan', Number(alokPr[String(pB.id)] || 0), 0);

  // ── 3. PO kedua untuk SISANYA harus diterima ────────────────────────────
  console.log('\n3. PO kedua untuk sisa PR diterima');
  const po2 = await call('POST', '/procurement/purchase-orders', {
    vendor_id: vendorId, pr_id: prId, po_date: today(),
    items: [{ product_id: pA.id, quantity: 3, unit_price: 1000, uom: 'ROLL' },
            { product_id: pB.id, quantity: 1, unit_price: 2000, uom: 'ROLL' }],
  }, master);
  const po2Id = po2.json?.data?.id ?? po2.json?.id;
  chk('PO kedua diterima', [po2.status >= 200 && po2.status < 300, po2.json?.error || null], [true, null]);

  // ── 4. Kelebihan tetap DITOLAK — ini penjaga yang sebenarnya ────────────
  console.log('\n4. Kelebihan tetap ditolak');
  const po3 = await call('POST', '/procurement/purchase-orders', {
    vendor_id: vendorId, pr_id: prId, po_date: today(),
    items: [{ product_id: pA.id, quantity: 1, unit_price: 1000, uom: 'ROLL' }],
  }, master);
  chk('PO ketiga melebihi sisa → ditolak 400', po3.status, 400);
  chk('  alasannya soal sisa PR, bukan "PR sudah punya PO"',
    /melebihi sisa/i.test(String(po3.json?.error || '')), true);

  // ── 5. Pesan lama tidak boleh muncul lagi ───────────────────────────────
  console.log('\n5. Penolakan mentah "PR tidak bisa digunakan lagi" sudah tidak ada');
  const fs = await import('fs');
  const src = fs.readFileSync('src/routes/procurement.routes.ts', 'utf8');
  const hidup = src.split('\n').filter(l =>
    !l.trimStart().startsWith('//') && l.includes('PR tidak bisa digunakan lagi'));
  chk('tidak ada lagi sebagai kode hidup', hidup, []);

  // ── 6. generate-pos memulihkan product_id lewat item_index ──────────────
  console.log('\n6. generate-pos tidak lagi menulis product_id NULL');
  chk('resolveProductId dipakai saat menyisipkan item',
    /resolveProductId\(item\)/.test(src), true);
  chk('tidak ada lagi insert `item.product_id || null` di generate-pos',
    /\[newPoId, newPoId, item\.product_id \|\| null, Number\(item\.quantity\)/.test(src), false);

  // ── bersih-bersih ───────────────────────────────────────────────────────
  console.log('\n7. Bersih-bersih fixture');
  // AP ikut lahir bersama PO (FK accounts_payable.po_id), jadi ia harus dihapus
  // lebih dulu — kalau tidak, fixture menumpuk dan tes berikutnya mewarisinya.
  for (const id of [po1Id, po2Id].filter(Boolean)) {
    await dbRun('DELETE FROM accounts_payable WHERE po_id = ?', [id]);
    await dbRun('DELETE FROM purchase_order_items WHERE purchase_order_id = ? OR po_id = ?', [id, id]);
    await dbRun('DELETE FROM purchase_orders WHERE id = ?', [id]);
  }
  await dbRun('DELETE FROM purchase_requests WHERE id = ?', [prId]);
  await dbRun('DELETE FROM vendors WHERE id = ?', [vendorId]);
  await dbRun('DELETE FROM products WHERE id IN (?, ?)', [pA.id, pB.id]);
  chk('fixture terhapus', (await dbAll('SELECT id FROM purchase_orders WHERE pr_id = ?', [prId])).length, 0);

  console.log(`\n${pass} lulus, ${fail} gagal`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch(e => { console.error(e); process.exit(1); });
