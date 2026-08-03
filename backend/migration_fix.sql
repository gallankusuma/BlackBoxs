-- Fix departments table
ALTER TABLE departments ADD COLUMN code VARCHAR(50) NULL;
ALTER TABLE departments ADD COLUMN head_user_id INT NULL;
ALTER TABLE departments ADD COLUMN active TINYINT(1) DEFAULT 1;

-- Fix approval_rules table
ALTER TABLE approval_rules ADD COLUMN condition_field VARCHAR(100) NULL;
ALTER TABLE approval_rules ADD COLUMN min_value DECIMAL(15,2) NULL;
ALTER TABLE approval_rules ADD COLUMN max_value DECIMAL(15,2) NULL;
ALTER TABLE approval_rules ADD COLUMN approver_role_id INT NULL;
ALTER TABLE approval_rules ADD COLUMN sequence INT DEFAULT 1;
ALTER TABLE approval_rules ADD COLUMN is_active TINYINT(1) DEFAULT 1;
ALTER TABLE approval_rules ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;

-- Create approval_rule_steps if not exists
CREATE TABLE IF NOT EXISTS approval_rule_steps (
  id INT AUTO_INCREMENT PRIMARY KEY,
  rule_id INT NOT NULL,
  step_order INT DEFAULT 1,
  approver_role_id INT NULL,
  approver_user_id INT NULL,
  can_reject TINYINT(1) DEFAULT 1,
  is_parallel TINYINT(1) DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (rule_id) REFERENCES approval_rules(id) ON DELETE CASCADE
);

SELECT 'Migration complete' as status;
