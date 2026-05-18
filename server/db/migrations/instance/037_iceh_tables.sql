-- ICEH Data Integration Tables
-- Migration: 037_iceh_tables.sql

-- ICEH Disaggregators (stratification types)
CREATE TABLE iceh_disaggregators (
  strat TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_equity_dimension BOOLEAN NOT NULL DEFAULT TRUE
);

-- ICEH Indicators
CREATE TABLE iceh_indicators (
  indicator_code TEXT PRIMARY KEY,
  indicator_name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT '',
  numerator TEXT NOT NULL DEFAULT '',
  denominator TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ICEH Data
CREATE TABLE iceh_data (
  indicator_code TEXT NOT NULL REFERENCES iceh_indicators(indicator_code) ON DELETE CASCADE,
  year INTEGER NOT NULL,
  source TEXT NOT NULL,
  strat TEXT NOT NULL REFERENCES iceh_disaggregators(strat) ON DELETE RESTRICT,
  level TEXT NOT NULL,
  estimate REAL,
  standard_error REAL,
  sample_size INTEGER,
  PRIMARY KEY (indicator_code, year, source, strat, level)
);

CREATE INDEX idx_iceh_data_indicator ON iceh_data(indicator_code);
CREATE INDEX idx_iceh_data_year ON iceh_data(year);
CREATE INDEX idx_iceh_data_strat ON iceh_data(strat);

-- ICEH Upload Attempts (for import wizard state)
CREATE TABLE iceh_upload_attempts (
  id TEXT PRIMARY KEY NOT NULL DEFAULT 'single_row' CHECK (id = 'single_row'),
  date_started TEXT NOT NULL,
  step INTEGER NOT NULL,
  status TEXT NOT NULL,
  status_type TEXT NOT NULL,
  step_1_result TEXT,
  step_2_result TEXT,
  step_3_result TEXT
);
