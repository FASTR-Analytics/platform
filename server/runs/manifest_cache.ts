import { runManifestSchema, type RunManifest } from "lib";
import { runDirPath, runInputFilePath, runManifestPath } from "./run_paths.ts";

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

  const path = runManifestPath(runDirPath(runId));
  let manifest: RunManifest;
  try {
    manifest = runManifestSchema.parse(JSON.parse(await Deno.readTextFile(path)));
  } catch (e) {
    throw new Error(
      `Run ${runId} is not readable (${e instanceof Error ? e.message : e})`,
    );
  }
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
