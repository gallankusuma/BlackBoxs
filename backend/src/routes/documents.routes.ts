import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth';
import { dbAll, dbGet, dbRun } from '../config/database';
import multer from 'multer';
import path from 'path';
import fs from 'fs';

const router = Router();

// ── Upload config ────────────────────────────────────────────────────────────
const uploadDir = path.join(process.cwd(), 'uploads', 'documents');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${unique}${path.extname(file.originalname)}`);
  },
});
const upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } }); // 50 MB

// ── Categories ───────────────────────────────────────────────────────────────
router.get('/categories', authMiddleware, async (_req: Request, res: Response) => {
  try {
    const rows = await dbAll(
      `SELECT c.*, COUNT(d.id) as doc_count
       FROM document_categories c
       LEFT JOIN documents d ON d.category_id = c.id AND d.status != 'obsolete'
       GROUP BY c.id ORDER BY c.sort_order, c.name`,
      []
    );
    res.json({ data: rows });
  } catch { res.status(500).json({ error: 'Failed to fetch categories' }); }
});

router.post('/categories', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { name, code, icon, color, description, sort_order } = req.body;
    const r = await dbRun(
      'INSERT INTO document_categories (name,code,icon,color,description,sort_order) VALUES (?,?,?,?,?,?)',
      [name, code, icon || '📄', color || '#3b82f6', description || '', sort_order || 0]
    );
    res.json({ data: { id: r.insertId, name, code } });
  } catch (e: any) {
    res.status(400).json({ error: e.message || 'Failed to create category' });
  }
});

router.put('/categories/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { name, icon, color, description, sort_order } = req.body;
    await dbRun(
      'UPDATE document_categories SET name=?,icon=?,color=?,description=?,sort_order=? WHERE id=?',
      [name, icon, color, description, sort_order, req.params.id]
    );
    res.json({ success: true });
  } catch { res.status(500).json({ error: 'Failed to update category' }); }
});

router.delete('/categories/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const cnt: any = await dbGet('SELECT COUNT(*) as n FROM documents WHERE category_id=?', [req.params.id]);
    if (cnt?.n > 0) return res.status(400).json({ error: 'Kategori masih memiliki dokumen' });
    await dbRun('DELETE FROM document_categories WHERE id=?', [req.params.id]);
    res.json({ success: true });
  } catch { res.status(500).json({ error: 'Failed to delete category' }); }
});

// ── Documents ────────────────────────────────────────────────────────────────
router.get('/', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { category_id, status, doc_type, search, project_id } = req.query;
    let where = 'WHERE 1=1';
    const params: any[] = [];
    if (category_id)  { where += ' AND d.category_id=?';  params.push(category_id); }
    if (status)       { where += ' AND d.status=?';        params.push(status); }
    if (doc_type)     { where += ' AND d.doc_type=?';      params.push(doc_type); }
    if (project_id)   { where += ' AND d.project_id=?';    params.push(project_id); }
    if (search)       { where += ' AND (d.title LIKE ? OR d.doc_number LIKE ? OR d.tags LIKE ?)';
                        const q = `%${search}%`; params.push(q, q, q); }

    const rows = await dbAll(
      `SELECT d.*, c.name as category_name, c.icon as category_icon, c.color as category_color,
              p.name as project_name
       FROM documents d
       JOIN document_categories c ON d.category_id = c.id
       LEFT JOIN projects p ON d.project_id = p.id
       ${where}
       ORDER BY d.updated_at DESC`,
      params
    );
    res.json({ data: rows });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Failed to fetch documents' }); }
});

router.get('/stats', authMiddleware, async (_req: Request, res: Response) => {
  try {
    const total     = await dbGet('SELECT COUNT(*) as n FROM documents', []);
    const approved  = await dbGet("SELECT COUNT(*) as n FROM documents WHERE status='approved'", []);
    const draft     = await dbGet("SELECT COUNT(*) as n FROM documents WHERE status='draft'", []);
    const review    = await dbGet("SELECT COUNT(*) as n FROM documents WHERE status='review'", []);
    const byType    = await dbAll('SELECT doc_type, COUNT(*) as cnt FROM documents GROUP BY doc_type', []);
    const recent    = await dbAll(
      `SELECT d.id, d.doc_number, d.title, d.status, d.updated_at, c.icon, c.color
       FROM documents d JOIN document_categories c ON d.category_id=c.id
       ORDER BY d.updated_at DESC LIMIT 5`,
      []
    );
    res.json({ total: (total as any)?.n, approved: (approved as any)?.n,
               draft: (draft as any)?.n, review: (review as any)?.n,
               byType, recent });
  } catch { res.status(500).json({ error: 'Failed to fetch stats' }); }
});

router.get('/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const doc = await dbGet(
      `SELECT d.*, c.name as category_name, c.icon as category_icon, c.color as category_color,
              p.name as project_name
       FROM documents d
       JOIN document_categories c ON d.category_id=c.id
       LEFT JOIN projects p ON d.project_id=p.id
       WHERE d.id=?`,
      [req.params.id]
    );
    if (!doc) return res.status(404).json({ error: 'Document not found' });
    // Log view
    const userId = (req as any).user?.id;
    await dbRun('INSERT INTO document_access_log (document_id, user_id, action) VALUES (?,?,?)',
      [req.params.id, userId || null, 'view']);
    res.json({ data: doc });
  } catch { res.status(500).json({ error: 'Failed to fetch document' }); }
});

// Create without file
router.post('/', authMiddleware, async (req: Request, res: Response) => {
  try {
    const {
      title, category_id, doc_type, revision, status, description,
      discipline, approved_by, approved_at, effective_date, review_date,
      tags, project_id
    } = req.body;

    // Auto generate doc number
    const cat: any = await dbGet('SELECT code FROM document_categories WHERE id=?', [category_id]);
    const cnt: any = await dbGet('SELECT COUNT(*) as n FROM documents WHERE category_id=?', [category_id]);
    const docNumber = `${cat?.code || 'DOC'}-${String((cnt?.n || 0) + 1).padStart(4, '0')}`;

    const r = await dbRun(
      `INSERT INTO documents
       (doc_number, title, category_id, doc_type, revision, status, description,
        discipline, approved_by, approved_at, effective_date, review_date, tags, project_id)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [docNumber, title, category_id, doc_type || 'procedure', revision || 'A',
       status || 'draft', description || '', discipline || '',
       approved_by || '', approved_at || null, effective_date || null,
       review_date || null, tags || '', project_id || null]
    );
    res.json({ data: { id: r.insertId, doc_number: docNumber } });
  } catch (e: any) {
    res.status(400).json({ error: e.message || 'Failed to create document' });
  }
});

// Upload file to existing doc
router.post('/:id/upload', authMiddleware, upload.single('file'), async (req: Request, res: Response) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const fileUrl = `/uploads/documents/${req.file.filename}`;
    await dbRun(
      'UPDATE documents SET file_url=?, file_name=?, file_size=?, file_type=?, updated_at=NOW() WHERE id=?',
      [fileUrl, req.file.originalname, req.file.size, req.file.mimetype, req.params.id]
    );
    res.json({ data: { file_url: fileUrl, file_name: req.file.originalname } });
  } catch { res.status(500).json({ error: 'Failed to upload file' }); }
});

router.put('/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const {
      title, category_id, doc_type, revision, status, description,
      discipline, approved_by, approved_at, effective_date, review_date, tags, project_id
    } = req.body;
    await dbRun(
      `UPDATE documents SET title=?,category_id=?,doc_type=?,revision=?,status=?,description=?,
       discipline=?,approved_by=?,approved_at=?,effective_date=?,review_date=?,tags=?,project_id=?,
       updated_at=NOW() WHERE id=?`,
      [title, category_id, doc_type, revision, status, description,
       discipline, approved_by, approved_at || null, effective_date || null,
       review_date || null, tags, project_id || null, req.params.id]
    );
    res.json({ success: true });
  } catch { res.status(500).json({ error: 'Failed to update document' }); }
});

router.delete('/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const doc: any = await dbGet('SELECT file_url FROM documents WHERE id=?', [req.params.id]);
    if (doc?.file_url) {
      const filePath = path.join(process.cwd(), doc.file_url);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }
    await dbRun('DELETE FROM document_access_log WHERE document_id=?', [req.params.id]);
    await dbRun('DELETE FROM documents WHERE id=?', [req.params.id]);
    res.json({ success: true });
  } catch { res.status(500).json({ error: 'Failed to delete document' }); }
});

// Serve uploaded file
router.get('/:id/download', authMiddleware, async (req: Request, res: Response) => {
  try {
    const doc: any = await dbGet('SELECT file_url, file_name FROM documents WHERE id=?', [req.params.id]);
    if (!doc?.file_url) return res.status(404).json({ error: 'No file attached' });
    const userId = (req as any).user?.id;
    await dbRun('INSERT INTO document_access_log (document_id, user_id, action) VALUES (?,?,?)',
      [req.params.id, userId || null, 'download']);
    const filePath = path.join(process.cwd(), doc.file_url);
    res.download(filePath, doc.file_name || 'document');
  } catch { res.status(500).json({ error: 'Failed to download file' }); }
});

export default router;
