// Regression pin for the /mcp provenance header (PLAN_MCP_CATALOG_CHANGE,
// 2026-08-19): every package-tool result names the run it read, and failures
// pass through untouched.
//
//   deno test -A --env-file server/tests/mcp_tools_source_header_test.ts

import { assertEquals, assertRejects, assertStrictEquals } from "@std/assert";
import { AIToolFailure, createAITool } from "@timroberton/panther";
import { z } from "zod";
import type { RunListingItem } from "lib";
import { buildSourceHeader, withSourceHeader } from "../mcp/context_cache.ts";

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

const HEADER =
  'Source: results package "National package 2026-Q2" (generated 2026-08-19T10:00:00.000Z)';

Deno.test("withSourceHeader: success text starts with the Source line, then the body", async () => {
  const tool = createAITool({
    name: "stub_tool",
    description: "stub",
    inputSchema: z.object({}),
    handler: async () => "body",
    kind: "read",
    headless: true,
  });
  const wrapped = withSourceHeader(tool, RUN);

  assertEquals(buildSourceHeader(RUN), HEADER);
  assertEquals(await wrapped.sdkTool.run({}), `${HEADER}\n\nbody`);
  assertEquals(await wrapped.sdkTool.runWithView!({}), `${HEADER}\n\nbody`);
  assertStrictEquals(wrapped.sdkTool.name, "stub_tool");
  assertStrictEquals(wrapped.metadata, tool.metadata);
});

Deno.test("withSourceHeader: an AIToolFailure propagates unchanged — no header", async () => {
  const tool = createAITool({
    name: "stub_tool",
    description: "stub",
    inputSchema: z.object({}),
    handler: async () => {
      throw new AIToolFailure("nope");
    },
    kind: "read",
    headless: true,
  });
  const wrapped = withSourceHeader(tool, RUN);

  await assertRejects(() => wrapped.sdkTool.run({}), AIToolFailure, "nope");
  await assertRejects(
    () => wrapped.sdkTool.runWithView!({}),
    AIToolFailure,
    "nope",
  );
});
