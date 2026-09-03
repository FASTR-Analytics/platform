// =============================================================================
// Person-years — annual population stock → monthly flow (PLAN_1b rulings 3, 4)
// =============================================================================
//
// PURE. A population figure for a year is a STOCK, anchored at that year's
// mid-point (1 July). A month's population is read off the curve through the
// anchors at the month's own mid-point:
//
//   - between two anchors: linear interpolation;
//   - before the first / after the last: geometric extrapolation at the growth
//     rate of the two nearest anchors (a single anchor extrapolates flat, and
//     so does a pair with a zero count — a growth rate is undefined there);
//   - never more than ±1 calendar year beyond the anchored years. A month
//     outside that window is NOT covered, and generation refuses rather than
//     thinning the package (ruling 6).
//
// Person-years for a month = that population / 12. They sum like a count —
// twelve months of person-years are one year of population — which is what
// lets a population term ride m012's file as ordinary additive rows and stay
// exact at every grouping. A rate over a stock is therefore ANNUALISED: a
// monthly numerator over a month's person-years reads as a per-year rate.
//
// Mid-year anchoring is a deliberate change from m008's January-1 anchoring.
//
// =============================================================================

export const POPULATION_EXTRAPOLATION_YEARS = 1;

export type PopulationAnchor = { year: number; count: number };

// The calendar years a set of anchors can serve, inclusive.
export function populationCoveredYears(
  anchors: PopulationAnchor[],
): { firstYear: number; lastYear: number } | null {
  if (anchors.length === 0) return null;
  let firstYear = Infinity;
  let lastYear = -Infinity;
  for (const a of anchors) {
    if (a.year < firstYear) firstYear = a.year;
    if (a.year > lastYear) lastYear = a.year;
  }
  return {
    firstYear: firstYear - POPULATION_EXTRAPOLATION_YEARS,
    lastYear: lastYear + POPULATION_EXTRAPOLATION_YEARS,
  };
}

// The population at the mid-point of `year`/`month`, from anchors of any
// order (deduplicated by year — the store's key already forbids duplicates).
// Callers check coverage first; this function answers for any time point.
export function interpolateMidYearPopulation(
  anchors: PopulationAnchor[],
  year: number,
  month: number,
): number {
  const sorted = anchors.toSorted((a, b) => a.year - b.year);
  if (sorted.length === 0) {
    throw new Error("interpolateMidYearPopulation: no anchors");
  }
  const t = year + (month - 0.5) / 12;
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  if (sorted.length === 1 || t <= anchorTime(first)) {
    return sorted.length === 1
      ? first.count
      : extrapolate(first, sorted[1], t);
  }
  if (t >= anchorTime(last)) {
    return extrapolate(last, sorted[sorted.length - 2], t);
  }
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i];
    const b = sorted[i + 1];
    const ta = anchorTime(a);
    const tb = anchorTime(b);
    if (t >= ta && t < tb) {
      const w = (t - ta) / (tb - ta);
      return a.count * (1 - w) + b.count * w;
    }
  }
  throw new Error("interpolateMidYearPopulation: unreachable");
}

function anchorTime(a: PopulationAnchor): number {
  return a.year + 0.5;
}

// Geometric growth from `from` (the nearer anchor) at the rate implied by
// `other`, applied over the signed distance from `from` to `t`. Flat when a
// rate cannot be defined.
function extrapolate(
  from: PopulationAnchor,
  other: PopulationAnchor,
  t: number,
): number {
  if (from.count <= 0 || other.count <= 0) return from.count;
  const annualGrowth = Math.pow(
    other.count / from.count,
    1 / (other.year - from.year),
  );
  return from.count * Math.pow(annualGrowth, t - anchorTime(from));
}

export function personYearsForMonth(
  anchors: PopulationAnchor[],
  year: number,
  month: number,
): number {
  return interpolateMidYearPopulation(anchors, year, month) / 12;
}

// Every YYYYMM period id from `first` to `last`, inclusive.
export function listMonthlyPeriodIds(first: number, last: number): number[] {
  const out: number[] = [];
  let year = Math.floor(first / 100);
  let month = first % 100;
  const lastYear = Math.floor(last / 100);
  const lastMonth = last % 100;
  while (year < lastYear || (year === lastYear && month <= lastMonth)) {
    out.push(year * 100 + month);
    month++;
    if (month > 12) {
      month = 1;
      year++;
    }
  }
  return out;
}
