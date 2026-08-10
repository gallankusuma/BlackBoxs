import { Router, Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import multer from 'multer';
import { dbAll, dbGet, dbRun, withTransaction } from '../config/database';
import { authMiddleware } from '../middleware/auth';
import { requirePermission } from '../middleware/permission';
import { validateUpload, storeValidatedFile, removeStoredFile } from '../utils/file-validation';
import { validateAssetInput, validateMaintenanceInput, validatePurchaseHistoryInput, serverError }
  from '../utils/asset-validation';
import { calcDepreciation } from '../utils/depreciation';

const router = Router();

// as_of_date memungkinkan memeriksa nilai buku pada tanggal tertentu
// (acceptance criteria AST-003), bukan selalu hari ini.
function withDepreciation(row: any, asOfDate?: string, additions: any[] = [], lock?: any) {
  return {
    ...row,
    spec: typeof row.spec === 'string' ? JSON.parse(row.spec || '{}') : (row.spec || {}),
    ...calcDepreciation(row, asOfDate, additions, lock),
  };
}

// Periode terakhir yang sudah ditutup. Selama belum ada yang ditutup, ini
// mengembalikan null dan perhitungan berjalan dinamis persis seperti semula.
async function lastClosedPeriod(): Promise<{ year: number; month: number; end: string } | null> {
  const row: any = await dbGet(
    `SELECT period_year, period_month FROM asset_depreciation_periods
     WHERE status = 'closed' ORDER BY period_year DESC, period_month DESC LIMIT 1`
  );
  if (!row) return null;
  const year = Number(row.period_year), month = Number(row.period_month);
  const day = new Date(year, month, 0).getDate();
  return { year, month, end: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}` };
}

// Akumulasi terkunci per aset, diambil dari baris ledger periode tersebut.
async function lockedAccumulatedByAsset(assetIds: number[], year: number, month: number): Promise<Record<number, number>> {
  if (!assetIds.length) return {};
  const placeholders = assetIds.map(() => '?').join(',');
  const rows = await dbAll(
    `SELECT asset_id, accumulated_after FROM asset_depreciation_ledger
     WHERE period_year = ? AND period_month = ? AND asset_id IN (${placeholders})`,
    [year, month, ...assetIds]
  ) as any[];
  const map: Record<number, number> = {};
  for (const r of rows) map[r.asset_id] = Number(r.accumulated_after);
  return map;
}

// Ambil capital addition untuk banyak aset sekaligus — menghindari query
// per baris saat menampilkan daftar aset.
async function capitalAdditionsByAsset(assetIds: number[]): Promise<Record<number, any[]>> {
  if (!assetIds.length) return {};
  const placeholders = assetIds.map(() => '?').join(',');
  const rows = await dbAll(
    `SELECT asset_id, amount, capitalized_at, purchase_date
     FROM asset_purchase_history
     WHERE entry_type = 'capital_addition' AND asset_id IN (${placeholders})`,
    assetIds
  ) as any[];
  const grouped: Record<number, any[]> = {};
  for (const r of rows) (grouped[r.asset_id] ||= []).push(r);
  return grouped;
}

// ── Asset code generator (MAX-based, not COUNT-based) ─────────────────────
async function nextAssetCode(): Promise<string> {
  const year = new Date().getFullYear();
  const maxRow: any = await dbGet(
    `SELECT MAX(CAST(SUBSTRING_INDEX(asset_code, '/', -1) AS UNSIGNED)) as maxNum
     FROM assets WHERE YEAR(created_at) = ?`,
    [year]
  );
  const nextNum = (maxRow?.maxNum || 0) + 1;
  return `AST/${year}/${String(nextNum).padStart(4, '0')}`;
}

// ── Categories ──────────────────────────────────────────────────────────
router.get('/categories', authMiddleware, requirePermission('assets.view', 'assets.manage'), async (_req: Request, res: Response) => {
  try {
    const rows = await dbAll('SELECT * FROM asset_categories WHERE is_active = 1 ORDER BY order_no, id', []);
    res.json({ data: rows });
  } catch (error: any) {
    serverError(res, 'asset', error);
  }
});

// ── Production lines ───────────────────────────────────────────────────
router.get('/production-lines', authMiddleware, requirePermission('assets.view', 'assets.manage'), async (_req: Request, res: Response) => {
  try {
    const rows = await dbAll('SELECT * FROM production_lines WHERE is_active = 1 ORDER BY name', []);
    res.json({ data: rows });
  } catch (error: any) {
    serverError(res, 'asset', error);
  }
});

router.get('/production-lines/:id', authMiddleware, requirePermission('assets.view', 'assets.manage'), async (req: Request, res: Response) => {
  try {
    const row = await dbGet('SELECT * FROM production_lines WHERE id = ?', [req.params.id]);
    if (!row) return res.status(404).json({ error: 'Production line not found' });
    res.json({ data: row });
  } catch (error: any) {
    serverError(res, 'asset', error);
  }
});

router.post('/production-lines', authMiddleware, requirePermission('assets.master.manage', 'assets.manage'), async (req: Request, res: Response) => {
  try {
    const { code, name, description } = req.body;
    if (!name) return res.status(400).json({ error: 'name is required' });
    const result = await dbRun(
      'INSERT INTO production_lines (code, name, description) VALUES (?, ?, ?)',
      [code || null, name, description || null]
    );
    res.status(201).json({ id: result.insertId });
  } catch (error: any) {
    serverError(res, 'asset', error);
  }
});

router.put('/production-lines/:id', authMiddleware, requirePermission('assets.master.manage', 'assets.manage'), async (req: Request, res: Response) => {
  try {
    const { code, name, description, is_active } = req.body;
    await dbRun(
      'UPDATE production_lines SET code = ?, name = ?, description = ?, is_active = ? WHERE id = ?',
      [code || null, name, description || null, is_active === undefined ? 1 : is_active, req.params.id]
    );
    res.json({ message: 'Updated' });
  } catch (error: any) {
    serverError(res, 'asset', error);
  }
});

// AST-013 — master dinonaktifkan, bukan dihapus permanen, dan hanya kalau
// sudah tidak dipakai. Menghapus line yang masih punya aset membuat aset
// tersebut kehilangan induknya, dan histori lama jadi tidak bisa dibaca.
router.delete('/production-lines/:id', authMiddleware, requirePermission('assets.master.manage', 'assets.manage'), async (req: Request, res: Response) => {
  try {
    const line: any = await dbGet('SELECT id, is_active FROM production_lines WHERE id = ?', [req.params.id]);
    if (!line) return res.status(404).json({ error: 'Production line tidak ditemukan' });

    const usage: any = await dbGet(
      `SELECT
        (SELECT COUNT(*) FROM assets WHERE production_line_id = ? AND is_deleted = 0) AS assets,
        (SELECT COUNT(*) FROM pnids WHERE production_line_id = ? AND is_active = 1) AS pnids`,
      [req.params.id, req.params.id]
    );
    const assetCount = Number(usage?.assets || 0);
    const pnidCount = Number(usage?.pnids || 0);

    if (assetCount > 0 || pnidCount > 0) {
      return res.status(409).json({
        error: 'Production line masih dipakai dan tidak bisa dinonaktifkan',
        assets: assetCount,
        pnids: pnidCount,
        hint: assetCount > 0
          ? `Pindahkan dulu ${assetCount} aset ke line lain`
          : `Nonaktifkan dulu ${pnidCount} P&ID di bawahnya`,
        code: 'MASTER_IN_USE',
      });
    }

    await dbRun('UPDATE production_lines SET is_active = 0 WHERE id = ?', [req.params.id]);
    res.json({ message: 'Production line dinonaktifkan' });
  } catch (error: any) {
    serverError(res, 'asset', error);
  }
});

// ── P&IDs (belong to a production line, group assets within the line) ────
router.get('/production-lines/:lineId/pnids', authMiddleware, requirePermission('assets.view', 'assets.manage'), async (req: Request, res: Response) => {
  try {
    const rows = await dbAll(
      `SELECT p.*, (SELECT COUNT(*) FROM assets a WHERE a.pnid_id = p.id AND a.is_deleted = 0) as asset_count
       FROM pnids p WHERE p.production_line_id = ? AND p.is_active = 1 ORDER BY p.code`,
      [req.params.lineId]
    );
    res.json({ data: rows });
  } catch (error: any) {
    serverError(res, 'asset', error);
  }
});

router.post('/production-lines/:lineId/pnids', authMiddleware, requirePermission('assets.master.manage', 'assets.manage'), async (req: Request, res: Response) => {
  try {
    const { code, title, description } = req.body;
    if (!code) return res.status(400).json({ error: 'code is required' });
    const result = await dbRun(
      'INSERT INTO pnids (production_line_id, code, title, description) VALUES (?, ?, ?, ?)',
      [req.params.lineId, code, title || null, description || null]
    );
    res.status(201).json({ id: result.insertId });
  } catch (error: any) {
    serverError(res, 'asset', error);
  }
});

router.get('/pnids/:id', authMiddleware, requirePermission('assets.view', 'assets.manage'), async (req: Request, res: Response) => {
  try {
    const row: any = await dbGet(
      `SELECT p.*, l.name as production_line_name, l.code as production_line_code
       FROM pnids p JOIN production_lines l ON p.production_line_id = l.id
       WHERE p.id = ?`,
      [req.params.id]
    );
    if (!row) return res.status(404).json({ error: 'P&ID not found' });
    res.json({ data: row });
  } catch (error: any) {
    serverError(res, 'asset', error);
  }
});

router.put('/pnids/:id', authMiddleware, requirePermission('assets.master.manage', 'assets.manage'), async (req: Request, res: Response) => {
  try {
    const { code, title, description, is_active } = req.body;
    await dbRun(
      'UPDATE pnids SET code = ?, title = ?, description = ?, is_active = ? WHERE id = ?',
      [code, title || null, description || null, is_active === undefined ? 1 : is_active, req.params.id]
    );
    res.json({ message: 'Updated' });
  } catch (error: any) {
    serverError(res, 'asset', error);
  }
});

// Dulu dua query terpisah tanpa transaction: kalau query kedua gagal, aset
// sudah terlanjur terlepas dari P&ID yang ternyata masih ada.
router.delete('/pnids/:id', authMiddleware, requirePermission('assets.master.manage', 'assets.manage'), async (req: Request, res: Response) => {
  try {
    const pnid: any = await dbGet('SELECT id FROM pnids WHERE id = ?', [req.params.id]);
    if (!pnid) return res.status(404).json({ error: 'P&ID tidak ditemukan' });

    const usage: any = await dbGet(
      'SELECT COUNT(*) AS c FROM assets WHERE pnid_id = ? AND is_deleted = 0', [req.params.id]
    );
    const assetCount = Number(usage?.c || 0);

    // Melepas aset dari P&ID adalah kehilangan informasi, jadi harus disengaja
    if (assetCount > 0 && req.query.detach_assets !== '1') {
      return res.status(409).json({
        error: `P&ID ini masih dipakai ${assetCount} aset`,
        assets: assetCount,
        hint: 'Pindahkan asetnya dulu, atau ulangi dengan ?detach_assets=1 untuk melepaskannya',
        code: 'MASTER_IN_USE',
      });
    }

    await withTransaction(async tx => {
      if (assetCount > 0) {
        await tx.run('UPDATE assets SET pnid_id = NULL WHERE pnid_id = ?', [req.params.id]);
      }
      await tx.run('UPDATE pnids SET is_active = 0 WHERE id = ?', [req.params.id]);
    });

    res.json({
      message: 'P&ID dinonaktifkan',
      detached_assets: assetCount,
    });
  } catch (error: any) {
    serverError(res, 'asset', error);
  }
});

// ── Assets ──────────────────────────────────────────────────────────────
router.get('/summary', authMiddleware, requirePermission('assets.view', 'assets.manage'), async (_req: Request, res: Response) => {
  try {
    const rows = await dbAll(
      `SELECT a.*, c.name as category_name, c.code as category_code, c.is_depreciable
       FROM assets a JOIN asset_categories c ON a.category_id = c.id
       WHERE a.status != 'disposed' AND a.is_deleted = 0`,
      []
    );
    const summaryAdditions = await capitalAdditionsByAsset(rows.map((r: any) => r.id));
    const withDep = rows.map((r: any) => withDepreciation(r, undefined, summaryAdditions[r.id] || []));

    const byCategory: Record<string, any> = {};
    for (const a of withDep) {
      const key = a.category_code;
      if (!byCategory[key]) {
        byCategory[key] = { category_code: key, category_name: a.category_name, count: 0, purchase_total: 0, book_value_total: 0, accumulated_depreciation_total: 0 };
      }
      byCategory[key].count += 1;
      byCategory[key].purchase_total += parseFloat(a.purchase_price) || 0;
      byCategory[key].book_value_total += a.book_value;
      byCategory[key].accumulated_depreciation_total += a.accumulated_depreciation;
    }

    const totals = withDep.reduce((acc, a) => {
      acc.count += 1;
      acc.purchase_total += parseFloat(a.purchase_price) || 0;
      acc.book_value_total += a.book_value;
      acc.accumulated_depreciation_total += a.accumulated_depreciation;
      return acc;
    }, { count: 0, purchase_total: 0, book_value_total: 0, accumulated_depreciation_total: 0 });

    res.json({ totals, by_category: Object.values(byCategory) });
  } catch (error: any) {
    serverError(res, 'asset', error);
  }
});

router.get('/', authMiddleware, requirePermission('assets.view', 'assets.manage'), async (req: Request, res: Response) => {
  try {
    const { category_id, category_code, production_line_id, pnid_id, status } = req.query;
    // Aset yang di-soft-delete disembunyikan, kecuali diminta eksplisit lewat
    // ?include_deleted=1 (untuk halaman pemulihan).
    const where: string[] = [
      req.query.include_deleted === '1' ? 'a.is_deleted = 1' : 'a.is_deleted = 0',
    ];
    const params: any[] = [];
    if (category_id) { where.push('a.category_id = ?'); params.push(category_id); }
    if (category_code) { where.push('c.code = ?'); params.push(category_code); }
    if (production_line_id) { where.push('a.production_line_id = ?'); params.push(production_line_id); }
    if (pnid_id) { where.push('a.pnid_id = ?'); params.push(pnid_id); }
    if (status) { where.push('a.status = ?'); params.push(status); }
    const whereSql = `WHERE ${where.join(' AND ')}`;

    const rows = await dbAll(
      `SELECT a.*, c.name as category_name, c.code as category_code, c.is_depreciable,
              p.name as production_line_name, q.code as pnid_code
       FROM assets a
       JOIN asset_categories c ON a.category_id = c.id
       LEFT JOIN production_lines p ON a.production_line_id = p.id
       LEFT JOIN pnids q ON a.pnid_id = q.id
       ${whereSql}
       ORDER BY a.id DESC`,
      params
    );
    const asOf = typeof req.query.as_of_date === 'string' ? req.query.as_of_date : undefined;
    const additions = await capitalAdditionsByAsset(rows.map((r: any) => r.id));
    const closed = await lastClosedPeriod();
    const locked = closed ? await lockedAccumulatedByAsset(rows.map((r: any) => r.id), closed.year, closed.month) : {};
    res.json({
      data: rows.map((r: any) => withDepreciation(r, asOf, additions[r.id] || [],
        closed && locked[r.id] !== undefined ? { through: closed.end, accumulated: locked[r.id] } : undefined)),
    });
  } catch (error: any) {
    serverError(res, 'asset', error);
  }
});

router.get('/:id', authMiddleware, requirePermission('assets.view', 'assets.manage'), async (req: Request, res: Response) => {
  try {
    const row: any = await dbGet(
      `SELECT a.*, c.name as category_name, c.code as category_code, c.is_depreciable,
              p.name as production_line_name, q.code as pnid_code, q.title as pnid_title
       FROM assets a
       JOIN asset_categories c ON a.category_id = c.id
       LEFT JOIN production_lines p ON a.production_line_id = p.id
       LEFT JOIN pnids q ON a.pnid_id = q.id
       WHERE a.id = ? AND a.is_deleted = 0`,
      [req.params.id]
    );
    if (!row) return res.status(404).json({ error: 'Asset not found' });
    const asOf = typeof req.query.as_of_date === 'string' ? req.query.as_of_date : undefined;
    const additions = (await capitalAdditionsByAsset([row.id]))[row.id] || [];
    const closed = await lastClosedPeriod();
    const locked = closed ? (await lockedAccumulatedByAsset([row.id], closed.year, closed.month))[row.id] : undefined;
    res.json({
      data: withDepreciation(row, asOf, additions,
        closed && locked !== undefined ? { through: closed.end, accumulated: locked } : undefined),
    });
  } catch (error: any) {
    serverError(res, 'asset', error);
  }
});

router.post('/', authMiddleware, requirePermission('assets.create', 'assets.manage'), async (req: Request, res: Response) => {
  try {
    const {
      category_id, production_line_id, pnid_id, pnid_tag, name, location, spec,
      purchase_date, purchase_price, vendor, useful_life_years, salvage_value,
      depreciation_method, depreciation_rate, in_service_date, status, notes,
    } = req.body;

    if (!category_id || !name) {
      return res.status(400).json({ error: 'category_id and name are required' });
    }

    const invalid = validateAssetInput(req.body);
    if (invalid) return res.status(400).json({ error: invalid });

    // Foreign key dicek di sini supaya balasannya 404 dengan pesan yang bisa
    // dibaca, bukan 500 berisi nama constraint database (AST-014).
    const category = await dbGet('SELECT id FROM asset_categories WHERE id = ?', [category_id]);
    if (!category) return res.status(404).json({ error: 'Kategori aset tidak ditemukan' });

    // If a P&ID is given, derive the production_line_id from it (P&ID is the source of truth)
    let lineId = production_line_id || null;
    if (pnid_id) {
      const pnid: any = await dbGet('SELECT production_line_id FROM pnids WHERE id = ?', [pnid_id]);
      if (!pnid) return res.status(404).json({ error: 'P&ID tidak ditemukan' });
      // P&ID adalah sumber kebenaran; kalau klien mengirim line yang berbeda,
      // itu tanda data tidak konsisten — tolak, jangan diam-diam ditimpa.
      if (lineId && Number(lineId) !== Number(pnid.production_line_id)) {
        return res.status(409).json({ error: 'P&ID tersebut bukan milik production line yang dipilih' });
      }
      lineId = pnid.production_line_id;
    } else if (lineId) {
      const line = await dbGet('SELECT id FROM production_lines WHERE id = ?', [lineId]);
      if (!line) return res.status(404).json({ error: 'Production line tidak ditemukan' });
    }

    // AST-009: MAX(...)+1 saja tidak aman — dua request bersamaan bisa membaca
    // angka yang sama sebelum salah satunya sempat INSERT. Penjaga sebenarnya
    // adalah UNIQUE INDEX pada assets.asset_code; di sini kegagalannya ditangkap
    // lalu nomor dihitung ulang, bukan dibalas 500 mentah.
    const MAX_CODE_ATTEMPTS = 8;
    for (let attempt = 1; attempt <= MAX_CODE_ATTEMPTS; attempt++) {
      const assetCode = await nextAssetCode();
      try {
        const result = await dbRun(
          `INSERT INTO assets
            (asset_code, category_id, production_line_id, pnid_id, pnid_tag, name, location, spec,
             purchase_date, purchase_price, vendor, useful_life_years, salvage_value,
             depreciation_method, depreciation_rate, in_service_date, status, notes, created_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            assetCode, category_id, lineId, pnid_id || null, pnid_tag || null, name, location || null,
            JSON.stringify(spec || {}), purchase_date || null, purchase_price || 0, vendor || null,
            useful_life_years || 1, salvage_value || 0, depreciation_method || 'straight_line',
            depreciation_rate || null, in_service_date || null,
            status || 'active', notes || null, (req as any).user?.userId || null,
          ]
        );
        return res.status(201).json({ id: result.insertId, asset_code: assetCode });
      } catch (err: any) {
        const duplicateCode = err?.code === 'ER_DUP_ENTRY' && String(err.message).includes('asset_code');
        if (!duplicateCode || attempt === MAX_CODE_ATTEMPTS) throw err;
        // Beri jeda acak singkat supaya request yang bertabrakan tidak
        // mencoba ulang pada saat yang sama persis.
        await new Promise(r => setTimeout(r, 10 + Math.random() * 40));
      }
    }
  } catch (error: any) {
    serverError(res, 'asset', error);
  }
});

// PATCH adalah bentuk yang benar karena update-nya parsial; PUT tetap
// didaftarkan ke handler yang sama supaya frontend lama tidak putus.
const updateAsset = async (req: Request, res: Response) => {
  try {
    const {
      category_id, production_line_id, pnid_id, pnid_tag, name, location, spec,
      purchase_date, purchase_price, vendor, useful_life_years, salvage_value,
      depreciation_method, depreciation_rate, in_service_date, status, disposed_date, notes,
    } = req.body;

    const has = (k: string) => Object.prototype.hasOwnProperty.call(req.body, k);

    const current: any = await dbGet('SELECT * FROM assets WHERE id = ? AND is_deleted = 0', [req.params.id]);
    if (!current) return res.status(404).json({ error: 'Aset tidak ditemukan' });

    const invalid = validateAssetInput(req.body, current);
    if (invalid) return res.status(400).json({ error: invalid });

    if (has('category_id') && category_id) {
      const category = await dbGet('SELECT id FROM asset_categories WHERE id = ?', [category_id]);
      if (!category) return res.status(404).json({ error: 'Kategori aset tidak ditemukan' });
    }

    // AST-006 — disposal tidak lagi boleh dilakukan dengan sekadar mengubah
    // status. Tanpa alur permintaan + persetujuan, tidak ada alasan, nilai
    // jual, perhitungan gain/loss, maupun jejak siapa yang menyetujui.
    if (has('status') && status !== current.status) {
      if (status === 'disposed') {
        return res.status(409).json({
          error: 'Disposal harus lewat alur permintaan dan persetujuan, bukan mengubah status langsung',
          hint: `Ajukan lewat POST /api/assets/${req.params.id}/disposal-request`,
          code: 'DISPOSAL_WORKFLOW_REQUIRED',
        });
      }
      if (current.status === 'disposed') {
        return res.status(409).json({
          error: 'Aset yang sudah disposed hanya bisa diaktifkan kembali lewat pembatalan resmi',
          hint: 'Gunakan POST /api/assets/disposals/:id/reverse dengan menyertakan alasan',
          code: 'REVERSAL_REQUIRED',
        });
      }
      if (status === 'disposal_requested' || current.status === 'disposal_requested') {
        return res.status(409).json({
          error: 'Status permintaan disposal hanya berubah lewat alur disposal',
          code: 'DISPOSAL_WORKFLOW_REQUIRED',
        });
      }
    }

    // PARTIAL UPDATE (AST-002). Dulu handler ini melakukan replace penuh dengan
    // fallback `|| default`, sehingga field yang tidak dikirim klien ikut
    // tertimpa: pnid_id jadi NULL, spec jadi {}, purchase_price jadi 0,
    // useful_life_years jadi 1, dan status jadi 'active'. AssetDetail.vue
    // memang tidak mengirim pnid_id maupun spec, jadi sekadar mengubah nama
    // aset sudah cukup untuk melepasnya dari P&ID dan menghapus spesifikasinya.
    // Sekarang hanya field yang benar-benar ada di body yang disentuh —
    // `null` eksplisit tetap dihormati sebagai "kosongkan".
    const fields: string[] = [];
    const values: any[] = [];
    const set = (col: string, val: any) => { fields.push(`${col} = ?`); values.push(val); };

    if (has('category_id')) set('category_id', category_id ?? null);
    if (has('pnid_tag')) set('pnid_tag', pnid_tag ?? null);
    if (has('name')) set('name', name);
    if (has('location')) set('location', location ?? null);
    if (has('spec')) set('spec', spec === null ? null : JSON.stringify(spec));
    if (has('purchase_date')) set('purchase_date', purchase_date || null);
    if (has('purchase_price')) set('purchase_price', purchase_price ?? 0);
    if (has('vendor')) set('vendor', vendor ?? null);
    if (has('useful_life_years')) set('useful_life_years', useful_life_years ?? 1);
    if (has('salvage_value')) set('salvage_value', salvage_value ?? 0);
    if (has('depreciation_method')) set('depreciation_method', depreciation_method || 'straight_line');
    if (has('depreciation_rate')) set('depreciation_rate', depreciation_rate ?? null);
    if (has('in_service_date')) set('in_service_date', in_service_date || null);
    if (has('status')) set('status', status || 'active');
    if (has('disposed_date')) set('disposed_date', disposed_date || null);
    if (has('notes')) set('notes', notes ?? null);

    // production_line_id ikut pnid_id kalau P&ID diubah, karena satu P&ID
    // selalu milik satu line.
    if (has('pnid_id')) {
      set('pnid_id', pnid_id ?? null);
      if (pnid_id) {
        const pnid: any = await dbGet('SELECT production_line_id FROM pnids WHERE id = ?', [pnid_id]);
        if (pnid) set('production_line_id', pnid.production_line_id);
      } else if (!has('production_line_id')) {
        set('production_line_id', null);
      }
    }
    if (has('production_line_id') && !fields.some(f => f.startsWith('production_line_id'))) {
      set('production_line_id', production_line_id ?? null);
    }

    if (!fields.length) return res.json({ message: 'Tidak ada perubahan' });

    values.push(req.params.id);
    await dbRun(`UPDATE assets SET ${fields.join(', ')} WHERE id = ?`, values);
    res.json({ message: 'Updated' });
  } catch (error: any) {
    serverError(res, 'asset', error);
  }
};

const assetEditGuard = [authMiddleware, requirePermission('assets.edit', 'assets.manage')];
router.patch('/:id', ...assetEditGuard, updateAsset);
router.put('/:id', ...assetEditGuard, updateAsset);

// AST-005 — penghapusan aset kini LOGICAL, bukan permanen.
// `DELETE FROM assets` ikut menghapus 5 tabel anak lewat ON DELETE CASCADE:
// dokumen, maintenance, riwayat pembelian, ledger depresiasi, dan riwayat
// disposal. Seluruh jejak finansial aset hilang dalam satu klik.
router.delete('/:id', authMiddleware, requirePermission('assets.delete', 'assets.manage'), async (req: Request, res: Response) => {
  try {
    const asset: any = await dbGet('SELECT id, status, is_deleted FROM assets WHERE id = ?', [req.params.id]);
    if (!asset) return res.status(404).json({ error: 'Aset tidak ditemukan' });
    if (asset.is_deleted) return res.status(409).json({ error: 'Aset sudah dihapus' });

    // Aset yang punya jejak finansial harus lewat disposal, bukan dihapus —
    // menghapusnya membuat laporan periode sebelumnya tidak bisa direproduksi.
    const history: any = await dbGet(
      `SELECT
        (SELECT COUNT(*) FROM asset_depreciation_ledger WHERE asset_id = ?) AS ledger,
        (SELECT COUNT(*) FROM asset_disposals WHERE asset_id = ? AND status = 'approved') AS disposals`,
      [req.params.id, req.params.id]
    );
    if (Number(history?.ledger || 0) > 0) {
      return res.status(409).json({
        error: 'Aset ini sudah masuk ledger depresiasi periode tertutup dan tidak boleh dihapus',
        hint: 'Gunakan alur disposal bila aset sudah tidak dipakai',
        code: 'HAS_POSTED_LEDGER',
      });
    }

    await dbRun(
      `UPDATE assets SET is_deleted = 1, deleted_at = NOW(), deleted_by = ?, deletion_reason = ?
       WHERE id = ?`,
      [(req as any).user?.userId || null, req.body?.reason || null, req.params.id]
    );
    res.json({ message: 'Aset dihapus (logical). Dokumen, maintenance, dan riwayat finansialnya tetap tersimpan.' });
  } catch (error: any) {
    serverError(res, 'asset', error);
  }
});

// POST /assets/:id/restore — pulihkan aset yang dihapus
router.post('/:id/restore', authMiddleware, requirePermission('assets.delete', 'assets.manage'), async (req: Request, res: Response) => {
  try {
    const asset: any = await dbGet('SELECT id, is_deleted FROM assets WHERE id = ?', [req.params.id]);
    if (!asset) return res.status(404).json({ error: 'Aset tidak ditemukan' });
    if (!asset.is_deleted) return res.status(409).json({ error: 'Aset tidak dalam keadaan terhapus' });

    await dbRun(
      `UPDATE assets SET is_deleted = 0, deleted_at = NULL, deleted_by = NULL, deletion_reason = NULL
       WHERE id = ?`,
      [req.params.id]
    );
    res.json({ message: 'Aset dipulihkan' });
  } catch (error: any) {
    serverError(res, 'asset', error);
  }
});

// ── Documents ───────────────────────────────────────────────────────────
const uploadDir = path.join(__dirname, '../../uploads/asset_documents');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}
// Berkas ditahan di memori dulu supaya magic bytes-nya bisa diperiksa SEBELUM
// menyentuh disk (AST-008). Dengan diskStorage, berkas berbahaya sudah terlanjur
// tertulis — dan kalau insert DB gagal, tertinggal sebagai orphan.
const MAX_UPLOAD_BYTES = 20 * 1024 * 1024; // 20 MB
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 },
});

// Multer melempar error sendiri (mis. LIMIT_FILE_SIZE); tanpa handler ini
// error-nya jatuh ke error handler global dan dibalas 500.
const handleUploadErrors = (err: any, _req: Request, res: Response, next: any) => {
  if (err instanceof multer.MulterError) {
    const tooBig = err.code === 'LIMIT_FILE_SIZE';
    return res.status(tooBig ? 413 : 400).json({
      error: tooBig
        ? `Ukuran berkas melebihi batas ${MAX_UPLOAD_BYTES / 1024 / 1024} MB`
        : `Upload ditolak: ${err.message}`,
    });
  }
  next(err);
};

router.get('/:id/documents', authMiddleware, requirePermission('assets.view', 'assets.manage'), async (req: Request, res: Response) => {
  try {
    const rows = await dbAll(
      `SELECT d.*, u.full_name as uploader_name FROM asset_documents d
       LEFT JOIN users u ON d.uploaded_by = u.id
       WHERE d.asset_id = ? ORDER BY d.uploaded_at DESC`,
      [req.params.id]
    );
    res.json({ data: rows });
  } catch (error: any) {
    serverError(res, 'asset', error);
  }
});

router.post('/:id/documents', authMiddleware, requirePermission('assets.documents.manage', 'assets.manage'),
  upload.single('file'), handleUploadErrors, async (req: Request, res: Response) => {
  let storedName: string | null = null;
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const { originalname, mimetype, buffer, size } = req.file;

    // Aset harus ada dulu — mencegah dokumen yatim untuk asset_id ngawur
    const asset = await dbGet('SELECT id FROM assets WHERE id = ? AND is_deleted = 0', [req.params.id]);
    if (!asset) return res.status(404).json({ error: 'Aset tidak ditemukan' });

    const check = validateUpload(originalname, mimetype, buffer);
    if (!check.ok) return res.status(400).json({ error: check.error });

    // Nama di server acak; nama asli hanya disimpan sebagai metadata untuk
    // ditampilkan dan dipakai saat mengunduh.
    storedName = storeValidatedFile(uploadDir, check.ext!, buffer);

    const fileTypeMap: Record<string, string> = {
      pdf: 'pdf', jpg: 'image', png: 'image', docx: 'word', xlsx: 'excel',
    };

    const result = await dbRun(
      `INSERT INTO asset_documents (asset_id, doc_title, doc_category, file_name, file_path, file_type, file_size, uploaded_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [req.params.id, req.body.doc_title || originalname, req.body.doc_category || 'Lainnya',
        originalname, storedName, fileTypeMap[check.type!] || 'other', size, (req as any).user?.userId || null]
    );
    res.status(201).json({ id: result.insertId });
  } catch (error: any) {
    // Bersihkan berkas kalau insert gagal, supaya tidak ada orphan di disk
    if (storedName) removeStoredFile(uploadDir, storedName);
    serverError(res, 'asset', error);
  }
});

router.get('/documents/:docId/preview', authMiddleware, requirePermission('assets.view', 'assets.manage'), async (req: Request, res: Response) => {
  try {
    const file: any = await dbGet('SELECT * FROM asset_documents WHERE id = ?', [req.params.docId]);
    if (!file) return res.status(404).json({ error: 'File not found' });
    const filePath = path.join(uploadDir, file.file_path);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not on disk' });
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(file.file_name)}"`);
    res.sendFile(filePath);
  } catch (error: any) {
    serverError(res, 'asset', error);
  }
});

router.get('/documents/:docId/download', authMiddleware, requirePermission('assets.view', 'assets.manage'), async (req: Request, res: Response) => {
  try {
    const file: any = await dbGet('SELECT * FROM asset_documents WHERE id = ?', [req.params.docId]);
    if (!file) return res.status(404).json({ error: 'File not found' });
    const filePath = path.join(uploadDir, file.file_path);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not on disk' });
    res.download(filePath, file.file_name);
  } catch (error: any) {
    serverError(res, 'asset', error);
  }
});

router.delete('/documents/:docId', authMiddleware, requirePermission('assets.documents.manage', 'assets.manage'), async (req: Request, res: Response) => {
  try {
    const file: any = await dbGet('SELECT * FROM asset_documents WHERE id = ?', [req.params.docId]);
    if (!file) return res.status(404).json({ error: 'File not found' });
    await dbRun('DELETE FROM asset_documents WHERE id = ?', [req.params.docId]);
    const filePath = path.join(uploadDir, file.file_path);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    res.json({ message: 'Deleted' });
  } catch (error: any) {
    serverError(res, 'asset', error);
  }
});

// ── Maintenance history ─────────────────────────────────────────────────
router.get('/:id/maintenance', authMiddleware, requirePermission('assets.maintenance.view', 'assets.maintenance.manage', 'assets.manage'), async (req: Request, res: Response) => {
  try {
    const rows = await dbAll(
      'SELECT * FROM asset_maintenance_logs WHERE asset_id = ? ORDER BY performed_at DESC',
      [req.params.id]
    );
    res.json({ data: rows });
  } catch (error: any) {
    serverError(res, 'asset', error);
  }
});

router.post('/:id/maintenance', authMiddleware, requirePermission('assets.maintenance.manage', 'assets.manage'), async (req: Request, res: Response) => {
  try {
    // Child record untuk aset yang tidak ada harus 404, bukan 500 dari FK
    const asset = await dbGet('SELECT id FROM assets WHERE id = ? AND is_deleted = 0', [req.params.id]);
    if (!asset) return res.status(404).json({ error: 'Aset tidak ditemukan' });

    const invalidMaintenance = validateMaintenanceInput(req.body);
    if (invalidMaintenance) return res.status(400).json({ error: invalidMaintenance });

    const { maintenance_type, description, cost, performed_by, vendor, performed_at, next_due_date } = req.body;
    if (!performed_at) return res.status(400).json({ error: 'performed_at is required' });
    const result = await dbRun(
      `INSERT INTO asset_maintenance_logs
        (asset_id, maintenance_type, description, cost, performed_by, vendor, performed_at, next_due_date, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [req.params.id, maintenance_type || 'corrective', description || null, cost || 0,
        performed_by || null, vendor || null, performed_at, next_due_date || null, (req as any).user?.userId || null]
    );
    res.status(201).json({ id: result.insertId });
  } catch (error: any) {
    serverError(res, 'asset', error);
  }
});

router.put('/maintenance/:logId', authMiddleware, requirePermission('assets.maintenance.manage', 'assets.manage'), async (req: Request, res: Response) => {
  try {
    const invalidMaintenance = validateMaintenanceInput(req.body);
    if (invalidMaintenance) return res.status(400).json({ error: invalidMaintenance });

    const { maintenance_type, description, cost, performed_by, vendor, performed_at, next_due_date } = req.body;
    await dbRun(
      `UPDATE asset_maintenance_logs SET maintenance_type = ?, description = ?, cost = ?,
        performed_by = ?, vendor = ?, performed_at = ?, next_due_date = ? WHERE id = ?`,
      [maintenance_type || 'corrective', description || null, cost || 0, performed_by || null,
        vendor || null, performed_at, next_due_date || null, req.params.logId]
    );
    res.json({ message: 'Updated' });
  } catch (error: any) {
    serverError(res, 'asset', error);
  }
});

router.delete('/maintenance/:logId', authMiddleware, requirePermission('assets.maintenance.manage', 'assets.manage'), async (req: Request, res: Response) => {
  try {
    await dbRun('DELETE FROM asset_maintenance_logs WHERE id = ?', [req.params.logId]);
    res.json({ message: 'Deleted' });
  } catch (error: any) {
    serverError(res, 'asset', error);
  }
});

// ── Purchase history ────────────────────────────────────────────────────
router.get('/:id/purchase-history', authMiddleware, requirePermission('assets.financial.view', 'assets.financial.manage', 'assets.manage'), async (req: Request, res: Response) => {
  try {
    const rows = await dbAll(
      'SELECT * FROM asset_purchase_history WHERE asset_id = ? ORDER BY purchase_date DESC',
      [req.params.id]
    );
    res.json({ data: rows });
  } catch (error: any) {
    serverError(res, 'asset', error);
  }
});

router.post('/:id/purchase-history', authMiddleware, requirePermission('assets.financial.manage', 'assets.manage'), async (req: Request, res: Response) => {
  try {
    const asset = await dbGet('SELECT id FROM assets WHERE id = ? AND is_deleted = 0', [req.params.id]);
    if (!asset) return res.status(404).json({ error: 'Aset tidak ditemukan' });

    const invalidEntry = validatePurchaseHistoryInput(req.body);
    if (invalidEntry) return res.status(400).json({ error: invalidEntry });

    const { description, amount, purchase_date, vendor, notes, purchase_order_item_id,
            entry_type, capitalized_at } = req.body;
    if (!purchase_date) return res.status(400).json({ error: 'purchase_date is required' });

    // Default 'expense': hanya entri yang SENGAJA ditandai capital_addition
    // yang menambah basis depresiasi (AST-004).
    const type = entry_type || 'expense';
    const capitalisedOn = type === 'capital_addition' ? (capitalized_at || purchase_date) : null;

    const result = await dbRun(
      `INSERT INTO asset_purchase_history
        (asset_id, purchase_order_item_id, description, amount, purchase_date, vendor, notes,
         entry_type, capitalized_at, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [req.params.id, purchase_order_item_id || null, description || null, amount || 0,
        purchase_date, vendor || null, notes || null, type, capitalisedOn,
        (req as any).user?.userId || null]
    );
    res.status(201).json({ id: result.insertId });
  } catch (error: any) {
    serverError(res, 'asset', error);
  }
});

router.put('/purchase-history/:entryId', authMiddleware, requirePermission('assets.financial.manage', 'assets.manage'), async (req: Request, res: Response) => {
  try {
    const invalidEntry = validatePurchaseHistoryInput(req.body);
    if (invalidEntry) return res.status(400).json({ error: invalidEntry });

    const { description, amount, purchase_date, vendor, notes } = req.body;
    await dbRun(
      `UPDATE asset_purchase_history SET description = ?, amount = ?, purchase_date = ?, vendor = ?, notes = ? WHERE id = ?`,
      [description || null, amount || 0, purchase_date, vendor || null, notes || null, req.params.entryId]
    );
    res.json({ message: 'Updated' });
  } catch (error: any) {
    serverError(res, 'asset', error);
  }
});

router.delete('/purchase-history/:entryId', authMiddleware, requirePermission('assets.financial.manage', 'assets.manage'), async (req: Request, res: Response) => {
  try {
    await dbRun('DELETE FROM asset_purchase_history WHERE id = ?', [req.params.entryId]);
    res.json({ message: 'Deleted' });
  } catch (error: any) {
    serverError(res, 'asset', error);
  }
});



// ── Disposal workflow (AST-006) ─────────────────────────────────────────
// Alur: active → disposal_requested → approved (disposed) / rejected.
// Aset yang sudah disposed hanya bisa kembali aktif lewat reversal resmi.

const DISPOSAL_METHODS_LIST = ['sold', 'scrapped', 'donated', 'traded_in', 'lost', 'other'];

// Nilai buku pada tanggal disposal — dasar perhitungan gain/loss.
async function bookValueAt(assetId: number, date: string): Promise<number> {
  const row: any = await dbGet(
    `SELECT a.*, c.is_depreciable FROM assets a
     JOIN asset_categories c ON a.category_id = c.id WHERE a.id = ? AND a.is_deleted = 0`,
    [assetId]
  );
  if (!row) return 0;
  const additions = (await capitalAdditionsByAsset([assetId]))[assetId] || [];
  const closed = await lastClosedPeriod();
  const locked = closed ? (await lockedAccumulatedByAsset([assetId], closed.year, closed.month))[assetId] : undefined;
  // Aset dihitung seolah belum disposed, supaya nilai bukunya pada tanggal
  // tersebut tidak terpotong oleh status yang belum sempat berubah.
  const result = calcDepreciation({ ...row, status: 'active', disposed_date: null }, date, additions,
    closed && locked !== undefined ? { through: closed.end, accumulated: locked } : undefined);
  return result.book_value;
}

router.get('/:id/disposals', authMiddleware, requirePermission('assets.view', 'assets.manage'),
  async (req: Request, res: Response) => {
  try {
    const rows = await dbAll(
      `SELECT d.*, ru.full_name AS requested_by_name, au.full_name AS approved_by_name
       FROM asset_disposals d
       LEFT JOIN users ru ON d.requested_by = ru.id
       LEFT JOIN users au ON d.approved_by = au.id
       WHERE d.asset_id = ? ORDER BY d.id DESC`,
      [req.params.id]
    );
    res.json({ data: rows });
  } catch (error: any) {
    serverError(res, 'disposals', error);
  }
});

// POST /assets/:id/disposal-request
router.post('/:id/disposal-request', authMiddleware, requirePermission('assets.dispose', 'assets.manage'),
  async (req: Request, res: Response) => {
  try {
    const asset: any = await dbGet('SELECT id, status FROM assets WHERE id = ? AND is_deleted = 0', [req.params.id]);
    if (!asset) return res.status(404).json({ error: 'Aset tidak ditemukan' });
    if (asset.status === 'disposed') return res.status(409).json({ error: 'Aset sudah disposed' });
    if (asset.status === 'disposal_requested') {
      return res.status(409).json({ error: 'Sudah ada permintaan disposal yang menunggu persetujuan' });
    }

    const { reason, disposal_method, buyer, planned_date, proceeds, document_id } = req.body;
    if (!reason) return res.status(400).json({ error: 'Alasan disposal wajib diisi' });
    if (disposal_method && !DISPOSAL_METHODS_LIST.includes(disposal_method)) {
      return res.status(400).json({ error: `Metode disposal tidak dikenal. Pilihan: ${DISPOSAL_METHODS_LIST.join(', ')}` });
    }
    const invalid = validateAssetInput({ purchase_price: proceeds, purchase_date: planned_date });
    if (proceeds !== undefined && Number(proceeds) < 0) {
      return res.status(400).json({ error: 'Nilai jual tidak boleh negatif' });
    }
    if (invalid && planned_date) return res.status(400).json({ error: invalid });

    const userId = (req as any).user?.userId || null;
    const result = await withTransaction(async tx => {
      const r = await tx.run(
        `INSERT INTO asset_disposals
          (asset_id, status, reason, disposal_method, buyer, planned_date, proceeds, document_id,
           previous_status, requested_by)
         VALUES (?, 'requested', ?, ?, ?, ?, ?, ?, ?, ?)`,
        [asset.id, reason, disposal_method || null, buyer || null, planned_date || null,
          proceeds || 0, document_id || null, asset.status, userId]
      );
      await tx.run('UPDATE assets SET status = ? WHERE id = ?', ['disposal_requested', asset.id]);
      return r;
    });

    res.status(201).json({ id: result.insertId, message: 'Permintaan disposal diajukan' });
  } catch (error: any) {
    serverError(res, 'disposal-request', error);
  }
});

// POST /assets/disposals/:disposalId/approve
router.post('/disposals/:disposalId/approve', authMiddleware, requirePermission('assets.dispose.approve', 'assets.manage'),
  async (req: Request, res: Response) => {
  try {
    const disposal: any = await dbGet('SELECT * FROM asset_disposals WHERE id = ?', [req.params.disposalId]);
    if (!disposal) return res.status(404).json({ error: 'Permintaan disposal tidak ditemukan' });
    if (disposal.status !== 'requested') {
      return res.status(409).json({ error: `Permintaan ini sudah ${disposal.status}` });
    }

    const disposalDate = req.body.disposal_date || disposal.planned_date
      || new Date().toISOString().slice(0, 10);
    const dateError = validateAssetInput({ purchase_date: disposalDate });
    if (dateError) return res.status(400).json({ error: dateError });

    const proceeds = req.body.proceeds !== undefined ? Number(req.body.proceeds) : Number(disposal.proceeds || 0);
    if (!Number.isFinite(proceeds) || proceeds < 0) {
      return res.status(400).json({ error: 'Nilai jual tidak boleh negatif' });
    }

    // Gain/loss = hasil penjualan − nilai buku pada tanggal disposal
    const bookValue = await bookValueAt(disposal.asset_id, disposalDate);
    const gainLoss = Math.round((proceeds - bookValue) * 100) / 100;
    const userId = (req as any).user?.userId || null;

    await withTransaction(async tx => {
      await tx.run(
        `UPDATE asset_disposals SET status='approved', disposal_date=?, proceeds=?,
           book_value_at_disposal=?, gain_loss=?, approved_by=?, approved_at=NOW()
         WHERE id = ?`,
        [disposalDate, proceeds, bookValue, gainLoss, userId, disposal.id]
      );
      await tx.run(
        `UPDATE assets SET status='disposed', disposed_date=? WHERE id = ?`,
        [disposalDate, disposal.asset_id]
      );
    });

    res.json({
      message: 'Disposal disetujui',
      disposal_date: disposalDate,
      proceeds,
      book_value_at_disposal: bookValue,
      gain_loss: gainLoss,
      result: gainLoss >= 0 ? 'gain' : 'loss',
    });
  } catch (error: any) {
    serverError(res, 'disposal-approve', error);
  }
});

// POST /assets/disposals/:disposalId/reject
router.post('/disposals/:disposalId/reject', authMiddleware, requirePermission('assets.dispose.approve', 'assets.manage'),
  async (req: Request, res: Response) => {
  try {
    const disposal: any = await dbGet('SELECT * FROM asset_disposals WHERE id = ?', [req.params.disposalId]);
    if (!disposal) return res.status(404).json({ error: 'Permintaan disposal tidak ditemukan' });
    if (disposal.status !== 'requested') {
      return res.status(409).json({ error: `Permintaan ini sudah ${disposal.status}` });
    }
    if (!req.body.reason) return res.status(400).json({ error: 'Alasan penolakan wajib diisi' });

    const userId = (req as any).user?.userId || null;
    await withTransaction(async tx => {
      await tx.run(
        `UPDATE asset_disposals SET status='rejected', rejected_by=?, rejected_at=NOW(), rejection_reason=?
         WHERE id = ?`,
        [userId, req.body.reason, disposal.id]
      );
      // Kembalikan aset ke status sebelum permintaan diajukan
      await tx.run('UPDATE assets SET status = ? WHERE id = ?',
        [disposal.previous_status || 'active', disposal.asset_id]);
    });

    res.json({ message: 'Permintaan disposal ditolak' });
  } catch (error: any) {
    serverError(res, 'disposal-reject', error);
  }
});

// POST /assets/disposals/:disposalId/reverse — pembatalan resmi disposal
router.post('/disposals/:disposalId/reverse', authMiddleware, requirePermission('assets.dispose.approve', 'assets.manage'),
  async (req: Request, res: Response) => {
  try {
    const disposal: any = await dbGet('SELECT * FROM asset_disposals WHERE id = ?', [req.params.disposalId]);
    if (!disposal) return res.status(404).json({ error: 'Permintaan disposal tidak ditemukan' });
    if (disposal.status !== 'approved') {
      return res.status(409).json({ error: 'Hanya disposal yang sudah disetujui yang bisa dibatalkan' });
    }
    if (!req.body.reason) return res.status(400).json({ error: 'Alasan pembatalan wajib diisi' });

    const userId = (req as any).user?.userId || null;
    await withTransaction(async tx => {
      await tx.run(
        `UPDATE asset_disposals SET status='reversed', reversed_by=?, reversed_at=NOW(), reversal_reason=?
         WHERE id = ?`,
        [userId, req.body.reason, disposal.id]
      );
      await tx.run(`UPDATE assets SET status='active', disposed_date=NULL WHERE id = ?`, [disposal.asset_id]);
    });

    res.json({ message: 'Disposal dibatalkan, aset kembali aktif' });
  } catch (error: any) {
    serverError(res, 'disposal-reverse', error);
  }
});

// ── Depreciation ledger & period lock (AST-011) ─────────────────────────
// Selama belum ada periode yang ditutup, seluruh endpoint di bawah tidak
// mempengaruhi angka mana pun — perhitungan berjalan dinamis seperti semula.

const lastDayOfMonth = (year: number, month: number) =>
  `${year}-${String(month).padStart(2, '0')}-${String(new Date(year, month, 0).getDate()).padStart(2, '0')}`;

router.get('/depreciation/periods', authMiddleware, requirePermission('assets.financial.view', 'assets.financial.manage', 'assets.manage'),
  async (_req: Request, res: Response) => {
  try {
    const rows = await dbAll(
      `SELECT p.*, u.full_name AS closed_by_name,
              (SELECT COUNT(*) FROM asset_depreciation_ledger l
               WHERE l.period_year = p.period_year AND l.period_month = p.period_month) AS entry_count
       FROM asset_depreciation_periods p
       LEFT JOIN users u ON p.closed_by = u.id
       ORDER BY p.period_year DESC, p.period_month DESC`
    );
    res.json({ data: rows });
  } catch (error: any) {
    serverError(res, 'periods', error);
  }
});

router.get('/:id/depreciation-ledger', authMiddleware, requirePermission('assets.financial.view', 'assets.financial.manage', 'assets.manage'),
  async (req: Request, res: Response) => {
  try {
    const rows = await dbAll(
      `SELECT * FROM asset_depreciation_ledger WHERE asset_id = ?
       ORDER BY period_year DESC, period_month DESC`,
      [req.params.id]
    );
    res.json({ data: rows });
  } catch (error: any) {
    serverError(res, 'ledger', error);
  }
});

// POST /assets/depreciation/periods/close — hitung & posting satu bulan, lalu kunci
router.post('/depreciation/periods/close', authMiddleware, requirePermission('assets.period.manage', 'assets.manage'),
  async (req: Request, res: Response) => {
  try {
    const year = Number(req.body.period_year);
    const month = Number(req.body.period_month);
    if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
      return res.status(400).json({ error: 'period_year dan period_month (1-12) wajib diisi' });
    }

    const periodEnd = lastDayOfMonth(year, month);
    if (new Date(periodEnd) > new Date()) {
      return res.status(400).json({ error: 'Periode yang belum berakhir tidak bisa ditutup' });
    }

    const existing: any = await dbGet(
      'SELECT id, status FROM asset_depreciation_periods WHERE period_year = ? AND period_month = ?',
      [year, month]
    );
    if (existing?.status === 'closed') {
      return res.status(409).json({ error: `Periode ${month}/${year} sudah ditutup` });
    }

    // Periode harus ditutup berurutan — kalau bulan sebelumnya masih terbuka,
    // akumulasi yang diposting akan salah.
    const prevYear = month === 1 ? year - 1 : year;
    const prevMonth = month === 1 ? 12 : month - 1;
    const anyClosed: any = await dbGet('SELECT COUNT(*) AS c FROM asset_depreciation_periods WHERE status = ?', ['closed']);
    if (Number(anyClosed?.c || 0) > 0) {
      const prev: any = await dbGet(
        'SELECT status FROM asset_depreciation_periods WHERE period_year = ? AND period_month = ?',
        [prevYear, prevMonth]
      );
      if (prev?.status !== 'closed') {
        return res.status(409).json({ error: `Tutup periode ${prevMonth}/${prevYear} lebih dulu — periode harus berurutan` });
      }
    }

    const assets = await dbAll(
      `SELECT a.*, c.is_depreciable FROM assets a JOIN asset_categories c ON a.category_id = c.id
       WHERE a.is_deleted = 0`
    ) as any[];
    const additions = await capitalAdditionsByAsset(assets.map(a => a.id));
    const userId = (req as any).user?.userId || null;

    const posted = await withTransaction(async tx => {
      const rows: any[] = [];
      for (const asset of assets) {
        // Akumulasi yang sudah terkunci sebelum periode ini
        const prevLedger: any = await tx.get(
          `SELECT accumulated_after FROM asset_depreciation_ledger
           WHERE asset_id = ? AND (period_year < ? OR (period_year = ? AND period_month < ?))
           ORDER BY period_year DESC, period_month DESC LIMIT 1`,
          [asset.id, year, year, month]
        );
        const before = Number(prevLedger?.accumulated_after || 0);

        const atEnd = calcDepreciation(asset, periodEnd, additions[asset.id] || []);
        const accumulatedAfter = atEnd.accumulated_depreciation;
        const charge = Math.max(0, Math.round((accumulatedAfter - before) * 100) / 100);

        await tx.run(
          `INSERT INTO asset_depreciation_ledger
            (asset_id, period_year, period_month, depreciation_amount, accumulated_after, book_value_after, posted_by)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [asset.id, year, month, charge, accumulatedAfter, atEnd.book_value, userId]
        );
        rows.push({ asset_id: asset.id, asset_code: asset.asset_code, depreciation_amount: charge });
      }

      await tx.run(
        `INSERT INTO asset_depreciation_periods (period_year, period_month, status, closed_at, closed_by, notes)
         VALUES (?, ?, 'closed', NOW(), ?, ?)
         ON DUPLICATE KEY UPDATE status='closed', closed_at=NOW(), closed_by=VALUES(closed_by),
                                 reopened_at=NULL, reopened_by=NULL, notes=VALUES(notes)`,
        [year, month, userId, req.body.notes || null]
      );
      return rows;
    });

    res.status(201).json({
      message: `Periode ${month}/${year} ditutup`,
      posted_count: posted.length,
      total_depreciation: Math.round(posted.reduce((s, r) => s + r.depreciation_amount, 0) * 100) / 100,
    });
  } catch (error: any) {
    serverError(res, 'close-period', error);
  }
});

// POST /assets/depreciation/periods/reopen — buka kembali periode terakhir
router.post('/depreciation/periods/reopen', authMiddleware, requirePermission('assets.period.manage', 'assets.manage'),
  async (req: Request, res: Response) => {
  try {
    const year = Number(req.body.period_year);
    const month = Number(req.body.period_month);
    if (!Number.isInteger(year) || !Number.isInteger(month)) {
      return res.status(400).json({ error: 'period_year dan period_month wajib diisi' });
    }

    const period: any = await dbGet(
      'SELECT id, status FROM asset_depreciation_periods WHERE period_year = ? AND period_month = ?',
      [year, month]
    );
    if (!period) return res.status(404).json({ error: 'Periode tidak ditemukan' });
    if (period.status !== 'closed') return res.status(409).json({ error: 'Periode sudah terbuka' });

    // Hanya periode TERAKHIR yang boleh dibuka — membuka periode di tengah
    // membuat akumulasi periode sesudahnya tidak konsisten.
    const later: any = await dbGet(
      `SELECT COUNT(*) AS c FROM asset_depreciation_periods
       WHERE status = 'closed' AND (period_year > ? OR (period_year = ? AND period_month > ?))`,
      [year, year, month]
    );
    if (Number(later?.c || 0) > 0) {
      return res.status(409).json({ error: 'Buka periode yang lebih baru lebih dulu — hanya periode terakhir yang bisa dibuka' });
    }

    await withTransaction(async tx => {
      await tx.run('DELETE FROM asset_depreciation_ledger WHERE period_year = ? AND period_month = ?', [year, month]);
      await tx.run(
        `UPDATE asset_depreciation_periods SET status='open', reopened_at=NOW(), reopened_by=? WHERE id = ?`,
        [(req as any).user?.userId || null, period.id]
      );
    });

    res.json({ message: `Periode ${month}/${year} dibuka kembali` });
  } catch (error: any) {
    serverError(res, 'reopen-period', error);
  }
});

export default router;
