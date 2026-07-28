import type {
  HfaTaxonomyForAI,
  InstalledModuleSummary,
  MetricWithStatus,
  PresentationObjectSummary,
  ReportSummary,
  SlideDeckSummary,
} from "lib";
import { createAskUserQuestionsTool } from "panther";
import { getToolsForDrafts } from "./ai_tools/tools/drafts";
import { getToolsForInfo } from "./ai_tools/tools/info";
import { getToolsForMethodologyDocs } from "./ai_tools/tools/methodology_docs";
import { getToolsForMetrics } from "./ai_tools/tools/metrics";
import { getToolsForModules } from "./ai_tools/tools/modules";
import { getToolsForSlideDecks } from "./ai_tools/tools/slide_decks";
import { getToolsForReports } from "./ai_tools/tools/reports";
import { getToolsForReportEditor } from "./ai_tools/tools/report_editor";
import { getToolsForSlideEditor } from "./ai_tools/tools/slide_editor";
import { getToolsForSlides } from "./ai_tools/tools/slides";
import { getToolsForVizEditor } from "./ai_tools/tools/visualization_editor";
import { getToolsForNavigation } from "./ai_tools/tools/navigation";
import { getToolsForVisualizations } from "./ai_tools/tools/visualizations";

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
    // Base data tools - always available
    ...getToolsForMetrics(projectId, metrics, icehIndicators, hfaTaxonomy),
    ...getToolsForModules(projectId, modules, metrics),
    ...getToolsForVisualizations(projectId, visualizations, metrics),
    ...getToolsForSlideDecks(slideDecks),
    ...getToolsForReports(projectId, reports),
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
