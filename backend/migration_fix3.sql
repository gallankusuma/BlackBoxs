-- Safe add column helper using stored procedure
DROP PROCEDURE IF EXISTS safe_add_column;
DELIMITER //
CREATE PROCEDURE safe_add_column(
  IN p_table VARCHAR(64),
  IN p_column VARCHAR(64),
  IN p_definition VARCHAR(200)
)
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = p_table
      AND COLUMN_NAME = p_column
  ) THEN
    SET @sql = CONCAT('ALTER TABLE `', p_table, '` ADD COLUMN `', p_column, '` ', p_definition);
    PREPARE stmt FROM @sql;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;
  END IF;
END //
DELIMITER ;

-- Fix approval_rule_steps
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

CALL safe_add_column('approval_rule_steps', 'approver_role_id', 'INT NULL');
CALL safe_add_column('approval_rule_steps', 'approver_user_id', 'INT NULL');
CALL safe_add_column('approval_rule_steps', 'can_reject', 'TINYINT(1) DEFAULT 1');
CALL safe_add_column('approval_rule_steps', 'is_parallel', 'TINYINT(1) DEFAULT 0');

-- Fix purchase_orders
CALL safe_add_column('purchase_orders', 'project_id', 'INT NULL');
CALL safe_add_column('purchase_orders', 'pr_id', 'INT NULL');
CALL safe_add_column('purchase_orders', 'discount_percent', 'DECIMAL(5,2) DEFAULT 0');
CALL safe_add_column('purchase_orders', 'ppn_percent', 'DECIMAL(5,2) DEFAULT 0');
CALL safe_add_column('purchase_orders', 'advance_payment', 'DECIMAL(15,2) DEFAULT 0');
CALL safe_add_column('purchase_orders', 'expected_date', 'DATE NULL');
CALL safe_add_column('purchase_orders', 'payment_term', 'VARCHAR(100) NULL');
CALL safe_add_column('purchase_orders', 'approval_status', 'INT DEFAULT 0');
CALL safe_add_column('purchase_orders', 'approved_by', 'INT NULL');
CALL safe_add_column('purchase_orders', 'notes', 'TEXT NULL');

DROP PROCEDURE IF EXISTS safe_add_column;

SELECT 'Migration complete' as result;
