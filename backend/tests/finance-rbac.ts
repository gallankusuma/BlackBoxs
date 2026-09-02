import 'dotenv/config';
/**
 * RBAC modul finance (FIN-RBAC-01).
 *
 * Sebelum ini: 64 endpoint finance hanya memakai `authMiddleware`, nol
 * `requirePermission`, dan hanya SATU tempat di seluruh modul yang membaca
 * `user_level` — itu pun untuk mengedit, bukan menyetujui.
 *
 * Terukur, bukan diduga: user **level 1 tanpa role** membaca AP/AR/fund
 * request/kasbon/payroll, membuat fund request, **menyetujui fund request-nya
 * sendiri** (jalur itu memanggil autoPayApFromFundRequestItem), dan mencatat
 * pembayaran Rp 250.000 ke sebuah AP.
 *
 * Tiga hal yang dijaga di sini:
 *
 *   1. **Setiap endpoint finance punya requirePermission.** Yang baru
 *      ditambahkan tanpa gerbang akan lolos tsc dan build tanpa keluhan.
 *   2. **Setiap permission yang disebut benar-benar ada di katalog.** Ini
 *      kesalahan yang paling berbahaya di berkas ini: string yang salah ketik
 *      tidak dimiliki SIAPA PUN (Admin sekalipun, karena
 *      ensureAdminRoleHasAllPermissions hanya memetakan yang ada di katalog),
 *      jadi endpointnya terkunci untuk semua orang kecuali master — tanpa satu
 *      pun error.
 *   3. **Yang tidak berhak benar-benar ditolak, yang berhak tetap lewat.**
 *
 * Prasyarat: backend jalan. Jalankan: npm run test:finance-rbac
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
  const stamp = Date.now().toString().slice(-7);
  const fs = await import('fs');
  const { dbGet, dbAll, dbRun } = await import('../src/config/database');

  const master: string = (await call('POST', '/auth/login', { email: ADMIN_EMAIL, password: ADMIN_PASS })).json?.token;
  if (!master) { console.log('  FAIL login master'); process.exit(1); }
  pass++; console.log('0. ok   login master');

  // ── 1. Tidak ada endpoint finance yang tanpa gerbang ────────────────────
  console.log('\n1. Setiap endpoint finance punya requirePermission');
  const src = fs.readFileSync('src/routes/finance.routes.ts', 'utf8');
  const semua = [...src.matchAll(/^router\.(get|post|put|patch|delete)\('([^']+)'/gm)];
  const tanpaGerbang = semua
    .map(m => ({ m, baris: src.slice(m.index!, src.indexOf('\n', m.index!)) }))
    .filter(x => !x.baris.includes('requirePermission'))
    .map(x => `${x.m[1].toUpperCase()} ${x.m[2]}`);
  chk(`${semua.length} endpoint, yang tanpa gerbang`, tanpaGerbang, []);

  // ── 2. Setiap permission yang disebut ada di katalog ────────────────────
  console.log('\n2. Permission yang disebut benar-benar ada di katalog');
  const dipakai = new Set<string>();
  for (const m of src.matchAll(/requirePermission\(([^)]*)\)/g)) {
    for (const p of m[1].matchAll(/'([^']+)'/g)) dipakai.add(p[1]);
  }
  const katalog = new Set((await dbAll(
    `SELECT CONCAT(resource,'.',action) AS k FROM permissions`
  ) as any[]).map(r => String(r.k)));
  const karangan = [...dipakai].filter(k => !katalog.has(k)).sort();
  chk(`${dipakai.size} permission dipakai, yang tidak ada di katalog`, karangan, []);

  // ── 3. Yang tidak berhak ditolak ────────────────────────────────────────
  console.log('\n3. User level 1 tanpa role kini DITOLAK');
  const email = `rbacfin.${stamp}@test.local`;
  const u = await call('POST', '/users', { name: 'RBAC Finance', email, password: 'secret123', user_level: 1 }, master);
  const uid = u.json?.data?.id ?? u.json?.id;
  const polos: string = (await call('POST', '/auth/login', { email, password: 'secret123' })).json?.token;

  const apId = (await dbGet('SELECT id FROM accounts_payable ORDER BY id DESC LIMIT 1') as any)?.id || 1;
  for (const [label, method, jalur, body] of [
    ['baca AP', 'GET', '/finance/accounts-payable', undefined],
    ['baca payroll (data gaji)', 'GET', '/finance/payroll-requests', undefined],
    ['baca kasbon', 'GET', '/finance/kasbon-requests', undefined],
    ['buat fund request', 'POST', '/finance/fund-requests', { purpose: 'x', needed_date: '2026-09-02', items: [{ amount: 1 }] }],
    ['setujui fund request', 'PUT', '/finance/fund-requests/1/approve', {}],
    ['catat pembayaran AP', 'POST', `/finance/accounts-payable/${apId}/payments`, { amount: 1, payment_date: '2026-09-02' }],
    ['setujui kasbon', 'PUT', '/finance/kasbon-requests/1/approve', {}],
    ['setujui payroll', 'PUT', '/finance/payroll-requests/1/approve', {}],
  ] as [string, string, string, any][]) {
    const r = await call(method, jalur, body, polos);
    chk(`  ${label}`, r.status, 403);
  }

  // ── 4. Yang berhak tetap lewat ──────────────────────────────────────────
  console.log('\n4. Role dengan permission yang tepat tetap bisa bekerja');
  const roleId = (await dbRun('INSERT INTO roles (name, description, level, active) VALUES (?, ?, 3, 1)',
    [`RBAC Finance Uji ${stamp}`, 'role sementara uji RBAC finance'])).insertId;
  // Diberi PERSIS permission yang dipakai gerbang-gerbang di berkas rute.
  for (const k of dipakai) {
    const row: any = await dbGet(
      `SELECT id FROM permissions WHERE CONCAT(resource,'.',action) = ?`, [k]);
    if (row) await dbRun('INSERT IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)', [roleId, row.id]);
  }
  await dbRun('UPDATE users SET role_id = ? WHERE id = ?', [roleId, uid]);

  chk('baca AP → 200', (await call('GET', '/finance/accounts-payable', undefined, polos)).status, 200);
  chk('baca payroll → 200', (await call('GET', '/finance/payroll-requests', undefined, polos)).status, 200);
  chk('baca kasbon → 200', (await call('GET', '/finance/kasbon-requests', undefined, polos)).status, 200);
  // Bukan 403 = gerbangnya lewat; 404/400 di bawahnya urusan handler, bukan hak akses.
  chk('setujui fund request bukan lagi 403',
    (await call('PUT', '/finance/fund-requests/999999/approve', {}, polos)).status !== 403, true);
  chk('setujui payroll bukan lagi 403',
    (await call('PUT', '/finance/payroll-requests/999999/approve', {}, polos)).status !== 403, true);

  // ── 5. Gerbang approve tidak boleh cukup dengan hak baca ────────────────
  //
  // Ini yang menangkap gerbang yang TERLALU LONGGAR. Bagian 3 memakai user
  // tanpa permission apa pun, jadi gerbang yang dilonggarkan jadi `view` pun
  // tetap menolaknya; bagian 4 memberi SELURUH permission, jadi lolos juga.
  // Keduanya buta terhadap approve yang diturunkan menjadi view — hanya role
  // "boleh lihat, tidak boleh setujui" ini yang melihatnya.
  console.log('\n5. Hak baca saja TIDAK cukup untuk menyetujui');
  const roleBaca = (await dbRun('INSERT INTO roles (name, description, level, active) VALUES (?, ?, 2, 1)',
    [`RBAC Finance Baca ${stamp}`, 'role uji: hanya boleh melihat'])).insertId;
  for (const k of [...dipakai].filter(k => /\.(view|export)$/.test(k))) {
    const row: any = await dbGet(`SELECT id FROM permissions WHERE CONCAT(resource,'.',action) = ?`, [k]);
    if (row) await dbRun('INSERT IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)', [roleBaca, row.id]);
  }
  await dbRun('UPDATE users SET role_id = ? WHERE id = ?', [roleBaca, uid]);

  chk('masih boleh membaca AP', (await call('GET', '/finance/accounts-payable', undefined, polos)).status, 200);
  for (const [label, method, jalur] of [
    ['setujui fund request', 'PUT', '/finance/fund-requests/999999/approve'],
    ['setujui kasbon', 'PUT', '/finance/kasbon-requests/999999/approve'],
    ['setujui payroll', 'PUT', '/finance/payroll-requests/999999/approve'],
    ['catat pembayaran AP', 'POST', `/finance/accounts-payable/${apId}/payments`],
  ] as [string, string, string][]) {
    chk(`  ${label} ditolak`, (await call(method, jalur, {}, polos)).status, 403);
  }

  // ── bersih-bersih ───────────────────────────────────────────────────────
  console.log('\n6. Bersih-bersih fixture');
  await dbRun('DELETE FROM users WHERE id = ?', [uid]);
  await dbRun('DELETE FROM role_permissions WHERE role_id IN (?, ?)', [roleId, roleBaca]);
  await dbRun('DELETE FROM roles WHERE id IN (?, ?)', [roleId, roleBaca]);
  chk('role & user uji terhapus', (await dbAll('SELECT id FROM roles WHERE id = ?', [roleId])).length, 0);

  console.log(`\n${pass} lulus, ${fail} gagal`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch(e => { console.error(e); process.exit(1); });
