import { emptyDir } from "@std/fs";
import { join } from "@std/path";
import { mergeReadableStreams } from "@std/streams";
import { stripVTControlCharacters } from "node:util";
import type { Sql } from "postgres";
import {
  getAssetToImportName,
  throwIfErrNoData,
  type DatasetType,
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
import {
  importAsset,
  storeResultsObject,
} from "../run_module/run_module_iterator.ts";
import { R_DOCKER_IMAGE_TAG } from "../run_module/r_docker_image.ts";
import {
  notifyProjectModuleDirtyState,
  notifyProjectRScript,
} from "../../task_management/notify_project_v2.ts";
import { getGenerateRunContainerName } from "./container_name.ts";
import { computeModuleInputKey, sha256HexOfFile } from "./input_key.ts";
import type { ResolvedRunModule } from "./resolve_modules.ts";

// Stage 3 of the run pipeline — execute one module (PLAN_RESULTS_RUNS
// item 2). The module's workspace is the run's own outputs/{moduleId} dir
// (§2.1): the R container mounts the run tmp dir and works there, so raw
// outputs are born inside the run and are never copied from a serving
// location. Inter-module reads (../{upstreamId}/) resolve because module
// dirs stay siblings; dataset reads follow once item 4 re-points the
// generated scripts to ../../inputs/datasets/. After a successful R run the
// legacy plane is dual-written (model point 4): outputs copied to the
// project sandbox, catalog rows upserted, and today's ro_* COPY runs
// unchanged from the sandbox — so a rollback to the previous image serves
// this generation's data.

export async function executeRunModule(args: {
  projectDb: Sql;
  projectId: string;
  runId: string;
  tmpDir: string;
  module: ResolvedRunModule;
  facilityColumns: InstanceConfigFacilityColumns;
  datasetExtractHashes: Map<DatasetType, string>;
  // moduleId → outputFileHashes of already-executed upstream modules.
  upstreamOutputHashes: Map<string, Record<string, string>>;
}): Promise<{ inputKey: string; outputFileHashes: Record<string, string> }> {
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

  const workspace = join(args.tmpDir, "outputs", moduleId);
  await Deno.mkdir(workspace, { recursive: true });
  await Deno.writeTextFile(
    join(workspace, _MODULE_SCRIPT_FILE_NAME),
    mod.scriptText,
  );

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

  try {
    await writeToLog("Module execution started", "starting");

    const inputHashes: { name: string; sha256: string }[] = [];
    for (const asset of mod.detail.assetsToImport) {
      const assetName = getAssetToImportName(asset);
      await writeToLog("Getting asset: " + assetName, "download-file");
      notifyProjectRScript(projectId, moduleId, "Getting asset: " + assetName);
      await importAsset(asset, workspace, moduleId);
      inputHashes.push({
        name: `assets/${assetName}`,
        sha256: await sha256HexOfFile(join(workspace, assetName)),
      });
    }
    for (const source of mod.detail.dataSources) {
      if (source.sourceType === "dataset") {
        const sha256 = args.datasetExtractHashes.get(source.datasetType);
        if (sha256 === undefined) {
          throw new Error(
            `No ${source.datasetType} extract in this run for module ${moduleId}`,
          );
        }
        inputHashes.push({ name: `datasets/${source.datasetType}.csv`, sha256 });
      }
    }
    // Every upstream the module can read from (prerequisites plus
    // results_object sources) contributes ALL its output hashes — coarser
    // than the per-file declaration, which only ever costs a wasted re-run.
    const upstreamIds = new Set<string>(mod.detail.prerequisites);
    for (const source of mod.detail.dataSources) {
      if (source.sourceType === "results_object") {
        upstreamIds.add(source.moduleId);
      }
    }
    for (const upstreamId of [...upstreamIds].sort()) {
      const hashes = args.upstreamOutputHashes.get(upstreamId);
      if (hashes === undefined) {
        throw new Error(
          `Upstream ${upstreamId} has no recorded outputs for module ${moduleId}`,
        );
      }
      for (const [fileName, sha256] of Object.entries(hashes)) {
        inputHashes.push({ name: `${upstreamId}/${fileName}`, sha256 });
      }
    }
    const inputKey = computeModuleInputKey({
      scriptText: mod.scriptText,
      inputs: inputHashes,
      rImageTag: R_DOCKER_IMAGE_TAG,
    });

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
    // undeclared files (excluded from all accounting — §2.3).
    const declaredFiles = new Set<string>([
      _MODULE_SCRIPT_FILE_NAME,
      _MODULE_LOG_FILE_NAME,
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

    // Legacy-plane dual-write (rollback path, model point 4).
    const lastRunAt = new Date().toISOString();
    const sandboxModuleDir = join(_SANDBOX_DIR_PATH, projectId, moduleId);
    await emptyDir(sandboxModuleDir);
    for await (const entry of Deno.readDir(workspace)) {
      if (entry.isFile) {
        await Deno.copyFile(
          join(workspace, entry.name),
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
      await writeToLog("Storing results object: " + ro.id, "upload-file");
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
    notifyProjectModuleDirtyState(
      projectId,
      [moduleId],
      "ready",
      lastRunAt,
      mod.gitRef ?? undefined,
    );

    await writeToLog("Module execution completed successfully", "good-close");
    return { inputKey, outputFileHashes };
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
