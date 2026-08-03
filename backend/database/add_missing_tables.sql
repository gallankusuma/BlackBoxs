-- New tables for HR, Finance, Notifications, and System Settings

-- ===== HR MODULE TABLES =====

CREATE TABLE IF NOT EXISTS employees (
  id SERIAL PRIMARY KEY,
  employee_code VARCHAR(50) UNIQUE NOT NULL,
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  email VARCHAR(255) UNIQUE,
  phone VARCHAR(20),
  department_id INTEGER REFERENCES departments(id),
  position VARCHAR(100),
  hire_date DATE,
  user_id INTEGER REFERENCES users(id),
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS attendance_logs (
  id SERIAL PRIMARY KEY,
  employee_id INTEGER NOT NULL REFERENCES employees(id),
  attendance_date DATE NOT NULL,
  check_in_time TIMESTAMP,
  check_out_time TIMESTAMP,
  status VARCHAR(50), -- 'present', 'absent', 'late', 'half_day', 'leave'
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ===== FINANCE MODULE TABLES =====

CREATE TABLE IF NOT EXISTS cogs_tracking (
  id SERIAL PRIMARY KEY,
  batch_id INTEGER REFERENCES batches(id),
  product_id INTEGER NOT NULL REFERENCES products(id),
  raw_material_cost DECIMAL(14,4) DEFAULT 0,
  labor_cost DECIMAL(14,4) DEFAULT 0,
  overhead_cost DECIMAL(14,4) DEFAULT 0,
  total_cost DECIMAL(14,4) NOT NULL,
  quantity_produced DECIMAL(10,2),
  cost_per_unit DECIMAL(14,4),
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS profitability_tracking (
  id SERIAL PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id),
  period VARCHAR(10) NOT NULL, -- 'YYYY-MM'
  total_revenue DECIMAL(14,2) NOT NULL,
  total_cogs DECIMAL(14,2) NOT NULL,
  gross_profit DECIMAL(14,2),
  gross_margin_pct DECIMAL(5,2),
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS accounts_payable (
  id SERIAL PRIMARY KEY,
  po_id INTEGER NOT NULL REFERENCES purchase_orders(id),
  invoice_number VARCHAR(100),
  invoice_date DATE,
  due_date DATE,
  amount DECIMAL(14,2) NOT NULL,
  paid_amount DECIMAL(14,2) DEFAULT 0,
  status VARCHAR(50) DEFAULT 'open', -- 'open', 'partial', 'paid', 'overdue'
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS accounts_receivable (
  id SERIAL PRIMARY KEY,
  invoice_id INTEGER NOT NULL REFERENCES invoices(id),
  due_date DATE,
  amount DECIMAL(14,2) NOT NULL,
  paid_amount DECIMAL(14,2) DEFAULT 0,
  status VARCHAR(50) DEFAULT 'open', -- 'open', 'partial', 'paid', 'overdue'
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS financial_summary (
  id SERIAL PRIMARY KEY,
  period_date DATE NOT NULL,
  total_revenue DECIMAL(14,2),
  total_expenses DECIMAL(14,2),
  total_cogs DECIMAL(14,2),
  gross_profit DECIMAL(14,2),
  net_profit DECIMAL(14,2),
  profit_margin_pct DECIMAL(5,2),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ===== NOTIFICATIONS TABLE =====

CREATE TABLE IF NOT EXISTS notifications (
  id SERIAL PRIMARY KEY,
  recipient_id INTEGER NOT NULL REFERENCES users(id),
  sender_id INTEGER REFERENCES users(id),
  title VARCHAR(255),
  message TEXT NOT NULL,
  type VARCHAR(100) NOT NULL, -- 'approval', 'alert', 'info', 'error', 'warning'
  related_entity_type VARCHAR(100),
  related_entity_id INTEGER,
  action_url VARCHAR(255),
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ===== SYSTEM SETTINGS TABLE =====

CREATE TABLE IF NOT EXISTS system_settings (
  id SERIAL PRIMARY KEY,
  setting_key VARCHAR(100) UNIQUE NOT NULL,
  setting_value TEXT,
  category VARCHAR(100) DEFAULT 'general', -- 'general', 'approval', 'finance', 'inventory', 'production'
  description TEXT,
  data_type VARCHAR(50) DEFAULT 'string', -- 'string', 'integer', 'decimal', 'boolean', 'json'
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ===== UPDATE AUDIT LOG TABLE =====

-- Add columns to audit_log if they don't exist
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS entity_type VARCHAR(100);
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS entity_id INTEGER;
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS old_values JSON;
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS new_values JSON;
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS metadata JSON;

-- ===== INDEXES FOR NEW TABLES =====

CREATE INDEX IF NOT EXISTS idx_employees_dept_id ON employees(department_id);
CREATE INDEX IF NOT EXISTS idx_employees_user_id ON employees(user_id);
CREATE INDEX IF NOT EXISTS idx_attendance_employee_id ON attendance_logs(employee_id);
CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendance_logs(attendance_date);
CREATE INDEX IF NOT EXISTS idx_cogs_batch_id ON cogs_tracking(batch_id);
CREATE INDEX IF NOT EXISTS idx_cogs_product_id ON cogs_tracking(product_id);
CREATE INDEX IF NOT EXISTS idx_profitability_product_id ON profitability_tracking(product_id);
CREATE INDEX IF NOT EXISTS idx_profitability_period ON profitability_tracking(period);
CREATE INDEX IF NOT EXISTS idx_ap_po_id ON accounts_payable(po_id);
CREATE INDEX IF NOT EXISTS idx_ap_status ON accounts_payable(status);
CREATE INDEX IF NOT EXISTS idx_ar_invoice_id ON accounts_receivable(invoice_id);
CREATE INDEX IF NOT EXISTS idx_ar_status ON accounts_receivable(status);
CREATE INDEX IF NOT EXISTS idx_notifications_recipient_id ON notifications(recipient_id);
CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON notifications(is_read);
CREATE INDEX IF NOT EXISTS idx_audit_log_user_id ON audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_entity ON audit_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_action ON audit_log(action);
CREATE INDEX IF NOT EXISTS idx_system_settings_key ON system_settings(setting_key);
CREATE INDEX IF NOT EXISTS idx_system_settings_category ON system_settings(category);
