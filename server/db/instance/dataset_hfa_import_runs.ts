import { Sql } from "postgres";
import {
  _RECODABLE_FACILITY_COLUMNS,
  APIResponseNoData,
  APIResponseWithData,
  type DatasetHfaCsvStagingResult,
  decodeHfaAdminTuple,
  getEnabledOptionalFacilityColumns,
  type HfaCsvMappingParams,
  type HfaCsvRunConfig,
  type HfaCsvRunLaunchInput,
  type HfaFacilityChangeGroupDecision,
  type HfaFacilityColumns,
  type HfaImportRunProgress,
  type HfaImportRunSummary,
  type OptionalFacilityColumn,
  parseJsonOrThrow,
  parseJsonOrUndefined,
  type StructureRecodableColumn,
  type StructureRecodes,
  type StructureSchema,
  throwIfErrWithData,
} from "lib";
import { tryCatchDatabaseAsync } from "../utils.ts";
import { getStructureSchema } from "./config.ts";
import { getCsvStreamComponents } from "../../server_only_funcs_csvs/get_csv_components_streaming_fast.ts";
import { instantiateImportHfaDataCsvWorker } from "../../worker_routines/import_hfa_data_csv/instantiate_worker.ts";
import { dropHfaStagingTables } from "../../worker_routines/import_hfa_data_csv/stage_csv.ts";
import { resolveAssetFileOrThrow } from "./assets.ts";
import { getXlsxSheetNamesRaw } from "../../server_only_funcs_csvs/read_xlsx_raw.ts";
import {
  clearWorker,
  getWorker,
  setWorker,
} from "../../worker_routines/worker_store.ts";
import type { DBHfaImportRun } from "./_main_database_types.ts";

// HFA import runs: one row per import, claimed by the partial unique index on
// status='running'. HFA is a deliberately smaller machine than HMIS: no queue
// and no scheduler, so a second launch while one runs is refused explicitly.

function toRunSummary(row: DBHfaImportRun): HfaImportRunSummary {
  const config = parseJsonOrUndefined<HfaCsvRunConfig>(row.csv_config);
  return {
    id: row.id,
    triggeredBy: row.triggered_by ?? undefined,
    timePoint: row.time_point,
    csvFileName: config?.csvFileName ?? "",
    status: row.status,
    error: row.error ?? undefined,
    progress: row.progress
      ? parseJsonOrUndefined<HfaImportRunProgress>(row.progress)
      : undefined,
    diagnostics: row.diagnostics
      ? parseJsonOrUndefined<DatasetHfaCsvStagingResult>(row.diagnostics)
      : undefined,
    nRowsIntegrated: row.n_rows_integrated ?? undefined,
    startedAt: new Date(row.started_at).toISOString(),
    endedAt: row.ended_at ? new Date(row.ended_at).toISOString() : undefined,
  };
}

export async function getDatasetHfaImportRunSummaries(
  mainDb: Sql,
): Promise<APIResponseWithData<HfaImportRunSummary[]>> {
  return await tryCatchDatabaseAsync(async () => {
    const rows = await mainDb<DBHfaImportRun[]>`
      SELECT id, triggered_by, csv_config, time_point, status, error, progress,
        diagnostics, n_rows_integrated, started_at, ended_at
      FROM hfa_import_runs
      ORDER BY id DESC
      LIMIT 50
    `;
    return { success: true, data: rows.map(toRunSummary) };
  });
}

// The mappings of the latest complete run, which the wizard pre-fills from.
export async function getLatestCompleteHfaMappings(
  mainDb: Sql,
): Promise<APIResponseWithData<HfaCsvMappingParams | null>> {
  return await tryCatchDatabaseAsync(async () => {
    const row = (
      await mainDb<{ csv_config: string }[]>`
        SELECT csv_config FROM hfa_import_runs
        WHERE status = 'complete'
        ORDER BY id DESC
        LIMIT 1
      `
    ).at(0);
    return {
      success: true,
      data: row
        ? parseJsonOrThrow<HfaCsvRunConfig>(row.csv_config).mappings
        : null,
    };
  });
}

export async function hasRunningDatasetHfaImportRun(
  mainDb: Sql,
): Promise<boolean> {
  const running = await mainDb<{ exists: boolean }[]>`
    SELECT EXISTS(
      SELECT 1 FROM hfa_import_runs WHERE status = 'running'
    ) as exists
  `;
  return running[0].exists;
}

const IMPORT_RUNNING_MESSAGE =
  "An HFA import is already running. Wait for it to finish.";

async function assertHfaImportSlotFree(mainDb: Sql): Promise<void> {
  if (await hasRunningDatasetHfaImportRun(mainDb)) {
    throw new Error(IMPORT_RUNNING_MESSAGE);
  }
  if (getWorker("hfa")) {
    throw new Error(IMPORT_RUNNING_MESSAGE);
  }
}

// Level 1 is one non-blank value. Levels 2 to the admin depth are mapped all
// or none, and all when the registry is empty, since every facility is then
// new and needs its tuple. Optional columns are the enabled set's.
function cleanHfaFacilityColumns(
  facilityColumns: HfaFacilityColumns,
  schema: StructureSchema,
  registryIsEmpty: boolean,
): HfaFacilityColumns {
  const adminArea1 = facilityColumns.adminArea1.value.trim();
  if (!adminArea1) {
    throw new Error("Give the admin area 1 (country) value.");
  }
  const levels: number[] = facilityColumns.adminAreas.map((a) => a.level);
  const expected: number[] = [];
  for (let level = 2; level <= schema.adminDepth; level++) {
    expected.push(level);
  }
  const mappedAll = levels.length === expected.length &&
    expected.every((level) => levels.includes(level));
  if (levels.length > 0 && !mappedAll) {
    throw new Error(
      `Map every admin area level from 2 to ${schema.adminDepth}, or none.`,
    );
  }
  if (registryIsEmpty && !mappedAll) {
    throw new Error(
      "The HFA registry is empty, so every facility is new: map every admin area level.",
    );
  }
  const enabled = getEnabledOptionalFacilityColumns(schema);
  const disabled = Object.keys(facilityColumns.optional).filter((c) =>
    !enabled.includes(c as OptionalFacilityColumn)
  );
  if (disabled.length > 0) {
    throw new Error(
      `The HFA structure schema does not enable ${disabled.join(", ")}.`,
    );
  }
  const headers = [
    ...facilityColumns.adminAreas,
    ...Object.values(facilityColumns.optional),
  ];
  if (headers.some((h) => h.correctionHeader === h.header)) {
    throw new Error("A correction column must differ from its column.");
  }
  return {
    adminArea1: { value: adminArea1 },
    adminAreas: facilityColumns.adminAreas.toSorted((a, b) =>
      a.level - b.level
    ),
    optional: facilityColumns.optional,
  };
}

// Well-formed decisions only: whether they match the file and the registry is
// re-checked at staging and again inside the integrate transaction.
function cleanHfaFacilityChanges(
  facilityChanges: HfaFacilityChangeGroupDecision[],
  facilityColumns: HfaFacilityColumns,
  adminDepth: number,
): HfaFacilityChangeGroupDecision[] {
  const adminMapped = adminDepth === 1 ||
    facilityColumns.adminAreas.length > 0;
  const groupKeys = new Set<string>();
  const decidedCells = new Set<string>();
  for (const d of facilityChanges) {
    const mapped = d.column === "admin"
      ? adminMapped
      : facilityColumns.optional[d.column] !== undefined;
    if (!mapped) {
      throw new Error(
        `A change of ${d.column} is decided, but the import does not map it.`,
      );
    }
    if (d.from === d.to) {
      throw new Error(`A change of ${d.column} leaves "${d.from}" unchanged.`);
    }
    if (d.column === "admin") {
      for (const tuple of [d.from, d.to]) {
        if (decodeHfaAdminTuple(tuple).length !== adminDepth) {
          throw new Error(
            `An admin change names ${tuple}, which is not ${adminDepth} admin areas.`,
          );
        }
      }
    }
    const key = JSON.stringify([d.column, d.from, d.to]);
    if (groupKeys.has(key)) {
      throw new Error(
        `The change of ${d.column} from "${d.from}" to "${d.to}" is decided twice.`,
      );
    }
    groupKeys.add(key);
    for (const id of d.facilityIds) {
      const cell = JSON.stringify([id, d.column]);
      if (decidedCells.has(cell)) {
        throw new Error(
          `Facility "${id}" has two decided changes of ${d.column}.`,
        );
      }
      decidedCells.add(cell);
    }
    const members = new Set(d.facilityIds);
    if (
      d.exceptions.some((id) => !members.has(id)) ||
      new Set(d.exceptions).size !== d.exceptions.length
    ) {
      throw new Error(
        `The exceptions to the change of ${d.column} from "${d.from}" to "${d.to}" must be distinct members of it.`,
      );
    }
  }
  return facilityChanges;
}

function cleanHfaRecodes(
  recodes: StructureRecodes,
  facilityColumns: HfaFacilityColumns,
): StructureRecodes {
  const cleaned: StructureRecodes = {};
  for (const [column, map] of Object.entries(recodes)) {
    const col = column as StructureRecodableColumn;
    if (
      !_RECODABLE_FACILITY_COLUMNS.includes(col) ||
      facilityColumns.optional[col] === undefined
    ) {
      throw new Error(
        `Recodes name the column ${column}, which the import does not map.`,
      );
    }
    if (map && Object.keys(map).length > 0) {
      cleaned[col] = map;
    }
  }
  return cleaned;
}

// Every column the mappings name must be a header of the file.
async function assertHeadersInFile(
  csvFilePath: string,
  mappings: HfaCsvMappingParams,
): Promise<void> {
  const res = await getCsvStreamComponents(csvFilePath, "allow-fewer-columns");
  throwIfErrWithData(res);
  const { encodedHeaderToIndexMap } = res.data;
  const fc = mappings.facilityColumns;
  const named = [
    mappings.facilityIdColumn,
    ...mappings.rowFilters.map((f) => f.column),
    ...[...fc.adminAreas, ...Object.values(fc.optional)].flatMap((h) =>
      h.correctionHeader ? [h.header, h.correctionHeader] : [h.header]
    ),
  ];
  const missing = named.filter((h) => !encodedHeaderToIndexMap.has(h));
  if (missing.length > 0) {
    throw new Error(
      `The file has no column ${missing.join(", ")}. Choose the columns again.`,
    );
  }
}

// The launch-time validations, all stateless: the XLSForm's sheets, the
// mappings cleaned, the time point's existence, and the facility columns,
// decisions and recodes well-formed. Returns the cleaned config that gets
// stored on the run row.
export async function validateHfaCsvRunConfig(
  mainDb: Sql,
  input: HfaCsvRunLaunchInput,
): Promise<HfaCsvRunConfig> {
  const mappings = input.mappings;
  if (!mappings.facilityIdColumn) {
    throw new Error("Select the column containing facility ids.");
  }
  const timePoint = mappings.timePoint.trim();
  if (!timePoint) {
    throw new Error("A time point is required.");
  }
  const rowFilters = mappings.rowFilters.map((f) => ({
    column: f.column,
    op: f.op,
    value: f.value.trim(),
  }));
  for (const f of rowFilters) {
    if (!f.column) {
      throw new Error("Each row filter needs a column.");
    }
    if (!f.value) {
      throw new Error(
        "Each row filter needs a value (blank-matching is not supported).",
      );
    }
  }
  const overrideFacilities = new Set<string>();
  for (const o of mappings.dedupOverrides) {
    if (overrideFacilities.has(o.facilityId)) {
      throw new Error(`Duplicate override for facility "${o.facilityId}".`);
    }
    overrideFacilities.add(o.facilityId);
  }

  const resSchema = await getStructureSchema(mainDb, "hfa");
  throwIfErrWithData(resSchema);
  const [{ count }] = await mainDb<{ count: number }[]>`
    SELECT COUNT(*)::int AS count FROM facilities_hfa
  `;
  const facilityColumns = cleanHfaFacilityColumns(
    mappings.facilityColumns,
    resSchema.data,
    count === 0,
  );
  const facilityChanges = cleanHfaFacilityChanges(
    mappings.facilityChanges,
    facilityColumns,
    resSchema.data.adminDepth,
  );
  const recodes = cleanHfaRecodes(mappings.recodes, facilityColumns);

  const timePointExists = await mainDb`
    SELECT 1 FROM hfa_time_points WHERE label = ${timePoint}
  `;
  if (timePointExists.length === 0) {
    throw new Error(
      `Time point "${timePoint}" does not exist. Create it on the HFA time points page before importing data.`,
    );
  }

  const csvFile = await resolveAssetFileOrThrow(input.csvFileName, null);
  const xlsFormFile = await resolveAssetFileOrThrow(
    input.xlsFormFileName,
    null,
  );
  const sheetNames = getXlsxSheetNamesRaw(xlsFormFile.filePath);
  if (!sheetNames.includes("survey") || !sheetNames.includes("choices")) {
    throw new Error(
      "The XLSForm file must contain both 'survey' and 'choices' sheets.",
    );
  }

  const cleanedMappings: HfaCsvMappingParams = {
    facilityIdColumn: mappings.facilityIdColumn,
    // Stored trimmed so it matches the trimmed value the staging leg writes
    // into the staged rows.
    timePoint,
    rowFilters,
    dedupStrategy: mappings.dedupStrategy,
    dedupOverrides: mappings.dedupOverrides,
    facilityColumns,
    facilityChanges,
    recodes,
  };
  await assertHeadersInFile(csvFile.filePath, cleanedMappings);
  return {
    csvFileName: input.csvFileName,
    csvFilePin: csvFile.pin,
    xlsFormFileName: input.xlsFormFileName,
    xlsFormFilePin: xlsFormFile.pin,
    mappings: cleanedMappings,
  };
}

// Spawns the run worker for a row already claimed as 'running'. Reads config +
// recorded diagnostics from the row itself, so launch and integrate-anyway
// share one spawn path. A spawn failure releases the claim: a 'running' row
// with no worker would block every HFA import until someone noticed.
async function spawnHfaRunWorker(
  mainDb: Sql,
  args: { runId: number; onComplete?: () => void },
): Promise<void> {
  const { runId, onComplete } = args;
  const row = (
    await mainDb<{ csv_config: string; diagnostics: string | null }[]>`
      SELECT csv_config, diagnostics FROM hfa_import_runs WHERE id = ${runId}
    `
  ).at(0);
  if (!row) {
    throw new Error(`HFA import run ${runId} not found.`);
  }
  const config = parseJsonOrThrow<HfaCsvRunConfig>(row.csv_config);

  const failClaim = async (message: string) => {
    await mainDb`
      UPDATE hfa_import_runs
      SET status = 'error', ended_at = now(), progress = NULL, error = ${message}
      WHERE id = ${runId} AND status = 'running'
    `;
  };

  let csvFilePath = "";
  let xlsFormFilePath = "";
  if (!config.resumeFromStaging) {
    // A missing pin (a pre-pin row) fails like a changed file: any such run
    // that still needs its files names bytes nobody validated.
    if (!config.csvFilePin || !config.xlsFormFilePin) {
      const message =
        "The file has changed since this run was launched. Start the import again.";
      await failClaim(message);
      throw new Error(message);
    }
    try {
      const csvFile = await resolveAssetFileOrThrow(
        config.csvFileName,
        config.csvFilePin,
      );
      const xlsFormFile = await resolveAssetFileOrThrow(
        config.xlsFormFileName,
        config.xlsFormFilePin,
      );
      csvFilePath = csvFile.filePath;
      xlsFormFilePath = xlsFormFile.filePath;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      await failClaim(message);
      throw e;
    }
  }

  let stagingResult: DatasetHfaCsvStagingResult | undefined;
  if (config.resumeFromStaging) {
    stagingResult = row.diagnostics
      ? parseJsonOrUndefined<DatasetHfaCsvStagingResult>(row.diagnostics)
      : undefined;
    if (!stagingResult) {
      await failClaim(
        "This run has no recorded staging result to integrate. Discard it and start the import again.",
      );
      throw new Error("Missing recorded staging result.");
    }
  }

  let worker: Worker;
  try {
    worker = instantiateImportHfaDataCsvWorker({
      runId,
      config,
      csvFilePath,
      xlsFormFilePath,
      stagingResult,
    });
    setWorker("hfa", worker);
  } catch (spawnError) {
    await failClaim(
      `Failed to start the import worker: ${
        spawnError instanceof Error ? spawnError.message : String(spawnError)
      }`,
    );
    throw spawnError;
  }

  worker.addEventListener("error", async (e) => {
    console.error("HFA import run worker crashed:", e);
    e.preventDefault();
    clearWorker("hfa", worker);
    worker.terminate();
    try {
      await mainDb`
        UPDATE hfa_import_runs
        SET status = 'error', ended_at = now(), progress = NULL,
          error = ${`Worker crashed: ${e.message || "Unknown error"}`}
        WHERE id = ${runId} AND status = 'running'
      `;
      await dropHfaStagingTables(mainDb, runId, { keepFinal: false });
    } catch (dbError) {
      console.error("Failed to mark HFA run errored after crash:", dbError);
    }
    try {
      await onComplete?.();
    } catch (err) {
      console.error("HFA import run onComplete callback failed:", err);
    }
  });

  worker.addEventListener("message", async (e) => {
    if (e.data === "COMPLETED") {
      clearWorker("hfa", worker);
      worker.terminate();
      try {
        await onComplete?.();
      } catch (err) {
        console.error("HFA import run onComplete callback failed:", err);
      }
    }
  });
}

export async function launchDatasetHfaCsvImportRun(
  mainDb: Sql,
  args: {
    input: HfaCsvRunLaunchInput;
    triggeredBy: string;
    onComplete?: () => void;
  },
): Promise<APIResponseWithData<{ runId: number }>> {
  return await tryCatchDatabaseAsync(async () => {
    const config = await validateHfaCsvRunConfig(mainDb, args.input);

    // Read-guard for a friendly error; the atomic claim is the INSERT below
    // (partial unique index: at most one status='running' row).
    await assertHfaImportSlotFree(mainDb);

    const inserted = await mainDb<{ id: number }[]>`
      INSERT INTO hfa_import_runs
        (triggered_by, csv_config, time_point, status, progress)
      VALUES
        (${args.triggeredBy}, ${JSON.stringify(config)},
         ${config.mappings.timePoint}, 'running',
         ${JSON.stringify({ phase: "staging", percent: 0 })})
      RETURNING id
    `;
    const runId = inserted[0].id;

    await spawnHfaRunWorker(mainDb, { runId, onComplete: args.onComplete });

    return { success: true, data: { runId } };
  });
}

// needs_review resolution. "Integrate anyway" re-claims the slot (refused if
// another import is running: HFA has no queue); "Discard" cancels and drops
// the surviving staging tables.
export async function resolveDatasetHfaReview(
  mainDb: Sql,
  args: {
    runId: number;
    action: "integrate_anyway" | "discard";
    onComplete?: () => void;
  },
): Promise<APIResponseNoData> {
  return await tryCatchDatabaseAsync(async () => {
    const row = (
      await mainDb<{ status: string; csv_config: string }[]>`
        SELECT status, csv_config FROM hfa_import_runs WHERE id = ${args.runId}
      `
    ).at(0);
    if (!row) {
      throw new Error("This run does not exist.");
    }
    if (row.status !== "needs_review") {
      throw new Error("This run is not waiting for review.");
    }
    const config = parseJsonOrThrow<HfaCsvRunConfig>(row.csv_config);

    if (args.action === "discard") {
      const updated = await mainDb`
        UPDATE hfa_import_runs
        SET status = 'cancelled', ended_at = now(),
          error = 'Discarded at review: staged rows were not integrated.'
        WHERE id = ${args.runId} AND status = 'needs_review'
      `;
      if (updated.count === 0) {
        throw new Error("This run is not waiting for review.");
      }
      await dropHfaStagingTables(mainDb, args.runId, { keepFinal: false });
      return { success: true };
    }

    await assertHfaImportSlotFree(mainDb);

    const resumeConfig: HfaCsvRunConfig = {
      ...config,
      resumeFromStaging: true,
    };
    const claimed = await mainDb`
      UPDATE hfa_import_runs
      SET status = 'running', started_at = now(),
        csv_config = ${JSON.stringify(resumeConfig)},
        progress = ${JSON.stringify({ phase: "integrating", percent: 0 })}
      WHERE id = ${args.runId} AND status = 'needs_review'
    `;
    if (claimed.count === 0) {
      throw new Error("This run is not waiting for review.");
    }

    await spawnHfaRunWorker(mainDb, {
      runId: args.runId,
      onComplete: args.onComplete,
    });
    return { success: true };
  });
}

export async function cancelDatasetHfaImportRun(
  mainDb: Sql,
  runId: number,
): Promise<APIResponseNoData> {
  return await tryCatchDatabaseAsync(async () => {
    const row = (
      await mainDb<{ id: number }[]>`
        SELECT id FROM hfa_import_runs WHERE id = ${runId}
      `
    ).at(0);
    if (!row) {
      throw new Error("This run does not exist.");
    }
    // The status flip comes FIRST and is conditional on the given runId: a
    // cancel aimed at an already-finished run (stale tab) must not touch the
    // worker: it belongs to whatever run is actually running.
    const updated = await mainDb`
      UPDATE hfa_import_runs
      SET status = 'cancelled', ended_at = now(), progress = NULL,
        error = 'Cancelled by user. Nothing was integrated.'
      WHERE id = ${runId} AND status = 'running'
    `;
    if (updated.count === 0) {
      throw new Error("This run is not running.");
    }
    // Terminating the worker aborts its in-flight transaction; the integrate
    // leg is a single transaction, so it rolls back whole.
    const worker = getWorker("hfa");
    if (worker) {
      worker.terminate();
      clearWorker("hfa", worker);
    }
    await dropHfaStagingTables(mainDb, runId, { keepFinal: false });
    return { success: true };
  });
}

// Startup sweep: a restart mid-run leaves a 'running' row with no live worker,
// and the claim would then block every future HFA import.
export async function markStaleRunningDatasetHfaImportRuns(
  mainDb: Sql,
): Promise<number> {
  const swept = await mainDb<{ id: number }[]>`
    UPDATE hfa_import_runs
    SET status = 'error', ended_at = now(), progress = NULL,
      error = 'Import run interrupted by a server restart. Nothing was integrated — start the import again.'
    WHERE status = 'running'
    RETURNING id
  `;
  for (const row of swept) {
    await dropHfaStagingTables(mainDb, row.id, { keepFinal: false });
  }
  return swept.length;
}
