# PLAN: The Explore page picks its module from a select, not a side nav

Status: ruled 2026-09-29, not built. Waits on panther's `PLAN_SELECT_V2.md`
landing and syncing here.

Under a family tab, the Explore page holds the family's modules in a 16rem
left column, a `SelectList` per tier under the headings "Primary results" and
"Supporting analyses". HMIS has six modules; HFA and ICEH have one each, so
for two of three families the column holds a single row. This plan removes
the column and puts the module choice in a `SelectV2` on the view's top row,
left of the view select, so the row reads module then view and the table or
chart gets the width back. Nothing about what is selectable, stored or
resolved changes. Delete this file when the last review passes.

**Next step: Do 1**

Branch: `version2`. Repos: this app only. Precondition: the panther sync that
brings `panther/_303_components/form_inputs/select_v2.tsx` has been committed
here (§7). Read first: `CLAUDE.md`, `SYSTEMS.md`,
`SYSTEM_11_viz_authoring.md` ("The Explore page"),
`panther/protocols/PROTOCOL_UI_COMPONENTS.md`, then §2, §3, §4 and §8 here.

## 0. How to work this plan

Cadence, session shapes, the two-things rule and the step rules are
`panther/protocols/PROTOCOL_ALL_PLANS.md`; the app bindings are
`PROTOCOL_APP_PLANS.md`. This plan binds them as follows.

- Instruction: "Do the next step of PLAN_EXPLORE_MODULE_SELECT.md."
- Branch: `version2`, not the `tim-branch` the app protocol names. Confirm
  with `git branch --show-current`.
- Floor: `deno task typecheck`, `deno task test`, `./validate_protocols`,
  `./run`. No step touches a migration, the schema, the query engine or help
  text, so no conditional gate applies.
- Build log: §8. Last step: 1.
- A step reads, in order: `CLAUDE.md`, `SYSTEMS.md`,
  `SYSTEM_11_viz_authoring.md`, §2 and §3 here, its own section in §4, and
  §8.
- The Do 1 session first confirms the precondition file exists. If it does
  not, it stops and says so; it never edits `panther/`.

## 1. The problem

`FamilyExplorer` in `client/src/components/explore/explore.tsx` renders a
`FrameLeft` whose panel is a `ui-pad h-full w-64` column holding `ModuleNav`
(`client/src/components/explore/module_nav.tsx`), a `SelectList` per tier
with a heading above each. The chosen module's `ModuleView`
(`client/src/components/explore/module_view.tsx`) fills the rest.

Two things are wrong with the column.

- It is the same width whatever it holds. The module definitions in
  `wb-fastr-modules` give HMIS one primary and five secondary modules, and
  HFA and ICEH one primary module each. For HFA and ICEH the column shows one
  heading and one row.
- The width comes out of the data table and the timeseries, the two views
  that want it most.

`ModuleView` builds the view select (a `Select` in a `w-[32rem]` wrapper at
the default size) and hands it to `DataTable` and `Timeseries` as
`viewSelect`; each places it on its toolbar's first row. `DataTable`'s
`Toolbar` (`explore/data_table/toolbar.tsx`) puts the find field and the
Download button on that same row, right-aligned, and the query controls on a
second row. `Timeseries` puts the view select alone on its first row and the
query controls beneath. The other two branches of `ModuleView`, the
`Placeholder` for a module with no view and the `EmptyState` for a module
with no ready metric, render no toolbar. Today that is fine, because the
column beside them still offers every module. Once the column is gone, the
module select must be on screen in those branches too, or a module with no
view (five of the six HMIS modules) is a dead end.

## 2. The model

- **The selectors row.** One `ui-gap-sm flex items-center` row: the module
  select, then the view select when the module has a view. It is the first
  thing under the family tabs in every state of `ModuleView`: with a view,
  with the placeholder, and with the no-metric empty state.
- **The module select** is a `SelectV2` over the family's modules in module
  order (`compareModules`), grouped under the tier labels as header entries.
  Its value is the resolved module, the same resolution `FamilyExplorer`
  does today; its change handler is `setExploreModule(family, id)`. State
  in `t4_explore.ts` does not change.
- **The view select** is a `SelectV2` over the module's views, the same
  options and handler as today's `Select`.
- **Views own their toolbar.** `DataTable` and `Timeseries` keep placing the
  row they are given on their toolbar's first row, with find and Download to
  its right in the data table. The prop is renamed to say what it now holds.
- **The fallbacks gain a top row.** The placeholder and the empty state
  render inside a `FrameTop` whose panel is the selectors row, so the row sits
  where the views put it.

## 3. Rulings

1. `FrameLeft`, the `w-64` column and `module_nav.tsx` go. `modulesInFamily`
   moves into `explore.tsx`, its only caller. The `SelectList` import goes
   with the nav.
2. The module select is built in `FamilyExplorer`, which has the family's
   modules and the resolved module, and passed to `ModuleView` as
   `moduleSelect: JSX.Element`. `ModuleView` composes the selectors row from
   it and its own view select. _(proposed)_
3. Tier headers appear in the module select only when the family has modules
   in more than one tier. A header over a single item is noise. The tier
   labels (en "Primary results" / "Supporting analyses", fr "Résultats
   principaux" / "Analyses complémentaires", pt "Resultados principais" /
   "Análises complementares") move from `module_nav.tsx` to `explore.tsx`
   unchanged. _(proposed)_
4. Both selects are `size="sm"`, matching every other control on the toolbar
   rows, and each sits in a `w-72 max-w-full` wrapper with `fullWidth`. The
   `w-[32rem]` wrapper and the default-size view select go. _(proposed)_
5. The prop `viewSelect` on `DataTable`, `ReadyFamilyTable`, `Toolbar` and
   `Timeseries` is renamed `selectors`. Its placement does not change: first
   on the toolbar's top row. _(proposed)_
6. `ModuleView`'s `Placeholder` and no-metric `EmptyState` branches render
   inside `FrameTop` with the selectors row as `panelChildren` in a `ui-pad`
   wrapper, the same wrapper the views use, and their existing content as the
   frame's content. _(proposed)_
7. `viewsFor`, the view resolution, `exploreViews`, `exploreModules` and
   every fallback rule in `t4_explore.ts` are unchanged.
8. The package and area `Select`s in the heading bar stay native `Select`.
   Converting them is a separate decision (§6).
9. `SYSTEM_11_viz_authoring.md`, "The Explore page": the two paragraphs that
   describe `FrameLeft`, the module nav, the `SelectList` per tier and the
   view `Select` are rewritten to describe the selectors row, in the same
   step. The manifest does not change: `client/src/components/explore/**`
   already claims every file the step touches, and deleting `module_nav.tsx`
   removes a claimed file, which the lint accepts.

## 4. Steps

### Step 1: the selectors row replaces the column

**Surface.**

- `client/src/components/explore/explore.tsx`
- `client/src/components/explore/module_nav.tsx` (deleted)
- `client/src/components/explore/module_view.tsx`
- `client/src/components/explore/timeseries.tsx`
- `client/src/components/explore/data_table/data_table.tsx`
- `client/src/components/explore/data_table/toolbar.tsx`
- `SYSTEM_11_viz_authoring.md`
- this file (§8 and the Next step line only)

**Deliverable.**

- `explore.tsx`: `FamilyExplorer` renders `ModuleView` directly, no
  `FrameLeft`. It builds the module select per rulings 2, 3 and 4 from
  `modulesInFamily`, now local to this file, and passes it as `moduleSelect`.
  Header entries appear only for a family with more than one tier.
- `module_nav.tsx` is deleted and nothing imports it.
- `module_view.tsx`: `ModuleView` takes `moduleSelect`, builds the view
  select as a `SelectV2` per ruling 4, composes the selectors row, and passes
  it as `selectors` to `ViewBody`. The `Placeholder` and no-metric branches
  render per ruling 6, so the module select is on screen in every branch.
- `timeseries.tsx`, `data_table.tsx`, `toolbar.tsx`: the prop is `selectors`
  (ruling 5); its placement is unchanged.
- `SYSTEM_11_viz_authoring.md` describes the page as built (ruling 9).
- `t4_explore.ts` and `lib/` are untouched (ruling 7).

**Not in this step.** No change to the heading bar's selects (ruling 8). No
change to what `viewsFor` offers. No change to the query controls. No
deduplication of the tier labels with the wizard and the package family pane
(§6).

**Gates.** The floor. `deno task typecheck` proves the manifest and the
structure lint accept the deletion.

**Ends with.** One commit. After this step's review passes, the reviewer
deletes this file in the review commit.

## 5. Gates catalogue

| Gate                      | First reached |
| ------------------------- | ------------- |
| `deno task typecheck`     | Step 1        |
| `deno task test`          | Step 1        |
| `./validate_protocols`    | Step 1        |
| `./run`                   | Step 1        |

## 6. Out of scope

- The package and area selects in the heading bar, and every other native
  `Select` in the app. Whether `SelectV2` replaces them is a separate plan.
- One shared tier-label function. The same three `t3` blocks live in
  `module_nav.tsx` (moving to `explore.tsx`),
  `results_packages/wizard/step_2_modules.tsx` and
  `results_packages/package_view/family_pane.tsx`; this plan neither adds a
  copy nor removes one.
- Views for modules other than the HMIS primary module. `viewsFor` is
  unchanged.
- Hiding the module select when a family has one module. The row keeps the
  same shape across families.

## 7. Rollout and rollback

- Precondition, outside this plan's steps: Tim commits any work in this tree,
  then runs `./sync wb-fastr-v2` from the panther repo after panther's
  `PLAN_SELECT_V2.md` has closed. The sync commit is what the Do 1 session
  checks for.
- Nothing ships from the step. `./deploy_testing` is Tim's call after the
  review passes.
- Rollback: revert the step's commit. The sync commit stays; `SelectV2` is
  additive and unused elsewhere.

## 8. Build log

| Date | Step | Row |
| ---- | ---- | --- |
