import { getPgConnectionFromCacheOrNew } from "./db/mod.ts";
import {
  _COMMON_INDICATORS,
  type InstanceConfigCountryIso3,
  type InstanceConfigFacilityColumns,
  type InstanceConfigMaxAdminArea,
} from "lib";
import {
  runInstanceMigrations,
  runProjectMigrations,
} from "./db/migrations/runner.ts";

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

    const userInserts = await getInitialUsersInsertStatements();

    await sqlMain.unsafe(`
${getDefaultInstanceConfigInsertStatement()}

${getDefaultIndicatorsInsertStatement()}

${userInserts}
`);
  }

  await runInstanceMigrations(sqlMain);

  const projects = await sqlMain<{ id: string }[]>`SELECT id FROM projects`;
  for (const project of projects) {
    const projectDb = getPgConnectionFromCacheOrNew(
      project.id,
      "READ_AND_WRITE"
    );
    await runProjectMigrations(projectDb);
    await migrateToMetricsTables(projectDb);
  }
}


async function getInitialUsersInsertStatements(): Promise<string> {
  try {
    const content = await Deno.readTextFile("./server/initial_users.txt");
    const emails = content
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    return emails
      .map(
        (email) =>
          `INSERT INTO users (email, is_admin) VALUES ('${email}', TRUE) ON CONFLICT DO NOTHING;`
      )
      .join("\n");
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

  return `
INSERT INTO instance_config (config_key, config_json_value)
VALUES
  ('max_admin_area', '${JSON.stringify(adminAreaValue)}'),
  ('facility_columns', '${JSON.stringify(facilityColumnsValue)}'),
  ('country_iso3', '${JSON.stringify(countryIso3Value)}');
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
// DATA MIGRATION: Populate metrics and link presentation_objects
// Added: 2025-02-06
//
// This populates the metrics table from module definitions and links existing
// presentation_objects to their metrics via metric_id.
// =============================================================================
async function migrateToMetricsTables(
  sql: ReturnType<typeof getPgConnectionFromCacheOrNew>
) {
  const MIGRATION_ID = "js_migrate_to_metrics_2025_02";

  // Check if already migrated
  const applied = await sql<{ migration_id: string }[]>`
    SELECT migration_id FROM schema_migrations WHERE migration_id = ${MIGRATION_ID}
  `;
  if (applied.length > 0) {
    return;
  }

  console.log("[MIGRATION] Populating metrics and linking presentation objects...");

  // Run entire migration in a transaction for atomicity
  await sql.begin(async (tx) => {
    // 1. Populate metrics from module definitions
    const modules = await tx<{ id: string; module_definition: string }[]>`
      SELECT id, module_definition FROM modules
    `;

    let metricsInserted = 0;
    for (const mod of modules) {
      const modDef = JSON.parse(mod.module_definition);

      for (const ro of modDef.resultsObjects ?? []) {
        // Ensure results_object exists
        await tx`
          INSERT INTO results_objects (id, module_id, description, column_definitions)
          VALUES (
            ${ro.id},
            ${mod.id},
            ${ro.description ?? ""},
            ${ro.createTableStatementPossibleColumns ? JSON.stringify(ro.createTableStatementPossibleColumns) : null}
          )
          ON CONFLICT (id) DO NOTHING
        `;

        // Insert metrics from resultsValues
        for (const rv of ro.resultsValues ?? []) {
          await tx`
            INSERT INTO metrics (
              id, module_id, label, variant_label, value_func, format_as, value_props,
              period_options, required_disaggregation_options, value_label_replacements,
              post_aggregation_expression, results_object_id, ai_description
            ) VALUES (
              ${rv.id},
              ${mod.id},
              ${rv.label},
              ${rv.variantLabel ?? null},
              ${rv.valueFunc},
              ${rv.formatAs},
              ${JSON.stringify(rv.valueProps)},
              ${JSON.stringify(rv.periodOptions)},
              ${JSON.stringify(
                rv.requiredDisaggregationOptions ??
                rv.disaggregationOptions?.filter((d: {isRequired?: boolean}) => d.isRequired).map((d: {value: string}) => d.value) ??
                []
              )},
              ${rv.valueLabelReplacements ? JSON.stringify(rv.valueLabelReplacements) : null},
              ${rv.postAggregationExpression ? JSON.stringify(rv.postAggregationExpression) : null},
              ${ro.id},
              ${rv.aiDescription ? JSON.stringify(rv.aiDescription) : null}
            )
            ON CONFLICT (id) DO NOTHING
          `;
          metricsInserted++;
        }
      }
    }

    // 2. Link presentation_objects to metrics
    const hasResultsValueColumn = await tx<{ exists: boolean }[]>`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
        AND table_name = 'presentation_objects'
        AND column_name = 'results_value'
      ) as exists
    `;

    let presObjsLinked = 0;
    if (hasResultsValueColumn[0]?.exists) {
      const presObjs = await tx<{ id: string; results_value: string; label: string }[]>`
        SELECT id, results_value, label FROM presentation_objects WHERE metric_id IS NULL
      `;

      for (const po of presObjs) {
        try {
          const parsed = JSON.parse(po.results_value);
          if (parsed?.id) {
            await tx`UPDATE presentation_objects SET metric_id = ${parsed.id} WHERE id = ${po.id}`;
            presObjsLinked++;
          }
        } catch {
          // Invalid JSON - will be caught below
        }
      }

      // Check for orphaned presentation_objects (fail loudly)
      const orphaned = await tx<{ id: string; label: string }[]>`
        SELECT id, label FROM presentation_objects WHERE metric_id IS NULL
      `;
      if (orphaned.length > 0) {
        console.error(`[MIGRATION ERROR] ${orphaned.length} presentation objects couldn't be linked:`);
        for (const po of orphaned) {
          console.error(`  - ${po.id}: ${po.label}`);
        }
        throw new Error("Migration failed: orphaned presentation objects found");
      }

      // Enforce NOT NULL constraint
      await tx`ALTER TABLE presentation_objects ALTER COLUMN metric_id SET NOT NULL`;
    }

    // 3. Drop old columns and indexes (must happen after reading old data)
    await tx`DROP INDEX IF EXISTS idx_presentation_objects_module_id`;
    await tx`DROP INDEX IF EXISTS idx_presentation_objects_results_object_id`;
    await tx`ALTER TABLE presentation_objects DROP COLUMN IF EXISTS module_id`;
    await tx`ALTER TABLE presentation_objects DROP COLUMN IF EXISTS results_object_id`;
    await tx`ALTER TABLE presentation_objects DROP COLUMN IF EXISTS results_value`;

    // 4. Drop unused results_values table
    await tx`DROP TABLE IF EXISTS results_values`;

    // 5. Mark migration complete
    await tx`INSERT INTO schema_migrations (migration_id) VALUES (${MIGRATION_ID})`;

    console.log(`[MIGRATION] Complete: ${metricsInserted} metrics, ${presObjsLinked} presentation objects linked`);
  });
}
