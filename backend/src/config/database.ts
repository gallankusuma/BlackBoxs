import path from 'path';
import dotenv from 'dotenv';
import mysql from 'mysql2/promise';
import bcrypt from 'bcrypt';

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

// Initialize database schema
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

      console.log('✅ Database schema initialized successfully');
    } catch (fileErr) {
      console.log('⚠️ Schema file not found, using existing database');
    }

    await ensureProcurementPaymentSchema(connection);
    await ensureRnDSchema(connection);
    await ensureApprovalPermissions(connection);
    await ensureAssetManagementSchema(connection);

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
      const hashedPassword = await bcrypt.hash('admin123', 10);
      await dbRun(
        `INSERT INTO users (username, email, password, full_name, role_id, is_active)
         VALUES (?, ?, ?, ?, ?, ?)`,
        ['admin', 'admin@erp.local', hashedPassword, 'System Administrator', adminRole.insertId || 1, 1]
      );
      console.log('✅ Default admin user created (username: admin, password: admin123)');
    }

    // Create super admin user (master@admin.com) - Hardcoded
    const masterUser = await dbGet(
      'SELECT id FROM users WHERE email = ?',
      ['master@admin.com']
    );

    if (!masterUser) {
      const masterPassword = await bcrypt.hash('master', 10);
      await dbRun(
        `INSERT INTO users (username, email, password, full_name, role_id, is_active)
         VALUES (?, ?, ?, ?, ?, ?)`,
        ['master', 'master@admin.com', masterPassword, 'Super Administrator', adminRole.insertId || 1, 1]
      );
      console.log('✅ Super admin user created (email: master@admin.com, password: master)');
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
