-- Mirror the instance change (053): the HFA indicator snapshot carries the full
-- set of service-category ids as a JSON-encoded TEXT list instead of a single FK.
ALTER TABLE hfa_indicators_snapshot
  ADD COLUMN IF NOT EXISTS service_category_ids TEXT NOT NULL DEFAULT '[]';

UPDATE hfa_indicators_snapshot
SET service_category_ids =
  CASE
    WHEN service_category_id IS NOT NULL AND service_category_id != ''
      THEN json_build_array(service_category_id)::text
    ELSE '[]'
  END
WHERE service_category_id IS NOT NULL;

ALTER TABLE hfa_indicators_snapshot DROP COLUMN IF EXISTS service_category_id;
