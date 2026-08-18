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
} from "lib";
import { createAskUserQuestionsTool } from "panther";
import { clientAIToolEnvFor } from "./ai_tools/client_env";
import { getClientToolsForDrafts } from "./ai_tools/tools/drafts";
import { getClientToolsForReportEditor } from "./ai_tools/tools/report_editor";
import { getClientToolsForReports } from "./ai_tools/tools/reports";
import { getClientToolsForSlideDecks } from "./ai_tools/tools/slide_decks";
import { getClientToolsForSlideEditor } from "./ai_tools/tools/slide_editor";
import { getClientToolsForSlides } from "./ai_tools/tools/slides";
import { getClientToolsForVisualizations } from "./ai_tools/tools/visualizations";
import { getClientToolsForVizEditor } from "./ai_tools/tools/visualization_editor";
import { getClientToolsForNavigation } from "./ai_tools/tools/navigation";

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

// The copilot's tool set = the SHARED tools (lib/ai_tools — the same
// definitions the /mcp surface exposes, over the env bound to this project)
// + the CLIENT tools (project content, editors, navigation, drafts). Array
// order is the tool-catalog order and the catalog is a prompt-cache input —
// keep it stable.
export function buildToolsForContext(params: BuildToolsParams) {
  const { projectId, modules, metrics, icehIndicators, hfaTaxonomy, visualizations, slideDecks, reports } =
    params;
  const env = clientAIToolEnvFor(projectId);

  return [
    // Shared data tools (metrics + modules), bound to this project's package.
    ...getSharedToolsForMetrics(env, metrics, icehIndicators, hfaTaxonomy),
    ...getSharedToolsForModules(env, modules, metrics),
    // Project content
    ...getClientToolsForVisualizations(projectId, visualizations, metrics),
    ...getClientToolsForSlideDecks(slideDecks),
    ...getClientToolsForReports(projectId, reports),
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
