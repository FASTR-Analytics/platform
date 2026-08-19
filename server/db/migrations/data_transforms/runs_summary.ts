// =============================================================================
// DATA TRANSFORM: runs.summary
// =============================================================================
//
// Table:    runs
// Column:   summary (JSON)
// Schema:   lib/types/run_manifest.ts
//           → RunSummary
//
// TRANSFORM BLOCKS:
// 1. Strip the two project keys — `backfillSourceProjectId` (the synthesizer's
//    source project) and `attachTargetProjectIds` (the wizard's launch-time
//    attach selection, and the deleted launch concurrency guard's key). Both
//    named a project layer that no longer exists.
//
// The CATALOGUE row only. A run's package on disk is immutable and its
// manifest is transformed by server/runs/manifest_transform.ts — never here.
//
// =============================================================================

import type { Sql } from "postgres";
import type { MigrationStats } from "./po_config.ts";

const DELETED_PROJECT_KEYS = [
  "backfillSourceProjectId",
  "attachTargetProjectIds",
] as const;

export async function migrateRunSummaries(tx: Sql): Promise<MigrationStats> {
  const rows = await tx<{ id: string; summary: string }[]>`
    SELECT id, summary FROM runs WHERE summary IS NOT NULL
  `;
  let rowsTransformed = 0;

  for (const row of rows) {
    // A malformed blob degrades the summary to null at read time
    // (rowToRunListing) rather than failing boot, so it must not throw here
    // either — there is nothing to strip from something that isn't an object.
    let summary: unknown;
    try {
      summary = JSON.parse(row.summary);
    } catch {
      continue;
    }
    if (summary === null || typeof summary !== "object") {
      continue;
    }

    const s = summary as Record<string, unknown>;
    if (!DELETED_PROJECT_KEYS.some((key) => key in s)) {
      continue;
    }
    for (const key of DELETED_PROJECT_KEYS) {
      delete s[key];
    }

    await tx`
      UPDATE runs SET summary = ${JSON.stringify(s)} WHERE id = ${row.id}
    `;
    rowsTransformed++;
  }

  return { rowsChecked: rows.length, rowsTransformed };
}
