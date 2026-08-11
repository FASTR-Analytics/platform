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
//
// THREE exceptions.
//
// `broken_config` (any mode, ruled 2026-08-10): the PO's fetch config fails
// (typed or thrown) — computed once from stored config + metric BEFORE
// either engine runs, so the breakage is plane-independent: the app shows
// the same typed error before and after the cutover and there is nothing
// for parity to compare. Broken user-authored configs are normal production
// data, never a rollout gate and never something to clean per-instance.
// Counted, printed, non-gating.
//
// The remaining two are --run mode only.
//
// `legacy_gap` (rollout adjudication, 2026-08-10): a raw_preview divergence
// where the LEGACY plane is provably the deficient side — the pg table is
// missing/empty while the package serves data, or pg rows disagree with the
// package AND the package matches the module's own source CSV (read
// independently by the rig, not through finalize) while pg does not. The
// frozen pg oracle inherited the old dirty-machine's fail-open drift, so
// these are pre-cutover ingest gaps, not package defects: counted, printed,
// non-gating. Any divergence where the package side cannot be tied back to
// the source CSV stays a gating diff.
//
// `foreign_run` (Phase 3 ruling 4).
// Parity is defined only where the Postgres baseline describes the same
// generation act as the attached package, and once the dual-write is gone
// that is true of exactly one kind of run — a project's OWN backfill run
// (`RunSummary.backfillSourceProjectId === projectId`, stamped only by
// synthesizeRunForProject). Any other attachment — a wizard-generated
// package, or another project's backfill run — has no pg oracle, so the
// project is not gated: it records ONE counted, printed `foreign_run`
// outcome and its checks do not run. Never silent, never RED. The rollout
// gate is unaffected: backfill gives every project a 1:1 run, and the rig
// runs before anyone regenerates or swaps.
// =============================================================================

import { join } from "@std/path";
import { parse as parseCsv } from "csv";
import { _SANDBOX_DIR_PATH } from "./server/exposed_env_vars.ts";
import {
  BLANK_SENTINEL,
  getEffectiveRollupDimension,
  getPeriodFilterExactBounds,
  getFetchConfigFromPresentationObjectConfig,
  getReplicateByProp,
  postAggregationExpressionStrict,
  SAMPLE_N_PREFIX,
  usesBlankSentinel,
  type DisaggregationOption,
  type GenericLongFormFetchConfig,
  type InstanceConfigFacilityColumns,
  type ItemsHolderPresentationObject,
  type PeriodBounds,
  type PresentationObjectConfig,
  type PresentationObjectDetail,
  type ResultsValue,
  type ResultsValueInfoForPresentationObject,
  type RunSummary,
} from "lib";
import type { Sql } from "postgres";
import { getPgConnection } from "./server/db/postgres/connection_manager.ts";
import { getResultsObjectTableName, getTextColumnNames } from "./server/db/utils.ts";
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
type Outcome =
  | "ok"
  | "diff"
  | "both_error"
  | "skip"
  | "foreign_run"
  | "legacy_gap"
  | "broken_config";

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

// The typed "module never produced this output" refusal, byte-aligned across
// planes: the legacy classifier's ro_-relation case (error_classifier.ts) and
// the run path's hasParquet guard (run_read.ts) share this phrase.
function bothPlanesUnavailable(pgErr: string, duckErr: string): boolean {
  const MARK = "The module may need to be run";
  return pgErr.includes(MARK) && duckErr.includes(MARK);
}
// Extended-kind ELIGIBILITY (distinct from ran-count): incremented whenever a
// gated metric satisfies a kind's corpus precondition, whether or not the
// variant survives fetch-config construction. The extended-corpus gate fires
// only for kinds that were eligible somewhere and still ran zero times — a
// kind no metric on the instance can exercise (e.g. nvalues on an instance
// with no HFA data) is a printed non-gating note, not a corpus regression.
const extendedKindEligible = new Map<string, number>();
function markExtendedKindEligible(kind: string): void {
  extendedKindEligible.set(kind, (extendedKindEligible.get(kind) ?? 0) + 1);
}

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
  // Sample-size columns (__n_*) ride HFA payloads from the query context, not
  // the fetch config — compare whatever either engine emitted, so a missing or
  // wrong n on one side is a diff, not invisible.
  const nCols = new Set<string>();
  for (const items of [pgItems, duckItems] as Record<string, unknown>[][]) {
    for (const row of items) {
      for (const col of Object.keys(row)) {
        if (col.startsWith(SAMPLE_N_PREFIX)) nCols.add(col);
      }
    }
  }
  const valueCols = [...getValueColumns(fetchConfig), ...[...nCols].sort()];

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
  const indicatorMetadata = await getIndicatorMetadata(projectDb, moduleRow.module_id);
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

  // A fetch-config failure is plane-INDEPENDENT: it is computed once from the
  // stored config + metric before either engine runs, so a config broken here
  // is broken identically on both planes — the app shows the same typed error
  // before and after the cutover, and there is nothing for parity to compare.
  // Broken user-authored configs are normal production data (ruled
  // 2026-08-10): typed `broken_config`, counted, printed, NON-GATING.
  let fetchConfig: GenericLongFormFetchConfig;
  try {
    const resFetchConfig = getFetchConfigFromPresentationObjectConfig(resultsValue, config);
    if (resFetchConfig.success === false) {
      record({ check: "items", outcome: "broken_config", detail: `fetch config: ${resFetchConfig.err}` });
      return;
    }
    fetchConfig = resFetchConfig.data;
  } catch (e) {
    record({ check: "items", outcome: "broken_config", detail: `fetch config threw: ${(e as Error).message}` });
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
      // Both planes refusing with the typed data-not-available message is
      // CONSISTENT cross-plane behavior (module never ran — normal user
      // state), not an error masking a regression.
      if (bothPlanesUnavailable(pgRes.err, duckRes.err)) {
        return {
          outcome: "ok",
          detail: "unavailable on both planes (module not run)",
          ...timing,
        };
      }
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
      record({
        check: "metric_info",
        ...(bothPlanesUnavailable(pgRes.err, duckRes.err)
          ? { outcome: "ok" as const, detail: "unavailable on both planes (module not run)" }
          : { outcome: "both_error" as const, detail: `pg=${pgRes.err} duck=${duckRes.err}` }),
        ...timing,
      });
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
      const indicatorMetadata = await getIndicatorMetadata(projectDb, moduleId);
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
        record({
          check: "replicant_options",
          ...(bothPlanesUnavailable(pgRes.err, duckRes.err)
            ? { outcome: "ok" as const, detail: "unavailable on both planes (module not run)" }
            : { outcome: "both_error" as const, detail: `pg=${pgRes.err} duck=${duckRes.err}` }),
          ...timing,
        });
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

    // ---- extended corpus (merge exit gate) ----
    // Shapes the stored corpus has none of: a blank-value filter (the
    // BLANK_SENTINEL fold + predicate), a multi-membership filter
    // (string_to_array overlap), and the plain-values HFA n path
    // (COUNT(DISTINCT facility_id) FILTER — every shipped HFA metric carries
    // a PAE, so that branch has no stored config).
    const moduleId = moduleRow!.module_id;
    const datasetFamily = await getDatasetFamilyForModule(projectDb, moduleId);
    const indicatorMetadata = await getIndicatorMetadata(projectDb, moduleId);
    const labelMap = new Map(indicatorMetadata.map((m) => [m.id, m.label]));
    const availableOpts = resultsValue.disaggregationOptions.map((d) => d.value);
    const roTextColumns = await getTextColumnNames(projectDb, roTableName);
    const valuesFor = async (disOpt: DisaggregationOption) => {
      const res = await getPossibleValues(
        projectDb, resultsValue.resultsObjectId, datasetFamily,
        disOpt as Parameters<typeof getPossibleValues>[3], mainDb, labelMap, [], undefined,
      );
      return res.success === true ? res.data : [];
    };
    const extendedVariants: { name: string; d: PresentationObjectConfig["d"] }[] = [];

    const blankOpt = availableOpts.find(
      (opt) => usesBlankSentinel(opt) && roTextColumns.has(opt) && opt !== replicateBy,
    );
    if (blankOpt) {
      markExtendedKindEligible("blankfilter");
      const realIds = (await valuesFor(blankOpt))
        .filter((v) => v.id !== BLANK_SENTINEL)
        .slice(0, 1)
        .map((v) => v.id);
      extendedVariants.push({
        name: `syn:blankfilter:${blankOpt}`,
        d: {
          ...config.d,
          filterBy: [
            ...config.d.filterBy.filter((f) => f.disOpt !== blankOpt),
            { disOpt: blankOpt, values: [BLANK_SENTINEL, ...realIds] },
          ],
        },
      });
    }

    if (availableOpts.includes("hfa_service_category")) {
      markExtendedKindEligible("multimember");
      const ids = (await valuesFor("hfa_service_category")).map((v) => v.id).slice(0, 2);
      if (ids.length > 0) {
        extendedVariants.push({
          name: "syn:multimember:hfa_service_category",
          d: {
            ...config.d,
            filterBy: [
              ...config.d.filterBy.filter((f) => f.disOpt !== "hfa_service_category"),
              { disOpt: "hfa_service_category", values: ids },
            ],
          },
        });
      }
    }

    // Only fetch-config CONSTRUCTION may drop a variant (unbuildable combo);
    // a runtime crash in runItemsPair must propagate to the per-PO catch and
    // record a GATING skip, exactly like the base synthetic loop above — else
    // an engine crash occurring only under these corpus shapes stays green.
    const runExtended = async (
      name: string,
      rv: ResultsValue,
      variantConfig: PresentationObjectConfig,
    ) => {
      let variantFetchConfig: GenericLongFormFetchConfig;
      try {
        const res = getFetchConfigFromPresentationObjectConfig(rv, variantConfig);
        if (res.success === false) {
          syntheticDropCount++;
          return;
        }
        variantFetchConfig = res.data;
      } catch (_e) {
        syntheticDropCount++;
        return;
      }
      allResults.push({
        projectId,
        poId,
        poLabel: `${poLabel} [${name}]`,
        check: "items_synthetic",
        ...(await runItemsPair(variantFetchConfig)),
      });
    };

    for (const variant of extendedVariants) {
      await runExtended(variant.name, resultsValue, { ...config, d: variant.d });
    }

    if (
      datasetFamily === "hfa" &&
      resultsValue.hasFacilityLevelRows &&
      resultsValue.postAggregationExpression
    ) {
      markExtendedKindEligible("nvalues");
      const plainResultsValue: ResultsValue = {
        ...resultsValue,
        postAggregationExpression: undefined,
        valueProps: resultsValue.postAggregationExpression.ingredientValues.map(
          (v) => v.prop,
        ),
        valueFunc: "SUM",
      };
      await runExtended("syn:nvalues:plain", plainResultsValue, {
        ...config,
        d: { ...config.d, valuesFilter: undefined },
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
      disaggregateBy: [
        {
          disOpt: adminOpt,
          disDisplayOpt: "series",
          rollup: true,
          rollupPosition: "bottom",
        },
      ],
      selectedReplicantValue: undefined,
    };
    if (
      getEffectiveRollupDimension(resultsValue, { ...config, d: dRollup }) !==
        undefined
    ) {
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
      // Legacy-gap exception (header): pg cannot serve an RO the package
      // serves fine, and the pg table provably does not exist — the legacy
      // plane never ingested this RO (pre-cutover fail-open drift). Probed
      // via to_regclass, never by matching error strings, so a transient pg
      // failure still gates.
      if (duckRes.success === true && pgRes.success === false) {
        const tableName = getResultsObjectTableName(ro.id);
        const reg = await projectDb<{ reg: string | null }[]>`
          SELECT to_regclass(${"public." + tableName})::text AS reg
        `;
        if (reg[0]?.reg === null) {
          record({
            outcome: "legacy_gap",
            detail:
              `legacy plane has no ${tableName} (pg: ${pgRes.err}); package serves ${ro.rowCount} rows`,
          });
          continue;
        }
      }
      record({
        outcome: "diff",
        detail: `one engine errored: pg=${pgRes.success ? "ok" : pgRes.err} duck=${duckRes.success ? "ok" : duckRes.err}`,
      });
      continue;
    }
    const pg = pgRes.data;
    const duck = duckRes.data;
    if (pg.status !== duck.status) {
      // pg table exists but is empty while the package serves rows: a legacy
      // gap ONLY if the package's full content matches the module's own
      // source CSV (independent read). Capped objects can't be verified that
      // way — they stay gating.
      if (
        pg.status === "no_data_available" && duck.status === "ok" && !capped
      ) {
        const src = await loadLegacySourceCsvMultiset(
          projectId,
          ro.moduleId,
          ro.id,
          Object.keys(
            (duck.items[0] ?? {}) as Record<string, unknown>,
          ).sort(),
        );
        if (
          src &&
          duckMatchesSource(
            duck.items as Record<string, unknown>[],
            src,
          )
        ) {
          record({
            outcome: "legacy_gap",
            detail:
              `pg table empty; package matches the module source CSV (${src.rowCount} rows)`,
          });
          continue;
        }
      }
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
      if (!capped) {
        const src = await loadLegacySourceCsvMultiset(
          projectId,
          ro.moduleId,
          ro.id,
          Object.keys(
            (duck.items[0] ?? {}) as Record<string, unknown>,
          ).sort(),
        );
        if (
          src &&
          duckMatchesSource(duck.items as Record<string, unknown>[], src)
        ) {
          record({
            outcome: "legacy_gap",
            detail:
              `pg has ${pg.totalCount} rows, package ${duck.totalCount} — package matches the module source CSV exactly`,
          });
          continue;
        }
      }
      record({ outcome: "diff", detail: `totalCount: pg=${pg.totalCount} duck=${duck.totalCount}` });
      continue;
    }
    if (capped) {
      // The LIMIT-1 rows are arbitrary on both engines (no ORDER BY), so
      // content must not be compared — schema only.
      const pgCols = Object.keys(pg.items[0] ?? {}).sort().join(",");
      const duckCols = Object.keys(duck.items[0] ?? {}).sort().join(",");
      if (pgCols !== duckCols) {
        record({ outcome: "diff", detail: `columns: pg=[${pgCols}] duck=[${duckCols}]` });
        continue;
      }
      console.log(
        `   raw_preview ${ro.id}: content diff capped (${ro.rowCount} rows > ${RAW_PREVIEW_FULL_DIFF_MAX_ROWS}) — totalCount + schema only`,
      );
      record({ outcome: "ok", detail: `content capped at ${ro.rowCount} rows: count+schema only` });
      continue;
    }
    const contentDiff = diffRawRowMultisets(
      pg.items as Record<string, unknown>[],
      duck.items as Record<string, unknown>[],
    );
    if (contentDiff === undefined) {
      record({ outcome: "ok" });
      continue;
    }
    if (contentDiff.kind === "mismatch") {
      record({ outcome: "diff", detail: contentDiff.message });
      continue;
    }
    // Row-level divergence: legacy gap ONLY when the package side is fully
    // vouched for by the module's own source CSV — every disputed package row
    // present in it, every disputed pg row absent from it (pg stale).
    const src = await loadLegacySourceCsvMultiset(
      projectId,
      ro.moduleId,
      ro.id,
      contentDiff.cols,
    );
    const fmtKey = (k: string) =>
      k.replaceAll(RAW_ROW_KEY_SEP, " | ").slice(0, 200);
    if (
      src &&
      contentDiff.duckOnly.every((k) => (src.counts.get(k) ?? 0) > 0) &&
      contentDiff.pgOnly.every((k) => (src.counts.get(k) ?? 0) === 0)
    ) {
      record({
        outcome: "legacy_gap",
        detail: `pg stale vs module source CSV: ${contentDiff.pgOnly.length} pg-only row(s) absent from the CSV, ${contentDiff.duckOnly.length} package row(s) present in it (pg e.g. ${
          fmtKey(contentDiff.pgOnly[0] ?? "")
        } | package e.g. ${fmtKey(contentDiff.duckOnly[0] ?? "")})`,
      });
      continue;
    }
    // RO id collision (found at sierraleone m004/m005): two modules emit the
    // SAME results-object filename with different content. Both planes then
    // arbitrate arbitrarily — legacy pg has one table (last ingest wins), the
    // run read layer resolves the id to one manifest entry — so cross-plane
    // comparison is ill-defined. Non-gating ONLY when the served content
    // exactly matches a colliding sibling module's own CSV; the collision
    // itself is a modules-repo defect to fix (rename one output).
    const siblings = runCtx.manifest.resultsObjects.filter(
      (other) => other.id === ro.id && other.moduleId !== ro.moduleId,
    );
    let collisionMatch: string | undefined;
    for (const sibling of siblings) {
      const siblingSrc = await loadLegacySourceCsvMultiset(
        projectId,
        sibling.moduleId,
        sibling.id,
        contentDiff.cols,
      );
      if (
        siblingSrc &&
        duckMatchesSource(duck.items as Record<string, unknown>[], siblingSrc)
      ) {
        collisionMatch = sibling.moduleId;
        break;
      }
    }
    if (collisionMatch !== undefined) {
      record({
        outcome: "legacy_gap",
        detail: `RO id collision: ${ro.id} is emitted by both ${ro.moduleId} and ${collisionMatch}; the package serves ${collisionMatch}'s copy (matches its CSV exactly) while legacy pg resolved the collision differently. FIX THE MODULES REPO (duplicate output filename).`,
      });
      continue;
    }
    record({
      outcome: "diff",
      detail: `rows diverge (pg-only=${contentDiff.pgOnly.length}, duck-only=${contentDiff.duckOnly.length}; duck e.g. ${
        fmtKey(contentDiff.duckOnly[0] ?? contentDiff.pgOnly[0] ?? "")
      })`,
    });
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

const RAW_ROW_KEY_SEP = "\u0001";

type RawRowMultisetDiff =
  | { kind: "mismatch"; message: string }
  | { kind: "rows"; cols: string[]; duckOnly: string[]; pgOnly: string[] };

function diffRawRowMultisets(
  pgItems: Record<string, unknown>[],
  duckItems: Record<string, unknown>[],
): RawRowMultisetDiff | undefined {
  if (pgItems.length !== duckItems.length) {
    return {
      kind: "mismatch",
      message: `row count: pg=${pgItems.length} duck=${duckItems.length}`,
    };
  }
  if (pgItems.length === 0) {
    return undefined;
  }
  const pgCols = Object.keys(pgItems[0]).sort();
  const duckCols = Object.keys(duckItems[0]).sort();
  if (pgCols.join(",") !== duckCols.join(",")) {
    return {
      kind: "mismatch",
      message: `columns: pg=[${pgCols}] duck=[${duckCols}]`,
    };
  }
  const rowKey = (row: Record<string, unknown>) =>
    pgCols.map((c) => canonicalizeRawCell(row[c])).join(RAW_ROW_KEY_SEP);
  const counts = new Map<string, number>();
  for (const row of pgItems) {
    const key = rowKey(row);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const duckOnly: string[] = [];
  for (const row of duckItems) {
    const key = rowKey(row);
    const n = counts.get(key);
    if (n === undefined) {
      duckOnly.push(key);
      continue;
    }
    if (n === 1) {
      counts.delete(key);
    } else {
      counts.set(key, n - 1);
    }
  }
  const pgOnly: string[] = [];
  for (const [key, n] of counts) {
    for (let i = 0; i < n; i++) {
      pgOnly.push(key);
    }
  }
  if (duckOnly.length === 0 && pgOnly.length === 0) {
    return undefined;
  }
  return { kind: "rows", cols: pgCols, duckOnly, pgOnly };
}

// ── Legacy-gap tiebreak: the module's source CSV, read independently ────────
//
// The package parquet was produced FROM this CSV by finalize, so package≡CSV
// is only evidence when established by an INDEPENDENT read — the rig parses
// the raw CSV itself and re-applies the ingest/finalize value contract
// (SYSTEM_08): "NA" and "" are NULL; 6-digit quarter_id → 5-digit; helper
// columns dropped (projection to the compared column set). A finalize bug
// therefore cannot vouch for itself and stays a gating diff. An unreadable
// or column-mismatched CSV returns undefined, which every caller records as
// a GATING outcome — degradation is loud, never a pass.
function canonicalizeCsvCell(col: string, v: string | undefined): string {
  if (v === undefined || v === "" || v === "NA") {
    return " NULL";
  }
  if (col === "quarter_id") {
    const n = Number(v);
    if (!Number.isNaN(n) && n >= 100000) {
      return String(Math.floor(n / 100) * 10 + (n % 100));
    }
  }
  return canonicalizeRawCell(v);
}

type SourceCsvMultiset = { rowCount: number; counts: Map<string, number> };

async function loadLegacySourceCsvMultiset(
  projectId: string,
  moduleId: string,
  fileName: string,
  cols: string[],
): Promise<SourceCsvMultiset | undefined> {
  const path = join(_SANDBOX_DIR_PATH, projectId, moduleId, fileName);
  let records: Record<string, string | undefined>[];
  try {
    const text = await Deno.readTextFile(path);
    records = parseCsv(text, { skipFirstRow: true }) as Record<
      string,
      string | undefined
    >[];
  } catch {
    // Missing/unparseable source CSV — callers keep the gating diff.
    return undefined;
  }
  if (records.length > 0 && cols.some((c) => !(c in records[0]))) {
    return undefined;
  }
  const counts = new Map<string, number>();
  for (const row of records) {
    const key = cols.map((c) => canonicalizeCsvCell(c, row[c])).join(
      RAW_ROW_KEY_SEP,
    );
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return { rowCount: records.length, counts };
}

// Full-content match: the package's rows are exactly the source CSV's rows
// (multiset equality over the package's column set).
function duckMatchesSource(
  duckItems: Record<string, unknown>[],
  src: SourceCsvMultiset,
): boolean {
  if (duckItems.length !== src.rowCount) {
    return false;
  }
  if (duckItems.length === 0) {
    return true;
  }
  const cols = Object.keys(duckItems[0]).sort();
  const remaining = new Map(src.counts);
  for (const row of duckItems) {
    const key = cols.map((c) => canonicalizeRawCell(row[c])).join(
      RAW_ROW_KEY_SEP,
    );
    const n = remaining.get(key);
    if (n === undefined) {
      return false;
    }
    if (n === 1) {
      remaining.delete(key);
    } else {
      remaining.set(key, n - 1);
    }
  }
  return remaining.size === 0;
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
      // Same evidence class as the raw_preview to_regclass probe: the pg
      // table is provably absent/empty (information_schema facts above) while
      // the package's synthesis-time stamp says ready — the legacy plane
      // never ingested this RO. The reverse direction (pg ready, manifest
      // unavailable = the package LOST data) stays a gating diff.
      const pgPlaneLacksTable = pgStatus.reason === "no ro table in pg" ||
        pgStatus.reason === "ro table has no rows";
      if (manifestStatus === "ready" && pgPlaneLacksTable) {
        record({
          outcome: "legacy_gap",
          detail: `package stamps ready; legacy plane has no data (${pgStatus.reason})`,
        });
      } else {
        record({
          outcome: "diff",
          detail: `manifest=${manifestStatus}(${mm.statusReason ?? ""}) pg=${pgStatus.status}(${pgStatus.reason})`,
        });
      }
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

// ── Whether the pg baseline is an oracle for this attachment (ruling 4) ──────

// Parity is only defined where Postgres describes the SAME generation act as
// the attached package. With the dual-write gone, that is exactly a project's
// own backfill run: `synthesizeRunForProject` is the only writer that stamps
// `backfillSourceProjectId`, and it stamps the project it copied the pg/sandbox
// state FROM. So:
//   - stamp === this project  → gate it (the checks run)
//   - stamp is null (wizard)  → `foreign_run`, non-gating, printed
//   - stamp is ANOTHER project → `foreign_run` too; the pg baseline here is a
//     different project's data, which would diff for reasons that say nothing
//     about the read path
// An unreadable or absent summary is NOT a foreign run — it is a broken
// catalog row that cannot establish either verdict, so it stays a gating skip
// rather than quietly buying the project an exemption.
function pgOracleVerdict(
  projectId: string,
  runSummary: string | null,
): "own_backfill_run" | { outcome: Outcome; detail: string } {
  if (runSummary === null) {
    return {
      outcome: "skip",
      detail: "attached run has no catalog summary — cannot establish a pg oracle",
    };
  }
  let backfillSourceProjectId: unknown;
  try {
    backfillSourceProjectId = (JSON.parse(runSummary) as RunSummary)
      .backfillSourceProjectId;
  } catch (e) {
    return {
      outcome: "skip",
      detail: `attached run summary is unreadable: ${(e as Error).message}`,
    };
  }
  if (backfillSourceProjectId === projectId) {
    return "own_backfill_run";
  }
  return {
    outcome: "foreign_run",
    detail: backfillSourceProjectId === null || backfillSourceProjectId === undefined
      ? "attached package was generated by the wizard — no pg oracle for it"
      : `attached package is another project's backfill run (${
        String(backfillSourceProjectId).slice(0, 8)
      }) — no pg oracle for it`,
  };
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const workDirRoot = Deno.env.get("PARITY_WORK_DIR") ?? (await Deno.makeTempDir({ prefix: "parity_" }));
  console.log(`Parquet work dir: ${workDirRoot}${keepWorkDir ? " (kept)" : ""}`);

  const mainDb = getPgConnection("main", { max: 4 });
  const projects = await mainDb<
    {
      id: string;
      label: string;
      status: string;
      run_id: string | null;
      run_summary: string | null;
    }[]
  >`
SELECT p.id, p.label, p.status, p.run_id, r.summary AS run_summary
FROM projects p
LEFT JOIN runs r ON r.id = p.run_id
ORDER BY p.label
`;
  const targets = projects.filter(
    (p) => p.status === "ready" && (!onlyProjectId || p.id === onlyProjectId),
  );
  console.log(`Projects: ${targets.length} (of ${projects.length})`);

  let gatedProjectCount = 0;
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
      const oracle = pgOracleVerdict(project.id, project.run_summary);
      if (oracle !== "own_backfill_run") {
        console.log(
          `\n── ${project.label} (${project.id.slice(0, 8)}): ${
            oracle.outcome === "foreign_run" ? "FOREIGN RUN — NOT GATED" : "GATING"
          } (${oracle.detail})`,
        );
        allResults.push({
          projectId: project.id,
          poId: "-",
          poLabel: project.label,
          check: "items",
          ...oracle,
        });
        continue;
      }
      runCtx = {
        runId: project.run_id,
        runDir: runDirPath(project.run_id),
        manifest: await getRunManifestCached(project.run_id),
      };
    }
    gatedProjectCount++;
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

  // The extended kinds each hang on a handful of dev metrics — a corpus
  // change (module uninstall, config edit) could zero them silently and the
  // verdict would still read GREEN. Their absence gates in --run mode — but
  // only when something was actually gated: with every project on a foreign
  // run (ruling 4) no variant of any kind runs, and reporting that as a
  // corpus regression would name the wrong cause. That case is surfaced by
  // the verdict line's project accounting instead.
  // Gate only kinds some gated metric was ELIGIBLE for: eligible-but-zero-ran
  // is a corpus regression; zero-eligible means this instance's data simply
  // cannot exercise the kind (normal on small / non-HFA instances) — printed,
  // never gating.
  const missingExtendedKinds = useRun && gatedProjectCount > 0
    ? ["blankfilter", "multimember", "nvalues"].filter(
        (kind) =>
          (extendedKindEligible.get(kind) ?? 0) > 0 &&
          (synKinds.get(kind) ?? 0) === 0,
      )
    : [];
  if (missingExtendedKinds.length > 0) {
    console.log(
      `\nEXTENDED CORPUS MISSING (gating — eligible metrics exist but these variant kinds ran zero times): ${missingExtendedKinds.join(", ")}`,
    );
  }
  const ineligibleExtendedKinds = useRun && gatedProjectCount > 0
    ? ["blankfilter", "multimember", "nvalues"].filter(
        (kind) => (extendedKindEligible.get(kind) ?? 0) === 0,
      )
    : [];
  if (ineligibleExtendedKinds.length > 0) {
    console.log(
      `\nEXTENDED KINDS NOT EXERCISABLE on this instance (no eligible metric; non-gating): ${ineligibleExtendedKinds.join(", ")}`,
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
  const brokenConfigs = allResults.filter((r) => r.outcome === "broken_config");
  if (brokenConfigs.length > 0) {
    console.log(
      `\nBROKEN CONFIGS (${brokenConfigs.length} — plane-independent user data, same typed error on both planes; non-gating):`,
    );
    for (const b of brokenConfigs) {
      console.log(`  [${b.projectId.slice(0, 8)}] "${b.poLabel}" (${b.poId}): ${b.detail}`);
    }
  }
  const legacyGaps = allResults.filter((r) => r.outcome === "legacy_gap");
  if (legacyGaps.length > 0) {
    console.log(
      `\nLEGACY GAPS (${legacyGaps.length} — pre-cutover pg drift, package vouched by table probe or source CSV; non-gating):`,
    );
    for (const g of legacyGaps) {
      console.log(`  [${g.projectId.slice(0, 8)}] ${g.check} "${g.poLabel}" (${g.poId}): ${g.detail}`);
    }
  }
  const foreignRuns = allResults.filter((r) => r.outcome === "foreign_run");
  if (foreignRuns.length > 0) {
    console.log(
      `\nFOREIGN RUNS (${foreignRuns.length} project${
        foreignRuns.length === 1 ? "" : "s"
      } NOT GATED — no pg oracle for the attached package, ruling 4; non-gating):`,
    );
    for (const f of foreignRuns) {
      console.log(`  [${f.projectId.slice(0, 8)}] "${f.poLabel}": ${f.detail}`);
    }
  }

  if (!keepWorkDir && !Deno.env.get("PARITY_WORK_DIR")) {
    await Deno.remove(workDirRoot, { recursive: true });
  }
  await mainDb.end();
  const gatingCount =
    diffs.length + bothErrors.length + skips.length + missingExtendedKinds.length;
  // In --run mode GREEN must never be readable as "everything was checked":
  // foreign-run projects are not gated, so the verdict states how many
  // projects it actually gated. Zero gated projects is a legitimate state
  // (every attachment regenerated) and stays non-RED, but it is the loudest
  // thing on the line.
  const accounting = useRun
    ? ` (${gatedProjectCount} of ${targets.length} projects gated${
      foreignRuns.length > 0 ? `, ${foreignRuns.length} on a foreign run` : ""
    }${
      legacyGaps.length > 0 ? `, ${legacyGaps.length} legacy gap(s)` : ""
    }${
      brokenConfigs.length > 0
        ? `, ${brokenConfigs.length} broken config(s)`
        : ""
    })${gatedProjectCount === 0 ? " — NOTHING WAS GATED" : ""}`
    : "";
  console.log(
    gatingCount === 0
      ? `\nPARITY GREEN${accounting}`
      : `\nPARITY RED: ${diffs.length} diffs, ${bothErrors.length} both_error, ${skips.length} skips, ${missingExtendedKinds.length} missing extended kinds${accounting}`,
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
        (count("legacy_gap") > 0 ? ` legacy_gap=${count("legacy_gap")}` : "") +
        (count("broken_config") > 0 ? ` broken_config=${count("broken_config")}` : "") +
        (count("foreign_run") > 0 ? ` foreign_run=${count("foreign_run")}` : "") +
        ` | median pg=${med(timed.map((r) => r.pgMs!)).toFixed(0)}ms duck=${med(timed.map((r) => r.duckMs!)).toFixed(0)}ms`,
    );
  }
}

await main();
