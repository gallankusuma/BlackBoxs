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

// ─── INBOX ──────────────────────────────────────────────

// GET /inbox — unified pending approvals for current user
router.get('/inbox', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    const userLevel = Number((req as any).user?.userLevel || 0);
    const { module, entity_type } = req.query;

    let sql = `
      SELECT ar.*, u.full_name AS requester_name
      FROM approval_requests ar
      LEFT JOIN users u ON ar.requester_id = u.id
      WHERE ar.status = 'pending'
    `;
    const params: any[] = [];

    // ── Permission-based inbox filtering ──
    // Master Admin (level 10+) sees everything.
    // Other users see items only if they have the correct approve/approve_1/approve_2 permission
    // for the module, OR if no rules/permissions exist for that module (fallback: visible to all).
    if (userLevel < 10) {
      // Get all permission resources the user can approve (via role)
      const userRow = await dbGet('SELECT role_id FROM users WHERE id = ?', [userId]) as any;
      const roleId = userRow?.role_id;

      if (roleId) {
        // Get resources this user can approve (approve, approve_1, or approve_2)
        const approvePerms = await dbAll(
          `SELECT DISTINCT p.resource FROM permissions p
           JOIN role_permissions rp ON p.id = rp.permission_id
           WHERE rp.role_id = ? AND p.action IN ('approve', 'approve_1', 'approve_2')`,
          [roleId]
        ) as any[];

        if (approvePerms.length > 0) {
          // Map module names to permission resource patterns
          // approval_requests.module is like 'finance', 'procurement', etc.
          // We check if ANY of the user's approve permissions matches the module
          sql += ` AND (
            EXISTS (
              SELECT 1 FROM approval_rule_steps ars
              JOIN approval_rules arl ON ars.rule_id = arl.id
              WHERE arl.module = ar.module
                AND ars.step_order = ar.current_step
                AND (ars.approver_user_id = ? OR ars.approver_user_id IS NULL)
            )
            OR NOT EXISTS (
              SELECT 1 FROM approval_rule_steps ars
              JOIN approval_rules arl ON ars.rule_id = arl.id
              WHERE arl.module = ar.module
            )
          )`;
          params.push(userId);
        } else {
          // User has no approve permissions at all — show nothing
          sql += ' AND 1 = 0';
        }
      } else {
        // No role assigned — show nothing
        sql += ' AND 1 = 0';
      }
    }

    if (module) {
      sql += ' AND ar.module = ?';
      params.push(module);
    }
    if (entity_type) {
      sql += ' AND ar.entity_type = ?';
      params.push(entity_type);
    }

    sql += ' ORDER BY ar.submitted_at DESC';

    const requests = await dbAll(sql, params) as any[];

    // ── Enrich with entity details ──
    for (const r of requests) {
      try {
        if (r.entity_type === 'fund_request') {
          const fr = await dbGet(
            `SELECT fr.id, fr.request_number, fr.purpose, fr.amount, fr.needed_date, fr.status,
                    fr.cash_account, fr.cash_account_note,
                    u.full_name AS requester_name,
                    (SELECT COUNT(*) FROM fund_request_items fri WHERE fri.fund_request_id = fr.id) AS item_count,
                    (SELECT COUNT(*) FROM fund_request_items fri WHERE fri.fund_request_id = fr.id AND fri.status = 'pending') AS pending_count
             FROM fund_requests fr
             LEFT JOIN users u ON fr.requester_id = u.id
             WHERE fr.id = ?`,
            [r.entity_id]
          );
          r.entity = fr || null;

        } else if (r.entity_type === 'purchase_order') {
          const po = await dbGet(
            `SELECT po.id, po.po_number, po.order_date, po.total_amount, po.status,
                    po.approval_status, po.notes, po.expected_date,
                    v.name AS vendor_name,
                    (SELECT COUNT(*) FROM purchase_order_items poi WHERE poi.po_id = po.id) AS item_count,
                    pr.pr_number
             FROM purchase_orders po
             LEFT JOIN vendors v ON po.vendor_id = v.id
             LEFT JOIN purchase_requests pr ON po.pr_id = pr.id
             WHERE po.id = ?`,
            [r.entity_id]
          );
          r.entity = po || null;

        } else if (r.entity_type === 'purchase_request') {
          const pr = await dbGet(
            `SELECT pr.id, pr.pr_number, pr.request_date, pr.status, pr.approval_status,
                    pr.department, pr.notes, pr.priority,
                    u.full_name AS requester_name,
                    (SELECT COUNT(*) FROM purchase_request_items pri WHERE pri.purchase_request_id = pr.id) AS item_count,
                    (SELECT COALESCE(SUM(pri.quantity * pri.estimated_price), 0) FROM purchase_request_items pri WHERE pri.purchase_request_id = pr.id) AS estimated_total
             FROM purchase_requests pr
             LEFT JOIN users u ON pr.requester_id = u.id
             WHERE pr.id = ?`,
            [r.entity_id]
          );
          r.entity = pr || null;

        } else if (r.entity_type === 'grn') {
          const grn = await dbGet(
            `SELECT g.id, g.grn_number, g.received_date, g.status, g.notes,
                    po.po_number, v.name AS vendor_name,
                    (SELECT COUNT(*) FROM grn_items gi WHERE gi.grn_id = g.id) AS item_count,
                    (SELECT COALESCE(SUM(gi.quantity_received), 0) FROM grn_items gi WHERE gi.grn_id = g.id) AS total_qty_received
             FROM goods_receipts g
             LEFT JOIN purchase_orders po ON g.po_id = po.id
             LEFT JOIN vendors v ON po.vendor_id = v.id
             WHERE g.id = ?`,
            [r.entity_id]
          );
          r.entity = grn || null;
        }
      } catch (enrichErr) {
        console.warn(`Failed to enrich entity ${r.entity_type}#${r.entity_id}:`, (enrichErr as any)?.message);
        r.entity = null;
      }
    }

    res.json({ success: true, data: requests });
  } catch (error) {
    console.error('Error fetching approval inbox:', error);
    res.status(500).json({ error: 'Failed to fetch approval inbox' });
  }
});

// PUT /inbox/:id/approve — approve a request
router.put('/inbox/:id/approve', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    const { id } = req.params;
    const { comments } = req.body;

    const request = await dbGet('SELECT * FROM approval_requests WHERE id = ?', [id]);
    if (!request) return res.status(404).json({ error: 'Request not found' });
    if (request.status !== 'pending') return res.status(400).json({ error: 'Request is not pending' });

    // Record the action
    await dbRun(
      'INSERT INTO approval_actions (request_id, step_order, approver_id, action, comments) VALUES (?, ?, ?, ?, ?)',
      [id, request.current_step, userId, 'approved', comments || null]
    );

    // Check if there are more steps
    const nextStep = await dbGet(
      `SELECT ars.* FROM approval_rule_steps ars
       JOIN approval_rules arl ON ars.rule_id = arl.id
       WHERE arl.module = ? AND ars.step_order = ?`,
      [request.module, request.current_step + 1]
    );

    if (nextStep) {
      // Move to next step
      await dbRun('UPDATE approval_requests SET current_step = ? WHERE id = ?', [request.current_step + 1, id]);
    } else {
      // Final approval
      await dbRun(
        'UPDATE approval_requests SET status = ?, completed_at = NOW() WHERE id = ?',
        ['approved', id]
      );
    }

    res.json({ success: true, message: 'Approved successfully' });
  } catch (error) {
    console.error('Error approving request:', error);
    res.status(500).json({ error: 'Failed to approve request' });
  }
});

// PUT /inbox/:id/reject — reject a request
router.put('/inbox/:id/reject', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    const { id } = req.params;
    const { comments } = req.body;

    const request = await dbGet('SELECT * FROM approval_requests WHERE id = ?', [id]);
    if (!request) return res.status(404).json({ error: 'Request not found' });
    if (request.status !== 'pending') return res.status(400).json({ error: 'Request is not pending' });

    await dbRun(
      'INSERT INTO approval_actions (request_id, step_order, approver_id, action, comments) VALUES (?, ?, ?, ?, ?)',
      [id, request.current_step, userId, 'rejected', comments || null]
    );

    await dbRun(
      'UPDATE approval_requests SET status = ?, completed_at = NOW() WHERE id = ?',
      ['rejected', id]
    );

    res.json({ success: true, message: 'Rejected successfully' });
  } catch (error) {
    console.error('Error rejecting request:', error);
    res.status(500).json({ error: 'Failed to reject request' });
  }
});

// ─── HISTORY ────────────────────────────────────────────

// GET /history — all past approval actions for current user or all
router.get('/history', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { module, entity_type, status, from_date, to_date } = req.query;

    let sql = `
      SELECT ar.*, u.full_name AS requester_name,
        (SELECT GROUP_CONCAT(
          CONCAT(aa.action, ' by ', COALESCE(au.full_name, 'Unknown'), ' on ', aa.acted_at)
          ORDER BY aa.acted_at SEPARATOR '; '
        )
        FROM approval_actions aa
        LEFT JOIN users au ON aa.approver_id = au.id
        WHERE aa.request_id = ar.id
        ) AS action_trail
      FROM approval_requests ar
      LEFT JOIN users u ON ar.requester_id = u.id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (module) { sql += ' AND ar.module = ?'; params.push(module); }
    if (entity_type) { sql += ' AND ar.entity_type = ?'; params.push(entity_type); }
    if (status) { sql += ' AND ar.status = ?'; params.push(status); }
    if (from_date) { sql += ' AND ar.submitted_at >= ?'; params.push(from_date); }
    if (to_date) { sql += ' AND ar.submitted_at <= ?'; params.push(to_date); }

    sql += ' ORDER BY ar.submitted_at DESC LIMIT 200';

    const history = await dbAll(sql, params);
    res.json({ success: true, data: history });
  } catch (error) {
    console.error('Error fetching approval history:', error);
    res.status(500).json({ error: 'Failed to fetch approval history' });
  }
});

// GET /history/stats — aggregate stats
router.get('/history/stats', authMiddleware, async (req: Request, res: Response) => {
  try {
    const stats = await dbGet(`
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) AS approved,
        SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) AS rejected,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending,
        SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) AS cancelled
      FROM approval_requests
    `, []);
    res.json({ success: true, data: stats });
  } catch (error) {
    console.error('Error fetching approval stats:', error);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// ─── RULES ──────────────────────────────────────────────

// GET /rules — list all approval rules with their steps
router.get('/rules', authMiddleware, async (req: Request, res: Response) => {
  try {
    const rules = await dbAll(`
      SELECT ar.*, r.name AS approver_role_name
      FROM approval_rules ar
      LEFT JOIN roles r ON ar.approver_role_id = r.id
      ORDER BY ar.module, ar.sequence
    `, []);

    // Attach steps to each rule
    for (const rule of rules) {
      rule.steps = await dbAll(`
        SELECT ars.*, r.name AS role_name, u.full_name AS user_name
        FROM approval_rule_steps ars
        LEFT JOIN roles r ON ars.approver_role_id = r.id
        LEFT JOIN users u ON ars.approver_user_id = u.id
        WHERE ars.rule_id = ?
        ORDER BY ars.step_order
      `, [rule.id]);
    }

    res.json({ success: true, data: rules });
  } catch (error) {
    console.error('Error fetching approval rules:', error);
    res.status(500).json({ error: 'Failed to fetch approval rules' });
  }
});

// POST /rules — create a new approval rule
router.post('/rules', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { name, module, condition_field, min_value, max_value, approver_role_id, sequence, steps } = req.body;

    const result = await dbRun(
      `INSERT INTO approval_rules (name, module, condition_field, min_value, max_value, approver_role_id, sequence)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [name, module, condition_field || null, min_value || null, max_value || null, approver_role_id || null, sequence || 1]
    );

    // Insert steps if provided
    if (steps && Array.isArray(steps)) {
      for (const step of steps) {
        await dbRun(
          `INSERT INTO approval_rule_steps (rule_id, step_order, approver_role_id, approver_user_id, can_reject, is_parallel)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [result.insertId, step.step_order, step.approver_role_id || null, step.approver_user_id || null, step.can_reject !== false, step.is_parallel || false]
        );
      }
    }

    res.status(201).json({ success: true, data: { id: result.insertId } });
  } catch (error) {
    console.error('Error creating approval rule:', error);
    res.status(500).json({ error: 'Failed to create approval rule' });
  }
});

// PUT /rules/:id — update an approval rule
router.put('/rules/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, module, condition_field, min_value, max_value, approver_role_id, sequence, is_active, steps } = req.body;

    await dbRun(
      `UPDATE approval_rules SET name=?, module=?, condition_field=?, min_value=?, max_value=?,
       approver_role_id=?, sequence=?, is_active=? WHERE id=?`,
      [name, module, condition_field || null, min_value || null, max_value || null, approver_role_id || null, sequence || 1, is_active !== false, id]
    );

    // Re-create steps if provided
    if (steps && Array.isArray(steps)) {
      await dbRun('DELETE FROM approval_rule_steps WHERE rule_id = ?', [id]);
      for (const step of steps) {
        await dbRun(
          `INSERT INTO approval_rule_steps (rule_id, step_order, approver_role_id, approver_user_id, can_reject, is_parallel)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [id, step.step_order, step.approver_role_id || null, step.approver_user_id || null, step.can_reject !== false, step.is_parallel || false]
        );
      }
    }

    res.json({ success: true, message: 'Rule updated' });
  } catch (error) {
    console.error('Error updating approval rule:', error);
    res.status(500).json({ error: 'Failed to update rule' });
  }
});

// DELETE /rules/:id
router.delete('/rules/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    await dbRun('DELETE FROM approval_rules WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: 'Rule deleted' });
  } catch (error) {
    console.error('Error deleting approval rule:', error);
    res.status(500).json({ error: 'Failed to delete rule' });
  }
});

// ─── DELEGATION ─────────────────────────────────────────

// GET /delegations
router.get('/delegations', authMiddleware, async (req: Request, res: Response) => {
  try {
    const delegations = await dbAll(`
      SELECT d.*, 
        df.full_name AS from_user_name, 
        dt.full_name AS to_user_name
      FROM approval_delegations d
      LEFT JOIN users df ON d.from_user_id = df.id
      LEFT JOIN users dt ON d.to_user_id = dt.id
      ORDER BY d.start_date DESC
    `, []);
    res.json({ success: true, data: delegations });
  } catch (error) {
    console.error('Error fetching delegations:', error);
    res.status(500).json({ error: 'Failed to fetch delegations' });
  }
});

// POST /delegations — create delegation
router.post('/delegations', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    const { to_user_id, module, start_date, end_date, reason } = req.body;

    const result = await dbRun(
      `INSERT INTO approval_delegations (from_user_id, to_user_id, module, start_date, end_date, reason, is_active)
       VALUES (?, ?, ?, ?, ?, ?, TRUE)`,
      [userId, to_user_id, module || null, start_date, end_date, reason || null]
    );

    res.status(201).json({ success: true, data: { id: result.insertId } });
  } catch (error) {
    console.error('Error creating delegation:', error);
    res.status(500).json({ error: 'Failed to create delegation' });
  }
});

// PUT /delegations/:id/deactivate
router.put('/delegations/:id/deactivate', authMiddleware, async (req: Request, res: Response) => {
  try {
    await dbRun('UPDATE approval_delegations SET is_active = FALSE WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: 'Delegation deactivated' });
  } catch (error) {
    console.error('Error deactivating delegation:', error);
    res.status(500).json({ error: 'Failed to deactivate delegation' });
  }
});

// DELETE /delegations/:id
router.delete('/delegations/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    await dbRun('DELETE FROM approval_delegations WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: 'Delegation deleted' });
  } catch (error) {
    console.error('Error deleting delegation:', error);
    res.status(500).json({ error: 'Failed to delete delegation' });
  }
});

// ─── ESCALATION ─────────────────────────────────────────

// GET /escalations
router.get('/escalations', authMiddleware, async (req: Request, res: Response) => {
  try {
    const escalations = await dbAll(`
      SELECT e.*, u.full_name AS escalate_to_name
      FROM approval_escalations e
      LEFT JOIN users u ON e.escalate_to_user_id = u.id
      ORDER BY e.module, e.hours_threshold
    `, []);
    res.json({ success: true, data: escalations });
  } catch (error) {
    console.error('Error fetching escalations:', error);
    res.status(500).json({ error: 'Failed to fetch escalation rules' });
  }
});

// POST /escalations
router.post('/escalations', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { module, hours_threshold, escalate_to_user_id, escalate_to_role_id, notify_requester, notify_admin } = req.body;

    const result = await dbRun(
      `INSERT INTO approval_escalations (module, hours_threshold, escalate_to_user_id, escalate_to_role_id, notify_requester, notify_admin, is_active)
       VALUES (?, ?, ?, ?, ?, ?, TRUE)`,
      [module, hours_threshold, escalate_to_user_id || null, escalate_to_role_id || null, notify_requester !== false, notify_admin !== false]
    );

    res.status(201).json({ success: true, data: { id: result.insertId } });
  } catch (error) {
    console.error('Error creating escalation rule:', error);
    res.status(500).json({ error: 'Failed to create escalation rule' });
  }
});

// PUT /escalations/:id
router.put('/escalations/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { module, hours_threshold, escalate_to_user_id, escalate_to_role_id, notify_requester, notify_admin, is_active } = req.body;

    await dbRun(
      `UPDATE approval_escalations SET module=?, hours_threshold=?, escalate_to_user_id=?, escalate_to_role_id=?,
       notify_requester=?, notify_admin=?, is_active=? WHERE id=?`,
      [module, hours_threshold, escalate_to_user_id || null, escalate_to_role_id || null, notify_requester !== false, notify_admin !== false, is_active !== false, id]
    );

    res.json({ success: true, message: 'Escalation rule updated' });
  } catch (error) {
    console.error('Error updating escalation:', error);
    res.status(500).json({ error: 'Failed to update escalation rule' });
  }
});

// DELETE /escalations/:id
router.delete('/escalations/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    await dbRun('DELETE FROM approval_escalations WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: 'Escalation rule deleted' });
  } catch (error) {
    console.error('Error deleting escalation:', error);
    res.status(500).json({ error: 'Failed to delete escalation rule' });
  }
});

// ─── SUBMIT REQUEST (for other modules to call) ────────

// POST /submit — submit a new approval request
router.post('/submit', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    const { module, entity_type, entity_id, notes } = req.body;

    const requestNumber = generateCode('APR');
    const result = await dbRun(
      `INSERT INTO approval_requests (request_number, module, entity_type, entity_id, requester_id, current_step, status, notes)
       VALUES (?, ?, ?, ?, ?, 1, 'pending', ?)`,
      [requestNumber, module, entity_type, entity_id, userId, notes || null]
    );

    res.status(201).json({ success: true, data: { id: result.insertId, request_number: requestNumber } });
  } catch (error) {
    console.error('Error submitting approval request:', error);
    res.status(500).json({ error: 'Failed to submit approval request' });
  }
});

export default router;
