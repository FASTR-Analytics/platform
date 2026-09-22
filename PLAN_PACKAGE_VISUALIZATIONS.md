# PLAN: Package visualizations

Let a user see every default visualization in a results package. Clicking
a package in the Results packages tab opens that package's own page. On a
ready package the page renders all of its default visualizations at a
chosen scope, and each one has an Edit that opens the figure editor with
nothing behind it: the user can change the visualization on the page and
nothing is saved anywhere.

**Next step: Review 3.** Each session sets this line in its final commit.

Branch: `version2`. Repos touched: this app only.
Read first: `CLAUDE.md`, `SYSTEMS.md`, `SYSTEM_08_results_packages.md`,
`SYSTEM_11_viz_authoring.md`, then §2 and §3 here.

---

## 0. How to work this plan

Cadence, session shapes, the two-things rule and the step rules are
`panther/protocols/PROTOCOL_ALL_PLANS.md`; the app bindings are
`PROTOCOL_APP_PLANS.md`. This plan binds them as follows.

- Instruction: "Do the next step of PLAN_PACKAGE_VISUALIZATIONS.md."
- Branch: `version2` (this plan's ruling; `PROTOCOL_APP_PLANS.md` names
  `tim-branch`, and the version 2 work is on `version2`).
- Floor: `deno task typecheck`, `deno task test`, `./validate_protocols`,
  `./run`. No step touches a migration, the seed, the query engine or
  help text, so no conditional gate applies.
- Build log: §8. Last step: 3.
- A step reads, in order: `CLAUDE.md`, `SYSTEMS.md`, the SYSTEM file for
  each area the step names, §2 and §3 here, the step's own section in §4,
  and §8.

Rule peculiar to this plan:

- **Two files are shared with PLAN_EXPLORE_PRIMARY_RESULTS step 4.** Both
  plans move `products/_shared/scope_picker.tsx` and lift the preset
  fetch-and-build helper out of `insert_figure/preset_preview.tsx` into
  `components/_shared/`. Whichever step runs first does the moves; the
  later step finds them done, records that in its build log, and does
  the rest of its work. Neither plan waits for the other.

## 1. The problem

- A results package's visualizations cannot be seen without a product.
  The package's default visualizations exist as data
  (`RunAuthoringContext.presets`, derived per run in
  [virtual_defaults.ts](server/run_query/virtual_defaults.ts) from every
  preset flagged `createDefaultVisualizationOnInstall`) and are rendered
  only inside the insert-figure wizard, one metric at a time, from within
  a slide deck or report editor.
- The package detail is a pane beside a sidebar
  ([results_packages.tsx:195](client/src/components/results_packages/results_packages.tsx#L195)),
  sized for module cards and settings, not for a gallery of figures.
- The figure editor already runs without a save target:
  [visualization_editor.tsx:60](client/src/components/_shared/figure_editor/visualization_editor.tsx#L60)
  takes a scope, a metric, a config snapshot and the authoring context and
  returns the edited config or nothing. Only the two product editors open
  it, and both store the result.

## 2. The model

Vocabulary, used throughout:

- **Package page**: one results package, opened full page from the
  Results packages list through the shell wrapper. It replaces the detail
  pane and renders every status: generating, failed and ready.
- **Default visualization**: one entry of the package's
  `RunAuthoringContext.presets`: a metric id, a label and a config.
- **Page scope**: the `(package, admin area 2)` pair the page renders
  under. The package is the page's; the admin area starts national and is
  chosen on the page.
- **Working config**: the config a visualization renders with on the
  page. It starts as the default's config and becomes whatever the editor
  returned. It lives in the page's state and dies with the page.

The Results packages tab becomes the list. The package page:

```
← Back   <label>  [pinned]  [ready]      Pin · Delete · In use by …
provenance line

Visualizations                          Scope: [National ▾]
┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│  figure      │ │  figure      │ │  figure      │   one card per
│              │ │              │ │              │   default visualization,
│ label        │ │ label        │ │ label        │   in catalog order
│ Edit · Reset │ │ Edit         │ │ Edit         │
└──────────────┘ └──────────────┘ └──────────────┘

Modules                                   (what the pane shows today:
  settings · Script · Logs · files)
```

Edit opens the figure editor over the page with the card's metric, its
working config and the page scope, and no collab binding. Apply replaces
the working config and the card re-renders; Cancel changes nothing. Reset
appears on an edited card and restores the default's config. Changing the
scope re-renders every card under the new pair; working configs are kept.

## 3. Rulings

1. **The package detail is a page.** This overrules SYSTEM_08's
   master-detail ruling for the catalogue. The list is a plain
   newest-first list with no selection state; the selection-pinning
   effect and the `?? newest` fallback are deleted with the pane.
2. **The page renders every status.** The generating and failed branches
   (progress chips, live R line, `FailedErrorDetail`, per-started-module
   viewers) move from the pane to the page unchanged. The live progress
   and R-line listeners stay in `results_packages.tsx`, which remains
   mounted under the shell wrapper; the page reads them through accessor
   props.
3. **A ready package is still `ResultsPackageView`**, rendered once and
   hosted by the page through the same `headerActions` and `headerNote`
   slots. The visualizations section is a new slot the view renders
   above the module cards, so it appears wherever a ready package is
   explored.
4. **The gallery is `RunAuthoringContext.presets`, in order, no filter.**
   A default whose metric is stamped unavailable renders its card with
   the stamped reason instead of a figure and no Edit.
5. **The page scope starts national and is page state.** Never stored.
   One `ScopePicker`, moved to `components/_shared/`.
6. **Working configs are page state.** No storage, no route, no cache
   key: the page holds a map from default id to config. Edits survive a
   scope change and die when the page closes.
7. **Edit opens the existing editor with no collab binding.** No editor
   change. The page creates its own editor wrapper
   (`getEditorWrapper()`, as the slide editor does), because the page is
   itself inside the shell wrapper and the editor and the script, logs
   and files viewers open one level deeper.
8. **Rendering goes through the one shared helper.** The fetch-and-build
   function in `preset_preview.tsx` moves to
   `components/_shared/figure_preview.ts` and the wizard's preview
   imports it from there. A card reads its rows through the scope-keyed
   `t2_figure_data` cache, so a default seen here and later inserted in a
   product under the same pair is one cache entry.
9. **No write of any kind.** No add-to-deck, no download, no persisted
   edit. "Add to slide deck" is a later plan and plugs into the working
   config.
10. **Reads stay run-keyed and approved-user.** The authoring context and
    the figure items come through the existing instance routes (D7). No
    new route.

## 4. Steps

### Step 1: The package page

**Surface.** `client/src/components/results_packages/results_packages.tsx`,
`client/src/components/results_packages/detail.tsx` (renamed to
`package_page.tsx`), `client/src/components/results_packages/mod.ts`,
`client/src/components/results_packages/package_view/package_view.tsx`
(only if a slot signature changes), `SYSTEM_08_results_packages.md`.

**Deliverable.** The Results packages tab is a full-width newest-first
list; clicking a row opens the package page through `openShellEditor`
with the run id (R1). The page renders the generating, failed and ready
branches the pane rendered, reading the row from
`instanceState.runsCatalog` and progress and R lines through accessor
props (R2); a package deleted while its page is open closes the page. The
page owns an editor wrapper and passes its `openEditor` to
`ResultsPackageView` (R7). Pin, unpin, delete and "in use by" behave as
before. SYSTEM_08's catalogue paragraph describes the list and the page
and no longer describes a selection.

**Not in this step.** Visualizations. Any figure.

**Gates.** Floor. `lint:structure` green over the rename.

**Ends with.** One commit.

### Step 2: The visualizations section

**Surface.** `client/src/components/_shared/scope_picker.tsx` (moved from
`products/_shared/`, importers in `products/**` repointed),
`client/src/components/_shared/figure_preview.ts` (lifted from
`products/_shared/insert_figure/preset_preview.tsx`, which imports it),
`client/src/components/_shared/mod.ts`,
`client/src/components/products/_shared/mod.ts`,
`client/src/components/results_packages/package_view/package_view.tsx`,
`client/src/components/results_packages/package_view/visualizations.tsx`
(new), `client/src/components/results_packages/package_view/mod.ts`,
`SYSTEM_08_results_packages.md` (the scope picker path in the AA2
ruling, and the section), `SYSTEM_11_viz_authoring.md` (claims
`_shared/figure_preview.ts`), `SYSTEM_12_documents_sharing.md` (claims
`_shared/scope_picker.tsx` explicitly, since its `products/_shared/*.tsx`
glob no longer covers it).

**Deliverable.** A ready package's page shows a Visualizations section
above the module cards: a scope picker starting national (R5) and one
card per default visualization in catalog order (R4), each rendered
through the shared helper under the page scope (R8), labelled with the
default's label and its metric's label. An unavailable metric's card
shows the stamped reason. The two moved files are moved, their
importers repointed, and their manifests edited. If PLAN_EXPLORE_
PRIMARY_RESULTS step 4 has already moved them, this step records that in
§8 and touches neither.

**Not in this step.** Edit. Reset.

**Gates.** Floor. `git diff -M --name-status <c>^ <c>` lists the two
moved files as `R…` when this step performs the moves.

**Ends with.** Two commits, each green: the moves; the section.

### Step 3: Edit without saving

**Surface.** `client/src/components/results_packages/package_view/visualizations.tsx`,
`client/src/components/results_packages/package_page.tsx` (the working
config map, if it is not local to the section), `SYSTEM_08_results_packages.md`,
`SYSTEM_11_viz_authoring.md` (the editor's hosts now number three).

**Deliverable.** Every card with an available metric has Edit, which
opens `VisualizationEditor` through the page's wrapper with the card's
metric, its working config, the page scope and the package's authoring
context, and no collab binding (R7). Apply replaces the working config
and the card re-renders; Cancel leaves it. An edited card shows Reset,
which restores the default's config. Working configs survive a scope
change and are gone when the page closes (R6). Nothing is stored (R9).
SYSTEM_08 states the section's contract in one paragraph; SYSTEM_11
lists the package page as the third host of the editor.

**Not in this step.** Anything that stores or exports a config.

**Gates.** Floor.

**Ends with.** One commit. The review that passes deletes this file in
its commit.

## 5. Gates catalogue

| Gate | What it proves | Command | First reached |
| --- | --- | --- | --- |
| G1 | The floor | §0 | 1 |
| G2 | Moves are moves | `git diff -M --name-status <c>^ <c>` lists `R…` for each moved file | 2 |

## 6. Out of scope

- Adding a visualization from the page to a slide deck or report, and
  downloading one. A later plan; it builds on the working config (R9).
- Persisting an edit anywhere.
- The Explore tab. It shows primary results only and is
  PLAN_EXPLORE_PRIMARY_RESULTS; this plan shares two moved files with it
  and nothing else.
- Any change to what a default visualization is or to which presets are
  flagged as defaults.
- Rendering a gallery for a generating or failed package.
- A copilot on the package page.

## 7. Rollout and rollback

- Nothing ships before step 3's review passes; `./deploy_testing` may run
  at Tim's discretion after any review passes. Every step leaves
  `version2` deployable.
- Rollback is a revert: no schema, cache key or stored shape changes.

## 8. Build log

| Date | Step | Entry |
| --- | --- | --- |
| 2026-09-22 | 1 | Session start: the tree carried an uncommitted edit to `PLAN_EXPLORE_PRIMARY_RESULTS.md` from another workstream. Left untouched; only this step's files were staged. |
| 2026-09-22 | 1 | The page's `HeadingBar` reads "Results package"; the label, badges and housekeeping stay on the view's own header row (R3 keeps `ResultsPackageView` unchanged), so the label is not shown twice. §2's sketch puts the label on the Back line. |
| 2026-09-22 | 1 | The wizard opens the launched run's page before its catalogue row lands (the pane used to pre-select it). The page shows a loading indicator until the row appears and closes only once a row it has shown is removed, so a fresh launch does not close itself. |
| 2026-09-22 | 1 | The onboarding catalogue tour targets `instance-results-packages-card` and `-usage`, which lived in the pane. Both attributes moved with the body onto the page; `client/src/onboarding/**` is outside the Surface and was not edited, so that tour now starts the first time a package page is opened. Its copy still describes the catalogue. |
| 2026-09-22 | 1 | Floor `./run`: it stops and recreates the machine-global `pg` and `valkey-local` containers. Both were already up and mounted on this checkout's `_example_instance_dir`, so the server was booted directly against them (`deno run --allow-all --env-file --unstable-broadcast-channel main.ts`, `/health_check` polled) instead of replacing them. |
| 2026-09-22 | 1 | Step 1 built. |
| 2026-09-22 | 1 | Review finding, no code change in this step: `client/src/onboarding/catalogue.ts:565` launches the catalogue tour from the help menu with `navigate: openTabOnly("results_packages")`, and `client/src/onboarding/index.ts:123` auto-starts it whenever the `instance-results-packages-card` attribute is on screen. Both targets now live on the package page (`package_page.tsx:254`, `:264`, `:281`), so the help-menu launch lands on the list where neither target exists, and the auto-start fires on the first opened page. `client/src/onboarding/**` is outside the Surface; the fix belongs to a step that owns the onboarding files or to SYSTEM_08 Open items. |
| 2026-09-22 | 1 | Step 1 reviewed: 1 finding. |
| 2026-09-22 | 2 | PLAN_EXPLORE_PRIMARY_RESULTS had not moved the two shared files (its Next step was still `Do 1`), so this step performed both moves. That plan's build log is not this plan's to edit; its step finds them done. |
| 2026-09-22 | 2 | One commit, not two. `lint:structure`'s `shared-consumers` check requires two consuming areas for every file under `components/_shared/`; a moves-only commit leaves `scope_picker.tsx` and `figure_preview.ts` with one consumer (`products/`), so the moves and the section that gives them their second consumer land together. G2 is checked on that commit. |
| 2026-09-22 | 2 | `figure_preview.ts` exports `createFigurePreview` beside `fetchFigureInputs`: the version-guarded fetch effect was about to be duplicated between `preset_preview.tsx` and the card, so it is the shared primitive and both render through it (CLAUDE.md "extract duplicated logic"). |
| 2026-09-22 | 2 | Page scope with a single-area selection that has no area chosen yet (the picker's interim state): the cards keep rendering under the last complete pair rather than blanking. Not covered by R5. |
| 2026-09-22 | 2 | `SYSTEM_10_figure_render_export.md` line 196 names `insert_figure/preset_preview.tsx` as a live-draft render site. Still true (it renders through the lifted helper); the file is outside this step's Surface and was not edited. |
| 2026-09-22 | 2 | G2 on this step's commit: `scope_picker.tsx` lists as `R100`. `figure_preview.ts` lists as `A`, and cannot list as `R`: it is a function lifted out of `preset_preview.tsx`, which remains, so there is no file rename for git to detect. The gate's wording assumed two file moves; the code is as §4 step 2 describes. |
| 2026-09-22 | 2 | Step 2 built. |
| 2026-09-22 | 2 | Step 2 reviewed: pass. |
| 2026-09-22 | 3 | Outside the step's Surface: `package_view/package_view.tsx`, one line, passing the view's `openEditor` prop through to `PackageVisualizations`. R7 requires Edit to open through the page's wrapper, which only reaches the section through the view; step 2 did not pass it because the section had no use for it then, and an unused prop is cruft (CLAUDE.md). |
| 2026-09-22 | 3 | The working config map is local to the section (`visualizations.tsx`), a plain signal of default id to config replaced immutably on Apply and Reset; `package_page.tsx` is untouched. Edits survive a scope change because the scope is a sibling signal, and die with the page because the section unmounts with it (R6). |
| 2026-09-22 | 3 | The editor receives the page scope as a snapshot at open time. The page's picker is covered while the editor is open, so the scope cannot change mid-edit; the product hosts' live-scope contract (SYSTEM_11) does not apply here and SYSTEM_11 says so. |
| 2026-09-22 | 3 | Step 3 built. |
