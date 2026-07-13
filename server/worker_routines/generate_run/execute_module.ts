import { emptyDir } from "@std/fs";
import { join } from "@std/path";
import { mergeReadableStreams } from "@std/streams";
import { stripVTControlCharacters } from "node:util";
import type { Sql } from "postgres";
import {
  getAssetToImportName,
  throwIfErrNoData,
  type InstanceConfigFacilityColumns,
} from "lib";
import {
  _IS_PRODUCTION,
  _MODULE_LOG_FILE_NAME,
  _MODULE_SCRIPT_FILE_NAME,
  _RUNS_DIR_PATH_EXTERNAL,
  _SANDBOX_DIR_PATH,
} from "../../exposed_env_vars.ts";
import { checkSpaceForModuleRun } from "../../utils/disk_space.ts";
import { upsertModuleCatalogForGeneratedRun } from "../../db/mod.ts";
import { importAsset } from "./import_asset.ts";
import { storeResultsObject } from "./legacy_store_results_object.ts";
import { R_DOCKER_IMAGE_TAG } from "./r_docker_image.ts";
import { notifyProjectRScript } from "../../task_management/notify_project_v2.ts";
import { getGenerateRunContainerName } from "./container_name.ts";
import { sha256HexOfFile } from "./input_key.ts";
import type { ResolvedRunModule } from "./resolve_modules.ts";

// Stage 3 of the run pipeline — execute or reuse one module
// (PLAN_RESULTS_RUNS items 2 + 3). The module's workspace is the run's own
// outputs/{moduleId} dir (§2.1): the R container mounts the run tmp dir and
// works there, so raw outputs are born inside the run and are never copied
// from a serving location. Inter-module reads (../{upstreamId}/) resolve
// because module dirs stay siblings; dataset reads resolve to the run's own
// ../../inputs/datasets/ (generated scripts are pointed there per-caller).
//
// Reuse (§3.7): when the pipeline finds the module's inputKey in the base
// run, reuseRunModule copies that run's raw output CSVs instead of running R
// — only R execution is memoized; finalize rebuilds parquet fresh under the
// CURRENT facility config, so copied CSVs never freeze stale normalization.
// A base output file gone missing throws ReuseSourceMissingError and the
// pipeline falls back to a real run (fails closed).
//
// Both paths end with the legacy-plane dual-write (model point 4): outputs
// copied to the project sandbox, catalog rows upserted, and today's ro_*
// COPY run unchanged from the sandbox — so a rollback to the previous image
// serves this generation's data even when a module was reused.

export class ReuseSourceMissingError extends Error {}

type ModuleRunResult = {
  inputKey: string;
  outputFileHashes: Record<string, string>;
};

export async function executeRunModule(args: {
  projectDb: Sql;
  projectId: string;
  runId: string;
  tmpDir: string;
  module: ResolvedRunModule;
  facilityColumns: InstanceConfigFacilityColumns;
  // Computed by the pipeline from the actual inputs (resolve_reuse.ts) —
  // recorded in the manifest as this module's memoization key.
  inputKey: string;
}): Promise<ModuleRunResult> {
  const { module: mod, projectId } = args;
  const moduleId = mod.moduleId;

  const moduleSpaceCheck = await checkSpaceForModuleRun();
  if (!moduleSpaceCheck.ok) {
    throw new Error(
      moduleSpaceCheck.resizeTriggered
        ? `Not enough disk space to run module ${moduleId} (${moduleSpaceCheck.availableGB} GB available). A volume resize has been triggered — please try again in a few minutes.`
        : `Not enough disk space to run module ${moduleId} (${moduleSpaceCheck.availableGB} GB available). Please contact your administrator.`,
    );
  }

  // Empty, not just present: a reuse attempt that fell back mid-copy must
  // not leave stale copied CSVs that would mask a missing R write below.
  const workspace = join(args.tmpDir, "outputs", moduleId);
  await emptyDir(workspace);
  await Deno.writeTextFile(
    join(workspace, _MODULE_SCRIPT_FILE_NAME),
    mod.scriptText,
  );

  const { writeToLog, closeLog } = await openModuleLog(workspace);
  try {
    await writeToLog("Module execution started", "starting");

    for (const asset of mod.detail.assetsToImport) {
      const assetName = getAssetToImportName(asset);
      await writeToLog("Getting asset: " + assetName, "download-file");
      notifyProjectRScript(projectId, moduleId, "Getting asset: " + assetName);
      await importAsset(asset, workspace, moduleId);
    }

    await writeToLog("Starting R script", "r-output");
    notifyProjectRScript(projectId, moduleId, "Starting R script");
    await runRScript(args.runId, moduleId, (line, isError) => {
      writeToLog(line, isError ? "stderr" : "stdout").catch(() => {});
      notifyProjectRScript(projectId, moduleId, line);
    });
    await writeToLog("Finished R script", "r-output");
    notifyProjectRScript(projectId, moduleId, "Finished R script");

    // Verify every declared results object was written (write-time
    // contract), hash outputs for downstream inputKeys, and warn on
    // undeclared files (excluded from all accounting — §2.3). Imported
    // assets are inputs staged into the workspace, not outputs.
    const declaredFiles = new Set<string>([
      _MODULE_SCRIPT_FILE_NAME,
      _MODULE_LOG_FILE_NAME,
      ...mod.detail.assetsToImport.map(getAssetToImportName),
      ...mod.detail.resultsObjects.map((ro) => ro.id),
    ]);
    const outputFileHashes: Record<string, string> = {};
    for (const ro of mod.detail.resultsObjects) {
      const roPath = join(workspace, ro.id);
      try {
        await Deno.lstat(roPath);
      } catch {
        throw new Error(
          `Results object ${ro.id} was not written by module ${moduleId}`,
        );
      }
      outputFileHashes[ro.id] = await sha256HexOfFile(roPath);
    }
    for await (const entry of Deno.readDir(workspace)) {
      if (!declaredFiles.has(entry.name)) {
        const warning =
          `Undeclared output file "${entry.name}" from module ${moduleId} — excluded from the run's accounting`;
        console.error(`[generate_run] ${warning}`);
        await writeToLog(warning, "warning");
      }
    }

    await dualWriteModuleToLegacyPlane({
      projectDb: args.projectDb,
      projectId,
      workspace,
      module: mod,
      facilityColumns: args.facilityColumns,
      writeToLog,
    });

    await writeToLog("Module execution completed successfully", "good-close");
    return { inputKey: args.inputKey, outputFileHashes };
  } catch (e) {
    await writeToLog(
      "Error running module: " + (e instanceof Error ? e.message : String(e)),
      "bad-close",
    );
    throw e;
  } finally {
    closeLog();
  }
}

// §3.7 reuse: the module's inputs are byte-identical to the base run's, so
// its raw output CSVs are copied from the base run's outputs/{moduleId} and
// R is skipped. Copy, never link — every run stays a self-contained,
// independently-deletable directory. outputFileHashes come from the base
// manifest: they describe the exact bytes copied from the immutable run.
export async function reuseRunModule(args: {
  projectDb: Sql;
  projectId: string;
  tmpDir: string;
  module: ResolvedRunModule;
  facilityColumns: InstanceConfigFacilityColumns;
  baseRunId: string;
  baseRunDir: string;
  inputKey: string;
  outputFileHashes: Record<string, string>;
}): Promise<ModuleRunResult> {
  const { module: mod, projectId } = args;
  const moduleId = mod.moduleId;

  const baseModuleDir = join(args.baseRunDir, "outputs", moduleId);
  // All-or-nothing check BEFORE any copy, so the fallback to a real run
  // almost always starts from an untouched workspace.
  for (const ro of mod.detail.resultsObjects) {
    try {
      await Deno.lstat(join(baseModuleDir, ro.id));
    } catch {
      throw new ReuseSourceMissingError(
        `Base run ${args.baseRunId} is missing output ${ro.id} for module ${moduleId}`,
      );
    }
  }

  const workspace = join(args.tmpDir, "outputs", moduleId);
  await emptyDir(workspace);
  await Deno.writeTextFile(
    join(workspace, _MODULE_SCRIPT_FILE_NAME),
    mod.scriptText,
  );

  const { writeToLog, closeLog } = await openModuleLog(workspace);
  try {
    await writeToLog(
      `Reusing outputs from results package ${args.baseRunId} — inputs unchanged`,
      "starting",
    );
    notifyProjectRScript(
      projectId,
      moduleId,
      "Reusing outputs from the previous results package (inputs unchanged)",
    );
    for (const ro of mod.detail.resultsObjects) {
      await writeToLog("Reusing output: " + ro.id, "download-file");
      await Deno.copyFile(
        join(baseModuleDir, ro.id),
        join(workspace, ro.id),
      );
    }

    await dualWriteModuleToLegacyPlane({
      projectDb: args.projectDb,
      projectId,
      workspace,
      module: mod,
      facilityColumns: args.facilityColumns,
      writeToLog,
    });

    await writeToLog("Module outputs reused successfully", "good-close");
    return { inputKey: args.inputKey, outputFileHashes: args.outputFileHashes };
  } catch (e) {
    await writeToLog(
      "Error reusing module outputs: " +
        (e instanceof Error ? e.message : String(e)),
      "bad-close",
    );
    throw e;
  } finally {
    closeLog();
  }
}

// Legacy-plane dual-write (rollback path, model point 4), shared by the run
// and reuse paths: sandbox copy, catalog upsert, then today's ro_* COPY from
// the sandbox. Runs for reused modules too — the project's pg tables may
// have drifted from the base run (e.g. a legacy per-module rerun before
// item 5 deletes that surface), and the rig diffs pg against the served run.
async function dualWriteModuleToLegacyPlane(args: {
  projectDb: Sql;
  projectId: string;
  workspace: string;
  module: ResolvedRunModule;
  facilityColumns: InstanceConfigFacilityColumns;
  writeToLog: (message: string, type: string) => Promise<void>;
}): Promise<void> {
  const { module: mod, projectId } = args;
  const moduleId = mod.moduleId;
  const lastRunAt = new Date().toISOString();
  const sandboxModuleDir = join(_SANDBOX_DIR_PATH, projectId, moduleId);
  await emptyDir(sandboxModuleDir);
  for await (const entry of Deno.readDir(args.workspace)) {
    if (entry.isFile) {
      await Deno.copyFile(
        join(args.workspace, entry.name),
        join(sandboxModuleDir, entry.name),
      );
    }
  }
  await upsertModuleCatalogForGeneratedRun(
    args.projectDb,
    mod.detail,
    mod.configSelections,
    mod.gitRef,
    lastRunAt,
  );
  for (const ro of mod.detail.resultsObjects) {
    notifyProjectRScript(projectId, moduleId, "Storing results object: " + ro.id);
    await args.writeToLog("Storing results object: " + ro.id, "upload-file");
    throwIfErrNoData(
      await storeResultsObject(
        args.projectDb,
        projectId,
        moduleId,
        ro,
        args.facilityColumns,
      ),
    );
  }
}

async function openModuleLog(workspace: string): Promise<{
  writeToLog: (message: string, type: string) => Promise<void>;
  closeLog: () => void;
}> {
  const logFile = await Deno.open(join(workspace, _MODULE_LOG_FILE_NAME), {
    write: true,
    create: true,
    truncate: true,
  });
  let logFileClosed = false;
  const encoder = new TextEncoder();
  const writeToLog = async (message: string, type: string) => {
    if (logFileClosed) return;
    try {
      await logFile.write(
        encoder.encode(
          `${new Date().toISOString()} [${type.toUpperCase()}] ${message}\n`,
        ),
      );
    } catch (e) {
      console.error("Failed to write to log:", e);
    }
  };
  const closeLog = () => {
    if (!logFileClosed) {
      logFileClosed = true;
      logFile.close();
    }
  };
  return { writeToLog, closeLog };
}

async function runRScript(
  runId: string,
  moduleId: string,
  onLine: (line: string, isError: boolean) => void,
): Promise<void> {
  const tmpDirExternal = join(_RUNS_DIR_PATH_EXTERNAL, `.tmp-${runId}`);
  const rProcess = _IS_PRODUCTION
    ? new Deno.Command("docker", {
      args: [
        "run",
        "-it", // Must be interactive so that the command waits
        "--rm",
        "--name",
        getGenerateRunContainerName(runId, moduleId),
        "-v",
        `${tmpDirExternal}:/home/docker`,
        "-w",
        `/home/docker/outputs/${moduleId}`,
        R_DOCKER_IMAGE_TAG,
        "Rscript",
        _MODULE_SCRIPT_FILE_NAME,
      ],
      stdout: "piped",
      stderr: "piped",
    })
    : new Deno.Command("Rscript", {
      args: [_MODULE_SCRIPT_FILE_NAME],
      cwd: join(tmpDirExternal, "outputs", moduleId),
      stdout: "piped",
      stderr: "piped",
    });

  const child = rProcess.spawn();
  const joined = mergeReadableStreams<{ text: string; isError: boolean }>(
    child.stdout.pipeThrough(new TextDecoderStream()).pipeThrough(
      new TransformStream<string, { text: string; isError: boolean }>({
        transform(chunk, controller) {
          const clean = stripVTControlCharacters(chunk).trim();
          if (clean) controller.enqueue({ text: clean, isError: false });
        },
      }),
    ),
    child.stderr.pipeThrough(new TextDecoderStream()).pipeThrough(
      new TransformStream<string, { text: string; isError: boolean }>({
        transform(chunk, controller) {
          const clean = stripVTControlCharacters(chunk).trim();
          if (clean) controller.enqueue({ text: clean, isError: true });
        },
      }),
    ),
  );
  const reader = joined.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      onLine(value.text, value.isError);
    }
  } finally {
    reader.releaseLock();
  }

  const status = await child.status;
  // R may still be flushing CSV files when the process stops (takes longer
  // in Docker) — same settle wait as the legacy module runner.
  await new Promise((res) => setTimeout(res, 2000));
  if (!status.success) {
    throw new Error(
      `Module ${moduleId} R script failed with exit code ${status.code}`,
    );
  }
}
