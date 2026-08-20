import { Router, Request, Response } from 'express';
import { calculateMto, toLegacyQuantities, FORMULA_VERSION, MtoResult } from '../modules/estimator/mto/calculator';
import { checkUnitCompatibility, isProposalEditable } from '../modules/estimator/mto/units';
import { enrichMtoElement, groupStoredLines } from '../modules/estimator/mto/enrich';
import { authMiddleware } from '../middleware/auth';
import { dbAll, dbGet, dbRun , withTransaction, TxRunner} from '../config/database';
import { nextSequentialCode } from './procurement.routes';
import { uang, bulatUang, jumlahUang } from '../utils/money';

const router = Router();

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
router.get('/proposals', authMiddleware, async (_req: Request, res: Response) => {
  try {
    const proposals = await dbAll(
      `SELECT p.*, u.username as created_by_name
       FROM proposals p
       LEFT JOIN users u ON p.created_by = u.id
       ORDER BY p.created_at DESC`
    );
    res.json(proposals);
  } catch (error) {
    console.error('Error fetching proposals:', error);
    res.status(500).json({ error: 'Failed to fetch proposals' });
  }
});

// Get proposal detail
router.get('/proposals/:id', authMiddleware, async (req: Request, res: Response) => {
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
router.get('/proposals/:id/items', authMiddleware, async (req: Request, res: Response) => {
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
router.get('/proposals/:id/schedule', authMiddleware, async (req: Request, res: Response) => {
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
 * Syarat minimum sebuah proposal boleh dikirim atau dijadikan kontrak.
 *
 * Mengembalikan `null` kalau lolos, atau body error 400 yang menyebutkan
 * **semua** pelanggaran sekaligus — supaya estimator tidak menemukannya satu per
 * satu lewat percobaan berulang.
 */
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

router.put('/proposals/:id/items/scope', authMiddleware, async (req: Request, res: Response) => {
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
router.get('/proposals/:id/items/incomplete', authMiddleware, async (req: Request, res: Response) => {
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

// ── Override: save manual start/duration for a schedule item
router.put('/proposals/:id/schedule/overrides', authMiddleware, async (req: Request, res: Response) => {
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
router.delete('/proposals/:id/schedule/overrides/:itemId', authMiddleware, async (req: Request, res: Response) => {
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
router.get('/proposals/:id/payment-schedule', authMiddleware, async (req: Request, res: Response) => {
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

router.get('/proposals/:proposalId/schedule-progress/:itemId', authMiddleware, async (req: Request, res: Response) => {
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
router.put('/proposals/:proposalId/schedule-progress', authMiddleware, async (req: Request, res: Response) => {
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


router.post('/proposals', authMiddleware, async (req: Request, res: Response) => {
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

    const result = await tx.run(
      `INSERT INTO proposals (proposal_number, project_name, client, client_id, lokasi, revision, proposal_type, design_params, status, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?)`,
      [proposalNumber, project_name, client || null, client_id || null, lokasi || null, revision || 'Rev-0', 
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
            // Try auto-assign AHSP by exact name match
            const matched = ahspLookup[child.name];
            const ahspId = matched ? matched.id : null;
            const ahspCode = matched ? matched.kode : `${section.code}.${child.num}`.replace(/\.$/, '');
            const ahspName = matched ? matched.name : child.name;
            const ahspUnit = matched ? matched.satuan : '';
            const ahspPrice = matched ? parseFloat(matched.harga_satuan) || 0 : 0;

            await tx.run(
              `INSERT INTO proposal_items 
               (proposal_id, ahsp_id, ahsp_code_snapshot, ahsp_name_snapshot, unit_snapshot, unit_price_snapshot,
                description, qty, total_price, order_no, section_label, is_section, section_order)
               VALUES (?, ?, ?, ?, ?, ?, NULL, 0, 0, ?, NULL, 0, ?)`,
              [proposalId, ahspId, ahspCode, ahspName, ahspUnit, ahspPrice, orderNo, i + 1]
            );
            orderNo++;
          }
        }
      }
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
router.put('/proposals/:id', authMiddleware, async (req: Request, res: Response) => {
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

      await tx.run(
        `UPDATE proposals
         SET project_name = ?, client = ?, client_id = ?, lokasi = ?, revision = ?
         WHERE id = ?`,
        [project_name, client, client_id || null, lokasi, revision, req.params.id]
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

// Apply template wizard to existing proposal
router.post('/proposals/:id/apply-template', authMiddleware, async (req: Request, res: Response) => {
  try {
    // EST-MTO-R23: menerapkan template menyisipkan item RAB baru, jadi ia
    // mengubah nilai komersial persis seperti menambah item satu per satu.
    // Tanpa kunci, proposal yang sudah dikirim ke pelanggan masih bisa
    // ditambahi seluruh paket pekerjaan.
    const proposalId = req.params.id;
    const { proposal_type, template_sections, mode = 'append' } = req.body;
    // mode: 'append' = add items | 'replace' = delete existing items first

    if (!template_sections || !Array.isArray(template_sections) || template_sections.length === 0) {
      return res.status(400).json({ error: 'template_sections required' });
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

      if (mode === 'replace') {
      await tx.run('DELETE FROM proposal_items WHERE proposal_id = ?', [proposalId]);
    }

    // Update proposal_type on the proposal
    if (proposal_type) {
      await tx.run('UPDATE proposals SET proposal_type = ? WHERE id = ?', [proposal_type, proposalId]);
    }

    // Map proposal_type to AHSP code prefix
    const typePrefix: Record<string, string> = {
      civil_building: 'CB', civil_structure: 'CS', piping: 'PP',
      electrical: 'EL', mechanical: 'ME'
    };
    const prefix = typePrefix[proposal_type as string] || '';

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
          const matched = ahspLookup[child.name];
          const ahspId   = matched ? matched.id   : null;
          const ahspCode = matched ? matched.kode  : `${section.code}.${child.num}`.replace(/\.$/, '');
          const ahspName = matched ? matched.name  : child.name;
          const ahspUnit = matched ? matched.satuan : '';
          const ahspPrice = matched ? parseFloat(matched.harga_satuan) || 0 : 0;

          await tx.run(
            `INSERT INTO proposal_items
             (proposal_id, ahsp_id, ahsp_code_snapshot, ahsp_name_snapshot, unit_snapshot, unit_price_snapshot,
              description, qty, total_price, order_no, section_label, is_section, section_order)
             VALUES (?, ?, ?, ?, ?, ?, NULL, 0, 0, ?, NULL, 0, ?)`,
            [proposalId, ahspId, ahspCode, ahspName, ahspUnit, ahspPrice, orderNo, startSection + i + 1]
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
router.delete('/proposals/:id', authMiddleware, async (req: Request, res: Response) => {
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

      await tx.run('DELETE FROM proposals WHERE id = ?', [req.params.id]);
      return { ok: true as const };
    });

    if ('error' in hasil) return res.status(hasil.error).json(hasil.body);
    res.json({ message: 'Proposal deleted' });
  } catch (error) {
    console.error('Error deleting proposal:', error);
    res.status(500).json({ error: 'Failed to delete proposal' });
  }
});

// ============================================
// PROPOSAL ITEMS ENDPOINTS
// ============================================

// Add item to proposal
router.post('/proposals/:proposalId/items', authMiddleware, async (req: Request, res: Response) => {
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
    
    // Get AHSP data for snapshot
    const ahsp = await dbGet(
      `SELECT kode, name, satuan, harga_satuan FROM ahsp_headers WHERE id = ?`,
      [ahsp_id]
    );
    
    if (!ahsp) {
      return res.status(404).json({ error: 'AHSP not found' });
    }
    
    // Get next order_no
    const lastOrder = await dbGet(
      `SELECT MAX(order_no) as max_order FROM proposal_items WHERE proposal_id = ?`,
      [proposalId]
    );
    const orderNo = ((lastOrder as any)?.max_order || 0) + 1;
    
    const qtyCek = validasiQty(qty);
    if (!qtyCek.ok) return res.status(400).json({ error: qtyCek.pesan, code: 'QTY_TIDAK_VALID' });

    const qtyValue = qtyCek.qty;
    const unitPrice = parseFloat(ahsp.harga_satuan as any) || 0;
    const totalPrice = bulatUang(qtyValue * unitPrice);
    
    // EST-MTO-R29: mutasi item dan penghitungan ulang ringkasan adalah SATU unit.
    //
    // Melempar error dari recalculateProposal() tidak bisa membatalkan SQL yang
    // sudah ter-commit sebelumnya. Kalau recalc gagal setelah item berubah,
    // yang tersisa: baris sudah berubah, header belum, dan klien menerima 500.
    const insertedId = await withTransaction(async tx => {
      // EST-MTO-R33: status diperiksa ulang DI DALAM transaction ini.
      const raceLock = await proposalLockTx(proposalId, tx);
      if (raceLock) throw Object.assign(new Error('PROPOSAL_LOCKED'), { lock: raceLock });

      const r = await tx.run(
        `INSERT INTO proposal_items
         (proposal_id, discipline_id, sub_discipline_id, ahsp_id,
          ahsp_code_snapshot, ahsp_name_snapshot, unit_snapshot, unit_price_snapshot,
          qty, total_price, order_no)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [proposalId, discipline_id ?? null, sub_discipline_id ?? null, ahsp_id,
         ahsp.kode, ahsp.name, ahsp.satuan, unitPrice,
         qtyValue, totalPrice, orderNo]
      );
      await recalculateProposal(proposalId as string, tx);
      return r.insertId;
    });

    res.status(201).json({ message: 'Item added', id: insertedId });
  } catch (error: any) {
    if (error?.lock) return res.status(error.lock.status).json(error.lock.body);
    console.error('Error adding proposal item:', error);
    res.status(500).json({ error: 'Failed to add proposal item' });
  }
});

// Update proposal item (qty)
router.put('/proposals/:proposalId/items/:itemId', authMiddleware, async (req: Request, res: Response) => {
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

    const { qty, description, ahsp_id } = req.body;
    const { proposalId, itemId } = req.params;
    
    // Get current item to recalculate
    const item = await dbGet(
      `SELECT unit_price_snapshot FROM proposal_items WHERE id = ? AND proposal_id = ?`,
      [itemId, proposalId]
    );
    
    if (!item) {
      return res.status(404).json({ error: 'Item not found' });
    }
    
    // Build update query dynamically
    const updates: string[] = [];
    const values: any[] = [];

    // Assign AHSP to an existing item (from wizard sub-items)
    if (ahsp_id !== undefined) {
      const ahsp: any = await dbGet(
        `SELECT id, kode, name, satuan, harga_satuan FROM ahsp_headers WHERE id = ? AND status = 'active'`,
        [ahsp_id]
      );
      if (!ahsp) {
        return res.status(404).json({ error: 'AHSP not found' });
      }
      updates.push('ahsp_id = ?', 'ahsp_code_snapshot = ?', 'ahsp_name_snapshot = ?', 'unit_snapshot = ?', 'unit_price_snapshot = ?');
      values.push(ahsp.id, ahsp.kode, ahsp.name, ahsp.satuan, ahsp.harga_satuan);
      
      // Also recalculate total_price with new unit price
      const currentItem: any = await dbGet(`SELECT qty FROM proposal_items WHERE id = ? AND proposal_id = ?`, [itemId, proposalId]);
      const currentQty = parseFloat(currentItem?.qty) || 0;
      updates.push('total_price = ?');
      values.push(currentQty * parseFloat(ahsp.harga_satuan));
    }
    
    if (qty !== undefined) {
      // `parseFloat(qty) || 0` menerima apa saja: "-1" menjadi -1 dan langsung
      // dikalikan harga snapshot, menghasilkan line total serta `total_project`
      // negatif; "abc" dan Infinity diam-diam menjadi 0.
      const qtyCek = validasiQty(qty);
      if (!qtyCek.ok) return res.status(400).json({ error: qtyCek.pesan, code: 'QTY_TIDAK_VALID' });
      const qtyValue = qtyCek.qty;

      // Use new unit price if ahsp was also assigned, otherwise use existing
      let unitPrice: number;
      if (ahsp_id !== undefined) {
        const ahsp: any = await dbGet(`SELECT harga_satuan FROM ahsp_headers WHERE id = ?`, [ahsp_id]);
        unitPrice = parseFloat(ahsp?.harga_satuan) || 0;
      } else {
        unitPrice = parseFloat((item as any).unit_price_snapshot) || 0;
      }
      const totalPrice = bulatUang(qtyValue * unitPrice);
      updates.push('qty = ?', 'total_price = ?');
      values.push(qtyValue, totalPrice);
    }
    
    if (description !== undefined) {
      updates.push('description = ?');
      values.push(description);
    }
    
    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }
    
    // EST-MTO-R29: mutasi item dan penghitungan ulang ringkasan adalah SATU unit.
    //
    // Melempar error dari recalculateProposal() tidak bisa membatalkan SQL yang
    // sudah ter-commit sebelumnya. Kalau recalc gagal setelah item berubah,
    // yang tersisa: baris sudah berubah, header belum, dan klien menerima 500.
    values.push(itemId, proposalId);

    await withTransaction(async tx => {
      // EST-MTO-R33: status diperiksa ulang DI DALAM transaction ini.
      const raceLock = await proposalLockTx(proposalId, tx);
      if (raceLock) throw Object.assign(new Error('PROPOSAL_LOCKED'), { lock: raceLock });

      await tx.run(
        `UPDATE proposal_items SET ${updates.join(', ')} WHERE id = ? AND proposal_id = ?`,
        values
      );
      await recalculateProposal(proposalId as string, tx);
    });

    res.json({ message: 'Item updated' });
  } catch (error: any) {
    if (error?.lock) return res.status(error.lock.status).json(error.lock.body);
    console.error('Error updating proposal item:', error);
    res.status(500).json({ error: 'Failed to update proposal item' });
  }
});

// Delete proposal item
router.delete('/proposals/:proposalId/items/:itemId', authMiddleware, async (req: Request, res: Response) => {
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
    await withTransaction(async tx => {
      // EST-MTO-R33: status diperiksa ulang DI DALAM transaction ini.
      const raceLock = await proposalLockTx(proposalId, tx);
      if (raceLock) throw Object.assign(new Error('PROPOSAL_LOCKED'), { lock: raceLock });

      await tx.run('DELETE FROM proposal_items WHERE id = ? AND proposal_id = ?', [itemId, proposalId]);
      await recalculateProposal(proposalId as string, tx);
    });

    res.json({ message: 'Item deleted' });
  } catch (error: any) {
    if (error?.lock) return res.status(error.lock.status).json(error.lock.body);
    console.error('Error deleting proposal item:', error);
    res.status(500).json({ error: 'Failed to delete proposal item' });
  }
});

// Get proposal summary/calculations
router.get('/proposals/:id/summary', authMiddleware, async (req: Request, res: Response) => {
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
router.get('/proposals/:id/rab', authMiddleware, async (req: Request, res: Response) => {
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
router.get('/proposals/:id/pr-handoff', authMiddleware, async (req: Request, res: Response) => {
  try {
    const job: any = await dbGet('SELECT * FROM deal_pr_jobs WHERE proposal_id = ?', [req.params.id]);
    if (!job) return res.status(404).json({ error: 'Belum ada handoff untuk proposal ini', code: 'NO_HANDOFF' });
    res.json({ data: job });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// POST retry — idempoten; kalau sudah sukses tidak membuat PR kedua.
router.post('/proposals/:id/pr-handoff/retry', authMiddleware, async (req: Request, res: Response) => {
  try {
    const job: any = await dbGet('SELECT status FROM deal_pr_jobs WHERE proposal_id = ?', [req.params.id]);
    if (!job) return res.status(404).json({ error: 'Belum ada handoff untuk proposal ini', code: 'NO_HANDOFF' });

    const hasil = await processDealPrJob(req.params.id, (req as any).userId);
    res.json({ message: 'Handoff diproses ulang', data: hasil });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.put('/proposals/:id/status', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { status: newStatus } = req.body;
    const userId = (req as any).userId || 1;
    const proposalId = req.params.id;

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

      if (newStatus !== 'deal') {
        await writeStatus();
        return { ok: true, projectId: null, projectNumber: null, createdProject: false, proposal };
      }

      if (proposal.project_id) {
        // Sudah punya project — jangan buat lagi, statusnya saja yang ditulis.
        console.log(`[Proposal ${proposalId}] sudah punya project ${proposal.project_id}, pembuatan project dilewati`);
        await writeStatus();
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
      return { ok: true, projectId, projectNumber, createdProject: true, proposal };
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
router.get('/proposals/:id/resume', authMiddleware, async (req: Request, res: Response) => {
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
router.get('/proposals/:id/mto', authMiddleware, async (req: Request, res: Response) => {
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
router.post('/proposals/:id/mto', authMiddleware, async (req: Request, res: Response) => {
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
router.put('/proposals/:id/mto/:elementId', authMiddleware, async (req: Request, res: Response) => {
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
router.delete('/proposals/:id/mto/:elementId', authMiddleware, async (req: Request, res: Response) => {
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
router.get('/proposals/:id/mto-quantities', authMiddleware, async (req: Request, res: Response) => {
  try {
    const rows: any[] = await dbAll(
      `SELECT id, element_type, element_name, parameters
       FROM engineering_inputs
       WHERE scope_type = 'proposal' AND scope_id = ?
       ORDER BY element_type, sort_order`,
      [req.params.id]
    );

    // Daftar pilihan berasal dari kalkulator, bukan dari peta nama field lama.
    // Peta lama hanya mengenal 13 field generik (`vol_concrete`, `rebar_weight_kg`,
    // dst) sehingga pekerjaan seperti lantai kerja, urugan kembali, atau sengkang
    // tie beam tidak pernah bisa ditautkan ke RAB sama sekali.
    const result = rows.map((row: any) => {
      const params = typeof row.parameters === 'string' ? JSON.parse(row.parameters || '{}') : (row.parameters || {});
      const mto = calculateMto(row.element_type, params);

      return {
        element_id: row.id,
        element_type: row.element_type,
        element_name: row.element_name,
        variant: mto.variant,
        available: mto.lines
          .filter(l => l.gross_quantity > 0)
          .map(l => ({
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
router.put('/proposals/:id/items/:itemId/mto-link', authMiddleware, async (req: Request, res: Response) => {
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

      const wantedCode = line_code || field;
      const line = mto.lines.find(l => l.code === wantedCode);
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
      };

      await tx.run(
        `UPDATE proposal_items
         SET mto_link = ?, qty = ?, total_price = ? * unit_price_snapshot, updated_at = NOW()
         WHERE id = ? AND proposal_id = ?`,
        [JSON.stringify(mtoLink), value, value, itemId, proposalId]
      );

      await recalculateProposal(proposalId as string, tx);
      return { ok: true as const, mtoLink, line };
    });

    if ('error' in linkOutcome) {
      return res.status(linkOutcome.error).json(linkOutcome.body);
    }

    res.json({ message: 'MTO link saved', mto_link: linkOutcome.mtoLink, line: linkOutcome.line });
  } catch (err: any) {
    if (err?.lock) return res.status(err.lock.status).json(err.lock.body);
    res.status(500).json({ error: err.message });
  }
});

// PUT unlink (remove MTO link from item, restore manual qty)
router.delete('/proposals/:id/items/:itemId/mto-link', authMiddleware, async (req: Request, res: Response) => {
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
    await withTransaction(async tx => {
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
    });

    res.json({ message: 'MTO link removed' });
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

