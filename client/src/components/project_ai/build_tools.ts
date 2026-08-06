import type {
  HfaTaxonomyForAI,
  InstalledModuleSummary,
  MetricWithStatus,
  PresentationObjectSummary,
  ReportSummary,
  SlideDeckSummary,
} from "lib";
import {
  getToolsForInfo,
  getToolsForMethodologyDocs,
  getToolsForMetrics,
  getToolsForModules,
  getToolsForReports,
  getToolsForSlideDecks,
  getToolsForVisualizations,
} from "lib";
import { createAskUserQuestionsTool } from "panther";
import { clientAIToolEnv } from "./ai_tools/client_env";
import { getToolsForDrafts } from "./ai_tools/tools/drafts";
import { getToolsForReportEditor } from "./ai_tools/tools/report_editor";
import { getToolsForSlideEditor } from "./ai_tools/tools/slide_editor";
import { getToolsForSlides } from "./ai_tools/tools/slides";
import { getToolsForVizEditor } from "./ai_tools/tools/visualization_editor";
import { getToolsForNavigation } from "./ai_tools/tools/navigation";
import { projectState } from "~/state/project/t1_store";

type BuildToolsParams = {
  projectId: string;
  modules: InstalledModuleSummary[];
  metrics: MetricWithStatus[];
  icehIndicators: { id: string; label: string; category: string }[];
  hfaTaxonomy: HfaTaxonomyForAI;
  visualizations: PresentationObjectSummary[];
  slideDecks: SlideDeckSummary[];
  reports: ReportSummary[];
};

export function buildToolsForContext(params: BuildToolsParams) {
  const { projectId, modules, metrics, icehIndicators, hfaTaxonomy, visualizations, slideDecks, reports } =
    params;

  return [
    // Base data tools - always available (shared factories in lib/ai_tools;
    // the SPA injects cache-backed getters via clientAIToolEnv, the headless
    // MCP host injects direct fetches)
    ...getToolsForMetrics(clientAIToolEnv, projectId, metrics, icehIndicators, hfaTaxonomy),
    // The package these tools read is resolved at CALL time, not bound here:
    // a repoint mid-conversation must move them to the newly attached
    // package.
    ...getToolsForModules(
      clientAIToolEnv,
      projectId,
      () => projectState.attachedRunId,
      modules,
      metrics,
    ),
    ...getToolsForVisualizations(clientAIToolEnv, projectId, visualizations, metrics),
    ...getToolsForSlideDecks(slideDecks),
    ...getToolsForReports(clientAIToolEnv, projectId, reports),
    ...getToolsForMethodologyDocs(),
    ...getToolsForInfo(),

    // View-gated tools (createAITool with viewRegistry + availableIn)
    ...getToolsForSlides(projectId, metrics),
    ...getToolsForSlideEditor(projectId, metrics),
    ...getToolsForReportEditor(projectId, metrics),
    ...getToolsForVizEditor(projectId, metrics),

    // Navigation tools - always available
    ...getToolsForNavigation(),

    // Draft preview tools - always available
    ...getToolsForDrafts(projectId, metrics),

    // Interactive tools
    createAskUserQuestionsTool(),
  ];
}
