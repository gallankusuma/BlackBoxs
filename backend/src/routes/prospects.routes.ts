import express, { Request, Response } from 'express';
import { dbQuery, dbGet, dbAll, dbRun, withTransaction, TxRunner } from '../config/database';
import { authMiddleware } from '../middleware/auth';

const router = express.Router();

// Tabel prospects dibuat di config/database.ts (ensureRouteModuleSchema)

/**
 * Nomor `PREFIX-0001` yang dialokasikan secara atomic lewat `document_counters`.
 *
 * Versi sebelumnya membaca baris terakhir lalu menambah satu. `prospects.code`
 * dan `clients.code` keduanya UNIQUE, jadi dua permintaan yang datang bersamaan
 * membaca angka yang sama, satu berhasil dan satunya jatuh sebagai
 * ER_DUP_ENTRY — muncul ke pengguna sebagai 500 tanpa penjelasan.
 *
 * `LAST_INSERT_ID()` di bawah mengembalikan nilai yang di-set statement itu
 * sendiri pada koneksi yang sama, jadi tiap pemanggil dapat nomor berbeda tanpa
 * saling menunggu. Polanya sama dengan `nextSequentialCode` di procurement,
 * hanya tanpa bagian tanggal karena format kode di sini `PSP-0001`, bukan
 * `PSP-20260818-0001`.
 *
 * Seed diambil dari tabelnya sendiri supaya penomoran tidak mundur di database
 * yang sudah berisi data, termasuk kode yang dulu diisi manual.
 */
const nextCode = async (
  prefix: string, table: string, tx: TxRunner
): Promise<string> => {
  const row: any = await tx.get(
    `SELECT MAX(CAST(SUBSTRING_INDEX(code, '-', -1) AS UNSIGNED)) AS maxNum
     FROM ${table} WHERE code LIKE ?`,
    [`${prefix}-%`]
  );
  const seed = Number(row?.maxNum || 0);

  await tx.run(
    `INSERT INTO document_counters (prefix, date_part, last_no)
     VALUES (?, '', LAST_INSERT_ID(? + 1))
     ON DUPLICATE KEY UPDATE last_no = LAST_INSERT_ID(GREATEST(last_no, ?) + 1)`,
    [prefix, seed, seed]
  );

  const got: any = await tx.get('SELECT LAST_INSERT_ID() AS n');
  return `${prefix}-${String(Number(got?.n || seed + 1)).padStart(4, '0')}`;
};

// ── GET / — List with filters ──
router.get('/', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { search, temperature, status, source, assigned_to,
      sort_by = 'created_at', sort_dir = 'DESC',
      page = '1', limit = '25' } = req.query;

    let where = '1=1';
    const params: any[] = [];

    if (search) {
      where += ` AND (p.company_name LIKE ? OR p.contact_name LIKE ? OR p.email LIKE ? OR p.code LIKE ?)`;
      const s = `%${search}%`;
      params.push(s, s, s, s);
    }
    if (temperature) { where += ` AND p.temperature = ?`; params.push(temperature); }
    if (status) { where += ` AND p.status = ?`; params.push(status); }
    if (source) { where += ` AND p.source = ?`; params.push(source); }
    if (assigned_to) { where += ` AND p.assigned_to = ?`; params.push(assigned_to); }

    const countRow = await dbGet(`SELECT COUNT(*) as total FROM prospects p WHERE ${where}`, params);
    const total = countRow?.total || 0;

    const validSorts = ['created_at', 'updated_at', 'company_name', 'temperature', 'status', 'estimated_value', 'next_follow_up'];
    const sortCol = validSorts.includes(sort_by as string) ? sort_by : 'created_at';
    const sortDirection = (sort_dir as string).toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    const pageNum = Math.max(1, parseInt(page as string, 10));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit as string, 10)));
    const offset = (pageNum - 1) * limitNum;

    const rows = await dbAll(`
      SELECT p.*, u.full_name as assigned_to_name, cb.full_name as created_by_name
      FROM prospects p
      LEFT JOIN users u ON p.assigned_to = u.id
      LEFT JOIN users cb ON p.created_by = cb.id
      WHERE ${where}
      ORDER BY p.${sortCol} ${sortDirection}
      LIMIT ${limitNum} OFFSET ${offset}
    `, params);

    res.json({
      data: rows,
      pagination: { total, page: pageNum, limit: limitNum, totalPages: Math.ceil(total / limitNum) }
    });
  } catch (error: any) {
    console.error('Error fetching prospects:', error);
    res.status(500).json({ error: error.message });
  }
});

// ── GET /stats ──
router.get('/stats', authMiddleware, async (_req: Request, res: Response) => {
  try {
    const tempStats = await dbAll(`
      SELECT temperature, COUNT(*) as count FROM prospects WHERE status NOT IN ('converted','disqualified') GROUP BY temperature
    `);
    const statusStats = await dbAll(`SELECT status, COUNT(*) as count FROM prospects GROUP BY status`);
    const summary = await dbGet(`
      SELECT SUM(estimated_value) as total_value, COUNT(*) as total_count,
        SUM(CASE WHEN status NOT IN ('converted','disqualified') THEN 1 ELSE 0 END) as active_count,
        SUM(CASE WHEN status = 'converted' THEN 1 ELSE 0 END) as converted_count,
        SUM(CASE WHEN next_follow_up <= CURDATE() AND status NOT IN ('converted','disqualified') THEN 1 ELSE 0 END) as overdue_followups
      FROM prospects
    `);
    res.json({ temperature: tempStats, status: statusStats, summary: summary || {} });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ── GET /:id ──
router.get('/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const row = await dbGet(`
      SELECT p.*, u.full_name as assigned_to_name, cb.full_name as created_by_name
      FROM prospects p LEFT JOIN users u ON p.assigned_to = u.id LEFT JOIN users cb ON p.created_by = cb.id
      WHERE p.id = ?
    `, [req.params.id]);
    if (!row) return res.status(404).json({ error: 'Prospect not found' });
    res.json({ data: row });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ── POST / ──
router.post('/', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { company_name, contact_name, contact_title, email, phone, industry, website, address, city, country,
      source, temperature, status, interest, estimated_value, next_follow_up, assigned_to, notes } = req.body;

    if (!company_name) return res.status(400).json({ error: 'Company name is required' });
    const userId = (req as any).userId || null;

    const { id, code } = await withTransaction(async (tx) => {
      const code = await nextCode('PSP', 'prospects', tx);
      const result = await tx.run(`
        INSERT INTO prospects (code, company_name, contact_name, contact_title, email, phone, industry, website,
          address, city, country, source, temperature, status, interest, estimated_value, next_follow_up, assigned_to, notes, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [code, company_name, contact_name||null, contact_title||null, email||null, phone||null,
          industry||null, website||null, address||null, city||null, country||'Indonesia',
          source||'other', temperature||'cold', status||'new', interest||null,
          estimated_value||0, next_follow_up||null, assigned_to||null, notes||null, userId]);
      return { id: result.insertId, code };
    });

    res.status(201).json({ data: { id, code }, message: 'Prospect created' });
  } catch (error: any) {
    console.error('Error creating prospect:', error);
    res.status(500).json({ error: error.message });
  }
});

// ── PUT /:id ──
router.put('/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { company_name, contact_name, contact_title, email, phone, industry, website, address, city, country,
      source, temperature, status, interest, estimated_value, next_follow_up, assigned_to, notes } = req.body;

    await dbRun(`
      UPDATE prospects SET company_name=?, contact_name=?, contact_title=?, email=?, phone=?,
        industry=?, website=?, address=?, city=?, country=?, source=?, temperature=?, status=?,
        interest=?, estimated_value=?, next_follow_up=?, assigned_to=?, notes=?
      WHERE id = ?
    `, [company_name, contact_name, contact_title, email, phone, industry, website, address, city, country,
        source, temperature, status, interest, estimated_value, next_follow_up||null, assigned_to||null, notes, req.params.id]);

    res.json({ message: 'Prospect updated' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ── DELETE /:id ──
router.delete('/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    await dbRun('DELETE FROM prospects WHERE id = ?', [req.params.id]);
    res.json({ message: 'Prospect deleted' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Konversi prospect menjadi client.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * Versi sebelumnya bernama `convert-to-lead` dan hanya menjalankan satu
 * UPDATE: `status='converted'`. Ia tidak membuat baris apa pun di hilir dan
 * tidak mengisi `converted_to_client_id` maupun `converted_to_lead_id`, lalu
 * mengembalikan payload data prospect seolah-olah sesuatu telah dibuat.
 * Akibatnya prospect keluar dari daftar aktif (`status NOT IN ('converted',…)`
 * di /stats) tanpa pernah muncul sebagai client — sales menganggapnya sudah
 * diserahkan, padahal tidak ada penerimanya.
 *
 * **Tujuannya client, bukan lead, dan itu bukan pilihan gaya:** tabel `leads`
 * tidak ada di skema — diperiksa di INFORMATION_SCHEMA, produksi maupun dev.
 * Kolom `converted_to_lead_id` ada tapi tidak punya tabel tujuan, jadi tidak
 * bisa diisi. Yang ada dan memang disiapkan untuk ini adalah `clients` +
 * `contacts` + kolom `converted_to_client_id`.
 *
 * Kontak prospect (nama/jabatan/email/telepon) ikut dipindah ke `contacts`
 * karena `clients` tidak punya kolom email — tanpa langkah ini email dan nama
 * PIC hilang saat konversi.
 *
 * Baris prospect dikunci `FOR UPDATE` dan statusnya diperiksa ulang **di dalam**
 * kunci. Tanpa itu dua permintaan bersamaan sama-sama lolos pemeriksaan
 * `status === 'converted'` dan membuat dua client untuk satu prospect.
 * ───────────────────────────────────────────────────────────────────────────
 */
const convertToClient = async (req: Request, res: Response) => {
  try {
    const out = await withTransaction(async (tx) => {
      const prospect = await tx.get(
        'SELECT * FROM prospects WHERE id = ? FOR UPDATE', [req.params.id]
      );
      if (!prospect) return { status: 404, body: { error: 'Prospect not found' } };
      if (prospect.status === 'converted') {
        return { status: 400, body: {
          error: 'Already converted',
          code: 'ALREADY_CONVERTED',
          client_id: prospect.converted_to_client_id || null,
        } };
      }
      if (prospect.status === 'disqualified') {
        return { status: 400, body: {
          error: 'Prospect sudah didiskualifikasi, tidak bisa dikonversi',
          code: 'PROSPECT_DISQUALIFIED',
        } };
      }

      const code = await nextCode('BUY', 'clients', tx);
      const client = await tx.run(
        `INSERT INTO clients (code, client_type, name, organization, address, city, phone, website)
         VALUES (?, 'buyer', ?, ?, ?, ?, ?, ?)`,
        [code, prospect.company_name, prospect.industry || null, prospect.address || null,
         prospect.city || null, prospect.phone || null, prospect.website || null]
      );
      const clientId = client.insertId;

      let contactId: number | null = null;
      if (prospect.contact_name) {
        const contact = await tx.run(
          `INSERT INTO contacts (client_id, name, job_title, email, phone, is_primary)
           VALUES (?, ?, ?, ?, ?, 1)`,
          [clientId, prospect.contact_name, prospect.contact_title || null,
           prospect.email || null, prospect.phone || null]
        );
        contactId = contact.insertId;
        await tx.run('UPDATE clients SET primary_contact_id = ? WHERE id = ?', [contactId, clientId]);
      }

      await tx.run(
        `UPDATE prospects SET status = 'converted', converted_at = NOW(), converted_to_client_id = ?
         WHERE id = ?`,
        [clientId, req.params.id]
      );

      return { status: 200, body: {
        message: 'Prospect converted to client',
        data: {
          client_id: clientId, client_code: code, contact_id: contactId,
          company: prospect.company_name, contact_name: prospect.contact_name,
          email: prospect.email, phone: prospect.phone,
          value: prospect.estimated_value, source: prospect.source,
        },
      } };
    });

    res.status(out.status).json(out.body);
  } catch (error: any) {
    console.error('Error converting prospect:', error);
    res.status(500).json({ error: error.message });
  }
};

// ── POST /:id/convert-to-client ──
router.post('/:id/convert-to-client', authMiddleware, convertToClient);

// Nama lama dipertahankan sebagai alias supaya pemanggil yang sudah ada tidak
// putus. Tidak ada konsumen frontend saat ini, tapi endpoint ini sudah live.
router.post('/:id/convert-to-lead', authMiddleware, convertToClient);

export default router;
