import { Router, Request, Response } from 'express';
import { dbAll, dbGet, dbRun } from '../config/database';
import { authMiddleware } from '../middleware/auth';

const router = Router();

// GET /api/products
router.get('/', authMiddleware, async (req: Request, res: Response) => {
  try {
    const products = await dbAll(`
      SELECT 
        p.*,
        p.active as is_active,
        c.name as category_name,
        u.name as unit_name,
        u.code as uom,
        pt.name as type_name,
        LOWER(pt.name) as item_type
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      LEFT JOIN uom u ON p.unit_of_measure_id = u.id
      LEFT JOIN product_types pt ON p.product_type_id = pt.id
      ORDER BY p.created_at DESC
    `, []);
    res.json({ data: products });
  } catch (error) {
    console.error('Error fetching products:', error);
    res.status(500).json({ error: 'Failed to fetch products' });
  }
});

// GET /api/products/:id
router.get('/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const product = await dbGet('SELECT * FROM products WHERE id = ?', [req.params.id]);
    
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }
    
    res.json({ data: product });
  } catch (error) {
    console.error('Error fetching product:', error);
    res.status(500).json({ error: 'Failed to fetch product' });
  }
});

// POST /api/products
router.post('/', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { sku, name, description, unit_id, category_id, product_type_id, is_active, standard_cost, reorder_point, lead_time_days } = req.body;

    if (!sku || !name) {
      return res.status(400).json({ error: 'SKU and name are required' });
    }

    const activeValue = is_active ? 1 : 0;
    const result = await dbRun(
      'INSERT INTO products (sku, name, description, unit_of_measure_id, category_id, product_type_id, active, standard_cost, reorder_point, lead_time_days) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [sku, name, description || null, unit_id || null, category_id || null, product_type_id || null, activeValue, standard_cost || 0, reorder_point || 0, lead_time_days || 0]
    );

    res.status(201).json({
      message: 'Product created successfully',
      data: { id: result.insertId, sku, name, description, unit_of_measure_id: unit_id, category_id, product_type_id, active: activeValue },
    });
  } catch (error: any) {
    console.error('Error creating product:', error);
    if (error.message.includes('Duplicate entry')) {
      return res.status(400).json({ error: 'SKU already exists' });
    }
    res.status(500).json({ error: 'Failed to create product' });
  }
});

// PUT /api/products/:id
router.put('/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { sku, name, description, unit_id, category_id, product_type_id, is_active, standard_cost, reorder_point, lead_time_days } = req.body;
    
    const activeValue = is_active ? 1 : 0;
    
    await dbRun(
      'UPDATE products SET sku = ?, name = ?, description = ?, unit_of_measure_id = ?, category_id = ?, product_type_id = ?, active = ?, standard_cost = ?, reorder_point = ?, lead_time_days = ? WHERE id = ?',
      [sku, name, description, unit_id || null, category_id || null, product_type_id || null, activeValue, standard_cost || 0, reorder_point || 0, lead_time_days || 0, req.params.id]
    );

    res.json({ message: 'Product updated successfully' });
  } catch (error) {
    console.error('Error updating product:', error);
    res.status(500).json({ error: 'Failed to update product' });
  }
});

// DELETE /api/products/:id
router.delete('/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const result = await dbRun('DELETE FROM products WHERE id = ?', [req.params.id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }
    res.json({ message: 'Product deleted successfully' });
  } catch (error: any) {
    console.error('Error deleting product:', error);
    // Check for MySQL foreign key constraint error
    if (error.code === 'ER_ROW_IS_REFERENCED_2' || error.errno === 1451) {
      return res.status(400).json({ error: 'Tidak dapat menghapus item ini karena sudah digunakan dalam transaksi (misalnya di BOM, PO, atau Inventory).' });
    }
    res.status(500).json({ error: 'Failed to delete product' });
  }
});

export default router;
