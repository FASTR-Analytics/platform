// Boots the server's database startup against an EMPTY postgres and asserts
// the seed: exactly the special indicators, each an empty base. Run through
// ./validate_fresh_boot, which supplies the throwaway container and the env.

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
  }[]
>`SELECT indicator_common_id, definition_type, expression FROM indicators ORDER BY sort_order, indicator_common_id`;
await closeAllConnections();

assertEquals(
  rows.map((r) => r.indicator_common_id).toSorted(),
  [...SPECIAL_INDICATOR_IDS].toSorted(),
  "a fresh database seeds exactly the special indicator ids",
);
for (const row of rows) {
  assertEquals(
    row.definition_type,
    "base",
    `${row.indicator_common_id} is a base`,
  );
  assertEquals(
    row.expression,
    null,
    `${row.indicator_common_id} has no expression`,
  );
}
console.log(
  `Fresh boot seeded ${rows.length} special indicators as empty bases.`,
);
Deno.exit(0);
