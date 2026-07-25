# PLAN: Missing Values as a First-Class Filter/Disaggregation Option

The possible-values query strips NULL and blank before returning options, while
the data query keeps them as a real group. A dimension whose rows are partly
missing therefore renders a group in the chart that the filter cannot name — and
when the missing rows outnumber the named ones, the filter silently hides
itself.

## The defect

[get_possible_values.ts:252-254](server/server_only_funcs_presentation_objects/get_possible_values.ts#L252-L254)
drops the values after the SQL has already returned them:

```ts
const rawValues = results
  .map((opt) => opt.disaggregation_value)
  .filter((v) => v != null && String(v).trim() !== "");
```

The SQL is correct — `SELECT DISTINCT col …` returns the NULL/blank row. The
strip is a post-processing decision, and nothing downstream shares it:
[buildSelectQuery](server/server_only_funcs_presentation_objects/query_helpers.ts#L172-L175)
emits a bare `GROUP BY col`, so the missing rows are a genuine group in the
fetched items.

Verified on `ro_m10_hfa_results_csv.hfa_category` (project `39b790d8…`):

| | result |
|---|---|
| `SELECT DISTINCT hfa_category` | 4 rows: `''`, infrastructure, medical_supplies, services |
| options served to the client | 3 — blank stripped |
| `GROUP BY hfa_category` | `''`=844, infrastructure=1214, medical_supplies=11968, services=7182 |

### Three severities

1. **≥2 named values + missing.** The filter renders, but the missing group is
   unselectable. Worse, ticking every visible option is not the no-op it looks
   like — it drops those rows and moves the totals.
2. **1 named value + missing.** Options length 1 →
   [getSingleValueDimsFromPossibleValues](lib/normalize_po_config.ts#L154-L166)
   marks the dimension single-valued →
   [presentation_object_editor_panel_data.tsx:68](client/src/components/visualization/presentation_object_editor_panel_data.tsx#L68)
   strips it from `allowedFilterOptions`. No filter at all, and it also
   disappears from the disaggregation picker.
3. **All missing.** Zero options → `no_values_available` → the dimension is
   dropped outright at
   [presentation_object_editor_panel_data.tsx:43-46](client/src/components/visualization/presentation_object_editor_panel_data.tsx#L43-L46).

The client gates are all correct given their input. The input is wrong.

The two `singleValueDims` derivations already disagree about this, which is the
tell: the post-fetch
[getSingleValueDimsFromItems](lib/normalize_po_config.ts#L138-L150) counts
distinct values over fetched rows, so it *does* see the missing group; the
pre-fetch one does not. Same question, two answers.

### Both NULL and blank occur

Blank-string is what the R-generated results tables carry (`hfa_category`,
`hfa_service_category`, `iceh_indicators.denominator`, `facilities_hfa
.facility_type`). True NULLs arrive by a second route the stored columns don't
show: facility disaggregators are read through
`LEFT JOIN facility_subset f` ([get_possible_values.ts:203](server/server_only_funcs_presentation_objects/get_possible_values.ts#L203)),
so an `ro_*` row whose `facility_id` has no match yields NULL for
`f.facility_type` even when that column contains no NULLs at all. Any fix must
treat the two identically.

## Fix

Fold NULL and blank into one sentinel, on the same pattern as `ROLLUP_SENTINEL`
([lib/admin_area_rollup.ts:21](lib/admin_area_rollup.ts#L21)).

### 1. The sentinel

`MISSING_SENTINEL = "__MISSING"` in lib, beside `ROLLUP_SENTINEL`. Uppercase,
so it survives the `UPPER()` comparison path unchanged. It carries the same
theoretical collision exposure as `ROLLUP_SENTINEL` — a literal `__MISSING` in
source data — which we accept on the same grounds.

A shared helper emits the SQL expression, so the three sites that need it cannot
drift:

```sql
COALESCE(NULLIF(btrim(<col>), ''), '__MISSING')
```

Applies to text disaggregation columns only. Excluded: `INTEGER_FILTER_COLUMNS`
(`year`, `quarter_id`, `period_id` — integers, no missing case) and the
period-derived columns from the period CTE.

### 2. Options list

Replace the strip in `getPossibleValues` with the wrapped `columnRef`, so the
DISTINCT returns the sentinel directly. NULL and blank can co-exist in one
column, so they collapse to a single row rather than needing a JS dedup.

`id` is the sentinel; `label` stays the sentinel too — display text is resolved
client-side (see 5). The metric-info payload is Valkey-cached and language is a
client concern, so a translated string must not be frozen into the cache.

### 3. Filter WHERE clause

[buildWhereClause](server/server_only_funcs_presentation_objects/query_helpers.ts#L196-L233)
partitions `filter.values` into sentinel and non-sentinel. Non-sentinel keeps
today's `UPPER(col) IN (…)`; the sentinel contributes its own predicate,
OR-ed:

```sql
(UPPER(col) IN ('A','B') OR col IS NULL OR btrim(col) = '')
```

Sentinel-only selections emit just the right-hand side. This is the reason the
fix cannot be options-list-only: `NULL IN ('')` is NULL, so no `IN` list can
ever match a NULL row.

### 4. Fetch SELECT and GROUP BY

`buildSelectQuery` applies the same wrapping to grouped text columns, in both
the SELECT and the GROUP BY. They must match — grouping on the raw column while
selecting the wrapped one would split NULL and blank into two rows that then
carry identical keys.

`buildAdminAreaRollupQuery` composes with this: the collapsed level is replaced
by `ROLLUP_SENTINEL`, and the remaining grouped admin levels are text columns
that need wrapping like any other.

This is what makes the item key, the option id, and the filter value one id
space. Without it the filter would work while the chart still keyed the group on
`''`/`null`.

### 5. Display

The sentinel needs a label at two sites:

- Filter/replicant option chips —
  [_2_filters.tsx:536-539](client/src/components/visualization/presentation_object_editor_panel_data/_2_filters.tsx#L536-L539)
  maps `{id, label}` straight through, so it needs the sentinel resolved.
- Chart axis/series labels —
  [buildLabelReplacements](client/src/generate_visualization/get_data_config_from_po.ts#L49-L72),
  which already special-cases both `ROLLUP_SENTINEL` and
  `LEGACY_ROLLUP_SENTINEL`.

Label: `{ en: "(Missing)", fr: "(Manquant)", pt: "(Em falta)" }`.

Map the legacy raw forms — `""` and `"null"` — to the same label alongside the
sentinel, exactly as `LEGACY_ROLLUP_SENTINEL` is handled. That is what lets
already-stored figures keep rendering correctly without a forced sweep (see
Persistence).

## Persistence

Three layers, per the standing rule that a shape change must enumerate all of
them:

- **DB JSON (PO configs)** — no migration. Blank was never offered as an option,
  so no stored `filterBy` entry can contain one. Nothing to rewrite.
- **Valkey** — required bump. `PO_CACHE_VERSION`
  ([server/routes/caches/visualizations.ts:27](server/routes/caches/visualizations.ts#L27))
  `"5"` → `"6"`. Both the metric-info payload (new option id) and the items
  payload (new group key) change shape, and version hashes track row
  `last_updated`, not code — without the bump, unmodified rows keep serving
  old-shape payloads.
- **Stored FigureInputs** — no forced sweep, *provided* step 5's legacy mapping
  lands. Old grids keep their `""`/`null` keys and still label as "(Missing)".
  If that mapping is dropped, this becomes a slide_config force block.

## Out of scope — decide separately

`hfa_service_category` is multi-membership and filter-only
([lib/validate_fetch_config.ts:116-123](lib/validate_fetch_config.ts#L116-L123)).
Its options come from `unnest(string_to_array(col, '|'))`, and Postgres gives
`string_to_array('', '|') = {}` — verified, along with `unnest(NULL)` returning
zero rows. So blanks vanish from its options regardless of the JS strip, and the
20573-of-21208 blank rows in `ro_m10_hfa_results_carried_csv` are silently
excluded by any service-category filter.

Whether "belongs to no service category" should be selectable is a modelling
question, not a bug fix: it needs a synthetic member in a set-membership
vocabulary, which is a different change from folding a missing scalar. Left
alone here.

Also unchanged: the R generators, the sentinel-classification work in
[PLAN_1_HFA_COMPOSITE_MISSINGNESS.md](PLAN_1_HFA_COMPOSITE_MISSINGNESS.md) (HFA
don't-know/refusal codes, a separate notion of missing), and the AI filter-value
validator at
[content_validators.ts:184](client/src/components/project_ai/ai_tools/validators/content_validators.ts#L184)
— it validates against `disaggregationPossibleValues` ids, so the sentinel
becomes valid there for free.

## Verification

- `hfa_category` on `ro_m10_hfa_results_csv`: options list returns 4 entries
  including the sentinel; filtering to the sentinel alone returns 844 rows;
  filtering to all four returns 21208.
- A facility disaggregator over a results table with an unmatched `facility_id`
  — the LEFT JOIN NULL path — folds to the same sentinel as a blank string, and
  a mixed NULL+blank column yields exactly one sentinel option, not two.
- Severity 2 regression: a dimension with one named value plus missing now
  renders a filter (and appears in the disaggregation picker) instead of being
  treated as constant.
- `getSingleValueDimsFromPossibleValues` and `getSingleValueDimsFromItems` agree
  on such a dimension — neither reports it single-valued.
- Roll-up interaction: `includeAdminAreaRollup` with a blank-bearing
  `admin_area_3` grouped alongside the collapsed level — both sentinels coexist,
  no duplicate rows.
- An integer disaggregator (`year`) and a period column are untouched — no
  `btrim` on an integer column.
- A figure stored before the change still renders its missing group as
  "(Missing)" after it.
