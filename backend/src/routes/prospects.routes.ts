import express, { Request, Response } from 'express';
import { dbQuery, dbGet, dbAll, dbRun } from '../config/database';
import { authMiddleware } from '../middleware/auth';

const router = express.Router();

// Tabel prospects dibuat di config/database.ts (ensureRouteModuleSchema)

// ── Helper: generate next prospect code ──
const generateProspectCode = async (): Promise<string> => {
  const row = await dbGet(
    `SELECT code FROM prospects WHERE code LIKE 'PSP-%' ORDER BY id DESC LIMIT 1`
  );
  if (!row) return 'PSP-0001';
  const lastNum = parseInt(row.code.replace('PSP-', ''), 10);
  return `PSP-${String(lastNum + 1).padStart(4, '0')}`;
};

// ── GET / — List with filters ──
router.get('/', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { search, temperature, status, source, assigned_to,
      sort_by = 'created_at', sort_dir = 'DESC',
      page = '1', limit = '25' } = req.query;

    let where = '1=1';
    const params: any[] = [];

    if (search) {
      where += ` AND (p.company_name LIKE ? OR p.contact_name LIKE ? OR p.email LIKE ? OR p.code LIKE ?)`;
      const s = `%${search}%`;
      params.push(s, s, s, s);
    }
    if (temperature) { where += ` AND p.temperature = ?`; params.push(temperature); }
    if (status) { where += ` AND p.status = ?`; params.push(status); }
    if (source) { where += ` AND p.source = ?`; params.push(source); }
    if (assigned_to) { where += ` AND p.assigned_to = ?`; params.push(assigned_to); }

    const countRow = await dbGet(`SELECT COUNT(*) as total FROM prospects p WHERE ${where}`, params);
    const total = countRow?.total || 0;

    const validSorts = ['created_at', 'updated_at', 'company_name', 'temperature', 'status', 'estimated_value', 'next_follow_up'];
    const sortCol = validSorts.includes(sort_by as string) ? sort_by : 'created_at';
    const sortDirection = (sort_dir as string).toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    const pageNum = Math.max(1, parseInt(page as string, 10));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit as string, 10)));
    const offset = (pageNum - 1) * limitNum;

    const rows = await dbAll(`
      SELECT p.*, u.full_name as assigned_to_name, cb.full_name as created_by_name
      FROM prospects p
      LEFT JOIN users u ON p.assigned_to = u.id
      LEFT JOIN users cb ON p.created_by = cb.id
      WHERE ${where}
      ORDER BY p.${sortCol} ${sortDirection}
      LIMIT ${limitNum} OFFSET ${offset}
    `, params);

    res.json({
      data: rows,
      pagination: { total, page: pageNum, limit: limitNum, totalPages: Math.ceil(total / limitNum) }
    });
  } catch (error: any) {
    console.error('Error fetching prospects:', error);
    res.status(500).json({ error: error.message });
  }
});

// ── GET /stats ──
router.get('/stats', authMiddleware, async (_req: Request, res: Response) => {
  try {
    const tempStats = await dbAll(`
      SELECT temperature, COUNT(*) as count FROM prospects WHERE status NOT IN ('converted','disqualified') GROUP BY temperature
    `);
    const statusStats = await dbAll(`SELECT status, COUNT(*) as count FROM prospects GROUP BY status`);
    const summary = await dbGet(`
      SELECT SUM(estimated_value) as total_value, COUNT(*) as total_count,
        SUM(CASE WHEN status NOT IN ('converted','disqualified') THEN 1 ELSE 0 END) as active_count,
        SUM(CASE WHEN status = 'converted' THEN 1 ELSE 0 END) as converted_count,
        SUM(CASE WHEN next_follow_up <= CURDATE() AND status NOT IN ('converted','disqualified') THEN 1 ELSE 0 END) as overdue_followups
      FROM prospects
    `);
    res.json({ temperature: tempStats, status: statusStats, summary: summary || {} });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ── GET /:id ──
router.get('/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const row = await dbGet(`
      SELECT p.*, u.full_name as assigned_to_name, cb.full_name as created_by_name
      FROM prospects p LEFT JOIN users u ON p.assigned_to = u.id LEFT JOIN users cb ON p.created_by = cb.id
      WHERE p.id = ?
    `, [req.params.id]);
    if (!row) return res.status(404).json({ error: 'Prospect not found' });
    res.json({ data: row });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ── POST / ──
router.post('/', authMiddleware, async (req: Request, res: Response) => {
  try {
    const code = await generateProspectCode();
    const { company_name, contact_name, contact_title, email, phone, industry, website, address, city, country,
      source, temperature, status, interest, estimated_value, next_follow_up, assigned_to, notes } = req.body;

    if (!company_name) return res.status(400).json({ error: 'Company name is required' });
    const userId = (req as any).user?.id || null;

    const result = await dbRun(`
      INSERT INTO prospects (code, company_name, contact_name, contact_title, email, phone, industry, website,
        address, city, country, source, temperature, status, interest, estimated_value, next_follow_up, assigned_to, notes, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [code, company_name, contact_name||null, contact_title||null, email||null, phone||null,
        industry||null, website||null, address||null, city||null, country||'Indonesia',
        source||'other', temperature||'cold', status||'new', interest||null,
        estimated_value||0, next_follow_up||null, assigned_to||null, notes||null, userId]);

    res.status(201).json({ data: { id: result.insertId, code }, message: 'Prospect created' });
  } catch (error: any) {
    console.error('Error creating prospect:', error);
    res.status(500).json({ error: error.message });
  }
});

// ── PUT /:id ──
router.put('/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { company_name, contact_name, contact_title, email, phone, industry, website, address, city, country,
      source, temperature, status, interest, estimated_value, next_follow_up, assigned_to, notes } = req.body;

    await dbRun(`
      UPDATE prospects SET company_name=?, contact_name=?, contact_title=?, email=?, phone=?,
        industry=?, website=?, address=?, city=?, country=?, source=?, temperature=?, status=?,
        interest=?, estimated_value=?, next_follow_up=?, assigned_to=?, notes=?
      WHERE id = ?
    `, [company_name, contact_name, contact_title, email, phone, industry, website, address, city, country,
        source, temperature, status, interest, estimated_value, next_follow_up||null, assigned_to||null, notes, req.params.id]);

    res.json({ message: 'Prospect updated' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ── DELETE /:id ──
router.delete('/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    await dbRun('DELETE FROM prospects WHERE id = ?', [req.params.id]);
    res.json({ message: 'Prospect deleted' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ── POST /:id/convert-to-lead ──
router.post('/:id/convert-to-lead', authMiddleware, async (req: Request, res: Response) => {
  try {
    const prospect = await dbGet('SELECT * FROM prospects WHERE id = ?', [req.params.id]);
    if (!prospect) return res.status(404).json({ error: 'Prospect not found' });
    if (prospect.status === 'converted') return res.status(400).json({ error: 'Already converted' });

    await dbRun(`UPDATE prospects SET status = 'converted', converted_at = NOW() WHERE id = ?`, [req.params.id]);

    res.json({ message: 'Prospect converted', data: {
      company: prospect.company_name, contact_name: prospect.contact_name,
      email: prospect.email, phone: prospect.phone, value: prospect.estimated_value, source: prospect.source
    }});
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
