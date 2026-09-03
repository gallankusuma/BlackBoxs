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
  const kodeHidup = (frasa: string) => src.split('\n').filter(l =>
    !l.trimStart().startsWith('//') && !l.trimStart().startsWith('*') && l.includes(frasa));
  chk('tidak ada lagi sebagai kode hidup', kodeHidup('PR tidak bisa digunakan lagi'), []);
  // PROC-PARTIAL-02: penolakan kembarannya di generate-pos, yang justru
  // terlihat di layar pelapor.
  chk('penolakan "Hapus PO yang ada" di generate-pos juga sudah tidak ada',
    kodeHidup('Hapus PO yang ada terlebih dahulu'), []);

  // ── 6. generate-pos memulihkan product_id lewat item_index ──────────────
  console.log('\n6. generate-pos tidak lagi menulis product_id NULL');
  chk('resolveProductId dipakai saat menyisipkan item',
    /resolveProductId\(item\)/.test(src), true);
  chk('tidak ada lagi insert `item.product_id || null` di generate-pos',
    /\[newPoId, newPoId, item\.product_id \|\| null, Number\(item\.quantity\)/.test(src), false);

  // ── 7. Tombol "Generate PO" itu sendiri (PROC-PARTIAL-02) ───────────────
  //
  // Ini jalur yang BENAR-BENAR dipakai pemilik saat melapor: layar Purchase
  // Requests → Generate PO. Perbaikan PROC-PARTIAL-01 hanya membuka jalur PO
  // manual; generate-pos masih menolak mentah-mentah dengan kalimat "PR ini
  // sudah memiliki N PO" — persis yang terlihat di layar pelapor.
  console.log('\n7. Generate PO bertahap: vendor B tetap bisa setelah PO vendor A terbit');
  const prG = await call('POST', '/procurement/purchase-requests', {
    department: 'Uji', request_date: today(), status: 'submitted', notes: JSON.stringify(prNotes),
  }, master);
  const prGId = prG.json?.data?.id ?? prG.json?.id;
  await dbRun('UPDATE purchase_requests SET approval_status = 2 WHERE id = ?', [prGId]);

  const vB = (await call('POST', '/procurement/vendors',
    { name: `Vendor Partial B ${stamp}`, code: `VQ${stamp}` }, master)).json?.data?.id;

  const mkBid = async (vid: number, nama: string) =>
    (await dbRun('INSERT INTO pr_bids (pr_id, vendor_id, vendor_name, bid_date) VALUES (?, ?, ?, CURDATE())',
      [prGId, vid, nama])).insertId;
  const bidA = await mkBid(vendorId, `Vendor Partial ${stamp}`);
  const bidB = await mkBid(vB, `Vendor Partial B ${stamp}`);
  const mkBidItem = async (bid: number, idx: number, nama: string, qty: number, harga: number, menang: number) =>
    await dbRun(
      `INSERT INTO pr_bid_items (bid_id, item_index, item_name, quantity, uom, unit_price, total_price, is_winner)
       VALUES (?, ?, ?, ?, 'ROLL', ?, ?, ?)`,
      [bid, idx, nama, qty, harga, qty * harga, menang]);
  // Tahap 1: hanya item 0 yang sudah punya pemenang, dimenangkan vendor A.
  await mkBidItem(bidA, 0, pA.name, 4, 1000, 1);
  await mkBidItem(bidB, 1, pB.name, 1, 2000, 0);

  const gen1 = await call('POST', `/procurement/purchase-requests/${prGId}/generate-pos`, undefined, master);
  chk('generate pertama membuat 1 PO', [gen1.status, (gen1.json?.data || []).length], [201, 1]);
  chk('  PR jadi PO_GENERATED',
    (await dbGet('SELECT status FROM purchase_requests WHERE id = ?', [prGId]) as any)?.status, 'PO_GENERATED');

  // Tahap 2: pemenang item 1 baru ditentukan — inilah yang dulu ditolak.
  await dbRun('UPDATE pr_bid_items SET is_winner = 1 WHERE bid_id = ? AND item_index = 1', [bidB]);
  const gen2 = await call('POST', `/procurement/purchase-requests/${prGId}/generate-pos`, undefined, master);
  chk('generate kedua TIDAK ditolak', gen2.status, 201);
  chk('  vendor B mendapat PO-nya', (gen2.json?.data || []).length, 1);
  chk('  vendor A dilewati, bukan diduplikasi', (gen2.json?.skipped || []).length, 1);
  chk('  pesannya bukan lagi "sudah memiliki ... PO. Hapus PO yang ada"',
    /Hapus PO yang ada/i.test(String(gen2.json?.error || gen2.json?.message || '')), false);

  const poGen = await dbAll('SELECT id FROM purchase_orders WHERE pr_id = ?', [prGId]) as any[];
  chk('  PR ini kini punya 2 PO', poGen.length, 2);
  chk('  item PO hasil generate punya product_id (bukan NULL)',
    (await dbAll(
      `SELECT COUNT(*) AS c FROM purchase_order_items i
       JOIN purchase_orders o ON o.id = i.purchase_order_id
       WHERE o.pr_id = ? AND i.product_id IS NULL`, [prGId]) as any[])[0]?.c, 0);

  // Item yang dimenangkan vendor A SETELAH PO-nya terbit tidak bisa ikut lewat
  // jalur ini (satu bid = satu PO). Yang penting: itu dilaporkan, tidak hilang.
  await mkBidItem(bidA, 1, pB.name, 1, 2000, 0);
  await dbRun('UPDATE pr_bid_items SET is_winner = 1 WHERE bid_id = ? AND item_index = 1', [bidA]);
  await dbRun('UPDATE pr_bid_items SET is_winner = 0 WHERE bid_id = ? AND item_index = 1', [bidB]);
  const gen3 = await call('POST', `/procurement/purchase-requests/${prGId}/generate-pos`, undefined, master);
  chk('  item pemenang yang tidak bisa masuk DILAPORKAN, bukan hilang diam-diam',
    Number(gen3.json?.item_belum_masuk || 0) > 0, true);

  // ── bersih-bersih ───────────────────────────────────────────────────────
  console.log('\n8. Bersih-bersih fixture');
  for (const o of poGen) {
    await dbRun('DELETE FROM accounts_payable WHERE po_id = ?', [o.id]);
    await dbRun('DELETE FROM purchase_order_items WHERE purchase_order_id = ? OR po_id = ?', [o.id, o.id]);
    await dbRun('DELETE FROM purchase_orders WHERE id = ?', [o.id]);
  }
  await dbRun('DELETE FROM pr_bid_items WHERE bid_id IN (?, ?)', [bidA, bidB]);
  await dbRun('DELETE FROM pr_bids WHERE pr_id = ?', [prGId]);
  await dbRun('DELETE FROM purchase_requests WHERE id = ?', [prGId]);
  await dbRun('DELETE FROM vendors WHERE id = ?', [vB]);
  chk('fixture generate terhapus', (await dbAll('SELECT id FROM purchase_orders WHERE pr_id = ?', [prGId])).length, 0);

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
