import { Router, Request, Response } from 'express';
import { dbAll, dbGet, dbRun } from '../config/database';
import { authMiddleware } from '../middleware/auth';
import multer from 'multer';
import path from 'path';
import fs from 'fs';

const router = Router();

// Multer setup for bid quotation file uploads
const bidUploadDir = path.join(__dirname, '../../uploads/bids');
if (!fs.existsSync(bidUploadDir)) {
  fs.mkdirSync(bidUploadDir, { recursive: true });
}
const bidStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, bidUploadDir),
  filename: (_req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'bid-' + uniqueSuffix + path.extname(file.originalname));
  }
});
const bidUpload = multer({ storage: bidStorage, limits: { fileSize: 10 * 1024 * 1024 } }); // 10MB max

// Multer setup for PR item attachment uploads
const prAttachDir = path.join(__dirname, '../../uploads/pr-attachments');
if (!fs.existsSync(prAttachDir)) {
  fs.mkdirSync(prAttachDir, { recursive: true });
}
const prAttachStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, prAttachDir),
  filename: (_req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'pr-item-' + uniqueSuffix + path.extname(file.originalname));
  }
});
const prAttachUpload = multer({ storage: prAttachStorage, limits: { fileSize: 10 * 1024 * 1024 } }); // 10MB max

const generateCode = (prefix: string) => {
  const now = new Date();
  const datePart = now.toISOString().slice(0, 10).replace(/-/g, '');
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `${prefix}-${datePart}-${rand}`;
};

const normalizeDateOnly = (value?: string | null | any): string | null => {
  if (!value) return null;
  // MySQL driver returns Date objects for DATE columns
  if (value instanceof Date) {
    return isNaN(value.getTime()) ? null : value.toISOString().slice(0, 10);
  }
  const str = String(value).trim();
  if (!str || str === 'null' || str === 'undefined') return null;
  // Already YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
  // ISO with time component
  if (str.includes('T')) return str.split('T')[0];
  // Any other format (e.g. JS Date.toString()) → parse via Date
  try {
    const d = new Date(str);
    if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  } catch { /* ignore */ }
  return null;
};

const addDays = (dateValue: string | null, days: number) => {
  const base = dateValue ? new Date(dateValue) : new Date();
  base.setDate(base.getDate() + days);
  return base.toISOString().slice(0, 10);
};

const deriveScheduleDueDate = (paymentTerm?: string, poDate?: string | null, expectedDate?: string | null) => {
  const baseDate = normalizeDateOnly(expectedDate) || normalizeDateOnly(poDate) || new Date().toISOString().slice(0, 10);
  const normalizedTerm = (paymentTerm || '').toLowerCase();

  if (normalizedTerm.includes('net 60')) return addDays(baseDate, 60);
  if (normalizedTerm.includes('net 45') || normalizedTerm.includes('1.5 month')) return addDays(baseDate, 45);
  if (normalizedTerm.includes('net 30')) return addDays(baseDate, 30);
  if (normalizedTerm.includes('cod') || normalizedTerm.includes('cash')) return baseDate;
  return baseDate;
};

const safeJsonParse = (value: any) => {
  if (!value || typeof value !== 'string') return {};
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
};

const parsePOFinancials = (notes: any, items: any[], discountPercent: number, ppnPercent: number) => {
  const noteData = safeJsonParse(notes);
  const subTotal = Number(
    noteData.sub_total ?? items.reduce((sum, item) => sum + (Number(item.quantity || 0) * Number(item.unit_price || 0)), 0)
  );
  const discountAmount = Number(
    noteData.discount_amount ?? (subTotal * Number(discountPercent || 0)) / 100
  );
  const ppnAmount = Number(
    noteData.ppn_amount ?? ((subTotal - discountAmount) * Number(ppnPercent || 0)) / 100
  );
  const contractTotal = Number(noteData.contract_total ?? (subTotal - discountAmount + ppnAmount));
  return { noteData, subTotal, discountAmount, ppnAmount, contractTotal };
};

const buildDefaultPaymentSchedules = (params: {
  poDate?: string | null;
  expectedDate?: string | null;
  paymentTerm?: string;
  advancePayment?: number;
  contractTotal: number;
}) => {
  const contractTotal = Number(params.contractTotal || 0);
  const advanceRaw = Math.max(Number(params.advancePayment || 0), 0);
  // Treat advance as 0 if it's < 1% of contract total (rounding / accidental entry)
  const advancePayment = advanceRaw >= contractTotal * 0.01 ? advanceRaw : 0;
  const paymentTerm = (params.paymentTerm || '').toLowerCase();
  const defaultDueDate = deriveScheduleDueDate(params.paymentTerm, params.poDate || null, params.expectedDate || null);
  const poDate = normalizeDateOnly(params.poDate || '') || new Date().toISOString().slice(0, 10);

  if (contractTotal <= 0) return [];

  // Cash or no meaningful advance → single Full Payment
  const isCash = paymentTerm === 'cash' || paymentTerm === 'tunai';
  if (isCash || advancePayment <= 0) {
    return [
      {
        schedule_no: 1,
        label: 'Full Payment',
        trigger_type: isCash ? 'po_approved' : 'goods_received',
        percentage: 100,
        amount: Number(contractTotal.toFixed(2)),
        due_date: isCash ? poDate : defaultDueDate,
        notes: 'Auto-generated from PO payment term',
      },
    ];
  }

  // 100% advance → single Full Advance Payment
  if (advancePayment >= contractTotal && advancePayment > 0) {
    return [
      {
        schedule_no: 1,
        label: 'Full Advance Payment',
        trigger_type: 'po_approved',
        percentage: 100,
        amount: Number(contractTotal.toFixed(2)),
        due_date: poDate,
        notes: 'Auto-generated: 100% advance payment',
      },
    ];
  }

  // Partial advance + final payment
  if (advancePayment > 0 && advancePayment < contractTotal) {
    return [
      {
        schedule_no: 1,
        label: 'Down Payment',
        trigger_type: 'po_approved',
        percentage: Number(((advancePayment / contractTotal) * 100).toFixed(2)),
        amount: advancePayment,
        due_date: poDate,
        notes: 'Auto-generated from PO advance payment',
      },
      {
        schedule_no: 2,
        label: 'Final Payment',
        trigger_type: 'goods_received',
        percentage: Number((((contractTotal - advancePayment) / contractTotal) * 100).toFixed(2)),
        amount: Number((contractTotal - advancePayment).toFixed(2)),
        due_date: defaultDueDate,
        notes: 'Auto-generated from PO payment term',
      },
    ];
  }

  return [
    {
      schedule_no: 1,
      label: 'Full Payment',
      trigger_type: 'goods_received',
      percentage: 100,
      amount: Number(contractTotal.toFixed(2)),
      due_date: defaultDueDate,
      notes: 'Auto-generated from PO payment term',
    },
  ];
};


const normalizePaymentSchedules = (paymentSchedules: any[], defaults: any[]) => {
  if (!Array.isArray(paymentSchedules) || paymentSchedules.length === 0) return defaults;
  return paymentSchedules
    .map((schedule, index) => ({
      schedule_no: Number(schedule.schedule_no || index + 1),
      label: String(schedule.label || `Payment ${index + 1}`),
      trigger_type: String(schedule.trigger_type || 'manual'),
      percentage: Number(schedule.percentage || 0),
      amount: Number(schedule.amount || 0),
      due_date: normalizeDateOnly(schedule.due_date || '') || null,
      notes: schedule.notes || null,
    }))
    .filter(schedule => schedule.amount > 0);
};

const syncScheduleAPStatus = async (scheduleId: number, apId: number) => {
  const ap = await dbGet('SELECT amount, paid_amount, status FROM accounts_payable WHERE id = ?', [apId]) as any;
  if (!ap) return;
  await dbRun(
    'UPDATE purchase_order_payment_schedules SET paid_amount = ?, status = ?, ap_id = ? WHERE id = ?',
    [Number(ap.paid_amount || 0), ap.status || 'open', apId, scheduleId]
  );
};

const upsertPaymentSchedules = async (params: {
  poId: number;
  poData: any;
  items: any[];
  paymentSchedules?: any[];
}) => {
  const { poId, poData, items, paymentSchedules } = params;
  const vendorId = Number(poData.vendor_id || 0) || null;
  const { contractTotal } = parsePOFinancials(
    poData.notes,
    items,
    Number(poData.discount_percent || 0),
    Number(poData.ppn_percent || 0)
  );

  const advancePercent = Number(poData.advance_payment || 0); // stored as % (0-100)
  const advanceNominal = advancePercent > 0 ? (advancePercent / 100) * contractTotal : 0;

  const defaults = buildDefaultPaymentSchedules({
    poDate: poData.po_date,
    expectedDate: poData.expected_date,
    paymentTerm: poData.payment_term,
    advancePayment: advanceNominal,  // pass as nominal amount
    contractTotal,
  });
  // ALWAYS use backend-computed defaults — frontend payment_schedules can be stale due to browser/SW caching
  const schedules = defaults;
  const existingSchedules = await dbAll('SELECT * FROM purchase_order_payment_schedules WHERE po_id = ? ORDER BY schedule_no ASC', [poId]);
  const existingByNo = new Map(existingSchedules.map(schedule => [Number(schedule.schedule_no), schedule]));
  const usedScheduleNos = new Set<number>();

  for (const schedule of schedules) {
    usedScheduleNos.add(Number(schedule.schedule_no));
    const existing = existingByNo.get(Number(schedule.schedule_no)) as any;
    if (existing) {
      await dbRun(
        `UPDATE purchase_order_payment_schedules
         SET label = ?, trigger_type = ?, percentage = ?, amount = ?, due_date = ?, notes = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [
          schedule.label,
          schedule.trigger_type,
          Number(schedule.percentage || 0),
          Number(schedule.amount || 0),
          schedule.due_date,
          schedule.notes,
          existing.id,
        ]
      );

      if (existing.ap_id) {
        const ap = await dbGet('SELECT id, paid_amount FROM accounts_payable WHERE id = ?', [existing.ap_id]) as any;
        if (ap) {
          const nextStatus = Number(ap.paid_amount || 0) >= Number(schedule.amount || 0)
            ? 'paid'
            : Number(ap.paid_amount || 0) > 0
              ? 'partial'
              : 'open';
          await dbRun(
            'UPDATE accounts_payable SET due_date = ?, amount = ?, status = ?, po_id = ? WHERE id = ?',
            [schedule.due_date, Number(schedule.amount || 0), nextStatus, poId, existing.ap_id]
          );
          await syncScheduleAPStatus(existing.id, existing.ap_id);
        }
      } else {
        const apResult = await dbRun(
          `INSERT INTO accounts_payable (po_id, vendor_id, po_schedule_id, invoice_number, invoice_date, due_date, amount, paid_amount, status, notes)
           VALUES (?, ?, ?, ?, ?, ?, ?, 0, 'open', ?)`,
          [poId, vendorId || null, existing.id, null, null, schedule.due_date || new Date().toISOString().slice(0,10), Number(schedule.amount || 0), schedule.notes || `Auto-generated from PO schedule ${schedule.label}`]
        );
        await dbRun('UPDATE purchase_order_payment_schedules SET ap_id = ? WHERE id = ?', [apResult.insertId, existing.id]);
        await syncScheduleAPStatus(existing.id, apResult.insertId);
      }
      continue;
    }

    const scheduleResult = await dbRun(
      `INSERT INTO purchase_order_payment_schedules (po_id, schedule_no, label, trigger_type, percentage, amount, due_date, status, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'open', ?)`,
      [
        poId,
        Number(schedule.schedule_no),
        schedule.label,
        schedule.trigger_type,
        Number(schedule.percentage || 0),
        Number(schedule.amount || 0),
        schedule.due_date || new Date().toISOString().slice(0,10),
        schedule.notes,
      ]
    );
    const apResult = await dbRun(
      `INSERT INTO accounts_payable (po_id, vendor_id, po_schedule_id, invoice_number, invoice_date, due_date, amount, paid_amount, status, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0, 'open', ?)`,
      [poId, vendorId || null, scheduleResult.insertId, null, null, schedule.due_date || new Date().toISOString().slice(0,10), Number(schedule.amount || 0), schedule.notes || `Auto-generated from PO schedule ${schedule.label}`]
    );
    await dbRun('UPDATE purchase_order_payment_schedules SET ap_id = ? WHERE id = ?', [apResult.insertId, scheduleResult.insertId]);
    await syncScheduleAPStatus(scheduleResult.insertId, apResult.insertId);
  }

  for (const existing of existingSchedules as any[]) {
    if (usedScheduleNos.has(Number(existing.schedule_no))) continue;
    if (existing.ap_id) {
      const ap = await dbGet('SELECT paid_amount FROM accounts_payable WHERE id = ?', [existing.ap_id]) as any;
      if (ap && Number(ap.paid_amount || 0) > 0) {
        throw new Error(`Cannot remove payment schedule ${existing.label}: linked AP already has payments`);
      }
      await dbRun('DELETE FROM accounts_payable WHERE id = ?', [existing.ap_id]);
    }
    await dbRun('DELETE FROM purchase_order_payment_schedules WHERE id = ?', [existing.id]);
  }
};

// Vendors CRUD
router.get('/vendors', authMiddleware, async (req: Request, res: Response) => {
  try {
    const vendors = await dbAll(
      `SELECT *
       FROM vendors
       WHERE COALESCE(is_active, 1) = 1
         AND TRIM(COALESCE(name, '')) <> ''
         AND TRIM(COALESCE(name, '')) <> '-'
       ORDER BY name ASC`,
      []
    );
    res.json({ data: vendors });
  } catch (error) {
    console.error('Error fetching vendors:', error);
    res.status(500).json({ error: 'Failed to fetch vendors' });
  }
});

// GET /vendors/next-code/:category - auto-generate next vendor code for a category
// IMPORTANT: Must be before /vendors/:id to avoid Express matching "next-code" as :id
router.get('/vendors/next-code/:category', authMiddleware, async (req: Request, res: Response) => {
  try {
    const category = req.params.category as string;
    // Map category to prefix
    const prefixMap: Record<string, string> = {
      'Raw Material': 'RM',
      'Chemical': 'CHM',
      'Packaging': 'PKG',
      'Equipment': 'EQP',
      'Spare Parts': 'SPR',
      'Services': 'SVC',
      'Other': 'OTH',
    };
    const prefix = prefixMap[category] || 'VND';
    
    // Find highest existing code with this prefix
    const pattern = `${prefix}-%`;
    const lastVendor = await dbGet(
      'SELECT code FROM vendors WHERE code LIKE ? ORDER BY code DESC LIMIT 1',
      [pattern]
    ) as any;
    
    let nextNum = 1;
    if (lastVendor?.code) {
      const parts = lastVendor.code.split('-');
      const lastNum = parseInt(parts[parts.length - 1], 10);
      if (!isNaN(lastNum)) nextNum = lastNum + 1;
    }
    
    const nextCode = `${prefix}-${String(nextNum).padStart(4, '0')}`;
    res.json({ code: nextCode, prefix });
  } catch (error) {
    console.error('Error generating vendor code:', error);
    res.status(500).json({ error: 'Failed to generate code' });
  }
});

router.get('/vendors/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const vendor = await dbGet('SELECT * FROM vendors WHERE id = ?', [req.params.id]);
    if (!vendor) return res.status(404).json({ error: 'Vendor not found' });
    res.json({ data: vendor });
  } catch (error) {
    console.error('Error fetching vendor:', error);
    res.status(500).json({ error: 'Failed to fetch vendor' });
  }
});

router.post('/vendors', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { code, name, contact_person, contact, phone, email, address, city, country, payment_terms, supply_category } = req.body;
    if (!name) return res.status(400).json({ error: 'name is required' });

    // Auto-generate code if not provided
    let finalCode = code;
    if (!finalCode && supply_category) {
      const prefixMap: Record<string, string> = {
        'Raw Material': 'RM', 'Chemical': 'CHM', 'Packaging': 'PKG',
        'Equipment': 'EQP', 'Spare Parts': 'SPR', 'Services': 'SVC', 'Other': 'OTH',
      };
      const prefix = prefixMap[supply_category] || 'VND';
      const lastVendor = await dbGet('SELECT code FROM vendors WHERE code LIKE ? ORDER BY code DESC LIMIT 1', [`${prefix}-%`]) as any;
      let nextNum = 1;
      if (lastVendor?.code) {
        const parts = lastVendor.code.split('-');
        const lastNum = parseInt(parts[parts.length - 1], 10);
        if (!isNaN(lastNum)) nextNum = lastNum + 1;
      }
      finalCode = `${prefix}-${String(nextNum).padStart(4, '0')}`;
    }
    if (!finalCode) return res.status(400).json({ error: 'code is required (select a category to auto-generate)' });

    const contactValue = contact_person || contact || null;
    const result = await dbRun(
      'INSERT INTO vendors (code, name, supply_category, contact_person, phone, email, address, city, country, payment_terms) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [finalCode, name, supply_category || null, contactValue, phone || null, email || null, address || null, city || null, country || null, payment_terms || null]
    );

    res.status(201).json({ message: 'Vendor created', data: { id: result.insertId, code: finalCode, name } });
  } catch (error: any) {
    console.error('Error creating vendor:', error);
    if (error.message?.includes('Duplicate entry')) return res.status(400).json({ error: 'Vendor code must be unique' });
    res.status(500).json({ error: 'Failed to create vendor' });
  }
});

router.put('/vendors/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { code, name, contact_person, contact, phone, email, address, city, country, payment_terms, supply_category, is_active } = req.body;
    const contactValue = contact_person || contact || null;
    const activeVal = is_active !== undefined ? (is_active ? 1 : 0) : 1;
    await dbRun(
      'UPDATE vendors SET code = ?, name = ?, supply_category = ?, contact_person = ?, phone = ?, email = ?, address = ?, city = ?, country = ?, payment_terms = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [code, name, supply_category || null, contactValue, phone || null, email || null, address || null, city || null, country || null, payment_terms || null, activeVal, req.params.id]
    );
    res.json({ message: 'Vendor updated' });
  } catch (error) {
    console.error('Error updating vendor:', error);
    res.status(500).json({ error: 'Failed to update vendor' });
  }
});

router.delete('/vendors/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    // Try hard delete first
    await dbRun('DELETE FROM vendors WHERE id = ?', [req.params.id]);
    res.json({ message: 'Vendor deleted' });
  } catch (error: any) {
    // If FK constraint, soft-delete instead
    if (error.errno === 1451 || error.sqlMessage?.includes('foreign key constraint')) {
      try {
        await dbRun('UPDATE vendors SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [req.params.id]);
        res.json({ message: 'Vendor deactivated (has related data)' });
      } catch (e2) {
        console.error('Error soft-deleting vendor:', e2);
        res.status(500).json({ error: 'Failed to delete vendor' });
      }
    } else {
      console.error('Error deleting vendor:', error);
      res.status(500).json({ error: 'Failed to delete vendor' });
    }
  }
});

// Purchase Requests
router.get('/purchase-requests', authMiddleware, async (req: Request, res: Response) => {
  try {
    const prs = await dbAll(
      `SELECT pr.*, u.full_name as requester_name,
          pr.requestor_id as requester_id,
          COALESCE(pr.request_date, DATE(pr.created_at)) as request_date,
          pr.needed_by,
          cp.project_name, cp.project_number
       FROM purchase_requests pr
       LEFT JOIN users u ON pr.requestor_id = u.id
       LEFT JOIN client_projects cp ON pr.project_id = cp.id
       ORDER BY pr.created_at DESC`,
      []
    );
    res.json({ data: prs });
  } catch (error) {
    console.error('Error fetching purchase requests:', error);
    res.status(500).json({ error: 'Failed to fetch purchase requests' });
  }
});

router.get('/purchase-requests/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const pr = await dbGet(
      `SELECT pr.*, u.full_name as requester_name,
              pr.requestor_id as requester_id,
              COALESCE(pr.request_date, DATE(pr.created_at)) as request_date,
              pr.needed_by,
              cp.project_name, cp.project_number
       FROM purchase_requests pr
       LEFT JOIN users u ON pr.requestor_id = u.id
       LEFT JOIN client_projects cp ON pr.project_id = cp.id
       WHERE pr.id = ?`,
      [req.params.id]
    );
    if (!pr) return res.status(404).json({ error: 'Purchase request not found' });
    res.json({ data: pr });
  } catch (error) {
    console.error('Error fetching purchase request:', error);
    res.status(500).json({ error: 'Failed to fetch purchase request' });
  }
});

router.post('/purchase-requests', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { pr_number, requester_id, status, notes, department, request_date, needed_by, reason, project_id } = req.body;
    const number = pr_number || generateCode('PR');
    const userIdFromToken = (req as any).user?.userId;

    // Determine requester - prefer explicit ID from body, fallback to token
    let requestor = requester_id || userIdFromToken || null;

    // Validate that requester exists in database before using
    let validRequestor = null;
    if (requestor) {
      try {
        const userExists = await dbGet('SELECT id FROM users WHERE id = ?', [requestor]);
        if (userExists) {
          validRequestor = parseInt(String(requestor), 10);
          console.log('✅ Requester user exists:', validRequestor);
        } else {
          console.log('⚠️  Requester user', requestor, 'not found, will set requestor_id to NULL');
          validRequestor = null;
        }
      } catch (userCheckError) {
        console.log('⚠️  Error checking requester existence:', userCheckError);
        validRequestor = null;
      }
    }

    console.log('Creating PR - requested by:', userIdFromToken, 'valid requestor:', validRequestor);

    const result = await dbRun(
      `INSERT INTO purchase_requests (pr_number, requestor_id, project_id, status, notes, reason, request_date, needed_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        number,
        validRequestor,
        project_id || null,
        (status || 'DRAFT').toUpperCase(),
        notes || null,
        reason || null,
        normalizeDateOnly(request_date) || new Date().toISOString().slice(0, 10),
        normalizeDateOnly(needed_by) || null,
      ]
    );
    res.status(201).json({ message: 'Purchase request created', data: { id: result.insertId, pr_number: number } });
  } catch (error: any) {
    console.error('Error creating purchase request:', error);
    if (error.message?.includes('UNIQUE')) return res.status(400).json({ error: 'PR number must be unique' });
    if (error.message?.includes('FOREIGN KEY')) return res.status(400).json({ error: 'Invalid requester_id - user not found' });
    res.status(500).json({ error: 'Failed to create purchase request' });
  }
});

router.put('/purchase-requests/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { status, notes, department, request_date, needed_by, reason, project_id, vendor_comparisons, selected_vendor_id } = req.body;
    await dbRun(
      'UPDATE purchase_requests SET status = ?, notes = ?, reason = ?, project_id = ?, request_date = ?, needed_by = ?, vendor_comparisons = ?, selected_vendor_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [(status || 'DRAFT').toUpperCase(), notes || null, reason || null, project_id || null, normalizeDateOnly(request_date) || null, normalizeDateOnly(needed_by) || null, vendor_comparisons ? JSON.stringify(vendor_comparisons) : null, selected_vendor_id || null, req.params.id]
    );
    res.json({ message: 'Purchase request updated' });
  } catch (error) {
    console.error('Error updating purchase request:', error);
    res.status(500).json({ error: 'Failed to update purchase request' });
  }
});

// Approve / Reject Purchase Requests
router.delete('/purchase-requests/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Get PR detail
    const pr = await dbGet(`SELECT * FROM purchase_requests WHERE id = ?`, [id]) as any;
    if (!pr) return res.status(404).json({ error: 'PR not found' });

    // Check if any PO still references this PR
    const linkedPO = await dbGet(
      'SELECT id, po_number FROM purchase_orders WHERE pr_id = ? LIMIT 1',
      [id]
    ) as any;

    if (linkedPO) {
      return res.status(400).json({ 
        error: `Tidak dapat menghapus PR ini karena masih terikat dengan PO ${linkedPO.po_number || linkedPO.id}. Hapus PO tersebut terlebih dahulu.` 
      });
    }

    // Safe cleanup helper
    const safeCleanup = async (sql: string, params: any[], label: string) => {
      try { await dbRun(sql, params); } catch (e: any) {
        console.warn(`Warning cleaning ${label}:`, e.message?.substring(0, 120));
      }
    };

    // 1. Delete bid items for all bids of this PR
    await safeCleanup(
      'DELETE FROM pr_bid_items WHERE bid_id IN (SELECT id FROM pr_bids WHERE pr_id = ?)', 
      [id], 'pr_bid_items'
    );

    // 2. Delete bids (including winner) for this PR
    await safeCleanup('DELETE FROM pr_bids WHERE pr_id = ?', [id], 'pr_bids');

    // 3. Delete the PR items
    await safeCleanup('DELETE FROM purchase_request_items WHERE purchase_request_id = ?', [id], 'pr_items');

    // 4. Delete the PR itself
    await dbRun(`DELETE FROM purchase_requests WHERE id = ?`, [id]);
    
    res.json({ message: 'Purchase request deleted successfully' });
  } catch (error: any) {
    console.error('Error deleting purchase request:', error);
    if (error.code === 'ER_ROW_IS_REFERENCED_2' || error.errno === 1451) {
      return res.status(400).json({ error: 'Tidak dapat menghapus PR ini karena masih digunakan di modul lain.' });
    }
    res.status(500).json({ error: 'Failed to delete purchase request: ' + (error.message || 'Unknown error') });
  }
});

router.post('/purchase-requests/:id/approve', authMiddleware, async (req: Request, res: Response) => {
  try {
    const prId = req.params.id;
    const userId = (req as any).user?.userId;
    const userLevel = (req as any).user?.userLevel || 1;

    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const pr = await dbGet('SELECT approval_status FROM purchase_requests WHERE id = ?', [prId]) as any;
    if (!pr) return res.status(404).json({ error: 'Purchase request not found' });

    const currentStatus = pr.approval_status || 0;
    const approverRow = await dbGet('SELECT id FROM users WHERE id = ?', [userId]) as { id: number } | undefined;
    const approverId = approverRow ? userId : null;

    // Director / Master (>=4): direct full approval
    if (userLevel >= 4 && currentStatus < 2) {
      await dbRun(
        'UPDATE purchase_requests SET approval_status = 2, approved_by_supervisor_id = ?, approved_by_manager_id = ?, approved_at_supervisor = CURRENT_TIMESTAMP, approved_at_manager = CURRENT_TIMESTAMP WHERE id = ?',
        [approverId, approverId, prId]
      );
      return res.json({ message: 'PR fully approved (DIRECT)', approval_status: 2 });
    }

    // Supervisor (2): 0 -> 1
    if (userLevel === 2 && currentStatus === 0) {
      await dbRun(
        'UPDATE purchase_requests SET approval_status = 1, approved_by_supervisor_id = ?, approved_at_supervisor = CURRENT_TIMESTAMP WHERE id = ?',
        [approverId, prId]
      );
      return res.json({ message: 'PR approved by supervisor (1/2)', approval_status: 1 });
    }

    // Manager (3): 1 -> 2
    if (userLevel === 3 && currentStatus === 1) {
      await dbRun(
        'UPDATE purchase_requests SET approval_status = 2, approved_by_manager_id = ?, approved_at_manager = CURRENT_TIMESTAMP WHERE id = ?',
        [approverId, prId]
      );
      return res.json({ message: 'PR approved by manager (2/2)', approval_status: 2 });
    }

    return res.status(400).json({
      error: 'Cannot approve: insufficient level or invalid status',
      debug: { userLevel, currentStatus, needLevel: currentStatus === 0 ? 2 : 3 }
    });
  } catch (error) {
    console.error('Error approving PR:', error);
    res.status(500).json({ error: 'Failed to approve purchase request' });
  }
});

router.post('/purchase-requests/:id/reject', authMiddleware, async (req: Request, res: Response) => {
  try {
    const prId = req.params.id;
    const userId = (req as any).user?.userId;
    const userLevel = (req as any).user?.userLevel || 1;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    // Only level 2+ can reject back to pending
    if (userLevel >= 2) {
      await dbRun(
        'UPDATE purchase_requests SET approval_status = 0, approved_by_supervisor_id = NULL, approved_by_manager_id = NULL, approved_at_supervisor = NULL, approved_at_manager = NULL WHERE id = ?',
        [prId]
      );
      return res.json({ message: 'PR rejected and reset to pending', approval_status: 0 });
    }

    return res.status(400).json({ error: 'Cannot reject: insufficient level' });
  } catch (error) {
    console.error('Error rejecting PR:', error);
    res.status(500).json({ error: 'Failed to reject purchase request' });
  }
});

// ========== PR Bid Tabulation ==========

// GET /purchase-requests/:prId/bids - list all bids for a PR with their items
router.get('/purchase-requests/:prId/bids', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { prId } = req.params;
    const bids = await dbAll(
      `SELECT pb.*, v.name as registered_vendor_name
       FROM pr_bids pb
       LEFT JOIN vendors v ON pb.vendor_id = v.id
       WHERE pb.pr_id = ?
       ORDER BY pb.created_at ASC`,
      [prId]
    );

    // For each bid, load its items
    for (const bid of bids as any[]) {
      bid.items = await dbAll(
        'SELECT * FROM pr_bid_items WHERE bid_id = ? ORDER BY item_index ASC',
        [bid.id]
      );
    }

    res.json({ data: bids });
  } catch (error) {
    console.error('Error fetching PR bids:', error);
    res.status(500).json({ error: 'Failed to fetch bids' });
  }
});

// POST /purchase-requests/:prId/bids - create a new bid (vendor) and auto-generate item rows from PR items
router.post('/purchase-requests/:prId/bids', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { prId } = req.params;
    const { vendor_id, vendor_name, contact_person, phone, email, bid_date, delivery_time_days, notes, selected_items } = req.body;

    // Get PR to parse its items
    const pr = await dbGet('SELECT * FROM purchase_requests WHERE id = ?', [prId]) as any;
    if (!pr) return res.status(404).json({ error: 'PR not found' });

    const finalVendorName = vendor_name || '';
    if (vendor_id && !vendor_name) {
      const vendor = await dbGet('SELECT name FROM vendors WHERE id = ?', [vendor_id]) as any;
      if (vendor) (req.body as any).vendor_name = vendor.name;
    }

    const bidResult = await dbRun(
      `INSERT INTO pr_bids (pr_id, vendor_id, vendor_name, contact_person, phone, email, bid_date, delivery_time_days, notes, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')`,
      [prId, vendor_id || null, vendor_id ? ((req.body as any).vendor_name || finalVendorName) : finalVendorName, contact_person || null, phone || null, email || null, bid_date || null, delivery_time_days || null, notes || null]
    );
    const bidId = bidResult.insertId;

    // Parse PR notes to get items
    let prItems: any[] = [];
    try {
      const notesData = JSON.parse(pr.notes || '{}');
      prItems = notesData.items || [];
    } catch (e) { /* ignore parse error */ }

    // If vendor_id provided, load vendor prices for matching products
    let vendorPriceMap: Record<number, any> = {};
    if (vendor_id) {
      try {
        const vprices = await dbAll(
          `SELECT product_id, price, lead_time_days FROM vendor_prices 
           WHERE vendor_id = ? AND (valid_until IS NULL OR valid_until >= CURDATE())
           ORDER BY effective_date DESC`,
          [vendor_id]
        ) as any[];
        // Map by product_id (first match = latest effective_date)
        for (const vp of vprices) {
          if (!vendorPriceMap[vp.product_id]) {
            vendorPriceMap[vp.product_id] = vp;
          }
        }
      } catch (e) { /* ignore - table might not have data yet */ }
    }

    // Create bid_items rows for each PR item (filter by selected_items if provided)
    let grandTotal = 0;
    const selectedSet = Array.isArray(selected_items) ? new Set(selected_items.map(Number)) : null;
    for (let i = 0; i < prItems.length; i++) {
      // Skip items not in selected_items (if filter provided)
      if (selectedSet && !selectedSet.has(i)) continue;
      const item = prItems[i];
      const qty = Number(item.qty || 0);
      const productId = item.productId || null;
      const matchedPrice = productId ? vendorPriceMap[productId] : null;
      const refPrice = matchedPrice ? Number(matchedPrice.price || 0) : 0;
      const unitPrice = refPrice; // actual starts equal to ref
      const lineTotal = unitPrice * qty;
      const priceSource = matchedPrice ? 'vendor_price_list' : 'manual';
      grandTotal += lineTotal;
      await dbRun(
        `INSERT INTO pr_bid_items (bid_id, item_index, item_name, quantity, uom, unit_price, ref_price, price_source, total_price, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [bidId, i, item.productName || item.name || '', qty, item.uom || '', unitPrice, refPrice, priceSource, lineTotal,
         matchedPrice ? 'Auto-filled from Vendor Price List' : null]
      );
    }

    // Update bid total_amount
    if (grandTotal > 0) {
      await dbRun('UPDATE pr_bids SET total_amount = ? WHERE id = ?', [grandTotal, bidId]);
    }

    // Load newly created bid with items
    const newBid = await dbGet('SELECT * FROM pr_bids WHERE id = ?', [bidId]) as any;
    if (newBid) {
      newBid.items = await dbAll('SELECT * FROM pr_bid_items WHERE bid_id = ? ORDER BY item_index ASC', [bidId]);
    }

    res.status(201).json({ message: 'Bid created', data: newBid });
  } catch (error) {
    console.error('Error creating PR bid:', error);
    res.status(500).json({ error: 'Failed to create bid' });
  }
});

// PUT /purchase-requests/:prId/bids/:bidId - update bid header + all item prices
router.put('/purchase-requests/:prId/bids/:bidId', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { bidId } = req.params;
    const { vendor_name, contact_person, phone, email, bid_date, delivery_time_days, notes, items } = req.body;

    // Only update bid header if header fields are explicitly provided
    if (vendor_name !== undefined) {
      await dbRun(
        `UPDATE pr_bids SET vendor_name = COALESCE(?, vendor_name), contact_person = ?, phone = ?, email = ?, 
         bid_date = ?, delivery_time_days = ?, notes = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [vendor_name || null, contact_person || null, phone || null, email || null, bid_date || null, delivery_time_days || null, notes || null, bidId]
      );
    }

    // Update each item's unit_price and recalculate total
    let grandTotal = 0;
    if (Array.isArray(items)) {
      for (const item of items) {
        const unitPrice = Number(item.unit_price || 0);
        const qty = Number(item.quantity || 0);
        const lineTotal = unitPrice * qty;
        grandTotal += lineTotal;
        await dbRun(
          'UPDATE pr_bid_items SET unit_price = ?, total_price = ?, notes = ? WHERE id = ?',
          [unitPrice, lineTotal, item.notes || null, item.id]
        );
      }
    }

    // Update bid total_amount
    await dbRun('UPDATE pr_bids SET total_amount = ? WHERE id = ?', [grandTotal, bidId]);

    res.json({ message: 'Bid updated', total_amount: grandTotal });
  } catch (error) {
    console.error('Error updating PR bid:', error);
    res.status(500).json({ error: 'Failed to update bid' });
  }
});

// POST /purchase-requests/:prId/bids/:bidId/select - mark bid as selected (winner)
router.post('/purchase-requests/:prId/bids/:bidId/select', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { prId, bidId } = req.params;

    // Reset all bids for this PR to active
    await dbRun("UPDATE pr_bids SET status = 'active' WHERE pr_id = ?", [prId]);
    // Mark this one as selected
    await dbRun("UPDATE pr_bids SET status = 'selected' WHERE id = ? AND pr_id = ?", [bidId, prId]);

    // Update PR selected_vendor_id from the winning bid
    const bid = await dbGet('SELECT vendor_id FROM pr_bids WHERE id = ?', [bidId]) as any;
    if (bid?.vendor_id) {
      await dbRun('UPDATE purchase_requests SET selected_vendor_id = ? WHERE id = ?', [bid.vendor_id, prId]);
    }

    res.json({ message: 'Bid selected as winner' });
  } catch (error) {
    console.error('Error selecting bid:', error);
    res.status(500).json({ error: 'Failed to select bid' });
  }
});

// POST /purchase-requests/:prId/bids/:bidId/select-item/:itemIndex - select winner per item
router.post('/purchase-requests/:prId/bids/:bidId/select-item/:itemIndex', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { prId, bidId } = req.params;
    const itemIndex = req.params.itemIndex as string;
    const idx = parseInt(itemIndex);

    // Get all bid IDs for this PR
    const allBids = await dbAll('SELECT id FROM pr_bids WHERE pr_id = ?', [prId]) as any[];
    const allBidIds = allBids.map((b: any) => b.id);

    if (allBidIds.length === 0) return res.status(404).json({ error: 'No bids found' });

    // Reset is_winner for this item_index across ALL bids
    await dbRun(
      `UPDATE pr_bid_items SET is_winner = 0 WHERE item_index = ? AND bid_id IN (${allBidIds.map(() => '?').join(',')})`,
      [idx, ...allBidIds]
    );

    // Set is_winner = 1 for this specific bid + item_index
    await dbRun(
      'UPDATE pr_bid_items SET is_winner = 1 WHERE bid_id = ? AND item_index = ?',
      [bidId, idx]
    );

    // Auto-determine overall bid winner: vendor with the most winning items
    // Reset all bids to active first
    await dbRun("UPDATE pr_bids SET status = 'active' WHERE pr_id = ?", [prId]);

    // Find vendor with most item winners
    const winnerStats = await dbAll(
      `SELECT b.id as bid_id, b.vendor_id, COUNT(bi.id) as wins
       FROM pr_bids b
       JOIN pr_bid_items bi ON bi.bid_id = b.id AND bi.is_winner = 1
       WHERE b.pr_id = ?
       GROUP BY b.id
       ORDER BY wins DESC
       LIMIT 1`,
      [prId]
    ) as any[];

    if (winnerStats.length > 0) {
      const topBid = winnerStats[0];
      await dbRun("UPDATE pr_bids SET status = 'selected' WHERE id = ?", [topBid.bid_id]);
      if (topBid.vendor_id) {
        await dbRun('UPDATE purchase_requests SET selected_vendor_id = ? WHERE id = ?', [topBid.vendor_id, prId]);
      }
    }

    // Return the updated item winners for all bids
    const itemWinners = await dbAll(
      `SELECT bi.bid_id, bi.item_index, bi.is_winner
       FROM pr_bid_items bi
       JOIN pr_bids b ON b.id = bi.bid_id
       WHERE b.pr_id = ? AND bi.is_winner = 1`,
      [prId]
    );

    res.json({ message: 'Item winner selected', item_winners: itemWinners });
  } catch (error) {
    console.error('Error selecting item winner:', error);
    res.status(500).json({ error: 'Failed to select item winner' });
  }
});

// DELETE /purchase-requests/:prId/bids/:bidId - delete a bid and its items
router.delete('/purchase-requests/:prId/bids/:bidId', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { bidId } = req.params;
    await dbRun('DELETE FROM pr_bid_items WHERE bid_id = ?', [bidId]);
    await dbRun('DELETE FROM pr_bids WHERE id = ?', [bidId]);
    res.json({ message: 'Bid deleted' });
  } catch (error) {
    console.error('Error deleting PR bid:', error);
    res.status(500).json({ error: 'Failed to delete bid' });
  }
});

// POST /purchase-requests/:prId/bids/:bidId/upload - upload multiple quotation files
router.post('/purchase-requests/:prId/bids/:bidId/upload', authMiddleware, bidUpload.array('file', 10), async (req: Request, res: Response) => {
  try {
    const { bidId } = req.params;
    const files = (req as any).files as Express.Multer.File[];
    if (!files || files.length === 0) return res.status(400).json({ error: 'No file uploaded' });

    const inserted: any[] = [];
    for (const file of files) {
      const filePath = '/uploads/bids/' + file.filename;
      const result = await dbRun(
        'INSERT INTO pr_bid_documents (bid_id, file_path, file_name, file_size) VALUES (?, ?, ?, ?)',
        [bidId, filePath, file.originalname, file.size]
      );
      inserted.push({ id: result.insertId, file_path: filePath, file_name: file.originalname, file_size: file.size });
    }

    // Keep backward compat: update quotation_file with last file
    if (inserted.length > 0) {
      await dbRun('UPDATE pr_bids SET quotation_file = ? WHERE id = ?', [inserted[inserted.length - 1].file_path, bidId]);
    }

    res.json({ message: `${inserted.length} file(s) uploaded`, files: inserted });
  } catch (error) {
    console.error('Error uploading bid file:', error);
    res.status(500).json({ error: 'Failed to upload file' });
  }
});

// GET /purchase-requests/:prId/bids/:bidId/documents - list all documents for a bid
router.get('/purchase-requests/:prId/bids/:bidId/documents', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { bidId } = req.params;
    const docs = await dbAll(
      'SELECT id, file_path, file_name, file_size, uploaded_at FROM pr_bid_documents WHERE bid_id = ? ORDER BY uploaded_at ASC',
      [bidId]
    );
    // Also include legacy quotation_file if not already in documents
    const bid = await dbGet('SELECT quotation_file FROM pr_bids WHERE id = ?', [bidId]) as any;
    const docPaths = new Set((docs as any[]).map((d: any) => d.file_path));
    if (bid?.quotation_file && !docPaths.has(bid.quotation_file)) {
      // Migrate legacy file into documents table
      await dbRun(
        'INSERT IGNORE INTO pr_bid_documents (bid_id, file_path, file_name, file_size) VALUES (?, ?, ?, 0)',
        [bidId, bid.quotation_file, bid.quotation_file.split('/').pop() || 'document']
      );
      (docs as any[]).push({ id: null, file_path: bid.quotation_file, file_name: bid.quotation_file.split('/').pop() || 'document', file_size: 0, uploaded_at: null });
    }
    res.json({ data: docs });
  } catch (error) {
    console.error('Error fetching bid documents:', error);
    res.status(500).json({ error: 'Failed to fetch documents' });
  }
});

// DELETE /purchase-requests/:prId/bids/:bidId/documents/:docId - delete single document
router.delete('/purchase-requests/:prId/bids/:bidId/documents/:docId', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { bidId, docId } = req.params;
    const doc = await dbGet('SELECT file_path FROM pr_bid_documents WHERE id = ? AND bid_id = ?', [docId, bidId]) as any;
    if (!doc) return res.status(404).json({ error: 'Document not found' });

    // Delete physical file
    const fullPath = path.join(__dirname, '../..', doc.file_path);
    try { require('fs').unlinkSync(fullPath); } catch { /* file may not exist */ }

    await dbRun('DELETE FROM pr_bid_documents WHERE id = ?', [docId]);

    // Update quotation_file to latest remaining doc
    const remaining = await dbGet(
      'SELECT file_path FROM pr_bid_documents WHERE bid_id = ? ORDER BY uploaded_at DESC LIMIT 1', [bidId]
    ) as any;
    await dbRun('UPDATE pr_bids SET quotation_file = ? WHERE id = ?', [remaining?.file_path || null, bidId]);

    res.json({ message: 'Document deleted' });
  } catch (error) {
    console.error('Error deleting bid document:', error);
    res.status(500).json({ error: 'Failed to delete document' });
  }
});


// (bid-progress endpoint moved below after generate-pos)

// GET /purchase-requests/:prId/bid-winner - get winner data for PO auto-fill
router.get('/purchase-requests/:prId/bid-winner', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { prId } = req.params;
    
    // Get the selected winner bid
    const winnerBid = await dbGet(
      "SELECT b.*, v.id as vid, v.code as vendor_code FROM pr_bids b LEFT JOIN vendors v ON b.vendor_id = v.id WHERE b.pr_id = ? AND b.status = 'selected' LIMIT 1",
      [prId]
    ) as any;
    
    if (!winnerBid) {
      return res.json({ has_winner: false, winner: null, items: [] });
    }
    
    // Get winner bid items with prices
    const winnerItems = await dbAll(
      'SELECT * FROM pr_bid_items WHERE bid_id = ? ORDER BY item_index',
      [winnerBid.id]
    ) as any[];
    
    res.json({
      has_winner: true,
      winner: {
        bid_id: winnerBid.id,
        vendor_id: winnerBid.vendor_id || winnerBid.vid,
        vendor_name: winnerBid.vendor_name,
        vendor_code: winnerBid.vendor_code,
        delivery_time_days: winnerBid.delivery_time_days,
        total_amount: winnerBid.total_amount,
      },
      items: winnerItems.map((item: any) => ({
        item_index: item.item_index,
        item_name: item.item_name,
        quantity: item.quantity,
        uom: item.uom,
        unit_price: item.unit_price,
        total_price: item.total_price,
      })),
    });
  } catch (error) {
    console.error('Error fetching bid winner:', error);
    res.status(500).json({ error: 'Failed to fetch bid winner' });
  }
});

// GET /purchase-requests/:prId/bid-summary - comparison summary of all vendors
router.get('/purchase-requests/:prId/bid-summary', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { prId } = req.params;
    const bids = await dbAll('SELECT * FROM pr_bids WHERE pr_id = ? ORDER BY total_amount ASC', [prId]) as any[];
    
    if (bids.length === 0) return res.json({ summary: [], cheapest: null, fastest: null });
    
    const summary = [];
    let cheapest: any = null;
    let fastest: any = null;
    const itemAnalysisMap = new Map<number, any>();
    
    for (const bid of bids) {
      const items = await dbAll('SELECT * FROM pr_bid_items WHERE bid_id = ? ORDER BY item_index', [bid.id]) as any[];
      const totalWithPrices = items.filter((i: any) => Number(i.unit_price) > 0).length;
      
      // Calculate true total by summing items and converting string decimals to numbers
      const total = items.reduce((sum: number, i: any) => sum + Number(i.total_price || 0), 0);
      
      const entry = {
        bid_id: bid.id,
        vendor_name: bid.vendor_name,
        vendor_id: bid.vendor_id,
        delivery_time_days: bid.delivery_time_days,
        total_amount: total,
        items_quoted: totalWithPrices,
        total_items: items.length,
        status: bid.status,
        is_winner: bid.status === 'selected',
      };
      summary.push(entry);
      
      // Only consider for cheapest if they actually quoted at least one item
      if (total > 0 && (!cheapest || total < cheapest.total_amount)) cheapest = entry;
      if (bid.delivery_time_days && (!fastest || bid.delivery_time_days < fastest.delivery_time_days)) fastest = entry;
      
      // Per-item analysis
      for (const item of items) {
        const price = Number(item.unit_price || 0);
        if (price > 0) {
          const current = itemAnalysisMap.get(item.item_index);
          if (!current || price < current.cheapest_price) {
            itemAnalysisMap.set(item.item_index, {
              item_index: item.item_index,
              item_name: item.item_name,
              cheapest_price: price,
              cheapest_vendor: bid.vendor_name,
              cheapest_vendor_id: bid.vendor_id
            });
          }
        }
      }
    }
    
    res.json({ 
      summary, 
      cheapest, 
      fastest, 
      item_analysis: Array.from(itemAnalysisMap.values()).sort((a, b) => a.item_index - b.item_index) 
    });
  } catch (error) {
    console.error('Error fetching bid summary:', error);
    res.status(500).json({ error: 'Failed to fetch bid summary' });
  }
});

// POST /purchase-requests/:prId/generate-pos - auto-create draft POs per winning vendor
router.post('/purchase-requests/:prId/generate-pos', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { prId } = req.params;
    const userId = (req as any).user?.userId;

    // Validate PR is approved
    const pr = await dbGet('SELECT * FROM purchase_requests WHERE id = ?', [prId]) as any;
    if (!pr) return res.status(404).json({ error: 'PR not found' });
    if ((pr.approval_status || 0) < 2) {
      return res.status(400).json({ error: 'PR belum diapprove. Approve PR terlebih dahulu sebelum generate PO.' });
    }

    // Check if PR already has POs (prevent duplicate generation)
    if (pr.status === 'PO_GENERATED') {
      const existingPOs = await dbAll('SELECT id, po_number FROM purchase_orders WHERE pr_id = ?', [prId]) as any[];
      if (existingPOs.length > 0) {
        return res.status(400).json({
          error: `PR ini sudah memiliki ${existingPOs.length} PO (${existingPOs.map((p:any) => p.po_number).join(', ')}). Hapus PO yang ada terlebih dahulu jika ingin generate ulang.`,
          existing_pos: existingPOs
        });
      }
    }

    // Get all bids for this PR
    const bids = await dbAll('SELECT pb.*, v.name as reg_vendor_name, v.id as reg_vendor_id FROM pr_bids pb LEFT JOIN vendors v ON pb.vendor_id = v.id WHERE pb.pr_id = ?', [prId]) as any[];
    if (bids.length === 0) return res.status(400).json({ error: 'Belum ada vendor bid untuk PR ini.' });

    // Collect winning items per bid/vendor
    const vendorItemsMap: Record<number, { bid: any; items: any[] }> = {};
    for (const bid of bids) {
      const winningItems = await dbAll(
        'SELECT * FROM pr_bid_items WHERE bid_id = ? AND is_winner = 1 ORDER BY item_index',
        [bid.id]
      ) as any[];
      if (winningItems.length > 0) {
        vendorItemsMap[bid.id] = { bid, items: winningItems };
      }
    }

    const vendorGroups = Object.values(vendorItemsMap);
    if (vendorGroups.length === 0) {
      return res.status(400).json({ error: 'Belum ada pemenang per item. Pilih pemenang di Bid Tabulation terlebih dahulu.' });
    }

    // Create one draft PO per winning vendor
    const createdPOs: any[] = [];
    for (const { bid, items } of vendorGroups) {
      const poNumber = generateCode('PO');
      const vendorId = bid.vendor_id || bid.reg_vendor_id || null;
      const vendorName = bid.vendor_name || bid.reg_vendor_name || 'Unknown';
      const subTotal = items.reduce((sum: number, i: any) => sum + Number(i.total_price || 0), 0);

      // Build notes JSON with items
      const notesData = {
        source: 'bid_tabulation',
        pr_id: prId,
        bid_id: bid.id,
        vendor_name: vendorName,
        sub_total: subTotal,
        discount_amount: 0,
        ppn_amount: 0,
        contract_total: subTotal,
        items: items.map((i: any) => ({
          productName: i.item_name,
          name: i.item_name,
          qty: Number(i.quantity),
          uom: i.uom,
          price: Number(i.unit_price),
          lineTotal: Number(i.total_price),
        })),
      };

      const poResult = await dbRun(
        `INSERT INTO purchase_orders (po_number, pr_id, vendor_id, status, total_amount, notes, po_date)
         VALUES (?, ?, ?, 'draft', ?, ?, DATE(NOW()))`,
        [poNumber, prId, vendorId, subTotal, JSON.stringify(notesData)]
      );
      const poId = poResult.insertId;

      // Insert PO items — both po_id and purchase_order_id to match existing schema
      for (const item of items) {
        await dbRun(
          `INSERT INTO purchase_order_items (purchase_order_id, po_id, product_id, quantity, unit_price, uom, notes)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [poId, poId, item.product_id || null, Number(item.quantity), Number(item.unit_price), item.uom || '', item.item_name]
        );
      }

      createdPOs.push({
        po_id: poId,
        po_number: poNumber,
        vendor_name: vendorName,
        vendor_id: vendorId,
        total_amount: subTotal,
        items_count: items.length,
      });
    }

    // Update PR status to PO_GENERATED
    await dbRun("UPDATE purchase_requests SET status = 'PO_GENERATED' WHERE id = ?", [prId]);

    res.status(201).json({
      message: `${createdPOs.length} draft PO berhasil dibuat`,
      data: createdPOs,
    });
  } catch (error: any) {
    console.error('Error generating POs from bid:', error);
    res.status(500).json({ error: 'Failed to generate POs: ' + (error.message || 'Unknown error') });
  }
});

// GET /purchase-requests/:prId/bid-progress - updated to use is_winner count
router.get('/purchase-requests/:prId/bid-progress', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { prId } = req.params;

    const pr = await dbGet('SELECT notes FROM purchase_requests WHERE id = ?', [prId]) as any;
    if (!pr) return res.json({ total_items: 0, items_with_winner: 0, percentage: 0, has_winner: false });

    let totalItems = 0;
    try {
      const notesData = JSON.parse(pr.notes || '{}');
      totalItems = (notesData.items || []).length;
    } catch { totalItems = 0; }

    if (totalItems === 0) return res.json({ total_items: 0, items_with_winner: 0, percentage: 0, has_winner: false });

    const bids = await dbAll('SELECT id FROM pr_bids WHERE pr_id = ?', [prId]) as any[];
    if (bids.length === 0) return res.json({ total_items: totalItems, items_with_winner: 0, percentage: 0, has_winner: false, total_bids: 0 });

    const bidIds = bids.map((b: any) => b.id);

    // Count unique item_indexes that have is_winner = 1
    const winnerItems = await dbAll(
      `SELECT DISTINCT item_index FROM pr_bid_items WHERE bid_id IN (${bidIds.map(() => '?').join(',')}) AND is_winner = 1`,
      bidIds
    ) as any[];

    const itemsWithWinner = winnerItems.length;
    const percentage = Math.round((itemsWithWinner / totalItems) * 100);

    res.json({
      total_items: totalItems,
      items_with_winner: itemsWithWinner,
      percentage,
      has_winner: itemsWithWinner > 0,
      total_bids: bids.length,
    });
  } catch (error) {
    console.error('Error calculating bid progress:', error);
    res.status(500).json({ error: 'Failed to calculate bid progress' });
  }
});

// Purchase Orders with items

router.get('/purchase-orders', authMiddleware, async (req: Request, res: Response) => {
  try {
    const orders = await dbAll(
      `SELECT po.*, pr.pr_number, v.name as vendor_name,
              cp.project_name, cp.project_number,
              (SELECT GROUP_CONCAT(
                COALESCE(p2.name, poi.notes, 'Item')
                SEPARATOR ', ')
               FROM purchase_order_items poi
               LEFT JOIN products p2 ON poi.product_id = p2.id
               WHERE poi.purchase_order_id = po.id OR poi.po_id = po.id
              ) as items_description
       FROM purchase_orders po
       LEFT JOIN vendors v ON po.vendor_id = v.id
       LEFT JOIN purchase_requests pr ON po.pr_id = pr.id
       LEFT JOIN client_projects cp ON po.project_id = cp.id
       ORDER BY po.created_at DESC`
    );
    
    console.log('[PO List] Orders retrieved:', (orders || []).length);
    res.json({ data: orders });
  } catch (error) {
    console.error('Error fetching purchase orders:', error);
    res.status(500).json({ error: 'Failed to fetch purchase orders' });
  }
});

router.get('/purchase-orders/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const order = await dbGet(
      `SELECT po.*, v.name as vendor_name, pr.pr_number,
              cp.project_name, cp.project_number
       FROM purchase_orders po
       LEFT JOIN vendors v ON po.vendor_id = v.id
       LEFT JOIN purchase_requests pr ON po.pr_id = pr.id
       LEFT JOIN client_projects cp ON po.project_id = cp.id
       WHERE po.id = ?`,
      [req.params.id]
    );
    if (!order) return res.status(404).json({ error: 'Purchase order not found' });

    const items = await dbAll(
      `SELECT DISTINCT i.*,
              p.sku,
              COALESCE(p.name, i.notes) as product_name,
              COALESCE(p.name, i.notes) as item_name
       FROM purchase_order_items i
       LEFT JOIN products p ON i.product_id = p.id
       WHERE i.purchase_order_id = ? OR i.po_id = ?`,
      [req.params.id, req.params.id]
    );

    const paymentSchedules = await dbAll(
      `SELECT s.*,
              ap.invoice_number,
              ap.paid_amount as ap_paid_amount,
              ap.status as ap_status
       FROM purchase_order_payment_schedules s
       LEFT JOIN accounts_payable ap ON ap.id = s.ap_id
       WHERE s.po_id = ?
       ORDER BY s.schedule_no ASC`,
      [req.params.id]
    );

    res.json({ data: { ...order, items, payment_schedules: paymentSchedules } });
  } catch (error) {
    console.error('Error fetching purchase order:', error);
    res.status(500).json({ error: 'Failed to fetch purchase order' });
  }
});

router.post('/purchase-orders', authMiddleware, async (req: Request, res: Response) => {
  try {
    const {
      po_number,
      vendor_id,
      pr_id,
      project_id,
      status,
      po_date,
      expected_date,
      currency,
      payment_term,
      payment_term_2,
      address,
      type,
      contact_person,
      delivery_to,
      advance_payment,
      discount_percent,
      ppn_percent,
      notes,
      items,
      payment_schedules,
    } = req.body;
    console.log('[PO:create] payload:', req.body);
    if (!vendor_id) return res.status(400).json({ error: 'vendor_id is required' });
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'items are required' });
    }

    // Validate PR if provided (approval_status = 2)
    if (pr_id) {
      const pr = await dbGet('SELECT approval_status, status, notes FROM purchase_requests WHERE id = ?', [pr_id]) as any;
      if (!pr) {
        return res.status(400).json({ error: 'PR not found' });
      }
      if (pr.approval_status !== 2) {
        return res.status(400).json({ error: 'Cannot create PO: PR must be fully approved (2/2) first' });
      }

      // Check if PR already has POs generated
      if (pr.status === 'PO_GENERATED') {
        const existingPOs = await dbAll('SELECT id, po_number FROM purchase_orders WHERE pr_id = ?', [pr_id]) as any[];
        if (existingPOs.length > 0) {
          return res.status(400).json({
            error: `PR ini sudah memiliki ${existingPOs.length} PO (${existingPOs.map((p:any) => p.po_number).join(', ')}). PR tidak bisa digunakan lagi untuk PO baru.`,
            existing_pos: existingPOs
          });
        }
      }

      // Validate that PR items are not already used in any PO (even draft)
      let prItems: Array<{ productId?: number; product_id?: number; qty?: number; quantity?: number }>; 
      try {
        const parsed = JSON.parse(pr.notes || '{}');
        prItems = (parsed.items || []) as any[];
      } catch {
        prItems = [] as any[];
      }
      
      // Check remaining quantity for each PR item
      const existingPOItems = await dbAll(
        `SELECT i.product_id, SUM(i.quantity) as allocated_qty
         FROM purchase_order_items i
         JOIN purchase_orders po ON (po.id = i.purchase_order_id OR po.id = i.po_id)
         WHERE po.pr_id = ? AND po.status != 'cancelled'
         GROUP BY i.product_id`,
        [pr_id]
      ) as Array<{ product_id: number, allocated_qty: number }>;
      
      // Build map: key -> total qty allowed from PR
      // Use product_id when available, fallback to item name for items without product catalog link
      const prQtyMap = new Map<string, number>();
      for (const item of prItems) {
        const pid = Number(item.product_id || item.productId);
        const qty = Number(item.quantity || item.qty);
        // Use pid if it's a valid non-zero number, otherwise use item name as key
        const key = (pid && Number.isFinite(pid)) ? `pid:${pid}` : `name:${(item as any).productName || (item as any).name || 'unknown'}`;
        if (qty > 0) {
           prQtyMap.set(key, (prQtyMap.get(key) || 0) + qty);
        }
      }
      
      const allocatedQtyMap = new Map<string, number>();
      for (const item of existingPOItems) {
         const pid = Number(item.product_id);
         const key = (pid && Number.isFinite(pid)) ? `pid:${pid}` : `pid:${pid}`;
         allocatedQtyMap.set(key, Number(item.allocated_qty));
      }
      
      const overAllocated: Array<{ product_id: number, requested: number, remaining: number }> = [];
      for (const it of items) {
        const pid = Number(it.product_id);
        const newQty = Number(it.quantity);
        
        // Build lookup key matching the PR map
        const key = (pid && Number.isFinite(pid)) ? `pid:${pid}` : null;
        
        // If we can't map this item to a PR item (no product_id), skip over-allocation check
        if (!key) continue;
        
        const maxQty = prQtyMap.get(key) || 0;
        const alreadyAllocated = allocatedQtyMap.get(key) || 0;
        const remaining = maxQty - alreadyAllocated;
        
        // Use a small epsilon to prevent floating point issues
        if (maxQty > 0 && newQty > remaining + 0.001) {
           overAllocated.push({ product_id: pid, requested: newQty, remaining: remaining });
        }
      }
      
      if (overAllocated.length > 0) {
        return res.status(400).json({
          error: 'Kuantitas item PO melebihi sisa PR yang belum teralokasi',
          details: overAllocated
        });
      }
    }

    const number = po_number || generateCode('PO');
    const { contractTotal } = parsePOFinancials(notes, items, Number(discount_percent || 0), Number(ppn_percent || 0));
    
    try {
      // Insert order header
      // If PR has a project_id, inherit it
      let effectiveProjectId = project_id || null;
      if (!effectiveProjectId && pr_id) {
        const prRow = await dbGet('SELECT project_id FROM purchase_requests WHERE id = ?', [pr_id]) as any;
        if (prRow?.project_id) effectiveProjectId = prRow.project_id;
      }

      const poResult = await dbRun(
        `INSERT INTO purchase_orders (
          po_number, po_date, vendor_id, pr_id, project_id, status, approval_status, expected_date, currency,
          payment_term, payment_term_2, address, type, item_type, contact_person, delivery_to,
          advance_payment, discount_percent, ppn_percent, total_amount, notes
        ) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          number,
          normalizeDateOnly(po_date || '') || new Date().toISOString().slice(0, 10),
          vendor_id,
          pr_id || null,
          effectiveProjectId,
          status || 'draft',
          expected_date || null,
          currency || 'IDR',
          payment_term || null,
          payment_term_2 || null,
          address || null,
          type || 'Local',
          req.body.item_type || 'inventory',
          contact_person || null,
          delivery_to || null,
          Number(advance_payment || 0),
          Number(discount_percent || 0),
          Number(ppn_percent || 0),
          Number(contractTotal || 0),
          notes || null,
        ]
      );
      
      // Get the inserted PO ID
      const poId = poResult.insertId;
      
      // Insert items
      for (const item of items) {
        if (!item.quantity || Number(item.quantity) <= 0) {
          throw new Error('Invalid item: quantity is required and must be > 0');
        }
        const itemProductId = item.product_id || null;
        console.log(`[PO:create] Inserting item: product_id=${itemProductId}, qty=${item.quantity}, uom=${item.uom}, price=${item.unit_price}`);
        try {
          await dbRun(
            'INSERT INTO purchase_order_items (purchase_order_id, po_id, product_id, quantity, uom, unit_price, currency, notes, proposal_item_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [poId, poId, itemProductId, item.quantity, item.uom || null, item.unit_price || 0, item.currency || currency || 'IDR', item.notes || null, item.proposal_item_id || null]
          );
        } catch (insertErr: any) {
          console.error(`[PO:create] Failed inserting product_id=${itemProductId}:`, insertErr.message);
          throw insertErr;
        }
      }

      await upsertPaymentSchedules({
        poId,
        poData: {
          po_date,
          expected_date,
          payment_term,
          vendor_id,
          advance_payment,
          discount_percent,
          ppn_percent,
          notes,
        },
        items,
        paymentSchedules: payment_schedules,
      });

      res.status(201).json({ message: 'Purchase order created', data: { id: poId, po_number: number } });
    } catch (txErr: any) {
      console.error('[PO:create] error:', txErr);
      const msg = txErr?.message || 'Failed to create purchase order';
      return res.status(400).json({ error: msg });
    }
  } catch (error: any) {
    console.error('Error creating purchase order:', error);
    if (error.message?.includes('UNIQUE')) return res.status(400).json({ error: 'PO number must be unique' });
    res.status(500).json({ error: 'Failed to create purchase order' });
  }
});

router.put('/purchase-orders/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const {
      vendor_id,
      pr_id,
      project_id,
      status,
      po_date,
      expected_date,
      currency,
      payment_term,
      payment_term_2,
      address,
      type,
      item_type,
      contact_person,
      delivery_to,
      advance_payment,
      discount_percent,
      ppn_percent,
      notes,
      items,
      payment_schedules,
    } = req.body;
    const { contractTotal } = parsePOFinancials(notes, items || [], Number(discount_percent || 0), Number(ppn_percent || 0));
    
    try {
      // Update order header
      await dbRun(
        `UPDATE purchase_orders
         SET vendor_id = ?, pr_id = ?, project_id = ?, status = ?, po_date = ?, expected_date = ?, currency = ?,
             payment_term = ?, payment_term_2 = ?, address = ?, type = ?, item_type = ?, contact_person = ?, delivery_to = ?,
             advance_payment = ?, discount_percent = ?, ppn_percent = ?, total_amount = ?, notes = ?,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [
          vendor_id,
          pr_id || null,
          project_id || null,
          status,
          normalizeDateOnly(po_date || '') || new Date().toISOString().slice(0, 10),
          expected_date || null,
          currency || 'IDR',
          payment_term || null,
          payment_term_2 || null,
          address || null,
          type || 'Local',
          item_type || 'inventory',
          contact_person || null,
          delivery_to || null,
          Number(advance_payment || 0),
          Number(discount_percent || 0),
          Number(ppn_percent || 0),
          Number(contractTotal || 0),
          notes || null,
          req.params.id,
        ]
      );
      
      if (items && Array.isArray(items)) {
        // Delete existing items
        await dbRun('DELETE FROM purchase_order_items WHERE purchase_order_id = ? OR po_id = ?', [req.params.id, req.params.id]);
        
        // Insert new items
        for (const item of items) {
          await dbRun(
            'INSERT INTO purchase_order_items (purchase_order_id, po_id, product_id, quantity, uom, unit_price, currency, notes, proposal_item_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [req.params.id, req.params.id, item.product_id, item.quantity, item.uom || null, item.unit_price || 0, item.currency || currency || 'IDR', item.notes || null, item.proposal_item_id || null]
          );
        }
      }

      await upsertPaymentSchedules({
        poId: Number(req.params.id),
        poData: {
          po_date,
          expected_date,
          payment_term,
          vendor_id,
          advance_payment,
          discount_percent,
          ppn_percent,
          notes,
        },
        items: items || [],
        paymentSchedules: payment_schedules,
      });
      
      res.json({ message: 'Purchase order updated' });
    } catch (err) {
      console.error('[PO:update] error:', err);
      throw err;
    }
  } catch (error) {
    console.error('Error updating purchase order:', error);
    res.status(500).json({ error: 'Failed to update purchase order' });
  }
});

router.get('/purchase-orders/:id/payment-schedules', authMiddleware, async (req: Request, res: Response) => {
  try {
    const schedules = await dbAll(
      `SELECT s.*, ap.invoice_number, ap.paid_amount as ap_paid_amount, ap.status as ap_status
       FROM purchase_order_payment_schedules s
       LEFT JOIN accounts_payable ap ON ap.id = s.ap_id
       WHERE s.po_id = ?
       ORDER BY s.schedule_no ASC`,
      [req.params.id]
    );
    res.json({ data: schedules });
  } catch (error) {
    console.error('Error fetching payment schedules:', error);
    res.status(500).json({ error: 'Failed to fetch payment schedules' });
  }
});

// Approve / Reject Purchase Orders
router.post('/purchase-orders/:id/approve', authMiddleware, async (req: Request, res: Response) => {
  try {
    const poId = req.params.id;
    const userId = (req as any).user?.userId;
    const userLevel = (req as any).user?.userLevel || 1;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const po = await dbGet('SELECT * FROM purchase_orders WHERE id = ?', [poId]) as any;
    if (!po) return res.status(404).json({ error: 'Purchase order not found' });

    const currentStatus = po.approval_status || 0;
    const approverRow = await dbGet('SELECT id FROM users WHERE id = ?', [userId]) as { id: number } | undefined;
    const approverId = approverRow ? userId : null;

    // Helper: regenerate schedule after approval
    const regenerateSchedule = async () => {
      const items = await dbAll(
        'SELECT DISTINCT * FROM purchase_order_items WHERE purchase_order_id = ? OR po_id = ?',
        [poId, poId]
      ) as any[];
      await upsertPaymentSchedules({ poId: Number(poId), poData: po, items });
    };

    if (userLevel >= 4 && currentStatus < 2) {
      await dbRun(
        'UPDATE purchase_orders SET approval_status = 2, approved_by_supervisor_id = ?, approved_by_manager_id = ?, approved_at_supervisor = CURRENT_TIMESTAMP, approved_at_manager = CURRENT_TIMESTAMP WHERE id = ?',
        [approverId, approverId, poId]
      );
      await regenerateSchedule();
      return res.json({ message: 'PO fully approved (DIRECT)', approval_status: 2 });
    }

    if (userLevel === 2 && currentStatus === 0) {
      await dbRun(
        'UPDATE purchase_orders SET approval_status = 1, approved_by_supervisor_id = ?, approved_at_supervisor = CURRENT_TIMESTAMP WHERE id = ?',
        [approverId, poId]
      );
      await regenerateSchedule();
      return res.json({ message: 'PO approved by supervisor (1/2)', approval_status: 1 });
    }

    if (userLevel === 3 && currentStatus === 1) {
      await dbRun(
        'UPDATE purchase_orders SET approval_status = 2, approved_by_manager_id = ?, approved_at_manager = CURRENT_TIMESTAMP WHERE id = ?',
        [approverId, poId]
      );
      await regenerateSchedule();
      return res.json({ message: 'PO approved by manager (2/2)', approval_status: 2 });
    }

    return res.status(400).json({
      error: 'Cannot approve: insufficient level or invalid status',
      debug: { userLevel, currentStatus, needLevel: currentStatus === 0 ? 2 : 3 }
    });
  } catch (error) {
    console.error('Error approving PO:', error);
    res.status(500).json({ error: 'Failed to approve purchase order' });
  }
});

router.post('/purchase-orders/:id/reject', authMiddleware, async (req: Request, res: Response) => {
  try {
    const poId = req.params.id;
    const userId = (req as any).user?.userId;
    const userLevel = (req as any).user?.userLevel || 1;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    if (userLevel >= 2) {
      await dbRun(
        'UPDATE purchase_orders SET approval_status = 0, approved_by_supervisor_id = NULL, approved_by_manager_id = NULL, approved_at_supervisor = NULL, approved_at_manager = NULL WHERE id = ?',
        [poId]
      );
      return res.json({ message: 'PO rejected and reset to pending', approval_status: 0 });
    }

    return res.status(400).json({ error: 'Cannot reject: insufficient level' });
  } catch (error) {
    console.error('Error rejecting PO:', error);
    res.status(500).json({ error: 'Failed to reject purchase order' });
  }
});

router.delete('/purchase-orders/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = (req as any).user?.userId;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    // Check PO status
    const po = await dbGet('SELECT id, status, approval_status FROM purchase_orders WHERE id = ?', [id]) as any;

    if (!po) {
      return res.status(404).json({ error: 'Purchase order not found' });
    }

    // Allow delete if draft OR approval_status is 0 (pending)
    const approvalStatus = Number(po.approval_status || 0);
    if (po.status !== 'draft' && approvalStatus > 0) {
      return res.status(400).json({ error: `Cannot delete: PO status is "${po.status}" with approval ${approvalStatus}/2. Reset approval first.` });
    }

    // Delete related records in correct order (child tables first)
    // Use a helper to safely clean up FK references
    const safeCleanup = async (sql: string, params: any[], label: string) => {
      try {
        await dbRun(sql, params);
      } catch (e: any) {
        console.warn(`Warning cleaning ${label}:`, e.message?.substring(0, 120));
      }
    };

    // 1. Delete payment schedules
    await safeCleanup('DELETE FROM purchase_order_payment_schedules WHERE po_id = ?', [id], 'payment_schedules');

    // 2. Nullify/delete accounts_payable
    await safeCleanup('DELETE FROM accounts_payable WHERE po_id = ?', [id], 'accounts_payable');

    // 3. Nullify fund_requests
    await safeCleanup('UPDATE fund_requests SET po_id = NULL WHERE po_id = ?', [id], 'fund_requests');

    // 4. Nullify fund_request_items
    await safeCleanup('UPDATE fund_request_items SET po_id = NULL WHERE po_id = ?', [id], 'fund_request_items');

    // 4.5. Delete grn_items referencing the goods_receipts of this PO
    await safeCleanup('DELETE FROM grn_items WHERE grn_id IN (SELECT id FROM goods_receipts WHERE po_id = ?)', [id], 'grn_items');

    // 5. Delete goods_receipts referencing this PO
    await safeCleanup('DELETE FROM goods_receipts WHERE po_id = ?', [id], 'goods_receipts');

    // 6. Delete PO items
    await safeCleanup('DELETE FROM purchase_order_items WHERE purchase_order_id = ? OR po_id = ?', [id, id], 'po_items');

    // 7. Delete the PO itself
    await dbRun('DELETE FROM purchase_orders WHERE id = ?', [id]);

    res.json({ message: 'Purchase order deleted successfully' });
  } catch (error: any) {
    console.error('Error deleting PO:', error);
    res.status(500).json({ error: 'Failed to delete purchase order: ' + (error.message || 'Unknown error') });
  }
});

// Goods Receipts
router.get('/goods-receipts', authMiddleware, async (req: Request, res: Response) => {
  try {
    const receipts = await dbAll(
      `SELECT gr.*, po.po_number, w.name as warehouse_name
       FROM goods_receipts gr
       LEFT JOIN purchase_orders po ON gr.po_id = po.id
       LEFT JOIN warehouses w ON gr.warehouse_id = w.id
       ORDER BY gr.created_at DESC`,
      []
    );
    res.json({ data: receipts });
  } catch (error) {
    console.error('Error fetching goods receipts:', error);
    res.status(500).json({ error: 'Failed to fetch goods receipts' });
  }
});

router.get('/goods-receipts/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const receipt = await dbGet(
      `SELECT gr.*, po.po_number, w.name as warehouse_name, u.full_name as received_by_name
       FROM goods_receipts gr
       LEFT JOIN purchase_orders po ON gr.po_id = po.id
       LEFT JOIN warehouses w ON gr.warehouse_id = w.id
       LEFT JOIN users u ON gr.received_by = u.id
       WHERE gr.id = ?`,
      [req.params.id]
    );
    if (!receipt) return res.status(404).json({ error: 'Goods receipt not found' });
    res.json({ data: receipt });
  } catch (error) {
    console.error('Error fetching goods receipt:', error);
    res.status(500).json({ error: 'Failed to fetch goods receipt' });
  }
});

router.post('/goods-receipts', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { grn_number, po_id, warehouse_id, status, received_date, received_at, notes, received_by } = req.body;
    if (!po_id) return res.status(400).json({ error: 'po_id is required' });
    if (!warehouse_id) return res.status(400).json({ error: 'warehouse_id is required' });

    const normalizedDate = normalizeDateOnly(received_date || received_at);
    if (!normalizedDate) return res.status(400).json({ error: 'received_date is required' });

    const number = grn_number || generateCode('GRN');
    
    // Determine and validate received_by user ID
    let receiver = received_by || (req as any).userId || 1;
    
    // Verify user exists in database
    const userExists = await dbGet('SELECT id FROM users WHERE id = ?', [receiver]);
    if (!userExists) {
      console.warn(`⚠️ User ID ${receiver} not found, using default admin (ID: 1)`);
      receiver = 1;
    }
    
    // Universal Rule: Prevent creating a new GRN if an active (non-rejected) GRN already exists for this PO
    const activeGRN = await dbGet(
      'SELECT id, grn_number FROM goods_receipts WHERE po_id = ? AND (approval_status IS NULL OR approval_status != -1)',
      [po_id]
    ) as any;
    
    if (activeGRN) {
      return res.status(400).json({ 
        error: `PO ini sudah terikat dengan GRN (${activeGRN.grn_number}). Anda tidak dapat membuat GRN baru untuk PO ini kecuali GRN sebelumnya di-reject.` 
      });
    }

    console.log('🔍 GRN Create Debug:', { po_id, warehouse_id, receiver, date: normalizedDate });

    const result = await dbRun(
      `INSERT INTO goods_receipts 
       (grn_number, po_id, warehouse_id, received_date, received_by, status, notes) 
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [number, po_id, warehouse_id, normalizedDate, receiver, status || 'DRAFT', notes || null]
    );

    const grId = result.insertId;

    res.status(201).json({ message: 'Goods receipt created', data: { id: grId, grn_number: number } });
  } catch (error: any) {
    console.error('❌ Error creating goods receipt:', error);
    console.error('Error details:', { message: error.message, code: error.code, sql: error.sql });
    if (error.message?.includes('UNIQUE')) return res.status(400).json({ error: 'GRN number must be unique' });
    if (error.code === 'ER_NO_REFERENCED_ROW_2') {
      return res.status(400).json({ error: 'Invalid reference: Check PO ID, Warehouse ID, or User ID' });
    }
    res.status(500).json({ error: error.message || 'Failed to create goods receipt' });
  }
});

router.put('/goods-receipts/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { warehouse_id, status, received_date, received_at, notes } = req.body;
    const normalizedDate = normalizeDateOnly(received_date || received_at);

    await dbRun(
      `UPDATE goods_receipts 
       SET warehouse_id = ?, status = ?, received_date = ?, notes = ? 
       WHERE id = ?`,
      [warehouse_id, status || 'DRAFT', normalizedDate, notes || null, id]
    );

    res.json({ message: 'Goods receipt updated' });
  } catch (error: any) {
    console.error('Error updating goods receipt:', error);
    res.status(500).json({ error: 'Failed to update goods receipt' });
  }
});

router.delete('/goods-receipts/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const grn = await dbGet(`SELECT * FROM goods_receipts WHERE id = ?`, [id]) as any;
    if (!grn) return res.status(404).json({ error: 'GRN not found' });

    // Safe cleanup helper
    const safeCleanup = async (sql: string, params: any[], label: string) => {
      try { await dbRun(sql, params); } catch (e: any) {
        console.warn(`Warning cleaning ${label}:`, e.message?.substring(0, 120));
      }
    };

    // If GRN was approved (inventory was updated), reverse the stock
    if (Number(grn.approval_status) === 2) {
      // Get items to reverse inventory
      const grnItems = await dbAll(
        'SELECT * FROM grn_items WHERE grn_id = ?', [id]
      ) as any[];

      for (const item of grnItems) {
        if (item.product_id && (item.received_quantity || 0) > 0) {
          // Reduce inventory
          await safeCleanup(
            'UPDATE inventory SET quantity_on_hand = GREATEST(0, quantity_on_hand - ?), quantity_available = GREATEST(0, quantity_available - ?) WHERE product_id = ?',
            [item.received_quantity, item.received_quantity, item.product_id],
            'inventory_reverse'
          );
        }
      }
    }

    // 1. Delete stock movements referencing this GRN
    await safeCleanup('DELETE FROM stock_movements WHERE reference_type = ? AND reference_id = ?', ['GRN', id], 'stock_movements');

    // 2. Delete GRN items
    await safeCleanup('DELETE FROM grn_items WHERE grn_id = ?', [id], 'grn_items');

    // 3. Delete the GRN itself
    await dbRun(`DELETE FROM goods_receipts WHERE id = ?`, [id]);

    res.json({ message: 'Goods receipt deleted successfully' });
  } catch (error: any) {
    console.error('Error deleting goods receipt:', error);
    if (error.code === 'ER_ROW_IS_REFERENCED_2' || error.errno === 1451) {
      return res.status(400).json({ error: 'Tidak dapat menghapus GRN ini karena masih digunakan di modul lain.' });
    }
    res.status(500).json({ error: 'Failed to delete goods receipt: ' + (error.message || 'Unknown error') });
  }
});

router.post('/goods-receipts/:id/approve', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    let userId = (req as any).user?.userId;
    const userLevel = (req as any).user?.userLevel || 1;

    console.log('[GRN Approve] Request:', { id, userId, userLevel });

    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    // Verify user exists in database
    const userExists = await dbGet('SELECT id FROM users WHERE id = ?', [userId]);
    if (!userExists) {
      console.warn(`⚠️ Approve user ID ${userId} not found, using default admin (ID: 1)`);
      userId = 1;
    }

    // Get GRN detail
    const grn = await dbGet(`SELECT * FROM goods_receipts WHERE id = ?`, [id]) as any;

    if (!grn) return res.status(404).json({ error: 'GRN not found' });

    let currentStatus = Number(grn.approval_status || 0);
    console.log('[GRN Approve] Current status:', currentStatus);

    // Parse items from notes
    let items: any[] = [];
    try {
      const parsedNotes = JSON.parse(grn.notes || '{}');
      items = parsedNotes.items || [];
    } catch (e) {
      items = [];
    }

    // If rejected (-1), reset to pending (0) first
    if (currentStatus === -1) {
      console.log('[GRN Approve] Resetting rejected GRN to pending');
      await dbRun(
        `UPDATE goods_receipts
         SET approval_status = 0, status = 'received',
             approved_by_supervisor_id = NULL,
             approved_by_manager_id = NULL,
             approved_at_supervisor = NULL,
             approved_at_manager = NULL
         WHERE id = ?`,
        [id]
      );
      currentStatus = 0; // Update the variable
    }

    // Director/Master (>=4): direct full approval
    if (userLevel >= 4 && currentStatus < 2) {
      console.log('[GRN Approve] Director/Master approval');
      await dbRun(
        `UPDATE goods_receipts
         SET approval_status = 2, status = 'approved',
             approved_by_supervisor_id = ?,
             approved_by_manager_id = ?,
             approved_at_supervisor = CURRENT_TIMESTAMP,
             approved_at_manager = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [userId, userId, id]
      );
    } else if (userLevel === 2 && currentStatus === 0) {
      console.log('[GRN Approve] Supervisor approval');
      // Supervisor: 0 -> 1
      await dbRun(
        `UPDATE goods_receipts
         SET approval_status = 1, status = 'received',
             approved_by_supervisor_id = ?,
             approved_at_supervisor = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [userId, id]
      );
    } else if (userLevel === 3 && currentStatus === 1) {
      console.log('[GRN Approve] Manager approval');
      // Manager: 1 -> 2
      await dbRun(
        `UPDATE goods_receipts
         SET approval_status = 2, status = 'approved',
             approved_by_manager_id = ?,
             approved_at_manager = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [userId, id]
      );
    } else {
      console.log('[GRN Approve] Insufficient permissions', { userLevel, currentStatus });
      return res.status(400).json({
        error: 'Cannot approve: insufficient level or invalid status',
        debug: { userLevel, currentStatus, needLevel: currentStatus === 0 ? 2 : 3 }
      });
    }

    // If now fully approved, create stock movements and update inventory
    const updated = await dbGet('SELECT * FROM goods_receipts WHERE id = ?', [id]) as any;
    if (Number(updated.approval_status) === 2) {
      const grnId = Number(updated.id);
      const grnNumber = updated.grn_number || updated.gr_number || `GRN-${grnId}`;
      const alreadyPostedStock = await dbGet(
        'SELECT COUNT(*) as cnt FROM stock_movements WHERE reference_type = ? AND reference_id = ?',
        ['GRN', grnId]
      ) as any;

      if ((alreadyPostedStock?.cnt || 0) === 0) {
        for (const item of items) {
          if ((item.received_quantity || 0) > 0 && item.product_id) {
            await dbRun(
              `INSERT INTO stock_movements 
              (product_id, warehouse_id, reference_type, reference_id, quantity, movement_type, notes, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
              [
                item.product_id,
                updated.warehouse_id,
                'GRN',
                grnId,
                item.received_quantity,
                'inbound',
                `${grnNumber} - Receipt from PO ${updated.po_id}: ${item.remarks || 'OK'}`
              ]
            );
          }
        }
      } else {
        console.log('[GRN Approve] Stock movements already recorded, skipping duplicate insert');
      }

      await applyGrnToInventory(updated, items);
    }

    const finalData = await dbGet(
      `SELECT gr.*, po.po_number, w.name as warehouse_name, u.full_name as received_by_name
       FROM goods_receipts gr
       LEFT JOIN purchase_orders po ON gr.po_id = po.id
       LEFT JOIN warehouses w ON gr.warehouse_id = w.id
       LEFT JOIN users u ON gr.received_by = u.id
       WHERE gr.id = ?`,
      [id]
    );

    res.json({ message: 'GRN approval updated', data: finalData });
  } catch (error: any) {
    console.error('Error approving GRN:', error);
    res.status(500).json({ error: 'Failed to approve GRN' });
  }
});

router.post('/goods-receipts/:id/reject', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userLevel = (req as any).user?.userLevel || 1;
    if (userLevel < 2) return res.status(400).json({ error: 'Insufficient level to reject' });

    await dbRun(
      `UPDATE goods_receipts 
       SET approval_status = -1, status = 'rejected',
           approved_by_supervisor_id = NULL, approved_by_manager_id = NULL,
           approved_at_supervisor = NULL, approved_at_manager = NULL
       WHERE id = ?`,
      [id]
    );

    const data = await dbGet('SELECT * FROM goods_receipts WHERE id = ?', [id]);
    res.json({ message: 'GRN rejected', data });
  } catch (error: any) {
    console.error('Error rejecting GRN:', error);
    res.status(500).json({ error: 'Failed to reject GRN' });
  }
});

// Sync approved GRN into inventory (quantity_on_hand / available) and log inventory transactions
async function applyGrnToInventory(grn: any, items: any[]) {
  try {
    const alreadyPosted = await dbGet(
      'SELECT COUNT(*) as cnt FROM inventory_transactions WHERE reference_type = ? AND reference_id = ?',
      ['GRN', grn.id]
    ) as any;

    if ((alreadyPosted?.cnt || 0) > 0) {
      console.log('[GRN Approve] Inventory already updated for this GRN, skipping duplicate apply');
      return;
    }

    const defaultLocation = grn.warehouse_id ? `WH-${grn.warehouse_id}` : null;

    for (const item of items) {
      const qty = Number(item.received_quantity || 0);
      if (!item.product_id || qty <= 0) continue;

      const existing = await dbGet('SELECT * FROM inventory_stocks WHERE product_id = ?', [item.product_id]) as any;

      let inventoryId: number;
      if (existing) {
        const newQoh = (existing.quantity_on_hand || 0) + qty;
        const newAvailable = newQoh - (existing.quantity_reserved || 0);
        await dbRun(
          `UPDATE inventory_stocks
          SET quantity_on_hand = ?, quantity_available = ?, location = COALESCE(location, ?), updated_at = CURRENT_TIMESTAMP
          WHERE id = ?`,
          [newQoh, newAvailable, defaultLocation, existing.id]
        );
        inventoryId = existing.id;
      } else {
        const insertResult = await dbRun(
          `INSERT INTO inventory_stocks (product_id, quantity_on_hand, quantity_reserved, quantity_available, location)
          VALUES (?, ?, 0, ?, ?)`,
          [item.product_id, qty, qty, defaultLocation]
        );
        inventoryId = insertResult.insertId;
      }

      const grnLabel = grn.grn_number || grn.gr_number || `GRN-${grn.id}`;
      await dbRun(
        `INSERT INTO stock_movements (product_id, warehouse_id, quantity, movement_type, reference_type, reference_id, notes, created_at)
        VALUES (?, ?, ?, 'inbound', 'GRN', ?, ?, CURRENT_TIMESTAMP)`,
        [
          item.product_id,
          grn.warehouse_id,
          qty,
          grn.id,
          `${grnLabel}${item.remarks ? ' - ' + item.remarks : ''}`
        ]
      );
    }

    console.log('[GRN Approve] Inventory updated from GRN', { grnId: grn.id, items: items.length });
  } catch (error) {
    console.error('[GRN Approve] Failed to apply GRN to inventory:', error);
  }
}

// ── Manual Price Search ─────────────────────────────────────────────────────
// Search prices by product name/SKU — returns vendor_prices + PO history + standard cost
router.get('/price-search', authMiddleware, async (req: Request, res: Response) => {
  try {
    const q = String(req.query.q || '').trim();
    const product_id = req.query.product_id ? Number(req.query.product_id) : null;

    if (!q && !product_id) {
      return res.json({ data: [] });
    }

    // 1) Find matching products
    let products: any[] = [];
    if (product_id) {
      const p = await dbGet('SELECT id, name, sku, standard_cost FROM products WHERE id = ?', [product_id]);
      if (p) products = [p];
    } else {
      products = await dbAll(
        `SELECT id, name, sku, standard_cost FROM products
         WHERE name LIKE ? OR sku LIKE ?
         ORDER BY name LIMIT 10`,
        [`%${q}%`, `%${q}%`]
      ) as any[];
    }

    if (products.length === 0) {
      return res.json({ data: [] });
    }

    const results: any[] = [];

    for (const prod of products) {
      // 2) Vendor prices
      const vendorPrices = await dbAll(
        `SELECT vp.price, vp.currency, vp.effective_date, vp.valid_until,
                v.name AS vendor_name, v.code AS vendor_code
         FROM vendor_prices vp
         LEFT JOIN vendors v ON vp.vendor_id = v.id
         WHERE vp.product_id = ?
         ORDER BY vp.effective_date DESC
         LIMIT 5`,
        [prod.id]
      ) as any[];

      // 3) PO history prices
      const poHistory = await dbAll(
        `SELECT poi.unit_price, poi.quantity, po.expected_date AS po_date,
                v.name AS vendor_name
         FROM purchase_order_items poi
         JOIN purchase_orders po ON poi.purchase_order_id = po.id
         LEFT JOIN vendors v ON po.vendor_id = v.id
         WHERE poi.product_id = ?
         ORDER BY po.created_at DESC
         LIMIT 5`,
        [prod.id]
      ) as any[];

      // 4) Stats
      const stats = await dbGet(
        `SELECT COUNT(*) AS count, AVG(poi.unit_price) AS avg_price,
                MIN(poi.unit_price) AS min_price, MAX(poi.unit_price) AS max_price
         FROM purchase_order_items poi
         WHERE poi.product_id = ?`,
        [prod.id]
      ) as any;

      results.push({
        product_id: prod.id,
        product_name: prod.name,
        sku: prod.sku,
        standard_cost: prod.standard_cost || 0,
        vendor_prices: vendorPrices,
        po_history: poHistory,
        stats: stats ? {
          count: stats.count || 0,
          avg: Math.round(stats.avg_price || 0),
          min: stats.min_price || 0,
          max: stats.max_price || 0,
        } : null
      });
    }

    res.json({ data: results });
  } catch (error) {
    console.error('Error in price search:', error);
    res.status(500).json({ error: 'Failed to search prices' });
  }
});

// Get last PO unit price for a product (for PR EST.PRICE reference)
router.get('/products/:product_id/last-po-price', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { product_id } = req.params;
    
    // Query last PO unit price for this product (most recent PO)
    const lastPrice = await dbGet(`
      SELECT poi.unit_price, po.expected_date AS po_date
      FROM purchase_order_items poi
      JOIN purchase_orders po ON poi.purchase_order_id = po.id
      WHERE poi.product_id = ?
      ORDER BY po.created_at DESC, po.id DESC
      LIMIT 1
    `, [product_id]);
    
    if (lastPrice) {
      res.json({ 
        success: true, 
        unit_price: lastPrice.unit_price,
        po_date: lastPrice.po_date
      });
    } else {
      res.json({ 
        success: false, 
        message: 'No previous PO price found',
        unit_price: null 
      });
    }
  } catch (error: any) {
    console.error('Error fetching last PO price:', error);
    res.status(500).json({ error: 'Failed to fetch last PO price' });
  }
});

// Vendor Price List
router.get('/vendor-prices', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { vendor_id, product_id } = req.query;
    let query = `
      SELECT vp.*, v.name as vendor_name, v.code as vendor_code,
             p.name as product_name, p.sku as product_sku,
             u.full_name as created_by_name
      FROM vendor_prices vp
      LEFT JOIN vendors v ON vp.vendor_id = v.id
      LEFT JOIN products p ON vp.product_id = p.id
      LEFT JOIN users u ON vp.created_by = u.id
      WHERE 1=1
    `;
    const params: any[] = [];
    
    if (vendor_id) {
      query += ' AND vp.vendor_id = ?';
      params.push(vendor_id);
    }
    if (product_id) {
      query += ' AND vp.product_id = ?';
      params.push(product_id);
    }
    
    query += ' ORDER BY vp.effective_date DESC, vp.created_at DESC';
    
    const prices = await dbAll(query, params);
    res.json({ data: prices });
  } catch (error) {
    console.error('Error fetching vendor prices:', error);
    res.status(500).json({ error: 'Failed to fetch vendor prices' });
  }
});

router.post('/vendor-prices', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { vendor_id, product_id, price, currency, effective_date, valid_until, min_order_qty, lead_time_days, notes } = req.body;
    const userId = (req as any).user?.userId;
    
    if (!vendor_id || !product_id || !price || !effective_date) {
      return res.status(400).json({ error: 'vendor_id, product_id, price, and effective_date are required' });
    }
    
    let createdBy: number | null = null;
    if (userId) {
      const user = await dbGet('SELECT id FROM users WHERE id = ?', [userId]);
      if (user) createdBy = userId;
    }

    console.log('[VendorPrice] userId:', userId, 'createdBy:', createdBy);
    const insertSql = `
      INSERT INTO vendor_prices 
      (vendor_id, product_id, price, currency, effective_date, valid_until, min_order_qty, lead_time_days, notes, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    const insertParams = [
      vendor_id,
      product_id,
      price,
      currency || 'IDR',
      effective_date,
      valid_until || null,
      min_order_qty || null,
      lead_time_days || null,
      notes || null,
      createdBy
    ];

    let result;
    try {
      result = await dbRun(insertSql, insertParams);
    } catch (error: any) {
      if (error?.code === 'ER_NO_REFERENCED_ROW_2' && createdBy) {
        insertParams[9] = null;
        result = await dbRun(insertSql, insertParams);
      } else {
        throw error;
      }
    }
    
    const vpId = result.insertId;
    
    res.status(201).json({ message: 'Vendor price created', data: { id: vpId } });
  } catch (error: any) {
    console.error('Error creating vendor price:', error);
    res.status(500).json({ error: 'Failed to create vendor price' });
  }
});

router.put('/vendor-prices/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { price, currency, effective_date, valid_until, min_order_qty, lead_time_days, notes } = req.body;
    
    await dbRun(`
      UPDATE vendor_prices 
      SET price = ?, currency = ?, effective_date = ?, valid_until = ?, 
          min_order_qty = ?, lead_time_days = ?, notes = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [price, currency, effective_date, valid_until, min_order_qty, lead_time_days, notes, req.params.id]);
    
    res.json({ message: 'Vendor price updated' });
  } catch (error) {
    console.error('Error updating vendor price:', error);
    res.status(500).json({ error: 'Failed to update vendor price' });
  }
});

router.delete('/vendor-prices/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    await dbRun('DELETE FROM vendor_prices WHERE id = ?', [req.params.id]);
    res.json({ message: 'Vendor price deleted' });
  } catch (error) {
    console.error('Error deleting vendor price:', error);
    res.status(500).json({ error: 'Failed to delete vendor price' });
  }
});

// Procurement History (aggregated view of PR → PO → GRN)
router.get('/procurement-history', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { start_date, end_date, vendor_id, product_id, status } = req.query;
    
    // Combine PR, PO, GRN into timeline
    let history: any[] = [];
    
    // PRs
    let prQuery = `
      SELECT 'PR' as doc_type, pr.id, pr.pr_number as doc_number, pr.created_at as doc_date,
             pr.status, pr.approval_status, u.full_name as requester_name,
             NULL as vendor_name, NULL as vendor_id,
             NULL as items_summary
      FROM purchase_requests pr
      LEFT JOIN users u ON pr.requestor_id = u.id
      WHERE 1=1
    `;
    const prParams: any[] = [];
    if (start_date) {
      prQuery += ' AND DATE(pr.created_at) >= ?';
      prParams.push(start_date);
    }
    if (end_date) {
      prQuery += ' AND DATE(pr.created_at) <= ?';
      prParams.push(end_date);
    }
    if (status) {
      prQuery += ' AND pr.status = ?';
      prParams.push(status);
    }
    const prResults = await dbAll(prQuery, prParams);
    history = history.concat(prResults || []);
    
    // POs
    let poQuery = `
      SELECT 'PO' as doc_type, po.id, po.po_number as doc_number, po.created_at as doc_date,
             po.status, po.approval_status, NULL as requester_name,
             v.name as vendor_name, po.vendor_id,
             NULL as items_summary
      FROM purchase_orders po
      LEFT JOIN vendors v ON po.vendor_id = v.id
      WHERE 1=1
    `;
    const poParams: any[] = [];
    if (start_date) {
      poQuery += ' AND DATE(po.created_at) >= ?';
      poParams.push(start_date);
    }
    if (end_date) {
      poQuery += ' AND DATE(po.created_at) <= ?';
      poParams.push(end_date);
    }
    if (vendor_id) {
      poQuery += ' AND po.vendor_id = ?';
      poParams.push(vendor_id);
    }
    if (status) {
      poQuery += ' AND po.status = ?';
      poParams.push(status);
    }
    const poResults = await dbAll(poQuery, poParams);
    history = history.concat(poResults || []);
    
    // GRNs
    let grnQuery = `
      SELECT 'GRN' as doc_type, gr.id, gr.grn_number as doc_number, gr.received_date as doc_date,
             gr.status, NULL as approval_status, NULL as requester_name,
             v.name as vendor_name, po.vendor_id,
             NULL as items_summary
      FROM goods_receipts gr
      LEFT JOIN purchase_orders po ON gr.po_id = po.id
      LEFT JOIN vendors v ON po.vendor_id = v.id
      WHERE 1=1
    `;
    const grnParams: any[] = [];
    if (start_date) {
      grnQuery += ' AND DATE(gr.received_date) >= ?';
      grnParams.push(start_date);
    }
    if (end_date) {
      grnQuery += ' AND DATE(gr.received_date) <= ?';
      grnParams.push(end_date);
    }
    if (vendor_id) {
      grnQuery += ' AND po.vendor_id = ?';
      grnParams.push(vendor_id);
    }
    if (status) {
      grnQuery += ' AND gr.status = ?';
      grnParams.push(status);
    }
    const grnResults = await dbAll(grnQuery, grnParams);
    history = history.concat(grnResults || []);
    
    // Sort by date desc
    history.sort((a, b) => new Date(b.doc_date).getTime() - new Date(a.doc_date).getTime());
    
    res.json({ data: history });
  } catch (error) {
    console.error('Error fetching procurement history:', error);
    res.status(500).json({ error: 'Failed to fetch procurement history' });
  }
});

// Get vendors that can supply a specific product
router.get('/vendors-for-product/:product_id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { product_id } = req.params;
    
    let vendors: any[] = [];
    try {
      vendors = await dbAll(`
        SELECT DISTINCT v.id, v.code, v.name, v.supply_category
        FROM vendor_prices vp
        JOIN vendors v ON vp.vendor_id = v.id
        WHERE vp.product_id = ?
        ORDER BY v.name ASC
      `, [product_id]);
    } catch (tableErr: any) {
      // Table might not exist — try fallback table
      if (tableErr.code === 'ER_NO_SUCH_TABLE') {
        try {
          vendors = await dbAll(`
            SELECT DISTINCT v.id, v.code, v.name, v.supply_category
            FROM material_vendor_prices mvp
            JOIN vendors v ON mvp.vendor_id = v.id
            WHERE mvp.product_id = ?
            ORDER BY v.name ASC
          `, [product_id]);
        } catch {
          // Both tables missing — return empty
          vendors = [];
        }
      } else {
        throw tableErr;
      }
    }
    
    res.json({ data: vendors });
  } catch (error) {
    console.error('Error fetching vendors for product:', error);
    // Return empty array instead of 500 to not block the UI
    res.json({ data: [] });
  }
});

// GET /vendors-for-items?product_ids=1,2,3 - find vendors that have prices for PR items
router.get('/vendors-for-items', authMiddleware, async (req: Request, res: Response) => {
  try {
    const productIdsRaw = (req.query.product_ids as string) || '';
    const productIds = productIdsRaw.split(',').map(Number).filter(n => n > 0);

    if (productIds.length === 0) {
      // No product IDs → return all vendors unfiltered
      const allVendors = await dbAll('SELECT id, code, name, supply_category FROM vendors WHERE active = 1 OR active IS NULL ORDER BY name ASC') as any[];
      return res.json({ data: allVendors.map(v => ({ ...v, matched_items: 0, total_items: 0 })) });
    }

    // For each vendor, count how many of the requested products they have a price for
    const placeholders = productIds.map(() => '?').join(',');
    const rows = await dbAll(`
      SELECT
        v.id, v.code, v.name, v.supply_category,
        COUNT(DISTINCT vp.product_id) AS matched_items,
        ? AS total_items
      FROM vendors v
      LEFT JOIN vendor_prices vp
        ON vp.vendor_id = v.id AND vp.product_id IN (${placeholders})
      GROUP BY v.id, v.code, v.name, v.supply_category
      ORDER BY matched_items DESC, v.name ASC
    `, [productIds.length, ...productIds]) as any[];

    res.json({ data: rows });
  } catch (error) {
    console.error('Error fetching vendors for items:', error);
    res.json({ data: [] });
  }
});


router.get('/vendor-price-details/:vendor_id/:product_id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { vendor_id, product_id } = req.params;
    
    let pricing: any = null;
    try {
      pricing = await dbGet(`
        SELECT vp.id, vp.price, vp.currency, vp.lead_time_days, vp.min_order_qty, vp.effective_date, vp.valid_until
        FROM vendor_prices vp
        WHERE vp.vendor_id = ? AND vp.product_id = ?
        ORDER BY vp.effective_date DESC
        LIMIT 1
      `, [vendor_id, product_id]);
    } catch (tableErr: any) {
      if (tableErr.code === 'ER_NO_SUCH_TABLE') {
        try {
          pricing = await dbGet(`
            SELECT id, price, currency, lead_time_days, min_order_qty, effective_date, valid_until
            FROM material_vendor_prices
            WHERE vendor_id = ? AND product_id = ?
            ORDER BY effective_date DESC
            LIMIT 1
          `, [vendor_id, product_id]);
        } catch {
          pricing = null;
        }
      }
    }
    
    res.json({ data: pricing });
  } catch (error) {
    console.error('Error fetching vendor price details:', error);
    res.json({ data: null });
  }
});

// ==================== MATERIAL VENDOR PRICES (Price Comparison) ====================

// GET /material-prices - list with filters, grouped by material
router.get('/material-prices', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { material_id, source, search, page = '1', limit = '50' } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    let query = `
      SELECT mvp.*, mm.code as material_code, mm.name as material_name, 
             mm.satuan as material_unit, mm.harga as material_base_price,
             v.name as registered_vendor_name
      FROM material_vendor_prices mvp
      JOIN master_materials mm ON mvp.material_id = mm.id
      LEFT JOIN vendors v ON mvp.vendor_id = v.id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (material_id) {
      query += ' AND mvp.material_id = ?';
      params.push(material_id);
    }
    if (source) {
      query += ' AND mvp.source = ?';
      params.push(source);
    }
    if (search) {
      query += ' AND (mm.name LIKE ? OR mvp.vendor_name LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }

    query += ' ORDER BY mm.name ASC, mvp.price ASC';
    query += ` LIMIT ${Number(limit)} OFFSET ${offset}`;

    const prices = await dbAll(query, params);

    // Count total
    let countQuery = `
      SELECT COUNT(*) as total FROM material_vendor_prices mvp
      JOIN master_materials mm ON mvp.material_id = mm.id
      WHERE 1=1
    `;
    const countParams: any[] = [];
    if (material_id) { countQuery += ' AND mvp.material_id = ?'; countParams.push(material_id); }
    if (source) { countQuery += ' AND mvp.source = ?'; countParams.push(source); }
    if (search) { countQuery += ' AND (mm.name LIKE ? OR mvp.vendor_name LIKE ?)'; countParams.push(`%${search}%`, `%${search}%`); }

    const countResult = await dbGet(countQuery, countParams);

    res.json({ data: prices, total: countResult?.total || 0 });
  } catch (error) {
    console.error('Error fetching material vendor prices:', error);
    res.status(500).json({ error: 'Failed to fetch material vendor prices' });
  }
});

// GET /material-prices/comparison - materials with their vendor count + cheapest price
router.get('/material-prices/comparison', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { search, filter = 'all', page = '1', limit = '50' } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    let havingClause = '';
    if (filter === 'complete') havingClause = 'HAVING vendor_count >= 3';
    else if (filter === 'incomplete') havingClause = 'HAVING vendor_count > 0 AND vendor_count < 3';
    else if (filter === 'empty') havingClause = 'HAVING vendor_count = 0';

    let whereClause = 'WHERE mm.is_active = 1';
    const params: any[] = [];
    if (search) {
      whereClause += ' AND (mm.name LIKE ? OR mm.code LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }

    const query = `
      SELECT mm.id, mm.code, mm.name, mm.satuan, mm.harga as base_price, mm.jenis,
             COUNT(mvp.id) as vendor_count,
             MIN(mvp.price) as cheapest_price,
             MAX(mvp.price) as highest_price,
             GROUP_CONCAT(DISTINCT mvp.source) as sources
      FROM master_materials mm
      LEFT JOIN material_vendor_prices mvp ON mm.id = mvp.material_id
      ${whereClause}
      GROUP BY mm.id
      ${havingClause}
      ORDER BY mm.name ASC
      LIMIT ${Number(limit)} OFFSET ${offset}
    `;

    const materials = await dbAll(query, params);

    // Total count
    const countQuery = `
      SELECT COUNT(*) as total FROM (
        SELECT mm.id, COUNT(mvp.id) as vendor_count
        FROM master_materials mm
        LEFT JOIN material_vendor_prices mvp ON mm.id = mvp.material_id
        ${whereClause}
        GROUP BY mm.id
        ${havingClause}
      ) sub
    `;
    const countParams = search ? [`%${search}%`, `%${search}%`] : [];
    const countResult = await dbGet(countQuery, countParams);

    // Summary stats
    const stats = await dbGet(`
      SELECT 
        COUNT(DISTINCT mm.id) as total_materials,
        COUNT(DISTINCT CASE WHEN sub.vc >= 3 THEN mm.id END) as complete_materials,
        COUNT(DISTINCT CASE WHEN sub.vc > 0 AND sub.vc < 3 THEN mm.id END) as incomplete_materials,
        COUNT(DISTINCT CASE WHEN sub.vc = 0 THEN mm.id END) as empty_materials
      FROM master_materials mm
      LEFT JOIN (
        SELECT material_id, COUNT(*) as vc FROM material_vendor_prices GROUP BY material_id
      ) sub ON mm.id = sub.material_id
      WHERE mm.is_active = 1
    `);

    res.json({ data: materials, total: countResult?.total || 0, stats });
  } catch (error) {
    console.error('Error fetching material price comparison:', error);
    res.status(500).json({ error: 'Failed to fetch comparison data' });
  }
});

// GET /material-prices/material/:materialId - all vendor prices for a specific material
router.get('/material-prices/material/:materialId', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { materialId } = req.params;

    const material = await dbGet(`
      SELECT id, code, name, satuan, harga as base_price, jenis
      FROM master_materials WHERE id = ?
    `, [materialId]);

    if (!material) return res.status(404).json({ error: 'Material not found' });

    const prices = await dbAll(`
      SELECT mvp.*, v.name as registered_vendor_name
      FROM material_vendor_prices mvp
      LEFT JOIN vendors v ON mvp.vendor_id = v.id
      WHERE mvp.material_id = ?
      ORDER BY mvp.price ASC
    `, [materialId]);

    res.json({ data: { material, prices } });
  } catch (error) {
    console.error('Error fetching material prices:', error);
    res.status(500).json({ error: 'Failed to fetch material prices' });
  }
});

// POST /material-prices - add vendor price for a material
router.post('/material-prices', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { material_id, vendor_id, vendor_name, source, price, currency, unit, url, rating, contact, location, min_order_qty, lead_time_days, notes, quoted_at, valid_until } = req.body;
    const userId = (req as any).userId || null;

    if (!material_id || !vendor_name || !price) {
      return res.status(400).json({ error: 'material_id, vendor_name, and price are required' });
    }

    // Verify material exists
    const mat = await dbGet('SELECT id FROM master_materials WHERE id = ?', [material_id]);
    if (!mat) return res.status(404).json({ error: 'Material not found' });

    const result = await dbRun(`
      INSERT INTO material_vendor_prices 
      (material_id, vendor_id, vendor_name, source, price, currency, unit, url, rating, contact, location, min_order_qty, lead_time_days, notes, quoted_at, valid_until, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      material_id, vendor_id || null, vendor_name, source || 'offline', price,
      currency || 'IDR', unit || null, url || null, rating || null,
      contact || null, location || null, min_order_qty || null,
      lead_time_days || null, notes || null, quoted_at || null, valid_until || null, userId
    ]);

    res.status(201).json({ message: 'Vendor price added', data: { id: result.insertId } });
  } catch (error) {
    console.error('Error creating material vendor price:', error);
    res.status(500).json({ error: 'Failed to create vendor price' });
  }
});

// PUT /material-prices/:id - update vendor price
router.put('/material-prices/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { vendor_name, source, price, currency, unit, url, rating, contact, location, min_order_qty, lead_time_days, notes, quoted_at, valid_until, is_selected } = req.body;

    await dbRun(`
      UPDATE material_vendor_prices 
      SET vendor_name = ?, source = ?, price = ?, currency = ?, unit = ?, url = ?, rating = ?,
          contact = ?, location = ?, min_order_qty = ?, lead_time_days = ?, notes = ?,
          quoted_at = ?, valid_until = ?, is_selected = ?
      WHERE id = ?
    `, [
      vendor_name, source, price, currency, unit, url || null, rating || null,
      contact || null, location || null, min_order_qty || null,
      lead_time_days || null, notes || null, quoted_at || null, valid_until || null,
      is_selected ? 1 : 0, req.params.id
    ]);

    res.json({ message: 'Vendor price updated' });
  } catch (error) {
    console.error('Error updating material vendor price:', error);
    res.status(500).json({ error: 'Failed to update vendor price' });
  }
});

// DELETE /material-prices/:id
router.delete('/material-prices/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    await dbRun('DELETE FROM material_vendor_prices WHERE id = ?', [req.params.id]);
    res.json({ message: 'Vendor price deleted' });
  } catch (error) {
    console.error('Error deleting material vendor price:', error);
    res.status(500).json({ error: 'Failed to delete vendor price' });
  }
});

// POST /material-prices/:id/select - mark a vendor price as selected for procurement
router.post('/material-prices/:id/select', authMiddleware, async (req: Request, res: Response) => {
  try {
    const priceRecord = await dbGet('SELECT material_id FROM material_vendor_prices WHERE id = ?', [req.params.id]);
    if (!priceRecord) return res.status(404).json({ error: 'Price record not found' });

    // Unselect all others for this material, then select this one
    await dbRun('UPDATE material_vendor_prices SET is_selected = 0 WHERE material_id = ?', [priceRecord.material_id]);
    await dbRun('UPDATE material_vendor_prices SET is_selected = 1 WHERE id = ?', [req.params.id]);

    res.json({ message: 'Vendor price selected' });
  } catch (error) {
    console.error('Error selecting vendor price:', error);
    res.status(500).json({ error: 'Failed to select vendor price' });
  }
});

// ─── PR Item Attachment Upload ─────────────────────────────
router.post('/purchase-requests/:id/item-attachment', authMiddleware, prAttachUpload.single('file'), async (req: Request, res: Response) => {
  try {
    const pr = await dbGet('SELECT id FROM purchase_requests WHERE id = ?', [req.params.id]);
    if (!pr) return res.status(404).json({ error: 'Purchase Request not found' });
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const filePath = '/uploads/pr-attachments/' + req.file.filename;
    res.json({ file_path: filePath, original_name: req.file.originalname });
  } catch (error) {
    console.error('Error uploading PR item attachment:', error);
    res.status(500).json({ error: 'Failed to upload attachment' });
  }
});

// Delete a PR item attachment file from disk
router.delete('/purchase-requests/:id/item-attachment', authMiddleware, async (req: Request, res: Response) => {
  try {
    const filePath = req.query.file_path as string;
    if (!filePath) return res.status(400).json({ error: 'file_path query param required' });
    // Only allow deleting from pr-attachments directory
    if (!filePath.includes('/pr-attachments/')) return res.status(400).json({ error: 'Invalid file path' });
    const absPath = path.join(__dirname, '../../', filePath);
    if (fs.existsSync(absPath)) {
      fs.unlinkSync(absPath);
    }
    res.json({ message: 'Attachment deleted' });
  } catch (error) {
    console.error('Error deleting PR item attachment:', error);
    res.status(500).json({ error: 'Failed to delete attachment' });
  }
});

export default router;
