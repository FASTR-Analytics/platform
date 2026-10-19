-- Private assets: visible only to the owner and the listed viewers.
-- owner_email has no FK to users on purpose: deleting the owner must not
-- cascade the row away and make the file public.
CREATE TABLE IF NOT EXISTS private_assets (
  file_name text PRIMARY KEY,
  owner_email text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS private_asset_viewers (
  file_name text NOT NULL REFERENCES private_assets(file_name) ON DELETE CASCADE,
  email text NOT NULL REFERENCES users(email) ON DELETE CASCADE,
  PRIMARY KEY (file_name, email)
);

CREATE INDEX IF NOT EXISTS idx_private_asset_viewers_email ON private_asset_viewers(email);
