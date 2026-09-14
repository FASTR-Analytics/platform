# PLAN A8: the HMIS Data page has a Visualization tab and a Ledger tab

Status: APPROVED 2026-09-14, after a review against the code that found
ruling 13. Written 2026-09-14 from Tim's rulings in discussion. The
rulings marked *(proposed)* in §3 are the drafter's and stand, Tim having
read them before `Do 1`. Follows PLAN_A7, closed 2026-09-14 at
`8f7ef29d`. A8 gives the HMIS Data page two tabs: Visualization, the
existing line graph plus a new presence heat map, and Ledger, the By
indicator table moved out of the imports view. It changes no route, no
migration, no worker, no stored shape and no cache. Two things are named
as follow-ons and not done here: a heat map by admin area, which needs a
server read the ledger cannot give, and hover on the line graph, which is
panther work.

**Next step: Review 1.** Each session sets this line in its final commit. Its
values are `Do N`, `Review N` and `Fix N`; after step 3's review passes the
file is deleted instead of advanced.

All work is on `tim-branch`.

Repos: app and `wb-fastr-site` (the HMIS data page). The modules repo and
panther are not touched.

Read first: [SYSTEM_06](SYSTEM_06_ingestion.md) "Client" (the HMIS bullet
and "Display caches"); [SYSTEM_05](SYSTEM_05_facilities_indicators.md)
"Client state & wizard" (the T2 caches bullet);
`client/src/components/instance_dataset_hmis/index.tsx`;
`client/src/components/instance_dataset_hmis/dataset_items_holder.tsx`
(`DatasetDisplayPresentation`, the `vizConfig` store and the
`figureInputs` memo);
`client/src/components/instance_dataset_hmis/imports/index.tsx` (the
ledger signal at lines 134-165, `openIndicatorDetail`, `retryFailedPairs`);
`client/src/components/instance_dataset_hmis/imports/_tab_by_indicator.tsx`;
`client/src/components/instance_dataset_hmis/imports/_ledger_indicator_detail.tsx`;
`client/src/components/indicator_manager_hmis/indicators_manager.tsx`
(`importNotice`, the shape of a notice after a wizard result);
`server/db/instance/dataset_hmis.ts` lines 359-430 (what `vizItems`
carries).

## 0. How to work this plan

Cadence, session shapes, the two-things rule and the step rules are
[panther/protocols/PROTOCOL_ALL_PLANS.md](panther/protocols/PROTOCOL_ALL_PLANS.md),
bound for this app by [PROTOCOL_APP_PLANS.md](PROTOCOL_APP_PLANS.md).
This plan binds them as follows.

- Instruction: "Do the next step of PLAN_A8_HMIS_DATA_PAGE_IS_THE_LEDGER.md."
- Branch: `tim-branch`.
- Floor: `deno task typecheck`, `deno task test`, `./validate_protocols`,
  `./run`. No step touches a migration, the seed, the query engine, the
  extract or help text.
- Build log: §8. Last step: 3.
- A step reads, in order: `CLAUDE.md`, `SYSTEMS.md`, the SYSTEM file for
  each area the step names, §2 and §3 of this plan, the step's own section
  in §4, and §8.
- Peculiar to this plan: a file added, moved or deleted under
  `client/src/components/instance_dataset_hmis/` needs no manifest edit,
  because SYSTEM_06's glob claims the whole directory
  (`SYSTEM_06_ingestion.md` line 10); `lint:systems` confirms it.

## 1. The problem

The HMIS Data page (`instance_dataset_hmis/index.tsx`) shows one thing,
the data explorer, and the imports view behind its Imports button shows
the other view of the same data.

- **The explorer** (`dataset_items_holder.tsx`) fetches
  `getDatasetHmisDisplayInfo` through the client's IndexedDB cache
  (`t2_datasets.ts`, cache `dataset_hmis_display_info`, keyed
  `versionId_countIndicatorsVersion_structureLastUpdated`, bypassed while a
  run is active) and draws either a timeseries figure or a table figure
  of, per indicator and month, a record count or a sum of values, with a
  multi-select of indicators and a count-or-sum radio
  (`DatasetDisplayPresentation`, lines 100-276). The rows it draws,
  `vizItems`, are `n_records` and `sum_count` from
  `dataset_hmis_import_ledger` joined to the dictionary where
  `n_records > 0` (`dataset_hmis.ts` lines 373-383): one row per
  indicator × month, no facility or area axis.
- **The By indicator tab** of the imports view
  (`imports/_tab_by_indicator.tsx`) reads the same ledger through the
  shell's `getDatasetHmisImportLedger` (`imports/index.tsx` lines
  134-165): one row per data id with months with data, last import and
  route, failed months and skipped values, a per-month detail
  (`_ledger_indicator_detail.tsx`) and two actions that open the DHIS2
  wizard with preset pairs ("Re-import this indicator", "Retry failed
  pairs"). It lists every indicator with rows, DHIS2 element or
  Uploaded, since CSV integration writes the ledger too; only the key
  column is blank for an Uploaded one (PLAN_A6 ruling 1).

The tab is in the wrong place. Current, Future and History are about
runs; By indicator is about the data that is present, whatever run put it
there. It reads as a view onto data inside an import log. And the
explorer's table figure is a worse ledger than the ledger.

What the page lacks is a way to see coverage at a glance: which
indicators have data for which months or years. The line graph shows
magnitude; a grid of filled and empty cells shows presence.

## 2. The model

**Two tabs** at the top of the HMIS Data page's body: **Visualization**
and **Ledger**. The sidebar (status flags, Imports, Delete data) is
unchanged.

**Visualization.** The explorer's data, one figure at a time, chosen by a
radio: **Line graph**, the existing timeseries figure with its
count-or-sum radio and indicator multi-select; **Heat map**, a grid whose
rows are indicators and whose columns are months or years (a second
radio), a cell filled where the indicator has at least one record in that
period and blank where it has none, with the indicator multi-select
applied to its rows. The table figure type goes. Both draw from the
`vizItems` already fetched; no new read.

**Ledger.** The By indicator table and its per-month detail, moved to
`instance_dataset_hmis/` and mounted under the second tab. The page owns
the ledger read (`getDatasetHmisImportLedger`), fetched once when the
page mounts, kept across tab switches, and refetched only when the SSE
store's HMIS data version or running-run flag changes. The two actions open the DHIS2 wizard directly
(it fetches its own data since PLAN_A7) and, on a result, the page shows a
notice pointing at Imports. Columns, sort and detail are unchanged.

**State lives on the page.** The tab, the display-info holder, the
`vizConfig` store (figure, count or sum, indicators, heat-map axis) and
the ledger rows are all owned by the page component; the two tab bodies
are presentational. Switching tabs mounts a body over state that is
already there: no fetch, no lost selection, no reset radio. The ledger
table's dictionary comes from the T2 indicators cache
(`getIndicatorsFromCacheOrFetch` on `instanceState.indicatorsVersion`),
as the manager reads it, not a fresh `getIndicators` query.

**Imports.** Current, Future and History. The shell no longer owns a
ledger signal, `ledgerVersion` or `by_indicator` tab.

**Follow-ons, named and not done.** A heat map by admin area: neither
the ledger nor `vizItems` has an area axis, and presence by area × indicator
× month is a scan of `dataset_hmis` joined to `facilities_hmis`, the scan
the ledger exists to avoid. The clean design is a small coverage table
(area, data id, period, n_records) maintained in the same integration and
deletion transactions as the ledger, which is a migration and worker
work, so it is its own plan. Hover on the line graph: the timeseries
figure is a panther canvas render; hover belongs in panther's timeseries
primitives, and this plan does not touch panther.

## 3. Rulings

1. **Two tabs, Visualization and Ledger.** The names stand until Tim finds
   better ones; changing them is a string edit. (Tim.)
2. **The Visualization tab keeps the line graph and drops the table
   figure.** The count-or-sum radio and the indicator multi-select stay
   and apply to the line graph. (Tim: "no tables. Only the current line
   graph".)
3. **The heat map is presence, not magnitude**: a cell is filled where
   `n_records > 0` for that indicator and period, blank otherwise. By month,
   each column is one `period_id`; by year, a cell is filled where any
   month of the year has records. (Tim: "green-if-data and
   blank-if-no-data".)
4. **The heat map is a DOM grid in the app, not a panther figure**
   *(proposed)*: panther has no heat map figure (its types are table,
   chart, timeseries, vizgraph, map and pie), and a presence grid is
   rows of cells with a title attribute, which a `<div>` grid gives
   directly, hover included, with no new charting package and no
   panther change. The line graph stays the panther timeseries figure.
   Colour is the app's success token for a filled cell and the base
   border for an empty one; the grid scrolls horizontally inside its own
   container when the period axis is wide.
5. **The heat map's axes are indicator × month or indicator × year**
   *(proposed)*, with the multi-select filtering rows and the year view
   collapsing months. Admin area is a follow-on (§6), because it needs a
   server read.
6. **The Ledger tab is the By indicator table as it stands**, moved with
   its detail and its two actions, columns, default sort and the DHIS2-id
   rule unchanged. (Tim.)
7. **The page owns the ledger read** *(proposed)*: a signal-and-effect in
   the imports shell's shape (`imports/index.tsx` lines 134-165), fetched
   once when the page mounts and refetched on
   `instanceState.datasetVersions.hmis` and
   `instanceState.hmisImportRunActive` (deferred), never on a tab switch.
   Stale rows stay visible until fresh ones arrive. (Tim: switching tabs
   must not reload.)
8. **The actions open the wizard from the page** *(proposed)*:
   `openComponent({ element: Dhis2Wizard, props: { entry: { kind:
   "presetPairs", ... } } })` with the labels unchanged; on a result the
   page shows a dismissible notice in the manager's shape
   (`indicators_manager.tsx`, `importNotice`), "The import has been
   started. Follow it under Imports." The wizard's other hosts are
   unchanged.
9. **Nothing server-side changes.** `getDatasetHmisDisplayInfo`, its
   payload, the IndexedDB cache and `countIndicatorsVersion` are as they
   are; the delete-data window keeps reading them. (Consequence of 2-5.)
10. **The page owns the view state and the tab bodies own none**
    *(proposed)*: the selected tab, the display-info `StateHolder`, the
    `vizConfig` store and the ledger rows live in the page component and
    are passed down. A tab switch is a render, never a fetch. This is why
    `dataset_items_holder.tsx` splits in step 2: its fetch and its
    `vizConfig` move up to the page, its presentation stays.
11. **The ledger's dictionary comes from the T2 indicators cache**
    *(proposed)*, keyed on `instanceState.indicatorsVersion` and refreshed
    by it, the same read the indicator manager uses, instead of the
    `createQuery(getIndicators)` the imports shell used for its tab.
12. **Docs move with the code.** SYSTEM_06's HMIS Client bullet describes
    the page's two tabs and the imports view's three; the site's HMIS data
    page gains a section on viewing the data and stops naming a By
    indicator tab under imports.
13. **The explorer reads `vizItems` rows under `indicator_common_id`.**
    PLAN_A5 step 1 (`728ec361`) renamed the server column from
    `indicator_id` to `indicator_common_id` (`dataset_hmis.ts` line 377)
    and left the client on `indicator_id`
    (`dataset_items_holder.tsx` lines 113, 164 and 188), so today every
    row's series is undefined and deselecting one indicator filters out
    all rows. The fix is the three client keys, in step 1, when the
    holder is already being split; the server payload stays as it is
    (ruling 9). (Found in the pre-`Do 1` review; Tim confirmed the
    explorer is broken.)

## 4. Steps

### Step 1: The Ledger tab

**Surface.** `client/src/components/instance_dataset_hmis/index.tsx`;
`client/src/components/instance_dataset_hmis/dataset_items_holder.tsx`;
`client/src/components/instance_dataset_hmis/_ledger_table.tsx` (moved
from `imports/_tab_by_indicator.tsx`);
`client/src/components/instance_dataset_hmis/_ledger_indicator_detail.tsx`
(moved from `imports/_ledger_indicator_detail.tsx`);
`client/src/components/instance_dataset_hmis/imports/index.tsx`;
`SYSTEM_06_ingestion.md` prose; this file. Nothing else imports the two
moved files: `_tab_history.tsx` has its own `importRouteLabel` over run
summaries, and the detail's import of the tab's `importRouteLabel` and
`LedgerPeriodWindow` moves with it.

**Deliverable.** The page's body has the two tabs (ruling 1, panther
`TabsNavigation` as the imports view uses it), Visualization showing the
explorer exactly as today and Ledger showing the moved table (ruling 6)
fed by a page-owned read (ruling 7) and labelled through the T2
indicators cache (ruling 11), with the detail opened through the page's
`openEditor` and the two actions opening the wizard with a notice on a
result (ruling 8). The tab, the ledger rows and the explorer's holder are
page state (ruling 10); the tab bodies mount under a `Switch`, so the
explorer's fetch and `vizConfig` move up to the page in this step and
the holder becomes presentational, and its three `indicator_id` keys
become `indicator_common_id` (ruling 13). The imports view has three tabs, no ledger
signal, no `ledgerVersion`, and `refresh()` refetches runs and scheduling
only; `byDataId` stays for Current and the run detail. SYSTEM_06's HMIS
Client bullet says where the ledger view lives and what refetches it.

**Not in this step.** Any change inside the explorer beyond the split
and ruling 13 (step 2). The site (step 3).

**Gates.** The floor. `grep -rn "by_indicator\|Dhis2TabByIndicator\|ledgerVersion" client/src`
at zero. `grep -c '"indicator_id"' client/src/components/instance_dataset_hmis/dataset_items_holder.tsx`
at zero.

**Ends with.** One commit.

### Step 2: The Visualization tab

**Surface.** `client/src/components/instance_dataset_hmis/dataset_items_holder.tsx`;
`client/src/components/instance_dataset_hmis/_presence_heat_map.tsx` (new);
`SYSTEM_06_ingestion.md` prose; this file.

**Deliverable.** The `vizConfig` store's `figureType` becomes `"line" |
"heat_map"` with the radio relabelled; the table branch of the
`figureInputs` memo is gone (ruling 2); the heat map component takes the
filtered `vizItems`, the label replacements and a `"month" | "year"`
axis, and renders the presence grid of ruling 3 as ruling 4 says, with
its own radio for the axis shown only when the heat map is chosen
(ruling 5); the count-or-sum radio is shown only for the line graph. The
grid's cells carry a title of indicator and period. Panther imports the
table branch alone used are removed. SYSTEM_06's "Display caches"
sentence still describes the HMIS cache unchanged, and the HMIS Client
bullet names the two figures.

**Not in this step.** Admin area, hover on the line graph (§6). The site.

**Gates.** The floor. `grep -c '"table"' client/src/components/instance_dataset_hmis/dataset_items_holder.tsx`
at zero. `grep -c "serverActions\|createQuery" client/src/components/instance_dataset_hmis/_presence_heat_map.tsx`
at zero.

**Ends with.** One commit.

### Step 3: Docs and close

**Surface.** `wb-fastr-site` pages `admin-guide/data-hmis.md` and its
`fr/` twin; `SYSTEM_05_facilities_indicators.md` and
`SYSTEM_06_ingestion.md` if a sentence still disagrees with the code;
this file.

**Deliverable.** The site's HMIS data page opens with a "Viewing the
data" section describing the two tabs: the line graph with its count or
sum, the heat map with its month or year axis and what a filled cell
means, and the ledger table (one row per indicator with rows, DHIS2
element or Uploaded, the columns, the per-month detail, the two re-import
actions). "Starting an import" names three tabs; "Managing import
history" no longer describes By indicator. No help tag is added or moved,
so `lib/help/help_targets.generated.ts` is unchanged; the reviewer runs
`deno task build:help-buttons` to confirm a clean tree.

**Not in this step.** Code.

**Gates.** `grep -n "By indicator\|Par indicateur" ../wb-fastr-site/src/content/docs/admin-guide/data-hmis.md ../wb-fastr-site/src/content/docs/fr/admin-guide/data-hmis.md`
at zero. `deno task build:help-buttons` leaves the tree unchanged.

**Ends with.** One commit here and one in `wb-fastr-site`. The review
that passes this step deletes this file in its last commit.

## 5. Gates catalogue

The §0 floor applies to every step. These are the whole-plan gates; the
step that first reaches each is named, and every later step keeps it.

1. A7's gates stay at zero. Landed.
2. The By indicator tab absent from `imports/`. Step 1.
3. No table figure in the explorer; the heat map makes no server call.
   Step 2.
4. The site page describes the two tabs and names three import tabs; the
   help targets unchanged. Step 3.

## 6. Out of scope

- **Heat map by admin area** (follow-on). Needs a coverage table
  (area, data id, period, n_records) maintained in the same integration
  and deletion transactions as the ledger, read by one route, keyed on
  the version stamp. Migration plus worker plus route: its own plan.
- **Hover on the line graph** (follow-on). Belongs in panther's
  timeseries primitives, then a sync. No second charting package.
- Hover on the heat map is not a follow-on: a DOM grid has it from the
  title attribute in step 2.
- **Caching the ledger in IndexedDB** (follow-on). The page read of
  ruling 7 is per page mount; a `createReactiveCache` entry keyed on the
  HMIS version stamp, as the explorer's display info is, would make it
  per data version. Wanted once the page is in use.
- Any change to `getDatasetHmisDisplayInfo`, its payload or cache, or to
  the delete-data window that reads them.
- Any change to the ledger's columns or how the two routes write it.
- The HFA and ICEH data pages and their own `dataset_items_holder.tsx`
  files.
- Any help button on the page.

## 7. Rollout and rollback

Client and prose only. Nothing here touches a database, a route, a
cache or a stored JSON shape, so there is nothing to back up.

1. After step 3's review passes, `./deploy_testing` from `tim-branch`
   (it ships the working tree; check `git status`), then in the testing
   instance open HMIS Data, switch between the line graph and the heat
   map by month and by year, open Ledger, confirm it lists the rows the
   imports view's By indicator tab listed before, and open one
   indicator's detail.
2. Rollback is the previous image.

## 8. Build log

Append-only, newest last.

- Step 1, ruling 10: the explorer's fetch and `vizConfig` moved up to the
  page in this step (the tab bodies mount under a `Switch`, so leaving them
  in the holder would reset the selection on every switch). The store's
  `indicators` is set to every indicator each time display info arrives,
  as the old remount did.
- Step 1, ruling 7: the ledger effect is `on([datasetVersions.hmis,
  hmisImportRunActive])` without `defer`, so the mount fetch and the
  refetches are one effect.
- Step 1, ruling 8: the notice has the manager's two variants (started →
  Current, scheduled → Future), with "HMIS data, Imports" shortened to
  "Imports" since the reader is on the page.
- Step 1, choice: the tabs render outside the page's "No data" guard, which
  now wraps only the Visualization body, so Ledger and "Retry failed pairs"
  stay reachable when every pair of an import failed and no version exists.
- Step 1, ruling 13: the three `indicator_id` keys in
  `dataset_items_holder.tsx` are `indicator_common_id`.
- Step 1, fact: `SYSTEM_05_facilities_indicators.md` line 287 still names
  "the ledger's By indicator column"; the file is step 3's surface, so it
  waits for step 3.
- Step 1, floor: `./run` was not started because Tim's dev server already
  held ports 8000 and 3000; the running Vite server transformed every
  changed module (HTTP 200) and the server answered on 8000.
- Step 1 built.
