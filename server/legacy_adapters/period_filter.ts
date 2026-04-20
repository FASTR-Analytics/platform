// =============================================================================
// Legacy adapter for stored `periodFilter` shapes.
//
// Current transforms:
// - `filterType: "last_12_months"` → `filterType: "last_n_months", nMonths: 12`
// - `filterType: undefined` on a stored filter → `filterType: "custom"`
//   (pre-refactor, undefined filterType was implicitly treated as "custom")
// - Strip fabricated `periodOption`/`min`/`max` off relative filters
//   (pre-refactor, the PeriodFilter type required bounds even on relative
//   filter types; those bounds were fabricated and never read at query time)
//
// Operates on raw JSON shapes (Record<string, unknown>) so it can be composed
// into larger adapters (see po_config.ts).
// =============================================================================

const RELATIVE_FILTER_TYPES = new Set([
  "last_n_months",
  "last_calendar_year",
  "last_calendar_quarter",
  "last_n_calendar_years",
  "last_n_calendar_quarters",
]);

export function adaptLegacyPeriodFilter(
  raw: Record<string, unknown>,
): Record<string, unknown> {
  const pf = { ...raw };

  // `last_12_months` → `last_n_months` with nMonths: 12
  if (pf.filterType === "last_12_months") {
    pf.filterType = "last_n_months";
    pf.nMonths = 12;
    delete pf.periodOption;
    delete pf.min;
    delete pf.max;
    return pf;
  }

  // Legacy: undefined filterType meant "custom"
  if (pf.filterType === undefined) {
    pf.filterType = "custom";
  }

  // Strip fabricated bounds from relative filter types
  if (
    typeof pf.filterType === "string" &&
    RELATIVE_FILTER_TYPES.has(pf.filterType)
  ) {
    delete pf.periodOption;
    delete pf.min;
    delete pf.max;
  }

  return pf;
}
