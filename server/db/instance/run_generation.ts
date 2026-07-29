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
// item 2, re-keyed by Phase 3 item 1): one configuring attempt per admin
// user (structure_upload_attempts pattern) — the wizard is entered from the
// instance shell, so an attempt belongs to whoever is configuring it, not to
// a project. The attempt is configuration only — status_type is only ever
// 'configuring', execution state lives on the runs catalog row — so there is
// no claim machinery here; each config-step write advances step and nulls
// downstream results, and the row is deleted at launch (and by discard).
//
// The second half of this file is the runs-catalog execution state the
// pipeline writes: the 'generating' row minted at launch, worker progress
// updates, the ready-publish transaction (status flip + projects.run_id
// repoint of every attach target), and failure marking. These are
// worker/host internals, so they throw instead of returning APIResponse
// envelopes.

const CONFIGURING_STATUS = JSON.stringify({ status: "configuring" });

async function getRawAttempt(
  mainDb: Sql,
  userEmail: string,
): Promise<DBRunGenerationAttempt | undefined> {
  const rows = await mainDb<DBRunGenerationAttempt[]>`
SELECT * FROM run_generation_attempts WHERE created_by_user_email = ${userEmail}
`;
  return rows.at(0);
}

export async function createRunGenerationAttempt(
  mainDb: Sql,
  userEmail: string,
): Promise<APIResponseNoData> {
  try {
    await mainDb`
INSERT INTO run_generation_attempts
  (created_by_user_email, date_started, step, status, status_type)
VALUES
  (${userEmail}, ${new Date().toISOString()}, 1, ${CONFIGURING_STATUS}, 'configuring')
ON CONFLICT (created_by_user_email) DO UPDATE SET
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
  userEmail: string,
): Promise<APIResponseWithData<RunGenerationAttemptDetail | null>> {
  try {
    const raw = await getRawAttempt(mainDb, userEmail);
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
  userEmail: string,
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
WHERE created_by_user_email = ${userEmail}
RETURNING created_by_user_email
`;
    if (rows.length === 0) {
      return {
        success: false,
        err: "No results-package configuration in progress",
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
  userEmail: string,
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
WHERE created_by_user_email = ${userEmail} AND step_1_result IS NOT NULL
RETURNING created_by_user_email
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
  userEmail: string,
): Promise<APIResponseNoData> {
  try {
    await mainDb`
DELETE FROM run_generation_attempts WHERE created_by_user_email = ${userEmail}
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

// The run this project currently serves from, as a listing row for the
// project "Results package" surface — a run no longer belongs to a project
// (Q-A), so the attached one is the only run the project surface has
// business showing. Empty when nothing is attached. summary/progress are
// stored JSON; a malformed blob degrades that field to null rather than
// hiding the row.
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
SELECT r.id, r.label, r.status, r.provenance, r.created_at, r.created_by,
  r.summary, r.progress
FROM runs r
JOIN projects p ON p.run_id = r.id
WHERE p.id = ${projectId}
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

// The launch concurrency guard's DB half (the in-memory registry is the
// synchronous half): the projects a generation would repoint at publish are
// its attach targets, so a launch is refused while any selected target is
// already a target of a generating run. Targets live in the summary JSON —
// the catalog deliberately has no project columns.
export async function getGeneratingRunIdForAttachTargets(
  mainDb: Sql,
  projectIds: string[],
): Promise<string | undefined> {
  if (projectIds.length === 0) {
    return undefined;
  }
  const rows = await mainDb<{ id: string }[]>`
SELECT id FROM runs
WHERE status = 'generating'
  AND EXISTS (
    SELECT 1
    FROM jsonb_array_elements_text(
      summary::jsonb -> 'attachTargetProjectIds'
    ) AS target(project_id)
    WHERE target.project_id = ANY(${projectIds})
  )
`;
  return rows.at(0)?.id;
}

// Access check for the per-run outputs surface (script/logs/files viewers):
// a project may read the ready run it currently serves from. (Q-A dropped
// the "run this project generated" arm — a run has no source project any
// more; item 3 moves these viewers to the instance catalogue.)
export async function runReadableByProject(
  mainDb: Sql,
  runId: string,
  projectId: string,
): Promise<boolean> {
  const run = (
    await mainDb<{ status: string }[]>`
SELECT status FROM runs WHERE id = ${runId}
`
  ).at(0);
  if (run === undefined || run.status !== "ready") return false;
  const project = (
    await mainDb<{ run_id: string | null }[]>`
SELECT run_id FROM projects WHERE id = ${projectId}
`
  ).at(0);
  return project?.run_id === runId;
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
// flip, final summary/progress, and the projects.run_id repoint of every
// attach target together, so readers can never observe a ready run without
// the pointers (or vice versa). Zero targets is normal: a run generated
// without an attach selection is published and attached later from the
// project picker.
export async function publishReadyRun(
  mainDb: Sql,
  args: {
    runId: string;
    attachTargetProjectIds: string[];
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
    if (args.attachTargetProjectIds.length > 0) {
      await sql`
UPDATE projects SET run_id = ${args.runId}
WHERE id = ANY(${args.attachTargetProjectIds})
`;
    }
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
