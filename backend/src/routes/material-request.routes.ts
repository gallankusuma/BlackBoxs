import { Router, Request, Response } from 'express';
import { dbAll, dbGet, dbRun, withTransaction } from '../config/database';
import { nextSequentialCode } from './procurement.routes';
import { businessDate } from '../utils/date.utils';
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
    // P1: `project_name` TIDAK lagi dibaca dari body.
    //
    // Sebelumnya `project_id` dan `project_name` dikirim sebagai dua nilai
    // independen, jadi MR bisa menyimpan nama yang tidak ada hubungannya dengan
    // id-nya — dan `project_id` yang menunjuk project tidak ada pun diterima.
    // Nama diambil dari database supaya laporan dan PR turunannya menunjuk
    // project yang sama dengan yang benar-benar dipilih.
    const { project_id, priority, needed_by, notes, items } = req.body;

    if (!items?.length) return res.status(400).json({ error: 'At least 1 item required' });

    // Nama pemohon diambil dari DB, bukan dari body — supaya MR tidak bisa
    // diajukan atas nama orang lain.
    const emp = await dbGet('SELECT name FROM employees WHERE id = ? AND status = ?', [empId, 'ACTIVE']) as any;
    if (!emp) return res.status(403).json({ error: 'Karyawan tidak aktif' });
    const employee_name = emp.name;

    // Project divalidasi kalau diisi. MR tanpa project tetap boleh — pekerja
    // lapangan tidak selalu tahu project mana yang membebani permintaannya, dan
    // menolaknya akan membuat mereka berhenti memakai fitur ini sama sekali.
    let projectName: string | null = null;
    if (project_id) {
      const proj: any = await dbGet(
        'SELECT id, project_name FROM client_projects WHERE id = ?', [project_id]
      );
      if (!proj) {
        return res.status(404).json({
          error: 'Project yang dipilih tidak ditemukan.',
          code: 'PROJECT_NOT_FOUND',
        });
      }
      projectName = proj.project_name;
    }

    // DR-P1-04: header + seluruh item satu transaction, dan nomornya atomic.
    //
    // Sebelumnya keduanya autocommit terpisah — gagal di tengah loop
    // meninggalkan MR tanpa item lengkap. Nomornya juga `COUNT(*)+1` bertanggal
    // UTC: dua permintaan bersamaan membaca hitungan yang sama, dan pada pagi WIB
    // tanggalnya mundur sehari.
    const { mrId, mrNumber } = await withTransaction(async tx => {
      const nomor = await nextSequentialCode('MR', 'material_requests', 'mr_number', tx);
      const result = await tx.run(
        `INSERT INTO material_requests (mr_number, employee_id, employee_name, project_id, project_name, priority, needed_by, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [nomor, empId, employee_name, project_id || null, projectName, priority || 'normal', needed_by || null, notes || null]
      );
      const id = result.insertId;

      for (const item of items) {
        await tx.run(
          `INSERT INTO material_request_items (mr_id, product_id, item_name, quantity, uom, notes, image_url, spec)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [id, item.product_id || null, item.item_name, item.quantity || 1, item.uom || 'pcs', item.notes || null, item.image_url || null, item.spec || null]
        );
      }
      return { mrId: id, mrNumber: nomor };
    });

    res.status(201).json({ message: 'Material Request created', data: { id: mrId, mr_number: mrNumber } });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /:id/approve — approve MR → auto-create PR
router.put('/:id/approve', authMiddleware, async (req: Request, res: Response) => {
  try {
    const mrId = req.params.id;

    // DR-P1-04: seluruh approve satu transaction yang dimulai dari lock barisnya.
    //
    // Versi lama: baca `pending`, ubah status, buat PR, lalu tulis tautan —
    // empat langkah autocommit tanpa lock. Dua approve paralel menghasilkan DUA
    // PR, dan kegagalan di langkah terakhir meninggalkan MR sudah `approved`
    // dengan PR yang sudah jadi tapi tautannya hilang.
    const hasil = await withTransaction(async tx => {
      const mr: any = await tx.get('SELECT * FROM material_requests WHERE id = ? FOR UPDATE', [mrId]);
      if (!mr) return { error: 404, body: { error: 'MR not found' } };
      if (mr.status !== 'pending') {
        return { error: 409, body: { error: `MR sudah berstatus ${mr.status}`, code: 'MR_NOT_PENDING' } };
      }

      const items: any[] = await tx.all('SELECT * FROM material_request_items WHERE mr_id = ?', [mrId]);

      // Nomor PR memakai generator resmi Procurement — bukan akhiran acak 4
      // digit, yang selain rawan tabrakan juga menyeed counter berurutan
      // Procurement dan mendorongnya melewati 9999.
      const prNumber = await nextSequentialCode('PR', 'purchase_requests', 'pr_number', tx);

      const prItems = items.map((item: any) => ({
        productId: item.product_id || null,
        productName: '',
        name: item.item_name,
        qty: item.quantity,
        uom: item.uom || 'pcs',
        specification: item.spec || item.notes || '',
        price: 0,
      }));

      const prResult = await tx.run(
        `INSERT INTO purchase_requests (pr_number, requestor_id, project_id, status, notes)
         VALUES (?, ?, ?, 'DRAFT', ?)`,
        [
          prNumber,
          null,
          mr.project_id || null,
          JSON.stringify({
            noteText: `Auto-created from Material Request ${mr.mr_number} by ${mr.employee_name || 'Field Worker'}`,
            itemType: 'non-inventory',
            items: prItems,
            estimatedTotal: 0,
            source_mr_id: Number(mrId),
            source_mr_number: mr.mr_number,
          }),
        ]
      );

      // Tautan disimpan di KOLOM SENDIRI. Versi lama menimpa `notes` dengan JSON
      // hasil `JSON.parse(mr.notes)` — padahal `notes` diisi karyawan sebagai
      // teks bebas dari layar mobile, jadi catatan seperti "urgent" membuat
      // approve melempar SETELAH status berubah dan PR terlanjur dibuat.
      await tx.run(
        `UPDATE material_requests
         SET status = 'approved', approved_at = NOW(), linked_pr_id = ?, linked_pr_number = ?
         WHERE id = ?`,
        [prResult.insertId, prNumber, mrId]
      );

      return { ok: true as const, prId: prResult.insertId, prNumber };
    });

    if ('error' in hasil) return res.status(hasil.error).json(hasil.body);

    res.json({
      message: `MR approved → PR ${hasil.prNumber} created`,
      pr_id: hasil.prId,
      pr_number: hasil.prNumber,
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
