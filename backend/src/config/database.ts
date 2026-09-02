import path from 'path';
import dotenv from 'dotenv';
import mysql from 'mysql2/promise';
import bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

// MySQL Connection Pool Configuration
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'erp_manufacturing',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,

  // Kolom DATE dikembalikan sebagai string 'YYYY-MM-DD', bukan objek Date.
  //
  // Sebelumnya `purchase_date` bernilai 2026-01-31 di database berubah menjadi
  // '2026-01-30T17:00:00.000Z' di respons — pergeseran zona waktu WIB (+07).
  // Frontend mengisi form tanggal dengan `String(nilai).substring(0, 10)`,
  // sehingga menampilkan 30 Januari; begitu disimpan, tanggalnya BENAR-BENAR
  // menjadi 30. Setiap kali aset dibuka lalu disimpan, tanggalnya mundur satu
  // hari — korupsi data yang merambat pelan tanpa error apa pun.
  //
  // Sengaja dibatasi ke DATE saja: kolom itu memang tidak punya komponen jam,
  // jadi string tanggal murni selalu lebih benar. TIMESTAMP dan DATETIME
  // dibiarkan apa adanya supaya modul lain tidak ikut berubah perilakunya.
  dateStrings: ['DATE'] as any,
});

const activeDatabaseName = process.env.DB_NAME || 'erp_manufacturing';

// MySQL 8 doesn't support `ADD COLUMN IF NOT EXISTS` (MariaDB extension).
// Fallback: detect that syntax error, look up the column in INFORMATION_SCHEMA,
// and re-issue the ALTER without `IF NOT EXISTS` only if the column is missing.
const tryFallbackAddColumn = async (connection: any, sql: string): Promise<boolean> => {
  const m = sql.match(/^\s*ALTER\s+TABLE\s+`?(\w+)`?\s+ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+`?(\w+)`?\s+([\s\S]+)$/i);
  if (!m) return false;
  const [, table, column, definition] = m;
  try {
    const [rows]: any = await connection.execute(
      `SELECT COUNT(*) AS c FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
      [activeDatabaseName, table, column]
    );
    const exists = Array.isArray(rows) && rows[0] && Number(rows[0].c) > 0;
    if (exists) return true;
    await connection.execute(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`);
    return true;
  } catch (err: any) {
    console.warn('Schema fallback ALTER failed:', table, column, '-', err.message.substring(0, 120));
    return true; // handled (logged) — do not surface original error
  }
};

const execSchemaEnsure = async (connection: any, sql: string) => {
  try {
    await connection.execute(sql);
  } catch (err: any) {
    // MySQL 8 syntax error on `ADD COLUMN IF NOT EXISTS` — try fallback path
    const code = err && (err.code || err.errno);
    if (code === 'ER_PARSE_ERROR' || err.errno === 1064) {
      const handled = await tryFallbackAddColumn(connection, sql);
      if (handled) return;
    }
    console.warn('Schema ensure warning:', err.message.substring(0, 120));
  }
};

const ensureProcurementPaymentSchema = async (connection: any) => {
  const statements = [
    `ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS project_id INT NULL`,
    `ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS approval_status INT NOT NULL DEFAULT 0`,
    `ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS expected_date DATE NULL`,
    `ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS currency VARCHAR(10) NULL DEFAULT 'IDR'`,
    `ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS payment_term VARCHAR(100) NULL`,
    `ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS payment_term_2 VARCHAR(255) NULL`,
    `ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS address TEXT NULL`,
    `ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS type VARCHAR(50) NULL`,
    `ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS contact_person VARCHAR(100) NULL`,
    `ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS delivery_to TEXT NULL`,
    `ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS advance_payment DECIMAL(15,2) NOT NULL DEFAULT 0`,
    `ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS discount_percent DECIMAL(5,2) NOT NULL DEFAULT 0`,
    `ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS ppn_percent DECIMAL(5,2) NOT NULL DEFAULT 11`,
    `ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS po_date DATE NULL`,
    `ALTER TABLE purchase_order_items ADD COLUMN IF NOT EXISTS purchase_order_id INT NULL`,
    `ALTER TABLE purchase_order_items ADD COLUMN IF NOT EXISTS po_id INT NULL`,
    `ALTER TABLE purchase_order_items ADD COLUMN IF NOT EXISTS uom VARCHAR(50) NULL`,
    `ALTER TABLE purchase_order_items ADD COLUMN IF NOT EXISTS currency VARCHAR(10) NULL DEFAULT 'IDR'`,
    `ALTER TABLE accounts_payable ADD COLUMN IF NOT EXISTS po_schedule_id INT NULL`,
    `ALTER TABLE accounts_payable ADD COLUMN IF NOT EXISTS invoice_date DATE NULL`,
    `CREATE TABLE IF NOT EXISTS client_projects (
      id INT PRIMARY KEY AUTO_INCREMENT,
      project_number VARCHAR(100) NULL,
      project_name VARCHAR(255) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    `CREATE TABLE IF NOT EXISTS fund_requests (
      id INT PRIMARY KEY AUTO_INCREMENT,
      request_number VARCHAR(100) UNIQUE NOT NULL,
      request_date DATE NOT NULL,
      po_id INT NULL,
      po_schedule_id INT NULL,
      vendor_id INT NULL,
      amount DECIMAL(15,2) NOT NULL,
      needed_date DATE NOT NULL,
      purpose TEXT NOT NULL,
      status VARCHAR(30) NOT NULL DEFAULT 'draft',
      requester_id INT NULL,
      submitted_at TIMESTAMP NULL,
      approved_by INT NULL,
      approved_at TIMESTAMP NULL,
      rejection_reason TEXT NULL,
      notes TEXT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      KEY idx_fund_requests_status (status),
      KEY idx_fund_requests_needed_date (needed_date),
      KEY idx_fund_requests_po (po_id),
      KEY idx_fund_requests_schedule (po_schedule_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    `CREATE TABLE IF NOT EXISTS approval_requests (
      id INT PRIMARY KEY AUTO_INCREMENT,
      request_number VARCHAR(100) UNIQUE NOT NULL,
      module VARCHAR(100) NOT NULL,
      entity_type VARCHAR(100) NOT NULL,
      entity_id INT NOT NULL,
      requester_id INT NULL,
      current_step INT DEFAULT 1,
      status VARCHAR(50) DEFAULT 'pending',
      submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      completed_at TIMESTAMP NULL,
      notes TEXT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      KEY idx_approval_requests_module_status (module, status),
      KEY idx_approval_requests_entity (entity_type, entity_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    `CREATE TABLE IF NOT EXISTS purchase_order_payment_schedules (
      id INT PRIMARY KEY AUTO_INCREMENT,
      po_id INT NOT NULL,
      schedule_no INT NOT NULL,
      label VARCHAR(100) NOT NULL,
      trigger_type VARCHAR(50) NOT NULL DEFAULT 'manual',
      percentage DECIMAL(7,2) NOT NULL DEFAULT 0,
      amount DECIMAL(15,2) NOT NULL DEFAULT 0,
      due_date DATE NULL,
      status VARCHAR(30) NOT NULL DEFAULT 'open',
      paid_amount DECIMAL(15,2) NOT NULL DEFAULT 0,
      ap_id INT NULL,
      notes TEXT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_po_schedule_no (po_id, schedule_no),
      KEY idx_po_schedule_due_date (due_date),
      KEY idx_po_schedule_status (status),
      CONSTRAINT fk_po_schedule_po FOREIGN KEY (po_id) REFERENCES purchase_orders(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    `CREATE TABLE IF NOT EXISTS fund_request_items (
      id INT PRIMARY KEY AUTO_INCREMENT,
      fund_request_id INT NOT NULL,
      po_id INT NULL,
      po_schedule_id INT NULL,
      vendor_id INT NULL,
      description TEXT NULL,
      amount DECIMAL(15,2) NOT NULL DEFAULT 0,
      status VARCHAR(30) NOT NULL DEFAULT 'pending',
      approved_by INT NULL,
      approved_at TIMESTAMP NULL,
      rejection_reason TEXT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      KEY idx_fri_fr (fund_request_id),
      KEY idx_fri_po (po_id),
      KEY idx_fri_schedule (po_schedule_id),
      KEY idx_fri_status (status),
      CONSTRAINT fk_fri_fr FOREIGN KEY (fund_request_id) REFERENCES fund_requests(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    `ALTER TABLE fund_requests ADD COLUMN IF NOT EXISTS cash_account VARCHAR(255) NULL`,
    `ALTER TABLE fund_requests ADD COLUMN IF NOT EXISTS cash_account_note TEXT NULL`,
    `ALTER TABLE fund_request_items ADD COLUMN IF NOT EXISTS status VARCHAR(30) NOT NULL DEFAULT 'pending'`,
    `ALTER TABLE fund_request_items ADD COLUMN IF NOT EXISTS approved_by INT NULL`,
    `ALTER TABLE fund_request_items ADD COLUMN IF NOT EXISTS approved_at TIMESTAMP NULL`,
    `ALTER TABLE fund_request_items ADD COLUMN IF NOT EXISTS rejection_reason TEXT NULL`,
    `ALTER TABLE fund_request_items ADD COLUMN IF NOT EXISTS ap_id INT NULL`,
    `ALTER TABLE fund_request_items ADD COLUMN IF NOT EXISTS payment_recorded_at TIMESTAMP NULL`,
    `CREATE TABLE IF NOT EXISTS approval_rules (
      id INT PRIMARY KEY AUTO_INCREMENT,
      module VARCHAR(100) NOT NULL,
      name VARCHAR(255) NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      KEY idx_approval_rules_module (module)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    `CREATE TABLE IF NOT EXISTS approval_rule_steps (
      id INT PRIMARY KEY AUTO_INCREMENT,
      rule_id INT NOT NULL,
      step_order INT NOT NULL,
      approver_user_id INT NULL,
      approver_role_id INT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      KEY idx_approval_rule_steps_rule (rule_id),
      CONSTRAINT fk_ars_rule FOREIGN KEY (rule_id) REFERENCES approval_rules(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    `CREATE TABLE IF NOT EXISTS approval_actions (
      id INT PRIMARY KEY AUTO_INCREMENT,
      request_id INT NOT NULL,
      step_order INT NOT NULL,
      approver_id INT NULL,
      action VARCHAR(50) NOT NULL,
      comments TEXT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      KEY idx_approval_actions_request (request_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS user_level INT NOT NULL DEFAULT 1`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(50) NULL`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS address TEXT NULL`,
  ];

  for (const statement of statements) {
    await execSchemaEnsure(connection, statement);
  }

  await execSchemaEnsure(
    connection,
    `UPDATE purchase_order_items SET po_id = purchase_order_id WHERE po_id IS NULL AND purchase_order_id IS NOT NULL`
  );
  await execSchemaEnsure(
    connection,
    `UPDATE purchase_order_items SET purchase_order_id = po_id WHERE purchase_order_id IS NULL AND po_id IS NOT NULL`
  );
};

// ==================== R&D MODULE SCHEMA ====================
const ensureRnDSchema = async (connection: any) => {
  const statements = [
    // 1. R&D Projects (core table)
    `CREATE TABLE IF NOT EXISTS rnd_projects (
      id INT AUTO_INCREMENT PRIMARY KEY,
      project_code VARCHAR(50) NOT NULL UNIQUE,
      name VARCHAR(255) NOT NULL,
      project_type VARCHAR(50) DEFAULT 'new_product',
      category VARCHAR(50) DEFAULT 'chemical',
      description TEXT,
      objectives TEXT,
      expected_output TEXT,
      status ENUM('draft','active','on_hold','completed','cancelled') DEFAULT 'draft',
      priority ENUM('low','medium','high','critical') DEFAULT 'medium',
      risk_level VARCHAR(50) DEFAULT 'medium',
      confidentiality VARCHAR(50) DEFAULT 'internal',
      regulatory_requirements TEXT,
      target_market TEXT,
      target_product TEXT,
      project_leader_id INT,
      department_id INT,
      start_date DATE,
      target_end_date DATE,
      actual_end_date DATE,
      budget DECIMAL(15,2) DEFAULT 0,
      spent DECIMAL(15,2) DEFAULT 0,
      tags TEXT,
      notes TEXT,
      created_by INT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (project_leader_id) REFERENCES users(id) ON DELETE SET NULL,
      FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

    // Ensure missing columns on rnd_projects (may exist from old migration)
    `ALTER TABLE rnd_projects ADD COLUMN IF NOT EXISTS project_type VARCHAR(50) DEFAULT 'new_product'`,
    `ALTER TABLE rnd_projects ADD COLUMN IF NOT EXISTS category VARCHAR(50) DEFAULT 'chemical'`,
    `ALTER TABLE rnd_projects ADD COLUMN IF NOT EXISTS expected_output TEXT`,
    `ALTER TABLE rnd_projects ADD COLUMN IF NOT EXISTS risk_level VARCHAR(50) DEFAULT 'medium'`,
    `ALTER TABLE rnd_projects ADD COLUMN IF NOT EXISTS confidentiality VARCHAR(50) DEFAULT 'internal'`,
    `ALTER TABLE rnd_projects ADD COLUMN IF NOT EXISTS regulatory_requirements TEXT`,
    `ALTER TABLE rnd_projects ADD COLUMN IF NOT EXISTS target_market TEXT`,
    `ALTER TABLE rnd_projects ADD COLUMN IF NOT EXISTS target_product TEXT`,
    `ALTER TABLE rnd_projects ADD COLUMN IF NOT EXISTS tags TEXT`,

    // 2. Formulations
    `CREATE TABLE IF NOT EXISTS rnd_formulations (
      id INT AUTO_INCREMENT PRIMARY KEY,
      formula_code VARCHAR(50) NOT NULL UNIQUE,
      name VARCHAR(255) NOT NULL,
      version VARCHAR(20) DEFAULT '1.0',
      project_id INT,
      product_type_id INT,
      status ENUM('draft','testing','approved','revision','obsolete') DEFAULT 'draft',
      target_specs TEXT,
      description TEXT,
      notes TEXT,
      approved_by INT,
      approved_at DATETIME,
      created_by INT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (project_id) REFERENCES rnd_projects(id) ON DELETE SET NULL,
      FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

    // 2b. Formulation Ingredients
    `CREATE TABLE IF NOT EXISTS rnd_formulation_ingredients (
      id INT AUTO_INCREMENT PRIMARY KEY,
      formulation_id INT NOT NULL,
      product_id INT,
      ingredient_name VARCHAR(255) NOT NULL,
      quantity DECIMAL(15,4) NOT NULL DEFAULT 0,
      unit VARCHAR(50) DEFAULT 'kg',
      percentage DECIMAL(8,4),
      function_role VARCHAR(100),
      notes TEXT,
      sort_order INT DEFAULT 0,
      FOREIGN KEY (formulation_id) REFERENCES rnd_formulations(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

    // 3. Lab Tests
    `CREATE TABLE IF NOT EXISTS rnd_lab_tests (
      id INT AUTO_INCREMENT PRIMARY KEY,
      test_code VARCHAR(50) NOT NULL UNIQUE,
      test_name VARCHAR(255) NOT NULL,
      formulation_id INT,
      project_id INT,
      batch_number VARCHAR(100),
      test_type ENUM('physical','chemical','microbiological','stability','performance','other') DEFAULT 'chemical',
      method VARCHAR(255),
      equipment VARCHAR(255),
      status ENUM('scheduled','in_progress','completed','failed','cancelled') DEFAULT 'scheduled',
      test_date DATE,
      tested_by INT,
      parameters TEXT,
      results TEXT,
      conclusion ENUM('pass','fail','conditional','pending') DEFAULT 'pending',
      attachments TEXT,
      notes TEXT,
      created_by INT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (formulation_id) REFERENCES rnd_formulations(id) ON DELETE SET NULL,
      FOREIGN KEY (project_id) REFERENCES rnd_projects(id) ON DELETE SET NULL,
      FOREIGN KEY (tested_by) REFERENCES users(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

    // 4. Stability Studies
    `CREATE TABLE IF NOT EXISTS rnd_stability_studies (
      id INT AUTO_INCREMENT PRIMARY KEY,
      study_code VARCHAR(50) NOT NULL UNIQUE,
      name VARCHAR(255) NOT NULL,
      formulation_id INT,
      batch_number VARCHAR(100),
      status ENUM('planned','active','completed','cancelled') DEFAULT 'planned',
      storage_condition VARCHAR(255) DEFAULT '25°C / 60% RH',
      duration_months INT DEFAULT 12,
      start_date DATE,
      end_date DATE,
      protocol TEXT,
      conclusion TEXT,
      created_by INT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (formulation_id) REFERENCES rnd_formulations(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

    // 4b. Stability Checkpoints
    `CREATE TABLE IF NOT EXISTS rnd_stability_checkpoints (
      id INT AUTO_INCREMENT PRIMARY KEY,
      study_id INT NOT NULL,
      checkpoint_month INT NOT NULL DEFAULT 0,
      scheduled_date DATE,
      actual_date DATE,
      status ENUM('pending','completed','skipped') DEFAULT 'pending',
      parameters TEXT,
      results TEXT,
      pass_fail ENUM('pass','fail','pending') DEFAULT 'pending',
      tested_by INT,
      notes TEXT,
      FOREIGN KEY (study_id) REFERENCES rnd_stability_studies(id) ON DELETE CASCADE,
      FOREIGN KEY (tested_by) REFERENCES users(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

    // 5. Milestones
    `CREATE TABLE IF NOT EXISTS rnd_milestones (
      id INT AUTO_INCREMENT PRIMARY KEY,
      project_id INT NOT NULL,
      title VARCHAR(255) NOT NULL,
      description TEXT,
      phase VARCHAR(50) DEFAULT 'formulation_design',
      status VARCHAR(20) DEFAULT 'pending',
      due_date DATE,
      completed_date DATE,
      assigned_to INT,
      deliverables TEXT,
      sort_order INT DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (project_id) REFERENCES rnd_projects(id) ON DELETE CASCADE,
      FOREIGN KEY (assigned_to) REFERENCES users(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

    // 6. Project Tasks (Kanban)
    `CREATE TABLE IF NOT EXISTS rnd_project_tasks (
      id INT AUTO_INCREMENT PRIMARY KEY,
      project_id INT NOT NULL,
      title VARCHAR(255) NOT NULL,
      description TEXT,
      status VARCHAR(50) DEFAULT 'todo',
      priority VARCHAR(20) DEFAULT 'medium',
      assigned_to INT,
      due_date DATE,
      completed_date DATE,
      tags TEXT,
      sort_order INT DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (project_id) REFERENCES rnd_projects(id) ON DELETE CASCADE,
      FOREIGN KEY (assigned_to) REFERENCES users(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

    // 7. Document Folders
    `CREATE TABLE IF NOT EXISTS rnd_document_folders (
      id INT AUTO_INCREMENT PRIMARY KEY,
      project_id INT NOT NULL,
      name VARCHAR(255) NOT NULL,
      color VARCHAR(20) DEFAULT '#3B82F6',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (project_id) REFERENCES rnd_projects(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

    // 8. Documents
    `CREATE TABLE IF NOT EXISTS rnd_documents (
      id INT AUTO_INCREMENT PRIMARY KEY,
      project_id INT,
      formulation_id INT,
      lab_test_id INT,
      stability_study_id INT,
      doc_type VARCHAR(50) DEFAULT 'other',
      title VARCHAR(255) NOT NULL,
      description TEXT,
      file_name VARCHAR(255),
      file_path VARCHAR(500),
      file_size INT DEFAULT 0,
      mime_type VARCHAR(100),
      version VARCHAR(20) DEFAULT '1.0',
      folder_id INT,
      uploaded_by INT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (project_id) REFERENCES rnd_projects(id) ON DELETE SET NULL,
      FOREIGN KEY (formulation_id) REFERENCES rnd_formulations(id) ON DELETE SET NULL,
      FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

    // Ensure folder_id column on rnd_documents
    `ALTER TABLE rnd_documents ADD COLUMN IF NOT EXISTS folder_id INT NULL`,

    // Fix ENUM → VARCHAR on tables created by old migrations
    // (CREATE TABLE IF NOT EXISTS won't alter existing tables)
    `ALTER TABLE rnd_milestones MODIFY COLUMN phase VARCHAR(50) DEFAULT 'formulation_design'`,
    `ALTER TABLE rnd_milestones MODIFY COLUMN status VARCHAR(20) DEFAULT 'pending'`,
    `ALTER TABLE rnd_documents MODIFY COLUMN doc_type VARCHAR(50) DEFAULT 'other'`,
  ];

  for (const statement of statements) {
    await execSchemaEnsure(connection, statement);
  }
  console.log('✅ R&D module schema ensured');
};

// Helper functions for async/await query execution
export const dbQuery = async (sql: string, params: any[] = []): Promise<any> => {
  const connection = await pool.getConnection();
  try {
    const [results] = await connection.execute(sql, params);
    return results;
  } finally {
    connection.release();
  }
};

export const dbGet = async (sql: string, params: any[] = []): Promise<any> => {
  const results = await dbQuery(sql, params);
  return Array.isArray(results) ? results[0] : results;
};

export const dbAll = async (sql: string, params: any[] = []): Promise<any[]> => {
  const results = await dbQuery(sql, params);
  return Array.isArray(results) ? results : [results];
};

export const dbRun = async (sql: string, params: any[] = []): Promise<{ insertId: number; affectedRows: number }> => {
  const connection = await pool.getConnection();
  try {
    const [result] = await connection.execute(sql, params);
    return {
      insertId: (result as any).insertId,
      affectedRows: (result as any).affectedRows,
    };
  } finally {
    connection.release();
  }
};

/**
 * Jalankan beberapa query dalam satu transaction. Semua helper di atas memakai
 * koneksi berbeda tiap panggilan, jadi tidak bisa dipakai untuk operasi yang
 * harus atomik — mis. menutup periode depresiasi (banyak INSERT ledger +
 * UPDATE status periode). Kalau callback melempar, seluruhnya di-rollback.
 */
export interface TxRunner {
  run: (sql: string, params?: any[]) => Promise<{ insertId: number; affectedRows: number }>;
  all: (sql: string, params?: any[]) => Promise<any[]>;
  get: (sql: string, params?: any[]) => Promise<any>;
}

export const withTransaction = async <T>(fn: (tx: TxRunner) => Promise<T>): Promise<T> => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const tx: TxRunner = {
      run: async (sql, params = []) => {
        const [r]: any = await connection.execute(sql, params);
        return { insertId: r.insertId, affectedRows: r.affectedRows };
      },
      all: async (sql, params = []) => {
        const [r]: any = await connection.execute(sql, params);
        return Array.isArray(r) ? r : [r];
      },
      get: async (sql, params = []) => {
        const [r]: any = await connection.execute(sql, params);
        return Array.isArray(r) ? r[0] : r;
      },
    };
    const result = await fn(tx);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

// ==================== APPROVAL 2-STAGE PERMISSIONS ====================
const ensureApprovalPermissions = async (connection: any) => {
  // Ensure permissions table has module/name columns (production has them, dev may not)
  await execSchemaEnsure(connection, `ALTER TABLE permissions ADD COLUMN IF NOT EXISTS module VARCHAR(100) NULL`);
  await execSchemaEnsure(connection, `ALTER TABLE permissions ADD COLUMN IF NOT EXISTS name VARCHAR(200) NULL`);

  // Define modules that need 2-stage approval permissions
  const approvalModules = [
    { resource: 'procurement.purchase-requests', module: 'Procurement - Purchase Requests', label: 'Purchase Requests' },
    { resource: 'procurement.spec-approval', module: 'Procurement - Spec Approval', label: 'Spec Approval' },
    { resource: 'procurement.purchase-orders', module: 'Procurement - Purchase Orders', label: 'Purchase Orders' },
    { resource: 'procurement.grn', module: 'Procurement - Goods Receipt (GRN)', label: 'Goods Receipt' },
    { resource: 'finance.fund-requests', module: 'Finance - Fund Requests', label: 'Fund Requests' },
    { resource: 'finance.ap', module: 'Finance - Accounts Payable', label: 'Accounts Payable' },
    { resource: 'finance.ar', module: 'Finance - Accounts Receivable', label: 'Accounts Receivable' },
    { resource: 'quality.batch-release', module: 'Quality - Batch Release', label: 'Batch Release' },
    { resource: 'quality.ncr', module: 'Quality - Non-Conformance', label: 'Non-Conformance' },
    { resource: 'production.workorders', module: 'Production - Work Orders', label: 'Work Orders' },
    { resource: 'production.fg-receipt', module: 'Production - FG Receipt', label: 'FG Receipt' },
    { resource: 'inventory.stock-adjustment', module: 'Inventory - Stock Adjustment', label: 'Stock Adjustment' },
    { resource: 'inventory.stock-transfer', module: 'Inventory - Stock Transfer', label: 'Stock Transfer' },
    { resource: 'master_data.bom', module: 'Master Data - Bill of Materials', label: 'BOM' },
    { resource: 'rnd.rnd-projects', module: 'R&D - R&D Projects', label: 'R&D Projects' },
    { resource: 'rnd.rnd-formulations', module: 'R&D - Formulations', label: 'R&D Formulations' },
  ];

  for (const mod of approvalModules) {
    // approve_1 = Supervisor Approval (step 1)
    await execSchemaEnsure(connection,
      `INSERT IGNORE INTO permissions (resource, action, module, name, description)
       VALUES ('${mod.resource}', 'approve_1', '${mod.module}', '${mod.label} Approve Level 1',
               'Supervisor-level approval (step 1 of 2)')`
    );
    // approve_2 = Manager/Final Approval (step 2)
    await execSchemaEnsure(connection,
      `INSERT IGNORE INTO permissions (resource, action, module, name, description)
       VALUES ('${mod.resource}', 'approve_2', '${mod.module}', '${mod.label} Approve Level 2',
               'Manager-level final approval (step 2 of 2)')`
    );
  }

  // Spec Approval needs a 'view' permission so it appears as a full row in the UI
  await execSchemaEnsure(connection,
    `INSERT IGNORE INTO permissions (resource, action, module, name, description)
     VALUES ('procurement.spec-approval', 'view', 'Procurement - Spec Approval', 'Spec Approval View',
             'View spec approval status on PR items')`
  );

  console.log('✅ Approval 2-stage permissions ensured');
};

// ==================== ASSET MANAGEMENT ====================
const ensureAssetManagementSchema = async (connection: any) => {
  const statements = [
    `CREATE TABLE IF NOT EXISTS asset_categories (
      id INT PRIMARY KEY AUTO_INCREMENT,
      code VARCHAR(20) UNIQUE NOT NULL,
      name VARCHAR(100) NOT NULL,
      requires_production_line TINYINT(1) NOT NULL DEFAULT 0,
      order_no INT DEFAULT 0,
      is_active TINYINT(1) NOT NULL DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

    `CREATE TABLE IF NOT EXISTS production_lines (
      id INT PRIMARY KEY AUTO_INCREMENT,
      code VARCHAR(50) NULL,
      name VARCHAR(150) NOT NULL,
      description TEXT NULL,
      is_active TINYINT(1) NOT NULL DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

    `CREATE TABLE IF NOT EXISTS pnids (
      id INT PRIMARY KEY AUTO_INCREMENT,
      production_line_id INT NOT NULL,
      code VARCHAR(50) NOT NULL,
      title VARCHAR(200) NULL,
      description TEXT NULL,
      is_active TINYINT(1) NOT NULL DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (production_line_id) REFERENCES production_lines(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

    `CREATE TABLE IF NOT EXISTS assets (
      id INT PRIMARY KEY AUTO_INCREMENT,
      asset_code VARCHAR(50) UNIQUE NOT NULL,
      category_id INT NOT NULL,
      production_line_id INT NULL,
      pnid_tag VARCHAR(100) NULL,
      name VARCHAR(200) NOT NULL,
      location VARCHAR(200) NULL,
      spec JSON NULL,
      purchase_date DATE NULL,
      purchase_price DECIMAL(18,2) NOT NULL DEFAULT 0,
      vendor VARCHAR(200) NULL,
      useful_life_years INT NOT NULL DEFAULT 1,
      salvage_value DECIMAL(18,2) NOT NULL DEFAULT 0,
      depreciation_method VARCHAR(30) NOT NULL DEFAULT 'straight_line',
      status VARCHAR(30) NOT NULL DEFAULT 'active',
      disposed_date DATE NULL,
      notes TEXT NULL,
      created_by INT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (category_id) REFERENCES asset_categories(id),
      FOREIGN KEY (production_line_id) REFERENCES production_lines(id) ON DELETE SET NULL,
      FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

    `ALTER TABLE assets ADD COLUMN IF NOT EXISTS pnid_id INT NULL`,

    `CREATE TABLE IF NOT EXISTS asset_documents (
      id INT PRIMARY KEY AUTO_INCREMENT,
      asset_id INT NOT NULL,
      doc_title VARCHAR(200) NULL,
      doc_category VARCHAR(100) NULL,
      file_name VARCHAR(255) NOT NULL,
      file_path VARCHAR(500) NOT NULL,
      file_type VARCHAR(100) NULL,
      file_size INT NULL,
      uploaded_by INT NULL,
      uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE CASCADE,
      FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

    `CREATE TABLE IF NOT EXISTS asset_maintenance_logs (
      id INT PRIMARY KEY AUTO_INCREMENT,
      asset_id INT NOT NULL,
      maintenance_type VARCHAR(50) NOT NULL DEFAULT 'corrective',
      description TEXT NULL,
      cost DECIMAL(18,2) NOT NULL DEFAULT 0,
      performed_by VARCHAR(200) NULL,
      vendor VARCHAR(200) NULL,
      performed_at DATE NOT NULL,
      next_due_date DATE NULL,
      created_by INT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE CASCADE,
      FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

    `CREATE TABLE IF NOT EXISTS asset_purchase_history (
      id INT PRIMARY KEY AUTO_INCREMENT,
      asset_id INT NOT NULL,
      purchase_order_item_id INT NULL,
      description VARCHAR(300) NULL,
      amount DECIMAL(18,2) NOT NULL DEFAULT 0,
      purchase_date DATE NOT NULL,
      vendor VARCHAR(200) NULL,
      notes TEXT NULL,
      created_by INT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE CASCADE,
      FOREIGN KEY (purchase_order_item_id) REFERENCES purchase_order_items(id) ON DELETE SET NULL,
      FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

    `INSERT IGNORE INTO asset_categories (code, name, requires_production_line, order_no) VALUES
      ('LAND', 'Tanah', 0, 1),
      ('BLDG', 'Bangunan', 0, 2),
      ('PIPE', 'Piping', 1, 3),
      ('ELEC', 'Electrical', 1, 4),
      ('INST', 'Instrumen', 1, 5),
      ('MACH', 'Mesin', 1, 6),
      ('OTHER', 'Lainnya', 0, 7)`,

    `ALTER TABLE permissions ADD COLUMN IF NOT EXISTS module VARCHAR(100) NULL`,
    `ALTER TABLE permissions ADD COLUMN IF NOT EXISTS name VARCHAR(200) NULL`,
    `INSERT IGNORE INTO permissions (resource, action, module, name, description)
     VALUES ('assets', 'view', 'Asset Management', 'Asset Management View', 'View asset register and details')`,
    `INSERT IGNORE INTO permissions (resource, action, module, name, description)
     VALUES ('assets', 'manage', 'Asset Management', 'Asset Management Manage', 'Create/edit/delete assets, documents, maintenance & purchase history')`,
  ];

  for (const statement of statements) {
    await execSchemaEnsure(connection, statement);
  }
  console.log('✅ Asset Management schema ensured');
};

// ==================== TABEL YANG DULU DIBUAT SAAT IMPORT ROUTE ====================
// Empat tabel ini sebelumnya dibuat di level modul (`initInboxTable()` dkk di
// routes/*.ts), yang berjalan saat import — jadi SEBELUM initializeDatabase().
// Di database kosong, inbox_notifications gagal karena foreign key-nya menunjuk
// `users` yang belum ada, dan rejection-nya mematikan proses. Dipindah ke sini
// supaya urutannya dijamin dan konsisten dengan konvensi ensure*Schema.
/**
 * DR-P0-06b: office kerja diikat ke CHALLENGE registrasi, bukan dikirim ulang
 * di body saat verify.
 *
 * Urutan sebenarnya di browser adalah
 * `register/options → navigator.credentials.create() → register/verify`.
 * Jadi memeriksa office di handler verify — sekalipun sebelum
 * `verifyRegistrationResponse()` — tetap TERLAMBAT: passkey sudah dibuat
 * authenticator sebelum permintaan verify dikirim. Karyawan yang memilih lokasi
 * nonaktif menyelesaikan prompt sidik jari, lalu ditolak 400; authenticator
 * menyimpan credential sementara server tidak, dan percobaan ulang membingungkan
 * OS-nya.
 *
 * Dengan kolom ini, office divalidasi di `register/options` — sebelum browser
 * pernah memanggil authenticator — lalu ikatannya diperiksa ulang saat verify.
 */
const ensureWebauthnChallengeOffice = async (connection: any) => {
  await execSchemaEnsure(connection,
    'ALTER TABLE webauthn_challenges ADD COLUMN IF NOT EXISTS office_location_id INT NULL');
};

/**
 * CONTRACT-R51: ledger kontrak & change order.
 *
 * Sebelum ini, satu-satunya jejak nilai kontrak adalah `client_projects.budget`
 * — satu angka yang bisa ditimpa siapa saja. Tidak ada yang memisahkan nilai
 * kontrak ASLI dari perubahan yang disetujui, jadi begitu budget bergeser tidak
 * ada cara membuktikan berapa yang sebenarnya disepakati di awal, apa yang
 * mengubahnya, atau siapa yang menyetujuinya.
 *
 * Tiga tabel, dan pembagiannya menentukan:
 *
 *   `contracts`              — satu per project. Nilai ASLI di sini, dan tidak
 *                              pernah diubah change order.
 *   `contract_baseline_lines`— potret BOQ saat award. IMMUTABLE: tidak ada satu
 *                              pun jalur tulis setelah dibuat. Inilah yang
 *                              membuat "edit proposal setelah award" tidak bisa
 *                              menggeser kontrak.
 *   `change_orders` + lines  — perubahan, masing-masing dengan status dan
 *                              jejak siapa/kapan.
 *
 * Nilai berjalan TIDAK disimpan sebagai kolom. `revised_value` dihitung
 * `original + SUM(CO approved)` setiap kali dibaca — kolom denormalisasi akan
 * melenceng dari isinya, dan selisih itu tidak akan bisa dijelaskan siapa pun.
 */
const ensureContractLedgerSchema = async (connection: any) => {
  await execSchemaEnsure(connection, `
    CREATE TABLE IF NOT EXISTS contracts (
      id INT AUTO_INCREMENT PRIMARY KEY,
      contract_number VARCHAR(50) NOT NULL,
      project_id INT NOT NULL,
      client_id INT NULL,
      proposal_id INT NULL,
      proposal_revision VARCHAR(50) NULL,
      -- Nilai kontrak ASLI. Change order TIDAK PERNAH menyentuh kolom ini.
      original_value DECIMAL(18,2) NOT NULL DEFAULT 0,
      currency VARCHAR(10) NOT NULL DEFAULT 'IDR',
      -- Checksum isi baseline, supaya kesamaan dengan proposal bisa dibuktikan
      -- tanpa membandingkan baris satu per satu.
      baseline_checksum CHAR(64) NULL,
      signed_date DATE NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'active',
      created_by INT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      -- Satu project = satu kontrak. Ini yang membuat Deal yang diulang tidak
      -- menghasilkan kontrak kedua, tanpa perlu mengandalkan pemeriksaan di
      -- kode saja.
      UNIQUE KEY uq_contract_project (project_id),
      UNIQUE KEY uq_contract_number (contract_number),
      KEY idx_contract_client (client_id),
      -- FK cascade, bukan pembersihan di kode.
      --
      -- Pelajaran dari EST-LIFE-R42 dan R47: engineering_inputs tidak punya FK
      -- ke proposals maupun client_projects, dan akibatnya menghapus salah
      -- satunya meninggalkan turunan yang tidak bisa dijangkau layar mana pun --
      -- 20 elemen dan 139 baris yatim terukur di produksi. Kontrak tanpa project
      -- adalah keadaan yang sama: ia menunjuk pekerjaan yang sudah tidak ada,
      -- dan tidak ada yang bisa membukanya untuk membersihkannya.
      CONSTRAINT fk_contract_project FOREIGN KEY (project_id)
        REFERENCES client_projects(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  // Instalasi yang tabelnya sudah terbentuk sebelum FK ini ada tetap perlu
  // ditambahi — `CREATE TABLE IF NOT EXISTS` di atas tidak menyentuhnya.
  await execSchemaEnsure(connection, `
    ALTER TABLE contracts ADD CONSTRAINT fk_contract_project
      FOREIGN KEY (project_id) REFERENCES client_projects(id) ON DELETE CASCADE`);

  await execSchemaEnsure(connection, `
    CREATE TABLE IF NOT EXISTS contract_baseline_lines (
      id INT AUTO_INCREMENT PRIMARY KEY,
      contract_id INT NOT NULL,
      line_no INT NOT NULL,
      section_label VARCHAR(255) NULL,
      is_section TINYINT(1) NOT NULL DEFAULT 0,
      ahsp_code VARCHAR(50) NULL,
      description VARCHAR(500) NULL,
      unit VARCHAR(50) NULL,
      qty DECIMAL(18,4) NOT NULL DEFAULT 0,
      unit_price DECIMAL(18,2) NOT NULL DEFAULT 0,
      amount DECIMAL(18,2) NOT NULL DEFAULT 0,
      source_item_id INT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      KEY idx_baseline_contract (contract_id),
      CONSTRAINT fk_baseline_contract FOREIGN KEY (contract_id)
        REFERENCES contracts(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  await execSchemaEnsure(connection, `
    CREATE TABLE IF NOT EXISTS change_orders (
      id INT AUTO_INCREMENT PRIMARY KEY,
      co_number VARCHAR(50) NOT NULL,
      contract_id INT NOT NULL,
      title VARCHAR(255) NOT NULL,
      description TEXT NULL,
      -- Dari mana perubahan ini berasal: permintaan client, kondisi lapangan,
      -- jawaban RFI, atau kesalahan desain. Dipakai analisis, dan menjaga
      -- supaya "siapa yang menanggung" tidak hilang jejaknya.
      source VARCHAR(30) NOT NULL DEFAULT 'client',
      value_delta DECIMAL(18,2) NOT NULL DEFAULT 0,
      cost_delta DECIMAL(18,2) NOT NULL DEFAULT 0,
      schedule_days_delta INT NOT NULL DEFAULT 0,
      status VARCHAR(20) NOT NULL DEFAULT 'draft',
      submitted_at TIMESTAMP NULL,
      submitted_by INT NULL,
      decided_at TIMESTAMP NULL,
      decided_by INT NULL,
      decision_note TEXT NULL,
      created_by INT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_co_number (co_number),
      KEY idx_co_contract_status (contract_id, status),
      CONSTRAINT fk_co_contract FOREIGN KEY (contract_id)
        REFERENCES contracts(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  await execSchemaEnsure(connection, `
    CREATE TABLE IF NOT EXISTS change_order_lines (
      id INT AUTO_INCREMENT PRIMARY KEY,
      change_order_id INT NOT NULL,
      line_no INT NOT NULL,
      description VARCHAR(500) NOT NULL,
      unit VARCHAR(50) NULL,
      qty DECIMAL(18,4) NOT NULL DEFAULT 0,
      unit_price DECIMAL(18,2) NOT NULL DEFAULT 0,
      amount DECIMAL(18,2) NOT NULL DEFAULT 0,
      cost_amount DECIMAL(18,2) NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      KEY idx_col_co (change_order_id),
      CONSTRAINT fk_col_co FOREIGN KEY (change_order_id)
        REFERENCES change_orders(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  // Jejak setiap perpindahan status — siapa, kapan, dari apa ke apa.
  await execSchemaEnsure(connection, `
    CREATE TABLE IF NOT EXISTS change_order_events (
      id INT AUTO_INCREMENT PRIMARY KEY,
      change_order_id INT NOT NULL,
      from_status VARCHAR(20) NULL,
      to_status VARCHAR(20) NOT NULL,
      note TEXT NULL,
      actor_id INT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      KEY idx_coe_co (change_order_id),
      CONSTRAINT fk_coe_co FOREIGN KEY (change_order_id)
        REFERENCES change_orders(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
};

/**
 * PROP-REV-R52: revision ledger proposal.
 *
 * Sebelum ini `proposals.revision` hanyalah TEKS yang bisa diubah, dan seluruh
 * item menunjuk langsung ke `proposal_id`. Artinya: begitu proposal yang sudah
 * dikirim ke client dikembalikan ke review lalu di-submit lagi, baris yang sama
 * ditimpa dan `submitted_at` tertulis ulang. **Versi yang pernah diterima client
 * tidak bisa direkonstruksi sama sekali** — dan itulah yang dipegang saat terjadi
 * sengketa lingkup atau harga.
 *
 * Bentuknya sama dengan baseline kontrak (CONTRACT-R51), satu tingkat di atasnya:
 * potret immutable + checksum. Yang membedakan, sebuah proposal bisa punya
 * banyak revisi sementara sebuah project hanya punya satu kontrak.
 */
const ensureProposalRevisionSchema = async (connection: any) => {
  await execSchemaEnsure(connection, `
    CREATE TABLE IF NOT EXISTS proposal_revisions (
      id INT AUTO_INCREMENT PRIMARY KEY,
      proposal_id INT NOT NULL,
      revision_no INT NOT NULL,
      -- issued  : sudah dikirim ke client
      -- accepted: revisi inilah yang menjadi kesepakatan
      -- superseded: digantikan revisi berikutnya
      status VARCHAR(20) NOT NULL DEFAULT 'issued',
      -- Potret header saat diterbitkan. Disimpan, bukan dibaca ulang dari
      -- proposals: kalau dibaca ulang, revisi lama ikut berubah setiap kali
      -- headernya disunting, dan potretnya berhenti menjadi potret.
      project_name VARCHAR(255) NULL,
      client_name VARCHAR(255) NULL,
      lokasi VARCHAR(255) NULL,
      proposal_type VARCHAR(50) NULL,
      direct_cost DECIMAL(18,2) NOT NULL DEFAULT 0,
      overhead DECIMAL(18,2) NOT NULL DEFAULT 0,
      risk_contingency DECIMAL(18,2) NOT NULL DEFAULT 0,
      total_project DECIMAL(18,2) NOT NULL DEFAULT 0,
      design_params JSON NULL,
      lines_checksum CHAR(64) NULL,
      line_count INT NOT NULL DEFAULT 0,
      issued_at TIMESTAMP NULL,
      issued_by INT NULL,
      accepted_at TIMESTAMP NULL,
      accepted_by INT NULL,
      superseded_at TIMESTAMP NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_prop_rev (proposal_id, revision_no),
      KEY idx_prop_rev_status (proposal_id, status),
      CONSTRAINT fk_prop_rev_proposal FOREIGN KEY (proposal_id)
        REFERENCES proposals(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  await execSchemaEnsure(connection, `
    CREATE TABLE IF NOT EXISTS proposal_revision_lines (
      id INT AUTO_INCREMENT PRIMARY KEY,
      revision_id INT NOT NULL,
      line_no INT NOT NULL,
      is_section TINYINT(1) NOT NULL DEFAULT 0,
      section_label VARCHAR(255) NULL,
      ahsp_code VARCHAR(50) NULL,
      description VARCHAR(500) NULL,
      unit VARCHAR(50) NULL,
      qty DECIMAL(18,4) NOT NULL DEFAULT 0,
      unit_price DECIMAL(18,2) NOT NULL DEFAULT 0,
      amount DECIMAL(18,2) NOT NULL DEFAULT 0,
      source_item_id INT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      KEY idx_prl_rev (revision_id),
      CONSTRAINT fk_prl_rev FOREIGN KEY (revision_id)
        REFERENCES proposal_revisions(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  // Revisi yang diterima ditunjuk dari headernya, supaya "mana yang disepakati"
  // bisa dijawab tanpa menebak dari timestamp.
  await execSchemaEnsure(connection,
    'ALTER TABLE proposals ADD COLUMN IF NOT EXISTS accepted_revision_id INT NULL');
};

/**
 * SCHED-R57: master schedule yang reproducible.
 *
 * Dua cacat yang membuatnya tidak reproducible, dan keduanya terbukti di kode:
 *
 * 1. **Parameter jadwal tidak pernah disimpan.** `workers_per_day`,
 *    `hours_per_day`, dan `start_date` hanya query parameter, dan layar
 *    menginisialisasi tanggal mulai dari `new Date()` — jam browser. Membuka
 *    proposal yang SAMA besok menghasilkan tanggal berbeda, dan dua orang yang
 *    membukanya di hari berbeda melihat jadwal berbeda.
 * 2. **Jadwal dihitung ulang dari master LIVE tiap request.** Endpoint membaca
 *    `ahsp_items`, `ahsp_headers`, dan `ahsp_wbs_templates` yang sedang
 *    berlaku. Begitu komposisi AHSP diperbaiki, durasi dan tanggal selesai
 *    proposal yang sudah dikirim ke client ikut berubah — tanpa satu pun
 *    tindakan estimator.
 *
 * Yang disimpan di sini menutup keduanya: parameternya menempel pada proposal,
 * dan hasil jadwalnya dipotret saat revisi diterbitkan. Master tetap boleh
 * berkembang untuk revisi berikutnya; revisi yang sudah terbit selalu membaca
 * potretnya.
 */
const ensureProposalScheduleSchema = async (connection: any) => {
  for (const sql of [
    "ALTER TABLE proposals ADD COLUMN IF NOT EXISTS schedule_start_date DATE NULL",
    "ALTER TABLE proposals ADD COLUMN IF NOT EXISTS schedule_workers_per_day DECIMAL(10,2) NULL",
    "ALTER TABLE proposals ADD COLUMN IF NOT EXISTS schedule_hours_per_day DECIMAL(10,2) NULL",
    "ALTER TABLE proposals ADD COLUMN IF NOT EXISTS schedule_workdays_per_week TINYINT NULL",
  ]) await execSchemaEnsure(connection, sql);

  await execSchemaEnsure(connection, `
    CREATE TABLE IF NOT EXISTS proposal_revision_schedule (
      id INT AUTO_INCREMENT PRIMARY KEY,
      revision_id INT NOT NULL,
      line_no INT NOT NULL,
      proposal_item_id INT NULL,
      -- Nilainya mengikuti kontrak endpoint jadwal: 'section' atau 'item'.
      -- Sempat saya tulis 'task', dan itu bug nyata — layar menyaring baris
      -- dengan type === 'item', jadi potretnya akan terbaca kosong.
      row_type VARCHAR(20) NOT NULL DEFAULT 'item',
      kode VARCHAR(50) NULL,
      name VARCHAR(500) NULL,
      start_day DECIMAL(12,3) NOT NULL DEFAULT 0,
      duration_days DECIMAL(12,3) NOT NULL DEFAULT 0,
      start_date DATE NULL,
      end_date DATE NULL,
      -- Kolom yang dirender layar ikut dipotret. Tanpa ini, membuka jadwal
      -- revisi terbit menampilkan baris tanpa volume dan tanpa harga.
      qty DECIMAL(18,4) NULL,
      unit VARCHAR(50) NULL,
      unit_price DECIMAL(18,2) NULL,
      total_price DECIMAL(18,2) NULL,
      work_category VARCHAR(100) NULL,
      labor_total_oh DECIMAL(18,3) NOT NULL DEFAULT 0,
      -- Komposisi tenaga ikut dipotret: tanpa ini, "kenapa durasinya 12 hari"
      -- hanya bisa dijawab dengan menghitung ulang dari master yang mungkin
      -- sudah berubah.
      labor_components JSON NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      KEY idx_prs_rev (revision_id),
      CONSTRAINT fk_prs_rev FOREIGN KEY (revision_id)
        REFERENCES proposal_revisions(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  // Tabelnya sempat terbentuk tanpa kolom-kolom ini di database yang sudah
  // berjalan; CREATE TABLE IF NOT EXISTS tidak akan menambahkannya sendiri.
  for (const sql of [
    "ALTER TABLE proposal_revision_schedule ADD COLUMN IF NOT EXISTS qty DECIMAL(18,4) NULL",
    "ALTER TABLE proposal_revision_schedule ADD COLUMN IF NOT EXISTS unit VARCHAR(50) NULL",
    "ALTER TABLE proposal_revision_schedule ADD COLUMN IF NOT EXISTS unit_price DECIMAL(18,2) NULL",
    "ALTER TABLE proposal_revision_schedule ADD COLUMN IF NOT EXISTS total_price DECIMAL(18,2) NULL",
    "ALTER TABLE proposal_revision_schedule ADD COLUMN IF NOT EXISTS work_category VARCHAR(100) NULL",
  ]) await execSchemaEnsure(connection, sql);

  // Parameter yang dipakai saat potret dibuat, menempel pada revisinya.
  for (const sql of [
    "ALTER TABLE proposal_revisions ADD COLUMN IF NOT EXISTS schedule_start_date DATE NULL",
    "ALTER TABLE proposal_revisions ADD COLUMN IF NOT EXISTS schedule_workers_per_day DECIMAL(10,2) NULL",
    "ALTER TABLE proposal_revisions ADD COLUMN IF NOT EXISTS schedule_hours_per_day DECIMAL(10,2) NULL",
    "ALTER TABLE proposal_revisions ADD COLUMN IF NOT EXISTS schedule_workdays_per_week TINYINT NULL",
    "ALTER TABLE proposal_revisions ADD COLUMN IF NOT EXISTS schedule_total_days DECIMAL(12,3) NULL",
    "ALTER TABLE proposal_revisions ADD COLUMN IF NOT EXISTS schedule_checksum CHAR(64) NULL",
  ]) await execSchemaEnsure(connection, sql);
};

/**
 * SCHED-R57 (lanjutan) — basis sumber daya ikut dibekukan bersama revisinya.
 *
 * `GET /proposals/:id/resume` membaca `ahsp_items` LIVE: koefisien maupun
 * `resource_harga`. Akibatnya kebutuhan material/tenaga/alat dan biayanya untuk
 * penawaran yang SUDAH DIKIRIM ikut bergeser begitu master AHSP disunting —
 * dan biaya sumber dayanya bisa berhenti sejalan dengan `unit_price_snapshot`
 * yang dipakai BOQ-nya sendiri. Procurement plan dan mobilization plan yang
 * dibangun dari layar itu karena itu tidak bisa direkonsiliasi.
 */
const ensureProposalResourceSchema = async (connection: any) => {
  await execSchemaEnsure(connection, `
    CREATE TABLE IF NOT EXISTS proposal_revision_resource (
      id INT AUTO_INCREMENT PRIMARY KEY,
      revision_id INT NOT NULL,
      line_no INT NOT NULL,
      -- 'A' tenaga, 'B' material, 'C' alat — sama dengan ahsp_items.section.
      section CHAR(1) NOT NULL,
      proposal_item_id INT NULL,
      ahsp_code VARCHAR(50) NULL,
      ahsp_name VARCHAR(500) NULL,
      discipline VARCHAR(255) NULL,
      sub_discipline VARCHAR(255) NULL,
      resource_id INT NULL,
      resource_name VARCHAR(500) NULL,
      resource_satuan VARCHAR(50) NULL,
      -- Harga saat dibekukan. Tanpa kolom ini, biaya sumber daya dihitung ulang
      -- dengan harga master hari ini dan tidak lagi cocok dengan BOQ-nya.
      resource_harga DECIMAL(18,2) NOT NULL DEFAULT 0,
      koefisien DECIMAL(18,6) NOT NULL DEFAULT 0,
      item_qty DECIMAL(18,4) NOT NULL DEFAULT 0,
      total_qty DECIMAL(18,4) NOT NULL DEFAULT 0,
      total_cost DECIMAL(18,2) NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      KEY idx_prr_rev (revision_id),
      KEY idx_prr_sec (revision_id, section),
      CONSTRAINT fk_prr_rev FOREIGN KEY (revision_id)
        REFERENCES proposal_revisions(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  for (const sql of [
    "ALTER TABLE proposal_revisions ADD COLUMN IF NOT EXISTS resource_checksum CHAR(64) NULL",
    "ALTER TABLE proposal_revisions ADD COLUMN IF NOT EXISTS resource_line_count INT NULL",
  ]) await execSchemaEnsure(connection, sql);
};

/**
 * SCHED-R57 (penutup) — jadwal yang dijual ikut menyeberang saat Deal.
 *
 * Sebelum ini, transisi deal menyalin BOQ ke `contract_baseline_lines` dan MTO
 * ke scope project, tapi **jadwalnya tidak ikut sama sekali**. Project lahir
 * dengan `project_tasks` kosong, sehingga jadwal yang dipakai menghitung harga
 * dan dikirim ke client lenyap di serah terima — tim proyek menyusunnya lagi
 * dari nol, dan tidak ada acuan untuk mengukur keterlambatan.
 *
 * Tabel ini adalah acuan itu, dan sifatnya sama dengan `contract_baseline_lines`:
 * **tidak boleh punya jalur tulis**. `project_tasks` tetap jadi rencana kerja
 * yang boleh berubah; selisih keduanya justru informasi yang dicari.
 */
const ensureProjectScheduleBaselineSchema = async (connection: any) => {
  await execSchemaEnsure(connection, `
    CREATE TABLE IF NOT EXISTS project_schedule_baseline (
      id INT AUTO_INCREMENT PRIMARY KEY,
      project_id INT NOT NULL,
      -- Asal usulnya disimpan supaya baseline selalu bisa ditelusuri ke revisi
      -- penawaran yang benar-benar disepakati, bukan ke "jadwal saat itu".
      proposal_id INT NULL,
      revision_id INT NULL,
      revision_no INT NULL,
      line_no INT NOT NULL,
      row_type VARCHAR(20) NOT NULL DEFAULT 'item',
      proposal_item_id INT NULL,
      kode VARCHAR(50) NULL,
      name VARCHAR(500) NULL,
      start_day DECIMAL(12,3) NOT NULL DEFAULT 0,
      duration_days DECIMAL(12,3) NOT NULL DEFAULT 0,
      start_date DATE NULL,
      end_date DATE NULL,
      qty DECIMAL(18,4) NULL,
      unit VARCHAR(50) NULL,
      total_price DECIMAL(18,2) NULL,
      labor_total_oh DECIMAL(18,3) NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      KEY idx_psb_proj (project_id),
      UNIQUE KEY uq_psb_line (project_id, line_no),
      CONSTRAINT fk_psb_proj FOREIGN KEY (project_id)
        REFERENCES client_projects(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  for (const sql of [
    "ALTER TABLE client_projects ADD COLUMN IF NOT EXISTS schedule_baseline_checksum CHAR(64) NULL",
    "ALTER TABLE client_projects ADD COLUMN IF NOT EXISTS schedule_baseline_days DECIMAL(12,3) NULL",
    "ALTER TABLE client_projects ADD COLUMN IF NOT EXISTS schedule_baseline_start DATE NULL",
  ]) await execSchemaEnsure(connection, sql);
};

/**
 * FIN-SUBLEDGER — event pembayaran jadi source of truth yang bisa dikoreksi.
 *
 * Koreksi pembayaran sebelumnya tidak punya jalur sama sekali: satu-satunya
 * cara membetulkan angka yang salah adalah menyunting `accounts_payable.amount`
 * langsung, yang tidak meninggalkan jejak dan bisa membuat tagihan jadi lebih
 * kecil daripada yang sudah dibayar. Sekarang koreksi ditulis sebagai event
 * BARU bernilai negatif yang menunjuk event asalnya — riwayatnya tetap utuh
 * dan selisihnya selalu bisa dijelaskan.
 */
const ensurePaymentReversalSchema = async (connection: any) => {
  for (const t of ['ap_payments', 'ar_payments']) {
    for (const sql of [
      `ALTER TABLE ${t} ADD COLUMN IF NOT EXISTS reverses_payment_id INT NULL`,
      `ALTER TABLE ${t} ADD COLUMN IF NOT EXISTS reversed_by_payment_id INT NULL`,
      `ALTER TABLE ${t} ADD COLUMN IF NOT EXISTS reversal_reason VARCHAR(500) NULL`,
    ]) await execSchemaEnsure(connection, sql);
  }
};

/**
 * PROJ-CTRL Fase 1 — WBS/CBS: tulang punggung project controls.
 *
 * Sebelum ini "progress" proyek dihitung `COUNT(task Done) / COUNT(task)`.
 * Dua pekerjaan yang bobotnya berbeda jauh — galian 2 juta dan struktur beton
 * 800 juta — dihitung sama besar, jadi 50% bisa berarti apa saja. Tidak ada
 * pula tempat untuk menempelkan biaya: 0 dari 134 AP produksi punya
 * `project_id`, apalagi work package.
 *
 * Dua sumbu yang sengaja dipisah:
 *
 *   WBS (Work Breakdown Structure) — APA yang dikerjakan, berhierarki, dengan
 *   bobot dari nilai baseline kontrak. Ini yang membuat progress bisa dijumlah.
 *
 *   CBS / cost code — JENIS biayanya (upah, material, alat, subkon). Ini yang
 *   membuat biaya bisa dibandingkan antar proyek.
 *
 * Bobot disimpan, bukan dihitung saat dibaca, dan itu disengaja: ia BASELINE.
 * Bobot yang ikut bergerak setiap kali nilai berubah membuat kurva-S kemarin
 * dan hari ini tidak bisa dibandingkan.
 */
const ensureProjectWbsSchema = async (connection: any) => {
  // Katalog cost code berlaku lintas proyek — itu justru gunanya: biaya beton
  // di proyek A dan proyek B baru bisa dibandingkan kalau kodenya sama.
  await execSchemaEnsure(connection, `
    CREATE TABLE IF NOT EXISTS cost_codes (
      id INT AUTO_INCREMENT PRIMARY KEY,
      code VARCHAR(30) NOT NULL,
      name VARCHAR(255) NOT NULL,
      -- labor | material | equipment | subcon | overhead | other
      category VARCHAR(30) NOT NULL DEFAULT 'other',
      description VARCHAR(500) NULL,
      is_active TINYINT(1) NOT NULL DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_cost_code (code)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  await execSchemaEnsure(connection, `
    CREATE TABLE IF NOT EXISTS project_wbs (
      id INT AUTO_INCREMENT PRIMARY KEY,
      project_id INT NOT NULL,
      parent_id INT NULL,
      -- Kode berjenjang seperti 1, 1.2, 1.2.3 — dibentuk saat dibuat.
      wbs_code VARCHAR(50) NOT NULL,
      level TINYINT NOT NULL DEFAULT 1,
      name VARCHAR(500) NOT NULL,
      description VARCHAR(500) NULL,
      qty DECIMAL(18,4) NULL,
      unit VARCHAR(50) NULL,
      -- Nilai baseline dan bobotnya. Keduanya dibekukan saat WBS dibentuk.
      baseline_value DECIMAL(18,2) NOT NULL DEFAULT 0,
      weight_pct DECIMAL(9,6) NOT NULL DEFAULT 0,
      cost_code_id INT NULL,
      -- Asal usulnya: 'contract_baseline' kalau dibentuk dari BOQ kontrak,
      -- 'manual' kalau ditambahkan orang. Dibedakan supaya jelas mana yang
      -- benar-benar mewakili apa yang dijual.
      source VARCHAR(30) NOT NULL DEFAULT 'manual',
      source_line_no INT NULL,
      sort_order INT NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_wbs_kode (project_id, wbs_code),
      KEY idx_wbs_proj (project_id),
      KEY idx_wbs_parent (parent_id),
      CONSTRAINT fk_wbs_proj FOREIGN KEY (project_id)
        REFERENCES client_projects(id) ON DELETE CASCADE,
      CONSTRAINT fk_wbs_parent FOREIGN KEY (parent_id)
        REFERENCES project_wbs(id) ON DELETE CASCADE,
      CONSTRAINT fk_wbs_cost_code FOREIGN KEY (cost_code_id)
        REFERENCES cost_codes(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  // Transaksi menempel ke work package. Nullable: data lama tidak boleh
  // mendadak tidak valid, dan pemetaan susulan adalah pekerjaan tersendiri.
  for (const sql of [
    "ALTER TABLE project_tasks ADD COLUMN IF NOT EXISTS wbs_id INT NULL",
    "ALTER TABLE project_expenses ADD COLUMN IF NOT EXISTS wbs_id INT NULL",
    "ALTER TABLE project_expenses ADD COLUMN IF NOT EXISTS cost_code_id INT NULL",
    "ALTER TABLE client_projects ADD COLUMN IF NOT EXISTS wbs_baseline_value DECIMAL(18,2) NULL",
    "ALTER TABLE client_projects ADD COLUMN IF NOT EXISTS wbs_checksum CHAR(64) NULL",
  ]) await execSchemaEnsure(connection, sql);

  // Katalog awal yang netral — supaya fitur cost code tidak lahir kosong dan
  // tiap proyek mengarang kodenya sendiri.
  await execSchemaEnsure(connection, `
    INSERT IGNORE INTO cost_codes (code, name, category) VALUES
      ('LAB', 'Upah / Tenaga Kerja', 'labor'),
      ('MAT', 'Material', 'material'),
      ('EQP', 'Peralatan', 'equipment'),
      ('SUB', 'Subkontraktor', 'subcon'),
      ('OVH', 'Overhead Proyek', 'overhead'),
      ('OTH', 'Lain-lain', 'other')`);
};

/**
 * PROJ-CTRL Fase 2 — progress cut-off dengan bukti dan persetujuan.
 *
 * Sampai Fase 1, "progress" masih turunan status task: begitu seseorang menekan
 * Done, angkanya naik. Itu cukup untuk papan kerja, tapi tidak untuk apa pun
 * yang berkonsekuensi uang — tidak ada periode, tidak ada bukti, tidak ada yang
 * menyetujui, dan tidak ada jejak siapa mengklaim berapa.
 *
 * Tiga angka sengaja disimpan TERPISAH untuk tiap work package tiap periode:
 *
 *   planned  — seharusnya sudah berapa persen menurut baseline jadwal
 *   claimed  — yang diakui lapangan
 *   approved — yang disetujui setelah diperiksa
 *
 * Meleburnya menjadi satu "progress" menghapus justru informasi yang dicari:
 * selisih claimed vs approved adalah eksposur, dan selisih approved vs planned
 * adalah keterlambatan. Hanya `approved` yang menjadi earned progress.
 *
 * Periode yang sudah disetujui **tidak boleh punya jalur tulis** — sama seperti
 * `contract_baseline_lines` dan `project_schedule_baseline`. Koreksi dilakukan
 * lewat periode berikutnya, bukan dengan menyunting yang sudah disetujui.
 */
const ensureProgressCutoffSchema = async (connection: any) => {
  await execSchemaEnsure(connection, `
    CREATE TABLE IF NOT EXISTS project_progress_periods (
      id INT AUTO_INCREMENT PRIMARY KEY,
      project_id INT NOT NULL,
      period_no INT NOT NULL,
      period_start DATE NULL,
      period_end DATE NULL,
      cutoff_date DATE NOT NULL,
      -- draft → submitted → approved. Ditolak kembali ke draft supaya lapangan
      -- bisa memperbaiki; yang approved bersifat final.
      status VARCHAR(20) NOT NULL DEFAULT 'draft',
      submitted_by INT NULL, submitted_at DATETIME NULL,
      approved_by INT NULL, approved_at DATETIME NULL,
      rejected_by INT NULL, rejected_at DATETIME NULL,
      rejection_reason VARCHAR(500) NULL,
      -- Dibekukan saat disetujui, bukan dihitung ulang saat dibaca: bobot dan
      -- baseline boleh berkembang untuk periode berikutnya, tapi angka yang
      -- sudah disetujui harus tetap bisa dibaca ulang persis sama.
      planned_pct DECIMAL(9,4) NULL,
      claimed_pct DECIMAL(9,4) NULL,
      earned_pct DECIMAL(9,4) NULL,
      checksum CHAR(64) NULL,
      created_by INT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_periode (project_id, period_no),
      KEY idx_periode_proj (project_id, status),
      CONSTRAINT fk_periode_proj FOREIGN KEY (project_id)
        REFERENCES client_projects(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  await execSchemaEnsure(connection, `
    CREATE TABLE IF NOT EXISTS project_progress_lines (
      id INT AUTO_INCREMENT PRIMARY KEY,
      period_id INT NOT NULL,
      wbs_id INT NOT NULL,
      -- Bobot dipotret saat periode dibuka. Kalau WBS berubah kemudian, angka
      -- periode ini tetap bisa dijelaskan dengan bobot yang berlaku saat itu.
      weight_pct DECIMAL(9,6) NOT NULL DEFAULT 0,
      baseline_qty DECIMAL(18,4) NULL,
      unit VARCHAR(50) NULL,
      planned_pct DECIMAL(9,4) NOT NULL DEFAULT 0,
      -- Kumulatif, bukan tambahan periode ini. Kumulatif lebih sulit salah
      -- dibaca: "sudah 60%" tidak bisa ditafsirkan dua cara.
      claimed_pct DECIMAL(9,4) NOT NULL DEFAULT 0,
      claimed_qty DECIMAL(18,4) NULL,
      approved_pct DECIMAL(9,4) NULL,
      -- Kumulatif yang sudah disetujui SEBELUM periode ini — pembanding agar
      -- klaim tidak bisa mundur diam-diam.
      prev_approved_pct DECIMAL(9,4) NOT NULL DEFAULT 0,
      evidence_note VARCHAR(1000) NULL,
      evidence_ref VARCHAR(500) NULL,
      approver_note VARCHAR(1000) NULL,
      claimed_by INT NULL, claimed_at DATETIME NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_baris_periode (period_id, wbs_id),
      KEY idx_baris_periode (period_id),
      CONSTRAINT fk_baris_periode FOREIGN KEY (period_id)
        REFERENCES project_progress_periods(id) ON DELETE CASCADE,
      CONSTRAINT fk_baris_wbs FOREIGN KEY (wbs_id)
        REFERENCES project_wbs(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
};

/**
 * PROJ-CTRL Fase 1 lanjutan — biaya menempel ke work package.
 *
 * Tanpa ini, "actual cost" proyek adalah satu angka gelondongan yang tidak bisa
 * dibandingkan dengan apa pun: earned progress dihitung per work package, biaya
 * tidak. CPI yang dihitung dari keduanya akan terlihat presisi dan salah.
 *
 * Kolomnya **nullable, dan itu disengaja**. Produksi punya 134 AP dan 91 PO yang
 * bahkan belum punya `project_id`; memaksa pemetaan berarti menebak, dan tebakan
 * yang salah lebih buruk daripada mengaku belum tahu. Yang belum dipetakan
 * dilaporkan apa adanya sebagai "belum teralokasi" — bukan disembunyikan, bukan
 * pula dipaksa masuk ke work package mana pun.
 */
const ensureCostAllocationSchema = async (connection: any) => {
  for (const sql of [
    "ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS wbs_id INT NULL",
    "ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS cost_code_id INT NULL",
    "ALTER TABLE accounts_payable ADD COLUMN IF NOT EXISTS wbs_id INT NULL",
    "ALTER TABLE accounts_payable ADD COLUMN IF NOT EXISTS cost_code_id INT NULL",
  ]) await execSchemaEnsure(connection, sql);

  // Index saja, bukan foreign key: `purchase_orders` dan `accounts_payable`
  // hidup di modul lain dan sudah berisi data produksi. FK ke `project_wbs`
  // akan menautkan siklus hidup dua modul yang selama ini berdiri sendiri —
  // menghapus satu work package tidak boleh menyentuh dokumen keuangan.
  // Kesahihan tautannya dijaga di jalur tulis, dan tesnya membuktikannya.
  for (const sql of [
    "ALTER TABLE purchase_orders ADD INDEX idx_po_wbs (wbs_id)",
    "ALTER TABLE accounts_payable ADD INDEX idx_ap_wbs (wbs_id)",
  ]) await execSchemaEnsure(connection, sql);
};

/**
 * Template zona MTO — parameter yang dipakai ulang antar proposal.
 *
 * Pekerjaan EPC berulang: "Pondasi F1 tipikal", "Kolom K-300 lantai 1-3". Tanpa
 * template, tiap proposal mengisi belasan parameter dari nol, dan angka yang
 * seharusnya sama antar proyek jadi berbeda hanya karena siapa yang mengetik.
 *
 * Templatenya menyimpan PARAMETER, bukan kuantitas — kuantitasnya tetap
 * dihitung `calculateMto()` saat template dipakai. Menyimpan kuantitas berarti
 * angka lama ikut terbawa walau formulanya sudah diperbaiki, dan asal-usulnya
 * berhenti bisa ditelusuri.
 */
const ensureMtoTemplateSchema = async (connection: any) => {
  await execSchemaEnsure(connection, `
    CREATE TABLE IF NOT EXISTS mto_zone_templates (
      id INT AUTO_INCREMENT PRIMARY KEY,
      code VARCHAR(50) NOT NULL,
      name VARCHAR(255) NOT NULL,
      element_type VARCHAR(50) NOT NULL,
      -- Varian disimpan apa adanya seperti yang dikirim; kalkulator yang
      -- menerjemahkannya, jadi template lama tetap terbaca saat alias berubah.
      variant_raw VARCHAR(50) NULL,
      parameters JSON NOT NULL,
      description VARCHAR(500) NULL,
      category VARCHAR(100) NULL,
      -- Field wajib yang sengaja DIBIARKAN kosong di template (mis. jumlah
      -- titik, yang memang berbeda tiap proyek). Dicatat supaya layar bisa
      -- meminta pengisiannya saat template dipakai, bukan menolak diam-diam.
      pending_fields JSON NULL,
      is_active TINYINT(1) NOT NULL DEFAULT 1,
      times_used INT NOT NULL DEFAULT 0,
      created_by INT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_tpl_code (code),
      KEY idx_tpl_tipe (element_type, is_active)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
};

/**
 * Integration: konfigurasi yang benar-benar tersimpan, dan webhook yang
 * benar-benar terdaftar.
 *
 * Halaman `/admin/integration` sebelumnya control plane semu — status connector
 * dimulai dari array lokal `enabled: false` dan tidak pernah dihidrasi, PUT-nya
 * mengirim `{ value }` sementara backend menuntut `setting_value` sehingga
 * SELALU 400, errornya ditelan `.catch(() => {})`, dan badge-nya tetap berubah
 * seolah berhasil. Webhook hanya masuk array di memori browser.
 *
 * ⚠️ `system_settings` dibaca `GET /settings/all` yang hanya berpagar
 * `authMiddleware` — setiap pengguna desktop bisa membacanya. Karena itu ia
 * **bukan tempat menyimpan rahasia**, dan `is_secret` ada supaya nilai yang
 * terlanjur bersifat rahasia bisa disamarkan saat dibaca massal.
 */
const ensureIntegrationSchema = async (connection: any) => {
  await execSchemaEnsure(connection,
    "ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS is_secret TINYINT(1) NOT NULL DEFAULT 0");

  await execSchemaEnsure(connection, `
    CREATE TABLE IF NOT EXISTS webhook_endpoints (
      id INT AUTO_INCREMENT PRIMARY KEY,
      event VARCHAR(100) NOT NULL,
      url VARCHAR(1000) NOT NULL,
      is_active TINYINT(1) NOT NULL DEFAULT 1,
      -- Pengiriman belum ada, dan itu dinyatakan apa adanya di kolom ini
      -- alih-alih dibiarkan tampak aktif. Webhook yang terdaftar tapi tidak
      -- pernah terkirim lebih berbahaya daripada webhook yang belum didaftarkan:
      -- orang berhenti memeriksa karena mengira sudah jalan.
      delivery_status VARCHAR(30) NOT NULL DEFAULT 'belum_aktif',
      last_delivery_at DATETIME NULL,
      last_delivery_code INT NULL,
      created_by INT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_webhook (event, url(255)),
      KEY idx_webhook_event (event, is_active)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
};

/**
 * Lapisan komersial penawaran: overhead dan cadangan risiko.
 *
 * Kolom `overhead` dan `risk_contingency` sudah lama ada dan
 * `recalculateProposal()` sudah membacanya dengan benar — **tapi tidak ada satu
 * pun jalur untuk mengisinya**. Akibatnya seluruh penawaran produksi berakhir
 * `overhead = 0` dan `risk_contingency = 0`: total penawaran persis sama dengan
 * biaya langsung, dan satu-satunya margin adalah 10% yang tertanam di harga
 * AHSP (standar SNI). Proyek berisiko tinggi dan pekerjaan rutin dihargai sama.
 *
 * Yang ditambahkan di sini adalah CARA menentukannya, dan cara itu wajib
 * dinyatakan: nominal 150 juta bisa berarti "angka yang saya hitung sendiri"
 * atau "5% dari biaya langsung yang kebetulan segitu". Saat diaudit setahun
 * kemudian, keduanya harus bisa dibedakan — karena yang pertama tetap, yang
 * kedua ikut bergerak saat volumenya berubah.
 */
const ensureProposalKomersialSchema = async (connection: any) => {
  for (const t of ['proposals', 'proposal_revisions']) {
    for (const sql of [
      // 'persen' | 'nominal' — dinyatakan, bukan disimpulkan dari ada/tidaknya
      // nilai persen.
      `ALTER TABLE ${t} ADD COLUMN IF NOT EXISTS overhead_mode VARCHAR(10) NOT NULL DEFAULT 'nominal'`,
      `ALTER TABLE ${t} ADD COLUMN IF NOT EXISTS overhead_pct DECIMAL(7,4) NULL`,
      `ALTER TABLE ${t} ADD COLUMN IF NOT EXISTS contingency_mode VARCHAR(10) NOT NULL DEFAULT 'nominal'`,
      `ALTER TABLE ${t} ADD COLUMN IF NOT EXISTS contingency_pct DECIMAL(7,4) NULL`,
    ]) await execSchemaEnsure(connection, sql);
  }
};

/**
 * Basis biaya per baris RAB — supaya margin bisa dihitung tanpa menebak.
 *
 * `proposal_items` selama ini hanya memotret harga JUAL
 * (`unit_price_snapshot`). Untuk mengetahui marginnya, biaya langsungnya harus
 * dibaca dari `ahsp_headers` **hari ini** — dan itu masalah yang persis sama
 * dengan yang sudah diperbaiki di jadwal dan sumber daya: harga master
 * berkembang, sehingga margin penawaran yang sudah dikirim ikut bergerak.
 *
 * Kolom ini memotret `harga_langsung` per satuan saat baris dibuat.
 *
 * **Sengaja NULL untuk baris lama.** Mengisinya dengan harga master sekarang
 * berarti mengarang sejarah: angkanya akan terlihat presisi padahal tidak
 * pernah menjadi basis penawaran itu. Yang NULL dilaporkan apa adanya sebagai
 * "basis tidak tersedia", dan cakupannya dinyatakan.
 */
const ensureItemCostBasisSchema = async (connection: any) => {
  for (const sql of [
    "ALTER TABLE proposal_items ADD COLUMN IF NOT EXISTS direct_cost_snapshot DECIMAL(18,2) NULL",
    "ALTER TABLE proposal_items ADD COLUMN IF NOT EXISTS ovh_profit_snapshot DECIMAL(18,2) NULL",
  ]) await execSchemaEnsure(connection, sql);
};

/**
 * Opportunity register — menyambung CRM ke estimate, proposal, dan menang/kalah.
 *
 * `prospects` berhenti pada atribut CRM generik, dan `proposals` tidak punya
 * satu pun tautan ke prospect/opportunity. Akibatnya nilai pipeline tidak bisa
 * direkonsiliasi ke penawaran yang benar-benar dikirim, dan **win rate tidak
 * punya penyebut yang sah** — yang belum diputuskan ikut terhitung, sehingga
 * angkanya selalu terlihat bagus di awal.
 *
 * Yang dibangun di sini tulang punggungnya: register, riwayat tahapan, tautan
 * ke proposal, dan alasan kalah yang wajib. Tender register penuh
 * (prekualifikasi, bid bond, adendum, klarifikasi, daftar peserta) **belum** —
 * dan itu dinyatakan, bukan dikira sudah ada.
 */
const ensureOpportunitySchema = async (connection: any) => {
  await execSchemaEnsure(connection, `
    CREATE TABLE IF NOT EXISTS opportunities (
      id INT AUTO_INCREMENT PRIMARY KEY,
      code VARCHAR(50) NOT NULL,
      title VARCHAR(255) NOT NULL,
      client_id INT NULL,
      prospect_id INT NULL,
      -- Nama pemilik pekerjaan apa adanya kalau belum jadi client terdaftar.
      client_name VARCHAR(255) NULL,
      lokasi VARCHAR(255) NULL,
      scope VARCHAR(500) NULL,
      -- lead → qualified → bidding → submitted → won | lost | cancelled
      stage VARCHAR(20) NOT NULL DEFAULT 'lead',
      -- Perkiraan awal, dipakai selama belum ada penawaran. Begitu ada revisi
      -- terbit, nilai yang dipakai adalah nilai revisi itu — bukan angka ini.
      estimated_value DECIMAL(18,2) NULL,
      probability TINYINT NULL,
      expected_award_date DATE NULL,
      submission_deadline DATETIME NULL,
      source VARCHAR(100) NULL,
      competitor VARCHAR(255) NULL,
      owner_user_id INT NULL,
      -- Wajib saat stage menjadi 'lost'. Kekalahan tanpa alasan tidak
      -- mengajarkan apa pun, dan itulah satu-satunya nilai dari mencatatnya.
      lost_reason_code VARCHAR(50) NULL,
      lost_reason_note VARCHAR(500) NULL,
      won_at DATETIME NULL,
      lost_at DATETIME NULL,
      created_by INT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_opp_code (code),
      KEY idx_opp_stage (stage),
      KEY idx_opp_client (client_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  await execSchemaEnsure(connection, `
    CREATE TABLE IF NOT EXISTS opportunity_stage_history (
      id INT AUTO_INCREMENT PRIMARY KEY,
      opportunity_id INT NOT NULL,
      from_stage VARCHAR(20) NULL,
      to_stage VARCHAR(20) NOT NULL,
      note VARCHAR(500) NULL,
      changed_by INT NULL,
      changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      KEY idx_osh_opp (opportunity_id, changed_at),
      CONSTRAINT fk_osh_opp FOREIGN KEY (opportunity_id)
        REFERENCES opportunities(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  // Satu opportunity bisa punya beberapa proposal (penawaran ulang, paket
  // terpisah). Index saja, bukan FK: `proposals` sudah berisi data produksi dan
  // menghapus opportunity tidak boleh menyentuh penawaran yang sudah dikirim.
  for (const sql of [
    'ALTER TABLE proposals ADD COLUMN IF NOT EXISTS opportunity_id INT NULL',
    'ALTER TABLE proposals ADD INDEX idx_prop_opp (opportunity_id)',
  ]) await execSchemaEnsure(connection, sql);
};

/**
 * Material Request: penolakan yang menjelaskan, dan hasil yang sampai ke pemohon.
 *
 * `PUT /material-requests/:id/reject` sebelumnya hanya menyetel status menjadi
 * `rejected` — tanpa alasan, dan tanpa satu pun cara memberitahu pemohonnya.
 *
 * Di lapangan konsekuensinya langsung: tim tahu permintaannya ditolak tapi
 * tidak tahu kenapa, jadi mereka mengajukan ulang barang yang sama, atau
 * berhenti memakai fitur ini dan kembali menelepon. Keduanya membuat catatan
 * kebutuhan lapangan berhenti mencerminkan keadaan.
 */
const ensureMaterialRequestOutcomeSchema = async (connection: any) => {
  for (const sql of [
    "ALTER TABLE material_requests ADD COLUMN IF NOT EXISTS rejection_reason VARCHAR(500) NULL",
    "ALTER TABLE material_requests ADD COLUMN IF NOT EXISTS rejected_by INT NULL",
    "ALTER TABLE material_requests ADD COLUMN IF NOT EXISTS rejected_at DATETIME NULL",
    // Kapan pemohon benar-benar MELIHAT keputusannya. Dipakai menandai yang
    // belum terbaca di layar mobile — bukan untuk mengukur orangnya, tapi
    // supaya keputusan tidak menggantung tanpa ada yang tahu.
    "ALTER TABLE material_requests ADD COLUMN IF NOT EXISTS outcome_seen_at DATETIME NULL",
  ]) await execSchemaEnsure(connection, sql);
};

/**
 * Material Request dari sinyal yang putus-putus.
 *
 * Di lokasi proyek sinyal sering hilang. Saat pengiriman gagal, permintaannya
 * lenyap begitu saja — keranjang hanya di memori, jadi menutup aplikasi berarti
 * mengetik ulang semuanya. Orang lalu berhenti mencoba dan menelepon.
 *
 * Antrean lokal menyelesaikan itu, tapi memunculkan bahaya baru: kirim ulang
 * setelah RESPONS hilang (padahal servernya sudah menerima) menghasilkan MR
 * KEMBAR — dan MR kembar berarti barang dipesan dua kali.
 *
 * `client_request_id` dibuat di perangkat sebelum pengiriman pertama dan
 * dipakai ulang di setiap percobaan. Servernya memakainya untuk mengenali
 * permintaan yang sama, jadi berapa kali pun dikirim ulang hasilnya satu.
 */
const ensureMrIdempotencySchema = async (connection: any) => {
  for (const sql of [
    "ALTER TABLE material_requests ADD COLUMN IF NOT EXISTS client_request_id VARCHAR(64) NULL",
    // UNIQUE per KARYAWAN, bukan global: id dibuat perangkat, dan dua perangkat
    // berbeda tidak boleh bisa saling menghalangi hanya karena kebetulan
    // menghasilkan id yang sama.
    "ALTER TABLE material_requests ADD UNIQUE KEY uq_mr_client_req (employee_id, client_request_id)",
  ]) await execSchemaEnsure(connection, sql);
};

/**
 * Perencanaan CAPEX & OPEX tahunan — hulu dari seluruh alur.
 *
 * Sistem ini semula mengalir dari penawaran ke luar: opportunity → proposal →
 * menang → kontrak → project. Itu bentuk kontraktor yang menjual ke client.
 *
 * Untuk departemen engineering di dalam pabrik, titik awalnya berbeda: bukan
 * tender, melainkan **anggaran tahunan yang disetujui**. Yang menentukan boleh
 * tidaknya sebuah pekerjaan berjalan bukan menang tender, tapi apakah masih ada
 * pagu.
 *
 * Dua keputusan pemilik yang membentuk skema ini:
 *
 * 1. **Satu pagu dipegang Engineering** (bukan per departemen pengusul).
 *    Departemen lain mengusulkan; yang membebani pagu adalah PEKERJAANNYA.
 *    Karena itu `requesting_department` hanya atribut, bukan sumbu pagu.
 *
 * 2. **Pekerjaan di luar rencana boleh jalan** asal disetujui dan tercatat.
 *    Itu tidak dibuat sebagai konsep terpisah: ia tetap baris anggaran, hanya
 *    ditandai `is_unplanned`. Dengan begitu tetap ada SATU tempat yang menjawab
 *    "apa yang boleh dibelanjakan", dan laporan tinggal memisahkannya. Konsep
 *    kedua akan berarti dua sumber kebenaran untuk pertanyaan yang sama.
 */
const ensureBudgetSchema = async (connection: any) => {
  await execSchemaEnsure(connection, `
    CREATE TABLE IF NOT EXISTS budget_years (
      id INT AUTO_INCREMENT PRIMARY KEY,
      year SMALLINT NOT NULL,
      -- planning → approved → active → closed
      status VARCHAR(20) NOT NULL DEFAULT 'planning',
      -- Pagu total yang disetujui manajemen. Baris anggaran di bawahnya harus
      -- muat di dalamnya, dan selisihnya dilaporkan — bukan diam-diam lewat.
      capex_ceiling DECIMAL(18,2) NULL,
      opex_ceiling DECIMAL(18,2) NULL,
      approved_by INT NULL,
      approved_at DATETIME NULL,
      closed_at DATETIME NULL,
      note VARCHAR(500) NULL,
      created_by INT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_budget_year (year)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  await execSchemaEnsure(connection, `
    CREATE TABLE IF NOT EXISTS budget_lines (
      id INT AUTO_INCREMENT PRIMARY KEY,
      budget_year_id INT NOT NULL,
      code VARCHAR(50) NOT NULL,
      -- capex | opex. Dipisah karena persetujuan, pelaporan, dan perlakuan
      -- akuntansinya memang berbeda.
      type VARCHAR(10) NOT NULL,
      title VARCHAR(255) NOT NULL,
      description VARCHAR(1000) NULL,
      -- Departemen PENGUSUL — atribut, bukan pemilik pagu.
      requesting_department VARCHAR(100) NULL,
      category VARCHAR(100) NULL,
      justification VARCHAR(1000) NULL,
      priority VARCHAR(20) NOT NULL DEFAULT 'normal',
      planned_amount DECIMAL(18,2) NOT NULL DEFAULT 0,
      -- usulan → disetujui | ditolak | dibatalkan
      status VARCHAR(20) NOT NULL DEFAULT 'usulan',
      -- Pekerjaan yang tidak ada di rencana tahunan. Boleh jalan, tapi harus
      -- disetujui dan alasannya tercatat — dan laporan memisahkannya, karena
      -- porsi unplanned yang membesar adalah gejala perencanaan yang meleset.
      is_unplanned TINYINT(1) NOT NULL DEFAULT 0,
      unplanned_reason VARCHAR(500) NULL,
      approved_by INT NULL,
      approved_at DATETIME NULL,
      rejected_reason VARCHAR(500) NULL,
      created_by INT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_budget_line_code (budget_year_id, code),
      KEY idx_bl_year (budget_year_id, type, status),
      CONSTRAINT fk_bl_year FOREIGN KEY (budget_year_id)
        REFERENCES budget_years(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  // Proposal membebani satu baris anggaran. Index saja, bukan FK: proposal
  // sudah berisi data produksi dan menghapus baris anggaran tidak boleh
  // menyentuh penawaran yang sudah dikirim.
  for (const sql of [
    'ALTER TABLE proposals ADD COLUMN IF NOT EXISTS budget_line_id INT NULL',
    'ALTER TABLE proposals ADD INDEX idx_prop_budget (budget_line_id)',
  ]) await execSchemaEnsure(connection, sql);
};

/**
 * Kapitalisasi CAPEX — serah-terima dari anggaran/project ke Asset Management.
 *
 * Tiga keputusan pemilik (31 Agustus 2026) yang dikunci di skema ini:
 *
 *   1. **Basis biaya = realisasi aktual**, bukan nilai kontrak. Aset lahir
 *      dengan biaya yang benar-benar dikeluarkan (AP + biaya project), bukan
 *      dengan angka yang dijanjikan kontrak.
 *   2. **Satu baris CAPEX boleh melahirkan banyak aset.** Karena itu alokasi
 *      biayanya eksplisit per aset, dan jumlahnya wajib pas dengan nilai yang
 *      dikapitalisasi — bukan dibagi rata diam-diam.
 *   3. **Pemicunya manual.** Tidak ada satu pun jalur otomatis yang melahirkan
 *      aset dari project yang selesai; project yang ditutup karena batal tidak
 *      boleh menjadi aset.
 *
 * Realisasi terus bergerak setelah aset didaftarkan (tagihan susulan). Karena
 * itu tiap kapitalisasi **membekukan** angkanya sebagai snapshot, dan biaya
 * yang datang belakangan dilaporkan sebagai sisa yang belum dikapitalisasi —
 * bukan diam-diam mengubah harga perolehan aset yang sudah berjalan
 * penyusutannya.
 *
 * `budget_line_id` sengaja INDEX, bukan FK: merapikan anggaran tidak boleh
 * melenyapkan catatan aset. Kode dan judul barisnya ikut disalin supaya
 * catatannya tetap bisa dibaca sendiri kalau barisnya sudah tidak ada.
 */
const ensureAssetCapitalizationSchema = async (connection: any) => {
  const statements = [
    `CREATE TABLE IF NOT EXISTS asset_capitalizations (
      id INT PRIMARY KEY AUTO_INCREMENT,
      budget_line_id INT NOT NULL,
      budget_line_code VARCHAR(50),
      budget_line_title VARCHAR(255),
      budget_year SMALLINT,
      seq INT NOT NULL DEFAULT 1,
      basis_amount DECIMAL(18,2) NOT NULL DEFAULT 0,
      basis_ap DECIMAL(18,2) NOT NULL DEFAULT 0,
      basis_expenses DECIMAL(18,2) NOT NULL DEFAULT 0,
      basis_kumulatif DECIMAL(18,2) NOT NULL DEFAULT 0,
      status VARCHAR(20) NOT NULL DEFAULT 'posted',
      note TEXT,
      reversed_at DATETIME NULL,
      reversed_by INT NULL,
      reversal_reason TEXT,
      capitalized_by INT,
      capitalized_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_cap_line_seq (budget_line_id, seq),
      INDEX idx_cap_line (budget_line_id),
      INDEX idx_cap_status (status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

    `CREATE TABLE IF NOT EXISTS asset_capitalization_lines (
      id INT PRIMARY KEY AUTO_INCREMENT,
      capitalization_id INT NOT NULL,
      asset_id INT NOT NULL,
      asset_code VARCHAR(100),
      asset_name VARCHAR(255),
      is_new_asset TINYINT(1) NOT NULL DEFAULT 0,
      allocated_cost DECIMAL(18,2) NOT NULL DEFAULT 0,
      allocation_note VARCHAR(500),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_capline_cap (capitalization_id),
      INDEX idx_capline_asset (asset_id),
      FOREIGN KEY (capitalization_id) REFERENCES asset_capitalizations(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

    // Asal-usul aset. Aset yang lahir dari CAPEX harus bisa ditelusuri balik ke
    // baris anggaran yang membiayainya — tanpa ini, "aset ini dari proyek mana"
    // hanya bisa dijawab dari ingatan orang.
    `ALTER TABLE assets ADD COLUMN IF NOT EXISTS source_budget_line_id INT NULL`,
    `ALTER TABLE assets ADD INDEX idx_assets_budget_line (source_budget_line_id)`,
  ];
  for (const sql of statements) await execSchemaEnsure(connection, sql);
};

const ensureRouteModuleSchema = async (connection: any) => {
  const statements = [
    // FIN-02: dipindahkan dari `finance.routes.ts`, yang membuatnya lewat IIFE
    // saat modul di-import. Itu berjalan SEBELUM initializeDatabase(), persis
    // yang dilarang di CLAUDE.md — empat kasus sejenis sudah dipindah ke sini
    // sebelumnya, yang ini terlewat.
    //
    // Definisinya sengaja SAMA PERSIS dengan `schema-baseline.sql` baris 1721,
    // yang memang sudah membuat tabel ini lebih dulu. Jadi statement di bawah
    // praktis selalu no-op, dan tempatnya di sini adalah jaring pengaman untuk
    // instalasi yang baselinenya tidak lengkap — bukan sumber kebenarannya.
    // Sempat saya tambahkan indeks (schedule_id, source) di sini: itu TIDAK
    // pernah berlaku, karena CREATE TABLE IF NOT EXISTS tidak menyentuh tabel
    // yang sudah ada. Dibuang lagi supaya kode ini tidak menjanjikan sesuatu
    // yang tidak pernah terjadi.
    `CREATE TABLE IF NOT EXISTS payment_proofs (
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
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`,
    `CREATE TABLE IF NOT EXISTS inbox_notifications (
      id INT PRIMARY KEY AUTO_INCREMENT,
      user_id INT NOT NULL,
      type VARCHAR(50) NOT NULL DEFAULT 'system',
      title VARCHAR(255) NOT NULL,
      message TEXT,
      link VARCHAR(255),
      ref_id INT,
      ref_type VARCHAR(50),
      is_read TINYINT(1) DEFAULT 0,
      created_by INT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_user_read (user_id, is_read),
      INDEX idx_created (created_at),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

    `CREATE TABLE IF NOT EXISTS crm_notes (
      id INT PRIMARY KEY AUTO_INCREMENT,
      title VARCHAR(255),
      content TEXT NOT NULL,
      color VARCHAR(20) DEFAULT 'yellow',
      is_pinned TINYINT DEFAULT 0,
      category VARCHAR(50) DEFAULT 'general',
      linked_type VARCHAR(50),
      linked_id INT,
      linked_name VARCHAR(255),
      created_by INT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_category (category),
      INDEX idx_pinned (is_pinned),
      INDEX idx_linked (linked_type, linked_id),
      INDEX idx_created_by (created_by)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

    `CREATE TABLE IF NOT EXISTS prospects (
      id INT PRIMARY KEY AUTO_INCREMENT,
      code VARCHAR(50) NOT NULL UNIQUE,
      company_name VARCHAR(255) NOT NULL,
      contact_name VARCHAR(255),
      contact_title VARCHAR(100),
      email VARCHAR(255),
      phone VARCHAR(50),
      industry VARCHAR(150),
      website VARCHAR(255),
      address TEXT,
      city VARCHAR(100),
      country VARCHAR(100) DEFAULT 'Indonesia',
      source VARCHAR(50) DEFAULT 'other',
      temperature VARCHAR(20) DEFAULT 'cold',
      status VARCHAR(50) DEFAULT 'new',
      interest TEXT,
      estimated_value DECIMAL(15,2) DEFAULT 0,
      next_follow_up DATE,
      last_contacted_at TIMESTAMP NULL,
      assigned_to INT,
      notes TEXT,
      converted_to_client_id INT,
      converted_to_lead_id INT,
      converted_at TIMESTAMP NULL,
      created_by INT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_temperature (temperature),
      INDEX idx_status (status),
      INDEX idx_source (source),
      INDEX idx_next_follow_up (next_follow_up),
      INDEX idx_assigned_to (assigned_to)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

    `CREATE TABLE IF NOT EXISTS engineering_inputs (
      id INT PRIMARY KEY AUTO_INCREMENT,
      project_id INT DEFAULT NULL,
      proposal_id INT DEFAULT NULL,
      element_type VARCHAR(50) NOT NULL,
      element_name VARCHAR(100) NOT NULL,
      parameters JSON,
      quantities JSON,
      sort_order INT DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_mto_element (proposal_id, project_id, element_type, element_name)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

    // Tabel engineering_inputs versi lama belum punya kolom/indeks ini
    `ALTER TABLE engineering_inputs ADD COLUMN IF NOT EXISTS proposal_id INT DEFAULT NULL AFTER project_id`,
  ];

  for (const statement of statements) {
    await execSchemaEnsure(connection, statement);
  }

  // Indeks unik tidak punya sintaks IF NOT EXISTS — cek dulu ke INFORMATION_SCHEMA
  try {
    const [rows]: any = await connection.execute(
      `SELECT COUNT(*) AS c FROM INFORMATION_SCHEMA.STATISTICS
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'engineering_inputs' AND INDEX_NAME = 'uq_mto_element'`,
      [activeDatabaseName]
    );
    if (!(Array.isArray(rows) && rows[0] && Number(rows[0].c) > 0)) {
      await connection.execute(
        'ALTER TABLE engineering_inputs ADD UNIQUE INDEX uq_mto_element (proposal_id, project_id, element_type, element_name)'
      );
    }
  } catch (err: any) {
    console.warn('uq_mto_element ensure warning:', err.message.substring(0, 120));
  }

  console.log('✅ Inbox / CRM notes / prospects / MTO schema ensured');
};

// ==================== ATURAN DEPRESIASI ASET (AST-003, AST-010) ====================
// Sebelumnya setiap aset yang punya harga + tanggal beli diproses fungsi
// depresiasi yang sama, termasuk kategori Tanah — padahal tanah tidak disusutkan.
// Master kategori juga belum punya aturan apa pun selain requires_production_line.
const ensureAssetDepreciationSchema = async (connection: any) => {
  const statements = [
    `ALTER TABLE asset_categories ADD COLUMN IF NOT EXISTS is_depreciable TINYINT(1) NOT NULL DEFAULT 1`,
    `ALTER TABLE asset_categories ADD COLUMN IF NOT EXISTS default_useful_life_years INT NULL`,
    `ALTER TABLE asset_categories ADD COLUMN IF NOT EXISTS default_depreciation_method VARCHAR(30) NULL`,
    `ALTER TABLE asset_categories ADD COLUMN IF NOT EXISTS default_depreciation_rate DECIMAL(6,4) NULL`,

    // Depresiasi mulai saat aset SIAP DIGUNAKAN, bukan saat dibeli. Kalau
    // kosong, jatuh kembali ke purchase_date supaya data lama tetap terhitung.
    `ALTER TABLE assets ADD COLUMN IF NOT EXISTS in_service_date DATE NULL`,
    // Rate khusus untuk saldo menurun; kosong = pakai default kategori, lalu
    // fallback ke double-declining (2 / umur ekonomis).
    `ALTER TABLE assets ADD COLUMN IF NOT EXISTS depreciation_rate DECIMAL(6,4) NULL`,

    // AST-004 — klasifikasi riwayat pembelian. Default 'expense' DISENGAJA:
    // baris yang sudah ada di produksi selama ini tidak pernah menambah nilai
    // aset, jadi menandainya expense membuat seluruh angka tetap persis sama
    // setelah deploy. Hanya entri yang sengaja ditandai capital_addition yang
    // menambah basis depresiasi.
    `ALTER TABLE asset_purchase_history ADD COLUMN IF NOT EXISTS entry_type VARCHAR(30) NOT NULL DEFAULT 'expense'`,
    `ALTER TABLE asset_purchase_history ADD COLUMN IF NOT EXISTS capitalized_at DATE NULL`,

    // Tanah tidak disusutkan. Bangunan lazim 20 tahun garis lurus.
    `UPDATE asset_categories SET is_depreciable = 0 WHERE code = 'LAND'`,
    `UPDATE asset_categories SET default_useful_life_years = 20, default_depreciation_method = 'straight_line'
      WHERE code = 'BLDG' AND default_useful_life_years IS NULL`,
  ];

  for (const statement of statements) {
    await execSchemaEnsure(connection, statement);
  }

  // Laporkan dampaknya ke laporan yang sudah berjalan. Menandai LAND sebagai
  // non-depreciable membuat aset tanah yang selama ini muncul dengan angka
  // penyusutan berubah menjadi nol — benar secara akuntansi, tapi operator
  // perlu tahu sebelum ada yang menanyakan kenapa laporannya berubah.
  try {
    const [rows]: any = await connection.execute(
      `SELECT COUNT(*) AS c FROM assets a JOIN asset_categories c ON a.category_id = c.id
       WHERE c.is_depreciable = 0 AND a.purchase_price > 0 AND a.purchase_date IS NOT NULL`
    );
    const affected = Array.isArray(rows) && rows[0] ? Number(rows[0].c) : 0;
    if (affected > 0) {
      console.log(`⚠️  ${affected} aset berkategori non-depreciable (mis. Tanah) kini bernilai penyusutan 0.`);
      console.log('   Ini koreksi akuntansi. Untuk mengembalikan sementara:');
      console.log("   UPDATE asset_categories SET is_depreciable = 1 WHERE code = 'LAND';");
    }
  } catch { /* tabel assets belum ada di database baru — abaikan */ }

  console.log('✅ Aturan depresiasi kategori aset ensured');
};

// ==================== LEDGER DEPRESIASI & PERIOD LOCK (AST-011) ====================
// Depresiasi selama ini dihitung dinamis dari master saat halaman dibuka, jadi
// mengubah harga perolehan hari ini ikut mengubah nilai seluruh periode
// sebelumnya secara retroaktif. Dua tabel ini menyimpan hasil perhitungan
// per bulan dan mengunci periodenya.
//
// PENTING untuk sistem yang sedang dipakai: selama belum ada periode yang
// ditutup, kedua tabel ini kosong dan perhitungan berjalan persis seperti
// sebelumnya. Tidak ada angka yang berubah setelah deploy.
const ensureDepreciationLedgerSchema = async (connection: any) => {
  const statements = [
    `CREATE TABLE IF NOT EXISTS asset_depreciation_periods (
      id INT PRIMARY KEY AUTO_INCREMENT,
      period_year INT NOT NULL,
      period_month TINYINT NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'closed',
      closed_at TIMESTAMP NULL,
      closed_by INT NULL,
      reopened_at TIMESTAMP NULL,
      reopened_by INT NULL,
      notes TEXT NULL,
      UNIQUE KEY uq_depreciation_period (period_year, period_month),
      FOREIGN KEY (closed_by) REFERENCES users(id) ON DELETE SET NULL,
      FOREIGN KEY (reopened_by) REFERENCES users(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

    `CREATE TABLE IF NOT EXISTS asset_depreciation_ledger (
      id INT PRIMARY KEY AUTO_INCREMENT,
      asset_id INT NOT NULL,
      period_year INT NOT NULL,
      period_month TINYINT NOT NULL,
      depreciation_amount DECIMAL(18,2) NOT NULL DEFAULT 0,
      accumulated_after DECIMAL(18,2) NOT NULL DEFAULT 0,
      book_value_after DECIMAL(18,2) NOT NULL DEFAULT 0,
      posted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      posted_by INT NULL,
      UNIQUE KEY uq_depreciation_ledger (asset_id, period_year, period_month),
      FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE CASCADE,
      FOREIGN KEY (posted_by) REFERENCES users(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

    `INSERT IGNORE INTO permissions (resource, action, module, name, description)
     VALUES ('assets.period', 'manage', 'assets', 'manage assets.period', 'Tutup & buka kembali periode depresiasi')`,
  ];

  for (const statement of statements) {
    await execSchemaEnsure(connection, statement);
  }
  console.log('✅ Ledger depresiasi & period lock ensured');
};

// ==================== SOFT DELETE ASET & MASTER (AST-005, AST-013) ====================
// `DELETE FROM assets` menghapus permanen, dan lima tabel anak ikut terhapus
// lewat ON DELETE CASCADE: dokumen, maintenance, riwayat pembelian, ledger
// depresiasi, dan riwayat disposal. Seluruh jejak finansial aset hilang dalam
// satu klik, tanpa bisa dipulihkan.
//
// Aman untuk sistem berjalan: kolom baru default 0 (tidak terhapus), jadi
// seluruh aset yang ada sekarang tetap tampil seperti biasa.
const ensureSoftDeleteSchema = async (connection: any) => {
  const statements = [
    `ALTER TABLE assets ADD COLUMN IF NOT EXISTS is_deleted TINYINT(1) NOT NULL DEFAULT 0`,
    `ALTER TABLE assets ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP NULL`,
    `ALTER TABLE assets ADD COLUMN IF NOT EXISTS deleted_by INT NULL`,
    `ALTER TABLE assets ADD COLUMN IF NOT EXISTS deletion_reason TEXT NULL`,
    `CREATE INDEX idx_assets_is_deleted ON assets (is_deleted)`,
  ];

  for (const statement of statements) {
    await execSchemaEnsure(connection, statement);
  }
  console.log('✅ Soft delete aset ensured');
};

// ==================== RIWAYAT PERUBAHAN STATUS ASET (AST-012) ====================
// Status aset sebelumnya berpindah tanpa jejak: tidak ada catatan siapa yang
// mengubah, kapan, dan dari status apa.
const ensureAssetStatusHistorySchema = async (connection: any) => {
  const statements = [
    `CREATE TABLE IF NOT EXISTS asset_status_history (
      id INT PRIMARY KEY AUTO_INCREMENT,
      asset_id INT NOT NULL,
      from_status VARCHAR(30) NULL,
      to_status VARCHAR(30) NOT NULL,
      note TEXT NULL,
      changed_by INT NULL,
      changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE CASCADE,
      FOREIGN KEY (changed_by) REFERENCES users(id) ON DELETE SET NULL,
      INDEX idx_asset_status_history (asset_id, changed_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  ];

  for (const statement of statements) {
    await execSchemaEnsure(connection, statement);
  }
  console.log('✅ Riwayat status aset ensured');
};

// ==================== SOFT DELETE PURCHASE ORDER ====================
// `DELETE /purchase-orders/:id` menghapus permanen dan ikut menyapu tabel lain
// secara manual: payment schedule, accounts_payable, grn_items, goods_receipts,
// dan purchase_order_items. Setiap langkahnya dibungkus helper yang MENELAN
// error, jadi kegagalan sebagian tidak terlihat sama sekali.
//
// Yang paling berbahaya: menghapus goods_receipts membuat baris stock_movements
// menggantung — stok sudah terlanjur masuk ke gudang, tapi dokumen sumbernya
// hilang dan penerimaannya tidak bisa ditelusuri lagi.
//
// Aman untuk sistem berjalan: kolom baru default 0, seluruh PO yang ada tetap
// tampil seperti biasa.
const ensurePurchaseOrderSoftDelete = async (connection: any) => {
  const statements = [
    `ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS is_deleted TINYINT(1) NOT NULL DEFAULT 0`,
    `ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP NULL`,
    `ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS deleted_by INT NULL`,
    `ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS deletion_reason TEXT NULL`,
    `CREATE INDEX idx_po_is_deleted ON purchase_orders (is_deleted)`,
  ];

  for (const statement of statements) {
    await execSchemaEnsure(connection, statement);
  }
  console.log('✅ Soft delete purchase order ensured');
};

// ==================== GRN REVERSAL (PROC-R01/R02) ====================
// GRN yang sudah disetujui penuh sudah menambah stok. Dulu satu-satunya cara
// membatalkannya adalah DELETE — yang mencoba mengurangi stok lewat tabel
// `inventory` (tidak pernah ada di schema), errornya ditelan, lalu GRN,
// grn_items, dan stock_movements tetap dihapus. Hasilnya stok naik tanpa
// dokumen sumber sama sekali.
//
// Kolom di bawah membuat pembatalan menjadi reversal yang tercatat: dokumen
// aslinya tetap ada, movement pembalik dicatat terpisah, dan alasannya wajib.
//
// Aman untuk sistem berjalan: kolom baru, default 0 — seluruh GRN lama tetap
// terbaca sebagai "belum direversal" dan tidak ada data yang diubah.
const ensureGrnReversalSchema = async (connection: any) => {
  const statements = [
    `ALTER TABLE goods_receipts ADD COLUMN IF NOT EXISTS is_reversed TINYINT(1) NOT NULL DEFAULT 0`,
    `ALTER TABLE goods_receipts ADD COLUMN IF NOT EXISTS reversed_at TIMESTAMP NULL`,
    `ALTER TABLE goods_receipts ADD COLUMN IF NOT EXISTS reversed_by INT NULL`,
    `ALTER TABLE goods_receipts ADD COLUMN IF NOT EXISTS reversal_reason TEXT NULL`,
    `CREATE INDEX idx_grn_is_reversed ON goods_receipts (is_reversed)`,
  ];

  for (const statement of statements) {
    await execSchemaEnsure(connection, statement);
  }
  console.log('✅ Reversal GRN ensured');
};




// ==================== BARIS MTO TERSIMPAN (EST-MTO-019) ====================
// Sampai sekarang baris MTO hanya dihitung saat dibaca dan tidak pernah
// disimpan. Konsekuensinya dua:
//
// 1. Tidak ada lapisan logis yang bisa dirujuk RAB. Tautan menyimpan `line_code`
//    sebagai teks di dalam JSON, tanpa baris nyata yang menjadi sasarannya.
// 2. Tidak ada jejak. Kalau formula diperbaiki, angka yang dulu dipakai untuk
//    menawar ikut berubah surut, dan tidak ada cara membuktikan berapa yang
//    sebenarnya dikirim ke pelanggan.
//
// Tabel ini adalah PROYEKSI, bukan sumber kebenaran kedua: isinya ditulis ulang
// seluruhnya di dalam transaction yang sama dengan penyimpanan elemennya.
// `formula_version` merekam versi kalkulator yang menghasilkannya, sehingga
// pergeseran formula bisa dideteksi alih-alih diam-diam mengubah sejarah.
const ensureMtoLinesSchema = async (connection: any) => {
  const statements = [
    `CREATE TABLE IF NOT EXISTS mto_lines (
      id INT PRIMARY KEY AUTO_INCREMENT,
      element_id INT NOT NULL,
      line_code VARCHAR(40) NOT NULL,
      label VARCHAR(200) NULL,
      category VARCHAR(40) NULL,
      net_quantity DECIMAL(18,4) NOT NULL DEFAULT 0,
      waste_percent DECIMAL(8,3) NOT NULL DEFAULT 0,
      gross_quantity DECIMAL(18,4) NOT NULL DEFAULT 0,
      unit VARCHAR(20) NOT NULL,
      formula_version VARCHAR(20) NULL,
      material_id INT NULL,
      ahsp_id INT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_mto_line (element_id, line_code),
      KEY idx_mto_line_element (element_id),
      CONSTRAINT fk_mto_line_element FOREIGN KEY (element_id)
        REFERENCES engineering_inputs (id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    `ALTER TABLE engineering_inputs ADD COLUMN IF NOT EXISTS formula_version VARCHAR(20) NULL`,
    `ALTER TABLE engineering_inputs ADD COLUMN IF NOT EXISTS zone_name VARCHAR(100) NULL`,
  ];

  for (const statement of statements) {
    await execSchemaEnsure(connection, statement);
  }
  console.log('✅ Baris MTO tersimpan ensured');
};

// ==================== SATU PROPOSAL = SATU PROJECT (EST-MTO-R32) ====================
// Transisi proposal ke `deal` memicu rangkaian efek samping: buat project,
// tautkan project_id, salin baseline MTO, buat PR. Pemeriksaan status dan
// pembuatan project berada di luar satu transaction, jadi dua permintaan deal
// yang datang bersamaan bisa sama-sama lolos lalu masing-masing membuat project
// — satu proposal berakhir dengan dua project dan dua baseline.
//
// Index unik ini adalah penjaga terakhirnya: seberapa pun rapatnya balapan,
// database menolak project kedua untuk proposal yang sama. Lebih dapat
// diandalkan daripada pemeriksaan di kode, karena tidak bergantung pada urutan.
//
// Aman dipasang: produksi diperiksa lebih dulu, nol proposal punya lebih dari
// satu project.
const ensureOneProjectPerProposal = async (connection: any) => {
  const statements = [
    `CREATE UNIQUE INDEX uq_project_proposal ON client_projects (proposal_id)`,
  ];
  for (const statement of statements) {
    await execSchemaEnsure(connection, statement);
  }
  console.log('✅ Satu proposal satu project ensured');
};

// ==================== SCOPE MTO (EST-MTO-018) ====================
// `engineering_inputs` memakai UNIQUE (proposal_id, project_id, element_type,
// element_name). Dua kolom pertamanya nullable, dan MySQL tidak pernah
// menganggap baris ber-NULL sebagai duplikat — jadi index itu TIDAK PERNAH
// menyala. Akibatnya `ON DUPLICATE KEY UPDATE` di endpoint MTO selalu menyisipkan
// baris baru: menyimpan elemen yang sama dua kali menghasilkan dua elemen, dan
// rekap penawaran menghitungnya dua kali.
//
// Diganti kunci eksplisit `(scope_type, scope_id, ...)` yang tidak pernah NULL.
// Kolom `proposal_id`/`project_id` tetap diisi supaya kode lama yang membacanya
// tidak perlu diubah serentak.
const ensureMtoScopeSchema = async (connection: any) => {
  const statements = [
    `ALTER TABLE engineering_inputs ADD COLUMN IF NOT EXISTS scope_type VARCHAR(20) NULL`,
    `ALTER TABLE engineering_inputs ADD COLUMN IF NOT EXISTS scope_id INT NULL`,
    `UPDATE engineering_inputs
       SET scope_type = CASE WHEN proposal_id IS NOT NULL THEN 'proposal' ELSE 'project' END,
           scope_id   = COALESCE(proposal_id, project_id)
     WHERE scope_type IS NULL OR scope_id IS NULL`,
    `CREATE INDEX idx_mto_scope ON engineering_inputs (scope_type, scope_id)`,
    `ALTER TABLE engineering_inputs DROP INDEX uq_mto_element`,
    `CREATE UNIQUE INDEX uq_mto_scope ON engineering_inputs (scope_type, scope_id, element_type, element_name)`,
  ];

  for (const statement of statements) {
    await execSchemaEnsure(connection, statement);
  }
  console.log('✅ Scope MTO ensured');
};

// ==================== COUNTER NOMOR DOKUMEN (PROC-R05) ====================
// Nomor dokumen dulu ditentukan lewat MAX(...) + 1 lalu mengandalkan retry saat
// UNIQUE bentrok. Pola itu tidak tahan permintaan serentak: 20 request membaca
// MAX() yang sama, tiap putaran retry hanya satu yang menang, sisanya habis
// percobaan dan gagal — terbukti hanya 2 dari 20 PO yang berhasil.
//
// Tabel ini menyediakan penomoran atomic per (prefix, tanggal) memakai
// LAST_INSERT_ID(), sehingga tiap pemanggil mendapat nomor sendiri dalam satu
// statement tanpa saling menunggu.
const ensureDocumentCounterSchema = async (connection: any) => {
  const statements = [
    `CREATE TABLE IF NOT EXISTS document_counters (
      prefix VARCHAR(20) NOT NULL,
      date_part CHAR(8) NOT NULL,
      last_no INT NOT NULL DEFAULT 0,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (prefix, date_part)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  ];

  for (const statement of statements) {
    await execSchemaEnsure(connection, statement);
  }
  console.log('✅ Counter nomor dokumen ensured');
};

// ==================== NOMOR PROJECT UNIK (EST-MTO-R39) ====================
// `client_projects.project_number` dulu dibentuk dari COUNT(*)+1 tanpa UNIQUE
// apa pun. Dua proposal yang di-deal berbarengan membaca hitungan yang sama dan
// keduanya BERHASIL — bukan salah satu gagal, tapi dua project bernomor identik.
// Penomorannya sudah dipindah ke `document_counters` (lihat `nextProjectNumber`
// di estimator.routes.ts); index ini jaring terakhir di level database.
//
// NULL boleh berulang di UNIQUE MySQL, jadi baris lama yang nomornya kosong
// tidak terganggu.
const ensureProjectNumberUnique = async (connection: any) => {
  try {
    const [dupes]: any = await connection.execute(
      `SELECT project_number, COUNT(*) AS n FROM client_projects
       WHERE project_number IS NOT NULL
       GROUP BY project_number HAVING n > 1`
    );

    if (dupes.length > 0) {
      // Sengaja TIDAK menomori ulang. Nomor project sudah dipakai di kontrak,
      // PR, dan dokumen di luar sistem — menimpanya diam-diam jauh lebih
      // merusak daripada membiarkan index tidak terpasang. Tapi harus kelihatan.
      console.error(
        `⚠️  UNIQUE(project_number) TIDAK dipasang — ada ${dupes.length} nomor kembar: `
        + dupes.map((d: any) => `${d.project_number}×${d.n}`).join(', ')
        + '. Perbaiki manual lalu restart backend.'
      );
      return;
    }

    // MySQL 8 tidak punya CREATE UNIQUE INDEX IF NOT EXISTS.
    const [idx]: any = await connection.execute(
      `SELECT 1 FROM INFORMATION_SCHEMA.STATISTICS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'client_projects'
         AND INDEX_NAME = 'uq_client_projects_number' LIMIT 1`
    );
    if (idx.length === 0) {
      await connection.execute(
        'CREATE UNIQUE INDEX uq_client_projects_number ON client_projects (project_number)'
      );
    }
    console.log('✅ Nomor project unik ensured');
  } catch (err: any) {
    console.warn('Schema ensure warning (project_number unique):', String(err.message).substring(0, 160));
  }
};

// ==================== KREDENSIAL TERIKAT LOKASI KANTOR (DR-P0-06) ====================
// Kredensial hanya MENYALIN nama/koordinat/radius kantor saat didaftarkan. Kalau
// admin memindahkan lokasi atau menonaktifkannya, kredensial lama tetap memakai
// koordinat lama — perubahan tidak terpropagasi, dan tidak ada integritas
// referensial antara karyawan dan site tempat ia boleh absen.
//
// Kolom FK ditambahkan dan di-backfill dari koordinat yang sudah tersimpan.
const ensureCredentialOfficeLink = async (connection: any) => {
  await execSchemaEnsure(connection,
    'ALTER TABLE employee_webauthn_credentials ADD COLUMN IF NOT EXISTS office_location_id INT NULL');

  try {
    // Backfill: cocokkan koordinat tersimpan ke kantor terdaftar. Dibatasi ~11 m
    // (0,0001 derajat) supaya tidak salah tempel ke kantor lain.
    const [hasil]: any = await connection.execute(
      `UPDATE employee_webauthn_credentials c
       JOIN office_locations o
         ON ABS(c.registered_lat - o.latitude) < 0.0001
        AND ABS(c.registered_lng - o.longitude) < 0.0001
       SET c.office_location_id = o.id
       WHERE c.office_location_id IS NULL`
    );
    if (hasil?.affectedRows) {
      console.log(`✅ ${hasil.affectedRows} kredensial ditautkan ke lokasi kantor`);
    }

    const [yatim]: any = await connection.execute(
      'SELECT COUNT(*) AS n FROM employee_webauthn_credentials WHERE office_location_id IS NULL'
    );
    if (yatim[0]?.n > 0) {
      // Sengaja TIDAK menebak. Kredensial yang koordinatnya tidak cocok dengan
      // kantor mana pun harus didaftarkan ulang, bukan ditautkan asal-asalan ke
      // lokasi terdekat — itu memindahkan area absensi seseorang diam-diam.
      console.warn(
        `⚠️  ${yatim[0].n} kredensial belum tertaut lokasi kantor. `
        + 'Karyawan bersangkutan perlu mendaftar ulang sidik jari lewat Pengaturan.'
      );
    }
  } catch (err: any) {
    console.warn('Backfill lokasi kredensial:', String(err.message).slice(0, 120));
  }
  console.log('✅ Tautan kredensial ke lokasi kantor ensured');
};

// ==================== OUTBOX HANDOFF PR SETELAH DEAL (DR-P1-06) ====================
// Pembuatan PR dari proposal yang di-deal berjalan SETELAH transaction deal, dan
// errornya hanya dicatat ke log sementara respons tetap sukses. Jadi deal bisa
// berhasil sambil diam-diam kehilangan handoff ke Procurement, tanpa satu pun
// tanda di layar.
//
// Barisnya ditulis DI DALAM transaction deal, jadi ia tidak bisa hilang bersama
// kegagalan proses sesudahnya. UNIQUE pada proposal_id membuat pemrosesan
// idempoten: retry berapa kali pun tidak menghasilkan PR kedua.
const ensureDealPrOutbox = async (connection: any) => {
  await execSchemaEnsure(connection, `CREATE TABLE IF NOT EXISTS deal_pr_jobs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    proposal_id INT NOT NULL,
    project_id INT NULL,
    status ENUM('pending','success','failed','skipped') NOT NULL DEFAULT 'pending',
    attempts INT NOT NULL DEFAULT 0,
    last_error TEXT NULL,
    pr_id INT NULL,
    pr_number VARCHAR(100) NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_deal_pr_proposal (proposal_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  // `processing` dipakai untuk MENGKLAIM job sebelum pekerjaannya dimulai.
  // Tanpa itu, dua pemrosesan paralel sama-sama masuk dan yang kalah bisa
  // menimpa hasil yang sudah `success`.
  await execSchemaEnsure(connection,
    `ALTER TABLE deal_pr_jobs MODIFY COLUMN status
     ENUM('pending','processing','success','failed','skipped') NOT NULL DEFAULT 'pending'`);

  // Pagar terakhir di level database: satu proposal hanya boleh punya satu PR.
  // Sebelumnya asal proposal hanya tersimpan di dalam JSON `notes`, jadi kalau
  // logika aplikasinya keliru, tidak ada yang menahan PR kedua terbuat.
  await execSchemaEnsure(connection,
    'ALTER TABLE purchase_requests ADD COLUMN IF NOT EXISTS source_proposal_id INT NULL');

  try {
    // Backfill dari notes lama supaya index unik di bawah tidak menolak data
    // yang sudah ada.
    await connection.execute(
      `UPDATE purchase_requests
       SET source_proposal_id = CAST(JSON_UNQUOTE(JSON_EXTRACT(notes, '$.source_proposal_id')) AS UNSIGNED)
       WHERE source_proposal_id IS NULL
         AND JSON_VALID(notes)
         AND JSON_EXTRACT(notes, '$.source_proposal_id') IS NOT NULL`
    );

    const [kembar]: any = await connection.execute(
      `SELECT source_proposal_id, COUNT(*) AS n FROM purchase_requests
       WHERE source_proposal_id IS NOT NULL GROUP BY source_proposal_id HAVING n > 1`
    );
    if (kembar.length > 0) {
      console.error(
        `⚠️  UNIQUE(source_proposal_id) TIDAK dipasang — ${kembar.length} proposal punya lebih dari satu PR: `
        + kembar.map((k: any) => `proposal ${k.source_proposal_id}×${k.n}`).join(', ')
      );
    } else {
      const [idx]: any = await connection.execute(
        `SELECT 1 FROM INFORMATION_SCHEMA.STATISTICS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'purchase_requests'
           AND INDEX_NAME = 'uq_pr_source_proposal' LIMIT 1`
      );
      if (idx.length === 0) {
        await connection.execute(
          'CREATE UNIQUE INDEX uq_pr_source_proposal ON purchase_requests (source_proposal_id)'
        );
      }
    }
  } catch (err: any) {
    console.warn('Pagar PR sumber proposal:', String(err.message).slice(0, 140));
  }

  console.log('✅ Outbox handoff PR ensured');
};

// ==================== TAUTAN PR PADA MATERIAL REQUEST (DR-P1-04) ====================
// Nomor PR hasil approve dulu disimpan dengan MENIMPA kolom `notes` memakai JSON.
// `notes` diisi karyawan sebagai teks bebas dari layar mobile, jadi approve
// menjalankan `JSON.parse` atas teks seperti "urgent" dan melempar — SETELAH
// status berubah dan PR terlanjur dibuat. Tautannya dipindah ke kolom sendiri.
const ensureMaterialRequestPrLink = async (connection: any) => {
  await execSchemaEnsure(connection,
    'ALTER TABLE material_requests ADD COLUMN IF NOT EXISTS linked_pr_id INT NULL');
  await execSchemaEnsure(connection,
    'ALTER TABLE material_requests ADD COLUMN IF NOT EXISTS linked_pr_number VARCHAR(100) NULL');
  console.log('✅ Tautan PR material request ensured');
};

// ==================== RULE APPROVAL TERIKAT KE REQUEST (DR-P0-02) ====================
// `approval_requests` tidak menyimpan rule mana yang berlaku, sehingga otorisasi
// dan pencarian step berikutnya hanya bisa mencocokkan lewat `module`. Semua
// step dari SEMUA rule bermodul sama ikut tergabung — approver yang ditugaskan
// pada satu rule bisa bertindak atas request yang seharusnya memakai rule lain,
// dan `condition_field`/`min_value`/`max_value`/`is_active` tidak pernah
// dievaluasi.
//
// Rule dipilih sekali saat submit lalu dikunci ke requestnya.
/**
 * Foreign key `schedule_overrides` / `schedule_progress` → `proposal_items`.
 *
 * Kedua tabel dibuat tanpa FK sama sekali, jadi menghapus item RAB meninggalkan
 * baris jadwal yatim yang tidak pernah bisa terlihat lagi dari mana pun — dan
 * id-nya bisa terpakai ulang oleh item proposal lain di kemudian hari.
 *
 * Aman dijalankan: sebelum dipasang, produksi diperiksa dan kedua tabel berisi
 * 0 baris dengan 0 orphan, jadi tidak ada data yang perlu dibersihkan lebih
 * dulu. Kalau nanti gagal karena ada orphan, `execSchemaEnsure` hanya mencatat
 * peringatan dan boot tetap jalan — pembersihannya keputusan operator, bukan
 * sesuatu yang boleh dilakukan diam-diam saat startup.
 */
const ensureScheduleChildFk = async (connection: any) => {
  const [ada]: any = await connection.execute(
    `SELECT CONSTRAINT_NAME FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME IN ('schedule_overrides','schedule_progress')
       AND REFERENCED_TABLE_NAME = 'proposal_items'`
  );
  const sudah = new Set((ada || []).map((r: any) => r.CONSTRAINT_NAME));

  if (!sudah.has('fk_schedule_overrides_item')) {
    await execSchemaEnsure(connection,
      `ALTER TABLE schedule_overrides
       ADD CONSTRAINT fk_schedule_overrides_item
       FOREIGN KEY (proposal_item_id) REFERENCES proposal_items(id) ON DELETE CASCADE`);
  }
  if (!sudah.has('fk_schedule_progress_item')) {
    await execSchemaEnsure(connection,
      `ALTER TABLE schedule_progress
       ADD CONSTRAINT fk_schedule_progress_item
       FOREIGN KEY (proposal_item_id) REFERENCES proposal_items(id) ON DELETE CASCADE`);
  }
  console.log('✅ FK jadwal → proposal_items ensured');
};

/**
 * Klasifikasi scope pada baris RAB proposal.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * Gerbang komersial menolak proposal bernilai nol, tapi tidak menolak proposal
 * CAMPURAN: satu baris bernilai membuat totalnya positif, sementara baris lain
 * berkuantitas nol ikut lolos sebagai lingkup pekerjaan seharga Rp0.
 *
 * Terukur di produksi (20 Agustus 2026): `PROP/2026/0001` memuat 182 baris, dan
 * **144 di antaranya berkuantitas nol** — semuanya punya AHSP dan harga satuan
 * sungguhan (mis. "1 m' Saluran U-Ditch" Rp 6.684.737), hanya volumenya yang
 * tidak pernah diisi. Kalau proposal itu menjadi kontrak, seluruh pekerjaan
 * tersebut masuk lingkup tanpa anggaran.
 *
 * Karena itu nol dari wizard diperlakukan `priced` = **belum lengkap**, bukan
 * gratis. Kalau memang disengaja, harus dinyatakan: `included` (gratis, sudah
 * diperhitungkan di tempat lain), `optional` (di luar harga dasar), atau
 * `excluded` (tidak dikerjakan). Ketiganya menyimpan siapa yang menetapkan dan
 * alasannya, supaya keputusannya bisa ditelusuri.
 * ─────────────────────────────────────────────────────────────────────────────
 */
const ensureProposalScopeStatus = async (connection: any) => {
  const statements = [
    `ALTER TABLE proposal_items ADD COLUMN IF NOT EXISTS scope_status
       VARCHAR(16) NOT NULL DEFAULT 'priced'`,
    `ALTER TABLE proposal_items ADD COLUMN IF NOT EXISTS scope_note TEXT NULL`,
    `ALTER TABLE proposal_items ADD COLUMN IF NOT EXISTS scope_set_by INT NULL`,
    `ALTER TABLE proposal_items ADD COLUMN IF NOT EXISTS scope_set_at DATETIME NULL`,
  ];
  for (const st of statements) await execSchemaEnsure(connection, st);
  console.log('✅ Klasifikasi scope proposal ensured');
};

/**
 * UNIQUE `(proposal_id, order_no)` pada `proposal_items`.
 *
 * Skema hanya punya index biasa, jadi urutan ganda tidak pernah tertahan di
 * lapisan database — ia bergantung sepenuhnya pada kebenaran kode. `order_no`
 * dulu dihitung dari pembacaan di luar transaction, sehingga dua penambahan
 * bersamaan bisa memakai urutan yang sama dan dokumen RAB menampilkan dua baris
 * bernomor identik.
 *
 * Aman dipasang: produksi diperiksa lebih dulu — 548 baris dengan 548 pasangan
 * `(proposal_id, order_no)` unik, jadi tidak ada duplikat yang perlu dibereskan.
 * Kalau nanti gagal karena duplikat, `execSchemaEnsure` hanya mencatat
 * peringatan dan boot tetap jalan; membereskan urutan baris adalah keputusan
 * operator, bukan sesuatu yang pantas dilakukan diam-diam saat startup.
 */
const ensureProposalItemOrderUnique = async (connection: any) => {
  const [ada]: any = await connection.execute(
    `SELECT INDEX_NAME FROM INFORMATION_SCHEMA.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'proposal_items'
       AND INDEX_NAME = 'uq_proposal_item_order'`
  );
  if ((ada || []).length === 0) {
    await execSchemaEnsure(connection,
      `ALTER TABLE proposal_items
       ADD CONSTRAINT uq_proposal_item_order UNIQUE (proposal_id, order_no)`);
  }
  console.log('✅ Urutan item proposal unik ensured');
};

const ensureApprovalRuleLink = async (connection: any) => {
  // Kolom prasyarat pada tabel approval LAMA.
  //
  // `schema-baseline.sql` memakai `CREATE TABLE IF NOT EXISTS`, jadi instalasi
  // yang sudah punya `approval_rules` versi pendek (hanya id/module/name/
  // created_at) TIDAK akan mendapat kolom barunya — baseline melewati tabelnya
  // begitu saja. Baseline mengurus instalasi BARU; ALTER di sini mengurus yang
  // SUDAH BERJALAN. Keduanya diperlukan, dan itu memang pembagian yang
  // ditetapkan di CLAUDE.md.
  //
  // Tanpa ini, `selectRuleForRequest()` gagal `Unknown column 'sequence'` dan
  // otorisasi aksi gagal `Table approval_delegations doesn't exist`.
  for (const stmt of [
    "ALTER TABLE approval_rules ADD COLUMN IF NOT EXISTS condition_field VARCHAR(100) NULL",
    "ALTER TABLE approval_rules ADD COLUMN IF NOT EXISTS min_value DECIMAL(15,2) NULL",
    "ALTER TABLE approval_rules ADD COLUMN IF NOT EXISTS max_value DECIMAL(15,2) NULL",
    "ALTER TABLE approval_rules ADD COLUMN IF NOT EXISTS approver_role_id INT NULL",
    "ALTER TABLE approval_rules ADD COLUMN IF NOT EXISTS sequence INT NULL DEFAULT 1",
    "ALTER TABLE approval_rules ADD COLUMN IF NOT EXISTS is_active TINYINT(1) NOT NULL DEFAULT 1",
    "ALTER TABLE approval_rule_steps ADD COLUMN IF NOT EXISTS can_reject TINYINT(1) NOT NULL DEFAULT 1",
    "ALTER TABLE approval_rule_steps ADD COLUMN IF NOT EXISTS is_parallel TINYINT(1) NOT NULL DEFAULT 0",
    `CREATE TABLE IF NOT EXISTS approval_delegations (
      id INT AUTO_INCREMENT PRIMARY KEY,
      from_user_id INT NOT NULL,
      to_user_id INT NOT NULL,
      module VARCHAR(100) NOT NULL,
      start_date DATE NULL,
      end_date DATE NULL,
      reason TEXT NULL,
      is_active TINYINT(1) NOT NULL DEFAULT 1,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      KEY idx_delegasi_penerima (to_user_id, module, is_active)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  ]) {
    await execSchemaEnsure(connection, stmt);
  }

  await execSchemaEnsure(connection,
    'ALTER TABLE approval_requests ADD COLUMN IF NOT EXISTS rule_id INT NULL');
  await execSchemaEnsure(connection,
    'ALTER TABLE approval_requests ADD COLUMN IF NOT EXISTS condition_value DECIMAL(15,2) NULL');
  console.log('✅ Rule approval terikat ke request ensured');
};

// ==================== SATU PAYSLIP PER KARYAWAN PER PERIODE (DR-P0-04) ====================
// `POST /payslip/save` memakai pola upsert dengan kunci
// (employee_id, period_month, period_year) — pencariannya bahkan
// `ORDER BY id DESC LIMIT 1`, yang mengakui baris kembar mungkin ada. Tanpa
// UNIQUE, dua permintaan simpan yang berlomba menghasilkan dua payslip final
// untuk periode yang sama dan hanya salah satunya yang terlihat.
//
// Produksi diperiksa sebelum dipasang: 138 payslip, 0 kembar.
const ensurePayslipPeriodUnique = async (connection: any) => {
  try {
    const [dupes]: any = await connection.execute(
      `SELECT employee_id, period_month, period_year, COUNT(*) AS n
       FROM payslip_records
       GROUP BY employee_id, period_month, period_year HAVING n > 1`
    );
    if (dupes.length > 0) {
      // Payslip yang sudah final adalah dokumen gaji — tidak dihapus otomatis.
      console.error(
        `⚠️  UNIQUE payslip TIDAK dipasang — ada ${dupes.length} periode kembar: `
        + dupes.map((d: any) => `emp${d.employee_id}/${d.period_month}-${d.period_year}×${d.n}`).join(', ')
        + '. Rapikan manual lalu restart backend.'
      );
      return;
    }

    const [idx]: any = await connection.execute(
      `SELECT 1 FROM INFORMATION_SCHEMA.STATISTICS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'payslip_records'
         AND INDEX_NAME = 'uq_payslip_employee_period' LIMIT 1`
    );
    if (idx.length === 0) {
      await connection.execute(
        'CREATE UNIQUE INDEX uq_payslip_employee_period ON payslip_records (employee_id, period_month, period_year)'
      );
    }
    console.log('✅ Payslip unik per karyawan per periode ensured');
  } catch (err: any) {
    console.warn('Schema ensure warning (payslip unique):', String(err.message).substring(0, 160));
  }
};

// ==================== SOFT DELETE PURCHASE REQUEST (PROC-R08) ====================
// PO sudah memakai logical delete, tapi PR masih dihapus permanen berikut bid,
// bid item, dan itemnya — sebagian lewat helper yang menelan error, jadi
// penghapusan separuh jalan pun tetap dilaporkan sukses. PR yang sudah disetujui
// atau sudah punya penawaran vendor adalah dokumen yang dirujuk keputusan
// pengadaan; menghapusnya permanen menghilangkan dasar keputusan itu.
const ensurePurchaseRequestSoftDelete = async (connection: any) => {
  const statements = [
    `ALTER TABLE purchase_requests ADD COLUMN IF NOT EXISTS is_deleted TINYINT(1) NOT NULL DEFAULT 0`,
    `ALTER TABLE purchase_requests ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP NULL`,
    `ALTER TABLE purchase_requests ADD COLUMN IF NOT EXISTS deleted_by INT NULL`,
    `ALTER TABLE purchase_requests ADD COLUMN IF NOT EXISTS deletion_reason TEXT NULL`,
    `CREATE INDEX idx_pr_is_deleted ON purchase_requests (is_deleted)`,
  ];

  for (const statement of statements) {
    await execSchemaEnsure(connection, statement);
  }
  console.log('✅ Soft delete purchase request ensured');
};

// ==================== IDEMPOTENSI GENERATE PO (PROC-R19) ====================
// `generate-pos` membuat satu PO per vendor pemenang, masing-masing dalam
// transaction sendiri, sementara status PR baru diubah jadi PO_GENERATED setelah
// SELURUH loop selesai. Kalau vendor ketiga gagal, PO vendor A dan B sudah
// ter-commit tapi PR belum bertanda — user menekan ulang dan A serta B dapat PO
// kedua.
//
// Kolom `source_bid_id` + UNIQUE (pr_id, source_bid_id) membuat percobaan kedua
// untuk bid yang sama ditolak database, sehingga retry hanya melanjutkan vendor
// yang belum berhasil.
//
// UNIQUE-nya sengaja mengizinkan banyak baris dengan source_bid_id NULL: seluruh
// PO lama (dan PO yang dibuat manual) tidak punya nilai ini, dan di MySQL NULL
// tidak dianggap duplikat. Jadi data berjalan tidak terganggu.
const ensureGeneratedPoIdempotency = async (connection: any) => {
  const statements = [
    `ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS source_bid_id INT NULL`,
    `CREATE UNIQUE INDEX uniq_po_pr_bid ON purchase_orders (pr_id, source_bid_id)`,
  ];

  for (const statement of statements) {
    await execSchemaEnsure(connection, statement);
  }
  console.log('✅ Idempotensi generate PO ensured');
};

// ==================== PENCATAT GRN (PROC-R12) ====================
// `goods_receipts` hanya punya `received_by`, dan nilainya boleh dikirim klien.
// Artinya user A bisa membuat GRN yang seluruhnya tercatat atas nama user B,
// tanpa jejak siapa yang sebenarnya menginput.
//
// Penerima barang memang boleh berbeda dari penginput — itu realitas gudang —
// jadi solusinya bukan melarang `received_by`, melainkan mencatat keduanya.
const ensureGrnCreatedBy = async (connection: any) => {
  const statements = [
    `ALTER TABLE goods_receipts ADD COLUMN IF NOT EXISTS created_by INT NULL`,
  ];

  for (const statement of statements) {
    await execSchemaEnsure(connection, statement);
  }
  console.log('✅ Kolom pencatat GRN ensured');
};

// ==================== DISPOSAL WORKFLOW (AST-006) ====================
// Disposal sebelumnya hanya berupa mengubah status menjadi 'disposed' — tanpa
// alasan, tanpa persetujuan, tanpa nilai jual, dan tanpa perhitungan gain/loss.
// Aset disposed pun bisa dikembalikan jadi active begitu saja.
//
// Aman untuk sistem berjalan: aset yang SUDAH berstatus disposed tidak disentuh
// sama sekali — tidak ada migrasi data lama. Tabel ini hanya mencatat disposal
// yang terjadi sejak fitur ini aktif.
const ensureDisposalSchema = async (connection: any) => {
  const statements = [
    `CREATE TABLE IF NOT EXISTS asset_disposals (
      id INT PRIMARY KEY AUTO_INCREMENT,
      asset_id INT NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'requested',
      reason TEXT NULL,
      disposal_method VARCHAR(50) NULL,
      buyer VARCHAR(200) NULL,
      planned_date DATE NULL,
      disposal_date DATE NULL,
      proceeds DECIMAL(18,2) NOT NULL DEFAULT 0,
      book_value_at_disposal DECIMAL(18,2) NULL,
      gain_loss DECIMAL(18,2) NULL,
      document_id INT NULL,
      previous_status VARCHAR(30) NULL,
      requested_by INT NULL,
      requested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      approved_by INT NULL,
      approved_at TIMESTAMP NULL,
      rejected_by INT NULL,
      rejected_at TIMESTAMP NULL,
      rejection_reason TEXT NULL,
      reversed_by INT NULL,
      reversed_at TIMESTAMP NULL,
      reversal_reason TEXT NULL,
      FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE CASCADE,
      FOREIGN KEY (document_id) REFERENCES asset_documents(id) ON DELETE SET NULL,
      FOREIGN KEY (requested_by) REFERENCES users(id) ON DELETE SET NULL,
      FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE SET NULL,
      FOREIGN KEY (rejected_by) REFERENCES users(id) ON DELETE SET NULL,
      FOREIGN KEY (reversed_by) REFERENCES users(id) ON DELETE SET NULL,
      INDEX idx_asset_disposal (asset_id, status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

    `INSERT IGNORE INTO permissions (resource, action, module, name, description)
     VALUES ('assets.dispose', 'approve', 'assets', 'approve assets.dispose', 'Menyetujui / menolak permintaan disposal aset')`,
  ];

  for (const statement of statements) {
    await execSchemaEnsure(connection, statement);
  }
  console.log('✅ Disposal workflow ensured');
};

// ==================== PIN LOGIN MOBILE ====================
// Sebelumnya login mobile cukup dengan NIK, sehingga siapa pun yang tahu NIK
// karyawan bisa mendapat token miliknya — dan seluruh proteksi IDOR di
// payslip/attendance/WebAuthn jadi bisa dilewati. PIN di-hash bcrypt, tidak
// pernah disimpan polos.
const ensureMobilePinSchema = async (connection: any) => {
  const statements = [
    `ALTER TABLE employees ADD COLUMN IF NOT EXISTS mobile_pin VARCHAR(255) NULL`,
    `ALTER TABLE employees ADD COLUMN IF NOT EXISTS mobile_pin_set_at TIMESTAMP NULL`,
    // Wajib ganti PIN saat login pertama — PIN awal diketahui HR.
    `ALTER TABLE employees ADD COLUMN IF NOT EXISTS mobile_pin_must_change TINYINT(1) NOT NULL DEFAULT 1`,
    `ALTER TABLE employees ADD COLUMN IF NOT EXISTS mobile_pin_failed_attempts INT NOT NULL DEFAULT 0`,
    `ALTER TABLE employees ADD COLUMN IF NOT EXISTS mobile_pin_locked_until TIMESTAMP NULL`,
  ];

  for (const statement of statements) {
    await execSchemaEnsure(connection, statement);
  }
  console.log('✅ Mobile PIN schema ensured');
};

// Katalog permission — sumber kebenaran untuk RBAC.
// Produksi punya 484 baris yang dulu dibuat manual dan tidak pernah masuk repo,
// sehingga instalasi baru hanya punya ~35 permission: requirePermission() akan
// menolak semua orang kecuali master. Didefinisikan di sini supaya reproducible.
const PERMISSION_CATALOG: { actions: string[]; resources: string[] }[] = [
  {
    actions: ['approve_1', 'approve_2'],
    resources: [
      'inventory.stock-adjustment', 'inventory.stock-transfer', 'master_data.bom',
      'master-data.bom', 'production.fg-receipt', 'production.workorders', 'quality.batch-release',
      'quality.ncr', 'rnd.rnd-formulations', 'rnd.rnd-projects'
    ],
  },
  {
    actions: ['approve_1', 'approve_2', 'view'],
    resources: [
      'procurement.spec-approval'
    ],
  },
  {
    actions: ['approve', 'approve_1', 'approve_2', 'create', 'delete', 'edit', 'export', 'view'],
    resources: [
      'finance.ap', 'finance.ar', 'finance.fund-requests', 'procurement.grn',
      'procurement.purchase-orders', 'procurement.purchase-requests'
    ],
  },
  {
    actions: ['approve', 'create', 'delete', 'edit', 'export', 'view'],
    resources: [
      'admin.approval-config', 'admin.audit-log', 'admin.backup', 'admin.integration',
      'admin.notifications', 'admin.roles', 'admin.system-settings', 'admin.users',
      'approval.approval-history', 'approval.approval-inbox', 'approval.approval-rules',
      'dashboard.dashboard-alerts', 'dashboard.dashboard-approvals',
      'dashboard.dashboard-overview', 'estimator.estimator-ahsp', 'estimator.estimator-masters',
      'estimator.estimator-proposals', 'estimator.hsp', 'estimator.rab',
      'finance.accounts-payable', 'finance.accounts-receivable', 'finance.cost-analysis',
      'finance.financial-summary', 'finance.kasbon', 'finance.payment-schedule', 'hr.attendance',
      'hr.kasbon', 'hr.office-locations', 'hr.payroll', 'hr.position-rates',
      'master_data.item-types', 'master_data.suppliers', 'master_data.warehouse-locations',
      'master-data.categories', 'master-data.customers', 'master-data.departments',
      'master-data.items', 'master-data.units', 'master-data.warehouses',
      'procurement.material-price-comparison', 'procurement.procurement-dashboard',
      'procurement.procurement-history', 'procurement.vendor-price-list', 'projects.clients',
      'projects.dashboard', 'projects.documents', 'projects.expenses', 'projects.help',
      'projects.leads', 'projects.manpower', 'projects.messages', 'projects.mto', 'projects.notes',
      'projects.project-events', 'projects.projects', 'projects.prospects', 'projects.reports',
      'projects.sales', 'projects.schedule', 'projects.settings', 'projects.tasks',
      'projects.team', 'projects.tickets', 'reports.export-data', 'reports.finance-reports',
      'reports.inventory-reports', 'reports.procurement-reports'
    ],
  },
  {
    actions: ['create', 'delete', 'edit', 'export', 'view'],
    resources: [
      'hr.employees'
    ],
  },
  {
    actions: ['export', 'view'],
    resources: [
      'finance.project-pl', 'hr.reports'
    ],
  },
  {
    actions: ['manage', 'view'],
    resources: [
      // Sub-resource Asset Management (AST-001). Dipisah supaya Maintenance
      // Officer tidak otomatis boleh mengubah nilai finansial, dan sebaliknya.
      'assets.maintenance', 'assets.financial'
    ],
  },
  {
    actions: ['manage'],
    resources: [
      'assets.documents', 'assets.master'
    ],
  },
  {
    // 'manage' dipertahankan demi kompatibilitas: role produksi sudah dipetakan
    // ke assets.manage sejak modul ini dirilis.
    actions: ['view', 'create', 'edit', 'delete', 'dispose', 'manage'],
    resources: [
      'assets'
    ],
  },
];
// Total: 484 permission dari 88 resource

// ==================== APPROVAL HARGA VENDOR (PROC-VPL-01) ====================
// Sebelum ini `POST/PUT /vendor-prices` menulis langsung ke tabel dan harganya
// SAAT ITU JUGA dipakai auto-fill PR, price-search, dan pemilihan vendor. Tidak
// ada satu pun pemeriksaan di antaranya: satu nol yang kelebihan langsung
// menjadi dasar penawaran dan pesanan.
//
// Modelnya menyalin purchase_requests supaya orang yang sama tidak perlu
// belajar dua alur: approval_status 0 (pending) -> 1 (supervisor) -> 2 (final).
// Yang dipakai modul lain HANYA baris berstatus 2 yang belum digantikan.
//
// Mengubah harga yang sudah disetujui TIDAK menyentuh barisnya. Ia melahirkan
// baris revisi berstatus pending (`revision_of`), dan harga lama tetap
// melayani PR/PO sampai revisi itu disetujui — baru kemudian ditandai
// `superseded_at`. Tanpa itu setiap koreksi harga membuat produknya kehilangan
// harga selama menunggu persetujuan.
// ==================== LAMPIRAN GRN (PROC-GRN-DOC-01) ====================
// Surat jalan per GRN dan foto per item barang yang diterima.
//
// ⚠️ Fotonya ditambatkan ke (grn_id, product_id), BUKAN ke `grn_items.id`.
// Alasannya bukan selera: tabel `grn_items` ada di skema lengkap dengan foreign
// key, tapi TIDAK PERNAH DITULIS — `POST /goods-receipts` hanya menyisipkan
// baris `goods_receipts`, dan itemnya disimpan sebagai JSON di kolom `notes`.
// Diverifikasi di produksi: 4 GRN, 0 baris `grn_items`. Menambatkan foto ke id
// yang tidak pernah lahir berarti foto tidak akan pernah bisa dipasang.
//
// Konsekuensinya: satu produk hanya boleh muncul sekali dalam satu GRN. Itu
// memang keadaan sekarang — diperiksa di produksi dan lokal, nol PO yang memuat
// product_id yang sama dua kali. Kalau suatu saat `grn_items` benar-benar diisi,
// inilah yang harus ditinjau ulang lebih dulu.
const ensureGrnAttachmentSchema = async (connection: any) => {
  const statements = [
    `CREATE TABLE IF NOT EXISTS grn_documents (
      id INT PRIMARY KEY AUTO_INCREMENT,
      grn_id INT NOT NULL,
      doc_type VARCHAR(30) NOT NULL DEFAULT 'surat_jalan',
      file_path VARCHAR(500) NOT NULL,
      file_name VARCHAR(255) NOT NULL,
      file_size INT NULL,
      uploaded_by INT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      KEY idx_grn_documents_grn (grn_id),
      CONSTRAINT fk_grn_documents_grn FOREIGN KEY (grn_id) REFERENCES goods_receipts(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    `CREATE TABLE IF NOT EXISTS grn_item_photos (
      id INT PRIMARY KEY AUTO_INCREMENT,
      grn_id INT NOT NULL,
      product_id INT NOT NULL,
      file_path VARCHAR(500) NOT NULL,
      file_name VARCHAR(255) NOT NULL,
      file_size INT NULL,
      uploaded_by INT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      KEY idx_grn_item_photos_grn (grn_id, product_id),
      CONSTRAINT fk_grn_item_photos_grn FOREIGN KEY (grn_id) REFERENCES goods_receipts(id) ON DELETE CASCADE,
      CONSTRAINT fk_grn_item_photos_product FOREIGN KEY (product_id) REFERENCES products(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  ];

  for (const statement of statements) {
    await execSchemaEnsure(connection, statement);
  }
  console.log('✅ Skema lampiran GRN ensured');
};

const ensureVendorPriceApprovalSchema = async (connection: any) => {
  // Diperiksa SEBELUM kolomnya dibuat. Baris yang sudah ada saat migrasi ini
  // pertama kali jalan adalah harga yang memang sudah dipakai produksi selama
  // ini; kalau semuanya menjadi pending, auto-fill PR dan price-search
  // mendadak kosong di hari deploy.
  //
  // Penandaannya HARUS sekali saja. Kalau UPDATE di bawah jalan tiap boot, ia
  // akan menyetujui sendiri setiap harga yang sedang menunggu persetujuan —
  // persis meniadakan fitur ini.
  let firstRun = false;
  try {
    const [existing]: any = await connection.execute(
      `SELECT COUNT(*) AS c FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'vendor_prices' AND COLUMN_NAME = 'approval_status'`,
      [activeDatabaseName]
    );
    firstRun = !(Array.isArray(existing) && existing[0] && Number(existing[0].c) > 0);
  } catch (err: any) {
    console.warn('Vendor price approval: gagal memeriksa kolom -', err.message.substring(0, 120));
    return;
  }

  const statements = [
    `ALTER TABLE vendor_prices ADD COLUMN IF NOT EXISTS approval_status INT NOT NULL DEFAULT 0`,
    `ALTER TABLE vendor_prices ADD COLUMN IF NOT EXISTS approved_by_supervisor_id INT NULL`,
    `ALTER TABLE vendor_prices ADD COLUMN IF NOT EXISTS approved_at_supervisor TIMESTAMP NULL`,
    `ALTER TABLE vendor_prices ADD COLUMN IF NOT EXISTS approved_by_manager_id INT NULL`,
    `ALTER TABLE vendor_prices ADD COLUMN IF NOT EXISTS approved_at_manager TIMESTAMP NULL`,
    `ALTER TABLE vendor_prices ADD COLUMN IF NOT EXISTS rejected_by INT NULL`,
    `ALTER TABLE vendor_prices ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMP NULL`,
    `ALTER TABLE vendor_prices ADD COLUMN IF NOT EXISTS rejection_reason TEXT NULL`,
    `ALTER TABLE vendor_prices ADD COLUMN IF NOT EXISTS revision_of INT NULL`,
    `ALTER TABLE vendor_prices ADD COLUMN IF NOT EXISTS superseded_by INT NULL`,
    `ALTER TABLE vendor_prices ADD COLUMN IF NOT EXISTS superseded_at TIMESTAMP NULL`,
  ];

  for (const statement of statements) {
    await execSchemaEnsure(connection, statement);
  }

  if (firstRun) {
    // MySQL 8 tidak punya `CREATE INDEX IF NOT EXISTS`, jadi indeksnya dibuat
    // hanya di jalur sekali-jalan ini — bukan supaya hemat, tapi supaya log
    // boot tidak dipenuhi peringatan duplikat tiap restart.
    for (const statement of [
      `CREATE INDEX idx_vendor_prices_aktif ON vendor_prices (approval_status, superseded_at)`,
      `CREATE INDEX idx_vendor_prices_revision ON vendor_prices (revision_of)`,
    ]) {
      await execSchemaEnsure(connection, statement);
    }

    try {
      const [r]: any = await connection.execute(
        `UPDATE vendor_prices SET approval_status = 2 WHERE approval_status = 0`
      );
      // Kolom approver sengaja DIBIARKAN KOSONG. Tidak ada seorang pun yang
      // pernah menyetujui baris-baris ini; mengisinya dengan nama siapa pun
      // akan mengarang persetujuan yang tidak pernah terjadi. Layarnya
      // menampilkannya sebagai "data warisan".
      console.log(`✅ Harga vendor warisan ditandai aktif: ${r.affectedRows} baris (tanpa approver — memang tidak pernah disetujui siapa pun)`);
    } catch (err: any) {
      console.warn('Vendor price approval: backfill gagal -', err.message.substring(0, 120));
    }
  }

  console.log('✅ Skema approval harga vendor ensured');
};

const ensurePermissionCatalog = async (connection: any) => {
  const rows: [string, string, string][] = [];
  for (const g of PERMISSION_CATALOG) {
    for (const resource of g.resources) {
      // module = segmen pertama resource, dipakai UI untuk mengelompokkan
      const module = resource.split('.')[0];
      for (const action of g.actions) rows.push([resource, action, module]);
    }
  }

  try {
    // INSERT IGNORE butuh UNIQUE(resource, action); tanpa itu jalankan cek manual
    const [existing]: any = await connection.execute(
      'SELECT CONCAT(resource, "|", action) AS k FROM permissions'
    );
    const have = new Set((existing || []).map((r: any) => r.k));
    const missing = rows.filter(([res, act]) => !have.has(`${res}|${act}`));

    for (const [resource, action, module] of missing) {
      await connection.execute(
        'INSERT INTO permissions (resource, action, module, name, description) VALUES (?, ?, ?, ?, ?)',
        [resource, action, module, `${action} ${resource}`, null]
      );
    }
    console.log(`✅ Katalog permission: ${missing.length > 0 ? `${missing.length} ditambahkan` : 'sudah lengkap'} (${rows.length} total)`);
  } catch (err: any) {
    console.warn('ensurePermissionCatalog warning:', err.message.substring(0, 120));
  }
};

// Master admin login lewat jalur hardcoded di auth.routes.ts dengan userId
// 99999, tanpa memeriksa database. Tapi banyak tabel punya FK created_by →
// users(id): tanpa baris ini, master tidak bisa membuat aset, dokumen, dsb.
// Password-nya diisi acak dan tidak pernah ditampilkan — baris ini murni
// sasaran foreign key, bukan kredensial yang bisa dipakai masuk.
export const MASTER_EMAIL = 'master@admin.com';
export const MASTER_FALLBACK_ID = 99999;

const ensureMasterUserRow = async (connection: any) => {
  try {
    const [existing]: any = await connection.execute(
      'SELECT id, user_level FROM users WHERE email = ? OR username = ? ORDER BY id LIMIT 1',
      [MASTER_EMAIL, 'master']
    );
    const row = Array.isArray(existing) && existing[0];

    if (row) {
      // Baris sudah ada (produksi id 99999, instalasi lain bisa berbeda).
      // Password sengaja TIDAK disentuh — jalur login master tidak memeriksanya.
      if (Number(row.user_level || 0) < 10) {
        await connection.execute('UPDATE users SET user_level = 10, is_active = 1 WHERE id = ?', [row.id]);
        console.log(`✅ User master (id ${row.id}) disetel user_level 10`);
      }
      return;
    }

    const [adminRole]: any = await connection.execute(
      `SELECT id FROM roles WHERE name = 'Admin' OR code = 'ADMIN' ORDER BY id LIMIT 1`
    );
    const roleId = (Array.isArray(adminRole) && adminRole[0]?.id) || null;

    await connection.execute(
      `INSERT INTO users (id, username, email, password, full_name, role_id, user_level, is_active)
       VALUES (?, 'master', ?, ?, 'Super Administrator', ?, 10, 1)`,
      [MASTER_FALLBACK_ID, MASTER_EMAIL, await bcrypt.hash(randomBytes(24).toString('base64url'), 10), roleId]
    );
    console.log(`✅ Baris user master (id ${MASTER_FALLBACK_ID}) dibuat sebagai sasaran foreign key`);
  } catch (err: any) {
    console.warn('ensureMasterUserRow warning:', err.message.substring(0, 120));
  }
};

// Role Admin harus selalu memiliki SELURUH permission. Tanpa invariant ini,
// permission yang ditambahkan belakangan lewat ensure*Schema (mis. assets.view,
// master_data.bom.approve_1) tidak pernah terpetakan ke Admin — dan begitu
// endpoint-nya diproteksi requirePermission, admin justru ikut terkunci.
const ensureAdminRoleHasAllPermissions = async (connection: any) => {
  try {
    const [rows]: any = await connection.execute(
      `SELECT id FROM roles WHERE name = 'Admin' OR code = 'ADMIN' ORDER BY id LIMIT 1`
    );
    const adminRoleId = Array.isArray(rows) && rows[0]?.id;
    if (!adminRoleId) return;

    const [result]: any = await connection.execute(
      `INSERT INTO role_permissions (role_id, permission_id)
       SELECT ?, p.id FROM permissions p
       WHERE p.id NOT IN (SELECT permission_id FROM role_permissions WHERE role_id = ?)`,
      [adminRoleId, adminRoleId]
    );
    const added = result?.affectedRows || 0;
    console.log(`✅ Role Admin: ${added > 0 ? `${added} permission baru dipetakan` : 'permission sudah lengkap'}`);
  } catch (err: any) {
    console.warn('ensureAdminRoleHasAllPermissions warning:', err.message.substring(0, 120));
  }
};

// Initialize database schema
/**
 * Baseline skema untuk instalasi baru (DR-P1-07).
 *
 * `schema_mysql.sql` membuat 48 tabel dan `ensure*Schema` menambah 72 — total 94
 * unik, sementara produksi punya 148. Selisihnya **62 tabel** yang tidak pernah
 * dibuat jalur boot, termasuk `proposals`, `proposal_items`, `clients`,
 * `ahsp_headers`, `payslip_records`, `material_requests`, `office_locations`,
 * dan `webauthn_challenges`.
 *
 * Akibatnya database kosong boot "sehat" lalu Estimator, HR payroll, absensi
 * WebAuthn, Material Request, dan Document Centre gagal di request pertama.
 *
 * FOREIGN_KEY_CHECKS dimatikan selama pemuatan karena urutan tabel di dump
 * alfabetis, bukan urut dependensi — dan dinyalakan kembali di `finally` supaya
 * tidak pernah tertinggal mati.
 */
const ensureBaselineSchema = async (connection: any) => {
  const fs = await import('fs');
  const path = await import('path');
  const berkas = path.join(__dirname, '..', '..', 'database', 'schema-baseline.sql');

  if (!fs.existsSync(berkas)) {
    console.warn('⚠️  schema-baseline.sql tidak ditemukan — instalasi baru mungkin tidak lengkap');
    return;
  }

  const isi = fs.readFileSync(berkas, 'utf-8').replace(/^--.*$/gm, '');
  const statements = isi.split(/;\s*\n/).map(x => x.trim()).filter(Boolean);

  let dibuat = 0;
  const gagal: string[] = [];

  await connection.query('SET FOREIGN_KEY_CHECKS = 0');
  try {
    for (const stmt of statements) {
      const nama = (stmt.match(/CREATE TABLE IF NOT EXISTS `([^`]+)`/) || [])[1] || '?';
      try {
        const [hasil]: any = await connection.query(stmt);
        if (hasil?.warningStatus === 0) dibuat++;
      } catch (err: any) {
        gagal.push(`${nama}: ${String(err.message).slice(0, 90)}`);
      }
    }
  } finally {
    await connection.query('SET FOREIGN_KEY_CHECKS = 1');
  }

  if (gagal.length) {
    // DDL baseline yang gagal berarti instalasi ini TIDAK setara produksi.
    // Dicetak sebagai error, bukan warning yang tenggelam di antara ratusan
    // baris log.
    console.error(`🚨 ${gagal.length} tabel baseline GAGAL dibuat:`);
    gagal.forEach(g => console.error(`   - ${g}`));
  }
  console.log(`✅ Baseline skema: ${dibuat} tabel dibuat, ${statements.length - dibuat - gagal.length} sudah ada`);
};

/**
 * Tabel yang WAJIB ada sebelum aplikasi dinyatakan siap (DR-P1-07).
 *
 * Boot yang mencetak "initialized successfully" padahal modulnya akan gagal di
 * request pertama lebih buruk daripada boot yang gagal — kegagalannya muncul di
 * hadapan pengguna, bukan di log operator.
 */
const REQUIRED_TABLES = [
  'users', 'roles', 'permissions', 'role_permissions',
  'proposals', 'proposal_items', 'ahsp_headers', 'ahsp_items',
  'clients', 'client_projects', 'engineering_inputs', 'mto_lines',
  'employees', 'attendance_logs', 'payslip_records', 'salary_advances',
  'employee_webauthn_credentials', 'webauthn_challenges', 'office_locations',
  'purchase_requests', 'purchase_orders', 'goods_receipts',
  'material_requests', 'material_request_items',
  'approval_requests', 'approval_rules', 'approval_rule_steps',
  'notifications', 'documents', 'document_counters',
];

const verifyRequiredTables = async (connection: any) => {
  const [rows]: any = await connection.query(
    `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE()`
  );
  const ada = new Set(rows.map((r: any) => String(r.TABLE_NAME)));
  const hilang = REQUIRED_TABLES.filter(t => !ada.has(t));

  if (hilang.length) {
    throw new Error(
      `Skema tidak lengkap — ${hilang.length} tabel wajib tidak ada: ${hilang.join(', ')}. ` +
      `Aplikasi dihentikan supaya kegagalannya terlihat sekarang, bukan di hadapan pengguna.`
    );
  }
  console.log(`✅ ${REQUIRED_TABLES.length} tabel wajib terverifikasi ada`);
};

export async function initializeDatabase() {
  try {
    const connection = await pool.getConnection();
    console.log(`🔗 Connected to MySQL database: ${activeDatabaseName}`);

    // Read and execute schema
    const fs = await import('fs').then(m => m.promises);
    const path = await import('path');
    const schemaPath = path.join(__dirname, '..', '..', 'database', 'schema_mysql.sql');

    try {
      const schema = await fs.readFile(schemaPath, 'utf-8');
      const statements = schema
        .split(';')
        .filter(s => s.trim().length > 0)
        .filter(s => !s.trim().startsWith('--'));

      for (const statement of statements) {
        if (statement.trim().length > 0) {
          try {
            await connection.execute(statement);
          } catch (err: any) {
            // Ignore duplicate key errors from INSERT IGNORE
            if (!err.message.includes('duplicate')) {
              console.warn('Schema execution warning:', err.message.substring(0, 100));
            }
          }
        }
      }

      // Pesan ini dulu terbit tanpa syarat, bahkan ketika sebagian DDL gagal —
      // "successfully" yang tidak berarti apa-apa. Kelengkapannya sekarang
      // dibuktikan `verifyRequiredTables()` di akhir boot.
      console.log('✅ schema_mysql.sql dijalankan');
    } catch (fileErr) {
      console.log('⚠️ Schema file not found, using existing database');
    }

    // Baseline dulu: `ensure*Schema` di bawah menambahkan kolom/index ke tabel
    // yang harus sudah ada.
    await ensureBaselineSchema(connection);

    await ensureProcurementPaymentSchema(connection);
    await ensureRnDSchema(connection);
    await ensureApprovalPermissions(connection);
    await ensureAssetManagementSchema(connection);
    await ensureRouteModuleSchema(connection);
    await ensureWebauthnChallengeOffice(connection);
    await ensureProposalRevisionSchema(connection);
    await ensureProposalScheduleSchema(connection);
    await ensureProposalResourceSchema(connection);
    await ensureProjectScheduleBaselineSchema(connection);
    await ensurePaymentReversalSchema(connection);
    await ensureProjectWbsSchema(connection);
    await ensureProgressCutoffSchema(connection);
    await ensureCostAllocationSchema(connection);
    await ensureMtoTemplateSchema(connection);
    await ensureIntegrationSchema(connection);
    await ensureProposalKomersialSchema(connection);
    await ensureItemCostBasisSchema(connection);
    await ensureOpportunitySchema(connection);
    await ensureMaterialRequestOutcomeSchema(connection);
    await ensureMrIdempotencySchema(connection);
    await ensureBudgetSchema(connection);
    await ensureAssetCapitalizationSchema(connection);
    await ensureContractLedgerSchema(connection);
    await ensureMobilePinSchema(connection);
    await ensureAssetDepreciationSchema(connection);
    await ensureDepreciationLedgerSchema(connection);
    await ensureSoftDeleteSchema(connection);
    await ensurePurchaseOrderSoftDelete(connection);
    await ensureGrnReversalSchema(connection);
    await ensureDocumentCounterSchema(connection);
    await ensurePurchaseRequestSoftDelete(connection);
    await ensureGeneratedPoIdempotency(connection);
    await ensureGrnCreatedBy(connection);
    await ensureMtoScopeSchema(connection);
    await ensureOneProjectPerProposal(connection);
    await ensureProjectNumberUnique(connection);
    await ensurePayslipPeriodUnique(connection);
    await ensureApprovalRuleLink(connection);
    await ensureMaterialRequestPrLink(connection);
    await ensureDealPrOutbox(connection);
    await ensureCredentialOfficeLink(connection);
    await ensureMtoLinesSchema(connection);
    await ensureScheduleChildFk(connection);
    await ensureProposalScopeStatus(connection);
    await ensureProposalItemOrderUnique(connection);
    await ensureDisposalSchema(connection);
    await ensureAssetStatusHistorySchema(connection);
    await ensureGrnAttachmentSchema(connection);
    await ensureVendorPriceApprovalSchema(connection);
    await ensurePermissionCatalog(connection);
    await ensureMasterUserRow(connection);
    // Harus paling akhir: semua permission dari ensure* di atas sudah ada
    await ensureAdminRoleHasAllPermissions(connection);

    // DR-P1-07: gerbang terakhir. Kalau tabel wajib tidak ada, ini MELEMPAR dan
    // boot gagal — daripada mencetak "initialized successfully" lalu modulnya
    // meledak di request pertama, di hadapan pengguna.
    await verifyRequiredTables(connection);

    connection.release();

    // Seed initial data
    await seedDatabase();

  } catch (error) {
    console.error('❌ Database initialization error:', error);
    throw error;
  }
}

// Seed database with default data
async function seedDatabase() {
  try {
    // Insert or ensure admin role exists
    const adminRole = await dbRun(
      'INSERT IGNORE INTO roles (name, description) VALUES (?, ?)',
      ['Admin', 'System Administrator']
    );

    // Create default admin user (admin@erp.local)
    const adminUser = await dbGet(
      'SELECT id FROM users WHERE username = ?',
      ['admin']
    );

    if (!adminUser) {
      // Password admin awal TIDAK boleh berupa nilai tetap di source code —
      // repo ini publik, jadi 'admin123' sama saja dengan tanpa password.
      // Ambil dari SEED_ADMIN_PASSWORD; kalau kosong, buat acak dan tampilkan
      // sekali di log boot supaya operator bisa langsung memakainya lalu ganti.
      const generated = !process.env.SEED_ADMIN_PASSWORD;
      const plainPassword = process.env.SEED_ADMIN_PASSWORD || randomBytes(12).toString('base64url');
      const hashedPassword = await bcrypt.hash(plainPassword, 10);
      await dbRun(
        `INSERT INTO users (username, email, password, full_name, role_id, is_active)
         VALUES (?, ?, ?, ?, ?, ?)`,
        ['admin', 'admin@erp.local', hashedPassword, 'System Administrator', adminRole.insertId || 1, 1]
      );
      if (generated) {
        console.log('✅ User admin dibuat (username: admin)');
        console.log(`   Password sekali pakai: ${plainPassword}`);
        console.log('   ⚠️  Catat sekarang — tidak ditampilkan lagi. Segera ganti setelah login.');
      } else {
        console.log('✅ User admin dibuat (username: admin, password dari SEED_ADMIN_PASSWORD)');
      }
    }

    // Check and seed departments if empty
    const deptCount = await dbGet(
      'SELECT COUNT(*) as cnt FROM departments'
    );

    if (!deptCount || (deptCount as any).cnt === 0) {
      const departments = [
        { name: 'Production', description: 'Manufacturing & Production Department' },
        { name: 'Warehouse', description: 'Inventory & Warehouse Management' },
        { name: 'Quality', description: 'Quality Control & Assurance' },
        { name: 'Finance', description: 'Finance & Accounting' },
        { name: 'Sales', description: 'Sales & Distribution' },
        { name: 'HR', description: 'Human Resources' },
      ];

      for (const dept of departments) {
        await dbRun(
          'INSERT INTO departments (name, description) VALUES (?, ?)',
          [dept.name, dept.description]
        );
      }
      console.log('✅ Default departments created');
    }

    // Check and seed categories
    const catCount = await dbGet('SELECT COUNT(*) as cnt FROM categories');
    if (!catCount || (catCount as any).cnt === 0) {
      const categories = [
        { name: 'Raw Materials', description: 'Basic raw materials and ingredients' },
        { name: 'Packaging', description: 'Packaging materials and supplies' },
        { name: 'Finished Goods', description: 'Ready-to-sell finished products' },
        { name: 'Semi-Finished', description: 'Work in progress or sub-assemblies' },
        { name: 'Spare Parts', description: 'Maintenance spare parts' },
        { name: 'Office Supplies', description: 'General office supplies' }
      ];

      for (const cat of categories) {
        await dbRun('INSERT IGNORE INTO categories (name, description, active) VALUES (?, ?, 1)', [cat.name, cat.description]);
      }
      console.log('✅ Default categories created');
    }

    // Check and seed UOM
    const uomCount = await dbGet('SELECT COUNT(*) as cnt FROM uom');
    if (!uomCount || (uomCount as any).cnt === 0) {
      const uoms = [
        { code: 'kg', name: 'Kilogram', category: 'Weight' },
        { code: 'g', name: 'Gram', category: 'Weight' },
        { code: 'l', name: 'Liter', category: 'Volume' },
        { code: 'ml', name: 'Milliliter', category: 'Volume' },
        { code: 'pcs', name: 'Pieces', category: 'Count' },
        { code: 'box', name: 'Box', category: 'Count' },
        { code: 'roll', name: 'Roll', category: 'Length' },
        { code: 'm', name: 'Meter', category: 'Length' }
      ];

      for (const u of uoms) {
        await dbRun('INSERT IGNORE INTO uom (code, name, category, active) VALUES (?, ?, ?, 1)', [u.code, u.name, u.category]);
      }
      console.log('✅ Default UOMs created');
    }

    // Check and seed Product Types
    const ptCount = await dbGet('SELECT COUNT(*) as cnt FROM product_types');
    if (!ptCount || (ptCount as any).cnt === 0) {
      const types = [
        { code: 'RM', name: 'Raw Material' },
        { code: 'FG', name: 'Finished Product' },
        { code: 'WIP', name: 'Work In Progress' },
        { code: 'PKG', name: 'Packaging' },
        { code: 'SVC', name: 'Service' },
        { code: 'AST', name: 'Asset' }
      ];

      for (const t of types) {
        await dbRun('INSERT IGNORE INTO product_types (code, name, active) VALUES (?, ?, 1)', [t.code, t.name]);
      }
      console.log('✅ Default product types created');
    }

    // Check and seed Item Types (if table exists)
    try {
      const itCount = await dbGet('SELECT COUNT(*) as cnt FROM item_types');
      if (!itCount || (itCount as any).cnt === 0) {
        const types = [
          { code: 'INV', name: 'Inventory Item', track_inventory: 1 },
          { code: 'NON', name: 'Non-Inventory', track_inventory: 0 },
          { code: 'SVC', name: 'Service', track_inventory: 0 },
          { code: 'ASM', name: 'Assembly', track_inventory: 1 }
        ];

        for (const t of types) {
          await dbRun('INSERT IGNORE INTO item_types (code, name, track_inventory) VALUES (?, ?, ?)', [t.code, t.name, t.track_inventory]);
        }
        console.log('✅ Default item types created');
      }
    } catch (e) {
      // Table might not exist yet in some schema versions
      console.log('ℹ️  Skipping item_types seed (table may not exist)');
    }

    // Check and seed Warehouses
    const whCount = await dbGet('SELECT COUNT(*) as cnt FROM warehouses');
    if (!whCount || (whCount as any).cnt === 0) {
      await dbRun('INSERT IGNORE INTO warehouses (code, name, address, is_active) VALUES (?, ?, ?, 1)', ['WH-MAIN', 'Main Warehouse', 'Factory Complex A']);
      await dbRun('INSERT IGNORE INTO warehouses (code, name, address, is_active) VALUES (?, ?, ?, 1)', ['WH-RM', 'Raw Material Store', 'Factory Complex B']);
      console.log('✅ Default warehouses created');
    }

    // Check and seed System Settings
    const setCount = await dbGet('SELECT COUNT(*) as cnt FROM system_settings');
    if (!setCount || (setCount as any).cnt === 0) {
      const settings = [
        { key: 'company_name', value: 'My ERP Company', category: 'general', type: 'string' },
        { key: 'currency', value: 'IDR', category: 'finance', type: 'string' },
        { key: 'timezone', value: 'Asia/Jakarta', category: 'general', type: 'string' }
      ];

      for (const s of settings) {
        await dbRun(
          'INSERT IGNORE INTO system_settings (setting_key, setting_value, category, data_type) VALUES (?, ?, ?, ?)',
          [s.key, s.value, s.category, s.type]
        );
      }
      console.log('✅ Default system settings created');
    }
  } catch (error) {
    console.error('⚠️ Database seeding warning:', error);
  }
}

export default pool;
