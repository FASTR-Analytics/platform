import { join } from "@std/path";
import type { Sql } from "postgres";
import {
  getDatasetFamily,
  metricStrict,
  throwIfErrWithData,
  type RunMetric,
  type RunModule,
  type RunProgress,
} from "lib";
import { getCountryIso3Config } from "../../db/mod.ts";
import { prepareModuleDefinitionForStorage } from "../../db/project/modules.ts";
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
  getAllPresentationObjectsWithVirtualDefaults,
  getCommonIndicatorsFromManifestInputs,
  getIcehIndicatorsFromManifestInputs,
  getMetricsWithStatusFromManifest,
  getModuleSummariesFromManifest,
  getProjectDatasetsFromManifest,
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
import { resolveRunModules, type ResolvedRunModule } from "./resolve_modules.ts";
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

  const resCountryIso3 = await getCountryIso3Config(mainDb);
  throwIfErrWithData(resCountryIso3);

  const prepared = await prepareRunInputs(mainDb, std.step1Result, std.runId);

  const resolved = await resolveRunModules(
    mainDb,
    prepared,
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
          projectId: std.projectId,
          tmpDir,
          module: mod,
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
        projectId: std.projectId,
        runId: std.runId,
        tmpDir,
        module: mod,
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
  // package builder. Under the no-dual-write model (Phase 3 re-cut ruling 5)
  // the catalog is handed to the builder from THIS generation's resolved
  // definitions — no project-DB round trip — and the input mirrors were
  // written by prepare.
  const { manifest, summary } = await buildRunPackageIntoTmp(
    mainDb,
    std.runId,
    tmpDir,
    {
      label: std.label,
      provenance: "wizard",
      source: {
        kind: "captured",
        modules: buildRunModules(resolved, memo),
        metrics: buildRunMetrics(resolved),
        datasets: prepared.datasets,
        facilitiesTables: prepared.facilitiesTables,
      },
      sourceProjectId: std.projectId,
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

  // Repoint event: the full catalog, every field derived from the run just
  // published (the legacy project plane is no longer written, so it is never
  // read here either).
  const runCtx = { runId: std.runId, manifest };
  const visualizationsRes = await getAllPresentationObjectsWithVirtualDefaults(
    mainDb,
    std.projectId,
    projectDb,
  );
  notifyProjectRunAttached(std.projectId, {
    attachedRunId: std.runId,
    projectModules: getModuleSummariesFromManifest(manifest),
    metrics: getMetricsWithStatusFromManifest(manifest),
    projectDatasets: getProjectDatasetsFromManifest(manifest),
    commonIndicators: await getCommonIndicatorsFromManifestInputs(runCtx),
    icehIndicators: await getIcehIndicatorsFromManifestInputs(runCtx),
    visualizations: visualizationsRes.success ? visualizationsRes.data : [],
  });
}

// The manifest's module/metric catalog for a wizard generation: the resolved
// definitions and frozen selections themselves, in the shapes the manifest
// stores (installModule's row shapes, minus the round trip through Postgres).
function buildRunModules(
  resolved: ResolvedRunModule[],
  memo: Map<string, { inputKey: string; outputFileHashes: Record<string, string> }>,
): RunModule[] {
  const now = new Date().toISOString();
  return resolved.map((mod) => {
    const entry = memo.get(mod.moduleId);
    return {
      id: mod.moduleId,
      moduleDefinition: prepareModuleDefinitionForStorage(mod.detail),
      configSelections: JSON.stringify(mod.configSelections),
      lastRunAt: now,
      lastRunGitRef: mod.gitRef,
      inputKey: entry?.inputKey ?? null,
      outputFileHashes: entry?.outputFileHashes ?? null,
    };
  });
}

function buildRunMetrics(resolved: ResolvedRunModule[]): RunMetric[] {
  const metrics: RunMetric[] = [];
  for (const mod of resolved) {
    const datasetFamily = getDatasetFamily(
      prepareModuleDefinitionForStorage(mod.detail),
    ) ?? null;
    for (const metric of mod.detail.metrics) {
      const m = metricStrict.parse(metric);
      metrics.push({
        datasetFamily,
        id: m.id,
        module_id: mod.moduleId,
        label: m.label,
        variant_label: m.variantLabel,
        value_func: m.valueFunc,
        format_as: m.formatAs,
        value_props: JSON.stringify(m.valueProps),
        required_disaggregation_options: JSON.stringify(
          m.requiredDisaggregationOptions,
        ),
        value_label_replacements: m.valueLabelReplacements
          ? JSON.stringify(m.valueLabelReplacements)
          : null,
        post_aggregation_expression: m.postAggregationExpression
          ? JSON.stringify(m.postAggregationExpression)
          : null,
        results_object_id: m.resultsObjectId,
        ai_description: m.aiDescription ? JSON.stringify(m.aiDescription) : null,
        viz_presets: JSON.stringify(m.vizPresets),
        hide: m.hide,
        important_notes: m.importantNotes,
      });
    }
  }
  return metrics;
}
