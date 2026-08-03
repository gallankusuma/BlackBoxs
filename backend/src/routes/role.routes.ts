import { Router, Request, Response } from 'express';
import { dbAll, dbGet, dbRun } from '../config/database';
import { authMiddleware } from '../middleware/auth';

const router = Router();

// GET /api/roles - Get all roles
router.get('/', authMiddleware, async (req: Request, res: Response) => {
  try {
    const roles = await dbAll('SELECT * FROM roles ORDER BY level DESC, name ASC', []);
    res.json({ data: roles });
  } catch (error) {
    console.error('Error fetching roles:', error);
    res.status(500).json({ error: 'Failed to fetch roles' });
  }
});

// GET /api/roles/:id - Get specific role with permissions
router.get('/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const role = await dbGet('SELECT * FROM roles WHERE id = ?', [req.params.id]);
    if (!role) {
      return res.status(404).json({ error: 'Role not found' });
    }

    // Get permission IDs assigned to this role
    const permissions = await dbAll(`
      SELECT p.id, p.resource, p.action, p.module, p.name, p.description
      FROM permissions p
      INNER JOIN role_permissions rp ON p.id = rp.permission_id
      WHERE rp.role_id = ?
      ORDER BY p.module, p.action
    `, [req.params.id]) as any[];

    res.json({ data: { ...role, permissions } });
  } catch (error) {
    console.error('Error fetching role:', error);
    res.status(500).json({ error: 'Failed to fetch role' });
  }
});

// POST /api/roles - Create role
router.post('/', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { code, name, description, level } = req.body;
    if (!code || !name) {
      return res.status(400).json({ error: 'Code and Name are required' });
    }
    const result = await dbRun(
      'INSERT INTO roles (code, name, description, level, active) VALUES (?, ?, ?, ?, 1)',
      [code, name, description || null, level || 0]
    );
    res.status(201).json({
      message: 'Role created successfully',
      data: { id: result.insertId, code, name, description, level, active: true },
    });
  } catch (error) {
    console.error('Error creating role:', error);
    res.status(500).json({ error: 'Failed to create role' });
  }
});

// PUT /api/roles/:id - Update role
router.put('/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { code, name, description, level, active } = req.body;
    if (!code || !name) {
      return res.status(400).json({ error: 'Code and Name are required' });
    }
    await dbRun(
      'UPDATE roles SET code = ?, name = ?, description = ?, level = ?, active = ? WHERE id = ?',
      [code, name, description || null, level || 0, active ? 1 : 0, req.params.id]
    );
    res.json({ message: 'Role updated successfully' });
  } catch (error) {
    console.error('Error updating role:', error);
    res.status(500).json({ error: 'Failed to update role' });
  }
});

// DELETE /api/roles/:id - Delete role
router.delete('/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    // Don't allow deleting Admin role
    const role = await dbGet('SELECT * FROM roles WHERE id = ?', [req.params.id]) as any;
    if (role && role.code === 'ADM') {
      return res.status(400).json({ error: 'Cannot delete Admin role' });
    }
    await dbRun('DELETE FROM role_permissions WHERE role_id = ?', [req.params.id]);
    await dbRun('DELETE FROM roles WHERE id = ?', [req.params.id]);
    res.json({ message: 'Role deleted successfully' });
  } catch (error) {
    console.error('Error deleting role:', error);
    res.status(500).json({ error: 'Failed to delete role' });
  }
});

// POST /api/roles/:id/permissions - Assign permissions to role
router.post('/:id/permissions', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { permission_ids } = req.body;
    if (!Array.isArray(permission_ids)) {
      return res.status(400).json({ error: 'permission_ids must be an array' });
    }

    // Remove existing permissions
    await dbRun('DELETE FROM role_permissions WHERE role_id = ?', [req.params.id]);

    // Add new permissions
    if (permission_ids.length > 0) {
      const values = permission_ids.map(pid => `(${parseInt(req.params.id as string)}, ${parseInt(pid as string)})`).join(',');
      await dbRun(`INSERT INTO role_permissions (role_id, permission_id) VALUES ${values}`, []);
    }

    res.json({ message: 'Permissions assigned successfully' });
  } catch (error) {
    console.error('Error assigning permissions:', error);
    res.status(500).json({ error: 'Failed to assign permissions' });
  }
});

// GET /api/roles/:id/permissions - Get role's permission IDs
router.get('/:id/permissions', authMiddleware, async (req: Request, res: Response) => {
  try {
    const permissions = await dbAll(
      'SELECT permission_id FROM role_permissions WHERE role_id = ?',
      [req.params.id]
    ) as any[];
    res.json({ data: permissions.map(p => p.permission_id) });
  } catch (error) {
    console.error('Error fetching role permissions:', error);
    res.status(500).json({ error: 'Failed to fetch role permissions' });
  }
});

export default router;
