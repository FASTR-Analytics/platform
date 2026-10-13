import {
  getSharedToolsForInfo,
  getSharedToolsForMethodologyDocs,
  getSharedToolsForMetrics,
} from "lib";
import type { AnyAITool } from "panther";
import { createAskUserQuestionsTool } from "panther";
import {
  bindPackageTools,
  getClientToolsForModules,
  guardCopilotTools,
  type PackageToolsBuilder,
  SPA_INFO_TOPICS,
} from "./copilot/mod.ts";
import {
  getClientToolsForDrafts,
  getClientToolsForFigureEditor,
  getClientToolsForProducts,
  getClientToolsForReportEditor,
  getClientToolsForSlideEditor,
  getClientToolsForSlides,
} from "~/components/products/copilot/mod.ts";
import { instanceState } from "~/state/instance/t1_store";

// The chat's one tool set, assembled once per shell mount and registered for
// every user and every view, so the prompt cache survives every move. It
// lives beside the shell, outside the chat's folder, because it reads the
// product tools: the chat's folder imports nothing at runtime from
// components/ but components/_shared/mod.ts, and the product tools read the
// chat's registry, so the assembly is where the two meet (instance.tsx reads
// it alone).

// The inner set over one pair: the SHARED metric tools (lib/ai_tools: the
// same definitions the /mcp surface exposes, over the env bound to the pair),
// the module list, the editors, the figure editor and the draft preview. The
// chat never registers this set: bindPackageTools runs it once over a throwing
// env for the templates and once per pair a call's view shows, cached by
// packageToolsKey, so nothing here needs a store to stay live. Array order is
// the tool-catalog order and the catalog is a prompt-cache input: keep it
// stable.
const buildPackageTools: PackageToolsBuilder = (
  env,
  scope,
  ctx,
  hfaTaxonomy,
) => [
  ...getSharedToolsForMetrics(
    env,
    ctx.metrics,
    ctx.modules,
    ctx.icehIndicators,
    hfaTaxonomy,
  ),
  ...getClientToolsForModules(ctx.modules, ctx.metrics),
  ...getClientToolsForSlides(env, ctx.metrics),
  ...getClientToolsForSlideEditor(env, ctx.metrics),
  ...getClientToolsForReportEditor(env, ctx.metrics),
  ...getClientToolsForFigureEditor(env, ctx.metrics),
  ...getClientToolsForDrafts(scope, ctx.metrics),
];

// The outer package tools (bound per call to the view's pair, the module
// internals by its run id), the Products page's list, the reference tools
// and panther's ask_user_questions. What a user may not do refuses at the
// call through the guard (copilot/tool_guard.ts), which reads the permissions
// and the level on the view's product live.
export function buildCopilotTools(): AnyAITool[] {
  return guardCopilotTools(
    [
      ...bindPackageTools(buildPackageTools),
      ...getClientToolsForProducts(),
      ...getSharedToolsForMethodologyDocs(),
      ...getSharedToolsForInfo(SPA_INFO_TOPICS),
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
