import { Router, Request, Response } from 'express';
import { dbAll, dbGet, dbRun } from '../config/database';
import { authMiddleware } from '../middleware/auth';

const router = Router();

// ==========================================
// ITEM MASTER (FG, RM, PM)
// ==========================================
router.get('/items', authMiddleware, async (req: Request, res: Response) => {
    try {
        const { type } = req.query;
        let query = `
            SELECT p.*, c.name as category_name, pt.name as type_name, u.name as uom_name
            FROM products p
            LEFT JOIN categories c ON p.category_id = c.id
            LEFT JOIN product_types pt ON p.product_type_id = pt.id
            LEFT JOIN uom u ON p.unit_of_measure_id = u.id
            WHERE p.active = 1
        `;
        const params: any[] = [];
        if (type) { query += ` AND pt.code = ?`; params.push(type); }
        query += ` ORDER BY p.name ASC`;
        const items = await dbAll(query, params);
        res.json({ data: items });
    } catch (error) {
        console.error('Error fetching PPIC items:', error);
        res.status(500).json({ error: 'Failed to fetch items' });
    }
});

// ==========================================
// BILL OF MATERIALS (BOM)
// ==========================================
router.get('/boms', authMiddleware, async (req: Request, res: Response) => {
    try {
        const boms = await dbAll(`
            SELECT b.*, p.name as product_name, p.sku as product_sku
            FROM bom_headers b LEFT JOIN products p ON b.product_id = p.id
            ORDER BY b.created_at DESC
        `);
        res.json({ data: boms });
    } catch (error) { res.status(500).json({ error: 'Failed to fetch BOMs' }); }
});

router.get('/boms/:id', authMiddleware, async (req: Request, res: Response) => {
    try {
        const bomId = req.params.id;
        const header = await dbGet(`
            SELECT b.*, p.name as product_name, p.sku as product_sku, u.name as uom_name
            FROM bom_headers b
            LEFT JOIN products p ON b.product_id = p.id
            LEFT JOIN uom u ON p.unit_of_measure_id = u.id
            WHERE b.id = ?
        `, [bomId]);
        if (!header) return res.status(404).json({ error: 'BOM not found' });
        const details = await dbAll(`
            SELECT bd.*, p.name as material_name, p.sku as material_sku, u.name as uom_name
            FROM bom_details bd
            LEFT JOIN products p ON bd.raw_material_id = p.id
            LEFT JOIN uom u ON bd.unit_of_measure_id = u.id
            WHERE bd.bom_header_id = ? ORDER BY bd.sequence ASC
        `, [bomId]);
        res.json({ data: { header, details } });
    } catch (error) { res.status(500).json({ error: 'Failed to fetch BOM details' }); }
});

// ==========================================
// MPS — MASTER PRODUCTION SCHEDULE
// ==========================================

// Helper: get ISO week number
function getWeekNumber(d: Date): number {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

// Helper: get date range for ISO week
function getWeekDateRange(year: number, week: number): { start: string; end: string } {
  const jan4 = new Date(year, 0, 4);
  const dayOfWeek = jan4.getDay() || 7;
  const monday = new Date(jan4);
  monday.setDate(jan4.getDate() - dayOfWeek + 1 + (week - 1) * 7);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const fmt = (d: Date) => `${d.getDate()}/${d.getMonth() + 1}`;
  return { start: fmt(monday), end: fmt(sunday) };
}

// GET /mps - List MPS headers
router.get('/mps', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { year, month, status } = req.query;
    let query = `
      SELECT m.*, u.full_name as created_by_name, cu.full_name as confirmed_by_name,
        (SELECT COUNT(*) FROM mps_details WHERE mps_header_id = m.id) as item_count
      FROM mps_headers m
      LEFT JOIN users u ON m.created_by = u.id
      LEFT JOIN users cu ON m.confirmed_by = cu.id
      WHERE 1=1
    `;
    const params: any[] = [];
    if (year) { query += ' AND m.period_year = ?'; params.push(year); }
    if (month) { query += ' AND m.period_month = ?'; params.push(month); }
    if (status) { query += ' AND m.status = ?'; params.push(status); }
    query += ' ORDER BY m.period_year DESC, m.period_month DESC';
    const rows = await dbAll(query, params);
    res.json({ data: rows });
  } catch (error) {
    console.error('Error fetching MPS list:', error);
    res.status(500).json({ error: 'Failed to fetch MPS list' });
  }
});

// GET /mps/:id - Get MPS with details + weekly grid
router.get('/mps/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const header = await dbGet(`
      SELECT m.*, u.full_name as created_by_name, cu.full_name as confirmed_by_name
      FROM mps_headers m
      LEFT JOIN users u ON m.created_by = u.id
      LEFT JOIN users cu ON m.confirmed_by = cu.id
      WHERE m.id = ?
    `, [id]) as any;
    if (!header) return res.status(404).json({ error: 'MPS not found' });

    const details = await dbAll(`
      SELECT d.*,
        p.name as product_name, p.sku as product_sku,
        um.name as uom_name,
        bh.product_name as bom_name, bh.version as bom_version,
        cp.project_number, cp.project_name, cp.status as project_status,
        c.name as client_name,
        wo.wo_number, wo.status as wo_status
      FROM mps_details d
      LEFT JOIN products p ON d.product_id = p.id
      LEFT JOIN uom um ON p.unit_of_measure_id = um.id
      LEFT JOIN bom_headers bh ON d.bom_id = bh.id
      LEFT JOIN client_projects cp ON d.project_id = cp.id
      LEFT JOIN clients c ON cp.client_id = c.id
      LEFT JOIN work_orders wo ON d.wo_id = wo.id
      WHERE d.mps_header_id = ?
      ORDER BY d.id ASC
    `, [id]);

    // Load weekly grid data for all details
    const detailIds = (details as any[]).map((d: any) => d.id);
    let weekData: any[] = [];
    if (detailIds.length > 0) {
      const placeholders = detailIds.map(() => '?').join(',');
      weekData = await dbAll(`
        SELECT * FROM mps_week_data
        WHERE mps_detail_id IN (${placeholders})
        ORDER BY year, week_number
      `, detailIds) as any[];
    }

    // Attach weekly data to each detail
    const detailsWithWeeks = (details as any[]).map((d: any) => ({
      ...d,
      weeks: weekData.filter((w: any) => w.mps_detail_id === d.id)
    }));

    // Generate week columns info
    const numWeeks = 12;
    const now = new Date();
    const currentWeek = getWeekNumber(now);
    const currentYear = now.getFullYear();
    const weekColumns = [];
    for (let i = 0; i < numWeeks; i++) {
      let wk = currentWeek + i;
      let yr = currentYear;
      if (wk > 52) { wk -= 52; yr++; }
      const range = getWeekDateRange(yr, wk);
      weekColumns.push({ week: wk, year: yr, label: `W${wk}`, dateRange: `${range.start}-${range.end}` });
    }

    res.json({ data: { header, details: detailsWithWeeks, weekColumns } });
  } catch (error) {
    console.error('Error fetching MPS detail:', error);
    res.status(500).json({ error: 'Failed to fetch MPS detail' });
  }
});

// POST /mps - Create new MPS header
router.post('/mps', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { period_year, period_month, scheme, notes } = req.body;
    const userId = (req as any).userId || null;
    const existing = await dbGet(
      'SELECT id FROM mps_headers WHERE period_year = ? AND period_month = ? AND scheme = ?',
      [period_year, period_month, scheme || 'MTO']
    );
    if (existing) return res.status(400).json({ error: `MPS for ${period_year}-${String(period_month).padStart(2, '0')} already exists` });

    const mpsNumber = `MPS-${period_year}-${String(period_month).padStart(2, '0')}`;
    const result = await dbRun(
      `INSERT INTO mps_headers (mps_number, period_year, period_month, scheme, notes, created_by) VALUES (?, ?, ?, ?, ?, ?)`,
      [mpsNumber, period_year, period_month, scheme || 'MTO', notes || null, userId]
    );
    res.status(201).json({ message: 'MPS created', data: { id: result.insertId, mps_number: mpsNumber } });
  } catch (error) {
    console.error('Error creating MPS:', error);
    res.status(500).json({ error: 'Failed to create MPS' });
  }
});

// POST /mps/:id/pull-orders - Pull open projects (=SO) into MPS + populate weekly grid
router.post('/mps/:id/pull-orders', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const header = await dbGet('SELECT * FROM mps_headers WHERE id = ?', [id]) as any;
    if (!header) return res.status(404).json({ error: 'MPS not found' });
    if (header.status !== 'Draft') return res.status(400).json({ error: 'Can only pull orders into Draft MPS' });

    // Pull from client_projects where product_id is set and project falls in the MPS period
    const startDate = `${header.period_year}-${String(header.period_month).padStart(2, '0')}-01`;
    const endDate = `${header.period_year}-${String(header.period_month).padStart(2, '0')}-31`;

    const projects = await dbAll(`
      SELECT cp.id as project_id, cp.project_number, cp.project_name, cp.product_id, cp.quantity,
        cp.start_date, cp.end_date, cp.status,
        p.name as product_name, p.sku as product_sku,
        c.name as client_name,
        bh.id as bom_id
      FROM client_projects cp
      JOIN products p ON cp.product_id = p.id
      LEFT JOIN clients c ON cp.client_id = c.id
      LEFT JOIN bom_headers bh ON bh.product_id = cp.product_id AND bh.status = 'ACTIVE'
      WHERE cp.status IN ('open', 'in_progress')
        AND cp.product_id IS NOT NULL
        AND (cp.start_date BETWEEN ? AND ? OR cp.end_date BETWEEN ? AND ? OR (cp.start_date <= ? AND cp.end_date >= ?))
        AND cp.id NOT IN (SELECT COALESCE(project_id, 0) FROM mps_details WHERE project_id IS NOT NULL)
      ORDER BY cp.start_date ASC
    `, [startDate, endDate, startDate, endDate, startDate, endDate]) as any[];

    if (projects.length === 0) {
      return res.json({ message: 'No pending projects found for this period', pulled: 0 });
    }

    const now = new Date();
    const currentWeek = getWeekNumber(now);
    const currentYear = now.getFullYear();

    let pulled = 0;
    for (const proj of projects) {
      const qty = Number(proj.quantity || 0);

      // Insert MPS detail linked to project
      const detailResult = await dbRun(`
        INSERT INTO mps_details (mps_header_id, product_id, bom_id, project_id,
          demand_qty, current_stock, batch_no, batch_qty, lead_time_weeks, status)
        VALUES (?, ?, ?, ?, ?, 0, NULL, 0, 1, 'Pending')
      `, [id, proj.product_id, proj.bom_id || null, proj.project_id, qty]);

      const detailId = detailResult.insertId;

      // Determine which week the project's start_date falls in
      const projDate = new Date(proj.start_date);
      const projWeek = getWeekNumber(projDate);
      const projYear = projDate.getFullYear();

      // Create 12 weeks of grid data, place SO qty in the project's week
      for (let i = 0; i < 12; i++) {
        let wk = currentWeek + i;
        let yr = currentYear;
        if (wk > 52) { wk -= 52; yr++; }

        const isSoWeek = (wk === projWeek && yr === projYear);
        await dbRun(`
          INSERT INTO mps_week_data (mps_detail_id, week_number, year, forecast_qty, so_qty, start_process_qty, fg_qty)
          VALUES (?, ?, ?, 0, ?, 0, 0)
        `, [detailId, wk, yr, isSoWeek ? qty : 0]);
      }
      pulled++;
    }

    res.json({ message: `${pulled} projects pulled into MPS`, pulled });
  } catch (error) {
    console.error('Error pulling orders:', error);
    res.status(500).json({ error: 'Failed to pull orders' });
  }
});

// PUT /mps/:id/details/:detailId/remark - Update remark info (stock, batch, lead time)
router.put('/mps/:id/details/:detailId/remark', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { id, detailId } = req.params;
    const { current_stock, batch_no, batch_qty, lead_time_weeks } = req.body;

    const header = await dbGet('SELECT status FROM mps_headers WHERE id = ?', [id]) as any;
    if (!header) return res.status(404).json({ error: 'MPS not found' });

    await dbRun(`
      UPDATE mps_details SET
        current_stock = COALESCE(?, current_stock),
        batch_no = COALESCE(?, batch_no),
        batch_qty = COALESCE(?, batch_qty),
        lead_time_weeks = COALESCE(?, lead_time_weeks)
      WHERE id = ? AND mps_header_id = ?
    `, [current_stock, batch_no, batch_qty, lead_time_weeks, detailId, id]);

    res.json({ message: 'Remark updated' });
  } catch (error) {
    console.error('Error updating remark:', error);
    res.status(500).json({ error: 'Failed to update remark' });
  }
});

// PUT /mps/:id/week-data - Bulk update weekly grid cells
router.put('/mps/:id/week-data', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { entries } = req.body; // [{ mps_detail_id, week_number, year, field, value }]

    const header = await dbGet('SELECT status FROM mps_headers WHERE id = ?', [id]) as any;
    if (!header) return res.status(404).json({ error: 'MPS not found' });

    for (const entry of (entries || [])) {
      const allowedFields = ['forecast_qty', 'so_qty', 'start_process_qty', 'fg_qty'];
      if (!allowedFields.includes(entry.field)) continue;

      // Upsert
      const existing = await dbGet(
        'SELECT id FROM mps_week_data WHERE mps_detail_id = ? AND year = ? AND week_number = ?',
        [entry.mps_detail_id, entry.year, entry.week_number]
      );

      if (existing) {
        await dbRun(
          `UPDATE mps_week_data SET ${entry.field} = ? WHERE mps_detail_id = ? AND year = ? AND week_number = ?`,
          [entry.value || 0, entry.mps_detail_id, entry.year, entry.week_number]
        );
      } else {
        const insertObj: any = { forecast_qty: 0, so_qty: 0, start_process_qty: 0, fg_qty: 0 };
        insertObj[entry.field] = entry.value || 0;
        await dbRun(`
          INSERT INTO mps_week_data (mps_detail_id, week_number, year, forecast_qty, so_qty, start_process_qty, fg_qty)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [entry.mps_detail_id, entry.week_number, entry.year, insertObj.forecast_qty, insertObj.so_qty, insertObj.start_process_qty, insertObj.fg_qty]);
      }
    }

    res.json({ message: 'Week data updated' });
  } catch (error) {
    console.error('Error updating week data:', error);
    res.status(500).json({ error: 'Failed to update week data' });
  }
});

// POST /mps/:id/confirm
router.post('/mps/:id/confirm', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = (req as any).userId || null;
    const header = await dbGet('SELECT * FROM mps_headers WHERE id = ?', [id]) as any;
    if (!header) return res.status(404).json({ error: 'MPS not found' });
    if (header.status !== 'Draft') return res.status(400).json({ error: 'Only Draft MPS can be confirmed' });

    const detailCount = await dbGet('SELECT COUNT(*) as cnt FROM mps_details WHERE mps_header_id = ?', [id]) as any;
    if (!detailCount || detailCount.cnt === 0) return res.status(400).json({ error: 'Cannot confirm empty MPS' });

    await dbRun('UPDATE mps_headers SET status = ?, confirmed_by = ?, confirmed_at = NOW() WHERE id = ?', ['Confirmed', userId, id]);
    await dbRun('UPDATE mps_details SET status = ? WHERE mps_header_id = ? AND status = ?', ['Scheduled', id, 'Pending']);
    res.json({ message: 'MPS confirmed' });
  } catch (error) { res.status(500).json({ error: 'Failed to confirm MPS' }); }
});

// POST /mps/:id/details/:detailId/generate-wo
router.post('/mps/:id/details/:detailId/generate-wo', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { id, detailId } = req.params;
    const userId = (req as any).userId || null;
    const header = await dbGet('SELECT * FROM mps_headers WHERE id = ?', [id]) as any;
    if (!header) return res.status(404).json({ error: 'MPS not found' });
    if (header.status !== 'Confirmed') return res.status(400).json({ error: 'MPS must be Confirmed' });

    const detail = await dbGet('SELECT * FROM mps_details WHERE id = ? AND mps_header_id = ?', [detailId, id]) as any;
    if (!detail) return res.status(404).json({ error: 'MPS detail not found' });
    if (detail.wo_id) return res.status(400).json({ error: 'WO already generated' });

    // Sum FG qty from weekly data as total production
    const weekSum = await dbGet('SELECT COALESCE(SUM(fg_qty), 0) as total FROM mps_week_data WHERE mps_detail_id = ?', [detailId]) as any;
    const totalProduction = Number(weekSum?.total || detail.demand_qty || 0);
    if (totalProduction <= 0) return res.status(400).json({ error: 'No production quantity' });

    const woCount = await dbGet('SELECT COUNT(*) as cnt FROM work_orders') as any;
    const woNumber = `WO-${String((woCount?.cnt || 0) + 1).padStart(5, '0')}`;
    const schedStart = `${header.period_year}-${String(header.period_month).padStart(2, '0')}-01`;
    const lastDay = new Date(header.period_year, header.period_month, 0).getDate();
    const schedEnd = `${header.period_year}-${String(header.period_month).padStart(2, '0')}-${lastDay}`;

    const woResult = await dbRun(`
      INSERT INTO work_orders (wo_number, product_id, bom_id, quantity, status, scheduled_start, scheduled_end, so_id, mps_detail_id, created_by, notes)
      VALUES (?, ?, ?, ?, 'DRAFT', ?, ?, ?, ?, ?, ?)
    `, [woNumber, detail.product_id, detail.bom_id, totalProduction, schedStart, schedEnd, detail.so_id, detail.id, userId, `From MPS ${header.mps_number}`]);

    await dbRun('UPDATE mps_details SET wo_id = ?, status = ? WHERE id = ?', [woResult.insertId, 'In Production', detailId]);
    res.json({ message: 'Work Order generated', data: { wo_id: woResult.insertId, wo_number: woNumber } });
  } catch (error) { res.status(500).json({ error: 'Failed to generate WO' }); }
});

// DELETE /mps/:id
router.delete('/mps/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const header = await dbGet('SELECT status FROM mps_headers WHERE id = ?', [id]) as any;
    if (!header) return res.status(404).json({ error: 'MPS not found' });
    if (header.status !== 'Draft') return res.status(400).json({ error: 'Only Draft can be deleted' });
    // Delete week data first (cascade should handle, but be safe)
    const detailIds = await dbAll('SELECT id FROM mps_details WHERE mps_header_id = ?', [id]) as any[];
    for (const d of detailIds) {
      await dbRun('DELETE FROM mps_week_data WHERE mps_detail_id = ?', [d.id]);
    }
    await dbRun('DELETE FROM mps_details WHERE mps_header_id = ?', [id]);
    await dbRun('DELETE FROM mps_headers WHERE id = ?', [id]);
    res.json({ message: 'MPS deleted' });
  } catch (error) { res.status(500).json({ error: 'Failed to delete MPS' }); }
});

// DELETE /mps/:id/details/:detailId
router.delete('/mps/:id/details/:detailId', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { id, detailId } = req.params;
    const header = await dbGet('SELECT status FROM mps_headers WHERE id = ?', [id]) as any;
    if (!header || header.status !== 'Draft') return res.status(400).json({ error: 'Cannot remove' });
    await dbRun('DELETE FROM mps_week_data WHERE mps_detail_id = ?', [detailId]);
    await dbRun('DELETE FROM mps_details WHERE id = ? AND mps_header_id = ?', [detailId, id]);
    res.json({ message: 'Item removed' });
  } catch (error) { res.status(500).json({ error: 'Failed to remove' }); }
});

// GET /pending-orders
router.get('/pending-orders', authMiddleware, async (req: Request, res: Response) => {
  try {
    const soItems = await dbAll(`
      SELECT si.id as so_item_id, si.so_id, si.product_id, si.quantity,
        so.so_number, so.so_date, p.name as product_name, p.sku as product_sku, c.name as customer_name
      FROM so_items si
      JOIN sales_orders so ON si.so_id = so.id
      JOIN products p ON si.product_id = p.id
      LEFT JOIN customers c ON so.customer_id = c.id
      WHERE so.status IN ('OPEN', 'open', 'confirmed', 'CONFIRMED', 'approved', 'APPROVED')
        AND si.id NOT IN (SELECT COALESCE(so_item_id, 0) FROM mps_details WHERE so_item_id IS NOT NULL)
      ORDER BY so.so_date ASC
    `);
    res.json({ data: soItems });
  } catch (error) { res.status(500).json({ error: 'Failed to fetch pending orders' }); }
});
// ==========================================
// MRP — MATERIAL REQUIREMENT PLANNING
// ==========================================

// GET /mps/:id/details/:detailId/mrp - Explode BOM → MRP breakdown
router.get('/mps/:id/details/:detailId/mrp', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { id, detailId } = req.params;
    
    // Get MPS detail + BOM info
    const detail = await dbGet(`
      SELECT d.*, p.name as product_name, p.sku as product_sku, bh.id as bom_id
      FROM mps_details d
      LEFT JOIN products p ON d.product_id = p.id
      LEFT JOIN bom_headers bh ON d.bom_id = bh.id
      WHERE d.id = ? AND d.mps_header_id = ?
    `, [detailId, id]) as any;
    
    if (!detail) return res.status(404).json({ error: 'MPS detail not found' });
    if (!detail.bom_id) return res.status(400).json({ error: 'No BOM linked to this product' });

    // Get BOM raw materials
    const bomItems = await dbAll(`
      SELECT bd.raw_material_id, bd.quantity as qty_per_unit, bd.unit_of_measure_id,
        p.name as material_name, p.sku as material_sku,
        u.name as uom_name,
        pt.code as product_type_code
      FROM bom_details bd
      JOIN products p ON bd.raw_material_id = p.id
      LEFT JOIN uom u ON bd.unit_of_measure_id = u.id
      LEFT JOIN product_types pt ON p.product_type_id = pt.id
      WHERE bd.bom_header_id = ?
      ORDER BY bd.sequence ASC
    `, [detail.bom_id]) as any[];

    // Get MPS weekly production data (fg_qty drives gross requirements)
    const mpsWeeks = await dbAll(`
      SELECT * FROM mps_week_data WHERE mps_detail_id = ? ORDER BY year, week_number
    `, [detailId]) as any[];

    // Get saved MRP planned receipts
    const mrpData = await dbAll(`
      SELECT * FROM mrp_week_data WHERE mps_detail_id = ?
    `, [detailId]) as any[];

    // Generate week columns
    const numWeeks = 12;
    const now = new Date();
    const currentWeek = getWeekNumber(now);
    const currentYear = now.getFullYear();
    const weekColumns = [];
    for (let i = 0; i < numWeeks; i++) {
      let wk = currentWeek + i;
      let yr = currentYear;
      if (wk > 52) { wk -= 52; yr++; }
      const range = getWeekDateRange(yr, wk);
      weekColumns.push({ week: wk, year: yr, label: `W${wk}`, dateRange: `${range.start}-${range.end}` });
    }

    // For each BOM material, calculate MRP
    const materials = bomItems.map((bom: any) => {
      const matId = bom.raw_material_id;
      const qtyPerUnit = Number(bom.qty_per_unit) || 0;

      // Calculate per-week data
      const weeks = weekColumns.map((wc: any) => {
        // Gross requirement = MPS fg_qty × BOM qty_per_unit
        const mpsWeek = mpsWeeks.find((w: any) => w.week_number === wc.week && w.year === wc.year);
        const fgQty = Number(mpsWeek?.fg_qty || 0);
        const grossReq = fgQty * qtyPerUnit;

        // Planned order receipt (from saved data or 0)
        const mrpWeek = mrpData.find((m: any) => m.material_id === matId && m.week_number === wc.week && m.year === wc.year);
        const plannedReceipt = Number(mrpWeek?.planned_order_receipt || 0);

        return {
          week_number: wc.week,
          year: wc.year,
          gross_requirements: Math.round(grossReq * 100) / 100,
          planned_order_receipt: plannedReceipt,
          // net_requirements and projected_on_hand calculated on frontend
        };
      });

      return {
        material_id: matId,
        material_name: bom.material_name,
        material_sku: bom.material_sku,
        uom_name: bom.uom_name,
        product_type_code: bom.product_type_code,
        qty_per_unit: qtyPerUnit,
        lead_time: 2, // default 2 weeks for RM
        first_stock: 0, // TODO: link to inventory
        weeks
      };
    });

    res.json({
      data: {
        product: { id: detail.product_id, name: detail.product_name, sku: detail.product_sku },
        bom_id: detail.bom_id,
        materials,
        weekColumns
      }
    });
  } catch (error) {
    console.error('Error fetching MRP:', error);
    res.status(500).json({ error: 'Failed to fetch MRP data' });
  }
});

// PUT /mps/:id/details/:detailId/mrp - Save MRP planned order receipts
router.put('/mps/:id/details/:detailId/mrp', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { detailId } = req.params;
    const { entries } = req.body; // [{ material_id, week_number, year, planned_order_receipt }]

    for (const entry of (entries || [])) {
      const existing = await dbGet(
        'SELECT id FROM mrp_week_data WHERE mps_detail_id = ? AND material_id = ? AND year = ? AND week_number = ?',
        [detailId, entry.material_id, entry.year, entry.week_number]
      );
      if (existing) {
        await dbRun(
          'UPDATE mrp_week_data SET planned_order_receipt = ? WHERE mps_detail_id = ? AND material_id = ? AND year = ? AND week_number = ?',
          [entry.planned_order_receipt || 0, detailId, entry.material_id, entry.year, entry.week_number]
        );
      } else {
        await dbRun(
          'INSERT INTO mrp_week_data (mps_detail_id, material_id, week_number, year, planned_order_receipt) VALUES (?, ?, ?, ?, ?)',
          [detailId, entry.material_id, entry.week_number, entry.year, entry.planned_order_receipt || 0]
        );
      }
    }

    res.json({ message: 'MRP data saved' });
  } catch (error) {
    console.error('Error saving MRP:', error);
    res.status(500).json({ error: 'Failed to save MRP data' });
  }
});

// ==========================================
// STANDALONE MRP — Aggregated across ALL confirmed MPS
// ==========================================

// GET /mrp - Standalone MRP: aggregate gross requirements per unique raw material across all confirmed MPS
router.get('/mrp', authMiddleware, async (req: Request, res: Response) => {
  try {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentWeek = getWeekNumber(now);
    const year = Number(req.query.year) || currentYear;

    // Generate 12 week columns from current week
    const numWeeks = 12;
    const weekColumns = [];
    for (let i = 0; i < numWeeks; i++) {
      let wk = currentWeek + i;
      let yr = currentYear;
      if (wk > 52) { wk -= 52; yr++; }
      const range = getWeekDateRange(yr, wk);
      weekColumns.push({ week: wk, year: yr, label: `W${wk}`, dateRange: `${range.start}-${range.end}` });
    }

    // 1. Get ALL MPS headers (Draft + Confirmed) for the requested year
    const mpsHeaders = await dbAll(
      `SELECT id FROM mps_headers WHERE status IN ('Draft', 'Confirmed') AND period_year = ?`,
      [year]
    ) as any[];

    if (mpsHeaders.length === 0) {
      return res.json({ data: { materials: [], weekColumns } });
    }

    const headerIds = mpsHeaders.map((h: any) => h.id);
    const headerPlaceholders = headerIds.map(() => '?').join(',');

    // 2. Get ALL MPS details for those headers (with BOM info)
    const allDetails = await dbAll(`
      SELECT d.id as detail_id, d.product_id, d.bom_id
      FROM mps_details d
      WHERE d.mps_header_id IN (${headerPlaceholders}) AND d.bom_id IS NOT NULL
    `, headerIds) as any[];

    if (allDetails.length === 0) {
      return res.json({ data: { materials: [], weekColumns } });
    }

    const detailIds = allDetails.map((d: any) => d.detail_id);
    const detailPlaceholders = detailIds.map(() => '?').join(',');

    // 3. Get ALL MPS weekly production data for those details
    const allMpsWeeks = await dbAll(`
      SELECT * FROM mps_week_data WHERE mps_detail_id IN (${detailPlaceholders}) ORDER BY year, week_number
    `, detailIds) as any[];

    // 4. Get ALL unique BOM IDs, then load BOM details (raw materials)
    const bomIds = [...new Set(allDetails.map((d: any) => d.bom_id))];
    const bomPlaceholders = bomIds.map(() => '?').join(',');

    const allBomItems = await dbAll(`
      SELECT bd.bom_header_id, bd.raw_material_id, bd.quantity as qty_per_unit, bd.unit_of_measure_id,
        p.name as material_name, p.sku as material_sku,
        u.name as uom_name,
        pt.code as product_type_code
      FROM bom_details bd
      JOIN products p ON bd.raw_material_id = p.id
      LEFT JOIN uom u ON bd.unit_of_measure_id = u.id
      LEFT JOIN product_types pt ON p.product_type_id = pt.id
      WHERE bd.bom_header_id IN (${bomPlaceholders})
      ORDER BY bd.sequence ASC
    `, bomIds) as any[];

    // 5. Load saved standalone MRP data (mps_detail_id = 0 for global)
    const savedMrpData = await dbAll(`
      SELECT * FROM mrp_week_data WHERE mps_detail_id = 0
    `) as any[];

    // 6. Also load per-detail MRP data to aggregate
    const perDetailMrpData = await dbAll(`
      SELECT * FROM mrp_week_data WHERE mps_detail_id IN (${detailPlaceholders})
    `, detailIds) as any[];

    // 7. Aggregate gross requirements per unique raw material per week
    // Map: material_id -> { info, weekMap: { "wk-yr" -> gross_req } }
    const materialMap: Record<number, {
      material_id: number;
      material_name: string;
      material_sku: string;
      uom_name: string;
      product_type_code: string;
      weekGross: Record<string, number>;
    }> = {};

    for (const detail of allDetails) {
      const bomItems = allBomItems.filter((b: any) => b.bom_header_id === detail.bom_id);
      const detailWeeks = allMpsWeeks.filter((w: any) => w.mps_detail_id === detail.detail_id);

      for (const bom of bomItems) {
        const matId = bom.raw_material_id;
        const qtyPerUnit = Number(bom.qty_per_unit) || 0;

        if (!materialMap[matId]) {
          materialMap[matId] = {
            material_id: matId,
            material_name: bom.material_name,
            material_sku: bom.material_sku,
            uom_name: bom.uom_name,
            product_type_code: bom.product_type_code,
            weekGross: {}
          };
        }

        // For each week column, add this detail's contribution to gross requirements
        for (const wc of weekColumns) {
          const key = `${wc.week}-${wc.year}`;
          const mpsWeek = detailWeeks.find((w: any) => w.week_number === wc.week && w.year === wc.year);
          const fgQty = Number(mpsWeek?.fg_qty || 0);
          const grossReq = fgQty * qtyPerUnit;

          if (!materialMap[matId].weekGross[key]) {
            materialMap[matId].weekGross[key] = 0;
          }
          materialMap[matId].weekGross[key] += grossReq;
        }
      }
    }

    // 8. Build final materials array with weekly data
    const materials = Object.values(materialMap).map((mat) => {
      const weeks = weekColumns.map((wc) => {
        const key = `${wc.week}-${wc.year}`;
        const grossReq = mat.weekGross[key] || 0;

        // Check standalone saved data first (mps_detail_id=0), fallback to 0
        const savedWeek = savedMrpData.find(
          (m: any) => m.material_id === mat.material_id && m.week_number === wc.week && m.year === wc.year
        );

        const plannedReceipt = Number(savedWeek?.planned_order_receipt || 0);
        const plannedRelease = Number(savedWeek?.planned_order_release || 0);

        return {
          week_number: wc.week,
          year: wc.year,
          gross_requirements: Math.round(grossReq * 100) / 100,
          planned_order_receipt: plannedReceipt,
          planned_order_release: plannedRelease
        };
      });

      return {
        material_id: mat.material_id,
        material_name: mat.material_name,
        material_sku: mat.material_sku,
        uom_name: mat.uom_name,
        product_type_code: mat.product_type_code,
        lead_time: 2,
        first_stock: 0,
        order_quantity: 0,
        weeks
      };
    });

    res.json({ data: { materials, weekColumns } });
  } catch (error) {
    console.error('Error fetching standalone MRP:', error);
    res.status(500).json({ error: 'Failed to fetch standalone MRP data' });
  }
});

// PUT /mrp - Save standalone MRP planned_order_release & planned_order_receipt (global, mps_detail_id=0)
router.put('/mrp', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { entries } = req.body; // [{ material_id, week_number, year, planned_order_receipt, planned_order_release }]

    for (const entry of (entries || [])) {
      const existing = await dbGet(
        'SELECT id FROM mrp_week_data WHERE mps_detail_id = 0 AND material_id = ? AND year = ? AND week_number = ?',
        [entry.material_id, entry.year, entry.week_number]
      );

      if (existing) {
        await dbRun(
          'UPDATE mrp_week_data SET planned_order_receipt = ?, planned_order_release = ? WHERE mps_detail_id = 0 AND material_id = ? AND year = ? AND week_number = ?',
          [entry.planned_order_receipt || 0, entry.planned_order_release || 0, entry.material_id, entry.year, entry.week_number]
        );
      } else {
        await dbRun(
          'INSERT INTO mrp_week_data (mps_detail_id, material_id, week_number, year, planned_order_receipt, planned_order_release) VALUES (0, ?, ?, ?, ?, ?)',
          [entry.material_id, entry.week_number, entry.year, entry.planned_order_receipt || 0, entry.planned_order_release || 0]
        );
      }
    }

    res.json({ message: 'Standalone MRP data saved' });
  } catch (error) {
    console.error('Error saving standalone MRP:', error);
    res.status(500).json({ error: 'Failed to save standalone MRP data' });
  }
});

export default router;
