ALTER TABLE users ADD COLUMN IF NOT EXISTS is_contact_person boolean NOT NULL DEFAULT false;
