// =============================================================================
// DATA TRANSFORM: runs.progress
// =============================================================================
//
// Table:    runs
// Column:   progress (JSON)
// Type:     lib/types/run_generation.ts → RunProgress (runProgressSchema)
//
// The catalogue row only: a run's manifest and files are never touched.
//
// TRANSFORM BLOCKS:
// 1. Add `stage: { kind: "ended" }` to a progress written before the stage
//    existed. A run still generating at migration time is marked failed by
//    boot recovery moments later and keeps `ended`, which is what a run with
//    no recorded stage can honestly say.
//
// SKIP GATE: a raw scan for the `"stage"` key. `stage` is required with no
// `.catch`, so a validating parse cannot be the gate: every old row fails it.
//
// A row whose progress does not parse, or does not validate once the stage
// is added, is logged and skipped, never thrown: the catalogue already
// degrades such a row to null chips so an admin can still see and delete
// it, and a boot must not fail over it.
//
// =============================================================================

import type { Sql } from "postgres";
import { runProgressSchema } from "lib";
import type { MigrationStats } from "./po_config.ts";

export async function migrateRunsProgress(tx: Sql): Promise<MigrationStats> {
  const rows = await tx<{ id: string; progress: string }[]>`
    SELECT id, progress FROM runs WHERE progress IS NOT NULL
  `;
  let rowsTransformed = 0;
  for (const row of rows) {
    if (row.progress.includes('"stage"')) {
      continue;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(row.progress);
    } catch {
      console.error(
        `[migration] runs_progress: run ${row.id} has unparsable progress, skipped`,
      );
      continue;
    }
    if (typeof parsed !== "object" || parsed === null) {
      console.error(
        `[migration] runs_progress: run ${row.id} progress is not an object, skipped`,
      );
      continue;
    }
    const progress = { ...parsed, stage: { kind: "ended" } };
    const validated = runProgressSchema.safeParse(progress);
    if (!validated.success) {
      console.error(
        `[migration] runs_progress: run ${row.id} progress does not validate with a stage added, skipped: ${validated.error.message}`,
      );
      continue;
    }
    await tx`
      UPDATE runs SET progress = ${
      JSON.stringify(progress)
    } WHERE id = ${row.id}
    `;
    rowsTransformed++;
  }
  return { rowsChecked: rows.length, rowsTransformed };
}
