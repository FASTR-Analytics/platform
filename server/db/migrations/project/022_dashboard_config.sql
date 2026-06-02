-- Dashboard branding & About: single JSON config column on dashboards
-- (logos + about). Idempotent; existing rows get the empty-config default.

ALTER TABLE dashboards
  ADD COLUMN IF NOT EXISTS config text NOT NULL
  DEFAULT '{"logos":{"availableCustom":[],"selected":[]},"about":{"summary":"","body":""}}';
