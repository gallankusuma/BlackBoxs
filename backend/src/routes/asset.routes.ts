import { Router, Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import multer from 'multer';
import { dbAll, dbGet, dbRun } from '../config/database';
import { authMiddleware } from '../middleware/auth';
import { loadUserAccess, requirePermission } from '../middleware/permission';
import { validateUpload, storeValidatedFile, removeStoredFile } from '../utils/file-validation';
import { validateAssetInput, validateMaintenanceInput, validatePurchaseHistoryInput, serverError }
  from '../utils/asset-validation';

const router = Router();

// ── Depreciation (straight-line) ──────────────────────────────────────────
function calcDepreciation(asset: any) {
  const purchasePrice = parseFloat(asset.purchase_price) || 0;
  const salvage = parseFloat(asset.salvage_value) || 0;
  const usefulLifeYears = Number(asset.useful_life_years) || 1;
  const purchaseDate = asset.purchase_date ? new Date(asset.purchase_date) : null;

  if (!purchaseDate || purchasePrice <= 0) {
    return { accumulated_depreciation: 0, book_value: purchasePrice, monthly_depreciation: 0, percent_depreciated: 0 };
  }

  const depreciableBase = Math.max(purchasePrice - salvage, 0);
  const monthlyDepreciation = depreciableBase / (usefulLifeYears * 12);

  const asOf = asset.status === 'disposed' && asset.disposed_date ? new Date(asset.disposed_date) : new Date();
  let monthsElapsed = (asOf.getFullYear() - purchaseDate.getFullYear()) * 12 + (asOf.getMonth() - purchaseDate.getMonth());
  monthsElapsed = Math.max(0, Math.min(monthsElapsed, usefulLifeYears * 12));

  const accumulatedDepreciation = +(monthlyDepreciation * monthsElapsed).toFixed(2);
  const bookValue = +(purchasePrice - accumulatedDepreciation).toFixed(2);
  const percentDepreciated = depreciableBase > 0 ? +((accumulatedDepreciation / depreciableBase) * 100).toFixed(1) : 0;

  return {
    accumulated_depreciation: accumulatedDepreciation,
    book_value: bookValue,
    monthly_depreciation: +monthlyDepreciation.toFixed(2),
    percent_depreciated: percentDepreciated,
  };
}

function withDepreciation(row: any) {
  return {
    ...row,
    spec: typeof row.spec === 'string' ? JSON.parse(row.spec || '{}') : (row.spec || {}),
    ...calcDepreciation(row),
  };
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

router.delete('/production-lines/:id', authMiddleware, requirePermission('assets.master.manage', 'assets.manage'), async (req: Request, res: Response) => {
  try {
    await dbRun('DELETE FROM production_lines WHERE id = ?', [req.params.id]);
    res.json({ message: 'Deleted' });
  } catch (error: any) {
    serverError(res, 'asset', error);
  }
});

// ── P&IDs (belong to a production line, group assets within the line) ────
router.get('/production-lines/:lineId/pnids', authMiddleware, requirePermission('assets.view', 'assets.manage'), async (req: Request, res: Response) => {
  try {
    const rows = await dbAll(
      `SELECT p.*, (SELECT COUNT(*) FROM assets a WHERE a.pnid_id = p.id) as asset_count
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

router.delete('/pnids/:id', authMiddleware, requirePermission('assets.master.manage', 'assets.manage'), async (req: Request, res: Response) => {
  try {
    await dbRun('UPDATE assets SET pnid_id = NULL WHERE pnid_id = ?', [req.params.id]);
    await dbRun('DELETE FROM pnids WHERE id = ?', [req.params.id]);
    res.json({ message: 'Deleted' });
  } catch (error: any) {
    serverError(res, 'asset', error);
  }
});

// ── Assets ──────────────────────────────────────────────────────────────
router.get('/summary', authMiddleware, requirePermission('assets.view', 'assets.manage'), async (_req: Request, res: Response) => {
  try {
    const rows = await dbAll(
      `SELECT a.*, c.name as category_name, c.code as category_code
       FROM assets a JOIN asset_categories c ON a.category_id = c.id
       WHERE a.status != 'disposed'`,
      []
    );
    const withDep = rows.map(withDepreciation);

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
    const where: string[] = [];
    const params: any[] = [];
    if (category_id) { where.push('a.category_id = ?'); params.push(category_id); }
    if (category_code) { where.push('c.code = ?'); params.push(category_code); }
    if (production_line_id) { where.push('a.production_line_id = ?'); params.push(production_line_id); }
    if (pnid_id) { where.push('a.pnid_id = ?'); params.push(pnid_id); }
    if (status) { where.push('a.status = ?'); params.push(status); }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const rows = await dbAll(
      `SELECT a.*, c.name as category_name, c.code as category_code,
              p.name as production_line_name, q.code as pnid_code
       FROM assets a
       JOIN asset_categories c ON a.category_id = c.id
       LEFT JOIN production_lines p ON a.production_line_id = p.id
       LEFT JOIN pnids q ON a.pnid_id = q.id
       ${whereSql}
       ORDER BY a.id DESC`,
      params
    );
    res.json({ data: rows.map(withDepreciation) });
  } catch (error: any) {
    serverError(res, 'asset', error);
  }
});

router.get('/:id', authMiddleware, requirePermission('assets.view', 'assets.manage'), async (req: Request, res: Response) => {
  try {
    const row: any = await dbGet(
      `SELECT a.*, c.name as category_name, c.code as category_code,
              p.name as production_line_name, q.code as pnid_code, q.title as pnid_title
       FROM assets a
       JOIN asset_categories c ON a.category_id = c.id
       LEFT JOIN production_lines p ON a.production_line_id = p.id
       LEFT JOIN pnids q ON a.pnid_id = q.id
       WHERE a.id = ?`,
      [req.params.id]
    );
    if (!row) return res.status(404).json({ error: 'Asset not found' });
    res.json({ data: withDepreciation(row) });
  } catch (error: any) {
    serverError(res, 'asset', error);
  }
});

router.post('/', authMiddleware, requirePermission('assets.create', 'assets.manage'), async (req: Request, res: Response) => {
  try {
    const {
      category_id, production_line_id, pnid_id, pnid_tag, name, location, spec,
      purchase_date, purchase_price, vendor, useful_life_years, salvage_value,
      depreciation_method, status, notes,
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
             depreciation_method, status, notes, created_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            assetCode, category_id, lineId, pnid_id || null, pnid_tag || null, name, location || null,
            JSON.stringify(spec || {}), purchase_date || null, purchase_price || 0, vendor || null,
            useful_life_years || 1, salvage_value || 0, depreciation_method || 'straight_line',
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
      depreciation_method, status, disposed_date, notes,
    } = req.body;

    const has = (k: string) => Object.prototype.hasOwnProperty.call(req.body, k);

    const current: any = await dbGet('SELECT * FROM assets WHERE id = ?', [req.params.id]);
    if (!current) return res.status(404).json({ error: 'Aset tidak ditemukan' });

    const invalid = validateAssetInput(req.body, current);
    if (invalid) return res.status(400).json({ error: invalid });

    if (has('category_id') && category_id) {
      const category = await dbGet('SELECT id FROM asset_categories WHERE id = ?', [category_id]);
      if (!category) return res.status(404).json({ error: 'Kategori aset tidak ditemukan' });
    }

    // Disposal butuh hak terpisah dari edit biasa (AST-001). Karena disposal
    // saat ini hanya berupa perubahan status, pemeriksaannya di dalam handler.
    if (status === 'disposed') {
      if (current.status !== 'disposed') {
        const access = await loadUserAccess((req as any).userId);
        const mayDispose = !!access && (access.level >= 10
          || access.perms.has('assets.dispose') || access.perms.has('assets.manage'));
        if (!mayDispose) {
          return res.status(403).json({
            error: 'Anda tidak punya hak untuk menghapus-bukukan (dispose) aset',
            required: ['assets.dispose'],
            code: 'PERMISSION_DENIED',
          });
        }
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

router.delete('/:id', authMiddleware, requirePermission('assets.delete', 'assets.manage'), async (req: Request, res: Response) => {
  try {
    await dbRun('DELETE FROM assets WHERE id = ?', [req.params.id]);
    res.json({ message: 'Deleted' });
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
    const asset = await dbGet('SELECT id FROM assets WHERE id = ?', [req.params.id]);
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
    const asset = await dbGet('SELECT id FROM assets WHERE id = ?', [req.params.id]);
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
    const asset = await dbGet('SELECT id FROM assets WHERE id = ?', [req.params.id]);
    if (!asset) return res.status(404).json({ error: 'Aset tidak ditemukan' });

    const invalidEntry = validatePurchaseHistoryInput(req.body);
    if (invalidEntry) return res.status(400).json({ error: invalidEntry });

    const { description, amount, purchase_date, vendor, notes, purchase_order_item_id } = req.body;
    if (!purchase_date) return res.status(400).json({ error: 'purchase_date is required' });
    const result = await dbRun(
      `INSERT INTO asset_purchase_history
        (asset_id, purchase_order_item_id, description, amount, purchase_date, vendor, notes, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [req.params.id, purchase_order_item_id || null, description || null, amount || 0,
        purchase_date, vendor || null, notes || null, (req as any).user?.userId || null]
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

export default router;
