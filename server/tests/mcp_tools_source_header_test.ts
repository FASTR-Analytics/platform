// Regression pin for the provenance header: every package-bound result names
// the package and scope it read on every execution path, the header is read
// at call time, and failures pass through untouched.
//
//   deno test -A --env-file server/tests/mcp_tools_source_header_test.ts

import { assertEquals, assertRejects, assertStrictEquals } from "@std/assert";
import { AIToolFailure, createAITool } from "@timroberton/panther";
import { z } from "zod";
import type { RunListingItem } from "lib";
import { formatSourceHeader, withSourceHeader } from "lib";
import { buildSourceHeader } from "../mcp/context_cache.ts";

const RUN: RunListingItem = {
  id: "00000000-0000-4000-8000-000000000000",
  label: "National package 2026-Q2",
  status: "ready",
  provenance: "wizard",
  createdAt: "2026-08-19T10:00:00.000Z",
  endedAt: "2026-08-19T10:12:00.000Z",
  createdBy: null,
  summary: null,
  progress: null,
};

const HEADER =
  'Source: results package "National package 2026-Q2" (generated 2026-08-19T10:00:00.000Z), scope "All data"';

function stubTool(handler: () => Promise<string>) {
  return createAITool({
    name: "stub_tool",
    description: "stub",
    inputSchema: z.object({}),
    handler,
    kind: "read",
    headless: true,
  });
}

Deno.test("withSourceHeader: success text starts with the Source line, then the body", async () => {
  const tool = stubTool(async () => "body");
  const wrapped = withSourceHeader(tool, () => HEADER);

  assertEquals(buildSourceHeader(RUN), HEADER);
  assertEquals(await wrapped.sdkTool.run({}), `${HEADER}\n\nbody`);
  assertEquals(await wrapped.sdkTool.runWithView!({}), `${HEADER}\n\nbody`);
  assertStrictEquals(wrapped.sdkTool.name, "stub_tool");
  assertStrictEquals(wrapped.metadata, tool.metadata);
});

Deno.test("withSourceHeader: runStructured carries the Source line", async () => {
  const tool = createAITool({
    name: "stub_tool",
    description: "stub",
    inputSchema: z.object({}),
    outputSchema: z.object({ n: z.number() }),
    handler: async () => ({ n: 1 }),
    kind: "read",
    headless: true,
  });
  const wrapped = withSourceHeader(tool, () => HEADER);

  assertEquals(await wrapped.sdkTool.runStructured!({}), {
    text: `${HEADER}\n\n{"n":1}`,
    structured: { n: 1 },
  });
});

Deno.test("withSourceHeader: the header is read at call time", async () => {
  const tool = stubTool(async () => "body");
  let scope = "All data";
  const wrapped = withSourceHeader(
    tool,
    () =>
      formatSourceHeader({
        packageLabel: RUN.label,
        createdAt: RUN.createdAt,
        scopeLabel: scope,
      }),
  );

  assertEquals(await wrapped.sdkTool.run({}), `${HEADER}\n\nbody`);
  scope = "Kano";
  assertEquals(
    await wrapped.sdkTool.run({}),
    `${HEADER.replace('"All data"', '"Kano"')}\n\nbody`,
  );
});

Deno.test("withSourceHeader: an AIToolFailure propagates unchanged on every path, no header", async () => {
  const tool = stubTool(async () => {
    throw new AIToolFailure("nope");
  });
  const wrapped = withSourceHeader(tool, () => HEADER);

  await assertRejects(() => wrapped.sdkTool.run({}), AIToolFailure, "nope");
  await assertRejects(
    () => wrapped.sdkTool.runWithView!({}),
    AIToolFailure,
    "nope",
  );
  await assertRejects(
    () => wrapped.sdkTool.runStructured!({}),
    AIToolFailure,
    "nope",
  );
});

Deno.test("formatSourceHeader: without a scope label the line names the package alone", () => {
  assertEquals(
    formatSourceHeader({ packageLabel: RUN.label, createdAt: RUN.createdAt }),
    'Source: results package "National package 2026-Q2" (generated 2026-08-19T10:00:00.000Z)',
  );
  assertEquals(
    formatSourceHeader({
      packageLabel: RUN.label,
      createdAt: null,
      scopeLabel: "All data",
    }),
    'Source: results package "National package 2026-Q2", scope "All data"',
  );
});
