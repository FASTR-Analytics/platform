import { join } from "@std/path";
import type { Sql } from "postgres";
import { throwIfErrWithData, type RunProgress } from "lib";
import {
  getAllDatasetsForProject,
  getCountryIso3Config,
  getFacilityColumnsConfig,
} from "../../db/mod.ts";
import {
  publishReadyRun,
  updateRunProgress,
} from "../../db/instance/run_generation.ts";
import {
  buildRunPackageIntoTmp,
  runDirPath,
  runTmpDirPath,
} from "../../runs/mod.ts";
import {
  getMetricsWithStatusFromManifest,
  getModuleSummariesFromManifest,
} from "../../run_query/mod.ts";
import {
  notifyProjectRunAttached,
  notifyProjectRunProgress,
} from "../../task_management/notify_project_v2.ts";
import {
  executeRunModule,
  ReuseSourceMissingError,
  reuseRunModule,
} from "./execute_module.ts";
import { prepareRunInputs } from "./prepare_inputs.ts";
import { resolveRunModules } from "./resolve_modules.ts";
import {
  baseEntryForReuse,
  computeModuleInputs,
  computeModuleKey,
  planReuse,
  resolveBaseRun,
} from "./resolve_reuse.ts";
import type { GenerateRunStartData } from "./types.ts";

// The run pipeline (PLAN_RESULTS_RUNS items 2 + 3): prepare inputs → resolve
// → reuse plan → execute/reuse in dependency order → ONE finalize → atomic
// rename → ready + repoint in one transaction → SSE. Whole-DAG with
// abort-on-any-fail: no mid-run file is ever in a serving location, and a
// failed generation never replaces the serving run.
//
// Memoized generation (§3.7): the reuse plan resolves as the first stage
// after resolve — per-module reused / will-run pushed to the progress view
// before anything executes. The plan is a pessimistic prediction; the loop
// below makes the authoritative per-module decision from ACTUAL upstream
// hashes, so a prediction can only be upgraded (pending → reused, when a
// re-executed upstream produced byte-identical outputs), and the one
// downgrade path — a base output file gone missing — falls back to a real
// run with the status visibly correcting itself. Fails closed throughout.

export async function runGenerationPipeline(
  mainDb: Sql,
  projectDb: Sql,
  std: GenerateRunStartData,
): Promise<void> {
  const tmpDir = runTmpDirPath(std.runId);
  const progress: RunProgress = {
    moduleOrder: std.step2Result.modules.map((m) => m.moduleId),
    moduleStatus: Object.fromEntries(
      std.step2Result.modules.map((m) => [m.moduleId, "pending" as const]),
    ),
    currentModuleId: null,
    errorDetail: null,
  };
  const pushProgress = async () => {
    await updateRunProgress(mainDb, std.runId, progress);
    notifyProjectRunProgress(std.projectId, std.runId, progress);
  };

  const resFacilityColumns = await getFacilityColumnsConfig(mainDb);
  throwIfErrWithData(resFacilityColumns);
  const resCountryIso3 = await getCountryIso3Config(mainDb);
  throwIfErrWithData(resCountryIso3);

  const prepared = await prepareRunInputs(
    mainDb,
    projectDb,
    std.projectId,
    std.step1Result,
    tmpDir,
  );

  const resolved = await resolveRunModules(
    mainDb,
    projectDb,
    prepared.selectedFamilies,
    std.step2Result,
    resCountryIso3.data.countryIso3,
  );
  progress.moduleOrder = resolved.map((m) => m.moduleId);

  const base = await resolveBaseRun(mainDb, std.projectId);
  const assetHashCache = new Map<string, string>();
  const planned = await planReuse(
    resolved,
    base,
    prepared.datasetExtractHashes,
    assetHashCache,
  );
  for (const mod of resolved) {
    progress.moduleStatus[mod.moduleId] = planned.has(mod.moduleId)
      ? "reused"
      : "pending";
  }
  await pushProgress();

  const memo = new Map<
    string,
    { inputKey: string; outputFileHashes: Record<string, string> }
  >();
  const upstreamOutputHashes = new Map<string, Record<string, string>>();
  for (const mod of resolved) {
    progress.currentModuleId = mod.moduleId;
    const inputs = await computeModuleInputs(
      mod,
      prepared.datasetExtractHashes,
      upstreamOutputHashes,
      assetHashCache,
    );
    const inputKey = computeModuleKey(mod, inputs);

    let result:
      | { inputKey: string; outputFileHashes: Record<string, string> }
      | null = null;
    const baseEntry = base !== null
      ? baseEntryForReuse(base, mod, inputKey)
      : null;
    if (base !== null && baseEntry !== null) {
      progress.moduleStatus[mod.moduleId] = "reused";
      await pushProgress();
      try {
        result = await reuseRunModule({
          projectDb,
          projectId: std.projectId,
          tmpDir,
          module: mod,
          facilityColumns: resFacilityColumns.data,
          baseRunId: base.runId,
          baseRunDir: base.runDir,
          inputKey,
          outputFileHashes: baseEntry.outputFileHashes,
        });
      } catch (e) {
        if (!(e instanceof ReuseSourceMissingError)) throw e;
        console.error(`[generate_run] ${e.message} — running instead`);
      }
    }
    if (result === null) {
      progress.moduleStatus[mod.moduleId] = "running";
      await pushProgress();
      result = await executeRunModule({
        projectDb,
        projectId: std.projectId,
        runId: std.runId,
        tmpDir,
        module: mod,
        facilityColumns: resFacilityColumns.data,
        inputKey,
      });
      progress.moduleStatus[mod.moduleId] = "done";
    }
    memo.set(mod.moduleId, result);
    upstreamOutputHashes.set(mod.moduleId, result.outputFileHashes);
    await pushProgress();
  }
  progress.currentModuleId = null;

  // ONE finalize (§3.8): wholesale manifest + inputs capture via the shared
  // package builder, reading the catalog the dual-write just wrote and the
  // raw CSVs the modules wrote inside this run.
  const { manifest, summary } = await buildRunPackageIntoTmp(
    mainDb,
    projectDb,
    std.projectId,
    std.runId,
    tmpDir,
    {
      label: std.label,
      provenance: "wizard",
      moduleIds: resolved.map((m) => m.moduleId),
      moduleMemo: memo,
      moduleCsvDir: (moduleId) => join(tmpDir, "outputs", moduleId),
      extraInputFiles: prepared.extraInputFiles,
    },
  );

  await Deno.rename(tmpDir, runDirPath(std.runId));
  await publishReadyRun(mainDb, {
    runId: std.runId,
    projectId: std.projectId,
    summary,
    progress,
  });
  notifyProjectRunProgress(std.projectId, std.runId, progress);

  // Repoint event: the full run-derived catalog, live — modules/metrics from
  // the just-built manifest, datasets/indicators from the dual-write plane
  // this generation freshened (byte-current by construction).
  const datasetsRes = await getAllDatasetsForProject(projectDb);
  const commonIndicators = (
    await projectDb<
      { indicator_common_id: string; indicator_common_label: string }[]
    >`
SELECT indicator_common_id, indicator_common_label FROM indicators
ORDER BY indicator_common_label
`
  ).map((row) => ({
    id: row.indicator_common_id,
    label: row.indicator_common_label,
  }));
  const icehIndicators = (
    await projectDb<
      { iceh_indicator: string; indicator_name: string; category: string }[]
    >`
SELECT iceh_indicator, indicator_name, category FROM iceh_indicators_snapshot
ORDER BY sort_order, iceh_indicator
`
  ).map((row) => ({
    id: row.iceh_indicator,
    label: row.indicator_name,
    category: row.category,
  }));
  notifyProjectRunAttached(std.projectId, {
    attachedRunId: std.runId,
    projectModules: getModuleSummariesFromManifest(manifest),
    metrics: getMetricsWithStatusFromManifest(manifest),
    projectDatasets: datasetsRes.success ? datasetsRes.data : [],
    commonIndicators,
    icehIndicators,
  });
}
