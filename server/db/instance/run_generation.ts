import type { Sql } from "postgres";
import {
  MODULE_REGISTRY,
  runGenerationStep1ResultSchema,
  runGenerationStep2ResultSchema,
  runProgressSchema,
  type APIResponseNoData,
  type APIResponseWithData,
  type RunCatalogItem,
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
// The middle of this file is the runs catalog's read surface: the instance
// catalogue listing (Phase 3 item 3) and the guarded hard delete, plus the
// project surface's attached-run row.
//
// The last section is the runs-catalog execution state the pipeline writes:
// the 'generating' row minted at launch, worker progress updates, the
// ready-publish transaction (status flip + projects.run_id repoint of every
// attach target), and failure marking. These are worker/host internals, so
// they throw instead of returning APIResponse envelopes.

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
    // safeParse: a stored step 1 written under an older shape degrades to a
    // fresh step 1 instead of bricking the wizard for that admin.
    const step1Parsed = raw.step_1_result === null
      ? null
      : runGenerationStep1ResultSchema.safeParse(
        JSON.parse(raw.step_1_result),
      );
    const step1Result: RunGenerationStep1Result | null =
      step1Parsed?.success ? step1Parsed.data : null;
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
    if (!step1Result.hmis && !step1Result.hfa && !step1Result.iceh) {
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

type RunListingRow = {
  id: string;
  label: string;
  status: string;
  provenance: string;
  created_at: Date;
  created_by: string | null;
  summary: string | null;
  progress: string | null;
};

// summary/progress are stored JSON; a malformed blob degrades that field to
// null rather than hiding the row — a run the catalogue cannot summarise is
// still a run an admin must be able to see and delete.
function toRunListingItem(row: RunListingRow): RunListingItem {
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
}

// The instance catalogue (Phase 3 item 3): every run on the instance, newest
// first, each with the projects currently pointing at it. Those pointers are
// both the "attached projects" column and the delete guard's subject, so
// they come from projects.run_id — the serving pointer — never from the
// summary's launch-time attach selection, which says nothing about where a
// run ended up.
export async function listRunCatalog(
  mainDb: Sql,
): Promise<APIResponseWithData<RunCatalogItem[]>> {
  try {
    const rows = await mainDb<
      (RunListingRow & { attached_projects: { id: string; label: string }[] })[]
    >`
SELECT r.id, r.label, r.status, r.provenance, r.created_at, r.created_by,
  r.summary, r.progress,
  COALESCE(
    (
      SELECT json_agg(json_build_object('id', p.id, 'label', p.label)
        ORDER BY p.label)
      FROM projects p
      WHERE p.run_id = r.id
    ),
    '[]'::json
  ) AS attached_projects
FROM runs r
ORDER BY r.created_at DESC
`;
    return {
      success: true,
      data: rows.map((row) => ({
        ...toRunListingItem(row),
        attachedProjects: row.attached_projects,
      })),
    };
  } catch (e) {
    return {
      success: false,
      err: "Problem listing results packages: " +
        (e instanceof Error ? e.message : ""),
    };
  }
}

// Guarded hard delete's DB half (Q1 ruling: ONE act, no archived state). The
// guard is IN the DELETE so a project cannot attach between a check and the
// delete; a refusal re-reads the row to say WHY. The caller
// (server/runs/delete_run.ts) owns the run dir and cache purge and only runs
// them once this returns deleted.
export async function deleteRunCatalogRow(
  mainDb: Sql,
  runId: string,
): Promise<APIResponseNoData> {
  try {
    const deleted = await mainDb<{ id: string }[]>`
DELETE FROM runs
WHERE id = ${runId}
  AND status <> 'generating'
  AND NOT EXISTS (SELECT 1 FROM projects p WHERE p.run_id = ${runId})
RETURNING id
`;
    if (deleted.length > 0) {
      return { success: true };
    }
    const row = (
      await mainDb<{ status: string; attached_count: number }[]>`
SELECT r.status,
  (SELECT COUNT(*)::int FROM projects p WHERE p.run_id = r.id) AS attached_count
FROM runs r WHERE r.id = ${runId}
`
    ).at(0);
    if (row === undefined) {
      return { success: false, err: "Results package not found" };
    }
    if (row.status === "generating") {
      return {
        success: false,
        err: "This results package is still being generated",
      };
    }
    return {
      success: false,
      err:
        "This results package is in use — point every project using it at another package first",
    };
  } catch (e) {
    return {
      success: false,
      err: "Problem deleting results package: " +
        (e instanceof Error ? e.message : ""),
    };
  }
}

// The package this project currently serves from (Phase 3 item 4) — a run
// belongs to no project (Q-A), so "the attached one" is the only package a
// member has business reading. null when nothing is attached: the typed
// no-package state, not an error.
export async function getAttachedRunForProject(
  mainDb: Sql,
  projectId: string,
): Promise<APIResponseWithData<RunListingItem | null>> {
  try {
    const row = (
      await mainDb<RunListingRow[]>`
SELECT r.id, r.label, r.status, r.provenance, r.created_at, r.created_by,
  r.summary, r.progress
FROM runs r
JOIN projects p ON p.run_id = r.id
WHERE p.id = ${projectId}
`
    ).at(0);
    return { success: true, data: row === undefined ? null : toRunListingItem(row) };
  } catch (e) {
    return {
      success: false,
      err: "Problem reading this project's results package: " +
        (e instanceof Error ? e.message : ""),
    };
  }
}

// The picker's candidate list: every ready package this project could repoint
// at, newest first, minus the one it already serves from. A narrowing of the
// instance catalogue rather than a different fact — the same rows, without the
// catalogue's housekeeping columns, for a surface whose only act is a repoint.
export async function listAttachableRunsForProject(
  mainDb: Sql,
  projectId: string,
): Promise<APIResponseWithData<RunListingItem[]>> {
  try {
    const rows = await mainDb<RunListingRow[]>`
SELECT r.id, r.label, r.status, r.provenance, r.created_at, r.created_by,
  r.summary, r.progress
FROM runs r
WHERE r.status = 'ready'
  AND r.id IS DISTINCT FROM (SELECT p.run_id FROM projects p WHERE p.id = ${projectId})
ORDER BY r.created_at DESC
`;
    return { success: true, data: rows.map(toRunListingItem) };
  } catch (e) {
    return {
      success: false,
      err: "Problem listing results packages: " +
        (e instanceof Error ? e.message : ""),
    };
  }
}

// The repoint itself: the publish transaction's pointer UPDATE minus the
// status flip (§2.6 — swapping packages is an UPDATE plus an SSE notify).
//
// The ready gate is IN the UPDATE, so a candidate cannot fail or be deleted
// between the compatibility report and the write; the `projects.run_id` FK
// (migration 065, no cascade) closes the other side of that race — a
// concurrent delete of this run blocks on the FK's row lock and then hits its
// own not-referenced guard. A refused write re-reads to say which reason.
export async function setProjectAttachedRun(
  mainDb: Sql,
  projectId: string,
  runId: string,
): Promise<APIResponseNoData> {
  try {
    const updated = await mainDb<{ id: string }[]>`
UPDATE projects p SET run_id = r.id
FROM runs r
WHERE p.id = ${projectId} AND r.id = ${runId} AND r.status = 'ready'
RETURNING p.id
`;
    if (updated.length > 0) {
      return { success: true };
    }
    const row = (
      await mainDb<{ status: string }[]>`
SELECT status FROM runs WHERE id = ${runId}
`
    ).at(0);
    if (row === undefined) {
      return { success: false, err: "Results package not found" };
    }
    if (row.status !== "ready") {
      return {
        success: false,
        err: "This results package is not ready to be used",
      };
    }
    return { success: false, err: "Project not found" };
  } catch (e) {
    return {
      success: false,
      err: "Problem attaching results package: " +
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

// Launch-time eligibility of the confirm step's attach selection: a target
// must still exist, be 'ready' (not copying, not scheduled for deletion) and
// be unlocked — the same set the wizard's multi-select offers, re-checked
// because the selection is made before launch. Returns a display name per
// ineligible target (its label, or the id when the project is gone).
export async function getIneligibleAttachTargetNames(
  mainDb: Sql,
  projectIds: string[],
): Promise<string[]> {
  if (projectIds.length === 0) {
    return [];
  }
  const rows = await mainDb<
    { id: string; label: string; status: string; is_locked: boolean }[]
  >`
SELECT id, label, status, is_locked FROM projects WHERE id = ANY(${projectIds})
`;
  const byId = new Map(rows.map((r) => [r.id, r]));
  return projectIds.flatMap((projectId) => {
    const row = byId.get(projectId);
    if (row === undefined) {
      return [projectId];
    }
    return row.status !== "ready" || row.is_locked ? [row.label] : [];
  });
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
