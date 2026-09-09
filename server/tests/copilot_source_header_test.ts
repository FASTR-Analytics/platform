// The SPA twin of mcp_tools_source_header_test.ts: the copilot's shared-tool
// results carry the same provenance line as /mcp's, off the same formatter,
// plus the scope half only the SPA has (PLAN_PRODUCTS_RESTRUCTURE D15). The
// wrapper that prepends it lives in the client
// (copilot/ai_tools/source_header.ts) and closes over the live copilot store,
// so what is pinned here is the LINE both surfaces emit.
//
//   deno test -A --env-file server/tests/copilot_source_header_test.ts

import { assertEquals } from "@std/assert";
import { formatSourceHeader } from "lib";
import { buildSourceHeader } from "../mcp/context_cache.ts";
import type { RunListingItem } from "lib";

const RUN: RunListingItem = {
  id: "00000000-0000-4000-8000-000000000000",
  label: "National package 2026-Q2",
  status: "ready",
  provenance: "wizard",
  createdAt: "2026-08-19T10:00:00.000Z",
  createdBy: null,
  summary: null,
  progress: null,
};

Deno.test("formatSourceHeader: /mcp's line is byte-identical with no scope", () => {
  assertEquals(
    formatSourceHeader({
      packageLabel: RUN.label,
      createdAt: RUN.createdAt,
    }),
    'Source: results package "National package 2026-Q2" (generated 2026-08-19T10:00:00.000Z)',
  );
  assertEquals(
    buildSourceHeader(RUN),
    formatSourceHeader({
      packageLabel: RUN.label,
      createdAt: RUN.createdAt,
    }),
  );
});

Deno.test("formatSourceHeader: the copilot's line names the scope", () => {
  assertEquals(
    formatSourceHeader({
      packageLabel: RUN.label,
      createdAt: RUN.createdAt,
      scope: "national",
    }),
    'Source: results package "National package 2026-Q2" (generated 2026-08-19T10:00:00.000Z), scope: national',
  );
  assertEquals(
    formatSourceHeader({
      packageLabel: RUN.label,
      createdAt: RUN.createdAt,
      scope: "NAIROBI",
    }),
    'Source: results package "National package 2026-Q2" (generated 2026-08-19T10:00:00.000Z), scope: NAIROBI',
  );
});

Deno.test("formatSourceHeader: a package with no ready row drops the timestamp, never fabricates one", () => {
  assertEquals(
    formatSourceHeader({
      packageLabel: RUN.id,
      createdAt: null,
      scope: "national",
    }),
    'Source: results package "00000000-0000-4000-8000-000000000000", scope: national',
  );
});
