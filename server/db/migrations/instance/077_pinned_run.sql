-- Instance-pinned results package (SYSTEM_08 "The pinned package +
-- followers"): runs.pinned marks
-- the at-most-one package the instance blesses for consumption (the partial
-- unique index enforces the cardinality); projects.follow_pinned subscribes a
-- project to a physical repoint whenever the pin moves.

ALTER TABLE runs ADD COLUMN IF NOT EXISTS pinned boolean NOT NULL DEFAULT FALSE;
CREATE UNIQUE INDEX IF NOT EXISTS runs_one_pinned ON runs (pinned) WHERE pinned;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS follow_pinned boolean NOT NULL DEFAULT FALSE;
