import express, { Request, Response } from 'express';
import { dbAll, dbGet, dbRun, withTransaction } from '../config/database';
import { businessDate } from '../utils/date.utils';
import { authMiddleware } from '../middleware/auth';
import multer from 'multer';
import path from 'path';
import fs from 'fs';

const router = express.Router();

// Multer setup for fund request document uploads
const frDocDir = path.join(__dirname, '../../uploads/fund-requests');
if (!fs.existsSync(frDocDir)) fs.mkdirSync(frDocDir, { recursive: true });
const frDocStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, frDocDir),
  filename: (_req, file, cb) => cb(null, `${Date.now()}-${file.originalname.replace(/\s+/g, '_')}`),
});
const frDocUpload = multer({ storage: frDocStorage, limits: { fileSize: 15 * 1024 * 1024 } }); // 15MB max

// Multer setup for payment proof uploads
const proofDir = path.join(__dirname, '../../uploads/payment-proofs');
if (!fs.existsSync(proofDir)) fs.mkdirSync(proofDir, { recursive: true });
const proofStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, proofDir),
  filename: (_req, file, cb) => cb(null, `${Date.now()}-${file.originalname.replace(/\s+/g, '_')}`),
});
const proofUpload = multer({ storage: proofStorage, limits: { fileSize: 10 * 1024 * 1024 } }); // 10MB max

// Ensure payment_proofs table exists
(async () => {
  try {
    await dbRun(`CREATE TABLE IF NOT EXISTS payment_proofs (
      id INT AUTO_INCREMENT PRIMARY KEY,
      schedule_id INT NOT NULL,
      source VARCHAR(20) NOT NULL DEFAULT 'po',
      file_name VARCHAR(255) NOT NULL,
      original_name VARCHAR(255) NOT NULL,
      file_path VARCHAR(500) NOT NULL,
      file_size INT DEFAULT 0,
      file_type VARCHAR(100),
      notes TEXT,
      uploaded_by INT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`, []);
  } catch (e: any) {
    if (!e.message?.includes('already exists')) console.error('payment_proofs table:', e.message);
  }
})();

const generateFinanceCode = (prefix: string) => {
  const now = new Date();
  const datePart = now.toISOString().slice(0, 10).replace(/-/g, '');
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `${prefix}-${datePart}-${rand}`;
};

// Recompute parent fund_request.status from child item statuses.
// Rules:
//  - any pending â†’ 'submitted' (still under review)
//  - none pending, all approved â†’ 'approved'
//  - none pending, all rejected â†’ 'rejected'
//  - none pending, mix approved+rejected â†’ 'partially_approved'
const recomputeFundRequestStatus = async (fundRequestId: number, approverId: number | null) => {
  const items = await dbAll(
    'SELECT status FROM fund_request_items WHERE fund_request_id = ?',
    [fundRequestId]
  ) as Array<{ status: string }>;
  if (!items.length) return;

  const pending = items.filter(i => i.status === 'pending').length;
  const approved = items.filter(i => i.status === 'approved').length;
  const rejected = items.filter(i => i.status === 'rejected').length;

  let newStatus = 'submitted';
  if (pending === 0) {
    if (approved > 0 && rejected === 0) newStatus = 'approved';
    else if (rejected > 0 && approved === 0) newStatus = 'rejected';
    else newStatus = 'partially_approved';
  }

  if (newStatus === 'approved' || newStatus === 'partially_approved') {
    await dbRun(
      `UPDATE fund_requests
       SET status = ?, approved_by = ?, approved_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [newStatus, approverId, fundRequestId]
    );
  } else {
    await dbRun('UPDATE fund_requests SET status = ? WHERE id = ?', [newStatus, fundRequestId]);
  }

  if (pending === 0) {
    const apStatus = newStatus === 'rejected' ? 'rejected' : 'approved';
    await dbRun(
      `UPDATE approval_requests
       SET status = ?, completed_at = CURRENT_TIMESTAMP
       WHERE entity_type = 'fund_request' AND entity_id = ? AND status = 'pending'`,
      [apStatus, fundRequestId]
    );
  }
};

// When an FR item linked to a po_schedule_id gets approved, auto-record AP payment.
// Idempotent via fund_request_items.payment_recorded_at.
const autoPayApFromFundRequestItem = async (itemId: number) => {
  const item = await dbGet(
    'SELECT * FROM fund_request_items WHERE id = ?',
    [itemId]
  ) as any;
  if (!item) return { recorded: false, reason: 'item not found' };
  if (item.status !== 'approved') return { recorded: false, reason: 'item not approved' };
  if (item.payment_recorded_at) return { recorded: false, reason: 'already recorded' };
  if (!item.po_schedule_id) return { recorded: false, reason: 'no linked schedule' };

  // Find AP linked to schedule (preferred) or to po_id+schedule
  let ap = await dbGet(
    'SELECT * FROM accounts_payable WHERE po_schedule_id = ? ORDER BY id DESC LIMIT 1',
    [item.po_schedule_id]
  ) as any;
  if (!ap) {
    // Fallback: schedule may have ap_id
    const sched = await dbGet(
      'SELECT * FROM purchase_order_payment_schedules WHERE id = ?',
      [item.po_schedule_id]
    ) as any;
    if (sched && sched.ap_id) {
      ap = await dbGet('SELECT * FROM accounts_payable WHERE id = ?', [sched.ap_id]) as any;
    }
  }
  if (!ap) return { recorded: false, reason: 'no AP linked to schedule' };

  const payAmount = Number(item.amount || 0);
  if (!Number.isFinite(payAmount) || payAmount <= 0) {
    return { recorded: false, reason: 'invalid amount' };
  }
  const newPaid = Number(ap.paid_amount || 0) + payAmount;
  const newStatus = newPaid >= Number(ap.amount || 0) ? 'paid' : 'partial';

  await dbRun(
    'UPDATE accounts_payable SET paid_amount = ?, status = ? WHERE id = ?',
    [newPaid, newStatus, ap.id]
  );
  await dbRun(
    'UPDATE purchase_order_payment_schedules SET paid_amount = ?, status = ?, ap_id = ? WHERE id = ?',
    [newPaid, newStatus, ap.id, item.po_schedule_id]
  );
  await dbRun(
    'UPDATE fund_request_items SET ap_id = ?, payment_recorded_at = CURRENT_TIMESTAMP WHERE id = ?',
    [ap.id, itemId]
  );

  return { recorded: true, ap_id: ap.id, paid_amount: newPaid, status: newStatus };
};

// ===== COGS TRACKING =====

router.get('/cogs', authMiddleware, async (req: Request, res: Response) => {
  try {
    const cogs = await dbAll(
      `SELECT c.*, b.batch_number, p.sku, p.name as product_name
       FROM cogs_tracking c
       LEFT JOIN batches b ON c.batch_id = b.id
       LEFT JOIN products p ON c.product_id = p.id
       ORDER BY c.created_at DESC`
    );
    res.json({ data: cogs });
  } catch (error) {
    console.error('Error fetching COGS:', error);
    res.status(500).json({ error: 'Failed to fetch COGS' });
  }
});

router.get('/cogs/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const cogs = await dbGet(
      `SELECT c.*, b.batch_number, p.sku, p.name as product_name
       FROM cogs_tracking c
       LEFT JOIN batches b ON c.batch_id = b.id
       LEFT JOIN products p ON c.product_id = p.id
       WHERE c.id = ?`,
      [req.params.id]
    );
    if (!cogs) return res.status(404).json({ error: 'COGS record not found' });
    res.json({ data: cogs });
  } catch (error) {
    console.error('Error fetching COGS:', error);
    res.status(500).json({ error: 'Failed to fetch COGS' });
  }
});

router.post('/cogs', authMiddleware, async (req: Request, res: Response) => {
  try {
    const {
      batch_id,
      product_id,
      raw_material_cost,
      labor_cost,
      overhead_cost,
      total_cost,
      quantity_produced,
      cost_per_unit,
      notes,
    } = req.body;

    if (!batch_id || !product_id || total_cost === undefined) {
      return res
        .status(400)
        .json({
          error: 'batch_id, product_id, and total_cost are required',
        });
    }

    const result = await dbRun(
      `INSERT INTO cogs_tracking (batch_id, product_id, raw_material_cost, labor_cost, 
       overhead_cost, total_cost, quantity_produced, cost_per_unit, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        batch_id,
        product_id,
        raw_material_cost || 0,
        labor_cost || 0,
        overhead_cost || 0,
        total_cost,
        quantity_produced || 0,
        cost_per_unit || 0,
        notes || null,
      ]
    );

    res.status(201).json({
      message: 'COGS record created',
      data: { id: result.insertId },
    });
  } catch (error) {
    console.error('Error creating COGS:', error);
    res.status(500).json({ error: 'Failed to create COGS record' });
  }
});

// ===== PROFITABILITY =====

router.get('/profitability', authMiddleware, async (req: Request, res: Response) => {
  try {
    const profitability = await dbAll(
      `SELECT p.*, pr.sku, pr.name as product_name
       FROM profitability_tracking p
       LEFT JOIN products pr ON p.product_id = pr.id
       ORDER BY p.period_date DESC`
    );
    res.json({ data: profitability });
  } catch (error) {
    console.error('Error fetching profitability:', error);
    res.status(500).json({ error: 'Failed to fetch profitability' });
  }
});

router.post('/profitability', authMiddleware, async (req: Request, res: Response) => {
  try {
    const {
      product_id,
      period,
      total_revenue,
      total_cogs,
      gross_profit,
      gross_margin_pct,
      notes,
    } = req.body;

    if (
      !product_id ||
      !period ||
      total_revenue === undefined ||
      total_cogs === undefined
    ) {
      return res.status(400).json({
        error:
          'product_id, period, total_revenue, and total_cogs are required',
      });
    }

    const result = await dbRun(
      `INSERT INTO profitability_tracking (product_id, period, total_revenue, total_cogs, 
       gross_profit, gross_margin_pct, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        product_id,
        period,
        total_revenue,
        total_cogs,
        gross_profit || total_revenue - total_cogs,
        gross_margin_pct || ((total_revenue - total_cogs) / total_revenue) * 100,
        notes || null,
      ]
    );

    res.status(201).json({
      message: 'Profitability record created',
      data: { id: result.insertId },
    });
  } catch (error) {
    console.error('Error creating profitability:', error);
    res.status(500).json({ error: 'Failed to create profitability record' });
  }
});

// ===== ACCOUNTS PAYABLE (AP) =====

router.get('/accounts-payable', authMiddleware, async (req: Request, res: Response) => {
  try {
    const ap = await dbAll(
      `SELECT ap.*, po.po_number, v.name as vendor_name, po.total_amount,
              ps.schedule_no, ps.label as schedule_label, ps.trigger_type
       FROM accounts_payable ap
       LEFT JOIN purchase_orders po ON ap.po_id = po.id
       LEFT JOIN purchase_order_payment_schedules ps ON ap.po_schedule_id = ps.id
       LEFT JOIN vendors v ON po.vendor_id = v.id
       ORDER BY ap.due_date ASC`
    );
    res.json({ data: ap });
  } catch (error) {
    console.error('Error fetching AP:', error);
    res.status(500).json({ error: 'Failed to fetch accounts payable' });
  }
});

router.post('/accounts-payable', authMiddleware, async (req: Request, res: Response) => {
  try {
    const {
      po_id,
      vendor_id,
      po_schedule_id,
      invoice_number,
      invoice_date,
      due_date,
      amount,
      paid_amount,
      status,
      notes,
    } = req.body;

    if (!po_id || !amount) {
      return res
        .status(400)
        .json({ error: 'po_id and amount are required' });
    }

    let effectiveVendorId = vendor_id || null;
    if (!effectiveVendorId && po_id) {
      const poRow = await dbGet('SELECT vendor_id FROM purchase_orders WHERE id = ?', [po_id]) as any;
      effectiveVendorId = poRow?.vendor_id || null;
    }

    const result = await dbRun(
      `INSERT INTO accounts_payable (po_id, vendor_id, po_schedule_id, invoice_number, invoice_date, due_date, 
       amount, paid_amount, status, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        po_id,
        effectiveVendorId,
        po_schedule_id || null,
        invoice_number || null,
        invoice_date || new Date().toISOString(),
        due_date || null,
        amount,
        paid_amount || 0,
        status || 'open',
        notes || null,
      ]
    );

    if (po_schedule_id) {
      await dbRun('UPDATE purchase_order_payment_schedules SET ap_id = ?, status = ? WHERE id = ?', [result.insertId, status || 'open', po_schedule_id]);
    }

    res.status(201).json({
      message: 'AP record created',
      data: { id: result.insertId },
    });
  } catch (error) {
    console.error('Error creating AP:', error);
    res.status(500).json({ error: 'Failed to create accounts payable record' });
  }
});

// ===== ACCOUNTS RECEIVABLE (AR) =====

router.get('/accounts-receivable', authMiddleware, async (req: Request, res: Response) => {
  try {
    const ar = await dbAll(
      `SELECT ar.*, inv.invoice_number, inv.total_amount as amount
       FROM accounts_receivable ar
       LEFT JOIN invoices inv ON ar.invoice_id = inv.id
       ORDER BY ar.due_date ASC`
    );
    res.json({ data: ar });
  } catch (error) {
    console.error('Error fetching AR:', error);
    res.status(500).json({ error: 'Failed to fetch accounts receivable' });
  }
});

router.post('/accounts-receivable', authMiddleware, async (req: Request, res: Response) => {
  try {
    const {
      invoice_id,
      due_date,
      amount,
      paid_amount,
      status,
      notes,
    } = req.body;

    if (!invoice_id || !amount) {
      return res
        .status(400)
        .json({ error: 'invoice_id and amount are required' });
    }

    const result = await dbRun(
      `INSERT INTO accounts_receivable (invoice_id, due_date, amount, paid_amount, status, notes)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        invoice_id,
        due_date || null,
        amount,
        paid_amount || 0,
        status || 'open',
        notes || null,
      ]
    );

    res.status(201).json({
      message: 'AR record created',
      data: { id: result.insertId },
    });
  } catch (error) {
    console.error('Error creating AR:', error);
    res.status(500).json({
      error: 'Failed to create accounts receivable record',
    });
  }
});

// ===== FINANCIAL SUMMARY =====

router.get('/financial-summary', authMiddleware, async (req: Request, res: Response) => {
  try {
    const summary = await dbAll(
      `SELECT fs.*, 
              (SELECT SUM(total_cost) FROM cogs_tracking) as total_cogs,
              (SELECT SUM(total_amount) FROM sales_orders) as total_revenue
       FROM financial_summary fs
       ORDER BY fs.period_date DESC`
    );
    res.json({ data: summary });
  } catch (error) {
    console.error('Error fetching financial summary:', error);
    res
      .status(500)
      .json({ error: 'Failed to fetch financial summary' });
  }
});

// ===== COST ANALYSIS =====

router.get('/cost-analysis', authMiddleware, async (req: Request, res: Response) => {
  try {
    // Per-product cost breakdown with standard vs actual comparison
    const analysis = await dbAll(
      `SELECT p.id as product_id, p.name as product_name, p.sku,
              COUNT(c.id) as batch_count,
              ROUND(AVG(c.raw_material_cost), 2) as avg_material_cost,
              ROUND(AVG(c.labor_cost), 2) as avg_labor_cost,
              ROUND(AVG(c.overhead_cost), 2) as avg_overhead_cost,
              ROUND(AVG(c.total_cost), 2) as avg_total_cost,
              ROUND(AVG(c.cost_per_unit), 2) as avg_cost_per_unit,
              ROUND(MIN(c.cost_per_unit), 2) as min_cost_per_unit,
              ROUND(MAX(c.cost_per_unit), 2) as max_cost_per_unit,
              ROUND(SUM(c.total_cost), 2) as total_cost_sum,
              ROUND(SUM(c.quantity_produced), 0) as total_qty_produced
       FROM products p
       LEFT JOIN cogs_tracking c ON p.id = c.product_id
       GROUP BY p.id, p.name, p.sku
       HAVING batch_count > 0
       ORDER BY total_cost_sum DESC`
    );
    res.json({ success: true, data: analysis });
  } catch (error) {
    console.error('Error fetching cost analysis:', error);
    res.status(500).json({ error: 'Failed to fetch cost analysis' });
  }
});

router.get('/cost-analysis/trends', authMiddleware, async (req: Request, res: Response) => {
  try {
    const trends = await dbAll(
      `SELECT DATE_FORMAT(c.created_at, '%Y-%m') as period,
              ROUND(AVG(c.cost_per_unit), 2) as avg_cost_per_unit,
              ROUND(SUM(c.total_cost), 2) as total_cost,
              COUNT(c.id) as batch_count
       FROM cogs_tracking c
       GROUP BY period
       ORDER BY period DESC
       LIMIT 12`
    );
    res.json({ success: true, data: trends });
  } catch (error) {
    console.error('Error fetching cost trends:', error);
    res.status(500).json({ error: 'Failed to fetch cost trends' });
  }
});

// ===== MARGIN ANALYSIS =====

router.get('/margin-analysis', authMiddleware, async (req: Request, res: Response) => {
  try {
    const margins = await dbAll(
      `SELECT pt.*, pr.name as product_name, pr.sku,
              ROUND(pt.gross_profit, 2) as gross_profit,
              ROUND(pt.gross_margin_pct, 1) as gross_margin_pct
       FROM profitability_tracking pt
       LEFT JOIN products pr ON pt.product_id = pr.id
       ORDER BY pt.gross_margin_pct DESC`
    );
    res.json({ success: true, data: margins });
  } catch (error) {
    console.error('Error fetching margin analysis:', error);
    res.status(500).json({ error: 'Failed to fetch margin analysis' });
  }
});

router.get('/margin-analysis/summary', authMiddleware, async (req: Request, res: Response) => {
  try {
    const summary = await dbAll(
      `SELECT DATE_FORMAT(CONCAT(pt.period, '-01'), '%Y-%m') as period,
              ROUND(SUM(pt.total_revenue), 2) as total_revenue,
              ROUND(SUM(pt.total_cogs), 2) as total_cogs,
              ROUND(SUM(pt.gross_profit), 2) as gross_profit,
              ROUND(AVG(pt.gross_margin_pct), 1) as avg_margin_pct
       FROM profitability_tracking pt
       GROUP BY period
       ORDER BY period DESC
       LIMIT 12`
    );
    const topProducts = await dbAll(
      `SELECT pr.name as product_name, pr.sku,
              ROUND(SUM(pt.total_revenue), 2) as total_revenue,
              ROUND(SUM(pt.gross_profit), 2) as gross_profit,
              ROUND(AVG(pt.gross_margin_pct), 1) as avg_margin_pct
       FROM profitability_tracking pt
       LEFT JOIN products pr ON pt.product_id = pr.id
       GROUP BY pt.product_id, pr.name, pr.sku
       ORDER BY gross_profit DESC
       LIMIT 10`
    );
    res.json({ success: true, data: { periods: summary, topProducts } });
  } catch (error) {
    console.error('Error fetching margin summary:', error);
    res.status(500).json({ error: 'Failed to fetch margin summary' });
  }
});
// ===== AP PAYMENT =====

/**
 * Catat pembayaran AP/AR sebagai SATU unit (P1 TRANSACTION/FINANCE).
 *
 * Sebelumnya ada dua jalur yang berbeda perlakuan untuk transaksi bank yang sama:
 *
 *   - `PUT .../:id/pay`      : membaca `paid_amount`, menambah nominal klien,
 *                              lalu UPDATE — tanpa transaction, tanpa lock, dan
 *                              TANPA menulis event sama sekali.
 *   - `POST .../:id/payments`: INSERT event lalu UPDATE aggregate dan jadwal
 *                              lewat autocommit terpisah.
 *
 * Akibatnya: dua permintaan paralel sama-sama membaca saldo lama dan saling
 * menimpa (satu pembayaran hilang); kegagalan setelah INSERT meninggalkan
 * history tanpa aggregate; dan tidak ada batas `pembayaran <= sisa tagihan`,
 * jadi kelebihan bayar diterima lalu ditandai `paid`.
 *
 * Sekarang keduanya memakai jalur ini: lock baris, validasi sisa tagihan, tulis
 * event, perbarui aggregate dan jadwal — satu transaction.
 */
const catatPembayaran = async (opts: {
  jenis: 'AP' | 'AR';
  id: any;
  jumlah: number;
  payment_date?: string;
  payment_method?: string;
  reference_number?: string | null;
  notes?: string | null;
  userId?: any;
}): Promise<any> => {
  const tabel = opts.jenis === 'AP' ? 'accounts_payable' : 'accounts_receivable';
  const tabelEvent = opts.jenis === 'AP' ? 'ap_payments' : 'ar_payments';
  const kolomFk = opts.jenis === 'AP' ? 'ap_id' : 'ar_id';

  if (!Number.isFinite(opts.jumlah) || opts.jumlah <= 0) {
    return { error: 400, body: { error: 'Nominal pembayaran harus lebih dari nol' } };
  }

  return withTransaction(async tx => {
    const row: any = await tx.get(`SELECT * FROM ${tabel} WHERE id = ? FOR UPDATE`, [opts.id]);
    if (!row) return { error: 404, body: { error: `${opts.jenis} tidak ditemukan` } };

    const tagihan = Number(row.amount || 0);
    const sudahDibayar = Number(row.paid_amount || 0);
    const sisa = Math.round((tagihan - sudahDibayar) * 100) / 100;

    if (sisa <= 0) {
      return {
        error: 409,
        body: { error: `${opts.jenis} ini sudah lunas.`, code: 'ALREADY_SETTLED', sisa: 0 },
      };
    }

    // Batas yang sebelumnya tidak ada sama sekali: kelebihan bayar diterima dan
    // tetap ditandai `paid`, sehingga rekonsiliasi tidak bisa menentukan angka
    // mana yang sah.
    if (opts.jumlah > sisa + 0.005) {
      return {
        error: 400,
        body: {
          error: `Pembayaran ${opts.jumlah} melebihi sisa tagihan ${sisa}.`,
          code: 'PAYMENT_EXCEEDS_OUTSTANDING',
          sisa,
        },
      };
    }

    // Idempotensi: nomor referensi yang sama untuk tagihan yang sama tidak
    // dicatat dua kali — retry jaringan tidak boleh menggandakan pembayaran.
    if (opts.reference_number) {
      const kembar: any = await tx.get(
        `SELECT id, amount FROM ${tabelEvent} WHERE ${kolomFk} = ? AND reference_number = ? LIMIT 1`,
        [opts.id, opts.reference_number]
      );
      if (kembar) {
        return {
          error: 409,
          body: {
            error: `Pembayaran dengan referensi "${opts.reference_number}" sudah tercatat.`,
            code: 'DUPLICATE_PAYMENT_REFERENCE',
            existing_id: kembar.id,
          },
        };
      }
    }

    const eventResult = await tx.run(
      `INSERT INTO ${tabelEvent} (${kolomFk}, payment_date, amount, payment_method, reference_number, notes, created_by)
       VALUES (?,?,?,?,?,?,?)`,
      [opts.id, opts.payment_date || businessDate(), opts.jumlah,
        opts.payment_method || 'Transfer', opts.reference_number || null,
        opts.notes || null, opts.userId || null]
    );

    const totalBaru = Math.round((sudahDibayar + opts.jumlah) * 100) / 100;
    const statusBaru = totalBaru >= tagihan ? 'paid' : 'partial';

    await tx.run(`UPDATE ${tabel} SET paid_amount = ?, status = ? WHERE id = ?`,
      [totalBaru, statusBaru, opts.id]);

    if (opts.jenis === 'AP' && row.po_schedule_id) {
      await tx.run(
        'UPDATE purchase_order_payment_schedules SET paid_amount = ?, status = ?, ap_id = ? WHERE id = ?',
        [totalBaru, statusBaru, opts.id, row.po_schedule_id]
      );
    }

    return {
      ok: true as const,
      data: {
        payment_id: eventResult.insertId,
        paid_amount: totalBaru,
        status: statusBaru,
        sisa: Math.round((tagihan - totalBaru) * 100) / 100,
      },
    };
  });
};

router.put('/accounts-payable/:id/pay', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { amount } = req.body;
    const payload = { payment_method: undefined, reference_number: undefined, notes: undefined, payment_date: undefined } as any;

    // P1: `/pay` dulu hanya mengubah aggregate TANPA menulis event apa pun,
    // sementara `/payments` menulis event lalu memperbarui aggregate terpisah.
    // Keduanya kini melewati jalur yang sama, jadi satu transaksi bank selalu
    // menghasilkan satu catatan yang konsisten.
    const hasil = await catatPembayaran({
      jenis: 'AP', id: req.params.id, jumlah: Number(amount),
      ...payload, userId: (req as any).userId,
    });

    if ('error' in hasil) return res.status(hasil.error).json(hasil.body);
    res.json({ success: true, message: 'Payment recorded', data: hasil.data });
  } catch (error) {
    console.error('Error recording AP payment:', error);
    res.status(500).json({ error: 'Failed to record payment' });
  }
});

// ===== AR PAYMENT =====

router.put('/accounts-receivable/:id/pay', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { amount } = req.body;
    const payload = { payment_method: undefined, reference_number: undefined, notes: undefined, payment_date: undefined } as any;

    // P1: `/pay` dulu hanya mengubah aggregate TANPA menulis event apa pun,
    // sementara `/payments` menulis event lalu memperbarui aggregate terpisah.
    // Keduanya kini melewati jalur yang sama, jadi satu transaksi bank selalu
    // menghasilkan satu catatan yang konsisten.
    const hasil = await catatPembayaran({
      jenis: 'AR', id: req.params.id, jumlah: Number(amount),
      ...payload, userId: (req as any).userId,
    });

    if ('error' in hasil) return res.status(hasil.error).json(hasil.body);
    res.json({ success: true, message: 'Payment recorded', data: hasil.data });
  } catch (error) {
    console.error('Error recording AR payment:', error);
    res.status(500).json({ error: 'Failed to record payment' });
  }
});

// ===== FUND REQUESTS =====

// GET /fund-requests â€” list all fund requests with item counts
router.get('/fund-requests', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { status } = req.query;
    let sql = `
      SELECT fr.*,
             u.full_name as submitter_name,
             (SELECT COUNT(*) FROM fund_request_items WHERE fund_request_id = fr.id) as item_count,
             (SELECT COUNT(*) FROM fund_request_items WHERE fund_request_id = fr.id AND status = 'pending') as pending_count,
             (SELECT COUNT(*) FROM fund_request_items WHERE fund_request_id = fr.id AND status = 'approved') as approved_count,
             (SELECT COUNT(*) FROM fund_request_items WHERE fund_request_id = fr.id AND status = 'rejected') as rejected_count,
             po.po_number, v.name as vendor_name
      FROM fund_requests fr
      LEFT JOIN users u ON fr.requester_id = u.id
      LEFT JOIN purchase_orders po ON fr.po_id = po.id
      LEFT JOIN vendors v ON fr.vendor_id = v.id`;
    const params: any[] = [];
    if (status && status !== 'all') {
      sql += ' WHERE fr.status = ?';
      params.push(status);
    }
    sql += ' ORDER BY fr.created_at DESC';
    const rows = await dbAll(sql, params);
    res.json({ data: rows });
  } catch (error) {
    console.error('Error fetching fund requests:', error);
    res.status(500).json({ error: 'Failed to fetch fund requests' });
  }
});

// GET /fund-requests/:id â€” detail with items
router.get('/fund-requests/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const fr = await dbGet(
      `SELECT fr.*, u.full_name as submitter_name,
              po.po_number, v.name as vendor_name
       FROM fund_requests fr
       LEFT JOIN users u ON fr.requester_id = u.id
       LEFT JOIN purchase_orders po ON fr.po_id = po.id
       LEFT JOIN vendors v ON fr.vendor_id = v.id
       WHERE fr.id = ?`,
      [req.params.id]
    );
    if (!fr) return res.status(404).json({ error: 'Fund request not found' });

    const items = await dbAll(
      `SELECT fri.*,
              po.po_number,
              v.name as vendor_name,
              ps.schedule_no, ps.label as schedule_label, ps.trigger_type
       FROM fund_request_items fri
       LEFT JOIN purchase_orders po ON fri.po_id = po.id
       LEFT JOIN vendors v ON fri.vendor_id = v.id
       LEFT JOIN purchase_order_payment_schedules ps ON fri.po_schedule_id = ps.id
       WHERE fri.fund_request_id = ?
       ORDER BY fri.id ASC`,
      [req.params.id]
    );

    res.json({ data: { ...(fr as any), items } });
  } catch (error) {
    console.error('Error fetching fund request detail:', error);
    res.status(500).json({ error: 'Failed to fetch fund request' });
  }
});

// POST /fund-requests â€” create new fund request with items
router.post('/fund-requests', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { purpose, needed_date, notes, cash_account, cash_account_note, items } = req.body;
    if (!purpose || !needed_date) {
      return res.status(400).json({ error: 'purpose and needed_date are required' });
    }
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'At least one transaction item is required' });
    }

    const requestNumber = generateFinanceCode('FR');
    const totalAmount = items.reduce((s: number, it: any) => s + Number(it.amount || 0), 0);
    const userId = (req as any).userId || null;

    // Use first item's po_id/vendor_id as header defaults
    const headerPoId = items[0]?.po_id || null;
    const headerVendorId = items[0]?.vendor_id || null;
    const headerScheduleId = items.length === 1 ? (items[0]?.po_schedule_id || null) : null;

    const result = await dbRun(
      `INSERT INTO fund_requests 
       (request_number, request_date, po_id, po_schedule_id, vendor_id, amount, needed_date, purpose, status, requester_id, notes, cash_account, cash_account_note)
       VALUES (?, CURDATE(), ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?)`,
      [requestNumber, headerPoId, headerScheduleId, headerVendorId, totalAmount, needed_date, purpose, userId, notes || null, cash_account || null, cash_account_note || null]
    );
    const frId = result.insertId;

    // Insert items
    for (const item of items) {
      await dbRun(
        `INSERT INTO fund_request_items (fund_request_id, po_id, po_schedule_id, vendor_id, description, amount, status)
         VALUES (?, ?, ?, ?, ?, ?, 'pending')`,
        [frId, item.po_id || null, item.po_schedule_id || null, item.vendor_id || null, item.description || null, Number(item.amount || 0)]
      );
    }

    res.json({ data: { id: frId, request_number: requestNumber } });
  } catch (error) {
    console.error('Error creating fund request:', error);
    res.status(500).json({ error: 'Failed to create fund request' });
  }
});

// PUT /fund-requests/:id â€” update draft fund request
router.put('/fund-requests/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const fr = await dbGet('SELECT * FROM fund_requests WHERE id = ?', [req.params.id]) as any;
    if (!fr) return res.status(404).json({ error: 'Fund request not found' });
    if (fr.status !== 'draft') return res.status(400).json({ error: 'Only draft requests can be edited' });

    const { purpose, needed_date, notes, cash_account, cash_account_note, items } = req.body;
    const totalAmount = (items || []).reduce((s: number, it: any) => s + Number(it.amount || 0), 0);
    const headerPoId = items?.[0]?.po_id || null;
    const headerVendorId = items?.[0]?.vendor_id || null;

    await dbRun(
      `UPDATE fund_requests SET purpose = ?, needed_date = ?, notes = ?, cash_account = ?, cash_account_note = ?,
       po_id = ?, vendor_id = ?, amount = ?
       WHERE id = ?`,
      [purpose, needed_date, notes || null, cash_account || null, cash_account_note || null, headerPoId, headerVendorId, totalAmount, req.params.id]
    );

    // Replace items
    if (items && Array.isArray(items)) {
      await dbRun('DELETE FROM fund_request_items WHERE fund_request_id = ?', [req.params.id]);
      for (const item of items) {
        await dbRun(
          `INSERT INTO fund_request_items (fund_request_id, po_id, po_schedule_id, vendor_id, description, amount, status)
           VALUES (?, ?, ?, ?, ?, ?, 'pending')`,
          [req.params.id, item.po_id || null, item.po_schedule_id || null, item.vendor_id || null, item.description || null, Number(item.amount || 0)]
        );
      }
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error updating fund request:', error);
    res.status(500).json({ error: 'Failed to update fund request' });
  }
});

// PUT /fund-requests/:id/submit â€” submit for approval
router.put('/fund-requests/:id/submit', authMiddleware, async (req: Request, res: Response) => {
  try {
    const fr = await dbGet('SELECT * FROM fund_requests WHERE id = ?', [req.params.id]) as any;
    if (!fr) return res.status(404).json({ error: 'Fund request not found' });
    if (fr.status !== 'draft') return res.status(400).json({ error: 'Only draft requests can be submitted' });

    await dbRun(
      `UPDATE fund_requests SET status = 'submitted', submitted_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [req.params.id]
    );

    // Create approval request
    try {
      await dbRun(
        `INSERT INTO approval_requests (entity_type, entity_id, requester_id, status, created_at)
         VALUES ('fund_request', ?, ?, 'pending', CURRENT_TIMESTAMP)`,
        [req.params.id, (req as any).userId || null]
      );
    } catch (e) {
      console.warn('Could not create approval_request for FR:', e);
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error submitting fund request:', error);
    res.status(500).json({ error: 'Failed to submit fund request' });
  }
});

// PUT /fund-requests/:id/approve â€” approve all pending items
router.put('/fund-requests/:id/approve', authMiddleware, async (req: Request, res: Response) => {
  try {
    const fr = await dbGet('SELECT * FROM fund_requests WHERE id = ?', [req.params.id]) as any;
    if (!fr) return res.status(404).json({ error: 'Fund request not found' });
    if (fr.status !== 'submitted' && fr.status !== 'partially_approved') {
      return res.status(400).json({ error: 'Only submitted requests can be approved' });
    }

    const approverId = (req as any).userId || null;

    // Approve all pending items
    const pendingItems = await dbAll(
      'SELECT id FROM fund_request_items WHERE fund_request_id = ? AND status = ?',
      [req.params.id, 'pending']
    ) as Array<{ id: number }>;

    for (const item of pendingItems) {
      await dbRun(
        `UPDATE fund_request_items SET status = 'approved', approved_by = ?, approved_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [approverId, item.id]
      );
      await autoPayApFromFundRequestItem(item.id);
    }

    await recomputeFundRequestStatus(Number(req.params.id), approverId);
    res.json({ success: true });
  } catch (error) {
    console.error('Error approving fund request:', error);
    res.status(500).json({ error: 'Failed to approve fund request' });
  }
});

// PUT /fund-requests/:id/reject â€” reject all pending items
router.put('/fund-requests/:id/reject', authMiddleware, async (req: Request, res: Response) => {
  try {
    const fr = await dbGet('SELECT * FROM fund_requests WHERE id = ?', [req.params.id]) as any;
    if (!fr) return res.status(404).json({ error: 'Fund request not found' });
    if (fr.status !== 'submitted' && fr.status !== 'partially_approved') {
      return res.status(400).json({ error: 'Only submitted requests can be rejected' });
    }

    const { reason } = req.body;
    const approverId = (req as any).userId || null;

    await dbRun(
      `UPDATE fund_request_items SET status = 'rejected', rejection_reason = ?, approved_by = ?, approved_at = CURRENT_TIMESTAMP
       WHERE fund_request_id = ? AND status = 'pending'`,
      [reason || 'Rejected', approverId, req.params.id]
    );

    await recomputeFundRequestStatus(Number(req.params.id), approverId);
    res.json({ success: true });
  } catch (error) {
    console.error('Error rejecting fund request:', error);
    res.status(500).json({ error: 'Failed to reject fund request' });
  }
});

// PUT /fund-requests/:id/items/:itemId/approve â€” approve single item
router.put('/fund-requests/:id/items/:itemId/approve', authMiddleware, async (req: Request, res: Response) => {
  try {
    const item = await dbGet(
      'SELECT * FROM fund_request_items WHERE id = ? AND fund_request_id = ?',
      [req.params.itemId, req.params.id]
    ) as any;
    if (!item) return res.status(404).json({ error: 'Item not found' });
    if (item.status !== 'pending') return res.status(400).json({ error: 'Item is not pending' });

    const approverId = (req as any).userId || null;
    await dbRun(
      `UPDATE fund_request_items SET status = 'approved', approved_by = ?, approved_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [approverId, req.params.itemId]
    );

    await autoPayApFromFundRequestItem(Number(req.params.itemId));
    await recomputeFundRequestStatus(Number(req.params.id), approverId);
    res.json({ success: true });
  } catch (error) {
    console.error('Error approving fund request item:', error);
    res.status(500).json({ error: 'Failed to approve item' });
  }
});

// PUT /fund-requests/:id/items/:itemId/reject â€” reject single item
router.put('/fund-requests/:id/items/:itemId/reject', authMiddleware, async (req: Request, res: Response) => {
  try {
    const item = await dbGet(
      'SELECT * FROM fund_request_items WHERE id = ? AND fund_request_id = ?',
      [req.params.itemId, req.params.id]
    ) as any;
    if (!item) return res.status(404).json({ error: 'Item not found' });
    if (item.status !== 'pending') return res.status(400).json({ error: 'Item is not pending' });

    const { reason } = req.body;
    const approverId = (req as any).userId || null;
    await dbRun(
      `UPDATE fund_request_items SET status = 'rejected', rejection_reason = ?, approved_by = ?, approved_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [reason || 'Rejected', approverId, req.params.itemId]
    );

    await recomputeFundRequestStatus(Number(req.params.id), approverId);
    res.json({ success: true });
  } catch (error) {
    console.error('Error rejecting fund request item:', error);
    res.status(500).json({ error: 'Failed to reject item' });
  }
});

// DELETE /fund-requests/:id â€” delete fund request (admin: any status, user: draft/rejected only)
router.delete('/fund-requests/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userLevel = (req as any).user?.userLevel || 1;
    const fr = await dbGet('SELECT * FROM fund_requests WHERE id = ?', [req.params.id]) as any;
    if (!fr) return res.status(404).json({ error: 'Fund request not found' });

    // Admin (level >= 4) can delete any status; others only draft/rejected
    if (userLevel < 4 && !['draft', 'rejected'].includes(fr.status)) {
      return res.status(400).json({ error: 'Hanya admin yang dapat menghapus Fund Request yang sudah disubmit/approved' });
    }

    await dbRun('DELETE FROM fund_request_items WHERE fund_request_id = ?', [req.params.id]);
    await dbRun('DELETE FROM fund_requests WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting fund request:', error);
    res.status(500).json({ error: 'Failed to delete fund request' });
  }
});

// ===== ENHANCED AP ENDPOINTS =====

// GET /accounts-payable/:id — detail with payment history
router.get('/accounts-payable/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const ap = await dbGet(
      `SELECT ap.*, po.po_number, po.total_amount as po_total, v.name as vendor_name,
              ps.schedule_no, ps.label as schedule_label, ps.trigger_type,
              proj.name as project_name
       FROM accounts_payable ap
       LEFT JOIN purchase_orders po ON ap.po_id = po.id
       LEFT JOIN purchase_order_payment_schedules ps ON ap.po_schedule_id = ps.id
       LEFT JOIN vendors v ON ap.vendor_id = v.id
       LEFT JOIN projects proj ON ap.project_id = proj.id
       WHERE ap.id = ?`, [req.params.id]
    ) as any;
    if (!ap) return res.status(404).json({ error: 'AP not found' });
    const payments = await dbAll('SELECT * FROM ap_payments WHERE ap_id = ? ORDER BY payment_date DESC', [req.params.id]);
    res.json({ data: { ...ap, payments } });
  } catch (e) { res.status(500).json({ error: 'Failed to fetch AP detail' }); }
});

// PUT /accounts-payable/:id — update AP record
router.put('/accounts-payable/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { vendor_invoice_number, invoice_date, due_date, amount, description, project_id, notes } = req.body;
    await dbRun(
      `UPDATE accounts_payable SET vendor_invoice_number=?, invoice_date=?, due_date=?, amount=?,
       description=?, project_id=?, notes=? WHERE id=?`,
      [vendor_invoice_number||null, invoice_date||null, due_date||null, amount, description||null, project_id||null, notes||null, req.params.id]
    );
    res.json({ success: true, message: 'AP updated' });
  } catch (e) { res.status(500).json({ error: 'Failed to update AP' }); }
});

// POST /accounts-payable/:id/payments — record payment
router.post('/accounts-payable/:id/payments', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { amount, payment_date, payment_method, reference_number, notes } = req.body;
    const payload = { payment_date, payment_method, reference_number, notes } as any;

    // P1: `/pay` dulu hanya mengubah aggregate TANPA menulis event apa pun,
    // sementara `/payments` menulis event lalu memperbarui aggregate terpisah.
    // Keduanya kini melewati jalur yang sama, jadi satu transaksi bank selalu
    // menghasilkan satu catatan yang konsisten.
    const hasil = await catatPembayaran({
      jenis: 'AP', id: req.params.id, jumlah: Number(amount),
      ...payload, userId: (req as any).userId,
    });

    if ('error' in hasil) return res.status(hasil.error).json(hasil.body);
    res.json({ success: true, message: 'Payment recorded', data: hasil.data });
  } catch (error) {
    console.error('Error recording AP payment:', error);
    res.status(500).json({ error: 'Failed to record payment' });
  }
});

// GET /accounts-payable/aging — AP aging buckets
router.get('/ap-aging', authMiddleware, async (req: Request, res: Response) => {
  try {
    const rows = await dbAll(
      `SELECT ap.id, v.name as vendor_name, ap.invoice_number, ap.vendor_invoice_number,
              ap.amount, ap.paid_amount, (ap.amount - ap.paid_amount) as outstanding,
              ap.due_date, ap.status,
              DATEDIFF(CURDATE(), ap.due_date) as days_overdue,
              po.po_number, proj.name as project_name
       FROM accounts_payable ap
       LEFT JOIN vendors v ON ap.vendor_id = v.id
       LEFT JOIN purchase_orders po ON ap.po_id = po.id
       LEFT JOIN projects proj ON ap.project_id = proj.id
       WHERE ap.status != 'paid'
       ORDER BY ap.due_date ASC`
    ) as any[];
    const bucket = (d: number) => d <= 0 ? 'current' : d <= 30 ? '1-30' : d <= 60 ? '31-60' : d <= 90 ? '61-90' : '90+';
    const aging = rows.map(r => ({ ...r, bucket: bucket(Number(r.days_overdue||0)) }));
    res.json({ data: aging });
  } catch (e) { res.status(500).json({ error: 'Failed to fetch AP aging' }); }
});

// ===== ENHANCED AR ENDPOINTS =====

// POST /accounts-receivable — create AR manually
router.post('/accounts-receivable/create', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { customer_id, project_id, invoice_number, invoice_date, due_date, amount, tax_percent, description, notes } = req.body;
    if (!customer_id || !amount) return res.status(400).json({ error: 'customer_id and amount required' });
    const taxPct = Number(tax_percent||11);
    const taxAmt = Number(amount) * taxPct / 100;
    const autoInvNum = invoice_number || `INV-${new Date().getFullYear()}-${String(Date.now()).slice(-5)}`;
    const result = await dbRun(
      `INSERT INTO accounts_receivable (customer_id, project_id, invoice_number, invoice_date, due_date,
       amount, paid_amount, tax_percent, tax_amount, status, description, notes)
       VALUES (?,?,?,?,?,?,0,?,?,?,?,?)`,
      [customer_id, project_id||null, autoInvNum, invoice_date||new Date().toISOString().slice(0,10),
       due_date||null, Number(amount), taxPct, taxAmt, 'open', description||null, notes||null]
    );
    res.status(201).json({ success: true, data: { id: result.insertId, invoice_number: autoInvNum } });
  } catch (e) { res.status(500).json({ error: 'Failed to create AR' }); }
});

// GET /accounts-receivable/:id — AR detail with payment history
router.get('/accounts-receivable/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const ar = await dbGet(
      `SELECT ar.*, c.name as customer_name, c.email as customer_email,
              proj.name as project_name, proj.code as project_code
       FROM accounts_receivable ar
       LEFT JOIN clients c ON ar.customer_id = c.id
       LEFT JOIN projects proj ON ar.project_id = proj.id
       WHERE ar.id=?`, [req.params.id]
    ) as any;
    if (!ar) return res.status(404).json({ error: 'AR not found' });
    const payments = await dbAll('SELECT * FROM ar_payments WHERE ar_id=? ORDER BY payment_date DESC', [req.params.id]);
    res.json({ data: { ...ar, payments } });
  } catch (e) { res.status(500).json({ error: 'Failed to fetch AR detail' }); }
});

// PUT /accounts-receivable/:id — update AR record
router.put('/accounts-receivable/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { invoice_number, invoice_date, due_date, amount, tax_percent, description, notes, status } = req.body;
    const taxPct = Number(tax_percent||11);
    const taxAmt = Number(amount||0) * taxPct / 100;
    await dbRun(
      `UPDATE accounts_receivable SET invoice_number=?, invoice_date=?, due_date=?, amount=?,
       tax_percent=?, tax_amount=?, description=?, notes=?, status=? WHERE id=?`,
      [invoice_number||null, invoice_date||null, due_date||null, amount, taxPct, taxAmt, description||null, notes||null, status||'open', req.params.id]
    );
    res.json({ success: true, message: 'AR updated' });
  } catch (e) { res.status(500).json({ error: 'Failed to update AR' }); }
});

// POST /accounts-receivable/:id/payments — record collection
router.post('/accounts-receivable/:id/payments', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { amount, payment_date, payment_method, reference_number, notes } = req.body;
    const payload = { payment_date, payment_method, reference_number, notes } as any;

    // P1: `/pay` dulu hanya mengubah aggregate TANPA menulis event apa pun,
    // sementara `/payments` menulis event lalu memperbarui aggregate terpisah.
    // Keduanya kini melewati jalur yang sama, jadi satu transaksi bank selalu
    // menghasilkan satu catatan yang konsisten.
    const hasil = await catatPembayaran({
      jenis: 'AR', id: req.params.id, jumlah: Number(amount),
      ...payload, userId: (req as any).userId,
    });

    if ('error' in hasil) return res.status(hasil.error).json(hasil.body);
    res.json({ success: true, message: 'Payment recorded', data: hasil.data });
  } catch (error) {
    console.error('Error recording AR payment:', error);
    res.status(500).json({ error: 'Failed to record payment' });
  }
});

// GET /ar-aging — AR aging buckets
router.get('/ar-aging', authMiddleware, async (req: Request, res: Response) => {
  try {
    const rows = await dbAll(
      `SELECT ar.id, c.name as customer_name, ar.invoice_number,
              ar.amount, ar.paid_amount, (ar.amount - ar.paid_amount) as outstanding,
              ar.due_date, ar.status, ar.tax_percent, ar.tax_amount,
              DATEDIFF(CURDATE(), ar.due_date) as days_overdue,
              proj.name as project_name
       FROM accounts_receivable ar
       LEFT JOIN clients c ON ar.customer_id = c.id
       LEFT JOIN projects proj ON ar.project_id = proj.id
       WHERE ar.status != 'paid'
       ORDER BY ar.due_date ASC`
    ) as any[];
    const bucket = (d: number) => d <= 0 ? 'current' : d <= 30 ? '1-30' : d <= 60 ? '31-60' : d <= 90 ? '61-90' : '90+';
    const aging = rows.map(r => ({ ...r, bucket: bucket(Number(r.days_overdue||0)) }));
    res.json({ data: aging });
  } catch (e) { res.status(500).json({ error: 'Failed to fetch AR aging' }); }
});

// ===== FINANCE DASHBOARD =====

router.get('/dashboard', authMiddleware, async (req: Request, res: Response) => {
  try {
    const [apSummary, arSummary, recentAP, recentAR] = await Promise.all([
      dbGet(`SELECT
        SUM(amount) as total_payable,
        SUM(paid_amount) as total_paid,
        SUM(amount - paid_amount) as total_outstanding,
        COUNT(CASE WHEN status='paid' THEN 1 END) as paid_count,
        COUNT(CASE WHEN status!='paid' THEN 1 END) as open_count,
        COUNT(CASE WHEN status!='paid' AND due_date < CURDATE() THEN 1 END) as overdue_count
        FROM accounts_payable`, []),
      dbGet(`SELECT
        SUM(amount) as total_receivable,
        SUM(paid_amount) as total_collected,
        SUM(amount - paid_amount) as total_outstanding,
        COUNT(CASE WHEN status='paid' THEN 1 END) as paid_count,
        COUNT(CASE WHEN status!='paid' THEN 1 END) as open_count,
        COUNT(CASE WHEN status!='paid' AND due_date < CURDATE() THEN 1 END) as overdue_count
        FROM accounts_receivable`, []),
      dbAll(`SELECT ap.*, v.name as vendor_name, po.po_number
             FROM accounts_payable ap
             LEFT JOIN vendors v ON ap.vendor_id = v.id
             LEFT JOIN purchase_orders po ON ap.po_id = po.id
             WHERE ap.status != 'paid' ORDER BY ap.due_date ASC LIMIT 5`, []),
      dbAll(`SELECT ar.*, c.name as customer_name
             FROM accounts_receivable ar
             LEFT JOIN clients c ON ar.customer_id = c.id
             WHERE ar.status != 'paid' ORDER BY ar.due_date ASC LIMIT 5`, []),
    ]);
    res.json({ data: { ap: apSummary, ar: arSummary, recent_ap: recentAP, recent_ar: recentAR } });
  } catch (e) { res.status(500).json({ error: 'Failed to fetch finance dashboard' }); }
});

// ===== PROJECT P&L =====

router.get('/project-pl', authMiddleware, async (req: Request, res: Response) => {
  try {
    const projects = await dbAll(
      `SELECT p.id, p.name, p.code, p.status,
              ep.grand_total as contract_value,
              (SELECT SUM(ar.amount) FROM accounts_receivable ar WHERE ar.project_id = p.id) as billed_amount,
              (SELECT SUM(ar.paid_amount) FROM accounts_receivable ar WHERE ar.project_id = p.id) as collected_amount,
              (SELECT SUM(po.total_amount) FROM purchase_orders po WHERE po.project_id = p.id AND po.status != 'rejected') as committed_cost,
              (SELECT SUM(ap.paid_amount) FROM accounts_payable ap WHERE ap.project_id = p.id) as actual_cost,
              (SELECT SUM(pe.amount) FROM project_expenses pe WHERE pe.project_id = p.id) as expense_cost
       FROM projects p
       LEFT JOIN estimator_proposals ep ON ep.project_id = p.id AND ep.status = 'approved'
       ORDER BY p.created_at DESC
       LIMIT 20`, []
    ) as any[];
    const result = projects.map((p: any) => {
      const contract = Number(p.contract_value||0);
      const billed = Number(p.billed_amount||0);
      const collected = Number(p.collected_amount||0);
      const cost = Number(p.actual_cost||0) + Number(p.expense_cost||0);
      const committed = Number(p.committed_cost||0);
      const margin = contract > 0 ? ((contract - committed) / contract * 100) : 0;
      return { ...p, contract_value: contract, billed_amount: billed, collected_amount: collected,
               actual_cost: cost, committed_cost: committed, gross_margin_pct: margin };
    });
    res.json({ data: result });
  } catch (e) { res.status(500).json({ error: 'Failed to fetch project P&L' }); }
});

// ===== FUND REQUEST DOCUMENTS =====

// GET /fund-requests/:id/documents
router.get('/fund-requests/:id/documents', authMiddleware, async (req: Request, res: Response) => {
  try {
    const docs = await dbAll(
      `SELECT d.*, u.full_name as uploaded_by_name
       FROM fund_request_documents d
       LEFT JOIN users u ON d.uploaded_by = u.id
       WHERE d.fund_request_id = ?
       ORDER BY d.created_at DESC`,
      [req.params.id]
    );
    res.json({ data: docs });
  } catch (error) {
    console.error('Error fetching fund request documents:', error);
    res.status(500).json({ error: 'Failed to fetch documents' });
  }
});

// POST /fund-requests/:id/documents - upload file
router.post('/fund-requests/:id/documents', authMiddleware, frDocUpload.single('file'), async (req: Request, res: Response) => {
  try {
    const file = req.file;
    if (!file) return res.status(400).json({ error: 'No file uploaded' });
    const userId = (req as any).userId || null;
    const filePath = '/uploads/fund-requests/' + file.filename;
    const result = await dbRun(
      `INSERT INTO fund_request_documents (fund_request_id, file_name, original_name, file_path, file_size, file_type, uploaded_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [req.params.id, file.filename, file.originalname, filePath, file.size, file.mimetype, userId]
    );
    res.status(201).json({
      message: 'Document uploaded',
      data: { id: result.insertId, file_name: file.filename, original_name: file.originalname, file_path: filePath, file_size: file.size, file_type: file.mimetype }
    });
  } catch (error) {
    console.error('Error uploading fund request document:', error);
    res.status(500).json({ error: 'Failed to upload document' });
  }
});

// DELETE /fund-requests/:frId/documents/:docId
router.delete('/fund-requests/:frId/documents/:docId', authMiddleware, async (req: Request, res: Response) => {
  try {
    const doc = await dbGet('SELECT * FROM fund_request_documents WHERE id = ? AND fund_request_id = ?', [req.params.docId, req.params.frId]) as any;
    if (!doc) return res.status(404).json({ error: 'Document not found' });
    // Delete physical file
    const fullPath = path.join(__dirname, '../../', doc.file_path);
    if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
    await dbRun('DELETE FROM fund_request_documents WHERE id = ?', [req.params.docId]);
    res.json({ message: 'Document deleted' });
  } catch (error) {
    console.error('Error deleting fund request document:', error);
    res.status(500).json({ error: 'Failed to delete document' });
  }
});
// ===== PAYMENT SCHEDULE =====

// GET /payment-schedule — aggregate PO schedules + expenses + AP invoices
router.get('/payment-schedule', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { year, month, period, project_id, status, source } = req.query;
    const yr  = parseInt(String(year  || new Date().getFullYear()));
    const mo  = parseInt(String(month || (new Date().getMonth() + 1)));
    const per = String(period || 'monthly');

    const today = new Date().toISOString().slice(0, 10);
    const sevenDays = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);

    const rows: any[] = [];

    // ---- 1. PO Payment Schedules ----
    if (!source || source === 'po') {
      let poSql = `
        SELECT ps.id, ps.po_id, ps.label, ps.amount, ps.due_date, ps.status, ps.paid_amount,
               po.po_number as ref_number, v.name as vendor_name, po.project_id,
               'po' as source
        FROM purchase_order_payment_schedules ps
        JOIN purchase_orders po ON ps.po_id = po.id
        LEFT JOIN vendors v ON po.vendor_id = v.id
        WHERE ps.amount > 0
        AND (po.approval_status >= 1 OR po.status = 'approved')`;
      const poParams: any[] = [];
      if (project_id) { poSql += ' AND po.project_id = ?'; poParams.push(project_id); }
      if (status === 'overdue') { poSql += ' AND ps.due_date < ? AND ps.status != ?'; poParams.push(today, 'paid'); }
      else if (status && status !== '') { poSql += ' AND ps.status = ?'; poParams.push(status); }
      if (per === 'monthly') {
        poSql += ` AND YEAR(ps.due_date) = ?`;
        poParams.push(yr);
      } else {
        poSql += ` AND YEAR(ps.due_date) = ? AND MONTH(ps.due_date) = ?`;
        poParams.push(yr, mo);
      }
      const poRows = await dbAll(poSql, poParams) as any[];
      rows.push(...poRows);
    }

    // ---- 2. Approved Expenses ----
    if (!source || source === 'expense') {
      let expSql = `
        SELECT e.id, e.project_id, e.description as label, e.amount, e.expense_date as due_date,
               e.status, 0 as paid_amount,
               e.expense_number as ref_number, v.name as vendor_name,
               'expense' as source
        FROM project_expenses e
        LEFT JOIN vendors v ON e.vendor_id = v.id
        WHERE e.status = 'approved' AND e.amount > 0`;
      const expParams: any[] = [];
      if (project_id) { expSql += ' AND e.project_id = ?'; expParams.push(project_id); }
      if (per === 'monthly') {
        expSql += ` AND YEAR(e.expense_date) = ?`;
        expParams.push(yr);
      } else {
        expSql += ` AND YEAR(e.expense_date) = ? AND MONTH(e.expense_date) = ?`;
        expParams.push(yr, mo);
      }
      const expRows = await dbAll(expSql, expParams) as any[];
      rows.push(...expRows.map((r: any) => ({ ...r, source: 'expense' })));
    }

    // ---- 3. AP Invoices ----
    if (!source || source === 'invoice') {
      let apSql = `
        SELECT ap.id, ap.po_id, ap.invoice_number as ref_number,
               COALESCE(ap.invoice_number, po.po_number) as label,
               ap.amount, ap.due_date, ap.status, ap.paid_amount,
               v.name as vendor_name, po.project_id,
               'invoice' as source
        FROM accounts_payable ap
        LEFT JOIN purchase_orders po ON ap.po_id = po.id
        LEFT JOIN vendors v ON ap.vendor_id = v.id
        WHERE ap.amount > 0 AND ap.status != 'paid'
        AND ap.po_schedule_id IS NULL`;
      const apParams: any[] = [];
      if (project_id) { apSql += ' AND po.project_id = ?'; apParams.push(project_id); }
      if (per === 'monthly') {
        apSql += ` AND YEAR(ap.due_date) = ?`;
        apParams.push(yr);
      } else {
        apSql += ` AND YEAR(ap.due_date) = ? AND MONTH(ap.due_date) = ?`;
        apParams.push(yr, mo);
      }
      const apRows = await dbAll(apSql, apParams) as any[];
      rows.push(...apRows);
    }

    // ---- 4. Kasbon Requests ----
    if (!source || source === 'kasbon') {
      let kbSql = `
        SELECT kr.id, kr.project_id, kr.purpose as label, kr.total_amount as amount,
               kr.due_date, kr.status, 0 as paid_amount,
               kr.request_number as ref_number,
               'Pengajuan Kasbon' as vendor_name,
               'kasbon' as source
        FROM kasbon_requests kr
        WHERE kr.approval_status >= 1 AND kr.total_amount > 0`;
      const kbParams: any[] = [];
      if (project_id) { kbSql += ' AND kr.project_id = ?'; kbParams.push(project_id); }
      if (per === 'monthly') {
        kbSql += ` AND YEAR(kr.due_date) = ?`;
        kbParams.push(yr);
      } else {
        kbSql += ` AND YEAR(kr.due_date) = ? AND MONTH(kr.due_date) = ?`;
        kbParams.push(yr, mo);
      }
      const kbRows = await dbAll(kbSql, kbParams) as any[];
      rows.push(...kbRows);
    }

    // ---- 5. Payroll Requests ----
    if (!source || source === 'payroll') {
      let prSql = `
        SELECT pr.id, pr.project_id,
               CONCAT(pr.purpose) as label,
               pr.total_amount as amount,
               pr.due_date, pr.status, 0 as paid_amount,
               pr.request_number as ref_number,
               CONCAT('Gaji ', pr.employee_count, ' Karyawan') as vendor_name,
               'payroll' as source
        FROM payroll_requests pr
        WHERE pr.approval_status >= 1 AND pr.total_amount > 0`;
      const prParams: any[] = [];
      if (project_id) { prSql += ' AND pr.project_id = ?'; prParams.push(project_id); }
      if (per === 'monthly') {
        prSql += ` AND pr.period_year = ?`;
        prParams.push(yr);
      } else {
        prSql += ` AND pr.period_year = ? AND pr.period_month = ?`;
        prParams.push(yr, mo);
      }
      const prRows = await dbAll(prSql, prParams) as any[];
      rows.push(...prRows);
    }

    // Build period_map for each row
    const buildPeriodKey = (dateStr: string, p: string): string => {
      if (!dateStr) return '';
      const d = new Date(dateStr);
      if (p === 'daily')   return d.toISOString().slice(0, 10);
      if (p === 'weekly') {
        const day = d.getDay(); // 0=Sun
        const weekStart = new Date(d); weekStart.setDate(d.getDate() - day);
        const wk = Math.ceil(d.getDate() / 7);
        return `W${wk}-${d.getFullYear()}-${d.getMonth()+1}`;
      }
      return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    };

    const enriched = rows.map((r: any) => {
      const effectiveStatus = r.status === 'paid' ? 'paid'
        : r.due_date && r.due_date < today ? 'overdue'
        : r.status;
      const periodKey = buildPeriodKey(r.due_date, per);
      return {
        id:          r.id,
        source:      r.source,
        label:       r.label || r.ref_number || '—',
        ref_number:  r.ref_number,
        vendor_name: r.vendor_name,
        amount:      Number(r.amount || 0),
        paid_amount: Number(r.paid_amount || 0),
        due_date:    r.due_date,
        status:      effectiveStatus,
        project_id:  r.project_id,
        period_map:  periodKey ? { [periodKey]: Number(r.amount || 0) } : {},
      };
    });

    // Summary
    const total_planned = enriched.reduce((s: number, r: any) => s + r.amount, 0);
    const paid          = enriched.filter((r: any) => r.status === 'paid').reduce((s: number, r: any) => s + r.paid_amount, 0);
    const overdue       = enriched.filter((r: any) => r.status === 'overdue').reduce((s: number, r: any) => s + r.amount, 0);
    const due_soon      = enriched.filter((r: any) => r.status !== 'paid' && r.due_date && r.due_date >= today && r.due_date <= sevenDays).reduce((s: number, r: any) => s + r.amount, 0);
    const remaining     = total_planned - paid;

    res.json({
      data: enriched,
      summary: { total_planned, paid, overdue, due_soon, remaining },
    });
  } catch (error: any) {
    console.error('Payment schedule error:', error);
    res.status(500).json({ error: 'Failed to fetch payment schedule: ' + error.message });
  }
});

// PATCH /payment-schedule/:id/paid — mark schedule item as paid
router.patch('/payment-schedule/:id/paid', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { source } = req.body;
    const id = req.params.id;
    if (source === 'po') {
      await dbRun('UPDATE purchase_order_payment_schedules SET status = ?, paid_amount = amount WHERE id = ?', ['paid', id]);
    } else if (source === 'expense') {
      await dbRun("UPDATE project_expenses SET status = 'paid' WHERE id = ?", [id]);
    } else if (source === 'invoice') {
      await dbRun("UPDATE accounts_payable SET status = 'paid', paid_amount = amount WHERE id = ?", [id]);
    }
    res.json({ message: 'Marked as paid' });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to update status: ' + error.message });
  }
});

// POST /payment-schedule/:id/proof — upload payment proof file
router.post('/payment-schedule/:id/proof', authMiddleware, proofUpload.single('file'), async (req: Request, res: Response) => {
  try {
    const file = req.file;
    if (!file) return res.status(400).json({ error: 'No file uploaded' });
    const { source = 'po', notes } = req.body;
    const userId = (req as any).userId || (req as any).user?.userId || null;
    const filePath = '/uploads/payment-proofs/' + file.filename;

    const result = await dbRun(
      `INSERT INTO payment_proofs (schedule_id, source, file_name, original_name, file_path, file_size, file_type, notes, uploaded_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [req.params.id, source, file.filename, file.originalname, filePath, file.size, file.mimetype, notes || null, userId]
    );
    res.status(201).json({
      message: 'Bukti bayar berhasil diupload',
      data: { id: result.insertId, file_name: file.filename, original_name: file.originalname, file_path: filePath, file_size: file.size, file_type: file.mimetype }
    });
  } catch (error: any) {
    console.error('Error uploading payment proof:', error);
    res.status(500).json({ error: 'Failed to upload proof: ' + error.message });
  }
});

// GET /payment-schedule/:id/proofs?source=po — list proof files for a schedule item
router.get('/payment-schedule/:id/proofs', authMiddleware, async (req: Request, res: Response) => {
  try {
    const source = req.query.source || 'po';
    const docs = await dbAll(
      `SELECT pp.*, u.full_name as uploaded_by_name
       FROM payment_proofs pp
       LEFT JOIN users u ON pp.uploaded_by = u.id
       WHERE pp.schedule_id = ? AND pp.source = ?
       ORDER BY pp.created_at DESC`,
      [req.params.id, source]
    );
    res.json({ data: docs });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to fetch proofs' });
  }
});

// DELETE /payment-schedule/proof/:proofId — delete a proof file
router.delete('/payment-schedule/proof/:proofId', authMiddleware, async (req: Request, res: Response) => {
  try {
    const doc = await dbGet('SELECT * FROM payment_proofs WHERE id = ?', [req.params.proofId]) as any;
    if (!doc) return res.status(404).json({ error: 'Proof not found' });
    const fullPath = path.join(__dirname, '../../', doc.file_path);
    if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
    await dbRun('DELETE FROM payment_proofs WHERE id = ?', [req.params.proofId]);
    res.json({ message: 'Bukti bayar berhasil dihapus' });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to delete proof' });
  }
});

// PATCH /payment-schedule/:id/reschedule — Finance team reschedules due_date (and optionally amount/notes)
router.patch('/payment-schedule/:id/reschedule', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { source, due_date, amount, notes } = req.body;
    const id = req.params.id;
    if (!due_date) return res.status(400).json({ error: 'due_date is required' });

    const newDate = due_date.slice(0, 10); // ensure YYYY-MM-DD

    if (source === 'po' || !source) {
      const updates: string[] = ['due_date = ?'];
      const vals: any[] = [newDate];
      if (amount !== undefined) { updates.push('amount = ?'); vals.push(Number(amount)); }
      if (notes !== undefined)  { updates.push('notes = ?');  vals.push(notes); }
      vals.push(id);
      await dbRun(`UPDATE purchase_order_payment_schedules SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, vals);
      // Sync linked AP if exists
      const sched = await dbGet('SELECT ap_id, amount FROM purchase_order_payment_schedules WHERE id = ?', [id]) as any;
      if (sched?.ap_id) {
        await dbRun('UPDATE accounts_payable SET due_date = ? WHERE id = ?', [newDate, sched.ap_id]);
      }
    } else if (source === 'expense') {
      await dbRun('UPDATE project_expenses SET expense_date = ? WHERE id = ?', [newDate, id]);
    } else if (source === 'invoice') {
      const updates: string[] = ['due_date = ?'];
      const vals: any[] = [newDate];
      if (amount !== undefined) { updates.push('amount = ?'); vals.push(Number(amount)); }
      if (notes !== undefined)  { updates.push('notes = ?');  vals.push(notes); }
      vals.push(id);
      await dbRun(`UPDATE accounts_payable SET ${updates.join(', ')} WHERE id = ?`, vals);
    } else if (source === 'kasbon') {
      await dbRun('UPDATE kasbon_requests SET due_date = ? WHERE id = ?', [newDate, id]);
    }

    res.json({ message: 'Schedule updated', due_date: newDate });
  } catch (error: any) {
    console.error('Error rescheduling:', error);
    res.status(500).json({ error: 'Failed to reschedule: ' + error.message });
  }
});

// POST /payment-schedule/generate-fund-request — create FR from selected schedule items (idempotent)
router.post('/payment-schedule/generate-fund-request', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { ids } = req.body as { ids: { id: number; source: string }[] | number[] };
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'ids required' });
    }
    const userId = (req as any).userId || null;
    const requestNumber = generateFinanceCode('FR');
    let totalAmount = 0;
    const frItems: any[] = [];
    const skipped: string[] = [];

    for (const entry of ids) {
      const id     = typeof entry === 'object' ? entry.id : entry;
      const source = typeof entry === 'object' ? entry.source : 'po';

      if (source === 'po' || !source) {
        const s = await dbGet(
          'SELECT ps.*, po.vendor_id, po.po_number FROM purchase_order_payment_schedules ps JOIN purchase_orders po ON ps.po_id = po.id WHERE ps.id = ?',
          [id]
        ) as any;
        if (!s) continue;

        // Idempotency: check if active FR already exists for this schedule
        const existingFRI = await dbGet(
          `SELECT fri.id, fr.request_number, fr.status
           FROM fund_request_items fri
           JOIN fund_requests fr ON fr.id = fri.fund_request_id
           WHERE fri.po_schedule_id = ? AND fr.status NOT IN ('rejected')
           LIMIT 1`,
          [id]
        ) as any;
        if (existingFRI) {
          skipped.push(`${s.po_number} — ${s.label} (sudah ada FR: ${existingFRI.request_number})`);
          continue;
        }

        totalAmount += Number(s.amount);
        frItems.push({ po_id: s.po_id, po_schedule_id: s.id, vendor_id: s.vendor_id, description: `${s.po_number} — ${s.label}`, amount: Number(s.amount) });

      } else if (source === 'expense') {
        const e = await dbGet('SELECT * FROM project_expenses WHERE id = ?', [id]) as any;
        if (!e) continue;
        // Check existing FR for this expense
        const existingFRI = await dbGet(
          `SELECT fri.id, fr.request_number FROM fund_request_items fri
           JOIN fund_requests fr ON fr.id = fri.fund_request_id
           WHERE fri.description LIKE ? AND fr.status NOT IN ('rejected') LIMIT 1`,
          [`Expense: ${e.description}`]
        ) as any;
        if (existingFRI) { skipped.push(`Expense: ${e.description} (sudah ada FR: ${existingFRI.request_number})`); continue; }
        totalAmount += Number(e.amount);
        frItems.push({ source: 'expense', src_id: id, po_id: null, po_schedule_id: null, vendor_id: e.vendor_id, description: `Expense: ${e.description}`, amount: Number(e.amount) });

      } else if (source === 'invoice') {
        const a = await dbGet('SELECT * FROM accounts_payable WHERE id = ?', [id]) as any;
        if (!a) continue;
        totalAmount += Number(a.amount);
        frItems.push({ source: 'invoice', src_id: id, po_id: a.po_id, po_schedule_id: a.po_schedule_id, vendor_id: a.vendor_id, description: `Invoice: ${a.invoice_number || a.id}`, amount: Number(a.amount) });

      } else if (source === 'kasbon') {
        const k = await dbGet('SELECT * FROM kasbon_requests WHERE id = ?', [id]) as any;
        if (!k) continue;
        const existingFRI = await dbGet(
          `SELECT fri.id, fr.request_number FROM fund_request_items fri
           JOIN fund_requests fr ON fr.id = fri.fund_request_id
           WHERE fri.description LIKE ? AND fr.status NOT IN ('rejected') LIMIT 1`,
          [`Kasbon: ${k.request_number}`]
        ) as any;
        if (existingFRI) { skipped.push(`Kasbon ${k.request_number} (sudah ada FR: ${existingFRI.request_number})`); continue; }
        totalAmount += Number(k.total_amount);
        frItems.push({ source: 'kasbon', src_id: id, po_id: null, po_schedule_id: null, vendor_id: null, description: `Kasbon: ${k.request_number} — ${k.purpose || ''}`, amount: Number(k.total_amount) });
      }
    }

    if (frItems.length === 0) {
      const msg = skipped.length > 0
        ? `Semua item sudah memiliki Fund Request aktif:\n${skipped.join('\n')}`
        : 'No valid items found';
      return res.status(400).json({ error: msg });
    }

    const result = await dbRun(
      `INSERT INTO fund_requests (request_number, request_date, amount, needed_date, purpose, status, requester_id)
       VALUES (?, CURDATE(), ?, CURDATE(), 'Payment Schedule Auto-Generated', 'draft', ?)`,
      [requestNumber, totalAmount, userId]
    );
    const frId = result.insertId;

    for (const item of frItems) {
      await dbRun(
        `INSERT INTO fund_request_items (fund_request_id, po_id, po_schedule_id, vendor_id, description, amount, status)
         VALUES (?, ?, ?, ?, ?, ?, 'pending')`,
        [frId, item.po_id || null, item.po_schedule_id || null, item.vendor_id || null, item.description, item.amount]
      );

      // Auto-update source status to 'requested'
      if (item.source === 'po' || item.po_schedule_id) {
        if (item.po_schedule_id) {
          await dbRun("UPDATE purchase_order_payment_schedules SET status = 'requested' WHERE id = ? AND status NOT IN ('paid')", [item.po_schedule_id]);
        }
      } else if (item.source === 'expense' && item.src_id) {
        await dbRun("UPDATE project_expenses SET status = 'requested' WHERE id = ? AND status NOT IN ('paid')", [item.src_id]);
      } else if (item.source === 'invoice' && item.src_id) {
        await dbRun("UPDATE accounts_payable SET status = 'requested' WHERE id = ? AND status NOT IN ('paid')", [item.src_id]);
      } else if (item.source === 'kasbon' && item.src_id) {
        await dbRun("UPDATE kasbon_requests SET status = 'requested' WHERE id = ? AND status NOT IN ('approved')", [item.src_id]);
      }
    }

    let msg = `Fund Request ${requestNumber} berhasil dibuat (${frItems.length} item)`;
    if (skipped.length > 0) msg += `. ${skipped.length} item dilewati (sudah ada FR).`;

    res.json({ message: msg, data: { id: frId, request_number: requestNumber }, skipped });
  } catch (error: any) {
    console.error('Generate FR from schedule error:', error);
    res.status(500).json({ error: 'Failed to generate fund request: ' + error.message });
  }
});

// ===== KASBON REQUESTS =====

// GET /kasbon-requests — list all
router.get('/kasbon-requests', authMiddleware, async (req: Request, res: Response) => {
  try {
    const rows = await dbAll(`
      SELECT kr.*,
             u.full_name as requester_name,
             COUNT(kri.id) as item_count
      FROM kasbon_requests kr
      LEFT JOIN users u ON kr.requester_id = u.id
      LEFT JOIN kasbon_request_items kri ON kri.kasbon_request_id = kr.id
      GROUP BY kr.id
      ORDER BY kr.created_at DESC`);
    res.json({ data: rows });
  } catch (error) {
    console.error('Error fetching kasbon requests:', error);
    res.status(500).json({ error: 'Failed to fetch kasbon requests' });
  }
});

// GET /kasbon-requests/:id — detail with items
router.get('/kasbon-requests/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const kr = await dbGet(`
      SELECT kr.*, u.full_name as requester_name
      FROM kasbon_requests kr
      LEFT JOIN users u ON kr.requester_id = u.id
      WHERE kr.id = ?`, [req.params.id]) as any;
    if (!kr) return res.status(404).json({ error: 'Kasbon request not found' });
    const items = await dbAll(`
      SELECT kri.*, e.name as emp_name, d.name as department, e.position
      FROM kasbon_request_items kri
      LEFT JOIN employees e ON kri.employee_id = e.id
      LEFT JOIN departments d ON e.department_id = d.id
      WHERE kri.kasbon_request_id = ?
      ORDER BY kri.advance_date ASC`, [req.params.id]);
    res.json({ data: { ...kr as any, items } });
  } catch (error) {
    console.error('Error fetching kasbon detail:', error);
    res.status(500).json({ error: 'Failed to fetch kasbon detail' });
  }
});

// POST /kasbon-requests — create from selected salary_advances
router.post('/kasbon-requests', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { salary_advance_ids, purpose, notes, project_id } = req.body;
    if (!salary_advance_ids || !Array.isArray(salary_advance_ids) || salary_advance_ids.length === 0) {
      return res.status(400).json({ error: 'salary_advance_ids required' });
    }
    const userId = (req as any).user?.userId || null;

    // Fetch all selected advances
    const placeholders = salary_advance_ids.map(() => '?').join(',');
    const advances = await dbAll(
      `SELECT sa.*, e.name as employee_name, e.id as emp_id
       FROM salary_advances sa
       LEFT JOIN employees e ON sa.employee_id = e.id
       WHERE sa.id IN (${placeholders}) AND (sa.kasbon_request_id IS NULL OR sa.kasbon_request_id = 0)`,
      salary_advance_ids
    ) as any[];

    if (advances.length === 0) return res.status(400).json({ error: 'No valid unlinked advances found' });

    const totalAmount = advances.reduce((sum: number, a: any) => sum + Number(a.amount), 0);
    // Due date = earliest advance_date
    const dueDates = advances.map((a: any) => a.advance_date).filter(Boolean).sort();
    const dueDate = dueDates[0] || new Date().toISOString().slice(0, 10);
    const requestNumber = generateFinanceCode('KB');

    const result = await dbRun(
      `INSERT INTO kasbon_requests (request_number, request_date, due_date, total_amount, purpose, notes, status, approval_status, requester_id, project_id)
       VALUES (?, CURDATE(), ?, ?, ?, ?, 'draft', 0, ?, ?)`,
      [requestNumber, dueDate, totalAmount, purpose || 'Pengajuan Kasbon Karyawan', notes || null, userId, project_id || null]
    );
    const kasbonId = result.insertId;

    // Insert items + link salary_advances
    for (const adv of advances) {
      await dbRun(
        `INSERT INTO kasbon_request_items (kasbon_request_id, salary_advance_id, employee_id, employee_name, amount, description, advance_date)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [kasbonId, adv.id, adv.emp_id, adv.employee_name, adv.amount, adv.description, adv.advance_date]
      );
      await dbRun('UPDATE salary_advances SET kasbon_request_id = ? WHERE id = ?', [kasbonId, adv.id]);
    }

    res.status(201).json({ message: `Kasbon Request ${requestNumber} berhasil dibuat (${advances.length} karyawan)`, data: { id: kasbonId, request_number: requestNumber } });
  } catch (error: any) {
    console.error('Error creating kasbon request:', error);
    res.status(500).json({ error: 'Failed to create kasbon request: ' + error.message });
  }
});

// PUT /kasbon-requests/:id/submit
router.put('/kasbon-requests/:id/submit', authMiddleware, async (req: Request, res: Response) => {
  try {
    const kr = await dbGet('SELECT * FROM kasbon_requests WHERE id = ?', [req.params.id]) as any;
    if (!kr) return res.status(404).json({ error: 'Not found' });
    if (kr.status !== 'draft') return res.status(400).json({ error: 'Only draft can be submitted' });
    await dbRun("UPDATE kasbon_requests SET status = 'submitted' WHERE id = ?", [req.params.id]);
    res.json({ message: 'Kasbon request submitted for approval' });
  } catch (error) { res.status(500).json({ error: 'Failed to submit' }); }
});

// PUT /kasbon-requests/:id/approve
router.put('/kasbon-requests/:id/approve', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId || null;
    const kr = await dbGet('SELECT * FROM kasbon_requests WHERE id = ?', [req.params.id]) as any;
    if (!kr) return res.status(404).json({ error: 'Not found' });
    if (!['submitted', 'draft'].includes(kr.status)) return res.status(400).json({ error: 'Cannot approve in current status' });

    await dbRun(
      "UPDATE kasbon_requests SET status = 'approved', approval_status = 1, approved_by = ?, approved_at = NOW() WHERE id = ?",
      [userId, req.params.id]
    );
    res.json({ message: 'Kasbon request approved. Muncul di Payment Schedule.' });
  } catch (error) { res.status(500).json({ error: 'Failed to approve' }); }
});

// PUT /kasbon-requests/:id/reject
router.put('/kasbon-requests/:id/reject', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { reason } = req.body;
    await dbRun(
      "UPDATE kasbon_requests SET status = 'rejected', approval_status = 0, notes = CONCAT(IFNULL(notes,''), ' [REJECTED: ', ?, ']') WHERE id = ?",
      [reason || '-', req.params.id]
    );
    // Unlink salary advances so they can be re-used
    await dbRun('UPDATE salary_advances SET kasbon_request_id = NULL WHERE kasbon_request_id = ?', [req.params.id]);
    res.json({ message: 'Kasbon request rejected' });
  } catch (error) { res.status(500).json({ error: 'Failed to reject' }); }
});

// DELETE /kasbon-requests/:id — only draft
router.delete('/kasbon-requests/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const kr = await dbGet('SELECT * FROM kasbon_requests WHERE id = ?', [req.params.id]) as any;
    if (!kr) return res.status(404).json({ error: 'Not found' });
    if (!['draft', 'rejected'].includes(kr.status)) return res.status(400).json({ error: 'Hanya draft/rejected yang bisa dihapus' });
    await dbRun('UPDATE salary_advances SET kasbon_request_id = NULL WHERE kasbon_request_id = ?', [req.params.id]);
    await dbRun('DELETE FROM kasbon_request_items WHERE kasbon_request_id = ?', [req.params.id]);
    await dbRun('DELETE FROM kasbon_requests WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (error) { res.status(500).json({ error: 'Failed to delete' }); }
});

// ===== PAYROLL REQUESTS =====

// GET /payroll-requests — list all grouped by period
router.get('/payroll-requests', authMiddleware, async (req: Request, res: Response) => {
  try {
    const rows = await dbAll(`
      SELECT pr.*,
             u.full_name as requester_name,
             COUNT(pri.id) as item_count
      FROM payroll_requests pr
      LEFT JOIN users u ON pr.requester_id = u.id
      LEFT JOIN payroll_request_items pri ON pri.payroll_request_id = pr.id
      GROUP BY pr.id
      ORDER BY pr.period_year DESC, pr.period_month DESC`);
    res.json({ data: rows });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to fetch payroll requests' });
  }
});

// POST /payroll-requests — create batch from payslip_records for a period
router.post('/payroll-requests', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { period_month, period_year, payslip_ids, purpose, notes, project_id, due_date } = req.body;
    if (!period_month || !period_year) {
      return res.status(400).json({ error: 'period_month and period_year are required' });
    }
    const userId = (req as any).user?.userId || null;

    // If specific payslip_ids provided use them, else fetch all finalized payslips for period
    let payslips: any[];
    if (payslip_ids && Array.isArray(payslip_ids) && payslip_ids.length > 0) {
      const ph = payslip_ids.map(() => '?').join(',');
      payslips = await dbAll(
        `SELECT ps.*, e.name as employee_name, d.name as department
         FROM payslip_records ps
         LEFT JOIN employees e ON ps.employee_id = e.id
         LEFT JOIN departments d ON e.department_id = d.id
         WHERE ps.id IN (${ph})`,
        payslip_ids
      ) as any[];
    } else {
      payslips = await dbAll(
        `SELECT ps.*, e.name as employee_name, d.name as department
         FROM payslip_records ps
         LEFT JOIN employees e ON ps.employee_id = e.id
         LEFT JOIN departments d ON e.department_id = d.id
         WHERE ps.period_month = ? AND ps.period_year = ?
         ORDER BY e.name ASC`,
        [period_month, period_year]
      ) as any[];
    }

    if (payslips.length === 0) {
      return res.status(400).json({ error: 'Tidak ada payslip tersimpan untuk periode ini. Simpan slip gaji karyawan terlebih dahulu.' });
    }

    // Check if payroll request already exists for this period
    const existing = await dbGet(
      'SELECT id, request_number FROM payroll_requests WHERE period_month = ? AND period_year = ? AND status NOT IN (\'rejected\')',
      [period_month, period_year]
    ) as any;
    if (existing) {
      return res.status(400).json({ error: `Pengajuan gaji untuk periode ini sudah ada: ${existing.request_number}` });
    }

    const totalAmount = payslips.reduce((sum: number, p: any) => sum + Number(p.net_salary || 0), 0);
    const dueDate = due_date || `${period_year}-${String(period_month).padStart(2,'0')}-25`;
    const requestNumber = generateFinanceCode('GJ');
    const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const periodLabel = `Gaji ${monthNames[period_month - 1]} ${period_year}`;

    const result = await dbRun(
      `INSERT INTO payroll_requests (request_number, period_month, period_year, due_date, total_amount, employee_count, purpose, notes, status, approval_status, requester_id, project_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'draft', 0, ?, ?)`,
      [requestNumber, period_month, period_year, dueDate, totalAmount, payslips.length, purpose || periodLabel, notes || null, userId, project_id || null]
    );
    const payrollId = result.insertId;

    for (const ps of payslips) {
      await dbRun(
        `INSERT INTO payroll_request_items (payroll_request_id, payslip_record_id, employee_id, employee_name, department, gross_salary, total_deductions, net_salary, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [payrollId, ps.id || null, ps.employee_id, ps.employee_name, ps.department || null, Number(ps.gross_salary || 0), Number(ps.total_deductions || 0), Number(ps.net_salary || 0), ps.notes || null]
      );
    }

    res.status(201).json({
      message: `Payroll Request ${requestNumber} berhasil dibuat (${payslips.length} karyawan, Total: ${totalAmount})`,
      data: { id: payrollId, request_number: requestNumber, total_amount: totalAmount, employee_count: payslips.length }
    });
  } catch (error: any) {
    console.error('Error creating payroll request:', error);
    res.status(500).json({ error: 'Failed to create payroll request: ' + error.message });
  }
});

// PUT /payroll-requests/:id/submit
router.put('/payroll-requests/:id/submit', authMiddleware, async (req: Request, res: Response) => {
  try {
    const pr = await dbGet('SELECT * FROM payroll_requests WHERE id = ?', [req.params.id]) as any;
    if (!pr) return res.status(404).json({ error: 'Not found' });
    if (pr.status !== 'draft') return res.status(400).json({ error: 'Only draft can be submitted' });
    await dbRun("UPDATE payroll_requests SET status = 'submitted' WHERE id = ?", [req.params.id]);
    res.json({ message: 'Payroll request submitted for approval' });
  } catch (error) { res.status(500).json({ error: 'Failed to submit' }); }
});

// PUT /payroll-requests/:id/approve → auto shows in Payment Schedule
router.put('/payroll-requests/:id/approve', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId || null;
    const pr = await dbGet('SELECT * FROM payroll_requests WHERE id = ?', [req.params.id]) as any;
    if (!pr) return res.status(404).json({ error: 'Not found' });
    if (!['submitted', 'draft'].includes(pr.status)) {
      return res.status(400).json({ error: 'Cannot approve in current status' });
    }
    await dbRun(
      "UPDATE payroll_requests SET status = 'approved', approval_status = 1, approved_by = ?, approved_at = NOW() WHERE id = ?",
      [userId, req.params.id]
    );
    res.json({ message: 'Payroll request approved. Muncul di Payment Schedule.' });
  } catch (error) { res.status(500).json({ error: 'Failed to approve' }); }
});

// PUT /payroll-requests/:id/reject
router.put('/payroll-requests/:id/reject', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { reason } = req.body;
    await dbRun(
      "UPDATE payroll_requests SET status = 'rejected', approval_status = 0 WHERE id = ?",
      [req.params.id]
    );
    res.json({ message: 'Payroll request rejected' });
  } catch (error) { res.status(500).json({ error: 'Failed to reject' }); }
});

// DELETE /payroll-requests/:id — only draft
router.delete('/payroll-requests/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const pr = await dbGet('SELECT * FROM payroll_requests WHERE id = ?', [req.params.id]) as any;
    if (!pr) return res.status(404).json({ error: 'Not found' });
    if (!['draft', 'rejected'].includes(pr.status)) {
      return res.status(400).json({ error: 'Hanya draft/rejected yang bisa dihapus' });
    }
    await dbRun('DELETE FROM payroll_request_items WHERE payroll_request_id = ?', [req.params.id]);
    await dbRun('DELETE FROM payroll_requests WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (error) { res.status(500).json({ error: 'Failed to delete' }); }
});

export default router;
