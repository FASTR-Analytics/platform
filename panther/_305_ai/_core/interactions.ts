// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type {
  AIInteractionDefLike,
  InteractionQueueEntry,
  InteractionViewStateLike,
  NavigationEventPayload,
} from "../deps.ts";
import { dropSuppressedEchoes, NAVIGATION_INTERACTION_ID } from "../deps.ts";

////////////////////////////////////////////////////////////////////////////////
// AI INTERACTION LOG
////////////////////////////////////////////////////////////////////////////////
//
// The "user actions since last message" registry (PLAN_AI_VIEWS_AND_APPROVAL
// Feature 3). The app declares its interaction types once — how repeats
// coalesce, which views they matter in, how a queued entry becomes a digest
// line — and reports occurrences with typed viewController.notify() calls.
// The engine drains the queue TRANSACTIONALLY at turn creation: the digest
// rides the turn as an ephemeral section, and if the turn ends without any
// assistant message from the model (failed or stopped send), the drained
// entries are restored — never lost, never double-delivered (the failed
// carrier's sections are demoted; restored entries ride the retry's fresh
// digest).
//
// Echo suppression closes the "AI's own edits echo back as user actions"
// loop generically: a mutating tool handler calls markAIEdit(key); at drain,
// an entry whose echoKey matches a mark within echoTtlMs of the entry's
// ARRIVAL — on either side — is dropped (dropSuppressedEchoes,
// view_logic.ts). The window is deliberately order-independent: push-channel
// echoes (SSE/websocket) can reach the client before the handler's mark
// lands (a server broadcasting before it responds, or a created id only
// known from the response), so suppression must not depend on which arrived
// first. Marks are TTL-scoped and never cleared at drain. Documented
// trade-off: a GENUINE user edit to the same key inside the window of an AI
// edit is suppressed; a leaked fake "user edited X" misleads the model,
// while a suppressed real edit merely delays information the next digest
// usually carries anyway.
//
// The reduction pipeline itself (echo drop → relevantIn → filter → coalesce
// → format → prefix) is pure in _110_ai_types/view_logic.ts,
// committed-tested; this module owns the typed declaration surface and the
// queue/echo-mark bookkeeping the controller composes.

export type AIInteractionDef<TPayload = void> = {
  // Views where this interaction is reported; absent = all views. Checked at
  // DRAIN time against the view the user is in when the message is sent —
  // interactions recorded in a view the user has since left are dropped. An
  // interaction that must be reported regardless omits both hooks. String
  // ids are validated against the view registry at controller construction.
  relevantIn?:
    | string[]
    | ((view: InteractionViewStateLike) => boolean);
  // Per-ENTRY relevance against the live view (params AND context) — the
  // hook for payload×view reductions (keep an edited_slide entry only if its
  // slideId is in the current deck). relevantIn scopes the TYPE by view;
  // filter decides per payload. View params/context are `unknown` here by
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
// collapsing to `any` under defineAIInteractions' record constraint (the
// Phase 3 review proved that collapse silently voids the payload and breaks
// notify — the exact failure class view()'s NoInfer fixed in Phase 1).
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

// Queue + echo-mark bookkeeping the view controller composes. Plain arrays/
// maps in closure — nothing reactive reads the queue (the digest is built
// imperatively at drain), and queued entries are never rendered or
// persisted. `now` is injectable for tests.
export function createInteractionLog(
  defs: Record<string, AIInteractionDefLike>,
  echoTtlMs: number,
  now: () => number = () => Date.now(),
) {
  let queue: InteractionQueueEntry[] = [];
  // Mark TIMES per key (a list, not latest-only: a mark near an entry must
  // keep suppressing it even after later marks on the same key).
  const marks = new Map<string, number[]>();

  // Lazy prune on markAIEdit. The cutoff respects the oldest queued entry:
  // a mark can suppress entries within ±echoTtlMs of itself, and entries
  // may sit queued (or be restored) long past the wall-clock TTL — pruning
  // relative to `now` alone could delete a mark a queued echo still needs.
  function pruneMarks(): void {
    const oldestQueued = queue.length > 0 ? queue[0].at : now();
    const cutoff = Math.min(now(), oldestQueued) - echoTtlMs;
    for (const [key, times] of marks) {
      const kept = times.filter((t) => t >= cutoff);
      if (kept.length === 0) {
        marks.delete(key);
      } else if (kept.length !== times.length) {
        marks.set(key, kept);
      }
    }
  }

  return {
    record(id: string, payload: unknown): void {
      if (!defs[id]) {
        throw new Error(
          `notify: unknown interaction id "${id}" — not in the configured interactions registry`,
        );
      }
      queue.push({ id, payload, at: now() });
    },
    recordNavigation(payload: NavigationEventPayload): void {
      queue.push({ id: NAVIGATION_INTERACTION_ID, payload, at: now() });
    },
    markAIEdit(key: string): void {
      pruneMarks();
      const times = marks.get(key);
      if (times) {
        times.push(now());
      } else {
        marks.set(key, [now()]);
      }
    },
    // Transactional drain: echo-suppressed entries are dropped HERE, for
    // good (they are the AI's own edits — restoring them would resurrect
    // the echo). The engine calls restore() iff the turn ends with no
    // assistant message from the model — surviving entries are PREPENDED to
    // whatever accumulated meanwhile (order preserved for the retry's fresh
    // digest). restore() is idempotent: a second call is a no-op, so a
    // future extra call site cannot double-deliver.
    drain(): { entries: InteractionQueueEntry[]; restore: () => void } {
      const all = queue;
      queue = [];
      const entries = dropSuppressedEchoes(
        all,
        defs,
        Object.fromEntries(marks),
        echoTtlMs,
      );
      let restored = false;
      return {
        entries,
        restore: () => {
          if (restored) return;
          restored = true;
          queue = [...entries, ...queue];
        },
      };
    },
  };
}
