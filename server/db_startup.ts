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
    await migrateReportItemsToNestedLayout(projectDb);
  }
}

// =============================================================================
// TEMPORARY MIGRATION - Remove after all instances have run
// Added: 2025-01-16
//
// This migrates report item content from 2D array format to nested layout tree.
// Safe to remove once all servers have started at least once with this code.
//
// To check if migration is complete, run against each project database:
//   SELECT COUNT(*) FROM report_items WHERE config LIKE '%"content":[[%';
// If count is 0, this migration can be deleted.
// =============================================================================
async function migrateReportItemsToNestedLayout(
  sql: ReturnType<typeof getPgConnectionFromCacheOrNew>
) {
  const rows = await sql<
    { id: string; config: string }[]
  >`SELECT id, config FROM report_items`;

  let migrated = 0;
  let fixed = 0;
  for (const row of rows) {
    const config = JSON.parse(row.config);

    // Migrate from 2D array format
    if (Array.isArray(config.freeform?.content)) {
      // Transform 2D array to panther LayoutNode structure
      // In panther: "rows" = children stacked vertically, "cols" = children side by side
      // So root is "rows" (stack visual rows vertically), each visual row is "cols" (items side by side)
      config.freeform.content = {
        type: "rows",
        id: crypto.randomUUID(),
        children: config.freeform.content.map((r: unknown[]) => ({
          type: "cols",
          id: crypto.randomUUID(),
          children: r.map((item: unknown) => ({
            type: "item",
            id: crypto.randomUUID(),
            data: item,
            span: (item as { span?: number }).span,
          })),
        })),
      };
      await sql`UPDATE report_items SET config = ${JSON.stringify(config)} WHERE id = ${row.id}`;
      migrated++;
      continue;
    }

    // Fix items that were incorrectly swapped (root is "cols" instead of "rows")
    const content = config.freeform?.content;
    if (
      content?.type === "cols" &&
      content?.id === "root" &&
      content?.children?.every(
        (c: { type: string }) => c.type === "rows" || c.type === "item"
      )
    ) {
      swapRowColTypes(content);
      await sql`UPDATE report_items SET config = ${JSON.stringify(config)} WHERE id = ${row.id}`;
      fixed++;
    }
  }

  if (migrated > 0) {
    console.log(
      `[MIGRATION] Migrated ${migrated} report items to nested layout`
    );
  }
  if (fixed > 0) {
    console.log(
      `[MIGRATION] Fixed ${fixed} report items with swapped row/col types`
    );
  }
}

function swapRowColTypes(node: { type: string; children?: unknown[] }) {
  if (node.type === "rows") {
    node.type = "cols";
  } else if (node.type === "cols") {
    node.type = "rows";
  }
  if (node.children) {
    for (const child of node.children) {
      if (
        typeof child === "object" &&
        child !== null &&
        "type" in child &&
        (child as { type: string }).type !== "item"
      ) {
        swapRowColTypes(child as { type: string; children?: unknown[] });
      }
    }
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
