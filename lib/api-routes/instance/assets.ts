import { z } from "zod";
import type { AssetInfo } from "../../types/mod.ts";
import { route } from "../route-utils.ts";

export const assetRouteRegistry = {
  getAssets: route({
    path: "/assets",
    method: "GET",
    response: {} as AssetInfo[],
  }),
  deleteAssets: route({
    path: "/assets/delete",
    method: "POST",
    body: z.object({ assetFileNames: z.array(z.string()) }),
  }),
} as const;
