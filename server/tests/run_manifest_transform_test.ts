// Pins manifest blocks 9 and 11 through transformRunManifestFile over a
// scratch package on disk: datasets[].info leaves the transform holding
// exactly the keys lib/types/run_datasets.ts types, every module blob and
// metric carries the declared presentation facts, and a second pass writes
// nothing.
//
//   deno test -A --env-file server/tests/run_manifest_transform_test.ts

import { assert, assertEquals, assertRejects } from "@std/assert";
import { join } from "@std/path";
import {
  RUN_MANIFEST_SCHEMA_VERSION,
  type RunManifest,
  type RunMetric,
  type RunModule,
} from "lib";
import { transformRunManifestFile } from "../runs/manifest_transform.ts";

const STORED_VERSION = 10;

const HMIS_VERSION = { id: 14, nRowsTotalImported: 0 };

function scratchManifest(
  overrides: Partial<Pick<RunManifest, "datasets" | "modules" | "metrics">>,
): RunManifest {
  return {
    manifestSchemaVersion: STORED_VERSION,
    runId: "00000000-0000-4000-8000-000000000000",
    createdAt: "2026-09-15T00:00:00.000Z",
    label: "scratch",
    provenance: "wizard",
    appVersion: "0.0.0",
    rImageTag: null,
    calendar: "gregorian",
    countryIso3: null,
    structureSchemaHmis: null,
    structureSchemaHfa: null,
    datasets: [],
    facilitiesTables: [],
    assets: [],
    modules: [],
    metrics: [],
    resultsObjects: [],
    metricAvailability: [],
    indicators: [],
    hmisIndicators: [],
    population: null,
    inputFiles: [],
    ...overrides,
  };
}

async function writeScratchPackage(
  overrides: Partial<Pick<RunManifest, "datasets" | "modules" | "metrics">>,
): Promise<string> {
  const runDir = await Deno.makeTempDir({ prefix: "run_manifest_transform_" });
  await Deno.writeTextFile(
    join(runDir, "manifest.json"),
    JSON.stringify(scratchManifest(overrides), null, 2),
  );
  return runDir;
}

async function readStoredManifest(runDir: string): Promise<RunManifest> {
  return JSON.parse(await Deno.readTextFile(join(runDir, "manifest.json")));
}

// A module blob as a pre-v13 package stores it: no presentation facts.
function legacyBlob(id: string): string {
  return JSON.stringify({
    id,
    label: `Module ${id}`,
    prerequisites: [],
    lastScriptUpdate: "2026-01-01T00:00:00.000Z",
    dataSources: [],
    scriptGenerationType: "template",
    configRequirements: { parameters: [] },
    script: "",
    assetsToImport: [],
    resultsObjects: [],
  });
}

function runModule(id: string, moduleDefinition: string): RunModule {
  return {
    id,
    moduleDefinition,
    configSelections: null,
    lastRunAt: null,
    lastRunGitRef: null,
    inputKey: null,
    outputFileHashes: null,
  };
}

// datasetFamily is what a pre-v13 finalize stamped for a module without a
// dataset source: null.
function runMetric(id: string, moduleId: string): RunMetric {
  return {
    datasetFamily: null as unknown as RunMetric["datasetFamily"],
    id,
    module_id: moduleId,
    label: id,
    variant_label: null,
    value_func: "SUM",
    format_as: "number",
    value_props: "[]",
    required_disaggregation_options: "[]",
    value_label_replacements: null,
    post_aggregation_expression: null,
    catalog_expression_evaluation: null,
    results_object_id: "ro",
    ai_description: null,
    viz_presets: null,
    hide: false,
    important_notes: null,
  };
}

async function exists(path: string): Promise<boolean> {
  try {
    await Deno.stat(path);
    return true;
  } catch {
    return false;
  }
}

Deno.test("block 9 renames the pre-1.72 stamps and drops the keys nothing reads", async () => {
  const runDir = await writeScratchPackage({ datasets: [
    {
      datasetType: "hmis",
      lastUpdated: "2026-08-26T00:00:00.000Z",
      info: {
        version: HMIS_VERSION,
        windowing: { takeAllIndicators: true },
        totalRows: 12,
        structureLastUpdated: "2026-08-19T00:00:00.000Z",
        indicatorMappingsVersion: "aaa",
        baseIndicatorMappingsVersion: "bbb",
        facilityColumnsConfig: {},
        maxAdminArea: 2,
        calculatedIndicatorsVersion: "ccc",
      },
    },
    {
      datasetType: "hfa",
      lastUpdated: "2026-08-26T00:00:00.000Z",
      info: { _legacy: true, facilityColumnsHash: "ddd", hfaCacheHash: "eee" },
    },
    {
      datasetType: "iceh",
      lastUpdated: "2026-08-26T00:00:00.000Z",
      info: { icehCacheHash: "fff" },
    },
  ] });

  const outcome = await transformRunManifestFile(runDir);
  assert(outcome.kind === "ok");
  assert(outcome.transformed);
  assertEquals(
    outcome.manifest.manifestSchemaVersion,
    RUN_MANIFEST_SCHEMA_VERSION,
  );
  assertEquals(outcome.manifest.datasets.map((d) => d.info), [
    {
      version: HMIS_VERSION,
      totalRows: 12,
      structureLastUpdated: "2026-08-19T00:00:00.000Z",
      indicatorsVersion: "aaa",
      countIndicatorsVersion: "bbb",
    },
    { hfaCacheHash: "eee" },
    { icehCacheHash: "fff" },
  ]);

  const onDisk = JSON.parse(
    await Deno.readTextFile(join(runDir, "manifest.json")),
  );
  assertEquals(onDisk.datasets[0].info.indicatorsVersion, "aaa");
  assertEquals("indicatorMappingsVersion" in onDisk.datasets[0].info, false);
  assertEquals(
    await exists(join(runDir, `manifest.v${STORED_VERSION}.json`)),
    true,
  );

  const second = await transformRunManifestFile(runDir);
  assert(second.kind === "ok");
  assertEquals(second.transformed, false);
  assertEquals(
    await exists(join(runDir, `manifest.v${RUN_MANIFEST_SCHEMA_VERSION}.json`)),
    false,
  );
});

Deno.test("a stamp already under its current name is kept, and a package written now is untouched", async () => {
  const current = {
    version: HMIS_VERSION,
    totalRows: 1,
    structureLastUpdated: "2026-09-01T00:00:00.000Z",
    indicatorsVersion: "new",
    countIndicatorsVersion: "new",
  };
  const runDir = await writeScratchPackage({ datasets: [
    {
      datasetType: "hmis",
      lastUpdated: "2026-09-01T00:00:00.000Z",
      info: { ...current, indicatorMappingsVersion: "old" },
    },
  ] });
  const outcome = await transformRunManifestFile(runDir);
  assert(outcome.kind === "ok");
  assertEquals(outcome.manifest.datasets[0].info, current);
});

Deno.test("block 11 stamps a legacy blob from the frozen map and its metrics from the module", async () => {
  const runDir = await writeScratchPackage({
    modules: [runModule("m012", legacyBlob("m012")), runModule("m010", legacyBlob("m010"))],
    metrics: [runMetric("m12-01-01", "m012"), runMetric("m10-01-01", "m010")],
  });

  const outcome = await transformRunManifestFile(runDir);
  assert(outcome.kind === "ok");
  assert(outcome.transformed);
  const blobs = outcome.manifest.modules.map((mod) =>
    JSON.parse(mod.moduleDefinition)
  );
  assertEquals(
    blobs.map((b) => [b.family, b.tier, b.sortOrder]),
    [["hmis", "primary", 1], ["hfa", "primary", 1]],
  );
  assertEquals(blobs[0].label, "Module m012");
  assertEquals(
    outcome.manifest.metrics.map((m) => m.datasetFamily),
    ["hmis", "hfa"],
  );
  const onDisk = await readStoredManifest(runDir);
  assertEquals(onDisk.metrics[0].datasetFamily, "hmis");
  assertEquals(JSON.parse(onDisk.modules[0].moduleDefinition).tier, "primary");

  const second = await transformRunManifestFile(runDir);
  assert(second.kind === "ok");
  assertEquals(second.transformed, false);
});

Deno.test("block 11 leaves a blob that already declares the facts byte-for-byte", async () => {
  const declared = JSON.stringify({
    ...JSON.parse(legacyBlob("m001")),
    family: "hmis",
    tier: "secondary",
    sortOrder: 42,
  });
  const runDir = await writeScratchPackage({
    modules: [runModule("m001", declared)],
    metrics: [runMetric("m1-01-01", "m001")],
  });
  const outcome = await transformRunManifestFile(runDir);
  assert(outcome.kind === "ok");
  assertEquals(outcome.manifest.modules[0].moduleDefinition, declared);
  assertEquals(outcome.manifest.metrics[0].datasetFamily, "hmis");
});

Deno.test("block 11 throws on a module id outside the frozen map", async () => {
  const runDir = await writeScratchPackage({
    modules: [runModule("m099", legacyBlob("m099"))],
  });
  await assertRejects(
    () => transformRunManifestFile(runDir),
    Error,
    "block 11: module m099",
  );
});
