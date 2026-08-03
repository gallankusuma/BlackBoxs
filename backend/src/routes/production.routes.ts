import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth';
import { dbAll, dbGet, dbRun } from '../config/database';

const router = Router();

// ============================================================
// Production Events
// ============================================================
router.get('/events', authMiddleware, async (_req: Request, res: Response) => {
  try {
    const events = await dbAll(
      `SELECT id, type, title, description, event_date, event_time, location, created_at
       FROM production_events ORDER BY event_date ASC, event_time ASC`
    );
    res.json(events);
  } catch (error) {
    console.error('Error fetching production events:', error);
    res.status(500).json({ error: 'Failed to fetch events' });
  }
});

router.get('/events/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const event = await dbGet(
      `SELECT id, type, title, description, event_date, event_time, location, created_at
       FROM production_events WHERE id = ?`, [req.params.id]
    );
    if (!event) return res.status(404).json({ error: 'Event not found' });
    res.json(event);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch event' });
  }
});

router.post('/events', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { type, title, description, event_date, event_time, location } = req.body;
    if (!type || !title || !event_date) {
      return res.status(400).json({ error: 'type, title, and event_date are required' });
    }
    const result = await dbRun(
      `INSERT INTO production_events (type, title, description, event_date, event_time, location) VALUES (?, ?, ?, ?, ?, ?)`,
      [type, title, description || null, event_date, event_time || null, location || null]
    );
    res.status(201).json({ message: 'Event created', id: result.insertId });
  } catch (error) {
    res.status(500).json({ error: 'Failed to create event' });
  }
});

router.put('/events/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { type, title, description, event_date, event_time, location } = req.body;
    await dbRun(
      `UPDATE production_events SET type=?, title=?, description=?, event_date=?, event_time=?, location=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`,
      [type, title, description || null, event_date, event_time || null, location || null, req.params.id]
    );
    res.json({ message: 'Event updated' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update event' });
  }
});

router.delete('/events/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    await dbRun('DELETE FROM production_events WHERE id = ?', [req.params.id]);
    res.json({ message: 'Event deleted' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete event' });
  }
});

// ============================================================
// Production Tasks
// ============================================================
router.get('/tasks', authMiddleware, async (_req: Request, res: Response) => {
  try {
    const tasks = await dbAll(
      `SELECT t.id, t.task_name, t.priority, t.due_date, t.status, t.description,
              w.wo_number, COALESCE(u.full_name, u.username) AS assigned_to
       FROM production_tasks t
       LEFT JOIN work_orders w ON t.wo_id = w.id
       LEFT JOIN users u ON t.assigned_to_user_id = u.id
       ORDER BY t.created_at DESC`
    );
    res.json(tasks);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch tasks' });
  }
});

router.post('/tasks', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { task_name, wo_id, assigned_to_user_id, priority, due_date, status, description } = req.body;
    if (!task_name) return res.status(400).json({ error: 'task_name is required' });
    const result = await dbRun(
      `INSERT INTO production_tasks (task_name, wo_id, assigned_to_user_id, priority, due_date, status, description) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [task_name, wo_id || null, assigned_to_user_id || null, priority || 'medium', due_date || null, status || 'pending', description || null]
    );
    res.status(201).json({ message: 'Task created', id: result.insertId });
  } catch (error) {
    res.status(500).json({ error: 'Failed to create task' });
  }
});

router.put('/tasks/:id/status', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { status } = req.body;
    if (!status) return res.status(400).json({ error: 'status is required' });
    await dbRun('UPDATE production_tasks SET status=?, updated_at=CURRENT_TIMESTAMP WHERE id=?', [status, req.params.id]);
    res.json({ message: 'Task status updated' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update task status' });
  }
});

// ============================================================
// Production Planning — schedule & capacity
// ============================================================
router.get('/planning', authMiddleware, async (_req: Request, res: Response) => {
  try {
    const workOrders = await dbAll(
      `SELECT w.id, w.wo_number, w.quantity, w.status, w.scheduled_start, w.scheduled_end,
              w.actual_start, w.actual_end, w.notes, w.created_at,
              p.name AS product_name, p.sku,
              COALESCE(u.full_name, u.username) AS created_by_name
       FROM work_orders w
       LEFT JOIN products p ON w.product_id = p.id
       LEFT JOIN users u ON w.created_by = u.id
       ORDER BY w.scheduled_start ASC`
    );
    res.json({ success: true, data: workOrders });
  } catch (error) {
    console.error('Error fetching production planning:', error);
    res.status(500).json({ error: 'Failed to fetch production planning' });
  }
});

router.get('/planning/summary', authMiddleware, async (_req: Request, res: Response) => {
  try {
    const summary = await dbAll(
      `SELECT status, COUNT(*) as count, SUM(quantity) as total_qty
       FROM work_orders GROUP BY status`
    );
    const capacity = await dbGet(
      `SELECT COUNT(*) as total_wo,
              SUM(CASE WHEN status='in_progress' OR status='in-progress' THEN 1 ELSE 0 END) as active_wo,
              SUM(CASE WHEN status='completed' THEN quantity ELSE 0 END) as completed_qty,
              SUM(CASE WHEN status='pending' OR status='planned' THEN quantity ELSE 0 END) as pending_qty
       FROM work_orders`
    );
    res.json({ success: true, data: { summary, capacity } });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch planning summary' });
  }
});

// ============================================================
// MRP — Material Requirement Planning
// ============================================================
router.get('/mrp', authMiddleware, async (_req: Request, res: Response) => {
  try {
    // Get all pending/planned WOs and explode BOM to find material requirements
    const requirements = await dbAll(
      `SELECT w.id AS wo_id, w.wo_number, w.quantity AS wo_qty, w.status AS wo_status,
              w.scheduled_start,
              p.name AS product_name, p.sku,
              bd.raw_material_id, rm.name AS material_name, rm.sku AS material_sku,
              bd.quantity AS bom_qty_per_unit,
              (bd.quantity * w.quantity) AS total_required,
              COALESCE(inv.quantity, 0) AS stock_available,
              GREATEST((bd.quantity * w.quantity) - COALESCE(inv.quantity, 0), 0) AS shortage
       FROM work_orders w
       JOIN products p ON w.product_id = p.id
       JOIN bom_headers bh ON bh.product_id = p.id AND bh.status = 'approved'
       JOIN bom_details bd ON bd.bom_header_id = bh.id
       JOIN products rm ON rm.id = bd.raw_material_id
       LEFT JOIN inventory_stocks inv ON inv.product_id = bd.raw_material_id
       WHERE w.status IN ('pending', 'planned', 'in_progress', 'in-progress')
       ORDER BY w.scheduled_start ASC, rm.name ASC`
    );
    res.json({ success: true, data: requirements });
  } catch (error) {
    console.error('Error fetching MRP data:', error);
    res.status(500).json({ error: 'Failed to calculate MRP' });
  }
});

router.get('/mrp/shortage', authMiddleware, async (_req: Request, res: Response) => {
  try {
    const shortages = await dbAll(
      `SELECT rm.id AS product_id, rm.name AS material_name, rm.sku AS material_sku,
              SUM(bd.quantity * w.quantity) AS total_required,
              COALESCE(MAX(inv.quantity), 0) AS stock_available,
              GREATEST(SUM(bd.quantity * w.quantity) - COALESCE(MAX(inv.quantity), 0), 0) AS shortage
       FROM work_orders w
       JOIN bom_headers bh ON bh.product_id = w.product_id AND bh.status = 'approved'
       JOIN bom_details bd ON bd.bom_header_id = bh.id
       JOIN products rm ON rm.id = bd.raw_material_id
       LEFT JOIN inventory_stocks inv ON inv.product_id = bd.raw_material_id
       WHERE w.status IN ('pending', 'planned', 'in_progress', 'in-progress')
       GROUP BY rm.id, rm.name, rm.sku
       HAVING shortage > 0
       ORDER BY shortage DESC`
    );
    res.json({ success: true, data: shortages });
  } catch (error) {
    res.status(500).json({ error: 'Failed to calculate shortages' });
  }
});

// ============================================================
// Issue Material — pick materials from warehouse for WO
// ============================================================
router.get('/issue-material', authMiddleware, async (_req: Request, res: Response) => {
  try {
    const materials = await dbAll(
      `SELECT wm.id, wm.wo_id, w.wo_number,
              p.name AS material_name, p.sku AS material_sku,
              wm.quantity_required, wm.quantity_issued,
              (wm.quantity_required - COALESCE(wm.quantity_issued, 0)) AS pending_qty,
              wm.batch_number, wm.issued_at,
              COALESCE(u.full_name, u.username) AS issued_by_name,
              wh.name AS warehouse_name
       FROM wo_materials wm
       JOIN work_orders w ON w.id = wm.wo_id
       JOIN products p ON p.id = wm.product_id
       LEFT JOIN users u ON u.id = wm.issued_by
       LEFT JOIN warehouses wh ON wh.id = wm.warehouse_id
       WHERE w.status IN ('pending', 'planned', 'in_progress', 'in-progress')
       ORDER BY w.wo_number ASC, p.name ASC`
    );
    res.json({ success: true, data: materials });
  } catch (error) {
    console.error('Error fetching material issues:', error);
    res.status(500).json({ error: 'Failed to fetch material issues' });
  }
});

router.get('/issue-material/wo/:woId', authMiddleware, async (req: Request, res: Response) => {
  try {
    const materials = await dbAll(
      `SELECT wm.id, wm.product_id, p.name AS material_name, p.sku AS material_sku,
              wm.quantity_required, wm.quantity_issued,
              (wm.quantity_required - COALESCE(wm.quantity_issued, 0)) AS pending_qty,
              wm.batch_number, wm.warehouse_id, wh.name AS warehouse_name,
              COALESCE(inv.quantity, 0) AS stock_available
       FROM wo_materials wm
       JOIN products p ON p.id = wm.product_id
       LEFT JOIN warehouses wh ON wh.id = wm.warehouse_id
       LEFT JOIN inventory_stocks inv ON inv.product_id = wm.product_id AND inv.warehouse_id = wm.warehouse_id
       WHERE wm.wo_id = ?
       ORDER BY p.name ASC`,
      [req.params.woId]
    );
    res.json({ success: true, data: materials });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch WO materials' });
  }
});

router.post('/issue-material', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { wo_material_id, quantity, warehouse_id, batch_number } = req.body;
    if (!wo_material_id || !quantity) {
      return res.status(400).json({ error: 'wo_material_id and quantity are required' });
    }

    const mat = await dbGet('SELECT * FROM wo_materials WHERE id = ?', [wo_material_id]);
    if (!mat) return res.status(404).json({ error: 'WO material not found' });

    const newIssued = (mat.quantity_issued || 0) + quantity;
    if (newIssued > mat.quantity_required) {
      return res.status(400).json({ error: 'Issue quantity exceeds required quantity' });
    }

    const userId = (req as any).user?.userId;
    await dbRun(
      `UPDATE wo_materials SET quantity_issued=?, warehouse_id=?, batch_number=?, issued_at=CURRENT_TIMESTAMP, issued_by=? WHERE id=?`,
      [newIssued, warehouse_id || mat.warehouse_id, batch_number || null, userId, wo_material_id]
    );

    // Record stock movement
    await dbRun(
      `INSERT INTO stock_movements (warehouse_id, product_id, batch_number, movement_type, quantity, reference_type, reference_id, notes, created_by)
       VALUES (?, ?, ?, 'out', ?, 'work_order', ?, 'Material issued to WO', ?)`,
      [warehouse_id || mat.warehouse_id, mat.product_id, batch_number || null, quantity, mat.wo_id, userId]
    );

    // Reduce inventory stock
    await dbRun(
      `UPDATE inventory_stocks SET quantity = quantity - ?, last_updated = CURRENT_TIMESTAMP
       WHERE product_id = ? AND warehouse_id = ?`,
      [quantity, mat.product_id, warehouse_id || mat.warehouse_id]
    );

    res.json({ success: true, message: 'Material issued successfully' });
  } catch (error) {
    console.error('Error issuing material:', error);
    res.status(500).json({ error: 'Failed to issue material' });
  }
});

// Auto-generate WO material list from BOM
router.post('/issue-material/generate/:woId', authMiddleware, async (req: Request, res: Response) => {
  try {
    const wo = await dbGet('SELECT * FROM work_orders WHERE id = ?', [req.params.woId]);
    if (!wo) return res.status(404).json({ error: 'Work order not found' });

    const bom = await dbGet(
      `SELECT bh.id FROM bom_headers bh WHERE bh.product_id = ? AND bh.status = 'approved' ORDER BY bh.version DESC LIMIT 1`,
      [wo.product_id]
    );
    if (!bom) return res.status(404).json({ error: 'No approved BOM found for this product' });

    const bomDetails = await dbAll('SELECT * FROM bom_details WHERE bom_header_id = ?', [bom.id]);

    for (const item of bomDetails) {
      const exists = await dbGet('SELECT id FROM wo_materials WHERE wo_id = ? AND product_id = ?', [wo.id, item.raw_material_id]);
      if (!exists) {
        await dbRun(
          `INSERT INTO wo_materials (wo_id, product_id, quantity_required, quantity_issued) VALUES (?, ?, ?, 0)`,
          [wo.id, item.raw_material_id, item.quantity * wo.quantity]
        );
      }
    }

    res.json({ success: true, message: 'WO materials generated from BOM' });
  } catch (error) {
    console.error('Error generating WO materials:', error);
    res.status(500).json({ error: 'Failed to generate WO materials' });
  }
});

// ============================================================
// Production Execution — real-time WO tracking & process logging
// ============================================================
router.get('/execution', authMiddleware, async (_req: Request, res: Response) => {
  try {
    const active = await dbAll(
      `SELECT w.id, w.wo_number, w.quantity, w.status,
              w.scheduled_start, w.scheduled_end, w.actual_start, w.actual_end,
              p.name AS product_name, p.sku,
              (SELECT COUNT(*) FROM wo_process_logs wpl WHERE wpl.wo_id = w.id) AS process_count,
              (SELECT COUNT(*) FROM wo_materials wm WHERE wm.wo_id = w.id AND wm.quantity_issued >= wm.quantity_required) AS materials_ready,
              (SELECT COUNT(*) FROM wo_materials wm WHERE wm.wo_id = w.id) AS materials_total
       FROM work_orders w
       JOIN products p ON w.product_id = p.id
       WHERE w.status IN ('in_progress', 'in-progress', 'pending', 'planned')
       ORDER BY w.actual_start DESC, w.scheduled_start ASC`
    );
    res.json({ success: true, data: active });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch execution data' });
  }
});

router.post('/execution/:woId/start', authMiddleware, async (req: Request, res: Response) => {
  try {
    await dbRun(
      `UPDATE work_orders SET status='in_progress', actual_start=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE id=?`,
      [req.params.woId]
    );
    res.json({ success: true, message: 'Work order started' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to start work order' });
  }
});

router.post('/execution/:woId/pause', authMiddleware, async (req: Request, res: Response) => {
  try {
    await dbRun(
      `UPDATE work_orders SET status='on_hold', updated_at=CURRENT_TIMESTAMP WHERE id=?`,
      [req.params.woId]
    );
    res.json({ success: true, message: 'Work order paused' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to pause work order' });
  }
});

router.post('/execution/:woId/resume', authMiddleware, async (req: Request, res: Response) => {
  try {
    await dbRun(
      `UPDATE work_orders SET status='in_progress', updated_at=CURRENT_TIMESTAMP WHERE id=?`,
      [req.params.woId]
    );
    res.json({ success: true, message: 'Work order resumed' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to resume work order' });
  }
});

router.post('/execution/:woId/complete', authMiddleware, async (req: Request, res: Response) => {
  try {
    await dbRun(
      `UPDATE work_orders SET status='completed', actual_end=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE id=?`,
      [req.params.woId]
    );
    res.json({ success: true, message: 'Work order completed' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to complete work order' });
  }
});

// Process logs for a WO
router.get('/execution/:woId/logs', authMiddleware, async (req: Request, res: Response) => {
  try {
    const logs = await dbAll(
      `SELECT wpl.*, COALESCE(u.full_name, u.username) AS recorded_by_name
       FROM wo_process_logs wpl
       LEFT JOIN users u ON u.id = wpl.recorded_by
       WHERE wpl.wo_id = ? ORDER BY wpl.start_time ASC`,
      [req.params.woId]
    );
    res.json({ success: true, data: logs });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch process logs' });
  }
});

router.post('/execution/:woId/logs', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { process_name, start_time, end_time, status, notes } = req.body;
    if (!process_name) return res.status(400).json({ error: 'process_name is required' });

    const userId = (req as any).user?.userId;
    let duration = null;
    if (start_time && end_time) {
      duration = Math.round((new Date(end_time).getTime() - new Date(start_time).getTime()) / 60000);
    }

    const result = await dbRun(
      `INSERT INTO wo_process_logs (wo_id, process_name, start_time, end_time, duration_minutes, status, notes, recorded_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [req.params.woId, process_name, start_time || null, end_time || null, duration, status || 'in_progress', notes || null, userId]
    );
    res.status(201).json({ success: true, message: 'Process log created', id: result.insertId });
  } catch (error) {
    res.status(500).json({ error: 'Failed to create process log' });
  }
});

// ============================================================
// Yield & Scrap — record output and losses
// ============================================================
router.get('/yield', authMiddleware, async (_req: Request, res: Response) => {
  try {
    const results = await dbAll(
      `SELECT wr.id, wr.wo_id, w.wo_number,
              p.name AS product_name, p.sku,
              wr.output_quantity, wr.loss_quantity, wr.loss_percentage,
              wr.batch_number, wr.qc_status,
              wr.completed_at, wr.notes,
              COALESCE(u.full_name, u.username) AS completed_by_name,
              w.quantity AS planned_quantity
       FROM wo_results wr
       JOIN work_orders w ON w.id = wr.wo_id
       JOIN products p ON p.id = w.product_id
       LEFT JOIN users u ON u.id = wr.completed_by
       ORDER BY wr.completed_at DESC`
    );
    res.json({ success: true, data: results });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch yield data' });
  }
});

router.get('/yield/wo/:woId', authMiddleware, async (req: Request, res: Response) => {
  try {
    const result = await dbGet(
      `SELECT wr.*, w.wo_number, w.quantity AS planned_quantity, p.name AS product_name
       FROM wo_results wr
       JOIN work_orders w ON w.id = wr.wo_id
       JOIN products p ON p.id = w.product_id
       WHERE wr.wo_id = ?`,
      [req.params.woId]
    );
    res.json({ success: true, data: result || null });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch yield for WO' });
  }
});

router.post('/yield', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { wo_id, output_quantity, loss_quantity, batch_number, qc_status, notes } = req.body;
    if (!wo_id || output_quantity === undefined) {
      return res.status(400).json({ error: 'wo_id and output_quantity are required' });
    }

    const userId = (req as any).user?.userId;
    const totalOutput = Number(output_quantity) + Number(loss_quantity || 0);
    const lossPct = totalOutput > 0 ? ((Number(loss_quantity || 0) / totalOutput) * 100).toFixed(2) : '0.00';

    const result = await dbRun(
      `INSERT INTO wo_results (wo_id, output_quantity, loss_quantity, loss_percentage, batch_number, qc_status, completed_by, completed_at, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?)`,
      [wo_id, output_quantity, loss_quantity || 0, lossPct, batch_number || null, qc_status || 'pending', userId, notes || null]
    );
    res.status(201).json({ success: true, message: 'Yield recorded', id: result.insertId });
  } catch (error) {
    console.error('Error recording yield:', error);
    res.status(500).json({ error: 'Failed to record yield' });
  }
});

router.put('/yield/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { output_quantity, loss_quantity, batch_number, qc_status, notes } = req.body;
    const totalOutput = Number(output_quantity) + Number(loss_quantity || 0);
    const lossPct = totalOutput > 0 ? ((Number(loss_quantity || 0) / totalOutput) * 100).toFixed(2) : '0.00';

    await dbRun(
      `UPDATE wo_results SET output_quantity=?, loss_quantity=?, loss_percentage=?, batch_number=?, qc_status=?, notes=? WHERE id=?`,
      [output_quantity, loss_quantity || 0, lossPct, batch_number || null, qc_status || 'pending', notes || null, req.params.id]
    );
    res.json({ success: true, message: 'Yield updated' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update yield' });
  }
});

// ============================================================
// FG Receipt — receive finished goods into warehouse
// ============================================================
router.get('/fg-receipt', authMiddleware, async (_req: Request, res: Response) => {
  try {
    const receipts = await dbAll(
      `SELECT w.id AS wo_id, w.wo_number, w.quantity AS planned_qty, w.status,
              p.id AS product_id, p.name AS product_name, p.sku,
              wr.output_quantity, wr.batch_number, wr.qc_status,
              wr.completed_at,
              COALESCE(sm.received, 0) AS received_into_stock
       FROM work_orders w
       JOIN products p ON p.id = w.product_id
       LEFT JOIN wo_results wr ON wr.wo_id = w.id
       LEFT JOIN (
         SELECT reference_id AS wo_id, SUM(quantity) AS received
         FROM stock_movements
         WHERE reference_type = 'fg_receipt' AND movement_type = 'in'
         GROUP BY reference_id
       ) sm ON sm.wo_id = w.id
       WHERE w.status = 'completed' OR wr.id IS NOT NULL
       ORDER BY wr.completed_at DESC`
    );
    res.json({ success: true, data: receipts });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch FG receipts' });
  }
});

router.post('/fg-receipt', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { wo_id, warehouse_id, quantity, batch_number } = req.body;
    if (!wo_id || !warehouse_id || !quantity) {
      return res.status(400).json({ error: 'wo_id, warehouse_id, and quantity are required' });
    }

    const wo = await dbGet(
      `SELECT w.*, p.name AS product_name FROM work_orders w JOIN products p ON p.id = w.product_id WHERE w.id = ?`, [wo_id]
    );
    if (!wo) return res.status(404).json({ error: 'Work order not found' });

    const userId = (req as any).user?.userId;

    // Add to inventory
    const existing = await dbGet(
      'SELECT id, quantity FROM inventory_stocks WHERE product_id = ? AND warehouse_id = ?',
      [wo.product_id, warehouse_id]
    );
    if (existing) {
      await dbRun('UPDATE inventory_stocks SET quantity = quantity + ?, last_updated = CURRENT_TIMESTAMP WHERE id = ?',
        [quantity, existing.id]);
    } else {
      await dbRun('INSERT INTO inventory_stocks (warehouse_id, product_id, quantity) VALUES (?, ?, ?)',
        [warehouse_id, wo.product_id, quantity]);
    }

    // Record stock movement
    await dbRun(
      `INSERT INTO stock_movements (warehouse_id, product_id, batch_number, movement_type, quantity, reference_type, reference_id, notes, created_by)
       VALUES (?, ?, ?, 'in', ?, 'fg_receipt', ?, ?, ?)`,
      [warehouse_id, wo.product_id, batch_number || null, quantity, wo_id, `FG receipt from ${wo.wo_number || 'WO-' + wo_id}`, userId]
    );

    // Create batch if batch_number provided
    if (batch_number) {
      const batchExists = await dbGet('SELECT id FROM batches WHERE batch_number = ?', [batch_number]);
      if (!batchExists) {
        await dbRun(
          `INSERT INTO batches (batch_number, product_id, quantity, manufacture_date, status, warehouse_id)
           VALUES (?, ?, ?, CURDATE(), 'released', ?)`,
          [batch_number, wo.product_id, quantity, warehouse_id]
        );
      }
    }

    res.json({ success: true, message: 'FG received into warehouse' });
  } catch (error) {
    console.error('Error receiving FG:', error);
    res.status(500).json({ error: 'Failed to receive FG' });
  }
});

// ============================================================
// Production History — all WOs with full detail
// ============================================================
router.get('/history', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { status, from_date, to_date, search } = req.query;
    let sql = `SELECT w.id, w.wo_number, w.quantity, w.status,
                      w.scheduled_start, w.scheduled_end, w.actual_start, w.actual_end,
                      w.notes, w.created_at,
                      p.name AS product_name, p.sku,
                      COALESCE(u.full_name, u.username) AS created_by_name,
                      wr.output_quantity, wr.loss_quantity, wr.loss_percentage
               FROM work_orders w
               LEFT JOIN products p ON p.id = w.product_id
               LEFT JOIN users u ON u.id = w.created_by
               LEFT JOIN wo_results wr ON wr.wo_id = w.id
               WHERE 1=1`;
    const params: any[] = [];

    if (status) {
      sql += ' AND w.status = ?';
      params.push(status);
    }
    if (from_date) {
      sql += ' AND w.created_at >= ?';
      params.push(from_date);
    }
    if (to_date) {
      sql += ' AND w.created_at <= ?';
      params.push(to_date);
    }
    if (search) {
      sql += ' AND (w.wo_number LIKE ? OR p.name LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }

    sql += ' ORDER BY w.created_at DESC';

    const history = await dbAll(sql, params);
    res.json({ success: true, data: history });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch production history' });
  }
});

router.get('/history/stats', authMiddleware, async (_req: Request, res: Response) => {
  try {
    const stats = await dbGet(
      `SELECT
         COUNT(*) AS total_wo,
         SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) AS completed,
         SUM(CASE WHEN status IN ('in_progress','in-progress') THEN 1 ELSE 0 END) AS in_progress,
         SUM(CASE WHEN status='pending' OR status='planned' THEN 1 ELSE 0 END) AS pending,
         SUM(CASE WHEN status='cancelled' THEN 1 ELSE 0 END) AS cancelled,
         AVG(CASE WHEN actual_start IS NOT NULL AND actual_end IS NOT NULL
             THEN TIMESTAMPDIFF(HOUR, actual_start, actual_end) ELSE NULL END) AS avg_hours
       FROM work_orders`
    );
    res.json({ success: true, data: stats });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch history stats' });
  }
});

export default router;
