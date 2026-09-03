import { join } from "@std/path";
import type { Sql } from "postgres";
import {
  projectScopeToken,
  type RunDataset,
  type RunFacilitiesTable,
  type RunMetric,
  type RunModule,
} from "lib";
import { PROJECT_FACILITY_COLUMN_NAMES } from "../server/db/project/datasets_in_project_hmis.ts";
import { buildRunPackageIntoTmp, exportRowsToParquet } from "../server/runs/mod.ts";
import type { RunReadContext } from "../server/run_query/mod.ts";
import type { Fixture } from "./fixtures.ts";

// Both per-family schema rows are seeded, and the OTHER family's row is
// deliberately DIVERGENT — different depth, every flag inverted — so any
// engine path that picks the wrong family's row breaks a case instead of
// coincidentally passing. The package builder stamps the manifest's
// structureSchema{Hmis,Hfa} from these rows.
export async function seedInstance(mainDb: Sql, fx: Fixture): Promise<void> {
  const ownSchema = { adminDepth: fx.adminDepth, ...fx.facilityColumns };
  const otherSchema = {
    adminDepth: fx.adminDepth === 2 ? 4 : 2,
    ...Object.fromEntries(
      Object.entries(fx.facilityColumns).map(([k, v]) => [k, !v]),
    ),
  };
  const ownKey = `structure_schema_${fx.family}`;
  const otherKey = fx.family === "hmis"
    ? "structure_schema_hfa"
    : "structure_schema_hmis";
  await mainDb`
    INSERT INTO instance_config (config_key, config_json_value)
    VALUES
      (${ownKey}, ${JSON.stringify(ownSchema)}),
      (${otherKey}, ${JSON.stringify(otherSchema)})
    ON CONFLICT (config_key)
    DO UPDATE SET config_json_value = EXCLUDED.config_json_value
  `;
}

// Builds a REAL results package for the fixture — the module's raw output CSV
// through the production parquet writer, the facilities parquet and indicator
// mirrors through the production input writers' contracts, the manifest
// through the production builder — and returns the national-scope read
// context the production read functions take. Nothing is mocked.
export async function buildFixturePackage(
  mainDb: Sql,
  fx: Fixture,
  runsDir: string,
): Promise<RunReadContext> {
  const runId = crypto.randomUUID();
  const tmpDir = join(runsDir, `.tmp-${runId}`);
  await Deno.mkdir(join(tmpDir, "inputs"), { recursive: true });
  await Deno.mkdir(join(tmpDir, "outputs", fx.moduleId), { recursive: true });

  // Raw module output, as R writes it: 'NA' unquoted for a missing value,
  // every real value quoted so '' and whitespace-only text survive verbatim.
  await Deno.writeTextFile(
    join(tmpDir, "outputs", fx.moduleId, fx.resultsObjectId),
    rowsToCsv(fx.roColumns.map((c) => c.name), fx.roRows),
  );

  const extraInputFiles: string[] = [];
  const facilitiesTable = `facilities_${fx.family}`;
  const facilityColumns = PROJECT_FACILITY_COLUMN_NAMES.map((name) => ({
    name,
    duckDbType: "VARCHAR",
  }));
  await exportRowsToParquet(
    fx.facilities.map((row) =>
      Object.fromEntries(
        PROJECT_FACILITY_COLUMN_NAMES.map((name) => [name, row[name] ?? null]),
      )
    ),
    facilityColumns,
    join(tmpDir, "inputs", `${facilitiesTable}.parquet`),
  );
  extraInputFiles.push(`inputs/${facilitiesTable}.parquet`);
  const facilitiesTables: RunFacilitiesTable[] = [
    { tableName: facilitiesTable, columns: facilityColumns },
  ];

  const writeMirror = async (fileName: string, rows: unknown[]) => {
    await Deno.writeTextFile(
      join(tmpDir, "inputs", fileName),
      JSON.stringify(rows),
    );
    extraInputFiles.push(`inputs/${fileName}`);
  };
  if (fx.family === "hmis") {
    await writeMirror("indicators.json", fx.indicators);
  }
  if (fx.hfaSnapshots) {
    await writeMirror("hfa_indicators_snapshot.json", fx.hfaSnapshots.indicators);
    await writeMirror(
      "hfa_indicator_categories_snapshot.json",
      fx.hfaSnapshots.categories,
    );
    await writeMirror(
      "hfa_indicator_sub_categories_snapshot.json",
      fx.hfaSnapshots.subCategories,
    );
    await writeMirror(
      "hfa_indicator_service_categories_snapshot.json",
      fx.hfaSnapshots.serviceCategories,
    );
  }

  const now = new Date().toISOString();
  const modules: RunModule[] = [{
    id: fx.moduleId,
    moduleDefinition: JSON.stringify({
      ...fx.moduleDefinition,
      resultsObjects: [{
        id: fx.resultsObjectId,
        createTableStatementPossibleColumns: Object.fromEntries(
          fx.roColumns.map((c) => [c.name, c.type]),
        ),
      }],
    }),
    configSelections: null,
    lastRunAt: now,
    lastRunGitRef: null,
    inputKey: null,
    outputFileHashes: null,
  }];
  const metrics: RunMetric[] = fx.metric
    ? [{
      datasetFamily: fx.family,
      id: fx.metric.id,
      module_id: fx.moduleId,
      label: fx.metric.label,
      variant_label: null,
      value_func: fx.metric.value_func,
      format_as: fx.metric.format_as,
      value_props: JSON.stringify(fx.metric.value_props),
      required_disaggregation_options: JSON.stringify(
        fx.metric.required_disaggregation_options,
      ),
      value_label_replacements: null,
      post_aggregation_expression: null,
      catalog_expression_evaluation: null,
      results_object_id: fx.resultsObjectId,
      ai_description: null,
      viz_presets: null,
      hide: false,
      important_notes: null,
    }]
    : [];
  const datasets: RunDataset[] = [
    { datasetType: fx.family, lastUpdated: now, info: {} },
  ];

  const { manifest } = await buildRunPackageIntoTmp(mainDb, runId, tmpDir, {
    label: fx.name,
    modules,
    metrics,
    datasets,
    facilitiesTables,
    population: null,
    attachTargetProjectIds: [],
    extraInputFiles,
  });
  const runDir = join(runsDir, runId);
  await Deno.rename(tmpDir, runDir);
  return {
    runId,
    runDir,
    manifest,
    adminArea2: null,
    scopeToken: projectScopeToken(null),
  };
}

function rowsToCsv(
  columns: string[],
  rows: Record<string, string | number | null>[],
): string {
  const line = (cells: string[]) => cells.join(",") + "\n";
  return (
    line(columns) +
    rows
      .map((row) =>
        line(
          columns.map((c) => {
            const v = row[c];
            if (v === null || v === undefined) return "NA";
            return `"${String(v).replaceAll('"', '""')}"`;
          }),
        )
      )
      .join("")
  );
}
