import { type TextEditorSelection } from "panther";
import { getToolsForModules } from "./tools/modules";
import { getToolsForMetrics } from "./tools/metrics";
import { getToolForSelectedText } from "./tools/document_editing";
import { getToolsForSlides as getSlideTools } from "./tools/slides";
import { getToolsForReadingVisualizations, getToolForVisualizationData, getToolForShowingVisualizations } from "./tools/visualization_reading";
import { getToolsForWritingVisualizations } from "./tools/visualization_writing";
import { getToolsForConfiguringVisualizations } from "./tools/visualization_config";
import { getToolsForMethodologyDocs } from "./tools/methodology_docs";
import { PresentationObjectConfig, ResultsValue, type DeckSummary, type SlideWithMeta, type AiIdScope } from "lib";
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

// Tools for the report editor AI
export function getToolsForReport(
  projectId: string,
  getSelection: () => TextEditorSelection,
) {
  return [
    ...getToolsForModules(projectId),
    ...getToolsForMetrics(projectId),
    ...getToolsForReadingVisualizations(projectId),
    // getToolForShowingVisualizations(projectId),
    ...getToolsForWritingVisualizations(projectId),
    getToolForSelectedText(getSelection),
    ...getToolsForMethodologyDocs(),
  ];
}

// Tools for the AI slide deck editor
export function getToolsForSlides(
  projectId: string,
  reportId: string,
  aiIdScope: AiIdScope,
  getDeckSummary: () => Promise<DeckSummary>,
  onSlideCreated: (slide: SlideWithMeta) => void,
  onSlideUpdated: (slide: SlideWithMeta) => void,
  onSlidesDeleted: (slideIds: string[]) => void,
  onSlidesReordered: (slides: SlideWithMeta[]) => void,
) {
  return [
    ...getSlideTools(
      projectId,
      reportId,
      aiIdScope,
      getDeckSummary,
      onSlideCreated,
      onSlideUpdated,
      onSlidesDeleted,
      onSlidesReordered,
    ),
    ...getToolsForModules(projectId),
    ...getToolsForMetrics(projectId),
    ...getToolsForReadingVisualizations(projectId),
    ...getToolsForWritingVisualizations(projectId),
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
