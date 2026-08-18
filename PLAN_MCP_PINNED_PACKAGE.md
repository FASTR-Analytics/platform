# PLAN — MCP reads the pinned package; shared/client AI-tool split

Status: DESIGN AGREED 2026-08-19 (Tim rulings below), NOT STARTED.

## Goal

1. `/mcp` exposes read-only tools only — `create_report` is gone from MCP
   (stays in the SPA copilot).
2. Every MCP tool reads the instance's **pinned** results package. No
   `projectId` (or any package/project id) in any tool schema; `get_projects`
   is gone.
3. `lib/ai_tools` contains exactly what BOTH surfaces use; SPA-only tools
   move to the client. Copilot behaviour is unchanged.

## Rulings (Tim, 2026-08-19)

- Drop visualizations, slide decks, `get_slide`, reports from MCP entirely
  (no virtual-defaults-only variant).
- MCP gate = instance `can_view_data` (global admins bypass); reads are
  national scope (`projectScopeToken(null)` — there is no project to supply
  an AA2). Project-only members without the instance bit lose MCP.
- Env is a package data source bound at construction; ids never thread
  through the shared factories. Module script/logs/settings reads live on the
  env (one "which package" mechanism, replacing the `getAttachedRunId`
  resolver).
- Moving SPA-only tools/formatters out of lib is worth doing now, same plan.
- Model-facing schemas are unchanged apart from removing `projectId` from
  MCP tools and `get_orientation`.

## Design

### One core, two lenses (server)

Package-data reads are functions of `RunReadContext` already; the project
contributes only auth, run selection and AA2 scope. So:

- `server/run_query/run_read.ts`: add `getRunReadContextForRun(runId)`
  (national: `adminArea2: null`, `scopeToken: projectScopeToken(null)`);
  `getRunReadContext(mainDb, projectId)` becomes "resolve `run_id` +
  `admin_area_2`, then the shared builder". Drop the provenance-only
  `projectId` param from `getPresentationObjectItemsFromRun` /
  `getResultsValueInfoFromRun` ONLY if the holder's `projectId` field has no
  consumer (grep found none in client state/generate; confirm during
  implementation, else keep the echo and pass `""` on the run mount — flag
  which).
- `server/routes/project/presentation_objects.ts`: extract the three
  handler bodies (items, value-info, replicant options — cache check → queue
  → `…FromRun` → `setPromise`) into `server/run_query/run_data_reads.ts`
  functions taking a `RunReadContext`. The project routes call them; no
  behaviour change.
- New run-keyed instance routes, registry `lib/api-routes/instance/
  run_generation.ts` (or a new `run_data.ts` file if run_generation grows past
  its size budget), handlers in `server/routes/instance/run_data.ts`, all
  `requireGlobalPermission("can_view_data")`:
  - `getRunPresentationObjectItems` — `POST /run_generation/run/:run_id/items`,
    body = same as project route.
  - `getRunResultsValueInfo` — `POST /run_generation/run/:run_id/results_value_info`.
  - `getRunModuleWithConfigSelections` — `GET /run_generation/run/:run_id/module/:module_id/settings`,
    response `InstalledModuleWithConfigSelections` via
    `getModuleWithConfigSelectionsFromManifest`. See "Module settings route"
    below for whether the project twin survives.
  No run-keyed replicant-options route: `getReplicantOptions` is consumed
  only by `format_figure_config_for_ai` (SPA-only, moving to client) — review
  finding 2026-08-19, verified. Only the items + value-info handler bodies
  are extracted; the project replicant route stays as is.
  Body validation (`validateFetchConfig`) is the same code on both mounts.
  Caches are already keyed by `runId + scopeToken` — the run mount and
  national projects share entries. The routes accept any `run_id` (no READY
  check — same exposure as `getRunDetail`; the pin itself is ready-only by
  the pin's ready gate); note this in SYSTEM_08.

**Module settings route** (ACCEPTED 2026-08-19 — applies the existing
2026-08-18 "package contents are read once, run-keyed, under instance
`can_view_data`" ruling; settings are package contents and `getRunDetail`
already serves them under that gate): the project-mounted
`getModuleWithConfigSelections` (`routes/project/modules.ts`, any member,
sole consumer = the AI tool) is DELETED — route, registry entry, handler.
BOTH envs read settings via `getRunModuleWithConfigSelections`; the client
env has one "which package" mechanism (script/logs/settings all via
`attachedRunId`). Consequence, same as script/logs: a project member without
instance `can_view_data` loses `get_module_settings` in the copilot; the
package tab already hides settings from that user (`canViewPackageContents`),
so the copilot aligns with the UI.

### The shared surface — `lib/ai_tools/`

`env.ts` — `AIToolEnv`, exactly what the shared tools consume (verified:
`format_metric_data_for_ai` uses only `getItems`, `content_validators` only
`getResultsValueInfo`; `getReplicantOptions`/`getDimensionLabelConfig` are
used only by `format_figure_config_for_ai`, which is SPA-only), no ids, no
`serverActions`:

```ts
export type AIToolEnv = {
  getItems: (p: { resultsObjectId; fetchConfig; firstPeriodOption }) => Promise<APIResponseWithData<ItemsHolderPresentationObject>>;
  getResultsValueInfo: (metricId) => Promise<APIResponseWithData<ResultsValueInfoForPresentationObject>>;
  getModuleScript: (moduleId) => Promise<APIResponseWithData<{ script: string }>>;
  getModuleLogs: (moduleId) => Promise<APIResponseWithData<{ logs: string }>>;
  getModuleSettings: (moduleId) => Promise<APIResponseWithData<InstalledModuleWithConfigSelections>>;
};
```

The client extends it: `ClientAIToolEnv = AIToolEnv & { getPODetail,
getSlide, getReplicantOptions, getDimensionLabelConfig }` (client-side type,
next to `createClientAIToolEnv`); the moved SPA-only tools/formatters take
`ClientAIToolEnv`.

Shared tool descriptions lose the word "project" (`tools_modules.ts:38`
"in the project's attached results package" → "in the results package"); the
no-package failure text belongs to each env's resolver, not the tool.

Stays in lib (both surfaces): `tools_metrics.ts` (`getSharedToolsForMetrics(env,
metrics, icehIndicators, hfaTaxonomy)`), `tools_modules.ts`
(`getSharedToolsForModules(env, modules, metrics)` — script/logs/settings via
env; the "no results package" failure moves into each env's resolver),
`tools_methodology_docs.ts`, `tools_info.ts`, `format_metric_data_for_ai.ts`
(`getMetricDataForAI(env, …)`, `getDataFromConfig(env, …)` — no projectId),
`format_metrics_list_for_ai.ts`, `format_modules_list_for_ai.ts`,
`format_module_settings_for_ai.ts`, `content_validators.ts` (metric-query
validation only; `validateMetricInputs(env, metricId, …)`), `info_catalog.ts`,
and `build_system_prompt.ts` SPLIT (below).

Moves to client (SPA-only): `tools_visualizations.ts`, `tools_slide_decks.ts`,
`tools_reports.ts`, `tools_get_slide.ts`, `format_visualization_data_for_ai.ts`,
`format_visualizations_list_for_ai.ts`, `format_slide_decks_list_for_ai.ts`,
`format_figure_config_for_ai.ts`, `extract_blocks_from_layout.ts`,
`layout_spec_helpers.ts`. Verify by grep during implementation that no server
code imports them (none found in orientation); anything a client tool imports
from lib that only client uses moves too.

`build_system_prompt.ts` split: `buildAISystemContext(instance, projectState)`
becomes `buildPackageGroundingSection(instance, grounding)` where
`grounding = { datasets, commonIndicators, icehIndicators, modules }` is
derivable from EITHER `ProjectState` or the manifest (`getProjectDatasetsFromManifest`,
`getCommonIndicatorsFromManifestInputs`, …). The project-only prose (project
name, viz/deck/report counts, `aiContext`) moves to
`client/…/project_ai/build_system_prompt.ts` (today a re-export shim; becomes
the real project builder composing lib's package section). MCP orientation
composes the package section + viewing-metrics instructions.

### Client — `client/src/components/project_ai/ai_tools/`

- `client_env.ts` → `createClientAIToolEnv(projectId): ClientAIToolEnv`.
  Cache-backed getters as today (caches stay keyed by projectId internally);
  `getModuleScript/Logs/Settings` resolve
  `getSnapshotProjectState().attachedRunId` at call time (existing ruling,
  now inside the env; null → `AIToolFailure` "This project has no results
  package attached.").
- `tools/` gains `visualizations.ts`, `slide_decks.ts`, `get_slide.ts`,
  `reports.ts` (moved from lib; take `projectId` + project caches /
  `serverActions` directly; take `env` only where they need package data).
- `tools/_internal/` receives the moved SPA-only formatters; the existing
  singleton-binding shims (`_internal/format_metric_data_for_ai.ts`,
  `_internal/format_figure_config_for_ai.ts`, `validators/content_validators.ts`,
  `slide_deck/slide_ai/extract_blocks_from_layout.ts`) are deleted or reduced
  to plain modules — call sites take the bound env.
- `build_tools.ts`: builds `env = createClientAIToolEnv(projectId)` once, then
  `[...shared(env, catalog), ...clientProjectContent(env, projectId, catalog),
  ...viewGated, ...navigation, ...drafts, askUser]`. Same role as today.
- `index.tsx` and every `buildToolsForContext`/formatter caller: signature
  updates only.

### MCP — `server/mcp/`

- `env.ts` → `createMcpAIToolEnv(serverActions, runId)`:
  `getRunPresentationObjectItems` / `getRunResultsValueInfo` /
  `getRunModuleScript` / `getRunModuleLogs` /
  `getRunModuleWithConfigSelections`, all with `run_id: runId`. (No
  `instanceState` — dimension labels were its only use and they are
  SPA-only now.)
- `context_cache.ts` → `resolvePinnedPackageContext(principal)`:
  1. `getPinnedRunId(mainDb)` PER CALL (never the 30 s `InstanceState` copy);
     null → `AIToolFailure("No results package is pinned on this instance.
     An admin with can_configure_data pins one under Results packages.")`.
     `get_orientation` is the exception: it must NOT fail on no-pin — it
     returns the instance name + the same sentence, so a connector still
     connects and the model can explain (live SL/Uganda connectors would
     otherwise go dark on deploy — review finding 2026-08-19).
  2. cache lookup keyed `(token, runId)` (same ` ` key builder, same
     TTL/LRU); hit → return.
  3. `resolveGlobalUser`; require `can_view_data` or global admin → else
     `AIToolFailure` naming the missing permission (the routes enforce it per
     dispatch regardless; the door check is for a clean message).
  4. manifest → `metrics`, `modules`, `icehIndicators`, `hfaTaxonomy`,
     `datasets`, `commonIndicators` via the SAME run_read functions
     `getProjectDetail` uses; `getRunListingItem` for label/provenance.
  5. build `sessionTools = [...getSharedToolsForMetrics(env, …),
     ...getSharedToolsForModules(env, …)]`; cache.
  `invalidateProjectContext` is deleted (no writes remain);
  `mcp_context_cache_test.ts` is RETARGETED, not deleted — the
  invalidation assertions die with it, but assertion 4 (two PATs for the
  same user must not share a context → revocation exactness) still applies
  to the `(token, runId)` key. `resolveInstanceState` stays for
  orientation's instance name.
- `mcp_tools.ts`:
  - `get_orientation` (no input): instance name, pinned package (label,
    generated-at, module count), package grounding section, tool catalog,
    `getViewingMetricsInstructions()`.
  - The 6 package tools: static outer tools built from boot-time TEMPLATE
    tools (schemas are static; the template env stays a throwing proxy),
    each delegating per call to `resolvePinnedPackageContext(principal)` →
    inner tool by name. This is `scopeAITool` WITHOUT the injected param —
    add `bindAITool(template, resolve)` (or a `param: undefined` mode) in
    panther `_112_ai_tool_core/scope_ai_tool.ts` and re-sync; do not
    hand-roll sdkTool assembly in-app.
  - `getSharedToolsForMethodologyDocs()`, `getSharedToolsForInfo(transport)`
    unchanged.
  - Delete: `get_projects`, `formatProjectsList`, `PROJECT_ID_DESCRIPTION`,
    the approval/commit-invalidation wrapper.
- `mcp_endpoint.ts`: INSTRUCTIONS rewritten (call `get_orientation` first;
  every tool reads the pinned national results package; all tools are
  read-only; data questions → `get_metric_data`). `approvalMode` /
  `approvalPolicy` stay (construction-time "no unguarded write" guard; inert
  with zero writes) — comment updated to say so.
- `middleware/headless_allowlist.ts`: `getCurrentUser` (parity test) +
  `getRunPresentationObjectItems`, `getRunResultsValueInfo`,
  `getRunModuleWithConfigSelections`,
  `getRunModuleScript`, `getRunModuleLogs` + the `/info` raw pattern. Remove
  `getProjectsForUser`, `getPresentationObjectItems`,
  `getResultsValueInfoForPresentationObject`, `getPresentationObjectDetail`,
  `getReplicantOptions`, `getSlide`, `getModuleWithConfigSelections`,
  `getReportDetail`, `createReport`, `updateReportBody`.

Resulting MCP tool list (10): `get_orientation`, `get_available_metrics`,
`get_metric_data`, `get_available_modules`, `get_module_r_script`,
`get_module_log`, `get_module_settings`, `get_methodology_docs_list`,
`get_methodology_doc_content`, `get_info`.

## Steps (commit order)

1. **panther**: `bindAITool` (no-param delegate) in `_112_ai_tool_core`;
   typecheck; `./sync`. (Stage app changes first per the sync rule — this is
   step 1 precisely so the working tree is clean.)
2. **server run mount**: `getRunReadContextForRun`; extract the three handler
   bodies to `run_data_reads.ts`; add the four run-keyed routes + registry
   entries; project routes call the extracted bodies. Gate:
   `./validate_queries` unchanged, typecheck.
3. **lib env + shared factories**: new `AIToolEnv`; metrics/modules factories
   and shared formatters drop `projectId`; `build_system_prompt` split;
   `lib/ai_tools/mod.ts` exports only the shared set.
4. **client**: `createClientAIToolEnv`; move SPA-only tools/formatters into
   `project_ai/ai_tools/tools(/_internal)`; delete the singleton shims; update
   `build_tools.ts`, `index.tsx`, `build_system_prompt.ts`, all callers.
5. **MCP**: env, context cache, tools, endpoint instructions, allowlist;
   retarget `mcp_context_cache_test.ts`; `pat_identity_parity_test.ts` still
   valid (uses `getCurrentUser`).
   Steps 3–5 are ONE typecheck unit — the lib signature change breaks both
   the client (until 4) and `server/mcp/*` (until 5) — so one commit.
6. **Docs**: `USER_GUIDE_MCP.md` (tool table, "one connection serves every
   project" → "reads the pinned national package", drop the projectId
   paragraph and create_report), `SYSTEM_13_ai_assistant.md` principle 2 +
   file manifest, `SYSTEM_08_results_packages.md` "MCP (future)" bullet →
   present tense + the run-keyed metric-data read now exists, `SYSTEM_01` if
   it lists headless routes, `headless_allowlist.ts` header comment,
   `PROTOCOL_APP_DEVELOPMENT.md` MCP probe recipe if it passes projectId.
   `lint:systems` gate.
7. Delete this plan.

## Rollout

Deploying this without a pin takes every live connector's data tools dark
(only `get_orientation` answers). Before/at deploy: pin a package on every
instance with MCP users (SL, Uganda at minimum — Tim, via the catalogue).
Ops step, not code; recorded here so the deploy is not a surprise.

## Verification (automated gates)

- `deno task typecheck` (server + client + lint:systems).
- `./validate_queries` (project mount unchanged).
- Local `/mcp` JSON-RPC probe (PROTOCOL_APP_DEVELOPMENT.md recipe):
  `tools/list` shows the 10 tools with no `projectId`; `get_orientation`;
  `get_metric_data` returns CSV from the pinned run; unpin → typed
  no-pin failure; a `can_view_data`-less PAT → typed permission failure.
- Harness: `getRunReadContextForRun` + `getPresentationObjectItemsFromRun`
  executed directly against a dev run id.
- Copilot parity (no ability change, byte-stable prompt-cache inputs):
  before step 3, capture from a fixture `InstanceState`/`ProjectState`
  (a) `buildSystemPromptForContext(...)` output and (b)
  `buildToolsForContext(...).map(t => t.sdkTool.name)`; after step 4 assert
  both are IDENTICAL. Any diff is a bug in the split, not an accepted change.

## Open (small, decide during implementation, record in SYSTEM_08/13)

- Holder `projectId` echo: drop the field vs keep + `""` on the run mount.
- Whether `getRunDetail`'s `resolveModuleSettings` and
  `formatModuleSettingsForAI` (same logic, two renderings) should collapse
  onto one — out of scope unless trivial.

## Review 2026-08-19 — accepted / rejected

Accepted (folded in above): shared env trimmed to what shared tools use;
steps 3–5 one commit; `get_orientation` answers without a pin + rollout
line; neutral tool descriptions; retarget the cache test; SYSTEM_08 note on
run-id exposure; delete the project settings route (not a new call — the
2026-08-18 ruling already covers settings).
Rejected: a per-runId grounding cache — `getRunManifestCached` and
`readRunInputJsonCached` already hold the file reads in memory, so a 30 s
context miss re-derives arrays from cached JSON; a second cache layer buys
nothing.
