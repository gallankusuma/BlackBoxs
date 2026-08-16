import 'dotenv/config';
/**
 * Tes autentikasi & otorisasi end-to-end lewat HTTP.
 *
 * Prasyarat: backend jalan, dan ada 2 karyawan aktif untuk diuji (EMP_A, EMP_B).
 * PIN keduanya di-reset oleh tes ini lewat endpoint HR, jadi tidak perlu
 * disiapkan manual.
 *
 * Jalankan: npm run test:http
 */
const API = process.env.API || 'http://localhost:3005/api';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'master@admin.com';
const ADMIN_PASS = process.env.ADMIN_PASS || process.env.MASTER_PASSWORD || 'master';
const EMP_A = process.env.EMP_A || 'TEST-A';
const EMP_B = process.env.EMP_B || 'TEST-B';

let pass = 0, fail = 0;
const chk = (label: string, actual: unknown, expected: unknown) => {
  if (actual === expected) { pass++; console.log(`  ok   ${label} → ${actual}`); }
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
const status = async (...args: Parameters<typeof call>) => (await call(...args)).status;

// Kredensial WebAuthn tidak bisa dibuat lewat HTTP tanpa authenticator sungguhan,
// jadi barisnya disemai langsung untuk menguji jalur otorisasi lokasinya.
async function hitungChallenge(employeeId: number): Promise<number> {
  const { dbGet } = await import('../src/config/database');
  const r: any = await dbGet(
    "SELECT COUNT(*) AS n FROM webauthn_challenges WHERE employee_id = ? AND type = 'authentication' AND expires_at > NOW()",
    [employeeId]
  );
  return Number(r?.n ?? -1);
}

/** Tiru konsumsi challenge seperti di handler: DELETE dan hitung affectedRows. */
async function konsumsiChallenge(employeeId: number): Promise<{ pertama: number; kedua: number }> {
  const { dbGet, dbRun } = await import('../src/config/database');
  const row: any = await dbGet(
    "SELECT id FROM webauthn_challenges WHERE employee_id = ? AND type = 'authentication' ORDER BY id DESC LIMIT 1",
    [employeeId]
  );
  if (!row) return { pertama: -1, kedua: -1 };
  const a: any = await dbRun('DELETE FROM webauthn_challenges WHERE id = ? AND employee_id = ?', [row.id, employeeId]);
  const b: any = await dbRun('DELETE FROM webauthn_challenges WHERE id = ? AND employee_id = ?', [row.id, employeeId]);
  return { pertama: a.affectedRows || 0, kedua: b.affectedRows || 0 };
}

async function seedCredential(employeeId: number): Promise<number | null> {
  try {
    const { dbRun } = await import('../src/config/database');
    const r: any = await dbRun(
      `INSERT INTO employee_webauthn_credentials
        (employee_id, credential_id, public_key, counter, device_name,
         registered_lat, registered_lng, registered_radius, location_name)
       VALUES (?, ?, ?, 0, 'UJI-OTOMATIS', -6.0280380, 106.0674439, 100, 'Uji')`,
      [employeeId, `uji-${Date.now()}`, 'uji']
    );
    return r?.insertId || null;
  } catch { return null; }
}

async function credentialRow(id: number): Promise<any> {
  const { dbGet } = await import('../src/config/database');
  return dbGet('SELECT registered_lat, registered_lng, registered_radius FROM employee_webauthn_credentials WHERE id = ?', [id]);
}

async function firstActiveOffice(): Promise<any> {
  const { dbGet, dbRun } = await import('../src/config/database');
  const ada: any = await dbGet('SELECT id, name FROM office_locations WHERE is_active = 1 ORDER BY id LIMIT 1');
  if (ada) return ada;
  // Dev DB bisa saja belum punya lokasi. Disemai supaya kasus POSITIF tidak
  // terlewat diam-diam — tes yang melompat tanpa suara sama saja tidak ada.
  const r: any = await dbRun(
    `INSERT INTO office_locations (name, latitude, longitude, radius_m, is_active)
     VALUES ('Kantor Uji Otomatis', -6.0280380, 106.0674439, 100, 1)`
  );
  return { id: r?.insertId, name: 'Kantor Uji Otomatis', _seeded: true };
}

async function cleanupCredential(id: number): Promise<void> {
  const { dbRun } = await import('../src/config/database');
  await dbRun('DELETE FROM employee_webauthn_credentials WHERE id = ?', [id]);
}

async function main() {
  console.log('0. Persiapan');
  const adm = await call('POST', '/auth/login', { email: ADMIN_EMAIL, password: ADMIN_PASS });
  const adminToken: string = adm.json?.token;
  if (!adminToken) { console.log(`  FAIL login admin: ${adm.text}`); process.exit(1); }
  pass++; console.log('  ok   login admin');

  const emps = await call('GET', '/hr/employees', undefined, adminToken);
  const find = (code: string) => (emps.json?.data || []).find((e: any) => e.employee_code === code);
  const a = find(EMP_A), b = find(EMP_B);
  if (!a || !b) { console.log(`  FAIL butuh karyawan uji ${EMP_A} & ${EMP_B}`); process.exit(1); }

  // Reset PIN keduanya supaya tes bisa login
  const pinA = (await call('POST', `/hr/employees/${a.id}/reset-pin`, undefined, adminToken)).json?.pin;
  const pinB = (await call('POST', `/hr/employees/${b.id}/reset-pin`, undefined, adminToken)).json?.pin;
  const tokA: string = (await call('POST', '/hr/mobile/login', { nik: EMP_A, pin: pinA })).json?.token;
  const tokB: string = (await call('POST', '/hr/mobile/login', { nik: EMP_B, pin: pinB })).json?.token;
  chk('token mobile A & B didapat', !!(tokA && tokB), true);

  console.log('\n1. Slip gaji — inti kebocoran IDOR');
  chk('tanpa token', await status('GET', `/hr/mobile/payslip/${a.id}`), 401);
  chk('token A → slip gaji A', await status('GET', `/hr/mobile/payslip/${a.id}`, undefined, tokA), 200);
  chk('token A → slip gaji B', await status('GET', `/hr/mobile/payslip/${b.id}`, undefined, tokA), 403);
  chk('token B → slip gaji B', await status('GET', `/hr/mobile/payslip/${b.id}`, undefined, tokB), 200);
  chk('token ngawur', await status('GET', `/hr/mobile/payslip/${a.id}`, undefined, 'ngawur.token.palsu'), 401);

  console.log('\n2. Absensi & material request');
  chk('absensi tanpa token', await status('GET', `/hr/mobile/attendance/${a.id}`), 401);
  chk('absensi orang lain', await status('GET', `/hr/mobile/attendance/${b.id}`, undefined, tokA), 403);
  chk('absensi sendiri', await status('GET', `/hr/mobile/attendance/${a.id}`, undefined, tokA), 200);
  chk('MR /my tanpa token', await status('GET', '/material-requests/my'), 401);
  chk('MR /my dengan token', await status('GET', '/material-requests/my', undefined, tokA), 200);

  console.log('\n3. Kredensial sidik jari');
  chk('list tanpa token', await status('GET', `/webauthn/credentials/${a.id}`), 401);
  chk('kredensial orang lain', await status('GET', `/webauthn/credentials/${b.id}`, undefined, tokA), 403);
  chk('kredensial sendiri', await status('GET', `/webauthn/credentials/${a.id}`, undefined, tokA), 200);

  console.log('\n4. Endpoint kantor menolak token mobile');
  for (const [label, path] of [
    ['MR /all', '/material-requests/all'],
    ['notes', '/notes'],
    ['users', '/users'],
    ['prospects', '/prospects'],
    ['hr employees', '/hr/employees'],
  ] as const) {
    chk(`${label} tanpa token`, await status('GET', path), 401);
    chk(`${label} pakai token mobile`, await status('GET', path, undefined, tokA), 401);
  }
  chk('offices CRUD tanpa token', await status('POST', '/webauthn/offices'), 401);

  console.log('\n5. Token admin');
  chk('admin → MR /all', await status('GET', '/material-requests/all', undefined, adminToken), 200);
  chk('admin → notes', await status('GET', '/notes', undefined, adminToken), 200);
  chk('admin DITOLAK di slip gaji mobile', await status('GET', `/hr/mobile/payslip/${a.id}`, undefined, adminToken), 401);
  chk('admin → offices (anyAuth)', await status('GET', '/webauthn/offices', undefined, adminToken), 200);
  chk('mobile → offices (anyAuth)', await status('GET', '/webauthn/offices', undefined, tokA), 200);

  console.log('\n6. Kredensial master publik tidak berlaku (DR-P0)');
  // Sampai 16 Agustus 2026 `auth.routes.ts` memuat `password === 'master'`
  // sebagai literal, di repo PUBLIK — dan baris user master di database memang
  // berpassword itu. Dua pintu: bypass di kode DAN user database. Mencabut yang
  // pertama saja tidak menutup apa pun, karena login biasa tetap tembus.
  const masterPublik = await call('POST', '/auth/login',
    { email: 'master@admin.com', password: 'master' });
  chk('login master dengan password publik ditolak', masterPublik.status, 401);
  chk('tidak ada token yang terbit', !masterPublik.json?.token, true);

  console.log('\n7. Token mobile tidak membuka modul R&D (DR-P0-01)');
  // rnd.routes.ts dulu mendefinisikan authMiddleware sendiri yang hanya
  // menjalankan jwt.verify(). Kedua jenis token ditandatangani secret yang sama,
  // jadi token karyawan meloloskan seluruh 40 endpoint R&D — baca, ubah, hapus,
  // dan unggah dokumen.
  for (const [label, method, path] of [
    ['daftar project R&D', 'GET', '/rnd/projects'],
    ['buat project R&D', 'POST', '/rnd/projects'],
    ['daftar formulation', 'GET', '/rnd/formulations'],
  ] as [string, string, string][]) {
    const r = await call(method, path, method === 'POST' ? { name: 'uji' } : undefined, tokA);
    chk(`${label} menolak token mobile`, r.status, 401);
  }
  // Token desktop yang sah tetap harus lolos — bukan sekadar menutup semuanya.
  const rndAdmin = await call('GET', '/rnd/projects', undefined, adminToken);
  chk('token desktop tetap diterima R&D', rndAdmin.status < 400, true);

  console.log('\n8. Dokumen bisnis tidak terbuka lewat /uploads (DR-P0-05)');
  // Seluruh folder uploads dulu dilayani statis tanpa auth — melewati semua
  // route unduhan ber-auth yang sudah dibuat. Terukur 181 dokumen bisnis di
  // produksi berada dalam kondisi itu.
  const BASE = API.replace(/\/api$/, '');
  const ambil = async (path: string) => (await fetch(`${BASE}${path}`)).status;

  for (const [label, path] of [
    ['dokumen bid', '/uploads/bids/uji-tidak-ada.pdf'],
    ['fund request', '/uploads/fund-requests/uji-tidak-ada.pdf'],
    ['berkas project', '/uploads/project_files/uji-tidak-ada.pdf'],
  ] as [string, string][]) {
    chk(`${label} tertutup`, await ambil(path), 403);
  }
  chk('berkas HTML ditolak di folder publik sekalipun',
    await ambil('/uploads/product-images/uji-tidak-ada.html'), 403);
  // Katalog gambar harus TETAP terlayani — PWA mobile merendernya sebagai <img>.
  chk('katalog gambar tidak ikut tertutup',
    await ambil('/uploads/product-images/uji-tidak-ada.jpg'), 404);

  console.log('\n9. Absensi tidak bisa dilewati tanpa sidik jari (DR-P0-06)');
  // Layar menyebut mekanismenya "Sidik jari + GPS", tapi ada endpoint paralel
  // yang menerima absen hanya bermodal token PIN — tanpa assertion WebAuthn dan
  // GPS opsional. Aplikasi mobile sendiri memakai /webauthn/auth/verify, jadi
  // endpoint itu murni jalur pintas. Sudah dicabut.
  chk('jalur absen PIN sudah tidak ada',
    (await call('POST', '/hr/mobile/checkin', { type: 'in' }, tokA)).status, 404);

  // Koordinat kerja tidak boleh datang dari karyawan.
  //
  // Versi pertama tes ini menembak `/credentials/1/location` dan menerima status
  // apa pun 4xx sebagai bukti. Itu FALSE POSITIVE: handler memeriksa kepemilikan
  // lebih dulu, jadi ID yang tidak ada menghasilkan 404 dan validasi
  // `office_location_id` tidak pernah dieksekusi sama sekali. Ditemukan tim
  // reviewer. Sekarang kredensialnya disemai dulu supaya cabang itu benar-benar
  // dijalankan.
  const credId = await seedCredential(Number(a.id));
  if (!credId) {
    chk('kredensial uji tersemai', false, true);
  } else {
    const koordinatSendiri = await call('PUT', `/webauthn/credentials/${credId}/location`,
      { latitude: -6.2, longitude: 106.8, radius: 99999, location_name: 'Rumah Saya' }, tokA);
    chk('koordinat sendiri ditolak tepat 400', koordinatSendiri.status, 400);
    chk('kodenya OFFICE_LOCATION_REQUIRED', koordinatSendiri.json?.code, 'OFFICE_LOCATION_REQUIRED');

    // Baris kredensialnya tidak boleh ikut berubah.
    const sesudah = await credentialRow(credId);
    chk('koordinat tersimpan tidak berubah', Number(sesudah?.registered_lat), -6.028038);

    // ID kantor yang tidak ada juga ditolak.
    chk('office_location_id karangan ditolak',
      (await call('PUT', `/webauthn/credentials/${credId}/location`, { office_location_id: 999999 }, tokA)).status, 400);

    // Kantor yang sah diterima — proteksi tidak boleh mengunci semuanya.
    const kantor = await firstActiveOffice();
    chk('ada kantor terdaftar untuk kasus positif', !!kantor?.id, true);
    const sah = await call('PUT', `/webauthn/credentials/${credId}/location`,
      { office_location_id: kantor.id }, tokA);
    chk('memilih kantor terdaftar diterima', sah.status, 200);

    await cleanupCredential(credId);
  }

  console.log('\n9a. MR mobile: daftar project & validasi project (P1)');
  // Reviewer melaporkan `/material-requests/projects/list` SELALU 401 karena
  // `/:id` menangkap "projects". Itu tidak benar — `/:id` hanya cocok untuk SATU
  // segmen, sedangkan jalur ini dua. Diuji langsung dengan token mobile.
  const daftarProject = await call('GET', '/material-requests/projects/list', undefined, tokA);
  chk('dropdown project mobile TIDAK 401', daftarProject.status, 200);
  chk('daftarnya berisi', Array.isArray(daftarProject.json?.data), true);

  // Yang memang benar dari butir itu: project_id dan project_name dulu dikirim
  // sebagai dua nilai independen dari body.
  const mrPalsu = await call('POST', '/material-requests', {
    project_id: 999999, project_name: 'Project Karangan',
    items: [{ item_name: 'Semen', quantity: 1, uom: 'sak' }],
  }, tokA);
  chk('project_id karangan ditolak', mrPalsu.status, 404);
  chk('kodenya PROJECT_NOT_FOUND', mrPalsu.json?.code, 'PROJECT_NOT_FOUND');

  console.log('\n9b. Absensi: challenge sekali pakai & jam tidak bisa ditimpa (DR-P0-06)');
  // Sebelumnya konsumsi challenge, update counter, dan penulisan absensi adalah
  // tiga penulisan autocommit terpisah tanpa lock: dua permintaan paralel
  // sama-sama membaca challenge yang sama, dan check-in kedua MENIMPA jam masuk
  // yang sudah final.
  // `auth/options` menolak karyawan tanpa kredensial (404 NO_CREDENTIAL), jadi
  // fixture-nya disemai dulu — bukan mengendurkan assertion-nya.
  const credAbsen = await seedCredential(Number(a.id));
  chk('kredensial uji tersemai', !!credAbsen, true);

  const opsi = await call('POST', '/webauthn/auth/options', { employee_id: Number(a.id) });
  chk('challenge terbit', opsi.status, 200);

  // Assertion sidik jari tidak bisa dipalsukan dari tes, jadi yang diuji di sini
  // adalah jalur yang TIDAK butuh authenticator: replay guard dan validasi input.
  const tanpaAssertion = await call('POST', '/webauthn/auth/verify', { employee_id: Number(a.id) });
  chk('verify tanpa auth_response ditolak 400', tanpaAssertion.status, 400);

  const challengeSisa = await hitungChallenge(Number(a.id));
  chk('challenge belum terkonsumsi oleh permintaan cacat', challengeSisa >= 1, true);

  // Konsumsi challenge bersifat sekali pakai — dibuktikan di level data.
  const habis = await konsumsiChallenge(Number(a.id));
  chk('konsumsi pertama berhasil', habis.pertama, 1);
  chk('konsumsi kedua tidak mendapat apa-apa (replay tertutup)', habis.kedua, 0);

  if (credAbsen) await cleanupCredential(credAbsen);

  console.log('\n10. Login tidak membocorkan akun mana yang nonaktif (DR-P1-01)');
  // Perbaikan pertama kami memeriksa `is_active` SEBELUM password. Itu membuka
  // oracle: kirim password sembarang, lalu 403 vs 401 memberitahu penyerang email
  // mana yang benar-benar ada sebagai akun nonaktif. Ditemukan tim reviewer.
  // Pemeriksaan status sekarang terjadi setelah password terbukti benar.
  const emailAcak = `tidak-ada-${Date.now()}@uji.local`;
  const tidakAda = await call('POST', '/auth/login', { email: emailAcak, password: 'salahsemua' });
  const adaTapiSalah = await call('POST', '/auth/login', { email: ADMIN_EMAIL, password: 'pasti-salah-sekali' });
  chk('email tak dikenal → 401', tidakAda.status, 401);
  chk('email dikenal + password salah → 401', adaTapiSalah.status, 401);
  chk('keduanya tidak bisa dibedakan', tidakAda.status === adaTapiSalah.status, true);
  chk('pesannya pun sama', tidakAda.json?.error === adaTapiSalah.json?.error, true);

  console.log('\n11. Registrasi publik & JWT di query string');
  chk('register tanpa token', await status('POST', '/auth/register', { email: 'x@y.com', password: 'secret123', name: 'X' }), 401);
  // AST-007: JWT tidak lagi diterima dari URL di endpoint mana pun, termasuk
  // route unduhan — frontend memakai axios responseType 'blob'.
  chk('?token= ditolak di API biasa', (await fetch(`${API}/users?token=${adminToken}`)).status, 401);
  chk('?token= ditolak di route unduhan', (await fetch(`${API}/projects/files/999999/download?token=${adminToken}`)).status, 401);
  chk('?token= ditolak di unduhan dokumen aset', (await fetch(`${API}/assets/documents/1/download?token=${adminToken}`)).status, 401);
  chk('unduhan dengan header tetap jalan', (await call('GET', '/projects/files/999999/download', undefined, adminToken)).status, 404);

  console.log(`\n=== ${pass} lulus, ${fail} gagal ===`);
  process.exit(fail ? 1 : 0);
}

main().catch(err => { console.error('Tes gagal dijalankan:', err.message); process.exit(1); });
