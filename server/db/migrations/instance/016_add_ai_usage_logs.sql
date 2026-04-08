CREATE TABLE IF NOT EXISTS ai_usage_logs (
  id SERIAL PRIMARY KEY,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  user_email text NOT NULL,
  project_id text,
  model text NOT NULL,
  input_tokens integer NOT NULL DEFAULT 0,
  output_tokens integer NOT NULL DEFAULT 0,
  cache_read_input_tokens integer NOT NULL DEFAULT 0,
  cache_creation_input_tokens integer NOT NULL DEFAULT 0,
  FOREIGN KEY (user_email) REFERENCES users(email) ON DELETE CASCADE,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_ai_usage_logs_user_email ON ai_usage_logs(user_email);
CREATE INDEX IF NOT EXISTS idx_ai_usage_logs_project_id ON ai_usage_logs(project_id);
CREATE INDEX IF NOT EXISTS idx_ai_usage_logs_timestamp ON ai_usage_logs(timestamp DESC);
