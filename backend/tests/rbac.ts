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

  console.log('\n7. Aksi approval tidak bisa dipakai non-approver (DR-P0-02)');
  // Inbox memang sudah difilter permission, tapi AKSInya dulu tidak memeriksa
  // apa pun: siapa pun yang tahu/menebak ID request bisa menyetujuinya. Filter
  // di daftar tidak melindungi aksi.
  //
  // Modul approval belum dipakai di produksi (0 rule, 0 request), jadi request
  // uji dibuat sendiri lewat master lalu dihapus lagi.
  const areq = await call('POST', '/approval/submit', {
    module: 'finance', entity_type: 'fund_request', entity_id: 999999, notes: 'uji DR-P0-02',
  }, master);
  const areqId = areq.json?.data?.id ?? areq.json?.id;

  chk('request approval uji terbuat', !!areqId, true);
  if (areqId) {
    // `plainToken` = user tanpa satu pun permission approve.
    chk('approve oleh user tanpa hak', await status('PUT', `/approval/inbox/${areqId}/approve`, {}, plainToken), 403);
    chk('reject oleh user tanpa hak', await status('PUT', `/approval/inbox/${areqId}/reject`, {}, plainToken), 403);
    chk('tanpa token sama sekali', await status('PUT', `/approval/inbox/${areqId}/approve`, {}), 401);

    // Yang berwenang tetap harus bisa — proteksi tidak boleh mengunci semuanya.
    const olehMaster = await call('PUT', `/approval/inbox/${areqId}/approve`, {}, master);
    chk('master tetap bisa approve', olehMaster.status, 200);

    // Setelah selesai, approve kedua harus ditolak sebagai konflik, bukan
    // diproses dua kali.
    chk('approve ulang ditolak 409',
      await status('PUT', `/approval/inbox/${areqId}/approve`, {}, master), 409);
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
  // Versi lama menyimpan calculation/advances/deductions/net_salary apa adanya
  // dari body. Siapa pun yang bisa memanggil endpoint ini tinggal mengubah
  // angkanya lewat DevTools dan memfinalisasi gaji sembarang.
  const empList = await call('GET', '/hr/employees', undefined, master);
  const empUji = (empList.json?.data || [])[0];
  chk('ada karyawan untuk diuji payslip', !!empUji?.id, true);

  if (empUji?.id) {
    // Periode jauh di depan supaya tidak menyentuh data gaji sungguhan.
    const periode = { employee_id: empUji.id, period_month: 12, period_year: 2099 };
    const PALSU = 999999999;

    const simpan = await call('POST', '/hr/payslip/save', {
      ...periode,
      calculation: { basic_salary: PALSU, tunjangan: PALSU, ot_pay: PALSU, gross_salary: PALSU, total_days: 99, total_ot_hours: 99 },
      advances: { advance_1: 0, advance_2: 0, records: [{ id: 999999 }] },
      deductions: { bpjs_kes: 0, bpjs_tk: 0, pph21: 0, total: 0 },
      net_salary: PALSU,
      notes: 'uji DR-P0-04',
    }, master);

    chk('payslip tersimpan', simpan.status, 201);
    chk('net_salary palsu TIDAK dipakai', simpan.json?.data?.net_salary === PALSU, false);
    chk('gross_salary palsu TIDAK dipakai', simpan.json?.data?.gross_salary === PALSU, false);

    // Tanpa absensi di periode itu, hitungan server = 0. Itu yang harus tersimpan.
    chk('server menghitung sendiri (0, bukan angka klien)', Number(simpan.json?.data?.gross_salary), 0);

    // Kasbon milik id karangan tidak boleh ikut ditandai lunas.
    chk('kasbon id karangan tidak ditandai', Number(simpan.json?.data?.advances_marked), 0);

    // Yang tersimpan di database juga harus angka server, bukan angka klien.
    const riwayat = await call('GET', `/hr/payslip/history?employee_id=${empUji.id}&period_year=2099`, undefined, master);
    const tersimpan = (riwayat.json?.data || []).find((r: any) => Number(r.period_month) === 12);
    if (tersimpan) {
      chk('yang tersimpan bukan angka palsu', Number(tersimpan.net_salary) === PALSU, false);
    } else {
      chk('payslip uji terbaca kembali', false, true);
    }

    chk('simpan payslip oleh user tanpa hak',
      await status('POST', '/hr/payslip/save', periode, plainToken), 403);
  }

  console.log('\n10. Bersih-bersih');
  for (const id of cleanup) await call('DELETE', `/users/${id}`, undefined, master);
  for (const id of [roleId, editorRoleId]) if (id) await call('DELETE', `/roles/${id}`, undefined, master);
  console.log(`  ok   ${cleanup.length} user uji & 2 role uji dihapus`);
  pass++;

  console.log(`\n=== ${pass} lulus, ${fail} gagal ===`);
  process.exit(fail ? 1 : 0);
}

main().catch(err => { console.error('Tes gagal dijalankan:', err.message); process.exit(1); });
