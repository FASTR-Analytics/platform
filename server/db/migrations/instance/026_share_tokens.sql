CREATE TABLE IF NOT EXISTS share_tokens (
  id VARCHAR PRIMARY KEY,
  token VARCHAR UNIQUE NOT NULL,
  resource_type VARCHAR NOT NULL,
  resource_id VARCHAR NOT NULL,
  data TEXT NOT NULL,
  created_by_email VARCHAR NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  view_count INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_share_tokens_token ON share_tokens(token);
CREATE INDEX IF NOT EXISTS idx_share_tokens_resource ON share_tokens(resource_type, resource_id);
