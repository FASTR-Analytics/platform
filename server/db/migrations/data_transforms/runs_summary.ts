// =============================================================================
// DATA TRANSFORM: runs.summary
// =============================================================================
//
// Table:    runs
// Column:   summary (JSON)
// Type:     lib/types/run_manifest.ts → RunSummary (no schema: the catalogue
//           reads it with JSON.parse)
//
// The catalogue row only: a run's manifest and files are never touched.
//
// TRANSFORM BLOCKS:
// 1. Strip `backfillSourceProjectId` and `attachTargetProjectIds`, the
//    project-era launch identity and attach selection
//
// SKIP GATE: RunSummary has no schema to parse against, so the gate is a raw
// scan for the two keys in their JSON-key form.
//
// =============================================================================

import type { Sql } from "postgres";
import type { MigrationStats } from "./po_config.ts";

const STRIPPED_KEYS = ["backfillSourceProjectId", "attachTargetProjectIds"];

export async function migrateRunsSummaries(tx: Sql): Promise<MigrationStats> {
  const rows = await tx<{ id: string; summary: string }[]>`
    SELECT id, summary FROM runs WHERE summary IS NOT NULL
  `;
  let rowsTransformed = 0;
  for (const row of rows) {
    if (!STRIPPED_KEYS.some((key) => row.summary.includes(`"${key}"`))) {
      continue;
    }
    let summary: Record<string, unknown>;
    try {
      summary = JSON.parse(row.summary);
    } catch {
      // The catalogue already degrades a malformed summary to null; it is
      // not this transform's to repair.
      continue;
    }
    for (const key of STRIPPED_KEYS) {
      delete summary[key];
    }
    await tx`
      UPDATE runs SET summary = ${JSON.stringify(summary)} WHERE id = ${row.id}
    `;
    rowsTransformed++;
  }
  return { rowsChecked: rows.length, rowsTransformed };
}
