CREATE TABLE IF NOT EXISTS user_logs_aggregate (
  id SERIAL PRIMARY KEY,
  user_email TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  endpoint_result TEXT NOT NULL,
  project_id TEXT,
  week_start DATE NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (user_email) REFERENCES users(email) ON DELETE CASCADE,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_logs_aggregate_unique
ON user_logs_aggregate (user_email, endpoint, endpoint_result, COALESCE(project_id, ''), week_start);
