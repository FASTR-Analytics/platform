-- When a results package stopped generating: stamped by the ready-publish and
-- the failure marking, so the package page can show how long a run took.
-- NULL on runs that are still generating and on runs that ended before this
-- column existed.

ALTER TABLE runs ADD COLUMN IF NOT EXISTS ended_at TIMESTAMPTZ;
