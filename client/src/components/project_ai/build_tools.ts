import type { InstalledModuleSummary, MetricWithStatus } from "lib";
import { getToolsForDrafts } from "./ai_tools/tools/drafts";
import { getToolsForMethodologyDocs } from "./ai_tools/tools/methodology_docs";
import { getToolsForMetrics } from "./ai_tools/tools/metrics";
import { getToolsForModules } from "./ai_tools/tools/modules";
import { getToolsForSlideEditor } from "./ai_tools/tools/slide_editor";
import { getToolsForSlides } from "./ai_tools/tools/slides";
import { getToolsForVizEditor } from "./ai_tools/tools/visualization_editor";
import { getToolsForVisualizations } from "./ai_tools/tools/visualizations";
import type { AIContext } from "./types";

type BuildToolsParams = {
  projectId: string;
  modules: InstalledModuleSummary[];
  metrics: MetricWithStatus[];
  aiContext: () => AIContext;
};

export function buildToolsForContext(params: BuildToolsParams) {
  const { projectId, modules, metrics, aiContext } = params;

  return [
    // Base data tools - always available
    ...getToolsForMetrics(projectId, metrics),
    ...getToolsForModules(projectId, modules, metrics),
    ...getToolsForVisualizations(projectId),
    ...getToolsForMethodologyDocs(),

    // Mode-specific tools - check mode in handler
    ...getToolsForSlides(projectId, aiContext, metrics),
    ...getToolsForSlideEditor(projectId, aiContext, metrics),
    ...getToolsForVizEditor(projectId, aiContext),

    // Draft preview tools - always available
    ...getToolsForDrafts(projectId, metrics, aiContext),
  ];
}
