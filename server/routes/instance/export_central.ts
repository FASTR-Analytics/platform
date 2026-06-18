import { Hono } from "hono";
import { H_USERS, type GlobalUser } from "lib";
import type { Sql } from "postgres";
import { getPgConnectionFromCacheOrNew, createWorkerReadConnection } from "../../db/mod.ts";
import { getResultsObjectTableName } from "../../db/utils.ts";
import { _CENTRAL_SERVER_SECRET, _INSTANCE_ID, _INSTANCE_NAME } from "../../exposed_env_vars.ts";
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
      threshold_direction: string;
      threshold_green: number; threshold_yellow: number;
      group_label: string; sort_order: number;
    };
    let calculatedIndicators: DBCalcIndicator[] = [];
    try {
      calculatedIndicators = await projectDb<DBCalcIndicator[]>`
        SELECT calculated_indicator_id, label, format_as,
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

const ROWS_STREAM_BATCH = 20000;

// Encode one value as a Postgres COPY TEXT field (NULL → \N; backslash/tab/newline/CR escaped)
// so the consumer pipes the stream straight into `COPY ... FROM STDIN`.
function encodeCopyField(v: unknown): string {
  if (v === null || v === undefined) return "\\N";
  const s = typeof v === "object" ? JSON.stringify(v) : String(v);
  return s.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/\r/g, "\\r").replace(/\t/g, "\\t");
}

routesExportCentral.get(
  "/export_central/:project_id/rows",
  async (c) => {
    if (!_CENTRAL_SERVER_SECRET || c.req.header("X-Central-Secret") !== _CENTRAL_SERVER_SECRET) {
      return c.json({ success: false, err: "Authentication required", authError: true }, 401);
    }

    const projectId = c.req.param("project_id");
    const roId = c.req.query("ro_id") ?? "";
    if (!roId) return c.json({ success: false, err: "ro_id required" }, 400);

    const tableName = getResultsObjectTableName(roId);
    const db = createWorkerReadConnection(projectId);

    // Stream this results object as Postgres COPY TEXT for exactly the columns central asked
    // for (`cols`), with this instance's id as source_server_id, so central pipes it straight
    // into `COPY ... FROM STDIN` (zero per-row JS on central; COPY-speed writes). The source
    // reads via a server-side cursor and formats COPY TEXT per batch through a pull-based
    // ReadableStream — the cursor only advances when the consumer reads, so source memory is
    // bounded to one batch regardless of table size. (postgres.js's COPY-TO-STDOUT `.readable()`
    // buffers the whole result internally and OOMs the source on large tables — it does not
    // honor consumer backpressure.) A dedicated no-statement-timeout read connection is used.
    try {
      const colRows = await db.unsafe(
        `SELECT column_name FROM information_schema.columns WHERE table_name = $1`,
        [tableName],
      ) as { column_name: string }[];
      const actual = new Set(colRows.map((r) => r.column_name));

      // No backing table (module never run / empty) → empty body; central COPYs zero rows.
      if (actual.size === 0) {
        await db.end().catch(() => {});
        return new Response(new Uint8Array(), { headers: { "Content-Type": "application/octet-stream" } });
      }

      // Only safe identifiers. A requested column the table lacks becomes NULL so the column
      // order central will COPY into still lines up.
      const requested = (c.req.query("cols") ?? "")
        .split(",").map((s) => s.trim()).filter((s) => /^[A-Za-z0-9_]+$/.test(s));
      // SELECT only the columns the source actually has; absent requested columns are emitted
      // as \N below so the column order central COPYs into still lines up.
      const presentCols = requested.filter((col) => actual.has(col));
      const selectExpr = presentCols.length ? presentCols.map((col) => `"${col}"`).join(", ") : "1";
      const enc = new TextEncoder();
      const srcField = encodeCopyField(_INSTANCE_ID);
      const startedAt = Date.now();
      const it = db.unsafe(`SELECT ${selectExpr} FROM "${tableName}"`)
        .cursor(ROWS_STREAM_BATCH)[Symbol.asyncIterator]();
      let cleanedUp = false;
      const cleanup = async () => {
        if (cleanedUp) return;
        cleanedUp = true;
        try { await it.return?.(); } catch { /* cursor already closed */ }
        await db.end().catch(() => {});
      };

      // Pull-based: the cursor advances one batch per read, so memory stays bounded to one
      // batch and the source is paced by the consumer (no OOM regardless of table size).
      const body = new ReadableStream<Uint8Array>({
        async pull(controller) {
          try {
            const { value, done } = await it.next();
            if (done) {
              console.log(`[export_central] ${tableName}: streamed in ${Date.now() - startedAt}ms`);
              controller.close();
              await cleanup();
              return;
            }
            let payload = "";
            for (const row of value as Record<string, unknown>[]) {
              payload += srcField;
              for (const col of requested) payload += "\t" + (actual.has(col) ? encodeCopyField(row[col]) : "\\N");
              payload += "\n";
            }
            controller.enqueue(enc.encode(payload));
          } catch (err) {
            controller.error(err);
            await cleanup();
          }
        },
        async cancel() { await cleanup(); },
      });

      return new Response(body, { headers: { "Content-Type": "application/octet-stream" } });
    } catch (err) {
      await db.end().catch(() => {});
      return c.json({ success: false, err: err instanceof Error ? err.message : String(err) }, 500);
    }
  },
);
