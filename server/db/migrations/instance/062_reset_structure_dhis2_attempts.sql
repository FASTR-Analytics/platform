-- PLAN_DHIS2_CREDENTIAL_STORE_CONSOLIDATION Phase 2: structure import
-- becomes saved-only for DHIS2 (step_1_result held the plaintext credentials
-- JSON; it now holds only a { url, username } confirmation snapshot). Any
-- in-flight DHIS2 structure attempt is reset back to step 1 rather than
-- re-encrypted in place — at most one row per family, wizard state only, and
-- a deploy restarts the server anyway so any in-flight staging dies with it.
UPDATE structure_upload_attempts
SET
  step = 1,
  step_1_result = NULL,
  step_2_result = NULL,
  step_3_result = NULL,
  status = '{"status":"configuring"}',
  status_type = 'configuring'
WHERE source_type = 'dhis2';
