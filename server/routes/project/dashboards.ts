import { Hono } from "hono";
import {
  addDashboardItem,
  createDashboard,
  deleteDashboard,
  deleteDashboardItem,
  getAllDashboards,
  getDashboardDetail,
  moveDashboardItems,
  updateDashboard,
  updateDashboardItem,
} from "../../db/mod.ts";
import { requireProjectPermission } from "../../project_auth.ts";
import { notifyLastUpdated } from "../../task_management/mod.ts";
import { notifyProjectDashboardsUpdated } from "../../task_management/notify_project_v2.ts";
import { defineRoute } from "../route-helpers.ts";

export const routesDashboards = new Hono();

defineRoute(
  routesDashboards,
  "getAllDashboards",
  requireProjectPermission("can_view_slide_decks"),
  async (c) => {
    const res = await getAllDashboards(c.var.ppk.projectDb);
    return c.json(res);
  },
);

defineRoute(
  routesDashboards,
  "getDashboardDetail",
  requireProjectPermission("can_view_slide_decks"),
  async (c, { params }) => {
    const res = await getDashboardDetail(
      c.var.ppk.projectDb,
      params.dashboard_id,
    );
    return c.json(res);
  },
);

defineRoute(
  routesDashboards,
  "createDashboard",
  requireProjectPermission(
    { preventAccessToLockedProjects: true },
    "can_configure_slide_decks",
  ),
  async (c, { body }) => {
    const res = await createDashboard(
      c.var.ppk.projectDb,
      body,
      c.var.globalUser.email,
    );
    if (!res.success) {
      return c.json(res);
    }

    notifyLastUpdated(
      c.var.ppk.projectId,
      "dashboards",
      [res.data.dashboardId],
      res.data.lastUpdated,
    );

    const listRes = await getAllDashboards(c.var.ppk.projectDb);
    if (listRes.success) {
      notifyProjectDashboardsUpdated(c.var.ppk.projectId, listRes.data);
    }

    return c.json(res);
  },
);

defineRoute(
  routesDashboards,
  "updateDashboard",
  requireProjectPermission(
    { preventAccessToLockedProjects: true },
    "can_configure_slide_decks",
  ),
  async (c, { params, body }) => {
    const res = await updateDashboard(
      c.var.ppk.projectDb,
      params.dashboard_id,
      body,
    );
    if (!res.success) {
      return c.json(res);
    }

    notifyLastUpdated(
      c.var.ppk.projectId,
      "dashboards",
      [params.dashboard_id],
      res.data.lastUpdated,
    );

    const listRes = await getAllDashboards(c.var.ppk.projectDb);
    if (listRes.success) {
      notifyProjectDashboardsUpdated(c.var.ppk.projectId, listRes.data);
    }

    return c.json(res);
  },
);

defineRoute(
  routesDashboards,
  "deleteDashboard",
  requireProjectPermission(
    { preventAccessToLockedProjects: true },
    "can_configure_slide_decks",
  ),
  async (c, { params }) => {
    const res = await deleteDashboard(
      c.var.ppk.projectDb,
      params.dashboard_id,
    );
    if (res.success) {
      const listRes = await getAllDashboards(c.var.ppk.projectDb);
      if (listRes.success) {
        notifyProjectDashboardsUpdated(c.var.ppk.projectId, listRes.data);
      }
    }
    return c.json(res);
  },
);

defineRoute(
  routesDashboards,
  "addDashboardItem",
  requireProjectPermission(
    { preventAccessToLockedProjects: true },
    "can_configure_slide_decks",
  ),
  async (c, { params, body }) => {
    const res = await addDashboardItem(
      c.var.ppk.projectDb,
      params.dashboard_id,
      body,
    );
    if (!res.success) {
      return c.json(res);
    }

    notifyLastUpdated(
      c.var.ppk.projectId,
      "dashboards",
      [params.dashboard_id],
      res.data.lastUpdated,
    );
    notifyLastUpdated(
      c.var.ppk.projectId,
      "dashboard_items",
      [res.data.itemId],
      res.data.lastUpdated,
    );

    const listRes = await getAllDashboards(c.var.ppk.projectDb);
    if (listRes.success) {
      notifyProjectDashboardsUpdated(c.var.ppk.projectId, listRes.data);
    }

    return c.json(res);
  },
);

defineRoute(
  routesDashboards,
  "updateDashboardItem",
  requireProjectPermission(
    { preventAccessToLockedProjects: true },
    "can_configure_slide_decks",
  ),
  async (c, { params, body }) => {
    const res = await updateDashboardItem(
      c.var.ppk.projectDb,
      params.dashboard_id,
      params.item_id,
      body,
    );
    if (!res.success) {
      return c.json(res);
    }

    notifyLastUpdated(
      c.var.ppk.projectId,
      "dashboards",
      [params.dashboard_id],
      res.data.lastUpdated,
    );
    notifyLastUpdated(
      c.var.ppk.projectId,
      "dashboard_items",
      [params.item_id],
      res.data.lastUpdated,
    );

    return c.json(res);
  },
);

defineRoute(
  routesDashboards,
  "deleteDashboardItem",
  requireProjectPermission(
    { preventAccessToLockedProjects: true },
    "can_configure_slide_decks",
  ),
  async (c, { params }) => {
    const res = await deleteDashboardItem(
      c.var.ppk.projectDb,
      params.dashboard_id,
      params.item_id,
    );
    if (!res.success) {
      return c.json(res);
    }

    notifyLastUpdated(
      c.var.ppk.projectId,
      "dashboards",
      [params.dashboard_id],
      res.data.lastUpdated,
    );

    const listRes = await getAllDashboards(c.var.ppk.projectDb);
    if (listRes.success) {
      notifyProjectDashboardsUpdated(c.var.ppk.projectId, listRes.data);
    }

    return c.json(res);
  },
);

defineRoute(
  routesDashboards,
  "moveDashboardItems",
  requireProjectPermission(
    { preventAccessToLockedProjects: true },
    "can_configure_slide_decks",
  ),
  async (c, { params, body }) => {
    const res = await moveDashboardItems(
      c.var.ppk.projectDb,
      params.dashboard_id,
      body.itemIds,
      body.position,
    );
    if (!res.success) {
      return c.json(res);
    }

    notifyLastUpdated(
      c.var.ppk.projectId,
      "dashboards",
      [params.dashboard_id],
      res.data.lastUpdated,
    );
    notifyLastUpdated(
      c.var.ppk.projectId,
      "dashboard_items",
      body.itemIds,
      res.data.lastUpdated,
    );

    return c.json(res);
  },
);
