import { Router, Request, Response } from 'express';
import { dbAll, dbGet, dbRun } from '../config/database';
import { authMiddleware, mobileAuthMiddleware, MobileAuthRequest } from '../middleware/auth';
import multer from 'multer';
import path from 'path';
import fs from 'fs';

const router = Router();

// Multer setup for MR photo uploads
const mrPhotoDir = path.join(process.cwd(), 'uploads', 'mr-photos');
if (!fs.existsSync(mrPhotoDir)) fs.mkdirSync(mrPhotoDir, { recursive: true });
const mrStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, mrPhotoDir),
  filename: (_req, file, cb) => cb(null, `mr-${Date.now()}-${Math.random().toString(36).slice(2,8)}${path.extname(file.originalname) || '.jpg'}`),
});
const mrUpload = multer({ storage: mrStorage, limits: { fileSize: 10 * 1024 * 1024 } }); // 10MB

// POST /upload-photo — upload a photo from mobile camera
router.post('/upload-photo', mobileAuthMiddleware, mrUpload.single('photo'), (req: Request, res: Response) => {
  try {
    const file = (req as any).file;
    if (!file) return res.status(400).json({ error: 'No photo uploaded' });
    const url = `/uploads/mr-photos/${file.filename}`;
    res.json({ url, filename: file.filename });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── PRODUCT CATALOG (marketplace) ─────────────────────────────────
// GET /catalog — browse products with search + category filter
router.get('/catalog', mobileAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const { search, category_id } = req.query;
    let sql = `
      SELECT p.id, p.sku, p.name, p.description, p.spec, p.image_url, p.standard_cost,
             c.name as category_name
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      WHERE p.active = 1`;
    const params: any[] = [];

    if (search) {
      sql += ` AND (p.name LIKE ? OR p.description LIKE ? OR p.spec LIKE ? OR p.sku LIKE ?)`;
      const s = `%${search}%`;
      params.push(s, s, s, s);
    }
    if (category_id) {
      sql += ` AND p.category_id = ?`;
      params.push(category_id);
    }
    sql += ` ORDER BY c.name, p.name LIMIT 100`;

    const products = await dbAll(sql, params);

    // Get categories for filter tabs
    const categories = await dbAll(
      `SELECT c.id, c.name, COUNT(p.id) as product_count
       FROM categories c
       INNER JOIN products p ON p.category_id = c.id AND p.active = 1
       GROUP BY c.id, c.name
       ORDER BY c.name`
    );

    res.json({ products, categories });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── MATERIAL REQUESTS CRUD ─────────────────────────────────────────

// GET /my — list my material requests
router.get('/my', mobileAuthMiddleware, async (req: MobileAuthRequest, res: Response) => {
  try {
    const empId = req.employeeId;
    const rows = await dbAll(
      `SELECT mr.*, cp.project_name as proj_name, cp.project_number,
              (SELECT COUNT(*) FROM material_request_items WHERE mr_id = mr.id) as item_count
       FROM material_requests mr
       LEFT JOIN client_projects cp ON mr.project_id = cp.id
       WHERE mr.employee_id = ?
       ORDER BY mr.created_at DESC
       LIMIT 50`,
      [empId]
    );
    res.json({ data: rows });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /all — list all MRs (for admin/office)
router.get('/all', authMiddleware, async (req: Request, res: Response) => {
  try {
    const rows = await dbAll(
      `SELECT mr.*, cp.project_name as proj_name, cp.project_number,
              (SELECT COUNT(*) FROM material_request_items WHERE mr_id = mr.id) as item_count
       FROM material_requests mr
       LEFT JOIN client_projects cp ON mr.project_id = cp.id
       ORDER BY mr.created_at DESC
       LIMIT 200`
    );
    res.json({ data: rows });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /:id — detail with items (office)
router.get('/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const mr = await dbGet(
      `SELECT mr.*, cp.project_name as proj_name, cp.project_number
       FROM material_requests mr
       LEFT JOIN client_projects cp ON mr.project_id = cp.id
       WHERE mr.id = ?`,
      [req.params.id]
    );
    if (!mr) return res.status(404).json({ error: 'MR not found' });

    const items = await dbAll(
      `SELECT mri.*, p.sku, p.image_url as product_image, p.spec as product_spec
       FROM material_request_items mri
       LEFT JOIN products p ON mri.product_id = p.id
       WHERE mri.mr_id = ?
       ORDER BY mri.id`,
      [req.params.id]
    );
    res.json({ data: { ...(mr as any), items } });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST / — create new MR from mobile
router.post('/', mobileAuthMiddleware, async (req: MobileAuthRequest, res: Response) => {
  try {
    const empId = req.employeeId;
    const { project_id, project_name, priority, needed_by, notes, items } = req.body;

    if (!items?.length) return res.status(400).json({ error: 'At least 1 item required' });

    // Nama pemohon diambil dari DB, bukan dari body — supaya MR tidak bisa
    // diajukan atas nama orang lain.
    const emp = await dbGet('SELECT name FROM employees WHERE id = ? AND status = ?', [empId, 'ACTIVE']) as any;
    if (!emp) return res.status(403).json({ error: 'Karyawan tidak aktif' });
    const employee_name = emp.name;

    // Generate MR number: MR-YYYYMMDD-XXXX
    const now = new Date();
    const datePart = now.toISOString().slice(0, 10).replace(/-/g, '');
    const countRes = await dbGet(
      `SELECT COUNT(*) as cnt FROM material_requests WHERE DATE(created_at) = CURDATE()`
    ) as any;
    const seq = String((countRes?.cnt || 0) + 1).padStart(4, '0');
    const mrNumber = `MR-${datePart}-${seq}`;

    const result = await dbRun(
      `INSERT INTO material_requests (mr_number, employee_id, employee_name, project_id, project_name, priority, needed_by, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [mrNumber, empId, employee_name, project_id || null, project_name || null, priority || 'normal', needed_by || null, notes || null]
    );
    const mrId = result.insertId;

    // Insert items
    for (const item of items) {
      await dbRun(
        `INSERT INTO material_request_items (mr_id, product_id, item_name, quantity, uom, notes, image_url, spec)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [mrId, item.product_id || null, item.item_name, item.quantity || 1, item.uom || 'pcs', item.notes || null, item.image_url || null, item.spec || null]
      );
    }

    res.status(201).json({ message: 'Material Request created', data: { id: mrId, mr_number: mrNumber } });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /:id/approve — approve MR → auto-create PR
router.put('/:id/approve', authMiddleware, async (req: Request, res: Response) => {
  try {
    const mrId = req.params.id;
    const mr = await dbGet('SELECT * FROM material_requests WHERE id = ?', [mrId]) as any;
    if (!mr) return res.status(404).json({ error: 'MR not found' });
    if (mr.status !== 'pending') return res.status(400).json({ error: `MR already ${mr.status}` });

    // Update MR status
    await dbRun(
      'UPDATE material_requests SET status = ?, approved_at = NOW() WHERE id = ?',
      ['approved', mrId]
    );

    // Get MR items
    const items = await dbAll('SELECT * FROM material_request_items WHERE mr_id = ?', [mrId]) as any[];

    // Auto-create PR from MR items
    const now = new Date();
    const datePart = now.toISOString().slice(0, 10).replace(/-/g, '');
    const rand = Math.floor(1000 + Math.random() * 9000);
    const prNumber = `PR-${datePart}-${rand}`;

    const prItems = items.map((item: any) => ({
      productId: item.product_id || null,
      productName: '',
      name: item.item_name,
      qty: item.quantity,
      uom: item.uom || 'pcs',
      specification: item.spec || item.notes || '',
      price: 0,
    }));

    const estimatedTotal = 0; // Will be filled during bidding
    const prResult = await dbRun(
      `INSERT INTO purchase_requests (pr_number, requestor_id, project_id, status, notes)
       VALUES (?, ?, ?, 'DRAFT', ?)`,
      [
        prNumber,
        null, // requestor from MR employee
        mr.project_id || null,
        JSON.stringify({
          noteText: `Auto-created from Material Request ${mr.mr_number} by ${mr.employee_name || 'Field Worker'}`,
          itemType: 'non-inventory',
          items: prItems,
          estimatedTotal,
          source_mr_id: mrId,
          source_mr_number: mr.mr_number,
        }),
      ]
    );

    // Update MR with linked PR
    await dbRun(
      'UPDATE material_requests SET notes = ? WHERE id = ?',
      [JSON.stringify({ ...(mr.notes ? JSON.parse(mr.notes) : {}), linked_pr_id: prResult.insertId, linked_pr_number: prNumber }), mrId]
    );

    res.json({
      message: `MR approved → PR ${prNumber} created`,
      pr_id: prResult.insertId,
      pr_number: prNumber,
    });
  } catch (err: any) {
    console.error('Error approving MR:', err);
    res.status(500).json({ error: err.message });
  }
});

// PUT /:id/reject — reject MR
router.put('/:id/reject', authMiddleware, async (req: Request, res: Response) => {
  try {
    const mr = await dbGet('SELECT status FROM material_requests WHERE id = ?', [req.params.id]) as any;
    if (!mr) return res.status(404).json({ error: 'MR not found' });
    if (mr.status !== 'pending') return res.status(400).json({ error: `MR already ${mr.status}` });

    await dbRun('UPDATE material_requests SET status = ? WHERE id = ?', ['rejected', req.params.id]);
    res.json({ message: 'MR rejected' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /:id — delete MR (only if pending)
router.delete('/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const mr = await dbGet('SELECT status FROM material_requests WHERE id = ?', [req.params.id]) as any;
    if (!mr) return res.status(404).json({ error: 'MR not found' });
    if (mr.status !== 'pending') return res.status(400).json({ error: 'Can only delete pending MR' });

    await dbRun('DELETE FROM material_request_items WHERE mr_id = ?', [req.params.id]);
    await dbRun('DELETE FROM material_requests WHERE id = ?', [req.params.id]);
    res.json({ message: 'MR deleted' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /projects/list — get active projects for dropdown
router.get('/projects/list', mobileAuthMiddleware, async (_req: Request, res: Response) => {
  try {
    const projects = await dbAll(
      `SELECT id, project_number, project_name FROM client_projects WHERE status IN ('open','active','in_progress') ORDER BY project_name`
    );
    res.json({ data: projects });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
