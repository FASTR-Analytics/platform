// =============================================================================
// DATA TRANSFORM: runs.summary
// =============================================================================
//
// Table:    runs
// Column:   summary (JSON)
// Type:     lib/types/run_manifest.ts → RunSummary (runSummarySchema)
//
// The catalogue row only: a run's manifest and files are never touched.
//
// TRANSFORM BLOCKS:
// 1. Strip `backfillSourceProjectId` and `attachTargetProjectIds`, the
//    project-era launch identity and attach selection
// 2. Stamp `families` from the run's manifest datasets. Without a readable
//    manifest, a generating or failed run is stamped null (families are
//    knowable only at generation), and any other run is left unstamped for
//    the next boot: a pg-dump restore brings rows back before their package
//    dirs, and the manifest sweep already reports the missing package.
//
// SKIP GATE: a raw scan, for block 1 the two keys in their JSON-key form, for
// block 2 the absence of the `families` key. A validating parse cannot be
// the gate: `families` is required, so every old row fails it, and a row
// block 2 defers must not fail boot.
//
// =============================================================================

import type { Sql } from "postgres";
import { z } from "zod";
import {
  type DatasetType,
  familiesOfDatasetTypes,
  runManifestDatasetSchema,
} from "lib";
import { runDirPath, runManifestPath } from "../../../runs/run_paths.ts";
import type { MigrationStats } from "./po_config.ts";

const STRIPPED_KEYS = ["backfillSourceProjectId", "attachTargetProjectIds"];

const manifestDatasetsSchema = z.object({
  datasets: z.array(runManifestDatasetSchema),
});

// Any read or parse failure is unreadable, as the manifest sweep treats it.
async function readManifestFamilies(
  runId: string,
): Promise<DatasetType[] | "unreadable"> {
  let raw: unknown;
  try {
    raw = JSON.parse(
      await Deno.readTextFile(runManifestPath(runDirPath(runId))),
    );
  } catch {
    return "unreadable";
  }
  const parsed = manifestDatasetsSchema.safeParse(raw);
  return parsed.success
    ? familiesOfDatasetTypes(parsed.data.datasets.map((d) => d.datasetType))
    : "unreadable";
}

export async function migrateRunsSummaries(tx: Sql): Promise<MigrationStats> {
  const rows = await tx<{ id: string; status: string; summary: string }[]>`
    SELECT id, status, summary FROM runs WHERE summary IS NOT NULL
  `;
  let rowsTransformed = 0;
  for (const row of rows) {
    const needsStrip = STRIPPED_KEYS.some((key) =>
      row.summary.includes(`"${key}"`)
    );
    const needsFamilies = !row.summary.includes(`"families"`);
    if (!needsStrip && !needsFamilies) {
      continue;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(row.summary);
    } catch {
      // The catalogue already degrades a malformed summary to null; it is
      // not this transform's to repair.
      continue;
    }
    if (
      typeof parsed !== "object" || parsed === null || Array.isArray(parsed)
    ) {
      continue;
    }
    const summary = parsed as Record<string, unknown>;
    let changed = false;

    // Block 1: Strip the project-era keys
    for (const key of STRIPPED_KEYS) {
      if (key in summary) {
        delete summary[key];
        changed = true;
      }
    }

    // Block 2: Stamp families from the manifest
    if (!("families" in summary)) {
      const families = await readManifestFamilies(row.id);
      if (families !== "unreadable") {
        summary.families = families;
        changed = true;
      } else if (row.status === "generating" || row.status === "failed") {
        summary.families = null;
        changed = true;
      }
    }

    if (!changed) {
      continue;
    }
    await tx`
      UPDATE runs SET summary = ${JSON.stringify(summary)} WHERE id = ${row.id}
    `;
    rowsTransformed++;
  }
  return { rowsChecked: rows.length, rowsTransformed };
}
