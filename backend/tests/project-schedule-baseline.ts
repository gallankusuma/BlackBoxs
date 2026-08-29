import 'dotenv/config';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { sapuFixture } from './_bersih';
/**
 * SCHED-R57 (penutup) — Deal menyalin jadwal revisi ke baseline project.
 *
 * Cacatnya terverifikasi di kode: transisi deal menyalin BOQ ke
 * `contract_baseline_lines` dan MTO ke scope project, tapi **tidak jadwalnya**.
 * Project lahir dengan `project_tasks` kosong, jadi jadwal yang dipakai
 * menghitung harga dan dikirim ke client hilang di serah terima — dan tidak ada
 * acuan untuk mengukur keterlambatan terhadap apa yang dijual.
 *
 * Prasyarat: backend jalan. Jalankan: npm run test:baseline-jadwal
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

  console.log('0. Persiapan');
  const master: string = (await call('POST', '/auth/login', { email: ADMIN_EMAIL, password: ADMIN_PASS })).json?.token;
  if (!master) { console.log('  FAIL login master'); process.exit(1); }
  pass++; console.log('  ok   login master');

  const ahsp = await call('POST', '/estimator/ahsp', {
    kode: `PSB.${stamp}`, name: `Beton Baseline ${stamp}`, satuan: 'm3', status: 'active',
    items: [{ section: 'A', resource_type: 'labor', resource_name: `Pekerja ${stamp}`,
      resource_satuan: 'OH', koefisien: 2, resource_harga: 150000 }],
  }, master);
  const ahspId = ahsp.json?.id ?? ahsp.json?.data?.id;

  // Deal butuh client yang bisa ditemukan.
  const namaClient = `Client Baseline ${stamp}`;
  const cl = await call('POST', '/clients', { name: namaClient, status: 'active' }, master);
  const clientId = cl.json?.id ?? cl.json?.data?.id;
  chk('AHSP + client siap', !!ahspId && !!clientId, true);

  const p = await call('POST', '/estimator/proposals',
    { project_name: `Uji baseline jadwal ${stamp}`, client: namaClient, client_id: clientId, status: 'draft' }, master);
  const pid = p.json?.id;
  await call('POST', `/estimator/proposals/${pid}/items`, { ahsp_id: ahspId, qty: 40 }, master);
  await call('PUT', `/estimator/proposals/${pid}/schedule-params`, {
    start_date: '2026-05-04', workers_per_day: 10, hours_per_day: 8, workdays_per_week: 6,
  }, master);
  chk('proposal siap', !!pid, true);

  let projectId: number | null = null;
  try {
    console.log('\n1. Submit membekukan jadwalnya (prasyarat)');
    const inc = await call('GET', `/estimator/proposals/${pid}/items/incomplete`, undefined, master);
    const ids = (inc.json?.items || []).map((x: any) => x.id);
    if (ids.length) {
      await call('PUT', `/estimator/proposals/${pid}/items/scope`,
        { item_ids: ids, scope_status: 'excluded', scope_note: 'fixture' }, master);
    }
    await call('PUT', `/estimator/proposals/${pid}/status`, { status: 'review' }, master);
    await call('PUT', `/estimator/proposals/${pid}/status`, { status: 'submitted' }, master);
    const rev: any = await dbGet(
      `SELECT id, revision_no, schedule_total_days FROM proposal_revisions
       WHERE proposal_id = ? ORDER BY revision_no DESC LIMIT 1`, [pid]);
    // 40 m3 x 2 OH = 80 OH / 10 pekerja = 8 hari.
    chk('jadwal revisi terbentuk 8 hari', Number(rev?.schedule_total_days), 8);

    console.log('\n2. Deal menyalin jadwal itu ke baseline project');
    const deal = await call('PUT', `/estimator/proposals/${pid}/status`, { status: 'deal' }, master);
    chk('deal berhasil', deal.status, 200);
    projectId = deal.json?.project_id ?? deal.json?.projectId ?? null;
    if (!projectId) {
      const pr: any = await dbGet('SELECT id FROM client_projects WHERE proposal_id = ?', [pid]);
      projectId = pr?.id ?? null;
    }
    chk('project terbentuk', !!projectId, true);

    const bl: any[] = await dbAll(
      'SELECT * FROM project_schedule_baseline WHERE project_id = ? ORDER BY line_no', [projectId]);
    chk('baseline jadwal ikut tersalin', bl.length > 0, true);
    chk('asal revisinya tercatat', Number(bl[0]?.revision_no), Number(rev.revision_no));
    chk('proposal asalnya tercatat', Number(bl[0]?.proposal_id), Number(pid));

    console.log('\n3. Yang disalin persis sama, BUKAN dihitung ulang');
    const src: any[] = await dbAll(
      'SELECT line_no, duration_days, start_date FROM proposal_revision_schedule WHERE revision_id = ? ORDER BY line_no',
      [rev.id]);
    chk('jumlah barisnya sama', bl.length, src.length);
    const sama = src.length > 0 && src.length === bl.length && src.every((s: any, i: number) =>
      Number(s.duration_days) === Number(bl[i]?.duration_days) &&
      String(s.start_date ?? '') === String(bl[i]?.start_date ?? ''));
    chk('durasi & tanggal tiap baris identik', sama, true);

    const proyek: any = await dbGet(
      'SELECT schedule_baseline_checksum, schedule_baseline_days, schedule_baseline_start FROM client_projects WHERE id = ?',
      [projectId]);
    chk('checksum baseline tertulis', String(proyek?.schedule_baseline_checksum || '').length, 64);
    chk('total harinya sama dengan revisi', Number(proyek?.schedule_baseline_days), 8);
    chk('tanggal mulainya ikut', String(proyek?.schedule_baseline_start).slice(0, 10), '2026-05-04');

    console.log('\n4. Endpoint baseline terbaca dan menyebut asalnya');
    const r = await call('GET', `/projects/${projectId}/schedule-baseline`, undefined, master);
    chk('terbaca', r.status, 200);
    chk('ada baseline', r.json?.ada_baseline, true);
    chk('revisinya disebut', Number(r.json?.revision_no), Number(rev.revision_no));
    chk('total hari dilaporkan', Number(r.json?.total_days), 8);
    chk('barisnya ada', (r.json?.lines || []).length > 0, true);
    chk('belum ada task, jadi belum tertaut', r.json?.ringkasan?.tertaut, 0);
    chk('selisih baris yang belum tertaut null, bukan nol',
      (r.json?.variance || []).every((v: any) => v.selisih_hari === null), true);

    console.log('\n5. Master AHSP diubah setelah deal — baseline TIDAK bergeser');
    await dbRun(`UPDATE ahsp_items SET koefisien = koefisien * 5 WHERE ahsp_id = ?`, [ahspId]);
    const r2 = await call('GET', `/projects/${projectId}/schedule-baseline`, undefined, master);
    chk('total harinya tetap 8', Number(r2.json?.total_days), 8);
    chk('checksumnya tidak berubah', r2.json?.checksum, r.json?.checksum);

    console.log('\n6. Rencana kerja dibentuk atas permintaan, bukan diam-diam');
    const tugasAwal: any = await dbGet('SELECT COUNT(*) n FROM project_tasks WHERE project_id = ?', [projectId]);
    chk('deal TIDAK membuat task diam-diam', Number(tugasAwal?.n), 0);
    const seed = await call('POST', `/projects/${projectId}/schedule/seed-from-baseline`, {}, master);
    chk('pembentukan berhasil', seed.status, 201);
    chk('task terbentuk', Number(seed.json?.dibuat) > 0, true);
    const tugas: any[] = await dbAll(
      'SELECT title, start_date, due_date FROM project_tasks WHERE project_id = ? ORDER BY sort_order', [projectId]);
    chk('tanggal task mengikuti baseline', String(tugas[0]?.start_date).slice(0, 10), '2026-05-04');
    // 8 hari dari 4 Mei = 12 Mei.
    chk('tanggal selesainya ikut durasi baseline', String(tugas[0]?.due_date).slice(0, 10), '2026-05-12');

    console.log('\n7. Tidak menimpa rencana kerja yang sudah berjalan');
    const ulang = await call('POST', `/projects/${projectId}/schedule/seed-from-baseline`, {}, master);
    chk('ditolak 409', ulang.status, 409);
    chk('kodenya jelas', ulang.json?.code, 'RENCANA_KERJA_SUDAH_ADA');
    const tugas2: any = await dbGet('SELECT COUNT(*) n FROM project_tasks WHERE project_id = ?', [projectId]);
    chk('jumlah task tidak bertambah', Number(tugas2?.n), tugas.length);

    console.log('\n8. Selisih terhadap rencana kerja terhitung');
    // Task digeser mundur 3 hari — itulah keterlambatan yang harus terlihat.
    await dbRun(`UPDATE project_tasks SET due_date = DATE_ADD(due_date, INTERVAL 3 DAY) WHERE project_id = ?`, [projectId]);
    const r3 = await call('GET', `/projects/${projectId}/schedule-baseline`, undefined, master);
    const v = (r3.json?.variance || []).find((x: any) => x.status === 'tertaut');
    chk('barisnya tertaut ke task', !!v, true);
    chk('selisihnya +3 hari', Number(v?.selisih_hari), 3);
    chk('ringkasannya menjumlahkan', Number(r3.json?.ringkasan?.total_selisih_hari), 3);

    console.log('\n9. Baseline TIDAK punya jalur tulis');
    // Aturan yang sama dengan contract_baseline_lines: begitu ada UPDATE/DELETE
    // terhadapnya, "apa yang dijual" berhenti bisa dibuktikan.
    const dirRute = join(__dirname, '..', 'src', 'routes');
    let tulis = 0;
    for (const f of readdirSync(dirRute).filter(x => x.endsWith('.ts'))) {
      const isi = readFileSync(join(dirRute, f), 'utf8');
      tulis += (isi.match(/UPDATE\s+project_schedule_baseline|DELETE\s+FROM\s+project_schedule_baseline/gi) || []).length;
    }
    chk('nol UPDATE/DELETE terhadap baseline di seluruh rute', tulis, 0);

    console.log('\n10. Project tanpa baseline dibedakan dari baseline kosong');
    const pk = await call('POST', '/projects', {
      client_id: clientId, title: `Project tanpa baseline ${stamp}`, status: 'open',
    }, master);
    const pkId = pk.json?.id ?? pk.json?.data?.id;
    if (pkId) {
      const rk = await call('GET', `/projects/${pkId}/schedule-baseline`, undefined, master);
      chk('dijawab 200, bukan 404', rk.status, 200);
      chk('dinyatakan tidak punya baseline', rk.json?.ada_baseline, false);
      chk('dan sebabnya disebut', String(rk.json?.sebab || '').length > 10, true);
      chk('bukan total_days 0 yang menyesatkan', rk.json?.ringkasan, null);
      await dbRun('DELETE FROM client_projects WHERE id = ?', [pkId]);
    } else {
      chk('project uji tanpa baseline terbentuk', !!pkId, true);
    }

    console.log('\n11. Terjaga auth & id tidak valid');
    chk('tanpa token 401', (await call('GET', `/projects/${projectId}/schedule-baseline`)).status, 401);
    chk('seed tanpa token 401',
      (await call('POST', `/projects/${projectId}/schedule/seed-from-baseline`, {})).status, 401);
    chk('project tidak ada 404',
      (await call('GET', '/projects/99999999/schedule-baseline', undefined, master)).status, 404);
    chk('id ngawur 400',
      (await call('GET', '/projects/abc/schedule-baseline', undefined, master)).status, 400);

    console.log('\n12. Layar project tidak lagi memalsukan data');
    // Tab Tasks/Kanban/Gantt/Milestones dulu diisi daftar hardcode
    // ("John Doe", "Setup project infrastructure") padahal endpointnya sudah
    // ada dan bekerja. Yang paling merugikan: saveTask menyimpan task betulan
    // lalu loadTasks() menimpanya kembali dengan data palsu, sehingga task
    // yang baru dibuat hilang dari layar padahal tersimpan.
    const layarMentah = readFileSync(
      join(__dirname, '..', '..', 'frontend', 'src', 'views', 'ProjectDetail.vue'), 'utf8');
    // Komentar dibuang lebih dulu: catatan sejarah yang MENYEBUT nama karangan
    // itu justru berguna, yang dilarang adalah menampilkannya ke pengguna.
    const layar = layarMentah
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
    chk('tidak ada satu pun getMock* tersisa', /getMock[A-Za-z]*\s*=/.test(layar), false);
    chk('task dibaca dari endpointnya', layar.includes('/tasks`)'), true);
    chk('milestone dibaca dari endpointnya', layar.includes('/milestones`)'), true);
    chk('nama karangan tidak ada lagi di layar', /John Doe|Jane Smith|Mike Johnson/.test(layar), false);
    // Endpoint yang dipanggil layar itu harus benar-benar ada.
    const tugasApi = await call('GET', `/projects/${projectId}/tasks`, undefined, master);
    chk('endpoint task menjawab', tugasApi.status, 200);
    chk('dan isinya task yang benar-benar tersimpan',
      Array.isArray(tugasApi.json) && tugasApi.json.length > 0, true);
    chk('judulnya dari baseline, bukan "Setup project infrastructure"',
      String(tugasApi.json?.[0]?.title || '').includes('Beton Baseline'), true);
    const msApi = await call('GET', `/projects/${projectId}/milestones`, undefined, master);
    chk('endpoint milestone menjawab', msApi.status, 200);

    // project_activities ditulis dari enam tempat tapi tidak pernah dibaca —
    // layarnya menampilkan dua aktivitas karangan yang sama untuk tiap project.
    chk('aktivitas karangan tidak ada lagi di layar',
      /Sarah Ann|Design Wireframes|Mock Activities/.test(layar), false);
    const akt = await call('GET', `/projects/${projectId}/activities`, undefined, master);
    chk('endpoint aktivitas menjawab', akt.status, 200);
    chk('dan mencatat pembentukan rencana kerja tadi',
      (akt.json?.data || []).some((a: any) => a.action_type === 'seed_schedule'), true);
    chk('batas jumlahnya tidak bisa dibuat ngawur',
      (await call('GET', `/projects/${projectId}/activities?limit=abc`, undefined, master)).status, 200);

  } finally {
    console.log('\n13. Bersih-bersih');
    if (projectId) await dbRun('DELETE FROM client_projects WHERE id = ?', [projectId]);
    const disapu = await sapuFixture(stamp, [`PSB.${stamp}`]);
    chk('fixture tersapu', disapu.proposal >= 1, true);
    await dbRun('DELETE FROM clients WHERE name = ?', [namaClient]);
    const yatim: any = await dbGet(
      `SELECT COUNT(*) n FROM project_schedule_baseline b
       LEFT JOIN client_projects p ON p.id = b.project_id WHERE p.id IS NULL`);
    chk('nol baris baseline tanpa project (FK cascade)', Number(yatim?.n), 0);
  }

  console.log(`\n=== ${pass} lulus, ${fail} gagal ===`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
