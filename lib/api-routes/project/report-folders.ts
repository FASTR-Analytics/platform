import { route } from "../route-utils.ts";

export const reportFolderRouteRegistry = {
  createReportFolder: route({
    path: "/report-folders",
    method: "POST",
    body: {} as {
      label: string;
      color?: string;
      description?: string;
    },
    response: {} as { folderId: string; lastUpdated: string },
    requiresProject: true,
  }),

  updateReportFolder: route({
    path: "/report-folders/:folder_id",
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

  deleteReportFolder: route({
    path: "/report-folders/:folder_id",
    method: "DELETE",
    params: {} as { folder_id: string },
    response: {} as { lastUpdated: string },
    requiresProject: true,
  }),
};
