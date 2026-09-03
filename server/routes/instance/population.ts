import { Hono } from "hono";
import {
  createPopulationType,
  deleteAllPopulation,
  deletePopulationGroup,
  deletePopulationType,
  getInstancePopulationSummary,
  getPopulationRows,
  getPopulationTypes,
  importPopulationCsv,
  updatePopulationTypeLabel,
} from "../../db/mod.ts";
import { log } from "../../middleware/logging.ts";
import { requireGlobalPermission } from "../../middleware/mod.ts";
import { notifyInstancePopulationUpdated } from "../../task_management/notify_instance_updated.ts";
import { defineRoute } from "../route-helpers.ts";

export const routesPopulation = new Hono();

defineRoute(
  routesPopulation,
  "getPopulationTypes",
  requireGlobalPermission(),
  log("getPopulationTypes"),
  async (c) => {
    return c.json({ success: true, data: await getPopulationTypes(c.var.mainDb) });
  },
);

defineRoute(
  routesPopulation,
  "createPopulationType",
  requireGlobalPermission("can_configure_data"),
  log("createPopulationType"),
  async (c, { body }) => {
    const res = await createPopulationType(c.var.mainDb, body.id, body.label);
    if (res.success) {
      notifyInstancePopulationUpdated(
        await getInstancePopulationSummary(c.var.mainDb),
      );
    }
    return c.json(res);
  },
);

defineRoute(
  routesPopulation,
  "updatePopulationType",
  requireGlobalPermission("can_configure_data"),
  log("updatePopulationType"),
  async (c, { body }) => {
    const res = await updatePopulationTypeLabel(
      c.var.mainDb,
      body.id,
      body.label,
    );
    if (res.success) {
      notifyInstancePopulationUpdated(
        await getInstancePopulationSummary(c.var.mainDb),
      );
    }
    return c.json(res);
  },
);

defineRoute(
  routesPopulation,
  "deletePopulationType",
  requireGlobalPermission("can_configure_data"),
  log("deletePopulationType"),
  async (c, { body }) => {
    const res = await deletePopulationType(c.var.mainDb, body.id);
    if (res.success) {
      notifyInstancePopulationUpdated(
        await getInstancePopulationSummary(c.var.mainDb),
      );
    }
    return c.json(res);
  },
);

defineRoute(
  routesPopulation,
  "getPopulationRows",
  requireGlobalPermission("can_view_data"),
  log("getPopulationRows"),
  async (c) => {
    return c.json({ success: true, data: await getPopulationRows(c.var.mainDb) });
  },
);

defineRoute(
  routesPopulation,
  "importPopulationCsv",
  requireGlobalPermission("can_configure_data"),
  log("importPopulationCsv"),
  async (c, { body }) => {
    const res = await importPopulationCsv(c.var.mainDb, body.assetFileName);
    if (res.success) {
      notifyInstancePopulationUpdated(
        await getInstancePopulationSummary(c.var.mainDb),
      );
    }
    return c.json(res);
  },
);

defineRoute(
  routesPopulation,
  "deletePopulationGroup",
  requireGlobalPermission("can_configure_data"),
  log("deletePopulationGroup"),
  async (c, { body }) => {
    const res = await deletePopulationGroup(
      c.var.mainDb,
      body.populationType,
      body.adminAreaLevel,
    );
    if (res.success) {
      notifyInstancePopulationUpdated(
        await getInstancePopulationSummary(c.var.mainDb),
      );
    }
    return c.json(res);
  },
);

defineRoute(
  routesPopulation,
  "deleteAllPopulation",
  requireGlobalPermission("can_configure_data"),
  log("deleteAllPopulation"),
  async (c) => {
    const res = await deleteAllPopulation(c.var.mainDb);
    if (res.success) {
      notifyInstancePopulationUpdated(
        await getInstancePopulationSummary(c.var.mainDb),
      );
    }
    return c.json(res);
  },
);

// CSV export in the import format, so a downloaded file re-imports as-is.
routesPopulation.get(
  "/population/export/csv",
  requireGlobalPermission("can_view_data"),
  async (c) => {
    const rows = await getPopulationRows(c.var.mainDb);
    const maxLevel = rows.reduce((m, r) => Math.max(m, r.adminAreaLevel), 2);
    const areaColumns = ["admin_area_1", "admin_area_2", "admin_area_3", "admin_area_4"]
      .slice(0, maxLevel);
    const header = [...areaColumns, "year", "population_type", "count"];
    const lines = [header.join(",")];
    for (const r of rows) {
      const names = [r.adminArea1, r.adminArea2, r.adminArea3, r.adminArea4]
        .slice(0, maxLevel);
      lines.push(
        [...names, String(r.year), r.populationType, String(r.count)]
          .map(csvCell)
          .join(","),
      );
    }
    return c.body(lines.join("\n"), 200, {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="population.csv"',
    });
  },
);

function csvCell(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}
