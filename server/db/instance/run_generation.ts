import type { Sql } from "postgres";
import {
  runProgressSchema,
  type APIResponseNoData,
  type APIResponseWithData,
  type FollowPinnedProject,
  type RunCatalogItem,
  type RunCatalogStatus,
  type RunListingItem,
  type RunProgress,
  type RunProvenance,
  type RunSummary,
} from "lib";

// The runs catalog (PLAN_RESULTS_RUNS item 2, re-cut by Phase 3 items 1 and
// 3). The first section is the read surface: the instance catalogue listing
// and the guarded hard delete, plus the project surface's attached-run row.
//
// The last section is the runs-catalog execution state the pipeline writes:
// the 'generating' row minted at launch, worker progress updates, the
// ready-publish transaction (status flip + projects.run_id repoint of every
// attach target), and failure marking. These are worker/host internals, so
// they throw instead of returning APIResponse envelopes.

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
// them once this returns deleted. The pinned refusal is a code guard by
// necessity — a boolean column carries no FK protection the way
// projects.run_id does (SYSTEM_08 "Delete protection is a code guard").
export async function deleteRunCatalogRow(
  mainDb: Sql,
  runId: string,
): Promise<APIResponseNoData> {
  try {
    const deleted = await mainDb<{ id: string }[]>`
DELETE FROM runs
WHERE id = ${runId}
  AND status <> 'generating'
  AND NOT pinned
  AND NOT EXISTS (SELECT 1 FROM projects p WHERE p.run_id = ${runId})
RETURNING id
`;
    if (deleted.length > 0) {
      return { success: true };
    }
    const row = (
      await mainDb<{ status: string; pinned: boolean; attached_count: number }[]>`
SELECT r.status, r.pinned,
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
    if (row.pinned) {
      return {
        success: false,
        err: "This results package is pinned — unpin it before deleting",
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
// The pinned package + follower subscriptions (rulings: SYSTEM_08 "The
// pinned package + followers")
///////////////////////////////////////////////////////////////////////////////

// Every pin write takes this transaction-scoped advisory lock, so pin-moves
// and unpins serialize (last write wins) instead of the loser tripping the
// partial unique index or an unpin silently missing a row its snapshot never
// saw — verified by execution under READ COMMITTED.
const PINNED_RUN_ADVISORY_LOCK_KEY = 727402;

// Pin-move: unpin-all then pin-target, in ONE transaction. Not one UPDATE —
// verified by execution: Postgres checks the partial unique index
// (`runs_one_pinned`) per row as an UPDATE proceeds, so `SET pinned = (id =
// $1) WHERE pinned OR id = $1` trips it whenever the new row is visited
// before the old. The ready gate is IN the pinning UPDATE exactly as in
// setProjectAttachedRun — a run that failed or was deleted between the click
// and the write cannot become pinned — and a zero-row second UPDATE throws
// to roll the unpin back, so a bad target leaves the current pin untouched.
// The re-read then says why.
export async function setPinnedRun(
  mainDb: Sql,
  runId: string,
): Promise<APIResponseNoData> {
  try {
    await mainDb.begin(async (sql) => {
      await sql`SELECT pg_advisory_xact_lock(${PINNED_RUN_ADVISORY_LOCK_KEY})`;
      await sql`UPDATE runs SET pinned = FALSE WHERE pinned`;
      const pinned = await sql<{ id: string }[]>`
UPDATE runs SET pinned = TRUE WHERE id = ${runId} AND status = 'ready'
RETURNING id
`;
      if (pinned.length === 0) {
        throw new PinTargetNotPinnable();
      }
    });
    return { success: true };
  } catch (e) {
    if (!(e instanceof PinTargetNotPinnable)) {
      return {
        success: false,
        err: "Problem pinning results package: " +
          (e instanceof Error ? e.message : ""),
      };
    }
    try {
      const row = (
        await mainDb<{ status: string }[]>`
SELECT status FROM runs WHERE id = ${runId}
`
      ).at(0);
      if (row === undefined) {
        return { success: false, err: "Results package not found" };
      }
      return {
        success: false,
        err: "Only a ready results package can be pinned",
      };
    } catch (e2) {
      return {
        success: false,
        err: "Problem pinning results package: " +
          (e2 instanceof Error ? e2.message : ""),
      };
    }
  }
}

class PinTargetNotPinnable extends Error {}

// Unpin is run-keyed: it clears the pin only if `runId` IS the pin, so a
// stale catalogue (one that has not yet learned another admin moved the pin)
// cannot clear a pin it never saw. Zero rows = refused with the reason.
export async function clearPinnedRun(
  mainDb: Sql,
  runId: string,
): Promise<APIResponseNoData> {
  try {
    const cleared = await mainDb.begin(async (sql) => {
      await sql`SELECT pg_advisory_xact_lock(${PINNED_RUN_ADVISORY_LOCK_KEY})`;
      return await sql<{ id: string }[]>`
UPDATE runs SET pinned = FALSE WHERE pinned AND id = ${runId} RETURNING id
`;
    });
    return cleared.length > 0
      ? { success: true }
      : {
        success: false,
        err: "This results package is no longer the pinned one",
      };
  } catch (e) {
    return {
      success: false,
      err: "Problem unpinning results package: " +
        (e instanceof Error ? e.message : ""),
    };
  }
}

export async function getPinnedRunId(
  mainDb: Sql,
): Promise<APIResponseWithData<string | null>> {
  try {
    const row = (
      await mainDb<{ id: string }[]>`SELECT id FROM runs WHERE pinned`
    ).at(0);
    return { success: true, data: row === undefined ? null : row.id };
  } catch (e) {
    return {
      success: false,
      err: "Problem reading the pinned results package: " +
        (e instanceof Error ? e.message : ""),
    };
  }
}

export async function getProjectAttachedRunId(
  mainDb: Sql,
  projectId: string,
): Promise<APIResponseWithData<string | null>> {
  try {
    const row = (
      await mainDb<{ run_id: string | null }[]>`
SELECT run_id FROM projects WHERE id = ${projectId}
`
    ).at(0);
    return row === undefined
      ? { success: false, err: "Project not found" }
      : { success: true, data: row.run_id };
  } catch (e) {
    return {
      success: false,
      err: "Problem reading this project's results package: " +
        (e instanceof Error ? e.message : ""),
    };
  }
}

// The follower roster — for the pin-move loop and for the pin confirm. The
// loop skips locked projects (a roster-time snapshot; the lock refusal itself
// is route middleware, not an attach-layer gate) and ones already on the
// target.
export async function listFollowPinnedProjects(
  mainDb: Sql,
): Promise<APIResponseWithData<FollowPinnedProject[]>> {
  try {
    const rows = await mainDb<
      { id: string; label: string; is_locked: boolean; run_id: string | null }[]
    >`
SELECT id, label, is_locked, run_id FROM projects WHERE follow_pinned
ORDER BY label
`;
    return {
      success: true,
      data: rows.map((r) => ({
        id: r.id,
        label: r.label,
        isLocked: r.is_locked,
        runId: r.run_id,
      })),
    };
  } catch (e) {
    return {
      success: false,
      err: "Problem listing projects that follow the pinned package: " +
        (e instanceof Error ? e.message : ""),
    };
  }
}

// The follower repoint: setProjectAttachedRun's UPDATE plus `r.pinned` in
// the gate, so a pin-move loop that has been superseded (another pin-move
// or an unpin landed while it was running) writes NOTHING and learns it —
// "pin_moved" — instead of moving a project onto a package that is no
// longer the pin. Verified by execution: two overlapping loops cannot
// leave a follower on the older target, whichever writes last.
export async function setProjectAttachedRunIfPinned(
  mainDb: Sql,
  projectId: string,
  runId: string,
): Promise<APIResponseWithData<"attached" | "pin_moved">> {
  try {
    const updated = await mainDb<{ id: string }[]>`
UPDATE projects p SET run_id = r.id
FROM runs r
WHERE p.id = ${projectId} AND r.id = ${runId} AND r.status = 'ready' AND r.pinned
RETURNING p.id
`;
    if (updated.length > 0) {
      return { success: true, data: "attached" };
    }
    const stillPinned = await mainDb<{ id: string }[]>`
SELECT id FROM runs WHERE id = ${runId} AND pinned
`;
    if (stillPinned.length === 0) {
      return { success: true, data: "pin_moved" };
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

// The flag write only — the enable-time attach and the notify are
// server/runs/pin_run.ts's. Returns label + isLocked so the caller can push
// project_config_updated without a second read (the updateProject pattern).
export async function setProjectFollowPinned(
  mainDb: Sql,
  projectId: string,
  follow: boolean,
): Promise<APIResponseWithData<{ label: string; isLocked: boolean }>> {
  try {
    const row = (
      await mainDb<{ label: string; is_locked: boolean }[]>`
UPDATE projects SET follow_pinned = ${follow} WHERE id = ${projectId}
RETURNING label, is_locked
`
    ).at(0);
    return row === undefined
      ? { success: false, err: "Project not found" }
      : { success: true, data: { label: row.label, isLocked: row.is_locked } };
  } catch (e) {
    return {
      success: false,
      err: "Problem updating follow-pinned setting: " +
        (e instanceof Error ? e.message : ""),
    };
  }
}

// A MANUAL attach to anything but the current pin ends the subscription
// (SYSTEM_08 "Manual attach overrides the subscription"). One statement so
// the "is this the pin?" test and the clear cannot straddle a pin-move.
// data = the project's label + isLocked when the flag was actually cleared
// (the caller pushes project_config_updated), null when nothing changed.
// The follower loop never calls this — it repoints through
// setProjectAttachedRunIfPinned.
export async function clearFollowPinnedIfNotPin(
  mainDb: Sql,
  projectId: string,
  attachedRunId: string,
): Promise<APIResponseWithData<{ label: string; isLocked: boolean } | null>> {
  try {
    const row = (
      await mainDb<{ label: string; is_locked: boolean }[]>`
UPDATE projects SET follow_pinned = FALSE
WHERE id = ${projectId} AND follow_pinned
  AND NOT EXISTS (SELECT 1 FROM runs WHERE id = ${attachedRunId} AND pinned)
RETURNING label, is_locked
`
    ).at(0);
    return {
      success: true,
      data: row === undefined
        ? null
        : { label: row.label, isLocked: row.is_locked },
    };
  } catch (e) {
    return {
      success: false,
      err: "Problem updating follow-pinned setting: " +
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
// the SSE push; null when the run row is gone — or no longer 'generating':
// only a generating run can fail, so a post-publish exception in a caller
// must never flip a published, attached run to 'failed' (delete would be
// blocked "in use" with nothing able to restore 'ready').
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
  const updated = await mainDb<{ id: string }[]>`
UPDATE runs SET status = 'failed', progress = ${JSON.stringify(progress)}
WHERE id = ${runId} AND status = 'generating'
RETURNING id
`;
  if (updated.length === 0) {
    console.error(
      `[runs] refused to mark non-generating run ${runId} as failed: ${errorDetail}`,
    );
    return null;
  }
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
