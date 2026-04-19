import { getNextAvailableDisaggregationDisplayOption } from "../get_disaggregator_display_prop.ts";
import { t3 } from "../translate/mod.ts";
import type { PeriodOption, ResultsValue } from "./module_definition.ts";
import type { PresentationObjectConfig } from "./presentation_object_config.ts";
import {
  DEFAULT_S_CONFIG,
  DEFAULT_T_CONFIG,
} from "./presentation_object_defaults.ts";

export const ALL_DISAGGREGATION_OPTIONS = [
  "indicator_common_id",
  "admin_area_2",
  "admin_area_3",
  "admin_area_4",
  "year",
  "month",
  "quarter_id",
  "period_id",
  "denominator",
  "denominator_best_or_survey",
  "source_indicator",
  "target_population",
  "ratio_type",
  "facility_type",
  "facility_ownership",
  "facility_custom_1",
  "facility_custom_2",
  "facility_custom_3",
  "facility_custom_4",
  "facility_custom_5",
  "hfa_indicator",
  "hfa_category",
  "time_point",
] as const;

export type DisaggregationOption = (typeof ALL_DISAGGREGATION_OPTIONS)[number];

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
  filterBy: { col: DisaggregationOption; vals: string[] }[];
  createdByAI: boolean;
  folderId: string | null;
  sortOrder: number;
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
};

export type PeriodBounds = {
  periodOption: PeriodOption;
  min: number;
  max: number;
};

export type RelativePeriodFilter = {
  filterType:
    | "last_n_months"
    | "last_calendar_year"
    | "last_calendar_quarter"
    | "last_n_calendar_years"
    | "last_n_calendar_quarters";
  nMonths?: number;
  nYears?: number;
  nQuarters?: number;
};

export type BoundedPeriodFilter = {
  filterType: "custom" | "from_month";
  nMonths?: number;
  nYears?: number;
  nQuarters?: number;
} & PeriodBounds;

export type PeriodFilter = RelativePeriodFilter | BoundedPeriodFilter;

export function periodFilterHasBounds(
  filter: PeriodFilter,
): filter is BoundedPeriodFilter {
  return filter.filterType === "custom" || filter.filterType === "from_month";
}

// Status for disaggregation possible values (used in filter dropdowns)
export type DisaggregationPossibleValuesStatus =
  | {
      status: "ok";
      values: string[];
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
  projectId: string;
  moduleLastRun: string;
  periodBounds?: PeriodBounds;
  disaggregationPossibleValues: {
    [key in DisaggregationOption]?: DisaggregationPossibleValuesStatus;
  };
};

// Discriminated union for replicant option states
export type ReplicantOptionsForPresentationObject = {
  projectId: string;
  resultsObjectId: string;
  replicateBy: DisaggregationOption;
  fetchConfig: GenericLongFormFetchConfig;
  moduleLastRun: string;
} & (
  | {
      status: "ok";
      possibleValues: string[];
    }
  | {
      status: "too_many_values";
    }
  | {
      status: "no_values_available";
    }
);

export type DisaggregationDisplayOption =
  | "row"
  | "rowGroup"
  | "col"
  | "colGroup"
  | "series"
  | "cell"
  | "indicator"
  | "replicant"
  | "mapArea";

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
      specialScorecardTable: false,
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
    disDisplayOptFallbacks: { series: "row", cell: "row", indicator: "col", mapArea: "row" },
    styleResets: {
      specialBarChart: false,
      specialCoverageChart: false,
      specialDisruptionsChart: false,
      diffAreas: false,
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
    disDisplayOptFallbacks: { rowGroup: "row", colGroup: "col", mapArea: "cell" },
    styleResets: {
      specialScorecardTable: false,
      specialCoverageChart: false,
      specialDisruptionsChart: false,
      specialBarChart: false,
      diffAreas: false,
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
      specialScorecardTable: false,
      specialBarChart: false,
      specialCoverageChart: false,
      specialDisruptionsChart: false,
      specialBarChartInverted: false,
      diffAreas: false,
      barsStacked: false,
      verticalTickLabels: false,
      sortIndicatorValues: "none",
    },
  },
};

export function get_DISAGGREGATION_DISPLAY_OPTIONS(): Record<
  PresentationOption,
  { value: DisaggregationDisplayOption; label: string }[]
> {
  const labelMap: Record<
    PresentationOption,
    Record<DisaggregationDisplayOption, string>
  > = {
    timeseries: {
      series: t3({ en: "Lines", fr: "Lignes" }),
      cell: t3({ en: "Grid", fr: "Grille" }),
      row: t3({ en: "Rows", fr: "Rangées" }),
      col: t3({ en: "Columns", fr: "Colonnes" }),
      replicant: t3({ en: "Different charts (replicants)", fr: "Graphiques multiples (réplicants)" }),
      rowGroup: "",
      colGroup: "",
      indicator: "",
      mapArea: "",
    },
    table: {
      row: t3({ en: "Rows", fr: "Rangées" }),
      col: t3({ en: "Columns", fr: "Colonnes" }),
      rowGroup: t3({ en: "Row groups", fr: "Catégories de rangées" }),
      colGroup: t3({ en: "Column groups", fr: "Groupes de colonnes" }),
      replicant: t3({ en: "Different charts (replicants)", fr: "Graphiques multiples (réplicants)" }),
      series: "",
      cell: "",
      indicator: "",
      mapArea: "",
    },
    chart: {
      indicator: t3({ en: "Bars", fr: "Barres" }),
      series: t3({ en: "Series (sub-bars)", fr: "Series (sub-bars)" }),
      cell: t3({ en: "Grid", fr: "Grille" }),
      row: t3({ en: "Rows", fr: "Rangées" }),
      col: t3({ en: "Columns", fr: "Colonnes" }),
      replicant: t3({ en: "Different charts (replicants)", fr: "Graphiques multiples (réplicants)" }),
      rowGroup: "",
      colGroup: "",
      mapArea: "",
    },
    map: {
      mapArea: t3({ en: "Map regions", fr: "Régions de la carte" }),
      cell: t3({ en: "Grid", fr: "Grille" }),
      row: t3({ en: "Rows", fr: "Rangées" }),
      col: t3({ en: "Columns", fr: "Colonnes" }),
      replicant: t3({ en: "Different charts (replicants)", fr: "Graphiques multiples (réplicants)" }),
      series: "",
      indicator: "",
      rowGroup: "",
      colGroup: "",
    },
  };
  const result = {} as Record<
    PresentationOption,
    { value: DisaggregationDisplayOption; label: string }[]
  >;
  for (const type of ["timeseries", "table", "chart", "map"] as PresentationOption[]) {
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
  additionalScale?: number;
  hideFigureCaption?: boolean;
  hideFigureSubCaption?: boolean;
  hideFigureFootnote?: boolean;
};

// PresentationObjectConfig type + schema live in ./presentation_object_config.ts
// and are re-exported through the barrel. CustomSeriesStyle too.
export type { PresentationObjectConfig, CustomSeriesStyle } from "./presentation_object_config.ts";

export type PresentationOption = "timeseries" | "table" | "chart" | "map";

export type CreateModeVisualizationData = {
  label: string;
  resultsValue: PresentationObjectDetail["resultsValue"];
  config: PresentationObjectConfig;
};

const TIME_DISAGGREGATIONS: DisaggregationOption[] = ["period_id", "quarter_id", "year"];
const AREA_DISAGGREGATIONS: DisaggregationOption[] = ["admin_area_2", "admin_area_3", "admin_area_4"];

export function get_PRESENTATION_SELECT_OPTIONS(
  disaggregationOptions?: { value: DisaggregationOption }[],
): {
  value: PresentationOption;
  label: string;
}[] {
  const all = [
    { value: "table" as const, label: t3({ en: "Table", fr: "Tableau" }) },
    { value: "timeseries" as const, label: t3({ en: "Timeseries", fr: "Série chronologique" }) },
    { value: "chart" as const, label: t3({ en: "Bar chart", fr: "Graphique à barres" }) },
    { value: "map" as const, label: t3({ en: "Map", fr: "Carte" }) },
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
    table: t3({ en: "Table", fr: "Tableau" }),
    timeseries: t3({ en: "Timeseries", fr: "Série chronologique" }),
    chart: t3({ en: "Bar chart", fr: "Graphique à barres" }),
    map: t3({ en: "Map", fr: "Carte" }),
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
      timeseriesGrouping: resultsValue.mostGranularTimePeriodColumnInResultsFile,
      valuesDisDisplayOpt:
        VIZ_TYPE_CONFIG[presentationOption].defaultValuesDisDisplayOpt,
      valuesFilter: undefined,
      disaggregateBy: [],
      filterBy: [],
      periodFilter: undefined,
      selectedReplicantValue: undefined,
      includeNationalForAdminArea2: false,
      includeNationalPosition: "bottom",
    },
    s: {
      ...DEFAULT_S_CONFIG,
      content: VIZ_TYPE_CONFIG[presentationOption].defaultContent,
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
  filters: { col: DisaggregationOption; vals: string[] }[];
  periodFilter: PeriodFilter | undefined;
  periodFilterExactBounds?: PeriodBounds;
  postAggregationExpression: string | undefined;
  includeNationalForAdminArea2?: boolean;
  includeNationalPosition?: "bottom" | "top";
};
