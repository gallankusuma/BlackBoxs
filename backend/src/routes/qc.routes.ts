import { Router, Request, Response } from 'express';
import { dbAll, dbGet, dbRun } from '../config/database';
import { authMiddleware } from '../middleware/auth';

const router = Router();

// Utility for generating FPA numbers
const generateFPANumber = (type: string) => {
  const now = new Date();
  const datePart = now.toISOString().slice(0, 10).replace(/-/g, '');
  const rand = Math.floor(100 + Math.random() * 900);
  return `FPA-${type}-${datePart}-${rand}`;
};

// ============================================================
// MASTER DATA
// ============================================================

// --- Parameters ---
router.get('/parameters', authMiddleware, async (req: Request, res: Response) => {
  try {
    const data = await dbAll('SELECT * FROM qc_parameters ORDER BY name ASC');
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to fetch parameters' });
  }
});

router.post('/parameters', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { name, description } = req.body;
    const result = await dbRun('INSERT INTO qc_parameters (name, description) VALUES (?, ?)', [name, description]);
    res.status(201).json({ success: true, message: 'Parameter created', id: result.insertId });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to create parameter' });
  }
});

router.put('/parameters/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { name, description } = req.body;
    await dbRun('UPDATE qc_parameters SET name=?, description=? WHERE id=?', [name, description, req.params.id]);
    res.json({ success: true, message: 'Parameter updated' });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to update parameter' });
  }
});

router.delete('/parameters/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    await dbRun('DELETE FROM qc_parameters WHERE id=?', [req.params.id]);
    res.json({ success: true, message: 'Parameter deleted' });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to delete parameter' });
  }
});

// --- Methods ---
router.get('/methods', authMiddleware, async (req: Request, res: Response) => {
  try {
    const data = await dbAll('SELECT * FROM qc_methods ORDER BY name ASC');
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to fetch methods' });
  }
});

router.post('/methods', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { name, description } = req.body;
    const result = await dbRun('INSERT INTO qc_methods (name, description) VALUES (?, ?)', [name, description]);
    res.status(201).json({ success: true, message: 'Method created', id: result.insertId });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to create method' });
  }
});

router.put('/methods/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { name, description } = req.body;
    await dbRun('UPDATE qc_methods SET name=?, description=? WHERE id=?', [name, description, req.params.id]);
    res.json({ success: true, message: 'Method updated' });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to update method' });
  }
});

router.delete('/methods/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    await dbRun('DELETE FROM qc_methods WHERE id=?', [req.params.id]);
    res.json({ success: true, message: 'Method deleted' });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to delete method' });
  }
});

// --- Instruments ---
router.get('/instruments', authMiddleware, async (req: Request, res: Response) => {
  try {
    const data = await dbAll('SELECT * FROM qc_instruments ORDER BY name ASC');
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to fetch instruments' });
  }
});

router.post('/instruments', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { name, calibration_date } = req.body;
    const result = await dbRun('INSERT INTO qc_instruments (name, calibration_date) VALUES (?, ?)', [name, calibration_date]);
    res.status(201).json({ success: true, message: 'Instrument created', id: result.insertId });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to create instrument' });
  }
});

router.put('/instruments/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { name, calibration_date } = req.body;
    await dbRun('UPDATE qc_instruments SET name=?, calibration_date=? WHERE id=?', [name, calibration_date, req.params.id]);
    res.json({ success: true, message: 'Instrument updated' });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to update instrument' });
  }
});

router.delete('/instruments/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    await dbRun('DELETE FROM qc_instruments WHERE id=?', [req.params.id]);
    res.json({ success: true, message: 'Instrument deleted' });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to delete instrument' });
  }
});

// --- Sampling Areas ---
router.get('/areas', authMiddleware, async (req: Request, res: Response) => {
  try {
    const data = await dbAll('SELECT * FROM qc_sampling_areas ORDER BY name ASC');
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to fetch sampling areas' });
  }
});

router.post('/areas', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { name } = req.body;
    const result = await dbRun('INSERT INTO qc_sampling_areas (name) VALUES (?)', [name]);
    res.status(201).json({ success: true, message: 'Area created', id: result.insertId });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to create area' });
  }
});

router.put('/areas/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { name } = req.body;
    await dbRun('UPDATE qc_sampling_areas SET name=? WHERE id=?', [name, req.params.id]);
    res.json({ success: true, message: 'Area updated' });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to update area' });
  }
});

router.delete('/areas/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    await dbRun('DELETE FROM qc_sampling_areas WHERE id=?', [req.params.id]);
    res.json({ success: true, message: 'Area deleted' });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to delete area' });
  }
});


// ============================================================
// QC SPECIFICATIONS (Per Item)
// ============================================================
router.get('/specs/:product_id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const data = await dbAll(`
      SELECT s.*, p.name as parameter_name, m.name as method_name
      FROM qc_specifications s
      JOIN qc_parameters p ON s.parameter_id = p.id
      LEFT JOIN qc_methods m ON s.method_id = m.id
      WHERE s.product_id = ?
    `, [req.params.product_id]);
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to fetch specs' });
  }
});

router.post('/specs', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { product_id, parameter_id, method_id, standard_value, min_value, max_value } = req.body;
    const result = await dbRun(
      'INSERT INTO qc_specifications (product_id, parameter_id, method_id, standard_value, min_value, max_value) VALUES (?, ?, ?, ?, ?, ?)',
      [product_id, parameter_id, method_id || null, standard_value, min_value || null, max_value || null]
    );
    res.status(201).json({ success: true, message: 'Spec created', id: result.insertId });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to create spec' });
  }
});

router.put('/specs/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { parameter_id, method_id, standard_value, min_value, max_value } = req.body;
    await dbRun(
      'UPDATE qc_specifications SET parameter_id=?, method_id=?, standard_value=?, min_value=?, max_value=? WHERE id=?',
      [parameter_id, method_id || null, standard_value, min_value || null, max_value || null, req.params.id]
    );
    res.json({ success: true, message: 'Spec updated' });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to update spec' });
  }
});

router.delete('/specs/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    await dbRun('DELETE FROM qc_specifications WHERE id=?', [req.params.id]);
    res.json({ success: true, message: 'Spec deleted' });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to delete spec' });
  }
});

// ============================================================
// ANALYSIS REQUESTS (FPA)
// ============================================================
router.get('/fpa', authMiddleware, async (req: Request, res: Response) => {
  try {
    const data = await dbAll(`
      SELECT f.*, p.name as product_name, p.sku as product_sku, a.name as area_name, u.full_name as created_by_name
      FROM qc_analysis_requests f
      LEFT JOIN products p ON f.product_id = p.id
      LEFT JOIN qc_sampling_areas a ON f.sampling_area_id = a.id
      LEFT JOIN users u ON f.created_by = u.id
      ORDER BY f.created_at DESC
    `);
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to fetch FPAs' });
  }
});

router.post('/fpa', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { type, reference_id, product_id, sampling_area_id, notes } = req.body;
    const fpa_number = generateFPANumber(type);
    const userId = (req as any).user?.userId || null;
    
    const result = await dbRun(
      'INSERT INTO qc_analysis_requests (fpa_number, type, reference_id, product_id, sampling_area_id, notes, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [fpa_number, type, reference_id || null, product_id, sampling_area_id || null, notes || null, userId]
    );
    
    // Automatically copy specs to analysis results
    const specs = await dbAll('SELECT * FROM qc_specifications WHERE product_id = ?', [product_id]);
    for (const spec of specs) {
      await dbRun(
        'INSERT INTO qc_analysis_results (fpa_id, parameter_id) VALUES (?, ?)',
        [result.insertId, spec.parameter_id]
      );
    }
    
    res.status(201).json({ success: true, message: 'FPA created', id: result.insertId });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to create FPA' });
  }
});

router.get('/fpa/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const fpa = await dbGet(`
      SELECT f.*, p.name as product_name, a.name as area_name
      FROM qc_analysis_requests f
      LEFT JOIN products p ON f.product_id = p.id
      LEFT JOIN qc_sampling_areas a ON f.sampling_area_id = a.id
      WHERE f.id = ?
    `, [req.params.id]);
    
    if (!fpa) return res.status(404).json({ success: false, error: 'FPA not found' });
    
    const results = await dbAll(`
      SELECT r.*, p.name as parameter_name, i.name as instrument_name,
             s.standard_value, s.min_value, s.max_value, m.name as method_name
      FROM qc_analysis_results r
      JOIN qc_parameters p ON r.parameter_id = p.id
      LEFT JOIN qc_instruments i ON r.instrument_id = i.id
      LEFT JOIN qc_specifications s ON s.product_id = ? AND s.parameter_id = r.parameter_id
      LEFT JOIN qc_methods m ON s.method_id = m.id
      WHERE r.fpa_id = ?
    `, [fpa.product_id, req.params.id]);
    
    res.json({ success: true, data: { ...fpa, results } });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to fetch FPA detail' });
  }
});

router.put('/fpa/:id/results', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { results, status, result, notes } = req.body;
    
    // Update FPA
    await dbRun(
      'UPDATE qc_analysis_requests SET status=?, result=?, notes=?, updated_at=CURRENT_TIMESTAMP WHERE id=?',
      [status, result || null, notes || null, req.params.id]
    );
    
    // Update individual results
    if (results && Array.isArray(results)) {
      for (const r of results) {
        await dbRun(
          'UPDATE qc_analysis_results SET instrument_id=?, actual_value=?, is_pass=? WHERE id=?',
          [r.instrument_id || null, r.actual_value || null, r.is_pass === undefined ? null : r.is_pass, r.id]
        );
      }
    }
    
    res.json({ success: true, message: 'FPA updated' });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to update FPA' });
  }
});

export default router;
