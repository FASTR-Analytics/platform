// Boots the server's database startup against an EMPTY postgres and asserts
// an empty dictionary (PLAN_A6 ruling 10): no indicator rows, no sum
// members, and none of the retired tables. Run through
// ./validate_fresh_boot, which supplies the throwaway container and the env.

import { assertEquals } from "@std/assert";
import { dbStartUp } from "./server/db_startup.ts";
import {
  closeAllConnections,
  getPgConnectionFromCacheOrNew,
} from "./server/db/postgres/connection_manager.ts";

await dbStartUp();

const sql = getPgConnectionFromCacheOrNew("main", "READ_AND_WRITE");
const indicators = await sql<{ n: number }[]>`SELECT COUNT(*)::int AS n FROM indicators`;
const members = await sql<{ n: number }[]>`SELECT COUNT(*)::int AS n FROM indicator_sum_members`;
const oldTables = await sql<{ table_name: string }[]>`
  SELECT table_name FROM information_schema.tables
  WHERE table_schema = 'public'
    AND table_name IN ('indicator_sources', 'indicators_raw', 'indicator_mappings')
`;
await closeAllConnections();

assertEquals(indicators[0].n, 0, "a fresh database has an empty dictionary");
assertEquals(members[0].n, 0, "no sum members");
assertEquals(
  oldTables.map((t) => t.table_name),
  [],
  "no indicator_sources, indicators_raw or indicator_mappings table",
);
console.log("Fresh boot: an empty dictionary, no sum members, none of the retired tables.");
Deno.exit(0);
