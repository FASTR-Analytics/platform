import { runManifestSchema, type RunManifest } from "lib";
import { runDirPath, runInputFilePath, runManifestPath } from "./run_paths.ts";

// Runs are immutable, so these caches never invalidate — eviction is purely a
// memory cap (manifests embed full module definitions and can reach ~1 MB).

const MAX_CACHED_RUNS = 20;

const MANIFEST_CACHE = new Map<string, RunManifest>();
const INPUT_JSON_CACHE = new Map<string, unknown>();

export async function getRunManifestCached(runId: string): Promise<RunManifest> {
  const hit = MANIFEST_CACHE.get(runId);
  if (hit) return hit;
  const raw = await Deno.readTextFile(runManifestPath(runDirPath(runId)));
  const manifest = runManifestSchema.parse(JSON.parse(raw));
  MANIFEST_CACHE.set(runId, manifest);
  if (MANIFEST_CACHE.size > MAX_CACHED_RUNS) {
    const oldest = MANIFEST_CACHE.keys().next().value!;
    MANIFEST_CACHE.delete(oldest);
    for (const key of INPUT_JSON_CACHE.keys()) {
      if (key.startsWith(`${oldest}/`)) INPUT_JSON_CACHE.delete(key);
    }
  }
  return manifest;
}

export async function readRunInputJsonCached(
  runId: string,
  fileName: string,
): Promise<unknown> {
  const key = `${runId}/${fileName}`;
  if (INPUT_JSON_CACHE.has(key)) return INPUT_JSON_CACHE.get(key);
  const raw = await Deno.readTextFile(
    runInputFilePath(runDirPath(runId), fileName),
  );
  const parsed = JSON.parse(raw);
  INPUT_JSON_CACHE.set(key, parsed);
  return parsed;
}
