import { ADMIN_LEVELS, type RollupDimension } from "../rollup.ts";
import { getNextAvailableDisaggregationDisplayOption } from "../get_disaggregator_display_prop.ts";
import { t3 } from "../translate/mod.ts";
import {
  type BoundedPeriodFilter,
  type DisaggregationDisplayOption,
  type PeriodFilter,
  type PeriodOption,
  type PresentationOption,
  type RelativePeriodFilter,
} from "./_metric_installed.ts";
import type { PresentationObjectConfig } from "./_presentation_object_config.ts";
import {
  ALL_DISAGGREGATION_OPTIONS,
  type DisaggregationOption,
} from "./disaggregation_options.ts";
import type { ThresholdsRule } from "./conditional_formatting.ts";
import type { DatasetType } from "./datasets.ts";
import type { IndicatorFormat } from "./indicators.ts";
import type { ResultsValue } from "./modules.ts";
import {
  DEFAULT_S_CONFIG,
  DEFAULT_T_CONFIG,
} from "./presentation_object_defaults.ts";

export { ALL_DISAGGREGATION_OPTIONS, type DisaggregationOption };
export type {
  BoundedPeriodFilter,
  DisaggregationDisplayOption,
  PeriodFilter,
  PresentationOption,
  RelativePeriodFilter,
};

export function isDisaggregationOption(s: string): s is DisaggregationOption {
  return (ALL_DISAGGREGATION_OPTIONS as readonly string[]).includes(s);
}

export type PresentationObjectSummary = {
  id: string;
  metricId: string;
  label: string;
  isDefault: boolean;
  replicateBy: DisaggregationOption | undefined;
  isFiltered: boolean;
  type: PresentationOption;
  disaggregateBy: DisaggregationOption[];
  filterBy: { disOpt: DisaggregationOption; values: (string | number)[] }[];
  createdByAI: boolean;
  folderId: string | null;
  sortOrder: number;
  lastUpdated: string;
};

export type PresentationObjectInReportInfo = {
  id: string;
  metricId: string;
  isDefault: boolean;
  replicateBy: DisaggregationOption | undefined;
  selectedReplicantValue: string;
};

export type PresentationObjectDetail = {
  id: string;
  projectId: string;
  lastUpdated: string;
  label: string;
  resultsValue: ResultsValue;
  config: PresentationObjectConfig;
  isDefault: boolean;
  folderId: string | null;
  // The run resultsValue was resolved from — folded into the po_detail cache
  // version (PLAN_RESULTS_RUNS §2.5). Absent only from the parity rig's
  // Postgres baseline, which never enters the caches.
  runId?: string;
  // The project scope the payload was computed under (projectScopeToken) —
  // folded into cache versions beside runId (PLAN_1_PROJECT_AA2_SCOPE §4).
  scopeToken?: string;
};

export type PeriodBounds = {
  min: number;
  max: number;
};

export function periodFilterHasBounds(
  filter: RelativePeriodFilter | BoundedPeriodFilter,
): filter is BoundedPeriodFilter {
  return filter.filterType === "custom" || filter.filterType === "from_month";
}

// Status for disaggregation possible values (used in filter dropdowns)
export type DisaggregationPossibleValuesStatus =
  | {
    status: "ok";
    values: { id: string; label: string }[];
  }
  | {
    status: "too_many_values";
  }
  | {
    status: "no_values_available";
  }
  | {
    status: "error";
    message: string;
  };

export type ResultsValueInfoForPresentationObject = {
  resultsObjectId: string;
  metricId: string;
  // The metric's dataset family — selects which family's structure schema
  // labels its facility columns. Absent for iceh/unknown-family metrics.
  datasetFamily?: DatasetType;
  moduleLastRun: string;
  // Freshness of the dataset(s) feeding indicator metadata, which labels the
  // cached disaggregation values. Rewritten on dataset integration (bumps
  // datasets.last_updated) independently of moduleLastRun, so the cache versions
  // on it too. Carried here so parseData can reproduce the version hash.
  datasetsVersion: string;
  // See ItemsHolderPresentationObject.runId (PLAN_RESULTS_RUNS §2.5).
  runId?: string;
  // See PresentationObjectDetail.scopeToken.
  scopeToken?: string;
  periodBounds?: PeriodBounds;
  disaggregationPossibleValues: {
    [key in DisaggregationOption]?: DisaggregationPossibleValuesStatus;
  };
  // Indicator id → its own value format, for every indicator the metric's
  // module knows about. The input resolveEffectiveIndicatorFacts needs, delivered
  // pre-query so the editor can resolve a figure's format from its config
  // alone.
  //
  // FLAT, not `format_as` added to the `{ id, label }` entries in
  // disaggregationPossibleValues: those entries are absent whenever a
  // dimension came back `too_many_values`, and a filterBy can still name
  // specific indicators on such a dimension. A flat map has no such hole.
  indicatorFormats: Record<string, IndicatorFormat>;
  // Indicator id → its own CF rule, for every indicator that declares one.
  // Flat beside indicatorFormats for the same reason; the other input the
  // config-based facts resolver needs (ruleForValue, displayedRules).
  indicatorRules: Record<string, ThresholdsRule>;
};

// Discriminated union for replicant option states
export type ReplicantOptionsForPresentationObject =
  & {
    projectId: string;
    resultsObjectId: string;
    replicateBy: DisaggregationOption;
    fetchConfig: GenericLongFormFetchConfig;
    moduleLastRun: string;
    // Replicant value labels come from indicator metadata, rewritten on dataset
    // integration (bumps datasets.last_updated) independently of moduleLastRun, so
    // the cache versions on it too. Carried here so parseData can reproduce it.
    datasetsVersion: string;
    // See ItemsHolderPresentationObject.runId (PLAN_RESULTS_RUNS §2.5).
    runId?: string;
    // See PresentationObjectDetail.scopeToken.
    scopeToken?: string;
  }
  & (
    | {
      status: "ok";
      possibleValues: { id: string; label: string }[];
    }
    | {
      status: "too_many_values";
    }
    | {
      status: "no_values_available";
    }
    | {
      status: "error";
      message: string;
    }
  );

export const VIZ_TYPE_CONFIG: Record<
  PresentationOption,
  {
    defaultValuesDisDisplayOpt: DisaggregationDisplayOption;
    defaultContent: PresentationObjectConfig["s"]["content"];
    disaggregationDisplayOptions: DisaggregationDisplayOption[];
    disDisplayOptFallbacks: Partial<
      Record<DisaggregationDisplayOption, DisaggregationDisplayOption>
    >;
    styleResets: Partial<PresentationObjectConfig["s"]>;
  }
> = {
  timeseries: {
    defaultValuesDisDisplayOpt: "series",
    defaultContent: "lines",
    disaggregationDisplayOptions: ["series", "cell", "row", "col", "replicant"],
    disDisplayOptFallbacks: {
      indicator: "series",
      rowGroup: "row",
      colGroup: "col",
      mapArea: "cell",
    },
    styleResets: {
      sortIndicatorValues: "none",
      verticalTickLabels: false,
    },
  },
  table: {
    defaultValuesDisDisplayOpt: "col",
    defaultContent: "bars",
    disaggregationDisplayOptions: [
      "row",
      "col",
      "rowGroup",
      "colGroup",
      "replicant",
    ],
    disDisplayOptFallbacks: {
      series: "row",
      cell: "row",
      indicator: "col",
      mapArea: "row",
    },
    styleResets: {
      specialBarChart: false,
      specialCoverageChart: false,
      specialDisruptionsChart: false,
      sortIndicatorValues: "none",
      verticalTickLabels: false,
    },
  },
  chart: {
    defaultValuesDisDisplayOpt: "indicator",
    defaultContent: "bars",
    disaggregationDisplayOptions: [
      "indicator",
      "series",
      "cell",
      "row",
      "col",
      "replicant",
    ],
    disDisplayOptFallbacks: {
      rowGroup: "row",
      colGroup: "col",
      mapArea: "cell",
    },
    styleResets: {
      specialCoverageChart: false,
      specialDisruptionsChart: false,
      specialBarChart: false,
    },
  },
  map: {
    defaultValuesDisDisplayOpt: "cell",
    defaultContent: "bars",
    disaggregationDisplayOptions: [
      "mapArea",
      "cell",
      "row",
      "col",
      "replicant",
    ],
    disDisplayOptFallbacks: {
      series: "cell",
      indicator: "cell",
      rowGroup: "row",
      colGroup: "col",
    },
    styleResets: {
      specialBarChart: false,
      specialCoverageChart: false,
      specialDisruptionsChart: false,
      specialBarChartInverted: false,
      barsStacked: false,
      verticalTickLabels: false,
      sortIndicatorValues: "none",
    },
  },
  pie: {
    // NOT "indicator", even though `--v` on the indicator axis tiles pies
    // without spending a disaggregation axis: getDisaggregatorDisplayProp
    // returns "--v" for a slot the values claim and never reaches the
    // disaggregation loop, so a dimension the user then puts on Pies would
    // land on NO axis and its rows would collapse into panther's "Duplicate
    // values" throw. Defaulting the values to Grid keeps the Pies slot free
    // for the dimension the user actually wants repeated. NOT "series"
    // either: convertVisualizationType seeds usedOpts with this slot before
    // remapping, so a "series" default would collide with the mapArea →
    // series fallback below and shunt the converted dimension onward.
    defaultValuesDisDisplayOpt: "cell",
    defaultContent: "bars",
    disaggregationDisplayOptions: [
      "series",
      "indicator",
      "cell",
      "row",
      "col",
      "replicant",
    ],
    disDisplayOptFallbacks: {
      mapArea: "series",
      rowGroup: "row",
      colGroup: "col",
    },
    styleResets: {
      // No sortIndicatorValues reset: pie reuses that field as its slice
      // sort, and resets apply on switching TO a type.
      specialBarChart: false,
      specialCoverageChart: false,
      specialDisruptionsChart: false,
      specialBarChartInverted: false,
      barsStacked: false,
      verticalTickLabels: false,
    },
  },
};

// Legal display slots for the VALUE dimension, per type: the disaggregation
// slots minus `replicant` (a figure replicates by a disaggregation, never by
// its value props) and `mapArea` (the map's geography is a disaggregation's
// job — values cannot be the areas). Derived, not a second table, so a new
// presentation type or display option is a compile error here, not a
// silently-skipped check.
export function getValidValuesDisplayOptions(
  type: PresentationOption,
): DisaggregationDisplayOption[] {
  return VIZ_TYPE_CONFIG[type].disaggregationDisplayOptions.filter(
    (o) => o !== "replicant" && o !== "mapArea",
  );
}

// Whether the pie draws each value against a fixed 100% envelope (panther
// `total: 1`, unfilled arc drawn as the remainder track) rather than against
// the sum of its own slices. THE authoritative gate — the data config's `total`
// and the style's `centerLabel` must agree, or the hole reports a share
// computed against a denominator the geometry never used.
//
// Percent-only, and checked against the EFFECTIVE format rather than the
// stored flag alone: values are 0-1 fractions only when the figure is showing
// percentages, so a flag left behind by a metric/indicator format change
// degrades to a plain pie instead of drawing every count as a sliver of 1.
export function isPieCompletionMode(
  config: PresentationObjectConfig,
  effectiveFormatAs: IndicatorFormat,
): boolean {
  return (
    config.d.type === "pie" &&
    config.s.pieCompletionMode === true &&
    effectiveFormatAs === "percent"
  );
}

// The fixed envelope a completion pie is drawn against. 1, not 100: percent
// values are stored as 0-1 fractions everywhere in this app (see the `* 100`
// in the scorecard formatter), so the whole circle is 1.0.
export const PIE_COMPLETION_TOTAL = 1;

export function get_DISAGGREGATION_DISPLAY_OPTIONS(): Record<
  PresentationOption,
  { value: DisaggregationDisplayOption; label: string }[]
> {
  const labelMap: Record<
    PresentationOption,
    Record<DisaggregationDisplayOption, string>
  > = {
    timeseries: {
      series: t3({ en: "Lines", fr: "Lignes", pt: "Linhas" }),
      cell: t3({ en: "Grid", fr: "Grille", pt: "Grelha" }),
      row: t3({ en: "Rows", fr: "Rangées", pt: "Linhas" }),
      col: t3({ en: "Columns", fr: "Colonnes", pt: "Colunas" }),
      replicant: t3({
        en: "Different charts (replicants)",
        fr: "Graphiques multiples (réplicants)",
        pt: "Gráficos diferentes (replicantes)",
      }),
      rowGroup: "",
      colGroup: "",
      indicator: "",
      mapArea: "",
    },
    table: {
      row: t3({ en: "Rows", fr: "Rangées", pt: "Linhas" }),
      col: t3({ en: "Columns", fr: "Colonnes", pt: "Colunas" }),
      rowGroup: t3({
        en: "Row groups",
        fr: "Catégories de rangées",
        pt: "Grupos de linhas",
      }),
      colGroup: t3({
        en: "Column groups",
        fr: "Groupes de colonnes",
        pt: "Grupos de colunas",
      }),
      replicant: t3({
        en: "Different charts (replicants)",
        fr: "Graphiques multiples (réplicants)",
        pt: "Gráficos diferentes (replicantes)",
      }),
      series: "",
      cell: "",
      indicator: "",
      mapArea: "",
    },
    chart: {
      indicator: t3({ en: "Bars", fr: "Barres", pt: "Barras" }),
      series: t3({
        en: "Series (sub-bars)",
        fr: "Series (sub-bars)",
        pt: "Séries (sub-barras)",
      }),
      cell: t3({ en: "Grid", fr: "Grille", pt: "Grelha" }),
      row: t3({ en: "Rows", fr: "Rangées", pt: "Linhas" }),
      col: t3({ en: "Columns", fr: "Colonnes", pt: "Colunas" }),
      replicant: t3({
        en: "Different charts (replicants)",
        fr: "Graphiques multiples (réplicants)",
        pt: "Gráficos diferentes (replicantes)",
      }),
      rowGroup: "",
      colGroup: "",
      mapArea: "",
    },
    map: {
      mapArea: t3({
        en: "Map regions",
        fr: "Régions de la carte",
        pt: "Regiões do mapa",
      }),
      cell: t3({ en: "Grid", fr: "Grille", pt: "Grelha" }),
      row: t3({ en: "Rows", fr: "Rangées", pt: "Linhas" }),
      col: t3({ en: "Columns", fr: "Colonnes", pt: "Colunas" }),
      replicant: t3({
        en: "Different charts (replicants)",
        fr: "Graphiques multiples (réplicants)",
        pt: "Gráficos diferentes (replicantes)",
      }),
      series: "",
      indicator: "",
      rowGroup: "",
      colGroup: "",
    },
    pie: {
      series: t3({ en: "Slices", fr: "Tranches", pt: "Fatias" }),
      indicator: t3({ en: "Pies", fr: "Camemberts", pt: "Circulares" }),
      cell: t3({ en: "Grid", fr: "Grille", pt: "Grelha" }),
      row: t3({ en: "Rows", fr: "Rangées", pt: "Linhas" }),
      col: t3({ en: "Columns", fr: "Colonnes", pt: "Colunas" }),
      replicant: t3({
        en: "Different charts (replicants)",
        fr: "Graphiques multiples (réplicants)",
        pt: "Gráficos diferentes (replicantes)",
      }),
      mapArea: "",
      rowGroup: "",
      colGroup: "",
    },
  };
  const result = {} as Record<
    PresentationOption,
    { value: DisaggregationDisplayOption; label: string }[]
  >;
  for (const type of Object.keys(VIZ_TYPE_CONFIG) as PresentationOption[]) {
    result[type] = VIZ_TYPE_CONFIG[type].disaggregationDisplayOptions.map(
      (v) => ({
        value: v,
        label: labelMap[type][v],
      }),
    );
  }
  return result;
}

export type ReplicantValueOverride = {
  selectedReplicantValue?: string;
  hideFigureCaption?: boolean;
  hideFigureSubCaption?: boolean;
  hideFigureFootnote?: boolean;
};

// PresentationObjectConfig type + schema live in ./presentation_object_config.ts
// and are re-exported through the barrel. CustomSeriesStyle too.
export type {
  CustomSeriesStyle,
  PresentationObjectConfig,
} from "./_presentation_object_config.ts";

export type CreateModeVisualizationData = {
  label: string;
  resultsValue: PresentationObjectDetail["resultsValue"];
  config: PresentationObjectConfig;
};

const TIME_DISAGGREGATIONS: DisaggregationOption[] = [
  "period_id",
  "quarter_id",
  "year",
];
const AREA_DISAGGREGATIONS: DisaggregationOption[] = [...ADMIN_LEVELS];

export function get_PRESENTATION_SELECT_OPTIONS(
  disaggregationOptions?: { value: DisaggregationOption }[],
): {
  value: PresentationOption;
  label: string;
}[] {
  const all = [
    {
      value: "table" as const,
      label: t3({ en: "Table", fr: "Tableau", pt: "Tabela" }),
    },
    {
      value: "timeseries" as const,
      label: t3({
        en: "Timeseries",
        fr: "Série chronologique",
        pt: "Série temporal",
      }),
    },
    {
      value: "chart" as const,
      label: t3({
        en: "Bar chart",
        fr: "Graphique à barres",
        pt: "Gráfico de barras",
      }),
    },
    {
      value: "pie" as const,
      label: t3({
        en: "Pie chart",
        fr: "Graphique circulaire",
        pt: "Gráfico circular",
      }),
    },
    {
      value: "map" as const,
      label: t3({ en: "Map", fr: "Carte", pt: "Mapa" }),
    },
  ];
  if (!disaggregationOptions) return all;
  const disOpts = disaggregationOptions.map((d) => d.value);
  const hasTime = TIME_DISAGGREGATIONS.some((d) => disOpts.includes(d));
  const hasArea = AREA_DISAGGREGATIONS.some((d) => disOpts.includes(d));
  return all.filter((opt) => {
    if (opt.value === "timeseries" && !hasTime) return false;
    if (opt.value === "map" && !hasArea) return false;
    return true;
  });
}

export function get_PRESENTATION_OPTIONS_MAP(): Record<
  PresentationOption,
  string
> {
  return {
    table: t3({ en: "Table", fr: "Tableau", pt: "Tabela" }),
    timeseries: t3({
      en: "Timeseries",
      fr: "Série chronologique",
      pt: "Série temporal",
    }),
    chart: t3({
      en: "Bar chart",
      fr: "Graphique à barres",
      pt: "Gráfico de barras",
    }),
    pie: t3({
      en: "Pie chart",
      fr: "Graphique circulaire",
      pt: "Gráfico circular",
    }),
    map: t3({ en: "Map", fr: "Carte", pt: "Mapa" }),
  };
}

export function getStartingConfigForPresentationObject(
  resultsValue: ResultsValue,
  presentationOption: PresentationOption,
  disaggregations: DisaggregationOption[],
): PresentationObjectConfig {
  const startingConfig: PresentationObjectConfig = {
    d: {
      type: presentationOption,
      timeseriesGrouping:
        resultsValue.mostGranularTimePeriodColumnInResultsFile,
      valuesDisDisplayOpt:
        VIZ_TYPE_CONFIG[presentationOption].defaultValuesDisDisplayOpt,
      valuesFilter: undefined,
      disaggregateBy: [],
      filterBy: [],
      periodFilter: undefined,
      selectedReplicantValue: undefined,
    },
    s: {
      ...DEFAULT_S_CONFIG,
      content: VIZ_TYPE_CONFIG[presentationOption].defaultContent,
      // An "indicator" metric's values are each indicator's own quantity, so
      // a new figure colours by each indicator's own rule from the start. No
      // catalog is at hand here; an indicator with no rule simply renders
      // uncoloured with no legend.
      ...(resultsValue.formatAs === "indicator"
        ? { cfMode: "indicator" as const }
        : {}),
    },
    t: DEFAULT_T_CONFIG,
  };

  for (const disOpt of resultsValue.disaggregationOptions) {
    if (
      (disOpt.isRequired &&
        (!disOpt.allowedPresentationOptions ||
          disOpt.allowedPresentationOptions.includes(presentationOption))) ||
      disaggregations.includes(disOpt.value)
    ) {
      const disDisplayOpt = getNextAvailableDisaggregationDisplayOption(
        resultsValue,
        startingConfig,
        disOpt.value,
        resultsValue.valueProps,
      );
      startingConfig.d.disaggregateBy.push({
        disOpt: disOpt.value,
        disDisplayOpt,
      });
    }
  }
  return startingConfig;
}

export type GenericLongFormFetchConfig = {
  values: {
    prop: string;
    func: "SUM" | "AVG" | "COUNT" | "MIN" | "MAX" | "identity";
  }[];
  groupBys: (DisaggregationOption | PeriodOption)[];
  filters: { disOpt: DisaggregationOption; values: (string | number)[] }[];
  periodFilter: PeriodFilter | undefined;
  periodFilterExactBounds?: PeriodBounds;
  postAggregationExpression: string | undefined;
  // The dimension the roll-up collapses; presence = roll-up on. Baked in
  // client-side by getEffectiveRollupDimension — the server obeys, never
  // recomputes it.
  rollupDim?: RollupDimension;
};
