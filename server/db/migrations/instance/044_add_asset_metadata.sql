CREATE TABLE IF NOT EXISTS asset_metadata (
  file_name text PRIMARY KEY,
  uploader_email text NOT NULL REFERENCES users(email) ON DELETE CASCADE,
  is_public boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
