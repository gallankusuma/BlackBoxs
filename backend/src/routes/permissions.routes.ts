import express, { Request, Response } from 'express';
import { dbAll, dbGet, dbRun } from '../config/database';
import { authMiddleware } from '../middleware/auth';

const router = express.Router();

// GET /permissions - Get all permissions
router.get('/', authMiddleware, async (req: Request, res: Response) => {
  try {
    const permissions = await dbAll(
      'SELECT id, resource, action, module, name, description FROM permissions ORDER BY module, action',
      []
    );
    res.json({ success: true, data: permissions });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /permissions/grouped - Get permissions grouped by module
router.get('/grouped', authMiddleware, async (req: Request, res: Response) => {
  try {
    const permissions = await dbAll(
      'SELECT id, resource, action, module, name, description FROM permissions ORDER BY module, FIELD(action, "view","create","edit","delete","approve","export")',
      []
    ) as any[];

    // Group by module
    const grouped: Record<string, any[]> = {};
    for (const p of permissions) {
      const mod = p.module || p.resource;
      if (!grouped[mod]) grouped[mod] = [];
      grouped[mod].push(p);
    }

    res.json({ success: true, data: grouped });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /permissions/:id - Get permission by ID
router.get('/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const permission = await dbGet('SELECT * FROM permissions WHERE id = ?', [req.params.id]);
    if (!permission) {
      return res.status(404).json({ success: false, error: 'Permission not found' });
    }
    res.json({ success: true, data: permission });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /permissions - Create new permission
router.post('/', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { resource, action, module, name, description } = req.body;
    if (!resource || !action || !module) {
      return res.status(400).json({ success: false, error: 'resource, action, and module are required' });
    }
    const result = await dbRun(
      'INSERT INTO permissions (resource, action, module, name, description) VALUES (?, ?, ?, ?, ?)',
      [resource, action, module, name || `${action} ${module}`, description || null]
    );
    res.json({ success: true, data: { id: result.insertId, resource, action, module, name, description } });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /permissions/:id - Update permission
router.put('/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { resource, action, module, name, description } = req.body;
    await dbRun(
      'UPDATE permissions SET resource = ?, action = ?, module = ?, name = ?, description = ? WHERE id = ?',
      [resource, action, module, name, description, req.params.id]
    );
    res.json({ success: true, data: { id: req.params.id, resource, action, module, name, description } });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE /permissions/:id - Delete permission
router.delete('/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    await dbRun('DELETE FROM role_permissions WHERE permission_id = ?', [req.params.id]);
    await dbRun('DELETE FROM permissions WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: 'Permission deleted successfully' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
