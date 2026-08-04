process.env.JWT_SECRET = 'test-secret-abc';

import jwt from 'jsonwebtoken';
import {
  generateMobileToken, mobileAuthMiddleware, generateToken,
  anyAuthMiddleware, assertSelf,
} from '../src/middleware/auth';

let pass = 0, fail = 0;
const check = (label: string, cond: boolean) => {
  if (cond) { pass++; console.log(`  ok  ${label}`); }
  else { fail++; console.log(`  FAIL ${label}`); }
};

function run(mw: any, headers: any, params: any = {}, query: any = {}) {
  const req: any = { headers, params, query };
  let status = 200, body: any = null, nexted = false;
  const res: any = {
    status(c: number) { status = c; return res; },
    json(b: any) { body = b; return res; },
  };
  mw(req, res, () => { nexted = true; });
  return { req, res, status, body, nexted };
}

const empToken = generateMobileToken(42);
const adminToken = generateToken(7, 1);

console.log('\n1. assertSelf — kunci kebocoran slip gaji');
{
  // simulasi GET /hr/mobile/payslip/:employee_id
  const r = run(mobileAuthMiddleware, { authorization: `Bearer ${empToken}` }, { employee_id: '42' });
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
  const r = run(mobileAuthMiddleware, { authorization: `Bearer ${empToken}` });
  const mk = () => { const o: any = { status: () => o, json: () => o }; return o; };
  check('array (?employee_id=42&employee_id=43) ditolak', assertSelf(r.req, mk(), ['42','43']) === false);
  check('string kosong ditolak', assertSelf(r.req, mk(), '') === false);
  check('"42abc" ditolak', assertSelf(r.req, mk(), '42abc') === false);
  check('null ditolak', assertSelf(r.req, mk(), null) === false);
  check('spasi " 42 " → tetap 42, boleh', assertSelf(r.req, mk(), ' 42 ') === true);
}

console.log('\n3. anyAuthMiddleware — terima token mobile ATAU admin');
{
  const m = run(anyAuthMiddleware, { authorization: `Bearer ${empToken}` });
  check('token mobile lolos', m.nexted && m.req.employeeId === 42);
  check('userId tidak ikut terisi', m.req.userId === undefined);

  const a = run(anyAuthMiddleware, { authorization: `Bearer ${adminToken}` });
  check('token admin lolos', a.nexted && a.req.userId === 7);
  check('employeeId tidak ikut terisi', a.req.employeeId === undefined);

  check('tanpa token ditolak', run(anyAuthMiddleware, {}).status === 401);
  const forged = jwt.sign({ employeeId: 42, scope: 'mobile' }, 'secret-lain');
  check('tanda tangan palsu ditolak', run(anyAuthMiddleware, { authorization: `Bearer ${forged}` }).status === 401);
  const empty = jwt.sign({ foo: 'bar' }, 'test-secret-abc');
  check('payload tanpa identitas ditolak', run(anyAuthMiddleware, { authorization: `Bearer ${empty}` }).status === 401);
}

console.log('\n4. Pemisahan scope tetap tegas');
{
  check('token admin DITOLAK di mobileAuthMiddleware',
    run(mobileAuthMiddleware, { authorization: `Bearer ${adminToken}` }).status === 401);
  const mobileAsAdmin = jwt.sign({ userId: 9, scope: 'mobile' }, 'test-secret-abc');
  check('scope mobile tanpa employeeId ditolak',
    run(mobileAuthMiddleware, { authorization: `Bearer ${mobileAsAdmin}` }).status === 401);
}

console.log(`\n=== ${pass} lulus, ${fail} gagal ===`);
process.exit(fail ? 1 : 0);
