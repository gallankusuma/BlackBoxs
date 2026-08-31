import 'dotenv/config';
/**
 * Perencanaan CAPEX / OPEX tahunan.
 *
 * Modul ini menjawab pertanyaan yang selama ini tidak punya tempat di aplikasi:
 * **berapa yang boleh dibelanjakan tahun ini, dan berapa yang sudah pergi.**
 * Estimator menghitung penawaran, project mengeksekusi — tapi tidak ada satu
 * pun layar yang bisa menjawab "pagu CAPEX 2026 sudah habis berapa persen".
 *
 * Empat hal yang diuji paling keras, karena keempatnya adalah cara paling umum
 * sebuah laporan anggaran menipu pembacanya:
 *
 *   1. **Sisa pagu memakai TERIKAT, bukan realisasi.** Kalau memakai realisasi,
 *      pagu terlihat longgar sepanjang tahun lalu habis mendadak di bulan
 *      terakhir saat tagihan masuk. Uangnya sudah pergi saat kontrak diteken,
 *      bukan saat invoice dibayar.
 *   2. **Rencana ≠ pagu.** Baris yang disetujui bisa jauh di bawah pagu; sisa
 *      yang belum dialokasikan harus terlihat sebagai angka tersendiri, bukan
 *      diam-diam dianggap sudah direncanakan.
 *   3. **Unplanned dipisah dan dihitung porsinya.** Itulah satu-satunya angka
 *      yang menilai kualitas perencanaan tahun sebelumnya.
 *   4. **Melebihi pagu ditampilkan negatif, tidak dipotong ke nol.** Sisa yang
 *      dipaksa nol menyembunyikan justru keadaan yang paling perlu dilihat.
 *
 * Prasyarat: backend jalan. Jalankan: npm run test:budget
 */
const API = process.env.API || 'http://localhost:3005/api';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'master@admin.com';
const ADMIN_PASS = process.env.ADMIN_PASS || process.env.MASTER_PASSWORD || 'master';

const TAHUN_UJI = 2099;
const JT = 1_000_000;

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

  const master: string = (await call('POST', '/auth/login', { email: ADMIN_EMAIL, password: ADMIN_PASS })).json?.token;
  if (!master) { console.log('  FAIL login master'); process.exit(1); }
  pass++; console.log('0. ok   login master');

  // Idempoten: tahun uji dibersihkan lebih dulu, bukan di akhir saja — kalau
  // run sebelumnya mati di tengah, run berikutnya tetap bisa jalan.
  const bersihkanTahun = async () => {
    const t: any = await dbGet('SELECT id FROM budget_years WHERE year = ?', [TAHUN_UJI]);
    if (t) {
      await dbRun('UPDATE proposals SET budget_line_id = NULL WHERE budget_line_id IN (SELECT id FROM budget_lines WHERE budget_year_id = ?)', [t.id]);
      await dbRun('DELETE FROM budget_years WHERE id = ?', [t.id]);
    }
  };
  await bersihkanTahun();

  const proyek: number[] = [];
  const proposal: number[] = [];
  const kontrak: number[] = [];
  const ap: number[] = [];

  try {
    console.log('\n1. Tahun anggaran');
    const th = await call('POST', '/budget/years',
      { year: TAHUN_UJI, capex_ceiling: 1000 * JT, opex_ceiling: 500 * JT, note: `uji ${stamp}` }, master);
    chk('tahun dibuat', th.status, 201);
    const yid = th.json?.id;

    chk('tahun kembar ditolak',
      (await call('POST', '/budget/years', { year: TAHUN_UJI, capex_ceiling: 1, opex_ceiling: 1 }, master)).json?.code,
      'TAHUN_SUDAH_ADA');
    chk('tahun di luar akal ditolak',
      (await call('POST', '/budget/years', { year: 1899, capex_ceiling: 1, opex_ceiling: 1 }, master)).status, 400);
    chk('pagu negatif ditolak',
      (await call('POST', '/budget/years', { year: 2098, capex_ceiling: -5, opex_ceiling: 1 }, master)).status, 400);
    chk('tanpa token 401', (await call('GET', '/budget/years')).status, 401);

    console.log('\n2. Baris anggaran — penjagaan masukan');
    const buatBaris = (b: any) => call('POST', `/budget/years/${yid}/lines`, b, master);
    const A = (await buatBaris({ code: 'CX-A', type: 'capex', title: `Revamp reaktor ${stamp}`,
      requesting_department: 'Produksi', planned_amount: 400 * JT, priority: 'tinggi' })).json?.id;
    const B = (await buatBaris({ code: 'OX-B', type: 'opex', title: `Overhaul pompa ${stamp}`,
      requesting_department: 'Maintenance', planned_amount: 200 * JT })).json?.id;
    const D = (await buatBaris({ code: 'CX-D', type: 'capex', title: `Gudang B3 ${stamp}`,
      planned_amount: 250 * JT })).json?.id;
    const E = (await buatBaris({ code: 'CX-E', type: 'capex', title: `Kalibrasi ${stamp}`,
      planned_amount: 50 * JT })).json?.id;
    chk('empat baris terbuat', [A, B, D, E].every(Boolean), true);

    chk('kode kembar ditolak',
      (await buatBaris({ code: 'CX-A', type: 'capex', title: 'x', planned_amount: 1 })).json?.code, 'KODE_SUDAH_ADA');
    chk('jenis selain capex/opex ditolak',
      (await buatBaris({ code: 'ZZ', type: 'belanja', title: 'x', planned_amount: 1 })).json?.code, 'JENIS_TIDAK_DIKENAL');
    chk('judul kosong ditolak',
      (await buatBaris({ code: 'ZZ', type: 'capex', title: '   ', planned_amount: 1 })).json?.code, 'JUDUL_WAJIB');
    chk('nilai negatif ditolak',
      (await buatBaris({ code: 'ZZ', type: 'capex', title: 'x', planned_amount: -1 })).json?.code, 'NILAI_TIDAK_VALID');

    console.log('\n3. Pagu hanya boleh dibebani baris yang SUDAH disetujui');
    // Fixture proposal dibuat lebih dulu supaya bisa dipakai menguji penolakan.
    const buatProposal = async (nama: string, status: string, projectId: number | null, nilaiRevisi: number | null) => {
      const r = await dbRun(
        `INSERT INTO proposals (project_name, status, project_id, total_project) VALUES (?, ?, ?, ?)`,
        [`${nama} ${stamp}`, status, projectId, nilaiRevisi ?? 0]);
      proposal.push(r.insertId);
      if (nilaiRevisi !== null) {
        await dbRun(
          `INSERT INTO proposal_revisions (proposal_id, revision_no, status, total_project) VALUES (?, 1, 'issued', ?)`,
          [r.insertId, nilaiRevisi]);
      }
      return r.insertId as number;
    };
    const buatProyek = async (nama: string) => {
      const cl: any = await dbGet('SELECT id FROM clients LIMIT 1');
      const r = await dbRun(
        `INSERT INTO client_projects (client_id, project_number, project_name) VALUES (?, ?, ?)`,
        [cl?.id || 1, `UJI-${stamp}-${proyek.length}`, `Proyek uji ${stamp}`]);
      proyek.push(r.insertId); return r.insertId as number;
    };

    const projX = await buatProyek('X');
    const P1 = await buatProposal('Revamp', 'deal', projX, 400 * JT);

    chk('proposal ke baris yang masih usulan ditolak',
      (await call('PUT', `/budget/lines/${A}/proposal/${P1}`, {}, master)).json?.code, 'BARIS_BELUM_DISETUJUI');

    for (const id of [A, B, E]) {
      await call('PUT', `/budget/lines/${id}/status`, { status: 'disetujui' }, master);
    }
    chk('penolakan tanpa alasan ditolak',
      (await call('PUT', `/budget/lines/${D}/status`, { status: 'ditolak' }, master)).json?.code, 'ALASAN_WAJIB');
    chk('status karangan ditolak',
      (await call('PUT', `/budget/lines/${D}/status`, { status: 'ajaib' }, master)).json?.code, 'STATUS_TIDAK_DIKENAL');
    chk('baris disetujui menerima proposal',
      (await call('PUT', `/budget/lines/${A}/proposal/${P1}`, {}, master)).status, 200);
    chk('proposal tidak bisa dipindah diam-diam ke baris lain',
      (await call('PUT', `/budget/lines/${B}/proposal/${P1}`, {}, master)).json?.code, 'PROPOSAL_SUDAH_DIBEBANKAN');

    console.log('\n4. Tahun berjalan hanya menerima pekerjaan UNPLANNED');
    await call('PUT', `/budget/years/${yid}/status`, { status: 'active' }, master);
    chk('rencana baru di tahun berjalan ditolak',
      (await buatBaris({ code: 'CX-Z', type: 'capex', title: 'Selundupan', planned_amount: 10 * JT })).json?.code,
      'HARUS_UNPLANNED');
    chk('unplanned tanpa alasan ditolak',
      (await buatBaris({ code: 'CX-Z', type: 'capex', title: 'Darurat', planned_amount: 10 * JT, is_unplanned: true })).json?.code,
      'ALASAN_UNPLANNED_WAJIB');
    const C = (await buatBaris({ code: 'CX-C', type: 'capex', title: `Ganti heat exchanger bocor ${stamp}`,
      planned_amount: 100 * JT, is_unplanned: true,
      unplanned_reason: 'Kebocoran terdeteksi saat shutdown Maret, tidak masuk rencana' })).json?.id;
    chk('unplanned beralasan diterima', Boolean(C), true);
    await call('PUT', `/budget/lines/${C}/status`, { status: 'disetujui' }, master);

    console.log('\n5. Serapan — terikat, pipeline, realisasi');
    // Project X: AP 100 jt, tanpa kontrak. Nilai terikat jatuh ke revisi terbit.
    const apR = await dbRun(
      `INSERT INTO accounts_payable (project_id, amount, description) VALUES (?, ?, ?)`,
      [projX, 100 * JT, `uji ${stamp}`]);
    ap.push(apR.insertId);

    // Project Y: punya kontrak 350 jt + CO disetujui 50 jt. Revisinya sengaja
    // dibuat 300 jt — kalau laporan memakai revisi, angkanya akan salah.
    const projY = await buatProyek('Y');
    const P3 = await buatProposal('Heat exchanger', 'deal', projY, 300 * JT);
    const kR = await dbRun(
      `INSERT INTO contracts (contract_number, project_id, proposal_id, original_value, status)
       VALUES (?, ?, ?, ?, 'active')`, [`KTR-${stamp}`, projY, P3, 350 * JT]);
    kontrak.push(kR.insertId);
    await dbRun(
      `INSERT INTO change_orders (co_number, contract_id, title, value_delta, status)
       VALUES (?, ?, ?, ?, 'approved')`, [`CO-${stamp}-1`, kR.insertId, 'Tambah nozzle', 50 * JT]);
    // CO yang belum disetujui tidak boleh ikut menghabiskan pagu.
    await dbRun(
      `INSERT INTO change_orders (co_number, contract_id, title, value_delta, status)
       VALUES (?, ?, ?, ?, 'submitted')`, [`CO-${stamp}-2`, kR.insertId, 'Belum disetujui', 999 * JT]);
    await call('PUT', `/budget/lines/${C}/proposal/${P3}`, {}, master);

    // Penawaran terbit tapi belum deal — pipeline, belum memakan pagu.
    const P2 = await buatProposal('Belum deal', 'submitted', null, 120 * JT);
    await call('PUT', `/budget/lines/${A}/proposal/${P2}`, {}, master);

    // Opex melebihi pagunya sendiri.
    const projZ = await buatProyek('Z');
    const P5 = await buatProposal('Overhaul', 'deal', projZ, 600 * JT);
    await call('PUT', `/budget/lines/${B}/proposal/${P5}`, {}, master);

    const s1 = (await call('GET', `/budget/years/${yid}/serapan`, undefined, master)).json;
    chk('capex terikat = revisi P1 + kontrak P3 (bukan revisi P3)', s1?.capex?.terikat, 800 * JT);
    chk('CO disetujui ikut, CO submitted tidak', s1?.capex?.terikat, 800 * JT);
    chk('capex pipeline = penawaran terbit yang belum deal', s1?.capex?.pipeline, 120 * JT);
    chk('capex realisasi = AP project X', s1?.capex?.realisasi, 100 * JT);
    // Inti modul ini: sisa memakai TERIKAT. Kalau memakai realisasi,
    // angkanya akan 900 jt dan pagu terlihat masih longgar.
    chk('sisa pagu memakai terikat, bukan realisasi', s1?.capex?.sisa_pagu, 200 * JT);
    chk('rencana hanya baris yang disetujui', s1?.capex?.rencana, 550 * JT);
    chk('usulan yang belum disetujui dilaporkan terpisah', s1?.capex?.rencana_usulan, 250 * JT);
    chk('pagu yang belum dialokasikan terlihat', s1?.capex?.belum_dialokasikan, 450 * JT);
    chk('baris disetujui yang belum punya proposal terhitung', s1?.capex?.jml_belum_ada_proposal, 1);
    chk('porsi unplanned dihitung dari terikat', s1?.capex?.porsi_unplanned_pct, 50);
    chk('serapan capex persen', s1?.capex?.serapan_pct, 80);
    chk('realisasi persen dihitung terhadap terikat', s1?.capex?.realisasi_pct, 12.5);
    chk('capex belum melebihi pagu', s1?.capex?.melebihi_pagu, false);

    console.log('\n6. Melebihi pagu ditampilkan apa adanya');
    chk('opex terikat', s1?.opex?.terikat, 600 * JT);
    chk('opex sisa negatif, tidak dipotong nol', s1?.opex?.sisa_pagu, -100 * JT);
    chk('opex ditandai melebihi pagu', s1?.opex?.melebihi_pagu, true);
    chk('opex tanpa unplanned', s1?.opex?.porsi_unplanned_pct, 0);
    chk('total pagu dijumlah', s1?.total?.pagu, 1500 * JT);
    chk('total terikat dijumlah', s1?.total?.terikat, 1400 * JT);

    console.log('\n7. Dua proposal di satu project tidak menggandakan realisasi');
    const P4 = await buatProposal('Tambahan', 'deal', projX, 10 * JT);
    await call('PUT', `/budget/lines/${A}/proposal/${P4}`, {}, master);
    const s2 = (await call('GET', `/budget/years/${yid}/serapan`, undefined, master)).json;
    chk('terikat bertambah', s2?.capex?.terikat, 810 * JT);
    chk('realisasi TIDAK ikut berlipat', s2?.capex?.realisasi, 100 * JT);
    chk('porsi unplanned ikut bergeser', s2?.capex?.porsi_unplanned_pct, 49.4);

    console.log('\n8. Baris yang sudah dipakai tidak bisa dicabut diam-diam');
    const cabut = await call('PUT', `/budget/lines/${A}/status`, { status: 'dibatalkan' }, master);
    chk('pembatalan baris terpakai ditolak', cabut.json?.code, 'BARIS_SUDAH_DIPAKAI');
    chk('jumlah proposal disebut dalam penolakan', cabut.json?.jml_proposal, 3);
    chk('baris kosong boleh dibatalkan',
      (await call('PUT', `/budget/lines/${E}/status`, { status: 'dibatalkan' }, master)).status, 200);

    console.log('\n9. Daftar baris membawa serapannya sendiri');
    const daftar = (await call('GET', `/budget/years/${yid}/lines`, undefined, master)).json;
    const bA = daftar?.lines?.find((l: any) => l.id === A);
    const bC = daftar?.lines?.find((l: any) => l.id === C);
    chk('baris A terikat', bA?.terikat, 410 * JT);
    chk('baris A melebihi rencananya sendiri', bA?.deviasi, 10 * JT);
    chk('sisa rencana baris A negatif', bA?.sisa_rencana, -10 * JT);
    chk('baris C ditandai unplanned', bC?.is_unplanned, true);
    chk('alasan unplanned tersimpan', String(bC?.unplanned_reason || '').includes('shutdown Maret'), true);
    chk('baris C membawa daftar proposalnya', bC?.proposals?.length, 1);

    console.log('\n10. Tahun ditutup tidak bisa dibuka lagi');
    await call('PUT', `/budget/years/${yid}/status`, { status: 'closed' }, master);
    chk('tahun tertutup menolak baris baru',
      (await buatBaris({ code: 'CX-Y', type: 'capex', title: 'x', planned_amount: 1,
        is_unplanned: true, unplanned_reason: 'x' })).json?.code, 'TAHUN_SUDAH_DITUTUP');
    chk('tahun tertutup tidak bisa diaktifkan lagi',
      (await call('PUT', `/budget/years/${yid}/status`, { status: 'active' }, master)).json?.code,
      'TAHUN_SUDAH_DITUTUP');

    console.log('\n11. Menghapus anggaran tidak menghapus proposal');
    // `proposals.budget_line_id` sengaja INDEX, bukan FK. Anggaran adalah
    // catatan perencanaan; proposal yang sudah dikirim ke pihak lain tidak
    // boleh ikut lenyap kalau baris anggarannya dirapikan.
    await dbRun('DELETE FROM budget_years WHERE id = ?', [yid]);
    const sisaBaris: any = await dbGet('SELECT COUNT(*) n FROM budget_lines WHERE budget_year_id = ?', [yid]);
    chk('baris ikut terhapus (FK cascade)', Number(sisaBaris?.n), 0);
    const sisaProposal: any = await dbGet('SELECT COUNT(*) n FROM proposals WHERE id = ?', [P1]);
    chk('proposal tetap ada', Number(sisaProposal?.n), 1);

    console.log('\n12. Layar anggaran');
    const { readFileSync } = await import('fs');
    const { join } = await import('path');
    const fe = join(process.cwd(), '..', 'frontend', 'src');
    const layar = readFileSync(join(fe, 'views', 'AnnualBudget.vue'), 'utf8');
    // Empat angka itu harus terbaca berbeda di layar, bukan cuma di API.
    chk('layar memisahkan pagu/rencana/terikat/realisasi',
      ['Pagu', 'Rencana', 'Terikat', 'Realisasi'].every(k => layar.includes(k)), true);
    chk('sisa negatif ditandai merah, tidak disembunyikan',
      layar.includes("sisa_pagu < 0 ? 'text-red-700'"), true);
    chk('porsi unplanned ditampilkan', layar.includes('porsi_unplanned_pct'), true);
    chk('pagu yang belum dialokasikan ditampilkan', layar.includes('belum_dialokasikan'), true);
    chk('usulan yang belum diputuskan ditampilkan', layar.includes('rencana_usulan'), true);
    // Alasan unplanned diminta di formulir, bukan menunggu server menolak.
    chk('alasan unplanned diminta di formulir', layar.includes('unplanned_reason'), true);
    chk('formulir tahu kapan unplanned wajib', layar.includes('wajibUnplanned'), true);
    chk('penolakan meminta alasan di layar', layar.includes('Alasan menolak'), true);
    const router = readFileSync(join(fe, 'router', 'index.ts'), 'utf8');
    chk('route terdaftar', router.includes("path: '/budget'"), true);
    const menu = readFileSync(join(fe, 'components', 'Layout.vue'), 'utf8');
    chk('menu terdaftar', menu.includes("route: '/budget'"), true);
    chk('permKey memakai resource yang sudah ada',
      /id: 'annual-budget'[^}]*permKey: 'estimator\.estimator-proposals'/.test(menu), true);
    chk('anggaran dipasang sebelum Proposal',
      menu.indexOf("route: '/budget'") < menu.indexOf("route: '/estimator'"), true);

  } finally {
    console.log('\n13. Bersih-bersih');
    for (const id of ap) await dbRun('DELETE FROM accounts_payable WHERE id = ?', [id]).catch(() => {});
    for (const id of kontrak) {
      await dbRun('DELETE FROM change_orders WHERE contract_id = ?', [id]).catch(() => {});
      await dbRun('DELETE FROM contracts WHERE id = ?', [id]).catch(() => {});
    }
    for (const id of proposal) {
      await dbRun('DELETE FROM proposal_revisions WHERE proposal_id = ?', [id]).catch(() => {});
      await dbRun('DELETE FROM proposals WHERE id = ?', [id]).catch(() => {});
    }
    for (const id of proyek) await dbRun('DELETE FROM client_projects WHERE id = ?', [id]).catch(() => {});
    await bersihkanTahun();
    const sisa: any = await dbGet('SELECT COUNT(*) n FROM proposals WHERE project_name LIKE ?', [`%${stamp}%`]);
    chk('proposal fixture tersapu', Number(sisa?.n), 0);
    const sisaTh: any = await dbGet('SELECT COUNT(*) n FROM budget_years WHERE year = ?', [TAHUN_UJI]);
    chk('tahun uji tersapu', Number(sisaTh?.n), 0);
    const yatim: any = await dbGet(
      `SELECT COUNT(*) n FROM budget_lines l
       LEFT JOIN budget_years y ON y.id = l.budget_year_id WHERE y.id IS NULL`);
    chk('nol baris tanpa tahun', Number(yatim?.n), 0);
  }

  console.log(`\n=== ${pass} lulus, ${fail} gagal ===`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
