// The one branch of the scope predicate the query rig cannot build a package
// for: a results object whose module the manifest does not hold. The rig's
// package builder always writes the module beside its results object.
//
//   deno test -A --env-file server/tests/scope_predicate_test.ts

import { assertEquals } from "@std/assert";
import {
  ALL_DATA_SCOPE_DEFINITION,
  type RunManifest,
  type RunResultsObject,
} from "lib";
import { scopePredicateFor } from "../run_query/run_read.ts";

const ORPHAN = {
  id: "ro_orphan",
  moduleId: "m_not_in_manifest",
  columns: [{ name: "admin_area_2", duckDbType: "VARCHAR" }],
} as unknown as RunResultsObject;

const MANIFEST = { modules: [], inputFiles: [] } as unknown as RunManifest;

Deno.test("predicate: a results object whose module the manifest lacks is empty, even under All data", () => {
  assertEquals(
    scopePredicateFor(ALL_DATA_SCOPE_DEFINITION, ORPHAN, MANIFEST),
    "FALSE",
  );
});
