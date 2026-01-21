-- Add project_logs table for tracking user activity within a project
CREATE TABLE IF NOT EXISTS project_logs (
  id SERIAL PRIMARY KEY,
  user_email text NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  endpoint text NOT NULL,
  endpoint_result text NOT NULL,
  project_id text NOT NULL,
  details text
);

CREATE INDEX IF NOT EXISTS idx_project_logs_timestamp ON project_logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_project_logs_user_email ON project_logs(user_email);
CREATE INDEX IF NOT EXISTS idx_project_logs_project_id ON project_logs(project_id);
