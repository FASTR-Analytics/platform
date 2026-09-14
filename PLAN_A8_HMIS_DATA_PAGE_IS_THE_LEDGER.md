# PLAN A8: the HMIS Data page shows the import ledger, and the data explorer goes

Status: DRAFT. Written 2026-09-14 from Tim's question in discussion
("should we do away with the data explorer and just have the By indicator
table be the data explorer?") and the drafter's reading of the code. The
rulings marked *(proposed)* in §3 are the drafter's and stand unless Tim
overrules them in §3 before `Do 1`. Follows PLAN_A7, closed 2026-09-14
at `8f7ef29d`. A8 moves the By indicator table from the imports view to
the HMIS Data page, where it becomes the page's body, deletes the data
explorer that drew the same ledger numbers as a chart, and slims the
route that fed it down to what the delete-data window still reads. It
changes no migration, no worker, no stored shape and no cache prefix in
Valkey; one client IndexedDB cache changes name because its payload
changes shape.

**Next step: Do 1.** Each session sets this line in its final commit. Its
values are `Do N`, `Review N` and `Fix N`; after step 4's review passes the
file is deleted instead of advanced.

All work is on `tim-branch`.

Repos: app and `wb-fastr-site` (the HMIS data page). The modules repo and
panther are not touched.

Read first: [SYSTEM_06](SYSTEM_06_ingestion.md) "Client" (the HMIS bullet
and "Display caches") and "HMIS import runs" (the expansion bullet's last
sentences on the ledger); [SYSTEM_05](SYSTEM_05_facilities_indicators.md)
"Client state & wizard" (the T2 caches bullet);
`client/src/components/instance_dataset_hmis/index.tsx`;
`client/src/components/instance_dataset_hmis/dataset_items_holder.tsx`;
`client/src/components/instance_dataset_hmis/imports/index.tsx` (the
ledger signal, `openIndicatorDetail`, `retryFailedPairs`);
`client/src/components/instance_dataset_hmis/imports/_tab_by_indicator.tsx`;
`client/src/components/instance_dataset_hmis/imports/_ledger_indicator_detail.tsx`;
`client/src/state/instance/t2_datasets.ts`;
`server/db/instance/dataset_hmis.ts` lines 292-430;
`client/src/components/WindowingSelector.tsx`.

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
- Build log: §8. Last step: 4.
- A step reads, in order: `CLAUDE.md`, `SYSTEMS.md`, the SYSTEM file for
  each area the step names, §2 and §3 of this plan, the step's own section
  in §4, and §8.
- Peculiar to this plan: a step that deletes or moves a file under
  `client/src/components/instance_dataset_hmis/` needs no manifest edit,
  because SYSTEM_06's glob claims the whole directory
  (`SYSTEM_06_ingestion.md` line 10); `lint:systems` confirms it.

## 1. The problem

The HMIS Data page (`instance_dataset_hmis/index.tsx`) has two things in
it that show the same facts.

- **The data explorer.** `dataset_items_holder.tsx` fetches
  `getDatasetHmisDisplayInfo` through a client IndexedDB cache
  (`t2_datasets.ts` lines 26-96, cache name `dataset_hmis_display_info`,
  version key `versionId_countIndicatorsVersion_structureLastUpdated`,
  bypassed while a run is active) and draws a chart or table of, per
  indicator and month, a record count or a sum of values, with a
  multi-select of indicators and a count-or-sum radio
  (`DatasetDisplayPresentation`, lines 100-276). The server side
  (`dataset_hmis.ts` lines 359-430) does not scan `dataset_hmis`: its
  `vizItems` are `n_records` and `sum_count` read from
  `dataset_hmis_import_ledger`, joined to the dictionary, where
  `n_records > 0`.
- **The By indicator tab** of the imports view
  (`imports/_tab_by_indicator.tsx`) reads the same ledger through the
  shell's `getDatasetHmisImportLedger` (`imports/index.tsx` lines
  109-142), one row per data id with months with data, last import and
  route, failed months and skipped values, a per-month detail
  (`_ledger_indicator_detail.tsx`) and two actions that open the DHIS2
  wizard with preset pairs ("Re-import this indicator", "Retry failed
  pairs").

So the explorer is a chart of two ledger columns, and the tab is the
ledger itself. Two reads of one table, two caches (the IndexedDB one and
the shell's signal), two places to look for "what data do we have".

The tab is also in the wrong place. Current, Future and History are about
runs; By indicator is about the data that is present, whatever run put it
there. It reads as a view onto data inside an import log, which is what
Tim noticed.

Two things depend on the explorer's route and must survive it. The
delete-data window (`WindowingSelector.tsx` lines 30-70, opened from the
page's "Delete data" and from the project data window) calls the same
`getDatasetHmisDisplayInfoFromCacheOrFetch` for the indicators with rows,
the admin areas and the period bounds. And `countIndicatorsVersion` is an
SSE stamp stored in project manifests (`SYSTEM_05` "Client state &
wizard"), keyed on by that window too, so it stays whatever happens to
the explorer.

## 2. The model

**The ledger view.** The By indicator table and its per-month detail,
moved to `instance_dataset_hmis/` and mounted as the HMIS Data page's
body. The page owns the ledger read (`getDatasetHmisImportLedger`), fetched
on mount and again whenever the SSE store's HMIS data version or
running-run flag changes, so a finished import shows up without a click.
The two actions keep working from the page: they open the DHIS2 wizard
directly (it fetches its own data since PLAN_A7), and after a launch the
page shows a notice pointing at Imports. Nothing about the table's
columns, sort or detail changes in the move.

**The chart** *(proposed)*. What the explorer offered that the table does
not: a picture of `sum_count` or `n_records` by month. It becomes part of
the ledger view: the table's rows are selectable (a controlled selection,
no bulk actions, so no bar since the panther Table change of
2026-09-14), and a chart above the table draws the selected indicators'
monthly sum or count from the ledger rows already loaded. No server
call, no cache. Nothing selected draws nothing and says so.

**The window options route.** `getDatasetHmisDisplayInfo` slimmed to what
the delete-data window reads: the structure schema, the indicators with
rows, the admin areas, the period bounds, the facility types and
ownerships. `vizItems` and `indicatorLabelReplacements` go. The client
cache that holds it changes name, because its stored shape changes and an
old entry under the new code would lack nothing but would carry dead
rows.

**Imports.** Current, Future and History. The shell no longer owns a
ledger signal, `ledgerVersion` or `by_indicator` tab, and `refresh()` no
longer bumps a ledger.

## 3. Rulings

1. **The explorer is deleted, not hidden.** `dataset_items_holder.tsx` and
   its figure rendering go. The page has one body, the ledger view. (Tim:
   "do away with the data explorer part of this page completely".)
2. **The ledger view is the By indicator table as it stands**, moved, with
   its detail and its two actions. Columns, default sort ("what needs
   attention floats up"), the DHIS2-id rule (shown only under a DHIS2
   element, PLAN_A6 ruling 1) and the route label are unchanged. (Tim:
   "just have the By indicator table be the data explorer".)
3. **The page owns the ledger read** *(proposed)*: a `createQuery` over
   `getDatasetHmisImportLedger`, silently refetched on
   `instanceState.datasetVersions.hmis` and `instanceState.hmisImportRunActive`
   (deferred effect), the same wake-up the imports shell uses for its
   runs. Stale rows stay visible until fresh ones arrive.
4. **The actions open the wizard from the page** *(proposed)*:
   `openComponent({ element: Dhis2Wizard, props: { entry: { kind:
   "presetPairs", ... } } })`, the labels unchanged; on a result the page
   shows a dismissible notice, "The import has been started. Follow it
   under Imports." in the manager's shape (`indicators_manager.tsx`,
   `importNotice`). The wizard's other hosts are unchanged.
5. **Uploaded indicators are in the view.** The ledger holds CSV rows, so
   the table lists every indicator with rows, DHIS2 element or Uploaded;
   only the key column is blank for an Uploaded one. Sums have no rows and
   do not appear, as before (PLAN_A4 ruling 8). (Fact, restated so the
   question "is By indicator DHIS2-only?" has its answer in the plan.)
6. **The chart** *(proposed)*: one panther figure over the loaded ledger
   rows, `sum_count` or `n_records` by month, one series per selected
   indicator, a count-or-sum radio, drawn from the rows already in the
   page. Selection is the table's controlled `selectedKeys`; nothing
   selected shows one line saying to select rows. If Tim strikes this
   ruling, step 3 is skipped and its gate row in §5 is dropped.
7. **The route is slimmed and renamed** *(proposed)*: `getDatasetHmisDisplayInfo`
   becomes `getDatasetHmisWindowOptions` (route path
   `/datasets/hmis/window-options`), its payload type
   `ItemsHolderDatasetHmisDisplay` becomes `DatasetHmisWindowOptions`
   without `vizItems`, `indicatorLabelReplacements`, `versionId` and
   `indicatorsVersion` (the client passes those in and never reads them
   back), the client fetcher becomes `getDatasetHmisWindowOptionsFromCacheOrFetch`
   and the IndexedDB cache name becomes `dataset_hmis_window_options`.
   The version key and the run-active bypass are unchanged. Cost: the
   route file, the handler, the db function, the lib type, the fetcher,
   `WindowingSelector.tsx`, and the SYSTEM_05 sentence naming the cache.
   The request body keeps `countIndicatorsVersion`.
8. **`countIndicatorsVersion` stays.** It is an SSE stamp and a manifest
   field; only the explorer's reads of it go. (Consequence.)
9. **No new server read.** The chart and the table read one ledger fetch;
   the window reads one options fetch. (Consequence of 3, 6 and 7.)
10. **Docs move with the code.** SYSTEM_06 "Display caches" loses its HMIS
    sentence, its HMIS Client bullet describes the imports view without
    By indicator and the page with the ledger view; SYSTEM_05's T2 bullet
    names the new cache. The site's HMIS data page gains a "Viewing the
    data" section and its imports text stops naming a By indicator tab.

## 4. Steps

### Step 1: The page is the ledger view

**Surface.** `client/src/components/instance_dataset_hmis/index.tsx`;
`client/src/components/instance_dataset_hmis/dataset_items_holder.tsx`
(deleted); `client/src/components/instance_dataset_hmis/_ledger_table.tsx`
(moved from `imports/_tab_by_indicator.tsx`);
`client/src/components/instance_dataset_hmis/_ledger_indicator_detail.tsx`
(moved from `imports/_ledger_indicator_detail.tsx`);
`client/src/components/instance_dataset_hmis/imports/index.tsx`;
`SYSTEM_06_ingestion.md` prose; this file. Nothing else imports the two
moved files: `_tab_history.tsx` has its own `importRouteLabel` over run
summaries, and the detail's import of the tab's `importRouteLabel` and
`LedgerPeriodWindow` moves with it.

**Deliverable.** The HMIS Data page's body is the ledger table (ruling
2), fed by a page-owned query refetched on the two SSE signals (ruling
3), with the per-month detail opened through the page's `openEditor` and
the two actions opening the wizard from the page with a notice on a
result (ruling 4). `dataset_items_holder.tsx` is gone and nothing imports
it. The imports view has three tabs, no ledger signal, no
`ledgerVersion`, no `byDataId` use beyond what Current and the run detail
still need, and `refresh()` refetches runs and scheduling only. The
"No data" fallback for an instance without a version stays on the page.
SYSTEM_06's HMIS Client bullet says where the ledger view lives, what
refetches it and that the imports view has three tabs.

**Not in this step.** The route (step 2). The chart (step 3). The site
(step 4).

**Gates.** The floor. `grep -rn "by_indicator\|Dhis2TabByIndicator\|ledgerVersion" client/src`
at zero. `grep -rn "dataset_items_holder" client/src/components/instance_dataset_hmis`
at zero.

**Ends with.** One commit, or two if the move and the deletion are easier
to review apart.

### Step 2: The window options route

**Surface.** `lib/api-routes/instance/datasets.ts`; `lib/types/instance.ts`
(the payload type); `server/routes/instance/datasets.ts` (the handler);
`server/db/instance/dataset_hmis.ts` lines 292-430;
`client/src/state/instance/t2_datasets.ts`;
`client/src/components/WindowingSelector.tsx`;
`SYSTEM_05_facilities_indicators.md` and `SYSTEM_06_ingestion.md` prose;
this file.

**Deliverable.** Ruling 7 in full: the renamed route, handler, db
function, type, fetcher and cache name; the payload without the four
dropped fields; the db function without the `vizItems` query and the
label map; `WindowingSelector.tsx` reading the new name and nothing it
did not read before. SYSTEM_05's T2 bullet names
`dataset_hmis_window_options`; SYSTEM_06 "Display caches" no longer
describes an HMIS display cache.

**Not in this step.** Any client outside the selector. The site.

**Gates.** The floor. `grep -rn "DisplayInfo\|vizItems\|ItemsHolderDatasetHmisDisplay" client/src lib server`
at zero. `grep -rn "dataset_hmis_display_info" client/src` at zero.

**Ends with.** One commit.

### Step 3: The chart

**Surface.** `client/src/components/instance_dataset_hmis/_ledger_table.tsx`;
`client/src/components/instance_dataset_hmis/_ledger_chart.tsx` (new);
`client/src/components/instance_dataset_hmis/index.tsx`;
`SYSTEM_06_ingestion.md` prose; this file.

**Deliverable.** Ruling 6: the table's rows are selectable through a
controlled selection held by the page, a chart above the table draws the
selected indicators' monthly `sum_count` or `n_records` from the loaded
ledger rows with a count-or-sum radio, one series per indicator labelled
through the dictionary, and an empty selection shows one sentence. No
server call is added. SYSTEM_06's HMIS Client bullet names the chart and
says it reads the page's ledger rows.

**Not in this step.** Any filter by admin area or facility (§6). The
site.

**Gates.** The floor. `grep -c "serverActions" client/src/components/instance_dataset_hmis/_ledger_chart.tsx`
at zero.

**Ends with.** One commit.

### Step 4: Docs and close

**Surface.** `wb-fastr-site` pages `admin-guide/data-hmis.md` and its
`fr/` twin; `SYSTEM_05_facilities_indicators.md` and
`SYSTEM_06_ingestion.md` if a sentence still disagrees with the code;
this file.

**Deliverable.** The site's HMIS data page has a "Viewing the data"
section describing the ledger table (one row per indicator with rows,
DHIS2 element or Uploaded, the columns, the per-month detail, the two
re-import actions, and the chart if ruling 6 stands), placed before
"Import methods"; "Starting an import" names three tabs; "Managing import
history" no longer describes By indicator. No help tag is added or moved,
so `lib/help/help_targets.generated.ts` is unchanged (the reviewer runs
`deno task build:help-buttons` to confirm a clean tree).

**Not in this step.** Code.

**Gates.** `grep -n "By indicator\|Par indicateur" ../wb-fastr-site/src/content/docs/admin-guide/data-hmis.md ../wb-fastr-site/src/content/docs/fr/admin-guide/data-hmis.md`
at zero outside the new section. `deno task build:help-buttons` leaves the
tree unchanged.

**Ends with.** One commit here and one in `wb-fastr-site`. The review
that passes this step deletes this file in its last commit.

## 5. Gates catalogue

The §0 floor applies to every step. These are the whole-plan gates; the
step that first reaches each is named, and every later step keeps it.

1. A7's gates stay at zero. Landed.
2. The explorer and the By indicator tab absent from `client/src`. Step 1.
3. `DisplayInfo`, `vizItems` and the old cache name absent from the three
   trees. Step 2.
4. The chart file makes no server call. Step 3 (dropped if ruling 6 is
   struck).
5. The site page describes the ledger view and names three import tabs;
   the help targets unchanged. Step 4.

## 6. Out of scope

- Filtering the ledger view by admin area, facility type or ownership.
  The explorer's route computed those lists but the page never offered
  the filters; the ledger has no facility axis. If wanted later it is a
  server read, not this plan.
- Any change to the ledger's columns or how the two routes write it.
- The HFA and ICEH data pages and their own `dataset_items_holder.tsx`
  files, which are separate components over other tables.
- The delete-data window's behaviour. It keeps reading the same fields
  from the renamed route.
- The Valkey tombstones in SYSTEM_03 and SYSTEM_09 that mention the old
  route name as history. They record what was deleted and stay as they
  are.
- Any help button on the page.

## 7. Rollout and rollback

Client, one route rename and prose. No database, no Valkey prefix, no
stored JSON. The IndexedDB cache rename means every browser fetches the
window options once more after the deploy, a few kilobytes.

1. After step 4's review passes, `./deploy_testing` from `tim-branch`
   (it ships the working tree; check `git status`), then in the testing
   instance open HMIS Data, confirm the table lists the same rows the
   imports view's By indicator tab listed before, open one indicator's
   detail, and open Delete data to confirm the window still lists the
   indicators, areas and period bounds.
2. Rollback is the previous image. The old client reads its old cache
   name, which still holds valid entries.

## 8. Build log

Append-only, newest last.
