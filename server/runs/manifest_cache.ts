import { RUN_MANIFEST_SCHEMA_VERSION, type RunManifest } from "lib";
import { runDirPath, runInputFilePath } from "./run_paths.ts";
import { transformRunManifestFile } from "./manifest_transform.ts";

// Runs are immutable, so a manifest is read and parsed at most once per runId
// (no mtime stats, no invalidation — a new run is a new key). Eviction is
// purely a memory cap (manifests embed full module definitions and can reach
// ~1 MB). A referenced run with a missing or unparseable manifest is an
// operational error and throws loudly — there is no rebuild path at read time.

const MAX_CACHED_RUNS = 20;

const MANIFEST_CACHE = new Map<string, RunManifest>();
const INPUT_JSON_CACHE = new Map<string, unknown>();

export async function getRunManifestCached(runId: string): Promise<RunManifest> {
  const hit = MANIFEST_CACHE.get(runId);
  if (hit) return hit;

  // A package can arrive after boot — by rsync, by backup restore, or copied
  // from another instance — so the load path transforms too, with the same
  // function as the boot sweep, before the cache set (that cache has no
  // invalidation, because packages are immutable).
  const outcome = await transformRunManifestFile(runDirPath(runId));
  if (outcome.kind === "unreadable") {
    throw new Error(`Run ${runId} is not readable (${outcome.reason})`);
  }
  // A FUTURE version is not invalid data — it is data not for this server, so
  // this package is unavailable rather than a fatal error.
  if (outcome.kind === "future") {
    throw new Error(
      `Run ${runId} has manifest schema version ${outcome.version}, this server requires ${RUN_MANIFEST_SCHEMA_VERSION} — it was written by a newer server and is not available here`,
    );
  }
  const manifest = outcome.manifest;
  MANIFEST_CACHE.set(runId, manifest);
  if (MANIFEST_CACHE.size > MAX_CACHED_RUNS) {
    const oldest = MANIFEST_CACHE.keys().next().value!;
    MANIFEST_CACHE.delete(oldest);
    for (const key of INPUT_JSON_CACHE.keys()) {
      if (key.startsWith(`${oldest}|`)) INPUT_JSON_CACHE.delete(key);
    }
  }
  return manifest;
}

// A deleted run's entries are dead weight, not a correctness hazard (a
// deleted run can never be attached, and run ids are never reused), so this
// is memory hygiene at the one moment a run stops existing.
export function evictRunFromManifestCache(runId: string): void {
  MANIFEST_CACHE.delete(runId);
  for (const key of INPUT_JSON_CACHE.keys()) {
    if (key.startsWith(`${runId}|`)) INPUT_JSON_CACHE.delete(key);
  }
}

export async function readRunInputJsonCached(
  runId: string,
  fileName: string,
): Promise<unknown> {
  const key = `${runId}|${fileName}`;
  if (INPUT_JSON_CACHE.has(key)) return INPUT_JSON_CACHE.get(key);
  const raw = await Deno.readTextFile(
    runInputFilePath(runDirPath(runId), fileName),
  );
  const parsed = JSON.parse(raw);
  INPUT_JSON_CACHE.set(key, parsed);
  return parsed;
}
