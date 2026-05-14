CREATE TABLE custom_prompts (
  id text PRIMARY KEY NOT NULL,
  name text NOT NULL,
  content text NOT NULL,
  category text NOT NULL,
  scope text NOT NULL CHECK (scope IN ('user', 'country')),
  created_by text NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (created_by) REFERENCES users(email) ON DELETE CASCADE
);
CREATE INDEX idx_custom_prompts_created_by ON custom_prompts(created_by);
CREATE INDEX idx_custom_prompts_scope ON custom_prompts(scope);
