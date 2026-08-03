import { Router, Request, Response } from 'express';
import { dbAll, dbGet, dbRun } from '../config/database';
import { authMiddleware } from '../middleware/auth';

const router = Router();

// Get all units
router.get('/', authMiddleware, async (req: Request, res: Response) => {
  try {
    const units = await dbAll('SELECT * FROM uom ORDER BY name ASC', []);
    res.json({ data: units });
  } catch (error) {
    console.error('Error fetching units:', error);
    res.status(500).json({ error: 'Failed to fetch units' });
  }
});

// Get unit by ID
router.get('/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const unit = await dbGet('SELECT * FROM uom WHERE id = ?', [id]);
    
    if (!unit) {
      return res.status(404).json({ error: 'Unit not found' });
    }
    
    res.json({ data: unit });
  } catch (error) {
    console.error('Error fetching unit:', error);
    res.status(500).json({ error: 'Failed to fetch unit' });
  }
});

// Create new unit
router.post('/', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { code, name, description, category, active } = req.body;
    
    const activeValue = active === false ? 0 : 1;
    const result = await dbRun(
      'INSERT INTO uom (code, name, description, category, active) VALUES (?, ?, ?, ?, ?)',
      [code, name, description || null, category || null, activeValue]
    );
    
    const newUnit = await dbGet('SELECT * FROM uom WHERE id = ?', [result.insertId]);
    res.status(201).json({ data: newUnit });
  } catch (error) {
    console.error('Error creating unit:', error);
    res.status(500).json({ error: 'Failed to create unit' });
  }
});

// Update unit
router.put('/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { code, name, description, category, active } = req.body;
    
    const activeValue = active === false ? 0 : 1;
    const result = await dbRun(
      'UPDATE uom SET code = ?, name = ?, description = ?, category = ?, active = ? WHERE id = ?',
      [code, name, description || null, category || null, activeValue, id]
    );
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Unit not found' });
    }
    
    const updatedUnit = await dbGet('SELECT * FROM uom WHERE id = ?', [id]);
    res.json({ data: updatedUnit });
  } catch (error) {
    console.error('Error updating unit:', error);
    res.status(500).json({ error: 'Failed to update unit' });
  }
});

// Delete unit
router.delete('/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    const result = await dbRun('DELETE FROM uom WHERE id = ?', [id]);
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Unit not found' });
    }
    
    res.json({ message: 'Unit deleted successfully' });
  } catch (error) {
    console.error('Error deleting unit:', error);
    res.status(500).json({ error: 'Failed to delete unit' });
  }
});

export default router;
