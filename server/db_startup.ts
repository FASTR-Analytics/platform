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
