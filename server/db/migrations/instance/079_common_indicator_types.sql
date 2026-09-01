-- ============================================================================
-- Typed common indicators (PLAN_1a §1.12) — calculated_indicators folds INTO
-- indicators, and the three dictionaries become three.
--
-- A common indicator now carries what it IS (base / derived / population_rate)
-- plus how it is presented. `expression` holds a derived indicator's formula
-- and a population rate's NUMERATOR expression; which of the population
-- columns must be set is decided by definition_type, exactly as the retired
-- calculated_indicators table decided its denom_* columns by denom_kind.
--
-- The one-pass data move classifies every calculated_indicators row:
--   identity alias   (denom none, num = own id)  → presentation fields land on
--                                                  the base common; row dropped
--   ratio on its own numerator's id              → derived, id suffixed _rate
--   alias of another common (denom none)         → single-ingredient derived
--   indicator denominator                        → derived, num / denom
--   population denominator                       → population_rate
--   anything else that collides                  → RAISE, with the listing
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
  ADD COLUMN IF NOT EXISTS population_type TEXT,
  ADD COLUMN IF NOT EXISTS population_multiplier REAL,
  ADD COLUMN IF NOT EXISTS format_as TEXT NOT NULL DEFAULT 'number',
  ADD COLUMN IF NOT EXISTS threshold_direction TEXT,
  ADD COLUMN IF NOT EXISTS threshold_green REAL,
  ADD COLUMN IF NOT EXISTS threshold_yellow REAL,
  ADD COLUMN IF NOT EXISTS group_label TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'indicators_definition_type_check'
  ) THEN
    ALTER TABLE indicators ADD CONSTRAINT indicators_definition_type_check
      CHECK (definition_type IN ('base', 'derived', 'population_rate'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'indicators_definition_fields_check'
  ) THEN
    ALTER TABLE indicators ADD CONSTRAINT indicators_definition_fields_check CHECK (
      (definition_type = 'base'
         AND expression IS NULL
         AND population_type IS NULL
         AND population_multiplier IS NULL)
      OR
      (definition_type = 'derived'
         AND expression IS NOT NULL
         AND population_type IS NULL
         AND population_multiplier IS NULL)
      OR
      (definition_type = 'population_rate'
         AND expression IS NOT NULL
         AND population_type IS NOT NULL
         AND population_multiplier IS NOT NULL)
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'indicators_format_as_check'
  ) THEN
    ALTER TABLE indicators ADD CONSTRAINT indicators_format_as_check
      CHECK (format_as IN ('percent', 'number', 'rate_per_10k'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'indicators_threshold_fields_check'
  ) THEN
    ALTER TABLE indicators ADD CONSTRAINT indicators_threshold_fields_check CHECK (
      (threshold_direction IS NULL
         AND threshold_green IS NULL
         AND threshold_yellow IS NULL)
      OR
      (threshold_direction IN ('higher_is_better', 'lower_is_better')
         AND threshold_green IS NOT NULL
         AND threshold_yellow IS NOT NULL)
    );
  END IF;
END $$;

-- ── The one-pass data move ──────────────────────────────────────────────────

DO $$
DECLARE
  ci RECORD;
  v_new_id TEXT;
  v_num TEXT;
  v_den TEXT;
  v_collisions TEXT[] := ARRAY[]::TEXT[];
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'calculated_indicators'
  ) THEN
    RETURN;
  END IF;

  FOR ci IN
    SELECT * FROM calculated_indicators ORDER BY sort_order, calculated_indicator_id
  LOOP
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
      -- say itself. Its presentation moves across; the row goes. The LABEL
      -- deliberately does not move — a common indicator's label is what every
      -- other module's charts already show.
      UPDATE indicators SET
        format_as = ci.format_as,
        threshold_direction = ci.threshold_direction,
        threshold_green = ci.threshold_green,
        threshold_yellow = ci.threshold_yellow,
        group_label = ci.group_label,
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
        format_as, threshold_direction, threshold_green, threshold_yellow,
        group_label, sort_order, updated_at
      ) VALUES (
        v_new_id, ci.label, FALSE,
        'derived', v_num,
        ci.format_as, ci.threshold_direction, ci.threshold_green, ci.threshold_yellow,
        ci.group_label, ci.sort_order, CURRENT_TIMESTAMP
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
        format_as, threshold_direction, threshold_green, threshold_yellow,
        group_label, sort_order, updated_at
      ) VALUES (
        v_new_id, ci.label, FALSE,
        'derived', '(' || v_num || ' / ' || v_den || ')',
        ci.format_as, ci.threshold_direction, ci.threshold_green, ci.threshold_yellow,
        ci.group_label, ci.sort_order, CURRENT_TIMESTAMP
      );
    ELSE
      INSERT INTO indicators (
        indicator_common_id, indicator_common_label, is_default,
        definition_type, expression, population_type, population_multiplier,
        format_as, threshold_direction, threshold_green, threshold_yellow,
        group_label, sort_order, updated_at
      ) VALUES (
        v_new_id, ci.label, FALSE,
        'population_rate', v_num,
        ci.denom_population_type, ci.denom_population_multiplier,
        ci.format_as, ci.threshold_direction, ci.threshold_green, ci.threshold_yellow,
        ci.group_label, ci.sort_order, CURRENT_TIMESTAMP
      );
    END IF;
  END LOOP;

  IF array_length(v_collisions, 1) > 0 THEN
    RAISE EXCEPTION
      'Cannot fold calculated indicators into the common dictionary — id collisions: %',
      array_to_string(v_collisions, '; ');
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
