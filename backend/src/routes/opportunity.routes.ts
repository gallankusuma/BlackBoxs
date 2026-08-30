/**
 * Opportunity register — Lead-to-Contract.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * Yang membuat register ini berguna, dan gampang salah kalau tidak disengaja:
 *
 * 1. **Win rate butuh penyebut yang sah.** Yang belum diputuskan TIDAK boleh
 *    ikut terhitung. Kalau ikut, angkanya selalu terlihat bagus di awal —
 *    10 opportunity terbuka dan 1 menang membaca "9% win rate" padahal belum
 *    ada satu pun yang kalah. Di sini penyebutnya hanya yang sudah diputuskan.
 *
 * 2. **Nilai yang dilaporkan berasal dari penawaran yang benar-benar dikirim**,
 *    bukan dari taksiran awal. Begitu ada revisi terbit, nilai itu yang dipakai.
 *    Taksiran hanya dipakai selama belum ada penawaran, dan itu dinyatakan.
 *
 * 3. **Kalah wajib beralasan.** Kekalahan tanpa alasan tidak mengajarkan apa
 *    pun, dan itulah satu-satunya nilai dari mencatatnya.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { Router, Request, Response } from 'express';
import { dbAll, dbGet, dbRun, withTransaction, TxRunner } from '../config/database';
import { authMiddleware } from '../middleware/auth';

const router = Router();

const TAHAP = ['lead', 'qualified', 'bidding', 'submitted', 'won', 'lost', 'cancelled'];
const TERMINAL = ['won', 'lost', 'cancelled'];
const DIPUTUSKAN = ['won', 'lost'];

/**
 * Transisi tahapan yang sah.
 *
 * Dibuat eksplisit, bukan bebas: melompat dari `lead` langsung ke `won` berarti
 * ada opportunity yang menang tanpa pernah punya penawaran, dan angka pipeline
 * berhenti bisa dipercaya.
 */
const TRANSISI: Record<string, string[]> = {
  lead:      ['qualified', 'cancelled', 'lost'],
  qualified: ['bidding', 'cancelled', 'lost'],
  bidding:   ['submitted', 'cancelled', 'lost'],
  submitted: ['won', 'lost', 'cancelled'],
  won:       [],
  lost:      [],
  cancelled: [],
};

const idValid = (n: any) => Number.isInteger(Number(n)) && Number(n) > 0;

/** Nomor register berurutan per tahun. */
async function nomorBerikutnya(run: TxRunner): Promise<string> {
  const th = new Date().getFullYear();
  const row: any = await run.get(
    `SELECT COALESCE(MAX(CAST(SUBSTRING_INDEX(code, '/', -1) AS UNSIGNED)), 0) AS n
     FROM opportunities WHERE code LIKE ?`, [`OPP/${th}/%`]);
  return `OPP/${th}/${String(Number(row?.n || 0) + 1).padStart(4, '0')}`;
}

/**
 * Nilai sebuah opportunity — dari penawaran kalau ada, taksiran kalau belum.
 *
 * Sumbernya SELALU dinyatakan. Menyamakan taksiran dengan nilai penawaran
 * membuat pipeline terlihat presisi padahal separuhnya masih tebakan.
 */
async function nilaiOpportunity(oppId: number, get = dbGet) {
  const rev: any = await get(
    `SELECT r.total_project, r.revision_no, r.status, p.id AS proposal_id
     FROM proposals p
     JOIN proposal_revisions r ON r.proposal_id = p.id
     WHERE p.opportunity_id = ? AND r.status IN ('issued', 'accepted')
     ORDER BY r.status = 'accepted' DESC, r.revision_no DESC LIMIT 1`, [oppId]);
  if (rev) {
    return {
      nilai: Math.round((Number(rev.total_project) || 0) * 100) / 100,
      sumber: 'revisi_penawaran' as const,
      proposal_id: rev.proposal_id, revision_no: rev.revision_no, revision_status: rev.status,
    };
  }
  const opp: any = await get('SELECT estimated_value FROM opportunities WHERE id = ?', [oppId]);
  return {
    nilai: opp?.estimated_value === null || opp?.estimated_value === undefined
      ? null : Math.round(Number(opp.estimated_value) * 100) / 100,
    sumber: 'taksiran' as const,
    proposal_id: null, revision_no: null, revision_status: null,
  };
}

// ── Register ────────────────────────────────────────────────────────────────

router.get('/', authMiddleware, async (req: Request, res: Response) => {
  try {
    const tahapMinta = String(req.query.stage || '').split(',').map(x => x.trim()).filter(Boolean);
    const tidakDikenal = tahapMinta.filter(x => !TAHAP.includes(x));
    if (tidakDikenal.length) {
      // Nilai karangan akan diam-diam menghasilkan daftar kosong dan terlihat
      // seperti register yang memang kosong.
      return res.status(400).json({
        error: `Tahap tidak dikenal: ${tidakDikenal.join(', ')}`,
        code: 'STAGE_TIDAK_DIKENAL', stage_dikenal: TAHAP });
    }
    const params: any[] = [];
    let where = '';
    if (tahapMinta.length) {
      where = ` WHERE o.stage IN (${tahapMinta.map(() => '?').join(',')})`;
      params.push(...tahapMinta);
    }
    const rows: any[] = await dbAll(
      `SELECT o.*, c.name AS client_terdaftar, u.full_name AS owner_name,
              (SELECT COUNT(*) FROM proposals p WHERE p.opportunity_id = o.id) AS jml_proposal
       FROM opportunities o
       LEFT JOIN clients c ON c.id = o.client_id
       LEFT JOIN users u ON u.id = o.owner_user_id
       ${where} ORDER BY o.created_at DESC`, params);

    const data = [];
    for (const o of rows) {
      const n = await nilaiOpportunity(o.id);
      data.push({
        ...o,
        nilai: n.nilai, nilai_sumber: n.sumber,
        proposal_id: n.proposal_id, revision_no: n.revision_no,
        // Nilai tertimbang hanya bermakna untuk yang masih terbuka.
        nilai_tertimbang: TERMINAL.includes(o.stage) || n.nilai === null ? null
          : Math.round(n.nilai * (Number(o.probability) || 0)) / 100,
      });
    }
    res.json({ data, count: data.length });
  } catch (e: any) {
    console.error('Error membaca opportunity:', e);
    res.status(500).json({ error: e.message });
  }
});

router.post('/', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { title, client_id, prospect_id, client_name, lokasi, scope,
            estimated_value, probability, expected_award_date, submission_deadline,
            source, competitor, owner_user_id } = req.body || {};
    if (!title || !String(title).trim()) {
      return res.status(400).json({ error: 'Judul opportunity wajib diisi.', code: 'JUDUL_WAJIB' });
    }
    if (probability != null) {
      const p = Number(probability);
      if (!Number.isFinite(p) || p < 0 || p > 100) {
        return res.status(400).json({
          error: 'Probability harus antara 0 dan 100.', code: 'PROBABILITY_DI_LUAR_RENTANG' });
      }
    }

    const hasil = await withTransaction(async (tx: TxRunner) => {
      const code = await nomorBerikutnya(tx);
      const r = await tx.run(
        `INSERT INTO opportunities
          (code, title, client_id, prospect_id, client_name, lokasi, scope, stage,
           estimated_value, probability, expected_award_date, submission_deadline,
           source, competitor, owner_user_id, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'lead', ?, ?, ?, ?, ?, ?, ?, ?)`,
        [code, String(title).trim().slice(0, 255), client_id || null, prospect_id || null,
         client_name ? String(client_name).slice(0, 255) : null,
         lokasi ? String(lokasi).slice(0, 255) : null,
         scope ? String(scope).slice(0, 500) : null,
         estimated_value ?? null, probability ?? null,
         expected_award_date || null, submission_deadline || null,
         source ? String(source).slice(0, 100) : null,
         competitor ? String(competitor).slice(0, 255) : null,
         owner_user_id || null, (req as any).userId || null]);
      await tx.run(
        `INSERT INTO opportunity_stage_history (opportunity_id, from_stage, to_stage, note, changed_by)
         VALUES (?, NULL, 'lead', 'dibuat', ?)`, [r.insertId, (req as any).userId || null]);
      return { id: r.insertId, code };
    });
    res.status(201).json({ ...hasil, stage: 'lead', message: 'Opportunity dibuat' });
  } catch (e: any) {
    if (e?.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Nomor opportunity bentrok, coba lagi.', code: 'KODE_BENTROK' });
    }
    console.error('Error membuat opportunity:', e);
    res.status(500).json({ error: e.message });
  }
});

router.get('/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    if (!idValid(req.params.id)) return res.status(400).json({ error: 'Id tidak valid' });
    const o: any = await dbGet(
      `SELECT o.*, c.name AS client_terdaftar, u.full_name AS owner_name
       FROM opportunities o
       LEFT JOIN clients c ON c.id = o.client_id
       LEFT JOIN users u ON u.id = o.owner_user_id
       WHERE o.id = ?`, [req.params.id]);
    if (!o) return res.status(404).json({ error: 'Opportunity tidak ditemukan' });

    const n = await nilaiOpportunity(Number(req.params.id));
    const proposals = await dbAll(
      `SELECT id, proposal_number, project_name, status, total_project, created_at
       FROM proposals WHERE opportunity_id = ? ORDER BY created_at DESC`, [req.params.id]);
    const riwayat = await dbAll(
      `SELECT h.from_stage, h.to_stage, h.note, h.changed_at, u.full_name AS oleh
       FROM opportunity_stage_history h
       LEFT JOIN users u ON u.id = h.changed_by
       WHERE h.opportunity_id = ? ORDER BY h.changed_at, h.id`, [req.params.id]);

    res.json({
      ...o,
      nilai: n.nilai, nilai_sumber: n.sumber,
      proposals, riwayat,
      transisi_sah: TRANSISI[o.stage] || [],
    });
  } catch (e: any) {
    console.error('Error membaca opportunity:', e);
    res.status(500).json({ error: e.message });
  }
});

/** Tautkan proposal ke opportunity. */
router.put('/:id/proposal/:proposalId', authMiddleware, async (req: Request, res: Response) => {
  try {
    if (!idValid(req.params.id) || !idValid(req.params.proposalId)) {
      return res.status(400).json({ error: 'Id tidak valid' });
    }
    const o: any = await dbGet('SELECT id, stage FROM opportunities WHERE id = ?', [req.params.id]);
    if (!o) return res.status(404).json({ error: 'Opportunity tidak ditemukan' });
    const p: any = await dbGet('SELECT id, opportunity_id FROM proposals WHERE id = ?', [req.params.proposalId]);
    if (!p) return res.status(404).json({ error: 'Proposal tidak ditemukan' });
    if (p.opportunity_id && Number(p.opportunity_id) !== Number(req.params.id)) {
      // Memindahkan proposal antar opportunity memindahkan nilainya juga —
      // dan itu menggeser dua pipeline sekaligus tanpa jejak.
      return res.status(409).json({
        error: `Proposal ini sudah tertaut ke opportunity #${p.opportunity_id}.`,
        code: 'PROPOSAL_SUDAH_TERTAUT', opportunity_id: p.opportunity_id });
    }
    await dbRun('UPDATE proposals SET opportunity_id = ? WHERE id = ?',
      [req.params.id, req.params.proposalId]);
    res.json({ message: 'Proposal ditautkan ke opportunity' });
  } catch (e: any) {
    console.error('Error menautkan proposal:', e);
    res.status(500).json({ error: e.message });
  }
});

/**
 * Ubah tahapan. Transisi divalidasi, dan `lost` wajib beralasan.
 */
router.put('/:id/stage', authMiddleware, async (req: Request, res: Response) => {
  try {
    if (!idValid(req.params.id)) return res.status(400).json({ error: 'Id tidak valid' });
    const tujuan = String(req.body?.stage || '');
    if (!TAHAP.includes(tujuan)) {
      return res.status(400).json({
        error: `Tahap "${tujuan}" tidak dikenal.`, code: 'STAGE_TIDAK_DIKENAL', stage_dikenal: TAHAP });
    }

    const hasil = await withTransaction(async (tx: TxRunner) => {
      const o: any = await tx.get('SELECT * FROM opportunities WHERE id = ? FOR UPDATE', [req.params.id]);
      if (!o) return { error: 404, body: { error: 'Opportunity tidak ditemukan' } };
      if (o.stage === tujuan) {
        return { error: 400, body: { error: `Sudah berada di tahap ${tujuan}.`, code: 'TAHAP_SAMA' } };
      }
      if (!(TRANSISI[o.stage] || []).includes(tujuan)) {
        return { error: 409, body: {
          error: `Tidak bisa langsung dari "${o.stage}" ke "${tujuan}".`,
          code: 'TRANSISI_TIDAK_SAH', dari: o.stage, sah: TRANSISI[o.stage] || [] } };
      }

      // Kalah wajib beralasan — itu satu-satunya nilai dari mencatat kekalahan.
      const kode = String(req.body?.lost_reason_code || '').trim();
      if (tujuan === 'lost' && !kode) {
        return { error: 400, body: {
          error: 'Kekalahan harus menyebutkan alasannya.', code: 'ALASAN_KALAH_WAJIB' } };
      }

      // Menang harus punya penawaran yang benar-benar dikirim. Tanpa itu,
      // nilai yang dilaporkan menang hanyalah taksiran — dan win rate berhenti
      // bisa direkonsiliasi ke apa pun.
      if (tujuan === 'won') {
        const n = await nilaiOpportunity(Number(req.params.id), tx.get);
        if (n.sumber !== 'revisi_penawaran') {
          return { error: 409, body: {
            error: 'Belum ada revisi penawaran yang terbit untuk opportunity ini, '
                 + 'jadi nilai menangnya tidak punya dasar.',
            code: 'BELUM_ADA_PENAWARAN_TERBIT' } };
        }
      }

      await tx.run(
        `UPDATE opportunities SET stage = ?,
           lost_reason_code = ?, lost_reason_note = ?,
           won_at = ?, lost_at = ?
         WHERE id = ?`,
        [tujuan,
         tujuan === 'lost' ? kode.slice(0, 50) : null,
         tujuan === 'lost' ? String(req.body?.lost_reason_note || '').slice(0, 500) || null : null,
         tujuan === 'won' ? new Date() : null,
         tujuan === 'lost' ? new Date() : null,
         req.params.id]);

      await tx.run(
        `INSERT INTO opportunity_stage_history (opportunity_id, from_stage, to_stage, note, changed_by)
         VALUES (?, ?, ?, ?, ?)`,
        [req.params.id, o.stage, tujuan,
         String(req.body?.note || (tujuan === 'lost' ? kode : '')).slice(0, 500) || null,
         (req as any).userId || null]);

      return { ok: true as const, dari: o.stage, ke: tujuan };
    });

    if ((hasil as any).error) return res.status((hasil as any).error).json((hasil as any).body);
    res.json({ message: `Tahap diubah ${(hasil as any).dari} → ${(hasil as any).ke}`, ...(hasil as any) });
  } catch (e: any) {
    console.error('Error mengubah tahap:', e);
    res.status(500).json({ error: e.message });
  }
});

/**
 * Ringkasan pipeline & win rate.
 *
 * Penyebut win rate hanya opportunity yang SUDAH DIPUTUSKAN (won + lost).
 * Yang masih terbuka dilaporkan terpisah — memasukkannya membuat angkanya
 * selalu terlihat bagus di awal, karena yang belum kalah belum terhitung kalah.
 */
router.get('/ringkasan/pipeline', authMiddleware, async (_req: Request, res: Response) => {
  try {
    const rows: any[] = await dbAll(
      `SELECT id, stage, probability, estimated_value, lost_reason_code FROM opportunities`, []);

    const bulat = (n: number) => Math.round(n * 100) / 100;
    const perTahap: Record<string, { jml: number; nilai: number }> = {};
    let terbukaNilai = 0, terbukaTertimbang = 0;
    let menangNilai = 0, kalahNilai = 0, jmlMenang = 0, jmlKalah = 0;
    const alasanKalah: Record<string, number> = {};
    let tanpaDasar = 0;

    for (const o of rows) {
      const n = await nilaiOpportunity(o.id);
      const nilai = n.nilai ?? 0;
      const t = perTahap[o.stage] || (perTahap[o.stage] = { jml: 0, nilai: 0 });
      t.jml++; t.nilai = bulat(t.nilai + nilai);
      if (n.sumber === 'taksiran' && n.nilai !== null) tanpaDasar++;

      if (o.stage === 'won') { jmlMenang++; menangNilai += nilai; }
      else if (o.stage === 'lost') {
        jmlKalah++; kalahNilai += nilai;
        const k = o.lost_reason_code || '(tanpa kode)';
        alasanKalah[k] = (alasanKalah[k] || 0) + 1;
      } else if (o.stage !== 'cancelled') {
        terbukaNilai += nilai;
        terbukaTertimbang += nilai * (Number(o.probability) || 0) / 100;
      }
    }

    const diputuskan = jmlMenang + jmlKalah;
    res.json({
      per_tahap: perTahap,
      terbuka: { nilai: bulat(terbukaNilai), tertimbang: bulat(terbukaTertimbang) },
      menang: { jml: jmlMenang, nilai: bulat(menangNilai) },
      kalah: { jml: jmlKalah, nilai: bulat(kalahNilai), per_alasan: alasanKalah },
      win_rate: {
        // null, bukan 0 — belum ada yang diputuskan berarti belum ada rasio,
        // dan nol akan terbaca sebagai "belum pernah menang".
        pct: diputuskan > 0 ? Math.round(jmlMenang / diputuskan * 10000) / 100 : null,
        pct_nilai: (menangNilai + kalahNilai) > 0
          ? Math.round(menangNilai / (menangNilai + kalahNilai) * 10000) / 100 : null,
        penyebut: diputuskan,
        catatan: 'Penyebutnya hanya opportunity yang sudah diputuskan (menang + kalah). '
               + 'Yang masih terbuka sengaja tidak ikut — memasukkannya membuat angka ini '
               + 'selalu terlihat bagus di awal.',
      },
      keterandalan: {
        nilai_dari_taksiran: tanpaDasar,
        catatan: tanpaDasar
          ? `${tanpaDasar} opportunity nilainya masih taksiran, belum ada revisi penawaran terbit.`
          : 'Seluruh nilai berasal dari revisi penawaran yang terbit.',
      },
    });
  } catch (e: any) {
    console.error('Error ringkasan pipeline:', e);
    res.status(500).json({ error: e.message });
  }
});

export default router;
