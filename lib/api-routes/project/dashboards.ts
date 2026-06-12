import { z } from "zod";
import { dashboardConfigSchema, dashboardLayoutSchema } from "../../types/_dashboard_config.ts";
import { figureBlockSchema } from "../../types/_slide_config.ts";
import type {
  DashboardCreate,
  DashboardDetail,
  DashboardSummary,
  DashboardUpdate,
  FigureBlock,
} from "../../types/dashboard.ts";
import { route } from "../route-utils.ts";

export type DashboardItemPosition =
  | { after: string }
  | { before: string }
  | { toStart: true }
  | { toEnd: true };

const dashboardIdParamsSchema = z.object({ dashboard_id: z.uuid() });

const dashboardItemPositionSchema = z.union([
  z.object({ after: z.string() }),
  z.object({ before: z.string() }),
  z.object({ toStart: z.literal(true) }),
  z.object({ toEnd: z.literal(true) }),
]);

const dashboardCreateSchema = z.object({
  slug: z.string(),
  title: z.string(),
  layout: dashboardLayoutSchema.optional(),
});

const dashboardUpdateSchema = z.object({
  slug: z.string().optional(),
  title: z.string().optional(),
  isPublic: z.boolean().optional(),
  layout: dashboardLayoutSchema.optional(),
  config: dashboardConfigSchema.optional(),
});

const replicantSchema = z.object({ value: z.string(), label: z.string() });
const groupMemberSchema = z.object({
  replicantValue: z.string(),
  label: z.string(),
  figureBlock: figureBlockSchema,
});

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
    params: dashboardIdParamsSchema,
    response: {} as DashboardDetail,
    requiresProject: true,
  }),

  createDashboard: route({
    path: "/dashboards",
    method: "POST",
    body: dashboardCreateSchema,
    response: {} as { dashboardId: string; lastUpdated: string },
    requiresProject: true,
  }),

  updateDashboard: route({
    path: "/dashboards/:dashboard_id",
    method: "PUT",
    params: dashboardIdParamsSchema,
    body: dashboardUpdateSchema,
    response: {} as { lastUpdated: string },
    requiresProject: true,
  }),

  deleteDashboard: route({
    path: "/dashboards/:dashboard_id",
    method: "DELETE",
    params: dashboardIdParamsSchema,
    response: {} as never,
    requiresProject: true,
  }),

  addDashboardItem: route({
    path: "/dashboards/:dashboard_id/items",
    method: "POST",
    params: dashboardIdParamsSchema,
    body: z.object({
      label: z.string(),
      figureBlock: figureBlockSchema,
      geoData: z.unknown().optional(),
    }),
    response: {} as { itemId: string; lastUpdated: string },
    requiresProject: true,
  }),

  updateDashboardItem: route({
    path: "/dashboards/:dashboard_id/items/:item_id",
    method: "PUT",
    params: z.object({ dashboard_id: z.uuid(), item_id: z.uuid() }),
    body: z.object({
      label: z.string().optional(),
      figureBlock: figureBlockSchema.optional(),
      geoData: z.unknown().optional(),
    }),
    response: {} as { lastUpdated: string },
    requiresProject: true,
  }),

  deleteDashboardItem: route({
    path: "/dashboards/:dashboard_id/items/:item_id",
    method: "DELETE",
    params: z.object({ dashboard_id: z.uuid(), item_id: z.uuid() }),
    response: {} as { lastUpdated: string },
    requiresProject: true,
  }),

  moveDashboardItems: route({
    path: "/dashboards/:dashboard_id/items/move",
    method: "POST",
    params: dashboardIdParamsSchema,
    body: z.object({
      itemIds: z.array(z.string()),
      position: dashboardItemPositionSchema,
    }),
    response: {} as { lastUpdated: string },
    requiresProject: true,
  }),

  addDashboardItemGroup: route({
    path: "/dashboards/:dashboard_id/groups",
    method: "POST",
    params: dashboardIdParamsSchema,
    body: z.object({
      label: z.string(),
      replicateBy: z.string(),
      defaultReplicantValue: z.string().optional(),
      replicants: z.array(replicantSchema),
      geoData: z.unknown().optional(),
      members: z.array(groupMemberSchema),
    }),
    response: {} as { groupId: string; lastUpdated: string },
    requiresProject: true,
  }),

  updateDashboardItemGroup: route({
    path: "/dashboards/:dashboard_id/groups/:group_id",
    method: "PUT",
    params: z.object({ dashboard_id: z.uuid(), group_id: z.uuid() }),
    body: z.object({
      label: z.string().optional(),
      defaultReplicantValue: z.string().optional(),
      replicants: z.array(replicantSchema).optional(),
      geoData: z.unknown().optional(),
      members: z.array(z.object({
        replicantValue: z.string(),
        figureBlock: figureBlockSchema,
      })).optional(),
    }),
    response: {} as { lastUpdated: string },
    requiresProject: true,
  }),

  deleteDashboardItemGroup: route({
    path: "/dashboards/:dashboard_id/groups/:group_id",
    method: "DELETE",
    params: z.object({ dashboard_id: z.uuid(), group_id: z.uuid() }),
    response: {} as { lastUpdated: string },
    requiresProject: true,
  }),

  replaceDashboardEntry: route({
    path: "/dashboards/:dashboard_id/replace-entry",
    method: "POST",
    params: dashboardIdParamsSchema,
    body: z.object({
      oldEntry: z.union([
        z.object({ kind: z.literal("item"), itemId: z.string() }),
        z.object({ kind: z.literal("group"), groupId: z.string() }),
      ]),
      newEntry: z.union([
        z.object({
          kind: z.literal("item"),
          label: z.string(),
          figureBlock: figureBlockSchema,
          geoData: z.unknown().optional(),
        }),
        z.object({
          kind: z.literal("group"),
          label: z.string(),
          replicateBy: z.string(),
          defaultReplicantValue: z.string().optional(),
          replicants: z.array(replicantSchema),
          geoData: z.unknown().optional(),
          members: z.array(groupMemberSchema),
        }),
      ]),
    }),
    response: {} as { entryId: string; lastUpdated: string },
    requiresProject: true,
  }),
} as const;
