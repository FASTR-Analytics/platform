// Pins PLAN_A5 ruling 1: the dictionary's tables and constraints as
// _main_database.sql declares them, fourteen cases each in its own rolled-back
// transaction on a throwaway database built from _main_database.sql on the
// dev postgres (the .env the test task loads), dropped afterwards.
//
//   deno test -A --env-file server/tests/indicator_schema_test.ts

import { assert, assertEquals, assertRejects, assertStringIncludes } from "@std/assert";
import type { TransactionSql } from "postgres";
import { getPgConnection } from "../db/postgres/connection_manager.ts";

const SCHEMA_PATH = new URL("../db/instance/_main_database.sql", import.meta.url)
  .pathname;
const DB_PREFIX = "schema_test_";

const ELEMENT = "AbCdEfGhIj1";
const OTHER_ELEMENT = "KlMnOpQrSt2";

const admin = getPgConnection("postgres", { max: 1 });
for (
  const { datname } of await admin<{ datname: string }[]>`
    SELECT datname FROM pg_database WHERE datname LIKE ${DB_PREFIX + "%"}
  `
) {
  await admin.unsafe(`DROP DATABASE IF EXISTS ${datname} WITH (FORCE)`);
}
const dbName = `${DB_PREFIX}${Date.now()}`;
await admin.unsafe(`CREATE DATABASE ${dbName}`);
const db = getPgConnection(dbName, { max: 2 });
await db.file(SCHEMA_PATH);

class Rollback extends Error {}

// Runs `fn` in a transaction that is always rolled back, so every case
// starts from the same seed.
async function rolledBack(fn: (sql: TransactionSql) => Promise<void>): Promise<void> {
  try {
    await db.begin(async (sql) => {
      await seed(sql);
      await fn(sql);
      throw new Rollback();
    });
  } catch (e) {
    if (!(e instanceof Rollback)) throw e;
  }
}

// An element with rows, an Uploaded with rows, an Uploaded with no data id,
// a sum over the first two, and a derived.
async function seed(sql: TransactionSql): Promise<void> {
  await sql`
    INSERT INTO admin_areas_hmis_1 (admin_area_1) VALUES ('A1')
    ON CONFLICT DO NOTHING
  `;
  await sql`
    INSERT INTO admin_areas_hmis_2 (admin_area_2, admin_area_1) VALUES ('A2', 'A1')
    ON CONFLICT DO NOTHING
  `;
  await sql`
    INSERT INTO admin_areas_hmis_3 (admin_area_3, admin_area_2, admin_area_1) VALUES ('A3', 'A2', 'A1')
    ON CONFLICT DO NOTHING
  `;
  await sql`
    INSERT INTO admin_areas_hmis_4 (admin_area_4, admin_area_3, admin_area_2, admin_area_1) VALUES ('A4', 'A3', 'A2', 'A1')
    ON CONFLICT DO NOTHING
  `;
  await sql`
    INSERT INTO facilities_hmis (facility_id, admin_area_4, admin_area_3, admin_area_2, admin_area_1)
    VALUES ('FacAaaaaaa1', 'A4', 'A3', 'A2', 'A1')
    ON CONFLICT DO NOTHING
  `;
  await sql`
    INSERT INTO dataset_hmis_versions (id, n_rows_total_imported) VALUES (1, 0)
    ON CONFLICT DO NOTHING
  `;
  await sql`
    INSERT INTO indicators (indicator_common_id, indicator_common_label, definition_type, data_id, expression)
    VALUES
      ('elem', 'Element', 'dhis2_element', ${ELEMENT}, NULL),
      ('up', 'Uploaded', 'uploaded', 'UP_FILE', NULL),
      ('empty', 'Empty', 'uploaded', NULL, NULL),
      ('total', 'Total', 'sum', NULL, NULL),
      ('rate', 'Rate', 'derived', NULL, 'elem / up')
  `;
  await sql`UPDATE indicators SET format_as = 'percent' WHERE indicator_common_id = 'rate'`;
  await sql`
    INSERT INTO indicator_sum_members (sum_id, member_id) VALUES ('total', 'elem'), ('total', 'up')
  `;
  await sql`
    INSERT INTO dataset_hmis (facility_id, data_id, period_id, count, version_id)
    VALUES ('FacAaaaaaa1', ${ELEMENT}, 202401, 3, 1), ('FacAaaaaaa1', 'UP_FILE', 202401, 4, 1)
  `;
}

async function refused(
  sql: TransactionSql,
  statement: () => Promise<unknown>,
  ...messageParts: string[]
): Promise<void> {
  const err = await assertRejects(() =>
    sql.savepoint(async () => {
      await statement();
    })
  );
  const message = err instanceof Error ? err.message : String(err);
  for (const part of messageParts) assertStringIncludes(message, part);
}

Deno.test("1: a sum over an element and an Uploaded is accepted", async () => {
  await rolledBack(async (sql) => {
    await sql`INSERT INTO indicators (indicator_common_id, indicator_common_label, definition_type) VALUES ('s2', 'S2', 'sum')`;
    await sql`INSERT INTO indicator_sum_members (sum_id, member_id) VALUES ('s2', 'elem'), ('s2', 'up')`;
    const members = await sql<{ member_id: string }[]>`SELECT member_id FROM indicator_sum_members WHERE sum_id = 's2' ORDER BY 1`;
    assertEquals(members.map((m) => m.member_id), ["elem", "up"]);
  });
});

Deno.test("2: a sum over a sum is refused by the FK", async () => {
  await rolledBack(async (sql) => {
    await sql`INSERT INTO indicators (indicator_common_id, indicator_common_label, definition_type) VALUES ('s2', 'S2', 'sum')`;
    await refused(sql, () => sql`INSERT INTO indicator_sum_members (sum_id, member_id) VALUES ('s2', 'total')`, "indicator_sum_members_member_fkey");
  });
});

Deno.test("3: a sum over a derived is refused by the FK", async () => {
  await rolledBack(async (sql) => {
    await sql`INSERT INTO indicators (indicator_common_id, indicator_common_label, definition_type) VALUES ('s2', 'S2', 'sum')`;
    await refused(sql, () => sql`INSERT INTO indicator_sum_members (sum_id, member_id) VALUES ('s2', 'rate')`, "indicator_sum_members_member_fkey");
  });
});

// The member FK is NO ACTION, checked per row at the end of the statement
// in row order, so deleting a sum and its member in one statement passes
// only when the sum's row is scanned first: deleteIndicators removes the
// sums' junction rows before the indicators, and that is what is pinned.
Deno.test("4: deleting a member a sum names is refused; the sum's junction rows removed first, both go", async () => {
  await rolledBack(async (sql) => {
    await sql`DELETE FROM dataset_hmis WHERE data_id = 'UP_FILE'`;
    await refused(sql, () => sql`DELETE FROM indicators WHERE indicator_common_id = 'up'`, "indicator_sum_members_member_fkey");
    await sql`DELETE FROM indicator_sum_members WHERE sum_id = 'total'`;
    await sql`DELETE FROM indicators WHERE indicator_common_id IN ('total', 'up')`;
    const left = await sql<{ n: number }[]>`SELECT COUNT(*)::int AS n FROM indicator_sum_members`;
    assertEquals(left[0].n, 0);
  });
});

Deno.test("5: renaming a member cascades into the junction and touches no data row", async () => {
  await rolledBack(async (sql) => {
    const before = await sql<{ md5: string }[]>`SELECT md5(string_agg(facility_id || data_id || period_id || count, ',' ORDER BY data_id)) AS md5 FROM dataset_hmis`;
    await sql`UPDATE indicators SET indicator_common_id = 'element_renamed' WHERE indicator_common_id = 'elem'`;
    const members = await sql<{ member_id: string }[]>`SELECT member_id FROM indicator_sum_members WHERE sum_id = 'total' ORDER BY 1`;
    assertEquals(members.map((m) => m.member_id), ["element_renamed", "up"]);
    const after = await sql<{ md5: string }[]>`SELECT md5(string_agg(facility_id || data_id || period_id || count, ',' ORDER BY data_id)) AS md5 FROM dataset_hmis`;
    assertEquals(after[0].md5, before[0].md5);
  });
});

Deno.test("6: retyping a member to derived while a sum names it is refused (has_rows flips)", async () => {
  await rolledBack(async (sql) => {
    await sql`DELETE FROM dataset_hmis WHERE data_id = 'UP_FILE'`;
    await refused(
      sql,
      () => sql`UPDATE indicators SET definition_type = 'derived', data_id = NULL, expression = 'elem * 2' WHERE indicator_common_id = 'up'`,
      "indicator_sum_members_member_has_rows_check",
    );
  });
});

Deno.test("7: a DHIS2 element with a non-UID data id is refused by CHECK", async () => {
  await rolledBack(async (sql) => {
    await refused(
      sql,
      () => sql`INSERT INTO indicators (indicator_common_id, indicator_common_label, definition_type, data_id) VALUES ('bad', 'Bad', 'dhis2_element', 'not-a-uid')`,
      "indicators_element_shape_check",
    );
  });
});

Deno.test("8: a sum with a data id is refused by CHECK", async () => {
  await rolledBack(async (sql) => {
    await refused(
      sql,
      () => sql`INSERT INTO indicators (indicator_common_id, indicator_common_label, definition_type, data_id) VALUES ('bad', 'Bad', 'sum', ${OTHER_ELEMENT})`,
      "indicators_fields_check",
    );
  });
});

Deno.test("9: deleting an element with rows is refused by RESTRICT", async () => {
  await rolledBack(async (sql) => {
    await sql`DELETE FROM indicator_sum_members WHERE member_id = 'elem'`;
    await refused(sql, () => sql`DELETE FROM indicators WHERE indicator_common_id = 'elem'`, "dataset_hmis_data_id_fkey");
  });
});

Deno.test("10: writing has_rows is refused, generated column", async () => {
  await rolledBack(async (sql) => {
    await refused(sql, () => sql`UPDATE indicators SET has_rows = FALSE WHERE indicator_common_id = 'elem'`, "can only be updated to DEFAULT");
  });
});

Deno.test("11: switching an element with rows to Uploaded is accepted and touches no row", async () => {
  await rolledBack(async (sql) => {
    await sql`UPDATE indicators SET definition_type = 'uploaded' WHERE indicator_common_id = 'elem'`;
    const rows = await sql<{ n: number }[]>`SELECT COUNT(*)::int AS n FROM dataset_hmis WHERE data_id = ${ELEMENT}`;
    assertEquals(rows[0].n, 1);
    const row = await sql<{ has_rows: boolean; is_count: boolean }[]>`SELECT has_rows, is_count FROM indicators WHERE indicator_common_id = 'elem'`;
    assertEquals(row[0], { has_rows: true, is_count: true });
  });
});

Deno.test("12: changing a data id that has rows is refused by the data FK", async () => {
  await rolledBack(async (sql) => {
    await refused(sql, () => sql`UPDATE indicators SET data_id = ${OTHER_ELEMENT} WHERE indicator_common_id = 'elem'`, "dataset_hmis_data_id_fkey");
  });
});

Deno.test("13: changing one that has no rows is accepted", async () => {
  await rolledBack(async (sql) => {
    await sql`UPDATE indicators SET data_id = 'EMPTY_FILE' WHERE indicator_common_id = 'empty'`;
    await sql`UPDATE indicators SET data_id = NULL WHERE indicator_common_id = 'empty'`;
    const row = await sql<{ data_id: string | null }[]>`SELECT data_id FROM indicators WHERE indicator_common_id = 'empty'`;
    assertEquals(row[0].data_id, null);
  });
});

Deno.test("14: taking a data id another indicator holds is refused by UNIQUE", async () => {
  await rolledBack(async (sql) => {
    await refused(sql, () => sql`UPDATE indicators SET data_id = ${ELEMENT} WHERE indicator_common_id = 'empty'`, "indicators_data_id_key");
  });
});

Deno.test("the count format rule holds in the table", async () => {
  await rolledBack(async (sql) => {
    await refused(sql, () => sql`UPDATE indicators SET format_as = 'percent' WHERE indicator_common_id = 'total'`, "indicators_count_format_check");
    assert(true);
  });
});

Deno.test("the count thresholds rule holds in the table", async () => {
  await rolledBack(async (sql) => {
    await refused(sql, () => sql`UPDATE indicators SET thresholds = '{}' WHERE indicator_common_id = 'total'`, "indicators_count_thresholds_check");
    await sql`UPDATE indicators SET thresholds = '{}' WHERE indicator_common_id = 'rate'`;
    assert(true);
  });
});

Deno.test("cleanup: drop the throwaway database", async () => {
  await db.end();
  await admin.unsafe(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
  await admin.end();
});
