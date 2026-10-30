// Pins which org units a dataValueSets pull descends from: the account's
// data-view org units, else its capture org units (goal5 `dataViewRootIds`),
// whose contract is the dispatcher bullet of SYSTEM_06_ingestion.md. Pure: no
// DHIS2, no database.
//
//   deno test -A --env-file server/tests/dhis2_pull_roots_test.ts

import { assertEquals } from "@std/assert";
import { dataViewRootIds } from "../dhis2/goal5_data_value_sets/mod.ts";

Deno.test("the data-view org units are the roots, not the capture org units", () => {
  assertEquals(
    dataViewRootIds({
      dataViewOrganisationUnits: [{ id: "lZsCb6y0KDX" }],
      organisationUnits: [{ id: "vrfUHK4h2lL" }],
    }),
    ["lZsCb6y0KDX"],
  );
});

Deno.test("without data-view org units the capture org units are the roots", () => {
  assertEquals(
    dataViewRootIds({
      dataViewOrganisationUnits: [],
      organisationUnits: [{ id: "a" }, { id: null }, { id: "b" }],
    }),
    ["a", "b"],
  );
  assertEquals(
    dataViewRootIds({
      dataViewOrganisationUnits: null,
      organisationUnits: undefined,
    }),
    [],
  );
});
