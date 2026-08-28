// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

// Registry → _112 AI tools and registry → MCP tools. Both are a filter +
// map over the SAME declarations the server boots (panterra R5: exposure is
// derived; there is no second allowlist to drift). Each surface derives
// from its own declaration: the in-app AI list from `exposure.ai`, the MCP
// list from `exposure.headless`.

import { AIToolFailure, createAITool } from "./deps.ts";
import type { AIToolWithMetadata, APIResponseWithData } from "./deps.ts";
import type {
  OpApprovalCallData,
  OpContract,
  OpRegistry,
  OpSurface,
} from "./types.ts";

// How a projected tool reaches the kernel: the app supplies its runner (the
// same one the human UI uses — no privileged AI path). opts carries the
// approval commit key and the surface the projection stamps.
export type RunOpFn = (
  name: string,
  args: unknown,
  opts?: { proposalKey?: string; surface?: OpSurface },
) => Promise<APIResponseWithData<unknown>>;

// deno-lint-ignore no-explicit-any
type AnyTool = AIToolWithMetadata<any>;

export function opsToAITools<TReg extends OpRegistry>(
  registry: TReg,
  hooks: { run: RunOpFn },
): AnyTool[] {
  const ops = registry as Record<string, OpContract>;
  const tools: AnyTool[] = [];
  for (const [name, op] of Object.entries(ops)) {
    if (!op.exposure.ai) {
      continue;
    }
    // createAITool refuses headless nav structurally; boot already forces
    // nav ops to declare a headless exclusion, so this stays false there.
    tools.push(projectOpTool(
      name,
      op,
      "ai",
      op.kind !== "nav" && op.exposure.headless === true,
      hooks.run,
    ));
  }
  return tools;
}

// The MCP surface: exactly the headless-exposed ops, every produced tool
// declaring headless: true — the _112 core's own filter then has nothing to
// drop, so the two layers agree by construction. Nav ops never appear (boot
// forbids nav + headless) and neither do streaming ops (same boot rule: an
// MCP tool returns one result).
export function opsToMCPTools<TReg extends OpRegistry>(
  registry: TReg,
  hooks: { run: RunOpFn },
): AnyTool[] {
  const ops = registry as Record<string, OpContract>;
  const tools: AnyTool[] = [];
  for (const [name, op] of Object.entries(ops)) {
    if (op.exposure.headless !== true) {
      continue;
    }
    tools.push(projectOpTool(name, op, "mcp", true, hooks.run));
  }
  return tools;
}

// One op → one _112 tool, shared by both projections so the approval
// composition exists once. For approval ops the wire IS the lifecycle: a
// keyless call previews (pending), the commit closure re-sends the same
// args with the staged key — the engine's structural guarantee (commit
// exists only after consent) composes with the kernel's (a key commits only
// the args its proposer previewed).
function projectOpTool(
  name: string,
  op: OpContract,
  surface: OpSurface,
  headless: boolean,
  run: RunOpFn,
): AnyTool {
  if (op.approval === true) {
    return createAITool({
      name,
      description: op.description,
      inputSchema: op.input,
      outputSchema: op.output,
      kind: "write",
      headless,
      // The kernel validates the SAME schema inside run() and records the
      // attempt — a pre-parse here would answer invalid input before
      // provenance could see it (panterra D6).
      validation: "internal",
      approval: {
        propose: async (input: unknown) => {
          const res = await run(name, input, { surface });
          if (!res.success) {
            return { invalid: res.err };
          }
          const data = res.data as OpApprovalCallData<unknown>;
          if (data.status !== "pending") {
            return { invalid: "Unexpected proposal response" };
          }
          return {
            preview: data.preview,
            commit: async () => {
              const committed = await run(name, input, {
                surface,
                proposalKey: data.proposalKey,
              });
              if (!committed.success) {
                throw new AIToolFailure(committed.err);
              }
              const payload = committed.data as OpApprovalCallData<unknown>;
              // Raw, not pre-stringified: _112 owns text serialization, and
              // the raw value is what feeds the MCP structuredContent leg.
              return payload.status === "committed" ? payload.result : payload;
            },
          };
        },
      },
    });
  }
  return createAITool({
    name,
    description: op.description,
    inputSchema: op.input,
    outputSchema: op.output,
    kind: op.kind,
    headless,
    validation: "internal",
    handler: async (input: unknown) => {
      const res = await run(name, input, { surface });
      if (!res.success) {
        throw new AIToolFailure(res.err);
      }
      // Raw, not pre-stringified: _112 owns text serialization, and the raw
      // value is what feeds the MCP structuredContent leg.
      return res.data;
    },
  });
}

// The MCP approval-exempt list, derived from the registry so the two
// approval layers agree by construction: boot already refuses a headless
// write with neither approval nor a stated approvalExempt reason, and this
// hands _112's approvalPolicy exactly the writes boot accepted as exempt —
// no hand-kept list to drift. Pass as approvalPolicy.exempt on the MCP
// mount.
export function opsApprovalExempt<TReg extends OpRegistry>(
  registry: TReg,
): string[] {
  return Object.entries(registry as Record<string, OpContract>)
    .filter(([, op]) =>
      op.kind === "write" && op.approval !== true &&
      op.exposure.headless === true
    )
    .map(([name]) => name);
}
