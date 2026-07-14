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
//     membership AND order — both engines TS-re-sort option lists, so any
//     order divergence is a real regression)
//   - replicant option lists for POs with an active replicant
//   - synthetic items variants per metric (in-rig only, never stored):
//     admin-area rollup, facility-column disaggregations, each periodFilter
//     type the metric's granularity supports, non-default replicant panes
//   - in --run mode additionally: the raw-rows preview
//     (getResultsObjectItemsFromRun vs the pg baseline, full multiset up to
//     a row cap) and per-metric availability (manifest stamps vs the same
//     rules recomputed from live pg facts)
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
// --run: run the REAL serving path (the run wrappers in
// server/run_query/run_read.ts over the project's attached immutable run —
// manifest context, no probes) against the legacy Postgres baseline.
// READ-ONLY: a project without an attached run FAILS the gate — synthesize
// runs first (backfill_runs.ts). This is the per-instance rollout gate for
// the cutover deploy.
//
// THE GATE: every check must be "ok". Diffs, one-engine errors, BOTH-engine
// errors (a pg-side error can mask a duck-side regression), and skips of any
// kind (unattached project, detail/fetch-config failure, rig exception) all
// turn the verdict RED. Nothing is advisory.
// =============================================================================

import { join } from "@std/path";
import { _SANDBOX_DIR_PATH } from "./server/exposed_env_vars.ts";
import {
  getEffectiveRollupLevel,
  getPeriodFilterExactBounds,
  getFetchConfigFromPresentationObjectConfig,
  getReplicateByProp,
  postAggregationExpressionStrict,
  type DisaggregationOption,
  type GenericLongFormFetchConfig,
  type InstanceConfigFacilityColumns,
  type ItemsHolderPresentationObject,
  type PeriodBounds,
  type PresentationObjectConfig,
  type PresentationObjectDetail,
  type ResultsValue,
  type ResultsValueInfoForPresentationObject,
} from "lib";
import type { Sql } from "postgres";
import { getPgConnection } from "./server/db/postgres/connection_manager.ts";
import { getResultsObjectTableName } from "./server/db/utils.ts";
import { getPresentationObjectDetail } from "./server/db/project/presentation_objects.ts";
import { getResultsObjectItems } from "./server/db/project/results_objects.ts";
import { getFacilityColumnsConfig } from "./server/db/instance/config.ts";
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
  deriveVirtualDefaults,
  getMetricsWithStatusFromManifest,
  getPossibleValuesFromRun,
  getPresentationObjectDetailFromRun,
  getPresentationObjectItemsFromRun,
  getResultsObjectItemsFromRun,
  getResultsValueInfoFromRun,
  type RunReadContext,
} from "./server/run_query/mod.ts";
import {
  deriveAvailableDisaggregationOptions,
  getRunManifestCached,
  runDirPath,
} from "./server/runs/mod.ts";

const REL_EPSILON = 1e-9;
const PG_NULL_SENTINEL = "__PG_NULL__";
const CSV_EXPORT_BATCH = 20000;
// Raw-preview content is multiset-diffed in full up to this many rows; above
// it, only totalCount + column schema are compared (logged, never silent).
const RAW_PREVIEW_FULL_DIFF_MAX_ROWS = 300_000;

// ── CLI ───────────────────────────────────────────────────────────────────────

const onlyProjectId = ((): string | undefined => {
  const i = Deno.args.indexOf("--project");
  return i >= 0 ? Deno.args[i + 1] : undefined;
})();
const keepWorkDir = Deno.args.includes("--keep-work-dir");
const useSandboxParquet = Deno.args.includes("--sandbox-parquet");
const useRun = Deno.args.includes("--run");
if (useSandboxParquet && useRun) {
  throw new Error("--sandbox-parquet and --run are mutually exclusive");
}

// ── Result bookkeeping ────────────────────────────────────────────────────────

type CheckName =
  | "items"
  | "items_synthetic"
  | "metric_info"
  | "replicant_options"
  | "raw_preview"
  | "metric_availability";
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
let syntheticDropCount = 0;

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
    // Both engines run the same TS re-sort in getPossibleValuesCore, so any
    // order divergence is a real regression, not a collation delta.
    const firstMismatch = pgIds.findIndex((id, i) => id !== duckIds[i]);
    return `${context} order: first mismatch at index ${firstMismatch} (pg=${pgIds[firstMismatch]} duck=${duckIds[firstMismatch]})`;
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

async function resolveReplicantOptions(
  mainDb: Sql,
  projectDb: Sql,
  detail: PresentationObjectDetail,
  replicateBy: string,
): Promise<{ id: string; label: string }[]> {
  const resExCfg = getFetchConfigFromPresentationObjectConfig(
    detail.resultsValue,
    detail.config,
    { excludeReplicantFilter: true },
  );
  if (resExCfg.success === false) return [];
  const moduleRow = (
    await projectDb<{ module_id: string }[]>`
SELECT module_id FROM results_objects WHERE id = ${detail.resultsValue.resultsObjectId}
`
  ).at(0);
  if (!moduleRow) return [];
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
  return res.success === true ? res.data : [];
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
  isVirtualDefault: boolean,
  metricInfoDone: Set<string>,
  syntheticsDone: Set<string>,
): Promise<void> {
  const record = (r: Omit<CheckResult, "projectId" | "poId" | "poLabel">) => {
    allResults.push({ projectId, poId, poLabel, ...r });
  };

  // Virtual defaults (item 5b) have no row — in --run mode their detail
  // resolves from the manifest projection; the fetch config it yields is
  // identical for both engines, which is what the parity check needs.
  const resDetail = isVirtualDefault && runCtx
    ? await getPresentationObjectDetailFromRun(runCtx, projectId, projectDb, poId)
    : await getPresentationObjectDetail(projectId, projectDb, poId, mainDb);
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

  // In --run mode the duck side is the real run wrappers — no shadow
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
  let replicantOptions: { id: string; label: string }[] = [];
  if (replicateBy) {
    replicantOptions = await resolveReplicantOptions(mainDb, projectDb, detail, replicateBy);
    const stored = detail.config.d.selectedReplicantValue;
    const value = stored !== undefined && replicantOptions.some((v) => v.id === stored)
      ? stored
      : replicantOptions.at(0)?.id;
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

  const runItemsPair = async (
    fc: GenericLongFormFetchConfig,
  ): Promise<Omit<CheckResult, "projectId" | "poId" | "poLabel" | "check">> => {
    const t0 = performance.now();
    const pgRes = await getPresentationObjectItems(
      mainDb, projectId, projectDb, resultsValue.resultsObjectId,
      fc, firstPeriodOption, "parity", "parity",
    );
    const t1 = performance.now();
    const duckRes = runCtx
      ? await getPresentationObjectItemsFromRun(
          runCtx, projectId, resultsValue.resultsObjectId,
          fc, firstPeriodOption,
        )
      : await getPresentationObjectItems(
          mainDb, projectId, hybridDb, resultsValue.resultsObjectId,
          fc, firstPeriodOption, "parity", "parity",
        );
    const t2 = performance.now();
    const timing = { pgMs: t1 - t0, duckMs: t2 - t1 };
    if (pgRes.success === false && duckRes.success === false) {
      return {
        outcome: "both_error",
        detail: `pg=${pgRes.err} duck=${duckRes.err}`,
        ...timing,
      };
    }
    if (pgRes.success === false || duckRes.success === false) {
      return {
        outcome: "diff",
        detail: `one engine errored: pg=${pgRes.success ? "ok" : pgRes.err} duck=${duckRes.success ? "ok" : duckRes.err}`,
        ...timing,
      };
    }
    const diff = diffItemsHolders(pgRes.data, duckRes.data, fc);
    return { outcome: diff ? "diff" : "ok", detail: diff, ...timing };
  };

  // ---- items ----
  record({ check: "items", ...(await runItemsPair(fetchConfig)) });

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
      record({ check: "metric_info", outcome: "both_error", detail: `pg=${pgRes.err} duck=${duckRes.err}`, ...timing });
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
        record({ check: "replicant_options", outcome: "both_error", detail: `pg=${pgRes.err} duck=${duckRes.err}`, ...timing });
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

  // ---- synthetic variants (finding 16: corpus breadth, in-rig only) ----
  // The stored-PO corpus underexercises rollup, facility-column groupBys,
  // several periodFilter types, and non-default replicant panes. Per metric,
  // mutate this PO's config into those shapes and diff items across engines.
  // A variant whose fetch config fails to build is an invalid combo for this
  // metric, not corpus material — dropped, with the drop count logged from
  // main(). NEVER stored: these exist only inside this process.
  if (!syntheticsDone.has(resultsValue.id)) {
    syntheticsDone.add(resultsValue.id);
    const variants = buildSyntheticVariants(
      resultsValue, config, runCtx, replicateBy, replicantOptions,
    );
    for (const variant of variants) {
      const variantConfig = { ...config, d: variant.d };
      let variantFetchConfig: GenericLongFormFetchConfig;
      try {
        const res = getFetchConfigFromPresentationObjectConfig(resultsValue, variantConfig);
        if (res.success === false) {
          syntheticDropCount++;
          continue;
        }
        variantFetchConfig = res.data;
      } catch (_e) {
        syntheticDropCount++;
        continue;
      }
      allResults.push({
        projectId,
        poId,
        poLabel: `${poLabel} [${variant.name}]`,
        check: "items_synthetic",
        ...(await runItemsPair(variantFetchConfig)),
      });
    }
  }
}

// One mutation set per gap category. Options come from the metric's own
// enriched disaggregationOptions, so every variant targets a column the
// results object actually has.
function buildSyntheticVariants(
  resultsValue: ResultsValue,
  config: PresentationObjectConfig,
  runCtx: RunReadContext | undefined,
  replicateBy: string | undefined,
  replicantOptions: { id: string; label: string }[],
): { name: string; d: PresentationObjectConfig["d"] }[] {
  const available = resultsValue.disaggregationOptions.map((d) => d.value);
  const baseD = config.d;
  const variants: { name: string; d: PresentationObjectConfig["d"] }[] = [];

  const adminOpt = (["admin_area_2", "admin_area_3", "admin_area_4"] as const)
    .find((opt) => available.includes(opt));
  if (adminOpt) {
    const dRollup: PresentationObjectConfig["d"] = {
      ...baseD,
      disaggregateBy: [{ disOpt: adminOpt, disDisplayOpt: "series" }],
      selectedReplicantValue: undefined,
      includeAdminAreaRollup: true,
      adminAreaRollupPosition: "bottom",
    };
    if (getEffectiveRollupLevel(resultsValue, { ...config, d: dRollup }) !== undefined) {
      variants.push({ name: `syn:rollup:${adminOpt}`, d: dRollup });
    }
  }

  for (const facilityOpt of available.filter((opt) => opt.startsWith("facility_")).slice(0, 2)) {
    variants.push({
      name: `syn:facility:${facilityOpt}`,
      d: {
        ...baseD,
        disaggregateBy: [{ disOpt: facilityOpt, disDisplayOpt: "series" }],
        selectedReplicantValue: undefined,
      },
    });
  }

  const granularity = resultsValue.mostGranularTimePeriodColumnInResultsFile;
  const periodFilters: { name: string; pf: NonNullable<PresentationObjectConfig["d"]["periodFilter"]> }[] = [];
  if (granularity === "period_id") {
    periodFilters.push({ name: "syn:pf:last_n_months", pf: { filterType: "last_n_months", nMonths: 6 } });
  }
  if (granularity === "period_id" || granularity === "quarter_id") {
    periodFilters.push({ name: "syn:pf:last_calendar_quarter", pf: { filterType: "last_calendar_quarter" } });
    periodFilters.push({
      name: "syn:pf:last_n_calendar_quarters",
      pf: { filterType: "last_n_calendar_quarters", nQuarters: 2 },
    });
  }
  if (granularity !== undefined) {
    periodFilters.push({ name: "syn:pf:last_calendar_year", pf: { filterType: "last_calendar_year" } });
    periodFilters.push({
      name: "syn:pf:last_n_calendar_years",
      pf: { filterType: "last_n_calendar_years", nYears: 2 },
    });
  }
  if (runCtx) {
    const ro = runCtx.manifest.resultsObjects.find(
      (r) => r.id === resultsValue.resultsObjectId,
    );
    const bounds = ro?.periodBounds;
    if (bounds) {
      periodFilters.push({
        name: "syn:pf:custom",
        pf: { filterType: "custom", min: bounds.min, max: bounds.max },
      });
      if (granularity === "period_id") {
        periodFilters.push({
          name: "syn:pf:from_month",
          pf: { filterType: "from_month", min: bounds.min, max: bounds.max },
        });
      }
    }
  }
  for (const { name, pf } of periodFilters) {
    variants.push({ name, d: { ...baseD, periodFilter: pf } });
  }

  if (replicateBy && replicantOptions.length >= 2) {
    variants.push({
      name: "syn:replicant:non-default",
      d: { ...baseD, selectedReplicantValue: replicantOptions[1].id },
    });
  }

  return variants;
}

// ── Run-mode project-level checks ────────────────────────────────────────────

// Finding 15: the raw-rows preview (S8 read surface) — the run wrappers'
// getResultsObjectItemsFromRun vs the legacy pg baseline, for every results
// object in the manifest. Content is multiset-diffed in full up to
// RAW_PREVIEW_FULL_DIFF_MAX_ROWS; larger objects compare totalCount + column
// schema only (logged).
async function checkRawPreviews(
  projectDb: Sql,
  runCtx: RunReadContext,
  projectId: string,
): Promise<void> {
  for (const ro of runCtx.manifest.resultsObjects) {
    const record = (r: Pick<CheckResult, "outcome" | "detail">) => {
      allResults.push({
        projectId,
        poId: ro.id,
        poLabel: `raw preview ${ro.moduleId}/${ro.id}`,
        check: "raw_preview",
        ...r,
      });
    };
    if (!ro.hasParquet) {
      // The run serves "no query data" for this RO — the pg baseline must
      // agree there is nothing to serve.
      const pgRes = await getResultsObjectItems(projectDb, ro.id, 1);
      const pgHasRows = pgRes.success === true && pgRes.data.status === "ok";
      record(
        pgHasRows
          ? {
              outcome: "diff",
              detail: "manifest hasParquet=false but the pg table has rows",
            }
          : { outcome: "ok", detail: "no query data on either side" },
      );
      continue;
    }
    const capped = ro.rowCount > RAW_PREVIEW_FULL_DIFF_MAX_ROWS;
    const limit = capped ? 1 : undefined;
    const pgRes = await getResultsObjectItems(projectDb, ro.id, limit);
    const duckRes = await getResultsObjectItemsFromRun(runCtx, ro.id, limit);
    if (pgRes.success === false && duckRes.success === false) {
      record({ outcome: "both_error", detail: `pg=${pgRes.err} duck=${duckRes.err}` });
      continue;
    }
    if (pgRes.success === false || duckRes.success === false) {
      record({
        outcome: "diff",
        detail: `one engine errored: pg=${pgRes.success ? "ok" : pgRes.err} duck=${duckRes.success ? "ok" : duckRes.err}`,
      });
      continue;
    }
    const pg = pgRes.data;
    const duck = duckRes.data;
    if (pg.status !== duck.status) {
      record({ outcome: "diff", detail: `status: pg=${pg.status} duck=${duck.status}` });
      continue;
    }
    if (pg.status !== "ok" || duck.status !== "ok") {
      record({ outcome: "ok" });
      continue;
    }
    // pg count(*) arrives as a bigint-string via postgres.js; duck's is the
    // manifest rowCount number — compare numerically.
    if (Number(pg.totalCount) !== Number(duck.totalCount)) {
      record({ outcome: "diff", detail: `totalCount: pg=${pg.totalCount} duck=${duck.totalCount}` });
      continue;
    }
    const contentDiff = diffRawRowMultisets(
      pg.items as Record<string, unknown>[],
      duck.items as Record<string, unknown>[],
    );
    if (contentDiff) {
      record({ outcome: "diff", detail: contentDiff });
      continue;
    }
    if (capped) {
      console.log(
        `   raw_preview ${ro.id}: content diff capped (${ro.rowCount} rows > ${RAW_PREVIEW_FULL_DIFF_MAX_ROWS}) — totalCount + schema only`,
      );
      record({ outcome: "ok", detail: `content capped at ${ro.rowCount} rows: count+schema only` });
    } else {
      record({ outcome: "ok" });
    }
  }
}

// Raw rows are UNAGGREGATED — both engines read literals that came from the
// same CSV, so numeric values must match exactly after canonicalization
// (pg NUMERIC arrives as text, duck DOUBLE as number; Number() of the same
// decimal literal yields the same double on both paths).
function canonicalizeRawCell(v: unknown): string {
  if (v === null || v === undefined) return " NULL";
  if (typeof v === "number") return String(v);
  const s = String(v);
  const trimmed = s.trim();
  if (trimmed !== "" && !Number.isNaN(Number(trimmed))) return String(Number(s));
  return s;
}

function diffRawRowMultisets(
  pgItems: Record<string, unknown>[],
  duckItems: Record<string, unknown>[],
): string | undefined {
  if (pgItems.length !== duckItems.length) {
    return `row count: pg=${pgItems.length} duck=${duckItems.length}`;
  }
  if (pgItems.length === 0) return undefined;
  const pgCols = Object.keys(pgItems[0]).sort();
  const duckCols = Object.keys(duckItems[0]).sort();
  if (pgCols.join(",") !== duckCols.join(",")) {
    return `columns: pg=[${pgCols}] duck=[${duckCols}]`;
  }
  const rowKey = (row: Record<string, unknown>) =>
    pgCols.map((c) => canonicalizeRawCell(row[c])).join("");
  const counts = new Map<string, number>();
  for (const row of pgItems) {
    const key = rowKey(row);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  for (const row of duckItems) {
    const key = rowKey(row);
    const n = counts.get(key);
    if (n === undefined) {
      return `row in duck not in pg: ${key.replaceAll("", " | ").slice(0, 200)}`;
    }
    if (n === 1) counts.delete(key);
    else counts.set(key, n - 1);
  }
  if (counts.size > 0) {
    const [key] = counts.keys();
    return `row in pg not in duck: ${key.replaceAll("", " | ").slice(0, 200)}`;
  }
  return undefined;
}

// Finding 25: the manifest availability stamps became authoritative (item 5)
// — recompute availability from live pg facts with the SAME rules as
// computeMetricAvailability (synthesize_run.ts) and diff per metric. A
// mismatch is either a wrong stamp or config drift since the module last ran
// (the known facility-config gotcha) — both are exactly what this gate is for.
async function checkMetricAvailability(
  mainDb: Sql,
  projectDb: Sql,
  runCtx: RunReadContext,
  projectId: string,
): Promise<void> {
  const facilityConfigRes = await getFacilityColumnsConfig(mainDb);
  if (facilityConfigRes.success === false) {
    throw new Error(`Could not read facility columns config: ${facilityConfigRes.err}`);
  }
  const manifestMetrics = getMetricsWithStatusFromManifest(runCtx.manifest);
  const pgMetrics = await projectDb<
    {
      id: string;
      label: string;
      hide: boolean;
      results_object_id: string;
      value_props: string;
      post_aggregation_expression: string | null;
      required_disaggregation_options: string;
    }[]
  >`
SELECT id, label, hide, results_object_id, value_props, post_aggregation_expression, required_disaggregation_options
FROM metrics
`;
  const pgStatusById = new Map<string, { status: string; reason: string }>();
  const roFacts = new Map<string, { columns: Set<string> | null; hasRows: boolean }>();
  const factsFor = async (resultsObjectId: string) => {
    const cached = roFacts.get(resultsObjectId);
    if (cached) return cached;
    const tableName = getResultsObjectTableName(resultsObjectId);
    const cols = await projectDb<{ column_name: string }[]>`
SELECT column_name FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = ${tableName}
`;
    let facts: { columns: Set<string> | null; hasRows: boolean };
    if (cols.length === 0) {
      facts = { columns: null, hasRows: false };
    } else {
      const probe = await projectDb.unsafe(`SELECT 1 FROM "${tableName}" LIMIT 1`);
      facts = { columns: new Set(cols.map((c) => c.column_name)), hasRows: probe.length > 0 };
    }
    roFacts.set(resultsObjectId, facts);
    return facts;
  };
  for (const metric of pgMetrics) {
    if (metric.hide) continue;
    const facts = await factsFor(metric.results_object_id);
    let status = "ready";
    let reason = "";
    if (facts.columns === null) {
      status = "unavailable";
      reason = "no ro table in pg";
    } else if (!facts.hasRows) {
      status = "unavailable";
      reason = "ro table has no rows";
    } else {
      const pae = metric.post_aggregation_expression
        ? postAggregationExpressionStrict.parse(JSON.parse(metric.post_aggregation_expression))
        : undefined;
      const neededProps = pae
        ? pae.ingredientValues.map((v) => v.prop)
        : (JSON.parse(metric.value_props) as string[]);
      const missingProps = neededProps.filter((p) => !facts.columns!.has(p));
      const availableDisOpts = deriveAvailableDisaggregationOptions(
        facts.columns,
        facilityConfigRes.data,
      );
      const required = JSON.parse(metric.required_disaggregation_options) as DisaggregationOption[];
      const missingDisOpts = required.filter((d) => !availableDisOpts.includes(d));
      if (missingProps.length > 0) {
        status = "unavailable";
        reason = `value props missing in pg: ${missingProps.join(", ")}`;
      } else if (missingDisOpts.length > 0) {
        status = "unavailable";
        reason = `required disaggregation options missing in pg: ${missingDisOpts.join(", ")}`;
      }
    }
    pgStatusById.set(metric.id, { status, reason });
  }
  for (const mm of manifestMetrics) {
    const record = (r: Pick<CheckResult, "outcome" | "detail">) => {
      allResults.push({
        projectId,
        poId: mm.id,
        poLabel: `metric availability "${mm.label}"`,
        check: "metric_availability",
        ...r,
      });
    };
    const pgStatus = pgStatusById.get(mm.id);
    pgStatusById.delete(mm.id);
    if (!pgStatus) {
      record({ outcome: "diff", detail: "metric in manifest but not in pg metrics table" });
      continue;
    }
    const manifestStatus = mm.status === "ready" ? "ready" : "unavailable";
    if (manifestStatus !== pgStatus.status) {
      record({
        outcome: "diff",
        detail: `manifest=${manifestStatus}(${mm.statusReason ?? ""}) pg=${pgStatus.status}(${pgStatus.reason})`,
      });
    } else {
      record({ outcome: "ok" });
    }
  }
  for (const [metricId] of pgStatusById) {
    allResults.push({
      projectId,
      poId: metricId,
      poLabel: `metric availability ${metricId}`,
      check: "metric_availability",
      outcome: "diff",
      detail: "metric in pg metrics table but not in manifest",
    });
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const workDirRoot = Deno.env.get("PARITY_WORK_DIR") ?? (await Deno.makeTempDir({ prefix: "parity_" }));
  console.log(`Parquet work dir: ${workDirRoot}${keepWorkDir ? " (kept)" : ""}`);

  const mainDb = getPgConnection("main", { max: 4 });
  const projects = await mainDb<
    { id: string; label: string; status: string; run_id: string | null }[]
  >`
SELECT id, label, status, run_id FROM projects ORDER BY label
`;
  const targets = projects.filter(
    (p) => p.status === "ready" && (!onlyProjectId || p.id === onlyProjectId),
  );
  console.log(`Projects: ${targets.length} (of ${projects.length})`);

  for (const project of targets) {
    let runCtx: RunReadContext | undefined;
    if (useRun) {
      if (project.run_id === null) {
        console.log(`\n── ${project.label} (${project.id.slice(0, 8)}): NO RUN ATTACHED — GATING`);
        allResults.push({
          projectId: project.id,
          poId: "-",
          poLabel: project.label,
          check: "items",
          outcome: "skip",
          detail: "NO RUN ATTACHED — synthesize a run first (backfill_runs.ts)",
        });
        continue;
      }
      runCtx = {
        runId: project.run_id,
        runDir: runDirPath(project.run_id),
        manifest: await getRunManifestCached(project.run_id),
      };
    }
    const projectDb = getPgConnection(project.id, { max: 4 });
    const workDir = join(workDirRoot, project.id);
    await Deno.mkdir(workDir, { recursive: true });
    const shadow = new ProjectShadow(projectDb, workDir);
    const hybridDb = makeHybridDb(projectDb, shadow);
    const metricInfoDone = new Set<string>();
    const syntheticsDone = new Set<string>();
    try {
      const rows = await projectDb<{ id: string; label: string }[]>`
SELECT id, label FROM presentation_objects ORDER BY label
`;
      // Virtual defaults (item 5b) are part of the served surface in --run
      // mode — include them so the corpus keeps its default-viz coverage
      // after migration 030 deletes the rows. The filter guards the
      // pre-migration state where the rows still exist.
      const virtualPos = runCtx
        ? deriveVirtualDefaults(runCtx.manifest)
            .filter((d) => !rows.some((po) => po.id === d.id))
            .map((d) => ({ id: d.id, label: d.label, virtual: true }))
        : [];
      const pos = [
        ...rows.map((po) => ({ ...po, virtual: false })),
        ...virtualPos,
      ];
      console.log(
        `\n── ${project.label} (${project.id.slice(0, 8)}): ${pos.length} POs` +
          (virtualPos.length > 0 ? ` (${virtualPos.length} virtual defaults)` : ""),
      );
      for (const po of pos) {
        try {
          await checkPresentationObject(
            mainDb, projectDb, hybridDb, shadow, runCtx, project.id, po.id, po.label, po.virtual, metricInfoDone, syntheticsDone,
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
      if (runCtx) {
        await checkRawPreviews(projectDb, runCtx, project.id);
        await checkMetricAvailability(mainDb, projectDb, runCtx, project.id);
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
  const synKinds = new Map<string, number>();
  for (const r of allResults) {
    if (r.check !== "items_synthetic") continue;
    const match = r.poLabel.match(/\[syn:([a-z_]+):?([a-z_0-9-]*)\]/);
    if (!match) continue;
    const kind = match[1] === "pf" ? `pf:${match[2]}` : match[1];
    synKinds.set(kind, (synKinds.get(kind) ?? 0) + 1);
  }
  if (synKinds.size > 0) {
    console.log(
      `synthetic corpus: ${[...synKinds.entries()].map(([k, n]) => `${k}=${n}`).join(" ")}`,
    );
  }
  if (syntheticDropCount > 0) {
    console.log(
      `synthetic variants dropped (fetch config not buildable for that metric): ${syntheticDropCount}`,
    );
  }

  const diffs = allResults.filter((r) => r.outcome === "diff");
  if (diffs.length > 0) {
    console.log("\nDIFFS:");
    for (const d of diffs) {
      console.log(`  [${d.projectId.slice(0, 8)}] ${d.check} "${d.poLabel}" (${d.poId}): ${d.detail}`);
    }
  }
  const bothErrors = allResults.filter((r) => r.outcome === "both_error");
  if (bothErrors.length > 0) {
    console.log("\nBOTH-ENGINE ERRORS (gating — a pg error can mask a duck regression):");
    for (const b of bothErrors) {
      console.log(`  [${b.projectId.slice(0, 8)}] ${b.check} "${b.poLabel}" (${b.poId}): ${b.detail}`);
    }
  }
  const skips = allResults.filter((r) => r.outcome === "skip");
  if (skips.length > 0) {
    console.log("\nSKIPS (gating — fix the corpus or the read path, don't ignore):");
    for (const s of skips) {
      console.log(`  [${s.projectId.slice(0, 8)}] "${s.poLabel}" (${s.poId}): ${s.detail}`);
    }
  }

  if (!keepWorkDir && !Deno.env.get("PARITY_WORK_DIR")) {
    await Deno.remove(workDirRoot, { recursive: true });
  }
  await mainDb.end();
  const gatingCount = diffs.length + bothErrors.length + skips.length;
  console.log(
    gatingCount === 0
      ? "\nPARITY GREEN"
      : `\nPARITY RED: ${diffs.length} diffs, ${bothErrors.length} both_error, ${skips.length} skips`,
  );
  Deno.exit(gatingCount === 0 ? 0 : 1);
}

function summarize(results: CheckResult[], indent: string) {
  for (
    const check of [
      "items",
      "items_synthetic",
      "metric_info",
      "replicant_options",
      "raw_preview",
      "metric_availability",
    ] as CheckName[]
  ) {
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
