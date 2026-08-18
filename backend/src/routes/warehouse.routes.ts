import { Router, Request, Response } from 'express';
import { dbAll, dbGet, dbRun } from '../config/database';
import { authMiddleware } from '../middleware/auth';

const router = Router();

// ===== SPECIFIC ROUTES FIRST (before /:id) =====

// Warehouses list
router.get('/', authMiddleware, async (_req: Request, res: Response) => {
  try {
    const warehouses = await dbAll('SELECT * FROM warehouses ORDER BY name ASC', []);
    res.json({ data: warehouses });
  } catch (error) {
    console.error('Error fetching warehouses:', error);
    res.status(500).json({ error: 'Failed to fetch warehouses' });
  }
});

// Create warehouse
router.post('/', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { code, name, address, contact_person, is_active } = req.body;
    if (!code || !name) return res.status(400).json({ error: 'code and name are required' });

    const result = await dbRun(
      'INSERT INTO warehouses (code, name, address, contact_person, is_active) VALUES (?, ?, ?, ?, ?)',
      [code, name, address || null, contact_person || null, is_active !== false ? 1 : 0]
    );
    res.status(201).json({ message: 'Warehouse created', data: { id: result.insertId, code, name } });
  } catch (error: any) {
    console.error('Error creating warehouse:', error);
    if (error.message?.includes('UNIQUE')) return res.status(400).json({ error: 'Warehouse code must be unique' });
    res.status(500).json({ error: error.message || 'Failed to create warehouse' });
  }
});

// GET /api/warehouses/locations - Fetch all locations across warehouses
router.get('/locations', authMiddleware, async (req: Request, res: Response) => {
  try {
    const locations = await dbAll(`
      SELECT wl.*, w.name as warehouse_name, w.code as warehouse_code
      FROM warehouse_locations wl
      JOIN warehouses w ON wl.warehouse_id = w.id
      ORDER BY w.name, wl.code ASC
    `, []);
    res.json({ data: locations });
  } catch (error) {
    console.error('Error fetching warehouse locations:', error);
    res.status(500).json({ error: 'Failed to fetch warehouse locations' });
  }
});

// Stock movements should be defined before catch-all "/:id" routes
router.get('/stock-movements', authMiddleware, async (req: Request, res: Response) => {
  try {
    const movements = await dbAll(
      `SELECT sm.*, p.sku, p.name as product_name, w.name as warehouse_name, wl.code as location_code
       FROM stock_movements sm
       JOIN products p ON sm.product_id = p.id
       JOIN warehouses w ON sm.warehouse_id = w.id
       LEFT JOIN warehouse_locations wl ON sm.location_id = wl.id
       ORDER BY sm.moved_at DESC`,
      []
    );
    res.json({ data: movements });
  } catch (error) {
    console.error('Error fetching stock movements:', error);
    res.status(500).json({ error: 'Failed to fetch stock movements' });
  }
});

router.post('/stock-movements', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { product_id, warehouse_id, location_id, batch_id, movement_type, quantity, uom, reference_type, reference_id, notes } = req.body;
    if (!product_id || !warehouse_id || !movement_type || quantity === undefined) {
      return res.status(400).json({ error: 'product_id, warehouse_id, movement_type, and quantity are required' });
    }

    const qty = Number(quantity);
    if (Number.isNaN(qty) || qty <= 0) return res.status(400).json({ error: 'quantity must be a positive number' });

    const movementResult = await dbRun(
      'INSERT INTO stock_movements (product_id, warehouse_id, location_id, batch_id, movement_type, quantity, uom, reference_type, reference_id, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [product_id, warehouse_id, location_id || null, batch_id || null, movement_type, qty, uom || null, reference_type || null, reference_id || null, notes || null]
    );
    const movementId = movementResult.insertId;

    const inv = await dbGet('SELECT id, quantity_on_hand, quantity_reserved FROM inventory WHERE product_id = ?', [product_id]) as { id: number; quantity_on_hand: number; quantity_reserved: number } | undefined;

    if (!inv) {
      const onHand = movement_type === 'OUT' ? -qty : qty;
      if (onHand < 0) throw new Error('Cannot create negative stock');
      await dbRun(
        'INSERT INTO inventory (product_id, quantity_on_hand, quantity_reserved, quantity_available, location) VALUES (?, ?, ?, ?, ?)',
        [product_id, onHand, 0, onHand, null]
      );
    } else {
      let onHand = inv.quantity_on_hand || 0;
      if (movement_type === 'IN') onHand += qty;
      if (movement_type === 'OUT') onHand -= qty;
      if (movement_type === 'TRANSFER') onHand = onHand; // net zero but record movement
      if (onHand < 0) throw new Error('Insufficient stock');
      
      const reserved = inv.quantity_reserved || 0;
      await dbRun(
        'UPDATE inventory SET quantity_on_hand = ?, quantity_reserved = ?, quantity_available = ? WHERE id = ?',
        [onHand, reserved, onHand - reserved, inv.id]
      );
    }

    res.status(201).json({ message: 'Stock movement recorded', data: { id: movementId } });
  } catch (error: any) {
    console.error('Error recording stock movement:', error);
    const msg = error.message?.includes('Insufficient') || error.message?.includes('negative') ? error.message : 'Failed to record stock movement';
    res.status(400).json({ error: msg });
  }
});

// ===== PARAMETERIZED ROUTES (/:id) =====

// Get single warehouse
// DR-P2-03: route statis WAJIB didaftarkan sebelum `/:id`.
//
// Express mencocokkan berurutan, jadi `/:id` menangkap string "allocate-stock"
// sebagai id dan mengembalikan 404 "Warehouse not found". Endpoint alokasi
// FIFO/FEFO ini tidak pernah terjangkau sama sekali sejak dibuat.
router.get('/allocate-stock', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { product_id, quantity, method = 'FEFO', warehouse_id } = req.query;
    
    if (!product_id || !quantity) {
      return res.status(400).json({ error: 'product_id and quantity are required' });
    }

    // P2 API-CONTRACT: input divalidasi sebagai kontrak, bukan diterjemahkan
    // diam-diam.
    //
    // Sebelumnya `parseFloat()` dipakai tanpa pemeriksaan, jadi `quantity=-1`
    // menghasilkan respons SUKSES dengan `can_fulfill: true` dan alokasi nol —
    // pemanggil menyimpulkan kebutuhan stoknya terpenuhi. `method` selain FEFO
    // juga jatuh diam-diam ke FIFO sementara respons tetap memantulkan string
    // yang salah ketik itu, jadi pemanggil tidak pernah tahu urutan pickingnya
    // bukan yang ia minta.
    const qtyNeeded = parseFloat(quantity as string);
    if (!Number.isFinite(qtyNeeded) || qtyNeeded <= 0) {
      return res.status(400).json({
        error: 'quantity harus angka lebih besar dari nol.',
        code: 'INVALID_QUANTITY',
        diterima: quantity,
      });
    }

    const METODE_SAH = ['FIFO', 'FEFO'] as const;
    const pickMethod = String(method || 'FEFO').toUpperCase();
    if (!METODE_SAH.includes(pickMethod as any)) {
      return res.status(400).json({
        error: `method harus salah satu dari ${METODE_SAH.join(' atau ')}.`,
        code: 'INVALID_PICKING_METHOD',
        diterima: method,
      });
    }

    // Query ditulis ulang terhadap SKEMA YANG SEBENARNYA.
    //
    // Versi lama menunjuk kolom yang tidak ada sama sekali: `inventory_stocks`
    // tidak punya `batch_id`, `location_id`, maupun `uom`, dan `batches` memakai
    // `expiry_date`/`manufacture_date` — bukan `exp_date`/`mfg_date`. Endpoint
    // ini karena itu tidak pernah bisa bekerja: mati dua kali, tidak terjangkau
    // karena tertutup `/:id` DAN rusak seandainya terjangkau. Ketahuan hanya
    // setelah route-nya dibuka dan inputnya divalidasi.
    //
    // Stok per batch ada di `batches.quantity`; `inventory_stocks` menyimpan
    // saldo per gudang tanpa rincian batch, jadi alokasi FIFO/FEFO memang harus
    // dibaca dari `batches`.
    let query = `
      SELECT b.id AS batch_id, b.batch_number, b.quantity,
             b.expiry_date, b.manufacture_date,
             w.id AS warehouse_id, w.name AS warehouse_name, w.code AS warehouse_code
      FROM batches b
      JOIN warehouses w ON w.id = b.warehouse_id
      WHERE b.product_id = ?
        AND b.quantity > 0
        AND b.status IN ('released', 'open')
    `;

    const params: any[] = [product_id];

    if (warehouse_id) {
      query += ` AND w.id = ?`;
      params.push(warehouse_id);
    }

    if (pickMethod === 'FEFO') {
      // Kedaluwarsa paling dekat lebih dulu; batch tanpa tanggal kedaluwarsa
      // ditaruh paling belakang supaya tidak mendahului yang benar-benar mendesak.
      query += ` ORDER BY
        CASE WHEN b.expiry_date IS NULL THEN 1 ELSE 0 END,
        b.expiry_date ASC,
        b.manufacture_date ASC`;
    } else {
      query += ` ORDER BY b.manufacture_date ASC, b.batch_number ASC`;
    }

    const batches = await dbAll(query, params) as any[];

    // Calculate allocation
    const allocation = [];
    let remainingQty = qtyNeeded;

    for (const batch of batches) {
      if (remainingQty <= 0) break;

      const allocQty = Math.min(remainingQty, Number(batch.quantity) || 0);
      allocation.push({
        batch_id: batch.batch_id,
        batch_number: batch.batch_number,
        warehouse_id: batch.warehouse_id,
        warehouse: batch.warehouse_name,
        warehouse_code: batch.warehouse_code,
        allocated_qty: allocQty,
        available_qty: Number(batch.quantity),
        expiry_date: batch.expiry_date,
        manufacture_date: batch.manufacture_date,
      });

      remainingQty -= allocQty;
    }

    const canFulfill = remainingQty <= 0;

    res.json({
      data: {
        product_id,
        quantity_needed: qtyNeeded,
        quantity_allocated: qtyNeeded - remainingQty,
        quantity_short: remainingQty > 0 ? remainingQty : 0,
        can_fulfill: canFulfill,
        method: pickMethod,
        allocation_count: allocation.length,
        allocation,
      },
    });
  } catch (error) {
    console.error('Error allocating stock:', error);
    res.status(500).json({ error: 'Failed to allocate stock' });
  }
});

router.get('/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const warehouse = await dbGet('SELECT * FROM warehouses WHERE id = ?', [req.params.id]);
    if (!warehouse) return res.status(404).json({ error: 'Warehouse not found' });
    res.json({ data: warehouse });
  } catch (error) {
    console.error('Error fetching warehouse:', error);
    res.status(500).json({ error: 'Failed to fetch warehouse' });
  }
});

// Update warehouse
router.put('/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { code, name, address, contact_person, is_active } = req.body;
    await dbRun(
      'UPDATE warehouses SET code = ?, name = ?, address = ?, contact_person = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [code, name, address || null, contact_person || null, is_active !== false ? 1 : 0, req.params.id]
    );
    res.json({ message: 'Warehouse updated' });
  } catch (error: any) {
    console.error('Error updating warehouse:', error);
    res.status(500).json({ error: error.message || 'Failed to update warehouse' });
  }
});

// Delete warehouse
router.delete('/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    await dbRun('DELETE FROM warehouses WHERE id = ?', [req.params.id]);
    res.json({ message: 'Warehouse deleted' });
  } catch (error) {
    console.error('Error deleting warehouse:', error);
    res.status(500).json({ error: 'Failed to delete warehouse' });
  }
});

// Locations
router.get('/:warehouseId/locations', authMiddleware, async (req: Request, res: Response) => {
  try {
    const locations = await dbAll(
      'SELECT * FROM warehouse_locations WHERE warehouse_id = ? ORDER BY code ASC',
      [req.params.warehouseId]
    );
    res.json({ data: locations });
  } catch (error) {
    console.error('Error fetching locations:', error);
    res.status(500).json({ error: 'Failed to fetch locations' });
  }
});

router.post('/:warehouseId/locations', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { code, location_code, description, rack, row, bin, capacity } = req.body;
    if (!location_code && !code) return res.status(400).json({ error: 'location_code is required' });

    const locCode = location_code || code;
    const result = await dbRun(`
      INSERT INTO warehouse_locations (warehouse_id, code, rack, row, bin, capacity, description) 
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [
      req.params.warehouseId, 
      locCode, 
      rack || null,
      row || null,
      bin || null,
      capacity || null,
      description || null
    ]);

    res.status(201).json({ message: 'Location created', data: { id: result.insertId, location_code: locCode } });
  } catch (error: any) {
    console.error('Error creating location:', error);
    if (error.message?.includes('UNIQUE')) return res.status(400).json({ error: 'Location code must be unique per warehouse' });
    res.status(500).json({ error: 'Failed to create location' });
  }
});

// GET /api/warehouses/:warehouseId/locations/:id
router.get('/:warehouseId/locations/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const location = await dbGet(`
      SELECT wl.* 
      FROM warehouse_locations wl
      WHERE wl.warehouse_id = ? AND wl.id = ?
    `, [req.params.warehouseId, req.params.id]);
    
    if (!location) {
      return res.status(404).json({ error: 'Location not found' });
    }
    
    res.json({ data: location });
  } catch (error) {
    console.error('Error fetching location:', error);
    res.status(500).json({ error: 'Failed to fetch location' });
  }
});

// PUT /api/warehouses/:warehouseId/locations/:id
router.put('/:warehouseId/locations/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { code, rack, row, bin, capacity, description } = req.body;

    await dbRun(`
      UPDATE warehouse_locations 
      SET code = ?, rack = ?, row = ?, bin = ?, 
          capacity = ?, description = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND warehouse_id = ?
    `, [
      code,
      rack || null,
      row || null,
      bin || null,
      capacity || null,
      description || null,
      req.params.id,
      req.params.warehouseId
    ]);

    res.json({ message: 'Location updated' });
  } catch (error) {
    console.error('Error updating location:', error);
    res.status(500).json({ error: 'Failed to update location' });
  }
});

// DELETE /api/warehouses/:warehouseId/locations/:id
router.delete('/:warehouseId/locations/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    await dbRun(`
      DELETE FROM warehouse_locations 
      WHERE id = ? AND warehouse_id = ?
    `, [req.params.id, req.params.warehouseId]);

    res.json({ message: 'Location deleted' });
  } catch (error) {
    console.error('Error deleting location:', error);
    res.status(500).json({ error: 'Failed to delete location' });
  }
});


// ============ FIFO/FEFO STOCK ALLOCATION ============

/**
 * GET /api/warehouses/allocate-stock
 * Allocate stock for a sales order or work order using FIFO (First In First Out) or FEFO (First Expired First Out)
 * Query params:
 * - product_id: Product to allocate
 * - quantity: Quantity needed
 * - method: 'FIFO' or 'FEFO' (default: FEFO for safety)
 * - warehouse_id: Optional, specific warehouse
 */

/**
 * GET /api/warehouses/:warehouseId/stock-health
 * Get inventory health dashboard for a warehouse
 */
router.get('/:warehouseId/stock-health', authMiddleware, async (req: Request, res: Response) => {
  try {

    // Get low stock items
    const lowStock = await dbAll(`
      SELECT p.id, p.sku, p.name, 
             SUM(i.quantity) as current_qty,
             0 as min_qty,
             0 as max_qty
      FROM inventory_stocks i
      JOIN products p ON i.product_id = p.id
      JOIN warehouse_locations wl ON i.warehouse_id = wl.warehouse_id
      WHERE wl.warehouse_id = ?
      GROUP BY p.id
      ORDER BY current_qty ASC
    `, [req.params.warehouseId]);

    // Get overstock items
    const overstock = await dbAll(`
      SELECT p.id, p.sku, p.name, 
             SUM(i.quantity) as current_qty,
             0 as max_qty
      FROM inventory_stocks i
      JOIN products p ON i.product_id = p.id
      JOIN warehouse_locations wl ON i.warehouse_id = wl.warehouse_id
      WHERE wl.warehouse_id = ?
      GROUP BY p.id
      ORDER BY current_qty DESC
    `, [req.params.warehouseId]);

    // Get expiring batches
    const expiring = await dbAll(`
      SELECT b.id, b.batch_number, b.exp_date, p.name as product_name,
             SUM(i.quantity) as quantity,
             DATEDIFF(b.exp_date, CURDATE()) as days_to_expiry
      FROM inventory_stocks i
      JOIN batches b ON i.batch_id = b.id
      JOIN products p ON b.product_id = p.id
      JOIN warehouse_locations wl ON i.warehouse_id = wl.warehouse_id
      WHERE wl.warehouse_id = ?
        AND b.exp_date IS NOT NULL
        AND b.status IN ('open', 'released')
        AND DATEDIFF(b.exp_date, CURDATE()) <= 30
        AND DATEDIFF(b.exp_date, CURDATE()) > 0
      GROUP BY b.id
      ORDER BY b.exp_date ASC
    `, [req.params.warehouseId]);

    // Get location utilization
    const utilization = await dbAll(`
      SELECT wl.id, wl.code as location_code, wl.rack, wl.row, wl.bin,
             wl.capacity,
             SUM(i.quantity) as current_qty,
             CASE 
               WHEN wl.capacity IS NULL THEN NULL
               ELSE ROUND(100.0 * SUM(i.quantity) / wl.capacity, 2)
             END as capacity_percent
      FROM warehouse_locations wl
      LEFT JOIN inventory_stocks i ON i.warehouse_id = wl.warehouse_id AND i.location_id = wl.id
      WHERE wl.warehouse_id = ?
      GROUP BY wl.id
      ORDER BY capacity_percent DESC
    `, [req.params.warehouseId]);

    res.json({
      data: {
        low_stock: lowStock,
        overstock: overstock,
        expiring_batches: expiring,
        location_utilization: utilization,
      },
    });
  } catch (error) {
    console.error('Error fetching warehouse stock health:', error);
    res.status(500).json({ error: 'Failed to fetch stock health' });
  }
});

export default router;
