# Plan — surfacing DHIS2 import errors: the run detail view

**Status (2026-07-16): designed, ready to build.** Supersedes the earlier
issue-only write-up in this file. Design reviewed against the actual code
(worker, DB layer, routes, all three tabs, ledger UI, version detail view).
Live validation: Nigeria currently has three failed runs whose only surface
is an invisible tooltip (`401 Account disabled` — the stored-credentials
account was disabled server-side mid-run-3), plus a completed run with 115
mixed permanent/transient pair failures that today show nothing at all.

## §0. The insight that shapes the design

The system already records everything needed, exactly run-scoped, in
`dataset_hmis_import_runs.run_stats` (written by the worker on natural
completion AND on its own error exits). **Nothing new needs to be
persisted.** The entire gap is exposure. So: one on-demand read path plus
the UI affordances to reach it. No schema change, no worker change, no new
caches, no ledger `run_id` column.

Corrections to the superseded write-up, from code review:

- There is a fourth data source it missed: `staging_result.failedFetches`
  on the version row is also exact run-scoped failure detail and already
  ships to the client (`_import_information.tsx` renders only its count).
  But it is a strict subset of `run_stats` coverage (only minted-version,
  naturally-completed runs; the interrupt reconciler writes `[]`). Not the
  thing to build on.
- `run_stats` coverage: written on complete + worker-catch error exits
  (`worker.ts:1239`, `:1272`). NOT written on cancel / host-detected crash /
  restart sweep (stats live in worker memory). Those paths all set a clear
  `run.error` — the detail view degrades gracefully (§3).
- Unknown-id pairs (stale indicator ids, dispatcher rule 4) never appear in
  `pairFetchStats` — they live in `classification.unknownIds` (id-level) +
  ledger error rows. The detail view must render both groups or it silently
  drops the most common *permanent* failure class.

Deliberately NOT doing (ruled during design):

- **No `run_id` on the ledger.** With `run_stats` exposed, run-scoped truth
  comes from the run row; the ledger stays the current-state surface with
  its own retry. The old write-up's Tier-2 "no reliable join" catch
  dissolves — nothing needs that join.
- **No History→version click-through yet** — consolidation Phase A owns the
  History↔versions navigation dedup; the detail view showing the version id
  is enough for now and gives Phase A a natural place to hang the link.
- **No run-detail→ledger navigation** — component-import cycle (the ledger
  view already opens the runs surface) for marginal value; a text pointer
  suffices in the degrade path.
- The detail view becomes the natural home for CSV `needs_review`
  diagnostics when consolidation Phase A lands — design for that by keeping
  sections self-contained, but build nothing speculative.

## §1. Server + lib

**`lib/types/dataset_hmis_import.ts`**

```ts
export type DatasetHmisImportRunDetail = DatasetHmisImportRunSummary & {
  // Absent when the run was interrupted from outside the worker
  // (cancel / host-detected crash / restart sweep) — stats live in worker
  // memory and die with it. run.error explains those cases.
  runStats?: DatasetHmisImportRunStats;
};
```

Update the `DatasetHmisImportRunStats` comment ("Not shipped in the runs
list…") to note it is served per-run by `getDatasetHmisImportRunDetail`.

**`lib/api-routes/instance/datasets.ts`** — registry entry next to the
other run routes:

```ts
getDatasetHmisImportRunDetail: route({
  path: "/datasets/hmis/dhis2-runs/:run_id",
  method: "GET",
  params: z.object({ run_id: z.coerce.number().int() }),
  response: {} as DatasetHmisImportRunDetail,
}),
```

(`z.coerce.number()` on a URL param has precedent: `levelParamsSchema` in
`geojson_maps.ts`. No method+path collision: the bare `dhis2-runs` GET is
the list; `/cancel` and `/enqueue` are POSTs.)

**`server/db/instance/dataset_hmis_import_runs.ts`** — one new function:
select the summary columns + `run_stats` by id, map through the existing
`toRunSummary`, attach `parseJsonOrUndefined<DatasetHmisImportRunStats>`.
No row → error ("Run not found") through the normal `tryCatchDatabaseAsync`
funnel.

**`server/routes/instance/datasets.ts`** — `defineRoute` with
`requireGlobalPermission("can_view_data")` (same posture as the runs list),
handler is a two-liner. The runs LIST route and its 2 s poll stay untouched
— the run_stats blob (~300 KB for a full Nigeria run) is fetched only on
click.

## §2. Client — the run detail view (`dhis2_run/_run_detail.tsx`)

Opened by clicking a History row. `EditorComponentProps` whose close result
is `Dhis2RunPair[] | undefined` — the shell interprets a pair list as
"open the wizard preset with these" (existing `presetPairs` machinery, zero
new retry plumbing).

Props: the already-loaded `DatasetHmisImportRunSummary` (instant facts, no
loading flash); a `createQuery` fetches the detail for the run_stats
sections. Indicator labels enriched via `getIndicators` with the ledger
view's degrade-to-blank pattern (never gate the view on it).

Sections, top to bottom (`FrameTop` + back-header like ImportInformation):

1. **Facts card**: status, started/ended, triggered by (+ scheduled tag),
   selection, pairs ok/failed/total, version id, DHIS2 URL.
2. **Fatal error callout** (`run.error`): red bordered card, full text,
   only when present. Kills the invisible-tooltip problem for fatal runs.
3. **Indicators not found in DHIS2** (`classification.unknownIds`, only
   when non-empty): the id list + one sentence — permanent config errors,
   every selected month failed without a fetch; fix or remove them in the
   indicator configuration.
4. **Failed pairs table** (`pairFetchStats` where `!success`, only when
   non-empty): indicator id + label, month (`formatPeriod`, instance
   calendar), route, Error—configuration / Error—server (from `errorKind`,
   a real field here — no prefix parsing), message (truncate + full text on
   title). This answers "run completed but N pairs failed — which, and why"
   — the common case that today shows literally nothing.
5. **Shadow mismatches** (only when `shadow` present with mismatches):
   kind (hard/soft), pair, facility, DVS vs analytics values — the run-abort
   error message literally points here ("detail is in run_stats.shadow").
6. **Degrade note** (detail loaded, `runStats` absent, run not complete):
   per-pair detail wasn't recorded because the run was interrupted; current
   per-indicator state is in "Import status by indicator".

Header action: **Retry failed pairs (N)** — visible when the failed-pair
list (from §4's table) is non-empty; closes with those pairs. Permanent
failures are included (operator judgment — matches the ledger retry's
semantics); unknown-id indicators are NOT (no pair rows exist for them, and
retrying a nonexistent id is pointless by construction — the §3 copy says
to fix the config instead).

## §3. Client — affordances to reach it

**`_tab_history.tsx`**: rows clickable (`onRowClick` → new `onOpenRun`
prop, same gesture as the ledger checklist); `failedPairs > 0` rendered
red in the Pairs column; the `title={run.error}` tooltip deleted (the
detail view replaces it).

**`index.tsx`** (the tab shell): wires `onOpenRun` →
`openComponent(Dhis2RunDetail)`; a pair-list result → `openWizard({ kind:
"presetPairs", pairs, label })` (same flow the ledger's retry uses).

**`_tab_future.tsx`**: both `title={s.lastError}` tooltips replaced with
the error text rendered inline under the outcome label (small danger text;
refusal/missed reasons are short sentences). "Run failed — see History"
stays — History rows now actually lead somewhere.

All new strings inline `t3` en/fr/pt.

## §4. Verify

1. `deno task typecheck` (chains lint:systems) — the new route also passes
   the startup registry validation (`markRouteDefined` via `defineRoute`).
2. Live click-throughs against the dev DB (which has real failed runs from
   the harness work): fatal-error run → callout with full text; completed
   run with failed pairs → table groups + retry opens the wizard preset
   with exactly those pairs; cancelled/swept run → degrade note; Future tab
   shows refusal reasons inline.
3. Confirm the runs-list payload is byte-identical to before (no summary
   change) — the 2 s poll must not grow.

## Out of scope

- Any persistence/schema/worker change; any new cache or SSE field.
- Ledger schema or ledger UI changes.
- History→version click-through and CSV `needs_review` diagnostics —
  consolidation Phase A (PLAN_DHIS2_IMPORTER_CONSOLIDATION.md).
- Fixing Nigeria's disabled account (operational, not code — new
  credentials must be saved once the account is re-enabled).
