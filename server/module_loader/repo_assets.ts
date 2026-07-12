import { join } from "@std/path";
import { MODULE_REGISTRY, type RepoAssetToImport } from "lib";
import {
  _ASSETS_DIR_PATH,
  _GITHUB_TOKEN,
  _MODULES_LOCAL_DIR,
} from "../exposed_env_vars.ts";
import { MODULE_SOURCE } from "./module_source.ts";

// Content-addressed cache of pinned modules-repo assets (PLAN_RESULTS_RUNS
// item 2 ruling, 2026-07-13): a definition's {name, repoPath, commit, sha256}
// entry is fetched from the modules repo at the pinned commit, verified
// against sha256, and stored at {ASSETS_DIR}/repo_assets/{sha256}. Cache
// entries are immutable by construction — a hit never refetches. In dev
// (local module source) the file is read from the modules-repo working tree;
// a sha mismatch there means the pin wasn't rebuilt after the data file
// changed, and fails loudly either way. Module containers stay network-free:
// only the Deno process fetches, at definition resolution and (cache-miss
// fallback) at module run.

const REPO_ASSETS_DIR = join(_ASSETS_DIR_PATH, "repo_assets");

export async function ensureRepoAssetCached(
  moduleId: string,
  pin: RepoAssetToImport,
): Promise<string> {
  const cachePath = join(REPO_ASSETS_DIR, pin.sha256);
  try {
    await Deno.stat(cachePath);
    return cachePath;
  } catch (e) {
    if (!(e instanceof Deno.errors.NotFound)) throw e;
  }
  const bytes = await fetchPinnedBytes(moduleId, pin);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const sha256 = [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  if (sha256 !== pin.sha256) {
    throw new Error(
      `Pinned repo asset "${pin.name}" (${pin.repoPath} @ ${pin.commit}): sha256 mismatch — expected ${pin.sha256}, got ${sha256}`,
    );
  }
  await Deno.mkdir(REPO_ASSETS_DIR, { recursive: true });
  const tmpPath = `${cachePath}.tmp-${crypto.randomUUID().slice(0, 8)}`;
  await Deno.writeFile(tmpPath, bytes);
  await Deno.rename(tmpPath, cachePath);
  return cachePath;
}

async function fetchPinnedBytes(
  moduleId: string,
  pin: RepoAssetToImport,
): Promise<Uint8Array<ArrayBuffer>> {
  if (MODULE_SOURCE === "local") {
    return await Deno.readFile(join(_MODULES_LOCAL_DIR, pin.repoPath));
  }
  const registryEntry = MODULE_REGISTRY.find((m) => m.id === moduleId);
  if (!registryEntry) {
    throw new Error(`Module "${moduleId}" not found in registry`);
  }
  const { owner, repo } = registryEntry.github;
  const url =
    `https://raw.githubusercontent.com/${owner}/${repo}/${pin.commit}/${pin.repoPath}`;
  const headers: Record<string, string> = {};
  if (_GITHUB_TOKEN) {
    headers["Authorization"] = `Bearer ${_GITHUB_TOKEN}`;
  }
  const res = await fetch(url, { headers });
  if (!res.ok) {
    throw new Error(
      `Failed to fetch pinned repo asset "${pin.name}" (${url}): ${res.status} ${res.statusText}`,
    );
  }
  return new Uint8Array(await res.arrayBuffer());
}
