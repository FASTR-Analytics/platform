-- HFA indicators can now belong to multiple service categories. Replace the
-- single FK with a JSON-encoded list of category ids stored as TEXT (the app's
-- convention for list columns). No FK on the list — referential cleanup is
-- handled in code (see deleteHfaIndicatorServiceCategory / update...).
ALTER TABLE hfa_indicators
  ADD COLUMN IF NOT EXISTS service_category_ids TEXT NOT NULL DEFAULT '[]';

UPDATE hfa_indicators
SET service_category_ids =
  CASE
    WHEN service_category_id IS NOT NULL AND service_category_id != ''
      THEN json_build_array(service_category_id)::text
    ELSE '[]'
  END
WHERE service_category_id IS NOT NULL;

ALTER TABLE hfa_indicators DROP COLUMN IF EXISTS service_category_id;
