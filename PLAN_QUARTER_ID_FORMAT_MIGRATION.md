# Plan: Quarter ID Format Migration (YYYYQQ → YYYYQ)

## Overview

Migrate `quarter_id` format from YYYYQQ (6 digits) to YYYYQ (5 digits).

**Prerequisite:** Complete period filter schema strictification first. See
`PLAN_PERIOD_FILTER_SCHEMA.md`.

**Current:** YYYYQQ (6 digits) — e.g., 202401 = Q1 2024  
**Proposed:** YYYYQ (5 digits) — e.g., 20241 = Q1 2024

## Rationale

Length alone identifies the type:

- `period_id`: 6 chars (YYYYMM)
- `quarter_id`: 5 chars (YYYYQ)
- `year`: 4 chars (YYYY)

## Changes Required

### wb-fastr

1. `isValidQuarterId()` — change range to 19001-20504, quarter in ones place
   (1-4)
2. `server/server_only_funcs_presentation_objects/period_helpers.ts` —
   `getQuarterIdExpression()` change `* 100` to `* 10`
3. `QUARTER_ID_COLUMN_EXPRESSIONS.year` — change `/ 100` to `/ 10`
4. Client conversion functions in:
   - `client/src/components/visualization/presentation_object_editor_panel_data/_2_filters.tsx`
   - `client/src/components/slide_deck/slide_ai/build_config_from_metric.ts`
5. M007 module script — already uses correct formula, just verify

### Panther

1. `modules/_000_utils/periods.ts`:
   - `getTimeFromPeriodId()` — change `str.slice(4, 6)` to `str.slice(4, 5)`
   - `getPeriodIdFromTime()` — change `* 100` to `* 10`
   - `formatPeriod()` — change `str.slice(5, 6)` to `str.slice(4, 5)`

### Database — Data Transform Required

**NOTE:** Bounded period filters with `periodOption: "quarter_id"` DO store
min/max values in YYYYQQ format. These need a data transform.

Add transform block to `server/db/migrations/data_transforms/po_config.ts`:

```typescript
// Block N: Convert quarter_id from YYYYQQ to YYYYQ format
const pf = d.periodFilter as Record<string, unknown> | undefined;
if (pf?.periodOption === "quarter_id") {
  if (typeof pf.min === "number" && pf.min > 9999) {
    pf.min = Math.floor(pf.min / 10);
  }
  if (typeof pf.max === "number" && pf.max > 9999) {
    pf.max = Math.floor(pf.max / 10);
  }
}
```

The `> 9999` check ensures we only transform 6-digit values (YYYYQQ), not
already-converted 5-digit values (YYYYQ).

## Migration Strategy

1. Complete schema strictification (see `PLAN_PERIOD_FILTER_SCHEMA.md`)
2. Run test suite to ensure all existing data validates
3. Add data transform block for stored quarter_id values
4. Update all `* 100` / `/ 100` to `* 10` / `/ 10` in one commit
5. Update string slicing in panther
6. Update `isValidQuarterId()` range
7. Run test suite again
