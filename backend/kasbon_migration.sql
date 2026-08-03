CREATE TABLE IF NOT EXISTS kasbon_requests (
  id INT AUTO_INCREMENT PRIMARY KEY,
  request_number VARCHAR(50) UNIQUE,
  request_date DATE NOT NULL,
  due_date DATE,
  total_amount DECIMAL(12,2) DEFAULT 0,
  purpose TEXT,
  notes TEXT,
  status VARCHAR(20) DEFAULT 'draft',
  approval_status INT DEFAULT 0,
  requester_id INT,
  approved_by INT,
  approved_at TIMESTAMP NULL,
  project_id INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS kasbon_request_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  kasbon_request_id INT NOT NULL,
  salary_advance_id INT,
  employee_id INT,
  employee_name VARCHAR(255),
  amount DECIMAL(12,2) DEFAULT 0,
  description TEXT,
  advance_date DATE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (kasbon_request_id) REFERENCES kasbon_requests(id) ON DELETE CASCADE
);

ALTER TABLE salary_advances ADD COLUMN kasbon_request_id INT NULL;
