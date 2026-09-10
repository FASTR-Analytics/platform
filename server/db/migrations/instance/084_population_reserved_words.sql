-- Population types are reserved bare identifiers (PLAN_A2). A formula names
-- a population by the type's id (`anc1 / population_total`) instead of the
-- bracketed pseudo-id `[population:<type>]`, so the type ids are renamed to
-- carry the `population_` prefix and become reserved words, with the
-- expression function names. No common indicator may take one: the guard
-- below is what makes the rename safe on an instance the 2026-09-10 fleet
-- sweep did not see.

DO $$
DECLARE
  v_reserved TEXT[] := ARRAY[
    'population_total', 'population_u5', 'population_u1', 'population_wra',
    'population_births', 'population_pregnancies',
    'abs', 'coalesce', 'nullif'
  ];
  v_bad TEXT[];
BEGIN
  SELECT COALESCE(array_agg(indicator_common_id ORDER BY indicator_common_id), ARRAY[]::TEXT[])
  INTO v_bad
  FROM indicators
  WHERE indicator_common_id = ANY (v_reserved);

  IF array_length(v_bad, 1) > 0 THEN
    RAISE EXCEPTION
      'Common indicator ids may not be reserved words (population type ids and expression function names). Rename: %',
      array_to_string(v_bad, '; ');
  END IF;
END $$;

-- The store rows carry the type id as text.
UPDATE population SET population_type = 'population_total' WHERE population_type = 'total_population';
UPDATE population SET population_type = 'population_u5' WHERE population_type = 'u5';
UPDATE population SET population_type = 'population_u1' WHERE population_type = 'u1';
UPDATE population SET population_type = 'population_wra' WHERE population_type = 'wra';
UPDATE population SET population_type = 'population_births' WHERE population_type = 'births';
UPDATE population SET population_type = 'population_pregnancies' WHERE population_type = 'pregnancies';

-- Stored expressions: the tokenizer never trims bracket contents, so the
-- exact bracketed form is the only one a stored expression can carry.
UPDATE indicators SET expression = replace(expression, '[population:total_population]', 'population_total')
  WHERE expression LIKE '%[population:total_population]%';
UPDATE indicators SET expression = replace(expression, '[population:u5]', 'population_u5')
  WHERE expression LIKE '%[population:u5]%';
UPDATE indicators SET expression = replace(expression, '[population:u1]', 'population_u1')
  WHERE expression LIKE '%[population:u1]%';
UPDATE indicators SET expression = replace(expression, '[population:wra]', 'population_wra')
  WHERE expression LIKE '%[population:wra]%';
UPDATE indicators SET expression = replace(expression, '[population:births]', 'population_births')
  WHERE expression LIKE '%[population:births]%';
UPDATE indicators SET expression = replace(expression, '[population:pregnancies]', 'population_pregnancies')
  WHERE expression LIKE '%[population:pregnancies]%';

-- A store write: the client type-store cache and the SSE summary key on it.
INSERT INTO instance_config (config_key, config_json_value)
SELECT 'population_last_updated', to_json(to_char(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))::text
WHERE EXISTS (SELECT 1 FROM population)
ON CONFLICT (config_key)
DO UPDATE SET config_json_value = EXCLUDED.config_json_value;
