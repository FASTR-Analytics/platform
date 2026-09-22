# PLAN: Explore and primary results

Give every module a declared family, tier and sort order, so the wizard, the
insert-figure picker, the AI prompt and the package view all present
modules the same way: the primary result of each data family first, the
supporting analyses under it. Retire m003 and m004 from this app. Then fill
the Explore tab with its first page: one package at one scope, a family
tab, the family's scorecard, and a per-indicator detail.

**Next step: Do 1.** Each session sets this line in its final commit.

Branch: `version2`. Repos touched: this app and
`/Users/timroberton/projects/apps/wb-fastr-modules` (step 1 only).
Read first: `CLAUDE.md`, `SYSTEMS.md`, then §2 and §3 here.

---

## 0. How to work this plan

Cadence, session shapes, the two-things rule and the step rules are
`panther/protocols/PROTOCOL_ALL_PLANS.md`; the app bindings are
`PROTOCOL_APP_PLANS.md`. This plan binds them as follows.

- Instruction: "Do the next step of PLAN_EXPLORE_PRIMARY_RESULTS.md."
- Branch: `version2` (this plan's ruling; `PROTOCOL_APP_PLANS.md` names
  `tim-branch`, and the version 2 work is on `version2`).
- Floor: `deno task typecheck`, `deno task test`, `./validate_protocols`,
  `./run`. No step touches a SQL migration, the seed, the query engine or
  help text, so no conditional gate applies. The manifest transform in
  step 2 is covered by `deno task test` through
  `server/tests/run_manifest_transform_test.ts`.
- Build log: §8. Last step: 4.
- A step reads, in order: `CLAUDE.md`, `SYSTEMS.md`, the SYSTEM file for
  each area the step names, §2 and §3 here, the step's own section in §4,
  and §8.

Rules peculiar to this plan:

- **The modules repo lands first, and it lands on `main`.** Step 1 pushes
  the rebuilt definitions to `FASTR-Analytics/modules` `main` before any
  later step. Every deployed instance, old and new, resolves definitions
  from that branch's HEAD; the additions are invisible to the old app (its
  schema strips unknown keys) and required by this one from step 2 on.
- **`wb-fastr-modules` is a separate git repo with its own `./deploy`.**
  Its commit is listed in the build log like an app commit. The app's
  `deno task typecheck` does not cover it; step 1's gate runs its build and
  validator by hand.
- **Frozen modules are never rebuilt.** `_frozen_modules.ts` in the modules
  repo names the directories exempt from build, typecheck and validation.
  Step 1 adds m003 and m004 to it; nothing in this plan edits, rebuilds or
  deletes a frozen directory.

## 1. The problem

- The modules list is one flat list in registry order, and the order is
  the numbering: [module_registry.ts](lib/types/module_registry.ts). The
  wizard offers modules in that order
  ([generation_wizard_reads.ts:51](server/runs/generation_wizard_reads.ts#L51)),
  the insert-figure picker sorts modules by id
  ([run_read.ts:616](server/run_query/run_read.ts#L616)) and the AI metric
  list sorts by metric id
  ([format_metrics_list_for_ai.ts:36](lib/ai_tools/format_metrics_list_for_ai.ts#L36)).
  So every surface opens on M1 data-quality outputs, and the three modules
  that carry the results people come for (m012, m010, m009) sit at the
  bottom.
- Family is inferred from `dataSources` in
  [dataset_family.ts:28](lib/dataset_family.ts#L28), and the inference
  returns `undefined` for m004, m005, m006 and m012, none of which declares
  a dataset source. The primary HMIS module's metrics therefore carry
  `datasetFamily: null` in every manifest
  ([pipeline.ts:214](server/worker_routines/generate_run/pipeline.ts#L214)).
- Labels carry their number ("M12. Indicator values") in three languages in
  every `_core.ts` and again in the registry, so the number is the only
  ordering anyone sees.
- m003 and m004 are superseded (m012 for indicator values, m011 for
  disruptions, m005 and m006 for coverage) and still offered. The m012 AI
  description still points users at `m3-01-01`
  ([m12-01-01.ts:115](../wb-fastr-modules/m012/_metrics/m12-01-01.ts#L115)),
  and [SYSTEM_08_results_packages.md:883](SYSTEM_08_results_packages.md#L883)
  names a PLAN_1e that folds m012 into m003 and does not exist.
- The Explore tab is empty by design
  ([explore.tsx](client/src/components/explore/explore.tsx)): the products
  restructure plan created the tab and deferred its page (D6). Until it
  lands, metrics and presets can only be browsed from inside an editor.

## 2. The model

Vocabulary, used throughout:

- **Family**: one of `hmis`, `hfa`, `iceh`, declared by the module. The
  app orders families HMIS, HFA, ICEH everywhere.
- **Tier**: `primary` or `secondary`, declared by the module. Each family
  has exactly one primary module: m012 (HMIS), m010 (HFA), m009 (ICEH).
  Every other module is secondary. The UI word for secondary is
  "Supporting analyses".
- **Module order**: family, then tier (primary first), then the declared
  `sortOrder`, then id. One comparator in `lib/`, used by every surface.
- **Scorecard**: the first ready metric, by id, of a family's primary
  module, rendered through that metric's first preset. Today that is
  `m12-01-01` / `scorecard-table`, `m10-01-01` /
  `hfa-category-indicator-table`, `m9-01-01` / `iceh-coverage-table`.
- **Indicator dimension**: the disaggregation that names the family's
  indicators: `indicator_common_id`, `hfa_indicator`, `iceh_indicator`.
- **Explore selection**: a `PackageScope` (package + admin area 2, national
  when null) and a family.

The declared facts, in `_core.ts` of every built module:

```ts
export const core: ModuleDefinitionCore = {
  label: { en: "Indicator values", fr: "Valeurs des indicateurs", pt: "Valores dos indicadores" },
  family: "hmis",
  tier: "primary",
  sortOrder: 1,
  prerequisites: ["m002"],
  ...
};
```

| Module | family | tier | sortOrder |
| --- | --- | --- | --- |
| m012 Indicator values | hmis | primary | 1 |
| m001 Data quality assessment | hmis | secondary | 1 |
| m002 Data quality adjustments | hmis | secondary | 2 |
| m011 Disruption detection | hmis | secondary | 3 |
| m005 Coverage denominators | hmis | secondary | 4 |
| m006 Coverage estimates | hmis | secondary | 5 |
| m010 Health facility assessment | hfa | primary | 1 |
| m009 ICEH survey analysis | iceh | primary | 1 |

The facts travel with the definition: GitHub schema, installed schema, the
manifest's `modules[].moduleDefinition` blob, and from there the wizard
option, `InstalledModuleSummary` and the authoring context. No surface
reads them from the registry. The registry keeps `id`, `label` and
`github`: the label is still the only name a generating or failed run has,
since neither holds a manifest.

The Explore page:

```
[Package ▾]  [Scope: National ▾]                 HMIS | HFA | ICEH
──────────────────────────────────────────────────────────────────
Indicators (rail)   │  Scorecard: the family's primary metric through
  ANC 1st visit     │  its first preset, with the preset's replicant
  ANC 4th visit     │  selector when it declares one (HFA: category).
  Penta 3           │
  ...               │  Selected indicator: every other preset of the
                    │  same metric, filtered to that indicator.
```

Families offered are those whose primary module is in the selected
package. The package defaults to the pin, else the newest ready package;
the scope defaults to national. Selecting an indicator in the rail adds a
`filterBy` on the indicator dimension to each remaining preset of the
scorecard metric; a preset that already disaggregates by that dimension
collapses it through `getEffectivePOConfig`'s `filtered_to_one_value`
rule, which is the existing behaviour and needs no code.

## 3. Rulings

1. **Three declared facts on the module definition: `family`, `tier`,
   `sortOrder`.** Required in the GitHub and installed schemas; typed
   `DatasetType`, `"primary" | "secondary"`, positive integer. No surface
   infers any of them.
2. **No renumbering, ever.** Module ids and metric ids are storage
   vocabulary: manifests, frozen figure bundles, and the client's
   metric-id lists ([special_chart_checks.ts](client/src/generate_visualization/special_chart_checks.ts),
   [indicator_format_metrics.ts](lib/indicator_format_metrics.ts)).
   Reusing m003's number for m012 would make `m3-01-01` mean two things
   across packages. The number prefixes leave every label instead, in the
   definitions and in the registry.
3. **m003 and m004 are retired in this app only.** They leave the
   version2 registry. In the modules repo their directories stay on
   `main`, byte-frozen, listed in `_frozen_modules.ts` beside m007 and
   m008, until no pre-version2 instance is left. Their metric ids stay in
   the client lists as inert data.
4. **m005 and m006 stay**, both secondary HMIS. m006's prerequisites and
   all three of its data sources are m005 outputs
   ([m006/_core.ts:9](../wb-fastr-modules/m006/_core.ts#L9)).
5. **Tier is module-level.** m010's response-status metrics and m009's
   inequality metric are primary because their module is. The scorecard
   metric is the primary module's first ready metric by id, and the
   scorecard preset is that metric's first `vizPresets` entry: declared by
   array order, no new flag.
6. **One module comparator**, `compareModules` in `lib/`, over
   `{ family, tier, sortOrder, id }`, with family order HMIS, HFA, ICEH.
   The wizard, the picker sidebar, the AI module and metric lists, the
   package view and Explore's family tabs all use it. Nothing sorts modules
   by id or label any more.
7. **Manifest schema 13, transform block 11.** The block stamps `family`,
   `tier` and `sortOrder` into every `modules[].moduleDefinition` blob
   that lacks them, from a frozen map `LEGACY_MODULE_PRESENTATION` in the
   transform file covering every module id that ever shipped (m001 to
   m012), and recomputes `metrics[].datasetFamily` from the module's
   declared family. A module id outside the map throws: the map is
   complete by construction, so a miss is a code defect. The precedent is
   `LEGACY_SEED_ORDER` in [indicator_catalog.ts:68](server/runs/indicator_catalog.ts#L68).
8. **`metrics[].datasetFamily` is non-null from schema 13.** The
   `runMetricSchema` field drops `.nullable()`. The wire type
   `MetricWithStatus.datasetFamily` stays optional, for the reason its
   comment gives.
9. **`lib/dataset_family.ts` is deleted.** `getDatasetFamilyFromRun`, the
   pipeline's metric stamp and `build_run_package.ts`'s schema selection
   read the declared field. `indicator_catalog.ts` keeps its own dispatch
   on `scriptGenerationType` and `dataSources` (both declared facts), and
   `getDatasetTypes` moves into it as a private helper: block 1 recomputes
   the indicator catalog before block 11 runs, and blocks are never
   reordered, so block 1 may not depend on a field block 11 stamps.
10. **The m012 AI text loses its `m3-01-01` pointer.** The raw-versus-
    adjusted facility view is not replaced; if it is ever wanted it is a
    metric on m002 over `M2_adjusted_data.csv`, not part of this plan.
11. **Old deployments see the unprefixed labels.** Pushing the definitions
    changes the label the pre-version2 app shows wherever it reads the
    definition. Accepted as cosmetic.
12. **Explore is read-only in this plan.** No insert-into-product, no
    figure editor, no copilot, no download. It is the third caller of
    nothing yet. Those are the follow-on plan named in §6.
13. **No merged values table.** The three primary metrics disagree on
    time (`period_id` / `time_point` / `year` + `source`), geography
    (admin areas / facility rows / stratifier levels with no admin
    columns) and thresholds (dictionary rule / none / none), and a figure
    is one metric. A cross-family indicator search is the follow-on plan's.
14. **Explore state.** The family tab persists in `t4_ui` as
    `exploreFamily`, like `dataSection`. Package and scope are page
    signals: they start at the pin and national on every mount and are
    never stored, so a deleted package can never be a stored default.
15. **The picker's default sidebar item is "Primary results"**: the
    primary modules' metrics of every family in the package. "All
    modules" stays as the second item; the module items follow in module
    order under a family heading.
16. **Shared pieces move to the lowest common ancestor.** The scope picker
    and the preset fetch-and-build helper are used by `products/` and
    `explore/` after step 4, so they live in `components/_shared/`
    (PROTOCOL_UI_STRUCTURE). Nothing else moves.
17. **Package contents stay run-keyed and approved-user.** Explore reads
    the authoring context and figure items through the existing run-keyed
    instance routes (D7). No new route.

## 4. Steps

### Step 1: Declare the facts in the modules repo

**Surface.** In this app: `lib/types/_module_definition_github.ts`. In
`wb-fastr-modules`: `.validation/_module_definition_github.ts` (vendored
copy), `vendor_schema` (its `SRC_DIR` points at `wb-fastr`, the old
checkout; repoint at `wb-fastr-v2`), `_frozen_modules.ts`, `DOC_MODULES.md`,
and for each of m001, m002, m005, m006, m009, m010, m011, m012: `_core.ts`
and the rebuilt `definition.json`; plus `m012/_metrics/m12-01-01.ts`.

**Deliverable.** The GitHub schema requires `family`, `tier` and
`sortOrder` (R1), and `ModuleDefinitionCore` carries them. The vendored
copy is byte-identical to the app's. Every built module declares the
table in §2 and a label without its number in en, fr and pt (R2). m003
and m004 are in `FROZEN_MODULE_DIRS` (R3) and their directories are
untouched. The m012 disaggregation guidance no longer names `m3-01-01`
(R10). `DOC_MODULES.md`'s `_core.ts` example shows the three fields and
its file table row says what they are. `definition.json` is rebuilt for
the eight built modules and validates. The modules repo commit is pushed
to `main`.

**Not in this step.** The installed schema, the registry, any read of the
fields. Deleting a frozen directory.

**Gates.** In the modules repo: `deno task typecheck`, `deno task build`
(a second run leaves the tree clean), and
`deno run --allow-read --allow-net .validation/validate_definitions.ts`
green. `git diff --stat` there touches no frozen directory. In this app:
the floor; the dev server boots with `FASTR_MODULES_LOCAL_DIR` pointing at
the pushed checkout and the wizard's module options resolve (the
`getRunGenerationModuleOptions` read succeeds, proven by the boot test or
a harness).

**Ends with.** One commit in the modules repo (pushed), one commit here.

### Step 2: The facts on the read plane, and the retirement

**Surface.** `lib/types/_module_definition_installed.ts`,
`lib/types/module_registry.ts`, `lib/types/modules.ts`,
`lib/types/run_manifest.ts`, `lib/types/run_generation.ts`,
`lib/types/mod.ts`, `lib/mod.ts`, `lib/dataset_family.ts` (deleted),
`lib/group_metrics.ts` (the comparator, R6),
`server/runs/manifest_transform.ts`, `server/runs/indicator_catalog.ts`,
`server/runs/build_run_package.ts`, `server/runs/generation_wizard_reads.ts`,
`server/worker_routines/generate_run/pipeline.ts`,
`server/run_query/run_read.ts`, `server/run_query/mod.ts`,
`server/tests/run_manifest_transform_test.ts`,
`client/src/state/instance/t2_run_authoring_context.ts`,
`SYSTEM_08_results_packages.md`, `SYSTEM_09_viz_query_cache.md`,
`SYSTEM_11_viz_authoring.md` (the `lib/` manifest entries only).

**Deliverable.** The installed schema requires the three fields (R1).
`RUN_MANIFEST_SCHEMA_VERSION` is 13; block 11 stamps the blob from
`LEGACY_MODULE_PRESENTATION` and recomputes `metrics[].datasetFamily`,
which is non-null in the schema (R7, R8); the transform file's header
lists it. `lib/dataset_family.ts` is gone and its three callers read the
declared field; `indicator_catalog.ts` owns `getDatasetTypes` (R9). The
registry lists m001, m002, m005, m006, m009, m010, m011, m012 with
unprefixed labels (R2, R3). `RunGenerationModuleOption` and
`InstalledModuleSummary` carry `family`, `tier`, `sortOrder`;
`getModulesFromManifest` orders by `compareModules` (R6). The authoring
context cache is `run_authoring_context_v3`. SYSTEM_08 describes the
three facts, the registry's reduced role, block 11, and no longer names
PLAN_1e or M4; SYSTEM_09's sample-size line reads the declared family.

**Not in this step.** Any UI change. The AI lists. The package view's
labels.

**Gates.** Floor. `run_manifest_transform_test.ts` gains cases that pin
block 11: a v12 manifest whose module blob lacks the fields gains them
from the map and its metrics gain the family; a blob that already carries
them is unchanged; a second pass writes nothing; an unknown module id
throws. A boot against the dev database transforms every existing package
to 13 (the boot log's transform summary; a package refused as unreadable
is a finding).

**Ends with.** Two commits, each green: the schema, registry and family
derivation; then the transform, its test and the docs.

### Step 3: Every listing in module order

**Surface.** `client/src/components/results_packages/wizard/step_2_modules.tsx`,
`client/src/components/results_packages/wizard/step_3_confirm.tsx`,
`client/src/components/results_packages/package_view/package_view.tsx`,
`client/src/components/results_packages/package_view/status.tsx`,
`client/src/state/instance/t2_runs.ts`,
`lib/types/run_generation.ts` (`RunDetail.modules[]` gains `label`,
`family`, `tier`, `sortOrder`), `server/runs/package_internals.ts`,
`client/src/components/products/_shared/insert_figure/step_1_metric.tsx`,
`client/src/components/products/_shared/insert_figure/module_sidebar.tsx`,
`lib/group_metrics.ts`,
`lib/ai_tools/format_metrics_list_for_ai.ts`, `lib/ai_tools/tools_metrics.ts`,
`client/src/components/products/copilot/ai_debug_panel.tsx`,
`client/src/components/products/copilot/ai_tools/tools/format_for_ai/format_modules_list_for_ai.ts`,
`SYSTEM_08_results_packages.md`, `SYSTEM_11_viz_authoring.md`,
`SYSTEM_13_ai_assistant.md`.

**Deliverable.** Wizard step 2 renders one section per family in family
order, the primary module first and the secondary modules under a
"Supporting analyses" subheading, with the existing closure, "Required
by" and missing-family behaviour unchanged (R6). The insert-figure
sidebar opens on "Primary results", then "All modules", then the modules
under family headings in module order; `groupMetricsByModule` orders by
`compareModules` (R15). The AI metric list is in module order, primary
first, and the copilot's module list likewise; both take the modules list
they need. `RunDetail.modules[]` carries the manifest's label and the
three facts; the package view orders its module cards by `compareModules`
and names each from `RunDetail`, while `moduleLabel` (registry) serves
only the generating and failed branches and the wizard's confirm step.
`t2_runs` bumps its cache name. SYSTEM_08, SYSTEM_11 and SYSTEM_13 prose
say so.

**Not in this step.** Explore. Any change to what a module or metric
means.

**Gates.** Floor.

**Ends with.** Three commits, each green: the wizard and package view;
the picker; the AI lists.

### Step 4: The Explore page

**Surface.** `client/src/components/explore/**` (new files as the step
needs; `explore.tsx` is the page), `client/src/state/t4_ui.ts`
(`exploreFamily`), `client/src/components/_shared/scope_picker.tsx` (moved
from `products/_shared/`, with its importers in `products/**` repointed),
`client/src/components/_shared/figure_preview.ts` (the fetch-and-build
helper lifted out of `products/_shared/insert_figure/preset_preview.tsx`,
which then imports it), `client/src/components/_shared/figure_editor/replicate_by_options.tsx`
(only if `ReplicateByOptionsSelect` needs a prop for this caller),
`client/src/components/products/_shared/mod.ts`, `client/src/components/_shared/mod.ts`,
`SYSTEM_11_viz_authoring.md` (claims `_shared/figure_preview.ts` and the
explore files), `SYSTEM_12_documents_sharing.md` (its `products/_shared/*.tsx`
glob no longer covers the scope picker; it claims
`client/src/components/_shared/scope_picker.tsx` explicitly),
`SYSTEM_08_results_packages.md` (the scope picker's path in the AA2
ruling), `SYSTEM_14_client_shell.md`.

**Deliverable.** The Explore tab renders the page in §2 for an approved
user (R12 to R17): package `Select` over `instanceState.readyPackages`
defaulting to the pin; the moved `ScopePicker`; family tabs
(`TabsNavigation`, as the Data page) over the families whose primary
module is in the package, persisted in `exploreFamily`; the scorecard
through the shared figure helper with `ReplicateByOptionsSelect` when the
preset declares a replicant; an indicator rail from the authoring
context's family catalog (`hmisIndicators`, `hfaTaxonomy.indicators`,
`icehIndicators`) in catalog order; and, for the selected indicator, the
scorecard metric's other presets each filtered to it. Empty states are
typed and worded: no ready package, a package with no primary module, a
family whose scorecard metric is unavailable (its stamped reason). Every
read goes through `t2_run_authoring_context` and `t2_figure_data`, so a
preset seen in the picker and in Explore under the same pair is one cache
entry. SYSTEM_11 describes the page and drops "empty until the results
explorer plan"; SYSTEM_11's `ReplicateByOptionsSelect` open item is
deleted; SYSTEM_14 names `exploreFamily` and the tab's page.

**Not in this step.** Any write. Insert into product. The figure editor.
A copilot mount. Cross-family search. Help buttons.

**Gates.** Floor, with `lint:structure` green over the moves (the
structure lint is chained into the typecheck). `git diff -M --name-status`
lists the two moved files as renames.

**Ends with.** Two commits, each green: the two moves with their importers
repointed and manifests edited; then the page and its docs. The review
that passes deletes this file in its commit.

## 5. Gates catalogue

| Gate | What it proves | Command | First reached |
| --- | --- | --- | --- |
| G1 | The floor | §0 | 1 |
| G2 | Definitions build, validate and are current | in `wb-fastr-modules`: `deno task typecheck`, `deno task build` twice (second leaves the tree clean), `deno run --allow-read --allow-net .validation/validate_definitions.ts` | 1 |
| G3 | Vendored schema is the app's | `diff wb-fastr-modules/.validation/_module_definition_github.ts lib/types/_module_definition_github.ts` empty | 1 |
| G4 | Frozen directories untouched | `git diff --stat <c>^ <c> -- m003 m004 m007 m008` empty in the modules repo | 1 |
| G5 | Block 11 is pinned | `deno task test` runs the new cases in `server/tests/run_manifest_transform_test.ts` | 2 |
| G6 | Every dev package transforms to 13 | boot log against the dev database reports no unreadable package | 2 |
| G7 | Moves are moves | `git diff -M --name-status <c>^ <c>` lists `R…` for each moved file | 4 |

## 6. Out of scope

- **A follow-on plan, "Explore actions"**: insert into product from
  Explore (the insert-figure wizard's third caller), open in the figure
  editor, download, a copilot mount, and a cross-family indicator search.
  Nothing here anticipates them beyond the shared figure helper.
- A merged cross-family values table (R13).
- A replacement for `m3-01-01`'s facility-level view (R10).
- Deleting m003, m004, m007 or m008 from the modules repo (R3).
- Metric-level tier or an explicit scorecard-metric flag (R5).
- Any change to what the three primary metrics compute, to their presets,
  or to thresholds for HFA and ICEH indicators.
- The registry-label lookup for generating and failed runs: it stays, by
  the reason in §2.
- The `MetricWithStatus.datasetFamily` wire optionality (R8).

## 7. Rollout and rollback

- Step 1 pushes the modules repo to `main` at once. Safe for every
  deployed instance: the old app strips the new keys, the version2
  testing instance strips them until it is redeployed, and both show the
  unprefixed labels (R11).
- Nothing ships from this app before step 4's review passes;
  `./deploy_testing` may run at Tim's discretion after step 2's review to
  see the transform against the testing instance's packages.
- Rollback of the app after step 2 has deployed: a build requiring
  schema 12 refuses a 13 manifest as newer and serves the package as
  unavailable. That is the standing transform rule and the reason step 2
  ships only after its review. The modules repo needs no rollback: the
  old schema strips the fields.

## 8. Build log

| Date | Step | Entry |
| --- | --- | --- |
