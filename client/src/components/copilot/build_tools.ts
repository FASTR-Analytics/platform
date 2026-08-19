import {
  getSharedToolsForInfo,
  getSharedToolsForMethodologyDocs,
  getSharedToolsForMetrics,
} from "lib";
import { createAskUserQuestionsTool } from "panther";
import { copilotAuthoringContext } from "./authoring_context";
import { copilotAIToolEnv } from "./ai_tools/client_env";
import { withSourceHeader } from "./ai_tools/source_header";
import { SPA_INFO_TOPICS } from "./ai_tools/client_info_topics";
import { getClientToolsForDrafts } from "./ai_tools/tools/drafts";
import { getClientToolsForModules } from "./ai_tools/tools/modules";
import { getClientToolsForProducts } from "./ai_tools/tools/products";
import { getClientToolsForReportEditor } from "./ai_tools/tools/report_editor";
import { getClientToolsForSlideEditor } from "./ai_tools/tools/slide_editor";
import { getClientToolsForSlides } from "./ai_tools/tools/slides";

// The copilot's tool set = the SHARED tools (lib/ai_tools — the same
// definitions the /mcp surface exposes, over the env bound to whichever
// (package, scope) pair the copilot currently serves) + the CLIENT tools
// (product registry, module internals, editors, drafts). Array order is the
// tool-catalog order and the catalog is a prompt-cache input — keep it stable.
//
// The arrays passed here are the authoring-context STORE's, captured once and
// reconciled in place — see authoring_context.ts for why that is what keeps
// the tools live across a package switch.
//
// Only the shared metric tools get the source header, exactly as at /mcp: they
// are the ones that read the package. The methodology docs are fetched from
// GitHub and the client tools name their own product.
export function buildCopilotTools() {
  const env = copilotAIToolEnv;
  const ctx = copilotAuthoringContext;

  return [
    ...getSharedToolsForMetrics(
      env,
      ctx.metrics,
      ctx.icehIndicators,
      ctx.hfaTaxonomy,
    ).map((tool) => withSourceHeader(tool)),
    // Module internals of that package (SPA-only)
    ...getClientToolsForModules(ctx.modules, ctx.metrics),
    // The product registry
    ...getClientToolsForProducts(),
    ...getSharedToolsForMethodologyDocs(),
    ...getSharedToolsForInfo(SPA_INFO_TOPICS),

    // View-gated tools (createAITool with viewRegistry + availableIn)
    ...getClientToolsForSlides(ctx.metrics),
    ...getClientToolsForSlideEditor(ctx.metrics),
    ...getClientToolsForReportEditor(ctx.metrics),

    // Draft previews - always available
    ...getClientToolsForDrafts(ctx.metrics),

    // Interactive tools
    createAskUserQuestionsTool(),
  ];
}
