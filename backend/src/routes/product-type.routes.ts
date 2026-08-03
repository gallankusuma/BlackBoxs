import { Router, Request, Response } from 'express';
import { dbAll, dbGet, dbRun } from '../config/database';
import { authMiddleware } from '../middleware/auth';

const router = Router();

// GET /api/product-types - Get all product types
router.get('/', authMiddleware, async (req: Request, res: Response) => {
  try {
    const types = await dbAll('SELECT * FROM product_types ORDER BY name ASC', []);
    res.json({ data: types });
  } catch (error) {
    console.error('Error fetching product types:', error);
    res.status(500).json({ error: 'Failed to fetch product types' });
  }
});

// GET /api/product-types/:id - Get specific product type
router.get('/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const type = await dbGet('SELECT * FROM product_types WHERE id = ?', [req.params.id]);
    
    if (!type) {
      return res.status(404).json({ error: 'Product type not found' });
    }
    
    res.json({ data: type });
  } catch (error) {
    console.error('Error fetching product type:', error);
    res.status(500).json({ error: 'Failed to fetch product type' });
  }
});

// POST /api/product-types - Create product type
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
      message: 'Product type created successfully',
      data: { id: result.insertId, code, name, description, active: true },
    });
  } catch (error) {
    console.error('Error creating product type:', error);
    res.status(500).json({ error: 'Failed to create product type' });
  }
});

// PUT /api/product-types/:id - Update product type
router.put('/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { code, name, description, active } = req.body;

    if (!code || !name) {
      return res.status(400).json({ error: 'Code and Name are required' });
    }

    const activeValue = active !== undefined ? (active ? 1 : 0) : 1;

    await dbRun(
      'UPDATE product_types SET code = ?, name = ?, description = ?, active = ? WHERE id = ?',
      [code, name, description || null, activeValue, req.params.id]
    );

    res.json({ message: 'Product type updated successfully' });
  } catch (error) {
    console.error('Error updating product type:', error);
    res.status(500).json({ error: 'Failed to update product type' });
  }
});

// DELETE /api/product-types/:id - Delete product type
router.delete('/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    await dbRun('DELETE FROM product_types WHERE id = ?', [req.params.id]);

    res.json({ message: 'Product type deleted successfully' });
  } catch (error) {
    console.error('Error deleting product type:', error);
    res.status(500).json({ error: 'Failed to delete product type' });
  }
});

export default router;
