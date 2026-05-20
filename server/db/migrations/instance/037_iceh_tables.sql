-- ICEH Data Integration Tables
-- Migration: 037_iceh_tables.sql

-- ICEH Indicators
CREATE TABLE IF NOT EXISTS iceh_indicators (
  iceh_indicator TEXT PRIMARY KEY,
  indicator_name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT '',
  numerator TEXT NOT NULL DEFAULT '',
  denominator TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0
);

-- ICEH Data
CREATE TABLE IF NOT EXISTS iceh_data (
  iceh_indicator TEXT NOT NULL REFERENCES iceh_indicators(iceh_indicator) ON DELETE CASCADE,
  year INTEGER NOT NULL,
  source TEXT NOT NULL,
  strat TEXT NOT NULL CHECK (strat IN (
    'national', 'area', 'wealth_quintiles', 'wealth_deciles',
    'womans_education', 'womans_education_4_groups',
    'womans_age_current', 'womans_age_at_birth', 'sex', 'subnational_unit'
  )),
  level TEXT NOT NULL,
  estimate REAL,
  standard_error REAL,
  sample_size INTEGER,
  PRIMARY KEY (iceh_indicator, year, source, strat, level)
);

CREATE INDEX IF NOT EXISTS idx_iceh_data_indicator ON iceh_data(iceh_indicator);
CREATE INDEX IF NOT EXISTS idx_iceh_data_year ON iceh_data(year);
CREATE INDEX IF NOT EXISTS idx_iceh_data_strat ON iceh_data(strat);

-- ICEH Upload Attempts (for import wizard state)
CREATE TABLE IF NOT EXISTS iceh_upload_attempts (
  id TEXT PRIMARY KEY NOT NULL DEFAULT 'single_row' CHECK (id = 'single_row'),
  date_started TEXT NOT NULL,
  step INTEGER NOT NULL,
  status TEXT NOT NULL,
  status_type TEXT NOT NULL,
  step_1_result TEXT,
  step_2_result TEXT,
  step_3_result TEXT
);
