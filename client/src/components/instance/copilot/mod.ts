export {
  copilotViewController,
  copilotViews,
  holdCopilotView,
} from "./ai_views.ts";
export type {
  CopilotViewState,
  EditingSlideDeckContext,
  PackageViewContext,
} from "./ai_views.ts";
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
