import { getToolsForModules } from "./tools/modules";
import { getToolsForMetrics } from "./tools/metrics";
import { getToolsForSlides as getSlideTools } from "./tools/slides";
import { getWhiteboardTools } from "./tools/whiteboard";
import { getToolsForReadingVisualizations, getToolForVisualizationData, getToolForShowingVisualizations } from "./tools/visualization_reading";
import { getToolsForWritingVisualizations } from "./tools/visualization_writing";
import { getToolsForConfiguringVisualizations } from "./tools/visualization_config";
import { getToolsForMethodologyDocs } from "./tools/methodology_docs";
import { ContentSlide, PresentationObjectConfig, ResultsValue } from "lib";
import { SetStoreFunction } from "solid-js/store";

// Tools for the main project chatbot
export function getToolsForChatbot(projectId: string) {
  return [
    ...getToolsForModules(projectId),
    ...getToolsForMetrics(projectId),
    ...getToolsForReadingVisualizations(projectId),
    getToolForShowingVisualizations(projectId),
    ...getToolsForWritingVisualizations(projectId),
    ...getToolsForMethodologyDocs(),
  ];
}

// Tools for the AI slide deck editor
export function getToolsForSlides(
  projectId: string,
  reportId: string,
  getSlideIds: () => string[],
  optimisticSetLastUpdated: (tableName: "slides" | "slide_decks", id: string, lastUpdated: string) => void,
) {
  return [
    ...getSlideTools(
      projectId,
      reportId,
      getSlideIds,
      optimisticSetLastUpdated,
    ),
    ...getToolsForModules(projectId),
    ...getToolsForMetrics(projectId),
    ...getToolsForReadingVisualizations(projectId),
    // ...getToolsForWritingVisualizations(projectId),
    ...getToolsForMethodologyDocs(),
  ];
}

// Tools for the visualization pane AI (editing a single viz)
export function getToolsForVizPane(
  projectId: string,
  presentationObjectId: string,
  getTempConfig: () => PresentationObjectConfig,
  setTempConfig: SetStoreFunction<PresentationObjectConfig>,
  getResultsValue: () => ResultsValue,
) {
  return [
    getToolForVisualizationData(projectId, presentationObjectId),
    ...getToolsForConfiguringVisualizations(getTempConfig, setTempConfig, getResultsValue),
  ];
}

// Tools for the AI whiteboard
export function getToolsForWhiteboard(
  projectId: string,
  conversationId: string,
  onUpdate: (content: ContentSlide | null) => void,
) {
  return [
    ...getWhiteboardTools(projectId, conversationId, onUpdate),
    ...getToolsForModules(projectId),
    ...getToolsForMetrics(projectId),
    ...getToolsForReadingVisualizations(projectId),
    ...getToolsForMethodologyDocs(),
  ];
}
