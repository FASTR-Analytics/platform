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
  type ProjectWindow,
  projectWindow,
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

function hmis(windowing: Record<string, unknown>) {
  return { datasetType: "hmis", windowing: { ...allOf, ...windowing } };
}

function limited(
  hmisPart: { adminArea2?: string; indicators?: string[]; start?: number },
  hfaArea: string | null,
): ProjectWindow {
  return {
    kind: "limited",
    definition: {
      hmis: {
        include: true,
        modules: null,
        indicators: hmisPart.indicators ?? null,
        adminArea2: hmisPart.adminArea2 ?? null,
        years: hmisPart.start === undefined
          ? null
          : { start: hmisPart.start, end: 9999 },
      },
      hfa: {
        include: true,
        modules: null,
        indicators: null,
        adminArea2: hfaArea,
        timePoints: null,
        categories: null,
        serviceCategories: null,
      },
      iceh: { include: true, modules: null, indicators: null, years: null },
    },
  };
}

Deno.test("a project area holds both families, data or not", () => {
  assertEquals(
    projectWindow("South West Zone", [], 2020),
    limited({ adminArea2: "South West Zone" }, "South West Zone"),
  );
});

Deno.test("a project with no data has no window", () => {
  assertEquals(projectWindow(null, [], 2020), { kind: "none" });
});

Deno.test("a state window resolves to the state's zone", () => {
  assertEquals(
    projectWindow(null, [
      hmis({
        takeAllAdminArea3s: false,
        adminArea3sToInclude: [
          "kd Kaduna State|||North West Zone",
          "kn Kano State|||North West Zone",
        ],
      }),
    ], 2020),
    limited({ adminArea2: "North West Zone" }, "North West Zone"),
  );
});

Deno.test("several zones limit no geography", () => {
  assertEquals(
    projectWindow(null, [
      hmis({ takeAllAdminArea2s: false, adminArea2sToInclude: ["A", "B"] }),
    ], 2020),
    { kind: "national" },
  );
});

Deno.test("indicators and a later start year carry over", () => {
  assertEquals(
    projectWindow(null, [
      hmis({
        start: 202205,
        takeAllAdminArea2s: false,
        adminArea2sToInclude: ["A", "B"],
        takeAllIndicators: false,
        indicatorType: "common",
        commonIndicatorsToInclude: ["anc4", "anc1", "anc1"],
      }),
    ], 2020),
    limited({ indicators: ["anc1", "anc4"], start: 2022 }, null),
  );
});

Deno.test("a window starting in the first data year limits no years", () => {
  assertEquals(
    projectWindow(null, [hmis({ start: 202001 })], 2020),
    { kind: "national" },
  );
  assertEquals(
    projectWindow(null, [hmis({ start: 202401 })], null),
    { kind: "national" },
  );
});

Deno.test("raw-indicator lists have no scope dimension", () => {
  assertEquals(
    projectWindow(null, [
      hmis({
        takeAllIndicators: false,
        indicatorType: "raw",
        indicatorsToInclude: ["x"],
      }),
    ], 2020),
    { kind: "national" },
  );
});

Deno.test("an HFA dataset keeps HFA whole beside an HMIS zone", () => {
  assertEquals(
    projectWindow(null, [
      hmis({
        takeAllAdminArea3s: false,
        adminArea3sToInclude: ["ba Bauchi State|||North East Zone"],
      }),
      { datasetType: "hfa", windowing: null },
    ], 2020),
    limited({ adminArea2: "North East Zone" }, null),
  );
});
