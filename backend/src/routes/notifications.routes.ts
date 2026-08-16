import express, { Request, Response } from 'express';
import { dbQuery, dbGet, dbAll, dbRun } from '../config/database';
import { authMiddleware } from '../middleware/auth';

const router = express.Router();

// ===== NOTIFICATIONS ENDPOINTS =====

router.get('/', authMiddleware, async (req: Request, res: Response) => {
  try {
    const user_id = (req as any).user?.userId;
    if (!user_id) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = (page - 1) * limit;
    const unread_only = req.query.unread === 'true';

    let query = `SELECT * FROM notifications WHERE recipient_id = ?`;
    const params: any[] = [user_id];

    if (unread_only) {
      query += ' AND is_read = 0';
    }

    query += ` ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`;

    const notifications = await dbAll(query, params);

    const countQuery = unread_only
      ? 'SELECT COUNT(*) as count FROM notifications WHERE recipient_id = ? AND is_read = 0'
      : 'SELECT COUNT(*) as count FROM notifications WHERE recipient_id = ?';
    const countParams = unread_only ? [user_id] : [user_id];
    const countResult = await dbGet(countQuery, countParams);
    const totalCount = (countResult as any).count || 0;

    res.json({
      data: notifications,
      pagination: {
        page,
        limit,
        total: totalCount,
        pages: Math.ceil(totalCount / limit),
      },
    });
  } catch (error) {
    console.error('Error fetching notifications:', error);
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
});

router.get('/unread-count', authMiddleware, async (req: Request, res: Response) => {
  try {
    const user_id = (req as any).user?.userId;
    if (!user_id) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const result = await dbGet(
      'SELECT COUNT(*) as count FROM notifications WHERE recipient_id = ? AND is_read = 0',
      [user_id]
    );

    res.json({ unread_count: (result as any).count || 0 });
  } catch (error) {
    console.error('Error fetching unread count:', error);
    res.status(500).json({ error: 'Failed to fetch unread count' });
  }
});

router.post('/', authMiddleware, async (req: Request, res: Response) => {
  try {
    // Pengirim SELALU dari token; menerimanya dari body membuat siapa pun bisa
    // mengirim notifikasi atas nama orang lain.
    const sender_id = (req as any).userId;
    const {
      recipient_id,
      title,
      message,
      type,
      related_entity_type,
      related_entity_id,
      action_url,
    } = req.body;

    if (!recipient_id || !message || !type) {
      return res
        .status(400)
        .json({
          error: 'recipient_id, message, and type are required',
        });
    }

    const result = await dbRun(
      `INSERT INTO notifications (recipient_id, sender_id, title, message, type, 
       related_entity_type, related_entity_id, action_url, is_read)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)`,
      [
        recipient_id,
        sender_id || null,
        title || null,
        message,
        type,
        related_entity_type || null,
        related_entity_id || null,
        action_url || null,
      ]
    );

    res.status(201).json({
      message: 'Notification created',
      data: { id: result.insertId },
    });
  } catch (error) {
    console.error('Error creating notification:', error);
    res.status(500).json({ error: 'Failed to create notification' });
  }
});

// DR-P2-02: `recipient_id` dari TOKEN wajib ikut di setiap pembacaan dan mutasi.
// Sebelumnya seluruh aksi per-ID hanya memakai id dari klien, jadi siapa pun
// yang menebak nomor bisa menandai terbaca atau menghapus notifikasi orang lain.
router.put('/:id/read', authMiddleware, async (req: Request, res: Response) => {
  try {
    const notification = await dbGet(
      'SELECT * FROM notifications WHERE id = ? AND recipient_id = ?',
      [req.params.id, (req as any).userId]
    );

    if (!notification) {
      return res.status(404).json({ error: 'Notification not found' });
    }

    await dbRun('UPDATE notifications SET is_read = 1, read_at = NOW() WHERE id = ? AND recipient_id = ?', [
      req.params.id, (req as any).userId,
    ]);

    res.json({ message: 'Notification marked as read' });
  } catch (error) {
    console.error('Error marking notification as read:', error);
    res.status(500).json({ error: 'Failed to mark notification as read' });
  }
});

router.put('/:id/unread', authMiddleware, async (req: Request, res: Response) => {
  try {
    const notification = await dbGet(
      'SELECT * FROM notifications WHERE id = ? AND recipient_id = ?',
      [req.params.id, (req as any).userId]
    );

    if (!notification) {
      return res.status(404).json({ error: 'Notification not found' });
    }

    await dbRun('UPDATE notifications SET is_read = 0, read_at = NULL WHERE id = ?', [
      req.params.id,
    ]);

    res.json({ message: 'Notification marked as unread' });
  } catch (error) {
    console.error('Error marking notification as unread:', error);
    res.status(500).json({ error: 'Failed to mark notification as unread' });
  }
});

router.post('/mark-all-read', authMiddleware, async (req: Request, res: Response) => {
  try {
    const user_id = (req as any).user?.userId;
    if (!user_id) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    await dbRun(
      'UPDATE notifications SET is_read = 1, read_at = NOW() WHERE recipient_id = ? AND is_read = 0',
      [user_id]
    );

    res.json({ message: 'All notifications marked as read' });
  } catch (error) {
    console.error('Error marking all notifications as read:', error);
    res.status(500).json({ error: 'Failed to mark all notifications as read' });
  }
});

router.delete('/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const notification = await dbGet(
      'SELECT * FROM notifications WHERE id = ? AND recipient_id = ?',
      [req.params.id, (req as any).userId]
    );

    if (!notification) {
      return res.status(404).json({ error: 'Notification not found' });
    }

    await dbRun('DELETE FROM notifications WHERE id = ? AND recipient_id = ?',
      [req.params.id, (req as any).userId]);

    res.json({ message: 'Notification deleted' });
  } catch (error) {
    console.error('Error deleting notification:', error);
    res.status(500).json({ error: 'Failed to delete notification' });
  }
});

router.post('/bulk-action', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { ids, action } = req.body;

    if (!ids || !Array.isArray(ids) || !action) {
      return res.status(400).json({ error: 'ids (array) and action are required' });
    }

    // Bulk: ID milik user lain diabaikan diam-diam lewat predicate pemilik —
    // bukan ditolak seluruhnya, supaya "tandai semua terbaca" tetap bekerja.
    if (action === 'read') {
      const placeholders = ids.map(() => '?').join(',');
      await dbRun(
        `UPDATE notifications SET is_read = 1, read_at = NOW() WHERE id IN (${placeholders}) AND recipient_id = ?`,
        [...ids, (req as any).userId]
      );
      res.json({ message: 'Notifications marked as read' });
    } else if (action === 'delete') {
      const placeholders = ids.map(() => '?').join(',');
      await dbRun(`DELETE FROM notifications WHERE id IN (${placeholders}) AND recipient_id = ?`,
        [...ids, (req as any).userId]);
      res.json({ message: 'Notifications deleted' });
    } else {
      res.status(400).json({ error: 'Invalid action. Use read or delete.' });
    }
  } catch (error) {
    console.error('Error performing bulk action:', error);
    res.status(500).json({ error: 'Failed to perform bulk action' });
  }
});

export default router;
