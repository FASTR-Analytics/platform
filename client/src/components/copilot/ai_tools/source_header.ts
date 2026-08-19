import type { AIChatConfig } from "panther";
import {
  describeCopilotPackage,
  describeCopilotScope,
} from "../authoring_context";

// Panther's own erased tool type — the element type its ToolRegistry accepts.
// The wrapper is input-agnostic (it only decorates the returned string), and
// this is the one shape that survives mapping over an array of tools with
// different input schemas.
type CopilotTool = NonNullable<AIChatConfig["tools"]>[number];

// Every SHARED tool result starts with one provenance line naming the package
// and scope it read — the same self-identification `/mcp` applies
// (`withSourceHeader` in server/mcp/context_cache.ts), for the same reason and
// then some: at `/mcp` the pin can move between two calls of one conversation;
// in the SPA the env's pair follows whichever product is open, so two
// `get_metric_data` calls one turn apart can legitimately read different
// packages or different admin areas. The header is what lets the model tell
// them apart in its own transcript.
//
// Computed at CALL time, never at build time: the tools array is registered
// once at mount, and the pair moves under it (SYSTEM_13 "anything evaluated at
// tool-build time is frozen at mount"). Scope rides the SPA's line because the
// SPA is the only surface that has one — `/mcp` is national by construction.
//
// Failures pass through unheadered: a throw is the model's self-correction
// channel and must not be dressed up as a result.
export function buildCopilotSourceHeader(): string {
  const pkg = describeCopilotPackage();
  const generated = pkg.createdAt === null
    ? ""
    : ` (generated ${pkg.createdAt})`;
  return `Source: results package "${pkg.label}"${generated}, scope: ${describeCopilotScope()}`;
}

export function withSourceHeader(tool: CopilotTool): CopilotTool {
  const inner = tool.sdkTool;
  const prepend = (body: string) => `${buildCopilotSourceHeader()}\n\n${body}`;
  return {
    metadata: tool.metadata,
    sdkTool: {
      ...inner,
      run: async (input) => prepend(await inner.run(input)),
      runWithView: async (input, getView) =>
        prepend(
          inner.runWithView
            ? await inner.runWithView(input, getView)
            : await inner.run(input),
        ),
    },
  };
}
