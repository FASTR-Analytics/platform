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

export const visualizationFolderRouteRegistry = {
  createVisualizationFolder: route({
    path: "/visualization-folders",
    method: "POST",
    body: createFolderBodySchema,
    response: {} as { folderId: string; lastUpdated: string },
    requiresProject: true,
  }),
  updateVisualizationFolder: route({
    path: "/visualization-folders/:folder_id",
    method: "PUT",
    params: folderIdParamsSchema,
    body: updateFolderBodySchema,
    response: {} as { lastUpdated: string },
    requiresProject: true,
  }),
  deleteVisualizationFolder: route({
    path: "/visualization-folders/:folder_id",
    method: "DELETE",
    params: folderIdParamsSchema,
    response: {} as { lastUpdated: string },
    requiresProject: true,
  }),
  reorderVisualizationFolders: route({
    path: "/visualization-folders/reorder",
    method: "POST",
    body: z.object({ folderIds: z.array(z.string()) }),
    response: {} as { lastUpdated: string },
    requiresProject: true,
  }),
  updatePresentationObjectFolder: route({
    path: "/presentation-objects/:po_id/folder",
    method: "PUT",
    // po_id is a 3-char nanoid (generateUniquePresentationObjectId), not a UUID
    params: z.object({ po_id: z.string() }),
    body: z.object({ folderId: z.string().nullable() }),
    response: {} as { lastUpdated: string },
    requiresProject: true,
  }),
  reorderPresentationObjects: route({
    path: "/presentation-objects/reorder",
    method: "POST",
    body: z.object({
      orderUpdates: z.array(z.object({ id: z.string(), sortOrder: z.number() })),
    }),
    response: {} as { lastUpdated: string },
    requiresProject: true,
  }),
} as const;
