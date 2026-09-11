-- ============================================================================
-- One indicator list, sources underneath (PLAN_A3 ruling 12).
--
-- indicators_raw and indicator_mappings become indicator_sources: a source
-- (a DHIS2 data element or operand, or a CSV indicator column) belongs to
-- exactly one base indicator. Every mapped raw becomes the source of its one
-- common; every unmapped raw becomes a new base (id by ruling 10, restated
-- in PL/pgSQL below; lib/indicator_id.ts is the authority and
-- server/tests/indicator_sources_migration_test.ts pins the two spellings
-- to each other) with the raw as its sole source. dataset_hmis and the
-- ledger keep their rows under the renamed column source_id, the stored
-- JSON that carried raw ids is rewritten (ruling 4), is_default goes, and
-- the old tables are dropped last.
--
-- The whole file runs in one transaction (server/db/migrations/runner.ts),
-- so a RAISE anywhere leaves the old tables, columns and image untouched.
-- The guards fail-stop on what a person must resolve by hand before this
-- ships (ruling 12): a raw mapped to more than one common, a mapping onto a
-- derived indicator, and a derived row under a special id.
--
-- Fresh replay (./validate_migrations): indicators_raw does not exist, every
-- rename and constraint is guarded, and every UPDATE matches no row.
-- ============================================================================

-- ── The id generator, ruling 10 in PL/pgSQL ─────────────────────────────────
-- pg_temp functions live for this session only and never reach pg_dump.
-- NFKD-fold: the precomposed Latin letters U+00C0..U+017F that decompose to
-- one ASCII letter are translated before lower(), so the result does not
-- depend on the database locale; the five that decompose to two characters
-- are expanded first; everything else outside [a-z0-9] becomes an
-- underscore, exactly as the TypeScript slug does.

CREATE FUNCTION pg_temp.fastr_slug_indicator_id(p_text text) RETURNS text
LANGUAGE sql IMMUTABLE AS $f$
  SELECT regexp_replace(
    regexp_replace(
      lower(translate(
        replace(replace(replace(replace(replace(p_text,
          'Ŀ', 'L·'), 'ŀ', 'l·'), 'Ĳ', 'IJ'), 'ĳ', 'ij'), 'ŉ', 'ʼn'),
        'ÀÁÂÃÄÅÇÈÉÊËÌÍÎÏÑÒÓÔÕÖÙÚÛÜÝàáâãäåçèéêëìíîïñòóôõöùúûüýÿĀāĂăĄąĆćĈĉĊċČčĎďĒēĔĕĖėĘęĚěĜĝĞğĠġĢģĤĥĨĩĪīĬĭĮįİĴĵĶķĹĺĻļĽľŃńŅņŇňŌōŎŏŐőŔŕŖŗŘřŚśŜŝŞşŠšŢţŤťŨũŪūŬŭŮůŰűŲųŴŵŶŷŸŹźŻżŽžſ',
        'aaaaaaceeeeiiiinooooouuuuyaaaaaaceeeeiiiinooooouuuuyyaaaaaaccccccccddeeeeeeeeeegggggggghhiiiiiiiiijjkkllllllnnnnnnoooooorrrrrrssssssssttttuuuuuuuuuuuuwwyyyzzzzzzs'
      )),
      '[^a-z0-9]+', '_', 'g'),
    '^_+|_+$', '', 'g')
$f$;

-- The digit prefix and the 64 cap are applied once, to the chosen stem, so
-- an empty label with a digit-leading source id yields i_12abc, not
-- i_i_12abc (PLAN_A3 §8, step 1).
CREATE FUNCTION pg_temp.fastr_generate_indicator_id(
  p_label text, p_source_id text, p_taken text[]
) RETURNS text LANGUAGE plpgsql AS $f$
DECLARE
  v_stem text;
  v_capped text;
  v_candidate text;
  v_n integer := 2;
BEGIN
  v_stem := pg_temp.fastr_slug_indicator_id(p_label);
  IF v_stem = '' THEN
    v_stem := 'i_' || pg_temp.fastr_slug_indicator_id(p_source_id);
  END IF;
  IF v_stem ~ '^[0-9]' THEN
    v_stem := 'i_' || v_stem;
  END IF;
  v_capped := left(v_stem, 64);
  IF NOT (v_capped = ANY (p_taken)) THEN
    RETURN v_capped;
  END IF;
  LOOP
    v_candidate := v_capped || '_' || v_n;
    IF NOT (v_candidate = ANY (p_taken)) THEN
      RETURN v_candidate;
    END IF;
    v_n := v_n + 1;
  END LOOP;
END $f$;

-- ── Stored-JSON rewriters (ruling 4) ────────────────────────────────────────
-- Each is idempotent: a row already in the new shape passes through.

-- Pair lists: { indicatorRawId, periodId, ... } → { sourceId, periodId, ... },
-- the analytics-era `route` key stripped.
CREATE FUNCTION pg_temp.fastr_rename_pairs(p jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE AS $f$
  SELECT CASE
    WHEN p IS NULL OR jsonb_typeof(p) <> 'array' THEN p
    ELSE COALESCE((
      SELECT jsonb_agg(
        CASE WHEN e ? 'indicatorRawId'
          THEN (e - 'indicatorRawId' - 'route')
               || jsonb_build_object('sourceId', e -> 'indicatorRawId')
          ELSE e - 'route'
        END
        ORDER BY ord)
      FROM jsonb_array_elements(p) WITH ORDINALITY AS t(e, ord)
    ), '[]'::jsonb)
  END
$f$;

-- Pair fetch stats: as pairs, plus skippedValues backfilled to 0 (absent on
-- run rows written before migration 085).
CREATE FUNCTION pg_temp.fastr_rename_pair_stats(p jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE AS $f$
  SELECT CASE
    WHEN p IS NULL OR jsonb_typeof(p) <> 'array' THEN p
    ELSE COALESCE((
      SELECT jsonb_agg(
        e || jsonb_build_object('skippedValues', COALESCE(e -> 'skippedValues', '0'::jsonb))
        ORDER BY ord)
      FROM jsonb_array_elements(pg_temp.fastr_rename_pairs(p)) WITH ORDINALITY AS t(e, ord)
    ), '[]'::jsonb)
  END
$f$;

-- periodIndicatorStats: indicatorRawId (or the indicatorCommonId older CSV
-- code wrote) → sourceId.
CREATE FUNCTION pg_temp.fastr_rename_period_stats(p jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE AS $f$
  SELECT CASE
    WHEN p IS NULL OR jsonb_typeof(p) <> 'array' THEN p
    ELSE COALESCE((
      SELECT jsonb_agg(
        CASE
          WHEN e ? 'indicatorRawId'
            THEN (e - 'indicatorRawId' - 'indicatorCommonId')
                 || jsonb_build_object('sourceId', e -> 'indicatorRawId')
          WHEN e ? 'indicatorCommonId' AND NOT (e ? 'sourceId')
            THEN (e - 'indicatorCommonId')
                 || jsonb_build_object('sourceId', e -> 'indicatorCommonId')
          ELSE e
        END
        ORDER BY ord)
      FROM jsonb_array_elements(p) WITH ORDINALITY AS t(e, ord)
    ), '[]'::jsonb)
  END
$f$;

-- A CSV staging result: its period stats and the unmappedIndicators
-- diagnostics block, which becomes unknownSources with source_id samples.
CREATE FUNCTION pg_temp.fastr_rewrite_csv_staging(p jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE AS $f$
  SELECT CASE
    WHEN p IS NULL OR jsonb_typeof(p) <> 'object' THEN p
    ELSE (
      CASE WHEN p ? 'periodIndicatorStats'
        THEN jsonb_set(p, '{periodIndicatorStats}', pg_temp.fastr_rename_period_stats(p -> 'periodIndicatorStats'))
        ELSE p
      END
    ) || (
      CASE WHEN p -> 'validation' ? 'unmappedIndicators'
        THEN jsonb_build_object('validation',
          ((p -> 'validation') - 'unmappedIndicators') || jsonb_build_object('unknownSources',
            ((p -> 'validation' -> 'unmappedIndicators') - 'sample') || jsonb_build_object('sample',
              COALESCE((
                SELECT jsonb_agg(
                  CASE WHEN s ? 'indicator_raw_id'
                    THEN (s - 'indicator_raw_id') || jsonb_build_object('source_id', s -> 'indicator_raw_id')
                    ELSE s
                  END
                  ORDER BY ord)
                FROM jsonb_array_elements(COALESCE(p -> 'validation' -> 'unmappedIndicators' -> 'sample', '[]'::jsonb))
                  WITH ORDINALITY AS t(s, ord)
              ), '[]'::jsonb))))
        ELSE '{}'::jsonb
      END
    )
  END
$f$;

-- A DHIS2 staging result on a version row: every pair-shaped list.
CREATE FUNCTION pg_temp.fastr_rewrite_dhis2_staging(p jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE AS $f$
  SELECT p
    || CASE WHEN p ? 'failedFetches' THEN jsonb_build_object('failedFetches', pg_temp.fastr_rename_pairs(p -> 'failedFetches')) ELSE '{}'::jsonb END
    || CASE WHEN p ? 'periodIndicatorStats' THEN jsonb_build_object('periodIndicatorStats', pg_temp.fastr_rename_period_stats(p -> 'periodIndicatorStats')) ELSE '{}'::jsonb END
    || CASE WHEN p ? 'succeededWorkItems' THEN jsonb_build_object('succeededWorkItems', pg_temp.fastr_rename_pairs(p -> 'succeededWorkItems')) ELSE '{}'::jsonb END
    || CASE WHEN p ? 'pairFetchStats' THEN jsonb_build_object('pairFetchStats', pg_temp.fastr_rename_pair_stats(p -> 'pairFetchStats')) ELSE '{}'::jsonb END
$f$;

-- A windowed-delete staging result: the windowing it recorded moves to the
-- source grain.
CREATE FUNCTION pg_temp.fastr_rewrite_deletion_staging(p jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE AS $f$
  SELECT CASE
    WHEN p -> 'windowing' IS NULL OR jsonb_typeof(p -> 'windowing') <> 'object' THEN p
    ELSE jsonb_set(p, '{windowing}',
      ((p -> 'windowing') - 'indicatorType' - 'rawIndicatorsToInclude' - 'commonIndicatorsToInclude')
      || CASE
           WHEN p -> 'windowing' ? 'rawIndicatorsToInclude'
             THEN jsonb_build_object('grain', 'source', 'sourcesToInclude', p -> 'windowing' -> 'rawIndicatorsToInclude')
           WHEN p -> 'windowing' ? 'commonIndicatorsToInclude'
             THEN jsonb_build_object('grain', 'indicator', 'indicatorsToInclude', p -> 'windowing' -> 'commonIndicatorsToInclude')
           ELSE '{}'::jsonb
         END)
  END
$f$;

-- ── 1. The new table ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS indicator_sources (
  source_id text PRIMARY KEY NOT NULL,
  indicator_id text NOT NULL REFERENCES indicators(indicator_common_id) ON DELETE CASCADE,
  source_label text NOT NULL,
  updated_at timestamptz DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_indicator_sources_indicator_id ON indicator_sources(indicator_id);

-- ── 2. Guards, then the data move ───────────────────────────────────────────

DO $$
DECLARE
  -- lib/special_indicators.ts SPECIAL_INDICATOR_IDS, as of this migration.
  v_special text[] := ARRAY[
    'anc1', 'anc4', 'delivery', 'sba', 'bcg', 'penta1', 'penta3', 'measles1',
    'measles2', 'opd', 'pnc1', 'pnc1_mother', 'rdt_positive', 'micro_positive',
    'confirmed_malaria_treated_with_act', 'rota1', 'rota2', 'opv1', 'opv2',
    'opv3', 'vitaminA', 'fully_immunized'
  ];
  -- lib/types/indicators.ts RESERVED_WORDS: the specials plus the population
  -- type ids and the expression function names.
  v_reserved text[] := ARRAY[
    'anc1', 'anc4', 'delivery', 'sba', 'bcg', 'penta1', 'penta3', 'measles1',
    'measles2', 'opd', 'pnc1', 'pnc1_mother', 'rdt_positive', 'micro_positive',
    'confirmed_malaria_treated_with_act', 'rota1', 'rota2', 'opv1', 'opv2',
    'opv3', 'vitaminA', 'fully_immunized',
    'population_total', 'population_u5', 'population_u1', 'population_wra',
    'population_births', 'population_pregnancies',
    'abs', 'coalesce', 'nullif'
  ];
  v_bad text[];
  v_taken text[];
  v_new_id text;
  r RECORD;
BEGIN
  -- A special id may exist only as a base: the module scripts read it as a
  -- count, so a derived under it would be silently ignored.
  SELECT COALESCE(array_agg(indicator_common_id ORDER BY indicator_common_id), ARRAY[]::text[])
  INTO v_bad
  FROM indicators
  WHERE definition_type = 'derived' AND indicator_common_id = ANY (v_special);
  IF array_length(v_bad, 1) > 0 THEN
    RAISE EXCEPTION
      'A special indicator id (one the analysis modules read as a count) may only be a base indicator. Retype or rename these derived indicators in the indicator manager first: %',
      array_to_string(v_bad, '; ');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'indicators_raw'
  ) THEN
    RETURN;
  END IF;

  -- A source belongs to exactly one base. A raw summed into two commons is
  -- resolved by a person: it stays on one, and the other becomes a derived
  -- over its parts (a choice that moves adjustment from the sum to the parts).
  SELECT COALESCE(array_agg(d ORDER BY d), ARRAY[]::text[]) INTO v_bad
  FROM (
    SELECT indicator_raw_id || ' -> ' || string_agg(indicator_common_id, ', ' ORDER BY indicator_common_id) AS d
    FROM indicator_mappings
    GROUP BY indicator_raw_id
    HAVING COUNT(*) > 1
  ) t;
  IF array_length(v_bad, 1) > 0 THEN
    RAISE EXCEPTION
      'A raw indicator may be mapped to only one common indicator (it becomes that indicator''s source). Resolve these in the indicator manager first, keeping each raw on one common and rewriting the other as a derived indicator: %',
      array_to_string(v_bad, '; ');
  END IF;

  -- A derived indicator has no sources.
  SELECT COALESCE(array_agg(d ORDER BY d), ARRAY[]::text[]) INTO v_bad
  FROM (
    SELECT im.indicator_raw_id || ' -> ' || im.indicator_common_id AS d
    FROM indicator_mappings im
    JOIN indicators i ON i.indicator_common_id = im.indicator_common_id
    WHERE i.definition_type = 'derived'
  ) t;
  IF array_length(v_bad, 1) > 0 THEN
    RAISE EXCEPTION
      'A derived indicator is defined by its formula and cannot have raw indicators mapped to it. Remove these mappings in the indicator manager first: %',
      array_to_string(v_bad, '; ');
  END IF;

  -- Every mapped raw becomes the source of its one common.
  FOR r IN
    SELECT im.indicator_raw_id, im.indicator_common_id, ir.indicator_raw_label, ir.updated_at
    FROM indicator_mappings im
    JOIN indicators_raw ir ON ir.indicator_raw_id = im.indicator_raw_id
    ORDER BY im.indicator_common_id, im.indicator_raw_id
  LOOP
    INSERT INTO indicator_sources (source_id, indicator_id, source_label, updated_at)
    VALUES (r.indicator_raw_id, r.indicator_common_id, r.indicator_raw_label,
            COALESCE(r.updated_at, CURRENT_TIMESTAMP))
    ON CONFLICT (source_id) DO NOTHING;
    RAISE NOTICE '[086] source % -> indicator %', r.indicator_raw_id, r.indicator_common_id;
  END LOOP;

  -- Every unmapped raw becomes a new base with the raw as its sole source.
  SELECT COALESCE(array_agg(indicator_common_id), ARRAY[]::text[]) INTO v_taken FROM indicators;
  v_taken := v_taken || v_reserved;
  FOR r IN
    SELECT ir.indicator_raw_id, ir.indicator_raw_label
    FROM indicators_raw ir
    WHERE NOT EXISTS (
      SELECT 1 FROM indicator_mappings im WHERE im.indicator_raw_id = ir.indicator_raw_id
    )
    AND NOT EXISTS (
      SELECT 1 FROM indicator_sources s WHERE s.source_id = ir.indicator_raw_id
    )
    ORDER BY ir.indicator_raw_id
  LOOP
    v_new_id := pg_temp.fastr_generate_indicator_id(
      r.indicator_raw_label, r.indicator_raw_id, v_taken);
    v_taken := v_taken || v_new_id;
    INSERT INTO indicators (
      indicator_common_id, indicator_common_label, definition_type, expression,
      format_as, thresholds, sort_order, updated_at
    )
    SELECT v_new_id, r.indicator_raw_label, 'base', NULL,
           'number', NULL, COALESCE(MAX(sort_order), 0) + 1, CURRENT_TIMESTAMP
    FROM indicators;
    INSERT INTO indicator_sources (source_id, indicator_id, source_label, updated_at)
    VALUES (r.indicator_raw_id, v_new_id, r.indicator_raw_label, CURRENT_TIMESTAMP);
    RAISE NOTICE '[086] new base % from unmapped raw % (%)', v_new_id, r.indicator_raw_id, r.indicator_raw_label;
  END LOOP;
END $$;

-- ── 3. Column renames (O(1): the primary key and the indexes follow) ────────

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'dataset_hmis' AND column_name = 'indicator_raw_id'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'dataset_hmis' AND column_name = 'source_id'
  ) THEN
    ALTER TABLE dataset_hmis RENAME COLUMN indicator_raw_id TO source_id;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'dataset_hmis_import_ledger' AND column_name = 'indicator_raw_id'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'dataset_hmis_import_ledger' AND column_name = 'source_id'
  ) THEN
    ALTER TABLE dataset_hmis_import_ledger RENAME COLUMN indicator_raw_id TO source_id;
  END IF;
END $$;

-- ── 4. Foreign keys: drop the old ones by target, add the new by name ───────
-- The base schema never named the FKs to indicators_raw, so they are found
-- through what they reference. The new ones carry the names the base schema
-- gives them, so the fresh replay stays byte-identical.

DO $$
DECLARE
  r RECORD;
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'indicators_raw'
  ) THEN
    FOR r IN
      SELECT c.conname, c.conrelid::regclass AS tbl
      FROM pg_constraint c
      WHERE c.contype = 'f'
        AND c.confrelid = 'public.indicators_raw'::regclass
        AND c.conrelid IN ('public.dataset_hmis'::regclass, 'public.dataset_hmis_import_ledger'::regclass)
    LOOP
      EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', r.tbl, r.conname);
    END LOOP;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'dataset_hmis_source_id_fkey') THEN
    ALTER TABLE dataset_hmis
      ADD CONSTRAINT dataset_hmis_source_id_fkey
      FOREIGN KEY (source_id) REFERENCES indicator_sources(source_id) ON DELETE RESTRICT DEFERRABLE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'dataset_hmis_import_ledger_source_id_fkey') THEN
    ALTER TABLE dataset_hmis_import_ledger
      ADD CONSTRAINT dataset_hmis_import_ledger_source_id_fkey
      FOREIGN KEY (source_id) REFERENCES indicator_sources(source_id) ON DELETE CASCADE;
  END IF;
END $$;

-- ── 5. is_default goes: nothing marks the seeded specials after ─────────────

ALTER TABLE indicators DROP COLUMN IF EXISTS is_default;

-- ── 6. Stored JSON (ruling 4) ───────────────────────────────────────────────

-- Run selections: a window selected raw ids; those are now the run's
-- expanded sourceIds, with no indicator selection to show for it.
UPDATE dataset_hmis_import_runs
SET selection = (
  (selection::jsonb - 'rawIndicatorIds')
  || jsonb_build_object(
       'indicatorIds', '[]'::jsonb,
       'sourceIds', selection::jsonb -> 'rawIndicatorIds',
       'populationTermsDropped', '[]'::jsonb,
       'nonDhis2SourcesDropped', '[]'::jsonb)
)::text
WHERE selection IS NOT NULL AND selection::jsonb ? 'rawIndicatorIds';

UPDATE dataset_hmis_import_runs
SET selection = jsonb_set(selection::jsonb, '{pairs}', pg_temp.fastr_rename_pairs(selection::jsonb -> 'pairs'))::text
WHERE selection IS NOT NULL AND selection::jsonb ? 'pairs';

-- Progress: in-flight pair lists (NULL on every finished run).
UPDATE dataset_hmis_import_runs
SET progress = jsonb_set(progress::jsonb, '{activePairs}', pg_temp.fastr_rename_pairs(progress::jsonb -> 'activePairs'))::text
WHERE progress IS NOT NULL AND progress::jsonb ? 'activePairs';

-- DHIS2 run stats: pair keys, the analytics-era route/computedIndicators
-- fields, and the two keys step 2 left optional until here.
UPDATE dataset_hmis_import_runs
SET run_stats = (
  jsonb_set(
    jsonb_set(run_stats::jsonb, '{pairFetchStats}',
      pg_temp.fastr_rename_pair_stats(COALESCE(run_stats::jsonb -> 'pairFetchStats', '[]'::jsonb))),
    '{classification}',
    (COALESCE(run_stats::jsonb -> 'classification', '{}'::jsonb) - 'computedIndicators')
    || jsonb_build_object('dhis2IndicatorIds',
         COALESCE(run_stats::jsonb -> 'classification' -> 'dhis2IndicatorIds', '[]'::jsonb)))
)::text
WHERE source = 'dhis2' AND run_stats IS NOT NULL AND jsonb_typeof(run_stats::jsonb) = 'object';

-- CSV run stats: the staging diagnostics.
UPDATE dataset_hmis_import_runs
SET run_stats = jsonb_set(run_stats::jsonb, '{csvStagingResult}',
  pg_temp.fastr_rewrite_csv_staging(run_stats::jsonb -> 'csvStagingResult'))::text
WHERE source = 'csv' AND run_stats IS NOT NULL AND run_stats::jsonb ? 'csvStagingResult';

-- CSV configs: the mapping key.
UPDATE dataset_hmis_import_runs
SET csv_config = jsonb_set(csv_config::jsonb, '{mappings}',
  ((csv_config::jsonb -> 'mappings') - 'raw_indicator_id')
  || jsonb_build_object('source_id', csv_config::jsonb -> 'mappings' -> 'raw_indicator_id'))::text
WHERE csv_config IS NOT NULL AND csv_config::jsonb -> 'mappings' ? 'raw_indicator_id';

-- Version rows: by the staging result's source type.
UPDATE dataset_hmis_versions
SET staging_result = pg_temp.fastr_rewrite_dhis2_staging(staging_result::jsonb)::text
WHERE staging_result IS NOT NULL AND staging_result::jsonb ->> 'sourceType' = 'dhis2';

UPDATE dataset_hmis_versions
SET staging_result = pg_temp.fastr_rewrite_csv_staging(staging_result::jsonb)::text
WHERE staging_result IS NOT NULL AND staging_result::jsonb ->> 'sourceType' = 'csv';

UPDATE dataset_hmis_versions
SET staging_result = pg_temp.fastr_rewrite_deletion_staging(staging_result::jsonb)::text
WHERE staging_result IS NOT NULL AND staging_result::jsonb ->> 'sourceType' = 'deletion';

-- Schedules: the raw ids become the ids of the bases now owning them.
UPDATE dataset_hmis_scheduled_imports s
SET selection = (
  (s.selection::jsonb - 'rawIndicatorIds')
  || jsonb_build_object('indicatorIds', COALESCE((
       SELECT jsonb_agg(DISTINCT src.indicator_id)
       FROM jsonb_array_elements_text(s.selection::jsonb -> 'rawIndicatorIds') AS r(id)
       JOIN indicator_sources src ON src.source_id = r.id
     ), '[]'::jsonb))
)::text
WHERE s.selection IS NOT NULL AND s.selection::jsonb ? 'rawIndicatorIds';

-- ── 7. The old tables ───────────────────────────────────────────────────────

DROP TABLE IF EXISTS indicator_mappings;
DROP TABLE IF EXISTS indicators_raw;

DROP FUNCTION IF EXISTS pg_temp.fastr_rewrite_deletion_staging(jsonb);
DROP FUNCTION IF EXISTS pg_temp.fastr_rewrite_dhis2_staging(jsonb);
DROP FUNCTION IF EXISTS pg_temp.fastr_rewrite_csv_staging(jsonb);
DROP FUNCTION IF EXISTS pg_temp.fastr_rename_period_stats(jsonb);
DROP FUNCTION IF EXISTS pg_temp.fastr_rename_pair_stats(jsonb);
DROP FUNCTION IF EXISTS pg_temp.fastr_rename_pairs(jsonb);
DROP FUNCTION IF EXISTS pg_temp.fastr_generate_indicator_id(text, text, text[]);
DROP FUNCTION IF EXISTS pg_temp.fastr_slug_indicator_id(text);
