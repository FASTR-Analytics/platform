import {
  _COMMON_INDICATORS,
  H_USERS,
  MODULE_REGISTRY,
  type InstanceConfigAdminAreaLabels,
  type InstanceConfigCountryIso3,
  type InstanceConfigFacilityColumns,
  type InstanceConfigMaxAdminArea,
} from "lib";
import { uninstallModule } from "./db/project/modules.ts";
import {
  runInstanceMigrations,
  runProjectMigrations,
} from "./db/migrations/runner.ts";
import { getPgConnectionFromCacheOrNew } from "./db/mod.ts";
import type { Sql } from "postgres";
import {
  migratePOConfigs,
  type MigrationStats,
} from "./db/migrations/data_transforms/po_config.ts";
import { migrateModuleDefinitions } from "./db/migrations/data_transforms/module_definition.ts";
import { migrateMetricsColumns } from "./db/migrations/data_transforms/metric.ts";
import { migrateSlideDeckConfigs } from "./db/migrations/data_transforms/slide_deck_config.ts";
import { migrateSlideConfigs } from "./db/migrations/data_transforms/slide_config.ts";
import { migrateReports } from "./db/migrations/data_transforms/reports.ts";
import { migrateDashboardConfigs } from "./db/migrations/data_transforms/dashboard_config.ts";
import { migrateDashboardItems } from "./db/migrations/data_transforms/dashboard_items.ts";
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

  // Instance data transforms — on main database
  await runInstanceDataTransforms(sqlMain);

  const projects = await sqlMain<{ id: string }[]>`SELECT id FROM projects`;
  for (const project of projects) {
    const projectDb = getPgConnectionFromCacheOrNew(
      project.id,
      "READ_AND_WRITE",
    );
    // Must run BEFORE project migrations: migration 023 drops dashboards.slug,
    // so the registry copy has to happen while the column still exists.
    await backfillDashboardSlugsToMain(sqlMain, projectDb, project.id);
    await runProjectMigrations(projectDb);

    // Project data transforms — each in its own transaction
    await runProjectDataTransforms(project.id, projectDb);

    // =========================================================================
    // TEMPORARY: Remove after all ~5 production instances have been updated
    // Added: 2025-05-20 for hfa001 → m010 rename
    // This uninstalls any modules not in MODULE_REGISTRY (orphaned modules)
    // =========================================================================
    await cleanupOrphanModules(projectDb);

    // =========================================================================
    // TEMPORARY: Remove after all production instances have been updated
    // Added: 2026-06-10 — see cleanupOrphanedPresentationObjects
    // =========================================================================
    await cleanupOrphanedPresentationObjects(projectDb);
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

type InstanceMigrationFn = (tx: Sql) => Promise<MigrationStats>;
type ProjectMigrationFn = (tx: Sql, projectId: string) => Promise<MigrationStats>;

const INSTANCE_DATA_TRANSFORMS: { name: string; fn: InstanceMigrationFn }[] = [
  { name: "instance_config", fn: migrateInstanceConfigs },
];

const PROJECT_DATA_TRANSFORMS: { name: string; fn: ProjectMigrationFn }[] = [
  { name: "po_config", fn: migratePOConfigs },
  { name: "module_definition", fn: migrateModuleDefinitions },
  { name: "metrics_columns", fn: migrateMetricsColumns },
  { name: "slide_deck_config", fn: migrateSlideDeckConfigs },
  { name: "slide_config", fn: migrateSlideConfigs },
  { name: "reports", fn: migrateReports },
  { name: "dashboard_config", fn: migrateDashboardConfigs },
  { name: "dashboard_items", fn: migrateDashboardItems },
];

async function runInstanceDataTransforms(
  mainDb: ReturnType<typeof getPgConnectionFromCacheOrNew>,
): Promise<void> {
  const results: MigrationResult[] = [];

  for (const { name, fn } of INSTANCE_DATA_TRANSFORMS) {
    try {
      let stats: MigrationStats | undefined;
      await mainDb.begin(async (tx) => {
        stats = await fn(tx);
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

  logMigrationResults("instance", results);

  if (results.some((r) => !r.success)) {
    console.error(
      `\n[migration] FAILED — Server will not start. Fix the issues above and redeploy.\n`,
    );
    Deno.exit(1);
  }
}

async function runProjectDataTransforms(
  projectId: string,
  projectDb: ReturnType<typeof getPgConnectionFromCacheOrNew>,
): Promise<void> {
  const results: MigrationResult[] = [];

  for (const { name, fn } of PROJECT_DATA_TRANSFORMS) {
    try {
      let stats: MigrationStats | undefined;
      await projectDb.begin(async (tx) => {
        stats = await fn(tx, projectId);
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

  // Log results
  logMigrationResults(projectId, results);

  // Exit if any failed
  if (results.some((r) => !r.success)) {
    console.error(
      `\n[migration] FAILED — Server will not start. Fix the issues above and redeploy.\n`,
    );
    Deno.exit(1);
  }
}

function logMigrationResults(
  projectId: string,
  results: MigrationResult[],
): void {
  const hasFailures = results.some((r) => !r.success);
  const totalChecked = results.reduce((sum, r) => sum + (r.stats?.rowsChecked ?? 0), 0);
  const totalTransformed = results.reduce((sum, r) => sum + (r.stats?.rowsTransformed ?? 0), 0);

  // Always log a summary line
  if (hasFailures) {
    console.log(`[migration] Project ${projectId.slice(0, 8)}... FAILED`);
  } else if (totalTransformed > 0) {
    console.log(`[migration] Project ${projectId.slice(0, 8)}... ${totalChecked} checked, ${totalTransformed} transformed`);
  } else {
    console.log(`[migration] Project ${projectId.slice(0, 8)}... ${totalChecked} checked, 0 transformed`);
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
  const adminAreaValue: InstanceConfigMaxAdminArea = {
    maxAdminArea: 4,
  };

  const facilityColumnsValue: InstanceConfigFacilityColumns = {
    includeNames: false,
    includeTypes: false,
    includeOwnership: false,
    includeCustom1: false,
    includeCustom2: false,
    includeCustom3: false,
    includeCustom4: false,
    includeCustom5: false,
  };

  const countryIso3Value: InstanceConfigCountryIso3 = {
    countryIso3: undefined,
  };

  const adminAreaLabelsValue: InstanceConfigAdminAreaLabels = {};

  return `
INSERT INTO instance_config (config_key, config_json_value)
VALUES
  ('max_admin_area', '${JSON.stringify(adminAreaValue)}'),
  ('facility_columns', '${JSON.stringify(facilityColumnsValue)}'),
  ('country_iso3', '${JSON.stringify(countryIso3Value)}'),
  ('admin_area_labels', '${JSON.stringify(adminAreaLabelsValue)}');
`;
}

function getDefaultIndicatorsInsertStatement(): string {
  const valueRows = _COMMON_INDICATORS.map((ind) => {
    // Escape single quotes in labels
    const escapedLabel = ind.label.replace(/'/g, "''");
    return `('${ind.value}', '${escapedLabel}', TRUE)`;
  });

  return `
INSERT INTO indicators (indicator_common_id, indicator_common_label, is_default)
VALUES
  ${valueRows.join(",\n  ")}
ON CONFLICT (indicator_common_id) DO NOTHING;
`;
}

// =============================================================================
// TEMPORARY: Remove once every instance has deployed past the dashboard-slug
// move (project migration 023 drops dashboards.slug). The public slug now lives
// in the main DB (dashboard_slugs); this copies each existing project's slugs
// into that registry BEFORE 023 removes the column, so existing public
// dashboard links keep resolving under the new /d/:slug routing. Idempotent:
// once the column is gone (re-deploy / fresh DB) it does nothing.
// =============================================================================
async function backfillDashboardSlugsToMain(
  mainDb: Sql,
  projectDb: Sql,
  projectId: string,
): Promise<void> {
  const hasSlug = await projectDb`
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'dashboards' AND column_name = 'slug'
  `;
  if (hasSlug.length === 0) return;

  const rows = await projectDb<{ id: string; slug: string }[]>`
    SELECT id, slug FROM dashboards
  `;
  for (const row of rows) {
    const res = await mainDb`
      INSERT INTO dashboard_slugs (slug, project_id, dashboard_id)
      VALUES (${row.slug}, ${projectId}, ${row.id})
      ON CONFLICT DO NOTHING
    `;
    if (res.count === 0) {
      console.warn(
        `[dashboard-slug-backfill] slug "${row.slug}" (project ${projectId.slice(0, 8)}, dashboard ${row.id}) not registered — already taken globally. Re-slug it to restore its public link.`,
      );
    }
  }
}

// =============================================================================
// TEMPORARY: Remove this function after all ~5 production instances updated
// Added: 2025-05-20 for hfa001 → m010 rename
// =============================================================================
async function cleanupOrphanModules(projectDb: Sql): Promise<void> {
  const validIds = MODULE_REGISTRY.map((m) => m.id);
  const installed = await projectDb<{ id: string }[]>`SELECT id FROM modules`;

  for (const mod of installed) {
    if (!validIds.includes(mod.id as typeof validIds[number])) {
      console.log(`[cleanup] Removing orphan module: ${mod.id}`);
      await uninstallModule(projectDb, mod.id);
    }
  }
}

// =============================================================================
// TEMPORARY: Remove this function after all production instances updated
// Added: 2026-06-10 — purge presentation objects whose metric no longer exists
// in the project (orphaned by uninstalls/metric renames before install/update/
// uninstall purged them). 240 such rows found across 21 instances.
// =============================================================================
async function cleanupOrphanedPresentationObjects(
  projectDb: Sql,
): Promise<void> {
  const del = await projectDb`
    DELETE FROM presentation_objects
    WHERE metric_id NOT IN (SELECT id FROM metrics)
  `;
  if (del.count > 0) {
    console.log(
      `[cleanup] Removed ${del.count} orphaned visualization(s) with no matching metric`,
    );
  }
}
