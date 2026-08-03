import { Router, Request, Response } from 'express';
import { dbAll, dbGet, dbRun } from '../config/database';
import { authMiddleware } from '../middleware/auth';

const router = Router();

// GET /api/workorders
router.get('/', authMiddleware, async (_req: Request, res: Response) => {
  try {
    const workOrders = await dbAll(
      `SELECT w.*, p.name as product_name, p.sku 
       FROM work_orders w 
       JOIN products p ON w.product_id = p.id 
       ORDER BY w.created_at DESC`
    );
    res.json({ data: workOrders });
  } catch (error) {
    console.error('Error fetching work orders:', error);
    res.status(500).json({ error: 'Failed to fetch work orders' });
  }
});

// GET /api/workorders/:id
router.get('/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const workOrder = await dbGet(
      `SELECT w.*, p.name as product_name, p.sku 
       FROM work_orders w 
       JOIN products p ON w.product_id = p.id 
       WHERE w.id = ? `,
      [req.params.id]
    );

    if (!workOrder) {
      return res.status(404).json({ error: 'Work order not found' });
    }

    res.json({ data: workOrder });
  } catch (error) {
    console.error('Error fetching work order:', error);
    res.status(500).json({ error: 'Failed to fetch work order' });
  }
});

// POST /api/workorders
router.post('/', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { product_id, quantity, status, priority, scheduled_start, scheduled_end } = req.body;

    if (!product_id || !quantity) {
      return res.status(400).json({ error: 'product_id and quantity are required' });
    }

    const result = await dbRun(
      `INSERT INTO work_orders(product_id, quantity, status, priority, scheduled_start, scheduled_end) 
       VALUES(?, ?, ?, ?, ?, ?)`,
      [product_id, quantity, status || 'pending', priority || 'normal', scheduled_start || null, scheduled_end || null]
    );

    res.status(201).json({
      message: 'Work order created successfully',
      data: { id: result.insertId, product_id, quantity, status, priority },
    });
  } catch (error) {
    console.error('Error creating work order:', error);
    res.status(500).json({ error: 'Failed to create work order' });
  }
});

// PUT /api/workorders/:id
router.put('/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { quantity, status, priority, scheduled_start, scheduled_end, actual_start, actual_end } = req.body;

    await dbRun(
      `UPDATE work_orders 
       SET quantity = ?, status = ?, priority = ?, scheduled_start = ?, scheduled_end = ?, actual_start = ?, actual_end = ?, updated_at = CURRENT_TIMESTAMP 
       WHERE id = ?`,
      [quantity, status, priority, scheduled_start, scheduled_end, actual_start, actual_end, req.params.id]
    );

    res.json({ message: 'Work order updated successfully' });
  } catch (error) {
    console.error('Error updating work order:', error);
    res.status(500).json({ error: 'Failed to update work order' });
  }
});

// DELETE /api/workorders/:id
router.delete('/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    await dbRun('DELETE FROM work_orders WHERE id = ?', [req.params.id]);

    res.json({ message: 'Work order deleted successfully' });
  } catch (error) {
    console.error('Error deleting work order:', error);
    res.status(500).json({ error: 'Failed to delete work order' });
  }
});

export default router;
