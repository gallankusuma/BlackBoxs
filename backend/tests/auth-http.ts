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
const ADMIN_PASS = process.env.ADMIN_PASS || 'master';
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

  console.log('\n6. Registrasi publik & JWT di query string');
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
