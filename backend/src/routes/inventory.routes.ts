import { Router, Request, Response } from 'express';
import { dbAll, dbGet, dbRun } from '../config/database';
import { authMiddleware } from '../middleware/auth';
import { requirePermission } from '../middleware/permission';

const router = Router();

// CABUT-STOCK-01 (2 September 2026): endpoint Stock Transfer dan Stock
// Adjustment DICABUT atas keputusan pemilik.
//
// Keduanya tidak pernah bisa bekerja. Tabel yang mereka baca dan tulis --
// `stock_transfers`, `stock_adjustments`, dan `inventory` -- tidak ada di mana
// pun: bukan di schema-baseline.sql, bukan di ensure*Schema, bukan di database
// lokal maupun produksi. Diverifikasi: membuat transfer maupun adjustment
// membalas 500 bahkan untuk master, dan menyetujuinya membalas 404/500.
//
// Yang TETAP ADA di berkas ini adalah jalur inventory yang benar-benar dipakai
// dan membaca `inventory_stocks` -- tabel yang memang ada.

// ========================================
// GENERIC INVENTORY ROUTES (AFTER stock-* routes)
// ========================================

// GET /api/inventory - List all inventory
router.get('/', authMiddleware, requirePermission('master-data.warehouses.view', 'reports.inventory-reports.view'), async (_req: Request, res: Response) => {
  try {
    const inventory = await dbAll(
      `SELECT i.id,
              i.product_id,
              p.name as product_name,
              p.sku,
              i.quantity as quantity_on_hand,
              0 as quantity_reserved,
              i.quantity as quantity_available,
              w.name as location,
              i.last_updated as created_at
       FROM inventory_stocks i
       JOIN products p ON i.product_id = p.id
       JOIN warehouses w ON i.warehouse_id = w.id
       ORDER BY p.name ASC`,
      []
    );
    res.json({ data: inventory });
  } catch (error) {
    console.error('Error fetching inventory:', error);
    res.status(500).json({ error: 'Failed to fetch inventory' });
  }
});

// GET /api/inventory/:id - Get single inventory item
router.get('/:id', authMiddleware, requirePermission('master-data.warehouses.view', 'reports.inventory-reports.view'), async (req: Request, res: Response) => {
  try {
    const item = await dbGet(`
      SELECT i.*, p.name as product_name, p.sku 
      FROM inventory_stocks i 
      JOIN products p ON i.product_id = p.id 
      WHERE i.id = ?
    `, [req.params.id]);
    
    if (!item) {
      return res.status(404).json({ error: 'Inventory item not found' });
    }
    
    res.json({ data: item });
  } catch (error) {
    console.error('Error fetching inventory item:', error);
    res.status(500).json({ error: 'Failed to fetch inventory item' });
  }
});

// POST /api/inventory - Create inventory entry
router.post('/', authMiddleware, requirePermission('master-data.warehouses.create', 'reports.inventory-reports.create'), async (req: Request, res: Response) => {
  try {
    const { product_id, warehouse_id, quantity } = req.body;

    if (!product_id || !warehouse_id) {
      return res.status(400).json({ error: 'product_id and warehouse_id are required' });
    }

    // Check if inventory already exists for this product/warehouse combo
    const existing = await dbGet(
      'SELECT * FROM inventory_stocks WHERE product_id = ? AND warehouse_id = ?',
      [product_id, warehouse_id]
    );
    if (existing) {
      return res.status(400).json({ error: 'Inventory already exists for this product-warehouse combination' });
    }

    const result = await dbRun(`
      INSERT INTO inventory_stocks (product_id, warehouse_id, quantity, last_updated) 
      VALUES (?, ?, ?, CURRENT_TIMESTAMP)
    `, [product_id, warehouse_id, quantity || 0]);

    res.status(201).json({
      message: 'Inventory created successfully',
      data: { id: result.insertId, product_id, warehouse_id, quantity: quantity || 0 },
    });
  } catch (error) {
    console.error('Error creating inventory:', error);
    res.status(500).json({ error: 'Failed to create inventory' });
  }
});

// PUT /api/inventory/:id - Update inventory
router.put('/:id', authMiddleware, requirePermission('master-data.warehouses.edit', 'reports.inventory-reports.edit'), async (req: Request, res: Response) => {
  try {
    const { quantity } = req.body;

    await dbRun(`
      UPDATE inventory_stocks 
      SET quantity = ?, last_updated = CURRENT_TIMESTAMP 
      WHERE id = ?
    `, [quantity, req.params.id]);

    res.json({ message: 'Inventory updated successfully' });
  } catch (error) {
    console.error('Error updating inventory:', error);
    res.status(500).json({ error: 'Failed to update inventory' });
  }
});

// POST /api/inventory/:id/transaction - Record inventory transaction
router.post('/:id/transaction', authMiddleware, requirePermission('master-data.warehouses.edit', 'reports.inventory-reports.edit'), async (req: Request, res: Response) => {
  try {
    const { transaction_type, quantity, reference_type, reference_id, notes } = req.body;

    if (!transaction_type || !quantity) {
      return res.status(400).json({ error: 'transaction_type and quantity are required' });
    }

    const result = await dbRun(`
      INSERT INTO stock_movements (product_id, warehouse_id, movement_type, quantity, reference_type, reference_id, notes, created_by) 
      SELECT product_id, warehouse_id, ?, ?, ?, ?, ?, NULL FROM inventory_stocks WHERE id = ?
    `, [transaction_type, quantity, reference_type || null, reference_id || null, notes || null, req.params.id]);

    res.status(201).json({
      message: 'Transaction recorded successfully',
      data: { id: result.insertId },
    });
  } catch (error) {
    console.error('Error recording transaction:', error);
    res.status(500).json({ error: 'Failed to record transaction' });
  }
});

// GET /api/inventory/transactions/:productId - List transactions by product
router.get('/transactions/:productId', authMiddleware, requirePermission('master-data.warehouses.view', 'reports.inventory-reports.view'), async (req: Request, res: Response) => {
  try {
    const productId = Number(req.params.productId);
    if (!productId) {
      return res.status(400).json({ error: 'Invalid productId' });
    }

    const rows = await dbAll(`
      SELECT 
        sm.id,
        sm.product_id,
        sm.warehouse_id,
        sm.movement_type as transaction_type,
        sm.quantity,
        sm.reference_type,
        sm.reference_id,
        sm.notes,
        sm.created_at AS transaction_date
      FROM stock_movements sm
      WHERE sm.product_id = ?
      ORDER BY sm.created_at DESC
    `, [productId]);
    res.json({ data: rows });
  } catch (error) {
    console.error('Error fetching inventory transactions:', error);
    res.status(500).json({ error: 'Failed to fetch inventory transactions' });
  }
});


export default router;
