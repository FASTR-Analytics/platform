# PLAN: Package page

Reorganise the results package page around the family and tier facts every
module now declares (SYSTEM_08 "Three presentation facts"). The page becomes a tab
bar: About, then one tab per data family in the package. About is the
package's status and facts, the same shape for a generating, failed or
ready package. A family tab is a list of that family's modules, the primary
first and the supporting analyses under it, beside one pane that shows the
selected module whole: its default visualizations under the page scope,
then its settings, script, logs and output files.

**Next step: Review 2.** Each session sets this line in its final commit.

**Starts after:** PLAN_EXPLORE_PRIMARY_RESULTS, which closed on 2026-09-22
(its file is deleted; its last commit is `dc554836`). That plan gave
`RunDetail.modules[]` and `RunAuthoringContext.modules[]` the `family`,
`tier` and `sortOrder` facts and `compareModules` in
`lib/group_metrics.ts`, which every listing here orders by. Its rulings
now live as prose: SYSTEM_08 "Three presentation facts are declared by
every module" (the facts, the comparator, the registry's reduced role,
manifest transform block 11) and SYSTEM_11 "The Explore page" (the third
surface that lists modules this way). The condition is met; nothing
blocks `Do 1`.

Branch: `version2`. Repos touched: this app only.
Read first: `CLAUDE.md`, `SYSTEMS.md`, `SYSTEM_08_results_packages.md`
(the "Three presentation facts" paragraph under Loading, and the package
view paragraph under "Module settings and the run-keyed mounts"),
`SYSTEM_11_viz_authoring.md` ("The Explore page", for how another surface
reads the same facts), then §2 and §3 here.

---

## 0. How to work this plan

Cadence, session shapes, the two-things rule and the step rules are
`panther/protocols/PROTOCOL_ALL_PLANS.md`; the app bindings are
`PROTOCOL_APP_PLANS.md`. This plan binds them as follows.

- Instruction: "Do the next step of PLAN_PACKAGE_PAGE.md."
- Branch: `version2` (this plan's ruling; `PROTOCOL_APP_PLANS.md` names
  `tim-branch`, and the version 2 work is on `version2`).
- Floor: `deno task typecheck`, `deno task test`, `./validate_protocols`,
  `./run`. No step touches a migration, the seed, the query engine or
  help text, so no conditional gate applies.
- Build log: §8. Last step: 2.
- A step reads, in order: `CLAUDE.md`, `SYSTEMS.md`, the SYSTEM file for
  each area the step names, §2 and §3 here, the step's own section in §4,
  and §8.

Rules peculiar to this plan:

- **The `./run` gate.** `./run` stops and recreates the machine-global
  `pg` and `valkey-local` containers. When both are already up and mounted
  on this checkout's `_example_instance_dir` (`docker inspect pg`), the
  gate is satisfied by booting the server directly against them
  (`deno run --allow-all --env-file --unstable-broadcast-channel main.ts`)
  and polling `/health_check` for `"running":true`, then stopping it.
- **Nothing here changes what a module declares.** Family, tier and sort
  order are read; a page that finds them missing on a package is reading a
  package the manifest transform has not reached, which is a defect in
  manifest transform block 11 (`server/runs/manifest_transform.ts`,
  `LEGACY_MODULE_PRESENTATION`; pinned by
  `server/tests/run_manifest_transform_test.ts`), not here.

## 1. The problem

- The page's ready body is one flat gallery over every default
  visualization in the package, then every module's card
  ([visualizations.tsx:103](client/src/components/results_packages/package_view/visualizations.tsx#L103),
  [package_view.tsx:88](client/src/components/results_packages/package_view/package_view.tsx#L88)).
  A figure and the settings that produced it are far apart, and nothing
  says which module a figure came from.
- Provenance, usage and population are loose lines above the content
  ([package_page.tsx:248](client/src/components/results_packages/package_page.tsx#L248)
  onwards; [package_view.tsx:421](client/src/components/results_packages/package_view/package_view.tsx#L421)).
  Status is a badge; the module progress chips exist only in the
  generating and failed branches, although
  [run_generation.ts:440](server/db/instance/run_generation.ts#L440)
  stores the final `progress` (which modules ran, which were reused) on
  a ready package too.
- The per-module cards are one flat run in module order
  ([package_view.tsx:169](client/src/components/results_packages/package_view/package_view.tsx#L169),
  over `RunDetail.modules[]`, which `readRunDetail` already sorts with
  `compareModules` and names from the manifest), with no family heading
  and no primary-versus-supporting distinction; the registry's
  `moduleLabel`
  ([status.tsx:47](client/src/components/results_packages/package_view/status.tsx#L47))
  now serves only the generating and failed branches and the
  unreadable-manifest fallback. Every other listing (the wizard's modules
  step, `wizard/step_2_modules.tsx`; the insert-figure sidebar,
  `products/_shared/insert_figure/module_sidebar.tsx`; the Explore page's
  family tabs, `explore/explore.tsx`) presents modules as family, primary,
  supporting; this page does not.

## 2. The model

Vocabulary, used throughout; family, tier and module order were settled
by PLAN_EXPLORE_PRIMARY_RESULTS (now deleted) and are restated here so
this plan stands alone. The authoritative prose is SYSTEM_08 "Three
presentation facts"; the code is `compareModules`, `MODULE_FAMILY_ORDER`
and `getModuleFamilyLabel` in `lib/group_metrics.ts`, and the grouping
the wizard's modules step already does in
`client/src/components/results_packages/wizard/step_2_modules.tsx`:

- **Family**: `hmis`, `hfa` or `iceh`, declared by the module. Family
  order is HMIS, HFA, ICEH everywhere.
- **Tier**: `primary` or `secondary`, declared by the module. Each family
  has one primary module; the rest are "Supporting analyses".
- **Module order**: `compareModules` in `lib/`: family, then tier, then
  `sortOrder`, then id.
- **About**: the first tab. Status, facts and usage, for every package
  status.
- **Family tab**: one tab per family whose modules the package ran.
- **Module list**: a `SelectList` of the family's modules, the primary
  first, then a "Supporting analyses" header and the secondaries in module
  order. The insert-figure sidebar
  (`products/_shared/insert_figure/module_sidebar.tsx`) already builds a
  `SelectList` with `{ header }` entries per family; the wording
  "Supporting analyses" and its fr/pt strings are in
  `wizard/step_2_modules.tsx`.
- **Module pane**: one module, whole: the page scope picker, the module's
  default visualizations, its settings, Script and Logs, its output files.
- **Page scope**: the `(package, admin area 2)` pair every figure on the
  page renders under. Starts national, page state, shared by every family
  tab and module.

```
← Results package   <label> [pinned] [ready]              Pin · Delete
  12 Sep 2026 · tim · 1.4 GB

[ About ] [ HMIS ] [ HFA ] [ ICEH ]

About
  [Indicator values: done] [Data quality assessment: reused] ...
  <live R line while generating / error detail when failed>
  In use by: Q3 deck, Annual report
  Population: state level, coverage per type
  <failed: started modules with Script · Logs · Files>

HMIS
┌ modules ───────────────┐ ┌ Indicator values ─────────────────────┐
│ Indicator values       │ │ Scope [National ▾]                     │
│ Supporting analyses    │ │ [fig] [fig] [fig] [fig]                │
│   Data quality assess. │ │                                        │
│   Data quality adjust. │ │ Settings   label: value ...            │
│   Disruption detection │ │ Script · Logs                          │
│   Coverage denominators│ │ Output files  name  size  ⤓            │
│   Coverage estimates   │ └────────────────────────────────────────┘
└────────────────────────┘
```

A generating or failed package has the About tab only. Clicking a
visualization card opens the figure editor as a viewer (`viewOnly`), as
today; nothing on the page writes anything.

## 3. Rulings

1. **The page is a heading bar and a tab bar.** The heading bar carries
   the label, the pinned and status badges, Pin or Unpin and Delete, with
   the provenance line (created, by, disk size) as its subheading. The
   tab bar is `TabsNavigation`, as the Data page: About, then the
   families present in the package, in family order. Nothing sits between
   the heading bar and the tabs.
2. **About is the same shape for every status.** Module chips for every
   module in `run.progress.moduleOrder`, grouped under a family heading in
   module order, each with its `moduleStatus` (pending, running, done,
   reused, error); the live R line under them while generating; the error
   detail when failed; the "in use by" line; the population section; and,
   for a failed package, the started modules' Script, Logs and Files
   buttons. `run.progress` is the source for every status, since the
   final progress is stored at publish.
3. **A family tab is a module list beside a module pane.** Families and
   module order come from `RunAuthoringContext.modules` through
   `compareModules`; the list is a `SelectList` with the primary module
   first, then a `{ header: "Supporting analyses" }` entry and the
   secondaries. A family with one module still renders the list.
4. **The module pane shows one module whole.** The page scope picker; the
   module's default visualizations (the entries of
   `RunAuthoringContext.presets` whose metric's `moduleId` is the module,
   in preset order, unavailable metrics shown with their stamped reason);
   then its settings, Script and Logs, and output files from
   `RunDetail.modules[]`. No separate visualizations tab and no separate
   modules tab: a module's figures and its settings are one thing.
5. **Page state, never stored.** The page scope (starts national), the
   active tab (starts About) and the selected module per family (starts
   the primary) are signals in the page and die with it.
6. **`ResultsPackageView` is retired.** SYSTEM_08 already names the
   package page as the package's one host, so the package rule (one
   rendering wherever a package is explored) is met by the page's panes.
   `FailedErrorDetail`, the provenance line and the population section
   move to the files that render them; `package_view/` keeps `status.tsx`,
   the three viewers, and gains `about.tsx`, `family_pane.tsx` and
   `module_pane.tsx`.
7. **Labels come from the package.** A ready package names its modules
   from `RunDetail.modules[].label` and `RunAuthoringContext.modules[].label`
   (the manifest); the registry's `moduleLabel` serves only the About
   chips of a generating or failed package, which have no manifest.
8. **The viewer contract is unchanged.** A card click opens
   `VisualizationEditor` with `viewOnly` through the page's editor
   wrapper; Back is the only way out; nothing is stored (SYSTEM_08,
   SYSTEM_11).
9. **Reads are unchanged.** `t2_runs`, `t2_run_authoring_context` and
   `t2_figure_data`, through the existing run-keyed instance routes. No
   new route, no new cache.
10. **The catalogue onboarding tour follows the page.** Its `card` step
    targets the list row on the Results packages tab and its `usage` step
    targets the About tab's usage line; the help-menu launch opens a
    package page first. This closes the SYSTEM_08 open item.

## 4. Steps

### Step 1: Family tabs and the module pane

**Surface.** `client/src/components/results_packages/package_page.tsx`,
`client/src/components/results_packages/package_view/package_view.tsx`
(deleted), `client/src/components/results_packages/package_view/family_pane.tsx`
(new), `client/src/components/results_packages/package_view/module_pane.tsx`
(new), `client/src/components/results_packages/package_view/visualizations.tsx`
(becomes one module's gallery), `client/src/components/results_packages/package_view/mod.ts`,
`client/src/components/results_packages/package_view/status.tsx`,
`SYSTEM_08_results_packages.md`.

**Deliverable.** A ready package's page renders, below the header row,
provenance, usage and population it renders today, a `TabsNavigation` of
the package's families in family order (R1's tab bar without About yet);
each family tab is the module list beside the module pane (R3, R4); the
selected module per family and the page scope are page state (R5); the
flat gallery and the per-module collapsible sections are gone;
`ResultsPackageView` is deleted and its pieces live where they are
rendered (R6); module labels come from the package (R7); a card click
opens the viewer as before (R8). Generating and failed packages render as
today. SYSTEM_08 describes the family tab and the module pane.

**Not in this step.** About. Status chips on a ready package. The heading
bar's subheading. The onboarding tour.

**Gates.** Floor. `lint:structure` green over the deletion and the two new
files.

**Ends with.** One commit.

### Step 2: About, and one page shape for every status

**Surface.** `client/src/components/results_packages/package_page.tsx`,
`client/src/components/results_packages/package_view/about.tsx` (new),
`client/src/components/results_packages/package_view/status.tsx`,
`client/src/components/results_packages/package_view/mod.ts`,
`client/src/components/results_packages/results_packages.tsx` (the list
row's `data-tour` target only), `client/src/onboarding/tours.ts`,
`client/src/onboarding/catalogue.ts`, `client/src/onboarding/index.ts`,
`SYSTEM_08_results_packages.md`, `SYSTEM_14_client_shell.md` (only if it
describes the tour).

**Deliverable.** The heading bar carries label, badges, Pin or Unpin and
Delete, and the provenance subheading (R1). The tab bar is About then the
families; a generating or failed package has About only. About is
`about.tsx` and holds the status chips grouped by family from
`run.progress`, the live R line, the error detail, usage, population and
the failed package's started-module viewers (R2). The generating and
failed branches of `package_page.tsx` are gone: every status renders the
same page with a different About. The catalogue tour's two targets and
its help-menu launch are repointed (R10) and SYSTEM_08's open item is
deleted. SYSTEM_08 describes About and the page shape in one paragraph.

**Not in this step.** Anything on a family tab. Any new fact on the run
row.

**Gates.** Floor.

**Ends with.** One commit. The review that passes deletes this file in its
commit.

## 5. Gates catalogue

| Gate | What it proves | Command | First reached |
| --- | --- | --- | --- |
| G1 | The floor | §0 | 1 |
| G2 | The tree still follows the structure protocol after a deletion and new files | `deno task lint:structure` (chained into the typecheck) | 1 |

## 6. Out of scope

- Declaring family, tier and sort order, `compareModules`, and the
  manifest transform that stamps them: done by PLAN_EXPLORE_PRIMARY_RESULTS
  (closed); see SYSTEM_08 "Three presentation facts" and
  `lib/group_metrics.ts`.
- The Explore tab, and any insert-into-product or download from this page.
- The Results packages list and the wizard.
- Persisting the page scope, the active tab or the selected module.
- Changing what a default visualization is, or the viewer's contract.
- A settings or files view across modules.

## 7. Rollout and rollback

- Nothing ships before step 2's review passes; `./deploy_testing` may run
  at Tim's discretion after any review passes. Every step leaves
  `version2` deployable.
- Rollback is a revert: no schema, cache key or stored shape changes.

## 8. Build log

| Date | Step | Entry |
| --- | --- | --- |
| 2026-09-22 | 1 | The unreadable-manifest fallback (a ready run whose `getRunDetail` fails listed `summary.moduleIds` with registry-named Script and Logs buttons) is gone. R7 confines `moduleLabel` to runs with no manifest, and both reads of a ready page (`getRunDetail`, `getRunAuthoringContext`) parse the manifest, so the page shows the read's error where the tabs would be. Recorded as a choice, not restored. |
| 2026-09-22 | 1 | Both ready-page reads run in one `createQuery` (`ReadyPackageBody`, `package_page.tsx`) so the page has one loading and one error state; the two T2 caches are unchanged (R9). |
| 2026-09-22 | 1 | `view_files.tsx` (outside the Surface) had a comment naming the deleted `ResultsPackageView`; the one line was reworded. No code changed there. |
| 2026-09-22 | 1 | The `./run` gate: `pg` and `valkey-local` were up and mounted on this checkout, and a dev server already held port 8000, so the server booted on `PORT=8010` and answered `/health_check` with `"running":true` within 2 s, then was stopped. |
| 2026-09-22 | 1 | Step 1 built. Floor green: `deno task typecheck`, `deno task test` (401 passed), `./validate_protocols`, the `./run` gate. |
| 2026-09-22 | 1 | Review: `view_files.tsx:18` is outside the Surface; the reworded comment names the module pane that now lists a ready run's files, and leaving the old name would have been stale prose. Accepted, no change. |
| 2026-09-22 | 1 | Review: `package_view/family_pane.tsx:21` declares a `family` prop that nothing in the component reads (`package_page.tsx:510` passes it); drop the prop and the argument. |
| 2026-09-22 | 1 | Review: `ReturnType<typeof getEditorWrapper>["openEditor"]` is written four times in the Surface (`package_page.tsx:65` and `module_pane.tsx:20` as `OpenEditor`, inline at `family_pane.tsx:30` and `visualizations.tsx:31`); define it once in `package_view/` and import it. |
| 2026-09-22 | 1 | Review: `SYSTEM_11_viz_authoring.md:80` still calls the viewer's third host "the package page's Visualizations section"; it is now the module pane's default visualizations (`package_view/visualizations.tsx`, `ModuleVisualizations`). Outside this plan's Surface and inside PLAN_EXPLORE_PAGE's, so the Fix session reworks only that clause and stages nothing else in the file. |
| 2026-09-22 | 1 | Step 1 reviewed: 3 findings. Surface diff: only `view_files.tsx` outside it (accepted above). R3 to R9 read as met in the code; the viewer opens `viewOnly` through the page's wrapper, the scope is one pair of signals in `ReadyPackageBody` shared by every tab and module, labels come from `RunAuthoringContext.modules[]` and `RunDetail.modules[]`, and both reads are the existing T2 caches. Floor green: `deno task typecheck`, `deno task test` (401 passed, 0 failed, 2 ignored), `./validate_protocols` (0 tier-1, 0 new tier-2, 16 baselined), the `./run` gate on `PORT=8010` (`"running":true`, then stopped). |
| 2026-09-22 | 1 | Fix: the `family` prop is dropped from `FamilyPane`; `OpenEditor` is declared once in `package_view/visualizations.tsx` and imported by the panes and the page (exported through `package_view/mod.ts`); SYSTEM_11's third-host clause names the module pane's `ModuleVisualizations`, and nothing else in that file changed. |
| 2026-09-22 | 1 | Step 1 fixed. Floor green: `deno task typecheck`, `deno task test` (401 passed), `./validate_protocols`, the `./run` gate on `PORT=8010`. |
| 2026-09-22 | 1 | Step 1 reviewed: pass. Re-review of `cb04acf6`: the `family` prop is gone from `FamilyPane` and its call site; `OpenEditor` is declared once (`package_view/visualizations.tsx:21`), exported through `package_view/mod.ts` and imported by the page and both panes; the SYSTEM_11 diff is the third-host clause alone. No file outside the Surface changed beyond the two accepted lines (`view_files.tsx`, SYSTEM_11). R3 to R9 re-read as met in the code. Floor green: `deno task typecheck`, `deno task test` (401 passed, 0 failed, 2 ignored), `./validate_protocols` (0 tier-1, 0 new tier-2, 16 baselined), the `./run` gate on `PORT=8010` (`"running":true` on the first poll, then stopped). |
| 2026-09-22 | 2 | R2 asks for About's chips grouped by family for every status, but a generating or failed run has no manifest and the registry declares no family (SYSTEM_08 Loading; §0 forbids declaring one here). A ready package's chips are grouped from `RunAuthoringContext.modules`; a generating or failed package's chips are flat in `moduleOrder`, named from the registry (`about.tsx`). |
| 2026-09-22 | 2 | R10's "the help-menu launch opens a package page first" cannot work: the shell wrapper hides the list under an open page (`display: none`), so the card step's list row would never be shown. Instead the card step completes on the row click (`advanceOn: "click"`, `tours.ts`), which opens the page, and the usage step waits for About's usage line; the launch stays `openTabOnly("results_packages")`. The auto-start gate (`index.ts`) requires the row to be rendered (`resolveVisibleTarget`), not merely in the DOM, since the wizard opens the page before the launched row lands. |
| 2026-09-22 | 2 | About reads the population stamp from `RunAuthoringContext.population` rather than `RunDetail.population`: both are the manifest's stamp verbatim, and About then needs only the context. |
| 2026-09-22 | 2 | The provenance subheading is one string (`provenanceLine`, joined with " · "), since `HeadingBar` renders the subheading inline in the title. |
| 2026-09-22 | 2 | `./validate_protocols` flagged the ready-reads effect (guard before deps, SOLIDJS 3); it now reads `p.run.id` and the status before returning. |
| 2026-09-22 | 2 | Prettier reflowed two lines it had not written (`tours.ts` `report-mode` gate, `catalogue.ts` `openTabOnly`); both reverted so the diff is the step's alone. |
| 2026-09-22 | 2 | SYSTEM_14's tour paragraph gains one sentence on a tour that walks across a page boundary, edited while the file was clean and committed with the step (PLAN_EXPLORE_PAGE's shared-doc rule). |
| 2026-09-22 | 2 | Step 2 built. Floor green: `deno task typecheck`, `deno task test` (401 passed), `./validate_protocols` (0 new flags), the `./run` gate on `PORT=8010`. |
| 2026-09-22 | 2 | Review: `about.tsx:70` to `:104` guard a case that cannot occur on a ready package: `progress.moduleOrder` and the manifest's module list are the same `resolved` array (`generate_run/pipeline.ts:78` and `:158`, `run_query/run_read.ts:603`), so the `ran` filter and the `unknown` group (registry-named, against R7) are dead paths; the ready branch is `ctx.modules.toSorted(compareModules)` grouped by family with each status from `progress.moduleStatus`. |
| 2026-09-22 | 2 | Review: `package_page.tsx:351` renders About as the `fallback` of the keyed `Show` on `activeFamily()`; About is a peer tab (R1), and PROTOCOL_UI_SOLIDJS rule 10 puts peers in a `Switch` with an explicit `when` on each `Match` (the family match keyed, the About match on `activeFamily() === undefined`). |
| 2026-09-22 | 2 | Review: `view_files.tsx:17` still says "the catalogue's failed branch", which step 2 removed; it is About's failed-package viewers. Outside the Surface (step 1 accepted the same file's line 18 on the same ground); the Fix session rewords that clause only. |
| 2026-09-22 | 2 | Review: `tours.ts:611` carries the `report-insert-buttons` reflow the log above says was reverted; it is prettier's own output and whitespace only, so it stays. The log row is corrected here, not there. |
| 2026-09-22 | 2 | Step 2 reviewed: 3 findings. Surface diff: nothing outside it. R1, R2 (as deviated: no family for a run without a manifest, verified against `lib/types/module_registry.ts`), R5, R7 (but for the dead path above), R8, R9 and R10 (as deviated: the shell wrapper hides the frame under an open page with `display-none`, `t4_ui.ts:53`, panther `generic_editor_wrapper.tsx:28`; `advanceOn` is a `TourStep` field and `resolveVisibleTarget` is exported by `@njwse/roadtrip`) read as met in the code; the ready reads re-run on the status flip, About renders for a null `progress`, no family tab exists before the reads land, the usage target renders on About for every status. Floor green: `deno task typecheck`, `deno task test` (401 passed, 0 failed, 2 ignored), `./validate_protocols` (0 tier-1, 0 new tier-2, 16 baselined), the `./run` gate on `PORT=8010` (`"running":true` on the second poll, then stopped). The tree held an unrelated edit to `PLAN_EXPLORE_PAGE.md` at session start (the parallel plan's), left unstaged. |
| 2026-09-22 | 2 | Fix: About's ready branch is `ctx.modules` in module order grouped by family, each status from `progress.moduleStatus` (`about.tsx`); the `ran` filter and the registry-named `unknown` group are gone. The tab content is a `Switch` with an explicit `Match` for About (ready, under the reads' wrapper; not ready) and a keyed `Match` for the family (`package_page.tsx`). `view_files.tsx:17` names About's viewers; nothing else in that file changed. |
| 2026-09-22 | 2 | Step 2 fixed. Floor green: `deno task typecheck`, `deno task test` (401 passed), `./validate_protocols` (0 new flags), the `./run` gate on `PORT=8010`. |
