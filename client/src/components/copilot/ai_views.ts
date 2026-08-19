import { createAIViewController, defineAIViews, view } from "panther";
import type { AIViewController, AIViewState } from "panther";
import { t3 } from "lib";
import type {
  FigureBlock,
  ImageBlock,
  PackageScope,
  Slide,
  SlideDeckConfig,
  SlideType,
} from "lib";
import type { SetStoreFunction } from "solid-js/store";
import { instanceState } from "~/state/instance/t1_store";
import type {
  ReportEditorSelection,
  ReportEditProposal,
  ReportEditProposalResult,
} from "./types";
import { copilotInteractions, type CopilotInteractionDefs } from "./interactions";
import {
  getEditingReportInstructions,
  getEditingSlideDeckInstructions,
  getEditingSlideInstructions,
  getViewingExploreInstructions,
  getViewingProductsInstructions,
} from "./build_system_prompt";

////////////////////////////////////////////////////////////////////////////////
// COPILOT — AI VIEW REGISTRY
////////////////////////////////////////////////////////////////////////////////
//
// Five views (D15): the two instance pages the copilot is mounted over, plus
// the three product editors. TParams is the serializable, model-visible half
// (view-label text, tool narrowing); TContext is the live payload (the
// editor's store getters/setters, and the open product's PackageScope)
// delivered to tool handlers opaquely.
//
// There is no tab → view map any more: Data / Results / Assets / Users are
// outside the copilot's mount, so the only navigation sync sites are the two
// pages and each editor's mount/teardown.
//
// instructions carries what used to be build_system_prompt.ts's per-mode
// switch (still exported from there, verbatim) PLUS the live bits that used to
// ride the old mode string (the deck's selected slide ids; the report editor's
// selection preview). instructionsDelivery stays the default "ephemeral"
// everywhere: the `system` accessor takes no view argument at all, so it is
// byte-stable across navigation within one package.

// Every editing view carries the open product's pair. It rides the opaque
// CONTEXT half deliberately: no run id crosses the tool seam and none appears
// in a tool schema (D15) — the env reads it here instead.
export type OpenProductScope = {
  getScope: () => PackageScope;
};

export type EditingSlideDeckParams = {
  deckId: string;
  deckLabel: string;
};
export type EditingSlideDeckContext = OpenProductScope & {
  getDeckConfig: () => SlideDeckConfig;
  getSlideIds: () => string[];
  getSelectedSlideIds: () => string[];
};

export type EditingSlideParams = {
  slideId: string;
  slideLabel: string;
  slideType: SlideType;
  deckId: string;
  deckLabel: string;
};
export type EditingSlideContext = OpenProductScope & {
  getTempSlide: () => Slide;
  setTempSlide: SetStoreFunction<Slide>;
};

export type EditingReportParams = {
  reportId: string;
  reportLabel: string;
};
// See ./types.ts for ReportEditProposal(Result) and ReportEditorSelection.
export type EditingReportContext = OpenProductScope & {
  getBody: () => string;
  getFigures: () => Record<string, FigureBlock>;
  getImages: () => Record<string, ImageBlock>;
  getSelection: () => ReportEditorSelection | undefined;
  proposeEdit: (proposal: ReportEditProposal) => ReportEditProposalResult;
  applyFigureUpdate: (figureId: string, block: FigureBlock) => Promise<boolean>;
};

export const copilotViews = defineAIViews({
  viewing_products: view({
    label: () => getViewingProductsLabel(),
    instructions: () => getViewingProductsInstructions(),
  }),
  viewing_explore: view({
    label: () => getViewingExploreLabel(),
    instructions: () => getViewingExploreInstructions(),
  }),
  // The editing_* instructions each carry the entity IDS the old mode string
  // exposed (deckId / slideId / reportId) — ids are the model's cross-turn
  // correlation handle (tools RETURN ids; labels are not unique).
  editing_slide_deck: view<EditingSlideDeckParams, EditingSlideDeckContext>({
    label: (params) => params.deckLabel,
    instructions: (params, context) => {
      const base = `${getEditingSlideDeckInstructions(params.deckLabel)}\n\ndeckId: ${params.deckId}`;
      const selected = context.getSelectedSlideIds();
      if (selected.length === 0) return base;
      return `${base}\n\n## User's current selection\nSelected slide id(s): ${selected.join(", ")}`;
    },
  }),
  editing_slide: view<EditingSlideParams, EditingSlideContext>({
    label: (params) => params.slideLabel,
    instructions: (params) =>
      `${getEditingSlideInstructions(params.slideLabel, params.deckLabel)}\n\nslideId: ${params.slideId} | deckId: ${params.deckId}`,
  }),
  editing_report: view<EditingReportParams, EditingReportContext>({
    label: (params) => params.reportLabel,
    instructions: (params, context) => {
      const base = `${getEditingReportInstructions(params.reportLabel)}\n\nreportId: ${params.reportId}`;
      const sel = context.getSelection();
      if (!sel) return base;
      if (sel.empty) {
        return `${base}\n\n## User's current selection\nCursor at line ${sel.fromLine} (no text selected).`;
      }
      const preview = sel.text.replace(/\s+/g, " ").trim().slice(0, 200);
      return `${base}\n\n## User's current selection\nSelected text (lines ${sel.fromLine}-${sel.toLine}, ${sel.text.length} chars): "${preview}${sel.text.length > 200 ? "…" : ""}"`;
    },
  }),
});

// Concise, UI-facing labels (chat-pane header subtext) for the two no-params
// viewing_* views.
function getViewingProductsLabel(): string {
  return t3({ en: "Products", fr: "Produits", pt: "Produtos" });
}
function getViewingExploreLabel(): string {
  return t3({ en: "Explore", fr: "Explorer", pt: "Explorar" });
}

export type CopilotViewDefs = (typeof copilotViews)["_defs"];
export type CopilotViewId = keyof CopilotViewDefs;
export type CopilotViewState = AIViewState<CopilotViewDefs>;

export const copilotViewController: AIViewController<
  CopilotViewDefs,
  CopilotInteractionDefs
> = createAIViewController(copilotViews, {
  fallback: "viewing_products",
  interactions: copilotInteractions,
});

// THE env resolver (D15). While a product editor is open the copilot serves
// that product's package and scope — read from the view's live context, so a
// reattach or scope change mid-edit moves the copilot with the editor. With no
// editor open there is no product to take a pair from, so it falls back to the
// instance pin at national scope (the same pair /mcp binds). null = neither.
//
// REACTIVE: `current` is the controller's state signal, so a caller inside a
// tracking scope re-runs on every setView.
export function resolveCopilotScope(): PackageScope | null {
  const state = copilotViewController.current();
  switch (state.id) {
    case "editing_slide_deck":
    case "editing_slide":
    case "editing_report":
      return state.context.getScope();
    case "viewing_products":
    case "viewing_explore": {
      const pinnedRunId = instanceState.pinnedRunId;
      return pinnedRunId === null
        ? null
        : { runId: pinnedRunId, adminArea2: null };
    }
  }
}

// Restores a previously-captured view state verbatim (params + live context),
// for the "returnToContext" stack the nested editors use (deck editor → slide
// editor). A generic `setView(state.id, state.params, state.context)` helper
// cannot typecheck — TypeScript cannot correlate a discriminated union's
// fields through a second generic call — but a manual switch narrows `state`
// to each concrete member, so every branch below is fully typed with no casts.
export function restoreCopilotView(state: CopilotViewState): void {
  switch (state.id) {
    case "viewing_products":
      copilotViewController.setView("viewing_products");
      return;
    case "viewing_explore":
      copilotViewController.setView("viewing_explore");
      return;
    case "editing_slide_deck":
      copilotViewController.setView(
        "editing_slide_deck",
        state.params,
        state.context,
      );
      return;
    case "editing_slide":
      copilotViewController.setView(
        "editing_slide",
        state.params,
        state.context,
      );
      return;
    case "editing_report":
      copilotViewController.setView(
        "editing_report",
        state.params,
        state.context,
      );
      return;
  }
}
