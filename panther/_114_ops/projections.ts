// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

// Registry → _112 AI tools and registry → MCP tools. Both are a filter +
// map over the SAME declarations the server boots (exposure is
// derived; there is no second allowlist to drift). Each surface derives
// from its own declaration: the in-app AI list from `exposure.ai`, the MCP
// list from `exposure.headless`.

import { AIToolFailure, createAITool } from "./deps.ts";
import type {
  AIToolDisplayProps,
  AnyAITool,
  APIResponseWithData,
  Component,
} from "./deps.ts";
import type {
  DescribedOpContract,
  OpApprovalCallData,
  OpArgsOf,
  OpContract,
  OpOutputOf,
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

// Each card of an op given to the AI, by op name, typed by the op's input
// and output: the client's projection holds it, since a component is UI code
// and an op's declaration is loaded by the server too.
export type OpDisplayComponents<TReg extends OpRegistry> = {
  [
    K in keyof TReg & string as TReg[K]["exposure"]["ai"] extends false ? never
      : K
  ]?: Component<AIToolDisplayProps<OpArgsOf<TReg[K]>, OpOutputOf<TReg[K]>>>;
};

type ErasedDisplayComponent = Component<AIToolDisplayProps<unknown, unknown>>;

export function opsToAITools<TReg extends OpRegistry>(
  registry: TReg,
  hooks: { run: RunOpFn; displayComponents?: OpDisplayComponents<TReg> },
): AnyAITool[] {
  const ops = registry as Record<string, DescribedOpContract>;
  // Each card is typed by its own op; the projection reads them erased, as
  // it reads the registry.
  const displayComponents = (hooks.displayComponents ?? {}) as Record<
    string,
    ErasedDisplayComponent | undefined
  >;
  for (const name of Object.keys(displayComponents)) {
    if (!Object.hasOwn(ops, name) || !ops[name].exposure.ai) {
      throw new Error(
        `opsToAITools: displayComponents names "${name}", which is not an op exposed to the AI, so its card could never show.`,
      );
    }
  }
  const tools: AnyAITool[] = [];
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
      displayComponents[name],
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
): AnyAITool[] {
  const ops = registry as Record<string, DescribedOpContract>;
  const tools: AnyAITool[] = [];
  for (const [name, op] of Object.entries(ops)) {
    if (op.exposure.headless !== true) {
      continue;
    }
    tools.push(projectOpTool(name, op, "mcp", true, hooks.run, undefined));
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
  op: DescribedOpContract,
  surface: OpSurface,
  headless: boolean,
  run: RunOpFn,
  displayComponent: ErasedDisplayComponent | undefined,
): AnyAITool {
  // The op's result is the tool's structured output: the model reads its
  // JSON, or the op's describeForModel, and the card draws it.
  const output = op.output === undefined ? { displayComponent } : {
    outputSchema: op.output,
    describeForModel: op.describeForModel,
    displayComponent,
  };
  if (op.approval === true) {
    return createAITool({
      name,
      description: op.description,
      inputSchema: op.input,
      ...output,
      kind: "write",
      headless,
      // The kernel validates the SAME schema inside run() and records the
      // attempt — a pre-parse here would answer invalid input before
      // provenance could see it.
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
              // Raw, not pre-stringified: _112 owns what the model reads, and
              // the raw value is the structured output, MCP's
              // structuredContent and the card's.
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
    ...output,
    kind: op.kind,
    headless,
    validation: "internal",
    handler: async (input: unknown) => {
      const res = await run(name, input, { surface });
      if (!res.success) {
        throw new AIToolFailure(res.err);
      }
      // Raw, not pre-stringified: _112 owns what the model reads, and the
      // raw value is the structured output, MCP's structuredContent and the
      // card's.
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
