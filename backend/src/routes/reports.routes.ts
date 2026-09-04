import { Router, Request, Response } from 'express';
import { dbAll, dbGet, dbRun } from '../config/database';
import { authMiddleware } from '../middleware/auth';

const router = Router();

// ─── PRODUCTION REPORTS ─────────────────────────────────

router.get('/production', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { from_date, to_date } = req.query;
    let dateFilter = '';
    const params: any[] = [];
    if (from_date) { dateFilter += ' AND wo.created_at >= ?'; params.push(from_date); }
    if (to_date) { dateFilter += ' AND wo.created_at <= ?'; params.push(to_date); }

    const summary = await dbGet(`
      SELECT
        COUNT(*) AS total_wo,
        SUM(CASE WHEN wo.status = 'completed' THEN 1 ELSE 0 END) AS completed,
        SUM(CASE WHEN wo.status = 'in_progress' THEN 1 ELSE 0 END) AS in_progress,
        SUM(CASE WHEN wo.status = 'pending' THEN 1 ELSE 0 END) AS pending,
        SUM(COALESCE(wo.quantity, 0)) AS total_planned_qty,
        SUM(COALESCE(wo.completed_quantity, 0)) AS total_completed_qty
      FROM work_orders wo
      WHERE 1=1 ${dateFilter}
    `, params);

    const byProduct = await dbAll(`
      SELECT p.name AS product_name, COUNT(wo.id) AS wo_count,
        SUM(COALESCE(wo.quantity, 0)) AS planned_qty,
        SUM(COALESCE(wo.completed_quantity, 0)) AS completed_qty
      FROM work_orders wo
      LEFT JOIN products p ON wo.product_id = p.id
      WHERE 1=1 ${dateFilter}
      GROUP BY wo.product_id, p.name
      ORDER BY wo_count DESC LIMIT 20
    `, params);

    const monthly = await dbAll(`
      SELECT DATE_FORMAT(wo.created_at, '%Y-%m') AS month,
        COUNT(*) AS total, SUM(CASE WHEN wo.status='completed' THEN 1 ELSE 0 END) AS completed
      FROM work_orders wo
      WHERE 1=1 ${dateFilter}
      GROUP BY month ORDER BY month DESC LIMIT 12
    `, params);

    res.json({ success: true, data: { summary, byProduct, monthly } });
  } catch (error) {
    console.error('Error fetching production report:', error);
    res.status(500).json({ error: 'Failed to fetch production report' });
  }
});

// ─── INVENTORY REPORTS ──────────────────────────────────

router.get('/inventory', authMiddleware, async (req: Request, res: Response) => {
  try {
    // SKEMA-RUTE-01: tabelnya `inventory_stocks`, bukan `inventory` — yang
    // terakhir tidak pernah ada (cacat yang sama dengan CABUT-STOCK-01).
    // `inventory_stocks` juga tidak punya `unit_cost`; nilai persediaan diambil
    // dari `products.standard_cost`, satu-satunya harga yang memang tersimpan.
    // Ambang stok minimum bernama `reorder_point`, bukan `minimum_stock`.
    const summary = await dbGet(`
      SELECT COUNT(DISTINCT i.product_id) AS total_products,
             COALESCE(SUM(i.quantity), 0) AS total_stock,
             COALESCE(SUM(i.quantity * COALESCE(p.standard_cost, 0)), 0) AS total_valuation
      FROM inventory_stocks i
      LEFT JOIN products p ON i.product_id = p.id
    `, []);

    const lowStock = await dbAll(`
      SELECT p.name, p.sku, i.quantity, p.reorder_point AS minimum_stock
      FROM inventory_stocks i
      JOIN products p ON i.product_id = p.id
      WHERE p.reorder_point > 0 AND i.quantity <= p.reorder_point
      ORDER BY (i.quantity / p.reorder_point) ASC LIMIT 20
    `, []);

    const byWarehouse = await dbAll(`
      SELECT w.name AS warehouse_name, COUNT(DISTINCT i.product_id) AS products,
             COALESCE(SUM(i.quantity), 0) AS total_qty,
             COALESCE(SUM(i.quantity * COALESCE(p.standard_cost, 0)), 0) AS valuation
      FROM inventory_stocks i
      LEFT JOIN warehouses w ON i.warehouse_id = w.id
      LEFT JOIN products p ON i.product_id = p.id
      GROUP BY i.warehouse_id, w.name
      ORDER BY valuation DESC
    `, []);

    const topItems = await dbAll(`
      SELECT p.name, p.sku, i.quantity,
             i.quantity * COALESCE(p.standard_cost, 0) AS value
      FROM inventory_stocks i
      JOIN products p ON i.product_id = p.id
      ORDER BY value DESC LIMIT 20
    `, []);

    res.json({ success: true, data: { summary, lowStock, byWarehouse, topItems } });
  } catch (error) {
    console.error('Error fetching inventory report:', error);
    res.status(500).json({ error: 'Failed to fetch inventory report' });
  }
});

// ─── PROCUREMENT REPORTS ────────────────────────────────

router.get('/procurement', authMiddleware, async (req: Request, res: Response) => {
  try {
    const summary = await dbGet(`
      SELECT
        COUNT(*) AS total_po,
        SUM(CASE WHEN status='approved' THEN 1 ELSE 0 END) AS approved,
        SUM(CASE WHEN status='pending' THEN 1 ELSE 0 END) AS pending,
        SUM(COALESCE(total_amount, 0)) AS total_spend
      FROM purchase_orders
    `, []);

    const byVendor = await dbAll(`
      SELECT v.name AS vendor_name, COUNT(po.id) AS po_count,
        SUM(COALESCE(po.total_amount, 0)) AS total_spend
      FROM purchase_orders po
      LEFT JOIN vendors v ON po.vendor_id = v.id
      GROUP BY po.vendor_id, v.name
      ORDER BY total_spend DESC LIMIT 15
    `, []);

    const prStats = await dbGet(`
      SELECT
        COUNT(*) AS total_pr,
        SUM(CASE WHEN approval_status = 2 THEN 1 ELSE 0 END) AS fully_approved,
        SUM(CASE WHEN approval_status = 0 THEN 1 ELSE 0 END) AS pending_approval
      FROM purchase_requests
    `, []);

    const monthly = await dbAll(`
      SELECT DATE_FORMAT(created_at, '%Y-%m') AS month, COUNT(*) AS po_count,
        SUM(COALESCE(total_amount, 0)) AS spend
      FROM purchase_orders
      GROUP BY month ORDER BY month DESC LIMIT 12
    `, []);

    res.json({ success: true, data: { summary, byVendor, prStats, monthly } });
  } catch (error) {
    console.error('Error fetching procurement report:', error);
    res.status(500).json({ error: 'Failed to fetch procurement report' });
  }
});

// ─── QC REPORTS ─────────────────────────────────────────

router.get('/qc', authMiddleware, async (req: Request, res: Response) => {
  try {
    const summary = await dbGet(`
      SELECT
        COUNT(*) AS total_results,
        SUM(CASE WHEN result_status='pass' THEN 1 ELSE 0 END) AS passed,
        SUM(CASE WHEN result_status='fail' THEN 1 ELSE 0 END) AS failed,
        SUM(CASE WHEN result_status='pending' OR result_status IS NULL THEN 1 ELSE 0 END) AS pending
      FROM qc_results
    `, []);

    const ncrSummary = await dbGet(`
      SELECT
        COUNT(*) AS total_ncr,
        SUM(CASE WHEN status='open' THEN 1 ELSE 0 END) AS open_ncr,
        SUM(CASE WHEN severity='critical' THEN 1 ELSE 0 END) AS critical,
        SUM(CASE WHEN severity='major' THEN 1 ELSE 0 END) AS major
      FROM qc_ncr
    `, []);

    const byTest = await dbAll(`
      SELECT t.name AS test_name,
        COUNT(r.id) AS total,
        SUM(CASE WHEN r.result_status='pass' THEN 1 ELSE 0 END) AS passed,
        SUM(CASE WHEN r.result_status='fail' THEN 1 ELSE 0 END) AS failed
      FROM qc_results r
      LEFT JOIN qc_tests t ON r.qc_test_id = t.id
      GROUP BY r.qc_test_id, t.name
      ORDER BY total DESC LIMIT 20
    `, []);

    // `qc_batch_release` tidak pernah ada. Status rilis batch memang disimpan
    // di `batches.status` — itu pula yang dibaca layar Batch Release di modul
    // quality (`FROM batches b JOIN products p ...`).
    const batchStats = await dbGet(`
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN status='released' THEN 1 ELSE 0 END) AS released,
        SUM(CASE WHEN status='on_hold' THEN 1 ELSE 0 END) AS on_hold,
        SUM(CASE WHEN status='rejected' THEN 1 ELSE 0 END) AS rejected
      FROM batches
    `, []);

    res.json({ success: true, data: { summary, ncrSummary, byTest, batchStats } });
  } catch (error) {
    console.error('Error fetching QC report:', error);
    res.status(500).json({ error: 'Failed to fetch QC report' });
  }
});

// ─── SALES REPORTS ──────────────────────────────────────

router.get('/sales', authMiddleware, async (req: Request, res: Response) => {
  try {
    const summary = await dbGet(`
      SELECT
        COUNT(*) AS total_so,
        SUM(CASE WHEN status='open' OR status='approved' THEN 1 ELSE 0 END) AS active,
        SUM(CASE WHEN status='completed' OR status='delivered' THEN 1 ELSE 0 END) AS completed,
        SUM(COALESCE(total_amount, 0)) AS total_revenue
      FROM sales_orders
    `, []);

    const byCustomer = await dbAll(`
      SELECT c.name AS customer_name, COUNT(so.id) AS order_count,
        SUM(COALESCE(so.total_amount, 0)) AS revenue
      FROM sales_orders so
      LEFT JOIN customers c ON so.customer_id = c.id
      GROUP BY so.customer_id, c.name
      ORDER BY revenue DESC LIMIT 15
    `, []);

    const monthly = await dbAll(`
      SELECT DATE_FORMAT(created_at, '%Y-%m') AS month, COUNT(*) AS orders,
        SUM(COALESCE(total_amount, 0)) AS revenue
      FROM sales_orders
      GROUP BY month ORDER BY month DESC LIMIT 12
    `, []);

    const deliveryStats = await dbGet(`
      SELECT
        COUNT(*) AS total_do,
        SUM(CASE WHEN status='delivered' THEN 1 ELSE 0 END) AS delivered,
        SUM(CASE WHEN status='shipped' THEN 1 ELSE 0 END) AS shipped,
        SUM(CASE WHEN status='pending' OR status='draft' THEN 1 ELSE 0 END) AS pending
      FROM deliveries
    `, []);

    res.json({ success: true, data: { summary, byCustomer, monthly, deliveryStats } });
  } catch (error) {
    console.error('Error fetching sales report:', error);
    res.status(500).json({ error: 'Failed to fetch sales report' });
  }
});

// ─── FINANCE REPORTS ────────────────────────────────────

router.get('/finance', authMiddleware, async (req: Request, res: Response) => {
  try {
    // SKEMA-RUTE-01: tabelnya `cogs_tracking` dan `profitability_tracking`;
    // `cogs` dan `profitability` tidak pernah ada. Nama kolomnya ikut berbeda
    // (raw_material_cost/total_cogs, cogs/margin_percentage) dan di-alias ke
    // nama lama supaya bentuk respons yang dibaca layar tidak berubah.
    const cogsSum = await dbGet(`
      SELECT SUM(raw_material_cost) AS material, SUM(labor_cost) AS labor,
             SUM(overhead_cost) AS overhead, SUM(total_cogs) AS total
      FROM cogs_tracking
    `, []);

    const apSummary = await dbGet(`
      SELECT COUNT(*) AS total, SUM(amount) AS total_amount,
        SUM(CASE WHEN status='unpaid' THEN amount ELSE 0 END) AS unpaid,
        SUM(CASE WHEN status='paid' THEN amount ELSE 0 END) AS paid
      FROM accounts_payable
    `, []);

    const arSummary = await dbGet(`
      SELECT COUNT(*) AS total, SUM(amount) AS total_amount,
        SUM(CASE WHEN status='unpaid' THEN amount ELSE 0 END) AS outstanding,
        SUM(CASE WHEN status='paid' THEN amount ELSE 0 END) AS collected
      FROM accounts_receivable
    `, []);

    const profitability = await dbAll(`
      SELECT p.name AS product_name, pr.revenue,
             pr.cogs AS total_cost, pr.margin_percentage AS profit_margin
      FROM profitability_tracking pr
      LEFT JOIN products p ON pr.product_id = p.id
      ORDER BY pr.margin_percentage DESC LIMIT 15
    `, []);

    res.json({ success: true, data: { cogsSum, apSummary, arSummary, profitability } });
  } catch (error) {
    console.error('Error fetching finance report:', error);
    res.status(500).json({ error: 'Failed to fetch finance report' });
  }
});

export default router;
