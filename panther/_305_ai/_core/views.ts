// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { buildInteractionDigest, createSignal } from "../deps.ts";
import type { AIInteractionDefLike } from "../deps.ts";
import { createInteractionLog } from "./interactions.ts";
import type {
  AIInteractionRegistry,
  AnyAIInteraction,
  NotifyArgs,
} from "./interactions.ts";
import { resolveViewLabel } from "./view_types.ts";
import type {
  AIViewDefinition,
  AIViewRegistry,
  AIViewState,
  AIViewVoidKeys,
  AnyAIView,
  SetViewArgs,
} from "./view_types.ts";

////////////////////////////////////////////////////////////////////////////////
// AI VIEW CONTROLLER
////////////////////////////////////////////////////////////////////////////////
//
// The live half of the view system: the inert declarations live in
// view_types.ts, and this controller holds the app's CURRENT position in
// them. The app keeps it in sync with its navigation (tab effects, editor
// mount/unmount); the engine reads it every turn to inject the
// [Current view: …] section, to gate tool execution, and to hand each tool
// handler the live view state at execution time.
//
// The controller creates nothing. Tools are standalone declarations typed
// against the inert REGISTRY (createAITool's `viewRegistry` field) — so a
// handler closes over no controller state, and the same tool array is
// correct for any chat this registry's controller is bound to.

export type AIViewController<
  TDefs extends Record<string, AnyAIView>,
  TIDefs extends Record<string, AnyAIInteraction> = Record<never, never>,
> = {
  // Type-only phantom (never assigned) pinning TIDefs INVARIANTLY. Without
  // it, a controller built with one interaction registry assigns to a
  // controller type carrying a structurally different one — notify's
  // generic signature compares leniently because its args are an unresolved
  // conditional type (proven in the Phase 3 review, M4). Same pattern as
  // AIView's __aiViewTypes phantom.
  readonly __aiInteractionDefs?: (defs: TIDefs) => TIDefs;
  setView<K extends keyof TDefs>(id: K, ...args: SetViewArgs<TDefs, K>): void;
  clearView(): void;
  // Reactive accessor (Solid signal read): engine reads are live — a nav
  // tool that changes the view mid-turn is seen by the very next gate check.
  current(): AIViewState<TDefs>;
  // Resolved label for UI (chat-pane headers); bare view id if the label
  // function throws.
  currentLabel(): string;
  // Resolved instructions for views with instructionsDelivery "manual", for the
  // consumer's own system composition; null for "ephemeral" views (the
  // engine delivers those — composing them too would double-deliver).
  instructions(): string | null;
  // Report a user interaction (Feature 3) — typed against the interactions
  // registry; the payload argument is dropped for void-payload interactions.
  // Entries queue until the engine drains them into the next turn's digest
  // section. Requires an interactions registry (compile-time: keyof TIDefs
  // is never without one; erased callers get a runtime throw). Declared in
  // PROPERTY syntax deliberately: method syntax is bivariant, and the Phase
  // 3 review proved it lets a controller built with one interaction
  // registry be typed against a structurally different one with no cast —
  // property syntax makes that cross-registry assignment a compile error.
  notify: <K extends keyof TIDefs>(
    id: K,
    ...args: NotifyArgs<TIDefs, K>
  ) => void;
  // Mark an AI-originated edit so its SSE echo is suppressed: an incoming
  // entry whose echoKey matches a mark younger than echoTtlMs is dropped at
  // arrival. Call inside mutating tool handlers (e.g. `slide:${id}`). No-op
  // without an interactions registry.
  markAIEdit(key: string): void;
  // Public escape hatch for the AI-navigation attribution window. The CHAT
  // LOOP opens it automatically around any tool whose metadata declares
  // attributesNavigation (what `createNavigationTool` sets), so most
  // consumers never call this directly — the tool itself holds no
  // controller and cannot mark for itself. It exists for a FIRE-AND-FORGET
  // router — one whose `onAiNavigation` callback returns before its actual
  // `setView`/`clearView` call lands (e.g. it starts an async route and
  // returns immediately, settling later via an effect or subscription). The
  // window is a TIME window (navAttributionMs), so it can lapse before that
  // late navigation fires and the event would be misattributed to the user;
  // call `markAINavigation()` again from wherever that later `setView`
  // actually happens to extend the window at the right moment. No-op without
  // an interactions registry (there is no digest to attribute in).
  markAINavigation(): void;
  // Drop everything the interaction log retains — entries, echo marks,
  // per-conversation cursors, any open AI-navigation window. For a consumer
  // SCOPE change (the app moved to a different project/workspace in the same
  // SPA session): the log is controller-lifetime, so without this, actions
  // retained from the previous scope ride the next conversation's first
  // digest as if they happened in the current one. Call it where the new
  // scope mounts. No-op without an interactions registry.
  clearInteractionLog(): void;
  // Engine-internal: the registry's view ids, for availableIn validation on
  // the chat's ToolRegistry. Consumers never call this.
  _viewIds(): string[];
  // Engine-internal: the registry this controller tracks, for the pairing
  // check on registration — a tool typed against registry A must not be
  // registered on a chat whose controller tracks registry B (the ids could
  // coincide while params/context differ). Comparing INERT registries, not
  // controller instances: a second controller over the same registry is
  // harmless now that handlers close over nothing. Consumers never call
  // this.
  _registry(): unknown;
  // Engine-internal: transactional interaction drain at turn creation, for
  // the sending CONVERSATION (per-conversation cursors over the shared
  // app-level log — "since the last message" is true per transcript). The
  // engine calls restore() iff the turn ends with no assistant message from
  // the model (failed/stopped send) — the cursor rolls back, so the same
  // window rides the retry's fresh digest; never lost, never
  // double-delivered. Null when no interactions registry is configured.
  // Consumers never call this.
  _drainForSend(
    conversationId: string,
  ): { digest: string | null; restore: () => void } | null;
  // Engine-internal: the raw pieces of the turn's view sections, resolved
  // safely (a throwing label/instructions is logged and degraded, never a
  // turn failure). Consumers never call this.
  _turnSectionParts(): {
    view: { id: string; label: string | null };
    viewInstructions: string | null;
  };
};

const DEFAULT_ECHO_TTL_MS = 30_000;

export function createAIViewController<
  TDefs extends Record<string, AnyAIView>,
  TIDefs extends Record<string, AnyAIInteraction> = Record<never, never>,
>(
  registry: AIViewRegistry<TDefs>,
  options: {
    fallback: AIViewVoidKeys<TDefs>;
    // Feature 3: the interaction registry notify() reports against. Its
    // TIDefs generic is inferred through this option.
    interactions?: AIInteractionRegistry<TIDefs>;
    // Built-in navigation reporting (setView/clearView record a coalesced
    // "User navigated from A to B" digest line). Default true when
    // interactions is set; meaningless without it.
    reportNavigation?: boolean;
    // Echo-suppression window for markAIEdit (TTL-only; marks are never
    // cleared at drain). Default 30 000 ms.
    echoTtlMs?: number;
    // AI-navigation attribution window (Phase 5): navigation events recorded
    // within this long of the navigation tool's mark are stamped origin
    // "ai" and dropped from the digest. Raise it if the app's routing takes
    // longer to settle (lazy-loaded editors). Default 5 000 ms.
    navAttributionMs?: number;
  },
): AIViewController<TDefs, TIDefs> {
  const fallbackId = options.fallback as keyof TDefs;
  const fallbackView = registry._defs[fallbackId];
  if (!fallbackView) {
    throw new Error(
      `createAIViewController: fallback view "${
        String(fallbackId)
      }" is not in the registry`,
    );
  }
  // The AIViewVoidKeys constraint is the real guard (compile-time, covers
  // context too); params schemas are the runtime-visible part, checked for
  // consumers outside strict typing.
  if (fallbackView._def.params) {
    throw new Error(
      `createAIViewController: fallback view "${
        String(fallbackId)
      }" declares a params schema — the fallback must be a view with void params and void context (clearView cannot supply arguments)`,
    );
  }

  // Both TTL-style options must be strictly positive when explicitly set
  // (Phase 5 review): the suppression window comparisons are `age < ttl` —
  // at ttl <= 0 the window is empty by construction, so even a same-tick
  // mark-then-record pair (a synchronous echo, or the navigation tool's
  // synchronous-routing case) can lose the Date.now() tie and be
  // misattributed. Reproduced empirically for navAttributionMs: 0 against a
  // real controller. echoTtlMs shares the exact same comparison shape
  // (dropSuppressedEchoes) and gets the same guard here rather than leaving
  // a matching, unguarded footgun behind (the defaults are always valid, so
  // only an explicit non-positive override can trip this).
  if (options.echoTtlMs !== undefined && options.echoTtlMs <= 0) {
    throw new Error(
      `createAIViewController: echoTtlMs must be > 0 (got ${options.echoTtlMs}) — a non-positive TTL makes the suppression window empty, so even a same-tick echo can be misattributed.`,
    );
  }
  if (
    options.navAttributionMs !== undefined && options.navAttributionMs <= 0
  ) {
    throw new Error(
      `createAIViewController: navAttributionMs must be > 0 (got ${options.navAttributionMs}) — a non-positive window makes AI-navigation attribution empty, so even synchronous routing can be misattributed to the user.`,
    );
  }

  // Construction-time interaction validation (Feature 2 #4 + review M2):
  // "__" is the reserved built-in prefix (the engine's __navigation events
  // share the interaction queue), and string-form relevantIn ids must name
  // real views — a typo'd id would otherwise consume its entries at every
  // drain, silently, forever (the same failure class the availableIn
  // construction throw exists to catch).
  const interactionDefs: Record<string, AIInteractionDefLike> | null =
    options.interactions
      ? Object.fromEntries(
        Object.entries(options.interactions._defs).map((
          [id, marker],
        ) => [id, (marker as AnyAIInteraction)._def as AIInteractionDefLike]),
      )
      : null;
  if (interactionDefs) {
    for (const [id, def] of Object.entries(interactionDefs)) {
      if (id.startsWith("__")) {
        throw new Error(
          `createAIViewController: interaction id "${id}" uses the reserved "__" prefix (built-in engine interactions) — rename it`,
        );
      }
      if (Array.isArray(def.relevantIn)) {
        for (const viewId of def.relevantIn) {
          if (!registry._defs[viewId]) {
            throw new Error(
              `createAIViewController: interaction "${id}": relevantIn references view id "${viewId}", which is not in this controller's view registry`,
            );
          }
        }
      }
    }
  }

  const interactionLog = interactionDefs
    ? createInteractionLog(
      interactionDefs,
      options.echoTtlMs ?? DEFAULT_ECHO_TTL_MS,
      undefined,
      options.navAttributionMs,
    )
    : null;
  const reportNavigation = interactionLog !== null &&
    (options.reportNavigation ?? true);

  const fallbackState = {
    id: fallbackId,
    params: undefined,
    context: undefined,
  } as AIViewState<TDefs>;

  const [state, setState] = createSignal<AIViewState<TDefs>>(fallbackState);

  // Internal erased handle on the current view's definition — label and
  // instructions are invoked with the state's own params/context, which the
  // typed surface guarantees match.
  function defFor(s: AIViewState<TDefs>): AIViewDefinition<unknown, unknown> {
    return registry._defs[s.id]._def as AIViewDefinition<unknown, unknown>;
  }

  function resolveLabel(s: AIViewState<TDefs>): string | null {
    return resolveViewLabel(defFor(s), String(s.id), s.params, s.context);
  }

  function resolveInstructions(s: AIViewState<TDefs>): string | null {
    const def = defFor(s);
    if (def.instructions === undefined) return null;
    if (typeof def.instructions === "string") return def.instructions;
    try {
      return def.instructions(s.params, s.context);
    } catch (err) {
      console.error(
        `AI view instructions for "${
          String(s.id)
        }" threw; dropping the section for this turn.`,
        err,
      );
      return null;
    }
  }

  function instructionsDeliveryFor(
    s: AIViewState<TDefs>,
  ): "ephemeral" | "manual" {
    return defFor(s).instructionsDelivery ?? "ephemeral";
  }

  // Built-in __navigation event around every state change: labels resolved
  // EAGERLY here (the event records strings, never label functions — the
  // live context a label reads may be torn down by drain time). Consecutive
  // events coalesce to one digest line at drain; a net-zero round trip
  // reports nothing (view_logic.ts owns both rules).
  function applyWithNavigation(apply: () => void): void {
    if (!reportNavigation) {
      apply();
      return;
    }
    const before = state();
    const fromId = String(before.id);
    const fromLabel = resolveLabel(before) ?? fromId;
    apply();
    const after = state();
    interactionLog!.recordNavigation({
      fromId,
      fromLabel,
      toId: String(after.id),
      toLabel: resolveLabel(after) ?? String(after.id),
    });
  }

  const controller: AIViewController<TDefs, TIDefs> = {
    setView<K extends keyof TDefs>(
      id: K,
      ...args: SetViewArgs<TDefs, K>
    ): void {
      const v = registry._defs[id];
      if (!v) {
        throw new Error(`setView: unknown view id "${String(id)}"`);
      }
      const rawArgs = args as unknown[];
      // Parse BEFORE recording navigation — a rejected params object leaves
      // both the view state and the interaction queue untouched.
      const params = v._def.params
        ? v._def.params.parse(rawArgs[0])
        : rawArgs[0];
      // Functional setter: with a generic state type, Solid's value overload
      // cannot exclude the function case.
      applyWithNavigation(() =>
        setState(
          () => ({ id, params, context: rawArgs[1] } as AIViewState<TDefs>),
        )
      );
    },
    clearView(): void {
      applyWithNavigation(() => setState(() => fallbackState));
    },
    current: state,
    currentLabel(): string {
      const s = state();
      return resolveLabel(s) ?? String(s.id);
    },
    instructions(): string | null {
      const s = state();
      if (instructionsDeliveryFor(s) !== "manual") return null;
      return resolveInstructions(s);
    },
    notify<K extends keyof TIDefs>(
      id: K,
      ...args: NotifyArgs<TIDefs, K>
    ): void {
      if (!interactionLog) {
        throw new Error(
          `notify("${
            String(id)
          }"): this controller has no interactions registry — pass one via createAIViewController options`,
        );
      }
      interactionLog.record(String(id), (args as unknown[])[0]);
    },
    markAIEdit(key: string): void {
      interactionLog?.markAIEdit(key);
    },
    markAINavigation(): void {
      interactionLog?.markAINavigation();
    },
    clearInteractionLog(): void {
      interactionLog?.clear();
    },
    _viewIds(): string[] {
      return Object.keys(registry._defs);
    },
    _registry(): unknown {
      return registry;
    },
    _drainForSend(conversationId: string) {
      if (!interactionLog) return null;
      const { entries, restore } = interactionLog.drainFor(conversationId);
      const s = state();
      // Reduction runs at drain time against the view the user is in when
      // the message is sent; every consumer callback inside is caught
      // (buildInteractionDigest) — a throwing callback drops its line, never
      // the turn. Belt and braces on top (review H3): if the digest build
      // ever escapes anyway, restore the drained entries immediately — the
      // window between drain and the engine holding the restore handle is
      // the one place a throw can lose entries — and deliver no digest this
      // turn.
      try {
        const digest = buildInteractionDigest(entries, interactionDefs!, {
          id: String(s.id),
          params: s.params,
          context: s.context,
        });
        return { digest, restore };
      } catch (err) {
        console.error(
          "AI interaction digest build threw; restoring the drained entries and delivering no digest this turn.",
          err,
        );
        restore();
        return { digest: null, restore: () => {} };
      }
    },
    _turnSectionParts() {
      const s = state();
      return {
        view: { id: String(s.id), label: resolveLabel(s) },
        viewInstructions: instructionsDeliveryFor(s) === "ephemeral"
          ? resolveInstructions(s)
          : null,
      };
    },
  };
  return controller;
}
