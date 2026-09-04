import { Router, Request, Response } from 'express';
import { dbAll, dbGet, dbRun } from '../config/database';
import { authMiddleware } from '../middleware/auth';

const router = Router();

const generateCode = (prefix: string) => {
  const now = new Date();
  const datePart = now.toISOString().slice(0, 10).replace(/-/g, '');
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `${prefix}-${datePart}-${rand}`;
};

// QC Tests (Master Data)
router.get('/tests', authMiddleware, async (req: Request, res: Response) => {
  try {
    const tests = await dbAll(`
      SELECT * FROM qc_tests 
      ORDER BY code
    `, []);
    res.json({ data: tests });
  } catch (error) {
    console.error('Error fetching QC tests:', error);
    res.status(500).json({ error: 'Failed to fetch QC tests' });
  }
});

router.post('/tests', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { test_code, name, test_type, test_method, acceptance_criteria, product_id } = req.body;

    if (!test_code || !name) {
      return res.status(400).json({ error: 'test_code and name are required' });
    }

    const result = await dbRun(`
      INSERT INTO qc_tests (code, name, product_id, test_type, test_method, acceptance_criteria)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [test_code, name, product_id || null, test_type || null, test_method || null, acceptance_criteria || null]);

    res.status(201).json({
      message: 'QC test created successfully',
      data: { id: result.insertId, test_code, name }
    });
  } catch (error) {
    console.error('Error creating QC test:', error);
    res.status(500).json({ error: 'Failed to create QC test' });
  }
});

// QC Test Definitions (per product)
// CABUT-QC-PPIC-01: GET & POST /test-definitions dicabut — keduanya berdiri di
// atas tabel `qc_test_definitions` yang tidak pernah ada di skema mana pun, dan
// tidak ada satu pun layar yang memanggilnya.
router.get('/results', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { batch_id, status } = req.query;

    let query = `
      SELECT qr.*, qt.code as test_code, qt.name as test_name, qt.test_type,
             b.batch_number, p.name as product_name,
             u1.full_name as tested_by_name
      FROM qc_results qr
      JOIN qc_tests qt ON qr.qc_test_id = qt.id
      JOIN batches b ON qr.batch_id = b.id
      JOIN products p ON b.product_id = p.id
      LEFT JOIN users u1 ON qr.tested_by = u1.id
      WHERE 1=1
    `;

    const params: any[] = [];

    if (batch_id) {
      query += ` AND qr.batch_id = ?`;
      params.push(batch_id);
    }

    if (status) {
      query += ` AND qr.result_status = ?`;
      params.push(status);
    }

    query += ` ORDER BY qr.test_date DESC`;

    const results = await dbAll(query, params);

    res.json({ data: results });
  } catch (error) {
    console.error('Error fetching QC results:', error);
    res.status(500).json({ error: 'Failed to fetch QC results' });
  }
});

router.post('/results', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { batch_id, test_id, result_value, result_status, notes } = req.body;
    const user_id = (req as any).user?.userId;

    if (!batch_id || !test_id) {
      return res.status(400).json({ error: 'batch_id and test_id are required' });
    }

    const result = await dbRun(`
      INSERT INTO qc_results (
        batch_id, qc_test_id, result_value, result_status, 
        tested_by, test_date, notes
      )
      VALUES (?, ?, ?, ?, ?, NOW(), ?)
    `, [
      batch_id, test_id,
      result_value || null,
      result_status || 'pending',
      user_id,
      notes || null
    ]);

    res.status(201).json({
      message: 'QC result recorded successfully',
      data: { id: result.insertId, batch_id, test_id }
    });
  } catch (error) {
    console.error('Error recording QC result:', error);
    res.status(500).json({ error: 'Failed to record QC result' });
  }
});

router.put('/results/:id/approve', authMiddleware, async (req: Request, res: Response) => {
  try {
    const user_id = (req as any).user?.userId;
    const { notes } = req.body;

    // Update QC result
    await dbRun(`
      UPDATE qc_results 
      SET result_status = 'passed', 
          approved_by = ?, 
          approved_at = NOW(),
          notes = ?
      WHERE id = ?
    `, [user_id, notes || null, req.params.id]);

    // Check if all required tests for the batch are passed
    const qcResult = await dbGet(`SELECT batch_id FROM qc_results WHERE id = ?`, [req.params.id]) as any;

    if (qcResult) {
      const check = await dbGet(`
        SELECT COUNT(*) as pending_count
        FROM qc_results qr
          -- Gerbang lama memakai qc_test_definitions.is_required; tabel itu
          -- tidak pernah ada. Sekarang: SEMUA hasil uji batch ini harus lulus.
          WHERE qr.batch_id = ? AND qr.result_status != 'passed'
      `, [qcResult.batch_id]) as any;

      if (check.pending_count === 0) {
        // All required tests passed - update batch QC status
        await dbRun(`
          UPDATE batches SET qc_status = 'passed' WHERE id = ?
        `, [qcResult.batch_id]);
      }
    }

    res.json({ message: 'QC result approved successfully' });
  } catch (error) {
    console.error('Error approving QC result:', error);
    res.status(500).json({ error: 'Failed to approve QC result' });
  }
});

router.put('/results/:id/reject', authMiddleware, async (req: Request, res: Response) => {
  try {
    const user_id = (req as any).user?.userId;
    const { notes } = req.body;

    // Update QC result
    await dbRun(`
      UPDATE qc_results 
      SET result_status = 'failed', 
          approved_by = ?, 
          approved_at = NOW(),
          notes = ?
      WHERE id = ?
    `, [user_id, notes || null, req.params.id]);

    // Update batch QC status to failed
    const qcResult = await dbGet(`SELECT batch_id FROM qc_results WHERE id = ?`, [req.params.id]) as any;

    if (qcResult) {
      await dbRun(`
        UPDATE batches SET qc_status = 'failed', status = 'rejected' WHERE id = ?
      `, [qcResult.batch_id]);
    }

    res.json({ message: 'QC result rejected successfully' });
  } catch (error) {
    console.error('Error rejecting QC result:', error);
    res.status(500).json({ error: 'Failed to reject QC result' });
  }
});

// Batches
router.get('/batches', authMiddleware, async (req: Request, res: Response) => {
  try {
    const batches = await dbAll(
      `SELECT b.*, p.sku, p.name as product_name
       FROM batches b
       JOIN products p ON b.product_id = p.id
       ORDER BY b.created_at DESC`, []
    );
    res.json({ data: batches });
  } catch (error) {
    console.error('Error fetching batches:', error);
    res.status(500).json({ error: 'Failed to fetch batches' });
  }
});

router.get('/batches/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const batch = await dbGet(
      `SELECT b.*, p.sku, p.name as product_name
       FROM batches b
       JOIN products p ON b.product_id = p.id
       WHERE b.id = ?`, [req.params.id]
    );
    if (!batch) return res.status(404).json({ error: 'Batch not found' });
    res.json({ data: batch });
  } catch (error) {
    console.error('Error fetching batch:', error);
    res.status(500).json({ error: 'Failed to fetch batch' });
  }
});

router.post('/batches', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { batch_number, product_id, manufacture_date, expiry_date, status } = req.body;
    if (!product_id) return res.status(400).json({ error: 'product_id is required' });
    const number = batch_number || generateCode('BATCH');

    const result = await dbRun('INSERT INTO batches (batch_number, product_id, manufacture_date, expiry_date, status) VALUES (?, ?, ?, ?, ?)',
      [number, product_id, manufacture_date || null, expiry_date || null, status || 'open']);

    res.status(201).json({ message: 'Batch created', data: { id: result.insertId, batch_number: number } });
  } catch (error: any) {
    console.error('Error creating batch:', error);
    if (error.message?.includes('UNIQUE')) return res.status(400).json({ error: 'Batch number must be unique' });
    res.status(500).json({ error: 'Failed to create batch' });
  }
});

router.put('/batches/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { product_id, manufacture_date, expiry_date, status } = req.body;
    await dbRun(
      'UPDATE batches SET product_id = ?, manufacture_date = ?, expiry_date = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [product_id, manufacture_date || null, expiry_date || null, status, req.params.id]
    );
    res.json({ message: 'Batch updated' });
  } catch (error) {
    console.error('Error updating batch:', error);
    res.status(500).json({ error: 'Failed to update batch' });
  }
});

// QC Tests (master)
router.get('/qc-tests', authMiddleware, async (req: Request, res: Response) => {
  try {
    const tests = await dbAll('SELECT * FROM qc_tests ORDER BY name ASC', []);
    res.json({ data: tests });
  } catch (error) {
    console.error('Error fetching QC tests:', error);
    res.status(500).json({ error: 'Failed to fetch QC tests' });
  }
});

router.post('/qc-tests', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { name, description } = req.body;
    if (!name) return res.status(400).json({ error: 'name is required' });

    const result = await dbRun('INSERT INTO qc_tests (name, description) VALUES (?, ?)', [name, description || null]);
    res.status(201).json({ message: 'QC test created', data: { id: result.insertId, name } });
  } catch (error) {
    console.error('Error creating QC test:', error);
    res.status(500).json({ error: 'Failed to create QC test' });
  }
});

router.put('/qc-tests/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { name, description } = req.body;
    await dbRun('UPDATE qc_tests SET name = ?, description = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [
      name,
      description,
      req.params.id
    ]);
    res.json({ message: 'QC test updated' });
  } catch (error) {
    console.error('Error updating QC test:', error);
    res.status(500).json({ error: 'Failed to update QC test' });
  }
});

router.delete('/qc-tests/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    await dbRun('DELETE FROM qc_tests WHERE id = ?', [req.params.id]);
    res.json({ message: 'QC test deleted' });
  } catch (error) {
    console.error('Error deleting QC test:', error);
    res.status(500).json({ error: 'Failed to delete QC test' });
  }
});

// QC Results
router.get('/qc-results', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { batch_id } = req.query;
    let query =
      `SELECT qr.*, b.batch_number, t.name as test_name, u.full_name as tester_name
       FROM qc_results qr
       JOIN batches b ON qr.batch_id = b.id
       JOIN qc_tests t ON qr.qc_test_id = t.id
       LEFT JOIN users u ON qr.tested_by = u.id`;
    const params: any[] = [];
    if (batch_id) {
      query += ' WHERE qr.batch_id = ?';
      params.push(batch_id);
    }
    query += ' ORDER BY qr.test_date DESC';
    const results = await dbAll(query, params);
    res.json({ data: results });
  } catch (error) {
    console.error('Error fetching QC results:', error);
    res.status(500).json({ error: 'Failed to fetch QC results' });
  }
});

router.post('/qc-results', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { batch_id, test_id, result, status, tested_at, tester_id, notes } = req.body;
    if (!batch_id || !test_id) return res.status(400).json({ error: 'batch_id and test_id are required' });

    const tester = tester_id || (req as any).userId || null;
    const result_res = await dbRun(
      'INSERT INTO qc_results (batch_id, test_id, result, status, tested_at, tester_id, notes) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [batch_id, test_id, result || null, status || 'pending', tested_at || null, tester, notes || null]
    );

    res.status(201).json({ message: 'QC result recorded', data: { id: result_res.insertId } });
  } catch (error) {
    console.error('Error creating QC result:', error);
    res.status(500).json({ error: 'Failed to create QC result' });
  }
});

router.put('/qc-results/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { result, status, tested_at, tester_id, notes } = req.body;
    await dbRun(
      'UPDATE qc_results SET result = ?, status = ?, tested_at = COALESCE(?, tested_at), tester_id = COALESCE(?, tester_id), notes = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [result || null, status, tested_at || null, tester_id || null, notes || null, req.params.id]
    );
    res.json({ message: 'QC result updated' });
  } catch (error) {
    console.error('Error updating QC result:', error);
    res.status(500).json({ error: 'Failed to update QC result' });
  }
});

// ============================================================
// QC Sampling Plans
// ============================================================
router.get('/sampling', authMiddleware, async (_req: Request, res: Response) => {
  try {
    const plans = await dbAll(
      `SELECT sp.*, p.name AS product_name, p.sku,
              qt.name AS test_name, qt.code AS test_code
       FROM qc_sampling_plans sp
       LEFT JOIN products p ON sp.product_id = p.id
       LEFT JOIN qc_tests qt ON sp.test_id = qt.id
       ORDER BY sp.created_at DESC`
    );
    res.json({ success: true, data: plans });
  } catch (error) {
    console.error('Error fetching sampling plans:', error);
    res.status(500).json({ error: 'Failed to fetch sampling plans' });
  }
});

router.post('/sampling', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { product_id, test_id, sample_size, frequency, aql_level, inspection_level, notes } = req.body;
    if (!product_id) return res.status(400).json({ error: 'product_id is required' });

    const result = await dbRun(
      `INSERT INTO qc_sampling_plans (product_id, test_id, sample_size, frequency, aql_level, inspection_level, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [product_id, test_id || null, sample_size || 1, frequency || 'per_batch', aql_level || '1.0', inspection_level || 'normal', notes || null]
    );
    res.status(201).json({ success: true, message: 'Sampling plan created', id: result.insertId });
  } catch (error) {
    res.status(500).json({ error: 'Failed to create sampling plan' });
  }
});

router.put('/sampling/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { product_id, test_id, sample_size, frequency, aql_level, inspection_level, notes } = req.body;
    await dbRun(
      `UPDATE qc_sampling_plans SET product_id=?, test_id=?, sample_size=?, frequency=?, aql_level=?, inspection_level=?, notes=? WHERE id=?`,
      [product_id, test_id || null, sample_size, frequency, aql_level, inspection_level, notes || null, req.params.id]
    );
    res.json({ success: true, message: 'Sampling plan updated' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update sampling plan' });
  }
});

router.delete('/sampling/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    await dbRun('DELETE FROM qc_sampling_plans WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: 'Sampling plan deleted' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete sampling plan' });
  }
});

// ============================================================
// Batch Release
// ============================================================
router.get('/batch-release', authMiddleware, async (_req: Request, res: Response) => {
  try {
    const batches = await dbAll(
      `SELECT b.id, b.batch_number, b.quantity, b.manufacture_date, b.expiry_date, b.status,
              p.name AS product_name, p.sku,
              w.name AS warehouse_name,
              (SELECT COUNT(*) FROM qc_results qr WHERE qr.batch_id = b.id) AS total_tests,
              (SELECT COUNT(*) FROM qc_results qr WHERE qr.batch_id = b.id AND qr.result_status = 'passed') AS passed_tests,
              (SELECT COUNT(*) FROM qc_results qr WHERE qr.batch_id = b.id AND qr.result_status = 'failed') AS failed_tests
       FROM batches b
       JOIN products p ON p.id = b.product_id
       LEFT JOIN warehouses w ON w.id = b.warehouse_id
       ORDER BY b.created_at DESC`
    );
    res.json({ success: true, data: batches });
  } catch (error) {
    console.error('Error fetching batch release data:', error);
    res.status(500).json({ error: 'Failed to fetch batch release data' });
  }
});

router.post('/batch-release/:batchId/release', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { notes } = req.body;
    await dbRun(
      `UPDATE batches SET status = 'released', updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [req.params.batchId]
    );
    res.json({ success: true, message: 'Batch released' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to release batch' });
  }
});

router.post('/batch-release/:batchId/reject', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { notes } = req.body;
    await dbRun(
      `UPDATE batches SET status = 'rejected', updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [req.params.batchId]
    );
    res.json({ success: true, message: 'Batch rejected' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to reject batch' });
  }
});

router.post('/batch-release/:batchId/hold', authMiddleware, async (req: Request, res: Response) => {
  try {
    await dbRun(
      `UPDATE batches SET status = 'on_hold', updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [req.params.batchId]
    );
    res.json({ success: true, message: 'Batch put on hold' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to hold batch' });
  }
});

// ============================================================
// Non-Conformance Reports (NCR)
// ============================================================
router.get('/ncr', authMiddleware, async (_req: Request, res: Response) => {
  try {
    const ncrs = await dbAll(
      `SELECT n.*, p.name AS product_name, b.batch_number,
              COALESCE(u1.full_name, u1.username) AS reported_by_name,
              COALESCE(u2.full_name, u2.username) AS assigned_to_name
       FROM qc_ncr n
       LEFT JOIN products p ON p.id = n.product_id
       LEFT JOIN batches b ON b.id = n.batch_id
       LEFT JOIN users u1 ON u1.id = n.reported_by
       LEFT JOIN users u2 ON u2.id = n.assigned_to
       ORDER BY n.created_at DESC`
    );
    res.json({ success: true, data: ncrs });
  } catch (error) {
    console.error('Error fetching NCRs:', error);
    res.status(500).json({ error: 'Failed to fetch NCRs' });
  }
});

router.get('/ncr/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const ncr = await dbGet(
      `SELECT n.*, p.name AS product_name, b.batch_number,
              COALESCE(u1.full_name, u1.username) AS reported_by_name
       FROM qc_ncr n
       LEFT JOIN products p ON p.id = n.product_id
       LEFT JOIN batches b ON b.id = n.batch_id
       LEFT JOIN users u1 ON u1.id = n.reported_by
       WHERE n.id = ?`,
      [req.params.id]
    );
    if (!ncr) return res.status(404).json({ error: 'NCR not found' });

    const actions = await dbAll(
      `SELECT a.*, COALESCE(u.full_name, u.username) AS action_by_name
       FROM qc_ncr_actions a LEFT JOIN users u ON u.id = a.action_by WHERE a.ncr_id = ? ORDER BY a.created_at ASC`,
      [req.params.id]
    );
    res.json({ success: true, data: { ...ncr, actions } });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch NCR' });
  }
});

router.post('/ncr', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { ncr_number, product_id, batch_id, category, severity, description, root_cause, assigned_to } = req.body;
    if (!description) return res.status(400).json({ error: 'description is required' });

    const userId = (req as any).user?.userId;
    const number = ncr_number || generateCode('NCR');

    const result = await dbRun(
      `INSERT INTO qc_ncr (ncr_number, product_id, batch_id, category, severity, description, root_cause, status, reported_by, assigned_to)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'open', ?, ?)`,
      [number, product_id || null, batch_id || null, category || 'product', severity || 'minor', description, root_cause || null, userId, assigned_to || null]
    );
    res.status(201).json({ success: true, message: 'NCR created', id: result.insertId });
  } catch (error) {
    console.error('Error creating NCR:', error);
    res.status(500).json({ error: 'Failed to create NCR' });
  }
});

router.put('/ncr/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { category, severity, description, root_cause, corrective_action, preventive_action, status, assigned_to } = req.body;
    await dbRun(
      `UPDATE qc_ncr SET category=?, severity=?, description=?, root_cause=?, corrective_action=?, preventive_action=?, status=?, assigned_to=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`,
      [category, severity, description, root_cause || null, corrective_action || null, preventive_action || null, status, assigned_to || null, req.params.id]
    );
    res.json({ success: true, message: 'NCR updated' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update NCR' });
  }
});

router.post('/ncr/:id/actions', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { action_type, description, due_date } = req.body;
    const userId = (req as any).user?.userId;
    const result = await dbRun(
      `INSERT INTO qc_ncr_actions (ncr_id, action_type, description, due_date, status, action_by)
       VALUES (?, ?, ?, ?, 'open', ?)`,
      [req.params.id, action_type || 'corrective', description, due_date || null, userId]
    );
    res.status(201).json({ success: true, message: 'Action added', id: result.insertId });
  } catch (error) {
    res.status(500).json({ error: 'Failed to add action' });
  }
});

// ============================================================
// Rework Orders
// ============================================================
router.get('/rework', authMiddleware, async (_req: Request, res: Response) => {
  try {
    const reworks = await dbAll(
      `SELECT r.*, n.ncr_number, p.name AS product_name, b.batch_number,
              w.wo_number,
              COALESCE(u.full_name, u.username) AS created_by_name
       FROM qc_rework_orders r
       LEFT JOIN qc_ncr n ON n.id = r.ncr_id
       LEFT JOIN products p ON p.id = r.product_id
       LEFT JOIN batches b ON b.id = r.batch_id
       LEFT JOIN work_orders w ON w.id = r.wo_id
       LEFT JOIN users u ON u.id = r.created_by
       ORDER BY r.created_at DESC`
    );
    res.json({ success: true, data: reworks });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch rework orders' });
  }
});

router.post('/rework', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { ncr_id, product_id, batch_id, wo_id, quantity, description, instructions } = req.body;
    const userId = (req as any).user?.userId;
    const reworkNumber = generateCode('RW');

    const result = await dbRun(
      `INSERT INTO qc_rework_orders (rework_number, ncr_id, product_id, batch_id, wo_id, quantity, description, instructions, status, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`,
      [reworkNumber, ncr_id || null, product_id || null, batch_id || null, wo_id || null, quantity || 0, description || null, instructions || null, userId]
    );
    res.status(201).json({ success: true, message: 'Rework order created', id: result.insertId });
  } catch (error) {
    res.status(500).json({ error: 'Failed to create rework order' });
  }
});

router.put('/rework/:id/status', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { status } = req.body;
    await dbRun('UPDATE qc_rework_orders SET status=?, updated_at=CURRENT_TIMESTAMP WHERE id=?', [status, req.params.id]);
    res.json({ success: true, message: 'Rework status updated' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update rework status' });
  }
});

// ============================================================
// QC Reports — aggregated stats
// ============================================================
router.get('/reports/summary', authMiddleware, async (_req: Request, res: Response) => {
  try {
    const stats = await dbGet(
      `SELECT
         (SELECT COUNT(*) FROM batches) AS total_batches,
         (SELECT COUNT(*) FROM batches WHERE status='released') AS released_batches,
         (SELECT COUNT(*) FROM batches WHERE status='rejected') AS rejected_batches,
         (SELECT COUNT(*) FROM qc_results) AS total_tests,
         (SELECT COUNT(*) FROM qc_results WHERE result_status='passed') AS passed_tests,
         (SELECT COUNT(*) FROM qc_results WHERE result_status='failed') AS failed_tests,
         (SELECT COUNT(*) FROM qc_ncr WHERE status='open') AS open_ncrs`
    );
    res.json({ success: true, data: stats });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch QC report summary' });
  }
});

export default router;
