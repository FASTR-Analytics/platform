-- PLAN_SCHEDULE_RECURRENCE: recurring schedules move from flat
-- day_of_week/start_time/timezone/interval_weeks columns to one `recurrence`
-- JSON column (discriminated union: daily / weekly / monthly), mirroring how
-- `selection` is stored. Legacy rows become kind "weekly" with their phase
-- preserved: the anchor (firstRunDate) is the wall date of the last handled
-- occurrence, or the first matching weekday on/after armed_at for rows that
-- never fired. The transform runs inside a column-existence guard so it is a
-- no-op on fresh databases whose base schema never had the flat columns.
ALTER TABLE dataset_hmis_scheduled_imports
  ADD COLUMN IF NOT EXISTS recurrence text;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'dataset_hmis_scheduled_imports'
      AND column_name = 'day_of_week'
  ) THEN
    UPDATE dataset_hmis_scheduled_imports SET recurrence = json_build_object(
      'kind', 'weekly',
      'firstRunDate', to_char(
        CASE WHEN last_fired_at IS NOT NULL
          THEN (last_fired_at AT TIME ZONE timezone)::date
          ELSE (armed_at AT TIME ZONE timezone)::date
            + ((day_of_week
                - EXTRACT(DOW FROM (armed_at AT TIME ZONE timezone)::date)::int
                + 7) % 7)
        END, 'YYYY-MM-DD'),
      'everyNWeeks', LEAST(interval_weeks, 13),
      'startTime', start_time,
      'timezone', timezone
    )::text
    WHERE kind = 'recurring' AND recurrence IS NULL
      AND day_of_week IS NOT NULL AND start_time IS NOT NULL
      AND timezone IS NOT NULL AND interval_weeks IS NOT NULL;
  END IF;
END $$;

ALTER TABLE dataset_hmis_scheduled_imports
  DROP COLUMN IF EXISTS day_of_week,
  DROP COLUMN IF EXISTS start_time,
  DROP COLUMN IF EXISTS timezone,
  DROP COLUMN IF EXISTS interval_weeks;

-- A recurring row the transform could not convert (some flat column was
-- NULL — schema-legal, write-path-impossible) would otherwise sit enabled
-- and permanently inert with no signal. Delete rather than strand
-- (migration 060 precedent); post-064 invariant: recurring ⇒ recurrence.
DELETE FROM dataset_hmis_scheduled_imports
WHERE kind = 'recurring' AND recurrence IS NULL;
