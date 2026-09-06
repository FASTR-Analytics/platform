-- ============================================================================
-- The population store (PLAN_1b rulings 1, 2; PLAN_1c).
--
-- Two tables: the population type vocabulary, seeded with the six FASTR
-- defaults that were the app's compile-time catalog until now, and the
-- annual figures themselves. A derived indicator's expression names a type
-- as `[population:<type>]` (migration 079 writes the retired
-- calculated_indicators rows that way; their enum was exactly this seed
-- list, so every expression 079 composes resolves); the app checks the
-- reference at save and at capture, and there is no FK from indicators.
--
-- NO data is imported: the old per-instance `population.csv` asset is not
-- read (Tim, 2026-08-30). Instances re-enter population through the
-- validated Population page; until they do, generating a package whose
-- expressions name a population fails loudly naming that page.
-- ============================================================================

CREATE TABLE IF NOT EXISTS population_types (
  id text PRIMARY KEY NOT NULL,
  label text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO population_types (id, label) VALUES
  ('total_population', 'Total population'),
  ('u5', 'Under 5 population'),
  ('u1', 'Under 1 population'),
  ('wra', 'Women of reproductive age (15-49)'),
  ('births', 'Expected births'),
  ('pregnancies', 'Expected pregnancies')
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS population (
  population_type text NOT NULL REFERENCES population_types (id) ON DELETE CASCADE,
  admin_area_level integer NOT NULL CHECK (admin_area_level IN (2, 3, 4)),
  admin_area_1 text NOT NULL,
  admin_area_2 text NOT NULL,
  admin_area_3 text NOT NULL DEFAULT '',
  admin_area_4 text NOT NULL DEFAULT '',
  year integer NOT NULL,
  count double precision NOT NULL CHECK (count >= 0),
  PRIMARY KEY (population_type, admin_area_level, admin_area_1, admin_area_2, admin_area_3, admin_area_4, year)
);

CREATE INDEX IF NOT EXISTS idx_population_type_level ON population(population_type, admin_area_level);
