import type { Sql } from "postgres";
import type {
  APIResponseWithData,
  DisaggregationOption,
  PresentationObjectSummary,
  ResultsPackageCompatibilityIssue,
  ResultsPackageCompatibilityReport,
  RunManifest,
} from "lib";
import { getAllPresentationObjectsForProject } from "../db/project/presentation_objects.ts";
import { escapeSqlString } from "../db/utils.ts";
import { executeSqlOverParquet } from "../run_query/duckdb_executor.ts";
import { getRunManifestCached } from "./manifest_cache.ts";
import { runDirPath, runInputFilePath } from "./run_paths.ts";

// The §2.6 compatibility report: resolve a project's AUTHORED visualizations
// against a CANDIDATE package's manifest and say what would break, before the
// repoint rather than after it. Module evolution is per-run, so a package
// swap is the one moment a project's stored configs can meet a different
// catalog — this is the surface that makes that informed instead of silent.
//
// Manifest lookups only, no data queries: every fact needed is stamped
// (§2.2). The authored rows come from `getAllPresentationObjectsForProject`,
// which is the user-authored table — virtual defaults are excluded by
// construction because they are projections of whichever package is attached.

// Every dimension a stored config asks the package for: grouping, filtering
// and replication all resolve against the same per-results-object option list
// the read path uses.
function requestedDisaggregationOptions(
  po: PresentationObjectSummary,
): DisaggregationOption[] {
  return [
    ...new Set([
      ...po.disaggregateBy,
      ...po.filterBy.map((f) => f.disOpt),
      ...(po.replicateBy === undefined ? [] : [po.replicateBy]),
    ]),
  ];
}

function issueFor(
  po: PresentationObjectSummary,
  manifest: RunManifest,
): ResultsPackageCompatibilityIssue | null {
  const metric = manifest.metrics.find((m) => m.id === po.metricId);
  if (metric === undefined) {
    return {
      presentationObjectId: po.id,
      label: po.label,
      kind: "metric_not_in_package",
      metricId: po.metricId,
    };
  }

  const availability = manifest.metricAvailability.find(
    (a) => a.metricId === po.metricId,
  );
  if (availability !== undefined && availability.status === "unavailable") {
    return {
      presentationObjectId: po.id,
      label: po.label,
      kind: "metric_unavailable",
      metricId: po.metricId,
      reason: availability.reason,
    };
  }

  // A metric whose results object carries no query parquet offers no
  // dimensions at all, which is exactly what an empty option list says — the
  // same conclusion the read path reaches, so no special case here.
  const ro = manifest.resultsObjects.find(
    (r) => r.id === metric.results_object_id,
  );
  const available = new Set<string>(ro?.availableDisaggregationOptions ?? []);
  const missing = requestedDisaggregationOptions(po).filter(
    (disOpt) => !available.has(disOpt),
  );
  if (missing.length > 0) {
    return {
      presentationObjectId: po.id,
      label: po.label,
      kind: "dimensions_not_in_package",
      disaggregationOptions: missing,
      datasetFamily: metric.datasetFamily ?? undefined,
    };
  }

  return null;
}

// The one data query in this module: whether the candidate package's
// facilities parquets contain the project's AA2 scope (UPPER compare, same as
// the query layer). Everything else stays manifest-only.
async function computeProjectAdminArea2Coverage(
  adminArea2: string | null,
  runId: string,
  manifest: RunManifest,
): Promise<ResultsPackageCompatibilityReport["projectAdminArea2Coverage"]> {
  if (adminArea2 === null) return null;
  const tables = ["facilities_hmis", "facilities_hfa"].filter((t) =>
    manifest.inputFiles.includes(`inputs/${t}.parquet`)
  );
  if (tables.length === 0) return "no_facilities_data";
  const runDir = runDirPath(runId);
  for (const table of tables) {
    const rows = await executeSqlOverParquet(
      [{ viewName: table, parquetPath: runInputFilePath(runDir, `${table}.parquet`) }],
      `SELECT 1 AS hit FROM ${table} WHERE UPPER(admin_area_2) = UPPER('${
        escapeSqlString(adminArea2)
      }') LIMIT 1`,
    );
    if (rows.length > 0) return "covered";
  }
  return "uncovered";
}

export async function buildResultsPackageCompatibilityReport(
  mainDb: Sql,
  projectDb: Sql,
  projectId: string,
  runId: string,
): Promise<APIResponseWithData<ResultsPackageCompatibilityReport>> {
  const posRes = await getAllPresentationObjectsForProject(projectDb);
  if (posRes.success === false) {
    return posRes;
  }

  let manifest: RunManifest;
  try {
    manifest = await getRunManifestCached(runId);
  } catch (e) {
    return {
      success: false,
      err: e instanceof Error ? e.message : String(e),
    };
  }

  const projectAdminArea2 = (
    await mainDb<{ admin_area_2: string | null }[]>`
SELECT admin_area_2 FROM projects WHERE id = ${projectId}
`
  ).at(0)?.admin_area_2 ?? null;
  const projectAdminArea2Coverage = await computeProjectAdminArea2Coverage(
    projectAdminArea2,
    runId,
    manifest,
  );

  const issues = posRes.data
    .map((po) => issueFor(po, manifest))
    .filter((issue): issue is ResultsPackageCompatibilityIssue => issue !== null);

  return {
    success: true,
    data: {
      runId,
      runLabel: manifest.label,
      authoredVisualizationCount: posRes.data.length,
      issues,
      projectAdminArea2Coverage,
      projectAdminArea2,
    },
  };
}
