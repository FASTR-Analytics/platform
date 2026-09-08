// Schema pin for PLAN_PRODUCTS_RESTRUCTURE step 4: a stored FigureBundle
// parses without the D4 pair (`scope`, `provenance.runId`) and with it. The
// pair is optional until step 9b stamps every stored bundle; this test is
// the one that must change when 9b makes it required.
//
//   deno test -A --env-file server/tests/figure_bundle_schema_test.ts

import { assertEquals } from "@std/assert";
import {
  DEFAULT_S_CONFIG,
  DEFAULT_T_CONFIG,
  figureBundleSchema,
  presentationObjectConfigSchema,
} from "lib";

const CONFIG = presentationObjectConfigSchema.parse({
  d: {
    type: "table",
    valuesDisDisplayOpt: "col",
    disaggregateBy: [{ disOpt: "admin_area_2", disDisplayOpt: "row" }],
    filterBy: [],
    periodFilter: { filterType: "last_n_months", nMonths: 12 },
  },
  s: DEFAULT_S_CONFIG,
  t: DEFAULT_T_CONFIG,
});

const BASE = {
  config: CONFIG,
  items: [{ admin_area_2: "Kano", value: 0.5 }],
  resultsValue: { formatAs: "percent", valueProps: ["value"] },
  indicatorMetadata: [],
  localization: { language: "en", calendar: "gregorian", countryIso3: "NGA" },
  metricId: "m1-01-01",
  snapshotAt: "2026-09-08T00:00:00.000Z",
};

Deno.test("figure bundle: a bundle stored before step 4 parses (no scope, null runId)", () => {
  const parsed = figureBundleSchema.parse({ ...BASE, provenance: { runId: null } });
  assertEquals(parsed.scope, undefined);
  assertEquals(parsed.provenance.runId, null);
});

Deno.test("figure bundle: a bundle captured under a pair parses with both fields", () => {
  const parsed = figureBundleSchema.parse({
    ...BASE,
    scope: { adminArea2: "Kano" },
    provenance: { runId: "00000000-0000-4000-8000-000000000000" },
  });
  assertEquals(parsed.scope, { adminArea2: "Kano" });
  assertEquals(parsed.provenance.runId, "00000000-0000-4000-8000-000000000000");
});

Deno.test("figure bundle: national scope is an explicit null, and an unknown scope key is rejected", () => {
  const parsed = figureBundleSchema.parse({
    ...BASE,
    scope: { adminArea2: null },
    provenance: { runId: "00000000-0000-4000-8000-000000000000" },
  });
  assertEquals(parsed.scope, { adminArea2: null });
  const rejected = figureBundleSchema.safeParse({
    ...BASE,
    scope: { adminArea2: null, runId: "x" },
    provenance: { runId: null },
  });
  assertEquals(rejected.success, false);
});
