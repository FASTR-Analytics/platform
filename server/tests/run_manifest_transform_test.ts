// Pins manifest blocks 1, 9, 11, 13, 14, 15 and 16 through
// transformRunManifestFile over a scratch package on disk: the indicator
// catalog is one entry per family the modules have, datasets[].info leaves
// the transform holding exactly the keys lib/types/run_datasets.ts types,
// every module blob and metric carries the declared presentation facts, a
// package written before the geojson capture carries a null stamp, a dataset
// entry carries no `lastUpdated`, an HMIS entry's version holds no staging
// result, and a second pass writes nothing.
// Also pins getRunDatasetsFromManifest, each entry read as its family and,
// for HMIS, its import version id, and getIndicatorMetadataFromRun, a module
// read as its family's catalog.
//
//   deno test -A --env-file server/tests/run_manifest_transform_test.ts

import { assert, assertEquals, assertRejects, assertThrows } from "@std/assert";
import { join } from "@std/path";
import {
  type DatasetType,
  type IndicatorMetadata,
  RUN_MANIFEST_SCHEMA_VERSION,
  type RunManifest,
  type RunMetric,
  type RunModule,
} from "lib";
import { transformRunManifestFile } from "../runs/manifest_transform.ts";
import {
  getIndicatorMetadataFromRun,
  getRunDatasetsFromManifest,
} from "../run_query/run_read.ts";

const STORED_VERSION = 10;

const HMIS_VERSION = {
  id: 14,
  nRowsTotalImported: 20,
  nRowsInserted: 15,
  nRowsUpdated: 5,
};

// A dataset entry as a package written before schema v16 stores it.
type StoredDatasetEntry = RunManifest["datasets"][number] & {
  lastUpdated?: string;
};

type ScratchOverrides =
  & Partial<Pick<RunManifest, "modules" | "metrics" | "manifestSchemaVersion">>
  & {
    datasets?: StoredDatasetEntry[];
  };

// An indicators[] entry as a package written before schema v18 stores it.
type StoredModuleCatalog = {
  moduleId: string;
  indicators: IndicatorMetadata[];
};

// What a package holds beside its manifest's own fields: the per-module
// catalogs a pre-v18 manifest stores, and the input mirrors block 1 reads.
type ScratchStored = {
  catalogs?: StoredModuleCatalog[];
  mirrors?: Record<string, unknown[]>;
};

const HMIS_MIRROR_ROWS = [
  {
    indicator_common_id: "anc1",
    indicator_common_label: "ANC 1",
    type: "dhis2_element",
    expression: null,
    slot_map: null,
    format_as: "number",
    thresholds: null,
    sort_order: 1,
  },
  {
    indicator_common_id: "penta3",
    indicator_common_label: "Penta 3",
    type: "uploaded",
    expression: null,
    slot_map: null,
    format_as: "percent",
    thresholds: null,
    sort_order: 2,
  },
];

const HMIS_CATALOG: IndicatorMetadata[] = [
  {
    id: "anc1",
    label: "ANC 1",
    format_as: "number",
    sort_order: 1,
    type: "dhis2_element",
  },
  {
    id: "penta3",
    label: "Penta 3",
    format_as: "percent",
    sort_order: 2,
    type: "uploaded",
  },
];

const HFA_MIRROR_ROWS = [
  {
    indicator_id: "ind_a",
    short_label: "Has power",
    definition: "Facility has power",
    type: "binary",
    aggregation: "avg",
    sort_order: 1,
  },
];

const HFA_CATALOG: IndicatorMetadata[] = [
  { id: "ind_a", label: "Has power", format_as: "percent", sort_order: 0 },
];

const MIRRORS = {
  "indicators.json": HMIS_MIRROR_ROWS,
  "hfa_indicators_snapshot.json": HFA_MIRROR_ROWS,
};

function scratchManifest(overrides: ScratchOverrides): RunManifest {
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
    geojsonMaps: null,
    inputFiles: [],
    ...overrides,
  };
}

async function writeScratchPackage(
  overrides: ScratchOverrides,
  stored: ScratchStored = {},
): Promise<string> {
  const runDir = await Deno.makeTempDir({ prefix: "run_manifest_transform_" });
  const mirrors = Object.entries(stored.mirrors ?? {});
  await Deno.mkdir(join(runDir, "inputs"));
  for (const [fileName, rows] of mirrors) {
    await Deno.writeTextFile(
      join(runDir, "inputs", fileName),
      JSON.stringify(rows),
    );
  }
  await Deno.writeTextFile(
    join(runDir, "manifest.json"),
    JSON.stringify(
      {
        ...scratchManifest(overrides),
        indicators: stored.catalogs ?? [],
        inputFiles: mirrors.map(([fileName]) => `inputs/${fileName}`),
      },
      null,
      2,
    ),
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

// A module blob as a v13 or later package stores it.
function declaredBlob(id: string, family: DatasetType): string {
  return JSON.stringify({
    ...JSON.parse(legacyBlob(id)),
    family,
    tier: "secondary",
    sortOrder: 1,
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
  const runDir = await writeScratchPackage({
    datasets: [
      {
        datasetType: "hmis",
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
        info: {
          _legacy: true,
          facilityColumnsHash: "ddd",
          hfaCacheHash: "eee",
        },
      },
      {
        datasetType: "iceh",
        info: { icehCacheHash: "fff" },
      },
    ],
  });

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
  const runDir = await writeScratchPackage({
    datasets: [
      {
        datasetType: "hmis",
        info: { ...current, indicatorMappingsVersion: "old" },
      },
    ],
  });
  const outcome = await transformRunManifestFile(runDir);
  assert(outcome.kind === "ok");
  assertEquals(outcome.manifest.datasets[0].info, current);
});

Deno.test("block 14 deletes every dataset entry's lastUpdated and keeps its type and info", async () => {
  const hmisInfo = { version: HMIS_VERSION, totalRows: 3 };
  const runDir = await writeScratchPackage({
    datasets: [
      {
        datasetType: "hmis",
        lastUpdated: "2026-11-01T00:00:00.000Z",
        info: hmisInfo,
      },
      {
        datasetType: "iceh",
        lastUpdated: "2026-11-01T00:00:00.000Z",
        info: { icehCacheHash: "fff" },
      },
    ],
  });
  const outcome = await transformRunManifestFile(runDir);
  assert(outcome.kind === "ok");
  assertEquals((await readStoredManifest(runDir)).datasets, [
    { datasetType: "hmis", info: hmisInfo },
    { datasetType: "iceh", info: { icehCacheHash: "fff" } },
  ]);
  const second = await transformRunManifestFile(runDir);
  assert(second.kind === "ok");
  assertEquals(second.transformed, false);
});

Deno.test("getRunDatasetsFromManifest reads each entry's family and the HMIS version id", () => {
  assertEquals(
    getRunDatasetsFromManifest(scratchManifest({
      datasets: [
        { datasetType: "hmis", info: { version: HMIS_VERSION } },
        { datasetType: "hfa", info: {} },
        { datasetType: "iceh", info: { icehCacheHash: "h" } },
      ],
    })),
    [
      { datasetType: "hmis", versionId: 14 },
      { datasetType: "hfa" },
      { datasetType: "iceh" },
    ],
  );
  assertThrows(() =>
    getRunDatasetsFromManifest(scratchManifest({
      datasets: [{ datasetType: "other", info: {} }],
    }))
  );
});

Deno.test("block 11 stamps a legacy blob from the frozen map and its metrics from the module", async () => {
  const runDir = await writeScratchPackage({
    modules: [
      runModule("m012", legacyBlob("m012")),
      runModule("m010", legacyBlob("m010")),
    ],
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

Deno.test("a legacy blob whose module id is outside the frozen map throws", async () => {
  const runDir = await writeScratchPackage({
    modules: [runModule("m099", legacyBlob("m099"))],
  });
  await assertRejects(
    () => transformRunManifestFile(runDir),
    Error,
    "module m099 has no legacy presentation entry",
  );
});

Deno.test("blocks 1 and 16 give a v17 manifest one catalog per family, each what its modules held", async () => {
  const runDir = await writeScratchPackage(
    {
      manifestSchemaVersion: 17,
      modules: [
        runModule("m001", declaredBlob("m001", "hmis")),
        runModule("m002", declaredBlob("m002", "hmis")),
        runModule("m010", declaredBlob("m010", "hfa")),
        runModule("m012", declaredBlob("m012", "hmis")),
      ],
    },
    {
      catalogs: [
        { moduleId: "m001", indicators: HMIS_CATALOG },
        { moduleId: "m002", indicators: HMIS_CATALOG },
        { moduleId: "m010", indicators: HFA_CATALOG },
        { moduleId: "m012", indicators: HMIS_CATALOG },
      ],
      mirrors: MIRRORS,
    },
  );
  const outcome = await transformRunManifestFile(runDir);
  assert(outcome.kind === "ok");
  assert(outcome.transformed);
  assertEquals(
    outcome.manifest.manifestSchemaVersion,
    RUN_MANIFEST_SCHEMA_VERSION,
  );
  const families = [
    { family: "hmis", indicators: HMIS_CATALOG },
    { family: "hfa", indicators: HFA_CATALOG },
  ];
  assertEquals(outcome.manifest.indicators, families);
  assertEquals((await readStoredManifest(runDir)).indicators, families);

  const second = await transformRunManifestFile(runDir);
  assert(second.kind === "ok");
  assertEquals(second.transformed, false);
});

Deno.test("block 1 reads a legacy blob's family from the frozen map", async () => {
  const runDir = await writeScratchPackage(
    { modules: [runModule("m010", legacyBlob("m010"))] },
    { mirrors: MIRRORS },
  );
  const outcome = await transformRunManifestFile(runDir);
  assert(outcome.kind === "ok");
  assertEquals(outcome.manifest.indicators, [
    { family: "hfa", indicators: HFA_CATALOG },
  ]);
});

Deno.test("getIndicatorMetadataFromRun reads a module's family's catalog", async () => {
  const runDir = await writeScratchPackage(
    {
      modules: [
        runModule("m001", declaredBlob("m001", "hmis")),
        runModule("m010", declaredBlob("m010", "hfa")),
        runModule("m012", declaredBlob("m012", "hmis")),
      ],
    },
    { mirrors: MIRRORS },
  );
  const outcome = await transformRunManifestFile(runDir);
  assert(outcome.kind === "ok");
  const ctx = { manifest: outcome.manifest };
  assertEquals(getIndicatorMetadataFromRun(ctx, "m001"), HMIS_CATALOG);
  assertEquals(getIndicatorMetadataFromRun(ctx, "m012"), HMIS_CATALOG);
  assertEquals(getIndicatorMetadataFromRun(ctx, "m010"), HFA_CATALOG);
  assertEquals(getIndicatorMetadataFromRun(ctx, "m099"), []);
});

Deno.test("block 13 gives a v14 package a null geojson stamp, once", async () => {
  const runDir = await Deno.makeTempDir({ prefix: "run_manifest_transform_" });
  const { geojsonMaps: _absent, ...v14 } = {
    ...scratchManifest({}),
    manifestSchemaVersion: 14,
  };
  await Deno.writeTextFile(
    join(runDir, "manifest.json"),
    JSON.stringify(v14, null, 2),
  );
  const outcome = await transformRunManifestFile(runDir);
  assert(outcome.kind === "ok");
  assert(outcome.transformed);
  assertEquals(
    outcome.manifest.manifestSchemaVersion,
    RUN_MANIFEST_SCHEMA_VERSION,
  );
  assertEquals(outcome.manifest.geojsonMaps, null);
  const second = await transformRunManifestFile(runDir);
  assert(second.kind === "ok");
  assertEquals(second.transformed, false);
  assertEquals(second.manifest.geojsonMaps, null);
});

Deno.test("block 15 drops a v16 HMIS entry's staging result and keeps the version's id, its row counts and every other key of info", async () => {
  const kept = {
    totalRows: 12,
    structureLastUpdated: "2026-11-01T00:00:00.000Z",
    indicatorsVersion: "aaa",
    countIndicatorsVersion: "bbb",
  };
  const runDir = await writeScratchPackage({
    manifestSchemaVersion: 16,
    datasets: [{
      datasetType: "hmis",
      info: {
        ...kept,
        version: {
          ...HMIS_VERSION,
          stagingResult: {
            periodIndicatorStats: [{
              periodId: 202301,
              indicatorRawId: "a",
              nRecords: 3,
            }],
          },
        },
      },
    }],
  });
  const outcome = await transformRunManifestFile(runDir);
  assert(outcome.kind === "ok");
  assert(outcome.transformed);
  assertEquals(
    outcome.manifest.manifestSchemaVersion,
    RUN_MANIFEST_SCHEMA_VERSION,
  );
  assertEquals((await readStoredManifest(runDir)).datasets, [
    { datasetType: "hmis", info: { ...kept, version: HMIS_VERSION } },
  ]);
  const second = await transformRunManifestFile(runDir);
  assert(second.kind === "ok");
  assertEquals(second.transformed, false);
});

Deno.test("block 15 stamps a v16 manifest with no HMIS entry and changes nothing else", async () => {
  const datasets = [
    { datasetType: "hfa", info: { hfaCacheHash: "eee" } },
    { datasetType: "iceh", info: { icehCacheHash: "fff" } },
  ];
  const runDir = await writeScratchPackage({
    manifestSchemaVersion: 16,
    datasets,
  });
  const outcome = await transformRunManifestFile(runDir);
  assert(outcome.kind === "ok");
  assertEquals(await readStoredManifest(runDir), {
    ...scratchManifest({ manifestSchemaVersion: 16, datasets }),
    manifestSchemaVersion: RUN_MANIFEST_SCHEMA_VERSION,
  });
});
