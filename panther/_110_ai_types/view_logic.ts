// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { EphemeralSection } from "./types.ts";

////////////////////////////////////////////////////////////////////////////////
// VIEW SECTION ASSEMBLY
////////////////////////////////////////////////////////////////////////////////
//
// Pure assembly of a turn's ephemeral sections when a view controller is
// configured (PLAN_AI_VIEWS_AND_APPROVAL Phase 1). The engine resolves the
// live pieces (view id + label, per-view prompt section, interaction digest,
// consumer hook) at turn creation and passes plain strings here; this module
// owns the section FORMAT and ORDER so they are unit-testable and stable.
//
// The view-label section always includes the stable view id alongside the
// human label — gate messages, auto-decline strings, and catalog annotations
// (which all name ids) share one key with the per-turn context, and the label
// stays human flavor (the HeaderItem id/label philosophy). A null label means
// the consumer's label function threw (a torn-down view context must never
// fail a turn) — render the bare-id form.

// Neutralize consumer-authored strings before they join library-authored
// section lines (Phase 3 review, bucket 3). Presentation-only — recorded
// payloads and stored labels keep the consumer's raw text. Two grades:
// newline collapse for any interpolation (one label/format return can never
// fabricate an extra line or digest bullet), plus typographic-quote
// conversion ONLY where the text renders inside a library-quoted span (a
// label can never close its quotes and forge the rest of the line). Digest
// bullets are NOT quoted, so format returns keep their double quotes — the
// live rig caught the over-eager version mangling legitimate `"A2"` text.
function collapseToSingleLine(text: string): string {
  return text.replace(/\s*\n\s*/g, " ");
}

function sanitizeQuoted(text: string): string {
  return collapseToSingleLine(text).replace(/"/g, "”");
}

export function buildViewLabelSectionText(
  id: string,
  label: string | null,
): string {
  return label === null
    ? `[Current view: ${id}]`
    : `[Current view: ${id} — "${sanitizeQuoted(label)}"]`;
}

// Standardized tool-gating strings (PLAN_AI_VIEWS_AND_APPROVAL Feature 2).
// Both key on the stable view ID — the same key the view-label section
// carries every turn — so the model can connect a refusal (or a static
// description hint) to the current-view statement it already received.

// Appended by createAITool to the API description of any tool declaring
// availableIn: the cheapest cache-stable channel to the model (static per
// tool, so the prompt prefix stays byte-stable across navigation).
export function buildAvailabilityHint(availableIn: string[]): string {
  return `Only available in view(s): ${availableIn.join(", ")}.`;
}

// The is_error tool_result content for an out-of-view execution. is_error is
// deliberate: the model should self-correct, matching the historical
// consumer behavior of throwing from mode-guarded handlers — but uniform and
// impossible to forget.
export function buildViewGateMessage(
  availableIn: string[],
  currentViewId: string,
): string {
  const views = availableIn.map((v) => `"${v}"`).join(", ");
  const noun = availableIn.length === 1 ? "view" : "views";
  return `This tool is only available in ${noun} ${views}. The user is currently in "${currentViewId}". Do not call it again until the user navigates there — you may ask them to.`;
}

////////////////////////////////////////////////////////////////////////////////
// APPROVAL OUTCOME STRINGS (Phase 4)
////////////////////////////////////////////////////////////////////////////////
//
// Standardized tool_result contents for the approval lifecycle
// (PLAN_AI_VIEWS_AND_APPROVAL Feature 4). All three are NORMAL results, not
// is_error — declining (or losing validity) is a legitimate outcome, and
// is_error would make the model treat it as a bug and retry.

export const APPROVAL_DECLINED_MESSAGE =
  "User declined the proposed change — nothing was applied. Do not retry unless the user asks for it.";

// View-exit auto-decline: viewId is the view the user LEFT (the view the
// decision was created in — a gated tool's card can only appear in-view).
export function buildApprovalViewExitMessage(viewId: string): string {
  return `User navigated away from "${viewId}" before deciding — nothing was applied. Do not retry unless the user asks for it.`;
}

export const APPROVAL_STALE_MESSAGE =
  "The proposed change is no longer valid — the underlying content changed while the user was deciding. Nothing was applied. Re-read the current state before proposing again.";

////////////////////////////////////////////////////////////////////////////////
// INTERACTION REDUCTION PIPELINE (Phase 3)
////////////////////////////////////////////////////////////////////////////////
//
// Pure reduction of the interaction queue into one digest string at drain
// time (turn creation). The controller owns the queue and the echo-mark
// bookkeeping (interactions.ts); this module owns the reduction ORDER and
// the digest FORMAT: echo suppression (dropSuppressedEchoes, applied by the
// controller's drain) → relevantIn against the live view → per-entry filter
// → coalesce per interaction id → format → prefix. Consumer callbacks
// (relevantIn functions, filter, coalesce, format) run against live view
// context that may be torn down — every call AND the consumption of its
// return value is caught; a throwing callback drops its entry/line and
// logs, never fails the turn (the Phase 1 label rule, applied to the whole
// pipeline).

export type InteractionViewStateLike = {
  id: string;
  params: unknown;
  context: unknown;
};

// The type-erased shape of AIInteractionDef the pipeline works with — the
// typed surface lives on the controller (interactions.ts).
export type AIInteractionDefLike = {
  relevantIn?: string[] | ((view: InteractionViewStateLike) => boolean);
  filter?: (payload: unknown, view: InteractionViewStateLike) => boolean;
  coalesce?:
    | "keep-latest"
    | "count"
    | ((entries: unknown[]) => unknown[]);
  format: (payload: unknown, count: number) => string | null;
  echoKey?: (payload: unknown) => string;
};

export type InteractionQueueEntry = {
  id: string;
  payload: unknown;
  // Arrival time (controller clock). Echo suppression is decided at DRAIN
  // against this timestamp — see dropSuppressedEchoes.
  at: number;
};

// Reserved built-in interaction id (user-declared ids may not start with
// "__" — construction throw in createAIViewController).
export const NAVIGATION_INTERACTION_ID = "__navigation";

// Labels are resolved eagerly AT setView time (the event records strings,
// never label functions — the live context a label reads may be torn down by
// drain time).
export type NavigationEventPayload = {
  fromId: string;
  fromLabel: string;
  toId: string;
  toLabel: string;
};

// All navigation events in a drain window coalesce to ONE line: first
// event's origin → last event's destination. A net-zero round trip (same id
// AND same label — a changed label means the place meaningfully changed,
// e.g. a different slide in the same editor view) reports nothing.
export function buildNavigationDigestLine(
  events: NavigationEventPayload[],
): string | null {
  if (events.length === 0) return null;
  const first = events[0];
  const last = events[events.length - 1];
  if (first.fromId === last.toId && first.fromLabel === last.toLabel) {
    return null;
  }
  return `User navigated from "${sanitizeQuoted(first.fromLabel)}" to "${
    sanitizeQuoted(last.toLabel)
  }" since the last message.`;
}

export const INTERACTION_DIGEST_PREFIX = "User actions since last message:";

// Echo-mark times per key (an AI edit may mark the same key more than once
// inside a window — keeping the list, not just the latest, means a mark
// near the entry always suppresses regardless of later marks).
export type EchoMarks = Record<string, number[]>;

// Drop entries that are echoes of the AI's own edits (Phase 3 adversarial
// review, H1). Suppression is ORDER-INDEPENDENT by design: an entry is an
// echo iff a mark with the same key exists within echoTtlMs of the entry's
// ARRIVAL time, on EITHER side — a push-channel echo (SSE, websocket) can
// reach the client before the handler's markAIEdit call (e.g. a server that
// broadcasts before returning, or a created id only known from the
// response), and a suppression model keyed on arrival order would leak
// those as fake user actions. Runs at drain; suppressed entries are
// consumed, never restored. An echoKey throw KEEPS the entry (deliberate
// asymmetry with the drop-on-throw pipeline rule: dropping would lose
// genuine user actions while echoKey is broken; keeping risks only an echo
// leak).
export function dropSuppressedEchoes(
  entries: InteractionQueueEntry[],
  defs: Record<string, AIInteractionDefLike>,
  marks: EchoMarks,
  echoTtlMs: number,
): InteractionQueueEntry[] {
  return entries.filter((entry) => {
    if (entry.id === NAVIGATION_INTERACTION_ID) return true;
    const def = defs[entry.id];
    if (!def?.echoKey) return true;
    const key = safeCall(
      "echoKey",
      entry.id,
      () => def.echoKey!(entry.payload),
    );
    if (!key.ok || key.value == null) return true;
    const times = marks[key.value];
    if (!times) return true;
    return !times.some((t) => Math.abs(t - entry.at) < echoTtlMs);
  });
}

function safeCall<T>(
  what: string,
  id: string,
  fn: () => T,
): { ok: true; value: T } | { ok: false } {
  try {
    return { ok: true, value: fn() };
  } catch (err) {
    console.error(
      `AI interaction ${what} for "${id}" threw; dropping. An interaction callback must never fail a turn.`,
      err,
    );
    return { ok: false };
  }
}

// Digest lines keep first-notify order (per interaction id, including the
// built-in navigation line at its first event's position). Coalesce
// semantics: "keep-latest" (default) formats the latest payload with count
// 1 (repeats collapse invisibly); "count" formats the latest payload with
// count = the number of surviving entries (so format can render "(×3)"); a
// custom reducer maps the surviving payloads to a new list, each formatted
// with count 1 (a reducer that needs multiplicity bakes it into its
// payloads). Entries whose id has no def are dropped (the typed notify()
// surface prevents this; erased callers get the drop, logged).
export function buildInteractionDigest(
  entries: InteractionQueueEntry[],
  defs: Record<string, AIInteractionDefLike>,
  view: InteractionViewStateLike,
): string | null {
  const byId = new Map<string, unknown[]>();
  for (const entry of entries) {
    const group = byId.get(entry.id);
    if (group) {
      group.push(entry.payload);
    } else {
      byId.set(entry.id, [entry.payload]);
    }
  }

  const lines: string[] = [];
  for (const [id, payloads] of byId) {
    if (id === NAVIGATION_INTERACTION_ID) {
      // Guarded like every other line builder: only recordNavigation can
      // enqueue this id today, but a malformed payload must degrade to a
      // dropped line, never a failed turn (review H3).
      const line = safeCall(
        "navigation line",
        id,
        () => buildNavigationDigestLine(payloads as NavigationEventPayload[]),
      );
      if (line.ok && line.value) lines.push(line.value);
      continue;
    }
    const def = defs[id];
    if (!def) {
      console.error(
        `AI interaction "${id}" has no definition in the registry; dropping its entries.`,
      );
      continue;
    }

    // relevantIn scopes the interaction TYPE by view.
    if (Array.isArray(def.relevantIn)) {
      if (!def.relevantIn.includes(view.id)) continue;
    } else if (typeof def.relevantIn === "function") {
      const rel = safeCall(
        "relevantIn",
        id,
        () =>
          (def.relevantIn as (v: InteractionViewStateLike) => boolean)(view),
      );
      if (!rel.ok || !rel.value) continue;
    }

    // Per-entry filter decides per payload (payload × view reductions).
    let surviving = payloads;
    if (def.filter) {
      surviving = surviving.filter((payload) => {
        const kept = safeCall("filter", id, () => def.filter!(payload, view));
        return kept.ok && kept.value;
      });
    }
    if (surviving.length === 0) continue;

    const coalesce = def.coalesce ?? "keep-latest";
    let formatted: Array<{ payload: unknown; count: number }>;
    if (coalesce === "keep-latest") {
      formatted = [{ payload: surviving[surviving.length - 1], count: 1 }];
    } else if (coalesce === "count") {
      formatted = [{
        payload: surviving[surviving.length - 1],
        count: surviving.length,
      }];
    } else {
      // The whole reduction — invocation AND consumption of the return
      // value — sits inside the guard: a type-erased reducer returning a
      // non-array must drop this id's lines, never fail the turn (review
      // H3: an escape here fires after the queue was drained and before
      // the engine holds the restore handle, losing every entry).
      const reduced = safeCall("coalesce", id, () => {
        const out = coalesce([...surviving]);
        if (!Array.isArray(out)) {
          throw new Error(
            `coalesce returned ${typeof out} instead of an array`,
          );
        }
        return out.map((payload) => ({ payload, count: 1 }));
      });
      if (!reduced.ok) continue;
      formatted = reduced.value;
    }

    for (const { payload, count } of formatted) {
      // String coercion inside the guard: an erased format returning an
      // object with a throwing toString must drop the line, not escape at
      // the join below (review H3).
      const line = safeCall("format", id, () => {
        const out = def.format(payload, count);
        return out == null ? null : String(out);
      });
      // Trim-check so a whitespace-only return never renders a blank
      // bullet; newline collapse so one format return is always exactly
      // one bullet (quotes stay — bullets are not a quoted span).
      if (line.ok && line.value && line.value.trim()) {
        lines.push(collapseToSingleLine(line.value));
      }
    }
  }

  if (lines.length === 0) return null;
  return `${INTERACTION_DIGEST_PREFIX}\n${
    lines.map((l) => `- ${l}`).join("\n")
  }`;
}

export type TurnSectionParts = {
  view?: { id: string; label: string | null } | null;
  viewPrompt?: string | null;
  digest?: string | null;
  consumer?: string | null;
};

// Section order is a stated contract: view label, then per-view prompt, then
// interaction digest, then the consumer hook's free-form context. Empty
// strings are dropped like nulls — a section never renders blank.
export function assembleTurnSections(
  parts: TurnSectionParts,
): EphemeralSection[] {
  const sections: EphemeralSection[] = [];
  if (parts.view) {
    sections.push({
      kind: "view-label",
      text: buildViewLabelSectionText(parts.view.id, parts.view.label),
    });
  }
  if (parts.viewPrompt) {
    sections.push({ kind: "view-prompt", text: parts.viewPrompt });
  }
  if (parts.digest) {
    sections.push({ kind: "digest", text: parts.digest });
  }
  if (parts.consumer) {
    sections.push({ kind: "consumer", text: parts.consumer });
  }
  return sections;
}
