import 'dotenv/config';
/**
 * Tes penegakan RBAC di backend (P0 #4 dari review).
 *
 * Membuat dua user uji lewat API (role tanpa permission, dan role admin),
 * lalu membuktikan bahwa pemegang token desktop biasa TIDAK bisa mengelola
 * user/role/permission. Fixture dibersihkan di akhir.
 *
 * Prasyarat: backend jalan. Jalankan: npm run test:rbac
 */
const API = process.env.API || 'http://localhost:3005/api';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'master@admin.com';
const ADMIN_PASS = process.env.ADMIN_PASS || process.env.MASTER_PASSWORD || 'master';

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
const status = async (...a: Parameters<typeof call>) => (await call(...a)).status;

// ─── Fixture payroll terisolasi (DR-P0-04) ────────────────────────────────────
// Dibuat sendiri, bukan memakai karyawan yang sudah ada, supaya tes tidak
// pernah menyentuh kasbon atau slip gaji orang sungguhan.
/**
 * Fixture approval terisolasi: rule + step + dua request + empat user berbeda hak.
 * Seluruhnya dibuat sendiri supaya tidak menyentuh konfigurasi approval nyata.
 */
/** Role yang HANYA punya hr.employees.view — tidak punya hr.payroll.view. */
/** Dua notifikasi: satu milik user uji, satu milik orang lain. */
/** MR uji beserta satu item; `notes` sengaja diisi TEKS BEBAS, bukan JSON. */
/** Semua `permKey` yang dipakai menu sidebar. */
async function permKeysDariLayout(): Promise<string[]> {
  const fs = await import('fs');
  const path = await import('path');
  const berkas = path.resolve(__dirname, '../../frontend/src/components/Layout.vue');
  if (!fs.existsSync(berkas)) return [];
  const isi = fs.readFileSync(berkas, 'utf8');
  const ketemu = isi.match(/permKey: '[^']+'/g) || [];
  return Array.from(new Set(ketemu.map(m => m.replace(/permKey: '|'/g, ''))));
}

/** Resource yang dipakai menu tapi tidak ada di tabel `permissions`. */
async function resourceTidakDikenal(keys: string[]): Promise<string[]> {
  const { dbAll } = await import('../src/config/database');
  const rows: any[] = await dbAll('SELECT DISTINCT resource FROM permissions');
  const katalog = new Set(rows.map(r => String(r.resource)));
  return keys.filter(k => !katalog.has(k));
}

async function seedMaterialRequest(catatan: string): Promise<any> {
  try {
    const { dbRun, dbGet } = await import('../src/config/database');
    const tag = `UJI-MR-${Date.now()}`;
    const emp: any = await dbGet(`SELECT id, name FROM employees WHERE status='ACTIVE' ORDER BY id LIMIT 1`);
    if (!emp) return null;
    const mr: any = await dbRun(
      `INSERT INTO material_requests (mr_number, employee_id, employee_name, priority, status, notes)
       VALUES (?, ?, ?, 'normal', 'pending', ?)`,
      [tag, emp.id, emp.name, catatan]
    );
    await dbRun(
      `INSERT INTO material_request_items (mr_id, item_name, quantity, uom) VALUES (?, 'Semen Uji', 5, 'sak')`,
      [mr.insertId]
    );
    return { tag, mrId: mr.insertId };
  } catch { return null; }
}

async function materialRequestRow(id: number): Promise<any> {
  const { dbGet } = await import('../src/config/database');
  return dbGet('SELECT status, notes, linked_pr_id, linked_pr_number FROM material_requests WHERE id = ?', [id]);
}

async function countPrForMr(mrId: number): Promise<number> {
  const { dbGet } = await import('../src/config/database');
  const r: any = await dbGet(
    `SELECT COUNT(*) AS n FROM purchase_requests WHERE JSON_EXTRACT(notes, '$.source_mr_id') = ?`, [mrId]
  );
  return Number(r?.n ?? -1);
}

async function cleanupMaterialRequest(fx: any): Promise<number> {
  const { dbRun, dbGet } = await import('../src/config/database');
  await dbRun(`DELETE FROM purchase_requests WHERE JSON_EXTRACT(notes, '$.source_mr_id') = ?`, [fx.mrId]);
  await dbRun('DELETE FROM material_request_items WHERE mr_id = ?', [fx.mrId]);
  await dbRun('DELETE FROM material_requests WHERE id = ?', [fx.mrId]);
  const sisa: any = await dbGet(
    `SELECT (SELECT COUNT(*) FROM material_requests WHERE id = ?)
          + (SELECT COUNT(*) FROM material_request_items WHERE mr_id = ?) AS n`,
    [fx.mrId, fx.mrId]
  );
  return Number(sisa?.n ?? -1);
}

async function seedNotifications(): Promise<any> {
  try {
    const { dbRun, dbGet } = await import('../src/config/database');
    const tag = `UJI-NOTIF-${Date.now()}`;
    const lain: any = await dbGet('SELECT id FROM users WHERE email = ? LIMIT 1', [ADMIN_EMAIL]);
    const pemilikUji: any = await dbGet('SELECT id FROM users WHERE email LIKE ? ORDER BY id DESC LIMIT 1', ['rbac.plain.%']);
    if (!lain?.id || !pemilikUji?.id) return null;

    const a: any = await dbRun(
      `INSERT INTO notifications (recipient_id, title, message, type) VALUES (?, ?, ?, 'info')`,
      [lain.id, tag, 'milik orang lain']
    );
    const b: any = await dbRun(
      `INSERT INTO notifications (recipient_id, title, message, type) VALUES (?, ?, ?, 'info')`,
      [pemilikUji.id, tag, 'milik sendiri']
    );
    return { tag, milikOrangLain: a.insertId, milikSendiri: b.insertId };
  } catch { return null; }
}

async function notificationExists(id: number): Promise<boolean> {
  const { dbGet } = await import('../src/config/database');
  const r: any = await dbGet('SELECT 1 AS ok FROM notifications WHERE id = ?', [id]);
  return !!r;
}

async function cleanupNotifications(n: any): Promise<number> {
  const { dbRun, dbGet } = await import('../src/config/database');
  await dbRun('DELETE FROM notifications WHERE title = ?', [n.tag]);
  const sisa: any = await dbGet('SELECT COUNT(*) AS n FROM notifications WHERE title = ?', [n.tag]);
  return Number(sisa?.n ?? -1);
}

async function seedDirectoryRole(): Promise<any> {
  try {
    const { dbRun, dbGet } = await import('../src/config/database');
    const tag = `UJI-DIR-${Date.now()}`;
    const r: any = await dbRun(`INSERT INTO roles (name, description) VALUES (?, 'fixture uji')`, [tag]);
    const perm: any = await dbGet(
      `SELECT id FROM permissions WHERE resource = 'hr.employees' AND action = 'view' LIMIT 1`
    );
    if (perm) await dbRun('INSERT INTO role_permissions (role_id, permission_id) VALUES (?, ?)', [r.insertId, perm.id]);
    const bcrypt = await import('bcrypt');
    const email = `${tag}@uji.local`.toLowerCase();
    const u: any = await dbRun(
      `INSERT INTO users (username, email, password, full_name, role_id, user_level, is_active)
       VALUES (?, ?, ?, 'Uji Direktori', ?, 1, 1)`,
      [email, email, await bcrypt.hash('secret123', 10), r.insertId]
    );
    const login = await call('POST', '/auth/login', { email, password: 'secret123' });
    return { tag, roleId: r.insertId, userId: u.insertId, token: login.json?.token };
  } catch { return null; }
}

async function cleanupDirectoryRole(dir: any): Promise<number> {
  const { dbRun, dbGet } = await import('../src/config/database');
  await dbRun('DELETE FROM role_permissions WHERE role_id = ?', [dir.roleId]);
  await dbRun('DELETE FROM users WHERE id = ?', [dir.userId]);
  await dbRun('DELETE FROM roles WHERE id = ?', [dir.roleId]);
  const sisa: any = await dbGet(
    `SELECT (SELECT COUNT(*) FROM users WHERE id = ?) + (SELECT COUNT(*) FROM roles WHERE id = ?) AS n`,
    [dir.userId, dir.roleId]
  );
  return Number(sisa?.n ?? -1);
}

async function seedApprovalFixture(): Promise<any> {
  try {
    const { dbRun, dbGet } = await import('../src/config/database');
    // Sapu sisa run sebelumnya lebih dulu — tes idempoten tidak boleh menumpuk.
    await cleanupApprovalDebris();
    const tag = `UJI-APPR-${Date.now()}`;

    const buatUser = async (suffix: string, resourcePrefix: string | null) => {
      const email = `${tag}-${suffix}@uji.local`.toLowerCase();
      const r: any = await dbRun(
        `INSERT INTO roles (name, description) VALUES (?, 'fixture uji')`, [`${tag}-${suffix}`]
      );
      const roleId = r.insertId;
      if (resourcePrefix) {
        // Beri SATU permission approve pada resource yang diminta.
        const perm: any = await dbGet(
          `SELECT id FROM permissions WHERE resource LIKE CONCAT(?, '.%') AND action = 'approve' LIMIT 1`,
          [resourcePrefix]
        );
        if (perm) await dbRun('INSERT INTO role_permissions (role_id, permission_id) VALUES (?, ?)', [roleId, perm.id]);
      }
      const bcrypt = await import('bcrypt');
      const u: any = await dbRun(
        `INSERT INTO users (username, email, password, full_name, role_id, user_level, is_active)
         VALUES (?, ?, ?, 'Uji Approval', ?, 1, 1)`,
        [email, email, await bcrypt.hash('secret123', 10), roleId]
      );
      return { id: u.insertId, roleId, email };
    };

    const userSalahModul = await buatUser('salahmodul', 'assets');
    const userBenarTakDitugaskan = await buatUser('takditugaskan', 'finance');
    const userDitugaskan = await buatUser('ditugaskan', 'finance');
    const userDelegasi = await buatUser('delegasi', 'finance');
    const userPemberi = await buatUser('pemberi', 'finance');

    const rule: any = await dbRun(
      `INSERT INTO approval_rules (module, name, sequence, is_active) VALUES ('finance', ?, 1, 1)`, [tag]
    );
    const ruleId = rule.insertId;
    // can_reject = 0: boleh menyetujui, tidak boleh menolak.
    await dbRun(
      `INSERT INTO approval_rule_steps (rule_id, step_order, approver_user_id, can_reject) VALUES (?, 1, ?, 0)`,
      [ruleId, userDitugaskan.id]
    );

    // Rule kedua untuk menguji delegasi, dengan approver berbeda.
    const rule2: any = await dbRun(
      `INSERT INTO approval_rules (module, name, sequence, is_active) VALUES ('finance', ?, 2, 1)`, [`${tag}-2`]
    );
    await dbRun(
      `INSERT INTO approval_rule_steps (rule_id, step_order, approver_user_id, can_reject) VALUES (?, 1, ?, 1)`,
      [rule2.insertId, userPemberi.id]
    );
    await dbRun(
      `INSERT INTO approval_delegations (from_user_id, to_user_id, module, start_date, end_date, is_active)
       VALUES (?, ?, 'finance', CURDATE(), DATE_ADD(CURDATE(), INTERVAL 7 DAY), 1)`,
      [userPemberi.id, userDelegasi.id]
    );

    const buatRequest = async (rid: number) => {
      const r: any = await dbRun(
        `INSERT INTO approval_requests (request_number, module, entity_type, entity_id, requester_id, current_step, status, notes, rule_id)
         VALUES (?, 'finance', 'fund_request', 999999, 1, 1, 'pending', ?, ?)`,
        [`${tag}-${rid}-${Math.random().toString(36).slice(2, 7)}`, tag, rid]
      );
      return r.insertId;
    };

    return {
      tag, ruleId, ruleId2: rule2.insertId,
      requestId: await buatRequest(ruleId),
      requestId2: await buatRequest(rule2.insertId),
      userSalahModul, userBenarTakDitugaskan, userDitugaskan, userDelegasi, userPemberi,
    };
  } catch (e: any) {
    // Pembuatan fixture bisa gagal di tengah — dan yang terlanjur dibuat akan
    // menggantung selamanya kalau tidak dibereskan di sini. Itu persis yang
    // terjadi pada percobaan pertama: 5 user, 5 role, dan 2 rule tertinggal
    // karena `af` bernilai null sehingga cleanup di `finally` tidak punya apa pun
    // untuk dihapus.
    console.log(`  (fixture approval gagal: ${e.message} — membersihkan sisa)`);
    try { await cleanupApprovalDebris(); } catch { /* biar tidak menutupi error asli */ }
    return null;
  }
}

/** Sapu bersih sisa fixture approval dari run mana pun yang gagal separuh. */
async function cleanupApprovalDebris(): Promise<void> {
  const { dbRun } = await import('../src/config/database');
  await dbRun(`DELETE FROM approval_delegations WHERE from_user_id IN (SELECT id FROM users WHERE email LIKE 'uji-appr-%')`);
  await dbRun(`DELETE FROM approval_actions WHERE request_id IN (SELECT id FROM approval_requests WHERE notes LIKE 'UJI-APPR-%')`);
  await dbRun(`DELETE FROM approval_requests WHERE notes LIKE 'UJI-APPR-%'`);
  await dbRun(`DELETE FROM approval_rule_steps WHERE rule_id IN (SELECT id FROM approval_rules WHERE name LIKE 'UJI-APPR-%')`);
  await dbRun(`DELETE FROM approval_rules WHERE name LIKE 'UJI-APPR-%'`);
  await dbRun(`DELETE FROM role_permissions WHERE role_id IN (SELECT id FROM roles WHERE name LIKE 'UJI-APPR-%')`);
  await dbRun(`DELETE FROM users WHERE email LIKE 'uji-appr-%'`);
  await dbRun(`DELETE FROM roles WHERE name LIKE 'UJI-APPR-%'`);
}

async function loginAs(email: string): Promise<string> {
  const r = await call('POST', '/auth/login', { email, password: 'secret123' });
  return r.json?.token || '';
}

async function countActions(requestId: number): Promise<number> {
  const { dbGet } = await import('../src/config/database');
  const r: any = await dbGet('SELECT COUNT(*) n FROM approval_actions WHERE request_id = ?', [requestId]);
  return Number(r?.n ?? -1);
}

/** Hapus seluruh fixture approval; kembalikan sisa baris (harus 0). */
async function cleanupApprovalFixture(af: any): Promise<number> {
  const { dbRun, dbGet } = await import('../src/config/database');
  const reqIds = [af.requestId, af.requestId2].filter(Boolean);
  const userIds = [af.userSalahModul, af.userBenarTakDitugaskan, af.userDitugaskan, af.userDelegasi, af.userPemberi]
    .filter(Boolean).map((u: any) => u.id);
  const roleIds = [af.userSalahModul, af.userBenarTakDitugaskan, af.userDitugaskan, af.userDelegasi, af.userPemberi]
    .filter(Boolean).map((u: any) => u.roleId);

  if (reqIds.length) {
    await dbRun(`DELETE FROM approval_actions WHERE request_id IN (${reqIds.map(() => '?').join(',')})`, reqIds);
    await dbRun(`DELETE FROM approval_requests WHERE id IN (${reqIds.map(() => '?').join(',')})`, reqIds);
  }
  await dbRun('DELETE FROM approval_delegations WHERE module = ? AND to_user_id IN (?, ?)',
    ['finance', af.userDelegasi?.id || 0, af.userPemberi?.id || 0]);
  await dbRun('DELETE FROM approval_rule_steps WHERE rule_id IN (?, ?)', [af.ruleId, af.ruleId2]);
  await dbRun('DELETE FROM approval_rules WHERE id IN (?, ?)', [af.ruleId, af.ruleId2]);
  if (roleIds.length) await dbRun(`DELETE FROM role_permissions WHERE role_id IN (${roleIds.map(() => '?').join(',')})`, roleIds);
  if (userIds.length) await dbRun(`DELETE FROM users WHERE id IN (${userIds.map(() => '?').join(',')})`, userIds);
  if (roleIds.length) await dbRun(`DELETE FROM roles WHERE id IN (${roleIds.map(() => '?').join(',')})`, roleIds);

  const sisa: any = await dbGet(
    `SELECT (SELECT COUNT(*) FROM approval_requests WHERE notes = ?)
          + (SELECT COUNT(*) FROM approval_rules WHERE name LIKE CONCAT(?, '%'))
          + (SELECT COUNT(*) FROM users WHERE email LIKE CONCAT(?, '%')) AS n`,
    [af.tag, af.tag, af.tag.toLowerCase()]
  );
  return Number(sisa?.n ?? -1);
}

async function seedPayrollFixture(): Promise<any> {
  try {
    const { dbRun } = await import('../src/config/database');
    const tandaUnik = `UJI-PAYROLL-${Date.now()}`;

    const emp: any = await dbRun(
      `INSERT INTO employees (code, name, position, status, salary_type, basic_rate, tunjangan_rate, ot_rate, salary)
       VALUES (?, 'Karyawan Uji Payroll', 'Uji', 'ACTIVE', 'daily', 100000, 0, 0, 0)`,
      [tandaUnik]
    );
    const employeeId = emp.insertId;

    // Karyawan kedua — kasbonnya TIDAK boleh tersentuh.
    const lain: any = await dbRun(
      `INSERT INTO employees (code, name, position, status, salary_type, basic_rate, salary)
       VALUES (?, 'Karyawan Uji Pembanding', 'Uji', 'ACTIVE', 'daily', 100000, 0)`,
      [`${tandaUnik}-B`]
    );
    const employeeLainId = lain.insertId;

    // Satu hari absensi di dalam periode 12/2099 (cut-off 26 Nov – 25 Des).
    //
    // `status='present'` dan `timesheet_value` WAJIB: kalkulator menjumlahkan
    // `timesheet_value * 8` dan hanya menghitung baris ber-status `present`.
    // Fixture pertama kami tidak mengisi keduanya, jadi hasilnya nol — dan itu
    // membuat tesnya lolos tanpa membuktikan server benar-benar menghitung.
    await dbRun(
      `INSERT INTO attendance_logs (employee_id, date, check_in, check_out, status, timesheet_value, overtime_hours)
       VALUES (?, '2099-12-01', '08:00:00', '16:00:00', 'present', 1, 0)`,
      [employeeId]
    );

    const k1: any = await dbRun(
      `INSERT INTO salary_advances (employee_id, amount, remaining, description, advance_date, status)
       VALUES (?, 50000, 50000, ?, '2099-12-01', 'pending')`,
      [employeeId, tandaUnik]
    );
    const k2: any = await dbRun(
      `INSERT INTO salary_advances (employee_id, amount, remaining, description, advance_date, status)
       VALUES (?, 70000, 70000, ?, '2099-12-01', 'pending')`,
      [employeeLainId, `${tandaUnik}-B`]
    );

    return {
      tandaUnik, employeeId, employeeLainId,
      kasbonSendiriId: k1.insertId, kasbonLuarId: k2.insertId,
    };
  } catch (e: any) {
    console.log(`  (fixture payroll gagal dibuat: ${e.message})`);
    return null;
  }
}

async function advanceRow(id: number): Promise<any> {
  const { dbGet } = await import('../src/config/database');
  return dbGet('SELECT status, remaining FROM salary_advances WHERE id = ?', [id]);
}

/** Hapus seluruh fixture; kembalikan jumlah baris yang MASIH tersisa (harus 0). */
async function cleanupPayrollFixture(fx: any): Promise<number> {
  const { dbRun, dbGet } = await import('../src/config/database');
  const ids = [fx.employeeId, fx.employeeLainId];
  await dbRun(`DELETE FROM payslip_records WHERE employee_id IN (?, ?)`, ids);
  await dbRun(`DELETE FROM salary_advances WHERE employee_id IN (?, ?)`, ids);
  await dbRun(`DELETE FROM attendance_logs WHERE employee_id IN (?, ?)`, ids);
  await dbRun(`DELETE FROM employees WHERE id IN (?, ?)`, ids);
  const sisa: any = await dbGet(
    `SELECT (SELECT COUNT(*) FROM employees WHERE id IN (?, ?))
          + (SELECT COUNT(*) FROM salary_advances WHERE employee_id IN (?, ?))
          + (SELECT COUNT(*) FROM payslip_records WHERE employee_id IN (?, ?))
          + (SELECT COUNT(*) FROM attendance_logs WHERE employee_id IN (?, ?)) AS n`,
    [...ids, ...ids, ...ids, ...ids]
  );
  return Number(sisa?.n ?? -1);
}

async function main() {
  const stamp = Date.now().toString().slice(-6);
  const cleanup: number[] = [];

  console.log('0. Persiapan');
  const master: string = (await call('POST', '/auth/login', { email: ADMIN_EMAIL, password: ADMIN_PASS })).json?.token;
  if (!master) { console.log('  FAIL login master'); process.exit(1); }
  pass++; console.log('  ok   login master');

  // Role tanpa satu pun permission
  const role = await call('POST', '/roles',
    { code: `RBACT${stamp}`, name: `RBACTest-${stamp}`, description: 'role uji tanpa permission' }, master);
  const roleId = role.json?.data?.id ?? role.json?.id;
  chk('role uji dibuat', role.status, 201);

  const plainEmail = `rbac.plain.${stamp}@test.local`;
  const plain = await call('POST', '/users',
    { name: 'RBAC Plain', email: plainEmail, password: 'secret123', role_id: roleId, user_level: 1 }, master);
  chk('user tanpa permission dibuat', plain.status, 201);
  if (plain.json?.data?.id) cleanup.push(plain.json.data.id);

  const plainToken: string = (await call('POST', '/auth/login', { email: plainEmail, password: 'secret123' })).json?.token;
  chk('user uji bisa login', typeof plainToken === 'string' && plainToken.length > 20, true);

  console.log('\n1. Token desktop biasa TIDAK boleh mengelola user');
  chk('buat user', await status('POST', '/users',
    { name: 'X', email: `x.${stamp}@test.local`, password: 'secret123' }, plainToken), 403);
  chk('ubah user lain', await status('PUT', `/users/${plain.json?.data?.id}`, { name: 'Diubah' }, plainToken), 403);
  chk('hapus user lain', await status('DELETE', '/users/1', undefined, plainToken), 403);
  chk('lihat detail user', await status('GET', '/users/1', undefined, plainToken), 403);

  console.log('\n2. Tidak boleh mengelola role & permission');
  chk('buat role', await status('POST', '/roles', { name: 'Jahat' }, plainToken), 403);
  chk('hapus role', await status('DELETE', `/roles/${roleId}`, undefined, plainToken), 403);
  chk('ubah permission role', await status('POST', `/roles/${roleId}/permissions`, { permissions: [] }, plainToken), 403);
  chk('buat permission', await status('POST', '/permissions', { resource: 'x', action: 'y' }, plainToken), 403);
  chk('hapus permission', await status('DELETE', '/permissions/1', undefined, plainToken), 403);
  chk('lihat daftar permission', await status('GET', '/permissions', undefined, plainToken), 403);

  console.log('\n3. Yang bersifat self-service tetap boleh');
  chk('lihat profil sendiri', await status('GET', '/users/profile/me', undefined, plainToken), 200);
  chk('ganti password sendiri', await status('PUT', '/users/change-password',
    { currentPassword: 'secret123', newPassword: 'secret456' }, plainToken), 200);

  console.log('\n4. Daftar user tetap terbaca (dipakai dropdown), tapi tanpa data pribadi');
  const listPlain = await call('GET', '/users', undefined, plainToken);
  chk('daftar user bisa dibaca', listPlain.status, 200);
  const first = (listPlain.json?.data || [])[0] || {};
  chk('email disembunyikan', 'email' in first, false);
  chk('telepon disembunyikan', 'phone' in first, false);
  chk('nama tetap ada', 'full_name' in first, true);

  const listMaster = await call('GET', '/users', undefined, master);
  chk('master tetap melihat email', 'email' in ((listMaster.json?.data || [])[0] || {}), true);

  console.log('\n5. Eskalasi lewat user_level ditutup');
  // Role kedua yang SENGAJA diberi admin.users.edit, dibangun lewat API supaya
  // tes tidak bergantung pada katalog permission bawaan instalasi.
  const editorRole = await call('POST', '/roles',
    { code: `RBACE${stamp}`, name: `RBACEditor-${stamp}` }, master);
  const editorRoleId = editorRole.json?.data?.id;

  const allPerms = (await call('GET', '/permissions', undefined, master)).json?.data || [];
  let editPermId = allPerms.find((p: any) => p.resource === 'admin.users' && p.action === 'edit')?.id;
  if (!editPermId) {
    const createdPerm = await call('POST', '/permissions',
      { resource: 'admin.users', action: 'edit', module: 'Admin', description: 'Ubah user' }, master);
    editPermId = createdPerm.json?.data?.id;
    if (!editPermId) console.log(`  (gagal membuat permission: ${createdPerm.text})`);
  }
  const granted = await call('POST', `/roles/${editorRoleId}/permissions`,
    { permission_ids: [editPermId] }, master);
  chk('permission admin.users.edit diberikan ke role uji', granted.status, 200);

  const adminEmail = `rbac.admin.${stamp}@test.local`;
  const adminUser = await call('POST', '/users',
    { name: 'RBAC Admin', email: adminEmail, password: 'secret123', role_id: editorRoleId, user_level: 5 }, master);
  if (adminUser.json?.data?.id) cleanup.push(adminUser.json.data.id);
  const adminToken: string = (await call('POST', '/auth/login', { email: adminEmail, password: 'secret123' })).json?.token;
  chk('admin uji bisa login', typeof adminToken === 'string' && adminToken.length > 20, true);

  chk('admin boleh mengubah user', await status('PUT', `/users/${plain.json?.data?.id}`, { name: 'Sah Diubah' }, adminToken), 200);
  chk('admin TIDAK boleh mengangkat dirinya jadi master',
    await status('PUT', `/users/${adminUser.json?.data?.id}`, { user_level: 10 }, adminToken), 403);
  chk('admin TIDAK boleh membuat user master',
    await status('POST', '/users', { name: 'M', email: `m.${stamp}@test.local`, password: 'secret123', user_level: 10 }, adminToken), 403);
  chk('master boleh mengangkat master',
    await status('PUT', `/users/${adminUser.json?.data?.id}`, { user_level: 10 }, master), 200);

  console.log('\n6. AST-001 — RBAC modul Asset Management');
  // Token desktop tanpa permission asset sama sekali
  chk('lihat daftar aset', await status('GET', '/assets', undefined, plainToken), 403);
  chk('lihat kategori aset', await status('GET', '/assets/categories', undefined, plainToken), 403);
  chk('lihat KPI summary', await status('GET', '/assets/summary', undefined, plainToken), 403);
  chk('buat aset', await status('POST', '/assets', { name: 'X', category_id: 1 }, plainToken), 403);
  chk('ubah aset', await status('PUT', '/assets/1', { name: 'X' }, plainToken), 403);
  chk('hapus aset', await status('DELETE', '/assets/1', undefined, plainToken), 403);
  chk('buat production line', await status('POST', '/assets/production-lines', { name: 'L' }, plainToken), 403);
  chk('hapus production line', await status('DELETE', '/assets/production-lines/1', undefined, plainToken), 403);
  chk('hapus P&ID', await status('DELETE', '/assets/pnids/1', undefined, plainToken), 403);
  chk('lihat maintenance', await status('GET', '/assets/1/maintenance', undefined, plainToken), 403);
  chk('tambah maintenance', await status('POST', '/assets/1/maintenance', { performed_at: '2026-01-01' }, plainToken), 403);
  chk('lihat riwayat pembelian', await status('GET', '/assets/1/purchase-history', undefined, plainToken), 403);
  chk('hapus dokumen aset', await status('DELETE', '/assets/documents/1', undefined, plainToken), 403);
  chk('unduh dokumen tanpa token', await status('GET', '/assets/documents/1/download'), 401);

  // Master tetap bisa — memastikan proteksi tidak mengunci yang berwenang
  chk('master → daftar aset', await status('GET', '/assets', undefined, master), 200);
  chk('master → kategori aset', await status('GET', '/assets/categories', undefined, master), 200);
  chk('master → KPI summary', await status('GET', '/assets/summary', undefined, master), 200);

  console.log('\n7. Otorisasi approval terikat rule, modul, step, dan delegasi (DR-P0-02)');
  // Tes pertama kami hanya membandingkan user tanpa permission melawan master —
  // itu tetap hijau walaupun pemegang permission approve modul LAIN bisa
  // menyetujui request Finance. Ditemukan tim reviewer. Sekarang matriksnya
  // diuji sungguhan di atas fixture rule/request terisolasi.
  const af = await seedApprovalFixture();
  chk('fixture approval dibuat', !!af?.requestId, true);

  if (af?.requestId) {
    try {
      const tokSalahModul = await loginAs(af.userSalahModul.email);
      const tokBenarTakDitugaskan = await loginAs(af.userBenarTakDitugaskan.email);
      const tokDitugaskan = await loginAs(af.userDitugaskan.email);
      const tokDelegasi = await loginAs(af.userDelegasi.email);

      // 1. Permission approve dari MODUL LAIN tidak boleh berlaku.
      const salahModul = await call('PUT', `/approval/inbox/${af.requestId}/approve`, {}, tokSalahModul);
      chk('permission approve modul lain ditolak', salahModul.status, 403);
      chk('alasannya modul, bukan sekadar tanpa hak',
        salahModul.json?.code, 'NO_APPROVE_PERMISSION_FOR_MODULE');

      // 2. Permission modul benar tapi bukan giliran orang ini.
      const takDitugaskan = await call('PUT', `/approval/inbox/${af.requestId}/approve`, {}, tokBenarTakDitugaskan);
      chk('permission benar tapi tidak ditugaskan ditolak', takDitugaskan.status, 403);
      chk('alasannya penugasan step', takDitugaskan.json?.code, 'NOT_ASSIGNED_TO_STEP');

      // 3. can_reject = 0 → boleh menyetujui, tidak boleh menolak.
      chk('step tanpa hak tolak menolak reject',
        (await call('PUT', `/approval/inbox/${af.requestId}/reject`, {}, tokDitugaskan)).json?.code,
        'REJECT_NOT_ALLOWED');

      // 4. Delegasi aktif mewarisi penugasan pemberi delegasi.
      const lewatDelegasi = await call('PUT', `/approval/inbox/${af.requestId2}/approve`, {}, tokDelegasi);
      chk('delegasi aktif boleh bertindak', lewatDelegasi.status, 200);

      // 5. Dua approve paralel — hanya satu yang boleh menang.
      const [pa, pb] = await Promise.all([
        call('PUT', `/approval/inbox/${af.requestId}/approve`, {}, tokDitugaskan),
        call('PUT', `/approval/inbox/${af.requestId}/approve`, {}, tokDitugaskan),
      ]);
      chk('dua approve paralel: tepat satu menang',
        [pa.status, pb.status].filter(x => x === 200).length, 1);
      chk('hanya satu action tercatat', await countActions(af.requestId), 1);

      // 6. Tanpa token tetap 401.
      chk('tanpa token', await status('PUT', `/approval/inbox/${af.requestId}/approve`, {}), 401);
    } finally {
      const sisa = await cleanupApprovalFixture(af);
      chk('fixture approval dibersihkan tuntas', sisa, 0);
    }
  }

  console.log('\n8. HR: PIN & data gaji tidak terbuka untuk semua (DR-P0-03)');
  // Rantai serangan yang ditutup: user desktop level rendah ambil NIK dari
  // daftar employee → reset PIN korban (respons memuat PIN polos) → login mobile
  // sebagai korban → daftarkan sidik jari sendiri → baca slip gaji & absensi.
  chk('reset PIN oleh user tanpa hak',
    await status('POST', '/hr/employees/1/reset-pin', {}, plainToken), 403);
  chk('bulk generate PIN oleh user tanpa hak',
    await status('POST', '/hr/employees/generate-missing-pins', {}, plainToken), 403);
  chk('tarif jabatan oleh user tanpa hak',
    await status('GET', '/hr/position-rates', undefined, plainToken), 403);

  // Daftar employee sengaja TIDAK digembok — banyak layar memakainya sekadar
  // untuk dropdown nama. Yang diredaksi angkanya.
  const empPlain = await call('GET', '/hr/employees', undefined, plainToken);
  chk('daftar employee tetap terbaca', empPlain.status, 200);
  const barisPlain = (empPlain.json?.data || [])[0];
  if (barisPlain) {
    chk('gaji diredaksi untuk user tanpa hak', barisPlain.basic_salary, null);
    chk('tarif diredaksi', barisPlain.basic_rate, null);
    chk('ditandai sebagai diredaksi', barisPlain.salary_redacted, true);
    chk('nama tetap ada (dropdown tetap jalan)', !!barisPlain.first_name, true);
  } else {
    chk('ada karyawan untuk diuji', false, true);
  }

  // Yang berwenang tetap melihat angkanya — proteksi tidak boleh mematikan HR.
  const empMaster = await call('GET', '/hr/employees', undefined, master);
  const barisMaster = (empMaster.json?.data || [])[0];
  chk('master tidak diredaksi', barisMaster?.salary_redacted, undefined);
  chk('master tetap bisa tarif jabatan',
    await status('GET', '/hr/position-rates', undefined, master), 200);

  console.log('\n9. Payslip tidak mempercayai angka dari klien (DR-P0-04)');
  // ⚠️ Versi pertama tes ini BERBAHAYA dan ditemukan tim reviewer: ia memilih
  // karyawan pertama dari database nyata. Query kasbon memasukkan setiap kasbon
  // `pending` ber-`period_month IS NULL` ke periode APA PUN, jadi periode 2099
  // sama sekali tidak membuatnya aman — endpoint save akan melunasi kasbon
  // karyawan sungguhan dan meninggalkan dokumen gaji palsu.
  //
  // Sekarang seluruh fixture dibuat sendiri dan dibersihkan di `finally`.
  const fx = await seedPayrollFixture();
  chk('fixture payroll dibuat', !!fx?.employeeId, true);

  if (fx?.employeeId) {
    try {
      const PALSU = 999999999;
      const kasbonLuarSebelum = await advanceRow(fx.kasbonLuarId);

      const simpan = await call('POST', '/hr/payslip/save', {
        employee_id: fx.employeeId, period_month: 12, period_year: 2099,
        // Semua ini harus DIABAIKAN server.
        project_id: 999999,
        calculation: { basic_salary: PALSU, tunjangan: PALSU, ot_pay: PALSU, gross_salary: PALSU, total_days: 99 },
        advances: { advance_1: 0, advance_2: 0, records: [{ id: fx.kasbonLuarId }] },
        deductions: { bpjs_kes: 0, bpjs_tk: 0, pph21: 0, total: 0 },
        net_salary: PALSU,
        notes: 'uji DR-P0-04',
      }, master);

      chk('payslip tersimpan', simpan.status, 201);
      chk('net_salary palsu diabaikan', simpan.json?.data?.net_salary === PALSU, false);

      // Fixture punya 1 hari absensi bertarif 100.000 → server harus menghitung
      // itu, bukan 0 dan bukan angka klien.
      chk('server menghitung dari absensi fixture', Number(simpan.json?.data?.gross_salary), 100000);

      // Inti temuan reviewer: kasbon MILIK ORANG LAIN tidak boleh tersentuh,
      // walau id-nya dikirim klien.
      const kasbonLuarSesudah = await advanceRow(fx.kasbonLuarId);
      chk('kasbon karyawan lain TIDAK berubah statusnya',
        kasbonLuarSesudah?.status, kasbonLuarSebelum?.status);
      chk('kasbon karyawan lain TIDAK berubah sisanya',
        Number(kasbonLuarSesudah?.remaining), Number(kasbonLuarSebelum?.remaining));

      // Kasbon milik karyawan fixture memang harus terpotong.
      const kasbonSendiri = await advanceRow(fx.kasbonSendiriId);
      chk('kasbon sendiri terpotong', kasbonSendiri?.status, 'deducted');
      chk('sisa kasbon sendiri nol', Number(kasbonSendiri?.remaining), 0);

      chk('simpan payslip oleh user tanpa hak',
        await status('POST', '/hr/payslip/save',
          { employee_id: fx.employeeId, period_month: 12, period_year: 2099 }, plainToken), 403);
    } finally {
      const sisa = await cleanupPayrollFixture(fx);
      chk('fixture payroll dibersihkan tuntas', sisa, 0);
    }
  }

  console.log('\n9b. Batas hr.employees.view vs hr.payroll.view (klarifikasi reviewer)');
  // Keputusan: "Data Karyawan" adalah direktori, bukan kompensasi. Membuka angka
  // gaji HANYA lewat `hr.payroll.view`. Tanpa batas ini, setiap role yang boleh
  // melihat daftar nama otomatis melihat gaji seluruh perusahaan.
  const dir = await seedDirectoryRole();
  chk('role direktori dibuat', !!dir?.token, true);
  if (dir?.token) {
    try {
      const lihat = await call('GET', '/hr/employees', undefined, dir.token);
      chk('pemegang hr.employees.view tetap bisa melihat daftar', lihat.status, 200);
      const baris = (lihat.json?.data || [])[0];
      chk('tapi gajinya TETAP diredaksi', baris?.salary_redacted, true);
      chk('angkanya null', baris?.basic_salary, null);
      chk('namanya tetap ada', !!baris?.first_name, true);
    } finally {
      chk('role direktori dibersihkan', await cleanupDirectoryRole(dir), 0);
    }
  }

  console.log('\n8b. Permission key menu cocok dengan katalog backend (DR-P2-01)');
  // Sepuluh key di Layout.vue pernah berbeda dari katalog, mis.
  // `estimator.proposals` vs `estimator.estimator-proposals` dan
  // `master-data.vendors` vs `master_data.suppliers`. Akibatnya role non-master
  // yang SUDAH punya permissionnya tetap kehilangan menu, sementara router hanya
  // memeriksa keberadaan token sehingga URL langsung tetap terbuka.
  //
  // Dijaga di sini karena mismatch semacam ini tidak terlihat dari tipe maupun
  // build — cuma dari membandingkan keduanya.
  const menuKeys = await permKeysDariLayout();
  chk('permKey terbaca dari Layout.vue', menuKeys.length > 0, true);
  const tidakDikenal = await resourceTidakDikenal(menuKeys);
  if (tidakDikenal.length) {
    console.log(`       tidak ada di katalog: ${tidakDikenal.join(', ')}`);
  }
  chk('semua permKey ada di tabel permissions', tidakDikenal.length, 0);

  console.log('\n9a. Material Request: approve atomic & catatan teks tidak meledak (DR-P1-04)');
  // Bug paling tajam di butir ini: `JSON.parse(mr.notes)` dijalankan atas catatan
  // yang diisi karyawan sebagai TEKS BEBAS dari layar mobile. Catatan seperti
  // "urgent" membuat approve melempar — SETELAH status berubah dan PR terlanjur
  // dibuat. Jadi klien melihat gagal, padahal MR sudah approved dan PR sudah ada.
  const mrFix = await seedMaterialRequest('urgent, butuh besok pagi');
  chk('MR uji dibuat', !!mrFix?.mrId, true);

  if (mrFix?.mrId) {
    try {
      const app = await call('PUT', `/material-requests/${mrFix.mrId}/approve`, {}, master);
      chk('approve dengan catatan teks biasa berhasil', app.status, 200);
      chk('nomor PR format resmi', /^PR-\d{8}-\d{4,}$/.test(app.json?.pr_number || ''), true);

      const mrSesudah = await materialRequestRow(mrFix.mrId);
      chk('status jadi approved', mrSesudah?.status, 'approved');
      chk('tautan PR di kolom sendiri', !!mrSesudah?.linked_pr_id, true);
      // Catatan karyawan TIDAK boleh ditimpa JSON.
      chk('catatan karyawan tetap utuh', mrSesudah?.notes, 'urgent, butuh besok pagi');

      // Approve kedua tidak boleh membuat PR kedua.
      const app2 = await call('PUT', `/material-requests/${mrFix.mrId}/approve`, {}, master);
      chk('approve ulang ditolak 409', app2.status, 409);
      chk('hanya satu PR terbuat', await countPrForMr(mrFix.mrId), 1);
    } finally {
      chk('MR uji dibersihkan', await cleanupMaterialRequest(mrFix), 0);
    }
  }

  console.log('\n9c. Notifikasi orang lain tidak bisa disentuh (DR-P2-02)');
  // Seluruh mutasi per-ID dan bulk dulu hanya memakai id dari klien — siapa pun
  // yang menebak nomor bisa menandai terbaca atau menghapus notifikasi orang lain.
  const notif = await seedNotifications();
  chk('notifikasi uji dibuat', !!notif?.milikOrangLain, true);
  if (notif?.milikOrangLain) {
    try {
      chk('tandai terbaca milik orang lain → 404',
        await status('PUT', `/notifications/${notif.milikOrangLain}/read`, {}, plainToken), 404);
      chk('hapus milik orang lain → 404',
        await status('DELETE', `/notifications/${notif.milikOrangLain}`, undefined, plainToken), 404);

      // Bulk: ID orang lain harus diabaikan, bukan ikut terhapus.
      await call('POST', '/notifications/bulk-action',
        { ids: [notif.milikOrangLain, notif.milikSendiri], action: 'delete' }, plainToken);
      chk('bulk TIDAK menghapus milik orang lain', await notificationExists(notif.milikOrangLain), true);
      chk('bulk tetap menghapus milik sendiri', await notificationExists(notif.milikSendiri), false);
    } finally {
      chk('notifikasi uji dibersihkan', await cleanupNotifications(notif), 0);
    }
  }

  console.log('\n9d. Route alokasi FIFO/FEFO terjangkau (DR-P2-03)');
  // `/:id` didaftarkan lebih dulu, jadi Express menangkap string "allocate-stock"
  // sebagai id dan endpoint alokasi tidak pernah terjangkau sejak dibuat.
  const alok = await call('GET', '/warehouses/allocate-stock?product_id=1&qty=1', undefined, master);
  chk('bukan lagi "Warehouse not found"',
    String(alok.json?.error || '').includes('Warehouse not found'), false);

  console.log('\n10. Akun nonaktif tidak bisa dipakai (DR-P1-01)');
  // Login dulu tidak memeriksa is_active sama sekali, dan middleware hanya
  // memverifikasi tanda tangan token — jadi akun yang sudah dinonaktifkan tetap
  // bisa login DAN token lamanya tetap berlaku sampai kedaluwarsa (7 hari
  // desktop, 30 hari mobile).
  const nonaktifEmail = `rbac-nonaktif-${stamp}@uji.local`;
  const nonaktif = await call('POST', '/users',
    { name: 'RBAC Nonaktif', email: nonaktifEmail, password: 'secret123', role_id: roleId, user_level: 1 }, master);
  const nonaktifId = nonaktif.json?.data?.id ?? nonaktif.json?.id;
  chk('user uji dibuat', !!nonaktifId, true);

  if (nonaktifId) {
    cleanup.push(nonaktifId);

    // Token diterbitkan SELAGI akun masih aktif.
    const sebelum = await call('POST', '/auth/login', { email: nonaktifEmail, password: 'secret123' });
    chk('login saat masih aktif berhasil', sebelum.status, 200);
    const tokenLama = sebelum.json?.token;
    chk('token lama bisa dipakai', await status('GET', '/notifications', undefined, tokenLama), 200);

    // Dinonaktifkan.
    await call('PUT', `/users/${nonaktifId}`, { is_active: 0 }, master);

    chk('login setelah dinonaktifkan ditolak',
      (await call('POST', '/auth/login', { email: nonaktifEmail, password: 'secret123' })).status, 403);

    // Inti butirnya: token yang SUDAH terbit tidak boleh tetap berlaku.
    chk('token lama ikut mati', await status('GET', '/notifications', undefined, tokenLama), 401);
  }

  console.log('\n11. Bersih-bersih');
  for (const id of cleanup) await call('DELETE', `/users/${id}`, undefined, master);
  for (const id of [roleId, editorRoleId]) if (id) await call('DELETE', `/roles/${id}`, undefined, master);
  console.log(`  ok   ${cleanup.length} user uji & 2 role uji dihapus`);
  pass++;

  console.log(`\n=== ${pass} lulus, ${fail} gagal ===`);
  process.exit(fail ? 1 : 0);
}

main().catch(err => { console.error('Tes gagal dijalankan:', err.message); process.exit(1); });
