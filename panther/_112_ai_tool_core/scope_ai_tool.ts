// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

// scopeAITool: add one required string scope parameter (e.g.
// projectId) to an existing headless tool at the MCP boundary. The template
// tool supplies name/description/schema; `resolve` supplies the per-call
// inner tool bound to the scoped context — all app knowledge lives there.
// The wrapper's parse returns the FULL input including the scope param, so
// the MCP core's argsKey staging binds an approval to the scope: a confirm
// can never commit into a different scope than previewed.
//
// bindAITool (below) is the no-parameter sibling: same static template, same
// per-call resolve, but the surface — not the model — picks the context.
// bindAIToolToView (below) is the chat-side sibling: the view the call runs
// in picks the context, and the chat's gate and registry still see the tool.

import { buildAvailabilityHint } from "./deps.ts";
import { AIToolFailure } from "./tool_failure.ts";
import type {
  AnyAITool,
  ErasedApprovalConfig,
  SDKTool,
} from "./tool_helpers.ts";
import { getHeadlessCapability } from "./tool_helpers.ts";
import type { AIViewRegistry, AIViewState, AnyAIView } from "./view_types.ts";

export type ScopeAIToolOptions = {
  // Name of the injected required string property.
  param: string;
  // JSON-schema description for the injected property — this is what the
  // model reads in tools/list, so say what the id is and where to get it.
  description: string;
  // Resolves the scoped inner tool for one call. Runs per call, after parse;
  // throws surface as clean tool failures (AIToolFailure for expected ones,
  // e.g. "no access to this project").
  resolve: (value: string) => Promise<AnyAITool> | AnyAITool;
};

// The createAITool-level headless invariants, re-run at composition for
// bindAITool and scopeAITool only: those two exist for headless (MCP)
// surfaces, and composition must not launder a tool the filter would reject.
// Stricter than createAITool and createMCPServer, which accept `headless`
// beside a `viewRegistry` (an ungated view-typed handler may never read the
// view): a template built with one is refused here too, because the per-call
// inner tool is never registered, so nothing would check the view it was
// typed for. bindAIToolToView does not run it.
function assertHeadlessTemplate(
  wrapper: "scopeAITool" | "bindAITool",
  template: AnyAITool,
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
  template: AnyAITool,
  resolve: () => Promise<AnyAITool> | AnyAITool,
): AnyAITool {
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
  template: AnyAITool,
  opts: ScopeAIToolOptions,
): AnyAITool {
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

  const resolveInner = async (value: string): Promise<AnyAITool> => {
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

export type BindAIToolToViewOptions<
  TDefs extends Record<string, AnyAIView>,
> = {
  // Gate for a template that declares none (a headless template cannot).
  availableIn?: readonly (keyof TDefs & string)[];
};

// bindAIToolToView: the chat-side sibling of bindAITool. The template
// supplies name/description/schema; `resolve` supplies the inner tool for one
// call, from the view the call runs in. The engine's gate, `resolve` and the
// inner tool all read ONE snapshot of the view, read here once per call: a
// move between the gate and the handler can never run the inner tool against
// a view the gate did not admit.
export function bindAIToolToView<TDefs extends Record<string, AnyAIView>>(
  viewRegistry: AIViewRegistry<TDefs>,
  template: AnyAITool,
  resolve: (view: AIViewState<TDefs>) => Promise<AnyAITool> | AnyAITool,
  options?: BindAIToolToViewOptions<TDefs>,
): AnyAITool {
  const name = template.sdkTool.name;
  const templateRegistry = template.metadata._viewRegistry;
  if (templateRegistry !== undefined && templateRegistry !== viewRegistry) {
    throw new Error(
      `bindAIToolToView("${name}"): template tool was typed against a DIFFERENT view registry than the one bound here. Pass the same defineAIViews registry to createAITool's \`viewRegistry\` and to bindAIToolToView.`,
    );
  }
  const optionAvailableIn = options?.availableIn;
  if (optionAvailableIn !== undefined) {
    if (template.metadata.availableIn !== undefined) {
      throw new Error(
        `bindAIToolToView("${name}"): the template already declares availableIn — a second list would replace the gate its description announces. Omit options.availableIn.`,
      );
    }
    if (optionAvailableIn.length === 0) {
      throw new Error(
        `bindAIToolToView("${name}"): availableIn is empty — the tool would be executable nowhere. Omit the field for an everywhere-available tool.`,
      );
    }
    for (const id of optionAvailableIn) {
      if (!viewRegistry._defs[id]) {
        throw new Error(
          `bindAIToolToView("${name}"): availableIn references view id "${id}", which is not in the bound view registry.`,
        );
      }
    }
  }
  const availableIn = optionAvailableIn
    ? [...optionAvailableIn]
    : template.metadata.availableIn;
  const description = optionAvailableIn
    ? `${template.sdkTool.description}\n\n${
      buildAvailabilityHint([...optionAvailableIn])
    }`
    : template.sdkTool.description;
  const templateApproval = template.metadata.approval;

  const resolveInner = async (view: AIViewState<TDefs>): Promise<AnyAITool> => {
    const inner = await Promise.resolve(resolve(view));
    if (inner.sdkTool.name !== name) {
      throw new Error(
        `bindAIToolToView("${name}"): resolve() returned tool "${inner.sdkTool.name}" — the inner tool must carry the template's name.`,
      );
    }
    return inner;
  };

  const approvalError = () =>
    new Error(
      `Tool "${name}" requires user approval and can only execute inside an approval lifecycle (createAIChat's chat loop or createMCPServer's approval driver).`,
    );

  const noView = () =>
    new Error(
      `Tool "${name}" is bound to the view and can only execute inside createAIChat's tool loop, which supplies the live view.`,
    );

  const run = (_input: unknown): Promise<string> =>
    Promise.reject(templateApproval ? approvalError() : noView());

  const runWithView = async (
    input: unknown,
    getView?: () => unknown,
  ): Promise<string> => {
    if (templateApproval) throw approvalError();
    if (getView === undefined) throw noView();
    const snapshot = getView() as AIViewState<TDefs>;
    const inner = await resolveInner(snapshot);
    return inner.sdkTool.runWithView
      ? await inner.sdkTool.runWithView(input, () => snapshot)
      : await inner.sdkTool.run(input);
  };

  const approval: ErasedApprovalConfig | undefined = templateApproval
    ? {
      propose: async (input, view, ctx) => {
        const inner = await resolveInner(view as AIViewState<TDefs>);
        const innerApproval = inner.metadata.approval;
        if (!innerApproval) {
          throw new Error(
            `bindAIToolToView("${name}"): resolve() returned a tool without approval, but the template declares approval — the bound tool cannot drive the approval lifecycle.`,
          );
        }
        return await Promise.resolve(innerApproval.propose(input, view, ctx));
      },
      mode: templateApproval.mode,
      presentation: templateApproval.presentation,
    }
    : undefined;

  const { headless: _headless, ...templateMetadata } = template.metadata;
  return {
    sdkTool: {
      name,
      description,
      input_schema: template.sdkTool.input_schema,
      parse: template.sdkTool.parse,
      run,
      runWithView,
    },
    metadata: {
      ...templateMetadata,
      availableIn,
      approval,
      _viewRegistry: viewRegistry,
    },
  };
}
