-- ============================================
-- ESTIMATOR MODULE - DATABASE SCHEMA
-- EPC Construction Proposal & Estimation System
-- ============================================

-- Master Disciplines (CIVIL, STEEL STRUCTURE, PIPING, ELECTRICAL, etc.)
DROP TABLE IF EXISTS master_disciplines;
CREATE TABLE master_disciplines (
  id INT PRIMARY KEY AUTO_INCREMENT,
  code VARCHAR(50) NOT NULL UNIQUE,
  name VARCHAR(150) NOT NULL,
  order_no INT DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_code (code),
  INDEX idx_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Master Sub-Disciplines (PERSIAPAN, PONDASI, SALURAN, etc.)
DROP TABLE IF EXISTS master_sub_disciplines;
CREATE TABLE master_sub_disciplines (
  id INT PRIMARY KEY AUTO_INCREMENT,
  discipline_id INT NOT NULL,
  code VARCHAR(50) NOT NULL,
  name VARCHAR(150) NOT NULL,
  order_no INT DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (discipline_id) REFERENCES master_disciplines(id) ON DELETE CASCADE,
  INDEX idx_discipline (discipline_id),
  INDEX idx_code (code),
  INDEX idx_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Master Materials / BAHAN (Kayu, Semen, Agregat, AC, etc.)
DROP TABLE IF EXISTS master_materials;
CREATE TABLE master_materials (
  id INT PRIMARY KEY AUTO_INCREMENT,
  code VARCHAR(50),
  jenis VARCHAR(100),
  name VARCHAR(255) NOT NULL,
  satuan VARCHAR(50) NOT NULL,
  harga DECIMAL(15,2) NOT NULL DEFAULT 0,
  vendor_id INT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE SET NULL,
  INDEX idx_jenis (jenis),
  INDEX idx_name (name),
  INDEX idx_vendor_id (vendor_id),
  INDEX idx_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Master Labor / UPAH (Mandor, Pekerja, Tukang, Kepala Tukang, etc.)
DROP TABLE IF EXISTS master_labor;
CREATE TABLE master_labor (
  id INT PRIMARY KEY AUTO_INCREMENT,
  code VARCHAR(50),
  name VARCHAR(150) NOT NULL,
  satuan VARCHAR(50) NOT NULL,
  harga DECIMAL(15,2) NOT NULL DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_name (name),
  INDEX idx_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Master Equipment / ALAT (Crane, Mesin Las, Rock Drill, etc.)
DROP TABLE IF EXISTS master_equipment;
CREATE TABLE master_equipment (
  id INT PRIMARY KEY AUTO_INCREMENT,
  code VARCHAR(50),
  name VARCHAR(255) NOT NULL,
  satuan VARCHAR(50) NOT NULL,
  harga DECIMAL(15,2) NOT NULL DEFAULT 0,
  vendor_id INT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE SET NULL,
  INDEX idx_name (name),
  INDEX idx_vendor_id (vendor_id),
  INDEX idx_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- AHSP Headers (Unit Price Master)
-- Example: A.2.2.15 - Pengukuran dan Bowplank
DROP TABLE IF EXISTS ahsp_headers;
CREATE TABLE ahsp_headers (
  id INT PRIMARY KEY AUTO_INCREMENT,
  kode VARCHAR(50) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  satuan VARCHAR(50) NOT NULL,
  version VARCHAR(20) DEFAULT '2024',
  status VARCHAR(20) DEFAULT 'active', -- active/deprecated/draft
  
  -- Calculated fields (denormalized for performance)
  harga_tenaga DECIMAL(15,2) DEFAULT 0, -- Section A total
  harga_bahan DECIMAL(15,2) DEFAULT 0,  -- Section B total
  harga_alat DECIMAL(15,2) DEFAULT 0,   -- Section C total
  harga_langsung DECIMAL(15,2) DEFAULT 0, -- D = A+B+C
  overhead_profit DECIMAL(15,2) DEFAULT 0, -- E = 10% of D
  harga_satuan DECIMAL(15,2) DEFAULT 0, -- F = D+E (FINAL UNIT PRICE)
  
  approved_at TIMESTAMP NULL,
  approved_by INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  INDEX idx_kode (kode),
  INDEX idx_status (status),
  INDEX idx_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- AHSP Detail Items (Breakdown: A=Labor, B=Material, C=Equipment)
DROP TABLE IF EXISTS ahsp_items;
CREATE TABLE ahsp_items (
  id INT PRIMARY KEY AUTO_INCREMENT,
  ahsp_id INT NOT NULL,
  section CHAR(1) NOT NULL, -- 'A'=Labor, 'B'=Material, 'C'=Equipment
  resource_type VARCHAR(20) NOT NULL, -- 'labor', 'material', 'equipment'
  resource_id INT NOT NULL,
  koefisien DECIMAL(10,4) NOT NULL DEFAULT 0,
  
  -- Snapshot for audit (denormalized)
  resource_name VARCHAR(255),
  resource_satuan VARCHAR(50),
  resource_harga DECIMAL(15,2),
  jumlah_harga DECIMAL(15,2), -- koefisien × harga
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  FOREIGN KEY (ahsp_id) REFERENCES ahsp_headers(id) ON DELETE CASCADE,
  INDEX idx_ahsp (ahsp_id),
  INDEX idx_section (section),
  INDEX idx_resource (resource_type, resource_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- AHSP to Sub-Discipline Mapping (Filter otomatis)
DROP TABLE IF EXISTS ahsp_sub_discipline_map;
CREATE TABLE ahsp_sub_discipline_map (
  ahsp_id INT NOT NULL,
  sub_discipline_id INT NOT NULL,
  PRIMARY KEY (ahsp_id, sub_discipline_id),
  FOREIGN KEY (ahsp_id) REFERENCES ahsp_headers(id) ON DELETE CASCADE,
  FOREIGN KEY (sub_discipline_id) REFERENCES master_sub_disciplines(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Proposals / Estimations (Main Object)
DROP TABLE IF EXISTS proposals;
CREATE TABLE proposals (
  id INT PRIMARY KEY AUTO_INCREMENT,
  proposal_number VARCHAR(50) UNIQUE,
  project_name VARCHAR(255) NOT NULL,
  client VARCHAR(255),
  lokasi VARCHAR(255),
  revision VARCHAR(20) DEFAULT 'Rev-0',
  status VARCHAR(20) DEFAULT 'draft', -- draft/review/approved/locked
  
  -- Cost Summary (denormalized)
  direct_cost DECIMAL(18,2) DEFAULT 0,
  overhead DECIMAL(18,2) DEFAULT 0,
  risk_contingency DECIMAL(18,2) DEFAULT 0,
  total_project DECIMAL(18,2) DEFAULT 0,
  
  created_by INT,
  approved_by INT NULL,
  approved_at TIMESTAMP NULL,
  locked_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  FOREIGN KEY (created_by) REFERENCES users(id),
  FOREIGN KEY (approved_by) REFERENCES users(id),
  INDEX idx_status (status),
  INDEX idx_number (proposal_number),
  INDEX idx_project (project_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Proposal Items (Mirror Excel Rows - PALING PENTING)
DROP TABLE IF EXISTS proposal_items;
CREATE TABLE proposal_items (
  id INT PRIMARY KEY AUTO_INCREMENT,
  proposal_id INT NOT NULL,
  
  discipline_id INT,
  sub_discipline_id INT,
  ahsp_id INT,
  
  -- Snapshot for versioning & audit (WAJIB)
  ahsp_code_snapshot VARCHAR(50),
  ahsp_name_snapshot VARCHAR(255),
  unit_snapshot VARCHAR(50),
  unit_price_snapshot DECIMAL(15,2) DEFAULT 0,
  
  -- User input
  description TEXT,
  qty DECIMAL(12,3) DEFAULT 0,
  
  -- Calculated
  total_price DECIMAL(18,2) DEFAULT 0, -- qty × unit_price
  
  order_no INT DEFAULT 0,
  notes TEXT,
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  FOREIGN KEY (proposal_id) REFERENCES proposals(id) ON DELETE CASCADE,
  FOREIGN KEY (discipline_id) REFERENCES master_disciplines(id) ON DELETE SET NULL,
  FOREIGN KEY (sub_discipline_id) REFERENCES master_sub_disciplines(id) ON DELETE SET NULL,
  FOREIGN KEY (ahsp_id) REFERENCES ahsp_headers(id) ON DELETE SET NULL,
  
  INDEX idx_proposal (proposal_id),
  INDEX idx_discipline (discipline_id),
  INDEX idx_sub_discipline (sub_discipline_id),
  INDEX idx_order (proposal_id, order_no)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Audit Log for Proposal Changes
DROP TABLE IF EXISTS proposal_audit_logs;
CREATE TABLE proposal_audit_logs (
  id INT PRIMARY KEY AUTO_INCREMENT,
  proposal_id INT NOT NULL,
  user_id INT NOT NULL,
  action VARCHAR(50), -- 'create', 'update_qty', 'add_item', 'delete_item', 'approve', 'lock'
  field_name VARCHAR(100),
  before_value TEXT,
  after_value TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (proposal_id) REFERENCES proposals(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id),
  INDEX idx_proposal (proposal_id),
  INDEX idx_user (user_id),
  INDEX idx_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
