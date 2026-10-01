-- Scope grants (PLAN_SCOPES step 5). A user with all_scopes = FALSE is
-- restricted: they see only products whose scope they hold in user_scopes,
-- and read package data only through those scopes. Every existing user, and
-- every new one, is unrestricted (the default). A global admin is
-- unrestricted whatever the flag says.

ALTER TABLE users ADD COLUMN IF NOT EXISTS all_scopes boolean NOT NULL DEFAULT TRUE;

CREATE TABLE IF NOT EXISTS user_scopes (
  email text NOT NULL REFERENCES users(email) ON DELETE CASCADE,
  scope_id text NOT NULL REFERENCES scopes(id) ON DELETE CASCADE,
  PRIMARY KEY (email, scope_id)
);

CREATE INDEX IF NOT EXISTS idx_user_scopes_scope_id ON user_scopes(scope_id);
