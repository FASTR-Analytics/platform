import { Hono } from "hono";
import { requireGlobalPermission } from "../../middleware/mod.ts";
import { defineRoute } from "../route-helpers.ts";
import { getInstanceDatasetsSummary, getPgConnectionFromCacheOrNew } from "../../db/mod.ts";
import { notifyInstanceDatasetsUpdated } from "../../task_management/notify_instance_updated.ts";
import { tryCatchDatabaseAsync } from "../../db/utils.ts";

export const routesHfaTimePoints = new Hono();

defineRoute(
  routesHfaTimePoints,
  "updateHfaTimePoint",
  requireGlobalPermission("can_configure_data"),
  async (c, { body }) => {
    const mainDb = c.var.mainDb;
    const res = await tryCatchDatabaseAsync(async () => {
      if (body.newLabel && body.newLabel !== body.oldLabel) {
        await mainDb`
          UPDATE hfa_time_points
          SET label = ${body.newLabel}
          WHERE label = ${body.oldLabel}
        `;
      }
      if (body.periodId) {
        const label = body.newLabel ?? body.oldLabel;
        await mainDb`
          UPDATE hfa_time_points
          SET period_id = ${body.periodId}
          WHERE label = ${label}
        `;
      }
      return { success: true };
    });
    if (res.success) {
      notifyInstanceDatasetsUpdated(await getInstanceDatasetsSummary(mainDb));
    }
    return c.json(res);
  },
);

defineRoute(
  routesHfaTimePoints,
  "reorderHfaTimePoints",
  requireGlobalPermission("can_configure_data"),
  async (c, { body }) => {
    const mainDb = c.var.mainDb;
    const res = await tryCatchDatabaseAsync(async () => {
      for (let i = 0; i < body.order.length; i++) {
        await mainDb`
          UPDATE hfa_time_points
          SET sort_order = ${i + 1}
          WHERE label = ${body.order[i]}
        `;
      }
      return { success: true };
    });
    if (res.success) {
      notifyInstanceDatasetsUpdated(await getInstanceDatasetsSummary(mainDb));
    }
    return c.json(res);
  },
);

defineRoute(
  routesHfaTimePoints,
  "deleteHfaTimePoint",
  requireGlobalPermission("can_configure_data"),
  async (c, { body }) => {
    const mainDb = c.var.mainDb;
    const res = await tryCatchDatabaseAsync(async () => {
      const hasIndicatorCode = await mainDb<{ count: number }[]>`
        SELECT COUNT(*) as count FROM hfa_indicator_code WHERE time_point = ${body.label}
      `;
      if (hasIndicatorCode[0].count > 0) {
        throw new Error(
          `Cannot delete time point "${body.label}" because it has indicator code defined. Delete the indicator code first.`
        );
      }

      await mainDb`DELETE FROM hfa_variable_values WHERE time_point = ${body.label}`;
      await mainDb`DELETE FROM hfa_variables WHERE time_point = ${body.label}`;
      await mainDb`DELETE FROM hfa_data WHERE time_point = ${body.label}`;
      await mainDb`DELETE FROM hfa_time_points WHERE label = ${body.label}`;

      return { success: true };
    });
    if (res.success) {
      notifyInstanceDatasetsUpdated(await getInstanceDatasetsSummary(mainDb));
    }
    return c.json(res);
  },
);
