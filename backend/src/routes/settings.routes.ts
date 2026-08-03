import express, { Request, Response } from 'express';
import { dbGet, dbAll, dbRun } from '../config/database';
import { authMiddleware } from '../middleware/auth';

const router = express.Router();

// ===== SYSTEM SETTINGS ENDPOINTS =====

router.get('/all', authMiddleware, async (req: Request, res: Response) => {
  try {
    const settings = await dbAll(
      'SELECT * FROM system_settings ORDER BY category, setting_key ASC'
    );
    res.json({ data: settings });
  } catch (error) {
    console.error('Error fetching settings:', error);
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

router.get('/category/:category', authMiddleware, async (req: Request, res: Response) => {
  try {
    const settings = await dbAll(
      'SELECT * FROM system_settings WHERE category = ? ORDER BY setting_key ASC',
      [req.params.category]
    );
    res.json({ data: settings });
  } catch (error) {
    console.error('Error fetching category settings:', error);
    res.status(500).json({ error: 'Failed to fetch category settings' });
  }
});

router.get('/:key', authMiddleware, async (req: Request, res: Response) => {
  try {
    const setting = await dbGet(
      'SELECT * FROM system_settings WHERE setting_key = ?',
      [req.params.key]
    );
    if (!setting) {
      return res.status(404).json({ error: 'Setting not found' });
    }
    res.json({ data: setting });
  } catch (error) {
    console.error('Error fetching setting:', error);
    res.status(500).json({ error: 'Failed to fetch setting' });
  }
});

router.post('/', authMiddleware, async (req: Request, res: Response) => {
  try {
    const {
      setting_key,
      setting_value,
      category,
      description,
      data_type,
    } = req.body;

    if (!setting_key || setting_value === undefined) {
      return res
        .status(400)
        .json({ error: 'setting_key and setting_value are required' });
    }

    const result = await dbRun(
      `INSERT INTO system_settings (setting_key, setting_value, category, description, data_type)
       VALUES (?, ?, ?, ?, ?)`,
      [
        setting_key,
        setting_value,
        category || 'general',
        description || null,
        data_type || 'string',
      ]
    );

    res.status(201).json({
      message: 'Setting created',
      data: { id: result.insertId },
    });
  } catch (error) {
    console.error('Error creating setting:', error);
    res.status(500).json({ error: 'Failed to create setting' });
  }
});

router.put('/:key', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { setting_value } = req.body;

    if (setting_value === undefined) {
      return res.status(400).json({ error: 'setting_value is required' });
    }

    const setting = await dbGet(
      'SELECT * FROM system_settings WHERE setting_key = ?',
      [req.params.key]
    );

    if (!setting) {
      return res.status(404).json({ error: 'Setting not found' });
    }

    await dbRun(
      'UPDATE system_settings SET setting_value = ? WHERE setting_key = ?',
      [setting_value, req.params.key]
    );

    res.json({ message: 'Setting updated' });
  } catch (error) {
    console.error('Error updating setting:', error);
    res.status(500).json({ error: 'Failed to update setting' });
  }
});

// ===== KPI DASHBOARD ENDPOINTS =====

router.get('/dashboard/overview', authMiddleware, async (req: Request, res: Response) => {
  try {
    // Production KPI
    const production = await dbGet(
      `SELECT 
       COUNT(*) as total_orders,
       SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
       SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) as in_progress,
       SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending
       FROM work_orders`
    );

    // Inventory KPI
    const inventory = await dbGet(
      `SELECT 
       COUNT(*) as total_items,
       SUM(CASE WHEN quantity < reorder_point THEN 1 ELSE 0 END) as low_stock_count
       FROM inventory_stocks`
    );

    // Sales KPI
    const sales = await dbGet(
      `SELECT 
       COUNT(*) as total_orders,
       SUM(total_amount) as total_revenue,
       COUNT(DISTINCT customer_id) as unique_customers
       FROM sales_orders WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)`
    );

    // Finance KPI
    const finance = await dbGet(
      `SELECT 
       SUM(revenue) as total_revenue,
       SUM(cogs) as total_cogs,
       SUM(gross_profit) as total_profit
       FROM financial_summary WHERE period_date >= DATE_SUB(NOW(), INTERVAL 30 DAY)`
    );

    // Outstanding Approvals
    const approvals = await dbGet(
      `SELECT COUNT(*) as count FROM sales_orders WHERE status = 'DRAFT'`
    );

    res.json({
      data: {
        production,
        inventory,
        sales,
        finance,
        approvals,
      },
    });
  } catch (error) {
    console.error('Error fetching dashboard overview:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard overview' });
  }
});

router.get('/dashboard/production', authMiddleware, async (req: Request, res: Response) => {
  try {
    const data = await dbAll(
      `SELECT 
       DATE(created_at) as date,
       COUNT(*) as total_orders,
       SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed
       FROM work_orders
       WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
       GROUP BY DATE(created_at)
       ORDER BY date DESC`
    );

    res.json({ data });
  } catch (error) {
    console.error('Error fetching production KPI:', error);
    res.status(500).json({ error: 'Failed to fetch production KPI' });
  }
});

router.get('/dashboard/inventory', authMiddleware, async (req: Request, res: Response) => {
  try {
    const data = await dbAll(
      `SELECT 
       product_id,
       SUM(quantity) as total_quantity,
       COUNT(*) as warehouse_count
       FROM inventory_stocks
       GROUP BY product_id
       ORDER BY total_quantity ASC
       LIMIT 20`
    );

    res.json({ data });
  } catch (error) {
    console.error('Error fetching inventory KPI:', error);
    res.status(500).json({ error: 'Failed to fetch inventory KPI' });
  }
});

router.get('/dashboard/sales', authMiddleware, async (req: Request, res: Response) => {
  try {
    const data = await dbAll(
      `SELECT 
       DATE(so_date) as date,
       COUNT(*) as order_count,
       SUM(total_amount) as daily_revenue
       FROM sales_orders
       WHERE so_date >= DATE_SUB(NOW(), INTERVAL 30 DAY)
       GROUP BY DATE(so_date)
       ORDER BY date DESC`
    );

    res.json({ data });
  } catch (error) {
    console.error('Error fetching sales KPI:', error);
    res.status(500).json({ error: 'Failed to fetch sales KPI' });
  }
});

router.get('/dashboard/finance', authMiddleware, async (req: Request, res: Response) => {
  try {
    const data = await dbAll(
      `SELECT 
       period_date,
       revenue,
       cogs,
       gross_profit,
       (gross_profit / revenue * 100) as profit_margin_pct
       FROM financial_summary
       WHERE period_date >= DATE_SUB(NOW(), INTERVAL 12 MONTH)
       ORDER BY period_date DESC`
    );

    res.json({ data });
  } catch (error) {
    console.error('Error fetching finance KPI:', error);
    res.status(500).json({ error: 'Failed to fetch finance KPI' });
  }
});

export default router;
