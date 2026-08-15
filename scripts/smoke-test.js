#!/usr/bin/env node
/**
 * Smoke test pasca-deploy — memastikan aplikasi yang baru naik benar-benar
 * melayani, bukan sekadar prosesnya hidup.
 *
 * Kenapa perlu: `pm2 status online` dan `health 200` tidak membuktikan aplikasi
 * bisa bekerja. Pada 12 Agustus 2026 proses terlihat online sementara backend
 * tidak bisa membuat koneksi database baru sama sekali. Yang membedakan hanya
 * permintaan yang benar-benar menyentuh database.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * SEPENUHNYA READ-ONLY. Tidak membuat, mengubah, atau menghapus data apa pun,
 * jadi aman dijalankan terhadap produksi kapan saja.
 *
 * Konsekuensinya: yang diuji adalah "apakah jalurnya hidup dan terjaga", bukan
 * "apakah angkanya benar". Kebenaran angka diuji oleh `npm run test:all` di
 * lingkungan dev, yang memang membuat data.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Pakai:
 *   node scripts/smoke-test.js                              # default produksi
 *   BASE_URL=http://localhost:3005 node scripts/smoke-test.js
 *
 * Keluar dengan kode 1 kalau ada yang gagal, sehingga bisa dipakai sebagai gate.
 */
const BASE = (process.env.BASE_URL || 'https://blackboxs.io').replace(/\/$/, '');
const TIMEOUT = Number(process.env.SMOKE_TIMEOUT || 20000);

let pass = 0;
let fail = 0;
const failures = [];

function ok(label, detail = '') {
  pass++;
  console.log(`  ok    ${label}${detail ? ` → ${detail}` : ''}`);
}

function bad(label, detail) {
  fail++;
  failures.push(`${label} — ${detail}`);
  console.log(`  GAGAL ${label} → ${detail}`);
}

async function req(path, opts = {}) {
  const url = path.startsWith('http') ? path : BASE + path;
  try {
    const res = await fetch(url, {
      ...opts,
      signal: AbortSignal.timeout(TIMEOUT),
      headers: { ...(opts.body ? { 'Content-Type': 'application/json' } : {}), ...(opts.headers || {}) },
    });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* bukan JSON */ }
    return { status: res.status, text, json, headers: res.headers };
  } catch (e) {
    return { status: 0, text: '', json: null, error: e.name === 'TimeoutError' ? 'timeout' : e.message };
  }
}

/** Status yang diharapkan; `oneOf` supaya tidak rapuh terhadap detail kecil. */
function expect(label, got, oneOf, extra = '') {
  const list = Array.isArray(oneOf) ? oneOf : [oneOf];
  if (list.includes(got.status)) ok(label, `HTTP ${got.status}${extra ? ` ${extra}` : ''}`);
  else bad(label, `HTTP ${got.status}${got.error ? ` (${got.error})` : ''}, diharapkan ${list.join('/')}`);
}

(async () => {
  console.log(`Smoke test → ${BASE}\n`);

  console.log('1. Aplikasi melayani');
  const home = await req('/');
  expect('halaman utama', home, 200);
  if (home.status === 200) {
    if (/<div id="app"|<title/i.test(home.text)) ok('HTML aplikasi terkirim');
    else bad('HTML aplikasi terkirim', 'balasan 200 tapi bukan halaman aplikasi');
  }
  expect('health endpoint', await req('/api/health'), 200);

  console.log('\n2. Database benar-benar terjangkau lewat aplikasi');
  // Login dengan akun yang pasti tidak ada. 401 membuktikan tabel `users`
  // terbaca; 500 berarti query gagal — persis gejala kredensial DB tak cocok.
  const login = await req('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'smoke-test@invalid.local', password: 'bukan-password' }),
  });
  if (login.status === 401) ok('query ke tabel users berhasil', 'HTTP 401 (kredensial ditolak)');
  else if (login.status === 500) bad('query ke tabel users', 'HTTP 500 — kemungkinan backend tidak bisa konek database');
  else bad('query ke tabel users', `HTTP ${login.status}, diharapkan 401`);

  console.log('\n3. Otorisasi ditegakkan');
  // Tanpa token semuanya harus 401. Kalau 200, ada endpoint terbuka; kalau 404,
  // route-nya hilang dari build.
  for (const [label, path] of [
    ['daftar proposal', '/api/estimator/proposals'],
    ['daftar purchase order', '/api/procurement/purchase-orders'],
    ['daftar user', '/api/users'],
    ['daftar aset', '/api/assets'],
  ]) {
    const r = await req(path);
    if (r.status === 401) ok(`${label} menolak tanpa token`);
    else if (r.status === 404) bad(`${label} menolak tanpa token`, 'HTTP 404 — route tidak terdaftar');
    else bad(`${label} menolak tanpa token`, `HTTP ${r.status} — seharusnya 401`);
  }

  console.log('\n4. Endpoint kunci terdaftar (bukan 404)');
  // Kalkulator MTO dan preview batch adalah jalur yang dipakai layar estimator;
  // kalau hilang dari build, angka di layar berhenti muncul tanpa error jelas.
  for (const [label, path, method] of [
    ['kalkulator MTO', '/api/estimator/mto/preview', 'POST'],
    ['kalkulator MTO batch', '/api/estimator/mto/preview-batch', 'POST'],
    ['penerimaan barang', '/api/procurement/goods-receipts', 'GET'],
  ]) {
    const r = await req(path, { method, ...(method === 'POST' ? { body: '{}' } : {}) });
    if (r.status === 404) bad(`${label} terdaftar`, 'HTTP 404 — route hilang dari build');
    else ok(`${label} terdaftar`, `HTTP ${r.status}`);
  }

  console.log('\n5. Berkas unggahan terlayani');
  const uploads = await req('/uploads/');
  // 403 (direktori tidak boleh dilihat isinya) maupun 404 sama-sama wajar.
  // Yang tidak wajar adalah 502/000 — berarti nginx atau backend tidak menjawab.
  if ([403, 404, 200, 301].includes(uploads.status)) ok('jalur /uploads menjawab', `HTTP ${uploads.status}`);
  else bad('jalur /uploads menjawab', `HTTP ${uploads.status}`);

  console.log(`\n${'='.repeat(46)}`);
  console.log(`${pass} lulus, ${fail} gagal`);
  if (fail) {
    console.log('\nYang gagal:');
    failures.forEach(f => console.log(`  - ${f}`));
    console.log('\nSmoke test GAGAL — aplikasi kemungkinan tidak sehat.');
    process.exit(1);
  }
  console.log('Semua lolos.');
})().catch(err => {
  console.error('Smoke test tidak bisa dijalankan:', err.message);
  process.exit(1);
});
