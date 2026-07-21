// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { buildAvailabilityHint, z } from "../deps.ts";
import type { Component, zType } from "../deps.ts";
import { AIToolFailure } from "./tool_failure.ts";

export { AIToolFailure } from "./tool_failure.ts";

// "write" drives approval policy (approvalPolicy.requireForKind, Feature 4);
// "read"/"nav" are forward metadata (actions-registry stamping, catalog
// grouping) with no engine behavior today.
export type AIToolKind = "read" | "write" | "nav";

////////////////////////////////////////////////////////////////////////////////
// TOOL APPROVAL (confirm-before-apply — Feature 4)
////////////////////////////////////////////////////////////////////////////////
//
// The lifecycle is panther-owned: prepare a preview → present it → await the
// user's decision → commit or report declined. The tool declares the phases;
// the engine owns everything between them (card, decision ownership,
// view-exit auto-decline, outcome strings). The structural guarantee is the
// point: commit only exists inside a PrepareResult and panther only invokes
// it after an accepted decision — the mutation CANNOT run before consent as
// a matter of API shape. prepare must be read-only by contract (same trust
// level as "handlers must throw, not catch").

export type ApprovalPreview = {
  title: string;
  // Markdown, rendered through the chat's markdown pipeline.
  description?: string;
  // Structured field-level changes, rendered as a before → after list.
  changes?: { label: string; before?: string; after?: string }[];
  // Full-text diff, rendered as a two-pane block.
  diff?: { before: string; after: string };
  // "danger" styles the accept action (deletes).
  intent?: "default" | "danger";
  // Accept-button label ("Apply", "Delete", …); default is a t3 "Accept".
  confirmLabel?: string;
};

export type PrepareResult<TOutput> =
  // No-op detected — returned to the model as a NORMAL tool result; no
  // decision is requested and commit never exists.
  | { skip: string }
  // Validation failed in prepare — is_error result with the expected-failure
  // display (same mapping as a thrown AIToolFailure); commit never exists.
  | { invalid: string }
  | {
    preview: ApprovalPreview;
    // Runs ONLY after an accepted decision.
    commit: () => Promise<TOutput> | TOutput;
    // Optional data-staleness check, evaluated when an ACCEPT decision
    // arrives (view-exit staleness is engine-handled via availableIn).
    // false → resolved as declined-stale, commit never runs.
    stillValid?: () => boolean;
    // Per-invocation presenter override for domain UIs (staging a diff
    // inside an editor). Resolves the decision (true = accept); panther
    // still owns serialization, timeline recording, and outcome shaping.
    // The signal aborts when the engine resolves the decision externally
    // (view-exit auto-decline, Stop) — the presenter MUST clean up its
    // staged UI on abort; unmount luck is not a cleanup mechanism.
    present?: (signal: AbortSignal) => Promise<boolean>;
  };

export type AIToolApprovalConfig<TInput, TOutput> = {
  // ctx carries the turn's AbortSignal so a long server-side prepare can
  // cancel on Stop (the post-prepare abort check remains the correctness
  // backstop).
  prepare: (
    input: TInput,
    ctx: { signal: AbortSignal },
  ) => Promise<PrepareResult<TOutput>> | PrepareResult<TOutput>;
  // "session" adds a "don't ask again in this conversation" checkbox to the
  // inline card; later calls short-circuit to auto_approved (prepare still
  // runs, presentation is skipped, commit runs). Requires presentation
  // "inline" (construction throw — the modal has no checkbox affordance).
  // NOTE: a prepare that returns a present() override never offers the
  // checkbox either (a custom presenter has no checkbox affordance), so a
  // session-mode tool that ALWAYS presents custom can never arm the
  // auto-approve — the flag only sets through the inline card.
  mode?: "always" | "session";
  presentation?: "inline" | "modal";
};

// Engine-facing erased shape stored on ToolUIMetadata (defaults resolved at
// construction).
export type ErasedApprovalConfig = {
  prepare: (
    input: unknown,
    ctx: { signal: AbortSignal },
  ) => Promise<PrepareResult<unknown>> | PrepareResult<unknown>;
  mode: "always" | "session";
  presentation: "inline" | "modal";
};

// App-level approval policy (AIChatConfig.approvalPolicy). When set,
// construction throws for any tool tagged kind "write" that has neither
// approval nor an exempt entry. requireKind closes the silent-bypass hole (a
// new write tool that simply omits kind): with both set, forgetting a flag
// means over-asking or a boot-time throw — never a silent mutation.
export type ApprovalPolicy = {
  requireForKind: "write";
  exempt?: string[];
  requireKind?: boolean;
};

export interface ToolUIMetadata<TInput = unknown> {
  displayComponent?: Component<{ input: TInput }>;

  inProgressComponent?: Component<{ input: TInput }>;

  inProgressLabel?: string | ((input: TInput) => string);

  completionMessage?: string | ((input: TInput) => string);

  successMessage?: string | ((input: TInput) => string);

  errorMessage?: string | ((input: TInput) => string);

  // View ids where this tool may EXECUTE (soft gating — the tool is always
  // sent to the API; out-of-view calls get a standardized is_error result
  // before the handler runs). Absent = available everywhere. Validated
  // against the configured view registry when the tool is registered.
  availableIn?: string[];

  kind?: AIToolKind;

  // Approval lifecycle (Feature 4), erased. Set by createAITool when the
  // tool config declares approval; the chat loop branches on it BEFORE
  // sdkTool.run (an approval tool's run() throws — it can only execute
  // inside the engine lifecycle).
  approval?: ErasedApprovalConfig;

  // True for tools whose in-progress state is an interactive card awaiting
  // the user (approval tools, ask_user_questions). Excluded from the upfront
  // in-progress batch — the card is created when its block STARTS executing,
  // so a click can never land before the handler wires its resolver — and
  // protected from the queue path's clearInProgressItems.
  awaitsUserAction?: boolean;

  // Engine-internal: the controller instance that created this tool via
  // viewController.createTool. Registration verifies it is the SAME instance
  // as the chat's configured controller — the handler's narrowed view state
  // reads THIS controller's signal, so a chat gating on a different
  // controller would pass the gate while the handler sees another view
  // (proven in the Phase 1+2 review). Never set by consumers.
  _viewController?: unknown;

  // Engine-internal: cancels a promise-blocking card's pending interaction
  // (ask_user_questions). Called by stopGeneration so the tool's closure
  // guard resets — with unmount-cancel removed (decision log #6), Stop is
  // the explicit path that unblocks an abandoned question. Never set by
  // consumers.
  _cancelPending?: () => void;
}

export interface SDKTool<TInput = unknown> {
  name: string;
  description: string;
  input_schema: {
    type: "object";
    properties?: Record<string, unknown>;
    required?: string[];
    additionalProperties: false;
  };
  run: (input: TInput) => Promise<string>;
  // Matches the SDK's BetaRunnableTool contract — the tool runner calls
  // parse() (when present) before run(). Optional so hand-constructed tools
  // in consumer apps keep compiling; createAITool always provides it.
  parse?: (content: unknown) => TInput;
}

export interface AIToolWithMetadata<TInput = unknown> {
  sdkTool: SDKTool<TInput>;

  metadata: ToolUIMetadata<TInput>;
}

export interface CreateAIToolConfigCommon<TInput> {
  name: string;

  description: string;

  inputSchema: zType.ZodType<TInput>;

  displayComponent?: Component<{ input: TInput }>;

  inProgressComponent?: Component<{ input: TInput }>;

  inProgressLabel?: string | ((input: TInput) => string);

  completionMessage?: string | ((input: TInput) => string);

  successMessage?: string | ((input: TInput) => string);

  errorMessage?: string | ((input: TInput) => string);

  // See ToolUIMetadata.availableIn. On the plain createAITool this is
  // string[]; the typed variant (viewController.createTool) constrains it to
  // the registry's view ids at compile time.
  availableIn?: string[];

  kind?: AIToolKind;
}

// Exactly one of handler / approval — enforced at the type level (the XOR
// union) and again at construction for erased callers. A tool either
// executes directly or goes through the confirm-before-apply lifecycle;
// there is no "handler with a confirm inside" (that convention is exactly
// what approval replaces).
export type CreateAIToolConfig<TInput, TOutput = string> =
  & CreateAIToolConfigCommon<TInput>
  & (
    | {
      handler: (input: TInput) => Promise<TOutput> | TOutput;
      approval?: never;
    }
    | {
      handler?: never;
      approval: AIToolApprovalConfig<TInput, TOutput>;
    }
  );

// Construction-time guard: a tool input schema must ACCEPT unknown keys
// everywhere in its tree (Claude sometimes emits underscore-prefixed
// metadata keys; a strict schema then errors on every call). Detection is
// empirical and pinned by tests/ai_tool_schema_test.ts: under
// z.toJSONSchema(schema, { io: "input" }), plain z.object omits
// additionalProperties while z.strictObject and .catchall(z.never()) emit
// `additionalProperties: false` — including at nested nodes and inside
// $defs (reused: "ref"). z.record emits an object there, never false.
// Keywords whose values are DATA, not schemas — a default/example payload
// may legitimately contain {additionalProperties: false} as a literal (e.g.
// tools that edit JSON-schema-shaped config) and must not trip the guard.
const NON_SCHEMA_KEYWORDS = new Set(["default", "examples", "const", "enum"]);
// Keywords whose value is a map of arbitrary NAME → subschema: the names
// themselves are data (a property may be called "default"), the values are
// schema positions.
const SCHEMA_MAP_KEYWORDS = new Set([
  "properties",
  "patternProperties",
  "$defs",
  "definitions",
  "dependentSchemas",
]);

function findUnknownKeyRejectingPath(
  node: unknown,
  path: string,
): string | null {
  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i++) {
      const hit = findUnknownKeyRejectingPath(node[i], `${path}[${i}]`);
      if (hit !== null) return hit;
    }
    return null;
  }
  if (node === null || typeof node !== "object") return null;
  const obj = node as Record<string, unknown>;
  if (obj.additionalProperties === false) return path;
  // Keyed records (z.record(z.enum(...)) / regex-keyed) emit no `false`
  // marker but still reject unknown keys at parse — the constraint lives on
  // propertyNames instead.
  const pn = obj.propertyNames;
  if (
    pn !== null && typeof pn === "object" && !Array.isArray(pn) &&
    ("enum" in pn || "const" in pn || "pattern" in pn)
  ) {
    return `${path}.propertyNames`;
  }
  for (const [key, value] of Object.entries(obj)) {
    if (NON_SCHEMA_KEYWORDS.has(key)) continue;
    if (
      SCHEMA_MAP_KEYWORDS.has(key) && value !== null &&
      typeof value === "object" && !Array.isArray(value)
    ) {
      for (const [name, sub] of Object.entries(value)) {
        const hit = findUnknownKeyRejectingPath(sub, `${path}.${key}.${name}`);
        if (hit !== null) return hit;
      }
      continue;
    }
    const hit = findUnknownKeyRejectingPath(value, `${path}.${key}`);
    if (hit !== null) return hit;
  }
  return null;
}

function assertSchemaAcceptsUnknownKeys(
  toolName: string,
  schema: zType.ZodType,
): void {
  const inputSchema = z.toJSONSchema(schema, { io: "input", reused: "ref" });
  const hit = findUnknownKeyRejectingPath(inputSchema, "$");
  if (hit !== null) {
    throw new Error(
      `createAITool("${toolName}"): input schema rejects unknown keys at ${hit} (z.strictObject, .catchall(z.never()), or an enum/pattern-keyed z.record). Tool schemas must accept unknown keys — Claude sometimes emits extra metadata keys, and a rejecting schema then errors on every call.`,
    );
  }
}

function zodToJsonSchema(zodSchema: zType.ZodType): {
  type: "object";
  properties?: Record<string, unknown>;
  required?: string[];
  additionalProperties: false;
} {
  const jsonSchema = z.toJSONSchema(zodSchema, { reused: "ref" });

  if (jsonSchema.type !== "object") {
    throw new Error(`Zod schema must be an object, but got ${jsonSchema.type}`);
  }

  return jsonSchema as {
    type: "object";
    properties?: Record<string, unknown>;
    required?: string[];
    additionalProperties: false;
  };
}

function parseToolInput<TInput>(
  schema: zType.ZodType<TInput>,
  input: unknown,
): TInput {
  try {
    return schema.parse(input) as TInput;
  } catch (e) {
    if (e instanceof z.ZodError) {
      throw new AIToolFailure(`Invalid input:\n${z.prettifyError(e)}`);
    }
    throw e;
  }
}

export function createAITool<TInput, TOutput = string>(
  config: CreateAIToolConfig<TInput, TOutput>,
): AIToolWithMetadata<TInput> {
  assertSchemaAcceptsUnknownKeys(config.name, config.inputSchema);
  if (config.availableIn !== undefined && config.availableIn.length === 0) {
    throw new Error(
      `createAITool("${config.name}"): availableIn is empty — the tool would be executable nowhere. Omit the field for an everywhere-available tool.`,
    );
  }
  // Runtime XOR backstop for erased/JS callers (the union type is the
  // compile-time guard).
  const hasHandler = typeof config.handler === "function";
  const hasApproval = config.approval !== undefined;
  if (hasHandler === hasApproval) {
    throw new Error(
      `createAITool("${config.name}"): exactly one of handler or approval must be set — a tool either executes directly or goes through the confirm-before-apply lifecycle.`,
    );
  }
  const approvalMeta: ErasedApprovalConfig | undefined = config.approval
    ? {
      prepare: (input: unknown, ctx: { signal: AbortSignal }) =>
        config.approval!.prepare(input as TInput, ctx),
      mode: config.approval.mode ?? "always",
      presentation: config.approval.presentation ?? "inline",
    }
    : undefined;
  if (
    approvalMeta && approvalMeta.mode === "session" &&
    approvalMeta.presentation === "modal"
  ) {
    throw new Error(
      `createAITool("${config.name}"): approval mode "session" requires presentation "inline" — the modal dialog has no "don't ask again" affordance.`,
    );
  }

  // Static availability hint: the cheapest cache-stable channel to the model
  // (per-tool, byte-stable across navigation) — it learns the view map from
  // the tool definitions it reads when choosing tools, before its first
  // refusal. Derived from declared metadata, no opt-out (like the gate
  // message).
  const description = config.availableIn
    ? `${config.description}\n\n${buildAvailabilityHint(config.availableIn)}`
    : config.description;

  const sdkTool: SDKTool<TInput> = {
    name: config.name,
    description,
    input_schema: zodToJsonSchema(config.inputSchema),
    parse: (content: unknown) => parseToolInput(config.inputSchema, content),
    run: async (input: TInput) => {
      // An approval tool never executes through run(): the chat loop
      // branches on metadata.approval BEFORE the tool engine, and every
      // other execution path (processToolUses fallback, direct calls) has
      // no user to ask — fail loud instead of silently mutating.
      if (approvalMeta) {
        throw new Error(
          `Tool "${config.name}" requires user approval and can only execute inside the chat approval lifecycle (createAIChat).`,
        );
      }
      // Validate here too — the manual chat loop calls run() directly
      // without going through parse().
      const validated = parseToolInput(config.inputSchema, input);
      const result = await Promise.resolve(config.handler!(validated));
      return typeof result === "string" ? result : JSON.stringify(result);
    },
  };

  const metadata: ToolUIMetadata<TInput> = {
    displayComponent: config.displayComponent,
    inProgressComponent: config.inProgressComponent,
    inProgressLabel: config.inProgressLabel,
    completionMessage: config.completionMessage,
    successMessage: config.successMessage,
    errorMessage: config.errorMessage,
    availableIn: config.availableIn,
    kind: config.kind,
    approval: approvalMeta,
    awaitsUserAction: approvalMeta ? true : undefined,
  };

  return {
    sdkTool,
    metadata,
  };
}
