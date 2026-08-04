import { Router, Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import multer from 'multer';
import { dbAll, dbGet, dbRun } from '../config/database';
import { authMiddleware , downloadAuthMiddleware} from '../middleware/auth';

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
router.get('/categories', authMiddleware, async (_req: Request, res: Response) => {
  try {
    const rows = await dbAll('SELECT * FROM asset_categories WHERE is_active = 1 ORDER BY order_no, id', []);
    res.json({ data: rows });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ── Production lines ───────────────────────────────────────────────────
router.get('/production-lines', authMiddleware, async (_req: Request, res: Response) => {
  try {
    const rows = await dbAll('SELECT * FROM production_lines WHERE is_active = 1 ORDER BY name', []);
    res.json({ data: rows });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/production-lines/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const row = await dbGet('SELECT * FROM production_lines WHERE id = ?', [req.params.id]);
    if (!row) return res.status(404).json({ error: 'Production line not found' });
    res.json({ data: row });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/production-lines', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { code, name, description } = req.body;
    if (!name) return res.status(400).json({ error: 'name is required' });
    const result = await dbRun(
      'INSERT INTO production_lines (code, name, description) VALUES (?, ?, ?)',
      [code || null, name, description || null]
    );
    res.status(201).json({ id: result.insertId });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/production-lines/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { code, name, description, is_active } = req.body;
    await dbRun(
      'UPDATE production_lines SET code = ?, name = ?, description = ?, is_active = ? WHERE id = ?',
      [code || null, name, description || null, is_active === undefined ? 1 : is_active, req.params.id]
    );
    res.json({ message: 'Updated' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/production-lines/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    await dbRun('DELETE FROM production_lines WHERE id = ?', [req.params.id]);
    res.json({ message: 'Deleted' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ── P&IDs (belong to a production line, group assets within the line) ────
router.get('/production-lines/:lineId/pnids', authMiddleware, async (req: Request, res: Response) => {
  try {
    const rows = await dbAll(
      `SELECT p.*, (SELECT COUNT(*) FROM assets a WHERE a.pnid_id = p.id) as asset_count
       FROM pnids p WHERE p.production_line_id = ? AND p.is_active = 1 ORDER BY p.code`,
      [req.params.lineId]
    );
    res.json({ data: rows });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/production-lines/:lineId/pnids', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { code, title, description } = req.body;
    if (!code) return res.status(400).json({ error: 'code is required' });
    const result = await dbRun(
      'INSERT INTO pnids (production_line_id, code, title, description) VALUES (?, ?, ?, ?)',
      [req.params.lineId, code, title || null, description || null]
    );
    res.status(201).json({ id: result.insertId });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/pnids/:id', authMiddleware, async (req: Request, res: Response) => {
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
    res.status(500).json({ error: error.message });
  }
});

router.put('/pnids/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { code, title, description, is_active } = req.body;
    await dbRun(
      'UPDATE pnids SET code = ?, title = ?, description = ?, is_active = ? WHERE id = ?',
      [code, title || null, description || null, is_active === undefined ? 1 : is_active, req.params.id]
    );
    res.json({ message: 'Updated' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/pnids/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    await dbRun('UPDATE assets SET pnid_id = NULL WHERE pnid_id = ?', [req.params.id]);
    await dbRun('DELETE FROM pnids WHERE id = ?', [req.params.id]);
    res.json({ message: 'Deleted' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ── Assets ──────────────────────────────────────────────────────────────
router.get('/summary', authMiddleware, async (_req: Request, res: Response) => {
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
    res.status(500).json({ error: error.message });
  }
});

router.get('/', authMiddleware, async (req: Request, res: Response) => {
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
    res.status(500).json({ error: error.message });
  }
});

router.get('/:id', authMiddleware, async (req: Request, res: Response) => {
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
    res.status(500).json({ error: error.message });
  }
});

router.post('/', authMiddleware, async (req: Request, res: Response) => {
  try {
    const {
      category_id, production_line_id, pnid_id, pnid_tag, name, location, spec,
      purchase_date, purchase_price, vendor, useful_life_years, salvage_value,
      depreciation_method, status, notes,
    } = req.body;

    if (!category_id || !name) {
      return res.status(400).json({ error: 'category_id and name are required' });
    }

    // If a P&ID is given, derive the production_line_id from it (P&ID is the source of truth)
    let lineId = production_line_id || null;
    if (pnid_id) {
      const pnid: any = await dbGet('SELECT production_line_id FROM pnids WHERE id = ?', [pnid_id]);
      if (pnid) lineId = pnid.production_line_id;
    }

    const assetCode = await nextAssetCode();
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
    res.status(201).json({ id: result.insertId, asset_code: assetCode });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const {
      category_id, production_line_id, pnid_id, pnid_tag, name, location, spec,
      purchase_date, purchase_price, vendor, useful_life_years, salvage_value,
      depreciation_method, status, disposed_date, notes,
    } = req.body;

    let lineId = production_line_id || null;
    if (pnid_id) {
      const pnid: any = await dbGet('SELECT production_line_id FROM pnids WHERE id = ?', [pnid_id]);
      if (pnid) lineId = pnid.production_line_id;
    }

    await dbRun(
      `UPDATE assets SET
        category_id = ?, production_line_id = ?, pnid_id = ?, pnid_tag = ?, name = ?, location = ?, spec = ?,
        purchase_date = ?, purchase_price = ?, vendor = ?, useful_life_years = ?, salvage_value = ?,
        depreciation_method = ?, status = ?, disposed_date = ?, notes = ?
       WHERE id = ?`,
      [
        category_id, lineId, pnid_id || null, pnid_tag || null, name, location || null,
        JSON.stringify(spec || {}), purchase_date || null, purchase_price || 0, vendor || null,
        useful_life_years || 1, salvage_value || 0, depreciation_method || 'straight_line',
        status || 'active', disposed_date || null, notes || null, req.params.id,
      ]
    );
    res.json({ message: 'Updated' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    await dbRun('DELETE FROM assets WHERE id = ?', [req.params.id]);
    res.json({ message: 'Deleted' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ── Documents ───────────────────────────────────────────────────────────
const uploadDir = path.join(__dirname, '../../uploads/asset_documents');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  },
});
const upload = multer({ storage });

router.get('/:id/documents', authMiddleware, async (req: Request, res: Response) => {
  try {
    const rows = await dbAll(
      `SELECT d.*, u.full_name as uploader_name FROM asset_documents d
       LEFT JOIN users u ON d.uploaded_by = u.id
       WHERE d.asset_id = ? ORDER BY d.uploaded_at DESC`,
      [req.params.id]
    );
    res.json({ data: rows });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/:id/documents', authMiddleware, upload.single('file'), async (req: Request, res: Response) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const { originalname, filename, size, mimetype } = req.file;
    let fileType = 'other';
    if (mimetype.startsWith('image/')) fileType = 'image';
    else if (mimetype.includes('pdf')) fileType = 'pdf';
    else if (mimetype.includes('sheet') || mimetype.includes('excel')) fileType = 'excel';
    else if (mimetype.includes('document') || mimetype.includes('word')) fileType = 'word';

    const result = await dbRun(
      `INSERT INTO asset_documents (asset_id, doc_title, doc_category, file_name, file_path, file_type, file_size, uploaded_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [req.params.id, req.body.doc_title || originalname, req.body.doc_category || 'Lainnya',
        originalname, filename, fileType, size, (req as any).user?.userId || null]
    );
    res.status(201).json({ id: result.insertId });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/documents/:docId/preview', downloadAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const file: any = await dbGet('SELECT * FROM asset_documents WHERE id = ?', [req.params.docId]);
    if (!file) return res.status(404).json({ error: 'File not found' });
    const filePath = path.join(uploadDir, file.file_path);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not on disk' });
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(file.file_name)}"`);
    res.sendFile(filePath);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/documents/:docId/download', downloadAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const file: any = await dbGet('SELECT * FROM asset_documents WHERE id = ?', [req.params.docId]);
    if (!file) return res.status(404).json({ error: 'File not found' });
    const filePath = path.join(uploadDir, file.file_path);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not on disk' });
    res.download(filePath, file.file_name);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/documents/:docId', authMiddleware, async (req: Request, res: Response) => {
  try {
    const file: any = await dbGet('SELECT * FROM asset_documents WHERE id = ?', [req.params.docId]);
    if (!file) return res.status(404).json({ error: 'File not found' });
    await dbRun('DELETE FROM asset_documents WHERE id = ?', [req.params.docId]);
    const filePath = path.join(uploadDir, file.file_path);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    res.json({ message: 'Deleted' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ── Maintenance history ─────────────────────────────────────────────────
router.get('/:id/maintenance', authMiddleware, async (req: Request, res: Response) => {
  try {
    const rows = await dbAll(
      'SELECT * FROM asset_maintenance_logs WHERE asset_id = ? ORDER BY performed_at DESC',
      [req.params.id]
    );
    res.json({ data: rows });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/:id/maintenance', authMiddleware, async (req: Request, res: Response) => {
  try {
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
    res.status(500).json({ error: error.message });
  }
});

router.put('/maintenance/:logId', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { maintenance_type, description, cost, performed_by, vendor, performed_at, next_due_date } = req.body;
    await dbRun(
      `UPDATE asset_maintenance_logs SET maintenance_type = ?, description = ?, cost = ?,
        performed_by = ?, vendor = ?, performed_at = ?, next_due_date = ? WHERE id = ?`,
      [maintenance_type || 'corrective', description || null, cost || 0, performed_by || null,
        vendor || null, performed_at, next_due_date || null, req.params.logId]
    );
    res.json({ message: 'Updated' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/maintenance/:logId', authMiddleware, async (req: Request, res: Response) => {
  try {
    await dbRun('DELETE FROM asset_maintenance_logs WHERE id = ?', [req.params.logId]);
    res.json({ message: 'Deleted' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ── Purchase history ────────────────────────────────────────────────────
router.get('/:id/purchase-history', authMiddleware, async (req: Request, res: Response) => {
  try {
    const rows = await dbAll(
      'SELECT * FROM asset_purchase_history WHERE asset_id = ? ORDER BY purchase_date DESC',
      [req.params.id]
    );
    res.json({ data: rows });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/:id/purchase-history', authMiddleware, async (req: Request, res: Response) => {
  try {
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
    res.status(500).json({ error: error.message });
  }
});

router.put('/purchase-history/:entryId', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { description, amount, purchase_date, vendor, notes } = req.body;
    await dbRun(
      `UPDATE asset_purchase_history SET description = ?, amount = ?, purchase_date = ?, vendor = ?, notes = ? WHERE id = ?`,
      [description || null, amount || 0, purchase_date, vendor || null, notes || null, req.params.entryId]
    );
    res.json({ message: 'Updated' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/purchase-history/:entryId', authMiddleware, async (req: Request, res: Response) => {
  try {
    await dbRun('DELETE FROM asset_purchase_history WHERE id = ?', [req.params.entryId]);
    res.json({ message: 'Deleted' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
