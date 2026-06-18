import { Hono } from "hono";
import {
  getDatasetIcehDetail,
  getDatasetIcehDisplayData,
  getDatasetIcehUploadAttempt,
  getDatasetIcehUploadStatus,
  createDatasetIcehUploadAttempt,
  deleteDatasetIcehUploadAttempt,
  updateDatasetIcehUploadAttemptStep1,
  updateDatasetIcehUploadAttemptStep2,
  updateDatasetIcehUploadAttemptStep3,
  deleteDatasetIcehData,
  deleteDatasetIcehIndicators,
} from "../../db/instance/dataset_iceh.ts";
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

defineRoute(
  routesIceh,
  "createDatasetIcehUploadAttempt",
  requireGlobalPermission("can_configure_data"),
  log("createDatasetIcehUploadAttempt"),
  async (c) => {
    const res = await createDatasetIcehUploadAttempt(c.var.mainDb);
    return c.json(res);
  }
);

defineRoute(
  routesIceh,
  "getDatasetIcehUploadAttempt",
  requireGlobalPermission("can_view_data"),
  log("getDatasetIcehUploadAttempt"),
  async (c) => {
    const res = await getDatasetIcehUploadAttempt(c.var.mainDb);
    return c.json(res);
  }
);

defineRoute(
  routesIceh,
  "getDatasetIcehUploadStatus",
  requireGlobalPermission("can_view_data"),
  log("getDatasetIcehUploadStatus"),
  async (c) => {
    const res = await getDatasetIcehUploadStatus(c.var.mainDb);
    return c.json(res);
  }
);

defineRoute(
  routesIceh,
  "deleteDatasetIcehUploadAttempt",
  requireGlobalPermission("can_configure_data"),
  log("deleteDatasetIcehUploadAttempt"),
  async (c) => {
    const res = await deleteDatasetIcehUploadAttempt(c.var.mainDb);
    return c.json(res);
  }
);

defineRoute(
  routesIceh,
  "updateDatasetIcehUploadAttemptStep1",
  requireGlobalPermission("can_configure_data"),
  log("updateDatasetIcehUploadAttemptStep1"),
  async (c) => {
    const body = await c.req.json<{ zipAssetFileName: string }>();
    const res = await updateDatasetIcehUploadAttemptStep1(
      c.var.mainDb,
      body.zipAssetFileName
    );
    return c.json(res);
  }
);

defineRoute(
  routesIceh,
  "updateDatasetIcehUploadAttemptStep2",
  requireGlobalPermission("can_configure_data"),
  log("updateDatasetIcehUploadAttemptStep2"),
  async (c) => {
    const res = await updateDatasetIcehUploadAttemptStep2(
      c.var.mainDb,
      async () => {
        notifyInstanceDatasetsUpdated(await getInstanceDatasetsSummary(c.var.mainDb));
      },
    );
    return c.json(res);
  }
);

defineRoute(
  routesIceh,
  "updateDatasetIcehUploadAttemptStep3",
  requireGlobalPermission("can_configure_data"),
  log("updateDatasetIcehUploadAttemptStep3"),
  async (c) => {
    const res = await updateDatasetIcehUploadAttemptStep3(c.var.mainDb);
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
  async (c) => {
    const body = await c.req.json<{ indicatorCodes: string[] }>();
    const res = await deleteDatasetIcehIndicators(c.var.mainDb, body.indicatorCodes);
    if (res.success) {
      notifyInstanceDatasetsUpdated(await getInstanceDatasetsSummary(c.var.mainDb));
    }
    return c.json(res);
  }
);
