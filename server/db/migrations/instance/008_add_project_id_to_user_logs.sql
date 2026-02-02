-- Add project_id column to user_logs table
-- This consolidates logging into a single table instead of separate project_logs tables

ALTER TABLE user_logs ADD COLUMN project_id text;

-- Add foreign key constraint (project_id is nullable for non-project routes)
ALTER TABLE user_logs
  ADD CONSTRAINT fk_user_logs_project_id
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;

-- Add index for faster project-specific log queries
CREATE INDEX idx_user_logs_project_id ON user_logs(project_id) WHERE project_id IS NOT NULL;
