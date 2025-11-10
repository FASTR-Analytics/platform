import type { AssetInfo } from "../../types/mod.ts";
import { route } from "../route-utils.ts";

// Route registry for assets
export const assetRouteRegistry = {
  getAssets: route({
    path: "/assets",
    method: "GET",
    response: {} as AssetInfo[],
  }),
  deleteAssets: route({
    path: "/assets/delete",
    method: "POST",
    body: {} as { assetFileNames: string[] },
  }),
} as const;
