import express, { Request, Response } from 'express';
import crypto from 'crypto';
import { dbAll, dbGet, dbRun, withTransaction, TxRunner } from '../config/database';
import { authMiddleware } from '../middleware/auth';

const router = express.Router();

/**
 * CONTRACT-R51 — ledger kontrak & change order.
 *
 * Sebelum ini, satu-satunya jejak nilai kontrak adalah `client_projects.budget`:
 * satu angka yang bisa ditimpa siapa saja, kapan saja. Tidak ada yang memisahkan
 * nilai yang DISEPAKATI di awal dari perubahan yang disetujui sesudahnya — jadi
 * begitu budget bergeser, tidak ada cara membuktikan berapa nilai aslinya, apa
 * yang mengubahnya, atau siapa yang menyetujuinya.
 *
 * Tiga aturan yang menentukan bentuk modul ini:
 *
 * 1. **Nilai asli tidak pernah berubah.** `contracts.original_value` ditulis
 *    sekali saat award. Change order tidak menyentuhnya.
 * 2. **Baseline immutable.** `contract_baseline_lines` tidak punya satu pun
 *    jalur tulis setelah dibuat. Inilah yang membuat mengedit proposal setelah
 *    award tidak bisa menggeser kontrak — dan itu diuji langsung.
 * 3. **Nilai berjalan dihitung, tidak disimpan.** `revised_value` selalu
 *    `original + SUM(CO approved)`. Kolom denormalisasi akan melenceng dari
 *    isinya, dan selisih itu tidak akan bisa dijelaskan siapa pun.
 */

/** Perpindahan status yang sah untuk change order. */
const TRANSISI_CO: Record<string, string[]> = {
  draft:     ['submitted', 'cancelled'],
  submitted: ['approved', 'rejected', 'draft', 'cancelled'],
  approved:  [],   // final — koreksi dilakukan lewat CO baru, bukan mengubah ini
  rejected:  [],
  cancelled: [],
};

const SUMBER_CO = ['client', 'site', 'rfi', 'design', 'internal'];

const uang = (v: any): number => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
};

/**
 * Nomor dokumen berurutan, dihitung DI DALAM transaction.
 *
 * Dihitung dari `MAX` pada baris yang sudah dikunci, bukan dari pembacaan
 * sebelum transaction dibuka — dua permintaan bersamaan kalau tidak akan
 * mendapat nomor yang sama. Pola yang sama dengan `nextProjectNumber`.
 */
async function nomorBerikut(tx: TxRunner, tabel: string, kolom: string, prefix: string): Promise<string> {
  const tahun = new Date().getFullYear();
  const pola = `${prefix}/${tahun}/%`;
  const row: any = await tx.get(
    `SELECT ${kolom} AS nomor FROM ${tabel}
     WHERE ${kolom} LIKE ? ORDER BY LENGTH(${kolom}) DESC, ${kolom} DESC LIMIT 1 FOR UPDATE`,
    [pola]
  );
  const urutan = row?.nomor ? Number(String(row.nomor).split('/').pop()) + 1 : 1;
  return `${prefix}/${tahun}/${String(urutan).padStart(4, '0')}`;
}

/**
 * Checksum isi baseline — mengikat angka, bukan tata letak.
 *
 * Angkanya DINORMALKAN ke presisi kolomnya sebelum di-hash, dan itu bukan
 * kerapian belaka. Versi pertama memakai `String(l.qty)`: saat ditulis nilainya
 * number `10` sehingga menjadi `"10"`, tapi saat dibaca kembali `mysql2`
 * mengembalikan DECIMAL sebagai string `"10.0000"`. Checksumnya karena itu
 * tidak pernah cocok saat dihitung ulang — dan checksum yang tidak bisa
 * dihitung ulang dari data tersimpan tidak membuktikan apa pun.
 *
 * Presisinya mengikuti kolom: `qty` DECIMAL(18,4), `unit_price` dan `amount`
 * DECIMAL(18,2).
 */
export function checksumBaseline(lines: any[]): string {
  const desimal = (v: any, n: number) => (Number(v) || 0).toFixed(n);
  const inti = lines.map(l => [
    Number(l.line_no), Number(l.is_section) ? 1 : 0,
    l.section_label || '', l.ahsp_code || '', l.description || '', l.unit || '',
    desimal(l.qty, 4), desimal(l.unit_price, 2), desimal(l.amount, 2),
  ]);
  return crypto.createHash('sha256').update(JSON.stringify(inti)).digest('hex');
}

/**
 * Buat kontrak + baseline dari sebuah proposal yang baru menjadi Deal.
 *
 * Dipanggil DI DALAM transaction Deal supaya kontrak dan project lahir bersama:
 * project tanpa kontrak berarti nilai kesepakatannya tidak punya dokumen, dan
 * kontrak tanpa project menunjuk pekerjaan yang tidak ada.
 *
 * Idempoten: kalau projectnya sudah punya kontrak, tidak membuat yang kedua.
 * Selain pemeriksaan di sini, `uq_contract_project` menjaganya di level
 * database — pemeriksaan di kode saja bisa dilewati dua permintaan bersamaan.
 */
export async function buatKontrakDariProposal(
  tx: TxRunner, opts: { projectId: number; proposal: any; items: any[]; userId: any }
): Promise<{ id: number; nomor: string; checksum: string; dibuat: boolean } | null> {
  const { projectId, proposal, items, userId } = opts;

  const sudah: any = await tx.get('SELECT id, contract_number, baseline_checksum FROM contracts WHERE project_id = ?', [projectId]);
  if (sudah) {
    return { id: sudah.id, nomor: sudah.contract_number, checksum: sudah.baseline_checksum, dibuat: false };
  }

  const nomor = await nomorBerikut(tx, 'contracts', 'contract_number', 'CTR');

  // Baseline memotret SELURUH baris proposal, termasuk baris seksi — kalau
  // hanya barisnya yang diambil, struktur BOQ yang disepakati hilang dan
  // dokumen kontraknya tidak lagi bisa dicocokkan dengan penawarannya.
  const baris = items.map((it: any, i: number) => ({
    line_no: i + 1,
    is_section: Number(it.is_section) === 1 ? 1 : 0,
    section_label: it.section_label || null,
    ahsp_code: it.ahsp_code_snapshot || null,
    description: it.description || it.ahsp_name_snapshot || null,
    unit: it.unit_snapshot || null,
    qty: uang(it.qty),
    unit_price: uang(it.unit_price_snapshot),
    amount: uang(it.total_price),
    source_item_id: it.id,
  }));
  const checksum = checksumBaseline(baris);

  const res = await tx.run(
    `INSERT INTO contracts
      (contract_number, project_id, client_id, proposal_id, proposal_revision,
       original_value, currency, baseline_checksum, signed_date, status, created_by)
     VALUES (?, ?, ?, ?, ?, ?, 'IDR', ?, CURDATE(), 'active', ?)`,
    [nomor, projectId, proposal.client_id || null, proposal.id,
     proposal.revision || null, uang(proposal.total_project), checksum, userId || null]
  );
  const contractId = res.insertId;

  for (const b of baris) {
    await tx.run(
      `INSERT INTO contract_baseline_lines
        (contract_id, line_no, section_label, is_section, ahsp_code, description,
         unit, qty, unit_price, amount, source_item_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [contractId, b.line_no, b.section_label, b.is_section, b.ahsp_code,
       b.description, b.unit, b.qty, b.unit_price, b.amount, b.source_item_id]
    );
  }

  return { id: contractId, nomor, checksum, dibuat: true };
}

/** Ringkasan nilai kontrak — dihitung, tidak pernah dibaca dari kolom. */
async function ringkasNilai(contractId: any, get = dbGet) {
  const c: any = await get('SELECT original_value FROM contracts WHERE id = ?', [contractId]);
  if (!c) return null;
  const agg: any = await get(
    `SELECT
       COALESCE(SUM(CASE WHEN status = 'approved'  THEN value_delta END), 0) AS disetujui,
       COALESCE(SUM(CASE WHEN status = 'submitted' THEN value_delta END), 0) AS tertunda,
       COALESCE(SUM(CASE WHEN status = 'approved'  THEN cost_delta  END), 0) AS biaya_disetujui,
       COALESCE(SUM(CASE WHEN status = 'approved'  THEN schedule_days_delta END), 0) AS hari_disetujui,
       COUNT(*) AS jml
     FROM change_orders WHERE contract_id = ?`, [contractId]);

  const asli = uang(c.original_value);
  const disetujui = uang(agg?.disetujui);
  return {
    original_value: asli,
    approved_co_value: disetujui,
    // Inilah nilai yang mengikat sekarang.
    revised_value: uang(asli + disetujui),
    // Dilaporkan TERPISAH: yang belum disetujui bukan bagian dari nilai kontrak,
    // tapi menyembunyikannya membuat eksposur tidak terlihat sampai terlambat.
    pending_co_value: uang(agg?.tertunda),
    approved_cost_delta: uang(agg?.biaya_disetujui),
    approved_schedule_days: Number(agg?.hari_disetujui || 0),
    jumlah_co: Number(agg?.jml || 0),
  };
}

// ── Daftar kontrak ───────────────────────────────────────────────────────────
router.get('/', authMiddleware, async (req: Request, res: Response) => {
  try {
    const rows: any[] = await dbAll(
      `SELECT c.*, p.project_name, p.project_number, cl.name AS client_name
       FROM contracts c
       LEFT JOIN client_projects p ON p.id = c.project_id
       LEFT JOIN clients cl ON cl.id = c.client_id
       ORDER BY c.created_at DESC LIMIT 200`
    );
    const data = [];
    for (const r of rows) data.push({ ...r, nilai: await ringkasNilai(r.id) });
    res.json({ items: data, total: data.length });
  } catch (error: any) {
    console.error('Error listing contracts:', error);
    res.status(500).json({ error: 'Gagal memuat daftar kontrak' });
  }
});

// ── Detail kontrak + baseline + change order ────────────────────────────────
router.get('/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const c: any = await dbGet(
      `SELECT c.*, p.project_name, p.project_number, p.budget AS project_budget,
              cl.name AS client_name
       FROM contracts c
       LEFT JOIN client_projects p ON p.id = c.project_id
       LEFT JOIN clients cl ON cl.id = c.client_id
       WHERE c.id = ?`, [req.params.id]);
    if (!c) return res.status(404).json({ error: 'Kontrak tidak ditemukan' });

    const baseline = await dbAll(
      `SELECT * FROM contract_baseline_lines WHERE contract_id = ? ORDER BY line_no`, [req.params.id]);
    const co = await dbAll(
      `SELECT * FROM change_orders WHERE contract_id = ? ORDER BY created_at DESC`, [req.params.id]);

    res.json({
      ...c,
      nilai: await ringkasNilai(c.id),
      baseline,
      // Dihitung ulang dari isinya: kalau berbeda dengan yang tersimpan, baseline
      // pernah disentuh sesuatu — dan itu harus terlihat, bukan disembunyikan.
      baseline_checksum_sekarang: checksumBaseline(baseline as any[]),
      change_orders: co,
    });
  } catch (error: any) {
    console.error('Error fetching contract:', error);
    res.status(500).json({ error: 'Gagal memuat kontrak' });
  }
});

// ── Buat change order ───────────────────────────────────────────────────────
router.post('/:id/change-orders', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { title, description, source, schedule_days_delta, lines } = req.body;
    if (!title || !String(title).trim()) {
      return res.status(400).json({ error: 'Judul change order wajib diisi', code: 'JUDUL_WAJIB' });
    }
    const sumber = String(source || 'client');
    if (!SUMBER_CO.includes(sumber)) {
      return res.status(400).json({
        error: `Sumber "${sumber}" tidak dikenal.`, code: 'SUMBER_TIDAK_DIKENAL', sumber_dikenal: SUMBER_CO,
      });
    }
    const daftar = Array.isArray(lines) ? lines : [];
    if (!daftar.length) {
      // CO tanpa baris tidak bisa dipertanggungjawabkan: nilainya tidak punya
      // asal-usul, dan tidak ada yang bisa diperiksa saat menyetujuinya.
      return res.status(400).json({ error: 'Change order harus punya minimal satu baris.', code: 'BARIS_WAJIB' });
    }

    const hasil = await withTransaction(async tx => {
      const kontrak: any = await tx.get('SELECT id, status FROM contracts WHERE id = ? FOR UPDATE', [req.params.id]);
      if (!kontrak) return { error: 404, body: { error: 'Kontrak tidak ditemukan' } };
      if (kontrak.status !== 'active') {
        return { error: 409, body: {
          error: `Kontrak berstatus "${kontrak.status}" tidak menerima change order baru.`,
          code: 'KONTRAK_TIDAK_AKTIF',
        } };
      }

      const nomor = await nomorBerikut(tx, 'change_orders', 'co_number', 'CO');

      // Nilai header DITURUNKAN dari barisnya, tidak diterima dari klien —
      // kalau tidak, header dan baris bisa menyatakan angka yang berbeda dan
      // yang disetujui menjadi ambigu.
      let nilai = 0, biaya = 0;
      const barisSiap = daftar.slice(0, 500).map((l: any, i: number) => {
        const qty = uang(l?.qty);
        const harga = uang(l?.unit_price);
        const jumlah = l?.amount !== undefined ? uang(l.amount) : uang(qty * harga);
        const biayaBaris = uang(l?.cost_amount);
        nilai += jumlah; biaya += biayaBaris;
        return {
          line_no: i + 1,
          description: String(l?.description || '').slice(0, 500) || '(tanpa uraian)',
          unit: l?.unit ? String(l.unit).slice(0, 50) : null,
          qty, unit_price: harga, amount: jumlah, cost_amount: biayaBaris,
        };
      });

      const res2 = await tx.run(
        `INSERT INTO change_orders
          (co_number, contract_id, title, description, source, value_delta, cost_delta,
           schedule_days_delta, status, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?)`,
        [nomor, kontrak.id, String(title).slice(0, 255), description || null, sumber,
         uang(nilai), uang(biaya), Math.trunc(Number(schedule_days_delta) || 0), (req as any).userId || null]
      );
      const coId = res2.insertId;
      for (const b of barisSiap) {
        await tx.run(
          `INSERT INTO change_order_lines
            (change_order_id, line_no, description, unit, qty, unit_price, amount, cost_amount)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [coId, b.line_no, b.description, b.unit, b.qty, b.unit_price, b.amount, b.cost_amount]
        );
      }
      await tx.run(
        `INSERT INTO change_order_events (change_order_id, from_status, to_status, note, actor_id)
         VALUES (?, NULL, 'draft', 'Change order dibuat', ?)`,
        [coId, (req as any).userId || null]
      );

      return { ok: true as const, id: coId, nomor, value_delta: uang(nilai), cost_delta: uang(biaya) };
    });

    if ('error' in hasil) return res.status(hasil.error).json(hasil.body);
    res.status(201).json({ message: 'Change order dibuat', ...hasil });
  } catch (error: any) {
    console.error('Error creating change order:', error);
    res.status(500).json({ error: 'Gagal membuat change order' });
  }
});

// ── Pindah status change order ──────────────────────────────────────────────
router.put('/change-orders/:coId/status', authMiddleware, async (req: Request, res: Response) => {
  try {
    const tujuan = String(req.body?.status || '').trim();
    if (!tujuan) return res.status(400).json({ error: 'Status tujuan wajib diisi', code: 'STATUS_WAJIB' });

    const hasil = await withTransaction(async tx => {
      const co: any = await tx.get('SELECT * FROM change_orders WHERE id = ? FOR UPDATE', [req.params.coId]);
      if (!co) return { error: 404, body: { error: 'Change order tidak ditemukan' } };

      const boleh = TRANSISI_CO[co.status] || [];
      if (!boleh.includes(tujuan)) {
        return { error: 409, body: {
          error: `Change order berstatus "${co.status}" tidak bisa dipindah ke "${tujuan}".`
            + (boleh.length ? ` Yang bisa: ${boleh.join(', ')}.`
              : ' Status ini final — buat change order baru untuk mengoreksinya.'),
          code: 'TRANSISI_TIDAK_SAH',
          status_sekarang: co.status,
          transisi_sah: boleh,
        } };
      }

      const kolom: string[] = ['status = ?'];
      const nilai: any[] = [tujuan];
      if (tujuan === 'submitted') {
        kolom.push('submitted_at = NOW()', 'submitted_by = ?');
        nilai.push((req as any).userId || null);
      }
      if (tujuan === 'approved' || tujuan === 'rejected') {
        kolom.push('decided_at = NOW()', 'decided_by = ?', 'decision_note = ?');
        nilai.push((req as any).userId || null, req.body?.note || null);
      }
      nilai.push(req.params.coId);
      await tx.run(`UPDATE change_orders SET ${kolom.join(', ')} WHERE id = ?`, nilai);

      await tx.run(
        `INSERT INTO change_order_events (change_order_id, from_status, to_status, note, actor_id)
         VALUES (?, ?, ?, ?, ?)`,
        [req.params.coId, co.status, tujuan, req.body?.note || null, (req as any).userId || null]
      );

      return { ok: true as const, contractId: co.contract_id };
    });

    if ('error' in hasil) return res.status(hasil.error).json(hasil.body);
    // Nilai dikembalikan supaya pemanggil langsung melihat akibat keputusannya.
    res.json({ message: `Change order menjadi ${tujuan}`, nilai: await ringkasNilai(hasil.contractId) });
  } catch (error: any) {
    console.error('Error updating change order status:', error);
    res.status(500).json({ error: 'Gagal mengubah status change order' });
  }
});

// ── Detail change order ─────────────────────────────────────────────────────
router.get('/change-orders/:coId', authMiddleware, async (req: Request, res: Response) => {
  try {
    const co: any = await dbGet('SELECT * FROM change_orders WHERE id = ?', [req.params.coId]);
    if (!co) return res.status(404).json({ error: 'Change order tidak ditemukan' });
    res.json({
      ...co,
      lines: await dbAll('SELECT * FROM change_order_lines WHERE change_order_id = ? ORDER BY line_no', [req.params.coId]),
      // Jejak lengkap: setiap perpindahan status, siapa, kapan.
      events: await dbAll(
        `SELECT e.*, u.username AS actor_name FROM change_order_events e
         LEFT JOIN users u ON u.id = e.actor_id
         WHERE e.change_order_id = ? ORDER BY e.created_at, e.id`, [req.params.coId]),
      transisi_sah: TRANSISI_CO[co.status] || [],
    });
  } catch (error: any) {
    console.error('Error fetching change order:', error);
    res.status(500).json({ error: 'Gagal memuat change order' });
  }
});

export default router;
