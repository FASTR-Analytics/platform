import {
  AIToolFailure,
  createAIViewController,
  defineAIViews,
  view,
} from "panther";
import type {
  AIViewController,
  AIViewState,
  AnyAIView,
  APIResponseWithData,
} from "panther";
import {
  COPILOT_PACKAGE_VIEWS,
  type CopilotPackageViewId,
  type CopilotPair,
  type CopilotViewId,
  copilotViewIdentity,
  getEditingReportInstructions,
  getSlideTitle,
  isUntouchedReport,
  productLevelAtLeast,
  productScope,
} from "lib";
import type {
  DatasetType,
  FigureBlock,
  FigureLocalization,
  HfaIndicatorCategory,
  HfaIndicatorServiceCategory,
  HfaIndicatorSubCategory,
  ImageBlock,
  MetricWithStatus,
  PresentationObjectConfig,
  ResolvedPackageScope,
  RunCatalogStatus,
  RunProgress,
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
  type DataSectionForAI,
  type ExploreSelection,
  formatDataState,
  formatExploreState,
  formatPackageState,
  formatResultsPackagesState,
  getAssetsInstructions,
  getDataPageInstructions,
  getDeckSettingsInstructions,
  getEditingSlideDeckInstructions,
  getFigureEditorInstructions,
  getHfaIndicatorEditorInstructions,
  getHfaIndicatorsInstructions,
  getHistoryInstructions,
  getOpeningProductInstructions,
  getProductsInstructions,
  getResultsFileInstructions,
  getUserInstructions,
  getUsersInstructions,
  PRODUCT_VIEW_ONLY_LINE,
} from "./build_system_prompt";
import { productLevel } from "~/state/instance/product_access";
import {
  createResolvedScope,
  instanceState,
  productById,
} from "~/state/instance/t1_store";

////////////////////////////////////////////////////////////////////////////////
// COPILOT: AI VIEW REGISTRY
////////////////////////////////////////////////////////////////////////////////
//
// The one registry of the chat: a view per place the user can be, keyed by
// the catalogue's view ids (lib/ai_tools/copilot_catalogue.ts), with `shell`
// the fallback until a page sets its view. TParams is the serializable,
// model-visible half (ids; the report's format and style); TContext is the
// live payload (an editor's store getters and setters, a package view's
// pair) delivered to tool handlers opaquely; the package tools bind per call
// to the pair the view's context returns (bind_package_tools.ts). Labels are
// read live through the context, never captured into params, so a rename or
// a title edit never leaves the view line stale.
//
// Every view that shows something declares its `identity` through
// `copilotViewIdentity` over the catalogue's parts, which say what a move is
// (COPILOT_VIEW_IDENTITY_PARTS).
//
// The controller is a module singleton. A place holds the view it covers
// (`holdCopilotView`, synchronously at mount) and sets its own once its state
// is ready; the hold restores the covered view when the place unmounts, and
// Solid cleans a node's children before its own cleanups, so nested places
// unwind in order. The sync sites are the deck and report editors
// (`opening_product` at mount, `editing_slide_deck` or `editing_report` once
// loaded), Explore (`explore`), the Results page (`results_packages`), the
// package page (`package`, set again when the status changes), the Module
// defaults and Scopes views, the Products, Data, Assets and Users pages and
// the user detail, the Data switchboard's `openSubPage`, which sets
// `data_page` for every page it opens and restores the view it covered when
// the page closes, and the places inside products: deck settings
// (`deck_settings`), the version histories (`deck_history`,
// `report_history`), the figure editor (the view its host names in `aiView`,
// through `setFigureEditorView`), the results file viewer (`results_file`)
// and the HFA indicators manager (`hfa_indicators`, over the switchboard's
// `data_page`), whose code editor sets `hfa_indicator_editor` once its draft
// store exists and whose Excel import sets `hfa_indicator_import`.
//
// What the model is told per view splits in two (append-only turns, E7):
// `instructions` is the static guidance of the view, which rides a message
// once per text; `state` is what changes without a navigation (the entity
// ids, the deck's open slide and selected slide ids, the report editor's
// selection preview) and rides every message. Below edit level a product
// view's instructions carry PRODUCT_VIEW_ONLY_LINE, read live at send.
// instructionsDelivery stays the default "ephemeral" everywhere: the `system`
// accessor is instance level and takes no view argument.

// Every package view's context: the pair the package tools run against,
// with its scope's definition hash (the identity's pair part reads it), and
// the run the module internals read by. Both throw AIToolFailure naming why
// there is no package. No run id crosses the tool seam: the pair rides the
// opaque context half and appears in no tool schema.
export type PackageViewContext = {
  getScope: () => ResolvedPackageScope;
  getRunId: () => string;
};

// The views whose context carries the pair, as the catalogue lists them.
type CopilotPackageViewState = Extract<
  CopilotViewState,
  { id: CopilotPackageViewId }
>;

function isPackageView(
  view: CopilotViewState,
): view is CopilotPackageViewState {
  return (COPILOT_PACKAGE_VIEWS as readonly string[]).includes(view.id);
}

// The pair context of a package view; undefined for a view with no package.
export function packageViewContext(
  view: CopilotViewState,
): PackageViewContext | undefined {
  return isPackageView(view) ? view.context : undefined;
}

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

// A product's own view context from its T1 row, read live: the label, and
// the pair with its scope's definition hash, or an AIToolFailure naming why
// once the row is gone. Creates a memo, so it is called in a component body.
export function productViewContext(productId: string): ProductViewContext {
  const resolved = createResolvedScope(() => {
    const product = productById(productId);
    return product === undefined ? undefined : productScope(product);
  });
  const getScope = () => {
    const scope = resolved();
    if (scope === undefined) {
      throw new AIToolFailure("This product no longer exists.");
    }
    return scope;
  };
  return {
    getLabel: () => productById(productId)?.label ?? "",
    getScope,
    getRunId: () => getScope().runId,
  };
}

export type OpeningProductParams = {
  productId: string;
};

// Params carry what is fixed before setView: ids, and the report's format
// and style. Labels are read live through the context, so a rename or a
// title edit never leaves the view line stale.
export type EditingSlideDeckParams = {
  deckId: string;
};
// The slide open beside the deck's rail: one object per slide editor mount,
// so a handler that captured it and finds a different one after its awaits
// knows the user switched slides. `getDraft` is the editor's live store
// (callers unwrap it); `setDraft` is its raw setter, which reports nothing to
// the copilot as the user's edit.
export type OpenSlide = {
  slideId: string;
  getDraft: () => Slide;
  setDraft: SetStoreFunction<Slide>;
};
export type EditingSlideDeckContext = PackageViewContext & {
  getDeckLabel: () => string;
  getDeckConfig: () => SlideDeckConfig;
  getSlideIds: () => string[];
  getSelectedSlideIds: () => string[];
  getOpenSlide: () => OpenSlide | undefined;
  // The deck's delete, as the rail runs it: the editor leaves a deleted open
  // slide before the request.
  deleteSlides: (
    slideIds: string[],
  ) => Promise<APIResponseWithData<{ deletedIds: string[] }>>;
};

export type EditingReportParams = {
  reportId: string;
};
// See ./types.ts for ReportEditProposal(Result) and ReportEditorSelection.
export type EditingReportContext = PackageViewContext & {
  getLabel: () => string;
  getBody: () => string;
  getFigures: () => Record<string, FigureBlock>;
  getImages: () => Record<string, ImageBlock>;
  getSelection: () => ReportEditorSelection | undefined;
  proposeEdit: (proposal: ReportEditProposal) => ReportEditProposalResult;
  applyFigureUpdate: (figureId: string, block: FigureBlock) => Promise<boolean>;
};

export type ReportParams = {
  reportId: string;
};

// A figure editor's view: the figure it edits or shows, by its metric, and
// its draft config live, read and applied. `figureId` names the slide block,
// the report figure or the package's preset.
export type FigureEditorContext = PackageViewContext & {
  getLabel: () => string;
  getMetric: () => MetricWithStatus;
  getDraftConfig: () => PresentationObjectConfig;
  /** The edited figure's own localization, so a bundle the chat resolves to
   *  preview a patch labels it exactly as the figure does. */
  getLocalization: () => FigureLocalization;
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

// The view a figure editor's host names in the editor's `aiView` prop: which
// of the three figure views, with the params its identity needs.
export type FigureEditorView =
  | { id: "editing_slide_figure"; params: EditingSlideFigureParams }
  | { id: "editing_report_figure"; params: EditingReportFigureParams }
  | { id: "viewing_package_figure"; params: ViewingPackageFigureParams };

// The figure editor sets the view its host named. A switch, for the reason
// `restoreCopilotView` gives.
export function setFigureEditorView(
  view: FigureEditorView,
  context: FigureEditorContext,
): void {
  switch (view.id) {
    case "editing_slide_figure":
      copilotViewController.setView(
        "editing_slide_figure",
        view.params,
        context,
      );
      return;
    case "editing_report_figure":
      copilotViewController.setView(
        "editing_report_figure",
        view.params,
        context,
      );
      return;
    case "viewing_package_figure":
      copilotViewController.setView(
        "viewing_package_figure",
        view.params,
        context,
      );
      return;
  }
}

export type ResultsFileParams = {
  moduleId: string;
  resultsObjectId: string;
};

// Explore's view: the pair it resolves (the chosen package or its fallback,
// at the chosen scope) and what the page resolves on it, read live.
export type ExploreContext = PackageViewContext & {
  getSelection: () => ExploreSelection | undefined;
};

export type PackagePageParams = {
  runId: string;
};
// The package page's view: its pair is the page's package at the page scope,
// which `getScope` has only while the package is ready; the status, the
// progress and the open module are the state.
export type PackagePageContext = PackageViewContext & {
  getLabel: () => string;
  getStatus: () => RunCatalogStatus;
  getProgress: () => RunProgress | null;
  getOpenModuleId: () => string | undefined;
};

// The Data switchboard's view: its rows' labels and status marks, read live
// from the page.
export type DataContext = {
  getSections: () => DataSectionForAI[];
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

// The HFA indicators manager's view: the guidance the manager supplies
// (`components/data/hfa/indicators/ai/instructions.ts`, S5's, so this
// registry imports nothing from `components/data/`) and the open tab.
export type HfaIndicatorsContext = {
  getGuidance: () => string;
  getTab: () => string;
};

export type HfaIndicatorEditorParams = {
  indicatorId: string;
};
// One round of the code editor's draft, with the issues the editor's own
// validation finds in it (syntax, unknown variables, warnings, the result
// type), as English lines.
export type HfaIndicatorEditorRound = {
  timePoint: string;
  rCode: string;
  rFilterCode: string;
  issues: string[];
};
// The code editor's unsaved state: the fields its tools may change, the
// code per round, and whether the non-empty rounds agree.
export type HfaIndicatorEditorDraft = {
  shortLabel: string;
  definition: string;
  type: "binary" | "numeric";
  aggregation: "sum" | "avg";
  categoryId: string | null;
  subCategoryId: string | null;
  serviceCategoryIds: string[];
  code: HfaIndicatorEditorRound[];
  codeConsistent: boolean;
};
// What `update_hfa_indicator_editor` may change: every field optional, the
// code by round, a round's field omitted to keep it.
export type HfaIndicatorEditorPatch = {
  shortLabel?: string;
  definition?: string;
  type?: "binary" | "numeric";
  aggregation?: "sum" | "avg";
  categoryId?: string | null;
  subCategoryId?: string | null;
  serviceCategoryIds?: string[];
  code?: { timePoint: string; rCode?: string; rFilterCode?: string }[];
};
export type HfaIndicatorEditorTaxonomy = {
  categories: HfaIndicatorCategory[];
  subCategories: HfaIndicatorSubCategory[];
  serviceCategories: HfaIndicatorServiceCategory[];
};
// The code editor's view: the open indicator's saved label, the round the
// user is looking at, the draft read live with the editor's validation, the
// taxonomy the editor offers, and the write that lands in the draft and
// marks it unsaved, for the user to save.
export type HfaIndicatorEditorContext = {
  getLabel: () => string;
  getSelectedTimePoint: () => string;
  getDraft: () => HfaIndicatorEditorDraft;
  getTaxonomy: () => HfaIndicatorEditorTaxonomy;
  applyDraft: (patch: HfaIndicatorEditorPatch) => void;
};

// The level line for a product view's instructions: present below edit
// level, read live from the product's summary, so a demotion reaches the next
// message.
function productViewOnlyLine(productId: string): string {
  return productLevelAtLeast(productLevel(productId), "edit")
    ? ""
    : `\n\n${PRODUCT_VIEW_ONLY_LINE}`;
}

// The open slide as the deck view's state names it: its id, where it sits,
// its type and its title, read from the draft so an edit never leaves the
// line stale. A deck with slides has none open while one loads.
function openSlideLine(context: EditingSlideDeckContext): string {
  const slideIds = context.getSlideIds();
  const open = context.getOpenSlide();
  if (open === undefined) {
    return slideIds.length === 0
      ? "Open slide: none (the deck has no slides)"
      : "Open slide: none";
  }
  const draft = open.getDraft();
  const at = slideIds.indexOf(open.slideId);
  const position = at === -1
    ? "no longer in the deck"
    : `${at + 1} of ${slideIds.length}`;
  const title = getSlideTitle(draft).replace(/\s+/g, " ").trim();
  return `Open slide: ${open.slideId} (${position}, ${draft.type}): "${title}"`;
}

export const copilotViews = defineAIViews(
  {
    products: view({
      label: "Products",
      instructions: () => getProductsInstructions(),
    }),
    opening_product: view<OpeningProductParams, ProductViewContext>({
      label: (_params, context) => context.getLabel(),
      identity: (params, context) =>
        copilotViewIdentity("opening_product", {
          product: params.productId,
          pair: pairOf(context),
        }),
      instructions: () => getOpeningProductInstructions(),
    }),
    // The editing_* states each carry the entity IDS (deckId, the open
    // slide's id, reportId): ids are the model's cross-turn correlation
    // handle (tools RETURN ids; labels are not unique).
    editing_slide_deck: view<EditingSlideDeckParams, EditingSlideDeckContext>({
      label: (_params, context) => context.getDeckLabel(),
      identity: (params, context) =>
        copilotViewIdentity("editing_slide_deck", {
          deck: params.deckId,
          pair: pairOf(context),
        }),
      instructions: (params, context) =>
        `${getEditingSlideDeckInstructions(context.getDeckLabel())}${
          productViewOnlyLine(params.deckId)
        }`,
      state: (params, context) => {
        const selected = context.getSelectedSlideIds();
        return [
          `deckId: ${params.deckId}`,
          openSlideLine(context),
          ...(selected.length === 0
            ? []
            : [`Selected slide id(s): ${selected.join(", ")}`]),
        ].join("\n");
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
      instructions: (_params, context) =>
        getFigureEditorInstructions(context.getLabel(), "slide"),
    }),
    deck_settings: view<EditingSlideDeckParams, ProductViewContext>({
      label: (_params, context) => context.getLabel(),
      identity: (params, context) =>
        copilotViewIdentity("deck_settings", {
          deck: params.deckId,
          pair: pairOf(context),
        }),
      instructions: (_params, context) =>
        getDeckSettingsInstructions(context.getLabel()),
    }),
    deck_history: view<EditingSlideDeckParams, ProductViewContext>({
      label: (_params, context) => context.getLabel(),
      identity: (params, context) =>
        copilotViewIdentity("deck_history", {
          deck: params.deckId,
          pair: pairOf(context),
        }),
      instructions: (_params, context) =>
        getHistoryInstructions(context.getLabel(), "deck"),
    }),
    report_history: view<ReportParams, ProductViewContext>({
      label: (_params, context) => context.getLabel(),
      identity: (params, context) =>
        copilotViewIdentity("report_history", {
          report: params.reportId,
          pair: pairOf(context),
        }),
      instructions: (_params, context) =>
        getHistoryInstructions(context.getLabel(), "report"),
    }),
    editing_report: view<EditingReportParams, EditingReportContext>({
      label: (_params, context) => context.getLabel(),
      identity: (params, context) =>
        copilotViewIdentity("editing_report", {
          report: params.reportId,
          pair: pairOf(context),
        }),
      instructions: (params, context) =>
        `${
          getEditingReportInstructions(context.getLabel(), {
            untouched: isUntouchedReport({
              body: context.getBody(),
              figures: context.getFigures(),
              images: context.getImages(),
            }),
          })
        }${productViewOnlyLine(params.reportId)}`,
      state: (params, context) => {
        const ids = `reportId: ${params.reportId}`;
        const sel = context.getSelection();
        if (!sel) return ids;
        if (sel.empty) {
          return `${ids}\nCursor at line ${sel.fromLine} (no text selected).`;
        }
        const preview = sel.text.replace(/\s+/g, " ").trim().slice(0, 200);
        return `${ids}\nSelected text (lines ${sel.fromLine}-${sel.toLine}, ${sel.text.length} chars): "${preview}${
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
      instructions: (_params, context) =>
        getFigureEditorInstructions(context.getLabel(), "report"),
    }),
    results_file: view<ResultsFileParams, PackageViewContext>({
      label: (params) => `${params.moduleId} / ${params.resultsObjectId}`,
      identity: (params, context) =>
        copilotViewIdentity("results_file", {
          resultsObject: params.resultsObjectId,
          pair: pairOf(context),
        }),
      instructions: (params) =>
        getResultsFileInstructions(params.moduleId, params.resultsObjectId),
    }),
    explore: view<void, ExploreContext>({
      label: "Explore",
      identity: (_params, context) =>
        copilotViewIdentity("explore", { pair: pairOf(context) }),
      state: (_params, context) => formatExploreState(context.getSelection()),
    }),
    results_packages: view({
      label: "Results packages",
      state: () =>
        formatResultsPackagesState(
          instanceState.pinnedRunId,
          instanceState.runsCatalog,
        ),
    }),
    package: view<PackagePageParams, PackagePageContext>({
      label: (_params, context) => context.getLabel(),
      identity: (params, context) =>
        copilotViewIdentity("package", {
          run: params.runId,
          pair: pairOf(context),
        }),
      state: (_params, context) =>
        formatPackageState({
          status: context.getStatus(),
          progress: context.getProgress(),
          openModuleId: context.getOpenModuleId(),
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
      instructions: (_params, context) =>
        getFigureEditorInstructions(context.getLabel(), "package"),
    }),
    module_defaults: view({ label: "Module defaults" }),
    scopes: view({ label: "Scopes" }),
    data: view<void, DataContext>({
      label: "Data",
      state: (_params, context) => formatDataState(context.getSections()),
    }),
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
      instructions: (params) =>
        getDataPageInstructions(params.page, params.family),
    }),
    hfa_indicators: view<void, HfaIndicatorsContext>({
      label: "HFA indicators",
      instructions: (_params, context) =>
        getHfaIndicatorsInstructions(context.getGuidance()),
      state: (_params, context) => `Open tab: ${context.getTab()}`,
    }),
    hfa_indicator_editor: view<
      HfaIndicatorEditorParams,
      HfaIndicatorEditorContext
    >({
      label: (_params, context) => context.getLabel(),
      identity: (params) =>
        copilotViewIdentity("hfa_indicator_editor", {
          indicator: params.indicatorId,
        }),
      instructions: (_params, context) =>
        getHfaIndicatorEditorInstructions(context.getLabel()),
      state: (params, context) =>
        `indicatorId: ${params.indicatorId} | round: ${context.getSelectedTimePoint()}`,
    }),
    hfa_indicator_import: view({ label: "HFA indicator import" }),
    assets: view({
      label: "Assets",
      instructions: () => getAssetsInstructions(),
    }),
    users: view({ label: "Users", instructions: () => getUsersInstructions() }),
    user: view({ label: "User", instructions: () => getUserInstructions() }),
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
    case "data":
      copilotViewController.setView("data", undefined, state.context);
      return;
    case "hfa_indicators":
      copilotViewController.setView(
        "hfa_indicators",
        undefined,
        state.context,
      );
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
