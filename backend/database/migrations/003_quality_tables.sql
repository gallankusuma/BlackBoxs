-- Quality Module - Additional Tables
-- Run this migration to add sampling plans, NCR, and rework tables

CREATE TABLE IF NOT EXISTS qc_sampling_plans (
  id INT AUTO_INCREMENT PRIMARY KEY,
  product_id INT,
  test_id INT,
  sample_size INT DEFAULT 1,
  frequency VARCHAR(50) DEFAULT 'per_batch',
  aql_level VARCHAR(20) DEFAULT '1.0',
  inspection_level VARCHAR(50) DEFAULT 'normal',
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (product_id) REFERENCES products(id),
  FOREIGN KEY (test_id) REFERENCES qc_tests(id)
);

CREATE TABLE IF NOT EXISTS qc_ncr (
  id INT AUTO_INCREMENT PRIMARY KEY,
  ncr_number VARCHAR(50) UNIQUE,
  product_id INT,
  batch_id INT,
  category VARCHAR(50) DEFAULT 'product',
  severity VARCHAR(20) DEFAULT 'minor',
  description TEXT NOT NULL,
  root_cause TEXT,
  corrective_action TEXT,
  preventive_action TEXT,
  status VARCHAR(30) DEFAULT 'open',
  reported_by INT,
  assigned_to INT,
  closed_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (product_id) REFERENCES products(id),
  FOREIGN KEY (batch_id) REFERENCES batches(id),
  FOREIGN KEY (reported_by) REFERENCES users(id),
  FOREIGN KEY (assigned_to) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS qc_ncr_actions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  ncr_id INT NOT NULL,
  action_type VARCHAR(30) DEFAULT 'corrective',
  description TEXT,
  due_date DATE,
  status VARCHAR(20) DEFAULT 'open',
  action_by INT,
  completed_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (ncr_id) REFERENCES qc_ncr(id) ON DELETE CASCADE,
  FOREIGN KEY (action_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS qc_rework_orders (
  id INT AUTO_INCREMENT PRIMARY KEY,
  rework_number VARCHAR(50) UNIQUE,
  ncr_id INT,
  product_id INT,
  batch_id INT,
  wo_id INT,
  quantity DECIMAL(12,2) DEFAULT 0,
  description TEXT,
  instructions TEXT,
  status VARCHAR(30) DEFAULT 'pending',
  created_by INT,
  completed_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (ncr_id) REFERENCES qc_ncr(id),
  FOREIGN KEY (product_id) REFERENCES products(id),
  FOREIGN KEY (batch_id) REFERENCES batches(id),
  FOREIGN KEY (wo_id) REFERENCES work_orders(id),
  FOREIGN KEY (created_by) REFERENCES users(id)
);
