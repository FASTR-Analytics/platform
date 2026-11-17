import {
  AIToolOutput,
  buildToolResultContent,
  parseToolResultContent,
  runAIToolWithView,
} from "@timroberton/panther";
import type {
  AIToolCallContext,
  AnyAITool,
  SDKToolRunContext,
} from "@timroberton/panther";

// The provenance line that opens a package-bound read's result on both
// surfaces. A result names the package and scope it read because the pair
// behind a registered tool moves between two calls of one conversation (the
// SPA binds each call to the pair of the view it runs in; the /mcp pin
// moves), so results are self-identifying by construction. A read bound by
// run id alone (a module's script, log or settings) passes no scope label:
// it does not depend on one, and a generating or failed package has none.
// Failures pass through unheadered: a throw is the model's self-correction
// channel and must not be dressed up as a result. The SPA applies the line
// to every read of a pair-bound inner set with the scope's display label;
// /mcp to its package tools under "All data".
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

// Puts the header before the text of every successful output on each
// execution path the engines call (`run`, `runWithView`), and keeps the
// output's images. The header is read at call time, so a wrapper built once
// over a moving pair names the pair of each call.
export function withSourceHeader<T extends AnyAITool>(
  tool: T,
  header: () => string,
): T {
  const headed = (output: AIToolOutput) =>
    new AIToolOutput({
      text: `${header()}\n\n${output.text}`,
      images: output.images,
    });
  const inner = tool.sdkTool;
  return {
    metadata: tool.metadata,
    sdkTool: {
      ...inner,
      run: async (input: unknown, context?: SDKToolRunContext) =>
        buildToolResultContent(
          headed(parseToolResultContent(await inner.run(input, context))),
        ),
      runWithView: async (
        input: unknown,
        getView: (() => unknown) | undefined,
        ctx: AIToolCallContext,
      ) => {
        const ran = await runAIToolWithView(inner, input, getView, ctx);
        return { ...ran, output: headed(ran.output) };
      },
    },
  } as T;
}
