-- ============================================
-- CLIENT MANAGEMENT MODULE - FULL SCHEMA
-- Reference: Professional CRM Client Management
-- Date: February 10, 2026
-- ============================================

-- 1. CLIENT LABELS (Corporate, VIP, Potential, etc.)
CREATE TABLE IF NOT EXISTS client_labels (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(50) NOT NULL UNIQUE,
  color VARCHAR(20) DEFAULT 'blue',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 2. CLIENT GROUPS (VIP, Gold, Silver, Bronze)
CREATE TABLE IF NOT EXISTS client_groups (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(50) NOT NULL UNIQUE,
  color VARCHAR(20) DEFAULT 'gray',
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 3. CLIENTS (Main client/company table)
CREATE TABLE IF NOT EXISTS clients (
  id INT PRIMARY KEY AUTO_INCREMENT,
  code VARCHAR(50) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  organization VARCHAR(255),
  address TEXT,
  city VARCHAR(100),
  province VARCHAR(100),
  postal_code VARCHAR(20),
  phone VARCHAR(50),
  website VARCHAR(255),
  client_group_id INT,
  primary_contact_id INT,
  total_invoiced DECIMAL(15,2) DEFAULT 0,
  payment_received DECIMAL(15,2) DEFAULT 0,
  due_amount DECIMAL(15,2) DEFAULT 0,
  is_active TINYINT DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (client_group_id) REFERENCES client_groups(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 4. CLIENT LABEL MAPPING (Many-to-Many)
CREATE TABLE IF NOT EXISTS client_label_map (
  id INT PRIMARY KEY AUTO_INCREMENT,
  client_id INT NOT NULL,
  label_id INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
  FOREIGN KEY (label_id) REFERENCES client_labels(id) ON DELETE CASCADE,
  UNIQUE KEY unique_client_label (client_id, label_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 5. CONTACTS (Individual contacts per client)
CREATE TABLE IF NOT EXISTS contacts (
  id INT PRIMARY KEY AUTO_INCREMENT,
  client_id INT NOT NULL,
  name VARCHAR(255) NOT NULL,
  job_title VARCHAR(100),
  email VARCHAR(255),
  phone VARCHAR(50),
  mobile VARCHAR(50),
  is_primary TINYINT DEFAULT 0,
  avatar_url VARCHAR(255),
  last_login TIMESTAMP NULL,
  is_active TINYINT DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 6. CLIENT PROJECTS (Project tracking per client)
CREATE TABLE IF NOT EXISTS client_projects (
  id INT PRIMARY KEY AUTO_INCREMENT,
  client_id INT NOT NULL,
  project_number VARCHAR(50) NOT NULL UNIQUE,
  project_name VARCHAR(255) NOT NULL,
  description TEXT,
  start_date DATE,
  end_date DATE,
  budget DECIMAL(15,2),
  actual_cost DECIMAL(15,2) DEFAULT 0,
  status ENUM('draft', 'open', 'in_progress', 'completed', 'hold', 'canceled') DEFAULT 'open',
  progress_percentage TINYINT DEFAULT 0,
  assigned_to INT,
  created_by INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
  FOREIGN KEY (assigned_to) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 7. CLIENT INVOICES (Invoice tracking per client)
CREATE TABLE IF NOT EXISTS client_invoices (
  id INT PRIMARY KEY AUTO_INCREMENT,
  client_id INT NOT NULL,
  invoice_number VARCHAR(50) NOT NULL UNIQUE,
  project_id INT,
  invoice_date DATE NOT NULL,
  due_date DATE,
  subtotal DECIMAL(15,2) NOT NULL,
  tax_amount DECIMAL(15,2) DEFAULT 0,
  total_amount DECIMAL(15,2) NOT NULL,
  paid_amount DECIMAL(15,2) DEFAULT 0,
  status ENUM('draft', 'sent', 'partial', 'paid', 'overdue', 'canceled') DEFAULT 'draft',
  payment_terms VARCHAR(100),
  notes TEXT,
  created_by INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
  FOREIGN KEY (project_id) REFERENCES client_projects(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 8. CLIENT PAYMENTS (Payment tracking)
CREATE TABLE IF NOT EXISTS client_payments (
  id INT PRIMARY KEY AUTO_INCREMENT,
  client_id INT NOT NULL,
  invoice_id INT,
  payment_date DATE NOT NULL,
  amount DECIMAL(15,2) NOT NULL,
  payment_method VARCHAR(50),
  reference_number VARCHAR(100),
  notes TEXT,
  created_by INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
  FOREIGN KEY (invoice_id) REFERENCES client_invoices(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 9. CLIENT ESTIMATES (Quotations/Estimates)
CREATE TABLE IF NOT EXISTS client_estimates (
  id INT PRIMARY KEY AUTO_INCREMENT,
  client_id INT NOT NULL,
  estimate_number VARCHAR(50) NOT NULL UNIQUE,
  estimate_date DATE NOT NULL,
  valid_until DATE,
  total_amount DECIMAL(15,2) NOT NULL,
  status ENUM('draft', 'sent', 'accepted', 'rejected', 'expired') DEFAULT 'draft',
  notes TEXT,
  created_by INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 10. CLIENT PROPOSALS
CREATE TABLE IF NOT EXISTS client_proposals (
  id INT PRIMARY KEY AUTO_INCREMENT,
  client_id INT NOT NULL,
  proposal_number VARCHAR(50) NOT NULL UNIQUE,
  title VARCHAR(255) NOT NULL,
  proposal_date DATE NOT NULL,
  total_amount DECIMAL(15,2),
  status ENUM('draft', 'sent', 'accepted', 'rejected', 'in_progress') DEFAULT 'draft',
  notes TEXT,
  created_by INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 11. CLIENT TICKETS (Support tickets)
CREATE TABLE IF NOT EXISTS client_tickets (
  id INT PRIMARY KEY AUTO_INCREMENT,
  client_id INT NOT NULL,
  contact_id INT,
  ticket_number VARCHAR(50) NOT NULL UNIQUE,
  subject VARCHAR(255) NOT NULL,
  description TEXT,
  priority ENUM('low', 'normal', 'high', 'urgent') DEFAULT 'normal',
  status ENUM('open', 'in_progress', 'waiting', 'closed') DEFAULT 'open',
  assigned_to INT,
  created_by INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
  FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE SET NULL,
  FOREIGN KEY (assigned_to) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 12. CLIENT ORDERS (Sales orders specific to clients)
CREATE TABLE IF NOT EXISTS client_orders (
  id INT PRIMARY KEY AUTO_INCREMENT,
  client_id INT NOT NULL,
  order_number VARCHAR(50) NOT NULL UNIQUE,
  order_date DATE NOT NULL,
  total_amount DECIMAL(15,2) NOT NULL,
  status ENUM('draft', 'confirmed', 'processing', 'shipped', 'delivered', 'canceled') DEFAULT 'draft',
  notes TEXT,
  created_by INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 13. EVENT TYPES (For calendar integration)
CREATE TABLE IF NOT EXISTS event_types (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(50) NOT NULL UNIQUE,
  color VARCHAR(20) DEFAULT 'blue',
  icon VARCHAR(50),
  is_system TINYINT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 14. CLIENT EVENTS (Events related to clients - integrated calendar)
CREATE TABLE IF NOT EXISTS client_events (
  id INT PRIMARY KEY AUTO_INCREMENT,
  client_id INT,
  contact_id INT,
  project_id INT,
  event_type_id INT NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  event_date DATE NOT NULL,
  start_time TIME,
  end_time TIME,
  location VARCHAR(255),
  attendees TEXT,
  reminder_minutes INT DEFAULT 0,
  created_by INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
  FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE SET NULL,
  FOREIGN KEY (project_id) REFERENCES client_projects(id) ON DELETE SET NULL,
  FOREIGN KEY (event_type_id) REFERENCES event_types(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================
-- SEED INITIAL DATA
-- ============================================

-- Insert Client Labels
INSERT IGNORE INTO client_labels (name, color) VALUES
('Corporate', 'purple'),
('VIP', 'yellow'),
('Unsatisfied', 'cyan'),
('Referral', 'cyan'),
('Potential', 'blue'),
('Inactive', 'gray');

-- Insert Client Groups
INSERT IGNORE INTO client_groups (name, color, description) VALUES
('VIP', 'yellow', 'VIP clients with premium service'),
('Gold', 'yellow', 'Gold tier clients'),
('Silver', 'gray', 'Silver tier clients'),
('Bronze', 'orange', 'Bronze tier clients');

-- Insert Event Types
INSERT IGNORE INTO event_types (name, color, icon, is_system) VALUES
('Events', 'blue', '📅', 1),
('Leave', 'purple', '🌴', 1),
('Task start date', 'teal', '📋', 1),
('Task deadline', 'pink', '⏰', 1),
('Project start date', 'blue', '🚀', 1),
('Project deadline', 'orange', '🎯', 1),
('Meeting', 'green', '🤝', 0),
('Call', 'cyan', '📞', 0),
('Follow-up', 'indigo', '👁️', 0);

-- ============================================
-- INDEXES FOR PERFORMANCE
-- ============================================

CREATE INDEX idx_clients_code ON clients(code);
CREATE INDEX idx_clients_name ON clients(name);
CREATE INDEX idx_clients_group ON clients(client_group_id);
CREATE INDEX idx_clients_active ON clients(is_active);

CREATE INDEX idx_contacts_client ON contacts(client_id);
CREATE INDEX idx_contacts_email ON contacts(email);
CREATE INDEX idx_contacts_primary ON contacts(is_primary);

CREATE INDEX idx_projects_client ON client_projects(client_id);
CREATE INDEX idx_projects_status ON client_projects(status);
CREATE INDEX idx_projects_dates ON client_projects(start_date, end_date);

CREATE INDEX idx_invoices_client ON client_invoices(client_id);
CREATE INDEX idx_invoices_status ON client_invoices(status);
CREATE INDEX idx_invoices_dates ON client_invoices(invoice_date, due_date);

CREATE INDEX idx_estimates_client ON client_estimates(client_id);
CREATE INDEX idx_estimates_status ON client_estimates(status);

CREATE INDEX idx_proposals_client ON client_proposals(client_id);
CREATE INDEX idx_proposals_status ON client_proposals(status);

CREATE INDEX idx_tickets_client ON client_tickets(client_id);
CREATE INDEX idx_tickets_status ON client_tickets(status);

CREATE INDEX idx_orders_client ON client_orders(client_id);
CREATE INDEX idx_orders_status ON client_orders(status);

CREATE INDEX idx_events_client ON client_events(client_id);
CREATE INDEX idx_events_date ON client_events(event_date);
CREATE INDEX idx_events_type ON client_events(event_type_id);
