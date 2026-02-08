import { route } from "../route-utils.ts";

export const slideDeckFolderRouteRegistry = {
  createSlideDeckFolder: route({
    path: "/slide-deck-folders",
    method: "POST",
    body: {} as {
      label: string;
      color?: string;
      description?: string;
    },
    response: {} as { folderId: string; lastUpdated: string },
    requiresProject: true,
  }),

  updateSlideDeckFolder: route({
    path: "/slide-deck-folders/:folder_id",
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

  deleteSlideDeckFolder: route({
    path: "/slide-deck-folders/:folder_id",
    method: "DELETE",
    params: {} as { folder_id: string },
    response: {} as { lastUpdated: string },
    requiresProject: true,
  }),
};
