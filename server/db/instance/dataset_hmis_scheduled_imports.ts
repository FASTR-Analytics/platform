import { Sql } from "postgres";
import {
  APIResponseNoData,
  APIResponseWithData,
  parseJsonOrThrow,
  type DatasetHmisImportRunStatus,
  type DatasetHmisScheduledImport,
  type DatasetHmisScheduledImportFields,
  type DatasetHmisScheduledImportOutcome,
  type Dhis2ScheduleSelection,
} from "lib";
import { tryCatchDatabaseAsync } from "../utils.ts";
import type { DBDatasetHmisScheduledImport } from "./_main_database_types.ts";

// Scheduled DHIS2 imports (PLAN_DHIS2_IMPORTER Phase 4, C4): CRUD for the
// schedule rows plus the compare-and-set primitives the ~60 s scheduler tick
// uses (see server/worker_routines/import_hmis_data_dhis2/scheduler.ts).
// last_fired_at is the last HANDLED occurrence — launched, refused, or
// missed — which doubles as the tick's idempotency token and the
// interval-weeks anchor.

export function isValidIanaTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

// Normalizes + cross-validates the editable fields per kind. Returns the
// fields with inapplicable columns cleared so a kind switch can never leave
// stale recurrence fields behind.
function validateScheduleFields(
  fields: DatasetHmisScheduledImportFields,
): DatasetHmisScheduledImportFields {
  if (fields.kind === "one_shot") {
    if (!fields.runAt || isNaN(new Date(fields.runAt).getTime())) {
      throw new Error("A one-time schedule needs a valid run-at datetime.");
    }
    if (new Date(fields.runAt).getTime() <= Date.now()) {
      throw new Error("The run-at datetime must be in the future.");
    }
    return {
      kind: "one_shot",
      selection: fields.selection,
      runAt: new Date(fields.runAt).toISOString(),
    };
  }
  if (
    fields.dayOfWeek === undefined ||
    fields.startTime === undefined ||
    fields.timezone === undefined ||
    fields.intervalWeeks === undefined
  ) {
    throw new Error(
      "A recurring schedule needs a day of week, start time, timezone, and interval.",
    );
  }
  if (!isValidIanaTimeZone(fields.timezone)) {
    throw new Error(`Unknown timezone: "${fields.timezone}".`);
  }
  return {
    kind: "recurring",
    selection: fields.selection,
    dayOfWeek: fields.dayOfWeek,
    startTime: fields.startTime,
    timezone: fields.timezone,
    intervalWeeks: fields.intervalWeeks,
  };
}

function toScheduledImport(
  row: DBDatasetHmisScheduledImport & {
    last_run_status?: DatasetHmisImportRunStatus | null;
  },
): DatasetHmisScheduledImport {
  return {
    id: row.id,
    kind: row.kind,
    enabled: row.enabled,
    selection: parseJsonOrThrow<Dhis2ScheduleSelection>(row.selection),
    runAt: row.run_at ? new Date(row.run_at).toISOString() : undefined,
    dayOfWeek: row.day_of_week ?? undefined,
    startTime: row.start_time ?? undefined,
    timezone: row.timezone ?? undefined,
    intervalWeeks: row.interval_weeks ?? undefined,
    createdBy: row.created_by,
    createdAt: new Date(row.created_at).toISOString(),
    lastFiredAt: row.last_fired_at
      ? new Date(row.last_fired_at).toISOString()
      : undefined,
    lastOutcome: row.last_outcome ?? undefined,
    lastError: row.last_error ?? undefined,
    lastRunId: row.last_run_id ?? undefined,
    lastRunStatus: row.last_run_status ?? undefined,
  };
}

export async function getDatasetHmisScheduledImports(
  mainDb: Sql,
): Promise<DatasetHmisScheduledImport[]> {
  const rows = await mainDb<
    (DBDatasetHmisScheduledImport & {
      last_run_status: DatasetHmisImportRunStatus | null;
    })[]
  >`
    SELECT s.*, r.status as last_run_status
    FROM dataset_hmis_scheduled_imports s
    LEFT JOIN dataset_hmis_import_runs r ON r.id = s.last_run_id
    ORDER BY s.id
  `;
  return rows.map(toScheduledImport);
}

export async function createDatasetHmisScheduledImport(
  mainDb: Sql,
  fields: DatasetHmisScheduledImportFields,
  createdBy: string,
): Promise<APIResponseWithData<DatasetHmisScheduledImport>> {
  return await tryCatchDatabaseAsync(async () => {
    const f = validateScheduleFields(fields);
    const rows = await mainDb<DBDatasetHmisScheduledImport[]>`
      INSERT INTO dataset_hmis_scheduled_imports
        (kind, enabled, selection, run_at, day_of_week, start_time, timezone,
         interval_weeks, created_by)
      VALUES
        (${f.kind}, true, ${JSON.stringify(f.selection)}, ${f.runAt ?? null},
         ${f.dayOfWeek ?? null}, ${f.startTime ?? null}, ${f.timezone ?? null},
         ${f.intervalWeeks ?? null}, ${createdBy})
      RETURNING *
    `;
    return { success: true, data: toScheduledImport(rows[0]) };
  });
}

export async function updateDatasetHmisScheduledImport(
  mainDb: Sql,
  id: number,
  fields: DatasetHmisScheduledImportFields,
): Promise<APIResponseNoData> {
  return await tryCatchDatabaseAsync(async () => {
    const f = validateScheduleFields(fields);
    const existing = await mainDb<{ kind: string }[]>`
      SELECT kind FROM dataset_hmis_scheduled_imports WHERE id = ${id}
    `;
    if (existing.length === 0) {
      throw new Error("This schedule no longer exists.");
    }
    // Editing re-arms a fired one-shot, and a kind switch must not carry the
    // old kind's handled-occurrence token (it would anchor the recurring
    // interval, or block the one-shot's fire). A same-kind recurring edit
    // keeps the anchor — it still means "last handled occurrence".
    const clearLastFired =
      f.kind === "one_shot" || existing[0].kind !== f.kind;
    await mainDb`
      UPDATE dataset_hmis_scheduled_imports
      SET kind = ${f.kind},
        selection = ${JSON.stringify(f.selection)},
        run_at = ${f.runAt ?? null},
        day_of_week = ${f.dayOfWeek ?? null},
        start_time = ${f.startTime ?? null},
        timezone = ${f.timezone ?? null},
        interval_weeks = ${f.intervalWeeks ?? null},
        last_fired_at = CASE WHEN ${clearLastFired} THEN NULL ELSE last_fired_at END
      WHERE id = ${id}
    `;
    return { success: true };
  });
}

export async function setDatasetHmisScheduledImportEnabled(
  mainDb: Sql,
  id: number,
  enabled: boolean,
): Promise<APIResponseNoData> {
  return await tryCatchDatabaseAsync(async () => {
    const updated = await mainDb`
      UPDATE dataset_hmis_scheduled_imports
      SET enabled = ${enabled}
      WHERE id = ${id}
    `;
    if (updated.count === 0) {
      throw new Error("This schedule no longer exists.");
    }
    return { success: true };
  });
}

export async function deleteDatasetHmisScheduledImport(
  mainDb: Sql,
  id: number,
): Promise<APIResponseNoData> {
  return await tryCatchDatabaseAsync(async () => {
    await mainDb`DELETE FROM dataset_hmis_scheduled_imports WHERE id = ${id}`;
    return { success: true };
  });
}

// ============================================================================
// Scheduler-tick primitives
// ============================================================================

export type EnabledScheduledImportRow = {
  id: number;
  kind: "one_shot" | "recurring";
  selection: Dhis2ScheduleSelection;
  runAtMs: number | null;
  dayOfWeek: number | null;
  startTime: string | null;
  timezone: string | null;
  intervalWeeks: number | null;
  createdBy: string;
  lastFiredAtMs: number | null;
};

export async function getEnabledScheduledImportRows(
  mainDb: Sql,
): Promise<EnabledScheduledImportRow[]> {
  const rows = await mainDb<DBDatasetHmisScheduledImport[]>`
    SELECT * FROM dataset_hmis_scheduled_imports
    WHERE enabled = true
    ORDER BY id
  `;
  return rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    selection: parseJsonOrThrow<Dhis2ScheduleSelection>(row.selection),
    runAtMs: row.run_at ? new Date(row.run_at).getTime() : null,
    dayOfWeek: row.day_of_week,
    startTime: row.start_time,
    timezone: row.timezone,
    intervalWeeks: row.interval_weeks,
    createdBy: row.created_by,
    lastFiredAtMs: row.last_fired_at
      ? new Date(row.last_fired_at).getTime()
      : null,
  }));
}

// Compare-and-set claim of one occurrence: exactly one tick wins even if a
// tick overlaps a slow predecessor. Returns false when already handled.
export async function claimScheduledImportOccurrence(
  mainDb: Sql,
  id: number,
  occurrenceMs: number,
): Promise<boolean> {
  const occurrenceIso = new Date(occurrenceMs).toISOString();
  const updated = await mainDb`
    UPDATE dataset_hmis_scheduled_imports
    SET last_fired_at = ${occurrenceIso}
    WHERE id = ${id} AND enabled = true
      AND (last_fired_at IS NULL OR last_fired_at < ${occurrenceIso})
  `;
  return updated.count > 0;
}

// A launch that failed only because the import slot got claimed concurrently
// releases the occurrence so the next tick retries it (within grace).
export async function revertScheduledImportClaim(
  mainDb: Sql,
  id: number,
  previousLastFiredAtMs: number | null,
): Promise<void> {
  await mainDb`
    UPDATE dataset_hmis_scheduled_imports
    SET last_fired_at = ${
      previousLastFiredAtMs === null
        ? null
        : new Date(previousLastFiredAtMs).toISOString()
    }
    WHERE id = ${id}
  `;
}

export async function recordScheduledImportOutcome(
  mainDb: Sql,
  id: number,
  args: {
    outcome: DatasetHmisScheduledImportOutcome;
    error?: string;
    runId?: number;
    // One-shots disable after their occurrence is handled (the row is kept —
    // the listing shows it fired, linking to its run).
    disable?: boolean;
  },
): Promise<void> {
  await mainDb`
    UPDATE dataset_hmis_scheduled_imports
    SET last_outcome = ${args.outcome},
      last_error = ${args.error ?? null},
      last_run_id = ${args.runId ?? null},
      enabled = CASE WHEN ${args.disable ?? false} THEN false ELSE enabled END
    WHERE id = ${id}
  `;
}

// The failure-banner condition (surfaced on the datasets summary): the most
// recent fire of some schedule was refused/missed, or the run it launched
// ended in error.
export async function hasScheduledImportAttention(
  mainDb: Sql,
): Promise<boolean> {
  const rows = await mainDb<{ exists: boolean }[]>`
    SELECT EXISTS(
      SELECT 1 FROM dataset_hmis_scheduled_imports s
      LEFT JOIN dataset_hmis_import_runs r ON r.id = s.last_run_id
      WHERE s.last_outcome IN ('refused', 'missed')
        OR (s.last_outcome = 'launched' AND r.status = 'error')
    ) as exists
  `;
  return rows[0].exists;
}
