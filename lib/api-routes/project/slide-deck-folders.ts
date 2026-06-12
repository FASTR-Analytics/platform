import { z } from "zod";
import { route } from "../route-utils.ts";

const folderIdParamsSchema = z.object({ folder_id: z.uuid() });
const createFolderBodySchema = z.object({
  label: z.string(),
  color: z.string().optional(),
  description: z.string().optional(),
});
const updateFolderBodySchema = z.object({
  label: z.string(),
  color: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
});

export const slideDeckFolderRouteRegistry = {
  createSlideDeckFolder: route({
    path: "/slide-deck-folders",
    method: "POST",
    body: createFolderBodySchema,
    response: {} as { folderId: string; lastUpdated: string },
    requiresProject: true,
  }),
  updateSlideDeckFolder: route({
    path: "/slide-deck-folders/:folder_id",
    method: "PUT",
    params: folderIdParamsSchema,
    body: updateFolderBodySchema,
    response: {} as { lastUpdated: string },
    requiresProject: true,
  }),
  deleteSlideDeckFolder: route({
    path: "/slide-deck-folders/:folder_id",
    method: "DELETE",
    params: folderIdParamsSchema,
    response: {} as { lastUpdated: string },
    requiresProject: true,
  }),
} as const;
