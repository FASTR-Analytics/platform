-- The validation flags were advisory and went stale: every surface computes an
-- indicator's status from its code at render.
ALTER TABLE hfa_indicators DROP COLUMN IF EXISTS has_syntax_error;
ALTER TABLE hfa_indicators DROP COLUMN IF EXISTS code_consistent;
