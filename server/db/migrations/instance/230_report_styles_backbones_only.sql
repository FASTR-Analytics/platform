-- The report-style library holds report backbones only (SYSTEM_12): the
-- palette-only custom styles it held before are removed (Nick, 2026-11-16).
-- A report that was using one keeps its own snapshot of the colours in its
-- config (customStyle), so it looks as it did; the style can no longer be
-- picked. Idempotent: a second run finds nothing to delete.

DELETE FROM report_styles WHERE backbone IS NULL;
