import { Router, Request, Response } from 'express';
import { dbAll, dbGet, dbRun } from '../config/database';
import { authMiddleware } from '../middleware/auth';

const router = Router();

// GET /api/bom - Get all BOM headers
router.get('/', authMiddleware, async (req: Request, res: Response) => {
  try {
    const boms = await dbAll(`
      SELECT bh.id, bh.product_name, bh.product_id, bh.version, bh.status, bh.notes, 
             bh.created_by, bh.created_at, bh.updated_at,
             bh.approval_status, bh.approved_by_supervisor_id, bh.approved_by_manager_id,
             bh.approved_at_supervisor, bh.approved_at_manager,
             sup.full_name as supervisor_name, mgr.full_name as manager_name
      FROM bom_headers bh
      LEFT JOIN users sup ON bh.approved_by_supervisor_id = sup.id
      LEFT JOIN users mgr ON bh.approved_by_manager_id = mgr.id
      ORDER BY bh.created_at DESC
    `, []);
    res.json({ data: boms });
  } catch (error) {
    console.error('Error fetching BOMs:', error);
    res.status(500).json({ error: 'Failed to fetch BOMs' });
  }
});

// GET /api/bom/:id - Get specific BOM header with details
router.get('/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const bomHeader = await dbGet(`
      SELECT bh.id, bh.product_name, bh.product_id, bh.version, bh.status, bh.notes, 
             bh.created_by, bh.created_at, bh.updated_at,
             bh.approval_status, bh.approved_by_supervisor_id, bh.approved_by_manager_id,
             bh.approved_at_supervisor, bh.approved_at_manager,
             sup.full_name as supervisor_name, mgr.full_name as manager_name
      FROM bom_headers bh
      LEFT JOIN users sup ON bh.approved_by_supervisor_id = sup.id
      LEFT JOIN users mgr ON bh.approved_by_manager_id = mgr.id
      WHERE bh.id = ?
    `, [req.params.id]);
    
    if (!bomHeader) {
      return res.status(404).json({ error: 'BOM not found' });
    }

    // Get BOM details
    const details = await dbAll(`
      SELECT bd.id, bd.bom_header_id, bd.raw_material_id, bd.quantity, bd.unit_of_measure_id,
             bd.sequence, bd.created_at,
             p.name as material_name, p.sku as material_sku,
             u.code as unit_code, u.name as unit_name
      FROM bom_details bd
      LEFT JOIN products p ON bd.raw_material_id = p.id
      LEFT JOIN uom u ON bd.unit_of_measure_id = u.id
      WHERE bd.bom_header_id = ?
      ORDER BY bd.sequence ASC
    `, [req.params.id]);

    res.json({ data: { ...bomHeader, details } });
  } catch (error) {
    console.error('Error fetching BOM:', error);
    res.status(500).json({ error: 'Failed to fetch BOM' });
  }
});

// POST /api/bom - Create BOM header with details
router.post('/', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { product_name, notes, details } = req.body;
    const userId = (req as any).user?.userId;

    console.log('📥 [BOM POST] Received payload:', { product_name, notes, details_count: details?.length });
    console.log('📥 [BOM POST] Auth info - userId:', userId, 'full user:', (req as any).user);

    if (!product_name) {
      return res.status(400).json({ error: 'product_name is required' });
    }

    // Validate that userId exists in the users table before using it
    let createdBy = null;
    if (userId) {
      try {
        const userExists = await dbGet('SELECT id FROM users WHERE id = ?', [userId]);
        if (userExists) {
          createdBy = parseInt(String(userId), 10);
          console.log('✅ User ID exists:', createdBy);
        } else {
          console.log('⚠️  User ID', userId, 'not found in database, will set created_by to NULL');
          createdBy = null;
        }
      } catch (userCheckError) {
        console.log('⚠️  Error checking user existence:', userCheckError);
        // If we can't check, don't use the userId
        createdBy = null;
      }
    }

    // Create BOM header - created_by is nullable
    console.log('📝 [BOM POST] Creating header with:', { product_name, userId, createdBy });
    const headerResult = await dbRun(
      'INSERT INTO bom_headers (product_name, status, notes, created_by) VALUES (?, ?, ?, ?)',
      [product_name, 'ACTIVE', notes || null, createdBy]
    );

    const bomHeaderId = headerResult.insertId;
    console.log('✅ [BOM POST] Header created with ID:', bomHeaderId);

    // Create BOM details if provided
    if (Array.isArray(details) && details.length > 0) {
      console.log('📋 [BOM POST] Creating', details.length, 'details...');
      for (let i = 0; i < details.length; i++) {
        const detail = details[i];
        console.log(`  Detail ${i}:`, detail);
        
        if (!detail.raw_material_id || !detail.quantity) {
          return res.status(400).json({ error: 'Each BOM detail must include raw_material_id and quantity' });
        }
        
        console.log(`  Inserting: bom_header_id=${bomHeaderId}, raw_material_id=${detail.raw_material_id}, quantity=${detail.quantity}, unit_id=${detail.unit_of_measure_id}`);
        
        await dbRun(
          'INSERT INTO bom_details (bom_header_id, raw_material_id, quantity, unit_of_measure_id, sequence) VALUES (?, ?, ?, ?, ?)',
          [bomHeaderId, detail.raw_material_id, detail.quantity, detail.unit_of_measure_id || null, i + 1]
        );
      }
      console.log('✅ [BOM POST] All details inserted');
    }

    res.status(201).json({
      message: 'BOM created successfully',
      data: { id: bomHeaderId, product_name, notes, details_count: details?.length || 0 },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create BOM';
    console.error('❌ [BOM POST] Error:', message);
    console.error('Stack:', error);
    res.status(500).json({ error: message });
  }
});

// PUT /api/bom/:id - Update BOM header and details
router.put('/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { notes, details, status } = req.body;

    // Update BOM header
    if (notes !== undefined || status !== undefined) {
      await dbRun(
        'UPDATE bom_headers SET notes = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [notes || null, status || 'ACTIVE', req.params.id]
      );
    }

    // Update BOM details if provided
    if (Array.isArray(details) && details.length > 0) {
      // Delete existing details
      await dbRun('DELETE FROM bom_details WHERE bom_header_id = ?', [req.params.id]);
      
      // Insert new details
      for (let i = 0; i < details.length; i++) {
        const detail = details[i];
        await dbRun(
          'INSERT INTO bom_details (bom_header_id, raw_material_id, quantity, unit_of_measure_id, sequence) VALUES (?, ?, ?, ?, ?)',
          [req.params.id, detail.raw_material_id, detail.quantity, detail.unit_of_measure_id || null, i + 1]
        );
      }
    }

    res.json({ message: 'BOM updated successfully' });
  } catch (error) {
    console.error('Error updating BOM:', error);
    res.status(500).json({ error: 'Failed to update BOM' });
  }
});

// DELETE /api/bom/:id - Delete BOM (cascade deletes details)
router.delete('/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    // Delete from bom_headers (details cascade delete via FK)
    await dbRun('DELETE FROM bom_headers WHERE id = ?', [req.params.id]);

    res.json({ message: 'BOM deleted successfully' });
  } catch (error) {
    console.error('Error deleting BOM:', error);
    res.status(500).json({ error: 'Failed to delete BOM' });
  }
});

// POST /api/bom/:id/approve - 2-Tier Approval (Supervisor → Manager/Director)
router.post('/:id/approve', authMiddleware, async (req: Request, res: Response) => {
  try {
    const bomId = req.params.id;
    const userId = (req as any).user?.userId;
    const userLevel = (req as any).user?.userLevel || 1;

    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const bom = await dbGet('SELECT id, approval_status FROM bom_headers WHERE id = ?', [bomId]) as any;
    if (!bom) return res.status(404).json({ error: 'BOM not found' });

    const currentStatus = bom.approval_status || 0;
    const approverRow = await dbGet('SELECT id FROM users WHERE id = ?', [userId]) as { id: number } | undefined;
    const approverId = approverRow ? userId : null;

    // Director / Master (>=4): direct full approval
    if (userLevel >= 4 && currentStatus < 2) {
      await dbRun(
        'UPDATE bom_headers SET approval_status = 2, approved_by_supervisor_id = ?, approved_by_manager_id = ?, approved_at_supervisor = CURRENT_TIMESTAMP, approved_at_manager = CURRENT_TIMESTAMP WHERE id = ?',
        [approverId, approverId, bomId]
      );
      return res.json({ message: 'BOM fully approved (DIRECT)', approval_status: 2 });
    }

    // Supervisor (2): 0 -> 1
    if (userLevel === 2 && currentStatus === 0) {
      await dbRun(
        'UPDATE bom_headers SET approval_status = 1, approved_by_supervisor_id = ?, approved_at_supervisor = CURRENT_TIMESTAMP WHERE id = ?',
        [approverId, bomId]
      );
      return res.json({ message: 'BOM approved by supervisor (1/2)', approval_status: 1 });
    }

    // Manager (3): 1 -> 2
    if (userLevel === 3 && currentStatus === 1) {
      await dbRun(
        'UPDATE bom_headers SET approval_status = 2, approved_by_manager_id = ?, approved_at_manager = CURRENT_TIMESTAMP WHERE id = ?',
        [approverId, bomId]
      );
      return res.json({ message: 'BOM approved by manager (2/2)', approval_status: 2 });
    }

    return res.status(400).json({
      error: 'Cannot approve: insufficient level or invalid status',
      debug: { userLevel, currentStatus, needLevel: currentStatus === 0 ? 2 : 3 }
    });
  } catch (error) {
    console.error('Error approving BOM:', error);
    res.status(500).json({ error: 'Failed to approve BOM' });
  }
});

// POST /api/bom/:id/reject - Reject BOM
router.post('/:id/reject', authMiddleware, async (req: Request, res: Response) => {
  try {
    const bomId = req.params.id;
    const userId = (req as any).user?.userId;
    const userLevel = (req as any).user?.userLevel || 1;

    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    if (userLevel < 2) return res.status(403).json({ error: 'Insufficient permission to reject' });

    const bom = await dbGet('SELECT id, approval_status FROM bom_headers WHERE id = ?', [bomId]) as any;
    if (!bom) return res.status(404).json({ error: 'BOM not found' });

    // Reset approval
    await dbRun(
      'UPDATE bom_headers SET approval_status = -1, approved_by_supervisor_id = NULL, approved_by_manager_id = NULL, approved_at_supervisor = NULL, approved_at_manager = NULL WHERE id = ?',
      [bomId]
    );
    return res.json({ message: 'BOM rejected', approval_status: -1 });
  } catch (error) {
    console.error('Error rejecting BOM:', error);
    res.status(500).json({ error: 'Failed to reject BOM' });
  }
});

export default router;
