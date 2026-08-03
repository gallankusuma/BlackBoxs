import express, { Request, Response } from 'express';
import { dbGet, dbAll, dbRun } from '../config/database';
import { authMiddleware } from '../middleware/auth';

const router = express.Router();

// ===== AUDIT LOG ENDPOINTS =====

router.get('/', authMiddleware, async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = (page - 1) * limit;

    const logs = await dbAll(
      `SELECT al.*, u.username
       FROM audit_log al
       LEFT JOIN users u ON al.user_id = u.id
       ORDER BY al.created_at DESC
       LIMIT ${limit} OFFSET ${offset}`,
      []
    );

    const totalResult = await dbGet('SELECT COUNT(*) as count FROM audit_log');
    const totalCount = (totalResult as any).count || 0;

    res.json({
      data: logs,
      pagination: {
        page,
        limit,
        total: totalCount,
        pages: Math.ceil(totalCount / limit),
      },
    });
  } catch (error) {
    console.error('Error fetching audit logs:', error);
    res.status(500).json({ error: 'Failed to fetch audit logs' });
  }
});

router.get('/entity/:entityType/:entityId', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { entityType, entityId } = req.params;

    const logs = await dbAll(
      `SELECT al.*, u.username
       FROM audit_log al
       LEFT JOIN users u ON al.user_id = u.id
       WHERE al.entity_type = ? AND al.entity_id = ?
       ORDER BY al.created_at DESC`,
      [entityType, entityId]
    );

    res.json({ data: logs });
  } catch (error) {
    console.error('Error fetching entity audit logs:', error);
    res.status(500).json({ error: 'Failed to fetch entity audit logs' });
  }
});

router.post('/', authMiddleware, async (req: Request, res: Response) => {
  try {
    const {
      action,
      entity_type,
      entity_id,
      old_values,
      new_values,
      ip_address,
    } = req.body;

    if (!action || !entity_type) {
      return res
        .status(400)
        .json({
          error: 'action and entity_type are required',
        });
    }

    const user_id = (req as any).user?.userId;
    const result = await dbRun(
      `INSERT INTO audit_log (user_id, action, entity_type, entity_id, old_values, new_values, ip_address)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        user_id,
        action,
        entity_type,
        entity_id || null,
        JSON.stringify(old_values) || null,
        JSON.stringify(new_values) || null,
        ip_address || null,
      ]
    );

    res.status(201).json({
      message: 'Audit log created',
      data: { id: result.insertId },
    });
  } catch (error) {
    console.error('Error creating audit log:', error);
    res.status(500).json({ error: 'Failed to create audit log' });
  }
});

router.get('/search', authMiddleware, async (req: Request, res: Response) => {
  try {
    const {
      user_id,
      entity_type,
      action,
      start_date,
      end_date,
      page = 1,
      limit = 50,
    } = req.query;

    let query = 'SELECT al.*, u.username FROM audit_log al LEFT JOIN users u ON al.user_id = u.id WHERE 1=1';
    const params: any[] = [];

    if (user_id) {
      query += ' AND al.user_id = ?';
      params.push(user_id);
    }

    if (entity_type) {
      query += ' AND al.entity_type = ?';
      params.push(entity_type);
    }

    if (action) {
      query += ' AND al.action = ?';
      params.push(action);
    }

    if (start_date) {
      query += ' AND al.created_at >= ?';
      params.push(start_date);
    }

    if (end_date) {
      query += ' AND al.created_at <= ?';
      params.push(end_date);
    }

    const pageNum = parseInt(page as string) || 1;
    const limitNum = parseInt(limit as string) || 50;
    const offset = (pageNum - 1) * limitNum;

    query += ` ORDER BY al.created_at DESC LIMIT ${limitNum} OFFSET ${offset}`;

    const logs = await dbAll(query, params);

    // Get total count
    let countQuery = 'SELECT COUNT(*) as count FROM audit_log al WHERE 1=1';
    const countParams: any[] = [];

    if (user_id) {
      countQuery += ' AND al.user_id = ?';
      countParams.push(user_id);
    }
    if (entity_type) {
      countQuery += ' AND al.entity_type = ?';
      countParams.push(entity_type);
    }
    if (action) {
      countQuery += ' AND al.action = ?';
      countParams.push(action);
    }
    if (start_date) {
      countQuery += ' AND al.created_at >= ?';
      countParams.push(start_date);
    }
    if (end_date) {
      countQuery += ' AND al.created_at <= ?';
      countParams.push(end_date);
    }

    const totalResult = await dbGet(countQuery, countParams);
    const totalCount = (totalResult as any).count || 0;

    res.json({
      data: logs,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: totalCount,
        pages: Math.ceil(totalCount / limitNum),
      },
    });
  } catch (error) {
    console.error('Error searching audit logs:', error);
    res.status(500).json({ error: 'Failed to search audit logs' });
  }
});

router.get('/user/:userId', authMiddleware, async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = (page - 1) * limit;

    const logs = await dbAll(
      `SELECT al.*, u.username
       FROM audit_log al
       LEFT JOIN users u ON al.user_id = u.id
       WHERE al.user_id = ?
       ORDER BY al.created_at DESC
       LIMIT ${limit} OFFSET ${offset}`,
      [req.params.userId]
    );

    const totalResult = await dbGet(
      'SELECT COUNT(*) as count FROM audit_log WHERE user_id = ?',
      [req.params.userId]
    );
    const totalCount = (totalResult as any).count || 0;

    res.json({
      data: logs,
      pagination: {
        page,
        limit,
        total: totalCount,
        pages: Math.ceil(totalCount / limit),
      },
    });
  } catch (error) {
    console.error('Error fetching user audit logs:', error);
    res.status(500).json({ error: 'Failed to fetch user audit logs' });
  }
});

router.delete('/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const log = await dbGet('SELECT * FROM audit_log WHERE id = ?', [req.params.id]);

    if (!log) {
      return res.status(404).json({ error: 'Audit log not found' });
    }

    await dbRun('DELETE FROM audit_log WHERE id = ?', [req.params.id]);

    res.json({ message: 'Audit log deleted' });
  } catch (error) {
    console.error('Error deleting audit log:', error);
    res.status(500).json({ error: 'Failed to delete audit log' });
  }
});

export default router;
