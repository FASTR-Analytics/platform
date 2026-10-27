// When a saved visualization's snapshot is out of date (isVisualizationStale,
// lib/types/products.ts): resolved under another package, or under a scope
// definition the product's scope no longer has. A row no write has stamped
// is not called stale.
//
//   deno test -A --no-check server/tests/visualization_stale_test.ts

import { assertEquals } from "@std/assert";
import { isVisualizationStale, type ProductSummary } from "lib";

type VisualizationSummary = Extract<ProductSummary, { type: "visualization" }>;

function viz(
  resolvedUnder: VisualizationSummary["resolvedUnder"],
): VisualizationSummary {
  return {
    id: "v1",
    type: "visualization",
    label: "ANC coverage",
    folderId: null,
    runId: "run_now",
    scopeId: "all-data",
    createdBy: null,
    createdAt: null,
    lastUpdated: "1",
    owner: null,
    defaultAccess: "none",
    grants: [],
    resolvedUnder,
  };
}

Deno.test("a snapshot resolved under the product's package and scope is current", () => {
  assertEquals(
    isVisualizationStale(
      viz({ runId: "run_now", definitionHash: "h_now" }),
      "h_now",
    ),
    false,
  );
});

Deno.test("a snapshot from another package is stale", () => {
  assertEquals(
    isVisualizationStale(
      viz({ runId: "run_old", definitionHash: "h_now" }),
      "h_now",
    ),
    true,
  );
});

Deno.test("a snapshot from before the scope's definition changed is stale", () => {
  assertEquals(
    isVisualizationStale(
      viz({ runId: "run_now", definitionHash: "h_old" }),
      "h_now",
    ),
    true,
  );
});

Deno.test("an unstamped row is not called stale", () => {
  assertEquals(isVisualizationStale(viz(null), "h_now"), false);
});
