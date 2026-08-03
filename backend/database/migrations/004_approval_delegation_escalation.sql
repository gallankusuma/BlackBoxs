-- Approval delegations table
CREATE TABLE IF NOT EXISTS approval_delegations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  from_user_id INTEGER NOT NULL,
  to_user_id INTEGER NOT NULL,
  module VARCHAR(100),
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  reason TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (from_user_id) REFERENCES users(id),
  FOREIGN KEY (to_user_id) REFERENCES users(id)
);

-- Approval escalations table
CREATE TABLE IF NOT EXISTS approval_escalations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  module VARCHAR(100) NOT NULL,
  hours_threshold INT NOT NULL DEFAULT 24,
  escalate_to_user_id INTEGER,
  escalate_to_role_id INTEGER,
  notify_requester BOOLEAN DEFAULT TRUE,
  notify_admin BOOLEAN DEFAULT TRUE,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (escalate_to_user_id) REFERENCES users(id),
  FOREIGN KEY (escalate_to_role_id) REFERENCES roles(id)
);
