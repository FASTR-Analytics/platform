import type {
  InstalledModuleSummary,
  MetricWithStatus,
  PresentationObjectSummary,
  ReportSummary,
  SlideDeckSummary,
} from "lib";
import { createAskUserQuestionsTool } from "panther";
import { getToolsForDrafts } from "./ai_tools/tools/drafts";
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
import type { AIContext } from "./types";

type BuildToolsParams = {
  projectId: string;
  modules: InstalledModuleSummary[];
  metrics: MetricWithStatus[];
  icehIndicators: { id: string; label: string; category: string }[];
  visualizations: PresentationObjectSummary[];
  slideDecks: SlideDeckSummary[];
  reports: ReportSummary[];
  aiContext: () => AIContext;
};

export function buildToolsForContext(params: BuildToolsParams) {
  const { projectId, modules, metrics, icehIndicators, visualizations, slideDecks, reports, aiContext } =
    params;

  return [
    // Base data tools - always available
    ...getToolsForMetrics(projectId, metrics, icehIndicators),
    ...getToolsForModules(projectId, modules, metrics),
    ...getToolsForVisualizations(projectId, visualizations, metrics),
    ...getToolsForSlideDecks(slideDecks),
    ...getToolsForReports(projectId, reports),
    ...getToolsForMethodologyDocs(),

    // Mode-specific tools - check mode in handler
    ...getToolsForSlides(projectId, aiContext, metrics),
    ...getToolsForSlideEditor(projectId, aiContext, metrics),
    ...getToolsForReportEditor(projectId, aiContext, metrics),
    ...getToolsForVizEditor(projectId, aiContext, metrics),

    // Navigation tools - always available
    ...getToolsForNavigation(aiContext),

    // Draft preview tools - always available
    ...getToolsForDrafts(projectId, metrics, aiContext),

    // Interactive tools
    createAskUserQuestionsTool(),
  ];
}
