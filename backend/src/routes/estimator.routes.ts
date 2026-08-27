import { Router, Request, Response } from 'express';
import { calculateMto, toLegacyQuantities, FORMULA_VERSION, MtoResult } from '../modules/estimator/mto/calculator';
import { checkUnitCompatibility, isProposalEditable } from '../modules/estimator/mto/units';
import { spesifikasiField, spesifikasiOpsional, katalogElemen } from '../modules/estimator/mto/contract';
import { enrichMtoElement, groupStoredLines } from '../modules/estimator/mto/enrich';
import { rakitDokumen } from '../modules/estimator/penawaran/dokumen';
import { renderPenawaran } from '../modules/estimator/penawaran/pdf';
import { authMiddleware } from '../middleware/auth';
import { requirePermission, loadUserAccess } from '../middleware/permission';
import multer from 'multer';
import { callGeminiVision, callGeminiText } from './ai.routes';
import { dbAll, dbGet, dbRun , withTransaction, TxRunner} from '../config/database';
import { nextSequentialCode } from './procurement.routes';
import { buatKontrakDariProposal, checksumBaseline } from './contract.routes';
import { uang, bulatUang, jumlahUang } from '../utils/money';

const router = Router();

/**
 * Otorisasi modul Estimator.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * Sebelum ini seluruh route `/proposals…` hanya memakai `authMiddleware`, jadi
 * SETIAP token desktop yang sah bisa membaca seluruh harga dan identitas client,
 * mengubah RAB/MTO, men-submit, membuat Deal berikut project-nya, dan me-retry
 * handoff Procurement. Menunya memang disembunyikan lewat permission, tapi
 * URL dan API-nya tetap terbuka — penyembunyian menu bukan otorisasi.
 *
 * Nama permission-nya sudah ada di katalog boot sejak lama
 * (`estimator.estimator-proposals.{view,create,edit,delete,approve,export}`),
 * jadi ini memasang gembok yang kuncinya memang sudah dicetak.
 *
 * `approve` dipakai untuk transisi yang mengikat komersial — `submitted` dan
 * `deal` — sementara draft/review cukup `edit`. Pemisahan itu yang membuat
 * "boleh menyusun penawaran" tidak otomatis berarti "boleh mengirimkannya ke
 * pelanggan atau menjadikannya kontrak".
 * ─────────────────────────────────────────────────────────────────────────────
 */
const P_LIHAT   = 'estimator.estimator-proposals.view';
const P_BUAT    = 'estimator.estimator-proposals.create';
const P_UBAH    = 'estimator.estimator-proposals.edit';
const P_HAPUS   = 'estimator.estimator-proposals.delete';
const P_SETUJU  = 'estimator.estimator-proposals.approve';

/**
 * Sakelar penegakan.
 *
 * Menggembok modul ini SEKARANG membuat dua user aktif — `beni` dan `takbir`,
 * keduanya "Manager Finannce & Acc" yang tidak memegang satu pun permission
 * estimator — langsung menerima 403 di seluruh Estimator. Aturan project ini
 * jelas: sebelum menggembok modul live, pemetaan role produksi diverifikasi
 * dulu, dan itu keputusan pemilik proses.
 *
 * Jadi kodenya dikirim, penegakannya menunggu `ESTIMATOR_RBAC=true`.
 *
 * **Selama MATI, celahnya masih terbuka** — setiap token desktop tetap bisa
 * membaca seluruh harga penawaran. Ini penundaan sadar demi tidak memutus
 * pekerjaan orang, bukan anggapan bahwa masalahnya sudah selesai.
 */
const ESTIMATOR_RBAC_AKTIF =
  String(process.env.ESTIMATOR_RBAC || '').toLowerCase() === 'true';

const lewat = (_req: Request, _res: Response, next: any) => next();
const gembok = (...perms: string[]) =>
  ESTIMATOR_RBAC_AKTIF ? requirePermission(...perms) : lewat;

const bolehLihat  = gembok(P_LIHAT, P_UBAH, P_BUAT, P_SETUJU);
const bolehBuat   = gembok(P_BUAT, P_UBAH);
const bolehUbah   = gembok(P_UBAH);
const bolehHapus  = gembok(P_HAPUS);
const bolehSetuju = gembok(P_SETUJU);

// ============================================
// MASTER DATA ENDPOINTS
// ============================================

// Get all disciplines
router.get('/disciplines', authMiddleware, async (_req: Request, res: Response) => {
  try {
    const disciplines = await dbAll(
      `SELECT id, code, name, order_no, is_active 
       FROM master_disciplines 
       WHERE is_active = 1
       ORDER BY order_no ASC`
    );
    res.json(disciplines);
  } catch (error) {
    console.error('Error fetching disciplines:', error);
    res.status(500).json({ error: 'Failed to fetch disciplines' });
  }
});

// Get sub-disciplines by discipline
router.get('/disciplines/:disciplineId/sub-disciplines', authMiddleware, async (req: Request, res: Response) => {
  try {
    const subDisciplines = await dbAll(
      `SELECT id, discipline_id, code, name, order_no, is_active
       FROM master_sub_disciplines
       WHERE discipline_id = ? AND is_active = 1
       ORDER BY order_no ASC`,
      [req.params.disciplineId]
    );
    res.json(subDisciplines);
  } catch (error) {
    console.error('Error fetching sub-disciplines:', error);
    res.status(500).json({ error: 'Failed to fetch sub-disciplines' });
  }
});

// Create sub-discipline
router.post('/disciplines/:disciplineId/sub-disciplines', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { disciplineId } = req.params;
    const { code, name } = req.body;

    if (!code || !name) {
      return res.status(400).json({ error: 'code and name are required' });
    }

    // Check if code exists within discipline
    const existing = await dbGet(
      'SELECT id FROM master_sub_disciplines WHERE code = ? AND discipline_id = ?',
      [code, disciplineId]
    );

    if (existing) {
      return res.status(409).json({ error: 'Sub-discipline code already exists in this discipline' });
    }

    // Get max order_no
    const maxOrder = await dbGet(
      'SELECT MAX(order_no) as maxOrderId FROM master_sub_disciplines WHERE discipline_id = ?',
      [disciplineId]
    );
    const nextOrder = (maxOrder?.maxOrderId || 0) + 1;

    const result = await dbRun(
      'INSERT INTO master_sub_disciplines (discipline_id, code, name, order_no, is_active) VALUES (?, ?, ?, ?, 1)',
      [disciplineId, code, name, nextOrder]
    );

    res.status(201).json({ id: result.insertId, code, name, discipline_id: Number(disciplineId) });
  } catch (error) {
    console.error('Error creating sub-discipline:', error);
    res.status(500).json({ error: 'Failed to create sub-discipline' });
  }
});

// Get all labor
router.get('/masters/labor', authMiddleware, async (_req: Request, res: Response) => {
  try {
    const labor = await dbAll(
      `SELECT id, code, name, satuan, harga, is_active
       FROM master_labor
       WHERE is_active = 1
       ORDER BY name ASC`
    );
    res.json(labor);
  } catch (error) {
    console.error('Error fetching labor:', error);
    res.status(500).json({ error: 'Failed to fetch labor' });
  }
});

// Create labor
router.post('/masters/labor', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { code, name, satuan, harga } = req.body;

    if (!code || !name || !satuan) {
      return res.status(400).json({ error: 'code, name, and satuan are required' });
    }

    const existing = await dbGet('SELECT id FROM master_labor WHERE code = ?', [code]);
    if (existing) {
      return res.status(409).json({ error: 'Labor code already exists' });
    }

    const result = await dbRun(
      'INSERT INTO master_labor (code, name, satuan, harga, is_active) VALUES (?, ?, ?, ?, 1)',
      [code, name, satuan, harga || 0]
    );

    res.status(201).json({ id: result.insertId });
  } catch (error) {
    console.error('Error creating labor:', error);
    res.status(500).json({ error: 'Failed to create labor' });
  }
});

// Update labor
router.put('/masters/labor/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { code, name, satuan, harga } = req.body;

    if (!code || !name || !satuan) {
      return res.status(400).json({ error: 'code, name, and satuan are required' });
    }

    const existing = await dbGet('SELECT id FROM master_labor WHERE id = ?', [id]);
    if (!existing) {
      return res.status(404).json({ error: 'Labor not found' });
    }

    const duplicate = await dbGet('SELECT id FROM master_labor WHERE code = ? AND id != ?', [code, id]);
    if (duplicate) {
      return res.status(409).json({ error: 'Labor code already exists' });
    }

    await dbRun(
      'UPDATE master_labor SET code = ?, name = ?, satuan = ?, harga = ? WHERE id = ?',
      [code, name, satuan, harga || 0, id]
    );

    res.json({ message: 'Labor updated' });
  } catch (error) {
    console.error('Error updating labor:', error);
    res.status(500).json({ error: 'Failed to update labor' });
  }
});

// Delete labor (soft delete)
router.delete('/masters/labor/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const existing = await dbGet('SELECT id FROM master_labor WHERE id = ?', [id]);
    if (!existing) {
      return res.status(404).json({ error: 'Labor not found' });
    }

    await dbRun('UPDATE master_labor SET is_active = 0 WHERE id = ?', [id]);
    res.json({ message: 'Labor deleted' });
  } catch (error) {
    console.error('Error deleting labor:', error);
    res.status(500).json({ error: 'Failed to delete labor' });
  }
});

// Get all materials
router.get('/masters/materials', authMiddleware, async (_req: Request, res: Response) => {
  try {
    const materials = await dbAll(
      `SELECT m.id, m.code, m.jenis, m.name, m.satuan, m.harga, m.vendor_id, v.name as vendor_name, m.is_active
       FROM master_materials m
       LEFT JOIN vendors v ON m.vendor_id = v.id
       WHERE m.is_active = 1
       ORDER BY m.jenis ASC, m.name ASC`
    );
    res.json(materials);
  } catch (error) {
    console.error('Error fetching materials:', error);
    res.status(500).json({ error: 'Failed to fetch materials' });
  }
});

// Create material
router.post('/masters/materials', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { code, jenis, name, satuan, harga, vendor_id } = req.body;

    if (!code || !name || !satuan) {
      return res.status(400).json({ error: 'code, name, and satuan are required' });
    }

    const existing = await dbGet('SELECT id FROM master_materials WHERE code = ?', [code]);
    if (existing) {
      return res.status(409).json({ error: 'Material code already exists' });
    }

    const result = await dbRun(
      'INSERT INTO master_materials (code, jenis, name, satuan, harga, vendor_id, is_active) VALUES (?, ?, ?, ?, ?, ?, 1)',
      [code, jenis || null, name, satuan, harga || 0, vendor_id || null]
    );

    res.status(201).json({ id: result.insertId });
  } catch (error) {
    console.error('Error creating material:', error);
    res.status(500).json({ error: 'Failed to create material' });
  }
});

// Update material
router.put('/masters/materials/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { code, jenis, name, satuan, harga, vendor_id } = req.body;

    if (!code || !name || !satuan) {
      return res.status(400).json({ error: 'code, name, and satuan are required' });
    }

    const existing = await dbGet('SELECT id FROM master_materials WHERE id = ?', [id]);
    if (!existing) {
      return res.status(404).json({ error: 'Material not found' });
    }

    const duplicate = await dbGet('SELECT id FROM master_materials WHERE code = ? AND id != ?', [code, id]);
    if (duplicate) {
      return res.status(409).json({ error: 'Material code already exists' });
    }

    await dbRun(
      'UPDATE master_materials SET code = ?, jenis = ?, name = ?, satuan = ?, harga = ?, vendor_id = ? WHERE id = ?',
      [code, jenis || null, name, satuan, harga || 0, vendor_id || null, id]
    );

    res.json({ message: 'Material updated' });
  } catch (error) {
    console.error('Error updating material:', error);
    res.status(500).json({ error: 'Failed to update material' });
  }
});

// Delete material (soft delete)
router.delete('/masters/materials/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const existing = await dbGet('SELECT id FROM master_materials WHERE id = ?', [id]);
    if (!existing) {
      return res.status(404).json({ error: 'Material not found' });
    }

    await dbRun('UPDATE master_materials SET is_active = 0 WHERE id = ?', [id]);
    res.json({ message: 'Material deleted' });
  } catch (error) {
    console.error('Error deleting material:', error);
    res.status(500).json({ error: 'Failed to delete material' });
  }
});

// Get all equipment
router.get('/masters/equipment', authMiddleware, async (_req: Request, res: Response) => {
  try {
    const equipment = await dbAll(
      `SELECT e.id, e.code, e.name, e.satuan, e.harga, e.vendor_id, v.name as vendor_name, e.is_active
       FROM master_equipment e
       LEFT JOIN vendors v ON e.vendor_id = v.id
       WHERE e.is_active = 1
       ORDER BY e.name ASC`
    );
    res.json(equipment);
  } catch (error) {
    console.error('Error fetching equipment:', error);
    res.status(500).json({ error: 'Failed to fetch equipment' });
  }
});

// Create equipment
router.post('/masters/equipment', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { code, name, satuan, harga, vendor_id } = req.body;

    if (!code || !name || !satuan) {
      return res.status(400).json({ error: 'code, name, and satuan are required' });
    }

    const existing = await dbGet('SELECT id FROM master_equipment WHERE code = ?', [code]);
    if (existing) {
      return res.status(409).json({ error: 'Equipment code already exists' });
    }

    const result = await dbRun(
      'INSERT INTO master_equipment (code, name, satuan, harga, vendor_id, is_active) VALUES (?, ?, ?, ?, ?, 1)',
      [code, name, satuan, harga || 0, vendor_id || null]
    );

    res.status(201).json({ id: result.insertId });
  } catch (error) {
    console.error('Error creating equipment:', error);
    res.status(500).json({ error: 'Failed to create equipment' });
  }
});

// Update equipment
router.put('/masters/equipment/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { code, name, satuan, harga, vendor_id } = req.body;

    if (!code || !name || !satuan) {
      return res.status(400).json({ error: 'code, name, and satuan are required' });
    }

    const existing = await dbGet('SELECT id FROM master_equipment WHERE id = ?', [id]);
    if (!existing) {
      return res.status(404).json({ error: 'Equipment not found' });
    }

    const duplicate = await dbGet('SELECT id FROM master_equipment WHERE code = ? AND id != ?', [code, id]);
    if (duplicate) {
      return res.status(409).json({ error: 'Equipment code already exists' });
    }

    await dbRun(
      'UPDATE master_equipment SET code = ?, name = ?, satuan = ?, harga = ?, vendor_id = ? WHERE id = ?',
      [code, name, satuan, harga || 0, vendor_id || null, id]
    );

    res.json({ message: 'Equipment updated' });
  } catch (error) {
    console.error('Error updating equipment:', error);
    res.status(500).json({ error: 'Failed to update equipment' });
  }
});

// Delete equipment (soft delete)
router.delete('/masters/equipment/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const existing = await dbGet('SELECT id FROM master_equipment WHERE id = ?', [id]);
    if (!existing) {
      return res.status(404).json({ error: 'Equipment not found' });
    }

    await dbRun('UPDATE master_equipment SET is_active = 0 WHERE id = ?', [id]);
    res.json({ message: 'Equipment deleted' });
  } catch (error) {
    console.error('Error deleting equipment:', error);
    res.status(500).json({ error: 'Failed to delete equipment' });
  }
});

// ============================================
// AHSP ENDPOINTS
// ============================================

// Get next AHSP code
router.get('/ahsp/next-code', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { sub_discipline_id, discipline_id } = req.query;
    
    // Base query to find the last code
    let query = `
      SELECT h.kode 
      FROM ahsp_headers h
      LEFT JOIN ahsp_sub_discipline_map m ON h.id = m.ahsp_id
      WHERE h.status != 'inactive'
    `;
    
    const params: any[] = [];

    if (sub_discipline_id) {
      query += ` AND m.sub_discipline_id = ?`;
      params.push(sub_discipline_id);
    }

    query += ` ORDER BY h.id DESC LIMIT 1`;

    const last = await dbGet(query, params);
    
    if (!last || !last.kode) {
      return res.json({ nextCode: '' });
    }

    // Simple increment logic: look for the last number and increment it
    const parts = last.kode.split('.');
    const lastPart = parts[parts.length - 1];
    
    if (!isNaN(parseInt(lastPart))) {
      parts[parts.length - 1] = (parseInt(lastPart) + 1).toString();
      return res.json({ nextCode: parts.join('.') });
    }

    res.json({ nextCode: last.kode });
  } catch (error) {
    console.error('Error generating next code:', error);
    res.status(500).json({ error: 'Failed to generate next code' });
  }
});

// Delete AHSP (Soft Delete)
router.delete('/ahsp/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    console.log(`Attempting to delete AHSP with id: ${id}`);
    await dbRun("UPDATE ahsp_headers SET status = 'inactive' WHERE id = ?", [id]);
    console.log(`AHSP ${id} deleted successfully`);
    res.json({ message: 'AHSP deleted successfully' });
  } catch (error) {
    console.error('Error deleting AHSP:', error);
    res.status(500).json({ error: 'Failed to delete AHSP' });
  }
});


// GET /ahsp-categories - distinct work categories
router.get('/ahsp-categories', authMiddleware, async (_req: Request, res: Response) => {
  try {
    const cats = await dbAll(`
      SELECT work_category_code, work_category, COUNT(*) AS jumlah
      FROM ahsp_headers
      WHERE status = 'active' AND work_category IS NOT NULL
      GROUP BY work_category_code, work_category
      ORDER BY work_category_code
    `) as any[];
    res.json(cats);
  } catch (error) {
    console.error('Error fetching AHSP categories:', error);
    res.status(500).json({ error: 'Failed to fetch categories' });
  }
});

// Get AHSP list (with optional filtering by sub-discipline, category, or search)
router.get('/ahsp', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { sub_discipline_id, search, work_category } = req.query;
    
    let query = `
      SELECT DISTINCT 
        h.id, h.kode, h.name, h.satuan, h.version, h.status, h.harga_satuan,
        h.work_category, h.work_category_code,
        d.name as discipline_name,
        s.name as sub_discipline_name
      FROM ahsp_headers h
      LEFT JOIN ahsp_sub_discipline_map m ON h.id = m.ahsp_id
      LEFT JOIN master_sub_disciplines s ON m.sub_discipline_id = s.id
      LEFT JOIN master_disciplines d ON s.discipline_id = d.id
    `;
    
    const params: any[] = [];
    const conditions: string[] = [];
    
    if (sub_discipline_id) {
      conditions.push('m.sub_discipline_id = ?');
      params.push(sub_discipline_id);
    }
    
    conditions.push("h.status = 'active'");
    
    if (search) {
      conditions.push('(h.kode LIKE ? OR h.name LIKE ?)');
      params.push(`%${search}%`, `%${search}%`);
    }

    if (work_category) {
      conditions.push('h.work_category = ?');
      params.push(work_category);
    }
    
    if (conditions.length > 0) {
      query += ` WHERE ${conditions.join(' AND ')}`;
    }
    
    query += ` ORDER BY h.work_category_code ASC, h.kode ASC`;
    
    const ahsp = await dbAll(query, params);
    res.json(ahsp);
  } catch (error) {
    console.error('Error fetching AHSP:', error);
    res.status(500).json({ error: 'Failed to fetch AHSP' });
  }
});


// Get AHSP detail with items breakdown
router.get('/ahsp/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const ahsp = await dbGet(
      `SELECT h.*, sdm.sub_discipline_id
       FROM ahsp_headers h
       LEFT JOIN ahsp_sub_discipline_map sdm ON h.id = sdm.ahsp_id
       WHERE h.id = ?`,
      [req.params.id]
    );
    
    if (!ahsp) {
      return res.status(404).json({ error: 'AHSP not found' });
    }
    
    const items = await dbAll(
      `SELECT * FROM ahsp_items WHERE ahsp_id = ? ORDER BY section ASC, id ASC`,
      [req.params.id]
    );
    
    res.json({ ...ahsp, items });
  } catch (error) {
    console.error('Error fetching AHSP detail:', error);
    res.status(500).json({ error: 'Failed to fetch AHSP detail' });
  }
});

// Create AHSP
router.post('/ahsp', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { kode, name, satuan, version, status, items, discipline_id, sub_discipline_id } = req.body;
    
    if (!kode || !name || !satuan) {
      return res.status(400).json({ error: 'kode, name, and satuan are required' });
    }
    
    // Insert header
    const result = await dbRun(
      `INSERT INTO ahsp_headers (kode, name, satuan, version, status)
       VALUES (?, ?, ?, ?, ?)`,
      [kode, name, satuan, version || '2024', status || 'draft']
    );
    
    const ahspId = result.insertId;

    // Insert sub-discipline mapping
    if (sub_discipline_id) {
      await dbRun(
        'INSERT INTO ahsp_sub_discipline_map (ahsp_id, sub_discipline_id) VALUES (?, ?)',
        [ahspId, sub_discipline_id]
      );
    }
    
    // Items and Calculation
    let hargaTenaga = 0;
    let hargaBahan = 0;
    let hargaAlat = 0;

    // Insert items if provided
    if (items && Array.isArray(items)) {
      for (const item of items) {
        const jumlahHarga = (item.koefisien || 0) * (item.resource_harga || 0);
        
        await dbRun(
          `INSERT INTO ahsp_items (ahsp_id, section, resource_type, resource_id, koefisien, resource_name, resource_satuan, resource_harga, jumlah_harga)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            ahspId, 
            item.section, 
            item.resource_type || 'material', 
            item.resource_id || 0, 
            item.koefisien || 0, 
            item.resource_name, 
            item.resource_satuan, 
            item.resource_harga || 0,
            jumlahHarga
          ]
        );

        if (item.section === 'A') hargaTenaga += jumlahHarga;
        else if (item.section === 'B') hargaBahan += jumlahHarga;
        else if (item.section === 'C') hargaAlat += jumlahHarga;
      }
    }

    // Update Header Totals
    const hargaLangsung = hargaTenaga + hargaBahan + hargaAlat;
    const overheadProfit = hargaLangsung * 0.1;
    const hargaSatuan = hargaLangsung + overheadProfit;
    
    await dbRun(
      `UPDATE ahsp_headers
       SET harga_tenaga = ?, harga_bahan = ?, harga_alat = ?, 
           harga_langsung = ?, overhead_profit = ?, harga_satuan = ?
       WHERE id = ?`,
      [hargaTenaga, hargaBahan, hargaAlat, hargaLangsung, overheadProfit, hargaSatuan, ahspId]
    );
    
    res.status(201).json({ message: 'AHSP created', id: ahspId });
  } catch (error) {
    console.error('Error creating AHSP:', error);
    res.status(500).json({ error: 'Failed to create AHSP' });
  }
});

// Update AHSP
router.put('/ahsp/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const ahspId = req.params.id;
    const { kode, name, satuan, version, status, discipline_id, sub_discipline_id, items } = req.body;
    
    // Check if AHSP exists
    const existing = await dbGet('SELECT id FROM ahsp_headers WHERE id = ?', [ahspId]);
    if (!existing) {
      return res.status(404).json({ error: 'AHSP not found' });
    }
    
    // Update header
    await dbRun(
      `UPDATE ahsp_headers 
       SET kode = ?, name = ?, satuan = ?, version = ?, status = ?
       WHERE id = ?`,
      [kode, name, satuan, version || '2024', status || 'active', ahspId]
    );
    
    // Update sub-discipline mapping
    // Delete old mapping
    await dbRun('DELETE FROM ahsp_sub_discipline_map WHERE ahsp_id = ?', [ahspId]);
    
    // Insert new mapping if sub_discipline_id provided
    if (sub_discipline_id) {
      await dbRun(
        'INSERT INTO ahsp_sub_discipline_map (ahsp_id, sub_discipline_id) VALUES (?, ?)',
        [ahspId, sub_discipline_id]
      );
    }
    
    // Delete old items
    await dbRun('DELETE FROM ahsp_items WHERE ahsp_id = ?', [ahspId]);
    
    // Insert new items
    if (items && Array.isArray(items)) {
      for (const item of items) {
        const jumlahHarga = (item.koefisien || 0) * (item.resource_harga || 0);
        await dbRun(
          `INSERT INTO ahsp_items (ahsp_id, section, resource_type, resource_id, koefisien, resource_name, resource_satuan, resource_harga, jumlah_harga)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            ahspId, 
            item.section, 
            item.resource_type || 'material', 
            item.resource_id || 0, 
            item.koefisien || 0, 
            item.resource_name, 
            item.resource_satuan, 
            item.resource_harga || 0,
            jumlahHarga
          ]
        );
      }
    }
    
    // Recalculate totals
    const allItems = await dbAll(
      'SELECT section, koefisien, resource_harga FROM ahsp_items WHERE ahsp_id = ?',
      [ahspId]
    );
    
    let hargaTenaga = 0;
    let hargaBahan = 0;
    let hargaAlat = 0;
    
    allItems.forEach((item: any) => {
      const jumlah = parseFloat(item.koefisien) * parseFloat(item.resource_harga);
      if (item.section === 'A') hargaTenaga += jumlah;
      else if (item.section === 'B') hargaBahan += jumlah;
      else if (item.section === 'C') hargaAlat += jumlah;
    });
    
    const hargaLangsung = hargaTenaga + hargaBahan + hargaAlat;
    const overheadProfit = hargaLangsung * 0.1;
    const hargaSatuan = hargaLangsung + overheadProfit;
    
    await dbRun(
      `UPDATE ahsp_headers
       SET harga_tenaga = ?, harga_bahan = ?, harga_alat = ?, 
           harga_langsung = ?, overhead_profit = ?, harga_satuan = ?
       WHERE id = ?`,
      [hargaTenaga, hargaBahan, hargaAlat, hargaLangsung, overheadProfit, hargaSatuan, ahspId]
    );
    
    res.json({ message: 'AHSP updated successfully', id: ahspId });
  } catch (error) {
    console.error('Error updating AHSP:', error);
    res.status(500).json({ error: 'Failed to update AHSP' });
  }
});

// Calculate AHSP unit price (recalculate from items)
router.post('/ahsp/:id/calculate', authMiddleware, async (req: Request, res: Response) => {
  try {
    const ahspId = req.params.id;
    
    // Get all items
    const items = await dbAll(
      `SELECT section, koefisien, resource_harga FROM ahsp_items WHERE ahsp_id = ?`,
      [ahspId]
    );
    
    let harga_tenaga = 0;
    let harga_bahan = 0;
    let harga_alat = 0;
    
    items.forEach((item: any) => {
      const jumlah = parseFloat(item.koefisien) * parseFloat(item.resource_harga);
      
      if (item.section === 'A') harga_tenaga += jumlah;
      else if (item.section === 'B') harga_bahan += jumlah;
      else if (item.section === 'C') harga_alat += jumlah;
    });
    
    const harga_langsung = harga_tenaga + harga_bahan + harga_alat; // D
    const overhead_profit = harga_langsung * 0.10; // E = 10% of D
    const harga_satuan = harga_langsung + overhead_profit; // F = D + E
    
    // Update header
    await dbRun(
      `UPDATE ahsp_headers 
       SET harga_tenaga = ?, harga_bahan = ?, harga_alat = ?,
           harga_langsung = ?, overhead_profit = ?, harga_satuan = ?
       WHERE id = ?`,
      [harga_tenaga, harga_bahan, harga_alat, harga_langsung, overhead_profit, harga_satuan, ahspId]
    );
    
    res.json({
      message: 'AHSP calculated',
      calculation: {
        harga_tenaga,
        harga_bahan,
        harga_alat,
        harga_langsung,
        overhead_profit,
        harga_satuan
      }
    });
  } catch (error) {
    console.error('Error calculating AHSP:', error);
    res.status(500).json({ error: 'Failed to calculate AHSP' });
  }
});

// ============================================
// PROPOSAL ENDPOINTS
// ============================================

// Get all proposals
/**
 * EST-REG-R49: register proposal dengan pencarian, filter, dan halaman.
 *
 * Sebelumnya `SELECT p.*` mengembalikan SELURUH proposal tanpa parameter apa
 * pun, dan layar menghitung KPI-nya di browser dari array itu. Tiga akibat:
 *
 *   1. Tidak ada cara mencari nomor, project, client, atau lokasi. Operator
 *      harus memindai seluruh daftar dengan mata.
 *   2. `p.*` mengirimkan `design_params` dan seluruh kolom komersial ke layar
 *      daftar yang hanya memerlukan sebagian — payload dan permukaan datanya
 *      lebih besar daripada yang dibutuhkan.
 *   3. KPI dihitung dari halaman yang sedang dimuat, dan `no_deal` tidak punya
 *      kartu sama sekali — jadi **Total tidak harus sama dengan jumlah kartu
 *      status**. Angka yang tidak rekonsiliasi lebih buruk daripada tidak ada
 *      angka.
 *
 * Faset sekarang dihitung SERVER dari scope+filter yang sama, bukan dari
 * halaman, sehingga jumlahnya selalu rekonsiliasi ke Total. Status di luar enum
 * masuk bucket `lainnya` dan tetap terhitung — data lama tidak disembunyikan.
 */
const STATUS_PROPOSAL = ['draft', 'review', 'submitted', 'deal', 'no_deal'];
const URUTAN_REGISTER: Record<string, string> = {
  created_at: 'p.created_at',
  total_project: 'p.total_project',
  proposal_number: 'p.proposal_number',
  project_name: 'p.project_name',
  status: 'p.status',
};

router.get('/proposals', authMiddleware, bolehLihat, async (req: Request, res: Response) => {
  try {
    const q = String(req.query.q || '').trim();
    const statusMinta = String(req.query.status || '').split(',').map(x => x.trim()).filter(Boolean);
    // Hanya status yang dikenal yang diterima — nilai karangan akan diam-diam
    // menghasilkan daftar kosong dan terlihat seperti register yang memang kosong.
    const status = statusMinta.filter(x => STATUS_PROPOSAL.includes(x));
    const statusDitolak = statusMinta.filter(x => !STATUS_PROPOSAL.includes(x));
    if (statusDitolak.length) {
      return res.status(400).json({
        error: `Status tidak dikenal: ${statusDitolak.join(', ')}`,
        code: 'STATUS_TIDAK_DIKENAL',
        status_dikenal: STATUS_PROPOSAL,
      });
    }

    const kolomUrut = URUTAN_REGISTER[String(req.query.sort || 'created_at')];
    if (!kolomUrut) {
      return res.status(400).json({
        error: `Pengurutan "${req.query.sort}" tidak didukung.`,
        code: 'SORT_TIDAK_DIDUKUNG',
        sort_didukung: Object.keys(URUTAN_REGISTER),
      });
    }
    const arah = String(req.query.dir || 'desc').toLowerCase() === 'asc' ? 'ASC' : 'DESC';

    const limitMinta = Number(req.query.limit);
    const limit = Number.isFinite(limitMinta) && limitMinta > 0 ? Math.min(Math.floor(limitMinta), 200) : 50;
    const offsetMinta = Number(req.query.offset);
    const offset = Number.isFinite(offsetMinta) && offsetMinta > 0 ? Math.floor(offsetMinta) : 0;

    const syarat: string[] = [];
    const nilai: any[] = [];
    if (q) {
      syarat.push(`(p.proposal_number LIKE ? OR p.project_name LIKE ? OR p.client LIKE ? OR p.lokasi LIKE ?)`);
      const pola = `%${q}%`;
      nilai.push(pola, pola, pola, pola);
    }
    if (status.length) {
      syarat.push(`p.status IN (${status.map(() => '?').join(',')})`);
      nilai.push(...status);
    }
    const where = syarat.length ? `WHERE ${syarat.join(' AND ')}` : '';

    // Faset dihitung dari scope+filter pencarian, TAPI tanpa filter status —
    // supaya kartu status tetap memperlihatkan seluruh sebaran saat satu status
    // sedang dipilih, dan Total tetap bisa direkonsiliasi.
    const syaratFaset = q ? `WHERE (p.proposal_number LIKE ? OR p.project_name LIKE ? OR p.client LIKE ? OR p.lokasi LIKE ?)` : '';
    const nilaiFaset = q ? [`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`] : [];
    const faseRows: any[] = await dbAll(
      `SELECT COALESCE(p.status, 'lainnya') AS status, COUNT(*) AS n
       FROM proposals p ${syaratFaset} GROUP BY COALESCE(p.status, 'lainnya')`, nilaiFaset);

    const faset: Record<string, number> = {};
    for (const st of STATUS_PROPOSAL) faset[st] = 0;
    faset.lainnya = 0;
    for (const r of faseRows) {
      const st = String(r.status);
      if (st in faset) faset[st] += Number(r.n);
      else faset.lainnya += Number(r.n);   // status legacy di luar enum tetap terhitung
    }
    const totalScope = Object.values(faset).reduce((a, b) => a + b, 0);

    const jml: any = await dbGet(
      `SELECT COUNT(*) AS n FROM proposals p ${where}`, nilai);

    // DTO daftar: hanya kolom yang benar-benar dirender tabel. `design_params`
    // dan rincian komersial lain hanya lewat endpoint detail.
    //
    // `LIMIT`/`OFFSET` disisipkan sebagai angka, bukan sebagai parameter:
    // MySQL menolak `LIMIT ?` pada prepared statement
    // (`Incorrect arguments to mysqld_stmt_execute`). Aman karena keduanya
    // sudah dipaksa menjadi integer non-negatif di atas — nilai dari klien
    // tidak pernah sampai ke SQL apa adanya. `kolomUrut` juga berasal dari
    // allowlist, bukan dari input.
    const items = await dbAll(
      `SELECT p.id, p.proposal_number, p.project_name, p.client, p.client_id, p.lokasi,
              p.revision, p.status, p.proposal_type, p.total_project, p.project_id,
              p.created_at, p.updated_at, p.submitted_at, p.deal_at,
              u.username AS created_by_name
       FROM proposals p
       LEFT JOIN users u ON p.created_by = u.id
       ${where}
       ORDER BY ${kolomUrut} ${arah}, p.id ${arah}
       LIMIT ${limit} OFFSET ${offset}`,
      nilai
    );

    res.json({
      items,
      total: Number(jml?.n || 0),
      total_scope: totalScope,
      faset,
      limit,
      offset,
      // Tanpa ini layar harus menebak apakah masih ada halaman berikutnya.
      has_more: offset + items.length < Number(jml?.n || 0),
      filter: { q, status, sort: String(req.query.sort || 'created_at'), dir: arah.toLowerCase() },
    });
  } catch (error) {
    console.error('Error fetching proposals:', error);
    res.status(500).json({ error: 'Failed to fetch proposals' });
  }
});

// Get proposal detail
router.get('/proposals/:id', authMiddleware, bolehLihat, async (req: Request, res: Response) => {
  try {
    const proposal = await dbGet(
      `SELECT p.*, u.username as created_by_name
       FROM proposals p
       LEFT JOIN users u ON p.created_by = u.id
       WHERE p.id = ?`,
      [req.params.id]
    );
    
    if (!proposal) {
      return res.status(404).json({ error: 'Proposal not found' });
    }
    
    res.json(proposal);
  } catch (error) {
    console.error('Error fetching proposal:', error);
    res.status(500).json({ error: 'Failed to fetch proposal' });
  }
});

// Get proposal items (grouped by discipline & sub-discipline)
router.get('/proposals/:id/items', authMiddleware, bolehLihat, async (req: Request, res: Response) => {
  try {
    const items = await dbAll(
      `SELECT 
        pi.*,
        d.code as discipline_code, d.name as discipline_name,
        sd.code as sub_discipline_code, sd.name as sub_discipline_name
       FROM proposal_items pi
       LEFT JOIN master_disciplines d ON pi.discipline_id = d.id
       LEFT JOIN master_sub_disciplines sd ON pi.sub_discipline_id = sd.id
       WHERE pi.proposal_id = ?
       ORDER BY pi.order_no ASC, pi.id ASC`,
      [req.params.id]
    );
    
    const parsedItems = (items as any[]).map((item: any) => ({
      ...item,
      mto_link: item.mto_link
        ? (typeof item.mto_link === 'string' ? JSON.parse(item.mto_link) : item.mto_link)
        : null
    }));
    res.json(parsedItems);
  } catch (error) {
    console.error('Error fetching proposal items:', error);
    res.status(500).json({ error: 'Failed to fetch proposal items' });
  }
});


// ============================================
// SCHEDULE / MASTER SCHEDULE ENDPOINT
// ============================================
// GET /proposals/:id/schedule
// Returns WBS structure with duration calculated from AHSP labor (Section A) × qty
router.get('/proposals/:id/schedule', authMiddleware, bolehLihat, async (req: Request, res: Response) => {
  try {
    const proposalId    = req.params.id;
    const workersPerDay = parseFloat(req.query.workers_per_day as string) || 8;
    const hoursPerDay   = parseFloat(req.query.hours_per_day  as string) || 8;
    const startDateStr  = req.query.start_date as string || null; // e.g. '2026-01-01'

    // Load all overrides for this proposal's items
    const overrideRows = await dbAll(
      `SELECT so.proposal_item_id, so.start_day_override, so.duration_days_override, so.is_pinned
       FROM schedule_overrides so
       JOIN proposal_items pi ON pi.id = so.proposal_item_id
       WHERE pi.proposal_id = ?`,
      [proposalId]
    ) as any[];
    const overrideMap: Record<number, any> = {};
    for (const o of overrideRows) overrideMap[o.proposal_item_id] = o;

    // Helper: convert day offset to calendar date
    const toCalendarDate = (dayOffset: number): string | null => {
      if (!startDateStr) return null;
      const d = new Date(startDateStr);
      d.setDate(d.getDate() + Math.round(dayOffset));
      return d.toISOString().slice(0, 10);
    };

    const proposalItems = await dbAll(
      `SELECT pi.id, pi.is_section, pi.ahsp_id, pi.ahsp_code_snapshot as kode,
              pi.ahsp_name_snapshot as name, pi.qty, pi.unit_snapshot as unit,
              pi.unit_price_snapshot, pi.total_price, pi.order_no, pi.section_label,
              pi.description
       FROM proposal_items pi
       WHERE pi.proposal_id = ?
       ORDER BY pi.order_no ASC, pi.id ASC`,
      [proposalId]
    ) as any[];

    // 2. For each non-section item that has an AHSP, fetch Section A (labor) sub-items
    const wbs: any[] = [];
    let cumulativeDays = 0;

    for (const item of proposalItems) {
      if (item.is_section) {
        wbs.push({
          id: `section-${item.id}`,
          type: 'section',
          kode: item.kode,
          name: item.name,
          description: item.description,
          start_day: cumulativeDays,
          duration_days: 0,
          labor_total_oh: 0,
          labor_components: []
        });
        continue;
      }

      let laborComponents: any[] = [];
      let laborTotalOH = 0;

      if (item.ahsp_id) {
        // 1. Get total labor duration from Section A (sum of all OH)
        const laborItems = await dbAll(
          `SELECT resource_name, resource_satuan, koefisien
           FROM ahsp_items
           WHERE ahsp_id = ? AND section = 'A'
           ORDER BY id ASC`,
          [item.ahsp_id]
        ) as any[];

        const qty = parseFloat(item.qty) || 0;

        // Calculate total OH and total labor duration
        let totalOH = 0;
        let totalLaborDays = 0;
        for (const li of laborItems) {
          const koef = parseFloat(li.koefisien) || 0;
          const oh = koef * qty;
          const satuan = (li.resource_satuan || '').toUpperCase();
          const days = satuan === 'OJ'
            ? oh / (workersPerDay * hoursPerDay)
            : oh / workersPerDay;
          totalOH += oh;
          totalLaborDays += days; // sum for sequential baseline
        }
        laborTotalOH = Math.round(totalOH * 100) / 100;

        // 2. Get AHSP work_category for template lookup
        const ahspHeader = await dbGet(
          `SELECT work_category FROM ahsp_headers WHERE id = ?`,
          [item.ahsp_id]
        ) as any;
        const workCategory = ahspHeader?.work_category || '';

        // 3. Lookup WBS work-sequence steps for this category
        const wbsSteps = await dbAll(
          `SELECT step_order, step_code, step_name, duration_pct
           FROM ahsp_wbs_templates
           WHERE work_category = ? OR ahsp_id = ?
           ORDER BY COALESCE(ahsp_id, 999999), step_order ASC`,
          [workCategory, item.ahsp_id]
        ) as any[];

        // 4. Build labor_components from WBS steps (or fallback to raw labor resources)
        let seqOffset = 0;
        if (wbsSteps.length > 0) {
          // Use WBS work-sequence template
          laborComponents = wbsSteps.map((step: any) => {
            const pct = parseFloat(step.duration_pct) || 0;
            const stepDays = Math.round((totalLaborDays * pct / 100) * 100) / 100;
            const stepOH = Math.round((totalOH * pct / 100) * 100) / 100;
            const obj = {
              resource_name: step.step_name,
              resource_satuan: step.step_code,
              koefisien: pct,
              total_oh: stepOH,
              duration_days: stepDays,
              start_offset: Math.round(seqOffset * 100) / 100,
              is_wbs_step: true
            };
            seqOffset += stepDays;
            return obj;
          });
        } else {
          // Fallback: use raw labor resources (Mandor, Tukang, etc.)
          laborComponents = laborItems.map((li: any) => {
            const koef = parseFloat(li.koefisien) || 0;
            const oh = koef * qty;
            const satuan = (li.resource_satuan || '').toUpperCase();
            const days = Math.round((satuan === 'OJ'
              ? oh / (workersPerDay * hoursPerDay)
              : oh / workersPerDay) * 100) / 100;
            const obj = {
              resource_name: li.resource_name,
              resource_satuan: li.resource_satuan,
              koefisien: koef,
              total_oh: oh,
              duration_days: days,
              start_offset: Math.round(seqOffset * 100) / 100,
              is_wbs_step: false
            };
            seqOffset += days;
            return obj;
          });
        }

        const autoStartDay = cumulativeDays;
        const autoItemDuration = Math.round(seqOffset * 100) / 100;

        const propItemId = parseInt(item.id, 10) || 0;
        const ov = overrideMap[item.id] || overrideMap[propItemId];
        const finalStartDay   = ov?.start_day_override   != null ? parseFloat(ov.start_day_override)   : autoStartDay;
        const finalDuration   = ov?.duration_days_override != null ? parseFloat(ov.duration_days_override) : autoItemDuration;
        const isPinned = ov?.is_pinned ? true : false;

        wbs.push({
          id: `item-${item.id}`,
          type: 'item',
          kode: item.kode,
          name: item.name,
          qty,
          unit: item.unit,
          unit_price: parseFloat(item.unit_price_snapshot) || 0,
          total_price: parseFloat(item.total_price) || 0,
          start_day: finalStartDay,
          duration_days: finalDuration,
          auto_start_day: autoStartDay,
          auto_duration_days: autoItemDuration,
          is_overridden: ov != null,
          is_pinned: isPinned,
          start_date: toCalendarDate(finalStartDay),
          end_date: toCalendarDate(finalStartDay + finalDuration),
          labor_total_oh: laborTotalOH,
          work_category: workCategory,
          labor_components: laborComponents
        });

        // For serial cascade: only advance cursor if not pinned (pinned items float freely)
        if (!isPinned) cumulativeDays = Math.max(cumulativeDays, finalStartDay + finalDuration);
        else cumulativeDays += autoItemDuration;


      } else {
        // No AHSP assigned yet
        const propItemId2 = parseInt(item.id, 10) || 0;
        const ov2 = overrideMap[item.id] || overrideMap[propItemId2];
        const finalStartDay2 = ov2?.start_day_override != null ? parseFloat(ov2.start_day_override) : cumulativeDays;
        const finalDuration2 = ov2?.duration_days_override != null ? parseFloat(ov2.duration_days_override) : 0;
        wbs.push({
          id: `item-${item.id}`,
          type: 'item',
          kode: item.kode,
          name: item.name,
          qty: parseFloat(item.qty) || 0,
          unit: item.unit,
          unit_price: parseFloat(item.unit_price_snapshot) || 0,
          total_price: parseFloat(item.total_price) || 0,
          start_day: finalStartDay2,
          duration_days: finalDuration2,
          auto_start_day: cumulativeDays,
          auto_duration_days: 0,
          is_overridden: ov2 != null,
          start_date: toCalendarDate(finalStartDay2),
          end_date: toCalendarDate(finalStartDay2 + finalDuration2),
          labor_total_oh: 0,
          labor_components: []
        });
      }
    }

    const totalDurationDays = cumulativeDays;

    // Build per-unit breakdown for discrete items and attach existing progress
    const DISCRETE_UNITS = ['bh','buah','unit','titik','set','ls','lot','pcs','lbr','btg',
                            'tiang','kolom','balok','pintu','jendela','blok','panel','tb'];

    for (const wbsItem of wbs) {
      if (wbsItem.type !== 'item' || wbsItem.qty <= 0 || wbsItem.labor_components.length === 0) continue;
      const unitLower = (wbsItem.unit || '').toLowerCase().trim();
      const isDiscrete = DISCRETE_UNITS.some(u => unitLower === u || unitLower.startsWith(u));
      const qtyInt = Math.round(wbsItem.qty);
      if (!isDiscrete || qtyInt < 2 || qtyInt > 100) continue;

      // Fetch existing progress for this item
      const propItemId = parseInt(wbsItem.id.replace('item-', ''), 10);
      const progRows = await dbAll(
        `SELECT unit_number, step_code, status FROM schedule_progress WHERE proposal_item_id = ?`,
        [propItemId]
      ) as any[];
      const progMap: Record<string, string> = {};
      for (const p of progRows) progMap[`${p.unit_number}__${p.step_code}`] = p.status;

      // Per-unit duration = item total duration / qty
      const perUnitDays = Math.round((wbsItem.duration_days / qtyInt) * 100) / 100;

      const units = [];
      for (let u = 1; u <= qtyInt; u++) {
        const unitStartDay = wbsItem.start_day + (u - 1) * perUnitDays;
        const steps = wbsItem.labor_components.map((lc: any) => ({
          step_code: lc.resource_satuan || String(u),
          step_name: lc.resource_name,
          duration_days: Math.round((lc.duration_days / qtyInt) * 100) / 100,
          start_offset: Math.round((lc.start_offset / qtyInt * (u - 1) + lc.start_offset) * 100) / 100 - (lc.start_offset),
          status: progMap[`${u}__${lc.resource_satuan}`] || 'pending'
        }));
        // Recompute sequential offsets within this unit
        let off = 0;
        for (const s of steps) { s.start_offset = Math.round(off * 100) / 100; off += s.duration_days; }
        units.push({
          unit_number: u,
          label: `${wbsItem.unit} #${u}`,
          start_day: Math.round(unitStartDay * 100) / 100,
          duration_days: perUnitDays,
          steps
        });
      }
      wbsItem.units = units;
      wbsItem.is_qty_breakdown = true;
    }

    res.json({
      proposal_id: proposalId,
      settings: { workers_per_day: workersPerDay, hours_per_day: hoursPerDay },
      total_duration_days: Math.round(totalDurationDays * 100) / 100,
      wbs
    });

  } catch (error) {
    console.error('Error generating schedule:', error);
    res.status(500).json({ error: 'Failed to generate schedule' });
  }
});

/**
 * Batas nilai jadwal yang masuk akal untuk pekerjaan konstruksi.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * `schedule_overrides` menyimpan `DECIMAL(10,2)`, jadi kolomnya sanggup menerima
 * sekitar 99.999.999 hari — dan route-nya dulu menuliskannya apa adanya. Payment
 * Schedule kemudian berjalan bulan demi bulan sepanjang rentang itu.
 *
 * Terukur di dev, bukan diperkirakan: satu override durasi 99.999.999 hari
 * membuat satu permintaan payment-schedule berjalan **80,7 detik** dan
 * membentuk **3.284.816 objek bulan**. Nilainya TERSIMPAN, jadi setiap
 * pembukaan tab berikutnya mengulang beban yang sama — satu proposal draft
 * cukup untuk membuat backend monolitik ini tidak responsif.
 *
 * Batasnya dipilih longgar tapi nyata: 10 tahun. Pekerjaan konstruksi dengan
 * satu aktivitas berdurasi lebih dari itu tidak ada, dan 10 tahun tetap hanya
 * 120 iterasi bulan.
 * ─────────────────────────────────────────────────────────────────────────────
 */
const MAX_HARI_JADWAL = 3650;

/**
 * Sakelar gerbang "baris belum lengkap" (lihat `gerbangKomersial`).
 *
 * Default MATI. Nyalakan dengan `GERBANG_SCOPE_LENGKAP=true` di `.env` setelah
 * proposal berjalan dibereskan atau baris-barisnya dinyatakan.
 */
const GERBANG_SCOPE_AKTIF =
  String(process.env.GERBANG_SCOPE_LENGKAP || '').toLowerCase() === 'true';

/** Angka jadwal: berhingga, tidak negatif, dan dalam batas wajar. */
const angkaJadwal = (raw: unknown, nama: string): { ok: boolean; nilai: number | null; pesan: string } => {
  if (raw === null || raw === undefined || raw === '') return { ok: true, nilai: null, pesan: '' };
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(n)) return { ok: false, nilai: null, pesan: `${nama} harus berupa angka` };
  if (n < 0) return { ok: false, nilai: null, pesan: `${nama} tidak boleh negatif` };
  if (n > MAX_HARI_JADWAL) {
    return { ok: false, nilai: null, pesan: `${nama} melebihi batas wajar (${MAX_HARI_JADWAL} hari ≈ 10 tahun)` };
  }
  return { ok: true, nilai: n, pesan: '' };
};

/**
 * Pastikan item benar-benar milik proposal yang disebut di URL.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * Route schedule dulu tidak pernah mengikat id anak ke id induknya: `PUT`
 * menerima `proposal_item_id` dari body dan `DELETE`/`GET` memakai `:itemId`
 * saja, sementara `:id` di URL tidak dipakai untuk apa pun. Siapa pun yang
 * terautentikasi dan menebak id item bisa membaca atau menimpa jadwal proposal
 * milik orang lain — cukup dengan menyebut proposal-nya sendiri di URL.
 *
 * Kedua tabel juga tidak punya foreign key ke `proposal_items`, jadi tidak ada
 * jaring pengaman di lapisan database sama sekali.
 * ─────────────────────────────────────────────────────────────────────────────
 */
/**
 * Batas atas quantity satu baris RAB.
 *
 * Bukan aturan bisnis, melainkan jaring pengaman terhadap angka yang jelas bukan
 * kuantitas konstruksi — mis. hasil salah ketik atau nilai yang lolos dari
 * konversi. Cukup longgar untuk pekerjaan sebesar apa pun di sistem ini.
 */
const MAX_QTY = 1_000_000_000;

/**
 * Quantity harus berupa bilangan berhingga dan tidak negatif.
 *
 * `qty || 0` dan `parseFloat(qty) || 0` menerima apa saja: `-1` diteruskan apa
 * adanya lalu dikalikan harga snapshot sehingga line total dan `total_project`
 * menjadi negatif, sementara `"abc"`, `NaN`, dan `Infinity` diam-diam berubah
 * menjadi 0 tanpa ada yang tahu nilainya pernah salah.
 *
 * Nol tetap diizinkan: baris berkuantitas nol adalah keadaan sah pada draft yang
 * belum lengkap. Yang dijaga di gerbang submit adalah totalnya, bukan tiap baris.
 */
// `strictNullChecks` mati di project ini, jadi union berdiskriminan tidak
// dipersempit oleh `if (!hasil.ok)`. Bentuknya dibuat satu objek saja.
const validasiQty = (raw: unknown): { ok: boolean; qty: number; pesan: string } => {
  if (raw === null || raw === undefined || raw === '') return { ok: true, qty: 0, pesan: '' };
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(n)) return { ok: false, qty: 0, pesan: 'qty harus berupa angka' };
  if (n < 0) return { ok: false, qty: 0, pesan: 'qty tidak boleh negatif' };
  if (n > MAX_QTY) return { ok: false, qty: 0, pesan: `qty melebihi batas wajar (${MAX_QTY.toLocaleString('id-ID')})` };
  return { ok: true, qty: n, pesan: '' };
};

/**
 * Tentukan isi satu baris RAB dari child template wizard.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * Wizard mengirim `volume`, `unit`, `ahsp_id`, `ahsp_code`, `unit_price`, dan
 * `total` untuk tiap child — hasil kalkulator dan pilihan AHSP pengguna. Backend
 * dulu MEMBUANG semuanya: ia mencocokkan ulang AHSP hanya dari `child.name`
 * yang persis sama, lalu menyisipkan baris dengan `qty = 0` dan
 * `total_price = 0`.
 *
 * Jadi pengguna mengisi volume di wizard, menekan simpan, menerima 201 — dan
 * angkanya tidak pernah ada. Inilah asal ratusan baris berkuantitas nol di
 * produksi (PROP/2026/0001: 144 dari 182 baris; PROP/2026/0003: 254 dari 305),
 * yang belakangan muncul lagi sebagai temuan "proposal campuran".
 *
 * Pembagian kepercayaannya tetap dijaga: **identitas dan kuantitas** boleh
 * datang dari klien, **harga** tidak pernah — ia selalu diambil dari master
 * AHSP, dan `total_price` dihitung di server. Prinsip yang sama dengan nama
 * client yang harus kanonik.
 * ─────────────────────────────────────────────────────────────────────────────
 */
const barisDariTemplate = async (
  child: any, section: any, ahspLookup: Record<string, any>,
  get: (sql: string, p?: any[]) => Promise<any>
) => {
  // Pilihan eksplisit pengguna menang atas pencocokan nama.
  let ahsp: any = null;
  if (child?.ahsp_id) {
    ahsp = await get(
      `SELECT id, kode, name, satuan, harga_satuan FROM ahsp_headers WHERE id = ? AND status = 'active'`,
      [child.ahsp_id]
    );
  }
  if (!ahsp && child?.ahsp_code) {
    ahsp = await get(
      `SELECT id, kode, name, satuan, harga_satuan FROM ahsp_headers WHERE kode = ? AND status = 'active'`,
      [child.ahsp_code]
    );
  }
  if (!ahsp) ahsp = ahspLookup[child?.name] || null;

  // Volume dari wizard dipakai, tapi tetap lewat validasi yang sama dengan
  // input manual — angka liar tidak boleh masuk lewat pintu template.
  const cek = validasiQty(child?.volume);
  const qty = cek.ok ? cek.qty : 0;

  const harga = ahsp ? uang(ahsp.harga_satuan) : 0;

  return {
    ahspId: ahsp ? ahsp.id : null,
    ahspCode: ahsp ? ahsp.kode : `${section.code}.${child?.num ?? ''}`.replace(/\.$/, ''),
    ahspName: ahsp ? ahsp.name : child?.name,
    ahspUnit: ahsp ? ahsp.satuan : (child?.unit || ''),
    harga,
    qty,
    // Dihitung di server. `child.total` dari klien sengaja tidak dipercaya.
    total: bulatUang(qty * harga),
  };
};

/**
 * Selaraskan pasangan `client` (label) dan `client_id` (pihak yang mengikat).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * Keduanya dulu ditulis apa adanya dari body. Foreign key hanya membuktikan
 * id-nya ADA, bukan bahwa labelnya menunjuk pihak yang sama — jadi proposal bisa
 * bertuliskan "PT B" sementara `client_id`-nya menunjuk PT A.
 *
 * Itu bukan cacat kosmetik: saat Deal, yang dipakai membuat project adalah
 * `client_id`. Penawaran yang ditandatangani atas nama satu pihak berakhir
 * menjadi project, entri CRM, dan dasar penagihan milik pihak LAIN.
 *
 * Aturannya sekarang: kalau `client_id` diberikan, namanya diambil kanonik dari
 * tabel `clients` — label tidak bisa menyimpang dari relasinya. Kalau id-nya
 * kosong, nama bebas tetap boleh (client belum terdaftar), tapi relasinya juga
 * ikut kosong.
 * ─────────────────────────────────────────────────────────────────────────────
 */
const selaraskanClient = async (
  clientId: any, namaBebas: any, get: (sql: string, p?: any[]) => Promise<any>
): Promise<{ ok: boolean; client_id: number | null; client: string | null; pesan?: string }> => {
  if (clientId === undefined || clientId === null || clientId === '') {
    return { ok: true, client_id: null, client: namaBebas ? String(namaBebas) : null };
  }
  const row: any = await get('SELECT id, name FROM clients WHERE id = ?', [clientId]);
  if (!row) {
    return { ok: false, client_id: null, client: null,
             pesan: `Client dengan id ${clientId} tidak ditemukan.` };
  }
  // Nama kanonik menang. Label yang dikirim klien tidak pernah dipercaya.
  return { ok: true, client_id: Number(row.id), client: row.name };
};

/**
 * Syarat minimum sebuah proposal boleh dikirim atau dijadikan kontrak.
 *
 * Mengembalikan `null` kalau lolos, atau body error 400 yang menyebutkan
 * **semua** pelanggaran sekaligus — supaya estimator tidak menemukannya satu per
 * satu lewat percobaan berulang.
 */
/**
 * PROP-REV-R52: bekukan satu revisi saat proposal diterbitkan.
 *
 * Dipanggil pada transisi ke `submitted`, DI DALAM transaction yang sama.
 * Sebelum ini, mengembalikan proposal ke `review` lalu men-submit-nya lagi
 * menimpa baris yang sama dan menulis ulang `submitted_at` — versi yang pernah
 * diterima client tidak bisa direkonstruksi sama sekali, padahal itulah yang
 * dipegang saat terjadi sengketa lingkup atau harga.
 *
 * Revisi lama TIDAK diubah, hanya ditandai `superseded`. Potretnya disimpan,
 * bukan dibaca ulang dari `proposals`: kalau dibaca ulang, revisi lama ikut
 * berubah setiap kali headernya disunting dan potretnya berhenti menjadi potret.
 */
async function bekukanRevisi(
  proposalId: any, proposal: any, userId: any, tx: TxRunner
): Promise<{ id: number; nomor: number; checksum: string }> {
  const items: any[] = await tx.all(
    `SELECT id, is_section, section_label, section_order, order_no,
            ahsp_code_snapshot, ahsp_name_snapshot, description,
            unit_snapshot, unit_price_snapshot, qty, total_price
     FROM proposal_items WHERE proposal_id = ?
     ORDER BY section_order IS NULL, section_order, is_section DESC, order_no, id`,
    [proposalId]
  );

  const baris = items.map((it: any, i: number) => ({
    line_no: i + 1,
    is_section: Number(it.is_section) === 1 ? 1 : 0,
    section_label: it.section_label || null,
    ahsp_code: it.ahsp_code_snapshot || null,
    description: it.description || it.ahsp_name_snapshot || null,
    unit: it.unit_snapshot || null,
    qty: bulatUang(it.qty),
    unit_price: bulatUang(it.unit_price_snapshot),
    amount: bulatUang(it.total_price),
    source_item_id: it.id,
  }));
  const checksum = checksumBaseline(baris);

  // Revisi sebelumnya ditandai digantikan — tidak dihapus, tidak diubah isinya.
  await tx.run(
    `UPDATE proposal_revisions SET status = 'superseded', superseded_at = NOW()
     WHERE proposal_id = ? AND status = 'issued'`, [proposalId]);

  const maks: any = await tx.get(
    'SELECT COALESCE(MAX(revision_no), 0) AS n FROM proposal_revisions WHERE proposal_id = ? FOR UPDATE',
    [proposalId]);
  const nomor = Number(maks?.n || 0) + 1;

  const res = await tx.run(
    `INSERT INTO proposal_revisions
      (proposal_id, revision_no, status, project_name, client_name, lokasi, proposal_type,
       direct_cost, overhead, risk_contingency, total_project, design_params,
       lines_checksum, line_count, issued_at, issued_by)
     VALUES (?, ?, 'issued', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), ?)`,
    [proposalId, nomor, proposal.project_name || null, proposal.client || null,
     proposal.lokasi || null, proposal.proposal_type || null,
     bulatUang(proposal.direct_cost), bulatUang(proposal.overhead),
     bulatUang(proposal.risk_contingency), bulatUang(proposal.total_project),
     typeof proposal.design_params === 'string'
       ? proposal.design_params
       : (proposal.design_params ? JSON.stringify(proposal.design_params) : null),
     checksum, baris.length, userId || null]
  );
  const revId = res.insertId;

  for (const b of baris) {
    await tx.run(
      `INSERT INTO proposal_revision_lines
        (revision_id, line_no, is_section, section_label, ahsp_code, description,
         unit, qty, unit_price, amount, source_item_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [revId, b.line_no, b.is_section, b.section_label, b.ahsp_code, b.description,
       b.unit, b.qty, b.unit_price, b.amount, b.source_item_id]
    );
  }

  return { id: revId, nomor, checksum };
}

/**
 * Catat satu peristiwa ke `proposal_audit_logs`.
 *
 * Tabelnya sudah lama ada, tapi pencarian source menemukan **nol** INSERT
 * maupun pembacaan — jadi tidak ada satu pun history bisnis yang bisa
 * diverifikasi. Ditulis sekarang untuk transisi status dan penerbitan revisi.
 */
async function catatAudit(
  tx: TxRunner, proposalId: any, userId: any,
  action: string, field: string | null, sebelum: any, sesudah: any
): Promise<void> {
  await tx.run(
    `INSERT INTO proposal_audit_logs
      (proposal_id, user_id, action, field_name, before_value, after_value)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [proposalId, userId || null, action.slice(0, 50), field ? field.slice(0, 100) : null,
     sebelum === null || sebelum === undefined ? null : String(sebelum).slice(0, 4000),
     sesudah === null || sesudah === undefined ? null : String(sesudah).slice(0, 4000)]
  );
}

const gerbangKomersial = async (
  proposalId: any, proposal: any, tx: TxRunner
): Promise<{ error: string; code: string; pelanggaran: string[] } | null> => {
  const pelanggaran: string[] = [];

  const ringkas: any = await tx.get(
    `SELECT COUNT(*) AS jml,
            COALESCE(SUM(total_price), 0) AS jumlah_baris,
            SUM(qty < 0) AS qty_negatif,
            SUM(unit_price_snapshot < 0) AS harga_negatif,
            SUM(total_price < 0) AS total_negatif
     FROM proposal_items
     WHERE proposal_id = ? AND is_section = 0`,
    [proposalId]
  );

  if (Number(ringkas?.jml || 0) === 0) {
    pelanggaran.push('Proposal belum memiliki satu pun item pekerjaan.');
  }
  if (Number(ringkas?.qty_negatif || 0) > 0) {
    pelanggaran.push(`${ringkas.qty_negatif} item berkuantitas negatif.`);
  }
  if (Number(ringkas?.harga_negatif || 0) > 0) {
    pelanggaran.push(`${ringkas.harga_negatif} item berharga satuan negatif.`);
  }
  if (Number(ringkas?.total_negatif || 0) > 0) {
    pelanggaran.push(`${ringkas.total_negatif} item bernilai total negatif.`);
  }

  // EST-MTO-R38: tautan RAB→MTO wajib menunjuk baris tersimpan yang sah dan
  // sama angkanya. Tanpa ini, gerbang hanya merekonsiliasi total komersial —
  // dua angka resmi untuk scope yang sama tidak pernah menjadi pelanggaran.
  pelanggaran.push(...await periksaTautanMto(proposalId, tx));

  const total = uang(proposal.total_project);
  if (!(total > 0)) {
    pelanggaran.push(`Nilai penawaran ${total} — harus lebih besar dari nol sebelum dikirim.`);
  }

  // Baris yang belum lengkap TIDAK boleh ikut menjadi lingkup kontrak diam-diam.
  //
  // Gerbang sebelumnya hanya memeriksa total header dan nilai negatif, jadi
  // proposal CAMPURAN lolos: satu baris bernilai membuat totalnya positif,
  // sementara baris berkuantitas nol ikut terbawa sebagai pekerjaan seharga Rp0.
  // Nol dari wizard adalah "belum diisi", bukan "gratis" — kalau memang gratis,
  // itu keputusan komersial yang harus dinyatakan lewat `scope_status`.
  const belumLengkap = await tx.all(
    `SELECT id, order_no,
            COALESCE(NULLIF(ahsp_name_snapshot, ''), NULLIF(description, ''), CONCAT('Baris #', id)) AS nama,
            qty, unit_price_snapshot, total_price, ahsp_id
     FROM proposal_items
     WHERE proposal_id = ? AND is_section = 0 AND scope_status = 'priced'
       AND (qty IS NULL OR qty <= 0
            OR unit_price_snapshot IS NULL OR unit_price_snapshot <= 0
            OR total_price IS NULL OR total_price <= 0
            OR ahsp_id IS NULL)
     ORDER BY order_no, id`,
    [proposalId]
  );

  // Gerbang ini menggembok alur kerja yang sedang berjalan: pada 20 Agustus 2026
  // ketiga proposal produksi punya 144, 254, dan 52 baris belum lengkap, jadi
  // menyalakannya berarti tidak satu pun bisa dikirim sebelum dibereskan. Itu
  // keputusan pemilik proses, bukan keputusan yang pantas ikut diam-diam dalam
  // sebuah rilis. Kodenya dikirim, efeknya menunggu sakelar.
  //
  // Saat MATI, barisnya tetap dihitung dan dilaporkan sebagai `peringatan` di
  // respons transisi — jadi masalahnya terlihat tanpa menghentikan pekerjaan.
  if (belumLengkap.length > 0 && GERBANG_SCOPE_AKTIF) {
    const contoh = belumLengkap.slice(0, 15).map((r: any) => {
      const sebab: string[] = [];
      if (r.ahsp_id === null) sebab.push('belum punya AHSP');
      if (!(Number(r.qty) > 0)) sebab.push('volume masih nol');
      if (!(Number(r.unit_price_snapshot) > 0)) sebab.push('harga satuan nol');
      else if (!(Number(r.total_price) > 0)) sebab.push('nilai baris nol');
      return `#${r.id} ${r.nama} — ${sebab.join(', ')}`;
    });
    pelanggaran.push(
      `${belumLengkap.length} baris pekerjaan belum lengkap dan akan masuk kontrak sebagai lingkup Rp0. ` +
      `Lengkapi volumenya, atau nyatakan statusnya (included/optional/excluded) kalau memang disengaja.`
    );
    for (const c of contoh) pelanggaran.push(`  • ${c}`);
    if (belumLengkap.length > contoh.length) {
      pelanggaran.push(`  • …dan ${belumLengkap.length - contoh.length} baris lain`);
    }
  }

  // Header wajib sama dengan penjumlahan barisnya. Kalau tidak, ada dua
  // kebenaran dalam satu dokumen dan salah satunya akan dipakai hilir.
  const jumlahBaris = uang(ringkas?.jumlah_baris);
  const direct = uang(proposal.direct_cost);
  if (Math.abs(jumlahBaris - direct) >= 0.005) {
    pelanggaran.push(
      `Direct cost di header (${direct}) tidak sama dengan jumlah baris (${jumlahBaris}).`
    );
  }
  // Tiap baris harus konsisten dengan dirinya sendiri: total = qty × harga.
  //
  // Gerbang sebelumnya hanya memeriksa nilai negatif dan rekonsiliasi header
  // terhadap SUM(total_price) — jadi baris yang total-nya tidak cocok dengan
  // qty × harga snapshot tetap lolos, dan header pun ikut "cocok" karena
  // dijumlahkan dari angka yang sama-sama salah.
  const takKonsisten: any[] = await tx.all(
    `SELECT id,
            COALESCE(NULLIF(ahsp_name_snapshot, ''), NULLIF(description, ''), CONCAT('Baris #', id)) AS nama,
            qty, unit_price_snapshot, total_price
     FROM proposal_items
     WHERE proposal_id = ? AND is_section = 0
       AND ABS(ROUND(COALESCE(total_price,0), 2)
             - ROUND(COALESCE(qty,0) * COALESCE(unit_price_snapshot,0), 2)) >= 0.01
     ORDER BY order_no, id`,
    [proposalId]
  );
  if (takKonsisten.length > 0) {
    pelanggaran.push(
      `${takKonsisten.length} baris nilainya tidak cocok dengan volume × harga satuan.`
    );
    for (const r of takKonsisten.slice(0, 10)) {
      pelanggaran.push(
        `  • #${r.id} ${r.nama} — tercatat ${uang(r.total_price)}, ` +
        `semestinya ${bulatUang(uang(r.qty) * uang(r.unit_price_snapshot))}`
      );
    }
  }

  const semestinya = bulatUang(direct + uang(proposal.overhead) + uang(proposal.risk_contingency));
  if (Math.abs(semestinya - total) >= 0.005) {
    pelanggaran.push(
      `Total penawaran (${total}) tidak sama dengan direct cost + overhead + contingency (${semestinya}).`
    );
  }

  if (pelanggaran.length === 0) {
    // Tidak menghalangi, tapi tetap dicatat supaya tidak hilang dari pandangan.
    if (belumLengkap.length > 0) {
      console.warn(
        `[Proposal ${proposalId}] ${belumLengkap.length} baris belum lengkap ikut ke status ` +
        `"${'submitted/deal'}" — gerbang scope masih MATI (GERBANG_SCOPE_LENGKAP).`
      );
    }
    return null;
  }
  return {
    error: 'Proposal belum memenuhi syarat untuk dikirim atau dijadikan kontrak.',
    code: 'PROPOSAL_BELUM_LAYAK',
    pelanggaran,
  };
};

const itemMilikProposal = async (proposalId: any, itemId: any, tx: TxRunner) => {
  const row: any = await tx.get(
    'SELECT id FROM proposal_items WHERE id = ? AND proposal_id = ?', [itemId, proposalId]
  );
  return !!row;
};

// Bentuknya harus sama dengan yang dikembalikan `proposalLockTx` lewat
// `{ error: status, body }` — handler di bawah memilah hasil transaction dengan
// `'error' in hasil`. Memakai kunci `status` di sini membuat penolakannya lolos
// sebagai sukses: barisnya memang tidak ditulis, tapi pemanggil menerima 200.
const BUKAN_MILIK = {
  error: 404,
  body: { error: 'Item tidak ditemukan pada proposal ini', code: 'ITEM_BUKAN_MILIK_PROPOSAL' },
};

/**
 * Nyatakan status lingkup untuk satu atau banyak baris RAB sekaligus.
 *
 * `priced` = baris biasa yang harus punya volume dan harga. Tiga lainnya adalah
 * keputusan komersial yang eksplisit dan tercatat siapa penetapnya:
 *
 *   • `included` — dikerjakan, tidak ditagih terpisah (sudah masuk harga lain)
 *   • `optional` — di luar harga dasar, ditawarkan terpisah
 *   • `excluded` — tidak termasuk lingkup pekerjaan
 *
 * Alasan WAJIB untuk ketiga status non-`priced`. Tanpa itu klasifikasinya jadi
 * tombol untuk melewati gerbang, bukan keputusan yang bisa dipertanggungjawabkan.
 *
 * Massal disediakan karena template wizard bisa meninggalkan ratusan baris
 * sekaligus — di produksi ada proposal dengan 254 baris belum lengkap, dan
 * menyatakan satu per satu lewat UI bukan pekerjaan yang masuk akal.
 */
const SCOPE_SAH = ['priced', 'included', 'optional', 'excluded'];

router.put('/proposals/:id/items/scope', authMiddleware, bolehUbah, async (req: Request, res: Response) => {
  try {
    const { item_ids, scope_status, scope_note } = req.body;
    const userId = (req as any).userId || null;

    if (!Array.isArray(item_ids) || item_ids.length === 0) {
      return res.status(400).json({ error: 'item_ids wajib berupa daftar id yang tidak kosong' });
    }
    if (!SCOPE_SAH.includes(scope_status)) {
      return res.status(400).json({
        error: `scope_status harus salah satu dari: ${SCOPE_SAH.join(', ')}`,
        code: 'SCOPE_TIDAK_VALID',
      });
    }
    if (scope_status !== 'priced' && !String(scope_note || '').trim()) {
      return res.status(400).json({
        error: 'Alasan wajib diisi saat menyatakan baris sebagai included/optional/excluded.',
        code: 'ALASAN_WAJIB',
      });
    }

    const hasil = await withTransaction(async tx => {
      const terkunci = await proposalLockTx(req.params.id, tx);
      if (terkunci) return { error: terkunci.status, body: terkunci.body };

      // Semua id harus benar-benar milik proposal ini — sama seperti jalur
      // jadwal, id anak tidak boleh dipercaya begitu saja dari body.
      const tanda = item_ids.map(() => '?').join(',');
      const milik: any[] = await tx.all(
        `SELECT id FROM proposal_items WHERE proposal_id = ? AND id IN (${tanda})`,
        [req.params.id, ...item_ids]
      );
      if (milik.length !== item_ids.length) {
        return { error: 404, body: {
          error: 'Sebagian item tidak ditemukan pada proposal ini.',
          code: 'ITEM_BUKAN_MILIK_PROPOSAL',
          ditemukan: milik.length, diminta: item_ids.length,
        } };
      }

      await tx.run(
        `UPDATE proposal_items
         SET scope_status = ?, scope_note = ?, scope_set_by = ?, scope_set_at = NOW()
         WHERE proposal_id = ? AND id IN (${tanda})`,
        [scope_status, scope_status === 'priced' ? null : String(scope_note).trim(),
         scope_status === 'priced' ? null : userId, req.params.id, ...item_ids]
      );
      return { ok: true as const, jumlah: item_ids.length };
    });

    if ('error' in hasil) return res.status(hasil.error).json(hasil.body);
    res.json({ message: 'Status lingkup diperbarui', jumlah: hasil.jumlah, scope_status });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

/** Daftar baris yang belum lengkap — dipakai layar untuk menampilkannya. */
router.get('/proposals/:id/items/incomplete', authMiddleware, bolehLihat, async (req: Request, res: Response) => {
  try {
    const rows = await dbAll(
      `SELECT id, order_no, ahsp_name_snapshot, description, qty, unit_price_snapshot,
              total_price, ahsp_id, scope_status
       FROM proposal_items
       WHERE proposal_id = ? AND is_section = 0 AND scope_status = 'priced'
         AND (qty IS NULL OR qty <= 0
              OR unit_price_snapshot IS NULL OR unit_price_snapshot <= 0
              OR total_price IS NULL OR total_price <= 0
              OR ahsp_id IS NULL)
       ORDER BY order_no, id`,
      [req.params.id]
    );
    res.json({ items: rows, count: rows.length });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});


// ═══════════════════════════════════════════════════════════════════════════
// USULAN MTO DARI GAMBAR KERJA (Tahap 1: pondasi)
// ═══════════════════════════════════════════════════════════════════════════
//
// Keputusan desain yang menentukan fitur ini berguna atau berbahaya:
// **AI tidak menghasilkan kuantitas — ia menghasilkan PARAMETER.**
//
//   gambar → AI → { L, W, H, depth, qty } → kalkulator MTO yang sudah ada
//
// Kalau AI langsung mengeluarkan angka kuantitas, tiap angka menjadi tidak bisa
// ditelusuri dan tidak bisa direproduksi — persis lawan dari yang dikerjakan
// sepanjang review ini. Dengan menghasilkan parameter, angkanya tetap lahir dari
// formula yang sama dengan input manual, yang sudah teruji dan dicocokkan dengan
// hitungan tangan.
//
// Yang diperiksa manusia pun jadi DIMENSI, bukan bill of material. "Footing
// 2,2 × 2,2 × 0,35, 6 titik" bisa dicocokkan sekilas ke gambar; "besi footing
// 1.636 kg" tidak.
//
// **Tidak ada yang tersimpan di sini.** Endpoint ini hanya mengembalikan usulan;
// penyimpanannya lewat `POST /mto` biasa setelah manusia menyetujui — dengan
// seluruh validasi yang sudah ada. Membaca dimensi dari gambar teknik itu sulit
// (skala, revision cloud, dan terutama satuan mm vs m yang salahnya 1000×), jadi
// keliru itu pasti terjadi; yang tidak boleh adalah keliru yang tersimpan diam-diam.
//
// Gambarnya juga TIDAK disimpan ke disk — diproses di memori lalu dibuang.
// Tidak ada folder unggahan baru, tidak ada dokumen bisnis tambahan di server.
/**
 * EST-MTO-R55: menerima PDF dan banyak lembar sekaligus.
 *
 * Batas satu berkas gambar sebelumnya tidak punya alasan kuat, dan ia
 * bertabrakan dengan cara gambar kerja benar-benar beredar: satu PDF berisi
 * denah pondasi, tabel schedule kolom, potongan, dan detail penulangan — di
 * lembar-lembar yang berbeda. Membacanya satu per satu berarti model tidak
 * pernah bisa menyilangkan denah dengan tabelnya, padahal itu pekerjaan
 * intinya: tanda "P1" di denah hanya berarti sesuatu kalau barisnya di tabel
 * schedule ikut terbaca.
 *
 * Batas ukurannya dinaikkan ke 20 MB per berkas dan maksimal 10 berkas.
 * Angkanya bukan sembarangan: itu masih jauh di bawah batas payload Gemini,
 * dan berkas diproses di memori — tidak ada yang ditulis ke disk (lihat aturan
 * `/uploads` di CLAUDE.md).
 */
const unggahGambar = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024, files: 10 },
  fileFilter: (_req, file, cb) => {
    const boleh = ['image/png', 'image/jpeg', 'image/webp', 'application/pdf'];
    if (!boleh.includes(file.mimetype)) {
      return cb(new Error('Hanya PDF, PNG, JPEG, atau WebP yang bisa dibaca'));
    }
    cb(null, true);
  },
});

/** Prompt disusun dari kontrak parameter yang sudah ada, bukan daftar terpisah. */
/**
 * EST-MTO-R53: prompt asisten gambar mencakup SELURUH tipe elemen.
 *
 * Tahap 1 sengaja dibatasi ke pondasi. Batas itu batas saya, bukan batas
 * sistem: kalkulator sudah mendukung 6 tipe elemen dengan 21 varian yang
 * benar-benar menghasilkan baris — 58 baris pekerjaan kalau semuanya dipakai.
 * Membatasi asisten ke pondasi berarti 48 baris di antaranya tidak pernah bisa
 * datang dari gambar.
 *
 * Katalog tipe/varian/field-nya DIBANGKITKAN dari `katalogElemen()`, bukan
 * ditulis tangan. Prompt yang ditulis tangan akan melenceng diam-diam setiap
 * kali varian baru ditambahkan ke kalkulator, dan AI akan terus mengusulkan
 * bentuk yang sudah tidak berlaku.
 */
const promptGambar = (catatan: string, jumlahBerkas = 1) => {
  // Varian yang belum punya formula tidak ditawarkan — mengusulkannya hanya
  // menghasilkan zona berkuantitas nol yang membingungkan.
  const katalog = katalogRingkas();

  return `
Anda engineer struktur yang membaca gambar kerja dan menyusun daftar pekerjaan.
${jumlahBerkas > 1
  ? `Ada ${jumlahBerkas} berkas/lembar. BACA SEMUANYA sebagai satu set gambar yang
saling melengkapi — denah, tabel schedule, potongan, dan detail penulangan
biasanya berada di lembar yang berbeda. SILANGKAN antar lembar: tanda "P1" di
denah baru berarti sesuatu kalau barisnya di tabel schedule ikut dibaca.`
  : ''}

TUGAS: baca gambar, lalu keluarkan PARAMETER DIMENSI setiap elemen yang terlihat.
JANGAN menghitung volume, berat besi, luas, atau kuantitas apa pun — sistem yang
menghitungnya dari parameter Anda.

TIPE ELEMEN DAN PARAMETER WAJIBNYA:
${katalog}

Keluarkan JSON dengan bentuk PERSIS:
{
  "zones": [
    {
      "element_type": "salah satu dari: ${katalogElemen().map(t => t.element_type).join(', ')}",
      "element_name": "nama elemen di gambar, mis. P1, K1, B2, atau 'Pelat Lantai 2'",
      "parameters": { "<field varian>": "<nilai varian>", "<field dimensi>": <angka METER> },
      "keyakinan": "tinggi" | "sedang" | "rendah",
      "dasar": "dari mana angkanya dibaca, mis. 'tabel schedule kolom baris K1'",
      "ragu": ["hal yang tidak yakin, kosongkan kalau tidak ada"]
    }
  ],
  "catatan_umum": "hal penting yang perlu diketahui pemeriksa"
}

ATURAN KERAS:
1. SEMUA panjang dalam METER. Gambar teknik sering memakai milimeter — kalau
   angkanya seperti 2200, itu 2.2 meter. Salah satuan di sini berakibat 1000x.
   Kecuali yang labelnya jelas menyebut satuan lain (mis. tebal screed dalam cm).
2. Kalau sebuah angka tidak terbaca jelas, JANGAN menebak: kosongkan fieldnya
   dan sebutkan di "ragu". Field kosong bisa dilengkapi pemeriksa; angka karangan
   tidak bisa dibedakan dari angka benar.
3. Setiap zona WAJIB memuat field varian (mis. "col_type") dengan salah satu
   nilai di daftar di atas. Jangan mengarang nilai varian baru.
4. Pisahkan zona per TIPE dan per UKURAN. Kolom 40x40 dan kolom 30x30 adalah dua
   zona, bukan satu.
5. Kuantitas seperti jumlah titik pondasi atau jumlah kolom per lantai memang
   parameter — hitung dari denah atau tabel schedule, jangan mengarang.
6. Kalau gambar ini bukan gambar kerja konstruksi, kembalikan "zones": [] dan
   jelaskan di "catatan_umum".
7. Sebutkan di "dasar" LEMBAR MANA angkanya dibaca kalau berkasnya lebih dari
   satu — pemeriksa harus bisa membuka lembar itu untuk mencocokkan.
8. Kalau denah dan tabel schedule saling BERTENTANGAN, pakai tabel schedule dan
   sebutkan pertentangannya di "ragu". Jangan diam-diam memilih salah satu.
${catatan ? `\nCATATAN DARI PENGGUNA (pakai ini untuk memperjelas):\n${catatan}` : ''}
`.trim();
};

/**
 * Prompt lanjutan: MEREVISI usulan yang sudah ada, bukan membaca gambar lagi.
 *
 * EST-MTO-R50 — Tahap 2. Tahap 1 sengaja satu arah, dan konsekuensinya nyata:
 * usulan yang beberapa dimensinya tidak terbaca dari gambar menjadi buntu total.
 * Penggunanya melihat apa yang kurang tapi tidak punya cara menambahkannya, dan
 * "Terima" pun ditolak karena dimensinya belum lengkap.
 *
 * Aturan yang TIDAK berubah dari Tahap 1: AI tetap hanya mengeluarkan
 * PARAMETER. Kuantitasnya dihitung `calculateMto()` — kalkulator yang sama
 * dengan input manual. Begitu kuantitas datang dari AI, angkanya berhenti bisa
 * ditelusuri, dan itu berlaku sama saja untuk giliran keseratus seperti giliran
 * pertama.
 */
/**
 * Terjemahkan kegagalan dari sisi Gemini menjadi respons yang bisa ditindaklanjuti.
 *
 * Kuota habis dan rate limit adalah keadaan yang WAJAR pada free tier — 20
 * permintaan per menit habis hanya dengan beberapa kali menyunting. Membalasnya
 * 500 dengan pesan mentah membuatnya tidak bisa dibedakan dari sistem rusak,
 * dan pengguna tidak tahu bahwa yang perlu dilakukan hanyalah menunggu sebentar.
 */
function galatAi(err: any): { status: number; body: any } {
  const pesan = String(err?.message || '');
  if (/quota|rate limit|RESOURCE_EXHAUSTED|429/i.test(pesan)) {
    const detik = pesan.match(/retry in ([\d.]+)s/i)?.[1];
    return {
      status: 429,
      body: {
        error: 'Kuota asisten AI sedang habis'
          + (detik ? `, coba lagi sekitar ${Math.ceil(Number(detik))} detik lagi.` : ', coba lagi sebentar lagi.')
          + ' Batas gratis Gemini terpakai cepat kalau usulan disunting berkali-kali.',
        code: 'AI_KUOTA_HABIS',
        ...(detik ? { coba_lagi_detik: Math.ceil(Number(detik)) } : {}),
      },
    };
  }
  if (/API key|PERMISSION_DENIED|API_KEY_INVALID/i.test(pesan)) {
    return {
      status: 503,
      body: { error: 'Kunci API asisten ditolak Google. Perlu diperiksa di server.', code: 'AI_KUNCI_DITOLAK' },
    };
  }
  return { status: 500, body: { error: pesan || 'Gagal menghubungi asisten AI', code: 'AI_GAGAL' } };
}

/**
 * Bentuk usulan yang sama untuk jalur gambar maupun diskusi.
 *
 * Satu tempat: kalau dua jalur membentuknya sendiri-sendiri, giliran diskusi
 * bisa menghasilkan bentuk yang sedikit berbeda dan layar akan menampilkan
 * usulan yang tidak setara dengan yang dari gambar.
 */
/**
 * Baca JSON dari balasan AI, tahan terhadap pembungkus.
 *
 * `responseMimeType: 'application/json'` biasanya cukup, tapi tidak dijamin:
 * model kadang membungkusnya dengan pagar markdown, atau menambahkan satu
 * kalimat pengantar. Menolaknya mentah-mentah membuat seluruh pembacaan gagal
 * karena tiga karakter pembungkus — dan pesan errornya tidak memberi tahu apa
 * pun tentang apa yang sebenarnya diterima.
 *
 * Kalau tetap gagal, potongan awal balasannya ikut dikembalikan supaya masalah
 * berikutnya bisa didiagnosis tanpa menebak dan tanpa memakai kuota lagi.
 */
// Satu bentuk objek, bukan union: `strictNullChecks` mati di project ini,
// sehingga penyempitan discriminated union tidak bekerja (lihat `validasiQty`
// dan `selaraskanKlasifikasi` yang kena hal yang sama).
interface HasilBacaJson { ok: boolean; data: any; cuplikan: string; panjang: number }

function bacaJsonAi(teks: string): HasilBacaJson {
  const bersih = String(teks || '').trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '');

  try { return { ok: true, data: JSON.parse(bersih), cuplikan: '', panjang: bersih.length }; } catch { /* coba cara kedua */ }

  // Ambil blok objek pertama yang kurungnya berpasangan — menangani kasus
  // model menambahkan kalimat sebelum atau sesudah JSON-nya.
  const mulai = bersih.indexOf('{');
  if (mulai >= 0) {
    let dalam = 0, diString = false, escape = false;
    for (let i = mulai; i < bersih.length; i++) {
      const c = bersih[i];
      if (escape) { escape = false; continue; }
      if (c === '\\') { escape = true; continue; }
      if (c === '"') { diString = !diString; continue; }
      if (diString) continue;
      if (c === '{') dalam++;
      else if (c === '}') {
        dalam--;
        if (dalam === 0) {
          try { return { ok: true, data: JSON.parse(bersih.slice(mulai, i + 1)), cuplikan: '', panjang: bersih.length }; } catch { break; }
        }
      }
    }
  }
  return { ok: false, data: null, cuplikan: bersih.slice(0, 300), panjang: bersih.length };
}

const TIPE_ELEMEN_SAH = new Set(katalogElemen().map(t => t.element_type));

function bentukUsulan(zones: any): any[] {
  return (Array.isArray(zones) ? zones : []).slice(0, 60).map((z: any) => {
    const parameters = { ...(z?.parameters || {}) };
    // EST-MTO-R53: tipe elemen tidak lagi dipaku ke 'foundation'.
    //
    // Tipe yang tidak dikenal TIDAK dibuang diam-diam — ia tetap dikembalikan
    // sebagai usulan dan `calculateMto` menandainya `invalid`, sehingga
    // pemeriksa melihat bahwa AI membaca sesuatu yang sistemnya belum dukung.
    // Membuangnya berarti zona itu hilang tanpa jejak.
    const tipe = TIPE_ELEMEN_SAH.has(String(z?.element_type))
      ? String(z.element_type) : 'foundation';

    // Kompatibilitas: jawaban lama menaruh varian di luar `parameters`.
    for (const t of katalogElemen()) {
      const f = t.variant_field;
      if (z?.[f] && parameters[f] === undefined) parameters[f] = z[f];
    }
    if (z?.foundation_type && parameters.foundation_type === undefined) {
      parameters.foundation_type = z.foundation_type;
    }
    // Field kosong dibuang, bukan dikirim sebagai null — `isFilled` menganggap
    // null belum diisi, tapi menyimpannya membuat formulir menampilkan "null".
    for (const [k, v] of Object.entries(parameters)) {
      if (v === null || v === undefined || String(v).trim() === '') delete (parameters as any)[k];
    }

    const mto = calculateMto(tipe, parameters);
    return {
      element_type: tipe,
      element_name: String(z?.element_name || tipe).slice(0, 80),
      parameters,
      keyakinan: ['tinggi', 'sedang', 'rendah'].includes(z?.keyakinan) ? z.keyakinan : 'rendah',
      dasar: String(z?.dasar || '').slice(0, 300),
      ragu: Array.isArray(z?.ragu) ? z.ragu.slice(0, 10).map((x: any) => String(x).slice(0, 200)) : [],
      // Pratinjau — bukan angka tersimpan.
      pratinjau: mto.lines,
      variant: mto.variant,
      missing_required: (mto as any).missing_required || [],
      field_wajib: spesifikasiField(tipe, mto.variant),
      field_opsional: spesifikasiOpsional(tipe),
      // Ditandai supaya layar bisa mengatakan apa adanya, bukan menampilkan
      // zona kosong tanpa penjelasan.
      tipe_dikenal: TIPE_ELEMEN_SAH.has(String(z?.element_type)),
      notes: mto.notes,
    };
  });
}

/**
 * Katalog tipe/varian/field dalam bentuk ringkas untuk disisipkan ke prompt.
 *
 * EST-MTO-R53b: prompt diskusi SEBELUMNYA tidak memuat katalog ini — hanya
 * prompt gambar yang memuatnya. Akibatnya, saat estimator meminta asisten
 * menyusun zona dari nol lewat percakapan, AI tidak tahu nama field yang
 * dipakai kalkulator dan mengembalikan parameter bernama lain. Zonanya tetap
 * terbentuk, pratinjaunya tetap ada — tapi seluruh dimensinya terhitung "belum
 * diisi" dan angkanya berdiri di atas asumsi kalkulator.
 *
 * Terlihat saat mencoba: enam zona lintas tipe terbentuk rapi, tapi setiap
 * zonanya melaporkan 1–4 dimensi wajib yang kurang padahal semuanya disebutkan
 * jelas dalam permintaan.
 */
const katalogRingkas = () => katalogElemen()
  .map(t => {
    const varian = t.variants
      .filter(v => v.wajib.length > 0)
      .map(v => `    - ${t.variant_field}="${v.variant}" wajib: ${v.wajib.map(w => `${w.field} (${w.label})`).join(', ')}`)
      .join('\n');
    if (!varian) return '';

    // EST-MTO-R55b: field OPSIONAL ikut disebutkan.
    //
    // Sebelumnya prompt hanya memuat field wajib, dan akibatnya terlihat saat
    // menguji dengan gambar dua lembar: tabel schedule jelas mencantumkan
    // KEDALAMAN 1800 mm, tapi `depth` tidak pernah dikembalikan — model tidak
    // tahu field itu ada. Padahal `depth` menentukan volume galian; tanpa itu
    // kalkulator jatuh ke tebal footing sebagai perkiraan, dan galiannya
    // meleset jauh.
    //
    // "Opsional" di sini berarti boleh kosong kalau memang tidak ada di gambar,
    // BUKAN berarti tidak penting.
    const opsional = spesifikasiOpsional(t.element_type);
    const barisOpsional = opsional.length
      ? `\n    opsional (isi kalau ada di gambar): ${opsional.map(o => `${o.field} (${o.label})`).join(', ')}`
      : '';
    return `  ${t.element_type}:\n${varian}${barisOpsional}`;
  })
  .filter(Boolean).join('\n');

const promptDiskusi = (zona: any[], pesan: string, riwayat: any[]) => `
Anda engineer struktur yang sedang MEREVISI daftar parameter elemen konstruksi
bersama seorang estimator. Anda TIDAK sedang membaca gambar baru.

TIPE ELEMEN DAN PARAMETER WAJIBNYA — pakai NAMA FIELD PERSIS seperti di bawah,
jangan menerjemahkannya:
${katalogRingkas()}

KEADAAN SEKARANG (JSON):
${JSON.stringify(zona, null, 1).slice(0, 6000)}

${riwayat.length ? `PERCAKAPAN SEBELUMNYA:\n${riwayat.slice(-8).map((r: any) =>
  `${r.peran === 'pengguna' ? 'Estimator' : 'Anda'}: ${String(r.teks || '').slice(0, 500)}`).join('\n')}\n` : ''}
PERMINTAAN ESTIMATOR SEKARANG:
${pesan}

Keluarkan JSON dengan bentuk PERSIS:
{
  "zones": [ { "element_type": "foundation|column|beam|slab|wall|roof",
               "element_name": "...",
               "parameters": { "<field varian>": "<nilai>", "<field dimensi>": <angka METER> },
               "keyakinan": "tinggi"|"sedang"|"rendah",
               "dasar": "dari mana angka ini — sebut 'diberikan estimator' kalau dari permintaan di atas",
               "ragu": ["..."] } ],
  "balasan": "jawaban singkat untuk estimator, dalam Bahasa Indonesia",
  "catatan_umum": "..."
}

ATURAN KERAS:
1. JANGAN menghitung volume, berat besi, atau kuantitas apa pun. Sistem yang
   menghitung. Anda hanya menetapkan dimensi.
2. SEMUA panjang dalam METER. Kalau estimator menyebut "2200", itu 2.2 meter —
   tapi tanyakan dulu di "balasan" kalau maksudnya ambigu.
3. Pertahankan "element_type" dan field varian tiap zona apa adanya kecuali
   estimator memang memintanya diubah. Kalau estimator meminta zona BARU,
   pakai nama field persis dari daftar di atas — parameter bernama lain akan
   terbaca sistem sebagai "belum diisi" dan angkanya jatuh ke asumsi.
4. KEMBALIKAN SELURUH zona, bukan hanya yang berubah. Zona yang tidak disinggung
   estimator dikembalikan APA ADANYA, termasuk dasar dan ragunya.
5. Nilai yang DIBERIKAN estimator dipakai apa adanya — jangan ditimpa hasil
   pembacaan Anda sendiri, dan tandai "dasar" dengan 'diberikan estimator'.
6. Kalau permintaan estimator tidak bisa dipenuhi dari data yang ada, katakan di
   "balasan" dan biarkan parameternya kosong. Jangan menebak.
`.trim();

/**
 * Hitung ulang pratinjau untuk parameter apa pun — TANPA menyimpan.
 *
 * Ini yang membuat layar bisa menampilkan akibat suntingan pengguna secara
 * langsung tanpa menduplikasi kalkulator ke browser. Menduplikasinya akan
 * membuat angka di layar dan angka yang tersimpan berasal dari dua sumber
 * berbeda — persis kelas cacat yang sudah beberapa kali ditutup di modul ini.
 */
router.post('/proposals/:id/mto/pratinjau', authMiddleware, bolehLihat, async (req: Request, res: Response) => {
  try {
    const tipe = String(req.body?.element_type || 'foundation');
    const parameters = req.body?.parameters && typeof req.body.parameters === 'object'
      ? req.body.parameters : {};

    const mto = calculateMto(tipe, parameters);
    if (mto.variant === 'invalid') {
      return res.status(422).json({
        error: mto.notes[0] || 'Parameter tidak valid.',
        code: 'PARAMETER_TIDAK_VALID',
        notes: mto.notes,
      });
    }

    res.json({
      element_type: tipe,
      variant: mto.variant,
      pratinjau: mto.lines,
      missing_required: (mto as any).missing_required || [],
      notes: mto.notes,
      // Spesifikasi field dikirim bersama hasilnya supaya formulir di layar
      // selalu mengikuti kontrak yang sama dengan validatornya.
      field_wajib: spesifikasiField(tipe, mto.variant),
      field_opsional: spesifikasiOpsional(tipe),
      tersimpan: false,
    });
  } catch (err: any) {
    console.error('Pratinjau MTO gagal:', err);
    res.status(500).json({ error: err?.message || 'Gagal menghitung pratinjau' });
  }
});

/**
 * Diskusi dua arah untuk merevisi usulan MTO.
 *
 * Stateless: seluruh keadaan (zona + riwayat percakapan) dikirim klien tiap
 * giliran. Tidak ada tabel baru, dan yang lebih penting — TIDAK ADA yang
 * tersimpan. Penyimpanan tetap hanya lewat `POST /mto` saat pengguna menekan
 * Terima per zona, sama seperti Tahap 1.
 */
router.post('/proposals/:id/mto/diskusi', authMiddleware, bolehUbah, async (req: Request, res: Response) => {
  try {
    const pesan = String(req.body?.pesan || '').trim().slice(0, 2000);
    if (!pesan) return res.status(400).json({ error: 'Pesan wajib diisi', code: 'PESAN_WAJIB' });

    const terkunci = await proposalLock(req.params.id);
    if (terkunci) return res.status(terkunci.status).json(terkunci.body);

    const kunci = process.env.GEMINI_API_KEY;
    if (!kunci || kunci.startsWith('your-')) {
      return res.status(503).json({
        error: 'Asisten belum tersedia — GEMINI_API_KEY belum disetel di server.',
        code: 'AI_BELUM_SIAP',
      });
    }

    const zonaMasuk = Array.isArray(req.body?.zona) ? req.body.zona.slice(0, 20) : [];
    const riwayat = Array.isArray(req.body?.riwayat) ? req.body.riwayat.slice(-12) : [];

    const jawaban = await callGeminiText(promptDiskusi(zonaMasuk, pesan, riwayat), kunci);

    const dibacaDiskusi = bacaJsonAi(jawaban);
    if (!dibacaDiskusi.ok) {
      console.error('[diskusi] JSON tidak terbaca:', dibacaDiskusi.cuplikan);
      return res.status(502).json({
        error: 'Asisten mengembalikan jawaban yang tidak bisa dibaca.',
        code: 'AI_JAWABAN_TIDAK_TERBACA',
        panjang_balasan: dibacaDiskusi.panjang,
        cuplikan: dibacaDiskusi.cuplikan,
      });
    }
    const hasil: any = dibacaDiskusi.data;

    const usulan = bentukUsulan(hasil?.zones);
    res.json({
      usulan,
      jumlah: usulan.length,
      balasan: String(hasil?.balasan || '').slice(0, 2000),
      catatan_umum: String(hasil?.catatan_umum || '').slice(0, 1000),
      tersimpan: false,
    });
  } catch (err: any) {
    console.error('Diskusi MTO gagal:', err?.message);
    const g = galatAi(err);
    res.status(g.status).json(g.body);
  }
});

router.post('/proposals/:id/mto/usul-dari-gambar', authMiddleware, bolehUbah,
  unggahGambar.array('gambar', 10), async (req: Request, res: Response) => {
  try {
    // `.array()` selalu menghasilkan daftar; `.single()` lama diterima juga
    // supaya klien yang belum diperbarui tidak patah.
    const daftarBerkas: any[] = (req as any).files?.length
      ? (req as any).files
      : ((req as any).file ? [(req as any).file] : []);
    if (!daftarBerkas.length) {
      return res.status(400).json({ error: 'Gambar wajib diunggah', code: 'GAMBAR_WAJIB' });
    }

    // Proposal terkunci tidak boleh menerima usulan yang ujungnya akan ditolak.
    const terkunci = await proposalLock(req.params.id);
    if (terkunci) return res.status(terkunci.status).json(terkunci.body);

    const kunci = process.env.GEMINI_API_KEY;
    if (!kunci || kunci.startsWith('your-')) {
      return res.status(503).json({
        error: 'Pembaca gambar belum tersedia — GEMINI_API_KEY belum disetel di server.',
        code: 'AI_BELUM_SIAP',
      });
    }

    const jawaban = await callGeminiVision(
      promptGambar(String(req.body?.catatan || '').slice(0, 2000), daftarBerkas.length),
      daftarBerkas.map(b => ({ base64: b.buffer.toString('base64'), mimeType: b.mimetype })),
      kunci
    );

    const dibaca = bacaJsonAi(jawaban);
    if (!dibaca.ok) {
      console.error('[usul-dari-gambar] JSON tidak terbaca:', dibaca.cuplikan);
      return res.status(502).json({
        error: 'Pembaca gambar mengembalikan jawaban yang tidak bisa dibaca.',
        code: 'AI_JAWABAN_TIDAK_TERBACA',
        // Diagnosa ikut dikirim: tanpa ini, 502 tidak memberi tahu apa pun dan
        // setiap penelusuran berikutnya harus memakai kuota lagi.
        panjang_balasan: dibaca.panjang,
        cuplikan: dibaca.cuplikan,
      });
    }
    const hasil: any = dibaca.data;

    // Tiap usulan dihitung lewat kalkulator yang SAMA dengan input manual, jadi
    // pratinjaunya benar-benar angka yang akan tersimpan kalau disetujui.
    const usulan = bentukUsulan(hasil?.zones);

    res.json({
      usulan,
      jumlah: usulan.length,
      catatan_umum: String(hasil?.catatan_umum || '').slice(0, 1000),
      // Dinyatakan tegas supaya tidak ada yang mengira ini sudah tersimpan.
      tersimpan: false,
      catatan_sistem: 'Ini usulan, belum tersimpan. Periksa dimensinya terhadap gambar, lalu setujui per zona.',
    });
  } catch (err: any) {
    console.error('Usul MTO dari gambar gagal:', err?.message);
    const g = galatAi(err);
    res.status(g.status).json(g.body);
  }
});

// ── Override: save manual start/duration for a schedule item
router.put('/proposals/:id/schedule/overrides', authMiddleware, bolehUbah, async (req: Request, res: Response) => {
  try {
    const { proposal_item_id, start_day_override, duration_days_override, is_pinned, notes } = req.body;
    if (proposal_item_id == null) {
      return res.status(400).json({ error: 'proposal_item_id wajib diisi' });
    }

    const mulai = angkaJadwal(start_day_override, 'start_day_override');
    const durasi = angkaJadwal(duration_days_override, 'duration_days_override');
    const salah = [mulai, durasi].filter(v => !v.ok).map(v => v.pesan);
    if (salah.length) {
      return res.status(400).json({
        error: 'Nilai jadwal tidak valid, override tidak disimpan.',
        code: 'JADWAL_TIDAK_VALID',
        problems: salah,
      });
    }

    const hasil = await withTransaction(async tx => {
      // Tanggal dan durasi menggeser kurva kas serta rencana billing, jadi ia
      // tunduk pada kunci yang sama dengan perubahan komersial lain: proposal
      // yang sudah dikirim atau menjadi kontrak tidak boleh berubah diam-diam.
      const terkunci = await proposalLockTx(req.params.id, tx);
      if (terkunci) return { error: terkunci.status, body: terkunci.body };

      if (!(await itemMilikProposal(req.params.id, proposal_item_id, tx))) return BUKAN_MILIK;

      await tx.run(
        `INSERT INTO schedule_overrides (proposal_item_id, start_day_override, duration_days_override, is_pinned, notes)
         VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           start_day_override     = VALUES(start_day_override),
           duration_days_override = VALUES(duration_days_override),
           is_pinned              = VALUES(is_pinned),
           notes                  = VALUES(notes),
           updated_at             = NOW()`,
        [proposal_item_id, mulai.nilai, durasi.nilai, is_pinned ? 1 : 0, notes || null]
      );
      return { ok: true as const };
    });

    if ('error' in hasil) return res.status(hasil.error).json(hasil.body);
    res.json({ message: 'Override saved' });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ── Override: reset item back to auto (delete override)
router.delete('/proposals/:id/schedule/overrides/:itemId', authMiddleware, bolehHapus, async (req: Request, res: Response) => {
  try {
    const hasil = await withTransaction(async tx => {
      const terkunci = await proposalLockTx(req.params.id, tx);
      if (terkunci) return { error: terkunci.status, body: terkunci.body };

      if (!(await itemMilikProposal(req.params.id, req.params.itemId, tx))) return BUKAN_MILIK;

      await tx.run('DELETE FROM schedule_overrides WHERE proposal_item_id = ?', [req.params.itemId]);
      return { ok: true as const };
    });

    if ('error' in hasil) return res.status(hasil.error).json(hasil.body);
    res.json({ message: 'Override reset' });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ── PAYMENT SCHEDULE: bobot × contract = monthly planned billing
router.get('/proposals/:id/payment-schedule', authMiddleware, bolehLihat, async (req: Request, res: Response) => {
  try {
    const proposalId   = req.params.id;
    const startDateStr = req.query.start_date as string || new Date().toISOString().slice(0, 10);

    // Parameter dari query dibatasi: dipakai sebagai PEMBAGI saat menghitung
    // durasi otomatis, jadi nol atau negatif menghasilkan Infinity/NaN yang
    // merambat ke seluruh kurva. Nilai raksasa juga tidak berarti apa-apa —
    // tidak ada pekerjaan dengan 10.000 pekerja per hari di sistem ini.
    const dalamRentang = (raw: unknown, bawaan: number, min: number, max: number) => {
      const n = parseFloat(String(raw));
      if (!Number.isFinite(n) || n < min || n > max) return bawaan;
      return n;
    };
    const workersPerDay = dalamRentang(req.query.workers_per_day, 8, 1, 1000);
    const hoursPerDay   = dalamRentang(req.query.hours_per_day, 8, 1, 24);

    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDateStr)) {
      return res.status(400).json({
        error: 'start_date harus berformat YYYY-MM-DD.',
        code: 'TANGGAL_TIDAK_VALID',
      });
    }

    // 1. Get proposal total & items
    //
    // Kolom `total_price` TIDAK PERNAH ADA di tabel `proposals` — diperiksa di
    // INFORMATION_SCHEMA, dev maupun produksi. Query lama karena itu selalu
    // gagal `ER_BAD_FIELD_ERROR`, dan tab Payment Schedule tidak pernah sekali
    // pun berhasil dimuat; frontend hanya menulis errornya ke console sehingga
    // kegagalannya tidak terlihat siapa pun.
    const proposal: any = await dbGet(
      `SELECT id, total_project FROM proposals WHERE id = ?`, [proposalId]
    );
    if (!proposal) return res.status(404).json({ error: 'Proposal tidak ditemukan' });
    const totalContract = uang(proposal.total_project);

    // 2. Get all items with price & schedule overrides
    const items = await dbAll(
      `SELECT pi.id, pi.ahsp_name_snapshot as name, pi.total_price, pi.qty, pi.unit_snapshot as unit,
              pi.order_no, so.start_day_override, so.duration_days_override
       FROM proposal_items pi
       LEFT JOIN schedule_overrides so ON so.proposal_item_id = pi.id
       WHERE pi.proposal_id = ? AND pi.is_section = 0
       ORDER BY pi.order_no ASC`,
      [proposalId]
    ) as any[];

    // 3. Get auto-schedule data (reuse schedule logic simplified)
    const overrides: Record<number, any> = {};
    for (const item of items) {
      overrides[item.id] = {
        start_day_override: item.start_day_override,
        duration_days_override: item.duration_days_override
      };
    }

    // 4. Calculate auto start days (serial) for items without override
    //
    // Bobot dihitung terhadap JUMLAH harga item, bukan langsung terhadap
    // `total_project`. Keduanya kebetulan sama sekarang karena
    // `recalculateProposal` selalu menulis overhead = 0 dan contingency = 0,
    // tapi begitu keduanya dipulihkan, `total_project` menjadi lebih besar dari
    // jumlah harga item dan bobot tidak akan pernah mencapai 100%. Dengan
    // pembagi jumlah-harga-item, distribusinya tetap menghabiskan seluruh nilai
    // kontrak apa pun isi overhead.
    const totalHargaItem = jumlahUang(items.map((i: any) => i.total_price));

    let cursor = 0;
    const itemSchedules: any[] = [];
    for (const item of items) {
      const price = uang(item.total_price);
      const bobot = totalHargaItem > 0 ? price / totalHargaItem * 100 : 0;
      const ov = overrides[item.id];

      // Simplified: if no AHSP, duration=0
      // Get labor OH for duration estimate
      const laborItems = await dbAll(
        `SELECT ai.koefisien, ai.resource_satuan FROM ahsp_items ai
         JOIN proposal_items pi ON pi.ahsp_id = ai.ahsp_id
         WHERE pi.id = ? AND ai.section = 'A'`,
        [item.id]
      ) as any[];

      let autoDuration = 0;
      for (const li of laborItems) {
        const koef = parseFloat(li.koefisien) || 0;
        const oh = koef * (parseFloat(item.qty) || 0);
        const satuan = (li.resource_satuan || '').toUpperCase();
        autoDuration += satuan === 'OJ' ? oh / (workersPerDay * hoursPerDay) : oh / workersPerDay;
      }
      autoDuration = Math.round(autoDuration * 100) / 100;

      // Baris yang sudah terlanjur tersimpan SEBELUM validasi di atas ada tetap
      // bisa berisi angka liar. Dijepit di sini juga, supaya satu baris lama
      // tidak bisa menahan permintaan selama puluhan detik.
      const jepit = (v: number) => Math.min(Math.max(Number.isFinite(v) ? v : 0, 0), MAX_HARI_JADWAL);
      const startDay   = ov?.start_day_override   != null ? jepit(parseFloat(ov.start_day_override))   : cursor;
      const duration   = ov?.duration_days_override != null ? jepit(parseFloat(ov.duration_days_override)) : jepit(autoDuration);

      cursor = Math.max(cursor, startDay + duration);

      itemSchedules.push({ id: item.id, name: item.name, price, bobot, startDay, duration });
    }

    // 5. Distribute bobot into calendar months
    // `new Date("2026-03-01")` diurai sebagai tengah malam UTC, sedangkan batas
    // bulan di bawah dibentuk dengan `new Date(y, m, 1)` yang memakai waktu
    // lokal. Selisih zona waktu itu menggeser setiap irisan bulan: pada
    // pengujian, aktivitas 4 hari yang mestinya terbagi rata 50/50 antara Maret
    // dan April keluar 42,71/57,29. Tanggalnya karena itu diurai sebagai
    // tanggal kalender lokal supaya kedua sisi perhitungan memakai acuan sama.
    const [thn, bln, tgl] = startDateStr.split('-').map(Number);
    const startDate = Number.isFinite(thn) && Number.isFinite(bln) && Number.isFinite(tgl)
      ? new Date(thn, (bln || 1) - 1, tgl || 1)
      : new Date(startDateStr);
    const monthMap: Record<string, { label: string; planned_bobot: number; planned_amount: number; items: string[] }> = {};

    const getMonthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    const getMonthLabel = (key: string) => {
      const [y, m] = key.split('-');
      return new Date(+y, +m-1, 1).toLocaleDateString('id-ID', { month:'short', year:'numeric' });
    };

    const HARI = 86400000;
    const pastikanBulan = (key: string) => {
      if (!monthMap[key]) monthMap[key] = { label: getMonthLabel(key), planned_bobot: 0, planned_amount: 0, items: [] };
      return monthMap[key];
    };

    for (const sched of itemSchedules) {
      if (sched.bobot <= 0) continue;

      // Nilai rupiah item dihitung dari bobotnya terhadap nilai kontrak, bukan
      // dari `price` mentah — lihat catatan pembagi di langkah 4.
      const nilaiItem = totalContract * sched.bobot / 100;

      // Rentang setengah terbuka [start, end). Durasinya dipakai apa adanya
      // sebagai pecahan hari; versi lama membulatkannya dengan `Math.round`,
      // sehingga aktivitas 0,4 hari menjadi 0 hari dan nilainya hilang total.
      const mulaiMs = startDate.getTime() + sched.startDay * HARI;
      const selesaiMs = mulaiMs + sched.duration * HARI;
      const itemStart = new Date(mulaiMs);

      // Item tanpa durasi diperlakukan sebagai MILESTONE: seluruh nilainya jatuh
      // pada bulan tanggal mulainya.
      //
      // Versi lama melewatinya dengan `continue`, padahal nilainya sudah ikut
      // dihitung di total kontrak — jadi uangnya hilang dari kurva tanpa jejak,
      // sementara footer di layar tetap mencetak 100%. Aturan ini dipilih karena
      // "kegiatan tanpa rentang waktu terjadi pada satu titik waktu" adalah
      // pembacaan paling wajar, dan ia mempertahankan invarian jumlah = kontrak.
      if (sched.duration <= 0) {
        const m = pastikanBulan(getMonthKey(itemStart));
        m.planned_bobot += sched.bobot;
        m.planned_amount += nilaiItem;
        m.items.push(sched.name);
        continue;
      }

      // Jalan bulan demi bulan sepanjang rentang item.
      const cur = new Date(itemStart.getFullYear(), itemStart.getMonth(), 1);
      while (cur.getTime() < selesaiMs) {
        const key = getMonthKey(cur);
        const awalBulanMs = cur.getTime();
        // Batasnya AWAL BULAN BERIKUTNYA, bukan tengah malam hari terakhir.
        // Dengan batas lama, setiap aktivitas yang melintasi pergantian bulan
        // kehilangan satu hari alokasi, dan aktivitas satu hari tepat di akhir
        // bulan kehilangan seluruh bobotnya.
        const awalBulanBerikutMs = new Date(cur.getFullYear(), cur.getMonth() + 1, 1).getTime();

        const irisMulai = Math.max(mulaiMs, awalBulanMs);
        const irisSelesai = Math.min(selesaiMs, awalBulanBerikutMs);
        const hariIris = Math.max(0, (irisSelesai - irisMulai) / HARI);
        const fraction = hariIris / sched.duration;

        if (fraction > 0) {
          const m = pastikanBulan(key);
          m.planned_bobot += sched.bobot * fraction;
          m.planned_amount += nilaiItem * fraction;
          m.items.push(sched.name);
        }
        cur.setMonth(cur.getMonth() + 1);
      }
    }

    // 6. Build sorted monthly array with cumulative
    //
    // Pembulatan diselesaikan di sini, bukan dibiarkan menguap. Versi lama
    // memakai `toFixed(0)` per bulan tanpa pernah merekonsiliasi, jadi jumlah
    // seluruh bulan bisa meleset dari nilai kontrak beberapa rupiah — dan tidak
    // ada satu pun invarian yang memeriksanya, sementara footer di layar selalu
    // mencetak 100% apa pun hasilnya.
    //
    // Semua dihitung dalam sen bulat, lalu SELURUH sisa pembulatan ditaruh pada
    // periode terakhir sehingga jumlahnya sama persis dengan nilai kontrak.
    const months = Object.keys(monthMap).sort();
    const senKontrak = Math.round(totalContract * 100);
    const senPerBulan = months.map(key => Math.round(monthMap[key].planned_amount * 100));

    // Hanya nilai yang benar-benar teralokasi yang direkonsiliasi. Kalau ada
    // item yang tidak punya bobot sama sekali (mis. seluruh harga item nol),
    // selisihnya dilaporkan apa adanya sebagai `unallocated_amount` — bukan
    // dipaksa masuk ke bulan terakhir seolah-olah sudah terjadwal.
    const adaAlokasi = senPerBulan.length > 0 && totalHargaItem > 0;
    if (adaAlokasi) {
      const selisih = senKontrak - senPerBulan.reduce((a, b) => a + b, 0);
      senPerBulan[senPerBulan.length - 1] += selisih;
    }

    const bobotPer100 = months.map(key => Math.round(monthMap[key].planned_bobot * 100));
    if (adaAlokasi) {
      const selisihBobot = 10000 - bobotPer100.reduce((a, b) => a + b, 0);
      bobotPer100[bobotPer100.length - 1] += selisihBobot;
    }

    let cumSen = 0;
    let cumBobot100 = 0;
    const monthly = months.map((key, i) => {
      cumSen += senPerBulan[i];
      cumBobot100 += bobotPer100[i];
      return {
        month: key,
        label: monthMap[key].label,
        planned_bobot:     bobotPer100[i] / 100,
        planned_amount:    senPerBulan[i] / 100,
        cumulative_bobot:  cumBobot100 / 100,
        cumulative_amount: cumSen / 100,
        items: [...new Set(monthMap[key].items)].slice(0, 5)
      };
    });

    const totalTerjadwal = cumSen / 100;
    const belumTeralokasi = bulatUang(totalContract - totalTerjadwal);

    res.json({
      proposal_id: proposalId,
      total_contract: totalContract,
      start_date: startDateStr,
      monthly,
      total_months: monthly.length,
      total_items: itemSchedules.length,
      // Rekonsiliasi dinyatakan terbuka supaya layar tidak lagi bisa mencetak
      // 100% tanpa dasar. `reconciled` false berarti ada nilai kontrak yang
      // tidak masuk kurva sama sekali.
      scheduled_amount: totalTerjadwal,
      unallocated_amount: belumTeralokasi,
      reconciled: Math.abs(belumTeralokasi) < 0.005,
    });

  } catch (err: any) {
    console.error('Payment schedule error:', err);
    res.status(500).json({ error: err.message });
  }
});



// ── Progress: GET per-item progress

router.get('/proposals/:proposalId/schedule-progress/:itemId', authMiddleware, bolehLihat, async (req: Request, res: Response) => {
  try {
    // Membaca pun harus terikat induknya: tanpa ini, `:itemId` milik proposal
    // lain tetap dilayani dan isinya bocor ke pemanggil yang tidak berhak.
    const milik = await dbGet(
      'SELECT id FROM proposal_items WHERE id = ? AND proposal_id = ?',
      [req.params.itemId, req.params.proposalId]
    );
    if (!milik) return res.status(404).json(BUKAN_MILIK.body);

    const rows = await dbAll(
      `SELECT unit_number, step_code, step_name, status, updated_at, notes
       FROM schedule_progress WHERE proposal_item_id = ? ORDER BY unit_number, step_code`,
      [req.params.itemId]
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: 'Failed to get progress' });
  }
});

// ── Progress: PUT update step status
router.put('/proposals/:proposalId/schedule-progress', authMiddleware, bolehUbah, async (req: Request, res: Response) => {
  try {
    const { proposal_item_id, unit_number, step_code, step_name, status, notes } = req.body;
    // `authMiddleware` menyetel `userId` (camelCase). Membaca `user_id` selalu
    // menghasilkan undefined, sehingga created_by SELALU jatuh ke 1 — proposal
    // tercatat atas nama orang lain, dan gagal total kalau user id 1 tidak ada.
    const userId = (req as any).user?.userId || (req as any).userId || null;
    if (proposal_item_id == null) {
      return res.status(400).json({ error: 'proposal_item_id wajib diisi' });
    }

    const hasil = await withTransaction(async tx => {
      const terkunci = await proposalLockTx(req.params.proposalId, tx);
      if (terkunci) return { error: terkunci.status, body: terkunci.body };

      if (!(await itemMilikProposal(req.params.proposalId, proposal_item_id, tx))) return BUKAN_MILIK;

      await tx.run(
        `INSERT INTO schedule_progress (proposal_item_id, unit_number, step_code, step_name, status, updated_by, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE status=VALUES(status), step_name=VALUES(step_name),
           updated_by=VALUES(updated_by), notes=VALUES(notes), updated_at=NOW()`,
        [proposal_item_id, unit_number, step_code, step_name, status, userId, notes || null]
      );
      return { ok: true as const };
    });

    if ('error' in hasil) return res.status(hasil.error).json(hasil.body);
    res.json({ message: 'Progress updated' });
  } catch (e) {
    console.error('Progress update error:', e);
    res.status(500).json({ error: 'Failed to update progress' });
  }
});


router.post('/proposals', authMiddleware, bolehBuat, async (req: Request, res: Response) => {
  try {
    const { project_name, client, client_id, lokasi, revision, proposal_type, design_params, template_sections } = req.body;
    // `authMiddleware` menyetel `userId` (camelCase). Membaca `user_id` selalu
    // menghasilkan undefined, sehingga created_by SELALU jatuh ke 1 — proposal
    // tercatat atas nama orang lain, dan gagal total kalau user id 1 tidak ada.
    const userId = (req as any).user?.userId || (req as any).userId || null;
    
    if (!project_name) {
      return res.status(400).json({ error: 'project_name is required' });
    }
    
    // DR-P1-05: nomor atomic + header + seluruh item template SATU transaction.
    //
    // Sebelumnya nomornya `MAX(...)+1` lalu INSERT dengan autocommit: dua
    // pembuatan bersamaan membaca MAX yang sama dan yang kalah keluar sebagai
    // 500. Item template pun ditulis terpisah, jadi kegagalan di tengah
    // meninggalkan proposal setengah jadi yang tetap terlihat sah.
    const { proposalId, proposalNumber } = await withTransaction(async tx => {
    const proposalNumber = await nextProposalNumber(tx);

    // Label dan relasi client diselaraskan sejak pembuatan — lihat
      // `selaraskanClient`. Endpoint create punya kontrak yang sama dengan
      // update: pasangan bebas dari body tidak pernah disimpan apa adanya.
      const klienBaru = await selaraskanClient(client_id, client, tx.get);
      if (!klienBaru.ok) {
        throw Object.assign(new Error('CLIENT_TIDAK_DITEMUKAN'),
          { lock: { status: 400, body: { error: klienBaru.pesan, code: 'CLIENT_TIDAK_DITEMUKAN' } } });
      }

      const result = await tx.run(
      `INSERT INTO proposals (proposal_number, project_name, client, client_id, lokasi, revision, proposal_type, design_params, status, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?)`,
      [proposalNumber, project_name, klienBaru.client, klienBaru.client_id, lokasi || null, revision || 'Rev-0', 
       proposal_type || null, design_params ? JSON.stringify(design_params) : null, userId]
    );
    
    const proposalId = result.insertId;
    
    // Auto-create section headers and sub-items from template
    if (template_sections && Array.isArray(template_sections) && template_sections.length > 0) {
      // Map proposal_type to AHSP code prefix
      const typePrefix: Record<string, string> = {
        civil_building: 'CB', civil_structure: 'CS', piping: 'PP',
        electrical: 'EL', mechanical: 'ME'
      };
      const prefix = typePrefix[proposal_type as string] || '';

      // Pre-fetch all template AHSP entries for this work type
      let ahspLookup: Record<string, any> = {};
      if (prefix) {
        const ahspRows = await tx.all(
          `SELECT id, kode, name, satuan, harga_satuan FROM ahsp_headers WHERE kode LIKE ? AND status='active'`,
          [`${prefix}.%`]
        );
        for (const row of ahspRows as any[]) {
          ahspLookup[row.name] = row;
        }
      }

      let orderNo = 1;
      for (let i = 0; i < template_sections.length; i++) {
        const section = template_sections[i];
        // Insert section header row
        await tx.run(
          `INSERT INTO proposal_items 
           (proposal_id, ahsp_code_snapshot, ahsp_name_snapshot, unit_snapshot, unit_price_snapshot,
            description, qty, total_price, order_no, section_label, is_section, section_order)
           VALUES (?, ?, ?, '', 0, ?, 0, 0, ?, ?, 1, ?)`,
          [proposalId, section.code || '', section.name, section.description || null, orderNo, section.name, i + 1]
        );
        orderNo++;

        // Insert sub-items (children) as regular proposal items
        if (section.children && Array.isArray(section.children)) {
          for (const child of section.children) {
            // Volume, unit, dan pilihan AHSP dari wizard dipakai — lihat
            // `barisDariTemplate`. Sebelumnya semuanya dibuang dan baris selalu
            // masuk dengan qty 0.
            const b = await barisDariTemplate(child, section, ahspLookup, tx.get);

            await tx.run(
              `INSERT INTO proposal_items 
               (proposal_id, ahsp_id, ahsp_code_snapshot, ahsp_name_snapshot, unit_snapshot, unit_price_snapshot,
                description, qty, total_price, order_no, section_label, is_section, section_order)
               VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, NULL, 0, ?)`,
              [proposalId, b.ahspId, b.ahspCode, b.ahspName, b.ahspUnit, b.harga,
               b.qty, b.total, orderNo, i + 1]
            );
            orderNo++;
          }
        }
      }
    }

    // Header wajib mencerminkan baris yang barusan disisipkan.
    //
    // Selama template selalu masuk dengan qty 0, memanggil ini tidak pernah
    // terasa perlu — hasilnya nol juga. Begitu volume dari wizard benar-benar
    // dipakai, ketiadaannya langsung terlihat: baris bernilai 11 juta sementara
    // `total_project` di header tetap 0.
    if (template_sections && Array.isArray(template_sections) && template_sections.length > 0) {
      await recalculateProposal(proposalId, tx);
    }

    return { proposalId, proposalNumber };
    });
    
    res.status(201).json({ 
      message: 'Proposal created', 
      id: proposalId,
      proposal_number: proposalNumber 
    });
  } catch (error) {
    console.error('Error creating proposal:', error);
    res.status(500).json({ error: 'Failed to create proposal' });
  }
});

// Update proposal
router.put('/proposals/:id', authMiddleware, bolehUbah, async (req: Request, res: Response) => {
  try {
    const { project_name, client, client_id, lokasi, revision } = req.body;

    // EST-MTO-R22: endpoint ini dulu bisa dipakai untuk dua hal terlarang
    // sekaligus.
    //
    // Pertama, `status` diambil langsung dari body lalu ditulis apa adanya —
    // melewati seluruh aturan transisi di `PUT /proposals/:id/status`
    // (draft → review → submitted → deal). Proposal bisa lompat dari draft
    // langsung ke deal, atau mundur dari deal ke draft, tanpa pemeriksaan apa pun.
    //
    // Kedua, tidak ada pemeriksaan kunci, jadi proposal yang sudah submitted
    // masih bisa diubah identitasnya.
    if (Object.prototype.hasOwnProperty.call(req.body, 'status')) {
      return res.status(400).json({
        error: 'Status tidak bisa diubah lewat endpoint ini. Gunakan PUT /proposals/:id/status supaya aturan transisinya diperiksa.',
        code: 'USE_STATUS_ENDPOINT',
      });
    }

    // DR-P1-05: pemeriksaan kunci dan penulisannya harus satu transaction.
    //
    // `proposalLock()` di luar transaction tidak mengunci apa pun — pelajaran
    // yang sudah berulang di R26/R33. Permintaan submit yang berlomba bisa
    // menyelip di antara pemeriksaan dan UPDATE, sehingga metadata proposal yang
    // sudah submitted tetap berubah.
    const hasil = await withTransaction(async tx => {
      const terkunci = await proposalLockTx(req.params.id, tx);
      if (terkunci) return { error: terkunci.status, body: terkunci.body };

      // Label dan relasi client diselaraskan — lihat `selaraskanClient`.
      const klien = await selaraskanClient(client_id, client, tx.get);
      if (!klien.ok) {
        return { error: 400, body: { error: klien.pesan, code: 'CLIENT_TIDAK_DITEMUKAN' } };
      }

      await tx.run(
        `UPDATE proposals
         SET project_name = ?, client = ?, client_id = ?, lokasi = ?, revision = ?
         WHERE id = ?`,
        [project_name, klien.client, klien.client_id, lokasi, revision, req.params.id]
      );
      return { ok: true as const };
    });

    if ('error' in hasil) return res.status(hasil.error).json(hasil.body);
    res.json({ message: 'Proposal updated' });
  } catch (error) {
    console.error('Error updating proposal:', error);
    res.status(500).json({ error: 'Failed to update proposal' });
  }
});

/**
 * Registry tipe template → prefix kode AHSP.
 *
 * Dipakai dua kali: memvalidasi `proposal_type` yang masuk, dan memilih AHSP.
 * Harus satu daftar — kalau validasi memakai daftar lain, tipe yang lolos
 * validasi tapi tidak ada di sini menghasilkan template kosong tanpa memberi
 * tahu siapa pun.
 */
const TIPE_TEMPLATE: Record<string, string> = {
  civil_building: 'CB', civil_structure: 'CS', piping: 'PP',
  electrical: 'EL', mechanical: 'ME',
};

// Apply template wizard to existing proposal
router.post('/proposals/:id/apply-template', authMiddleware, bolehUbah, async (req: Request, res: Response) => {
  try {
    // EST-MTO-R23: menerapkan template menyisipkan item RAB baru, jadi ia
    // mengubah nilai komersial persis seperti menambah item satu per satu.
    // Tanpa kunci, proposal yang sudah dikirim ke pelanggan masih bisa
    // ditambahi seluruh paket pekerjaan.
    const proposalId = req.params.id;
    const { proposal_type, template_sections, mode = 'append', design_params } = req.body;
    // mode: 'append' = add items | 'replace' = delete existing items first

    if (!template_sections || !Array.isArray(template_sections) || template_sections.length === 0) {
      return res.status(400).json({ error: 'template_sections required' });
    }

    // EST-TPL-R43: parameter desain yang menghasilkan template ini ikut disimpan.
    //
    // Sebelumnya handler hanya mendestruktur tiga field dan hanya menulis
    // `proposal_type`. `proposals.design_params` karena itu tetap berisi
    // geometry template SEBELUMNYA — atau null — sementara RAB dan MTO sudah
    // berasal dari dimensi yang baru. Tidak ada yang bisa membuktikan parameter
    // mana yang menghasilkan kuantitas aktif, dan regenerasi tidak reproducible.
    if (design_params !== undefined && design_params !== null
        && (typeof design_params !== 'object' || Array.isArray(design_params))) {
      return res.status(422).json({
        error: 'design_params harus berupa objek parameter desain.',
        code: 'DESIGN_PARAMS_TIDAK_VALID',
        field: 'design_params',
      });
    }

    // Divalidasi terhadap registry yang sama dengan yang dipakai memilih AHSP di
    // bawah. Tipe di luar itu tidak akan menemukan satu pun AHSP, jadi
    // menerimanya berarti menghasilkan template kosong tanpa memberi tahu.
    if (proposal_type && !(proposal_type in TIPE_TEMPLATE)) {
      return res.status(422).json({
        error: `Tipe proposal "${proposal_type}" tidak dikenal.`,
        code: 'TIPE_PROPOSAL_TIDAK_DIKENAL',
        field: 'proposal_type',
        tipe_dikenal: Object.keys(TIPE_TEMPLATE),
      });
    }

    const lockedTpl = await proposalLock(proposalId);
    if (lockedTpl) return res.status(lockedTpl.status).json(lockedTpl.body);

    // EST-MTO-R28: seluruh penerapan template berjalan dalam SATU transaction,
    // dengan status proposal diperiksa ulang di dalamnya.
    //
    // Sebelumnya tiap section dan tiap child di-INSERT satu per satu dengan
    // autocommit. Kalau gagal di tengah, proposal menyisakan separuh template —
    // beberapa section masuk, sisanya tidak, dan `direct_cost` mencerminkan
    // keadaan setengah jalan itu.
    const applied = await withTransaction(async tx => {
      const raceLock = await proposalLockTx(req.params.id, tx);
      if (raceLock) return { error: raceLock.status, body: raceLock.body };

      // Keadaan header dibaca DI DALAM transaction, dari baris yang sudah
      // dikunci `proposalLockTx`.
      const header: any = await tx.get(
        'SELECT proposal_type, design_params FROM proposals WHERE id = ?', [proposalId]);

      // EST-TPL-R43: `append` tipe berbeda ditolak, tidak menimpa header.
      //
      // Menambahkan paket Electrical ke proposal Civil dulu menyisakan seluruh
      // item Civil tapi mengubah header menjadi Electrical — proposal berisi
      // scope dua disiplin sambil mengaku satu, dan parameter Civil lamanya
      // masih tersimpan di satu-satunya JSON `design_params`. Skema memang hanya
      // menyediakan satu `proposal_type` dan satu `design_params`, jadi selama
      // model multi-tipe belum ada, ditolak lebih jujur daripada menimpa.
      if (mode !== 'replace' && proposal_type && header?.proposal_type
          && header.proposal_type !== proposal_type) {
        return { error: 409, body: {
          error: `Proposal ini bertipe "${header.proposal_type}". Menambahkan template `
            + `"${proposal_type}" akan membuat header mengaku satu tipe sementara isinya dua. `
            + 'Pakai mode Replace, atau buat proposal terpisah untuk disiplin itu.',
          code: 'TIPE_TEMPLATE_BERBEDA',
          tipe_proposal: header.proposal_type,
          tipe_template: proposal_type,
        } };
      }

      if (mode === 'replace') {
      await tx.run('DELETE FROM proposal_items WHERE proposal_id = ?', [proposalId]);
    }

    // Basis desain header diperbarui bersama itemnya, dalam transaction yang
    // sama. Riwayat penerapan disimpan supaya proposal yang ditambahi beberapa
    // kali tetap bisa direkonstruksi — entri ber-`mode: 'replace'` menandai
    // bahwa semua yang sebelumnya sudah tidak menghasilkan apa-apa lagi.
    if (proposal_type || design_params !== undefined) {
      let lama: any = {};
      try {
        lama = typeof header?.design_params === 'string'
          ? JSON.parse(header.design_params || '{}') : (header?.design_params || {});
      } catch { lama = {}; }
      const riwayat = Array.isArray(lama._penerapan) ? lama._penerapan : [];
      const aktif = design_params !== undefined && design_params !== null ? design_params : {};
      const { _penerapan: _abaikan, ...paramLamaBersih } = lama;

      const barusan = {
        tipe: proposal_type || header?.proposal_type || null,
        mode,
        parameter: aktif,
        jumlah_seksi: template_sections.length,
        oleh: (req as any).userId ?? null,
        pada: new Date().toISOString(),
      };

      const gabungan = design_params !== undefined && design_params !== null
        ? { ...aktif, _penerapan: [...riwayat, barusan] }
        : { ...paramLamaBersih, _penerapan: [...riwayat, barusan] };

      await tx.run(
        'UPDATE proposals SET proposal_type = ?, design_params = ? WHERE id = ?',
        [proposal_type || header?.proposal_type || null, JSON.stringify(gabungan), proposalId]
      );
    }

    const prefix = TIPE_TEMPLATE[proposal_type as string] || '';

    let ahspLookup: Record<string, any> = {};
    if (prefix) {
      const ahspRows = await tx.all(
        `SELECT id, kode, name, satuan, harga_satuan FROM ahsp_headers WHERE kode LIKE ? AND status='active'`,
        [`${prefix}.%`]
      );
      for (const row of ahspRows as any[]) ahspLookup[(row as any).name] = row;
    }

    // Get current max order_no so appended items come after existing
    const maxOrderRow: any = await tx.get(
      'SELECT COALESCE(MAX(order_no), 0) as maxOrd FROM proposal_items WHERE proposal_id = ?',
      [proposalId]
    );
    let orderNo = (maxOrderRow?.maxOrd || 0) + 1;
    const startSection = (await tx.get(
      'SELECT COALESCE(MAX(section_order), 0) as maxSec FROM proposal_items WHERE proposal_id = ?',
      [proposalId]
    ) as any)?.maxSec || 0;

    for (let i = 0; i < template_sections.length; i++) {
      const section = template_sections[i];
      await tx.run(
        `INSERT INTO proposal_items
         (proposal_id, ahsp_code_snapshot, ahsp_name_snapshot, unit_snapshot, unit_price_snapshot,
          description, qty, total_price, order_no, section_label, is_section, section_order)
         VALUES (?, ?, ?, '', 0, ?, 0, 0, ?, ?, 1, ?)`,
        [proposalId, section.code || '', section.name, section.description || null, orderNo, section.name, startSection + i + 1]
      );
      orderNo++;

      if (section.children && Array.isArray(section.children)) {
        for (const child of section.children) {
          // Sama seperti jalur create: volume dan pilihan AHSP dari wizard
          // dipakai, bukan dibuang lalu diganti qty 0.
          const b = await barisDariTemplate(child, section, ahspLookup, tx.get);

          await tx.run(
            `INSERT INTO proposal_items
             (proposal_id, ahsp_id, ahsp_code_snapshot, ahsp_name_snapshot, unit_snapshot, unit_price_snapshot,
              description, qty, total_price, order_no, section_label, is_section, section_order)
             VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, NULL, 0, ?)`,
            [proposalId, b.ahspId, b.ahspCode, b.ahspName, b.ahspUnit, b.harga,
             b.qty, b.total, orderNo, startSection + i + 1]
          );
          orderNo++;
        }
      }
    }

      // Ringkasan ikut dihitung ulang di dalam transaction yang sama.
      await recalculateProposal(proposalId as string, tx);
      return { ok: true as const, itemsAdded: orderNo - (maxOrderRow?.maxOrd || 0) - 1 };
    });

    if ('error' in applied) return res.status(applied.error).json(applied.body);
    res.json({ message: 'Template applied', items_added: applied.itemsAdded });
  } catch (error) {
    console.error('Error applying template:', error);
    res.status(500).json({ error: 'Failed to apply template' });
  }
});

// Delete proposal
router.delete('/proposals/:id', authMiddleware, bolehHapus, async (req: Request, res: Response) => {
  try {
    // EST-MTO-R25: penghapusan proposal sebelumnya tanpa pemeriksaan apa pun.
    //
    // Proposal berstatus `deal` adalah kesepakatan yang sudah melahirkan project,
    // PO, dan pekerjaan di lapangan. Menghapusnya membuat dokumen turunan itu
    // kehilangan sumbernya. Yang submitted pun sudah dikirim ke pelanggan.
    // DR-P1-05: baca-periksa-hapus tanpa lock. Permintaan submit yang berlomba
    // bisa lolos setelah pemeriksaan awal, sehingga proposal yang baru saja
    // menjadi submitted tetap terhapus.
    const hasil = await withTransaction(async tx => {
      const proposal: any = await tx.get(
        'SELECT id, status, project_id FROM proposals WHERE id = ? FOR UPDATE', [req.params.id]
      );
      if (!proposal) return { error: 404, body: { error: 'Proposal tidak ditemukan' } };

      if (!isProposalEditable(proposal.status)) {
        return {
          error: 409,
          body: {
            error: `Proposal berstatus "${proposal.status}" tidak bisa dihapus. Hanya draft dan review yang boleh.`,
            code: 'PROPOSAL_LOCKED',
            status_proposal: proposal.status,
          },
        };
      }

      if (proposal.project_id) {
        return {
          error: 409,
          body: {
            error: 'Proposal ini sudah terhubung ke project, jadi tidak bisa dihapus.',
            code: 'PROPOSAL_HAS_PROJECT',
            project_id: proposal.project_id,
          },
        };
      }

      // EST-LIFE-R42: turunan yang TIDAK punya FK ke `proposals` harus dihapus
      // eksplisit di sini.
      //
      // `proposal_items` dan `proposal_audit_logs` punya FK CASCADE, jadi ikut
      // hilang sendiri. `engineering_inputs` tidak — ia polymorphic
      // (`scope_type` proposal/project) dan hanya ber-index, tanpa FK. Sebelum
      // ini, menghapus proposal draft yang sudah punya MTO meninggalkan seluruh
      // elemen dan barisnya utuh di database, menunjuk id proposal yang sudah
      // tidak ada. Tidak ada satu pun layar atau endpoint yang bisa
      // menjangkaunya, karena semua pembacaan MTO menyaring lewat proposal yang
      // masih hidup — jadi data itu tidak bisa dilihat maupun dibersihkan
      // pengguna.
      //
      // `mto_lines` dihapus lebih dulu secara eksplisit meski FK-nya CASCADE
      // dari `engineering_inputs`: jalur hapus elemen tunggal juga melakukannya
      // begitu, dan tidak bergantung pada FK yang mungkin absen di instalasi
      // lama membuat pembersihannya pasti.
      const elemen: any[] = await tx.all(
        `SELECT id FROM engineering_inputs WHERE scope_type = 'proposal' AND scope_id = ?`,
        [req.params.id]
      );
      if (elemen.length > 0) {
        await tx.run(
          `DELETE FROM mto_lines WHERE element_id IN (${elemen.map(() => '?').join(',')})`,
          elemen.map(e => e.id)
        );
      }
      await tx.run(
        `DELETE FROM engineering_inputs WHERE scope_type = 'proposal' AND scope_id = ?`,
        [req.params.id]
      );

      // Outbox handoff procurement juga tanpa FK. Proposal draft/review
      // semestinya belum punya baris di sini — tapi "semestinya" bukan jaminan,
      // dan baris tertinggal di outbox berarti pekerjaan yang menunggu sumber
      // yang sudah lenyap.
      await tx.run('DELETE FROM deal_pr_jobs WHERE proposal_id = ?', [req.params.id]);

      await tx.run('DELETE FROM proposals WHERE id = ?', [req.params.id]);
      return { ok: true as const, elemen_terhapus: elemen.length };
    });

    if ('error' in hasil) return res.status(hasil.error).json(hasil.body);
    res.json({ message: 'Proposal deleted', elemen_mto_terhapus: hasil.elemen_terhapus });
  } catch (error) {
    console.error('Error deleting proposal:', error);
    res.status(500).json({ error: 'Failed to delete proposal' });
  }
});

// ============================================
// PROPOSAL ITEMS ENDPOINTS
// ============================================

// Add item to proposal
/**
 * EST-KLAS-R41: klasifikasi satu baris tidak boleh datang dari dua acuan klien.
 *
 * `discipline_id` dan `sub_discipline_id` dulu diterima sebagai dua input
 * independen lalu disimpan apa adanya. Keduanya bisa valid sendiri-sendiri
 * sementara pasangannya salah — dan akibatnya baru muncul jauh di hilir:
 * ringkasan discipline menjumlahkan `pi.discipline_id`, ringkasan
 * sub-discipline mengembalikan parent kanonik dari master, dan pohon RAB
 * mencetak sub apa pun yang tersimpan di bawah `pi.discipline_id`. Satu baris
 * yang sama muncul sebagai Civil di satu laporan dan Piping di laporan lain,
 * padahal grand total-nya benar — jadi tidak ada angka yang terlihat janggal.
 *
 * Kontraknya sekarang: **sub-discipline yang menentukan parent.** Itu acuan yang
 * lebih spesifik, dan urutannya sama dengan cara layar bekerja (pilih discipline
 * dulu, sub sebagai penajaman). Kalau klien mengirim pasangan silang, parent
 * kanonik yang dipakai — bukan ditolak, karena menolak akan menghentikan
 * pekerjaan yang maksudnya jelas. Nilai yang benar-benar tersimpan dikembalikan
 * di respons supaya pemanggil bisa melihat apa yang terjadi.
 */
// Satu bentuk objek, bukan union: `strictNullChecks` mati di project ini,
// sehingga penyempitan discriminated union tidak bekerja.
interface HasilKlasifikasi {
  ok: boolean;
  discipline_id: number | null;
  sub_discipline_id: number | null;
  error: number;
  body: any;
}
const klasOk = (d: number | null, sd: number | null): HasilKlasifikasi =>
  ({ ok: true, discipline_id: d, sub_discipline_id: sd, error: 0, body: null });
const klasGagal = (error: number, body: any): HasilKlasifikasi =>
  ({ ok: false, discipline_id: null, sub_discipline_id: null, error, body });

async function selaraskanKlasifikasi(
  disciplineId: any, subDisciplineId: any, get: (sql: string, p?: any[]) => Promise<any>
): Promise<HasilKlasifikasi> {
  if (subDisciplineId) {
    const sub: any = await get(
      `SELECT id, discipline_id, name, is_active FROM master_sub_disciplines WHERE id = ?`,
      [subDisciplineId]
    );
    if (!sub) {
      return klasGagal(404, {
        error: 'Sub-discipline tidak ditemukan.', code: 'SUB_DISCIPLINE_TIDAK_DITEMUKAN' });
    }
    if (!Number(sub.is_active)) {
      // Tidak dibiarkan jatuh diam-diam ke "unassigned": baris tanpa
      // klasifikasi tidak akan pernah muncul di breakdown mana pun.
      return klasGagal(409, {
        error: `Sub-discipline "${sub.name}" sudah tidak aktif.`, code: 'SUB_DISCIPLINE_TIDAK_AKTIF' });
    }
    return klasOk(Number(sub.discipline_id), Number(sub.id));
  }

  if (disciplineId) {
    const d: any = await get(
      `SELECT id, name, is_active FROM master_disciplines WHERE id = ?`, [disciplineId]);
    if (!d) {
      return klasGagal(404, {
        error: 'Discipline tidak ditemukan.', code: 'DISCIPLINE_TIDAK_DITEMUKAN' });
    }
    if (!Number(d.is_active)) {
      return klasGagal(409, {
        error: `Discipline "${d.name}" sudah tidak aktif.`, code: 'DISCIPLINE_TIDAK_AKTIF' });
    }
    return klasOk(Number(d.id), null);
  }

  return klasOk(null, null);
}

router.post('/proposals/:proposalId/items', authMiddleware, bolehUbah, async (req: Request, res: Response) => {
  try {
    // EST-MTO-R18: seluruh perubahan yang menggeser nilai komersial ikut dikunci.
    // Mengunci MTO saja tidak cukup — qty item RAB bisa diubah langsung lewat
    // endpoint ini dan penawaran yang sudah dikirim ikut berubah.
    const lockedRab = await proposalLock(req.params.proposalId);
    if (lockedRab) return res.status(lockedRab.status).json(lockedRab.body);

    const { ahsp_id, qty, discipline_id, sub_discipline_id } = req.body;
    const proposalId = req.params.proposalId;
    
    if (!ahsp_id) {
      return res.status(400).json({ error: 'ahsp_id is required' });
    }
    
    const qtyCek = validasiQty(qty);
    if (!qtyCek.ok) return res.status(400).json({ error: qtyCek.pesan, code: 'QTY_TIDAK_VALID' });

    const qtyValue = qtyCek.qty;
    
    // EST-MTO-R29: mutasi item dan penghitungan ulang ringkasan adalah SATU unit.
    //
    // Melempar error dari recalculateProposal() tidak bisa membatalkan SQL yang
    // sudah ter-commit sebelumnya. Kalau recalc gagal setelah item berubah,
    // yang tersisa: baris sudah berubah, header belum, dan klien menerima 500.
    const insertedId = await withTransaction(async tx => {
      // EST-MTO-R33: status diperiksa ulang DI DALAM transaction ini.
      const raceLock = await proposalLockTx(proposalId, tx);
      if (raceLock) throw Object.assign(new Error('PROPOSAL_LOCKED'), { lock: raceLock });

      // `order_no` dihitung DI DALAM transaction yang sudah mengunci proposal.
      //
      // Sebelumnya `MAX(order_no)+1` dibaca lewat pool sebelum transaction
      // dibuka, lalu dibekukan ke variabel. Lock-nya memang menyerialkan INSERT,
      // tapi tidak menghitung ulang urutan dari state terkunci — dua penambahan
      // bersamaan sama-sama membaca angka lama dan memakai urutan yang sama.
      // Sama pola dengan pembacaan harga/qty pada PUT item: yang dikunci harus
      // state yang dipakai menghitung, bukan hanya penulisannya.
      // EST-AHSP-R40: snapshot diambil DI DALAM transaction, dari AHSP yang
      // masih aktif, dengan barisnya ditahan `FOR SHARE`.
      //
      // Dua cacat sekaligus di versi lama. Pertama, tidak ada predikat status
      // sama sekali — padahal katalog `GET /ahsp` hanya menyajikan yang aktif,
      // "delete" AHSP sebenarnya menonaktifkan, dan jalur assign sudah
      // mensyaratkan aktif. Kontrak jalur tulis lebih longgar daripada katalog
      // untuk operasi bisnis yang sama, jadi id lama dari tab, cache, atau retry
      // bisa membekukan harga yang sudah ditarik sebagai scope baru.
      //
      // Kedua, pembacaannya di LUAR transaction: status master bisa berubah di
      // sela baca→insert tanpa diperiksa lagi. `FOR SHARE` membuat penonaktifan
      // yang berlomba menunggu, sehingga hasilnya selalu satu dari dua keadaan
      // yang jelas — snapshot dibuat saat AHSP masih aktif, atau penambahannya
      // ditolak.
      const ahsp: any = await tx.get(
        `SELECT kode, name, satuan, harga_satuan, status FROM ahsp_headers WHERE id = ? FOR SHARE`,
        [ahsp_id]
      );
      if (!ahsp) {
        return { error: 404, body: { error: 'AHSP not found', code: 'AHSP_TIDAK_DITEMUKAN' } };
      }
      if (ahsp.status !== 'active') {
        // Sengaja dibedakan dari 404: "tidak ada" dan "ada tapi sudah ditarik"
        // adalah dua keadaan berbeda, dan yang kedua bisa diperbaiki pengguna.
        return { error: 409, body: {
          error: `AHSP "${ahsp.kode} — ${ahsp.name}" sudah tidak aktif dan tidak bisa dipakai `
            + 'sebagai lingkup baru. Pilih AHSP lain dari katalog.',
          code: 'AHSP_TIDAK_AKTIF',
          ahsp_status: ahsp.status,
        } };
      }

      const unitPrice = parseFloat(ahsp.harga_satuan as any) || 0;
      const totalPrice = bulatUang(qtyValue * unitPrice);

      // Klasifikasi diselaraskan di dalam transaction yang sama.
      const klas = await selaraskanKlasifikasi(discipline_id, sub_discipline_id, tx.get);
      if (!klas.ok) return { error: klas.error, body: klas.body };

      // `order_no` dihitung DI DALAM transaction yang sudah mengunci proposal.
      const urutan: any = await tx.get(
        'SELECT COALESCE(MAX(order_no), 0) AS maks FROM proposal_items WHERE proposal_id = ?',
        [proposalId]
      );
      const orderNo = Number(urutan?.maks || 0) + 1;

      const r = await tx.run(
        `INSERT INTO proposal_items
         (proposal_id, discipline_id, sub_discipline_id, ahsp_id,
          ahsp_code_snapshot, ahsp_name_snapshot, unit_snapshot, unit_price_snapshot,
          qty, total_price, order_no)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [proposalId, klas.discipline_id, klas.sub_discipline_id, ahsp_id,
         ahsp.kode, ahsp.name, ahsp.satuan, unitPrice,
         qtyValue, totalPrice, orderNo]
      );
      await recalculateProposal(proposalId as string, tx);
      return {
        ok: true as const, id: r.insertId,
        discipline_id: klas.discipline_id, sub_discipline_id: klas.sub_discipline_id,
      };
    });

    if ('error' in insertedId) return res.status(insertedId.error).json(insertedId.body);
    // Klasifikasi yang BENAR-BENAR tersimpan dikembalikan — kalau klien mengirim
    // pasangan silang, di sinilah ia melihat parent kanonik yang dipakai.
    res.status(201).json({
      message: 'Item added',
      id: insertedId.id,
      discipline_id: insertedId.discipline_id,
      sub_discipline_id: insertedId.sub_discipline_id,
    });
  } catch (error: any) {
    if (error?.lock) return res.status(error.lock.status).json(error.lock.body);
    console.error('Error adding proposal item:', error);
    res.status(500).json({ error: 'Failed to add proposal item' });
  }
});

// Update proposal item (qty)
router.put('/proposals/:proposalId/items/:itemId', authMiddleware, bolehUbah, async (req: Request, res: Response) => {
  try {
    // EST-MTO-R18: perubahan yang menggeser nilai komersial ikut dikunci.
    const lockedRab = await proposalLock(req.params.proposalId);
    if (lockedRab) return res.status(lockedRab.status).json(lockedRab.body);

    const { qty, description, ahsp_id } = req.body;
    const { proposalId, itemId } = req.params;

    if (qty === undefined && description === undefined && ahsp_id === undefined) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    // Validasi bentuk qty dilakukan di luar — murni pemeriksaan input, tidak
    // bergantung state apa pun.
    let qtyBaru: number | null = null;
    if (qty !== undefined) {
      const qtyCek = validasiQty(qty);
      if (!qtyCek.ok) return res.status(400).json({ error: qtyCek.pesan, code: 'QTY_TIDAK_VALID' });
      qtyBaru = qtyCek.qty;
    }

    // ── Seluruh baca-hitung-tulis berada DI DALAM satu transaction ───────────
    //
    // Versi sebelumnya membaca `unit_price_snapshot`, `qty` lama, dan harga AHSP
    // di LUAR transaction, lalu menulis hasilnya di dalam. Lock proposal karena
    // itu hanya menyerialkan penulisan — bukan state yang dipakai untuk
    // menghitung penulisan itu. Dua permintaan bersamaan (satu mengubah qty,
    // satu mengganti AHSP) sama-sama menghitung dari pembacaan lama, dan yang
    // menang terakhir meninggalkan `total_price` yang tidak cocok dengan
    // `qty × unit_price_snapshot` — tanpa satu pun pemeriksaan yang menangkapnya.
    //
    // Barisnya kini dikunci `FOR UPDATE`, jadi permintaan kedua menunggu dan
    // membaca keadaan yang SUDAH diperbarui.
    const hasil = await withTransaction(async tx => {
      // EST-MTO-R33: status diperiksa ulang di dalam transaction ini.
      const raceLock = await proposalLockTx(proposalId, tx);
      if (raceLock) return { error: raceLock.status, body: raceLock.body };

      // EST-MTO-R21: item harus benar-benar milik proposal di URL — tanpa ini
      // cukup menyebut proposal draft lalu menunjuk id milik proposal submitted.
      const item: any = await tx.get(
        `SELECT id, qty, unit_price_snapshot, mto_link FROM proposal_items
         WHERE id = ? AND proposal_id = ? FOR UPDATE`,
        [itemId, proposalId]
      );
      if (!item) {
        return { error: 404, body: {
          error: 'Item RAB tidak ditemukan pada proposal ini',
          code: 'ITEM_NOT_IN_PROPOSAL',
        } };
      }

      // EST-MTO-R39: qty item yang masih tertaut MTO tidak boleh diubah lewat
      // jalur item generik.
      //
      // Kuantitas item tertaut adalah turunan dari baris MTO — bukan isian.
      // Menerima qty di sini menghasilkan item yang provenance-nya menyatakan
      // "net 100 dari elemen X" sementara nilainya sesuatu yang lain, dan
      // kontradiksi itu tidak lagi punya jejak siapa yang membuatnya.
      //
      // Ini juga menutup jalur `link → unlink → blur` di layar: input yang
      // kembali aktif tidak bisa lagi memersistenkan angka gross yang tertinggal
      // di state sebagai qty manual.
      if (qtyBaru !== null && item.mto_link) {
        return { error: 409, body: {
          error: 'Kuantitas item ini berasal dari tautan MTO. Lepas tautannya dulu '
            + 'kalau memang mau diisi manual, atau ubah elemen MTO-nya lalu simpan ulang.',
          code: 'ITEM_TERTAUT_MTO',
        } };
      }

      const updates: string[] = [];
      const values: any[] = [];

      // Keadaan efektif dihitung dari baris yang SUDAH dikunci.
      let hargaEfektif = uang(item.unit_price_snapshot);
      let qtyEfektif = uang(item.qty);

      if (ahsp_id !== undefined) {
        // EST-AHSP-R40: ditahan `FOR SHARE` seperti jalur tambah item, supaya
        // penonaktifan yang berlomba tidak bisa menyelinap di sela baca→tulis.
        const ahsp: any = await tx.get(
          `SELECT id, kode, name, satuan, harga_satuan FROM ahsp_headers
           WHERE id = ? AND status = 'active' FOR SHARE`,
          [ahsp_id]
        );
        if (!ahsp) {
          const ada: any = await tx.get('SELECT kode, name, status FROM ahsp_headers WHERE id = ?', [ahsp_id]);
          if (ada) return { error: 409, body: {
            error: `AHSP "${ada.kode} — ${ada.name}" sudah tidak aktif dan tidak bisa dipasang ke item.`,
            code: 'AHSP_TIDAK_AKTIF', ahsp_status: ada.status,
          } };
          return { error: 404, body: { error: 'AHSP not found', code: 'AHSP_TIDAK_DITEMUKAN' } };
        }
        updates.push('ahsp_id = ?', 'ahsp_code_snapshot = ?', 'ahsp_name_snapshot = ?',
                     'unit_snapshot = ?', 'unit_price_snapshot = ?');
        values.push(ahsp.id, ahsp.kode, ahsp.name, ahsp.satuan, ahsp.harga_satuan);
        hargaEfektif = uang(ahsp.harga_satuan);
      }

      if (qtyBaru !== null) {
        qtyEfektif = qtyBaru;
        updates.push('qty = ?');
        values.push(qtyBaru);
      }

      // `total_price` SELALU diturunkan dari qty × harga yang berlaku setelah
      // perubahan ini — tidak pernah dari pembacaan lama.
      if (ahsp_id !== undefined || qtyBaru !== null) {
        updates.push('total_price = ?');
        values.push(bulatUang(qtyEfektif * hargaEfektif));
      }

      if (description !== undefined) {
        updates.push('description = ?');
        values.push(description ?? null);
      }

      if (updates.length === 0) return { error: 400, body: { error: 'No fields to update' } };

      values.push(itemId, proposalId);
      await tx.run(
        `UPDATE proposal_items SET ${updates.join(', ')} WHERE id = ? AND proposal_id = ?`,
        values
      );
      // EST-MTO-R29: mutasi item dan penghitungan ulang ringkasan satu unit.
      await recalculateProposal(proposalId as string, tx);
      return { ok: true as const };
    });

    if ('error' in hasil) return res.status(hasil.error).json(hasil.body);
    res.json({ message: 'Item updated' });
  } catch (error: any) {
    if (error?.lock) return res.status(error.lock.status).json(error.lock.body);
    console.error('Error updating proposal item:', error);
    res.status(500).json({ error: 'Failed to update proposal item' });
  }
});

// Delete proposal item
router.delete('/proposals/:proposalId/items/:itemId', authMiddleware, bolehHapus, async (req: Request, res: Response) => {
  try {
    // EST-MTO-R18: seluruh perubahan yang menggeser nilai komersial ikut dikunci.
    // Mengunci MTO saja tidak cukup — qty item RAB bisa diubah langsung lewat
    // endpoint ini dan penawaran yang sudah dikirim ikut berubah.
    const lockedRab = await proposalLock(req.params.proposalId);
    if (lockedRab) return res.status(lockedRab.status).json(lockedRab.body);

    // EST-MTO-R21: item harus benar-benar milik proposal di URL.
    //
    // Kunci status diperiksa berdasarkan `:proposalId`, tapi query-nya dulu
    // `WHERE id = ?` saja. Artinya cukup menyebut proposal draft di URL lalu
    // menunjuk id item milik proposal yang sudah submitted — kuncinya lolos,
    // dan penawaran yang sudah dikirim ikut berubah.
    const ownedItem: any = await dbGet(
      'SELECT id FROM proposal_items WHERE id = ? AND proposal_id = ?',
      [req.params.itemId, req.params.proposalId]
    );
    if (!ownedItem) {
      return res.status(404).json({
        error: 'Item RAB tidak ditemukan pada proposal ini',
        code: 'ITEM_NOT_IN_PROPOSAL',
      });
    }

    const { proposalId, itemId } = req.params;
    
    // EST-MTO-R29: mutasi item dan penghitungan ulang ringkasan adalah SATU unit.
    //
    // Melempar error dari recalculateProposal() tidak bisa membatalkan SQL yang
    // sudah ter-commit sebelumnya. Kalau recalc gagal setelah item berubah,
    // yang tersisa: baris sudah berubah, header belum, dan klien menerima 500.
    const hasilHapus = await withTransaction(async tx => {
      // EST-MTO-R33: status diperiksa ulang DI DALAM transaction ini.
      const raceLock = await proposalLockTx(proposalId, tx);
      if (raceLock) throw Object.assign(new Error('PROPOSAL_LOCKED'), { lock: raceLock });

      // ── Menghapus header section berarti menghapus paket pekerjaannya ─────
      //
      // Ikon sampah pada baris header diberi judul "Hapus section", tapi dulu
      // memanggil penghapusan baris biasa: hanya judulnya yang hilang,
      // sementara seluruh anaknya tetap ada — masih terhitung di
      // `recalculateProposal`, gerbang komersial, RAB, dan Deal.
      //
      // Akibatnya aksi yang secara bahasa berarti "buang satu paket pekerjaan"
      // sebenarnya hanya menghapus labelnya, dan biayanya tetap tertagih tanpa
      // ada judul yang menjelaskan asalnya.
      //
      // Anak terhubung ke headernya lewat `section_order` — tidak ada
      // `parent_item_id` maupun FK di skema. Diverifikasi pada data produksi:
      // tiap `section_order` berisi tepat satu header dan sekumpulan anaknya.
      const baris: any = await tx.get(
        'SELECT is_section, section_order, section_label FROM proposal_items WHERE id = ? AND proposal_id = ?',
        [itemId, proposalId]
      );

      let terhapus = 1;
      if (baris?.is_section && baris.section_order !== null && baris.section_order !== undefined) {
        const isi: any = await tx.get(
          'SELECT COUNT(*) AS n FROM proposal_items WHERE proposal_id = ? AND section_order = ?',
          [proposalId, baris.section_order]
        );
        terhapus = Number(isi?.n || 1);
        await tx.run(
          'DELETE FROM proposal_items WHERE proposal_id = ? AND section_order = ?',
          [proposalId, baris.section_order]
        );
      } else {
        await tx.run('DELETE FROM proposal_items WHERE id = ? AND proposal_id = ?', [itemId, proposalId]);
      }
      await recalculateProposal(proposalId as string, tx);
      return { terhapus, section: !!baris?.is_section, label: baris?.section_label || null };
    });

    res.json({
      message: hasilHapus.section
        ? `Section "${hasilHapus.label || '-'}" dihapus beserta ${hasilHapus.terhapus - 1} baris pekerjaannya`
        : 'Item deleted',
      terhapus: hasilHapus.terhapus,
      section: hasilHapus.section,
    });
  } catch (error: any) {
    if (error?.lock) return res.status(error.lock.status).json(error.lock.body);
    console.error('Error deleting proposal item:', error);
    res.status(500).json({ error: 'Failed to delete proposal item' });
  }
});

// Get proposal summary/calculations
router.get('/proposals/:id/summary', authMiddleware, bolehLihat, async (req: Request, res: Response) => {
  try {
    const proposalId = req.params.id;
    
    // Get subtotals by discipline
    const disciplineTotals = await dbAll(
      `SELECT 
        d.id, d.code, d.name,
        SUM(pi.total_price) as total
       FROM proposal_items pi
       INNER JOIN master_disciplines d ON pi.discipline_id = d.id
       WHERE pi.proposal_id = ?
       GROUP BY d.id, d.code, d.name
       ORDER BY d.order_no ASC`,
      [proposalId]
    );
    
    // Get subtotals by sub-discipline
    const subDisciplineTotals = await dbAll(
      `SELECT 
        sd.id, sd.code, sd.name, sd.discipline_id,
        SUM(pi.total_price) as total
       FROM proposal_items pi
       INNER JOIN master_sub_disciplines sd ON pi.sub_discipline_id = sd.id
       WHERE pi.proposal_id = ?
       GROUP BY sd.id, sd.code, sd.name, sd.discipline_id
       ORDER BY sd.order_no ASC`,
      [proposalId]
    );
    
    // Get proposal totals
    const proposal = await dbGet(
      `SELECT direct_cost, overhead, risk_contingency, total_project
       FROM proposals WHERE id = ?`,
      [proposalId]
    );
    
    res.json({
      discipline_totals: disciplineTotals,
      sub_discipline_totals: subDisciplineTotals,
      proposal_totals: proposal
    });
  } catch (error) {
    console.error('Error fetching proposal summary:', error);
    res.status(500).json({ error: 'Failed to fetch proposal summary' });
  }
});

// ============================================
// HELPER FUNCTIONS
// ============================================

async function recalculateProposal(proposalId: string | number, tx?: TxRunner) {
  const get = tx ? tx.get : dbGet;
  const run = tx ? tx.run : dbRun;
  try {
    // Calculate direct cost (sum of all items)
    const result = await get(
      `SELECT COALESCE(SUM(total_price), 0) as direct_cost FROM proposal_items WHERE proposal_id = ?`,
      [proposalId]
    );
    
    const directCost = bulatUang((result as any)?.direct_cost);

    // Overhead dan contingency adalah INPUT komersial, bukan hasil hitungan —
    // keduanya dibaca kembali dari baris proposal dan dipertahankan.
    //
    // Versi lama menetapkan keduanya `0` lalu MENULIS ULANG nol itu ke database
    // setiap kali ada satu baris yang berubah. Artinya nilai apa pun yang masuk
    // lewat migrasi, import, atau perbaikan manual akan terhapus begitu operator
    // mengubah satu quantity, dan total penawaran hanya bisa sama dengan direct
    // cost — padahal kolom serta COST SUMMARY di layar menjanjikan sebaliknya.
    // Overhead kantor, indirect, dan risk allowance yang melindungi margin
    // hilang tanpa jejak.
    const header: any = await get(
      'SELECT overhead, risk_contingency FROM proposals WHERE id = ?', [proposalId]
    );
    const overhead = uang(header?.overhead);
    const riskContingency = uang(header?.risk_contingency);
    const totalProject = bulatUang(directCost + overhead + riskContingency);

    await run(
      `UPDATE proposals
       SET direct_cost = ?, overhead = ?, risk_contingency = ?, total_project = ?
       WHERE id = ?`,
      [directCost, overhead, riskContingency, totalProject, proposalId]
    );
  } catch (error) {
    // EST-MTO-R24: kegagalan di sini TIDAK boleh didiamkan.
    //
    // Versi lama hanya mencatat ke log lalu selesai, sehingga qty baris bisa
    // berubah sementara direct_cost dan total_project di header tetap angka
    // lama — dokumen penawaran memuat dua kebenaran sekaligus, tanpa ada yang
    // tahu. Lebih baik permintaannya gagal terang-terangan.
    console.error('Error recalculating proposal:', error);
    throw error;
  }
}

// ============================================
// RAB (RENCANA ANGGARAN BIAYA) ENDPOINTS
// ============================================

// Get RAB Report Data (grouped by discipline and sub-discipline with calculations)
/**
 * PDF penawaran — dihasilkan SERVER, deterministik.
 *
 * Sebelumnya satu-satunya cara mencetak adalah `window.print()` dari layar RAB.
 * Hasilnya bergantung pada mesin, versi browser, ukuran kertas, dan pengaturan
 * margin pengguna — dokumen yang menjadi dasar harga kontrak tidak boleh
 * berbeda antarperangkat, dan tidak boleh berubah diam-diam saat browser
 * diperbarui.
 *
 * Proposal yang sama menghasilkan byte yang sama, dan checksum isinya dicetak
 * di kaki halaman sehingga dokumen yang diterima klien bisa dicocokkan dengan
 * yang dikirim tanpa membandingkan angkanya satu per satu.
 */
/**
 * Riwayat revisi sebuah proposal.
 *
 * Tanpa ini, ledger yang baru dibuat tidak bisa dilihat siapa pun — dan ledger
 * yang tidak bisa dibaca sama saja tidak ada.
 */
router.get('/proposals/:id/revisions', authMiddleware, bolehLihat, async (req: Request, res: Response) => {
  try {
    const revisi: any[] = await dbAll(
      `SELECT r.*, ui.username AS issued_by_name, ua.username AS accepted_by_name
       FROM proposal_revisions r
       LEFT JOIN users ui ON ui.id = r.issued_by
       LEFT JOIN users ua ON ua.id = r.accepted_by
       WHERE r.proposal_id = ? ORDER BY r.revision_no DESC`, [req.params.id]);

    res.json({
      items: revisi,
      total: revisi.length,
      // Jejak bisnisnya ikut — inilah yang selama ini tabelnya ada tapi kosong.
      audit: await dbAll(
        `SELECT a.*, u.username AS user_name FROM proposal_audit_logs a
         LEFT JOIN users u ON u.id = a.user_id
         WHERE a.proposal_id = ? ORDER BY a.created_at DESC, a.id DESC LIMIT 200`,
        [req.params.id]),
    });
  } catch (error: any) {
    console.error('Error fetching proposal revisions:', error);
    res.status(500).json({ error: 'Gagal memuat riwayat revisi' });
  }
});

/** Isi satu revisi — potret BOQ apa adanya saat diterbitkan. */
router.get('/proposals/:id/revisions/:revId', authMiddleware, bolehLihat, async (req: Request, res: Response) => {
  try {
    const rev: any = await dbGet(
      `SELECT r.*, ui.username AS issued_by_name, ua.username AS accepted_by_name
       FROM proposal_revisions r
       LEFT JOIN users ui ON ui.id = r.issued_by
       LEFT JOIN users ua ON ua.id = r.accepted_by
       WHERE r.id = ? AND r.proposal_id = ?`, [req.params.revId, req.params.id]);
    if (!rev) return res.status(404).json({ error: 'Revisi tidak ditemukan pada proposal ini' });

    const lines: any[] = await dbAll(
      'SELECT * FROM proposal_revision_lines WHERE revision_id = ? ORDER BY line_no', [rev.id]);

    res.json({
      ...rev,
      lines,
      // Dihitung ulang dari isinya: kalau berbeda dengan yang tersimpan, potret
      // ini pernah disentuh sesuatu — dan itu harus terlihat.
      lines_checksum_sekarang: checksumBaseline(lines),
    });
  } catch (error: any) {
    console.error('Error fetching revision:', error);
    res.status(500).json({ error: 'Gagal memuat revisi' });
  }
});

router.get('/proposals/:id/penawaran.pdf', authMiddleware, bolehLihat, async (req: Request, res: Response) => {
  try {
    const proposal: any = await dbGet('SELECT * FROM proposals WHERE id = ?', [req.params.id]);
    if (!proposal) return res.status(404).json({ error: 'Proposal tidak ditemukan' });

    const items: any[] = await dbAll(
      `SELECT id, is_section, section_label, section_order, order_no,
              ahsp_code_snapshot, ahsp_name_snapshot, description,
              unit_snapshot, unit_price_snapshot, qty, total_price
       FROM proposal_items WHERE proposal_id = ?
       ORDER BY section_order IS NULL, section_order, is_section DESC, order_no, id`,
      [req.params.id]
    );

    const dok = rakitDokumen(proposal, items);
    if (dok.jumlah_baris === 0) {
      // Menerbitkan dokumen kosong lebih buruk daripada menolak: ia terlihat
      // seperti penawaran yang sah tapi tidak menawarkan apa pun.
      return res.status(422).json({
        error: 'Proposal ini belum punya satu pun item pekerjaan, jadi belum bisa dijadikan penawaran.',
        code: 'PENAWARAN_KOSONG',
      });
    }

    const pdf = await renderPenawaran(dok);
    const namaBerkas = `Penawaran ${dok.nomor.replace(/[\\/:*?"<>|]/g, '-')}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Penawaran-Checksum', dok.checksum);
    res.setHeader('Content-Disposition',
      `inline; filename="${encodeURIComponent(namaBerkas)}"`);
    res.send(pdf);
  } catch (error: any) {
    console.error('Error rendering penawaran PDF:', error);
    res.status(500).json({ error: 'Gagal membuat PDF penawaran' });
  }
});

router.get('/proposals/:id/rab', authMiddleware, bolehLihat, async (req: Request, res: Response) => {
  try {
    const proposalId = req.params.id;
    
    // Get proposal details
    const proposal = await dbGet(
      `SELECT * FROM proposals WHERE id = ?`,
      [proposalId]
    );
    
    if (!proposal) {
      return res.status(404).json({ error: 'Proposal not found' });
    }
    
    // Get all items grouped and structured
    const items = await dbAll(
      `SELECT 
        pi.id,
        pi.order_no,
        pi.qty,
        pi.total_price,
        pi.ahsp_code_snapshot as ahsp_code,
        pi.ahsp_name_snapshot as ahsp_name,
        -- Deskripsi yang sengaja diketik pengguna lewat "Tambah deskripsi..."
        -- tersimpan di kolom ini, tapi query RAB dulu tidak pernah memilihnya —
        -- jadi keterangan lingkup pekerjaan hilang total dari dokumen.
        pi.description,
        pi.unit_snapshot as unit,
        pi.unit_price_snapshot as unit_price,
        d.id as discipline_id,
        d.code as discipline_code,
        d.name as discipline_name,
        d.order_no as discipline_order,
        sd.id as sub_discipline_id,
        sd.code as sub_discipline_code,
        sd.name as sub_discipline_name,
        sd.order_no as sub_discipline_order
       FROM proposal_items pi
       LEFT JOIN master_disciplines d ON pi.discipline_id = d.id
       LEFT JOIN master_sub_disciplines sd ON pi.sub_discipline_id = sd.id
       WHERE pi.proposal_id = ?
       ORDER BY d.order_no ASC, sd.order_no ASC, pi.order_no ASC`,
      [proposalId]
    );
    
    // Structure data: discipline > sub-discipline > items
    const structuredData: any = {};
    let rowNumber = 1;
    
    items.forEach((item: any) => {
      const disciplineKey = item.discipline_id || 'unassigned';
      
      if (!structuredData[disciplineKey]) {
        structuredData[disciplineKey] = {
          id: item.discipline_id,
          code: item.discipline_code,
          name: item.discipline_name,
          order: item.discipline_order,
          subDisciplines: {},
          totalAmount: 0
        };
      }
      
      const subDisciplineKey = item.sub_discipline_id || 'unassigned';
      
      if (!structuredData[disciplineKey].subDisciplines[subDisciplineKey]) {
        structuredData[disciplineKey].subDisciplines[subDisciplineKey] = {
          id: item.sub_discipline_id,
          code: item.sub_discipline_code,
          name: item.sub_discipline_name,
          order: item.sub_discipline_order,
          items: [],
          subtotal: 0
        };
      }
      
      structuredData[disciplineKey].subDisciplines[subDisciplineKey].items.push({
        rowNo: rowNumber++,
        ahspCode: item.ahsp_code,
        ahspName: item.ahsp_name,
        // Kolom PEKERJAAN pada dokumen mengambil deskripsi ini; kalau kosong,
        // barulah nama analisa dipakai sebagai penggantinya.
        description: item.description || null,
        unit: item.unit,
        qty: item.qty,
        unitPrice: bulatUang(item.unit_price),
        totalPrice: bulatUang(item.total_price)
      });

      // `total_price` datang dari MySQL sebagai string DECIMAL. `0 + "100.00"`
      // menghasilkan `"0100.00"`, lalu `+ "200.00"` menjadi `"0100.00200.00"` —
      // subtotal, total disiplin, dan grand total pada dokumen RAB ikut salah,
      // sementara ringkasan di header tetap terlihat benar karena membaca
      // `proposals.total_project`. Lihat utils/money.ts.
      const nilai = uang(item.total_price);
      const sub = structuredData[disciplineKey].subDisciplines[subDisciplineKey];
      sub.subtotal = bulatUang(sub.subtotal + nilai);
      structuredData[disciplineKey].totalAmount =
        bulatUang(structuredData[disciplineKey].totalAmount + nilai);
    });
    
    // Convert to array format for easier frontend iteration
    const rabSections = Object.values(structuredData).map((discipline: any) => ({
      ...discipline,
      subDisciplines: Object.values(discipline.subDisciplines)
    })) as any[];
    
    // Calculate grand total
    const grandTotal = jumlahUang(rabSections.map(section => section.totalAmount));
    
    res.json({
      proposal: {
        id: proposal.id,
        proposalNumber: proposal.proposal_number,
        projectName: proposal.project_name,
        client: proposal.client,
        lokasi: proposal.lokasi,
        revision: proposal.revision
      },
      sections: rabSections,
      // `grandTotal` sebelumnya dihitung tapi tidak pernah dikembalikan — ia
      // hanya jadi cadangan untuk `totalProject`, sehingga tidak ada satu pun
      // cara bagi pemanggil untuk memeriksa apakah rincian dan ringkasannya
      // memang rekonsiliasi.
      grandTotal,
      summary: {
        // Semua nilai di bawah kolom DECIMAL — tanpa konversi ia sampai ke
        // klien sebagai string dan setiap penjumlahan di sana ikut menggabung
        // teks, persis seperti bug yang diperbaiki di atas.
        directCost: bulatUang(proposal.direct_cost),
        overhead: bulatUang(proposal.overhead),
        riskContingency: bulatUang(proposal.risk_contingency),
        totalProject: proposal.total_project === null || proposal.total_project === undefined
          ? grandTotal
          : bulatUang(proposal.total_project),
      }
    });
  } catch (error) {
    console.error('Error generating RAB report:', error);
    res.status(500).json({ error: 'Failed to generate RAB report' });
  }
});

// ============================================
// PROPOSAL STATUS TRANSITIONS
// draft → review → submitted → deal / no_deal
// ============================================

const VALID_TRANSITIONS: Record<string, string[]> = {
  draft: ['review'],
  review: ['draft', 'submitted'],
  submitted: ['review', 'deal', 'no_deal'],
  no_deal: ['draft'],  // can re-open as draft
  deal: [],            // final state
};

const BUSINESS_TZ = process.env.BUSINESS_TIMEZONE || 'Asia/Jakarta';

/**
 * Tahun berjalan menurut zona waktu bisnis, bukan zona server. Server berjalan
 * UTC; tanpa ini, deal yang dilakukan 1 Januari pagi WIB masih mendapat nomor
 * bertahun sebelumnya.
 */
const businessYear = (): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: BUSINESS_TZ, year: 'numeric' }).format(new Date());

/**
 * Nomor project berikutnya, atomic (EST-MTO-R39).
 *
 * Versi lama memakai `SELECT COUNT(*) ... WHERE YEAR(created_at) = ?` lalu
 * menambah satu. Dua proposal yang berbeda tidak mengunci baris yang sama, jadi
 * keduanya membaca hitungan yang sama dan keduanya BERHASIL — bukan salah satu
 * gagal, tapi dua project dengan nomor identik. Pola yang persis sama sudah
 * terbukti gagal di procurement (PROC-R05: dari 20 PO serentak hanya 2 berhasil).
 *
 * `LAST_INSERT_ID()` mengembalikan nilai yang di-set statement itu sendiri pada
 * koneksi yang sama, jadi tiap pemanggil mendapat nomor berbeda dalam satu
 * statement. Seed dari nomor yang sudah ada supaya penomoran tidak mundur di
 * database yang barisnya dulu diisi COUNT()+1 atau manual.
 *
 * Dijalankan DI DALAM transaction deal — beda dari procurement yang sengaja
 * memisahkannya. Alasannya: deal terjadi beberapa kali sehari, bukan puluhan
 * bersamaan, jadi menahan baris counter sebentar tidak menimbulkan antrean, dan
 * imbalannya deal yang gagal tidak meninggalkan nomor yang hangus.
 */
const nextProjectNumber = async (tx: TxRunner): Promise<string> => {
  const year = businessYear();

  const row: any = await tx.get(
    `SELECT MAX(CAST(SUBSTRING_INDEX(project_number, '-', -1) AS UNSIGNED)) AS maxNum
     FROM client_projects WHERE project_number LIKE ?`,
    [`PRJ-${year}-%`]
  );
  const seed = Number(row?.maxNum || 0);

  await tx.run(
    `INSERT INTO document_counters (prefix, date_part, last_no)
     VALUES ('PRJ', ?, LAST_INSERT_ID(? + 1))
     ON DUPLICATE KEY UPDATE last_no = LAST_INSERT_ID(GREATEST(last_no, ?) + 1)`,
    [year, seed, seed]
  );

  const got: any = await tx.get('SELECT LAST_INSERT_ID() AS n');
  return `PRJ-${year}-${String(Number(got?.n || seed + 1)).padStart(4, '0')}`;
};

/**
 * Nomor proposal berikutnya, atomic (DR-P1-05).
 *
 * Versi lama memakai `MAX(...) + 1` lalu INSERT dengan autocommit. Dua pembuatan
 * proposal bersamaan membaca MAX yang sama; yang kalah menabrak unique dan keluar
 * sebagai 500 — kegagalan sistem untuk sesuatu yang seharusnya cuma antre.
 *
 * Memakai `document_counters` yang sama dengan nomor project dan dokumen
 * procurement, di-seed dari nomor yang sudah ada supaya tidak mundur.
 */
const nextProposalNumber = async (tx: TxRunner): Promise<string> => {
  const year = businessYear();

  const row: any = await tx.get(
    `SELECT MAX(CAST(SUBSTRING_INDEX(proposal_number, '/', -1) AS UNSIGNED)) AS maxNum
     FROM proposals WHERE proposal_number LIKE ?`,
    [`PROP/${year}/%`]
  );
  const seed = Number(row?.maxNum || 0);

  await tx.run(
    `INSERT INTO document_counters (prefix, date_part, last_no)
     VALUES ('PROP', ?, LAST_INSERT_ID(? + 1))
     ON DUPLICATE KEY UPDATE last_no = LAST_INSERT_ID(GREATEST(last_no, ?) + 1)`,
    [year, seed, seed]
  );

  const got: any = await tx.get('SELECT LAST_INSERT_ID() AS n');
  return `PROP/${year}/${String(Number(got?.n || seed + 1)).padStart(4, '0')}`;
};

type StatusOutcome =
  | { error: number; body: any }
  | {
      ok: true;
      projectId: number | null;
      projectNumber: string | null;
      createdProject: boolean;
      proposal: any;
      /** CONTRACT-R51: kontrak + baseline yang lahir bersama projectnya. */
      kontrak?: { id: number; nomor: string; checksum: string; dibuat: boolean } | null;
    };

/**
 * Proses handoff PR untuk sebuah proposal yang sudah deal (DR-P1-06).
 *
 * IDEMPOTEN: kalau job-nya sudah `success`, ia langsung mengembalikan hasil lama
 * tanpa membuat PR kedua. Aman dipanggil ulang berapa kali pun.
 *
 * Dipisahkan dari transaction deal dengan sengaja — kegagalan procurement tidak
 * boleh membatalkan kontrak yang sudah sah. Bedanya dengan versi lama: kegagalan
 * itu sekarang TERCATAT dan bisa diulang, bukan hilang ke log sementara respons
 * mengaku sukses.
 */
const processDealPrJob = async (proposalId: any, userId: any): Promise<any> => {
  const job: any = await dbGet('SELECT * FROM deal_pr_jobs WHERE proposal_id = ?', [proposalId]);
  if (!job) return null;
  if (job.status === 'success') {
    return { status: 'success', pr_id: job.pr_id, pr_number: job.pr_number, attempts: job.attempts };
  }

  const proposal: any = await dbGet(
    'SELECT id, proposal_number, project_name, project_id FROM proposals WHERE id = ?', [proposalId]
  );
  if (!proposal) return { status: 'failed', error: 'Proposal tidak ditemukan' };

  // P1 CONCURRENCY: job DIKLAIM lebih dulu lewat compare-and-set.
  //
  // Versi pertama membaca status di luar lock lalu langsung bekerja. Dua
  // pemrosesan paralel bisa berurutan begini: A membuat PR dan commit
  // `success`; B yang gagal di tengah lalu menjalankan catch dan menimpa job
  // menjadi `failed`. Retry berikutnya tidak lagi melihat `success`, dan
  // membuat PR KEDUA untuk proposal yang sama.
  //
  // `WHERE status IN ('pending','failed')` memastikan hanya satu pemroses yang
  // mendapat job, dan status terminal `success`/`skipped` tidak bisa direbut.
  const klaim = await dbRun(
    `UPDATE deal_pr_jobs SET status = 'processing', attempts = attempts + 1
     WHERE proposal_id = ? AND status IN ('pending', 'failed')`,
    [proposalId]
  );
  if (!klaim.affectedRows) {
    const sekarang: any = await dbGet('SELECT status, pr_id, pr_number FROM deal_pr_jobs WHERE proposal_id = ?', [proposalId]);
    return {
      status: sekarang?.status || 'unknown',
      pr_id: sekarang?.pr_id || null,
      pr_number: sekarang?.pr_number || null,
      note: 'Handoff sedang diproses permintaan lain atau sudah selesai.',
    };
  }

  try {
    const proposalItems: any[] = await dbAll(
      `SELECT pi.ahsp_id, pi.qty FROM proposal_items pi
       WHERE pi.proposal_id = ? AND pi.ahsp_id IS NOT NULL`,
      [proposalId]
    );

    const materialList: any[] = [];
    if (proposalItems.length > 0) {
      const ahspIds = proposalItems.map(pi => pi.ahsp_id);
      const ahspMaterials: any[] = await dbAll(
        `SELECT ai.ahsp_id, ai.resource_id, ai.resource_name, ai.resource_satuan,
                ai.koefisien, ai.resource_harga
         FROM ahsp_items ai
         WHERE ai.ahsp_id IN (${ahspIds.map(() => '?').join(',')}) AND ai.section = 'B'
         ORDER BY ai.resource_name`,
        ahspIds
      );

      const qtyMap: Record<number, number> = {};
      for (const pi of proposalItems) qtyMap[pi.ahsp_id] = (qtyMap[pi.ahsp_id] || 0) + Number(pi.qty);

      const materialMap: Record<number, { name: string; satuan: string; harga: number; totalQty: number }> = {};
      for (const mat of ahspMaterials) {
        const needed = Number(mat.koefisien) * (qtyMap[mat.ahsp_id] || 0);
        if (needed <= 0) continue;
        const rid = mat.resource_id;
        if (!materialMap[rid]) {
          materialMap[rid] = {
            name: mat.resource_name, satuan: mat.resource_satuan,
            harga: Number(mat.resource_harga) || 0, totalQty: 0,
          };
        }
        materialMap[rid].totalQty += needed;
      }

      for (const [rid, m] of Object.entries(materialMap)) {
        materialList.push({
          productId: null, productName: '', name: m.name,
          qty: Math.ceil(m.totalQty * 1000) / 1000,
          uom: m.satuan, specification: `Resource ID: ${rid}`, price: m.harga,
        });
      }
    }

    // Proposal tanpa material bukan kegagalan — tidak ada yang perlu dibeli.
    // Dibedakan dari `failed` supaya tidak terus-menerus diulang percuma.
    if (materialList.length === 0) {
      // Hanya job yang MASIH kita pegang yang boleh diubah.
      await dbRun(
        `UPDATE deal_pr_jobs SET status = 'skipped', last_error = NULL
         WHERE proposal_id = ? AND status = 'processing'`,
        [proposalId]
      );
      return { status: 'skipped', reason: 'Proposal tidak memuat material yang perlu dibeli' };
    }

    const hasil = await withTransaction(async tx => {
      // Dikunci supaya dua retry bersamaan tidak sama-sama membuat PR.
      const kunci: any = await tx.get('SELECT status, pr_id, pr_number FROM deal_pr_jobs WHERE proposal_id = ? FOR UPDATE', [proposalId]);
      if (kunci?.status === 'success') return { pr_id: kunci.pr_id, pr_number: kunci.pr_number };

      const prNumber = await nextSequentialCode('PR', 'purchase_requests', 'pr_number', tx);
      const estimatedTotal = materialList.reduce((sum, i) => sum + (i.qty * i.price), 0);

      const prResult = await tx.run(
        `INSERT INTO purchase_requests (pr_number, requestor_id, project_id, source_proposal_id, status, notes)
         VALUES (?, ?, ?, ?, 'DRAFT', ?)`,
        [prNumber, userId || null, proposal.project_id || null, Number(proposalId),
          JSON.stringify({
            noteText: `Auto-generated from proposal ${proposal.proposal_number} - ${proposal.project_name}`,
            itemType: 'non-inventory',
            items: materialList,
            estimatedTotal,
            source_proposal_id: Number(proposalId),
          })]
      );

      await tx.run(
        `UPDATE deal_pr_jobs SET status = 'success', pr_id = ?, pr_number = ?, last_error = NULL
         WHERE proposal_id = ?`,
        [prResult.insertId, prNumber, proposalId]
      );
      return { pr_id: prResult.insertId, pr_number: prNumber };
    });

    console.log(`✅ Handoff PR ${hasil.pr_number} untuk proposal ${proposalId}`);
    return { status: 'success', ...hasil };
  } catch (err: any) {
    // Kegagalan DICATAT, bukan hilang ke log — TAPI tidak pernah menimpa hasil
    // yang sudah terminal. Inilah bug yang membuat retry bisa menghasilkan PR
    // kedua: catch dulu menulis `failed` tanpa syarat.
    await dbRun(
      `UPDATE deal_pr_jobs SET status = 'failed', last_error = ?
       WHERE proposal_id = ? AND status = 'processing'`,
      [String(err?.message || err).slice(0, 500), proposalId]
    );
    console.error(`⚠️ Handoff PR proposal ${proposalId} gagal:`, err?.message);
    return { status: 'failed', error: String(err?.message || err).slice(0, 200) };
  }
};

// GET status handoff — supaya kegagalannya terlihat, bukan cuma tersimpan.
router.get('/proposals/:id/pr-handoff', authMiddleware, bolehLihat, async (req: Request, res: Response) => {
  try {
    const job: any = await dbGet('SELECT * FROM deal_pr_jobs WHERE proposal_id = ?', [req.params.id]);
    if (!job) return res.status(404).json({ error: 'Belum ada handoff untuk proposal ini', code: 'NO_HANDOFF' });
    res.json({ data: job });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// POST retry — idempoten; kalau sudah sukses tidak membuat PR kedua.
router.post('/proposals/:id/pr-handoff/retry', authMiddleware, bolehUbah, async (req: Request, res: Response) => {
  try {
    const job: any = await dbGet('SELECT status FROM deal_pr_jobs WHERE proposal_id = ?', [req.params.id]);
    if (!job) return res.status(404).json({ error: 'Belum ada handoff untuk proposal ini', code: 'NO_HANDOFF' });

    const hasil = await processDealPrJob(req.params.id, (req as any).userId);
    res.json({ message: 'Handoff diproses ulang', data: hasil });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.put('/proposals/:id/status', authMiddleware, bolehUbah, async (req: Request, res: Response) => {
  try {
    const { status: newStatus } = req.body;
    const userId = (req as any).userId || 1;
    const proposalId = req.params.id;

    // Transisi yang mengikat komersial menuntut `approve`, bukan sekadar `edit`.
    // Menyusun penawaran dan MENGIRIMKANNYA ke pelanggan — apalagi menjadikannya
    // kontrak — adalah dua kewenangan berbeda. Sebelum ini, actor mana pun yang
    // lolos autentikasi langsung ditulis menjadi `approved_by` lalu project
    // dibuat atas namanya.
    if (ESTIMATOR_RBAC_AKTIF && (newStatus === 'submitted' || newStatus === 'deal')) {
      const akses = await loadUserAccess(userId);
      const bolehSetujui = !akses ? false
        : akses.level >= 10 || akses.perms.has(P_SETUJU);
      if (!bolehSetujui) {
        return res.status(403).json({
          error: `Anda tidak berwenang mengubah status proposal menjadi "${newStatus}".`,
          code: 'BUTUH_PERMISSION',
          required: [P_SETUJU],
        });
      }
    }

    // EST-MTO-R38: SELURUH transisi — termasuk deal berikut efek sampingnya —
    // berjalan dalam SATU transaction yang dimulai dari lock baris proposal.
    //
    // Versi sebelumnya memakai dua transaction: yang pertama mengunci dan
    // memvalidasi status tapi sengaja TIDAK menulis status untuk deal, yang
    // kedua membuat project lalu menulis status. Di antara keduanya lock sudah
    // dilepas, dan transaction kedua tidak memeriksa ulang status. Akibatnya:
    //
    //   A: submitted→deal  lock, status=submitted ✅, COMMIT (tanpa menulis)
    //   B: submitted→review                              lock, tulis REVIEW, COMMIT
    //   A: (transaction 2) buat project, tulis DEAL, COMMIT
    //
    // Dua-duanya sukses, dan proposal berakhir DEAL padahal saat project
    // benar-benar dibuat statusnya sudah REVIEW. Dengan satu transaction, lock
    // dipegang sampai selesai: yang mendapat lock lebih dulu menang, yang kedua
    // menunggu lalu melihat status sudah berubah dan berhenti.
    const outcome = await withTransaction(async (tx): Promise<StatusOutcome> => {
      const proposal: any = await tx.get('SELECT * FROM proposals WHERE id = ? FOR UPDATE', [proposalId]);
      if (!proposal) return { error: 404, body: { error: 'Proposal not found' } };

      // Divalidasi terhadap baris yang SUDAH dikunci, bukan terhadap pembacaan
      // sebelum lock — jadi tidak perlu lagi membandingkan status lama vs baru.
      const allowed = VALID_TRANSITIONS[proposal.status] || [];
      if (!allowed.includes(newStatus)) {
        return {
          error: 400,
          body: {
            error: `Cannot change status from '${proposal.status}' to '${newStatus}'`,
            allowed_transitions: allowed,
          },
        };
      }

      // Gerbang komersial sebelum penawaran keluar atau menjadi kontrak.
      //
      // Sebelumnya transisi hanya memeriksa pasangan status. Tidak ada satu pun
      // invarian bahwa proposalnya punya isi komersial yang masuk akal, jadi
      // penawaran bernilai nol — atau negatif, lewat qty negatif — bisa
      // di-submit lalu di-deal, dan nilainya disalin apa adanya menjadi
      // `client_projects.budget`. Draft dan review sengaja dibiarkan longgar:
      // di sanalah pekerjaan yang belum lengkap memang berlangsung.
      if (newStatus === 'submitted' || newStatus === 'deal') {
        const gagal = await gerbangKomersial(proposalId, proposal, tx);
        if (gagal) return { error: 400, body: gagal };
      }

      // PROP-REV-R52: penerbitan membekukan satu revisi.
      let revisiBaru: { id: number; nomor: number; checksum: string } | null = null;
      if (newStatus === 'submitted') {
        revisiBaru = await bekukanRevisi(proposalId, proposal, userId, tx);
      }

      // Penerimaan revisi TIDAK dilakukan di sini — lihat `terimaRevisi()` yang
      // dipanggil setelah seluruh gerbang Deal lolos.
      //
      // Versi pertama menaruhnya di titik ini, dan itu salah dengan cara yang
      // berbahaya: `withTransaction` di sini mengembalikan `{ error, body }`
      // untuk penolakan, dan mengembalikan nilai BUKAN melempar — jadi
      // transactionnya tetap commit. Proposal yang Deal-nya ditolak 400 karena
      // clientnya tidak cocok tetap tercatat punya revisi "diterima", padahal
      // tidak ada project maupun kontrak yang lahir. Terbukti saat menguji.
      let revisiDiterima: any = null;

      const updates: string[] = ['status = ?'];
      const params: any[] = [newStatus];
      if (newStatus === 'submitted') {
        updates.push('submitted_at = NOW()');
      } else if (newStatus === 'deal') {
        updates.push('deal_at = NOW()');
        updates.push('approved_by = ?');
        updates.push('approved_at = NOW()');
        params.push(userId);
      }
      params.push(proposalId);

      const writeStatus = () => tx.run(`UPDATE proposals SET ${updates.join(', ')} WHERE id = ?`, params);

      // PROP-REV-R52: setiap transisi dicatat.
      //
      // `proposal_audit_logs` sudah lama ada tapi tidak satu pun kode menulis
      // ke sana — jadi tidak ada history bisnis yang bisa diverifikasi sama
      // sekali. Ditulis DI DALAM transaction yang sama supaya jejaknya tidak
      // bisa ada tanpa perubahannya, atau sebaliknya.
      const catatTransisi = async () => {
        await catatAudit(tx, proposalId, userId, 'status_change', 'status',
          proposal.status, newStatus);
        if (revisiBaru) {
          await catatAudit(tx, proposalId, userId, 'revision_issued', 'revision_no',
            null, `${revisiBaru.nomor} (checksum ${revisiBaru.checksum.slice(0, 12)})`);
        }
        if (revisiDiterima) {
          await catatAudit(tx, proposalId, userId, 'revision_accepted', 'revision_no',
            null, String(revisiDiterima.revision_no));
          // Separation of duties DICATAT, belum ditegakkan.
          //
          // Menegakkannya sekarang akan mengunci alur satu orang yang berjalan
          // di produksi hari ini. Yang bisa dilakukan tanpa merusak apa pun
          // adalah membuat keadaannya terlihat — sehingga kalau nanti
          // diputuskan harus dipisah, buktinya sudah ada.
          if (revisiDiterima.issued_by && userId
              && Number(revisiDiterima.issued_by) === Number(userId)) {
            await catatAudit(tx, proposalId, userId, 'sod_self_approval', 'approved_by',
              String(revisiDiterima.issued_by),
              'Penerbit dan penyetuju adalah orang yang sama');
          }
        }
      };

      if (newStatus !== 'deal') {
        await writeStatus();
        await catatTransisi();
        return { ok: true, projectId: null, projectNumber: null, createdProject: false, proposal };
      }

      if (proposal.project_id) {
        // Sudah punya project — jangan buat lagi, statusnya saja yang ditulis.
        console.log(`[Proposal ${proposalId}] sudah punya project ${proposal.project_id}, pembuatan project dilewati`);
        await writeStatus();
        await catatTransisi();
        return { ok: true, projectId: proposal.project_id, projectNumber: null, createdProject: false, proposal };
      }

      // Client dicocokkan lewat nama kalau client_id belum terisi. Ekspresi
      // COLLATE-nya dipertahankan persis seperti sebelumnya.
      const clientRow: any = await tx.get(
        `SELECT c.id FROM proposals p
         LEFT JOIN clients c ON c.name COLLATE utf8mb4_unicode_ci = p.client COLLATE utf8mb4_unicode_ci
         WHERE p.id = ?`,
        [proposalId]
      );
      const clientId = proposal.client_id || clientRow?.id || null;

      // `client_projects.client_id` NOT NULL, jadi tanpa client yang bisa
      // ditemukan INSERT-nya melempar dan pengguna menerima 500 tanpa satu pun
      // petunjuk. Deal yang gagal karena datanya belum lengkap adalah keadaan
      // yang wajar — ia pantas dijawab 400 yang menyebutkan apa yang kurang,
      // bukan kesalahan server.
      if (!clientId) {
        return {
          error: 400,
          body: {
            error: 'Proposal ini belum tertaut ke client mana pun, jadi project kontraknya tidak bisa dibuat.',
            code: 'CLIENT_BELUM_DITENTUKAN',
            petunjuk: proposal.client
              ? `Nama client "${proposal.client}" tidak cocok dengan satu pun data client. Pilih client dari daftar, atau buat datanya lebih dulu.`
              : 'Isi client pada proposal ini lebih dulu, lalu ulangi.',
          },
        };
      }

      const projectNumber = await nextProjectNumber(tx);

      const result = await tx.run(
        `INSERT INTO client_projects (
          client_id, proposal_id, project_number, project_name, description,
          budget, status, created_by
        ) VALUES (?, ?, ?, ?, ?, ?, 'open', ?)`,
        [
          clientId,
          proposalId,
          projectNumber,
          proposal.project_name,
          `Auto-created from proposal ${proposal.proposal_number}. Lokasi: ${proposal.lokasi || '-'}`,
          proposal.total_project || 0,
          userId
        ]
      );

      const projectId = result.insertId;

      // Link back to proposal
      await tx.run('UPDATE proposals SET project_id = ? WHERE id = ?', [projectId, proposalId]);

      // CONTRACT-R51: kontrak + baseline BOQ lahir bersama projectnya.
      //
      // Di dalam transaction yang sama, dan itu disengaja: project tanpa kontrak
      // berarti nilai kesepakatannya tidak punya dokumen, sementara kontrak
      // tanpa project menunjuk pekerjaan yang tidak ada. Sebelum ini satu-satunya
      // jejak nilai kontrak adalah `client_projects.budget` — satu angka yang
      // bisa ditimpa siapa saja, sehingga begitu ia bergeser tidak ada cara
      // membuktikan berapa yang sebenarnya disepakati di awal.
      const barisKontrak = await tx.all(
        `SELECT id, is_section, section_label, section_order, order_no,
                ahsp_code_snapshot, ahsp_name_snapshot, description,
                unit_snapshot, unit_price_snapshot, qty, total_price
         FROM proposal_items WHERE proposal_id = ?
         ORDER BY section_order IS NULL, section_order, is_section DESC, order_no, id`,
        [proposalId]
      );
      // PROP-REV-R52: revisi diterima HANYA setelah project dan kontraknya
      // benar-benar lahir. Revisi "diterima" tanpa kontrak adalah bukti
      // kesepakatan yang tidak menunjuk apa pun.
      revisiDiterima = await tx.get(
        `SELECT id, revision_no, lines_checksum, issued_by FROM proposal_revisions
         WHERE proposal_id = ? AND status = 'issued'
         ORDER BY revision_no DESC LIMIT 1 FOR UPDATE`, [proposalId]);
      if (!revisiDiterima) {
        // Proposal lama yang sudah submitted sebelum ledger ini ada tidak punya
        // revisi. Menolaknya akan mengunci pekerjaan yang sah, jadi dibekukan
        // sekarang dan ditandai apa adanya — bukan diberi bukti penerbitan
        // palsu yang tanggalnya dikarang.
        const susulan = await bekukanRevisi(proposalId, proposal, userId, tx);
        await catatAudit(tx, proposalId, userId, 'revision_backfill', 'revision_no',
          null, `${susulan.nomor} (legacy — bukti penerbitan asli tidak tersedia)`);
        revisiDiterima = await tx.get(
          'SELECT id, revision_no, lines_checksum, issued_by FROM proposal_revisions WHERE id = ?',
          [susulan.id]);
      }
      await tx.run(
        `UPDATE proposal_revisions SET status = 'accepted', accepted_at = NOW(), accepted_by = ?
         WHERE id = ?`, [userId || null, revisiDiterima.id]);
      await tx.run('UPDATE proposals SET accepted_revision_id = ? WHERE id = ?',
        [revisiDiterima.id, proposalId]);

      const kontrak = await buatKontrakDariProposal(tx, {
        projectId, proposal, items: barisKontrak as any[], userId,
      });

      // EST-MTO-017 + R32/019: pembuatan project, penautan, dan penyalinan
      // baseline MTO dijadikan SATU transaction.
      //
      // Sebelumnya ketiganya berjalan berurutan dengan autocommit. Kalau gagal di
      // tengah, project sudah ada tapi baselinenya kosong — kontrak berjalan
      // tanpa kuantitas acuan, dan tidak ada yang menandainya.
      //
      // `mto_lines` dan `formula_version` ikut disalin (R32/019): baseline
      // kontrak harus membawa ANGKA yang disepakati, bukan cuma parameternya.
      // Menyalin parameter saja berarti kuantitasnya dihitung ulang di lapangan
      // dengan formula yang mungkin sudah berubah.
      const baseline: any[] = await tx.all(
        `SELECT id, element_type, element_name, parameters, quantities, sort_order, formula_version
         FROM engineering_inputs WHERE scope_type = 'proposal' AND scope_id = ?`,
        [proposalId]
      );

      let baselineCount = 0;
      for (const el of baseline) {
        const ins = await tx.run(
          `INSERT IGNORE INTO engineering_inputs
            (scope_type, scope_id, project_id, proposal_id, element_type, element_name,
             parameters, quantities, sort_order, formula_version)
           VALUES ('project', ?, ?, NULL, ?, ?, ?, ?, ?, ?)`,
          [projectId, projectId, el.element_type, el.element_name,
            typeof el.parameters === 'string' ? el.parameters : JSON.stringify(el.parameters || {}),
            typeof el.quantities === 'string' ? el.quantities : JSON.stringify(el.quantities || {}),
            el.sort_order || 0, el.formula_version || null]
        );

        const newElementId = ins.insertId;
        if (!newElementId) continue; // INSERT IGNORE melewatinya — sudah ada
        baselineCount++;

        // Salin baris tersimpannya apa adanya, termasuk versi formulanya.
        const srcLines: any[] = await tx.all(
          `SELECT line_code, label, category, net_quantity, waste_percent, gross_quantity, unit, formula_version
           FROM mto_lines WHERE element_id = ?`,
          [el.id]
        );
        for (const l of srcLines) {
          await tx.run(
            `INSERT INTO mto_lines
              (element_id, line_code, label, category, net_quantity, waste_percent,
               gross_quantity, unit, formula_version)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [newElementId, l.line_code, l.label, l.category, l.net_quantity,
              l.waste_percent, l.gross_quantity, l.unit, l.formula_version]
          );
        }
      }

      await writeStatus();
      await catatTransisi();

      // DR-P1-06: pekerjaan handoff dicatat DI DALAM transaction deal.
      //
      // Sebelumnya PR dibuat setelah transaction dan errornya hanya masuk log,
      // sementara respons tetap sukses — deal bisa berhasil sambil diam-diam
      // kehilangan handoff ke Procurement tanpa satu pun tanda di layar.
      //
      // INSERT IGNORE + UNIQUE(proposal_id) membuat retry idempoten.
      await tx.run(
        `INSERT IGNORE INTO deal_pr_jobs (proposal_id, project_id, status) VALUES (?, ?, 'pending')`,
        [proposalId, projectId]
      );

      console.log(`[Proposal ${proposalId} → deal] ${baselineCount} elemen MTO disalin sebagai baseline project ${projectId}`);
      return { ok: true, projectId, projectNumber, createdProject: true, proposal, kontrak };
    });

    if ('error' in outcome) {
      return res.status(outcome.error).json(outcome.body);
    }

    const projectId = outcome.projectId;
    const proposal = outcome.proposal;
    const projectNumberOut = outcome.projectNumber;
    let prId: number | null = null;
    let prNumber_out: string | null = null;

    // DR-P1-06: handoff diproses sebagai JOB, bukan efek samping yang errornya
    // hilang ke log. Statusnya terlihat di respons dan bisa diulang lewat
    // POST /proposals/:id/pr-handoff/retry.
    let handoff: any = null;
    if (outcome.createdProject) {
      handoff = await processDealPrJob(proposalId, userId);
      prId = handoff?.pr_id || null;
      prNumber_out = handoff?.pr_number || null;
    }

    res.json({ 
      message: `Status updated to ${newStatus}`,
      status: newStatus,
      project_id: projectId,
      project_number: projectNumberOut || null,
      pr_id: prId || null,
      pr_number: prNumber_out || null,
      // DR-P1-06: status handoff ikut dikembalikan supaya kegagalannya terlihat
      // di layar, bukan hanya tersimpan diam-diam.
      pr_handoff: handoff,
    });
  } catch (error: any) {
    // EST-MTO-R32: kalau dua permintaan deal berlomba, yang kalah menabrak
    // index unik. Itu bukan kesalahan sistem — proposalnya memang sudah punya
    // project.
    if (error?.code === 'ER_DUP_ENTRY' && String(error.message).includes('uq_project_proposal')) {
      const existing: any = await dbGet(
        'SELECT id, project_number FROM client_projects WHERE proposal_id = ?', [req.params.id]
      );
      return res.status(409).json({
        error: 'Proposal ini sudah memiliki project. Transisi deal tidak diulang.',
        code: 'PROPOSAL_ALREADY_HAS_PROJECT',
        project_id: existing?.id,
        project_number: existing?.project_number,
      });
    }
    console.error('Error updating proposal status:', error);
    res.status(500).json({ error: 'Failed to update status' });
  }
});

// ============================================
// PROPOSAL RESUME (Resource Summary)
// ============================================
router.get('/proposals/:id/resume', authMiddleware, bolehLihat, async (req: Request, res: Response) => {
  try {
    const proposalId = req.params.id;

    // Get proposal info
    const proposal = await dbGet(
      `SELECT p.*, u.username as created_by_name FROM proposals p LEFT JOIN users u ON p.created_by = u.id WHERE p.id = ?`,
      [proposalId]
    );
    if (!proposal) return res.status(404).json({ error: 'Proposal not found' });

    // Get all proposal items with their AHSP details
    const proposalItems = await dbAll(
      `SELECT pi.id, pi.qty, pi.ahsp_id, pi.ahsp_code_snapshot, pi.ahsp_name_snapshot,
              pi.unit_snapshot, pi.unit_price_snapshot, pi.total_price,
              d.name as discipline_name, sd.name as sub_discipline_name
       FROM proposal_items pi
       LEFT JOIN master_disciplines d ON pi.discipline_id = d.id
       LEFT JOIN master_sub_disciplines sd ON pi.sub_discipline_id = sd.id
       WHERE pi.proposal_id = ?
       ORDER BY d.order_no, sd.order_no, pi.order_no`,
      [proposalId]
    );

    // For each proposal item, get AHSP items and multiply koefisien by qty
    const materials: any[] = [];
    const labor: any[] = [];
    const equipment: any[] = [];

    for (const pi of proposalItems as any[]) {
      const ahspItems = await dbAll(
        `SELECT section, resource_type, resource_id, resource_name, resource_satuan, 
                resource_harga, koefisien, jumlah_harga
         FROM ahsp_items WHERE ahsp_id = ? ORDER BY section, id`,
        [pi.ahsp_id]
      );

      for (const ai of ahspItems as any[]) {
        const totalQty = (ai.koefisien || 0) * (pi.qty || 0);
        const totalCost = totalQty * (ai.resource_harga || 0);
        const entry = {
          resource_id: ai.resource_id,
          resource_name: ai.resource_name,
          resource_satuan: ai.resource_satuan,
          resource_harga: ai.resource_harga,
          koefisien: ai.koefisien,
          item_qty: pi.qty,
          total_qty: totalQty,
          total_cost: totalCost,
          from_ahsp: pi.ahsp_name_snapshot,
          from_ahsp_code: pi.ahsp_code_snapshot,
          discipline: pi.discipline_name,
          sub_discipline: pi.sub_discipline_name,
        };

        if (ai.section === 'A') labor.push(entry);
        else if (ai.section === 'B') materials.push(entry);
        else if (ai.section === 'C') equipment.push(entry);
      }
    }

    // Aggregate by resource_name + resource_satuan
    const aggregate = (list: any[]) => {
      const map = new Map<string, any>();
      for (const item of list) {
        const key = `${item.resource_name}||${item.resource_satuan}`;
        if (map.has(key)) {
          const existing = map.get(key);
          existing.total_qty += item.total_qty;
          existing.total_cost += item.total_cost;
          if (!existing.sources.includes(item.from_ahsp_code)) {
            existing.sources.push(item.from_ahsp_code);
          }
        } else {
          map.set(key, {
            resource_id: item.resource_id,
            resource_name: item.resource_name,
            resource_satuan: item.resource_satuan,
            resource_harga: item.resource_harga,
            total_qty: item.total_qty,
            total_cost: item.total_cost,
            sources: [item.from_ahsp_code],
          });
        }
      }
      return Array.from(map.values()).sort((a, b) => b.total_cost - a.total_cost);
    };

    // Schedule items: each proposal item as a work package
    const scheduleItems = (proposalItems as any[]).map((pi: any, idx: number) => ({
      id: pi.id,
      order: idx + 1,
      name: pi.ahsp_name_snapshot,
      code: pi.ahsp_code_snapshot,
      unit: pi.unit_snapshot,
      qty: pi.qty,
      cost: pi.total_price,
      discipline: pi.discipline_name,
      sub_discipline: pi.sub_discipline_name,
      duration_days: 0, // default, frontend can edit
      start_offset: 0,  // default, frontend can edit
    }));

    res.json({
      proposal,
      materials: aggregate(materials),
      labor: aggregate(labor),
      equipment: aggregate(equipment),
      materials_detail: materials,
      labor_detail: labor,
      equipment_detail: equipment,
      schedule_items: scheduleItems,
      totals: {
        material_cost: materials.reduce((s, m) => s + m.total_cost, 0),
        labor_cost: labor.reduce((s, l) => s + l.total_cost, 0),
        equipment_cost: equipment.reduce((s, e) => s + e.total_cost, 0),
      },
    });
  } catch (error) {
    console.error('Error fetching proposal resume:', error);
    res.status(500).json({ error: 'Failed to fetch proposal resume' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PROPOSAL MTO / QTO ENDPOINTS
// Mirror of /projects/:id/mto but uses proposal_id in engineering_inputs
// ─────────────────────────────────────────────────────────────────────────────

/**
 * EST-MTO-001: kuantitas MTO sekarang dihitung SATU tempat —
 * `src/modules/estimator/mto/calculator.ts`.
 *
 * Versi lama di sini adalah salah satu dari tiga mesin hitung yang berbeda
 * (dua lagi di frontend), dan ketiganya bisa memberi angka berbeda untuk input
 * yang sama. Karena angka itu jadi dasar penawaran harga, perbedaannya bukan
 * soal kosmetik.
 *
 * Fungsi ini dipertahankan hanya sebagai pembungkus supaya bentuk lama
 * `Record<string, number>` tetap tersedia bagi layar yang belum dipindahkan.
 */
function calcMtoQty(elementType: string, params: any): Record<string, number> {
  return toLegacyQuantities(calculateMto(elementType, params));
}


/**
 * Hitung MTO tanpa menyimpan (EST-MTO-001).
 *
 * Dipakai komponen input di frontend supaya angka yang tampil di layar berasal
 * dari kalkulator yang sama dengan yang dipakai RAB dan penawaran. Sebelum ini
 * tiap komponen punya rumusnya sendiri — termasuk pendekatan kasar seperti
 * "besi = volume beton x 160 kg/m3" — sehingga layar dan backend bisa berbeda
 * jauh tanpa ada yang menyadarinya.
 */
router.post('/mto/preview', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { element_type, parameters = {} } = req.body;
    if (!element_type) return res.status(400).json({ error: 'element_type required' });
    const mto = calculateMto(element_type, parameters);
    res.json({ element_type: mto.element_type, variant: mto.variant, lines: mto.lines, notes: mto.notes });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});


/**
 * Hitung banyak elemen sekaligus — dipakai layar rekap MTO.
 *
 * Rekap di `ProjectMTO.vue` dulu punya TIGA perhitungan sendiri
 * (grandSummary, detailedMTO, mtoGrandTotal) dengan konstanta jempol yang
 * berbeda-beda untuk besi: 95, 160, 117, dan 85 kg/m3 tergantung elemen.
 * Angka itulah yang tampil sebagai total penawaran, dan tidak satu pun cocok
 * dengan perhitungan tulangan sebenarnya di backend.
 */
router.post('/mto/preview-batch', authMiddleware, async (req: Request, res: Response) => {
  try {
    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    if (items.length > 500) return res.status(400).json({ error: 'Terlalu banyak elemen dalam satu permintaan' });
    const results = items.map((it: any) => {
      const mto = calculateMto(it?.element_type, it?.parameters || {});
      return { key: it?.key ?? null, element_type: mto.element_type, variant: mto.variant, lines: mto.lines, notes: mto.notes };
    });
    res.json({ results });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});


/**
 * EST-MTO-016: MTO hanya boleh diubah selagi proposal masih draft atau review.
 *
 * Setelah proposal dikirim ke pelanggan (submitted) atau menjadi kesepakatan
 * (deal), mengubah kuantitas berarti mengubah dasar angka yang sudah dilihat —
 * atau sudah disetujui — pihak lain, tanpa jejak revisi.
 */
/**
 * EST-MTO-R33: versi transaksional dari pemeriksaan kunci.
 *
 * `proposalLock()` biasa memeriksa status lewat query terpisah SEBELUM transaksi
 * mutasinya dimulai. Di antara pemeriksaan dan penulisan, status bisa berubah —
 * misalnya proposal disubmit oleh orang lain — dan mutasinya tetap lolos.
 * Pemeriksaan yang benar harus berada di dalam transaction yang sama dengan
 * penulisannya, dengan barisnya dikunci.
 */
async function proposalLockTx(proposalId: any, tx: TxRunner): Promise<{ status: number; body: any } | null> {
  const proposal: any = await tx.get('SELECT id, status FROM proposals WHERE id = ? FOR UPDATE', [proposalId]);
  if (!proposal) return { status: 404, body: { error: 'Proposal tidak ditemukan' } };
  if (!isProposalEditable(proposal.status)) {
    return {
      status: 409,
      body: {
        error: `Proposal berstatus "${proposal.status}" — perubahan tidak diizinkan.`,
        code: 'PROPOSAL_LOCKED',
        status_proposal: proposal.status,
      },
    };
  }
  return null;
}

/** Pemeriksaan cepat di luar transaction — hanya untuk menolak lebih awal. */
async function proposalLock(proposalId: any): Promise<{ status: number; body: any } | null> {
  const proposal: any = await dbGet('SELECT id, status FROM proposals WHERE id = ?', [proposalId]);
  if (!proposal) return { status: 404, body: { error: 'Proposal tidak ditemukan' } };
  if (!isProposalEditable(proposal.status)) {
    return {
      status: 409,
      body: {
        error: `Proposal berstatus "${proposal.status}" — MTO tidak bisa diubah lagi. Buat revisi kalau memang perlu.`,
        code: 'PROPOSAL_LOCKED',
        status_proposal: proposal.status,
      },
    };
  }
  return null;
}

/**
 * EST-MTO-015: setelah kuantitas MTO berubah, item RAB yang menautnya ikut
 * disesuaikan.
 *
 * Tanpa ini, MTO 100 → 125 meninggalkan RAB tetap di 100 dan penawarannya
 * memakai angka yang sudah tidak berlaku — tanpa peringatan apa pun. Sinkronisasi
 * hanya berjalan pada proposal draft/review; yang sudah submitted/deal justru
 * TIDAK boleh berubah diam-diam.
 */
async function syncLinkedRabItems(proposalId: any, elementId: any, tx?: TxRunner): Promise<number> {
  const get = tx ? tx.get : dbGet;
  const all = tx ? tx.all : dbAll;
  const run = tx ? tx.run : dbRun;
  const element: any = await get(
    `SELECT id, element_type, element_name, parameters FROM engineering_inputs WHERE id = ? AND scope_type = 'proposal' AND scope_id = ?`,
    [elementId, proposalId]
  );
  if (!element) return 0;

  const params = typeof element.parameters === 'string' ? JSON.parse(element.parameters || '{}') : (element.parameters || {});
  const mto = calculateMto(element.element_type, params);

  const items: any[] = await all(
    'SELECT id, mto_link, unit_snapshot FROM proposal_items WHERE proposal_id = ? AND mto_link IS NOT NULL',
    [proposalId]
  );

  let updated = 0;
  const stale: any[] = [];

  for (const item of items) {
    let link: any;
    try { link = typeof item.mto_link === 'string' ? JSON.parse(item.mto_link) : item.mto_link; } catch { continue; }
    if (!link || Number(link.element_id) !== Number(elementId)) continue;

    const lineCode = link.line_code || link.field;
    const line = mto.lines.find(l => l.code === lineCode);

    // EST-MTO-R15: baris yang hilang TIDAK boleh dilewati diam-diam.
    //
    // Kalau engineer mengubah kolom beton menjadi baja, `COL-CONC` lenyap dari
    // keluaran kalkulator. Versi lama `continue` begitu saja, sehingga item RAB
    // "Beton Kolom 20 m³" tetap tinggal di penawaran padahal MTO-nya sudah baja.
    // Sekarang perubahan itu ditolak sampai user melepas atau memetakan ulang.
    if (!line) {
      stale.push({ item_id: item.id, line_code: lineCode, element_id: elementId });
      continue;
    }

    // EST-MTO-R13: RAB SELALU memakai net_quantity.
    //
    // Sebelumnya klien bisa memilih lewat `use_net`, dan defaultnya `false` —
    // artinya RAB diam-diam memakai gross. Kontrak bisnisnya: RAB/BOQ memakai
    // volume pekerjaan (net), procurement yang memakai gross termasuk susut.
    const value = line.net_quantity;
    await run(
      `UPDATE proposal_items
       SET qty = ?, mto_link = ?, total_price = ? * unit_price_snapshot, updated_at = NOW()
       WHERE id = ?`,
      [value, JSON.stringify({
        ...link, line_code: line.code, value, unit: line.unit,
        basis: 'net', gross_quantity: line.gross_quantity, waste_percent: line.waste_percent,
        // Dipanggil tepat setelah `persistMtoLines`, jadi baris tersimpan dan
        // hasil kalkulator identik di titik ini — versinya boleh distempel.
        formula_version: FORMULA_VERSION,
      }), value, item.id]
    );
    updated++;
  }

  if (stale.length > 0) {
    throw Object.assign(new Error('LINKED_MTO_LINE_INVALID'), { statusCode: 409, stale });
  }

  // EST-MTO-R14: ringkasan proposal ikut dihitung ulang.
  //
  // Tanpa ini, qty dan total_price per baris berubah tapi `direct_cost` dan
  // `total_project` di header proposal tetap angka lama — nilai baris dan nilai
  // ringkasan jadi bertentangan di dokumen yang sama.
  // Harus memakai `tx` yang sama: kalau tidak, SUM dihitung dari pool lain yang
  // belum melihat perubahan qty di transaction ini, dan header proposal ditulis
  // dengan angka lama.
  if (updated > 0) await recalculateProposal(proposalId as string, tx);

  return updated;
}


/** Toleransi banding kuantitas — sama dengan yang dipakai `enrichMtoElement`. */
const TOLERANSI_KUANTITAS = 0.0001;

/**
 * EST-MTO-R38: satu scope hanya boleh punya SATU kuantitas resmi.
 *
 * Sebelum ini, tiga jalur memakai sumber yang berbeda untuk angka yang sama:
 * `mto-link` dan `syncLinkedRabItems` menghitung ulang dengan `calculateMto()`
 * versi yang sedang ter-deploy, sementara Deal menyalin `mto_lines` tersimpan
 * apa adanya. Selama formulanya tidak pernah berubah keduanya identik, jadi
 * masalahnya tidak terlihat — tapi begitu formula diperbaiki, satu kontrak
 * berdiri di atas dua angka: RAB dan nilai penawaran pakai formula baru,
 * baseline MTO dan jejak procurement pakai formula lama. Tidak ada tindakan
 * estimator, tidak ada audit event, dan selisihnya baru ketahuan setelah
 * kontrak terbentuk.
 *
 * Aturannya sekarang: **baris tersimpan yang mengikat.** Itu angka yang disalin
 * Deal, jadi itu yang harus ditautkan RAB. Perubahan formula tidak diam-diam
 * masuk penawaran — ia memunculkan drift yang harus diselesaikan estimator
 * dengan menyimpan ulang elemennya (yang menulis ulang baris DAN menyelaraskan
 * seluruh RAB tertaut dalam satu transaction).
 */
async function bacaBarisTersimpan(elementId: any, tx: TxRunner): Promise<any[]> {
  return tx.all(
    `SELECT line_code, label, net_quantity, waste_percent, gross_quantity, unit, formula_version
     FROM mto_lines WHERE element_id = ?`,
    [elementId]
  );
}

/** Apakah baris tersimpan sudah tidak cocok dengan hasil kalkulator sekarang? */
function adaDrift(tersimpan: any[], mto: MtoResult): boolean {
  if (tersimpan.length === 0) return false;
  if (tersimpan.length !== mto.lines.length) return true;
  return tersimpan.some(sl => {
    const cur = mto.lines.find(l => l.code === sl.line_code);
    if (!cur) return true;
    return Math.abs(Number(sl.net_quantity) - cur.net_quantity) > TOLERANSI_KUANTITAS
      || Math.abs(Number(sl.waste_percent) - cur.waste_percent) > TOLERANSI_KUANTITAS
      || Math.abs(Number(sl.gross_quantity) - cur.gross_quantity) > TOLERANSI_KUANTITAS
      || String(sl.unit) !== String(cur.unit);
  });
}

/**
 * Buktikan setiap tautan RAB→MTO masih menunjuk baris tersimpan yang sah
 * sebelum penawaran keluar atau menjadi kontrak.
 *
 * Ini yang membuat "dua angka resmi" tidak bisa lolos diam-diam: gerbang
 * berjalan pada transisi `submitted` DAN `deal`, jadi baseline yang disalin
 * Deal dijamin sama dengan qty yang tertulis di RAB.
 */
async function periksaTautanMto(proposalId: any, tx: TxRunner): Promise<string[]> {
  const pelanggaran: string[] = [];
  const items: any[] = await tx.all(
    `SELECT id, description, qty, unit_snapshot, mto_link
     FROM proposal_items WHERE proposal_id = ? AND mto_link IS NOT NULL`,
    [proposalId]
  );

  for (const item of items) {
    let link: any;
    try { link = typeof item.mto_link === 'string' ? JSON.parse(item.mto_link) : item.mto_link; }
    catch { pelanggaran.push(`Item "${item.description}" punya tautan MTO yang tidak terbaca.`); continue; }
    if (!link || !link.element_id) continue;

    const nama = item.description || `Item #${item.id}`;
    const el: any = await tx.get(
      `SELECT id, element_name FROM engineering_inputs
       WHERE id = ? AND scope_type = 'proposal' AND scope_id = ?`,
      [link.element_id, proposalId]
    );
    if (!el) {
      pelanggaran.push(`"${nama}" menaut elemen MTO yang sudah tidak ada di proposal ini.`);
      continue;
    }

    const kode = link.line_code || link.field;
    const tersimpan = await bacaBarisTersimpan(el.id, tx);
    if (tersimpan.length === 0) {
      pelanggaran.push(
        `Elemen "${el.element_name}" belum punya baris MTO tersimpan, `
        + `sehingga "${nama}" tidak punya angka yang bisa dijadikan baseline. Simpan ulang elemennya.`);
      continue;
    }

    const baris = tersimpan.find(l => String(l.line_code) === String(kode));
    if (!baris) {
      pelanggaran.push(`"${nama}" menaut baris "${kode}" yang sudah tidak ada pada elemen "${el.element_name}".`);
      continue;
    }

    if (link.formula_version && String(link.formula_version) !== String(baris.formula_version)) {
      pelanggaran.push(
        `"${nama}" ditautkan pada formula ${link.formula_version}, `
        + `sedangkan baris tersimpan "${el.element_name}" versi ${baris.formula_version}. Simpan ulang elemennya.`);
      continue;
    }

    const cocokSatuan = checkUnitCompatibility(baris.unit, item.unit_snapshot);
    if (!cocokSatuan.compatible) {
      pelanggaran.push(`"${nama}": ${cocokSatuan.reason}`);
      continue;
    }

    if (Math.abs(Number(item.qty) - Number(baris.net_quantity)) > TOLERANSI_KUANTITAS) {
      pelanggaran.push(
        `"${nama}" berkuantitas ${item.qty} ${item.unit_snapshot || ''}`.trim()
        + `, sedangkan baris MTO tersimpan "${el.element_name}" bernilai ${baris.net_quantity}. `
        + `Simpan ulang elemennya supaya RAB ikut diselaraskan.`);
    }
  }

  return pelanggaran;
}

/**
 * Tulis ulang baris MTO tersimpan untuk satu elemen (EST-MTO-019).
 *
 * Selalu dipanggil DI DALAM transaction yang sama dengan penyimpanan elemennya,
 * supaya baris dan parameternya tidak pernah bisa berbeda versi.
 *
 * Ditulis ulang seluruhnya (hapus lalu sisipkan), bukan di-merge: baris yang
 * hilang karena tipe elemen berubah harus benar-benar hilang, bukan tertinggal
 * sebagai sisa yang masih bisa dirujuk RAB.
 */
async function persistMtoLines(elementId: number | string, mto: MtoResult, tx: TxRunner): Promise<number> {
  await tx.run('DELETE FROM mto_lines WHERE element_id = ?', [elementId]);
  for (const l of mto.lines) {
    await tx.run(
      `INSERT INTO mto_lines
        (element_id, line_code, label, category, net_quantity, waste_percent, gross_quantity, unit, formula_version)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [elementId, l.code, l.label, mto.element_type, l.net_quantity, l.waste_percent,
       l.gross_quantity, l.unit, FORMULA_VERSION]
    );
  }
  return mto.lines.length;
}

// GET all MTO elements for a proposal — single source of truth: proposal_id only
router.get('/proposals/:id/mto', authMiddleware, bolehLihat, async (req: Request, res: Response) => {
  try {
    const proposalId = req.params.id;
    const rows = await dbAll(
      `SELECT * FROM engineering_inputs WHERE scope_type = 'proposal' AND scope_id = ? ORDER BY sort_order, id`,
      [proposalId]
    );
    const lineRows: any[] = rows.length
      ? await dbAll(
          `SELECT element_id, line_code, label, net_quantity, waste_percent, gross_quantity, unit, formula_version
           FROM mto_lines WHERE element_id IN (${rows.map(() => '?').join(',')})`,
          rows.map((r: any) => r.id)
        )
      : [];
    const storedLines = groupStoredLines(lineRows);

    res.json({
      elements: rows.map((r: any) => {
        const parameters = typeof r.parameters === 'string' ? JSON.parse(r.parameters || '{}') : r.parameters;
        return {
          ...r,
          parameters,
          quantities: typeof r.quantities === 'string' ? JSON.parse(r.quantities || '{}') : r.quantities,
          ...enrichMtoElement(r.element_type, parameters, storedLines.get(Number(r.id)) || [], r.formula_version),
          source: 'proposal',
        };
      }),
    });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// POST create/upsert MTO element for proposal — only uses proposal_id
router.post('/proposals/:id/mto', authMiddleware, bolehUbah, async (req: Request, res: Response) => {
  try {
    const proposalId = req.params.id;
    const { element_type, element_name, parameters = {}, sort_order = 0 } = req.body;
    if (!element_type) return res.status(400).json({ error: 'element_type required' });

    const locked = await proposalLock(proposalId);
    if (locked) return res.status(locked.status).json(locked.body);
    const mto = calculateMto(element_type, parameters);
    // EST-MTO-R30: parameter tidak valid ditolak dan TIDAK ditulis ke database.
    // Menyimpannya berarti engineering input keliru tersimpan sebagai sah dengan
    // kuantitas 0 — penawaran understated, dan `notes` tidak menahan apa pun.
    if (mto.variant === 'invalid') {
      return res.status(422).json({
        error: 'Parameter engineering tidak valid, MTO tidak disimpan.',
        code: 'INVALID_MTO_PARAMETERS',
        problems: mto.notes,
      });
    }
    // EST-MTO-R35: dimensi teknis wajib digembok di jalur TULIS, bukan di
    // kalkulator. Kalkulator tetap menghitung supaya elemen lama yang terlanjur
    // tersimpan tanpa field ini masih terbaca di layar dan masih bisa ditautkan
    // ke RAB — yang dicegah adalah data setengah jadi yang BARU masuk.
    if (mto.missing_required?.length) {
      return res.status(422).json({
        error: 'Dimensi teknis yang wajib belum diisi, MTO tidak disimpan.',
        code: 'MISSING_REQUIRED_PARAMETERS',
        problems: mto.missing_required,
      });
    }
    const quantities = toLegacyQuantities(mto);
    const name = element_name || element_type;
    const paramsJson = JSON.stringify(parameters);
    const qtyJson = JSON.stringify(quantities);

    // EST-MTO-018: upsert dilakukan eksplisit, tidak lagi mengandalkan
    // `ON DUPLICATE KEY UPDATE`. Index lamanya memuat kolom nullable sehingga
    // tidak pernah menyala — menyimpan elemen yang sama dua kali menghasilkan
    // dua baris, dan rekap penawaran menghitungnya dua kali.
    // EST-MTO-R27: upsert dan sinkronisasi RAB berada dalam SATU transaction.
    //
    // Sebelumnya upsert punya transaction sendiri dan sync transaction lain.
    // POST bukan create-only — ia juga meng-update elemen yang sudah ada. Jadi
    // mengirim ulang "Column K1" dengan tipe WF akan meng-commit perubahan
    // elemennya lebih dulu, lalu sync menolak 409 karena COL-CONC yang ditaut
    // RAB sudah lenyap. Hasilnya sama seperti R20: klien menerima gagal, tapi
    // datanya sudah berubah.
    let existedBefore = false;
    let id: number;
    let synced = 0;
    try {
      const result = await withTransaction(async tx => {
        // EST-MTO-R33: status diperiksa ULANG di dalam transaction ini.
        // Pemeriksaan cepat sebelum transaction tidak cukup — proposal bisa
        // disubmit orang lain di sela pemeriksaan dan penulisan, dan MTO tetap
        // berubah sesudah penawaran dikirim.
        const raceLock = await proposalLockTx(proposalId, tx);
        if (raceLock) throw Object.assign(new Error('PROPOSAL_LOCKED'), { lock: raceLock });

        const existing: any = await tx.get(
          `SELECT id FROM engineering_inputs
           WHERE scope_type = 'proposal' AND scope_id = ? AND element_type = ? AND element_name = ?
           FOR UPDATE`,
          [proposalId, element_type, name]
        );

        let elementId: number;
        if (existing) {
          existedBefore = true;
          await tx.run(
            `UPDATE engineering_inputs
             SET parameters = ?, quantities = ?, sort_order = ?, updated_at = NOW()
             WHERE id = ?`,
            [paramsJson, qtyJson, sort_order, existing.id]
          );
          elementId = existing.id;
        } else {
          const inserted = await tx.run(
            `INSERT INTO engineering_inputs
              (scope_type, scope_id, proposal_id, project_id, element_type, element_name, parameters, quantities, sort_order)
             VALUES ('proposal', ?, ?, NULL, ?, ?, ?, ?, ?)`,
            [proposalId, proposalId, element_type, name, paramsJson, qtyJson, sort_order]
          );
          elementId = inserted.insertId;
        }

        await tx.run('UPDATE engineering_inputs SET formula_version = ? WHERE id = ?',
          [FORMULA_VERSION, elementId]);
        await persistMtoLines(elementId, mto, tx);

        const n = await syncLinkedRabItems(proposalId, elementId, tx);
        return { elementId, n };
      });
      id = result.elementId;
      synced = result.n;
    } catch (syncErr: any) {
      if (syncErr?.lock) return res.status(syncErr.lock.status).json(syncErr.lock.body);
      if (syncErr?.statusCode === 409) {
        return res.status(409).json({
          error: 'Perubahan ini membuat baris MTO yang sudah ditaut ke RAB tidak ada lagi. '
            + 'Lepas atau petakan ulang tautannya dulu. Perubahan MTO dibatalkan.',
          code: 'LINKED_MTO_LINE_INVALID',
          stale_links: syncErr.stale,
        });
      }
      throw syncErr;
    }

    res.json({ id, quantities, lines: mto.lines, variant: mto.variant, notes: mto.notes, updated: existedBefore, rab_items_synced: synced });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// PUT update MTO element for proposal — works for both proposal & project records
router.put('/proposals/:id/mto/:elementId', authMiddleware, bolehUbah, async (req: Request, res: Response) => {
  try {
    const proposalId = req.params.id;
    const locked = await proposalLock(proposalId);
    if (locked) return res.status(locked.status).json(locked.body);

    const { element_type, element_name, parameters = {}, sort_order } = req.body;

    // EST-MTO-017: MTO proposal dan MTO project adalah dua hal berbeda —
    // yang satu dasar komersial, yang satu kuantitas pelaksanaan. Query lama
    // mencocokkan `proposal_id OR project_id`, sehingga menyunting lewat layar
    // proposal bisa mengubah elemen milik project yang sudah berjalan.
    const existing: any = await dbGet(
      `SELECT * FROM engineering_inputs
       WHERE id = ? AND scope_type = 'proposal' AND scope_id = ?`,
      [req.params.elementId, proposalId]
    );
    if (!existing) return res.status(404).json({ error: 'Element not found' });
    const type = element_type || existing.element_type;
    const params = Object.keys(parameters).length ? parameters : JSON.parse(existing.parameters || '{}');
    const mto = calculateMto(type, params);
    if (mto.variant === 'invalid') {
      return res.status(422).json({
        error: 'Parameter engineering tidak valid, MTO tidak diubah.',
        code: 'INVALID_MTO_PARAMETERS',
        problems: mto.notes,
      });
    }
    // EST-MTO-R35: dimensi teknis wajib digembok di jalur TULIS, bukan di
    // kalkulator. Kalkulator tetap menghitung supaya elemen lama yang terlanjur
    // tersimpan tanpa field ini masih terbaca di layar dan masih bisa ditautkan
    // ke RAB — yang dicegah adalah data setengah jadi yang BARU masuk.
    if (mto.missing_required?.length) {
      return res.status(422).json({
        error: 'Dimensi teknis yang wajib belum diisi, MTO tidak diubah.',
        code: 'MISSING_REQUIRED_PARAMETERS',
        problems: mto.missing_required,
      });
    }
    const quantities = toLegacyQuantities(mto);
    // EST-MTO-R20: perubahan MTO dan sinkronisasi RAB harus satu transaction.
    //
    // Versi sebelumnya meng-UPDATE elemen lebih dulu, baru menjalankan sync, lalu
    // membalas 409 kalau ada tautan yang jadi basi. Tapi UPDATE-nya sudah
    // ter-commit — jadi klien menerima "gagal" padahal MTO sudah berubah, dan
    // RAB tetap menunjuk baris yang tidak ada lagi. Persis keadaan yang ingin
    // dicegah oleh 409 itu sendiri.
    let synced = 0;
    try {
      synced = await withTransaction(async tx => {
        // EST-MTO-R33: status diperiksa ULANG di dalam transaction ini.
        // Pemeriksaan cepat sebelum transaction tidak cukup — proposal bisa
        // disubmit orang lain di sela pemeriksaan dan penulisan, dan MTO tetap
        // berubah sesudah penawaran dikirim.
        const raceLock = await proposalLockTx(proposalId, tx);
        if (raceLock) throw Object.assign(new Error('PROPOSAL_LOCKED'), { lock: raceLock });

        await tx.run(
          'UPDATE engineering_inputs SET element_type=?, element_name=?, parameters=?, quantities=?, sort_order=?, formula_version=? WHERE id=?',
          [type, element_name || existing.element_name, JSON.stringify(params), JSON.stringify(quantities), sort_order ?? existing.sort_order, FORMULA_VERSION, req.params.elementId]
        );
        await persistMtoLines(req.params.elementId as string, mto, tx);
        return syncLinkedRabItems(proposalId, req.params.elementId, tx);
      });
    } catch (syncErr: any) {
      if (syncErr?.lock) return res.status(syncErr.lock.status).json(syncErr.lock.body);
      if (syncErr?.statusCode === 409) {
        return res.status(409).json({
          error: 'Perubahan ini membuat baris MTO yang sudah ditaut ke RAB tidak ada lagi. '
            + 'Lepas atau petakan ulang tautannya dulu. Perubahan MTO dibatalkan.',
          code: 'LINKED_MTO_LINE_INVALID',
          stale_links: syncErr.stale,
        });
      }
      throw syncErr;
    }
    res.json({ quantities, lines: mto.lines, variant: mto.variant, notes: mto.notes, rab_items_synced: synced });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// DELETE MTO element for proposal — only proposal_id
router.delete('/proposals/:id/mto/:elementId', authMiddleware, bolehHapus, async (req: Request, res: Response) => {
  try {
    const locked = await proposalLock(req.params.id);
    if (locked) return res.status(locked.status).json(locked.body);

    // EST-MTO-R16 + R26: pemeriksaan tautan dan penghapusan dilakukan dalam SATU
    // transaction, dengan baris elemen dikunci lebih dulu.
    //
    // Memeriksa lalu menghapus di luar transaction masih menyisakan celah:
    // penautan yang berjalan bersamaan bisa menyimpan tautannya tepat setelah
    // pemeriksaan lewat, sehingga item RAB menunjuk elemen yang sudah terhapus.
    // Kunci di kedua sisi membuat yang datang belakangan menunggu dan melihat
    // keadaan terbaru.
    const delOutcome = await withTransaction(async tx => {
      const raceLock = await proposalLockTx(req.params.id, tx);
      if (raceLock) return { error: raceLock.status, body: raceLock.body };

      const element: any = await tx.get(
        `SELECT id FROM engineering_inputs
         WHERE id = ? AND scope_type = 'proposal' AND scope_id = ? FOR UPDATE`,
        [req.params.elementId, req.params.id]
      );
      if (!element) {
        return { error: 404, body: { error: 'Elemen MTO tidak ditemukan pada proposal ini' } };
      }

      const linkedItems: any[] = await tx.all(
        'SELECT id, mto_link FROM proposal_items WHERE proposal_id = ? AND mto_link IS NOT NULL',
        [req.params.id]
      );
      const stillLinked = linkedItems.filter((it: any) => {
        try {
          const l = typeof it.mto_link === 'string' ? JSON.parse(it.mto_link) : it.mto_link;
          return l && Number(l.element_id) === Number(req.params.elementId);
        } catch { return false; }
      });

      if (stillLinked.length > 0) {
        return {
          error: 409,
          body: {
            error: `Elemen MTO ini masih dipakai ${stillLinked.length} item RAB. Lepas atau petakan ulang tautannya dulu sebelum menghapus.`,
            code: 'MTO_HAS_LINKED_RAB',
            linked_item_ids: stillLinked.map((it: any) => it.id),
          },
        };
      }

      await tx.run(
        `DELETE FROM engineering_inputs WHERE id = ? AND scope_type = 'proposal' AND scope_id = ?`,
        [req.params.elementId, req.params.id]
      );
      return { ok: true as const };
    });

    if ('error' in delOutcome) {
      return res.status(delOutcome.error).json(delOutcome.body);
    }

    res.json({ message: 'Deleted' });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ── MTO-RAB LINKAGE ──────────────────────────────────────────────

// GET all linkable MTO quantities for a proposal
// Returns per-element quantities that can be linked to RAB items
router.get('/proposals/:id/mto-quantities', authMiddleware, bolehLihat, async (req: Request, res: Response) => {
  try {
    const rows: any[] = await dbAll(
      `SELECT id, element_type, element_name, parameters
       FROM engineering_inputs
       WHERE scope_type = 'proposal' AND scope_id = ?
       ORDER BY element_type, sort_order`,
      [req.params.id]
    );

    // EST-MTO-R38/R39: picker harus menawarkan angka yang SAMA dengan yang akan
    // ditulis saat ditautkan — yaitu baris tersimpan. Menawarkan hasil kalkulator
    // sementara penautan memakai baris tersimpan berarti estimator memilih satu
    // angka lalu mendapat angka lain.
    const semuaBaris: any[] = rows.length
      ? await dbAll(
          `SELECT element_id, line_code, label, net_quantity, waste_percent, gross_quantity,
                  unit, formula_version
           FROM mto_lines WHERE element_id IN (${rows.map(() => '?').join(',')})`,
          rows.map(r => r.id))
      : [];
    const barisPerElemen = groupStoredLines(semuaBaris);

    // Daftar pilihan berasal dari kalkulator, bukan dari peta nama field lama.
    // Peta lama hanya mengenal 13 field generik (`vol_concrete`, `rebar_weight_kg`,
    // dst) sehingga pekerjaan seperti lantai kerja, urugan kembali, atau sengkang
    // tie beam tidak pernah bisa ditautkan ke RAB sama sekali.
    const result = rows.map((row: any) => {
      const params = typeof row.parameters === 'string' ? JSON.parse(row.parameters || '{}') : (row.parameters || {});
      const mto = calculateMto(row.element_type, params);

      const tersimpan = barisPerElemen.get(Number(row.id)) || [];
      const drift = adaDrift(tersimpan, mto);

      // Baris tersimpan yang ditawarkan kalau ada; kalkulator hanya untuk elemen
      // lama yang belum punya proyeksi tersimpan sama sekali.
      const pilihan = tersimpan.length > 0
        ? tersimpan.map((l: any) => ({
            code: l.line_code, label: l.label, unit: l.unit,
            net_quantity: Number(l.net_quantity),
            gross_quantity: Number(l.gross_quantity),
            waste_percent: Number(l.waste_percent),
          }))
        : mto.lines;

      return {
        element_id: row.id,
        element_type: row.element_type,
        element_name: row.element_name,
        variant: mto.variant,
        // Ditandai supaya layar bisa memberi tahu SEBELUM user menekan pilihan
        // yang akan ditolak 409 FORMULA_DRIFT.
        formula_drift: drift,
        available: pilihan
          .filter((l: any) => l.gross_quantity > 0)
          .map((l: any) => ({
            line_code: l.code,
            label: l.label,
            unit: l.unit,
            net_quantity: l.net_quantity,
            gross_quantity: l.gross_quantity,
            waste_percent: l.waste_percent,
            // `field` & `value` dipertahankan supaya layar lama tetap terbaca,
            // tapi bukan lagi angka yang dipakai backend saat menautkan.
            field: l.code,
            value: l.gross_quantity,
          })),
      };
    });

    res.json({ elements: result });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// PUT link a RAB item to an MTO quantity (saves link + updates qty/unit)
router.put('/proposals/:id/items/:itemId/mto-link', authMiddleware, bolehUbah, async (req: Request, res: Response) => {
  try {
    const proposalId = req.params.id;
    const itemId = req.params.itemId;
    const { element_id, line_code, field } = req.body;

    const locked = await proposalLock(proposalId);
    if (locked) return res.status(locked.status).json(locked.body);

    const item: any = await dbGet(
      'SELECT id, unit_snapshot FROM proposal_items WHERE id = ? AND proposal_id = ?',
      [itemId, proposalId]
    );
    if (!item) return res.status(404).json({ error: 'Item RAB tidak ditemukan pada proposal ini' });

    // Melepas tautan lewat PUT (element_id kosong).
    //
    // EST-MTO-R34: jalur ini sempat terlewat. Pembacaan qty lama dilakukan di
    // luar transaction dan status proposal tidak diperiksa ulang di dalamnya —
    // padahal jalur DELETE yang setara sudah dibereskan. Dua pintu untuk operasi
    // yang sama harus sama-sama dijaga.
    if (!element_id) {
      await withTransaction(async tx => {
        const raceLock = await proposalLockTx(proposalId, tx);
        if (raceLock) throw Object.assign(new Error('PROPOSAL_LOCKED'), { lock: raceLock });

        const cur: any = await tx.get(
          'SELECT mto_link, qty FROM proposal_items WHERE id = ? AND proposal_id = ? FOR UPDATE',
          [itemId, proposalId]
        );
        if (!cur) throw Object.assign(new Error('ITEM_NOT_FOUND'), {
          lock: { status: 404, body: { error: 'Item RAB tidak ditemukan pada proposal ini', code: 'ITEM_NOT_IN_PROPOSAL' } },
        });

        let restore = req.body.qty_manual;
        if (restore === undefined || restore === null) {
          try {
            const l = typeof cur.mto_link === 'string' ? JSON.parse(cur.mto_link) : cur.mto_link;
            restore = l?.previous_qty ?? cur.qty ?? 0;
          } catch { restore = cur.qty ?? 0; }
        }

        await tx.run(
          `UPDATE proposal_items
           SET mto_link = NULL, qty = ?, total_price = ? * unit_price_snapshot, updated_at = NOW()
           WHERE id = ? AND proposal_id = ?`,
          [restore, restore, itemId, proposalId]
        );
        await recalculateProposal(proposalId as string, tx);
      });
      return res.json({ message: 'MTO link removed', mto_link: null });
    }

    // EST-MTO-013: kuantitas TIDAK diambil dari klien.
    //
    // Sebelumnya `value` dan `unit` dikirim dari browser lalu langsung ditulis
    // sebagai kuantitas RAB. Artinya siapa pun yang bisa memanggil endpoint ini
    // menentukan sendiri angka penawarannya, dan angka itu tidak harus punya
    // hubungan apa pun dengan MTO yang ditautkan.
    //
    // Sekarang klien hanya menyebut elemen dan kode barisnya; kuantitasnya
    // dihitung ulang di server dari parameter elemen tersebut.
    // EST-MTO-R26: pembacaan elemen dan penulisan tautan dilakukan dalam SATU
    // transaction, dengan barisnya dikunci `FOR UPDATE`.
    //
    // `FOR UPDATE` di luar transaction tidak mengunci apa pun di MySQL, jadi
    // membungkusnya bukan formalitas: tanpa ini, menautkan dan menghapus elemen
    // yang sama secara bersamaan bisa saling mendahului — penghapusan memeriksa
    // tautan sebelum tautannya tersimpan, lalu tautan itu menunjuk elemen yang
    // sudah lenyap.
    const linkOutcome = await withTransaction(async tx => {
      // EST-MTO-R33: status diperiksa ulang DI DALAM transaction ini.
      const raceLock = await proposalLockTx(proposalId, tx);
      if (raceLock) return { error: raceLock.status, body: raceLock.body };

      const element: any = await tx.get(
        `SELECT id, element_type, element_name, parameters FROM engineering_inputs
         WHERE id = ? AND scope_type = 'proposal' AND scope_id = ? FOR UPDATE`,
        [element_id, proposalId]
      );
      if (!element) {
        return { error: 404, body: { error: 'Elemen MTO tidak ditemukan pada proposal ini', code: 'ELEMENT_NOT_IN_PROPOSAL' } };
      }

      const params = typeof element.parameters === 'string' ? JSON.parse(element.parameters || '{}') : (element.parameters || {});
      const mto = calculateMto(element.element_type, params);

      // EST-MTO-R38: yang mengikat adalah baris TERSIMPAN, bukan hasil
      // kalkulator saat ini — karena baris tersimpan itulah yang disalin Deal
      // menjadi baseline kontrak. Menautkan hasil kalkulator terbaru ke RAB
      // sementara baseline memakai baris lama menghasilkan dua kuantitas resmi
      // untuk satu scope, dan selisihnya baru terlihat setelah kontrak jadi.
      let tersimpan = await bacaBarisTersimpan(element.id, tx);

      if (tersimpan.length === 0) {
        // Elemen lama dari sebelum `mto_lines` ada (lihat backfill-mto-lines.js).
        // Materialkan proyeksinya di sini juga: ini tidak mengubah satu angka
        // pun — parameternya sama, kalkulatornya sama — tapi membuat elemen itu
        // punya versi, sehingga perubahan formula berikutnya terdeteksi.
        await persistMtoLines(element.id, mto, tx);
        await tx.run('UPDATE engineering_inputs SET formula_version = ? WHERE id = ?',
          [FORMULA_VERSION, element.id]);
        tersimpan = await bacaBarisTersimpan(element.id, tx);
      } else if (adaDrift(tersimpan, mto)) {
        // Ditolak, bukan diam-diam memakai angka baru. Penyelesaiannya satu
        // tindakan eksplisit: simpan ulang elemennya — yang menulis ulang baris
        // tersimpan DAN menyelaraskan seluruh RAB tertaut dalam satu transaction.
        return {
          error: 409,
          body: {
            error: `Formula kalkulator berubah sejak elemen "${element.element_name}" disimpan. `
              + 'Simpan ulang elemen MTO itu dulu supaya angka tersimpan dan angka sekarang kembali sama, '
              + 'baru tautkan ke RAB.',
            code: 'FORMULA_DRIFT',
            element_id: element.id,
            element_name: element.element_name,
            formula_version_stored: tersimpan[0]?.formula_version || null,
            formula_version_current: FORMULA_VERSION,
          },
        };
      }

      const wantedCode = line_code || field;
      const barisTersimpan = tersimpan.find(l => String(l.line_code) === String(wantedCode));
      const line = barisTersimpan
        ? {
            code: barisTersimpan.line_code,
            label: barisTersimpan.label,
            unit: barisTersimpan.unit,
            net_quantity: Number(barisTersimpan.net_quantity),
            gross_quantity: Number(barisTersimpan.gross_quantity),
            waste_percent: Number(barisTersimpan.waste_percent),
          }
        : undefined;
      if (!line) {
        return {
          error: 404,
          body: {
            error: `Baris MTO "${wantedCode}" tidak ada pada elemen ini`,
            code: 'LINE_NOT_FOUND',
            available: mto.lines.map(l => ({ code: l.code, label: l.label, unit: l.unit })),
          },
        };
      }

      const unitCheck = checkUnitCompatibility(line.unit, item.unit_snapshot);
      if (!unitCheck.compatible) {
        return {
          error: 409,
          body: { error: unitCheck.reason, code: 'UNIT_MISMATCH', mto_unit: line.unit, rab_unit: item.unit_snapshot },
        };
      }

      // EST-MTO-R13: RAB selalu net; gross disimpan sebagai informasi procurement.
      const value = line.net_quantity;
      // EST-MTO-R17: kuantitas manual sebelum penautan disimpan, supaya melepas
      // tautan bisa mengembalikannya. Tanpa ini, unlink meninggalkan angka hasil
      // MTO seolah-olah itu isian manual user.
      const priorRow: any = await tx.get(
        'SELECT qty FROM proposal_items WHERE id = ? AND proposal_id = ?', [itemId, proposalId]
      );
      const mtoLink = {
        element_id: element.id,
        previous_qty: Number(priorRow?.qty ?? 0),
        element_type: element.element_type,
        element_name: element.element_name,
        line_code: line.code,
        basis: 'net',
        gross_quantity: line.gross_quantity,
        waste_percent: line.waste_percent,
        value,
        unit: line.unit,
        // Versi yang disepakati saat tautan dibuat. Gerbang submit/deal
        // membandingkannya dengan versi baris tersimpan.
        formula_version: barisTersimpan?.formula_version || FORMULA_VERSION,
      };

      await tx.run(
        `UPDATE proposal_items
         SET mto_link = ?, qty = ?, total_price = ? * unit_price_snapshot, updated_at = NOW()
         WHERE id = ? AND proposal_id = ?`,
        [JSON.stringify(mtoLink), value, value, itemId, proposalId]
      );

      await recalculateProposal(proposalId as string, tx);

      // EST-MTO-R39: baris final ikut dikembalikan supaya layar tidak perlu
      // menebak. Sebelumnya respons hanya membawa `mto_link`, dan layar
      // menyimpan payload-nya sendiri — termasuk `value` yang berisi GROSS —
      // sehingga baris menampilkan angka yang tidak pernah tersimpan.
      const barisFinal = await tx.get(
        `SELECT id, qty, total_price, unit_snapshot, unit_price_snapshot, mto_link
         FROM proposal_items WHERE id = ? AND proposal_id = ?`,
        [itemId, proposalId]
      );
      return { ok: true as const, mtoLink, line, item: barisFinal };
    });

    if ('error' in linkOutcome) {
      return res.status(linkOutcome.error).json(linkOutcome.body);
    }

    res.json({
      message: 'MTO link saved',
      mto_link: linkOutcome.mtoLink,
      line: linkOutcome.line,
      item: linkOutcome.item,
    });
  } catch (err: any) {
    if (err?.lock) return res.status(err.lock.status).json(err.lock.body);
    res.status(500).json({ error: err.message });
  }
});

// PUT unlink (remove MTO link from item, restore manual qty)
router.delete('/proposals/:id/items/:itemId/mto-link', authMiddleware, bolehHapus, async (req: Request, res: Response) => {
  try {
    const lockedUnlink = await proposalLock(req.params.id);
    if (lockedUnlink) return res.status(lockedUnlink.status).json(lockedUnlink.body);

    // EST-MTO-R29 + R17 + R33: pembacaan qty lama, pelepasan tautan, dan
    // penghitungan ulang ringkasan dilakukan dalam SATU transaction, dengan
    // status proposal diperiksa di dalamnya.
    //
    // Versi sebelumnya membaca, meng-UPDATE, lalu memanggil recalculate sebagai
    // tiga langkah terpisah — kalau yang terakhir gagal, item sudah terlepas
    // sementara header masih memakai angka lama.
    const barisSetelahLepas = await withTransaction(async tx => {
      const raceLock = await proposalLockTx(req.params.id, tx);
      if (raceLock) throw Object.assign(new Error('PROPOSAL_LOCKED'), { lock: raceLock });

      const curItem: any = await tx.get(
        'SELECT mto_link, qty FROM proposal_items WHERE id = ? AND proposal_id = ? FOR UPDATE',
        [req.params.itemId, req.params.id]
      );
      if (!curItem) throw Object.assign(new Error('ITEM_NOT_FOUND'), {
        lock: { status: 404, body: { error: 'Item RAB tidak ditemukan pada proposal ini', code: 'ITEM_NOT_IN_PROPOSAL' } },
      });

      let restoreQty = Number(curItem.qty ?? 0);
      try {
        const l = typeof curItem.mto_link === 'string' ? JSON.parse(curItem.mto_link) : curItem.mto_link;
        if (l && l.previous_qty !== undefined) restoreQty = Number(l.previous_qty);
      } catch { /* biarkan pakai qty sekarang */ }

      await tx.run(
        `UPDATE proposal_items
         SET mto_link = NULL, qty = ?, total_price = ? * unit_price_snapshot, updated_at = NOW()
         WHERE id = ? AND proposal_id = ?`,
        [restoreQty, restoreQty, req.params.itemId, req.params.id]
      );
      await recalculateProposal(req.params.id as string, tx);

      // EST-MTO-R39: baris final ikut dikembalikan. Sebelumnya respons hanya
      // berisi pesan, sehingga layar hanya menghapus badge tautan dan
      // meninggalkan qty/total lama di baris — input yang kembali aktif berisi
      // angka yang bukan lagi isi database.
      return tx.get(
        `SELECT id, qty, total_price, unit_snapshot, unit_price_snapshot, mto_link
         FROM proposal_items WHERE id = ? AND proposal_id = ?`,
        [req.params.itemId, req.params.id]
      );
    });

    res.json({ message: 'MTO link removed', item: barisSetelahLepas });
  } catch (err: any) {
    // EST-MTO-R34b: transaction di atas melempar error ber-`lock` untuk kondisi
    // yang punya arti HTTP sendiri — proposal terkunci (409) dan item tidak ada
    // (404). Tanpa pemetaan ini keduanya keluar sebagai 500, jadi klien tidak
    // bisa membedakan "tidak boleh" dari "sistem rusak" dan menampilkan pesan
    // error umum untuk situasi yang sebenarnya normal.
    if (err?.lock) return res.status(err.lock.status).json(err.lock.body);
    console.error('Error removing MTO link:', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;

