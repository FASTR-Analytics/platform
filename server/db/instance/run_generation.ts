import postgres, { type Sql } from "postgres";
import {
  runProgressSchema,
  type APIResponseNoData,
  type APIResponseWithData,
  type ReadyPackage,
  type RunCatalogItem,
  type RunCatalogStatus,
  type RunListingItem,
  type RunProgress,
  type RunProvenance,
  type RunSummary,
} from "lib";

// The vendored Deno build attaches PostgresError to the default export only;
// the types declare it as a named export, which typechecks and fails at load.
const { PostgresError } = postgres;

// The runs catalog (PLAN_RESULTS_RUNS item 2, re-cut by Phase 3 items 1 and
// 3). The first section is the read surface: the instance catalogue listing,
// the guarded hard delete, the ready-package list and the product pointer.
//
// The last section is the runs-catalog execution state the pipeline writes:
// the 'generating' row minted at launch, worker progress updates, the
// ready-publish status flip, and failure marking. These are worker/host internals, so
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
// null rather than hiding the row: a run the catalogue cannot summarise is
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
// first, each with the products currently pointing at it. Those pointers are
// both the "in use by" column and the delete guard's subject.
export async function listRunCatalog(
  mainDb: Sql,
): Promise<APIResponseWithData<RunCatalogItem[]>> {
  try {
    const rows = await mainDb<
      (RunListingRow & {
        attached_products: RunCatalogItem["attachedProducts"];
      })[]
    >`
SELECT r.id, r.label, r.status, r.provenance, r.created_at, r.created_by,
  r.summary, r.progress,
  COALESCE(
    (
      SELECT json_agg(
        json_build_object('type', pr.type, 'id', pr.id, 'label', pr.label)
        ORDER BY pr.label)
      FROM products pr
      WHERE pr.run_id = r.id
    ),
    '[]'::json
  ) AS attached_products
FROM runs r
ORDER BY r.created_at DESC
`;
    return {
      success: true,
      data: rows.map((row) => ({
        ...toRunListingItem(row),
        attachedProducts: row.attached_products,
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
// guard is IN the DELETE so a product cannot attach between a check and the
// delete; a refusal re-reads the row to say WHY. The caller
// (server/runs/delete_run.ts) owns the run dir and cache purge and only runs
// them once this returns deleted. The pinned refusal is a code guard by
// necessity: a boolean column carries no FK protection the way
// products.run_id does (SYSTEM_08 "Delete protection is a
// code guard").
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
  AND NOT EXISTS (SELECT 1 FROM products pr WHERE pr.run_id = ${runId})
RETURNING id
`;
    if (deleted.length > 0) {
      return { success: true };
    }
    const row = (
      await mainDb<{ status: string; pinned: boolean }[]>`
SELECT r.status, r.pinned FROM runs r WHERE r.id = ${runId}
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
        "This results package is in use — point every product using it at another package first",
    };
  } catch (e) {
    return {
      success: false,
      err: "Problem deleting results package: " +
        (e instanceof Error ? e.message : ""),
    };
  }
}

// The product package picker's options: every ready package on the
// instance, newest first, as bare (id, label, createdAt) triples. Approved
// users may read it (the label is what every product card shows), so it
// carries none of RunListingItem's generation telemetry.
export async function listReadyPackages(
  mainDb: Sql,
): Promise<APIResponseWithData<ReadyPackage[]>> {
  try {
    const rows = await mainDb<{ id: string; label: string; created_at: Date }[]>`
SELECT id, label, created_at FROM runs
WHERE status = 'ready'
ORDER BY created_at DESC
`;
    return {
      success: true,
      data: rows.map((r) => ({
        id: r.id,
        label: r.label,
        createdAt: r.created_at.toISOString(),
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

// The product's package pointer (PLAN_PRODUCTS_RESTRUCTURE D5): one UPDATE
// with the ready gate IN the WHERE clause, so a package that flips out of
// `ready` between check and write cannot be attached, and the products.run_id
// FK (no cascade) blocks a concurrent delete of the target. Reattach never
// blocks on compatibility: staleness is a per-figure badge (D4). A refused
// write re-reads to say which reason.
export async function setProductRun(
  mainDb: Sql,
  productId: string,
  runId: string,
): Promise<APIResponseWithData<{ lastUpdated: string }>> {
  try {
    const lastUpdated = new Date().toISOString();
    const updated = await mainDb<{ id: string }[]>`
UPDATE products p SET run_id = r.id, last_updated = ${lastUpdated}
FROM runs r
WHERE p.id = ${productId} AND r.id = ${runId} AND r.status = 'ready'
RETURNING p.id
`;
    if (updated.length > 0) {
      return { success: true, data: { lastUpdated } };
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
        err: "Only a ready results package can be attached to a product",
      };
    }
    return { success: false, err: "Product not found" };
  } catch (e) {
    return {
      success: false,
      err: "Problem attaching results package: " +
        (e instanceof Error ? e.message : ""),
    };
  }
}

// One catalogue row by id (the /mcp door's pinned-package row). null when no
// such run: the typed absent state, not an error.
export async function getRunListingItem(
  mainDb: Sql,
  runId: string,
): Promise<APIResponseWithData<RunListingItem | null>> {
  try {
    const row = (
      await mainDb<RunListingRow[]>`
SELECT r.id, r.label, r.status, r.provenance, r.created_at, r.created_by,
  r.summary, r.progress
FROM runs r
WHERE r.id = ${runId}
`
    ).at(0);
    return { success: true, data: row === undefined ? null : toRunListingItem(row) };
  } catch (e) {
    return {
      success: false,
      err: "Problem reading this results package: " +
        (e instanceof Error ? e.message : ""),
    };
  }
}

///////////////////////////////////////////////////////////////////////////////
// The pinned package (SYSTEM_08 "The pinned package")
///////////////////////////////////////////////////////////////////////////////

// Every pin write takes this transaction-scoped advisory lock, so pin-moves
// and unpins serialize (last write wins) instead of the loser tripping the
// partial unique index or an unpin silently missing a row its snapshot never
// saw: verified by execution under READ COMMITTED.
const PINNED_RUN_ADVISORY_LOCK_KEY = 727402;

// Pin-move: unpin-all then pin-target, in ONE transaction. Not one UPDATE:
// verified by execution: Postgres checks the partial unique index
// (`runs_one_pinned`) per row as an UPDATE proceeds, so `SET pinned = (id =
// $1) WHERE pinned OR id = $1` trips it whenever the new row is visited
// before the old. The ready gate is IN the pinning UPDATE exactly as in
// setProductRun: a run that failed or was deleted between the click
// and the write cannot become pinned, and a zero-row second UPDATE throws
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
  try {
    await mainDb`
INSERT INTO runs (id, label, status, provenance, created_by, summary, progress)
VALUES (
  ${args.runId}, ${args.label}, 'generating', 'wizard', ${args.createdBy},
  ${JSON.stringify(args.summary)}, ${JSON.stringify(args.progress)}
)
`;
  } catch (e) {
    if (
      e instanceof PostgresError && e.constraint_name === "runs_label_unique"
    ) {
      throw new Error(
        `A results package labelled "${args.label}" already exists`,
      );
    }
    throw e;
  }
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

// Ready-publish, after the atomic rename: status flip plus the final
// summary and progress in one statement. A generation repoints nothing:
// products point at the package afterwards.
export async function publishReadyRun(
  mainDb: Sql,
  args: {
    runId: string;
    summary: RunSummary;
    progress: RunProgress;
  },
): Promise<void> {
  await mainDb`
UPDATE runs SET
  status = 'ready',
  summary = ${JSON.stringify(args.summary)},
  progress = ${JSON.stringify(args.progress)}
WHERE id = ${args.runId}
`;
}

// Marks a generation failed, stamping errorDetail (and the current module's
// error status) into the stored progress. Returns the updated progress for
// the SSE push; null when the run row is gone, or no longer 'generating':
// only a generating run can fail, so a post-publish exception in a caller
// must never flip a published run to 'failed' (delete would be
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
// with the previous process: no .tmp dir survives the boot sweep, so the
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
