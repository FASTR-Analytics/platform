import { Hono } from "hono";
import type { Sql } from "postgres";
import { requireGlobalPermission } from "../../middleware/mod.ts";
import { defineRoute } from "../route-helpers.ts";
import { getInstanceDatasetsSummary, getPgConnectionFromCacheOrNew } from "../../db/mod.ts";
import { notifyInstanceDatasetsUpdated } from "../../task_management/notify_instance_updated.ts";
import { tryCatchDatabaseAsync } from "../../db/utils.ts";

export const routesHfaTimePoints = new Hono();

defineRoute(
  routesHfaTimePoints,
  "createHfaTimePoint",
  requireGlobalPermission("can_configure_data"),
  async (c, { body }) => {
    const mainDb = c.var.mainDb;
    const res = await tryCatchDatabaseAsync(async () => {
      const label = body.label.trim();
      if (!label) {
        throw new Error("Time point label cannot be empty");
      }
      if (!body.periodId || body.periodId.length !== 6) {
        throw new Error("Time point must have a year and month");
      }
      const existing = await mainDb<{ label: string }[]>`
        SELECT label FROM hfa_time_points WHERE label = ${label}
      `;
      if (existing.length > 0) {
        throw new Error(`Time point "${label}" already exists`);
      }
      await mainDb.begin(async (sql: Sql) => {
        await sql`
          INSERT INTO hfa_time_points (label, period_id, sort_order, imported_at)
          VALUES (
            ${label},
            ${body.periodId},
            (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM hfa_time_points),
            NULL
          )
        `;
        // Carry indicator code forward from the latest existing time point
        await sql`
          INSERT INTO hfa_indicator_code (var_name, time_point, r_code, r_filter_code)
          SELECT var_name, ${label}, r_code, r_filter_code
          FROM hfa_indicator_code
          WHERE time_point = (
            SELECT tp.label FROM hfa_time_points tp
            WHERE tp.label != ${label}
            ORDER BY tp.sort_order DESC
            LIMIT 1
          )
          ON CONFLICT DO NOTHING
        `;
      });
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
