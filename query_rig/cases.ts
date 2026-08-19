import { ALL_FACILITIES_SENTINEL, BLANK_SENTINEL, ROLLUP_SENTINEL } from "lib";
import type {
  DisaggregationOption,
  GenericLongFormFetchConfig,
  InstanceCalendar,
} from "lib";

export type Case = {
  name: string;
  fixture: string;
  // The manifest's calendar for this case — a package generated on an
  // Ethiopian-calendar instance carries "ethiopian" and the read path takes it
  // from there, never from a process global.
  calendar?: InstanceCalendar;
  // The caller's admin-area-2 scope (D7). Absent = national, the identity the
  // whole rest of the corpus runs at.
  adminArea2?: string;
  // "possibleValues" runs the option-list query for `disOpt`, reusing
  // fetchConfig.filters as the filter set the route would pass.
  entry?: "items" | "possibleValues" | "metricInfo";
  disOpt?: DisaggregationOption;
  fetchConfig: GenericLongFormFetchConfig;
  expect:
    | { status: "ok"; rows: Record<string, unknown>[] }
    | { status: "no_data_available" | "too_many_items" }
    // Ordered — the blank sentinel must land LAST, which SQL cannot do under
    // SELECT DISTINCT, so it is moved in TS.
    | { values: { id: string; label: string }[] }
    // One dimension's option-list status off the metric-info payload.
    // namedCount excludes the sentinel; isSingleValueDim runs the real
    // getSingleValueDimsFromPossibleValues over the whole payload.
    | {
        dimStatus: {
          disOpt: DisaggregationOption;
          status: "ok" | "too_many_values" | "no_values_available" | "error";
          namedCount?: number;
          isSingleValueDim?: boolean;
        };
      }
    | { err: string };
};

function base(): Omit<GenericLongFormFetchConfig, "groupBys"> {
  return {
    values: [{ prop: "value", func: "SUM" }],
    filters: [],
    periodFilter: undefined,
    postAggregationExpression: undefined,
  };
}

// Generated matrix. Year derivation must NOT vary by calendar — only the
// quarter expression is calendar-dependent (getQuarterIdExpression) — so this
// asserts invariance across all three period scenarios. A change that made the
// year branch calendar-aware would light up six cases at once.
const YEAR_INVARIANT: { fixture: string; rows: Record<string, unknown>[] }[] = [
  { fixture: "hmis_monthly", rows: [{ year: 2024, value: 52 }] },
  {
    fixture: "hmis_quarterly",
    rows: [
      { year: 2023, value: 5 },
      { year: 2024, value: 30 },
    ],
  },
  {
    fixture: "hmis_yearly",
    rows: [
      { year: 2023, value: 10 },
      { year: 2024, value: 25 },
    ],
  },
];

const CALENDARS: InstanceCalendar[] = ["gregorian", "ethiopian"];

const PERIOD_MATRIX: Case[] = YEAR_INVARIANT.flatMap((f) =>
  CALENDARS.map((cal): Case => ({
    name: `year derivation calendar-invariant: ${f.fixture} / ${cal}`,
    fixture: f.fixture,
    calendar: cal,
    fetchConfig: { ...base(), groupBys: ["year"] },
    expect: { status: "ok", rows: f.rows },
  }))
);

const EXPLICIT_CASES: Case[] = [
  {
    name: "groupBy physical admin_area_2 → SUM per area",
    fixture: "hmis_monthly",
    fetchConfig: { ...base(), groupBys: ["admin_area_2"] },
    expect: {
      status: "ok",
      rows: [
        { admin_area_2: "A2_north", value: 35 },
        { admin_area_2: "A2_south", value: 17 },
      ],
    },
  },
  {
    name: "groupBy facility_type → facility_subset CTE join",
    fixture: "hmis_monthly",
    fetchConfig: { ...base(), groupBys: ["facility_type"] },
    expect: {
      status: "ok",
      rows: [
        { facility_type: "hospital", value: 33 },
        { facility_type: "clinic", value: 15 },
        { facility_type: "health_post", value: 4 },
      ],
    },
  },
  {
    name: "groupBy derived year → period CTE",
    fixture: "hmis_monthly",
    fetchConfig: { ...base(), groupBys: ["year"] },
    expect: {
      status: "ok",
      rows: [{ year: 2024, value: 52 }],
    },
  },

  // ── Multi-membership (hfa_service_category is a pipe-joined SET) ──────────
  {
    name: "filter one service category → set-membership overlap, not exact match",
    fixture: "hfa_service_cats",
    fetchConfig: {
      ...base(),
      groupBys: ["admin_area_2"],
      filters: [{ disOpt: "hfa_service_category", values: ["rmnch"] }],
    },
    // h1 and h2 contribute, over 4 rows — n is facilities, not rows.
    expect: {
      status: "ok",
      rows: [{ admin_area_2: "A2_north", value: 41, __n_value: 2 }],
    },
  },
  {
    name: "filter two service categories → OR-of-many",
    fixture: "hfa_service_cats",
    fetchConfig: {
      ...base(),
      groupBys: ["admin_area_2"],
      filters: [
        { disOpt: "hfa_service_category", values: ["rmnch", "malaria"] },
      ],
    },
    expect: {
      status: "ok",
      rows: [
        { admin_area_2: "A2_north", value: 41, __n_value: 2 },
        { admin_area_2: "A2_south", value: 4, __n_value: 1 },
      ],
    },
  },
  {
    name: "groupBy a filter-only dimension → rejected",
    fixture: "hfa_service_cats",
    fetchConfig: { ...base(), groupBys: ["hfa_service_category"] },
    expect: { err: "Filter-only disaggregation option in groupBys" },
  },

  // ── The blank-fold type gate: F2/F3 differ ONLY in time_point's column type
  {
    name: "groupBy TEXT time_point → NULL and spaces fold onto one __BLANK group",
    fixture: "hfa_service_cats",
    fetchConfig: { ...base(), groupBys: ["time_point"] },
    expect: {
      status: "ok",
      rows: [
        { time_point: "baseline", value: 26, __n_value: 4 },
        { time_point: "midline", value: 26, __n_value: 2 },
        { time_point: BLANK_SENTINEL, value: 4, __n_value: 2 },
      ],
    },
  },
  {
    name: "groupBy INTEGER time_point → no fold, no btrim, no SQL error",
    fixture: "hfa_timepoint_integer",
    fetchConfig: { ...base(), groupBys: ["time_point"] },
    expect: {
      status: "ok",
      rows: [
        { time_point: 1, value: 26, __n_value: 4 },
        { time_point: 2, value: 26, __n_value: 2 },
        { time_point: null, value: 4, __n_value: 2 },
      ],
    },
  },

  // ── Blank fold: detection vs rewriting, and the WHERE round trip ──────────
  {
    name: "blank fold groups NULL/spaces/tab together but leaves 'x' and ' x' distinct",
    fixture: "hmis_monthly",
    fetchConfig: { ...base(), groupBys: ["source_indicator"] },
    expect: {
      status: "ok",
      rows: [
        { source_indicator: "dhis2", value: 34 },
        { source_indicator: BLANK_SENTINEL, value: 15 },
        { source_indicator: "x", value: 1 },
        { source_indicator: " x", value: 2 },
      ],
    },
  },
  {
    name: "filter on __BLANK returns exactly the rows the fold grouped",
    fixture: "hmis_monthly",
    fetchConfig: {
      ...base(),
      groupBys: ["admin_area_2"],
      filters: [{ disOpt: "source_indicator", values: [BLANK_SENTINEL] }],
    },
    expect: {
      status: "ok",
      rows: [
        { admin_area_2: "A2_north", value: 5 },
        { admin_area_2: "A2_south", value: 10 },
      ],
    },
  },
  {
    name: "__BLANK filter AND a second filter → blankPredicate stays parenthesised",
    fixture: "hmis_monthly",
    fetchConfig: {
      ...base(),
      groupBys: ["admin_area_2"],
      filters: [
        { disOpt: "source_indicator", values: [BLANK_SENTINEL] },
        { disOpt: "admin_area_2", values: ["A2_south"] },
      ],
    },
    // Unparenthesised, the OR escapes its own filter and the north row (5)
    // comes back too.
    expect: { status: "ok", rows: [{ admin_area_2: "A2_south", value: 10 }] },
  },

  // ── Admin-area roll-up ───────────────────────────────────────────────────
  {
    name: "roll-up SUM → __NATIONAL equals the sum of children",
    fixture: "hmis_monthly",
    fetchConfig: {
      ...base(),
      groupBys: ["admin_area_2"],
      rollupDim: "admin_area_2",
    },
    expect: {
      status: "ok",
      rows: [
        { admin_area_2: "A2_north", value: 35 },
        { admin_area_2: "A2_south", value: 17 },
        { admin_area_2: ROLLUP_SENTINEL, value: 52 },
      ],
    },
  },
  {
    name: "roll-up with PAE → ratio RECOMPUTED after the union, not averaged",
    fixture: "hmis_ratio",
    fetchConfig: {
      values: [
        { prop: "num", func: "identity" },
        { prop: "den", func: "identity" },
      ],
      groupBys: ["admin_area_2"],
      filters: [],
      periodFilter: undefined,
      postAggregationExpression: "rate = num/den",
      rollupDim: "admin_area_2",
    },
    // Mean of ratios would be 0.1625; the correct recomputation is 80/1000.
    expect: {
      status: "ok",
      rows: [
        { admin_area_2: "A2_north", rate: 0.3 },
        { admin_area_2: "A2_south", rate: 0.025 },
        { admin_area_2: ROLLUP_SENTINEL, rate: 0.08 },
      ],
    },
  },
  {
    // The ethiopia v2b shape. den=20 spans two rows, so binding the wrapper's
    // `denominator` to the raw grouped value gives 40/20 = 2; the correct
    // aggregate binding gives 40/40 = 1 (and Postgres errors outright on the
    // unaliased ambiguity). See paeCollidingGroupBys.
    name: "PAE disaggregated by its own ingredient → wrapper binds the aggregate, not the raw group value",
    fixture: "hmis_scorecard",
    fetchConfig: {
      values: [
        { prop: "numerator", func: "SUM" },
        { prop: "denominator", func: "SUM" },
      ],
      groupBys: ["denominator"],
      filters: [],
      periodFilter: undefined,
      postAggregationExpression: "value = numerator/denominator",
    },
    expect: {
      status: "ok",
      rows: [
        { denominator: 20, value: 1 },
        { denominator: 50, value: 0.1 },
      ],
    },
  },
  {
    name: "PAE ingredient collision + roll-up → both UNION branches alias identically",
    fixture: "hmis_scorecard",
    fetchConfig: {
      values: [
        { prop: "numerator", func: "SUM" },
        { prop: "denominator", func: "SUM" },
      ],
      groupBys: ["admin_area_2", "denominator"],
      filters: [],
      periodFilter: undefined,
      postAggregationExpression: "value = numerator/denominator",
      rollupDim: "admin_area_2",
    },
    expect: {
      status: "ok",
      rows: [
        { admin_area_2: "A2_north", denominator: 20, value: 1 },
        { admin_area_2: "A2_south", denominator: 50, value: 0.1 },
        { admin_area_2: ROLLUP_SENTINEL, denominator: 20, value: 1 },
        { admin_area_2: ROLLUP_SENTINEL, denominator: 50, value: 0.1 },
      ],
    },
  },
  {
    // Without a PAE there is no wrapper layer to disambiguate, and the row
    // object would silently clobber the group value with the aggregate —
    // validateFetchConfig rejects the shape at the boundary.
    name: "non-PAE disaggregated by its own value prop → rejected at the boundary",
    fixture: "hmis_scorecard",
    fetchConfig: {
      values: [{ prop: "denominator", func: "SUM" }],
      groupBys: ["denominator"],
      filters: [],
      periodFilter: undefined,
      postAggregationExpression: undefined,
    },
    expect: { err: "value prop" },
  },
  {
    // The replicant round-trip on a NUMERIC dimension: replicating (or
    // filtering) by denominator sends its own values back as a filter, which
    // the text path would turn into UPPER(numeric) — a hard SQL error on both
    // engines. Pins buildWhereClause's numeric branch.
    name: "filter on a numeric dimension takes the numeric path, not UPPER()",
    fixture: "hmis_scorecard",
    fetchConfig: {
      values: [
        { prop: "numerator", func: "SUM" },
        { prop: "denominator", func: "SUM" },
      ],
      groupBys: ["denominator"],
      filters: [{ disOpt: "denominator", values: ["20"] }],
      periodFilter: undefined,
      postAggregationExpression: "value = numerator/denominator",
    },
    expect: {
      status: "ok",
      rows: [{ denominator: 20, value: 1 }],
    },
  },
  {
    // The UNSELECTED replicant sentinel can never match a numeric column;
    // the numeric branch drops it and emits FALSE — the same zero-match
    // outcome the text path gives it — rather than interpolating NaN.
    name: "non-numeric filter value on a numeric dimension matches nothing",
    fixture: "hmis_scorecard",
    fetchConfig: {
      values: [
        { prop: "numerator", func: "SUM" },
        { prop: "denominator", func: "SUM" },
      ],
      groupBys: ["denominator"],
      filters: [{ disOpt: "denominator", values: ["UNSELECTED"] }],
      periodFilter: undefined,
      postAggregationExpression: "value = numerator/denominator",
    },
    expect: { status: "no_data_available" },
  },
  {
    // Derived month is LPAD TEXT and not a physical column, so it is absent
    // from textColumns — the numeric branch's PERIOD exclusion is what keeps
    // it on the text path (`month IN (3)` breaks on text = integer).
    name: "month filter stays on the text path despite being absent from textColumns",
    fixture: "hmis_monthly",
    fetchConfig: {
      ...base(),
      groupBys: ["month"],
      filters: [{ disOpt: "month", values: ["02"] }],
    },
    expect: {
      status: "ok",
      rows: [{ month: "02", value: 25 }],
    },
  },
  {
    name: "roll-up AVG over facility-level rows → allowed",
    fixture: "hmis_ratio",
    fetchConfig: {
      ...base(),
      values: [{ prop: "value", func: "AVG" }],
      groupBys: ["admin_area_2"],
      rollupDim: "admin_area_2",
    },
    expect: {
      status: "ok",
      rows: [
        { admin_area_2: "A2_north", value: 10 },
        { admin_area_2: "A2_south", value: 30 },
        { admin_area_2: ROLLUP_SENTINEL, value: 20 },
      ],
    },
  },
  {
    name: "roll-up AVG without facility-level rows → refused",
    fixture: "hmis_area_only",
    fetchConfig: {
      ...base(),
      values: [{ prop: "value", func: "AVG" }],
      groupBys: ["admin_area_2"],
      rollupDim: "admin_area_2",
    },
    expect: { err: "AVG" },
  },
  {
    name: "roll-up level absent from groupBys → row silently omitted, not an error",
    fixture: "hmis_monthly",
    fetchConfig: {
      ...base(),
      groupBys: ["admin_area_3"],
      rollupDim: "admin_area_2",
    },
    // buildRollupQuery returns null rather than throwing: the server's
    // isAdminLevel/groupBys.includes checks are SQL-safety, not policy — the
    // client owns the collapse decision. Result is the plain grouping with no
    // __NATIONAL row.
    expect: {
      status: "ok",
      rows: [
        { admin_area_3: "A3_alpha", value: 30 },
        { admin_area_3: "A3_beta", value: 5 },
        { admin_area_3: "A3_gamma", value: 10 },
        { admin_area_3: "A3_delta", value: 7 },
      ],
    },
  },
  {
    name: "roll-up honours the same WHERE as the main query",
    fixture: "hmis_monthly",
    fetchConfig: {
      ...base(),
      groupBys: ["admin_area_2"],
      filters: [{ disOpt: "admin_area_2", values: ["A2_south"] }],
      rollupDim: "admin_area_2",
    },
    expect: {
      status: "ok",
      rows: [
        { admin_area_2: "A2_south", value: 17 },
        { admin_area_2: ROLLUP_SENTINEL, value: 17 },
      ],
    },
  },

  // ── Facility-column roll-up ──────────────────────────────────────────────
  //
  // Same UNION machinery as the admin roll-up, but the collapsed column lives
  // on the facility CTE (LEFT JOIN), not the results table, and the sentinel
  // is __ALL_FACILITIES.
  {
    name: "facility_type roll-up (HFA) → __ALL_FACILITIES row with whole-sample n",
    fixture: "hfa_service_cats",
    fetchConfig: {
      ...base(),
      groupBys: ["facility_type"],
      rollupDim: "facility_type",
    },
    // hospital = h1+h4, clinic = h2+h3, health_post = h5; the ALL row
    // re-counts distinct facilities over the whole table (5), not 2+2+1 rows.
    expect: {
      status: "ok",
      rows: [
        { facility_type: "hospital", value: 31, __n_value: 2 },
        { facility_type: "clinic", value: 21, __n_value: 2 },
        { facility_type: "health_post", value: 4, __n_value: 1 },
        { facility_type: ALL_FACILITIES_SENTINEL, value: 56, __n_value: 5 },
      ],
    },
  },
  {
    name: "facility_type roll-up honours a filter on the rolled column (subset total)",
    fixture: "hfa_service_cats",
    fetchConfig: {
      ...base(),
      groupBys: ["facility_type"],
      filters: [{ disOpt: "facility_type", values: ["hospital", "health_post"] }],
      rollupDim: "facility_type",
    },
    expect: {
      status: "ok",
      rows: [
        { facility_type: "hospital", value: 31, __n_value: 2 },
        { facility_type: "health_post", value: 4, __n_value: 1 },
        { facility_type: ALL_FACILITIES_SENTINEL, value: 35, __n_value: 3 },
      ],
    },
  },
  {
    name: "facility_type roll-up alongside admin grouping → one ALL row per area",
    fixture: "hfa_service_cats",
    fetchConfig: {
      ...base(),
      groupBys: ["admin_area_2", "facility_type"],
      rollupDim: "facility_type",
    },
    // The HFA-table shape this feature exists for: rows = area, columns =
    // facility type + an "All facilities" column. The roll-up branch keeps the
    // admin grouping and collapses only facility_type.
    expect: {
      status: "ok",
      rows: [
        { admin_area_2: "A2_north", facility_type: "hospital", value: 30, __n_value: 1 },
        { admin_area_2: "A2_north", facility_type: "clinic", value: 11, __n_value: 1 },
        { admin_area_2: "A2_south", facility_type: "clinic", value: 10, __n_value: 1 },
        { admin_area_2: "A2_south", facility_type: "hospital", value: 1, __n_value: 1 },
        { admin_area_2: "A2_south", facility_type: "health_post", value: 4, __n_value: 1 },
        { admin_area_2: "A2_north", facility_type: ALL_FACILITIES_SENTINEL, value: 41, __n_value: 2 },
        { admin_area_2: "A2_south", facility_type: ALL_FACILITIES_SENTINEL, value: 15, __n_value: 3 },
      ],
    },
  },
  {
    name: "facility_type roll-up (HMIS) → no n columns, facility join in both branches",
    fixture: "hmis_monthly",
    fetchConfig: {
      ...base(),
      groupBys: ["facility_type"],
      rollupDim: "facility_type",
    },
    expect: {
      status: "ok",
      rows: [
        { facility_type: "hospital", value: 33 },
        { facility_type: "clinic", value: 15 },
        { facility_type: "health_post", value: 4 },
        { facility_type: ALL_FACILITIES_SENTINEL, value: 52 },
      ],
    },
  },
  {
    name: "facility_type roll-up with PAE → ratio recomputed across facility types",
    fixture: "hmis_ratio",
    fetchConfig: {
      values: [
        { prop: "num", func: "identity" },
        { prop: "den", func: "identity" },
      ],
      groupBys: ["facility_type"],
      filters: [],
      periodFilter: undefined,
      postAggregationExpression: "rate = num/den",
      rollupDim: "facility_type",
    },
    // Mean of ratios would be 0.1625; the correct recomputation is 80/1000 —
    // the same invariant as the admin PAE case, but collapsing the facility
    // CTE column.
    expect: {
      status: "ok",
      rows: [
        { facility_type: "hospital", rate: 0.3 },
        { facility_type: "clinic", rate: 0.025 },
        { facility_type: ALL_FACILITIES_SENTINEL, rate: 0.08 },
      ],
    },
  },
  {
    name: "facility_type roll-up over blank-folded values → __BLANK group and ALL row coexist",
    fixture: "hfa_facility_blanks",
    fetchConfig: {
      ...base(),
      groupBys: ["facility_type"],
      rollupDim: "facility_type",
    },
    // e2 (NULL cell) and e_missing (unmatched LEFT JOIN) fold into one __BLANK
    // group in the main branch; the roll-up branch has no filter on the
    // collapsed column, so blank-typed facilities are INCLUDED in the ALL row
    // (35 over 3 facilities).
    expect: {
      status: "ok",
      rows: [
        { facility_type: "hospital", value: 10, __n_value: 1 },
        { facility_type: BLANK_SENTINEL, value: 25, __n_value: 2 },
        { facility_type: ALL_FACILITIES_SENTINEL, value: 35, __n_value: 3 },
      ],
    },
  },

  // ── Value prop facility_id + facility-column join (the Ghana shape) ───────
  //
  // The facility CTE joins in a facility_id of the same name, so every value
  // reference must be table-qualified — unqualified COUNT(facility_id) is
  // "ambiguous column reference" on both engines. Found by the Ghana parity
  // rig 2026-08-10; the corpus lacked this shape.
  {
    name: "COUNT(facility_id) disaggregated by a facility column → qualified, no ambiguity",
    fixture: "hmis_monthly",
    fetchConfig: {
      ...base(),
      values: [{ prop: "facility_id", func: "COUNT" }],
      groupBys: ["facility_type"],
    },
    // Record counts: hospital = f1(2)+f4(2), clinic = f2(1)+f3(2),
    // health_post = f5(1). Counts are NUMBERS: COUNT returns BIGINT and the
    // DuckDB executor resolves BigInt to number (throwing outside the safe
    // range) rather than handing back the driver's string, so a COUNT metric
    // now reaches the client as a number like every other value.
    expect: {
      status: "ok",
      rows: [
        { facility_type: "hospital", facility_id: 4 },
        { facility_type: "clinic", facility_id: 3 },
        { facility_type: "health_post", facility_id: 1 },
      ],
    },
  },
  {
    name: "HFA COUNT(facility_id) by facility column → sample-n FILTER qualified too",
    fixture: "hfa_service_cats",
    fetchConfig: {
      ...base(),
      values: [{ prop: "facility_id", func: "COUNT" }],
      groupBys: ["facility_type"],
    },
    // The plain-values sample-n path emits FILTER (WHERE facility_id IS NOT
    // NULL), which is the latent sibling of the aggregate ambiguity — this is
    // the only shape that reaches it with the join present. Record counts:
    // hospital = h1(2)+h4(1), clinic = h2(2)+h3(2), health_post = h5(1); n is
    // distinct facilities.
    expect: {
      status: "ok",
      rows: [
        { facility_type: "hospital", facility_id: 3, __n_facility_id: 2 },
        { facility_type: "clinic", facility_id: 4, __n_facility_id: 2 },
        { facility_type: "health_post", facility_id: 1, __n_facility_id: 1 },
      ],
    },
  },

  // ── Period scenarios: one physical time column per table ──────────────────
  {
    name: "quarter_id table: groupBy physical quarter_id",
    fixture: "hmis_quarterly",
    fetchConfig: { ...base(), groupBys: ["quarter_id"] },
    expect: {
      status: "ok",
      rows: [
        { quarter_id: 20234, value: 5 },
        { quarter_id: 20241, value: 10 },
        { quarter_id: 20242, value: 20 },
      ],
    },
  },
  {
    name: "quarter_id table: groupBy year derived via the period CTE",
    fixture: "hmis_quarterly",
    fetchConfig: { ...base(), groupBys: ["year"] },
    expect: {
      status: "ok",
      rows: [
        { year: 2023, value: 5 },
        { year: 2024, value: 30 },
      ],
    },
  },
  {
    name: "year-only table: groupBy physical year, no CTE derivable",
    fixture: "hmis_yearly",
    fetchConfig: { ...base(), groupBys: ["year"] },
    expect: {
      status: "ok",
      rows: [
        { year: 2023, value: 10 },
        { year: 2024, value: 25 },
      ],
    },
  },
  {
    name: "period_id table: derived month is zero-padded TEXT",
    fixture: "hmis_monthly",
    fetchConfig: { ...base(), groupBys: ["month"] },
    expect: {
      status: "ok",
      rows: [
        { month: "01", value: 23 },
        { month: "02", value: 25 },
        { month: "03", value: 4 },
      ],
    },
  },

  // ── HFA variant items (plain physical TEXT column, generic path) ─────────
  {
    name: "variant cross: groupBy hfa_indicator × hfa_variant_item",
    fixture: "hfa_variants",
    fetchConfig: { ...base(), groupBys: ["hfa_indicator", "hfa_variant_item"] },
    expect: {
      status: "ok",
      rows: [
        { hfa_indicator: "vacc", hfa_variant_item: "campaign", value: 38, __n_value: 2 },
        { hfa_indicator: "vacc", hfa_variant_item: "routine", value: 6, __n_value: 2 },
        { hfa_indicator: "water", hfa_variant_item: "piped", value: 2, __n_value: 1 },
      ],
    },
  },
  {
    name: "variant filter: hfa_variant_item as filter under indicator+round scope",
    fixture: "hfa_variants",
    fetchConfig: {
      ...base(),
      groupBys: ["hfa_variant_item"],
      filters: [
        { disOpt: "hfa_indicator", values: ["vacc"] },
        { disOpt: "time_point", values: ["baseline"] },
      ],
    },
    expect: {
      status: "ok",
      rows: [
        { hfa_variant_item: "campaign", value: 30, __n_value: 2 },
        { hfa_variant_item: "routine", value: 6, __n_value: 2 },
      ],
    },
  },
  {
    name: "variant replicant options: possible values for hfa_variant_item",
    fixture: "hfa_variants",
    entry: "possibleValues",
    disOpt: "hfa_variant_item",
    fetchConfig: { ...base(), groupBys: [] },
    // Labels come from the package's own variant-item mirror through the
    // manifest's stamped indicator catalog — an item whose id is not in the
    // catalog would fall back to labelling itself.
    expect: {
      values: [
        { id: "campaign", label: "Campaign" },
        { id: "piped", label: "Piped" },
        { id: "routine", label: "Routine" },
      ],
    },
  },

  // ── Option lists ─────────────────────────────────────────────────────────
  {
    name: "possible values: __BLANK offered and sorted LAST",
    fixture: "hmis_monthly",
    entry: "possibleValues",
    disOpt: "source_indicator",
    fetchConfig: { ...base(), groupBys: [] },
    // The WHOLE order is ours: get_possible_values re-sorts in TS with a
    // hand-rolled comparator (code point over a case-folded diacritic-stripped
    // key, numeric digit runs), so neither the DB image's collation nor the
    // host runtime's ICU version may move these. " x" sorts FIRST — the
    // leading space (0x20) precedes every letter by code point. (The previous
    // expectation encoded DB-collation order, and the Intl.Collator that
    // replaced it flipped this pair across a Deno upgrade — both were
    // environment-dependent, which is what the comparator now forbids.) The
    // sentinel is moved last by TS regardless.
    expect: {
      values: [
        { id: " x", label: " x" },
        { id: "dhis2", label: "dhis2" },
        { id: "x", label: "x" },
        { id: BLANK_SENTINEL, label: BLANK_SENTINEL },
      ],
    },
  },
  {
    name: "possible values: multi-membership unnested to single ids, labelled",
    fixture: "hfa_service_cats",
    entry: "possibleValues",
    disOpt: "hfa_service_category",
    fetchConfig: { ...base(), groupBys: [] },
    expect: {
      values: [
        { id: "malaria", label: "Malaria" },
        { id: "nutrition", label: "Nutrition" },
        { id: "rmnch", label: "RMNCH" },
      ],
    },
  },

  // ── The fold reaches JOINED facility columns, from both blank origins ─────
  {
    name: "facility column: NULL cell and unmatched LEFT JOIN fold to ONE __BLANK",
    fixture: "hfa_facility_blanks",
    fetchConfig: { ...base(), groupBys: ["facility_type"] },
    // e2 has a facilities row with a NULL type; e_missing has no facilities row
    // at all, so the join manufactures the NULL. One group, not two.
    expect: {
      status: "ok",
      rows: [
        { facility_type: "hospital", value: 10, __n_value: 1 },
        { facility_type: BLANK_SENTINEL, value: 25, __n_value: 2 },
      ],
    },
  },
  {
    name: "facility column: __BLANK filter selects both blank origins",
    fixture: "hfa_facility_blanks",
    fetchConfig: {
      ...base(),
      groupBys: ["admin_area_2"],
      filters: [{ disOpt: "facility_type", values: [BLANK_SENTINEL] }],
    },
    expect: {
      status: "ok",
      rows: [
        { admin_area_2: "A2_north", value: 20, __n_value: 1 },
        { admin_area_2: "A2_south", value: 5, __n_value: 1 },
      ],
    },
  },

  // ── Option-list cap: the sentinel must not consume a named slot ───────────
  {
    name: "option cap: exactly 500 named values PLUS a blank stays ok",
    fixture: "hmis_option_cap",
    entry: "metricInfo",
    fetchConfig: { ...base(), groupBys: [] },
    // 501 options come back; the cap counts the 500 named ones. Counting the
    // sentinel would flip this to too_many_values and the filter would vanish.
    expect: {
      dimStatus: {
        disOpt: "source_indicator",
        status: "ok",
        namedCount: 500,
      },
    },
  },
  {
    name: "option cap: 501 named values is too_many_values",
    fixture: "hmis_option_cap",
    entry: "metricInfo",
    fetchConfig: { ...base(), groupBys: [] },
    expect: {
      dimStatus: { disOpt: "target_population", status: "too_many_values" },
    },
  },

  // ── Sample size (__n_*) ──────────────────────────────────────────────────
  //
  // The contract: n = distinct facilities contributing, HFA only, and only
  // where the results table has facility_id. Every other case in this file
  // doubles as coverage of the last two clauses — an HMIS expectation that
  // grew an __n_value column would fail on the exact-shape compare.
  {
    name: "n counts distinct FACILITIES, not rows",
    fixture: "hfa_service_cats",
    fetchConfig: { ...base(), groupBys: ["admin_area_2"] },
    // North is h1 + h2 over 4 rows (two time points each), south is h3+h4+h5
    // over 4 rows. A row count would say 4/4; the sample size is 2/3.
    expect: {
      status: "ok",
      rows: [
        { admin_area_2: "A2_north", value: 41, __n_value: 2 },
        { admin_area_2: "A2_south", value: 15, __n_value: 3 },
      ],
    },
  },
  {
    name: "n rides the roll-up UNION: the __NATIONAL row carries the whole sample",
    fixture: "hfa_service_cats",
    fetchConfig: {
      ...base(),
      groupBys: ["admin_area_2"],
      rollupDim: "admin_area_2",
    },
    // Both branches must project the same columns or the UNION would not
    // typecheck; the national row re-counts over the whole table (5 facilities,
    // 8 rows) rather than adding 2 + 3.
    expect: {
      status: "ok",
      rows: [
        { admin_area_2: "A2_north", value: 41, __n_value: 2 },
        { admin_area_2: "A2_south", value: 15, __n_value: 3 },
        { admin_area_2: ROLLUP_SENTINEL, value: 56, __n_value: 5 },
      ],
    },
  },
  {
    name: "HFA table without facility_id emits no n (and no SQL error)",
    fixture: "hfa_area_only",
    fetchConfig: { ...base(), groupBys: ["admin_area_2"] },
    // The family gate alone would emit COUNT(DISTINCT facility_id) here and
    // fail with "column facility_id does not exist".
    expect: {
      status: "ok",
      rows: [
        { admin_area_2: "A2_north", value: 10 },
        { admin_area_2: "A2_south", value: 30 },
      ],
    },
  },
  {
    name: "HMIS emits no n even with facility rows",
    fixture: "hmis_monthly",
    fetchConfig: { ...base(), groupBys: ["admin_area_2"] },
    // Not a capability gap: a count over a monthly facility panel returns
    // facility-months, which no reader interprets as a sample size.
    expect: {
      status: "ok",
      rows: [
        { admin_area_2: "A2_north", value: 35 },
        { admin_area_2: "A2_south", value: 17 },
      ],
    },
  },

  // ── A one-member set column is NOT a constant dimension ──────────────────
  {
    name: "single-member multi-membership column is not treated as single-valued",
    fixture: "hfa_facility_blanks",
    entry: "metricInfo",
    fetchConfig: { ...base(), groupBys: [] },
    // Every row is tagged "rmnch", so the option list holds exactly one value.
    // For a scalar column that would mean "constant, hide the filter"; for a
    // set column it means one member of the vocabulary is in use, and rows
    // still split into has-member and has-none. Treating it as constant hid
    // the service-category filter entirely.
    expect: {
      dimStatus: {
        disOpt: "hfa_service_category",
        status: "ok",
        namedCount: 1,
        isSingleValueDim: false,
      },
    },
  },
  {
    // from_month means "to present": the stored max is schema-mandated but
    // ignored at query time — the upper bound re-anchors to the live data's
    // max. Stored figure configs can now carry this filter type (the AI patch
    // schema's open-ended periodFilter), so pin the semantics: max says
    // 202402, the data reaches 202403, and 202403 is included.
    name: "from_month ignores its stored max — range extends to the live data max",
    fixture: "hmis_monthly",
    fetchConfig: {
      ...base(),
      groupBys: ["period_id"],
      periodFilter: { filterType: "from_month", min: 202402, max: 202402 },
    },
    expect: {
      status: "ok",
      rows: [
        { period_id: 202402, value: 25 },
        { period_id: 202403, value: 4 },
      ],
    },
  },
  {
    // Year-granularity data collapses every non-custom filter to the latest
    // year (getPeriodFilterExactBounds). Judged intended 2026-08-03: the UI's
    // only relative option for year data is "Last year", stored as
    // last_n_months(12), and {min: max, max} is exactly what it means. Module
    // presets on annual metrics (m006/m009) rely on the same collapse.
    name: "year table: last_n_months means 'Last year' — collapses to latest year",
    fixture: "hmis_yearly",
    fetchConfig: {
      ...base(),
      groupBys: ["year"],
      periodFilter: { filterType: "last_n_months", nMonths: 12 },
    },
    expect: { status: "ok", rows: [{ year: 2024, value: 25 }] },
  },
  {
    // Same collapse for a bounded from_month: min 2023 is discarded, latest
    // year only. Judged acceptable 2026-08-03 because the state is
    // near-unreachable — the AI patch path rejects open-ended filters on year
    // granularity (applyFigureConfigPatch), the UI never offers from_month
    // for year data, and no module has ever changed a metric's granularity
    // (the drift class the quarter_id block degrades for). If the engine is
    // ever made type-aware, this case must go red and be re-judged.
    name: "year table: from_month min is discarded — latest year only",
    fixture: "hmis_yearly",
    fetchConfig: {
      ...base(),
      groupBys: ["year"],
      periodFilter: { filterType: "from_month", min: 2023, max: 2024 },
    },
    expect: { status: "ok", rows: [{ year: 2024, value: 25 }] },
  },

  // ── Per-family structure schemas (PLAN_2 split) ───────────────────────────
  // The fixture is HFA depth 2 / includeTypes ON while seedInstance seeds the
  // hmis row divergent (depth 4, flags inverted → includeTypes OFF). Each case
  // only passes if the engine resolved the HFA row.
  {
    name: "diverging family schemas: facility_type group-by uses the HFA row",
    fixture: "hfa_divergent_schema",
    fetchConfig: { ...base(), groupBys: ["facility_type"] },
    expect: {
      status: "ok",
      rows: [
        { facility_type: "hospital", value: 15, __n_value: 2 },
        { facility_type: "clinic", value: 20, __n_value: 1 },
      ],
    },
  },
  {
    name: "diverging family schemas: facility_type option list uses the HFA row",
    fixture: "hfa_divergent_schema",
    entry: "possibleValues",
    disOpt: "facility_type",
    fetchConfig: { ...base(), groupBys: [] },
    expect: {
      values: [
        { id: "clinic", label: "clinic" },
        { id: "hospital", label: "hospital" },
      ],
    },
  },
  {
    name: "diverging family schemas: metric info offers facility_type for HFA",
    fixture: "hfa_divergent_schema",
    entry: "metricInfo",
    fetchConfig: { ...base(), groupBys: [] },
    expect: {
      dimStatus: { disOpt: "facility_type", status: "ok", namedCount: 2 },
    },
  },
];

// ── Admin-area-2 scope (D7) ─────────────────────────────────────────────────
//
// Scope is the second half of a read context, and it is applied by INJECTING
// filters the caller never sent — so every case here is paired with the
// national reading of the same query, and the echoed fetchConfig assertion in
// the runner covers all of them at once. The three branches of
// computeScopeFilters each get a pair: RO carries admin_area_2 (direct), RO
// carries only a child column (derived from the facilities parquet), RO
// carries no admin column at all (the blessed unfiltered case) — plus the
// fail-CLOSED branch, where the derivation cannot run.
const SCOPE_CASES: Case[] = [
  {
    name: "scope: RO carrying admin_area_2 is filtered directly",
    fixture: "hmis_monthly",
    adminArea2: "A2_south",
    fetchConfig: { ...base(), groupBys: ["admin_area_2"] },
    // National returns both areas (35 / 17) — see the group-by case above.
    expect: { status: "ok", rows: [{ admin_area_2: "A2_south", value: 17 }] },
  },
  {
    name: "scope: the direct filter also bounds a child-level grouping",
    fixture: "hmis_monthly",
    adminArea2: "A2_south",
    fetchConfig: { ...base(), groupBys: ["admin_area_3"] },
    // National holds A3_alpha 30 and A3_beta 5 as well.
    expect: {
      status: "ok",
      rows: [
        { admin_area_3: "A3_gamma", value: 10 },
        { admin_area_3: "A3_delta", value: 7 },
      ],
    },
  },
  {
    name: "scope: national option list offers every area",
    fixture: "hmis_monthly",
    entry: "possibleValues",
    disOpt: "admin_area_2",
    fetchConfig: { ...base(), groupBys: [] },
    expect: {
      values: [
        { id: "A2_north", label: "A2_north" },
        { id: "A2_south", label: "A2_south" },
      ],
    },
  },
  {
    name: "scope: scoped option list offers only the scoped area",
    fixture: "hmis_monthly",
    adminArea2: "A2_south",
    entry: "possibleValues",
    disOpt: "admin_area_2",
    fetchConfig: { ...base(), groupBys: [] },
    // The option list is a data query like any other, so scope reaches it —
    // otherwise a scoped product would offer a filter value with no rows.
    expect: { values: [{ id: "A2_south", label: "A2_south" }] },
  },
  {
    name: "scope: metric info option lists are national by default",
    fixture: "hmis_monthly",
    entry: "metricInfo",
    fetchConfig: { ...base(), groupBys: [] },
    expect: {
      dimStatus: { disOpt: "admin_area_2", status: "ok", namedCount: 2 },
    },
  },
  {
    name: "scope: metric info option lists narrow under scope",
    fixture: "hmis_monthly",
    adminArea2: "A2_south",
    entry: "metricInfo",
    fetchConfig: { ...base(), groupBys: [] },
    // The scope rides the context, not the arguments, so it reaches the whole
    // metric-info payload — the client's replicant lists included.
    expect: {
      dimStatus: { disOpt: "admin_area_2", status: "ok", namedCount: 1 },
    },
  },
  {
    name: "scope: admin3-only RO is unfiltered when national",
    fixture: "hmis_admin3_only",
    fetchConfig: { ...base(), groupBys: ["admin_area_3"] },
    expect: {
      status: "ok",
      rows: [
        { admin_area_3: "A3_alpha", value: 10 },
        { admin_area_3: "A3_beta", value: 5 },
        { admin_area_3: "A3_gamma", value: 7 },
        { admin_area_3: "A3_delta", value: 1 },
      ],
    },
  },
  {
    name: "scope: admin3-only RO filters by children DERIVED from the facilities parquet",
    fixture: "hmis_admin3_only",
    adminArea2: "A2_south",
    // A2_south's children are A3_gamma (f3) and A3_delta (f4, f5); the
    // derivation matches by NAME, and the values it finds become the filter.
    expect: {
      status: "ok",
      rows: [
        { admin_area_3: "A3_gamma", value: 7 },
        { admin_area_3: "A3_delta", value: 1 },
      ],
    },
    fetchConfig: { ...base(), groupBys: ["admin_area_3"] },
  },
  {
    name: "scope: derivation-less package is national when unscoped",
    fixture: "admin3_no_family",
    fetchConfig: { ...base(), groupBys: ["admin_area_3"] },
    expect: {
      status: "ok",
      rows: [
        { admin_area_3: "A3_alpha", value: 10 },
        { admin_area_3: "A3_gamma", value: 7 },
      ],
    },
  },
  {
    name: "scope: an admin RO whose scope cannot be derived fails CLOSED",
    fixture: "admin3_no_family",
    adminArea2: "A2_south",
    // The module's sources are all upstream results objects, so its family —
    // and with it the facilities parquet the derivation needs — is
    // undeclarable. The sentinel filter matches nothing: blank is wrong
    // visibly, national data under a regional heading is wrong silently.
    expect: { status: "no_data_available" },
    fetchConfig: { ...base(), groupBys: ["admin_area_3"] },
  },
  {
    name: "scope: an RO with no admin column at all stays unfiltered",
    fixture: "hfa_variants",
    adminArea2: "A2_south",
    // The one blessed unfiltered case. Identical to the national reading of
    // the same group-by (38 / 6 / 2) — a national RO carries no area to
    // filter on, and refusing to serve it would blank every scoped product.
    fetchConfig: { ...base(), groupBys: ["hfa_indicator", "hfa_variant_item"] },
    expect: {
      status: "ok",
      rows: [
        { hfa_indicator: "vacc", hfa_variant_item: "campaign", value: 38, __n_value: 2 },
        { hfa_indicator: "vacc", hfa_variant_item: "routine", value: 6, __n_value: 2 },
        { hfa_indicator: "water", hfa_variant_item: "piped", value: 2, __n_value: 1 },
      ],
    },
  },
];

// The one genuinely calendar-dependent derivation. F1 holds 202401 (23),
// 202402 (25), 202403 (4). Gregorian puts all three in Q1; the Ethiopian
// quarter boundaries (2–4 / 5–7 / 8–10 / 11–1) split month 1 from months 2–3.
const QUARTER_DERIVATION: Case[] = [
  {
    name: "period_id → derived quarter_id (gregorian): months 1-3 are one quarter",
    fixture: "hmis_monthly",
    calendar: "gregorian",
    fetchConfig: { ...base(), groupBys: ["quarter_id"] },
    expect: { status: "ok", rows: [{ quarter_id: 20241, value: 52 }] },
  },
  {
    // The other half of the quarter derivation, and the only case that can see
    // it: `(period_id / 100) * 10 + q` needs INTEGER division, and F1's months
    // 1-3 hide the defect because the fraction they carry is too small to
    // reach the quarter digit. Months 10 and 12 both belong to Q4.
    name: "period_id → derived quarter_id (gregorian): late months land in Q4",
    fixture: "hmis_late_months",
    calendar: "gregorian",
    fetchConfig: { ...base(), groupBys: ["quarter_id"] },
    expect: {
      status: "ok",
      rows: [
        { quarter_id: 20241, value: 1 },
        { quarter_id: 20244, value: 6 },
      ],
    },
  },
  {
    // Ethiopian months 11-1 are Q1 of the NEXT year, so month 12 rolls the
    // year over — the branch that divides AND adds before multiplying.
    name: "period_id → derived quarter_id (ethiopian): month 12 rolls into next year's Q1",
    fixture: "hmis_late_months",
    calendar: "ethiopian",
    fetchConfig: { ...base(), groupBys: ["quarter_id"] },
    expect: {
      status: "ok",
      rows: [
        { quarter_id: 20241, value: 1 },
        { quarter_id: 20244, value: 2 },
        { quarter_id: 20251, value: 4 },
      ],
    },
  },
  {
    name: "period_id → derived quarter_id (ethiopian): month 1 splits from months 2-3",
    fixture: "hmis_monthly",
    calendar: "ethiopian",
    fetchConfig: { ...base(), groupBys: ["quarter_id"] },
    expect: {
      status: "ok",
      rows: [
        { quarter_id: 20241, value: 23 },
        { quarter_id: 20242, value: 29 },
      ],
    },
  },
];

export const CASES: Case[] = [
  ...EXPLICIT_CASES,
  ...SCOPE_CASES,
  ...PERIOD_MATRIX,
  ...QUARTER_DERIVATION,
];
