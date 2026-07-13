import { join } from "@std/path";
import Papa from "papaparse";
import type { Sql } from "postgres";
import type {
  APIResponseNoData,
  InstanceConfigFacilityColumns,
  ResultsObjectDefinition,
} from "lib";
import {
  _SANDBOX_DIR_PATH,
  _SANDBOX_DIR_PATH_POSTGRES_INTERNAL,
} from "../../exposed_env_vars.ts";
import { getResultsObjectTableName } from "../../db/mod.ts";
import {
  computeResultsObjectColumnsToExclude,
  writeNormalizedResultsObjectParquet,
} from "../../run_query/mod.ts";

// The legacy ro_* ingest — the per-module DUAL-WRITE into the project's
// Postgres tables (PLAN_RESULTS_RUNS model point 4, the rollback path).
// Reads the module's outputs from the SANDBOX copy (the pipeline copies run
// outputs there first) because the Postgres container mounts only the
// sandbox. Deleted with the Postgres read path at Phase-3 entry.
export async function storeResultsObject(
  projectDb: Sql,
  projectId: string,
  moduleId: string,
  resultsObject: ResultsObjectDefinition,
  facilityColumns: InstanceConfigFacilityColumns,
): Promise<APIResponseNoData> {
  try {
    if (!resultsObject.createTableStatementPossibleColumns) {
      return { success: true };
    }

    const roCsvFilePath = join(
      _SANDBOX_DIR_PATH,
      projectId,
      moduleId,
      resultsObject.id,
    );

    const tableName = getResultsObjectTableName(resultsObject.id);

    // Get CSV headers
    const csvHeaders = await getCsvHeaders(roCsvFilePath);

    const createTableStatement = getCreateTableStatementFromCsvHeaders(
      tableName,
      resultsObject.createTableStatementPossibleColumns,
      csvHeaders,
    );

    const roCsvFilePathFromWithinPostgres = join(
      _SANDBOX_DIR_PATH_POSTGRES_INTERNAL,
      projectId,
      moduleId,
      resultsObject.id,
    );

    const copyFileStatement = `
COPY ${tableName} FROM '${roCsvFilePathFromWithinPostgres}'
ENCODING 'UTF8' CSV HEADER NULL 'NA'
`;

    const hasQuarterId =
      !csvHeaders.includes("period_id") && csvHeaders.includes("quarter_id");
    const columnsToExcludeIfInCsv = computeResultsObjectColumnsToExclude(
      csvHeaders,
      facilityColumns,
    );

    // Build the DROP COLUMN clauses
    const dropColumnClauses = columnsToExcludeIfInCsv
      .map((col) => `DROP COLUMN IF EXISTS ${col}`)
      .join(", ");

    await projectDb.begin((sql) => [
      sql.unsafe(createTableStatement),
      sql.unsafe(copyFileStatement),
      sql.unsafe(`ALTER TABLE ${tableName} ${dropColumnClauses}`),
      // Normalize physical quarter_id from YYYY0Q (6-digit, as emitted by R
      // scripts) to YYYYQ (5-digit). Single choke point — no per-module R edits.
      // Idempotent: the >= 100000 guard skips already-5-digit values.
      ...(hasQuarterId
        ? [
            sql.unsafe(
              `UPDATE ${tableName} SET quarter_id = FLOOR(quarter_id / 100) * 10 + (quarter_id % 100) WHERE quarter_id >= 100000`,
            ),
          ]
        : []),
    ]);

    // Shadow-write the normalized parquet twin beside the sandbox CSV — the
    // backfill synthesizer copies it when fresh, and the parity rig's
    // --sandbox-parquet mode diffs this file against the Postgres tables.
    try {
      await writeNormalizedResultsObjectParquet({
        csvPath: roCsvFilePath,
        parquetPath: `${roCsvFilePath}.parquet`,
        csvHeaders,
        declaredColumns: resultsObject.createTableStatementPossibleColumns,
        columnsToExclude: columnsToExcludeIfInCsv,
      });
    } catch (e) {
      console.error(
        `[parquet-shadow] FAILED for ${resultsObject.id} in module ${moduleId}: ${
          e instanceof Error ? e.message : e
        }`,
      );
    }

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
  csvHeaders: string[],
): string {
  // Create a map of column name to column definition
  const columnMap = new Map<string, string>();
  for (const [colName, colDef] of Object.entries(
    createTableStatementPossibleColumns,
  )) {
    columnMap.set(colName, colDef);
  }

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
      `CSV headers not found in table definition: ${missingHeaders.join(", ")}`,
    );
  }

  if (selectedColumns.length === 0) {
    throw new Error(
      "No matching columns found between CSV headers and table definition",
    );
  }

  return `CREATE TABLE ${tableName} (
  ${selectedColumns.join(",\n  ")}
);`;
}

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
    headerBuffer.slice(0, bytesRead),
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
