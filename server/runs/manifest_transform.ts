// =============================================================================
// DATA TRANSFORM: results package manifest.json
// =============================================================================
//
// Artifact: {_RUNS_DIR_PATH}/{runId}/manifest.json
// Schema:   lib/types/run_manifest.ts → runManifestSchema
//                                       (RUN_MANIFEST_SCHEMA_VERSION)
//
// PROTOCOL_APP_MIGRATIONS.md § "Run manifest transforms" is authoritative for
// everything about this file: the pattern, the recompute-never-invent
// invariant, the failure policy, and the checklist for adding a block. Read it
// before touching this.
//
// TRANSFORM BLOCKS:
//   1. indicators[]: the per-module resolved indicator catalog (schema v3),
//      recomputed from the package's own input mirrors.
//   2. metrics[].format_as → "indicator" for the 8 pre-declaration metrics
//      (schema v4): the declared-format migration (PLAN_EFFECTIVE_FORMAT).
//   3. facilityColumnsConfig → per-family structureSchemaHmis/Hfa slots
//      (schema v5): the structure family split (PLAN_2). Pure copy, no
//      recompute, no parquet read.
//   4. hmisIndicators stamped from the package's own indicators mirror,
//      metrics[].catalog_expression_evaluation defaulted to null, and the
//      `population` stamp defaulted to null (schema v6), the
//      indicator restructure (PLAN_1a §1.9) and the population store
//      (PLAN_1b), one release. Note what this
//      block does NOT do: it never patches indicators[]. Block 1 recomputes
//      that catalog unconditionally on every forced pass through
//      buildRunIndicatorCatalog, and the v6 additions to it (sort_order for
//      legacy packages, the type/expression/slot_map fields) live inside that
//      one derivation. A second derivation here would be wiped and re-applied
//      on every future bump.
//   5. population.active recomputed from the stamp's own type list and
//      population.coverage carried forward as null (schema v7): m012 works on
//      the intersection of population and HMIS data, and the stamp records
//      what a generation covered.
//   6. the `commonIndicators` key dropped (schema v8): block 4 stamps the
//      same list as `hmisIndicators` (PLAN_A4 ruling 13), so this is a key
//      rename and nothing else.
//   7. hmisIndicators entries carry the interpretation facts (schema v9):
//      block 4's recompute already writes the new shape on every forced
//      pass, so this block only stamps.
//   8. the indicators mirror's `derived` rows read `calculated` (schema v10):
//      input block 1 (input_transform.ts) rewrites the mirror before block 1
//      runs, and blocks 1 and 4 recompute from it, so this block only
//      stamps.
//   9. the hfa_indicators_snapshot mirror's `var_name` key reads
//      `indicator_id` (schema v11): input block 2 rewrites the mirror before
//      block 1 runs and block 1 recomputes from it, so this block only
//      stamps.
//
// The input mirrors' own blocks are listed in input_transform.ts
// (INPUT TRANSFORM BLOCKS); they run behind this file's version gate.
//
// =============================================================================

import {
  INDICATOR_FORMAT_METRIC_IDS,
  RUN_MANIFEST_SCHEMA_VERSION,
  type RunManifest,
  runManifestSchema,
  runModuleSchema,
} from "lib";
import { z } from "zod";
import { dirname, join } from "@std/path";
import {
  buildRunHmisIndicators,
  buildRunIndicatorCatalog,
  runDirInputRowsReader,
  RunInputReadError,
} from "./indicator_catalog.ts";
import {
  type PendingInputWrite,
  transformRunInputs,
} from "./input_transform.ts";
import { runManifestPath } from "./run_paths.ts";

// A package directory can be missing, half-written, or written by a newer
// server, and none of those are "invalid data": only the last two rows of
// the protocol's failure table are code defects, and those throw.
// `transformed` reports the manifest alone; `rewrittenInputs` names the
// mirrors (as `inputFiles` entries) the input stage rewrote on this pass.
export type RunManifestOutcome =
  | {
    kind: "ok";
    manifest: RunManifest;
    transformed: boolean;
    rewrittenInputs: string[];
  }
  | { kind: "unreadable"; reason: string }
  | { kind: "future"; version: number };

// The forced skip-gate (po_config.ts's configNeedsForcedTransform, reading a
// version field instead of scanning for legacy keys). A parse-only gate is
// wrong here: a manifest from a NEWER server parses under this schema with its
// additions silently stripped, so parse success alone cannot discriminate
// "current shape" from "newer shape we would serve wrong".
function manifestNeedsForcedTransform(
  manifest: Record<string, unknown>,
): boolean {
  return manifest.manifestSchemaVersion !== RUN_MANIFEST_SCHEMA_VERSION;
}

// Manifest blocks may READ anything under `runDir` and never write to the
// package: every file a block reads becomes a permanent part of the package
// format. The input stage is the one writer of a mirror. It runs before the
// blocks, so every block reads a mirror that is already current, and its
// writes land only after the manifest parses (transformRunManifestFile).
async function transformRunManifest(
  manifest: Record<string, unknown>,
  runDir: string,
): Promise<{ manifest: RunManifest; pendingInputs: PendingInputWrite[] }> {
  const m = structuredClone(manifest);
  const inputFiles = z.array(z.string()).parse(m.inputFiles ?? []);

  const pendingInputs = await transformRunInputs(runDir, inputFiles);
  const readRows = runDirInputRowsReader(
    runDir,
    inputFiles,
    new Map(pendingInputs.map((w) => [w.fileName, w.rows])),
  );

  // ─── TRANSFORM BLOCKS ──────────────────────────────────────────────────
  // New blocks go HERE, at the end, numbered sequentially, never reordered.
  // Each checks its own precondition, is idempotent, and STAMPS the version
  // it produces: the stamp lives inside the block, so a missing block leaves
  // the version behind and the assertion below catches it. Blocks run only
  // when the version gate forces the transform (they do NOT re-evaluate on a
  // boot where the manifest is already current), so fixing a bad derivation
  // requires a RUN_MANIFEST_SCHEMA_VERSION bump to reach existing packages.

  // 1. indicators[]: the per-module resolved indicator catalog. A pure
  //    recompute from inputs/*.json through the SAME function the finalize
  //    writer uses, so this is not a second derivation that could drift.
  //    Unconditional rather than "only when absent": re-running the recompute
  //    is free correctness on any forced pass, and the no-op write guard
  //    keeps an unchanged package from churning.
  m.indicators = await buildRunIndicatorCatalog(
    z.array(runModuleSchema).parse(m.modules ?? []),
    readRows,
  );
  m.manifestSchemaVersion = 3;

  // 2. metrics[].format_as → "indicator" for the 8 metrics whose two-way
  //    declaration predates the declared-format design (values ARE the
  //    displayed indicator's own quantity). The id list is
  //    INDICATOR_FORMAT_METRIC_IDS (lib), which is authoritative for both this
  //    repair and the fetch-boundary normalization that keeps new manifests
  //    from needing it. metrics[] is generation-only provenance, but a
  //    targeted value rewrite is not invention: the ids and their new value
  //    are facts of the migration itself, not synthesized provenance.
  if (Array.isArray(m.metrics)) {
    for (const metric of m.metrics as Record<string, unknown>[]) {
      if (
        typeof metric.id === "string" &&
        INDICATOR_FORMAT_METRIC_IDS.includes(metric.id)
      ) {
        metric.format_as = "indicator";
      }
    }
  }
  m.manifestSchemaVersion = 4;

  // 3. facilityColumnsConfig → structureSchemaHmis / structureSchemaHfa. A
  //    pure copy: every artefact in a legacy package (export CSVs, the
  //    availableDisaggregationOptions stamps, the manifest stamp) was built
  //    from that one global config, so copying it into each PRESENT family's
  //    slot is exactly faithful, no stamp recompute, no parquet read, no
  //    behavioural change to any existing package. A family is present when
  //    its facilities parquet is in the package (facilitiesTables/inputFiles);
  //    absent families get null. Idempotent: copies only while the legacy key
  //    is still present.
  if ("facilityColumnsConfig" in m) {
    const legacy = m.facilityColumnsConfig ?? null;
    const tables = Array.isArray(m.facilitiesTables) ? m.facilitiesTables : [];
    const inputFiles = Array.isArray(m.inputFiles) ? m.inputFiles : [];
    const familyPresent = (family: "hmis" | "hfa"): boolean =>
      tables.some((t) =>
        (t as Record<string, unknown>).tableName === `facilities_${family}`
      ) || inputFiles.includes(`inputs/facilities_${family}.parquet`);
    m.structureSchemaHmis = familyPresent("hmis") ? legacy : null;
    m.structureSchemaHfa = familyPresent("hfa") ? legacy : null;
    delete m.facilityColumnsConfig;
  }
  m.manifestSchemaVersion = 5;

  // 4. hmisIndicators + metrics[].catalog_expression_evaluation +
  //    population. The first is a recompute from the package's own indicators
  //    mirror through the SAME function finalize stamps with: it moves the
  //    last per-request mirror read off the read path. The other two are not
  //    recomputes at all: metrics[] and the person-years stamp are
  //    generation-only provenance, so a field that did not exist when the
  //    package was written is carried forward as null, never synthesized
  //    (a pre-1b package has no inputs/population.csv, and the stamp says
  //    so). All three are idempotent.
  m.hmisIndicators = await buildRunHmisIndicators(readRows);
  if (Array.isArray(m.metrics)) {
    for (const metric of m.metrics as Record<string, unknown>[]) {
      if (metric.catalog_expression_evaluation === undefined) {
        metric.catalog_expression_evaluation = null;
      }
    }
  }
  if (m.population === undefined) {
    m.population = null;
  }
  m.manifestSchemaVersion = 6;

  // 5. population.active + population.coverage. `active` is a recompute from
  //    the stamp's own type list: a v6 capture wrote person-years exactly when
  //    a formula named a population. `coverage` is generation-only
  //    provenance: a v6 capture refused any shortfall but recorded nothing,
  //    so it is carried forward as null, never synthesized. Both idempotent.
  if (m.population !== null && typeof m.population === "object") {
    const population = m.population as Record<string, unknown>;
    if (population.active === undefined) {
      population.active = Array.isArray(population.populationTypes) &&
        population.populationTypes.length > 0;
    }
    if (population.coverage === undefined) {
      population.coverage = null;
    }
  }
  m.manifestSchemaVersion = 7;

  // 6. `commonIndicators` → `hmisIndicators` (PLAN_A4 ruling 13). Block 4
  //    already stamps the list under its new name on every forced pass, so
  //    the only work is dropping the legacy key. Idempotent.
  delete m.commonIndicators;
  m.manifestSchemaVersion = 8;

  // 7. hmisIndicators entries gained format_as, direction, target, thresholds
  //    and a calculated indicator's expression, in dictionary order. Block 4
  //    recomputes the list through the same function finalize stamps with,
  //    so the shape is already current here; the stamp is the whole block.
  m.manifestSchemaVersion = 9;

  // 8. The indicators mirror's `derived` rows read `calculated`: input block 1
  //    rewrote the mirror before block 1 ran, and blocks 1 and 4 recomputed
  //    the catalog and hmisIndicators from it on this pass, so the manifest's
  //    own shape is unchanged and the stamp is the whole block.
  m.manifestSchemaVersion = 10;

  // 9. The hfa_indicators_snapshot mirror's rows carry `indicator_id`: input
  //    block 2 rewrote the mirror before block 1 ran, and block 1 recomputed
  //    the catalog from it on this pass, so the manifest's own shape is
  //    unchanged and the stamp is the whole block.
  m.manifestSchemaVersion = 11;

  const validated = runManifestSchema.parse(m);
  // The schema deliberately accepts ANY integer version: it has to, so a
  // manifest from a newer server can be detected rather than rejected as
  // malformed. So the version is asserted separately: a manifest still below
  // the current version after every block ran means the block for that step
  // is missing, which is a code defect and must fail boot exactly as a Zod
  // failure does.
  if (validated.manifestSchemaVersion !== RUN_MANIFEST_SCHEMA_VERSION) {
    throw new Error(
      `manifest is still at schema version ${validated.manifestSchemaVersion} after the transform ran (this server requires ${RUN_MANIFEST_SCHEMA_VERSION}) — a transform block is missing`,
    );
  }
  return { manifest: validated, pendingInputs };
}

// The one entry point: gate, transform, persist.
export async function transformRunManifestFile(
  runDir: string,
): Promise<RunManifestOutcome> {
  const path = runManifestPath(runDir);

  let storedBytes: string;
  try {
    storedBytes = await Deno.readTextFile(path);
  } catch (e) {
    return {
      kind: "unreadable",
      reason: `manifest.json could not be read (${errText(e)})`,
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(storedBytes);
  } catch (e) {
    return {
      kind: "unreadable",
      reason: `manifest.json is not valid JSON (${errText(e)})`,
    };
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { kind: "unreadable", reason: "manifest.json is not a JSON object" };
  }
  const stored = parsed as Record<string, unknown>;

  const storedVersion = stored.manifestSchemaVersion;
  if (
    typeof storedVersion === "number" &&
    storedVersion > RUN_MANIFEST_SCHEMA_VERSION
  ) {
    return { kind: "future", version: storedVersion };
  }

  const asStored = runManifestSchema.safeParse(stored);
  if (asStored.success && !manifestNeedsForcedTransform(stored)) {
    return {
      kind: "ok",
      manifest: asStored.data,
      transformed: false,
      rewrittenInputs: [],
    };
  }

  let transformed: RunManifest;
  let pendingInputs: PendingInputWrite[];
  try {
    ({ manifest: transformed, pendingInputs } = await transformRunManifest(
      stored,
      runDir,
    ));
  } catch (e) {
    // F5: a listed input mirror whose bytes are unavailable is the same
    // operational class as a missing manifest: degrade this package, keep
    // booting. Everything else throws: a mirror that parses as JSON but not as
    // its row schema is drift (RunInputRowSchemaError), same as manifest
    // drift or a missing block. See RunInputReadError in indicator_catalog.ts.
    if (e instanceof RunInputReadError) {
      return { kind: "unreadable", reason: e.message };
    }
    throw e;
  }
  const nextBytes = serializeRunManifest(transformed);
  const retainLabel = typeof storedVersion === "number"
    ? `v${storedVersion}`
    : "vx";

  // Mirrors first, manifest second: the order and its reason are in
  // PROTOCOL_APP_MIGRATIONS.md § "Run Input Transforms". The manifest's no-op
  // guard below gates the manifest write alone, never these.
  for (const write of pendingInputs) {
    await persistPackageFile({
      path: write.path,
      retainLabel,
      storedBytes: write.storedBytes,
      nextBytes: write.nextBytes,
    });
  }
  const rewrittenInputs = pendingInputs.map((w) => w.inputFile);

  // Output identical to stored (a forced-gate false positive)? Skip the write
  // so no package churns on every boot.
  if (nextBytes === storedBytes) {
    return {
      kind: "ok",
      manifest: transformed,
      transformed: false,
      rewrittenInputs,
    };
  }

  await persistPackageFile({ path, retainLabel, storedBytes, nextBytes });
  return {
    kind: "ok",
    manifest: transformed,
    transformed: true,
    rewrittenInputs,
  };
}

// Must stay byte-identical to how buildRunPackageIntoTmp writes it, otherwise
// the no-op guard above never fires.
function serializeRunManifest(manifest: RunManifest): string {
  return JSON.stringify(manifest, null, 2);
}

// The one persist path for a package file, manifest or mirror. Transform in
// memory, parse, THEN persist: there is nothing to restore from if it fails.
// The pre-transform copy (`<name>.<label>.json` beside the file, the label
// being the stored manifest version) is what makes both a bad block and an
// image rollback recoverable. The temp name is unique, never fixed, so two
// writers can never share it; nothing sweeps a leftover temp FILE
// (sweepAbandonedTmpRunDirs matches directories at the runs root), hence the
// finally.
//
// No lock, on this premise: `await dbStartUp()` is top-level in main.ts before
// any serving begins, and every getRunManifestCached caller is main-realm: no
// Web Worker reads a manifest. Re-check this if one ever does.
async function persistPackageFile(args: {
  path: string;
  retainLabel: string;
  storedBytes: string;
  nextBytes: string;
}): Promise<void> {
  const dir = dirname(args.path);
  const stem = args.path.slice(dir.length + 1).replace(/\.json$/, "");
  await Deno.writeTextFile(
    join(dir, `${stem}.${args.retainLabel}.json`),
    args.storedBytes,
  );

  const tmpPath = join(dir, `.tmp-${stem}-${crypto.randomUUID()}.json`);
  try {
    await Deno.writeTextFile(tmpPath, args.nextBytes);
    await Deno.rename(tmpPath, args.path);
  } finally {
    await Deno.remove(tmpPath).catch(() => {});
  }
}

function errText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
