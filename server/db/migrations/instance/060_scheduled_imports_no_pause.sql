-- The pause concept is removed (PLAN_DHIS2_IMPORTER_UI_FUTURE_LISTING):
-- delete rows that only the removed enable/disable toggle could have
-- produced. Deleting (not re-enabling) is deliberate — a migration must
-- never silently re-activate unattended fetching the user had switched
-- off. Handled one-shots (last_outcome set) are NOT touched: launched ones
-- are swept by the scheduler tick once their run completes; refused/missed
-- ones stay for the attention flow.
DELETE FROM dataset_hmis_scheduled_imports
WHERE enabled = false
  AND (
    kind = 'recurring'
    OR (kind = 'one_shot' AND last_outcome IS NULL)
  );
