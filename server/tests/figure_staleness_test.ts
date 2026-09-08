// Harness for PLAN_PRODUCTS_RESTRUCTURE step 4's stale predicate: the four
// combinations of matching and mismatching (package, scope) pair, plus the
// transitional missing-field cases, which read as not stale until step 9b
// stamps every stored bundle. The client module has type-only imports, so it
// loads under Deno as it is.
//
//   deno test -A --env-file server/tests/figure_staleness_test.ts

import { assertEquals } from "@std/assert";
import type { FigureBundle, PackageScope } from "lib";
import {
  findStaleFiguresInLayout,
  findStaleFiguresInReport,
  isFigureBundleStale,
} from "../../client/src/generate_visualization/figure_staleness.ts";

const RUN_A = "00000000-0000-4000-8000-00000000000a";
const RUN_B = "00000000-0000-4000-8000-00000000000b";

// The predicate reads only `scope` and `provenance`; the rest of the bundle
// is irrelevant to it, so the fixture carries only those two fields.
function bundle(runId: string | null, scope: { adminArea2: string | null } | undefined): FigureBundle {
  return { provenance: { runId }, scope } as FigureBundle;
}

const CONTAINER: PackageScope = { runId: RUN_A, adminArea2: "Kano" };

Deno.test("stale: matching run and matching scope is not stale", () => {
  assertEquals(isFigureBundleStale(bundle(RUN_A, { adminArea2: "Kano" }), CONTAINER), false);
});

Deno.test("stale: mismatching run with matching scope is stale", () => {
  assertEquals(isFigureBundleStale(bundle(RUN_B, { adminArea2: "Kano" }), CONTAINER), true);
});

Deno.test("stale: matching run with mismatching scope is stale", () => {
  assertEquals(isFigureBundleStale(bundle(RUN_A, { adminArea2: null }), CONTAINER), true);
  assertEquals(isFigureBundleStale(bundle(RUN_A, { adminArea2: "Lagos" }), CONTAINER), true);
});

Deno.test("stale: mismatching run and mismatching scope is stale", () => {
  assertEquals(isFigureBundleStale(bundle(RUN_B, { adminArea2: null }), CONTAINER), true);
});

Deno.test("stale: a missing field reads as not stale on that half", () => {
  assertEquals(isFigureBundleStale(bundle(null, undefined), CONTAINER), false);
  assertEquals(isFigureBundleStale(bundle(RUN_A, undefined), CONTAINER), false);
  assertEquals(isFigureBundleStale(bundle(null, { adminArea2: "Kano" }), CONTAINER), false);
  // The other half still counts.
  assertEquals(isFigureBundleStale(bundle(RUN_B, undefined), CONTAINER), true);
  assertEquals(isFigureBundleStale(bundle(null, { adminArea2: null }), CONTAINER), true);
});

Deno.test("stale: the layout walk reports figure blocks with a bundle, in layout order", () => {
  const layout = {
    type: "rows",
    id: "root",
    children: [
      { type: "item", id: "b1", data: { type: "figure", bundle: bundle(RUN_B, { adminArea2: "Kano" }) } },
      { type: "item", id: "b2", data: { type: "text", text: "" } },
      { type: "item", id: "b3", data: { type: "figure" } },
      { type: "item", id: "b4", data: { type: "figure", bundle: bundle(RUN_A, { adminArea2: "Kano" }) } },
      { type: "item", id: "b5", data: { type: "figure", bundle: bundle(RUN_A, { adminArea2: null }) } },
    ],
  } as unknown as Parameters<typeof findStaleFiguresInLayout>[0];
  assertEquals(
    findStaleFiguresInLayout(layout, CONTAINER).map((s) => s.blockId),
    ["b1", "b5"],
  );
});

Deno.test("stale: the report walk reports registry entries with a stale bundle", () => {
  const figures = {
    f1: { type: "figure" as const, bundle: bundle(RUN_A, { adminArea2: "Kano" }) },
    f2: { type: "figure" as const },
    f3: { type: "figure" as const, bundle: bundle(RUN_B, { adminArea2: "Kano" }) },
  };
  assertEquals(findStaleFiguresInReport(figures, CONTAINER).map((s) => s.figureId), ["f3"]);
});
