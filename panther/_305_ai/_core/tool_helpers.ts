// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { buildAvailabilityHint, z } from "../deps.ts";
import type { Component, zType } from "../deps.ts";
import { AIToolFailure } from "./tool_failure.ts";
import type {
  AIViewRegistry,
  AIViewState,
  AIViewStateFor,
  AnyAIView,
} from "./view_types.ts";

export { AIToolFailure } from "./tool_failure.ts";

// "write" drives approval policy (approvalPolicy.requireForKind, Feature 4);
// "read"/"nav" are forward metadata (actions-registry stamping, catalog
// grouping) with no engine behavior today.
export type AIToolKind = "read" | "write" | "nav";

////////////////////////////////////////////////////////////////////////////////
// TOOL APPROVAL (confirm-before-apply — Feature 4)
////////////////////////////////////////////////////////////////////////////////
//
// The lifecycle is panther-owned: propose a preview → show it → await the
// user's decision → commit or report declined. The tool declares the phases;
// the engine owns everything between them (card, decision ownership,
// view-exit auto-decline, outcome strings). The structural guarantee is the
// point: commit only exists inside a ProposalResult and panther only invokes
// it after an accepted decision — the mutation CANNOT run before consent as
// a matter of API shape. propose must be read-only by contract (same trust
// level as "handlers must throw, not catch").

export type ProposalPreview = {
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

export type ProposalResult<TOutput> =
  // No-op detected — returned to the model as a NORMAL tool result; no
  // decision is requested and commit never exists.
  | { skip: string }
  // Validation failed in propose — is_error result with the expected-failure
  // display (same mapping as a thrown AIToolFailure); commit never exists.
  | { invalid: string }
  | {
    preview: ProposalPreview;
    // Runs ONLY after an accepted decision.
    commit: () => Promise<TOutput> | TOutput;
    // Optional data-staleness check, evaluated when an ACCEPT decision
    // arrives (view-exit staleness is engine-handled via availableIn).
    // false → resolved as declined-stale, commit never runs.
    stillValid?: () => boolean;
    // Replaces panther's built-in card/modal with the app's own UI for
    // reviewing the proposal (e.g. a diff staged inside an editor). The
    // engine renders nothing; it calls this and awaits the user's decision
    // (true = accept). Panther still owns serialization, timeline
    // recording, and outcome shaping — `preview` is still REQUIRED: it is
    // the timeline's decision record; this function is only the live UI.
    // The signal aborts when the engine resolves the decision externally
    // (view-exit auto-decline, Stop) — this UI MUST clean itself up on
    // abort; unmount luck is not a cleanup mechanism.
    customProposalUI?: (signal: AbortSignal) => Promise<boolean>;
  };

// Shared by both createAITool shapes; the view-typed variant only differs in
// propose's signature (see ViewAIToolApprovalConfig).
type ApprovalConfigCommon = {
  // "session" adds a "don't ask again in this conversation" checkbox to the
  // inline card; later calls short-circuit to auto_approved (propose still
  // runs, presentation is skipped, commit runs). Requires presentation
  // "inline" (construction throw — the modal has no checkbox affordance).
  // NOTE: a propose that returns a customProposalUI override never offers the
  // checkbox either (a custom presenter has no checkbox affordance), so a
  // session-mode tool that ALWAYS presents custom can never arm the
  // auto-approve — the flag only sets through the inline card.
  mode?: "always" | "session";
  presentation?: "inline" | "modal";
};

export type AIToolApprovalConfig<TInput, TOutput> = ApprovalConfigCommon & {
  // ctx carries the turn's AbortSignal so a long server-side propose can
  // cancel on Stop (the post-propose abort check remains the correctness
  // backstop).
  propose: (
    input: TInput,
    ctx: { signal: AbortSignal },
  ) => Promise<ProposalResult<TOutput>> | ProposalResult<TOutput>;
};

// The view-typed propose: same contract, plus the live view state the engine
// injects — narrowed to availableIn exactly like the handler's.
export type ViewAIToolApprovalConfig<
  TDefs extends Record<string, AnyAIView>,
  K extends keyof TDefs,
  TInput,
  TOutput,
> = ApprovalConfigCommon & {
  propose: (
    input: TInput,
    view: NoInfer<AIViewStateFor<TDefs, K>>,
    ctx: { signal: AbortSignal },
  ) => Promise<ProposalResult<TOutput>> | ProposalResult<TOutput>;
};

// Engine-facing erased shape stored on ToolUIMetadata (defaults resolved at
// construction).
export type ErasedApprovalConfig = {
  // The engine passes the live view state (undefined when the chat has no
  // view controller); the plain, view-less config shape drops it.
  propose: (
    input: unknown,
    view: unknown,
    ctx: { signal: AbortSignal },
  ) => Promise<ProposalResult<unknown>> | ProposalResult<unknown>;
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

  // Engine-internal: the view REGISTRY this tool was typed against
  // (createAITool's `viewRegistry` field). Registration verifies the chat's
  // controller tracks the same registry — a tool typed against registry A
  // registered on a chat gating against registry B would pass the gate on a
  // coincidentally-matching id while its handler reads params/context of a
  // different shape. Inert data, so a second CONTROLLER over the same
  // registry is fine: handlers close over nothing, the engine injects the
  // bound controller's state. Never set by consumers.
  _viewRegistry?: unknown;

  // Engine-internal: this tool performs AI-driven navigation, so the chat
  // loop opens the controller's AI-navigation attribution window around its
  // execution (markAINavigation before and after) — the resulting
  // setView/clearView events are stamped origin "ai" and dropped from the
  // __navigation digest instead of reading as "User navigated". Set by
  // createNavigationTool. Never set by consumers.
  attributesNavigation?: boolean;

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
  // SDK-shaped, and it stays that way: run()'s SECOND parameter belongs to
  // the SDK's tool runner, which passes a context object there
  // (BetaToolRunner: `tool.run(input, { toolUse, toolUseBlock, signal })`).
  // Panther must never read that slot — an earlier revision put the view
  // accessor in it, and every callAI tool call died on `getView is not a
  // function` because the SDK's object is truthy. View state gets its own
  // method below instead of competing for this one.
  run: (input: TInput) => Promise<string>;
  // Engine-only execution path: same work as run(), plus the live view
  // accessor the chat loop injects. Handlers receive a SNAPSHOT (getView()
  // is called once, at handler entry), which is what the gate guarantees:
  // the check and the call are the same microtask. Optional because
  // hand-constructed consumer tools only have run(); processToolUses falls
  // back to run() when it is absent. Never given to the SDK.
  runWithView?: (input: TInput, getView?: () => unknown) => Promise<string>;
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

  kind?: AIToolKind;
}

// Exactly one of handler / approval — enforced at the type level (the XOR
// union) and again at construction for erased callers. A tool either
// executes directly or goes through the confirm-before-apply lifecycle;
// there is no "handler with a confirm inside" (that convention is exactly
// what approval replaces).
//
// The plain shape: no view registry, so availableIn is unchecked strings
// (validated against the chat's registry at registration) and the handler
// takes input only.
export type CreateAIToolConfig<TInput, TOutput = string> =
  & CreateAIToolConfigCommon<TInput>
  & {
    // See ToolUIMetadata.availableIn. Declare `viewRegistry` to have these
    // ids checked against the real registry at COMPILE time and to receive
    // the live view state in the handler.
    availableIn?: readonly string[];
    // Declared (as never) rather than absent, deliberately: excess-property
    // checking only fires on FRESH object literals, so a config assembled
    // via a spread or an intermediate const could otherwise carry
    // `viewRegistry` into this shape — and it is what buildAITool reads to decide
    // whether propose takes (input, view, ctx) or (input, ctx). That
    // mismatch put the view state in propose's ctx slot at runtime. As a
    // declared property this is a plain assignability failure, which
    // freshness does not gate.
    viewRegistry?: never;
  }
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

// The GATED view-typed shape: `viewRegistry` is the app's INERT view registry
// (the defineAIViews result — no state, nothing to close over), and it buys two
// things at compile time that no other arrangement does without an import
// per tool file or a global augmentation:
//
//   1. availableIn is constrained to the registry's real view ids — a typo
//      is a compile error, not a boot-time throw.
//   2. the handler (and approval.propose) receives the live view state
//      NARROWED to those ids, so view.params / view.context are typed per
//      view and mode-guard boilerplate becomes unwritable.
//
// The soundness invariant — a narrowed view is unwritable without a runtime
// gate — is enforced STRUCTURALLY, two ways that together cover every spelling:
//   - K lives ONLY here, and this shape REQUIRES availableIn. So pinning K
//     narrow (an explicit type argument, or a CreateViewAIToolConfig
//     annotation) forces availableIn along with it; omit it and the config
//     falls to the ungated shape (CreateUngatedViewAIToolConfig), which has no
//     K and hands the handler the full union.
//   - NoInfer on the view parameter blocks the remaining path: an annotated
//     handler param can no longer INFER K narrow while availableIn stays
//     absent. (Proven in the Phase 1+2 review; the explicit-K half was
//     PLAN_AI_TOOL_GATE_SOUNDNESS.)
export type CreateViewAIToolConfig<
  TDefs extends Record<string, AnyAIView>,
  K extends keyof TDefs,
  TInput,
  TOutput,
> =
  & CreateAIToolConfigCommon<TInput>
  & {
    viewRegistry: AIViewRegistry<TDefs>;
    // REQUIRED on the gated shape (was optional). A narrowed handler view only
    // exists WITH a gate: the ungated shape below carries no K, so a subset
    // view cannot be expressed there. This closes the hole where an explicit
    // type argument (or a CreateViewAIToolConfig annotation) pinned K narrow
    // while availableIn stayed absent — a narrowed type with no runtime gate.
    availableIn: readonly K[];
  }
  & (
    | {
      handler: (
        input: TInput,
        view: NoInfer<AIViewStateFor<TDefs, K>>,
      ) => Promise<TOutput> | TOutput;
      approval?: never;
    }
    | {
      handler?: never;
      approval: ViewAIToolApprovalConfig<TDefs, K, TInput, TOutput>;
    }
  );

// The ungated view-typed shape: `viewRegistry` present, NO availableIn, and no
// K type parameter. handler / approval.propose receive the FULL narrowable
// union (the "family guard" pattern — narrow by view.id at runtime). Split out
// from CreateViewAIToolConfig so the ungated path has no K to pin: with no K in
// scope, a handler typed for a subset of views is unwritable here, and the
// gated shape requires availableIn — so neither spelling can express a narrow
// view without a gate.
export type CreateUngatedViewAIToolConfig<
  TDefs extends Record<string, AnyAIView>,
  TInput,
  TOutput,
> =
  & CreateAIToolConfigCommon<TInput>
  & {
    viewRegistry: AIViewRegistry<TDefs>;
    availableIn?: never;
  }
  & (
    | {
      handler: (
        input: TInput,
        view: NoInfer<AIViewState<TDefs>>,
      ) => Promise<TOutput> | TOutput;
      approval?: never;
    }
    | {
      handler?: never;
      approval: ViewAIToolApprovalConfig<TDefs, keyof TDefs, TInput, TOutput>;
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

// The erased config buildAITool works in: both public shapes reduced to
// "optional registry, optional availableIn, handler/propose that may take
// the injected view". Engine-internal — consumers reach it only through the
// two createAITool overloads, which is why the internal-only
// _liveViewAccessor escape hatch can live here and nowhere in the public
// surface.
// deno-lint-ignore no-explicit-any
type Any = any;
type ErasedCreateAIToolConfig =
  & CreateAIToolConfigCommon<Any>
  & {
    viewRegistry?: AIViewRegistry<Record<string, AnyAIView>>;
    availableIn?: readonly PropertyKey[];
    handler?: (input: Any, view?: Any) => Any;
    // createNavigationTool only: pass the live view ACCESSOR to the handler
    // instead of an entry-time snapshot. The navigation tool must read the
    // view AFTER its routing callback settles; every other handler wants the
    // snapshot the gate check guarantees.
    _liveViewAccessor?: boolean;
    approval?: {
      // The plain shape's propose reads the second slot as ctx;
      // `viewRegistry` is
      // the discriminator that decides which it is (see the wrapper below).
      propose: (input: Any, viewOrCtx: Any, ctx?: Any) => Any;
      mode?: "always" | "session";
      presentation?: "inline" | "modal";
    };
  };

// View-typed, in two overloads by gate. `viewRegistry` is the discriminator
// against the plain overload; `availableIn`'s presence discriminates gated
// (K narrows) from ungated (full union). The split is the gate-soundness fix:
//   - GATED carries K and REQUIRES availableIn, so a narrowed handler view
//     always has a gate behind it.
//   - UNGATED carries NO K, so a subset view is unexpressible — the only
//     handler type available is the full union.
// An explicit type argument that pins K narrow (createAITool<D, In, Out, "v">)
// therefore only matches the gated overload, which then demands availableIn;
// omit it and no overload matches (the ungated one has fewer type params).
export function createAITool<
  TDefs extends Record<string, AnyAIView>,
  TInput,
  TOutput = string,
  K extends keyof TDefs = keyof TDefs,
>(
  config: CreateViewAIToolConfig<TDefs, K, TInput, TOutput>,
): AIToolWithMetadata<TInput>;
export function createAITool<
  TDefs extends Record<string, AnyAIView>,
  TInput,
  TOutput = string,
>(
  config: CreateUngatedViewAIToolConfig<TDefs, TInput, TOutput>,
): AIToolWithMetadata<TInput>;
export function createAITool<TInput, TOutput = string>(
  config: CreateAIToolConfig<TInput, TOutput>,
): AIToolWithMetadata<TInput>;
export function createAITool<TInput>(
  config: ErasedCreateAIToolConfig,
): AIToolWithMetadata<TInput> {
  return buildAITool(config);
}

// The single construction path. createNavigationTool calls this directly:
// its handler takes the live view ACCESSOR, a shape no public overload
// describes (and none should).
export function buildAITool<TInput>(
  config: ErasedCreateAIToolConfig,
): AIToolWithMetadata<TInput> {
  assertSchemaAcceptsUnknownKeys(config.name, config.inputSchema);
  if (config.availableIn !== undefined && config.availableIn.length === 0) {
    throw new Error(
      `createAITool("${config.name}"): availableIn is empty — the tool would be executable nowhere. Omit the field for an everywhere-available tool.`,
    );
  }
  // String coercion: numeric-looking registry keys would otherwise be stored
  // as numbers and mismatch the registry's Object.keys strings at bind/gate
  // time.
  const availableIn = config.availableIn?.map((id) => String(id));
  // Compile-time typing is the primary guard when `viewRegistry` is declared;
  // this runtime check covers erased/any-typed callers. (A tool without it
  // is checked against the chat's registry at registration instead — the
  // only place its ids can be known.)
  if (config.viewRegistry && availableIn) {
    for (const id of availableIn) {
      if (!config.viewRegistry._defs[id]) {
        throw new Error(
          `createAITool("${config.name}"): availableIn references view id "${id}", which is not in the viewRegistry passed to this tool.`,
        );
      }
    }
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
  // `viewRegistry` decides propose's shape: view-typed tools receive
  // (input, view, ctx), plain ones keep (input, ctx). The engine always has
  // both to hand, so the split is a declaration read, never arity sniffing.
  const proposeTakesView = config.viewRegistry !== undefined;
  const approvalMeta: ErasedApprovalConfig | undefined = config.approval
    ? {
      propose: (
        input: unknown,
        view: unknown,
        ctx: { signal: AbortSignal },
      ) =>
        proposeTakesView
          ? config.approval!.propose(input as TInput, view, ctx)
          : config.approval!.propose(input as TInput, ctx),
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
  const description = availableIn
    ? `${config.description}\n\n${buildAvailabilityHint(availableIn)}`
    : config.description;

  // One implementation, two entry points: run() for the SDK (input only) and
  // runWithView() for the chat loop (input + the live view accessor).
  const execute = async (
    input: TInput,
    getView?: () => unknown,
  ): Promise<string> => {
    // An approval tool never executes here: the chat loop branches on
    // metadata.approval BEFORE the tool engine, and every other execution
    // path (processToolUses fallback, direct calls) has no user to ask —
    // fail loud instead of silently mutating.
    if (approvalMeta) {
      throw new Error(
        `Tool "${config.name}" requires user approval and can only execute inside the chat approval lifecycle (createAIChat).`,
      );
    }
    // Validate here too — the manual chat loop calls run() directly without
    // going through parse().
    const validated = parseToolInput(config.inputSchema, input);
    // The engine injects the live view state; a handler that ignores it
    // (every plain tool) simply declares one parameter.
    const result = await Promise.resolve(
      config.handler!(
        validated,
        config._liveViewAccessor ? getView : getView?.(),
      ),
    );
    return typeof result === "string" ? result : JSON.stringify(result);
  };

  const sdkTool: SDKTool<TInput> = {
    name: config.name,
    description,
    input_schema: zodToJsonSchema(config.inputSchema),
    parse: (content: unknown) => parseToolInput(config.inputSchema, content),
    // Exactly one parameter: the SDK owns the rest of the signature.
    run: (input: TInput) => execute(input),
    runWithView: (input: TInput, getView?: () => unknown) =>
      execute(input, getView),
  };

  const metadata: ToolUIMetadata<TInput> = {
    displayComponent: config.displayComponent,
    inProgressComponent: config.inProgressComponent,
    inProgressLabel: config.inProgressLabel,
    completionMessage: config.completionMessage,
    successMessage: config.successMessage,
    errorMessage: config.errorMessage,
    availableIn,
    kind: config.kind,
    approval: approvalMeta,
    awaitsUserAction: approvalMeta ? true : undefined,
    _viewRegistry: config.viewRegistry,
  };

  return {
    sdkTool,
    metadata,
  };
}

// Partial application of createAITool over one app's view registry: the app
// names its registry ONCE and every tool file calls the bound function with
// no `viewRegistry` line and no registry import.
//
//   // app, once, next to the registry:
//   export const createProjectAITool = aiToolFactory(projectAIViews);
//
//   // every tool file:
//   createProjectAITool({ name, availableIn: ["editing_report"], handler });
//
// This is sugar, not a second way to build a tool: it forwards to
// createAITool and every compile-time property survives the wrapper —
// availableIn is still checked against the registry, the handler/propose
// view is still narrowed to availableIn, and a narrowed view with no gate is
// still unwritable (all pinned in ai_2_gating's _typeChecks). The returned
// function carries the SAME gated/ungated overload pair as createAITool, so
// the gate-soundness split holds through partial application: an explicit K
// (mk<In, Out, "v">) matches only the gated overload, which requires
// availableIn. The trade for that soundness is diagnostics — an unassignable
// property now fails overload resolution and reports on the call rather than
// the property.
//
// The cast is a contained wart, not a hole: Omit<> over the handler/approval
// XOR flattens the union into one object with both members optional, so the
// forwarded value no longer matches either arm. The CALL SITE is still
// checked against the un-flattened config type — only this internal forward
// needs the assertion.
type ViewAIToolFactory<TDefs extends Record<string, AnyAIView>> = {
  <TInput, TOutput = string, K extends keyof TDefs = keyof TDefs>(
    config: Omit<
      CreateViewAIToolConfig<TDefs, K, TInput, TOutput>,
      "viewRegistry"
    >,
  ): AIToolWithMetadata<TInput>;
  <TInput, TOutput = string>(
    config: Omit<
      CreateUngatedViewAIToolConfig<TDefs, TInput, TOutput>,
      "viewRegistry"
    >,
  ): AIToolWithMetadata<TInput>;
};

export function aiToolFactory<TDefs extends Record<string, AnyAIView>>(
  viewRegistry: AIViewRegistry<TDefs>,
): ViewAIToolFactory<TDefs> {
  const make = <TInput>(
    config: Omit<ErasedCreateAIToolConfig, "viewRegistry">,
  ): AIToolWithMetadata<TInput> =>
    buildAITool({ ...config, viewRegistry } as ErasedCreateAIToolConfig);
  return make as ViewAIToolFactory<TDefs>;
}
