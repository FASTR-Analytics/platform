import {
  getSharedToolsForInfo,
  getSharedToolsForMethodologyDocs,
  getSharedToolsForMetrics,
} from "lib";
import {
  type HfaTaxonomyForAI,
  type PackageScope,
  type RunAuthoringContext,
} from "lib";
import { createAskUserQuestionsTool } from "panther";
import type { ClientAIToolEnv } from "~/components/instance/copilot/mod.ts";
import {
  getClientToolsForModules,
  guardCopilotTools,
  SPA_INFO_TOPICS,
} from "~/components/instance/copilot/mod.ts";
import { getClientToolsForDrafts } from "./ai_tools/tools/mod.ts";
import { getClientToolsForReportEditor } from "./ai_tools/tools/mod.ts";
import { getClientToolsForSlideEditor } from "./ai_tools/tools/mod.ts";
import { getClientToolsForSlides } from "./ai_tools/tools/mod.ts";
import { instanceState } from "~/state/instance/t1_store";

// The copilot's tool set = the SHARED tools (lib/ai_tools: the same
// definitions the /mcp surface exposes, over the env bound to the open
// product's (package, scope) pair) + the CLIENT tools (module internals,
// editors, drafts). Array order is the tool-catalog order and the catalog is
// a prompt-cache input: keep it stable.
//
// Built once per mount over that mount's fixed env and authoring context
// (PLAN_PRODUCTS_RESTRUCTURE D15): nothing moves under the tools, so no
// handler needs a store to stay live. Every user gets the same set: what a
// user may not do refuses at the call through the guard (tool_guard.ts),
// which reads the permissions and the level on the view's product live.
export function buildCopilotTools(
  env: ClientAIToolEnv,
  scope: PackageScope,
  ctx: RunAuthoringContext,
  hfaTaxonomy: HfaTaxonomyForAI,
) {
  return guardCopilotTools(
    [
      ...getSharedToolsForMetrics(
        env,
        ctx.metrics,
        ctx.modules,
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

      // Draft preview tool - available in every package view
      ...getClientToolsForDrafts(scope, ctx.metrics),

      // Interactive tools
      createAskUserQuestionsTool(),
    ],
    {
      // The HFA indicator manager's write gate today (its bulk delete and
      // its write controls read currentUserIsGlobalAdmin); no HFA tool is in
      // this set until the HFA views join the chat.
      canWriteHfaIndicators: () => instanceState.currentUserIsGlobalAdmin,
    },
  );
}
