-- The projects a scope was made from by the update that retired projects
-- (217_legacy_user_scopes writes it), as a JSON array of project labels in
-- text; NULL on every scope a person made. The client shows it as the
-- scope's "Migrated" badge.

ALTER TABLE scopes ADD COLUMN IF NOT EXISTS migrated_from text;
