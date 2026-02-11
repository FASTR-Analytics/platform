import type {
  InstalledModuleSummary,
  MetricWithStatus,
  PresentationObjectSummary,
  SlideDeckSummary,
} from "lib";
import { getToolsForDrafts } from "./ai_tools/tools/drafts";
import { getToolsForMethodologyDocs } from "./ai_tools/tools/methodology_docs";
import { getToolsForMetrics } from "./ai_tools/tools/metrics";
import { getToolsForModules } from "./ai_tools/tools/modules";
import { getToolsForSlideEditor } from "./ai_tools/tools/slide_editor";
import { getToolsForSlides } from "./ai_tools/tools/slides";
import { getToolsForVizEditor } from "./ai_tools/tools/visualization_editor";
import { getToolsForNavigation } from "./ai_tools/tools/navigation";
import { getToolsForVisualizations } from "./ai_tools/tools/visualizations";
import type { AIContext } from "./types";

type BuildToolsParams = {
  projectId: string;
  modules: InstalledModuleSummary[];
  metrics: MetricWithStatus[];
  visualizations: PresentationObjectSummary[];
  slideDecks: SlideDeckSummary[];
  aiContext: () => AIContext;
};

export function buildToolsForContext(params: BuildToolsParams) {
  const { projectId, modules, metrics, visualizations, slideDecks, aiContext } =
    params;

  return [
    // Base data tools - always available
    ...getToolsForMetrics(projectId, metrics),
    ...getToolsForModules(projectId, modules, metrics),
    ...getToolsForVisualizations(projectId, visualizations, slideDecks),
    ...getToolsForMethodologyDocs(),

    // Mode-specific tools - check mode in handler
    ...getToolsForSlides(projectId, aiContext, metrics),
    ...getToolsForSlideEditor(projectId, aiContext, metrics),
    ...getToolsForVizEditor(projectId, aiContext),

    // Navigation tools - always available
    ...getToolsForNavigation(aiContext),

    // Draft preview tools - always available
    ...getToolsForDrafts(projectId, metrics, aiContext),
  ];
}
