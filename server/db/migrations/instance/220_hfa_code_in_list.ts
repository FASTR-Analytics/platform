// Migration 220: stored HFA indicator code moves from R's list test to the
// expression language's, `x %in% c(1, 2)` to `x IN (1, 2)`. The body and
// its reverse are in data_transforms/hfa_code.ts.

import type { Sql } from "postgres";
import { migrateHfaCodeToLanguageLists } from "../data_transforms/hfa_code.ts";

export async function hfaCodeInList(tx: Sql): Promise<void> {
  await migrateHfaCodeToLanguageLists(tx);
}
