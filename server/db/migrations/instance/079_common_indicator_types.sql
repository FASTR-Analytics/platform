-- ============================================================================
-- Typed common indicators (PLAN_1a §1.12, PLAN_1c) — calculated_indicators
-- folds INTO indicators.
--
-- A common indicator now carries what it IS (base / derived) plus how it is
-- presented. `expression` holds a derived indicator's formula, which may
-- divide by a population term written `[population:<type>]` — a type in the
-- population_types vocabulary migration 080 creates and seeds. The text
-- merely names the type; the app resolves it at save and at capture, so this
-- migration does not touch the store and needs no FK.
--
-- The one-pass data move classifies every calculated_indicators row:
--   identity alias   (denom none, num = own id)  → presentation fields land on
--                                                  the base common; row dropped
--   ratio on its own numerator's id              → derived, id suffixed _rate
--   alias of another common (denom none)         → single-ingredient derived
--   indicator denominator                        → derived, num / denom
--   population denominator                       → derived,
--                                                  (num) / ([population:p] * f)
--   anything else that collides                  → RAISE, with the listing
--
-- The population branch is m008-faithful (PLAN_1c ruling 4): m008 computed
-- denominator = population × fraction × 1/12, and the 1/12 is exactly the
-- person-years expansion the run performs, so dividing the numerator by the
-- person-years term scaled by the fraction yields the ratio m008 produced.
-- `format_as` carries across unchanged — it is display-only — except onto a
-- base common, which is a count and stays `number` (the app refuses any
-- other format for a base; copying `percent` made the row un-editable).
--
-- Thresholds (PLAN_1d ruling 12): the catalog's traffic-light pair
-- (direction + green + yellow, in DISPLAY units) becomes the indicator's
-- conditional-formatting rule — JSON text `{cutoffs, buckets, direction}`
-- (every JSON column in this schema is text, parsed by the app) with
-- cutoffs in STORED units (divided by the row's own format: 100 for percent,
-- 10,000 for rate_per_10k) and the three bucket colours + labels the
-- scorecard printed, in the instance language (transaction-local GUC
-- `fastr.instance_language`, set by the migration runner; absent under
-- ./validate_migrations, so it defaults to English):
--   higher_is_better {green, yellow} → cutoffs [yellow, green],
--                                       buckets [red, yellow, green]
--   lower_is_better  {green, yellow} → cutoffs [green, yellow],
--                                       buckets [green, yellow, red]
-- Nothing ever enforced yellow < green, so a degenerate pair (equal or
-- inverted) becomes a TWO-bucket rule at the green cutoff — the yellow band
-- was unreachable for such a row, so this is the faithful conversion. The
-- same conversion in TypeScript (lib/traffic_light_rule.ts) serves legacy
-- packages and stored figure snapshots; the two must agree.
--
-- sort_order backfill (the authority for the rule is
-- backfillCommonIndicatorSortOrder in lib/table_structures/indicators.ts,
-- which applies the same ordering to a legacy package's input mirrors): the
-- seeded commons keep their seed order, remaining base commons follow
-- alphabetically, and the migrated rows keep their catalog order at the end.
-- ============================================================================

-- ── Id charset guard ────────────────────────────────────────────────────────
-- The expression grammar's [quoted identifier] form has no escape (PLAN_1a
-- §1.3), so an id carrying a square bracket could be written into an
-- expression this migration composes below but never parsed back. New ids are
-- rejected at authoring (getNewIndicatorIdIssue); stored ids are guarded here.
-- Verified clean across the fleet 2026-09-01 — this RAISE is the fail-stop
-- for an instance that check did not see.

DO $$
DECLARE
  v_bad TEXT[];
BEGIN
  SELECT COALESCE(array_agg(bad ORDER BY bad), ARRAY[]::TEXT[]) INTO v_bad
  FROM (
    SELECT 'indicators.' || indicator_common_id AS bad
    FROM indicators WHERE indicator_common_id ~ '[\[\]]'
    UNION ALL
    SELECT 'indicators_raw.' || indicator_raw_id
    FROM indicators_raw WHERE indicator_raw_id ~ '[\[\]]'
  ) t;

  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'calculated_indicators'
  ) THEN
    v_bad := v_bad || COALESCE(
      (SELECT array_agg('calculated_indicators.' || calculated_indicator_id
                        ORDER BY calculated_indicator_id)
       FROM calculated_indicators WHERE calculated_indicator_id ~ '[\[\]]'),
      ARRAY[]::TEXT[]
    );
  END IF;

  IF array_length(v_bad, 1) > 0 THEN
    RAISE EXCEPTION
      'Indicator ids may not contain square brackets (the expression grammar''s quoted-identifier form has no escape). Rename: %',
      array_to_string(v_bad, '; ');
  END IF;
END $$;

ALTER TABLE indicators
  ADD COLUMN IF NOT EXISTS definition_type TEXT NOT NULL DEFAULT 'base',
  ADD COLUMN IF NOT EXISTS expression TEXT,
  ADD COLUMN IF NOT EXISTS format_as TEXT NOT NULL DEFAULT 'number',
  ADD COLUMN IF NOT EXISTS thresholds TEXT,
  ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'indicators_definition_type_check'
  ) THEN
    ALTER TABLE indicators ADD CONSTRAINT indicators_definition_type_check
      CHECK (definition_type IN ('base', 'derived'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'indicators_definition_fields_check'
  ) THEN
    ALTER TABLE indicators ADD CONSTRAINT indicators_definition_fields_check CHECK (
      (definition_type = 'base' AND expression IS NULL)
      OR
      (definition_type = 'derived' AND expression IS NOT NULL)
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'indicators_format_as_check'
  ) THEN
    ALTER TABLE indicators ADD CONSTRAINT indicators_format_as_check
      CHECK (format_as IN ('percent', 'number', 'rate_per_10k'));
  END IF;

END $$;

-- ── The one-pass data move ──────────────────────────────────────────────────

DO $$
DECLARE
  ci RECORD;
  v_new_id TEXT;
  v_num TEXT;
  v_den TEXT;
  v_fraction TEXT;
  v_collisions TEXT[] := ARRAY[]::TEXT[];
  v_bad_population TEXT[] := ARRAY[]::TEXT[];
  v_lang TEXT;
  v_red JSON;
  v_yellow JSON;
  v_green JSON;
  v_green_at NUMERIC;
  v_yellow_at NUMERIC;
  v_rule JSON;
  v_thresholds TEXT;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'calculated_indicators'
  ) THEN
    RETURN;
  END IF;

  v_lang := COALESCE(current_setting('fastr.instance_language', true), 'en');
  -- Colours = _CF_LIGHTER_RED / _CF_LIGHTER_YELLOW / _CF_LIGHTER_GREEN
  -- (lib/key_colors.ts); labels = what the scorecard legend printed.
  v_red := json_build_object('color', '#F7BCBC', 'label',
    CASE v_lang WHEN 'fr' THEN 'Pas en bonne voie'
                WHEN 'pt' THEN 'Fora do bom caminho'
                ELSE 'Not on track' END);
  v_yellow := json_build_object('color', '#FAE9B7', 'label',
    CASE v_lang WHEN 'fr' THEN 'Progrès nécessaire'
                WHEN 'pt' THEN 'Progresso necessário'
                ELSE 'Progress needed' END);
  v_green := json_build_object('color', '#A9DFBF', 'label',
    CASE v_lang WHEN 'fr' THEN 'En bonne voie'
                WHEN 'pt' THEN 'No bom caminho'
                ELSE 'On track' END);

  FOR ci IN
    SELECT * FROM calculated_indicators ORDER BY sort_order, calculated_indicator_id
  LOOP
    -- The row's rule, from its traffic-light pair (header). REAL goes through
    -- its shortest round-trip text into an exact numeric before the divide.
    IF ci.threshold_direction IS NULL THEN
      v_thresholds := NULL;
    ELSE
      v_green_at := (ci.threshold_green::TEXT)::NUMERIC
        / CASE ci.format_as WHEN 'percent' THEN 100
                            WHEN 'rate_per_10k' THEN 10000
                            ELSE 1 END;
      v_yellow_at := (ci.threshold_yellow::TEXT)::NUMERIC
        / CASE ci.format_as WHEN 'percent' THEN 100
                            WHEN 'rate_per_10k' THEN 10000
                            ELSE 1 END;
      IF ci.threshold_direction = 'higher_is_better' THEN
        IF v_yellow_at < v_green_at THEN
          v_rule := json_build_object(
            'cutoffs', json_build_array(v_yellow_at::FLOAT8, v_green_at::FLOAT8),
            'buckets', json_build_array(v_red, v_yellow, v_green),
            'direction', 'higher-is-better');
        ELSE
          v_rule := json_build_object(
            'cutoffs', json_build_array(v_green_at::FLOAT8),
            'buckets', json_build_array(v_red, v_green),
            'direction', 'higher-is-better');
        END IF;
      ELSE
        IF v_green_at < v_yellow_at THEN
          v_rule := json_build_object(
            'cutoffs', json_build_array(v_green_at::FLOAT8, v_yellow_at::FLOAT8),
            'buckets', json_build_array(v_green, v_yellow, v_red),
            'direction', 'lower-is-better');
        ELSE
          v_rule := json_build_object(
            'cutoffs', json_build_array(v_green_at::FLOAT8),
            'buckets', json_build_array(v_green, v_red),
            'direction', 'lower-is-better');
        END IF;
      END IF;
      v_thresholds := v_rule::TEXT;
    END IF;
    -- Identifiers are written bare when the grammar allows it, [bracketed]
    -- otherwise — including the reserved function names, which would re-parse
    -- as "must be called" if written bare (writeIdentifier,
    -- lib/indicator_expression/parse.ts, which this mirrors exactly).
    v_num := CASE
      WHEN ci.num_indicator_id ~ '^[a-z][a-z0-9_]*$'
        AND ci.num_indicator_id NOT IN ('abs', 'coalesce', 'nullif')
        THEN ci.num_indicator_id
      ELSE '[' || ci.num_indicator_id || ']'
    END;

    IF ci.denom_kind = 'none' AND ci.num_indicator_id = ci.calculated_indicator_id THEN
      -- Identity alias: the catalog row said nothing the base common cannot
      -- say itself. Its rule moves across (in the units m008 displayed it
      -- in, i.e. divided by ci.format_as); the row goes. The LABEL
      -- deliberately does not move — a common indicator's label is what every
      -- other module's charts already show — and neither does the format: a
      -- base common is a count.
      UPDATE indicators SET
        thresholds = v_thresholds,
        updated_at = CURRENT_TIMESTAMP
      WHERE indicator_common_id = ci.calculated_indicator_id;
      RAISE NOTICE '[079] identity alias folded into base common: %',
        ci.calculated_indicator_id;
      CONTINUE;
    END IF;

    IF ci.num_indicator_id = ci.calculated_indicator_id THEN
      -- A ratio that reused its own numerator's id. Both must survive, so the
      -- ratio takes a new one.
      v_new_id := ci.calculated_indicator_id || '_rate';
      RAISE NOTICE '[079] ratio on its own numerator renamed: % → %',
        ci.calculated_indicator_id, v_new_id;
    ELSE
      v_new_id := ci.calculated_indicator_id;
    END IF;

    IF EXISTS (SELECT 1 FROM indicators WHERE indicator_common_id = v_new_id) THEN
      v_collisions := v_collisions ||
        format('%s (would become %s, which already exists)',
               ci.calculated_indicator_id, v_new_id);
      CONTINUE;
    END IF;

    IF ci.denom_kind = 'none' THEN
      INSERT INTO indicators (
        indicator_common_id, indicator_common_label, is_default,
        definition_type, expression,
        format_as, thresholds, sort_order, updated_at
      ) VALUES (
        v_new_id, ci.label, FALSE,
        'derived', v_num,
        ci.format_as, v_thresholds, ci.sort_order, CURRENT_TIMESTAMP
      );
      RAISE NOTICE '[079] alias of another common became a derived indicator: %', v_new_id;
    ELSIF ci.denom_kind = 'indicator' THEN
      v_den := CASE
        WHEN ci.denom_indicator_id ~ '^[a-z][a-z0-9_]*$'
          AND ci.denom_indicator_id NOT IN ('abs', 'coalesce', 'nullif')
          THEN ci.denom_indicator_id
        ELSE '[' || ci.denom_indicator_id || ']'
      END;
      INSERT INTO indicators (
        indicator_common_id, indicator_common_label, is_default,
        definition_type, expression,
        format_as, thresholds, sort_order, updated_at
      ) VALUES (
        v_new_id, ci.label, FALSE,
        'derived', '(' || v_num || ' / ' || v_den || ')',
        ci.format_as, v_thresholds, ci.sort_order, CURRENT_TIMESTAMP
      );
    ELSE
      IF ci.denom_population_type IS NULL
         OR ci.denom_population_multiplier IS NULL
         OR ci.denom_population_multiplier <= 0 THEN
        v_bad_population := v_bad_population ||
          format('%s (population type %s, multiplier %s)',
                 ci.calculated_indicator_id,
                 COALESCE(ci.denom_population_type, 'NULL'),
                 COALESCE(ci.denom_population_multiplier::TEXT, 'NULL'));
        CONTINUE;
      END IF;
      -- The fraction as a plain decimal literal: the expression grammar reads
      -- [0-9]+(\.[0-9]+)? only, never an exponent. The column is REAL, so it
      -- goes through its shortest round-trip text (0.04, not
      -- 0.039999999105930328) into an exact numeric before formatting; FM
      -- keeps the digits and leaves a bare trailing '.' for a whole number —
      -- trailing zeros go first, then that '.'. A fraction too small to
      -- survive ten decimals would format to '0' and is refused below.
      v_fraction := regexp_replace(
        regexp_replace(
          to_char((ci.denom_population_multiplier::TEXT)::NUMERIC,
                  'FM999999990.9999999999'),
          '0+$', ''),
        '\.$', '');
      IF v_fraction = '' OR v_fraction = '0' THEN
        v_bad_population := v_bad_population ||
          format('%s (multiplier %s is too small to write as a decimal literal)',
                 ci.calculated_indicator_id, ci.denom_population_multiplier);
        CONTINUE;
      END IF;
      INSERT INTO indicators (
        indicator_common_id, indicator_common_label, is_default,
        definition_type, expression,
        format_as, thresholds, sort_order, updated_at
      ) VALUES (
        v_new_id, ci.label, FALSE,
        'derived',
        '(' || v_num || ') / '
          || CASE WHEN ci.denom_population_multiplier = 1
               THEN '[population:' || ci.denom_population_type || ']'
               ELSE '([population:' || ci.denom_population_type || '] * '
                    || v_fraction || ')'
             END,
        ci.format_as, v_thresholds, ci.sort_order, CURRENT_TIMESTAMP
      );
    END IF;
  END LOOP;

  IF array_length(v_collisions, 1) > 0 THEN
    RAISE EXCEPTION
      'Cannot fold calculated indicators into the common dictionary — id collisions: %',
      array_to_string(v_collisions, '; ');
  END IF;

  IF array_length(v_bad_population, 1) > 0 THEN
    RAISE EXCEPTION
      'Cannot fold population-denominated calculated indicators — the population type or multiplier is missing or not positive: %',
      array_to_string(v_bad_population, '; ');
  END IF;
END $$;

-- ── sort_order backfill ─────────────────────────────────────────────────────
-- The seed list, in seed order, as of this migration. It is the historical
-- fact the ordering is anchored to, so it is spelled out here rather than
-- read from code that is free to change afterwards.

WITH seed(id, pos) AS (
  VALUES
    ('new_fp', 1), ('anc1', 2), ('anc4', 3), ('delivery', 4), ('sba', 5),
    ('pnc1_newborn', 6), ('pnc1_mother', 7), ('bcg', 8), ('penta1', 9),
    ('penta3', 10), ('measles1', 11), ('measles2', 12), ('opd', 13), ('ipd', 14)
),
ranked AS (
  SELECT
    i.indicator_common_id,
    ROW_NUMBER() OVER (
      ORDER BY
        CASE WHEN i.definition_type = 'base' THEN 0 ELSE 1 END,
        CASE WHEN i.definition_type = 'base' THEN COALESCE(seed.pos, 999999) ELSE i.sort_order END,
        i.indicator_common_id
    ) AS rn
  FROM indicators i
  LEFT JOIN seed ON seed.id = i.indicator_common_id
)
UPDATE indicators
SET sort_order = ranked.rn
FROM ranked
WHERE indicators.indicator_common_id = ranked.indicator_common_id
  AND indicators.sort_order IS DISTINCT FROM ranked.rn;

DROP TABLE IF EXISTS calculated_indicators;
