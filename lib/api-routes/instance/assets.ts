import { z } from "zod";
import { route } from "../route-utils.ts";

export const assetRouteRegistry = {
  deleteAssets: route({
    path: "/assets/delete",
    method: "POST",
    body: z.object({ assetFileNames: z.array(z.string()) }),
  }),
  // Owner-only (see updateAssetVisibility in server/db/instance/assets.ts).
  updateAssetVisibility: route({
    path: "/assets/visibility",
    method: "POST",
    body: z.object({
      fileName: z.string(),
      isPrivate: z.boolean(),
      viewerEmails: z.array(z.string()),
    }),
  }),
} as const;
