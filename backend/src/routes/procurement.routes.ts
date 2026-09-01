import { Router, Request, Response } from 'express';
import { dbAll, dbGet, dbRun, withTransaction, TxRunner } from '../config/database';
import { authMiddleware } from '../middleware/auth';
import { requirePermission } from '../middleware/permission';
import { validateUpload, storeValidatedFile, removeStoredFile } from '../utils/file-validation';
import { hargaVendorAktif } from '../utils/vendor-price';
import multer from 'multer';
import path from 'path';
import fs from 'fs';

const router = Router();

// Multer setup for bid quotation file uploads
const bidUploadDir = path.join(__dirname, '../../uploads/bids');
if (!fs.existsSync(bidUploadDir)) {
  fs.mkdirSync(bidUploadDir, { recursive: true });
}
// PROC-R10: unggahan procurement mengikuti standar modul Asset.
//
// Dulu berkas ditulis langsung ke disk dengan ekstensi dari `originalname`,
// tanpa filter tipe sama sekali — `.html`, `.svg` beriskrip, atau `.sh` bisa
// masuk lalu dilayani balik oleh static server. Sekarang berkas ditahan di
// memori dulu, tipenya ditentukan dari MAGIC BYTES isinya (bukan dari nama atau
// MIME yang sepenuhnya dikendalikan klien), baru ditulis dengan nama UUID.
const bidUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } }); // 10MB max

// Multer setup for PR item attachment uploads
const prAttachDir = path.join(__dirname, '../../uploads/pr-attachments');
if (!fs.existsSync(prAttachDir)) {
  fs.mkdirSync(prAttachDir, { recursive: true });
}
const prAttachUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } }); // 10MB max

// PROC-R22: multer melempar errornya sendiri (mis. LIMIT_FILE_SIZE). Tanpa
// handler ini error tersebut jatuh ke error handler global dan dibalas 500,
// padahal berkas kebesaran adalah kesalahan permintaan — 413, bukan 500.
// Mengikuti pola yang sudah dipakai modul Asset.
const handleUploadErrors = (err: any, _req: Request, res: Response, next: any) => {
  if (err instanceof multer.MulterError) {
    const tooBig = err.code === 'LIMIT_FILE_SIZE';
    return res.status(tooBig ? 413 : 400).json({
      error: tooBig
        ? 'Ukuran berkas melebihi batas 10 MB'
        : `Upload ditolak: ${err.message}`,
    });
  }
  next(err);
};

/**
 * PROC-R11: pastikan path yang diminta klien benar-benar berada di dalam folder
 * unggahan yang dituju.
 *
 * Pemeriksaan lama hanya `filePath.includes('/pr-attachments/')`, lalu langsung
 * `path.join(__dirname, '../../', filePath)`. Substring itu tidak menghalangi
 * `..`: `/uploads/pr-attachments/../../../../etc/passwd` lolos pemeriksaan dan
 * di-resolve ke luar folder unggahan.
 *
 * Di sini path di-resolve dulu, baru dibandingkan dengan direktori dasarnya —
 * memakai pemisah path supaya `uploads/pr-attachments-lain` tidak ikut lolos.
 */
const projectRoot = path.join(__dirname, '../../');

const resolveInsideUploadDir = (baseDir: string, requestedPath: string): string | null => {
  if (!requestedPath) return null;
  const base = path.resolve(baseDir);
  // Path di-resolve APA ADANYA, bukan diambil basename-nya. Mengambil basename
  // memang membuat traversal mustahil lolos, tapi berarti path jahat diterima
  // diam-diam seolah sah. Lebih benar ditolak terang-terangan.
  const target = path.resolve(projectRoot, requestedPath.replace(/^\/+/, ''));
  if (!target.startsWith(base + path.sep)) return null;
  return target;
};


/**
 * Level persetujuan dibaca dari DATABASE, bukan dari isi token.
 *
 * Sebelumnya seluruh endpoint approval memakai `req.user?.userLevel`, yaitu
 * nilai yang ikut ditandatangani saat login dan berlaku 7 hari. Akibatnya:
 * orang yang baru dinaikkan jadi Manager TIDAK BISA menyetujui sampai token
 * lamanya kedaluwarsa atau ia login ulang — dan sebaliknya, yang sudah
 * diturunkan MASIH BISA menyetujui selama tokennya belum habis.
 *
 * Default 0 (bukan 1) supaya user tanpa level gagal tertutup, bukan diberi
 * hak paling rendah secara diam-diam.
 */
async function approverLevel(req: Request): Promise<number> {
  const userId = (req as any).userId ?? (req as any).user?.userId;
  if (!userId) return 0;
  const row: any = await dbGet('SELECT user_level, is_active FROM users WHERE id = ?', [userId]);
  if (!row || row.is_active === 0) return 0;
  return Number(row.user_level || 0);
}

/**
 * Nomor dokumen berurutan per hari (AST-009 versi procurement).
 *
 * Versi lama memakai 4 digit ACAK: `PR-20260315-4821`. Hanya ada 9.000
 * kemungkinan per hari, jadi dengan ~30 dokumen sehari peluang tabrakan sudah
 * di atas 4 persen. Kolomnya UNIQUE, sehingga tabrakan tidak menghasilkan
 * duplikat melainkan ERROR 500 saat pengguna menekan simpan. Nomornya juga
 * terlihat melompat-lompat karena memang acak.
 *
 * Sekarang: urut per hari, dengan pengaman UNIQUE INDEX di database sebagai
 * penjaga sebenarnya — `withDocumentNumber` di bawah mengulang kalau bentrok.
 */
/**
 * PROC-R21: tanggal pada nomor dokumen memakai zona waktu bisnis, bukan UTC.
 *
 * Sebelumnya `new Date().toISOString().slice(0, 10)` — itu UTC. Untuk pengguna
 * WIB, dokumen yang dibuat 11 Agustus jam 01:00 WIB (= 10 Agustus 18:00 UTC)
 * bernomor `PR-20260810-xxxx` padahal tanggal bisnisnya sudah 11 Agustus.
 * Setiap malam antara pukul 00:00 dan 07:00 WIB nomornya salah tanggal.
 *
 * Zona waktunya bisa diatur lewat env `BUSINESS_TIMEZONE` kalau nanti dipakai
 * di wilayah lain; defaultnya Asia/Jakarta.
 */
const BUSINESS_TIMEZONE = process.env.BUSINESS_TIMEZONE || 'Asia/Jakarta';

const businessDatePart = (): string =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: BUSINESS_TIMEZONE,
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date()).replace(/-/g, '');

// Diekspor supaya modul lain memakai penomoran yang SAMA. Estimator dulu membuat
// nomor PR sendiri dengan akhiran acak 4 digit (DR-P1-06); nomor acak itu lalu
// menjadi seed bagi counter ini dan mendorongnya melewati 9999 — nomor jadi
// 5 digit dan format resminya rusak.
export const nextSequentialCode = async (
  prefix: string, table: string, column: string, tx: TxRunner
): Promise<string> => {
  const datePart = businessDatePart();
  const like = `${prefix}-${datePart}-%`;

  // Nomor diambil dari `document_counters` secara atomic. Versi sebelumnya
  // membaca MAX(...) lalu menambah satu — dengan 20 permintaan serentak semuanya
  // membaca angka yang sama, dan retry pada UNIQUE hanya meloloskan satu per
  // putaran sampai percobaan habis (terukur: hanya 2 dari 20 PO berhasil).
  //
  // LAST_INSERT_ID() di bawah mengembalikan nilai yang di-set statement itu
  // sendiri pada koneksi yang sama, jadi tiap pemanggil dapat nomor berbeda
  // tanpa saling menunggu. Transaction dipakai semata untuk menjamin kedua
  // statement berjalan pada satu koneksi.
  // Seed dari dokumen yang sudah ada, supaya penomoran tidak mundur di database
  // yang sudah berisi data — termasuk nomor yang dulu diisi manual.
  const row: any = await tx.get(
    `SELECT MAX(CAST(SUBSTRING_INDEX(${column}, '-', -1) AS UNSIGNED)) AS maxNum
     FROM ${table} WHERE ${column} LIKE ?`,
    [like]
  );
  const seed = Number(row?.maxNum || 0);

  await tx.run(
    `INSERT INTO document_counters (prefix, date_part, last_no)
     VALUES (?, ?, LAST_INSERT_ID(? + 1))
     ON DUPLICATE KEY UPDATE last_no = LAST_INSERT_ID(GREATEST(last_no, ?) + 1)`,
    [prefix, datePart, seed, seed]
  );

  const got: any = await tx.get('SELECT LAST_INSERT_ID() AS n');
  const next = Number(got?.n || seed + 1);
  return `${prefix}-${datePart}-${String(next).padStart(4, '0')}`;
};

/**
 * Buat dokumen bernomor: alokasi nomor dulu (transaction pendek), lalu dokumennya
 * (transaction sendiri).
 *
 * Pemisahan ini penting dan sempat salah dua kali:
 *
 * 1. MAX(...) + retry saat UNIQUE bentrok — tiap putaran retry hanya meloloskan
 *    satu permintaan, jadi dari 20 PO serentak cuma 2 yang berhasil.
 * 2. Alokasi counter DI DALAM transaction dokumen — baris counter jadi terkunci
 *    sepanjang INSERT PO + item + jadwal pembayaran + AP. Ke-20 permintaan
 *    antre berurutan dan 18 di antaranya mati di `Lock wait timeout exceeded`.
 *
 * Sekarang kunci counter hanya dipegang selama alokasi nomor (satu INSERT),
 * lalu langsung dilepas. Kedua transaction berjalan berurutan, bukan bersamaan,
 * jadi tetap satu koneksi per permintaan pada satu waktu.
 *
 * Nomor bisa berlubang kalau dokumennya gagal disimpan setelah nomor terbit —
 * itu konsekuensi yang diterima, karena yang dijaga adalah keunikan, bukan
 * kerapatan.
 */
async function withNumberedDocument<T>(
  prefix: string, table: string, column: string,
  fn: (code: string, tx: TxRunner) => Promise<T>,
  explicitNumber?: string | null,
): Promise<T> {
  const MAX_ATTEMPTS = 5;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const code = explicitNumber
      || await withTransaction(tx => nextSequentialCode(prefix, table, column, tx));
    try {
      return await withTransaction(tx => fn(code, tx));
    } catch (err: any) {
      const duplicate = err?.code === 'ER_DUP_ENTRY' && String(err.message).includes(column);
      if (!duplicate || explicitNumber || attempt === MAX_ATTEMPTS) throw err;
      await new Promise(r => setTimeout(r, 10 + Math.random() * 40));
    }
  }
  throw new Error('Gagal menerbitkan nomor dokumen');
}

// Dipertahankan untuk pemakaian yang tidak menyentuh kolom unik

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

// Ikut transaction pemanggil kalau ada. Tanpa ini, fungsi ini mengambil koneksi
// BARU sementara transaction pemanggil masih memegang koneksinya sendiri. Saat
// 20 permintaan serentak menghabiskan pool (10 koneksi), semuanya menunggu
// koneksi kesebelas yang tidak akan pernah tersedia — request menggantung, bukan
// sekadar melambat.
const syncScheduleAPStatus = async (scheduleId: number, apId: number, tx?: TxRunner) => {
  const get = tx ? tx.get : dbGet;
  const run = tx ? tx.run : dbRun;
  const ap = await get('SELECT amount, paid_amount, status FROM accounts_payable WHERE id = ?', [apId]) as any;
  if (!ap) return;
  await run(
    'UPDATE purchase_order_payment_schedules SET paid_amount = ?, status = ?, ap_id = ? WHERE id = ?',
    [Number(ap.paid_amount || 0), ap.status || 'open', apId, scheduleId]
  );
};

/**
 * PROC-R17: satu pintu untuk membaca PR yang masih aktif.
 *
 * Daftar, detail, dan update memang sudah memfilter `is_deleted = 0`, tapi
 * endpoint operasional berbasis `:prId` — approve, buat bid, pilih pemenang,
 * generate PO, ringkasan bid, unggah lampiran — masih membaca PR apa adanya.
 * Akibatnya PR yang sudah dibatalkan tetap bisa dipakai sebagai sumber PO lewat
 * API, meski di layar sudah hilang.
 */
const getActivePurchaseRequest = async (
  id: any,
  columns: string = '*',
  runner?: TxRunner,
): Promise<any> => {
  const get = runner ? runner.get : dbGet;
  return get(`SELECT ${columns} FROM purchase_requests WHERE id = ? AND is_deleted = 0`, [id]);
};

/**
 * PROC-R25: satu pintu untuk membaca bid milik sebuah PR.
 *
 * Menjawab dua hal sekaligus yang selama ini dicek terpisah — atau tidak dicek
 * sama sekali:
 *
 * 1. PR-nya masih aktif (belum dibatalkan). `getActivePurchaseRequest` sudah
 *    dipakai di endpoint PR, tapi subresource bid masih bekerja langsung ke
 *    tabel `pr_bids` sehingga PR yang sudah dibatalkan masih bisa diutak-atik
 *    lewat jalur bid.
 * 2. Bid-nya benar-benar milik PR di URL. Endpoint select sempat meng-UPDATE
 *    dengan `WHERE id = ? AND pr_id = ?` (benar), tapi setelah itu membaca
 *    vendornya dengan `SELECT vendor_id FROM pr_bids WHERE id = ?` saja —
 *    tanpa `pr_id`. Akibatnya `selected_vendor_id` milik PR-A bisa terisi
 *    vendor dari bid milik PR-B.
 */
const getActivePrBid = async (
  prId: any, bidId: any, runner?: TxRunner,
): Promise<{ pr: any; bid: any } | null> => {
  const get = runner ? runner.get : dbGet;
  const pr = await getActivePurchaseRequest(prId, '*', runner);
  if (!pr) return null;
  const bid = await get('SELECT * FROM pr_bids WHERE id = ? AND pr_id = ?', [bidId, prId]);
  if (!bid) return null;
  return { pr, bid };
};

const upsertPaymentSchedules = async (params: {
  poId: number;
  poData: any;
  items: any[];
  paymentSchedules?: any[];
  // PROC-R04/R06: kalau dipanggil dari dalam transaction, seluruh query di sini
  // harus ikut transaction yang sama — kalau tidak, jadwal pembayaran dan AP
  // tetap tersimpan meski PO-nya di-rollback.
  tx?: TxRunner;
}) => {
  const { poId, poData, items, paymentSchedules, tx } = params;
  const run = tx ? tx.run : dbRun;
  const all = tx ? tx.all : dbAll;
  const get = tx ? tx.get : dbGet;
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
  const existingSchedules = await all('SELECT * FROM purchase_order_payment_schedules WHERE po_id = ? ORDER BY schedule_no ASC', [poId]);
  const existingByNo = new Map(existingSchedules.map(schedule => [Number(schedule.schedule_no), schedule]));
  const usedScheduleNos = new Set<number>();

  for (const schedule of schedules) {
    usedScheduleNos.add(Number(schedule.schedule_no));
    const existing = existingByNo.get(Number(schedule.schedule_no)) as any;
    if (existing) {
      await run(
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
        const ap = await get('SELECT id, paid_amount FROM accounts_payable WHERE id = ?', [existing.ap_id]) as any;
        if (ap) {
          const nextStatus = Number(ap.paid_amount || 0) >= Number(schedule.amount || 0)
            ? 'paid'
            : Number(ap.paid_amount || 0) > 0
              ? 'partial'
              : 'open';
          await run(
            'UPDATE accounts_payable SET due_date = ?, amount = ?, status = ?, po_id = ? WHERE id = ?',
            [schedule.due_date, Number(schedule.amount || 0), nextStatus, poId, existing.ap_id]
          );
          await syncScheduleAPStatus(existing.id, existing.ap_id, tx);
        }
      } else {
        const apResult = await run(
          `INSERT INTO accounts_payable (po_id, vendor_id, po_schedule_id, invoice_number, invoice_date, due_date, amount, paid_amount, status, notes)
           VALUES (?, ?, ?, ?, ?, ?, ?, 0, 'open', ?)`,
          [poId, vendorId || null, existing.id, null, null, schedule.due_date || new Date().toISOString().slice(0,10), Number(schedule.amount || 0), schedule.notes || `Auto-generated from PO schedule ${schedule.label}`]
        );
        await run('UPDATE purchase_order_payment_schedules SET ap_id = ? WHERE id = ?', [apResult.insertId, existing.id]);
        await syncScheduleAPStatus(existing.id, apResult.insertId, tx);
      }
      continue;
    }

    const scheduleResult = await run(
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
    const apResult = await run(
      `INSERT INTO accounts_payable (po_id, vendor_id, po_schedule_id, invoice_number, invoice_date, due_date, amount, paid_amount, status, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0, 'open', ?)`,
      [poId, vendorId || null, scheduleResult.insertId, null, null, schedule.due_date || new Date().toISOString().slice(0,10), Number(schedule.amount || 0), schedule.notes || `Auto-generated from PO schedule ${schedule.label}`]
    );
    await run('UPDATE purchase_order_payment_schedules SET ap_id = ? WHERE id = ?', [apResult.insertId, scheduleResult.insertId]);
    await syncScheduleAPStatus(scheduleResult.insertId, apResult.insertId, tx);
  }

  for (const existing of existingSchedules as any[]) {
    if (usedScheduleNos.has(Number(existing.schedule_no))) continue;
    if (existing.ap_id) {
      const ap = await get('SELECT paid_amount FROM accounts_payable WHERE id = ?', [existing.ap_id]) as any;
      if (ap && Number(ap.paid_amount || 0) > 0) {
        throw new Error(`Cannot remove payment schedule ${existing.label}: linked AP already has payments`);
      }
      await run('DELETE FROM accounts_payable WHERE id = ?', [existing.ap_id]);
    }
    await run('DELETE FROM purchase_order_payment_schedules WHERE id = ?', [existing.id]);
  }
};

// Vendors CRUD
router.get('/vendors', authMiddleware, requirePermission('procurement.vendor-price-list.view'), async (req: Request, res: Response) => {
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
router.get('/vendors/next-code/:category', authMiddleware, requirePermission('procurement.vendor-price-list.view'), async (req: Request, res: Response) => {
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

router.get('/vendors/:id', authMiddleware, requirePermission('procurement.vendor-price-list.view'), async (req: Request, res: Response) => {
  try {
    const vendor = await dbGet('SELECT * FROM vendors WHERE id = ?', [req.params.id]);
    if (!vendor) return res.status(404).json({ error: 'Vendor not found' });
    res.json({ data: vendor });
  } catch (error) {
    console.error('Error fetching vendor:', error);
    res.status(500).json({ error: 'Failed to fetch vendor' });
  }
});

router.post('/vendors', authMiddleware, requirePermission('procurement.vendor-price-list.create'), async (req: Request, res: Response) => {
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

router.put('/vendors/:id', authMiddleware, requirePermission('procurement.vendor-price-list.edit'), async (req: Request, res: Response) => {
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

router.delete('/vendors/:id', authMiddleware, requirePermission('procurement.vendor-price-list.delete'), async (req: Request, res: Response) => {
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
router.get('/purchase-requests', authMiddleware, requirePermission('procurement.purchase-requests.view'), async (req: Request, res: Response) => {
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
       WHERE pr.is_deleted = 0
       ORDER BY pr.created_at DESC`,
      []
    );
    res.json({ data: prs });
  } catch (error) {
    console.error('Error fetching purchase requests:', error);
    res.status(500).json({ error: 'Failed to fetch purchase requests' });
  }
});

router.get('/purchase-requests/:id', authMiddleware, requirePermission('procurement.purchase-requests.view'), async (req: Request, res: Response) => {
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
       WHERE pr.id = ? AND pr.is_deleted = 0`,
      [req.params.id]
    );
    if (!pr) return res.status(404).json({ error: 'Purchase request not found' });
    res.json({ data: pr });
  } catch (error) {
    console.error('Error fetching purchase request:', error);
    res.status(500).json({ error: 'Failed to fetch purchase request' });
  }
});

router.post('/purchase-requests', authMiddleware, requirePermission('procurement.purchase-requests.create'), async (req: Request, res: Response) => {
  try {
    const { pr_number, requester_id, status, notes, department, request_date, needed_by, reason, project_id } = req.body;
    const explicitNumber = pr_number || null;
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

    // Nomor diterbitkan berurutan. Pembacaan MAX(...) tidak bisa dibuat atomic
    // tanpa lock, jadi penjaganya adalah UNIQUE INDEX: kalau bentrok, nomor
    // berikutnya dicoba — bukan dibalas 500 mentah ke pengguna.
    const { result, number } = await withNumberedDocument(
      'PR', 'purchase_requests', 'pr_number',
      async (code, tx) => {
        const r = await tx.run(
          `INSERT INTO purchase_requests (pr_number, requestor_id, project_id, status, notes, reason, request_date, needed_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            code,
            validRequestor,
            project_id || null,
            (status || 'DRAFT').toUpperCase(),
            notes || null,
            reason || null,
            normalizeDateOnly(request_date) || new Date().toISOString().slice(0, 10),
            normalizeDateOnly(needed_by) || null,
          ]
        );
        return { result: r, number: code };
      },
      explicitNumber,
    );
    res.status(201).json({ message: 'Purchase request created', data: { id: result.insertId, pr_number: number } });
  } catch (error: any) {
    console.error('Error creating purchase request:', error);
    if (error.message?.includes('UNIQUE')) return res.status(400).json({ error: 'PR number must be unique' });
    if (error.message?.includes('FOREIGN KEY')) return res.status(400).json({ error: 'Invalid requester_id - user not found' });
    res.status(500).json({ error: 'Failed to create purchase request' });
  }
});

router.put('/purchase-requests/:id', authMiddleware, requirePermission('procurement.purchase-requests.edit'), async (req: Request, res: Response) => {
  try {
    const { status, notes, request_date, needed_by, reason, project_id,
            vendor_comparisons, selected_vendor_id } = req.body;

    const existing: any = await dbGet('SELECT * FROM purchase_requests WHERE id = ? AND is_deleted = 0', [req.params.id]);
    if (!existing) return res.status(404).json({ error: 'Purchase request tidak ditemukan' });

    // PROC-R16: PR yang sudah melahirkan PO tidak boleh lagi diubah data
    // sumbernya. Item PR disimpan sebagai JSON di dalam `notes`, jadi mengedit
    // notes = mengedit item yang sudah dipakai PO sebagai dasar pemesanan.
    const prHasPo = await dbGet(
      'SELECT id, po_number FROM purchase_orders WHERE pr_id = ? AND is_deleted = 0 LIMIT 1',
      [req.params.id]
    ) as any;

    // Sama seperti PO: yang dilarang adalah MENGUBAH, bukan mengirim ulang nilai
    // yang sama. Form PR selalu menyertakan notes, jadi memblokir berdasarkan
    // kehadiran field akan membuat PR ber-PO tidak bisa disimpan sama sekali.
    const sourceFields: [string, any][] = [
      ['notes', existing.notes],
      ['project_id', existing.project_id],
      ['request_date', existing.request_date],
      ['needed_by', existing.needed_by],
    ];
    const lockedPrFields = sourceFields
      .filter(([k, current]) =>
        Object.prototype.hasOwnProperty.call(req.body, k)
        && String(req.body[k] ?? '') !== String(current ?? ''))
      .map(([k]) => k);

    if (prHasPo && lockedPrFields.length > 0) {
      return res.status(409).json({
        error: `PR ini sudah menerbitkan PO ${prHasPo.po_number || prHasPo.id}, jadi ${lockedPrFields.join(', ')} tidak bisa diubah lagi.`,
        code: 'PR_LOCKED_BY_PO',
        locked_fields: lockedPrFields,
      });
    }

    if (Number(existing.approval_status || 0) >= 2 && lockedPrFields.length > 0) {
      return res.status(409).json({
        error: `PR ini sudah disetujui penuh, jadi ${lockedPrFields.join(', ')} tidak bisa diubah lagi. Reject dulu kalau memang perlu direvisi.`,
        code: 'PR_LOCKED_APPROVED',
        locked_fields: lockedPrFields,
      });
    }

    // PARTIAL UPDATE. Handler lama menimpa seluruh kolom dengan pola
    // `field || default`, padahal ITEM PR disimpan sebagai JSON di dalam
    // kolom `notes`. Menyimpan PR tanpa menyertakan notes akan menghapus
    // seluruh itemnya, dan `status || 'DRAFT'` mengembalikan PR yang sudah
    // disetujui menjadi DRAFT.
    const has = (k: string) => Object.prototype.hasOwnProperty.call(req.body, k);
    const fields: string[] = [];
    const values: any[] = [];
    const set = (col: string, val: any) => { fields.push(`${col} = ?`); values.push(val); };

    if (has('status') && status) set('status', String(status).toUpperCase());
    if (has('notes')) set('notes', notes ?? null);
    if (has('reason')) set('reason', reason ?? null);
    if (has('project_id')) set('project_id', project_id ?? null);
    if (has('request_date')) set('request_date', normalizeDateOnly(request_date) || null);
    if (has('needed_by')) set('needed_by', normalizeDateOnly(needed_by) || null);
    if (has('vendor_comparisons')) {
      set('vendor_comparisons', vendor_comparisons ? JSON.stringify(vendor_comparisons) : null);
    }
    if (has('selected_vendor_id')) set('selected_vendor_id', selected_vendor_id ?? null);

    if (!fields.length) return res.json({ message: 'Tidak ada perubahan' });

    set('updated_at', new Date());
    values.push(req.params.id);
    await dbRun(`UPDATE purchase_requests SET ${fields.join(', ')} WHERE id = ?`, values);
    res.json({ message: 'Purchase request updated' });
  } catch (error: any) {
    console.error('[PR:update]', error?.message || error);
    res.status(500).json({ error: 'Gagal menyimpan purchase request' });
  }
});

// Approve / Reject Purchase Requests
router.delete('/purchase-requests/:id', authMiddleware, requirePermission('procurement.purchase-requests.delete'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Get PR detail
    const pr = await dbGet(`SELECT * FROM purchase_requests WHERE id = ?`, [id]) as any;
    if (!pr) return res.status(404).json({ error: 'PR not found' });

    // Check if any PO still references this PR
    const linkedPO = await dbGet(
      'SELECT id, po_number FROM purchase_orders WHERE pr_id = ? AND is_deleted = 0 LIMIT 1',
      [id]
    ) as any;

    if (linkedPO) {
      return res.status(400).json({ 
        error: `Tidak dapat menghapus PR ini karena masih terikat dengan PO ${linkedPO.po_number || linkedPO.id}. Hapus PO tersebut terlebih dahulu.` 
      });
    }

    if (Number(pr.is_deleted) === 1) {
      return res.status(404).json({ error: 'PR sudah dihapus' });
    }

    // PROC-R08: PR tidak lagi dihapus permanen.
    //
    // Versi lama menghapus pr_bid_items, pr_bids, purchase_request_items, lalu
    // PR-nya — tiga yang pertama lewat safeCleanup yang MENELAN error, sehingga
    // penghapusan separuh jalan tetap dilaporkan sukses. PR yang sudah disetujui
    // atau sudah punya penawaran vendor adalah dasar keputusan pengadaan;
    // hilangnya membuat PO turunannya tidak bisa dipertanggungjawabkan.
    const approved = Number(pr.approval_status || 0) >= 1
      || ['APPROVED', 'PO_GENERATED'].includes(String(pr.status || '').toUpperCase());

    const bidCount = await dbGet('SELECT COUNT(*) AS cnt FROM pr_bids WHERE pr_id = ?', [id]) as any;
    const hasBids = Number(bidCount?.cnt || 0) > 0;

    if (approved || hasBids) {
      const reason = String(req.body?.reason || '').trim();
      if (!reason) {
        return res.status(400).json({
          error: 'PR ini sudah disetujui atau sudah punya penawaran vendor, jadi hanya bisa dibatalkan dengan alasan — bukan dihapus permanen.',
          code: 'REASON_REQUIRED',
          approved,
          bids: Number(bidCount?.cnt || 0),
        });
      }

      await dbRun(
        `UPDATE purchase_requests
         SET is_deleted = 1, deleted_at = CURRENT_TIMESTAMP, deleted_by = ?, deletion_reason = ?
         WHERE id = ?`,
        [(req as any).user?.userId || null, reason, id]
      );

      return res.json({ message: 'Purchase request dibatalkan (soft delete)', soft_deleted: true });
    }

    // PR draft tanpa penawaran: aman dihapus, tapi dalam satu transaction dan
    // tanpa menelan error.
    await withTransaction(async tx => {
      await tx.run('DELETE FROM pr_bid_items WHERE bid_id IN (SELECT id FROM pr_bids WHERE pr_id = ?)', [id]);
      await tx.run('DELETE FROM pr_bids WHERE pr_id = ?', [id]);
      await tx.run('DELETE FROM purchase_request_items WHERE purchase_request_id = ?', [id]);
      await tx.run('DELETE FROM purchase_requests WHERE id = ?', [id]);
    });

    res.json({ message: 'Purchase request deleted successfully' });
  } catch (error: any) {
    console.error('Error deleting purchase request:', error);
    if (error.code === 'ER_ROW_IS_REFERENCED_2' || error.errno === 1451) {
      return res.status(400).json({ error: 'Tidak dapat menghapus PR ini karena masih digunakan di modul lain.' });
    }
    res.status(500).json({ error: 'Failed to delete purchase request: ' + (error.message || 'Unknown error') });
  }
});

router.post('/purchase-requests/:id/restore', authMiddleware, requirePermission('procurement.purchase-requests.delete'), async (req: Request, res: Response) => {
  try {
    const pr = await dbGet('SELECT id, is_deleted FROM purchase_requests WHERE id = ?', [req.params.id]) as any;
    if (!pr) return res.status(404).json({ error: 'PR not found' });
    if (Number(pr.is_deleted) !== 1) {
      return res.status(400).json({ error: 'PR ini tidak dalam status terhapus' });
    }

    await dbRun(
      `UPDATE purchase_requests
       SET is_deleted = 0, deleted_at = NULL, deleted_by = NULL, deletion_reason = NULL
       WHERE id = ?`,
      [req.params.id]
    );
    res.json({ message: 'Purchase request dipulihkan' });
  } catch (error) {
    console.error('Error restoring purchase request:', error);
    res.status(500).json({ error: 'Gagal memulihkan purchase request' });
  }
});

/**
 * CATATAN PENTING soal endpoint approval (PR, PO, GRN).
 *
 * Keenamnya SENGAJA tidak memakai requirePermission, dan itu bukan kelalaian.
 *
 * Di produksi, role "Manager Finannce & Acc" — yang dipakai dua user aktif —
 * TIDAK memiliki satu pun permission `procurement.*.approve*`. Mereka bisa
 * menyetujui selama ini lewat pemeriksaan user_level. Menggembok endpoint ini
 * dengan permission akan langsung mencabut kemampuan approve mereka di modul
 * yang dipakai setiap hari.
 *
 * Endpoint-endpoint ini TIDAK tanpa kendali: otorisasinya lewat approverLevel()
 * yang membaca user_level dan is_active dari DATABASE tiap request.
 *
 * Untuk memindahkannya ke RBAC, urutannya harus: petakan dulu permission
 * approve ke role yang berhak di produksi, verifikasi, BARU tambahkan
 * requirePermission di sini. Bukan sebaliknya.
 */

router.post('/purchase-requests/:id/approve', authMiddleware, async (req: Request, res: Response) => {
  try {
    const prId = req.params.id;
    const userId = (req as any).user?.userId;
    const userLevel = await approverLevel(req);

    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const pr = await getActivePurchaseRequest(prId, 'approval_status') as any;
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
    const userLevel = await approverLevel(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    // Only level 2+ can reject back to pending
    if (userLevel < 2) return res.status(400).json({ error: 'Cannot reject: insufficient level' });

    // PROC-R07: PR yang sudah melahirkan PO tidak boleh dikembalikan ke pending.
    //
    // Reject di sini artinya "kembalikan ke antrean persetujuan". Kalau PO-nya
    // sudah terbit, PR-nya jadi pending sementara PO turunannya tetap berjalan —
    // dokumen sumber seolah belum disetujui padahal barangnya sudah dipesan.
    const linkedPO = await dbGet(
      'SELECT id, po_number FROM purchase_orders WHERE pr_id = ? AND is_deleted = 0 LIMIT 1',
      [prId]
    ) as any;

    if (linkedPO) {
      return res.status(409).json({
        error: `PR ini sudah menerbitkan PO ${linkedPO.po_number || linkedPO.id}, jadi tidak bisa dikembalikan ke pending. Batalkan PO tersebut lebih dulu.`,
        code: 'PR_HAS_PO',
        po_id: linkedPO.id,
        po_number: linkedPO.po_number,
      });
    }

    await dbRun(
      'UPDATE purchase_requests SET approval_status = 0, approved_by_supervisor_id = NULL, approved_by_manager_id = NULL, approved_at_supervisor = NULL, approved_at_manager = NULL WHERE id = ?',
      [prId]
    );
    return res.json({ message: 'PR rejected and reset to pending', approval_status: 0 });
  } catch (error) {
    console.error('Error rejecting PR:', error);
    res.status(500).json({ error: 'Failed to reject purchase request' });
  }
});

// ========== PR Bid Tabulation ==========

// GET /purchase-requests/:prId/bids - list all bids for a PR with their items
router.get('/purchase-requests/:prId/bids', authMiddleware, requirePermission('procurement.purchase-requests.view'), async (req: Request, res: Response) => {
  try {
    const { prId } = req.params;
    if (!await getActivePurchaseRequest(prId, 'id')) {
      return res.status(404).json({ error: 'Purchase request tidak ditemukan atau sudah dibatalkan' });
    }
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
router.post('/purchase-requests/:prId/bids', authMiddleware, requirePermission('procurement.purchase-requests.edit'), async (req: Request, res: Response) => {
  try {
    const { prId } = req.params;
    const { vendor_id, vendor_name, contact_person, phone, email, bid_date, delivery_time_days, notes, selected_items } = req.body;

    // Get PR to parse its items
    const pr = await getActivePurchaseRequest(prId) as any;
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
          `SELECT vp.product_id, vp.price, vp.lead_time_days FROM vendor_prices vp
           WHERE vp.vendor_id = ? AND (vp.valid_until IS NULL OR vp.valid_until >= CURDATE())
             AND ${hargaVendorAktif()}
           ORDER BY vp.effective_date DESC`,
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
router.put('/purchase-requests/:prId/bids/:bidId', authMiddleware, requirePermission('procurement.purchase-requests.edit'), async (req: Request, res: Response) => {
  try {
    const { prId, bidId } = req.params;
    const scope = await getActivePrBid(prId, bidId);
    if (!scope) return res.status(404).json({ error: 'Bid tidak ditemukan pada PR ini, atau PR-nya sudah dibatalkan', code: 'BID_NOT_IN_PR' });

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
router.post('/purchase-requests/:prId/bids/:bidId/select', authMiddleware, requirePermission('procurement.purchase-requests.edit'), async (req: Request, res: Response) => {
  try {
    const { prId, bidId } = req.params;

    const scope = await getActivePrBid(prId, bidId);
    if (!scope) return res.status(404).json({ error: 'Bid tidak ditemukan pada PR ini, atau PR-nya sudah dibatalkan', code: 'BID_NOT_IN_PR' });

    // Reset all bids for this PR to active
    await dbRun("UPDATE pr_bids SET status = 'active' WHERE pr_id = ?", [prId]);
    // Mark this one as selected
    await dbRun("UPDATE pr_bids SET status = 'selected' WHERE id = ? AND pr_id = ?", [bidId, prId]);

    // Update PR selected_vendor_id from the winning bid
    // Dibaca ulang DENGAN pr_id — tanpa itu vendor dari bid milik PR lain bisa
    // masuk ke selected_vendor_id PR ini.
    const bid = await dbGet('SELECT vendor_id FROM pr_bids WHERE id = ? AND pr_id = ?', [bidId, prId]) as any;
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
router.post('/purchase-requests/:prId/bids/:bidId/select-item/:itemIndex', authMiddleware, requirePermission('procurement.purchase-requests.edit'), async (req: Request, res: Response) => {
  try {
    const { prId, bidId } = req.params;
    const scope = await getActivePrBid(prId, bidId);
    if (!scope) return res.status(404).json({ error: 'Bid tidak ditemukan pada PR ini, atau PR-nya sudah dibatalkan', code: 'BID_NOT_IN_PR' });

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
router.delete('/purchase-requests/:prId/bids/:bidId', authMiddleware, requirePermission('procurement.purchase-requests.delete'), async (req: Request, res: Response) => {
  try {
    const { prId, bidId } = req.params;

    const scope = await getActivePrBid(prId, bidId);
    if (!scope) return res.status(404).json({ error: 'Bid tidak ditemukan pada PR ini, atau PR-nya sudah dibatalkan', code: 'BID_NOT_IN_PR' });

    // PROC-R26: bid adalah dokumen keputusan pengadaan. Begitu ia menjadi sumber
    // sebuah PO (`purchase_orders.source_bid_id`), menghapusnya membuat PO itu
    // menunjuk ke penawaran yang sudah tidak ada — dasar pemilihan vendornya
    // hilang, padahal PO-nya berjalan terus.
    const poFromBid = await dbGet(
      'SELECT id, po_number FROM purchase_orders WHERE source_bid_id = ? AND is_deleted = 0 LIMIT 1',
      [bidId]
    ) as any;

    if (poFromBid) {
      return res.status(409).json({
        error: `Penawaran ini sudah menjadi sumber PO ${poFromBid.po_number || poFromBid.id}, jadi tidak bisa dihapus. Batalkan PO tersebut lebih dulu bila memang keliru.`,
        code: 'BID_HAS_PO',
        po_id: poFromBid.id,
        po_number: poFromBid.po_number,
      });
    }

    // Dua penghapusan ini dulu berdiri sendiri-sendiri; kalau yang kedua gagal,
    // itemnya sudah lenyap sementara bid-nya masih ada.
    await withTransaction(async tx => {
      await tx.run('DELETE FROM pr_bid_items WHERE bid_id = ?', [bidId]);
      await tx.run('DELETE FROM pr_bids WHERE id = ? AND pr_id = ?', [bidId, prId]);
    });

    res.json({ message: 'Bid deleted' });
  } catch (error) {
    console.error('Error deleting PR bid:', error);
    res.status(500).json({ error: 'Failed to delete bid' });
  }
});

// POST /purchase-requests/:prId/bids/:bidId/upload - upload multiple quotation files
router.post('/purchase-requests/:prId/bids/:bidId/upload', authMiddleware, requirePermission('procurement.purchase-requests.edit'), bidUpload.array('file', 10), handleUploadErrors, async (req: Request, res: Response) => {
  try {
    const { prId, bidId } = req.params;

    const scope = await getActivePrBid(prId, bidId);
    if (!scope) return res.status(404).json({ error: 'Bid tidak ditemukan pada PR ini, atau PR-nya sudah dibatalkan', code: 'BID_NOT_IN_PR' });

    const files = (req as any).files as Express.Multer.File[];
    if (!files || files.length === 0) return res.status(400).json({ error: 'No file uploaded' });

    // Validasi SEMUA berkas dulu sebelum menulis apa pun — kalau satu ditolak,
    // tidak ada berkas separuh yang terlanjur mendarat di disk.
    const checked: { ext: string; buffer: Buffer; originalname: string; size: number }[] = [];
    for (const file of files) {
      const verdict = validateUpload(file.originalname, file.mimetype, file.buffer);
      if (!verdict.ok) {
        return res.status(400).json({ error: `${file.originalname}: ${verdict.error}` });
      }
      checked.push({ ext: verdict.ext!, buffer: file.buffer, originalname: file.originalname, size: file.size });
    }

    // PROC-R22: baris database untuk seluruh berkas ditulis dalam SATU
    // transaction. Sebelumnya tiap berkas di-INSERT sendiri-sendiri; kalau
    // berkas kedua gagal, catch memang menghapus file fisiknya tapi baris
    // database milik berkas pertama sudah terlanjur ter-commit — tersisa baris
    // pr_bid_documents yang menunjuk ke file yang sudah tidak ada.
    const written: string[] = [];
    let inserted: any[] = [];
    try {
      inserted = await withTransaction(async tx => {
        const rows: any[] = [];
        for (const file of checked) {
          const filename = storeValidatedFile(bidUploadDir, file.ext, file.buffer);
          written.push(filename);
          const filePath = '/uploads/bids/' + filename;
          const result = await tx.run(
            'INSERT INTO pr_bid_documents (bid_id, file_path, file_name, file_size) VALUES (?, ?, ?, ?)',
            [bidId, filePath, file.originalname, file.size]
          );
          rows.push({ id: result.insertId, file_path: filePath, file_name: file.originalname, file_size: file.size });
        }

        if (rows.length > 0) {
          await tx.run('UPDATE pr_bids SET quotation_file = ? WHERE id = ?',
            [rows[rows.length - 1].file_path, bidId]);
        }
        return rows;
      });
    } catch (err) {
      for (const filename of written) removeStoredFile(bidUploadDir, filename);
      throw err;
    }

    // quotation_file sudah ikut diperbarui di dalam transaction di atas.
    res.json({ message: `${inserted.length} file(s) uploaded`, files: inserted });
  } catch (error) {
    console.error('Error uploading bid file:', error);
    res.status(500).json({ error: 'Failed to upload file' });
  }
});

// GET /purchase-requests/:prId/bids/:bidId/documents - list all documents for a bid
router.get('/purchase-requests/:prId/bids/:bidId/documents', authMiddleware, requirePermission('procurement.purchase-requests.view'), async (req: Request, res: Response) => {
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

// GET /purchase-requests/:prId/bids/:bidId/documents/:docId/download
//
// DR-P0-05: dokumen penawaran vendor dulu dibuka lewat `/uploads/bids/<uuid>.jpg`
// langsung dari browser — terlayani 200 tanpa token apa pun. 110 dokumen bid di
// produksi berada dalam kondisi itu. Sekarang unduhannya lewat sini, dengan
// permission yang sama seperti melihat daftarnya.
router.get('/purchase-requests/:prId/bids/:bidId/documents/:docId/download', authMiddleware, requirePermission('procurement.purchase-requests.view'), async (req: Request, res: Response) => {
  try {
    const { bidId, docId } = req.params;
    const doc = await dbGet(
      'SELECT file_path, file_name FROM pr_bid_documents WHERE id = ? AND bid_id = ?',
      [docId, bidId]
    ) as any;
    if (!doc) return res.status(404).json({ error: 'Dokumen tidak ditemukan' });

    // `file_path` tersimpan sebagai `/uploads/bids/<berkas>`. Hanya nama
    // berkasnya yang dipakai supaya `../` pada data lama tidak bisa keluar dari
    // folder uploads.
    const namaBerkas = path.basename(String(doc.file_path || ''));
    if (!namaBerkas) return res.status(404).json({ error: 'Dokumen tidak ditemukan' });

    const berkas = path.join(process.cwd(), 'uploads', 'bids', namaBerkas);
    if (!fs.existsSync(berkas)) return res.status(404).json({ error: 'Berkas sudah tidak ada di server' });

    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.download(berkas, doc.file_name || namaBerkas);
  } catch (error) {
    console.error('Error downloading bid document:', error);
    res.status(500).json({ error: 'Gagal mengunduh dokumen' });
  }
});

// DELETE /purchase-requests/:prId/bids/:bidId/documents/:docId - delete single document
router.delete('/purchase-requests/:prId/bids/:bidId/documents/:docId', authMiddleware, requirePermission('procurement.purchase-requests.delete'), async (req: Request, res: Response) => {
  try {
    const { bidId, docId } = req.params;
    const doc = await dbGet('SELECT file_path FROM pr_bid_documents WHERE id = ? AND bid_id = ?', [docId, bidId]) as any;
    if (!doc) return res.status(404).json({ error: 'Document not found' });

    // Delete physical file. Path-nya berasal dari database, tapi tetap dikurung
    // ke folder bids — baris lama di tabel bisa saja memuat path warisan.
    const fullPath = resolveInsideUploadDir(bidUploadDir, doc.file_path);
    if (fullPath) {
      try { fs.unlinkSync(fullPath); } catch { /* file may not exist */ }
    }

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
router.get('/purchase-requests/:prId/bid-winner', authMiddleware, requirePermission('procurement.purchase-requests.view'), async (req: Request, res: Response) => {
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
router.get('/purchase-requests/:prId/bid-summary', authMiddleware, requirePermission('procurement.purchase-requests.view'), async (req: Request, res: Response) => {
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
router.post('/purchase-requests/:prId/generate-pos', authMiddleware, requirePermission('procurement.purchase-orders.create'), async (req: Request, res: Response) => {
  try {
    const { prId } = req.params;
    const userId = (req as any).user?.userId;

    // Validate PR is approved
    const pr = await getActivePurchaseRequest(prId) as any;
    if (!pr) return res.status(404).json({ error: 'PR not found' });
    if ((pr.approval_status || 0) < 2) {
      return res.status(400).json({ error: 'PR belum diapprove. Approve PR terlebih dahulu sebelum generate PO.' });
    }

    // Check if PR already has POs (prevent duplicate generation)
    if (pr.status === 'PO_GENERATED') {
      const existingPOs = await dbAll('SELECT id, po_number FROM purchase_orders WHERE pr_id = ? AND is_deleted = 0', [prId]) as any[];
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
    const skipped: any[] = [];
    for (const { bid, items } of vendorGroups) {
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

      // PROC-R04 + PROC-R05: satu PO hasil tabulasi = satu transaction, dengan
      // nomor yang diulang kalau bentrok.
      //
      // PROC-R19: tiap PO menyimpan `source_bid_id`, dan UNIQUE (pr_id,
      // source_bid_id) membuat percobaan kedua untuk bid yang sama ditolak
      // database. Jadi kalau vendor ketiga gagal dan user menekan generate lagi,
      // vendor A dan B TIDAK mendapat PO kedua — hanya vendor yang belum
      // berhasil yang diproses.
      let poId: number;
      let poNumber: string;
      try {
        const made = await withNumberedDocument(
          'PO', 'purchase_orders', 'po_number',
          async (code, tx) => {
            const poResult = await tx.run(
              `INSERT INTO purchase_orders (po_number, pr_id, vendor_id, status, total_amount, notes, po_date, source_bid_id)
               VALUES (?, ?, ?, 'draft', ?, ?, DATE(NOW()), ?)`,
              [code, prId, vendorId, subTotal, JSON.stringify(notesData), bid.id]
            );
            const newPoId = poResult.insertId;

            // Insert PO items — both po_id and purchase_order_id to match existing schema
            for (const item of items) {
              await tx.run(
                `INSERT INTO purchase_order_items (purchase_order_id, po_id, product_id, quantity, unit_price, uom, notes)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [newPoId, newPoId, item.product_id || null, Number(item.quantity), Number(item.unit_price), item.uom || '', item.item_name]
              );
            }

            return { poId: newPoId, poNumber: code };
          }
        );
        poId = made.poId;
        poNumber = made.poNumber;
      } catch (err: any) {
        if (err?.code === 'ER_DUP_ENTRY' && String(err.message).includes('uniq_po_pr_bid')) {
          const already = await dbGet(
            'SELECT id, po_number FROM purchase_orders WHERE pr_id = ? AND source_bid_id = ?',
            [prId, bid.id]
          ) as any;
          skipped.push({ vendor_name: vendorName, po_number: already?.po_number, po_id: already?.id });
          continue;
        }
        throw err;
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
      message: skipped.length > 0
        ? `${createdPOs.length} draft PO dibuat, ${skipped.length} vendor sudah punya PO sebelumnya`
        : `${createdPOs.length} draft PO berhasil dibuat`,
      data: createdPOs,
      skipped,
    });
  } catch (error: any) {
    console.error('Error generating POs from bid:', error);
    res.status(500).json({ error: 'Failed to generate POs: ' + (error.message || 'Unknown error') });
  }
});

// GET /purchase-requests/:prId/bid-progress - updated to use is_winner count
router.get('/purchase-requests/:prId/bid-progress', authMiddleware, requirePermission('procurement.purchase-requests.view'), async (req: Request, res: Response) => {
  try {
    const { prId } = req.params;

    const pr = await getActivePurchaseRequest(prId, 'notes') as any;
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

router.get('/purchase-orders', authMiddleware, requirePermission('procurement.purchase-orders.view'), async (req: Request, res: Response) => {
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
       WHERE po.is_deleted = 0
       ORDER BY po.created_at DESC`
    );
    
    console.log('[PO List] Orders retrieved:', (orders || []).length);
    res.json({ data: orders });
  } catch (error) {
    console.error('Error fetching purchase orders:', error);
    res.status(500).json({ error: 'Failed to fetch purchase orders' });
  }
});

router.get('/purchase-orders/:id', authMiddleware, requirePermission('procurement.purchase-orders.view'), async (req: Request, res: Response) => {
  try {
    const order = await dbGet(
      `SELECT po.*, v.name as vendor_name, pr.pr_number,
              cp.project_name, cp.project_number
       FROM purchase_orders po
       LEFT JOIN vendors v ON po.vendor_id = v.id
       LEFT JOIN purchase_requests pr ON po.pr_id = pr.id
       LEFT JOIN client_projects cp ON po.project_id = cp.id
       WHERE po.id = ? AND po.is_deleted = 0`,
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

router.post('/purchase-orders', authMiddleware, requirePermission('procurement.purchase-orders.create'), async (req: Request, res: Response) => {
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
      const pr = await getActivePurchaseRequest(pr_id, 'approval_status, status, notes') as any;
      if (!pr) {
        return res.status(400).json({ error: 'PR not found' });
      }
      if (pr.approval_status !== 2) {
        return res.status(400).json({ error: 'Cannot create PO: PR must be fully approved (2/2) first' });
      }

      // Check if PR already has POs generated
      if (pr.status === 'PO_GENERATED') {
        const existingPOs = await dbAll('SELECT id, po_number FROM purchase_orders WHERE pr_id = ? AND is_deleted = 0', [pr_id]) as any[];
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

    const { contractTotal } = parsePOFinancials(notes, items, Number(discount_percent || 0), Number(ppn_percent || 0));

    try {
      // PROC-R04 + PROC-R05: pembuatan PO kini satu transaction penuh, dan
      // nomornya diterbitkan lewat helper yang mengulang saat UNIQUE bentrok.
      //
      // Sebelumnya header, item, jadwal pembayaran, dan AP di-INSERT berurutan
      // dengan autocommit. Kalau item ketiga gagal, header dan dua item pertama
      // sudah terlanjur tersimpan — PO setengah jadi yang tetap terlihat di
      // daftar. Nomornya juga diambil langsung dari nextSequentialCode, jadi dua
      // permintaan bersamaan bisa membaca MAX() yang sama lalu satu dibalas 500.
      const { poId, number } = await withNumberedDocument(
        'PO', 'purchase_orders', 'po_number',
        async (code, tx) => {
          {
            // If PR has a project_id, inherit it
            let effectiveProjectId = project_id || null;
            if (!effectiveProjectId && pr_id) {
              const prRow = await getActivePurchaseRequest(pr_id, 'project_id', tx) as any;
              if (prRow?.project_id) effectiveProjectId = prRow.project_id;
            }

            const poResult = await tx.run(
              `INSERT INTO purchase_orders (
          po_number, po_date, vendor_id, pr_id, project_id, status, approval_status, expected_date, currency,
          payment_term, payment_term_2, address, type, item_type, contact_person, delivery_to,
          advance_payment, discount_percent, ppn_percent, total_amount, notes
        ) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                code,
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

            const newPoId = poResult.insertId;

            for (const item of items) {
              if (!item.quantity || Number(item.quantity) <= 0) {
                throw new Error('Invalid item: quantity is required and must be > 0');
              }
              await tx.run(
                'INSERT INTO purchase_order_items (purchase_order_id, po_id, product_id, quantity, uom, unit_price, currency, notes, proposal_item_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
                [newPoId, newPoId, item.product_id || null, item.quantity, item.uom || null, item.unit_price || 0, item.currency || currency || 'IDR', item.notes || null, item.proposal_item_id || null]
              );
            }

            await upsertPaymentSchedules({
              poId: newPoId,
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
              tx,
            });

            return { poId: newPoId, number: code };
          }
        },
        po_number,
      );

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

router.put('/purchase-orders/:id', authMiddleware, requirePermission('procurement.purchase-orders.edit'), async (req: Request, res: Response) => {
  try {
    const {
      vendor_id, pr_id, project_id, status, po_date, expected_date, currency,
      payment_term, payment_term_2, address, type, item_type, contact_person, delivery_to,
      advance_payment, discount_percent, ppn_percent, notes, items, payment_schedules,
    } = req.body;

    const existing: any = await dbGet('SELECT * FROM purchase_orders WHERE id = ? AND is_deleted = 0', [req.params.id]);
    if (!existing) return res.status(404).json({ error: 'Purchase order tidak ditemukan' });

    // PROC-R16: begitu transaksi turunan berjalan, field yang mendasarinya
    // dikunci. PO tidak dibekukan total — perubahan administratif seperti alamat
    // atau contact person tetap boleh, karena itu yang dipakai user sehari-hari.
    // Yang dilarang adalah mengubah dasar dari transaksi yang SUDAH terjadi.
    const activeGrnForPo = await dbGet(
      `SELECT id, grn_number FROM goods_receipts
       WHERE po_id = ?
         AND (approval_status IS NULL OR approval_status != -1)
         AND (is_reversed IS NULL OR is_reversed = 0)
       LIMIT 1`,
      [req.params.id]
    ) as any;

    const paidForPo = await dbGet(
      'SELECT COALESCE(SUM(paid_amount), 0) AS total FROM accounts_payable WHERE po_id = ?',
      [req.params.id]
    ) as any;
    const alreadyPaid = Number(paidForPo?.total || 0) > 0;

    const hasField = (k: string) => Object.prototype.hasOwnProperty.call(req.body, k);

    // Yang dilarang adalah MENGUBAH field terkunci, bukan sekadar mengirimnya.
    // Form PO di frontend selalu menyertakan seluruh isi termasuk `items`, jadi
    // menolak berdasarkan "field ada di payload" akan memblokir bahkan
    // perubahan alamat pengiriman pada PO yang barangnya sudah datang.
    const scalarChanged = (k: string, current: any) =>
      hasField(k) && String(req.body[k] ?? '') !== String(current ?? '');

    const canonicalItems = (rows: any[]) => JSON.stringify(
      (rows || [])
        .map((i: any) => [
          i.product_id ?? null,
          Number(i.quantity || 0),
          Number(i.unit_price || 0),
          i.uom || '',
        ])
        .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
    );

    let itemsChanged = false;
    if (Array.isArray(items)) {
      const currentItems = await dbAll(
        'SELECT product_id, quantity, unit_price, uom FROM purchase_order_items WHERE purchase_order_id = ? OR po_id = ?',
        [req.params.id, req.params.id]
      ) as any[];
      itemsChanged = canonicalItems(items) !== canonicalItems(currentItems);
    }

    const blocked: string[] = [];
    let lockReason: 'approved' | 'grn' | 'payment' | null = null;

    // PROC-R23: PO yang sudah disetujui penuh tidak boleh diubah materinya,
    // meski belum ada GRN maupun pembayaran.
    //
    // Guard sebelumnya baru aktif kalau transaksi turunan sudah jalan. Padahal
    // celahnya ada sebelum itu: PO disetujui pada 10 unit × 100.000, lalu
    // diubah jadi 1.000 unit × 500.000 sementara approval_status tetap 2.
    // Approval lama secara efektif ikut menyetujui angka yang tidak pernah
    // dilihat approver.
    //
    // Jalur resminya: reject/reopen PO → ubah → minta approval lagi.
    if (Number(existing.approval_status) === 2) {
      const material: [string, any][] = [
        ['vendor_id', existing.vendor_id],
        ['pr_id', existing.pr_id],
        ['project_id', existing.project_id],
        ['currency', existing.currency],
        ['discount_percent', existing.discount_percent],
        ['ppn_percent', existing.ppn_percent],
        ['advance_payment', existing.advance_payment],
        ['payment_term', existing.payment_term],
        ['payment_term_2', existing.payment_term_2],
      ];
      for (const [f, current] of material) {
        if (scalarChanged(f, current)) blocked.push(f);
      }
      if (itemsChanged) blocked.push('items');
      if (blocked.length > 0) lockReason = 'approved';
    }

    if (activeGrnForPo) {
      // Barangnya sudah diterima — vendor, item, dan kuantitasnya tidak boleh
      // berubah, karena GRN merujuk ke apa yang tertulis di PO ini.
      if (scalarChanged('vendor_id', existing.vendor_id) && !blocked.includes('vendor_id')) blocked.push('vendor_id');
      if (itemsChanged && !blocked.includes('items')) blocked.push('items');
      if (blocked.length > 0) lockReason = 'grn';
    }

    if (alreadyPaid) {
      // Uangnya sudah keluar — nilai kontraknya tidak boleh berubah lagi.
      const financial: [string, any][] = [
        ['advance_payment', existing.advance_payment],
        ['discount_percent', existing.discount_percent],
        ['ppn_percent', existing.ppn_percent],
        ['payment_term', existing.payment_term],
        ['payment_term_2', existing.payment_term_2],
      ];
      for (const [f, current] of financial) {
        if (scalarChanged(f, current) && !blocked.includes(f)) blocked.push(f);
      }
      if (itemsChanged && !blocked.includes('items')) blocked.push('items');
      if (blocked.length > 0) lockReason = 'payment';
    }

    if (blocked.length > 0) {
      const daftar = blocked.join(', ');
      const pesan = lockReason === 'grn'
        ? `PO ini sudah punya penerimaan barang (${activeGrnForPo.grn_number || activeGrnForPo.id}), jadi ${daftar} tidak bisa diubah lagi.`
        : lockReason === 'payment'
          ? `PO ini sudah memiliki pembayaran tercatat, jadi ${daftar} tidak bisa diubah lagi.`
          : `PO ini sudah disetujui penuh, jadi ${daftar} tidak bisa diubah tanpa persetujuan ulang. Reject PO ini dulu, ubah, lalu ajukan approval lagi.`;

      return res.status(409).json({
        error: pesan,
        code: lockReason === 'grn' ? 'PO_LOCKED_BY_GRN'
          : lockReason === 'payment' ? 'PO_LOCKED_BY_PAYMENT'
            : 'PO_LOCKED_APPROVED',
        locked_fields: blocked,
      });
    }

    // PARTIAL UPDATE. Handler lama melakukan replace penuh dengan pola
    // `field || default`, sehingga field yang tidak dikirim klien tidak sekadar
    // jadi NULL tetapi jatuh ke nilai default:
    //   discount_percent / ppn_percent / advance_payment → 0
    //   type → 'Local', item_type → 'inventory', currency → 'IDR'
    //   po_date → TANGGAL HARI INI
    // Artinya diskon, PPN, dan uang muka bisa hilang hanya karena form tidak
    // menyertakannya, dan tanggal PO melompat ke hari ini.
    const has = (k: string) => Object.prototype.hasOwnProperty.call(req.body, k);
    const fields: string[] = [];
    const values: any[] = [];
    const set = (col: string, val: any) => { fields.push(`${col} = ?`); values.push(val); };

    if (has('vendor_id')) set('vendor_id', vendor_id ?? null);
    if (has('pr_id')) set('pr_id', pr_id ?? null);
    if (has('project_id')) set('project_id', project_id ?? null);
    if (has('status')) set('status', status);
    if (has('po_date')) {
      const d = normalizeDateOnly(po_date || '');
      if (!d) return res.status(400).json({ error: 'po_date tidak valid' });
      set('po_date', d);
    }
    if (has('expected_date')) set('expected_date', normalizeDateOnly(expected_date || '') || null);
    if (has('currency')) set('currency', currency || 'IDR');
    if (has('payment_term')) set('payment_term', payment_term ?? null);
    if (has('payment_term_2')) set('payment_term_2', payment_term_2 ?? null);
    if (has('address')) set('address', address ?? null);
    if (has('type')) set('type', type || 'Local');
    if (has('item_type')) set('item_type', item_type || 'inventory');
    if (has('contact_person')) set('contact_person', contact_person ?? null);
    if (has('delivery_to')) set('delivery_to', delivery_to ?? null);
    if (has('advance_payment')) set('advance_payment', Number(advance_payment || 0));
    if (has('discount_percent')) set('discount_percent', Number(discount_percent || 0));
    if (has('ppn_percent')) set('ppn_percent', Number(ppn_percent || 0));
    if (has('notes')) set('notes', notes ?? null);

    // Total dihitung ulang hanya kalau ada yang mempengaruhinya. Kalau item
    // tidak dikirim, dipakai item yang tersimpan supaya totalnya tetap benar.
    const affectsTotal = has('items') || has('discount_percent') || has('ppn_percent') || has('notes');
    if (affectsTotal) {
      const itemsForTotal = Array.isArray(items) ? items : await dbAll(
        'SELECT * FROM purchase_order_items WHERE purchase_order_id = ? OR po_id = ?',
        [req.params.id, req.params.id]
      );
      const { contractTotal } = parsePOFinancials(
        has('notes') ? notes : existing.notes,
        itemsForTotal,
        Number(has('discount_percent') ? discount_percent || 0 : existing.discount_percent || 0),
        Number(has('ppn_percent') ? ppn_percent || 0 : existing.ppn_percent || 0),
      );
      set('total_amount', Number(contractTotal || 0));
    }

    set('updated_at', new Date());

    await withTransaction(async tx => {
      if (fields.length) {
        await tx.run(`UPDATE purchase_orders SET ${fields.join(', ')} WHERE id = ?`,
          [...values, req.params.id]);
      }

      // Item hanya disentuh kalau memang dikirim. Dulu DELETE + INSERT berjalan
      // di luar transaction: kalau satu insert gagal setelah DELETE, PO
      // kehilangan SELURUH itemnya secara permanen.
      if (Array.isArray(items)) {
        // Pengaman: mengirim daftar item KOSONG untuk PO yang masih punya item
        // hampir pasti bug klien (mis. filter yang keliru membuang semuanya),
        // bukan maksud pengguna. Backend menolak, kecuali diminta eksplisit
        // lewat ?clear_items=1. Tanpa ini, satu bug di frontend cukup untuk
        // mengosongkan PO tanpa jejak.
        if (items.length === 0) {
          const current: any = await tx.get(
            'SELECT COUNT(*) AS c FROM purchase_order_items WHERE purchase_order_id = ? OR po_id = ?',
            [req.params.id, req.params.id]
          );
          if (Number(current?.c || 0) > 0 && req.query.clear_items !== '1') {
            throw Object.assign(
              new Error('Daftar item kosong padahal PO ini masih punya item — dibatalkan untuk mencegah kehilangan data'),
              { statusCode: 409, code: 'REFUSED_EMPTY_ITEMS', existing_items: Number(current.c) }
            );
          }
        }

        await tx.run('DELETE FROM purchase_order_items WHERE purchase_order_id = ? OR po_id = ?',
          [req.params.id, req.params.id]);
        for (const item of items) {
          await tx.run(
            `INSERT INTO purchase_order_items
              (purchase_order_id, po_id, product_id, quantity, uom, unit_price, currency, notes, proposal_item_id)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [req.params.id, req.params.id, item.product_id, item.quantity, item.uom || null,
              item.unit_price || 0, item.currency || currency || existing.currency || 'IDR',
              item.notes || null, item.proposal_item_id || null]
          );
        }
      }

      // PROC-R18: jadwal pembayaran + AP disinkronkan DI DALAM transaction yang
      // sama, dan pemicunya bukan hanya `items`.
      //
      // Dulu syaratnya `Array.isArray(items) || payment_schedules`, padahal
      // nilai jadwal juga ditentukan oleh payment_term, po_date, expected_date,
      // advance_payment, discount_percent, ppn_percent, notes (total kontrak),
      // dan vendor. Mengirim `{ advance_payment: 40 }` saja mengubah uang muka
      // di PO tapi meninggalkan AP di angka lama.
      //
      // Sinkronisasinya juga dulu dipanggil SETELAH transaction selesai,
      // sehingga PO bisa berubah sementara AP gagal berubah.
      const affectsPaymentSchedule = ['items', 'payment_term', 'po_date', 'expected_date',
        'advance_payment', 'discount_percent', 'ppn_percent', 'notes', 'vendor_id']
        .some(k => has(k)) || !!payment_schedules;

      if (affectsPaymentSchedule) {
        // Kalau `items` tidak dikirim, jadwal tetap harus dihitung dari item yang
        // tersimpan — bukan dari array kosong, yang akan membuat total jadi nol.
        const itemsForSchedule = Array.isArray(items) ? items : await tx.all(
          'SELECT * FROM purchase_order_items WHERE purchase_order_id = ? OR po_id = ?',
          [req.params.id, req.params.id]
        ) as any[];

        await upsertPaymentSchedules({
          poId: Number(req.params.id),
          poData: {
            po_date: has('po_date') ? po_date : existing.po_date,
            expected_date: has('expected_date') ? expected_date : existing.expected_date,
            payment_term: has('payment_term') ? payment_term : existing.payment_term,
            vendor_id: has('vendor_id') ? vendor_id : existing.vendor_id,
            advance_payment: has('advance_payment') ? advance_payment : existing.advance_payment,
            discount_percent: has('discount_percent') ? discount_percent : existing.discount_percent,
            ppn_percent: has('ppn_percent') ? ppn_percent : existing.ppn_percent,
            notes: has('notes') ? notes : existing.notes,
          },
          items: itemsForSchedule,
          paymentSchedules: payment_schedules,
          tx,
        });
      }
    });

    res.json({ message: 'Purchase order updated' });
  } catch (error: any) {
    if (error?.statusCode === 409) {
      return res.status(409).json({
        error: error.message,
        existing_items: error.existing_items,
        hint: 'Kalau memang ingin mengosongkan itemnya, ulangi dengan ?clear_items=1',
        code: error.code,
      });
    }
    console.error('[PO:update]', error?.message || error);
    res.status(500).json({ error: 'Gagal menyimpan purchase order' });
  }
});

router.get('/purchase-orders/:id/payment-schedules', authMiddleware, requirePermission('procurement.purchase-orders.view'), async (req: Request, res: Response) => {
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
    const userLevel = await approverLevel(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const po = await dbGet('SELECT * FROM purchase_orders WHERE id = ? AND is_deleted = 0', [poId]) as any;
    if (!po) return res.status(404).json({ error: 'Purchase order not found' });

    const currentStatus = po.approval_status || 0;
    const approverRow = await dbGet('SELECT id FROM users WHERE id = ?', [userId]) as { id: number } | undefined;
    const approverId = approverRow ? userId : null;

    const regenerateSchedule = async (tx: TxRunner) => {
      const items = await tx.all(
        'SELECT DISTINCT * FROM purchase_order_items WHERE purchase_order_id = ? OR po_id = ?',
        [poId, poId]
      ) as any[];
      await upsertPaymentSchedules({ poId: Number(poId), poData: po, items, tx });
    };

    // PROC-R06: persetujuan PO dan pembuatan jadwal pembayaran + AP kini satu
    // transaction.
    //
    // Sebelumnya UPDATE approval_status di-commit lebih dulu, baru
    // regenerateSchedule() jalan terpisah. Kalau pembuatan jadwal atau AP gagal,
    // PO tetap tercatat fully approved sementara jadwal pembayarannya tidak
    // lengkap — dan approval tidak bisa diulang untuk memperbaikinya karena
    // statusnya sudah 2.
    let outcome: { message: string; approval_status: number } | null = null;

    if (userLevel >= 4 && currentStatus < 2) {
      outcome = { message: 'PO fully approved (DIRECT)', approval_status: 2 };
      await withTransaction(async tx => {
        await tx.run(
          'UPDATE purchase_orders SET approval_status = 2, approved_by_supervisor_id = ?, approved_by_manager_id = ?, approved_at_supervisor = CURRENT_TIMESTAMP, approved_at_manager = CURRENT_TIMESTAMP WHERE id = ?',
          [approverId, approverId, poId]
        );
        await regenerateSchedule(tx);
      });
    } else if (userLevel === 2 && currentStatus === 0) {
      outcome = { message: 'PO approved by supervisor (1/2)', approval_status: 1 };
      await withTransaction(async tx => {
        await tx.run(
          'UPDATE purchase_orders SET approval_status = 1, approved_by_supervisor_id = ?, approved_at_supervisor = CURRENT_TIMESTAMP WHERE id = ?',
          [approverId, poId]
        );
        await regenerateSchedule(tx);
      });
    } else if (userLevel === 3 && currentStatus === 1) {
      outcome = { message: 'PO approved by manager (2/2)', approval_status: 2 };
      await withTransaction(async tx => {
        await tx.run(
          'UPDATE purchase_orders SET approval_status = 2, approved_by_manager_id = ?, approved_at_manager = CURRENT_TIMESTAMP WHERE id = ?',
          [approverId, poId]
        );
        await regenerateSchedule(tx);
      });
    }

    if (!outcome) {
      return res.status(400).json({
        error: 'Cannot approve: insufficient level or invalid status',
        debug: { userLevel, currentStatus, needLevel: currentStatus === 0 ? 2 : 3 }
      });
    }

    return res.json(outcome);
  } catch (error) {
    console.error('Error approving PO:', error);
    res.status(500).json({ error: 'Failed to approve purchase order' });
  }
});

router.post('/purchase-orders/:id/reject', authMiddleware, async (req: Request, res: Response) => {
  try {
    const poId = req.params.id;
    const userId = (req as any).user?.userId;
    const userLevel = await approverLevel(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    if (userLevel < 2) return res.status(400).json({ error: 'Cannot reject: insufficient level' });

    // PROC-R07: PO yang sudah punya penerimaan barang atau sudah dibayar tidak
    // boleh dikembalikan ke pending. Barangnya sudah masuk gudang / uangnya
    // sudah keluar — mengembalikan status persetujuan tidak membatalkan apa pun,
    // hanya membuat catatannya bertentangan.
    const activeGrn = await dbGet(
      `SELECT id, grn_number FROM goods_receipts
       WHERE po_id = ?
         AND (approval_status IS NULL OR approval_status != -1)
         AND (is_reversed IS NULL OR is_reversed = 0)
       LIMIT 1`,
      [poId]
    ) as any;

    if (activeGrn) {
      return res.status(409).json({
        error: `PO ini sudah punya penerimaan barang (${activeGrn.grn_number || activeGrn.id}). Reversal GRN-nya dulu sebelum mengubah status persetujuan PO.`,
        code: 'PO_HAS_GRN',
        grn_id: activeGrn.id,
        grn_number: activeGrn.grn_number,
      });
    }

    const paid = await dbGet(
      'SELECT COALESCE(SUM(paid_amount), 0) AS total FROM accounts_payable WHERE po_id = ?',
      [poId]
    ) as any;

    if (Number(paid?.total || 0) > 0) {
      return res.status(409).json({
        error: 'PO ini sudah memiliki pembayaran tercatat, jadi status persetujuannya tidak bisa dikembalikan ke pending.',
        code: 'PO_HAS_PAYMENT',
        paid_amount: Number(paid.total),
      });
    }

    await dbRun(
      'UPDATE purchase_orders SET approval_status = 0, approved_by_supervisor_id = NULL, approved_by_manager_id = NULL, approved_at_supervisor = NULL, approved_at_manager = NULL WHERE id = ?',
      [poId]
    );
    return res.json({ message: 'PO rejected and reset to pending', approval_status: 0 });
  } catch (error) {
    console.error('Error rejecting PO:', error);
    res.status(500).json({ error: 'Failed to reject purchase order' });
  }
});

// Menghapus PO kini LOGICAL. Versi lama menyapu tabel lain secara manual —
// payment schedule, accounts_payable, grn_items, goods_receipts, dan item PO —
// dengan helper yang menelan setiap error, sehingga kegagalan sebagian tidak
// terlihat. Menghapus goods_receipts juga membuat baris stock_movements
// menggantung: stok sudah masuk gudang tapi dokumen sumbernya lenyap.
router.delete('/purchase-orders/:id', authMiddleware, requirePermission('procurement.purchase-orders.delete'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = (req as any).user?.userId;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const po: any = await dbGet(
      'SELECT id, po_number, status, approval_status, is_deleted FROM purchase_orders WHERE id = ?', [id]
    );
    if (!po) return res.status(404).json({ error: 'Purchase order tidak ditemukan' });
    if (po.is_deleted) return res.status(409).json({ error: 'Purchase order sudah dihapus' });

    // PO yang sudah punya jejak penerimaan atau keuangan tidak boleh dihapus
    // sama sekali — menghapusnya membuat stok, hutang, dan pembayaran
    // kehilangan dokumen sumbernya.
    // Hutang (accounts_payable) dibuat OTOMATIS dari termin pembayaran begitu
    // PO dibuat, jadi keberadaannya saja tidak boleh memblokir. Yang memblokir
    // adalah hutang yang UANGNYA SUDAH KELUAR.
    const trail: any = await dbGet(
      `SELECT
        (SELECT COUNT(*) FROM goods_receipts WHERE po_id = ?) AS grn,
        (SELECT COUNT(*) FROM stock_movements WHERE reference_type = 'GRN'
          AND reference_id IN (SELECT id FROM goods_receipts WHERE po_id = ?)) AS movements,
        (SELECT COUNT(*) FROM accounts_payable WHERE po_id = ? AND COALESCE(paid_amount,0) > 0) AS paid_payables`,
      [id, id, id]
    );
    const grnCount = Number(trail?.grn || 0);
    const movementCount = Number(trail?.movements || 0);
    const paidCount = Number(trail?.paid_payables || 0);

    if (grnCount > 0 || movementCount > 0 || paidCount > 0) {
      return res.status(409).json({
        error: 'PO ini sudah punya jejak penerimaan atau pembayaran dan tidak boleh dihapus',
        goods_receipts: grnCount,
        stock_movements: movementCount,
        paid_payables: paidCount,
        hint: 'Batalkan penerimaan atau pembayarannya lebih dulu bila memang keliru',
        code: 'PO_HAS_TRAIL',
      });
    }

    // Pemeriksaan persetujuan sengaja SETELAH pemeriksaan jejak.
    //
    // Sejak PROC-R24, GRN hanya bisa dibuat dari PO yang sudah disetujui penuh.
    // Artinya setiap PO yang punya jejak penerimaan pasti juga approval_status = 2.
    // Kalau guard persetujuan ditaruh lebih dulu, ia akan selalu menyalip dan
    // pengguna cuma diberi tahu "batalkan persetujuannya" — padahal masalah
    // sebenarnya adalah barangnya sudah diterima, yang tidak selesai dengan
    // membatalkan persetujuan. Pesan yang spesifik harus menang.
    const approvalStatus = Number(po.approval_status || 0);
    if (po.status !== 'draft' && approvalStatus > 0) {
      return res.status(400).json({
        error: `Tidak bisa dihapus: status PO "${po.status}" dengan persetujuan ${approvalStatus}/2. Batalkan persetujuannya dulu.`,
        code: 'PO_STILL_APPROVED',
      });
    }

    // Hutang & jadwal pembayaran yang belum dibayar DIBATALKAN, bukan dihapus —
    // barisnya tetap ada untuk penelusuran, tapi tidak lagi muncul sebagai
    // kewajiban yang harus dibayar.
    await withTransaction(async tx => {
      await tx.run(
        `UPDATE purchase_orders
         SET is_deleted = 1, deleted_at = NOW(), deleted_by = ?, deletion_reason = ?, status = 'cancelled'
         WHERE id = ?`,
        [userId, req.body?.reason || null, id]
      );
      await tx.run(
        `UPDATE accounts_payable SET status = 'cancelled'
         WHERE po_id = ? AND COALESCE(paid_amount,0) = 0`,
        [id]
      );
    });

    res.json({
      message: `Purchase order ${po.po_number} dihapus. Item, jadwal pembayaran, dan dokumen terkaitnya tetap tersimpan.`,
    });
  } catch (error: any) {
    console.error('[PO:delete]', error?.message || error);
    res.status(500).json({ error: 'Gagal menghapus purchase order' });
  }
});

// POST /purchase-orders/:id/restore — pulihkan PO yang dihapus
router.post('/purchase-orders/:id/restore', authMiddleware, requirePermission('procurement.purchase-orders.delete'), async (req: Request, res: Response) => {
  try {
    const po: any = await dbGet('SELECT id, is_deleted FROM purchase_orders WHERE id = ?', [req.params.id]);
    if (!po) return res.status(404).json({ error: 'Purchase order tidak ditemukan' });
    if (!po.is_deleted) return res.status(409).json({ error: 'Purchase order tidak dalam keadaan terhapus' });

    await withTransaction(async tx => {
      await tx.run(
        `UPDATE purchase_orders
         SET is_deleted = 0, deleted_at = NULL, deleted_by = NULL, deletion_reason = NULL, status = 'draft'
         WHERE id = ?`,
        [req.params.id]
      );
      await tx.run(
        `UPDATE accounts_payable SET status = 'open'
         WHERE po_id = ? AND status = 'cancelled' AND COALESCE(paid_amount,0) = 0`,
        [req.params.id]
      );
    });
    res.json({ message: 'Purchase order dipulihkan sebagai draft' });
  } catch (error: any) {
    console.error('[PO:restore]', error?.message || error);
    res.status(500).json({ error: 'Gagal memulihkan purchase order' });
  }
});

// Goods Receipts
router.get('/goods-receipts', authMiddleware, requirePermission('procurement.grn.view'), async (req: Request, res: Response) => {
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

router.get('/goods-receipts/:id', authMiddleware, requirePermission('procurement.grn.view'), async (req: Request, res: Response) => {
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

router.post('/goods-receipts', authMiddleware, requirePermission('procurement.grn.create'), async (req: Request, res: Response) => {
  try {
    const { grn_number, po_id, warehouse_id, status, received_date, received_at, notes, received_by } = req.body;
    if (!po_id) return res.status(400).json({ error: 'po_id is required' });
    if (!warehouse_id) return res.status(400).json({ error: 'warehouse_id is required' });

    const normalizedDate = normalizeDateOnly(received_date || received_at);
    if (!normalizedDate) return res.status(400).json({ error: 'received_date is required' });

    // PROC-R12: penerima barang boleh berbeda dari pembuat dokumen — itu memang
    // realitas gudang. Yang tidak boleh adalah pembuatnya tidak tercatat.
    //
    // Dulu `received_by` diambil dari body kalau ada, dan hanya dicek "user ini
    // ada atau tidak". Jadi user A bisa membuat GRN yang seluruhnya tercatat
    // atas nama user B, tanpa jejak siapa yang sebenarnya menginput. Sekarang
    // `created_by` SELALU dari token dan tidak bisa dikirim klien.
    const creator = (req as any).user?.userId || null;

    let receiver = received_by || creator || 1;
    const userExists = await dbGet('SELECT id FROM users WHERE id = ?', [receiver]);
    if (!userExists) {
      console.warn(`⚠️ User ID ${receiver} not found, memakai pembuat dokumen`);
      receiver = creator || 1;
    }
    
    // Universal Rule: Prevent creating a new GRN if an active GRN already exists for this PO.
    // GRN yang direversal ikut dihitung tidak aktif — stoknya sudah dikembalikan,
    // jadi PO-nya memang perlu bisa dibuatkan GRN pengganti. GRN yang di-reject
    // aman dihitung tidak aktif karena reject kini mustahil terjadi setelah stok
    // masuk (lihat PROC-R02).
    console.log('🔍 GRN Create Debug:', { po_id, warehouse_id, receiver, date: normalizedDate });

    // PROC-R05: nomor GRN lewat helper yang mengulang saat UNIQUE bentrok.
    // PROC-R15: pemeriksaan "satu GRN aktif per PO" dipindah KE DALAM transaction,
    // didahului lock pada baris PO-nya.
    //
    // Sebelumnya pemeriksaan itu dilakukan di luar transaction, jadi dua
    // permintaan bersamaan untuk PO yang sama sama-sama tidak menemukan GRN aktif
    // lalu keduanya menyisipkan GRN. Counter nomor tidak menolong di sini — yang
    // dijaminnya nomor GRN unik, bukan jumlah GRN aktif per PO.
    //
    // `SELECT ... FOR UPDATE` pada purchase_orders membuat permintaan kedua
    // menunggu sampai yang pertama commit, sehingga pemeriksaan ulang di
    // dalamnya melihat GRN yang baru dibuat.
    const created = await withNumberedDocument(
      'GRN', 'goods_receipts', 'grn_number',
      async (code, tx) => {
        const po = await tx.get(
          'SELECT id, approval_status, is_deleted, po_number FROM purchase_orders WHERE id = ? FOR UPDATE',
          [po_id]
        ) as any;
        if (!po) return { conflict: 'PO tidak ditemukan' as string, code: 'PO_NOT_FOUND', status: 404 };

        // PROC-R24: PO harus benar-benar disetujui sebelum barangnya bisa
        // diterima. Sebelumnya di sini hanya dicek "PO-nya ada atau tidak",
        // sehingga PO draft (approval_status = 0) bisa langsung dibuatkan GRN,
        // GRN-nya disetujui, dan stok masuk — seluruh rantai approval PO
        // terlewati begitu saja.
        //
        // Catatan: kolom `status` bernilai 'approved' TIDAK sama dengan sudah
        // disetujui. `POST /purchase-orders` selalu menginisialisasi
        // approval_status = 0 apa pun isi `status` yang dikirim klien.
        if (Number(po.is_deleted) === 1) {
          return { conflict: 'PO ini sudah dibatalkan, tidak bisa dibuatkan GRN.', code: 'PO_DELETED', status: 409 };
        }

        if (Number(po.approval_status) !== 2) {
          return {
            conflict: `PO ${po.po_number || po_id} belum disetujui penuh, jadi barangnya belum bisa diterima. Selesaikan approval PO lebih dulu.`,
            code: 'PO_NOT_APPROVED',
            status: 409,
          };
        }

        // GRN yang direversal ikut dihitung tidak aktif — stoknya sudah
        // dikembalikan, jadi PO-nya memang perlu bisa dibuatkan GRN pengganti.
        const activeGRN = await tx.get(
          `SELECT id, grn_number FROM goods_receipts
           WHERE po_id = ?
             AND (approval_status IS NULL OR approval_status != -1)
             AND (is_reversed IS NULL OR is_reversed = 0)`,
          [po_id]
        ) as any;

        if (activeGRN) {
          return {
            conflict: `PO ini sudah terikat dengan GRN (${activeGRN.grn_number}). Anda tidak dapat membuat GRN baru untuk PO ini kecuali GRN sebelumnya di-reject atau direversal.`,
            code: 'GRN_ALREADY_EXISTS',
            status: 400,
          };
        }

        const result = await tx.run(
          `INSERT INTO goods_receipts
           (grn_number, po_id, warehouse_id, received_date, received_by, created_by, status, notes)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [code, po_id, warehouse_id, normalizedDate, receiver, creator, status || 'DRAFT', notes || null]
        );
        return { grId: result.insertId, number: code };
      },
      grn_number,
    );

    if ('conflict' in created) {
      return res.status(created.status).json({ error: created.conflict, code: created.code });
    }

    res.status(201).json({ message: 'Goods receipt created', data: { id: created.grId, grn_number: created.number } });
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

router.put('/goods-receipts/:id', authMiddleware, requirePermission('procurement.grn.edit'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { warehouse_id, status, received_date, received_at, notes } = req.body;

    const existing: any = await dbGet('SELECT * FROM goods_receipts WHERE id = ?', [id]);
    if (!existing) return res.status(404).json({ error: 'Goods receipt tidak ditemukan' });

    // PROC-R16: GRN yang stoknya sudah masuk TIDAK boleh diedit.
    //
    // Tanpa ini, GRN approved di gudang A qty 10 bisa diubah jadi gudang B
    // qty 100 — sementara stock_movements-nya tetap mencatat gudang A +10.
    // Dokumen dan kartu stok jadi menggambarkan dua transaksi berbeda.
    //
    // Koreksi GRN yang sudah diposting adalah reversal + GRN baru, bukan edit
    // transaksi lama.
    if (Number(existing.is_reversed) === 1) {
      return res.status(409).json({
        error: 'GRN ini sudah direversal dan disimpan sebagai jejak audit, jadi tidak bisa diubah.',
        code: 'GRN_REVERSED',
      });
    }

    if (Number(existing.approval_status) === 2) {
      return res.status(409).json({
        error: 'GRN ini sudah disetujui dan stoknya sudah masuk, jadi tidak bisa diubah. Lakukan reversal lalu buat GRN baru.',
        code: 'GRN_LOCKED_APPROVED',
        reversal_endpoint: `/api/procurement/goods-receipts/${id}/reverse`,
      });
    }

    // PARTIAL UPDATE — alasan sama seperti PR: item GRN disimpan sebagai JSON
    // di dalam kolom `notes`, dan `status || 'DRAFT'` mengembalikan GRN yang
    // sudah disetujui menjadi DRAFT.
    const has = (k: string) => Object.prototype.hasOwnProperty.call(req.body, k);
    const fields: string[] = [];
    const values: any[] = [];
    const set = (col: string, val: any) => { fields.push(`${col} = ?`); values.push(val); };

    if (has('warehouse_id')) set('warehouse_id', warehouse_id ?? null);
    if (has('status') && status) set('status', status);
    if (has('received_date') || has('received_at')) {
      const d = normalizeDateOnly(received_date || received_at);
      if (!d) return res.status(400).json({ error: 'received_date tidak valid' });
      set('received_date', d);
    }
    if (has('notes')) set('notes', notes ?? null);

    if (!fields.length) return res.json({ message: 'Tidak ada perubahan' });

    values.push(id);
    await dbRun(`UPDATE goods_receipts SET ${fields.join(', ')} WHERE id = ?`, values);
    res.json({ message: 'Goods receipt updated' });
  } catch (error: any) {
    console.error('Error updating goods receipt:', error);
    res.status(500).json({ error: 'Failed to update goods receipt' });
  }
});

router.delete('/goods-receipts/:id', authMiddleware, requirePermission('procurement.grn.delete'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const grn = await dbGet(`SELECT * FROM goods_receipts WHERE id = ?`, [id]) as any;
    if (!grn) return res.status(404).json({ error: 'GRN not found' });

    // PROC-R01: GRN yang stoknya sudah masuk TIDAK BOLEH dihapus.
    //
    // Versi sebelumnya mencoba membalik stok lewat `UPDATE inventory SET
    // quantity_on_hand = ...`. Tabel `inventory` tidak ada di schema — posting
    // memakai `inventory_stocks`. Query itu selalu gagal, errornya ditelan
    // safeCleanup, lalu stock_movements, grn_items, dan GRN tetap dihapus.
    // Hasil akhirnya: stok tetap bertambah sementara seluruh dokumen sumber dan
    // jejak auditnya lenyap.
    //
    // Sekarang pembatalan stok yang sudah masuk hanya lewat reversal, yang
    // meninggalkan dokumen asli tetap utuh.
    const posted = await dbGet(
      'SELECT COUNT(*) AS cnt FROM stock_movements WHERE reference_type = ? AND reference_id = ?',
      ['GRN', id]
    ) as any;

    if (Number(grn.is_reversed) === 1) {
      return res.status(409).json({
        error: 'GRN yang sudah direversal disimpan sebagai jejak audit dan tidak bisa dihapus.',
        code: 'GRN_REVERSED',
      });
    }

    if (Number(grn.approval_status) === 2 || Number(posted?.cnt || 0) > 0) {
      return res.status(409).json({
        error: 'GRN ini sudah disetujui dan stoknya sudah masuk. Gunakan reversal untuk membatalkannya, bukan hapus.',
        code: 'GRN_APPROVED_USE_REVERSAL',
        reversal_endpoint: `/api/procurement/goods-receipts/${id}/reverse`,
      });
    }

    // Sisanya GRN yang belum pernah memposting stok — aman dihapus, tapi dalam
    // satu transaction dan tanpa menelan error, supaya tidak ada penghapusan
    // separuh jalan.
    await withTransaction(async tx => {
      await tx.run('DELETE FROM grn_items WHERE grn_id = ?', [id]);
      await tx.run('DELETE FROM goods_receipts WHERE id = ?', [id]);
    });

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
    const userLevel = await approverLevel(req);

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

    if (Number(grn.is_reversed) === 1) {
      return res.status(409).json({
        error: 'GRN ini sudah direversal dan tidak bisa disetujui lagi. Buat GRN baru untuk penerimaan penggantinya.',
        code: 'GRN_REVERSED',
      });
    }

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

    // Tentukan dulu transisi yang sah — sebelum menyentuh database sama sekali.
    let nextSql: string;
    let nextParams: any[];

    const resetRejected = currentStatus === -1;
    if (resetRejected) currentStatus = 0;

    if (userLevel >= 4 && currentStatus < 2) {
      // Director/Master: langsung approve penuh
      nextSql = `UPDATE goods_receipts
                 SET approval_status = 2, status = 'approved',
                     approved_by_supervisor_id = ?, approved_by_manager_id = ?,
                     approved_at_supervisor = CURRENT_TIMESTAMP,
                     approved_at_manager = CURRENT_TIMESTAMP
                 WHERE id = ?`;
      nextParams = [userId, userId, id];
    } else if (userLevel === 2 && currentStatus === 0) {
      nextSql = `UPDATE goods_receipts
                 SET approval_status = 1, status = 'received',
                     approved_by_supervisor_id = ?, approved_at_supervisor = CURRENT_TIMESTAMP
                 WHERE id = ?`;
      nextParams = [userId, id];
    } else if (userLevel === 3 && currentStatus === 1) {
      nextSql = `UPDATE goods_receipts
                 SET approval_status = 2, status = 'approved',
                     approved_by_manager_id = ?, approved_at_manager = CURRENT_TIMESTAMP
                 WHERE id = ?`;
      nextParams = [userId, id];
    } else {
      console.log('[GRN Approve] Insufficient permissions', { userLevel, currentStatus });
      return res.status(400).json({
        error: 'Cannot approve: insufficient level or invalid status',
        debug: { userLevel, currentStatus, needLevel: currentStatus === 0 ? 2 : 3 }
      });
    }

    // PROC-R03: persetujuan dan posting stok kini SATU transaction.
    //
    // Sebelumnya UPDATE approval di-commit lebih dulu (autocommit), baru posting
    // stok dijalankan di transaction terpisah. Kalau posting gagal, API membalas
    // 500 tapi GRN sudah terlanjur berstatus approved — persis kondisi yang
    // dilarang: "GRN approved, stock movement absent". Sekarang kegagalan
    // posting me-rollback persetujuannya juga.
    let stockResult: { posted: number; skipped: boolean } | null = null;
    try {
      stockResult = await withTransaction(async tx => {
        if (resetRejected) {
          await tx.run(
            `UPDATE goods_receipts
             SET approval_status = 0, status = 'received',
                 approved_by_supervisor_id = NULL, approved_by_manager_id = NULL,
                 approved_at_supervisor = NULL, approved_at_manager = NULL
             WHERE id = ?`,
            [id]
          );
        }

        await tx.run(nextSql, nextParams);

        const updated = await tx.get('SELECT * FROM goods_receipts WHERE id = ?', [id]);
        if (Number(updated.approval_status) !== 2) return null;

        return applyGrnToInventory(updated, items, tx);
      });
    } catch (err: any) {
      console.error('[GRN Approve] Posting stok gagal, persetujuan dibatalkan:', err?.message || err);
      return res.status(500).json({
        error: 'Posting stok gagal, persetujuan dibatalkan. Silakan coba lagi.',
        code: 'STOCK_POSTING_FAILED',
      });
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

    res.json({
      message: 'GRN approval updated',
      data: finalData,
      stock_posted: stockResult ? stockResult.posted : 0,
      stock_already_posted: stockResult ? stockResult.skipped : false,
    });
  } catch (error: any) {
    console.error('Error approving GRN:', error);
    res.status(500).json({ error: 'Failed to approve GRN' });
  }
});

router.post('/goods-receipts/:id/reject', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userLevel = await approverLevel(req);
    if (userLevel < 2) return res.status(400).json({ error: 'Insufficient level to reject' });

    const grn = await dbGet('SELECT * FROM goods_receipts WHERE id = ?', [id]) as any;
    if (!grn) return res.status(404).json({ error: 'GRN not found' });

    // PROC-R02: GRN yang sudah disetujui penuh berarti stoknya SUDAH masuk.
    //
    // Dulu endpoint ini langsung menyetel approval_status = -1 tanpa melihat
    // status sebelumnya, sehingga stok tetap +10 sementara GRN-nya berubah jadi
    // "rejected". Lebih buruk lagi, GRN ber-status -1 dianggap tidak aktif oleh
    // create GRN, jadi PO yang sama bisa dibuatkan GRN kedua — barang datang 10,
    // stok tercatat 20.
    //
    // Membalikkan stok yang sudah masuk adalah pekerjaan reversal, bukan reject.
    if (Number(grn.approval_status) === 2 && Number(grn.is_reversed) !== 1) {
      return res.status(409).json({
        error: 'GRN ini sudah disetujui penuh dan stoknya sudah masuk. Gunakan reversal untuk membatalkannya, bukan reject.',
        code: 'GRN_ALREADY_POSTED',
        reversal_endpoint: `/api/procurement/goods-receipts/${id}/reverse`,
      });
    }

    if (Number(grn.is_reversed) === 1) {
      return res.status(409).json({
        error: 'GRN ini sudah direversal.',
        code: 'GRN_REVERSED',
      });
    }

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

/**
 * PROC-R01/R02 — Reversal GRN.
 *
 * Satu-satunya jalan sah membatalkan GRN yang stoknya sudah masuk. Dokumen
 * aslinya (GRN, grn_items, stock_movements inbound) sengaja TIDAK dihapus —
 * yang dicatat adalah movement pembalik, sehingga kartu stok tetap bisa
 * menjelaskan dari mana angkanya datang.
 *
 * Jumlah yang dibalik dibaca dari `stock_movements` yang benar-benar terposting,
 * bukan dari item di notes. Kalau item di notes sempat diedit setelah approval,
 * membalik berdasarkan notes akan mengurangi jumlah yang salah.
 *
 * Hak aksesnya sama dengan hak hapus GRN: siapa pun yang sebelumnya boleh
 * menghapus GRN (dan dengan itu merusak stok diam-diam) sekarang hanya bisa
 * melakukan reversal yang tercatat. Tidak ada yang kehilangan akses.
 */
router.post('/goods-receipts/:id/reverse', authMiddleware, requirePermission('procurement.grn.delete'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = (req as any).user?.userId;
    const reason = String(req.body?.reason || '').trim();

    if (!reason) {
      return res.status(400).json({ error: 'Alasan reversal wajib diisi', code: 'REASON_REQUIRED' });
    }

    // PROC-R14: SELURUH pemeriksaan berada di dalam transaction, dengan baris GRN
    // dikunci FOR UPDATE.
    //
    // Sebelumnya SELECT GRN, cek is_reversed, dan pembacaan stock_movements
    // dilakukan di luar transaction. Dua permintaan reversal yang datang hampir
    // bersamaan sama-sama membaca is_reversed = 0, lalu keduanya mengurangi stok
    // — barang yang masuk sekali dikembalikan dua kali.
    //
    // PROC-R20: pengurangan stok diberi syarat `quantity >= ?`. Kalau barangnya
    // sudah terpakai sebagian, reversal ditolak alih-alih membuat stok negatif.
    const outcome = await withTransaction(async tx => {
      const grn = await tx.get('SELECT * FROM goods_receipts WHERE id = ? FOR UPDATE', [id]) as any;
      if (!grn) return { error: 404 as const, body: { error: 'GRN not found' } };

      if (Number(grn.is_reversed) === 1) {
        return { error: 409 as const, body: { error: 'GRN ini sudah direversal', code: 'ALREADY_REVERSED' } };
      }

      const movements = await tx.all(
        `SELECT product_id, warehouse_id, quantity FROM stock_movements
         WHERE reference_type = ? AND reference_id = ?`,
        ['GRN', id]
      ) as any[];

      if (movements.length === 0) {
        return {
          error: 409 as const,
          body: {
            error: 'GRN ini belum pernah memposting stok, jadi tidak ada yang perlu direversal. Gunakan reject atau hapus.',
            code: 'NOTHING_TO_REVERSE',
          },
        };
      }

      const grnLabel = grn.grn_number || grn.gr_number || `GRN-${id}`;
      let count = 0;
      for (const mv of movements) {
        const qty = Number(mv.quantity || 0);
        if (!mv.product_id || qty <= 0) continue;

        const dec = await tx.run(
          `UPDATE inventory_stocks
           SET quantity = quantity - ?, last_updated = CURRENT_TIMESTAMP
           WHERE product_id = ? AND warehouse_id = ? AND quantity >= ?`,
          [qty, mv.product_id, mv.warehouse_id, qty]
        );

        if (dec.affectedRows === 0) {
          const current = await tx.get(
            'SELECT quantity FROM inventory_stocks WHERE product_id = ? AND warehouse_id = ?',
            [mv.product_id, mv.warehouse_id]
          ) as any;
          throw Object.assign(new Error('INSUFFICIENT_STOCK_FOR_REVERSAL'), {
            insufficient: {
              product_id: mv.product_id,
              warehouse_id: mv.warehouse_id,
              needed: qty,
              available: Number(current?.quantity || 0),
            },
          });
        }

        // Arah dibawa movement_type, besarannya tetap positif — mengikuti
        // konvensi modul inventory/warehouse.
        await tx.run(
          `INSERT INTO stock_movements
            (product_id, warehouse_id, quantity, movement_type, reference_type, reference_id, notes, created_at)
           VALUES (?, ?, ?, 'outbound', 'GRN_REVERSAL', ?, ?, CURRENT_TIMESTAMP)`,
          [mv.product_id, mv.warehouse_id, qty, id, `Reversal ${grnLabel} - ${reason}`]
        );
        count++;
      }

      await tx.run(
        `UPDATE goods_receipts
         SET is_reversed = 1, reversed_at = CURRENT_TIMESTAMP, reversed_by = ?,
             reversal_reason = ?, status = 'reversed'
         WHERE id = ?`,
        [userId || null, reason, id]
      );

      return { ok: true as const, count };
    });

    if ('error' in outcome) return res.status(outcome.error).json(outcome.body);

    const data = await dbGet('SELECT * FROM goods_receipts WHERE id = ?', [id]);
    res.json({
      message: 'GRN berhasil direversal, stok dikembalikan ke posisi sebelumnya',
      data,
      reversed_items: outcome.count,
    });
  } catch (error: any) {
    // PROC-R20: stok sudah terpakai sebagian, jadi reversal penuh akan membuatnya
    // negatif. Ditolak, bukan dipaksakan — koreksinya lewat stock adjustment.
    if (error?.message === 'INSUFFICIENT_STOCK_FOR_REVERSAL') {
      return res.status(409).json({
        error: 'Stok barang ini sudah berkurang sejak GRN diposting, jadi reversal penuh akan membuat stok negatif. Lakukan stock adjustment lebih dulu.',
        code: 'INSUFFICIENT_STOCK_FOR_REVERSAL',
        detail: error.insufficient,
      });
    }
    console.error('Error reversing GRN:', error);
    res.status(500).json({ error: 'Gagal melakukan reversal GRN' });
  }
});

// Sync approved GRN into inventory (quantity_on_hand / available) and log inventory transactions
/**
 * Posting GRN ke stok.
 *
 * Versi sebelumnya TIDAK PERNAH berhasil di produksi. Query pertamanya menuju
 * tabel `inventory_transactions` yang tidak ada di database, jadi langsung
 * melempar error — lalu errornya ditelan `catch { console.error }` dan API
 * tetap membalas sukses. Kolom yang ditulisnya (`quantity_on_hand`,
 * `quantity_reserved`, `quantity_available`) juga tidak ada; `inventory_stocks`
 * hanya punya `quantity`. Akibatnya seluruh barang yang diterima lewat GRN
 * tercatat di kartu stok tapi saldo stoknya tetap nol.
 *
 * Sekarang: memakai skema yang benar-benar ada, idempoten lewat
 * `stock_movements`, berjalan dalam transaction, dan errornya DILEMPAR
 * sehingga pemanggil tahu kalau posting gagal.
 */
async function applyGrnToInventory(grn: any, items: any[], tx: TxRunner): Promise<{ posted: number; skipped: boolean }> {
  const already: any = await tx.get(
    'SELECT COUNT(*) AS cnt FROM stock_movements WHERE reference_type = ? AND reference_id = ?',
    ['GRN', grn.id]
  );
  if (Number(already?.cnt || 0) > 0) return { posted: 0, skipped: true };

  if (!grn.warehouse_id) {
    throw new Error('GRN tidak memiliki gudang tujuan, stok tidak bisa diposting');
  }

  const grnLabel = grn.grn_number || grn.gr_number || `GRN-${grn.id}`;
  let posted = 0;

  for (const item of items) {
    const qty = Number(item.received_quantity || 0);
    if (!item.product_id || qty <= 0) continue;

    // Upsert memanfaatkan UNIQUE(product_id, warehouse_id) — stok ditambahkan,
    // bukan ditimpa, sehingga penerimaan berulang terakumulasi dengan benar.
    await tx.run(
      `INSERT INTO inventory_stocks (warehouse_id, product_id, quantity)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE quantity = quantity + ?, last_updated = CURRENT_TIMESTAMP`,
      [grn.warehouse_id, item.product_id, qty, qty]
    );

    await tx.run(
      `INSERT INTO stock_movements
        (product_id, warehouse_id, quantity, movement_type, reference_type, reference_id, notes, created_at)
       VALUES (?, ?, ?, 'inbound', 'GRN', ?, ?, CURRENT_TIMESTAMP)`,
      [item.product_id, grn.warehouse_id, qty, grn.id,
        `${grnLabel}${item.remarks ? ' - ' + item.remarks : ''}`]
    );
    posted++;
  }

  return { posted, skipped: false };
}

// ── Manual Price Search ─────────────────────────────────────────────────────
// Search prices by product name/SKU — returns vendor_prices + PO history + standard cost
router.get('/price-search', authMiddleware, requirePermission('procurement.vendor-price-list.view'), async (req: Request, res: Response) => {
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
         WHERE vp.product_id = ? AND ${hargaVendorAktif()}
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
router.get('/products/:product_id/last-po-price', authMiddleware, requirePermission('procurement.vendor-price-list.view'), async (req: Request, res: Response) => {
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
router.get('/vendor-prices', authMiddleware, requirePermission('procurement.vendor-price-list.view'), async (req: Request, res: Response) => {
  try {
    const { vendor_id, product_id, status } = req.query;
    let query = `
      SELECT vp.*, v.name as vendor_name, v.code as vendor_code,
             p.name as product_name, p.sku as product_sku,
             u.full_name as created_by_name,
             sup.full_name as approved_by_supervisor_name,
             mgr.full_name as approved_by_manager_name,
             rej.full_name as rejected_by_name,
             induk.price as harga_sebelumnya
      FROM vendor_prices vp
      LEFT JOIN vendors v ON vp.vendor_id = v.id
      LEFT JOIN products p ON vp.product_id = p.id
      LEFT JOIN users u ON vp.created_by = u.id
      LEFT JOIN users sup ON vp.approved_by_supervisor_id = sup.id
      LEFT JOIN users mgr ON vp.approved_by_manager_id = mgr.id
      LEFT JOIN users rej ON vp.rejected_by = rej.id
      LEFT JOIN vendor_prices induk ON vp.revision_of = induk.id
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

    // Layar INI justru harus bisa melihat baris yang menunggu persetujuan —
    // di sinilah orang menyetujuinya. Yang tidak boleh melihatnya adalah modul
    // lain yang memakai harganya; itu urusan hargaVendorAktif() di query
    // masing-masing, bukan di sini.
    if (status === 'menunggu') query += ' AND vp.approval_status < 2 AND vp.rejected_at IS NULL AND vp.superseded_at IS NULL';
    else if (status === 'pending') query += ' AND vp.approval_status = 0 AND vp.rejected_at IS NULL AND vp.superseded_at IS NULL';
    else if (status === 'partial') query += ' AND vp.approval_status = 1 AND vp.superseded_at IS NULL';
    else if (status === 'approved') query += ` AND ${hargaVendorAktif()}`;
    else if (status === 'rejected') query += ' AND vp.rejected_at IS NOT NULL';
    else if (status === 'superseded') query += ' AND vp.superseded_at IS NOT NULL';
    
    query += ' ORDER BY vp.effective_date DESC, vp.created_at DESC';
    
    const prices = await dbAll(query, params);
    res.json({ data: prices });
  } catch (error) {
    console.error('Error fetching vendor prices:', error);
    res.status(500).json({ error: 'Failed to fetch vendor prices' });
  }
});

router.post('/vendor-prices', authMiddleware, requirePermission('procurement.vendor-price-list.create'), async (req: Request, res: Response) => {
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
    // approval_status ditulis EKSPLISIT 0, tidak menumpang default kolom.
    // Default kolom pernah harus bernilai 2 sesaat saat migrasi menandai data
    // warisan; menggantungkan status harga baru pada nilai default membuat
    // gerbang ini bergantung pada urutan migrasi, bukan pada niat kode.
    const insertSql = `
      INSERT INTO vendor_prices 
      (vendor_id, product_id, price, currency, effective_date, valid_until, min_order_qty, lead_time_days, notes, created_by, approval_status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
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
    
    res.status(201).json({
      message: 'Harga vendor dibuat dan menunggu persetujuan. Harga ini belum dipakai PR/PO sampai disetujui.',
      approval_status: 0,
      data: { id: vpId }
    });
  } catch (error: any) {
    console.error('Error creating vendor price:', error);
    res.status(500).json({ error: 'Failed to create vendor price' });
  }
});

router.put('/vendor-prices/:id', authMiddleware, requirePermission('procurement.vendor-price-list.edit'), async (req: Request, res: Response) => {
  try {
    const { price, currency, effective_date, valid_until, min_order_qty, lead_time_days, notes } = req.body;
    const userId = (req as any).user?.userId;

    const row: any = await dbGet('SELECT * FROM vendor_prices WHERE id = ?', [req.params.id]);
    if (!row) return res.status(404).json({ error: 'Harga vendor tidak ditemukan' });

    if (row.superseded_at) {
      return res.status(409).json({
        error: 'Harga ini sudah digantikan revisi yang lebih baru, jadi tidak bisa diubah lagi.',
        code: 'SUDAH_DIGANTIKAN',
        superseded_by: row.superseded_by,
      });
    }

    // Harga yang sudah berlaku TIDAK diubah di tempat. PR dan PO yang sedang
    // berjalan memakainya sebagai dasar; menimpanya berarti mengubah dasar
    // harga tanpa satu pun persetujuan, dan angka lamanya hilang tanpa jejak.
    // Perubahan menjadi baris revisi yang menunggu persetujuan sendiri.
    if (Number(row.approval_status) === 2) {
      const revisiTerbuka: any = await dbGet(
        'SELECT id FROM vendor_prices WHERE revision_of = ? AND approval_status < 2 AND rejected_at IS NULL LIMIT 1',
        [row.id]
      );
      // Dua revisi terbuka atas induk yang sama akan sama-sama bisa disetujui,
      // dan yang kedua menggantikan induk yang sudah digantikan yang pertama —
      // harga mana yang berlaku menjadi tidak bisa dijawab.
      if (revisiTerbuka) {
        return res.status(409).json({
          error: 'Harga ini sudah punya revisi yang menunggu persetujuan. Selesaikan revisi itu dulu.',
          code: 'REVISI_MASIH_TERBUKA',
          revision_id: revisiTerbuka.id,
        });
      }

      let createdBy: number | null = null;
      if (userId) {
        const u = await dbGet('SELECT id FROM users WHERE id = ?', [userId]);
        if (u) createdBy = userId;
      }

      // vendor_id dan product_id diambil dari baris INDUK, bukan dari body.
      // Revisi yang boleh menunjuk vendor/produk lain bukan revisi — ia harga
      // baru yang menyamar, dan persetujuannya akan mematikan harga yang tidak
      // ada hubungannya dengannya.
      const ins = await dbRun(
        `INSERT INTO vendor_prices
         (vendor_id, product_id, price, currency, effective_date, valid_until,
          min_order_qty, lead_time_days, notes, created_by, approval_status, revision_of)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`,
        [
          row.vendor_id, row.product_id,
          price ?? row.price,
          currency || row.currency || 'IDR',
          effective_date || row.effective_date,
          valid_until || null,
          min_order_qty ?? null,
          lead_time_days ?? null,
          notes ?? null,
          createdBy,
          row.id,
        ]
      );

      return res.status(201).json({
        message: 'Perubahan disimpan sebagai revisi dan menunggu persetujuan. Harga lama tetap berlaku sampai revisi ini disetujui.',
        revision: true,
        approval_status: 0,
        data: { id: ins.insertId, revision_of: row.id },
      });
    }

    // Masih menunggu, disetujui sebagian, atau pernah ditolak → boleh diubah di
    // tempat. Tapi persetujuan yang sudah terkumpul DICABUT: supervisor
    // menyetujui angka tertentu, dan begitu angkanya berubah persetujuan itu
    // tidak lagi berlaku atas apa pun.
    await dbRun(`
      UPDATE vendor_prices 
      SET price = ?, currency = ?, effective_date = ?, valid_until = ?, 
          min_order_qty = ?, lead_time_days = ?, notes = ?,
          approval_status = 0,
          approved_by_supervisor_id = NULL, approved_at_supervisor = NULL,
          approved_by_manager_id = NULL, approved_at_manager = NULL,
          rejected_by = NULL, rejected_at = NULL, rejection_reason = NULL,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [
      price ?? row.price,
      currency || row.currency || 'IDR',
      effective_date || row.effective_date,
      valid_until || null,
      min_order_qty ?? null,
      lead_time_days ?? null,
      notes ?? null,
      req.params.id,
    ]);
    
    res.json({
      message: 'Harga diperbarui dan kembali menunggu persetujuan dari awal',
      approval_status: 0,
    });
  } catch (error) {
    console.error('Error updating vendor price:', error);
    res.status(500).json({ error: 'Failed to update vendor price' });
  }
});

router.delete('/vendor-prices/:id', authMiddleware, requirePermission('procurement.vendor-price-list.delete'), async (req: Request, res: Response) => {
  try {
    const row: any = await dbGet(
      'SELECT id, approval_status, superseded_at, revision_of FROM vendor_prices WHERE id = ?',
      [req.params.id]
    );
    if (!row) return res.status(404).json({ error: 'Harga vendor tidak ditemukan' });

    // Baris yang punya revisi terbuka tidak dihapus lebih dulu: revisinya akan
    // menunjuk induk yang tidak ada, dan saat disetujui ia mencari baris yang
    // sudah lenyap untuk ditandai digantikan.
    const revisiTerbuka: any = await dbGet(
      'SELECT id FROM vendor_prices WHERE revision_of = ? AND approval_status < 2 AND rejected_at IS NULL LIMIT 1',
      [row.id]
    );
    if (revisiTerbuka) {
      return res.status(409).json({
        error: 'Harga ini punya revisi yang menunggu persetujuan. Tolak atau hapus revisi itu dulu.',
        code: 'REVISI_MASIH_TERBUKA',
        revision_id: revisiTerbuka.id,
      });
    }

    // Menghapus baris yang belum disetujui tidak berakibat apa-apa — ia memang
    // belum pernah dipakai siapa pun. Menghapus harga yang SUDAH BERLAKU
    // langsung mencabutnya dari auto-fill PR dan price-search, jadi itu setara
    // dengan membatalkan persetujuan dan menuntut wewenang yang sama.
    if (Number(row.approval_status) === 2 && !row.superseded_at) {
      const userLevel = await approverLevel(req);
      if (userLevel < 3) {
        return res.status(403).json({
          error: 'Harga yang sudah disetujui hanya boleh dihapus Manager ke atas. Untuk mengoreksi angkanya, ubah saja harganya — sistem akan membuat revisi.',
          code: 'BUTUH_LEVEL_MANAGER',
        });
      }
    }

    await withTransaction(async (tx: TxRunner) => {
      await tx.run('DELETE FROM vendor_prices WHERE id = ?', [req.params.id]);

      // Kalau yang dihapus adalah revisi yang sudah menggantikan induknya,
      // induk itu dipulihkan. Tanpa ini produknya tidak punya harga aktif sama
      // sekali padahal harga lamanya masih ada — hanya tersembunyi karena
      // ditandai digantikan oleh baris yang barusan lenyap.
      if (row.revision_of) {
        await tx.run(
          'UPDATE vendor_prices SET superseded_by = NULL, superseded_at = NULL WHERE id = ? AND superseded_by = ?',
          [row.revision_of, row.id]
        );
      }
    });

    res.json({ message: 'Harga vendor dihapus' });
  } catch (error) {
    console.error('Error deleting vendor price:', error);
    res.status(500).json({ error: 'Failed to delete vendor price' });
  }
});

/**
 * ========== APPROVAL HARGA VENDOR (PROC-VPL-01) ==========
 *
 * Dua tingkat, meniru purchase_requests supaya penyetuju yang sama tidak perlu
 * belajar dua alur: 0 (menunggu) -> 1 (supervisor) -> 2 (final, mulai berlaku).
 *
 * ⚠️ Otorisasinya lewat approverLevel(), BUKAN requirePermission — alasannya
 * sama persis dengan approval PR/PO di berkas ini: role "Manager Finannce &
 * Acc" yang dipakai penyetuju aktif di produksi tidak memegang satu pun
 * permission `procurement.*.approve*`. Menggemboknya dengan permission berarti
 * TIDAK ADA seorang pun yang bisa menyetujui harga, dan seluruh price list
 * membeku di hari deploy.
 */
router.post('/vendor-prices/:id/approve', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const userLevel = await approverLevel(req);
    if (userLevel < 2) {
      return res.status(403).json({
        error: 'Level Anda tidak berwenang menyetujui harga vendor',
        code: 'LEVEL_KURANG',
      });
    }

    const approverRow = await dbGet('SELECT id FROM users WHERE id = ?', [userId]) as any;
    const approverId = approverRow ? userId : null;

    const hasil = await withTransaction(async (tx: TxRunner) => {
      // Dikunci karena dua penyetuju yang menekan tombol pada saat yang sama
      // akan sama-sama lolos pemeriksaan status, lalu keduanya menandai induk
      // yang sama sebagai digantikan oleh baris yang berbeda.
      //
      // Cabang penolakan di bawah TIDAK menulis apa pun sebelum return, jadi
      // aman meski withTransaction meng-commit nilai yang dikembalikan —
      // yang di-commit adalah transaksi kosong.
      const row: any = await tx.get('SELECT * FROM vendor_prices WHERE id = ? FOR UPDATE', [req.params.id]);
      if (!row) return { kode: 404, body: { error: 'Harga vendor tidak ditemukan' } };

      if (row.superseded_at) {
        return { kode: 409, body: { error: 'Harga ini sudah digantikan revisi lain', code: 'SUDAH_DIGANTIKAN' } };
      }
      if (row.rejected_at) {
        return { kode: 409, body: {
          error: 'Harga ini sudah ditolak. Ubah dulu angkanya supaya kembali masuk antrean persetujuan.',
          code: 'SUDAH_DITOLAK',
        } };
      }

      const status = Number(row.approval_status || 0);
      if (status >= 2) {
        return { kode: 400, body: { error: 'Harga ini sudah disetujui penuh', approval_status: 2 } };
      }

      let statusBaru: number | null = null;
      if (userLevel >= 4) statusBaru = 2;                      // Director/Master: langsung tuntas
      else if (userLevel === 2 && status === 0) statusBaru = 1; // Supervisor
      else if (userLevel === 3 && status === 1) statusBaru = 2; // Manager

      if (statusBaru === null) {
        return { kode: 400, body: {
          error: status === 0
            ? 'Persetujuan Supervisor (1/2) harus lebih dulu'
            : 'Level Anda tidak cocok untuk tahap persetujuan ini',
          debug: { userLevel, currentStatus: status },
        } };
      }

      if (statusBaru === 1) {
        await tx.run(
          'UPDATE vendor_prices SET approval_status = 1, approved_by_supervisor_id = ?, approved_at_supervisor = CURRENT_TIMESTAMP WHERE id = ?',
          [approverId, row.id]
        );
        return { kode: 200, body: { message: 'Harga disetujui Supervisor (1/2)', approval_status: 1 } };
      }

      // Lompatan langsung oleh Director/Master tetap mencatat tahap supervisor
      // atas namanya sendiri — sama seperti PR. Kalau dibiarkan kosong,
      // riwayatnya terbaca seolah tahap itu dilewati tanpa ada yang
      // bertanggung jawab atasnya.
      await tx.run(
        `UPDATE vendor_prices
         SET approval_status = 2,
             approved_by_supervisor_id = COALESCE(approved_by_supervisor_id, ?),
             approved_at_supervisor = COALESCE(approved_at_supervisor, CURRENT_TIMESTAMP),
             approved_by_manager_id = ?,
             approved_at_manager = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [approverId, approverId, row.id]
      );

      // BARU DI SINI harga lama berhenti berlaku. Selama revisi masih
      // menunggu, harga lama tetap melayani PR/PO — itu justru inti dari model
      // revisi ini: tidak ada jeda produk tanpa harga.
      let menggantikan: number | null = null;
      if (row.revision_of) {
        const r = await tx.run(
          'UPDATE vendor_prices SET superseded_by = ?, superseded_at = CURRENT_TIMESTAMP WHERE id = ? AND superseded_at IS NULL',
          [row.id, row.revision_of]
        );
        if (r.affectedRows > 0) menggantikan = Number(row.revision_of);
      }

      return { kode: 200, body: {
        message: 'Harga disetujui penuh (2/2) dan mulai berlaku',
        approval_status: 2,
        menggantikan,
      } };
    });

    return res.status(hasil.kode).json(hasil.body);
  } catch (error) {
    console.error('Error approving vendor price:', error);
    res.status(500).json({ error: 'Gagal menyetujui harga vendor' });
  }
});

router.post('/vendor-prices/:id/reject', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const userLevel = await approverLevel(req);
    if (userLevel < 2) {
      return res.status(403).json({ error: 'Level Anda tidak berwenang menolak harga vendor', code: 'LEVEL_KURANG' });
    }

    // Alasan diwajibkan, bukan basa-basi: yang mengajukan harus tahu angka mana
    // yang salah supaya bisa memperbaikinya. Penolakan tanpa alasan hanya
    // memutar dokumen bolak-balik.
    const alasan = String(req.body?.reason ?? req.body?.rejection_reason ?? '').trim();
    if (!alasan) {
      return res.status(400).json({ error: 'Alasan penolakan wajib diisi', code: 'ALASAN_WAJIB' });
    }

    const rejecterRow = await dbGet('SELECT id FROM users WHERE id = ?', [userId]) as any;
    const rejecterId = rejecterRow ? userId : null;

    const row: any = await dbGet(
      'SELECT id, approval_status, superseded_at, rejected_at FROM vendor_prices WHERE id = ?',
      [req.params.id]
    );
    if (!row) return res.status(404).json({ error: 'Harga vendor tidak ditemukan' });
    if (row.superseded_at) {
      return res.status(409).json({ error: 'Harga ini sudah digantikan revisi lain', code: 'SUDAH_DIGANTIKAN' });
    }
    if (row.rejected_at) {
      return res.status(409).json({ error: 'Harga ini sudah ditolak sebelumnya', code: 'SUDAH_DITOLAK' });
    }

    // Harga yang SUDAH berlaku tidak ditolak. PR/PO sudah memakainya; menariknya
    // kembali ke antrean membuat dokumen yang sudah terbit kehilangan dasar
    // harganya secara diam-diam. Koreksinya lewat revisi — jalur yang sama
    // dengan perubahan harga biasa.
    if (Number(row.approval_status) >= 2) {
      return res.status(409).json({
        error: 'Harga yang sudah berlaku tidak bisa ditolak. Koreksi angkanya lewat Edit — sistem akan membuat revisi yang menunggu persetujuan.',
        code: 'SUDAH_BERLAKU',
      });
    }

    await dbRun(
      `UPDATE vendor_prices
       SET approval_status = 0,
           approved_by_supervisor_id = NULL, approved_at_supervisor = NULL,
           approved_by_manager_id = NULL, approved_at_manager = NULL,
           rejected_by = ?, rejected_at = CURRENT_TIMESTAMP, rejection_reason = ?
       WHERE id = ?`,
      [rejecterId, alasan, req.params.id]
    );

    res.json({ message: 'Harga vendor ditolak', approval_status: 0, rejection_reason: alasan });
  } catch (error) {
    console.error('Error rejecting vendor price:', error);
    res.status(500).json({ error: 'Gagal menolak harga vendor' });
  }
});

// Procurement History (aggregated view of PR → PO → GRN)
router.get('/procurement-history', authMiddleware, requirePermission('procurement.procurement-history.view'), async (req: Request, res: Response) => {
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
      WHERE pr.is_deleted = 0
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
router.get('/vendors-for-product/:product_id', authMiddleware, requirePermission('procurement.vendor-price-list.view'), async (req: Request, res: Response) => {
  try {
    const { product_id } = req.params;
    
    let vendors: any[] = [];
    try {
      vendors = await dbAll(`
        SELECT DISTINCT v.id, v.code, v.name, v.supply_category
        FROM vendor_prices vp
        JOIN vendors v ON vp.vendor_id = v.id
        WHERE vp.product_id = ? AND ${hargaVendorAktif()}
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
router.get('/vendors-for-items', authMiddleware, requirePermission('procurement.vendor-price-list.view'), async (req: Request, res: Response) => {
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


router.get('/vendor-price-details/:vendor_id/:product_id', authMiddleware, requirePermission('procurement.vendor-price-list.view'), async (req: Request, res: Response) => {
  try {
    const { vendor_id, product_id } = req.params;
    
    let pricing: any = null;
    try {
      pricing = await dbGet(`
        SELECT vp.id, vp.price, vp.currency, vp.lead_time_days, vp.min_order_qty, vp.effective_date, vp.valid_until
        FROM vendor_prices vp
        WHERE vp.vendor_id = ? AND vp.product_id = ? AND ${hargaVendorAktif()}
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
router.get('/material-prices', authMiddleware, requirePermission('procurement.material-price-comparison.view'), async (req: Request, res: Response) => {
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
router.get('/material-prices/comparison', authMiddleware, requirePermission('procurement.material-price-comparison.view'), async (req: Request, res: Response) => {
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
router.get('/material-prices/material/:materialId', authMiddleware, requirePermission('procurement.material-price-comparison.view'), async (req: Request, res: Response) => {
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
router.post('/material-prices', authMiddleware, requirePermission('procurement.material-price-comparison.create'), async (req: Request, res: Response) => {
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
router.put('/material-prices/:id', authMiddleware, requirePermission('procurement.material-price-comparison.edit'), async (req: Request, res: Response) => {
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
router.delete('/material-prices/:id', authMiddleware, requirePermission('procurement.material-price-comparison.delete'), async (req: Request, res: Response) => {
  try {
    await dbRun('DELETE FROM material_vendor_prices WHERE id = ?', [req.params.id]);
    res.json({ message: 'Vendor price deleted' });
  } catch (error) {
    console.error('Error deleting material vendor price:', error);
    res.status(500).json({ error: 'Failed to delete vendor price' });
  }
});

// POST /material-prices/:id/select - mark a vendor price as selected for procurement
router.post('/material-prices/:id/select', authMiddleware, requirePermission('procurement.material-price-comparison.edit'), async (req: Request, res: Response) => {
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
router.post('/purchase-requests/:id/item-attachment', authMiddleware, requirePermission('procurement.purchase-requests.edit'), prAttachUpload.single('file'), handleUploadErrors, async (req: Request, res: Response) => {
  try {
    const pr = await getActivePurchaseRequest(req.params.id, 'id');
    if (!pr) return res.status(404).json({ error: 'Purchase Request not found' });
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const verdict = validateUpload(req.file.originalname, req.file.mimetype, req.file.buffer);
    if (!verdict.ok) return res.status(400).json({ error: verdict.error });

    const filename = storeValidatedFile(prAttachDir, verdict.ext!, req.file.buffer);
    const filePath = '/uploads/pr-attachments/' + filename;
    res.json({ file_path: filePath, original_name: req.file.originalname });
  } catch (error) {
    console.error('Error uploading PR item attachment:', error);
    res.status(500).json({ error: 'Failed to upload attachment' });
  }
});

// Delete a PR item attachment file from disk
router.delete('/purchase-requests/:id/item-attachment', authMiddleware, requirePermission('procurement.purchase-requests.delete'), async (req: Request, res: Response) => {
  try {
    const filePath = req.query.file_path as string;
    if (!filePath) return res.status(400).json({ error: 'file_path query param required' });
    if (!filePath.includes('/pr-attachments/')) return res.status(400).json({ error: 'Invalid file path' });

    // PROC-R11: cek substring saja tidak cukup — path di-resolve dulu dan
    // dipastikan benar-benar berada di dalam folder pr-attachments.
    const absPath = resolveInsideUploadDir(prAttachDir, filePath);
    if (!absPath) return res.status(400).json({ error: 'Invalid file path' });

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
