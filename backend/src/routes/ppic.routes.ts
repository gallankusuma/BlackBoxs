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

/**
 * CABUT-QC-PPIC-01: 15 endpoint MPS/MRP dicabut — semuanya berdiri di atas
 * tabel yang tidak pernah ada (mps_headers, mps_details, mps_week_data,
 * mrp_week_data), dan tidak ada satu pun layar, route, atau menu yang
 * memanggilnya. Tiga endpoint di atas SENGAJA DIBIARKAN: /items dan /boms
 * membaca products dan bom_headers yang memang ada dan bekerja.
 */
export default router;
