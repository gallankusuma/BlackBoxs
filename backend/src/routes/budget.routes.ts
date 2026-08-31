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

export default router;
