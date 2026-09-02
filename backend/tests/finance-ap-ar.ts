import 'dotenv/config';
/**
 * AP/AR yang bisa dibuka lagi (FIN-01).
 *
 * Empat endpoint — detail AP, aging AP, detail AR, aging AR — SELALU membalas
 * 500 karena query-nya menyebut tabel `projects` yang tidak ada di basis data
 * ini (namanya `client_projects`), dengan kolom `name`/`code` yang juga tidak
 * ada (`project_name`/`project_number`). Detail AR punya cacat kedua:
 * `clients.email` tidak ada — alamatnya di `contacts`, lewat
 * `clients.primary_contact_id`.
 *
 * Ini menggigit data nyata: produksi punya 148 baris AP. Dan kegagalannya
 * TIDAK terlihat pengguna — `FinanceAP.vue` menangkap errornya lalu tetap
 * membuka modal dengan data seadanya dari baris daftar.
 *
 * Penjaga terpenting di berkas ini bukan keempat asersi status itu, melainkan
 * pemindaian di bagian akhir: **setiap tabel yang disebut SQL finance harus
 * benar-benar ada**. Itu yang menangkap seluruh kelas cacat ini, bukan hanya
 * empat yang kebetulan sudah ditemukan.
 *
 * Prasyarat: backend jalan. Jalankan: npm run test:finance-apar
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

async function main() {
  const fs = await import('fs');
  const { dbGet, dbAll, dbRun } = await import('../src/config/database');

  const master: string = (await call('POST', '/auth/login', { email: ADMIN_EMAIL, password: ADMIN_PASS })).json?.token;
  if (!master) { console.log('  FAIL login master'); process.exit(1); }
  pass++; console.log('0. ok   login master');

  const apId = (await dbGet('SELECT id FROM accounts_payable ORDER BY id DESC LIMIT 1') as any)?.id;
  const arId = (await dbGet('SELECT id FROM accounts_receivable ORDER BY id DESC LIMIT 1') as any)?.id;

  console.log('\n1. Keempat endkoin yang dulu selalu 500');
  if (apId) chk('GET /accounts-payable/:id', (await call('GET', `/finance/accounts-payable/${apId}`, undefined, master)).status, 200);
  else console.log('       (tidak ada AP di database ini — detail AP dilewati)');
  chk('GET /ap-aging', (await call('GET', '/finance/ap-aging', undefined, master)).status, 200);
  if (arId) chk('GET /accounts-receivable/:id', (await call('GET', `/finance/accounts-receivable/${arId}`, undefined, master)).status, 200);
  else console.log('       (tidak ada AR di database ini — detail AR dilewati)');
  chk('GET /ar-aging', (await call('GET', '/finance/ar-aging', undefined, master)).status, 200);

  console.log('\n2. Kolom proyek benar-benar ikut keluar, bukan sekadar tidak error');
  const aging = await call('GET', '/finance/ap-aging', undefined, master);
  const baris: any[] = aging.json?.data || [];
  chk('ap-aging mengembalikan baris', baris.length > 0, true);
  if (baris.length) {
    // Kalau join-nya dihapus supaya "tidak error", asersi ini yang menangkapnya.
    chk('  ada kolom project_name', Object.prototype.hasOwnProperty.call(baris[0], 'project_name'), true);
    chk('  ada kolom outstanding & bucket',
      ['outstanding', 'bucket'].every(k => Object.prototype.hasOwnProperty.call(baris[0], k)), true);
  }
  if (arId) {
    const arDetail = await call('GET', `/finance/accounts-receivable/${arId}`, undefined, master);
    chk('detail AR tetap membawa customer_email',
      Object.prototype.hasOwnProperty.call(arDetail.json?.data || {}, 'customer_email'), true);
  }

  console.log('\n3. Setiap tabel yang disebut SQL finance harus ada');
  // Inilah penjaga kelasnya. Nama tabel yang salah tidak menghasilkan error
  // apa pun saat build maupun tsc — hanya 500 saat endpointnya dibuka, dan di
  // layar AP kegagalan itu bahkan ditelan catch.
  const mentah = fs.readFileSync('src/routes/finance.routes.ts', 'utf8');
  // Komentar JS dibuang LEBIH DULU: blok JSDoc di berkas ini mengutip potongan
  // SQL memakai backtick sebagai tanda kutip markdown, dan tanpa langkah ini
  // kutipan itu terbaca sebagai template literal. Persis itu yang membuat
  // `INSERT INTO estimator_proposals` di sebuah komentar dilaporkan sebagai
  // tabel hantu.
  const src = mentah.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/[^\n]*$/gm, ' ');
  // HANYA isi template literal yang dipindai. Percobaan pertama memindai
  // seluruh berkas dan melaporkan sepuluh "tabel hantu" yang ternyata prosa
  // biasa: "update AP", "from child item status", "from selected schedule",
  // bahkan `INSERT INTO estimator_proposals` di dalam komentar. Komentar SQL
  // di dalam literal juga dibuang, karena isinya kalimat manusia juga.
  const disebut = new Set<string>();
  for (const lit of src.match(/`[^`]*`/g) || []) {
    // `FOR UPDATE OF x` klausa penguncian, bukan tabel bernama "of".
    const sql = lit.replace(/--[^\n]*/g, ' ').replace(/FOR\s+UPDATE(\s+OF\s+\w+)?/gi, ' ');
    if (!/\b(FROM|JOIN|INTO|UPDATE)\b/i.test(sql)) continue;
    for (const m of sql.matchAll(/\b(?:FROM|JOIN|INTO|UPDATE)\s+([a-z_][a-z0-9_]*)/gi)) {
      const t = m[1].toLowerCase();
      if (['select', 'dual', 'set', 'values', 'json_table'].includes(t)) continue;
      disebut.add(t);
    }
  }
  const ada = new Set((await dbAll(
    `SELECT TABLE_NAME AS t FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE()`
  ) as any[]).map(r => String(r.t).toLowerCase()));
  const hantu = [...disebut].filter(t => !ada.has(t)).sort();
  chk(`${disebut.size} tabel disebut, yang tidak ada`, hantu, []);

  console.log('\n4. Tidak ada endpoint GET finance yang 5xx');
  // Dulu 9 dari 26 membalas 500: empat karena tabel `projects` yang tidak ada,
  // tiga karena cogs_tracking tidak punya total_cost/cost_per_unit/
  // quantity_produced, dan dua karena profitability_tracking tidak punya
  // gross_margin_pct/period/total_revenue. Tidak satu pun muncul saat tsc.
  const jalurGet = [...src.matchAll(/^router\.get\('([^']+)'/gm)].map(m => m[1]);
  const rusak: string[] = [];
  for (const jalur of jalurGet) {
    const nyata = jalur
      .replace(/:id/g, jalur.includes('receivable') ? String(arId || 1) : String(apId || 1))
      .replace(/:[a-zA-Z_]+/g, '1');
    const r = await call('GET', `/finance${nyata}`, undefined, master);
    if (r.status >= 500) rusak.push(`${r.status} ${nyata}`);
  }
  rusak.forEach(x => console.log('       ' + x));
  chk(`${jalurGet.length} endpoint GET, yang 5xx`, rusak, []);

  console.log('\n5. Unggahan finance diperiksa isinya, bukan ekstensinya');
  const fr = await call('POST', '/finance/fund-requests', {
    purpose: `Uji unggah ${Date.now().toString().slice(-6)}`,
    needed_date: new Date().toISOString().slice(0, 10),
    items: [{ amount: 1000 }],
  }, master);
  const frId = fr.json?.data?.id ?? fr.json?.id;
  if (frId) {
    const kirim = async (nama: string, tipe: string, isi: Buffer) => {
      const fd = new FormData();
      fd.append('file', new Blob([new Uint8Array(isi)], { type: tipe }), nama);
      const r = await fetch(`${API}/finance/fund-requests/${frId}/documents`, {
        method: 'POST', headers: { Authorization: `Bearer ${master}` }, body: fd,
      });
      return r.status;
    };
    chk('berkas .pdf yang isinya teks biasa ditolak',
      await kirim('menyamar.pdf', 'application/pdf', Buffer.from('ini bukan pdf sama sekali')), 400);
    chk('PDF sungguhan diterima',
      await kirim('asli.pdf', 'application/pdf',
        Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.from('uji')])), 201);
    await dbRun('DELETE FROM fund_request_documents WHERE fund_request_id = ?', [frId]);
    await dbRun('DELETE FROM fund_request_items WHERE fund_request_id = ?', [frId]);
    await dbRun('DELETE FROM fund_requests WHERE id = ?', [frId]);
  } else {
    console.log('       (fund request uji gagal dibuat — bagian ini dilewati)');
  }

  console.log('\n6. Tabel tidak dibuat saat modul rute di-import');
  // Dilarang eksplisit di CLAUDE.md: itu berjalan sebelum initializeDatabase(),
  // sehingga foreign key ke tabel inti gagal di database baru.
  const semuaRute = fs.readdirSync('src/routes').filter((f: string) => f.endsWith('.ts'));
  const nakal = semuaRute.filter((f: string) =>
    /CREATE TABLE/i.test(fs.readFileSync(`src/routes/${f}`, 'utf8')));
  chk(`${semuaRute.length} berkas rute, yang membuat tabel sendiri`, nakal, []);
  chk('payment_proofs dibuat lewat ensure*Schema',
    /CREATE TABLE IF NOT EXISTS payment_proofs/.test(fs.readFileSync('src/config/database.ts', 'utf8')), true);

  console.log('\n7. Kegagalan detail tidak disembunyikan di layar');
  // Justru catch inilah yang membuat 500 di atas bertahan lama tanpa ketahuan.
  // Diperiksa DI DALAM openDetail saja. Versi pertama asersi ini memindai
  // seluruh berkas, dan karena keduanya memang punya catch ber-showToast di
  // tempat lain, ia tetap lolos walau catch openDetail dikembalikan menjadi
  // penelan senyap. Asersi yang selalu benar bukan penjaga.
  for (const f of ['FinanceAP.vue', 'FinanceAR.vue']) {
    const layar = fs.readFileSync(`../frontend/src/views/${f}`, 'utf8');
    const i = layar.indexOf('async function openDetail');
    chk(`  ${f} punya openDetail`, i >= 0, true);
    const badan = i >= 0 ? layar.slice(i, layar.indexOf('\n}', i)) : '';
    chk(`  ${f}: kegagalan detail diberitahukan`, /showToast\('error'/.test(badan), true);
  }

  console.log(`\n${pass} lulus, ${fail} gagal`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch(e => { console.error(e); process.exit(1); });
