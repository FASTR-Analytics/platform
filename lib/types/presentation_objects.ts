import { ADMIN_LEVELS, type AdminLevel } from "../admin_area_rollup.ts";
import { getNextAvailableDisaggregationDisplayOption } from "../get_disaggregator_display_prop.ts";
import { t3 } from "../translate/mod.ts";
import {
  type PeriodOption,
  type PresentationOption,
  type DisaggregationDisplayOption,
  type RelativePeriodFilter,
  type BoundedPeriodFilter,
  type PeriodFilter,
} from "./_metric_installed.ts";
import type { PresentationObjectConfig } from "./_presentation_object_config.ts";
import {
  ALL_DISAGGREGATION_OPTIONS,
  type DisaggregationOption,
} from "./disaggregation_options.ts";
import type { ResultsValue } from "./modules.ts";
import {
  DEFAULT_S_CONFIG,
  DEFAULT_T_CONFIG,
} from "./presentation_object_defaults.ts";

export { ALL_DISAGGREGATION_OPTIONS, type DisaggregationOption };
export type { PresentationOption, DisaggregationDisplayOption, RelativePeriodFilter, BoundedPeriodFilter, PeriodFilter };

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
  projectId: string;
  moduleLastRun: string;
  // Freshness of the dataset(s) feeding indicator metadata, which labels the
  // cached disaggregation values. Rewritten on dataset integration (bumps
  // datasets.last_updated) independently of moduleLastRun, so the cache versions
  // on it too. Carried here so parseData can reproduce the version hash.
  datasetsVersion: string;
  // See ItemsHolderPresentationObject.runId (PLAN_RESULTS_RUNS §2.5).
  runId?: string;
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
  // Replicant value labels come from indicator metadata, rewritten on dataset
  // integration (bumps datasets.last_updated) independently of moduleLastRun, so
  // the cache versions on it too. Carried here so parseData can reproduce it.
  datasetsVersion: string;
  // See ItemsHolderPresentationObject.runId (PLAN_RESULTS_RUNS §2.5).
  runId?: string;
} & (
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
    disDisplayOptFallbacks: { series: "row", cell: "row", indicator: "col", mapArea: "row" },
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
    disDisplayOptFallbacks: { rowGroup: "row", colGroup: "col", mapArea: "cell" },
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
      series: t3({ en: "Lines", fr: "Lignes", pt: "Linhas" }),
      cell: t3({ en: "Grid", fr: "Grille", pt: "Grelha" }),
      row: t3({ en: "Rows", fr: "Rangées", pt: "Linhas" }),
      col: t3({ en: "Columns", fr: "Colonnes", pt: "Colunas" }),
      replicant: t3({ en: "Different charts (replicants)", fr: "Graphiques multiples (réplicants)", pt: "Gráficos diferentes (replicantes)" }),
      rowGroup: "",
      colGroup: "",
      indicator: "",
      mapArea: "",
    },
    table: {
      row: t3({ en: "Rows", fr: "Rangées", pt: "Linhas" }),
      col: t3({ en: "Columns", fr: "Colonnes", pt: "Colunas" }),
      rowGroup: t3({ en: "Row groups", fr: "Catégories de rangées", pt: "Grupos de linhas" }),
      colGroup: t3({ en: "Column groups", fr: "Groupes de colonnes", pt: "Grupos de colunas" }),
      replicant: t3({ en: "Different charts (replicants)", fr: "Graphiques multiples (réplicants)", pt: "Gráficos diferentes (replicantes)" }),
      series: "",
      cell: "",
      indicator: "",
      mapArea: "",
    },
    chart: {
      indicator: t3({ en: "Bars", fr: "Barres", pt: "Barras" }),
      series: t3({ en: "Series (sub-bars)", fr: "Series (sub-bars)", pt: "Séries (sub-barras)" }),
      cell: t3({ en: "Grid", fr: "Grille", pt: "Grelha" }),
      row: t3({ en: "Rows", fr: "Rangées", pt: "Linhas" }),
      col: t3({ en: "Columns", fr: "Colonnes", pt: "Colunas" }),
      replicant: t3({ en: "Different charts (replicants)", fr: "Graphiques multiples (réplicants)", pt: "Gráficos diferentes (replicantes)" }),
      rowGroup: "",
      colGroup: "",
      mapArea: "",
    },
    map: {
      mapArea: t3({ en: "Map regions", fr: "Régions de la carte", pt: "Regiões do mapa" }),
      cell: t3({ en: "Grid", fr: "Grille", pt: "Grelha" }),
      row: t3({ en: "Rows", fr: "Rangées", pt: "Linhas" }),
      col: t3({ en: "Columns", fr: "Colonnes", pt: "Colunas" }),
      replicant: t3({ en: "Different charts (replicants)", fr: "Graphiques multiples (réplicants)", pt: "Gráficos diferentes (replicantes)" }),
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
  hideFigureCaption?: boolean;
  hideFigureSubCaption?: boolean;
  hideFigureFootnote?: boolean;
};

// PresentationObjectConfig type + schema live in ./presentation_object_config.ts
// and are re-exported through the barrel. CustomSeriesStyle too.
export type { PresentationObjectConfig, CustomSeriesStyle } from "./_presentation_object_config.ts";


export type CreateModeVisualizationData = {
  label: string;
  resultsValue: PresentationObjectDetail["resultsValue"];
  config: PresentationObjectConfig;
};

const TIME_DISAGGREGATIONS: DisaggregationOption[] = ["period_id", "quarter_id", "year"];
const AREA_DISAGGREGATIONS: DisaggregationOption[] = [...ADMIN_LEVELS];

export function get_PRESENTATION_SELECT_OPTIONS(
  disaggregationOptions?: { value: DisaggregationOption }[],
): {
  value: PresentationOption;
  label: string;
}[] {
  const all = [
    { value: "table" as const, label: t3({ en: "Table", fr: "Tableau", pt: "Tabela" }) },
    { value: "timeseries" as const, label: t3({ en: "Timeseries", fr: "Série chronologique", pt: "Série temporal" }) },
    { value: "chart" as const, label: t3({ en: "Bar chart", fr: "Graphique à barres", pt: "Gráfico de barras" }) },
    { value: "map" as const, label: t3({ en: "Map", fr: "Carte", pt: "Mapa" }) },
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
    timeseries: t3({ en: "Timeseries", fr: "Série chronologique", pt: "Série temporal" }),
    chart: t3({ en: "Bar chart", fr: "Graphique à barres", pt: "Gráfico de barras" }),
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
      timeseriesGrouping: resultsValue.mostGranularTimePeriodColumnInResultsFile,
      valuesDisDisplayOpt:
        VIZ_TYPE_CONFIG[presentationOption].defaultValuesDisDisplayOpt,
      valuesFilter: undefined,
      disaggregateBy: [],
      filterBy: [],
      periodFilter: undefined,
      selectedReplicantValue: undefined,
      includeAdminAreaRollup: undefined,
      adminAreaRollupPosition: undefined,
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
  includeAdminAreaRollup?: boolean;
  adminAreaRollupLevel?: AdminLevel;
};
