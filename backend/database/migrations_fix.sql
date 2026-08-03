-- Migration: Add missing tables and columns for ERP
-- Run this after initial schema to add Item Types table and User Level

-- 1. Add user_level column to users table if not exists
-- user_level: 1=Staff, 2=Supervisor, 3=Manager, 4=Admin
ALTER TABLE users ADD COLUMN user_level INTEGER DEFAULT 1;

-- 2. Create item_types table
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

-- 3. Add BOM approval fields if not exists
-- approval_status: 0=Pending, 1=Supervisor Approved (1/2), 2=Manager Approved (2/2)
ALTER TABLE bom ADD COLUMN approval_status INTEGER DEFAULT 0;
ALTER TABLE bom ADD COLUMN approved_by_supervisor_id INTEGER;
ALTER TABLE bom ADD COLUMN approved_by_manager_id INTEGER;
ALTER TABLE bom ADD COLUMN approved_at_supervisor TIMESTAMP;
ALTER TABLE bom ADD COLUMN approved_at_manager TIMESTAMP;

-- 4. Add effective_date and version to BOM if not exists
ALTER TABLE bom ADD COLUMN effective_date DATE;
ALTER TABLE bom ADD COLUMN version VARCHAR(50) DEFAULT 'V1.0';

-- 5. Insert default item types
INSERT OR IGNORE INTO item_types (code, name, description, track_inventory) VALUES
('INV', 'Inventory Item', 'Physical items tracked in inventory (raw materials, finished goods)', 1),
('NON-INV', 'Non-Inventory Item', 'Services, fees, or non-physical items not tracked in inventory', 0);

-- 6. Update existing users to have user_level if needed
-- Example: admin@test.com as Admin (level 4), manager@test.com as Manager (level 3)
UPDATE users SET user_level = 4 WHERE email = 'admin@test.com';
UPDATE users SET user_level = 3 WHERE email = 'manager@test.com';
UPDATE users SET user_level = 2 WHERE email = 'supervisor@test.com';

-- 7. Add missing purchase_requests columns if not exists
ALTER TABLE purchase_requests ADD COLUMN department TEXT;
ALTER TABLE purchase_requests ADD COLUMN request_date DATE;
ALTER TABLE purchase_requests ADD COLUMN needed_by DATE;
ALTER TABLE purchase_requests ADD COLUMN reason TEXT;
