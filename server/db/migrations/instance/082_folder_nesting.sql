ALTER TABLE folders ADD COLUMN IF NOT EXISTS parent_id text
  REFERENCES folders(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_folders_parent_id ON folders(parent_id);
