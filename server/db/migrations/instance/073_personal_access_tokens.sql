-- Personal access tokens: server-minted per-user credentials for headless
-- clients (MCP server, CLI). A PAT resolves to the real user identity in the
-- auth middleware, so every permission check downstream is the user's own.
-- Only the SHA-256 hash is stored; the token itself is shown once at mint.

CREATE TABLE IF NOT EXISTS personal_access_tokens (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_email text NOT NULL REFERENCES users(email) ON DELETE CASCADE,
  label text NOT NULL,
  token_hash text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_personal_access_tokens_user_email
  ON personal_access_tokens (user_email);
