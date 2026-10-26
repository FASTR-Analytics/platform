-- A user's organisation and role, written by the user from their profile and
-- shown to admins on the Users page. Organisation moves here from Clerk
-- unsafeMetadata, which admins could never read.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS organisation text,
  ADD COLUMN IF NOT EXISTS role text;
