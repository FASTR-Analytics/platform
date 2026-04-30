# Plan: Period Filter Schema Strictification

## Overview

Tighten the `periodFilter` schema to be maximally strict. Each filter type gets
exactly the fields it requires, with runtime validation on bounded filter
values.

This plan also eliminates a problematic pattern where `last_n_months` was
overloaded to handle quarters when `periodOption === "quarter_id"`.

---

## Background: The Overloading Problem

### Current Behavior

The UI currently uses `filterType: "last_n_months"` as a generic "last N
periods" concept that adapts based on context:

```typescript
// In _2_filters.tsx, when periodOption === "quarter_id":
{ filterType: "last_n_months", nQuarters: 4 }

// In _2_filters.tsx, when periodOption === "period_id":
{ filterType: "last_n_months", nMonths: 12 }
```

The server logic in `get_fetch_config_from_po.ts` then branches on
`periodOption` to decide which field to use:

```typescript
if (periodFilter.filterType === "last_n_months") {
  if (periodBounds.periodOption === "quarter_id") {
    const nQuarters = periodFilter.nQuarters ?? 4;  // uses nQuarters!
    // ...
  }
  const nMonths = periodFilter.nMonths ?? 12;
  // ...
}
```

### Why This Is Problematic

1. **Type confusion**: `last_n_months` with `nQuarters` is semantically
   misleading
2. **Schema can't be strict**: Can't enforce "last_n_months requires nMonths"
   because it sometimes needs nQuarters
3. **Redundancy**: `last_n_calendar_quarters` already exists and handles
   quarters correctly

### The Difference Between the Two Approaches

| Approach                                | Behavior                                                              |
|-----------------------------------------|-----------------------------------------------------------------------|
| `last_n_months` + `nQuarters` (current) | Takes last N quarters from max, may include incomplete current quarter |
| `last_n_calendar_quarters`              | Uses `getLastFullQuarterBounds()` to find last complete quarter first |

### Design Decision

**Eliminate the overloading.** For quarterly data:

- Use `last_n_calendar_quarters` for "last N complete calendar quarters"
- Use `custom` bounded filter for specific ranges (including current quarter)

This makes each filterType semantically clear and enables strict typing.

---

## Current State

Location: `lib/types/_metric_installed.ts:50-75`

```typescript
// RelativePeriodFilter - single object with optional fields (loose)
export const relativePeriodFilterSchema = z.object({
  filterType: z.enum([
    "last_n_months",
    "last_calendar_year",
    "last_calendar_quarter",
    "last_n_calendar_years",
    "last_n_calendar_quarters",
  ]),
  nMonths: z.number().optional(),
  nYears: z.number().optional(),
  nQuarters: z.number().optional(),
});

// BoundedPeriodFilter - min/max are just z.number() (no validation)
export const boundedPeriodFilterSchema = z.object({
  filterType: z.enum(["custom", "from_month"]),
  periodOption: periodOption,
  min: z.number(),
  max: z.number(),
  nMonths: z.number().optional(),   // shouldn't exist on bounded
  nYears: z.number().optional(),    // shouldn't exist on bounded
  nQuarters: z.number().optional(), // shouldn't exist on bounded
});

// Discriminated union of the two
export const periodFilterStrict = z
  .discriminatedUnion("filterType", [
    relativePeriodFilterSchema,
    boundedPeriodFilterSchema,
  ])
  .optional();
```

### Problems

1. **RelativePeriodFilter**: Optional fields should be required per filterType
2. **BoundedPeriodFilter**: Has `nMonths/nYears/nQuarters` fields that are
   meaningless for bounded filters
3. **No validation**: No checks on min/max format or that min <= max
4. **Overloaded semantics**: `last_n_months` used for both months and quarters

---

## Phase 1: Period Value Validators

**File:** `lib/types/_metric_installed.ts`

Add reusable validation functions for period formats. These will be used by the
schema refinement and can be reused elsewhere.

```typescript
const MIN_YEAR = 1900;
const MAX_YEAR = 2050;

export function isValidPeriodId(v: number): boolean {
  if (v < 190001 || v > 205012) return false;
  const month = v % 100;
  return month >= 1 && month <= 12;
}

export function isValidQuarterId(v: number): boolean {
  if (v < 190001 || v > 205004) return false;
  const quarter = v % 100;
  return quarter >= 1 && quarter <= 4;
}

export function isValidYear(v: number): boolean {
  return v >= MIN_YEAR && v <= MAX_YEAR;
}

export function isValidPeriodValue(
  v: number,
  periodOption: "period_id" | "quarter_id" | "year"
): boolean {
  switch (periodOption) {
    case "period_id": return isValidPeriodId(v);
    case "quarter_id": return isValidQuarterId(v);
    case "year": return isValidYear(v);
  }
}
```

---

## Phase 2: Strict Discriminated Union Schema

**File:** `lib/types/_metric_installed.ts`

Replace the loose schemas with a single flat discriminated union. Each
filterType gets exactly the fields it requires — no optional fields that don't
apply.

```typescript
const boundedFilterBase = z.object({
  periodOption: periodOption,
  min: z.number().int(),
  max: z.number().int(),
});

const periodFilterUnion = z.discriminatedUnion("filterType", [
  // --- Relative filters (resolved at query time) ---
  z.object({
    filterType: z.literal("last_n_months"),
    nMonths: z.number().int().min(1),
  }),
  z.object({
    filterType: z.literal("last_calendar_year"),
  }),
  z.object({
    filterType: z.literal("last_calendar_quarter"),
  }),
  z.object({
    filterType: z.literal("last_n_calendar_years"),
    nYears: z.number().int().min(1),
  }),
  z.object({
    filterType: z.literal("last_n_calendar_quarters"),
    nQuarters: z.number().int().min(1),
  }),

  // --- Bounded filters (explicit min/max) ---
  boundedFilterBase.extend({
    filterType: z.literal("custom"),
  }),
  boundedFilterBase.extend({
    filterType: z.literal("from_month"),
  }),
]);
```

---

## Phase 3: Add Refinements for Bounded Filters

**File:** `lib/types/_metric_installed.ts`

Add runtime validation for bounded filter values:

```typescript
export const periodFilterSchema = periodFilterUnion.refine(
  (filter) => {
    if (filter.filterType !== "custom" && filter.filterType !== "from_month") {
      return true;
    }
    const { periodOption, min, max } = filter;
    return (
      isValidPeriodValue(min, periodOption) &&
      isValidPeriodValue(max, periodOption) &&
      min <= max
    );
  },
  {
    message: "Invalid period bounds: check min/max format and ensure min <= max",
  }
);
```

---

## Phase 4: Update Type Exports

**File:** `lib/types/_metric_installed.ts`

Remove old type aliases and update exports:

```typescript
// Remove these:
// export type RelativePeriodFilter = z.infer<typeof relativePeriodFilterSchema>;
// export type BoundedPeriodFilter = z.infer<typeof boundedPeriodFilterSchema>;
// export type PeriodFilter = RelativePeriodFilter | BoundedPeriodFilter;

// Add these:
export type PeriodFilter = z.infer<typeof periodFilterSchema>;

export type BoundedPeriodFilter = Extract<
  PeriodFilter,
  { filterType: "custom" | "from_month" }
>;

export type RelativePeriodFilter = Exclude<PeriodFilter, BoundedPeriodFilter>;
```

**File:** `lib/types/presentation_objects.ts`

Update the type guard:

```typescript
export function periodFilterHasBounds(
  filter: PeriodFilter
): filter is BoundedPeriodFilter {
  return filter.filterType === "custom" || filter.filterType === "from_month";
}
```

---

## Phase 5: Data Transform

**File:** `server/db/migrations/data_transforms/po_config.ts`

Add transform blocks to migrate existing data to the new schema.

### Block 19: Migrate overloaded last_n_months to last_n_calendar_quarters

Any stored filter with `filterType: "last_n_months"` and `nQuarters` (but no
`nMonths`) was using the overloaded pattern. Migrate to
`last_n_calendar_quarters`:

```typescript
// Block 19: Migrate overloaded last_n_months with nQuarters to last_n_calendar_quarters
if (
  pf?.filterType === "last_n_months" &&
  pf.nQuarters !== undefined &&
  pf.nMonths === undefined
) {
  pf.filterType = "last_n_calendar_quarters";
}
```

### Block 20: Strip nMonths/nYears/nQuarters from bounded filters

```typescript
// Block 20: Strip relative-only fields from bounded filters
if (pf && !RELATIVE_FILTER_TYPES.has(pf.filterType as string)) {
  delete pf.nMonths;
  delete pf.nYears;
  delete pf.nQuarters;
}
```

### Block 21: Strip unused fields from relative filters

Each relative filter type should only have its specific field:

```typescript
// Block 21: Strip unused count fields from relative filters
if (pf?.filterType === "last_n_months") {
  delete pf.nYears;
  delete pf.nQuarters;
}
if (pf?.filterType === "last_n_calendar_years") {
  delete pf.nMonths;
  delete pf.nQuarters;
}
if (pf?.filterType === "last_n_calendar_quarters") {
  delete pf.nMonths;
  delete pf.nYears;
}
if (
  pf?.filterType === "last_calendar_year" ||
  pf?.filterType === "last_calendar_quarter"
) {
  delete pf.nMonths;
  delete pf.nYears;
  delete pf.nQuarters;
}
```

### Block 22: Fill default nMonths for last_n_months without count

After Block 19 converts overloaded filters to `last_n_calendar_quarters`, any
remaining `last_n_months` filters that lack `nMonths` need a default. This can
happen if someone enabled the period filter checkbox and saved without
selecting a count.

```typescript
// Block 22: Fill default nMonths for last_n_months without count
if (pf?.filterType === "last_n_months" && pf.nMonths === undefined) {
  pf.nMonths = 12;
}
```

---

## Phase 6: Update Server Logic

**File:** `lib/get_fetch_config_from_po.ts`

Remove the special case where `last_n_months` handles quarters. The
`last_n_calendar_quarters` code path already handles this correctly.

### Before (lines ~120-146)

```typescript
if (periodFilter.filterType === "last_n_months") {
  if (periodBounds.periodOption === "quarter_id") {
    const nQuarters = periodFilter.nQuarters ?? 4;
    // ... quarter handling ...
  }
  const nMonths = periodFilter.nMonths ?? 12;
  // ... month handling ...
}
```

### After

```typescript
if (periodFilter.filterType === "last_n_months") {
  const nMonths = periodFilter.nMonths;  // now required, no default needed
  const time = getTimeFromPeriodId(periodBounds.max, "year-month");
  const min = getPeriodIdFromTime(time - (nMonths - 1), "year-month");
  return {
    periodOption: periodBounds.periodOption,
    min,
    max: periodBounds.max,
  };
}
```

The quarter handling is now exclusively done by `last_n_calendar_quarters`.

### Fix hashFetchConfig type narrowing

The `hashFetchConfig` function (lines ~276-278) accesses `nMonths`, `nYears`,
`nQuarters` without narrowing. With the strict union, TypeScript will error
because these fields don't exist on all variants.

```typescript
// Before:
fc.periodFilter?.nMonths?.toString() ?? "",
fc.periodFilter?.nYears?.toString() ?? "",
fc.periodFilter?.nQuarters?.toString() ?? "",

// After:
fc.periodFilter?.filterType === "last_n_months" ? fc.periodFilter.nMonths.toString() : "",
fc.periodFilter?.filterType === "last_n_calendar_years" ? fc.periodFilter.nYears.toString() : "",
fc.periodFilter?.filterType === "last_n_calendar_quarters" ? fc.periodFilter.nQuarters.toString() : "",
```

---

## Phase 7: Update UI

**File:**
`client/src/components/visualization/presentation_object_editor_panel_data/_2_filters.tsx`

### 7a: Update filter type options for quarterly data

When `periodOption === "quarter_id"`, replace `last_n_months` with
`last_n_calendar_quarters`:

```typescript
// Before:
periodOption === "quarter_id"
  ? [
      { value: "last_n_months", label: "Last N quarters" },
      { value: "from_month", label: "From specific quarter" },
      { value: "custom", label: "Custom" },
    ]

// After:
periodOption === "quarter_id"
  ? [
      { value: "last_n_calendar_quarters", label: "Last N calendar quarters" },
      { value: "from_month", label: "From specific quarter" },
      { value: "custom", label: "Custom" },
    ]
```

### 7b: Update NQuartersSelector condition

Remove the condition that shows NQuartersSelector for `last_n_months`:

```typescript
// Remove this:
<Show when={rawPeriodFilter.filterType === "last_n_months" && periodOption === "quarter_id"}>
  <NQuartersSelector ... />
</Show>

// The existing condition for last_n_calendar_quarters handles it:
<Show when={rawPeriodFilter.filterType === "last_n_calendar_quarters"}>
  <NQuartersSelector ... />
</Show>
```

### 7c: Update default filter creation

When enabling period filter checkbox, include the required count field:

```typescript
// Before (creates invalid filter with no count):
p.setTempConfig("d", "periodFilter", { filterType: "last_n_months" });

// After (include default count based on periodOption):
if (periodOption === "quarter_id") {
  p.setTempConfig("d", "periodFilter", { filterType: "last_n_calendar_quarters", nQuarters: 4 });
} else {
  p.setTempConfig("d", "periodFilter", { filterType: "last_n_months", nMonths: 12 });
}
```

---

## Phase 8: Update GitHub Schema

**File:** `lib/types/_module_definition_github.ts`

Mirror the changes from Phase 2. Replace the loose `relativePeriodFilterGithub`
and `boundedPeriodFilterGithub` with a single strict discriminated union:

```typescript
const boundedFilterBaseGithub = z.object({
  periodOption: periodOptionGithub,
  min: z.number().int(),
  max: z.number().int(),
});

const periodFilterGithub = z
  .discriminatedUnion("filterType", [
    z.object({
      filterType: z.literal("last_n_months"),
      nMonths: z.number().int().min(1),
    }),
    z.object({
      filterType: z.literal("last_calendar_year"),
    }),
    z.object({
      filterType: z.literal("last_calendar_quarter"),
    }),
    z.object({
      filterType: z.literal("last_n_calendar_years"),
      nYears: z.number().int().min(1),
    }),
    z.object({
      filterType: z.literal("last_n_calendar_quarters"),
      nQuarters: z.number().int().min(1),
    }),
    boundedFilterBaseGithub.extend({
      filterType: z.literal("custom"),
    }),
    boundedFilterBaseGithub.extend({
      filterType: z.literal("from_month"),
    }),
  ])
  .optional();
```

---

## Phase 9: Update Other Client Code

### 9a: `client/src/components/slide_deck/slide_ai/build_config_from_metric.ts`

Verified: Only creates `custom` bounded filters (lines 93-98). No changes
needed.

### 9b: `client/src/components/project_ai/ai_tools/tools/_internal/format_viz_editor_for_ai.ts`

Lines 58-61 access count fields without narrowing. Same fix as hashFetchConfig:

```typescript
// Before (will error with strict types):
const nPart =
  pf.nMonths != null ? `${pf.nMonths} months` :
  pf.nQuarters != null ? `${pf.nQuarters} quarters` :
  pf.nYears != null ? `${pf.nYears} years` : "";

// After:
const nPart =
  pf.filterType === "last_n_months" ? `${pf.nMonths} months` :
  pf.filterType === "last_n_calendar_quarters" ? `${pf.nQuarters} quarters` :
  pf.filterType === "last_n_calendar_years" ? `${pf.nYears} years` : "";
```

### 9c: `client/src/components/project_ai/ai_tools/tools/_internal/format_metric_data_for_ai.ts`

Check for similar patterns and apply narrowing if needed.

---

## Implementation Order

1. **Phase 5 first** (data transform) — Add migration blocks but don't deploy
   yet
2. **Phases 1-4** (schema) — Update schema and type exports
3. **Phase 6** (server logic) — Remove overloaded handling
4. **Phase 7** (UI) — Update filter options and selectors
5. **Phase 8** (GitHub schema) — Sync with installed schema
6. **Phase 9** (other client) — Clean up remaining references
7. **Deploy** — Transform runs at startup, migrates data, boot validates

---

## Validation Checklist

Before deploying:

- [ ] All existing period filter data passes new schema validation
- [ ] UI correctly shows `last_n_calendar_quarters` for quarterly data
- [ ] `get_fetch_config_from_po.ts` returns correct bounds for all filter types
- [ ] GitHub module definitions with period filters still validate
- [ ] Type errors are resolved across client and server
