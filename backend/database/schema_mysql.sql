-- MySQL Database Schema for Manufacturing ERP
-- Created for MySQL 5.7+
-- Run this migration script to set up all required tables

SET FOREIGN_KEY_CHECKS = 0;

-- ====== MASTER DATA TABLES ======

-- Departments
DROP TABLE IF EXISTS departments;
CREATE TABLE departments (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(100) NOT NULL UNIQUE,
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Roles
DROP TABLE IF EXISTS roles;
CREATE TABLE roles (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(100) NOT NULL UNIQUE,
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Permissions
DROP TABLE IF EXISTS permissions;
CREATE TABLE permissions (
  id INT PRIMARY KEY AUTO_INCREMENT,
  resource VARCHAR(100) NOT NULL,
  action VARCHAR(50) NOT NULL,
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY unique_resource_action (resource, action),
  INDEX idx_resource (resource)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Role Permissions
DROP TABLE IF EXISTS role_permissions;
CREATE TABLE role_permissions (
  id INT PRIMARY KEY AUTO_INCREMENT,
  role_id INT NOT NULL,
  permission_id INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY unique_role_permission (role_id, permission_id),
  FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE,
  FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE CASCADE,
  INDEX idx_role_id (role_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Users
DROP TABLE IF EXISTS users;
CREATE TABLE users (
  id INT PRIMARY KEY AUTO_INCREMENT,
  username VARCHAR(100) NOT NULL UNIQUE,
  email VARCHAR(150) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,
  full_name VARCHAR(150),
  role_id INT,
  department_id INT,
  is_active BOOLEAN DEFAULT true,
  last_login TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE SET NULL,
  FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL,
  INDEX idx_username (username),
  INDEX idx_email (email),
  INDEX idx_is_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Categories
DROP TABLE IF EXISTS categories;
CREATE TABLE categories (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(100) NOT NULL UNIQUE,
  description TEXT,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Unit of Measure
DROP TABLE IF EXISTS uom;
CREATE TABLE uom (
  id INT PRIMARY KEY AUTO_INCREMENT,
  code VARCHAR(20) NOT NULL UNIQUE,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  category VARCHAR(50),
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_code (code),
  INDEX idx_category (category)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Product Types
DROP TABLE IF EXISTS product_types;
CREATE TABLE product_types (
  id INT PRIMARY KEY AUTO_INCREMENT,
  code VARCHAR(20) NOT NULL UNIQUE,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Products
DROP TABLE IF EXISTS products;
CREATE TABLE products (
  id INT PRIMARY KEY AUTO_INCREMENT,
  sku VARCHAR(100) NOT NULL UNIQUE,
  name VARCHAR(200) NOT NULL,
  description TEXT,
  category_id INT,
  product_type_id INT,
  unit_of_measure_id INT,
  standard_cost DECIMAL(15,2) DEFAULT 0,
  reorder_point INT DEFAULT 0,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (category_id) REFERENCES categories(id),
  FOREIGN KEY (product_type_id) REFERENCES product_types(id),
  FOREIGN KEY (unit_of_measure_id) REFERENCES uom(id),
  INDEX idx_sku (sku),
  INDEX idx_category_id (category_id),
  INDEX idx_active (active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- BOM Headers
DROP TABLE IF EXISTS bom_headers;
CREATE TABLE bom_headers (
  id INT PRIMARY KEY AUTO_INCREMENT,
  product_name VARCHAR(255),
  product_id INT,
  version INT DEFAULT 1,
  status VARCHAR(20) DEFAULT 'ACTIVE',
  notes TEXT,
  created_by INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_product_id (product_id),
  INDEX idx_status (status),
  INDEX idx_created_by (created_by)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- BOM Details
DROP TABLE IF EXISTS bom_details;
CREATE TABLE bom_details (
  id INT PRIMARY KEY AUTO_INCREMENT,
  bom_header_id INT NOT NULL,
  raw_material_id INT NOT NULL,
  quantity DECIMAL(15,4) NOT NULL,
  unit_of_measure_id INT,
  sequence INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (bom_header_id) REFERENCES bom_headers(id) ON DELETE CASCADE,
  FOREIGN KEY (raw_material_id) REFERENCES products(id),
  FOREIGN KEY (unit_of_measure_id) REFERENCES uom(id),
  INDEX idx_bom_header_id (bom_header_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ====== WAREHOUSE & INVENTORY TABLES ======

-- Warehouses
DROP TABLE IF EXISTS warehouses;
CREATE TABLE warehouses (
  id INT PRIMARY KEY AUTO_INCREMENT,
  code VARCHAR(50) NOT NULL UNIQUE,
  name VARCHAR(150) NOT NULL,
  address VARCHAR(255),
  contact_person VARCHAR(255),
  is_active TINYINT DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Warehouse Locations
DROP TABLE IF EXISTS warehouse_locations;
CREATE TABLE warehouse_locations (
  id INT PRIMARY KEY AUTO_INCREMENT,
  warehouse_id INT NOT NULL,
  code VARCHAR(100) NOT NULL,
  rack VARCHAR(50),
  `row` VARCHAR(50),
  bin VARCHAR(50),
  capacity DECIMAL(10, 2),
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (warehouse_id) REFERENCES warehouses(id) ON DELETE CASCADE,
  UNIQUE KEY unique_warehouse_location (warehouse_id, code),
  INDEX idx_warehouse_id (warehouse_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Inventory Stocks
DROP TABLE IF EXISTS inventory_stocks;
CREATE TABLE inventory_stocks (
  id INT PRIMARY KEY AUTO_INCREMENT,
  warehouse_id INT NOT NULL,
  product_id INT NOT NULL,
  quantity DECIMAL(15,4) NOT NULL DEFAULT 0,
  reorder_point DECIMAL(15,4) DEFAULT 0,
  last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (warehouse_id) REFERENCES warehouses(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
  UNIQUE KEY unique_warehouse_product (warehouse_id, product_id),
  INDEX idx_product_id (product_id),
  INDEX idx_quantity (quantity)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Stock Transactions
DROP TABLE IF EXISTS stock_movements;
CREATE TABLE stock_movements (
  id INT PRIMARY KEY AUTO_INCREMENT,
  warehouse_id INT NOT NULL,
  product_id INT NOT NULL,
  batch_number VARCHAR(100),
  movement_type VARCHAR(50) NOT NULL,
  quantity DECIMAL(15,4) NOT NULL,
  reference_type VARCHAR(50),
  reference_id INT,
  notes TEXT,
  created_by INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (warehouse_id) REFERENCES warehouses(id),
  FOREIGN KEY (product_id) REFERENCES products(id),
  FOREIGN KEY (created_by) REFERENCES users(id),
  INDEX idx_product_id (product_id),
  INDEX idx_warehouse_id (warehouse_id),
  INDEX idx_batch_number (batch_number),
  INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Batches
DROP TABLE IF EXISTS batches;
CREATE TABLE batches (
  id INT PRIMARY KEY AUTO_INCREMENT,
  batch_number VARCHAR(100) NOT NULL UNIQUE,
  product_id INT NOT NULL,
  quantity DECIMAL(15,4) NOT NULL,
  manufacture_date DATE,
  expiry_date DATE,
  status VARCHAR(50) DEFAULT 'ACTIVE',
  warehouse_id INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (product_id) REFERENCES products(id),
  FOREIGN KEY (warehouse_id) REFERENCES warehouses(id),
  INDEX idx_batch_number (batch_number),
  INDEX idx_product_id (product_id),
  INDEX idx_expiry_date (expiry_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ====== PROCUREMENT TABLES ======

-- Vendors
DROP TABLE IF EXISTS vendors;
CREATE TABLE vendors (
  id INT PRIMARY KEY AUTO_INCREMENT,
  code VARCHAR(50) NOT NULL UNIQUE,
  name VARCHAR(150) NOT NULL,
  contact_person VARCHAR(100),
  email VARCHAR(150),
  phone VARCHAR(20),
  address TEXT,
  city VARCHAR(100),
  country VARCHAR(100),
  payment_terms VARCHAR(100),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_code (code),
  INDEX idx_is_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Purchase Requests
DROP TABLE IF EXISTS purchase_requests;
CREATE TABLE purchase_requests (
  id INT PRIMARY KEY AUTO_INCREMENT,
  pr_number VARCHAR(50) NOT NULL UNIQUE,
  requestor_id INT NULL,
  status VARCHAR(50) DEFAULT 'DRAFT',
  approval_required BOOLEAN DEFAULT true,
  approved_by INT,
  approved_date TIMESTAMP NULL,
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (requestor_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_status (status),
  INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Purchase Request Items
DROP TABLE IF EXISTS purchase_request_items;
CREATE TABLE purchase_request_items (
  id INT PRIMARY KEY AUTO_INCREMENT,
  purchase_request_id INT NOT NULL,
  product_id INT NOT NULL,
  quantity DECIMAL(15,4) NOT NULL,
  unit_price DECIMAL(15,2),
  notes TEXT,
  FOREIGN KEY (purchase_request_id) REFERENCES purchase_requests(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id),
  INDEX idx_purchase_request_id (purchase_request_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Purchase Orders
DROP TABLE IF EXISTS purchase_orders;
CREATE TABLE purchase_orders (
  id INT PRIMARY KEY AUTO_INCREMENT,
  po_number VARCHAR(50) NOT NULL UNIQUE,
  pr_id INT,
  vendor_id INT NOT NULL,
  po_date DATE NOT NULL,
  due_date DATE,
  status VARCHAR(50) DEFAULT 'DRAFT',
  total_amount DECIMAL(15,2) DEFAULT 0,
  approval_required BOOLEAN DEFAULT true,
  approved_by INT,
  approved_date TIMESTAMP NULL,
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (pr_id) REFERENCES purchase_requests(id),
  FOREIGN KEY (vendor_id) REFERENCES vendors(id),
  FOREIGN KEY (approved_by) REFERENCES users(id),
  INDEX idx_po_number (po_number),
  INDEX idx_status (status),
  INDEX idx_vendor_id (vendor_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Purchase Order Items
DROP TABLE IF EXISTS purchase_order_items;
CREATE TABLE purchase_order_items (
  id INT PRIMARY KEY AUTO_INCREMENT,
  purchase_order_id INT NOT NULL,
  product_id INT NOT NULL,
  quantity DECIMAL(15,4) NOT NULL,
  unit_price DECIMAL(15,2) NOT NULL,
  line_total DECIMAL(15,2),
  received_qty DECIMAL(15,4) DEFAULT 0,
  notes TEXT,
  FOREIGN KEY (purchase_order_id) REFERENCES purchase_orders(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id),
  INDEX idx_purchase_order_id (purchase_order_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Goods Receipts
DROP TABLE IF EXISTS goods_receipts;
CREATE TABLE goods_receipts (
  id INT PRIMARY KEY AUTO_INCREMENT,
  grn_number VARCHAR(50) NOT NULL UNIQUE,
  po_id INT NOT NULL,
  warehouse_id INT NOT NULL,
  received_date DATE NOT NULL,
  received_by INT,
  status VARCHAR(50) DEFAULT 'DRAFT',
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (po_id) REFERENCES purchase_orders(id),
  FOREIGN KEY (warehouse_id) REFERENCES warehouses(id),
  FOREIGN KEY (received_by) REFERENCES users(id),
  INDEX idx_grn_number (grn_number),
  INDEX idx_po_id (po_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- GRN Items
DROP TABLE IF EXISTS grn_items;
CREATE TABLE grn_items (
  id INT PRIMARY KEY AUTO_INCREMENT,
  grn_id INT NOT NULL,
  po_item_id INT,
  product_id INT NOT NULL,
  quantity_received DECIMAL(15,4) NOT NULL,
  batch_number VARCHAR(100),
  notes TEXT,
  FOREIGN KEY (grn_id) REFERENCES goods_receipts(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id),
  INDEX idx_grn_id (grn_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ====== PRODUCTION TABLES ======

-- Work Orders
DROP TABLE IF EXISTS work_orders;
CREATE TABLE work_orders (
  id INT PRIMARY KEY AUTO_INCREMENT,
  wo_number VARCHAR(50) NOT NULL UNIQUE,
  product_id INT NOT NULL,
  bom_id INT,
  quantity DECIMAL(15,4) NOT NULL,
  status VARCHAR(50) DEFAULT 'DRAFT',
  scheduled_start DATE,
  scheduled_end DATE,
  actual_start DATE,
  actual_end DATE,
  notes TEXT,
  created_by INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (product_id) REFERENCES products(id),
  FOREIGN KEY (bom_id) REFERENCES bom_headers(id),
  FOREIGN KEY (created_by) REFERENCES users(id),
  INDEX idx_status (status),
  INDEX idx_product_id (product_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- WO Materials
DROP TABLE IF EXISTS wo_materials;
CREATE TABLE wo_materials (
  id INT PRIMARY KEY AUTO_INCREMENT,
  wo_id INT NOT NULL,
  product_id INT NOT NULL,
  quantity_required DECIMAL(15,4) NOT NULL,
  quantity_issued DECIMAL(15,4) DEFAULT 0,
  batch_number VARCHAR(100),
  warehouse_id INT,
  issued_at TIMESTAMP NULL,
  issued_by INT,
  FOREIGN KEY (wo_id) REFERENCES work_orders(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id),
  FOREIGN KEY (warehouse_id) REFERENCES warehouses(id),
  FOREIGN KEY (issued_by) REFERENCES users(id),
  INDEX idx_wo_id (wo_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- WO Process Logs
DROP TABLE IF EXISTS wo_process_logs;
CREATE TABLE wo_process_logs (
  id INT PRIMARY KEY AUTO_INCREMENT,
  wo_id INT NOT NULL,
  process_name VARCHAR(100),
  start_time TIMESTAMP NULL,
  end_time TIMESTAMP NULL,
  duration_minutes INT,
  status VARCHAR(50),
  notes TEXT,
  recorded_by INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (wo_id) REFERENCES work_orders(id) ON DELETE CASCADE,
  FOREIGN KEY (recorded_by) REFERENCES users(id),
  INDEX idx_wo_id (wo_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- WO Results
DROP TABLE IF EXISTS wo_results;
CREATE TABLE wo_results (
  id INT PRIMARY KEY AUTO_INCREMENT,
  wo_id INT NOT NULL,
  output_quantity DECIMAL(15,4),
  output_uom_id INT,
  loss_quantity DECIMAL(15,4) DEFAULT 0,
  loss_percentage DECIMAL(5,2),
  batch_number VARCHAR(100),
  qc_status VARCHAR(50),
  completed_by INT,
  completed_at TIMESTAMP NULL,
  notes TEXT,
  FOREIGN KEY (wo_id) REFERENCES work_orders(id) ON DELETE CASCADE,
  FOREIGN KEY (output_uom_id) REFERENCES uom(id),
  FOREIGN KEY (completed_by) REFERENCES users(id),
  UNIQUE KEY unique_wo_result (wo_id),
  INDEX idx_batch_number (batch_number)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Production Events
DROP TABLE IF EXISTS production_events;
CREATE TABLE production_events (
  id INT PRIMARY KEY AUTO_INCREMENT,
  type VARCHAR(50) NOT NULL,
  title VARCHAR(150) NOT NULL,
  description TEXT,
  event_date DATE NOT NULL,
  event_time TIME,
  location VARCHAR(150),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_event_date (event_date),
  INDEX idx_type (type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Production Tasks
DROP TABLE IF EXISTS production_tasks;
CREATE TABLE production_tasks (
  id INT PRIMARY KEY AUTO_INCREMENT,
  task_name VARCHAR(150) NOT NULL,
  wo_id INT,
  assigned_to_user_id INT,
  priority VARCHAR(50) DEFAULT 'medium',
  due_date DATE,
  status VARCHAR(50) DEFAULT 'pending',
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (wo_id) REFERENCES work_orders(id),
  FOREIGN KEY (assigned_to_user_id) REFERENCES users(id),
  INDEX idx_status (status),
  INDEX idx_due_date (due_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ====== QUALITY TABLES ======

-- QC Tests
DROP TABLE IF EXISTS qc_tests;
CREATE TABLE qc_tests (
  id INT PRIMARY KEY AUTO_INCREMENT,
  code VARCHAR(50) NOT NULL UNIQUE,
  name VARCHAR(150) NOT NULL,
  product_id INT,
  test_type VARCHAR(100),
  test_method TEXT,
  acceptance_criteria TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (product_id) REFERENCES products(id),
  INDEX idx_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- QC Results
DROP TABLE IF EXISTS qc_results;
CREATE TABLE qc_results (
  id INT PRIMARY KEY AUTO_INCREMENT,
  qc_test_id INT NOT NULL,
  batch_id INT,
  wo_id INT,
  result_value VARCHAR(255),
  result_status VARCHAR(50),
  test_date DATE,
  tested_by INT,
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (qc_test_id) REFERENCES qc_tests(id),
  FOREIGN KEY (batch_id) REFERENCES batches(id),
  FOREIGN KEY (wo_id) REFERENCES work_orders(id),
  FOREIGN KEY (tested_by) REFERENCES users(id),
  INDEX idx_batch_id (batch_id),
  INDEX idx_result_status (result_status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ====== SALES TABLES ======

-- Customers
DROP TABLE IF EXISTS customers;
CREATE TABLE customers (
  id INT PRIMARY KEY AUTO_INCREMENT,
  code VARCHAR(50) NOT NULL UNIQUE,
  name VARCHAR(150) NOT NULL,
  contact_person VARCHAR(100),
  email VARCHAR(150),
  phone VARCHAR(20),
  address TEXT,
  city VARCHAR(100),
  country VARCHAR(100),
  tax_id VARCHAR(50),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_code (code),
  INDEX idx_is_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Sales Orders
DROP TABLE IF EXISTS sales_orders;
CREATE TABLE sales_orders (
  id INT PRIMARY KEY AUTO_INCREMENT,
  so_number VARCHAR(50) NOT NULL UNIQUE,
  customer_id INT NOT NULL,
  so_date DATE NOT NULL,
  status VARCHAR(50) DEFAULT 'DRAFT',
  total_amount DECIMAL(15,2) DEFAULT 0,
  approval_required BOOLEAN DEFAULT false,
  approved_by INT,
  approved_date TIMESTAMP NULL,
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_id) REFERENCES customers(id),
  FOREIGN KEY (approved_by) REFERENCES users(id),
  INDEX idx_so_number (so_number),
  INDEX idx_customer_id (customer_id),
  INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Sales Order Items
DROP TABLE IF EXISTS so_items;
CREATE TABLE so_items (
  id INT PRIMARY KEY AUTO_INCREMENT,
  so_id INT NOT NULL,
  product_id INT NOT NULL,
  quantity DECIMAL(15,4) NOT NULL,
  unit_price DECIMAL(15,2) NOT NULL,
  line_total DECIMAL(15,2),
  delivered_qty DECIMAL(15,4) DEFAULT 0,
  notes TEXT,
  FOREIGN KEY (so_id) REFERENCES sales_orders(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id),
  INDEX idx_so_id (so_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Deliveries
DROP TABLE IF EXISTS deliveries;
CREATE TABLE deliveries (
  id INT PRIMARY KEY AUTO_INCREMENT,
  do_number VARCHAR(50) NOT NULL UNIQUE,
  so_id INT NOT NULL,
  delivery_date DATE NOT NULL,
  status VARCHAR(50) DEFAULT 'DRAFT',
  tracking_number VARCHAR(100),
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (so_id) REFERENCES sales_orders(id),
  INDEX idx_do_number (do_number),
  INDEX idx_so_id (so_id),
  INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Delivery Items
DROP TABLE IF EXISTS delivery_items;
CREATE TABLE delivery_items (
  id INT PRIMARY KEY AUTO_INCREMENT,
  delivery_id INT NOT NULL,
  so_item_id INT,
  product_id INT NOT NULL,
  quantity_delivered DECIMAL(15,4) NOT NULL,
  batch_number VARCHAR(100),
  FOREIGN KEY (delivery_id) REFERENCES deliveries(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id),
  INDEX idx_delivery_id (delivery_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Invoices
DROP TABLE IF EXISTS invoices;
CREATE TABLE invoices (
  id INT PRIMARY KEY AUTO_INCREMENT,
  invoice_number VARCHAR(50) NOT NULL UNIQUE,
  so_id INT NOT NULL,
  invoice_date DATE NOT NULL,
  due_date DATE,
  total_amount DECIMAL(15,2) DEFAULT 0,
  status VARCHAR(50) DEFAULT 'DRAFT',
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (so_id) REFERENCES sales_orders(id),
  INDEX idx_invoice_number (invoice_number),
  INDEX idx_so_id (so_id),
  INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Sales Payments
DROP TABLE IF EXISTS sales_payments;
CREATE TABLE sales_payments (
  id INT PRIMARY KEY AUTO_INCREMENT,
  invoice_id INT NOT NULL,
  customer_id INT NOT NULL,
  payment_date DATE NOT NULL,
  amount DECIMAL(15,2) NOT NULL,
  payment_method VARCHAR(50) DEFAULT 'bank_transfer',
  reference_number VARCHAR(100),
  status VARCHAR(50) DEFAULT 'pending',
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (invoice_id) REFERENCES invoices(id),
  FOREIGN KEY (customer_id) REFERENCES customers(id),
  INDEX idx_invoice_id (invoice_id),
  INDEX idx_customer_id (customer_id),
  INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ====== FINANCE TABLES ======

-- COGS Tracking
DROP TABLE IF EXISTS cogs_tracking;
CREATE TABLE cogs_tracking (
  id INT PRIMARY KEY AUTO_INCREMENT,
  wo_id INT,
  batch_id INT,
  product_id INT NOT NULL,
  raw_material_cost DECIMAL(15,2) DEFAULT 0,
  labor_cost DECIMAL(15,2) DEFAULT 0,
  overhead_cost DECIMAL(15,2) DEFAULT 0,
  total_cogs DECIMAL(15,2) DEFAULT 0,
  period_date DATE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (wo_id) REFERENCES work_orders(id),
  FOREIGN KEY (batch_id) REFERENCES batches(id),
  FOREIGN KEY (product_id) REFERENCES products(id),
  INDEX idx_product_id (product_id),
  INDEX idx_period_date (period_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Profitability Tracking
DROP TABLE IF EXISTS profitability_tracking;
CREATE TABLE profitability_tracking (
  id INT PRIMARY KEY AUTO_INCREMENT,
  product_id INT NOT NULL,
  period_date DATE,
  revenue DECIMAL(15,2) DEFAULT 0,
  cogs DECIMAL(15,2) DEFAULT 0,
  gross_profit DECIMAL(15,2),
  margin_percentage DECIMAL(5,2),
  units_sold INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (product_id) REFERENCES products(id),
  UNIQUE KEY unique_product_period (product_id, period_date),
  INDEX idx_period_date (period_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Accounts Payable
DROP TABLE IF EXISTS accounts_payable;
CREATE TABLE accounts_payable (
  id INT PRIMARY KEY AUTO_INCREMENT,
  po_id INT,
  invoice_number VARCHAR(100),
  vendor_id INT NOT NULL,
  amount DECIMAL(15,2) NOT NULL,
  paid_amount DECIMAL(15,2) DEFAULT 0,
  status VARCHAR(50) DEFAULT 'OPEN',
  due_date DATE,
  payment_date DATE,
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (po_id) REFERENCES purchase_orders(id),
  FOREIGN KEY (vendor_id) REFERENCES vendors(id),
  INDEX idx_status (status),
  INDEX idx_due_date (due_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Accounts Receivable
DROP TABLE IF EXISTS accounts_receivable;
CREATE TABLE accounts_receivable (
  id INT PRIMARY KEY AUTO_INCREMENT,
  invoice_id INT,
  customer_id INT NOT NULL,
  amount DECIMAL(15,2) NOT NULL,
  paid_amount DECIMAL(15,2) DEFAULT 0,
  status VARCHAR(50) DEFAULT 'OPEN',
  due_date DATE,
  payment_date DATE,
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (invoice_id) REFERENCES invoices(id),
  FOREIGN KEY (customer_id) REFERENCES customers(id),
  INDEX idx_status (status),
  INDEX idx_due_date (due_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Financial Summary
DROP TABLE IF EXISTS financial_summary;
CREATE TABLE financial_summary (
  id INT PRIMARY KEY AUTO_INCREMENT,
  period_date DATE NOT NULL UNIQUE,
  revenue DECIMAL(15,2) DEFAULT 0,
  cogs DECIMAL(15,2) DEFAULT 0,
  gross_profit DECIMAL(15,2),
  operating_expenses DECIMAL(15,2) DEFAULT 0,
  net_profit DECIMAL(15,2),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_period_date (period_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ====== HUMAN RESOURCES TABLES ======

-- Employees
DROP TABLE IF EXISTS employees;
CREATE TABLE employees (
  id INT PRIMARY KEY AUTO_INCREMENT,
  code VARCHAR(50) NOT NULL UNIQUE,
  user_id INT,
  name VARCHAR(150) NOT NULL,
  email VARCHAR(150),
  phone VARCHAR(20),
  position VARCHAR(100),
  department_id INT,
  hire_date DATE,
  salary DECIMAL(15,2),
  status VARCHAR(50) DEFAULT 'ACTIVE',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (department_id) REFERENCES departments(id),
  INDEX idx_code (code),
  INDEX idx_department_id (department_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Attendance Logs
DROP TABLE IF EXISTS attendance_logs;
CREATE TABLE attendance_logs (
  id INT PRIMARY KEY AUTO_INCREMENT,
  employee_id INT NOT NULL,
  date DATE NOT NULL,
  check_in TIME,
  check_out TIME,
  status VARCHAR(50),
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (employee_id) REFERENCES employees(id),
  UNIQUE KEY unique_employee_date (employee_id, date),
  INDEX idx_date (date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ====== SYSTEM TABLES ======

-- Audit Log
DROP TABLE IF EXISTS audit_log;
CREATE TABLE audit_log (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT,
  action VARCHAR(100),
  entity_type VARCHAR(100),
  entity_id INT,
  old_values JSON,
  new_values JSON,
  ip_address VARCHAR(50),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id),
  INDEX idx_created_at (created_at),
  INDEX idx_entity_type (entity_type),
  INDEX idx_user_id (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Notifications
DROP TABLE IF EXISTS notifications;
CREATE TABLE notifications (
  id INT PRIMARY KEY AUTO_INCREMENT,
  recipient_id INT NOT NULL,
  sender_id INT,
  title VARCHAR(255),
  message TEXT NOT NULL,
  type VARCHAR(50),
  related_entity_type VARCHAR(100),
  related_entity_id INT,
  action_url VARCHAR(255),
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  read_at TIMESTAMP NULL,
  FOREIGN KEY (recipient_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_recipient_id (recipient_id),
  INDEX idx_is_read (is_read),
  INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- System Settings
DROP TABLE IF EXISTS system_settings;
CREATE TABLE system_settings (
  id INT PRIMARY KEY AUTO_INCREMENT,
  setting_key VARCHAR(100) NOT NULL UNIQUE,
  setting_value TEXT,
  category VARCHAR(100),
  description TEXT,
  data_type VARCHAR(50),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_category (category)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;

-- Insert default roles
INSERT IGNORE INTO roles (name, description) VALUES
('Admin', 'System Administrator with full access'),
('Manager', 'Department Manager'),
('Supervisor', 'Production Supervisor'),
('Operator', 'Production Operator'),
('Quality', 'Quality Control'),
('Finance', 'Finance Officer'),
('Sales', 'Sales Representative');

-- Insert default permissions
INSERT IGNORE INTO permissions (resource, action, description) VALUES
('products', 'create', 'Create products'),
('products', 'read', 'View products'),
('products', 'update', 'Edit products'),
('products', 'delete', 'Delete products'),
('inventory', 'create', 'Create inventory transactions'),
('inventory', 'read', 'View inventory'),
('inventory', 'update', 'Edit inventory'),
('inventory', 'delete', 'Delete inventory'),
('workorders', 'create', 'Create work orders'),
('workorders', 'read', 'View work orders'),
('workorders', 'update', 'Edit work orders'),
('workorders', 'approve', 'Approve work orders'),
('sales', 'create', 'Create sales orders'),
('sales', 'read', 'View sales orders'),
('sales', 'approve', 'Approve sales orders'),
('finance', 'read', 'View finance reports'),
('finance', 'approve', 'Approve financial transactions');

-- Insert default admin role permissions
INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p WHERE r.name = 'Admin';

-- Insert master admin user
INSERT IGNORE INTO users (username, email, password, full_name, role_id, is_active) 
VALUES ('admin', 'admin@erp.local', '$2a$10$1234567890123456789012345678901234567890', 'System Administrator', 1, true);

-- Insert default departments
INSERT IGNORE INTO departments (name, description) VALUES
('Production', 'Manufacturing & Production Department'),
('Warehouse', 'Inventory & Warehouse Management'),
('Quality', 'Quality Control & Assurance'),
('Finance', 'Finance & Accounting'),
('Sales', 'Sales & Distribution'),
('HR', 'Human Resources');

-- Insert default categories
INSERT IGNORE INTO categories (name, description, active) VALUES
('Raw Materials', 'Basic raw materials and ingredients', 1),
('Ingredients', 'Food and beverage ingredients', 1),
('Packaging', 'Packaging materials and supplies', 1),
('Finished Goods', 'Ready-to-sell finished products', 1),
('Semi-Finished', 'Work in progress or sub-assemblies', 1);

-- Insert default UoM
INSERT IGNORE INTO uom (code, name, description, category, active) VALUES
('KG', 'Kilogram', 'Weight measurement', 'Weight', 1),
('L', 'Litre', 'Volume measurement', 'Volume', 1),
('PCS', 'Piece', 'Count measurement', 'Count', 1),
('BOX', 'Box', 'Box count', 'Count', 1),
('CASE', 'Case', 'Case count', 'Count', 1);

-- Insert default product types
INSERT IGNORE INTO product_types (code, name, description, active) VALUES
('RM', 'Raw Material', 'Raw materials and ingredients', 1),
('FG', 'Finished Goods', 'Ready-to-sell finished products', 1),
('PK', 'Packaging', 'Packaging materials and containers', 1),
('SF', 'Semi-Finished', 'Work in progress or sub-assemblies', 1);

-- Insert default warehouses
INSERT IGNORE INTO warehouses (code, name, address, is_active) VALUES
('WH-001', 'Main Warehouse', 'Jakarta', 1),
('WH-002', 'Secondary Warehouse', 'Surabaya', 1);

-- Insert default system settings
INSERT IGNORE INTO system_settings (setting_key, setting_value, category, data_type, description) VALUES
('app_name', 'Manufacturing ERP', 'general', 'string', 'Application Name'),
('app_version', '1.0', 'general', 'string', 'Application Version'),
('currency', 'IDR', 'finance', 'string', 'Default Currency'),
('date_format', 'YYYY-MM-DD', 'general', 'string', 'Date Format'),
('company_name', 'PT Manufacturing Company', 'general', 'string', 'Company Name'),
('po_approval_required', 'true', 'procurement', 'boolean', 'Require PO Approval'),
('so_approval_required', 'false', 'sales', 'boolean', 'Require SO Approval'),
('max_approval_amount', '100000000', 'approval', 'number', 'Max Amount for Auto-Approval');
