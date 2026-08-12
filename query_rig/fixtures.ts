import type { PeriodOption } from "lib";

export type RoColumn = {
  name: string;
  type: "text" | "integer" | "double precision";
};

export type HfaSnapshots = {
  indicators: {
    var_name: string;
    category_id: string;
    sub_category_id: string;
    service_category_ids: string;
    short_label: string;
    definition: string;
    type: string;
    aggregation: string;
    sort_order: number;
  }[];
  categories: { id: string; label: string; sort_order: number }[];
  subCategories: {
    id: string;
    category_id: string;
    label: string;
    sort_order: number;
  }[];
  serviceCategories: { id: string; label: string; sort_order: number }[];
};

export type Fixture = {
  name: string;
  family: "hmis" | "hfa";
  // Seeded into the family's structure_schema_{family} row alongside the
  // flags. Not consumed by the query engine (ruling 4: flags only) — it makes
  // the seeded row a valid StructureSchema.
  adminDepth: 1 | 2 | 3 | 4;
  moduleId: string;
  moduleDefinition: Record<string, unknown>;
  resultsObjectId: string;
  facilityColumns: Record<string, boolean>;
  facilities: Record<string, string | null>[];
  roColumns: RoColumn[];
  roRows: Record<string, string | number | null>[];
  indicators: { indicator_common_id: string; indicator_common_label: string }[];
  hfaSnapshots?: HfaSnapshots;
  // Only needed by `metricInfo` cases — that entry resolves a metric row and
  // enriches it into a ResultsValue.
  metric?: {
    id: string;
    label: string;
    value_func: "SUM" | "AVG" | "COUNT" | "MIN" | "MAX" | "identity";
    format_as: "percent" | "number";
    value_props: string[];
    required_disaggregation_options: string[];
  };
  firstPeriodOption: PeriodOption | undefined;
};

const ALL_FACILITY_COLUMNS_OFF = {
  includeNames: false,
  includeTypes: false,
  includeOwnership: false,
  includeCustom1: false,
  includeCustom2: false,
  includeCustom3: false,
  includeCustom4: false,
  includeCustom5: false,
};

// F1 — HMIS, physical period_id (YYYYMM), facility-level rows.
//
// source_indicator is the blank-fold specimen: it carries NULL, a spaces-only
// cell, a tab-only cell, and the pair 'x' / ' x'. The pair is what proves the
// fold detects blankness without rewriting non-blank values — collapsing ' x'
// onto 'x' is the original defect in a new form.
//
// Sums by admin_area_2: A2_north = 35, A2_south = 17.
export const F1_HMIS_MONTHLY: Fixture = {
  name: "hmis_monthly",
  family: "hmis",
  adminDepth: 4,
  moduleId: "m_hmis",
  moduleDefinition: {
    scriptGenerationType: "standard",
    dataSources: [{ sourceType: "dataset", datasetType: "hmis" }],
  },
  resultsObjectId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
  facilityColumns: { ...ALL_FACILITY_COLUMNS_OFF, includeTypes: true },
  facilities: [
    { facility_id: "f1", admin_area_1: "Country", admin_area_2: "A2_north", admin_area_3: "A3_alpha", admin_area_4: "A4_w1", facility_type: "hospital" },
    { facility_id: "f2", admin_area_1: "Country", admin_area_2: "A2_north", admin_area_3: "A3_beta", admin_area_4: "A4_w2", facility_type: "clinic" },
    { facility_id: "f3", admin_area_1: "Country", admin_area_2: "A2_south", admin_area_3: "A3_gamma", admin_area_4: "A4_w3", facility_type: "clinic" },
    { facility_id: "f4", admin_area_1: "Country", admin_area_2: "A2_south", admin_area_3: "A3_delta", admin_area_4: "A4_w4", facility_type: "hospital" },
    { facility_id: "f5", admin_area_1: "Country", admin_area_2: "A2_south", admin_area_3: "A3_delta", admin_area_4: "A4_w5", facility_type: "health_post" },
  ],
  roColumns: [
    { name: "facility_id", type: "text" },
    { name: "period_id", type: "integer" },
    { name: "admin_area_2", type: "text" },
    { name: "admin_area_3", type: "text" },
    { name: "indicator_common_id", type: "text" },
    { name: "source_indicator", type: "text" },
    { name: "value", type: "double precision" },
  ],
  roRows: [
    { facility_id: "f1", period_id: 202401, admin_area_2: "A2_north", admin_area_3: "A3_alpha", indicator_common_id: "anc1", source_indicator: "dhis2", value: 10 },
    { facility_id: "f1", period_id: 202402, admin_area_2: "A2_north", admin_area_3: "A3_alpha", indicator_common_id: "anc1", source_indicator: "dhis2", value: 20 },
    { facility_id: "f2", period_id: 202401, admin_area_2: "A2_north", admin_area_3: "A3_beta", indicator_common_id: "anc1", source_indicator: null, value: 5 },
    { facility_id: "f3", period_id: 202401, admin_area_2: "A2_south", admin_area_3: "A3_gamma", indicator_common_id: "anc1", source_indicator: "   ", value: 7 },
    { facility_id: "f3", period_id: 202402, admin_area_2: "A2_south", admin_area_3: "A3_gamma", indicator_common_id: "anc1", source_indicator: "\t", value: 3 },
    { facility_id: "f4", period_id: 202401, admin_area_2: "A2_south", admin_area_3: "A3_delta", indicator_common_id: "anc1", source_indicator: "x", value: 1 },
    { facility_id: "f4", period_id: 202402, admin_area_2: "A2_south", admin_area_3: "A3_delta", indicator_common_id: "anc1", source_indicator: " x", value: 2 },
    { facility_id: "f5", period_id: 202403, admin_area_2: "A2_south", admin_area_3: "A3_delta", indicator_common_id: "anc1", source_indicator: "dhis2", value: 4 },
  ],
  indicators: [
    { indicator_common_id: "anc1", indicator_common_label: "ANC 1st visit" },
  ],
  firstPeriodOption: "period_id",
};

const HFA_SNAPSHOTS: HfaSnapshots = {
  indicators: [
    { var_name: "ind_a", category_id: "cat_1", sub_category_id: "sub_1", service_category_ids: '["rmnch","nutrition"]', short_label: "Indicator A", definition: "Facilities with A", type: "binary", aggregation: "avg", sort_order: 1 },
    { var_name: "ind_b", category_id: "cat_1", sub_category_id: "sub_1", service_category_ids: '["rmnch"]', short_label: "Indicator B", definition: "Facilities with B", type: "binary", aggregation: "avg", sort_order: 2 },
    { var_name: "ind_c", category_id: "cat_2", sub_category_id: "sub_2", service_category_ids: '["nutrition"]', short_label: "Indicator C", definition: "Facilities with C", type: "binary", aggregation: "avg", sort_order: 3 },
    { var_name: "ind_d", category_id: "cat_2", sub_category_id: "sub_2", service_category_ids: "[]", short_label: "Indicator D", definition: "Facilities with D", type: "binary", aggregation: "avg", sort_order: 4 },
    { var_name: "ind_e", category_id: "cat_2", sub_category_id: "sub_2", service_category_ids: '["malaria"]', short_label: "Indicator E", definition: "Facilities with E", type: "binary", aggregation: "avg", sort_order: 5 },
  ],
  categories: [
    { id: "cat_1", label: "Category One", sort_order: 1 },
    { id: "cat_2", label: "Category Two", sort_order: 2 },
  ],
  subCategories: [
    { id: "sub_1", category_id: "cat_1", label: "Sub One", sort_order: 1 },
    { id: "sub_2", category_id: "cat_2", label: "Sub Two", sort_order: 2 },
  ],
  serviceCategories: [
    { id: "rmnch", label: "RMNCH", sort_order: 1 },
    { id: "nutrition", label: "Nutrition", sort_order: 2 },
    { id: "malaria", label: "Malaria", sort_order: 3 },
  ],
};

const HFA_FACILITIES: Record<string, string | null>[] = [
  { facility_id: "h1", admin_area_1: "Country", admin_area_2: "A2_north", admin_area_3: "A3_alpha", admin_area_4: "A4_w1", facility_type: "hospital" },
  { facility_id: "h2", admin_area_1: "Country", admin_area_2: "A2_north", admin_area_3: "A3_beta", admin_area_4: "A4_w2", facility_type: "clinic" },
  { facility_id: "h3", admin_area_1: "Country", admin_area_2: "A2_south", admin_area_3: "A3_gamma", admin_area_4: "A4_w3", facility_type: "clinic" },
  { facility_id: "h4", admin_area_1: "Country", admin_area_2: "A2_south", admin_area_3: "A3_delta", admin_area_4: "A4_w4", facility_type: "hospital" },
  { facility_id: "h5", admin_area_1: "Country", admin_area_2: "A2_south", admin_area_3: "A3_delta", admin_area_4: "A4_w5", facility_type: "health_post" },
];

// F2 — HFA, hfa_service_category carrying pipe-joined SETS, time_point TEXT.
//
// Sums: by service-category membership rmnch = 41, malaria = 4.
// By time_point: baseline = 26, midline = 26, blank (NULL + spaces) = 4.
export const F2_HFA_SERVICE_CATS: Fixture = {
  name: "hfa_service_cats",
  family: "hfa",
  adminDepth: 4,
  moduleId: "m_hfa",
  moduleDefinition: {
    scriptGenerationType: "hfa",
    dataSources: [{ sourceType: "dataset", datasetType: "hfa" }],
  },
  resultsObjectId: "bbbbbbbb-cccc-dddd-eeee-ffffffffffff",
  facilityColumns: { ...ALL_FACILITY_COLUMNS_OFF, includeTypes: true },
  facilities: HFA_FACILITIES,
  roColumns: [
    { name: "facility_id", type: "text" },
    { name: "time_point", type: "text" },
    { name: "hfa_indicator", type: "text" },
    { name: "hfa_category", type: "text" },
    { name: "hfa_service_category", type: "text" },
    { name: "admin_area_2", type: "text" },
    { name: "value", type: "double precision" },
  ],
  roRows: [
    { facility_id: "h1", time_point: "baseline", hfa_indicator: "ind_a", hfa_category: "cat_1", hfa_service_category: "rmnch|nutrition", admin_area_2: "A2_north", value: 10 },
    { facility_id: "h1", time_point: "midline", hfa_indicator: "ind_a", hfa_category: "cat_1", hfa_service_category: "rmnch|nutrition", admin_area_2: "A2_north", value: 20 },
    { facility_id: "h2", time_point: "baseline", hfa_indicator: "ind_b", hfa_category: "cat_1", hfa_service_category: "rmnch", admin_area_2: "A2_north", value: 5 },
    { facility_id: "h2", time_point: "midline", hfa_indicator: "ind_b", hfa_category: "cat_1", hfa_service_category: "rmnch", admin_area_2: "A2_north", value: 6 },
    { facility_id: "h3", time_point: "baseline", hfa_indicator: "ind_c", hfa_category: "cat_2", hfa_service_category: "nutrition", admin_area_2: "A2_south", value: 7 },
    { facility_id: "h3", time_point: null, hfa_indicator: "ind_c", hfa_category: "cat_2", hfa_service_category: "nutrition", admin_area_2: "A2_south", value: 3 },
    { facility_id: "h4", time_point: "   ", hfa_indicator: "ind_d", hfa_category: "cat_2", hfa_service_category: "", admin_area_2: "A2_south", value: 1 },
    { facility_id: "h5", time_point: "baseline", hfa_indicator: "ind_e", hfa_category: "cat_2", hfa_service_category: "malaria", admin_area_2: "A2_south", value: 4 },
  ],
  indicators: [],
  hfaSnapshots: HFA_SNAPSHOTS,
  firstPeriodOption: undefined,
};

// F3 — F2 with ONE thing changed: time_point is declared `integer`.
//
// This pair is the whole point of the shouldFoldBlank type gate. The fold emits
// btrim() and returns a text sentinel from its CASE; Postgres rejects both on a
// numeric column, so a name-only gate turns working visualizations into a hard
// SQL error. Results-column types are authored per module, so the same option
// genuinely is text in one instance and integer in another.
export const F3_HFA_TIMEPOINT_INTEGER: Fixture = {
  ...F2_HFA_SERVICE_CATS,
  name: "hfa_timepoint_integer",
  moduleId: "m_hfa_int",
  resultsObjectId: "cccccccc-dddd-eeee-ffff-000000000000",
  roColumns: F2_HFA_SERVICE_CATS.roColumns.map((c) =>
    c.name === "time_point" ? { ...c, type: "integer" } : c
  ),
  roRows: F2_HFA_SERVICE_CATS.roRows.map((r) => ({
    ...r,
    time_point: r.time_point === "baseline"
      ? 1
      : r.time_point === "midline"
      ? 2
      : null,
  })),
};

function hmisModule(): Record<string, unknown> {
  return {
    scriptGenerationType: "standard",
    dataSources: [{ sourceType: "dataset", datasetType: "hmis" }],
  };
}

// F4 — facility-level rows with ratio ingredients, sized so that a recomputed
// roll-up ratio and a mean-of-ratios give visibly different answers:
//   recomputed 80/1000 = 0.08   vs   mean of (0.3, 0.025) = 0.1625
// AVG(value) is also meaningful here because rows are raw facility
// observations, which is the metric-side half of the roll-up gate.
export const F4_HMIS_RATIO: Fixture = {
  name: "hmis_ratio",
  family: "hmis",
  adminDepth: 4,
  moduleId: "m_ratio",
  moduleDefinition: hmisModule(),
  resultsObjectId: "dddddddd-eeee-ffff-0000-111111111111",
  facilityColumns: { ...ALL_FACILITY_COLUMNS_OFF, includeTypes: true },
  facilities: [
    { facility_id: "r1", admin_area_1: "Country", admin_area_2: "A2_north", admin_area_3: "A3_alpha", admin_area_4: "A4_w1", facility_type: "hospital" },
    { facility_id: "r2", admin_area_1: "Country", admin_area_2: "A2_south", admin_area_3: "A3_gamma", admin_area_4: "A4_w3", facility_type: "clinic" },
  ],
  roColumns: [
    { name: "facility_id", type: "text" },
    { name: "admin_area_2", type: "text" },
    { name: "period_id", type: "integer" },
    { name: "num", type: "double precision" },
    { name: "den", type: "double precision" },
    { name: "value", type: "double precision" },
  ],
  roRows: [
    { facility_id: "r1", admin_area_2: "A2_north", period_id: 202401, num: 60, den: 200, value: 10 },
    { facility_id: "r2", admin_area_2: "A2_south", period_id: 202401, num: 20, den: 800, value: 30 },
  ],
  indicators: [],
  firstPeriodOption: "period_id",
};

// F5 — pre-aggregated area rows, NO facility_id. Exists to prove the
// table-aware half of the roll-up gate: AVG over rows that are already area
// summaries is a population-blind mean, so it must be refused.
export const F5_HMIS_AREA_ONLY: Fixture = {
  name: "hmis_area_only",
  family: "hmis",
  adminDepth: 4,
  moduleId: "m_area_only",
  moduleDefinition: hmisModule(),
  resultsObjectId: "eeeeeeee-ffff-0000-1111-222222222222",
  facilityColumns: { ...ALL_FACILITY_COLUMNS_OFF },
  facilities: [],
  roColumns: [
    { name: "admin_area_2", type: "text" },
    { name: "period_id", type: "integer" },
    { name: "value", type: "double precision" },
  ],
  roRows: [
    { admin_area_2: "A2_north", period_id: 202401, value: 10 },
    { admin_area_2: "A2_south", period_id: 202401, value: 30 },
  ],
  indicators: [],
  firstPeriodOption: "period_id",
};

// F6 / F7 — the other two period scenarios. A results table has at most ONE
// physical time column (S8 drops the redundant ones), so each scenario needs
// its own fixture: quarter_id can derive `year` but not `month`, and a
// year-only table derives nothing.
export const F6_HMIS_QUARTERLY: Fixture = {
  name: "hmis_quarterly",
  family: "hmis",
  adminDepth: 4,
  moduleId: "m_quarterly",
  moduleDefinition: hmisModule(),
  resultsObjectId: "ffffffff-0000-1111-2222-333333333333",
  facilityColumns: { ...ALL_FACILITY_COLUMNS_OFF },
  facilities: [
    { facility_id: "q1", admin_area_1: "Country", admin_area_2: "A2_north", admin_area_3: "A3_alpha", admin_area_4: "A4_w1", facility_type: null },
    { facility_id: "q2", admin_area_1: "Country", admin_area_2: "A2_south", admin_area_3: "A3_gamma", admin_area_4: "A4_w3", facility_type: null },
  ],
  roColumns: [
    { name: "facility_id", type: "text" },
    { name: "admin_area_2", type: "text" },
    { name: "quarter_id", type: "integer" },
    { name: "value", type: "double precision" },
  ],
  roRows: [
    { facility_id: "q1", admin_area_2: "A2_north", quarter_id: 20241, value: 10 },
    { facility_id: "q1", admin_area_2: "A2_north", quarter_id: 20242, value: 20 },
    { facility_id: "q2", admin_area_2: "A2_south", quarter_id: 20234, value: 5 },
  ],
  indicators: [],
  firstPeriodOption: "quarter_id",
};

export const F7_HMIS_YEARLY: Fixture = {
  name: "hmis_yearly",
  family: "hmis",
  adminDepth: 4,
  moduleId: "m_yearly",
  moduleDefinition: hmisModule(),
  resultsObjectId: "00000000-1111-2222-3333-444444444444",
  facilityColumns: { ...ALL_FACILITY_COLUMNS_OFF },
  facilities: [
    { facility_id: "y1", admin_area_1: "Country", admin_area_2: "A2_north", admin_area_3: "A3_alpha", admin_area_4: "A4_w1", facility_type: null },
    { facility_id: "y2", admin_area_1: "Country", admin_area_2: "A2_south", admin_area_3: "A3_gamma", admin_area_4: "A4_w3", facility_type: null },
  ],
  roColumns: [
    { name: "facility_id", type: "text" },
    { name: "admin_area_2", type: "text" },
    { name: "year", type: "integer" },
    { name: "value", type: "double precision" },
  ],
  roRows: [
    { facility_id: "y1", admin_area_2: "A2_north", year: 2023, value: 10 },
    { facility_id: "y1", admin_area_2: "A2_north", year: 2024, value: 20 },
    { facility_id: "y2", admin_area_2: "A2_south", year: 2024, value: 5 },
  ],
  indicators: [],
  firstPeriodOption: "year",
};

// F8 — the two DIFFERENT origins of a blank facility cell, plus a
// multi-membership column holding exactly one member.
//
// `textColumns` spans the results table AND the joined facilities table, so the
// fold reaches facility columns. A blank there arrives two ways: a facilities
// row whose column is NULL (e2), and a results row whose facility_id matches no
// facilities row at all, where the LEFT JOIN manufactures the NULL (e_missing).
// Both must land in ONE __BLANK group — that is precisely why NULL and blank
// fold together rather than becoming two options.
export const F8_HFA_FACILITY_BLANKS: Fixture = {
  name: "hfa_facility_blanks",
  family: "hfa",
  adminDepth: 4,
  moduleId: "m_hfa_edge",
  moduleDefinition: {
    scriptGenerationType: "hfa",
    dataSources: [{ sourceType: "dataset", datasetType: "hfa" }],
  },
  resultsObjectId: "11111111-2222-3333-4444-555555555555",
  facilityColumns: { ...ALL_FACILITY_COLUMNS_OFF, includeTypes: true },
  facilities: [
    { facility_id: "e1", admin_area_1: "Country", admin_area_2: "A2_north", admin_area_3: "A3_alpha", admin_area_4: "A4_w1", facility_type: "hospital" },
    { facility_id: "e2", admin_area_1: "Country", admin_area_2: "A2_north", admin_area_3: "A3_beta", admin_area_4: "A4_w2", facility_type: null },
  ],
  roColumns: [
    { name: "facility_id", type: "text" },
    { name: "hfa_service_category", type: "text" },
    { name: "admin_area_2", type: "text" },
    { name: "value", type: "double precision" },
  ],
  roRows: [
    { facility_id: "e1", hfa_service_category: "rmnch", admin_area_2: "A2_north", value: 10 },
    { facility_id: "e2", hfa_service_category: "rmnch", admin_area_2: "A2_north", value: 20 },
    // No facilities row for e_missing — the LEFT JOIN yields NULL.
    { facility_id: "e_missing", hfa_service_category: "rmnch", admin_area_2: "A2_south", value: 5 },
  ],
  indicators: [],
  hfaSnapshots: HFA_SNAPSHOTS,
  metric: {
    id: "metric_edge",
    label: "Edge metric",
    value_func: "SUM",
    format_as: "number",
    value_props: ["value"],
    required_disaggregation_options: [],
  },
  firstPeriodOption: undefined,
};

// F9 — the replicant-options cap boundary. The cap counts NAMED values, and
// the query budget is MAX + 2, so the sentinel can neither displace a named
// value nor tip a dimension holding exactly MAX into too_many_values (which
// would make the filter disappear — the very failure the blank fold prevents).
//
//   source_indicator  : 500 named + a blank  → ok  (blank does not count)
//   target_population : 501 named            → too_many_values
const CAP_ROWS = Array.from({ length: 501 }, (_, i) => ({
  admin_area_2: "A2_north",
  source_indicator: i < 500 ? `si_${String(i).padStart(3, "0")}` : null,
  target_population: `tp_${String(i).padStart(3, "0")}`,
  value: 1,
}));

export const F9_HMIS_OPTION_CAP: Fixture = {
  name: "hmis_option_cap",
  family: "hmis",
  adminDepth: 4,
  moduleId: "m_cap",
  moduleDefinition: hmisModule(),
  resultsObjectId: "22222222-3333-4444-5555-666666666666",
  facilityColumns: { ...ALL_FACILITY_COLUMNS_OFF },
  facilities: [],
  roColumns: [
    { name: "admin_area_2", type: "text" },
    { name: "source_indicator", type: "text" },
    { name: "target_population", type: "text" },
    { name: "value", type: "double precision" },
  ],
  roRows: CAP_ROWS,
  indicators: [],
  metric: {
    id: "metric_cap",
    label: "Cap metric",
    value_func: "SUM",
    format_as: "number",
    value_props: ["value"],
    required_disaggregation_options: [],
  },
  firstPeriodOption: undefined,
};

// F10 — HFA rows already aggregated to area level, so NO facility_id. Exists to
// prove the table-aware half of the sample-n gate: n counts distinct facilities,
// and emitting the aggregate over a table without the column is not a wrong
// number but a hard SQL error ("column facility_id does not exist"). The
// family check alone would not catch this — F10 is HFA.
export const F10_HFA_AREA_ONLY: Fixture = {
  name: "hfa_area_only",
  family: "hfa",
  adminDepth: 4,
  moduleId: "m_hfa_area_only",
  moduleDefinition: {
    scriptGenerationType: "hfa",
    dataSources: [{ sourceType: "dataset", datasetType: "hfa" }],
  },
  resultsObjectId: "11111111-2222-3333-4444-555555555555",
  facilityColumns: { ...ALL_FACILITY_COLUMNS_OFF },
  facilities: [],
  roColumns: [
    { name: "admin_area_2", type: "text" },
    { name: "time_point", type: "text" },
    { name: "value", type: "double precision" },
  ],
  roRows: [
    { admin_area_2: "A2_north", time_point: "baseline", value: 10 },
    { admin_area_2: "A2_south", time_point: "baseline", value: 30 },
  ],
  indicators: [],
  firstPeriodOption: undefined,
};

// F11 — the HFA variants RO shape: hfa_variant_item is a plain TEXT NOT NULL
// physical column (never in the special registries), hfa_indicator carries the
// PARENT indicator, and each parent's rows span only its own group's items.
// Exercises the generic physical-column path for group-by / filter / option
// lists on the new column.
export const F11_HFA_VARIANTS: Fixture = {
  name: "hfa_variants",
  family: "hfa",
  adminDepth: 4,
  moduleId: "m_hfa_var",
  moduleDefinition: {
    scriptGenerationType: "hfa",
    dataSources: [{ sourceType: "dataset", datasetType: "hfa" }],
  },
  resultsObjectId: "22222222-3333-4444-5555-666666666666",
  facilityColumns: { ...ALL_FACILITY_COLUMNS_OFF },
  facilities: HFA_FACILITIES,
  roColumns: [
    { name: "facility_id", type: "text" },
    { name: "time_point", type: "text" },
    { name: "hfa_indicator", type: "text" },
    { name: "hfa_variant_item", type: "text" },
    { name: "hfa_category", type: "text" },
    { name: "value", type: "double precision" },
  ],
  roRows: [
    { facility_id: "h1", time_point: "baseline", hfa_indicator: "vacc", hfa_variant_item: "campaign", hfa_category: "cat_1", value: 10 },
    { facility_id: "h2", time_point: "baseline", hfa_indicator: "vacc", hfa_variant_item: "campaign", hfa_category: "cat_1", value: 20 },
    { facility_id: "h1", time_point: "midline", hfa_indicator: "vacc", hfa_variant_item: "campaign", hfa_category: "cat_1", value: 8 },
    { facility_id: "h1", time_point: "baseline", hfa_indicator: "vacc", hfa_variant_item: "routine", hfa_category: "cat_1", value: 5 },
    { facility_id: "h2", time_point: "baseline", hfa_indicator: "vacc", hfa_variant_item: "routine", hfa_category: "cat_1", value: 1 },
    { facility_id: "h3", time_point: "baseline", hfa_indicator: "water", hfa_variant_item: "piped", hfa_category: "cat_2", value: 2 },
  ],
  indicators: [],
  hfaSnapshots: HFA_SNAPSHOTS,
  firstPeriodOption: undefined,
};

// F12 — the ethiopia v2b shape (m8 scorecard): `denominator` is BOTH a PAE
// ingredient (`value = numerator / denominator` over SUM ingredients) and a
// disaggregation option. The inner query then emits the grouped column and a
// same-named aggregate alias, which the PAE wrapper must disambiguate
// (paeCollidingGroupBys). Numbers are chosen so a wrong binding cannot
// coincidentally pass: den=20 spans two rows, so binding the wrapper's
// `denominator` to the raw grouped value gives 40/20 = 2 while the correct
// aggregate binding gives 40/40 = 1.
export const F12_HMIS_SCORECARD: Fixture = {
  name: "hmis_scorecard",
  family: "hmis",
  adminDepth: 4,
  moduleId: "m_scorecard",
  moduleDefinition: hmisModule(),
  resultsObjectId: "33333333-4444-5555-6666-777777777777",
  facilityColumns: { ...ALL_FACILITY_COLUMNS_OFF },
  facilities: [],
  roColumns: [
    { name: "admin_area_2", type: "text" },
    { name: "period_id", type: "integer" },
    { name: "numerator", type: "double precision" },
    { name: "denominator", type: "double precision" },
  ],
  roRows: [
    { admin_area_2: "A2_north", period_id: 202401, numerator: 10, denominator: 20 },
    { admin_area_2: "A2_north", period_id: 202401, numerator: 30, denominator: 20 },
    { admin_area_2: "A2_south", period_id: 202401, numerator: 5, denominator: 50 },
  ],
  indicators: [],
  firstPeriodOption: "period_id",
};

// F13 — the family-split divergence specimen: an HFA fixture at depth 2 with
// includeTypes ON, while seedInstance seeds the OTHER family's row with a
// different depth AND inverted flags (so hmis carries includeTypes OFF here).
// The facility_type cases only pass if the engine picked the HFA row — reading
// the hmis row would drop the facility join and kill the option/group-by.
export const F13_HFA_DIVERGENT_SCHEMA: Fixture = {
  name: "hfa_divergent_schema",
  family: "hfa",
  adminDepth: 2,
  moduleId: "m_hfa_div",
  moduleDefinition: {
    scriptGenerationType: "hfa",
    dataSources: [{ sourceType: "dataset", datasetType: "hfa" }],
  },
  resultsObjectId: "33333333-4444-5555-6666-777777777777",
  facilityColumns: { ...ALL_FACILITY_COLUMNS_OFF, includeTypes: true },
  facilities: [
    { facility_id: "d1", admin_area_1: "Country", admin_area_2: "A2_north", admin_area_3: "A2_north", admin_area_4: "A2_north", facility_type: "hospital" },
    { facility_id: "d2", admin_area_1: "Country", admin_area_2: "A2_north", admin_area_3: "A2_north", admin_area_4: "A2_north", facility_type: "clinic" },
    { facility_id: "d3", admin_area_1: "Country", admin_area_2: "A2_south", admin_area_3: "A2_south", admin_area_4: "A2_south", facility_type: "hospital" },
  ],
  roColumns: [
    { name: "facility_id", type: "text" },
    { name: "admin_area_2", type: "text" },
    { name: "value", type: "double precision" },
  ],
  roRows: [
    { facility_id: "d1", admin_area_2: "A2_north", value: 10 },
    { facility_id: "d2", admin_area_2: "A2_north", value: 20 },
    { facility_id: "d3", admin_area_2: "A2_south", value: 5 },
  ],
  indicators: [],
  metric: {
    id: "metric_div",
    label: "Divergence metric",
    value_func: "SUM",
    format_as: "number",
    value_props: ["value"],
    required_disaggregation_options: [],
  },
  firstPeriodOption: undefined,
};

export const ALL_FIXTURES: Fixture[] = [
  F1_HMIS_MONTHLY,
  F2_HFA_SERVICE_CATS,
  F3_HFA_TIMEPOINT_INTEGER,
  F4_HMIS_RATIO,
  F5_HMIS_AREA_ONLY,
  F6_HMIS_QUARTERLY,
  F7_HMIS_YEARLY,
  F8_HFA_FACILITY_BLANKS,
  F9_HMIS_OPTION_CAP,
  F10_HFA_AREA_ONLY,
  F11_HFA_VARIANTS,
  F12_HMIS_SCORECARD,
  F13_HFA_DIVERGENT_SCHEMA,
];
