// The metric data a stored figure converts with, and the conversion of a
// stored figure block: the own package's metric, else another package's, else
// the bundle's; a stored block converts, a converted block and a block with no
// bundle pass through, and a map with no area is emptied.

import { assert, assertEquals } from "@std/assert";
import {
  type FigureBundle,
  figureBundleSchema,
  figureConfigSchema,
  getStartingConfigForPresentationObject,
  type PresentationObjectConfig,
  type RunMetric,
  type RunResultsObject,
} from "lib";
import { enrichMetricFromManifest } from "../run_query/mod.ts";
import {
  figureConversionMetric,
  type PackageMetrics,
  packageMetricsOf,
} from "../runs/figure_metric_data.ts";
import { convertStoredFigureBlock } from "../db/migrations/data_transforms/figure_config.ts";

function metricRow(
  id: string,
  ro: string,
  valueProps: string[],
  valueFunc: string,
): RunMetric {
  return {
    datasetFamily: "hmis",
    id,
    module_id: "m001",
    label: id,
    variant_label: null,
    value_func: valueFunc,
    format_as: "number",
    value_props: JSON.stringify(valueProps),
    required_disaggregation_options: "[]",
    value_label_replacements: null,
    post_aggregation_expression: null,
    catalog_expression_evaluation: null,
    results_object_id: ro,
    ai_description: null,
    viz_presets: null,
    hide: false,
    important_notes: null,
  };
}

function resultsObject(
  id: string,
  dims: RunResultsObject["availableDisaggregationOptions"],
  hasParquet = true,
): RunResultsObject {
  return {
    id,
    moduleId: "m001",
    hasParquet,
    columns: [],
    hasFacilityId: false,
    physicalTimeColumn: null,
    availableDisaggregationOptions: dims,
    rowCount: 1,
    periodBounds: null,
  };
}

const YEARLY = resultsObject("ro_yearly", [
  "admin_area_2",
  "admin_area_3",
  "year",
]);
const MONTHLY = resultsObject("ro_monthly", ["admin_area_2", "period_id"]);

const PACKAGES: PackageMetrics[] = [
  packageMetricsOf({
    runId: "own",
    createdAt: "2026-03-01T00:00:00.000Z",
    metrics: [
      metricRow("m_yearly", "ro_yearly", ["v"], "AVG"),
      metricRow("m_nodata", "ro_nodata", ["v"], "SUM"),
    ],
    resultsObjects: [YEARLY, resultsObject("ro_nodata", ["year"], false)],
  }),
  packageMetricsOf({
    runId: "older",
    createdAt: "2026-01-01T00:00:00.000Z",
    metrics: [metricRow("m_monthly", "ro_monthly", ["old"], "SUM")],
    resultsObjects: [MONTHLY],
  }),
  packageMetricsOf({
    runId: "newer",
    createdAt: "2026-06-01T00:00:00.000Z",
    metrics: [metricRow("m_monthly", "ro_monthly", ["a", "b"], "SUM")],
    resultsObjects: [MONTHLY],
  }),
];

function bundleOf(
  config: PresentationObjectConfig,
  metricId: string,
  extra: Partial<FigureBundle> = {},
): FigureBundle {
  return figureBundleSchema.parse({
    config,
    items: [],
    resultsValue: { formatAs: "number", valueProps: ["Label A"] },
    indicatorMetadata: [],
    localization: {
      language: "en",
      calendar: "gregorian",
      countryIso3: "",
      fiscalYear: "none",
    },
    metricId,
    scope: { definitionHash: "h", adminArea2: null },
    snapshotAt: "2026-01-01T00:00:00.000Z",
    provenance: { runId: "own" },
    ...extra,
  });
}

const YEARLY_METRIC = enrichMetricFromManifest(
  metricRow("m_yearly", "ro_yearly", ["v"], "AVG"),
  YEARLY,
);
const TABLE = getStartingConfigForPresentationObject(
  YEARLY_METRIC,
  "table",
  ["admin_area_2"],
);

Deno.test("a figure converts with its own package's metric", () => {
  assertEquals(
    figureConversionMetric(PACKAGES, bundleOf(TABLE, "m_yearly")),
    { valueProps: ["v"], canRollUp: false, yearly: true, source: "ownPackage" },
  );
});

Deno.test("else with the newest other package that holds the metric with data", () => {
  assertEquals(
    figureConversionMetric(PACKAGES, bundleOf(TABLE, "m_monthly")),
    {
      valueProps: ["a", "b"],
      canRollUp: true,
      yearly: false,
      source: "otherPackage",
    },
  );
});

Deno.test("else with its bundle: its value props, its date range's grain, and a roll-up kept", () => {
  for (const metricId of ["m_nodata", "m_absent"]) {
    assertEquals(
      figureConversionMetric(
        PACKAGES,
        bundleOf(TABLE, metricId, { dateRange: { min: 2019, max: 2023 } }),
      ),
      {
        valueProps: ["Label A"],
        canRollUp: true,
        yearly: true,
        source: "bundle",
      },
    );
  }
});

const metricOf = (bundle: FigureBundle) =>
  figureConversionMetric(PACKAGES, bundle);

Deno.test("a stored block converts, and a converted block then passes through", () => {
  const stored = { type: "figure", bundle: bundleOf(TABLE, "m_yearly") };
  const first = convertStoredFigureBlock(stored, metricOf);
  assert(first.outcome === "converted");
  assertEquals(first.metricSource, "ownPackage");
  const bundle = first.block.bundle as Record<string, unknown>;
  assertEquals(bundle.metricId, "m_yearly");
  assertEquals(bundle.provenance, { runId: "own" });
  assert(figureConfigSchema.safeParse(bundle.config).success);
  const second = convertStoredFigureBlock(first.block, metricOf);
  assertEquals(second, { outcome: "unchanged", block: first.block });
});

Deno.test("a block with no bundle passes through", () => {
  const empty = { type: "figure" };
  assertEquals(convertStoredFigureBlock(empty, metricOf), {
    outcome: "unchanged",
    block: empty,
  });
});

Deno.test("a map with no admin-level area is emptied", () => {
  const map: PresentationObjectConfig = {
    ...TABLE,
    d: { ...TABLE.d, type: "map" },
  };
  const result = convertStoredFigureBlock(
    { type: "figure", bundle: bundleOf(map, "m_yearly") },
    metricOf,
  );
  assert(result.outcome === "emptied");
  assertEquals(result.block, { type: "figure" });
  assertEquals(result.failure, "mapWithoutArea");
});

Deno.test("a bundle that does not parse is left as it is, with its issue", () => {
  const broken = {
    type: "figure",
    bundle: { config: { d: { type: "table" }, s: {}, t: {} }, metricId: "x" },
  };
  const result = convertStoredFigureBlock(broken, metricOf);
  assertEquals(result.outcome, "unreadable");
  assertEquals(result.block, broken);
});
