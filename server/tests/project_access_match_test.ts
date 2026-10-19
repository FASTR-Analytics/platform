// How the access snapshot reads a project's region for the user-scope
// carry-over, and how it pairs each consolidated project with the root
// folder 201 made for it: by label, with the legacy ids 201 kept breaking a
// tie between projects that share one, and a project left ambiguous unmatched.
//
//   deno test -A --env-file server/tests/project_access_match_test.ts

import { assertEquals } from "@std/assert";
import {
  type AccessProject,
  matchProjectRoots,
  projectRegion,
} from "../db/migrations/consolidation/access.ts";

function project(
  id: string,
  label: string,
  keptRootIds: string[],
  legacyProductCount = 2,
): AccessProject {
  return { id, label, legacyProductCount, keptRootIds: new Set(keptRootIds) };
}

Deno.test("a unique label pairs its project and root", () => {
  const matched = matchProjectRoots(
    [project("p1", "One", ["r1"]), project("p2", "Two", [])],
    [{ id: "r1", label: "One" }, { id: "r2", label: "Two" }],
  );
  assertEquals(Object.fromEntries(matched), { p1: "r1", p2: "r2" });
});

Deno.test("a same-label template copy takes the root the original's kept ids leave", () => {
  const matched = matchProjectRoots(
    [project("p1", "Same", ["r1"]), project("p2", "Same", [])],
    [{ id: "r2", label: "Same" }, { id: "r1", label: "Same" }],
  );
  assertEquals(Object.fromEntries(matched), { p1: "r1", p2: "r2" });
});

Deno.test("same-label projects with their own kept ids each take their root", () => {
  const matched = matchProjectRoots(
    [
      project("p1", "Same", ["r1"]),
      project("p2", "Same", ["r2"]),
      project("p3", "Same", ["r3"]),
    ],
    [
      { id: "r3", label: "Same" },
      { id: "r1", label: "Same" },
      { id: "r2", label: "Same" },
    ],
  );
  assertEquals(Object.fromEntries(matched), { p1: "r1", p2: "r2", p3: "r3" });
});

Deno.test("two same-label copies with no kept ids stay unmatched", () => {
  const matched = matchProjectRoots(
    [
      project("p1", "Same", ["r1"]),
      project("p2", "Same", []),
      project("p3", "Same", []),
    ],
    [
      { id: "r1", label: "Same" },
      { id: "r2", label: "Same" },
      { id: "r3", label: "Same" },
    ],
  );
  assertEquals(Object.fromEntries(matched), { p1: "r1" });
});

Deno.test("a project with no products is not a candidate for a root", () => {
  const matched = matchProjectRoots(
    [
      project("p1", "Same", ["r1"]),
      project("p2", "Same", [], 0),
      project("p3", "Same", []),
    ],
    [{ id: "r1", label: "Same" }, { id: "r3", label: "Same" }],
  );
  assertEquals(Object.fromEntries(matched), { p1: "r1", p3: "r3" });
});

Deno.test("a kept id in another label's root is ignored", () => {
  const matched = matchProjectRoots(
    [project("p1", "One", ["r2"])],
    [{ id: "r1", label: "One" }, { id: "r2", label: "Two" }],
  );
  assertEquals(Object.fromEntries(matched), { p1: "r1" });
});

const allOf = {
  takeAllIndicators: true,
  takeAllAdminArea2s: true,
  adminArea2sToInclude: [],
  takeAllAdminArea3s: true,
  adminArea3sToInclude: [],
};

Deno.test("a project area is its zone, data or not", () => {
  assertEquals(projectRegion("South West Zone", []), {
    kind: "zone",
    zone: "South West Zone",
  });
});

Deno.test("a project with no data has no region", () => {
  assertEquals(projectRegion(null, []), { kind: "none" });
});

Deno.test("a state window resolves to the state's zone", () => {
  assertEquals(
    projectRegion(null, [{
      datasetType: "hmis",
      windowing: {
        ...allOf,
        takeAllAdminArea3s: false,
        adminArea3sToInclude: [
          "kd Kaduna State|||North West Zone",
          "kn Kano State|||North West Zone",
        ],
      },
    }]),
    { kind: "zone", zone: "North West Zone" },
  );
});

Deno.test("one listed zone is that zone; several are national", () => {
  const zones = (list: string[]) =>
    projectRegion(null, [{
      datasetType: "hmis",
      windowing: {
        ...allOf,
        takeAllAdminArea2s: false,
        adminArea2sToInclude: list,
      },
    }]);
  assertEquals(zones(["Cabo Delgado"]), { kind: "zone", zone: "Cabo Delgado" });
  assertEquals(zones(["A", "B"]), { kind: "national" });
});

Deno.test("indicator and year windows alone are national", () => {
  assertEquals(
    projectRegion(null, [{
      datasetType: "hmis",
      windowing: {
        ...allOf,
        start: 202401,
        takeAllIndicators: false,
        commonIndicatorsToInclude: ["anc1"],
      },
    }]),
    { kind: "national" },
  );
});

Deno.test("an unwindowed HFA dataset beside a state window is national", () => {
  assertEquals(
    projectRegion(null, [
      {
        datasetType: "hmis",
        windowing: {
          ...allOf,
          takeAllAdminArea3s: false,
          adminArea3sToInclude: ["ba Bauchi State|||North East Zone"],
        },
      },
      { datasetType: "hfa", windowing: null },
    ]),
    { kind: "national" },
  );
});
