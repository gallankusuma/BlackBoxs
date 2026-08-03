-- SQLite Schema for ERP Manufacturing System
-- Simplified version with essential tables

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email VARCHAR(255) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  name VARCHAR(255) NOT NULL,
  role VARCHAR(50) DEFAULT 'user',
  user_level INTEGER DEFAULT 1,  -- 1=Staff, 2=Supervisor, 3=Manager, 4=Admin
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Categories table
CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name VARCHAR(255) NOT NULL,
  code VARCHAR(50) UNIQUE,
  description TEXT,
  is_active BOOLEAN DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Item Types table
CREATE TABLE IF NOT EXISTS item_types (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code VARCHAR(50) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  track_inventory BOOLEAN DEFAULT 1,
  is_active BOOLEAN DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Product Types table
CREATE TABLE IF NOT EXISTS product_types (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code VARCHAR(50) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Products table
CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sku VARCHAR(100) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  product_type VARCHAR(50) DEFAULT 'raw_material',
  description TEXT,
  unit_of_measure VARCHAR(50),
  category_id INTEGER,
  item_type_id INTEGER,
  product_type_id INTEGER,
  density REAL,
  standard_cost REAL,
  is_active BOOLEAN DEFAULT 1,
  status VARCHAR(50) DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (category_id) REFERENCES categories(id),
  FOREIGN KEY (item_type_id) REFERENCES item_types(id),
  FOREIGN KEY (product_type_id) REFERENCES product_types(id)
);

-- Bill of Materials (BOM) table
CREATE TABLE IF NOT EXISTS bom (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL,
  component_product_id INTEGER NOT NULL,
  quantity REAL NOT NULL,
  unit VARCHAR(50),
  loss_percent REAL DEFAULT 0,
  is_sub_bom BOOLEAN DEFAULT 0,
  notes TEXT,
  version VARCHAR(50) DEFAULT 'V1.0',
  effective_date DATE,
  approval_status INTEGER DEFAULT 0,  -- 0=Pending, 1=Supervisor Approved, 2=Manager Approved
  approved_by_supervisor_id INTEGER,
  approved_by_manager_id INTEGER,
  approved_at_supervisor TIMESTAMP,
  approved_at_manager TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
  FOREIGN KEY (component_product_id) REFERENCES products(id),
  FOREIGN KEY (approved_by_supervisor_id) REFERENCES users(id),
  FOREIGN KEY (approved_by_manager_id) REFERENCES users(id)
);

-- Warehouses
CREATE TABLE IF NOT EXISTS warehouses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code VARCHAR(50) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  address TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Warehouse locations
CREATE TABLE IF NOT EXISTS warehouse_locations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  warehouse_id INTEGER NOT NULL,
  location_code VARCHAR(100) NOT NULL,
  rack VARCHAR(50),
  row VARCHAR(50),
  bin VARCHAR(50),
  capacity REAL,
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (warehouse_id) REFERENCES warehouses(id) ON DELETE CASCADE,
  UNIQUE(warehouse_id, location_code)
);

-- Inventory table
CREATE TABLE IF NOT EXISTS inventory (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL,
  warehouse_id INTEGER,
  location_id INTEGER,
  batch_id INTEGER,
  quantity REAL NOT NULL DEFAULT 0,
  location VARCHAR(255),
  minimum_quantity REAL DEFAULT 0,
  maximum_quantity REAL,
  last_counted TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (product_id) REFERENCES products(id),
  FOREIGN KEY (warehouse_id) REFERENCES warehouses(id),
  FOREIGN KEY (location_id) REFERENCES warehouse_locations(id)
);

-- Inventory Transactions table
CREATE TABLE IF NOT EXISTS inventory_transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL,
  transaction_type VARCHAR(50) NOT NULL,
  quantity REAL NOT NULL,
  reference_type VARCHAR(50),
  reference_id INTEGER,
  notes TEXT,
  created_by INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (product_id) REFERENCES products(id),
  FOREIGN KEY (created_by) REFERENCES users(id)
);

-- Batches
CREATE TABLE IF NOT EXISTS batches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  batch_number VARCHAR(100) UNIQUE NOT NULL,
  product_id INTEGER NOT NULL,
  work_order_id INTEGER,
  quantity REAL NOT NULL,
  uom VARCHAR(50),
  mfg_date DATE NOT NULL,
  exp_date DATE,
  status VARCHAR(50) DEFAULT 'open',
  qc_status VARCHAR(50) DEFAULT 'pending',
  location_id INTEGER,
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (product_id) REFERENCES products(id),
  FOREIGN KEY (location_id) REFERENCES warehouse_locations(id)
);

-- Work Orders table
CREATE TABLE IF NOT EXISTS work_orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  wo_number VARCHAR(100) UNIQUE NOT NULL,
  product_id INTEGER NOT NULL,
  quantity REAL NOT NULL,
  status VARCHAR(50) DEFAULT 'draft',
  priority VARCHAR(50) DEFAULT 'normal',
  scheduled_start TIMESTAMP,
  scheduled_end TIMESTAMP,
  actual_start TIMESTAMP,
  actual_end TIMESTAMP,
  notes TEXT,
  created_by INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (product_id) REFERENCES products(id),
  FOREIGN KEY (created_by) REFERENCES users(id)
);

-- Departments
CREATE TABLE IF NOT EXISTS departments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code VARCHAR(50) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Roles
CREATE TABLE IF NOT EXISTS roles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name VARCHAR(100) UNIQUE NOT NULL,
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Permissions
CREATE TABLE IF NOT EXISTS permissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name VARCHAR(100) UNIQUE NOT NULL,
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- QC Tests
CREATE TABLE IF NOT EXISTS qc_tests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  test_code VARCHAR(50) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  product_category VARCHAR(100),
  test_type VARCHAR(50),
  specification TEXT,
  is_active BOOLEAN DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- QC Results
CREATE TABLE IF NOT EXISTS qc_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  batch_id INTEGER NOT NULL,
  test_id INTEGER NOT NULL,
  result TEXT,
  status VARCHAR(50) DEFAULT 'pending',
  tested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  tester_id INTEGER,
  notes TEXT,
  FOREIGN KEY (batch_id) REFERENCES batches(id),
  FOREIGN KEY (test_id) REFERENCES qc_tests(id),
  FOREIGN KEY (tester_id) REFERENCES users(id)
);

-- Vendors
CREATE TABLE IF NOT EXISTS vendors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  contact TEXT,
  phone TEXT,
  email TEXT,
  address TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Purchase Requests (PR) with approval
CREATE TABLE IF NOT EXISTS purchase_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pr_number TEXT UNIQUE NOT NULL,
  requester_id INTEGER,
  department TEXT,
  request_date DATE,
  needed_by DATE,
  reason TEXT,
  status TEXT DEFAULT 'draft',
  approval_status INTEGER DEFAULT 0,
  approved_by_supervisor_id INTEGER,
  approved_by_manager_id INTEGER,
  approved_at_supervisor TIMESTAMP,
  approved_at_manager TIMESTAMP,
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (requester_id) REFERENCES users(id),
  FOREIGN KEY (approved_by_supervisor_id) REFERENCES users(id),
  FOREIGN KEY (approved_by_manager_id) REFERENCES users(id)
);

-- Purchase Request Items
CREATE TABLE IF NOT EXISTS purchase_request_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pr_id INTEGER NOT NULL,
  product_id INTEGER NOT NULL,
  quantity REAL NOT NULL,
  uom TEXT,
  estimated_price REAL,
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (pr_id) REFERENCES purchase_requests(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id)
);

-- Purchase Orders (PO) with approval
CREATE TABLE IF NOT EXISTS purchase_orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  po_number TEXT UNIQUE NOT NULL,
  vendor_id INTEGER NOT NULL,
  pr_id INTEGER,
  status TEXT DEFAULT 'draft',
  approval_status INTEGER DEFAULT 0,
  approved_by_supervisor_id INTEGER,
  approved_by_manager_id INTEGER,
  approved_at_supervisor TIMESTAMP,
  approved_at_manager TIMESTAMP,
  expected_date TIMESTAMP,
  currency TEXT DEFAULT 'IDR',
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (vendor_id) REFERENCES vendors(id),
  FOREIGN KEY (pr_id) REFERENCES purchase_requests(id),
  FOREIGN KEY (approved_by_supervisor_id) REFERENCES users(id),
  FOREIGN KEY (approved_by_manager_id) REFERENCES users(id)
);

-- Purchase Order Items
CREATE TABLE IF NOT EXISTS purchase_order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  po_id INTEGER NOT NULL,
  product_id INTEGER NOT NULL,
  quantity REAL NOT NULL,
  uom TEXT,
  unit_price REAL,
  currency TEXT DEFAULT 'IDR',
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (po_id) REFERENCES purchase_orders(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id)
);

-- Goods Receipts (linked to PO)
CREATE TABLE IF NOT EXISTS goods_receipts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  gr_number TEXT UNIQUE NOT NULL,
  po_id INTEGER,
  warehouse_id INTEGER,
  received_by INTEGER,
  status TEXT DEFAULT 'draft',
  received_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  notes TEXT,
  FOREIGN KEY (po_id) REFERENCES purchase_orders(id),
  FOREIGN KEY (warehouse_id) REFERENCES warehouses(id),
  FOREIGN KEY (received_by) REFERENCES users(id)
);

-- Goods Receipt Items (optional detail per item)
CREATE TABLE IF NOT EXISTS goods_receipt_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  gr_id INTEGER NOT NULL,
  po_item_id INTEGER,
  product_id INTEGER NOT NULL,
  received_qty REAL NOT NULL,
  uom TEXT,
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (gr_id) REFERENCES goods_receipts(id) ON DELETE CASCADE,
  FOREIGN KEY (po_item_id) REFERENCES purchase_order_items(id),
  FOREIGN KEY (product_id) REFERENCES products(id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_products_sku ON products(sku);
CREATE INDEX IF NOT EXISTS idx_products_status ON products(status);
CREATE INDEX IF NOT EXISTS idx_bom_product_id ON bom(product_id);
CREATE INDEX IF NOT EXISTS idx_bom_approval ON bom(approval_status);
CREATE INDEX IF NOT EXISTS idx_inventory_product_id ON inventory(product_id);
CREATE INDEX IF NOT EXISTS idx_batches_number ON batches(batch_number);
CREATE INDEX IF NOT EXISTS idx_batches_status ON batches(status);

-- Insert default data
INSERT OR IGNORE INTO item_types (code, name, description, track_inventory) VALUES
('INV', 'Inventory Item', 'Physical items tracked in inventory (raw materials, finished goods)', 1),
('NON-INV', 'Non-Inventory Item', 'Services, fees, or non-physical items not tracked in inventory', 0);

INSERT OR IGNORE INTO product_types (code, name, description) VALUES
('RM', 'Raw Material', 'Raw materials for production'),
('FG', 'Finished Goods', 'Finished products ready for sale'),
('PKG', 'Packaging', 'Packaging materials'),
('SFG', 'Semi-Finished Goods', 'Work in progress items');

INSERT OR IGNORE INTO categories (name, code, description) VALUES
('General', 'GEN', 'General category for uncategorized products');

-- Insert test users with different levels
-- Password for all: 'password123' (bcrypt hashed)
INSERT OR IGNORE INTO users (email, password, name, role, user_level) VALUES
('admin@test.com', '$2b$10$rKY8P7VYnZ0JQBqKN/u.qO9GvY4WbFQ9EZM3w.TkZfN0H2hDQi1w6', 'Admin User', 'admin', 4),
('manager@test.com', '$2b$10$rKY8P7VYnZ0JQBqKN/u.qO9GvY4WbFQ9EZM3w.TkZfN0H2hDQi1w6', 'Manager User', 'manager', 3),
('supervisor@test.com', '$2b$10$rKY8P7VYnZ0JQBqKN/u.qO9GvY4WbFQ9EZM3w.TkZfN0H2hDQi1w6', 'Supervisor User', 'supervisor', 2),
('staff@test.com', '$2b$10$rKY8P7VYnZ0JQBqKN/u.qO9GvY4WbFQ9EZM3w.TkZfN0H2hDQi1w6', 'Staff User', 'user', 1);
