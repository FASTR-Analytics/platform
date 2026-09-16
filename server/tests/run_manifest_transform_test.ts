// Pins manifest block 9 through transformRunManifestFile over a scratch
// package on disk: datasets[].info leaves the transform holding exactly the
// keys lib/types/run_datasets.ts types, and a second pass writes nothing.
//
//   deno test -A --env-file server/tests/run_manifest_transform_test.ts

import { assert, assertEquals } from "@std/assert";
import { join } from "@std/path";
import { RUN_MANIFEST_SCHEMA_VERSION, type RunManifest } from "lib";
import { transformRunManifestFile } from "../runs/manifest_transform.ts";

const STORED_VERSION = 10;

const HMIS_VERSION = { id: 14, nRowsTotalImported: 0 };

function scratchManifest(datasets: RunManifest["datasets"]): RunManifest {
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
    datasets,
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
  };
}

async function writeScratchPackage(
  datasets: RunManifest["datasets"],
): Promise<string> {
  const runDir = await Deno.makeTempDir({ prefix: "run_manifest_transform_" });
  await Deno.writeTextFile(
    join(runDir, "manifest.json"),
    JSON.stringify(scratchManifest(datasets), null, 2),
  );
  return runDir;
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
  const runDir = await writeScratchPackage([
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
  ]);

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
  const runDir = await writeScratchPackage([
    {
      datasetType: "hmis",
      lastUpdated: "2026-09-01T00:00:00.000Z",
      info: { ...current, indicatorMappingsVersion: "old" },
    },
  ]);
  const outcome = await transformRunManifestFile(runDir);
  assert(outcome.kind === "ok");
  assertEquals(outcome.manifest.datasets[0].info, current);
});
