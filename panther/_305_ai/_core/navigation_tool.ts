// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  buildNavigationDoneMessage,
  buildNavigationPendingMessage,
  z,
} from "../deps.ts";
import type { zType } from "../deps.ts";
import { buildAITool } from "./tool_helpers.ts";
import type { AIToolKind, AIToolWithMetadata } from "./tool_helpers.ts";
import { resolveViewLabel } from "./view_types.ts";
import type {
  AIViewParams,
  AIViewRegistry,
  AIViewState,
  AnyAIView,
} from "./view_types.ts";

////////////////////////////////////////////////////////////////////////////////
// BUILT-IN NAVIGATION TOOL
////////////////////////////////////////////////////////////////////////////////
//
// The library-provided "model asks to move" tool. A standalone declaration
// like every other tool: it types itself against the inert view REGISTRY
// (typed destinations + per-view params schemas) and receives the live view
// state from the engine at execution, the same injection every view-typed
// tool gets.
//
// The tool does NOT call setView. In real consumers the controller is
// synced FROM the app's navigation (editor mount/unmount hooks, tab
// effects), and views carry live context the model cannot supply — so the
// tool validates the target and asks the app to route
// (config.onAiNavigation); the app's own sync sites then fire setView as
// they always do. Attribution therefore cannot ride the call site: the tool
// declares metadata.attributesNavigation, and the chat loop opens the
// controller's AI-navigation window around the whole execution, so every
// navigation event recorded inside it is stamped origin "ai" — the digest
// drops those (buildNavigationDigestLine), and a move the model caused never
// renders as "User navigated". This is the markAIEdit lesson applied
// structurally: no consumer discipline, the engine marks for the tool.
//
// The input schema is a discriminated union over the NAVIGABLE views'
// params schemas, nested under a `target` key because the Anthropic API
// requires a top-level object schema (a bare union emits anyOf with no
// top-level type). Per-view params documentation rides the view's own zod
// .describe() annotations — no parallel description surface.

// The validated destination handed to onAiNavigation: the view id plus its
// parsed params (params is absent for void-params views). Context is NOT
// part of the target — live context is the app's to supply when its routing
// reaches the destination.
export type AINavigationTarget<
  TDefs extends Record<string, AnyAIView>,
  K extends keyof TDefs = keyof TDefs,
> = {
  [P in K]: { view: P; params: AIViewParams<TDefs[P]> };
}[K];

export type AINavigationToolInput<
  TDefs extends Record<string, AnyAIView>,
  K extends keyof TDefs = keyof TDefs,
> = { target: AINavigationTarget<TDefs, K> };

export type CreateAINavigationToolConfig<
  TDefs extends Record<string, AnyAIView>,
  K extends keyof TDefs = keyof TDefs,
> = {
  // The app's view registry — the same inert object its tools and its
  // controller are built from. Supplies the destinations' params schemas at
  // construction and their labels for the result message.
  viewRegistry: AIViewRegistry<TDefs>;
  // Navigable destinations — an EXPLICIT subset of the registry. Deliberate:
  // deep views reachable only through app state (an editor with a live
  // draft) should not be offered to the model, and default-everything would
  // offer them silently.
  destinations: readonly K[];
  // Performs the app's ACTUAL routing (router push, tab switch, editor
  // open). The handler awaits it; the app's own setView sync sites fire as
  // usual and are attributed to the AI via the attribution window. Throw
  // AIToolFailure for an expected refusal ("not while the editor has
  // unsaved changes") — it renders as a normal expected-failure result.
  // NoInfer: K must narrow only via `destinations` (the handler-view
  // precedent — an annotated callback param must not widen the inference).
  //
  // CONTRACT: the attribution window only covers this tool's execution
  // (opened before the handler runs, closed after it settles). If your
  // routing is FIRE-AND-FORGET — this callback returns before its actual
  // setView/clearView call lands, e.g. it starts an async route and the real
  // navigation settles later via an effect or subscription — the window can
  // close before that event fires, and it will then be misattributed to the
  // user. Either await routing to genuine completion inside this callback,
  // or call `viewController.markAINavigation()` again from wherever the real
  // setView/clearView eventually happens.
  onAiNavigation: (
    target: NoInfer<AINavigationTarget<TDefs, K>>,
  ) => void | Promise<void>;
  // Default "navigate_to_view".
  name?: string;
  // Replaces the generated description entirely when set. The generated one
  // lists the navigable view ids (with static labels where declared) and is
  // byte-stable across navigation — keep any override static too (the
  // description is part of the cached prompt prefix).
  description?: string;
  // Default "nav" (outside approvalPolicy's "write" net — navigation is
  // reversible UI state, not a data mutation).
  kind?: AIToolKind;
};

const DEFAULT_NAV_TOOL_NAME = "navigate_to_view";

function buildDefaultDescription(
  viewRegistry: AIViewRegistry<Record<string, AnyAIView>>,
  destinations: string[],
): string {
  const lines = destinations.map((id) => {
    const label = viewRegistry._defs[id]._def.label;
    // Only static string labels are safe here: the description is built once
    // at construction and must stay byte-stable, and a label FUNCTION reads
    // live params/context that do not exist yet.
    return typeof label === "string" ? `- "${id}" — ${label}` : `- "${id}"`;
  });
  return `Navigate the user's app to a different view. The app performs the actual navigation; the result reports the resulting view. Destinations:\n${
    lines.join("\n")
  }`;
}

export function createNavigationTool<
  TDefs extends Record<string, AnyAIView>,
  K extends keyof TDefs = keyof TDefs,
>(
  config: CreateAINavigationToolConfig<TDefs, K>,
): AIToolWithMetadata<AINavigationToolInput<TDefs, K>> {
  const name = config.name ?? DEFAULT_NAV_TOOL_NAME;
  const viewRegistry = config.viewRegistry as AIViewRegistry<
    Record<string, AnyAIView>
  >;
  const destinations = config.destinations.map((id) => String(id));
  if (destinations.length === 0) {
    throw new Error(
      `createNavigationTool("${name}"): destinations is empty — the tool would navigate nowhere. List the navigable destinations explicitly.`,
    );
  }
  if (new Set(destinations).size !== destinations.length) {
    throw new Error(
      `createNavigationTool("${name}"): destinations contains duplicate ids.`,
    );
  }
  const branches = destinations.map((id) => {
    const def = viewRegistry._defs[id]?._def;
    if (!def) {
      throw new Error(
        `createNavigationTool("${name}"): destinations references view id "${id}", which is not in the viewRegistry passed to this tool`,
      );
    }
    return def.params
      ? z.object({ view: z.literal(id), params: def.params })
      : z.object({ view: z.literal(id) });
  });
  const targetSchema = branches.length === 1
    ? branches[0]
    // deno-lint-ignore no-explicit-any
    : z.discriminatedUnion("view", branches as any);
  const inputSchema = z.object({
    target: targetSchema,
  }) as unknown as zType.ZodType<AINavigationToolInput<TDefs, K>>;

  const tool = buildAITool<AINavigationToolInput<TDefs, K>>({
    name,
    description: config.description ??
      buildDefaultDescription(viewRegistry, destinations),
    inputSchema,
    kind: config.kind ?? "nav",
    // Ungated: navigation is offered everywhere. View-typed all the same —
    // the registry is what supplies the destinations' params schemas above.
    viewRegistry: config.viewRegistry,
    // The one handler in the library that needs a LIVE view read rather than
    // the entry-time snapshot: it reports where the app actually landed,
    // which is only knowable after onAiNavigation has settled.
    _liveViewAccessor: true,
    handler: async (
      input: AINavigationToolInput<TDefs, K>,
      getView: () => AIViewState<TDefs>,
    ) => {
      const targetId = String(input.target.view);
      await config.onAiNavigation(input.target);
      const current = getView();
      const id = String(current.id);
      if (id !== targetId) return buildNavigationPendingMessage(targetId, id);
      const label = resolveViewLabel(
        viewRegistry._defs[id]._def,
        id,
        current.params,
        current.context,
      );
      return buildNavigationDoneMessage(id, label);
    },
  });
  tool.metadata.attributesNavigation = true;
  return tool as AIToolWithMetadata<AINavigationToolInput<TDefs, K>>;
}
