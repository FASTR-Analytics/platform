// The provenance line that opens every SHARED tool result, on both surfaces.
//
// A tool result must name the package it read, because neither surface is
// pinned for the life of a conversation: at `/mcp` the instance pin can move
// between two calls, and in the SPA the copilot's pair follows whichever
// product is open, so two `get_metric_data` calls one turn apart can
// legitimately read different packages or different admin areas. The header is
// what lets the model tell them apart in its own transcript.
//
// `scope` is the SPA's half: /mcp is national by construction and passes none,
// which keeps its line byte-identical to what it has always emitted.
// Failures pass through unheadered on both surfaces: a throw is the model's
// self-correction channel and must not be dressed up as a result.
export function formatSourceHeader(args: {
  packageLabel: string;
  createdAt: string | null;
  scope?: string;
}): string {
  const generated = args.createdAt === null
    ? ""
    : ` (generated ${args.createdAt})`;
  const scope = args.scope === undefined ? "" : `, scope: ${args.scope}`;
  return `Source: results package "${args.packageLabel}"${generated}${scope}`;
}
