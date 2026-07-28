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

// Hard cap on retained log records — the ONLY pruning (cursor-based eager
// pruning would race an in-flight turn's rollback window: a restore after
// the prune would find its records gone). 200 user actions bound memory
// trivially; a conversation lagging that far behind silently misses the
// oldest actions (documented retention limit).
const MAX_LOG_RECORDS = 200;

// Default AI-navigation attribution window. Long enough for routing to
// settle (lazy-loaded editors, mount effects that call setView), short
// enough that a genuine user move right after an AI one usually escapes it.
const DEFAULT_NAV_ATTRIBUTION_MS = 5_000;

// Log + echo-mark bookkeeping the view controller composes. ONE shared
// append-only log of app-level actions, read through PER-CONVERSATION
// cursors (bucket-3 ratification): each conversation's digest covers the
// entries recorded since ITS OWN last drained message — "since the last
// message" is true per transcript, concurrent conversations cannot steal or
// reorder each other's windows, and a new conversation (cursor 0) hears
// every retained action it has not heard yet, including on its first
// message. Plain arrays/maps in closure — nothing reactive reads the log,
// and records are never rendered or persisted (reload drops them; stated
// acceptance). `now` is injectable for tests.
export function createInteractionLog(
  defs: Record<string, AIInteractionDefLike>,
  echoTtlMs: number,
  now: () => number = () => Date.now(),
  navAttributionMs: number = DEFAULT_NAV_ATTRIBUTION_MS,
) {
  type LogRecord = { entry: InteractionQueueEntry; seq: number };
  let log: LogRecord[] = [];
  let nextSeq = 1;
  // conversationId → highest seq already delivered to that conversation.
  const cursors = new Map<string, number>();
  // Mark TIMES per key (a list, not latest-only: a mark near an entry must
  // keep suppressing it even after later marks on the same key).
  const marks = new Map<string, number[]>();
  // AI-navigation attribution window (Phase 5): the built-in navigation
  // tool calls markAINavigation() before AND after its consumer callback,
  // and every navigation event recorded while the window is open is stamped
  // origin "ai" — the digest drops those (buildNavigationDigestLine), so an
  // AI-caused move never renders as "User navigated". One scalar suffices:
  // the mark always precedes the events it covers (the tool marks first),
  // so no order-independence machinery is needed here, unlike echoes.
  // Documented trade-off (markAIEdit's, applied to navigation): a GENUINE
  // user navigation inside an open window is swallowed; the window is short
  // (routing-settle scale) and the view-label section reports the resulting
  // view every turn regardless.
  let aiNavWindowUntil = 0;

  function push(entry: InteractionQueueEntry): void {
    log.push({ entry, seq: nextSeq++ });
    if (log.length > MAX_LOG_RECORDS) {
      log = log.slice(log.length - MAX_LOG_RECORDS);
    }
  }

  // Lazy prune on markAIEdit. The cutoff respects the oldest retained
  // entry: a mark can suppress entries within ±echoTtlMs of itself, and
  // entries may sit in the log long past the wall-clock TTL — pruning
  // relative to `now` alone could delete a mark a pending echo still needs.
  function pruneMarks(): void {
    const oldestRetained = log.length > 0 ? log[0].entry.at : now();
    const cutoff = Math.min(now(), oldestRetained) - echoTtlMs;
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
      push({ id, payload, at: now() });
    },
    recordNavigation(payload: NavigationEventPayload): void {
      const at = now();
      const origin: "user" | "ai" = at < aiNavWindowUntil ? "ai" : "user";
      push({
        id: NAVIGATION_INTERACTION_ID,
        payload: { ...payload, origin },
        at,
      });
    },
    markAINavigation(): void {
      aiNavWindowUntil = Math.max(aiNavWindowUntil, now() + navAttributionMs);
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
    // Transactional drain for ONE conversation: deliver the entries past
    // its cursor, advance the cursor, and hand back a rollback. restore()
    // (called by the engine iff the turn ends with no assistant message
    // from the model) rolls the cursor back so the SAME window rides the
    // retry's fresh digest — naturally idempotent, and other conversations'
    // cursors are untouched. Echo-suppressed entries are removed from the
    // log GLOBALLY (an echo is the AI's own edit — no conversation should
    // hear it) and are not part of the rollback window.
    drainFor(
      conversationId: string,
    ): { entries: InteractionQueueEntry[]; restore: () => void } {
      const cursor = cursors.get(conversationId) ?? 0;
      const windowRecords = log.filter((r) => r.seq > cursor);
      const surviving = dropSuppressedEchoes(
        windowRecords.map((r) => r.entry),
        defs,
        Object.fromEntries(marks),
        echoTtlMs,
      );
      if (surviving.length !== windowRecords.length) {
        const kept = new Set(surviving);
        const suppressed = new Set(
          windowRecords.filter((r) => !kept.has(r.entry)).map((r) => r.seq),
        );
        log = log.filter((r) => !suppressed.has(r.seq));
      }
      // High-water mark: everything recorded so far is either delivered in
      // this window or suppressed-and-deleted.
      cursors.set(conversationId, nextSeq - 1);
      return {
        entries: surviving,
        restore: () => {
          cursors.set(conversationId, cursor);
        },
      };
    },
    // Full reset for a consumer scope change (the app moved to a different
    // project/workspace in the same SPA session, so retained entries no
    // longer describe the current scope). Drops entries, echo marks,
    // per-conversation cursors, and any open AI-navigation window. `nextSeq`
    // stays monotonic so cursor arithmetic never sees seqs reused. A
    // restore() held by an in-flight turn that fires AFTER a clear
    // re-instates that conversation's old (high) cursor — it may then miss
    // post-clear entries below it; acceptable, since that conversation
    // belongs to the pre-clear scope.
    clear(): void {
      log = [];
      cursors.clear();
      marks.clear();
      aiNavWindowUntil = 0;
    },
  };
}
