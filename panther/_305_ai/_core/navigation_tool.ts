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
import { createAITool } from "./tool_helpers.ts";
import type { AIToolKind, AIToolWithMetadata } from "./tool_helpers.ts";
import type { AIViewDefinition, AIViewParams, AnyAIView } from "./views.ts";

////////////////////////////////////////////////////////////////////////////////
// BUILT-IN NAVIGATION TOOL (Phase 5)
////////////////////////////////////////////////////////////////////////////////
//
// The library-provided "model asks to move" tool
// (PLAN_AI_VIEWS_AND_APPROVAL Phase 5, bucket-3 ratification). Created via
// viewController.createNavigationTool — never standalone, because it needs
// the controller's registry (typed destinations + params validation), its
// live state (for the result message), and its interaction log (for
// AI-origin attribution).
//
// The tool does NOT call setView. In real consumers the controller is
// synced FROM the app's navigation (editor mount/unmount hooks, tab
// effects), and views carry live context the model cannot supply — so the
// tool validates the target and asks the app to route
// (config.onAiNavigation); the app's own sync sites then fire setView as
// they always do. Attribution therefore cannot ride the call site: the tool
// opens an AI-navigation attribution window (markAINavigation) before AND
// after awaiting the callback, and every navigation event recorded inside
// the window is stamped origin "ai" — the digest drops those
// (buildNavigationDigestLine), so a move the model caused never renders as
// "User navigated". This is the markAIEdit lesson applied structurally: no
// consumer discipline, the library tool marks for itself.
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
  // Navigable destinations — an EXPLICIT subset of the registry. Deliberate:
  // deep views reachable only through app state (an editor with a live
  // draft) should not be offered to the model, and default-everything would
  // offer them silently.
  views: readonly K[];
  // Performs the app's ACTUAL routing (router push, tab switch, editor
  // open). The handler awaits it; the app's own setView sync sites fire as
  // usual and are attributed to the AI via the attribution window. Throw
  // AIToolFailure for an expected refusal ("not while the editor has
  // unsaved changes") — it renders as a normal expected-failure result.
  // NoInfer: K must narrow only via `views` (the createTool handler
  // precedent — an annotated callback param must not widen the inference).
  //
  // CONTRACT (Phase 5 review): the attribution window only covers the time
  // this callback is in flight (opened before, extended once more right
  // after it resolves). If your routing is FIRE-AND-FORGET — this callback
  // returns before its actual setView/clearView call lands, e.g. it starts
  // an async route and the real navigation settles later via an effect or
  // subscription — the window can close before that event fires, and it
  // will then be misattributed to the user. Either await routing to
  // genuine completion inside this callback, or call
  // `viewController.markAINavigation()` again from wherever the real
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

// The erased pieces the controller closes over (navigation_tool.ts imports
// only TYPES from views.ts — no runtime cycle).
export type NavigationToolControllerParts = {
  defFor: (viewId: string) => AIViewDefinition<unknown, unknown> | undefined;
  currentIdAndLabel: () => { id: string; label: string | null };
  markAINavigation: () => void;
};

const DEFAULT_NAV_TOOL_NAME = "navigate_to_view";

function buildDefaultDescription(
  views: string[],
  defFor: NavigationToolControllerParts["defFor"],
): string {
  const lines = views.map((id) => {
    const label = defFor(id)?.label;
    // Only static string labels are safe here: the description is built once
    // at construction and must stay byte-stable, and a label FUNCTION reads
    // live params/context that do not exist yet.
    return typeof label === "string" ? `- "${id}" — ${label}` : `- "${id}"`;
  });
  return `Navigate the user's app to a different view. The app performs the actual navigation; the result reports the resulting view. Destinations:\n${
    lines.join("\n")
  }`;
}

export function buildNavigationTool<
  TDefs extends Record<string, AnyAIView>,
  K extends keyof TDefs = keyof TDefs,
>(
  config: CreateAINavigationToolConfig<TDefs, K>,
  parts: NavigationToolControllerParts,
): AIToolWithMetadata<AINavigationToolInput<TDefs, K>> {
  const name = config.name ?? DEFAULT_NAV_TOOL_NAME;
  const viewIds = config.views.map((id) => String(id));
  if (viewIds.length === 0) {
    throw new Error(
      `createNavigationTool("${name}"): views is empty — the tool would navigate nowhere. List the navigable destinations explicitly.`,
    );
  }
  if (new Set(viewIds).size !== viewIds.length) {
    throw new Error(
      `createNavigationTool("${name}"): views contains duplicate ids.`,
    );
  }
  const branches = viewIds.map((id) => {
    const def = parts.defFor(id);
    if (!def) {
      throw new Error(
        `createNavigationTool("${name}"): views references view id "${id}", which is not in this controller's registry`,
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

  return createAITool<AINavigationToolInput<TDefs, K>>({
    name,
    description: config.description ??
      buildDefaultDescription(viewIds, parts.defFor),
    inputSchema,
    kind: config.kind ?? "nav",
    handler: async (input) => {
      const targetId = String(input.target.view);
      // Open the attribution window BEFORE the callback (its routing may
      // fire setView synchronously) and extend it AFTER (mount effects and
      // async route settling fire setView later) — a throw still extends,
      // because a partially-completed route can still emit events.
      parts.markAINavigation();
      try {
        await config.onAiNavigation(input.target);
      } finally {
        parts.markAINavigation();
      }
      const { id, label } = parts.currentIdAndLabel();
      return id === targetId
        ? buildNavigationDoneMessage(id, label)
        : buildNavigationPendingMessage(targetId, id);
    },
  });
}
