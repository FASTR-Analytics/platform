import {
  getSharedToolsForInfo,
  getSharedToolsForMethodologyDocs,
  getSharedToolsForMetrics,
} from "lib";
import {
  type HfaTaxonomyForAI,
  type PackageScope,
  type ProductLevel,
  productLevelAtLeast,
  type RunAuthoringContext,
} from "lib";
import { createAskUserQuestionsTool } from "panther";
import type { ClientAIToolEnv } from "./_shared/mod.ts";
import { SPA_INFO_TOPICS } from "./_shared/mod.ts";
import { getClientToolsForDrafts } from "./ai_tools/tools/mod.ts";
import { getClientToolsForModules } from "./ai_tools/tools/mod.ts";
import { getClientToolsForReportEditor } from "./ai_tools/tools/mod.ts";
import { getClientToolsForSlideEditor } from "./ai_tools/tools/mod.ts";
import { getClientToolsForSlides } from "./ai_tools/tools/mod.ts";

// The copilot's tool set = the SHARED tools (lib/ai_tools: the same
// definitions the /mcp surface exposes, over the env bound to the open
// product's (package, scope) pair) + the CLIENT tools (module internals,
// editors, drafts). Array order is the tool-catalog order and the catalog is
// a prompt-cache input: keep it stable.
//
// Built once per mount over that mount's fixed env, authoring context and
// the user's level on the product (PLAN_PRODUCTS_RESTRUCTURE D15): nothing
// moves under the tools, so no handler needs a store to stay live. A viewer
// gets only the editor groups' read tools (PLAN_PRODUCT_OWNERSHIP R13); a
// write tool used after a demotion fails with the server's refusal.
export function buildCopilotTools(
  env: ClientAIToolEnv,
  scope: PackageScope,
  ctx: RunAuthoringContext,
  hfaTaxonomy: HfaTaxonomyForAI,
  level: ProductLevel,
) {
  const editorTools = [
    ...getClientToolsForSlides(env, ctx.metrics),
    ...getClientToolsForSlideEditor(env, ctx.metrics),
    ...getClientToolsForReportEditor(env, ctx.metrics),
  ];
  return [
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
    ...(productLevelAtLeast(level, "edit")
      ? editorTools
      : editorTools.filter((tool) => tool.metadata.kind === "read")),

    // Draft preview tool - available in every view
    ...getClientToolsForDrafts(scope, ctx.metrics),

    // Interactive tools
    createAskUserQuestionsTool(),
  ];
}
