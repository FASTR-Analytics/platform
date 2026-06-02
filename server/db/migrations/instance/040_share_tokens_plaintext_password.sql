DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'share_tokens' AND column_name = 'password_hash') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'share_tokens' AND column_name = 'password') THEN
      ALTER TABLE share_tokens RENAME COLUMN password_hash TO password;
    ELSE
      ALTER TABLE share_tokens DROP COLUMN password_hash;
    END IF;
  END IF;
END $$;
UPDATE share_tokens SET password = NULL WHERE password IS NOT NULL;
