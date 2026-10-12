import { AIToolFailure, bindAIToolToView } from "panther";
import type { AnyAITool } from "panther";
import {
  ALL_DATA_SCOPE_ID,
  COPILOT_TOOL_VIEWS,
  type CopilotGatedToolName,
  EMPTY_HFA_TAXONOMY,
  formatSourceHeader,
  type HfaTaxonomyForAI,
  hfaTimePointsForAI,
  type PackageScope,
  packageToolsKey,
  type ResolvedPackageScope,
  type RunAuthoringContext,
  withSourceHeader,
} from "lib";
import { scopeDisplayLabel } from "~/components/_shared/mod.ts";
import { instanceState } from "~/state/instance/t1_store";
import { getRunAuthoringContextFromCacheOrFetch } from "~/state/instance/t2_run_authoring_context";
import {
  type ClientAIToolEnv,
  createCopilotAIToolEnv,
  createModuleInternalsEnv,
  type ModuleInternalsEnv,
} from "./client_env";
import { getClientToolsForModuleInternals } from "./tools/mod.ts";
import {
  copilotViews,
  type CopilotViewState,
  packageViewContext,
} from "./ai_views";

// Every package tool the chat registers is an outer tool: name, description,
// schema and metadata from a template, bound per call (bindAIToolToView) to
// the same-named tool of an inner set built for the pair the call's view
// shows. The templates come from running the inner builder once over a
// throwing env and an empty authoring context, as server/mcp/mcp_tools.ts
// does for the /mcp surface: the factories are pure over their inputs and
// their schemas are static. If a template handler ever runs, delegation
// failed: fail loudly.
//
// Inner sets are cached by packageToolsKey (run, scope, definition hash, HFA
// rounds), so a reattach, rescope, scope edit or time-point import binds at
// the next call with no remount. The module internals (script, log,
// settings) bind by run id alone, so they answer for a package that is still
// generating or has failed. Every read of a pair-bound set opens with the
// Source line naming the package and scope it read; a run-bound read names
// the package and no scope; writes and failures pass through untouched.

export type PackageToolsBuilder = (
  env: ClientAIToolEnv,
  scope: PackageScope,
  ctx: RunAuthoringContext,
  hfaTaxonomy: HfaTaxonomyForAI,
) => AnyAITool[];

function templateThrow(): never {
  throw new Error(
    "copilot template env must never be invoked: the bound tool failed to delegate to its inner set",
  );
}

const TEMPLATE_MODULE_ENV: ModuleInternalsEnv = {
  getModuleScript: templateThrow,
  getModuleLogs: templateThrow,
  getModuleSettings: templateThrow,
};

const TEMPLATE_ENV: ClientAIToolEnv = {
  ...TEMPLATE_MODULE_ENV,
  getItems: templateThrow,
  getResultsValueInfo: templateThrow,
  getSlide: templateThrow,
  getReplicantOptions: templateThrow,
  getDimensionLabelConfig: templateThrow,
};

const TEMPLATE_SCOPE: PackageScope = { runId: "", scopeId: ALL_DATA_SCOPE_ID };

const TEMPLATE_CONTEXT: RunAuthoringContext = {
  runId: "",
  scopeToken: "",
  modules: [],
  metrics: [],
  datasets: [],
  hmisIndicators: [],
  icehIndicators: [],
  hfaTaxonomy: EMPTY_HFA_TAXONOMY,
  presets: [],
  population: null,
};

// The ready list names a package; the catalogue, which data-configuring
// users see, is the second source for a package that is generating or has
// failed (the run-bound reads' case); a run in neither is named by its id.
function packageHeaderParts(runId: string) {
  const pkg = instanceState.readyPackages.find((p) => p.id === runId) ??
    instanceState.runsCatalog.find((r) => r.id === runId);
  return {
    packageLabel: pkg?.label ?? runId,
    createdAt: pkg?.createdAt ?? null,
  };
}

function pairSourceHeader(pair: PackageScope): string {
  const row = instanceState.scopes.find((s) => s.id === pair.scopeId);
  return formatSourceHeader({
    ...packageHeaderParts(pair.runId),
    scopeLabel: row === undefined ? pair.scopeId : scopeDisplayLabel(row),
  });
}

function runSourceHeader(runId: string): string {
  return formatSourceHeader(packageHeaderParts(runId));
}

function withSourceHeaderOnReads(
  tools: AnyAITool[],
  header: () => string,
): AnyAITool[] {
  return tools.map((tool) =>
    tool.metadata.kind === "read" ? withSourceHeader(tool, header) : tool
  );
}

function sameNamed(set: AnyAITool[], name: string): AnyAITool {
  const inner = set.find((t) => t.sdkTool.name === name);
  if (inner === undefined) {
    throw new Error(
      `copilot: no inner tool named "${name}" in the set built for the view's pair; the template and inner sets have drifted`,
    );
  }
  return inner;
}

// The headless templates /mcp shares declare no gate, so each is bound with
// the catalogue's views for its name; a template that declares its own keeps
// it (bindAIToolToView refuses a second list).
function viewsFor(template: AnyAITool) {
  if (template.metadata.availableIn !== undefined) return undefined;
  const name = template.sdkTool.name;
  if (!Object.hasOwn(COPILOT_TOOL_VIEWS, name)) {
    throw new Error(
      `copilot package tool "${name}" is not gated in the catalogue (lib/ai_tools/copilot_catalogue.ts)`,
    );
  }
  return { availableIn: COPILOT_TOOL_VIEWS[name as CopilotGatedToolName] };
}

function contextOf(view: CopilotViewState) {
  const context = packageViewContext(view);
  if (context === undefined) {
    throw new Error(
      `copilot: a package tool ran in view "${view.id}", which has no package; the gate should have refused it`,
    );
  }
  return context;
}

export function bindPackageTools(buildInner: PackageToolsBuilder): AnyAITool[] {
  const pairSets = new Map<string, AnyAITool[]>();
  const runSets = new Map<string, AnyAITool[]>();

  // The authoring context is T2, immutable per (run, definition hash), so a
  // revisit is a cache hit; a failed read refuses this call with its error
  // and the next call reads again. A payload the server computed under
  // another definition than the store's (the scopes stream lagging an edit)
  // answers this call but is not kept, as the T2 cache itself does not keep
  // it (answersKeyedScope).
  async function pairSet(pair: ResolvedPackageScope): Promise<AnyAITool[]> {
    const timePoints = hfaTimePointsForAI(instanceState.hfaTimePoints);
    const key = packageToolsKey({ ...pair, timePoints });
    const cached = pairSets.get(key);
    if (cached !== undefined) return cached;
    const res = await getRunAuthoringContextFromCacheOrFetch(pair);
    if (!res.success) throw new AIToolFailure(res.err);
    const scope: PackageScope = { runId: pair.runId, scopeId: pair.scopeId };
    const set = withSourceHeaderOnReads(
      buildInner(createCopilotAIToolEnv(scope), scope, res.data, {
        ...res.data.hfaTaxonomy,
        timePoints,
      }),
      () => pairSourceHeader(scope),
    );
    if (res.data.scopeToken === pair.definitionHash) pairSets.set(key, set);
    return set;
  }

  function runSet(runId: string): AnyAITool[] {
    const cached = runSets.get(runId);
    if (cached !== undefined) return cached;
    const set = withSourceHeaderOnReads(
      getClientToolsForModuleInternals(createModuleInternalsEnv(runId)),
      () => runSourceHeader(runId),
    );
    runSets.set(runId, set);
    return set;
  }

  const pairTemplates = buildInner(
    TEMPLATE_ENV,
    TEMPLATE_SCOPE,
    TEMPLATE_CONTEXT,
    EMPTY_HFA_TAXONOMY,
  );
  const runTemplates = getClientToolsForModuleInternals(TEMPLATE_MODULE_ENV);

  return [
    ...pairTemplates.map((template) =>
      bindAIToolToView(
        copilotViews,
        template,
        async (view) =>
          sameNamed(
            await pairSet(contextOf(view).getScope()),
            template.sdkTool.name,
          ),
        viewsFor(template),
      )
    ),
    ...runTemplates.map((template) =>
      bindAIToolToView(
        copilotViews,
        template,
        (view) =>
          sameNamed(runSet(contextOf(view).getRunId()), template.sdkTool.name),
        viewsFor(template),
      )
    ),
  ];
}
