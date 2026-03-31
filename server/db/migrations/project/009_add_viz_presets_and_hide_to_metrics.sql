ALTER TABLE metrics ADD COLUMN IF NOT EXISTS viz_presets text;
ALTER TABLE metrics ADD COLUMN IF NOT EXISTS hide boolean DEFAULT false;
ALTER TABLE metrics ADD COLUMN IF NOT EXISTS important_notes text;
