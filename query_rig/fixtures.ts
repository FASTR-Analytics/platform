import type { PeriodOption, StructureColumns } from "lib";

// A fixture is ONE results package: a run directory holding a manifest, the
// input mirrors (facilities parquet + dictionary JSONs) and one results
// object's query parquet. seed.ts builds it with the SAME writers the wizard
// finalize uses, so the layout cannot drift from a real package.

// The module-authored column type (createTableStatementPossibleColumns),
// which the finalize normalizer maps to the parquet type. Load-bearing, not
// decoration — see the F2/F3 pair below.
export type RoColumn = {
  name: string;
  declaredType: "TEXT" | "INTEGER" | "NUMERIC";
};

// One facilities parquet in the package, plus the manifest structure-schema
// slot that governs it. A package carries a family's slot iff it carries that
// family's facilities parquet, so the two travel together here.
export type FacilitiesInput = {
  family: "hmis" | "hfa";
  columns: StructureColumns;
  // Sparse: seed.ts fills the remaining RUN_FACILITY_COLUMN_NAMES with NULL.
  rows: Record<string, string | null>[];
};

export type HfaSnapshots = {
  indicators: {
    var_name: string;
    category_id: string;
    sub_category_id: string;
    service_category_ids: string;
    variant_group_id: string | null;
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
  variantGroups: { id: string; label: string; sort_order: number }[];
  variantItems: {
    id: string;
    group_id: string;
    label: string;
    sort_order: number;
  }[];
};

export type Fixture = {
  name: string;
  // The run directory name. A run id is a UUID (isRunIdShape guards the path),
  // so the rig's are UUIDs whose last group reads as the fixture number.
  runId: string;
  moduleId: string;
  moduleDefinition: Record<string, unknown>;
  resultsObjectId: string;
  facilities: FacilitiesInput[];
  roColumns: RoColumn[];
  roRows: Record<string, string | number | null>[];
  // inputs/indicators.json — the HMIS common-indicator dictionary. Absent for
  // HFA fixtures, whose labels come from the snapshots below.
  indicators?: { indicator_common_id: string; indicator_common_label: string }[];
  hfaSnapshots?: HfaSnapshots;
  // Only needed by `metricInfo` cases — that entry resolves a manifest metric
  // row and enriches it into a ResultsValue.
  metric?: {
    id: string;
    label: string;
    value_func: "SUM" | "AVG" | "COUNT" | "MIN" | "MAX" | "identity";
    format_as: "percent" | "number" | "indicator";
    value_props: string[];
    required_disaggregation_options: string[];
  };
  firstPeriodOption: PeriodOption | undefined;
};

const NO_FACILITY_COLUMNS: StructureColumns = {
  includeNames: false,
  includeTypes: false,
  includeOwnership: false,
  includeCustom1: false,
  includeCustom2: false,
  includeCustom3: false,
  includeCustom4: false,
  includeCustom5: false,
};

const TYPES_ONLY: StructureColumns = {
  ...NO_FACILITY_COLUMNS,
  includeTypes: true,
};

function hmisModule(): Record<string, unknown> {
  return {
    scriptGenerationType: "standard",
    dataSources: [{ sourceType: "dataset", datasetType: "hmis" }],
  };
}

function hfaModule(): Record<string, unknown> {
  return {
    scriptGenerationType: "hfa",
    dataSources: [{ sourceType: "dataset", datasetType: "hfa" }],
  };
}

const HMIS_FACILITIES: Record<string, string | null>[] = [
  { facility_id: "f1", admin_area_1: "Country", admin_area_2: "A2_north", admin_area_3: "A3_alpha", admin_area_4: "A4_w1", facility_type: "hospital" },
  { facility_id: "f2", admin_area_1: "Country", admin_area_2: "A2_north", admin_area_3: "A3_beta", admin_area_4: "A4_w2", facility_type: "clinic" },
  { facility_id: "f3", admin_area_1: "Country", admin_area_2: "A2_south", admin_area_3: "A3_gamma", admin_area_4: "A4_w3", facility_type: "clinic" },
  { facility_id: "f4", admin_area_1: "Country", admin_area_2: "A2_south", admin_area_3: "A3_delta", admin_area_4: "A4_w4", facility_type: "hospital" },
  { facility_id: "f5", admin_area_1: "Country", admin_area_2: "A2_south", admin_area_3: "A3_delta", admin_area_4: "A4_w5", facility_type: "health_post" },
];

const HFA_FACILITIES: Record<string, string | null>[] = [
  { facility_id: "h1", admin_area_1: "Country", admin_area_2: "A2_north", admin_area_3: "A3_alpha", admin_area_4: "A4_w1", facility_type: "hospital" },
  { facility_id: "h2", admin_area_1: "Country", admin_area_2: "A2_north", admin_area_3: "A3_beta", admin_area_4: "A4_w2", facility_type: "clinic" },
  { facility_id: "h3", admin_area_1: "Country", admin_area_2: "A2_south", admin_area_3: "A3_gamma", admin_area_4: "A4_w3", facility_type: "clinic" },
  { facility_id: "h4", admin_area_1: "Country", admin_area_2: "A2_south", admin_area_3: "A3_delta", admin_area_4: "A4_w4", facility_type: "hospital" },
  { facility_id: "h5", admin_area_1: "Country", admin_area_2: "A2_south", admin_area_3: "A3_delta", admin_area_4: "A4_w5", facility_type: "health_post" },
];

const HFA_SNAPSHOTS: HfaSnapshots = {
  indicators: [
    { var_name: "ind_a", category_id: "cat_1", sub_category_id: "sub_1", service_category_ids: '["rmnch","nutrition"]', variant_group_id: null, short_label: "Indicator A", definition: "Facilities with A", type: "binary", aggregation: "avg", sort_order: 1 },
    { var_name: "ind_b", category_id: "cat_1", sub_category_id: "sub_1", service_category_ids: '["rmnch"]', variant_group_id: null, short_label: "Indicator B", definition: "Facilities with B", type: "binary", aggregation: "avg", sort_order: 2 },
    { var_name: "ind_c", category_id: "cat_2", sub_category_id: "sub_2", service_category_ids: '["nutrition"]', variant_group_id: null, short_label: "Indicator C", definition: "Facilities with C", type: "binary", aggregation: "avg", sort_order: 3 },
    { var_name: "ind_d", category_id: "cat_2", sub_category_id: "sub_2", service_category_ids: "[]", variant_group_id: null, short_label: "Indicator D", definition: "Facilities with D", type: "binary", aggregation: "avg", sort_order: 4 },
    { var_name: "ind_e", category_id: "cat_2", sub_category_id: "sub_2", service_category_ids: '["malaria"]', variant_group_id: null, short_label: "Indicator E", definition: "Facilities with E", type: "binary", aggregation: "avg", sort_order: 5 },
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
  variantGroups: [
    { id: "vg_vacc", label: "Vaccination modality", sort_order: 1 },
    { id: "vg_water", label: "Water source", sort_order: 2 },
  ],
  variantItems: [
    { id: "campaign", group_id: "vg_vacc", label: "Campaign", sort_order: 1 },
    { id: "routine", group_id: "vg_vacc", label: "Routine", sort_order: 2 },
    { id: "piped", group_id: "vg_water", label: "Piped", sort_order: 3 },
  ],
};

// F1 — HMIS, physical period_id (YYYYMM), facility-level rows.
//
// source_indicator is the blank-fold specimen: it carries NULL, a spaces-only
// cell, a tab-only cell, and the pair 'x' / ' x'. The pair is what proves the
// fold detects blankness without rewriting non-blank values — collapsing ' x'
// onto 'x' is the original defect in a new form.
//
// Sums by admin_area_2: A2_north = 35, A2_south = 17. Its RO carries
// admin_area_2, so it is also the direct-filter specimen for the scope axis.
export const F1_HMIS_MONTHLY: Fixture = {
  name: "hmis_monthly",
  runId: "11111111-1111-4111-8111-000000000001",
  moduleId: "m_hmis",
  moduleDefinition: hmisModule(),
  resultsObjectId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
  facilities: [{ family: "hmis", columns: TYPES_ONLY, rows: HMIS_FACILITIES }],
  roColumns: [
    { name: "facility_id", declaredType: "TEXT" },
    { name: "period_id", declaredType: "INTEGER" },
    { name: "admin_area_2", declaredType: "TEXT" },
    { name: "admin_area_3", declaredType: "TEXT" },
    { name: "indicator_common_id", declaredType: "TEXT" },
    { name: "source_indicator", declaredType: "TEXT" },
    { name: "value", declaredType: "NUMERIC" },
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
  metric: {
    id: "metric_hmis",
    label: "HMIS metric",
    value_func: "SUM",
    format_as: "number",
    value_props: ["value"],
    required_disaggregation_options: [],
  },
  firstPeriodOption: "period_id",
};

// F2 — HFA, hfa_service_category carrying pipe-joined SETS, time_point TEXT.
//
// Sums: by service-category membership rmnch = 41, malaria = 4.
// By time_point: baseline = 26, midline = 26, blank (NULL + spaces) = 4.
export const F2_HFA_SERVICE_CATS: Fixture = {
  name: "hfa_service_cats",
  runId: "11111111-1111-4111-8111-000000000002",
  moduleId: "m_hfa",
  moduleDefinition: hfaModule(),
  resultsObjectId: "bbbbbbbb-cccc-dddd-eeee-ffffffffffff",
  facilities: [{ family: "hfa", columns: TYPES_ONLY, rows: HFA_FACILITIES }],
  roColumns: [
    { name: "facility_id", declaredType: "TEXT" },
    { name: "time_point", declaredType: "TEXT" },
    { name: "hfa_indicator", declaredType: "TEXT" },
    { name: "hfa_category", declaredType: "TEXT" },
    { name: "hfa_service_category", declaredType: "TEXT" },
    { name: "admin_area_2", declaredType: "TEXT" },
    { name: "value", declaredType: "NUMERIC" },
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
  hfaSnapshots: HFA_SNAPSHOTS,
  firstPeriodOption: undefined,
};

// F3 — F2 with ONE thing changed: time_point is declared `INTEGER`.
//
// This pair is the whole point of the shouldFoldBlank type gate. The fold emits
// trim() and returns a text sentinel from its CASE; neither engine accepts them
// on a numeric column, so a name-only gate turns working visualizations into a
// hard SQL error. Results-column types are authored per module, so the same
// option genuinely is text in one instance and integer in another.
export const F3_HFA_TIMEPOINT_INTEGER: Fixture = {
  ...F2_HFA_SERVICE_CATS,
  name: "hfa_timepoint_integer",
  runId: "11111111-1111-4111-8111-000000000003",
  moduleId: "m_hfa_int",
  resultsObjectId: "cccccccc-dddd-eeee-ffff-000000000000",
  roColumns: F2_HFA_SERVICE_CATS.roColumns.map((c) =>
    c.name === "time_point" ? { ...c, declaredType: "INTEGER" as const } : c
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

// F4 — facility-level rows with ratio ingredients, sized so that a recomputed
// roll-up ratio and a mean-of-ratios give visibly different answers:
//   recomputed 80/1000 = 0.08   vs   mean of (0.3, 0.025) = 0.1625
// AVG(value) is also meaningful here because rows are raw facility
// observations, which is the metric-side half of the roll-up gate.
export const F4_HMIS_RATIO: Fixture = {
  name: "hmis_ratio",
  runId: "11111111-1111-4111-8111-000000000004",
  moduleId: "m_ratio",
  moduleDefinition: hmisModule(),
  resultsObjectId: "dddddddd-eeee-ffff-0000-111111111111",
  facilities: [
    {
      family: "hmis",
      columns: TYPES_ONLY,
      rows: [
        { facility_id: "r1", admin_area_1: "Country", admin_area_2: "A2_north", admin_area_3: "A3_alpha", admin_area_4: "A4_w1", facility_type: "hospital" },
        { facility_id: "r2", admin_area_1: "Country", admin_area_2: "A2_south", admin_area_3: "A3_gamma", admin_area_4: "A4_w3", facility_type: "clinic" },
      ],
    },
  ],
  roColumns: [
    { name: "facility_id", declaredType: "TEXT" },
    { name: "admin_area_2", declaredType: "TEXT" },
    { name: "period_id", declaredType: "INTEGER" },
    { name: "num", declaredType: "NUMERIC" },
    { name: "den", declaredType: "NUMERIC" },
    { name: "value", declaredType: "NUMERIC" },
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
// summaries is a population-blind mean, so it must be refused. The package
// still carries the family's facilities parquet — every HMIS package does —
// which is exactly why the refusal cannot key off the package's contents.
export const F5_HMIS_AREA_ONLY: Fixture = {
  name: "hmis_area_only",
  runId: "11111111-1111-4111-8111-000000000005",
  moduleId: "m_area_only",
  moduleDefinition: hmisModule(),
  resultsObjectId: "eeeeeeee-ffff-0000-1111-222222222222",
  facilities: [
    { family: "hmis", columns: NO_FACILITY_COLUMNS, rows: HMIS_FACILITIES },
  ],
  roColumns: [
    { name: "admin_area_2", declaredType: "TEXT" },
    { name: "period_id", declaredType: "INTEGER" },
    { name: "value", declaredType: "NUMERIC" },
  ],
  roRows: [
    { admin_area_2: "A2_north", period_id: 202401, value: 10 },
    { admin_area_2: "A2_south", period_id: 202401, value: 30 },
  ],
  indicators: [],
  firstPeriodOption: "period_id",
};

// F6 / F7 — the other two period scenarios. A results table has at most ONE
// physical time column (the finalize normalizer drops the redundant ones), so
// each scenario needs its own fixture: quarter_id can derive `year` but not
// `month`, and a year-only table derives nothing.
export const F6_HMIS_QUARTERLY: Fixture = {
  name: "hmis_quarterly",
  runId: "11111111-1111-4111-8111-000000000006",
  moduleId: "m_quarterly",
  moduleDefinition: hmisModule(),
  resultsObjectId: "ffffffff-0000-1111-2222-333333333333",
  facilities: [
    {
      family: "hmis",
      columns: NO_FACILITY_COLUMNS,
      rows: [
        { facility_id: "q1", admin_area_1: "Country", admin_area_2: "A2_north", admin_area_3: "A3_alpha", admin_area_4: "A4_w1" },
        { facility_id: "q2", admin_area_1: "Country", admin_area_2: "A2_south", admin_area_3: "A3_gamma", admin_area_4: "A4_w3" },
      ],
    },
  ],
  roColumns: [
    { name: "facility_id", declaredType: "TEXT" },
    { name: "admin_area_2", declaredType: "TEXT" },
    { name: "quarter_id", declaredType: "INTEGER" },
    { name: "value", declaredType: "NUMERIC" },
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
  runId: "11111111-1111-4111-8111-000000000007",
  moduleId: "m_yearly",
  moduleDefinition: hmisModule(),
  resultsObjectId: "00000000-1111-2222-3333-444444444444",
  facilities: [
    {
      family: "hmis",
      columns: NO_FACILITY_COLUMNS,
      rows: [
        { facility_id: "y1", admin_area_1: "Country", admin_area_2: "A2_north", admin_area_3: "A3_alpha", admin_area_4: "A4_w1" },
        { facility_id: "y2", admin_area_1: "Country", admin_area_2: "A2_south", admin_area_3: "A3_gamma", admin_area_4: "A4_w3" },
      ],
    },
  ],
  roColumns: [
    { name: "facility_id", declaredType: "TEXT" },
    { name: "admin_area_2", declaredType: "TEXT" },
    { name: "year", declaredType: "INTEGER" },
    { name: "value", declaredType: "NUMERIC" },
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
// textColumns spans the results parquet AND the joined facilities parquet, so
// the fold reaches facility columns. A blank there arrives two ways: a
// facilities row whose column is NULL (e2), and a results row whose facility_id
// matches no facilities row at all, where the LEFT JOIN manufactures the NULL
// (e_missing). Both must land in ONE __BLANK group — that is precisely why NULL
// and blank fold together rather than becoming two options.
export const F8_HFA_FACILITY_BLANKS: Fixture = {
  name: "hfa_facility_blanks",
  runId: "11111111-1111-4111-8111-000000000008",
  moduleId: "m_hfa_edge",
  moduleDefinition: hfaModule(),
  resultsObjectId: "11111111-2222-3333-4444-555555555555",
  facilities: [
    {
      family: "hfa",
      columns: TYPES_ONLY,
      rows: [
        { facility_id: "e1", admin_area_1: "Country", admin_area_2: "A2_north", admin_area_3: "A3_alpha", admin_area_4: "A4_w1", facility_type: "hospital" },
        { facility_id: "e2", admin_area_1: "Country", admin_area_2: "A2_north", admin_area_3: "A3_beta", admin_area_4: "A4_w2", facility_type: null },
      ],
    },
  ],
  roColumns: [
    { name: "facility_id", declaredType: "TEXT" },
    { name: "hfa_service_category", declaredType: "TEXT" },
    { name: "admin_area_2", declaredType: "TEXT" },
    { name: "value", declaredType: "NUMERIC" },
  ],
  roRows: [
    { facility_id: "e1", hfa_service_category: "rmnch", admin_area_2: "A2_north", value: 10 },
    { facility_id: "e2", hfa_service_category: "rmnch", admin_area_2: "A2_north", value: 20 },
    // No facilities row for e_missing — the LEFT JOIN yields NULL.
    { facility_id: "e_missing", hfa_service_category: "rmnch", admin_area_2: "A2_south", value: 5 },
  ],
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
  runId: "11111111-1111-4111-8111-000000000009",
  moduleId: "m_cap",
  moduleDefinition: hmisModule(),
  resultsObjectId: "22222222-3333-4444-5555-666666666666",
  facilities: [
    { family: "hmis", columns: NO_FACILITY_COLUMNS, rows: HMIS_FACILITIES },
  ],
  roColumns: [
    { name: "admin_area_2", declaredType: "TEXT" },
    { name: "source_indicator", declaredType: "TEXT" },
    { name: "target_population", declaredType: "TEXT" },
    { name: "value", declaredType: "NUMERIC" },
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
// number but a hard SQL error ("Referenced column facility_id not found"). The
// family check alone would not catch this — F10 is HFA.
export const F10_HFA_AREA_ONLY: Fixture = {
  name: "hfa_area_only",
  runId: "11111111-1111-4111-8111-000000000010",
  moduleId: "m_hfa_area_only",
  moduleDefinition: hfaModule(),
  resultsObjectId: "33333333-4444-5555-6666-777777777777",
  facilities: [
    { family: "hfa", columns: NO_FACILITY_COLUMNS, rows: HFA_FACILITIES },
  ],
  roColumns: [
    { name: "admin_area_2", declaredType: "TEXT" },
    { name: "time_point", declaredType: "TEXT" },
    { name: "value", declaredType: "NUMERIC" },
  ],
  roRows: [
    { admin_area_2: "A2_north", time_point: "baseline", value: 10 },
    { admin_area_2: "A2_south", time_point: "baseline", value: 30 },
  ],
  hfaSnapshots: HFA_SNAPSHOTS,
  firstPeriodOption: undefined,
};

// F11 — the HFA variants RO shape: hfa_variant_item is a plain TEXT NOT NULL
// physical column (never in the special registries), hfa_indicator carries the
// PARENT indicator, and each parent's rows span only its own group's items.
// Exercises the generic physical-column path for group-by / filter / option
// lists on the column, and — since it has no admin column at all — the one
// blessed unfiltered case of the scope rule.
export const F11_HFA_VARIANTS: Fixture = {
  name: "hfa_variants",
  runId: "11111111-1111-4111-8111-000000000011",
  moduleId: "m_hfa_var",
  moduleDefinition: hfaModule(),
  resultsObjectId: "44444444-5555-6666-7777-888888888888",
  facilities: [
    { family: "hfa", columns: NO_FACILITY_COLUMNS, rows: HFA_FACILITIES },
  ],
  roColumns: [
    { name: "facility_id", declaredType: "TEXT" },
    { name: "time_point", declaredType: "TEXT" },
    { name: "hfa_indicator", declaredType: "TEXT" },
    { name: "hfa_variant_item", declaredType: "TEXT" },
    { name: "hfa_category", declaredType: "TEXT" },
    { name: "value", declaredType: "NUMERIC" },
  ],
  roRows: [
    { facility_id: "h1", time_point: "baseline", hfa_indicator: "vacc", hfa_variant_item: "campaign", hfa_category: "cat_1", value: 10 },
    { facility_id: "h2", time_point: "baseline", hfa_indicator: "vacc", hfa_variant_item: "campaign", hfa_category: "cat_1", value: 20 },
    { facility_id: "h1", time_point: "midline", hfa_indicator: "vacc", hfa_variant_item: "campaign", hfa_category: "cat_1", value: 8 },
    { facility_id: "h1", time_point: "baseline", hfa_indicator: "vacc", hfa_variant_item: "routine", hfa_category: "cat_1", value: 5 },
    { facility_id: "h2", time_point: "baseline", hfa_indicator: "vacc", hfa_variant_item: "routine", hfa_category: "cat_1", value: 1 },
    { facility_id: "h3", time_point: "baseline", hfa_indicator: "water", hfa_variant_item: "piped", hfa_category: "cat_2", value: 2 },
  ],
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
  runId: "11111111-1111-4111-8111-000000000012",
  moduleId: "m_scorecard",
  moduleDefinition: hmisModule(),
  resultsObjectId: "55555555-6666-7777-8888-999999999999",
  facilities: [
    { family: "hmis", columns: NO_FACILITY_COLUMNS, rows: HMIS_FACILITIES },
  ],
  roColumns: [
    { name: "admin_area_2", declaredType: "TEXT" },
    { name: "period_id", declaredType: "INTEGER" },
    { name: "numerator", declaredType: "NUMERIC" },
    { name: "denominator", declaredType: "NUMERIC" },
  ],
  roRows: [
    { admin_area_2: "A2_north", period_id: 202401, numerator: 10, denominator: 20 },
    { admin_area_2: "A2_north", period_id: 202401, numerator: 30, denominator: 20 },
    { admin_area_2: "A2_south", period_id: 202401, numerator: 5, denominator: 50 },
  ],
  indicators: [],
  firstPeriodOption: "period_id",
};

// F13 — the family-split divergence specimen: a package carrying BOTH families'
// facilities parquet, with the hfa slot enabling facility_type and the hmis
// slot's flags inverted (types OFF), and deliberately divergent type values in
// the hmis table. The module is HFA, so every facility_type case only passes if
// the engine resolved the HFA slot AND joined the HFA table — reading the hmis
// slot drops the facility join entirely, and reading the hmis table would
// surface "wrong_family" values.
export const F13_HFA_DIVERGENT_SCHEMA: Fixture = {
  name: "hfa_divergent_schema",
  runId: "11111111-1111-4111-8111-000000000013",
  moduleId: "m_hfa_div",
  moduleDefinition: hfaModule(),
  resultsObjectId: "66666666-7777-8888-9999-aaaaaaaaaaaa",
  facilities: [
    {
      family: "hfa",
      columns: TYPES_ONLY,
      rows: [
        { facility_id: "d1", admin_area_1: "Country", admin_area_2: "A2_north", admin_area_3: "A2_north", admin_area_4: "A2_north", facility_type: "hospital" },
        { facility_id: "d2", admin_area_1: "Country", admin_area_2: "A2_north", admin_area_3: "A2_north", admin_area_4: "A2_north", facility_type: "clinic" },
        { facility_id: "d3", admin_area_1: "Country", admin_area_2: "A2_south", admin_area_3: "A2_south", admin_area_4: "A2_south", facility_type: "hospital" },
      ],
    },
    {
      family: "hmis",
      columns: {
        includeNames: true,
        includeTypes: false,
        includeOwnership: true,
        includeCustom1: true,
        includeCustom2: true,
        includeCustom3: true,
        includeCustom4: true,
        includeCustom5: true,
      },
      rows: [
        { facility_id: "d1", admin_area_1: "Country", admin_area_2: "A2_north", admin_area_3: "A2_north", admin_area_4: "A2_north", facility_type: "wrong_family" },
        { facility_id: "d2", admin_area_1: "Country", admin_area_2: "A2_north", admin_area_3: "A2_north", admin_area_4: "A2_north", facility_type: "wrong_family" },
        { facility_id: "d3", admin_area_1: "Country", admin_area_2: "A2_south", admin_area_3: "A2_south", admin_area_4: "A2_south", facility_type: "wrong_family" },
      ],
    },
  ],
  roColumns: [
    { name: "facility_id", declaredType: "TEXT" },
    { name: "admin_area_2", declaredType: "TEXT" },
    { name: "value", declaredType: "NUMERIC" },
  ],
  roRows: [
    { facility_id: "d1", admin_area_2: "A2_north", value: 10 },
    { facility_id: "d2", admin_area_2: "A2_north", value: 20 },
    { facility_id: "d3", admin_area_2: "A2_south", value: 5 },
  ],
  hfaSnapshots: HFA_SNAPSHOTS,
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

// F14 — an RO with admin_area_3 and NO admin_area_2, the shape the scope
// DERIVATION exists for (m004/m005/m006 admin3 outputs). A scoped read must
// resolve A2_south to its child areas out of the family facilities parquet and
// filter on those, matching by NAME.
export const F14_HMIS_ADMIN3_ONLY: Fixture = {
  name: "hmis_admin3_only",
  runId: "11111111-1111-4111-8111-000000000014",
  moduleId: "m_admin3",
  moduleDefinition: hmisModule(),
  resultsObjectId: "77777777-8888-9999-aaaa-bbbbbbbbbbbb",
  facilities: [
    { family: "hmis", columns: NO_FACILITY_COLUMNS, rows: HMIS_FACILITIES },
  ],
  roColumns: [
    { name: "admin_area_3", declaredType: "TEXT" },
    { name: "value", declaredType: "NUMERIC" },
  ],
  roRows: [
    { admin_area_3: "A3_alpha", value: 10 },
    { admin_area_3: "A3_beta", value: 5 },
    { admin_area_3: "A3_gamma", value: 7 },
    { admin_area_3: "A3_delta", value: 1 },
  ],
  indicators: [],
  firstPeriodOption: undefined,
};

// F15 — F14's shape in a package where the derivation CANNOT run: the module's
// data sources are all upstream results objects, so its family is undeclarable
// and no facilities parquet can serve the lookup. The scope must fail CLOSED
// (a never-matching sentinel), never unfiltered — national data under a
// regional heading is wrong silently, blank is wrong visibly.
export const F15_ADMIN3_NO_FAMILY: Fixture = {
  name: "admin3_no_family",
  runId: "11111111-1111-4111-8111-000000000015",
  moduleId: "m_admin3_derived",
  moduleDefinition: {
    scriptGenerationType: "standard",
    dataSources: [
      { sourceType: "resultsObject", moduleId: "m_admin3", resultsObjectId: "77777777-8888-9999-aaaa-bbbbbbbbbbbb" },
    ],
  },
  resultsObjectId: "88888888-9999-aaaa-bbbb-cccccccccccc",
  facilities: [],
  roColumns: [
    { name: "admin_area_3", declaredType: "TEXT" },
    { name: "value", declaredType: "NUMERIC" },
  ],
  roRows: [
    { admin_area_3: "A3_alpha", value: 10 },
    { admin_area_3: "A3_gamma", value: 7 },
  ],
  indicators: [],
  firstPeriodOption: undefined,
};

// F16 — period_id months that reach the LAST quarter, which F1 (months 1–3)
// cannot. The quarter expression is `(period_id / 100) * 10 + q`, so integer
// division is load-bearing exactly here: with true division 202410 / 100 =
// 2024.1, and the 0.1 carries into the quarter digit (20245 instead of 20244)
// — wrong data, no error. DuckDB divides truly by default; the executor's
// `SET integer_division = true` is what restores Postgres semantics.
export const F16_HMIS_LATE_MONTHS: Fixture = {
  name: "hmis_late_months",
  runId: "11111111-1111-4111-8111-000000000016",
  moduleId: "m_late_months",
  moduleDefinition: hmisModule(),
  resultsObjectId: "99999999-aaaa-bbbb-cccc-dddddddddddd",
  facilities: [
    { family: "hmis", columns: NO_FACILITY_COLUMNS, rows: HMIS_FACILITIES },
  ],
  roColumns: [
    { name: "admin_area_2", declaredType: "TEXT" },
    { name: "period_id", declaredType: "INTEGER" },
    { name: "value", declaredType: "NUMERIC" },
  ],
  roRows: [
    { admin_area_2: "A2_north", period_id: 202401, value: 1 },
    { admin_area_2: "A2_north", period_id: 202410, value: 2 },
    { admin_area_2: "A2_north", period_id: 202412, value: 4 },
  ],
  indicators: [],
  firstPeriodOption: "period_id",
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
  F14_HMIS_ADMIN3_ONLY,
  F15_ADMIN3_NO_FAMILY,
  F16_HMIS_LATE_MONTHS,
];
