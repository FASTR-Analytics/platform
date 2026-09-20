// Pins the input transform stage through its one public entry point,
// transformRunManifestFile, over a scratch package on disk: the version gate
// and the stage-before-blocks order are what it proves, not the stage alone.
//
//   deno test -A --env-file server/tests/run_input_transform_test.ts

import { assert, assertEquals, assertRejects } from "@std/assert";
import { join } from "@std/path";
import { RUN_MANIFEST_SCHEMA_VERSION, type RunManifest } from "lib";
import { transformRunManifestFile } from "../runs/manifest_transform.ts";
import { RunInputRowSchemaError } from "../runs/indicator_catalog.ts";

const STORED_VERSION = 9;
const CURRENT = `v${RUN_MANIFEST_SCHEMA_VERSION}`;

// The smallest shape runManifestSchema accepts, read off run_manifest.ts.
function scratchManifest(inputFiles: string[]): RunManifest {
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
    inputFiles,
  };
}

function baseRow(id: string, sortOrder: number) {
  return {
    indicator_common_id: id,
    indicator_common_label: id.toUpperCase(),
    format_as: "number",
    thresholds: null,
    sort_order: sortOrder,
    type: "base",
    expression: null,
    slot_map: null,
  };
}

const FORMULA_ROW = {
  indicator_common_id: "anc4_coverage",
  indicator_common_label: "ANC4 coverage",
  format_as: "percent",
  thresholds: null,
  sort_order: 3,
  type: "derived",
  expression: "anc4 / anc1",
  slot_map: { anc4: "anc4", anc1: "anc1" },
};

// An hfa_indicators_snapshot row as a v10 package stores it: the id under
// `var_name`, first in the row, as `SELECT *` on the old column order wrote it.
function hfaRowStored(id: string, sortOrder: number) {
  return {
    var_name: id,
    category_id: null,
    sub_category_id: null,
    service_category_ids: "[]",
    short_label: id.toUpperCase(),
    definition: `Facilities with ${id}`,
    type: "binary",
    aggregation: "avg",
    sort_order: sortOrder,
    updated_at: "2026-09-15T00:00:00.000Z",
    has_syntax_error: false,
    code_consistent: true,
    variant_group_id: null,
  };
}

function hfaRowCurrent(id: string, sortOrder: number) {
  const { var_name, ...rest } = hfaRowStored(id, sortOrder);
  return { indicator_id: var_name, ...rest };
}

type ScratchMirrors = {
  indicators: unknown[] | null;
  hfaIndicators?: unknown[];
};

async function writeScratchPackage(mirrors: ScratchMirrors): Promise<string> {
  const runDir = await Deno.makeTempDir({ prefix: "run_input_transform_" });
  await Deno.mkdir(join(runDir, "inputs"));
  const inputFiles = ["inputs/indicators.json"];
  if (mirrors.hfaIndicators !== undefined) {
    inputFiles.push("inputs/hfa_indicators_snapshot.json");
  }
  await Deno.writeTextFile(
    join(runDir, "manifest.json"),
    JSON.stringify(scratchManifest(inputFiles), null, 2),
  );
  if (mirrors.indicators !== null) {
    await Deno.writeTextFile(
      join(runDir, "inputs", "indicators.json"),
      JSON.stringify(mirrors.indicators),
    );
  }
  if (mirrors.hfaIndicators !== undefined) {
    await Deno.writeTextFile(
      join(runDir, "inputs", "hfa_indicators_snapshot.json"),
      JSON.stringify(mirrors.hfaIndicators),
    );
  }
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

Deno.test("input block 1 rewrites derived to calculated before the manifest blocks read the mirror", async () => {
  const rows = [baseRow("anc1", 1), baseRow("anc4", 2), FORMULA_ROW];
  const runDir = await writeScratchPackage({ indicators: rows });
  const mirrorPath = join(runDir, "inputs", "indicators.json");
  const originalBytes = await Deno.readTextFile(mirrorPath);

  const outcome = await transformRunManifestFile(runDir);
  assert(outcome.kind === "ok");
  assert(outcome.transformed);
  assertEquals(outcome.rewrittenInputs, ["inputs/indicators.json"]);

  const rewrittenRows = [
    ...rows.slice(0, 2),
    { ...FORMULA_ROW, type: "calculated" },
  ];
  assertEquals(
    await Deno.readTextFile(mirrorPath),
    JSON.stringify(rewrittenRows),
  );
  assertEquals(
    await Deno.readTextFile(join(runDir, "inputs", "indicators.v9.json")),
    originalBytes,
  );

  assertEquals(
    outcome.manifest.manifestSchemaVersion,
    RUN_MANIFEST_SCHEMA_VERSION,
  );
  const onDisk = JSON.parse(
    await Deno.readTextFile(join(runDir, "manifest.json")),
  );
  assertEquals(onDisk.manifestSchemaVersion, RUN_MANIFEST_SCHEMA_VERSION);
  const formula = outcome.manifest.hmisIndicators.find((i) =>
    i.id === "anc4_coverage"
  );
  assertEquals(formula?.expression, "anc4 / anc1");

  const second = await transformRunManifestFile(runDir);
  assert(second.kind === "ok");
  assertEquals(second.transformed, false);
  assertEquals(second.rewrittenInputs, []);
  assertEquals(
    await exists(join(runDir, "inputs", `indicators.${CURRENT}.json`)),
    false,
  );
  assertEquals(await exists(join(runDir, `manifest.${CURRENT}.json`)), false);
});

Deno.test("input block 2 renames var_name to indicator_id in place, keeping the key's position", async () => {
  const stored = [hfaRowStored("ind002", 2), hfaRowStored("ind001", 1)];
  const runDir = await writeScratchPackage({
    indicators: [baseRow("anc1", 1)],
    hfaIndicators: stored,
  });
  const mirrorPath = join(runDir, "inputs", "hfa_indicators_snapshot.json");
  const originalBytes = await Deno.readTextFile(mirrorPath);

  const outcome = await transformRunManifestFile(runDir);
  assert(outcome.kind === "ok");
  assert(outcome.transformed);
  assertEquals(outcome.rewrittenInputs, [
    "inputs/hfa_indicators_snapshot.json",
  ]);
  assertEquals(
    await Deno.readTextFile(mirrorPath),
    JSON.stringify([hfaRowCurrent("ind002", 2), hfaRowCurrent("ind001", 1)]),
  );
  assertEquals(
    await Deno.readTextFile(
      join(runDir, "inputs", "hfa_indicators_snapshot.v9.json"),
    ),
    originalBytes,
  );
  assertEquals(
    await exists(join(runDir, "inputs", "indicators.v9.json")),
    false,
  );

  const second = await transformRunManifestFile(runDir);
  assert(second.kind === "ok");
  assertEquals(second.transformed, false);
  assertEquals(second.rewrittenInputs, []);
});

Deno.test("a mirror already carrying indicator_id is stamped but not rewritten", async () => {
  const runDir = await writeScratchPackage({
    indicators: [baseRow("anc1", 1)],
    hfaIndicators: [hfaRowCurrent("ind001", 1)],
  });
  const outcome = await transformRunManifestFile(runDir);
  assert(outcome.kind === "ok");
  assert(outcome.transformed);
  assertEquals(outcome.rewrittenInputs, []);
  assertEquals(
    await exists(join(runDir, "inputs", "hfa_indicators_snapshot.v9.json")),
    false,
  );
});

Deno.test("a mirror without the old value is stamped but not rewritten", async () => {
  const runDir = await writeScratchPackage({
    indicators: [baseRow("anc1", 1), baseRow("anc4", 2)],
  });
  const outcome = await transformRunManifestFile(runDir);
  assert(outcome.kind === "ok");
  assert(outcome.transformed);
  assertEquals(outcome.rewrittenInputs, []);
  assertEquals(
    await exists(join(runDir, "inputs", "indicators.v9.json")),
    false,
  );
  assertEquals(await exists(join(runDir, "manifest.v9.json")), true);
});

Deno.test("a listed mirror that is missing is unreadable, not a defect", async () => {
  const runDir = await writeScratchPackage({ indicators: null });
  const outcome = await transformRunManifestFile(runDir);
  assertEquals(outcome.kind, "unreadable");
});

Deno.test("a row of an unknown type still fail-stops, and nothing is written", async () => {
  const rows = [baseRow("anc1", 1), { ...FORMULA_ROW, type: "formula" }];
  const runDir = await writeScratchPackage({ indicators: rows });
  const mirrorPath = join(runDir, "inputs", "indicators.json");
  const originalBytes = await Deno.readTextFile(mirrorPath);

  await assertRejects(
    () => transformRunManifestFile(runDir),
    RunInputRowSchemaError,
  );
  assertEquals(await Deno.readTextFile(mirrorPath), originalBytes);
  assertEquals(
    await exists(join(runDir, "inputs", "indicators.v9.json")),
    false,
  );
  assertEquals(await exists(join(runDir, "manifest.v9.json")), false);
});
