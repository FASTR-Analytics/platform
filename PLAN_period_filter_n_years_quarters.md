# Plan: Last N Full Calendar Years / Quarters Period Filter

## Prerequisites

Implement PLAN_period_column_handling.md steps 1-8 first. That plan establishes `hasQuarterId` in QueryContext, fixes the server-side period infrastructure, and defers client-side UI changes to this plan.

## Goal

Replace the singular "Last full calendar year" and "Last full calendar quarter" UI options with "Last N full calendar years" and "Last N full calendar quarters". Keep old filterType values working for backwards compat — in the UI, auto-map them to the new N-based options with N=1.

## Files to change

### 1. `lib/types/presentation_objects.ts` (line 96)

Add `"last_n_calendar_years"` and `"last_n_calendar_quarters"` to the `filterType` union. Add `nYears?: number` and `nQuarters?: number` fields. Keep old values in the union for backwards compat.

```typescript
export type PeriodFilter = {
  filterType?:
    | "last_n_months"
    | "from_month"
    | "last_calendar_year"
    | "last_calendar_quarter"
    | "last_n_calendar_years"
    | "last_n_calendar_quarters"
    | "custom";
  nMonths?: number;
  nYears?: number;
  nQuarters?: number;
} & PeriodBounds;
```

### 2. `lib/get_fetch_config_from_po.ts`

#### 2a. Resolution logic (line 81) — helper extraction + new filterTypes

Extract two helpers from the existing inline logic:

- `getLastFullYearBounds(periodBounds)` → `{ min, max }` — pulled from the existing `last_calendar_year` branch (lines 148-200). Calls `getCalendar()` internally (already imported at line 19). Returns the last full year's start/end period IDs without returning from the outer function.
- `getLastFullQuarterBounds(periodBounds)` → `{ min, max }` — pulled from the existing `last_calendar_quarter` branch (lines 202-256). Same pattern.

Existing `last_calendar_year` and `last_calendar_quarter` cases call the helpers and return directly (same behavior as today).

**Defensive guard (bug fix)**: Add a single guard before all calendar-based branches. Currently `last_calendar_year` is reachable with `quarter_id` periodOption, which produces garbage. Fix with one check covering all four calendar filter types:

```typescript
if (
  periodBounds.periodOption === "quarter_id" &&
  (periodFilter.filterType === "last_calendar_year" ||
   periodFilter.filterType === "last_calendar_quarter" ||
   periodFilter.filterType === "last_n_calendar_years" ||
   periodFilter.filterType === "last_n_calendar_quarters")
) {
  return periodBounds;
}
```

Place this before the `last_n_months` branch (after the `year` early-return at line 112). This returns unfiltered bounds as a safe fallback — the UI changes in section 4 prevent new POs from reaching this state.

New cases:

**`last_n_calendar_years`** (nYears defaults to 1):

- `const nYears = periodFilter.nYears ?? 1;`
- Validation: `if (nYears < 1 || nYears > 10) throw new Error(...)` (matches existing `nMonths` guard at line 117)
- Call `getLastFullYearBounds(periodBounds)` to get `{ min, max }`
- If nYears === 1, return directly (same as `last_calendar_year`)
- Otherwise, extend `min` backward: `const startTime = getTimeFromPeriodId(bounds.min, "year-month"); const extendedMin = getPeriodIdFromTime(startTime - (nYears - 1) * 12, "year-month");`
- Return `{ periodOption: periodBounds.periodOption, min: extendedMin, max: bounds.max }`

**`last_n_calendar_quarters`** (nQuarters defaults to 1):

- `const nQuarters = periodFilter.nQuarters ?? 1;`
- Validation: `if (nQuarters < 1 || nQuarters > 20) throw new Error(...)`
- Call `getLastFullQuarterBounds(periodBounds)` to get `{ min, max }`
- If nQuarters === 1, return directly (same as `last_calendar_quarter`)
- Otherwise, extend `min` backward: `const startTime = getTimeFromPeriodId(bounds.min, "year-month"); const extendedMin = getPeriodIdFromTime(startTime - (nQuarters - 1) * 3, "year-month");`
- Return `{ periodOption: periodBounds.periodOption, min: extendedMin, max: bounds.max }`

**Math verified**:

- Ethiopian year 201611-201710, N=2: `getTimeFromPeriodId(201611)=1402`, `1402-12=1390`, `getPeriodIdFromTime(1390)=201511`. Correct.
- Gregorian year 201601-201612, N=3: `getTimeFromPeriodId(201601)=1392`, `1392-24=1368`, `getPeriodIdFromTime(1368)=201401`. Correct.
- Gregorian quarter 201601-201603, N=3: `getTimeFromPeriodId(201601)=1392`, `1392-6=1386`, `getPeriodIdFromTime(1386)=201507`. Covers Q3'15, Q4'15, Q1'16. Correct.
- Ethiopian quarter 201602-201604, N=2: `getTimeFromPeriodId(201602)=1393`, `1393-3=1390`, `getPeriodIdFromTime(1390)=201511`. Covers Eth Q1 (11-1) + Q2 (2-4). Correct.

**No clamping**: If N exceeds the available data range, the extended `min` will be before `periodBounds.min`. This is correct — the SQL query returns whatever data exists in that range, same as "custom" filter with a min before the data start.

#### 2b. Hash function (line 287) — fix cache collision bug

`hashFetchConfig` currently hashes `filterType` and `nMonths` but NOT `nYears` or `nQuarters`. Two POs with `last_n_calendar_years` but different N values would produce identical hashes → stale cached data.

Fix: add two lines after the existing `nMonths` line (line 288):

```typescript
fc.periodFilter?.filterType ?? "",
fc.periodFilter?.nMonths?.toString() ?? "",
fc.periodFilter?.nYears?.toString() ?? "",      // ADD
fc.periodFilter?.nQuarters?.toString() ?? "",    // ADD
fc.periodFilter?.periodOption ?? "",
```

### 3. `lib/types/module_definition_validator.ts` (line 116) — SKIP FOR NOW

The zod enum at line 116 validates `filterType` values in PO configs embedded in module definition JSON. No module definition currently uses the new filter types, so adding them is premature. Revisit when `defaultPeriodFilterForDefaultVisualizations` is extended to support these types.

### 4. `client/src/components/visualization/presentation_object_editor_panel_data/_2_filters.tsx`

**RadioGroup options (line 183) — restructure from 2-way to 3-way branch:**

Currently a binary ternary using `p.resultsValueInfo.periodBounds?.periodOption === "year"`. The else branch shows `last_calendar_year` for BOTH `period_id` and `quarter_id` (pre-existing bug). Change to three branches using `p.keyedPeriodBounds.periodOption` (guaranteed non-null, avoids optional chaining):

- `"year"` → `["last_n_months", "custom"]` (unchanged)
- `"period_id"` → `["last_n_months", "from_month", "last_n_calendar_years", "last_n_calendar_quarters", "custom"]`
- `"quarter_id"` → `["last_n_months", "from_month", "custom"]` (no calendar options)

**Radio labels** for the new options:

- `last_n_calendar_years`: `t3({ en: "Last N full calendar years", fr: "Dernières N années civiles complètes" })`
- `last_n_calendar_quarters`: `t3({ en: "Last N full calendar quarters", fr: "Derniers N trimestres civils complets" })`

**RadioGroup value (line 181) — backwards compat mapping:**

The RadioGroup reads `value={p.tempConfig.d.periodFilter?.filterType}`. If an existing PO has `filterType === "last_calendar_year"`, that value won't match any radio option (since the option is now `"last_n_calendar_years"`), and NO radio button will be checked. Fix by computing a mapped value:

```typescript
const displayFilterType = () => {
  const ft = p.tempConfig.d.periodFilter?.filterType;
  if (ft === "last_calendar_year") return "last_n_calendar_years";
  if (ft === "last_calendar_quarter") return "last_n_calendar_quarters";
  return ft;
};
```

Pass `value={displayFilterType()}` to the RadioGroup. Plain function (not IIFE or `createMemo`) — Solid tracks the store reads when called within JSX. No caching needed for a simple string mapping.

**onChange handler (line 217) — set defaults via two separate store calls:**

SolidJS path-based store setters set one leaf at a time. When user selects a new filterType, use two calls:

```typescript
onChange={(v) => {
  p.setTempConfig("d", "periodFilter", "filterType", v as ...);
  if (v === "last_n_calendar_years") p.setTempConfig("d", "periodFilter", "nYears", 1);
  if (v === "last_n_calendar_quarters") p.setTempConfig("d", "periodFilter", "nQuarters", 1);
}}
```

Update the `as` type assertion to include `"last_n_calendar_years" | "last_n_calendar_quarters"`.

**New sub-selectors — two new components:**

- `NYearsSelector`: Same pattern as `NMonthsSelector` (lines 549-586) — local `createSignal`, slider (min=1, max=10), save button. Receives `nYears: number | undefined` (defaults to 1), calls `onUpdate(nYears)`. Define after `NMonthsSelector` (after line 586).
- `NQuartersSelector`: Same pattern — slider (min=1, max=20). Receives `nQuarters: number | undefined` (defaults to 1). Define after `NYearsSelector`.

Place `displayFilterType` at the top of the `PeriodFilter` component body, before the return. It uses optional chaining (`p.tempConfig.d.periodFilter?.filterType`) so it's safe when periodFilter is undefined.

Show conditions (using `p.tempConfig.d.periodFilter?.filterType` from the store, NOT the display-mapped value):

- Show `NYearsSelector` when `filterType === "last_n_calendar_years" || filterType === "last_calendar_year"`
- Show `NQuartersSelector` when `filterType === "last_n_calendar_quarters" || filterType === "last_calendar_quarter"`

The `onUpdate` callback writes:

- `NYearsSelector.onUpdate`: `setTempConfig("d", "periodFilter", "filterType", "last_n_calendar_years")` then `setTempConfig("d", "periodFilter", "nYears", nYears)` — this migrates old `last_calendar_year` to the new filterType on first interaction.
- `NQuartersSelector.onUpdate`: same pattern with `"last_n_calendar_quarters"` and `nQuarters`.

### 5. `client/src/components/visualization/edit_common_properties_modal.tsx` (line 100)

Same changes as _2_filters.tsx with these differences:

- Uses local store `tempPeriodFilter` / `setTempPeriodFilter` instead of `p.setTempConfig("d", "periodFilter", ...)`.
- `displayFilterType` references `tempPeriodFilter.filterType` (no optional chaining — store is always defined). Place inside component body before the return.
- 3-way branch uses `keyedBounds.periodOption` (available inside the `<Show when={...} keyed>` block, guaranteed non-null).
- `last_calendar_quarter` was never present here (not even commented out), but the backwards compat `displayFilterType` mapping should still handle it in case a PO with that filterType is opened via this modal.
- N selectors use inline Slider (no save button) matching existing NMonths pattern in this file (lines 145-156). The Slider onChange must also migrate filterType:

```typescript
<Show when={
  tempPeriodFilter.filterType === "last_n_calendar_years" ||
  tempPeriodFilter.filterType === "last_calendar_year"
}>
  <div class="ui-gap-sm ui-pad border-base-300 rounded border">
    <label class="text-sm">{t3({ en: "Number of years", fr: "Nombre d'années" })}: {tempPeriodFilter.nYears ?? 1}</label>
    <Slider
      value={tempPeriodFilter.nYears ?? 1}
      onChange={(nYears) => {
        setTempPeriodFilter("filterType", "last_n_calendar_years");
        setTempPeriodFilter("nYears", nYears);
      }}
      min={1}
      max={10}
      step={1}
    />
  </div>
</Show>
```

Same pattern for `NQuartersSelector` inline with `"last_n_calendar_quarters"`, `nQuarters`, min=1, max=20.

**Bug fix: nMonths slider max** (line 153): Change `max={60}` to `max={24}`. Currently the slider allows values up to 60, but `getPeriodFilterExactBounds` throws for `nMonths > 24`. This lets users save a value that crashes on resolution.

## Backwards compatibility

- Old stored `last_calendar_year` / `last_calendar_quarter` continue to resolve correctly via existing logic in `getPeriodFilterExactBounds` (those code paths are untouched)
- UI auto-maps old values to new radio selections via `displayFilterType`
- Defensive guard in resolution logic returns `periodBounds` unchanged for `quarter_id` + calendar filter combos (prevents garbage from legacy data)
- When user interacts (changes N or re-selects), the new filterType is written
- No migration needed

## Bug fixes included

1. **`quarter_id` + calendar filter produces garbage** (get_fetch_config_from_po.ts): `last_calendar_year` / `last_calendar_quarter` branches assumed YYYYMM period IDs but were reachable with `quarter_id` periodOption. Fixed with a single guard before all calendar branches.
2. **`quarter_id` shown calendar filter options in UI** (_2_filters.tsx): The 2-way branch at line 183 showed `last_calendar_year` for both `period_id` and `quarter_id`. Fixed by restructuring to a 3-way branch that excludes calendar options for `quarter_id`.
3. **nMonths slider max=60 vs validation max=24** (edit_common_properties_modal.tsx): Slider allowed values that would throw on resolution. Fixed by changing slider max to 24.

## Out of scope (noted for future)

- `defaultPeriodFilterForDefaultVisualizations` in module definitions (`module_definition_schema.ts:114-116`, `load_module.ts:78-79`) currently only supports `{ nMonths: number }`. If a module definition wants default POs with the new filter types, this structure would need extending. Not needed now since no module definitions use these filter types yet.

## Resolved decisions

- N years range: 1-10
- N quarters range: 1-20
- All calendar-based options (`last_n_calendar_years`, `last_n_calendar_quarters`) only shown for `period_id` periodOption — resolution logic assumes YYYYMM format and produces garbage for `quarter_id`. Also fixes pre-existing bug where `last_calendar_year` was offered for `quarter_id`.
- `last_calendar_quarter` was previously commented out in the _2_filters.tsx UI. Re-enabling in its N-based form (`last_n_calendar_quarters`) since the backend logic (lines 202-256) is fully implemented and correct.
