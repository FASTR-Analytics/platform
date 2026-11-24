import { createAITool } from "panther";
import { copilotToolContract, formatProductsListForAI, t3 } from "lib";
import { copilotViews } from "~/components/instance/copilot/mod.ts";
import { scopeDisplayLabel } from "~/components/_shared/mod.ts";
import { currentProductLevelUser } from "~/state/instance/product_access";
import { instanceState } from "~/state/instance/t1_store";

// The Products group: the products the user can see, which is what
// the instance channel delivers to T1, each with the level this connection
// holds on it. The model lists and describes them; the user opens one, since
// no tool navigates.
export function getClientToolsForProducts() {
  return [
    createAITool({
      viewRegistry: copilotViews,
      ...copilotToolContract("list_products"),
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
            user: currentProductLevelUser(),
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
