import 'dotenv/config';
import { sapuFixture } from './_bersih';
/**
 * PROJ-CTRL Fase 1 — WBS/CBS dan progress berbobot.
 *
 * Cacatnya terverifikasi di kode: progress project dihitung
 * `COUNT(task Done) * 100 / COUNT(task)`. Dua pekerjaan yang bobotnya berbeda
 * jauh dihitung sama besar, jadi "50%" bisa berarti apa saja. Dan tidak ada
 * satu pun tempat untuk menempelkan biaya ke work package — 0 dari 134 AP
 * produksi bahkan tidak punya `project_id`.
 *
 * Fixture di sini sengaja timpang: satu pekerjaan 900 juta, satu 100 juta.
 * Menyelesaikan yang kecil harus memberi 10%, bukan 50%.
 *
 * Prasyarat: backend jalan. Jalankan: npm run test:wbs
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
  return { status: res.status, json, text };
}

async function main() {
  const stamp = Date.now().toString().slice(-7);
  const { dbGet, dbAll, dbRun } = await import('../src/config/database');

  console.log('0. Persiapan — proyek dengan kontrak & BOQ timpang');
  const master: string = (await call('POST', '/auth/login', { email: ADMIN_EMAIL, password: ADMIN_PASS })).json?.token;
  if (!master) { console.log('  FAIL login master'); process.exit(1); }
  pass++; console.log('  ok   login master');

  const namaClient = `Client WBS ${stamp}`;
  const cl = await call('POST', '/clients', { name: namaClient, status: 'active' }, master);
  const clientId = cl.json?.id ?? cl.json?.data?.id;
  const pr = await call('POST', '/projects',
    { client_id: clientId, title: `Project WBS ${stamp}`, status: 'open', price: 1000000000 }, master);
  const projectId = pr.json?.id ?? pr.json?.data?.id;
  chk('project siap', !!projectId, true);

  // Kontrak + baseline BOQ dibuat langsung: yang diuji di sini pembentukan WBS,
  // bukan transisi deal (itu punya tesnya sendiri).
  const kon: any = await dbRun(
    `INSERT INTO contracts (contract_number, project_id, original_value, currency, status, created_by)
     VALUES (?, ?, 1000000000, 'IDR', 'active', NULL)`,
    [`CTR-WBS-${stamp}`, projectId]);
  const contractId = kon.insertId;
  const boq: [number, number, string, string, number, number][] = [
    // line_no, is_section, label/desc, unit, qty, amount
    [1, 1, `Pekerjaan Struktur ${stamp}`, '', 0, 0],
    [2, 0, `Beton bertulang ${stamp}`, 'm3', 300, 900000000],
    [3, 0, `Galian tanah ${stamp}`, 'm3', 500, 100000000],
  ];
  for (const [ln, sec, nama, unit, qty, amt] of boq) {
    await dbRun(
      `INSERT INTO contract_baseline_lines
        (contract_id, line_no, section_label, is_section, ahsp_code, description, unit, qty, unit_price, amount)
       VALUES (?, ?, ?, ?, NULL, ?, ?, ?, 0, ?)`,
      [contractId, ln, sec ? nama : null, sec, sec ? null : nama, unit || null, qty, amt]);
  }
  chk('kontrak + BOQ timpang siap', !!contractId, true);

  try {
    console.log('\n1. WBS dibentuk dari BOQ kontrak, bukan dikarang ulang');
    const gen = await call('POST', `/projects/${projectId}/wbs/generate`, {}, master);
    chk('pembentukan berhasil', gen.status, 201);
    chk('3 baris (1 induk + 2 work package)', Number(gen.json?.dibuat), 3);
    chk('nilai baselinenya 1 miliar', Number(gen.json?.total), 1000000000);
    chk('checksumnya tertulis', String(gen.json?.checksum || '').length, 64);

    const w: any[] = await dbAll(
      'SELECT wbs_code, level, name, baseline_value, weight_pct, source FROM project_wbs WHERE project_id = ? ORDER BY sort_order', [projectId]);
    chk('induknya level 1 berkode 1', `${w[0]?.wbs_code}/${w[0]?.level}`, '1/1');
    chk('anaknya berkode 1.1 dan 1.2', `${w[1]?.wbs_code},${w[2]?.wbs_code}`, '1.1,1.2');
    chk('asalnya dinyatakan', w[1]?.source, 'contract_baseline');

    console.log('\n2. INI YANG MENENTUKAN — bobot dari NILAI, bukan jumlah baris');
    chk('beton 900jt → bobot 90%', Number(w[1]?.weight_pct), 90);
    chk('galian 100jt → bobot 10%', Number(w[2]?.weight_pct), 10);
    // Kalau bobotnya per jumlah baris, keduanya akan 50.
    chk('bukan 50/50 seperti hitungan lama',
      Number(w[1]?.weight_pct) === 50, false);

    console.log('\n3. Pohon WBS terbaca dan bobotnya berjumlah 100');
    const tree = await call('GET', `/projects/${projectId}/wbs`, undefined, master);
    chk('terbaca', tree.status, 200);
    chk('ada WBS', tree.json?.ada_wbs, true);
    chk('total bobot 100%', Number(tree.json?.ringkasan?.total_bobot_pct), 100);
    chk('belum ada task → progress null, bukan nol',
      (tree.json?.lines || []).filter((x: any) => x.level === 2).every((x: any) => x.progress_pct === null), true);
    chk('cakupannya nol persen', Number(tree.json?.ringkasan?.cakupan_pct), 0);

    console.log('\n4. Selesaikan pekerjaan KECIL — harus 10%, bukan 50%');
    const mkTask = async (judul: string) => (await call('POST', `/projects/${projectId}/tasks`,
      { title: judul, status: 'To Do', priority: 'Medium' }, master)).json?.id;
    const tBeton = await mkTask(`Kerjakan beton ${stamp}`);
    const tGalian = await mkTask(`Kerjakan galian ${stamp}`);
    const idBeton = (await dbGet('SELECT id FROM project_wbs WHERE project_id = ? AND wbs_code = ?', [projectId, '1.1']) as any)?.id;
    const idGalian = (await dbGet('SELECT id FROM project_wbs WHERE project_id = ? AND wbs_code = ?', [projectId, '1.2']) as any)?.id;
    chk('task ditautkan ke work package beton',
      (await call('PUT', `/projects/${projectId}/tasks/${tBeton}/wbs`, { wbs_id: idBeton }, master)).status, 200);
    chk('dan galian',
      (await call('PUT', `/projects/${projectId}/tasks/${tGalian}/wbs`, { wbs_id: idGalian }, master)).status, 200);

    await call('PUT', `/projects/${projectId}/tasks/${tGalian}`,
      { title: `Kerjakan galian ${stamp}`, status: 'Done', priority: 'Medium' }, master);

    const tree2 = await call('GET', `/projects/${projectId}/wbs`, undefined, master);
    chk('progress tertimbang 10%', Number(tree2.json?.ringkasan?.progress_tertimbang_pct), 10);
    chk('cakupannya kini 100%', Number(tree2.json?.ringkasan?.cakupan_pct), 100);
    // Hitungan lama: 1 dari 2 task Done = 50%.
    chk('bukan 50% seperti hitungan lama',
      Number(tree2.json?.ringkasan?.progress_tertimbang_pct) === 50, false);

    console.log('\n5. Daftar project ikut memakai angka berbobot');
    const daftar = await call('GET', '/projects', undefined, master);
    const p = (daftar.json?.data || daftar.json || []).find((x: any) => Number(x.id) === Number(projectId));
    chk('project terbaca di daftar', !!p, true);
    chk('sumber angkanya dinyatakan', p?.progress_source, 'wbs_weighted');
    chk('progressnya 10, bukan 50', Math.round(Number(p?.progress)), 10);

    console.log('\n6. Cost code bisa ditetapkan, yang ngawur ditolak');
    const cc = await call('GET', '/projects/cost-codes', undefined, master);
    chk('katalog cost code terisi', (cc.json?.data || []).length >= 6, true);
    const idMat = (cc.json?.data || []).find((x: any) => x.code === 'MAT')?.id;
    chk('cost code ditetapkan',
      (await call('PUT', `/projects/${projectId}/wbs/${idBeton}/cost-code`, { cost_code_id: idMat }, master)).status, 200);
    chk('cost code ngawur ditolak 400',
      (await call('PUT', `/projects/${projectId}/wbs/${idBeton}/cost-code`, { cost_code_id: 99999999 }, master)).status, 400);
    const tree3 = await call('GET', `/projects/${projectId}/wbs`, undefined, master);
    chk('kodenya terbaca di pohon',
      (tree3.json?.lines || []).find((x: any) => x.wbs_code === '1.1')?.cost_code, 'MAT');

    console.log('\n7. Tidak bisa menyeberang project');
    const pr2 = await call('POST', '/projects',
      { client_id: clientId, title: `Project WBS lain ${stamp}`, status: 'open' }, master);
    const proj2 = pr2.json?.id ?? pr2.json?.data?.id;
    chk('menetapkan cost code WBS seberang ditolak 404',
      (await call('PUT', `/projects/${proj2}/wbs/${idBeton}/cost-code`, { cost_code_id: idMat }, master)).status, 404);
    const t2 = (await call('POST', `/projects/${proj2}/tasks`, { title: `Task lain ${stamp}` }, master)).json?.id;
    const taut = await call('PUT', `/projects/${proj2}/tasks/${t2}/wbs`, { wbs_id: idBeton }, master);
    chk('menautkan task ke WBS seberang ditolak 400', taut.status, 400);
    chk('kodenya jelas', taut.json?.code, 'WBS_BEDA_PROJECT');
    await dbRun('DELETE FROM client_projects WHERE id = ?', [proj2]);

    console.log('\n8. Struktur yang sudah berjalan tidak ditimpa');
    const ulang = await call('POST', `/projects/${projectId}/wbs/generate`, {}, master);
    chk('ditolak 409', ulang.status, 409);
    chk('kodenya jelas', ulang.json?.code, 'WBS_SUDAH_ADA');
    const jml: any = await dbGet('SELECT COUNT(*) n FROM project_wbs WHERE project_id = ?', [projectId]);
    chk('jumlah barisnya tidak bertambah', Number(jml?.n), 3);

    console.log('\n9. Project tanpa kontrak dan tanpa WBS dijawab jelas');
    const pr3 = await call('POST', '/projects',
      { client_id: clientId, title: `Project tanpa kontrak ${stamp}`, status: 'open' }, master);
    const proj3 = pr3.json?.id ?? pr3.json?.data?.id;
    const tanpaKontrak = await call('POST', `/projects/${proj3}/wbs/generate`, {}, master);
    chk('pembentukan ditolak 400', tanpaKontrak.status, 400);
    chk('sebabnya disebut', tanpaKontrak.json?.code, 'KONTRAK_TIDAK_ADA');
    const kosong = await call('GET', `/projects/${proj3}/wbs`, undefined, master);
    chk('pohonnya dijawab 200, bukan 404', kosong.status, 200);
    chk('dinyatakan belum punya WBS', kosong.json?.ada_wbs, false);
    chk('bukan ringkasan nol yang menyesatkan', kosong.json?.ringkasan, null);
    await dbRun('DELETE FROM client_projects WHERE id = ?', [proj3]);

    console.log('\n10. Biaya menempel ke work package');
    await dbRun(
      `INSERT INTO project_expenses
         (expense_number, project_id, wbs_id, cost_code_id, description, amount, expense_date)
       VALUES (?, ?, ?, ?, ?, 25000000, CURDATE())`,
      [`EXP-WBS-${stamp}`, projectId, idBeton, idMat, `Beli semen ${stamp}`]);
    const tree4 = await call('GET', `/projects/${projectId}/wbs`, undefined, master);
    const barisBeton = (tree4.json?.lines || []).find((x: any) => x.wbs_code === '1.1');
    chk('biaya menempel di work package', Number(barisBeton?.actual_cost), 25000000);
    const induk = (tree4.json?.lines || []).find((x: any) => x.wbs_code === '1');
    chk('dan naik ke induknya', Number(induk?.actual_cost), 25000000);
    chk('bobot induk = jumlah bobot anaknya', Number(induk?.weight_pct), 100);

    console.log('\n11. Terjaga auth & id tidak valid');
    chk('pohon tanpa token 401', (await call('GET', `/projects/${projectId}/wbs`)).status, 401);
    chk('pembentukan tanpa token 401', (await call('POST', `/projects/${projectId}/wbs/generate`, {})).status, 401);
    chk('project tidak ada 404', (await call('GET', '/projects/99999999/wbs', undefined, master)).status, 404);
    chk('id ngawur 400', (await call('GET', '/projects/abc/wbs', undefined, master)).status, 400);

  } finally {
    console.log('\n12. Bersih-bersih');
    if (projectId) await dbRun('DELETE FROM client_projects WHERE id = ?', [projectId]);
    await dbRun('DELETE FROM contracts WHERE contract_number = ?', [`CTR-WBS-${stamp}`]);
    await sapuFixture(stamp);
    await dbRun('DELETE FROM clients WHERE name = ?', [namaClient]);
    const yatim: any = await dbGet(
      `SELECT COUNT(*) n FROM project_wbs w
       LEFT JOIN client_projects p ON p.id = w.project_id WHERE p.id IS NULL`);
    chk('nol WBS tanpa project (FK cascade)', Number(yatim?.n), 0);
    const sisaBoq: any = await dbGet(
      `SELECT COUNT(*) n FROM contract_baseline_lines l
       LEFT JOIN contracts c ON c.id = l.contract_id WHERE c.id IS NULL`);
    chk('nol baris BOQ tanpa kontrak', Number(sisaBoq?.n), 0);
  }

  console.log(`\n=== ${pass} lulus, ${fail} gagal ===`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
