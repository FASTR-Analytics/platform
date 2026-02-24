import { AspectRatio } from "@timroberton/panther";
import { getNextAvailableDisaggregationDisplayOption } from "../get_disaggregator_display_prop.ts";
import { T, t2 } from "../translate/mod.ts";
import { PeriodOption, ResultsValue } from "./module_definitions.ts";
import type { OptionalFacilityColumn } from "./instance.ts";
import {
  DEFAULT_S_CONFIG,
  DEFAULT_T_CONFIG,
} from "./presentation_object_defaults.ts";

export type DisaggregationOption =
  | "indicator_common_id"
  | "admin_area_2"
  | "admin_area_3"
  | "admin_area_4"
  | "year"
  | "month"
  | "quarter_id"
  | "period_id"
  | "denominator"
  | "denominator_best_or_survey"
  | "source_indicator"
  | "target_population"
  | "ratio_type"
  | OptionalFacilityColumn
  | "hfa_indicator"
  | "hfa_category"
  | "time_point";

export const ALL_DISAGGREGATION_OPTIONS: readonly string[] = [
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
  "facility_name",
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
];

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

export type PeriodFilter = {
  filterType?: "last_n_months" | "from_month" | "last_calendar_year" | "last_calendar_quarter" | "custom";
  nMonths?: number;
} & PeriodBounds;

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
export type ReplicantOptionsForPresentationObject =
  & {
    projectId: string;
    resultsObjectId: string;
    replicateBy: DisaggregationOption;
    fetchConfig: GenericLongFormFetchConfig;
    moduleLastRun: string;
  }
  & (
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
  | "replicant";

export const VIZ_TYPE_CONFIG: Record<PresentationOption, {
  defaultValuesDisDisplayOpt: DisaggregationDisplayOption;
  defaultContent: PresentationObjectConfig["s"]["content"];
  disaggregationDisplayOptions: DisaggregationDisplayOption[];
  disDisplayOptFallbacks: Partial<Record<DisaggregationDisplayOption, DisaggregationDisplayOption>>;
  styleResets: Partial<PresentationObjectConfig["s"]>;
}> = {
  timeseries: {
    defaultValuesDisDisplayOpt: "series",
    defaultContent: "lines",
    disaggregationDisplayOptions: ["series", "cell", "row", "col", "replicant"],
    disDisplayOptFallbacks: { indicator: "series", rowGroup: "row", colGroup: "col" },
    styleResets: { specialScorecardTable: false, sortIndicatorValues: "none", verticalTickLabels: false },
  },
  table: {
    defaultValuesDisDisplayOpt: "col",
    defaultContent: "bars",
    disaggregationDisplayOptions: ["row", "col", "rowGroup", "colGroup", "replicant"],
    disDisplayOptFallbacks: { series: "row", cell: "row", indicator: "col" },
    styleResets: { specialBarChart: false, specialCoverageChart: false, diffAreas: false, sortIndicatorValues: "none", verticalTickLabels: false },
  },
  chart: {
    defaultValuesDisDisplayOpt: "indicator",
    defaultContent: "bars",
    disaggregationDisplayOptions: ["indicator", "series", "cell", "row", "col", "replicant"],
    disDisplayOptFallbacks: { rowGroup: "row", colGroup: "col" },
    styleResets: { specialScorecardTable: false, specialCoverageChart: false, specialBarChart: false, diffAreas: false },
  },
};

export function get_DISAGGREGATION_DISPLAY_OPTIONS(): Record<
  PresentationOption,
  { value: DisaggregationDisplayOption; label: string }[]
> {
  const labelMap: Record<PresentationOption, Record<DisaggregationDisplayOption, string>> = {
    timeseries: {
      series: t2(T.FRENCH_UI_STRINGS.lines),
      cell: t2(T.FRENCH_UI_STRINGS.grid),
      row: t2(T.FRENCH_UI_STRINGS.rows),
      col: t2(T.FRENCH_UI_STRINGS.columns),
      replicant: t2(T.FRENCH_UI_STRINGS.different_charts_replicants),
      rowGroup: "", colGroup: "", indicator: "",
    },
    table: {
      row: t2(T.FRENCH_UI_STRINGS.rows),
      col: t2(T.FRENCH_UI_STRINGS.columns),
      rowGroup: t2(T.FRENCH_UI_STRINGS.row_groups),
      colGroup: t2(T.FRENCH_UI_STRINGS.column_groups),
      replicant: t2(T.FRENCH_UI_STRINGS.different_charts_replicants),
      series: "", cell: "", indicator: "",
    },
    chart: {
      indicator: t2(T.FRENCH_UI_STRINGS.bars),
      series: t2(T.FRENCH_UI_STRINGS.series_subbars),
      cell: t2(T.FRENCH_UI_STRINGS.grid),
      row: t2(T.FRENCH_UI_STRINGS.rows),
      col: t2(T.FRENCH_UI_STRINGS.columns),
      replicant: t2(T.FRENCH_UI_STRINGS.different_charts_replicants),
      rowGroup: "", colGroup: "",
    },
  };
  const result = {} as Record<PresentationOption, { value: DisaggregationDisplayOption; label: string }[]>;
  for (const type of ["timeseries", "table", "chart"] as PresentationOption[]) {
    result[type] = VIZ_TYPE_CONFIG[type].disaggregationDisplayOptions.map((v) => ({
      value: v,
      label: labelMap[type][v],
    }));
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

export type PresentationObjectConfig = {
  // Fetch
  d: {
    type: PresentationOption;
    periodOpt: PeriodOption;
    valuesDisDisplayOpt: DisaggregationDisplayOption;
    valuesFilter?: string[];
    disaggregateBy: {
      disOpt: DisaggregationOption;
      disDisplayOpt: DisaggregationDisplayOption;
    }[];
    filterBy: {
      disOpt: DisaggregationOption;
      values: string[];
    }[];
    periodFilter?: PeriodFilter;
    selectedReplicantValue?: string;
    includeNationalForAdminArea2?: boolean;
    includeNationalPosition?: "bottom" | "top";
  };
  // Styles
  s: {
    scale: number;
    content: "lines" | "bars" | "points" | "areas";
    conditionalFormatting: "none" | string;
    allowIndividualRowLimits: boolean;
    colorScale:
      | "pastel-discrete"
      | "alt-discrete"
      | "red-green"
      | "blue-green"
      | "single-grey"
      | "custom";
    decimalPlaces: 0 | 1 | 2 | 3;
    hideLegend: boolean;
    showDataLabels: boolean;
    showDataLabelsLineCharts: boolean;
    barsStacked: boolean;
    diffAreas: boolean;
    diffAreasOrder: "actual-expected" | "expected-actual";
    diffInverted: boolean;
    specialBarChart: boolean;
    specialBarChartInverted: boolean;
    specialBarChartDiffThreshold: number;
    specialBarChartDataLabels: "all-values" | "threshold-values";
    specialCoverageChart: boolean;
    specialScorecardTable: boolean;
    idealAspectRatio: "none" | "ideal" | AspectRatio;
    verticalTickLabels: boolean;
    allowVerticalColHeaders: boolean;
    forceYMax1: boolean;
    forceYMinAuto: boolean;
    customSeriesStyles: CustomSeriesStyle[];
    nColsInCellDisplay: "auto" | number;
    seriesColorFuncPropToUse: "series" | "cell" | "col" | "row" | undefined;
    sortIndicatorValues: "ascending" | "descending" | "none";
    formatAdminArea3Labels: boolean;
  };
  // Text
  t: {
    caption: string;
    captionRelFontSize: number;
    subCaption: string;
    subCaptionRelFontSize: number;
    footnote: string;
    footnoteRelFontSize: number;
  };
};

export type PresentationOption = "timeseries" | "table" | "chart";

export type CreateModeVisualizationData = {
  label: string;
  resultsValue: PresentationObjectDetail["resultsValue"];
  config: PresentationObjectConfig;
};

export function get_PRESENTATION_SELECT_OPTIONS(): {
  value: PresentationOption;
  label: string;
}[] {
  return [
    { value: "table", label: t2(T.FRENCH_UI_STRINGS.table) },
    { value: "timeseries", label: t2(T.FRENCH_UI_STRINGS.timeseries) },
    { value: "chart", label: t2(T.FRENCH_UI_STRINGS.bar_chart) },
  ];
}

export function get_PRESENTATION_OPTIONS_MAP(): Record<
  PresentationOption,
  string
> {
  return {
    table: t2(T.FRENCH_UI_STRINGS.table),
    timeseries: t2(T.FRENCH_UI_STRINGS.timeseries),
    chart: t2(T.FRENCH_UI_STRINGS.bar_chart),
  };
}

export type CustomSeriesStyle = {
  color: string;
  strokeWidth: number;
  lineStyle: "solid" | "dashed";
};

export function getStartingConfigForPresentationObject(
  resultsValue: ResultsValue,
  presentationOption: PresentationOption,
  disaggregations: DisaggregationOption[],
): PresentationObjectConfig {
  const startingConfig: PresentationObjectConfig = {
    d: {
      type: presentationOption,
      periodOpt: resultsValue.periodOptions.at(0) ?? "period_id",
      valuesDisDisplayOpt: VIZ_TYPE_CONFIG[presentationOption].defaultValuesDisDisplayOpt,
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
