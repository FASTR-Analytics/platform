CREATE TABLE IF NOT EXISTS scorecard_indicators (
  scorecard_indicator_id     TEXT PRIMARY KEY NOT NULL,
  label                      TEXT NOT NULL UNIQUE,
  group_label                TEXT NOT NULL DEFAULT '',
  sort_order                 INTEGER NOT NULL DEFAULT 0,

  num_indicator_id           TEXT NOT NULL,
  denom_kind                 TEXT NOT NULL CHECK (denom_kind IN ('indicator', 'population')),
  denom_indicator_id         TEXT,
  denom_population_fraction  REAL,

  format_as                  TEXT NOT NULL DEFAULT 'percent' CHECK (format_as IN ('percent', 'number', 'rate_per_10k')),
  decimal_places             INTEGER NOT NULL DEFAULT 0,

  threshold_direction        TEXT NOT NULL DEFAULT 'higher_is_better' CHECK (threshold_direction IN ('higher_is_better', 'lower_is_better')),
  threshold_green            REAL NOT NULL,
  threshold_yellow           REAL NOT NULL,

  updated_at                 TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CHECK (
    (denom_kind = 'indicator'
       AND denom_indicator_id IS NOT NULL
       AND denom_population_fraction IS NULL)
    OR
    (denom_kind = 'population'
       AND denom_indicator_id IS NULL
       AND denom_population_fraction IS NOT NULL)
  )
);

INSERT INTO scorecard_indicators (
  scorecard_indicator_id,
  label,
  group_label,
  sort_order,
  num_indicator_id,
  denom_kind,
  denom_indicator_id,
  denom_population_fraction,
  format_as,
  decimal_places,
  threshold_direction,
  threshold_green,
  threshold_yellow
) VALUES
  ('anc4_anc1_before20_ratio',    'ANC4 / ANC1 <20wks',                            'Maternal & Newborn Health',  1, 'anc4',                  'indicator',  'anc1_before20',                NULL, 'percent',      0, 'higher_is_better', 80, 70),
  ('anc4_anc1_ratio',             'ANC4 / ANC1',                                   'Maternal & Newborn Health',  2, 'anc4',                  'indicator',  'anc1',                         NULL, 'percent',      0, 'higher_is_better', 80, 70),
  ('skilled_birth_attendance',    'Skilled Birth Attendant / Reported Deliveries', 'Maternal & Newborn Health',  3, 'sba',                   'indicator',  'delivery',                     NULL, 'percent',      0, 'higher_is_better', 80, 70),
  ('new_fp_acceptors_rate',       'New FP Acceptors / Women of Reproductive Age',  'Reproductive Health',        4, 'new_fp',                'population', NULL,                           0.22, 'percent',      0, 'higher_is_better', 80, 70),
  ('act_malaria_treatment',       'ACT for Uncomplicated Malaria',                 'Child Health',               5, 'mal_treatment',         'indicator',  'mal_confirmed_uncomplicated',  NULL, 'percent',      0, 'higher_is_better', 80, 70),
  ('penta3_coverage',             'Penta 3',                                       'Immunization',               6, 'penta3',                'population', NULL,                           0.04, 'percent',      0, 'higher_is_better', 80, 70),
  ('fully_immunized_coverage',    'Fully Immunized',                               'Immunization',               7, 'fully_immunized',       'population', NULL,                           0.04, 'percent',      0, 'higher_is_better', 80, 70),
  ('htn_new_per_10000',           'HTN New per 10,000 person-years',               'Non-Communicable Diseases',  8, 'hypertension_new',      'population', NULL,                           1.0,  'rate_per_10k', 0, 'lower_is_better',  10, 20),
  ('diabetes_new_per_10000',      'Diabetes New per 10,000 person-years',          'Non-Communicable Diseases',  9, 'diabetes_new',          'population', NULL,                           1.0,  'rate_per_10k', 0, 'lower_is_better',  10, 20),
  ('nhmis_data_timeliness_final', 'NHMIS reports on time with content',            'HMIS Reporting',            10, 'nhmis_timely_and_data', 'indicator',  'nhmis_expected_reports',       NULL, 'percent',      0, 'higher_is_better', 90, 80)
ON CONFLICT (scorecard_indicator_id) DO NOTHING;
