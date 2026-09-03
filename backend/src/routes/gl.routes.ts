import express, { Request, Response } from 'express';
import { dbAll, dbGet, dbRun, withTransaction } from '../config/database';
import { authMiddleware } from '../middleware/auth';
import { requirePermission } from '../middleware/permission';
import { nextSequentialCode } from './procurement.routes';
import {
  uang, GlGagal, STATUS_DIHITUNG, SQL_SALDO, saldoNormal, periodeUntuk, buatJurnal,
} from '../utils/gl-posting';

const router = express.Router();

/**
 * General Ledger (GL-01).
 *
 * Skemanya diadaptasi dari GL di instance rheologi, tapi jalur tulisnya ditulis
 * ulang. Lima hal yang di sana tidak ada, dan itulah sebab berkas ini ada:
 *
 * 1. **Setiap tulisan ada di dalam transaction.** Di sana nol. Header jurnal
 *    disisipkan lalu barisnya di-loop satu per satu — gagal di baris ke-3 dari
 *    4 meninggalkan jurnal yang total_debit/total_credit-nya bilang seimbang
 *    sementara barisnya tidak.
 * 2. **Debit = kredit diperiksa atas yang TERSIMPAN, bukan atas body request.**
 *    Ini bedanya "formulir yang menolak isian ngawur" dengan "buku besar yang
 *    tidak bisa tidak seimbang".
 * 3. **Akun header dan akun kontrol menolak jurnal.** Di sana `is_header` cuma
 *    dipakai di CRUD dan filter laporan, jadi uang bisa mendarat di akun yang
 *    laporannya justru membuang — hilang tanpa error.
 * 4. **Periode tertutup benar-benar mengunci.** Di sana periode dicari dengan
 *    `period?.id || null`: tidak ketemu periode terbuka? jurnal tetap lahir,
 *    cuma tanpa label periode. Dan posting tidak melihat periode sama sekali.
 * 5. **Saldo tidak pernah disimpan.** Tidak ada kolom current_balance untuk
 *    melenceng; trial balance, neraca, dan laba rugi semuanya dari SATU jalur
 *    perhitungan di `SQL_SALDO`.
 */

const glError = (res: Response, konteks: string, error: any) => {
  console.error(`GL ${konteks}:`, error?.message || error);
  return res.status(500).json({ error: `Gagal memproses ${konteks}`, code: 'GL_ERROR' });
};
const tangkapGagal = (res: Response, konteks: string, e: any) => {
  if (e instanceof GlGagal) {
    return res.status(e.httpStatus).json({ error: e.message, code: e.code, ...e.extra });
  }
  return glError(res, konteks, e);
};

// ═══════════════════════════════════════════════════════════════════════
// CHART OF ACCOUNTS
// ═══════════════════════════════════════════════════════════════════════

const coaView = [authMiddleware, requirePermission('finance.chart-of-accounts.view', 'finance.general-ledger.view')];
const coaEdit = [authMiddleware, requirePermission('finance.chart-of-accounts.edit', 'finance.chart-of-accounts.create')];

router.get('/coa', ...coaView, async (req: Request, res: Response) => {
  try {
    const { with_balance, as_of } = req.query;
    const rows = await dbAll(
      `SELECT c.*, p.account_code AS parent_code
       FROM chart_of_accounts c
       LEFT JOIN chart_of_accounts p ON p.id = c.parent_id
       ${req.query.include_inactive === '1' ? '' : 'WHERE c.is_active = 1'}
       ORDER BY c.display_order, c.account_code`
    );

    if (with_balance === '1') {
      const params: any[] = [];
      let filter = '';
      if (as_of) { filter = ' AND je.entry_date <= ?'; params.push(as_of); }
      const saldo = await dbAll(`${SQL_SALDO}${filter} GROUP BY jl.account_id`, params);
      const peta = new Map<number, any>(saldo.map((s: any) => [Number(s.account_id), s]));
      for (const r of rows as any[]) {
        const s = peta.get(Number(r.id));
        r.total_debit = uang(s?.total_debit);
        r.total_credit = uang(s?.total_credit);
        r.balance = saldoNormal(r.normal_balance, r.total_debit, r.total_credit);
      }
    }
    res.json({ data: rows });
  } catch (e) { glError(res, 'daftar akun', e); }
});

router.get('/coa/:id', ...coaView, async (req: Request, res: Response) => {
  try {
    const akun = await dbGet('SELECT * FROM chart_of_accounts WHERE id = ?', [req.params.id]);
    if (!akun) return res.status(404).json({ error: 'Akun tidak ditemukan' });
    res.json({ data: akun });
  } catch (e) { glError(res, 'detail akun', e); }
});

router.post('/coa', ...coaEdit, async (req: Request, res: Response) => {
  try {
    const { account_code, account_name, account_type, normal_balance, parent_code,
            is_header, statement_section, description } = req.body || {};
    if (!account_code || !account_name || !account_type || !normal_balance) {
      return res.status(400).json({ error: 'account_code, account_name, account_type, dan normal_balance wajib diisi', code: 'FIELD_WAJIB' });
    }
    if (!['debit', 'credit'].includes(normal_balance)) {
      return res.status(400).json({ error: 'normal_balance harus debit atau credit', code: 'SALDO_NORMAL_TIDAK_SAH' });
    }
    const induk = parent_code
      ? await dbGet('SELECT id, level FROM chart_of_accounts WHERE account_code = ?', [parent_code]) as any
      : null;
    if (parent_code && !induk) return res.status(400).json({ error: 'Akun induk tidak ditemukan', code: 'INDUK_TIDAK_ADA' });

    const hasil = await dbRun(
      `INSERT INTO chart_of_accounts
        (account_code, account_name, account_type, normal_balance, parent_id, level,
         is_header, is_postable, statement_section, description, display_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [account_code, account_name, account_type, normal_balance, induk?.id ?? null,
       induk ? Number(induk.level) + 1 : 1, is_header ? 1 : 0, is_header ? 0 : 1,
       statement_section || null, description || null, Number(req.body?.display_order) || 9999]
    );
    res.status(201).json({ message: 'Akun dibuat', data: { id: hasil.insertId } });
  } catch (e: any) {
    if (e?.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Kode akun sudah dipakai', code: 'KODE_AKUN_DUPLIKAT' });
    }
    glError(res, 'buat akun', e);
  }
});

router.put('/coa/:id', ...coaEdit, async (req: Request, res: Response) => {
  try {
    const akun = await dbGet('SELECT * FROM chart_of_accounts WHERE id = ?', [req.params.id]) as any;
    if (!akun) return res.status(404).json({ error: 'Akun tidak ditemukan' });

    const { account_name, statement_section, description, is_active, display_order } = req.body || {};

    // Jenis akun, saldo normal, dan kode SENGAJA tidak bisa diubah lewat sini.
    // Mengubahnya pada akun yang sudah punya jurnal akan membalik arti seluruh
    // saldo historisnya tanpa satu pun baris jurnal berubah — laporan bulan
    // lalu ikut berubah dan tidak ada jejak yang menjelaskan kenapa.
    const adaJurnal = await dbGet(
      'SELECT COUNT(*) AS c FROM journal_lines WHERE account_id = ?', [akun.id]) as any;
    if (Number(adaJurnal?.c) > 0 && is_active === false) {
      return res.status(409).json({
        error: 'Akun ini sudah punya baris jurnal, jadi tidak bisa dinonaktifkan. Biarkan aktif supaya saldo historisnya tetap terbaca.',
        code: 'AKUN_SUDAH_TERPAKAI',
      });
    }

    await dbRun(
      `UPDATE chart_of_accounts
       SET account_name = COALESCE(?, account_name),
           statement_section = COALESCE(?, statement_section),
           description = COALESCE(?, description),
           is_active = COALESCE(?, is_active),
           display_order = COALESCE(?, display_order)
       WHERE id = ?`,
      [account_name ?? null, statement_section ?? null, description ?? null,
       is_active === undefined ? null : (is_active ? 1 : 0),
       display_order ?? null, akun.id]
    );
    res.json({ message: 'Akun diperbarui' });
  } catch (e) { glError(res, 'ubah akun', e); }
});

router.delete('/coa/:id', authMiddleware, requirePermission('finance.chart-of-accounts.delete'),
  async (req: Request, res: Response) => {
  try {
    const dipakai = await dbGet(
      'SELECT COUNT(*) AS c FROM journal_lines WHERE account_id = ?', [req.params.id]) as any;
    if (Number(dipakai?.c) > 0) {
      return res.status(409).json({
        error: `Akun ini dipakai ${dipakai.c} baris jurnal dan tidak bisa dihapus. Nonaktifkan saja kalau sudah tidak dipakai lagi.`,
        code: 'AKUN_SUDAH_TERPAKAI',
      });
    }
    const anak = await dbGet(
      'SELECT COUNT(*) AS c FROM chart_of_accounts WHERE parent_id = ?', [req.params.id]) as any;
    if (Number(anak?.c) > 0) {
      return res.status(409).json({ error: 'Akun ini masih punya akun turunan', code: 'AKUN_PUNYA_ANAK' });
    }
    const dipetakan = await dbGet(
      `SELECT COUNT(*) AS c FROM gl_account_mappings m
       JOIN chart_of_accounts c ON c.account_code = m.account_code
       WHERE c.id = ? AND m.is_active = 1`, [req.params.id]) as any;
    if (Number(dipetakan?.c) > 0) {
      return res.status(409).json({
        error: 'Akun ini masih dipakai pemetaan jurnal otomatis. Alihkan pemetaannya dulu.',
        code: 'AKUN_MASIH_DIPETAKAN',
      });
    }
    await dbRun('DELETE FROM chart_of_accounts WHERE id = ?', [req.params.id]);
    res.json({ message: 'Akun dihapus' });
  } catch (e) { glError(res, 'hapus akun', e); }
});

// ═══════════════════════════════════════════════════════════════════════
// PERIODE FISKAL
// ═══════════════════════════════════════════════════════════════════════

router.get('/fiscal-periods', authMiddleware,
  requirePermission('finance.fiscal-periods.view', 'finance.general-ledger.view'),
  async (req: Request, res: Response) => {
  try {
    const params: any[] = [];
    let where = '';
    if (req.query.fiscal_year) { where = 'WHERE fiscal_year = ?'; params.push(req.query.fiscal_year); }
    const rows = await dbAll(
      `SELECT p.*, u.full_name AS closed_by_name,
              (SELECT COUNT(*) FROM journal_entries je WHERE je.fiscal_period_id = p.id AND je.status = 'posted') AS posted_entries
       FROM fiscal_periods p
       LEFT JOIN users u ON u.id = p.closed_by
       ${where} ORDER BY p.fiscal_year DESC, p.period_number DESC`, params);
    res.json({ data: rows });
  } catch (e) { glError(res, 'daftar periode', e); }
});

/** Membuat 12 periode bulanan untuk satu tahun. Idempoten. */
router.post('/fiscal-periods/generate', authMiddleware,
  requirePermission('finance.fiscal-periods.create', 'finance.fiscal-periods.edit'),
  async (req: Request, res: Response) => {
  try {
    const tahun = Number(req.body?.fiscal_year);
    if (!Number.isInteger(tahun) || tahun < 2000 || tahun > 2100) {
      return res.status(400).json({ error: 'fiscal_year harus tahun yang masuk akal', code: 'TAHUN_TIDAK_SAH' });
    }
    const nama = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
    let dibuat = 0;
    await withTransaction(async tx => {
      for (let b = 1; b <= 12; b++) {
        const akhir = new Date(Date.UTC(tahun, b, 0)).toISOString().slice(0, 10);
        const r = await tx.run(
          `INSERT IGNORE INTO fiscal_periods (period_name, fiscal_year, period_number, start_date, end_date)
           VALUES (?, ?, ?, ?, ?)`,
          [`${nama[b - 1]} ${tahun}`, tahun, b,
           `${tahun}-${String(b).padStart(2, '0')}-01`, akhir]
        );
        if (r.affectedRows > 0) dibuat++;
      }
    });
    res.status(201).json({ message: `${dibuat} periode dibuat untuk ${tahun}`, created: dibuat });
  } catch (e) { glError(res, 'buat periode', e); }
});

router.put('/fiscal-periods/:id/close', authMiddleware,
  requirePermission('finance.fiscal-periods.approve', 'finance.fiscal-periods.edit'),
  async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId ?? null;
    const p = await dbGet('SELECT * FROM fiscal_periods WHERE id = ?', [req.params.id]) as any;
    if (!p) return res.status(404).json({ error: 'Periode tidak ditemukan' });
    if (p.status === 'closed') return res.status(409).json({ error: 'Periode sudah tertutup', code: 'PERIODE_SUDAH_TUTUP' });

    // Jurnal draft di periode yang mau ditutup harus diselesaikan dulu — kalau
    // tidak, ia menggantung selamanya: tidak bisa di-post karena periodenya
    // tertutup, dan tidak terlihat di laporan mana pun karena belum posted.
    const draft = await dbGet(
      `SELECT COUNT(*) AS c FROM journal_entries WHERE fiscal_period_id = ? AND status = 'draft'`,
      [p.id]) as any;
    if (Number(draft?.c) > 0) {
      return res.status(409).json({
        error: `Masih ada ${draft.c} jurnal draft di periode ini. Post atau hapus dulu — setelah periode ditutup, jurnal itu tidak akan bisa di-post lagi.`,
        code: 'MASIH_ADA_DRAFT',
        draft_count: Number(draft.c),
      });
    }

    await dbRun(
      `UPDATE fiscal_periods SET status = 'closed', closed_by = ?, closed_at = CURRENT_TIMESTAMP,
              version = version + 1 WHERE id = ?`,
      [userId, p.id]
    );
    res.json({ message: `Periode ${p.period_name} ditutup` });
  } catch (e) { glError(res, 'tutup periode', e); }
});

router.put('/fiscal-periods/:id/reopen', authMiddleware,
  requirePermission('finance.fiscal-periods.approve'),
  async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId ?? null;
    const alasan = String(req.body?.reason || '').trim();
    if (!alasan) {
      return res.status(400).json({ error: 'Alasan membuka kembali periode wajib diisi', code: 'ALASAN_WAJIB' });
    }
    const p = await dbGet('SELECT * FROM fiscal_periods WHERE id = ?', [req.params.id]) as any;
    if (!p) return res.status(404).json({ error: 'Periode tidak ditemukan' });
    if (p.status === 'open') return res.status(409).json({ error: 'Periode sudah terbuka', code: 'PERIODE_SUDAH_BUKA' });

    await dbRun(
      `UPDATE fiscal_periods SET status = 'open', reopened_by = ?, reopened_at = CURRENT_TIMESTAMP,
              reopen_reason = ?, version = version + 1 WHERE id = ?`,
      [userId, alasan, p.id]
    );
    res.json({ message: `Periode ${p.period_name} dibuka kembali` });
  } catch (e) { glError(res, 'buka periode', e); }
});

// ═══════════════════════════════════════════════════════════════════════
// JURNAL
// ═══════════════════════════════════════════════════════════════════════

const jeView = [authMiddleware, requirePermission('finance.general-ledger.view')];

router.get('/journal-entries', ...jeView, async (req: Request, res: Response) => {
  try {
    const where: string[] = [];
    const params: any[] = [];
    if (req.query.status) { where.push('je.status = ?'); params.push(req.query.status); }
    if (req.query.journal_type) { where.push('je.journal_type = ?'); params.push(req.query.journal_type); }
    if (req.query.from) { where.push('je.entry_date >= ?'); params.push(req.query.from); }
    if (req.query.to) { where.push('je.entry_date <= ?'); params.push(req.query.to); }
    if (req.query.project_id) {
      where.push('EXISTS (SELECT 1 FROM journal_lines jl WHERE jl.journal_entry_id = je.id AND jl.project_id = ?)');
      params.push(req.query.project_id);
    }
    const limit = Math.min(Number(req.query.limit) || 100, 500);

    const rows = await dbAll(
      `SELECT je.*, fp.period_name, u.full_name AS created_by_name, pu.full_name AS posted_by_name,
              (SELECT COUNT(*) FROM journal_lines jl WHERE jl.journal_entry_id = je.id) AS line_count
       FROM journal_entries je
       LEFT JOIN fiscal_periods fp ON fp.id = je.fiscal_period_id
       LEFT JOIN users u ON u.id = je.created_by
       LEFT JOIN users pu ON pu.id = je.posted_by
       ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
       ORDER BY je.entry_date DESC, je.id DESC LIMIT ${limit}`, params);
    res.json({ data: rows });
  } catch (e) { glError(res, 'daftar jurnal', e); }
});

router.get('/journal-entries/:id', ...jeView, async (req: Request, res: Response) => {
  try {
    const je = await dbGet(
      `SELECT je.*, fp.period_name, fp.status AS period_status,
              u.full_name AS created_by_name, pu.full_name AS posted_by_name,
              ro.entry_number AS original_entry_number, rv.entry_number AS reversal_entry_number
       FROM journal_entries je
       LEFT JOIN fiscal_periods fp ON fp.id = je.fiscal_period_id
       LEFT JOIN users u ON u.id = je.created_by
       LEFT JOIN users pu ON pu.id = je.posted_by
       LEFT JOIN journal_entries ro ON ro.id = je.original_journal_id
       LEFT JOIN journal_entries rv ON rv.id = je.reversal_journal_id
       WHERE je.id = ?`, [req.params.id]);
    if (!je) return res.status(404).json({ error: 'Jurnal tidak ditemukan' });

    const lines = await dbAll(
      `SELECT jl.*, c.account_code, c.account_name, c.normal_balance, cp.project_name
       FROM journal_lines jl
       JOIN chart_of_accounts c ON c.id = jl.account_id
       LEFT JOIN client_projects cp ON cp.id = jl.project_id
       WHERE jl.journal_entry_id = ? ORDER BY jl.line_number, jl.id`, [req.params.id]);
    res.json({ data: { ...je, lines } });
  } catch (e) { glError(res, 'detail jurnal', e); }
});

router.post('/journal-entries', authMiddleware,
  requirePermission('finance.general-ledger.create', 'finance.general-ledger.edit'),
  async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId ?? null;
    const { entry_date, description, lines, journal_type,
            reference_type, reference_id, reference_number } = req.body || {};

    if (!entry_date || !String(description || '').trim()) {
      return res.status(400).json({ error: 'entry_date dan description wajib diisi', code: 'FIELD_WAJIB' });
    }
    if (!Array.isArray(lines) || lines.length < 2) {
      return res.status(400).json({ error: 'Jurnal harus punya minimal 2 baris', code: 'BARIS_KURANG' });
    }
    const tipe = ['MANUAL', 'OPENING', 'ADJUSTMENT'].includes(String(journal_type)) ? String(journal_type) : 'MANUAL';

    const hasil = await withTransaction(async tx => {
      const nomor = await nextSequentialCode('JE', 'journal_entries', 'entry_number', tx);
      return await buatJurnal({
        tx, entryNumber: nomor, entryDate: entry_date, description: String(description).trim(),
        journalType: tipe, lines, userId, manual: true,
        referenceType: reference_type ?? null,
        referenceId: reference_id ?? null,
        referenceNumber: reference_number ?? null,
      });
    });

    res.status(201).json({
      message: 'Jurnal dibuat sebagai draft',
      data: { id: (hasil as any).jeId, entry_number: (hasil as any).entryNumber },
    });
  } catch (e) { tangkapGagal(res, 'buat jurnal', e); }
});

router.put('/journal-entries/:id/post', authMiddleware,
  requirePermission('finance.general-ledger.approve', 'finance.general-ledger.edit'),
  async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId ?? null;
    const hasil = await withTransaction(async tx => {
      const je = await tx.get('SELECT * FROM journal_entries WHERE id = ? FOR UPDATE', [req.params.id]) as any;
      if (!je) throw new GlGagal('TIDAK_DITEMUKAN', 'Jurnal tidak ditemukan', 404);
      if (je.status !== 'draft') {
        throw new GlGagal('BUKAN_DRAFT', `Hanya jurnal draft yang bisa di-post; ini berstatus ${je.status}`, 409);
      }

      // Diperiksa ULANG saat posting, bukan cuma saat dibuat. Barisnya bisa
      // berubah di antara keduanya, dan posting adalah titik ia jadi kenyataan.
      const jml = await tx.get(
        `SELECT COALESCE(SUM(debit), 0) AS d, COALESCE(SUM(credit), 0) AS k, COUNT(*) AS n
         FROM journal_lines WHERE journal_entry_id = ?`, [je.id]) as any;
      const d = uang(jml?.d), k = uang(jml?.k);
      if (Number(jml?.n) < 2 || Math.abs(d - k) > 0.0001) {
        throw new GlGagal('TIDAK_SEIMBANG', `Jurnal tidak seimbang: debit ${d} vs kredit ${k}`);
      }

      const periode = await periodeUntuk(je.entry_date, tx);
      if (!periode) throw new GlGagal('PERIODE_TIDAK_ADA', 'Periode fiskal untuk tanggal ini tidak ada', 409);
      if (periode.status === 'closed') {
        throw new GlGagal('PERIODE_TERTUTUP', `Periode ${periode.period_name} sudah ditutup`, 409);
      }

      await tx.run(
        `UPDATE journal_entries SET status = 'posted', posted_by = ?, posted_at = CURRENT_TIMESTAMP,
                total_debit = ?, total_credit = ?, fiscal_period_id = ? WHERE id = ?`,
        [userId, d, k, periode.id, je.id]
      );
      return { ok: true, total: d };
    });

    res.json({ message: 'Jurnal di-post', total: (hasil as any).total });
  } catch (e) { tangkapGagal(res, 'post jurnal', e); }
});

/**
 * Membalik jurnal yang sudah di-post.
 *
 * Jurnal yang sudah posted TIDAK PERNAH diubah atau dihapus — koreksinya lewat
 * jurnal pembalik, sama seperti change order pada ledger kontrak. Menghapus
 * jurnal yang sudah masuk laporan membuat laporan bulan lalu berubah tanpa
 * jejak apa pun.
 */
router.put('/journal-entries/:id/reverse', authMiddleware,
  requirePermission('finance.general-ledger.approve'),
  async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId ?? null;
    const alasan = String(req.body?.reason || '').trim();
    if (!alasan) return res.status(400).json({ error: 'Alasan pembalikan wajib diisi', code: 'ALASAN_WAJIB' });
    const tanggal = req.body?.reversal_date || new Date().toISOString().slice(0, 10);

    const asli = await dbGet('SELECT * FROM journal_entries WHERE id = ?', [req.params.id]) as any;
    if (!asli) return res.status(404).json({ error: 'Jurnal tidak ditemukan' });
    // Diperiksa SEBELUM status: jurnal yang sudah dibalik berstatus 'reversed',
    // jadi kalau status diperiksa duluan, penolakannya berbunyi "bukan posted"
    // dan penggunanya tidak tahu bahwa pembalikannya memang sudah ada.
    if (asli.reversal_journal_id) {
      const balikan = await dbGet('SELECT entry_number FROM journal_entries WHERE id = ?',
        [asli.reversal_journal_id]) as any;
      return res.status(409).json({
        error: `${asli.entry_number} sudah dibalik lewat ${balikan?.entry_number || 'jurnal lain'}.`,
        code: 'SUDAH_DIBALIK',
      });
    }
    if (asli.status !== 'posted') {
      return res.status(409).json({ error: `Hanya jurnal posted yang bisa dibalik; ini berstatus ${asli.status}`, code: 'BUKAN_POSTED' });
    }

    const hasil = await withTransaction(async tx => {
      const lines = await tx.all(
        'SELECT * FROM journal_lines WHERE journal_entry_id = ? ORDER BY line_number, id', [asli.id]) as any[];
      const dibalik = lines.map(l => ({
        account_id: l.account_id, description: l.description,
        debit: uang(l.credit), credit: uang(l.debit),
        project_id: l.project_id, vendor_id: l.vendor_id, client_id: l.client_id,
        employee_id: l.employee_id, product_id: l.product_id, asset_id: l.asset_id,
        source_line_ref: l.source_line_ref,
      }));

      const nomor = await nextSequentialCode('JE', 'journal_entries', 'entry_number', tx);
      // manual: false — pembalikan harus bisa menyentuh akun kontrol, karena
      // jurnal aslinya memang menyentuhnya. Kalau tidak, jurnal sistem yang
      // salah tidak akan pernah bisa dikoreksi.
      const buat = await buatJurnal({
        tx, entryNumber: nomor, entryDate: tanggal,
        description: `Pembalikan ${asli.entry_number}: ${alasan}`,
        journalType: 'REVERSAL', lines: dibalik, userId, manual: false,
        originalJournalId: asli.id,
        referenceType: asli.reference_type, referenceId: asli.reference_id,
        referenceNumber: asli.reference_number,
      });
      const baruId = (buat as any).jeId;
      await tx.run(
        `UPDATE journal_entries SET status = 'posted', posted_by = ?, posted_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [userId, baruId]
      );
      await tx.run(
        `UPDATE journal_entries SET status = 'reversed', reversal_journal_id = ?, reversal_reason = ? WHERE id = ?`,
        [baruId, alasan, asli.id]
      );
      return { jeId: baruId, entryNumber: (buat as any).entryNumber };
    });

    res.status(201).json({
      message: `Jurnal dibalik lewat ${(hasil as any).entryNumber}`,
      data: { id: (hasil as any).jeId, entry_number: (hasil as any).entryNumber },
    });
  } catch (e) { tangkapGagal(res, 'balik jurnal', e); }
});

/** Draft boleh dihapus. Yang sudah posted tidak — itu jalur reverse. */
router.delete('/journal-entries/:id', authMiddleware,
  requirePermission('finance.general-ledger.delete'),
  async (req: Request, res: Response) => {
  try {
    const je = await dbGet('SELECT id, status, entry_number FROM journal_entries WHERE id = ?', [req.params.id]) as any;
    if (!je) return res.status(404).json({ error: 'Jurnal tidak ditemukan' });
    if (je.status !== 'draft') {
      return res.status(409).json({
        error: `${je.entry_number} sudah ${je.status} dan tidak bisa dihapus. Koreksinya lewat pembalikan, supaya laporan yang sudah terbit tidak berubah tanpa jejak.`,
        code: 'BUKAN_DRAFT',
      });
    }
    await dbRun('DELETE FROM journal_entries WHERE id = ?', [je.id]);
    res.json({ message: 'Jurnal draft dihapus' });
  } catch (e) { glError(res, 'hapus jurnal', e); }
});

// ═══════════════════════════════════════════════════════════════════════
// LAPORAN — semuanya dari SQL_SALDO, satu jalur perhitungan
// ═══════════════════════════════════════════════════════════════════════

/** Mengembalikan peta account_id → {debit, credit} untuk rentang tanggal. */
const saldoPerAkun = async (from?: any, to?: any) => {
  const params: any[] = [];
  let filter = '';
  if (from) { filter += ' AND je.entry_date >= ?'; params.push(from); }
  if (to) { filter += ' AND je.entry_date <= ?'; params.push(to); }
  const rows = await dbAll(`${SQL_SALDO}${filter} GROUP BY jl.account_id`, params);
  return new Map<number, any>(rows.map((r: any) => [Number(r.account_id), r]));
};

router.get('/trial-balance', ...jeView, async (req: Request, res: Response) => {
  try {
    const { from, to } = req.query;
    const akun = await dbAll(
      `SELECT id, account_code, account_name, account_type, normal_balance, statement_section
       FROM chart_of_accounts WHERE is_active = 1 AND is_header = 0
       ORDER BY display_order, account_code`) as any[];
    const saldo = await saldoPerAkun(from, to);

    let totalD = 0, totalK = 0;
    const baris = akun.map(a => {
      const s = saldo.get(Number(a.id));
      const d = uang(s?.total_debit), k = uang(s?.total_credit);
      const net = saldoNormal(a.normal_balance, d, k);
      // Kolom debit/kredit trial balance menampilkan saldo BERSIH di sisi
      // normalnya, bukan mutasi kotor — itu yang dibandingkan dengan neraca.
      const sisiD = a.normal_balance === 'debit' ? Math.max(net, 0) : Math.max(-net, 0);
      const sisiK = a.normal_balance === 'credit' ? Math.max(net, 0) : Math.max(-net, 0);
      totalD = uang(totalD + sisiD); totalK = uang(totalK + sisiK);
      return { ...a, mutasi_debit: d, mutasi_kredit: k, saldo: net, debit: sisiD, kredit: sisiK };
    }).filter(r => r.mutasi_debit !== 0 || r.mutasi_kredit !== 0 || req.query.include_zero === '1');

    res.json({
      data: baris,
      total_debit: totalD,
      total_credit: totalK,
      // Kalau ini bukan nol, ada yang salah di jalur posting — bukan di laporan.
      selisih: uang(totalD - totalK),
      seimbang: Math.abs(totalD - totalK) < 0.0001,
      periode: { from: from || null, to: to || null },
    });
  } catch (e) { glError(res, 'trial balance', e); }
});

/**
 * Buku besar satu akun: saldo awal, mutasi, saldo berjalan.
 *
 * Filter statusnya WAJIB memakai STATUS_DIHITUNG, bukan ditulis ulang. Versi
 * pertama menuliskannya sendiri sebagai `je.status = 'posted'` — jadi jurnal
 * yang sudah dibalik hilang dari daftar mutasi sementara pembaliknya tetap ada,
 * dan saldo akhirnya berbalik tanda. Itu persis cacat "dua jalur" yang modul
 * ini dibuat untuk menghindarinya, dan tertangkap tes: "saldo beban kembali
 * nol" menjawab -250000.
 */
router.get('/ledger/:accountId', ...jeView, async (req: Request, res: Response) => {
  try {
    const { from, to } = req.query;
    const akun = await dbGet('SELECT * FROM chart_of_accounts WHERE id = ?', [req.params.accountId]) as any;
    if (!akun) return res.status(404).json({ error: 'Akun tidak ditemukan' });

    let saldoAwal = 0;
    if (from) {
      const a = await dbGet(
        `${SQL_SALDO} AND jl.account_id = ? AND je.entry_date < ? GROUP BY jl.account_id`,
        [akun.id, from]) as any;
      saldoAwal = saldoNormal(akun.normal_balance, uang(a?.total_debit), uang(a?.total_credit));
    }

    const params: any[] = [akun.id];
    let filter = '';
    if (from) { filter += ' AND je.entry_date >= ?'; params.push(from); }
    if (to) { filter += ' AND je.entry_date <= ?'; params.push(to); }

    const mutasi = await dbAll(
      `SELECT jl.id, jl.debit, jl.credit, jl.description AS line_description, jl.project_id,
              je.id AS journal_entry_id, je.entry_number, je.entry_date, je.description,
              je.journal_type, je.reference_number, cp.project_name
       FROM journal_lines jl
       JOIN journal_entries je ON je.id = jl.journal_entry_id
       LEFT JOIN client_projects cp ON cp.id = jl.project_id
       WHERE je.status IN ${STATUS_DIHITUNG} AND jl.account_id = ?${filter}
       ORDER BY je.entry_date, je.id, jl.line_number`, params) as any[];

    let berjalan = saldoAwal;
    for (const m of mutasi) {
      berjalan = uang(berjalan + saldoNormal(akun.normal_balance, uang(m.debit), uang(m.credit)));
      m.saldo_berjalan = berjalan;
    }

    res.json({
      data: { account: akun, saldo_awal: saldoAwal, saldo_akhir: berjalan, mutasi },
    });
  } catch (e) { glError(res, 'buku besar', e); }
});

router.get('/reports/income-statement', ...jeView, async (req: Request, res: Response) => {
  try {
    const { from, to } = req.query;
    const akun = await dbAll(
      `SELECT id, account_code, account_name, account_type, normal_balance, statement_section
       FROM chart_of_accounts
       WHERE is_active = 1 AND is_header = 0
         AND account_type IN ('revenue','cogs','expense','other_income','tax')
       ORDER BY display_order, account_code`) as any[];
    const saldo = await saldoPerAkun(from, to);

    const isi = (jenis: string[]) => akun.filter(a => jenis.includes(a.account_type)).map(a => {
      const s = saldo.get(Number(a.id));
      return { ...a, amount: saldoNormal(a.normal_balance, uang(s?.total_debit), uang(s?.total_credit)) };
    }).filter(a => a.amount !== 0 || req.query.include_zero === '1');

    const jumlah = (rows: any[]) => uang(rows.reduce((t, r) => t + Number(r.amount), 0));
    const pendapatan = isi(['revenue']);
    const bebanPokok = isi(['cogs']);
    const beban = isi(['expense']);
    const lain = isi(['other_income']);
    const pajak = isi(['tax']);

    const totalPendapatan = jumlah(pendapatan);
    const totalPokok = jumlah(bebanPokok);
    const labaKotor = uang(totalPendapatan - totalPokok);
    const totalBeban = jumlah(beban);
    const labaOperasi = uang(labaKotor - totalBeban);
    const totalLain = jumlah(lain);
    const totalPajak = jumlah(pajak);

    res.json({
      periode: { from: from || null, to: to || null },
      pendapatan, total_pendapatan: totalPendapatan,
      beban_pokok: bebanPokok, total_beban_pokok: totalPokok,
      laba_kotor: labaKotor,
      margin_kotor_pct: totalPendapatan ? uang((labaKotor / totalPendapatan) * 100) : null,
      beban_operasional: beban, total_beban_operasional: totalBeban,
      laba_operasi: labaOperasi,
      pendapatan_beban_lain: lain, total_lain: totalLain,
      pajak, total_pajak: totalPajak,
      laba_bersih: uang(labaOperasi + totalLain - totalPajak),
    });
  } catch (e) { glError(res, 'laba rugi', e); }
});

router.get('/reports/balance-sheet', ...jeView, async (req: Request, res: Response) => {
  try {
    const asOf = req.query.as_of || new Date().toISOString().slice(0, 10);
    const akun = await dbAll(
      `SELECT id, account_code, account_name, account_type, normal_balance, statement_section
       FROM chart_of_accounts WHERE is_active = 1 AND is_header = 0
       ORDER BY display_order, account_code`) as any[];
    const saldo = await saldoPerAkun(null, asOf);

    const nilai = (a: any) => {
      const s = saldo.get(Number(a.id));
      return saldoNormal(a.normal_balance, uang(s?.total_debit), uang(s?.total_credit));
    };
    const kelompok = (jenis: string[]) => akun.filter(a => jenis.includes(a.account_type))
      .map(a => ({ ...a, amount: nilai(a) }))
      .filter(a => a.amount !== 0 || req.query.include_zero === '1');
    const jumlah = (rows: any[]) => uang(rows.reduce((t, r) => t + Number(r.amount), 0));

    const aset = kelompok(['asset']);
    const liabilitas = kelompok(['liability']);
    const ekuitas = kelompok(['equity']);

    // Laba berjalan BELUM masuk akun ekuitas sampai tutup buku, jadi neraca
    // tidak akan pernah seimbang kalau ia tidak ikut dihitung di sini.
    const labaRugi = akun.filter(a => ['revenue','cogs','expense','other_income','tax'].includes(a.account_type));
    const labaBerjalan = uang(labaRugi.reduce((t, a) => {
      const v = nilai(a);
      return a.account_type === 'revenue' || a.account_type === 'other_income' ? t + v : t - v;
    }, 0));

    const totalAset = jumlah(aset);
    const totalLiabilitas = jumlah(liabilitas);
    const totalEkuitas = uang(jumlah(ekuitas) + labaBerjalan);

    res.json({
      as_of: asOf,
      aset, total_aset: totalAset,
      liabilitas, total_liabilitas: totalLiabilitas,
      ekuitas, laba_berjalan: labaBerjalan, total_ekuitas: totalEkuitas,
      total_liabilitas_ekuitas: uang(totalLiabilitas + totalEkuitas),
      selisih: uang(totalAset - totalLiabilitas - totalEkuitas),
      seimbang: Math.abs(totalAset - totalLiabilitas - totalEkuitas) < 0.0001,
    });
  } catch (e) { glError(res, 'neraca', e); }
});

// ═══════════════════════════════════════════════════════════════════════
// PEMETAAN & SETELAN
// ═══════════════════════════════════════════════════════════════════════

router.get('/mappings', ...jeView, async (_req: Request, res: Response) => {
  try {
    const rows = await dbAll(
      `SELECT m.*, c.account_name, c.is_header, c.is_active AS account_active
       FROM gl_account_mappings m
       LEFT JOIN chart_of_accounts c ON c.account_code = m.account_code
       ORDER BY m.event_code, m.role`);
    res.json({
      data: rows,
      // Pemetaan yang menunjuk akun tidak ada / header / nonaktif akan gagal
      // saat jurnal otomatis berjalan — dan itu jam 2 pagi, bukan sekarang.
      bermasalah: (rows as any[]).filter(r => !r.account_name || r.is_header || !r.account_active)
        .map(r => ({ event_code: r.event_code, role: r.role, account_code: r.account_code })),
    });
  } catch (e) { glError(res, 'daftar pemetaan', e); }
});

router.put('/mappings/:id', authMiddleware,
  requirePermission('finance.general-ledger.edit'),
  async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId ?? null;
    const kode = String(req.body?.account_code || '').trim();
    if (!kode) return res.status(400).json({ error: 'account_code wajib diisi', code: 'FIELD_WAJIB' });

    const m = await dbGet('SELECT * FROM gl_account_mappings WHERE id = ?', [req.params.id]) as any;
    if (!m) return res.status(404).json({ error: 'Pemetaan tidak ditemukan' });

    const akun = await dbGet(
      'SELECT * FROM chart_of_accounts WHERE account_code = ?', [kode]) as any;
    if (!akun) return res.status(400).json({ error: `Akun ${kode} tidak ada`, code: 'AKUN_TIDAK_ADA' });
    if (akun.is_header || !akun.is_postable) {
      return res.status(400).json({
        error: `${kode} adalah akun header dan tidak bisa menerima jurnal`, code: 'AKUN_HEADER',
      });
    }
    if (!akun.is_active) {
      return res.status(400).json({ error: `${kode} sudah nonaktif`, code: 'AKUN_NONAKTIF' });
    }

    await dbRun(
      'UPDATE gl_account_mappings SET account_code = ?, updated_by = ? WHERE id = ?',
      [kode, userId, m.id]);
    res.json({ message: `${m.event_code}/${m.role} sekarang memakai ${kode}` });
  } catch (e) { glError(res, 'ubah pemetaan', e); }
});

router.get('/settings', ...jeView, async (_req: Request, res: Response) => {
  try {
    const rows = await dbAll('SELECT * FROM gl_settings') as any[];
    const mulai = rows.find(r => r.setting_key === 'auto_posting_start_date')?.setting_value ?? null;
    res.json({
      data: rows,
      auto_posting_start_date: mulai,
      auto_posting_aktif: !!mulai,
    });
  } catch (e) { glError(res, 'setelan', e); }
});

router.put('/settings/auto-posting-start', authMiddleware,
  requirePermission('finance.general-ledger.approve'),
  async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId ?? null;
    const tgl = req.body?.start_date === null ? null : String(req.body?.start_date || '').trim();
    if (tgl && !/^\d{4}-\d{2}-\d{2}$/.test(tgl)) {
      return res.status(400).json({ error: 'start_date harus format YYYY-MM-DD, atau null untuk mematikan', code: 'TANGGAL_TIDAK_SAH' });
    }
    if (tgl) {
      const periode = await periodeUntuk(tgl);
      if (!periode) {
        return res.status(400).json({
          error: `Belum ada periode fiskal yang memuat ${tgl}. Buat periodenya dulu — kalau tidak, jurnal otomatis pertama akan langsung gagal.`,
          code: 'PERIODE_TIDAK_ADA',
        });
      }
    }
    await dbRun(
      `UPDATE gl_settings SET setting_value = ?, updated_by = ? WHERE setting_key = 'auto_posting_start_date'`,
      [tgl || null, userId]);
    res.json({
      message: tgl ? `Auto-posting aktif untuk transaksi sejak ${tgl}` : 'Auto-posting dimatikan',
      auto_posting_start_date: tgl || null,
    });
  } catch (e) { glError(res, 'ubah tanggal mulai', e); }
});

export default router;
