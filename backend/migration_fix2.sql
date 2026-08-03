-- Ensure approval_rule_steps exists with all required columns
CREATE TABLE IF NOT EXISTS approval_rule_steps (
  id INT AUTO_INCREMENT PRIMARY KEY,
  rule_id INT NOT NULL,
  step_order INT DEFAULT 1,
  approver_role_id INT NULL,
  approver_user_id INT NULL,
  can_reject TINYINT(1) DEFAULT 1,
  is_parallel TINYINT(1) DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Add missing columns to approval_rule_steps if table already existed without them
ALTER TABLE approval_rule_steps ADD COLUMN IF NOT EXISTS approver_role_id INT NULL;
ALTER TABLE approval_rule_steps ADD COLUMN IF NOT EXISTS approver_user_id INT NULL;
ALTER TABLE approval_rule_steps ADD COLUMN IF NOT EXISTS can_reject TINYINT(1) DEFAULT 1;
ALTER TABLE approval_rule_steps ADD COLUMN IF NOT EXISTS is_parallel TINYINT(1) DEFAULT 0;

-- Also ensure purchase_orders has project_id and status columns used in PO creation
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS project_id INT NULL;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS pr_id INT NULL;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS discount_percent DECIMAL(5,2) DEFAULT 0;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS ppn_percent DECIMAL(5,2) DEFAULT 0;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS advance_payment DECIMAL(15,2) DEFAULT 0;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS expected_date DATE NULL;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS payment_term VARCHAR(100) NULL;

-- Check approval_rule_steps
DESCRIBE approval_rule_steps;
SELECT 'All migrations done' as result;
