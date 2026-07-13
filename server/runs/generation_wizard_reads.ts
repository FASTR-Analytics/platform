import type { Sql } from "postgres";
import { z } from "zod";
import {
  datasetHmisWindowingCommonSchema,
  getValidatedModuleId,
  isModuleAllowedForCountry,
  MODULE_REGISTRY,
  type APIResponseWithData,
  type RunGenerationModuleOption,
  type RunGenerationModuleOptions,
  type RunGenerationPrefill,
  type RunGenerationStep1Result,
  type RunManifest,
} from "lib";
import { _INSTANCE_LANGUAGE } from "../exposed_env_vars.ts";
import { getCountryIso3Config } from "../db/instance/config.ts";
import { fetchCommits } from "../github/fetch_module.ts";
import { getModuleDefinitionDetail } from "../module_loader/mod.ts";
import { MODULE_SOURCE } from "../module_loader/module_source.ts";
import { getRunReadContext } from "../run_query/mod.ts";

// Wizard-support reads for the results-package launch wizard
// (PLAN_RESULTS_RUNS item 2, session 3). Both are read-only: prefill mines
// the ATTACHED run's manifest for the wizard's starting values; module
// options resolves every offerable module's definition from the modules repo
// at latest commit, returning the one gitRef step 2 records so the run
// pipeline re-fetches identical definitions.

// Manifest dataset `info` is z.unknown() (a verbatim copy of the project-DB
// datasets.info JSON), so the wizard-facing fields are re-parsed here; a
// row that doesn't parse degrades to "family not prefilled".
const hmisInfoSchema = z.object({ windowing: datasetHmisWindowingCommonSchema });
const hfaInfoSchema = z.object({
  serviceCategoryScope: z.array(z.string()).optional(),
});
const configSelectionsPrefillSchema = z.object({
  parameterSelections: z.record(z.string(), z.string()),
});

function step1FromManifest(manifest: RunManifest): RunGenerationStep1Result {
  const byType = new Map(manifest.datasets.map((d) => [d.datasetType, d.info]));
  const hmisInfo = byType.has("hmis")
    ? hmisInfoSchema.safeParse(byType.get("hmis"))
    : undefined;
  const hfaInfo = byType.has("hfa")
    ? hfaInfoSchema.safeParse(byType.get("hfa"))
    : undefined;
  return {
    hmis: hmisInfo?.success ? { windowing: hmisInfo.data.windowing } : null,
    hfa: hfaInfo === undefined
      ? null
      : {
        serviceCategoryScope: hfaInfo.success
          ? hfaInfo.data.serviceCategoryScope ?? []
          : [],
      },
    iceh: byType.has("iceh"),
  };
}

export async function getRunGenerationPrefill(
  mainDb: Sql,
  projectId: string,
): Promise<APIResponseWithData<RunGenerationPrefill>> {
  const empty: RunGenerationPrefill = {
    attachedRunId: null,
    step1: null,
    moduleIds: [],
    parameterSelections: {},
  };
  const resCtx = await getRunReadContext(mainDb, projectId);
  if (resCtx.success === false) {
    // No run attached (or the run is unreadable): the wizard starts from
    // scratch — an expected state, not an error.
    return { success: true, data: empty };
  }
  const manifest = resCtx.data.manifest;
  const parameterSelections: Record<string, Record<string, string>> = {};
  for (const mod of manifest.modules) {
    if (mod.configSelections === null) {
      continue;
    }
    try {
      const parsed = configSelectionsPrefillSchema.safeParse(
        JSON.parse(mod.configSelections),
      );
      if (parsed.success) {
        parameterSelections[mod.id] = parsed.data.parameterSelections;
      }
    } catch {
      // Malformed stored JSON: skip this module's prefill.
    }
  }
  return {
    success: true,
    data: {
      attachedRunId: resCtx.data.runId,
      step1: step1FromManifest(manifest),
      moduleIds: manifest.modules.map((m) => m.id),
      parameterSelections,
    },
  };
}

// "Latest commit" = the repo's HEAD, resolved once — a single commit that
// contains every module path's latest content, unlike per-path last-touch
// SHAs which can predate one another. Local source ignores pins (dev reads
// the working tree), so a sentinel ref suffices there.
async function resolveModulesRepoHeadRef(): Promise<string> {
  if (MODULE_SOURCE !== "github") {
    return "local";
  }
  const { owner, repo } = MODULE_REGISTRY[0].github;
  const res = await fetchCommits(owner, repo, "", "main");
  if (res.success === false) {
    throw new Error(
      `Could not resolve the modules repository's latest commit: ${res.err}`,
    );
  }
  const sha = res.data.at(0)?.sha;
  if (sha === undefined) {
    throw new Error("The modules repository has no commits");
  }
  return sha;
}

export async function getRunGenerationModuleOptions(
  mainDb: Sql,
): Promise<APIResponseWithData<RunGenerationModuleOptions>> {
  try {
    const resCountry = await getCountryIso3Config(mainDb);
    if (resCountry.success === false) {
      return resCountry;
    }
    const countryIso3 = resCountry.data.countryIso3;
    const gitRef = await resolveModulesRepoHeadRef();
    const pinnedGitRef = MODULE_SOURCE === "github" ? gitRef : undefined;
    const allowed = MODULE_REGISTRY.filter((m) =>
      isModuleAllowedForCountry(m, countryIso3)
    );
    const modules: RunGenerationModuleOption[] = await Promise.all(
      allowed.map(async (entry) => {
        const res = await getModuleDefinitionDetail(
          entry.id,
          _INSTANCE_LANGUAGE,
          pinnedGitRef,
        );
        if (res.success === false) {
          throw new Error(`Module ${entry.id}: ${res.err}`);
        }
        const detail = res.data;
        const datasetTypes = [
          ...new Set(
            detail.dataSources.flatMap((s) =>
              s.sourceType === "dataset" ? [s.datasetType] : []
            ),
          ),
        ];
        const moduleDependencies = [
          ...new Set(
            detail.dataSources.flatMap((s) =>
              s.sourceType === "results_object"
                ? [getValidatedModuleId(s.moduleId)]
                : []
            ),
          ),
        ];
        return {
          id: entry.id,
          label: detail.label,
          prerequisites: detail.prerequisites.map(getValidatedModuleId),
          datasetTypes,
          moduleDependencies,
          parameters: detail.configRequirements.parameters,
        };
      }),
    );
    return { success: true, data: { gitRef, modules } };
  } catch (e) {
    return {
      success: false,
      err: "Problem resolving module definitions: " +
        (e instanceof Error ? e.message : ""),
    };
  }
}
