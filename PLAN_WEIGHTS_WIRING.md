# Plan — Wiring HFA Sampling Weights into the Analysis Pipeline

> **Status: design instructions, not yet implemented.** Weights storage + import shipped 2026-06-11 (`hfa_facility_weights`, CSV import on the HFA facilities page, CASCADE-safe across replace-all facility imports). This doc covers the remaining wiring: project export → m010 R script → viz aggregation. Touches **two repos**: this one and `~/projects/apps/wb-fastr-modules` (m010). All `file:line` refs verified 2026-06-11.

## The central design decision (read first)

**The `USE_SAMPLE_WEIGHTS` boolean acts entirely inside the R script; SQL aggregation changes unconditionally to weighted form.** The trick: when the parameter is FALSE (or a facility has no weight), R emits `weight = 1`, and the weighted formulas reduce *exactly* to today's unweighted ones (Σ1·x / Σ1 = mean; Σ1·x = sum). This gives:

- One SQL path in the viz pipeline — no conditional metric definitions, no parameter plumbing into the query layer (metric definitions are static; module parameters are not visible to PO-query SQL).
- The boolean lives where it already exists: `USE_SAMPLE_WEIGHTS` is declared in [m010/definition.json `configRequirements.parameters`](../wb-fastr-modules/m010/definition.json) (boolean, default FALSE) and is substituted into the script by the generic token loop in [get_script_with_parameters_hfa.ts:282-313](server/server_only_funcs/get_script_with_parameters_hfa.ts#L282). Toggling it in the module config marks the module dirty → re-run regenerates results. The viz layer never needs to know.

**How m010 aggregation actually works today** (the design must slot into this): `script.R` outputs one row per facility × indicator × time_point with four mutually-exclusive ingredient columns — `numeric_sum`, `numeric_avg`, `boolean_sum`, `boolean_avg` (exactly one non-NA per row, per the indicator's type × aggregation). The metric [m10-01-01](../wb-fastr-modules/m010/_metrics/m10-01-01.ts) aggregates with `SUM` over the `*_sum` ingredients and `AVG` over the `*_avg` ingredients, then `value = COALESCE(...)`. Weighting therefore means: numerators become `raw_value * weight` computed in R, and the `AVG`s become `SUM(numerator) / SUM(weight)` in the metric expression.

**Consolidation (decided):** the numeric-vs-binary split does no work in the aggregation math — both `_avg` columns get identical treatment, as do both `_sum` columns — and percent-vs-number display comes from the indicator metadata snapshot, not these columns. Since this is a breaking module update anyway, the ingredient columns consolidate to **three**: `sum_val` (complete weighted value, no denominator), `avg_num` (weighted numerator), `avg_weight` (shared denominator). An indicator's type lives in the existing `hfa_indicator` metadata; the results table no longer encodes it in column names.

---

## 1. Bringing weights into projects

Weights reach projects **only via the `hfa.csv` export** — the project DB has no HFA data tables (only snapshots + the facilities copy), and R reads the CSV. No project-DB weights table, no project copy threading.

1. **Export join** — [datasets_in_project_hfa.ts:87-104](server/db/project/datasets_in_project_hfa.ts#L87): add to the export SELECT
   `LEFT JOIN hfa_facility_weights w ON w.facility_id = h.facility_id AND w.time_point = h.time_point`
   and output `w.weight` as a column named **`weight`** (raw; NULL when no weight exists — R decides the fallback, see §2). The name matters: `weight` deliberately fails m010's `^(facility_|admin_area_|time_point)` passthrough regex, so an **old** script version silently ignores the new column (safe rollout, §4). Never name it `facility_weight` — that rides the regex into the results CSV and breaks ingest (`getCreateTableStatementPossibleColumns` throw).
2. **Var-name collision guard** — an HFA survey variable literally named `weight` would collide with the exported column at `pivot_wider`. Reject `var_name = 'weight'` (case-insensitive) at HFA CSV staging ([stage_hfa_data_csv/worker.ts](server/worker_routines/stage_hfa_data_csv/worker.ts), where var mappings are built) with a clear error. Cheap, and it protects the export unconditionally.
3. **Zero/empty weights** — already enforced at the importer + DB CHECK (migration 051): weights are strictly positive. A literal 0 is near-certainly a data error (design weights are 1/π ≥ 1) and would silently exclude the facility — zeroing its contribution to totals and, via the divide guard, NULLing a group's mean when all its weights are 0. If the analysis team ever needs exclusion semantics, that's an explicit feature request, not a weight value.
4. **Staleness** — the project stores `DatasetHfaInfoInProject.structureLastUpdated` and the client flags the export stale when the instance value differs ([staleness_checks.ts](client/src/components/project/staleness_checks.ts)). Bump `structure_last_updated` in `importHfaFacilityWeights` and `deleteAllHfaFacilityWeights` (same upsert as [structure.ts deleteFamilyFacilities](server/db/instance/structure.ts)) so weight changes mark project HFA exports stale through the existing machinery. No new staleness key needed.

## 2. Using weights in the R script (m010 — `wb-fastr-modules` repo)

All in `m010/`; one lockstep commit with §3 (same module update):

1. **`script.R`** changes:
   - After `read.csv`: `if (!"weight" %in% names(data)) data$weight <- NA_real_` — tolerance for pre-§1 exports (compat matrix, §4).
   - Resolve the parameter once: `weight_final <- if (USE_SAMPLE_WEIGHTS) coalesce(weight, 1) else 1` (per row; `weight` is constant per facility × time_point, so it survives `pivot_wider` as an id column automatically). When `USE_SAMPLE_WEIGHTS` is TRUE, print the count of facilities falling back to weight 1 so silent coverage gaps are visible in the module log.
   - Carry `weight_final` through to the long output (it is NOT matched by the `facility_cols` regex, so it must be explicitly selected alongside `facility_info`), then compute the **three consolidated ingredient columns**:
     - `sum_val    = ifelse(ind_aggregation == "sum", raw_value * weight_final, NA)`  ← complete value, no denominator
     - `avg_num    = ifelse(ind_aggregation == "avg", raw_value * weight_final, NA)`  ← numerator
     - `avg_weight = ifelse(ind_aggregation == "avg", weight_final, NA)`              ← shared denominator
     (the old `numeric_*`/`boolean_*` four-way split is retired; type no longer splits columns)
   - Drop `weight`/`weight_final` themselves from the written CSV (only the three ingredient columns go out).
   - Note the NA semantics are already right: rows with `is.na(raw_value)` are filtered out before output, so a facility that didn't answer an indicator contributes neither numerator nor denominator — the weighted mean is over responding facilities only.
2. **`definition.json`**: in `createTableStatementPossibleColumns`, remove `numeric_sum`/`numeric_avg`/`boolean_sum`/`boolean_avg` and add `"sum_val"`, `"avg_num"`, `"avg_weight"` (all `NUMERIC`). Ingest throws on undeclared columns — this is the one schema gate. `USE_SAMPLE_WEIGHTS` is already declared; no parameter changes.
3. **Semantics (DECIDED 2026-06-11): sums are weighted.** Σw·x is the standard survey estimator of the population total; the unweighted sample sum is a design artifact (depends on how many facilities were visited). Crucially, it keeps sums and means coherent on the same dashboard: estimated count = weighted share × estimated facility population (Σw). Reduces to the plain sum at w=1. Communication caveats for implementation: estimates are non-integer (decimal-places handles display); totals fail more visibly than means at fine admin disaggregation when weights were designed for national/stratum estimates (add a sentence to the metric's `aiDescription.caveats`); and the w=1 fallback for missing weights deflates totals harder than it distorts means — the fallback-count log (§2.1) is the number to watch when weights are ON.

## 3. Using weights in aggregation (viz metric — same module update)

[m10-01-01.ts](../wb-fastr-modules/m010/_metrics/m10-01-01.ts) `postAggregationExpression`:

1. Ingredients become **SUM for all three** columns (the `AVG` func disappears):
   `sum_val, avg_num, avg_weight` — each `{ prop, func: "SUM" }`.
2. Expression — **must use the bare division, no explicit NULLIF**:
   `value = COALESCE(sum_val, avg_num / avg_weight)`
   The evaluator ([applyPostAggregationExpression, query_helpers.ts:316](server/server_only_funcs_presentation_objects/query_helpers.ts#L316)) auto-wraps every `/column` with a NULLIF guard via regex (`/\/\s*(\w+)/g` → `/ NULLIF($1, 0)`), producing `avg_num / NULLIF(avg_weight, 0)` in the final SQL. Writing `NULLIF` explicitly in the expression would be double-wrapped into broken SQL (`/ NULLIF(NULLIF, 0)(avg_weight, 0)`) — verified against the current evaluator. Per group only one arm is non-NULL (hfa_indicator is a required disaggregation), so COALESCE picks correctly and the auto-guard handles empty groups.
3. This works at every admin-area rollup level for free — the SUMs are re-aggregated by the existing GROUP BY machinery, and the ratio is taken after aggregation, which is exactly the weighted-mean identity. No changes to cte_manager / query context / disaggregation.

## 4. Rollout order & compatibility (no flag-day)

| Export (wb-fastr) | Script (m010) | Result |
|---|---|---|
| old (no `weight` col) | old | today's behavior |
| **new** | old | `weight` column ignored (regex miss) — byte-identical results ✓ |
| old | **new** | `data$weight <- NA_real_` guard → weight_final = 1 → unweighted ✓ |
| new | new | weighted per `USE_SAMPLE_WEIGHTS` ✓ |

So: ship §1 (wb-fastr) first in its own commit; then the m010 changes (§2 + §3 + definition.json together — script, ingest schema, and metric must move as one module update per DOC_MODULE_UPDATES.md). Projects pick it up via the normal module-update flow; users must **re-add the HFA dataset** (regenerates `hfa.csv` with the weight column — the staleness flag from §1.3 prompts this) and re-run the module.

## 5. Verification checklist

1. Re-add HFA dataset → `hfa.csv` contains `weight` column; facilities without weights show empty.
2. `USE_SAMPLE_WEIGHTS = FALSE` → **viz output identical** to pre-change run (the w=1 reduction; this is the regression gate). Compare saved PO items JSON for an HFA viz before/after, not the results CSV — the consolidation renames the ingredient columns, so CSV bytes legitimately differ while every aggregated value must match exactly.
3. `USE_SAMPLE_WEIGHTS = TRUE` with a hand-checkable fixture (e.g. 2 facilities, weights 1 and 3, binary avg indicator values 0 and 1 → expect 0.75) at national AND at one admin-area rollup level.
4. Facility with data but no weight row, weights ON → counted with weight 1 + logged count in module output.
5. Staging an HFA CSV containing a `weight` var_name → rejected with the §1.2 error.
6. Weights import/delete → project HFA dataset shows the stale indicator.

## Out of scope

- Weighted population denominators / calculated indicators (HMIS side) — unrelated machinery.
- Per-indicator weight overrides; weights apply uniformly to all HFA indicators of a run.
- Surfacing weighted-vs-unweighted in viz captions (worth a footnote convention later; the module log records the setting per run).
