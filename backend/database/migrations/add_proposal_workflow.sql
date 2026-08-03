-- Migration: Update proposal status workflow & link proposals to projects
-- Statuses: draft → review → submitted → deal / no_deal

-- Add proposal_id to client_projects (so we can trace which proposal created the project)
ALTER TABLE client_projects ADD COLUMN proposal_id INT NULL AFTER client_id;
ALTER TABLE client_projects ADD CONSTRAINT fk_project_proposal FOREIGN KEY (proposal_id) REFERENCES proposals(id) ON DELETE SET NULL;
CREATE INDEX idx_project_proposal ON client_projects(proposal_id);

-- Add submitted_at and deal_at timestamps to proposals
ALTER TABLE proposals ADD COLUMN submitted_at TIMESTAMP NULL AFTER approved_at;
ALTER TABLE proposals ADD COLUMN deal_at TIMESTAMP NULL AFTER submitted_at;

-- Add client_id reference to proposals (for auto-creating project with correct client link)
ALTER TABLE proposals ADD COLUMN client_id INT NULL AFTER client;
ALTER TABLE proposals ADD CONSTRAINT fk_proposal_client FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL;

-- Add project_id to proposals (back-reference when deal creates project)
ALTER TABLE proposals ADD COLUMN project_id INT NULL AFTER client_id;
ALTER TABLE proposals ADD CONSTRAINT fk_proposal_project FOREIGN KEY (project_id) REFERENCES client_projects(id) ON DELETE SET NULL;

-- Update existing proposal to set client_id from client name
UPDATE proposals p
JOIN clients c ON c.name = p.client
SET p.client_id = c.id
WHERE p.client IS NOT NULL AND p.client_id IS NULL;
