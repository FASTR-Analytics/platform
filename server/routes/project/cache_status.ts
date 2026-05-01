import { Hono } from "hono";
import { getAllPresentationObjectsForProject } from "../../db/mod.ts";
import { requireProjectPermission } from "../../project_auth.ts";
import { getValkeyClient } from "../../valkey/connection.ts";
import {
  _METRIC_INFO_CACHE,
  _PO_DETAIL_CACHE,
  _PO_ITEMS_CACHE,
  _REPLICANT_OPTIONS_CACHE,
} from "../caches/visualizations.ts";
import { defineRoute } from "../route-helpers.ts";

export const routesCacheStatus = new Hono();

defineRoute(
  routesCacheStatus,
  "getCacheStatus",
  requireProjectPermission({ requireAdmin: true }),
  async (c) => {
    const { projectId, projectDb } = c.var.ppk;

    const posRes = await getAllPresentationObjectsForProject(projectDb);
    if (posRes.success === false) return c.json(posRes);

    const metricRows: { id: string; results_object_id: string }[] =
      await projectDb`SELECT id, results_object_id FROM metrics`;

    const metricToResultsObject = new Map<string, string>(
      metricRows.map((r) => [r.id, r.results_object_id]),
    );

    const [poItemsHashes, replicantHashes] = await Promise.all([
      _PO_ITEMS_CACHE.scanUniquenessHashes(`${projectId}|`),
      _REPLICANT_OPTIONS_CACHE.scanUniquenessHashes(`${projectId}::`),
    ]);

    const poItemsCounts = new Map<string, number>();
    for (const h of poItemsHashes) {
      const roId = h.split("|")[1];
      if (roId) poItemsCounts.set(roId, (poItemsCounts.get(roId) ?? 0) + 1);
    }

    const replicantCounts = new Map<string, number>();
    for (const h of replicantHashes) {
      const roId = h.split("::")[1];
      if (roId) replicantCounts.set(roId, (replicantCounts.get(roId) ?? 0) + 1);
    }

    const vizStatuses = await Promise.all(
      posRes.data.map(async (po) => {
        const resultsObjectId = metricToResultsObject.get(po.metricId);
        return {
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
          poItemsCount: resultsObjectId
            ? (poItemsCounts.get(resultsObjectId) ?? 0)
            : 0,
          replicantOptionsCount: resultsObjectId
            ? (replicantCounts.get(resultsObjectId) ?? 0)
            : 0,
        };
      }),
    );

    return c.json({
      success: true,
      data: {
        valkeyConnected: !!getValkeyClient(),
        visualizations: vizStatuses,
      },
    });
  },
);
