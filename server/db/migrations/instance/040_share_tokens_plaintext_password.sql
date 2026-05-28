ALTER TABLE share_tokens RENAME COLUMN password_hash TO password;
UPDATE share_tokens SET password = NULL WHERE password IS NOT NULL;
