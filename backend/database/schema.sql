-- ERP Manufacturing Database Schema
-- PostgreSQL version

-- Users table
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  name VARCHAR(255) NOT NULL,
  role VARCHAR(50) DEFAULT 'user',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Products table
CREATE TABLE products (
  id SERIAL PRIMARY KEY,
  sku VARCHAR(100) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  product_type VARCHAR(50) DEFAULT 'raw_material', -- 'raw_material', 'finished_goods', 'packaging'
  description TEXT,
  unit_of_measure VARCHAR(50),
  category VARCHAR(100),
  density DECIMAL(10, 4), -- kg/L for volume-weight conversion
  standard_cost DECIMAL(12, 4), -- standard cost per UoM
  is_active BOOLEAN DEFAULT TRUE,
  status VARCHAR(50) DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Bill of Materials (BOM) table
CREATE TABLE bom (
  id SERIAL PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  component_product_id INTEGER NOT NULL REFERENCES products(id),
  quantity DECIMAL(10, 4) NOT NULL,
  unit VARCHAR(50),
  loss_percent DECIMAL(5, 2) DEFAULT 0, -- expected loss percentage
  is_sub_bom BOOLEAN DEFAULT FALSE, -- whether this is a sub-assembly
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Work Orders table
CREATE TABLE work_orders (
  id SERIAL PRIMARY KEY,
  wo_number VARCHAR(100) UNIQUE NOT NULL,
  product_id INTEGER NOT NULL REFERENCES products(id),
  quantity DECIMAL(10, 2) NOT NULL,
  status VARCHAR(50) DEFAULT 'draft', -- 'draft', 'released', 'in_progress', 'completed', 'closed', 'cancelled'
  priority VARCHAR(50) DEFAULT 'normal',
  scheduled_start TIMESTAMP,
  scheduled_end TIMESTAMP,
  actual_start TIMESTAMP,
  actual_end TIMESTAMP,
  notes TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Work Order Materials (planned vs actual consumption)
CREATE TABLE wo_materials (
  id SERIAL PRIMARY KEY,
  wo_id INTEGER NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id),
  planned_qty DECIMAL(12, 4) NOT NULL,
  actual_qty DECIMAL(12, 4) DEFAULT 0,
  uom VARCHAR(50),
  batch_id INTEGER REFERENCES batches(id),
  status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'issued', 'consumed'
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Work Order Process Log (timestamps, operators, activities)
CREATE TABLE wo_process_log (
  id SERIAL PRIMARY KEY,
  wo_id INTEGER NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
  activity VARCHAR(255) NOT NULL,
  operator_id INTEGER REFERENCES users(id),
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Work Order Results (actual output by batch)
CREATE TABLE wo_results (
  id SERIAL PRIMARY KEY,
  wo_id INTEGER NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
  batch_id INTEGER REFERENCES batches(id),
  output_qty DECIMAL(12, 4) NOT NULL,
  uom VARCHAR(50),
  yield_percent DECIMAL(5, 2),
  status VARCHAR(50) DEFAULT 'pending_qc', -- 'pending_qc', 'approved', 'rejected', 'rework'
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Inventory table
CREATE TABLE inventory (
  id SERIAL PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id),
  warehouse_id INTEGER REFERENCES warehouses(id),
  location_id INTEGER REFERENCES warehouse_locations(id),
  batch_id INTEGER REFERENCES batches(id),
  quantity DECIMAL(10, 4) NOT NULL DEFAULT 0,
  location VARCHAR(255),
  minimum_quantity DECIMAL(10, 4) DEFAULT 0,
  maximum_quantity DECIMAL(10, 4),
  last_counted TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Inventory Transactions table
CREATE TABLE inventory_transactions (
  id SERIAL PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id),
  transaction_type VARCHAR(50) NOT NULL, -- 'in', 'out', 'adjustment'
  quantity DECIMAL(10, 4) NOT NULL,
  reference_type VARCHAR(50), -- 'work_order', 'purchase', 'sale', 'adjustment'
  reference_id INTEGER,
  notes TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Warehouses
CREATE TABLE warehouses (
  id SERIAL PRIMARY KEY,
  code VARCHAR(50) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  address TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
-- Warehouse locations
CREATE TABLE warehouse_locations (
  id SERIAL PRIMARY KEY,
  warehouse_id INTEGER NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
  location_code VARCHAR(100) NOT NULL,
  rack VARCHAR(50),
  row VARCHAR(50),
  bin VARCHAR(50),
  capacity DECIMAL(10, 2),
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(warehouse_id, location_code)
);created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(warehouse_id, code)
);

-- Stock movements
CREATE TABLE stock_movements (
  id SERIAL PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id),
  warehouse_id INTEGER NOT NULL REFERENCES warehouses(id),
  location_id INTEGER REFERENCES warehouse_locations(id),
  batch_id INTEGER REFERENCES batches(id),
  movement_type VARCHAR(20) NOT NULL,
  quantity DECIMAL(12,4) NOT NULL,
  uom VARCHAR(50),
  reference_type VARCHAR(50),
  reference_id INTEGER,
  notes TEXT,
  moved_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Vendors
CREATE TABLE vendors (
  id SERIAL PRIMARY KEY,
  code VARCHAR(50) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  contact VARCHAR(255),
-- Purchase Requests
CREATE TABLE purchase_requests (
  id SERIAL PRIMARY KEY,
  pr_number VARCHAR(100) UNIQUE NOT NULL,
  requester_id INTEGER REFERENCES users(id),
  department VARCHAR(100),
  request_date DATE NOT NULL,
  needed_by DATE,
  reason TEXT,
  status VARCHAR(50) DEFAULT 'draft', -- 'draft', 'pending_approval', 'approved', 'rejected', 'closed'
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Purchase Request Items
CREATE TABLE purchase_request_items (
  id SERIAL PRIMARY KEY,
  pr_id INTEGER NOT NULL REFERENCES purchase_requests(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id),
  quantity DECIMAL(12,4) NOT NULL,
  uom VARCHAR(50),
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);id SERIAL PRIMARY KEY,
  pr_number VARCHAR(100) UNIQUE NOT NULL,
  requester_id INTEGER REFERENCES users(id),
  status VARCHAR(50) DEFAULT 'draft',
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Purchase Orders
CREATE TABLE purchase_orders (
  id SERIAL PRIMARY KEY,
  po_number VARCHAR(100) UNIQUE NOT NULL,
  vendor_id INTEGER NOT NULL REFERENCES vendors(id),
  pr_id INTEGER REFERENCES purchase_requests(id),
  status VARCHAR(50) DEFAULT 'draft',
  expected_date TIMESTAMP,
-- Goods Receipts
CREATE TABLE goods_receipts (
  id SERIAL PRIMARY KEY,
  gr_number VARCHAR(100) UNIQUE NOT NULL,
  po_id INTEGER REFERENCES purchase_orders(id),
  warehouse_id INTEGER REFERENCES warehouses(id),
  received_by INTEGER REFERENCES users(id),
  receipt_date DATE NOT NULL,
  status VARCHAR(50) DEFAULT 'draft',
  received_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  reference_doc VARCHAR(255),
  notes TEXT
);

-- Goods Receipt Items
CREATE TABLE goods_receipt_items (
  id SERIAL PRIMARY KEY,
  gr_id INTEGER NOT NULL REFERENCES goods_receipts(id) ON DELETE CASCADE,
  po_item_id INTEGER REFERENCES purchase_order_items(id),
  product_id INTEGER NOT NULL REFERENCES products(id),
  received_qty DECIMAL(12,4) NOT NULL,
  uom VARCHAR(50),
  batch_number VARCHAR(100),
  mfg_date DATE,
  exp_date DATE,
  location_id INTEGER REFERENCES warehouse_locations(id),
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);product_id INTEGER NOT NULL REFERENCES products(id),
  quantity DECIMAL(12,4) NOT NULL,
  uom VARCHAR(50),
  unit_price DECIMAL(12,4),
  currency VARCHAR(10) DEFAULT 'IDR',
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Goods Receipts
CREATE TABLE goods_receipts (
  id SERIAL PRIMARY KEY,
  gr_number VARCHAR(100) UNIQUE NOT NULL,
  po_id INTEGER REFERENCES purchase_orders(id),
  warehouse_id INTEGER REFERENCES warehouses(id),
  received_by INTEGER REFERENCES users(id),
  status VARCHAR(50) DEFAULT 'draft',
  received_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  notes TEXT
);

-- Customers
CREATE TABLE customers (
  id SERIAL PRIMARY KEY,
  code VARCHAR(50) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  contact VARCHAR(255),
  phone VARCHAR(50),
  email VARCHAR(255),
  address TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Sales Orders
CREATE TABLE sales_orders (
  id SERIAL PRIMARY KEY,
  so_number VARCHAR(100) UNIQUE NOT NULL,
  customer_id INTEGER NOT NULL REFERENCES customers(id),
  status VARCHAR(50) DEFAULT 'draft',
  expected_ship_date TIMESTAMP,
  currency VARCHAR(10) DEFAULT 'IDR',
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Sales Order Items
CREATE TABLE sales_order_items (
  id SERIAL PRIMARY KEY,
  so_id INTEGER NOT NULL REFERENCES sales_orders(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id),
  quantity DECIMAL(12,4) NOT NULL,
  uom VARCHAR(50),
  unit_price DECIMAL(12,4),
  currency VARCHAR(10) DEFAULT 'IDR',
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Deliveries
CREATE TABLE deliveries (
  id SERIAL PRIMARY KEY,
  do_number VARCHAR(100) UNIQUE NOT NULL,
  so_id INTEGER REFERENCES sales_orders(id),
  warehouse_id INTEGER REFERENCES warehouses(id),
  status VARCHAR(50) DEFAULT 'draft',
  shipped_at TIMESTAMP,
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Delivery Items
CREATE TABLE delivery_items (
  id SERIAL PRIMARY KEY,
  do_id INTEGER NOT NULL REFERENCES deliveries(id) ON DELETE CASCADE,
  so_item_id INTEGER REFERENCES sales_order_items(id),
  product_id INTEGER NOT NULL REFERENCES products(id),
  batch_id INTEGER REFERENCES batches(id),
  shipped_qty DECIMAL(12,4) NOT NULL,
  uom VARCHAR(50),
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Invoices
CREATE TABLE invoices (
  id SERIAL PRIMARY KEY,
  invoice_number VARCHAR(100) UNIQUE NOT NULL,
  so_id INTEGER REFERENCES sales_orders(id),
  amount DECIMAL(14,2) NOT NULL,
  currency VARCHAR(10) DEFAULT 'IDR',
  status VARCHAR(50) DEFAULT 'unpaid',
  issued_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  due_at TIMESTAMP,
  notes TEXT
);

-- Batches
CREATE TABLE batches (
  id SERIAL PRIMARY KEY,
  batch_number VARCHAR(100) UNIQUE NOT NULL,
  product_id INTEGER NOT NULL REFERENCES products(id),
  work_order_id INTEGER REFERENCES work_orders(id),
  quantity DECIMAL(12, 4) NOT NULL,
  uom VARCHAR(50),
  mfg_date DATE NOT NULL,
  exp_date DATE,
  status VARCHAR(50) DEFAULT 'open', -- 'open', 'in_qc', 'approved', 'rejected', 'released', 'closed'
  qc_status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'passed', 'failed'
  location_id INTEGER REFERENCES warehouse_locations(id),
-- QC Tests (master)
CREATE TABLE qc_tests (
  id SERIAL PRIMARY KEY,
  test_code VARCHAR(50) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  product_category VARCHAR(100), -- applicable to which product category
  test_type VARCHAR(50), -- 'physical', 'chemical', 'microbiological'
  specification TEXT, -- expected values/ranges
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
-- QC Results (per batch)
CREATE TABLE qc_results (
  id SERIAL PRIMARY KEY,
  batch_id INTEGER NOT NULL REFERENCES batches(id),
  test_id INTEGER NOT NULL REFERENCES qc_tests(id),
  measured_value DECIMAL(12, 4),
  result_text TEXT,
  status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'passed', 'failed', 'conditional'
  tested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  tested_by INTEGER REFERENCES users(id),
  approved_by INTEGER REFERENCES users(id),
  approved_at TIMESTAMP,
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(product_id, test_id)
);name VARCHAR(255) NOT NULL,
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- QC Results (per batch)
CREATE TABLE qc_results (
  id SERIAL PRIMARY KEY,
  batch_id INTEGER NOT NULL REFERENCES batches(id),
  test_id INTEGER NOT NULL REFERENCES qc_tests(id),
  result TEXT,
  status VARCHAR(50) DEFAULT 'pending',
  tested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  tester_id INTEGER REFERENCES users(id),
  notes TEXT
);

-- Roles & Permissions
CREATE TABLE roles (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) UNIQUE NOT NULL,
  description TEXT,
-- Approval rules
CREATE TABLE approval_rules (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  module VARCHAR(100) NOT NULL, -- 'pr', 'po', 'wo', 'so', 'batch_release'
  condition_field VARCHAR(100), -- e.g., 'amount', 'quantity'
  min_value DECIMAL(14,2),
  max_value DECIMAL(14,2),
  approver_role_id INTEGER REFERENCES roles(id),
  sequence INTEGER DEFAULT 1,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Approval rule steps (multi-level approvals)
CREATE TABLE approval_rule_steps (
  id SERIAL PRIMARY KEY,
  rule_id INTEGER NOT NULL REFERENCES approval_rules(id) ON DELETE CASCADE,
  step_order INTEGER NOT NULL,
  approver_role_id INTEGER REFERENCES roles(id),
  approver_user_id INTEGER REFERENCES users(id), -- optional specific approver
  can_reject BOOLEAN DEFAULT TRUE,
  is_parallel BOOLEAN DEFAULT FALSE, -- if true, all approvers at this step must approve
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Approval requests (generic approval tracking)
CREATE TABLE approval_requests (
  id SERIAL PRIMARY KEY,
  request_number VARCHAR(100) UNIQUE NOT NULL,
  module VARCHAR(100) NOT NULL,
  entity_type VARCHAR(100) NOT NULL, -- 'purchase_request', 'purchase_order', etc.
  entity_id INTEGER NOT NULL,
  requester_id INTEGER REFERENCES users(id),
  current_step INTEGER DEFAULT 1,
  status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'approved', 'rejected', 'cancelled'
  submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP,
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Approval actions (who approved/rejected when)
CREATE TABLE approval_actions (
  id SERIAL PRIMARY KEY,
  request_id INTEGER NOT NULL REFERENCES approval_requests(id) ON DELETE CASCADE,
  step_order INTEGER NOT NULL,
  approver_id INTEGER REFERENCES users(id),
  action VARCHAR(50) NOT NULL, -- 'approved', 'rejected', 'returned'
  comments TEXT,
  acted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE role_permissions (
  role_id INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id INTEGER NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE user_roles (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, role_id)
);

-- Approval rules
CREATE TABLE approval_rules (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  module VARCHAR(100) NOT NULL,
  min_amount DECIMAL(14,2),
  max_amount DECIMAL(14,2),
  approver_role_id INTEGER REFERENCES roles(id),
  sequence INTEGER DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Audit log
CREATE TABLE audit_log (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  action VARCHAR(255) NOT NULL,
  entity VARCHAR(100),
  entity_id INTEGER,
  metadata TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for better query performance
CREATE INDEX idx_products_sku ON products(sku);
CREATE INDEX idx_products_status ON products(status);
CREATE INDEX idx_products_type ON products(product_type);
CREATE INDEX idx_bom_product_id ON bom(product_id);
CREATE INDEX idx_work_orders_status ON work_orders(status);
CREATE INDEX idx_work_orders_product_id ON work_orders(product_id);
CREATE INDEX idx_work_orders_wo_number ON work_orders(wo_number);
CREATE INDEX idx_wo_materials_wo_id ON wo_materials(wo_id);
CREATE INDEX idx_wo_materials_batch_id ON wo_materials(batch_id);
CREATE INDEX idx_wo_results_wo_id ON wo_results(wo_id);
CREATE INDEX idx_wo_results_batch_id ON wo_results(batch_id);
CREATE INDEX idx_inventory_product_id ON inventory(product_id);
CREATE INDEX idx_inventory_batch_id ON inventory(batch_id);
CREATE INDEX idx_inventory_location_id ON inventory(location_id);
CREATE INDEX idx_inventory_transactions_product_id ON inventory_transactions(product_id);
CREATE INDEX idx_inventory_transactions_type ON inventory_transactions(transaction_type);
CREATE INDEX idx_batches_number ON batches(batch_number);
CREATE INDEX idx_batches_product_id ON batches(product_id);
CREATE INDEX idx_batches_status ON batches(status);
CREATE INDEX idx_batches_qc_status ON batches(qc_status);
CREATE INDEX idx_batches_exp_date ON batches(exp_date);
CREATE INDEX idx_batches_mfg_date ON batches(mfg_date);
CREATE INDEX idx_qc_results_batch_id ON qc_results(batch_id);
CREATE INDEX idx_qc_results_status ON qc_results(status);
CREATE INDEX idx_stock_movements_batch_id ON stock_movements(batch_id);
CREATE INDEX idx_stock_movements_product_id ON stock_movements(product_id);
CREATE INDEX idx_approval_requests_status ON approval_requests(status);
CREATE INDEX idx_approval_requests_entity ON approval_requests(entity_type, entity_id);

-- ============================================
-- CRM / Clients Management Tables
-- ============================================

-- Clients table
CREATE TABLE IF NOT EXISTS clients (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255),
  phone VARCHAR(50),
  address TEXT,
  city VARCHAR(100),
  state VARCHAR(100),
  postal_code VARCHAR(20),
  country VARCHAR(100),
  website VARCHAR(255),
  tax_id VARCHAR(100),
  client_group VARCHAR(50),
  label VARCHAR(50),
  status VARCHAR(20) DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Contacts table
CREATE TABLE IF NOT EXISTS contacts (
  id SERIAL PRIMARY KEY,
  client_id INTEGER REFERENCES clients(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  job_title VARCHAR(255),
  email VARCHAR(255),
  phone VARCHAR(50),
  is_primary BOOLEAN DEFAULT FALSE,
  last_contact_date TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Projects table (if not exists)
CREATE TABLE IF NOT EXISTS projects (
  id SERIAL PRIMARY KEY,
  client_id INTEGER REFERENCES clients(id) ON DELETE SET NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  status VARCHAR(50) DEFAULT 'open',
  start_date DATE,
  end_date DATE,
  budget DECIMAL(15, 2),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Invoices table (if not exists)
CREATE TABLE IF NOT EXISTS invoices (
  id SERIAL PRIMARY KEY,
  client_id INTEGER REFERENCES clients(id) ON DELETE SET NULL,
  invoice_number VARCHAR(50) UNIQUE NOT NULL,
  total_amount DECIMAL(15, 2) NOT NULL DEFAULT 0,
  paid_amount DECIMAL(15, 2) NOT NULL DEFAULT 0,
  status VARCHAR(20) DEFAULT 'unpaid',
  due_date DATE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Estimates table (if not exists)
CREATE TABLE IF NOT EXISTS estimates (
  id SERIAL PRIMARY KEY,
  client_id INTEGER REFERENCES clients(id) ON DELETE SET NULL,
  estimate_number VARCHAR(50) UNIQUE NOT NULL,
  total_amount DECIMAL(15, 2) NOT NULL DEFAULT 0,
  status VARCHAR(20) DEFAULT 'new',
  valid_until DATE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Proposals table (if not exists)
CREATE TABLE IF NOT EXISTS proposals (
  id SERIAL PRIMARY KEY,
  client_id INTEGER REFERENCES clients(id) ON DELETE SET NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  total_amount DECIMAL(15, 2),
  status VARCHAR(20) DEFAULT 'open',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tickets table (if not exists)
CREATE TABLE IF NOT EXISTS tickets (
  id SERIAL PRIMARY KEY,
  client_id INTEGER REFERENCES clients(id) ON DELETE SET NULL,
  subject VARCHAR(255) NOT NULL,
  description TEXT,
  status VARCHAR(20) DEFAULT 'open',
  priority VARCHAR(20) DEFAULT 'medium',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Orders table (if not exists)
CREATE TABLE IF NOT EXISTS orders (
  id SERIAL PRIMARY KEY,
  client_id INTEGER REFERENCES clients(id) ON DELETE SET NULL,
  order_number VARCHAR(50) UNIQUE NOT NULL,
  total_amount DECIMAL(15, 2) NOT NULL DEFAULT 0,
  status VARCHAR(20) DEFAULT 'new',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_clients_status ON clients(status);
CREATE INDEX idx_clients_group ON clients(client_group);
CREATE INDEX idx_contacts_client_id ON contacts(client_id);
CREATE INDEX idx_projects_client_id ON projects(client_id);
CREATE INDEX idx_invoices_client_id ON invoices(client_id);
CREATE INDEX idx_estimates_client_id ON estimates(client_id);
CREATE INDEX idx_proposals_client_id ON proposals(client_id);
CREATE INDEX idx_tickets_client_id ON tickets(client_id);
CREATE INDEX idx_orders_client_id ON orders(client_id);

