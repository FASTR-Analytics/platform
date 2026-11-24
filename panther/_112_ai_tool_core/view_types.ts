// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { GateView, zType } from "./deps.ts";

////////////////////////////////////////////////////////////////////////////////
// AI VIEW TYPES (the inert layer)
////////////////////////////////////////////////////////////////////////////////
//
// Views give the chat engine an organizing concept for "where the user is":
// the app declares its views once (label, optional params schema, optional
// per-view prompt section), keeps a controller in sync with its navigation,
// and the engine injects a [Current view: …] section into each turn.
//
// This file holds the part with NO runtime state: the view declarations, the
// registry they form, and the types derived from it. tool_helpers.ts and
// navigation_tool.ts type themselves against a REGISTRY (inert data —
// nothing to close over, no identity semantics); views.ts adds the live
// controller on top. Keeping the two apart is what lets a tool be a
// standalone declaration that still knows the app's views: the registry is
// the only thing tool creation ever needs, and the live view state is
// injected by the engine at execution.
//
// It also resolves a view's definition against a view state, for the chat's
// controller and for a trial sent from a view alike: a message from a view
// carries the same sections whichever surface sends it only if both resolve
// it through the same functions.
//
// TParams is the serializable, model-visible part (validated on setView when
// a schema is given); TContext is the non-serializable payload (live editor
// closures) delivered to tool handlers — panther passes it through without
// introspecting it. TContext appears in no field TS can infer from, so the
// AIView marker carries a structural phantom property; without it structural
// typing collapses the context types and defineAIViews loses them.

// What a view shows, as string fields: the entity, and any package and scope
// around it (`{ deckId, slideId }`). Compared by canonical key (keys sorted,
// then JSON), so field order never matters.
export type AIViewIdentity = Readonly<Record<string, string>>;

// What a display card keeps of the view its tool ran in: the id and the
// identity, never params or context, since it persists with the
// conversation. identity is absent when the view declares none.
export type AIViewSnapshot = {
  id: string;
  identity?: AIViewIdentity;
};

export type AIViewDefinition<TParams, TContext> = {
  // The one-line current-view statement injected each turn, resolved at send
  // time against the live params/context. The rendered section always pairs
  // the stable view id with this label (view_logic.ts owns the format).
  label: string | ((params: TParams, context: TContext) => string);
  // Optional zod schema for params; setView parses through it when present.
  params?: zType.ZodType<TParams>;
  // The identity of what the view shows. The gate refuses a view-limited
  // call once the live identity differs from the one the turn last told the
  // model, which the view id alone cannot see: two slides of one deck both
  // sit in "editing_slide". Absent, the id is the whole identity. Resolved
  // like the label: a throw logs and counts as a move.
  identity?:
    | AIViewIdentity
    | ((params: TParams, context: TContext) => AIViewIdentity);
  // What the view shows right now that changes without a navigation: the
  // selection, the cursor, a filter. Rides every message as a view-state
  // section, so keep it to a line or two; text that holds across messages
  // belongs in `instructions`, which the engine sends once per text.
  // Resolved like the label: a throw logs and drops the section for this
  // turn, never a failed turn.
  state?: (params: TParams, context: TContext) => string | null;
  // Optional per-view instructions for the model. NOT part of the system
  // prompt — with "ephemeral" delivery this rides each turn as its own
  // section (that separation is the cache design). Keep it SMALL (a few
  // hundred tokens): it is per-turn payload.
  instructions?: string | ((params: TParams, context: TContext) => string);
  // "ephemeral" (default): the engine attaches instructions as a
  // view-instructions section on the turn — the system prompt stays
  // byte-stable across navigation, so its cache breakpoint keeps hitting.
  // "manual": the engine does not deliver it; the consumer composes
  // instructions() into their own system accessor (accepting the cache miss
  // on view changes).
  instructionsDelivery?: "ephemeral" | "manual";
};

// The marker view() returns. _def is engine-internal; __aiViewTypes is a
// type-only phantom (never assigned) carrying TParams/TContext through
// inference.
export type AIView<TParams = void, TContext = void> = {
  readonly _def: AIViewDefinition<TParams, TContext>;
  readonly __aiViewTypes?: (params: TParams, context: TContext) => void;
};

// NoInfer on the return type is load-bearing: inside defineAIViews({...})
// the contextual type of each property is the constraint's AIView<any, any>,
// and without the block those `any`s beat the void defaults — a label-only
// view({ label: "Home" }) would silently become AIView<any, any> and poison
// every handler union (any absorbs).
export function view<TParams = void, TContext = void>(
  def: AIViewDefinition<TParams, TContext>,
): AIView<NoInfer<TParams>, NoInfer<TContext>> {
  return { _def: def };
}

// deno-lint-ignore no-explicit-any
export type AnyAIView = AIView<any, any>;

export type AIViewRegistry<TDefs extends Record<string, AnyAIView>> = {
  readonly _defs: TDefs;
};

export function defineAIViews<TDefs extends Record<string, AnyAIView>>(
  defs: TDefs,
): AIViewRegistry<TDefs> {
  return { _defs: defs };
}

// deno-lint-ignore no-explicit-any
export type AIViewParams<V> = V extends AIView<infer P, any> ? P : never;
// deno-lint-ignore no-explicit-any
export type AIViewContext<V> = V extends AIView<any, infer C> ? C : never;

// {id, params, context} read together, atomically — a discriminated union
// over the registry's keys.
export type AIViewState<TDefs extends Record<string, AnyAIView>> = {
  [K in keyof TDefs]: {
    id: K;
    params: AIViewParams<TDefs[K]>;
    context: AIViewContext<TDefs[K]>;
  };
}[keyof TDefs];

// setView drops trailing void arguments. Params stay positional (a view with
// context but no params is called setView(id, undefined, context)) — the
// slots are type-erased at runtime, so the engine could not tell a lone
// context argument from a params one.
export type SetViewArgs<
  TDefs extends Record<string, AnyAIView>,
  K extends keyof TDefs,
> = [AIViewParams<TDefs[K]>] extends [void]
  ? [AIViewContext<TDefs[K]>] extends [void] ? []
  : [params: undefined, context: AIViewContext<TDefs[K]>]
  : [AIViewContext<TDefs[K]>] extends [void] ? [params: AIViewParams<TDefs[K]>]
  : [params: AIViewParams<TDefs[K]>, context: AIViewContext<TDefs[K]>];

// Keys of views declared with void params AND void context — the only valid
// fallback targets (clearView cannot supply arguments).
export type AIViewVoidKeys<TDefs extends Record<string, AnyAIView>> = {
  [K in keyof TDefs]: [AIViewParams<TDefs[K]>] extends [void]
    ? [AIViewContext<TDefs[K]>] extends [void] ? K : never
    : never;
}[keyof TDefs];

// The view state setView sets, as setView parses it: the id must name a view
// of the registry, and the params pass the view's params schema before
// anything reads them.
export function parseViewState<
  TDefs extends Record<string, AnyAIView>,
  K extends keyof TDefs,
>(
  registry: AIViewRegistry<TDefs>,
  id: K,
  ...args: SetViewArgs<TDefs, K>
): AIViewState<TDefs> {
  if (!Object.hasOwn(registry._defs, id)) {
    throw new Error(
      `Unknown view id "${String(id)}"; the view registry holds ${
        Object.keys(registry._defs).map((key) => `"${key}"`).join(", ")
      }.`,
    );
  }
  const marker = registry._defs[id];
  const rawArgs = args as unknown[];
  const params = marker._def.params
    ? marker._def.params.parse(rawArgs[0])
    : rawArgs[0];
  return { id, params, context: rawArgs[1] } as AIViewState<TDefs>;
}

// Resolve a view's label against live params/context. Shared by the
// controller (turn sections, currentLabel) and the navigation tool (its
// result message): a label callback reads app state that may be torn down,
// so a throw degrades to the bare view id and never fails a turn.
export function resolveViewLabel(
  def: AIViewDefinition<unknown, unknown>,
  id: string,
  params: unknown,
  context: unknown,
): string | null {
  if (typeof def.label === "string") return def.label;
  try {
    return def.label(params, context);
  } catch (err) {
    console.error(
      `AI view label for "${id}" threw; using the bare view id. A stale label must never fail a turn.`,
      err,
    );
    return null;
  }
}

// A view's instructions, whatever their delivery: the engine sends an
// ephemeral view's, and a manual view's are the consumer's to compose. A
// throw drops the section for the turn.
export function resolveViewInstructions(
  def: AIViewDefinition<unknown, unknown>,
  id: string,
  params: unknown,
  context: unknown,
): string | null {
  if (def.instructions === undefined) return null;
  if (typeof def.instructions === "string") return def.instructions;
  try {
    return def.instructions(params, context);
  } catch (err) {
    console.error(
      `AI view instructions for "${id}" threw; dropping the section for this turn.`,
      err,
    );
    return null;
  }
}

function resolveViewStateText(
  def: AIViewDefinition<unknown, unknown>,
  id: string,
  params: unknown,
  context: unknown,
): string | null {
  if (def.state === undefined) return null;
  try {
    return def.state(params, context);
  } catch (err) {
    console.error(
      `AI view state for "${id}" threw; dropping the section for this turn.`,
      err,
    );
    return null;
  }
}

// undefined: the view declares no identity; null: it threw, which the gate
// treats as a move (never equal), so a stale identity refuses view-limited
// calls until the user writes instead of failing the turn.
function resolveViewIdentity(
  def: AIViewDefinition<unknown, unknown>,
  id: string,
  params: unknown,
  context: unknown,
): AIViewIdentity | null | undefined {
  if (def.identity === undefined) return undefined;
  if (typeof def.identity !== "function") return def.identity;
  try {
    return def.identity(params, context);
  } catch (err) {
    console.error(
      `AI view identity for "${id}" threw; view-limited calls are refused until the user writes. A stale identity must never fail a turn.`,
      err,
    );
    return null;
  }
}

function definitionOf<TDefs extends Record<string, AnyAIView>>(
  registry: AIViewRegistry<TDefs>,
  state: AIViewState<TDefs>,
): AIViewDefinition<unknown, unknown> {
  return registry._defs[state.id]._def as AIViewDefinition<unknown, unknown>;
}

// The view as the view line names it and the gate compares it.
export function resolveGateView<TDefs extends Record<string, AnyAIView>>(
  registry: AIViewRegistry<TDefs>,
  state: AIViewState<TDefs>,
): GateView {
  const def = definitionOf(registry, state);
  const id = String(state.id);
  const label = resolveViewLabel(def, id, state.params, state.context);
  const identity = resolveViewIdentity(def, id, state.params, state.context);
  return identity === undefined ? { id, label } : { id, label, identity };
}

// The parts of the view sections a message sent from this view state
// carries; view is also the reference the turn's gate checks calls against.
export type ViewSectionParts = {
  view: GateView;
  viewState: string | null;
  viewInstructions: string | null;
};

export function resolveViewSectionParts<
  TDefs extends Record<string, AnyAIView>,
>(
  registry: AIViewRegistry<TDefs>,
  state: AIViewState<TDefs>,
): ViewSectionParts {
  const def = definitionOf(registry, state);
  const id = String(state.id);
  return {
    view: resolveGateView(registry, state),
    viewState: resolveViewStateText(def, id, state.params, state.context),
    viewInstructions: def.instructionsDelivery === "manual"
      ? null
      : resolveViewInstructions(def, id, state.params, state.context),
  };
}

// The view state narrowed to a subset of the registry's keys — what a typed
// tool handler receives when the tool declares availableIn.
export type AIViewStateFor<
  TDefs extends Record<string, AnyAIView>,
  K extends keyof TDefs,
> = {
  [P in K]: {
    id: P;
    params: AIViewParams<TDefs[P]>;
    context: AIViewContext<TDefs[P]>;
  };
}[K];
