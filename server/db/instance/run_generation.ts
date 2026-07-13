import type { Sql } from "postgres";
import {
  MODULE_REGISTRY,
  runGenerationStep1ResultSchema,
  runGenerationStep2ResultSchema,
  runProgressSchema,
  type APIResponseNoData,
  type APIResponseWithData,
  type RunCatalogStatus,
  type RunGenerationAttemptDetail,
  type RunGenerationStep1Result,
  type RunGenerationStep2Result,
  type RunListingItem,
  type RunProgress,
  type RunProvenance,
  type RunSummary,
} from "lib";
import type { DBRunGenerationAttempt } from "./_main_database_types.ts";

// The results-package launch wizard's attempt record (PLAN_RESULTS_RUNS
// item 2): one configuring attempt per source project
// (structure_upload_attempts pattern). The attempt is configuration only —
// status_type is only ever 'configuring', execution state lives on the runs
// catalog row — so there is no claim machinery here; each config-step write
// advances step and nulls downstream results, and the row is deleted at
// launch (and by discard).
//
// The second half of this file is the runs-catalog execution state the
// pipeline writes: the 'generating' row minted at launch, worker progress
// updates, the ready-publish transaction (status flip + projects.run_id
// repoint), and failure marking. These are worker/host internals, so they
// throw instead of returning APIResponse envelopes.

const CONFIGURING_STATUS = JSON.stringify({ status: "configuring" });

async function getRawAttempt(
  mainDb: Sql,
  projectId: string,
): Promise<DBRunGenerationAttempt | undefined> {
  const rows = await mainDb<DBRunGenerationAttempt[]>`
SELECT * FROM run_generation_attempts WHERE source_project_id = ${projectId}
`;
  return rows.at(0);
}

export async function createRunGenerationAttempt(
  mainDb: Sql,
  projectId: string,
): Promise<APIResponseNoData> {
  try {
    await mainDb`
INSERT INTO run_generation_attempts
  (source_project_id, date_started, step, status, status_type)
VALUES
  (${projectId}, ${new Date().toISOString()}, 1, ${CONFIGURING_STATUS}, 'configuring')
ON CONFLICT (source_project_id) DO UPDATE SET
  date_started = EXCLUDED.date_started,
  step = 1,
  status = EXCLUDED.status,
  status_type = 'configuring',
  step_1_result = NULL,
  step_2_result = NULL
`;
    return { success: true };
  } catch (e) {
    return {
      success: false,
      err: "Problem creating results-package configuration: " +
        (e instanceof Error ? e.message : ""),
    };
  }
}

export async function getRunGenerationAttempt(
  mainDb: Sql,
  projectId: string,
): Promise<APIResponseWithData<RunGenerationAttemptDetail | null>> {
  try {
    const raw = await getRawAttempt(mainDb, projectId);
    if (raw === undefined) {
      return { success: true, data: null };
    }
    const step1Result: RunGenerationStep1Result | null =
      raw.step_1_result === null
        ? null
        : runGenerationStep1ResultSchema.parse(JSON.parse(raw.step_1_result));
    const step2Result: RunGenerationStep2Result | null =
      raw.step_2_result === null
        ? null
        : runGenerationStep2ResultSchema.parse(JSON.parse(raw.step_2_result));
    return {
      success: true,
      data: {
        step: raw.step,
        dateStarted: raw.date_started,
        status: { status: "configuring" },
        step1Result,
        step2Result,
      },
    };
  } catch (e) {
    return {
      success: false,
      err: "Problem getting results-package configuration: " +
        (e instanceof Error ? e.message : ""),
    };
  }
}

export async function updateRunGenerationAttemptStep1(
  mainDb: Sql,
  projectId: string,
  step1Result: RunGenerationStep1Result,
): Promise<APIResponseNoData> {
  try {
    if (
      step1Result.hmis === null &&
      step1Result.hfa === null &&
      step1Result.iceh === false
    ) {
      return {
        success: false,
        err: "Select at least one data family for the results package",
      };
    }
    const rows = await mainDb`
UPDATE run_generation_attempts SET
  step = 2,
  step_1_result = ${JSON.stringify(step1Result)},
  step_2_result = NULL
WHERE source_project_id = ${projectId}
RETURNING source_project_id
`;
    if (rows.length === 0) {
      return {
        success: false,
        err: "No results-package configuration in progress for this project",
      };
    }
    return { success: true };
  } catch (e) {
    return {
      success: false,
      err: "Problem saving data selection: " +
        (e instanceof Error ? e.message : ""),
    };
  }
}

export async function updateRunGenerationAttemptStep2(
  mainDb: Sql,
  projectId: string,
  step2Result: RunGenerationStep2Result,
): Promise<APIResponseNoData> {
  try {
    if (step2Result.modules.length === 0) {
      return {
        success: false,
        err: "Select at least one module for the results package",
      };
    }
    const moduleIds = new Set(step2Result.modules.map((m) => m.moduleId));
    if (moduleIds.size !== step2Result.modules.length) {
      return { success: false, err: "Duplicate module in selection" };
    }
    for (const moduleId of moduleIds) {
      if (!MODULE_REGISTRY.some((m) => m.id === moduleId)) {
        return { success: false, err: `Unknown module: ${moduleId}` };
      }
    }
    const rows = await mainDb`
UPDATE run_generation_attempts SET
  step = 3,
  step_2_result = ${JSON.stringify(step2Result)}
WHERE source_project_id = ${projectId} AND step_1_result IS NOT NULL
RETURNING source_project_id
`;
    if (rows.length === 0) {
      return {
        success: false,
        err: "Not yet ready for this step — choose data first",
      };
    }
    return { success: true };
  } catch (e) {
    return {
      success: false,
      err: "Problem saving module selection: " +
        (e instanceof Error ? e.message : ""),
    };
  }
}

export async function deleteRunGenerationAttempt(
  mainDb: Sql,
  projectId: string,
): Promise<APIResponseNoData> {
  try {
    await mainDb`
DELETE FROM run_generation_attempts WHERE source_project_id = ${projectId}
`;
    return { success: true };
  } catch (e) {
    return {
      success: false,
      err: "Problem discarding results-package configuration: " +
        (e instanceof Error ? e.message : ""),
    };
  }
}

// This project's runs, newest first, for the "Results package" listing.
// summary/progress are stored JSON; a malformed blob degrades that field to
// null rather than hiding the row.
export async function listRunsForProject(
  mainDb: Sql,
  projectId: string,
): Promise<APIResponseWithData<RunListingItem[]>> {
  try {
    const rows = await mainDb<
      {
        id: string;
        label: string;
        status: string;
        provenance: string;
        created_at: Date;
        created_by: string | null;
        summary: string | null;
        progress: string | null;
      }[]
    >`
SELECT id, label, status, provenance, created_at, created_by, summary, progress
FROM runs
WHERE summary::jsonb ->> 'sourceProjectId' = ${projectId}
ORDER BY created_at DESC
`;
    const items: RunListingItem[] = rows.map((row) => {
      let summary: RunSummary | null = null;
      try {
        summary = row.summary === null ? null : JSON.parse(row.summary);
      } catch {
        summary = null;
      }
      let progress: RunProgress | null = null;
      if (row.progress !== null) {
        const parsed = runProgressSchema.safeParse(JSON.parse(row.progress));
        progress = parsed.success ? parsed.data : null;
      }
      return {
        id: row.id,
        label: row.label,
        status: row.status as RunCatalogStatus,
        provenance: row.provenance as RunProvenance,
        createdAt: row.created_at.toISOString(),
        createdBy: row.created_by,
        summary,
        progress,
      };
    });
    return { success: true, data: items };
  } catch (e) {
    return {
      success: false,
      err: "Problem listing results packages: " +
        (e instanceof Error ? e.message : ""),
    };
  }
}

///////////////////////////////////////////////////////////////////////////////
// Runs-catalog execution state (the pipeline's writes)
///////////////////////////////////////////////////////////////////////////////

export async function createGeneratingRun(
  mainDb: Sql,
  args: {
    runId: string;
    label: string;
    createdBy: string;
    summary: RunSummary;
    progress: RunProgress;
  },
): Promise<void> {
  await mainDb`
INSERT INTO runs (id, label, status, provenance, created_by, summary, progress)
VALUES (
  ${args.runId}, ${args.label}, 'generating', 'wizard', ${args.createdBy},
  ${JSON.stringify(args.summary)}, ${JSON.stringify(args.progress)}
)
`;
}

// The one-generating-run-per-project guard's DB half (the in-memory registry
// is the synchronous half). sourceProjectId lives in the summary JSON — the
// catalog deliberately has no source_project_id column.
export async function getGeneratingRunIdForProject(
  mainDb: Sql,
  projectId: string,
): Promise<string | undefined> {
  const rows = await mainDb<{ id: string }[]>`
SELECT id FROM runs
WHERE status = 'generating' AND summary::jsonb ->> 'sourceProjectId' = ${projectId}
`;
  return rows.at(0)?.id;
}

export async function updateRunProgress(
  mainDb: Sql,
  runId: string,
  progress: RunProgress,
): Promise<void> {
  await mainDb`
UPDATE runs SET progress = ${JSON.stringify(progress)} WHERE id = ${runId}
`;
}

// Ready-publish: exactly one transaction after the atomic rename — status
// flip, final summary/progress, and the projects.run_id repoint together, so
// readers can never observe a ready run without the pointer (or vice versa).
export async function publishReadyRun(
  mainDb: Sql,
  args: {
    runId: string;
    projectId: string;
    summary: RunSummary;
    progress: RunProgress;
  },
): Promise<void> {
  await mainDb.begin(async (sql) => {
    await sql`
UPDATE runs SET
  status = 'ready',
  summary = ${JSON.stringify(args.summary)},
  progress = ${JSON.stringify(args.progress)}
WHERE id = ${args.runId}
`;
    await sql`
UPDATE projects SET run_id = ${args.runId} WHERE id = ${args.projectId}
`;
  });
}

// Marks a generation failed, stamping errorDetail (and the current module's
// error status) into the stored progress. Returns the updated progress for
// the SSE push; null when the run row is gone.
export async function markRunGenerationFailed(
  mainDb: Sql,
  runId: string,
  errorDetail: string,
): Promise<RunProgress | null> {
  const rows = await mainDb<{ progress: string | null }[]>`
SELECT progress FROM runs WHERE id = ${runId}
`;
  const raw = rows.at(0);
  if (raw === undefined) {
    return null;
  }
  const parsed = raw.progress === null
    ? undefined
    : runProgressSchema.safeParse(JSON.parse(raw.progress));
  const progress: RunProgress = parsed?.success
    ? parsed.data
    : {
      moduleOrder: [],
      moduleStatus: {},
      currentModuleId: null,
      errorDetail: null,
    };
  if (progress.currentModuleId !== null) {
    progress.moduleStatus[progress.currentModuleId] = "error";
  }
  progress.errorDetail = errorDetail;
  await mainDb`
UPDATE runs SET status = 'failed', progress = ${JSON.stringify(progress)}
WHERE id = ${runId}
`;
  return progress;
}

// Boot recovery: a 'generating' row at startup belongs to a worker that died
// with the previous process — no .tmp dir survives the boot sweep, so the
// row is dead. Mark it failed so the catalog never shows a phantom
// generation.
export async function markInterruptedGeneratingRuns(mainDb: Sql): Promise<void> {
  const rows = await mainDb<{ id: string }[]>`
SELECT id FROM runs WHERE status = 'generating'
`;
  for (const row of rows) {
    console.log(`[runs] marking interrupted generation as failed: ${row.id}`);
    await markRunGenerationFailed(
      mainDb,
      row.id,
      "Generation was interrupted by a server restart",
    );
  }
}
