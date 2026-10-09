// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type {
  AIInteractionDefLike,
  InteractionQueueEntry,
  NavigationEventPayload,
} from "./view_logic.ts";
import {
  dropSuppressedEchoes,
  NAVIGATION_INTERACTION_ID,
} from "./view_logic.ts";

////////////////////////////////////////////////////////////////////////////////
// AI INTERACTION LOG
////////////////////////////////////////////////////////////////////////////////
//
// The queue and echo-mark bookkeeping behind "user actions since last
// message". The app declares its interaction types in _305_ai
// (interactions.ts) and reports occurrences through the view controller;
// this log retains them. The engine drains the log TRANSACTIONALLY at turn
// creation, and under append-only turns again for a message typed mid-turn:
// the digest rides its message as an ephemeral section, and if the model
// never answers that message (a failed or stopped send), the drained entries
// are restored — never lost, never double-delivered (the unanswered
// carrier's sections are demoted or released; restored entries ride the
// retry's fresh digest).
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
// Plain closures with an injectable clock, so it loads under plain
// `deno test` (tests/ai_interaction_log_test.ts) while the Solid-bound
// controller that composes it stays in _305_ai.

// Hard cap on retained log records — the ONLY pruning (cursor-based eager
// pruning would race an in-flight turn's rollback window: a restore after
// the prune would find its records gone). 200 user actions bound memory
// trivially; a conversation lagging that far behind silently misses the
// oldest actions (documented retention limit).
export const MAX_LOG_RECORDS = 200;

// Default AI-navigation attribution window. Long enough for routing to
// settle (lazy-loaded editors, mount effects that call setView), short
// enough that a genuine user move right after an AI one usually escapes it.
export const DEFAULT_NAV_ATTRIBUTION_MS = 5_000;

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
  // AI-navigation attribution window: the built-in navigation
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

  // The records past a cursor, and the entries among them that are not
  // echoes of the AI's own edits.
  function windowPast(
    cursor: number,
  ): { windowRecords: LogRecord[]; surviving: InteractionQueueEntry[] } {
    const windowRecords = log.filter((r) => r.seq > cursor);
    const surviving = dropSuppressedEchoes(
      windowRecords.map((r) => r.entry),
      defs,
      Object.fromEntries(marks),
      echoTtlMs,
    );
    return { windowRecords, surviving };
  }

  return {
    // `view` is the view the entry was recorded in, which a controller with
    // digestAcrossViews supplies after admitting the entry against it.
    record(
      id: string,
      payload: unknown,
      view?: { id: string; label: string },
    ): void {
      if (!defs[id]) {
        throw new Error(
          `notify: unknown interaction id "${id}" — not in the configured interactions registry`,
        );
      }
      push(
        view
          ? { id, payload, at: now(), viewId: view.id, viewLabel: view.label }
          : { id, payload, at: now() },
      );
    },
    // Move a conversation's cursor to the high-water mark: it hears only
    // what is recorded after this. A controller with digestAcrossViews calls
    // it each time the conversations manager makes a conversation active,
    // so a new or switched-to conversation never opens with the retained
    // backlog of every view. Other conversations' cursors are untouched.
    activate(conversationId: string): void {
      cursors.set(conversationId, nextSeq - 1);
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
    // (called by the engine iff the model never answers the message the
    // drain rode; two drains of one turn restore latest first, so the cursor
    // ends at the earlier window's start) rolls the cursor back so the SAME
    // window rides the retry's fresh digest — naturally idempotent, and
    // other conversations' cursors are untouched. Echo-suppressed entries
    // are removed from the log GLOBALLY (an echo is the AI's own edit — no
    // conversation should hear it) and are not part of the rollback window.
    drainFor(
      conversationId: string,
    ): { entries: InteractionQueueEntry[]; restore: () => void } {
      const cursor = cursors.get(conversationId) ?? 0;
      const { windowRecords, surviving } = windowPast(cursor);
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
    // What drainFor would deliver, with the log untouched: the cursor stays
    // and suppressed echoes stay. For a preview of the next message.
    peekFor(conversationId: string): InteractionQueueEntry[] {
      return windowPast(cursors.get(conversationId) ?? 0).surviving;
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

export type InteractionLog = ReturnType<typeof createInteractionLog>;
