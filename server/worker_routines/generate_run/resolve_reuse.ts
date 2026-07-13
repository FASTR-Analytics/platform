import type { Sql } from "postgres";
import { getAssetToImportName, type DatasetType, type RunModule } from "lib";
import { getRunManifestCached, runDirPath } from "../../runs/mod.ts";
import { resolveAssetFilePath } from "../../db/instance/assets.ts";
import { R_DOCKER_IMAGE_TAG } from "../run_module/r_docker_image.ts";
import { computeModuleInputKey, sha256HexOfFile } from "./input_key.ts";
import type { ResolvedRunModule } from "./resolve_modules.ts";

// §3.7 memoized generation (PLAN_RESULTS_RUNS item 3). A module reuses the
// base run's outputs iff its inputKey — computed from the actual inputs of
// THIS generation — equals the base manifest's recorded key. The base run is
// the project's attached run, else its latest ready run (single base, no
// catalog-wide search). Synthetic-backfill runs carry null keys and are never
// reuse sources. Everything here fails closed: an unreadable base manifest, a
// missing hash, or a key mismatch only ever costs a re-run, never wrong data.

export type BaseRun = {
  runId: string;
  runDir: string;
  modulesById: Map<string, RunModule>;
};

export async function resolveBaseRun(
  mainDb: Sql,
  projectId: string,
): Promise<BaseRun | null> {
  const attached = await mainDb<{ run_id: string | null }[]>`
SELECT run_id FROM projects WHERE id = ${projectId}
`;
  let runId = attached.at(0)?.run_id ?? null;
  if (runId === null) {
    const latest = await mainDb<{ id: string }[]>`
SELECT id FROM runs
WHERE status = 'ready' AND summary::jsonb ->> 'sourceProjectId' = ${projectId}
ORDER BY created_at DESC
LIMIT 1
`;
    runId = latest.at(0)?.id ?? null;
  }
  if (runId === null) return null;
  try {
    const manifest = await getRunManifestCached(runId);
    return {
      runId,
      runDir: runDirPath(runId),
      modulesById: new Map(manifest.modules.map((m) => [m.id, m])),
    };
  } catch (e) {
    console.error(
      `[generate_run] base run ${runId} unreadable — no reuse this generation: ${
        e instanceof Error ? e.message : e
      }`,
    );
    return null;
  }
}

// The module's declared inputs as {name, sha256} pairs — the inputKey
// ingredients (§2.2). Assets are hashed at their SOURCE (pinned repo assets
// carry their sha256; instance assets are hashed in the Assets dir), so the
// key can be computed before anything is copied into the workspace. Every
// upstream the module can read from contributes ALL its output hashes —
// coarser than the per-file declaration, which only ever costs a wasted
// re-run.
export async function computeModuleInputs(
  mod: ResolvedRunModule,
  datasetExtractHashes: Map<DatasetType, string>,
  upstreamOutputHashes: Map<string, Record<string, string>>,
  assetHashCache: Map<string, string>,
): Promise<{ name: string; sha256: string }[]> {
  const moduleId = mod.moduleId;
  const inputHashes: { name: string; sha256: string }[] = [];
  for (const asset of mod.detail.assetsToImport) {
    const assetName = getAssetToImportName(asset);
    if (typeof asset !== "string") {
      inputHashes.push({ name: `assets/${assetName}`, sha256: asset.sha256 });
      continue;
    }
    let sha256 = assetHashCache.get(assetName);
    if (sha256 === undefined) {
      try {
        sha256 = await sha256HexOfFile(resolveAssetFilePath(asset));
      } catch (e) {
        throw new Error(
          `Could not read asset "${asset}" for module ${moduleId} — upload it on the instance Assets page. (${
            e instanceof Error ? e.message : e
          })`,
        );
      }
      assetHashCache.set(assetName, sha256);
    }
    inputHashes.push({ name: `assets/${assetName}`, sha256 });
  }
  for (const source of mod.detail.dataSources) {
    if (source.sourceType === "dataset") {
      const sha256 = datasetExtractHashes.get(source.datasetType);
      if (sha256 === undefined) {
        throw new Error(
          `No ${source.datasetType} extract in this run for module ${moduleId}`,
        );
      }
      inputHashes.push({ name: `datasets/${source.datasetType}.csv`, sha256 });
    }
  }
  for (const upstreamId of [...upstreamIdsFor(mod)].sort()) {
    const hashes = upstreamOutputHashes.get(upstreamId);
    if (hashes === undefined) {
      throw new Error(
        `Upstream ${upstreamId} has no recorded outputs for module ${moduleId}`,
      );
    }
    for (const [fileName, sha256] of Object.entries(hashes)) {
      inputHashes.push({ name: `${upstreamId}/${fileName}`, sha256 });
    }
  }
  return inputHashes;
}

export function computeModuleKey(
  mod: ResolvedRunModule,
  inputs: { name: string; sha256: string }[],
): string {
  return computeModuleInputKey({
    scriptText: mod.scriptText,
    inputs,
    rImageTag: R_DOCKER_IMAGE_TAG,
  });
}

// The base-run entry this module may copy outputs from: same non-null
// inputKey and a recorded hash for every declared results object (a
// definition drift that declares an RO the base never hashed forces a run).
export function baseEntryForReuse(
  base: BaseRun,
  mod: ResolvedRunModule,
  inputKey: string,
): { outputFileHashes: Record<string, string> } | null {
  const entry = base.modulesById.get(mod.moduleId);
  if (
    entry === undefined ||
    entry.inputKey === null ||
    entry.inputKey !== inputKey ||
    entry.outputFileHashes === null
  ) {
    return null;
  }
  for (const ro of mod.detail.resultsObjects) {
    if (entry.outputFileHashes[ro.id] === undefined) return null;
  }
  return { outputFileHashes: entry.outputFileHashes };
}

// The reuse PLAN — the §3.7 UX first stage, shown as per-module reused /
// will-run before execution starts. Pessimistic walk in dependency order: a
// module is planned-reused only when every upstream is planned-reused (its
// actual upstream bytes are then the base run's bytes by construction) and
// its key matches the base. The execute loop recomputes each decision from
// actual hashes, so the plan can only be upgraded (pending → reused), never
// broken — except when a base output file has gone missing, where the loop
// falls back to a run and the status visibly corrects itself.
export async function planReuse(
  resolved: ResolvedRunModule[],
  base: BaseRun | null,
  datasetExtractHashes: Map<DatasetType, string>,
  assetHashCache: Map<string, string>,
): Promise<Set<string>> {
  const planned = new Set<string>();
  if (base === null) return planned;
  const plannedHashes = new Map<string, Record<string, string>>();
  for (const mod of resolved) {
    if (![...upstreamIdsFor(mod)].every((id) => planned.has(id))) continue;
    let inputs: { name: string; sha256: string }[];
    try {
      inputs = await computeModuleInputs(
        mod,
        datasetExtractHashes,
        plannedHashes,
        assetHashCache,
      );
    } catch {
      continue;
    }
    const entry = baseEntryForReuse(base, mod, computeModuleKey(mod, inputs));
    if (entry !== null) {
      planned.add(mod.moduleId);
      plannedHashes.set(mod.moduleId, entry.outputFileHashes);
    }
  }
  return planned;
}

function upstreamIdsFor(mod: ResolvedRunModule): Set<string> {
  const upstreamIds = new Set<string>(mod.detail.prerequisites);
  for (const source of mod.detail.dataSources) {
    if (source.sourceType === "results_object") {
      upstreamIds.add(source.moduleId);
    }
  }
  return upstreamIds;
}
