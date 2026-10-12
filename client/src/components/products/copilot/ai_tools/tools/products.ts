import { createAITool } from "panther";
import { z } from "zod";
import { COPILOT_TOOL_VIEWS, formatProductsListForAI } from "lib";
import { copilotViews } from "~/components/instance/copilot/mod.ts";
import { scopeDisplayLabel } from "~/components/_shared/mod.ts";
import { instanceState } from "~/state/instance/t1_store";

// The Products group (ruling 1): the products the user can see, which is what
// the instance channel delivers to T1, each with the level this connection
// holds on it. The model lists and describes them; the user opens one, since
// no tool navigates.
export function getClientToolsForProducts() {
  return [
    createAITool({
      viewRegistry: copilotViews,
      name: "list_products",
      availableIn: COPILOT_TOOL_VIEWS.list_products,
      description:
        "List every product (slide deck or report) the user can see, with its folder, the results package and scope it renders from, and the user's access level on it (view, edit or own). The user opens a product from the Products page; once it is open, its reading and editing tools become available.",
      inputSchema: z.object({}),
      kind: "read",
      handler: () =>
        Promise.resolve(
          formatProductsListForAI({
            products: instanceState.products,
            folders: instanceState.folders,
            readyPackages: instanceState.readyPackages,
            scopes: instanceState.scopes.map((s) => ({
              id: s.id,
              label: scopeDisplayLabel(s),
            })),
            user: {
              email: instanceState.currentUserEmail,
              isGlobalAdmin: instanceState.currentUserIsGlobalAdmin,
            },
          }),
        ),
      inProgressLabel: () => "Listing products...",
      completionMessage: () => "Listed products",
    }),
  ];
}
