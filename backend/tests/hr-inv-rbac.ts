import 'dotenv/config';
/**
 * RBAC modul HR, Inventory, dan Warehouse (HRINV-RBAC-01).
 *
 * Sebelum ini: 17 dari 31 endpoint HR, dan SELURUH 32 endpoint inventory +
 * warehouse, hanya memakai `authMiddleware`.
 *
 * Yang paling tajam bukan sekadar "tidak bergerbang", melainkan sebuah
 * **asimetri**: gaji SUDAH disamarkan saat dibaca — user biasa menerima
 * `basic_rate: null` dan `salary_redacted: true` — tapi
 * `PATCH /hr/employees/:id/rates` menjawab 200 untuk siapa pun yang login.
 * Yang tidak boleh MELIHAT gaji, boleh MENGUBAHNYA. Itu yang diuji paling
 * keras di sini.
 *
 * Dua hal lain yang dijaga:
 *
 *   - **Endpoint `/mobile/*` TIDAK BOLEH bergerbang permission.** Ia dipakai
 *     PWA karyawan dengan token mobile, yang tidak punya `userId` — memasang
 *     `requirePermission` di sana akan menjawab 401 dan mematikan absensi
 *     seluruh karyawan lapangan.
 *   - **Setiap permission yang disebut ada di katalog.** String salah ketik
 *     mengunci semua orang kecuali master, tanpa error apa pun.
 *
 * Prasyarat: backend jalan. Jalankan: npm run test:hr-inv-rbac
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

const BERKAS = ['hr.routes.ts', 'inventory.routes.ts', 'warehouse.routes.ts'];

async function main() {
  const stamp = Date.now().toString().slice(-7);
  const fs = await import('fs');
  const { dbGet, dbAll, dbRun } = await import('../src/config/database');

  const master: string = (await call('POST', '/auth/login', { email: ADMIN_EMAIL, password: ADMIN_PASS })).json?.token;
  if (!master) { console.log('  FAIL login master'); process.exit(1); }
  pass++; console.log('0. ok   login master');

  const sumber: Record<string, string> = {};
  for (const f of BERKAS) sumber[f] = fs.readFileSync(`src/routes/${f}`, 'utf8');

  // ── 1. Cakupan gerbang ──────────────────────────────────────────────────
  console.log('\n1. Setiap endpoint desktop bergerbang; endpoint mobile TIDAK');
  // Satu-satunya pengecualian, dan disebut namanya supaya tidak berkembang
  // diam-diam: daftar employee memang TIDAK bergerbang (DR-P0-03) karena
  // ProjectTimesheets & ManpowerPlan memakainya sekadar untuk dropdown nama.
  // Yang menjaga data kompensasi di sana adalah redaksi, diuji di test:rbac.
  const DIKECUALIKAN = ['hr.routes.ts: GET /employees'];
  const tanpaGerbang: string[] = [];
  const mobileBergerbang: string[] = [];
  for (const f of BERKAS) {
    for (const m of sumber[f].matchAll(/^router\.(get|post|put|patch|delete)\('([^']+)'([^\n]*)/gm)) {
      const [, method, jalur, sisa] = m;
      const mobile = jalur.startsWith('/mobile');
      if (mobile && sisa.includes('requirePermission')) mobileBergerbang.push(`${method.toUpperCase()} ${jalur}`);
      const tanda = `${f}: ${method.toUpperCase()} ${jalur}`;
      if (!mobile && !sisa.includes('requirePermission') && !DIKECUALIKAN.includes(tanda)) tanpaGerbang.push(tanda);
    }
  }
  chk('endpoint desktop tanpa gerbang', tanpaGerbang, []);
  // Menggembok ini akan menjawab 401 untuk token mobile dan mematikan absensi.
  chk('endpoint /mobile/* yang salah digembok', mobileBergerbang, []);

  // ── 2. Permission yang disebut ada di katalog ───────────────────────────
  console.log('\n2. Permission yang disebut benar-benar ada');
  const dipakai = new Set<string>();
  for (const f of BERKAS)
    for (const m of sumber[f].matchAll(/requirePermission\(([^)]*)\)/g))
      for (const q of m[1].matchAll(/'([^']+)'/g)) dipakai.add(q[1]);
  const katalog = new Set((await dbAll(`SELECT CONCAT(resource,'.',action) AS k FROM permissions`) as any[]).map(r => String(r.k)));
  chk(`${dipakai.size} permission dipakai, yang tidak ada di katalog`,
    [...dipakai].filter(k => !katalog.has(k)).sort(), []);

  // ── 3. User level 1 tanpa role ──────────────────────────────────────────
  console.log('\n3. User level 1 tanpa role kini ditolak');
  const email = `hrinv.${stamp}@test.local`;
  const u = await call('POST', '/users', { name: 'HRINV Probe', email, password: 'secret123', user_level: 1 }, master);
  const uid = u.json?.data?.id ?? u.json?.id;
  const polos: string = (await call('POST', '/auth/login', { email, password: 'secret123' })).json?.token;
  // Karyawan FIXTURE sendiri, bukan karyawan sungguhan.
  //
  // Versi pertama tes ini memakai karyawan pertama dari daftar. Saat pengujian
  // mutasi melonggarkan gerbang PATCH /rates, tes ini BENAR-BENAR MENULIS dan
  // mengubah basic_rate karyawan asli dari 100.000 menjadi 1. Tes yang menguji
  // "tidak boleh menulis" tidak boleh menulis ke data sungguhan ketika
  // penjagaannya jebol — justru di situlah ia paling berbahaya.
  const empIns = await dbRun(
    `INSERT INTO employees (code, name, basic_rate, ot_rate, tunjangan_rate)
     VALUES (?, ?, 777777, 0, 0)`,
    [`RBAC-${stamp}`, `Karyawan Uji RBAC ${stamp}`]
  );
  const emp = { id: empIns.insertId };

  // Daftar karyawan sengaja TIDAK ikut ditolak — ia dikecualikan di atas.
  // Yang dijaga di sana angkanya, bukan aksesnya.
  const polosLihatEmp = await call('GET', '/hr/employees', undefined, polos);
  chk('  baca karyawan tetap terbuka, tapi gaji diredaksi',
    [polosLihatEmp.status, (polosLihatEmp.json?.data || [])[0]?.salary_redacted], [200, true]);

  for (const [label, m, p, b] of [
    ['baca riwayat slip gaji', 'GET', '/hr/payslip/history', undefined],
    ['baca kasbon', 'GET', '/hr/advances', undefined],
    ['baca absensi', 'GET', '/hr/attendance', undefined],
    ['hapus karyawan', 'DELETE', '/hr/employees/999999', undefined],
    ['baca inventory', 'GET', '/inventory', undefined],
    ['baca gudang', 'GET', '/warehouses', undefined],
    ['buat gudang', 'POST', '/warehouses', { name: 'x', code: `X${stamp}` }],
    ['hapus gudang', 'DELETE', '/warehouses/999999', undefined],
  ] as [string, string, string, any][]) {
    chk(`  ${label}`, (await call(m, p, b, polos)).status, 403);
  }

  // ── 4. Asimetri gaji: tidak boleh baca, TIDAK BOLEH tulis ───────────────
  console.log('\n4. Yang tidak boleh melihat gaji tidak boleh mengubahnya');
  if (emp?.id) {
    const r = await call('PATCH', `/hr/employees/${emp.id}/rates`,
      { basic_rate: 1, ot_rate: 1, tunjangan_rate: 1 }, polos);
    chk('  PATCH /hr/employees/:id/rates ditolak', r.status, 403);
    const sesudah: any = await dbGet('SELECT basic_rate FROM employees WHERE id = ?', [emp.id]);
    chk('  tarif gajinya memang tidak berubah', Number(sesudah?.basic_rate), 777777);
  } else {
    console.log('       (tidak ada karyawan di database ini — dilewati)');
  }

  // ── 5. Role dengan permission yang tepat tetap bekerja ──────────────────
  console.log('\n5. Role dengan permission yang tepat tetap bisa bekerja');
  const roleId = (await dbRun('INSERT INTO roles (name, description, level, active) VALUES (?, ?, 3, 1)',
    [`HRINV Uji ${stamp}`, 'role sementara uji RBAC HR/inventory'])).insertId;
  for (const k of dipakai) {
    const row: any = await dbGet(`SELECT id FROM permissions WHERE CONCAT(resource,'.',action) = ?`, [k]);
    if (row) await dbRun('INSERT IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)', [roleId, row.id]);
  }
  await dbRun('UPDATE users SET role_id = ? WHERE id = ?', [roleId, uid]);
  chk('baca karyawan → 200', (await call('GET', '/hr/employees', undefined, polos)).status, 200);
  chk('baca inventory → 200', (await call('GET', '/inventory', undefined, polos)).status, 200);
  chk('baca gudang → 200', (await call('GET', '/warehouses', undefined, polos)).status, 200);
  chk('ubah tarif gaji bukan lagi 403',
    (await call('PATCH', `/hr/employees/999999/rates`, { basic_rate: 0 }, polos)).status !== 403, true);

  // ── 6. Hak baca karyawan saja tidak cukup untuk mengubah gaji ───────────
  console.log('\n6. Hak atas data karyawan TIDAK memberi hak atas angka gaji');
  const roleHR = (await dbRun('INSERT INTO roles (name, description, level, active) VALUES (?, ?, 2, 1)',
    [`HRINV Pegawai ${stamp}`, 'role uji: boleh kelola karyawan, bukan payroll'])).insertId;
  for (const k of [...dipakai].filter(k => k.startsWith('hr.employees.'))) {
    const row: any = await dbGet(`SELECT id FROM permissions WHERE CONCAT(resource,'.',action) = ?`, [k]);
    if (row) await dbRun('INSERT IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)', [roleHR, row.id]);
  }
  await dbRun('UPDATE users SET role_id = ? WHERE id = ?', [roleHR, uid]);
  chk('boleh membaca karyawan', (await call('GET', '/hr/employees', undefined, polos)).status, 200);
  chk('TIDAK boleh mengubah tarif gaji',
    (await call('PATCH', `/hr/employees/${emp?.id || 999999}/rates`, { basic_rate: 1 }, polos)).status, 403);

  // ── 7. Fitur yang dicabut tidak boleh kembali diam-diam ─────────────────
  //
  // Stock Transfer dan Stock Adjustment dicabut (CABUT-STOCK-01) karena tabel
  // yang mereka baca dan tulis tidak ada di mana pun. Kalau seseorang
  // menghidupkannya lagi tanpa membuat tabelnya, endpointnya akan 500 dan
  // `executeStockTransfer` akan menulis ke tabel `inventory` yang tidak ada —
  // persis bentuk cacat yang dulu membuat stok bertambah sementara dokumennya
  // lenyap.
  console.log('\n7. Fitur yang dicabut tidak kembali membawa tabel hantu');
  const hantu = ['stock_transfers', 'stock_adjustments'];
  const adaTabel = new Set((await dbAll(
    `SELECT TABLE_NAME AS t FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE()`
  ) as any[]).map(r => String(r.t)));
  const pelanggar: string[] = [];
  for (const f of BERKAS) {
    // `FOR UPDATE OF a` adalah klausa penguncian SQL, bukan tabel bernama
    // "of" — dibuang lebih dulu supaya tidak terbaca sebagai tabel hantu.
    const bersih = sumber[f].replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/[^\n]*$/gm, ' ')
      .replace(/FOR\s+UPDATE(\s+OF\s+\w+)?/gi, ' ');
    for (const lit of bersih.match(/`[^`]*`/g) || []) {
      for (const m of lit.matchAll(/\b(?:FROM|JOIN|INTO|UPDATE)\s+([a-z_][a-z0-9_]*)/gi)) {
        const t = m[1].toLowerCase();
        if (['select', 'dual', 'set', 'values', 'json_table'].includes(t)) continue;
        if (!adaTabel.has(t)) pelanggar.push(`${f}: ${t}`);
      }
    }
  }
  chk('tidak ada tabel yang disebut tapi tidak ada', [...new Set(pelanggar)].sort(), []);
  chk('tabel stock_transfers/stock_adjustments memang tidak dibuat',
    hantu.filter(t => adaTabel.has(t)), []);
  chk('endpoint stock-transfer/adjustment sudah tidak terdaftar',
    BERKAS.some(f => /router\.[a-z]+\('\/(stock-transfers|stock-adjustments)/.test(sumber[f])), false);

  console.log('\n8. Bersih-bersih fixture');
  await dbRun('DELETE FROM users WHERE id = ?', [uid]);
  if (emp?.id) await dbRun('DELETE FROM employees WHERE id = ?', [emp.id]);
  await dbRun('DELETE FROM role_permissions WHERE role_id IN (?, ?)', [roleId, roleHR]);
  await dbRun('DELETE FROM roles WHERE id IN (?, ?)', [roleId, roleHR]);
  chk('role & user uji terhapus', (await dbAll('SELECT id FROM roles WHERE id IN (?, ?)', [roleId, roleHR])).length, 0);

  console.log(`\n${pass} lulus, ${fail} gagal`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch(e => { console.error(e); process.exit(1); });
