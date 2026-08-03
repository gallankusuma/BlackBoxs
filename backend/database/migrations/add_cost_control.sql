-- Cost Control: Link PR, PO, and Expenses to Projects
-- Run: mysql -u root erp_manufacturing < backend/database/migrations/add_cost_control.sql

-- 1. Add project_id to purchase_requests
ALTER TABLE purchase_requests
  ADD COLUMN project_id INT NULL AFTER requestor_id,
  ADD INDEX idx_pr_project (project_id),
  ADD CONSTRAINT fk_pr_project FOREIGN KEY (project_id) REFERENCES client_projects(id) ON DELETE SET NULL;

-- 2. Add project_id to purchase_orders
ALTER TABLE purchase_orders
  ADD COLUMN project_id INT NULL AFTER pr_id,
  ADD INDEX idx_po_project (project_id),
  ADD CONSTRAINT fk_po_project FOREIGN KEY (project_id) REFERENCES client_projects(id) ON DELETE SET NULL;

-- 3. Create project_expenses table for non-PR/PO costs
CREATE TABLE IF NOT EXISTS project_expenses (
  id INT PRIMARY KEY AUTO_INCREMENT,
  project_id INT NOT NULL,
  expense_number VARCHAR(50) NOT NULL UNIQUE,
  category ENUM('material', 'labor', 'equipment', 'subcontractor', 'overhead', 'transport', 'other') NOT NULL DEFAULT 'other',
  description VARCHAR(500) NOT NULL,
  amount DECIMAL(15,2) NOT NULL DEFAULT 0,
  expense_date DATE NOT NULL,
  vendor_id INT NULL,
  receipt_number VARCHAR(100) NULL,
  status ENUM('draft', 'submitted', 'approved', 'rejected', 'paid') DEFAULT 'draft',
  notes TEXT NULL,
  created_by INT NULL,
  approved_by INT NULL,
  approved_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_expense_project (project_id),
  INDEX idx_expense_date (expense_date),
  INDEX idx_expense_category (category),
  CONSTRAINT fk_expense_project FOREIGN KEY (project_id) REFERENCES client_projects(id) ON DELETE CASCADE,
  CONSTRAINT fk_expense_vendor FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE SET NULL,
  CONSTRAINT fk_expense_creator FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_expense_approver FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE SET NULL
);
