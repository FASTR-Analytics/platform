import { AIToolFailure } from "panther";
import type { AnyAITool } from "panther";
import {
  COPILOT_TOOL_REQUIREMENTS,
  type CopilotToolName,
  copilotToolRefusal,
  type CopilotToolUser,
} from "lib";
import { instanceState } from "~/state/instance/t1_store";
import { productLevel } from "~/state/instance/product_access";
import { copilotViewController, type CopilotViewState } from "./ai_views";

// Every user registers the same tools, so the prompt cache survives every
// move; what a user may not do refuses here, at the call, from the one table
// (copilotToolRefusal, lib/ai_tools/copilot_catalogue.ts) over the user's
// live effective permissions and the live level on the view's product. The
// refusal runs before the handler and before
// an approval's `propose`, so nothing is proposed, previewed or applied for a
// user the routes would refuse. A tool outside the catalogue is a bug the
// assembly fails on.

// The product a view shows, for the edit-level requirement; null in a view
// with no product (the package pages, Explore, the Data pages), where the
// requirement has nothing to bind to.
function viewProductId(view: CopilotViewState): string | null {
  switch (view.id) {
    case "opening_product":
      return view.params.productId;
    case "editing_slide_deck":
    case "editing_slide_figure":
    case "deck_settings":
    case "deck_history":
      return view.params.deckId;
    case "editing_report":
    case "editing_report_figure":
    case "report_history":
      return view.params.reportId;
    default:
      return null;
  }
}

function currentToolUser(): CopilotToolUser {
  const productId = viewProductId(copilotViewController.current());
  return {
    permissions: instanceState.currentUserPermissions,
    productLevel: productId === null ? null : productLevel(productId),
  };
}

function guardCopilotTool(tool: AnyAITool): AnyAITool {
  const name = tool.sdkTool.name;
  if (!Object.hasOwn(COPILOT_TOOL_REQUIREMENTS, name)) {
    throw new Error(
      `copilot tool "${name}" is not in the catalogue (lib/ai_tools/copilot_catalogue.ts): every registered tool belongs to one group with one requirement`,
    );
  }
  const toolName = name as CopilotToolName;
  const refuseUnlessAllowed = () => {
    const reason = copilotToolRefusal(toolName, currentToolUser());
    if (reason !== undefined) throw new AIToolFailure(reason);
  };
  const inner = tool.sdkTool;
  const runStructured = inner.runStructured;
  const approval = tool.metadata.approval;
  return {
    metadata: approval === undefined ? tool.metadata : {
      ...tool.metadata,
      approval: {
        ...approval,
        propose: (input, view, ctx) => {
          refuseUnlessAllowed();
          return approval.propose(input, view, ctx);
        },
      },
    },
    sdkTool: {
      ...inner,
      run: (input) => {
        refuseUnlessAllowed();
        return inner.run(input);
      },
      runWithView: (input, getView) => {
        refuseUnlessAllowed();
        return inner.runWithView
          ? inner.runWithView(input, getView)
          : inner.run(input);
      },
      runStructured: runStructured === undefined
        ? undefined
        : (input, getView) => {
          refuseUnlessAllowed();
          return runStructured(input, getView);
        },
    },
  };
}

export function guardCopilotTools(tools: AnyAITool[]): AnyAITool[] {
  return tools.map(guardCopilotTool);
}
