// import { getToolsForModules } from "./tools/modules";
// import { getToolsForMetrics } from "./tools/metrics";
// import { getToolsForSlides as getSlideTools } from "./tools/slides";
// import { getWhiteboardTools, type WhiteboardContent } from "./tools/whiteboard";
// import { getToolsForReadingVisualizations, getToolForVisualizationData, } from "./tools/visualization_reading";
// // import { getToolsForWritingVisualizations } from "./tools/visualization_writing";
// import { getToolsForConfiguringVisualizations } from "./tools/visualization_config";
// import { getToolsForMethodologyDocs } from "./tools/methodology_docs";
// import { PresentationObjectConfig, ResultsValue, type CreateModeVisualizationData, type InstalledModuleSummary, type MetricWithStatus } from "lib";
// import { SetStoreFunction } from "solid-js/store";
// import type { Setter } from "solid-js";
// import { getToolForVisualizationCreationWithCallback } from "./tools/visualization_creation";

// export type { WhiteboardContent };

// // // Tools for the main project chatbot
// // export function getToolsForChatbot(projectId: string) {
// //   return [
// //     ...getToolsForModules(projectId),
// //     ...getToolsForMetrics(projectId),
// //     ...getToolsForReadingVisualizations(projectId),
// //     getToolForShowingVisualizations(projectId),
// //     ...getToolsForWritingVisualizations(projectId),
// //     ...getToolsForMethodologyDocs(),
// //   ];
// // }

// // Tools for the visualization creation
// export function getToolsForVisualizationCreation(
//   projectId: string,
//   metrics: MetricWithStatus[],
//   setResult: Setter<CreateModeVisualizationData | null>,
// ) {
//   return [
//     ...getToolsForMetrics(projectId, metrics),
//     getToolForVisualizationCreationWithCallback(metrics, setResult),
//   ];
// }

// // Tools for the AI whiteboard
// export function getToolsForWhiteboard(
//   projectId: string,
//   conversationId: string,
//   onUpdate: (content: WhiteboardContent | null) => void,
//   modules: InstalledModuleSummary[],
//   metrics: MetricWithStatus[],
// ) {
//   return [
//     ...getWhiteboardTools(projectId, conversationId, onUpdate, metrics),
//     ...getToolsForModules(projectId, modules, metrics),
//     ...getToolsForMetrics(projectId, metrics),
//     ...getToolsForReadingVisualizations(projectId),
//     ...getToolsForMethodologyDocs(),
//   ];
// }

// // Tools for the AI slide deck editor
// export function getToolsForSlides(
//   projectId: string,
//   reportId: string,
//   getSlideIds: () => string[],
//   optimisticSetLastUpdated: (tableName: "slides" | "slide_decks", id: string, lastUpdated: string) => void,
//   modules: InstalledModuleSummary[],
//   metrics: MetricWithStatus[],
// ) {
//   return [
//     ...getSlideTools(
//       projectId,
//       reportId,
//       getSlideIds,
//       optimisticSetLastUpdated,
//       metrics,
//     ),
//     ...getToolsForModules(projectId, modules, metrics),
//     ...getToolsForMetrics(projectId, metrics),
//     ...getToolsForReadingVisualizations(projectId),
//     // ...getToolsForWritingVisualizations(projectId),
//     ...getToolsForMethodologyDocs(),
//   ];
// }

// // Tools for the visualization pane AI (editing a single viz)
// export function getToolsForVizPane(
//   projectId: string,
//   getPresentationObjectId: () => string,
//   getTempConfig: () => PresentationObjectConfig,
//   setTempConfig: SetStoreFunction<PresentationObjectConfig>,
//   getResultsValue: () => ResultsValue,
// ) {
//   return [
//     ...getToolForVisualizationData(projectId, getPresentationObjectId, getTempConfig, getResultsValue),
//     ...getToolsForConfiguringVisualizations(getTempConfig, setTempConfig),
//   ];
// }
