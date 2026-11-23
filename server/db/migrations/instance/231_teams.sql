-- Teams (SYSTEM_18 "Teams"): a named group of users that a product can grant
-- a level to. The grant belongs to the team, so a member's level follows
-- their membership: joining a team gives every level it holds, leaving it
-- takes them away. Additive only: no existing row changes, so every level is
-- what it was until someone creates a team.

CREATE TABLE IF NOT EXISTS teams (
  id text PRIMARY KEY NOT NULL,        -- uuid
  label text NOT NULL CHECK (label <> ''),
  description text,
  created_by text,                     -- email
  created_at text NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS teams_label_unique ON teams (lower(label));

CREATE TABLE IF NOT EXISTS team_members (
  team_id text NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  email text NOT NULL REFERENCES users(email) ON DELETE CASCADE,
  PRIMARY KEY (team_id, email)
);

CREATE INDEX IF NOT EXISTS idx_team_members_email ON team_members(email);

CREATE TABLE IF NOT EXISTS product_team_access (
  product_id text NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  team_id text NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  level text NOT NULL CHECK (level IN ('view', 'edit')),
  PRIMARY KEY (product_id, team_id)
);

CREATE INDEX IF NOT EXISTS idx_product_team_access_team_id
  ON product_team_access(team_id);
