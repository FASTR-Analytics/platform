import { runManifestSchema, type RunManifest } from "lib";
import {
  packageDirPath,
  packageInputFilePath,
  packageManifestPath,
} from "./run_paths.ts";

// Packages mutate (finalize rewrites them at every project-level act), so
// every manifest read stats the file and re-parses on mtime change — cheap,
// and correct across contexts (finalize hooks and reads can run in different
// workers). Input-file entries are versioned by the manifest's createdAt so
// they roll over with each finalize. Eviction is purely a memory cap
// (manifests embed full module definitions and can reach ~1 MB).

const MAX_CACHED_PACKAGES = 20;

type ManifestEntry = { mtimeMs: number; manifest: RunManifest };

const MANIFEST_CACHE = new Map<string, ManifestEntry>();
const INPUT_JSON_CACHE = new Map<string, unknown>();

// Returns undefined when the package has no manifest yet OR the manifest
// fails to parse (logged loudly) — both mean "rebuild via finalize".
export async function getPackageManifestCached(
  projectId: string,
): Promise<RunManifest | undefined> {
  const path = packageManifestPath(packageDirPath(projectId));
  let mtimeMs: number;
  try {
    const stat = await Deno.stat(path);
    mtimeMs = stat.mtime?.getTime() ?? 0;
  } catch (e) {
    if (e instanceof Deno.errors.NotFound) return undefined;
    throw e;
  }
  const hit = MANIFEST_CACHE.get(projectId);
  if (hit && hit.mtimeMs === mtimeMs) return hit.manifest;

  let manifest: RunManifest;
  try {
    manifest = runManifestSchema.parse(
      JSON.parse(await Deno.readTextFile(path)),
    );
  } catch (e) {
    console.error(
      `[package] UNPARSEABLE manifest for project ${projectId} (will rebuild): ${
        e instanceof Error ? e.message : e
      }`,
    );
    return undefined;
  }
  MANIFEST_CACHE.delete(projectId);
  MANIFEST_CACHE.set(projectId, { mtimeMs, manifest });
  for (const key of INPUT_JSON_CACHE.keys()) {
    if (key.startsWith(`${projectId}|`)) INPUT_JSON_CACHE.delete(key);
  }
  if (MANIFEST_CACHE.size > MAX_CACHED_PACKAGES) {
    const oldest = MANIFEST_CACHE.keys().next().value!;
    MANIFEST_CACHE.delete(oldest);
    for (const key of INPUT_JSON_CACHE.keys()) {
      if (key.startsWith(`${oldest}|`)) INPUT_JSON_CACHE.delete(key);
    }
  }
  return manifest;
}

export function invalidatePackageCaches(projectId: string): void {
  MANIFEST_CACHE.delete(projectId);
  for (const key of INPUT_JSON_CACHE.keys()) {
    if (key.startsWith(`${projectId}|`)) INPUT_JSON_CACHE.delete(key);
  }
}

export async function readPackageInputJsonCached(
  projectId: string,
  manifestCreatedAt: string,
  fileName: string,
): Promise<unknown> {
  const key = `${projectId}|${manifestCreatedAt}|${fileName}`;
  if (INPUT_JSON_CACHE.has(key)) return INPUT_JSON_CACHE.get(key);
  const raw = await Deno.readTextFile(
    packageInputFilePath(packageDirPath(projectId), fileName),
  );
  const parsed = JSON.parse(raw);
  INPUT_JSON_CACHE.set(key, parsed);
  return parsed;
}
