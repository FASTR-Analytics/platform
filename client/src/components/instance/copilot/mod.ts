export {
  copilotViewController,
  copilotViews,
  DATA_PAGE_IDS,
  holdCopilotView,
  packageViewContext,
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
export {
  buildCopilotPackageBlock,
  buildSystemPromptForContext,
} from "./build_system_prompt.ts";
export {
  createCopilotAIToolEnv,
  createModuleInternalsEnv,
} from "./client_env.ts";
export type { ClientAIToolEnv, ModuleInternalsEnv } from "./client_env.ts";
export { bindPackageTools } from "./bind_package_tools.ts";
export type { PackageToolsBuilder } from "./bind_package_tools.ts";
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
export {
  getClientToolsForModuleInternals,
  getClientToolsForModules,
} from "./tools/mod.ts";
export { guardCopilotTools } from "./tool_guard.ts";
