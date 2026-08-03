import { Router, Request, Response } from 'express';
import { dbAll, dbGet, dbRun } from '../config/database';
import { authMiddleware } from '../middleware/auth';

const router = Router();

// GET /api/item-types - Get all item types
router.get('/', authMiddleware, async (req: Request, res: Response) => {
  try {
    const types = await dbAll('SELECT * FROM product_types ORDER BY name ASC', []);
    res.json({ data: types });
  } catch (error) {
    console.error('Error fetching item types:', error);
    res.status(500).json({ error: 'Failed to fetch item types' });
  }
});

// GET /api/item-types/:id - Get specific item type
router.get('/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const type = await dbGet('SELECT * FROM product_types WHERE id = ?', [req.params.id]);
    
    if (!type) {
      return res.status(404).json({ error: 'Item type not found' });
    }
    
    res.json({ data: type });
  } catch (error) {
    console.error('Error fetching item type:', error);
    res.status(500).json({ error: 'Failed to fetch item type' });
  }
});

// POST /api/item-types - Create item type
router.post('/', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { code, name, description } = req.body;

    if (!code || !name) {
      return res.status(400).json({ error: 'Code and Name are required' });
    }

    const result = await dbRun(
      'INSERT INTO product_types (code, name, description, active) VALUES (?, ?, ?, ?)',
      [code, name, description || null, 1]
    );

    res.status(201).json({
      message: 'Item type created successfully',
      data: { id: result.insertId, code, name, description, active: true },
    });
  } catch (error) {
    console.error('Error creating item type:', error);
    res.status(500).json({ error: 'Failed to create item type' });
  }
});

// PUT /api/item-types/:id - Update item type
router.put('/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { code, name, description } = req.body;

    if (!code || !name) {
      return res.status(400).json({ error: 'Code and Name are required' });
    }

    await dbRun(
      'UPDATE product_types SET code = ?, name = ?, description = ? WHERE id = ?',
      [code, name, description || null, req.params.id]
    );

    res.json({ message: 'Item type updated successfully' });
  } catch (error) {
    console.error('Error updating item type:', error);
    res.status(500).json({ error: 'Failed to update item type' });
  }
});

// DELETE /api/item-types/:id - Delete item type
router.delete('/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    // Check if any products reference this item type
    const usage = await dbGet('SELECT COUNT(*) as cnt FROM products WHERE product_type_id = ?', [req.params.id]) as any;
    if (usage && usage.cnt > 0) {
      return res.status(400).json({ error: `Cannot delete: ${usage.cnt} product(s) are using this item type. Remove or reassign them first.` });
    }
    await dbRun('DELETE FROM product_types WHERE id = ?', [req.params.id]);
    res.json({ message: 'Item type deleted successfully' });
  } catch (error) {
    console.error('Error deleting item type:', error);
    res.status(500).json({ error: 'Failed to delete item type' });
  }
});

export default router;
