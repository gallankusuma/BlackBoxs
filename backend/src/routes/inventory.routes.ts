import { Router, Request, Response } from 'express';
import { dbAll, dbGet, dbRun } from '../config/database';
import { authMiddleware } from '../middleware/auth';

const router = Router();

const generateCode = (prefix: string) => {
  const now = new Date();
  const datePart = now.toISOString().slice(0, 10).replace(/-/g, '');
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `${prefix}-${datePart}-${rand}`;
};

// ========================================
// NOTE: Specific routes are defined first.
// Generic inventory routes are declared later.
// ========================================

// ========================================
// STOCK TRANSFERS (Warehouse to Warehouse)
// ========================================

// GET /api/inventory/stock-transfers - List all stock transfers
router.get('/stock-transfers', authMiddleware, async (req: Request, res: Response) => {
  try {
    const transfers = await dbAll(`
      SELECT 
        sm.*,
        p.name as product_name,
        p.sku,
        wh_from.name as from_warehouse_name,
        wh_to.name as to_warehouse_name,
        u.full_name as created_by_name
      FROM stock_movements sm
      JOIN products p ON sm.product_id = p.id
      LEFT JOIN warehouses wh_from ON sm.from_warehouse_id = wh_from.id
      LEFT JOIN warehouses wh_to ON sm.to_warehouse_id = wh_to.id
      LEFT JOIN users u ON sm.created_by = u.id
      WHERE sm.movement_type = 'transfer'
      ORDER BY sm.moved_at DESC
    `, []);
    res.json({ data: transfers });
  } catch (error) {
    console.error('Error fetching stock transfers:', error);
    res.status(500).json({ error: 'Failed to fetch stock transfers' });
  }
});

// POST /api/inventory/stock-transfers - Create stock transfer
router.post('/stock-transfers', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { 
      product_id, 
      from_warehouse_id, 
      to_warehouse_id, 
      from_location_id,
      to_location_id,
      batch_id,
      quantity, 
      uom, 
      notes 
    } = req.body;
    const userId = (req as any).user?.userId;

    if (!product_id || !from_warehouse_id || !to_warehouse_id || !quantity) {
      return res.status(400).json({ error: 'product_id, from_warehouse_id, to_warehouse_id, and quantity are required' });
    }

    if (from_warehouse_id === to_warehouse_id) {
      return res.status(400).json({ error: 'Source and destination warehouses must be different' });
    }

    const reference_id = generateCode('TRF');

    const result = await dbRun(`
      INSERT INTO stock_movements (
        product_id, warehouse_id, location_id, batch_id,
        movement_type, transfer_type, quantity, uom,
        from_warehouse_id, to_warehouse_id, from_location_id, to_location_id,
        reference_type, reference_id, notes, created_by,
        approval_status
      ) VALUES (?, ?, ?, ?, 'transfer', 'warehouse_transfer', ?, ?, ?, ?, ?, ?, 'stock_transfer', ?, ?, ?, 0)
    `, [
      product_id,
      from_warehouse_id,
      from_location_id || null,
      batch_id || null,
      quantity,
      uom || null,
      from_warehouse_id,
      to_warehouse_id,
      from_location_id || null,
      to_location_id || null,
      reference_id,
      notes || null,
      userId || null
    ]);

    res.status(201).json({
      message: 'Stock transfer created successfully (Pending Approval)',
      data: { 
        id: result.insertId, 
        reference_id,
        approval_status: 0 
      }
    });
  } catch (error) {
    console.error('Error creating stock transfer:', error);
    res.status(500).json({ error: 'Failed to create stock transfer' });
  }
});

// PUT /api/inventory/stock-transfers/:id - Update stock transfer (only if approval_status = 0)
router.put('/stock-transfers/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { quantity, notes } = req.body;

    // Check current approval status
    const current = await dbGet('SELECT approval_status FROM stock_movements WHERE id = ?', [id]) as any;
    if (!current) {
      return res.status(404).json({ error: 'Stock transfer not found' });
    }

    if (current.approval_status !== 0) {
      return res.status(400).json({ error: 'Cannot edit approved stock transfer' });
    }

    await dbRun(`
      UPDATE stock_movements 
      SET quantity = ?, notes = ?
      WHERE id = ?
    `, [quantity, notes, id]);

    res.json({ message: 'Stock transfer updated successfully' });
  } catch (error) {
    console.error('Error updating stock transfer:', error);
    res.status(500).json({ error: 'Failed to update stock transfer' });
  }
});

// DELETE /api/inventory/stock-transfers/:id - Delete stock transfer (only if approval_status = 0)
router.delete('/stock-transfers/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const current = await dbGet('SELECT approval_status FROM stock_movements WHERE id = ?', [id]) as any;
    if (!current) {
      return res.status(404).json({ error: 'Stock transfer not found' });
    }

    if (current.approval_status !== 0) {
      return res.status(400).json({ error: 'Cannot delete approved stock transfer. Use reject instead.' });
    }

    await dbRun('DELETE FROM stock_movements WHERE id = ?', [id]);
    res.json({ message: 'Stock transfer deleted successfully' });
  } catch (error) {
    console.error('Error deleting stock transfer:', error);
    res.status(500).json({ error: 'Failed to delete stock transfer' });
  }
});

// POST /api/inventory/stock-transfers/:id/approve - Approve stock transfer
router.post('/stock-transfers/:id/approve', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = (req as any).user?.userId;
    const userLevel = (req as any).user?.userLevel || 1;

    console.log('🔍 Stock Transfer Approval:', { id, userId, userLevel });

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const transfer = await dbGet('SELECT * FROM stock_movements WHERE id = ?', [id]) as any;
    if (!transfer) {
      return res.status(404).json({ error: 'Stock transfer not found' });
    }

    const currentStatus = transfer.approval_status || 0;
    console.log('📊 Current Transfer Status:', { currentStatus, userLevel });

    // Director & Master (Level 4+) - DIRECT APPROVAL
    if (userLevel >= 4) {
      console.log('✅ Director/Master path - Direct full approval');
      const approverRow = await dbGet('SELECT id FROM users WHERE id = ?', [userId]) as { id: number } | undefined;
      const approverId = approverRow ? userId : null;

      await dbRun(
        'UPDATE stock_movements SET approval_status = 2, approved_by_supervisor_id = ?, approved_by_manager_id = ?, approved_at_supervisor = CURRENT_TIMESTAMP, approved_at_manager = CURRENT_TIMESTAMP WHERE id = ?',
        [approverId, approverId, id]
      );

      // Execute stock movement
      await executeStockTransfer(transfer);

      return res.json({ message: 'Stock transfer fully approved and executed by Director/Master', approval_status: 2 });
    }

    // Supervisor (Level 2)
    if (userLevel === 2 && currentStatus === 0) {
      console.log('✅ Supervisor approval path');
      await dbRun(
        'UPDATE stock_movements SET approval_status = 1, approved_by_supervisor_id = ?, approved_at_supervisor = CURRENT_TIMESTAMP WHERE id = ?',
        [userId, id]
      );
      return res.json({ message: 'Stock transfer approved by supervisor (1/2)', approval_status: 1 });
    }

    // Manager (Level 3)
    if (userLevel === 3 && currentStatus === 1) {
      console.log('✅ Manager approval path');
      await dbRun(
        'UPDATE stock_movements SET approval_status = 2, approved_by_manager_id = ?, approved_at_manager = CURRENT_TIMESTAMP WHERE id = ?',
        [userId, id]
      );

      // Execute stock movement
      await executeStockTransfer(transfer);

      return res.json({ message: 'Stock transfer fully approved and executed by manager (2/2)', approval_status: 2 });
    }

    return res.status(403).json({ error: 'Not authorized to approve at this level' });
  } catch (error) {
    console.error('Error approving stock transfer:', error);
    res.status(500).json({ error: 'Failed to approve stock transfer' });
  }
});

// POST /api/inventory/stock-transfers/:id/reject - Reject/Reset stock transfer
router.post('/stock-transfers/:id/reject', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userLevel = (req as any).user?.userLevel || 1;

    const transfer = await dbGet('SELECT approval_status FROM stock_movements WHERE id = ?', [id]) as any;
    if (!transfer) {
      return res.status(404).json({ error: 'Stock transfer not found' });
    }

    const currentStatus = transfer.approval_status || 0;

    // Only Level 2+ can reject, and only if status > 0
    if (userLevel < 2 || currentStatus === 0) {
      return res.status(403).json({ error: 'Not authorized to reject' });
    }

    // Level 4+ can reject from any state, Level 2-3 only from state 1
    if (userLevel < 4 && currentStatus !== 1) {
      return res.status(403).json({ error: 'Not authorized to reject at this level' });
    }

    await dbRun(
      'UPDATE stock_movements SET approval_status = 0, approved_by_supervisor_id = NULL, approved_by_manager_id = NULL, approved_at_supervisor = NULL, approved_at_manager = NULL WHERE id = ?',
      [id]
    );

    res.json({ message: 'Stock transfer reset to pending (0/2)', approval_status: 0 });
  } catch (error) {
    console.error('Error rejecting stock transfer:', error);
    res.status(500).json({ error: 'Failed to reject stock transfer' });
  }
});

// Helper function to execute stock transfer (deduct from source, add to destination)
async function executeStockTransfer(transfer: any) {
  try {
    console.log('🚚 Executing stock transfer:', transfer);

    // Deduct from source warehouse inventory
    const sourceInv = await dbGet(`
      SELECT * FROM inventory 
      WHERE product_id = ? AND warehouse_id = ?
    `, [transfer.product_id, transfer.from_warehouse_id]) as any;

    if (sourceInv) {
      const newQty = (sourceInv.quantity || 0) - transfer.quantity;
      await dbRun(`
        UPDATE inventory 
        SET quantity = ?, updated_at = CURRENT_TIMESTAMP 
        WHERE id = ?
      `, [newQty, sourceInv.id]);
      console.log(`✅ Deducted ${transfer.quantity} from source warehouse`);
    } else {
      console.warn('⚠️ Source inventory record not found, skipping deduction');
    }

    // Add to destination warehouse inventory
    const destInv = await dbGet(`
      SELECT * FROM inventory 
      WHERE product_id = ? AND warehouse_id = ?
    `, [transfer.product_id, transfer.to_warehouse_id]) as any;

    if (destInv) {
      const newQty = (destInv.quantity || 0) + transfer.quantity;
      await dbRun(`
        UPDATE inventory 
        SET quantity = ?, updated_at = CURRENT_TIMESTAMP 
        WHERE id = ?
      `, [newQty, destInv.id]);
      console.log(`✅ Added ${transfer.quantity} to destination warehouse`);
    } else {
      // Create new inventory record if doesn't exist
      await dbRun(`
        INSERT INTO inventory (product_id, warehouse_id, quantity)
        VALUES (?, ?, ?)
      `, [transfer.product_id, transfer.to_warehouse_id, transfer.quantity]);
      console.log(`✅ Created new inventory record at destination`);
    }

    console.log('✅ Stock transfer execution completed');
  } catch (error) {
    console.error('❌ Error executing stock transfer:', error);
    throw error;
  }
}

// ========================================
// STOCK ADJUSTMENTS (Manual Corrections)
// ========================================

// GET /api/inventory/stock-adjustments - List all stock adjustments
router.get('/stock-adjustments', authMiddleware, async (req: Request, res: Response) => {
  try {
    const adjustments = await dbAll(`
      SELECT 
        sm.*,
        p.name as product_name,
        p.sku,
        wh.name as warehouse_name,
        u.full_name as created_by_name
      FROM stock_movements sm
      JOIN products p ON sm.product_id = p.id
      LEFT JOIN warehouses wh ON sm.warehouse_id = wh.id
      LEFT JOIN users u ON sm.created_by = u.id
      WHERE sm.movement_type = 'adjustment'
      ORDER BY sm.moved_at DESC
    `, []);
    res.json({ data: adjustments });
  } catch (error) {
    console.error('Error fetching stock adjustments:', error);
    res.status(500).json({ error: 'Failed to fetch stock adjustments' });
  }
});

// POST /api/inventory/stock-adjustments - Create stock adjustment
router.post('/stock-adjustments', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { 
      product_id, 
      warehouse_id, 
      location_id,
      batch_id,
      quantity, // Can be positive or negative
      uom,
      reason,
      notes 
    } = req.body;
    const userId = (req as any).user?.userId;

    if (!product_id || !warehouse_id || quantity === undefined || quantity === null) {
      return res.status(400).json({ error: 'product_id, warehouse_id, and quantity are required' });
    }

    const reference_id = generateCode('ADJ');
    const adjustmentType = quantity >= 0 ? 'increase' : 'decrease';

    const result = await dbRun(`
      INSERT INTO stock_movements (
        product_id, warehouse_id, location_id, batch_id,
        movement_type, transfer_type, quantity, uom,
        reference_type, reference_id, notes, created_by,
        approval_status
      ) VALUES (?, ?, ?, ?, 'adjustment', ?, ?, ?, 'stock_adjustment', ?, ?, ?, 0)
    `, [
      product_id,
      warehouse_id,
      location_id || null,
      batch_id || null,
      adjustmentType,
      quantity,
      uom || null,
      reference_id,
      reason ? `${reason} - ${notes || ''}` : notes || null,
      userId || null
    ]);

    res.status(201).json({
      message: 'Stock adjustment created successfully (Pending Approval)',
      data: { 
        id: result.insertId, 
        reference_id,
        approval_status: 0 
      }
    });
  } catch (error) {
    console.error('Error creating stock adjustment:', error);
    res.status(500).json({ error: 'Failed to create stock adjustment' });
  }
});

// DELETE /api/inventory/stock-adjustments/:id - Delete stock adjustment
router.delete('/stock-adjustments/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const current = await dbGet('SELECT approval_status FROM stock_movements WHERE id = ?', [id]) as any;
    if (!current) {
      return res.status(404).json({ error: 'Stock adjustment not found' });
    }

    if (current.approval_status !== 0) {
      return res.status(400).json({ error: 'Cannot delete approved stock adjustment. Use reject instead.' });
    }

    await dbRun('DELETE FROM stock_movements WHERE id = ?', [id]);
    res.json({ message: 'Stock adjustment deleted successfully' });
  } catch (error) {
    console.error('Error deleting stock adjustment:', error);
    res.status(500).json({ error: 'Failed to delete stock adjustment' });
  }
});

// POST /api/inventory/stock-adjustments/:id/approve - Approve stock adjustment
router.post('/stock-adjustments/:id/approve', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = (req as any).user?.userId;
    const userLevel = (req as any).user?.userLevel || 1;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const adjustment = await dbGet('SELECT * FROM stock_movements WHERE id = ?', [id]) as any;
    if (!adjustment) {
      return res.status(404).json({ error: 'Stock adjustment not found' });
    }

    const currentStatus = adjustment.approval_status || 0;

    // Director & Master (Level 4+) - DIRECT APPROVAL
    if (userLevel >= 4) {
      const approverRow = await dbGet('SELECT id FROM users WHERE id = ?', [userId]) as { id: number } | undefined;
      const approverId = approverRow ? userId : null;

      await dbRun(
        'UPDATE stock_movements SET approval_status = 2, approved_by_supervisor_id = ?, approved_by_manager_id = ?, approved_at_supervisor = CURRENT_TIMESTAMP, approved_at_manager = CURRENT_TIMESTAMP WHERE id = ?',
        [approverId, approverId, id]
      );

      await executeStockAdjustment(adjustment);

      return res.json({ message: 'Stock adjustment fully approved and executed', approval_status: 2 });
    }

    // Supervisor (Level 2)
    if (userLevel === 2 && currentStatus === 0) {
      await dbRun(
        'UPDATE stock_movements SET approval_status = 1, approved_by_supervisor_id = ?, approved_at_supervisor = CURRENT_TIMESTAMP WHERE id = ?',
        [userId, id]
      );
      return res.json({ message: 'Stock adjustment approved by supervisor (1/2)', approval_status: 1 });
    }

    // Manager (Level 3)
    if (userLevel === 3 && currentStatus === 1) {
      await dbRun(
        'UPDATE stock_movements SET approval_status = 2, approved_by_manager_id = ?, approved_at_manager = CURRENT_TIMESTAMP WHERE id = ?',
        [userId, id]
      );

      await executeStockAdjustment(adjustment);

      return res.json({ message: 'Stock adjustment fully approved and executed (2/2)', approval_status: 2 });
    }

    return res.status(403).json({ error: 'Not authorized to approve at this level' });
  } catch (error) {
    console.error('Error approving stock adjustment:', error);
    res.status(500).json({ error: 'Failed to approve stock adjustment' });
  }
});

// POST /api/inventory/stock-adjustments/:id/reject - Reject stock adjustment
router.post('/stock-adjustments/:id/reject', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userLevel = (req as any).user?.userLevel || 1;

    const adjustment = await dbGet('SELECT approval_status FROM stock_movements WHERE id = ?', [id]) as any;
    if (!adjustment) {
      return res.status(404).json({ error: 'Stock adjustment not found' });
    }

    const currentStatus = adjustment.approval_status || 0;

    if (userLevel < 2 || currentStatus === 0) {
      return res.status(403).json({ error: 'Not authorized to reject' });
    }

    if (userLevel < 4 && currentStatus !== 1) {
      return res.status(403).json({ error: 'Not authorized to reject at this level' });
    }

    await dbRun(
      'UPDATE stock_movements SET approval_status = 0, approved_by_supervisor_id = NULL, approved_by_manager_id = NULL, approved_at_supervisor = NULL, approved_at_manager = NULL WHERE id = ?',
      [id]
    );

    res.json({ message: 'Stock adjustment reset to pending (0/2)', approval_status: 0 });
  } catch (error) {
    console.error('Error rejecting stock adjustment:', error);
    res.status(500).json({ error: 'Failed to reject stock adjustment' });
  }
});

// ========================================
// GENERIC INVENTORY ROUTES (AFTER stock-* routes)
// ========================================

// GET /api/inventory - List all inventory
router.get('/', authMiddleware, async (_req: Request, res: Response) => {
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
router.get('/:id', authMiddleware, async (req: Request, res: Response) => {
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
router.post('/', authMiddleware, async (req: Request, res: Response) => {
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
router.put('/:id', authMiddleware, async (req: Request, res: Response) => {
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
router.post('/:id/transaction', authMiddleware, async (req: Request, res: Response) => {
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
router.get('/transactions/:productId', authMiddleware, async (req: Request, res: Response) => {
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
        sm.moved_at AS transaction_date
      FROM stock_movements sm
      WHERE sm.product_id = ?
      ORDER BY sm.moved_at DESC
    `, [productId]);
    res.json({ data: rows });
  } catch (error) {
    console.error('Error fetching inventory transactions:', error);
    res.status(500).json({ error: 'Failed to fetch inventory transactions' });
  }
});

// Helper function to execute stock adjustment
async function executeStockAdjustment(adjustment: any) {
  try {
    console.log('📊 Executing stock adjustment:', adjustment);

    const inv = await dbGet(`
      SELECT * FROM inventory_stocks 
      WHERE product_id = ? AND warehouse_id = ?
    `, [adjustment.product_id, adjustment.warehouse_id]) as any;

    if (inv) {
      const newQty = (inv.quantity || 0) + adjustment.quantity; // quantity can be negative
      await dbRun(`
        UPDATE inventory_stocks 
        SET quantity = ?, last_updated = CURRENT_TIMESTAMP 
        WHERE id = ?
      `, [newQty, inv.id]);
      console.log(`✅ Adjusted inventory by ${adjustment.quantity} (new qty: ${newQty})`);
    } else {
      // Create new inventory record if positive adjustment
      if (adjustment.quantity > 0) {
        await dbRun(`
          INSERT INTO inventory_stocks (product_id, warehouse_id, quantity, last_updated)
          VALUES (?, ?, ?, CURRENT_TIMESTAMP)
        `, [adjustment.product_id, adjustment.warehouse_id, adjustment.quantity]);
        console.log(`✅ Created new inventory record with quantity ${adjustment.quantity}`);
      }
    }

    console.log('✅ Stock adjustment execution completed');
  } catch (error) {
    console.error('❌ Error executing stock adjustment:', error);
    throw error;
  }
}

export default router;
