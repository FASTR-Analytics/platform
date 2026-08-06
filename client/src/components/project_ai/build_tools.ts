import type {
  HfaTaxonomyForAI,
  InstalledModuleSummary,
  MetricWithStatus,
  PresentationObjectSummary,
  ReportSummary,
  SlideDeckSummary,
} from "lib";
import {
  getSharedToolsForInfo,
  getSharedToolsForMethodologyDocs,
  getSharedToolsForMetrics,
  getSharedToolsForModules,
  getSharedToolsForReports,
  getSharedToolsForSlideDecks,
  getSharedToolsForVisualizations,
} from "lib";
import { createAskUserQuestionsTool } from "panther";
import { clientAIToolEnv } from "./ai_tools/client_env";
import { getClientToolsForDrafts } from "./ai_tools/tools/drafts";
import { getClientToolsForReportEditor } from "./ai_tools/tools/report_editor";
import { getClientToolsForSlideEditor } from "./ai_tools/tools/slide_editor";
import { getClientToolsForSlides } from "./ai_tools/tools/slides";
import { getClientToolsForVizEditor } from "./ai_tools/tools/visualization_editor";
import { getClientToolsForNavigation } from "./ai_tools/tools/navigation";
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
    ...getSharedToolsForMetrics(clientAIToolEnv, projectId, metrics, icehIndicators, hfaTaxonomy),
    // The package these tools read is resolved at CALL time, not bound here:
    // a repoint mid-conversation must move them to the newly attached
    // package.
    ...getSharedToolsForModules(
      clientAIToolEnv,
      projectId,
      () => projectState.attachedRunId,
      modules,
      metrics,
    ),
    ...getSharedToolsForVisualizations(clientAIToolEnv, projectId, visualizations, metrics),
    ...getSharedToolsForSlideDecks(slideDecks),
    ...getSharedToolsForReports(clientAIToolEnv, projectId, reports),
    ...getSharedToolsForMethodologyDocs(),
    ...getSharedToolsForInfo(),

    // View-gated tools (createAITool with viewRegistry + availableIn)
    ...getClientToolsForSlides(projectId, metrics),
    ...getClientToolsForSlideEditor(projectId, metrics),
    ...getClientToolsForReportEditor(projectId, metrics),
    ...getClientToolsForVizEditor(projectId, metrics),

    // Navigation tools - always available
    ...getClientToolsForNavigation(),

    // Draft preview tools - always available
    ...getClientToolsForDrafts(projectId, metrics),

    // Interactive tools
    createAskUserQuestionsTool(),
  ];
}
