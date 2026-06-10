import { route } from "../route-utils.ts";
import type {
  DashboardCreate,
  DashboardDetail,
  DashboardSummary,
  DashboardUpdate,
  FigureBlock,
} from "../../types/dashboard.ts";

export type DashboardItemPosition =
  | { after: string }
  | { before: string }
  | { toStart: true }
  | { toEnd: true };

export const dashboardRouteRegistry = {
  getAllDashboards: route({
    path: "/dashboards",
    method: "GET",
    response: {} as DashboardSummary[],
    requiresProject: true,
  }),

  getDashboardDetail: route({
    path: "/dashboards/:dashboard_id",
    method: "GET",
    params: {} as { dashboard_id: string },
    response: {} as DashboardDetail,
    requiresProject: true,
  }),

  createDashboard: route({
    path: "/dashboards",
    method: "POST",
    body: {} as DashboardCreate,
    response: {} as { dashboardId: string; lastUpdated: string },
    requiresProject: true,
  }),

  updateDashboard: route({
    path: "/dashboards/:dashboard_id",
    method: "PUT",
    params: {} as { dashboard_id: string },
    body: {} as DashboardUpdate,
    response: {} as { lastUpdated: string },
    requiresProject: true,
  }),

  deleteDashboard: route({
    path: "/dashboards/:dashboard_id",
    method: "DELETE",
    params: {} as { dashboard_id: string },
    response: {} as never,
    requiresProject: true,
  }),

  addDashboardItem: route({
    path: "/dashboards/:dashboard_id/items",
    method: "POST",
    params: {} as { dashboard_id: string },
    body: {} as { label: string; figureBlock: FigureBlock; geoData?: unknown },
    response: {} as { itemId: string; lastUpdated: string },
    requiresProject: true,
  }),

  updateDashboardItem: route({
    path: "/dashboards/:dashboard_id/items/:item_id",
    method: "PUT",
    params: {} as { dashboard_id: string; item_id: string },
    body: {} as { label?: string; figureBlock?: FigureBlock; geoData?: unknown },
    response: {} as { lastUpdated: string },
    requiresProject: true,
  }),

  deleteDashboardItem: route({
    path: "/dashboards/:dashboard_id/items/:item_id",
    method: "DELETE",
    params: {} as { dashboard_id: string; item_id: string },
    response: {} as { lastUpdated: string },
    requiresProject: true,
  }),

  moveDashboardItems: route({
    path: "/dashboards/:dashboard_id/items/move",
    method: "POST",
    params: {} as { dashboard_id: string },
    body: {} as {
      itemIds: string[];
      position: DashboardItemPosition;
    },
    response: {} as { lastUpdated: string },
    requiresProject: true,
  }),

  addDashboardItemGroup: route({
    path: "/dashboards/:dashboard_id/groups",
    method: "POST",
    params: {} as { dashboard_id: string },
    body: {} as {
      label: string;
      replicateBy: string;
      defaultReplicantValue?: string;
      replicants: { value: string; label: string }[];
      geoData?: unknown;
      members: {
        replicantValue: string;
        label: string;
        figureBlock: FigureBlock;
      }[];
    },
    response: {} as { groupId: string; lastUpdated: string },
    requiresProject: true,
  }),

  updateDashboardItemGroup: route({
    path: "/dashboards/:dashboard_id/groups/:group_id",
    method: "PUT",
    params: {} as { dashboard_id: string; group_id: string },
    body: {} as {
      label?: string;
      defaultReplicantValue?: string;
      replicants?: { value: string; label: string }[];
      geoData?: unknown;
      members?: { replicantValue: string; figureBlock: FigureBlock }[];
    },
    response: {} as { lastUpdated: string },
    requiresProject: true,
  }),

  deleteDashboardItemGroup: route({
    path: "/dashboards/:dashboard_id/groups/:group_id",
    method: "DELETE",
    params: {} as { dashboard_id: string; group_id: string },
    response: {} as { lastUpdated: string },
    requiresProject: true,
  }),

  // Replace one entry (item OR group) in place with a new entry of EITHER kind,
  // preserving its sort position — the single primitive behind every structural
  // reshape (item↔group, group→group with a changed dimension/set).
  replaceDashboardEntry: route({
    path: "/dashboards/:dashboard_id/replace-entry",
    method: "POST",
    params: {} as { dashboard_id: string },
    body: {} as {
      oldEntry:
        | { kind: "item"; itemId: string }
        | { kind: "group"; groupId: string };
      newEntry:
        | { kind: "item"; label: string; figureBlock: FigureBlock; geoData?: unknown }
        | {
            kind: "group";
            label: string;
            replicateBy: string;
            defaultReplicantValue?: string;
            replicants: { value: string; label: string }[];
            geoData?: unknown;
            members: {
              replicantValue: string;
              label: string;
              figureBlock: FigureBlock;
            }[];
          };
    },
    response: {} as { entryId: string; lastUpdated: string },
    requiresProject: true,
  }),
};
