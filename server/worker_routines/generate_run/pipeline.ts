import { join } from "@std/path";
import type { Sql } from "postgres";
import { throwIfErrWithData, type RunProgress } from "lib";
import {
  getAllModulesForProject,
  getCountryIso3Config,
  getFacilityColumnsConfig,
  getMetricsWithStatus,
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
  notifyProjectModulesUpdated,
  notifyProjectRunAttached,
  notifyProjectRunProgress,
} from "../../task_management/notify_project_v2.ts";
import { executeRunModule } from "./execute_module.ts";
import { prepareRunInputs } from "./prepare_inputs.ts";
import { resolveRunModules } from "./resolve_modules.ts";
import type { GenerateRunStartData } from "./types.ts";

// The run pipeline (PLAN_RESULTS_RUNS item 2): prepare inputs → resolve →
// execute in dependency order → ONE finalize → atomic rename → ready +
// repoint in one transaction → SSE. Whole-DAG with abort-on-any-fail: no
// mid-run file is ever in a serving location, and a failed generation never
// replaces the serving run. Item 2 forces every node to execute (the
// resolve-reuse diff is item 3); inputKeys and output hashes are computed
// and recorded from the first wizard run so reuse has real baselines.

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
  await pushProgress();

  const memo = new Map<
    string,
    { inputKey: string; outputFileHashes: Record<string, string> }
  >();
  const upstreamOutputHashes = new Map<string, Record<string, string>>();
  for (const mod of resolved) {
    progress.currentModuleId = mod.moduleId;
    progress.moduleStatus[mod.moduleId] = "running";
    await pushProgress();
    const result = await executeRunModule({
      projectDb,
      projectId: std.projectId,
      runId: std.runId,
      tmpDir,
      module: mod,
      facilityColumns: resFacilityColumns.data,
      datasetExtractHashes: prepared.datasetExtractHashes,
      upstreamOutputHashes,
    });
    memo.set(mod.moduleId, result);
    upstreamOutputHashes.set(mod.moduleId, result.outputFileHashes);
    progress.moduleStatus[mod.moduleId] = "done";
    await pushProgress();
  }
  progress.currentModuleId = null;

  // ONE finalize (§3.8): wholesale manifest + inputs capture via the shared
  // package builder, reading the catalog the dual-write just wrote and the
  // raw CSVs the modules wrote inside this run.
  const { summary } = await buildRunPackageIntoTmp(
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

  // Repoint event: the new catalog, live (also serves today's module-card
  // surfaces until item 5 re-points them to the run summary).
  const [modulesRes, metricsRes] = await Promise.all([
    getAllModulesForProject(projectDb),
    getMetricsWithStatus(mainDb, projectDb),
  ]);
  if (modulesRes.success && metricsRes.success) {
    notifyProjectRunAttached(
      std.projectId,
      std.runId,
      modulesRes.data,
      metricsRes.data,
    );
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
    notifyProjectModulesUpdated(
      std.projectId,
      modulesRes.data,
      metricsRes.data,
      commonIndicators,
      icehIndicators,
    );
  }
}
