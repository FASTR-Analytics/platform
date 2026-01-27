import { route } from "../route-utils.ts";
import type { VisualizationFolder } from "../../types/visualization_folders.ts";

export const visualizationFolderRouteRegistry = {
  createVisualizationFolder: route({
    path: "/visualization-folders",
    method: "POST",
    body: {} as {
      label: string;
      color?: string;
      description?: string;
    },
    response: {} as { folderId: string; lastUpdated: string },
    requiresProject: true,
  }),

  updateVisualizationFolder: route({
    path: "/visualization-folders/:folder_id",
    method: "PUT",
    params: {} as { folder_id: string },
    body: {} as {
      label: string;
      color?: string | null;
      description?: string | null;
    },
    response: {} as { lastUpdated: string },
    requiresProject: true,
  }),

  deleteVisualizationFolder: route({
    path: "/visualization-folders/:folder_id",
    method: "DELETE",
    params: {} as { folder_id: string },
    response: {} as { lastUpdated: string },
    requiresProject: true,
  }),

  reorderVisualizationFolders: route({
    path: "/visualization-folders/reorder",
    method: "POST",
    body: {} as { folderIds: string[] },
    response: {} as { lastUpdated: string },
    requiresProject: true,
  }),

  updatePresentationObjectFolder: route({
    path: "/presentation-objects/:po_id/folder",
    method: "PUT",
    params: {} as { po_id: string },
    body: {} as { folderId: string | null },
    response: {} as { lastUpdated: string },
    requiresProject: true,
  }),

  reorderPresentationObjects: route({
    path: "/presentation-objects/reorder",
    method: "POST",
    body: {} as { orderUpdates: { id: string; sortOrder: number }[] },
    response: {} as { lastUpdated: string },
    requiresProject: true,
  }),
};
