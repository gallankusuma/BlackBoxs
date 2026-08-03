import { Router, Request, Response } from 'express';
import { dbAll, dbRun, dbGet, dbQuery } from '../config/database';
import { authMiddleware } from '../middleware/auth';

const router = Router();

// ============================================
// AUTO-CREATE TABLE
// ============================================
const initInboxTable = async () => {
  await dbQuery(`
    CREATE TABLE IF NOT EXISTS inbox_notifications (
      id INT PRIMARY KEY AUTO_INCREMENT,
      user_id INT NOT NULL,
      type VARCHAR(50) NOT NULL DEFAULT 'system',
      title VARCHAR(255) NOT NULL,
      message TEXT,
      link VARCHAR(255),
      ref_id INT,
      ref_type VARCHAR(50),
      is_read TINYINT(1) DEFAULT 0,
      created_by INT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_user_read (user_id, is_read),
      INDEX idx_created (created_at),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
};
initInboxTable();

// ============================================
// GET /api/inbox - Get inbox for current user
// ============================================
router.get('/', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const items = await dbAll(`
      SELECT n.*, u.full_name as sender_name 
      FROM inbox_notifications n
      LEFT JOIN users u ON n.created_by = u.id
      WHERE n.user_id = ?
      ORDER BY n.created_at DESC
      LIMIT 50
    `, [userId]);
    res.json({ data: items });
  } catch (error) {
    console.error('Error fetching inbox:', error);
    res.status(500).json({ error: 'Failed to fetch inbox' });
  }
});

// ============================================
// GET /api/inbox/unread-count - Get unread count
// ============================================
router.get('/unread-count', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const result = await dbGet('SELECT COUNT(*) as count FROM inbox_notifications WHERE user_id = ? AND is_read = 0', [userId]);
    res.json({ count: result?.count || 0 });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get unread count' });
  }
});

// ============================================
// PUT /api/inbox/:id/read - Mark single as read
// ============================================
router.put('/:id/read', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    await dbRun('UPDATE inbox_notifications SET is_read = 1 WHERE id = ? AND user_id = ?', [req.params.id, userId]);
    res.json({ message: 'Marked as read' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to mark as read' });
  }
});

// ============================================
// PUT /api/inbox/read-all - Mark all as read
// ============================================
router.put('/read-all', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    await dbRun('UPDATE inbox_notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0', [userId]);
    res.json({ message: 'All marked as read' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to mark all as read' });
  }
});

// ============================================
// POST /api/inbox/send - Send notification to user(s) (internal use)
// ============================================
router.post('/send', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { user_ids, type, title, message, link, ref_id, ref_type } = req.body;
    const senderId = (req as any).userId;

    if (!user_ids || !Array.isArray(user_ids) || user_ids.length === 0) {
      return res.status(400).json({ error: 'user_ids array is required' });
    }
    if (!title) {
      return res.status(400).json({ error: 'title is required' });
    }

    for (const uid of user_ids) {
      await dbRun(
        `INSERT INTO inbox_notifications (user_id, type, title, message, link, ref_id, ref_type, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [uid, type || 'system', title, message || null, link || null, ref_id || null, ref_type || null, senderId]
      );
    }

    res.status(201).json({ message: `Notification sent to ${user_ids.length} user(s)` });
  } catch (error) {
    console.error('Error sending notification:', error);
    res.status(500).json({ error: 'Failed to send notification' });
  }
});

// ============================================
// DELETE /api/inbox/:id - Delete a notification
// ============================================
router.delete('/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    await dbRun('DELETE FROM inbox_notifications WHERE id = ? AND user_id = ?', [req.params.id, userId]);
    res.json({ message: 'Notification deleted' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete notification' });
  }
});

export default router;
