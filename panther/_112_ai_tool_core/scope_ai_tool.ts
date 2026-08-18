// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

// scopeAITool (PLAN_112, D7): add one required string scope parameter (e.g.
// projectId) to an existing headless tool at the MCP boundary. The template
// tool supplies name/description/schema; `resolve` supplies the per-call
// inner tool bound to the scoped context — all app knowledge lives there.
// The wrapper's parse returns the FULL input including the scope param, so
// the MCP core's argsKey staging binds an approval to the scope: a confirm
// can never commit into a different scope than previewed (D1).
//
// bindAITool (below) is the no-parameter sibling: same static template, same
// per-call resolve, but the surface — not the model — picks the context.

import { AIToolFailure } from "./tool_failure.ts";
import type {
  AIToolWithMetadata,
  ErasedApprovalConfig,
  SDKTool,
} from "./tool_helpers.ts";
import { getHeadlessCapability } from "./tool_helpers.ts";

// deno-lint-ignore no-explicit-any
type AnyTool = AIToolWithMetadata<any>;

export type ScopeAIToolOptions = {
  // Name of the injected required string property.
  param: string;
  // JSON-schema description for the injected property — this is what the
  // model reads in tools/list, so say what the id is and where to get it.
  description: string;
  // Resolves the scoped inner tool for one call. Runs per call, after parse;
  // throws surface as clean tool failures (AIToolFailure for expected ones,
  // e.g. "no access to this project").
  resolve: (value: string) => Promise<AnyTool> | AnyTool;
};

// The createAITool-level headless invariants, re-run at composition: the
// wrappers below exist only for headless (MCP) surfaces, and composition must
// not launder a tool the filter would reject.
function assertHeadlessTemplate(
  wrapper: "scopeAITool" | "bindAITool",
  template: AnyTool,
): void {
  const name = template.sdkTool.name;
  if (template.metadata.headless !== true) {
    throw new Error(
      `${wrapper}("${name}"): template tool does not declare headless: true — only headless tools can be wrapped for an MCP surface.`,
    );
  }
  const capability = getHeadlessCapability(template.metadata);
  if (capability.kind === "view-bound" || capability.kind === "nav") {
    throw new Error(
      `${wrapper}("${name}"): template tool is ${
        capability.kind === "nav" ? 'kind "nav"' : "view-bound"
      } — it can never run headlessly.`,
    );
  }
  if (template.metadata.approval && template.metadata._viewRegistry) {
    throw new Error(
      `${wrapper}("${name}"): template tool has view-typed approval — its propose expects live view state no headless surface can supply.`,
    );
  }
  if (typeof template.sdkTool.parse !== "function") {
    throw new Error(
      `${wrapper}("${name}"): template tool has no parse() — build it with createAITool.`,
    );
  }
}

// bindAITool: the no-parameter sibling of scopeAITool. The template supplies
// name/description/schema (static, so tools/list answers before any per-call
// state exists); `resolve` supplies the inner tool for one call — bound to
// whatever context the surface resolves at call time (e.g. an instance's
// currently pinned package). The model sees no scope argument at all: the
// surface, not the model, decides which context a call runs against.
export function bindAITool(
  template: AnyTool,
  resolve: () => Promise<AnyTool> | AnyTool,
): AnyTool {
  const name = template.sdkTool.name;
  assertHeadlessTemplate("bindAITool", template);
  const parse = template.sdkTool.parse!;
  const templateApproval = template.metadata.approval;

  const requireNoApproval = () => {
    if (templateApproval) {
      throw new Error(
        `Tool "${name}" requires user approval and can only execute inside an approval lifecycle (createAIChat's chat loop or createMCPServer's approval driver).`,
      );
    }
  };

  const run = async (input: unknown): Promise<string> => {
    requireNoApproval();
    const inner = await Promise.resolve(resolve());
    return await inner.sdkTool.run(input);
  };

  const runWithView = async (
    input: unknown,
    getView?: () => unknown,
  ): Promise<string> => {
    requireNoApproval();
    const inner = await Promise.resolve(resolve());
    return inner.sdkTool.runWithView
      ? await inner.sdkTool.runWithView(input, getView)
      : await inner.sdkTool.run(input);
  };

  const approval: ErasedApprovalConfig | undefined = templateApproval
    ? {
      propose: async (input, view, ctx) => {
        const inner = await Promise.resolve(resolve());
        const innerApproval = inner.metadata.approval;
        if (!innerApproval) {
          throw new Error(
            `bindAITool("${name}"): resolve() returned a tool without approval, but the template declares approval — the bound tool cannot drive the approval lifecycle.`,
          );
        }
        return await Promise.resolve(innerApproval.propose(input, view, ctx));
      },
      mode: templateApproval.mode,
      presentation: templateApproval.presentation,
    }
    : undefined;

  return {
    sdkTool: {
      name,
      description: template.sdkTool.description,
      input_schema: template.sdkTool.input_schema,
      parse,
      run,
      runWithView,
    },
    metadata: {
      ...template.metadata,
      approval,
    },
  };
}

function peelScopeParam(
  input: unknown,
  param: string,
): { value: string; rest: Record<string, unknown> } {
  const record = input as Record<string, unknown>;
  const { [param]: value, ...rest } = record;
  if (typeof value !== "string" || value.length === 0) {
    throw new AIToolFailure(
      `Invalid input: "${param}" must be a non-empty string.`,
    );
  }
  return { value, rest };
}

export function scopeAITool(
  template: AnyTool,
  opts: ScopeAIToolOptions,
): AnyTool {
  const name = template.sdkTool.name;
  const { param, description, resolve } = opts;
  assertHeadlessTemplate("scopeAITool", template);
  const templateSchema = template.sdkTool.input_schema;
  if (templateSchema.properties?.[param] !== undefined) {
    throw new Error(
      `scopeAITool("${name}"): template schema already has a "${param}" property — injecting it again would be ambiguous.`,
    );
  }

  // Hand-assembled at the JSON-schema level: the template's zod object is
  // file-internal to its factory, and tools/list must keep the real field
  // docs alongside the injected one.
  const inputSchema: SDKTool["input_schema"] = {
    ...templateSchema,
    properties: {
      ...(templateSchema.properties ?? {}),
      [param]: { type: "string", description },
    },
    required: [...(templateSchema.required ?? []), param],
  };

  const parse = (content: unknown): unknown => {
    if (content === null || typeof content !== "object") {
      throw new AIToolFailure(
        `Invalid input: expected an object with a "${param}" property.`,
      );
    }
    const { value, rest } = peelScopeParam(content, param);
    const innerParsed = template.sdkTool.parse!(rest) as Record<
      string,
      unknown
    >;
    // Full input INCLUDING the scope param — argsKey staging binds to it.
    return { ...innerParsed, [param]: value };
  };

  const resolveInner = async (value: string): Promise<AnyTool> => {
    return await Promise.resolve(resolve(value));
  };

  const templateApproval = template.metadata.approval;

  const run = async (input: unknown): Promise<string> => {
    if (templateApproval) {
      // Mirrors createAITool's guard: approval tools only execute inside an
      // approval lifecycle.
      throw new Error(
        `Tool "${name}" requires user approval and can only execute inside an approval lifecycle (createAIChat's chat loop or createMCPServer's approval driver).`,
      );
    }
    const { value, rest } = peelScopeParam(input, param);
    const inner = await resolveInner(value);
    return await inner.sdkTool.run(rest);
  };

  const runWithView = async (
    input: unknown,
    getView?: () => unknown,
  ): Promise<string> => {
    if (templateApproval) {
      throw new Error(
        `Tool "${name}" requires user approval and can only execute inside an approval lifecycle (createAIChat's chat loop or createMCPServer's approval driver).`,
      );
    }
    const { value, rest } = peelScopeParam(input, param);
    const inner = await resolveInner(value);
    return inner.sdkTool.runWithView
      ? await inner.sdkTool.runWithView(rest, getView)
      : await inner.sdkTool.run(rest);
  };

  // The approval wrapper peels + resolves + delegates; the returned
  // preview/commit/stillValid pass through untouched, so the structural
  // guarantee (commit only exists inside a ProposalResult, only runs after
  // an accepted decision) survives composition.
  const approval: ErasedApprovalConfig | undefined = templateApproval
    ? {
      propose: async (input, view, ctx) => {
        const { value, rest } = peelScopeParam(input, param);
        const inner = await resolveInner(value);
        const innerApproval = inner.metadata.approval;
        if (!innerApproval) {
          throw new Error(
            `scopeAITool("${name}"): resolve() returned a tool without approval, but the template declares approval — the scoped tool cannot drive the approval lifecycle.`,
          );
        }
        return await Promise.resolve(innerApproval.propose(rest, view, ctx));
      },
      mode: templateApproval.mode,
      presentation: templateApproval.presentation,
    }
    : undefined;

  return {
    sdkTool: {
      name,
      description: template.sdkTool.description,
      input_schema: inputSchema,
      parse,
      run,
      runWithView,
    },
    metadata: {
      ...template.metadata,
      approval,
    },
  };
}
