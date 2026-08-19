import {
  _COMMON_INDICATORS,
  H_USERS,
  type InstanceConfigAdminAreaLabels,
  type StructureSchema,
} from "lib";
import { escapeSqlString } from "./db/utils.ts";
import {
  evictRunFromManifestCache,
  runDirPath,
  sweepAbandonedTmpRunDirs,
  transformRunManifestFile,
} from "./runs/mod.ts";
import { resetDuckDbSpillDir } from "./run_query/duckdb_executor.ts";
import { markInterruptedGeneratingRuns } from "./db/instance/run_generation.ts";
import {
  _INSTANCE_COUNTRY_ISO3,
  _RUNS_DIR_PATH,
} from "./exposed_env_vars.ts";
import { runInstanceMigrations } from "./db/migrations/runner.ts";
import {
  getPgConnectionFromCacheOrNew,
  markStaleRunningDatasetHfaImportRuns,
  markStaleRunningDatasetHmisImportRuns,
  markStaleRunningDatasetIcehImportRuns,
} from "./db/mod.ts";
import type { Sql } from "postgres";
import type { MigrationStats } from "./db/migrations/data_transforms/po_config.ts";
import { migrateSlideDeckConfigs } from "./db/migrations/data_transforms/slide_deck_config.ts";
import { migrateSlideConfigs } from "./db/migrations/data_transforms/slide_config.ts";
import { migrateReports } from "./db/migrations/data_transforms/reports.ts";
import { migrateRunSummaries } from "./db/migrations/data_transforms/runs_summary.ts";
import { migrateInstanceConfigs } from "./db/migrations/data_transforms/instance_config.ts";

export async function dbStartUp() {
  const sql = getPgConnectionFromCacheOrNew("postgres", "READ_AND_WRITE");
  const matchingDatabases = await sql<
    object[]
  >`SELECT datname FROM pg_catalog.pg_database WHERE datname = 'main'`;
  const isNewDatabase = matchingDatabases.length === 0;

  if (isNewDatabase) {
    await sql`CREATE DATABASE main`;
  }

  const sqlMain = getPgConnectionFromCacheOrNew("main", "READ_AND_WRITE");

  if (isNewDatabase) {
    await sqlMain.file("./server/db/instance/_main_database.sql");

    const userInserts = getInitialUsersInsertStatements();

    await sqlMain.unsafe(`
${getDefaultInstanceConfigInsertStatement()}

${getDefaultIndicatorsInsertStatement()}

${userInserts}
`);
  }

  await runInstanceMigrations(sqlMain);

  // A restart mid-import leaves status_type stuck at an in-flight value with no
  // live worker, and the concurrency guards then block all future imports.
  await resetWedgedUploadAttempts(sqlMain);
  const staleRuns = await markStaleRunningDatasetHmisImportRuns(sqlMain);
  if (staleRuns > 0) {
    console.log(
      `[startup] Marked ${staleRuns} HMIS import run(s) wedged mid-run by a previous shutdown`,
    );
  }
  const staleHfaRuns = await markStaleRunningDatasetHfaImportRuns(sqlMain);
  if (staleHfaRuns > 0) {
    console.log(
      `[startup] Marked ${staleHfaRuns} HFA import run(s) wedged mid-run by a previous shutdown`,
    );
  }
  const staleIcehRuns = await markStaleRunningDatasetIcehImportRuns(sqlMain);
  if (staleIcehRuns > 0) {
    console.log(
      `[startup] Marked ${staleIcehRuns} ICEH import run(s) wedged mid-run by a previous shutdown`,
    );
  }
  // Instance-level country, threaded into the figure backfill so backfilled
  // bundles carry the real countryIso3 (drives Nigeria admin-area relabelling +
  // admin replicant labels). New captures read it from the live instance store;
  // the backfill cannot, so it gets it here.
  const instanceCountryIso3 = _INSTANCE_COUNTRY_ISO3;

  // JSON data transforms, on the main database. Strictly AFTER
  // runInstanceMigrations: migration 080 is what populates products / decks /
  // slides / reports on an instance coming from the project layer, so the
  // sweeps would otherwise see an empty (or, on the consolidating boot,
  // half-built) product plane.
  await runInstanceDataTransforms(sqlMain, instanceCountryIso3);

  // Results runs (PLAN_RESULTS_RUNS §2.6): a crashed generation leaves only a
  // .tmp- dir, never a readable run — sweep the debris at boot, and mark any
  // 'generating' catalog rows failed (their worker died with the previous
  // process).
  await Deno.mkdir(_RUNS_DIR_PATH, { recursive: true });
  await sweepAbandonedTmpRunDirs();
  await resetDuckDbSpillDir();
  await markInterruptedGeneratingRuns(sqlMain);

  // Last, so the manifest sweep never sees debris the three lines above
  // remove.
  await runRunManifestTransforms(sqlMain);
}

// The manifest data transform (PROTOCOL_APP_MIGRATIONS § "Run Manifest
// Transforms") — the same pattern as the JSON transforms below, applied to a
// file. It enumerates the `runs`
// CATALOGUE and never the filesystem: the runs volume is shared with legacy
// {projectId} sandbox dirs, published-failed dirs (deliberately manifest-less)
// and .duckdb-spill, none of which are packages, and every consumer addresses a
// NAMED entry.
//
// A missing or unparseable manifest is OPERATIONAL, not a code defect, and must
// not fail boot: backups are pg dumps, so a restore brings catalogue rows back
// while the package directories are still absent. Those degrade loudly through
// the typed "run unavailable" states instead. Invalid AFTER the transform ran
// is a code defect and fails boot, exactly as a DB transform does.
async function runRunManifestTransforms(mainDb: Sql): Promise<void> {
  // 'failed' and 'generating' are excluded because they definitionally have no
  // manifest, not as a heuristic: a handled failure publishes its workspace
  // deliberately WITHOUT one so the logs stay inspectable, and a generating run
  // has only a .tmp- dir (markInterruptedGeneratingRuns, above, has already
  // flipped any left over by a previous process). Sweeping them would warn on
  // every boot, forever, about a state that is working as designed. Excluding
  // by what a status IS NOT, so a status added later gets swept rather than
  // silently skipped — a missed transform fails at read time, a spurious
  // warning does not.
  const rows = await mainDb<{ id: string }[]>`
SELECT id FROM runs WHERE status NOT IN ('generating', 'failed')
`;
  let transformed = 0;
  let unreadable = 0;
  let future = 0;
  const failures: { runId: string; error: Error }[] = [];

  for (const { id } of rows) {
    try {
      const outcome = await transformRunManifestFile(runDirPath(id));
      if (outcome.kind === "unreadable") {
        unreadable++;
        console.warn(
          `  ! run ${id}: ${outcome.reason} — package unavailable until restored`,
        );
      } else if (outcome.kind === "future") {
        future++;
        console.warn(
          `  ! run ${id}: manifest schema version ${outcome.version} was written by a newer server — package unavailable here`,
        );
      } else if (outcome.transformed) {
        transformed++;
        evictRunFromManifestCache(id);
      }
    } catch (err) {
      failures.push({
        runId: id,
        error: err instanceof Error ? err : new Error(String(err)),
      });
    }
  }

  console.log(
    `[migration] Run manifests ${rows.length} checked, ${transformed} transformed, ${unreadable} unreadable, ${future} from a newer server`,
  );

  if (failures.length > 0) {
    for (const f of failures) {
      console.error(`  ✗ run_manifest ${f.runId}`);
      console.error(`    Error: ${f.error.message}`);
    }
    console.error(
      `\n[migration] FAILED — Server will not start. Fix the issues above and redeploy.\n`,
    );
    Deno.exit(1);
  }
}

// Only the structure family (S5) still runs on upload attempts — every
// dataset family is import runs (PLAN_DHIS2_IMPORTER_CONSOLIDATION).
async function resetWedgedUploadAttempts(mainDb: Sql): Promise<void> {
  const message =
    "Import interrupted by a server restart. Delete this attempt and start again.";
  const structureErrStatus = JSON.stringify({ status: "error", error: message });
  const reset = await mainDb`UPDATE structure_upload_attempts SET status = ${structureErrStatus}, status_type = 'error' WHERE status_type = 'importing'`;
  if (reset.count > 0) {
    console.log(
      `[startup] Reset ${reset.count} upload attempt(s) wedged mid-import by a previous shutdown`,
    );
  }
}

// =============================================================================
// DATA TRANSFORMS: Transform stored JSON data to current schema shape
// =============================================================================

type MigrationResult = {
  name: string;
  success: boolean;
  stats?: MigrationStats;
  error?: Error;
};

type InstanceMigrationFn = (
  tx: Sql,
  countryIso3: string,
) => Promise<MigrationStats>;

const INSTANCE_DATA_TRANSFORMS: { name: string; fn: InstanceMigrationFn }[] = [
  { name: "instance_config", fn: migrateInstanceConfigs },
  { name: "runs_summary", fn: migrateRunSummaries },
  { name: "slide_deck_config", fn: migrateSlideDeckConfigs },
  { name: "slide_config", fn: migrateSlideConfigs },
  { name: "reports", fn: migrateReports },
];

async function runInstanceDataTransforms(
  mainDb: ReturnType<typeof getPgConnectionFromCacheOrNew>,
  countryIso3: string,
): Promise<void> {
  const results: MigrationResult[] = [];

  for (const { name, fn } of INSTANCE_DATA_TRANSFORMS) {
    try {
      let stats: MigrationStats | undefined;
      await mainDb.begin(async (tx) => {
        stats = await fn(tx, countryIso3);
      });
      results.push({ name, success: true, stats });
    } catch (err) {
      results.push({
        name,
        success: false,
        error: err instanceof Error ? err : new Error(String(err)),
      });
    }
  }

  logMigrationResults(results);

  if (results.some((r) => !r.success)) {
    console.error(
      `\n[migration] FAILED — Server will not start. Fix the issues above and redeploy.\n`,
    );
    Deno.exit(1);
  }
}

function logMigrationResults(results: MigrationResult[]): void {
  const hasFailures = results.some((r) => !r.success);
  const totalChecked = results.reduce((sum, r) => sum + (r.stats?.rowsChecked ?? 0), 0);
  const totalTransformed = results.reduce((sum, r) => sum + (r.stats?.rowsTransformed ?? 0), 0);

  // Always log a summary line
  if (hasFailures) {
    console.log(`[migration] Data transforms FAILED`);
  } else {
    console.log(`[migration] Data transforms ${totalChecked} checked, ${totalTransformed} transformed`);
  }

  // Show details only when there are transforms or failures
  if (totalTransformed > 0 || hasFailures) {
    for (const r of results) {
      if (r.success) {
        const stats = r.stats;
        if (stats && stats.rowsTransformed > 0) {
          console.log(
            `  ✓ ${r.name} (${stats.rowsChecked} rows checked, ${stats.rowsTransformed} transformed)`,
          );
        }
      } else {
        console.error(`  ✗ ${r.name}`);
        if (r.error) {
          console.error(`    Error: ${r.error.message}`);
        }
      }
    }
  }
}

function getInitialUsersInsertStatements(): string {
  try {
    return H_USERS.map(
      (email) =>
        `INSERT INTO users (email, is_admin) VALUES ('${email}', TRUE) ON CONFLICT DO NOTHING;`,
    ).join("\n");
  } catch {
    return "";
  }
}

function getDefaultInstanceConfigInsertStatement(): string {
  const structureSchemaValue: StructureSchema = {
    adminDepth: 4,
    includeNames: false,
    includeTypes: false,
    includeOwnership: false,
    includeCustom1: false,
    includeCustom2: false,
    includeCustom3: false,
    includeCustom4: false,
    includeCustom5: false,
  };

  const adminAreaLabelsValue: InstanceConfigAdminAreaLabels = {};

  return `
INSERT INTO instance_config (config_key, config_json_value)
VALUES
  ('structure_schema_hmis', '${JSON.stringify(structureSchemaValue)}'),
  ('structure_schema_hfa', '${JSON.stringify(structureSchemaValue)}'),
  ('admin_area_labels', '${JSON.stringify(adminAreaLabelsValue)}');
`;
}

function getDefaultIndicatorsInsertStatement(): string {
  const valueRows = _COMMON_INDICATORS.map((ind) => {
    return `('${ind.value}', '${escapeSqlString(ind.label)}', TRUE)`;
  });

  return `
INSERT INTO indicators (indicator_common_id, indicator_common_label, is_default)
VALUES
  ${valueRows.join(",\n  ")}
ON CONFLICT (indicator_common_id) DO NOTHING;
`;
}
