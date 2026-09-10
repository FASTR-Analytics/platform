import {
  createAIViewController,
  defineAIInteractions,
  defineAIViews,
  interaction,
  view,
} from "panther";
import type { AIViewController, AIViewState, AIViewVoidKeys } from "panther";
import type { PresentationObjectConfig, ResultsValue } from "lib";
import type { SetStoreFunction } from "solid-js/store";
import type { TabOption } from "~/state/t4_ui";

////////////////////////////////////////////////////////////////////////////////
// PROJECT SHELL: THE REMNANT VIEW REGISTRY
////////////////////////////////////////////////////////////////////////////////
//
// The copilot is mounted per open product around its editor
// (PLAN_PRODUCTS_RESTRUCTURE D15, components/copilot/). The
// project shell has no chat any more, but its tabs, its visualization editor
// and its tours still call setView / notify / current(), so this registry
// keeps those calls typed and inert until step 9a deletes the shell.
//
// Nothing renders these labels and nothing reads these interactions: no
// AIChatProvider is constructed with this controller. Do not add per-view
// instructions here, and do not add anything to it: the products side owns
// every live view.

export type EditingVisualizationParams = {
  vizId: string | null; // null for create/ephemeral modes without a persistent ID
  vizLabel: string;
  // vizId alone can't separate create from ephemeral (both are null), and the
  // editor's UI differs by mode: ephemeral applies back to a host slide/report
  // instead of saving. Consumers (onboarding tours) need the distinction.
  mode: "edit" | "create" | "ephemeral";
};
export type EditingVisualizationContext = {
  resultsValue: ResultsValue;
  getTempConfig: () => PresentationObjectConfig;
  setTempConfig: SetStoreFunction<PresentationObjectConfig>;
};

const projectAIInteractions = defineAIInteractions({
  selected_visualizations: interaction<{ vizIds: string[] }>({
    relevantIn: ["viewing_visualizations"],
    format: (p) => `Selected visualizations: ${p.vizIds.join(", ")}`,
  }),
  edited_viz_locally: interaction({
    relevantIn: ["editing_visualization"],
    format: () =>
      "User made local changes to the visualization config (unsaved)",
  }),
});

type ProjectAIInteractionDefs = (typeof projectAIInteractions)["_defs"];

export const projectAIViews = defineAIViews({
  viewing_visualizations: view({ label: () => "Visualizations" }),
  viewing_metrics: view({ label: () => "Metrics" }),
  viewing_results_package: view({ label: () => "Results package" }),
  viewing_settings: view({ label: () => "Settings" }),
  viewing_dashboards: view({ label: () => "Dashboards" }),
  viewing_cache: view({ label: () => "Cache" }),
  editing_visualization: view<
    EditingVisualizationParams,
    EditingVisualizationContext
  >({
    label: (params) => params.vizLabel,
  }),
});

export type ProjectAIViewDefs = (typeof projectAIViews)["_defs"];
export type ProjectAIViewState = AIViewState<ProjectAIViewDefs>;

export const projectAIViewController: AIViewController<
  ProjectAIViewDefs,
  ProjectAIInteractionDefs
> = createAIViewController(projectAIViews, {
  fallback: "viewing_visualizations",
  interactions: projectAIInteractions,
});

// Typed tab to view map: a new TabOption that forgets an entry here fails
// typecheck. Values are constrained to void-params views so the caller can
// call setView(map[tab]) with no arguments.
export const PROJECT_TAB_TO_VIEW: Record<
  TabOption,
  AIViewVoidKeys<ProjectAIViewDefs>
> = {
  visualizations: "viewing_visualizations",
  metrics: "viewing_metrics",
  results_package: "viewing_results_package",
  settings: "viewing_settings",
  dashboards: "viewing_dashboards",
  cache: "viewing_cache",
};

// Restores a previously-captured view state verbatim (params + live context),
// for the returnToContext stack the standalone visualization editor uses. A
// generic setView(state.id, state.params, state.context) helper cannot
// typecheck, but a manual switch narrows `state` to each concrete member.
export function restoreProjectAIView(state: ProjectAIViewState): void {
  switch (state.id) {
    case "viewing_visualizations":
      projectAIViewController.setView("viewing_visualizations");
      return;
    case "viewing_metrics":
      projectAIViewController.setView("viewing_metrics");
      return;
    case "viewing_results_package":
      projectAIViewController.setView("viewing_results_package");
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
    case "editing_visualization":
      projectAIViewController.setView(
        "editing_visualization",
        state.params,
        state.context,
      );
      return;
  }
}
