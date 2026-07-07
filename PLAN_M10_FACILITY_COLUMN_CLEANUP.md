# PLAN: Stop M10/HFA leaking optional facility columns into R + results storage

## Original complaint

Meghan (GFF/HFA counterpart) re-ran the M10 module in the Sierra Leone
instance and hit:

```text
Error: Problem storing results object: null value in column "facility_ownership"
of relation "ro_m10_hfa_results_csv" violates not-null constraint
```

Her read: the facilities dataset doesn't include an ownership column (it's a
skippable step at facility upload), yet the results table enforces
`NOT NULL` on `facility_ownership`.

## Analysis and reasoning

### 1. Where the NOT NULL lives, and the immediate trigger

`wb-fastr-modules/m010/_results_objects.ts` declared `facility_ownership`,
`facility_type`, and `facility_custom_1..5` as `TEXT NOT NULL` on both
result objects (`M10_hfa_results.csv`, `M10_hfa_response_status.csv`). Grep
across `m001`–`m010` confirms this is the *only* place any module declares
these column names at all.

Storage happens in `wb-fastr/server/worker_routines/run_module/run_module_iterator.ts:390-470`
(`storeResultsObject`, the single generic ingestion path for every module,
no per-module branching):

```text
CREATE TABLE ro_m10_hfa_results_csv (... facility_ownership TEXT NOT NULL ...)   -- line 455
COPY ro_m10_hfa_results_csv FROM CSV ... NULL 'NA'                                -- line 456 <-- fails here
ALTER TABLE ... DROP COLUMN IF EXISTS facility_ownership, ...                     -- line 457
```

`columnsToExcludeIfInCsv` (lines 440-447) drops any *enabled* optional
facility column right after `COPY` — the intent is that these columns are
disposable scratch data, not part of the stored results, since disaggregation
is served by a query-time join (see §3). But the `DROP` runs after the
`COPY`, so a `NOT NULL` column with a genuinely-empty source value fails
before it's ever reached. This was the first fix applied (see "Interim
change already made" below) but it treats the symptom, not the cause.

### 2. Why these columns exist in the CSV at all — corrected reasoning

Initial hypothesis was "needed for R-side aggregation weighting." **Wrong.**
Reading `m010/script.R:34`:

```r
facility_cols <- names(data_wide)[grepl("^(facility_|admin_area_|time_point)", names(data_wide))]
```

This is a generic pass-through detector, not a computation dependency. It
sweeps up every column starting with `facility_`, `admin_area_`, or
`time_point` and carries it straight through to output (line 64-65) next to
the computed indicator values. `facility_id`, `admin_area_1-4`, and
`time_point` are genuine row-identity keys needed there. `facility_ownership`
/ `facility_type` / `facility_custom_*` just happen to share the `facility_`
prefix, so the regex drags them along incidentally. Confirmed by reading the
full indicator-calculation body (lines 30-89): none of it references these
columns. They play no role in any `ind_aggregation`/weighting logic — that
uses `weight`/`weight_final` only (from `hfa_facility_weights`, joined in
separately), which is unrelated.

The empty-status fallback (line 119-122) also hardcodes these 7 column names
in its header-only CSV, so it mirrors whatever the "real" branch produces.

### 3. Why they're in the CSV feed to R in the first place

`wb-fastr/server/db/project/datasets_in_project_hfa.ts:156-166`
(`getEnabledOptionalFacilityColumns(facilityConfig)`) conditionally joins
`facilities_hfa.facility_ownership` / `facility_type` / `facility_custom_*`
into the `PROJECT_DATA_HFA` CSV export whenever the instance config has that
column enabled (`includeOwnership`, etc.) — with **no filtering use**
downstream in the HFA export (unlike HMIS below). It's included purely so R
can... do nothing with it, then hand it back.

### 4. Comparison with HMIS (m001-m009) — this *is* an alignment fix

`datasets_in_project_hmis.ts:465-506` does the same
`getEnabledOptionalFacilityColumns` join into the R-bound CSV, but for a real
reason: HMIS windowing filters (`facilityOwnwershipsToInclude`,
`facilityTypesToInclude`, lines 234, 248, 436, 450) use these columns
server-side before/during CSV construction. Critically, every HMIS module's
R script (checked m002, m003, m004) uses **explicit `select()`/`.()` column
lists** for its final output — `facility_id`, `admin_area_x`,
`indicator_common_id`, `period_id`/`date`, `count`, etc. — never a loose
prefix regex. So even though the optional columns ride along in the HMIS
R-input CSV, no HMIS module's R script ever selects `facility_ownership`/
`facility_type`/`facility_custom_*` into its output. This is confirmed by
`_results_objects.ts` for every HMIS module having zero references to these
column names.

**Disaggregation by facility_ownership/type/custom for HMIS charts already
works today**, entirely via the query-time join:
`server/db/project/metric_enricher.ts:80-148` (`buildDisaggregationOptions`)
gates purely on `facility_id` presence + instance `facilityConfig` flags (no
physical-column probe for these names, lines 90-108), and
`cte_manager.ts:82-92` + `query_helpers.ts:130-131` build a generic
`facility_subset` CTE `LEFT JOIN`ed on `facility_id` against
`facilities_hmis`/`facilities_hfa` — the same mechanism for both families,
confirmed by `.validation/disaggregation_options.ts` listing these as
generic disaggregation dimensions and `m001`'s own AI-hint copy
(`m1-04-01.ts:208`, `m1-01-01.ts:217`) advertising `facility_type`
disaggregation despite `m001` never touching these columns in its R script
or results object.

**So M10 is the one module that broke the pattern** — its regex-based
pass-through (§2) accidentally leaks columns into the stored `ro_*` table
that HMIS modules, by explicit design, never leak. The `NOT NULL` bug was a
symptom of that leak; the leak itself is the actual inconsistency.

### 5. Are these ever fully alignable, or are some differences load-bearing?

For the specific question of *how facility attribute columns reach chart
disaggregation*: yes, fully alignable, and this fix achieves it — both
families end up relying solely on the `facility_id`-keyed query-time join,
with optional attribute columns never stored in any `ro_*` table.

Remaining differences between HMIS and HFA dataset plumbing are legitimate
and orthogonal to this fix, not inconsistencies to resolve:

- HFA computes a response-status companion output (don't-know / missing /
  not-applicable) that has no HMIS equivalent — a real survey-design need.
- HFA applies sampling weights (`hfa_facility_weights`) per facility/time
  point; HMIS modules have their own distinct aggregation/DQA/denominator
  logic per module.
- HMIS uses the optional facility columns for real server-side windowing
  filters at export time; HFA has no equivalent filter use for them.

None of those require facility_ownership/type/custom to ever be physically
stored in a `ro_*` table, so there's no tension between preserving them and
doing this cleanup.

## Interim change already made (uncommitted, in wb-fastr-modules)

As a first pass, `m010/_results_objects.ts` had `facility_ownership`,
`facility_type`, `facility_custom_1..5` relaxed from `TEXT NOT NULL` to
`TEXT` (both result objects), and `deno task build` regenerated
`definition.json` to match. This stops the crash but leaves the redundant
round-trip (SQL export → R pass-through → COPY → DROP COLUMN) in place. The
plan below supersedes it — once the columns never enter the CSV, whether the
declared type is nullable or not is moot, and the column entries should be
removed outright rather than left as unused dead declarations.

## Proposed fix

1. **`wb-fastr/server/db/project/datasets_in_project_hfa.ts`** — remove the
   `optionalColumns` block (lines ~155-166) from the `PROJECT_DATA_HFA`
   export statement entirely. HFA has no filtering use for these columns
   (unlike HMIS), and R has no computational use for them either, so there's
   no reason to select them from `facilities_hfa` into the R-bound CSV at
   all. This is the single earliest point that removes the leak.

2. **`wb-fastr-modules/m010/script.R:120`** — update the header-only
   fallback CSV string to drop `facility_ownership,facility_type,
   facility_custom_1,facility_custom_2,facility_custom_3,facility_custom_4,
   facility_custom_5`, matching what the "real data" branch will now
   produce once (1) lands. (No change needed to the `facility_cols` regex
   on line 34 — once the columns never appear in `data_wide`, the existing
   prefix match naturally stops picking them up.)

3. **`wb-fastr-modules/m010/_results_objects.ts`** — remove the
   `facility_ownership` / `facility_type` / `facility_custom_1..5` entries
   entirely from both result objects' `createTableStatementPossibleColumns`
   (superseding the interim `TEXT` relaxation from the first pass).

4. **`deno task build`** in `wb-fastr-modules` to regenerate
   `m010/definition.json`, and push the module repo in lockstep with the
   schema change per this project's cross-repo convention.

5. Sanity-check `.validation/disaggregation_options.ts` and the M10 metric
   AI-hint copy (`m10-01-01.ts`, `m10-02-01.ts`, `m10-02-02.ts`) still
   correctly advertise `facility_type`/`facility_ownership` disaggregation
   — they should, since that's served by the unchanged query-time join, not
   by anything touched here.

No changes needed to `metric_enricher.ts`, `cte_manager.ts`, or any HMIS
file — this is purely removing HFA-side leakage to match the HMIS pattern
that already works correctly.

## Status

Implemented 2026-07-08, steps 1-5 as written. Both repos typecheck clean;
`wb-fastr-modules` `.validation/validate_definitions.ts` passes for all 10
modules.

### Operational consequence (accepted, not a defect)

Any project whose HFA CSV export predates this deploy still has
`facility_ownership`/`facility_type`/`facility_custom_*` baked into its
stale on-disk `PROJECT_DATA_HFA` CSV. Its next M10 run will fail loudly with
`CSV headers not found in table definition: facility_ownership, ...` (from
`getCreateTableStatementFromCsvHeaders`) until the HFA dataset is re-added
(re-exported) post-deploy. Tell Meghan to re-add the HFA dataset in the
Sierra Leone test project after this deploy goes out.

Not yet deployed or committed.
