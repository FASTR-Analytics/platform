import { Hono } from "hono";
import { H_USERS, type GlobalUser } from "lib";
import type { Sql } from "postgres";
import { getPgConnectionFromCacheOrNew } from "../../db/mod.ts";
import { getResultsObjectTableName } from "../../db/utils.ts";
import { _INSTANCE_ID, _INSTANCE_NAME } from "../../exposed_env_vars.ts";
import { requireGlobalPermission } from "../../middleware/mod.ts";
import type { DBMetric, DBModule } from "../../db/project/_project_database_types.ts";
import type { DBProject } from "../../db/instance/_main_database_types.ts";

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

    const modules = await projectDb<DBModule[]>`SELECT * FROM modules`;

    const resultsObjectsMeta = await projectDb<
      { id: string; module_id: string; column_definitions: string | null }[]
    >`SELECT id, module_id, column_definitions FROM results_objects`;

    const resultsObjects = await Promise.all(
      resultsObjectsMeta.map(async (ro) => {
        const tableName = getResultsObjectTableName(ro.id);
        let rows: Record<string, unknown>[] = [];
        try {
          rows = await projectDb<Record<string, unknown>[]>`
            SELECT * FROM ${projectDb(tableName)}
          `;
        } catch {
          // Table may not exist yet if module hasn't run
        }
        return {
          id: ro.id,
          moduleId: ro.module_id,
          columnDefinitions: ro.column_definitions,
          rows,
        };
      }),
    );

    const metrics = await projectDb<DBMetric[]>`SELECT * FROM metrics`;

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
