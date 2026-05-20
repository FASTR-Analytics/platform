CREATE TABLE IF NOT EXISTS iceh_indicators_snapshot (
  iceh_indicator TEXT PRIMARY KEY NOT NULL,
  indicator_name TEXT NOT NULL,
  category TEXT NOT NULL,
  numerator TEXT NOT NULL,
  denominator TEXT NOT NULL,
  sort_order INTEGER NOT NULL
);
