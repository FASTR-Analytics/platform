// The system-prompt builders live in lib/ai_tools/build_system_prompt.ts
// (shared with the headless MCP host, which grounds from the same content).
// This shim keeps the historical import path for SPA call sites.
export {
  buildSystemPromptForContext,
  getEditingReportInstructions,
  getEditingSlideDeckInstructions,
  getEditingSlideInstructions,
  getEditingVisualizationInstructions,
  getViewingCacheInstructions,
  getViewingDashboardsInstructions,
  getViewingMetricsInstructions,
  getViewingReportsInstructions,
  getViewingResultsPackageInstructions,
  getViewingSettingsInstructions,
  getViewingSlideDecksInstructions,
  getViewingVisualizationsInstructions,
} from "lib";
