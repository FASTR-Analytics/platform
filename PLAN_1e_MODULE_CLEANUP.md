# PLAN: m011 disruption metrics at admin areas 3 and 4, then the frozen modules deleted

**Status:** open, not started. Step 1 can run now. Step 2 waits on the gate in
§0.

**What this plan does.** m011 already computes Bayesian disruptions at all four
grains but offers metrics only at national level and admin area 2. Step 1 adds
the admin area 3 and 4 metrics, binds them in the Explore page and lets the
figure editor offer the V2 disruptions style on them. With m003 retired, these
become the only disruption metrics below admin area 2 that a new package can
carry. Step 2, once no instance can be rolled back to version 1, deletes the
four frozen module directories from wb-fastr-modules and everything that exists
only to skip them.

**Next step: Do 1.** Each session sets this line in its final commit. Its values
are `Do N`, `Review N` and `Fix N`. The review that passes step 2 deletes this
file.

**Branches:** app `version2`; modules `main`.

**Repos touched:** this app (`/Users/timroberton/projects/apps/wb-fastr-v2`) and
wb-fastr-modules (`/Users/timroberton/projects/apps/wb-fastr-modules`). Panther
is not touched.

**Read first:** `CLAUDE.md`, `SYSTEMS.md`,
[SYSTEM_08_results_packages.md](SYSTEM_08_results_packages.md) ("Loading"),
[SYSTEM_10_figure_render_export.md](SYSTEM_10_figure_render_export.md) (the
special chart modes table),
[SYSTEM_11_viz_authoring.md](SYSTEM_11_viz_authoring.md) ("Explore query
model"); in wb-fastr-modules, `DOC_MODULES.md`, `DOC_VIZPRESET_STANDARDS.md` and
`DOC_SPECIAL_METRICS_SYNC.md`.

## 0. How to work this plan

Cadence, session shapes, the two-things rule and the step rules are
[panther/protocols/PROTOCOL_ALL_PLANS.md](panther/protocols/PROTOCOL_ALL_PLANS.md);
the app's bindings are [PROTOCOL_APP_PLANS.md](PROTOCOL_APP_PLANS.md). This plan
binds them as follows.

- Instruction: "Do the next step of PLAN_1e_MODULE_CLEANUP.md."
- Branches: the app on `version2`, overriding PROTOCOL_APP_PLANS's `tim-branch`
  because the files this plan touches live on `version2`; wb-fastr-modules on
  `main`. Confirm both with `git branch --show-current` and both trees clean.
  Never create a branch.
- The app floor: as PROTOCOL_APP_PLANS lists it, run with
  `FASTR_MODULES_LOCAL_DIR` pointing at the wb-fastr-modules checkout (the app's
  `.env` sets it). Without it, `server/tests/explore_views_test.ts` skips every
  check against the module definitions. No step touches a migration, the schema,
  the query engine or help text, so no conditional gate applies.
- The modules gates, for a step that changes wb-fastr-modules: `deno task build`
  (it rewrites every built `definition.json`; only the files the step names may
  change), `deno task typecheck`, and
  `deno run --allow-read --allow-net .validation/validate_definitions.ts`, the
  check its CI and pre-push hook run.
- Modules commits are not pushed by a session (§7). A review lists them with
  `git log origin/main..main` in wb-fastr-modules, beside the app commits it
  lists with `git log`.
- Step 2's gate, read in the app repo after `git fetch origin`. Both must hold:
  - version 2 is on `main`: `git cat-file -e origin/main:lib/explore_views.ts`
    succeeds;
  - the legacy purge has closed the rollout:
    `git cat-file -e origin/main:purge_legacy_dbs` fails.

  That script is deleted once no instance can be rolled back to version 1. Until
  then a rolled-back instance would resolve its whole module registry from
  wb-fastr-modules' latest commit, frozen modules included. A `Do 2` session
  checks the gate first and, while it is closed, stops and says so without
  editing anything.
- Build log: §8. Last step: 2.
- A step reads, in order: `CLAUDE.md`, `SYSTEMS.md`, the SYSTEM file for each
  area the step names, §2 and §3 of this plan, the step's own section in §4, and
  §8.
- Vocabulary:
  - **The new metrics**: `m11-01-03` (admin area 3) and `m11-01-04` (admin area
    4).
  - **The binding**: m011's `disruptions` entry in `EXPLORE_VIEWS`
    (`lib/explore_views.ts`).
  - **The frozen modules**: the `m003`, `m004`, `m007` and `m008` directories in
    wb-fastr-modules, listed in its `_frozen_modules.ts`.

## 1. The problem

### 1.1 No package generated from now on has a disruption metric below admin area 2

The app's registry (`lib/types/module_registry.ts`) lists m001, m002, m005,
m006, m009, m010, m011 and m012. m003, whose `m3-04-*` and `m3-05-*` were the
disruption metrics at admin areas 3 and 4, is retired. A package carries the
definitions it was generated with (SYSTEM_08 "Loading"), so packages generated
with m003 keep those metrics, but no new package can include m003.

m011 already produces the data:

- its script writes all four grains (`m011/script.R:263-270`):
  `M11_disruptions_analysis_admin_area_3.csv` keyed by `admin_area_2` and
  `admin_area_3`, and `M11_disruptions_analysis_admin_area_4.csv` keyed by
  `admin_area_2` to `admin_area_4`. The admin area 4 file is schema-only when
  the country has no admin area 4.
- `m011/_results_objects.ts` declares all four results objects.

But its metrics are `m11-01-01` (national) and `m11-01-02` (admin area 2) only.
The binding reads those two (`lib/explore_views.ts:411`), and
`SPECIAL_DISRUPTIONS_CHART_V2_METRICS`
(`client/src/generate_visualization/special_chart_checks.ts:23`), which decides
whether the figure editor offers the V2 disruptions style, names those two.

### 1.2 The frozen modules outlive their reason

`_frozen_modules.ts` keeps m003, m004, m007 and m008 byte-frozen on `main`
because every version 1 instance resolves its whole registry from the modules
repo's latest commit when it opens the run wizard. Once no instance can be
rolled back to version 1, nothing reads them. What exists only to skip them:

- `build_definitions.ts:13-15`, `.validation/validate_definitions.ts:14` and
  `review_ai_text/render_ai_view.ts:60` all filter them out by name;
- `split_metrics.ts` imports `m007/_metrics.ts` and works on nothing else;
- docs that name the four modules or their metric ids (step 2's surface).

## 2. The model

- m011 has one metric per grain: `m11-01-01` national, `m11-01-02` admin area 2,
  `m11-01-03` admin area 3, `m11-01-04` admin area 4. Each new metric is
  `m11-01-02` on its own results object, differing only where its grain does.
- A country without admin area 4 gets a schema-only admin area 4 file. Package
  finalize stamps `m11-01-04` unavailable ("results object has no rows",
  `computeMetricAvailability` in `server/runs/build_run_package.ts`), as it does
  any metric whose results object is empty, and the Explore page does not offer
  the level, because `offeredLevels` (`lib/explore_query.ts:205`) offers only
  levels whose metric is ready.
- The binding offers national, admin area 2, 3 and 4, each where its metric is
  ready, and each deeper than or equal to the product's scope area (the area is
  pinned in this view, never laid out). The view and its one type are unchanged.
- Packages generated before the modules push do not gain the new metrics. The
  next package generated after it carries them.
- After step 2, wb-fastr-modules holds only live module directories, and no
  build, validation or review tool keeps a skip list. The app keeps every m003
  and m004 id it holds (`SPECIAL_DISRUPTIONS_CHART_METRICS`,
  `SPECIAL_PERCENT_CHANGE_CHART_METRICS`, `SPECIAL_COVERAGE_CHART_METRICS`,
  `ALLOW_NEGATIVE_SCALE_VALUES_METRICS`, `LEGACY_MODULE_PRESENTATION`), because
  packages generated with those modules stay readable.

## 3. Rulings

Rulings marked _(proposed)_ were derived by the author of this file, not heard;
they stand unless overruled here before `Do 1`.

1. **Ids and grains.** `m11-01-03` reads
   `M11_disruptions_analysis_admin_area_3.csv`, with variant label
   `{ en: "Admin area 3", fr: "Zone administrative 3" }`. `m11-01-04` reads
   `M11_disruptions_analysis_admin_area_4.csv`, with
   `{ en: "Admin area 4", fr: "Zone administrative 4" }`. _(proposed)_
2. **Everything else is `m11-01-02`'s.** `label`, `valueProps`, `valueFunc`,
   `valueLabelReplacements`, `postAggregationExpression`, `hide`, `formatAs`,
   `importantNotes`, `catalogExpressionEvaluation` and `aiDescription` are
   copied verbatim, except that `aiDescription.disaggregationGuidance` and
   `aiDescription.caveats` name the metric's own grain. Text is in `en` and
   `fr`, as m011's other metrics are. _(proposed)_
3. **Required disaggregation.** `m11-01-03` requires `indicator_common_id` and
   `admin_area_3`; `m11-01-04` requires `indicator_common_id` and
   `admin_area_4`. The parent columns are not required. They let a product's
   admin area 2 scope filter the file directly, and the presets use them as the
   replicant. _(proposed)_
4. **Two presets per metric.** Both use the V2 disruptions chart:
   - `d`: `type: "timeseries"`, `timeseriesGrouping: "period_id"`,
     `valuesDisDisplayOpt: "series"`, `filterBy: []`,
     `selectedReplicantValue: ""` (DOC_VIZPRESET_STANDARDS, "Key rules").
   - `s`: `{ content: "lines", specialDisruptionsChartV2: true }`.
   - `t`: `m11-01-02`'s preset's.
   - `createDefaultVisualizationOnInstall: null`, `importantNotes: null`.

   | Metric      | Preset id                                                        | `disaggregateBy`                                                  | `allowedFilters`                      |
   | ----------- | ---------------------------------------------------------------- | ----------------------------------------------------------------- | ------------------------------------- |
   | `m11-01-03` | `observed-expected-ci-single-admin-area-2-multiple-admin-area-3` | indicator `row`, `admin_area_2` `replicant`, `admin_area_3` `col` | `indicator_common_id`, `admin_area_3` |
   | `m11-01-03` | `observed-expected-ci-single-admin-area-3`                       | indicator `cell`, `admin_area_3` `replicant`                      | `indicator_common_id`                 |
   | `m11-01-04` | `observed-expected-ci-single-admin-area-3-multiple-admin-area-4` | indicator `row`, `admin_area_3` `replicant`, `admin_area_4` `col` | `indicator_common_id`, `admin_area_4` |
   | `m11-01-04` | `observed-expected-ci-single-admin-area-4`                       | indicator `cell`, `admin_area_4` `replicant`                      | `indicator_common_id`                 |

   Labels and descriptions are `m11-01-02`'s preset's, reworded for the parent
   and child areas as DOC_VIZPRESET_STANDARDS ("Labels", "Descriptions")
   describes. _(proposed)_
5. **The V2 list.** `SPECIAL_DISRUPTIONS_CHART_V2_METRICS` gains `m11-01-03` and
   `m11-01-04`. Its comment on `ALLOW_NEGATIVE_SCALE_VALUES_METRICS` already
   covers them.
6. **The binding.** `byLevel` becomes
   `{ national: "m11-01-01", admin_area_2: "m11-01-02", admin_area_3: "m11-01-03", admin_area_4: "m11-01-04" }`.
   `server/tests/explore_query_test.ts` pins it: fixtures for the new metrics,
   shaped like its `m11-01-02` fixture at their own grains; the national levels
   become `["national", "admin_area_2", "admin_area_3", "admin_area_4"]`, and
   the levels under the `KANO` scope become
   `["admin_area_2", "admin_area_3", "admin_area_4"]`. _(proposed)_
7. **Step 2's deletion** removes the frozen modules and everything §1.2 names
   that exists only for them. The app's m003 and m004 ids stay (§2).
8. **Release.** §7. Nothing here needs a migration or changes stored data or a
   cached payload.

## 4. Steps

### Step 1: the new metrics

**Surface.**

- wb-fastr-modules: `m011/_metrics/m11-01-03.ts` (new),
  `m011/_metrics/m11-01-04.ts` (new), `m011/definition.json` (regenerated),
  `DOC_SPECIAL_METRICS_SYNC.md`.
- App: `client/src/generate_visualization/special_chart_checks.ts`,
  `lib/explore_views.ts`, `server/tests/explore_query_test.ts`,
  `SYSTEM_10_figure_render_export.md`, `SYSTEM_11_viz_authoring.md`.

**Deliverable.**

- Rulings 1 to 4 in the two metric files, built by `deno task build`, which
  changes no `definition.json` but m011's.
- `DOC_SPECIAL_METRICS_SYNC.md` gains a `SPECIAL_DISRUPTIONS_CHART_V2_METRICS`
  section in the shape of its other sections: metrics with
  `specialDisruptionsChartV2: true`, currently `m11-01-01` to `m11-01-04`, the
  credible-band chart.
- Rulings 5 and 6 in the app.
- `SYSTEM_10_figure_render_export.md`: the Disruptions V2 row's metrics read
  `m11-01-01/02/03/04`.
- `SYSTEM_11_viz_authoring.md`: the m011 sentence of "The bindings today" reads
  "over time only, the national metric or the admin area 2, 3 or 4 metric by the
  level, the area pinned as the replicant, the four values as lines under the
  disruptions chart style".

**Not in this step.** The frozen modules (step 2). The app's m003 lists. The
500-option replicant cap (§6).

**Gates.** The modules gates. The app floor, and, green on its own,
`deno test -A --env-file server/tests/explore_views_test.ts server/tests/explore_query_test.ts`.

**Ends with.** Two commits: the modules commit (metrics, build, doc), then the
app commit (list, binding, test, SYSTEM prose). Each is green in its own repo.
The modules commit is not pushed.

### Step 2: the frozen modules deleted

**Waits on** the gate in §0.

**Surface.**

- wb-fastr-modules: `m003/`, `m004/`, `m007/`, `m008/`, `_frozen_modules.ts` and
  `split_metrics.ts` (all deleted); `build_definitions.ts`,
  `.validation/validate_definitions.ts`, `review_ai_text/render_ai_view.ts`,
  `review_ai_text/RUN.md`, `review_ai_text/BRIEFING.md`,
  `review_ai_text/LANES.md`, `DOC_SPECIAL_METRICS_SYNC.md`,
  `DOC_VIZPRESET_STANDARDS.md`, `DOC_SURVEY_BACKBONE.md`, `.githooks/README.md`.
- App: `SYSTEM_08_results_packages.md`, `SYSTEM_10_figure_render_export.md`.

**Deliverable.**

- Ruling 7. The build, the validator and the AI-text renderer read every
  `m<digits>` directory with no skip list, and `deno task build` changes no
  `definition.json`.
- In wb-fastr-modules,
  `git grep -nE 'm00[3478]\b|m[3478]-0[0-9]|FROZEN_MODULE_DIRS|_frozen_modules'`
  prints nothing:
  - `DOC_SPECIAL_METRICS_SYNC.md` says the app's other lists hold ids of retired
    modules for figures already made, and names none.
  - `DOC_VIZPRESET_STANDARDS.md`'s symmetry example uses `m11-01-01` to
    `m11-01-04`.
  - `DOC_SURVEY_BACKBONE.md`'s m004 sentences name m005 where m005's `script.R`
    does the same (read it first), and are cut where only m004 did.
  - `review_ai_text/` keeps its procedure and drops the rows and examples about
    deleted modules.
  - `.githooks/README.md`'s sample output names a live module.
- App: SYSTEM_08 "Loading" says m003 and m004 are retired and their directories
  deleted from the modules repo, and that a package generated with them is still
  readable. SYSTEM_10's open item on flooring M3's negative predicted volume in
  m003's R script is deleted: no module can emit that value again, and the
  `auto-zero` entries stay for figures already made.

**Not in this step.** Any app code: every m003 and m004 id the app holds stays
(§2).

**Gates.** The modules gates. The app floor (its tests read the modules checkout
through `FASTR_MODULES_LOCAL_DIR`).

**Ends with.** Two commits: the modules deletion, then the app prose. The
modules commit is not pushed.

## 5. Gates catalogue

| Gate                                                                                            | First reached |
| ----------------------------------------------------------------------------------------------- | ------------- |
| The app floor, with `FASTR_MODULES_LOCAL_DIR` set                                               | every step    |
| The modules gates (§0)                                                                          | every step    |
| `deno test -A --env-file server/tests/explore_views_test.ts server/tests/explore_query_test.ts` | step 1        |
| Step 2's `git grep` in wb-fastr-modules prints nothing                                          | step 2        |

## 6. Out of scope

- The 500-option cap on a replicant's values (`MAX_REPLICANT_OPTIONS`): a
  national product in a country with more than 500 admin areas at a level gets
  "too many values" for that pin, as every admin area 3 and 4 view already does.
- `pt` text for m011: none of its metrics carries it today.
- Backfilling the new metrics into existing packages. Packages are immutable,
  and the next generation carries them.
- The app's m003 and m004 lists, and `LEGACY_MODULE_PRESENTATION`.
- wb-fastr-modules' `PLAN_ADMIN_AREA_2_ON_ADMIN3_OUTPUTS.md` (m005 and m006).

## 7. Rollout and rollback

- **Step 1, app.** The commit ships with `version2`: the next testing redeploy,
  then the fleet deploy.
- **Step 1, modules.** After Review 1 passes, push wb-fastr-modules `main` (its
  `./deploy` builds, validates and pushes). From that push, the next package any
  instance generates carries the new metrics. That includes version 1 instances,
  which load m011 from the latest commit; they show the metrics with the V2
  disruptions chart from the presets' own flag, without the Explore page or the
  editor's style option. The two pushes can land in either order: an unbound
  metric is simply absent from the Explore page, and a V2 list without the ids
  only hides the editor's style option.
- **Step 2.** After Review 2 passes, push wb-fastr-modules `main`. The app
  commit is prose and rides `version2`.
- **Rollback.** Revert the commits in each repo and push the modules revert.
  Packages generated meanwhile keep the new metrics, because a package carries
  its definitions, and nothing reads them unless they are present. Reverting
  step 2 restores the frozen directories byte for byte.

## 8. Build log

| Step | Row |
| ---- | --- |
