export {
  copilotViewController,
  copilotViews,
  holdCopilotView,
  productViewContext,
  restoreCopilotView,
  setFigureEditorView,
} from "./ai_views.ts";
export type {
  CopilotViewState,
  DataContext,
  DataPageId,
  EditingReportContext,
  EditingSlideDeckContext,
  ExploreContext,
  FigureEditorContext,
  FigureEditorView,
  HfaIndicatorEditorContext,
  HfaIndicatorEditorDraft,
  HfaIndicatorEditorPatch,
  HfaIndicatorEditorRound,
  HfaIndicatorsContext,
  OpenSlide,
  PackagePageContext,
  PackageViewContext,
} from "./ai_views.ts";
export type {
  DataRowStatus,
  DataSectionForAI,
  ExploreSelection,
} from "./build_system_prompt.ts";
export { createCopilotAIToolEnv } from "./client_env.ts";
export type { ClientAIToolEnv, ModuleInternalsEnv } from "./client_env.ts";
export { bindPackageTools } from "./bind_package_tools.ts";
export type { PackageToolsBuilder } from "./bind_package_tools.ts";
export { SPA_INFO_TOPICS } from "./client_info_topics.ts";
export type {
  ReportEditorSelection,
  ReportEditProposal,
  ReportEditProposalResult,
} from "./types.ts";
export { createCopilotSDKClient } from "./ai_configs/mod.ts";
export { getClientToolsForModules } from "./tools/mod.ts";
export { guardCopilotTools } from "./tool_guard.ts";
export { CopilotPanel } from "./panel.tsx";
export { confirmReloadUnderTurn } from "./turn_guard.ts";
