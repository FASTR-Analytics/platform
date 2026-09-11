-- ============================================================================
-- One table of indicators (PLAN_A4 ruling 10).
--
-- indicators_raw and indicator_mappings fold into indicators: a raw mapped
-- 1:1 to a common that has no other mapping, and whose id is DHIS2-shaped,
-- makes that common a DHIS2 element (dhis2_id = the raw id) and its data
-- rows move to the common's id. Every other raw becomes a base of its own:
-- DHIS2-shaped under an id generated from its label (PLAN_A3 ruling 10,
-- restated in PL/pgSQL below; lib/indicator_id.ts is the authority and
-- server/tests/indicator_migration_test.ts pins the two spellings), CSV
-- raws under their own id when it passes the validator, else a generated
-- one. A common whose raws did not fold becomes a sum over the bases they
-- became. A derived row under a special id is renamed to its suffix form and
-- an empty base is inserted under the special id. include_in_analysis is
-- TRUE for every row that was a common and FALSE for every base created from
-- a raw, so the first package after the migration analyses exactly the
-- series the last one did. dataset_hmis and the ledger keep their rows under
-- the renamed column indicator_id, every stored JSON shape is rewritten,
-- is_default goes, and the old tables are dropped last.
--
-- No guard fail-stops on data: nothing is resolved by hand. The whole file
-- runs in one transaction (server/db/migrations/runner.ts).
--
-- Fresh replay (./validate_migrations): indicators_raw does not exist, every
-- column add, rename and constraint is guarded, and every UPDATE matches no
-- row. ./validate_indicator_migration replays it over real dumps.
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
-- an empty label with a digit-leading fallback id yields i_12abc, not
-- i_i_12abc (PLAN_A3 §8, step 1).
CREATE FUNCTION pg_temp.fastr_generate_indicator_id(
  p_label text, p_fallback_id text, p_taken text[]
) RETURNS text LANGUAGE plpgsql AS $f$
DECLARE
  v_stem text;
  v_capped text;
  v_candidate text;
  v_n integer := 2;
BEGIN
  v_stem := pg_temp.fastr_slug_indicator_id(p_label);
  IF v_stem = '' THEN
    v_stem := 'i_' || pg_temp.fastr_slug_indicator_id(p_fallback_id);
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

-- The validator's charset rule for a CSV raw keeping its own id
-- (lib getNewIndicatorIdIssue: non-empty, trimmed, no , ; : [ ], at most
-- 128 characters). Reserved words are checked by the caller.
CREATE FUNCTION pg_temp.fastr_id_charset_ok(p_id text) RETURNS boolean
LANGUAGE sql IMMUTABLE AS $f$
  SELECT p_id <> '' AND btrim(p_id) = p_id AND p_id !~ '[,;:\[\]]' AND length(p_id) <= 128
$f$;

-- Rename one identifier in an expression written in the app's grammar: a
-- bare identifier stands alone between non-identifier characters; a
-- bracketed one is `[id]` exactly. Text inside other brackets is untouched.
CREATE FUNCTION pg_temp.fastr_rename_identifier(p_expr text, p_old text, p_new text)
RETURNS text LANGUAGE sql IMMUTABLE AS $f$
  SELECT COALESCE((
    SELECT string_agg(
      CASE
        WHEN m[1] = '[' || p_old || ']' THEN '[' || p_new || ']'
        WHEN left(m[1], 1) = '[' THEN m[1]
        ELSE regexp_replace(m[1], '(?<![a-zA-Z0-9_])' || p_old || '(?![a-zA-Z0-9_])', p_new, 'g')
      END, '' ORDER BY ord)
    FROM regexp_matches(p_expr, '(\[[^\]]*\]|[^\[]+)', 'g') WITH ORDINALITY AS t(m, ord)
  ), p_expr)
$f$;

-- ── The id table: what each raw became ──────────────────────────────────────
-- Filled by the data move below, read by every stored-JSON rewriter, and
-- raised as NOTICEs at the end. Empty on a fresh replay.

CREATE TEMP TABLE fastr_raw_to_indicator (
  raw_id text PRIMARY KEY,
  indicator_id text NOT NULL,
  raw_label text NOT NULL,
  folded boolean NOT NULL
);

CREATE FUNCTION pg_temp.fastr_map_id(p_raw_id text) RETURNS text
LANGUAGE sql STABLE AS $f$
  SELECT COALESCE((SELECT indicator_id FROM fastr_raw_to_indicator WHERE raw_id = p_raw_id), p_raw_id)
$f$;

-- ── Stored-JSON rewriters (ruling 10) ───────────────────────────────────────
-- Each takes the pre-086 shape and is a pass-through for anything else.

-- Pair lists: { indicatorRawId, periodId, ... } →
-- { indicatorId, dhis2Id, periodId, ... }, the analytics-era `route` key
-- stripped.
CREATE FUNCTION pg_temp.fastr_rename_pairs(p jsonb) RETURNS jsonb
LANGUAGE sql STABLE AS $f$
  SELECT CASE
    WHEN p IS NULL OR jsonb_typeof(p) <> 'array' THEN p
    ELSE COALESCE((
      SELECT jsonb_agg(
        CASE WHEN e ? 'indicatorRawId'
          THEN (e - 'indicatorRawId' - 'route')
               || jsonb_build_object(
                    'indicatorId', pg_temp.fastr_map_id(e ->> 'indicatorRawId'),
                    'dhis2Id', e ->> 'indicatorRawId')
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
LANGUAGE sql STABLE AS $f$
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
-- code wrote) → indicatorId.
CREATE FUNCTION pg_temp.fastr_rename_period_stats(p jsonb) RETURNS jsonb
LANGUAGE sql STABLE AS $f$
  SELECT CASE
    WHEN p IS NULL OR jsonb_typeof(p) <> 'array' THEN p
    ELSE COALESCE((
      SELECT jsonb_agg(
        CASE
          WHEN e ? 'indicatorRawId'
            THEN (e - 'indicatorRawId' - 'indicatorCommonId')
                 || jsonb_build_object('indicatorId', pg_temp.fastr_map_id(e ->> 'indicatorRawId'))
          WHEN e ? 'indicatorCommonId' AND NOT (e ? 'indicatorId')
            THEN (e - 'indicatorCommonId')
                 || jsonb_build_object('indicatorId', e -> 'indicatorCommonId')
          ELSE e
        END
        ORDER BY ord)
      FROM jsonb_array_elements(p) WITH ORDINALITY AS t(e, ord)
    ), '[]'::jsonb)
  END
$f$;

-- A CSV staging result: its period stats and the unmappedIndicators
-- diagnostics block, which becomes unknownIndicators with indicator_id
-- samples.
CREATE FUNCTION pg_temp.fastr_rewrite_csv_staging(p jsonb) RETURNS jsonb
LANGUAGE sql STABLE AS $f$
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
          ((p -> 'validation') - 'unmappedIndicators') || jsonb_build_object('unknownIndicators',
            ((p -> 'validation' -> 'unmappedIndicators') - 'sample') || jsonb_build_object('sample',
              COALESCE((
                SELECT jsonb_agg(
                  CASE WHEN s ? 'indicator_raw_id'
                    THEN (s - 'indicator_raw_id') || jsonb_build_object('indicator_id', pg_temp.fastr_map_id(s ->> 'indicator_raw_id'))
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
LANGUAGE sql STABLE AS $f$
  SELECT p
    || CASE WHEN p ? 'failedFetches' THEN jsonb_build_object('failedFetches', pg_temp.fastr_rename_pairs(p -> 'failedFetches')) ELSE '{}'::jsonb END
    || CASE WHEN p ? 'periodIndicatorStats' THEN jsonb_build_object('periodIndicatorStats', pg_temp.fastr_rename_period_stats(p -> 'periodIndicatorStats')) ELSE '{}'::jsonb END
    || CASE WHEN p ? 'succeededWorkItems' THEN jsonb_build_object('succeededWorkItems', pg_temp.fastr_rename_pairs(p -> 'succeededWorkItems')) ELSE '{}'::jsonb END
    || CASE WHEN p ? 'pairFetchStats' THEN jsonb_build_object('pairFetchStats', pg_temp.fastr_rename_pair_stats(p -> 'pairFetchStats')) ELSE '{}'::jsonb END
$f$;

-- A list of raw ids → the distinct indicators they became, in order.
CREATE FUNCTION pg_temp.fastr_map_id_list(p jsonb) RETURNS jsonb
LANGUAGE sql STABLE AS $f$
  SELECT COALESCE((
    SELECT jsonb_agg(id ORDER BY first_ord)
    FROM (
      SELECT pg_temp.fastr_map_id(r.id) AS id, MIN(r.ord) AS first_ord
      FROM jsonb_array_elements_text(COALESCE(p, '[]'::jsonb)) WITH ORDINALITY AS r(id, ord)
      GROUP BY 1
    ) t
  ), '[]'::jsonb)
$f$;

-- A list of common ids in a deletion window → the indicators whose data
-- that deletion touched: what the raws mapped to each common became, or the
-- common itself when nothing was mapped to it.
CREATE FUNCTION pg_temp.fastr_map_common_list(p jsonb) RETURNS jsonb
LANGUAGE plpgsql STABLE AS $f$
DECLARE
  v_out jsonb := '[]'::jsonb;
  v_common text;
  v_mapped jsonb;
BEGIN
  IF p IS NULL OR jsonb_typeof(p) <> 'array' THEN
    RETURN '[]'::jsonb;
  END IF;
  FOR v_common IN SELECT id FROM jsonb_array_elements_text(p) AS r(id) LOOP
    SELECT COALESCE(jsonb_agg(DISTINCT m.indicator_id), '[]'::jsonb) INTO v_mapped
    FROM indicator_mappings im
    JOIN fastr_raw_to_indicator m ON m.raw_id = im.indicator_raw_id
    WHERE im.indicator_common_id = v_common;
    IF jsonb_array_length(v_mapped) = 0 THEN
      v_mapped := jsonb_build_array(v_common);
    END IF;
    v_out := v_out || v_mapped;
  END LOOP;
  RETURN (SELECT COALESCE(jsonb_agg(DISTINCT e), '[]'::jsonb) FROM jsonb_array_elements(v_out) AS t(e));
END $f$;

-- A windowed-delete staging result: the windowing it recorded moves to
-- indicator ids (ruling 9).
CREATE FUNCTION pg_temp.fastr_rewrite_deletion_staging(p jsonb) RETURNS jsonb
LANGUAGE plpgsql STABLE AS $f$
DECLARE
  v_w jsonb := p -> 'windowing';
BEGIN
  IF v_w IS NULL OR jsonb_typeof(v_w) <> 'object' THEN
    RETURN p;
  END IF;
  IF v_w ? 'rawIndicatorsToInclude' THEN
    v_w := (v_w - 'indicatorType' - 'rawIndicatorsToInclude' - 'commonIndicatorsToInclude' - 'grain' - 'sourcesToInclude')
      || jsonb_build_object('indicatorsToInclude', pg_temp.fastr_map_id_list(v_w -> 'rawIndicatorsToInclude'));
  ELSIF v_w ? 'commonIndicatorsToInclude' THEN
    v_w := (v_w - 'indicatorType' - 'rawIndicatorsToInclude' - 'commonIndicatorsToInclude' - 'grain' - 'sourcesToInclude')
      || jsonb_build_object('indicatorsToInclude', pg_temp.fastr_map_common_list(v_w -> 'commonIndicatorsToInclude'));
  ELSE
    v_w := v_w - 'indicatorType' - 'grain';
  END IF;
  RETURN jsonb_set(p, '{windowing}', v_w);
END $f$;

-- ── 1. The three columns, the widened CHECK, is_default gone ────────────────

ALTER TABLE indicators ADD COLUMN IF NOT EXISTS dhis2_id text UNIQUE;
ALTER TABLE indicators ADD COLUMN IF NOT EXISTS members text;
ALTER TABLE indicators ADD COLUMN IF NOT EXISTS include_in_analysis boolean NOT NULL DEFAULT TRUE;
ALTER TABLE indicators DROP COLUMN IF EXISTS is_default;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'indicators_definition_type_check'
      AND pg_get_constraintdef(oid) LIKE '%''sum''%'
  ) THEN
    ALTER TABLE indicators DROP CONSTRAINT IF EXISTS indicators_definition_type_check;
    ALTER TABLE indicators DROP CONSTRAINT IF EXISTS indicators_definition_fields_check;
    ALTER TABLE indicators ADD CONSTRAINT indicators_definition_type_check
      CHECK (definition_type IN ('base', 'sum', 'derived'));
    ALTER TABLE indicators ADD CONSTRAINT indicators_definition_fields_check CHECK (
      (definition_type = 'base' AND expression IS NULL AND members IS NULL)
      OR
      (definition_type = 'sum' AND members IS NOT NULL AND expression IS NULL AND dhis2_id IS NULL)
      OR
      (definition_type = 'derived' AND expression IS NOT NULL AND members IS NULL AND dhis2_id IS NULL)
    );
  END IF;
END $$;

-- ── 2. The data move ────────────────────────────────────────────────────────

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
  v_dhis2_shape text := '^[a-zA-Z][a-zA-Z0-9]{10}(\.[a-zA-Z][a-zA-Z0-9]{10})?$';
  v_taken text[];
  v_new_id text;
  v_n integer;
  r RECORD;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'indicators_raw'
  ) THEN
    RETURN;
  END IF;

  -- The old FKs to indicators_raw go first: the repoint below writes ids
  -- that table never held. The base schema never named them, so they are
  -- found through what they reference.
  FOR r IN
    SELECT c.conname, c.conrelid::regclass AS tbl
    FROM pg_constraint c
    WHERE c.contype = 'f'
      AND c.confrelid = 'public.indicators_raw'::regclass
      AND c.conrelid IN ('public.dataset_hmis'::regclass, 'public.dataset_hmis_import_ledger'::regclass)
  LOOP
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', r.tbl, r.conname);
  END LOOP;

  SELECT COALESCE(array_agg(indicator_common_id), ARRAY[]::text[]) INTO v_taken FROM indicators;

  -- Fold: a raw mapped to exactly one base common, which has no other
  -- mapping, and whose id is DHIS2-shaped. The common becomes a DHIS2
  -- element under its own id.
  FOR r IN
    SELECT im.indicator_raw_id, im.indicator_common_id, ir.indicator_raw_label
    FROM indicator_mappings im
    JOIN indicators_raw ir ON ir.indicator_raw_id = im.indicator_raw_id
    JOIN indicators i ON i.indicator_common_id = im.indicator_common_id
    WHERE i.definition_type = 'base'
      AND ir.indicator_raw_id ~ v_dhis2_shape
      AND (SELECT COUNT(*) FROM indicator_mappings x WHERE x.indicator_raw_id = im.indicator_raw_id) = 1
      AND (SELECT COUNT(*) FROM indicator_mappings x WHERE x.indicator_common_id = im.indicator_common_id) = 1
    ORDER BY im.indicator_raw_id
  LOOP
    UPDATE indicators
    SET dhis2_id = r.indicator_raw_id, updated_at = CURRENT_TIMESTAMP
    WHERE indicator_common_id = r.indicator_common_id;
    INSERT INTO fastr_raw_to_indicator (raw_id, indicator_id, raw_label, folded)
    VALUES (r.indicator_raw_id, r.indicator_common_id, r.indicator_raw_label, true);
  END LOOP;

  -- Every other raw becomes a base of its own, checkbox off.
  FOR r IN
    SELECT ir.indicator_raw_id, ir.indicator_raw_label
    FROM indicators_raw ir
    WHERE NOT EXISTS (SELECT 1 FROM fastr_raw_to_indicator m WHERE m.raw_id = ir.indicator_raw_id)
    ORDER BY ir.indicator_raw_id
  LOOP
    IF r.indicator_raw_id ~ v_dhis2_shape THEN
      v_new_id := pg_temp.fastr_generate_indicator_id(
        r.indicator_raw_label, r.indicator_raw_id, v_taken || v_reserved);
    ELSIF pg_temp.fastr_id_charset_ok(r.indicator_raw_id)
      AND NOT (r.indicator_raw_id = ANY (v_taken))
      AND (NOT (r.indicator_raw_id = ANY (v_reserved)) OR r.indicator_raw_id = ANY (v_special))
    THEN
      v_new_id := r.indicator_raw_id;
    ELSE
      v_new_id := pg_temp.fastr_generate_indicator_id(
        r.indicator_raw_label, r.indicator_raw_id, v_taken || v_reserved);
    END IF;
    v_taken := v_taken || v_new_id;
    INSERT INTO indicators (
      indicator_common_id, indicator_common_label, definition_type, expression,
      dhis2_id, members, include_in_analysis,
      format_as, thresholds, sort_order, updated_at
    )
    SELECT v_new_id, r.indicator_raw_label, 'base', NULL,
           CASE WHEN r.indicator_raw_id ~ v_dhis2_shape THEN r.indicator_raw_id END, NULL, FALSE,
           'number', NULL, COALESCE(MAX(sort_order), 0) + 1, CURRENT_TIMESTAMP
    FROM indicators;
    INSERT INTO fastr_raw_to_indicator (raw_id, indicator_id, raw_label, folded)
    VALUES (r.indicator_raw_id, v_new_id, r.indicator_raw_label, false);
  END LOOP;

  -- A base common whose raws did not fold becomes a sum over the bases they
  -- became. (A folded common carries a dhis2_id and is excluded; a mapping
  -- onto a derived contributed nothing to the old extract and is dropped
  -- with the table, its raw now a base of its own.)
  FOR r IN
    SELECT i.indicator_common_id,
           jsonb_agg(DISTINCT m.indicator_id) AS members
    FROM indicators i
    JOIN indicator_mappings im ON im.indicator_common_id = i.indicator_common_id
    JOIN fastr_raw_to_indicator m ON m.raw_id = im.indicator_raw_id
    WHERE i.definition_type = 'base' AND i.dhis2_id IS NULL
    GROUP BY i.indicator_common_id
  LOOP
    UPDATE indicators
    SET definition_type = 'sum', members = r.members::text, updated_at = CURRENT_TIMESTAMP
    WHERE indicator_common_id = r.indicator_common_id;
  END LOOP;

  -- A derived row under a special id: renamed to the suffix form, every
  -- expression naming it rewritten, and an empty base inserted under the
  -- special id, so no special is ever derived.
  FOR r IN
    SELECT indicator_common_id, indicator_common_label
    FROM indicators
    WHERE definition_type = 'derived' AND indicator_common_id = ANY (v_special)
    ORDER BY indicator_common_id
  LOOP
    v_n := 2;
    LOOP
      v_new_id := r.indicator_common_id || '_' || v_n;
      EXIT WHEN NOT (v_new_id = ANY (v_taken || v_reserved));
      v_n := v_n + 1;
    END LOOP;
    v_taken := v_taken || v_new_id;
    DELETE FROM indicator_mappings WHERE indicator_common_id = r.indicator_common_id;
    UPDATE indicators
    SET indicator_common_id = v_new_id, updated_at = CURRENT_TIMESTAMP
    WHERE indicator_common_id = r.indicator_common_id;
    UPDATE indicators
    SET expression = pg_temp.fastr_rename_identifier(expression, r.indicator_common_id, v_new_id),
        updated_at = CURRENT_TIMESTAMP
    WHERE definition_type = 'derived'
      AND expression IS NOT NULL
      AND expression <> pg_temp.fastr_rename_identifier(expression, r.indicator_common_id, v_new_id);
    INSERT INTO indicators (
      indicator_common_id, indicator_common_label, definition_type, expression,
      dhis2_id, members, include_in_analysis,
      format_as, thresholds, sort_order, updated_at
    )
    SELECT r.indicator_common_id, r.indicator_common_label, 'base', NULL,
           NULL, NULL, TRUE,
           'number', NULL, COALESCE(MAX(sort_order), 0) + 1, CURRENT_TIMESTAMP
    FROM indicators;
    RAISE NOTICE '[086] derived special % renamed %, empty base % inserted', r.indicator_common_id, v_new_id, r.indicator_common_id;
  END LOOP;

  -- Data and ledger rows move to the indicator their raw became.
  UPDATE dataset_hmis d
  SET indicator_raw_id = m.indicator_id
  FROM fastr_raw_to_indicator m
  WHERE d.indicator_raw_id = m.raw_id AND m.indicator_id <> m.raw_id;

  UPDATE dataset_hmis_import_ledger l
  SET indicator_raw_id = m.indicator_id
  FROM fastr_raw_to_indicator m
  WHERE l.indicator_raw_id = m.raw_id AND m.indicator_id <> m.raw_id;
END $$;

-- ── 3. Column renames (O(1): the primary key and the indexes follow) ────────

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'dataset_hmis' AND column_name = 'indicator_raw_id'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'dataset_hmis' AND column_name = 'indicator_id'
  ) THEN
    ALTER TABLE dataset_hmis RENAME COLUMN indicator_raw_id TO indicator_id;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'dataset_hmis_import_ledger' AND column_name = 'indicator_raw_id'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'dataset_hmis_import_ledger' AND column_name = 'indicator_id'
  ) THEN
    ALTER TABLE dataset_hmis_import_ledger RENAME COLUMN indicator_raw_id TO indicator_id;
  END IF;
END $$;

-- ── 4. Foreign keys under their _main_database.sql names ────────────────────

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'dataset_hmis_indicator_id_fkey') THEN
    ALTER TABLE dataset_hmis
      ADD CONSTRAINT dataset_hmis_indicator_id_fkey
      FOREIGN KEY (indicator_id) REFERENCES indicators(indicator_common_id) ON DELETE RESTRICT DEFERRABLE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'dataset_hmis_import_ledger_indicator_id_fkey') THEN
    ALTER TABLE dataset_hmis_import_ledger
      ADD CONSTRAINT dataset_hmis_import_ledger_indicator_id_fkey
      FOREIGN KEY (indicator_id) REFERENCES indicators(indicator_common_id) ON DELETE CASCADE;
  END IF;
END $$;

-- ── 5. Stored JSON (rulings 5 and 9) ────────────────────────────────────────

-- Run selections: a window selected raw ids; those are now the indicators
-- they became, with the fetched elements persisted beside them.
UPDATE dataset_hmis_import_runs
SET selection = (
  (selection::jsonb - 'rawIndicatorIds')
  || jsonb_build_object(
       'indicatorIds', pg_temp.fastr_map_id_list(selection::jsonb -> 'rawIndicatorIds'),
       'elements', COALESCE((
         SELECT jsonb_agg(jsonb_build_object('indicatorId', pg_temp.fastr_map_id(r.id), 'dhis2Id', r.id) ORDER BY r.ord)
         FROM jsonb_array_elements_text(selection::jsonb -> 'rawIndicatorIds') WITH ORDINALITY AS r(id, ord)
       ), '[]'::jsonb),
       'populationTermsDropped', '[]'::jsonb,
       'uploadedIndicatorsDropped', '[]'::jsonb)
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
-- fields, and dhis2IndicatorIds backfilled.
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
  || jsonb_build_object('indicator_id', csv_config::jsonb -> 'mappings' -> 'raw_indicator_id'))::text
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

-- Schedules: the raw ids become the ids of the indicators they became.
UPDATE dataset_hmis_scheduled_imports
SET selection = (
  (selection::jsonb - 'rawIndicatorIds')
  || jsonb_build_object('indicatorIds', pg_temp.fastr_map_id_list(selection::jsonb -> 'rawIndicatorIds'))
)::text
WHERE selection IS NOT NULL AND selection::jsonb ? 'rawIndicatorIds';

-- ── 6. The id table, for the team that owned these elements ─────────────────
-- The app's migration runner suppresses notices; ./validate_indicator_migration
-- prints them.

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT raw_id, raw_label, indicator_id, folded FROM fastr_raw_to_indicator ORDER BY raw_id LOOP
    RAISE NOTICE '[086] % (%) -> % %', r.raw_id, r.raw_label, r.indicator_id,
      CASE WHEN r.folded THEN 'folded into the existing indicator' ELSE 'new base' END;
  END LOOP;
END $$;

-- ── 7. The old tables ───────────────────────────────────────────────────────

DROP TABLE IF EXISTS indicator_mappings;
DROP TABLE IF EXISTS indicators_raw;

DROP FUNCTION IF EXISTS pg_temp.fastr_rewrite_deletion_staging(jsonb);
DROP FUNCTION IF EXISTS pg_temp.fastr_map_common_list(jsonb);
DROP FUNCTION IF EXISTS pg_temp.fastr_map_id_list(jsonb);
DROP FUNCTION IF EXISTS pg_temp.fastr_rewrite_dhis2_staging(jsonb);
DROP FUNCTION IF EXISTS pg_temp.fastr_rewrite_csv_staging(jsonb);
DROP FUNCTION IF EXISTS pg_temp.fastr_rename_period_stats(jsonb);
DROP FUNCTION IF EXISTS pg_temp.fastr_rename_pair_stats(jsonb);
DROP FUNCTION IF EXISTS pg_temp.fastr_rename_pairs(jsonb);
DROP FUNCTION IF EXISTS pg_temp.fastr_map_id(text);
DROP TABLE IF EXISTS fastr_raw_to_indicator;
DROP FUNCTION IF EXISTS pg_temp.fastr_rename_identifier(text, text, text);
DROP FUNCTION IF EXISTS pg_temp.fastr_id_charset_ok(text);
DROP FUNCTION IF EXISTS pg_temp.fastr_generate_indicator_id(text, text, text[]);
DROP FUNCTION IF EXISTS pg_temp.fastr_slug_indicator_id(text);
