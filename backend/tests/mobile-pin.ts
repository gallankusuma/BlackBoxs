import 'dotenv/config';
/**
 * Tes alur PIN login mobile (P0 #5 dari review tim reviewer).
 *
 * Prasyarat: backend jalan, dan ada 2 karyawan aktif untuk diuji.
 *   EMP_A dipakai untuk alur normal (PIN-nya di-reset oleh tes ini)
 *   EMP_B sengaja dibiarkan tanpa PIN
 *
 * Jalankan: npm run test:pin
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
  try { json = JSON.parse(text); } catch { /* respons bukan JSON */ }
  return { status: res.status, json, text };
}

async function main() {
  console.log('0. Login admin');
  const adm = await call('POST', '/auth/login', { email: ADMIN_EMAIL, password: ADMIN_PASS });
  const adminToken = adm.json?.token;
  if (!adminToken) { console.log(`  FAIL login admin: ${adm.text}`); process.exit(1); }
  pass++; console.log('  ok   login admin');

  const emps = await call('GET', '/hr/employees', undefined, adminToken);
  const empA = (emps.json?.data || []).find((e: any) => e.employee_code === EMP_A);
  if (!empA) { console.log(`  FAIL karyawan uji ${EMP_A} tidak ditemukan`); process.exit(1); }

  console.log('\n1. HR reset PIN');
  const reset = await call('POST', `/hr/employees/${empA.id}/reset-pin`, undefined, adminToken);
  const pin: string = reset.json?.pin || '';
  chk('PIN 6 digit diterbitkan', pin.length, 6);
  chk('PIN berupa angka', /^\d{6}$/.test(pin), true);
  chk('reset PIN tanpa auth admin', (await call('POST', `/hr/employees/${empA.id}/reset-pin`)).status, 401);

  console.log('\n2. Login mobile wajib PIN — celah lama tertutup');
  chk('NIK saja tanpa PIN', (await call('POST', '/hr/mobile/login', { nik: EMP_A })).status, 400);
  chk('NIK + PIN salah', (await call('POST', '/hr/mobile/login', { nik: EMP_A, pin: '000000' })).status, 401);
  const unknown = await call('POST', '/hr/mobile/login', { nik: 'TIDAK-ADA', pin: '123456' });
  chk('NIK tidak dikenal', unknown.status, 401);
  chk('pesan NIK salah = pesan PIN salah (tidak bocorkan NIK valid)',
    unknown.json?.error, 'NIK atau PIN salah');

  const login = await call('POST', '/hr/mobile/login', { nik: EMP_A, pin });
  chk('NIK + PIN benar → 200', login.status, 200);
  chk('token diterbitkan', typeof login.json?.token === 'string' && login.json.token.length > 20, true);
  chk('wajib ganti PIN di login pertama', login.json?.must_change_pin, true);
  const mobileToken: string = login.json?.token;

  console.log('\n3. Hash PIN tidak pernah bocor ke klien');
  chk('respons login tanpa mobile_pin', login.text.includes('mobile_pin'), false);
  const detail = await call('GET', `/hr/employees/${empA.id}`, undefined, adminToken);
  chk('detail karyawan tanpa mobile_pin', detail.text.includes('"mobile_pin"'), false);

  console.log('\n4. Ganti PIN');
  chk('PIN baru terlalu pendek',
    (await call('POST', '/hr/mobile/change-pin', { current_pin: pin, new_pin: '123' }, mobileToken)).status, 400);
  chk('PIN baru bukan angka',
    (await call('POST', '/hr/mobile/change-pin', { current_pin: pin, new_pin: 'abcdef' }, mobileToken)).status, 400);
  chk('PIN baru sama dengan lama',
    (await call('POST', '/hr/mobile/change-pin', { current_pin: pin, new_pin: pin }, mobileToken)).status, 400);
  chk('PIN lama salah',
    (await call('POST', '/hr/mobile/change-pin', { current_pin: '999999', new_pin: '654321' }, mobileToken)).status, 401);
  chk('tanpa token mobile',
    (await call('POST', '/hr/mobile/change-pin', { current_pin: pin, new_pin: '654321' })).status, 401);
  chk('token admin ditolak di endpoint mobile',
    (await call('POST', '/hr/mobile/change-pin', { current_pin: pin, new_pin: '654321' }, adminToken)).status, 401);
  chk('ganti PIN berhasil',
    (await call('POST', '/hr/mobile/change-pin', { current_pin: pin, new_pin: '654321' }, mobileToken)).status, 200);

  console.log('\n5. Setelah ganti PIN');
  chk('PIN lama tidak berlaku', (await call('POST', '/hr/mobile/login', { nik: EMP_A, pin })).status, 401);
  const login2 = await call('POST', '/hr/mobile/login', { nik: EMP_A, pin: '654321' });
  chk('PIN baru berlaku', login2.status, 200);
  chk('tidak diminta ganti lagi', login2.json?.must_change_pin, false);

  console.log('\n6. Karyawan tanpa PIN');
  // Pakai karyawan sementara yang dibuat sendiri, supaya tes ini tidak
  // bergantung pada urutan jalan terhadap suite lain (auth-http me-reset PIN
  // karyawan uji lain, sehingga kondisi "belum punya PIN" bisa hilang).
  const tempCode = `PINTEST-${Date.now().toString().slice(-6)}`;
  const created = await call('POST', '/hr/employees',
    { code: tempCode, name: 'Karyawan Uji PIN' }, adminToken);
  const tempId = created.json?.data?.id;
  chk('karyawan sementara dibuat', created.status, 201);

  const noPin = await call('POST', '/hr/mobile/login', { nik: tempCode, pin: '123456' });
  chk('PIN belum diatur → 403', noPin.status, 403);
  chk('kode PIN_NOT_SET', noPin.json?.code, 'PIN_NOT_SET');

  if (tempId) await call('DELETE', `/hr/employees/${tempId}`, undefined, adminToken);

  console.log('\n7. Lockout setelah 5x PIN salah');
  for (let i = 0; i < 4; i++) await call('POST', '/hr/mobile/login', { nik: EMP_A, pin: '111111' });
  chk('percobaan ke-5 → terkunci', (await call('POST', '/hr/mobile/login', { nik: EMP_A, pin: '111111' })).status, 429);
  chk('PIN benar pun ditolak saat terkunci',
    (await call('POST', '/hr/mobile/login', { nik: EMP_A, pin: '654321' })).status, 429);

  console.log(`\n=== ${pass} lulus, ${fail} gagal ===`);
  process.exit(fail ? 1 : 0);
}

main().catch(err => { console.error('Tes gagal dijalankan:', err.message); process.exit(1); });
