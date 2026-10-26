// Pins the stored-code rewrite from R's list test to the language's:
// `x %in% c(...)` becomes `x IN (...)`, whatever the spacing and nesting,
// quoted text is untouched, a second pass changes nothing, and the reverse
// direction restores what the forward one wrote. The migration itself runs
// on a throwaway database built from _main_database.sql on the dev postgres
// (the .env the test task loads), dropped afterwards, over all three code
// columns, twice.
//
//   deno test -A --env-file server/tests/hfa_code_migration_test.ts

import { assertEquals } from "@std/assert";
import { parseHfaIndicatorCode } from "lib";
import {
  migrateHfaCodeToLanguageLists,
  rewriteHfaListSyntax,
} from "../db/migrations/data_transforms/hfa_code.ts";
import { getPgConnection } from "../db/postgres/connection_manager.ts";

const forward = (source: string) =>
  rewriteHfaListSyntax(source, "r", "language");

Deno.test("a plain list", () => {
  assertEquals(forward("x %in% c(1, 2)"), "x IN (1, 2)");
});

Deno.test("nested parentheses inside the list", () => {
  assertEquals(
    forward("x %in% c((1 + 2), 3 * (4 - 1))"),
    "x IN ((1 + 2), 3 * (4 - 1))",
  );
});

Deno.test("odd spacing around %in% and c(", () => {
  assertEquals(forward("x%in%c(1,2)"), "x IN (1,2)");
  assertEquals(forward("x   %in%   c  ( 1 )"), "x IN ( 1 )");
  assertEquals(forward("x\n%in%\nc(1)"), "x IN (1)");
});

Deno.test("two lists in one snippet", () => {
  assertEquals(
    forward("a %in% c(1, 2) & b %in% c(3)"),
    "a IN (1, 2) & b IN (3)",
  );
});

Deno.test("a snippet with no list is unchanged", () => {
  for (const source of ["a == 1 & b > 2", "(a + b) / 2", ""]) {
    assertEquals(forward(source), source);
  }
});

Deno.test("a filter with text values", () => {
  const filter = 'sh_03 %in% c("c", "d", "h_ml")';
  assertEquals(forward(filter), 'sh_03 IN ("c", "d", "h_ml")');
  assertEquals(parseHfaIndicatorCode(forward(filter)).ok, true);
});

Deno.test("quoted text is never rewritten", () => {
  assertEquals(
    forward('x %in% c("%in% c(", "IN (")'),
    'x IN ("%in% c(", "IN (")',
  );
});

Deno.test("a second pass changes nothing, and the reverse restores R", () => {
  const source = "a %in% c(1, 2) & !(b %in% c(3))";
  const once = forward(source);
  assertEquals(forward(once), once);
  assertEquals(rewriteHfaListSyntax(once, "language", "r"), source);
});

const SCHEMA_PATH =
  new URL("../db/instance/_main_database.sql", import.meta.url).pathname;
const DB_PREFIX = "hfa_code_migration_test_";

Deno.test("the migration rewrites code, filter and variant code, and is idempotent", async () => {
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
  try {
    await db.file(SCHEMA_PATH);
    await db`
      INSERT INTO hfa_time_points (label, period_id, sort_order)
      VALUES ('2024', '202401', 1)
    `;
    await db`INSERT INTO hfa_indicator_variant_groups (id, label) VALUES ('g', 'G')`;
    await db`
      INSERT INTO hfa_indicator_variant_items (id, group_id, label)
      VALUES ('item_a', 'g', 'A')
    `;
    await db`
      INSERT INTO hfa_indicators (indicator_id, type, variant_group_id)
      VALUES ('ind001', 'binary', 'g'), ('ind002', 'binary', NULL)
    `;
    await db`
      INSERT INTO hfa_indicator_code (indicator_id, time_point, r_code, r_filter_code)
      VALUES
        ('ind001', '2024', 'q1 %in% c(1, 2)', 'sh_03 %in% c("c", "d")'),
        ('ind002', '2024', 'q2 == 1 & q3 > 0', NULL)
    `;
    await db`
      INSERT INTO hfa_indicator_variant_code (indicator_id, time_point, item_id, r_code)
      VALUES ('ind001', '2024', 'item_a', 'q4 %in% c(3)')
    `;

    const read = async () => ({
      code: await db<{ r_code: string; r_filter_code: string | null }[]>`
        SELECT r_code, r_filter_code FROM hfa_indicator_code
        ORDER BY indicator_id
      `.then((rows) => rows.map((r) => [r.r_code, r.r_filter_code])),
      variant: await db<{ r_code: string }[]>`
        SELECT r_code FROM hfa_indicator_variant_code
      `.then((rows) => rows.map((r) => r.r_code)),
    });
    const expected = {
      code: [
        ["q1 IN (1, 2)", 'sh_03 IN ("c", "d")'],
        ["q2 == 1 & q3 > 0", null],
      ],
      variant: ["q4 IN (3)"],
    };

    await db.begin((tx) => migrateHfaCodeToLanguageLists(tx));
    assertEquals(await read(), expected);
    await db.begin((tx) => migrateHfaCodeToLanguageLists(tx));
    assertEquals(await read(), expected);
  } finally {
    await db.end();
    await admin.unsafe(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
    await admin.end();
  }
});
