-- A global admin is unrestricted, so an admin row never carries a
-- restriction or grants: the rows that do are cleared, and the CHECK keeps a
-- promotion from leaving one behind.
UPDATE users SET all_scopes = TRUE WHERE is_admin AND NOT all_scopes;

DELETE FROM user_scopes s USING users u WHERE u.email = s.email AND u.is_admin;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'users_admin_unrestricted'
  ) THEN
    ALTER TABLE users
      ADD CONSTRAINT users_admin_unrestricted CHECK (NOT is_admin OR all_scopes);
  END IF;
END $$;
