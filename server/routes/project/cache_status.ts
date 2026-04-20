import { Hono } from "hono";
import { getAllPresentationObjectsForProject, getAllSlideDecks } from "../../db/mod.ts";
import { requireProjectPermission } from "../../project_auth.ts";
import { getValkeyClient } from "../../valkey/connection.ts";
import { _METRIC_INFO_CACHE, _PO_DETAIL_CACHE } from "../caches/visualizations.ts";
import { defineRoute } from "../route-helpers.ts";

export const routesCacheStatus = new Hono();

defineRoute(
  routesCacheStatus,
  "getCacheStatus",
  requireProjectPermission({ requireAdmin: true }),
  async (c) => {
    const { projectId, projectDb } = c.var.ppk;

    const [posRes, decksRes] = await Promise.all([
      getAllPresentationObjectsForProject(projectDb),
      getAllSlideDecks(projectDb),
    ]);

    if (posRes.success === false) return c.json(posRes);
    if (decksRes.success === false) return c.json(decksRes);

    const vizStatuses = await Promise.all(
      posRes.data.map(async (po) => ({
        id: po.id,
        label: po.label,
        poDetailCached: await _PO_DETAIL_CACHE.exists({
          projectId,
          presentationObjectId: po.id,
        }),
        metricInfoCached: await _METRIC_INFO_CACHE.exists({
          projectId,
          metricId: po.metricId,
        }),
      })),
    );

    return c.json({
      success: true,
      data: {
        valkeyConnected: !!getValkeyClient(),
        visualizations: vizStatuses,
        slideDecks: decksRes.data.map((d) => ({ id: d.id, label: d.label })),
      },
    });
  },
);
