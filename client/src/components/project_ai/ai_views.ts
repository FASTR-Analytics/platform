import { createAIViewController, defineAIViews, view } from "panther";
import type { AIViewController, AIViewState, AIViewVoidKeys } from "panther";
import { t3, TC } from "lib";
import type {
  FigureBlock,
  ImageBlock,
  PresentationObjectConfig,
  ResultsValue,
  Slide,
  SlideDeckConfig,
  SlideType,
} from "lib";
import type { SetStoreFunction } from "solid-js/store";
import type { TabOption } from "~/state/t4_ui";
import type {
  ReportEditorSelection,
  ReportEditProposal,
  ReportEditProposalResult,
} from "./types";
import {
  getEditingReportInstructions,
  getEditingSlideDeckInstructions,
  getEditingSlideInstructions,
  getEditingVisualizationInstructions,
  getViewingCacheInstructions,
  getViewingDashboardsInstructions,
  getViewingDataInstructions,
  getViewingMetricsInstructions,
  getViewingModulesInstructions,
  getViewingReportsInstructions,
  getViewingSettingsInstructions,
  getViewingSlideDecksInstructions,
  getViewingVisualizationsInstructions,
} from "./build_system_prompt";

////////////////////////////////////////////////////////////////////////////////
// PROJECT COPILOT — AI VIEW REGISTRY (Rung 3, PLAN_FUTURE_AI_ADOPTIONS.md)
////////////////////////////////////////////////////////////////////////////////
//
// Replaces the 13-arm AIContext union's interpretation duty. TParams is the
// serializable, model-visible half (view-label text, tool narrowing);
// TContext is the live payload (editor store getters/setters) delivered to
// tool handlers opaquely — mirrors the old AIContext* shapes 1:1, just split.
//
// promptSection carries what used to be build_system_prompt.ts's per-mode
// `getModeInstructions` switch (still exported from there, verbatim content)
// PLUS the two live bits that used to ride getEphemeralContext's mode string
// (deck's selected slide ids; report editor's selection preview) — both
// review-finding-1-safe: nothing here changes tool-handler behavior, only
// where the text is assembled. promptDelivery stays the default "ephemeral"
// everywhere: the `system` accessor (build_system_prompt.ts) no longer takes
// a mode/view argument at all, so it is byte-stable across navigation.

export type EditingSlideDeckParams = {
  deckId: string;
  deckLabel: string;
};
export type EditingSlideDeckContext = {
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
export type EditingSlideContext = {
  getTempSlide: () => Slide;
  setTempSlide: SetStoreFunction<Slide>;
};

export type EditingVisualizationParams = {
  vizId: string | null; // null for create/ephemeral modes without a persistent ID
  vizLabel: string;
};
export type EditingVisualizationContext = {
  resultsValue: ResultsValue;
  getTempConfig: () => PresentationObjectConfig;
  setTempConfig: SetStoreFunction<PresentationObjectConfig>;
};

export type EditingReportParams = {
  reportId: string;
  reportLabel: string;
};
// See ./types.ts for ReportEditProposal(Result) and ReportEditorSelection.
export type EditingReportContext = {
  getBody: () => string;
  getFigures: () => Record<string, FigureBlock>;
  getImages: () => Record<string, ImageBlock>;
  getSelection: () => ReportEditorSelection | undefined;
  proposeEdit: (proposal: ReportEditProposal) => ReportEditProposalResult;
  applyFigureUpdate: (figureId: string, block: FigureBlock) => Promise<boolean>;
};

export const projectAIViews = defineAIViews({
  viewing_visualizations: view({
    label: () => getViewingVisualizationsInstructionsLabel(),
    promptSection: () => getViewingVisualizationsInstructions(),
  }),
  viewing_slide_decks: view({
    label: () => getViewingSlideDecksInstructionsLabel(),
    promptSection: () => getViewingSlideDecksInstructions(),
  }),
  viewing_reports: view({
    label: () => getViewingReportsInstructionsLabel(),
    promptSection: () => getViewingReportsInstructions(),
  }),
  viewing_data: view({
    label: () => getViewingDataInstructionsLabel(),
    promptSection: () => getViewingDataInstructions(),
  }),
  viewing_metrics: view({
    label: () => getViewingMetricsInstructionsLabel(),
    promptSection: () => getViewingMetricsInstructions(),
  }),
  viewing_modules: view({
    label: () => getViewingModulesInstructionsLabel(),
    promptSection: () => getViewingModulesInstructions(),
  }),
  viewing_settings: view({
    label: () => getViewingSettingsInstructionsLabel(),
    promptSection: () => getViewingSettingsInstructions(),
  }),
  viewing_dashboards: view({
    label: () => getViewingDashboardsInstructionsLabel(),
    promptSection: () => getViewingDashboardsInstructions(),
  }),
  viewing_cache: view({
    label: () => getViewingCacheInstructionsLabel(),
    promptSection: () => getViewingCacheInstructions(),
  }),
  // The editing_* promptSections each carry the entity IDS the old
  // getEphemeralContext mode string exposed (deckId / slideId / vizId /
  // reportId) — ids are the model's cross-turn correlation handle (tools
  // RETURN ids; labels are not unique), and the viz editor's "unsaved"
  // signal tells the model the draft has no persistent id yet.
  editing_slide_deck: view<EditingSlideDeckParams, EditingSlideDeckContext>({
    label: (params) => params.deckLabel,
    promptSection: (params, context) => {
      const base = `${getEditingSlideDeckInstructions(params.deckLabel)}\n\ndeckId: ${params.deckId}`;
      const selected = context.getSelectedSlideIds();
      if (selected.length === 0) return base;
      return `${base}\n\n## User's current selection\nSelected slide id(s): ${selected.join(", ")}`;
    },
  }),
  editing_slide: view<EditingSlideParams, EditingSlideContext>({
    label: (params) => params.slideLabel,
    promptSection: (params) =>
      `${getEditingSlideInstructions(params.slideLabel, params.deckLabel)}\n\nslideId: ${params.slideId} | deckId: ${params.deckId}`,
  }),
  editing_visualization: view<
    EditingVisualizationParams,
    EditingVisualizationContext
  >({
    label: (params) => params.vizLabel,
    promptSection: (params) =>
      `${getEditingVisualizationInstructions(params.vizLabel)}\n\nvizId: ${params.vizId ?? "unsaved"}`,
  }),
  editing_report: view<EditingReportParams, EditingReportContext>({
    label: (params) => params.reportLabel,
    promptSection: (params, context) => {
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

// Concise, UI-facing labels (chat-pane header subtext) for the nine
// no-params viewing_* views — byte-identical to the pre-views
// chat_pane.tsx titleSubtext() switch cases.
function getViewingVisualizationsInstructionsLabel(): string {
  return t3({ en: "Visualizations", fr: "Visualisations", pt: "Visualizações" });
}
function getViewingSlideDecksInstructionsLabel(): string {
  return t3({ en: "Slide Decks", fr: "Présentations", pt: "Apresentações" });
}
function getViewingReportsInstructionsLabel(): string {
  return t3({ en: "Reports", fr: "Rapports", pt: "Relatórios" });
}
function getViewingDataInstructionsLabel(): string {
  return t3({ en: "Data", fr: "Données", pt: "Dados" });
}
function getViewingMetricsInstructionsLabel(): string {
  return t3({ en: "Metrics", fr: "Métriques", pt: "Métricas" });
}
function getViewingModulesInstructionsLabel(): string {
  return t3({ en: "Modules", fr: "Modules", pt: "Módulos" });
}
function getViewingSettingsInstructionsLabel(): string {
  return t3(TC.settings);
}
function getViewingDashboardsInstructionsLabel(): string {
  return t3({ en: "Dashboards", fr: "Tableaux de bord", pt: "Painéis" });
}
function getViewingCacheInstructionsLabel(): string {
  return t3({ en: "Cache", fr: "Cache", pt: "Cache" });
}

export type ProjectAIViewDefs = (typeof projectAIViews)["_defs"];
export type ProjectAIViewId = keyof ProjectAIViewDefs;
export type ProjectAIViewState = AIViewState<ProjectAIViewDefs>;

export const projectAIViewController: AIViewController<ProjectAIViewDefs> =
  createAIViewController(projectAIViews, { fallback: "viewing_visualizations" });

// Typed tab → view map (feature 1): a new TabOption that forgets an entry
// here fails typecheck instead of silently leaving the AI context stale (the
// bug class the 2026-07-17 viewing_dashboards/viewing_cache fix closed by
// hand). Values are constrained to void-params views so AIContextSync can
// call setView(map[tab]) with no arguments. Consumed by project/index.tsx.
export const PROJECT_TAB_TO_VIEW: Record<
  TabOption,
  AIViewVoidKeys<ProjectAIViewDefs>
> = {
  visualizations: "viewing_visualizations",
  decks: "viewing_slide_decks",
  reports: "viewing_reports",
  data: "viewing_data",
  metrics: "viewing_metrics",
  modules: "viewing_modules",
  settings: "viewing_settings",
  dashboards: "viewing_dashboards",
  cache: "viewing_cache",
};

// Restores a previously-captured view state verbatim (params + live
// context), for the "returnToContext" stack pattern nested editors use today
// (deck editor → slide editor → figure editor, etc.). A generic
// `setView(state.id, state.params, state.context)` helper cannot typecheck —
// TypeScript cannot correlate a discriminated union's fields through a
// second generic call (the same reason views.ts's OWN setView takes
// positional args instead of a state object) — but a manual switch narrows
// `state` to each concrete member, so every branch below is fully typed with
// no casts.
export function restoreProjectAIView(state: ProjectAIViewState): void {
  switch (state.id) {
    case "viewing_visualizations":
      projectAIViewController.setView("viewing_visualizations");
      return;
    case "viewing_slide_decks":
      projectAIViewController.setView("viewing_slide_decks");
      return;
    case "viewing_reports":
      projectAIViewController.setView("viewing_reports");
      return;
    case "viewing_data":
      projectAIViewController.setView("viewing_data");
      return;
    case "viewing_metrics":
      projectAIViewController.setView("viewing_metrics");
      return;
    case "viewing_modules":
      projectAIViewController.setView("viewing_modules");
      return;
    case "viewing_settings":
      projectAIViewController.setView("viewing_settings");
      return;
    case "viewing_dashboards":
      projectAIViewController.setView("viewing_dashboards");
      return;
    case "viewing_cache":
      projectAIViewController.setView("viewing_cache");
      return;
    case "editing_slide_deck":
      projectAIViewController.setView(
        "editing_slide_deck",
        state.params,
        state.context,
      );
      return;
    case "editing_slide":
      projectAIViewController.setView(
        "editing_slide",
        state.params,
        state.context,
      );
      return;
    case "editing_visualization":
      projectAIViewController.setView(
        "editing_visualization",
        state.params,
        state.context,
      );
      return;
    case "editing_report":
      projectAIViewController.setView(
        "editing_report",
        state.params,
        state.context,
      );
      return;
  }
}
