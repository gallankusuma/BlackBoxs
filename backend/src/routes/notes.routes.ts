import express, { Request, Response } from 'express';
import { dbQuery, dbGet, dbAll, dbRun } from '../config/database';

const router = express.Router();

const ensureNotesTable = async () => {
  try {
    await dbRun(`
      CREATE TABLE IF NOT EXISTS crm_notes (
        id INT PRIMARY KEY AUTO_INCREMENT,
        title VARCHAR(255),
        content TEXT NOT NULL,
        color VARCHAR(20) DEFAULT 'yellow',
        is_pinned TINYINT DEFAULT 0,
        category VARCHAR(50) DEFAULT 'general',
        linked_type VARCHAR(50),
        linked_id INT,
        linked_name VARCHAR(255),
        created_by INT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_category (category),
        INDEX idx_pinned (is_pinned),
        INDEX idx_linked (linked_type, linked_id),
        INDEX idx_created_by (created_by)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('✅ CRM Notes table ensured');
  } catch (err) {
    console.error('CRM Notes table error:', err);
  }
};
ensureNotesTable();

// GET / — list notes
router.get('/', async (req: Request, res: Response) => {
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
router.post('/', async (req: Request, res: Response) => {
  try {
    const { title, content, color, category, linked_type, linked_id, linked_name } = req.body;
    if (!content) return res.status(400).json({ error: 'Content is required' });
    const userId = (req as any).user?.id || null;

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
router.put('/:id', async (req: Request, res: Response) => {
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
router.patch('/:id/pin', async (req: Request, res: Response) => {
  try {
    await dbRun(`UPDATE crm_notes SET is_pinned = NOT is_pinned WHERE id = ?`, [req.params.id]);
    res.json({ message: 'Pin toggled' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE /:id
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    await dbRun('DELETE FROM crm_notes WHERE id = ?', [req.params.id]);
    res.json({ message: 'Note deleted' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
