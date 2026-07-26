import { BLANK_SENTINEL, ROLLUP_SENTINEL } from "lib";
import type {
  DisaggregationOption,
  GenericLongFormFetchConfig,
  InstanceCalendar,
} from "lib";

export type Case = {
  name: string;
  fixture: string;
  calendar?: InstanceCalendar;
  // "possibleValues" runs the option-list query for `disOpt`, reusing
  // fetchConfig.filters as the filter set the route would pass.
  entry?: "items" | "possibleValues";
  disOpt?: DisaggregationOption;
  fetchConfig: GenericLongFormFetchConfig;
  expect:
    | { status: "ok"; rows: Record<string, unknown>[] }
    | { status: "no_data_available" | "too_many_items" }
    // Ordered — the blank sentinel must land LAST, which SQL cannot do under
    // SELECT DISTINCT, so it is moved in TS.
    | { values: { id: string; label: string }[] }
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
    expect: { status: "ok", rows: [{ admin_area_2: "A2_north", value: 41 }] },
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
        { admin_area_2: "A2_north", value: 41 },
        { admin_area_2: "A2_south", value: 4 },
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
        { time_point: "baseline", value: 26 },
        { time_point: "midline", value: 26 },
        { time_point: BLANK_SENTINEL, value: 4 },
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
        { time_point: 1, value: 26 },
        { time_point: 2, value: 26 },
        { time_point: null, value: 4 },
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
      includeAdminAreaRollup: true,
      adminAreaRollupLevel: "admin_area_2",
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
      includeAdminAreaRollup: true,
      adminAreaRollupLevel: "admin_area_2",
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
    name: "roll-up AVG over facility-level rows → allowed",
    fixture: "hmis_ratio",
    fetchConfig: {
      ...base(),
      values: [{ prop: "value", func: "AVG" }],
      groupBys: ["admin_area_2"],
      includeAdminAreaRollup: true,
      adminAreaRollupLevel: "admin_area_2",
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
      includeAdminAreaRollup: true,
      adminAreaRollupLevel: "admin_area_2",
    },
    expect: { err: "AVG" },
  },
  {
    name: "roll-up level absent from groupBys → row silently omitted, not an error",
    fixture: "hmis_monthly",
    fetchConfig: {
      ...base(),
      groupBys: ["admin_area_3"],
      includeAdminAreaRollup: true,
      adminAreaRollupLevel: "admin_area_2",
    },
    // buildAdminAreaRollupQuery returns null rather than throwing: the server's
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
      includeAdminAreaRollup: true,
      adminAreaRollupLevel: "admin_area_2",
    },
    expect: {
      status: "ok",
      rows: [
        { admin_area_2: "A2_south", value: 17 },
        { admin_area_2: ROLLUP_SENTINEL, value: 17 },
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

  // ── Option lists ─────────────────────────────────────────────────────────
  {
    name: "possible values: __BLANK offered and sorted LAST",
    fixture: "hmis_monthly",
    entry: "possibleValues",
    disOpt: "source_indicator",
    fetchConfig: { ...base(), groupBys: [] },
    // Only the LAST position is ours: SQL cannot order the sentinel last under
    // SELECT DISTINCT, so TS moves it. The order of the named values is
    // Postgres collation under the pinned postgres:17.4 image — note it sorts
    // "dhis2" before " x", i.e. the leading space is not a primary difference.
    // If a base-image bump reshuffles those three, that is a collation change,
    // not a regression.
    expect: {
      values: [
        { id: "dhis2", label: "dhis2" },
        { id: " x", label: " x" },
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
  ...PERIOD_MATRIX,
  ...QUARTER_DERIVATION,
];
