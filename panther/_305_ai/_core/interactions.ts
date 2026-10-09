// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { InteractionViewStateLike } from "../deps.ts";

////////////////////////////////////////////////////////////////////////////////
// AI INTERACTION LOG
////////////////////////////////////////////////////////////////////////////////
//
// The typed declaration surface of "user actions since last message": the
// app declares its interaction types once (how repeats coalesce, which views
// they matter in, how a queued entry becomes a digest line) and reports
// occurrences with typed viewController.notify() calls. The log the
// controller composes (per-conversation cursors, transactional drain and
// restore, echo marks, the AI-navigation window) is
// _110_ai_types/interaction_log.ts, and the reduction pipeline (echo drop →
// relevantIn → filter → coalesce → format → prefix) is
// _110_ai_types/view_logic.ts; both are pure and committed-tested.

export type AIInteractionDef<TPayload = void> = {
  // Views where this interaction is reported; absent = all views. Checked
  // against the view the user is in: at DRAIN time, when the message is
  // sent (an entry recorded in a view the user has since left is dropped),
  // or, with the controller's digestAcrossViews, at RECORD time, when
  // notify is called (an entry admitted then is reported wherever the user
  // sends from, its view named on the line). An interaction that must be
  // reported regardless omits both hooks. String ids are validated against
  // the view registry at controller construction.
  relevantIn?:
    | string[]
    | ((view: InteractionViewStateLike) => boolean);
  // Per-ENTRY relevance against the live view (params AND context) — the
  // hook for payload×view reductions (keep an edited_slide entry only if its
  // slideId is in the current deck). relevantIn scopes the TYPE by view;
  // filter decides per payload; both run at the same time (drain, or record
  // with digestAcrossViews). View params/context are `unknown` here by
  // design — the interaction registry is declared independently of any view
  // registry; consumers narrow inside the callback.
  filter?: (payload: TPayload, view: InteractionViewStateLike) => boolean;
  // How repeated notifications collapse before formatting. "keep-latest"
  // (default): one line from the latest payload, count 1. "count": one line
  // from the latest payload, count = surviving entries (format can render
  // "(×3)"). Custom reducer: surviving payloads → new list, each formatted
  // with count 1.
  coalesce?: "keep-latest" | "count" | ((entries: TPayload[]) => TPayload[]);
  // One digest line; return null to drop.
  format: (payload: TPayload, count: number) => string | null;
  // Optional echo suppression key — see markAIEdit above.
  echoKey?: (payload: TPayload) => string;
};

// The marker interaction() returns — the same pattern as view(): the config
// is authored inside the helper call, so unannotated callback parameters
// are contextually typed from the ONE declared payload type instead of
// collapsing to `any` under defineAIInteractions' record constraint (that
// collapse silently voids the payload and breaks notify).
export type AIInteraction<TPayload = void> = {
  readonly _def: AIInteractionDef<TPayload>;
};

// NoInfer on the return type is load-bearing (the view() precedent): inside
// defineAIInteractions({...}) the contextual type of each property is the
// constraint's AIInteraction<any>, and without the block that `any` beats
// the call's own inference.
export function interaction<TPayload = void>(
  def: AIInteractionDef<TPayload>,
): AIInteraction<NoInfer<TPayload>> {
  return { _def: def };
}

// deno-lint-ignore no-explicit-any
export type AnyAIInteraction = AIInteraction<any>;

export type AIInteractionRegistry<
  TDefs extends Record<string, AnyAIInteraction>,
> = {
  readonly _defs: TDefs;
};

export function defineAIInteractions<
  TDefs extends Record<string, AnyAIInteraction>,
>(defs: TDefs): AIInteractionRegistry<TDefs> {
  // Shallow copy: the registry's key set is fixed at declaration — a caller
  // mutating its own defs object afterward cannot add ids that bypass the
  // controller's construction-time validation (reserved "__" prefix,
  // relevantIn view ids).
  return { _defs: { ...defs } };
}

export type AIInteractionPayload<I> = I extends AIInteraction<infer P> ? P
  : never;

// Void-payload interactions take no argument. Conflicting callback
// annotations infer TPayload = never — surfaced as an impossible
// [payload: never] argument (uncallable with a diagnostic at the call
// site), never as a silently bare-callable notify.
export type NotifyArgs<
  TDefs extends Record<string, AnyAIInteraction>,
  K extends keyof TDefs,
> = [AIInteractionPayload<TDefs[K]>] extends [never] ? [payload: never]
  : [AIInteractionPayload<TDefs[K]>] extends [void] ? []
  : [payload: AIInteractionPayload<TDefs[K]>];
