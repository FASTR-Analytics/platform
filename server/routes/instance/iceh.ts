import { Hono } from "hono";
import {
  getDatasetIcehDetail,
  getDatasetIcehDisplayData,
  deleteDatasetIcehData,
  deleteDatasetIcehIndicators,
} from "../../db/instance/dataset_iceh.ts";
import {
  cancelDatasetIcehImportRun,
  getDatasetIcehImportRunSummaries,
  launchDatasetIcehImportRun,
  resolveDatasetIcehReview,
} from "../../db/instance/dataset_iceh_import_runs.ts";
import { parseIcehZipPreview } from "../../worker_routines/import_iceh_data/ingest.ts";
import { resolveImportTempUpload } from "../../import_temp_uploads.ts";
import { getInstanceDatasetsSummary } from "../../db/instance/instance.ts";
import { log } from "../../middleware/logging.ts";
import { requireGlobalPermission } from "../../middleware/mod.ts";
import { notifyInstanceDatasetsUpdated } from "../../task_management/notify_instance_updated.ts";
import { defineRoute } from "../route-helpers.ts";

export const routesIceh = new Hono();

defineRoute(
  routesIceh,
  "getDatasetIcehDetail",
  requireGlobalPermission("can_view_data"),
  log("getDatasetIcehDetail"),
  async (c) => {
    const res = await getDatasetIcehDetail(c.var.mainDb);
    return c.json(res);
  }
);

defineRoute(
  routesIceh,
  "getDatasetIcehDisplayData",
  requireGlobalPermission("can_view_data"),
  log("getDatasetIcehDisplayData"),
  async (c) => {
    const res = await getDatasetIcehDisplayData(c.var.mainDb);
    return c.json(res);
  }
);

// Stateless: parses the zip from the token-keyed temp upload for the
// wizard's upload-step preview. Nothing is persisted by this call.
defineRoute(
  routesIceh,
  "parseDatasetIcehZipPreview",
  requireGlobalPermission("can_configure_data"),
  log("parseDatasetIcehZipPreview"),
  async (c, { body }) => {
    const zipUpload = await resolveImportTempUpload(body.zipUploadToken);
    if (!zipUpload) {
      return c.json({
        success: false,
        err: "The uploaded file is no longer available. Upload it again.",
      });
    }
    try {
      const data = await parseIcehZipPreview(
        zipUpload.filePath,
        zipUpload.fileName,
      );
      return c.json({ success: true, data });
    } catch (e) {
      return c.json({
        success: false,
        err: e instanceof Error ? e.message : String(e),
      });
    }
  }
);

defineRoute(
  routesIceh,
  "launchDatasetIcehRun",
  requireGlobalPermission("can_configure_data"),
  log("launchDatasetIcehRun"),
  async (c, { body }) => {
    const res = await launchDatasetIcehImportRun(c.var.mainDb, {
      zipUploadToken: body.zipUploadToken,
      triggeredBy: c.var.globalUser?.email ?? "unknown",
      onComplete: async () => {
        notifyInstanceDatasetsUpdated(
          await getInstanceDatasetsSummary(c.var.mainDb),
        );
      },
    });
    return c.json(res);
  }
);

defineRoute(
  routesIceh,
  "getDatasetIcehImportRuns",
  requireGlobalPermission("can_view_data"),
  async (c) => {
    const res = await getDatasetIcehImportRunSummaries(c.var.mainDb);
    return c.json(res);
  }
);

defineRoute(
  routesIceh,
  "resolveDatasetIcehReview",
  requireGlobalPermission("can_configure_data"),
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
  }
);

defineRoute(
  routesIceh,
  "cancelDatasetIcehRun",
  requireGlobalPermission("can_configure_data"),
  log("cancelDatasetIcehRun"),
  async (c, { body }) => {
    const res = await cancelDatasetIcehImportRun(c.var.mainDb, body.runId);
    return c.json(res);
  }
);

defineRoute(
  routesIceh,
  "deleteDatasetIcehData",
  requireGlobalPermission("can_configure_data"),
  log("deleteDatasetIcehData"),
  async (c) => {
    const res = await deleteDatasetIcehData(c.var.mainDb);
    if (res.success) {
      notifyInstanceDatasetsUpdated(await getInstanceDatasetsSummary(c.var.mainDb));
    }
    return c.json(res);
  }
);

defineRoute(
  routesIceh,
  "deleteDatasetIcehIndicators",
  requireGlobalPermission("can_configure_data"),
  log("deleteDatasetIcehIndicators"),
  async (c, { body }) => {
    const res = await deleteDatasetIcehIndicators(c.var.mainDb, body.indicatorCodes);
    if (res.success) {
      notifyInstanceDatasetsUpdated(await getInstanceDatasetsSummary(c.var.mainDb));
    }
    return c.json(res);
  }
);
