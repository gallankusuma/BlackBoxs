-- Migration: Add Projects Module Tables (Linked to existing client_projects)
-- Description: Adds tables for Milestones, Tasks, Members, Files, Activities linked to client_projects

-- 1. Project Users (Members)
CREATE TABLE IF NOT EXISTS project_members (
  project_id INT NOT NULL,
  user_id INT NOT NULL,
  role VARCHAR(50) DEFAULT 'Member', -- Manager, Member, Viewer
  joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (project_id, user_id),
  FOREIGN KEY (project_id) REFERENCES client_projects(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 2. Project Milestones
CREATE TABLE IF NOT EXISTS project_milestones (
  id INT PRIMARY KEY AUTO_INCREMENT,
  project_id INT NOT NULL,
  title VARCHAR(255) NOT NULL,
  due_date DATE,
  status VARCHAR(50) DEFAULT 'Pending', -- Pending, Completed
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES client_projects(id) ON DELETE CASCADE
);

-- 3. Project Tasks
CREATE TABLE IF NOT EXISTS project_tasks (
  id INT PRIMARY KEY AUTO_INCREMENT,
  project_id INT NOT NULL,
  milestone_id INT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  status VARCHAR(50) DEFAULT 'To Do', -- To Do, In Progress, Review, Done
  priority VARCHAR(50) DEFAULT 'Medium', -- Low, Medium, High, Urgent
  start_date DATE,
  due_date DATE,
  assigned_to INT NULL, -- User ID
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES client_projects(id) ON DELETE CASCADE,
  FOREIGN KEY (milestone_id) REFERENCES project_milestones(id) ON DELETE SET NULL,
  FOREIGN KEY (assigned_to) REFERENCES users(id) ON DELETE SET NULL
);

-- 4. Project Files
CREATE TABLE IF NOT EXISTS project_files (
  id INT PRIMARY KEY AUTO_INCREMENT,
  project_id INT NOT NULL,
  file_name VARCHAR(255) NOT NULL,
  file_path VARCHAR(255) NOT NULL,
  file_type VARCHAR(50),
  file_size INT,
  uploaded_by INT,
  uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES client_projects(id) ON DELETE CASCADE,
  FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE SET NULL
);

-- 5. Project Activities (Audit Log / Feed)
CREATE TABLE IF NOT EXISTS project_activities (
  id INT PRIMARY KEY AUTO_INCREMENT,
  project_id INT NOT NULL,
  user_id INT,
  action_type VARCHAR(50) NOT NULL, -- 'created_task', 'uploaded_file', etc.
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES client_projects(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);
