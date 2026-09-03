import type { Sql } from "postgres";
import { getAssetToImportName, type RunModule } from "lib";
import { getRunManifestCached, runDirPath } from "../../runs/mod.ts";
import { resolveAssetFilePath } from "../../db/instance/assets.ts";
import { R_DOCKER_IMAGE_TAG } from "./r_docker_image.ts";
import { computeModuleInputKey, sha256HexOfFile } from "./input_key.ts";
import { POPULATION_FILE_NAME, type RunInputHashes } from "./prepare_inputs.ts";
import type { ResolvedRunModule } from "./resolve_modules.ts";

// §3.7 memoized generation (PLAN_RESULTS_RUNS item 3, re-cut by Q-C). A
// module reuses another run's outputs iff its inputKey — computed from the
// actual inputs of THIS generation — equals that run's recorded key for the
// same module. There is no "base run": generation is instance-level, so the
// search is catalog-wide over every readable ready run, newest first.
// Synthetic-backfill runs carry null keys and are never reuse sources.
// Everything here fails closed: an unreadable manifest, a missing hash, a
// since-deleted source, or a key mismatch only ever costs a re-run, never
// wrong data.

export type ReuseSource = {
  runId: string;
  runDir: string;
  outputFileHashes: Record<string, string>;
};

export type ReuseSearch = {
  find(
    mod: ResolvedRunModule,
    inputKey: string,
  ): Promise<ReuseSource | null>;
};

// One search per generation: the candidate list is read once, manifests are
// read lazily (and cached process-wide, since runs are immutable), and each
// (moduleId, inputKey) verdict is memoized — the pessimistic plan and the
// authoritative execute loop ask the same questions.
export async function createReuseSearch(mainDb: Sql): Promise<ReuseSearch> {
  const rows = await mainDb<{ id: string; summary: string | null }[]>`
SELECT id, summary FROM runs WHERE status = 'ready' ORDER BY created_at DESC
`;
  const candidates = rows.map((row) => {
    let moduleIds: Set<string> | null = null;
    try {
      const parsed = row.summary === null ? null : JSON.parse(row.summary);
      if (Array.isArray(parsed?.moduleIds)) {
        moduleIds = new Set(parsed.moduleIds as string[]);
      }
    } catch {
      // Unreadable summary: keep the run as a candidate and let the
      // manifest decide (a wasted read at worst).
    }
    return { runId: row.id, moduleIds };
  });
  const manifestCache = new Map<string, Map<string, RunModule> | null>();
  const verdicts = new Map<string, ReuseSource | null>();

  async function modulesOf(runId: string): Promise<Map<string, RunModule> | null> {
    const cached = manifestCache.get(runId);
    if (cached !== undefined) {
      return cached;
    }
    let modules: Map<string, RunModule> | null = null;
    try {
      const manifest = await getRunManifestCached(runId);
      modules = new Map(manifest.modules.map((m) => [m.id, m]));
    } catch (e) {
      console.error(
        `[generate_run] results package ${runId} is unreadable — not a reuse source: ${
          e instanceof Error ? e.message : e
        }`,
      );
    }
    manifestCache.set(runId, modules);
    return modules;
  }

  return {
    async find(mod, inputKey) {
      // \0 separator: cannot appear in either half, so the key cannot
      // collide. Written as an escape — a literal NUL byte makes git treat
      // the whole file as binary and kills its diffs.
      const verdictKey = `${mod.moduleId}\0${inputKey}`;
      const memoized = verdicts.get(verdictKey);
      if (memoized !== undefined) {
        return memoized;
      }
      let found: ReuseSource | null = null;
      for (const candidate of candidates) {
        if (
          candidate.moduleIds !== null &&
          !candidate.moduleIds.has(mod.moduleId)
        ) {
          continue;
        }
        const modules = await modulesOf(candidate.runId);
        const entry = modules?.get(mod.moduleId);
        const outputFileHashes = entry === undefined
          ? null
          : matchedOutputHashes(entry, mod, inputKey);
        if (outputFileHashes === null) {
          continue;
        }
        found = {
          runId: candidate.runId,
          runDir: runDirPath(candidate.runId),
          outputFileHashes,
        };
        break;
      }
      verdicts.set(verdictKey, found);
      return found;
    },
  };
}

// The hashes this module may copy outputs against, or null when the entry
// cannot be a source: same non-null inputKey and a recorded hash for every
// declared results object (a definition drift that declares an RO the source
// never hashed forces a run).
function matchedOutputHashes(
  entry: RunModule,
  mod: ResolvedRunModule,
  inputKey: string,
): Record<string, string> | null {
  const hashes = entry.outputFileHashes;
  if (entry.inputKey === null || entry.inputKey !== inputKey || hashes === null) {
    return null;
  }
  const complete = mod.detail.resultsObjects.every(
    (ro) => hashes[ro.id] !== undefined,
  );
  return complete ? hashes : null;
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
  inputHashes: RunInputHashes,
  upstreamOutputHashes: Map<string, Record<string, string>>,
  assetHashCache: Map<string, string>,
): Promise<{ name: string; sha256: string }[]> {
  const moduleId = mod.moduleId;
  const inputs: { name: string; sha256: string }[] = [];
  for (const asset of mod.detail.assetsToImport) {
    const assetName = getAssetToImportName(asset);
    if (typeof asset !== "string") {
      inputs.push({ name: `assets/${assetName}`, sha256: asset.sha256 });
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
    inputs.push({ name: `assets/${assetName}`, sha256 });
  }
  for (const source of mod.detail.dataSources) {
    if (source.sourceType === "dataset") {
      const sha256 = inputHashes.datasets.get(source.datasetType);
      if (sha256 === undefined) {
        throw new Error(
          `No ${source.datasetType} extract in this run for module ${moduleId}`,
        );
      }
      inputs.push({ name: `datasets/${source.datasetType}.csv`, sha256 });
    } else if (source.sourceType === "population") {
      // The person-years file is a real input: a population edit must re-run
      // the module, and an unchanged store must not (PLAN_1b).
      if (inputHashes.population === null) {
        throw new Error(
          `No population file in this run for module ${moduleId} (it needs the hmis dataset)`,
        );
      }
      inputs.push({ name: POPULATION_FILE_NAME, sha256: inputHashes.population });
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
      inputs.push({ name: `${upstreamId}/${fileName}`, sha256 });
    }
  }
  return inputs;
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
// The reuse PLAN — the §3.7 UX first stage, shown as per-module reused /
// will-run before execution starts. Pessimistic walk in dependency order: a
// module is planned-reused only when every upstream is planned-reused (its
// actual upstream bytes are then the matched run's bytes by construction)
// and the catalog holds a matching entry. The execute loop recomputes each
// decision from actual hashes, so the plan can only be upgraded (pending →
// reused), never broken — except when a source output file has gone missing,
// where the loop falls back to a run and the status visibly corrects itself.
export async function planReuse(
  resolved: ResolvedRunModule[],
  search: ReuseSearch,
  inputHashes: RunInputHashes,
  assetHashCache: Map<string, string>,
): Promise<Set<string>> {
  const planned = new Set<string>();
  const plannedHashes = new Map<string, Record<string, string>>();
  for (const mod of resolved) {
    if (![...upstreamIdsFor(mod)].every((id) => planned.has(id))) continue;
    let inputs: { name: string; sha256: string }[];
    try {
      inputs = await computeModuleInputs(
        mod,
        inputHashes,
        plannedHashes,
        assetHashCache,
      );
    } catch {
      continue;
    }
    const source = await search.find(mod, computeModuleKey(mod, inputs));
    if (source !== null) {
      planned.add(mod.moduleId);
      plannedHashes.set(mod.moduleId, source.outputFileHashes);
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
