import { join } from "@std/path";
import type { Sql } from "postgres";
import {
  throwIfErrNoData,
  throwIfErrWithData,
  parseJsonOrThrow,
  type DatasetInProject,
  type DatasetType,
  type RunGenerationStep1Result,
} from "lib";
import {
  addDatasetHfaToProject,
  addDatasetHmisToProject,
  addDatasetIcehToProject,
  getDatasetFilePath,
  removeDatasetFromProject,
} from "../../db/mod.ts";
import { readCsvHeaders } from "../../runs/mod.ts";
import { writeParquetFromCsv } from "../../run_query/mod.ts";
import { notifyProjectDatasetsUpdated } from "../../task_management/notify_project_v2.ts";
import { sha256HexOfFile } from "./input_key.ts";

// Stage 1 of the run pipeline — prepare inputs (PLAN_RESULTS_RUNS item 2).
// The dataset extracts are produced by the LEGACY attach functions (today's
// COPY TO into the sandbox plus the project-DB mirror/snapshot rewrite):
// that IS the dual-write rollback path for data — the previous image's
// R contract (../datasets/), mirrors, and datasets rows all stay current —
// and it refreshes the snapshots that script generation and the finalize
// capture read. The run then gets its own copies at inputs/datasets/ with
// explicit-schema parquet twins (§2.1). Work item 4 re-targets the COPY TO
// to write into the run directly (with the Postgres runs volume); until
// then the sandbox is the byte-identical intermediate. A family deselected
// in step 1 is detached from the project — legacy semantics, and the
// finalize capture then correctly omits it from manifest.datasets.

export type PreparedRunInputs = {
  selectedFamilies: DatasetType[];
  // sha256 of each extract CSV, by family — module inputKey ingredients.
  datasetExtractHashes: Map<DatasetType, string>;
  // Relative paths (from the run dir root) for the manifest's inputFiles.
  extraInputFiles: string[];
};

export async function prepareRunInputs(
  mainDb: Sql,
  projectDb: Sql,
  projectId: string,
  step1: RunGenerationStep1Result,
  tmpDir: string,
): Promise<PreparedRunInputs> {
  await Deno.mkdir(join(tmpDir, "inputs", "datasets"), { recursive: true });
  await Deno.mkdir(join(tmpDir, "outputs"), { recursive: true });

  const attached = new Set(
    (
      await projectDb<{ dataset_type: string }[]>`
SELECT dataset_type FROM datasets
`
    ).map((r) => r.dataset_type as DatasetType),
  );

  const selectedFamilies: DatasetType[] = [];
  if (step1.hmis !== null) {
    selectedFamilies.push("hmis");
    const res = await addDatasetHmisToProject(
      mainDb,
      projectDb,
      projectId,
      step1.hmis.windowing,
    );
    throwIfErrWithData(res);
  } else if (attached.has("hmis")) {
    throwIfErrNoData(await removeDatasetFromProject(projectDb, projectId, "hmis"));
  }
  if (step1.hfa !== null) {
    selectedFamilies.push("hfa");
    const res = await addDatasetHfaToProject(
      mainDb,
      projectDb,
      projectId,
      undefined,
      step1.hfa.serviceCategoryScope,
    );
    throwIfErrWithData(res);
  } else if (attached.has("hfa")) {
    throwIfErrNoData(await removeDatasetFromProject(projectDb, projectId, "hfa"));
  }
  if (step1.iceh) {
    selectedFamilies.push("iceh");
    const res = await addDatasetIcehToProject(mainDb, projectDb, projectId);
    throwIfErrWithData(res);
  } else if (attached.has("iceh")) {
    throwIfErrNoData(await removeDatasetFromProject(projectDb, projectId, "iceh"));
  }

  const datasetExtractHashes = new Map<DatasetType, string>();
  const extraInputFiles: string[] = [];
  for (const datasetType of selectedFamilies) {
    const sourcePath = getDatasetFilePath(projectId, datasetType);
    const csvPath = join(tmpDir, "inputs", "datasets", `${datasetType}.csv`);
    await Deno.copyFile(sourcePath, csvPath);
    const headers = await readCsvHeaders(csvPath);
    await writeParquetFromCsv({
      csvPath,
      parquetPath: join(tmpDir, "inputs", "datasets", `${datasetType}.parquet`),
      columns: headers.map((name) => ({
        name,
        duckDbType: extractColumnType(datasetType, name),
      })),
      // Postgres COPY TO CSV writes NULL as unquoted-empty and quotes real
      // empty strings; writeParquetFromCsv never nulls quoted values.
      nullStrings: [""],
    });
    datasetExtractHashes.set(datasetType, await sha256HexOfFile(csvPath));
    extraInputFiles.push(
      `inputs/datasets/${datasetType}.csv`,
      `inputs/datasets/${datasetType}.parquet`,
    );
  }

  // The legacy plane's datasets changed — keep connected clients current.
  const datasetRows = await projectDb<
    { dataset_type: string; info: string; last_updated: string }[]
  >`
SELECT dataset_type, info, last_updated FROM datasets
`;
  notifyProjectDatasetsUpdated(
    projectId,
    datasetRows.map<DatasetInProject>((row) => {
      if (row.dataset_type === "hmis") {
        return {
          datasetType: "hmis",
          info: parseJsonOrThrow(row.info),
          dateExported: row.last_updated,
        };
      }
      if (row.dataset_type === "iceh") {
        return {
          datasetType: "iceh",
          info: parseJsonOrThrow(row.info),
          dateExported: row.last_updated,
        };
      }
      return {
        datasetType: "hfa",
        info: parseJsonOrThrow(row.info),
        dateExported: row.last_updated,
      };
    }),
  );

  return { selectedFamilies, datasetExtractHashes, extraInputFiles };
}

// Explicit parquet schema for the extract twins (§2.3: declared types, never
// inferred — facility ids and HFA values are TEXT that inference would
// mangle). Mirrors the Postgres types of the export statements'
// columns: everything is an identifier/label except the few numeric columns
// named here.
function extractColumnType(datasetType: DatasetType, column: string): string {
  if (datasetType === "hmis") {
    if (column === "period_id" || column === "count") return "BIGINT";
    return "VARCHAR";
  }
  if (datasetType === "hfa") {
    if (column === "weight") return "DOUBLE";
    return "VARCHAR";
  }
  if (column === "year" || column === "sample_size") return "BIGINT";
  if (column === "estimate" || column === "standard_error") return "DOUBLE";
  return "VARCHAR";
}
