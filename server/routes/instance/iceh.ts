import { Hono } from "hono";
import {
  deleteDatasetIcehData,
  deleteDatasetIcehIndicators,
  getDatasetIcehDetail,
  getDatasetIcehDisplayData,
} from "../../db/instance/dataset_iceh.ts";
import {
  cancelDatasetIcehImportRun,
  getDatasetIcehImportRunSummaries,
  launchDatasetIcehImportRun,
  resolveDatasetIcehReview,
} from "../../db/instance/dataset_iceh_import_runs.ts";
import { parseIcehZipPreview } from "../../worker_routines/import_iceh_data/ingest.ts";
import { resolveAssetFileOrThrow } from "../../db/instance/assets.ts";
import { getInstanceDatasetsSummary } from "../../db/instance/instance.ts";
import { log } from "../../middleware/logging.ts";
import { notifyInstanceDatasetsUpdated } from "../../task_management/notify_instance_updated.ts";
import { defineRoute } from "../route-helpers.ts";
import { requireVisibleAssets } from "../../auth/asset_visibility.ts";

export const routesIceh = new Hono();

defineRoute(
  routesIceh,
  "getDatasetIcehDetail",
  log("getDatasetIcehDetail"),
  async (c) => {
    const res = await getDatasetIcehDetail(c.var.mainDb);
    return c.json(res);
  },
);

defineRoute(
  routesIceh,
  "getDatasetIcehDisplayData",
  log("getDatasetIcehDisplayData"),
  async (c) => {
    const res = await getDatasetIcehDisplayData(c.var.mainDb);
    return c.json(res);
  },
);

// Stateless: parses the zip from the named asset for the wizard's
// upload-step preview: no pin check, the wizard always wants current bytes.
// Nothing is persisted by this call.
defineRoute(
  routesIceh,
  "parseDatasetIcehZipPreview",
  requireVisibleAssets("zipFileName"),
  log("parseDatasetIcehZipPreview"),
  async (c, { body }) => {
    try {
      const { filePath } = await resolveAssetFileOrThrow(
        body.zipFileName,
        null,
      );
      const data = await parseIcehZipPreview(filePath, body.zipFileName);
      return c.json({ success: true, data });
    } catch (e) {
      return c.json({
        success: false,
        err: e instanceof Error ? e.message : String(e),
      });
    }
  },
);

defineRoute(
  routesIceh,
  "launchDatasetIcehRun",
  requireVisibleAssets("zipFileName"),
  log("launchDatasetIcehRun"),
  async (c, { body }) => {
    const res = await launchDatasetIcehImportRun(c.var.mainDb, {
      zipFileName: body.zipFileName,
      triggeredBy: c.var.globalUser?.email ?? "unknown",
      onComplete: async () => {
        notifyInstanceDatasetsUpdated(
          await getInstanceDatasetsSummary(c.var.mainDb),
        );
      },
    });
    return c.json(res);
  },
);

defineRoute(
  routesIceh,
  "getDatasetIcehImportRuns",
  async (c) => {
    const res = await getDatasetIcehImportRunSummaries(c.var.mainDb);
    return c.json(res);
  },
);

defineRoute(
  routesIceh,
  "resolveDatasetIcehReview",
  log("resolveDatasetIcehReview"),
  async (c, { body }) => {
    const res = await resolveDatasetIcehReview(c.var.mainDb, {
      runId: body.runId,
      action: body.action,
      onComplete: async () => {
        notifyInstanceDatasetsUpdated(
          await getInstanceDatasetsSummary(c.var.mainDb),
        );
      },
    });
    return c.json(res);
  },
);

defineRoute(
  routesIceh,
  "cancelDatasetIcehRun",
  log("cancelDatasetIcehRun"),
  async (c, { body }) => {
    const res = await cancelDatasetIcehImportRun(c.var.mainDb, body.runId);
    return c.json(res);
  },
);

defineRoute(
  routesIceh,
  "deleteDatasetIcehData",
  log("deleteDatasetIcehData"),
  async (c) => {
    const res = await deleteDatasetIcehData(c.var.mainDb);
    if (res.success) {
      notifyInstanceDatasetsUpdated(
        await getInstanceDatasetsSummary(c.var.mainDb),
      );
    }
    return c.json(res);
  },
);

defineRoute(
  routesIceh,
  "deleteDatasetIcehIndicators",
  log("deleteDatasetIcehIndicators"),
  async (c, { body }) => {
    const res = await deleteDatasetIcehIndicators(
      c.var.mainDb,
      body.indicatorCodes,
    );
    if (res.success) {
      notifyInstanceDatasetsUpdated(
        await getInstanceDatasetsSummary(c.var.mainDb),
      );
    }
    return c.json(res);
  },
);
