# PLAN: Explore page

Rethink the Explore page for a first-time user. Today the page opens on a
settings block, lists indicators in a rail that leads nowhere for HMIS,
renders one frozen table that cannot be disaggregated, and shows "no
further visualizations" under every indicator. This plan first considers
how the page should work, puts the options and a recommendation in front of
Tim in chat, records what he decides there, and only then builds it.

**Next step: Do 1.** Each session sets this line in its final commit.

**Starts:** now, in parallel with PLAN_PACKAGE_PAGE, which is already
running. That plan's surface is `client/src/components/results_packages/**`,
`client/src/onboarding/**`, `SYSTEM_08_results_packages.md` and the tour
paragraph of `SYSTEM_14_client_shell.md`; its sessions also edit the
package-page paragraphs of `SYSTEM_11_viz_authoring.md`. This plan never
touches any of those files except SYSTEM_11 and SYSTEM_14, where it edits
only the Explore paragraphs. Its own surface is
`client/src/components/explore/**`, the modules repo, panther, the Explore
section of `SYSTEM_11_viz_authoring.md` and the one Explore line of
`SYSTEM_14_client_shell.md`. `client/src/components/_shared/scope_picker.tsx`
is shared by both pages and is out of bounds for this plan while the other
is open (§0).

Branch: `version2`. Repos touched: this app; possibly
`/Users/timroberton/projects/apps/wb-fastr-modules` and
`/Users/timroberton/projects/panther/timroberton-panther`, depending on
the rulings step 1 produces.
Read first: `CLAUDE.md`, `SYSTEMS.md`, `SYSTEM_11_viz_authoring.md` ("The
Explore page", "The insert-figure wizard", "lib config semantics",
"Replicant machinery"), SYSTEM_08 "Three presentation facts", then §2 and
§3 here.

---

## 0. How to work this plan

Cadence, session shapes, the two-things rule and the step rules are
`panther/protocols/PROTOCOL_ALL_PLANS.md`; the app bindings are
`PROTOCOL_APP_PLANS.md`. This plan binds them as follows.

- Instruction: "Do the next step of PLAN_EXPLORE_PAGE.md."
- Branch: `version2` (this plan's ruling; `PROTOCOL_APP_PLANS.md` names
  `tim-branch`, and the version 2 work is on `version2`).
- Floor: `deno task typecheck`, `deno task test`, `./validate_protocols`,
  `./run`. No step touches a migration, the seed, the query engine or
  help text, so no conditional gate applies.
- Build log: §8. Last step: 4. Step 1 has no review (§4).
- A step reads, in order: `CLAUDE.md`, `SYSTEMS.md`, the SYSTEM file for
  each area the step names, §2 and §3 here, the step's own section in §4,
  and §8.

Rules peculiar to this plan:

- **Step 1 decides nothing on its own, and Tim writes nothing.** The
  session weighs the options in §2 against the code, then puts each
  question to Tim in chat with its recommendation first and waits for his
  answer. It records each answer as a ruling in §3, in Tim's words, with
  the build-log row that says what was asked and what he said. This is the
  one exception to the two-things rule: step 1 is the only session that
  writes §3, and it writes only what Tim said in chat. No session builds
  on a question §3 leaves open; a later session that finds one asks in
  chat the same way and records the answer the same way.
- **Parallel with PLAN_PACKAGE_PAGE.** A session of this plan never edits
  `client/src/components/results_packages/**`, `client/src/onboarding/**`,
  `SYSTEM_08_results_packages.md`, or `client/src/components/_shared/scope_picker.tsx`
  (that plan's module pane renders the picker, so its shape is frozen
  until that plan closes; a compact area control for Explore lives under
  `explore/` for now, and folding it into the shared picker is a one-line
  follow-up once the other plan is gone). A typecheck error in those files
  is reported, not fixed.
- **A dirty tree is tolerated when every dirty path is in the other
  plan's surface.** The protocol's "stop on a dirty tree" rule assumes
  serial plans; here two run at once. A session of this plan stages only
  its own files and never runs `git add -A`, `git stash` or a wholesale
  sync while the tree is dirty.
- **The two shared docs are edited only while clean.** SYSTEM_11 and
  SYSTEM_14 are in both plans' surfaces. A session of this plan edits
  either only when `git status` shows it unmodified, edits only its Explore
  paragraphs, and commits that edit at once, so an uncommitted edit by the
  other plan's session can never be overwritten.
- **The modules repo lands first, on `main`, if a ruling needs it.** A
  new preset is ordinary definition content under the schema every
  deployed app accepts, so the push is safe for every instance (§7).
- **`panther/` is never edited here.** A grid change is made in the
  panther repo, confirmed with its gates, and synced as one app commit
  holding only `panther/**`, made only on a clean tree (the sync refuses
  otherwise), with the plan-log edit as a separate commit.
- **The `./run` gate.** A dev server usually holds port 8000; boot on
  another port (`PORT=8001 deno run --allow-all --env-file
  --unstable-broadcast-channel main.ts`), read the boot log's manifest
  line, stop it. A step that changes no server file cites the last boot.

## 1. The problem

Read the page as a first-time user, top to bottom
([explore.tsx](client/src/components/explore/explore.tsx),
[family_view.tsx](client/src/components/explore/family_view.tsx)):

- The first thing on the page is a settings block: a package `Select`, then
  the shared `ScopePicker` with its radio group, its area `Select` and its
  explanatory paragraph
  ([scope_picker.tsx:31](client/src/components/_shared/scope_picker.tsx#L31)).
  That component was written for a product's settings form. Here it is the
  largest thing above the results and answers a question the user has not
  asked.
- Below the family tabs a 16rem rail lists every indicator of the family
  ([family_view.tsx:178](client/src/components/explore/family_view.tsx#L178)).
  Its labels overflow: panther's `SelectList` item does not truncate, and
  the rail is a fixed `w-64`. Selecting an indicator changes nothing the
  user can see for HMIS, because the detail renders "every other preset of
  the scorecard metric"
  ([indicator_detail.tsx:34](client/src/components/explore/indicator_detail.tsx#L34))
  and `m12-01-01` declares exactly one preset
  ([m12-01-01.ts:6](../wb-fastr-modules/m012/_metrics/m12-01-01.ts#L6)),
  so every HMIS indicator reads "This metric has no further
  visualizations for one indicator".
- The scorecard's layout is frozen: rows and columns are the preset's own
  (`admin_area_2` by `indicator_common_id` for HMIS) and the only control
  is the period
  ([family_view.tsx:139](client/src/components/explore/family_view.tsx#L139)).
  There is no way to put months across the columns, look inside one
  district, or see one indicator by area. The engine underneath can do all
  of that: a table config's `disaggregateBy` places any of the metric's
  dimensions on a row, column, column-group or replicant slot, and
  `getFetchConfigFromPresentationObjectConfig` turns it into the query
  ([get_fetch_config_from_po.ts:36](lib/get_fetch_config_from_po.ts#L36));
  the figure editor's data panel already exposes every one of those choices
  ([disaggregation_section.tsx](client/src/components/_shared/figure_editor/editor_panel_data/disaggregation_section.tsx)).
- Nothing on the page leads to that editor. The package page opens a
  default visualization as a viewer
  ([visualizations.tsx:55](client/src/components/results_packages/package_view/visualizations.tsx#L55));
  Explore, the page for looking at results, does not.
- Long indicator labels make the grid's columns very wide, because
  `DataGrid` renders header labels `whitespace-nowrap`
  ([data_grid.tsx:154](panther/_303_components/tables/data_grid/data_grid.tsx#L154)).

## 2. The questions, and the options step 1 weighs

Vocabulary from the closed PLAN_EXPLORE_PRIMARY_RESULTS keeps its meaning
(family, tier, scorecard metric, scorecard query, indicator dimension,
Explore selection; see SYSTEM_11 "The Explore page"). Nothing below is
decided. Each question lists the options step 1 must weigh, with the cost
each carries as far as it is known now; step 1 may add options. A lean is
marked where the author has one, and a lean is not a ruling.

**Q1. Where do the package and the scope go?**

- (a) A context bar on the heading row: a compact package `Select` and an
  area `Select` whose first option is National. Nothing between the
  heading and the family tabs. Cost: an Explore-local area control (the
  shared picker is frozen, §0), which repeats the shared picker's
  `listAdminArea2s` query and its orphaned-area rule.
- (b) A one-line summary, "Showing Q3 2026 at national level", with a
  Change button that opens the full shared picker in a modal. Cost: one
  more click to change scope; keeps the shared picker as the one scope UI.
- (c) Keep the block, collapse it under a disclosure that opens on demand.
  Cost: the page still opens on a control the user has not asked for.
- Lean: (a).

**Q2. What orients a first-time user?**

- (a) Section headings taken from what is shown: the scorecard preset's
  own caption ("Health Sector Scorecard"), the indicator's label over the
  detail, each detail card captioned by its preset. Cost: none beyond
  reading `t.caption`.
- (b) Family tab sub-labels saying what each family is ("routine service
  data", "facility survey", "household survey"). Cost: wording in three
  languages; the Data page's tabs do not do this, and the two should
  agree.
- (c) A short introduction line under the tabs, present until the user
  interacts. Cost: a dismissal state, and text that ages.
- Lean: (a), and (b) only if the Data page adopts the same sub-labels.

**Q3. How does the user disaggregate the scorecard?**

- (a) Pivot controls over the HTML grid: Rows and Columns `Select`s over
  the metric's axis dimensions (every `disaggregationOptions` entry that
  is not filter-only; for HMIS the admin levels, the period grains as
  Months, Quarters, Years, and the indicator), a pinned dimension (a
  required dimension left off both axes becomes the replicant slot with
  `ReplicateByOptionsSelect`), and the period control. The grid re-pivots
  by the effective config the items read returns, so a collapsed
  dimension still renders. Cost: a new control surface that must respect
  required dimensions, `getDisaggregationAllowedPresentationOptions`, the
  `filtered_to_one_value` collapse, and colouring per layout (indicator on
  an axis: per-value rule; indicator pinned: that indicator's rule; HFA's
  fixed rule; ICEH none). Roughly a second `disaggregation_section.tsx`,
  restricted to tables.
- (b) Give up the HTML grid and embed the figure editor's table
  (`VisualizationEditor`, `viewOnly`, inline in the page): its full data
  panel for free, the canvas table renderer, no new control code. Cost:
  loses sortable columns, the hover value and row click, and the editor
  chrome is heavy for the first thing on the page.
- (c) The grid with a small control set (an admin-level switch and the
  period) plus an "Open in editor" button that opens the viewer with the
  current config for everything else. Cost: two places to look; the grid
  stays a lookup table and the editor does the rest.
- (d) (a) plus the "Open in editor" button of (c).
- Lean: (d) if (a)'s control surface is contained; (c) if step 1 finds
  (a) would duplicate too much of the editor's data panel.

**Q4. How is an indicator selected?**

- (a) No rail. A `SelectSearch` over the family catalog heads the detail,
  defaulting to the first indicator so the detail is never blank; a click
  on a scorecard cell, or on a row when rows are indicators, also selects.
- (b) Keep the rail, fixed: truncation with `title`, a min width, no
  fixed height. Cost: the rail still competes with the scorecard for width
  and still means nothing for HMIS until Q5 gives the detail content.
- (c) The scorecard is the only selector: click a cell or a column
  header; the detail shows the last click. Cost: no way to reach an
  indicator that is not in the current view (a filtered scorecard).
- Lean: (a).

**Q5. What does the detail show for one indicator?**

- (a) Presets, declared in the modules repo on the primary metrics: for
  `m12-01-01` a trend (timeseries, monthly), by-area (bars by
  `admin_area_2`) and a map; for `m10-01-01` by-time-point and by-area;
  m009 already has an equiplot and a trend. None set
  `createDefaultVisualizationOnInstall`. The page's existing "every other
  preset, pinned to the indicator and the period" rule then works
  unchanged, and the insert-figure picker gains the same presets. Cost: a
  modules-repo commit on `main`; the module author owns what "the views of
  one indicator" are.
- (b) Views defined in the app: `explore/detail_views.ts` builds the same
  configs per family from the scorecard metric. Cost: the app owns view
  semantics that may drift from the module's; nothing else benefits.
- (c) No detail section: clicking a cell opens the viewer on that
  indicator directly (a chart preset or the scorecard filtered to it).
  Cost: the page is a table plus a door.
- (d) (a) for the presets and, under a single-area scope, a rewrite of
  `admin_area_2` to `admin_area_3` in a detail preset's disaggregation so
  "by area" means the districts inside the chosen area.
- Lean: (a) with (d).

**Q6. Under a single-area scope, what are the scorecard's rows?**

- (a) The preset's rows as written (`admin_area_2`), which collapses to one
  row. (b) Step down one admin level when the metric offers it, as a
  default the user can change under Q3(a). Lean: (b) if Q3(a) or (d),
  else (a).

**Q7. The period control.** (a) A `ButtonGroup` as today; (b) a `Select`,
since HFA's time points and ICEH's years can be many. Lean: (b).

**Q8. The grid's headers.** Column headers wrap to a bounded number of
lines within a maximum width, with the full label as `title`; the row
header column has a maximum width, truncates, and carries a `title`. A
panther change. Lean: do it; it is small and every option above needs it.

**Q9. Anything else step 1 finds.** The assessing session records any
further option or objection it finds by reading the code, including the
first-time user's path through an empty instance (no ready package) and a
package with one family.

## 3. Rulings

Pending. Standing contracts that are not up for decision, because other
prose already fixes them:

1. **Reads are unchanged.** Every read goes through
   `t2_run_authoring_context`, `t2_figure_data` and
   `t2_replicant_options`, under the run-keyed instance routes (SYSTEM_11).
   A layout change is a different cache entry, never an invalidation.
2. **Nothing is written.** No insert into a product, no download, no
   copilot, no persisted layout, period, indicator, package or scope.
   `exploreFamily` stays the one persisted preference (SYSTEM_14). A viewer
   opened from the page is `viewOnly`, closes returning nothing, and stores
   nothing (SYSTEM_08's package-page contract).
3. **The page never grows its own copy of the figure editor.** Controls it
   offers are reading controls; everything else opens the editor as a
   viewer or is out of scope.
4. **The three primary metrics keep their meaning.** No change to what
   they compute or to HFA and ICEH thresholds.

Step 1 records Tim's chat decisions on Q1 to Q9 here, numbered from 5,
before setting the line to `Do 2`.

## 4. Steps

### Step 1: Consider the options

**Surface.** No code. The build log of this file only.

**Deliverable.** For each question in §2, a build-log row that says which
option the session recommends, why, and what it found in the code that
bears on it: at least, whether Q3(a)'s control set can be built from the
lib helpers the editor's data panel uses without duplicating that panel;
what `SelectSearch` and `SelectList` can and cannot render for Q4; what a
preset for Q5(a) must declare and whether the app's `filteredToIndicator`
pins it correctly; what the single-area scope does to each preset for Q6;
and what the DataGrid change of Q8 costs. Where a question has a cheaper
answer than any listed option, the row says so. The session then asks Tim
in chat, one question at a time, recommendation first, and waits. When
every question has an answer, §3 holds the rulings in Tim's words.

**Not in this step.** Any edit outside §3 and the build log. Any prototype
in the tree. Deciding a question Tim has not answered.

**Gates.** None beyond the reading. There is no Review 1: the rulings are
Tim's own words, and the next Do session reads them.

**Ends with.** One commit holding the assessment rows, the decision rows,
§3 filled, and the line set to `Do 2`. If the chat ends before every
question is answered, the commit holds what was decided and the line stays
`Do 1`, with a row naming the open questions.

### Step 2: What the rulings need outside this app

**Surface.** In `wb-fastr-modules`, if Q5 rules (a): `m012/_metrics/m12-01-01.ts`,
`m010/_metrics/m10-01-01.ts`, their rebuilt `definition.json`, and a
harness in this app's `server/tests/` that derives every preset of every
registry module through `deriveConfigFromVizPreset` and asserts
`getFetchConfigFromPresentationObjectConfig` resolves it (claimed in
SYSTEM_08's globs only through the existing `server/tests/*` patterns;
SYSTEM_08 prose is not edited). In `timroberton-panther`, if Q8 rules
yes: `modules/_303_components/tables/data_grid/data_grid.tsx`, and here
the synced `panther/**` only.

**Deliverable.** The presets and the grid change the rulings name, each
with its gates green; the modules repo commit pushed to `main`; the sync
commit holding only `panther/**`.

**Not in this step.** Any page file.

**Gates.** Modules repo: `deno task typecheck`, `deno task build` twice
(the second leaves the tree clean),
`deno run --allow-read --allow-net .validation/validate_definitions.ts`;
here, the harness under `deno task test` with `FASTR_MODULES_LOCAL_DIR`.
Panther: its `./sync` gates; here, G7. Floor.

**Ends with.** One commit per repo touched, plus the plan-log commit here.
Skipped entirely, with a build-log row saying so, if no ruling needs it.

### Step 3: The page a first-time user sees

**Surface.** `client/src/components/explore/explore.tsx`,
`client/src/components/explore/family_view.tsx`,
`client/src/components/explore/indicator_detail.tsx`,
`client/src/components/explore/scorecard.tsx`,
`client/src/components/explore/explore_query.ts`, new files under
`client/src/components/explore/` as the rulings need (an area control for
Q1(a), for instance), `SYSTEM_11_viz_authoring.md`, and the Explore line
of `SYSTEM_14_client_shell.md` under "Routing & page maps".

**Deliverable.** Q1, Q2, Q4, Q5, Q6 (its second half) and Q7 as ruled:
the context, the orientation, the indicator selection, the detail content
and the period control. Empty states as before, plus any Q9 finding Tim
rules on. SYSTEM_11's "The Explore page" reads as the page now is.

**Not in this step.** Q3 and the viewer.

**Gates.** Floor. `lint:structure` green (chained into the typecheck).

**Ends with.** One or two commits, each green, as the rulings' size
warrants.

### Step 4: Disaggregation and the viewer

**Surface.** `client/src/components/explore/scorecard.tsx`,
`client/src/components/explore/family_view.tsx`,
`client/src/components/explore/indicator_detail.tsx`,
`client/src/components/explore/explore_query.ts`, new files under
`client/src/components/explore/` as the ruling needs (`layout_controls.tsx`
for Q3(a) or (d)), `SYSTEM_11_viz_authoring.md`.

**Deliverable.** Q3 and Q6 (its first half) as ruled: the layout controls
and the pinned dimension, or the small control set, and the "Open in
editor" viewer on the scorecard and on each detail figure through
`openShellEditor` with `VisualizationEditor` in `viewOnly`, if ruled.
SYSTEM_11 describes the controls and the viewer and restates what the page
still never does (§3.2).

**Not in this step.** Anything ruled out in §3.

**Gates.** Floor.

**Ends with.** Two commits, each green: the controls; then the viewer and
the docs. The review that passes deletes this file in its commit.

## 5. Gates catalogue

| Gate | What it proves | Command | First reached |
| --- | --- | --- | --- |
| G1 | The floor | §0 | 2 |
| G2 | Definitions build, validate and are current | in `wb-fastr-modules`: `deno task typecheck`, `deno task build` twice, `deno run --allow-read --allow-net .validation/validate_definitions.ts` | 2 |
| G3 | Every preset of every registry module derives to a config the app can query | the step 2 harness, under `deno task test` with `FASTR_MODULES_LOCAL_DIR` | 2 |
| G7 | Panther typechecks and the sync is isolated | `deno task typecheck` in panther; `git diff --stat <c>^ <c>` of the sync commit lists only `panther/**` | 2 |

## 6. Out of scope

- Insert into a product, download, a copilot mount, a cross-family
  indicator search: the "Explore actions" follow-on the closed plan named.
- Persisting anything beyond `exploreFamily`.
- A merged cross-family values table.
- Editing thresholds or any conditional-formatting control on the page.
- Any file in PLAN_PACKAGE_PAGE's surface, and `_shared/scope_picker.tsx`
  while that plan is open.
- Changing what the three primary metrics compute.

## 7. Rollout and rollback

- If step 2 pushes presets, they go to the modules repo `main` at once.
  Safe for every deployed instance: a preset is ordinary definition
  content under the schema every app version accepts; the old app lists
  the new presets in its picker and nothing else changes.
- Nothing ships from this app before step 4's review passes;
  `./deploy_testing` may run at Tim's discretion after step 3's review,
  on a tree where PLAN_PACKAGE_PAGE is also at a reviewed commit.
- Rollback of the app is a revert: no schema, cache key or stored shape
  changes. The modules repo needs no rollback: an unused preset is inert.

## 8. Build log

| Date | Step | Entry |
| --- | --- | --- |
| 2026-09-22 | 1 | Tree state at start: dirty, every path in PLAN_PACKAGE_PAGE's surface (`SYSTEM_08`, `SYSTEM_14`, `results_packages/**`, `onboarding/**`), tolerated per §0. This step edits only this file. |
| 2026-09-22 | 1 | Q1 assessment: recommend (a). `HeadingBar` (panther) takes `children` on its right, so a package `Select` and an area `Select` sit on the heading row with no new layout. The plan's cost for (a) is overstated: the shared picker's orphaned-area branch exists because a product's stored area can be deleted by a structure re-upload; Explore's scope is a page signal that starts national and is never stored, so there is no initial value to orphan and the local control is one `createQuery` over `listAdminArea2s` plus a `Select` with National first (about 30 lines). The shared picker's explanatory paragraph ("read as if it contained only that area") is the one thing lost; it can ride as the Select's `title`. (b) keeps a modal for a two-option choice; (c) leaves the block on the page. |
| 2026-09-22 | 1 | Q2 assessment: recommend (a). The scorecard's caption is already in `presetConfig(preset).t.caption` (resolved by `deriveConfigFromVizPreset`), the detail already heads with the indicator label, and each card is already captioned by `t3(preset.label)`; (a) is placement, not new data. (b) is not free: `ListItem.sublabel` exists but `TabsNavigation` renders only label, icon, badge and dot (`tabs_navigation.tsx`), so a sub-label is a panther change or a JSX label, and the Data page's tabs are plain HMIS / HFA / ICEH. (c) needs a dismissal state. `HeadingBar` also has a `subheading` prop, a free place for one orienting line if Tim wants one. |
| 2026-09-22 | 1 | Q3 assessment: recommend (d). Q3(a) builds from lib helpers without touching the editor's panel. Axis options = `metric.disaggregationOptions` whose `allowedPresentationOptions` admit "table", minus `FILTER_ONLY_DISAGGREGATION_OPTIONS`, minus dims whose possible values are not `ok`, minus `getSingleValueDimsFromPossibleValues(info.disaggregationPossibleValues)` (the same three filters `editor_panel_data.tsx` applies). For m12 in a national package that is the indicator, the admin levels the package carries (`availableDisaggregationOptions` is stamped per package from the results object's real columns) and the period grains. The layout is a pure function over the preset's config: rows, columns, an optional pinned dimension in the `replicant` slot, then `withPeriod`; `ReplicateByOptionsSelect` (already on the page for HFA and ICEH) is the pinned control. Colouring needs no new rule: `buildScorecardGrid` already resolves the indicator from whichever axis carries it, and when it is pinned `resolveEffectiveIndicatorFacts` returns the pinned indicator's rule for `ruleForValue([])` (`resolve_effective_indicator_facts.ts:174`). Estimate: one `layout_controls.tsx` of about 120 lines and about 60 lines in `explore_query.ts`. (b) is out: `VisualizationEditor` is a full-page component with a Back header and three panel tabs, embedding it is the copy of the editor §3.3 forbids, and it loses sort, hover and click-to-select. The viewer of (c)/(d) is the package page's exact pattern (`visualizations.tsx:36`: `openEditor` with `VisualizationEditor`, `viewOnly: true`, a `structuredClone` of the config), about 15 lines through `openShellEditor`. |
| 2026-09-22 | 1 | Q3 fact: the plan says "the grid re-pivots by the effective config the items read returns, so a collapsed dimension still renders". The items read returns the replicant-resolved config, not a collapsed one (`t2_figure_data.ts:203`, `getEffectivePOConfig` runs later in `build_figure_inputs.ts:75`); the grid pivots by the config's own dims and a single-valued dim yields one row or column. Same outcome, different mechanism; nothing in the controls should rely on the read collapsing anything. |
| 2026-09-22 | 1 | Q3 fact: `month` is month-of-year (`LPAD(period_id % 100)`, `possible_values_core.ts:21`), pooled across years. A "Months" axis must be `period_id`, whose label is already "Year/Month"; `month` is offered as-is or not at all. |
| 2026-09-22 | 1 | Q3 fact: the server rejects a fetch not grouped by a required dimension (`run_data_reads.ts:82`), but exempts time dims and enforces only dims required by every metric of the results object (`findMissingRequiredGroupBys`). In practice that is exactly each family's indicator dimension: m12 requires `indicator_common_id`; m10's `time_point` is time-exempt; m9-01-01 requires `level` and m9-02-01 `strat`, so neither is enforced. So under Q3(a) the one dimension that must be pinned when off both axes is the indicator dimension; the preset's own replicant (HFA category, ICEH stratifier) is pinned only while it is off both axes and the indicator is on one, and two pinned dimensions can never be needed. |
| 2026-09-22 | 1 | Q4 assessment: recommend (a). `SelectSearch` takes a flat `SelectOption[]`, filters by typed text, truncates each row and the closed label with a tooltip on overflow; it has no headers or dividers, so ICEH's categories are either folded into the label or dropped (the search covers them). `SelectList` renders headers and dividers, never truncates and has no search, which is the rail's overflow. Cell and row click already select through `indicatorForHit`; defaulting to the catalog's first indicator keeps the detail from being blank. (c) alone cannot reach an indicator a filtered scorecard hides. |
| 2026-09-22 | 1 | Q5 assessment: recommend (a) with (d). What a preset must declare: the family's indicator dimension in `disaggregateBy`, because the server rejects an m12 fetch that does not group by `indicator_common_id` (Q3 fact above); the `replicant` slot is the right one, the model being m001's `outlier-map` (indicator replicant, `admin_area_2` mapArea). `filteredToIndicator` pins that correctly: `replicantDimension(config) === disOpt` routes to `withReplicantValue`, else to a `filterBy` that the render collapses through `filtered_to_one_value` while the fetch still groups by it, so a non-replicant slot also works. ICEH already has detail content this way (`iceh-coverage-trend` replicates by the indicator; the equiplot filters it). HMIS and HFA have none. Presets to add: m12-01-01 a trend (timeseries, `timeseriesGrouping: "period_id"`, valid since the metric's finest column is `period_id`), a by-area bar chart and a map, all indicator-replicant with `createDefaultVisualizationOnInstall: null` so the package page's cards do not change; m10-01-01 a by-time-point chart and a by-area chart, each keeping `time_point` on an axis or in the period filter because HFA percentages must not pool across rounds. A map card needs the package's geojson and shows the error card without it, as the package page does. (b) puts view semantics in the app; (c) leaves a table and a door. |
| 2026-09-22 | 1 | Q5(d) and Q6 share one helper. Under a single-area scope the server appends `admin_area_2 = X` to every filter set (`run_read.ts:829`) and to the possible-values read (`run_read.ts:908`), so `admin_area_2` has one possible value and one row. `admin_area_3` is in M12's results object only when the package's indicator values are at that level (the population level), so the step-down is conditional: rewrite `admin_area_2` to `admin_area_3` only when `admin_area_3` is in `metric.disaggregationOptions` and its possible values are `ok` (about 10 lines in `explore_query.ts`, used by the detail presets under (d) and as the scorecard's default rows under Q6(b)). Q6: recommend (b) with Q3(a); the Rows select excludes the single-valued `admin_area_2` on its own, so (b) is only the default. |
| 2026-09-22 | 1 | Q7 assessment: recommend (b), one `Select` for all three families. `ButtonGroup` lays its items in one `inline-grid auto-cols-fr grid-flow-col` row of equal widths and never wraps, so HFA's rounds and ICEH's survey years squeeze as they grow. A split (chips for HMIS's four windows, a Select for the rest) is two code paths for one control. |
| 2026-09-22 | 1 | Q8 assessment: recommend yes. `DataGrid` has one consumer in panther and the app, the scorecard, so the change is unconstrained: the column header's `whitespace-nowrap` becomes a bounded width with a line clamp and `title`, the row-header `th` gets a maximum width, `truncate` and `title`; both types already carry `label`, so no prop change. About six lines in panther plus its `./sync`, which the plan already makes a separate `panther/**`-only commit on a clean tree. |
| 2026-09-22 | 1 | Q9 findings. (1) Empty instance: with Q1(a) the context bar must hide when `readyPackages` is empty, or the heading row shows an empty package Select over the "no package" text. (2) A one-family package shows one tab; leave it, the label orients. (3) HFA's scorecard metric is `m10-01-01` (observed only) because `familiesInPackage` takes the first ready metric by id; the carried variant `m10-01-02` never shows on Explore. Not a question in §2; recorded for Tim. (4) The modules repo is clean on `main`, so a step-2 preset commit has no lockstep obstacle. (5) `SYSTEM_14` is dirty from the other plan's Do 2 in progress (`SYSTEM_11` is clean); this step touches neither. |
