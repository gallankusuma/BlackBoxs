import { Router, Request, Response } from 'express';
import pool from '../config/database';
import { RowDataPacket, ResultSetHeader } from 'mysql2';

const router = Router();

// Helper
const authMiddleware = (req: Request, res: Response, next: Function) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const jwt = require('jsonwebtoken');
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'erp-secret-key-2024');
    (req as any).user = decoded;
    next();
  } catch { return res.status(401).json({ error: 'Invalid token' }); }
};

// ==================== R&D PROJECTS ====================

// GET all projects
router.get('/projects', authMiddleware, async (req: Request, res: Response) => {
  try {
    const [rows] = await pool.query<RowDataPacket[]>(`
      SELECT p.*, u.full_name as leader_name, d.name as department_name
      FROM rnd_projects p
      LEFT JOIN users u ON p.project_leader_id = u.id
      LEFT JOIN departments d ON p.department_id = d.id
      ORDER BY p.created_at DESC
    `);
    res.json({ data: rows });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// GET single project
router.get('/projects/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT p.*, u.full_name as leader_name, d.name as department_name
       FROM rnd_projects p
       LEFT JOIN users u ON p.project_leader_id = u.id
       LEFT JOIN departments d ON p.department_id = d.id
       WHERE p.id = ?`, [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json({ data: rows[0] });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// POST create project
router.post('/projects', authMiddleware, async (req: Request, res: Response) => {
  try {
    const b = req.body;
    const toNull = (v: any) => (v === '' || v === undefined) ? null : v;
    // Auto-generate project_code: RND-YYYY-NNN
    const year = new Date().getFullYear();
    const [lastRows] = await pool.query<RowDataPacket[]>(
      `SELECT project_code FROM rnd_projects WHERE project_code LIKE ? ORDER BY project_code DESC LIMIT 1`,
      [`RND-${year}-%`]
    );
    let seq = 1;
    if (lastRows.length && lastRows[0].project_code) {
      const parts = lastRows[0].project_code.split('-');
      seq = (parseInt(parts[2]) || 0) + 1;
    }
    const projectCode = `RND-${year}-${String(seq).padStart(3, '0')}`;
    const [result] = await pool.query<ResultSetHeader>(
      `INSERT INTO rnd_projects (project_code, name, project_type, category, description, objectives, expected_output, status, priority, risk_level, confidentiality, regulatory_requirements, target_market, target_product, project_leader_id, department_id, start_date, target_end_date, budget, tags, notes, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [projectCode, b.name, b.project_type||'new_product', b.category||'chemical', b.description, b.objectives, b.expected_output, b.status||'draft', b.priority||'medium', b.risk_level||'medium', b.confidentiality||'internal', b.regulatory_requirements, b.target_market, b.target_product, toNull(b.project_leader_id), toNull(b.department_id), toNull(b.start_date), toNull(b.target_end_date), b.budget||0, b.tags, b.notes, (req as any).user?.id]
    );
    res.status(201).json({ data: { id: result.insertId, project_code: projectCode }, message: 'Project created' });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// PUT update project
router.put('/projects/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const b = req.body;
    const toNull = (v: any) => (v === '' || v === undefined) ? null : v;
    // Fetch current to merge safely
    const [cur] = await pool.query<RowDataPacket[]>('SELECT * FROM rnd_projects WHERE id = ?', [req.params.id]);
    if (!cur.length) return res.status(404).json({ error: 'Not found' });
    const c = cur[0];
    await pool.query(
      `UPDATE rnd_projects SET project_code=?, name=?, project_type=?, category=?, description=?, objectives=?, expected_output=?, status=?, priority=?, risk_level=?, confidentiality=?, regulatory_requirements=?, target_market=?, target_product=?, project_leader_id=?, department_id=?, start_date=?, target_end_date=?, actual_end_date=?, budget=?, spent=?, tags=?, notes=? WHERE id=?`,
      [b.project_code||c.project_code, b.name||c.name, b.project_type||c.project_type, b.category||c.category, b.description??c.description, b.objectives??c.objectives, b.expected_output??c.expected_output, b.status||c.status, b.priority||c.priority, b.risk_level||c.risk_level, b.confidentiality||c.confidentiality, b.regulatory_requirements??c.regulatory_requirements, b.target_market??c.target_market, b.target_product??c.target_product, toNull(b.project_leader_id)??c.project_leader_id, toNull(b.department_id)??c.department_id, toNull(b.start_date)??c.start_date, toNull(b.target_end_date)??c.target_end_date, toNull(b.actual_end_date)??c.actual_end_date, b.budget??c.budget, b.spent??c.spent, b.tags??c.tags, b.notes??c.notes, req.params.id]
    );
    res.json({ message: 'Project updated' });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// PATCH update status only (for kanban drag-drop)
router.patch('/projects/:id/status', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { status } = req.body;
    await pool.query('UPDATE rnd_projects SET status = ? WHERE id = ?', [status, req.params.id]);
    res.json({ message: 'Status updated' });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// DELETE project (safe cascade for cancelled projects)
router.delete('/projects/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const projectId = req.params.id;
    const [[project]]: any = await pool.query('SELECT id, name, status FROM rnd_projects WHERE id = ?', [projectId]);
    if (!project) return res.status(404).json({ error: 'Project not found' });

    // Only allow delete for cancelled/draft projects
    if (project.status !== 'cancelled' && project.status !== 'draft') {
      return res.status(400).json({ 
        error: `Cannot delete project with status "${project.status}". Only cancelled or draft projects can be deleted.` 
      });
    }

    // Cascade delete all child records safely
    await pool.query('DELETE FROM rnd_project_tasks WHERE project_id = ?', [projectId]);
    await pool.query('DELETE FROM rnd_milestones WHERE project_id = ?', [projectId]);
    // Delete document files from disk
    const [docs]: any = await pool.query('SELECT file_path FROM rnd_documents WHERE project_id = ?', [projectId]);
    const path = require('path');
    const fs = require('fs');
    for (const doc of docs) {
      if (doc.file_path) {
        const fullPath = path.join(__dirname, '../..', doc.file_path);
        if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
      }
    }
    await pool.query('DELETE FROM rnd_documents WHERE project_id = ?', [projectId]);
    await pool.query('DELETE FROM rnd_document_folders WHERE project_id = ?', [projectId]);
    // Unlink formulations & lab tests (set project_id NULL instead of deleting)
    await pool.query('UPDATE rnd_formulations SET project_id = NULL WHERE project_id = ?', [projectId]);
    await pool.query('UPDATE rnd_lab_tests SET project_id = NULL WHERE project_id = ?', [projectId]);

    // Finally delete the project
    await pool.query('DELETE FROM rnd_projects WHERE id = ?', [projectId]);
    console.log(`✅ R&D Project #${projectId} "${project.name}" deleted with all child records.`);
    res.json({ message: 'Project deleted successfully' });
  } catch (err: any) { 
    console.error('Error deleting R&D project:', err.message);
    res.status(500).json({ error: err.message }); 
  }
});

// ==================== FORMULATIONS ====================

// GET all formulations
router.get('/formulations', authMiddleware, async (req: Request, res: Response) => {
  try {
    const [rows] = await pool.query<RowDataPacket[]>(`
      SELECT f.*, p.name as project_name, u.full_name as approved_by_name
      FROM rnd_formulations f
      LEFT JOIN rnd_projects p ON f.project_id = p.id
      LEFT JOIN users u ON f.approved_by = u.id
      ORDER BY f.created_at DESC
    `);
    res.json({ data: rows });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// GET single formulation with ingredients
router.get('/formulations/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT f.*, p.name as project_name FROM rnd_formulations f
       LEFT JOIN rnd_projects p ON f.project_id = p.id WHERE f.id = ?`, [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    const [ingredients] = await pool.query<RowDataPacket[]>(
      `SELECT fi.*, pr.name as product_name, pr.sku
       FROM rnd_formulation_ingredients fi
       LEFT JOIN products pr ON fi.product_id = pr.id
       WHERE fi.formulation_id = ? ORDER BY fi.sort_order`, [req.params.id]
    );
    res.json({ data: { ...rows[0], ingredients } });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// POST create formulation
router.post('/formulations', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { formula_code, name, version, project_id, product_type_id, status, target_specs, description, notes, ingredients } = req.body;
    const [result] = await pool.query<ResultSetHeader>(
      `INSERT INTO rnd_formulations (formula_code, name, version, project_id, product_type_id, status, target_specs, description, notes, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [formula_code, name, version || '1.0', project_id, product_type_id, status || 'draft', target_specs, description, notes, (req as any).user?.id]
    );
    // Insert ingredients if provided
    if (ingredients && Array.isArray(ingredients)) {
      for (let i = 0; i < ingredients.length; i++) {
        const ing = ingredients[i];
        await pool.query(
          `INSERT INTO rnd_formulation_ingredients (formulation_id, product_id, ingredient_name, quantity, unit, percentage, function_role, notes, sort_order)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [result.insertId, ing.product_id, ing.ingredient_name, ing.quantity || 0, ing.unit || 'kg', ing.percentage, ing.function_role, ing.notes, i]
        );
      }
    }
    res.status(201).json({ data: { id: result.insertId }, message: 'Formulation created' });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// PUT update formulation
router.put('/formulations/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { formula_code, name, version, project_id, product_type_id, status, target_specs, description, notes, ingredients } = req.body;
    await pool.query(
      `UPDATE rnd_formulations SET formula_code=?, name=?, version=?, project_id=?, product_type_id=?, status=?, target_specs=?, description=?, notes=? WHERE id=?`,
      [formula_code, name, version, project_id, product_type_id, status, target_specs, description, notes, req.params.id]
    );
    // Replace ingredients
    if (ingredients && Array.isArray(ingredients)) {
      await pool.query('DELETE FROM rnd_formulation_ingredients WHERE formulation_id = ?', [req.params.id]);
      for (let i = 0; i < ingredients.length; i++) {
        const ing = ingredients[i];
        await pool.query(
          `INSERT INTO rnd_formulation_ingredients (formulation_id, product_id, ingredient_name, quantity, unit, percentage, function_role, notes, sort_order)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [req.params.id, ing.product_id, ing.ingredient_name, ing.quantity || 0, ing.unit || 'kg', ing.percentage, ing.function_role, ing.notes, i]
        );
      }
    }
    res.json({ message: 'Formulation updated' });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// DELETE formulation
router.delete('/formulations/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    await pool.query('DELETE FROM rnd_formulations WHERE id = ?', [req.params.id]);
    res.json({ message: 'Deleted' });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ==================== LAB TESTS ====================

// GET all lab tests
router.get('/lab-tests', authMiddleware, async (req: Request, res: Response) => {
  try {
    const [rows] = await pool.query<RowDataPacket[]>(`
      SELECT t.*, f.name as formulation_name, f.formula_code,
             p.name as project_name, u.full_name as tester_name
      FROM rnd_lab_tests t
      LEFT JOIN rnd_formulations f ON t.formulation_id = f.id
      LEFT JOIN rnd_projects p ON t.project_id = p.id
      LEFT JOIN users u ON t.tested_by = u.id
      ORDER BY t.created_at DESC
    `);
    res.json({ data: rows });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// GET single lab test
router.get('/lab-tests/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT t.*, f.name as formulation_name, f.formula_code,
              p.name as project_name, u.full_name as tester_name
       FROM rnd_lab_tests t
       LEFT JOIN rnd_formulations f ON t.formulation_id = f.id
       LEFT JOIN rnd_projects p ON t.project_id = p.id
       LEFT JOIN users u ON t.tested_by = u.id
       WHERE t.id = ?`, [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json({ data: rows[0] });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// POST create lab test
router.post('/lab-tests', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { test_code, test_name, formulation_id, project_id, batch_number, test_type, method, equipment, status, test_date, tested_by, parameters, results, conclusion, notes } = req.body;
    const [result] = await pool.query<ResultSetHeader>(
      `INSERT INTO rnd_lab_tests (test_code, test_name, formulation_id, project_id, batch_number, test_type, method, equipment, status, test_date, tested_by, parameters, results, conclusion, notes, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [test_code, test_name, formulation_id, project_id, batch_number, test_type || 'chemical', method, equipment, status || 'scheduled', test_date, tested_by, parameters ? JSON.stringify(parameters) : null, results ? JSON.stringify(results) : null, conclusion || 'pending', notes, (req as any).user?.id]
    );
    res.status(201).json({ data: { id: result.insertId }, message: 'Lab test created' });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// PUT update lab test
router.put('/lab-tests/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { test_code, test_name, formulation_id, project_id, batch_number, test_type, method, equipment, status, test_date, tested_by, parameters, results, conclusion, notes } = req.body;
    await pool.query(
      `UPDATE rnd_lab_tests SET test_code=?, test_name=?, formulation_id=?, project_id=?, batch_number=?, test_type=?, method=?, equipment=?, status=?, test_date=?, tested_by=?, parameters=?, results=?, conclusion=?, notes=? WHERE id=?`,
      [test_code, test_name, formulation_id, project_id, batch_number, test_type, method, equipment, status, test_date, tested_by, parameters ? JSON.stringify(parameters) : null, results ? JSON.stringify(results) : null, conclusion, notes, req.params.id]
    );
    res.json({ message: 'Lab test updated' });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// DELETE lab test
router.delete('/lab-tests/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    await pool.query('DELETE FROM rnd_lab_tests WHERE id = ?', [req.params.id]);
    res.json({ message: 'Deleted' });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ==================== STABILITY STUDIES ====================

// GET all stability studies
router.get('/stability', authMiddleware, async (req: Request, res: Response) => {
  try {
    const [rows] = await pool.query<RowDataPacket[]>(`
      SELECT s.*, f.name as formulation_name, f.formula_code
      FROM rnd_stability_studies s
      LEFT JOIN rnd_formulations f ON s.formulation_id = f.id
      ORDER BY s.created_at DESC
    `);
    res.json({ data: rows });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// GET single stability study with checkpoints
router.get('/stability/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT s.*, f.name as formulation_name, f.formula_code
       FROM rnd_stability_studies s
       LEFT JOIN rnd_formulations f ON s.formulation_id = f.id
       WHERE s.id = ?`, [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    const [checkpoints] = await pool.query<RowDataPacket[]>(
      `SELECT c.*, u.full_name as tester_name FROM rnd_stability_checkpoints c
       LEFT JOIN users u ON c.tested_by = u.id
       WHERE c.study_id = ? ORDER BY c.checkpoint_month`, [req.params.id]
    );
    res.json({ data: { ...rows[0], checkpoints } });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// POST create stability study
router.post('/stability', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { study_code, name, formulation_id, batch_number, status, storage_condition, duration_months, start_date, end_date, protocol, checkpoints } = req.body;
    const [result] = await pool.query<ResultSetHeader>(
      `INSERT INTO rnd_stability_studies (study_code, name, formulation_id, batch_number, status, storage_condition, duration_months, start_date, end_date, protocol, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [study_code, name, formulation_id, batch_number, status || 'planned', storage_condition || '25°C / 60% RH', duration_months || 12, start_date, end_date, protocol, (req as any).user?.id]
    );
    // Create checkpoints if provided
    if (checkpoints && Array.isArray(checkpoints)) {
      for (const cp of checkpoints) {
        await pool.query(
          `INSERT INTO rnd_stability_checkpoints (study_id, checkpoint_month, scheduled_date, status, parameters) VALUES (?, ?, ?, 'pending', ?)`,
          [result.insertId, cp.checkpoint_month, cp.scheduled_date, cp.parameters ? JSON.stringify(cp.parameters) : null]
        );
      }
    }
    res.status(201).json({ data: { id: result.insertId }, message: 'Stability study created' });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// PUT update stability study
router.put('/stability/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { study_code, name, formulation_id, batch_number, status, storage_condition, duration_months, start_date, end_date, protocol, conclusion } = req.body;
    await pool.query(
      `UPDATE rnd_stability_studies SET study_code=?, name=?, formulation_id=?, batch_number=?, status=?, storage_condition=?, duration_months=?, start_date=?, end_date=?, protocol=?, conclusion=? WHERE id=?`,
      [study_code, name, formulation_id, batch_number, status, storage_condition, duration_months, start_date, end_date, protocol, conclusion, req.params.id]
    );
    res.json({ message: 'Study updated' });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// PUT update checkpoint
router.put('/stability/:studyId/checkpoints/:cpId', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { actual_date, status, results, pass_fail, tested_by, notes } = req.body;
    await pool.query(
      `UPDATE rnd_stability_checkpoints SET actual_date=?, status=?, results=?, pass_fail=?, tested_by=?, notes=? WHERE id=? AND study_id=?`,
      [actual_date, status, results ? JSON.stringify(results) : null, pass_fail, tested_by, notes, req.params.cpId, req.params.studyId]
    );
    res.json({ message: 'Checkpoint updated' });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// DELETE stability study
router.delete('/stability/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    await pool.query('DELETE FROM rnd_stability_studies WHERE id = ?', [req.params.id]);
    res.json({ message: 'Deleted' });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ==================== PROJECT TASKS (per-project Kanban) ====================

// GET tasks for a project
router.get('/projects/:projectId/tasks', authMiddleware, async (req: Request, res: Response) => {
  try {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT t.*, u.full_name as assigned_name FROM rnd_project_tasks t
       LEFT JOIN users u ON t.assigned_to = u.id
       WHERE t.project_id = ? ORDER BY t.sort_order, t.created_at`, [req.params.projectId]
    );
    res.json({ data: rows });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// POST create task
router.post('/projects/:projectId/tasks', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { title, description, status, priority, assigned_to, due_date, tags, sort_order } = req.body;
    const [result] = await pool.query<ResultSetHeader>(
      `INSERT INTO rnd_project_tasks (project_id, title, description, status, priority, assigned_to, due_date, tags, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [req.params.projectId, title, description, status || 'todo', priority || 'medium', assigned_to || null, due_date || null, tags, sort_order || 0]
    );
    res.status(201).json({ data: { id: result.insertId }, message: 'Task created' });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// PUT update task
router.put('/tasks/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { title, description, status, priority, assigned_to, due_date, completed_date, tags, sort_order } = req.body;
    await pool.query(
      `UPDATE rnd_project_tasks SET title=?, description=?, status=?, priority=?, assigned_to=?, due_date=?, completed_date=?, tags=?, sort_order=? WHERE id=?`,
      [title, description, status, priority, assigned_to || null, due_date || null, completed_date || null, tags, sort_order, req.params.id]
    );
    res.json({ message: 'Task updated' });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// PATCH task status (kanban drag)
router.patch('/tasks/:id/status', authMiddleware, async (req: Request, res: Response) => {
  try {
    await pool.query('UPDATE rnd_project_tasks SET status = ? WHERE id = ?', [req.body.status, req.params.id]);
    res.json({ message: 'Status updated' });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// DELETE task
router.delete('/tasks/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    await pool.query('DELETE FROM rnd_project_tasks WHERE id = ?', [req.params.id]);
    res.json({ message: 'Deleted' });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ==================== DASHBOARD / STATS ====================
router.get('/dashboard', authMiddleware, async (req: Request, res: Response) => {
  try {
    const [projects] = await pool.query<RowDataPacket[]>('SELECT status, COUNT(*) as count FROM rnd_projects GROUP BY status');
    const [formulations] = await pool.query<RowDataPacket[]>('SELECT status, COUNT(*) as count FROM rnd_formulations GROUP BY status');
    const [tests] = await pool.query<RowDataPacket[]>('SELECT status, COUNT(*) as count FROM rnd_lab_tests GROUP BY status');
    const [studies] = await pool.query<RowDataPacket[]>('SELECT status, COUNT(*) as count FROM rnd_stability_studies GROUP BY status');
    res.json({ data: { projects, formulations, tests, studies } });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ==================== MILESTONES ====================

// GET milestones for a project
router.get('/projects/:projectId/milestones', authMiddleware, async (req: Request, res: Response) => {
  try {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT m.*, u.full_name as assigned_name FROM rnd_milestones m
       LEFT JOIN users u ON m.assigned_to = u.id
       WHERE m.project_id = ? ORDER BY m.sort_order, m.due_date`, [req.params.projectId]
    );
    res.json({ data: rows });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// POST create milestone
router.post('/projects/:projectId/milestones', authMiddleware, async (req: Request, res: Response) => {
  try {
    const b = req.body;
    const toNull = (v: any) => (v === '' || v === undefined) ? null : v;
    const [result] = await pool.query<ResultSetHeader>(
      `INSERT INTO rnd_milestones (project_id, title, description, phase, status, due_date, assigned_to, deliverables, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [req.params.projectId, b.title, toNull(b.description), b.phase || 'formulation_design', b.status || 'pending', toNull(b.due_date), toNull(b.assigned_to), toNull(b.deliverables), b.sort_order || 0]
    );
    res.status(201).json({ data: { id: result.insertId }, message: 'Milestone created' });
  } catch (err: any) {
    console.error('Milestone create error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// PUT update milestone
router.put('/milestones/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const b = req.body;
    const toNull = (v: any) => (v === '' || v === undefined) ? null : v;
    await pool.query(
      `UPDATE rnd_milestones SET title=?, description=?, phase=?, status=?, due_date=?, completed_date=?, assigned_to=?, deliverables=?, sort_order=? WHERE id=?`,
      [b.title, toNull(b.description), toNull(b.phase) || 'formulation_design', b.status || 'pending', toNull(b.due_date), toNull(b.completed_date), toNull(b.assigned_to), toNull(b.deliverables), b.sort_order ?? 0, req.params.id]
    );
    res.json({ message: 'Milestone updated' });
  } catch (err: any) {
    console.error('Milestone update error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// DELETE milestone
router.delete('/milestones/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    await pool.query('DELETE FROM rnd_milestones WHERE id = ?', [req.params.id]);
    res.json({ message: 'Deleted' });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ==================== DOCUMENTS ====================

// File upload setup
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const uploadDir = path.join(__dirname, '../../uploads/rnd');
if (!fs.existsSync(uploadDir)) { fs.mkdirSync(uploadDir, { recursive: true }); }
const storage = multer.diskStorage({
  destination: (_req: any, _file: any, cb: Function) => cb(null, uploadDir),
  filename: (_req: any, file: any, cb: Function) => {
    const ext = path.extname(file.originalname);
    cb(null, `rnd-${Date.now()}-${Math.random().toString(36).substring(7)}${ext}`);
  }
});
const upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } }); // 50MB

// GET documents (filter by project/formulation/test/study)
router.get('/documents', authMiddleware, async (req: Request, res: Response) => {
  try {
    let where = '1=1';
    const params: any[] = [];
    if (req.query.project_id) { where += ' AND d.project_id = ?'; params.push(req.query.project_id); }
    if (req.query.formulation_id) { where += ' AND d.formulation_id = ?'; params.push(req.query.formulation_id); }
    if (req.query.lab_test_id) { where += ' AND d.lab_test_id = ?'; params.push(req.query.lab_test_id); }
    if (req.query.stability_study_id) { where += ' AND d.stability_study_id = ?'; params.push(req.query.stability_study_id); }
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT d.*, u.full_name as uploader_name,
              p.name as project_name, f.name as formulation_name
       FROM rnd_documents d
       LEFT JOIN users u ON d.uploaded_by = u.id
       LEFT JOIN rnd_projects p ON d.project_id = p.id
       LEFT JOIN rnd_formulations f ON d.formulation_id = f.id
       WHERE ${where} ORDER BY d.created_at DESC`, params
    );
    res.json({ data: rows });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// POST upload document
router.post('/documents', authMiddleware, upload.single('file'), async (req: Request, res: Response) => {
  try {
    const file = (req as any).file;
    const { project_id, formulation_id, lab_test_id, stability_study_id, doc_type, title, description, version, folder_id } = req.body;
    const [result] = await pool.query<ResultSetHeader>(
      `INSERT INTO rnd_documents (project_id, formulation_id, lab_test_id, stability_study_id, doc_type, title, description, file_name, file_path, file_size, mime_type, version, uploaded_by, folder_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [project_id || null, formulation_id || null, lab_test_id || null, stability_study_id || null,
       doc_type || 'other', title || file?.originalname || 'Untitled', description,
       file?.originalname, file ? `/uploads/rnd/${file.filename}` : null,
       file?.size || 0, file?.mimetype, version || '1.0', (req as any).user?.id, folder_id || null]
    );
    res.status(201).json({ data: { id: result.insertId, file_path: file ? `/uploads/rnd/${file.filename}` : null }, message: 'Document uploaded' });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// PATCH move document to folder
router.patch('/documents/:id/folder', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { folder_id } = req.body;
    await pool.query('UPDATE rnd_documents SET folder_id = ? WHERE id = ?', [folder_id || null, req.params.id]);
    res.json({ message: 'Moved' });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// DELETE document
router.delete('/documents/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const [rows] = await pool.query<RowDataPacket[]>('SELECT file_path FROM rnd_documents WHERE id = ?', [req.params.id]);
    if (rows.length && rows[0].file_path) {
      const fullPath = path.join(__dirname, '../..', rows[0].file_path);
      if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
    }
    await pool.query('DELETE FROM rnd_documents WHERE id = ?', [req.params.id]);
    res.json({ message: 'Deleted' });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ==================== DOCUMENT FOLDERS ====================

// GET folders for a project
router.get('/folders', authMiddleware, async (req: Request, res: Response) => {
  try {
    const projectId = req.query.project_id;
    if (!projectId) return res.status(400).json({ error: 'project_id required' });
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT f.*, (SELECT COUNT(*) FROM rnd_documents d WHERE d.folder_id = f.id) as file_count
       FROM rnd_document_folders f WHERE f.project_id = ? ORDER BY f.name`, [projectId]
    );
    res.json({ data: rows });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// POST create folder
router.post('/folders', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { project_id, name, color } = req.body;
    if (!project_id || !name) return res.status(400).json({ error: 'project_id and name required' });
    const [result] = await pool.query<ResultSetHeader>(
      'INSERT INTO rnd_document_folders (project_id, name, color) VALUES (?, ?, ?)',
      [project_id, name.trim(), color || '#3B82F6']
    );
    res.json({ message: 'Created', id: result.insertId });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// PUT update folder
router.put('/folders/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { name, color } = req.body;
    await pool.query('UPDATE rnd_document_folders SET name = ?, color = ? WHERE id = ?',
      [name?.trim(), color || '#3B82F6', req.params.id]);
    res.json({ message: 'Updated' });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// DELETE folder (files inside get folder_id = NULL)
router.delete('/folders/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    await pool.query('UPDATE rnd_documents SET folder_id = NULL WHERE folder_id = ?', [req.params.id]);
    await pool.query('DELETE FROM rnd_document_folders WHERE id = ?', [req.params.id]);
    res.json({ message: 'Deleted' });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

export default router;
