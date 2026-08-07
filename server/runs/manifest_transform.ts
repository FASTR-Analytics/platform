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
//   1. indicators[] — the per-module resolved indicator catalog (schema v3),
//      recomputed from the package's own input mirrors.
//   2. metrics[].format_as → "indicator" for the 8 pre-declaration metrics
//      (schema v4) — the declared-format migration (PLAN_EFFECTIVE_FORMAT).
//
// =============================================================================

import {
  RUN_MANIFEST_SCHEMA_VERSION,
  runManifestSchema,
  runModuleSchema,
  type RunManifest,
} from "lib";
import { z } from "zod";
import { join } from "@std/path";
import {
  buildRunIndicatorCatalog,
  runDirInputRowsReader,
  RunInputReadError,
} from "./indicator_catalog.ts";
import { runManifestPath } from "./run_paths.ts";

// Block 2's frozen id list — see the block comment. Never grows.
const INDICATOR_FORMAT_METRIC_IDS = [
  "m7-01-01",
  "m7-01-02",
  "m7-01-03",
  "m8-01-01",
  "m10-01-01",
  "m10-01-02",
  "m10-03-01",
  "m10-03-02",
];

// A package directory can be missing, half-written, or written by a newer
// server, and none of those are "invalid data" — only the last two rows of
// the protocol's failure table are code defects, and those throw.
export type RunManifestOutcome =
  | { kind: "ok"; manifest: RunManifest; transformed: boolean }
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

// Blocks may READ anything under `runDir` and must never write to it — every
// file a block reads becomes a permanent part of the package format.
async function transformRunManifest(
  manifest: Record<string, unknown>,
  runDir: string,
): Promise<RunManifest> {
  const m = structuredClone(manifest);

  // ─── TRANSFORM BLOCKS ──────────────────────────────────────────────────
  // New blocks go HERE, at the end, numbered sequentially, never reordered.
  // Each checks its own precondition, is idempotent, and STAMPS the version
  // it produces — the stamp lives inside the block, so a missing block leaves
  // the version behind and the assertion below catches it. Blocks run only
  // when the version gate forces the transform (they do NOT re-evaluate on a
  // boot where the manifest is already current), so fixing a bad derivation
  // requires a RUN_MANIFEST_SCHEMA_VERSION bump to reach existing packages.

  // 1. indicators[] — the per-module resolved indicator catalog. A pure
  //    recompute from inputs/*.json through the SAME function the finalize
  //    writer uses, so this is not a second derivation that could drift.
  //    Unconditional rather than "only when absent": re-running the recompute
  //    is free correctness on any forced pass, and the no-op write guard
  //    keeps an unchanged package from churning.
  m.indicators = await buildRunIndicatorCatalog(
    z.array(runModuleSchema).parse(m.modules ?? []),
    runDirInputRowsReader(
      runDir,
      z.array(z.string()).parse(m.inputFiles ?? []),
    ),
  );
  m.manifestSchemaVersion = 3;

  // 2. metrics[].format_as → "indicator" for the 8 metrics whose two-way
  //    declaration predates the declared-format design (values ARE the
  //    displayed indicator's own quantity). Frozen history — this list
  //    rewrites data written before the declaration existed and never grows;
  //    the same frozen list appears in project migration 039 and the
  //    figure-block sweep. metrics[] is generation-only provenance, but a
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

  const validated = runManifestSchema.parse(m);
  // The schema deliberately accepts ANY integer version — it has to, so a
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
  return validated;
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
    return { kind: "ok", manifest: asStored.data, transformed: false };
  }

  let transformed: RunManifest;
  try {
    transformed = await transformRunManifest(stored, runDir);
  } catch (e) {
    // F5: a listed input mirror missing or unparseable on disk is the same
    // operational class as a missing manifest — degrade this package, keep
    // booting. Anything else (schema drift, a missing block) still throws.
    if (e instanceof RunInputReadError) {
      return { kind: "unreadable", reason: e.message };
    }
    throw e;
  }
  const nextBytes = serializeRunManifest(transformed);
  // Output identical to stored (a forced-gate false positive)? Skip the write
  // so no package churns on every boot.
  if (nextBytes === storedBytes) {
    return { kind: "ok", manifest: transformed, transformed: false };
  }

  await persistRunManifest(runDir, path, storedBytes, nextBytes, storedVersion);
  return { kind: "ok", manifest: transformed, transformed: true };
}

// Must stay byte-identical to how buildRunPackageIntoTmp writes it, otherwise
// the no-op guard above never fires.
function serializeRunManifest(manifest: RunManifest): string {
  return JSON.stringify(manifest, null, 2);
}

// Transform in memory, parse, THEN persist — there is nothing to restore from
// if it fails. The pre-transform copy is what makes both a bad block and an
// image rollback recoverable. The temp name is unique, never fixed, so two
// writers can never share it; nothing sweeps a leftover temp MANIFEST
// (sweepAbandonedTmpRunDirs matches directories at the runs root), hence the
// finally.
//
// No lock, on this premise: `await dbStartUp()` is top-level in main.ts before
// any serving begins, and every getRunManifestCached caller is main-realm — no
// Web Worker reads a manifest. Re-check this if one ever does.
async function persistRunManifest(
  runDir: string,
  path: string,
  storedBytes: string,
  nextBytes: string,
  storedVersion: unknown,
): Promise<void> {
  const label = typeof storedVersion === "number" ? `v${storedVersion}` : "vx";
  await Deno.writeTextFile(join(runDir, `manifest.${label}.json`), storedBytes);

  const tmpPath = join(runDir, `.tmp-manifest-${crypto.randomUUID()}.json`);
  try {
    await Deno.writeTextFile(tmpPath, nextBytes);
    await Deno.rename(tmpPath, path);
  } finally {
    await Deno.remove(tmpPath).catch(() => {});
  }
}

function errText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
