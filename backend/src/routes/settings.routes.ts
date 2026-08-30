import express, { Request, Response } from 'express';
import { dbGet, dbAll, dbRun } from '../config/database';
import { authMiddleware } from '../middleware/auth';

const router = express.Router();

// Rute literal didaftarkan LEBIH DULU: `/webhooks` akan tertelan `/:key`
// sebagai key bernama "webhooks" kalau urutannya terbalik, dan endpointnya
// tidak akan pernah terpanggil.
// ═══════════════════════════════════════════════════════════════════════════
// Webhook endpoint — terdaftar sungguhan, dan status kirimnya jujur
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Webhook sebelumnya hanya `webhooks.value.push(...)` di browser: hilang saat
 * halaman dimuat ulang, tidak pernah sampai ke server, dan tetap berlabel
 * "active".
 *
 * Sekarang ia benar-benar tersimpan — tapi `delivery_status` menyatakan apa
 * adanya bahwa **pengirimannya belum aktif**. Webhook terdaftar yang tidak
 * pernah terkirim lebih berbahaya daripada yang belum didaftarkan: orang
 * berhenti memeriksa karena mengira sudah jalan.
 *
 * Pengiriman keluar ke URL sembarang adalah keputusan tersendiri — ia
 * mengirim data perusahaan ke pihak luar — jadi tidak dipasang diam-diam.
 */
router.get('/webhooks', authMiddleware, async (_req: Request, res: Response) => {
  try {
    const rows = await dbAll(
      `SELECT id, event, url, is_active, delivery_status, last_delivery_at, last_delivery_code, created_at
       FROM webhook_endpoints ORDER BY event, id`, []);
    res.json({
      data: rows,
      count: (rows as any[]).length,
      // Dinyatakan di level respons juga, supaya layar tidak perlu menyimpulkan.
      pengiriman_aktif: false,
      catatan: 'Webhook tersimpan, tetapi pengirimannya BELUM aktif. '
             + 'Mengaktifkan pengiriman keluar perlu keputusan tersendiri.',
    });
  } catch (e: any) {
    console.error('Error membaca webhook:', e);
    res.status(500).json({ error: e.message });
  }
});

router.post('/webhooks', authMiddleware, async (req: Request, res: Response) => {
  try {
    const event = String(req.body?.event || '').trim();
    const url = String(req.body?.url || '').trim();
    if (!event || !url) {
      return res.status(400).json({
        error: 'event dan url wajib diisi.', code: 'FIELD_WAJIB' });
    }
    // URL divalidasi di sini, bukan saat pengiriman: alamat yang salah bentuk
    // baru ketahuan berbulan-bulan kemudian kalau dibiarkan lolos.
    let parsed: URL;
    try { parsed = new URL(url); } catch {
      return res.status(400).json({ error: 'URL tidak valid.', code: 'URL_TIDAK_VALID' });
    }
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return res.status(400).json({
        error: 'URL webhook harus http atau https.', code: 'PROTOKOL_TIDAK_DIDUKUNG' });
    }

    try {
      const r = await dbRun(
        `INSERT INTO webhook_endpoints (event, url, is_active, created_by)
         VALUES (?, ?, 1, ?)`,
        [event.slice(0, 100), url.slice(0, 1000), (req as any).userId || null]);
      res.status(201).json({
        id: r.insertId, event, url,
        delivery_status: 'belum_aktif',
        message: 'Webhook terdaftar. Pengirimannya belum aktif.',
      });
    } catch (e: any) {
      if (e?.code === 'ER_DUP_ENTRY') {
        return res.status(409).json({
          error: 'Webhook untuk event dan URL itu sudah terdaftar.',
          code: 'WEBHOOK_SUDAH_ADA' });
      }
      throw e;
    }
  } catch (e: any) {
    console.error('Error mendaftarkan webhook:', e);
    res.status(500).json({ error: e.message });
  }
});

router.delete('/webhooks/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const upd: any = await dbRun('DELETE FROM webhook_endpoints WHERE id = ?', [req.params.id]);
    if (!upd?.affectedRows) return res.status(404).json({ error: 'Webhook tidak ditemukan.' });
    res.json({ message: 'Webhook dihapus' });
  } catch (e: any) {
    console.error('Error menghapus webhook:', e);
    res.status(500).json({ error: e.message });
  }
});

// ===== SYSTEM SETTINGS ENDPOINTS =====

/**
 * Nilai yang bersifat rahasia disamarkan saat dibaca massal.
 *
 * `GET /settings/all` hanya berpagar `authMiddleware` — setiap pengguna desktop
 * bisa memanggilnya. Selama tidak ada yang menyimpan rahasia di sana, itu
 * tidak berbahaya; begitu ada, seluruh pengguna bisa membacanya. Penyamaran ini
 * jaring pengaman untuk nilai yang terlanjur masuk, BUKAN izin untuk mulai
 * menyimpan rahasia di tabel ini.
 */
const SEGMEN_RAHASIA = new Set([
  'key', 'keys', 'secret', 'secrets', 'token', 'tokens',
  'password', 'passwd', 'pass', 'apikey', 'credential', 'credentials',
]);
/**
 * Dicocokkan per SEGMEN nama, bukan hanya di ujungnya.
 *
 * Versi pertama memakai `_token$` dan meloloskan `slack_token_2` — akhiran
 * saja tidak cukup, karena nama kunci sering berlanjut. Per segmen juga
 * menghindari salah tangkap seperti "monkey" yang memuat "key".
 */
const RAHASIA = (kunci: string): boolean =>
  String(kunci).toLowerCase().split(/[^a-z0-9]+/).some(seg => SEGMEN_RAHASIA.has(seg));
const samarkan = (row: any) => {
  const rahasia = Number(row?.is_secret) === 1 || RAHASIA(String(row?.setting_key || ''));
  if (!rahasia || !row?.setting_value) return row;
  return { ...row, setting_value: '••••••••', tersamarkan: true };
};

router.get('/all', authMiddleware, async (req: Request, res: Response) => {
  try {
    const settings = await dbAll(
      'SELECT * FROM system_settings ORDER BY category, setting_key ASC'
    );
    res.json({ data: (settings as any[]).map(samarkan) });
  } catch (error) {
    console.error('Error fetching settings:', error);
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

router.get('/category/:category', authMiddleware, async (req: Request, res: Response) => {
  try {
    const settings = await dbAll(
      'SELECT * FROM system_settings WHERE category = ? ORDER BY setting_key ASC',
      [req.params.category]
    );
    res.json({ data: settings });
  } catch (error) {
    console.error('Error fetching category settings:', error);
    res.status(500).json({ error: 'Failed to fetch category settings' });
  }
});

router.get('/:key', authMiddleware, async (req: Request, res: Response) => {
  try {
    const setting = await dbGet(
      'SELECT * FROM system_settings WHERE setting_key = ?',
      [req.params.key]
    );
    if (!setting) {
      return res.status(404).json({ error: 'Setting not found' });
    }
    res.json({ data: setting });
  } catch (error) {
    console.error('Error fetching setting:', error);
    res.status(500).json({ error: 'Failed to fetch setting' });
  }
});

router.post('/', authMiddleware, async (req: Request, res: Response) => {
  try {
    const {
      setting_key,
      setting_value,
      category,
      description,
      data_type,
    } = req.body;

    if (!setting_key || setting_value === undefined) {
      return res
        .status(400)
        .json({ error: 'setting_key and setting_value are required' });
    }

    const result = await dbRun(
      `INSERT INTO system_settings (setting_key, setting_value, category, description, data_type)
       VALUES (?, ?, ?, ?, ?)`,
      [
        setting_key,
        setting_value,
        category || 'general',
        description || null,
        data_type || 'string',
      ]
    );

    res.status(201).json({
      message: 'Setting created',
      data: { id: result.insertId },
    });
  } catch (error) {
    console.error('Error creating setting:', error);
    res.status(500).json({ error: 'Failed to create setting' });
  }
});

router.put('/:key', authMiddleware, async (req: Request, res: Response) => {
  try {
    // Dua nama field diterima, dan itu bukan kelonggaran asal-asalan: layar
    // Integration selama ini mengirim `value` sementara endpoint ini menuntut
    // `setting_value`, jadi SETIAP penyimpanan 400 dan errornya ditelan diam-
    // diam. Menerima keduanya membuat klien lama langsung bekerja; yang lebih
    // penting, kegagalannya sekarang tidak lagi bisa disembunyikan.
    const nilai = req.body?.setting_value !== undefined
      ? req.body.setting_value : req.body?.value;

    if (nilai === undefined) {
      return res.status(400).json({
        error: 'setting_value (atau value) wajib diisi.', code: 'NILAI_WAJIB' });
    }
    if (RAHASIA(String(req.params.key))) {
      // Ditolak, bukan disimpan lalu disamarkan. `system_settings` terbaca
      // seluruh pengguna desktop; rahasia yang masuk ke sini sudah bocor
      // sebelum penyamaran sempat menolong.
      return res.status(400).json({
        error: 'Nilai rahasia tidak boleh disimpan di system_settings — '
             + 'ia terbaca oleh seluruh pengguna. Simpan di environment server.',
        code: 'RAHASIA_DITOLAK',
      });
    }

    // Upsert, bukan update-saja.
    //
    // Seed awal hanya membuat `company_name`, `currency`, dan `timezone`, jadi
    // seluruh kunci `integration_*` dan `api_*` mendapat 404 — konfigurasi yang
    // belum pernah ada tidak akan pernah bisa dibuat lewat layar ini.
    const ada = await dbGet(
      'SELECT setting_key FROM system_settings WHERE setting_key = ?', [req.params.key]);
    if (ada) {
      await dbRun('UPDATE system_settings SET setting_value = ? WHERE setting_key = ?',
        [String(nilai), req.params.key]);
    } else {
      await dbRun(
        `INSERT INTO system_settings (setting_key, setting_value, category, data_type)
         VALUES (?, ?, ?, 'string')`,
        [req.params.key, String(nilai),
         String(req.params.key).startsWith('integration_') || String(req.params.key).startsWith('api_')
           ? 'integration' : 'general']);
    }

    res.json({ message: 'Setting updated', key: req.params.key, dibuat: !ada });
  } catch (error) {
    console.error('Error updating setting:', error);
    res.status(500).json({ error: 'Failed to update setting' });
  }
});

// ===== KPI DASHBOARD ENDPOINTS =====

router.get('/dashboard/overview', authMiddleware, async (req: Request, res: Response) => {
  try {
    // Production KPI
    const production = await dbGet(
      `SELECT 
       COUNT(*) as total_orders,
       SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
       SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) as in_progress,
       SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending
       FROM work_orders`
    );

    // Inventory KPI
    const inventory = await dbGet(
      `SELECT 
       COUNT(*) as total_items,
       SUM(CASE WHEN quantity < reorder_point THEN 1 ELSE 0 END) as low_stock_count
       FROM inventory_stocks`
    );

    // Sales KPI
    const sales = await dbGet(
      `SELECT 
       COUNT(*) as total_orders,
       SUM(total_amount) as total_revenue,
       COUNT(DISTINCT customer_id) as unique_customers
       FROM sales_orders WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)`
    );

    // Finance KPI
    const finance = await dbGet(
      `SELECT 
       SUM(revenue) as total_revenue,
       SUM(cogs) as total_cogs,
       SUM(gross_profit) as total_profit
       FROM financial_summary WHERE period_date >= DATE_SUB(NOW(), INTERVAL 30 DAY)`
    );

    // Outstanding Approvals
    const approvals = await dbGet(
      `SELECT COUNT(*) as count FROM sales_orders WHERE status = 'DRAFT'`
    );

    res.json({
      data: {
        production,
        inventory,
        sales,
        finance,
        approvals,
      },
    });
  } catch (error) {
    console.error('Error fetching dashboard overview:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard overview' });
  }
});

router.get('/dashboard/production', authMiddleware, async (req: Request, res: Response) => {
  try {
    const data = await dbAll(
      `SELECT 
       DATE(created_at) as date,
       COUNT(*) as total_orders,
       SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed
       FROM work_orders
       WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
       GROUP BY DATE(created_at)
       ORDER BY date DESC`
    );

    res.json({ data });
  } catch (error) {
    console.error('Error fetching production KPI:', error);
    res.status(500).json({ error: 'Failed to fetch production KPI' });
  }
});

router.get('/dashboard/inventory', authMiddleware, async (req: Request, res: Response) => {
  try {
    const data = await dbAll(
      `SELECT 
       product_id,
       SUM(quantity) as total_quantity,
       COUNT(*) as warehouse_count
       FROM inventory_stocks
       GROUP BY product_id
       ORDER BY total_quantity ASC
       LIMIT 20`
    );

    res.json({ data });
  } catch (error) {
    console.error('Error fetching inventory KPI:', error);
    res.status(500).json({ error: 'Failed to fetch inventory KPI' });
  }
});

router.get('/dashboard/sales', authMiddleware, async (req: Request, res: Response) => {
  try {
    const data = await dbAll(
      `SELECT 
       DATE(so_date) as date,
       COUNT(*) as order_count,
       SUM(total_amount) as daily_revenue
       FROM sales_orders
       WHERE so_date >= DATE_SUB(NOW(), INTERVAL 30 DAY)
       GROUP BY DATE(so_date)
       ORDER BY date DESC`
    );

    res.json({ data });
  } catch (error) {
    console.error('Error fetching sales KPI:', error);
    res.status(500).json({ error: 'Failed to fetch sales KPI' });
  }
});

router.get('/dashboard/finance', authMiddleware, async (req: Request, res: Response) => {
  try {
    const data = await dbAll(
      `SELECT 
       period_date,
       revenue,
       cogs,
       gross_profit,
       (gross_profit / revenue * 100) as profit_margin_pct
       FROM financial_summary
       WHERE period_date >= DATE_SUB(NOW(), INTERVAL 12 MONTH)
       ORDER BY period_date DESC`
    );

    res.json({ data });
  } catch (error) {
    console.error('Error fetching finance KPI:', error);
    res.status(500).json({ error: 'Failed to fetch finance KPI' });
  }
});

export default router;
