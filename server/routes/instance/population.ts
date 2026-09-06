import { Hono } from "hono";
import {
  deleteAllPopulation,
  deletePopulationTypeData,
  getInstancePopulationSummary,
  getPopulationExportRows,
  getPopulationTemplate,
  getPopulationTypeStore,
  importPopulationCsv,
  previewPopulationCsv,
  setPopulationLevel,
} from "../../db/mod.ts";
import { log } from "../../middleware/logging.ts";
import { requireGlobalPermission } from "../../middleware/mod.ts";
import { notifyInstancePopulationUpdated } from "../../task_management/notify_instance_updated.ts";
import { defineRoute } from "../route-helpers.ts";

export const routesPopulation = new Hono();

defineRoute(
  routesPopulation,
  "setPopulationLevel",
  requireGlobalPermission("can_configure_data"),
  log("setPopulationLevel"),
  async (c, { body }) => {
    const res = await setPopulationLevel(c.var.mainDb, body.level);
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
  "getPopulationTypeStore",
  requireGlobalPermission("can_view_data"),
  log("getPopulationTypeStore"),
  async (c, { body }) => {
    return c.json(await getPopulationTypeStore(c.var.mainDb, body.populationType));
  },
);

defineRoute(
  routesPopulation,
  "previewPopulationCsv",
  requireGlobalPermission("can_configure_data"),
  log("previewPopulationCsv"),
  async (c, { body }) => {
    return c.json(await previewPopulationCsv(c.var.mainDb, body.assetFileName));
  },
);

defineRoute(
  routesPopulation,
  "importPopulationCsv",
  requireGlobalPermission("can_configure_data"),
  log("importPopulationCsv"),
  async (c, { body }) => {
    const res = await importPopulationCsv(
      c.var.mainDb,
      body.assetFileName,
      body.confirmIncomplete,
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
  "deletePopulationTypeData",
  requireGlobalPermission("can_configure_data"),
  log("deletePopulationTypeData"),
  async (c, { body }) => {
    const res = await deletePopulationTypeData(
      c.var.mainDb,
      body.populationType,
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
// The area columns run to the population level; an empty store exports the
// header only.
routesPopulation.get(
  "/population/export/csv",
  requireGlobalPermission("can_view_data"),
  log("exportPopulationCsv"),
  async (c) => {
    const { level, rows } = await getPopulationExportRows(c.var.mainDb);
    const areaColumns = ["admin_area_1", "admin_area_2", "admin_area_3", "admin_area_4"]
      .slice(0, level ?? 2);
    const header = [...areaColumns, "year", "population_type", "count"];
    const lines = [header.join(",")];
    for (const r of rows) {
      const names = [r.admin_area_1, r.admin_area_2, r.admin_area_3, r.admin_area_4]
        .slice(0, level ?? 2);
      lines.push(
        [...names, String(r.year), r.population_type, String(r.count)]
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

// The import template for this instance: header at the population level, one
// row per structure area × population type for the current year, count
// blank. Refused while the level is unset, as the import is.
routesPopulation.get(
  "/population/template/csv",
  requireGlobalPermission("can_configure_data"),
  log("exportPopulationTemplateCsv"),
  async (c) => {
    const template = await getPopulationTemplate(
      c.var.mainDb,
      new Date().getFullYear(),
    );
    if (template === null) {
      return c.text("Set the population level first", 400);
    }
    const { header, rows } = template;
    const lines = [
      header.join(","),
      ...rows.map((r) => r.map(csvCell).join(",")),
    ];
    return c.body(lines.join("\n"), 200, {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="population_template.csv"',
    });
  },
);

function csvCell(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}
