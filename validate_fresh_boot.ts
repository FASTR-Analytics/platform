// Boots the server's database startup against an EMPTY postgres and asserts
// the seed: exactly the special indicators, each an empty base with its
// checkbox on, and no indicator_sources table (PLAN_A4 §5 gate 4). Run
// through ./validate_fresh_boot, which supplies the throwaway container and
// the env.

import { assertEquals } from "@std/assert";
import { SPECIAL_INDICATOR_IDS } from "lib";
import { dbStartUp } from "./server/db_startup.ts";
import {
  closeAllConnections,
  getPgConnectionFromCacheOrNew,
} from "./server/db/postgres/connection_manager.ts";

await dbStartUp();

const sql = getPgConnectionFromCacheOrNew("main", "READ_AND_WRITE");
const rows = await sql<
  {
    indicator_common_id: string;
    definition_type: string;
    expression: string | null;
    dhis2_id: string | null;
    members: string | null;
    include_in_analysis: boolean;
  }[]
>`SELECT indicator_common_id, definition_type, expression, dhis2_id, members, include_in_analysis FROM indicators ORDER BY sort_order, indicator_common_id`;
const oldTables = await sql<{ table_name: string }[]>`
  SELECT table_name FROM information_schema.tables
  WHERE table_schema = 'public'
    AND table_name IN ('indicator_sources', 'indicators_raw', 'indicator_mappings')
`;
await closeAllConnections();

assertEquals(
  rows.map((r) => r.indicator_common_id).toSorted(),
  [...SPECIAL_INDICATOR_IDS].toSorted(),
  "a fresh database seeds exactly the special indicator ids",
);
for (const row of rows) {
  assertEquals(row.definition_type, "base", `${row.indicator_common_id} is a base`);
  assertEquals(row.expression, null, `${row.indicator_common_id} has no expression`);
  assertEquals(row.dhis2_id, null, `${row.indicator_common_id} has no DHIS2 id`);
  assertEquals(row.members, null, `${row.indicator_common_id} has no members`);
  assertEquals(
    row.include_in_analysis,
    true,
    `${row.indicator_common_id} is in the analysis`,
  );
}
assertEquals(
  oldTables.map((t) => t.table_name),
  [],
  "no indicator_sources, indicators_raw or indicator_mappings table",
);
console.log(
  `Fresh boot seeded ${rows.length} special indicators as empty bases, every checkbox on.`,
);
Deno.exit(0);
