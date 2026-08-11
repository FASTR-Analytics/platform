# Plan: facility_id ambiguity in facility-column disaggregation queries

Found by the Ghana parity rig 2026-08-10 (22 both_error checks, 29/29
projects gated). NOT a cutover/parity issue — **both engines reject the
generated SQL identically** (pg: `column reference "facility_id" is
ambiguous`; DuckDB: `Binder Error: Ambiguous reference to column name
"facility_id"`), so the legacy plane has the same bug and the cutover
changes nothing. Pre-existing user-facing defect on 1.65 too.

## Problem

When a metric's **value prop is `facility_id`** (e.g. Ghana's "Number of
records" — `COUNT(facility_id)`) and the config disaggregates by a
**facility column** (facility_ownership, facility_type, …), the generated
query is invalid SQL on both engines:

- The facility-column disaggregation makes `buildSelectQuery` add
  `LEFT JOIN <facilityCTE> f ON <sourceTable>.facility_id = f.facility_id`
  ([query_helpers.ts:233-235](server/server_only_funcs_presentation_objects/query_helpers.ts#L233-L235)),
  so `facility_id` now exists on BOTH sides of the join.
- `buildAggregateColumns` emits value aggregates **unqualified**:
  `COUNT(facility_id)` / `SUM(prop)` / bare identity prop
  ([query_helpers.ts:407-432](server/server_only_funcs_presentation_objects/query_helpers.ts#L407-L432)).
- Result: ambiguous column reference → hard error. Any Ghana user
  disaggregating such a metric by a facility column hits it today; other
  instances are exposed wherever facility columns are enabled in instance
  config (that's why only Ghana's rig caught it — first rigged instance
  with facility columns enabled).

The n-values counter already qualifies for exactly this reason — see the
doc comment at
[query_helpers.ts:457-466](server/server_only_funcs_presentation_objects/query_helpers.ts#L457-L466)
("The facility_id reference is table-qualified because the facilities CTE
joins in a column of the same name") — but the fix was applied only there,
not to the value aggregates. One latent sibling: the plain-values sample-N
`FILTER (WHERE <prop> IS NOT NULL)` clause is also unqualified
([query_helpers.ts:505](server/server_only_funcs_presentation_objects/query_helpers.ts#L505)).

## Proposed fix

In `buildAggregateColumns`, qualify every value-prop reference with
`sourceTable` (value props are by definition results-table columns; the
`AS <prop>` aliases keep output column names unchanged):

```ts
const valueColumns = values.map((valueObj) => {
  const qualified = `${sourceTable}.${valueObj.prop}`;
  if (valueObj.func === "identity") {
    return mode === "rollup"
      ? `SUM(${qualified}) AS ${valueObj.prop}`
      : `${qualified} AS ${valueObj.prop}`;
  }
  return `${valueObj.func.toUpperCase()}(${qualified}) AS ${valueObj.prop}`;
});
```

And in `buildSampleNColumns`, qualify the filter clause:

```ts
`(${distinctFacilities} FILTER (WHERE ${sourceTable}.${valueObj.prop} IS NOT NULL))::int AS ${sampleNProp(valueObj.prop)}`
```

Notes:

- Both `buildMainQuery` and `buildRollupQuery` feed `buildSelectQuery`,
  whose FROM is always `FROM ${sourceTable} [LEFT JOIN … f]` — so
  `sourceTable` is in scope at every consumption site of these strings.
- Identity value props also appear bare in GROUP BY
  (`extraGroupByColumns`); left as-is deliberately: identity + facility
  join cannot co-occur (identity metrics are pre-aggregated ICEH, which
  has no facility data). Qualify there too only if that ever changes.
- The post-aggregation wrapper re-projects the inner query's ALIASED
  columns, so qualification inside the inner aggregates does not affect it.

## Verification

1. `deno task typecheck`
2. `./validate_queries` (52 cases — generated SQL changes textually, so any
   snapshot-pinned case must be reviewed, not blindly re-pinned)
3. Add a query-rig case: facility-column disaggregation of a metric whose
   value prop is `facility_id` (the Ghana shape; the corpus currently
   lacks it — that's why dev never caught this)
4. Ship in 1.66.4+, then re-run the Ghana rig: the 22 both_errors should
   become ok CHECKS THAT ACTUALLY COMPARE (both engines now succeed), which
   is stronger than green-by-classification.

## Status

- 2026-08-10: found, diagnosed, fix drafted (was applied then reverted —
  ruled app-code changes need Tim's sign-off first). Ghana is deployed,
  backfilled, serving; its RED is fully explained by this one defect.
