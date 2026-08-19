import { join } from "@std/path";
import type { Sql } from "postgres";
import {
  getDatasetFamily,
  metricStrict,
  type RunMetric,
  type RunModule,
  type RunProgress,
} from "lib";
import { _INSTANCE_COUNTRY_ISO3 } from "../../exposed_env_vars.ts";
import { prepareModuleDefinitionForStorage } from "../../runs/module_config.ts";
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
  executeRunModule,
  ReuseSourceMissingError,
  reuseRunModule,
} from "./execute_module.ts";
import { notifyInstanceRunProgress } from "../../task_management/notify_instance_updated.ts";
import { prepareRunInputs } from "./prepare_inputs.ts";
import { resolveRunModules, type ResolvedRunModule } from "./resolve_modules.ts";
import {
  computeModuleInputs,
  computeModuleKey,
  createReuseSearch,
  planReuse,
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
    notifyInstanceRunProgress(std.runId, progress);
  };

  const prepared = await prepareRunInputs(mainDb, std.step1Result, std.runId);

  const resolved = await resolveRunModules(
    mainDb,
    prepared,
    std.step2Result,
    _INSTANCE_COUNTRY_ISO3,
  );
  progress.moduleOrder = resolved.map((m) => m.moduleId);

  const reuseSearch = await createReuseSearch(mainDb);
  const assetHashCache = new Map<string, string>();
  const planned = await planReuse(
    resolved,
    reuseSearch,
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
    const reuseSource = await reuseSearch.find(mod, inputKey);
    if (reuseSource !== null) {
      progress.moduleStatus[mod.moduleId] = "reused";
      await pushProgress();
      try {
        result = await reuseRunModule({
          runId: std.runId,
          tmpDir,
          module: mod,
          sourceRunId: reuseSource.runId,
          sourceRunDir: reuseSource.runDir,
          inputKey,
          outputFileHashes: reuseSource.outputFileHashes,
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

  // ONE finalize (§3.8): wholesale manifest + inputs capture via the package
  // builder. The catalog is handed to the builder from THIS generation's
  // resolved definitions, and the input mirrors were written by prepare.
  const { summary } = await buildRunPackageIntoTmp(
    mainDb,
    std.runId,
    tmpDir,
    {
      label: std.label,
      provenance: "wizard",
      source: {
        modules: buildRunModules(resolved, memo),
        metrics: buildRunMetrics(resolved),
        datasets: prepared.datasets,
        facilitiesTables: prepared.facilitiesTables,
      },
      moduleMemo: memo,
      moduleCsvDir: (moduleId) => join(tmpDir, "outputs", moduleId),
      extraInputFiles: prepared.extraInputFiles,
    },
  );

  await Deno.rename(tmpDir, runDirPath(std.runId));
  await publishReadyRun(mainDb, { runId: std.runId, summary, progress });

  // The publish is the whole ending: a generation PRODUCES a package and
  // repoints nothing (D5), so there is no per-product event to fan out —
  // products acquire this package later, from their own picker. The final
  // progress push is what tells the catalogue the generation is over.
  //
  // The run IS published from here on, so a notify failure must never fail
  // the generation (worker.ts's catch would flip a published run to
  // 'failed'): log and continue, and the catalogue self-corrects on the next
  // reconnect.
  try {
    notifyInstanceRunProgress(std.runId, progress);
  } catch (e) {
    console.error(
      `[generate_run] run ${std.runId} published but its final progress event could not be pushed: ${
        e instanceof Error ? e.message : e
      }`,
    );
  }
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
