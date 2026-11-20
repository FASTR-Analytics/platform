import { createAITool } from "panther";
import { z } from "zod";
import {
  AI_RECORD_PAGE_MAX,
  COPILOT_TOOL_VIEWS,
  formatProductsListForAI,
  t3,
} from "lib";
import { copilotViews } from "~/components/instance/copilot/mod.ts";
import { scopeDisplayLabel } from "~/components/_shared/mod.ts";
import { instanceState } from "~/state/instance/t1_store";

// The Products group: the products the user can see, which is what
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
        `List the products (slide decks, reports and saved visualizations) the user can see, ${AI_RECORD_PAGE_MAX} a call, by folder then label, each with its folder, the results package and scope it renders from, and the user's access level on it (view, edit or own). The count line states how many products match, how many exist, which are written and the offset of the next page. The user opens a product from the Products page; once it is open, its reading and editing tools become available.`,
      inputSchema: z.strictObject({
        search: z.string().optional().describe(
          "Only products whose label, type, folder path, package label and scope label together contain every word of this text, in any order (case- and accent-insensitive).",
        ),
        offset: z.number().int().min(0).optional().describe(
          "Optional: how many of the matching products to skip. Each page names the offset of the next.",
        ),
      }),
      kind: "read",
      handler: (input) =>
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
          }, input),
        ),
      inProgressLabel: t3({
        en: "Getting the products...",
        fr: "Récupération des produits...",
        pt: "A obter os produtos...",
      }),
      successMessage: t3({
        en: "Retrieved the products",
        fr: "Produits récupérés",
        pt: "Produtos obtidos",
      }),
    }),
  ];
}
