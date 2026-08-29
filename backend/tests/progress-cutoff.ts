import 'dotenv/config';
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { sapuFixture } from './_bersih';
/**
 * PROJ-CTRL Fase 2 — progress cut-off dengan bukti dan persetujuan.
 *
 * Sampai Fase 1, "progress" masih turunan status task: seseorang menekan Done,
 * angkanya naik. Cukup untuk papan kerja, tidak untuk apa pun yang
 * berkonsekuensi uang — tidak ada periode, tidak ada bukti, tidak ada yang
 * menyetujui, dan tidak ada jejak siapa mengklaim berapa.
 *
 * Yang diuji di sini: tiga angka (planned/claimed/approved) tetap terpisah,
 * hanya `approved` yang jadi earned, periode yang sudah disetujui beku, dan
 * klaim tidak bisa mundur atau naik tanpa bukti.
 *
 * Prasyarat: backend jalan. Jalankan: npm run test:cutoff
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

  console.log('0. Persiapan — proyek + kontrak + WBS timpang + jadwal baseline');
  const master: string = (await call('POST', '/auth/login', { email: ADMIN_EMAIL, password: ADMIN_PASS })).json?.token;
  if (!master) { console.log('  FAIL login master'); process.exit(1); }
  pass++; console.log('  ok   login master');

  const namaClient = `Client Cutoff ${stamp}`;
  const cl = await call('POST', '/clients', { name: namaClient, status: 'active' }, master);
  const clientId = cl.json?.id ?? cl.json?.data?.id;
  const pr = await call('POST', '/projects',
    { client_id: clientId, title: `Project Cutoff ${stamp}`, status: 'open', price: 1000000000 }, master);
  const projectId = pr.json?.id ?? pr.json?.data?.id;

  const kon: any = await dbRun(
    `INSERT INTO contracts (contract_number, project_id, original_value, currency, status, created_by)
     VALUES (?, ?, 1000000000, 'IDR', 'active', NULL)`, [`CTR-CUT-${stamp}`, projectId]);
  const contractId = kon.insertId;
  for (const [ln, sec, nama, unit, qty, amt] of [
    [1, 1, `Struktur ${stamp}`, '', 0, 0],
    [2, 0, `Beton ${stamp}`, 'm3', 300, 900000000],
    [3, 0, `Galian ${stamp}`, 'm3', 500, 100000000],
  ] as any[]) {
    await dbRun(
      `INSERT INTO contract_baseline_lines
        (contract_id, line_no, section_label, is_section, description, unit, qty, unit_price, amount)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)`,
      [contractId, ln, sec ? nama : null, sec, sec ? null : nama, unit || null, qty, amt]);
  }
  // Jadwal baseline: keduanya mulai 1 Mei, beton 100 hari, galian 20 hari.
  for (const [ln, nama, mulai, durasi] of [
    [2, `Beton ${stamp}`, '2026-05-01', 100],
    [3, `Galian ${stamp}`, '2026-05-01', 20],
  ] as any[]) {
    await dbRun(
      `INSERT INTO project_schedule_baseline
        (project_id, line_no, row_type, kode, name, start_day, duration_days, start_date, end_date)
       VALUES (?, ?, 'item', NULL, ?, 0, ?, ?, ?)`,
      [projectId, ln, nama, durasi, mulai, mulai]);
  }
  await call('POST', `/projects/${projectId}/wbs/generate`, {}, master);
  const wBeton: any = await dbGet('SELECT id FROM project_wbs WHERE project_id = ? AND wbs_code = ?', [projectId, '1.1']);
  const wGalian: any = await dbGet('SELECT id FROM project_wbs WHERE project_id = ? AND wbs_code = ?', [projectId, '1.2']);
  chk('fixture siap', !!projectId && !!wBeton?.id && !!wGalian?.id, true);

  try {
    console.log('\n1. Periode dibuka, planned dihitung dari baseline jadwal');
    // Cut-off 21 Mei = 20 hari setelah 1 Mei. Galian (20 hari) → 100%,
    // beton (100 hari) → 20%.
    const buka = await call('POST', `/projects/${projectId}/progress/periods`,
      { cutoff_date: '2026-05-21', period_start: '2026-05-01', period_end: '2026-05-21' }, master);
    chk('periode terbuka', buka.status, 201);
    chk('nomor periode 1', Number(buka.json?.period_no), 1);
    chk('dua work package', Number(buka.json?.baris), 2);
    const p1 = buka.json?.period_id;

    const prog1 = await call('GET', `/projects/${projectId}/progress`, undefined, master);
    const barisBeton = (prog1.json?.current?.lines || []).find((x: any) => x.wbs_code === '1.1');
    const barisGalian = (prog1.json?.current?.lines || []).find((x: any) => x.wbs_code === '1.2');
    chk('planned galian 100% (20 dari 20 hari)', Number(barisGalian?.planned_pct), 100);
    chk('planned beton 20% (20 dari 100 hari)', Number(barisBeton?.planned_pct), 20);
    chk('bobotnya ikut dipotret', Number(barisBeton?.weight_pct), 90);

    console.log('\n2. Klaim naik WAJIB berbukti');
    await call('PUT', `/projects/${projectId}/progress/periods/${p1}/lines/${barisGalian.id}`,
      { claimed_pct: 100 }, master);
    const ajuTanpaBukti = await call('POST', `/projects/${projectId}/progress/periods/${p1}/submit`, {}, master);
    chk('pengajuan ditolak 400', ajuTanpaBukti.status, 400);
    chk('kodenya jelas', ajuTanpaBukti.json?.code, 'KLAIM_TANPA_BUKTI');
    chk('work package yang bermasalah disebut', ajuTanpaBukti.json?.wbs, ['1.2']);

    console.log('\n3. Klaim dengan bukti, lalu diajukan');
    chk('klaim galian 100% + bukti',
      (await call('PUT', `/projects/${projectId}/progress/periods/${p1}/lines/${barisGalian.id}`,
        { claimed_pct: 100, claimed_qty: 500, evidence_note: `Foto galian selesai ${stamp}` }, master)).status, 200);
    chk('klaim beton 30% + bukti',
      (await call('PUT', `/projects/${projectId}/progress/periods/${p1}/lines/${barisBeton.id}`,
        { claimed_pct: 30, claimed_qty: 90, evidence_note: `Opname beton ${stamp}` }, master)).status, 200);
    chk('klaim di atas 100 ditolak',
      (await call('PUT', `/projects/${projectId}/progress/periods/${p1}/lines/${barisBeton.id}`,
        { claimed_pct: 150 }, master)).status, 400);
    chk('pengajuan berhasil',
      (await call('POST', `/projects/${projectId}/progress/periods/${p1}/submit`, {}, master)).status, 200);
    chk('klaim terkunci setelah diajukan',
      (await call('PUT', `/projects/${projectId}/progress/periods/${p1}/lines/${barisBeton.id}`,
        { claimed_pct: 50 }, master)).json?.code, 'PERIODE_TERKUNCI');

    console.log('\n4. INI YANG MENENTUKAN — penyetuju memotong klaim beton 30% → 20%');
    chk('menyetujui melebihi klaim ditolak',
      (await call('POST', `/projects/${projectId}/progress/periods/${p1}/approve`,
        { lines: [{ line_id: barisBeton.id, approved_pct: 90 }] }, master)).json?.code,
      'PERSETUJUAN_MELEBIHI_KLAIM');
    const setuju = await call('POST', `/projects/${projectId}/progress/periods/${p1}/approve`,
      { lines: [{ line_id: barisBeton.id, approved_pct: 20, note: `belum sesuai spek ${stamp}` }] }, master);
    chk('persetujuan berhasil', setuju.status, 200);
    // earned = 90% x 20% + 10% x 100% = 18 + 10 = 28
    chk('earned 28%', Number(setuju.json?.earned_pct), 28);
    // claimed = 90% x 30% + 10% x 100% = 27 + 10 = 37
    chk('claimed tetap tercatat 37%', Number(setuju.json?.claimed_pct), 37);
    // planned = 90% x 20% + 10% x 100% = 18 + 10 = 28
    chk('planned 28%', Number(setuju.json?.planned_pct), 28);
    chk('checksumnya tertulis', String(setuju.json?.checksum || '').length, 64);

    console.log('\n5. Ketiganya tetap TERPISAH, tidak dilebur');
    const prog2 = await call('GET', `/projects/${projectId}/progress`, undefined, master);
    chk('earned dilaporkan', Number(prog2.json?.ringkasan?.earned_pct), 28);
    chk('deviasi terhadap rencana 0', Number(prog2.json?.ringkasan?.deviasi_pct), 0);
    // Inilah eksposurnya: 9% nilai proyek diklaim tapi tidak disetujui.
    chk('klaim tak disetujui dilaporkan 9%', Number(prog2.json?.ringkasan?.klaim_tidak_disetujui_pct), 9);
    chk('kurva-S hanya memuat periode disetujui', (prog2.json?.kurva || []).length, 1);

    console.log('\n6. Periode yang disetujui BEKU');
    chk('menyetujui ulang ditolak 409',
      (await call('POST', `/projects/${projectId}/progress/periods/${p1}/approve`, {}, master)).status, 409);
    chk('menolak yang sudah disetujui ditolak 409',
      (await call('POST', `/projects/${projectId}/progress/periods/${p1}/reject`, { reason: 'x' }, master)).status, 409);
    chk('mengubah klaimnya ditolak 409',
      (await call('PUT', `/projects/${projectId}/progress/periods/${p1}/lines/${barisBeton.id}`,
        { claimed_pct: 99 }, master)).status, 409);
    const beku: any = await dbGet('SELECT earned_pct FROM project_progress_periods WHERE id = ?', [p1]);
    chk('angkanya tidak bergeser', Number(beku?.earned_pct), 28);

    console.log('\n7. Status task TIDAK lagi menjadi earned progress');
    const t = (await call('POST', `/projects/${projectId}/tasks`,
      { title: `Selesaikan semua ${stamp}`, status: 'Done' }, master)).json?.id;
    await call('PUT', `/projects/${projectId}/tasks/${t}/wbs`, { wbs_id: wBeton.id }, master);
    const daftar = await call('GET', '/projects', undefined, master);
    const p = (daftar.json?.data || daftar.json || []).find((x: any) => Number(x.id) === Number(projectId));
    chk('sumbernya progress yang disetujui', p?.progress_source, 'approved_progress');
    // Kalau status task masih menang, angkanya akan melonjak ke 90.
    chk('progressnya tetap 28, bukan melonjak', Math.round(Number(p?.progress)), 28);
    const tree = await call('GET', `/projects/${projectId}/wbs`, undefined, master);
    const wp = (tree.json?.lines || []).find((x: any) => x.wbs_code === '1.1');
    chk('pohon WBS memisahkan earned dari progress task', Number(wp?.earned_pct), 20);
    chk('dan progress task tetap terlihat apa adanya', Number(wp?.progress_pct), 100);

    console.log('\n8. Periode berikutnya: klaim tidak bisa mundur');
    chk('membuka periode kedua sebelum yang pertama selesai sudah tidak berlaku — ini periode baru',
      (await call('POST', `/projects/${projectId}/progress/periods`,
        { cutoff_date: '2026-06-21' }, master)).status, 201);
    const prog3 = await call('GET', `/projects/${projectId}/progress`, undefined, master);
    const p2 = prog3.json?.current?.id;
    const b2Beton = (prog3.json?.current?.lines || []).find((x: any) => x.wbs_code === '1.1');
    chk('lantainya = yang sudah disetujui', Number(b2Beton?.prev_approved_pct), 20);
    chk('klaimnya sudah terisi dari lantai itu', Number(b2Beton?.claimed_pct), 20);
    const mundur = await call('PUT', `/projects/${projectId}/progress/periods/${p2}/lines/${b2Beton.id}`,
      { claimed_pct: 10, evidence_note: 'coba mundur' }, master);
    chk('klaim mundur ditolak 400', mundur.status, 400);
    chk('kodenya jelas', mundur.json?.code, 'KLAIM_MUNDUR');

    console.log('\n9. Penolakan mengembalikan ke draft dengan alasan tercatat');
    await call('PUT', `/projects/${projectId}/progress/periods/${p2}/lines/${b2Beton.id}`,
      { claimed_pct: 60, evidence_note: `opname juni ${stamp}` }, master);
    await call('POST', `/projects/${projectId}/progress/periods/${p2}/submit`, {}, master);
    chk('penolakan tanpa alasan ditolak',
      (await call('POST', `/projects/${projectId}/progress/periods/${p2}/reject`, {}, master)).json?.code, 'ALASAN_WAJIB');
    chk('penolakan dengan alasan berhasil',
      (await call('POST', `/projects/${projectId}/progress/periods/${p2}/reject`,
        { reason: `bukti kurang ${stamp}` }, master)).status, 200);
    const ditolak: any = await dbGet('SELECT status, rejection_reason FROM project_progress_periods WHERE id = ?', [p2]);
    chk('kembali ke draft', ditolak?.status, 'draft');
    chk('alasannya tercatat', String(ditolak?.rejection_reason || '').includes(stamp), true);
    chk('dan bisa diajukan lagi',
      (await call('POST', `/projects/${projectId}/progress/periods/${p2}/submit`, {}, master)).status, 200);

    console.log('\n10. Cut-off tidak boleh mundur & satu periode terbuka saja');
    chk('membuka periode kedua saat ada yang terbuka ditolak 409',
      (await call('POST', `/projects/${projectId}/progress/periods`, { cutoff_date: '2026-07-01' }, master)).json?.code,
      'PERIODE_MASIH_TERBUKA');
    await call('POST', `/projects/${projectId}/progress/periods/${p2}/approve`, {}, master);
    const mundurCut = await call('POST', `/projects/${projectId}/progress/periods`,
      { cutoff_date: '2026-05-10' }, master);
    chk('cut-off mundur ditolak 400', mundurCut.status, 400);
    chk('kodenya jelas', mundurCut.json?.code, 'CUTOFF_MUNDUR');

    console.log('\n11. Tidak bisa menyeberang project');
    const pr2 = await call('POST', '/projects',
      { client_id: clientId, title: `Project cutoff lain ${stamp}`, status: 'open' }, master);
    const proj2 = pr2.json?.id ?? pr2.json?.data?.id;
    chk('periode seberang tidak bisa disetujui dari sini',
      (await call('POST', `/projects/${proj2}/progress/periods/${p1}/approve`, {}, master)).status, 404);
    chk('dan klaimnya pun tidak',
      (await call('PUT', `/projects/${proj2}/progress/periods/${p1}/lines/${barisBeton.id}`,
        { claimed_pct: 1 }, master)).status, 404);
    await dbRun('DELETE FROM client_projects WHERE id = ?', [proj2]);

    console.log('\n12. Periode disetujui tidak punya jalur tulis liar');
    const dir = join(__dirname, '..', 'src', 'routes');
    let liar = 0;
    for (const f of readdirSync(dir).filter(x => x.endsWith('.ts'))) {
      const isi = readFileSync(join(dir, f), 'utf8');
      liar += (isi.match(/DELETE\s+FROM\s+project_progress_(periods|lines)/gi) || []).length;
    }
    chk('nol DELETE terhadap periode/baris progress', liar, 0);

    console.log('\n13. Terjaga auth & id tidak valid');
    chk('baca progress tanpa token 401', (await call('GET', `/projects/${projectId}/progress`)).status, 401);
    chk('setujui tanpa token 401',
      (await call('POST', `/projects/${projectId}/progress/periods/${p1}/approve`, {})).status, 401);
    chk('project tidak ada 404', (await call('GET', '/projects/99999999/progress', undefined, master)).status, 404);
    chk('cutoff ngawur 400', (await call('POST', `/projects/${projectId}/progress/periods`,
      { cutoff_date: '21-05-2026' }, master)).status, 400);

  } finally {
    console.log('\n14. Bersih-bersih');
    if (projectId) await dbRun('DELETE FROM client_projects WHERE id = ?', [projectId]);
    await dbRun('DELETE FROM contracts WHERE contract_number = ?', [`CTR-CUT-${stamp}`]);
    await sapuFixture(stamp);
    await dbRun('DELETE FROM clients WHERE name = ?', [namaClient]);
    const yatim: any = await dbGet(
      `SELECT COUNT(*) n FROM project_progress_periods pp
       LEFT JOIN client_projects p ON p.id = pp.project_id WHERE p.id IS NULL`);
    chk('nol periode tanpa project (FK cascade)', Number(yatim?.n), 0);
    const yatimBaris: any = await dbGet(
      `SELECT COUNT(*) n FROM project_progress_lines l
       LEFT JOIN project_progress_periods pp ON pp.id = l.period_id WHERE pp.id IS NULL`);
    chk('nol baris tanpa periode', Number(yatimBaris?.n), 0);
  }

  console.log(`\n=== ${pass} lulus, ${fail} gagal ===`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
