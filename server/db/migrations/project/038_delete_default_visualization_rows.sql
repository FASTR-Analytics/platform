-- Default visualizations became pure projections of the attached run's
-- manifest (PLAN_RESULTS_RUNS item 5b) — presentation_objects holds
-- user-authored content only. In-place edits users made to default rows are
-- discarded (ruled: re-creatable as duplicates); stored deck/report figure
-- references to default ids keep resolving via the manifest detail fallback.
DELETE FROM presentation_objects WHERE is_default_visualization = TRUE;
