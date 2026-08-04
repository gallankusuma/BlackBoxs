import express, { Request, Response } from 'express';
import { dbQuery, dbGet, dbAll, dbRun } from '../config/database';
import { authMiddleware } from '../middleware/auth';

const router = express.Router();

// Tabel crm_notes dibuat di config/database.ts (ensureRouteModuleSchema)

// GET / — list notes
router.get('/', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { search, category, linked_type, pinned } = req.query;
    let where = '1=1';
    const params: any[] = [];

    if (search) {
      where += ` AND (n.title LIKE ? OR n.content LIKE ?)`;
      params.push(`%${search}%`, `%${search}%`);
    }
    if (category) { where += ` AND n.category = ?`; params.push(category); }
    if (linked_type) { where += ` AND n.linked_type = ?`; params.push(linked_type); }
    if (pinned === '1') { where += ` AND n.is_pinned = 1`; }

    const rows = await dbAll(`
      SELECT n.*, u.full_name as author_name
      FROM crm_notes n LEFT JOIN users u ON n.created_by = u.id
      WHERE ${where}
      ORDER BY n.is_pinned DESC, n.updated_at DESC
    `, params);

    res.json({ data: rows });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST /
router.post('/', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { title, content, color, category, linked_type, linked_id, linked_name } = req.body;
    if (!content) return res.status(400).json({ error: 'Content is required' });
    const userId = (req as any).userId ?? null;

    const result = await dbRun(`
      INSERT INTO crm_notes (title, content, color, category, linked_type, linked_id, linked_name, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [title||null, content, color||'yellow', category||'general',
        linked_type||null, linked_id||null, linked_name||null, userId]);

    res.status(201).json({ data: { id: result.insertId }, message: 'Note created' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// PUT /:id
router.put('/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { title, content, color, category, is_pinned, linked_type, linked_id, linked_name } = req.body;
    await dbRun(`
      UPDATE crm_notes SET title=?, content=?, color=?, category=?, is_pinned=?,
        linked_type=?, linked_id=?, linked_name=?
      WHERE id = ?
    `, [title, content, color, category, is_pinned ? 1 : 0,
        linked_type||null, linked_id||null, linked_name||null, req.params.id]);
    res.json({ message: 'Note updated' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// PATCH /:id/pin — toggle pin
router.patch('/:id/pin', authMiddleware, async (req: Request, res: Response) => {
  try {
    await dbRun(`UPDATE crm_notes SET is_pinned = NOT is_pinned WHERE id = ?`, [req.params.id]);
    res.json({ message: 'Pin toggled' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE /:id
router.delete('/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    await dbRun('DELETE FROM crm_notes WHERE id = ?', [req.params.id]);
    res.json({ message: 'Note deleted' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
