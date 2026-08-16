-- ============================================================================
-- BASELINE SKEMA — DR-P1-07
--
-- Dibangkitkan dari STRUKTUR produksi 16 Agustus 2026 (tanpa satu baris data).
--
-- KENAPA ADA
--
-- `initializeDatabase()` menjalankan `schema_mysql.sql` (48 tabel) lalu
-- serangkaian `ensure*Schema` (72 tabel). Produksi punya 148. Selisihnya 62
-- tabel yang TIDAK PERNAH dibuat jalur boot — termasuk tabel inti seperti
-- `proposals`, `proposal_items`, `clients`, `ahsp_headers`, `payslip_records`,
-- `material_requests`, `office_locations`, dan `webauthn_challenges`.
--
-- Akibatnya database kosong bisa boot dan mencetak "initialized successfully",
-- tetapi Estimator, HR payroll, absensi WebAuthn, Material Request, dan Document
-- Centre gagal pada request pertama. Itu temuan DR-P1-07, dan perluasan dari
-- catatan lama 78-vs-141 di CLAUDE.md.
--
-- CARA MEMPERLAKUKANNYA
--
-- Berkas ini adalah BASELINE, bukan pengganti `ensure*Schema`. Perubahan skema
-- BARU tetap ditulis sebagai fungsi `ensureXxx` di `config/database.ts` supaya
-- database yang sudah berjalan ikut terbarui. Baseline ini hanya memastikan
-- instalasi baru punya titik awal yang sama dengan produksi.
--
-- Seluruhnya `CREATE TABLE IF NOT EXISTS`, jadi tidak menyentuh database yang
-- sudah berisi. AUTO_INCREMENT produksi sengaja dibuang.
-- ============================================================================

CREATE TABLE IF NOT EXISTS `accounts_payable` (
  `id` int NOT NULL AUTO_INCREMENT,
  `po_id` int DEFAULT NULL,
  `invoice_number` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `vendor_id` int DEFAULT NULL,
  `amount` decimal(15,2) NOT NULL,
  `paid_amount` decimal(15,2) DEFAULT '0.00',
  `status` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT 'OPEN',
  `due_date` date DEFAULT NULL,
  `payment_date` date DEFAULT NULL,
  `notes` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `po_schedule_id` int DEFAULT NULL,
  `invoice_date` date DEFAULT NULL,
  `project_id` int DEFAULT NULL,
  `vendor_invoice_number` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `description` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `po_id` (`po_id`),
  KEY `vendor_id` (`vendor_id`),
  KEY `idx_status` (`status`),
  KEY `idx_due_date` (`due_date`),
  CONSTRAINT `accounts_payable_ibfk_1` FOREIGN KEY (`po_id`) REFERENCES `purchase_orders` (`id`),
  CONSTRAINT `accounts_payable_ibfk_2` FOREIGN KEY (`vendor_id`) REFERENCES `vendors` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;



CREATE TABLE IF NOT EXISTS `accounts_receivable` (
  `id` int NOT NULL AUTO_INCREMENT,
  `invoice_id` int DEFAULT NULL,
  `customer_id` int NOT NULL,
  `amount` decimal(15,2) NOT NULL,
  `paid_amount` decimal(15,2) DEFAULT '0.00',
  `status` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT 'OPEN',
  `due_date` date DEFAULT NULL,
  `payment_date` date DEFAULT NULL,
  `notes` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `project_id` int DEFAULT NULL,
  `invoice_number` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `invoice_date` date DEFAULT NULL,
  `description` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `tax_percent` decimal(5,2) DEFAULT '11.00',
  `tax_amount` decimal(15,2) DEFAULT '0.00',
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `invoice_id` (`invoice_id`),
  KEY `customer_id` (`customer_id`),
  KEY `idx_status` (`status`),
  KEY `idx_due_date` (`due_date`),
  CONSTRAINT `accounts_receivable_ibfk_1` FOREIGN KEY (`invoice_id`) REFERENCES `invoices` (`id`),
  CONSTRAINT `accounts_receivable_ibfk_2` FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;



CREATE TABLE IF NOT EXISTS `ahsp_headers` (
  `id` int NOT NULL AUTO_INCREMENT,
  `kode` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `work_category` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `work_category_code` varchar(10) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `satuan` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `version` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT '2024',
  `status` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT 'active',
  `harga_tenaga` decimal(15,2) DEFAULT '0.00',
  `harga_bahan` decimal(15,2) DEFAULT '0.00',
  `harga_alat` decimal(15,2) DEFAULT '0.00',
  `harga_langsung` decimal(15,2) DEFAULT '0.00',
  `overhead_profit` decimal(15,2) DEFAULT '0.00',
  `harga_satuan` decimal(15,2) DEFAULT '0.00',
  `approved_at` timestamp NULL DEFAULT NULL,
  `approved_by` int DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `kode` (`kode`),
  KEY `idx_kode` (`kode`),
  KEY `idx_status` (`status`),
  KEY `idx_name` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;



CREATE TABLE IF NOT EXISTS `ahsp_items` (
  `id` int NOT NULL AUTO_INCREMENT,
  `ahsp_id` int NOT NULL,
  `section` char(1) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `resource_type` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `resource_id` int NOT NULL,
  `koefisien` decimal(10,4) NOT NULL DEFAULT '0.0000',
  `resource_name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `resource_satuan` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `resource_harga` decimal(15,2) DEFAULT NULL,
  `jumlah_harga` decimal(15,2) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_ahsp` (`ahsp_id`),
  KEY `idx_section` (`section`),
  KEY `idx_resource` (`resource_type`,`resource_id`),
  CONSTRAINT `ahsp_items_ibfk_1` FOREIGN KEY (`ahsp_id`) REFERENCES `ahsp_headers` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;



CREATE TABLE IF NOT EXISTS `ahsp_sub_discipline_map` (
  `ahsp_id` int NOT NULL,
  `sub_discipline_id` int NOT NULL,
  PRIMARY KEY (`ahsp_id`,`sub_discipline_id`),
  KEY `sub_discipline_id` (`sub_discipline_id`),
  CONSTRAINT `ahsp_sub_discipline_map_ibfk_1` FOREIGN KEY (`ahsp_id`) REFERENCES `ahsp_headers` (`id`) ON DELETE CASCADE,
  CONSTRAINT `ahsp_sub_discipline_map_ibfk_2` FOREIGN KEY (`sub_discipline_id`) REFERENCES `master_sub_disciplines` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;



CREATE TABLE IF NOT EXISTS `ahsp_wbs_templates` (
  `id` int NOT NULL AUTO_INCREMENT,
  `ahsp_id` int DEFAULT NULL COMMENT 'Specific AHSP, NULL = applies to whole category',
  `work_category` varchar(255) DEFAULT NULL COMMENT 'Category pattern match',
  `step_order` int NOT NULL DEFAULT '1',
  `step_code` varchar(20) DEFAULT NULL,
  `step_name` varchar(255) NOT NULL,
  `duration_pct` decimal(5,2) NOT NULL DEFAULT '10.00' COMMENT 'Percentage of total item duration',
  PRIMARY KEY (`id`),
  KEY `idx_ahsp_id` (`ahsp_id`),
  KEY `idx_category` (`work_category`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;



CREATE TABLE IF NOT EXISTS `ap_payments` (
  `id` int NOT NULL AUTO_INCREMENT,
  `ap_id` int NOT NULL,
  `payment_date` date NOT NULL,
  `amount` decimal(15,2) NOT NULL,
  `payment_method` varchar(50) DEFAULT 'Transfer',
  `reference_number` varchar(100) DEFAULT NULL,
  `notes` text,
  `created_by` int DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_ap_id` (`ap_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;



CREATE TABLE IF NOT EXISTS `approval_actions` (
  `id` int NOT NULL AUTO_INCREMENT,
  `request_id` int NOT NULL,
  `step_order` int NOT NULL,
  `approver_id` int DEFAULT NULL,
  `action` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `comments` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_approval_actions_request` (`request_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;



CREATE TABLE IF NOT EXISTS `approval_delegations` (
  `id` int NOT NULL AUTO_INCREMENT,
  `from_user_id` int NOT NULL,
  `to_user_id` int NOT NULL,
  `module` varchar(100) DEFAULT NULL,
  `start_date` date NOT NULL,
  `end_date` date NOT NULL,
  `reason` text,
  `is_active` tinyint(1) DEFAULT '1',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `from_user_id` (`from_user_id`),
  KEY `to_user_id` (`to_user_id`),
  CONSTRAINT `approval_delegations_ibfk_1` FOREIGN KEY (`from_user_id`) REFERENCES `users` (`id`),
  CONSTRAINT `approval_delegations_ibfk_2` FOREIGN KEY (`to_user_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;



CREATE TABLE IF NOT EXISTS `approval_escalations` (
  `id` int NOT NULL AUTO_INCREMENT,
  `module` varchar(100) NOT NULL,
  `hours_threshold` int NOT NULL DEFAULT '24',
  `escalate_to_user_id` int DEFAULT NULL,
  `escalate_to_role_id` int DEFAULT NULL,
  `notify_requester` tinyint(1) DEFAULT '1',
  `notify_admin` tinyint(1) DEFAULT '1',
  `is_active` tinyint(1) DEFAULT '1',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `escalate_to_user_id` (`escalate_to_user_id`),
  KEY `escalate_to_role_id` (`escalate_to_role_id`),
  CONSTRAINT `approval_escalations_ibfk_1` FOREIGN KEY (`escalate_to_user_id`) REFERENCES `users` (`id`),
  CONSTRAINT `approval_escalations_ibfk_2` FOREIGN KEY (`escalate_to_role_id`) REFERENCES `roles` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;



CREATE TABLE IF NOT EXISTS `approval_requests` (
  `id` int NOT NULL AUTO_INCREMENT,
  `request_number` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `module` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `entity_type` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `entity_id` int NOT NULL,
  `requester_id` int DEFAULT NULL,
  `current_step` int DEFAULT '1',
  `status` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT 'pending',
  `submitted_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `completed_at` timestamp NULL DEFAULT NULL,
  `notes` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `rule_id` int DEFAULT NULL,
  `condition_value` decimal(15,2) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `request_number` (`request_number`),
  KEY `idx_approval_requests_module_status` (`module`,`status`),
  KEY `idx_approval_requests_entity` (`entity_type`,`entity_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;



CREATE TABLE IF NOT EXISTS `approval_rule_steps` (
  `id` int NOT NULL AUTO_INCREMENT,
  `rule_id` int NOT NULL,
  `step_order` int NOT NULL,
  `approver_user_id` int DEFAULT NULL,
  `approver_role_id` int DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `can_reject` tinyint(1) DEFAULT '1',
  `is_parallel` tinyint(1) DEFAULT '0',
  PRIMARY KEY (`id`),
  KEY `idx_approval_rule_steps_rule` (`rule_id`),
  CONSTRAINT `fk_ars_rule` FOREIGN KEY (`rule_id`) REFERENCES `approval_rules` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;



CREATE TABLE IF NOT EXISTS `approval_rules` (
  `id` int NOT NULL AUTO_INCREMENT,
  `module` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `condition_field` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `min_value` decimal(15,2) DEFAULT NULL,
  `max_value` decimal(15,2) DEFAULT NULL,
  `approver_role_id` int DEFAULT NULL,
  `sequence` int DEFAULT '1',
  `is_active` tinyint(1) DEFAULT '1',
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_approval_rules_module` (`module`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;



CREATE TABLE IF NOT EXISTS `ar_payments` (
  `id` int NOT NULL AUTO_INCREMENT,
  `ar_id` int NOT NULL,
  `payment_date` date NOT NULL,
  `amount` decimal(15,2) NOT NULL,
  `payment_method` varchar(50) DEFAULT 'Transfer',
  `reference_number` varchar(100) DEFAULT NULL,
  `notes` text,
  `created_by` int DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_ar_id` (`ar_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;



CREATE TABLE IF NOT EXISTS `asset_categories` (
  `id` int NOT NULL AUTO_INCREMENT,
  `code` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `requires_production_line` tinyint(1) NOT NULL DEFAULT '0',
  `order_no` int DEFAULT '0',
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `is_depreciable` tinyint(1) NOT NULL DEFAULT '1',
  `default_useful_life_years` int DEFAULT NULL,
  `default_depreciation_method` varchar(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `default_depreciation_rate` decimal(6,4) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `code` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;



CREATE TABLE IF NOT EXISTS `asset_depreciation_ledger` (
  `id` int NOT NULL AUTO_INCREMENT,
  `asset_id` int NOT NULL,
  `period_year` int NOT NULL,
  `period_month` tinyint NOT NULL,
  `depreciation_amount` decimal(18,2) NOT NULL DEFAULT '0.00',
  `accumulated_after` decimal(18,2) NOT NULL DEFAULT '0.00',
  `book_value_after` decimal(18,2) NOT NULL DEFAULT '0.00',
  `posted_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `posted_by` int DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_depreciation_ledger` (`asset_id`,`period_year`,`period_month`),
  KEY `posted_by` (`posted_by`),
  CONSTRAINT `asset_depreciation_ledger_ibfk_1` FOREIGN KEY (`asset_id`) REFERENCES `assets` (`id`) ON DELETE CASCADE,
  CONSTRAINT `asset_depreciation_ledger_ibfk_2` FOREIGN KEY (`posted_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;



CREATE TABLE IF NOT EXISTS `asset_depreciation_periods` (
  `id` int NOT NULL AUTO_INCREMENT,
  `period_year` int NOT NULL,
  `period_month` tinyint NOT NULL,
  `status` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'closed',
  `closed_at` timestamp NULL DEFAULT NULL,
  `closed_by` int DEFAULT NULL,
  `reopened_at` timestamp NULL DEFAULT NULL,
  `reopened_by` int DEFAULT NULL,
  `notes` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_depreciation_period` (`period_year`,`period_month`),
  KEY `closed_by` (`closed_by`),
  KEY `reopened_by` (`reopened_by`),
  CONSTRAINT `asset_depreciation_periods_ibfk_1` FOREIGN KEY (`closed_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `asset_depreciation_periods_ibfk_2` FOREIGN KEY (`reopened_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;



CREATE TABLE IF NOT EXISTS `asset_disposals` (
  `id` int NOT NULL AUTO_INCREMENT,
  `asset_id` int NOT NULL,
  `status` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'requested',
  `reason` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `disposal_method` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `buyer` varchar(200) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `planned_date` date DEFAULT NULL,
  `disposal_date` date DEFAULT NULL,
  `proceeds` decimal(18,2) NOT NULL DEFAULT '0.00',
  `book_value_at_disposal` decimal(18,2) DEFAULT NULL,
  `gain_loss` decimal(18,2) DEFAULT NULL,
  `document_id` int DEFAULT NULL,
  `previous_status` varchar(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `requested_by` int DEFAULT NULL,
  `requested_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `approved_by` int DEFAULT NULL,
  `approved_at` timestamp NULL DEFAULT NULL,
  `rejected_by` int DEFAULT NULL,
  `rejected_at` timestamp NULL DEFAULT NULL,
  `rejection_reason` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `reversed_by` int DEFAULT NULL,
  `reversed_at` timestamp NULL DEFAULT NULL,
  `reversal_reason` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  PRIMARY KEY (`id`),
  KEY `document_id` (`document_id`),
  KEY `requested_by` (`requested_by`),
  KEY `approved_by` (`approved_by`),
  KEY `rejected_by` (`rejected_by`),
  KEY `reversed_by` (`reversed_by`),
  KEY `idx_asset_disposal` (`asset_id`,`status`),
  CONSTRAINT `asset_disposals_ibfk_1` FOREIGN KEY (`asset_id`) REFERENCES `assets` (`id`) ON DELETE CASCADE,
  CONSTRAINT `asset_disposals_ibfk_2` FOREIGN KEY (`document_id`) REFERENCES `asset_documents` (`id`) ON DELETE SET NULL,
  CONSTRAINT `asset_disposals_ibfk_3` FOREIGN KEY (`requested_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `asset_disposals_ibfk_4` FOREIGN KEY (`approved_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `asset_disposals_ibfk_5` FOREIGN KEY (`rejected_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `asset_disposals_ibfk_6` FOREIGN KEY (`reversed_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;



CREATE TABLE IF NOT EXISTS `asset_documents` (
  `id` int NOT NULL AUTO_INCREMENT,
  `asset_id` int NOT NULL,
  `doc_title` varchar(200) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `doc_category` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `file_name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `file_path` varchar(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `file_type` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `file_size` int DEFAULT NULL,
  `uploaded_by` int DEFAULT NULL,
  `uploaded_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `asset_id` (`asset_id`),
  KEY `uploaded_by` (`uploaded_by`),
  CONSTRAINT `asset_documents_ibfk_1` FOREIGN KEY (`asset_id`) REFERENCES `assets` (`id`) ON DELETE CASCADE,
  CONSTRAINT `asset_documents_ibfk_2` FOREIGN KEY (`uploaded_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;



CREATE TABLE IF NOT EXISTS `asset_maintenance_logs` (
  `id` int NOT NULL AUTO_INCREMENT,
  `asset_id` int NOT NULL,
  `maintenance_type` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'corrective',
  `description` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `cost` decimal(18,2) NOT NULL DEFAULT '0.00',
  `performed_by` varchar(200) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `vendor` varchar(200) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `performed_at` date NOT NULL,
  `next_due_date` date DEFAULT NULL,
  `created_by` int DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `asset_id` (`asset_id`),
  KEY `created_by` (`created_by`),
  CONSTRAINT `asset_maintenance_logs_ibfk_1` FOREIGN KEY (`asset_id`) REFERENCES `assets` (`id`) ON DELETE CASCADE,
  CONSTRAINT `asset_maintenance_logs_ibfk_2` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;



CREATE TABLE IF NOT EXISTS `asset_purchase_history` (
  `id` int NOT NULL AUTO_INCREMENT,
  `asset_id` int NOT NULL,
  `purchase_order_item_id` int DEFAULT NULL,
  `description` varchar(300) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `amount` decimal(18,2) NOT NULL DEFAULT '0.00',
  `purchase_date` date NOT NULL,
  `vendor` varchar(200) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `notes` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `created_by` int DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `entry_type` varchar(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'expense',
  `capitalized_at` date DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `asset_id` (`asset_id`),
  KEY `purchase_order_item_id` (`purchase_order_item_id`),
  KEY `created_by` (`created_by`),
  CONSTRAINT `asset_purchase_history_ibfk_1` FOREIGN KEY (`asset_id`) REFERENCES `assets` (`id`) ON DELETE CASCADE,
  CONSTRAINT `asset_purchase_history_ibfk_2` FOREIGN KEY (`purchase_order_item_id`) REFERENCES `purchase_order_items` (`id`) ON DELETE SET NULL,
  CONSTRAINT `asset_purchase_history_ibfk_3` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;



CREATE TABLE IF NOT EXISTS `asset_status_history` (
  `id` int NOT NULL AUTO_INCREMENT,
  `asset_id` int NOT NULL,
  `from_status` varchar(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `to_status` varchar(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `note` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `changed_by` int DEFAULT NULL,
  `changed_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `changed_by` (`changed_by`),
  KEY `idx_asset_status_history` (`asset_id`,`changed_at`),
  CONSTRAINT `asset_status_history_ibfk_1` FOREIGN KEY (`asset_id`) REFERENCES `assets` (`id`) ON DELETE CASCADE,
  CONSTRAINT `asset_status_history_ibfk_2` FOREIGN KEY (`changed_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;



CREATE TABLE IF NOT EXISTS `assets` (
  `id` int NOT NULL AUTO_INCREMENT,
  `asset_code` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `category_id` int NOT NULL,
  `production_line_id` int DEFAULT NULL,
  `pnid_tag` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `name` varchar(200) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `location` varchar(200) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `spec` json DEFAULT NULL,
  `purchase_date` date DEFAULT NULL,
  `purchase_price` decimal(18,2) NOT NULL DEFAULT '0.00',
  `vendor` varchar(200) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `useful_life_years` int NOT NULL DEFAULT '1',
  `salvage_value` decimal(18,2) NOT NULL DEFAULT '0.00',
  `depreciation_method` varchar(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'straight_line',
  `status` varchar(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'active',
  `disposed_date` date DEFAULT NULL,
  `notes` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `created_by` int DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `pnid_id` int DEFAULT NULL,
  `in_service_date` date DEFAULT NULL,
  `depreciation_rate` decimal(6,4) DEFAULT NULL,
  `is_deleted` tinyint(1) NOT NULL DEFAULT '0',
  `deleted_at` timestamp NULL DEFAULT NULL,
  `deleted_by` int DEFAULT NULL,
  `deletion_reason` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  PRIMARY KEY (`id`),
  UNIQUE KEY `asset_code` (`asset_code`),
  KEY `category_id` (`category_id`),
  KEY `production_line_id` (`production_line_id`),
  KEY `created_by` (`created_by`),
  KEY `idx_assets_is_deleted` (`is_deleted`),
  CONSTRAINT `assets_ibfk_1` FOREIGN KEY (`category_id`) REFERENCES `asset_categories` (`id`),
  CONSTRAINT `assets_ibfk_2` FOREIGN KEY (`production_line_id`) REFERENCES `production_lines` (`id`) ON DELETE SET NULL,
  CONSTRAINT `assets_ibfk_3` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;



CREATE TABLE IF NOT EXISTS `attendance_logs` (
  `id` int NOT NULL AUTO_INCREMENT,
  `employee_id` int NOT NULL,
  `date` date NOT NULL,
  `check_in` time DEFAULT NULL,
  `check_out` time DEFAULT NULL,
  `status` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `notes` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `project_id` int DEFAULT NULL,
  `timesheet_value` decimal(3,1) DEFAULT '1.0',
  `overtime_hours` decimal(4,1) DEFAULT '0.0',
  `gps_lat` decimal(10,7) DEFAULT NULL,
  `gps_lng` decimal(10,7) DEFAULT NULL,
  `gps_verified` tinyint(1) DEFAULT '0',
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_employee_date` (`employee_id`,`date`),
  KEY `idx_date` (`date`),
  CONSTRAINT `attendance_logs_ibfk_1` FOREIGN KEY (`employee_id`) REFERENCES `employees` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;



CREATE TABLE IF NOT EXISTS `audit_log` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int DEFAULT NULL,
  `action` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `entity_type` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `entity_id` int DEFAULT NULL,
  `old_values` json DEFAULT NULL,
  `new_values` json DEFAULT NULL,
  `ip_address` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_created_at` (`created_at`),
  KEY `idx_entity_type` (`entity_type`),
  KEY `idx_user_id` (`user_id`),
  CONSTRAINT `audit_log_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;



CREATE TABLE IF NOT EXISTS `batches` (
  `id` int NOT NULL AUTO_INCREMENT,
  `batch_number` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `product_id` int NOT NULL,
  `quantity` decimal(15,4) NOT NULL,
  `manufacture_date` date DEFAULT NULL,
  `expiry_date` date DEFAULT NULL,
  `status` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT 'ACTIVE',
  `warehouse_id` int DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `batch_number` (`batch_number`),
  KEY `warehouse_id` (`warehouse_id`),
  KEY `idx_batch_number` (`batch_number`),
  KEY `idx_product_id` (`product_id`),
  KEY `idx_expiry_date` (`expiry_date`),
  CONSTRAINT `batches_ibfk_1` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`),
  CONSTRAINT `batches_ibfk_2` FOREIGN KEY (`warehouse_id`) REFERENCES `warehouses` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;



CREATE TABLE IF NOT EXISTS `bom_details` (
  `id` int NOT NULL AUTO_INCREMENT,
  `bom_header_id` int NOT NULL,
  `raw_material_id` int NOT NULL,
  `quantity` decimal(15,4) NOT NULL,
  `unit_of_measure_id` int DEFAULT NULL,
  `sequence` int DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `raw_material_id` (`raw_material_id`),
  KEY `unit_of_measure_id` (`unit_of_measure_id`),
  KEY `idx_bom_header_id` (`bom_header_id`),
  CONSTRAINT `bom_details_ibfk_1` FOREIGN KEY (`bom_header_id`) REFERENCES `bom_headers` (`id`) ON DELETE CASCADE,
  CONSTRAINT `bom_details_ibfk_2` FOREIGN KEY (`raw_material_id`) REFERENCES `products` (`id`),
  CONSTRAINT `bom_details_ibfk_3` FOREIGN KEY (`unit_of_measure_id`) REFERENCES `uom` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;



CREATE TABLE IF NOT EXISTS `bom_headers` (
  `id` int NOT NULL AUTO_INCREMENT,
  `product_name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `product_id` int DEFAULT NULL,
  `version` int DEFAULT '1',
  `status` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT 'ACTIVE',
  `notes` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `created_by` int DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `approval_status` tinyint DEFAULT '0' COMMENT '0=pending, 1=supervisor, 2=fully approved, -1=rejected',
  `approved_by_supervisor_id` int DEFAULT NULL,
  `approved_by_manager_id` int DEFAULT NULL,
  `approved_at_supervisor` timestamp NULL DEFAULT NULL,
  `approved_at_manager` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_product_id` (`product_id`),
  KEY `idx_status` (`status`),
  KEY `idx_created_by` (`created_by`),
  CONSTRAINT `bom_headers_ibfk_1` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE CASCADE,
  CONSTRAINT `bom_headers_ibfk_2` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;



CREATE TABLE IF NOT EXISTS `categories` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `code` varchar(10) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `description` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `active` tinyint(1) DEFAULT '1',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `name` (`name`),
  KEY `idx_name` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;



CREATE TABLE IF NOT EXISTS `client_estimates` (
  `id` int NOT NULL AUTO_INCREMENT,
  `client_id` int NOT NULL,
  `estimate_number` varchar(50) NOT NULL,
  `estimate_date` date NOT NULL,
  `valid_until` date DEFAULT NULL,
  `total_amount` decimal(15,2) NOT NULL,
  `status` enum('draft','sent','accepted','rejected','expired') DEFAULT 'draft',
  `notes` text,
  `created_by` int DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `estimate_number` (`estimate_number`),
  KEY `created_by` (`created_by`),
  KEY `idx_estimates_client` (`client_id`),
  KEY `idx_estimates_status` (`status`),
  CONSTRAINT `client_estimates_ibfk_1` FOREIGN KEY (`client_id`) REFERENCES `clients` (`id`) ON DELETE CASCADE,
  CONSTRAINT `client_estimates_ibfk_2` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;



CREATE TABLE IF NOT EXISTS `client_events` (
  `id` int NOT NULL AUTO_INCREMENT,
  `client_id` int DEFAULT NULL,
  `contact_id` int DEFAULT NULL,
  `project_id` int DEFAULT NULL,
  `event_type_id` int NOT NULL,
  `title` varchar(255) NOT NULL,
  `description` text,
  `event_date` date NOT NULL,
  `start_time` time DEFAULT NULL,
  `end_time` time DEFAULT NULL,
  `location` varchar(255) DEFAULT NULL,
  `attendees` text,
  `reminder_minutes` int DEFAULT '0',
  `created_by` int DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `contact_id` (`contact_id`),
  KEY `project_id` (`project_id`),
  KEY `created_by` (`created_by`),
  KEY `idx_events_client` (`client_id`),
  KEY `idx_events_date` (`event_date`),
  KEY `idx_events_type` (`event_type_id`),
  CONSTRAINT `client_events_ibfk_1` FOREIGN KEY (`client_id`) REFERENCES `clients` (`id`) ON DELETE CASCADE,
  CONSTRAINT `client_events_ibfk_2` FOREIGN KEY (`contact_id`) REFERENCES `contacts` (`id`) ON DELETE SET NULL,
  CONSTRAINT `client_events_ibfk_3` FOREIGN KEY (`project_id`) REFERENCES `client_projects` (`id`) ON DELETE SET NULL,
  CONSTRAINT `client_events_ibfk_4` FOREIGN KEY (`event_type_id`) REFERENCES `event_types` (`id`) ON DELETE CASCADE,
  CONSTRAINT `client_events_ibfk_5` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;



CREATE TABLE IF NOT EXISTS `client_groups` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(50) NOT NULL,
  `color` varchar(20) DEFAULT 'gray',
  `description` text,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `name` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;



CREATE TABLE IF NOT EXISTS `client_invoices` (
  `id` int NOT NULL AUTO_INCREMENT,
  `client_id` int NOT NULL,
  `invoice_number` varchar(50) NOT NULL,
  `project_id` int DEFAULT NULL,
  `invoice_date` date NOT NULL,
  `due_date` date DEFAULT NULL,
  `subtotal` decimal(15,2) NOT NULL,
  `tax_amount` decimal(15,2) DEFAULT '0.00',
  `total_amount` decimal(15,2) NOT NULL,
  `paid_amount` decimal(15,2) DEFAULT '0.00',
  `status` enum('draft','sent','partial','paid','overdue','canceled') DEFAULT 'draft',
  `payment_terms` varchar(100) DEFAULT NULL,
  `notes` text,
  `created_by` int DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `invoice_number` (`invoice_number`),
  KEY `project_id` (`project_id`),
  KEY `created_by` (`created_by`),
  KEY `idx_invoices_client` (`client_id`),
  KEY `idx_invoices_status` (`status`),
  KEY `idx_invoices_dates` (`invoice_date`,`due_date`),
  CONSTRAINT `client_invoices_ibfk_1` FOREIGN KEY (`client_id`) REFERENCES `clients` (`id`) ON DELETE CASCADE,
  CONSTRAINT `client_invoices_ibfk_2` FOREIGN KEY (`project_id`) REFERENCES `client_projects` (`id`) ON DELETE SET NULL,
  CONSTRAINT `client_invoices_ibfk_3` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;



CREATE TABLE IF NOT EXISTS `client_label_map` (
  `id` int NOT NULL AUTO_INCREMENT,
  `client_id` int NOT NULL,
  `label_id` int NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_client_label` (`client_id`,`label_id`),
  KEY `label_id` (`label_id`),
  CONSTRAINT `client_label_map_ibfk_1` FOREIGN KEY (`client_id`) REFERENCES `clients` (`id`) ON DELETE CASCADE,
  CONSTRAINT `client_label_map_ibfk_2` FOREIGN KEY (`label_id`) REFERENCES `client_labels` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;



CREATE TABLE IF NOT EXISTS `client_labels` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(50) NOT NULL,
  `color` varchar(20) DEFAULT 'blue',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `name` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;



CREATE TABLE IF NOT EXISTS `client_orders` (
  `id` int NOT NULL AUTO_INCREMENT,
  `client_id` int NOT NULL,
  `order_number` varchar(50) NOT NULL,
  `order_date` date NOT NULL,
  `total_amount` decimal(15,2) NOT NULL,
  `status` enum('draft','confirmed','processing','shipped','delivered','canceled') DEFAULT 'draft',
  `notes` text,
  `created_by` int DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `order_number` (`order_number`),
  KEY `created_by` (`created_by`),
  KEY `idx_orders_client` (`client_id`),
  KEY `idx_orders_status` (`status`),
  CONSTRAINT `client_orders_ibfk_1` FOREIGN KEY (`client_id`) REFERENCES `clients` (`id`) ON DELETE CASCADE,
  CONSTRAINT `client_orders_ibfk_2` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;



CREATE TABLE IF NOT EXISTS `client_payments` (
  `id` int NOT NULL AUTO_INCREMENT,
  `client_id` int NOT NULL,
  `invoice_id` int DEFAULT NULL,
  `payment_date` date NOT NULL,
  `amount` decimal(15,2) NOT NULL,
  `payment_method` varchar(50) DEFAULT NULL,
  `reference_number` varchar(100) DEFAULT NULL,
  `notes` text,
  `created_by` int DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `client_id` (`client_id`),
  KEY `invoice_id` (`invoice_id`),
  KEY `created_by` (`created_by`),
  CONSTRAINT `client_payments_ibfk_1` FOREIGN KEY (`client_id`) REFERENCES `clients` (`id`) ON DELETE CASCADE,
  CONSTRAINT `client_payments_ibfk_2` FOREIGN KEY (`invoice_id`) REFERENCES `client_invoices` (`id`) ON DELETE SET NULL,
  CONSTRAINT `client_payments_ibfk_3` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;



CREATE TABLE IF NOT EXISTS `client_projects` (
  `id` int NOT NULL AUTO_INCREMENT,
  `client_id` int NOT NULL,
  `proposal_id` int DEFAULT NULL,
  `project_number` varchar(50) NOT NULL,
  `project_name` varchar(255) NOT NULL,
  `description` text,
  `start_date` date DEFAULT NULL,
  `end_date` date DEFAULT NULL,
  `budget` decimal(15,2) DEFAULT NULL,
  `actual_cost` decimal(15,2) DEFAULT '0.00',
  `status` enum('draft','open','in_progress','completed','hold','canceled') DEFAULT 'open',
  `progress_percentage` tinyint DEFAULT '0',
  `assigned_to` int DEFAULT NULL,
  `created_by` int DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `project_number` (`project_number`),
  UNIQUE KEY `uq_client_projects_number` (`project_number`),
  UNIQUE KEY `uq_project_proposal` (`proposal_id`),
  KEY `assigned_to` (`assigned_to`),
  KEY `created_by` (`created_by`),
  KEY `idx_projects_client` (`client_id`),
  KEY `idx_projects_status` (`status`),
  KEY `idx_projects_dates` (`start_date`,`end_date`),
  KEY `idx_project_proposal` (`proposal_id`),
  CONSTRAINT `client_projects_ibfk_1` FOREIGN KEY (`client_id`) REFERENCES `clients` (`id`) ON DELETE CASCADE,
  CONSTRAINT `client_projects_ibfk_2` FOREIGN KEY (`assigned_to`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `client_projects_ibfk_3` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_project_proposal` FOREIGN KEY (`proposal_id`) REFERENCES `proposals` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;



CREATE TABLE IF NOT EXISTS `client_proposals` (
  `id` int NOT NULL AUTO_INCREMENT,
  `client_id` int NOT NULL,
  `proposal_number` varchar(50) NOT NULL,
  `title` varchar(255) NOT NULL,
  `proposal_date` date NOT NULL,
  `total_amount` decimal(15,2) DEFAULT NULL,
  `status` enum('draft','sent','accepted','rejected','in_progress') DEFAULT 'draft',
  `notes` text,
  `created_by` int DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `proposal_number` (`proposal_number`),
  KEY `created_by` (`created_by`),
  KEY `idx_proposals_client` (`client_id`),
  KEY `idx_proposals_status` (`status`),
  CONSTRAINT `client_proposals_ibfk_1` FOREIGN KEY (`client_id`) REFERENCES `clients` (`id`) ON DELETE CASCADE,
  CONSTRAINT `client_proposals_ibfk_2` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;



CREATE TABLE IF NOT EXISTS `client_tickets` (
  `id` int NOT NULL AUTO_INCREMENT,
  `client_id` int NOT NULL,
  `contact_id` int DEFAULT NULL,
  `ticket_number` varchar(50) NOT NULL,
  `subject` varchar(255) NOT NULL,
  `description` text,
  `priority` enum('low','normal','high','urgent') DEFAULT 'normal',
  `status` enum('open','in_progress','waiting','closed') DEFAULT 'open',
  `assigned_to` int DEFAULT NULL,
  `created_by` int DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `ticket_number` (`ticket_number`),
  KEY `contact_id` (`contact_id`),
  KEY `assigned_to` (`assigned_to`),
  KEY `created_by` (`created_by`),
  KEY `idx_tickets_client` (`client_id`),
  KEY `idx_tickets_status` (`status`),
  CONSTRAINT `client_tickets_ibfk_1` FOREIGN KEY (`client_id`) REFERENCES `clients` (`id`) ON DELETE CASCADE,
  CONSTRAINT `client_tickets_ibfk_2` FOREIGN KEY (`contact_id`) REFERENCES `contacts` (`id`) ON DELETE SET NULL,
  CONSTRAINT `client_tickets_ibfk_3` FOREIGN KEY (`assigned_to`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `client_tickets_ibfk_4` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;



CREATE TABLE IF NOT EXISTS `clients` (
  `id` int NOT NULL AUTO_INCREMENT,
  `code` varchar(50) NOT NULL,
  `client_type` varchar(50) DEFAULT 'buyer',
  `name` varchar(255) NOT NULL,
  `organization` varchar(255) DEFAULT NULL,
  `address` text,
  `city` varchar(100) DEFAULT NULL,
  `province` varchar(100) DEFAULT NULL,
  `postal_code` varchar(20) DEFAULT NULL,
  `phone` varchar(50) DEFAULT NULL,
  `website` varchar(255) DEFAULT NULL,
  `client_group_id` int DEFAULT NULL,
  `primary_contact_id` int DEFAULT NULL,
  `total_invoiced` decimal(15,2) DEFAULT '0.00',
  `payment_received` decimal(15,2) DEFAULT '0.00',
  `due_amount` decimal(15,2) DEFAULT '0.00',
  `is_active` tinyint DEFAULT '1',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `code` (`code`),
  KEY `idx_clients_code` (`code`),
  KEY `idx_clients_name` (`name`),
  KEY `idx_clients_group` (`client_group_id`),
  KEY `idx_clients_active` (`is_active`),
  CONSTRAINT `clients_ibfk_1` FOREIGN KEY (`client_group_id`) REFERENCES `client_groups` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;



CREATE TABLE IF NOT EXISTS `cogs_tracking` (
  `id` int NOT NULL AUTO_INCREMENT,
  `wo_id` int DEFAULT NULL,
  `batch_id` int DEFAULT NULL,
  `product_id` int NOT NULL,
  `raw_material_cost` decimal(15,2) DEFAULT '0.00',
  `labor_cost` decimal(15,2) DEFAULT '0.00',
  `overhead_cost` decimal(15,2) DEFAULT '0.00',
  `total_cogs` decimal(15,2) DEFAULT '0.00',
  `period_date` date DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `wo_id` (`wo_id`),
  KEY `batch_id` (`batch_id`),
  KEY `idx_product_id` (`product_id`),
  KEY `idx_period_date` (`period_date`),
  CONSTRAINT `cogs_tracking_ibfk_1` FOREIGN KEY (`wo_id`) REFERENCES `work_orders` (`id`),
  CONSTRAINT `cogs_tracking_ibfk_2` FOREIGN KEY (`batch_id`) REFERENCES `batches` (`id`),
  CONSTRAINT `cogs_tracking_ibfk_3` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;



CREATE TABLE IF NOT EXISTS `contacts` (
  `id` int NOT NULL AUTO_INCREMENT,
  `client_id` int NOT NULL,
  `name` varchar(255) NOT NULL,
  `job_title` varchar(100) DEFAULT NULL,
  `email` varchar(255) DEFAULT NULL,
  `phone` varchar(50) DEFAULT NULL,
  `mobile` varchar(50) DEFAULT NULL,
  `is_primary` tinyint DEFAULT '0',
  `avatar_url` varchar(255) DEFAULT NULL,
  `last_login` timestamp NULL DEFAULT NULL,
  `is_active` tinyint DEFAULT '1',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_contacts_client` (`client_id`),
  KEY `idx_contacts_email` (`email`),
  KEY `idx_contacts_primary` (`is_primary`),
  CONSTRAINT `contacts_ibfk_1` FOREIGN KEY (`client_id`) REFERENCES `clients` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;



CREATE TABLE IF NOT EXISTS `crm_notes` (
  `id` int NOT NULL AUTO_INCREMENT,
  `title` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `content` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `color` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT 'yellow',
  `is_pinned` tinyint DEFAULT '0',
  `category` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT 'general',
  `linked_type` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `linked_id` int DEFAULT NULL,
  `linked_name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_by` int DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_category` (`category`),
  KEY `idx_pinned` (`is_pinned`),
  KEY `idx_linked` (`linked_type`,`linked_id`),
  KEY `idx_created_by` (`created_by`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;



CREATE TABLE IF NOT EXISTS `customers` (
  `id` int NOT NULL AUTO_INCREMENT,
  `code` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(150) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `contact_person` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `email` varchar(150) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `phone` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `address` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `city` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `country` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `tax_id` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `is_active` tinyint(1) DEFAULT '1',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `code` (`code`),
  KEY `idx_code` (`code`),
  KEY `idx_is_active` (`is_active`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;



CREATE TABLE IF NOT EXISTS `deal_pr_jobs` (
  `id` int NOT NULL AUTO_INCREMENT,
  `proposal_id` int NOT NULL,
  `project_id` int DEFAULT NULL,
  `status` enum('pending','success','failed','skipped') NOT NULL DEFAULT 'pending',
  `attempts` int NOT NULL DEFAULT '0',
  `last_error` text,
  `pr_id` int DEFAULT NULL,
  `pr_number` varchar(100) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_deal_pr_proposal` (`proposal_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;



CREATE TABLE IF NOT EXISTS `deliveries` (
  `id` int NOT NULL AUTO_INCREMENT,
  `do_number` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `so_id` int NOT NULL,
  `delivery_date` date NOT NULL,
  `status` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT 'DRAFT',
  `tracking_number` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `notes` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `do_number` (`do_number`),
  KEY `idx_do_number` (`do_number`),
  KEY `idx_so_id` (`so_id`),
  KEY `idx_status` (`status`),
  CONSTRAINT `deliveries_ibfk_1` FOREIGN KEY (`so_id`) REFERENCES `sales_orders` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;



CREATE TABLE IF NOT EXISTS `delivery_items` (
  `id` int NOT NULL AUTO_INCREMENT,
  `delivery_id` int NOT NULL,
  `so_item_id` int DEFAULT NULL,
  `product_id` int NOT NULL,
  `quantity_delivered` decimal(15,4) NOT NULL,
  `batch_number` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `product_id` (`product_id`),
  KEY `idx_delivery_id` (`delivery_id`),
  CONSTRAINT `delivery_items_ibfk_1` FOREIGN KEY (`delivery_id`) REFERENCES `deliveries` (`id`) ON DELETE CASCADE,
  CONSTRAINT `delivery_items_ibfk_2` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;



CREATE TABLE IF NOT EXISTS `departments` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `code` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `head_user_id` int DEFAULT NULL,
  `active` tinyint(1) DEFAULT '1',
  PRIMARY KEY (`id`),
  UNIQUE KEY `name` (`name`),
  KEY `idx_name` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;



CREATE TABLE IF NOT EXISTS `document_access_log` (
  `id` int NOT NULL AUTO_INCREMENT,
  `document_id` int NOT NULL,
  `user_id` int DEFAULT NULL,
  `action` enum('view','download') DEFAULT 'view',
  `accessed_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `document_id` (`document_id`),
  CONSTRAINT `document_access_log_ibfk_1` FOREIGN KEY (`document_id`) REFERENCES `documents` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;



CREATE TABLE IF NOT EXISTS `document_categories` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(100) NOT NULL,
  `code` varchar(20) NOT NULL,
  `icon` varchar(10) DEFAULT 0xF09F9384,
  `color` varchar(20) DEFAULT '#3b82f6',
  `description` text,
  `sort_order` int DEFAULT '0',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `code` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;



CREATE TABLE IF NOT EXISTS `document_counters` (
  `prefix` varchar(20) NOT NULL,
  `date_part` char(8) NOT NULL,
  `last_no` int NOT NULL DEFAULT '0',
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`prefix`,`date_part`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;



CREATE TABLE IF NOT EXISTS `documents` (
  `id` int NOT NULL AUTO_INCREMENT,
  `doc_number` varchar(50) NOT NULL,
  `title` varchar(255) NOT NULL,
  `category_id` int NOT NULL,
  `doc_type` enum('procedure','method_statement','work_instruction','standard','policy','template','drawing','other') DEFAULT 'procedure',
  `revision` varchar(10) DEFAULT 'A',
  `status` enum('draft','review','approved','obsolete') DEFAULT 'draft',
  `description` text,
  `file_url` varchar(500) DEFAULT NULL,
  `file_name` varchar(255) DEFAULT NULL,
  `file_size` int DEFAULT NULL,
  `file_type` varchar(50) DEFAULT NULL,
  `project_id` int DEFAULT NULL,
  `discipline` varchar(100) DEFAULT NULL,
  `approved_by` varchar(100) DEFAULT NULL,
  `approved_at` date DEFAULT NULL,
  `effective_date` date DEFAULT NULL,
  `review_date` date DEFAULT NULL,
  `tags` text,
  `uploaded_by` int DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `doc_number` (`doc_number`),
  KEY `category_id` (`category_id`),
  CONSTRAINT `documents_ibfk_1` FOREIGN KEY (`category_id`) REFERENCES `document_categories` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;



CREATE TABLE IF NOT EXISTS `employee_webauthn_credentials` (
  `id` int NOT NULL AUTO_INCREMENT,
  `employee_id` int NOT NULL,
  `credential_id` varchar(512) NOT NULL,
  `public_key` text NOT NULL,
  `counter` bigint DEFAULT '0',
  `device_name` varchar(200) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `last_used_at` timestamp NULL DEFAULT NULL,
  `registered_lat` decimal(10,7) DEFAULT NULL,
  `registered_lng` decimal(10,7) DEFAULT NULL,
  `registered_radius` int DEFAULT '200',
  `location_name` varchar(200) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `credential_id` (`credential_id`),
  KEY `idx_employee` (`employee_id`),
  CONSTRAINT `employee_webauthn_credentials_ibfk_1` FOREIGN KEY (`employee_id`) REFERENCES `employees` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;



CREATE TABLE IF NOT EXISTS `employees` (
  `id` int NOT NULL AUTO_INCREMENT,
  `code` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `user_id` int DEFAULT NULL,
  `name` varchar(150) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `email` varchar(150) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `phone` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `position` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `department_id` int DEFAULT NULL,
  `hire_date` date DEFAULT NULL,
  `salary` decimal(15,2) DEFAULT NULL,
  `status` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT 'ACTIVE',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `basic_rate` decimal(10,2) DEFAULT '0.00',
  `tunjangan_rate` decimal(10,2) DEFAULT '0.00',
  `ot_rate` decimal(10,2) DEFAULT '0.00',
  `salary_type` varchar(10) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT 'daily',
  `mobile_pin` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `mobile_pin_set_at` timestamp NULL DEFAULT NULL,
  `mobile_pin_must_change` tinyint(1) NOT NULL DEFAULT '1',
  `mobile_pin_failed_attempts` int NOT NULL DEFAULT '0',
  `mobile_pin_locked_until` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `code` (`code`),
  KEY `user_id` (`user_id`),
  KEY `idx_code` (`code`),
  KEY `idx_department_id` (`department_id`),
  CONSTRAINT `employees_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`),
  CONSTRAINT `employees_ibfk_2` FOREIGN KEY (`department_id`) REFERENCES `departments` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;



CREATE TABLE IF NOT EXISTS `engineering_inputs` (
  `id` int NOT NULL AUTO_INCREMENT,
  `project_id` int DEFAULT NULL,
  `proposal_id` int DEFAULT NULL,
  `element_type` varchar(50) NOT NULL,
  `element_name` varchar(100) NOT NULL,
  `parameters` json DEFAULT NULL,
  `quantities` json DEFAULT NULL,
  `sort_order` int DEFAULT '0',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `scope_type` varchar(20) DEFAULT NULL,
  `scope_id` int DEFAULT NULL,
  `formula_version` varchar(20) DEFAULT NULL,
  `zone_name` varchar(100) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_mto_scope` (`scope_type`,`scope_id`,`element_type`,`element_name`),
  KEY `idx_proposal_id` (`proposal_id`),
  KEY `idx_mto_scope` (`scope_type`,`scope_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;



CREATE TABLE IF NOT EXISTS `event_types` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(50) NOT NULL,
  `color` varchar(20) DEFAULT 'blue',
  `icon` varchar(50) DEFAULT NULL,
  `is_system` tinyint DEFAULT '0',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `name` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;



CREATE TABLE IF NOT EXISTS `financial_summary` (
  `id` int NOT NULL AUTO_INCREMENT,
  `period_date` date NOT NULL,
  `revenue` decimal(15,2) DEFAULT '0.00',
  `cogs` decimal(15,2) DEFAULT '0.00',
  `gross_profit` decimal(15,2) DEFAULT NULL,
  `operating_expenses` decimal(15,2) DEFAULT '0.00',
  `net_profit` decimal(15,2) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `period_date` (`period_date`),
  KEY `idx_period_date` (`period_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;



CREATE TABLE IF NOT EXISTS `fund_request_documents` (
  `id` int NOT NULL AUTO_INCREMENT,
  `fund_request_id` int NOT NULL,
  `file_name` varchar(255) NOT NULL,
  `original_name` varchar(255) NOT NULL,
  `file_path` varchar(500) NOT NULL,
  `file_size` int DEFAULT '0',
  `file_type` varchar(100) DEFAULT NULL,
  `uploaded_by` int DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `fund_request_id` (`fund_request_id`),
  CONSTRAINT `fund_request_documents_ibfk_1` FOREIGN KEY (`fund_request_id`) REFERENCES `fund_requests` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;



CREATE TABLE IF NOT EXISTS `fund_request_items` (
  `id` int NOT NULL AUTO_INCREMENT,
  `fund_request_id` int NOT NULL,
  `po_id` int DEFAULT NULL,
  `po_schedule_id` int DEFAULT NULL,
  `vendor_id` int DEFAULT NULL,
  `description` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `amount` decimal(15,2) NOT NULL DEFAULT '0.00',
  `status` varchar(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
  `approved_by` int DEFAULT NULL,
  `approved_at` timestamp NULL DEFAULT NULL,
  `rejection_reason` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `ap_id` int DEFAULT NULL,
  `payment_recorded_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_fri_fr` (`fund_request_id`),
  KEY `idx_fri_po` (`po_id`),
  KEY `idx_fri_schedule` (`po_schedule_id`),
  KEY `idx_fri_status` (`status`),
  CONSTRAINT `fk_fri_fr` FOREIGN KEY (`fund_request_id`) REFERENCES `fund_requests` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;



CREATE TABLE IF NOT EXISTS `fund_requests` (
  `id` int NOT NULL AUTO_INCREMENT,
  `request_number` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `request_date` date NOT NULL,
  `po_id` int DEFAULT NULL,
  `po_schedule_id` int DEFAULT NULL,
  `vendor_id` int DEFAULT NULL,
  `project_id` int DEFAULT NULL,
  `amount` decimal(15,2) NOT NULL,
  `needed_date` date NOT NULL,
  `purpose` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `status` varchar(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'draft',
  `requester_id` int DEFAULT NULL,
  `submitted_at` timestamp NULL DEFAULT NULL,
  `approved_by` int DEFAULT NULL,
  `approved_at` timestamp NULL DEFAULT NULL,
  `rejection_reason` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `notes` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `cash_account` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `cash_account_note` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  PRIMARY KEY (`id`),
  UNIQUE KEY `request_number` (`request_number`),
  KEY `idx_fund_requests_status` (`status`),
  KEY `idx_fund_requests_needed_date` (`needed_date`),
  KEY `idx_fund_requests_po` (`po_id`),
  KEY `idx_fund_requests_schedule` (`po_schedule_id`),
  KEY `idx_fr_project` (`project_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;



CREATE TABLE IF NOT EXISTS `goods_receipts` (
  `id` int NOT NULL AUTO_INCREMENT,
  `grn_number` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `po_id` int NOT NULL,
  `warehouse_id` int NOT NULL,
  `received_date` date NOT NULL,
  `received_by` int DEFAULT NULL,
  `status` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT 'DRAFT',
  `notes` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `approval_status` tinyint NOT NULL DEFAULT '0' COMMENT '0=pending,1=sv,2=approved,-1=rejected',
  `approved_by_supervisor_id` int DEFAULT NULL,
  `approved_by_manager_id` int DEFAULT NULL,
  `approved_at_supervisor` timestamp NULL DEFAULT NULL,
  `approved_at_manager` timestamp NULL DEFAULT NULL,
  `is_reversed` tinyint(1) NOT NULL DEFAULT '0',
  `reversed_at` timestamp NULL DEFAULT NULL,
  `reversed_by` int DEFAULT NULL,
  `reversal_reason` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `created_by` int DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `grn_number` (`grn_number`),
  KEY `warehouse_id` (`warehouse_id`),
  KEY `received_by` (`received_by`),
  KEY `idx_grn_number` (`grn_number`),
  KEY `idx_po_id` (`po_id`),
  KEY `idx_grn_is_reversed` (`is_reversed`),
  CONSTRAINT `goods_receipts_ibfk_1` FOREIGN KEY (`po_id`) REFERENCES `purchase_orders` (`id`),
  CONSTRAINT `goods_receipts_ibfk_2` FOREIGN KEY (`warehouse_id`) REFERENCES `warehouses` (`id`),
  CONSTRAINT `goods_receipts_ibfk_3` FOREIGN KEY (`received_by`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;



CREATE TABLE IF NOT EXISTS `grn_items` (
  `id` int NOT NULL AUTO_INCREMENT,
  `grn_id` int NOT NULL,
  `po_item_id` int DEFAULT NULL,
  `product_id` int NOT NULL,
  `quantity_received` decimal(15,4) NOT NULL,
  `batch_number` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `notes` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  PRIMARY KEY (`id`),
  KEY `product_id` (`product_id`),
  KEY `idx_grn_id` (`grn_id`),
  CONSTRAINT `grn_items_ibfk_1` FOREIGN KEY (`grn_id`) REFERENCES `goods_receipts` (`id`) ON DELETE CASCADE,
  CONSTRAINT `grn_items_ibfk_2` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;



CREATE TABLE IF NOT EXISTS `inbox_notifications` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `type` varchar(50) NOT NULL DEFAULT 'system',
  `title` varchar(255) NOT NULL,
  `message` text,
  `link` varchar(255) DEFAULT NULL,
  `ref_id` int DEFAULT NULL,
  `ref_type` varchar(50) DEFAULT NULL,
  `is_read` tinyint(1) DEFAULT '0',
  `created_by` int DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_user_read` (`user_id`,`is_read`),
  KEY `idx_created` (`created_at`),
  CONSTRAINT `inbox_notifications_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;



CREATE TABLE IF NOT EXISTS `inventory_stocks` (
  `id` int NOT NULL AUTO_INCREMENT,
  `warehouse_id` int NOT NULL,
  `product_id` int NOT NULL,
  `quantity` decimal(15,4) NOT NULL DEFAULT '0.0000',
  `reorder_point` decimal(15,4) DEFAULT '0.0000',
  `last_updated` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_warehouse_product` (`warehouse_id`,`product_id`),
  KEY `idx_product_id` (`product_id`),
  KEY `idx_quantity` (`quantity`),
  CONSTRAINT `inventory_stocks_ibfk_1` FOREIGN KEY (`warehouse_id`) REFERENCES `warehouses` (`id`) ON DELETE CASCADE,
  CONSTRAINT `inventory_stocks_ibfk_2` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;



CREATE TABLE IF NOT EXISTS `invoices` (
  `id` int NOT NULL AUTO_INCREMENT,
  `invoice_number` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `so_id` int NOT NULL,
  `invoice_date` date NOT NULL,
  `due_date` date DEFAULT NULL,
  `total_amount` decimal(15,2) DEFAULT '0.00',
  `status` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT 'DRAFT',
  `notes` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `invoice_number` (`invoice_number`),
  KEY `idx_invoice_number` (`invoice_number`),
  KEY `idx_so_id` (`so_id`),
  KEY `idx_status` (`status`),
  CONSTRAINT `invoices_ibfk_1` FOREIGN KEY (`so_id`) REFERENCES `sales_orders` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;



CREATE TABLE IF NOT EXISTS `kasbon_request_items` (
  `id` int NOT NULL AUTO_INCREMENT,
  `kasbon_request_id` int NOT NULL,
  `salary_advance_id` int DEFAULT NULL,
  `employee_id` int DEFAULT NULL,
  `employee_name` varchar(255) DEFAULT NULL,
  `amount` decimal(12,2) DEFAULT '0.00',
  `description` text,
  `advance_date` date DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `kasbon_request_id` (`kasbon_request_id`),
  CONSTRAINT `kasbon_request_items_ibfk_1` FOREIGN KEY (`kasbon_request_id`) REFERENCES `kasbon_requests` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;



CREATE TABLE IF NOT EXISTS `kasbon_requests` (
  `id` int NOT NULL AUTO_INCREMENT,
  `request_number` varchar(50) DEFAULT NULL,
  `request_date` date NOT NULL,
  `due_date` date DEFAULT NULL,
  `total_amount` decimal(12,2) DEFAULT '0.00',
  `purpose` text,
  `notes` text,
  `status` varchar(20) DEFAULT 'draft',
  `approval_status` int DEFAULT '0',
  `requester_id` int DEFAULT NULL,
  `approved_by` int DEFAULT NULL,
  `approved_at` timestamp NULL DEFAULT NULL,
  `project_id` int DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `request_number` (`request_number`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;



CREATE TABLE IF NOT EXISTS `master_disciplines` (
  `id` int NOT NULL AUTO_INCREMENT,
  `code` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(150) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `order_no` int DEFAULT '0',
  `is_active` tinyint(1) DEFAULT '1',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `code` (`code`),
  KEY `idx_code` (`code`),
  KEY `idx_active` (`is_active`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;



CREATE TABLE IF NOT EXISTS `master_equipment` (
  `id` int NOT NULL AUTO_INCREMENT,
  `code` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `satuan` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `harga` decimal(15,2) NOT NULL DEFAULT '0.00',
  `vendor` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `vendor_id` int DEFAULT NULL,
  `is_active` tinyint(1) DEFAULT '1',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_name` (`name`),
  KEY `idx_vendor_id` (`vendor_id`),
  KEY `idx_active` (`is_active`),
  KEY `idx_vendor` (`vendor`),
  CONSTRAINT `master_equipment_ibfk_1` FOREIGN KEY (`vendor_id`) REFERENCES `vendors` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;



CREATE TABLE IF NOT EXISTS `master_labor` (
  `id` int NOT NULL AUTO_INCREMENT,
  `code` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `name` varchar(150) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `satuan` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `harga` decimal(15,2) NOT NULL DEFAULT '0.00',
  `is_active` tinyint(1) DEFAULT '1',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_name` (`name`),
  KEY `idx_active` (`is_active`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;



CREATE TABLE IF NOT EXISTS `master_materials` (
  `id` int NOT NULL AUTO_INCREMENT,
  `code` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `jenis` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `satuan` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `harga` decimal(15,2) NOT NULL DEFAULT '0.00',
  `vendor` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `vendor_id` int DEFAULT NULL,
  `is_active` tinyint(1) DEFAULT '1',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_jenis` (`jenis`),
  KEY `idx_name` (`name`),
  KEY `idx_vendor_id` (`vendor_id`),
  KEY `idx_active` (`is_active`),
  KEY `idx_vendor` (`vendor`),
  CONSTRAINT `master_materials_ibfk_1` FOREIGN KEY (`vendor_id`) REFERENCES `vendors` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;



CREATE TABLE IF NOT EXISTS `master_sub_disciplines` (
  `id` int NOT NULL AUTO_INCREMENT,
  `discipline_id` int NOT NULL,
  `code` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(150) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `order_no` int DEFAULT '0',
  `is_active` tinyint(1) DEFAULT '1',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_discipline` (`discipline_id`),
  KEY `idx_code` (`code`),
  KEY `idx_active` (`is_active`),
  CONSTRAINT `master_sub_disciplines_ibfk_1` FOREIGN KEY (`discipline_id`) REFERENCES `master_disciplines` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;



CREATE TABLE IF NOT EXISTS `material_request_items` (
  `id` int NOT NULL AUTO_INCREMENT,
  `mr_id` int NOT NULL,
  `product_id` int DEFAULT NULL,
  `item_name` varchar(255) NOT NULL,
  `quantity` decimal(12,3) NOT NULL DEFAULT '0.000',
  `uom` varchar(50) DEFAULT 'pcs',
  `notes` varchar(500) DEFAULT NULL,
  `image_url` varchar(500) DEFAULT NULL,
  `spec` varchar(500) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `mr_id` (`mr_id`),
  CONSTRAINT `material_request_items_ibfk_1` FOREIGN KEY (`mr_id`) REFERENCES `material_requests` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;



CREATE TABLE IF NOT EXISTS `material_requests` (
  `id` int NOT NULL AUTO_INCREMENT,
  `mr_number` varchar(50) NOT NULL,
  `employee_id` int DEFAULT NULL,
  `employee_name` varchar(255) DEFAULT NULL,
  `project_id` int DEFAULT NULL,
  `project_name` varchar(255) DEFAULT NULL,
  `status` enum('pending','approved','rejected','fulfilled') DEFAULT 'pending',
  `priority` enum('low','normal','high','urgent') DEFAULT 'normal',
  `needed_by` date DEFAULT NULL,
  `notes` text,
  `approved_by` int DEFAULT NULL,
  `approved_at` datetime DEFAULT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `linked_pr_id` int DEFAULT NULL,
  `linked_pr_number` varchar(100) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `mr_number` (`mr_number`),
  KEY `project_id` (`project_id`),
  CONSTRAINT `material_requests_ibfk_1` FOREIGN KEY (`project_id`) REFERENCES `client_projects` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;



CREATE TABLE IF NOT EXISTS `material_vendor_prices` (
  `id` int NOT NULL AUTO_INCREMENT,
  `material_id` int NOT NULL,
  `vendor_id` int DEFAULT NULL,
  `vendor_name` varchar(255) NOT NULL,
  `source` varchar(255) DEFAULT 'offline',
  `price` decimal(15,2) NOT NULL,
  `currency` varchar(10) DEFAULT 'IDR',
  `unit` varchar(50) DEFAULT NULL,
  `url` text,
  `rating` decimal(3,1) DEFAULT NULL,
  `contact` varchar(255) DEFAULT NULL,
  `location` varchar(255) DEFAULT NULL,
  `min_order_qty` int DEFAULT NULL,
  `lead_time_days` int DEFAULT NULL,
  `notes` text,
  `quoted_at` datetime DEFAULT NULL,
  `valid_until` datetime DEFAULT NULL,
  `created_by` int DEFAULT NULL,
  `is_selected` tinyint(1) DEFAULT '0',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;



CREATE TABLE IF NOT EXISTS `mto_lines` (
  `id` int NOT NULL AUTO_INCREMENT,
  `element_id` int NOT NULL,
  `line_code` varchar(40) NOT NULL,
  `label` varchar(200) DEFAULT NULL,
  `category` varchar(40) DEFAULT NULL,
  `net_quantity` decimal(18,4) NOT NULL DEFAULT '0.0000',
  `waste_percent` decimal(8,3) NOT NULL DEFAULT '0.000',
  `gross_quantity` decimal(18,4) NOT NULL DEFAULT '0.0000',
  `unit` varchar(20) NOT NULL,
  `formula_version` varchar(20) DEFAULT NULL,
  `material_id` int DEFAULT NULL,
  `ahsp_id` int DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_mto_line` (`element_id`,`line_code`),
  KEY `idx_mto_line_element` (`element_id`),
  CONSTRAINT `fk_mto_line_element` FOREIGN KEY (`element_id`) REFERENCES `engineering_inputs` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;



CREATE TABLE IF NOT EXISTS `notifications` (
  `id` int NOT NULL AUTO_INCREMENT,
  `recipient_id` int NOT NULL,
  `sender_id` int DEFAULT NULL,
  `title` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `message` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `type` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `related_entity_type` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `related_entity_id` int DEFAULT NULL,
  `action_url` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `is_read` tinyint(1) DEFAULT '0',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `read_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `sender_id` (`sender_id`),
  KEY `idx_recipient_id` (`recipient_id`),
  KEY `idx_is_read` (`is_read`),
  KEY `idx_created_at` (`created_at`),
  CONSTRAINT `notifications_ibfk_1` FOREIGN KEY (`recipient_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `notifications_ibfk_2` FOREIGN KEY (`sender_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;



CREATE TABLE IF NOT EXISTS `office_locations` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(200) NOT NULL,
  `latitude` decimal(10,7) NOT NULL,
  `longitude` decimal(10,7) NOT NULL,
  `radius_m` int DEFAULT '200',
  `is_active` tinyint(1) DEFAULT '1',
  `project_id` int DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `project_name` varchar(200) DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;



CREATE TABLE IF NOT EXISTS `payment_proofs` (
  `id` int NOT NULL AUTO_INCREMENT,
  `schedule_id` int NOT NULL,
  `source` varchar(20) NOT NULL DEFAULT 'po',
  `file_name` varchar(255) NOT NULL,
  `original_name` varchar(255) NOT NULL,
  `file_path` varchar(500) NOT NULL,
  `file_size` int DEFAULT '0',
  `file_type` varchar(100) DEFAULT NULL,
  `notes` text,
  `uploaded_by` int DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;



CREATE TABLE IF NOT EXISTS `payroll_request_items` (
  `id` int NOT NULL AUTO_INCREMENT,
  `payroll_request_id` int NOT NULL,
  `payslip_record_id` int DEFAULT NULL,
  `employee_id` int NOT NULL,
  `employee_name` varchar(150) DEFAULT NULL,
  `department` varchar(100) DEFAULT NULL,
  `gross_salary` decimal(12,2) DEFAULT '0.00',
  `total_deductions` decimal(12,2) DEFAULT '0.00',
  `net_salary` decimal(12,2) DEFAULT '0.00',
  `notes` text,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_payroll_req` (`payroll_request_id`),
  CONSTRAINT `payroll_request_items_ibfk_1` FOREIGN KEY (`payroll_request_id`) REFERENCES `payroll_requests` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;



CREATE TABLE IF NOT EXISTS `payroll_requests` (
  `id` int NOT NULL AUTO_INCREMENT,
  `request_number` varchar(50) NOT NULL,
  `period_month` int NOT NULL,
  `period_year` int NOT NULL,
  `due_date` date DEFAULT NULL,
  `total_amount` decimal(15,2) DEFAULT '0.00',
  `employee_count` int DEFAULT '0',
  `purpose` varchar(255) DEFAULT NULL,
  `notes` text,
  `status` varchar(30) DEFAULT 'draft',
  `approval_status` int DEFAULT '0',
  `requester_id` int DEFAULT NULL,
  `approved_by` int DEFAULT NULL,
  `approved_at` datetime DEFAULT NULL,
  `project_id` int DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `request_number` (`request_number`),
  KEY `idx_period` (`period_year`,`period_month`),
  KEY `idx_status` (`status`),
  KEY `idx_due_date` (`due_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;



CREATE TABLE IF NOT EXISTS `payslip_records` (
  `id` int NOT NULL AUTO_INCREMENT,
  `employee_id` int NOT NULL,
  `period_month` int NOT NULL,
  `period_year` int NOT NULL,
  `project_id` int DEFAULT NULL,
  `total_days` decimal(5,2) DEFAULT '0.00',
  `total_ot_hours` decimal(6,2) DEFAULT '0.00',
  `basic_salary` decimal(12,2) DEFAULT '0.00',
  `tunjangan` decimal(12,2) DEFAULT '0.00',
  `ot_pay` decimal(12,2) DEFAULT '0.00',
  `gross_salary` decimal(12,2) DEFAULT '0.00',
  `advance_1` decimal(12,2) DEFAULT '0.00',
  `advance_2` decimal(12,2) DEFAULT '0.00',
  `reimbursement` decimal(12,2) DEFAULT '0.00',
  `bpjs_kes` decimal(12,2) DEFAULT '0.00',
  `bpjs_tk` decimal(12,2) DEFAULT '0.00',
  `pph21` decimal(12,2) DEFAULT '0.00',
  `total_deductions` decimal(12,2) DEFAULT '0.00',
  `net_salary` decimal(12,2) DEFAULT '0.00',
  `notes` text,
  `status` varchar(10) DEFAULT 'draft',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_payslip_employee_period` (`employee_id`,`period_month`,`period_year`),
  KEY `employee_id` (`employee_id`),
  CONSTRAINT `payslip_records_ibfk_1` FOREIGN KEY (`employee_id`) REFERENCES `employees` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;



CREATE TABLE IF NOT EXISTS `permissions` (
  `id` int NOT NULL AUTO_INCREMENT,
  `resource` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `action` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `module` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `name` varchar(200) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_resource_action` (`resource`,`action`),
  KEY `idx_resource` (`resource`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;



CREATE TABLE IF NOT EXISTS `pnids` (
  `id` int NOT NULL AUTO_INCREMENT,
  `production_line_id` int NOT NULL,
  `code` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `title` varchar(200) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `description` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `production_line_id` (`production_line_id`),
  CONSTRAINT `pnids_ibfk_1` FOREIGN KEY (`production_line_id`) REFERENCES `production_lines` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;



CREATE TABLE IF NOT EXISTS `position_rates` (
  `id` int NOT NULL AUTO_INCREMENT,
  `position_code` varchar(30) NOT NULL,
  `position_name` varchar(100) NOT NULL,
  `grade` varchar(30) DEFAULT NULL,
  `salary_type` varchar(10) NOT NULL DEFAULT 'daily',
  `basic_rate` decimal(12,2) NOT NULL DEFAULT '0.00',
  `tunjangan_rate` decimal(12,2) NOT NULL DEFAULT '0.00',
  `ot_rate` decimal(12,2) NOT NULL DEFAULT '0.00',
  `description` text,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `position_code` (`position_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;



CREATE TABLE IF NOT EXISTS `pr_bid_documents` (
  `id` int NOT NULL AUTO_INCREMENT,
  `bid_id` int NOT NULL,
  `file_path` varchar(500) NOT NULL,
  `file_name` varchar(255) NOT NULL,
  `file_size` int DEFAULT '0',
  `uploaded_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `bid_id` (`bid_id`),
  CONSTRAINT `pr_bid_documents_ibfk_1` FOREIGN KEY (`bid_id`) REFERENCES `pr_bids` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;



CREATE TABLE IF NOT EXISTS `pr_bid_items` (
  `id` int NOT NULL AUTO_INCREMENT,
  `bid_id` int NOT NULL,
  `item_index` int NOT NULL DEFAULT '0',
  `item_name` varchar(255) DEFAULT NULL,
  `quantity` decimal(18,4) DEFAULT '0.0000',
  `uom` varchar(50) DEFAULT NULL,
  `unit_price` decimal(18,2) DEFAULT '0.00',
  `ref_price` decimal(18,2) DEFAULT '0.00',
  `price_source` varchar(20) DEFAULT 'manual',
  `total_price` decimal(18,2) DEFAULT '0.00',
  `notes` text,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `is_winner` tinyint(1) DEFAULT '0',
  PRIMARY KEY (`id`),
  KEY `bid_id` (`bid_id`),
  CONSTRAINT `pr_bid_items_ibfk_1` FOREIGN KEY (`bid_id`) REFERENCES `pr_bids` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;



CREATE TABLE IF NOT EXISTS `pr_bids` (
  `id` int NOT NULL AUTO_INCREMENT,
  `pr_id` int NOT NULL,
  `vendor_id` int DEFAULT NULL,
  `vendor_name` varchar(255) NOT NULL,
  `contact_person` varchar(255) DEFAULT NULL,
  `phone` varchar(100) DEFAULT NULL,
  `email` varchar(255) DEFAULT NULL,
  `bid_date` date DEFAULT NULL,
  `total_amount` decimal(18,2) DEFAULT '0.00',
  `status` enum('active','selected','rejected') DEFAULT 'active',
  `delivery_time_days` int DEFAULT NULL,
  `notes` text,
  `quotation_file` varchar(500) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `pr_id` (`pr_id`),
  KEY `vendor_id` (`vendor_id`),
  CONSTRAINT `pr_bids_ibfk_1` FOREIGN KEY (`pr_id`) REFERENCES `purchase_requests` (`id`) ON DELETE CASCADE,
  CONSTRAINT `pr_bids_ibfk_2` FOREIGN KEY (`vendor_id`) REFERENCES `vendors` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;



CREATE TABLE IF NOT EXISTS `product_types` (
  `id` int NOT NULL AUTO_INCREMENT,
  `code` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `active` tinyint(1) DEFAULT '1',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `code` (`code`),
  KEY `idx_code` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;



CREATE TABLE IF NOT EXISTS `production_events` (
  `id` int NOT NULL AUTO_INCREMENT,
  `type` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `title` varchar(150) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `event_date` date NOT NULL,
  `event_time` time DEFAULT NULL,
  `location` varchar(150) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_event_date` (`event_date`),
  KEY `idx_type` (`type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;



CREATE TABLE IF NOT EXISTS `production_lines` (
  `id` int NOT NULL AUTO_INCREMENT,
  `code` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `name` varchar(150) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;



CREATE TABLE IF NOT EXISTS `production_tasks` (
  `id` int NOT NULL AUTO_INCREMENT,
  `task_name` varchar(150) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `wo_id` int DEFAULT NULL,
  `assigned_to_user_id` int DEFAULT NULL,
  `priority` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT 'medium',
  `due_date` date DEFAULT NULL,
  `status` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT 'pending',
  `description` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `wo_id` (`wo_id`),
  KEY `assigned_to_user_id` (`assigned_to_user_id`),
  KEY `idx_status` (`status`),
  KEY `idx_due_date` (`due_date`),
  CONSTRAINT `production_tasks_ibfk_1` FOREIGN KEY (`wo_id`) REFERENCES `work_orders` (`id`),
  CONSTRAINT `production_tasks_ibfk_2` FOREIGN KEY (`assigned_to_user_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;



CREATE TABLE IF NOT EXISTS `products` (
  `id` int NOT NULL AUTO_INCREMENT,
  `sku` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(200) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `image_url` varchar(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `spec` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `category_id` int DEFAULT NULL,
  `product_type_id` int DEFAULT NULL,
  `unit_of_measure_id` int DEFAULT NULL,
  `standard_cost` decimal(15,2) DEFAULT '0.00',
  `reorder_point` int DEFAULT '0',
  `lead_time_days` int DEFAULT '0',
  `active` tinyint(1) DEFAULT '1',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `sku` (`sku`),
  KEY `product_type_id` (`product_type_id`),
  KEY `unit_of_measure_id` (`unit_of_measure_id`),
  KEY `idx_sku` (`sku`),
  KEY `idx_category_id` (`category_id`),
  KEY `idx_active` (`active`),
  CONSTRAINT `products_ibfk_1` FOREIGN KEY (`category_id`) REFERENCES `categories` (`id`),
  CONSTRAINT `products_ibfk_2` FOREIGN KEY (`product_type_id`) REFERENCES `product_types` (`id`),
  CONSTRAINT `products_ibfk_3` FOREIGN KEY (`unit_of_measure_id`) REFERENCES `uom` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;



CREATE TABLE IF NOT EXISTS `profitability_tracking` (
  `id` int NOT NULL AUTO_INCREMENT,
  `product_id` int NOT NULL,
  `period_date` date DEFAULT NULL,
  `revenue` decimal(15,2) DEFAULT '0.00',
  `cogs` decimal(15,2) DEFAULT '0.00',
  `gross_profit` decimal(15,2) DEFAULT NULL,
  `margin_percentage` decimal(5,2) DEFAULT NULL,
  `units_sold` int DEFAULT '0',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_product_period` (`product_id`,`period_date`),
  KEY `idx_period_date` (`period_date`),
  CONSTRAINT `profitability_tracking_ibfk_1` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;



CREATE TABLE IF NOT EXISTS `project_activities` (
  `id` int NOT NULL AUTO_INCREMENT,
  `project_id` int NOT NULL,
  `user_id` int DEFAULT NULL,
  `action_type` varchar(50) NOT NULL,
  `description` text,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `project_id` (`project_id`),
  KEY `user_id` (`user_id`),
  CONSTRAINT `project_activities_ibfk_1` FOREIGN KEY (`project_id`) REFERENCES `client_projects` (`id`) ON DELETE CASCADE,
  CONSTRAINT `project_activities_ibfk_2` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;



CREATE TABLE IF NOT EXISTS `project_expenses` (
  `id` int NOT NULL AUTO_INCREMENT,
  `project_id` int NOT NULL,
  `expense_number` varchar(50) NOT NULL,
  `category` enum('material','labor','equipment','subcontractor','overhead','transport','salary','kasbon','other') NOT NULL DEFAULT 'other',
  `description` varchar(500) NOT NULL,
  `amount` decimal(15,2) NOT NULL DEFAULT '0.00',
  `expense_date` date NOT NULL,
  `vendor_id` int DEFAULT NULL,
  `receipt_number` varchar(100) DEFAULT NULL,
  `status` enum('draft','submitted','approved','rejected','paid') DEFAULT 'draft',
  `notes` text,
  `created_by` int DEFAULT NULL,
  `approved_by` int DEFAULT NULL,
  `approved_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `expense_number` (`expense_number`),
  KEY `idx_expense_project` (`project_id`),
  KEY `idx_expense_date` (`expense_date`),
  KEY `idx_expense_category` (`category`),
  KEY `fk_expense_vendor` (`vendor_id`),
  KEY `fk_expense_creator` (`created_by`),
  KEY `fk_expense_approver` (`approved_by`),
  CONSTRAINT `fk_expense_approver` FOREIGN KEY (`approved_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_expense_creator` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_expense_project` FOREIGN KEY (`project_id`) REFERENCES `client_projects` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_expense_vendor` FOREIGN KEY (`vendor_id`) REFERENCES `vendors` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;



CREATE TABLE IF NOT EXISTS `project_file_folders` (
  `id` int NOT NULL AUTO_INCREMENT,
  `project_id` int NOT NULL,
  `name` varchar(255) NOT NULL,
  `color` varchar(7) DEFAULT '#3B82F6',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_project_id` (`project_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;



CREATE TABLE IF NOT EXISTS `project_files` (
  `id` int NOT NULL AUTO_INCREMENT,
  `project_id` int NOT NULL,
  `file_name` varchar(255) NOT NULL,
  `file_path` varchar(255) NOT NULL,
  `file_type` varchar(50) DEFAULT NULL,
  `file_size` int DEFAULT NULL,
  `uploaded_by` int DEFAULT NULL,
  `uploaded_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `folder_id` int DEFAULT NULL,
  `doc_title` varchar(255) DEFAULT NULL,
  `doc_category` varchar(100) DEFAULT 'Other',
  `revision` varchar(20) DEFAULT 'A',
  `doc_status` enum('draft','issued','approved','superseded') DEFAULT 'draft',
  `doc_no` varchar(100) DEFAULT NULL,
  `description` text,
  PRIMARY KEY (`id`),
  KEY `project_id` (`project_id`),
  KEY `uploaded_by` (`uploaded_by`),
  KEY `folder_id` (`folder_id`),
  CONSTRAINT `project_files_ibfk_1` FOREIGN KEY (`project_id`) REFERENCES `client_projects` (`id`) ON DELETE CASCADE,
  CONSTRAINT `project_files_ibfk_2` FOREIGN KEY (`uploaded_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `project_files_ibfk_3` FOREIGN KEY (`folder_id`) REFERENCES `project_file_folders` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;



CREATE TABLE IF NOT EXISTS `project_members` (
  `project_id` int NOT NULL,
  `user_id` int NOT NULL,
  `role` varchar(50) DEFAULT 'Member',
  `joined_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`project_id`,`user_id`),
  KEY `user_id` (`user_id`),
  CONSTRAINT `project_members_ibfk_1` FOREIGN KEY (`project_id`) REFERENCES `client_projects` (`id`) ON DELETE CASCADE,
  CONSTRAINT `project_members_ibfk_2` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;



CREATE TABLE IF NOT EXISTS `project_milestones` (
  `id` int NOT NULL AUTO_INCREMENT,
  `project_id` int NOT NULL,
  `title` varchar(255) NOT NULL,
  `description` text,
  `due_date` date DEFAULT NULL,
  `status` varchar(50) DEFAULT 'Pending',
  `amount` decimal(15,2) DEFAULT '0.00',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `project_id` (`project_id`),
  CONSTRAINT `project_milestones_ibfk_1` FOREIGN KEY (`project_id`) REFERENCES `client_projects` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;



CREATE TABLE IF NOT EXISTS `project_tasks` (
  `id` int NOT NULL AUTO_INCREMENT,
  `project_id` int NOT NULL,
  `milestone_id` int DEFAULT NULL,
  `title` varchar(255) NOT NULL,
  `description` text,
  `status` varchar(50) DEFAULT 'To Do',
  `priority` varchar(50) DEFAULT 'Medium',
  `start_date` date DEFAULT NULL,
  `due_date` date DEFAULT NULL,
  `assigned_to` int DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `parent_id` int DEFAULT NULL,
  `progress` int DEFAULT '0',
  `depends_on` varchar(255) DEFAULT NULL,
  `sort_order` int DEFAULT '0',
  PRIMARY KEY (`id`),
  KEY `project_id` (`project_id`),
  KEY `milestone_id` (`milestone_id`),
  KEY `assigned_to` (`assigned_to`),
  CONSTRAINT `project_tasks_ibfk_1` FOREIGN KEY (`project_id`) REFERENCES `client_projects` (`id`) ON DELETE CASCADE,
  CONSTRAINT `project_tasks_ibfk_2` FOREIGN KEY (`milestone_id`) REFERENCES `project_milestones` (`id`) ON DELETE SET NULL,
  CONSTRAINT `project_tasks_ibfk_3` FOREIGN KEY (`assigned_to`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;



CREATE TABLE IF NOT EXISTS `proposal_audit_logs` (
  `id` int NOT NULL AUTO_INCREMENT,
  `proposal_id` int NOT NULL,
  `user_id` int NOT NULL,
  `action` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `field_name` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `before_value` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `after_value` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_proposal` (`proposal_id`),
  KEY `idx_user` (`user_id`),
  KEY `idx_created` (`created_at`),
  CONSTRAINT `proposal_audit_logs_ibfk_1` FOREIGN KEY (`proposal_id`) REFERENCES `proposals` (`id`) ON DELETE CASCADE,
  CONSTRAINT `proposal_audit_logs_ibfk_2` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;



CREATE TABLE IF NOT EXISTS `proposal_items` (
  `id` int NOT NULL AUTO_INCREMENT,
  `proposal_id` int NOT NULL,
  `discipline_id` int DEFAULT NULL,
  `sub_discipline_id` int DEFAULT NULL,
  `ahsp_id` int DEFAULT NULL,
  `ahsp_code_snapshot` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `ahsp_name_snapshot` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `unit_snapshot` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `unit_price_snapshot` decimal(15,2) DEFAULT '0.00',
  `description` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `qty` decimal(12,3) DEFAULT '0.000',
  `total_price` decimal(18,2) DEFAULT '0.00',
  `order_no` int DEFAULT '0',
  `notes` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `is_section` tinyint(1) DEFAULT '0',
  `section_label` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `section_order` int DEFAULT '0',
  `mto_link` json DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `ahsp_id` (`ahsp_id`),
  KEY `idx_proposal` (`proposal_id`),
  KEY `idx_discipline` (`discipline_id`),
  KEY `idx_sub_discipline` (`sub_discipline_id`),
  KEY `idx_order` (`proposal_id`,`order_no`),
  CONSTRAINT `proposal_items_ibfk_1` FOREIGN KEY (`proposal_id`) REFERENCES `proposals` (`id`) ON DELETE CASCADE,
  CONSTRAINT `proposal_items_ibfk_2` FOREIGN KEY (`discipline_id`) REFERENCES `master_disciplines` (`id`) ON DELETE SET NULL,
  CONSTRAINT `proposal_items_ibfk_3` FOREIGN KEY (`sub_discipline_id`) REFERENCES `master_sub_disciplines` (`id`) ON DELETE SET NULL,
  CONSTRAINT `proposal_items_ibfk_4` FOREIGN KEY (`ahsp_id`) REFERENCES `ahsp_headers` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;



CREATE TABLE IF NOT EXISTS `proposals` (
  `id` int NOT NULL AUTO_INCREMENT,
  `proposal_number` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `project_name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `client` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `client_id` int DEFAULT NULL,
  `project_id` int DEFAULT NULL,
  `lokasi` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `revision` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT 'Rev-0',
  `proposal_type` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `design_params` json DEFAULT NULL,
  `status` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT 'draft',
  `direct_cost` decimal(18,2) DEFAULT '0.00',
  `overhead` decimal(18,2) DEFAULT '0.00',
  `risk_contingency` decimal(18,2) DEFAULT '0.00',
  `total_project` decimal(18,2) DEFAULT '0.00',
  `created_by` int DEFAULT NULL,
  `approved_by` int DEFAULT NULL,
  `approved_at` timestamp NULL DEFAULT NULL,
  `submitted_at` timestamp NULL DEFAULT NULL,
  `deal_at` timestamp NULL DEFAULT NULL,
  `locked_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `proposal_number` (`proposal_number`),
  KEY `created_by` (`created_by`),
  KEY `approved_by` (`approved_by`),
  KEY `idx_status` (`status`),
  KEY `idx_number` (`proposal_number`),
  KEY `idx_project` (`project_name`),
  KEY `fk_proposal_client` (`client_id`),
  KEY `fk_proposal_project` (`project_id`),
  CONSTRAINT `fk_proposal_client` FOREIGN KEY (`client_id`) REFERENCES `clients` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_proposal_project` FOREIGN KEY (`project_id`) REFERENCES `client_projects` (`id`) ON DELETE SET NULL,
  CONSTRAINT `proposals_ibfk_1` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`),
  CONSTRAINT `proposals_ibfk_2` FOREIGN KEY (`approved_by`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;



CREATE TABLE IF NOT EXISTS `prospects` (
  `id` int NOT NULL AUTO_INCREMENT,
  `code` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `company_name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `contact_name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `contact_title` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `email` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `phone` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `industry` varchar(150) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `website` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `address` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `city` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `country` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT 'Indonesia',
  `source` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT 'other',
  `temperature` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT 'cold',
  `status` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT 'new',
  `interest` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `estimated_value` decimal(15,2) DEFAULT '0.00',
  `next_follow_up` date DEFAULT NULL,
  `last_contacted_at` timestamp NULL DEFAULT NULL,
  `assigned_to` int DEFAULT NULL,
  `notes` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `converted_to_client_id` int DEFAULT NULL,
  `converted_to_lead_id` int DEFAULT NULL,
  `converted_at` timestamp NULL DEFAULT NULL,
  `created_by` int DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `code` (`code`),
  KEY `idx_temperature` (`temperature`),
  KEY `idx_status` (`status`),
  KEY `idx_source` (`source`),
  KEY `idx_next_follow_up` (`next_follow_up`),
  KEY `idx_assigned_to` (`assigned_to`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;



CREATE TABLE IF NOT EXISTS `purchase_order_items` (
  `id` int NOT NULL AUTO_INCREMENT,
  `purchase_order_id` int NOT NULL,
  `product_id` int DEFAULT NULL,
  `quantity` decimal(15,4) NOT NULL,
  `unit_price` decimal(15,2) NOT NULL,
  `line_total` decimal(15,2) DEFAULT NULL,
  `received_qty` decimal(15,4) DEFAULT '0.0000',
  `notes` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `po_id` int DEFAULT NULL,
  `uom` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `currency` varchar(10) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT 'IDR',
  `proposal_item_id` int DEFAULT NULL,
  `rab_discipline_id` int DEFAULT NULL,
  `rab_sub_discipline_id` int DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `product_id` (`product_id`),
  KEY `idx_purchase_order_id` (`purchase_order_id`),
  CONSTRAINT `purchase_order_items_ibfk_1` FOREIGN KEY (`purchase_order_id`) REFERENCES `purchase_orders` (`id`) ON DELETE CASCADE,
  CONSTRAINT `purchase_order_items_ibfk_2` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;



CREATE TABLE IF NOT EXISTS `purchase_order_payment_schedules` (
  `id` int NOT NULL AUTO_INCREMENT,
  `po_id` int NOT NULL,
  `schedule_no` int NOT NULL,
  `label` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `trigger_type` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'manual',
  `percentage` decimal(7,2) NOT NULL DEFAULT '0.00',
  `amount` decimal(15,2) NOT NULL DEFAULT '0.00',
  `due_date` date DEFAULT NULL,
  `status` varchar(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'open',
  `paid_amount` decimal(15,2) NOT NULL DEFAULT '0.00',
  `ap_id` int DEFAULT NULL,
  `notes` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_po_schedule_no` (`po_id`,`schedule_no`),
  KEY `idx_po_schedule_due_date` (`due_date`),
  KEY `idx_po_schedule_status` (`status`),
  CONSTRAINT `fk_po_schedule_po` FOREIGN KEY (`po_id`) REFERENCES `purchase_orders` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;



CREATE TABLE IF NOT EXISTS `purchase_orders` (
  `id` int NOT NULL AUTO_INCREMENT,
  `po_number` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `pr_id` int DEFAULT NULL,
  `project_id` int DEFAULT NULL,
  `vendor_id` int DEFAULT NULL,
  `po_date` date NOT NULL,
  `due_date` date DEFAULT NULL,
  `status` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT 'DRAFT',
  `total_amount` decimal(15,2) DEFAULT '0.00',
  `approval_required` tinyint(1) DEFAULT '1',
  `approved_by` int DEFAULT NULL,
  `approved_date` timestamp NULL DEFAULT NULL,
  `notes` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `approval_status` int NOT NULL DEFAULT '0',
  `expected_date` date DEFAULT NULL,
  `currency` varchar(10) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT 'IDR',
  `payment_term` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `payment_term_2` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `address` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `type` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `contact_person` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `delivery_to` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `advance_payment` decimal(15,2) NOT NULL DEFAULT '0.00',
  `discount_percent` decimal(5,2) NOT NULL DEFAULT '0.00',
  `ppn_percent` decimal(5,2) NOT NULL DEFAULT '11.00',
  `approved_by_supervisor_id` int DEFAULT NULL,
  `approved_by_manager_id` int DEFAULT NULL,
  `approved_at_supervisor` timestamp NULL DEFAULT NULL,
  `approved_at_manager` timestamp NULL DEFAULT NULL,
  `item_type` varchar(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'inventory',
  `is_deleted` tinyint(1) NOT NULL DEFAULT '0',
  `deleted_at` timestamp NULL DEFAULT NULL,
  `deleted_by` int DEFAULT NULL,
  `deletion_reason` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `source_bid_id` int DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `po_number` (`po_number`),
  UNIQUE KEY `uniq_po_pr_bid` (`pr_id`,`source_bid_id`),
  KEY `pr_id` (`pr_id`),
  KEY `approved_by` (`approved_by`),
  KEY `idx_po_number` (`po_number`),
  KEY `idx_status` (`status`),
  KEY `idx_vendor_id` (`vendor_id`),
  KEY `idx_po_project` (`project_id`),
  KEY `idx_po_is_deleted` (`is_deleted`),
  CONSTRAINT `fk_po_project` FOREIGN KEY (`project_id`) REFERENCES `client_projects` (`id`) ON DELETE SET NULL,
  CONSTRAINT `purchase_orders_ibfk_1` FOREIGN KEY (`pr_id`) REFERENCES `purchase_requests` (`id`),
  CONSTRAINT `purchase_orders_ibfk_2` FOREIGN KEY (`vendor_id`) REFERENCES `vendors` (`id`),
  CONSTRAINT `purchase_orders_ibfk_3` FOREIGN KEY (`approved_by`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;



CREATE TABLE IF NOT EXISTS `purchase_request_items` (
  `id` int NOT NULL AUTO_INCREMENT,
  `purchase_request_id` int NOT NULL,
  `product_id` int NOT NULL,
  `quantity` decimal(15,4) NOT NULL,
  `unit_price` decimal(15,2) DEFAULT NULL,
  `notes` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  PRIMARY KEY (`id`),
  KEY `product_id` (`product_id`),
  KEY `idx_purchase_request_id` (`purchase_request_id`),
  CONSTRAINT `purchase_request_items_ibfk_1` FOREIGN KEY (`purchase_request_id`) REFERENCES `purchase_requests` (`id`) ON DELETE CASCADE,
  CONSTRAINT `purchase_request_items_ibfk_2` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;



CREATE TABLE IF NOT EXISTS `purchase_requests` (
  `id` int NOT NULL AUTO_INCREMENT,
  `pr_number` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `requestor_id` int DEFAULT NULL,
  `project_id` int DEFAULT NULL,
  `status` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT 'DRAFT',
  `approval_required` tinyint(1) DEFAULT '1',
  `approved_by` int DEFAULT NULL,
  `approved_date` timestamp NULL DEFAULT NULL,
  `notes` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `approval_status` tinyint NOT NULL DEFAULT '0' COMMENT '0=pending,1=sv,2=approved,-1=rejected',
  `approved_by_supervisor_id` int DEFAULT NULL,
  `approved_by_manager_id` int DEFAULT NULL,
  `approved_at_supervisor` timestamp NULL DEFAULT NULL,
  `approved_at_manager` timestamp NULL DEFAULT NULL,
  `vendor_comparisons` json DEFAULT NULL,
  `selected_vendor_id` int DEFAULT NULL,
  `department` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `request_date` date DEFAULT NULL,
  `needed_by` date DEFAULT NULL,
  `reason` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `is_deleted` tinyint(1) NOT NULL DEFAULT '0',
  `deleted_at` timestamp NULL DEFAULT NULL,
  `deleted_by` int DEFAULT NULL,
  `deletion_reason` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  PRIMARY KEY (`id`),
  UNIQUE KEY `pr_number` (`pr_number`),
  KEY `requestor_id` (`requestor_id`),
  KEY `approved_by` (`approved_by`),
  KEY `idx_status` (`status`),
  KEY `idx_created_at` (`created_at`),
  KEY `idx_pr_project` (`project_id`),
  KEY `idx_pr_is_deleted` (`is_deleted`),
  CONSTRAINT `fk_pr_project` FOREIGN KEY (`project_id`) REFERENCES `client_projects` (`id`) ON DELETE SET NULL,
  CONSTRAINT `purchase_requests_ibfk_1` FOREIGN KEY (`requestor_id`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `purchase_requests_ibfk_2` FOREIGN KEY (`approved_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;



CREATE TABLE IF NOT EXISTS `qc_ncr` (
  `id` int NOT NULL AUTO_INCREMENT,
  `ncr_number` varchar(50) DEFAULT NULL,
  `product_id` int DEFAULT NULL,
  `batch_id` int DEFAULT NULL,
  `category` varchar(50) DEFAULT 'product',
  `severity` varchar(20) DEFAULT 'minor',
  `description` text NOT NULL,
  `root_cause` text,
  `corrective_action` text,
  `preventive_action` text,
  `status` varchar(30) DEFAULT 'open',
  `reported_by` int DEFAULT NULL,
  `assigned_to` int DEFAULT NULL,
  `closed_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `ncr_number` (`ncr_number`),
  KEY `product_id` (`product_id`),
  KEY `batch_id` (`batch_id`),
  KEY `reported_by` (`reported_by`),
  KEY `assigned_to` (`assigned_to`),
  CONSTRAINT `qc_ncr_ibfk_1` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`),
  CONSTRAINT `qc_ncr_ibfk_2` FOREIGN KEY (`batch_id`) REFERENCES `batches` (`id`),
  CONSTRAINT `qc_ncr_ibfk_3` FOREIGN KEY (`reported_by`) REFERENCES `users` (`id`),
  CONSTRAINT `qc_ncr_ibfk_4` FOREIGN KEY (`assigned_to`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;



CREATE TABLE IF NOT EXISTS `qc_ncr_actions` (
  `id` int NOT NULL AUTO_INCREMENT,
  `ncr_id` int NOT NULL,
  `action_type` varchar(30) DEFAULT 'corrective',
  `description` text,
  `due_date` date DEFAULT NULL,
  `status` varchar(20) DEFAULT 'open',
  `action_by` int DEFAULT NULL,
  `completed_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `ncr_id` (`ncr_id`),
  KEY `action_by` (`action_by`),
  CONSTRAINT `qc_ncr_actions_ibfk_1` FOREIGN KEY (`ncr_id`) REFERENCES `qc_ncr` (`id`) ON DELETE CASCADE,
  CONSTRAINT `qc_ncr_actions_ibfk_2` FOREIGN KEY (`action_by`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;



CREATE TABLE IF NOT EXISTS `qc_results` (
  `id` int NOT NULL AUTO_INCREMENT,
  `qc_test_id` int NOT NULL,
  `batch_id` int DEFAULT NULL,
  `wo_id` int DEFAULT NULL,
  `result_value` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `result_status` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `test_date` date DEFAULT NULL,
  `tested_by` int DEFAULT NULL,
  `notes` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `qc_test_id` (`qc_test_id`),
  KEY `wo_id` (`wo_id`),
  KEY `tested_by` (`tested_by`),
  KEY `idx_batch_id` (`batch_id`),
  KEY `idx_result_status` (`result_status`),
  CONSTRAINT `qc_results_ibfk_1` FOREIGN KEY (`qc_test_id`) REFERENCES `qc_tests` (`id`),
  CONSTRAINT `qc_results_ibfk_2` FOREIGN KEY (`batch_id`) REFERENCES `batches` (`id`),
  CONSTRAINT `qc_results_ibfk_3` FOREIGN KEY (`wo_id`) REFERENCES `work_orders` (`id`),
  CONSTRAINT `qc_results_ibfk_4` FOREIGN KEY (`tested_by`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;



CREATE TABLE IF NOT EXISTS `qc_rework_orders` (
  `id` int NOT NULL AUTO_INCREMENT,
  `rework_number` varchar(50) DEFAULT NULL,
  `ncr_id` int DEFAULT NULL,
  `product_id` int DEFAULT NULL,
  `batch_id` int DEFAULT NULL,
  `wo_id` int DEFAULT NULL,
  `quantity` decimal(12,2) DEFAULT '0.00',
  `description` text,
  `instructions` text,
  `status` varchar(30) DEFAULT 'pending',
  `created_by` int DEFAULT NULL,
  `completed_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `rework_number` (`rework_number`),
  KEY `ncr_id` (`ncr_id`),
  KEY `product_id` (`product_id`),
  KEY `batch_id` (`batch_id`),
  KEY `wo_id` (`wo_id`),
  KEY `created_by` (`created_by`),
  CONSTRAINT `qc_rework_orders_ibfk_1` FOREIGN KEY (`ncr_id`) REFERENCES `qc_ncr` (`id`),
  CONSTRAINT `qc_rework_orders_ibfk_2` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`),
  CONSTRAINT `qc_rework_orders_ibfk_3` FOREIGN KEY (`batch_id`) REFERENCES `batches` (`id`),
  CONSTRAINT `qc_rework_orders_ibfk_4` FOREIGN KEY (`wo_id`) REFERENCES `work_orders` (`id`),
  CONSTRAINT `qc_rework_orders_ibfk_5` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;



CREATE TABLE IF NOT EXISTS `qc_sampling_plans` (
  `id` int NOT NULL AUTO_INCREMENT,
  `product_id` int DEFAULT NULL,
  `test_id` int DEFAULT NULL,
  `sample_size` int DEFAULT '1',
  `frequency` varchar(50) DEFAULT 'per_batch',
  `aql_level` varchar(20) DEFAULT '1.0',
  `inspection_level` varchar(50) DEFAULT 'normal',
  `notes` text,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `product_id` (`product_id`),
  KEY `test_id` (`test_id`),
  CONSTRAINT `qc_sampling_plans_ibfk_1` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`),
  CONSTRAINT `qc_sampling_plans_ibfk_2` FOREIGN KEY (`test_id`) REFERENCES `qc_tests` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;



CREATE TABLE IF NOT EXISTS `qc_tests` (
  `id` int NOT NULL AUTO_INCREMENT,
  `code` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(150) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `product_id` int DEFAULT NULL,
  `test_type` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `test_method` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `acceptance_criteria` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `code` (`code`),
  KEY `product_id` (`product_id`),
  KEY `idx_code` (`code`),
  CONSTRAINT `qc_tests_ibfk_1` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;



CREATE TABLE IF NOT EXISTS `rnd_document_folders` (
  `id` int NOT NULL AUTO_INCREMENT,
  `project_id` int NOT NULL,
  `name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `color` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT '#3B82F6',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `project_id` (`project_id`),
  CONSTRAINT `rnd_document_folders_ibfk_1` FOREIGN KEY (`project_id`) REFERENCES `rnd_projects` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;



CREATE TABLE IF NOT EXISTS `rnd_documents` (
  `id` int NOT NULL AUTO_INCREMENT,
  `project_id` int DEFAULT NULL,
  `formulation_id` int DEFAULT NULL,
  `lab_test_id` int DEFAULT NULL,
  `stability_study_id` int DEFAULT NULL,
  `doc_type` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT 'other',
  `title` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `file_name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `file_path` varchar(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `file_size` int DEFAULT '0',
  `mime_type` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `version` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT '1.0',
  `folder_id` int DEFAULT NULL,
  `uploaded_by` int DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `project_id` (`project_id`),
  KEY `formulation_id` (`formulation_id`),
  KEY `uploaded_by` (`uploaded_by`),
  CONSTRAINT `rnd_documents_ibfk_1` FOREIGN KEY (`project_id`) REFERENCES `rnd_projects` (`id`) ON DELETE SET NULL,
  CONSTRAINT `rnd_documents_ibfk_2` FOREIGN KEY (`formulation_id`) REFERENCES `rnd_formulations` (`id`) ON DELETE SET NULL,
  CONSTRAINT `rnd_documents_ibfk_3` FOREIGN KEY (`uploaded_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;



CREATE TABLE IF NOT EXISTS `rnd_formulation_ingredients` (
  `id` int NOT NULL AUTO_INCREMENT,
  `formulation_id` int NOT NULL,
  `product_id` int DEFAULT NULL,
  `ingredient_name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `quantity` decimal(15,4) NOT NULL DEFAULT '0.0000',
  `unit` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT 'kg',
  `percentage` decimal(8,4) DEFAULT NULL,
  `function_role` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `notes` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `sort_order` int DEFAULT '0',
  PRIMARY KEY (`id`),
  KEY `formulation_id` (`formulation_id`),
  CONSTRAINT `rnd_formulation_ingredients_ibfk_1` FOREIGN KEY (`formulation_id`) REFERENCES `rnd_formulations` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;



CREATE TABLE IF NOT EXISTS `rnd_formulations` (
  `id` int NOT NULL AUTO_INCREMENT,
  `formula_code` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `version` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT '1.0',
  `project_id` int DEFAULT NULL,
  `product_type_id` int DEFAULT NULL,
  `status` enum('draft','testing','approved','revision','obsolete') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT 'draft',
  `target_specs` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `description` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `notes` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `approved_by` int DEFAULT NULL,
  `approved_at` datetime DEFAULT NULL,
  `created_by` int DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `formula_code` (`formula_code`),
  KEY `project_id` (`project_id`),
  KEY `approved_by` (`approved_by`),
  CONSTRAINT `rnd_formulations_ibfk_1` FOREIGN KEY (`project_id`) REFERENCES `rnd_projects` (`id`) ON DELETE SET NULL,
  CONSTRAINT `rnd_formulations_ibfk_2` FOREIGN KEY (`approved_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;



CREATE TABLE IF NOT EXISTS `rnd_lab_tests` (
  `id` int NOT NULL AUTO_INCREMENT,
  `test_code` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `test_name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `formulation_id` int DEFAULT NULL,
  `project_id` int DEFAULT NULL,
  `batch_number` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `test_type` enum('physical','chemical','microbiological','stability','performance','other') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT 'chemical',
  `method` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `equipment` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `status` enum('scheduled','in_progress','completed','failed','cancelled') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT 'scheduled',
  `test_date` date DEFAULT NULL,
  `tested_by` int DEFAULT NULL,
  `parameters` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `results` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `conclusion` enum('pass','fail','conditional','pending') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT 'pending',
  `attachments` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `notes` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `created_by` int DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `test_code` (`test_code`),
  KEY `formulation_id` (`formulation_id`),
  KEY `project_id` (`project_id`),
  KEY `tested_by` (`tested_by`),
  CONSTRAINT `rnd_lab_tests_ibfk_1` FOREIGN KEY (`formulation_id`) REFERENCES `rnd_formulations` (`id`) ON DELETE SET NULL,
  CONSTRAINT `rnd_lab_tests_ibfk_2` FOREIGN KEY (`project_id`) REFERENCES `rnd_projects` (`id`) ON DELETE SET NULL,
  CONSTRAINT `rnd_lab_tests_ibfk_3` FOREIGN KEY (`tested_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;



CREATE TABLE IF NOT EXISTS `rnd_milestones` (
  `id` int NOT NULL AUTO_INCREMENT,
  `project_id` int NOT NULL,
  `title` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `phase` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT 'formulation_design',
  `status` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT 'pending',
  `due_date` date DEFAULT NULL,
  `completed_date` date DEFAULT NULL,
  `assigned_to` int DEFAULT NULL,
  `deliverables` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `sort_order` int DEFAULT '0',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `project_id` (`project_id`),
  KEY `assigned_to` (`assigned_to`),
  CONSTRAINT `rnd_milestones_ibfk_1` FOREIGN KEY (`project_id`) REFERENCES `rnd_projects` (`id`) ON DELETE CASCADE,
  CONSTRAINT `rnd_milestones_ibfk_2` FOREIGN KEY (`assigned_to`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;



CREATE TABLE IF NOT EXISTS `rnd_project_tasks` (
  `id` int NOT NULL AUTO_INCREMENT,
  `project_id` int NOT NULL,
  `title` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `status` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT 'todo',
  `priority` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT 'medium',
  `assigned_to` int DEFAULT NULL,
  `due_date` date DEFAULT NULL,
  `completed_date` date DEFAULT NULL,
  `tags` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `sort_order` int DEFAULT '0',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `project_id` (`project_id`),
  KEY `assigned_to` (`assigned_to`),
  CONSTRAINT `rnd_project_tasks_ibfk_1` FOREIGN KEY (`project_id`) REFERENCES `rnd_projects` (`id`) ON DELETE CASCADE,
  CONSTRAINT `rnd_project_tasks_ibfk_2` FOREIGN KEY (`assigned_to`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;



CREATE TABLE IF NOT EXISTS `rnd_projects` (
  `id` int NOT NULL AUTO_INCREMENT,
  `project_code` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `project_type` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT 'new_product',
  `category` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT 'chemical',
  `description` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `objectives` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `expected_output` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `status` enum('draft','active','on_hold','completed','cancelled') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT 'draft',
  `priority` enum('low','medium','high','critical') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT 'medium',
  `risk_level` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT 'medium',
  `confidentiality` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT 'internal',
  `regulatory_requirements` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `target_market` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `target_product` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `project_leader_id` int DEFAULT NULL,
  `department_id` int DEFAULT NULL,
  `start_date` date DEFAULT NULL,
  `target_end_date` date DEFAULT NULL,
  `actual_end_date` date DEFAULT NULL,
  `budget` decimal(15,2) DEFAULT '0.00',
  `spent` decimal(15,2) DEFAULT '0.00',
  `tags` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `notes` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `created_by` int DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `project_code` (`project_code`),
  KEY `project_leader_id` (`project_leader_id`),
  KEY `department_id` (`department_id`),
  CONSTRAINT `rnd_projects_ibfk_1` FOREIGN KEY (`project_leader_id`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `rnd_projects_ibfk_2` FOREIGN KEY (`department_id`) REFERENCES `departments` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;



CREATE TABLE IF NOT EXISTS `rnd_stability_checkpoints` (
  `id` int NOT NULL AUTO_INCREMENT,
  `study_id` int NOT NULL,
  `checkpoint_month` int NOT NULL DEFAULT '0',
  `scheduled_date` date DEFAULT NULL,
  `actual_date` date DEFAULT NULL,
  `status` enum('pending','completed','skipped') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT 'pending',
  `parameters` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `results` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `pass_fail` enum('pass','fail','pending') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT 'pending',
  `tested_by` int DEFAULT NULL,
  `notes` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  PRIMARY KEY (`id`),
  KEY `study_id` (`study_id`),
  KEY `tested_by` (`tested_by`),
  CONSTRAINT `rnd_stability_checkpoints_ibfk_1` FOREIGN KEY (`study_id`) REFERENCES `rnd_stability_studies` (`id`) ON DELETE CASCADE,
  CONSTRAINT `rnd_stability_checkpoints_ibfk_2` FOREIGN KEY (`tested_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;



CREATE TABLE IF NOT EXISTS `rnd_stability_studies` (
  `id` int NOT NULL AUTO_INCREMENT,
  `study_code` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `formulation_id` int DEFAULT NULL,
  `batch_number` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `status` enum('planned','active','completed','cancelled') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT 'planned',
  `storage_condition` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT '25°C / 60% RH',
  `duration_months` int DEFAULT '12',
  `start_date` date DEFAULT NULL,
  `end_date` date DEFAULT NULL,
  `protocol` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `conclusion` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `created_by` int DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `study_code` (`study_code`),
  KEY `formulation_id` (`formulation_id`),
  CONSTRAINT `rnd_stability_studies_ibfk_1` FOREIGN KEY (`formulation_id`) REFERENCES `rnd_formulations` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;



CREATE TABLE IF NOT EXISTS `role_permissions` (
  `id` int NOT NULL AUTO_INCREMENT,
  `role_id` int NOT NULL,
  `permission_id` int NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_role_permission` (`role_id`,`permission_id`),
  KEY `permission_id` (`permission_id`),
  KEY `idx_role_id` (`role_id`),
  CONSTRAINT `role_permissions_ibfk_1` FOREIGN KEY (`role_id`) REFERENCES `roles` (`id`) ON DELETE CASCADE,
  CONSTRAINT `role_permissions_ibfk_2` FOREIGN KEY (`permission_id`) REFERENCES `permissions` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;



CREATE TABLE IF NOT EXISTS `roles` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `code` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `level` int DEFAULT '0',
  `active` tinyint(1) DEFAULT '1',
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `name` (`name`),
  KEY `idx_name` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;



CREATE TABLE IF NOT EXISTS `salary_advances` (
  `id` int NOT NULL AUTO_INCREMENT,
  `employee_id` int NOT NULL,
  `amount` decimal(12,2) NOT NULL DEFAULT '0.00',
  `remaining` decimal(12,2) NOT NULL DEFAULT '0.00',
  `description` text,
  `advance_date` date DEFAULT NULL,
  `period_month` int DEFAULT NULL,
  `period_year` int DEFAULT NULL,
  `status` varchar(20) DEFAULT 'pending',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `kasbon_request_id` int DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `employee_id` (`employee_id`),
  CONSTRAINT `salary_advances_ibfk_1` FOREIGN KEY (`employee_id`) REFERENCES `employees` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;



CREATE TABLE IF NOT EXISTS `sales_orders` (
  `id` int NOT NULL AUTO_INCREMENT,
  `so_number` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `customer_id` int NOT NULL,
  `so_date` date NOT NULL,
  `status` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT 'DRAFT',
  `total_amount` decimal(15,2) DEFAULT '0.00',
  `approval_required` tinyint(1) DEFAULT '0',
  `approved_by` int DEFAULT NULL,
  `approved_date` timestamp NULL DEFAULT NULL,
  `notes` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `so_number` (`so_number`),
  KEY `approved_by` (`approved_by`),
  KEY `idx_so_number` (`so_number`),
  KEY `idx_customer_id` (`customer_id`),
  KEY `idx_status` (`status`),
  CONSTRAINT `sales_orders_ibfk_1` FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`),
  CONSTRAINT `sales_orders_ibfk_2` FOREIGN KEY (`approved_by`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;



CREATE TABLE IF NOT EXISTS `sales_payments` (
  `id` int NOT NULL AUTO_INCREMENT,
  `invoice_id` int NOT NULL,
  `customer_id` int NOT NULL,
  `payment_date` date NOT NULL,
  `amount` decimal(15,2) NOT NULL,
  `payment_method` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT 'bank_transfer',
  `reference_number` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `status` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT 'pending',
  `notes` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_invoice_id` (`invoice_id`),
  KEY `idx_customer_id` (`customer_id`),
  KEY `idx_status` (`status`),
  CONSTRAINT `sales_payments_ibfk_1` FOREIGN KEY (`invoice_id`) REFERENCES `invoices` (`id`),
  CONSTRAINT `sales_payments_ibfk_2` FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;



CREATE TABLE IF NOT EXISTS `schedule_overrides` (
  `id` int NOT NULL AUTO_INCREMENT,
  `proposal_item_id` int NOT NULL,
  `start_day_override` decimal(10,2) DEFAULT NULL COMMENT 'null = auto serial',
  `duration_days_override` decimal(10,2) DEFAULT NULL COMMENT 'null = auto from AHSP',
  `is_pinned` tinyint(1) DEFAULT '0' COMMENT 'if 1, upstream changes dont cascade',
  `notes` text,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_item` (`proposal_item_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;



CREATE TABLE IF NOT EXISTS `schedule_progress` (
  `id` int NOT NULL AUTO_INCREMENT,
  `proposal_item_id` int NOT NULL,
  `unit_number` int NOT NULL COMMENT 'Which unit (1, 2, 3...N)',
  `step_code` varchar(50) NOT NULL,
  `step_name` varchar(255) NOT NULL,
  `status` enum('pending','in_progress','done') DEFAULT 'pending',
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `updated_by` int DEFAULT NULL,
  `notes` text,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_progress` (`proposal_item_id`,`unit_number`,`step_code`),
  KEY `idx_proposal_item` (`proposal_item_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;



CREATE TABLE IF NOT EXISTS `so_items` (
  `id` int NOT NULL AUTO_INCREMENT,
  `so_id` int NOT NULL,
  `product_id` int NOT NULL,
  `quantity` decimal(15,4) NOT NULL,
  `unit_price` decimal(15,2) NOT NULL,
  `line_total` decimal(15,2) DEFAULT NULL,
  `delivered_qty` decimal(15,4) DEFAULT '0.0000',
  `notes` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  PRIMARY KEY (`id`),
  KEY `product_id` (`product_id`),
  KEY `idx_so_id` (`so_id`),
  CONSTRAINT `so_items_ibfk_1` FOREIGN KEY (`so_id`) REFERENCES `sales_orders` (`id`) ON DELETE CASCADE,
  CONSTRAINT `so_items_ibfk_2` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;



CREATE TABLE IF NOT EXISTS `stock_movements` (
  `id` int NOT NULL AUTO_INCREMENT,
  `warehouse_id` int NOT NULL,
  `product_id` int NOT NULL,
  `batch_number` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `movement_type` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `quantity` decimal(15,4) NOT NULL,
  `reference_type` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `reference_id` int DEFAULT NULL,
  `notes` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `created_by` int DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `created_by` (`created_by`),
  KEY `idx_product_id` (`product_id`),
  KEY `idx_warehouse_id` (`warehouse_id`),
  KEY `idx_batch_number` (`batch_number`),
  KEY `idx_created_at` (`created_at`),
  CONSTRAINT `stock_movements_ibfk_1` FOREIGN KEY (`warehouse_id`) REFERENCES `warehouses` (`id`),
  CONSTRAINT `stock_movements_ibfk_2` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`),
  CONSTRAINT `stock_movements_ibfk_3` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;



CREATE TABLE IF NOT EXISTS `system_settings` (
  `id` int NOT NULL AUTO_INCREMENT,
  `setting_key` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `setting_value` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `category` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `description` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `data_type` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `setting_key` (`setting_key`),
  KEY `idx_category` (`category`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;



CREATE TABLE IF NOT EXISTS `uom` (
  `id` int NOT NULL AUTO_INCREMENT,
  `code` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `category` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `active` tinyint(1) DEFAULT '1',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `code` (`code`),
  KEY `idx_code` (`code`),
  KEY `idx_category` (`category`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;



CREATE TABLE IF NOT EXISTS `users` (
  `id` int NOT NULL AUTO_INCREMENT,
  `username` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `email` varchar(150) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `password` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `full_name` varchar(150) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `role_id` int DEFAULT NULL,
  `department_id` int DEFAULT NULL,
  `is_active` tinyint(1) DEFAULT '1',
  `last_login` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `user_level` int NOT NULL DEFAULT '1',
  `phone` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `address` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  PRIMARY KEY (`id`),
  UNIQUE KEY `username` (`username`),
  UNIQUE KEY `email` (`email`),
  KEY `role_id` (`role_id`),
  KEY `department_id` (`department_id`),
  KEY `idx_username` (`username`),
  KEY `idx_email` (`email`),
  KEY `idx_is_active` (`is_active`),
  CONSTRAINT `users_ibfk_1` FOREIGN KEY (`role_id`) REFERENCES `roles` (`id`) ON DELETE SET NULL,
  CONSTRAINT `users_ibfk_2` FOREIGN KEY (`department_id`) REFERENCES `departments` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;



CREATE TABLE IF NOT EXISTS `vendor_prices` (
  `id` int NOT NULL AUTO_INCREMENT,
  `vendor_id` int NOT NULL,
  `product_id` int NOT NULL,
  `price` decimal(18,2) NOT NULL DEFAULT '0.00',
  `currency` varchar(10) DEFAULT 'IDR',
  `effective_date` date NOT NULL,
  `valid_until` date DEFAULT NULL,
  `min_order_qty` decimal(18,2) DEFAULT '0.00',
  `lead_time_days` int DEFAULT NULL,
  `notes` text,
  `created_by` int DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `product_id` (`product_id`),
  KEY `idx_vendor_product` (`vendor_id`,`product_id`),
  CONSTRAINT `vendor_prices_ibfk_1` FOREIGN KEY (`vendor_id`) REFERENCES `vendors` (`id`) ON DELETE CASCADE,
  CONSTRAINT `vendor_prices_ibfk_2` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;



CREATE TABLE IF NOT EXISTS `vendors` (
  `id` int NOT NULL AUTO_INCREMENT,
  `code` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(150) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `supply_category` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `contact_person` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `email` varchar(150) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `phone` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `address` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `city` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `country` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `payment_terms` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `is_active` tinyint(1) DEFAULT '1',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `code` (`code`),
  KEY `idx_code` (`code`),
  KEY `idx_is_active` (`is_active`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;



CREATE TABLE IF NOT EXISTS `warehouse_locations` (
  `id` int NOT NULL AUTO_INCREMENT,
  `warehouse_id` int NOT NULL,
  `code` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `rack` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `row` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `bin` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `capacity` decimal(10,2) DEFAULT NULL,
  `description` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_warehouse_location` (`warehouse_id`,`code`),
  KEY `idx_warehouse_id` (`warehouse_id`),
  CONSTRAINT `warehouse_locations_ibfk_1` FOREIGN KEY (`warehouse_id`) REFERENCES `warehouses` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;



CREATE TABLE IF NOT EXISTS `warehouses` (
  `id` int NOT NULL AUTO_INCREMENT,
  `code` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(150) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `address` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `contact_person` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `is_active` tinyint DEFAULT '1',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `code` (`code`),
  KEY `idx_code` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;



CREATE TABLE IF NOT EXISTS `webauthn_challenges` (
  `id` int NOT NULL AUTO_INCREMENT,
  `employee_id` int NOT NULL,
  `challenge` varchar(512) NOT NULL,
  `type` enum('registration','authentication') NOT NULL,
  `expires_at` datetime NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_emp_type` (`employee_id`,`type`),
  KEY `idx_expires` (`expires_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;



CREATE TABLE IF NOT EXISTS `wo_materials` (
  `id` int NOT NULL AUTO_INCREMENT,
  `wo_id` int NOT NULL,
  `product_id` int NOT NULL,
  `quantity_required` decimal(15,4) NOT NULL,
  `quantity_issued` decimal(15,4) DEFAULT '0.0000',
  `batch_number` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `warehouse_id` int DEFAULT NULL,
  `issued_at` timestamp NULL DEFAULT NULL,
  `issued_by` int DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `product_id` (`product_id`),
  KEY `warehouse_id` (`warehouse_id`),
  KEY `issued_by` (`issued_by`),
  KEY `idx_wo_id` (`wo_id`),
  CONSTRAINT `wo_materials_ibfk_1` FOREIGN KEY (`wo_id`) REFERENCES `work_orders` (`id`) ON DELETE CASCADE,
  CONSTRAINT `wo_materials_ibfk_2` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`),
  CONSTRAINT `wo_materials_ibfk_3` FOREIGN KEY (`warehouse_id`) REFERENCES `warehouses` (`id`),
  CONSTRAINT `wo_materials_ibfk_4` FOREIGN KEY (`issued_by`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;



CREATE TABLE IF NOT EXISTS `wo_process_logs` (
  `id` int NOT NULL AUTO_INCREMENT,
  `wo_id` int NOT NULL,
  `process_name` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `start_time` timestamp NULL DEFAULT NULL,
  `end_time` timestamp NULL DEFAULT NULL,
  `duration_minutes` int DEFAULT NULL,
  `status` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `notes` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `recorded_by` int DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `recorded_by` (`recorded_by`),
  KEY `idx_wo_id` (`wo_id`),
  CONSTRAINT `wo_process_logs_ibfk_1` FOREIGN KEY (`wo_id`) REFERENCES `work_orders` (`id`) ON DELETE CASCADE,
  CONSTRAINT `wo_process_logs_ibfk_2` FOREIGN KEY (`recorded_by`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;



CREATE TABLE IF NOT EXISTS `wo_results` (
  `id` int NOT NULL AUTO_INCREMENT,
  `wo_id` int NOT NULL,
  `output_quantity` decimal(15,4) DEFAULT NULL,
  `output_uom_id` int DEFAULT NULL,
  `loss_quantity` decimal(15,4) DEFAULT '0.0000',
  `loss_percentage` decimal(5,2) DEFAULT NULL,
  `batch_number` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `qc_status` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `completed_by` int DEFAULT NULL,
  `completed_at` timestamp NULL DEFAULT NULL,
  `notes` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_wo_result` (`wo_id`),
  KEY `output_uom_id` (`output_uom_id`),
  KEY `completed_by` (`completed_by`),
  KEY `idx_batch_number` (`batch_number`),
  CONSTRAINT `wo_results_ibfk_1` FOREIGN KEY (`wo_id`) REFERENCES `work_orders` (`id`) ON DELETE CASCADE,
  CONSTRAINT `wo_results_ibfk_2` FOREIGN KEY (`output_uom_id`) REFERENCES `uom` (`id`),
  CONSTRAINT `wo_results_ibfk_3` FOREIGN KEY (`completed_by`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;



CREATE TABLE IF NOT EXISTS `work_orders` (
  `id` int NOT NULL AUTO_INCREMENT,
  `wo_number` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `product_id` int NOT NULL,
  `bom_id` int DEFAULT NULL,
  `quantity` decimal(15,4) NOT NULL,
  `status` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT 'DRAFT',
  `scheduled_start` date DEFAULT NULL,
  `scheduled_end` date DEFAULT NULL,
  `actual_start` date DEFAULT NULL,
  `actual_end` date DEFAULT NULL,
  `notes` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `created_by` int DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `completed_quantity` int DEFAULT '0',
  PRIMARY KEY (`id`),
  UNIQUE KEY `wo_number` (`wo_number`),
  KEY `bom_id` (`bom_id`),
  KEY `created_by` (`created_by`),
  KEY `idx_status` (`status`),
  KEY `idx_product_id` (`product_id`),
  CONSTRAINT `work_orders_ibfk_1` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`),
  CONSTRAINT `work_orders_ibfk_2` FOREIGN KEY (`bom_id`) REFERENCES `bom_headers` (`id`),
  CONSTRAINT `work_orders_ibfk_3` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
