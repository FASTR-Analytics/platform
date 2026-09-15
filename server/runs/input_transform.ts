// =============================================================================
// DATA TRANSFORM: results package input mirrors (inputs/*.json)
// =============================================================================
//
// Artifact: {_RUNS_DIR_PATH}/{runId}/inputs/*.json, the mirrors the manifest's
//           `inputFiles` lists
// Gate:     RUN_MANIFEST_SCHEMA_VERSION (lib/types/run_manifest.ts). There is
//           no second version integer: an input block names the manifest
//           version that first carries it, and that version's manifest block
//           is the stamp.
//
// PROTOCOL_APP_MIGRATIONS.md § "Run Input Transforms" is authoritative for
// everything about this file: the pattern, the rename-or-recompute-never-invent
// rule, the write order, the failure policy, and the checklist for adding a
// block. Read it before touching this.
//
// INPUT TRANSFORM BLOCKS:
//   1. inputs/indicators.json: rows whose `type` is "derived" read
//      "calculated" (manifest v10, stamped by manifest block 8): the formula
//      indicator type's rename.
//
// =============================================================================

import { readRunInputJson } from "./indicator_catalog.ts";
import { runInputFilePath } from "./run_paths.ts";

// A mirror the stage rewrote, held until the manifest parses: the manifest
// blocks read `rows` from memory through the reader overlay, and
// transformRunManifestFile persists `nextBytes` before the manifest.
export type PendingInputWrite = {
  inputFile: string;
  fileName: string;
  path: string;
  rows: unknown;
  storedBytes: string;
  nextBytes: string;
};

// Runs every input block over the mirrors the package lists and returns the
// rewritten ones. Persists nothing. A mirror is read at most once, through the
// shared helper, so unavailable bytes or invalid JSON raise RunInputReadError
// from one place; anything else a block throws is a code defect. Rows are not
// validated here: the strict row schemas in indicator_catalog.ts run after
// this stage, so a mirror it could not bring current still fail-stops boot.
export async function transformRunInputs(
  runDir: string,
  inputFiles: string[],
): Promise<PendingInputWrite[]> {
  const mirrors = new MirrorSet(runDir, inputFiles);

  // ─── INPUT TRANSFORM BLOCKS ────────────────────────────────────────────
  // New blocks go HERE, at the end, numbered sequentially, never reordered.
  // Each checks its own precondition and is idempotent. A block renames a
  // value or a key, or recomputes a field from files already in the package;
  // it never adds a fact those files do not hold, fills a null, drops a row,
  // or reads the database or live instance state. Blocks run only on a forced
  // manifest pass, so a fix requires a RUN_MANIFEST_SCHEMA_VERSION bump to
  // reach existing packages.

  // 1. indicators.json `type` "derived" → "calculated". The stored value is
  //    the formula type's code name when the package was written, and the
  //    code renamed it. A row without the old value is untouched; a mirror
  //    with none is left unwritten by the byte guard below.
  for (const row of await mirrors.rows("indicators.json")) {
    if (row.type === "derived") row.type = "calculated";
  }

  return mirrors.pendingWrites();
}

type LoadedMirror = {
  fileName: string;
  storedBytes: string;
  json: unknown;
};

// The mirrors a pass has opened, each read once and mutated in memory. A
// mirror the package does not list is never opened.
class MirrorSet {
  private readonly loaded = new Map<string, LoadedMirror | null>();

  constructor(
    private readonly runDir: string,
    private readonly inputFiles: string[],
  ) {}

  // The mirror's rows as mutable records, or none when the package does not
  // carry the file or its JSON is not an array of objects (the row schema
  // rejects that later, which is where the defect belongs).
  async rows(fileName: string): Promise<Record<string, unknown>[]> {
    const mirror = await this.load(fileName);
    if (mirror === null || !Array.isArray(mirror.json)) return [];
    return mirror.json.filter(isRecord);
  }

  pendingWrites(): PendingInputWrite[] {
    const writes: PendingInputWrite[] = [];
    for (const mirror of this.loaded.values()) {
      if (mirror === null) continue;
      // Serialized exactly as prepare_inputs.ts writes a mirror, so an
      // unchanged mirror round-trips to its stored bytes and is skipped.
      const nextBytes = JSON.stringify(mirror.json);
      if (nextBytes === mirror.storedBytes) continue;
      writes.push({
        inputFile: `inputs/${mirror.fileName}`,
        fileName: mirror.fileName,
        path: runInputFilePath(this.runDir, mirror.fileName),
        rows: mirror.json,
        storedBytes: mirror.storedBytes,
        nextBytes,
      });
    }
    return writes;
  }

  private async load(fileName: string): Promise<LoadedMirror | null> {
    const hit = this.loaded.get(fileName);
    if (hit !== undefined) return hit;
    if (!this.inputFiles.includes(`inputs/${fileName}`)) {
      this.loaded.set(fileName, null);
      return null;
    }
    const { bytes, json } = await readRunInputJson(this.runDir, fileName);
    const mirror = { fileName, storedBytes: bytes, json };
    this.loaded.set(fileName, mirror);
    return mirror;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
