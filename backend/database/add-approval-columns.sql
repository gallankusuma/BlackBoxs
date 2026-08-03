-- Migration: Add approval workflow columns to transaction tables
-- For: Purchase Requests, Purchase Orders, Good Receipts, Stock Transfer, Stock Adjustment

-- Add approval columns to purchase_requests
ALTER TABLE purchase_requests ADD COLUMN IF NOT EXISTS approval_status INT DEFAULT 0;
ALTER TABLE purchase_requests ADD COLUMN IF NOT EXISTS approved_by_supervisor_id INT NULL;
ALTER TABLE purchase_requests ADD COLUMN IF NOT EXISTS approved_by_manager_id INT NULL;
ALTER TABLE purchase_requests ADD COLUMN IF NOT EXISTS approved_at_supervisor TIMESTAMP NULL;
ALTER TABLE purchase_requests ADD COLUMN IF NOT EXISTS approved_at_manager TIMESTAMP NULL;

-- Add approval columns to purchase_orders
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS approval_status INT DEFAULT 0;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS approved_by_supervisor_id INT NULL;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS approved_by_manager_id INT NULL;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS approved_at_supervisor TIMESTAMP NULL;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS approved_at_manager TIMESTAMP NULL;

-- Add approval columns to good_receipts
ALTER TABLE good_receipts ADD COLUMN IF NOT EXISTS approval_status INT DEFAULT 0;
ALTER TABLE good_receipts ADD COLUMN IF NOT EXISTS approved_by_supervisor_id INT NULL;
ALTER TABLE good_receipts ADD COLUMN IF NOT EXISTS approved_by_manager_id INT NULL;
ALTER TABLE good_receipts ADD COLUMN IF NOT EXISTS approved_at_supervisor TIMESTAMP NULL;
ALTER TABLE good_receipts ADD COLUMN IF NOT EXISTS approved_at_manager TIMESTAMP NULL;

-- Add approval columns to stock_transfers
ALTER TABLE stock_transfers ADD COLUMN IF NOT EXISTS approval_status INT DEFAULT 0;
ALTER TABLE stock_transfers ADD COLUMN IF NOT EXISTS approved_by_supervisor_id INT NULL;
ALTER TABLE stock_transfers ADD COLUMN IF NOT EXISTS approved_by_manager_id INT NULL;
ALTER TABLE stock_transfers ADD COLUMN IF NOT EXISTS approved_at_supervisor TIMESTAMP NULL;
ALTER TABLE stock_transfers ADD COLUMN IF NOT EXISTS approved_at_manager TIMESTAMP NULL;

-- Add approval columns to stock_adjustments
ALTER TABLE stock_adjustments ADD COLUMN IF NOT EXISTS approval_status INT DEFAULT 0;
ALTER TABLE stock_adjustments ADD COLUMN IF NOT EXISTS approved_by_supervisor_id INT NULL;
ALTER TABLE stock_adjustments ADD COLUMN IF NOT EXISTS approved_by_manager_id INT NULL;
ALTER TABLE stock_adjustments ADD COLUMN IF NOT EXISTS approved_at_supervisor TIMESTAMP NULL;
ALTER TABLE stock_adjustments ADD COLUMN IF NOT EXISTS approved_at_manager TIMESTAMP NULL;

-- Add approval columns to bom if not already there
ALTER TABLE bom ADD COLUMN IF NOT EXISTS approval_status INT DEFAULT 0;
ALTER TABLE bom ADD COLUMN IF NOT EXISTS approved_by_supervisor_id INT NULL;
ALTER TABLE bom ADD COLUMN IF NOT EXISTS approved_by_manager_id INT NULL;
ALTER TABLE bom ADD COLUMN IF NOT EXISTS approved_at_supervisor TIMESTAMP NULL;
ALTER TABLE bom ADD COLUMN IF NOT EXISTS approved_at_manager TIMESTAMP NULL;
