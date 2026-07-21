// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { buildInteractionDigest, createSignal } from "../deps.ts";
import type { AIInteractionDefLike, zType } from "../deps.ts";
import { createAITool } from "./tool_helpers.ts";
import type { AIToolWithMetadata, CreateAIToolConfig } from "./tool_helpers.ts";
import { createInteractionLog } from "./interactions.ts";
import type {
  AIInteractionRegistry,
  AnyAIInteraction,
  NotifyArgs,
} from "./interactions.ts";

////////////////////////////////////////////////////////////////////////////////
// AI VIEW REGISTRY + CONTROLLER
////////////////////////////////////////////////////////////////////////////////
//
// Views give the chat engine an organizing concept for "where the user is":
// the app declares its views once (label, optional params schema, optional
// per-view prompt section), keeps a controller in sync with its navigation,
// and the engine injects a [Current view: …] section into each turn
// (PLAN_AI_VIEWS_AND_APPROVAL Feature 1). Later phases bind tools to views
// (gating), report interactions, and scope approval validity through the
// same controller.
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

// viewController.createTool config: createAITool's surface, with availableIn
// constrained to the registry's view ids (a wrong id is a COMPILE-time
// error) and the handler receiving the live view state, narrowed to the
// declared views. availableIn omitted → handler sees the full state union.
export type CreateViewAIToolConfig<
  TDefs extends Record<string, AnyAIView>,
  K extends keyof TDefs,
  TInput,
  TOutput,
> =
  & Omit<CreateAIToolConfig<TInput, TOutput>, "handler" | "availableIn">
  & {
    availableIn?: readonly K[];
    // NoInfer: K must narrow ONLY via availableIn. Without it, an annotated
    // handler param (view: AIViewStateFor<Defs, "editor">) infers K narrow
    // while availableIn stays absent — a narrowed type with NO runtime gate
    // behind it (proven in the Phase 1+2 review).
    handler: (
      input: TInput,
      view: NoInfer<AIViewStateFor<TDefs, K>>,
    ) => Promise<TOutput> | TOutput;
  };

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
  // Resolved promptSection for views with promptDelivery "manual", for the
  // consumer's own system composition; null for "ephemeral" views (the
  // engine delivers those — composing them too would double-deliver).
  promptSection(): string | null;
  // Typed tool creation: availableIn is checked against the registry at
  // compile time AND the handler receives the live view state, narrowed to
  // the declared views — mode-guard boilerplate becomes unwritable. The
  // handler's view read happens in the same microtask as the engine's gate
  // check, so the narrowing cannot be raced by a view change.
  createTool<TInput, TOutput = string, K extends keyof TDefs = keyof TDefs>(
    config: CreateViewAIToolConfig<TDefs, K, TInput, TOutput>,
  ): AIToolWithMetadata<TInput>;
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
  // Engine-internal: the registry's view ids, for availableIn validation on
  // the chat's ToolRegistry. Consumers never call this.
  _viewIds(): string[];
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
  // safely (a throwing label/promptSection is logged and degraded, never a
  // turn failure). Consumers never call this.
  _turnSectionParts(): {
    view: { id: string; label: string | null };
    viewPrompt: string | null;
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
  // promptSection are invoked with the state's own params/context, which the
  // typed surface guarantees match.
  function defFor(s: AIViewState<TDefs>): AIViewDefinition<unknown, unknown> {
    return registry._defs[s.id]._def as AIViewDefinition<unknown, unknown>;
  }

  function resolveLabel(s: AIViewState<TDefs>): string | null {
    const def = defFor(s);
    if (typeof def.label === "string") return def.label;
    try {
      return def.label(s.params, s.context);
    } catch (err) {
      console.error(
        `AI view label for "${
          String(s.id)
        }" threw; using the bare view id. A stale label must never fail a turn.`,
        err,
      );
      return null;
    }
  }

  function resolvePromptSection(s: AIViewState<TDefs>): string | null {
    const def = defFor(s);
    if (def.promptSection === undefined) return null;
    if (typeof def.promptSection === "string") return def.promptSection;
    try {
      return def.promptSection(s.params, s.context);
    } catch (err) {
      console.error(
        `AI view promptSection for "${
          String(s.id)
        }" threw; dropping the section for this turn.`,
        err,
      );
      return null;
    }
  }

  function promptDeliveryFor(s: AIViewState<TDefs>): "ephemeral" | "manual" {
    return defFor(s).promptDelivery ?? "ephemeral";
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
    promptSection(): string | null {
      const s = state();
      if (promptDeliveryFor(s) !== "manual") return null;
      return resolvePromptSection(s);
    },
    createTool<TInput, TOutput = string, K extends keyof TDefs = keyof TDefs>(
      config: CreateViewAIToolConfig<TDefs, K, TInput, TOutput>,
    ): AIToolWithMetadata<TInput> {
      // Compile-time typing is the primary guard; this runtime check covers
      // erased/any-typed callers (the plain-createAITool check lives in
      // ToolRegistry.register).
      for (const id of config.availableIn ?? []) {
        if (!registry._defs[id]) {
          throw new Error(
            `createTool("${config.name}"): availableIn references view id "${
              String(id)
            }", which is not in this controller's registry`,
          );
        }
      }
      const tool = createAITool<TInput, TOutput>({
        ...config,
        // String coercion: numeric-looking registry keys would otherwise be
        // stored as numbers and mismatch the registry's Object.keys strings
        // at bind/gate time.
        availableIn: config.availableIn?.map((id) => String(id)),
        // The gate check guarantees the current view is one of availableIn
        // when the handler runs, and both happen in one microtask — the
        // cast to the narrowed union is sound. Sound only for the SAME
        // controller instance, which the registration identity check
        // enforces (metadata._viewController below).
        handler: (input: TInput) =>
          config.handler(input, state() as AIViewStateFor<TDefs, K>),
      });
      tool.metadata._viewController = controller;
      return tool;
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
    _viewIds(): string[] {
      return Object.keys(registry._defs);
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
        viewPrompt: promptDeliveryFor(s) === "ephemeral"
          ? resolvePromptSection(s)
          : null,
      };
    },
  };
  return controller;
}
