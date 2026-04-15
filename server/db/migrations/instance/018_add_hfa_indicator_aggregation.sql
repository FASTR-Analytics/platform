ALTER TABLE hfa_indicators ADD COLUMN IF NOT EXISTS aggregation TEXT NOT NULL DEFAULT 'avg' CHECK (aggregation IN ('sum', 'avg'));
