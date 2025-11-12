import { emptyDir } from "@std/fs";
import { join } from "@std/path";
import { mergeReadableStreams } from "@std/streams";
import { stripVTControlCharacters } from "node:util";
import Papa from "papaparse";
import { Sql } from "postgres";
import { getResultsObjectTableName } from "../../db/mod.ts";
import { getScriptWithParameters } from "../../server_only_funcs/get_script_with_parameters.ts";
import {
  _ASSETS_DIR_PATH,
  _IS_PRODUCTION,
  _MODULE_LOG_FILE_NAME,
  _MODULE_SCRIPT_FILE_NAME,
  _SANDBOX_DIR_PATH,
  _SANDBOX_DIR_PATH_EXTERNAL,
  _SANDBOX_DIR_PATH_POSTGRES_INTERNAL,
} from "./../../exposed_env_vars.ts";
import {
  APIResponseNoData,
  ResultsObjectDefinition,
  throwIfErrNoData,
  type ModuleDetailForRunningScript,
  type RunStreamMsg,
  type InstanceConfigFacilityColumns,
  getEnabledOptionalFacilityColumns,
} from "lib";

const _DOCKER_IMAGE_TIDYVERSE_4_0_2 = _IS_PRODUCTION
  ? "timroberton/comb:wb-hmis-r-linux"
  : "timroberton/comb:wb-hmis-r-local";

export async function* runModuleIterator(
  projectId: string,
  projectDb: Sql,
  moduleDetail: ModuleDetailForRunningScript,
  facilityColumns: InstanceConfigFacilityColumns,
  countryIso3: string | undefined
) {
  let logFile: Deno.FsFile | undefined;
  let logFileClosed = false;
  const encoder = new TextEncoder();

  const writeToLog = async (message: string, type?: string) => {
    if (logFile && !logFileClosed) {
      const timestamp = new Date().toISOString();
      const prefix = type ? `[${type.toUpperCase()}]` : "[INFO]";
      try {
        await logFile.write(
          encoder.encode(`${timestamp} ${prefix} ${message}\n`)
        );
      } catch (e) {
        // Ignore write errors if file is already closed
        console.error("Failed to write to log:", e);
      }
    }
  };

  try {
    yield {
      text: "Starting",
      type: "starting",
    };
    const moduleDirPath = join(_SANDBOX_DIR_PATH, projectId, moduleDetail.id);
    const projectDirPath_EXTERNAL = join(_SANDBOX_DIR_PATH_EXTERNAL, projectId);
    const moduleDirPath_EXTERNAL = join(
      projectDirPath_EXTERNAL,
      moduleDetail.id
    );

    //////////////////////////////////
    //                              //
    //    Clear everything first    //
    //                              //
    //////////////////////////////////
    await emptyDir(moduleDirPath);
    for (const ro of moduleDetail.moduleDefinition.resultsObjects) {
      const tableName = getResultsObjectTableName(ro.id);
      await projectDb`DROP TABLE IF EXISTS ${projectDb(tableName)}`;
    }

    /////////////////////////
    //                     //
    //    Start logging    //
    //                     //
    /////////////////////////
    // Create log file early
    const logFilePath = join(moduleDirPath, _MODULE_LOG_FILE_NAME);
    logFile = await Deno.open(logFilePath, {
      write: true,
      create: true,
      truncate: true,
    });
    await writeToLog("Module execution started", "starting");

    /////////////
    //         //
    //    .    //
    //         //
    /////////////

    let knownDatasetVariables: Set<string> | undefined;
    if (moduleDetail.moduleDefinition.configRequirements.configType === "hfa") {
      const hfaVarRows = await projectDb<{ var_name: string }[]>`
        SELECT DISTINCT var_name FROM indicators_hfa ORDER BY var_name
      `;
      knownDatasetVariables = new Set(hfaVarRows.map((r) => r.var_name));
    }

    const scriptWithParameters = getScriptWithParameters(
      moduleDetail.moduleDefinition,
      moduleDetail.configSelections,
      countryIso3,
      knownDatasetVariables
    );
    const scriptFilePath = join(moduleDirPath, _MODULE_SCRIPT_FILE_NAME);
    await Deno.writeTextFile(scriptFilePath, scriptWithParameters);

    for (const asset of moduleDetail.moduleDefinition.assetsToImport) {
      const assetMsg = "Getting asset: " + asset;
      await writeToLog(assetMsg, "download-file");
      yield {
        text: assetMsg,
        type: "download-file",
      };
      await importAsset(asset, moduleDirPath);
    }

    await writeToLog("Starting R script", "r-output");
    yield {
      text: "Starting R script",
      type: "r-output",
    };

    const rProcess = _IS_PRODUCTION
      ? new Deno.Command("docker", {
          args: [
            "run",
            "-it", // Must be interactive so that the command waits!!!!!!!
            "--rm",
            "-v",
            `${projectDirPath_EXTERNAL}:/home/docker`,
            "-w",
            `/home/docker/${moduleDetail.id}`,
            _DOCKER_IMAGE_TIDYVERSE_4_0_2,
            "Rscript",
            _MODULE_SCRIPT_FILE_NAME,
          ],
          stdout: "piped",
          stderr: "piped",
        })
      : new Deno.Command("Rscript", {
          args: [_MODULE_SCRIPT_FILE_NAME],
          cwd: moduleDirPath_EXTERNAL,
          stdout: "piped",
          stderr: "piped",
        });

    const child = rProcess.spawn();

    const joined = mergeReadableStreams<RunStreamMsg>(
      child.stdout.pipeThrough(new TextDecoderStream()).pipeThrough(
        new TransformStream<string, RunStreamMsg>({
          transform(chunk, controller) {
            const cleanChunk = stripVTControlCharacters(chunk).trim();
            if (cleanChunk) {
              // Queue the write but don't await it
              writeToLog(cleanChunk, "stdout").catch(() => {});
              controller.enqueue({
                text: cleanChunk,
                type: "r-output",
              });
            }
          },
        })
      ),
      child.stderr.pipeThrough(new TextDecoderStream()).pipeThrough(
        new TransformStream<string, RunStreamMsg>({
          transform(chunk, controller) {
            const cleanChunk = stripVTControlCharacters(chunk).trim();
            if (cleanChunk) {
              // Queue the write but don't await it
              writeToLog(cleanChunk, "stderr").catch(() => {});
              controller.enqueue({
                text: cleanChunk,
                type: "r-error",
              });
            }
          },
        })
      )
    );

    const reader = joined.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        yield value;
      }
    } finally {
      reader.releaseLock();
    }

    const status = await child.status;

    // Not sure why, but need this before storing results objects...
    // Needed because R may still be flushing csv files when the process stops. Apparently takes longer when in Docker.
    await new Promise((res) => setTimeout(res, 2000));

    if (!status.success) {
      const errorMsg = `Could not finish script. Exit code ${status.code}`;
      await writeToLog(errorMsg, "r-error");
      yield {
        text: errorMsg,
        type: "r-error",
      };
      await writeToLog("Close", "bad-close");
      logFileClosed = true;
      logFile?.close();
      yield {
        text: "Close",
        type: "bad-close",
      };
      return;
    }

    await writeToLog("Finished R script", "r-output");
    yield {
      text: "Finished R script",
      type: "r-output",
    };

    for (const ro of moduleDetail.moduleDefinition.resultsObjects) {
      const checkMsg = "Checking results object: " + ro.id;
      await writeToLog(checkMsg, "upload-file");
      yield {
        text: checkMsg,
        type: "upload-file",
      };
      const roCsvFilePath = join(moduleDirPath, ro.id);
      const fileExists = await checkFileExists(roCsvFilePath);
      if (!fileExists) {
        throw new Error("Results object " + ro.id + " does not exist");
      }
    }

    for (const ro of moduleDetail.moduleDefinition.resultsObjects) {
      const storeMsg = "Storing results object: " + ro.id;
      await writeToLog(storeMsg, "upload-file");
      yield {
        text: storeMsg,
        type: "upload-file",
      };
      const res = await storeResultsObject(
        projectDb,
        projectId,
        moduleDetail.id,
        ro,
        facilityColumns
      );
      throwIfErrNoData(res);
    }
  } catch (e) {
    const errorMsg = "Error running module: " + String(e);
    await writeToLog(errorMsg, "bad-close");
    logFileClosed = true;
    logFile?.close();
    yield {
      text: errorMsg,
      type: "bad-close",
    };
    return;
  }

  await writeToLog("Module execution completed successfully", "good-close");
  logFileClosed = true;
  logFile?.close();
  yield {
    text: "Close",
    type: "good-close",
  };
}

///////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////

async function checkFileExists(filePath: string): Promise<boolean> {
  try {
    await Deno.lstat(filePath);
    return true;
  } catch {
    return false;
  }
}

async function importAsset(
  assetFileName: string,
  dirPath: string
): Promise<APIResponseNoData> {
  try {
    const assetFilePathSource = join(_ASSETS_DIR_PATH, assetFileName);
    const assetFilePathTarget = join(dirPath, assetFileName);
    await Deno.copyFile(assetFilePathSource, assetFilePathTarget);
    return { success: true };
  } catch (e) {
    return {
      success: false,
      err: "Problem importing asset: " + (e instanceof Error ? e.message : ""),
    };
  }
}

export async function storeResultsObject(
  projectDb: Sql,
  projectId: string,
  moduleId: string,
  resultsObject: ResultsObjectDefinition,
  facilityColumns: InstanceConfigFacilityColumns
): Promise<APIResponseNoData> {
  try {
    if (!resultsObject.createTableStatementPossibleColumns) {
      return { success: true };
    }

    const roCsvFilePath = join(
      _SANDBOX_DIR_PATH,
      projectId,
      moduleId,
      resultsObject.id
    );

    const tableName = getResultsObjectTableName(resultsObject.id);

    // Get CSV headers
    const csvHeaders = await getCsvHeaders(roCsvFilePath);

    const createTableStatement = getCreateTableStatementFromCsvHeaders(
      tableName,
      resultsObject.createTableStatementPossibleColumns,
      csvHeaders
    );

    const roCsvFilePathFromWithinPostgres = join(
      _SANDBOX_DIR_PATH_POSTGRES_INTERNAL,
      projectId,
      moduleId,
      resultsObject.id
    );

    const copyFileStatement = `
COPY ${tableName} FROM '${roCsvFilePathFromWithinPostgres}' 
ENCODING 'UTF8' CSV HEADER NULL 'NA'
`;

    const baseColumnsToExclude = csvHeaders.includes("period_id")
      ? ["month", "quarter_id", "year"]
      : ["month", "quarter_id"];

    // Get enabled optional facility columns to exclude if present in CSV
    const enabledFacilityColumns =
      getEnabledOptionalFacilityColumns(facilityColumns);

    const columnsToExcludeIfInCsv = [
      ...baseColumnsToExclude,
      ...enabledFacilityColumns.filter((col) => csvHeaders.includes(col)),
    ];

    // Build the DROP COLUMN clauses
    const dropColumnClauses = columnsToExcludeIfInCsv
      .map((col) => `DROP COLUMN IF EXISTS ${col}`)
      .join(", ");

    await projectDb.begin((sql) => [
      sql.unsafe(createTableStatement),
      sql.unsafe(copyFileStatement),
      sql.unsafe(`ALTER TABLE ${tableName} ${dropColumnClauses}`),
    ]);

    return { success: true };
  } catch (e) {
    console.log(e);
    return {
      success: false,
      err:
        "Problem storing results object: " +
        (e instanceof Error ? e.message : ""),
    };
  }
}

function getCreateTableStatementFromCsvHeaders(
  tableName: string,
  createTableStatementPossibleColumns: Record<string, string>,
  csvHeaders: string[]
): string {
  // Create a map of column name to column definition
  const columnMap = new Map<string, string>();
  for (const [colName, colDef] of Object.entries(
    createTableStatementPossibleColumns
  )) {
    columnMap.set(colName, colDef);
  }

  console.log(columnMap);

  // Build column definitions based on CSV headers order
  const selectedColumns: string[] = [];
  const missingHeaders: string[] = [];

  for (const header of csvHeaders) {
    const colDef = columnMap.get(header);
    if (colDef) {
      selectedColumns.push(`${header} ${colDef}`);
    } else {
      missingHeaders.push(header);
    }
  }

  if (missingHeaders.length > 0) {
    throw new Error(
      `CSV headers not found in table definition: ${missingHeaders.join(", ")}`
    );
  }

  if (selectedColumns.length === 0) {
    throw new Error(
      "No matching columns found between CSV headers and table definition"
    );
  }

  return `CREATE TABLE ${tableName} (
  ${selectedColumns.join(",\n  ")}
);`;
}

// COPY ro_m1_output_outliers_csv FROM '/app/sandbox/51ff1ae6-0c12-4005-8306-166bc53f8634/m001/M1_output_outliers.csv' (ENCODING 'LATIN1', FORMAT csv, DELIMITER ',', QUOTE '"', on_error ignore, log_verbosity verbose, HEADER, NULL 'NA' );

async function getCsvHeaders(csvFilePath: string): Promise<string[]> {
  // Read just the first part of the file to get headers
  const file = await Deno.open(csvFilePath, { read: true });
  const headerBuffer = new Uint8Array(16384); // 16KB should be enough for headers
  const bytesRead = await file.read(headerBuffer);
  file.close();

  if (!bytesRead || bytesRead === 0) {
    throw new Error("CSV file is empty");
  }

  const headerChunk = new TextDecoder().decode(
    headerBuffer.slice(0, bytesRead)
  );
  const headers = await new Promise<string[]>((resolve, reject) => {
    let headers: string[] | null = null;
    Papa.parse<string[]>(headerChunk, {
      skipEmptyLines: true,
      dynamicTyping: false,
      header: false,
      step: (results: Papa.ParseStepResult<string[]>, parser) => {
        if (headers === null) {
          headers = results.data;
          if (headers.length === 0) {
            parser.abort();
            reject(new Error("CSV header row is empty"));
          } else {
            parser.abort();
            resolve(headers);
          }
        }
      },
      error: (error: any) => {
        reject(new Error(`CSV parsing error: ${error.message || error}`));
      },
    });
  });

  return headers;
}
