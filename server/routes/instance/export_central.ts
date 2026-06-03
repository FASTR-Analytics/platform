import { Hono } from "hono";
import { H_USERS, type GlobalUser } from "lib";
import type { Sql } from "postgres";
import { getPgConnectionFromCacheOrNew } from "../../db/mod.ts";
import { getResultsObjectTableName } from "../../db/utils.ts";
import { _INSTANCE_ID, _INSTANCE_NAME } from "../../exposed_env_vars.ts";
import { requireGlobalPermission, authMiddleware } from "../../middleware/mod.ts";
import type { DBMetric, DBModule } from "../../db/project/_project_database_types.ts";
import type { DBProject } from "../../db/instance/_main_database_types.ts";
import { getModuleDefinitionDetail } from "../../module_loader/load_module.ts";
import type { ModuleId } from "lib";

type Env = { Variables: { globalUser: GlobalUser; mainDb: Sql } };

export const routesExportCentral = new Hono<Env>();

routesExportCentral.get(
  "/central_reporting_projects",
  requireGlobalPermission(),
  async (c) => {
    if (!H_USERS.includes(c.var.globalUser.email)) {
      return c.json({ success: false, err: "Not authorized" }, 403);
    }

    const mainDb = getPgConnectionFromCacheOrNew("main", "READ_ONLY");
    const projects = await mainDb<DBProject[]>`
      SELECT * FROM projects WHERE is_central_reporting = TRUE
    `;

    const result = await Promise.all(
      projects.map(async (p) => {
        const projectDb = getPgConnectionFromCacheOrNew(p.id, "READ_ONLY");
        let modules: DBModule[] = [];
        try {
          modules = await projectDb<DBModule[]>`SELECT * FROM modules`;
        } catch {
          // Project DB may not be accessible if module hasn't run yet
        }
        return {
          id: p.id,
          label: p.label,
          isLocked: p.is_locked,
          status: p.status,
          modules: modules.map((m) => ({
            id: m.id,
            lastRunAt: m.last_run_at,
            lastRunGitRef: m.last_run_git_ref,
            dirty: m.dirty,
          })),
        };
      }),
    );

    return c.json({ success: true, data: result });
  },
);

routesExportCentral.get(
  "/export_central/:project_id",
  requireGlobalPermission(),
  async (c) => {
    if (!H_USERS.includes(c.var.globalUser.email)) {
      return c.json({ success: false, err: "Not authorized" }, 403);
    }

    const projectId = c.req.param("project_id");
    const mainDb = getPgConnectionFromCacheOrNew("main", "READ_ONLY");

    const projectRow = await mainDb<
      { id: string; is_central_reporting: boolean }[]
    >`SELECT id, is_central_reporting FROM projects WHERE id = ${projectId}`;

    if (!projectRow.at(0)) {
      return c.json({ success: false, err: "Project not found" }, 404);
    }
    if (!projectRow.at(0)!.is_central_reporting) {
      return c.json({ success: false, err: "Project is not a central reporting project" }, 403);
    }

    const projectDb = getPgConnectionFromCacheOrNew(projectId, "READ_ONLY");

    const moduleRows = await projectDb<DBModule[]>`
      SELECT id, config_selections, dirty, compute_def_updated_at, compute_def_git_ref,
             presentation_def_updated_at, presentation_def_git_ref, config_updated_at,
             last_run_at, last_run_git_ref
      FROM modules
    `;
    const modules = moduleRows.map((m) => ({ ...m, module_definition: "" }));

    const resultsObjectsMeta = await projectDb<
      { id: string; module_id: string; column_definitions: string | null }[]
    >`SELECT id, module_id, column_definitions FROM results_objects`;

    const resultsObjects = resultsObjectsMeta.map((ro) => ({
      id: ro.id,
      moduleId: ro.module_id,
      columnDefinitions: ro.column_definitions,
      rows: [] as Record<string, unknown>[],
    }));

    const metrics = await projectDb<DBMetric[]>`SELECT * FROM metrics`;

    // Build English label map from module definitions so the central hub always
    // receives English labels regardless of this instance's INSTANCE_LANGUAGE.
    const metricLabelMap = new Map<string, { label: string; variantLabel: string | null }>();
    await Promise.all(moduleRows.map(async (m) => {
      try {
        const defResult = await getModuleDefinitionDetail(m.id as ModuleId, "en");
        if (defResult.success) {
          for (const metric of defResult.data.metrics) {
            metricLabelMap.set(metric.id, { label: metric.label, variantLabel: metric.variantLabel ?? null });
          }
        }
      } catch {
        // Module definition unavailable — fall back to stored label
      }
    }));
    const metricsExport = metrics.map((m) => ({
      ...m,
      label: metricLabelMap.get(m.id)?.label ?? m.label,
      variant_label: metricLabelMap.get(m.id)?.variantLabel ?? m.variant_label,
    }));

    type DBCalcIndicator = {
      calculated_indicator_id: string; label: string; format_as: string;
      decimal_places: number; threshold_direction: string;
      threshold_green: number; threshold_yellow: number;
      group_label: string; sort_order: number;
    };
    let calculatedIndicators: DBCalcIndicator[] = [];
    try {
      calculatedIndicators = await projectDb<DBCalcIndicator[]>`
        SELECT calculated_indicator_id, label, format_as, decimal_places,
               threshold_direction, threshold_green, threshold_yellow,
               group_label, sort_order
        FROM calculated_indicators_snapshot
        ORDER BY sort_order, calculated_indicator_id
      `;
    } catch {
      // Table may not exist on older instances
    }

    const enc = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const w = (s: string) => controller.enqueue(enc.encode(s));
        w(`{"success":true,"data":{`);
        w(`"exportedAt":${JSON.stringify(new Date().toISOString())},`);
        w(`"sourceInstanceId":${JSON.stringify(_INSTANCE_ID)},`);
        w(`"sourceInstanceLabel":${JSON.stringify(_INSTANCE_NAME)},`);
        w(`"sourceProjectId":${JSON.stringify(projectId)},`);
        w(`"modules":${JSON.stringify(modules)},`);
        w(`"metrics":${JSON.stringify(metrics)},`);
        w(`"calculatedIndicators":${JSON.stringify(calculatedIndicators)},`);
        w(`"resultsObjects":[`);
        for (let i = 0; i < resultsObjects.length; i++) {
          if (i > 0) w(",");
          const ro = resultsObjects[i];
          w(`{"id":${JSON.stringify(ro.id)},"moduleId":${JSON.stringify(ro.moduleId)},"columnDefinitions":${JSON.stringify(ro.columnDefinitions)},"rows":[`);
          const chunkSize = 500;
          for (let j = 0; j < ro.rows.length; j += chunkSize) {
            if (j > 0) w(",");
            w(ro.rows.slice(j, j + chunkSize).map((r) => JSON.stringify(r)).join(","));
          }
          w("]}");
        }
        w("]}}");
        controller.close();
      },
    });
    return new Response(stream, { headers: { "Content-Type": "application/json" } });
  },
);

const ROWS_PAGE_SIZE = 20000;

routesExportCentral.get(
  "/export_central/:project_id/rows",
  requireGlobalPermission(),
  async (c) => {
    if (!H_USERS.includes(c.var.globalUser.email)) {
      return c.json({ success: false, err: "Not authorized" }, 403);
    }
    const projectId = c.req.param("project_id");
    const roId = c.req.query("ro_id") ?? "";
    const offset = parseInt(c.req.query("offset") ?? "0");
    if (!roId) return c.json({ success: false, err: "ro_id required" }, 400);

    const projectDb = getPgConnectionFromCacheOrNew(projectId, "READ_ONLY");
    const tableName = getResultsObjectTableName(roId);

    let rows: Record<string, unknown>[] = [];
    try {
      rows = await projectDb<Record<string, unknown>[]>`
        SELECT * FROM ${projectDb(tableName)}
        LIMIT ${ROWS_PAGE_SIZE} OFFSET ${offset}
      `;
    } catch {
      // Table may not exist
    }

    const enc = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const w = (s: string) => controller.enqueue(enc.encode(s));
        w(`{"success":true,"data":{`);
        w(`"exportedAt":${JSON.stringify(new Date().toISOString())},`);
        w(`"sourceInstanceId":${JSON.stringify(_INSTANCE_ID)},`);
        w(`"sourceInstanceLabel":${JSON.stringify(_INSTANCE_NAME)},`);
        w(`"sourceProjectId":${JSON.stringify(projectId)},`);
        w(`"modules":${JSON.stringify(modules)},`);
        w(`"metrics":${JSON.stringify(metrics)},`);
        w(`"calculatedIndicators":${JSON.stringify(calculatedIndicators)},`);
        w(`"resultsObjects":[`);
        for (let i = 0; i < resultsObjects.length; i++) {
          if (i > 0) w(",");
          const ro = resultsObjects[i];
          w(`{"id":${JSON.stringify(ro.id)},"moduleId":${JSON.stringify(ro.moduleId)},"columnDefinitions":${JSON.stringify(ro.columnDefinitions)},"rows":[`);
          const chunkSize = 500;
          for (let j = 0; j < ro.rows.length; j += chunkSize) {
            if (j > 0) w(",");
            w(ro.rows.slice(j, j + chunkSize).map((r) => JSON.stringify(r)).join(","));
          }
          w("]}");
        }
        w("]}}");
        controller.close();
      },
    });
    return new Response(stream, { headers: { "Content-Type": "application/json" } });
  },
);
