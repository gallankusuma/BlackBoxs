import 'dotenv/config';
/**
 * DR-P0-06b — lokasi kerja divalidasi SEBELUM prompt sidik jari, dan diikat ke
 * challenge.
 *
 * Urutan sebenarnya di browser adalah
 * `register/options → navigator.credentials.create() → register/verify`.
 * Jadi memeriksa office di handler verify — sekalipun sebelum
 * `verifyRegistrationResponse()` — tetap TERLAMBAT: passkey sudah dibuat
 * authenticator sebelum permintaan verify dikirim.
 *
 * Akibatnya nyata: Settings menawarkan kantor NONAKTIF (endpoint `/offices`
 * mengembalikan semuanya, dan layar Settings tidak menyaring), karyawan
 * memilihnya, menyelesaikan prompt sidik jari, lalu ditolak 400. Authenticator
 * menyimpan credential, server tidak — dan percobaan ulang membingungkan OS
 * karena credential-nya sudah ada di perangkat.
 *
 * Prasyarat: backend jalan + karyawan uji TEST-A. Jalankan: npm run test:office
 */
const API = process.env.API || 'http://localhost:3005/api';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'master@admin.com';
const ADMIN_PASS = process.env.ADMIN_PASS || process.env.MASTER_PASSWORD || 'master';
const EMP_A = process.env.EMP_A || 'TEST-A';

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
  const { dbGet, dbRun, dbAll } = await import('../src/config/database');
  const bersihkan: Array<() => Promise<unknown>> = [];

  console.log('0. Persiapan');
  const master: string = (await call('POST', '/auth/login', { email: ADMIN_EMAIL, password: ADMIN_PASS })).json?.token;
  if (!master) { console.log('  FAIL login master'); process.exit(1); }
  pass++; console.log('  ok   login master');

  const emp: any = await dbGet('SELECT id, code FROM employees WHERE code = ? AND status = ?', [EMP_A, 'ACTIVE']);
  if (!emp) { console.log(`  FAIL karyawan uji ${EMP_A} tidak ada`); process.exit(1); }

  // PIN direset lewat endpoint HR supaya token mobile bisa didapat.
  const reset = await call('POST', `/hr/employees/${emp.id}/reset-pin`, {}, master);
  const pin = reset.json?.pin ?? reset.json?.data?.pin;
  const login = await call('POST', '/hr/mobile/login', { nik: emp.code, pin }, master);
  let mobileTok: string = login.json?.token;
  if (!mobileTok && login.json?.must_change_pin !== undefined) {
    // Login pertama mewajibkan ganti PIN.
    const ganti = await call('POST', '/hr/mobile/change-pin',
      { nik: emp.code, pin_lama: pin, pin_baru: '246813' }, master);
    mobileTok = ganti.json?.token
      || (await call('POST', '/hr/mobile/login', { nik: emp.code, pin: '246813' })).json?.token;
  }
  chk('token mobile didapat', !!mobileTok, true);

  // Dua kantor uji: satu aktif, satu nonaktif.
  const aktif = await dbRun(
    `INSERT INTO office_locations (name, latitude, longitude, radius_m, is_active)
     VALUES (?, -6.1, 106.1, 150, 1)`, [`Kantor Aktif ${stamp}`]);
  const mati = await dbRun(
    `INSERT INTO office_locations (name, latitude, longitude, radius_m, is_active)
     VALUES (?, -6.2, 106.2, 150, 0)`, [`Kantor Nonaktif ${stamp}`]);
  bersihkan.push(() => dbRun('DELETE FROM office_locations WHERE id IN (?, ?)', [aktif.insertId, mati.insertId]));
  chk('dua kantor uji dibuat', !!aktif.insertId && !!mati.insertId, true);

  try {
    console.log('\n1. Daftar kantor untuk token MOBILE hanya yang aktif');
    const daftarMobile = await call('GET', '/webauthn/offices', undefined, mobileTok);
    const idsMobile = (daftarMobile.json?.data || []).map((o: any) => o.id);
    chk('kantor aktif ada', idsMobile.includes(aktif.insertId), true);
    chk('kantor NONAKTIF tidak ditawarkan', idsMobile.includes(mati.insertId), false);
    chk('tidak ada satu pun nonaktif di daftar',
      (daftarMobile.json?.data || []).every((o: any) => Number(o.is_active) === 1), true);

    console.log('\n2. Admin desktop tetap melihat semuanya — di sanalah kantor dikelola');
    const daftarAdmin = await call('GET', '/webauthn/offices', undefined, master);
    const idsAdmin = (daftarAdmin.json?.data || []).map((o: any) => o.id);
    chk('kantor nonaktif terlihat admin', idsAdmin.includes(mati.insertId), true);

    console.log('\n3. Kantor nonaktif ditolak DI register/options — sebelum prompt sidik jari');
    const optMati = await call('POST', '/webauthn/register/options',
      { office_location_id: mati.insertId }, mobileTok);
    chk('ditolak 400', optMati.status, 400);
    chk('kodenya OFFICE_LOCATION_REQUIRED', optMati.json?.code, 'OFFICE_LOCATION_REQUIRED');
    chk('tidak ada challenge yang dibuat',
      Number(((await dbGet(
        `SELECT COUNT(*) n FROM webauthn_challenges WHERE employee_id = ? AND type = 'registration'`,
        [emp.id])) as any)?.n), 0);

    console.log('\n4. Id kosong / tidak dikenal juga ditolak di sana');
    for (const [nama, nilai] of [['tanpa id', undefined], ['id tidak ada', 999999999]] as any[]) {
      const r = await call('POST', '/webauthn/register/options',
        nilai === undefined ? {} : { office_location_id: nilai }, mobileTok);
      chk(`${nama} ditolak 400`, r.status, 400);
    }

    console.log('\n5. Kantor aktif diterima, dan office-nya DIIKAT ke challenge');
    const optAktif = await call('POST', '/webauthn/register/options',
      { office_location_id: aktif.insertId }, mobileTok);
    chk('diterima 200', optAktif.status, 200);
    chk('membawa challenge', typeof optAktif.json?.challenge === 'string', true);
    const ch: any = await dbGet(
      `SELECT office_location_id, challenge FROM webauthn_challenges
       WHERE employee_id = ? AND type = 'registration'`, [emp.id]);
    chk('challenge menyimpan office yang dipilih', Number(ch?.office_location_id), Number(aktif.insertId));

    console.log('\n6. Verify memakai IKATAN challenge, bukan body — ini yang menutup celahnya');
    // Kalau body masih dipercaya, pemeriksaan di options bisa dilewati hanya
    // dengan mengganti body pada permintaan kedua.
    const { readFileSync } = await import('node:fs');
    const rute = readFileSync(new URL('../src/routes/webauthn.routes.ts', import.meta.url), 'utf8');
    const iVerify = rute.indexOf("router.post('/register/verify'");
    const blokVerify = rute.slice(iVerify, rute.indexOf('\n});', iVerify));
    chk('office diambil dari challengeRow',
      blokVerify.includes('resolveOfficeLocation(challengeRow.office_location_id)'), true);
    chk('office_location_id TIDAK lagi didestruktur dari body',
      /const \{[^}]*office_location_id[^}]*\} = req\.body/.test(blokVerify), false);

    console.log('\n7. Kantor dinonaktifkan di antara options dan verify → fail-closed dengan pesan re-enroll');
    await dbRun('UPDATE office_locations SET is_active = 0 WHERE id = ?', [aktif.insertId]);
    const verifyMati = await call('POST', '/webauthn/register/verify', {
      registration_response: { id: 'x', rawId: 'x', response: {}, type: 'public-key' },
      device_name: 'HP Uji',
    }, mobileTok);
    chk('ditolak 409', verifyMati.status, 409);
    chk('kodenya OFFICE_LOCATION_NONAKTIF', verifyMati.json?.code, 'OFFICE_LOCATION_NONAKTIF');
    chk('pesannya menyuruh mendaftar ulang',
      String(verifyMati.json?.error || '').toLowerCase().includes('ulangi pendaftaran'), true);
    const kredensial: any = await dbGet(
      'SELECT COUNT(*) n FROM employee_webauthn_credentials WHERE employee_id = ? AND device_name = ?',
      [emp.id, 'HP Uji']);
    chk('tidak ada kredensial yatim tersimpan', Number(kredensial?.n), 0);
    await dbRun('UPDATE office_locations SET is_active = 1 WHERE id = ?', [aktif.insertId]);

    console.log('\n8. Layar Settings menyaring, dan mengirim office saat minta options');
    const settings = readFileSync(
      new URL('../../frontend/src/views/mobile/MobileSettings.vue', import.meta.url), 'utf8');
    chk('menyaring kantor nonaktif', settings.includes("Number(o.is_active) === 1"), true);
    chk('mengirim office_location_id ke register/options',
      /register\/options'[\s\S]{0,600}office_location_id/.test(settings), true);
    const onboarding = readFileSync(
      new URL('../../frontend/src/views/mobile/MobileOnboarding.vue', import.meta.url), 'utf8');
    chk('onboarding juga mengirimnya',
      /register\/options'[\s\S]{0,600}office_location_id/.test(onboarding), true);

    console.log('\n9. Kolom ikatan benar-benar ada di skema');
    const kolom: any[] = await dbAll(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'webauthn_challenges' AND COLUMN_NAME = 'office_location_id'`,
      [process.env.DB_NAME]);
    chk('webauthn_challenges.office_location_id ada', kolom.length, 1);

  } finally {
    console.log('\n10. Bersih-bersih');
    await dbRun(`DELETE FROM webauthn_challenges WHERE employee_id = ?`, [emp.id]).catch(() => {});
    await dbRun(`DELETE FROM employee_webauthn_credentials WHERE employee_id = ? AND device_name = 'HP Uji'`,
      [emp.id]).catch(() => {});
    let sisa = 0;
    for (const h of bersihkan.reverse()) { try { await h(); } catch { sisa++; } }
    chk('kantor uji terhapus', sisa, 0);
    const tertinggal: any = await dbGet(
      'SELECT COUNT(*) n FROM office_locations WHERE name LIKE ?', [`%${stamp}%`]);
    chk('tidak ada kantor fixture tertinggal', Number(tertinggal?.n), 0);
  }

  console.log(`\n=== ${pass} lulus, ${fail} gagal ===`);
  process.exit(fail ? 1 : 0);
}
main().catch(e => { console.error('Tes gagal dijalankan:', e.message); process.exit(1); });
