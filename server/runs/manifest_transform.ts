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
// (none yet — the first is PLAN_EFFECTIVE_FORMAT's indicators[] catalog)
//
// =============================================================================

import {
  RUN_MANIFEST_SCHEMA_VERSION,
  runManifestSchema,
  type RunManifest,
} from "lib";
import { join } from "@std/path";
import { runManifestPath } from "./run_paths.ts";

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
function transformRunManifest(
  manifest: Record<string, unknown>,
  runDir: string,
): Promise<RunManifest> {
  const m = structuredClone(manifest);

  // ─── TRANSFORM BLOCKS ──────────────────────────────────────────────────
  // New blocks go HERE, at the end, numbered sequentially, never reordered.
  // Each checks its own precondition and is idempotent. Blocks re-evaluate on
  // every boot, which is the point: fixing a bad derivation takes effect on
  // the next deploy instead of costing a new schema version.
  void runDir;

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
  return Promise.resolve(validated);
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

  const transformed = await transformRunManifest(stored, runDir);
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
