import { createAIViewController, defineAIViews, view } from "panther";
import type { AIViewController, AIViewState, AnyAIView } from "panther";
import {
  type CopilotPair,
  type CopilotViewId,
  copilotViewIdentity,
  type FastrReportTemplate,
  getEditingReportInstructions,
  getSlideTitle,
} from "lib";
import type {
  DatasetType,
  FigureBlock,
  ImageBlock,
  MetricWithStatus,
  PresentationObjectConfig,
  ReportFormat,
  ReportHtmlStyle,
  ResolvedPackageScope,
  Slide,
  SlideDeckConfig,
} from "lib";
import { onCleanup } from "solid-js";
import type { SetStoreFunction } from "solid-js/store";
import type {
  ReportEditorSelection,
  ReportEditProposal,
  ReportEditProposalResult,
} from "./types";
import {
  type CopilotInteractionDefs,
  copilotInteractions,
} from "./interactions";
import {
  getEditingSlideDeckInstructions,
  getEditingSlideInstructions,
  getOpeningProductInstructions,
} from "./build_system_prompt";

////////////////////////////////////////////////////////////////////////////////
// COPILOT: AI VIEW REGISTRY
////////////////////////////////////////////////////////////////////////////////
//
// The one registry of the chat: a view per place the user can be, keyed by
// the catalogue's view ids (lib/ai_tools/copilot_catalogue.ts), with `shell`
// the fallback until a page sets its view. TParams is the serializable,
// model-visible half (ids; the report's format and style); TContext is the
// live payload (an editor's store getters and setters, a package view's
// pair) delivered to tool handlers opaquely. Labels are read live through
// the context, never captured into params, so a rename or a title edit never
// leaves the view line stale.
//
// Every view that shows something declares its `identity` through
// `copilotViewIdentity`: a view-limited call is refused once the live
// identity differs from the one the turn last saw, so a move inside a view
// (another slide of the same deck, a reattached product) refuses a call
// planned for the old one.
//
// The controller is a module singleton. A place holds the view it covers
// (`holdCopilotView`, synchronously at mount) and sets its own once its state
// is ready; the hold restores the covered view when the place unmounts, and
// Solid cleans a node's children before its own cleanups, so nested places
// unwind in order. The sync sites are the deck and report editors
// (`opening_product` at mount, `editing_slide_deck` or `editing_report` once
// loaded) and the slide editor (`editing_slide`); every other view is
// declared here and has no sync site yet.
//
// instructions carries the per-view prompt PLUS the live bits that used to
// ride the old mode string (the deck's selected slide ids; the report
// editor's selection preview). instructionsDelivery stays the default
// "ephemeral" everywhere: the `system` accessor takes no view argument.

// Every package view's context: the pair the package tools run against,
// with its scope's definition hash (the identity's pair part reads it), and
// the run the module internals read by. Both throw AIToolFailure naming why
// there is no package. No run id crosses the tool seam: the pair rides the
// opaque context half and appears in no tool schema.
export type PackageViewContext = {
  getScope: () => ResolvedPackageScope;
  getRunId: () => string;
};

// The identity's pair part; absent while the view has no package.
function pairOf(context: PackageViewContext): CopilotPair | undefined {
  try {
    const { runId, scopeId, definitionHash } = context.getScope();
    return { runId, scopeId, definitionHash };
  } catch {
    return undefined;
  }
}

// A product's own views (while it opens, its settings, its history): the
// product's name, read live.
export type ProductViewContext = PackageViewContext & {
  getLabel: () => string;
};

export type OpeningProductParams = {
  productId: string;
};

// Params carry what is fixed before setView: ids, and the report's format
// and style. Labels are read live through the context, so a rename or a
// title edit never leaves the view line stale.
export type EditingSlideDeckParams = {
  deckId: string;
};
export type EditingSlideDeckContext = PackageViewContext & {
  getDeckLabel: () => string;
  getDeckConfig: () => SlideDeckConfig;
  getSlideIds: () => string[];
  getSelectedSlideIds: () => string[];
};

export type EditingSlideParams = {
  slideId: string;
  deckId: string;
};
// The slide editor sits beside the deck's slide rail, so this view carries
// the deck's context too: every deck tool is available while a slide is open.
export type EditingSlideContext = EditingSlideDeckContext & {
  getTempSlide: () => Slide;
  setTempSlide: SetStoreFunction<Slide>;
};

export type EditingReportParams = {
  reportId: string;
  // Format and (html only) style, fixed at creation and known before setView.
  format: ReportFormat;
  htmlStyle?: ReportHtmlStyle;
  // Custom style, resolved live-vs-snapshot by the report editor (S12).
  customStyle?: { label: string; brief: string; referenceCss?: string | null };
};
// See ./types.ts for ReportEditProposal(Result) and ReportEditorSelection.
export type EditingReportContext = PackageViewContext & {
  getLabel: () => string;
  // The template the report was started from (fastr only), read live: it is
  // chosen after the view is set, from the template modal.
  getTemplate: () => FastrReportTemplate | undefined;
  getBody: () => string;
  getFigures: () => Record<string, FigureBlock>;
  getImages: () => Record<string, ImageBlock>;
  getSelection: () => ReportEditorSelection | undefined;
  proposeEdit: (proposal: ReportEditProposal) => ReportEditProposalResult;
  applyFigureUpdate: (figureId: string, block: FigureBlock) => Promise<boolean>;
  // The chat menu's "Save this report's style…": the action for an html
  // report the user can edit, undefined otherwise. The report supplies it,
  // so the pane imports nothing from components/products/.
  getSaveStyleAction: () => (() => Promise<void>) | undefined;
};

export type ReportParams = {
  reportId: string;
};

// A figure editor's view: the figure it edits or shows, by its metric, and
// its draft config live, read and applied. `figureId` names the slide block,
// the report figure or the package's default visualization.
export type FigureEditorContext = PackageViewContext & {
  getLabel: () => string;
  getMetric: () => MetricWithStatus;
  getDraftConfig: () => PresentationObjectConfig;
  applyDraftConfig: (config: PresentationObjectConfig) => void;
};
export type EditingSlideFigureParams = {
  deckId: string;
  slideId: string;
  figureId: string;
};
export type EditingReportFigureParams = {
  reportId: string;
  figureId: string;
};
export type ViewingPackageFigureParams = {
  figureId: string;
};

export type ResultsFileParams = {
  moduleId: string;
  resultsObjectId: string;
};

export type PackagePageParams = {
  runId: string;
};
export type PackagePageContext = PackageViewContext & {
  getLabel: () => string;
};

// The Data switchboard's pages, each a `data_page` with the family it is
// about, when it is about one.
export const DATA_PAGE_IDS = [
  "registry_configuration",
  "facilities",
  "geojson_maps",
  "admin_area_labels",
  "hmis_indicators",
  "hmis_data",
  "population",
  "hfa_time_points",
  "hfa_weights",
  "hfa_indicators",
  "hfa_data",
  "iceh_data",
] as const;
export type DataPageId = (typeof DATA_PAGE_IDS)[number];
export type DataPageParams = {
  page: DataPageId;
  family?: DatasetType;
};

export type HfaIndicatorEditorParams = {
  indicatorId: string;
};
export type HfaIndicatorEditorContext = {
  getLabel: () => string;
};

export const copilotViews = defineAIViews(
  {
    products: view({ label: "Products" }),
    opening_product: view<OpeningProductParams, ProductViewContext>({
      label: (_params, context) => context.getLabel(),
      identity: (params, context) =>
        copilotViewIdentity("opening_product", {
          product: params.productId,
          pair: pairOf(context),
        }),
      instructions: () => getOpeningProductInstructions(),
    }),
    // The editing_* instructions each carry the entity IDS the old mode
    // string exposed (deckId / slideId / reportId): ids are the model's
    // cross-turn correlation handle (tools RETURN ids; labels are not unique).
    editing_slide_deck: view<EditingSlideDeckParams, EditingSlideDeckContext>({
      label: (_params, context) => context.getDeckLabel(),
      identity: (params, context) =>
        copilotViewIdentity("editing_slide_deck", {
          deck: params.deckId,
          pair: pairOf(context),
        }),
      instructions: (params, context) => {
        const base = `${
          getEditingSlideDeckInstructions(context.getDeckLabel())
        }\n\ndeckId: ${params.deckId}`;
        const selected = context.getSelectedSlideIds();
        if (selected.length === 0) return base;
        return `${base}\n\n## User's current selection\nSelected slide id(s): ${
          selected.join(", ")
        }`;
      },
    }),
    editing_slide: view<EditingSlideParams, EditingSlideContext>({
      label: (_params, context) => getSlideTitle(context.getTempSlide()),
      identity: (params, context) =>
        copilotViewIdentity("editing_slide", {
          deck: params.deckId,
          slide: params.slideId,
          pair: pairOf(context),
        }),
      instructions: (params, context) => {
        const base = `${
          getEditingSlideInstructions(
            getSlideTitle(context.getTempSlide()),
            context.getDeckLabel(),
          )
        }\n\nslideId: ${params.slideId} | deckId: ${params.deckId}`;
        const selected = context.getSelectedSlideIds();
        if (selected.length === 0) return base;
        return `${base}\n\n## User's current selection in the slide list\nSelected slide id(s): ${
          selected.join(", ")
        }`;
      },
    }),
    editing_slide_figure: view<EditingSlideFigureParams, FigureEditorContext>({
      label: (_params, context) => context.getLabel(),
      identity: (params, context) =>
        copilotViewIdentity("editing_slide_figure", {
          deck: params.deckId,
          slide: params.slideId,
          figure: params.figureId,
          pair: pairOf(context),
        }),
    }),
    deck_settings: view<EditingSlideDeckParams, ProductViewContext>({
      label: (_params, context) => context.getLabel(),
      identity: (params, context) =>
        copilotViewIdentity("deck_settings", {
          deck: params.deckId,
          pair: pairOf(context),
        }),
    }),
    deck_history: view<EditingSlideDeckParams, ProductViewContext>({
      label: (_params, context) => context.getLabel(),
      identity: (params, context) =>
        copilotViewIdentity("deck_history", {
          deck: params.deckId,
          pair: pairOf(context),
        }),
    }),
    report_history: view<ReportParams, ProductViewContext>({
      label: (_params, context) => context.getLabel(),
      identity: (params, context) =>
        copilotViewIdentity("report_history", {
          report: params.reportId,
          pair: pairOf(context),
        }),
    }),
    editing_report: view<EditingReportParams, EditingReportContext>({
      label: (_params, context) => context.getLabel(),
      identity: (params, context) =>
        copilotViewIdentity("editing_report", {
          report: params.reportId,
          pair: pairOf(context),
        }),
      instructions: (params, context) => {
        const base = `${
          getEditingReportInstructions(
            context.getLabel(),
            params.format,
            params.htmlStyle,
            params.customStyle,
            context.getTemplate(),
          )
        }\n\nreportId: ${params.reportId}`;
        const sel = context.getSelection();
        if (!sel) return base;
        if (sel.empty) {
          return `${base}\n\n## User's current selection\nCursor at line ${sel.fromLine} (no text selected).`;
        }
        const preview = sel.text.replace(/\s+/g, " ").trim().slice(0, 200);
        return `${base}\n\n## User's current selection\nSelected text (lines ${sel.fromLine}-${sel.toLine}, ${sel.text.length} chars): "${preview}${
          sel.text.length > 200 ? "…" : ""
        }"`;
      },
    }),
    editing_report_figure: view<
      EditingReportFigureParams,
      FigureEditorContext
    >({
      label: (_params, context) => context.getLabel(),
      identity: (params, context) =>
        copilotViewIdentity("editing_report_figure", {
          report: params.reportId,
          figure: params.figureId,
          pair: pairOf(context),
        }),
    }),
    results_file: view<ResultsFileParams, PackageViewContext>({
      label: (params) => `${params.moduleId} / ${params.resultsObjectId}`,
      identity: (params, context) =>
        copilotViewIdentity("results_file", {
          resultsObject: params.resultsObjectId,
          pair: pairOf(context),
        }),
    }),
    explore: view<void, PackageViewContext>({
      label: "Explore",
      identity: (_params, context) =>
        copilotViewIdentity("explore", { pair: pairOf(context) }),
    }),
    results_packages: view({ label: "Results packages" }),
    package: view<PackagePageParams, PackagePageContext>({
      label: (_params, context) => context.getLabel(),
      identity: (params, context) =>
        copilotViewIdentity("package", {
          run: params.runId,
          pair: pairOf(context),
        }),
    }),
    viewing_package_figure: view<
      ViewingPackageFigureParams,
      FigureEditorContext
    >({
      label: (_params, context) => context.getLabel(),
      identity: (params, context) =>
        copilotViewIdentity("viewing_package_figure", {
          figure: params.figureId,
          pair: pairOf(context),
        }),
    }),
    module_defaults: view({ label: "Module defaults" }),
    scopes: view({ label: "Scopes" }),
    data: view({ label: "Data" }),
    data_page: view<DataPageParams, void>({
      label: (params) =>
        params.family === undefined
          ? params.page
          : `${params.page} (${params.family})`,
      identity: (params) =>
        copilotViewIdentity("data_page", {
          page: params.page,
          family: params.family,
        }),
    }),
    hfa_indicators: view({ label: "HFA indicators" }),
    hfa_indicator_editor: view<
      HfaIndicatorEditorParams,
      HfaIndicatorEditorContext
    >({
      label: (_params, context) => context.getLabel(),
      identity: (params) =>
        copilotViewIdentity("hfa_indicator_editor", {
          indicator: params.indicatorId,
        }),
    }),
    hfa_indicator_import: view({ label: "HFA indicator import" }),
    assets: view({ label: "Assets" }),
    users: view({ label: "Users" }),
    user: view({ label: "User" }),
    shell: view({ label: "No page open" }),
  } satisfies Record<CopilotViewId, AnyAIView>,
);

export type CopilotViewDefs = (typeof copilotViews)["_defs"];
export type CopilotViewState = AIViewState<CopilotViewDefs>;

export const copilotViewController: AIViewController<
  CopilotViewDefs,
  CopilotInteractionDefs
> = createAIViewController(copilotViews, {
  fallback: "shell",
  interactions: copilotInteractions,
  digestAcrossViews: true,
});

// Captures the current view and restores it when the calling place unmounts.
// Call it synchronously in the place's component body, before the place sets
// its own view.
export function holdCopilotView(): void {
  const held = copilotViewController.current();
  onCleanup(() => restoreCopilotView(held));
}

// Sets a captured view state again, verbatim (params + live context). A
// generic `setView(state.id, state.params, state.context)` cannot typecheck:
// TypeScript cannot correlate a discriminated union's fields through a
// second generic call, but a switch narrows `state` to each member, so every
// branch is fully typed with no casts.
export function restoreCopilotView(state: CopilotViewState): void {
  switch (state.id) {
    case "shell":
      copilotViewController.clearView();
      return;
    case "products":
    case "results_packages":
    case "module_defaults":
    case "scopes":
    case "data":
    case "hfa_indicators":
    case "hfa_indicator_import":
    case "assets":
    case "users":
    case "user":
      copilotViewController.setView(state.id);
      return;
    case "opening_product":
      copilotViewController.setView(
        "opening_product",
        state.params,
        state.context,
      );
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
    case "editing_slide_figure":
      copilotViewController.setView(
        "editing_slide_figure",
        state.params,
        state.context,
      );
      return;
    case "deck_settings":
      copilotViewController.setView(
        "deck_settings",
        state.params,
        state.context,
      );
      return;
    case "deck_history":
      copilotViewController.setView(
        "deck_history",
        state.params,
        state.context,
      );
      return;
    case "report_history":
      copilotViewController.setView(
        "report_history",
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
    case "editing_report_figure":
      copilotViewController.setView(
        "editing_report_figure",
        state.params,
        state.context,
      );
      return;
    case "results_file":
      copilotViewController.setView(
        "results_file",
        state.params,
        state.context,
      );
      return;
    case "explore":
      copilotViewController.setView("explore", undefined, state.context);
      return;
    case "package":
      copilotViewController.setView("package", state.params, state.context);
      return;
    case "viewing_package_figure":
      copilotViewController.setView(
        "viewing_package_figure",
        state.params,
        state.context,
      );
      return;
    case "data_page":
      copilotViewController.setView("data_page", state.params);
      return;
    case "hfa_indicator_editor":
      copilotViewController.setView(
        "hfa_indicator_editor",
        state.params,
        state.context,
      );
      return;
  }
}
