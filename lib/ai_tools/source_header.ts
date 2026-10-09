import type { AnyAITool } from "@timroberton/panther";

// The provenance line that opens a package-bound read's result. A result
// names the package and scope it read because the pair behind a bound tool
// can move between two calls of one conversation (the /mcp pin moves; a
// client may carry a stale catalog), so results are self-identifying by
// construction. A read bound by run id alone (a module's script, log or
// settings) passes no scope label: it does not depend on one, and a
// generating or failed package has none. Failures pass through unheadered:
// a throw is the model's self-correction channel and must not be dressed up
// as a result. /mcp applies the line to its package tools under "All data".
export function formatSourceHeader(args: {
  packageLabel: string;
  createdAt: string | null;
  scopeLabel?: string;
}): string {
  const generated = args.createdAt === null
    ? ""
    : ` (generated ${args.createdAt})`;
  const scope = args.scopeLabel === undefined
    ? ""
    : `, scope "${args.scopeLabel}"`;
  return `Source: results package "${args.packageLabel}"${generated}${scope}`;
}

// Prepends the header to every successful result on each execution path the
// engines call (`run`, `runWithView`, `runStructured`). The header is read
// at call time, so a wrapper built once over a moving pair names the pair of
// each call.
export function withSourceHeader<T extends AnyAITool>(
  tool: T,
  header: () => string,
): T {
  const prepend = (body: string) => `${header()}\n\n${body}`;
  const inner = tool.sdkTool;
  const runStructured = inner.runStructured;
  return {
    metadata: tool.metadata,
    sdkTool: {
      ...inner,
      run: async (input: unknown) => prepend(await inner.run(input)),
      runWithView: async (input: unknown, getView?: () => unknown) =>
        prepend(
          inner.runWithView
            ? await inner.runWithView(input, getView)
            : await inner.run(input),
        ),
      runStructured: runStructured === undefined
        ? undefined
        : async (input: unknown, getView?: () => unknown) => {
          const result = await runStructured(input, getView);
          return { ...result, text: prepend(result.text) };
        },
    },
  } as T;
}
