import express, { Request, Response } from 'express';
import { dbQuery, dbGet, dbAll, dbRun } from '../config/database';
import { authMiddleware } from '../middleware/auth';
import { bulatUang } from '../utils/money';

const router = express.Router();

// ============================================
// CLIENT MANAGEMENT ROUTES
// ============================================

// GET /api/clients - List all clients with filters
router.get('/', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { search, group_id, label_id, has_due, has_open_projects, my_clients, page = 1, limit = 10 } = req.query;

    let query = `
      SELECT c.*, 
             cg.name as group_name, cg.color as group_color,
             COUNT(DISTINCT cp.id) as projects_count,
             COUNT(DISTINCT ci.id) as invoices_count,
             (SELECT name FROM contacts WHERE client_id = c.id AND is_primary = 1 LIMIT 1) as primary_contact_name
      FROM clients c
      LEFT JOIN client_groups cg ON c.client_group_id = cg.id
      LEFT JOIN client_projects cp ON c.id = cp.client_id
      LEFT JOIN client_invoices ci ON c.id = ci.client_id
      WHERE c.is_active = 1
    `;

    const params: any[] = [];

    if (search) {
      query += ` AND (c.name LIKE ? OR c.code LIKE ? OR c.phone LIKE ?)`;
      const searchTerm = `%${search}%`;
      params.push(searchTerm, searchTerm, searchTerm);
    }

    if (group_id) {
      query += ` AND c.client_group_id = ?`;
      params.push(group_id);
    }

    if (has_due === 'true') {
      query += ` AND c.due_amount > 0`;
    }

    if (has_open_projects === 'true') {
      query += ` AND EXISTS (SELECT 1 FROM client_projects WHERE client_id = c.id AND status = 'open')`;
    }

    query += ` GROUP BY c.id ORDER BY c.name ASC`;

    // Pagination
    const limitNum = Math.max(1, Math.min(100, Number(limit) || 10));
    const offsetNum = Math.max(0, (Number(page) - 1) * limitNum);
    query += ` LIMIT ${limitNum} OFFSET ${offsetNum}`;

    const clients = await dbAll(query, params);

    // Get labels for each client
    for (const client of clients) {
      const labels = await dbAll(
        `SELECT cl.id, cl.name, cl.color 
         FROM client_labels cl
         JOIN client_label_map clm ON cl.id = clm.label_id
         WHERE clm.client_id = ?`,
        [client.id]
      );
      client.labels = labels;
    }

    // Get total count
    let countQuery = `SELECT COUNT(DISTINCT c.id) as total FROM clients c WHERE c.is_active = 1`;
    const countParams: any[] = [];

    if (search) {
      countQuery += ` AND (c.name LIKE ? OR c.code LIKE ? OR c.phone LIKE ?)`;
      const searchTerm = `%${search}%`;
      countParams.push(searchTerm, searchTerm, searchTerm);
    }

    if (group_id) {
      countQuery += ` AND c.client_group_id = ?`;
      countParams.push(group_id);
    }

    if (has_due === 'true') {
      countQuery += ` AND c.due_amount > 0`;
    }

    const countResult = await dbGet(countQuery, countParams);

    res.json({
      data: clients,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total: countResult.total
      }
    });
  } catch (error) {
    console.error('Error fetching clients:', error);
    res.status(500).json({ error: 'Failed to fetch clients' });
  }
});

// GET /api/clients/dashboard - Dashboard overview metrics
router.get('/dashboard', authMiddleware, async (req: Request, res: Response) => {
  try {
    // Total clients
    const totalClients = await dbGet('SELECT COUNT(*) as count FROM clients WHERE is_active = 1', []);

    // Total contacts
    const totalContacts = await dbGet('SELECT COUNT(*) as count FROM contacts WHERE is_active = 1', []);

    // Contacts logged in today
    const today = new Date().toISOString().split('T')[0];
    const contactsToday = await dbGet('SELECT COUNT(*) as count FROM contacts WHERE DATE(last_login) = ?', [today]);

    // Contacts logged in last 7 days
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const contactsWeek = await dbGet('SELECT COUNT(*) as count FROM contacts WHERE last_login >= ?', [sevenDaysAgo.toISOString().split('T')[0]]);

    // Invoice status counts
    const unpaidInvoices = await dbGet('SELECT COUNT(DISTINCT client_id) as count FROM client_invoices WHERE status = "sent" AND paid_amount = 0', []);
    const partialInvoices = await dbGet('SELECT COUNT(DISTINCT client_id) as count FROM client_invoices WHERE status = "partial"', []);
    const overdueInvoices = await dbGet('SELECT COUNT(DISTINCT client_id) as count FROM client_invoices WHERE status = "overdue"', []);

    // Project status counts
    const openProjects = await dbGet('SELECT COUNT(*) as count FROM client_projects WHERE status = "open"', []);
    const completedProjects = await dbGet('SELECT COUNT(*) as count FROM client_projects WHERE status = "completed"', []);
    const holdProjects = await dbGet('SELECT COUNT(*) as count FROM client_projects WHERE status = "hold"', []);
    const canceledProjects = await dbGet('SELECT COUNT(*) as count FROM client_projects WHERE status = "canceled"', []);

    // Estimate status counts
    const openEstimates = await dbGet('SELECT COUNT(*) as count FROM client_estimates WHERE status = "sent"', []);
    const acceptedEstimates = await dbGet('SELECT COUNT(*) as count FROM client_estimates WHERE status = "accepted"', []);
    const newEstimates = await dbGet('SELECT COUNT(*) as count FROM client_estimates WHERE status = "draft"', []);

    // Proposal status counts
    //
    // Sumbernya `proposals` — tabel yang benar-benar dipakai Estimator. Versi
    // lama menghitung `client_proposals`, tabel kedua tanpa relasi apa pun ke
    // proposal estimator maupun project; di produksi isinya 0 baris sementara
    // `proposals` berisi penawaran sungguhan, jadi angka ini selalu nol.
    const openProposals = await dbGet(`SELECT COUNT(*) as count FROM proposals WHERE status = 'submitted'`, []);
    const acceptedProposals = await dbGet(`SELECT COUNT(*) as count FROM proposals WHERE status = 'deal'`, []);
    const rejectedProposals = await dbGet(`SELECT COUNT(*) as count FROM proposals WHERE status = 'no_deal'`, []);

    // Ticket and order counts
    const openTickets = await dbGet('SELECT COUNT(*) as count FROM client_tickets WHERE status = "open"', []);
    const newOrders = await dbGet('SELECT COUNT(*) as count FROM client_orders WHERE status = "confirmed" AND DATE(order_date) >= ?', [sevenDaysAgo.toISOString().split('T')[0]]);

    res.json({
      data: {
        metrics: {
          totalClients: totalClients.count,
          totalContacts: totalContacts.count,
          contactsLoggedToday: contactsToday.count,
          contactsLoggedWeek: contactsWeek.count
        },
        invoices: {
          unpaid: unpaidInvoices.count,
          unpaidPercentage: Math.round((unpaidInvoices.count / totalClients.count) * 100) || 0,
          partial: partialInvoices.count,
          partialPercentage: Math.round((partialInvoices.count / totalClients.count) * 100) || 0,
          overdue: overdueInvoices.count,
          overduePercentage: Math.round((overdueInvoices.count / totalClients.count) * 100) || 0
        },
        projects: {
          open: openProjects.count,
          completed: completedProjects.count,
          hold: holdProjects.count,
          canceled: canceledProjects.count
        },
        estimates: {
          open: openEstimates.count,
          accepted: acceptedEstimates.count,
          newRequests: newEstimates.count,
          inProgress: 1 // We'll calculate this differently if needed
        },
        proposals: {
          open: openProposals.count,
          accepted: acceptedProposals.count,
          rejected: rejectedProposals.count
        },
        tickets: {
          open: openTickets.count,
          percentage: Math.round((openTickets.count / totalClients.count) * 100) || 0
        },
        orders: {
          new: newOrders.count,
          percentage: Math.round((newOrders.count / totalClients.count) * 100) || 0
        }
      }
    });
  } catch (error) {
    console.error('Error fetching dashboard metrics:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard metrics' });
  }
});

// GET /api/clients/:id - Get single client with full details
router.get('/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const client = await dbGet(
      `SELECT c.*, cg.name as group_name, cg.color as group_color
       FROM clients c
       LEFT JOIN client_groups cg ON c.client_group_id = cg.id
       WHERE c.id = ?`,
      [req.params.id]
    );

    if (!client) {
      return res.status(404).json({ error: 'Client not found' });
    }

    // Get labels
    const labels = await dbAll(
      `SELECT cl.* FROM client_labels cl
       JOIN client_label_map clm ON cl.id = clm.label_id
       WHERE clm.client_id = ?`,
      [client.id]
    );
    client.labels = labels;

    // Get primary contact
    const primaryContact = await dbGet('SELECT * FROM contacts WHERE client_id = ? AND is_primary = 1', [client.id]);
    client.primary_contact = primaryContact;

    // Get all contacts
    const contacts = await dbAll('SELECT * FROM contacts WHERE client_id = ? ORDER BY is_primary DESC, name ASC', [client.id]);
    client.contacts = contacts;

    // Get projects
    const projects = await dbAll(`
      SELECT 
        p.*, 
        p.project_name as name, 
        p.budget as price,
        (SELECT COUNT(*) FROM project_tasks t WHERE t.project_id = p.id AND t.status = 'Done') * 100 / 
        NULLIF((SELECT COUNT(*) FROM project_tasks t WHERE t.project_id = p.id), 0) as progress
      FROM client_projects p 
      WHERE p.client_id = ? 
      ORDER BY p.created_at DESC
    `, [client.id]);
    client.projects = projects.map((p: any) => ({
      ...p,
      progress: Math.round(p.progress || 0)
    }));

    // Get invoices
    const invoices = await dbAll('SELECT * FROM client_invoices WHERE client_id = ? ORDER BY invoice_date DESC LIMIT 10', [client.id]);
    client.invoices = invoices;

    // Get estimates
    const estimates = await dbAll('SELECT * FROM client_estimates WHERE client_id = ? ORDER BY estimate_date DESC LIMIT 10', [client.id]);
    client.estimates = estimates;

    // Get proposals
    //
    // Sumber kebenaran komersial adalah tabel `proposals` milik Estimator, bukan
    // `client_proposals`. Yang kedua adalah tabel terpisah tanpa relasi ke
    // proposal estimator maupun project, dengan kontrak field berbeda pula
    // (`proposal_date`/`total_amount`/status lowercase). Di produksi isinya
    // **0 baris** sementara `proposals` berisi penawaran sungguhan yang semuanya
    // sudah ber-`client_id` — jadi tab ini selalu kosong, dan yang menutupi
    // kekosongan itu adalah dua baris palsu yang disuntikkan di frontend.
    //
    // Nama field diselaraskan di sini supaya layar tidak perlu tahu dua bentuk.
    const proposals = await dbAll(
      `SELECT id, proposal_number, project_name, revision, status,
              DATE(created_at) AS date,
              submitted_at, deal_at,
              total_project AS amount
       FROM proposals
       WHERE client_id = ?
       ORDER BY created_at DESC
       LIMIT 10`,
      [client.id]
    );
    client.proposals = (proposals as any[]).map(p => ({ ...p, amount: bulatUang(p.amount) }));

    // Get tickets
    const tickets = await dbAll('SELECT * FROM client_tickets WHERE client_id = ? ORDER BY created_at DESC LIMIT 10', [client.id]);
    client.tickets = tickets;

    // Get orders
    const orders = await dbAll('SELECT * FROM client_orders WHERE client_id = ? ORDER BY order_date DESC LIMIT 10', [client.id]);
    client.orders = orders;

    // Get events
    const events = await dbAll(
      `SELECT ce.*, et.name as event_type_name, et.color as event_type_color
       FROM client_events ce
       JOIN event_types et ON ce.event_type_id = et.id
       WHERE ce.client_id = ? 
       ORDER BY ce.event_date DESC LIMIT 20`,
      [client.id]
    );
    client.events = events;

    res.json({ data: client });
  } catch (error) {
    console.error('Error fetching client:', error);
    res.status(500).json({ error: 'Failed to fetch client' });
  }
});

// POST /api/clients - Create new client
router.post('/', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { client_type, name, organization, address, city, province, postal_code, phone, website, client_group_id } = req.body;

    // Auto-generate code based on client_type
    const typeVal = client_type || 'buyer';
    const prefixMap: Record<string, string> = {
      buyer: 'BUY',
      vendor: 'VND',
      supplier: 'SUP',
      distributor: 'DST',
      contractor: 'CTR',
      partner: 'PTR',
    };
    const prefix = prefixMap[typeVal] || typeVal.substring(0, 3).toUpperCase();

    // Get next sequence number for this prefix
    const lastClient = await dbGet(
      `SELECT code FROM clients WHERE code LIKE ? ORDER BY id DESC LIMIT 1`,
      [`${prefix}-%`]
    );
    let seq = 1;
    if (lastClient && lastClient.code) {
      const parts = lastClient.code.split('-');
      const num = parseInt(parts[1], 10);
      if (!isNaN(num)) seq = num + 1;
    }
    const code = `${prefix}-${String(seq).padStart(4, '0')}`;

    const result = await dbRun(
      `INSERT INTO clients (code, name, organization, address, city, province, postal_code, phone, website, client_group_id) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [code, name || null, organization || null, address || null, city || null, province || null, postal_code || null, phone || null, website || null, client_group_id || null]
    );

    res.status(201).json({ message: 'Client created successfully', id: result.insertId, code });
  } catch (error: any) {
    console.error('Error creating client:', error);
    if (error.code === 'ER_DUP_ENTRY') {
      res.status(400).json({ error: 'Client code already exists' });
    } else {
      res.status(500).json({ error: 'Failed to create client' });
    }
  }
});

// PUT /api/clients/:id - Update client
router.put('/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { name, organization, address, city, province, postal_code, phone, website, client_group_id } = req.body;

    await dbRun(
      `UPDATE clients 
       SET name = ?, organization = ?, address = ?, city = ?, province = ?, postal_code = ?, 
           phone = ?, website = ?, client_group_id = ?
       WHERE id = ?`,
      [name || null, organization || null, address || null, city || null, province || null, postal_code || null, phone || null, website || null, client_group_id || null, req.params.id]
    );

    res.json({ message: 'Client updated successfully' });
  } catch (error) {
    console.error('Error updating client:', error);
    res.status(500).json({ error: 'Failed to update client' });
  }
});

// DELETE /api/clients/:id - Delete (soft delete) client
router.delete('/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    await dbRun('UPDATE clients SET is_active = 0 WHERE id = ?', [req.params.id]);
    res.json({ message: 'Client deleted successfully' });
  } catch (error) {
    console.error('Error deleting client:', error);
    res.status(500).json({ error: 'Failed to delete client' });
  }
});

// POST /api/clients/:id/labels - Assign label to client
router.post('/:id/labels', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { label_id } = req.body;

    await dbRun(
      'INSERT IGNORE INTO client_label_map (client_id, label_id) VALUES (?, ?)',
      [req.params.id, label_id]
    );

    res.json({ message: 'Label assigned successfully' });
  } catch (error) {
    console.error('Error assigning label:', error);
    res.status(500).json({ error: 'Failed to assign label' });
  }
});

// DELETE /api/clients/:id/labels/:labelId - Remove label from client
router.delete('/:id/labels/:labelId', authMiddleware, async (req: Request, res: Response) => {
  try {
    await dbRun(
      'DELETE FROM client_label_map WHERE client_id = ? AND label_id = ?',
      [req.params.id, req.params.labelId]
    );

    res.json({ message: 'Label removed successfully' });
  } catch (error) {
    console.error('Error removing label:', error);
    res.status(500).json({ error: 'Failed to remove label' });
  }
});

// ============================================
// CONTACTS ROUTES
// ============================================

// GET /api/clients/contacts/all - List all contacts
router.get('/contacts/all', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { search, page = 1, limit = 10 } = req.query;

    let query = `
      SELECT c.*, cl.name as client_name
      FROM contacts c
      JOIN clients cl ON c.client_id = cl.id
      WHERE c.is_active = 1
    `;

    const params: any[] = [];

    if (search) {
      query += ` AND (c.name LIKE ? OR c.email LIKE ? OR cl.name LIKE ?)`;
      const searchTerm = `%${search}%`;
      params.push(searchTerm, searchTerm, searchTerm);
    }

    query += ` ORDER BY c.name ASC`;

    // Pagination
    const limitNum2 = Math.max(1, Math.min(100, Number(limit) || 10));
    const offsetNum2 = Math.max(0, (Number(page) - 1) * limitNum2);
    query += ` LIMIT ${limitNum2} OFFSET ${offsetNum2}`;

    const contacts = await dbAll(query, params);

    // Get total count
    let countQuery = `
      SELECT COUNT(*) as total FROM contacts c
      JOIN clients cl ON c.client_id = cl.id
      WHERE c.is_active = 1
    `;
    const countParams: any[] = [];

    if (search) {
      countQuery += ` AND (c.name LIKE ? OR c.email LIKE ? OR cl.name LIKE ?)`;
      const searchTerm = `%${search}%`;
      countParams.push(searchTerm, searchTerm, searchTerm);
    }

    const countResult = await dbGet(countQuery, countParams);

    res.json({
      data: contacts,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total: countResult.total
      }
    });
  } catch (error) {
    console.error('Error fetching contacts:', error);
    res.status(500).json({ error: 'Failed to fetch contacts' });
  }
});

// POST /api/clients/:id/contacts - Create contact for client
router.post('/:id/contacts', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { name, job_title, email, phone, mobile, is_primary } = req.body;

    // If setting as primary, unset other primary contacts for this client
    if (is_primary) {
      await dbRun('UPDATE contacts SET is_primary = 0 WHERE client_id = ?', [req.params.id]);
    }

    const result = await dbRun(
      `INSERT INTO contacts (client_id, name, job_title, email, phone, mobile, is_primary) 
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [req.params.id, name || null, job_title || null, email || null, phone || null, mobile || null, is_primary ? 1 : 0]
    );

    // Update client's primary_contact_id if this is primary
    if (is_primary) {
      await dbRun('UPDATE clients SET primary_contact_id = ? WHERE id = ?', [result.insertId, req.params.id]);
    }

    res.status(201).json({ message: 'Contact created successfully', id: result.insertId });
  } catch (error) {
    console.error('Error creating contact:', error);
    res.status(500).json({ error: 'Failed to create contact' });
  }
});

// PUT /api/clients/contacts/:contactId - Update contact
router.put('/contacts/:contactId', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { name, job_title, email, phone, mobile, is_primary } = req.body;

    // Get contact's client_id
    const contact = await dbGet('SELECT client_id FROM contacts WHERE id = ?', [req.params.contactId]);

    if (!contact) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    // If setting as primary, unset other primary contacts for this client
    if (is_primary) {
      await dbRun('UPDATE contacts SET is_primary = 0 WHERE client_id = ? AND id != ?', [contact.client_id, req.params.contactId]);
    }

    await dbRun(
      `UPDATE contacts 
       SET name = ?, job_title = ?, email = ?, phone = ?, mobile = ?, is_primary = ?
       WHERE id = ?`,
      [name, job_title, email, phone, mobile, is_primary ? 1 : 0, req.params.contactId]
    );

    // Update client's primary_contact_id if this is primary
    if (is_primary) {
      await dbRun('UPDATE clients SET primary_contact_id = ? WHERE id = ?', [req.params.contactId, contact.client_id]);
    }

    res.json({ message: 'Contact updated successfully' });
  } catch (error) {
    console.error('Error updating contact:', error);
    res.status(500).json({ error: 'Failed to update contact' });
  }
});

// DELETE /api/clients/contacts/:contactId - Delete contact
router.delete('/contacts/:contactId', authMiddleware, async (req: Request, res: Response) => {
  try {
    await dbRun('UPDATE contacts SET is_active = 0 WHERE id = ?', [req.params.contactId]);
    res.json({ message: 'Contact deleted successfully' });
  } catch (error) {
    console.error('Error deleting contact:', error);
    res.status(500).json({ error: 'Failed to delete contact' });
  }
});

// ============================================
// SUPPORT ROUTES - Labels, Groups, Event Types
// ============================================

// GET /api/clients/labels - List all labels
router.get('/labels/all', authMiddleware, async (req: Request, res: Response) => {
  try {
    const labels = await dbAll('SELECT * FROM client_labels ORDER BY name ASC', []);
    res.json({ data: labels });
  } catch (error) {
    console.error('Error fetching labels:', error);
    res.status(500).json({ error: 'Failed to fetch labels' });
  }
});

// GET /api/clients/groups - List all groups
router.get('/groups/all', authMiddleware, async (req: Request, res: Response) => {
  try {
    const groups = await dbAll('SELECT * FROM client_groups ORDER BY name ASC', []);
    res.json({ data: groups });
  } catch (error) {
    console.error('Error fetching groups:', error);
    res.status(500).json({ error: 'Failed to fetch groups' });
  }
});

// GET /api/clients/event-types - List all event types
router.get('/event-types/all', authMiddleware, async (req: Request, res: Response) => {
  try {
    const eventTypes = await dbAll('SELECT * FROM event_types ORDER BY name ASC', []);
    res.json({ data: eventTypes });
  } catch (error) {
    console.error('Error fetching event types:', error);
    res.status(500).json({ error: 'Failed to fetch event types' });
  }
});

// ============================================
// CLIENT EVENTS ROUTES
// ============================================

// GET /api/clients/events/all - List all client events with visibility filtering
router.get('/events/all', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { page = 1, limit = 100 } = req.query;
    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);
    const userId = (req as any).userId;

    // Show: public events + own events + events shared to me
    const events = await dbAll(`
      SELECT ce.*, ce.start_time as event_time,
             et.name as event_type, et.color as event_color,
             c.name as client_name, c.code as client_code,
             cont.name as contact_name, cont.email as contact_email,
             u.full_name as created_by_name,
             ce.visibility
      FROM client_events ce
      LEFT JOIN event_types et ON ce.event_type_id = et.id
      LEFT JOIN clients c ON ce.client_id = c.id
      LEFT JOIN contacts cont ON ce.contact_id = cont.id
      LEFT JOIN users u ON ce.created_by = u.id
      WHERE (
        ce.visibility = 'public'
        OR ce.visibility IS NULL
        OR ce.created_by = ?
        OR EXISTS (SELECT 1 FROM event_shared_users esu WHERE esu.event_id = ce.id AND esu.user_id = ?)
      )
      ORDER BY ce.event_date DESC, ce.start_time DESC
      LIMIT ${Math.max(1, parseInt(limit as string) || 20)} OFFSET ${Math.max(0, skip)}
    `, [userId, userId]);

    // Attach shared users to each event
    for (const ev of events) {
      const sharedUsers = await dbAll(
        `SELECT esu.user_id, u.full_name, u.email FROM event_shared_users esu JOIN users u ON esu.user_id = u.id WHERE esu.event_id = ?`,
        [ev.id]
      );
      (ev as any).shared_users = sharedUsers;
    }

    const countResult = await dbGet(`
      SELECT COUNT(*) as total FROM client_events ce
      WHERE (ce.visibility = 'public' OR ce.visibility IS NULL OR ce.created_by = ?
        OR EXISTS (SELECT 1 FROM event_shared_users esu WHERE esu.event_id = ce.id AND esu.user_id = ?))
    `, [userId, userId]);
    const total = countResult?.total || 0;

    res.json({
      data: events,
      pagination: {
        page: parseInt(page as string),
        limit: parseInt(limit as string),
        total,
        pages: Math.ceil(total / parseInt(limit as string))
      }
    });
  } catch (error) {
    console.error('Error fetching events:', error);
    res.status(500).json({ error: 'Failed to fetch events' });
  }
});

// GET /api/clients/:client_id/events - List events for a specific client
router.get('/:client_id/events', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { client_id } = req.params;
    const { page = 1, limit = 50 } = req.query;
    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

    const events = await dbAll(`
      SELECT ce.*, ce.start_time as event_time,
             et.name as event_type, et.color as event_color,
             cont.name as contact_name, cont.email as contact_email
      FROM client_events ce
      LEFT JOIN event_types et ON ce.event_type_id = et.id
      LEFT JOIN contacts cont ON ce.contact_id = cont.id
      WHERE ce.client_id = ?
      ORDER BY ce.event_date DESC, ce.start_time DESC
      LIMIT ${Math.max(1, parseInt(limit as string) || 20)} OFFSET ${Math.max(0, skip)}
    `, [client_id]);

    const countResult = await dbGet('SELECT COUNT(*) as total FROM client_events WHERE client_id = ?', [client_id]);
    const total = countResult?.total || 0;

    res.json({
      data: events,
      pagination: {
        page: parseInt(page as string),
        limit: parseInt(limit as string),
        total,
        pages: Math.ceil(total / parseInt(limit as string))
      }
    });
  } catch (error) {
    console.error('Error fetching client events:', error);
    res.status(500).json({ error: 'Failed to fetch client events' });
  }
});

// POST /api/clients/events - Create a new event with visibility
router.post('/events', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { client_id, contact_id, event_type, event_date, event_time, title, description, visibility, shared_user_ids } = req.body;
    const userId = (req as any).userId;

    if (!event_type || !event_date || !title) {
      return res.status(400).json({ error: 'event_type, event_date, and title are required' });
    }

    // Look up event_type_id
    const typeResult = await dbGet('SELECT id FROM event_types WHERE name = ?', [event_type]);
    if (!typeResult) {
      return res.status(400).json({ error: `Invalid event type: ${event_type}` });
    }
    const event_type_id = typeResult.id;
    const final_event_time = event_time || new Date().toTimeString().split(' ')[0];
    const eventVisibility = visibility || 'public';

    const result = await dbRun(
      `INSERT INTO client_events (client_id, contact_id, event_type_id, event_date, start_time, title, description, created_by, visibility, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [client_id || null, contact_id || null, event_type_id, event_date, final_event_time, title, description || null, userId, eventVisibility]
    );

    // Insert shared users if visibility is 'shared'
    if (eventVisibility === 'shared' && Array.isArray(shared_user_ids) && shared_user_ids.length > 0) {
      // Get creator name for notification
      const creator = await dbGet('SELECT full_name FROM users WHERE id = ?', [userId]);
      const creatorName = creator?.full_name || 'Someone';
      
      for (const uid of shared_user_ids) {
        await dbRun('INSERT IGNORE INTO event_shared_users (event_id, user_id) VALUES (?, ?)', [result.insertId, uid]);
        // Send inbox notification
        try {
          await dbRun(
            `INSERT INTO inbox_notifications (user_id, type, title, message, link, ref_id, ref_type, created_by)
             VALUES (?, 'event_shared', ?, ?, '/project/events', ?, 'event', ?)`,
            [uid, `📅 ${title}`, `${creatorName} shared an event with you: "${title}" on ${event_date}`, result.insertId, userId]
          );
        } catch { /* table might not exist yet, ignore */ }
      }
    }

    const event = await dbGet('SELECT * FROM client_events WHERE id = ?', [result.insertId]);
    res.status(201).json({ data: event, message: 'Event created successfully' });
  } catch (error) {
    console.error('Error creating event:', error);
    res.status(500).json({ error: 'Failed to create event' });
  }
});

// POST /api/clients/:id/tickets - Create a new ticket
router.post('/:id/tickets', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { subject, description, priority, status, contact_id } = req.body;

    if (!subject) {
      return res.status(400).json({ error: 'Subject is required' });
    }

    const result = await dbRun(
      `INSERT INTO client_tickets (client_id, contact_id, subject, description, priority, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [req.params.id, contact_id || null, subject, description || '', priority || 'medium', status || 'open']
    );

    const ticket = await dbGet('SELECT * FROM client_tickets WHERE id = ?', [result.insertId]);
    res.status(201).json({ data: ticket, message: 'Ticket created successfully' });
  } catch (error) {
    console.error('Error creating ticket:', error);
    res.status(500).json({ error: 'Failed to create ticket' });
  }
});

// PUT /api/clients/events/:id - Update an event with visibility
router.put('/events/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { client_id, contact_id, event_type, event_date, event_time, title, description, visibility, shared_user_ids } = req.body;

    const event = await dbGet('SELECT * FROM client_events WHERE id = ?', [id]);
    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }

    const typeResult = await dbGet('SELECT id FROM event_types WHERE name = ?', [event_type]);
    if (!typeResult) {
      return res.status(400).json({ error: `Invalid event type: ${event_type}` });
    }
    const event_type_id = typeResult.id;
    const eventVisibility = visibility || event.visibility || 'public';

    await dbRun(
      `UPDATE client_events 
       SET client_id = ?, contact_id = ?, event_type_id = ?, event_date = ?, start_time = ?, title = ?, description = ?, visibility = ?
       WHERE id = ?`,
      [client_id || null, contact_id || null, event_type_id, event_date, event_time || '09:00', title, description || null, eventVisibility, id]
    );

    // Update shared users
    if (Array.isArray(shared_user_ids)) {
      await dbRun('DELETE FROM event_shared_users WHERE event_id = ?', [id]);
      if (eventVisibility === 'shared' && shared_user_ids.length > 0) {
        for (const uid of shared_user_ids) {
          await dbRun('INSERT IGNORE INTO event_shared_users (event_id, user_id) VALUES (?, ?)', [id, uid]);
        }
      }
    }

    const updatedEvent = await dbGet('SELECT * FROM client_events WHERE id = ?', [id]);
    res.json({ data: updatedEvent, message: 'Event updated successfully' });
  } catch (error) {
    console.error('Error updating event:', error);
    res.status(500).json({ error: 'Failed to update event' });
  }
});

// DELETE /api/clients/events/:id - Delete an event
router.delete('/events/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Verify event exists
    const event = await dbGet('SELECT * FROM client_events WHERE id = ?', [id]);
    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }

    await dbRun('DELETE FROM client_events WHERE id = ?', [id]);
    res.json({ message: 'Event deleted successfully' });
  } catch (error) {
    console.error('Error deleting event:', error);
    res.status(500).json({ error: 'Failed to delete event' });
  }
});


// Update Contact
router.put('/:id/contacts/:contactId', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { name, job_title, email, phone, mobile, is_primary } = req.body;
    await dbRun(
      `UPDATE contacts 
       SET name = ?, job_title = ?, email = ?, phone = ?, mobile = ?, is_primary = ?
       WHERE id = ? AND client_id = ?`,
      [name || null, job_title || null, email || null, phone || null, mobile || null, is_primary ? 1 : 0, req.params.contactId, req.params.id]
    );
    res.json({ message: 'Contact updated successfully' });
  } catch (error) {
    console.error('Error updating contact:', error);
    res.status(500).json({ error: 'Failed to update contact' });
  }
});

// Delete Contact
router.delete('/:id/contacts/:contactId', authMiddleware, async (req: Request, res: Response) => {
  try {
    await dbRun('DELETE FROM contacts WHERE id = ? AND client_id = ?', [req.params.contactId, req.params.id]);
    res.json({ message: 'Contact deleted successfully' });
  } catch (error) {
    console.error('Error deleting contact:', error);
    res.status(500).json({ error: 'Failed to delete contact' });
  }
});

// Create Invoice (Quick)
router.post('/:id/invoices', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { invoice_date, due_date, total_amount, notes } = req.body;
    const client_id = req.params.id;
    
    // Generate simple invoice number
    const dateStr = new Date().toISOString().slice(0,10).replace(/-/g, '');
    const rand = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    const invoice_number = `INV-${dateStr}-${rand}`;

    await dbRun(
      `INSERT INTO client_invoices (client_id, invoice_number, invoice_date, due_date, subtotal, total_amount, notes, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'draft', NOW())`,
      [client_id, invoice_number, invoice_date, due_date, total_amount, total_amount, notes] // Assuming subtotal = total for quick invoice
    );
    
    // Update client stats
    await dbRun(`UPDATE clients SET total_invoiced = total_invoiced + ? WHERE id = ?`, [total_amount, client_id]);

    res.json({ message: 'Invoice created successfully' });
  } catch (error) {
    console.error('Error creating invoice:', error);
    res.status(500).json({ error: 'Failed to create invoice' });
  }
});

// Create Quote/Estimate (Quick)
router.post('/:id/estimates', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { estimate_date, valid_until, total_amount, notes } = req.body;
    const client_id = req.params.id;
    
    const dateStr = new Date().toISOString().slice(0,10).replace(/-/g, '');
    const rand = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    const estimate_number = `EST-${dateStr}-${rand}`;

    await dbRun(
      `INSERT INTO client_estimates (client_id, estimate_number, estimate_date, valid_until, total_amount, notes, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'draft', NOW())`,
      [client_id, estimate_number, estimate_date, valid_until, total_amount, notes]
    );

    res.json({ message: 'Estimate created successfully' });
  } catch (error) {
    console.error('Error creating estimate:', error);
    res.status(500).json({ error: 'Failed to create estimate' });
  }
});

export default router;
