# PLAN — /mcp is for seeing results: SPA-only content out of shared tools, module tools client-only, info topics per surface

Status: planned 2026-08-19, reviewed (external review adopted in full: second
formatter, `projectId` signature, run-keyed wording, glob manifest, 5a value
info fetch, gates, headless allowlist shrink, docs sweep, location-based info
topics). RULED 2026-08-19 (Tim delegated the calls; all rulings below stand
as written). Change 0's panther half is DONE and synced (619147b7).
**Phase 1 (changes 0–4) BUILT 2026-08-19, in the working tree, uncommitted**:
typecheck, lint:systems, validate_protocols, server tests (13/13 incl. a new
allowlist-denial assertion) green; every phase-1 probe check in
"Verification" passed against a scratch server on :8077. Phase 2 not started
(5b built last and re-evaluated after 5a/5c output is seen).
Delete this file when the changes are committed and SYSTEM_13 carries the
catalog.

## Facts (verified by probing local `/mcp` on :8000 and reading code, 2026-08-19)

- The 10-tool `/mcp` catalog (2654d5b7 + Source header 27f65ffd) works end
  to end locally: orientation, metrics list, metric data (filters +
  disaggregations), modules, script/log/settings, methodology docs, `get_info`,
  typed errors, OAuth discovery. Nothing is broken.
- Three tool outputs on `/mcp` instruct the model to do things the surface
  cannot do:
  1. `get_metric_data` ends with "## Creating Visualizations from this
     Metric — use a `from_metric` block …" plus a JSON template and notes
     ([format_metric_data_for_ai.ts:369-402](lib/ai_tools/format_metric_data_for_ai.ts#L369-L402)).
     No `/mcp` tool consumes `from_metric` blocks.
  2. `get_available_metrics` opens with "Visualize with from_metric blocks
     using vizPresetId."
     ([format_metrics_list_for_ai.ts:17](lib/ai_tools/format_metrics_list_for_ai.ts#L17)).
  3. `get_info` lists `iceh-equity-profile`, a *report-building recipe*
     ([info_catalog.ts](lib/ai_tools/info_catalog.ts)); `/mcp` cannot create
     reports. The orientation's reference-docs section hard-codes the same
     example ("for example, building an ICEH equity profile report",
     [build_system_prompt.ts:48](lib/ai_tools/build_system_prompt.ts#L48)).
- The SPA system prompt already carries the `from_metric` contract — block
  shape at [build_system_prompt.ts:219](client/src/components/project_ai/build_system_prompt.ts#L219),
  sequencing ("call get_metric_data before creating from_metric blocks") at
  [:244](client/src/components/project_ai/build_system_prompt.ts#L244) — and
  the `from_metric` block schema ([ai_input.ts:99](lib/types/ai_input.ts#L99))
  states every field the appendix restates (preset ids come from
  `get_available_metrics`; filters/dates optional; date format YYYY or
  YYYYMM, system converts; filter dims from the preset's list). The appendix
  and the line in (2) are restated contract, not the authoritative copy — the
  SPA loses no information when they go.
- The per-metric "Visualization presets:" listing in `get_available_metrics`
  ([format_metrics_list_for_ai.ts:117-137](lib/ai_tools/format_metrics_list_for_ai.ts#L117-L137))
  is the SPA's only source of `vizPresetId` values, and prints per preset the
  time grain `(YYYY)/(YYYYMM)`, `— filters: …`, and
  `** REQUIRES selectedReplicant **`. That is reference data about the metric
  (which presets exist and what each needs), inert on `/mcp`.
- The four module tools ([tools_modules.ts](lib/ai_tools/tools_modules.ts):
  `get_available_modules`, `get_module_r_script`, `get_module_log`,
  `get_module_settings`) exist to explain how a package was produced. Over a
  published pinned package there is nothing to debug (the local log is six
  lines of "Reusing output") and the R script is module-author material.
  `tools_modules.ts` imports two lib formatters
  (`format_modules_list_for_ai.ts`, `format_module_settings_for_ai.ts`) that
  have no other consumer (only a comment cite in
  `server/runs/package_internals.ts:141`). `AIToolEnv`
  ([env.ts](lib/ai_tools/env.ts)) carries `getModuleScript`, `getModuleLogs`,
  `getModuleSettings` only for them; the two data getters (`getItems`,
  `getResultsValueInfo`) serve the metric tools. The SPA env
  ([client_env.ts:105-119](client/src/components/project_ai/ai_tools/client_env.ts#L105-L119))
  resolves the three through the run-keyed instance routes
  (`getRunModule*` with `requireAttachedRunId()`).
- The headless allowlist
  ([headless_allowlist.ts](server/middleware/headless_allowlist.ts)) states
  its contract: "a headless credential can reach exactly the routes the /mcp
  tools need." It admits `getRunModuleScript`, `getRunModuleLogs`,
  `getRunModuleWithConfigSelections` for the module tools alone.
- Client tool factories take `projectId` and derive the env internally via
  `clientAIToolEnvFor(projectId)` (every `getClientToolsFor*`); their
  formatters live in `ai_tools/tools/_internal/`; none sets `headless: true`.
- SYSTEM_13's manifest is glob-based (`client/src/components/project_ai/**`,
  `lib/ai_tools/**`) — file moves inside those trees need no manifest edit.
- `get_metric_data`'s formatter (`getMetricDataForAI`) receives the items
  holder's `indicatorMetadata` (id, label, format_as, threshold_direction,
  threshold_green/yellow, group_label) and uses it only for format grouping.
  It does NOT receive value info: `periodBounds` is fetched only inside
  `validateMetricInputs`, and only when filters or a period are supplied
  ([content_validators.ts:144](lib/ai_tools/content_validators.ts#L144)).
- `/mcp` holds the full `RunManifest` per call
  ([context_cache.ts:246](server/mcp/context_cache.ts#L246)).
- The `[panther mcp] fastr: legacy <method> …` server log line is the SDK's
  wire-era label (2025-06-18 protocol = `legacy`, 2026-07-28 = `modern`;
  [mcp_http_handler.ts:164](panther/_220_mcp_http/mcp_http_handler.ts#L164)).
  Every current client speaks the 2025 protocol. Correct, not a finding.
- `serverInfo.version` on local dev reads `1.2.4` = `SERVER_VERSION` in
  `.env`. Correct per 27f65ffd; not the repo `VERSION`. Not a finding.

## Problem

Shared tools were written for the SPA first and carry SPA-only guidance in
their *content*, and the shared set includes tools that only the authoring
surface has a use for. The client-only / shared split (SYSTEM_13, PLAN_112)
is the right architecture and is not being reopened; shared tools stay
surface-agnostic (ruling in the Source-header plan, 27f65ffd). What is left
is applying the split's own definition: shared = what both surfaces act on;
SPA-only things live in `client/` — tools, formatters, and info topics alike.

## Rulings (RULED 2026-08-19 — Tim: "/mcp is about seeing results"; calls delegated)

0. **`get_orientation` → `get_overview`** (Tim 2026-08-19: "orientation" is
   vague — it names the reason to call it, not what it returns). Description
   (Tim's wording): "Overview of this FASTR instance: country, the pinned
   results package and what it holds (datasets, indicators, analysis modules,
   period coverage), terminology, and how to use the other tools. Call this
   first." — with "period coverage" ADDED by 5c, which is what delivers it;
   phase 1 ships the description without those two words (a description
   never promises what the tool does not yet return). The term goes
   library-wide: panther's built-in grounding tool and
   resource (stdio `createMCPServer` path — the app's HTTP tool is
   hand-rolled and independent, but the concept is one) rename in the same
   pass. Sequence: panther first (typecheck), stage/commit app changes, then
   `./sync` from the panther repo.
   - App (17 mechanical hits, 9 files): `mcp_tools.ts` (`getOverviewTool`,
     name, description above, comment :88 "Orientation answers WITHOUT a
     pin"), `mcp_endpoint.ts` `INSTRUCTIONS` ("Call get_overview FIRST — …"),
     `context_cache.ts` comments (:69, :157, :170),
     `lib/ai_tools/build_system_prompt.ts:7` comment ("the /mcp orientation"),
     `mcp_probe:28`, PROTOCOL_APP_DEVELOPMENT.md (:120, :200, :237
     "orientation and prompt assembly"), USER_GUIDE_MCP.md (:46 row label
     "Overview", :56, :191, :194), SYSTEM_13 (:82, :84), SYSTEM_08 (:363).
   - Panther (`timroberton-panther`, no tests reference it, no other app
     consumes `groundingResource`): `modules/_112_ai_tool_core/mcp_server.ts`
     — `OVERVIEW_TOOL_NAME = "get_overview"`,
     `OVERVIEW_RESOURCE_URI = "panther://overview"`, tool description "Read
     the overview document: what exists in the app right now (live ids), the
     rules for operating it, and how to use the other tools. Call this before
     doing other work.", both collision error strings (:380, :436), the
     `-32002` "No overview resource configured" (:456), resource `name:
     "overview"` + description (:823-825), comment :842;
     `mcp_types.ts` comments (:46, :51-53: "read the overview before
     working", "get_overview read tool"); DOC_AI_CHAT.md :805-808;
     `protocols/PROTOCOL_UI_AI_CHAT.md:65`. Then `./sync` copies
     `panther/` + `panther/protocols/` into the app.
1. **`/mcp` catalog = seeing results:** `get_overview`,
   `get_available_metrics`, `get_metric_data`, `get_methodology_docs_list`,
   `get_methodology_doc_content`, `get_info`. Six tools after phase 1;
   `get_indicators` makes seven in phase 2 (change 5).
2. **Shared tool output states only what both surfaces can act on.** Authoring
   guidance (how to build a `from_metric` block) is the SPA prompt's and the
   block schema's contract and lives there once. The presets listing is
   reference data about the metric — which presets exist, their grain,
   filters and replicant requirement — and stays in the shared listing as
   such (stated, not accidental). **The replicant requirement is critical and
   must be unmistakable to the model** (Tim 2026-08-19): the
   `** REQUIRES selectedReplicant **` marker stays, names the dimension it
   replicates over, and the block schema's `selectedReplicant` description
   points at that exact marker (today it says "when the preset has
   needsReplicant=true" — a flag the listing never prints). Change 2 carries
   both edits.
3. **All four module tools are client-only.** They and their two formatters
   move to `client/src/components/project_ai/ai_tools/tools/` (+ `_internal/`);
   the three module getters leave `AIToolEnv` for `ClientAIToolEnv`;
   `AIToolEnv` = the two data getters; the headless allowlist loses the three
   module routes. (Possible follow-up, not in this plan: if module *parameter
   values* matter for reading a result on `/mcp` — e.g. HFA's "weighted when
   sampling weights are enabled" — they attach to the metric's own output in
   5a, not to a module tool.)
4. **Info topics follow the same split by location.** `INFO_TOPICS` in lib
   holds the shared topics; the client holds the recipe and exports ONE
   `SPA_INFO_TOPICS` (shared + client) that the SPA passes to both
   `getSharedToolsForInfo` and `buildSystemPrompt`, so tool whitelist and
   prompt list can never diverge; `/mcp` passes `INFO_TOPICS`. No `kind` tag,
   no filter — one mechanism, the same one change 3 uses.
5. No `surface` parameter anywhere in `lib/ai_tools`. Rejected as a second
   seam on top of the split.
6. **Module parameter values do not reach `/mcp`** (ruling 3's sub-question,
   closed): no tool, no metric-output line. Reopen only on a concrete
   interpretation failure, and then via 5a's metric context.
7. **Phase 2 scope:** 5a and 5c ruled in; 5b ruled in but built LAST and
   re-evaluated once 5a/5c output is seen — if labels/format/thresholds in
   the metric context already answer "what indicators are there", 5b is
   dropped rather than shipped redundant.

## Changes — phase 1

### 1. `lib/ai_tools/format_metric_data_for_ai.ts` — delete the appendix

Remove lines 369-402 (the `=` rule, "## Creating Visualizations from this
Metric", the JSON template, the notes). The function ends after the CSV.

### 2. `lib/ai_tools/format_metrics_list_for_ai.ts` — delete one line; sharpen the replicant marker; align two descriptions

Remove `"Visualize with from_metric blocks using vizPresetId."` (line 17).
The presets listing stays (ruling 2), with the replicant marker made
unmistakable:

- Marker ([:127-130](lib/ai_tools/format_metrics_list_for_ai.ts#L127-L130)):
  `** REQUIRES selectedReplicant **` →
  `** REQUIRES selectedReplicant: one <dim> value **` where `<dim>` is
  `getReplicateByProp(preset.config)` (already computed there as
  `hasReplicant`; keep the prop). Values for `<dim>` come from
  `get_metric_data`'s Dimension Summary — no new plumbing.
- Block schema ([ai_input.ts](lib/types/ai_input.ts) `AiFigureFromMetricSchema`
  `selectedReplicant` `.describe`): "Required when the preset has
  needsReplicant=true …" → "REQUIRED when the preset is marked
  `REQUIRES selectedReplicant` in get_available_metrics; the value is one
  value of the dimension named there (e.g. 'anc1'), as listed by
  get_metric_data. Omit otherwise."
- Block schema filters `.describe`: "from preset's 'Filterable by' list" →
  the listing's `filters:` wording.

Tool descriptions in `tools_metrics.ts` stay unchanged.

### 3. Module tools → client-only

- Move [tools_modules.ts](lib/ai_tools/tools_modules.ts) to
  `client/src/components/project_ai/ai_tools/tools/modules.ts` as
  `getClientToolsForModules(projectId: string, modules, metrics)` deriving
  the env via `clientAIToolEnvFor(projectId)` like every other client factory;
  drop `headless: true` from the four (no client tool sets it — it would mark
  as MCP-exposable something deliberately not). Move
  `format_modules_list_for_ai.ts` and `format_module_settings_for_ai.ts` to
  `ai_tools/tools/_internal/`; remove their exports from `lib/ai_tools/mod.ts`.
- `AIToolEnv` ([env.ts](lib/ai_tools/env.ts)) drops `getModuleScript`,
  `getModuleLogs`, `getModuleSettings`; its doc comment's "metrics + modules"
  becomes "metrics". `ClientAIToolEnv` ([client_env.ts](client/src/components/project_ai/ai_tools/client_env.ts))
  gains the three (bodies unchanged: run-keyed `getRunModule*` +
  `requireAttachedRunId()`); its comment at :37 "(the ruling in
  lib/ai_tools/tools_modules.ts)" now points at the moved file.
  `server/mcp/env.ts` (`createMcpAIToolEnv`) and `TEMPLATE_ENV` in
  [mcp_tools.ts:53](server/mcp/mcp_tools.ts#L53) drop the three.
- [build_tools.ts](client/src/components/project_ai/build_tools.ts): replace
  the `getSharedToolsForModules` spread with
  `getClientToolsForModules(projectId, modules, metrics)` in the same slot —
  catalog order is a prompt-cache input; the four tools keep their positions.
  Comment at :49 "Shared data tools (metrics + modules)" → "(metrics)".
- `/mcp` ([mcp_tools.ts](server/mcp/mcp_tools.ts),
  [context_cache.ts](server/mcp/context_cache.ts)): drop the module spread from
  `TEMPLATE_TOOLS` and `sessionTools`; `withSourceHeader` now wraps the two
  metric tools; comment "The 6 package tools, bound" (:122) → "The 2 package
  tools". Text: the no-pin enumeration string in `get_overview` (:94)
  lists the two package tools; `roleAndPurpose` (:115) → "You can list metrics
  and query metric data (CSV) from this instance's pinned results package,
  and read the FASTR methodology and reference docs. Everything is
  read-only."; orientation's closing line "Discover metric and module ids
  with get_available_metrics / get_available_modules" → "Discover metric ids
  with get_available_metrics". [mcp_endpoint.ts](server/mcp/mcp_endpoint.ts)
  instructions likewise.
- **Headless allowlist shrinks** ([headless_allowlist.ts](server/middleware/headless_allowlist.ts)):
  remove `getRunModuleScript`, `getRunModuleLogs`,
  `getRunModuleWithConfigSelections` — no `/mcp` tool needs them, and the
  file's contract is "exactly the routes the /mcp tools need". The comment at
  :29 "gated on instance can_view_data / can_view_logs" drops `can_view_logs`.
  The `routesRunGeneration` mount in `headless_app.ts` stays for the two
  metric reads; `validateHeadlessMounts` still passes.
- Docs (all say "10 tools" or list module tools):
  - SYSTEM_13 principle 2 (:69-82): "metrics ×2, methodology docs ×2,
    `get_info`", `AIToolEnv` = items + value info, "6 read-only tools"; the
    LOW note near :742 (`get_available_modules` / `get_module_log` /
    `get_module_settings`) is re-read as SPA-only.
  - SYSTEM_08 :396-410: the "Module SETTINGS follow script/logs onto the
    run-keyed mount" paragraph now describes the SPA client tools; the
    headless-allowlist sentence lists two routes.
  - PROTOCOL_APP_DEVELOPMENT.md:231 "10 reads" → "6 reads"; :236-238 "the
    run-keyed package reads (items, value info, script, logs, settings) … the
    instance `can_view_data` / `can_view_logs` gates" → "(items, value info)"
    and `can_view_data` alone.
  - USER_GUIDE_MCP.md: :40 count, the Modules table row (:48), the
    `can_view_logs` sentence (:54), the "Inspect a module" example
    (:203-204), the discovery habit (:208-209), the "403 on get_module_log"
    troubleshooting entry (:250), the gates line (:275).
- The `/mcp` orientation still names installed modules (grounding section) —
  that is package description, kept (5c makes it a list).

### 4. Info topics by location

- `lib/ai_tools/info_catalog.ts`: `INFO_TOPICS` = `[iceh]` only.
- New `client/src/components/project_ai/ai_tools/client_info_topics.ts`:
  private `CLIENT_INFO_TOPICS` = `[iceh-equity-profile]` (same
  `InfoCatalogTopic` type; the markdown stays in `client/public/info/`) and
  exported `SPA_INFO_TOPICS = [...INFO_TOPICS, ...CLIENT_INFO_TOPICS]`.
- `getSharedToolsForInfo(topics: InfoCatalogTopic[], transport?)` — lists,
  whitelists and fetches only `topics`; the no-arg listing and the
  unknown-topic error enumerate `topics`.
- `buildSystemPrompt({ …, infoTopics })`; `buildReferenceDocsSection(topics)`
  renders its argument. Lead sentence loses the hard-coded example:
  "Authoritative reference docs you can load on demand with the **get_info**
  tool. When a task relates to one of these topics, call get_info for that
  topic FIRST and follow it." Empty → no section.
- `get_info` description: "…Load the relevant topic before domain-specific
  work (for example, load 'iceh' before analysing ICEH survey data)."
- SPA ([build_tools.ts](client/src/components/project_ai/build_tools.ts),
  [build_system_prompt.ts](client/src/components/project_ai/build_system_prompt.ts))
  passes `SPA_INFO_TOPICS`; `/mcp` (`mcp_tools.ts` tool set + `get_overview`)
  passes `INFO_TOPICS`.
- `client/public/info/iceh.md:7` "For the step-by-step report recipe, see the
  ICEH equity-profile prompt" → "…see the `iceh-equity-profile` topic where
  available" (on `/mcp` it is not listed).

## Changes — phase 2: browsing the package

Tim 2026-08-19: "seeing available indicators, labels, formatting… other
things from the manifest relevant to interpreting the results". Sequenced
after phase 1.

- **5a. `get_metric_data` context gains period coverage and indicator
  metadata.** `getMetricDataForAI` calls `env.getResultsValueInfo(metricId)`
  unconditionally (one extra fetch per call — cache-backed on the SPA, an
  in-process headless dispatch on `/mcp`; no new getter) and prints after
  "Disaggregated by": `**Period coverage:** <min>–<max>` from `periodBounds`
  (or "not time-indexed"). Under "## Dimension Summary", for
  indicator-valued dimensions, per indicator present in the CSV: label,
  format, and where declared "higher is better · green ≥ x · yellow ≥ y"
  (from the items holder's `indicatorMetadata`, already in hand). The single
  most interpretation-relevant addition, landing where the model needs it.
- **5b. New shared tool `get_indicators`** — the package's indicator
  dictionary: for each family present, id, label, format, direction,
  thresholds, group, and the metric ids that carry it. Sources: common
  indicators (`getCommonIndicatorsFromManifestInputs`), module indicators
  (`manifest.indicators`), ICEH indicators. HFA indicators stay in the
  `get_available_metrics` preamble (their ids are query inputs; moving the
  taxonomy is a separate call). Env: one getter `getIndicatorDictionary()` on
  `AIToolEnv`; `/mcp` from the manifest, SPA from the same manifest-derived
  route `getProjectDetail` uses. If that needs a new run-keyed route, it is
  added to the headless allowlist — the third package read (beside
  `getCurrentUser`), by the file's contract.
  Shared because both surfaces read a package. Catalog: `/mcp` = 7 tools.
- **5c. `get_overview` describes the package from the manifest.** Extend
  `PackageGrounding`/`buildPackageGroundingSections`: calendar, country,
  `appVersion`, provenance; modules listed by id + name + `lastRunAt` (replaces
  the bare count); overall period coverage (min/max across
  `resultsObjects.periodBounds`); metric availability — unavailable metrics
  with `reason`. Same section renders on the SPA.
- **Not proposed:** a raw manifest tool (file hashes, input keys, paths — no
  interpretive value, and it re-exposes the internals ruling 3 removes);
  module parameter values as a tool (ruling 3 note).

## Size

Phase 1: net negative in `lib/` and `server/`; a three-file move to
`client/`. Deletions ≈ 70 lines (appendix, one line, three getters from three
envs, module spread from two `/mcp` sites, three allowlist entries, three
`mod.ts` exports); additions ≈ 25 (client topics const, two parameters
threaded through four call sites, `/mcp` text); doc edits in five files. No
new abstraction, no schema change, no migration, no cache-shape change (tool
objects are cached per (token, runId) in `context_cache.ts` and rebuilt on
process restart).

Phase 2: additive. 5a ≈ 30 lines in `format_metric_data_for_ai.ts` (+ the
value-info fetch); 5b one tool file (~60 lines), one env getter on two envs,
one manifest-derived helper; 5c ≈ 30 lines in `build_system_prompt.ts` +
`PackageGrounding`. AI-tool text only — no PO payload shape changes, no
Valkey prefix.

## Verification (agent-runnable, rung 0/1a)

- `deno task typecheck` (includes `lint:systems`); `./validate_protocols`.
- Restart local server, then:
  - `./mcp_probe local --list` → 6 tools, none named `get_module_*` or
    `get_available_modules`.
  - `./mcp_probe local get_metric_data '{"metricId":"m10-02-01"}'` → ends
    after the CSV; `grep -c from_metric` = 0; `Source:` header still first.
  - `./mcp_probe local get_available_metrics | grep -c from_metric` = 0;
    "Visualization presets:" still present; every replicant marker reads
    `REQUIRES selectedReplicant: one <dim> value` (`grep "REQUIRES
    selectedReplicant" | grep -vc ": one "` = 0).
  - `./mcp_probe local get_info` → `availableTopics` = `[iceh]`;
    `get_info '{"topic":"iceh-equity-profile"}'` → typed unknown-topic error
    listing `iceh`.
  - `./mcp_probe local --list | grep -c get_orientation` = 0; `get_overview`
    present with Tim's description.
  - `./mcp_probe local get_overview | grep -c -E "equity profile report|get_available_modules|get_module_|get_orientation"` = 0.
  - Headless: a PAT probe of `getRunModuleScript` through `/mcp`'s headless
    app is denied (allowlist) — `pat_identity_parity_test.ts` pattern.
- Static gates, added to PROTOCOL_APP_DEVELOPMENT.md's standing MCP checks:
  - `grep -rn "from_metric" lib/ai_tools/ | grep -v content_validators.ts:` → 0
    (the one remaining hit is the shared `validateDateRange` comment, which
    is legitimately shared with the client's `from_metric` path).
  - `grep -rn -E "getModuleScript|getModuleLogs|getModuleSettings" lib/ai_tools/ server/mcp/` → 0.
  - `grep -rn -E "getRunModule" server/middleware/headless_allowlist.ts` → 0.
- Phase 2: `./mcp_probe local get_metric_data '{"metricId":"m10-01-01"}'`
  prints "Period coverage" and at least one indicator line with format;
  `./mcp_probe local get_indicators` lists the 9 common indicators with
  labels; `./mcp_probe local get_overview` names `m010` with its
  `lastRunAt` and the package's period coverage.
