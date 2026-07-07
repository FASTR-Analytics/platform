-- HFA sentinel Layer 1: classify each (question, code) pair at import.
-- sentinel_class is '' for a substantive answer, else one of
-- dont_know | refused | other | not_applicable | question_specific.
-- Existing rows stay '' until the dataset is re-imported; Layer 3's generator
-- must fall back to the hardcoded sentinel set for any variable that has no
-- classified rows.
ALTER TABLE hfa_variable_values
  ADD COLUMN IF NOT EXISTS sentinel_class TEXT NOT NULL DEFAULT '';
