import { Router, Request, Response } from 'express';
import { dbAll, dbGet, dbRun } from '../config/database';
import { authMiddleware } from '../middleware/auth';

const router = Router();

// GET /api/departments - Get all departments
router.get('/', authMiddleware, async (req: Request, res: Response) => {
  try {
    const departments = await dbAll(
      `
      SELECT d.*, u.full_name as head_user_name
      FROM departments d 
      LEFT JOIN users u ON d.head_user_id = u.id
      ORDER BY d.name ASC
      `,
      []
    );
    // Cast active to boolean for frontend
    const mapped = departments.map((d: any) => ({ ...d, active: !!d.active }));
    res.json({ data: mapped });
  } catch (error) {
    console.error('Error fetching departments:', error);
    res.status(500).json({ error: 'Failed to fetch departments' });
  }
});

// GET /api/departments/:id - Get specific department with users
router.get('/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const department = await dbGet(
      `
      SELECT d.* 
      FROM departments d 
      WHERE d.id = ?
      `,
      [req.params.id]
    );
    
    if (!department) {
      return res.status(404).json({ error: 'Department not found' });
    }

    const users = await dbAll(
      `
      SELECT u.id, u.full_name, u.email, r.name as role_name, u.is_active
      FROM users u
      LEFT JOIN roles r ON u.role_id = r.id
      WHERE u.department_id = ?
      ORDER BY u.full_name ASC
      `,
      [req.params.id]
    );
    
    res.json({ data: { ...department, users } });
  } catch (error) {
    console.error('Error fetching department:', error);
    res.status(500).json({ error: 'Failed to fetch department' });
  }
});

// POST /api/departments - Create department
router.post('/', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { code, name, description } = req.body;

    if (!code || !name) {
      return res.status(400).json({ error: 'Code and Name are required' });
    }

    const result = await dbRun(
      'INSERT INTO departments (code, name, description, active) VALUES (?, ?, ?, 1)',
      [code, name, description || null]
    );

    res.status(201).json({
      message: 'Department created successfully',
      data: { id: result.insertId, code, name, description, active: true },
    });
  } catch (error: any) {
    console.error('Error creating department:', error);
    if (typeof error.message === 'string' && error.message.includes('Duplicate entry')) {
      return res.status(400).json({ error: 'Department code already exists' });
    }
    res.status(500).json({ error: 'Failed to create department' });
  }
});

// PUT /api/departments/:id - Update department
router.put('/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { code, name, description, head_user_id, active } = req.body;

    if (!code || !name) {
      return res.status(400).json({ error: 'Code and Name are required' });
    }

    await dbRun(
      'UPDATE departments SET code = ?, name = ?, description = ?, head_user_id = ?, active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [code, name, description || null, head_user_id || null, active ? 1 : 0, req.params.id]
    );

    res.json({ message: 'Department updated successfully' });
  } catch (error) {
    console.error('Error updating department:', error);
    res.status(500).json({ error: 'Failed to update department' });
  }
});

// DELETE /api/departments/:id - Delete department
router.delete('/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    await dbRun('UPDATE departments SET active = 0 WHERE id = ?', [req.params.id]);

    res.json({ message: 'Department deleted successfully' });
  } catch (error) {
    console.error('Error deleting department:', error);
    res.status(500).json({ error: 'Failed to delete department' });
  }
});

export default router;
