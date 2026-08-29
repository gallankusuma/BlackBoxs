import 'dotenv/config';
/**
 * FIN-SUBLEDGER langkah pertama — event pembayaran sebagai source of truth.
 *
 * Tiga cacat terverifikasi di kode dan di database:
 *
 * 1. `GET /finance/project-pl` membaca tabel `projects` dan
 *    `estimator_proposals`. **Keduanya tidak ada** — tidak di produksi, tidak di
 *    dev — dan tidak ada satu pun `INSERT INTO estimator_proposals` di seluruh
 *    source. Endpointnya menjawab 500 pada setiap panggilan.
 * 2. Nilai AP/AR bebas diubah setelah dibayar, termasuk diturunkan di bawah
 *    yang sudah dibayar; `project_id` pun bisa dipindah tanpa jejak.
 * 3. Tidak ada jalur koreksi pembayaran sama sekali.
 *
 * Prasyarat: backend jalan. Jalankan: npm run test:finance-ledger
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
  return { status: res.status, json, text };
}

async function main() {
  const stamp = Date.now().toString().slice(-7);
  const { dbGet, dbAll, dbRun } = await import('../src/config/database');

  console.log('0. Persiapan');
  const master: string = (await call('POST', '/auth/login', { email: ADMIN_EMAIL, password: ADMIN_PASS })).json?.token;
  if (!master) { console.log('  FAIL login master'); process.exit(1); }
  pass++; console.log('  ok   login master');

  const namaClient = `Client Finance ${stamp}`;
  const cl = await call('POST', '/clients', { name: namaClient, status: 'active' }, master);
  const clientId = cl.json?.id ?? cl.json?.data?.id;

  // `accounts_receivable.customer_id` menunjuk `customers`, BUKAN `clients` —
  // dua master pelanggan yang hidup berdampingan. Itu bagian dari keluhan butir
  // ini (tiga sumber receivable yang tidak saling mem-posting) dan belum
  // disatukan; di sini cukup diikuti apa adanya.
  const cust: any = await dbRun(
    `INSERT INTO customers (code, name, is_active) VALUES (?, ?, 1)`,
    [`CUST-FIN-${stamp}`, namaClient]);
  const customerId = cust.insertId;

  const pr = await call('POST', '/projects',
    { client_id: clientId, title: `Project Finance ${stamp}`, status: 'open', price: 100000000 }, master);
  const projectId = pr.json?.id ?? pr.json?.data?.id;
  chk('client + project siap', !!clientId && !!projectId, true);

  // AR dibuat langsung di database: endpoint pembuatannya bukan yang diuji di
  // sini, dan fixture yang lebih sedikit bergerak lebih mudah dipercaya.
  const ar: any = await dbRun(
    `INSERT INTO accounts_receivable
       (invoice_number, customer_id, project_id, invoice_date, due_date, amount,
        paid_amount, tax_percent, tax_amount, status, description)
     VALUES (?, ?, ?, CURDATE(), CURDATE(), 10000000, 0, 11, 1100000, 'open', ?)`,
    [`INV-FIN-${stamp}`, customerId, projectId, `fixture ${stamp}`]);
  const arId = ar.insertId;
  chk('AR fixture dibuat', !!arId, true);

  try {
    console.log('\n1. Project P&L tidak lagi 500 — dulu tabelnya tidak ada');
    const pl = await call('GET', '/finance/project-pl', undefined, master);
    chk('menjawab 200', pl.status, 200);
    const baris = (pl.json?.data || []).find((x: any) => Number(x.id) === Number(projectId));
    chk('project barusan ikut terbaca', !!baris, true);
    chk('sumber nilainya dinyatakan', baris?.contract_source, 'project_budget');
    // Belum ada kontrak (project dibuat manual, bukan lewat Deal) → pakai budget.
    chk('nilai kontrak dari budget', Number(baris?.contract_value), 100000000);
    chk('sudah ditagih 10 juta', Number(baris?.billed_amount), 10000000);
    chk('belum tertagih 90 juta', Number(baris?.unbilled_amount), 90000000);
    chk('belum ada yang tertagih masuk', Number(baris?.collected_amount), 0);
    // Commitment dan actual dilaporkan terpisah, tidak dilebur.
    chk('commitment terpisah dari actual',
      baris?.committed_cost !== undefined && baris?.actual_cost !== undefined, true);
    chk('invoiced dan paid pun dibedakan',
      baris?.invoiced_cost !== undefined && baris?.paid_cost !== undefined, true);

    console.log('\n2. Pembayaran tercatat sebagai event');
    const bayar1 = await call('POST', `/finance/accounts-receivable/${arId}/payments`,
      { amount: 4000000, payment_method: 'Transfer', reference_number: `TRF-A-${stamp}` }, master);
    chk('pembayaran pertama tercatat', bayar1.status, 200);
    const arSetelah: any = await dbGet('SELECT paid_amount, status FROM accounts_receivable WHERE id = ?', [arId]);
    chk('aggregate ikut naik', Number(arSetelah?.paid_amount), 4000000);
    chk('statusnya partial', arSetelah?.status, 'partial');

    console.log('\n3. INI YANG MENENTUKAN — nilai tagihan terkunci setelah dibayar');
    const ubah = await call('PUT', `/finance/accounts-receivable/${arId}`,
      { invoice_number: `INV-FIN-${stamp}`, amount: 1000, tax_percent: 11 }, master);
    chk('ditolak 409', ubah.status, 409);
    chk('kodenya jelas', ubah.json?.code, 'POSTING_TERKUNCI');
    const arTetap: any = await dbGet('SELECT amount FROM accounts_receivable WHERE id = ?', [arId]);
    chk('nilainya tidak bergeser', Number(arTetap?.amount), 10000000);

    console.log('\n4. Status tidak bisa dimajukan lewat field bebas');
    // Menandai `paid` invoice yang baru dibayar 40% membuat aging dan dashboard
    // langsung berbohong.
    const paksa = await call('PUT', `/finance/accounts-receivable/${arId}`,
      { invoice_number: `INV-FIN-${stamp}`, amount: 10000000, tax_percent: 11, status: 'paid' }, master);
    chk('permintaannya diterima', paksa.status, 200);
    chk('tapi statusnya tetap turunan pembayaran', paksa.json?.status, 'partial');
    const arStatus: any = await dbGet('SELECT status FROM accounts_receivable WHERE id = ?', [arId]);
    chk('dan yang tersimpan pun partial', arStatus?.status, 'partial');

    console.log('\n5. Koreksi lewat pembatalan, bukan menyunting angka');
    const evAwal: any[] = await dbAll('SELECT id, amount FROM ar_payments WHERE ar_id = ? ORDER BY id', [arId]);
    const paymentId = evAwal[0]?.id;
    const batal = await call('POST',
      `/finance/accounts-receivable/${arId}/payments/${paymentId}/reverse`,
      { reason: `salah input ${stamp}` }, master);
    chk('pembatalan berhasil', batal.status, 201);
    chk('saldonya kembali nol', Number(batal.json?.data?.paid_amount), 0);
    chk('statusnya kembali unpaid', batal.json?.data?.status, 'unpaid');

    console.log('\n6. Riwayatnya UTUH — dibalik, bukan dihapus');
    const evSesudah: any[] = await dbAll(
      'SELECT id, amount, reverses_payment_id, reversed_by_payment_id FROM ar_payments WHERE ar_id = ? ORDER BY id', [arId]);
    chk('event aslinya masih ada', evSesudah.length, 2);
    chk('yang asli tetap positif', Number(evSesudah[0]?.amount), 4000000);
    chk('lawannya negatif sebesar itu', Number(evSesudah[1]?.amount), -4000000);
    chk('lawan menunjuk asalnya', Number(evSesudah[1]?.reverses_payment_id), Number(paymentId));
    chk('asal menunjuk lawannya', Number(evSesudah[0]?.reversed_by_payment_id), Number(evSesudah[1]?.id));
    chk('jumlah seluruh event = aggregate',
      evSesudah.reduce((a, b) => a + Number(b.amount), 0), 0);

    console.log('\n7. Pembatalan tidak bisa diulang atau menyeberang');
    chk('membatalkan dua kali ditolak 409', (await call('POST',
      `/finance/accounts-receivable/${arId}/payments/${paymentId}/reverse`, {}, master)).status, 409);
    chk('membalik event pembatalan ditolak 400', (await call('POST',
      `/finance/accounts-receivable/${arId}/payments/${evSesudah[1].id}/reverse`, {}, master)).status, 400);
    // Pembayaran milik tagihan lain tidak boleh dibalik dari sini.
    const ar2: any = await dbRun(
      `INSERT INTO accounts_receivable (invoice_number, customer_id, project_id, invoice_date,
        due_date, amount, paid_amount, tax_percent, tax_amount, status, description)
       VALUES (?, ?, ?, CURDATE(), CURDATE(), 5000000, 0, 11, 550000, 'open', ?)`,
      [`INV-FIN2-${stamp}`, customerId, projectId, `fixture ${stamp}`]);
    const lintas = await call('POST',
      `/finance/accounts-receivable/${ar2.insertId}/payments/${paymentId}/reverse`, {}, master);
    chk('membalik pembayaran tagihan lain ditolak 404', lintas.status, 404);
    chk('kodenya jelas', lintas.json?.code, 'PAYMENT_BUKAN_MILIK_TAGIHAN');

    console.log('\n8. Setelah dibatalkan, tagihannya bisa dikoreksi lagi');
    const koreksi = await call('PUT', `/finance/accounts-receivable/${arId}`,
      { invoice_number: `INV-FIN-${stamp}`, amount: 8000000, tax_percent: 11 }, master);
    chk('perubahan nilai kini diterima', koreksi.status, 200);
    const arKoreksi: any = await dbGet('SELECT amount FROM accounts_receivable WHERE id = ?', [arId]);
    chk('nilainya benar-benar berubah', Number(arKoreksi?.amount), 8000000);

    console.log('\n9. Kelebihan bayar & duplikat tetap ditolak');
    chk('bayar melebihi sisa ditolak 400', (await call('POST',
      `/finance/accounts-receivable/${arId}/payments`,
      { amount: 99000000, reference_number: `TRF-OVER-${stamp}` }, master)).status, 400);
    const dup1 = await call('POST', `/finance/accounts-receivable/${arId}/payments`,
      { amount: 1000000, reference_number: `TRF-DUP-${stamp}` }, master);
    chk('pembayaran sah diterima', dup1.status, 200);
    chk('referensi yang sama ditolak 409', (await call('POST',
      `/finance/accounts-receivable/${arId}/payments`,
      { amount: 1000000, reference_number: `TRF-DUP-${stamp}` }, master)).status, 409);

    console.log('\n10. Event pembayaran tidak punya jalur ubah/hapus');
    const { readdirSync, readFileSync } = await import('fs');
    const { join } = await import('path');
    const dir = join(__dirname, '..', 'src', 'routes');
    let tulis = 0;
    for (const f of readdirSync(dir).filter(x => x.endsWith('.ts'))) {
      const isi = readFileSync(join(dir, f), 'utf8');
      tulis += (isi.match(/DELETE\s+FROM\s+(ap|ar)_payments/gi) || []).length;
      // UPDATE hanya boleh untuk menautkan pembatalan, bukan mengubah nominal.
      for (const m of isi.match(/UPDATE\s+\$\{?tabelEvent\}?[\s\S]{0,80}|UPDATE\s+(ap|ar)_payments[\s\S]{0,80}/gi) || []) {
        if (!/reversed_by_payment_id/.test(m)) tulis++;
      }
    }
    chk('nol jalur ubah nominal / hapus event', tulis, 0);

    console.log('\n11. Terjaga auth');
    chk('P&L tanpa token 401', (await call('GET', '/finance/project-pl')).status, 401);
    chk('pembatalan tanpa token 401', (await call('POST',
      `/finance/accounts-receivable/${arId}/payments/${paymentId}/reverse`, {})).status, 401);

  } finally {
    console.log('\n12. Bersih-bersih');
    await dbRun('DELETE FROM ar_payments WHERE ar_id IN (SELECT id FROM (SELECT id FROM accounts_receivable WHERE invoice_number LIKE ?) t)', [`INV-FIN%${stamp}`]);
    await dbRun('DELETE FROM accounts_receivable WHERE invoice_number LIKE ?', [`INV-FIN%${stamp}`]);
    if (projectId) await dbRun('DELETE FROM client_projects WHERE id = ?', [projectId]);
    await dbRun('DELETE FROM clients WHERE name = ?', [namaClient]);
    await dbRun('DELETE FROM customers WHERE code = ?', [`CUST-FIN-${stamp}`]);
    const sisa: any = await dbGet(
      'SELECT COUNT(*) n FROM accounts_receivable WHERE invoice_number LIKE ?', [`INV-FIN%${stamp}`]);
    chk('fixture tersapu', Number(sisa?.n), 0);
    const yatim: any = await dbGet(
      `SELECT COUNT(*) n FROM ar_payments p
       LEFT JOIN accounts_receivable a ON a.id = p.ar_id WHERE a.id IS NULL`);
    chk('nol event pembayaran tanpa tagihan', Number(yatim?.n), 0);
  }

  console.log(`\n=== ${pass} lulus, ${fail} gagal ===`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
