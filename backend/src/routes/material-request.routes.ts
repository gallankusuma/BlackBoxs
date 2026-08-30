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
              (SELECT COUNT(*) FROM material_request_items WHERE mr_id = mr.id) as item_count,
              -- Keputusan yang belum dilihat pemohonnya. Tanpa penanda ini,
              -- satu-satunya cara mengetahui nasib permintaan adalah membuka
              -- aplikasi berulang kali dan membandingkan sendiri.
              (mr.status <> 'pending' AND mr.outcome_seen_at IS NULL) AS keputusan_baru
       FROM material_requests mr
       LEFT JOIN client_projects cp ON mr.project_id = cp.id
       WHERE mr.employee_id = ?
       ORDER BY mr.created_at DESC
       LIMIT 50`,
      [empId]
    ) as any[];
    res.json({
      data: rows,
      // Dihitung server, bukan di layar: badge yang dihitung browser akan
      // berbeda antar perangkat yang sama pemiliknya.
      belum_dibaca: rows.filter((r: any) => Number(r.keputusan_baru) === 1).length,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Tandai keputusan sudah dibaca pemohonnya.
 *
 * Dipanggil layar mobile saat daftar dibuka. Hanya menyentuh MR MILIK pemohon
 * — id dari token, bukan dari body: tanpa itu, siapa pun bisa menandai
 * permintaan orang lain sudah dibaca dan menghilangkan penandanya.
 */
router.put('/my/tandai-dibaca', mobileAuthMiddleware, async (req: MobileAuthRequest, res: Response) => {
  try {
    const upd: any = await dbRun(
      `UPDATE material_requests
         SET outcome_seen_at = NOW()
       WHERE employee_id = ? AND status <> 'pending' AND outcome_seen_at IS NULL`,
      [req.employeeId]);
    res.json({ message: 'Ditandai dibaca', jml: upd?.affectedRows || 0 });
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

    // Idempotensi untuk antrean offline.
    //
    // Perangkat membuat `client_request_id` SEKALI sebelum pengiriman pertama
    // dan memakainya ulang di tiap percobaan. Tanpa ini, kirim ulang setelah
    // RESPONS hilang — padahal server sudah menerima — menghasilkan MR kembar,
    // dan MR kembar berarti barang dipesan dua kali.
    const clientReqId = String(req.body?.client_request_id || '').trim().slice(0, 64) || null;
    if (clientReqId) {
      const sudah: any = await dbGet(
        `SELECT id, mr_number, status FROM material_requests
         WHERE employee_id = ? AND client_request_id = ?`, [empId, clientReqId]);
      if (sudah) {
        // 200, bukan 409: dari sisi perangkat ini BERHASIL — permintaannya
        // memang sudah tercatat. Menjawab galat akan membuat antrean mencoba
        // selamanya untuk sesuatu yang sudah beres.
        return res.json({
          message: 'Material Request sudah tercatat sebelumnya',
          data: { id: sudah.id, mr_number: sudah.mr_number, status: sudah.status },
          duplikat: true,
        });
      }
    }

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
        `INSERT INTO material_requests (mr_number, employee_id, employee_name, project_id, project_name, priority, needed_by, notes, client_request_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [nomor, empId, employee_name, project_id || null, projectName, priority || 'normal', needed_by || null, notes || null, clientReqId]
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
    }).catch(async (e: any) => {
      // Pagar terakhir untuk balapan: dua percobaan yang berangkat nyaris
      // bersamaan bisa sama-sama lolos pemeriksaan di atas. UNIQUE key-lah yang
      // benar-benar menahannya, dan yang kalah balapan mengembalikan MR yang
      // sudah terbentuk — bukan galat.
      if (e?.code === 'ER_DUP_ENTRY' && clientReqId) {
        const ada: any = await dbGet(
          `SELECT id, mr_number FROM material_requests
           WHERE employee_id = ? AND client_request_id = ?`, [empId, clientReqId]);
        if (ada) return { mrId: ada.id, mrNumber: ada.mr_number, duplikat: true };
      }
      throw e;
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
         SET outcome_seen_at = NULL, status = 'approved', approved_at = NOW(), linked_pr_id = ?, linked_pr_number = ?
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
/**
 * Tolak MR — dengan alasan yang WAJIB.
 *
 * Versi lama hanya menyetel status. Tim lapangan lalu tahu permintaannya
 * ditolak tanpa tahu kenapa: barang salah nama? sudah ada stok? project-nya
 * keliru? Tanpa jawaban itu mereka mengajukan ulang hal yang sama, atau
 * berhenti memakai fitur ini dan kembali menelepon — dan catatan kebutuhan
 * lapangan berhenti mencerminkan keadaan.
 *
 * Alasannya dikirim balik ke pemohon lewat `/my`, jadi ia benar-benar sampai.
 */
router.put('/:id/reject', authMiddleware, async (req: Request, res: Response) => {
  try {
    const alasan = String(req.body?.reason || req.body?.rejection_reason || '').trim();
    if (!alasan) {
      return res.status(400).json({
        error: 'Penolakan harus menyebutkan alasannya — tim lapangan perlu tahu '
             + 'apa yang harus diperbaiki.',
        code: 'ALASAN_WAJIB',
      });
    }

    const mr = await dbGet('SELECT status FROM material_requests WHERE id = ?', [req.params.id]) as any;
    if (!mr) return res.status(404).json({ error: 'MR not found' });
    if (mr.status !== 'pending') return res.status(400).json({ error: `MR already ${mr.status}` });

    // Baris terkena diperiksa: nol berarti statusnya berubah di sela pemeriksaan
    // dan penulisan — bukan "berhasil" yang tidak mengubah apa pun.
    const upd: any = await dbRun(
      `UPDATE material_requests
         SET status = 'rejected', rejection_reason = ?, rejected_by = ?, rejected_at = NOW(),
             outcome_seen_at = NULL
       WHERE id = ? AND status = 'pending'`,
      [alasan.slice(0, 500), (req as any).userId || null, req.params.id]);
    if (!upd?.affectedRows) {
      return res.status(409).json({
        error: 'Status MR berubah sebelum penolakan tersimpan. Muat ulang.',
        code: 'STATUS_BERUBAH' });
    }
    res.json({ message: 'MR rejected', rejection_reason: alasan });
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
