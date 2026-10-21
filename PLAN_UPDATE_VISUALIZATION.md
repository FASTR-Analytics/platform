# PLAN_UPDATE_VISUALIZATION: the "update visualization" mechanism

**Status:** step 1 built, unreviewed. **Next step: Review 1.**

A stored figure is `{ metricId, config }` frozen with its data under one
(package, scope) pair. When its product serves from another pair the figure is
stale and the user updates it: the per-figure badge's "Update to <package>", the
deck's and the report's "Update all visualizations", or an edit of the figure,
which re-resolves it on apply. Users report the update not working. This plan
validates that mechanism end to end and fixes what is wrong with it, the largest
piece being the retirement of module m003: its thirteen metrics now live on in
m011 and m012, and a figure built on one of them must update to its successor,
or say why it cannot.

- Branch: `main`.
- Repos: this app only. `wb-fastr-modules` is read (the successor definitions
  and the deleted m003 at its last commit) and not changed.
- Read first: `CLAUDE.md`, `SYSTEMS.md`, SYSTEM_08 "Loading" and "A product's
  relationship with packages", SYSTEM_10 "The captured pair and staleness",
  SYSTEM_12 "The slide editor" and "Report Forge and its host", SYSTEM_13
  "Validate-before-commit", then §2, §3, the step's section in §4, and §8.

## 0. How to work this plan

Cadence, session shapes, the two-things rule and the step rules are
`panther/protocols/PROTOCOL_ALL_PLANS.md`. The app bindings are
`PROTOCOL_APP_PLANS.md`, with two departures stated here: the branch is `main`,
the branch every recent commit is on, and the floor's `./run` and the
database-backed tests need the dev Postgres and Valkey containers, which the
step 1 session did not start (§8).

- Instruction: "Do the next step of PLAN_UPDATE_VISUALIZATION.md."
- Floor: `deno task typecheck`, `deno task test`, `./validate_protocols`,
  `./run`. Conditional: a step that touches the query engine also runs
  `./validate_queries`; none here touches migrations or help text.
- Build log: §8. Last step: 2.
- A step reads, in order: `CLAUDE.md`, `SYSTEMS.md`, the SYSTEM files above, §2
  and §3 of this plan, the step's own section in §4, and §8.
- Step 1 was built in one session before this plan was written (§8). Its review
  therefore starts from the parent of its first commit, named in §4, not from a
  commit that set the **Next step** line.
- Production is read only, through `PROTOCOL_ACCESS_DBS.md`. Step 2 reads
  production and writes nothing anywhere but a report file in the scratchpad.

## 1. The problem

As of `a5a90b185` (the commit before this plan's work):

- **A figure of a retired metric cannot update.** Every path that acts on a
  stored figure looked its metric up by id in the product package's authoring
  context and stopped when it was absent: the badge's update action
  (`client/src/components/_shared/figure_editor/stale_figure_badge.tsx:35-44`,
  "Metric "m3-02-01" is not in <package>"), both editors' Edit
  (`client/src/components/products/slide_deck/slide_editor/slide_editor.tsx:999-1011`,
  `client/src/components/products/report/report.tsx:1117-1129`, "This
  visualization's metric is not in the product's package") and the copilot's
  figure tools
  (`client/src/components/products/copilot/ai_tools/tools/update_figure.ts:108-113`,
  `.../report_editor.ts:169` and `241-246`). m003 was retired and deleted from
  the modules repo (`wb-fastr-modules` `e22dcbf`, after `473098a71` here); its
  presets were restored onto m12-01-01 (`55ed176`), m2-02-01 (`87855b2`) and
  m11-02-01 (`f96dd1e`), and its disruptions charts have their counterpart in
  the m11-01-0x band charts. Nothing in the app mapped a stored m3 figure to any
  of them, so in every product moved to a current package every m3 figure failed
  its update, its badge showing the id and nothing else.
- **The deck's "Update all" bypassed the open slide's draft.**
  `client/src/components/products/slide_deck/deck_stale_figures.ts:69-98` read
  every slide, the open one included, from the per-slide cache and wrote it back
  through `updateSlide`. While a collab room is live the route syncs that slide
  into the room's doc as a two-way diff (`server/collab/doc_rooms.ts`,
  `applyToLiveRoom`; `lib/collab/slide_crdt.ts`, `syncSlideToDoc`), and the
  cached row lags the draft by up to the checkpoint debounce
  (`CHECKPOINT_DEBOUNCE_MS`, 1500), so the write could revert what the user had
  just typed, and the header's count, read from the cache, stayed up after a
  figure updated on the canvas until the checkpoint's SSE flip. The copilot's
  slide tools already read and write the open slide through its draft for this
  reason (`.../ai_tools/tools/slide_target.ts`).
- **The report wrote an edited figure under the pair it opened with.**
  `report.tsx:1113` captured `staleContext()` before opening the editor and
  re-resolved the result under it (`1175-1181`), so a repoint while the editor
  was open stored the figure under the old package (SYSTEM_12 open item at the
  time). The slide editor resolved under its live `p.scope` but with the metric
  object of the context it opened with.
- **A read over the items cap was reported as "no data".**
  `client/src/generate_visualization/resolve_bundle_from_metric_and_config.ts:114-126`
  gave one message for every non-ok status.
- **Not a defect, confirmed by reading:** staleness itself
  (`figure_staleness.ts`, both halves of the pair), the badge's commit back into
  the slide draft (a path set with a fresh reference, which the CRDT sync
  requires), the report's registry push under live collab (the open editor's
  figure skipped), and the authoring context following the live pair in both
  editors.

## 2. The model

A retired metric is one whose module left the registry while figures built on it
live on in stored documents. The app keeps a frozen table of them
(`lib/retired_metrics.ts`, S8): for each, the id, the labels as the retired
definition wrote them, and a **successor**: the metric that answers the same
question in a current package, with the config rewrite that carries a figure
across (value props renamed or dropped, a chart mode swapped, preset-authored
texts replaced). The table reads nothing from the modules repo; the lockstep
test does, under `FASTR_MODULES_LOCAL_DIR`.

**One lookup.** `resolveFigureMetric(metrics, figure)` answers, for a stored
figure against a package's metrics: `current` (the package carries the figure's
own metric; its config stands), `succeeded` (the metric is retired and the
package carries its successor; the carried config), or `absent` (neither, with
the retired metric and its successor's module named when the metric is retired).
Every path that acts on a stored figure's metric runs it: the badge's update,
both "Update all" buttons, both editors' Edit, the copilot's `update_figure`,
`update_report_figure`, `get_report_figure` and `get_slide`. A figure updates,
edits and answers the copilot as its successor, and is stored as such on the
next write. Nothing rewrites a stored bundle behind the user: no boot transform,
no sweep; the carry happens at update time, against the data of the package the
product serves from.

**The deck's bulk update is draft-aware.** The open slide is read from its
editor's store and written through its raw setter with a path set of a fresh
layout, the write the editor's own figure edits make; every other slide goes
through the cache and `updateSlide` as before. The header's count walks the open
slide's draft synchronously before its first await, so the effect tracks the
draft's figure blocks and nothing else.

## 3. Rulings

Decided by Tim on 2026-10-21.

1. **m3-01-01** (service volume on one of four adjustment bases, SUM of
   `count_final_*`) becomes **m12-01-01** when the stored config filters to one
   basis: the value filter goes, since the metric has one value on the package's
   own basis. It becomes **m2-02-01** when the config compares bases (no filter,
   or several): the four props are the same and the filter is kept.
2. **m3-0x-01** (the disruptions chart, `count_sum` against
   `count_expected_if_above_diff_threshold`) becomes the band chart of the same
   level, **m11-01-0x**: `specialDisruptionsChart` off,
   `specialDisruptionsChartV2` on, `content: "lines"`, and no value filter while
   the mode is on, since the band chart needs all four props in order. A config
   with the mode off keeps it off and has its filter renamed (`count_sum` to
   `observed`, the threshold prop to `expected`).
3. **m3-0x-02** (the percentage difference, one metric per level) becomes
   **m11-02-01** at any level; the admin level stays a disaggregation of the
   config. **m3-0x-03** (the actual and expected pair) becomes **m11-02-02**
   with `count_sum` and `count_expect_sum` renamed to `observed` and `expected`.
   A value filter is renamed prop by prop and loses props the successor lacks.
4. **Texts.** A caption, subcaption or footnote is replaced only while it still
   equals a text the retired preset wrote, in any language, and only by the
   successor preset's text in the figure's own language (the bundle's
   `localization.language`); a text the successor drops is cleared. A user's own
   words are kept, and so is a translation the successor lacks (m011 has no
   Portuguese; a Portuguese caption is not replaced by the English fallback).
   The three spellings of the date-range token render alike.
5. **Editing a succeeded figure** opens the editor on the successor with the
   carried config and **without a live collab binding**: the editor adopts the
   doc's config over its snapshot, and the doc holds the retired config. Apply
   writes the new bundle into the doc through the host's own path.
6. **The deck's "Update all"** reads and writes the open slide through its
   draft, as the copilot's slide tools do; the count does the same.
7. **Both editors re-resolve an edited figure** under the pair and the authoring
   context as they stand when the editor closes, through `resolveFigureMetric`
   again, so a repoint mid-edit lands under the new package and a succession
   applies to the edited config.
8. **The table is frozen vocabulary**: ids, labels and preset texts as m003 last
   shipped them (`wb-fastr-modules` at `e22dcbf^`). It never reads the modules
   repo; the test does.
9. **m004** is not in the table: its coverage metrics have no successor Tim has
   named. A figure of one stays `absent` with the plain message.
10. **The one lookup is also the copilot's.** `update_figure` and
    `update_report_figure` edit a succeeded figure as its successor and say so
    in their success message; the read tools print the resolution above the
    figure's config.
11. **Production is read only** (`PROTOCOL_ACCESS_DBS.md`). The sweep of step 2
    reports and changes nothing.

## 4. Steps

### Step 1: the transition and the update paths (built)

**Surface.** `lib/retired_metrics.ts` (new), `lib/mod.ts`,
`lib/types/module_registry.ts`, `lib/run_progress.ts`,
`client/src/components/_shared/figure_editor/{stale_figure_badge.tsx,mod.ts}`,
`client/src/generate_visualization/resolve_bundle_from_metric_and_config.ts`,
`client/src/components/products/slide_deck/{deck_stale_figures.ts,slide_list.tsx,slide_deck.tsx}`,
`client/src/components/products/slide_deck/slide_editor/slide_editor.tsx`,
`client/src/components/products/report/report.tsx`,
`client/src/components/products/copilot/ai_tools/tools/{update_figure.ts,report_editor.ts}`,
`client/src/components/products/copilot/slide_ai/extract_blocks_from_layout.ts`,
`client/src/components/products/copilot/_shared/{figure_metric_for_ai.ts,mod.ts}`,
`server/tests/{retired_metrics_test.ts,_module_definitions.ts,explore_views_test.ts}`,
`server/tests/fixtures/m003_definition.json`, SYSTEM_08, SYSTEM_10, SYSTEM_11,
SYSTEM_12, SYSTEM_13, this file.

**Deliverable.** Rulings 1 to 10 in code: the table and `resolveFigureMetric` in
lib (R1 to R4, R8, R9), every path in §2 resolving through it (R5, R7, R10), the
deck's draft-aware bulk update and count (R6), the read-status message, and the
prose of the five SYSTEM files describing the contract as it now is. The test
pins the table against the m003 fixture (pure) and against the successor
definitions under `FASTR_MODULES_LOCAL_DIR` (every m003 preset carries to a
config the successor serves: metric present, required dimensions grouped, every
requested dimension offered by the results object, a fetch config that builds,
the band chart's four props in order; and reads as the successor's own preset:
its style, its texts where the retired preset had any, its layout where the two
agree).

**Not in this step.** The production sweep (step 2). Replacing `moduleLabel` in
`package_view/status.tsx` with lib's `moduleRegistryLabel` (SYSTEM_08 open
item). The orphan `server/tests/dhis2_pull_route_test.ts` (pre-existing, outside
this plan).

**Gates.** The floor;
`BYPASS_AUTH= deno test -A --env-file server/tests/retired_metrics_test.ts server/tests/explore_views_test.ts`
with `FASTR_MODULES_LOCAL_DIR` set, every test passing including the two
definition-backed steps.

**Ends with.** Three commits on `main`, each green on its own: `484384de4` (the
read-status message), the commit titled "A stored figure of a retired m003
metric updates and edits as its m011 or m012 successor", and the commit titled
"The deck's Update all visualizations reads and writes the open slide through
its draft", which carries this file. The review diffs from `a5a90b185`.

### Step 2: the production sweep

**Surface.** `sweep_retired_figures.ts` (new, repo root),
`PROTOCOL_ACCESS_DBS.md` (one line naming the script under "Pattern for sweep
scripts"), SYSTEM_08 (one sentence under "Loading" naming the script as the
table's check against stored data).

**Deliverable.** A read-only sweep over every production instance
(`ssh wb-server`, `docker exec <instance>-postgres psql -U postgres -d main`,
one ssh invocation per instance, SELECT only) that, for every stored figure
bundle on the two live surfaces (`slides.config` and `reports.figures`) and the
two version tables, extracts `metricId`, the bundle's `config`, the bundle's
`localization.language` and the product's `run_id`, and for every bundle whose
metric is in `RETIRED_METRICS`: runs `succeedRetiredFigure`, asserts the carried
config parses under `presentationObjectConfigSchema`, and checks it against the
successor's definition in the local modules checkout the way
`retired_metrics_test.ts` does (metric present, required dimensions grouped,
requested dimensions among the results object's columns, a fetch config that
builds). It prints one table per instance: retired metric id, successor, count,
and every config that fails a check with the product id and surface, and a final
count of stored figures per retired metric across instances; it writes the same
to a file in the scratchpad and nothing else. A figure whose metric is not
retired and not in the registry (m004 and any other) is counted and listed by
id, so the next retirement has its numbers. The script needs the operator's
permission for production reads (the step 1 session's attempt was refused by the
agent's permission classifier, §8); a session that is refused records that and
stops.

**Not in this step.** Any write. Any change to the table: a config the sweep
finds that the table carries wrongly is a build-log row and a finding for a Fix
of step 1, never a silent edit here.

**Gates.** The floor; the script run against every instance with every retired
figure passing its checks, or each failure listed in §8.

**Ends with.** One commit.

## 5. Gates catalogue

| Gate                                                                   | First reached |
| ---------------------------------------------------------------------- | ------------- |
| `deno task typecheck`                                                  | step 1        |
| `deno task test` with the dev Postgres and Valkey running              | step 1        |
| `./validate_protocols`                                                 | step 1        |
| `./run` boots against the dev database                                 | step 1        |
| `server/tests/retired_metrics_test.ts` under `FASTR_MODULES_LOCAL_DIR` | step 1        |
| `sweep_retired_figures.ts` over every instance, every check passing    | step 2        |

## 6. Out of scope

- Successors for m004 (R9) and for any module retired later: a row in the table
  and a pair in the test when Tim names one.
- A boot transform or sweep rewriting stored bundles: a bundle is a frozen
  render of its package; the carry happens at update time (§2).
- The copilot's `from_metric` creation path: the model picks metrics from the
  authoring context, which never lists a retired one.
- Version snapshots (`slide_deck_versions`, `report_versions`): restored as
  stored; a restored figure updates like any other.
- `moduleLabel` in `package_view/status.tsx` (SYSTEM_08 open item) and the
  orphan `server/tests/dhis2_pull_route_test.ts`.
- A success note after a per-figure update ("now shows m11-01-01"): the badge
  disappears on success and no surface remains to carry it; the copilot's tools
  do say so.

## 7. Rollout and rollback

Ships with the next release `./deploy` after Review 2 passes; `./deploy_testing`
may ship the tree to `testing-tim` for a look at any point after Review 1
passes. No migration, no cache prefix bump and no stored-schema change: the
`FigureBundle` shape is unchanged and a succeeded figure is an ordinary bundle
of the successor metric. Rollback is `git revert` of the step's commits; a
figure already carried to its successor stays a valid bundle under the old code.

## 8. Build log

| Step | Row                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | Built in one session on 2026-10-21 before this plan existed; the plan was written after, from the work, and Tim ruled R1 to R7 on reading them. The review starts from `a5a90b185`.                                                                                                                                                                                                                                                                                                                                                                                         |
| 1    | A production sweep of stored figures by metric id (one read-only ssh + psql pass over every instance) was attempted and refused by the session's permission classifier ("Production Reads"). Not run. It is step 2.                                                                                                                                                                                                                                                                                                                                                         |
| 1    | Found by the lockstep test: a Portuguese figure keeps `INTERVALO_DE_DATAS` and its Portuguese caption where the m011 successor has only English and French. R4 was settled on that: a translation the successor lacks is kept; the three date-range tokens render alike (`build_figure_inputs.ts`, `withDateRange`), and the test compares them as one.                                                                                                                                                                                                                     |
| 1    | Three m003 band-chart presets (the grids: `m3-03-01/disruption-chart` and the two `single-admin-area-N-multiple-admin-area-M`) lay indicators across and areas down where the m011 counterparts lay them the other way. The carry keeps the stored layout; the test asserts the data config against the successor preset only where the layouts agree.                                                                                                                                                                                                                      |
| 1    | Floor: `deno task typecheck` passes `deno fmt --check`, the server and client checks, and fails `lint:systems` on one orphan, `server/tests/dhis2_pull_route_test.ts`, committed in `d7b81fe7b` before this work and outside its surface. `./validate_protocols` passes. `deno task test`: 632 pass, 18 fail, every failure a database-backed suite (`consolidated_products_test`, `products_routes_test`, the access and scope route tests, the HFA and indicator tests) with the dev Postgres not running; the session did not start the containers. `./run` was not run. |
| 1    | `lib/run_progress.ts` lost its private `moduleLabel` for lib's exported `moduleRegistryLabel`; the client's copy in `package_view/status.tsx` stays (SYSTEM_08 open item reworded).                                                                                                                                                                                                                                                                                                                                                                                         |
| 1    | Step 1 built.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
