-- The role column from 219 is withdrawn: the profile asks for the
-- organisation only.
ALTER TABLE users DROP COLUMN IF EXISTS role;
