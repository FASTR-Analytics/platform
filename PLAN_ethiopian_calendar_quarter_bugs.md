# Plan: Ethiopian Calendar Quarter Handling Bugs

## Executive Summary

There are **6 confirmed bugs** related to Ethiopian calendar handling, primarily around quarter_id derivation and date formatting. The SQL layer derives quarters using Gregorian logic (months 1-3=Q1), which is wrong for Ethiopian calendar where quarters are 11-1, 2-4, 5-7, 8-10. Additionally, several client-side components hardcode Gregorian assumptions.

**Risk Level: HIGH** — Ethiopian calendar users will see incorrect data when grouping by quarter or using calendar-based filters.

---

## Background: How Ethiopian Calendar Should Work

The system stores dates in `period_id` format (YYYYMM, Gregorian year + Gregorian month). Ethiopian calendar support means:

- **Ethiopian year boundaries**: Month 11 to Month 10 (November to October in Gregorian terms)
- **Ethiopian quarters**:
  - Q1: Months 11-1 (Nov-Jan, crossing year boundary)
  - Q2: Months 2-4 (Feb-Apr)  
  - Q3: Months 5-7 (May-Jul)
  - Q4: Months 8-10 (Aug-Oct)

The `getLastFullYearBounds` and `getLastFullQuarterBounds` functions in `lib/get_fetch_config_from_po.ts` correctly implement these boundaries for filtering. However, the SQL-level quarter derivation does not.

---

## Bug #1: SQL Quarter Derivation is Gregorian-Only

### Location
[server/server_only_funcs_presentation_objects/period_helpers.ts:22-27](server/server_only_funcs_presentation_objects/period_helpers.ts#L22-L27)

### Code
```typescript
export const PERIOD_COLUMN_EXPRESSIONS = {
  // ...
  quarter_id: `(CASE
    WHEN period_id % 100 <= 3 THEN (period_id / 100) * 100 + 1
    WHEN period_id % 100 <= 6 THEN (period_id / 100) * 100 + 2
    WHEN period_id % 100 <= 9 THEN (period_id / 100) * 100 + 3
    ELSE (period_id / 100) * 100 + 4
  END)::int`,
} as const;
```

### Problem
This SQL expression maps months to quarters using Gregorian logic (1-3=Q1, 4-6=Q2, etc.). When Ethiopian calendar is active:
- Month 11 (November) should be Q1 of the *next* Ethiopian year
- Month 2 (February) should be Q2
- etc.

### Impact
When users group data by `quarter_id` with Ethiopian calendar, the quarters shown will be **completely wrong**. Data that should be in Ethiopian Q1 will appear in Gregorian Q4, etc.

### Affected Files Using This Expression
- `server/server_only_funcs_presentation_objects/cte_manager.ts:81-85`
- `server/server_only_funcs_presentation_objects/get_period_bounds.ts:30-36`

### Fix Required
The SQL expression needs to be generated dynamically based on the active calendar. Options:
1. Pass calendar as a parameter and generate calendar-specific SQL
2. Create `PERIOD_COLUMN_EXPRESSIONS_ETHIOPIAN` with correct logic
3. Move quarter derivation to application layer where calendar is available

**Recommended**: Option 1 — create a function `getQuarterIdExpression(calendar: CalendarType)` that returns the appropriate SQL CASE expression.

Ethiopian quarter_id SQL would be:
```sql
(CASE
  WHEN period_id % 100 >= 11 THEN ((period_id / 100) + 1) * 100 + 1  -- Nov-Dec → Q1 next year
  WHEN period_id % 100 <= 1 THEN (period_id / 100) * 100 + 1         -- Jan → Q1 same year
  WHEN period_id % 100 <= 4 THEN (period_id / 100) * 100 + 2         -- Feb-Apr → Q2
  WHEN period_id % 100 <= 7 THEN (period_id / 100) * 100 + 3         -- May-Jul → Q3
  ELSE (period_id / 100) * 100 + 4                                    -- Aug-Oct → Q4
END)::int
```

---

## ~~Bug #2~~: Calendar-Based Filters for quarter_id Data — NOT A BUG

### Status: **Resolved** (not a user-facing issue)

### Location
[lib/get_fetch_config_from_po.ts:108-117](lib/get_fetch_config_from_po.ts#L108-L117)

### Analysis
This code returns unfiltered data when calendar-based filters are used with quarter_id data. However, **the UI already hides these filter options for quarter_id data** (see [_2_filters.tsx:236-250](client/src/components/visualization/presentation_object_editor_panel_data/_2_filters.tsx#L236-L250)).

This code path is unreachable through normal UI usage — it's dead/defensive code.

### Resolution

Added clarifying TODO comment to the code:
```typescript
// TODO: Calendar-based filters are hidden in UI for quarter_id data (see _2_filters.tsx:236-250).
// This code path is unreachable. Either implement the feature or remove this block.
```

### Future Consideration

If calendar-based quarter filters are needed for quarterly data in the future, implement the backend logic and show the UI options. For now, the current behavior is acceptable.

---

## Bug #3: Date Label Replacements Hardcoded to Gregorian

### Location
[client/src/generate_visualization/get_date_label_replacements.ts:87](client/src/generate_visualization/get_date_label_replacements.ts#L87)

### Code
```typescript
function formatDateValue(
  value: string,
  periodType: "year-month" | "year-quarter",
): string {
  // Use formatPeriod from panther with gregorian calendar as default
  return formatPeriod(value, periodType, "gregorian");  // ← HARDCODED!
}
```

### Problem
This function formats date values for table column/row headers. It's hardcoded to "gregorian" instead of using `getCalendar()`.

### Impact
Ethiopian calendar users see Gregorian month names (Jan, Feb, Mar) in table headers instead of Ethiopian month names (Mes, Tik, Hid).

### Fix Required
```typescript
import { getCalendar } from "lib";

function formatDateValue(
  value: string,
  periodType: "year-month" | "year-quarter",
): string {
  return formatPeriod(value, periodType, getCalendar());
}
```

---

## Bug #4 + #5 (Merged): Client Period Filter Reconciliation — Quarter and Year

### Location
[client/src/components/visualization/presentation_object_editor_panel_data/_2_filters.tsx:52](client/src/components/visualization/presentation_object_editor_panel_data/_2_filters.tsx#L52)

### Code
```typescript
function reconcilePeriodFilterWithBounds(
  periodFilter: BoundedPeriodFilter,
  periodBounds: PeriodBounds,
): BoundedPeriodFilter {
  // ...
  const convert = (v: number, isEnd: boolean): number => {
    // ...
    if (target === "quarter_id" && sub >= 1 && sub <= 12) 
      return year * 100 + Math.ceil(sub / 3);  // ← GREGORIAN!
    // ...
  };
}
```

### Problem
Two issues in one:
1. Uses `Math.ceil(sub / 3)` which is Gregorian quarter logic
2. Uses the original `year` without adjusting for Ethiopian year-crossing

For Ethiopian calendar:
- November 2024 (period_id 202411) → Ethiopian Q1 **2025** (quarter_id 202501)
- December 2024 (period_id 202412) → Ethiopian Q1 **2025** (quarter_id 202501)
- January 2025 (period_id 202501) → Ethiopian Q1 2025 (quarter_id 202501)

### Impact
Period filter conversions map months to wrong quarters AND wrong years for Ethiopian calendar users.

### Fix Required
Create a calendar-aware period_id to quarter_id converter that returns the full quarter_id:

```typescript
function periodIdToQuarterId(periodId: number, calendar: CalendarType): number {
  const year = Math.floor(periodId / 100);
  const month = periodId % 100;
  
  if (calendar === "ethiopian") {
    // Ethiopian Q1 is months 11-1, with Nov/Dec belonging to NEXT year's Q1
    if (month >= 11) return (year + 1) * 100 + 1;  // Nov/Dec → Q1 next year
    if (month <= 1) return year * 100 + 1;          // Jan → Q1 same year
    if (month <= 4) return year * 100 + 2;          // Feb-Apr → Q2
    if (month <= 7) return year * 100 + 3;          // May-Jul → Q3
    return year * 100 + 4;                          // Aug-Oct → Q4
  }
  
  // Gregorian
  return year * 100 + Math.ceil(month / 3);
}
```

---

## Bug #6: Hardcoded Gregorian Month Names in Date Labels

### Location
[client/src/generate_visualization/get_date_label_replacements.ts:13-16](client/src/generate_visualization/get_date_label_replacements.ts#L13-L16)

### Code
```typescript
const MONTHS_THREE_CHARS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
];
```

### Problem
This constant is used to format month numbers (1-12) into display names for the "month" prop. It's hardcoded to Gregorian month names.

### Impact
When data has a `month` column and is displayed in tables, Ethiopian calendar users see "Jan, Feb, Mar" instead of "Mes, Tik, Hid".

### Fix Required
Use panther's calendar-aware month names:

```typescript
import { getCalendar } from "lib";

function getMonthName(monthNum: number): string {
  const calendar = getCalendar();
  if (calendar === "ethiopian") {
    const ETHIOPIAN_MONTHS = ["Mes", "Tik", "Hid", "Tah", "Tir", "Yek", "Meg", "Mia", "Gin", "Sen", "Ham", "Neh"];
    return ETHIOPIAN_MONTHS[monthNum - 1] ?? "?";
  }
  const GREGORIAN_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return GREGORIAN_MONTHS[monthNum - 1] ?? "?";
}
```

Or import from panther if available (the same names are in `panther/_000_utils/periods.ts`).

---

## Bug #7: Potential Panther Library Calendar Integration Gap

### Observation
While `xPeriodAxis.calendar` is correctly set via `getCalendar()` in style configurations, the `TimeseriesJsonDataConfig` type doesn't have a calendar field. This means:
- Axis labels are calendar-aware ✓
- Data transformation/grouping may not be calendar-aware ✗

### Investigation Needed
Verify how panther's `getTimeseriesDataTransformed` handles period grouping — does it group by calendar-aware periods or just by the raw quarter_id values?

If it just uses raw values, then the bug is upstream in the SQL (Bug #1). If it does additional grouping, it may need calendar awareness.

---

## Summary of Fixes Required

| Bug | File | Severity | Fix Complexity |
|-----|------|----------|----------------|
| #1 | `period_helpers.ts` | **Critical** | Medium — need calendar-aware SQL generation |
| ~~#2~~ | `get_fetch_config_from_po.ts` | ~~High~~ | **Resolved** — not user-facing, added TODO comment |
| #3 | `get_date_label_replacements.ts:87` | Medium | **Easy** — one-line fix (use `getCalendar()`) |
| #4+#5 | `_2_filters.tsx` | Medium | Easy — calendar-aware quarter_id converter with year adjustment |
| #6 | `get_date_label_replacements.ts:13-16` | Medium | Easy — use calendar-aware month names |
| #7 | Panther integration | Unknown | TBD — needs investigation |

---

## Recommended Fix Order

1. **Bug #3** (Easy win — one-line fix for `formatPeriod` calendar parameter)
2. **Bug #6** (Easy win — calendar-aware month names constant)
3. **Bug #4+#5** (Easy — calendar-aware `periodIdToQuarterId` converter)
4. **Bug #1** (Critical — calendar-aware SQL quarter derivation)
5. **Bug #7** (Investigate panther integration if needed)

---

## Testing Requirements

After fixes:
1. Create test data spanning Ethiopian year boundary (Oct-Nov)
2. Verify quarter_id grouping shows correct Ethiopian quarters
3. Verify "Last N calendar years/quarters" filters work correctly
4. Verify date labels show Ethiopian month names
5. Verify period filter reconciliation works across formats

---

## Questions for Stakeholder

1. **Is there existing quarterly data in production?** If all data is monthly (period_id), some bugs may be lower priority.
2. **Are there Ethiopian calendar instances in production?** If not deployed yet, we have time for thorough fixes.
