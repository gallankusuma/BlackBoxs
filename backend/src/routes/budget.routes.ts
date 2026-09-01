/**
 * Anggaran CAPEX & OPEX tahunan — hulu dari seluruh alur.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * Pertanyaan yang harus bisa dijawab kapan saja, dan itulah seluruh gunanya:
 *
 *   "Baris anggaran ini pagunya berapa, sudah terpakai berapa, sisa berapa —
 *    dan setiap rupiahnya bisa ditelusuri ke proposal dan project yang mana."
 *
 * Serapan **dihitung dari rantai yang sudah ada**, tidak pernah disimpan
 * sebagai kolom. Kolom serapan akan melenceng dari kenyataannya begitu ada satu
 * proposal yang direvisi, dan selisihnya tidak akan bisa dijelaskan.
 *
 * Tiga angka dibedakan tegas, karena tindak lanjutnya berbeda:
 *
 *   `terikat`    — proposal yang sudah DEAL. Ini yang benar-benar memakan pagu.
 *   `pipeline`   — proposal terbit yang belum deal. Belum memakan, tapi
 *                  menyembunyikannya membuat pagu terlihat longgar padahal
 *                  hampir habis.
 *   `realisasi`  — biaya yang sudah benar-benar diakui di projectnya.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { Router, Request, Response } from 'express';
import { dbAll, dbGet, dbRun, withTransaction, TxRunner } from '../config/database';
import { authMiddleware } from '../middleware/auth';

const router = Router();

const JENIS = ['capex', 'opex'];
const STATUS_TAHUN = ['planning', 'approved', 'active', 'closed'];
const STATUS_BARIS = ['usulan', 'disetujui', 'ditolak', 'dibatalkan'];

const idValid = (n: any) => Number.isInteger(Number(n)) && Number(n) > 0;
const uang = (n: any) => Math.round((Number(n) || 0) * 100) / 100;

/**
 * Serapan seluruh baris anggaran satu tahun, dihitung sekali dalam satu query.
 *
 * Sengaja tidak per-baris di dalam loop: satu tahun bisa memuat ratusan baris,
 * dan menembak database sekali per baris membuat halaman anggaran menjadi
 * lambat justru saat datanya sudah banyak.
 */
async function serapanPerBaris(budgetYearId: number) {
  const rows: any[] = await dbAll(
    `SELECT p.budget_line_id AS line_id,
            p.id AS proposal_id, p.status AS proposal_status, p.project_id,
            c.id AS contract_id, c.original_value,
            (SELECT COALESCE(SUM(co.value_delta), 0) FROM change_orders co
              WHERE co.contract_id = c.id AND co.status = 'approved') AS co_disetujui,
            (SELECT r.total_project FROM proposal_revisions r
              WHERE r.proposal_id = p.id AND r.status IN ('issued','accepted')
              ORDER BY r.status = 'accepted' DESC, r.revision_no DESC LIMIT 1) AS nilai_revisi,
            (SELECT COALESCE(SUM(ap.amount), 0) FROM accounts_payable ap
              WHERE ap.project_id = p.project_id) AS ap_diakui,
            (SELECT COALESCE(SUM(e.amount), 0) FROM project_expenses e
              WHERE e.project_id = p.project_id) AS biaya_project
     FROM proposals p
     LEFT JOIN contracts c ON c.project_id = p.project_id
     WHERE p.budget_line_id IN (SELECT id FROM budget_lines WHERE budget_year_id = ?)`,
    [budgetYearId]);

  const peta: Record<number, any> = {};
  // Dua proposal bisa menunjuk project yang sama. AP dan biaya project melekat
  // pada PROJECT, bukan proposal — tanpa penjagaan ini realisasinya terhitung
  // dua kali dan pagu terlihat lebih habis daripada kenyataannya.
  const projectSudahDihitung = new Set<number>();
  for (const r of rows) {
    const id = Number(r.line_id);
    const k = peta[id] || (peta[id] = {
      terikat: 0, pipeline: 0, realisasi: 0, jml_proposal: 0, jml_deal: 0, proposals: [],
    });
    k.jml_proposal++;

    const nilaiKontrak = r.contract_id
      ? uang(Number(r.original_value) + Number(r.co_disetujui))
      : uang(r.nilai_revisi);

    if (r.proposal_status === 'deal') {
      k.jml_deal++;
      k.terikat += nilaiKontrak;
      const pid = Number(r.project_id);
      if (pid && !projectSudahDihitung.has(pid)) {
        projectSudahDihitung.add(pid);
        k.realisasi += uang(Number(r.ap_diakui) + Number(r.biaya_project));
      }
    } else if (r.nilai_revisi !== null) {
      // Terbit tapi belum deal — belum memakan pagu, tapi harus terlihat.
      k.pipeline += uang(r.nilai_revisi);
    }
    k.proposals.push({
      id: r.proposal_id, status: r.proposal_status,
      nilai: nilaiKontrak, project_id: r.project_id,
    });
  }
  for (const k of Object.values(peta) as any[]) {
    k.terikat = uang(k.terikat); k.pipeline = uang(k.pipeline); k.realisasi = uang(k.realisasi);
  }
  return peta;
}

// ── Tahun anggaran ──────────────────────────────────────────────────────────

router.get('/years', authMiddleware, async (_req: Request, res: Response) => {
  try {
    const rows = await dbAll(
      `SELECT y.*, (SELECT COUNT(*) FROM budget_lines l WHERE l.budget_year_id = y.id) AS jml_baris
       FROM budget_years y ORDER BY y.year DESC`, []);
    res.json({ data: rows, count: (rows as any[]).length });
  } catch (e: any) {
    console.error('Error membaca tahun anggaran:', e);
    res.status(500).json({ error: e.message });
  }
});

router.post('/years', authMiddleware, async (req: Request, res: Response) => {
  try {
    const year = Number(req.body?.year);
    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
      return res.status(400).json({ error: 'Tahun tidak valid.', code: 'TAHUN_TIDAK_VALID' });
    }
    const capex = req.body?.capex_ceiling;
    const opex = req.body?.opex_ceiling;
    for (const [label, v] of [['CAPEX', capex], ['OPEX', opex]] as any[]) {
      if (v != null && (!Number.isFinite(Number(v)) || Number(v) < 0)) {
        return res.status(400).json({
          error: `Pagu ${label} tidak boleh negatif.`, code: 'PAGU_TIDAK_VALID' });
      }
    }
    const r = await dbRun(
      `INSERT INTO budget_years (year, capex_ceiling, opex_ceiling, note, created_by)
       VALUES (?, ?, ?, ?, ?)`,
      [year, capex ?? null, opex ?? null,
       req.body?.note ? String(req.body.note).slice(0, 500) : null,
       (req as any).userId || null]);
    res.status(201).json({ id: r.insertId, year, status: 'planning' });
  } catch (e: any) {
    if (e?.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({
        error: 'Tahun anggaran itu sudah ada.', code: 'TAHUN_SUDAH_ADA' });
    }
    console.error('Error membuat tahun anggaran:', e);
    res.status(500).json({ error: e.message });
  }
});

/** Setujui / aktifkan / tutup tahun anggaran. */
router.put('/years/:id/status', authMiddleware, async (req: Request, res: Response) => {
  try {
    if (!idValid(req.params.id)) return res.status(400).json({ error: 'Id tidak valid' });
    const tujuan = String(req.body?.status || '');
    if (!STATUS_TAHUN.includes(tujuan)) {
      return res.status(400).json({
        error: `Status "${tujuan}" tidak dikenal.`, code: 'STATUS_TIDAK_DIKENAL',
        status_dikenal: STATUS_TAHUN });
    }
    const y: any = await dbGet('SELECT * FROM budget_years WHERE id = ?', [req.params.id]);
    if (!y) return res.status(404).json({ error: 'Tahun anggaran tidak ditemukan' });
    if (y.status === 'closed') {
      // Tahun yang sudah ditutup adalah catatan historis. Membukanya kembali
      // berarti angka yang sudah dilaporkan ke manajemen bisa berubah setelah
      // dilaporkan.
      return res.status(409).json({
        error: 'Tahun anggaran sudah ditutup dan tidak bisa dibuka lagi.',
        code: 'TAHUN_SUDAH_DITUTUP' });
    }

    await dbRun(
      `UPDATE budget_years SET status = ?,
         approved_by = ?, approved_at = ?, closed_at = ?
       WHERE id = ?`,
      [tujuan,
       tujuan === 'approved' ? ((req as any).userId || null) : y.approved_by,
       tujuan === 'approved' ? new Date() : y.approved_at,
       tujuan === 'closed' ? new Date() : null,
       req.params.id]);
    res.json({ message: `Tahun anggaran ${y.year} → ${tujuan}` });
  } catch (e: any) {
    console.error('Error mengubah status tahun:', e);
    res.status(500).json({ error: e.message });
  }
});

// ── Baris anggaran ──────────────────────────────────────────────────────────

router.post('/years/:id/lines', authMiddleware, async (req: Request, res: Response) => {
  try {
    if (!idValid(req.params.id)) return res.status(400).json({ error: 'Id tidak valid' });
    const { code, type, title, description, requesting_department, category,
            justification, priority, planned_amount, is_unplanned, unplanned_reason } = req.body || {};

    if (!JENIS.includes(String(type))) {
      return res.status(400).json({
        error: 'Jenis harus "capex" atau "opex".', code: 'JENIS_TIDAK_DIKENAL' });
    }
    if (!title || !String(title).trim()) {
      return res.status(400).json({ error: 'Judul pekerjaan wajib diisi.', code: 'JUDUL_WAJIB' });
    }
    const nilai = Number(planned_amount);
    if (!Number.isFinite(nilai) || nilai < 0) {
      return res.status(400).json({
        error: 'Nilai rencana tidak boleh negatif.', code: 'NILAI_TIDAK_VALID' });
    }
    // Pekerjaan di luar rencana boleh jalan, tapi alasannya WAJIB. Tanpa itu,
    // porsi unplanned yang membesar tidak bisa ditelusuri sebabnya — padahal
    // itulah gejala perencanaan yang meleset.
    const unplanned = Number(is_unplanned) === 1 || is_unplanned === true;
    if (unplanned && !String(unplanned_reason || '').trim()) {
      return res.status(400).json({
        error: 'Pekerjaan di luar rencana harus menyebutkan alasannya.',
        code: 'ALASAN_UNPLANNED_WAJIB' });
    }

    const y: any = await dbGet('SELECT id, year, status FROM budget_years WHERE id = ?', [req.params.id]);
    if (!y) return res.status(404).json({ error: 'Tahun anggaran tidak ditemukan' });
    if (y.status === 'closed') {
      return res.status(409).json({
        error: 'Tahun anggaran sudah ditutup.', code: 'TAHUN_SUDAH_DITUTUP' });
    }
    // Tahun yang sudah berjalan hanya menerima baris UNPLANNED. Menambah
    // rencana baru ke tahun berjalan tanpa menandainya membuat "rencana" dan
    // "yang muncul di tengah jalan" tidak bisa dibedakan lagi di akhir tahun.
    if ((y.status === 'active' || y.status === 'approved') && !unplanned) {
      return res.status(409).json({
        error: `Tahun ${y.year} sudah ${y.status}. Pekerjaan baru harus ditandai `
             + 'sebagai di luar rencana (unplanned) berikut alasannya.',
        code: 'HARUS_UNPLANNED' });
    }

    const kode = String(code || '').trim()
      || `${String(type).toUpperCase()}-${y.year}-${Date.now().toString().slice(-5)}`;
    try {
      const r = await dbRun(
        `INSERT INTO budget_lines
          (budget_year_id, code, type, title, description, requesting_department, category,
           justification, priority, planned_amount, is_unplanned, unplanned_reason, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [req.params.id, kode, type, String(title).trim().slice(0, 255),
         description ? String(description).slice(0, 1000) : null,
         requesting_department ? String(requesting_department).slice(0, 100) : null,
         category ? String(category).slice(0, 100) : null,
         justification ? String(justification).slice(0, 1000) : null,
         priority || 'normal', nilai, unplanned ? 1 : 0,
         unplanned ? String(unplanned_reason).slice(0, 500) : null,
         (req as any).userId || null]);
      res.status(201).json({ id: r.insertId, code: kode, status: 'usulan', is_unplanned: unplanned });
    } catch (e: any) {
      if (e?.code === 'ER_DUP_ENTRY') {
        return res.status(409).json({
          error: `Kode "${kode}" sudah dipakai di tahun ini.`, code: 'KODE_SUDAH_ADA' });
      }
      throw e;
    }
  } catch (e: any) {
    console.error('Error membuat baris anggaran:', e);
    res.status(500).json({ error: e.message });
  }
});

/** Setujui / tolak baris anggaran. Penolakan wajib beralasan. */
router.put('/lines/:id/status', authMiddleware, async (req: Request, res: Response) => {
  try {
    if (!idValid(req.params.id)) return res.status(400).json({ error: 'Id tidak valid' });
    const tujuan = String(req.body?.status || '');
    if (!STATUS_BARIS.includes(tujuan)) {
      return res.status(400).json({
        error: `Status "${tujuan}" tidak dikenal.`, code: 'STATUS_TIDAK_DIKENAL',
        status_dikenal: STATUS_BARIS });
    }
    const alasan = String(req.body?.reason || '').trim();
    if (tujuan === 'ditolak' && !alasan) {
      return res.status(400).json({
        error: 'Penolakan harus menyebutkan alasannya.', code: 'ALASAN_WAJIB' });
    }

    const hasil = await withTransaction(async (tx: TxRunner) => {
      const l: any = await tx.get(
        `SELECT l.*, y.status AS status_tahun FROM budget_lines l
         JOIN budget_years y ON y.id = l.budget_year_id
         WHERE l.id = ? FOR UPDATE`, [req.params.id]);
      if (!l) return { error: 404, body: { error: 'Baris anggaran tidak ditemukan' } };
      if (l.status_tahun === 'closed') {
        return { error: 409, body: {
          error: 'Tahun anggaran sudah ditutup.', code: 'TAHUN_SUDAH_DITUTUP' } };
      }

      // Baris yang sudah dipakai proposal tidak boleh dibatalkan diam-diam —
      // pekerjaannya sudah berjalan, dan mencabut pagunya membuat serapan
      // menunjuk baris yang tidak ada.
      if ((tujuan === 'ditolak' || tujuan === 'dibatalkan') && l.status === 'disetujui') {
        const dipakai: any = await tx.get(
          'SELECT COUNT(*) n FROM proposals WHERE budget_line_id = ?', [l.id]);
        if (Number(dipakai?.n) > 0) {
          return { error: 409, body: {
            error: `Baris ini sudah dipakai ${dipakai.n} proposal. Batalkan proposalnya lebih dulu.`,
            code: 'BARIS_SUDAH_DIPAKAI', jml_proposal: Number(dipakai.n) } };
        }
      }

      await tx.run(
        `UPDATE budget_lines SET status = ?,
           approved_by = ?, approved_at = ?, rejected_reason = ?
         WHERE id = ?`,
        [tujuan,
         tujuan === 'disetujui' ? ((req as any).userId || null) : l.approved_by,
         tujuan === 'disetujui' ? new Date() : l.approved_at,
         tujuan === 'ditolak' ? alasan.slice(0, 500) : null,
         req.params.id]);
      return { ok: true as const };
    });

    if ((hasil as any).error) return res.status((hasil as any).error).json((hasil as any).body);
    res.json({ message: `Baris anggaran → ${tujuan}` });
  } catch (e: any) {
    console.error('Error mengubah status baris:', e);
    res.status(500).json({ error: e.message });
  }
});

/**
 * Tautkan proposal ke baris anggaran.
 *
 * Hanya baris yang SUDAH DISETUJUI yang bisa dibebani. Menautkan ke usulan yang
 * belum disetujui berarti pekerjaan berjalan di atas pagu yang belum ada.
 */
router.put('/lines/:id/proposal/:proposalId', authMiddleware, async (req: Request, res: Response) => {
  try {
    if (!idValid(req.params.id) || !idValid(req.params.proposalId)) {
      return res.status(400).json({ error: 'Id tidak valid' });
    }
    const l: any = await dbGet('SELECT id, status, type, title FROM budget_lines WHERE id = ?', [req.params.id]);
    if (!l) return res.status(404).json({ error: 'Baris anggaran tidak ditemukan' });
    if (l.status !== 'disetujui') {
      return res.status(409).json({
        error: `Baris anggaran masih "${l.status}". Hanya yang sudah disetujui yang bisa dibebani.`,
        code: 'BARIS_BELUM_DISETUJUI' });
    }
    const p: any = await dbGet('SELECT id, budget_line_id FROM proposals WHERE id = ?', [req.params.proposalId]);
    if (!p) return res.status(404).json({ error: 'Proposal tidak ditemukan' });
    if (p.budget_line_id && Number(p.budget_line_id) !== Number(req.params.id)) {
      // Memindahkan proposal antar baris memindahkan serapannya juga — dan itu
      // menggeser dua pagu sekaligus tanpa jejak.
      return res.status(409).json({
        error: `Proposal ini sudah dibebankan ke baris #${p.budget_line_id}.`,
        code: 'PROPOSAL_SUDAH_DIBEBANKAN', budget_line_id: p.budget_line_id });
    }
    await dbRun('UPDATE proposals SET budget_line_id = ? WHERE id = ?',
      [req.params.id, req.params.proposalId]);
    res.json({ message: `Proposal dibebankan ke ${l.title}` });
  } catch (e: any) {
    console.error('Error menautkan proposal ke anggaran:', e);
    res.status(500).json({ error: e.message });
  }
});

/** Daftar baris satu tahun, lengkap dengan serapan tiap baris. */
router.get('/years/:id/lines', authMiddleware, async (req: Request, res: Response) => {
  try {
    if (!idValid(req.params.id)) return res.status(400).json({ error: 'Id tidak valid' });
    const y: any = await dbGet('SELECT * FROM budget_years WHERE id = ?', [req.params.id]);
    if (!y) return res.status(404).json({ error: 'Tahun anggaran tidak ditemukan' });

    const lines: any[] = await dbAll(
      `SELECT l.*, u.username AS approved_by_name
       FROM budget_lines l LEFT JOIN users u ON u.id = l.approved_by
       WHERE l.budget_year_id = ?
       ORDER BY l.type, FIELD(l.priority,'tinggi','normal','rendah'), l.code`,
      [req.params.id]);
    const serapan = await serapanPerBaris(Number(req.params.id));

    res.json({
      year: { id: y.id, year: y.year, status: y.status },
      lines: lines.map((l) => {
        const s = serapan[Number(l.id)] || { terikat: 0, pipeline: 0, realisasi: 0, jml_proposal: 0, jml_deal: 0, proposals: [] };
        const rencana = uang(l.planned_amount);
        return {
          ...l,
          planned_amount: rencana,
          is_unplanned: Number(l.is_unplanned) === 1,
          terikat: s.terikat, pipeline: s.pipeline, realisasi: s.realisasi,
          sisa_rencana: uang(rencana - s.terikat),
          // Selisih terhadap rencana, positif = melebihi rencana baris ini.
          deviasi: uang(s.terikat - rencana),
          jml_proposal: s.jml_proposal, jml_deal: s.jml_deal,
          proposals: s.proposals,
        };
      }),
    });
  } catch (e: any) {
    console.error('Error mengambil baris anggaran:', e);
    res.status(500).json({ error: e.message });
  }
});

/**
 * Laporan serapan satu tahun: pagu → terikat → realisasi, dipisah CAPEX/OPEX
 * dan planned/unplanned.
 *
 * Empat angka yang sengaja dibedakan, karena menggabungkannya adalah cara
 * paling umum menyesatkan diri sendiri di pertengahan tahun:
 *   pagu      — batas yang disetujui manajemen (ceiling tahun)
 *   rencana   — jumlah baris yang DISETUJUI (bisa < pagu; sisanya belum dialokasikan)
 *   terikat   — sudah punya kontrak/deal, uangnya secara komersial sudah pergi
 *   realisasi — sudah jadi tagihan/biaya nyata
 *
 * `sisa_pagu` memakai TERIKAT, bukan realisasi. Memakai realisasi membuat pagu
 * terlihat longgar sepanjang tahun lalu habis mendadak di bulan terakhir saat
 * tagihan masuk.
 */
router.get('/years/:id/serapan', authMiddleware, async (req: Request, res: Response) => {
  try {
    if (!idValid(req.params.id)) return res.status(400).json({ error: 'Id tidak valid' });
    const y: any = await dbGet('SELECT * FROM budget_years WHERE id = ?', [req.params.id]);
    if (!y) return res.status(404).json({ error: 'Tahun anggaran tidak ditemukan' });

    const lines: any[] = await dbAll(
      'SELECT * FROM budget_lines WHERE budget_year_id = ?', [req.params.id]);
    const serapan = await serapanPerBaris(Number(req.params.id));

    const kosong = () => ({
      pagu: 0, rencana: 0, rencana_usulan: 0, terikat: 0, pipeline: 0, realisasi: 0,
      unplanned_rencana: 0, unplanned_terikat: 0,
      jml_baris: 0, jml_disetujui: 0, jml_unplanned: 0, jml_belum_ada_proposal: 0,
    });
    const per: Record<string, any> = { capex: kosong(), opex: kosong() };
    per.capex.pagu = uang(y.capex_ceiling);
    per.opex.pagu = uang(y.opex_ceiling);

    for (const l of lines) {
      const b = per[l.type]; if (!b) continue;
      const s = serapan[Number(l.id)];
      const rencana = uang(l.planned_amount);
      const unplanned = Number(l.is_unplanned) === 1;
      b.jml_baris++;
      if (unplanned) b.jml_unplanned++;

      if (l.status === 'disetujui') {
        b.jml_disetujui++;
        b.rencana += rencana;
        if (unplanned) b.unplanned_rencana += rencana;
        if (!s || s.jml_proposal === 0) b.jml_belum_ada_proposal++;
      } else if (l.status === 'usulan') {
        // Belum disetujui — dilaporkan terpisah supaya terlihat sebagai
        // tekanan yang akan datang, bukan sebagai komitmen.
        b.rencana_usulan += rencana;
      }
      if (s) {
        b.terikat += s.terikat; b.pipeline += s.pipeline; b.realisasi += s.realisasi;
        if (unplanned) b.unplanned_terikat += s.terikat;
      }
    }

    for (const k of ['capex', 'opex']) {
      const b = per[k];
      for (const f of ['rencana','rencana_usulan','terikat','pipeline','realisasi','unplanned_rencana','unplanned_terikat']) {
        b[f] = uang(b[f]);
      }
      b.sisa_pagu = uang(b.pagu - b.terikat);
      b.belum_dialokasikan = uang(b.pagu - b.rencana);
      b.melebihi_pagu = b.terikat > b.pagu;
      // Berapa persen tahun ini dihabiskan pekerjaan yang tidak direncanakan.
      // Angka ini yang menjawab "seberapa baik perencanaan tahun lalu".
      b.porsi_unplanned_pct = b.terikat > 0
        ? Math.round((b.unplanned_terikat / b.terikat) * 1000) / 10 : 0;
      b.serapan_pct = b.pagu > 0 ? Math.round((b.terikat / b.pagu) * 1000) / 10 : null;
      b.realisasi_pct = b.terikat > 0 ? Math.round((b.realisasi / b.terikat) * 1000) / 10 : null;
    }

    res.json({
      year: { id: y.id, year: y.year, status: y.status,
              capex_ceiling: uang(y.capex_ceiling), opex_ceiling: uang(y.opex_ceiling) },
      capex: per.capex, opex: per.opex,
      total: {
        pagu: uang(per.capex.pagu + per.opex.pagu),
        rencana: uang(per.capex.rencana + per.opex.rencana),
        terikat: uang(per.capex.terikat + per.opex.terikat),
        pipeline: uang(per.capex.pipeline + per.opex.pipeline),
        realisasi: uang(per.capex.realisasi + per.opex.realisasi),
        sisa_pagu: uang(per.capex.sisa_pagu + per.opex.sisa_pagu),
      },
    });
  } catch (e: any) {
    console.error('Error menghitung serapan:', e);
    res.status(500).json({ error: e.message });
  }
});

// ── Kapitalisasi CAPEX → Asset Management ───────────────────────────────────
//
// Keputusan pemilik (31 Agustus 2026):
//   basis = realisasi aktual · satu baris boleh melahirkan banyak aset ·
//   pemicunya manual.
//
// Tidak ada satu pun jalur otomatis di berkas ini yang melahirkan aset. Project
// yang ditutup karena batal juga "selesai" — melahirkan aset dari status itu
// akan mengisi register aset dengan barang yang tidak pernah ada.

/** Realisasi aktual satu baris: AP + biaya project, dedup per project. */
async function realisasiBaris(runner: { all: Function; get: Function }, lineId: number) {
  const proyek: any[] = await runner.all(
    `SELECT DISTINCT p.project_id AS id FROM proposals p
     WHERE p.budget_line_id = ? AND p.status = 'deal' AND p.project_id IS NOT NULL`,
    [lineId]);
  if (!proyek.length) return { ap: 0, biaya: 0, total: 0, jml_project: 0 };
  const tanda = proyek.map(() => '?').join(',');
  const ids = proyek.map((r) => r.id);
  const a: any = await runner.get(
    `SELECT COALESCE(SUM(amount), 0) v FROM accounts_payable WHERE project_id IN (${tanda})`, ids);
  const b: any = await runner.get(
    `SELECT COALESCE(SUM(amount), 0) v FROM project_expenses WHERE project_id IN (${tanda})`, ids);
  const ap = uang(a?.v), biaya = uang(b?.v);
  return { ap, biaya, total: uang(ap + biaya), jml_project: proyek.length };
}

/** Berapa yang sudah dikapitalisasi dari satu baris (yang direversal tidak dihitung). */
async function sudahDikapitalisasi(runner: { get: Function }, lineId: number) {
  const r: any = await runner.get(
    `SELECT COALESCE(SUM(basis_amount), 0) v FROM asset_capitalizations
     WHERE budget_line_id = ? AND status = 'posted'`, [lineId]);
  return uang(r?.v);
}

/** Posisi kapitalisasi satu baris CAPEX, berikut riwayat dan asetnya. */
router.get('/lines/:id/kapitalisasi', authMiddleware, async (req: Request, res: Response) => {
  try {
    if (!idValid(req.params.id)) return res.status(400).json({ error: 'Id tidak valid' });
    const l: any = await dbGet(
      `SELECT l.*, y.year FROM budget_lines l
       JOIN budget_years y ON y.id = l.budget_year_id WHERE l.id = ?`, [req.params.id]);
    if (!l) return res.status(404).json({ error: 'Baris anggaran tidak ditemukan' });

    const runner = { all: dbAll, get: dbGet };
    const real = await realisasiBaris(runner, Number(req.params.id));
    const sudah = await sudahDikapitalisasi(runner, Number(req.params.id));

    const events: any[] = await dbAll(
      `SELECT c.*, u.username AS oleh FROM asset_capitalizations c
       LEFT JOIN users u ON u.id = c.capitalized_by
       WHERE c.budget_line_id = ? ORDER BY c.seq`, [req.params.id]);
    for (const e of events) {
      e.basis_amount = uang(e.basis_amount);
      e.assets = await dbAll(
        `SELECT * FROM asset_capitalization_lines WHERE capitalization_id = ? ORDER BY id`, [e.id]);
      for (const a of e.assets) a.allocated_cost = uang(a.allocated_cost);
    }

    res.json({
      line: { id: l.id, code: l.code, title: l.title, type: l.type, status: l.status, year: l.year },
      // OPEX tidak pernah menjadi aset — itu justru yang membedakannya dari CAPEX.
      bisa_dikapitalisasi: l.type === 'capex' && l.status === 'disetujui',
      alasan_tidak_bisa: l.type !== 'capex' ? 'Baris ini OPEX, bukan CAPEX.'
        : l.status !== 'disetujui' ? `Baris masih "${l.status}".` : null,
      realisasi: real,
      dikapitalisasi: sudah,
      // Biaya yang datang setelah aset didaftarkan muncul di sini, bukan
      // diam-diam mengubah harga perolehan aset yang sudah berjalan.
      belum_dikapitalisasi: uang(real.total - sudah),
      events,
    });
  } catch (e: any) {
    console.error('Error membaca kapitalisasi:', e);
    res.status(500).json({ error: e.message });
  }
});

/**
 * Kapitalisasi manual: satu baris CAPEX → satu atau banyak aset.
 *
 * `amount` dan jumlah alokasi WAJIB cocok. Keduanya dituliskan terpisah dengan
 * sengaja — dua pernyataan mandiri yang harus setuju, supaya salah ketik pada
 * satu alokasi tertangkap dan bukan diam-diam mengapitalisasi angka lain.
 */
router.post('/lines/:id/kapitalisasi', authMiddleware, async (req: Request, res: Response) => {
  try {
    if (!idValid(req.params.id)) return res.status(400).json({ error: 'Id tidak valid' });
    const lineId = Number(req.params.id);
    const nilai = Number(req.body?.amount);
    const alokasi: any[] = Array.isArray(req.body?.allocations) ? req.body.allocations : [];
    const tanggal = String(req.body?.date || '').trim() || new Date().toISOString().slice(0, 10);

    if (!Number.isFinite(nilai) || nilai <= 0) {
      return res.status(400).json({
        error: 'Nilai kapitalisasi harus lebih dari nol.', code: 'NILAI_TIDAK_VALID' });
    }
    if (!alokasi.length) {
      return res.status(400).json({
        error: 'Sebutkan aset yang lahir dari pekerjaan ini beserta alokasi biayanya.',
        code: 'ALOKASI_KOSONG' });
    }

    const hasil = await withTransaction(async (tx: TxRunner) => {
      const l: any = await tx.get(
        `SELECT l.*, y.year FROM budget_lines l
         JOIN budget_years y ON y.id = l.budget_year_id WHERE l.id = ? FOR UPDATE`, [lineId]);
      if (!l) return { error: 404, body: { error: 'Baris anggaran tidak ditemukan' } };
      if (l.type !== 'capex') {
        return { error: 400, body: {
          error: 'Hanya pekerjaan CAPEX yang menjadi aset. Baris ini OPEX.',
          code: 'BUKAN_CAPEX' } };
      }
      if (l.status !== 'disetujui') {
        return { error: 409, body: {
          error: `Baris masih "${l.status}". Hanya yang disetujui bisa dikapitalisasi.`,
          code: 'BARIS_BELUM_DISETUJUI' } };
      }

      const real = await realisasiBaris(tx, lineId);
      if (real.total <= 0) {
        return { error: 409, body: {
          error: 'Belum ada realisasi biaya pada pekerjaan ini. Aset lahir dari biaya yang benar-benar dikeluarkan, bukan dari nilai kontrak.',
          code: 'BELUM_ADA_REALISASI' } };
      }
      const sudah = await sudahDikapitalisasi(tx, lineId);
      const sisa = uang(real.total - sudah);
      if (sisa <= 0) {
        return { error: 409, body: {
          error: 'Seluruh realisasi pekerjaan ini sudah dikapitalisasi.',
          code: 'SUDAH_DIKAPITALISASI_PENUH', realisasi: real.total, dikapitalisasi: sudah } };
      }
      if (nilai > sisa + 0.005) {
        return { error: 422, body: {
          error: `Nilai kapitalisasi ${nilai} melebihi realisasi yang tersisa (${sisa}).`,
          code: 'MELEBIHI_REALISASI',
          realisasi: real.total, dikapitalisasi: sudah, sisa } };
      }

      let jumlahAlokasi = 0;
      for (const a of alokasi) {
        const v = Number(a?.allocated_cost);
        if (!Number.isFinite(v) || v <= 0) {
          return { error: 422, body: {
            error: 'Setiap aset harus punya alokasi biaya lebih dari nol.',
            code: 'ALOKASI_TIDAK_VALID' } };
        }
        jumlahAlokasi += v;
      }
      jumlahAlokasi = uang(jumlahAlokasi);
      if (Math.abs(jumlahAlokasi - uang(nilai)) > 0.005) {
        return { error: 422, body: {
          error: `Jumlah alokasi ${jumlahAlokasi} tidak sama dengan nilai kapitalisasi ${uang(nilai)}.`,
          code: 'ALOKASI_TIDAK_COCOK',
          selisih: uang(jumlahAlokasi - uang(nilai)) } };
      }

      // Seluruh alokasi divalidasi dan diselesaikan LEBIH DULU, sebelum satu
      // baris pun ditulis.
      //
      // Ini bukan gaya penulisan — `withTransaction` di berkas ini COMMIT kalau
      // handler-nya mengembalikan `{error, body}`; hanya `throw` yang rollback.
      // Versi pertama memvalidasi aset di tengah loop penulisan, jadi penolakan
      // "nama aset wajib" tetap meninggalkan header kapitalisasi yang sudah
      // ter-commit tanpa satu pun alokasi — 20 jt hantu yang memakan sisa
      // realisasi. Tes yang menangkapnya ada di `tests/kapitalisasi.ts`.
      const siap: any[] = [];
      for (const a of alokasi) {
        const biaya = uang(a.allocated_cost);
        if (a.asset_id) {
          if (!idValid(a.asset_id)) {
            return { error: 400, body: { error: 'asset_id tidak valid', code: 'ASET_TIDAK_VALID' } };
          }
          const as: any = await tx.get(
            'SELECT id, asset_code, name, is_deleted FROM assets WHERE id = ? FOR UPDATE', [a.asset_id]);
          if (!as || Number(as.is_deleted) === 1) {
            return { error: 404, body: {
              error: `Aset #${a.asset_id} tidak ditemukan.`, code: 'ASET_TIDAK_DITEMUKAN' } };
          }
          siap.push({ baru: false, assetId: Number(a.asset_id), kode: as.asset_code, nama: as.name,
                      biaya, note: a.allocation_note });
        } else {
          const nb = a.asset_baru || {};
          if (!nb.name || !String(nb.name).trim()) {
            return { error: 422, body: { error: 'Aset baru harus punya nama.', code: 'NAMA_ASET_WAJIB' } };
          }
          if (!idValid(nb.category_id)) {
            return { error: 422, body: { error: 'Aset baru harus punya kategori.', code: 'KATEGORI_ASET_WAJIB' } };
          }
          siap.push({ baru: true, nb, biaya, note: a.allocation_note,
                      nama: String(nb.name).trim().slice(0, 255) });
        }
      }

      const seqRow: any = await tx.get(
        'SELECT COALESCE(MAX(seq), 0) s FROM asset_capitalizations WHERE budget_line_id = ?', [lineId]);
      const seq = Number(seqRow?.s || 0) + 1;

      const cap = await tx.run(
        `INSERT INTO asset_capitalizations
          (budget_line_id, budget_line_code, budget_line_title, budget_year, seq,
           basis_amount, basis_ap, basis_expenses, basis_kumulatif, note, capitalized_by, capitalized_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [lineId, l.code, l.title, l.year, seq, uang(nilai), real.ap, real.biaya, real.total,
         req.body?.note ? String(req.body.note).slice(0, 1000) : null,
         (req as any).userId || null, tanggal]);
      const capId = cap.insertId;

      const dibuat: any[] = [];
      for (const it of siap) {
        let assetId: number, kode: string;
        if (it.baru) {
          const nb = it.nb;
          kode = String(nb.asset_code || '').trim()
            || `AST-${l.year}-${lineId}-${seq}-${dibuat.length + 1}`;
          const kolom = ['asset_code', 'name', 'category_id', 'location', 'pnid_tag',
                         'purchase_date', 'purchase_price', 'depreciation_method',
                         'in_service_date', 'status', 'source_budget_line_id', 'notes', 'created_by'];
          const isi: any[] = [kode, it.nama, nb.category_id,
            nb.location ? String(nb.location).slice(0, 255) : null,
            nb.pnid_tag ? String(nb.pnid_tag).slice(0, 100) : null,
            tanggal, it.biaya, nb.depreciation_method || 'straight_line',
            nb.in_service_date || tanggal, 'active', lineId,
            `Lahir dari kapitalisasi ${l.code} — ${l.title}`,
            (req as any).userId || null];
          // Umur manfaat hanya ditulis kalau memang diisi. `assets` menolak NULL
          // di kolom ini, dan mengarang angka umur berarti menerbitkan jadwal
          // penyusutan yang tidak pernah diputuskan siapa pun — biarkan default
          // kolomnya yang berlaku.
          if (nb.useful_life_years != null && nb.useful_life_years !== '') {
            kolom.push('useful_life_years'); isi.push(Number(nb.useful_life_years));
          }
          const ins = await tx.run(
            `INSERT INTO assets (${kolom.join(', ')})
             VALUES (${kolom.map(() => '?').join(', ')})`, isi);
          assetId = ins.insertId;
        } else {
          // Penambahan pada aset yang sudah ada menaikkan nilai perolehannya —
          // perlakuan yang benar untuk revamp/improvement. Jejaknya tersimpan
          // sebagai baris kapitalisasi, jadi kenaikannya bisa dijelaskan.
          await tx.run(
            `UPDATE assets SET purchase_price = COALESCE(purchase_price, 0) + ?,
               source_budget_line_id = COALESCE(source_budget_line_id, ?)
             WHERE id = ?`, [it.biaya, lineId, it.assetId]);
          assetId = it.assetId; kode = it.kode;
        }

        await tx.run(
          `INSERT INTO asset_capitalization_lines
            (capitalization_id, asset_id, asset_code, asset_name, is_new_asset, allocated_cost, allocation_note)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [capId, assetId, kode, it.nama, it.baru ? 1 : 0, it.biaya,
           it.note ? String(it.note).slice(0, 500) : null]);
        dibuat.push({ asset_id: assetId, asset_code: kode, name: it.nama, baru: it.baru, allocated_cost: it.biaya });
      }

      return { ok: true as const, capId, seq, assets: dibuat,
               sisa_setelah: uang(sisa - uang(nilai)) };
    });

    if ((hasil as any).error) return res.status((hasil as any).error).json((hasil as any).body);
    const h = hasil as any;
    res.status(201).json({
      id: h.capId, seq: h.seq, amount: uang(nilai), assets: h.assets,
      belum_dikapitalisasi: h.sisa_setelah,
      message: `${h.assets.length} aset dicatat dari kapitalisasi ini`,
    });
  } catch (e: any) {
    console.error('Error kapitalisasi:', e);
    res.status(500).json({ error: e.message });
  }
});

/**
 * Pembatalan kapitalisasi — beralasan, dan mengembalikan nilai aset.
 *
 * Bukan penghapusan: eventnya tetap ada dengan status `reversed`. Aset yang
 * LAHIR dari event ini di-soft-delete; aset yang sudah ada sebelumnya hanya
 * dikembalikan nilai perolehannya.
 */
router.put('/kapitalisasi/:id/reversal', authMiddleware, async (req: Request, res: Response) => {
  try {
    if (!idValid(req.params.id)) return res.status(400).json({ error: 'Id tidak valid' });
    const alasan = String(req.body?.reason || '').trim();
    if (!alasan) {
      return res.status(400).json({
        error: 'Pembatalan kapitalisasi harus menyebutkan alasannya.', code: 'ALASAN_WAJIB' });
    }

    const hasil = await withTransaction(async (tx: TxRunner) => {
      const c: any = await tx.get(
        'SELECT * FROM asset_capitalizations WHERE id = ? FOR UPDATE', [req.params.id]);
      if (!c) return { error: 404, body: { error: 'Kapitalisasi tidak ditemukan' } };
      if (c.status !== 'posted') {
        return { error: 409, body: {
          error: 'Kapitalisasi ini sudah dibatalkan.', code: 'SUDAH_DIREVERSAL' } };
      }
      const baris: any[] = await tx.all(
        'SELECT * FROM asset_capitalization_lines WHERE capitalization_id = ?', [req.params.id]);
      for (const b of baris) {
        await tx.run(
          `UPDATE assets SET purchase_price = GREATEST(COALESCE(purchase_price, 0) - ?, 0) WHERE id = ?`,
          [uang(b.allocated_cost), b.asset_id]);
        if (Number(b.is_new_asset) === 1) {
          await tx.run(
            `UPDATE assets SET is_deleted = 1, deleted_at = NOW(), deleted_by = ?, deletion_reason = ?
             WHERE id = ?`,
            [(req as any).userId || null,
             `Kapitalisasi dibatalkan: ${alasan}`.slice(0, 500), b.asset_id]);
        }
      }
      await tx.run(
        `UPDATE asset_capitalizations
         SET status = 'reversed', reversed_at = NOW(), reversed_by = ?, reversal_reason = ?
         WHERE id = ?`,
        [(req as any).userId || null, alasan.slice(0, 1000), req.params.id]);
      return { ok: true as const, jml: baris.length };
    });

    if ((hasil as any).error) return res.status((hasil as any).error).json((hasil as any).body);
    res.json({ message: `Kapitalisasi dibatalkan, ${(hasil as any).jml} aset dikembalikan` });
  } catch (e: any) {
    console.error('Error membatalkan kapitalisasi:', e);
    res.status(500).json({ error: e.message });
  }
});

/**
 * Kategori aset untuk formulir kapitalisasi.
 *
 * Sengaja dilayani dari sini, bukan `/assets/categories` — endpoint itu menuntut
 * `assets.view`/`assets.manage`, sementara yang mengapitalisasi anggaran belum
 * tentu memegang modul aset. Yang dibuka hanya id dan nama kategori aktif:
 * data acuan, bukan data bisnis.
 */
router.get('/kategori-aset', authMiddleware, async (_req: Request, res: Response) => {
  try {
    const rows = await dbAll(
      'SELECT id, name FROM asset_categories WHERE is_active = 1 ORDER BY order_no, id', []);
    res.json({ categories: rows });
  } catch (e: any) {
    console.error('Error mengambil kategori aset:', e);
    res.status(500).json({ error: e.message });
  }
});

/** Ringkasan kapitalisasi satu tahun: berapa CAPEX yang sudah menjadi aset. */
router.get('/years/:id/kapitalisasi', authMiddleware, async (req: Request, res: Response) => {
  try {
    if (!idValid(req.params.id)) return res.status(400).json({ error: 'Id tidak valid' });
    const y: any = await dbGet('SELECT * FROM budget_years WHERE id = ?', [req.params.id]);
    if (!y) return res.status(404).json({ error: 'Tahun anggaran tidak ditemukan' });

    const lines: any[] = await dbAll(
      `SELECT id, code, title FROM budget_lines
       WHERE budget_year_id = ? AND type = 'capex' AND status = 'disetujui'
       ORDER BY code`, [req.params.id]);

    const runner = { all: dbAll, get: dbGet };
    const hasil: any[] = [];
    let totRealisasi = 0, totKapital = 0, siap = 0;
    for (const l of lines) {
      const real = await realisasiBaris(runner, Number(l.id));
      const sudah = await sudahDikapitalisasi(runner, Number(l.id));
      const belum = uang(real.total - sudah);
      const aset: any = await dbGet(
        `SELECT COUNT(DISTINCT cl.asset_id) n FROM asset_capitalization_lines cl
         JOIN asset_capitalizations c ON c.id = cl.capitalization_id
         WHERE c.budget_line_id = ? AND c.status = 'posted'`, [l.id]);
      totRealisasi += real.total; totKapital += sudah;
      if (belum > 0) siap++;
      hasil.push({
        ...l, realisasi: real.total, dikapitalisasi: sudah,
        belum_dikapitalisasi: belum, jml_aset: Number(aset?.n || 0),
        // null berarti belum ada realisasi sama sekali — berbeda dari 0%,
        // yang berarti ada biaya tapi belum satu pun dikapitalisasi.
        pct: real.total > 0 ? Math.round((sudah / real.total) * 1000) / 10 : null,
      });
    }

    res.json({
      year: { id: y.id, year: y.year, status: y.status },
      total: {
        realisasi: uang(totRealisasi), dikapitalisasi: uang(totKapital),
        belum_dikapitalisasi: uang(totRealisasi - totKapital),
        jml_baris: lines.length, jml_siap_dikapitalisasi: siap,
      },
      lines: hasil,
    });
  } catch (e: any) {
    console.error('Error ringkasan kapitalisasi:', e);
    res.status(500).json({ error: e.message });
  }
});

export default router;
