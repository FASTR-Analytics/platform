import { createAIViewController, defineAIViews, view } from "panther";
import type { AIViewController, AIViewState } from "panther";
import type {
  FigureBlock,
  ImageBlock,
  PackageScope,
  Slide,
  SlideDeckConfig,
  SlideType,
} from "lib";
import type { SetStoreFunction } from "solid-js/store";
import type {
  ReportEditorSelection,
  ReportEditProposal,
  ReportEditProposalResult,
} from "./types";
import {
  copilotInteractions,
  type CopilotInteractionDefs,
} from "./interactions";
import {
  getEditingReportInstructions,
  getEditingSlideDeckInstructions,
  getEditingSlideInstructions,
  getOpeningProductInstructions,
} from "./build_system_prompt";

////////////////////////////////////////////////////////////////////////////////
// COPILOT: AI VIEW REGISTRY
////////////////////////////////////////////////////////////////////////////////
//
// The copilot is mounted per open product (PLAN_PRODUCTS_RESTRUCTURE D15), so
// the views are the three product editors plus `opening_product`, the
// paramless fallback the controller sits in between the host mounting and the
// editor's first `setView` (each editor sets its view after its first fetch).
// TParams is the serializable, model-visible half (view-label text, tool
// narrowing); TContext is the live payload (the editor's store getters and
// setters, and the open product's PackageScope) delivered to tool handlers
// opaquely.
//
// The controller is a module singleton: only one product is ever open, and
// the host clears its interaction log at mount so nothing leaks between
// products. The sync sites are each editor's mount and teardown, and the
// deck-to-slide `returnToContext` stack.
//
// instructions carries the per-view prompt section PLUS the live bits that
// used to ride the old mode string (the deck's selected slide ids; the report
// editor's selection preview). instructionsDelivery stays the default
// "ephemeral" everywhere: the `system` accessor takes no view argument, so it
// is byte-stable for the life of the mount.

// Every editing view carries the open product's pair. It rides the opaque
// CONTEXT half deliberately: no run id crosses the tool seam and none appears
// in a tool schema (D15).
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
  opening_product: view({
    label: () => "",
    instructions: () => getOpeningProductInstructions(),
  }),
  // The editing_* instructions each carry the entity IDS the old mode string
  // exposed (deckId / slideId / reportId): ids are the model's cross-turn
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

export type CopilotViewDefs = (typeof copilotViews)["_defs"];
export type CopilotViewId = keyof CopilotViewDefs;
export type CopilotViewState = AIViewState<CopilotViewDefs>;

export const copilotViewController: AIViewController<
  CopilotViewDefs,
  CopilotInteractionDefs
> = createAIViewController(copilotViews, {
  fallback: "opening_product",
  interactions: copilotInteractions,
});

// Restores a previously-captured view state verbatim (params + live context),
// for the "returnToContext" stack the nested editors use (deck editor to slide
// editor). A generic `setView(state.id, state.params, state.context)` helper
// cannot typecheck: TypeScript cannot correlate a discriminated union's fields
// through a second generic call (the same reason views.ts's OWN setView takes
// positional args instead of a state object), but a manual switch narrows
// `state` to each concrete member, so every branch below is fully typed with
// no casts.
export function restoreCopilotView(state: CopilotViewState): void {
  switch (state.id) {
    case "opening_product":
      copilotViewController.clearView();
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
