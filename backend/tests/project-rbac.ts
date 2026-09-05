import 'dotenv/config';
/**
 * RBAC modul project (PROJ-RBAC-01).
 *
 * Sebelum ini, NOL dari 61 endpoint project punya gerbang permission —
 * `authMiddleware` menjawab "siapa kamu", tidak pernah "boleh apa". Terbukti
 * dengan user level 1 tanpa role: ia bisa membuat proyek senilai Rp 5 miliar,
 * mengubah nilainya jadi Rp 1, membuat task, dan MENGHAPUS proyeknya.
 *
 * Kelas yang sama dengan FIN-RBAC-01 di modul finance.
 *
 * Dua sisi yang diuji, dan sisi kedua yang paling mudah dilupakan:
 *
 *   1. Yang tidak berhak DITOLAK.
 *   2. Yang berhak TIDAK IKUT TERKUNCI. Gerbang yang memakai permission yang
 *      tidak dipegang role produksi akan mencabut hak user aktif tanpa satu pun
 *      error — dan itu baru ketahuan saat orangnya melapor tidak bisa bekerja.
 *
 * Prasyarat: backend jalan. Jalankan: npm run test:project-rbac
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

/**
 * Resource yang dipegang `Manager Finannce & Acc` di produksi SETELAH grant
 * 3 September 2026. Sebelumnya ia tidak memegang enam yang terakhir sama
 * sekali — menggembok jadwal/manpower/MTO/dokumen tanpa memberikannya lebih
 * dulu akan langsung mengunci dua user aktif.
 */
const RESOURCE_FINANCE = [
  'projects.projects', 'projects.tasks', 'projects.expenses', 'projects.reports',
  'projects.settings', 'projects.team', 'projects.notes', 'projects.messages',
  'projects.tickets', 'projects.project-events', 'projects.clients', 'projects.leads',
  'projects.prospects', 'projects.sales',
  'projects.dashboard', 'projects.documents', 'projects.help',
  'projects.manpower', 'projects.mto', 'projects.schedule',
];

async function main() {
  const fs = await import('fs');
  const { dbGet, dbAll, dbRun } = await import('../src/config/database');
  const master: string = (await call('POST', '/auth/login', { email: ADMIN_EMAIL, password: ADMIN_PASS })).json?.token;
  if (!master) { console.log('  FAIL login master'); process.exit(1); }
  pass++; console.log('0. Persiapan\n  ok   login master');

  const stamp = Date.now().toString().slice(-7);
  const bersih: (() => Promise<any>)[] = [];

  // ── 1. Cakupan gerbang ──────────────────────────────────────────────────
  console.log('\n1. Setiap endpoint project bergerbang, dan permissionnya nyata');
  const src = fs.readFileSync('src/routes/project.routes.ts', 'utf8');
  const semua = [...src.matchAll(/^router\.(get|post|put|patch|delete)\('([^']+)'([^\n]*)/gm)];
  const tanpaGerbang = semua.filter(m => !m[3].includes('requirePermission'))
    .map(m => `${m[1].toUpperCase()} ${m[2]}`);
  chk('tidak ada endpoint tanpa requirePermission', tanpaGerbang, []);
  chk('  jumlah endpoint yang dipindai', semua.length >= 60, true);

  // Permission yang salah ketik MENGUNCI SEMUA ORANG kecuali master, tanpa
  // satu pun error yang muncul — Admin sekalipun, karena
  // ensureAdminRoleHasAllPermissions hanya memetakan yang ada di katalog.
  const adaPerm = new Set((await dbAll(
    "SELECT CONCAT(resource,'.',action) k FROM permissions") as any[]).map((r: any) => r.k));
  const dipakai = [...new Set([...src.matchAll(/requirePermission\('([^']+)'\)/g)].map(m => m[1]))];
  chk('setiap permission yang dipakai ada di katalog',
    dipakai.filter(p => !adaPerm.has(p)).sort(), []);
  chk('  permission unik dipakai', dipakai.length >= 20, true);

  // ── 2. Aksi diturunkan dari metode, bukan ditebak ───────────────────────
  console.log('\n2. Aksi gerbang cocok dengan metodenya');
  const salahAksi: string[] = [];
  for (const m of semua) {
    const g = m[3].match(/requirePermission\('([^']+)'\)/);
    if (!g) continue;
    const aksi = g[1].split('.').pop();
    const metode = m[1].toLowerCase();
    const persetujuan = /\/(approve|reject|submit)$/.test(m[2]);
    const harus = persetujuan ? 'approve'
      : ({ get: 'view', post: 'create', put: 'edit', patch: 'edit', delete: 'delete' } as any)[metode];
    if (aksi !== harus) salahAksi.push(`${metode.toUpperCase()} ${m[2]} → ${g[1]} (harusnya .${harus})`);
  }
  chk('tidak ada gerbang yang aksinya tidak cocok metodenya', salahAksi, []);

  // ── 3. User tanpa permission ditolak ────────────────────────────────────
  console.log('\n3. User level 1 tanpa role ditolak di jalur tulis');
  const email = `projrbac-${stamp}@uji.local`, pw = `Uji#${stamp}x`;
  await call('POST', '/users', { name: 'Uji Project RBAC', email, password: pw, user_level: 1 }, master);
  const uid = Number(((await dbGet('SELECT id FROM users WHERE email = ?', [email])) as any)?.id);
  bersih.push(() => dbRun('DELETE FROM users WHERE id = ?', [uid]));
  chk('user uji dibuat tanpa role', !!uid, true);

  const polos: string = (await call('POST', '/auth/login', { email, password: pw })).json?.token;
  chk('  user uji bisa login', !!polos, true);

  const clientId = Number(((await dbGet('SELECT id FROM clients ORDER BY id DESC LIMIT 1')) as any)?.id);
  // Inilah yang dulu berhasil: proyek Rp 5 miliar dibuat, diubah, lalu dihapus
  // oleh akun yang tidak memegang satu pun permission.
  const buat = await call('POST', '/projects', { title: `TOLAK-${stamp}`, client_id: clientId, price: 5000000000 }, polos);
  chk('buat proyek ditolak', buat.status, 403);
  const pjBocor = buat.json?.id ?? buat.json?.data?.id;
  if (pjBocor) bersih.push(() => dbRun('DELETE FROM client_projects WHERE id = ?', [pjBocor]));

  const target = Number(((await dbGet('SELECT id FROM client_projects ORDER BY id DESC LIMIT 1')) as any)?.id);
  for (const [label, m, p, b] of [
    ['baca daftar proyek', 'GET', '/projects', undefined],
    ['baca detail proyek', 'GET', `/projects/${target}`, undefined],
    ['ubah proyek', 'PUT', `/projects/${target}`, { title: 'x' }],
    ['hapus proyek', 'DELETE', `/projects/${target}`, undefined],
    ['buat task', 'POST', `/projects/${target}/tasks`, { title: 'x' }],
    ['baca WBS', 'GET', `/projects/${target}/wbs`, undefined],
    ['buat periode progress', 'POST', `/projects/${target}/progress/periods`, {}],
    ['baca expense', 'GET', `/projects/${target}/expenses`, undefined],
    ['baca MTO', 'GET', `/projects/${target}/mto`, undefined],
  ] as [string, string, string, any][]) {
    chk(`  ${label}`, (await call(m, p, b, polos)).status, 403);
  }

  // ── 4. Role produksi TIDAK ikut terkunci ────────────────────────────────
  console.log('\n4. Role dengan permission produksi tetap bisa bekerja');
  // Sisi yang paling mudah dilupakan. Gerbang yang benar-benar menolak tapi
  // sekaligus mengunci user aktif bukan perbaikan — itu gangguan.
  const roleIns = await dbRun('INSERT INTO roles (name, description) VALUES (?, ?)',
    [`ProjRBAC-${stamp}`, 'Meniru Manager Finannce & Acc produksi']);
  const roleId = roleIns.insertId;
  bersih.push(() => dbRun('DELETE FROM roles WHERE id = ?', [roleId]));
  await dbRun(
    `INSERT IGNORE INTO role_permissions (role_id, permission_id)
     SELECT ?, p.id FROM permissions p WHERE p.resource IN (${RESOURCE_FINANCE.map(() => '?').join(',')})`,
    [roleId, ...RESOURCE_FINANCE]);
  const jml = await dbGet('SELECT COUNT(*) c FROM role_permissions WHERE role_id = ?', [roleId]) as any;
  chk('role tiruan dibuat', Number(jml?.c) >= 100, true);

  const email2 = `projrole-${stamp}@uji.local`;
  await call('POST', '/users', { name: 'Uji Role Produksi', email: email2, password: pw, user_level: 3 }, master);
  const uid2 = Number(((await dbGet('SELECT id FROM users WHERE email = ?', [email2])) as any)?.id);
  bersih.push(() => dbRun('DELETE FROM users WHERE id = ?', [uid2]));
  await dbRun('UPDATE users SET role_id = ? WHERE id = ?', [roleId, uid2]);
  const berhak: string = (await call('POST', '/auth/login', { email: email2, password: pw })).json?.token;
  chk('user berhak bisa login', !!berhak, true);

  const ditolak: string[] = [];
  for (const [m, p, b] of [
    ['GET', '/projects', undefined],
    ['GET', `/projects/${target}`, undefined],
    ['GET', '/projects/cost-codes', undefined],
    ['GET', `/projects/${target}/tasks`, undefined],
    ['GET', `/projects/${target}/wbs`, undefined],
    ['GET', `/projects/${target}/expenses`, undefined],
    ['GET', `/projects/${target}/mto`, undefined],
    ['GET', `/projects/${target}/files`, undefined],
    ['GET', `/projects/${target}/progress`, undefined],
    ['GET', `/projects/${target}/rab`, undefined],
    ['GET', `/projects/${target}/evm`, undefined],
    ['GET', `/projects/${target}/activities`, undefined],
    ['GET', `/projects/${target}/schedule-baseline`, undefined],
    ['GET', `/projects/${target}/cost-summary`, undefined],
  ] as [string, string, any][]) {
    const r = await call(m, p, b, berhak);
    if (r.status === 403) ditolak.push(`${m} ${p}`);
  }
  chk('tidak ada endpoint yang menolak role produksi', ditolak, []);

  const buatSah = await call('POST', '/projects',
    { title: `SAH-${stamp}`, client_id: clientId, price: 1000 }, berhak);
  const pjSah = buatSah.json?.id ?? buatSah.json?.data?.id;
  if (pjSah) bersih.push(() => dbRun('DELETE FROM client_projects WHERE id = ?', [pjSah]));
  chk('role produksi tetap bisa membuat proyek', buatSah.status, 201);
  if (pjSah) {
    chk('  dan membuat task', (await call('POST', `/projects/${pjSah}/tasks`, { title: 'ok' }, berhak)).status, 201);
    chk('  dan menghapusnya', (await call('DELETE', `/projects/${pjSah}`, undefined, berhak)).status, 200);
  }

  // ── 5. Data kurang dijawab 400, bukan 500 ───────────────────────────────
  console.log('\n5. Data yang kurang dijawab 400, bukan 500');
  const tanpaJudul = await call('POST', '/projects', { client_id: clientId }, master);
  chk('tanpa judul → 400 dengan sebabnya', [tanpaJudul.status, tanpaJudul.json?.code], [400, 'JUDUL_WAJIB']);
  const tanpaClient = await call('POST', '/projects', { title: 'x' }, master);
  chk('tanpa client → 400 dengan sebabnya', [tanpaClient.status, tanpaClient.json?.code], [400, 'CLIENT_WAJIB']);

  // ── Bersih-bersih ───────────────────────────────────────────────────────
  console.log('\n6. Bersih-bersih fixture');
  await dbRun('DELETE FROM role_permissions WHERE role_id = ?', [roleId]);
  for (const f of bersih.reverse()) { try { await f(); } catch {} }
  await dbRun("DELETE FROM client_projects WHERE project_name IN (?, ?)", [`TOLAK-${stamp}`, `SAH-${stamp}`]);
  const sisa = (await dbAll(
    'SELECT id FROM users WHERE id IN (?, ?) UNION SELECT id FROM roles WHERE id = ?',
    [uid, uid2, roleId])).length;
  chk('user & role uji terhapus', sisa, 0);

  console.log(`\n${pass} lulus, ${fail} gagal`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch(e => { console.error(e); process.exit(1); });
