export {
  copilotViewController,
  copilotViews,
  DATA_PAGE_IDS,
  holdCopilotView,
  restoreCopilotView,
} from "./ai_views.ts";
export type {
  CopilotViewDefs,
  CopilotViewState,
  DataPageId,
  DataPageParams,
  EditingReportContext,
  EditingReportFigureParams,
  EditingReportParams,
  EditingSlideContext,
  EditingSlideDeckContext,
  EditingSlideDeckParams,
  EditingSlideFigureParams,
  EditingSlideParams,
  FigureEditorContext,
  HfaIndicatorEditorContext,
  HfaIndicatorEditorParams,
  OpeningProductParams,
  PackagePageContext,
  PackagePageParams,
  PackageViewContext,
  ProductViewContext,
  ReportParams,
  ResultsFileParams,
  ViewingPackageFigureParams,
} from "./ai_views.ts";
export { buildSystemPromptForContext } from "./build_system_prompt.ts";
export { createCopilotAIToolEnv } from "./client_env.ts";
export type { ClientAIToolEnv } from "./client_env.ts";
export { SPA_INFO_TOPICS } from "./client_info_topics.ts";
export type {
  ReportEditorSelection,
  ReportEditProposal,
  ReportEditProposalResult,
} from "./types.ts";
export { ConsolidatedChatPane } from "./chat_pane.tsx";
export {
  createCopilotSDKClient,
  DEFAULT_BUILTIN_TOOLS,
} from "./ai_configs/mod.ts";
export { useAIDocuments } from "./ai_documents/mod.ts";
export { getClientToolsForModules } from "./tools/mod.ts";
