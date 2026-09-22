// Harness for the population reason on `dimensions_not_in_package`: the
// level is set only when the package's stamp is active at a level shallower
// than a missing admin dimension, and the manifest and authoring-context
// entry points agree on it.
//
//   deno test -A --env-file server/tests/population_coverage_issue_test.ts

import { assertEquals } from "@std/assert";
import type {
  MetricWithStatus,
  PresentationObjectConfig,
  RunManifest,
  RunPopulation,
} from "lib";
import {
  figurePackageIssueForDimensions,
  figurePackageIssueForMetrics,
} from "../../lib/figure_package_issue.ts";

const METRIC = "m12-01-01";
const RO = "M12_indicator_values.csv";

function stamp(active: boolean, adminAreaLevel: number): RunPopulation {
  return {
    active,
    adminAreaLevel,
    populationTypes: ["total"],
    firstPeriodId: 201501,
    lastPeriodId: 202412,
    coverage: [],
  };
}

// The rule reads only what is stamped at finalize, so the fixtures carry
// only those fields.
function manifest(population: RunPopulation | null): RunManifest {
  return {
    metrics: [{ id: METRIC, results_object_id: RO, datasetFamily: "hmis" }],
    metricAvailability: [],
    resultsObjects: [{
      id: RO,
      availableDisaggregationOptions: ["admin_area_2", "period_id"],
    }],
    population,
  } as unknown as RunManifest;
}

const METRICS = [
  {
    id: METRIC,
    results_object_id: RO,
    datasetFamily: "hmis",
    status: "available",
    moduleId: "m012",
    disaggregationOptions: [{ value: "admin_area_2" }, { value: "period_id" }],
  },
] as unknown as MetricWithStatus[];

function configAsking(disOpt: string): PresentationObjectConfig {
  return {
    d: { disaggregateBy: [{ disOpt, disDisplayOpt: "rows" }], filterBy: [] },
  } as unknown as PresentationObjectConfig;
}

const CASES: {
  name: string;
  population: RunPopulation | null;
  expected: number | undefined;
}[] = [
  {
    name: "active at level 2, figure wants level 3",
    population: stamp(true, 2),
    expected: 2,
  },
  {
    name: "active at level 3, figure wants level 3",
    population: stamp(true, 3),
    expected: undefined,
  },
  { name: "inactive stamp", population: stamp(false, 2), expected: undefined },
  { name: "no stamp", population: null, expected: undefined },
];

for (const c of CASES) {
  Deno.test(`population reason: ${c.name}`, () => {
    const config = configAsking("admin_area_3");
    const fromMetrics = figurePackageIssueForMetrics(
      METRIC,
      config,
      METRICS,
      c.population,
    );
    const fromManifest = figurePackageIssueForDimensions(
      METRIC,
      ["admin_area_3"],
      manifest(c.population),
    );
    assertEquals(fromMetrics?.kind, "dimensions_not_in_package");
    assertEquals(
      fromMetrics?.kind === "dimensions_not_in_package"
        ? fromMetrics.populationLevel
        : null,
      c.expected,
    );
    assertEquals(fromMetrics, fromManifest);
  });
}

Deno.test("population reason: a missing non-admin dimension carries no level", () => {
  const issue = figurePackageIssueForMetrics(
    METRIC,
    configAsking("facility_type"),
    METRICS,
    stamp(true, 2),
  );
  assertEquals(issue?.kind, "dimensions_not_in_package");
  assertEquals("populationLevel" in (issue ?? {}), false);
});

Deno.test("population reason: nothing missing is no issue", () => {
  assertEquals(
    figurePackageIssueForMetrics(
      METRIC,
      configAsking("admin_area_2"),
      METRICS,
      stamp(true, 2),
    ),
    null,
  );
});
