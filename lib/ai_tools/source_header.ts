// The provenance line that opens every /mcp package-tool result.
//
// A result must name the package it read because the instance pin can move
// between two calls of one conversation, and a client may carry a stale
// catalog: results are self-identifying by construction. Failures pass
// through unheadered: a throw is the model's self-correction channel and must
// not be dressed up as a result. The SPA copilot needs no header: it is
// mounted per product over one fixed pair (PLAN_PRODUCTS_RESTRUCTURE D15).
export function formatSourceHeader(args: {
  packageLabel: string;
  createdAt: string | null;
}): string {
  const generated = args.createdAt === null
    ? ""
    : ` (generated ${args.createdAt})`;
  return `Source: results package "${args.packageLabel}"${generated}`;
}
