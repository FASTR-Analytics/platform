// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { zType } from "../deps.ts";

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
// TParams is the serializable, model-visible part (validated on setView when
// a schema is given); TContext is the non-serializable payload (live editor
// closures) delivered to tool handlers — panther passes it through without
// introspecting it. TContext appears in no field TS can infer from, so the
// AIView marker carries a structural phantom property; without it structural
// typing collapses the context types and defineAIViews loses them.

export type AIViewDefinition<TParams, TContext> = {
  // The one-line current-view statement injected each turn, resolved at send
  // time against the live params/context. The rendered section always pairs
  // the stable view id with this label (view_logic.ts owns the format).
  label: string | ((params: TParams, context: TContext) => string);
  // Optional zod schema for params; setView parses through it when present.
  params?: zType.ZodType<TParams>;
  // Optional per-view instructions for the model. Keep it SMALL (a few
  // hundred tokens): with "ephemeral" delivery it is per-turn payload.
  promptSection?: string | ((params: TParams, context: TContext) => string);
  // "ephemeral" (default): the engine attaches promptSection as a
  // view-prompt section on the turn — the system prompt stays byte-stable
  // across navigation, so its cache breakpoint keeps hitting. "manual": the
  // engine does not deliver it; the consumer composes promptSection() into
  // their own system accessor (accepting the cache miss on view changes).
  promptDelivery?: "ephemeral" | "manual";
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
// every handler union (any absorbs). Proven in the Phase 1+2 review.
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
