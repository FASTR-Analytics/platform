# PLAN — HFA import: row filtering + duplicate review/resolution

> **Status (2026-07-23): implemented** (all 8 items, uncommitted).
> Typecheck green. Verified so far: scan harness against
> `data_raw.csv` reproduces the do-file exactly — 849 data rows (not
> 847 as below), 482 filtered out by consent (not 481; the Stata log
> `vaccine_availability_viviane.log` confirms 849 obs / 482 deleted),
> 365 facilities, duplicate groups 433: [60, 827] and 442: [301, 430];
> no-filter baseline matches today's behavior (454 facilities, 395
> duplicate rows). Keep-set join SQL verified against dev Postgres
> (temp tables). Remaining verification: steps 2–5 below (dev-instance
> import + M10 run).
>
> UX change during Tim's testing (2026-07-23): the duplicates review is
> its own wizard step 3 (upload, mappings+filters, review, stage,
> integrate — HFA steps now 1–5), and first/last is presented as a bulk
> quick-set over the row-by-row picks, not a "default rule" control.

Add two user-facing capabilities to the HFA CSV import flow (step 2,
mappings):

1. **Row filter** — keep only rows matching user-specified conditions
   (the equivalent of Stata's `keep if id_resp_consent == 1`).
2. **Duplicate review + resolution** — after filtering, facilities with
   multiple surviving rows are shown to the user (facility id + row
   numbers); a default rule (**first**/**last** in file order) picks
   one, and the user can override the pick per facility.

Hard ordering requirement: **the filter runs first, then dedup**. That
ordering is the entire point (see Background).

## Background — why we need this

### The Sierra Leone reconciliation (2026-07-21)

Viviane's team computed HFA Round 1 indicators in Stata for the report;
the platform's M10 module produced different numbers. A Stata do-file
(`_HFA_test_data/for_viviane/vaccine_availability.do`) that replicates
the platform's exact pipeline isolated three causes:

1. **Deduplication (the big one).** Raw KoboToolbox-style exports
   contain one row per *submission attempt*, not per facility. The SL
   R1 file has 847 rows but only 454 facilities: enumerators logged
   failed visits (refusals, closed facilities, wrong phone numbers —
   `result` codes 2–8) and then returned, so 221 facilities have 2–6
   rows, and the failed attempt often precedes the completed interview
   in file order. The staging worker keeps the **first row per facility
   id** and silently drops the rest
   (`server/worker_routines/stage_hfa_data_csv/worker.ts`,
   `seenFacilities`). For SL R1 that kept blank failed-attempt rows and
   discarded ~150 completed interviews: indicator denominators came out
   at ~213 facilities instead of ~365, shifting every vaccine
   availability estimate by 1–3 percentage points.

   The report's method (per Viviane, reproducing the survey firm's
   cleaning): keep only consented rows (`id_resp_consent == 1`), then
   resolve the two remaining duplicate facilities **by hand** — the
   firm kept data-row 60 for facility 433 (the first of its two rows)
   and data-row 430 for facility 442 (the last of its two; the firm's
   notes identify rows by Kobo's `_index` column, which equals file
   position for this export). With that
   cleaning her Stata results match the report to 5 decimals.

   Two lessons drive the design:
   - A dedup rule only works *after* content filtering — the filter
     removes the failed attempts that make file order misleading.
   - No single rule (first/last) reproduces careful hand-cleaning:
     the SL firm's two picks go opposite ways. Post-filter duplicates
     are rare (2 facilities in SL), so per-facility resolution is
     cheap — but it must be *visible* and *overridable*, not a silent
     rule. The review list is also diagnostic gold: SL's
     repeat-submission mess would have been seen at import time
     instead of surfacing a year later in a Stata reconciliation.

2. **Weights** (fixed operationally, not in this plan). The uploaded
   weights file was missing facilities 374, 98, 427 — they had been
   removed as apparent duplicates because each shares its *name* with a
   different facility (Njagbahun MCHP ×2, Rokel CHP ×2, and "Seidu
   MCHP" where one is actually Sabandu MCHP mislabeled in the sampling
   frame). Facility names are not unique; `id_fac_txt` is the safe key.
   The platform fell back to weight 1 for those three. Fix: re-upload
   the corrected 365-row weights file (Tim, manual).

3. **Module parameters** (no change needed). The SL prod run used
   `DONT_KNOW_TREATMENT = "no"` and `USE_SAMPLE_WEIGHTS = TRUE`; the
   report treats don't-know as missing. Already user-configurable.

Also found during the same investigation, tracked separately: the SL
instance's `ind274` (vaccine index) is misconfigured as
`type=binary, aggregation=sum` (should be `numeric, avg`), which makes
the generated R treat the index formula as a boolean condition and
store nonsense. Fix is in the instance's indicator definitions + rerun,
not in code.

### Why a filter mechanism (and not smarter dedup)

- The meaningful cleaning step is *semantic*: "keep consented
  interviews". Only the user knows which column and value encode that
  in their form (`id_resp_consent`, `result`, `interview_status`, …).
- A "prefer rows where X" dedup heuristic would entangle two concerns;
  filter → review → resolve keeps each step simple.

### Current flow (what changes where)

Client `client/src/components/instance_dataset_hfa_import/`:
step 1 upload CSV + XLSForm → step 2 mappings (facility id column +
time point) → step 3 stage (worker) → step 4 integrate. Step 2 saves
`HfaCsvMappingParams` (`lib/types/dataset_hfa_import.ts`) via
`updateDatasetHfaMappings`
(`lib/api-routes/instance/datasets.ts`, guarded route in
`server/routes/instance/datasets.ts`); the staging worker
(`server/worker_routines/stage_hfa_data_csv/worker.ts`) reads it back
from `hfa_upload_attempts.step_2_result` and streams the CSV wide→long
into the staging table, currently skipping any row whose facility id
was already seen.

## Design

### Row numbers

Everywhere below, "row number" = the **1-based position of the data row
in the file** (header excluded; first data row = 1), **computed by the
scanner while streaming — never read from any column**. No column
names are assumed; the mechanism works on any CSV. Users locate a row
in a spreadsheet as line − 1 (because of the header row). Where an
export happens to carry its own row-index column (Kobo's `_index`),
the numbers coincide — verified on SL R1: facility 442's rows are
data-rows 301 and 430, the same numbers the firm's cleaning notes
use — but that is a convenience, not a dependency.

### Filter = list of keep-conditions, ANDed

Not a free-text expression (no expression parser, no injection surface,
nothing to translate). Each condition:

```ts
export type HfaRowFilter = {
  column: string; // encoded header, same convention as facilityIdColumn
  op: "equals" | "not_equals";
  value: string;
};
```

- A row is kept iff **all** conditions pass (AND). Empty list = keep
  everything (default, current behavior).
- Comparison is on the raw cell as a **trimmed string**
  (`cell.trim() === value.trim()` / `!==`). CSV values are strings;
  this matches how the rest of staging treats them. Caveat surfaced in
  UI copy: `1` does not match `1.0`.
- `column` uses the same `encodeRawCsvHeader` / `getCsvColumnIndex`
  convention as `facilityIdColumn`, selected from the CSV headers in
  the UI — no free-typed column names.
- `equals` + `not_equals` cover the known cases; more operators
  (blank / not-blank) are a mechanical extension if ever needed.

### Dedup = rule + per-facility overrides

```ts
dedupStrategy: "first" | "last";          // bulk default rule
dedupOverrides: { facilityId: string; keepRow: number }[];
```

- Applied **after** the filter, over surviving rows only.
- The wizard fetches a **duplicates preview** for the saved mappings:
  the facilities with >1 surviving row, each with its row numbers.
  Shown as one group per facility — facility id + a radio per row
  number, the rule's pick preselected. Changing a pick away from the
  rule's stores an override; overrides live inside the mappings JSON so
  they persist and travel to the worker with everything else.
- Graceful at both extremes: a well-filtered file shows a short list
  (SL: 2 groups) the user can resolve by hand; an unfiltered messy file
  shows many groups but requires no action (the rule covers them all).
- Staleness: a new step-1 upload already nulls `step_2_result` (wiping
  filters and overrides with it). Changing the facility column or
  filters invalidates the duplicate structure, so the step-2 UI clears
  `dedupOverrides` whenever either changes, and the worker
  **validates** every override (facility must be a post-filter
  duplicate; `keepRow` must be one of its surviving row numbers) and
  fails staging loudly on a stale one — never a silent fallback.

## Implementation

### 1. `lib/types/dataset_hfa_import.ts`

```ts
export type HfaRowFilter = {
  column: string;
  op: "equals" | "not_equals";
  value: string;
};

export type HfaDedupOverride = {
  facilityId: string;
  keepRow: number; // 1-based position of the data row in the file (computed, not a column)
};

export type HfaCsvMappingParams = {
  facilityIdColumn: string;
  timePoint: string;
  rowFilters: HfaRowFilter[];
  dedupStrategy: "first" | "last";
  dedupOverrides: HfaDedupOverride[];
};

export type HfaDuplicateGroup = {
  facilityId: string;
  rows: number[]; // surviving row numbers, ascending
};
```

Add to `DatasetHfaCsvStagingResult`:

```ts
nRowsFilteredOut: number;
dedupStrategy: "first" | "last";
nDedupOverridesApplied: number;
```

### 2. `lib/api-routes/instance/datasets.ts`

Extend `hfaCsvMappingParamsSchema`:

```ts
rowFilters: z.array(z.object({
  column: z.string(),
  op: z.enum(["equals", "not_equals"]),
  value: z.string(),
})),
dedupStrategy: z.enum(["first", "last"]),
dedupOverrides: z.array(z.object({
  facilityId: z.string(),
  keepRow: z.number().int().min(1),
})),
```

New route `getDatasetHfaDuplicatePreview` (GET, same guard as the other
HFA dataset routes): returns
`{ groups: HfaDuplicateGroup[]; nRowsFilteredOut: number }` computed
from the current saved step-1 file + step-2 mappings.

### 3. Server: shared scan function

The filter/dedup row logic now runs in two places (preview route +
staging worker), so extract one shared function, e.g.
`server/server_only_funcs_csvs/scan_hfa_rows.ts`:

- Inputs: CSV path, facility-id column, `rowFilters`.
- Streams via the existing `getCsvStreamComponents` machinery; resolves
  all column refs up front with `getCsvColumnIndex` (clear error when a
  filter column is missing — same behavior as `facilityIdColumn`).
- Emits per surviving data row: `(rowNumber, facilityId, row)` via
  callback, plus totals (`nRowsFilteredOut`,
  `nRowsMissingFacilityId`).

The preview route uses it to build `HfaDuplicateGroup[]` (facilities
with ≥2 surviving rows). The route handler in
`server/routes/instance/datasets.ts` reads step-1/step-2 state via the
existing upload-attempt accessors and errors cleanly if either step is
unsaved.

### 4. Server: `updateDatasetHfaUploadAttempt_Step2Mappings` (`server/db/instance/dataset_hfa.ts`)

Pass through the new fields in `cleanedMappings`; trim filter values;
reject a filter with an empty `column`; reject duplicate `facilityId`
entries in `dedupOverrides`.

### 5. Staging worker (`server/worker_routines/stage_hfa_data_csv/worker.ts`)

- Read mappings with backward-compat fallbacks (a staged attempt from
  before the deploy can hold an old `step_2_result`):
  `rowFilters ?? []`, `dedupStrategy ?? "first"`,
  `dedupOverrides ?? []`.
- Replace the in-stream `seenFacilities` skip with:
  - Stamp every long row with its CSV data-row ordinal in a new
    `row_seq BIGINT NOT NULL` temp-table column; insert **all**
    surviving rows (filtering still happens in-stream via the shared
    scan function; `nRowsFilteredOut++` on rejects).
  - Track `facilityId → rowNumbers[]` in memory during the stream
    (bounded by facility count; SL scale is hundreds).
  - After streaming: resolve each facility's kept row = override if
    present, else first/last per `dedupStrategy`. Validate overrides
    (facility has ≥2 surviving rows; `keepRow` among them) — throw with
    a message telling the user to revisit step 2 on any mismatch.
  - Materialize the keep-set into an unlogged
    `temp_keep_rows_hfa(facility_id, keep_seq)` table and add
    `JOIN ... AND t.row_seq = k.keep_seq` to the existing
    `CREATE TABLE staging AS SELECT` (drop `row_seq` from the selected
    columns). Drop the keep table with the other temp tables here and
    in `deleteDatasetHfaUploadAttempt`'s orphan cleanup.
  - `duplicateRowsCount` = surviving rows − distinct facilities.
- Extend the written `DatasetHfaCsvStagingResult` with
  `nRowsFilteredOut`, `dedupStrategy`, `nDedupOverridesApplied`.

### 6. Client: `client/src/components/instance_dataset_hfa_import/step_2.tsx`

Three additions to the existing form (fresh-attempt store defaults:
`rowFilters: []`, `dedupStrategy: "first"`, `dedupOverrides: []`; an
old saved `step2Result` without the fields gets the same defaults on
load):

- **Row filter (optional).** List of conditions; each row = column
  `Select` (same `csvHeaders()` options as the facility-id select), op
  `Select` (equals / not equals), value text input, remove button; an
  "Add condition" button. Copy (en/fr/pt): rows failing any condition
  are dropped before duplicate handling — e.g. keep only surveyed
  facilities by requiring the consent column to equal 1; values are
  compared as exact text.
- **Duplicate rows.** `Select` first/last: when several rows (after
  filtering) share a facility ID, which one to keep by default.
- **Duplicates review.** Loads `getDatasetHfaDuplicatePreview` once
  facility column + filters are saved (re-fetch after each save; hidden
  until then). Renders one line per group: the facility id and a radio
  button per row number ("Row 301", "Row 430"), the default rule's pick
  preselected, current override applied if set. Changing a pick updates
  `dedupOverrides` in the store (pick == rule's choice → remove the
  override). Header copy explains: row numbers count data rows from 1
  in file order (header row excluded; add 1 to find the row in a
  spreadsheet). Empty state: "No duplicate facilities after
  filtering." Editing the facility column or any filter clears
  `dedupOverrides` (with `needsSaving` set, as for other edits).

Save-time validation: every filter needs a non-empty column and a
non-empty trimmed value (blank-matching is not a supported op).

### 7. Client: staging summary

Where `DatasetHfaCsvStagingResult` counts are rendered (step_3 /
staging summary component — locate `nRowsDuplicated` usages), add
"Rows removed by filter" (shown when > 0), and show the dedup strategy
plus "N manual override(s)" next to the duplicates count.

### 8. Docs

`SYSTEM_06_ingestion.md` (HFA staging section): document
filter → review → resolve order, row-number semantics (1-based file
position computed by the scanner, no column assumed), string-comparison
filter semantics, override validation, and the backward-compat
defaults.

## Verification

1. `deno task typecheck`.
2. Empirical, against the validated Stata oracle: on a dev instance,
   import `_HFA_test_data/for_viviane/data_raw.csv` + questionnaire
   with filter `id_resp_consent equals 1`, dedup `first`, and one
   override (facility 442 → row 430, matching the firm). The
   duplicates review must show exactly two groups: 433 (rows 60, 827)
   and 442 (rows 301, 430). Run M10 (DK=missing, weights off); the six
   vaccine indicators must match the do-file's consent-filtered
   unweighted column (`vaccine_availability_viviane.do`: measles
   0.94505 N=364, penta 0.92603 N=365, bcg 0.93699, polio 0.93681,
   pcv 0.95068, hpv 0.89779).
3. Regression: re-import with no filters, `first`, no overrides —
   results byte-identical to today's behavior.
4. Stale-override path: set an override, then change a filter so the
   facility is no longer duplicated, restore the override artificially
   (or via an old saved attempt) and confirm staging fails with the
   revisit-step-2 error rather than proceeding.
5. Staging summary shows the filtered-out count (481 for the consent
   filter on SL R1), the strategy, and the override count.

## Rollout (Sierra Leone, after deploy)

1. Re-upload corrected weights (`HFA_SL_R1_weigths_NEW.csv`, 365 rows)
   — manual, Tim.
2. Fix `ind274` to `numeric` / `avg` in the instance indicator
   definitions.
3. Re-import R1 with filter `id_resp_consent equals 1`, dedup `first`,
   overrides matching the firm: 433 → row 60 (rule's pick anyway),
   442 → row 430. This reproduces the firm's cleaning exactly, for all
   variables — not just the vaccine questions.
4. Rerun M10; project data update + module rerun downstream.
