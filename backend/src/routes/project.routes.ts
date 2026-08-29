import { Router, Request, Response } from 'express';
import { enrichMtoElement, groupStoredLines } from '../modules/estimator/mto/enrich';
import { dbQuery, dbGet, dbAll, dbRun, withTransaction, TxRunner } from '../config/database';
import { isProposalEditable } from '../modules/estimator/mto/units';
import { authMiddleware } from '../middleware/auth';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = process.env.GEMINI_API_KEY
  ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
  : null;


const router = Router();

// Get all projects with client and manager info
router.get('/', authMiddleware, async (req: Request, res: Response) => {
  try {
    const projects = await dbAll(`
      SELECT 
        p.id, 
        p.project_number, 
        p.project_name as title, 
        p.description, 
        p.status, 
        p.start_date, 
        p.end_date as deadline, 
        p.budget as price, 
        p.created_at,
        c.name as client_name,
        u.full_name as manager_name,
        (SELECT COUNT(*) FROM project_tasks t WHERE t.project_id = p.id AND t.status = 'Done') * 100 / 
        NULLIF((SELECT COUNT(*) FROM project_tasks t WHERE t.project_id = p.id), 0) as progress
      FROM client_projects p
      LEFT JOIN clients c ON p.client_id = c.id
      LEFT JOIN users u ON p.assigned_to = u.id
      ORDER BY p.created_at DESC
    `);
    
    // Format numeric values
    const formattedProjects = projects.map((p: any) => ({
      ...p,
      progress: Math.round(p.progress || 0)
    }));
    
    res.json(formattedProjects);
  } catch (error) {
    console.error('Error fetching projects:', error);
    res.status(500).json({ error: 'Failed to fetch projects' });
  }
});

// Get single project details
router.get('/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const project = await dbGet(`
      SELECT 
        p.*, 
        p.project_name as title,
        p.budget as price,
        c.name as client_name, (SELECT COUNT(*) FROM project_tasks t WHERE t.project_id = p.id AND t.status = 'Done') * 100 / 
        NULLIF((SELECT COUNT(*) FROM project_tasks t WHERE t.project_id = p.id), 0) as progress,
        u.full_name as manager_name
      FROM client_projects p
      LEFT JOIN clients c ON p.client_id = c.id
      LEFT JOIN users u ON p.assigned_to = u.id
      WHERE p.id = ?
    `, [req.params.id]);

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Selisih antara budget project dan nilai kontrak proposalnya dinyatakan
    // terang-terangan. Tanpa ini, RAB project (membaca `proposals.total_project`)
    // dan cost summary (membaca `client_projects.budget`) menampilkan dua angka
    // berbeda tanpa satu pun keterangan — dan yang melihatnya tidak punya cara
    // tahu mana yang mengikat.
    if ((project as any).proposal_id) {
      const kontrak: any = await dbGet(
        'SELECT proposal_number, total_project, client_id FROM proposals WHERE id = ?',
        [(project as any).proposal_id]
      );
      if (kontrak) {
        const sen = (v: any) => Math.round(Number(v ?? 0) * 100);
        const selisih = sen((project as any).budget) - sen(kontrak.total_project);
        (project as any).kontrak = {
          proposal_number: kontrak.proposal_number,
          nilai_kontrak: Number(kontrak.total_project ?? 0),
          budget_project: Number((project as any).budget ?? 0),
          selisih: selisih / 100,
          sepadan: selisih === 0,
          client_sepadan: Number(kontrak.client_id) === Number((project as any).client_id),
        };
      }
    }

    // Get members
    const members = await dbAll(`
      SELECT u.id, u.full_name, u.email, pm.role 
      FROM project_members pm
      JOIN users u ON pm.user_id = u.id
      WHERE pm.project_id = ?
    `, [req.params.id]);

    res.json({ ...project, members });
  } catch (error) {
    console.error('Error fetching project:', error);
    res.status(500).json({ error: 'Failed to fetch project' });
  }
});

// Create project (Also links to Client)
router.post('/', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { 
      client_id, 
      title, 
      description, 
      status, 
      start_date, 
      deadline, 
      price, 
      priority,
      assigned_to 
    } = req.body;

    // `client_projects.client_id` NOT NULL — tanpa client, INSERT-nya melempar
    // dan pemanggil hanya menerima 500 "Failed to create project" tanpa satu pun
    // petunjuk. Datanya memang belum lengkap; itu 400, bukan kesalahan server.
    if (!client_id) {
      return res.status(400).json({
        error: 'Project harus punya client. Pilih client-nya lebih dulu.',
        code: 'CLIENT_WAJIB',
      });
    }

    const projectNumber = `PRJ-${Date.now()}`; // Simple auto-generation

    const result = await dbRun(`
      INSERT INTO client_projects (
        client_id, project_number, project_name, description, status, 
        start_date, end_date, budget, assigned_to, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      client_id || null, projectNumber, title, description || null, status || 'open',
      start_date || null, deadline || null, price || 0, assigned_to || null, (req as any).user?.userId || null
    ]);

    res.status(201).json({ id: result.insertId, message: 'Project created' });
  } catch (error) {
    console.error('Error creating project:', error);
    res.status(500).json({ error: 'Failed to create project' });
  }
});

// Update project
router.put('/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { 
      title, project_name,
      description, 
      status, 
      start_date, 
      deadline, end_date,
      price, budget,
      assigned_to,
      client_id
    } = req.body;

    const effectiveName = title || project_name || null;
    const effectiveBudget = price ?? budget ?? null;
    const effectiveEnd = deadline || end_date || null;

    // ── Nilai kontrak & client project hasil Deal tidak boleh digeser di sini ──
    //
    // `budget` diisi dari `proposals.total_project` saat Deal, dalam satu
    // transaction bersama pembuatan project dan snapshot MTO. Tapi form Edit
    // Project menampilkan Budget dan Client sebagai input biasa dan SELALU
    // mengirim keduanya, sementara handler ini menulisnya apa adanya tanpa
    // melihat `proposal_id`. Nilai kontrak yang baru saja dibentuk secara
    // atomik karena itu kehilangan otoritasnya begitu handoff selesai.
    //
    // Akibatnya dua layar memakai sumber berbeda: RAB project membaca
    // `proposals.total_project`, sedangkan cost summary membaca
    // `client_projects.budget` — dan selisihnya tidak dijelaskan apa pun.
    // Sudah terjadi di produksi: PRJ-2026-0001 budget 73.582.827 sementara
    // proposal kontraknya 217.056.077,72.
    //
    // Yang diizinkan hanya MENYAMAKAN kembali dengan nilai kontrak, tidak
    // pernah menjauhinya. Mengubah nilai kontrak sungguhan adalah change order,
    // dan mekanismenya belum ada — menyediakannya lewat form edit biasa berarti
    // membiarkannya terjadi tanpa jejak.
    const proyekLama: any = await dbGet(
      `SELECT cp.proposal_id, cp.budget, cp.client_id,
              p.total_project, p.client_id AS klien_proposal, p.proposal_number
       FROM client_projects cp LEFT JOIN proposals p ON p.id = cp.proposal_id
       WHERE cp.id = ?`,
      [req.params.id]
    );
    if (!proyekLama) return res.status(404).json({ error: 'Project not found' });

    if (proyekLama.proposal_id) {
      const nilaiKontrak = Number(proyekLama.total_project ?? 0);
      const sen = (v: any) => Math.round(Number(v ?? 0) * 100);

      if (effectiveBudget !== null && sen(effectiveBudget) !== sen(nilaiKontrak)) {
        return res.status(409).json({
          error: `Nilai project ini terikat kontrak ${proyekLama.proposal_number}. ` +
                 `Budget hanya boleh sama dengan nilai kontraknya (${nilaiKontrak}).`,
          code: 'BUDGET_TERIKAT_KONTRAK',
          nilai_kontrak: nilaiKontrak,
          budget_sekarang: Number(proyekLama.budget ?? 0),
          diminta: Number(effectiveBudget),
        });
      }

      if (client_id !== undefined && client_id !== null &&
          Number(client_id) !== Number(proyekLama.klien_proposal)) {
        return res.status(409).json({
          error: `Client project ini mengikuti kontrak ${proyekLama.proposal_number} dan tidak bisa diganti dari sini.`,
          code: 'CLIENT_TERIKAT_KONTRAK',
          client_kontrak: Number(proyekLama.klien_proposal),
        });
      }
    }

    await dbRun(`
      UPDATE client_projects SET 
        project_name = COALESCE(?, project_name), 
        description = ?, 
        status = COALESCE(?, status), 
        start_date = ?, 
        end_date = ?, 
        budget = COALESCE(?, budget), 
        assigned_to = ?,
        client_id = COALESCE(?, client_id),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [
      // `status` dulu diteruskan MENTAH. Update parsial — mis. hanya mengubah
      // deskripsi — mengirimkan `undefined`, dan mysql2 menolaknya dengan
      // "Bind parameters must not contain undefined": setiap penyuntingan
      // sebagian berakhir 500 tanpa ada yang tahu sebabnya.
      effectiveName, description ?? null, status ?? null, start_date || null, effectiveEnd,
      effectiveBudget, assigned_to ?? null, client_id ?? null, req.params.id
    ]);

    res.json({ message: 'Project updated' });
  } catch (error) {
    console.error('Error updating project:', error);
    res.status(500).json({ error: 'Failed to update project' });
  }
});

// Delete project (cascade child records)
router.delete('/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const projectId = req.params.id;

    // Check if real project exists
    const project = await dbGet('SELECT id, project_name FROM client_projects WHERE id = ?', [projectId]) as any;
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Check for blocking references (PO/PR that are in-progress)
    try {
      const linkedPOs = await dbAll(
        `SELECT id, po_number FROM purchase_orders WHERE project_id = ? AND status NOT IN ('draft', 'cancelled')`,
        [projectId]
      ) as any[];
      if (linkedPOs && linkedPOs.length > 0) {
        return res.status(400).json({
          error: `Cannot delete: project has ${linkedPOs.length} active Purchase Order(s). Cancel or complete them first.`
        });
      }
    } catch { /* table may not exist */ }

    // Safe cascade delete helper
    const safeDelete = async (sql: string, params: any[]) => {
      try { await dbRun(sql, params); } catch (e: any) {
        console.warn(`Warning during cascade delete: ${e.message?.substring(0, 100)}`);
      }
    };

    // Cascade delete child records (order matters for FK)
    // EST-LIFE-R47: MTO project ikut dihapus.
    //
    // Cacat yang sama persis dengan penghapusan proposal (temuan 20 Agustus
    // 09:33): `engineering_inputs` polymorphic dan tidak punya FK ke
    // `client_projects`, jadi cascade tidak menjangkaunya. Menghapus project
    // meninggalkan seluruh baseline MTO-nya utuh, menunjuk id project yang sudah
    // tidak ada — dan tidak ada satu pun layar yang bisa menjangkaunya, karena
    // pembacaan MTO project selalu menyaring lewat project yang masih hidup.
    //
    // Ditemukan lewat tes kebersihan fixture: satu elemen `slab` yatim muncul
    // pada setiap kali `test:all` dijalankan.
    const elemenMto = await dbAll(
      `SELECT id FROM engineering_inputs WHERE scope_type = 'project' AND scope_id = ?`,
      [projectId]
    ) as any[];
    if (elemenMto.length > 0) {
      const tanda = elemenMto.map(() => '?').join(',');
      await safeDelete(`DELETE FROM mto_lines WHERE element_id IN (${tanda})`, elemenMto.map(e => e.id));
    }
    await safeDelete(`DELETE FROM engineering_inputs WHERE scope_type = 'project' AND scope_id = ?`, [projectId]);

    await safeDelete('DELETE FROM project_activities WHERE project_id = ?', [projectId]);
    await safeDelete('DELETE FROM project_files WHERE project_id = ?', [projectId]);
    await safeDelete('DELETE FROM project_members WHERE project_id = ?', [projectId]);
    await safeDelete('DELETE FROM project_tasks WHERE project_id = ?', [projectId]);
    await safeDelete('DELETE FROM project_milestones WHERE project_id = ?', [projectId]);
    await safeDelete('DELETE FROM project_expenses WHERE project_id = ?', [projectId]);
    // Unlink POs/PRs (set project_id to NULL instead of blocking)
    await safeDelete('UPDATE purchase_orders SET project_id = NULL WHERE project_id = ?', [projectId]);
    await safeDelete('UPDATE purchase_requests SET project_id = NULL WHERE project_id = ?', [projectId]);
    // Unlink other nullable references
    await safeDelete('UPDATE proposals SET project_id = NULL WHERE project_id = ?', [projectId]);
    await safeDelete('UPDATE client_events SET project_id = NULL WHERE project_id = ?', [projectId]);
    await safeDelete('UPDATE client_invoices SET project_id = NULL WHERE project_id = ?', [projectId]);
    await safeDelete('UPDATE fund_requests SET project_id = NULL WHERE project_id = ?', [projectId]);

    // Finally delete the project
    await dbRun('DELETE FROM client_projects WHERE id = ?', [projectId]);

    console.log(`✅ Project #${projectId} "${project.project_name}" deleted with all child records.`);
    res.json({ message: 'Project deleted successfully' });
  } catch (error: any) {
    console.error('Error deleting project:', error);
    res.status(500).json({ error: error?.message || 'Failed to delete project' });
  }
});

// ... Existing routes ...

// --- Task Routes ---

// Get all tasks for a project
router.get('/:id/tasks', authMiddleware, async (req: Request, res: Response) => {
  try {
    const tasks = await dbAll(`
      SELECT 
        t.*,
        u.full_name as assigned_to_name,
        m.title as milestone_title
      FROM project_tasks t
      LEFT JOIN users u ON t.assigned_to = u.id
      LEFT JOIN project_milestones m ON t.milestone_id = m.id
      WHERE t.project_id = ?
      ORDER BY t.created_at DESC
    `, [req.params.id]);
    res.json(tasks);
  } catch (error) {
    console.error('Error fetching tasks:', error);
    res.status(500).json({ error: 'Failed to fetch tasks' });
  }
});

// Create task
router.post('/:id/tasks', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { 
      title, 
      description, 
      status, 
      priority, 
      start_date, 
      due_date, 
      assigned_to,
      milestone_id 
    } = req.body;

    // Milestone milik project lain akan menautkan task ini ke seberang.
    if (milestone_id) {
      const ms: any = await dbGet(
        'SELECT id FROM project_milestones WHERE id = ? AND project_id = ?',
        [milestone_id, req.params.id]);
      if (!ms) {
        return res.status(400).json({
          error: 'Milestone itu bukan milik project ini.',
          code: 'MILESTONE_BEDA_PROJECT',
        });
      }
    }

    const result = await dbRun(`
      INSERT INTO project_tasks (
        project_id, title, description, status, priority, 
        start_date, due_date, assigned_to, milestone_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      req.params.id, title, description || null, status || 'To Do', priority || 'Medium',
      start_date || null, due_date || null, assigned_to || null, milestone_id || null
    ]);

    // Log Activity
    await dbRun(`
      INSERT INTO project_activities (project_id, user_id, action_type, description)
      VALUES (?, ?, 'created_task', ?)
    `, [req.params.id, (req as any).user?.userId || null, `Created task: ${title}`]);

    res.status(201).json({ id: result.insertId, message: 'Task created' });
  } catch (error) {
    console.error('Error creating task:', error);
    res.status(500).json({ error: 'Failed to create task' });
  }
});

// Update task
/**
 * PROJ-CTRL fase 0 — mutasi task WAJIB menyebut projectnya.
 *
 * Versi lama: `UPDATE project_tasks SET ... WHERE id = ?` tanpa satu pun
 * predikat project dan tanpa memeriksa berapa baris yang benar-benar terkena.
 * Akibatnya `:taskId` apa pun bisa diubah atau dihapus dari layar project mana
 * pun — tidak ada yang mengikat task ke projectnya. Bahayanya nyata ketika
 * layar masih memakai task contoh ber-id 1–6: aksi terhadap "task contoh"
 * mengubah task betulan bernomor sama milik project lain, sementara layar
 * menampilkan nama task contoh.
 *
 * Sekarang `project_id` ikut jadi predikat, dan jumlah baris terkena diperiksa:
 * nol berarti task itu bukan milik project tersebut → 404, bukan "berhasil"
 * yang tidak mengubah apa pun.
 */
const scopeTask = (req: Request) => {
  const projectId = Number(req.params.id ?? req.body?.project_id ?? req.query?.project_id);
  const taskId = Number(req.params.taskId);
  return { projectId, taskId, valid: Number.isInteger(projectId) && projectId > 0
    && Number.isInteger(taskId) && taskId > 0 };
};

const ubahTask = async (req: Request, res: Response) => {
  try {
    const { projectId, taskId, valid } = scopeTask(req);
    if (!valid) {
      return res.status(400).json({
        error: 'Perubahan task harus menyebut project-nya.',
        code: 'PROJECT_SCOPE_WAJIB',
      });
    }
    const { title, description, status, priority, start_date, due_date,
            assigned_to, milestone_id } = req.body;

    // milestone_id yang menunjuk milestone project LAIN akan menautkan task ke
    // project seberang lewat pintu belakang.
    if (milestone_id) {
      const ms: any = await dbGet(
        'SELECT id FROM project_milestones WHERE id = ? AND project_id = ?',
        [milestone_id, projectId]);
      if (!ms) {
        return res.status(400).json({
          error: 'Milestone itu bukan milik project ini.',
          code: 'MILESTONE_BEDA_PROJECT',
        });
      }
    }

    const hasil: any = await dbRun(`
      UPDATE project_tasks SET
        title = ?, description = ?, status = ?, priority = ?,
        start_date = ?, due_date = ?, assigned_to = ?, milestone_id = ?
      WHERE id = ? AND project_id = ?
    `, [title || null, description || null, status || null, priority || null,
      start_date || null, due_date || null, assigned_to || null, milestone_id || null,
      taskId, projectId]);

    if (!hasil?.affectedRows) {
      return res.status(404).json({
        error: 'Task tidak ditemukan pada project ini.',
        code: 'TASK_BUKAN_MILIK_PROJECT',
      });
    }
    res.json({ message: 'Task updated' });
  } catch (error) {
    console.error('Error updating task:', error);
    res.status(500).json({ error: 'Failed to update task' });
  }
};

const hapusTask = async (req: Request, res: Response) => {
  try {
    const { projectId, taskId, valid } = scopeTask(req);
    if (!valid) {
      return res.status(400).json({
        error: 'Penghapusan task harus menyebut project-nya.',
        code: 'PROJECT_SCOPE_WAJIB',
      });
    }
    const hasil: any = await dbRun(
      'DELETE FROM project_tasks WHERE id = ? AND project_id = ?', [taskId, projectId]);
    if (!hasil?.affectedRows) {
      return res.status(404).json({
        error: 'Task tidak ditemukan pada project ini.',
        code: 'TASK_BUKAN_MILIK_PROJECT',
      });
    }
    res.json({ message: 'Task deleted' });
  } catch (error) {
    console.error('Error deleting task:', error);
    res.status(500).json({ error: 'Failed to delete task' });
  }
};

router.put('/:id/tasks/:taskId', authMiddleware, ubahTask);
router.delete('/:id/tasks/:taskId', authMiddleware, hapusTask);
// Bentuk lama dipertahankan supaya klien lama tidak putus, tapi ia kini
// menuntut `project_id` juga — tanpa itu 400, bukan diam-diam mengubah apa pun.
router.put('/tasks/:taskId', authMiddleware, ubahTask);
router.delete('/tasks/:taskId', authMiddleware, hapusTask);

// ... Existing routes ...

// --- Milestone Routes ---

// Get all milestones for a project
router.get('/:id/milestones', authMiddleware, async (req: Request, res: Response) => {
  try {
    const milestones = await dbAll(`
      SELECT m.*, 
      (SELECT COUNT(*) FROM project_tasks t WHERE t.milestone_id = m.id) as total_tasks,
      (SELECT COUNT(*) FROM project_tasks t WHERE t.milestone_id = m.id AND t.status = 'Done') as completed_tasks
      FROM project_milestones m
      WHERE m.project_id = ?
      ORDER BY m.due_date ASC
    `, [req.params.id]);
    res.json(milestones);
  } catch (error) {
    console.error('Error fetching milestones:', error);
    res.status(500).json({ error: 'Failed to fetch milestones' });
  }
});

// Create milestone
router.post('/:id/milestones', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { title, description, due_date, status, amount } = req.body;
    if (!title || !String(title).trim()) {
      return res.status(400).json({ error: 'Milestone harus punya judul.', code: 'JUDUL_WAJIB' });
    }
    // `description` dan `due_date` yang tidak dikirim sampai ke bind sebagai
    // `undefined`, dan mysql2 menolaknya — membuat milestone tanpa deskripsi
    // atau tanggal selalu gagal 500, padahal keduanya memang boleh kosong.
    const result = await dbRun(`
      INSERT INTO project_milestones (project_id, title, description, due_date, status, amount)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [req.params.id, String(title).trim(), description || null, due_date || null,
        status || 'Pending', amount || 0]);

    // Log Activity
    await dbRun(`
      INSERT INTO project_activities (project_id, user_id, action_type, description)
      VALUES (?, ?, 'created_milestone', ?)
    `, [req.params.id, (req as any).user?.userId || null, `Created milestone: ${title}`]);

    res.status(201).json({ id: result.insertId, message: 'Milestone created' });
  } catch (error) {
    console.error('Error creating milestone:', error);
    res.status(500).json({ error: 'Failed to create milestone' });
  }
});

// Update milestone
/** Milestone: aturan yang sama persis dengan task di atas. */
const scopeMilestone = (req: Request) => {
  const projectId = Number(req.params.id ?? req.body?.project_id ?? req.query?.project_id);
  const milestoneId = Number(req.params.milestoneId);
  return { projectId, milestoneId, valid: Number.isInteger(projectId) && projectId > 0
    && Number.isInteger(milestoneId) && milestoneId > 0 };
};

const ubahMilestone = async (req: Request, res: Response) => {
  try {
    const { projectId, milestoneId, valid } = scopeMilestone(req);
    if (!valid) {
      return res.status(400).json({
        error: 'Perubahan milestone harus menyebut project-nya.',
        code: 'PROJECT_SCOPE_WAJIB',
      });
    }
    const { title, description, due_date, status, amount } = req.body;
    const hasil: any = await dbRun(`
      UPDATE project_milestones SET
        title = ?, description = ?, due_date = ?, status = ?, amount = ?
      WHERE id = ? AND project_id = ?
    `, [title || null, description || null, due_date || null, status || null,
      amount || null, milestoneId, projectId]);
    if (!hasil?.affectedRows) {
      return res.status(404).json({
        error: 'Milestone tidak ditemukan pada project ini.',
        code: 'MILESTONE_BUKAN_MILIK_PROJECT',
      });
    }
    res.json({ message: 'Milestone updated' });
  } catch (error) {
    console.error('Error updating milestone:', error);
    res.status(500).json({ error: 'Failed to update milestone' });
  }
};

const hapusMilestone = async (req: Request, res: Response) => {
  try {
    const { projectId, milestoneId, valid } = scopeMilestone(req);
    if (!valid) {
      return res.status(400).json({
        error: 'Penghapusan milestone harus menyebut project-nya.',
        code: 'PROJECT_SCOPE_WAJIB',
      });
    }
    const hasil: any = await dbRun(
      'DELETE FROM project_milestones WHERE id = ? AND project_id = ?',
      [milestoneId, projectId]);
    if (!hasil?.affectedRows) {
      return res.status(404).json({
        error: 'Milestone tidak ditemukan pada project ini.',
        code: 'MILESTONE_BUKAN_MILIK_PROJECT',
      });
    }
    res.json({ message: 'Milestone deleted' });
  } catch (error) {
    console.error('Error deleting milestone:', error);
    res.status(500).json({ error: 'Failed to delete milestone' });
  }
};

router.put('/:id/milestones/:milestoneId', authMiddleware, ubahMilestone);
router.delete('/:id/milestones/:milestoneId', authMiddleware, hapusMilestone);
router.put('/milestones/:milestoneId', authMiddleware, ubahMilestone);
router.delete('/milestones/:milestoneId', authMiddleware, hapusMilestone);

// ... Existing routes ...

// --- File Routes ---

// Configure Multer
const uploadDir = path.join(__dirname, '../../uploads/project_files');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ storage });

// Get all files for a project
router.get('/:id/files', authMiddleware, async (req: Request, res: Response) => {
  try {
    const files = await dbAll(`
      Select f.*, u.full_name as uploader_name
      FROM project_files f
      LEFT JOIN users u ON f.uploaded_by = u.id
      WHERE f.project_id = ?
      ORDER BY f.uploaded_at DESC
    `, [req.params.id]);
    res.json(files);
  } catch (error) {
    console.error('Error fetching files:', error);
    res.status(500).json({ error: 'Failed to fetch files' });
  }
});

// Upload file
router.post('/:id/files', authMiddleware, upload.single('file'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const { originalname, filename, size, mimetype } = req.file;
    
    // Determine file type category (for icons)
    let fileType = 'other';
    if (mimetype.startsWith('image/')) fileType = 'image';
    else if (mimetype.includes('pdf')) fileType = 'pdf';
    else if (mimetype.includes('sheet') || mimetype.includes('excel')) fileType = 'excel';
    else if (mimetype.includes('document') || mimetype.includes('word')) fileType = 'word';

    const result = await dbRun(`
      INSERT INTO project_files (project_id, file_name, file_path, file_type, file_size, uploaded_by,
        doc_title, doc_category, revision, doc_status, doc_no, description, uploaded_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
    `, [req.params.id, originalname, filename, fileType, size, (req as any).user.userId,
        req.body.doc_title || null, req.body.doc_category || 'Other',
        req.body.revision || 'A', req.body.doc_status || 'draft',
        req.body.doc_no || null, req.body.description || null]);

    // Log Activity
    await dbRun(`
      INSERT INTO project_activities (project_id, user_id, action_type, description)
      VALUES (?, ?, 'uploaded_file', ?)
    `, [req.params.id, (req as any).user.userId, `Uploaded file: ${originalname}`]);

    res.status(201).json({ 
      id: result.insertId, 
      message: 'File uploaded',
      file: {
        id: result.insertId,
        file_name: originalname,
        file_path: filename,
        file_type: fileType,
        file_size: size,
        uploaded_at: new Date(),
        uploader_name: (req as any).user.name // Assuming user name is available in request or we fetch it
      }
    });
  } catch (error) {
    console.error('Error uploading file:', error);
    res.status(500).json({ error: 'Failed to upload file' });
  }
});

// Delete file
router.delete('/files/:fileId', authMiddleware, async (req: Request, res: Response) => {
  try {
    const file = await dbGet('SELECT * FROM project_files WHERE id = ?', [req.params.fileId]);
    if (!file) return res.status(404).json({ error: 'File not found' });
    await dbRun('DELETE FROM project_files WHERE id = ?', [req.params.fileId]);
    const filePath = path.join(uploadDir, (file as any).file_path);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    res.json({ message: 'File deleted' });
  } catch (error) {
    console.error('Error deleting file:', error);
    res.status(500).json({ error: 'Failed to delete file' });
  }
});

// PATCH: Update file metadata (no file re-upload needed)
router.patch('/files/:fileId', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { doc_title, doc_category, revision, doc_status, doc_no, description, file_name } = req.body;
    await dbRun(
      `UPDATE project_files
       SET doc_title = ?, doc_category = ?, revision = ?, doc_status = ?,
           doc_no = ?, description = ?, file_name = COALESCE(?, file_name)
       WHERE id = ?`,
      [doc_title || null, doc_category || 'Other', revision || 'A',
       doc_status || 'draft', doc_no || null, description || null,
       file_name || null, req.params.fileId]
    );
    const updated = await dbGet(
      `SELECT f.*, u.full_name as uploader_name FROM project_files f
       LEFT JOIN users u ON f.uploaded_by = u.id WHERE f.id = ?`,
      [req.params.fileId]
    );
    res.json(updated);
  } catch (error) {
    console.error('Error updating file metadata:', error);
    res.status(500).json({ error: 'Failed to update file' });
  }
});

// GET: Serve uploaded file for preview
router.get('/files/:fileId/preview', authMiddleware, async (req: Request, res: Response) => {
  try {
    const file: any = await dbGet('SELECT * FROM project_files WHERE id = ?', [req.params.fileId]);
    if (!file) return res.status(404).json({ error: 'File not found' });
    const filePath = path.join(uploadDir, file.file_path);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not on disk' });
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(file.file_name)}"`);
    res.sendFile(filePath);
  } catch (error) {
    console.error('Error serving file:', error);
    res.status(500).json({ error: 'Failed to serve file' });
  }
});

// GET: Download file
router.get('/files/:fileId/download', authMiddleware, async (req: Request, res: Response) => {
  try {
    const file: any = await dbGet('SELECT * FROM project_files WHERE id = ?', [req.params.fileId]);
    if (!file) return res.status(404).json({ error: 'File not found' });
    const filePath = path.join(uploadDir, file.file_path);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not on disk' });
    res.download(filePath, file.file_name);
  } catch (error) {
    res.status(500).json({ error: 'Failed to download file' });
  }
});

// ── AI: Analyze drawing with Gemini Vision ────────────────────────────────
router.post('/files/:fileId/analyze', authMiddleware, async (req: Request, res: Response) => {
  try {
    if (!genAI) {
      return res.status(503).json({ error: 'GEMINI_API_KEY not configured on server' });
    }

    const file: any = await dbGet('SELECT * FROM project_files WHERE id = ?', [req.params.fileId]);
    if (!file) return res.status(404).json({ error: 'File not found' });

    const filePath = path.join(uploadDir, file.file_path);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not on disk' });

    // Read file as base64
    const fileBuffer = fs.readFileSync(filePath);
    const base64Data = fileBuffer.toString('base64');

    // Determine MIME type
    const mimeMap: Record<string, string> = {
      pdf: 'application/pdf',
      png: 'image/png',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      gif: 'image/gif',
      webp: 'image/webp',
    };
    const ext = (file.file_name || '').split('.').pop()?.toLowerCase() || '';
    const mimeType = mimeMap[ext] || 'application/pdf';

    // EPC-specific prompt — enhanced for dimension reading + quantity takeoff
    const prompt = `You are a senior EPC quantity surveyor and engineering document analyst with 20+ years of experience reading engineering drawings.

Analyze this engineering drawing/document in EXTREME DETAIL. Your PRIMARY mission is:
1. Read ALL dimension lines, annotations, and numerical values
2. Extract the drawing scale (e.g. 1:50, 1:100) from the title block
3. Perform QUANTITY TAKEOFF — calculate actual quantities from visible dimensions
4. Read material schedules, BOM tables, and item lists

QUANTITY CALCULATION RULES:
- If scale is given (e.g. 1:50), use it to verify or estimate dimensions
- For structural drawings: calculate lengths (m/lm), areas (m²), volumes (m³)
- For rebar/steel: extract diameter, spacing, length, calculate total weight if possible
- For concrete: calculate volume = length × width × height
- For piping: extract pipe sizes (NPS/DN), schedules, and spool lengths
- For electrical: extract cable sizes, conduit diameters, cable tray widths

Return a SINGLE valid JSON object (no markdown, no explanation):

{
  "title_block": {
    "drawing_number": "",
    "drawing_title": "",
    "project_name": "",
    "project_number": "",
    "client": "",
    "contractor": "",
    "revision": "",
    "date": "",
    "scale": "",
    "sheet": "",
    "discipline": "Civil | Structural | Mechanical | Piping | Electrical | Instrument | Architecture | Other",
    "drawn_by": "",
    "checked_by": "",
    "approved_by": ""
  },
  "document_type": "Foundation Plan | Beam/Column Detail | Slab Plan | Wall Section | Roof Plan | P&ID | Isometric | Plot Plan | Layout | Single Line Diagram | Cable Schedule | GA Drawing | Other",
  "scale_info": {
    "stated_scale": "e.g. 1:50",
    "scale_bar": "description if visible",
    "unit": "mm | cm | m | inch | ft"
  },
  "all_dimensions": [
    {
      "label": "description of what dimension refers to e.g. 'Column spacing A-B'",
      "value": "numeric value",
      "unit": "mm | cm | m",
      "location": "where on drawing"
    }
  ],
  "quantity_takeoff": [
    {
      "item_no": "sequential number",
      "description": "full description of item",
      "specification": "material spec, grade, diameter, class, etc.",
      "size": "cross-section or diameter",
      "length_or_area": "calculated or read value with unit",
      "qty": "numeric quantity",
      "unit": "m | m2 | m3 | pcs | kg | ton | lm | set",
      "calculation_note": "show your calculation e.g. 3.5m × 2 spans = 7.0m",
      "confidence": "high | medium | low"
    }
  ],
  "reinforcement": [
    {
      "mark": "bar mark e.g. T1, B2",
      "diameter": "e.g. D16, T13",
      "spacing": "e.g. 150mm c/c",
      "length": "cut length per bar",
      "no_of_bars": "number of bars",
      "total_length": "calculated total",
      "weight_kg": "calculated if possible (use 0.00617 × dia² × length formula)",
      "location": "Top, Bottom, Links, Stirrups, etc."
    }
  ],
  "structural_elements": [
    {
      "element_type": "Beam | Column | Slab | Wall | Foundation | Pile | etc.",
      "mark": "element mark e.g. B1, C2, S3",
      "size": "cross-section dimensions",
      "length": "element length",
      "concrete_grade": "e.g. fc'=25MPa, K-300",
      "qty": "number of similar elements",
      "volume_m3": "calculated volume per element",
      "total_volume_m3": "qty × volume"
    }
  ],
  "equipment_list": [
    { "tag": "", "description": "", "type": "", "capacity": "", "size": "", "material": "", "qty": 1, "notes": "" }
  ],
  "pipe_list": [
    { "line_number": "", "from": "", "to": "", "nominal_size": "", "pipe_class": "", "schedule": "", "medium": "", "length_m": "", "design_pressure": "", "design_temp": "" }
  ],
  "material_schedule": [
    { "item_no": "", "description": "", "size": "", "material": "", "qty": "", "unit": "", "weight_kg": "", "notes": "" }
  ],
  "instrument_list": [
    { "tag": "", "type": "", "description": "", "range": "", "connection_size": "" }
  ],
  "notes": [],
  "revision_history": [
    { "rev": "", "date": "", "description": "", "by": "" }
  ],
  "summary": "2-3 sentence description including: what the drawing shows, key dimensions found, total quantities identified"
}

CRITICAL INSTRUCTIONS:
- READ EVERY dimension line, number, and annotation visible in the drawing
- For dimension lines: read the exact numbers shown (e.g. 3500, 2400, 150 etc.)
- ALWAYS specify units — if not stated, infer from drawing context (structural usually mm)
- Show calculation workings in calculation_note field
- If a section has no applicable data, OMIT it from the JSON
- Return ONLY valid JSON — no prose, no markdown code blocks`;


    // Direct REST with confirmed working model
    const apiKey = process.env.GEMINI_API_KEY || '';
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

    const fetchRes = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [
          { inline_data: { mime_type: mimeType, data: base64Data } },
          { text: prompt }
        ]}],
        generationConfig: { temperature: 0.1, maxOutputTokens: 8192 }
      })
    });

    if (!fetchRes.ok) {
      const errBody = await fetchRes.text();
      throw new Error(`Gemini ${fetchRes.status}: ${errBody.slice(0, 300)}`);
    }
    const geminiJson: any = await fetchRes.json();
    const responseText = (geminiJson.candidates?.[0]?.content?.parts?.[0]?.text || '').trim();

    // Parse JSON response
    let parsed: any = {};
    try {
      // Remove markdown code blocks if present
      const cleaned = responseText.replace(/^```json\n?/,'').replace(/\n?```$/,'');
      parsed = JSON.parse(cleaned);
    } catch {
      // Return raw text if not valid JSON
      parsed = { raw_text: responseText, parse_error: true };
    }

    // Log usage
    await dbRun(
      `INSERT INTO project_activities (project_id, user_id, action_type, description)
       VALUES (?, ?, 'ai_analysis', ?)`,
      [file.project_id, (req as any).user.userId, `AI analyzed: ${file.file_name}`]
    ).catch(() => {});

    res.json({
      file_id: file.id,
      file_name: file.file_name,
      model: 'gemini-2.0-flash',
      analysis: parsed,
    });

  } catch (error: any) {
    console.error('Gemini analysis error:', error);
    res.status(500).json({ error: error.message || 'AI analysis failed' });
  }
});



const generateExpenseNumber = () => {
  const now = new Date();
  const datePart = now.toISOString().slice(0, 10).replace(/-/g, '');
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `EXP-${datePart}-${rand}`;
};

// Get project cost summary (budget vs actual from PR, PO, expenses)
router.get('/:id/cost-summary', authMiddleware, async (req: Request, res: Response) => {
  try {
    const projectId = req.params.id;

    const project = await dbGet(
      'SELECT id, budget, actual_cost FROM client_projects WHERE id = ?',
      [projectId]
    ) as any;
    if (!project) return res.status(404).json({ error: 'Project not found' });

    // PR totals (estimated from items stored in notes JSON)
    const prs = await dbAll(
      `SELECT id, pr_number, status, approval_status, notes, created_at
       FROM purchase_requests WHERE project_id = ?`,
      [projectId]
    );

    let prTotal = 0;
    for (const pr of (prs || [])) {
      try {
        const parsed = JSON.parse(pr.notes || '{}');
        prTotal += parseFloat(parsed.estimatedTotal || 0);
      } catch { /* non-json notes */ }
    }

    // PO totals from line items
    const poSummary = await dbGet(`
      SELECT 
        COUNT(DISTINCT po.id) as po_count,
        COALESCE(SUM(poi.quantity * poi.unit_price), 0) as po_total
      FROM purchase_orders po
      LEFT JOIN purchase_order_items poi ON poi.po_id = po.id
      WHERE po.project_id = ?
    `, [projectId]) as any;

    // PO by status
    const poByStatus = await dbAll(`
      SELECT po.status, po.approval_status,
        COALESCE(SUM(poi.quantity * poi.unit_price), 0) as total
      FROM purchase_orders po
      LEFT JOIN purchase_order_items poi ON poi.po_id = po.id
      WHERE po.project_id = ?
      GROUP BY po.status, po.approval_status
    `, [projectId]);

    // Expense totals
    const expSummary = await dbGet(`
      SELECT 
        COUNT(*) as expense_count,
        COALESCE(SUM(amount), 0) as expense_total
      FROM project_expenses
      WHERE project_id = ? AND status != 'rejected'
    `, [projectId]) as any;

    // Expenses by category
    const expByCategory = await dbAll(`
      SELECT category, COALESCE(SUM(amount), 0) as total, COUNT(*) as count
      FROM project_expenses
      WHERE project_id = ? AND status != 'rejected'
      GROUP BY category ORDER BY total DESC
    `, [projectId]);

    const totalSpent = parseFloat(poSummary?.po_total || 0) + parseFloat(expSummary?.expense_total || 0);
    const budget = parseFloat(project.budget || 0);
    const remaining = budget - totalSpent;
    const usagePercent = budget > 0 ? Math.round((totalSpent / budget) * 100) : 0;

    // Update actual_cost in project
    await dbRun('UPDATE client_projects SET actual_cost = ? WHERE id = ?', [totalSpent, projectId]);

    res.json({
      budget,
      total_spent: totalSpent,
      remaining,
      usage_percent: usagePercent,
      pr: {
        count: (prs || []).length,
        estimated_total: prTotal
      },
      po: {
        count: poSummary?.po_count || 0,
        total: parseFloat(poSummary?.po_total || 0),
        by_status: poByStatus || []
      },
      expenses: {
        count: expSummary?.expense_count || 0,
        total: parseFloat(expSummary?.expense_total || 0),
        by_category: expByCategory || []
      }
    });
  } catch (error) {
    console.error('Error fetching cost summary:', error);
    res.status(500).json({ error: 'Failed to fetch cost summary' });
  }
});

// List project expenses
router.get('/:id/expenses', authMiddleware, async (req: Request, res: Response) => {
  try {
    const expenses = await dbAll(`
      SELECT e.*, v.name as vendor_name, u.full_name as created_by_name,
             ua.full_name as approved_by_name
      FROM project_expenses e
      LEFT JOIN vendors v ON e.vendor_id = v.id
      LEFT JOIN users u ON e.created_by = u.id
      LEFT JOIN users ua ON e.approved_by = ua.id
      WHERE e.project_id = ?
      ORDER BY e.expense_date DESC
    `, [req.params.id]);
    res.json({ data: expenses || [] });
  } catch (error) {
    console.error('Error fetching expenses:', error);
    res.status(500).json({ error: 'Failed to fetch expenses' });
  }
});

// GET all approved expenses across all projects (for Fund Request dropdown)
router.get('/expenses/approved', authMiddleware, async (req: Request, res: Response) => {
  try {
    const expenses = await dbAll(`
      SELECT e.*, p.project_name as project_name
      FROM project_expenses e
      LEFT JOIN client_projects p ON e.project_id = p.id
      WHERE e.status = 'approved'
      ORDER BY e.expense_date DESC
    `, []);
    res.json({ data: expenses || [] });
  } catch (error) {
    console.error('Error fetching approved expenses:', error);
    res.status(500).json({ error: 'Failed to fetch approved expenses' });
  }
});

// PATCH: Approve expense
router.patch('/:id/expenses/:expenseId/approve', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    await dbRun(
      `UPDATE project_expenses SET status = 'approved', approved_by = ?, approved_at = NOW() WHERE id = ? AND project_id = ?`,
      [userId, req.params.expenseId, req.params.id]
    );
    res.json({ message: 'Expense approved' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to approve expense' });
  }
});

// PATCH: Reject expense
router.patch('/:id/expenses/:expenseId/reject', authMiddleware, async (req: Request, res: Response) => {
  try {
    await dbRun(
      `UPDATE project_expenses SET status = 'rejected' WHERE id = ? AND project_id = ?`,
      [req.params.expenseId, req.params.id]
    );
    res.json({ message: 'Expense rejected' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to reject expense' });
  }
});

// Create project expense
router.post('/:id/expenses', authMiddleware, async (req: Request, res: Response) => {

  try {
    const projectId = req.params.id;
    const userId = (req as any).user?.userId;
    const { category, description, amount, expense_date, vendor_id, receipt_number, notes, status } = req.body;

    if (!description || !amount || !expense_date) {
      return res.status(400).json({ error: 'description, amount, and expense_date are required' });
    }

    const expenseNumber = generateExpenseNumber();
    const result = await dbRun(`
      INSERT INTO project_expenses (project_id, expense_number, category, description, amount, expense_date, vendor_id, receipt_number, notes, status, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [projectId, expenseNumber, category || 'other', description, amount, expense_date, vendor_id || null, receipt_number || null, notes || null, status || 'draft', userId || null]);

    res.status(201).json({ message: 'Expense created', data: { id: result.insertId, expense_number: expenseNumber } });
  } catch (error) {
    console.error('Error creating expense:', error);
    res.status(500).json({ error: 'Failed to create expense' });
  }
});

// Update project expense
router.put('/:id/expenses/:expenseId', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { category, description, amount, expense_date, vendor_id, receipt_number, status, notes } = req.body;

    await dbRun(`
      UPDATE project_expenses 
      SET category = ?, description = ?, amount = ?, expense_date = ?, vendor_id = ?, receipt_number = ?, status = ?, notes = ?
      WHERE id = ? AND project_id = ?
    `, [category, description, amount, expense_date, vendor_id || null, receipt_number || null, status || 'draft', notes || null, req.params.expenseId, req.params.id]);

    res.json({ message: 'Expense updated' });
  } catch (error) {
    console.error('Error updating expense:', error);
    res.status(500).json({ error: 'Failed to update expense' });
  }
});

// Delete project expense
router.delete('/:id/expenses/:expenseId', authMiddleware, async (req: Request, res: Response) => {
  try {
    const expense = await dbGet('SELECT status FROM project_expenses WHERE id = ? AND project_id = ?', [req.params.expenseId, req.params.id]) as any;
    if (!expense) return res.status(404).json({ error: 'Expense not found' });
    if (expense.status === 'approved' || expense.status === 'paid') {
      return res.status(400).json({ error: 'Cannot delete approved/paid expenses' });
    }
    await dbRun('DELETE FROM project_expenses WHERE id = ? AND project_id = ?', [req.params.expenseId, req.params.id]);
    res.json({ message: 'Expense deleted' });
  } catch (error) {
    console.error('Error deleting expense:', error);
    res.status(500).json({ error: 'Failed to delete expense' });
  }
});

// List PRs linked to a project
router.get('/:id/purchase-requests', authMiddleware, async (req: Request, res: Response) => {
  try {
    const prs = await dbAll(`
      SELECT pr.*, u.full_name as requester_name
      FROM purchase_requests pr
      LEFT JOIN users u ON pr.requestor_id = u.id
      WHERE pr.project_id = ?
      ORDER BY pr.created_at DESC
    `, [req.params.id]);
    res.json({ data: prs || [] });
  } catch (error) {
    console.error('Error fetching project PRs:', error);
    res.status(500).json({ error: 'Failed to fetch project PRs' });
  }
});

// List POs linked to a project  
router.get('/:id/purchase-orders', authMiddleware, async (req: Request, res: Response) => {
  try {
    const pos = await dbAll(`
      SELECT po.*, v.name as vendor_name, pr.pr_number,
        COALESCE((SELECT SUM(poi.quantity * poi.unit_price) FROM purchase_order_items poi WHERE poi.po_id = po.id), 0) as total_amount
      FROM purchase_orders po
      LEFT JOIN vendors v ON po.vendor_id = v.id
      LEFT JOIN purchase_requests pr ON po.pr_id = pr.id
      WHERE po.project_id = ?
      ORDER BY po.created_at DESC
    `, [req.params.id]);
    res.json({ data: pos || [] });
  } catch (error) {
    console.error('Error fetching project POs:', error);
    res.status(500).json({ error: 'Failed to fetch project POs' });
  }
});

// List Fund Requests linked to a project
router.get('/:id/fund-requests', authMiddleware, async (req: Request, res: Response) => {
  try {
    const fundRequests = await dbAll(`
      SELECT fr.*, u.full_name as requester_name,
        (SELECT COUNT(*) FROM fund_request_items fri WHERE fri.fund_request_id = fr.id) AS item_count
      FROM fund_requests fr
      LEFT JOIN users u ON fr.requester_id = u.id
      WHERE fr.project_id = ?
      ORDER BY fr.created_at DESC
    `, [req.params.id]);
    res.json({ data: fundRequests || [] });
  } catch (error) {
    console.error('Error fetching project fund requests:', error);
    res.status(500).json({ error: 'Failed to fetch project fund requests' });
  }
});

// ===== RAB (RENCANA ANGGARAN BIAYA) =====

// Get RAB for project — reads from the linked proposal's items
router.get('/:id/rab', authMiddleware, async (req: Request, res: Response) => {
  try {
    const projectId = req.params.id;

    // Find linked proposal
    const proposal = await dbGet(
      `SELECT id, proposal_number, project_name, direct_cost, overhead, risk_contingency, total_project, status, revision
       FROM proposals WHERE project_id = ? ORDER BY updated_at DESC LIMIT 1`,
      [projectId]
    ) as any;

    if (!proposal) {
      return res.json({ proposal: null, disciplines: [], grand_total: 0, total_actual: 0 });
    }

    // --- Actual costs from POs linked to this project ---
    // Level 1: per proposal_item_id (most granular — direct PO ↔ RAB line link)
    const actualByItem = await dbAll(
      `SELECT poi.proposal_item_id,
              COALESCE(SUM(poi.quantity * poi.unit_price), 0) as actual_cost
       FROM purchase_order_items poi
       JOIN purchase_orders po ON poi.po_id = po.id
       WHERE po.project_id = ?
         AND poi.proposal_item_id IS NOT NULL
         AND po.status NOT IN ('cancelled','draft')
       GROUP BY poi.proposal_item_id`,
      [projectId]
    ) as any[];

    // Level 2: per rab_sub_discipline_id (PO items linked to sub-discipline but not a specific RAB line)
    const actualBySubDisc = await dbAll(
      `SELECT poi.rab_sub_discipline_id,
              COALESCE(SUM(poi.quantity * poi.unit_price), 0) as actual_cost
       FROM purchase_order_items poi
       JOIN purchase_orders po ON poi.po_id = po.id
       WHERE po.project_id = ?
         AND poi.proposal_item_id IS NULL
         AND poi.rab_sub_discipline_id IS NOT NULL
         AND po.status NOT IN ('cancelled','draft')
       GROUP BY poi.rab_sub_discipline_id`,
      [projectId]
    ) as any[];

    // Level 3: unallocated PO total (no RAB link)
    const unallocatedRow = await dbGet(
      `SELECT COALESCE(SUM(poi.quantity * poi.unit_price), 0) as actual_cost
       FROM purchase_order_items poi
       JOIN purchase_orders po ON poi.po_id = po.id
       WHERE po.project_id = ?
         AND poi.proposal_item_id IS NULL
         AND poi.rab_sub_discipline_id IS NULL
         AND po.status NOT IN ('cancelled','draft')`,
      [projectId]
    ) as any;

    // Build lookup maps
    const itemActualMap: Record<number, number> = {};
    for (const r of actualByItem) itemActualMap[r.proposal_item_id] = parseFloat(r.actual_cost || 0);
    const sdActualMap: Record<number, number> = {};
    for (const r of actualBySubDisc) sdActualMap[r.rab_sub_discipline_id] = parseFloat(r.actual_cost || 0);

    // Get proposal items
    const items = await dbAll(
      `SELECT pi.id, pi.order_no, pi.is_section, pi.section_label, pi.description,
              pi.qty, pi.unit_snapshot AS unit, pi.unit_price_snapshot AS unit_price,
              pi.total_price, pi.ahsp_code_snapshot AS ahsp_code, pi.ahsp_name_snapshot AS ahsp_name,
              d.id AS discipline_id, d.code AS discipline_code, d.name AS discipline_name, d.order_no AS discipline_order,
              sd.id AS sub_discipline_id, sd.code AS sub_discipline_code, sd.name AS sub_discipline_name, sd.order_no AS sub_discipline_order
       FROM proposal_items pi
       LEFT JOIN master_disciplines d ON pi.discipline_id = d.id
       LEFT JOIN master_sub_disciplines sd ON pi.sub_discipline_id = sd.id
       WHERE pi.proposal_id = ?
       ORDER BY d.order_no ASC, sd.order_no ASC, pi.order_no ASC`,
      [proposal.id]
    );

    const disciplineMap: Record<string, any> = {};
    let rowNo = 1;

    for (const item of (items as any[])) {
      const dKey = item.discipline_id || '__none__';
      if (!disciplineMap[dKey]) {
        disciplineMap[dKey] = {
          id: item.discipline_id,
          code: item.discipline_code || '-',
          name: item.discipline_name || 'Umum',
          order: item.discipline_order || 999,
          subtotal: 0,
          actual_total: 0,
          sub_disciplines: {} as Record<string, any>,
        };
      }
      const disc = disciplineMap[dKey];

      const sdKey = item.sub_discipline_id || '__none__';
      if (!disc.sub_disciplines[sdKey]) {
        disc.sub_disciplines[sdKey] = {
          id: item.sub_discipline_id,
          code: item.sub_discipline_code || '-',
          name: item.sub_discipline_name || 'Umum',
          order: item.sub_discipline_order || 999,
          subtotal: 0,
          actual_subtotal: sdActualMap[item.sub_discipline_id] || 0,
          items: [],
        };
      }
      const sd = disc.sub_disciplines[sdKey];
      const total = parseFloat(item.total_price || 0);
      const itemActual = itemActualMap[item.id] || 0;

      sd.items.push({
        id: item.id,
        no: item.is_section ? null : rowNo++,
        is_section: !!item.is_section,
        section_label: item.section_label || null,
        ahsp_code: item.ahsp_code || '-',
        uraian: item.ahsp_name || item.section_label || item.description || '-',
        description: item.description || null,
        satuan: item.unit || '-',
        volume: parseFloat(item.qty || 0),
        harga_satuan: parseFloat(item.unit_price || 0),
        jumlah_harga: total,
        aktual_biaya: itemActual,
      });

      if (!item.is_section) {
        sd.subtotal += total;
        sd.actual_subtotal += itemActual;
        disc.subtotal += total;
        disc.actual_total += itemActual;
      }
    }

    const disciplines = Object.values(disciplineMap)
      .sort((a: any, b: any) => a.order - b.order)
      .map((d: any) => ({
        ...d,
        sub_disciplines: Object.values(d.sub_disciplines)
          .sort((a: any, b: any) => a.order - b.order),
      }));

    const grandTotal = disciplines.reduce((s: number, d: any) => s + d.subtotal, 0);
    const totalActual = disciplines.reduce((s: number, d: any) => s + d.actual_total, 0)
      + parseFloat(unallocatedRow?.actual_cost || 0);

    res.json({
      proposal: {
        id: proposal.id,
        proposal_number: proposal.proposal_number,
        project_name: proposal.project_name,
        revision: proposal.revision,
        status: proposal.status,
        direct_cost: parseFloat(proposal.direct_cost || 0),
        overhead: parseFloat(proposal.overhead || 0),
        risk_contingency: parseFloat(proposal.risk_contingency || 0),
        total_project: parseFloat(proposal.total_project || 0),
      },
      disciplines,
      grand_total: grandTotal,
      total_actual: totalActual,
      unallocated_actual: parseFloat(unallocatedRow?.actual_cost || 0),
    });
  } catch (error) {
    console.error('Error fetching project RAB:', error);
    res.status(500).json({ error: 'Failed to fetch RAB' });
  }
});

// List proposals available to link to this project

router.get('/:id/available-proposals', authMiddleware, async (req: Request, res: Response) => {
  try {
    // P1 ARCH-RISK: daftar dibatasi ke proposal milik CLIENT yang sama.
    //
    // Sebelumnya seluruh proposal yang belum tertaut ditawarkan, tanpa memandang
    // client. Menautkan proposal milik client lain ke sebuah project hampir pasti
    // keliru, dan tidak ada satu pun yang menahannya.
    const proyek: any = await dbGet('SELECT client_id FROM client_projects WHERE id = ?', [req.params.id]);
    if (!proyek) return res.status(404).json({ error: 'Project tidak ditemukan' });

    const params: any[] = [req.params.id];
    let filterClient = '';
    if (proyek.client_id) {
      filterClient = ' AND (client_id = ? OR client_id IS NULL)';
      params.push(proyek.client_id);
    }

    const proposals = await dbAll(
      `SELECT id, proposal_number, project_name, status, total_project, client_id, created_at
       FROM proposals
       WHERE (project_id IS NULL OR project_id = ?)${filterClient}
       ORDER BY created_at DESC`,
      params
    );
    res.json(proposals);
  } catch (error) {
    console.error('Error fetching available proposals:', error);
    res.status(500).json({ error: 'Failed to fetch proposals' });
  }
});

// Link a proposal to this project
router.put('/:id/link-proposal', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { proposal_id } = req.body;
    const projectId = req.params.id;

    if (!proposal_id) {
      return res.status(400).json({ error: 'proposal_id is required' });
    }

    // P1 ARCH-RISK: penautan ulang adalah SATU unit, dan tidak boleh menimpa
    // baseline kontrak.
    //
    // Alur deal menyetel DUA relasi — `client_projects.proposal_id` dan
    // `proposals.project_id`. Endpoint ini dulu hanya menyentuh yang kedua, jadi
    // keduanya bisa menunjuk arah berbeda; produksi sudah memperlihatkannya
    // (project 14: cp.proposal_id NULL sementara proposal 3 menunjuk balik).
    const hasil = await withTransaction(async tx => {
      const proyek: any = await tx.get(
        'SELECT id, proposal_id, client_id FROM client_projects WHERE id = ? FOR UPDATE', [projectId]
      );
      if (!proyek) return { error: 404, body: { error: 'Project tidak ditemukan' } };

      const target: any = await tx.get(
        'SELECT id, status, client_id, project_id FROM proposals WHERE id = ? FOR UPDATE', [proposal_id]
      );
      if (!target) return { error: 404, body: { error: 'Proposal tidak ditemukan' } };

      if (target.project_id && Number(target.project_id) !== Number(projectId)) {
        return {
          error: 409,
          body: {
            error: 'Proposal ini sudah tertaut ke project lain.',
            code: 'PROPOSAL_LINKED_ELSEWHERE',
            project_id: target.project_id,
          },
        };
      }

      // Proposal yang SEDANG tertaut dan berstatus deal adalah baseline kontrak
      // project ini. Menggantinya berarti mengganti kontraknya diam-diam.
      const lama: any = await tx.get(
        'SELECT id, status, proposal_number FROM proposals WHERE project_id = ? LIMIT 1', [projectId]
      );
      if (lama && Number(lama.id) !== Number(proposal_id) && !isProposalEditable(lama.status)) {
        return {
          error: 409,
          body: {
            error: `Project ini sudah terikat proposal ${lama.proposal_number} berstatus "${lama.status}". Baseline kontraknya tidak bisa diganti dari sini.`,
            code: 'CONTRACT_BASELINE_LOCKED',
          },
        };
      }

      if (proyek.client_id && target.client_id && Number(proyek.client_id) !== Number(target.client_id)) {
        return {
          error: 409,
          body: { error: 'Proposal ini milik client lain.', code: 'CLIENT_MISMATCH' },
        };
      }

      await tx.run('UPDATE proposals SET project_id = NULL WHERE project_id = ?', [projectId]);
      const r = await tx.run('UPDATE proposals SET project_id = ? WHERE id = ?', [projectId, proposal_id]);
      if (!r.affectedRows) {
        return { error: 500, body: { error: 'Penautan gagal — tidak ada baris yang berubah.' } };
      }

      // Kedua relasi dijaga sinkron. Inilah yang dulu terlewat.
      await tx.run('UPDATE client_projects SET proposal_id = ? WHERE id = ?', [proposal_id, projectId]);
      return { ok: true as const };
    });

    if ('error' in hasil) return res.status(hasil.error).json(hasil.body);
    res.json({ message: 'Proposal linked to project' });
  } catch (error) {
    console.error('Error linking proposal:', error);
    res.status(500).json({ error: 'Failed to link proposal' });
  }
});

// Unlink proposal from project
router.delete('/:id/link-proposal', authMiddleware, async (req: Request, res: Response) => {
  try {
    const hasil = await withTransaction(async tx => {
      const lama: any = await tx.get(
        'SELECT id, status, proposal_number FROM proposals WHERE project_id = ? LIMIT 1 FOR UPDATE', [req.params.id]
      );
      if (lama && !isProposalEditable(lama.status)) {
        return {
          error: 409,
          body: {
            error: `Proposal ${lama.proposal_number} berstatus "${lama.status}" adalah baseline kontrak project ini dan tidak bisa dilepas.`,
            code: 'CONTRACT_BASELINE_LOCKED',
          },
        };
      }
      await tx.run('UPDATE proposals SET project_id = NULL WHERE project_id = ?', [req.params.id]);
      await tx.run('UPDATE client_projects SET proposal_id = NULL WHERE id = ?', [req.params.id]);
      return { ok: true as const };
    });

    if ('error' in hasil) return res.status(hasil.error).json(hasil.body);
    res.json({ message: 'Proposal unlinked' });
  } catch (error) {
    console.error('Error unlinking proposal:', error);
    res.status(500).json({ error: 'Failed to unlink proposal' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// MTO / QTO (Material Take-Off / Quantity Take-Off) Routes
// ─────────────────────────────────────────────────────────────────────────────

// Tabel engineering_inputs dibuat di config/database.ts (ensureRouteModuleSchema)

// ── Quantity calculator (pure function, runs on backend) ──────────────────────
function calculateQuantities(elementType: string, params: any): Record<string, number> {
  const q: Record<string, number> = {};
  const STEEL_DENSITY = 7850; // kg/m³

  if (elementType === 'foundation') {
    const { L = 0, W = 0, H = 0, qty = 1, working_space = 0.3,
            rebar_main = 16, rebar_stirrup = 10, stirrup_spacing = 0.15, cover = 0.04 } = params;
    const lWS = L + 2 * working_space;
    const wWS = W + 2 * working_space;
    q.vol_concrete    = +(L * W * H * qty).toFixed(3);
    q.vol_excavation  = +(lWS * wWS * H * qty).toFixed(3);
    q.vol_backfill    = +(Math.max(q.vol_excavation - q.vol_concrete, 0)).toFixed(3);
    q.formwork_area   = +(2 * (L + W) * H * qty).toFixed(3);
    // Rebar weight — simplified: main bars (both ways) + stirrups
    const mainDia = rebar_main / 1000; // m
    const stirDia = rebar_stirrup / 1000;
    const mainArea = Math.PI * (mainDia / 2) ** 2;
    const stirArea = Math.PI * (stirDia / 2) ** 2;
    const effectiveL = L - 2 * cover;
    const effectiveW = W - 2 * cover;
    const nMainX = Math.floor(effectiveW / 0.15) + 1;
    const nMainY = Math.floor(effectiveL / 0.15) + 1;
    const nStir  = Math.floor(effectiveL / stirrup_spacing) + 1;
    const mainWeight = (nMainX * effectiveL + nMainY * effectiveW) * mainArea * STEEL_DENSITY;
    const stirWeight = nStir * 2 * (effectiveL + effectiveW) * stirArea * STEEL_DENSITY;
    q.rebar_weight_kg = +((mainWeight + stirWeight) * qty).toFixed(1);
    q.rebar_lonjor    = +Math.ceil(q.rebar_weight_kg / (mainArea * STEEL_DENSITY * 12));
  }

  else if (elementType === 'column') {
    const { B = 0.3, H = 0.3, height_per_floor = 3, floors = 1, qty_per_floor = 1,
            rebar_count = 8, rebar_dia = 16, stirrup_dia = 10, stirrup_spacing = 0.15, cover = 0.04 } = params;
    const totalQty = qty_per_floor * floors;
    q.vol_concrete   = +(B * H * height_per_floor * totalQty).toFixed(3);
    q.formwork_area  = +(2 * (B + H) * height_per_floor * totalQty).toFixed(3);
    const mainDia  = rebar_dia / 1000;
    const stirDia  = stirrup_dia / 1000;
    const mainArea = Math.PI * (mainDia / 2) ** 2;
    const stirArea = Math.PI * (stirDia / 2) ** 2;
    const nStir = Math.floor(height_per_floor / stirrup_spacing) + 1;
    const mainWeight = rebar_count * height_per_floor * mainArea * STEEL_DENSITY;
    const perimStir  = 2 * ((B - 2 * cover) + (H - 2 * cover));
    const stirWeight = nStir * perimStir * stirArea * STEEL_DENSITY;
    q.rebar_weight_kg = +((mainWeight + stirWeight) * totalQty).toFixed(1);
    q.rebar_lonjor    = +Math.ceil(q.rebar_weight_kg / (mainArea * STEEL_DENSITY * 12));
  }

  else if (elementType === 'beam') {
    const { B = 0.25, H = 0.5, total_length = 0, rebar_count = 4,
            rebar_dia = 16, stirrup_dia = 10, stirrup_spacing = 0.15, cover = 0.04 } = params;
    q.vol_concrete  = +(B * H * total_length).toFixed(3);
    q.formwork_area = +((2 * H + B) * total_length).toFixed(3); // soffit + 2 sides
    const mainDia  = rebar_dia / 1000;
    const stirDia  = stirrup_dia / 1000;
    const mainArea = Math.PI * (mainDia / 2) ** 2;
    const stirArea = Math.PI * (stirDia / 2) ** 2;
    const nStir = Math.floor(total_length / stirrup_spacing) + 1;
    const perimStir = 2 * ((B - 2 * cover) + (H - 2 * cover));
    q.rebar_weight_kg = +(rebar_count * total_length * mainArea * STEEL_DENSITY
                        + nStir * perimStir * stirArea * STEEL_DENSITY).toFixed(1);
    q.rebar_lonjor = +Math.ceil(q.rebar_weight_kg / (mainArea * STEEL_DENSITY * 12));
  }

  else if (elementType === 'slab') {
    const { area = 0, thickness = 0.12, rebar_dia_x = 10, rebar_dia_y = 10,
            spacing_x = 0.15, spacing_y = 0.15, cover = 0.02 } = params;
    q.vol_concrete  = +(area * thickness).toFixed(3);
    q.formwork_area = +area.toFixed(3);
    const diaX = rebar_dia_x / 1000;
    const diaY = rebar_dia_y / 1000;
    const axX  = Math.PI * (diaX / 2) ** 2;
    const axY  = Math.PI * (diaY / 2) ** 2;
    // Length of rebar ≈ area / spacing (strips in each direction)
    const lenX = area / spacing_x;
    const lenY = area / spacing_y;
    q.rebar_weight_kg = +((lenX * axX + lenY * axY) * STEEL_DENSITY).toFixed(1);
    q.rebar_lonjor    = +Math.ceil(q.rebar_weight_kg / ((axX + axY) / 2 * STEEL_DENSITY * 12));
  }

  else if (elementType === 'wall') {
    const { area = 0, thickness_mm = 150, has_plaster = true } = params;
    q.wall_area      = +area.toFixed(2);
    q.wall_volume    = +(area * (thickness_mm / 1000)).toFixed(3);
    q.plaster_area   = has_plaster ? +(area * 2).toFixed(2) : 0; // both sides
    q.acian_area     = q.plaster_area;
  }

  else if (elementType === 'roof') {
    const { floor_area = 0, slope_deg = 30, overhang = 0.6 } = params;
    const slopeFactor = 1 / Math.cos((slope_deg * Math.PI) / 180);
    q.roof_area      = +((floor_area + 4 * overhang * Math.sqrt(floor_area)) * slopeFactor).toFixed(2);
    q.gutters_length = +(4 * Math.sqrt(floor_area) + 4 * overhang).toFixed(1);
  }

  return q;
}

// Helper: get linked proposal_id for a project
async function getLinkedProposalId(projectId: any): Promise<number|null> {
  const p: any = await dbGet('SELECT id FROM proposals WHERE project_id = ? ORDER BY updated_at DESC LIMIT 1', [projectId]);
  return p?.id || null;
}

// GET all MTO elements for a project — reads from linked proposal only (project MTO is read-only)
router.get('/:id/mto', authMiddleware, async (req: Request, res: Response) => {
  try {
    const projectId = req.params.id;
    const proposalId = await getLinkedProposalId(projectId);

    // P1 CONTRACT-INTEGRITY: baseline project didahulukan.
    //
    // Saat proposal menjadi deal, MTO disalin ke `scope_type='project'` sebagai
    // baseline kontrak tersendiri. Route ini dulu mengabaikannya dan selalu
    // membaca baris milik proposal — jadi layar project menampilkan MTO proposal
    // yang masih bisa berubah, bukan angka yang disepakati.
    //
    // TIDAK dialihkan begitu saja: produksi punya NOL baris scope `project`
    // (project di sana dibuat manual, bukan dari deal), jadi mengalihkannya
    // langsung akan mengosongkan layar MTO setiap project yang ada. Baseline
    // dipakai kalau ada; kalau belum, jatuh ke proposal — dan sumbernya
    // dinyatakan eksplisit di respons supaya layar bisa mengatakan apa yang
    // sedang ditampilkan, bukan menyamarkan keduanya.
    const baseline = await dbAll(
      `SELECT * FROM engineering_inputs WHERE scope_type = 'project' AND scope_id = ? ORDER BY sort_order, id`,
      [projectId]
    );

    const pakaiBaseline = baseline.length > 0;

    if (!pakaiBaseline && !proposalId) {
      return res.json({
        elements: [], linked_proposal_id: null,
        mto_source: 'none',
        mto_source_note: 'Project ini belum punya baseline MTO maupun proposal tertaut.',
      });
    }

    const rows = pakaiBaseline ? baseline : await dbAll(
      'SELECT * FROM engineering_inputs WHERE proposal_id = ? ORDER BY sort_order, id',
      [proposalId]
    );

    // EST-MTO-R37: layar project ikut menerima baris TERSIMPAN dan tanda drift.
    // Sebelumnya route ini hanya mengembalikan parameter, jadi layar project
    // sepenuhnya bergantung pada hitung ulang formula sekarang — kuantitas
    // kontrak yang disepakati tidak pernah ditampilkan sama sekali.
    const lineRows: any[] = rows.length
      ? await dbAll(
          `SELECT element_id, line_code, label, net_quantity, waste_percent, gross_quantity, unit, formula_version
           FROM mto_lines WHERE element_id IN (${rows.map(() => '?').join(',')})`,
          rows.map((r: any) => r.id)
        )
      : [];
    const storedLines = groupStoredLines(lineRows);

    res.json({
      elements: rows.map(r => {
        const parameters = typeof r.parameters === 'string' ? JSON.parse(r.parameters || '{}') : r.parameters;
        return {
          ...r,
          parameters,
          quantities: typeof r.quantities === 'string' ? JSON.parse(r.quantities || '{}') : r.quantities,
          ...enrichMtoElement(r.element_type, parameters, storedLines.get(Number(r.id)) || [], r.formula_version),
          source: 'proposal',
        };
      }),
      linked_proposal_id: proposalId,
      // Sumber angka dinyatakan terang-terangan. `project_baseline` = kuantitas
      // kontrak hasil salinan saat deal; `proposal` = MTO proposal yang masih
      // bisa berubah.
      mto_source: pakaiBaseline ? 'project_baseline' : 'proposal',
      mto_source_note: pakaiBaseline
        ? 'Kuantitas kontrak project, disalin saat proposal menjadi deal.'
        : 'Project ini belum punya baseline kontrak; yang ditampilkan MTO proposal tertaut, yang masih bisa berubah.',
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST create/upsert MTO element (DB UNIQUE constraint prevents duplicates)
router.post('/:id/mto', authMiddleware, async (req: Request, res: Response) => {
  try {
    const projectId = req.params.id;
    const { element_type, element_name, parameters = {}, sort_order = 0 } = req.body;
    if (!element_type) return res.status(400).json({ error: 'element_type required' });
    const quantities = calculateQuantities(element_type, parameters);
    const proposalId = await getLinkedProposalId(projectId);
    const name = element_name || element_type;
    const paramsJson = JSON.stringify(parameters);
    const qtyJson = JSON.stringify(quantities);

    // PUT dan DELETE sudah tunduk pada kunci proposal, POST belum — jadi jalur
    // ini masih bisa MENAMBAH elemen ke project yang kontraknya sudah disepakati.
    // Terbukti di dev: setelah deal, POST menjawab 200 dan menyisipkan baris
    // baru ke project.
    //
    // Barisnya pun ditulis dengan `project_id` DAN `proposal_id` terisi
    // sekaligus, tanpa `scope_type` — bentuk ketiga yang bukan baseline dan
    // bukan proposal, dan itulah yang membuat ringkasan QTO menjumlahkan
    // campuran tiga jenis baris sekaligus.
    if (proposalId) {
      const prop: any = await dbGet('SELECT id, status FROM proposals WHERE id = ?', [proposalId]);
      if (prop && !isProposalEditable(prop.status)) {
        return res.status(409).json({
          error: `Project ini tertaut pada proposal berstatus "${prop.status}"; MTO-nya tidak bisa ditambah dari layar project.`,
          code: 'PROPOSAL_LOCKED',
          status_proposal: prop.status,
        });
      }
    }

    // Project yang SUDAH punya baseline kontrak tidak boleh ditambahi elemen
    // lewat jalur ini. Menambah lingkup pekerjaan pada kontrak berjalan adalah
    // change order, bukan penyuntingan diam-diam.
    const adaBaseline: any = await dbGet(
      `SELECT COUNT(*) AS n FROM engineering_inputs WHERE scope_type = 'project' AND scope_id = ?`,
      [projectId]
    );
    if (Number(adaBaseline?.n || 0) > 0) {
      return res.status(409).json({
        error: 'Project ini sudah punya baseline MTO kontrak. Menambah elemen baru memerlukan change order, bukan penambahan langsung.',
        code: 'BASELINE_TERKUNCI',
      });
    }

    // Ditulis sebagai baris milik PROJECT, bukan hibrida project+proposal.
    const result: any = await dbRun(
      `INSERT INTO engineering_inputs (scope_type, scope_id, project_id, element_type, element_name, parameters, quantities, sort_order)
       VALUES ('project', ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE parameters=VALUES(parameters), quantities=VALUES(quantities), sort_order=VALUES(sort_order)`,
      [projectId, projectId, element_type, name, paramsJson, qtyJson, sort_order]
    );
    const id = result.insertId || (await dbGet(
      `SELECT id FROM engineering_inputs WHERE scope_type = 'project' AND scope_id = ? AND element_type = ? AND element_name = ?`,
      [projectId, element_type, name]
    ) as any)?.id;
    res.json({ id, quantities, updated: !result.insertId });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Tolak mutasi MTO yang barisnya milik proposal terkunci (P1 CONTRACT-INTEGRITY).
 *
 * `PUT`/`DELETE` di prefix `/projects` menerima baris yang cocok lewat
 * `proposal_id`, tanpa `proposalLock`, pemeriksaan status, maupun transaction.
 * Jadi pengguna yang mendapat element ID dari GET bisa mengubah atau menghapus
 * MTO proposal `submitted`/`deal` lewat jalur ini — padahal endpoint Estimator
 * sudah melarangnya. Kontrak yang sudah disepakati bisa berubah dari pintu
 * belakang.
 */
const tolakKalauProposalTerkunci = async (row: any, run: TxRunner): Promise<any | null> => {
  if (!row?.proposal_id) return null; // baris milik project — bebas disunting
  const proposal: any = await run.get(
    'SELECT id, status FROM proposals WHERE id = ? FOR UPDATE', [row.proposal_id]
  );
  if (!proposal) return null;
  if (isProposalEditable(proposal.status)) return null;
  return {
    status: 409,
    body: {
      error: `MTO ini milik proposal berstatus "${proposal.status}" dan tidak bisa diubah dari layar project.`,
      code: 'PROPOSAL_LOCKED',
      status_proposal: proposal.status,
    },
  };
};

// PUT update MTO element (recalculates quantities) — works for both project & proposal records
router.put('/:id/mto/:elementId', authMiddleware, async (req: Request, res: Response) => {
  try {
    const projectId = req.params.id;
    const proposalId = await getLinkedProposalId(projectId);
    const { element_type, element_name, parameters = {}, sort_order } = req.body;
    // Allow editing both project-owned and proposal-owned records
    const hasil = await withTransaction(async tx => {
      const existing: any = await tx.get(
        proposalId
          ? 'SELECT * FROM engineering_inputs WHERE id = ? AND (project_id = ? OR proposal_id = ?) FOR UPDATE'
          : 'SELECT * FROM engineering_inputs WHERE id = ? AND project_id = ? FOR UPDATE',
        proposalId ? [req.params.elementId, projectId, proposalId] : [req.params.elementId, projectId]
      );
      if (!existing) return { error: 404, body: { error: 'Element not found' } };

      const terkunci = await tolakKalauProposalTerkunci(existing, tx);
      if (terkunci) return { error: terkunci.status, body: terkunci.body };

      const type = element_type || existing.element_type;
      const params = Object.keys(parameters).length ? parameters : JSON.parse(existing.parameters || '{}');
      const quantities = calculateQuantities(type, params);
      await tx.run(
        'UPDATE engineering_inputs SET element_type=?, element_name=?, parameters=?, quantities=?, sort_order=? WHERE id=?',
        [type, element_name || existing.element_name, JSON.stringify(params), JSON.stringify(quantities), sort_order ?? existing.sort_order, req.params.elementId]
      );
      return { ok: true as const, quantities };
    });

    if ('error' in hasil) return res.status(hasil.error).json(hasil.body);
    res.json({ quantities: hasil.quantities });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE MTO element — works for both project & proposal records
router.delete('/:id/mto/:elementId', authMiddleware, async (req: Request, res: Response) => {
  try {
    const projectId = req.params.id;
    const proposalId = await getLinkedProposalId(projectId);
    const hasil = await withTransaction(async tx => {
      const existing: any = await tx.get(
        proposalId
          ? 'SELECT * FROM engineering_inputs WHERE id = ? AND (project_id = ? OR proposal_id = ?) FOR UPDATE'
          : 'SELECT * FROM engineering_inputs WHERE id = ? AND project_id = ? FOR UPDATE',
        proposalId ? [req.params.elementId, projectId, proposalId] : [req.params.elementId, projectId]
      );
      if (!existing) return { error: 404, body: { error: 'Element not found' } };

      const terkunci = await tolakKalauProposalTerkunci(existing, tx);
      if (terkunci) return { error: terkunci.status, body: terkunci.body };

      await tx.run('DELETE FROM engineering_inputs WHERE id = ?', [req.params.elementId]);
      return { ok: true as const };
    });

    if ('error' in hasil) return res.status(hasil.error).json(hasil.body);
    res.json({ message: 'Deleted' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Petakan satu kunci `quantities` ke ember ringkasan QTO.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * Ada DUA keluarga kunci di kolom yang sama, dan ringkasan lama hanya mengenal
 * salah satunya:
 *
 *   • Kalkulator Estimator menyimpan kode barisnya sendiri — `FND-CONC` menjadi
 *     `fnd_conc`, `COL-REBAR` menjadi `col_rebar`, dan seterusnya.
 *   • Kalkulator internal `/projects` memakai nama generik: `vol_concrete`,
 *     `rebar_weight_kg`, `formwork_area`.
 *
 * Ringkasan lama hanya membaca keluarga kedua, jadi seluruh baseline yang
 * berasal dari Estimator — yaitu SEMUA project hasil deal — dijumlahkan sebagai
 * nol. Terukur di dev: elemen pondasi dengan `fnd_conc: 10.08` dilaporkan
 * `total_vol_concrete: 0`.
 *
 * Pencocokannya lewat akhiran kode, bukan daftar tetap per tipe elemen, supaya
 * elemen baru (`TB-CONC`, `SLB-CONC`, `RF-CONC`, …) ikut terhitung tanpa perlu
 * menyentuh berkas ini lagi.
 * ─────────────────────────────────────────────────────────────────────────────
 */
const emberRingkasan = (kunci: string): string | null => {
  const k = kunci.toLowerCase();

  // Keluarga generik milik kalkulator /projects.
  if (k === 'vol_concrete')    return 'total_vol_concrete';
  if (k === 'vol_excavation')  return 'total_vol_excavation';
  if (k === 'vol_backfill')    return 'total_vol_backfill';
  if (k === 'rebar_weight_kg') return 'total_rebar_weight_kg';
  if (k === 'formwork_area')   return 'total_formwork_area';
  if (k === 'wall_area')       return 'total_wall_area';
  if (k === 'plaster_area')    return 'total_plaster_area';
  if (k === 'roof_area')       return 'total_roof_area';

  // Keluarga kode baris Estimator. Yang satuannya bukan m3/m2/kg — baut, lembar,
  // batang, cat — sengaja TIDAK masuk ember mana pun: menjumlahkannya ke volume
  // atau berat menghasilkan angka yang tidak berarti apa-apa.
  if (k.endsWith('_conc'))      return 'total_vol_concrete';
  if (k.endsWith('_lean'))      return 'total_vol_concrete';   // lantai kerja tetap beton
  if (k.endsWith('_excv'))      return 'total_vol_excavation';
  if (k.endsWith('_backfill'))  return 'total_vol_backfill';
  if (k.endsWith('_rebar') || k.endsWith('_stirrup')) return 'total_rebar_weight_kg';
  if (k.endsWith('_form'))      return 'total_formwork_area';
  if (k.endsWith('_plaster') || k.endsWith('_acian')) return 'total_plaster_area';
  if (k === 'wal_area')         return 'total_wall_area';
  if (k === 'rf_area')          return 'total_roof_area';

  return null;
};

// GET QTO Summary — aggregated quantities (includes linked proposal MTO)
router.get('/:id/mto/summary', authMiddleware, async (req: Request, res: Response) => {
  try {
    const projectId = req.params.id;
    const proposalId = await getLinkedProposalId(projectId);

    // Sumbernya dipilih dengan aturan yang SAMA dengan `GET /:id/mto`:
    // baseline project kalau ada, kalau tidak baru proposal tertaut.
    //
    // Versi lama memakai `WHERE project_id = ? OR proposal_id = ?`, dan itu
    // menggandakan seluruh kuantitas begitu baseline terbentuk: baris proposal
    // asli cocok lewat `proposal_id`, sedangkan salinan baseline yang dibuat
    // saat deal cocok lewat `project_id` — elemen yang sama terhitung dua kali.
    // Terbukti di dev: satu pondasi menghasilkan dua baris terpilih (id 2753
    // scope=proposal dan id 2754 scope=project) untuk elemen yang sama persis.
    //
    // Akibatnya QTO detail dan QTO summary menjawab berbeda untuk project yang
    // sama, dan yang salah justru yang dipakai sebagai ringkasan.
    const baseline = await dbAll(
      `SELECT element_type, quantities FROM engineering_inputs
       WHERE scope_type = 'project' AND scope_id = ? ORDER BY sort_order, id`,
      [projectId]
    );
    let rows: any[];
    let sumber: string;
    if (baseline.length > 0) {
      rows = baseline;
      sumber = 'project_baseline';
    } else if (proposalId) {
      rows = await dbAll(
        'SELECT element_type, quantities FROM engineering_inputs WHERE proposal_id = ? ORDER BY sort_order, id',
        [proposalId]
      );
      sumber = 'proposal';
    } else {
      rows = [];
      sumber = 'none';
    }
    const summary = {
      total_vol_concrete: 0,
      total_vol_excavation: 0,
      total_vol_backfill: 0,
      total_rebar_weight_kg: 0,
      total_formwork_area: 0,
      total_wall_area: 0,
      total_plaster_area: 0,
      total_roof_area: 0,
    };
    for (const row of rows) {
      const q = typeof row.quantities === 'string' ? JSON.parse(row.quantities || '{}') : row.quantities;
      for (const [kunci, nilai] of Object.entries(q || {})) {
        const ember = emberRingkasan(kunci);
        if (ember) (summary as any)[ember] += Number(nilai) || 0;
      }
    }
    Object.keys(summary).forEach(k => { (summary as any)[k] = +((summary as any)[k]).toFixed(2); });
    // Sumbernya dinyatakan, sama seperti pada `GET /:id/mto`, supaya layar tahu
    // angka ini kontrak atau proposal yang masih bisa berubah.
    res.json({ summary, count: rows.length, mto_source: sumber });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Riwayat aktivitas project.
 *
 * `project_activities` sudah ditulis dari enam tempat (task, milestone, file,
 * pembentukan rencana kerja, dsb) tapi **tidak pernah dibaca** — tidak ada satu
 * pun endpoint GET terhadapnya. Layarnya karena itu menampilkan dua aktivitas
 * karangan yang sama untuk setiap project ("John Doe updated the status to
 * In Progress, 2 hours ago").
 */
router.get('/:id/activities', authMiddleware, async (req: Request, res: Response) => {
  try {
    const projectId = Number(req.params.id);
    if (!Number.isInteger(projectId) || projectId <= 0) {
      return res.status(400).json({ error: 'Id project tidak valid' });
    }
    // `LIMIT ?` ditolak MySQL sebagai prepared statement, jadi angkanya
    // divalidasi lalu disisipkan.
    const n = Math.min(Math.max(parseInt(String(req.query.limit ?? '20'), 10) || 20, 1), 100);
    const rows = await dbAll(
      `SELECT a.id, a.action_type, a.description, a.created_at,
              u.full_name AS user_name, u.username
       FROM project_activities a
       LEFT JOIN users u ON u.id = a.user_id
       WHERE a.project_id = ?
       ORDER BY a.created_at DESC, a.id DESC
       LIMIT ${n}`, [projectId]);
    res.json({ data: rows, count: (rows as any[]).length });
  } catch (err: any) {
    console.error('Error membaca aktivitas project:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * SCHED-R57 (penutup) — baseline jadwal project: apa yang DIJUAL.
 *
 * Bedanya dengan `project_tasks`: yang ini tidak boleh berubah. `project_tasks`
 * adalah rencana kerja yang memang harus bisa disunting saat lapangan bergerak.
 * Selisih antara keduanya bukan masalah yang perlu disembunyikan — justru itu
 * informasi yang dicari, dan sebelum ini tidak ada acuan untuk menghitungnya.
 */
router.get('/:id/schedule-baseline', authMiddleware, async (req: Request, res: Response) => {
  try {
    const projectId = Number(req.params.id);
    if (!Number.isInteger(projectId) || projectId <= 0) {
      return res.status(400).json({ error: 'Id project tidak valid' });
    }

    const proyek: any = await dbGet(
      `SELECT id, project_number, project_name, schedule_baseline_checksum,
              schedule_baseline_days, schedule_baseline_start
       FROM client_projects WHERE id = ?`, [projectId]);
    if (!proyek) return res.status(404).json({ error: 'Project tidak ditemukan' });

    const baris: any[] = await dbAll(
      `SELECT * FROM project_schedule_baseline WHERE project_id = ? ORDER BY line_no`,
      [projectId]);

    if (!baris.length) {
      // Dibedakan tegas dari "baseline kosong": project yang lahir sebelum
      // perubahan ini memang tidak punya baseline, dan itu bukan kesalahan.
      // Menjawabnya dengan daftar kosong akan terbaca sebagai "jadwalnya nol
      // hari", yang keliru.
      return res.json({
        project_id: projectId,
        project_number: proyek.project_number,
        ada_baseline: false,
        sebab: 'Project ini dibuat sebelum jadwal ikut disalin saat deal, '
             + 'atau penawarannya tidak punya revisi terbit dengan jadwal.',
        lines: [], variance: [], ringkasan: null,
      });
    }

    const tugas: any[] = await dbAll(
      `SELECT id, title, start_date, due_date, progress, status
       FROM project_tasks WHERE project_id = ?`, [projectId]);

    // Dicocokkan lewat judul yang sama persis. Sengaja tidak fuzzy: tebakan
    // pencocokan yang meleset menghasilkan angka keterlambatan palsu, dan
    // "belum tertaut" adalah jawaban yang jujur.
    const petaTugas = new Map<string, any>();
    for (const t of tugas) {
      const k = String(t.title || '').trim().toLowerCase();
      if (k && !petaTugas.has(k)) petaTugas.set(k, t);
    }

    const HARI = 86400000;
    const variance = baris
      .filter((b: any) => b.row_type === 'item')
      .map((b: any) => {
        const t = petaTugas.get(String(b.name || '').trim().toLowerCase());
        let durasiKerja: number | null = null;
        if (t?.start_date && t?.due_date) {
          durasiKerja = Math.round(
            (new Date(t.due_date).getTime() - new Date(t.start_date).getTime()) / HARI * 1000) / 1000;
        }
        return {
          line_no: b.line_no,
          kode: b.kode,
          name: b.name,
          baseline_start_date: b.start_date ? String(b.start_date).slice(0, 10) : null,
          baseline_duration_days: Number(b.duration_days),
          task_id: t?.id ?? null,
          task_start_date: t?.start_date ? String(t.start_date).slice(0, 10) : null,
          task_duration_days: durasiKerja,
          progress: t ? Number(t.progress) || 0 : null,
          // null berarti belum bisa dibandingkan, BUKAN nol selisih.
          selisih_hari: durasiKerja === null ? null
            : Math.round((durasiKerja - Number(b.duration_days)) * 1000) / 1000,
          status: t ? 'tertaut' : 'belum_tertaut',
        };
      });

    const tertaut = variance.filter(v => v.status === 'tertaut');
    res.json({
      project_id: projectId,
      project_number: proyek.project_number,
      ada_baseline: true,
      revision_no: baris[0]?.revision_no ?? null,
      proposal_id: baris[0]?.proposal_id ?? null,
      checksum: proyek.schedule_baseline_checksum,
      total_days: proyek.schedule_baseline_days === null ? null : Number(proyek.schedule_baseline_days),
      start_date: proyek.schedule_baseline_start
        ? String(proyek.schedule_baseline_start).slice(0, 10) : null,
      lines: baris.map((b: any) => ({
        line_no: b.line_no, type: b.row_type, kode: b.kode, name: b.name,
        start_day: Number(b.start_day), duration_days: Number(b.duration_days),
        start_date: b.start_date ? String(b.start_date).slice(0, 10) : null,
        end_date: b.end_date ? String(b.end_date).slice(0, 10) : null,
        qty: b.qty === null ? null : Number(b.qty), unit: b.unit,
        total_price: b.total_price === null ? null : Number(b.total_price),
        labor_total_oh: Number(b.labor_total_oh),
      })),
      variance,
      ringkasan: {
        baris_baseline: variance.length,
        tertaut: tertaut.length,
        belum_tertaut: variance.length - tertaut.length,
        total_selisih_hari: tertaut.reduce((s, v) => s + (v.selisih_hari || 0), 0),
      },
    });
  } catch (err: any) {
    console.error('Error membaca baseline jadwal:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * Bentuk rencana kerja awal dari baseline — atas permintaan, bukan diam-diam.
 *
 * Sengaja TIDAK dijalankan otomatis saat deal. Membuat puluhan task tanpa
 * diminta akan mengubah apa yang dilihat tim proyek di hari pertama, dan itu
 * keputusan mereka, bukan efek samping transisi status.
 */
router.post('/:id/schedule/seed-from-baseline', authMiddleware, async (req: Request, res: Response) => {
  try {
    const projectId = Number(req.params.id);
    if (!Number.isInteger(projectId) || projectId <= 0) {
      return res.status(400).json({ error: 'Id project tidak valid' });
    }
    const userId = (req as any).user?.userId || null;

    const hasil = await withTransaction(async (tx: TxRunner) => {
      const proyek: any = await tx.get(
        'SELECT id FROM client_projects WHERE id = ? FOR UPDATE', [projectId]);
      if (!proyek) return { error: 404, body: { error: 'Project tidak ditemukan' } };

      const baris: any[] = await tx.all(
        `SELECT * FROM project_schedule_baseline
         WHERE project_id = ? AND row_type = 'item' ORDER BY line_no`, [projectId]);
      if (!baris.length) {
        return { error: 400, body: {
          error: 'Project ini tidak punya baseline jadwal yang bisa disalin.',
          code: 'BASELINE_JADWAL_TIDAK_ADA',
        } };
      }

      // Sudah ada task = jangan menggandakan. Rencana kerja yang sudah berjalan
      // tidak boleh ditimpa oleh tombol yang niatnya cuma "mulai dari nol".
      const adaTugas: any = await tx.get(
        'SELECT COUNT(*) n FROM project_tasks WHERE project_id = ?', [projectId]);
      if (Number(adaTugas?.n) > 0) {
        return { error: 409, body: {
          error: `Project ini sudah punya ${adaTugas.n} task. Rencana kerja yang sudah berjalan tidak ditimpa.`,
          code: 'RENCANA_KERJA_SUDAH_ADA',
        } };
      }

      const HARI = 86400000;
      let dibuat = 0;
      for (const b of baris) {
        const mulai = b.start_date ? String(b.start_date).slice(0, 10) : null;
        const selesai = mulai
          ? new Date(new Date(mulai).getTime() + Number(b.duration_days) * HARI)
              .toISOString().slice(0, 10)
          : null;
        await tx.run(
          `INSERT INTO project_tasks
            (project_id, title, description, status, priority, start_date, due_date, sort_order)
           VALUES (?, ?, ?, 'To Do', 'Medium', ?, ?, ?)`,
          [projectId, String(b.name || b.kode || `Pekerjaan ${b.line_no}`).slice(0, 255),
           `Dari baseline jadwal kontrak (revisi #${b.revision_no ?? '-'}), `
           + `durasi ${Number(b.duration_days)} hari.`,
           mulai, selesai, b.line_no]);
        dibuat++;
      }

      await tx.run(
        `INSERT INTO project_activities (project_id, user_id, action_type, description)
         VALUES (?, ?, 'seed_schedule', ?)`,
        [projectId, userId, `Rencana kerja dibentuk dari baseline jadwal: ${dibuat} task`]);

      return { ok: true, dibuat };
    });

    if ((hasil as any).error) return res.status((hasil as any).error).json((hasil as any).body);
    res.status(201).json({
      message: `${(hasil as any).dibuat} task dibentuk dari baseline jadwal.`,
      dibuat: (hasil as any).dibuat,
    });
  } catch (err: any) {
    console.error('Error membentuk rencana kerja dari baseline:', err);
    res.status(500).json({ error: err.message });
  }
});

export const projectRoutes = router;

