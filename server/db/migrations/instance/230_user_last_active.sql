-- When the user last wrote a user_logs row. AddLog keeps it current, so the
-- Users tab reads it from the roster row instead of aggregating user_logs.
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_active_at timestamptz;

UPDATE users u
SET last_active_at = l.last_active
FROM (
  SELECT user_email, MAX(timestamp) AS last_active
  FROM user_logs
  GROUP BY user_email
) l
WHERE u.email = l.user_email
  AND u.last_active_at IS NULL;
