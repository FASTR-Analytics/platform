import type { Sql } from "postgres";
import {
  getValidatedModuleId,
  MODULE_REGISTRY,
  type APIResponseWithData,
  type RunGenerationModuleOption,
  type RunGenerationModuleOptions,
} from "lib";
import { _INSTANCE_LANGUAGE } from "../exposed_env_vars.ts";
import { fetchCommits } from "../github/fetch_module.ts";
import { getModuleDefinitionDetail } from "../module_loader/mod.ts";
import { MODULE_SOURCE } from "../module_loader/module_source.ts";

// Wizard-support read for the results-package launch wizard
// (PLAN_RESULTS_RUNS item 2, session 3): every offerable module's definition
// resolved from the modules repo at latest commit, returning the one gitRef
// step 2 records so the run pipeline re-fetches identical definitions. The
// wizard's other starting values come from the instance defaults store
// (`getRunGenerationDefaultsConfig`) — the wizard is instance-entered, so
// there is no anchor run to mine a prefill from.

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
    const gitRef = await resolveModulesRepoHeadRef();
    const pinnedGitRef = MODULE_SOURCE === "github" ? gitRef : undefined;
    const modules: RunGenerationModuleOption[] = await Promise.all(
      MODULE_REGISTRY.map(async (entry) => {
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
