// =============================================================================
// GOLDEN-DIFF PARITY RIG: Postgres vs DuckDB-over-parquet (PLAN_RESULTS_RUNS
// Phase 0). This is the gate every later phase re-runs before a cutover.
//
// For every presentation object in every project of the target instance DB,
// runs the REAL S9 read path twice — once against Postgres, once against a
// hybrid connection whose `.unsafe()` executes on DuckDB over parquet built
// from the same ro_*/facilities tables (tagged-template reads of mirror
// tables stay on Postgres) — and diffs:
//   - items payloads (order-insensitive; aggregates at relative epsilon 1e-9,
//     keys/counts/statuses/dateRange exact)
//   - metric info (period bounds exact; per-option status + value-set
//     membership; option order differences reported as warnings — text
//     ORDER BY collation is a known dialect delta handled at the adapter)
//   - replicant option lists for POs with an active replicant
//
// READ-ONLY. Usage:
//   deno run --allow-all --env-file --unstable-broadcast-channel -c deno.json \
//     validate_results_runs_parity.ts [--project <projectId>] [--keep-work-dir]
//     [--sandbox-parquet]
//
// --sandbox-parquet: where the ingest-written parquet shadow exists in the
// sandbox ({roId}.csv.parquet beside the raw CSV), query THAT file instead of
// a fresh Postgres export — this diffs the finalize normalization route
// (raw R CSV → parquet) against Postgres ingest. Off by default because
// sandbox files can be stale vs the pg tables.
//
// --package: run the REAL serving path (the package wrappers in
// server/run_query/run_read.ts over the project's results package — manifest
// context, no probes) against the legacy Postgres baseline. READ-ONLY: the
// manifest is read directly (no self-heal refresh), and projects without a
// package are skipped — build packages first (server boot, or
// build_results_packages.ts). This is the Deploy-1 per-instance rollout gate.
//
// Zero DIFF rows = parity green for this instance.
// =============================================================================

import { join } from "@std/path";
import { _SANDBOX_DIR_PATH } from "./server/exposed_env_vars.ts";
import {
  getPeriodFilterExactBounds,
  getFetchConfigFromPresentationObjectConfig,
  getReplicateByProp,
  type GenericLongFormFetchConfig,
  type ItemsHolderPresentationObject,
  type PeriodBounds,
  type PresentationObjectDetail,
  type ResultsValueInfoForPresentationObject,
} from "lib";
import type { Sql } from "postgres";
import { getPgConnection } from "./server/db/postgres/connection_manager.ts";
import { getResultsObjectTableName } from "./server/db/utils.ts";
import { getPresentationObjectDetail } from "./server/db/project/presentation_objects.ts";
import {
  getDatasetFamilyForModule,
  getIndicatorMetadata,
  getPossibleValues,
  getPresentationObjectItems,
  getResultsValueInfoForPresentationObject,
} from "./server/server_only_funcs_presentation_objects/mod.ts";
import { getPeriodBounds } from "./server/server_only_funcs_presentation_objects/get_period_bounds.ts";
import {
  duckDbTypeForPgType,
  executeSqlOverParquet,
  writeParquetFromCsv,
  type ParquetView,
} from "./server/run_query/mod.ts";
import {
  getPossibleValuesFromRun,
  getPresentationObjectItemsFromRun,
  getResultsValueInfoFromRun,
  type RunReadContext,
} from "./server/run_query/mod.ts";
import { getPackageManifestCached, packageDirPath } from "./server/runs/mod.ts";

const REL_EPSILON = 1e-9;
const PG_NULL_SENTINEL = "__PG_NULL__";
const CSV_EXPORT_BATCH = 20000;

// ── CLI ───────────────────────────────────────────────────────────────────────

const onlyProjectId = ((): string | undefined => {
  const i = Deno.args.indexOf("--project");
  return i >= 0 ? Deno.args[i + 1] : undefined;
})();
const keepWorkDir = Deno.args.includes("--keep-work-dir");
const useSandboxParquet = Deno.args.includes("--sandbox-parquet");
const usePackage = Deno.args.includes("--package");
if (useSandboxParquet && usePackage) {
  throw new Error("--sandbox-parquet and --package are mutually exclusive");
}

// ── Result bookkeeping ────────────────────────────────────────────────────────

type CheckName = "items" | "metric_info" | "replicant_options";
type Outcome = "ok" | "diff" | "both_error" | "skip";

type CheckResult = {
  projectId: string;
  poId: string;
  poLabel: string;
  check: CheckName;
  outcome: Outcome;
  detail?: string;
  pgMs?: number;
  duckMs?: number;
};

const allResults: CheckResult[] = [];
const warnings: string[] = [];

// ── DuckDB shadow of one project DB ──────────────────────────────────────────

class ProjectShadow {
  private parquetByTable = new Map<string, string>();
  private missingTables = new Set<string>();
  finalizeRouteTables = 0;
  pgExportRouteTables = 0;

  constructor(
    private projectDb: Sql,
    private workDir: string,
  ) {}

  async ensureTable(
    tableName: string,
    candidate?: { path: string; exclusive: boolean },
  ): Promise<void> {
    if (this.parquetByTable.has(tableName) || this.missingTables.has(tableName)) {
      return;
    }
    if (candidate) {
      const exists = await Deno.stat(candidate.path).then(
        (s) => s.isFile,
        () => false,
      );
      if (exists) {
        this.parquetByTable.set(tableName, candidate.path);
        this.finalizeRouteTables++;
        return;
      }
      if (candidate.exclusive) {
        this.missingTables.add(tableName);
        return;
      }
    }
    const cols = await this.projectDb<{ column_name: string; data_type: string }[]>`
SELECT column_name, data_type FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = ${tableName}
ORDER BY ordinal_position
`;
    if (cols.length === 0) {
      this.missingTables.add(tableName);
      return;
    }
    const csvPath = join(this.workDir, `${tableName}.csv`);
    const parquetPath = join(this.workDir, `${tableName}.parquet`);
    await this.exportTableCsv(tableName, cols.map((c) => c.column_name), csvPath);
    await writeParquetFromCsv({
      csvPath,
      parquetPath,
      columns: cols.map((c) => ({
        name: c.column_name,
        duckDbType: duckDbTypeForPgType(c.data_type),
      })),
      nullStrings: [PG_NULL_SENTINEL],
    });
    await Deno.remove(csvPath);
    this.parquetByTable.set(tableName, parquetPath);
    this.pgExportRouteTables++;
  }

  private async exportTableCsv(
    tableName: string,
    columnNames: string[],
    csvPath: string,
  ): Promise<void> {
    const file = await Deno.open(csvPath, { write: true, create: true, truncate: true });
    const writer = file.writable.getWriter();
    const enc = new TextEncoder();
    try {
      await writer.write(enc.encode(columnNames.join(",") + "\n"));
      const selectList = columnNames.map((c) => `"${c}"`).join(", ");
      const cursor = this.projectDb
        .unsafe(`SELECT ${selectList} FROM "${tableName}"`)
        .cursor(CSV_EXPORT_BATCH);
      for await (const rows of cursor) {
        let chunk = "";
        for (const row of rows as Record<string, unknown>[]) {
          const fields = columnNames.map((c) => {
            const v = row[c];
            if (v === null || v === undefined) return PG_NULL_SENTINEL;
            return `"${String(v).replaceAll('"', '""')}"`;
          });
          chunk += fields.join(",") + "\n";
        }
        await writer.write(enc.encode(chunk));
      }
    } finally {
      await writer.close();
    }
  }

  views(): ParquetView[] {
    return [...this.parquetByTable.entries()].map(([viewName, parquetPath]) => ({
      viewName,
      parquetPath,
    }));
  }

  execute(sql: string): Promise<Record<string, unknown>[]> {
    return executeSqlOverParquet(this.views(), sql);
  }
}

// `.unsafe()` (all generated ro_*/facilities SQL) → DuckDB; everything else —
// tagged-template reads of results_objects/modules/indicators/snapshots —
// stays on the real Postgres connection.
function makeHybridDb(realDb: Sql, shadow: ProjectShadow): Sql {
  return new Proxy(realDb, {
    get(target, prop) {
      if (prop === "unsafe") {
        return (sql: string) => shadow.execute(sql);
      }
      const value = Reflect.get(target, prop);
      return typeof value === "function" ? value.bind(target) : value;
    },
  }) as Sql;
}

// ── Diff helpers ──────────────────────────────────────────────────────────────

function numbersMatch(a: number, b: number): boolean {
  if (Number.isNaN(a) || Number.isNaN(b)) return false;
  return Math.abs(a - b) <= Math.max(REL_EPSILON, REL_EPSILON * Math.max(Math.abs(a), Math.abs(b)));
}

function valuesMatch(a: unknown, b: unknown): boolean {
  if (a === null || a === undefined || b === null || b === undefined) {
    return (a === null || a === undefined) && (b === null || b === undefined);
  }
  return numbersMatch(Number(a), Number(b));
}

function keyPart(v: unknown): string {
  return v === null || v === undefined ? " NULL" : String(v);
}

function getValueColumns(fetchConfig: GenericLongFormFetchConfig): string[] {
  if (fetchConfig.postAggregationExpression) {
    const valueName = fetchConfig.postAggregationExpression.split("=")[0]?.trim();
    if (!valueName) throw new Error("PAE with no value name");
    return [valueName];
  }
  return fetchConfig.values.map((v) => v.prop);
}

function diffItemsHolders(
  pg: ItemsHolderPresentationObject,
  duck: ItemsHolderPresentationObject,
  fetchConfig: GenericLongFormFetchConfig,
): string | undefined {
  if (pg.status !== duck.status) {
    return `status: pg=${pg.status} duck=${duck.status}`;
  }
  const boundsDiff = diffBounds("dateRange", pg.dateRange, duck.dateRange);
  if (boundsDiff) return boundsDiff;
  if (pg.status !== "ok" || duck.status !== "ok") return undefined;
  const pgItems = pg.items;
  const duckItems = duck.items;
  if (pgItems.length !== duckItems.length) {
    return `row count: pg=${pgItems.length} duck=${duckItems.length}`;
  }
  const groupBys = fetchConfig.groupBys;
  const valueCols = getValueColumns(fetchConfig);

  const bucket = (items: Record<string, unknown>[]) => {
    const m = new Map<string, unknown[][]>();
    for (const row of items) {
      const key = groupBys.map((g) => keyPart(row[g])).join("");
      const tuple = valueCols.map((c) => row[c]);
      const list = m.get(key);
      if (list) list.push(tuple);
      else m.set(key, [tuple]);
    }
    for (const list of m.values()) {
      list.sort((x, y) => {
        for (let i = 0; i < x.length; i++) {
          const nx = x[i] === null ? -Infinity : Number(x[i]);
          const ny = y[i] === null ? -Infinity : Number(y[i]);
          if (nx !== ny) return nx < ny ? -1 : 1;
        }
        return 0;
      });
    }
    return m;
  };

  const pgMap = bucket(pgItems as Record<string, unknown>[]);
  const duckMap = bucket(duckItems as Record<string, unknown>[]);
  for (const [key, pgTuples] of pgMap) {
    const duckTuples = duckMap.get(key);
    if (!duckTuples) return `row key only in pg: ${key.replaceAll("", " | ")}`;
    if (duckTuples.length !== pgTuples.length) {
      return `row multiplicity for key ${key.replaceAll("", " | ")}: pg=${pgTuples.length} duck=${duckTuples.length}`;
    }
    for (let i = 0; i < pgTuples.length; i++) {
      for (let j = 0; j < valueCols.length; j++) {
        if (!valuesMatch(pgTuples[i][j], duckTuples[i][j])) {
          return `value ${valueCols[j]} at ${key.replaceAll("", " | ")}: pg=${pgTuples[i][j]} duck=${duckTuples[i][j]}`;
        }
      }
    }
  }
  for (const key of duckMap.keys()) {
    if (!pgMap.has(key)) return `row key only in duck: ${key.replaceAll("", " | ")}`;
  }
  return undefined;
}

function diffBounds(
  label: string,
  pg: PeriodBounds | undefined,
  duck: PeriodBounds | undefined,
): string | undefined {
  if (pg === undefined && duck === undefined) return undefined;
  if (pg === undefined || duck === undefined) {
    return `${label}: pg=${JSON.stringify(pg)} duck=${JSON.stringify(duck)}`;
  }
  if (Number(pg.min) !== Number(duck.min) || Number(pg.max) !== Number(duck.max)) {
    return `${label}: pg=${pg.min}..${pg.max} duck=${duck.min}..${duck.max}`;
  }
  return undefined;
}

function diffPossibleValueSets(
  context: string,
  pg: { id: string; label: string }[],
  duck: { id: string; label: string }[],
): string | undefined {
  const pgIds = pg.map((v) => v.id);
  const duckIds = duck.map((v) => v.id);
  const pgSet = new Set(pgIds);
  const duckSet = new Set(duckIds);
  const onlyPg = pgIds.filter((id) => !duckSet.has(id));
  const onlyDuck = duckIds.filter((id) => !pgSet.has(id));
  if (onlyPg.length > 0 || onlyDuck.length > 0) {
    return `${context} membership: only-pg=[${onlyPg.slice(0, 5)}] only-duck=[${onlyDuck.slice(0, 5)}]`;
  }
  if (pgIds.join("") !== duckIds.join("")) {
    warnings.push(
      `${context}: same membership, different order (unexpected — the pinned TS re-sort in getPossibleValuesCore should make both engines emit identical order)`,
    );
  }
  return undefined;
}

function diffMetricInfo(
  pg: ResultsValueInfoForPresentationObject,
  duck: ResultsValueInfoForPresentationObject,
): string | undefined {
  const boundsDiff = diffBounds("periodBounds", pg.periodBounds, duck.periodBounds);
  if (boundsDiff) return boundsDiff;
  const pgOpts = Object.keys(pg.disaggregationPossibleValues).sort();
  const duckOpts = Object.keys(duck.disaggregationPossibleValues).sort();
  if (pgOpts.join(",") !== duckOpts.join(",")) {
    return `enriched options: pg=[${pgOpts}] duck=[${duckOpts}]`;
  }
  for (const opt of pgOpts) {
    const p = pg.disaggregationPossibleValues[opt as keyof typeof pg.disaggregationPossibleValues]!;
    const d = duck.disaggregationPossibleValues[opt as keyof typeof duck.disaggregationPossibleValues]!;
    if (p.status !== d.status) {
      return `option ${opt} status: pg=${p.status} duck=${d.status}`;
    }
    if (p.status === "ok" && d.status === "ok") {
      const setDiff = diffPossibleValueSets(`option ${opt}`, p.values, d.values);
      if (setDiff) return setDiff;
    }
  }
  return undefined;
}

// ── Per-PO checks ─────────────────────────────────────────────────────────────

async function resolveReplicantValue(
  mainDb: Sql,
  projectDb: Sql,
  detail: PresentationObjectDetail,
  replicateBy: string,
): Promise<string | undefined> {
  const resExCfg = getFetchConfigFromPresentationObjectConfig(
    detail.resultsValue,
    detail.config,
    { excludeReplicantFilter: true },
  );
  if (resExCfg.success === false) return undefined;
  const moduleRow = (
    await projectDb<{ module_id: string }[]>`
SELECT module_id FROM results_objects WHERE id = ${detail.resultsValue.resultsObjectId}
`
  ).at(0);
  if (!moduleRow) return undefined;
  const datasetFamily = await getDatasetFamilyForModule(projectDb, moduleRow.module_id);
  const indicatorMetadata = await getIndicatorMetadata(mainDb, projectDb, moduleRow.module_id);
  const labelMap = new Map(indicatorMetadata.map((m) => [m.id, m.label]));
  const res = await getPossibleValues(
    projectDb,
    detail.resultsValue.resultsObjectId,
    datasetFamily,
    replicateBy as Parameters<typeof getPossibleValues>[3],
    mainDb,
    labelMap,
    resExCfg.data.filters,
    undefined,
  );
  if (res.success === false || res.data.length === 0) return undefined;
  const stored = detail.config.d.selectedReplicantValue;
  if (stored !== undefined && res.data.some((v) => v.id === stored)) return stored;
  return res.data[0].id;
}

async function checkPresentationObject(
  mainDb: Sql,
  projectDb: Sql,
  hybridDb: Sql,
  shadow: ProjectShadow,
  runCtx: RunReadContext | undefined,
  projectId: string,
  poId: string,
  poLabel: string,
  metricInfoDone: Set<string>,
): Promise<void> {
  const record = (r: Omit<CheckResult, "projectId" | "poId" | "poLabel">) => {
    allResults.push({ projectId, poId, poLabel, ...r });
  };

  const resDetail = await getPresentationObjectDetail(projectId, projectDb, poId, mainDb);
  if (resDetail.success === false) {
    record({ check: "items", outcome: "skip", detail: `detail failed: ${resDetail.err}` });
    return;
  }
  const detail = resDetail.data;
  const resultsValue = detail.resultsValue;
  const roTableName = getResultsObjectTableName(resultsValue.resultsObjectId);

  const moduleRow = (
    await projectDb<{ module_id: string }[]>`
SELECT module_id FROM results_objects WHERE id = ${resultsValue.resultsObjectId}
`
  ).at(0);
  const lastRun = moduleRow
    ? (
      await projectDb<{ last_run_at: string | null }[]>`
SELECT last_run_at FROM modules WHERE id = ${moduleRow.module_id}
`
    ).at(0)?.last_run_at
    : undefined;
  if (!lastRun) {
    record({ check: "items", outcome: "skip", detail: "module has not run" });
    return;
  }

  // In --package mode the duck side is the real package wrappers — no shadow
  // parquet needed. Other modes build the hybrid shadow.
  if (!runCtx) {
    const roCandidate = useSandboxParquet
      ? {
          path: join(
            _SANDBOX_DIR_PATH,
            projectId,
            moduleRow!.module_id,
            `${resultsValue.resultsObjectId}.parquet`,
          ),
          exclusive: false,
        }
      : undefined;
    await shadow.ensureTable(roTableName, roCandidate);
    await shadow.ensureTable("facilities_hmis", undefined);
    await shadow.ensureTable("facilities_hfa", undefined);
  }

  // Resolve the default replicant like the client does, so the items query is
  // a real pane, not the degenerate UNSELECTED pin.
  let config = detail.config;
  const replicateBy = getReplicateByProp(config);
  if (replicateBy) {
    const value = await resolveReplicantValue(mainDb, projectDb, detail, replicateBy);
    if (value !== undefined) {
      config = { ...config, d: { ...config.d, selectedReplicantValue: value } };
    }
  }

  let fetchConfig: GenericLongFormFetchConfig;
  try {
    const resFetchConfig = getFetchConfigFromPresentationObjectConfig(resultsValue, config);
    if (resFetchConfig.success === false) {
      record({ check: "items", outcome: "skip", detail: `fetch config: ${resFetchConfig.err}` });
      return;
    }
    fetchConfig = resFetchConfig.data;
  } catch (e) {
    record({ check: "items", outcome: "skip", detail: `fetch config threw: ${(e as Error).message}` });
    return;
  }
  const firstPeriodOption = resultsValue.mostGranularTimePeriodColumnInResultsFile;

  // ---- items ----
  {
    const t0 = performance.now();
    const pgRes = await getPresentationObjectItems(
      mainDb, projectId, projectDb, resultsValue.resultsObjectId,
      fetchConfig, firstPeriodOption, "parity", "parity",
    );
    const t1 = performance.now();
    const duckRes = runCtx
      ? await getPresentationObjectItemsFromRun(
          runCtx, projectId, resultsValue.resultsObjectId,
          fetchConfig, firstPeriodOption,
        )
      : await getPresentationObjectItems(
          mainDb, projectId, hybridDb, resultsValue.resultsObjectId,
          fetchConfig, firstPeriodOption, "parity", "parity",
        );
    const t2 = performance.now();
    const timing = { pgMs: t1 - t0, duckMs: t2 - t1 };
    if (pgRes.success === false && duckRes.success === false) {
      record({ check: "items", outcome: "both_error", detail: pgRes.err, ...timing });
    } else if (pgRes.success === false || duckRes.success === false) {
      record({
        check: "items",
        outcome: "diff",
        detail: `one engine errored: pg=${pgRes.success ? "ok" : pgRes.err} duck=${duckRes.success ? "ok" : duckRes.err}`,
        ...timing,
      });
    } else {
      const diff = diffItemsHolders(pgRes.data, duckRes.data, fetchConfig);
      record({ check: "items", outcome: diff ? "diff" : "ok", detail: diff, ...timing });
    }
  }

  // ---- metric info (dedupe per metric) ----
  if (!metricInfoDone.has(detail.resultsValue.id)) {
    metricInfoDone.add(detail.resultsValue.id);
    const metricId = detail.resultsValue.id;
    const t0 = performance.now();
    const pgRes = await getResultsValueInfoForPresentationObject(
      mainDb, projectDb, projectId, metricId, "parity", "parity",
    );
    const t1 = performance.now();
    const duckRes = runCtx
      ? await getResultsValueInfoFromRun(runCtx, projectId, metricId)
      : await getResultsValueInfoForPresentationObject(
          mainDb, hybridDb, projectId, metricId, "parity", "parity",
        );
    const t2 = performance.now();
    const timing = { pgMs: t1 - t0, duckMs: t2 - t1 };
    if (pgRes.success === false && duckRes.success === false) {
      record({ check: "metric_info", outcome: "both_error", detail: pgRes.err, ...timing });
    } else if (pgRes.success === false || duckRes.success === false) {
      record({
        check: "metric_info",
        outcome: "diff",
        detail: `one engine errored: pg=${pgRes.success ? "ok" : pgRes.err} duck=${duckRes.success ? "ok" : duckRes.err}`,
        ...timing,
      });
    } else {
      const diff = diffMetricInfo(pgRes.data, duckRes.data);
      record({ check: "metric_info", outcome: diff ? "diff" : "ok", detail: diff, ...timing });
    }
  }

  // ---- replicant options ----
  if (replicateBy) {
    const resExCfg = getFetchConfigFromPresentationObjectConfig(resultsValue, config, {
      excludeReplicantFilter: true,
    });
    if (resExCfg.success === true) {
      const moduleId = moduleRow!.module_id;
      const datasetFamily = await getDatasetFamilyForModule(projectDb, moduleId);
      const indicatorMetadata = await getIndicatorMetadata(mainDb, projectDb, moduleId);
      const labelMap = new Map(indicatorMetadata.map((m) => [m.id, m.label]));
      // Bounds resolved once on Postgres and fed to both engines: the SQL under
      // test here is the DISTINCT option query, not bounds resolution (that is
      // covered by the metric_info periodBounds diff).
      let bounds: PeriodBounds | undefined;
      if (resExCfg.data.periodFilter) {
        const rawBounds = await getPeriodBounds(
          projectDb, roTableName, [], firstPeriodOption, undefined,
        );
        bounds = getPeriodFilterExactBounds(resExCfg.data.periodFilter, rawBounds);
      }
      const t0 = performance.now();
      const pgRes = await getPossibleValues(
        projectDb, resultsValue.resultsObjectId, datasetFamily,
        replicateBy, mainDb, labelMap, resExCfg.data.filters, bounds,
      );
      const t1 = performance.now();
      const duckRes = runCtx
        ? await getPossibleValuesFromRun(
            runCtx, resultsValue.resultsObjectId, replicateBy,
            labelMap, resExCfg.data.filters, bounds,
          )
        : await getPossibleValues(
            hybridDb, resultsValue.resultsObjectId, datasetFamily,
            replicateBy, mainDb, labelMap, resExCfg.data.filters, bounds,
          );
      const t2 = performance.now();
      const timing = { pgMs: t1 - t0, duckMs: t2 - t1 };
      if (pgRes.success === false && duckRes.success === false) {
        record({ check: "replicant_options", outcome: "both_error", detail: pgRes.err, ...timing });
      } else if (pgRes.success === false || duckRes.success === false) {
        record({
          check: "replicant_options",
          outcome: "diff",
          detail: `one engine errored: pg=${pgRes.success ? "ok" : pgRes.err} duck=${duckRes.success ? "ok" : duckRes.err}`,
          ...timing,
        });
      } else {
        const diff = diffPossibleValueSets("replicant options", pgRes.data, duckRes.data);
        record({ check: "replicant_options", outcome: diff ? "diff" : "ok", detail: diff, ...timing });
      }
    }
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const workDirRoot = Deno.env.get("PARITY_WORK_DIR") ?? (await Deno.makeTempDir({ prefix: "parity_" }));
  console.log(`Parquet work dir: ${workDirRoot}${keepWorkDir ? " (kept)" : ""}`);

  const mainDb = getPgConnection("main", { max: 4 });
  const projects = await mainDb<
    { id: string; label: string; status: string }[]
  >`
SELECT id, label, status FROM projects ORDER BY label
`;
  const targets = projects.filter(
    (p) => p.status === "ready" && (!onlyProjectId || p.id === onlyProjectId),
  );
  console.log(`Projects: ${targets.length} (of ${projects.length})`);

  for (const project of targets) {
    let runCtx: RunReadContext | undefined;
    if (usePackage) {
      const manifest = await getPackageManifestCached(project.id);
      if (manifest === undefined) {
        console.log(`\n── ${project.label} (${project.id.slice(0, 8)}): NO PACKAGE — skipped`);
        continue;
      }
      runCtx = {
        projectId: project.id,
        packageDir: packageDirPath(project.id),
        manifest,
      };
    }
    const projectDb = getPgConnection(project.id, { max: 4 });
    const workDir = join(workDirRoot, project.id);
    await Deno.mkdir(workDir, { recursive: true });
    const shadow = new ProjectShadow(projectDb, workDir);
    const hybridDb = makeHybridDb(projectDb, shadow);
    const metricInfoDone = new Set<string>();
    try {
      const pos = await projectDb<{ id: string; label: string }[]>`
SELECT id, label FROM presentation_objects ORDER BY label
`;
      console.log(`\n── ${project.label} (${project.id.slice(0, 8)}): ${pos.length} POs`);
      for (const po of pos) {
        try {
          await checkPresentationObject(
            mainDb, projectDb, hybridDb, shadow, runCtx, project.id, po.id, po.label, metricInfoDone,
          );
        } catch (e) {
          allResults.push({
            projectId: project.id,
            poId: po.id,
            poLabel: po.label,
            check: "items",
            outcome: "skip",
            detail: `rig error: ${(e as Error).message}`,
          });
        }
      }
      const projectResults = allResults.filter((r) => r.projectId === project.id);
      summarize(projectResults, "   ");
      if (useSandboxParquet) {
        console.log(
          `   parquet routes: finalize=${shadow.finalizeRouteTables} pg-export=${shadow.pgExportRouteTables}`,
        );
      }
    } finally {
      await projectDb.end();
    }
  }

  console.log("\n════════ TOTALS ════════");
  summarize(allResults, "");

  const diffs = allResults.filter((r) => r.outcome === "diff");
  if (diffs.length > 0) {
    console.log("\nDIFFS:");
    for (const d of diffs) {
      console.log(`  [${d.projectId.slice(0, 8)}] ${d.check} "${d.poLabel}" (${d.poId}): ${d.detail}`);
    }
  }
  const skips = allResults.filter((r) => r.outcome === "skip");
  if (skips.length > 0) {
    console.log("\nSKIPS:");
    for (const s of skips) {
      console.log(`  [${s.projectId.slice(0, 8)}] "${s.poLabel}" (${s.poId}): ${s.detail}`);
    }
  }
  if (warnings.length > 0) {
    console.log(`\nWARNINGS (${warnings.length}):`);
    for (const w of [...new Set(warnings)].slice(0, 20)) console.log(`  ${w}`);
  }

  if (!keepWorkDir && !Deno.env.get("PARITY_WORK_DIR")) {
    await Deno.remove(workDirRoot, { recursive: true });
  }
  await mainDb.end();
  console.log(diffs.length === 0 ? "\nPARITY GREEN" : `\nPARITY RED: ${diffs.length} diffs`);
  Deno.exit(diffs.length === 0 ? 0 : 1);
}

function summarize(results: CheckResult[], indent: string) {
  for (const check of ["items", "metric_info", "replicant_options"] as CheckName[]) {
    const rs = results.filter((r) => r.check === check);
    if (rs.length === 0) continue;
    const count = (o: Outcome) => rs.filter((r) => r.outcome === o).length;
    const timed = rs.filter((r) => r.pgMs !== undefined);
    const med = (xs: number[]) => {
      if (xs.length === 0) return 0;
      const s = [...xs].sort((a, b) => a - b);
      return s[Math.floor(s.length / 2)];
    };
    console.log(
      `${indent}${check}: ok=${count("ok")} diff=${count("diff")} both_error=${count("both_error")} skip=${count("skip")}` +
        ` | median pg=${med(timed.map((r) => r.pgMs!)).toFixed(0)}ms duck=${med(timed.map((r) => r.duckMs!)).toFixed(0)}ms`,
    );
  }
}

await main();
