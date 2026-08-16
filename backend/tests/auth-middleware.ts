process.env.JWT_SECRET = 'test-secret-abc';

import jwt from 'jsonwebtoken';
import {
  generateMobileToken, mobileAuthMiddleware, generateToken,
  anyAuthMiddleware, assertSelf, accountStatus,
} from '../src/middleware/auth';

// Middleware kini memeriksa status akun ke database (DR-P1-01). Tes ini menguji
// LOGIKA TOKEN-nya dan sengaja tetap murni — pencarian statusnya di-stub, dan
// penegakan status sungguhan diuji end-to-end di `test:rbac` #10.
accountStatus.isUserActive = async () => true;
accountStatus.isEmployeeActive = async () => true;

let pass = 0, fail = 0;
const check = (label: string, cond: boolean) => {
  if (cond) { pass++; console.log(`  ok  ${label}`); }
  else { fail++; console.log(`  FAIL ${label}`); }
};

async function run(mw: any, headers: any, params: any = {}, query: any = {}) {
  const req: any = { headers, params, query };
  let status = 200, body: any = null, nexted = false;
  const res: any = {
    status(c: number) { status = c; return res; },
    json(b: any) { body = b; return res; },
  };
  // Middleware sekarang async — hasilnya harus ditunggu, kalau tidak `nexted`
  // dibaca sebelum sempat di-set dan seluruh tes memberi hasil palsu.
  await mw(req, res, () => { nexted = true; });
  return { req, res, status, body, nexted };
}

const empToken = generateMobileToken(42);
const adminToken = generateToken(7, 1);

async function main() {
  console.log('\n1. assertSelf — kunci kebocoran slip gaji');
  {
    // simulasi GET /hr/mobile/payslip/:employee_id
    const r = await run(mobileAuthMiddleware, { authorization: `Bearer ${empToken}` }, { employee_id: '42' });
    check('token lolos', r.nexted);

    let status = 200, body: any = null;
    const res: any = { status(c: number) { status = c; return res; }, json(b: any) { body = b; return res; } };
    check('id sendiri → boleh', assertSelf(r.req, res, '42') === true);

    // karyawan 42 mencoba baca slip gaji karyawan 43
    const res2: any = { status(c: number) { status = c; return res2; }, json(b: any) { body = b; return res2; } };
    check('id orang lain → ditolak', assertSelf(r.req, res2, '43') === false);
    check('status 403', status === 403);
    check('pesan jelas', /karyawan lain/i.test(body?.error || ''));
  }

  console.log('\n2. assertSelf — upaya akal-akalan');
  {
    const r = await run(mobileAuthMiddleware, { authorization: `Bearer ${empToken}` });
    const mk = () => { const o: any = { status: () => o, json: () => o }; return o; };
    check('array (?employee_id=42&employee_id=43) ditolak', assertSelf(r.req, mk(), ['42','43']) === false);
    check('string kosong ditolak', assertSelf(r.req, mk(), '') === false);
    check('"42abc" ditolak', assertSelf(r.req, mk(), '42abc') === false);
    check('null ditolak', assertSelf(r.req, mk(), null) === false);
    check('spasi " 42 " → tetap 42, boleh', assertSelf(r.req, mk(), ' 42 ') === true);
  }

  console.log('\n3. anyAuthMiddleware — terima token mobile ATAU admin');
  {
    const m = await run(anyAuthMiddleware, { authorization: `Bearer ${empToken}` });
    check('token mobile lolos', m.nexted && m.req.employeeId === 42);
    check('userId tidak ikut terisi', m.req.userId === undefined);

    const a = await run(anyAuthMiddleware, { authorization: `Bearer ${adminToken}` });
    check('token admin lolos', a.nexted && a.req.userId === 7);
    check('employeeId tidak ikut terisi', a.req.employeeId === undefined);

    check('tanpa token ditolak', (await run(anyAuthMiddleware, {})).status === 401);
    const forged = jwt.sign({ employeeId: 42, scope: 'mobile' }, 'secret-lain');
    check('tanda tangan palsu ditolak', (await run(anyAuthMiddleware, { authorization: `Bearer ${forged}` })).status === 401);
    const empty = jwt.sign({ foo: 'bar' }, 'test-secret-abc');
    check('payload tanpa identitas ditolak', (await run(anyAuthMiddleware, { authorization: `Bearer ${empty}` })).status === 401);
  }

  console.log('\n4. Pemisahan scope tetap tegas');
  {
    check('token admin DITOLAK di mobileAuthMiddleware',
      (await run(mobileAuthMiddleware, { authorization: `Bearer ${adminToken}` })).status === 401);
    const mobileAsAdmin = jwt.sign({ userId: 9, scope: 'mobile' }, 'test-secret-abc');
    check('scope mobile tanpa employeeId ditolak',
      (await run(mobileAuthMiddleware, { authorization: `Bearer ${mobileAsAdmin}` })).status === 401);
  }

  console.log(`\n=== ${pass} lulus, ${fail} gagal ===`);
  process.exit(fail ? 1 : 0);
}

main().catch(err => { console.error('Tes gagal dijalankan:', err.message); process.exit(1); });
