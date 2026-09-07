-- m007 and m008 are dropped (PLAN_1a §1.11). Their metrics still resolve from
-- an EXISTING attached package (the read path is manifest-driven and
-- registry-free), but no new package will ever carry them again, so these
-- visualizations are on borrowed time from the moment a project regenerates.
-- They are deleted now, in the same release, rather than left to die one
-- regeneration at a time.
--
-- The loss is OWNED and deliberate: a configured scorecard is rebuilt from the
-- m12-01-01 preset in one click. Repointing was considered and REJECTED (it
-- needs a config-compat sweep plus dual-id handling for marginal gain).
--
-- FOUR LITERAL IDS, never a `NOT IN` sweep over the live metric list — that
-- shape caused the 4f0dd3dc data-loss bug, because a project whose package is
-- momentarily unreadable would match every row.
DELETE FROM presentation_objects
WHERE metric_id IN ('m7-01-01', 'm7-01-02', 'm7-01-03', 'm8-01-01');
