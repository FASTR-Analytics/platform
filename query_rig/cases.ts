import {
  ALL_FACILITIES_SENTINEL,
  BLANK_SENTINEL,
  geographyOnlyScopeDefinition,
  ROLLUP_SENTINEL,
} from "lib";
import type {
  DisaggregationOption,
  GenericLongFormFetchConfig,
  InstanceCalendar,
  PeriodBounds,
  ScopeDefinition,
} from "lib";
import { UNCONSTRAINED_SCOPE_DEFINITION } from "lib";

export type Case = {
  name: string;
  fixture: string;
  calendar?: InstanceCalendar;
  // The scope definition the read resolves under. Absent = unconstrained,
  // the whole package, which the rest of the corpus runs at.
  scope?: ScopeDefinition;
  // "possibleValues" runs the option-list query for `disOpt`, reusing
  // fetchConfig.filters as the filter set the route would pass.
  // "replicantOptions" runs the replicant read's uncached compute with
  // `disOpt` as replicateBy and the whole fetchConfig. "rawPreview" runs the
  // raw-rows preview, which takes no fetch config.
  entry?:
    | "items"
    | "possibleValues"
    | "metricInfo"
    | "replicantOptions"
    | "rawPreview";
  disOpt?: DisaggregationOption;
  fetchConfig: GenericLongFormFetchConfig;
  expect:
    | { status: "ok"; rows: Record<string, unknown>[] }
    | { status: "no_data_available" | "too_many_items" }
    // Ordered: the blank sentinel must land LAST, which SQL cannot do under
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
    // The metric-info payload's period bounds (null: none).
    | { periodBounds: PeriodBounds | null }
    // The replicant read's option ids, ordered (empty: no_values_available).
    | { replicantIds: string[] }
    // The preview's totalCount (0: no_data_available).
    | { rawCount: number }
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

// Generated matrix. Year derivation must NOT vary by calendar: only the
// quarter expression is calendar-dependent (getQuarterIdExpression), so this
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
    name:
      "filter one service category → set-membership overlap, not exact match",
    fixture: "hfa_service_cats",
    fetchConfig: {
      ...base(),
      groupBys: ["admin_area_2"],
      filters: [{ disOpt: "hfa_service_category", values: ["rmnch"] }],
    },
    // h1 and h2 contribute, over 4 rows: n is facilities, not rows.
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
    name:
      "groupBy TEXT time_point → NULL and spaces fold onto one __BLANK group",
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
    name:
      "blank fold groups NULL/spaces/tab together but leaves 'x' and ' x' distinct",
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
    name:
      "__BLANK filter AND a second filter → blankPredicate stays parenthesised",
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
    name:
      "PAE disaggregated by its own ingredient → wrapper binds the aggregate, not the raw group value",
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
    name:
      "PAE ingredient collision + roll-up → both UNION branches alias identically",
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
    // object would silently clobber the group value with the aggregate:
    // validateFetchConfig rejects the shape at the boundary.
    name:
      "non-PAE disaggregated by its own value prop → rejected at the boundary",
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
    // the text path would turn into UPPER(numeric): a hard SQL error on both
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
    // the numeric branch drops it and emits FALSE (the same zero-match
    // outcome the text path gives it) rather than interpolating NaN.
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
    // from textColumns: the numeric branch's PERIOD exclusion is what keeps
    // it on the text path (`month IN (3)` breaks on text = integer).
    name:
      "month filter stays on the text path despite being absent from textColumns",
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
    name:
      "roll-up level absent from groupBys → row silently omitted, not an error",
    fixture: "hmis_monthly",
    fetchConfig: {
      ...base(),
      groupBys: ["admin_area_3"],
      rollupDim: "admin_area_2",
    },
    // buildRollupQuery returns null rather than throwing: the server's
    // isAdminLevel/groupBys.includes checks are SQL-safety, not policy: the
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
    name:
      "facility_type roll-up (HFA) → __ALL_FACILITIES row with whole-sample n",
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
    name:
      "facility_type roll-up honours a filter on the rolled column (subset total)",
    fixture: "hfa_service_cats",
    fetchConfig: {
      ...base(),
      groupBys: ["facility_type"],
      filters: [{
        disOpt: "facility_type",
        values: ["hospital", "health_post"],
      }],
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
    name:
      "facility_type roll-up alongside admin grouping → one ALL row per area",
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
        {
          admin_area_2: "A2_north",
          facility_type: "hospital",
          value: 30,
          __n_value: 1,
        },
        {
          admin_area_2: "A2_north",
          facility_type: "clinic",
          value: 11,
          __n_value: 1,
        },
        {
          admin_area_2: "A2_south",
          facility_type: "clinic",
          value: 10,
          __n_value: 1,
        },
        {
          admin_area_2: "A2_south",
          facility_type: "hospital",
          value: 1,
          __n_value: 1,
        },
        {
          admin_area_2: "A2_south",
          facility_type: "health_post",
          value: 4,
          __n_value: 1,
        },
        {
          admin_area_2: "A2_north",
          facility_type: ALL_FACILITIES_SENTINEL,
          value: 41,
          __n_value: 2,
        },
        {
          admin_area_2: "A2_south",
          facility_type: ALL_FACILITIES_SENTINEL,
          value: 15,
          __n_value: 3,
        },
      ],
    },
  },
  {
    name:
      "facility_type roll-up (HMIS) → no n columns, facility join in both branches",
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
    name:
      "facility_type roll-up with PAE → ratio recomputed across facility types",
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
    // Mean of ratios would be 0.1625; the correct recomputation is 80/1000:
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
    name:
      "facility_type roll-up over blank-folded values → __BLANK group and ALL row coexist",
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
  // reference must be table-qualified: unqualified COUNT(facility_id) is
  // "ambiguous column reference" on both engines. Found by the Ghana parity
  // rig 2026-08-10; the corpus lacked this shape.
  {
    name:
      "COUNT(facility_id) disaggregated by a facility column → qualified, no ambiguity",
    fixture: "hmis_monthly",
    fetchConfig: {
      ...base(),
      values: [{ prop: "facility_id", func: "COUNT" }],
      groupBys: ["facility_type"],
    },
    // Record counts: hospital = f1(2)+f4(2), clinic = f2(1)+f3(2),
    // health_post = f5(1). Counts are STRINGS: COUNT returns bigint, which the
    // driver hands back untransformed: pre-existing behavior for every COUNT
    // metric (only the __n_* columns carry a ::int cast), pinned not blessed.
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
    name:
      "HFA COUNT(facility_id) by facility column → sample-n FILTER qualified too",
    fixture: "hfa_service_cats",
    fetchConfig: {
      ...base(),
      values: [{ prop: "facility_id", func: "COUNT" }],
      groupBys: ["facility_type"],
    },
    // The plain-values sample-n path emits FILTER (WHERE facility_id IS NOT
    // NULL), which is the latent sibling of the aggregate ambiguity: this is
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
        {
          hfa_indicator: "vacc",
          hfa_variant_item: "campaign",
          value: 38,
          __n_value: 2,
        },
        {
          hfa_indicator: "vacc",
          hfa_variant_item: "routine",
          value: 6,
          __n_value: 2,
        },
        {
          hfa_indicator: "water",
          hfa_variant_item: "piped",
          value: 2,
          __n_value: 1,
        },
      ],
    },
  },
  {
    name:
      "variant filter: hfa_variant_item as filter under indicator+round scope",
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
    // The pg plane has no item-label source (labels come from the run
    // snapshot files in the live plane), so ids label themselves here.
    expect: {
      values: [
        { id: "campaign", label: "campaign" },
        { id: "piped", label: "piped" },
        { id: "routine", label: "routine" },
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
    // The WHOLE order is ours: possible_values_core re-sorts in TS with a
    // hand-rolled comparator (code point over a case-folded diacritic-stripped
    // key, numeric digit runs), so neither the DB image's collation nor the
    // host runtime's ICU version may move these. " x" sorts FIRST: the
    // leading space (0x20) precedes every letter by code point. (The previous
    // expectation encoded DB-collation order, and the Intl.Collator that
    // replaced it flipped this pair across a Deno upgrade: both were
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
    name:
      "facility column: NULL cell and unmatched LEFT JOIN fold to ONE __BLANK",
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
  // doubles as coverage of the last two clauses: an HMIS expectation that
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
    name:
      "n rides the roll-up UNION: the __NATIONAL row carries the whole sample",
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
    name:
      "single-member multi-membership column is not treated as single-valued",
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
    // ignored at query time: the upper bound re-anchors to the live data's
    // max. Stored figure configs can now carry this filter type (the AI patch
    // schema's open-ended periodFilter), so pin the semantics: max says
    // 202402, the data reaches 202403, and 202403 is included.
    name:
      "from_month ignores its stored max, range extends to the live data max",
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
    name:
      "year table: last_n_months means 'Last year', collapses to latest year",
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
    // near-unreachable: the AI patch path rejects open-ended filters on year
    // granularity (applyFigureConfigPatch), the UI never offers from_month
    // for year data, and no module has ever changed a metric's granularity
    // (the drift class the quarter_id block degrades for). If the engine is
    // ever made type-aware, this case must go red and be re-judged.
    name: "year table: from_month min is discarded, latest year only",
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
    name:
      "diverging family schemas: facility_type option list uses the HFA row",
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

// The one genuinely calendar-dependent derivation. F1 holds 202401 (23),
// 202402 (25), 202403 (4). Gregorian puts all three in Q1; the Ethiopian
// quarter boundaries (2–4 / 5–7 / 8–10 / 11–1) split month 1 from months 2–3.
const QUARTER_DERIVATION: Case[] = [
  {
    name:
      "period_id → derived quarter_id (gregorian): months 1-3 are one quarter",
    fixture: "hmis_monthly",
    calendar: "gregorian",
    fetchConfig: { ...base(), groupBys: ["quarter_id"] },
    expect: { status: "ok", rows: [{ quarter_id: 20241, value: 52 }] },
  },
  {
    name:
      "period_id → derived quarter_id (ethiopian): month 1 splits from months 2-3",
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

const area = geographyOnlyScopeDefinition;

// The geography dimension. Scope is the second half of a read context, and
// it is applied as a predicate on the view the query runs against, which the
// caller's fetch config never shows, so every case here is paired with the
// national reading of the same query. The branches of scopePredicateFor each
// get a pair: the RO carries admin_area_2 (direct), the RO carries only a
// child column (filtered through the facilities view), the RO carries no
// admin column at all (served whole), plus the fail-CLOSED branch where no
// facilities view exists.
const SCOPE_CASES: Case[] = [
  {
    name: "scope: RO carrying admin_area_2 is filtered directly",
    fixture: "hmis_monthly",
    scope: area("A2_south"),
    fetchConfig: { ...base(), groupBys: ["admin_area_2"] },
    // National returns both areas (35 / 17): the group-by case above.
    expect: { status: "ok", rows: [{ admin_area_2: "A2_south", value: 17 }] },
  },
  {
    name: "scope: the direct filter also bounds a child-level grouping",
    fixture: "hmis_monthly",
    scope: area("A2_south"),
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
    name: "scope: the scope matches case-insensitively, like any filter value",
    fixture: "hmis_monthly",
    scope: area("a2_SOUTH"),
    fetchConfig: { ...base(), groupBys: ["admin_area_2"] },
    expect: { status: "ok", rows: [{ admin_area_2: "A2_south", value: 17 }] },
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
    scope: area("A2_south"),
    entry: "possibleValues",
    disOpt: "admin_area_2",
    fetchConfig: { ...base(), groupBys: [] },
    // The option list is a data query like any other, so scope reaches it:
    // otherwise a scoped product would offer a filter value with no rows.
    expect: { values: [{ id: "A2_south", label: "A2_south" }] },
  },
  {
    name: "scope: metric info option lists are national by default",
    fixture: "hfa_divergent_schema",
    entry: "metricInfo",
    fetchConfig: { ...base(), groupBys: [] },
    expect: {
      dimStatus: { disOpt: "admin_area_2", status: "ok", namedCount: 2 },
    },
  },
  {
    name: "scope: metric info option lists narrow under scope",
    fixture: "hfa_divergent_schema",
    scope: area("A2_south"),
    entry: "metricInfo",
    fetchConfig: { ...base(), groupBys: [] },
    // The scope rides the context, not the arguments, so it reaches the whole
    // metric-info payload, the client's replicant lists included.
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
    name:
      "scope: admin3-only RO filters by children DERIVED from the facilities parquet",
    fixture: "hmis_admin3_only",
    scope: area("A2_south"),
    fetchConfig: { ...base(), groupBys: ["admin_area_3"] },
    // A2_south's children are A3_gamma (f3) and A3_delta (f4, f5); the
    // subquery on the facilities view matches them by NAME.
    expect: {
      status: "ok",
      rows: [
        { admin_area_3: "A3_gamma", value: 7 },
        { admin_area_3: "A3_delta", value: 1 },
      ],
    },
  },
  {
    name:
      "scope: a scope with no children in the facilities parquet matches nothing",
    fixture: "hmis_admin3_only",
    scope: area("A2_nowhere"),
    fetchConfig: { ...base(), groupBys: ["admin_area_3"] },
    // The subquery on the facilities view returns no children, so the IN
    // matches nothing.
    expect: { status: "no_data_available" },
  },
  {
    name: "scope: derivation-less package is national when unscoped",
    fixture: "admin3_no_facilities",
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
    fixture: "admin3_no_facilities",
    scope: area("A2_south"),
    fetchConfig: { ...base(), groupBys: ["admin_area_3"] },
    // No facilities parquet, so the predicate is FALSE: blank is wrong
    // visibly, national data under a regional heading is wrong silently.
    expect: { status: "no_data_available" },
  },
  {
    name: "scope: an RO with no admin column at all stays unfiltered",
    fixture: "hfa_variants",
    scope: area("A2_south"),
    fetchConfig: { ...base(), groupBys: ["hfa_indicator", "hfa_variant_item"] },
    // The dimension does not apply. Identical to the national reading of
    // the same group-by (38 / 6 / 2): a national RO carries no area to
    // filter on, and refusing to serve it would blank every scoped product.
    expect: {
      status: "ok",
      rows: [
        {
          hfa_indicator: "vacc",
          hfa_variant_item: "campaign",
          value: 38,
          __n_value: 2,
        },
        {
          hfa_indicator: "vacc",
          hfa_variant_item: "routine",
          value: 6,
          __n_value: 2,
        },
        {
          hfa_indicator: "water",
          hfa_variant_item: "piped",
          value: 2,
          __n_value: 1,
        },
      ],
    },
  },
];

// The whole scope predicate, one row per branch of scopePredicateFor (the
// table in SYSTEM_09 "The scoped view"), each run through all five read kinds:
// items, option list, metric info, replicant options and the raw preview.
// `rows` is the items read grouped by `disOpt`; the other four expectations
// follow from it and from `rawCount`.
type ScopeMatrixRow = {
  name: string;
  fixture: string;
  scope: ScopeDefinition | undefined;
  disOpt: DisaggregationOption;
  rows: Record<string, unknown>[];
  rawCount: number;
};

type WholeReading = Omit<ScopeMatrixRow, "name" | "scope">;

const whole = UNCONSTRAINED_SCOPE_DEFINITION;

// The whole-package reading of each fixture in the matrix. A row whose
// dimension does not apply to the fixture spreads its fixture's entry, so the
// default principle is asserted as "the same rows as the whole package".
const WHOLE: Record<string, WholeReading> = {
  hmis: {
    fixture: "hmis_scope_dims",
    disOpt: "admin_area_2",
    rows: [
      { admin_area_2: "A2_north", value: 7 },
      { admin_area_2: "A2_south", value: 56 },
    ],
    rawCount: 6,
  },
  hfa: {
    fixture: "hfa_scope_dims",
    disOpt: "admin_area_2",
    rows: [
      { admin_area_2: "A2_north", value: 19 },
      { admin_area_2: "A2_south", value: 12 },
    ],
    rawCount: 5,
  },
  iceh: {
    fixture: "iceh_scope_dims",
    disOpt: "iceh_indicator",
    rows: [
      { iceh_indicator: "cov_a", value: 3 },
      { iceh_indicator: "cov_b", value: 12 },
    ],
    rawCount: 4,
  },
  hfaDated: {
    fixture: "hfa_dated_rounds",
    disOpt: "admin_area_2",
    rows: [
      { admin_area_2: "A2_north", value: 1 },
      { admin_area_2: "A2_south", value: 2 },
    ],
    rawCount: 2,
  },
  admin3: {
    fixture: "hmis_admin3_only",
    disOpt: "admin_area_3",
    rows: [
      { admin_area_3: "A3_alpha", value: 10 },
      { admin_area_3: "A3_beta", value: 5 },
      { admin_area_3: "A3_delta", value: 1 },
      { admin_area_3: "A3_gamma", value: 7 },
    ],
    rawCount: 4,
  },
  admin3NoFacilities: {
    fixture: "admin3_no_facilities",
    disOpt: "admin_area_3",
    rows: [
      { admin_area_3: "A3_alpha", value: 10 },
      { admin_area_3: "A3_gamma", value: 7 },
    ],
    rawCount: 2,
  },
  variants: {
    fixture: "hfa_variants",
    disOpt: "hfa_variant_item",
    rows: [
      { hfa_variant_item: "campaign", value: 38, __n_value: 2 },
      { hfa_variant_item: "piped", value: 2, __n_value: 1 },
      { hfa_variant_item: "routine", value: 6, __n_value: 2 },
    ],
    rawCount: 6,
  },
};

const EMPTY = { rows: [], rawCount: 0 };

const SCOPE_MATRIX_ROWS: ScopeMatrixRow[] = [
  ...Object.values(WHOLE).map((w) => ({
    ...w,
    name: `whole package: ${w.fixture}`,
    scope: undefined,
  })),

  // Modules.
  {
    ...WHOLE.hmis,
    ...EMPTY,
    name: "modules: a results object whose module is outside the list is empty",
    scope: { ...whole, modules: ["m_other"] },
  },
  {
    ...WHOLE.hmis,
    name: "modules: a results object whose module is in the list is whole",
    scope: { ...whole, modules: ["m_other", "m_scope_hmis"] },
  },

  // Geography.
  {
    ...WHOLE.hmis,
    name: "geography: admin_area_2 is filtered directly",
    scope: area("A2_south"),
    rows: [{ admin_area_2: "A2_south", value: 56 }],
    rawCount: 3,
  },
  {
    ...WHOLE.admin3,
    name: "geography: a child column is filtered through the facilities view",
    scope: area("A2_south"),
    rows: [
      { admin_area_3: "A3_delta", value: 1 },
      { admin_area_3: "A3_gamma", value: 7 },
    ],
    rawCount: 2,
  },
  {
    ...WHOLE.admin3NoFacilities,
    ...EMPTY,
    name: "geography: a child column with no facilities view is empty",
    scope: area("A2_south"),
  },
  {
    ...WHOLE.variants,
    name: "geography does not apply: no admin column, served whole",
    scope: area("A2_south"),
  },
  {
    ...WHOLE.iceh,
    name: "geography does not apply: the ICEH shape is served whole",
    scope: area("A2_south"),
  },

  // Years.
  {
    ...WHOLE.hmis,
    name: "years: a range on period_id",
    scope: {
      ...whole,
      time: { years: { start: 2025, end: 2025 }, hfaTimePoints: null },
    },
    rows: [{ admin_area_2: "A2_south", value: 16 }],
    rawCount: 1,
  },
  {
    ...WHOLE.iceh,
    name: "years: a range on a year column",
    scope: {
      ...whole,
      time: { years: { start: 2022, end: 2022 }, hfaTimePoints: null },
    },
    rows: [{ iceh_indicator: "cov_a", value: 1 }],
    rawCount: 1,
  },
  {
    ...WHOLE.hfa,
    name: "years do not apply: no physical time column, served whole",
    scope: {
      ...whole,
      time: { years: { start: 2024, end: 2024 }, hfaTimePoints: null },
    },
  },
  {
    ...WHOLE.hfaDated,
    name: "years do not apply: time_point beside a year column, served whole",
    scope: {
      ...whole,
      time: { years: { start: 2024, end: 2024 }, hfaTimePoints: null },
    },
  },

  // HFA time points.
  {
    ...WHOLE.hfa,
    name: "time points: time_point is filtered to the list",
    scope: {
      ...whole,
      time: { years: null, hfaTimePoints: ["midline", "no_such_round"] },
    },
    rows: [{ admin_area_2: "A2_north", value: 2 }],
    rawCount: 1,
  },
  {
    ...WHOLE.hfa,
    ...EMPTY,
    name: "time points: an empty list matches nothing",
    scope: { ...whole, time: { years: null, hfaTimePoints: [] } },
  },
  {
    ...WHOLE.hmis,
    name: "time points do not apply: no time_point column, served whole",
    scope: { ...whole, time: { years: null, hfaTimePoints: ["baseline"] } },
  },

  // Indicators, one list per indicator column.
  {
    ...WHOLE.hmis,
    name: "indicators: indicator_common_id is filtered to the hmis list",
    scope: {
      ...whole,
      indicators: { hmis: ["penta3"], hfa: null, iceh: null },
    },
    rows: [{ admin_area_2: "A2_south", value: 48 }],
    rawCount: 2,
  },
  {
    ...WHOLE.hfa,
    name: "indicators: hfa_indicator is filtered to the hfa list",
    scope: { ...whole, indicators: { hmis: null, hfa: ["ind_a"], iceh: null } },
    rows: [{ admin_area_2: "A2_north", value: 3 }],
    rawCount: 2,
  },
  {
    ...WHOLE.iceh,
    name: "indicators: iceh_indicator is filtered to the iceh list",
    scope: { ...whole, indicators: { hmis: null, hfa: null, iceh: ["cov_a"] } },
    rows: [{ iceh_indicator: "cov_a", value: 3 }],
    rawCount: 2,
  },
  {
    ...WHOLE.hmis,
    name: "indicators: a column whose own list is not set is served whole",
    scope: {
      ...whole,
      indicators: { hmis: null, hfa: ["ind_a"], iceh: ["cov_a"] },
    },
  },
  {
    ...WHOLE.admin3,
    name: "indicators do not apply: no indicator column, served whole",
    scope: {
      ...whole,
      indicators: { hmis: ["anc1"], hfa: ["ind_a"], iceh: ["cov_a"] },
    },
  },

  // The parts are ANDed.
  {
    ...WHOLE.hmis,
    name: "all parts together: area, year and indicator",
    scope: {
      geography: { adminArea2: "A2_south" },
      time: { years: { start: 2024, end: 2025 }, hfaTimePoints: ["baseline"] },
      modules: ["m_scope_hmis"],
      indicators: { hmis: ["anc1"], hfa: null, iceh: null },
    },
    rows: [{ admin_area_2: "A2_south", value: 8 }],
    rawCount: 1,
  },
];

const SCOPE_MATRIX: Case[] = SCOPE_MATRIX_ROWS.flatMap((row): Case[] => {
  const common = {
    fixture: row.fixture,
    scope: row.scope,
    disOpt: row.disOpt,
    fetchConfig: { ...base(), groupBys: [row.disOpt] },
  };
  const ids = row.rows.map((r) => String(r[row.disOpt]));
  return [
    {
      ...common,
      name: `${row.name} / items`,
      expect: row.rows.length === 0
        ? { status: "no_data_available" }
        : { status: "ok", rows: row.rows },
    },
    {
      ...common,
      name: `${row.name} / option list`,
      entry: "possibleValues",
      fetchConfig: { ...base(), groupBys: [] },
      expect: { values: ids.map((id) => ({ id, label: id })) },
    },
    {
      ...common,
      name: `${row.name} / metric info`,
      entry: "metricInfo",
      expect: {
        dimStatus: {
          disOpt: row.disOpt,
          status: ids.length === 0 ? "no_values_available" : "ok",
          ...(ids.length === 0 ? {} : { namedCount: ids.length }),
        },
      },
    },
    {
      ...common,
      name: `${row.name} / replicant options`,
      entry: "replicantOptions",
      expect: { replicantIds: ids },
    },
    {
      ...common,
      name: `${row.name} / raw preview`,
      entry: "rawPreview",
      expect: { rawCount: row.rawCount },
    },
  ];
});

const years = (start: number, end: number): ScopeDefinition => ({
  ...whole,
  time: { years: { start, end }, hfaTimePoints: null },
});

// What the matrix cannot express: the other physical time columns, an integer
// time_point, and the two readers that take period bounds from the manifest
// stamp instead of a query (R27).
const SCOPE_DIMENSION_CASES: Case[] = [
  {
    name: "years: a range on quarter_id",
    fixture: "hmis_quarterly",
    scope: years(2024, 2024),
    fetchConfig: { ...base(), groupBys: ["quarter_id"] },
    // The whole package also holds 20234 (5).
    expect: {
      status: "ok",
      rows: [
        { quarter_id: 20241, value: 10 },
        { quarter_id: 20242, value: 20 },
      ],
    },
  },
  {
    name: "time points: the list matches an INTEGER time_point",
    fixture: "hfa_timepoint_integer",
    scope: { ...whole, time: { years: null, hfaTimePoints: ["1"] } },
    fetchConfig: { ...base(), groupBys: ["time_point"] },
    // The whole package also holds round 2 (26) and the blank round (4).
    expect: {
      status: "ok",
      rows: [{ time_point: 1, value: 26, __n_value: 4 }],
    },
  },
  {
    name: "facilities view: the whole package joins every facility",
    fixture: "hfa_variants",
    fetchConfig: { ...base(), groupBys: ["facility_type"] },
    expect: {
      status: "ok",
      rows: [
        { facility_type: "hospital", value: 23, __n_value: 1 },
        { facility_type: "clinic", value: 23, __n_value: 2 },
      ],
    },
  },
  {
    name: "facilities view: it takes the geography part of the scope",
    fixture: "hfa_variants",
    scope: area("A2_south"),
    fetchConfig: { ...base(), groupBys: ["facility_type"] },
    // The results object has no admin column, so its rows are served whole
    // (the default principle), and the facilities view holds A2_south's
    // facilities only: the rows of h1 and h2, which sit in A2_north, join to
    // nothing and their facility columns read as blank. Intended (PLAN_SCOPES
    // 2.3): a facility outside the scope's area is not described.
    expect: {
      status: "ok",
      rows: [
        { facility_type: BLANK_SENTINEL, value: 44, __n_value: 2 },
        { facility_type: "clinic", value: 2, __n_value: 1 },
      ],
    },
  },
  {
    name: "period bounds: the whole package reads the manifest stamp",
    fixture: "hmis_scope_dims",
    entry: "metricInfo",
    fetchConfig: { ...base(), groupBys: [] },
    expect: { periodBounds: { min: 202306, max: 202501 } },
  },
  {
    name: "period bounds: the stamp is clamped to the scope's years",
    fixture: "hmis_scope_dims",
    scope: years(2024, 2024),
    entry: "metricInfo",
    fetchConfig: { ...base(), groupBys: [] },
    expect: { periodBounds: { min: 202401, max: 202412 } },
  },
  {
    name: "period bounds: a range wider than the package keeps the stamp",
    fixture: "hmis_scope_dims",
    scope: years(2000, 2100),
    entry: "metricInfo",
    fetchConfig: { ...base(), groupBys: [] },
    expect: { periodBounds: { min: 202306, max: 202501 } },
  },
  {
    name: "period bounds: years outside the package leave no bounds",
    fixture: "hmis_scope_dims",
    scope: years(2030, 2031),
    entry: "metricInfo",
    fetchConfig: { ...base(), groupBys: [] },
    expect: { periodBounds: null },
  },
  {
    name: "period bounds: a results object with time_point keeps the stamp",
    fixture: "hfa_dated_rounds",
    scope: years(2024, 2024),
    entry: "metricInfo",
    fetchConfig: { ...base(), groupBys: [] },
    // The year range does not apply to it (R18), so neither does the clamp.
    expect: { periodBounds: { min: 2022, max: 2024 } },
  },
  {
    name: "period bounds: geography does not move the stamp",
    fixture: "hmis_scope_dims",
    scope: area("A2_north"),
    entry: "metricInfo",
    fetchConfig: { ...base(), groupBys: [] },
    // A2_north's own rows end at 202412. SYSTEM_09 rules the package-wide
    // stamp fine for geography.
    expect: { periodBounds: { min: 202306, max: 202501 } },
  },
  {
    name: "replicant options: a relative filter anchors on the package max",
    fixture: "hmis_scope_dims",
    entry: "replicantOptions",
    disOpt: "admin_area_2",
    fetchConfig: {
      ...base(),
      groupBys: ["admin_area_2"],
      periodFilter: { filterType: "last_n_months", nMonths: 1 },
    },
    // The last month of the package is 202501, A2_south's.
    expect: { replicantIds: ["A2_south"] },
  },
  {
    name: "replicant options: under years it anchors on the clamped max",
    fixture: "hmis_scope_dims",
    scope: years(2024, 2024),
    entry: "replicantOptions",
    disOpt: "admin_area_2",
    fetchConfig: {
      ...base(),
      groupBys: ["admin_area_2"],
      periodFilter: { filterType: "last_n_months", nMonths: 1 },
    },
    // The last month inside the scope is 202412, A2_north's. Anchored on the
    // package-wide stamp the filter would be 202501, which the scoped view
    // does not hold, and the list would be empty.
    expect: { replicantIds: ["A2_north"] },
  },
];

export const CASES: Case[] = [
  ...EXPLICIT_CASES,
  ...PERIOD_MATRIX,
  ...QUARTER_DERIVATION,
  ...SCOPE_CASES,
  ...SCOPE_MATRIX,
  ...SCOPE_DIMENSION_CASES,
];
