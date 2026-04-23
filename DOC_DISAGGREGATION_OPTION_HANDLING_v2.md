# Disaggregation Option Handling

How disaggregation options work across the system — from declaration in module definitions, through enrichment, possible-values fetch, filter/disaggregate UI, and into visualization rendering.

Related: [DOC_period_column_handling.md](DOC_period_column_handling.md) covers the time-period sub-category in detail (period_id / quarter_id / year / month). This doc covers everything else and the overall pipeline.

## Table of Contents

- [Mental model](#mental-model)
- [Config states and normalization](#config-states-and-normalization)
- [The canonical list and categories](#the-canonical-list-and-categories)
- [Type layout](#type-layout)
- [Declaration (module definitions)](#declaration-module-definitions)
- [Enrichment (what's available for this metric?)](#enrichment-whats-available-for-this-metric)
  - [Physical columns on the RO table](#physical-columns-on-the-ro-table)
  - [Facility-column gating](#facility-column-gating)
  - [Time columns](#time-columns)
  - [`allowedPresentationOptions`](#allowedpresentationoptions)
- [Possible values (what values can this disagg take?)](#possible-values-what-values-can-this-disagg-take)
- [Filter vs disaggregate vs replicant](#filter-vs-disaggregate-vs-replicant)
- [Display-option mapping (`disDisplayOpt`)](#display-option-mapping-disdisplayopt)
- [Query pipeline](#query-pipeline)
- [Labels](#labels)
- [Value label replacements](#value-label-replacements)
- [Single-value stripping](#single-value-stripping)
- [Admin area specifics](#admin-area-specifics)
- [Cross-checks and validation](#cross-checks-and-validation)
- [Type-switch behavior](#type-switch-behavior)
- [End-to-end example](#end-to-end-example)
- [Debugging / common pitfalls](#debugging--common-pitfalls)
- [Known inconsistencies](#known-inconsistencies)

---

## Mental model

A **disaggregation option** is a dimension by which a metric's values can be split (e.g. by admin area, by indicator, by time period, by facility type).

Each dimension is either **available** (column exists, config enables it) or **not available** (column missing or config disables it). When available, it can participate as:

- A **filter** (`config.d.filterBy`) — restricts data to specific values
- A **disaggregation** (`config.d.disaggregateBy`) — splits visualization along this dimension  
- **Both simultaneously** — filter to a subset, then split across remaining values

**One dimension is special**: the dimension with `disDisplayOpt === "replicant"` isn't drawn inside one figure — it produces *separate* figures, one per value.

---

## Config states and normalization

A `PresentationObjectConfig` exists in three conceptual states as it flows through the system:

| State | Description | Characteristics |
|-------|-------------|-----------------|
| **UI Config** | Raw user edits in the editor | May have transient invalid states (e.g., filter enabled but no values selected) |
| **Storage Config** | Normalized for persistence | Passes Zod validation; structurally valid |
| **Effective Config** | Ready for display/validation | Strips semantically redundant disaggregators |

### Why three states?

The UI allows intermediate states that shouldn't be persisted (a filter checkbox checked but no values selected). Storage requires valid data. Display requires awareness of what's *actually* disaggregatable (a disaggregator filtered to one value is invisible).

### Normalization functions

**File**: [lib/normalize_po_config.ts](lib/normalize_po_config.ts)

```
UI Config → normalizeConfigForStorage() → Storage Config
                                               ↓
                              getEffectiveConfig() → Effective Config
```

**`normalizeConfigForStorage(config)`**

Called before save (client-side for immediate UX, server-side as defense in depth). Removes structurally invalid entries:

- `filterBy` entries with empty `values` arrays (would fail Zod `.min(1)`)
- `valuesFilter` if empty array (would fail Zod `.min(1).optional()`)

Does NOT strip disaggregators — user's display option preferences are preserved.

**`getEffectiveConfig(config)`**

Called before display/validation. Strips disaggregators that are semantically invisible:

- Any `disaggregateBy` entry where `filterBy` has exactly one value for the same `disOpt`

Used by:
- `hasDuplicateDisaggregatorDisplayOptions()` — prevents false "duplicate display option" errors
- Editor UI `allowedDisaggregationOptions()` — hides single-value disaggregators
- Renderer — combined with runtime dateRange stripping

### Data flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ EDITOR                                                                      │
│                                                                             │
│   tempConfig (UI state)                                                     │
│        │                                                                    │
│        ├──► getEffectiveConfig() ──► hasDuplicateDisaggregatorDisplayOptions()
│        │                                                                    │
│        └──► normalizeConfigForStorage() ──► server save                     │
└─────────────────────────────────────────────────────────────────────────────┘
                                                    │
                                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ SERVER                                                                      │
│                                                                             │
│   normalizeConfigForStorage() ──► Zod validation ──► DB                     │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│ RENDERER                                                                    │
│                                                                             │
│   config (from DB)                                                          │
│        │                                                                    │
│        └──► getEffectiveConfig() ──► + runtime dateRange stripping          │
│                                             │                               │
│                                             └──► effectiveConfig            │
│                                                       │                     │
│                                                       └──► data config builders
└─────────────────────────────────────────────────────────────────────────────┘
```

### Why not strip disaggregators from storage?

If we stripped single-value disaggregators before saving, the user would lose their `disDisplayOpt` preference (e.g., "row") when the filter is removed. By keeping them in storage, preferences persist.

---

## The canonical list and categories

The full union of disaggregation option values lives in [lib/types/disaggregation_options.ts](lib/types/disaggregation_options.ts) as `DisaggregationOption` (re-exported from `presentation_objects.ts`). The runtime list `ALL_DISAGGREGATION_OPTIONS` and Zod validator are in the same file.

Grouped by semantic category:

| Category | Values | Source |
|----------|--------|--------|
| **Admin area (spatial)** | `admin_area_2`, `admin_area_3`, `admin_area_4` | RO table column (physical) |
| **Time** | `period_id`, `quarter_id`, `year`, `month` | RO table column, sometimes derived (see [DOC_period_column_handling.md](DOC_period_column_handling.md)) |
| **Indicator** | `indicator_common_id`, `source_indicator`, `target_population`, `ratio_type` | RO table column (physical) |
| **Denominator** | `denominator`, `denominator_best_or_survey` | RO table column (physical) |
| **Facility** | `facility_name`, `facility_type`, `facility_ownership`, `facility_custom_1` through `facility_custom_5` | RO table has `facility_id`; values resolved via JOIN to `facilities` table; gated by instance config |
| **HFA** | `hfa_indicator`, `hfa_category`, `time_point` | HFA-dataset-specific RO columns |

No single enum/union encodes the category — it's structural. Code that cares (enricher, possible-values query, facility-gating logic) uses explicit `if`/`in` tests.

---

## Type layout

**`DisaggregationOption`** — [lib/types/disaggregation_options.ts](lib/types/disaggregation_options.ts). The union of all disOpt string literals. `facility_name` and its siblings come in via `OptionalFacilityColumn` ([lib/types/instance.ts](lib/types/instance.ts)).

**`ResultsValue.disaggregationOptions[]`** — [lib/types/module_definitions.ts](lib/types/module_definitions.ts). The enriched runtime shape:

```ts
disaggregationOptions: {
  value: DisaggregationOption;
  isRequired: boolean;
  allowedPresentationOptions?: PresentationOption[];
}[];
```

There is no `label` field on enriched disOpts — display labels are computed at render time from config via [lib/disaggregation_labels.ts](lib/disaggregation_labels.ts).

**`PresentationObjectConfig.d`** — [lib/types/_presentation_object_config.ts](lib/types/_presentation_object_config.ts). The three fields that reference disOpts:

```ts
disaggregateBy: { disOpt: DisaggregationOption; disDisplayOpt: DisaggregationDisplayOption }[];
filterBy:       { disOpt: DisaggregationOption; values: (string | number)[] }[];
selectedReplicantValue?: string;  // value of whichever disOpt has disDisplayOpt === "replicant"
```

**`DisaggregationDisplayOption`** — [lib/types/_metric_installed.ts](lib/types/_metric_installed.ts). Where in the visualization this dimension is drawn:

```ts
"row" | "rowGroup" | "col" | "colGroup" | "series" | "cell" | "indicator" | "replicant" | "mapArea"
```

**`DisaggregationPossibleValuesStatus`** — [lib/types/presentation_objects.ts](lib/types/presentation_objects.ts). The per-disOpt status returned from the possible-values fetch:

```ts
| { status: "ok"; values: string[] }
| { status: "too_many_values" }
| { status: "no_values_available" }
```

**`ResultsValueInfoForPresentationObject.disaggregationPossibleValues`** — [lib/types/presentation_objects.ts](lib/types/presentation_objects.ts). A dictionary keyed by `DisaggregationOption` mapping to the status above. This is what the editor UI consults to decide which filters/disaggs to render.

---

## Declaration (module definitions)

Module authors declare each metric's **required** disaggregations as an array of string values (no metadata):

```ts
requiredDisaggregationOptions: DisaggregationOption[]
```

Declared in [lib/types/module_definition_validator.ts](lib/types/module_definition_validator.ts). Persisted in the project DB as a JSON array string in the `metrics.required_disaggregation_options` column.

Module definitions do **not** declare *optional* disaggregations — those are inferred entirely from which columns exist on the RO table plus instance config. An author's only lever is which columns to produce in the R script output.

**Author-facing rules**:

- Produce a CSV column for every dimension you want disaggregable. Do not produce derived columns (year if you have period_id, etc.) — the importer drops them.
- For facility-level data, produce only `facility_id` — facility attributes (type, ownership, custom_N) are looked up server-side via JOIN to the project `facilities` table, not stored on the RO table.
- For admin area, produce `admin_area_2`/`3`/`4` columns only at the level your data actually supports. Producing `admin_area_4` on a table that's aggregated to `admin_area_2` means `admin_area_3` and `admin_area_4` will be NULL or spurious.

---

## Enrichment (what's available for this metric?)

**File**: [server/db/project/metric_enricher.ts](server/db/project/metric_enricher.ts) — `buildDisaggregationOptions()`.

For a given metric, the enricher constructs the runtime `disaggregationOptions[]` array fresh on each read (nothing persisted). It walks three independent gating phases:

### Physical columns on the RO table

For each of this fixed set —

```
admin_area_2, admin_area_3, admin_area_4,
indicator_common_id, denominator, denominator_best_or_survey,
source_indicator, target_population, ratio_type,
hfa_indicator, hfa_category, time_point
```

it calls `detectColumnExists(projectDb, tableName, disOpt)` ([server/db/utils.ts](server/db/utils.ts)). If the column exists on `ro_<resultsObjectId>`, the disOpt is added to the output.

This means admin area depth, denominator availability, HFA attributes, etc. are *discovered* by column probing — they are never declared by the module author at enrichment time.

### Facility-column gating

Two conjoined gates must both pass for a facility column to appear:

1. **RO table has `facility_id`** (via `detectColumnExists`). If absent, no facility disOpts are added.
2. **Instance config opts in** — `facilityConfig.includeTypes` for `facility_type`, `includeOwnership` for `facility_ownership`, `includeCustom1..5` for the customs. Labels (`labelTypes`, `labelCustom1`, …) are *not* consulted at enrichment; they're rendering concerns ([DOC_legacy_handling.md](DOC_legacy_handling.md) crosses over here).

Notably absent from this loop: `facility_name`. See [Known inconsistencies](#known-inconsistencies).

Facility values aren't stored on the RO table — they live on the project `facilities` table, and the query joins via `facility_id`. See [Possible values](#possible-values-what-values-can-this-disagg-take).

### Time columns

Priority-branched: `period_id` > `quarter_id` > `year`. If `period_id` exists, all four time disOpts (including derived ones) are added. If only `quarter_id`, just `quarter_id` + `year`. If only `year`, just `year`. Details in [DOC_period_column_handling.md](DOC_period_column_handling.md).

### `allowedPresentationOptions`

Each added disOpt gets an `allowedPresentationOptions` array:

- Time disOpts + `time_point`: `["table", "chart"]` — these are excluded from timeseries (time is the X-axis) and map viz.
- Everything else: `undefined` (meaning: allowed everywhere).

Consumed client-side by the editor's `allowedFilterOptions` / `allowedDisaggregationOptions` derivations and by [lib/convert_visualization_type.ts](lib/convert_visualization_type.ts) when switching viz types.

---

## Possible values (what values can this disagg take?)

**File**: [server/server_only_funcs_presentation_objects/get_possible_values.ts](server/server_only_funcs_presentation_objects/get_possible_values.ts).

For each disOpt in the enriched `disaggregationOptions[]`, a `SELECT DISTINCT` query runs against the RO table to discover the actual values present. This drives the filter-UI checkboxes and the disaggregate-UI panel.

Three query shapes, depending on the disOpt type:

1. **Physical column, non-facility** (admin_area_*, indicator_common_id, denominator, hfa_*, time_point, period_id, quarter_id, physical year): `SELECT DISTINCT col AS disaggregation_value FROM ro_table WHERE … ORDER BY col LIMIT 51`.

2. **Dynamic period column** (year/month/quarter_id derived from period_id or quarter_id): uses inline SQL expression like `(period_id / 100)::int` or wraps the RO table in a `WITH period_data AS (…)` CTE. See [DOC_period_column_handling.md#possible-values-disaggregation-checkboxes](DOC_period_column_handling.md#possible-values-disaggregation-checkboxes).

3. **Facility column**: the RO table is joined to a `facility_subset` CTE that selects just the enabled facility columns from `facilities`:

   ```sql
   WITH facility_subset AS (
     SELECT facility_id, facility_type, facility_ownership, facility_custom_1, …
     FROM facilities
   )
   SELECT DISTINCT f.facility_type AS disaggregation_value
   FROM ro_table
   LEFT JOIN facility_subset f ON ro_table.facility_id = f.facility_id
   WHERE …
   ```

   If dynamic period + facility both needed, both CTEs stack.

**LIMIT 51 (`MAX_REPLICANT_OPTIONS + 1`)**: if the query returns more than 50 distinct values, the status becomes `too_many_values` and the UI treats the disOpt as a freeform filter rather than checkbox list. The +1 is just to detect overflow without fetching the full set.

**Filter context**: when computing possible values for disOpt X, any existing `config.d.filterBy` filters on *other* disOpts are included in the WHERE clause (the current disOpt is excluded). This lets a user's admin-area-2 choice shrink the list of admin-area-3 options accordingly.

**Empty/null filtering**: raw `null` and empty-string rows are filtered out of the returned list.

Values come back as raw strings with no label resolution. Display labels are applied client-side at render time — see [Labels](#labels) and [Value label replacements](#value-label-replacements).

---

## Filter vs disaggregate vs replicant

The three ways a disOpt participates in a visualization, each stored separately in `config.d`:

| Mechanism | Config field | Effect | UI component |
|-----------|--------------|--------|--------------|
| **Filter** | `filterBy: [{ disOpt, values }]` | WHERE clause — rows not matching are excluded from the query | [_2_filters.tsx](client/src/components/visualization/presentation_object_editor_panel_data/_2_filters.tsx) |
| **Disaggregate** | `disaggregateBy: [{ disOpt, disDisplayOpt }]` | Splits the data along this dimension within one figure — assigned to an axis (row/col/series/cell/…) | [_3_disaggregation.tsx](client/src/components/visualization/presentation_object_editor_panel_data/_3_disaggregation.tsx) |
| **Replicant** | `disaggregateBy: [{ disOpt, disDisplayOpt: "replicant" }]` + `selectedReplicantValue: string` | Produces separate figures, one per value. Only one disOpt can be the replicant at a time. | Same component, special `disDisplayOpt` slot |

A single disOpt can appear in **both** `disaggregateBy` and `filterBy` — filter to a subset of values, then split across the remaining ones.

The replicant logic is encoded in [lib/get_disaggregator_display_prop.ts](lib/get_disaggregator_display_prop.ts):

```ts
export function getReplicateByProp(config): DisaggregationOption | undefined {
  for (const dis of config.d.disaggregateBy) {
    if (dis.disDisplayOpt === "replicant") return dis.disOpt;
  }
  return undefined;
}
```

Single-replicant-per-viz is enforced by the UI (toggling another replicant clears the previous) not by the type or schema. See [Known inconsistencies](#known-inconsistencies).

**Required disaggregations** (from `metric.disaggregationOptions[].isRequired = true`) cannot be unchecked in `_3_disaggregation.tsx`. They are always in `disaggregateBy`. But the user still chooses the `disDisplayOpt` for each.

---

## Display-option mapping (`disDisplayOpt`)

**File**: [lib/types/presentation_objects.ts](lib/types/presentation_objects.ts) — `VIZ_TYPE_CONFIG` defines which display options each viz type supports, plus a fallback map for conversions.

| `disDisplayOpt` | timeseries | table | chart | map |
|---|:---:|:---:|:---:|:---:|
| `series` | ✓ | – | ✓ | – |
| `row` | ✓ | ✓ | ✓ | ✓ |
| `rowGroup` | – | ✓ | – | – |
| `col` | ✓ | ✓ | ✓ | ✓ |
| `colGroup` | – | ✓ | – | – |
| `cell` | ✓ | – | ✓ | ✓ |
| `indicator` | – | – | ✓ | – |
| `replicant` | ✓ | ✓ | ✓ | ✓ |
| `mapArea` | – | – | – | ✓ |

Semantic meaning per type (user-facing labels come from `get_DISAGGREGATION_DISPLAY_OPTIONS()`):

- **timeseries**: `series` = separate lines; `cell` = separate grids; `row`/`col` = small multiples.
- **table**: `row`/`col` = cell axes; `rowGroup`/`colGroup` = grouped headers.
- **chart**: `indicator` = bars along X axis; `series` = sub-bars; `cell` = separate grids.
- **map**: `mapArea` = region coloring; `cell`/`row`/`col` = small multiples.

**The reverse-lookup helper** — `getDisaggregatorDisplayProp()` in [lib/get_disaggregator_display_prop.ts](lib/get_disaggregator_display_prop.ts) — answers "which disOpt was assigned to a given display slot (e.g. `row`)?" The renderer calls this per axis to build the data config. A special return value `"--v"` means "show the value props here" rather than a disOpt (used when `valuesDisDisplayOpt` points to this axis *and* the metric has multiple value props).

**Required dedup**: the UI permits only one disOpt per `disDisplayOpt` slot. `hasDuplicateDisaggregatorDisplayOptions()` is checked before rendering. **Important**: this check must receive an *effective* config (via `getEffectiveConfig()`) so that single-value disaggregators are excluded — otherwise a hidden disaggregator can conflict with a visible one.

---

## Query pipeline

Three server-side concepts assemble the final SQL:

**`QueryContext`** ([server/server_only_funcs_presentation_objects/get_query_context.ts](server/server_only_funcs_presentation_objects/get_query_context.ts)) — precomputed per query:

- `hasPeriodId` / `hasQuarterId` — which time column exists
- `enabledFacilityColumns` — from instance `facilityConfig`
- `requestedOptionalFacilityColumns` — intersection of (groupBys ∪ filter-cols) with enabled facility columns
- `needsFacilityJoin` — whether to emit the `facility_subset` CTE + JOIN
- `neededPeriodColumns` / `needsPeriodCTE` — time derivation requirements ([DOC_period_column_handling.md](DOC_period_column_handling.md))

**`buildWhereClause()`** — integer columns (year, month, quarter_id, period_id, time_point) use `col IN (1, 2, …)`; text columns use `UPPER(col) IN ('FOO', 'BAR')` for case-insensitive matching.

**`buildSelectQueryV2()`** — assembles SELECT + JOIN + WHERE + GROUP BY. Facility columns get `f.` prefix when joined.

**`buildNationalTotalQueryV2()`** — emits a second query producing a "national aggregate" row/column when `config.d.includeNationalForAdminArea2` is set and the groupBys include `admin_area_2` but *not* `admin_area_3`. The national row is labelled with a sentinel admin_area_2 value (`__NATIONAL` or `zzNATIONAL`, controlling sort position), later replaced with the localized "National" string on the client.

This is the only place admin area level has hardcoded special-casing in the query layer — it's specifically scoped to `admin_area_2` because that's the highest-granularity spatial disaggregation (admin_area_1 being implicitly the country itself).

---

## Labels

Labels are pure config, computed at render time.

**Single source of truth**: [lib/disaggregation_labels.ts](lib/disaggregation_labels.ts) — `getDisaggregationLabel(disOpt, { adminAreaLabels, facilityColumns })`. Pure function. Handles all categories:

- Admin areas: custom label from `adminAreaLabels.label2/3/4` or default `"Admin area N"` / `"Unité administrative N"`.
- Facility columns: custom label from `facilityColumns.labelTypes`/`labelOwnership`/`labelCustom1..5` or hardcoded default.
- Time, indicator, denominator, HFA, etc.: hardcoded translatable strings.

**Client wrapper**: [client/src/state/instance/disaggregation_label.ts](client/src/state/instance/disaggregation_label.ts) closes over `instanceState` and exports `getDisplayDisaggregationLabel(disOpt)` — called in every JSX that displays a disOpt label (filters panel, disaggregation panel, metric details modal, add-visualization flow).

**Server-side caller**: [server/db/project/modules.ts](server/db/project/modules.ts) `getMetricsListForAI` calls `getDisaggregationLabel(opt.value, { adminAreaLabels, facilityColumns: facilityConfig }).en` directly when building the AI prompt.

**Why this matters**: labels are *not* baked into the data by the enricher. Changing an admin area label in settings immediately updates every open view without cache invalidation — the cached `ResultsValue` has no `label` field to go stale.

---

## Value label replacements

Distinct from disOpt labels. `ResultsValue.valueLabelReplacements: Record<string, string>` maps **value-prop keys** (not disaggregation values) to display labels — e.g. `{ "coverage": "Coverage rate", "target": "Target population" }`.

Loaded server-side (strings resolved to the instance's language). Applied client-side in [get_data_config_from_po.ts](client/src/generate_visualization/get_data_config_from_po.ts) as `labelReplacementsBeforeSorting`.

It does **not** rename disaggregation values (e.g. "M"→"Male" for a sex disaggregation). That mapping, if needed, lives elsewhere (indicator label lookups, admin area code→name lookups). Replacement sources for disaggregation values include:

- Indicator ID → indicator label: from the indicators table, fed into `labelReplacementsAfterSorting` as `indicatorLabelReplacements`.
- Admin area code → admin area name: from admin area label lookups.
- Date values → formatted period: `dateLabelReplacements`.
- `__NATIONAL` → localized "National" string.

All merged into `labelReplacementsAfterSorting` so sort order is based on raw values (stable) while display uses labels.

---

## Single-value stripping

A disaggregation that resolves to exactly one value is display-noise: it can't actually split anything. There are two stripping mechanisms:

### Static stripping (via `getEffectiveConfig`)

**File**: [lib/normalize_po_config.ts](lib/normalize_po_config.ts)

Strips disaggregators where `config.d.filterBy` has exactly one value for the same `disOpt`. This is purely config-based — no runtime data needed.

Used before:
- `hasDuplicateDisaggregatorDisplayOptions()` checks (prevents false conflicts)
- Editor UI `allowedDisaggregationOptions()` (hides single-value disaggregators)

### Runtime stripping (in renderer)

**File**: [client/src/generate_visualization/get_figure_inputs_from_po.ts](client/src/generate_visualization/get_figure_inputs_from_po.ts)

Adds runtime-aware stripping based on the actual data:

- All time columns when `dateRange.min === dateRange.max`
- `year` specifically when the dateRange spans a single year

The renderer starts with `getEffectiveConfig(config)`, then applies these runtime rules.

### Why two phases?

Static stripping handles filter-based single values (known from config alone). Runtime stripping handles data-based single values (only known after fetching). Both are needed for correct display.

---

## Admin area specifics

Three subtleties that don't apply elsewhere:

1. **`admin_area_1` is never a disaggregation option.** The top admin level is the country itself — always one value across an instance. Disaggregating by one-value dimensions is stripped everywhere (see above), so admin_area_1 would never survive the pipeline. It exists on the `facilities`/`admin_areas_1` tables but not in `DisaggregationOption`.

2. **"Include National" is admin_area_2-only.** The `config.d.includeNationalForAdminArea2` toggle adds a synthetic National aggregate row when disaggregating by admin_area_2 (without admin_area_3). Hardcoded to admin_area_2 because that's the level where "all above" is meaningful. Position (`top`/`bottom`) controlled by `config.d.includeNationalPosition`; encoded as `__NATIONAL` (sorts top) or `zzNATIONAL` (sorts bottom) sentinels at query time, resolved to the localized "National" string on the client.

3. **`maxAdminArea` instance config is not enforced at enrichment.** The instance-wide `maxAdminArea` setting controls structure import but not metric enrichment — if an RO table has an `admin_area_4` column, the disOpt appears regardless. Not a problem in normal flows (structure is consistent) but a latent gap.

---

## Cross-checks and validation

### Storage normalization

**Files**: 
- [lib/normalize_po_config.ts](lib/normalize_po_config.ts) — `normalizeConfigForStorage()`
- [client/src/components/visualization/visualization_editor_inner.tsx](client/src/components/visualization/visualization_editor_inner.tsx) — client-side call before save
- [server/db/project/presentation_objects.ts](server/db/project/presentation_objects.ts) — server-side call before Zod validation

Before Zod validation, the config is normalized to remove:
- `filterBy` entries with empty `values` arrays
- `valuesFilter` if empty

This prevents validation failures from transient UI states (e.g., filter checkbox checked but no values selected).

### AI-generated configs

[client/src/components/project_ai/ai_tools/validators/content_validators.ts](client/src/components/project_ai/ai_tools/validators/content_validators.ts):

- `validateFilters` / `validateAiMetricQuery` check that each `disOpt` in the AI's output is in `ALL_DISAGGREGATION_OPTIONS` and that it matches the metric's enriched `disaggregationOptions` list.
- `validateMetricInputs` fetches possible-values for each referenced disOpt and rejects filter values not in the available set.

### Editor UI

Silently doesn't render invalid disOpts. If `config.d.disaggregateBy` references a disOpt not in `metric.disaggregationOptions`, it simply doesn't draw — no error.

### No runtime config validator

No validator enforces the rules across the whole app. If a stored config references a disOpt that's since been removed from the metric (e.g. facility config was turned off), rendering silently omits it.

---

## Type-switch behavior

**File**: [lib/convert_visualization_type.ts](lib/convert_visualization_type.ts).

When the user switches viz types (e.g. chart → timeseries), `convertVisualizationType`:

1. **Drops** disOpts whose `allowedPresentationOptions` excludes the new type. E.g. `year` (allowed on `["table", "chart"]`) is removed when switching to timeseries.
2. **Adds** required disOpts that become allowed in the new type (pulled from `metric.disaggregationOptions` where `isRequired: true`).
3. **Remaps** `disDisplayOpt`s using `VIZ_TYPE_CONFIG[newType].disDisplayOptFallbacks` (e.g. `indicator → series` for timeseries, `rowGroup → row` for chart).
4. **Resolves collisions** — if two disOpts end up with the same `disDisplayOpt`, one is reassigned via `getNextAvailableDisaggregationDisplayOption`.

Not reset: `timeseriesGrouping` persists across switches ([DOC_period_column_handling.md#type-switching](DOC_period_column_handling.md#type-switching)), and user-chosen value-prop / display preferences.

---

## End-to-end example

A user opens a metric with required disaggregation `indicator_common_id`, builds a chart viz, and picks admin_area_2 as a replicant with filter to three regions.

**Module declaration**: metric's `requiredDisaggregationOptions: ["indicator_common_id"]`.

**R script output**: CSV with columns `period_id, admin_area_2, admin_area_3, indicator_common_id, facility_id, value`. Imports into `ro_abc123def`.

**Instance config**: `maxAdminArea: 4`, `facilityColumns: { includeTypes: true, includeOwnership: false, … }`, `adminAreaLabels: { label2: "Region" }`.

**Enrichment** ([metric_enricher.ts](server/db/project/metric_enricher.ts)):

- Probes `ro_abc123def` columns. Finds `admin_area_2`, `admin_area_3`, `indicator_common_id`, `period_id`, `facility_id`.
- Emits: `admin_area_2` (not required), `admin_area_3` (not required), `indicator_common_id` (required), `facility_type` (facility_id present + includeTypes true), `period_id` / `quarter_id` / `year` / `month` (all time disOpts, with `allowedPresentationOptions: ["table", "chart"]`).
- Does NOT emit `admin_area_4` (no column), `facility_ownership` (includeOwnership false), `facility_name` (not in the loop — see inconsistencies).

**Possible values fetch** (per disOpt, via [get_possible_values.ts](server/server_only_funcs_presentation_objects/get_possible_values.ts)):

- `admin_area_2` → `SELECT DISTINCT admin_area_2 FROM ro_abc123def` → 37 regions → `{ status: "ok", values: [...] }`.
- `facility_type` → JOIN to `facilities` → 6 types.
- `period_id` → 24 months → `{ status: "ok", values: [...] }`.

**User configures**:

```json
{
  "d": {
    "type": "chart",
    "disaggregateBy": [
      { "disOpt": "indicator_common_id", "disDisplayOpt": "indicator" },
      { "disOpt": "admin_area_2", "disDisplayOpt": "replicant" }
    ],
    "filterBy": [
      { "disOpt": "admin_area_2", "values": ["North", "South", "East"] },
      { "disOpt": "facility_type", "values": ["Clinic", "Hospital"] }
    ],
    "selectedReplicantValue": "North"
  }
}
```

**Save flow**:

1. Client calls `normalizeConfigForStorage(config)` — no changes needed (both filters have values).
2. Server receives config, calls `normalizeConfigForStorage()` again (defense in depth).
3. Zod validation passes.
4. Config stored in DB.

**Display label resolution** (client, at render time):

- Editor shows disaggregation "Region" (not "Admin area 2") because `instanceState.adminAreaLabels.label2 === "Region"`, via [disaggregation_label.ts](client/src/state/instance/disaggregation_label.ts).
- Filter checkbox shows "Region".

**Query execution**:

- `QueryContext`: `hasPeriodId=true`, `needsFacilityJoin=true` (facility_type in filterBy), `requestedOptionalFacilityColumns=["facility_type"]`, `needsPeriodCTE=false` (no year/month/quarter_id in groupBys or filters).
- `buildWhereClause`: `UPPER(admin_area_2) IN ('NORTH', 'SOUTH', 'EAST') AND UPPER(f.facility_type) IN ('CLINIC', 'HOSPITAL')`.
- `buildSelectQueryV2`: SELECT `admin_area_2, indicator_common_id, SUM(value)` … GROUP BY `admin_area_2, indicator_common_id`.
- Query returns 3 regions × N indicators worth of rows.

**Client render** (chart viz):

- `getFigureInputsFromPresentationObject` calls `getEffectiveConfig(config)` — no changes (no single-value filters).
- Applies runtime stripping — no changes (dateRange spans multiple periods).
- [get_data_config_from_po.ts](client/src/generate_visualization/get_data_config_from_po.ts) maps `indicator → indicatorProp`, generates N bars per region.
- Renders three separate figures (one per region from replicant), each with bars for each indicator.
- Caption substitutes `REPLICANT` token with the selected region name.

---

## Debugging / common pitfalls

### Disaggregation option missing that I expected

Four likely causes in order of probability:

1. **RO table doesn't have the column.** Check `information_schema.columns WHERE table_name = 'ro_…'`. If it's a time column you expected, re-check the R script CSV output.
2. **Facility config flag off.** Instance settings → Facility columns. Verify `includeTypes` etc. matches the disOpt you want.
3. **Column has no non-null values.** The enricher adds it, but `getPossibleValues` returns zero rows → status is `no_values_available` → editor UI hides it.
4. **Viz type restriction.** Time disOpts don't appear in timeseries or map; check `allowedPresentationOptions` on the metric detail modal.

### Filter checkboxes don't appear; instead there's a free-text input

The column has >50 distinct values. `status: "too_many_values"`. Either accept the free-text flow or add a more restrictive upstream filter to narrow the candidate set.

### "Duplicate display option" error with hidden disaggregator

If disaggregator A is on "row" and filtered to one value (making it invisible in the UI), adding disaggregator B on "row" should work — the duplicate check uses `getEffectiveConfig()` to strip single-value disaggregators. If you still see this error, ensure the duplicate check is receiving an effective config, not the raw config.

### A stored viz config references a disOpt no longer available

The viz silently omits it. No error, no warning. Common after facility-column-config changes. The only way to detect is to open the editor — the UI will show fewer options than the stored config claims.

### Admin area label didn't update live after changing in settings

Only the `getDisaggregationLabel` path updates live (via `instanceState`). If you're looking at something that uses a cached label (e.g. hardcoded "Admin area 2" in a string literal, or an old cached metric payload from before the label refactor), it will be stale. `grep` for hardcoded admin area strings to find.

### Facility disagg expected but missing when `facility_id` is clearly in the RO table

Verify the RO table actually has `facility_id` (rather than `facility_name` or something else). Verify the *specific* facility column flag is on (just `includeTypes=true` won't enable `facility_ownership` etc.).

### "Too many disaggregations" ambiguous error

`hasDuplicateDisaggregatorDisplayOptions` triggered — two disOpts both assigned the same `disDisplayOpt` (e.g. both set to `row`). Editor UI avoids producing this via `getNextAvailableDisaggregationDisplayOption`, so it usually indicates a bad saved config or an AI-generated config. Re-open in editor to clear.

### "Include National" toggle has no effect

Three required conditions:

1. `config.d.includeNationalForAdminArea2` is true
2. `config.d.disaggregateBy` (via groupBys) includes `admin_area_2`
3. `config.d.disaggregateBy` does NOT include `admin_area_3`

If any is false, the second national query doesn't run and no aggregate row appears.

### Viz renders, but data looks wrong at a specific admin area

The RO table stores `admin_area_2/3/4` as denormalized columns — not joined from `facilities`. If the module's R script computed admin areas incorrectly (e.g. aggregated to admin_area_2 but still carries admin_area_3 values from a join), the data will be wrong at that level. Distinguish from the facility case (where attributes *are* joined at query time).

---

## Known inconsistencies

Flagged during this doc's production — candidates for a cleanup pass:

1. **`facility_name` is dead in the enricher.** Present in the `DisaggregationOption` union via `OptionalFacilityColumn`, present in `ALL_DISAGGREGATION_OPTIONS`, present in the Zod validator, present in the facility columns config (`includeNames`, `labelNames`), *storable* in the facilities table — but the enricher's facility loop doesn't include it. It can never appear as a runtime disaggregation option.

2. **`maxAdminArea` is not enforced at enrichment.** The instance-wide `maxAdminArea` setting controls structure import but not metric enrichment — if an RO table has an `admin_area_4` column, the disOpt appears regardless. Not a problem in normal flows (structure is consistent) but a latent gap.

3. **Single-replicant-per-viz is UI-enforced, not type-enforced.** Nothing in `PresentationObjectConfig` prevents `disaggregateBy` from having multiple entries with `disDisplayOpt: "replicant"`. The UI clears prior replicants when toggling a new one, but a bad config could land this state.

4. **Stale disOpts in saved configs fail silently.** If an admin changes `facilityColumns.includeTypes` to false, every saved viz that referenced `facility_type` silently drops it on next render. No user notification, no visible diff. A health-check / stale-config surface area would help.

5. **`ALL_DISAGGREGATION_OPTIONS` as `readonly string[]`** loses the `DisaggregationOption` narrow type — callers iterating it get `string`, not the union. Could be `readonly DisaggregationOption[]` with a `satisfies` check to keep sync.

6. **Three parallel sources of truth for the disOpt list** — the TS union, the runtime array, the Zod enum. Easy to add one without the others. Consolidating into one source (derive the others) would eliminate drift risk.

7. **`getPossibleValues` error path**: failure returns `{ success: false, err }` but upstream (`getResultsObjectVariableInfoCore`) treats the error by skipping the disOpt (setting no status). The UI then doesn't render a filter for it — same visual outcome as `no_values_available` but with different root cause. A distinction might help debugging (e.g. SQL error surfaced via toast).

These are surfaced for triage into a follow-up plan — none are blocking bugs.