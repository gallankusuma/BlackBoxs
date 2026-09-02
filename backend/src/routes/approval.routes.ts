import { Router, Request, Response } from 'express';
import { dbAll, dbGet, dbRun, withTransaction, TxRunner } from '../config/database';
import { authMiddleware } from '../middleware/auth';
import { requirePermission, loadUserAccess } from '../middleware/permission';

const router = Router();

/**
 * Registry entitas approval (P0 — 16 Agustus 2026).
 *
 * `POST /submit` dulu menerima `module`, `entity_type`, dan `entity_id` sebagai
 * tiga input INDEPENDEN. Nilainya memang dibaca dari tabel, tapi rule dipilih
 * dari `module` yang dikirim klien — jadi pemanggil tinggal mengirim
 * `entity_type='fund_request'` dengan `module='assets'`, dan saat aksi permission
 * dicocokkan ke modul palsu itu. Pemegang `assets.dispose.approve` kembali bisa
 * menyetujui entitas Finance: bypass lintas resource yang justru ingin ditutup
 * DR-P0-02.
 *
 * Sekarang `entity_type` adalah SATU-SATUNYA yang dipercaya dari klien, dan
 * seluruh sisanya — modul, prefix permission, tabel, kolom nilai — ditentukan di
 * sini. Pasangan yang tidak terdaftar ditolak sebelum apa pun ditulis.
 */
const ENTITY_REGISTRY: Record<string, {
  module: string;
  permissionPrefix: string;
  table: string;
  amountColumn?: string;
  /** Kolom untuk `condition_field = 'quantity'`. Tidak semua entitas punya. */
  quantityColumn?: string;
  label: string;
}> = {
  fund_request:     { module: 'finance',     permissionPrefix: 'finance',     table: 'fund_requests',     amountColumn: 'amount',       label: 'Fund Request' },
  purchase_request: { module: 'procurement', permissionPrefix: 'procurement', table: 'purchase_requests',                               label: 'Purchase Request' },
  purchase_order:   { module: 'procurement', permissionPrefix: 'procurement', table: 'purchase_orders',   amountColumn: 'total_amount', label: 'Purchase Order' },
  grn:              { module: 'procurement', permissionPrefix: 'procurement', table: 'goods_receipts',                                  label: 'Goods Receipt' },
  payroll_request:  { module: 'hr',          permissionPrefix: 'hr',          table: 'payroll_requests',                                label: 'Payroll Request' },
  kasbon_request:   { module: 'hr',          permissionPrefix: 'hr',          table: 'kasbon_requests',   amountColumn: 'amount',       label: 'Kasbon' },
};

/**
 * Kunci modul lama yang dipakai layar konfigurasi (`pr`, `po`, `grn`, ...).
 *
 * Ini kontrak kedua yang membuat jalur SAH terkunci: layar membuat rule bermodul
 * `pr`, sedangkan permission bernamespace `procurement.*`. Query
 * `p.resource LIKE CONCAT(module, '.%')` tidak akan pernah menemukan apa pun,
 * sehingga approver non-master yang berhak selalu 403.
 */
const MODULE_ALIAS: Record<string, string> = {
  pr: 'procurement', po: 'procurement', grn: 'procurement',
  so: 'sales', wo: 'production', batch_release: 'quality',
};
const canonicalModule = (m: any): string => MODULE_ALIAS[String(m || '')] || String(m || '');

/** Kunci lama per jenis dokumen — bukan per modul. */
const ALIAS_ENTITAS: Record<string, string> = {
  purchase_request: 'pr',
  purchase_order: 'po',
  grn: 'grn',
  sales_order: 'so',
  work_order: 'wo',
  batch_release: 'batch_release',
};

/**
 * Kunci modul yang boleh dipakai mencari rule untuk sebuah permintaan.
 *
 * P1 APPROVAL-INTEGRITY: sebelumnya fungsi ini mengembalikan SELURUH alias yang
 * menunjuk modul kanonik yang sama — `procurement` menghasilkan
 * `['procurement','pr','po','grn']`. Akibatnya rule yang sengaja dibuat khusus
 * untuk GRN ikut terpilih saat memproses Purchase Request, dan ambang yang
 * dikonfigurasi untuk satu dokumen diam-diam berlaku untuk dokumen lain.
 *
 * Sekarang hanya alias milik dokumen ITU yang ikut, di samping kunci kanoniknya.
 * Kompatibilitas dengan rule lama tetap terjaga — yang hilang justru
 * pencampurannya.
 *
 * Tanpa `entityType` (pemanggil lama), perilaku lama dipertahankan: mencampur
 * lebih baik daripada tidak menemukan rule sama sekali, dan pemanggil itu
 * memang tidak tahu dokumennya apa.
 */
const moduleKeysFor = (canonical: string, entityType?: string): string[] => {
  const keys = [canonical];
  const khusus = entityType ? ALIAS_ENTITAS[String(entityType)] : undefined;
  if (khusus) {
    if (!keys.includes(khusus)) keys.push(khusus);
    return keys;
  }
  for (const [alias, target] of Object.entries(MODULE_ALIAS)) {
    if (target === canonical) keys.push(alias);
  }
  return keys;
};

/** Prefix permission untuk sebuah request — dari entity_type, bukan module. */
const permissionPrefixFor = (request: any): string => {
  const reg = ENTITY_REGISTRY[String(request?.entity_type)];
  if (reg) return reg.permissionPrefix;
  return canonicalModule(request?.module);
};

type Runner = { all: (sql: string, params?: any[]) => Promise<any[]>; get: (sql: string, params?: any[]) => Promise<any> };
const poolRunner: Runner = { all: dbAll as any, get: dbGet as any };

/**
 * Nilai entitas yang menentukan rule mana yang berlaku (DR-P0-02).
 *
 * Diambil dari DATABASE, bukan dari body. Menerima angkanya dari klien berarti
 * klien memilih sendiri rule approval mana yang mengaturnya — kelas kesalahan
 * yang sama dengan `project_id` pada payslip.
 */
/**
 * Nama `condition_field` yang didukung, dipetakan ke kolom registry.
 *
 * Sengaja eksplisit: rule yang memakai field di luar daftar ini TIDAK boleh
 * diam-diam jatuh ke rule tanpa batas — threshold approval yang dikonfigurasi
 * admin akan terlewat tanpa satu pun tanda.
 */
const CONDITION_FIELDS: Record<string, 'amountColumn' | 'quantityColumn'> = {
  amount: 'amountColumn',
  total: 'amountColumn',
  total_amount: 'amountColumn',
  value: 'amountColumn',
  nilai: 'amountColumn',
  quantity: 'quantityColumn',
  qty: 'quantityColumn',
  jumlah: 'quantityColumn',
};

/**
 * Nilai entitas untuk sebuah `condition_field` tertentu.
 *
 * Mengembalikan `{ didukung: false }` kalau field-nya tidak dikenal ATAU entitas
 * itu tidak punya kolomnya — pemanggil wajib memperlakukannya sebagai konfigurasi
 * yang tidak didukung, bukan sebagai "nilai kosong".
 */
const resolveConditionValue = async (
  entityType: string, entityId: any, conditionField: any, run: Runner = poolRunner,
): Promise<{ didukung: boolean; nilai: number | null; alasan?: string }> => {
  const reg = ENTITY_REGISTRY[String(entityType)];
  if (!reg) return { didukung: false, nilai: null, alasan: `entity_type "${entityType}" tidak terdaftar` };

  // Rule tanpa condition_field diperlakukan sebagai nilai uang — perilaku lama
  // yang dipertahankan supaya konfigurasi yang sudah ada tetap bekerja.
  const field = String(conditionField || 'amount').trim().toLowerCase();
  const kolomRegistry = CONDITION_FIELDS[field];
  if (!kolomRegistry) {
    return { didukung: false, nilai: null, alasan: `condition_field "${conditionField}" tidak didukung` };
  }

  const kolom = reg[kolomRegistry];
  if (!kolom) {
    return {
      didukung: false, nilai: null,
      alasan: `${reg.label} tidak punya nilai untuk "${field}"`,
    };
  }
  if (!entityId) return { didukung: true, nilai: null };

  const row: any = await run.get(`SELECT ${kolom} AS nilai FROM ${reg.table} WHERE id = ?`, [entityId]);
  const n = Number(row?.nilai);
  return { didukung: true, nilai: isFinite(n) ? n : null };
};

/** Nilai uang entitas — dipakai untuk `condition_value` yang disimpan di request. */
const resolveEntityAmount = async (
  entityType: string, entityId: any, run: Runner = poolRunner,
): Promise<number | null> => {
  const hasil = await resolveConditionValue(entityType, entityId, 'amount', run);
  return hasil.nilai;
};

/**
 * Pilih SATU rule aktif yang berlaku untuk sebuah request.
 *
 * Dicocokkan lewat module + rentang nilai. Rule yang lebih spesifik (punya batas)
 * didahulukan atas rule tanpa batas, lalu urut `sequence` supaya pilihannya
 * deterministik.
 */
const selectRuleForRequest = async (
  moduleName: string, amount: number | null, run: Runner = poolRunner,
  entityType?: string, entityId?: any,
): Promise<any> => {
  // Rule bisa tersimpan dengan kunci lama dari layar konfigurasi (`pr`, `po`,
  // `grn`) maupun kunci kanonik. Keduanya dicocokkan.
  const kunci = moduleKeysFor(canonicalModule(moduleName), entityType);
  const rules: any[] = await run.all(
    `SELECT id, sequence, condition_field, min_value, max_value
     FROM approval_rules WHERE module IN (${kunci.map(() => '?').join(',')}) AND is_active = 1
     ORDER BY sequence ASC, id ASC`,
    kunci
  );
  if (!rules.length) return null;

  // P1 BUSINESS-RULE: tiap rule dievaluasi dengan `condition_field`-NYA SENDIRI.
  //
  // Versi sebelumnya membaca kolom itu lalu tidak pernah memakainya — semua batas
  // dibandingkan ke satu variabel `amount`. Rule ber-`condition_field =
  // 'quantity'` karena itu tidak pernah cocok, dan sistem diam-diam jatuh ke rule
  // tanpa batas: threshold yang dikonfigurasi admin terlewat tanpa satu pun tanda.
  const berbatas: any[] = [];
  const takDidukung: string[] = [];

  for (const r of rules) {
    if (r.min_value == null && r.max_value == null) continue;

    let nilai = amount;
    if (entityType) {
      const hasil = await resolveConditionValue(entityType, entityId, r.condition_field, run);
      if (!hasil.didukung) {
        // Rule ini TIDAK dilewati diam-diam — dicatat supaya pemanggil bisa
        // menolak dengan pesan yang jelas.
        takDidukung.push(`rule #${r.id}: ${hasil.alasan}`);
        continue;
      }
      nilai = hasil.nilai;
    }

    if (nilai == null) continue; // rule bersyarat butuh nilai
    if (r.min_value != null && nilai < Number(r.min_value)) continue;
    if (r.max_value != null && nilai > Number(r.max_value)) continue;
    berbatas.push(r);
  }

  if (berbatas.length) return berbatas[0];

  // Ada rule bersyarat yang konfigurasinya tidak didukung, dan tidak ada rule
  // berbatas yang cocok. Jatuh ke rule tanpa batas di sini akan MENYEMBUNYIKAN
  // konfigurasi yang salah, jadi kesalahannya dimunculkan.
  if (takDidukung.length) {
    const err: any = new Error(
      `Konfigurasi approval tidak didukung: ${takDidukung.join('; ')}. Perbaiki rule-nya.`
    );
    err.code = 'UNSUPPORTED_APPROVAL_CONDITION';
    throw err;
  }

  return rules.find(r => r.min_value == null && r.max_value == null) || null;
};

/** Action permission yang sah untuk sebuah step. */
const stepActions = (stepOrder: number): string[] => ['approve', `approve_${stepOrder}`];

/**
 * Otorisasi aksi approval (DR-P0-02).
 *
 * Sebelumnya `approve` dan `reject` tidak memeriksa apa pun: siapa pun yang punya
 * token desktop dan tahu/menebak ID request bisa menyetujui atau menolaknya.
 * Filter permission hanya ada di INBOX — menyembunyikan item dari daftar tidak
 * melindungi aksinya.
 *
 * Perbaikan pertama masih menyisakan tiga celah, semuanya ditemukan reviewer:
 *
 * 1. Permission approve APA PUN di seluruh ERP diterima. Pemegang
 *    `assets.dispose.approve` bisa menyetujui request Finance. Sekarang resource
 *    permission wajib berawalan modul requestnya, dan action-nya wajib sesuai
 *    step (`approve` atau `approve_<step>`).
 * 2. Step dari SEMUA rule bermodul sama ikut tergabung. Sekarang hanya step milik
 *    `request.rule_id` — rule yang dikunci saat submit.
 * 3. `approval_delegations` tidak dibaca sama sekali. Sekarang delegasi aktif
 *    (modul cocok, dalam rentang tanggal) mewarisi penugasan pemberi delegasi,
 *    tanpa mengubah penugasan aslinya.
 *
 * Dihitung ulang dari DATABASE setiap aksi: bukan dari payload token (level di
 * token basi sampai 7 hari setelah hak dicabut), bukan dari hasil filter inbox.
 */
const resolveApprovalAuthority = async (
  userId: number, request: any, run: Runner,
): Promise<{ allowed: boolean; canReject: boolean; reason?: string }> => {
  const user: any = await run.get(
    'SELECT role_id, user_level, is_active FROM users WHERE id = ?', [userId]
  );
  if (!user) return { allowed: false, canReject: false, reason: 'USER_NOT_FOUND' };
  if (!user.is_active) return { allowed: false, canReject: false, reason: 'USER_INACTIVE' };

  // Master melewati seluruh pemeriksaan, sama seperti requirePermission().
  if (Number(user.user_level || 0) >= 10) return { allowed: true, canReject: true };

  // Permission harus milik MODUL requestnya, dan action-nya sesuai step.
  const aksi = stepActions(Number(request.current_step || 1));
  // Prefix diambil dari `entity_type` lewat registry, BUKAN dari `request.module`
  // yang asalnya dari klien. Tanpa ini, berbohong soal modul saat submit sudah
  // cukup untuk memilih permission mana yang akan diterima.
  const prefixPermission = permissionPrefixFor(request);
  const perm: any = await run.get(
    `SELECT 1 AS ok FROM permissions p
     JOIN role_permissions rp ON p.id = rp.permission_id
     WHERE rp.role_id = ?
       AND p.resource LIKE CONCAT(?, '.%')
       AND p.action IN (${aksi.map(() => '?').join(',')})
     LIMIT 1`,
    [user.role_id || 0, prefixPermission, ...aksi]
  );
  if (!perm) return { allowed: false, canReject: false, reason: 'NO_APPROVE_PERMISSION_FOR_MODULE' };

  // Rule yang dipakai request ini — bukan semua rule bermodul sama.
  if (!request.rule_id) {
    // Request lama/modul tanpa rule: pemegang permission modul boleh bertindak.
    // Fallback ini sengaja dipertahankan supaya modul yang belum dikonfigurasi
    // tidak mati, TAPI kini permissionnya benar-benar terikat modul.
    const adaRule: any = await run.get(
      'SELECT 1 AS ok FROM approval_rules WHERE module = ? AND is_active = 1 LIMIT 1', [request.module]
    );
    if (!adaRule) return { allowed: true, canReject: true };
    return { allowed: false, canReject: false, reason: 'REQUEST_WITHOUT_RULE' };
  }

  const steps: any[] = await run.all(
    `SELECT approver_user_id, approver_role_id, can_reject
     FROM approval_rule_steps WHERE rule_id = ? AND step_order = ?`,
    [request.rule_id, request.current_step]
  );
  if (!steps.length) return { allowed: false, canReject: false, reason: 'NO_STEP_DEFINED' };

  // Delegasi aktif: user ini mewarisi penugasan orang yang mendelegasikan.
  const delegasi: any[] = await run.all(
    // `module IS NULL` berarti "All Modules" — itulah yang disimpan layar
    // delegasi saat pilihannya dikosongkan (`module || null`).
    //
    // P1: sebelumnya syaratnya hanya `module = ?`, dan di SQL
    // `NULL = 'procurement'` bernilai NULL — bukan TRUE. Jadi delegasi
    // "All Modules" tidak pernah cocok dengan modul APA PUN: fiturnya terlihat
    // tersimpan di layar dan tidak pernah berlaku sekali pun.
    `SELECT from_user_id FROM approval_delegations
     WHERE to_user_id = ? AND is_active = 1 AND (module IS NULL OR module = ?)
       AND (start_date IS NULL OR start_date <= CURDATE())
       AND (end_date IS NULL OR end_date >= CURDATE())`,
    [userId, request.module]
  );
  const mewakili = new Set<number>(delegasi.map((d: any) => Number(d.from_user_id)));

  const match = steps.find(st =>
    (st.approver_user_id != null && (
      Number(st.approver_user_id) === Number(userId) || mewakili.has(Number(st.approver_user_id))
    ))
    || (st.approver_role_id != null && Number(st.approver_role_id) === Number(user.role_id))
    || (st.approver_user_id == null && st.approver_role_id == null)
  );
  if (!match) return { allowed: false, canReject: false, reason: 'NOT_ASSIGNED_TO_STEP' };

  return { allowed: true, canReject: match.can_reject == null ? true : !!match.can_reject };
};

const generateCode = (prefix: string) => {
  const now = new Date();
  const datePart = now.toISOString().slice(0, 10).replace(/-/g, '');
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `${prefix}-${datePart}-${rand}`;
};

// DR-P0-02 kriteria 4: KONFIGURASI approval digembok permission.
//
// Sebelumnya CRUD rules, delegation, dan escalation hanya butuh login. Itu bukan
// sekadar kelalaian RBAC — ia melengkapi bypass aksi: user biasa bisa membuat
// rule yang menjadikan DIRINYA approver, lalu menyetujui sendiri.
//
// `inbox` dan `history` SENGAJA tidak digembok. Keduanya pandangan per-user yang
// sudah tersaring; menggemboknya justru menutup inbox milik approver sendiri.
//
// Kontrak entitas approval — supaya layar konfigurasi memakai kunci yang SAMA
// dengan yang diterima server, bukan daftarnya sendiri.
router.get('/entity-types', authMiddleware, async (_req: Request, res: Response) => {
  res.json({
    data: Object.entries(ENTITY_REGISTRY).map(([key, v]) => ({
      entity_type: key, module: v.module, label: v.label,
    })),
    modules: Array.from(new Set(Object.values(ENTITY_REGISTRY).map(v => v.module))),
  });
});

// ─── INBOX ──────────────────────────────────────────────

// GET /inbox — unified pending approvals for current user
router.get('/inbox', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    const userLevel = Number((req as any).user?.userLevel || 0);
    const { module, entity_type } = req.query;

    let sql = `
      SELECT ar.*, u.full_name AS requester_name
      FROM approval_requests ar
      LEFT JOIN users u ON ar.requester_id = u.id
      WHERE ar.status = 'pending'
    `;
    const params: any[] = [];

    // ── Permission-based inbox filtering ──
    // Master Admin (level 10+) sees everything.
    // Other users see items only if they have the correct approve/approve_1/approve_2 permission
    // for the module, OR if no rules/permissions exist for that module (fallback: visible to all).
    if (userLevel < 10) {
      // Get all permission resources the user can approve (via role)
      const userRow = await dbGet('SELECT role_id FROM users WHERE id = ?', [userId]) as any;
      const roleId = userRow?.role_id;

      if (roleId) {
        // Get resources this user can approve (approve, approve_1, or approve_2)
        const approvePerms = await dbAll(
          `SELECT DISTINCT p.resource FROM permissions p
           JOIN role_permissions rp ON p.id = rp.permission_id
           WHERE rp.role_id = ? AND p.action IN ('approve', 'approve_1', 'approve_2')`,
          [roleId]
        ) as any[];

        if (approvePerms.length > 0) {
          // Map module names to permission resource patterns
          // approval_requests.module is like 'finance', 'procurement', etc.
          // We check if ANY of the user's approve permissions matches the module
          sql += ` AND (
            EXISTS (
              SELECT 1 FROM approval_rule_steps ars
              JOIN approval_rules arl ON ars.rule_id = arl.id
              WHERE arl.module = ar.module
                AND ars.step_order = ar.current_step
                AND (ars.approver_user_id = ? OR ars.approver_user_id IS NULL)
            )
            OR NOT EXISTS (
              SELECT 1 FROM approval_rule_steps ars
              JOIN approval_rules arl ON ars.rule_id = arl.id
              WHERE arl.module = ar.module
            )
          )`;
          params.push(userId);
        } else {
          // User has no approve permissions at all — show nothing
          sql += ' AND 1 = 0';
        }
      } else {
        // No role assigned — show nothing
        sql += ' AND 1 = 0';
      }
    }

    if (module) {
      sql += ' AND ar.module = ?';
      params.push(module);
    }
    if (entity_type) {
      sql += ' AND ar.entity_type = ?';
      params.push(entity_type);
    }

    sql += ' ORDER BY ar.submitted_at DESC';

    const requests = await dbAll(sql, params) as any[];

    // ── Enrich with entity details ──
    //
    // ⚠️ Item PR dan GRN TIDAK ada di `purchase_request_items`/`grn_items`.
    // Kedua tabel itu ada di skema lengkap dengan foreign key, tapi tidak
    // pernah ditulis kode mana pun — itemnya disimpan sebagai JSON di kolom
    // `notes`, dan posting stok GRN maupun bid tabulation PR juga membacanya
    // dari situ. Diverifikasi: produksi 54 PR / 10 GRN dengan NOL baris di
    // kedua tabel itu; lokal 10.521 PR / 8.136 GRN, juga nol.
    //
    // Akibatnya layar Approval Inbox menampilkan "0 item" dan nilai PR
    // "Rp 0" — penyetuju memutuskan di atas angka yang salah. Karena itu
    // hitungannya diambil dari sumber yang sama dengan yang dipakai modulnya
    // sendiri, bukan dari tabel yang tidak pernah lahir.
    const itemsDariNotes = (notes: unknown): any[] => {
      try {
        const data = JSON.parse(String(notes || '{}'));
        return Array.isArray(data?.items) ? data.items : [];
      } catch {
        return [];
      }
    };
    const jumlah = (items: any[], ambil: (it: any) => number) =>
      items.reduce((t, it) => t + (Number(ambil(it)) || 0), 0);

    for (const r of requests) {
      try {
        if (r.entity_type === 'fund_request') {
          const fr = await dbGet(
            `SELECT fr.id, fr.request_number, fr.purpose, fr.amount, fr.needed_date, fr.status,
                    fr.cash_account, fr.cash_account_note,
                    u.full_name AS requester_name,
                    (SELECT COUNT(*) FROM fund_request_items fri WHERE fri.fund_request_id = fr.id) AS item_count,
                    (SELECT COUNT(*) FROM fund_request_items fri WHERE fri.fund_request_id = fr.id AND fri.status = 'pending') AS pending_count
             FROM fund_requests fr
             LEFT JOIN users u ON fr.requester_id = u.id
             WHERE fr.id = ?`,
            [r.entity_id]
          );
          r.entity = fr || null;

        } else if (r.entity_type === 'purchase_order') {
          const po = await dbGet(
            // `po_date`, BUKAN `order_date` — kolom itu tidak ada. Query lama
            // melempar, `catch` di bawah menelannya, dan `entity` diset null:
            // Purchase Order tidak pernah muncul rinciannya di Approval Inbox
            // sama sekali. Alias dipertahankan supaya bentuk responsnya tidak
            // berubah bagi pembaca mana pun.
            `SELECT po.id, po.po_number, po.po_date AS order_date, po.total_amount, po.status,
                    po.approval_status, po.notes, po.expected_date,
                    v.name AS vendor_name,
                    (SELECT COUNT(*) FROM purchase_order_items poi WHERE poi.po_id = po.id) AS item_count,
                    pr.pr_number
             FROM purchase_orders po
             LEFT JOIN vendors v ON po.vendor_id = v.id
             LEFT JOIN purchase_requests pr ON po.pr_id = pr.id
             WHERE po.id = ?`,
            [r.entity_id]
          );
          r.entity = po || null;

        } else if (r.entity_type === 'purchase_request') {
          const pr = await dbGet(
            // `requestor_id`, BUKAN `requester_id`; dan `priority` tidak ada
            // kolomnya. Sama seperti PO di atas: query lama selalu melempar dan
            // Purchase Request tidak pernah tampil rinciannya di inbox.
            `SELECT pr.id, pr.pr_number, pr.request_date, pr.status, pr.approval_status,
                    pr.department, pr.notes,
                    u.full_name AS requester_name
             FROM purchase_requests pr
             LEFT JOIN users u ON pr.requestor_id = u.id
             WHERE pr.id = ?`,
            [r.entity_id]
          ) as any;
          if (pr) {
            // `qty` dan `price` — nama field yang benar-benar ditulis
            // PurchaseRequests.vue ke dalam notes. Bukan `quantity`/
            // `estimated_price` seperti nama kolom di tabel yang tidak terpakai.
            const items = itemsDariNotes(pr.notes);
            pr.item_count = items.length;
            pr.estimated_total = jumlah(items, it => Number(it.qty || 0) * Number(it.price || 0));
          }
          r.entity = pr || null;

        } else if (r.entity_type === 'grn') {
          const grn = await dbGet(
            `SELECT g.id, g.grn_number, g.received_date, g.status, g.notes,
                    po.po_number, v.name AS vendor_name
             FROM goods_receipts g
             LEFT JOIN purchase_orders po ON g.po_id = po.id
             LEFT JOIN vendors v ON po.vendor_id = v.id
             WHERE g.id = ?`,
            [r.entity_id]
          ) as any;
          if (grn) {
            const items = itemsDariNotes(grn.notes);
            grn.item_count = items.length;
            grn.total_qty_received = jumlah(items, it => it.received_quantity);
          }
          r.entity = grn || null;
        }
      } catch (enrichErr) {
        console.warn(`Failed to enrich entity ${r.entity_type}#${r.entity_id}:`, (enrichErr as any)?.message);
        r.entity = null;
      }
    }

    res.json({ success: true, data: requests });
  } catch (error) {
    console.error('Error fetching approval inbox:', error);
    res.status(500).json({ error: 'Failed to fetch approval inbox' });
  }
});

// PUT /inbox/:id/approve — approve a request
//
// DR-P0-02: otorisasi, pencatatan aksi, dan perpindahan step adalah SATU unit
// yang dimulai dari lock baris requestnya. Versi lama membaca request, menulis
// action, lalu meng-UPDATE status sebagai tiga langkah autocommit tanpa lock —
// dua approve paralel sama-sama lolos cek `status === 'pending'` dan menghasilkan
// dua action serta dua kali perpindahan step.
const actOnRequest = async (
  req: Request, res: Response, action: 'approved' | 'rejected',
) => {
  const userId = (req as any).userId;
  const { id } = req.params;
  const { comments } = req.body;

  const outcome = await withTransaction(async tx => {
    const request: any = await tx.get(
      'SELECT * FROM approval_requests WHERE id = ? FOR UPDATE', [id]
    );
    if (!request) return { error: 404, body: { error: 'Request not found' } };
    if (request.status !== 'pending') {
      return {
        error: 409,
        body: {
          error: `Request sudah berstatus "${request.status}" — kemungkinan sudah diproses permintaan lain.`,
          code: 'REQUEST_NOT_PENDING',
        },
      };
    }

    const authority = await resolveApprovalAuthority(userId, request, tx);
    if (!authority.allowed) {
      return {
        error: 403,
        body: { error: 'Anda tidak berwenang memproses approval ini.', code: authority.reason },
      };
    }
    if (action === 'rejected' && !authority.canReject) {
      return {
        error: 403,
        body: { error: 'Anda berwenang menyetujui, tetapi tidak menolak, pada tahap ini.', code: 'REJECT_NOT_ALLOWED' },
      };
    }

    await tx.run(
      'INSERT INTO approval_actions (request_id, step_order, approver_id, action, comments) VALUES (?, ?, ?, ?, ?)',
      [id, request.current_step, userId, action, comments || null]
    );

    if (action === 'rejected') {
      await tx.run(
        'UPDATE approval_requests SET status = ?, completed_at = NOW() WHERE id = ?',
        ['rejected', id]
      );
      return { ok: true as const, status: 'rejected', step: request.current_step };
    }

    // `approval_requests` tidak menyimpan rule_id, jadi step berikutnya hanya
    // bisa dicari lewat module. ORDER BY membuatnya deterministik kalau satu
    // module punya lebih dari satu rule — pilihan yang sama setiap kali, bukan
    // bergantung urutan baris. Menyimpan rule_id di request adalah perbaikan
    // yang benar, tapi itu perubahan model data tersendiri.
    // Step berikutnya diambil dari RULE YANG SAMA. Versi sebelumnya mencarinya
    // lewat `module`, jadi alur bisa berpindah ke rule lain di tengah jalan —
    // `ORDER BY` hanya membuat hasil yang salah itu deterministik.
    const nextStep: any = request.rule_id ? await tx.get(
      `SELECT step_order FROM approval_rule_steps
       WHERE rule_id = ? AND step_order = ? LIMIT 1`,
      [request.rule_id, request.current_step + 1]
    ) : null;

    if (nextStep) {
      await tx.run('UPDATE approval_requests SET current_step = ? WHERE id = ?',
        [request.current_step + 1, id]);
      return { ok: true as const, status: 'pending', step: request.current_step + 1 };
    }

    await tx.run(
      'UPDATE approval_requests SET status = ?, completed_at = NOW() WHERE id = ?',
      ['approved', id]
    );
    return { ok: true as const, status: 'approved', step: request.current_step };
  });

  if ('error' in outcome) return res.status(outcome.error).json(outcome.body);
  return res.json({
    success: true,
    message: action === 'approved' ? 'Approved successfully' : 'Rejected successfully',
    status: outcome.status,
    current_step: outcome.step,
  });
};

router.put('/inbox/:id/approve', authMiddleware, async (req: Request, res: Response) => {
  try {
    await actOnRequest(req, res, 'approved');
  } catch (error) {
    console.error('Error approving request:', error);
    res.status(500).json({ error: 'Failed to approve request' });
  }
});

router.put('/inbox/:id/reject', authMiddleware, async (req: Request, res: Response) => {
  try {
    await actOnRequest(req, res, 'rejected');
  } catch (error) {
    console.error('Error rejecting request:', error);
    res.status(500).json({ error: 'Failed to reject request' });
  }
});

// ─── HISTORY ────────────────────────────────────────────

// GET /history — all past approval actions for current user or all
// P2 RBAC/DATA-SCOPE: history adalah pandangan PER-USER, bukan seluruh
// perusahaan.
//
// Query dulu dimulai `WHERE 1=1` tanpa satu pun predicate kepemilikan, jadi
// setiap user login bisa membaca sampai 200 request seluruh modul berikut nomor,
// entity ID, requester, status, dan nama serta waktu actor di jejak aksinya.
router.get('/history', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { module, entity_type, status, from_date, to_date } = req.query;
    const userId = (req as any).userId;

    const akses = await loadUserAccess(userId);
    const master = !!akses && akses.level >= 10;

    let sql = `
      SELECT ar.*, u.full_name AS requester_name,
        (SELECT GROUP_CONCAT(
          CONCAT(aa.action, ' by ', COALESCE(au.full_name, 'Unknown'), ' on ', aa.acted_at)
          ORDER BY aa.acted_at SEPARATOR '; '
        )
        FROM approval_actions aa
        LEFT JOIN users au ON aa.approver_id = au.id
        WHERE aa.request_id = ar.id
        ) AS action_trail
      FROM approval_requests ar
      LEFT JOIN users u ON ar.requester_id = u.id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (!master) {
      // Yang boleh dilihat: request yang ia ajukan sendiri, yang pernah ia
      // proses, atau yang modulnya memang menjadi wewenangnya.
      const resources: string[] = Array.from(akses?.perms || [])
        .filter(p => /\.(approve|approve_1|approve_2)$/.test(p))
        .map(p => String(p).split('.')[0]);
      const modulWewenang = Array.from(new Set(resources));

      sql += ` AND (ar.requester_id = ?
                 OR EXISTS (SELECT 1 FROM approval_actions x WHERE x.request_id = ar.id AND x.approver_id = ?)`;
      params.push(userId, userId);

      if (modulWewenang.length) {
        sql += ` OR ar.module IN (${modulWewenang.map(() => '?').join(',')})`;
        params.push(...modulWewenang);
      }
      sql += ')';
    }

    if (module) { sql += ' AND ar.module = ?'; params.push(module); }
    if (entity_type) { sql += ' AND ar.entity_type = ?'; params.push(entity_type); }
    if (status) { sql += ' AND ar.status = ?'; params.push(status); }
    if (from_date) { sql += ' AND ar.submitted_at >= ?'; params.push(from_date); }
    if (to_date) { sql += ' AND ar.submitted_at <= ?'; params.push(to_date); }

    sql += ' ORDER BY ar.submitted_at DESC LIMIT 200';

    const history = await dbAll(sql, params);
    res.json({ success: true, data: history });
  } catch (error) {
    console.error('Error fetching approval history:', error);
    res.status(500).json({ error: 'Failed to fetch approval history' });
  }
});

// GET /history/stats — aggregate stats
router.get('/history/stats', authMiddleware, async (req: Request, res: Response) => {
  try {
    const stats = await dbGet(`
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) AS approved,
        SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) AS rejected,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending,
        SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) AS cancelled
      FROM approval_requests
    `, []);
    res.json({ success: true, data: stats });
  } catch (error) {
    console.error('Error fetching approval stats:', error);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// ─── RULES ──────────────────────────────────────────────

// GET /rules — list all approval rules with their steps
// P2 RBAC/DATA-SCOPE: sisi BACA konfigurasi digembok sama dengan sisi tulis.
//
// Responsnya memuat kondisi rule, penugasan role/user, identitas pemberi dan
// penerima delegasi berikut alasannya, serta target escalation. Itu peta siapa
// menyetujui apa — cukup untuk merancang jalur yang menghindari approver
// tertentu. Konfigurasi approval sudah diputuskan menjadi fungsi Admin, jadi
// membacanya mengikuti keputusan yang sama.
router.get('/rules', authMiddleware, requirePermission('approval.approval-rules.view', 'admin.approval-config.view', 'approval.approval-rules.view'), async (req: Request, res: Response) => {
  try {
    const rules = await dbAll(`
      SELECT ar.*, r.name AS approver_role_name
      FROM approval_rules ar
      LEFT JOIN roles r ON ar.approver_role_id = r.id
      ORDER BY ar.module, ar.sequence
    `, []);

    // Attach steps to each rule
    for (const rule of rules) {
      rule.steps = await dbAll(`
        SELECT ars.*, r.name AS role_name, u.full_name AS user_name
        FROM approval_rule_steps ars
        LEFT JOIN roles r ON ars.approver_role_id = r.id
        LEFT JOIN users u ON ars.approver_user_id = u.id
        WHERE ars.rule_id = ?
        ORDER BY ars.step_order
      `, [rule.id]);
    }

    res.json({ success: true, data: rules });
  } catch (error) {
    console.error('Error fetching approval rules:', error);
    res.status(500).json({ error: 'Failed to fetch approval rules' });
  }
});

// POST /rules — create a new approval rule
router.post('/rules', authMiddleware, requirePermission('approval.approval-rules.create', 'admin.approval-config.create'), async (req: Request, res: Response) => {
  try {
    const { name, module, condition_field, min_value, max_value, approver_role_id, sequence, steps } = req.body;

    const result = await dbRun(
      `INSERT INTO approval_rules (name, module, condition_field, min_value, max_value, approver_role_id, sequence)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [name, module, condition_field || null, min_value || null, max_value || null, approver_role_id || null, sequence || 1]
    );

    // Insert steps if provided
    if (steps && Array.isArray(steps)) {
      for (const step of steps) {
        await dbRun(
          `INSERT INTO approval_rule_steps (rule_id, step_order, approver_role_id, approver_user_id, can_reject, is_parallel)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [result.insertId, step.step_order, step.approver_role_id || null, step.approver_user_id || null, step.can_reject !== false, step.is_parallel || false]
        );
      }
    }

    res.status(201).json({ success: true, data: { id: result.insertId } });
  } catch (error) {
    console.error('Error creating approval rule:', error);
    res.status(500).json({ error: 'Failed to create approval rule' });
  }
});

// PUT /rules/:id — update an approval rule
router.put('/rules/:id', authMiddleware, requirePermission('approval.approval-rules.edit', 'admin.approval-config.edit'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, module, condition_field, min_value, max_value, approver_role_id, sequence, is_active, steps } = req.body;

    await dbRun(
      `UPDATE approval_rules SET name=?, module=?, condition_field=?, min_value=?, max_value=?,
       approver_role_id=?, sequence=?, is_active=? WHERE id=?`,
      [name, module, condition_field || null, min_value || null, max_value || null, approver_role_id || null, sequence || 1, is_active !== false, id]
    );

    // Re-create steps if provided
    if (steps && Array.isArray(steps)) {
      await dbRun('DELETE FROM approval_rule_steps WHERE rule_id = ?', [id]);
      for (const step of steps) {
        await dbRun(
          `INSERT INTO approval_rule_steps (rule_id, step_order, approver_role_id, approver_user_id, can_reject, is_parallel)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [id, step.step_order, step.approver_role_id || null, step.approver_user_id || null, step.can_reject !== false, step.is_parallel || false]
        );
      }
    }

    res.json({ success: true, message: 'Rule updated' });
  } catch (error) {
    console.error('Error updating approval rule:', error);
    res.status(500).json({ error: 'Failed to update rule' });
  }
});

// DELETE /rules/:id
router.delete('/rules/:id', authMiddleware, requirePermission('approval.approval-rules.delete', 'admin.approval-config.delete'), async (req: Request, res: Response) => {
  try {
    await dbRun('DELETE FROM approval_rules WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: 'Rule deleted' });
  } catch (error) {
    console.error('Error deleting approval rule:', error);
    res.status(500).json({ error: 'Failed to delete rule' });
  }
});

// ─── DELEGATION ─────────────────────────────────────────

// GET /delegations
router.get('/delegations', authMiddleware, requirePermission('admin.approval-config.view', 'admin.approval-config.view', 'approval.approval-rules.view'), async (req: Request, res: Response) => {
  try {
    const delegations = await dbAll(`
      SELECT d.*, 
        df.full_name AS from_user_name, 
        dt.full_name AS to_user_name
      FROM approval_delegations d
      LEFT JOIN users df ON d.from_user_id = df.id
      LEFT JOIN users dt ON d.to_user_id = dt.id
      ORDER BY d.start_date DESC
    `, []);
    res.json({ success: true, data: delegations });
  } catch (error) {
    console.error('Error fetching delegations:', error);
    res.status(500).json({ error: 'Failed to fetch delegations' });
  }
});

// POST /delegations — create delegation
router.post('/delegations', authMiddleware, requirePermission('admin.approval-config.create', 'approval.approval-rules.create'), async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    const { to_user_id, module, start_date, end_date, reason } = req.body;

    const result = await dbRun(
      `INSERT INTO approval_delegations (from_user_id, to_user_id, module, start_date, end_date, reason, is_active)
       VALUES (?, ?, ?, ?, ?, ?, TRUE)`,
      [userId, to_user_id, module || null, start_date, end_date, reason || null]
    );

    res.status(201).json({ success: true, data: { id: result.insertId } });
  } catch (error) {
    console.error('Error creating delegation:', error);
    res.status(500).json({ error: 'Failed to create delegation' });
  }
});

// PUT /delegations/:id/deactivate
router.put('/delegations/:id/deactivate', authMiddleware, requirePermission('admin.approval-config.edit', 'approval.approval-rules.edit'), async (req: Request, res: Response) => {
  try {
    await dbRun('UPDATE approval_delegations SET is_active = FALSE WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: 'Delegation deactivated' });
  } catch (error) {
    console.error('Error deactivating delegation:', error);
    res.status(500).json({ error: 'Failed to deactivate delegation' });
  }
});

// DELETE /delegations/:id
router.delete('/delegations/:id', authMiddleware, requirePermission('admin.approval-config.delete', 'approval.approval-rules.delete'), async (req: Request, res: Response) => {
  try {
    await dbRun('DELETE FROM approval_delegations WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: 'Delegation deleted' });
  } catch (error) {
    console.error('Error deleting delegation:', error);
    res.status(500).json({ error: 'Failed to delete delegation' });
  }
});

// ─── ESCALATION ─────────────────────────────────────────

// GET /escalations
router.get('/escalations', authMiddleware, requirePermission('admin.approval-config.view', 'admin.approval-config.view', 'approval.approval-rules.view'), async (req: Request, res: Response) => {
  try {
    const escalations = await dbAll(`
      SELECT e.*, u.full_name AS escalate_to_name
      FROM approval_escalations e
      LEFT JOIN users u ON e.escalate_to_user_id = u.id
      ORDER BY e.module, e.hours_threshold
    `, []);
    res.json({ success: true, data: escalations });
  } catch (error) {
    console.error('Error fetching escalations:', error);
    res.status(500).json({ error: 'Failed to fetch escalation rules' });
  }
});

// POST /escalations
router.post('/escalations', authMiddleware, requirePermission('admin.approval-config.create', 'approval.approval-rules.create'), async (req: Request, res: Response) => {
  try {
    const { module, hours_threshold, escalate_to_user_id, escalate_to_role_id, notify_requester, notify_admin } = req.body;

    const result = await dbRun(
      `INSERT INTO approval_escalations (module, hours_threshold, escalate_to_user_id, escalate_to_role_id, notify_requester, notify_admin, is_active)
       VALUES (?, ?, ?, ?, ?, ?, TRUE)`,
      [module, hours_threshold, escalate_to_user_id || null, escalate_to_role_id || null, notify_requester !== false, notify_admin !== false]
    );

    res.status(201).json({ success: true, data: { id: result.insertId } });
  } catch (error) {
    console.error('Error creating escalation rule:', error);
    res.status(500).json({ error: 'Failed to create escalation rule' });
  }
});

// PUT /escalations/:id
router.put('/escalations/:id', authMiddleware, requirePermission('admin.approval-config.edit', 'approval.approval-rules.edit'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { module, hours_threshold, escalate_to_user_id, escalate_to_role_id, notify_requester, notify_admin, is_active } = req.body;

    await dbRun(
      `UPDATE approval_escalations SET module=?, hours_threshold=?, escalate_to_user_id=?, escalate_to_role_id=?,
       notify_requester=?, notify_admin=?, is_active=? WHERE id=?`,
      [module, hours_threshold, escalate_to_user_id || null, escalate_to_role_id || null, notify_requester !== false, notify_admin !== false, is_active !== false, id]
    );

    res.json({ success: true, message: 'Escalation rule updated' });
  } catch (error) {
    console.error('Error updating escalation:', error);
    res.status(500).json({ error: 'Failed to update escalation rule' });
  }
});

// DELETE /escalations/:id
router.delete('/escalations/:id', authMiddleware, requirePermission('admin.approval-config.delete', 'approval.approval-rules.delete'), async (req: Request, res: Response) => {
  try {
    await dbRun('DELETE FROM approval_escalations WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: 'Escalation rule deleted' });
  } catch (error) {
    console.error('Error deleting escalation:', error);
    res.status(500).json({ error: 'Failed to delete escalation rule' });
  }
});

// ─── SUBMIT REQUEST (for other modules to call) ────────

// POST /submit — submit a new approval request
router.post('/submit', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const { entity_type, entity_id, notes } = req.body;

    // P0: `entity_type` adalah satu-satunya yang dipercaya dari klien. Modul,
    // prefix permission, dan tabel entitasnya ditentukan registry — `module`
    // dari body sengaja TIDAK dibaca sama sekali.
    const reg = ENTITY_REGISTRY[String(entity_type)];
    if (!reg) {
      return res.status(400).json({
        error: `Jenis entitas "${entity_type}" tidak dikenali untuk approval.`,
        code: 'UNKNOWN_ENTITY_TYPE',
        didukung: Object.keys(ENTITY_REGISTRY),
      });
    }
    if (!entity_id) {
      return res.status(400).json({ error: 'entity_id wajib diisi', code: 'ENTITY_ID_REQUIRED' });
    }

    // Entitasnya harus benar-benar ada. Tanpa ini, request approval bisa dibuat
    // untuk dokumen yang tidak pernah ada.
    const entitas: any = await dbGet(`SELECT id FROM ${reg.table} WHERE id = ?`, [entity_id]);
    if (!entitas) {
      return res.status(404).json({
        error: `${reg.label} #${entity_id} tidak ditemukan.`,
        code: 'ENTITY_NOT_FOUND',
      });
    }

    const module = reg.module;

    // DR-P0-02: rule dipilih SEKALI di sini lalu dikunci ke requestnya, memakai
    // nilai entitas yang dibaca dari database — bukan dari body.
    const nilai = await resolveEntityAmount(entity_type, entity_id);

    // `entity_type` dan `entity_id` diteruskan supaya tiap rule bisa dievaluasi
    // dengan `condition_field`-nya sendiri, bukan dengan satu nilai uang saja.
    let rule: any = null;
    try {
      rule = await selectRuleForRequest(module, nilai, poolRunner, entity_type, entity_id);
    } catch (err: any) {
      if (err?.code === 'UNSUPPORTED_APPROVAL_CONDITION') {
        return res.status(422).json({ error: err.message, code: err.code });
      }
      throw err;
    }

    const requestNumber = generateCode('APR');
    const result = await dbRun(
      `INSERT INTO approval_requests (request_number, module, entity_type, entity_id, requester_id, current_step, status, notes, rule_id, condition_value)
       VALUES (?, ?, ?, ?, ?, 1, 'pending', ?, ?, ?)`,
      [requestNumber, module, entity_type, entity_id, userId, notes || null, rule?.id || null, nilai]
    );

    res.status(201).json({ success: true, data: { id: result.insertId, request_number: requestNumber } });
  } catch (error) {
    console.error('Error submitting approval request:', error);
    res.status(500).json({ error: 'Failed to submit approval request' });
  }
});

export default router;
