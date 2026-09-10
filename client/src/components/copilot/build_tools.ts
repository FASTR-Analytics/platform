import {
  getSharedToolsForInfo,
  getSharedToolsForMethodologyDocs,
  getSharedToolsForMetrics,
} from "lib";
import type {
  HfaTaxonomyForAI,
  PackageScope,
  RunAuthoringContext,
} from "lib";
import { createAskUserQuestionsTool } from "panther";
import type { ClientAIToolEnv } from "./ai_tools/client_env";
import { SPA_INFO_TOPICS } from "./ai_tools/client_info_topics";
import { getClientToolsForDrafts } from "./ai_tools/tools/drafts";
import { getClientToolsForModules } from "./ai_tools/tools/modules";
import { getClientToolsForReportEditor } from "./ai_tools/tools/report_editor";
import { getClientToolsForSlideEditor } from "./ai_tools/tools/slide_editor";
import { getClientToolsForSlides } from "./ai_tools/tools/slides";

// The copilot's tool set = the SHARED tools (lib/ai_tools: the same
// definitions the /mcp surface exposes, over the env bound to the open
// product's (package, scope) pair) + the CLIENT tools (module internals,
// editors, drafts). Array order is the tool-catalog order and the catalog is
// a prompt-cache input: keep it stable.
//
// Built once per mount over that mount's fixed env and authoring context
// (PLAN_PRODUCTS_RESTRUCTURE D15): nothing moves under the tools, so no
// handler needs a store to stay live.
export function buildCopilotTools(
  env: ClientAIToolEnv,
  scope: PackageScope,
  ctx: RunAuthoringContext,
  hfaTaxonomy: HfaTaxonomyForAI,
) {
  return [
    ...getSharedToolsForMetrics(
      env,
      ctx.metrics,
      ctx.icehIndicators,
      hfaTaxonomy,
    ),
    // Module internals of that package (SPA-only)
    ...getClientToolsForModules(env, ctx.modules, ctx.metrics),
    ...getSharedToolsForMethodologyDocs(),
    ...getSharedToolsForInfo(SPA_INFO_TOPICS),

    // View-gated tools (createAITool with viewRegistry + availableIn)
    ...getClientToolsForSlides(env, ctx.metrics),
    ...getClientToolsForSlideEditor(env, ctx.metrics),
    ...getClientToolsForReportEditor(env, ctx.metrics),

    // Draft preview tool - available in every view
    ...getClientToolsForDrafts(scope, ctx.metrics),

    // Interactive tools
    createAskUserQuestionsTool(),
  ];
}
