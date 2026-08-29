import 'dotenv/config';
import { readFileSync } from 'fs';
import { join } from 'path';
/**
 * PROJ-CTRL fase 0 — mutasi project tidak boleh menyeberang.
 *
 * Cacatnya terverifikasi di kode: `PUT/DELETE /projects/tasks/:taskId` dan
 * `/projects/milestones/:milestoneId` memakai `WHERE id = ?` **tanpa satu pun
 * predikat project** dan tanpa memeriksa baris terkena. Task apa pun bisa
 * diubah atau dihapus dari layar project mana pun.
 *
 * Bahayanya nyata ketika layar masih memakai task contoh ber-id 1–6: aksi
 * terhadap "task contoh" mengubah task betulan bernomor sama milik project
 * lain, sementara layar menampilkan nama task contoh.
 *
 * Prasyarat: backend jalan. Jalankan: npm run test:scope-project
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
  const { dbGet, dbRun } = await import('../src/config/database');

  console.log('0. Dua project berbeda, masing-masing dengan task & milestone');
  const master: string = (await call('POST', '/auth/login', { email: ADMIN_EMAIL, password: ADMIN_PASS })).json?.token;
  if (!master) { console.log('  FAIL login master'); process.exit(1); }
  pass++; console.log('  ok   login master');

  const namaClient = `Client Scope ${stamp}`;
  const cl = await call('POST', '/clients', { name: namaClient, status: 'active' }, master);
  const clientId = cl.json?.id ?? cl.json?.data?.id;

  const mkProject = async (label: string) => {
    const r = await call('POST', '/projects',
      { client_id: clientId, title: `Project ${label} ${stamp}`, status: 'open' }, master);
    return r.json?.id ?? r.json?.data?.id;
  };
  const projA = await mkProject('A');
  const projB = await mkProject('B');
  chk('dua project terbentuk', !!projA && !!projB && projA !== projB, true);

  const mkTask = async (pid: number, judul: string) => {
    const r = await call('POST', `/projects/${pid}/tasks`,
      { title: judul, status: 'To Do', priority: 'Medium' }, master);
    return r.json?.id;
  };
  const taskA = await mkTask(projA, `Task milik A ${stamp}`);
  const taskB = await mkTask(projB, `Task milik B ${stamp}`);
  chk('dua task terbentuk', !!taskA && !!taskB, true);

  const mkMs = async (pid: number, judul: string) => {
    const r = await call('POST', `/projects/${pid}/milestones`,
      { title: judul, status: 'Pending' }, master);
    return r.json?.id;
  };
  const msA = await mkMs(projA, `Milestone A ${stamp}`);
  const msB = await mkMs(projB, `Milestone B ${stamp}`);
  chk('dua milestone terbentuk', !!msA && !!msB, true);

  try {
    console.log('\n1. INI YANG MENENTUKAN — project A tidak bisa menyentuh task B');
    const serobot = await call('PUT', `/projects/${projA}/tasks/${taskB}`,
      { title: 'DISEROBOT DARI A', status: 'Done', priority: 'High' }, master);
    chk('ditolak 404', serobot.status, 404);
    chk('kodenya jelas', serobot.json?.code, 'TASK_BUKAN_MILIK_PROJECT');
    const bTetap: any = await dbGet('SELECT title, status FROM project_tasks WHERE id = ?', [taskB]);
    chk('judul task B tidak berubah', bTetap?.title, `Task milik B ${stamp}`);
    chk('status task B tidak berubah', bTetap?.status, 'To Do');

    console.log('\n2. Menghapus pun tidak bisa menyeberang');
    const hapus = await call('DELETE', `/projects/${projA}/tasks/${taskB}`, undefined, master);
    chk('ditolak 404', hapus.status, 404);
    const masihAda: any = await dbGet('SELECT COUNT(*) n FROM project_tasks WHERE id = ?', [taskB]);
    chk('task B masih ada', Number(masihAda?.n), 1);

    console.log('\n3. Yang sah tetap jalan');
    const sah = await call('PUT', `/projects/${projA}/tasks/${taskA}`,
      { title: `Task A diubah ${stamp}`, status: 'In Progress', priority: 'High' }, master);
    chk('perubahan pada task sendiri berhasil', sah.status, 200);
    const aBaru: any = await dbGet('SELECT title, status FROM project_tasks WHERE id = ?', [taskA]);
    chk('judulnya benar-benar berubah', aBaru?.title, `Task A diubah ${stamp}`);
    chk('statusnya ikut', aBaru?.status, 'In Progress');

    console.log('\n4. Milestone: aturan yang sama');
    const msSerobot = await call('PUT', `/projects/${projA}/milestones/${msB}`,
      { title: 'DISEROBOT', status: 'Completed' }, master);
    chk('ditolak 404', msSerobot.status, 404);
    chk('kodenya jelas', msSerobot.json?.code, 'MILESTONE_BUKAN_MILIK_PROJECT');
    const msBTetap: any = await dbGet('SELECT title FROM project_milestones WHERE id = ?', [msB]);
    chk('milestone B tidak berubah', msBTetap?.title, `Milestone B ${stamp}`);
    chk('hapus milestone seberang ditolak',
      (await call('DELETE', `/projects/${projA}/milestones/${msB}`, undefined, master)).status, 404);
    chk('milestone sendiri boleh diubah',
      (await call('PUT', `/projects/${projA}/milestones/${msA}`,
        { title: `Milestone A diubah ${stamp}`, status: 'Completed' }, master)).status, 200);

    console.log('\n5. Tautan lintas project lewat milestone_id ditutup');
    // Tanpa pemeriksaan ini, task project A bisa ditautkan ke milestone
    // project B — project seberang ikut terseret lewat pintu belakang.
    const tautSilang = await call('PUT', `/projects/${projA}/tasks/${taskA}`,
      { title: `Task A ${stamp}`, status: 'To Do', priority: 'Low', milestone_id: msB }, master);
    chk('ditolak 400', tautSilang.status, 400);
    chk('kodenya jelas', tautSilang.json?.code, 'MILESTONE_BEDA_PROJECT');
    const buatSilang = await call('POST', `/projects/${projA}/tasks`,
      { title: `Task baru ${stamp}`, milestone_id: msB }, master);
    chk('pembuatan dengan milestone seberang juga ditolak', buatSilang.status, 400);
    chk('milestone sendiri boleh ditautkan',
      (await call('PUT', `/projects/${projA}/tasks/${taskA}`,
        { title: `Task A ${stamp}`, status: 'To Do', priority: 'Low', milestone_id: msA }, master)).status, 200);

    console.log('\n6. Bentuk lama tanpa project menolak, bukan menebak');
    const lama = await call('PUT', `/projects/tasks/${taskB}`, { title: 'TANPA SCOPE' }, master);
    chk('ditolak 400', lama.status, 400);
    chk('kodenya PROJECT_SCOPE_WAJIB', lama.json?.code, 'PROJECT_SCOPE_WAJIB');
    const bMasihUtuh: any = await dbGet('SELECT title FROM project_tasks WHERE id = ?', [taskB]);
    chk('task B tetap utuh', bMasihUtuh?.title, `Task milik B ${stamp}`);
    chk('bentuk lama dengan project_id yang benar tetap dilayani',
      (await call('PUT', `/projects/tasks/${taskB}`,
        { project_id: projB, title: `Task milik B ${stamp}`, status: 'To Do' }, master)).status, 200);
    chk('bentuk lama dengan project_id yang SALAH ditolak',
      (await call('PUT', `/projects/tasks/${taskB}`,
        { project_id: projA, title: 'SEROBOT' }, master)).status, 404);

    console.log('\n7. Terjaga auth');
    chk('tanpa token 401',
      (await call('PUT', `/projects/${projA}/tasks/${taskA}`, { title: 'x' })).status, 401);
    chk('hapus tanpa token 401',
      (await call('DELETE', `/projects/${projA}/tasks/${taskA}`)).status, 401);

    console.log('\n8. Daftar project tidak lagi memalsukan isinya');
    const daftar = readFileSync(
      join(__dirname, '..', '..', 'frontend', 'src', 'views', 'ProjectsManagement.vue'), 'utf8');
    chk('tidak ada mockProjects tersisa', /mockProjects\s*=/.test(daftar), false);
    // Daftar kosong DAN kegagalan API sama-sama menghasilkan nol baris; dulu
    // keduanya diisi enam project fiktif yang tidak dibedakan dari data nyata.
    chk('daftar kosong tidak diganti data karangan',
      /length > 0 \? data : mock/.test(daftar), false);
    chk('kegagalan API punya keadaan sendiri', daftar.includes('galat.value'), true);

  } finally {
    console.log('\n9. Bersih-bersih');
    for (const id of [projA, projB]) {
      if (id) await dbRun('DELETE FROM client_projects WHERE id = ?', [id]);
    }
    await dbRun('DELETE FROM clients WHERE name = ?', [namaClient]);
    const sisa: any = await dbGet(
      `SELECT COUNT(*) n FROM project_tasks WHERE title LIKE ?`, [`%${stamp}%`]);
    chk('task fixture tersapu (FK cascade)', Number(sisa?.n), 0);
    const sisaMs: any = await dbGet(
      `SELECT COUNT(*) n FROM project_milestones WHERE title LIKE ?`, [`%${stamp}%`]);
    chk('milestone fixture tersapu', Number(sisaMs?.n), 0);
  }

  console.log(`\n=== ${pass} lulus, ${fail} gagal ===`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
