import {
  FigureInputs,
  PeriodType,
  formatPeriod,
  getPeriodTypeFromValue,
  getTimeseriesDataTransformed,
  type GeoJSONFeatureCollection,
} from "panther";
import {
  type FigureLocalization,
  type IndicatorMetadata,
  ItemsHolderPresentationObject,
  PeriodBounds,
  PresentationObjectConfig,
  ResultsValueForVisualization,
  getCalendar,
  getEffectivePOConfig,
  getLanguage,
  indicatorMetadataToLabelMap,
  selectCf,
  withReplicant,
} from "lib";
import { getLegendFromConfig } from "./conditional_formatting";
import {
  getChartOHJsonDataConfigFromPresentationObjectConfig,
  getChartOVJsonDataConfigFromPresentationObjectConfig,
  getTableJsonDataConfigFromPresentationObjectConfig,
  getTimeseriesJsonDataConfigFromPresentationObjectConfig,
} from "./get_data_config_from_po";
import { getStyleFromPresentationObject } from "./get_style_from_po";
import { getMapJsonDataConfigFromPresentationObjectConfig } from "./get_data_config_for_map";
import { getAdminAreaLevelFromMapConfig } from "./get_admin_area_level_from_config";
import { isSpecialScorecardTableActive } from "./special_chart_checks";
import { instanceState } from "../state/instance/t1_store";

type StateHolder<T> =
  | {
      status: "loading";
      msg?: string | undefined;
    }
  | {
      status: "error";
      err: string;
    }
  | {
      status: "ready";
      data: T;
    };

function buildIndicatorSortOrder(metadata: IndicatorMetadata[]): string[] {
  return [...metadata]
    .filter((m) => m.sort_order !== undefined)
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    .flatMap((m) => [m.id, m.label]);
}

// Charts/timeseries format every value with the single metric-level `formatAs`
// (unlike tables, which read per-indicator `format_as` for each cell). A value
// axis can carry only one format, so when every *displayed* indicator is a
// percent we treat the whole figure as percent.
//
// We look at the indicators actually present in the data, not module-wide
// `indicatorMetadata`: an HFA module mixes percent and number indicators (plus
// label-only category entries with no `format_as`), so a module-wide check
// almost never holds even when this figure only plots percent indicators.
function displayedIndicatorsAllPercent(
  items: Record<string, string>[],
  metadata: IndicatorMetadata[],
  config: PresentationObjectConfig,
): boolean {
  const formatById = new Map(
    metadata
      .filter((m) => m.format_as !== undefined)
      .map((m) => [m.id, m.format_as!] as const),
  );
  if (formatById.size === 0) return false;

  const cols = config.d.disaggregateBy.map((d) => d.disOpt);
  let sawIndicator = false;

  // Returns false as soon as a displayed indicator is not a percent.
  const inspect = (value: string | undefined): boolean => {
    const format = value === undefined ? undefined : formatById.get(value);
    if (format === undefined) return true; // not an indicator id
    sawIndicator = true;
    return format === "percent";
  };

  if (!inspect(config.d.selectedReplicantValue)) return false;
  for (const row of items) {
    for (const col of cols) {
      if (!inspect(row[col])) return false;
    }
  }
  return sawIndicator;
}

export function getFigureInputsFromPresentationObject(
  resultsValue: ResultsValueForVisualization,
  ih: ItemsHolderPresentationObject,
  config: PresentationObjectConfig,
  geoJson?: GeoJSONFeatureCollection,
): StateHolder<FigureInputs> {
  // Type guard - this function should only be called with status: "ok"
  if (ih.status !== "ok") {
    throw new Error("getFigureInputsFromPresentationObject called with non-ok status");
  }

  // Build localization from ambient reads — this preserves existing behavior.
  // buildFigureInputs (the new path) passes localization from the bundle instead.
  const localization: FigureLocalization = {
    language: getLanguage() as "en" | "fr",
    calendar: getCalendar() as "gregorian" | "ethiopian",
    countryIso3: instanceState.countryIso3,
  };

  const indicatorLabelReplacements = indicatorMetadataToLabelMap(ih.indicatorMetadata);

  const effectiveFormatAs: "percent" | "number" = displayedIndicatorsAllPercent(
    ih.items,
    ih.indicatorMetadata,
    config,
  )
    ? "percent"
    : (resultsValue.formatAs ?? "number");

  const { config: effectiveConfig, effectiveValueProps } = getEffectivePOConfig(config, {
    dateRange: ih.dateRange,
    valueProps: resultsValue.valueProps,
  });

  try {
    if (effectiveConfig.d.type === "timeseries") {
      const j = getTimeseriesJsonDataConfigFromPresentationObjectConfig(
        resultsValue,
        effectiveConfig,
        effectiveValueProps,
        indicatorLabelReplacements,
        localization,
        ih.items,
      );
      const d = getTimeseriesDataTransformed(
        {
          jsonArray: ih.items,
          jsonDataConfig: j,
        },
        effectiveConfig.s.content === "bars" && effectiveConfig.s.barsStacked,
      );
      return {
        status: "ready",
        data: {
          timeseriesData: d,
          caption: withDateRange(
            withReplicant(config.t.caption, config, indicatorLabelReplacements, localization.countryIso3),
            ih.dateRange,
            localization,
          ),
          subCaption: withDateRange(
            withReplicant(config.t.subCaption, config, indicatorLabelReplacements, localization.countryIso3),
            ih.dateRange,
            localization,
          ),
          footnote: withDateRange(
            withReplicant(config.t.footnote, config, indicatorLabelReplacements, localization.countryIso3),
            ih.dateRange,
            localization,
          ),
          style: getStyleFromPresentationObject(config, effectiveFormatAs, localization.calendar, undefined, ih.indicatorMetadata),
          legend: getLegendFromConfig(config, effectiveFormatAs, localization),
        },
      };
    }

    if (effectiveConfig.d.type === "table") {
      const customSortHeaders = isSpecialScorecardTableActive(config)
        ? buildIndicatorSortOrder(ih.indicatorMetadata)
        : undefined;
      return {
        status: "ready",
        data: {
          tableData: {
            jsonArray: ih.items,
            jsonDataConfig: getTableJsonDataConfigFromPresentationObjectConfig(
              resultsValue,
              effectiveConfig,
              effectiveValueProps,
              indicatorLabelReplacements,
              localization,
              ih.items,
              customSortHeaders,
            ),
          },
          caption: withDateRange(
            withReplicant(config.t.caption, config, indicatorLabelReplacements, localization.countryIso3),
            ih.dateRange,
            localization,
          ),
          subCaption: withDateRange(
            withReplicant(config.t.subCaption, config, indicatorLabelReplacements, localization.countryIso3),
            ih.dateRange,
            localization,
          ),
          footnote: withDateRange(
            withReplicant(config.t.footnote, config, indicatorLabelReplacements, localization.countryIso3),
            ih.dateRange,
            localization,
          ),
          style: getStyleFromPresentationObject(config, effectiveFormatAs, localization.calendar, undefined, ih.indicatorMetadata),
          legend: getLegendFromConfig(config, effectiveFormatAs, localization),
        },
      };
    }

    if (effectiveConfig.d.type === "chart") {
      const commonSurrounds = {
        caption: withDateRange(
          withReplicant(config.t.caption, config, indicatorLabelReplacements, localization.countryIso3),
          ih.dateRange,
          localization,
        ),
        subCaption: withDateRange(
          withReplicant(config.t.subCaption, config, indicatorLabelReplacements, localization.countryIso3),
          ih.dateRange,
          localization,
        ),
        footnote: withDateRange(
          withReplicant(config.t.footnote, config, indicatorLabelReplacements, localization.countryIso3),
          ih.dateRange,
          localization,
        ),
        style: getStyleFromPresentationObject(config, effectiveFormatAs, localization.calendar, undefined, ih.indicatorMetadata),
        legend: getLegendFromConfig(config, effectiveFormatAs, localization),
      };

      if (effectiveConfig.s.horizontal) {
        return {
          status: "ready",
          data: {
            chartOHData: {
              jsonArray: ih.items,
              jsonDataConfig: getChartOHJsonDataConfigFromPresentationObjectConfig(
                resultsValue,
                effectiveConfig,
                effectiveValueProps,
                indicatorLabelReplacements,
                localization,
                ih.items,
              ),
            },
            ...commonSurrounds,
          },
        };
      }

      return {
        status: "ready",
        data: {
          chartData: {
            jsonArray: ih.items,
            jsonDataConfig: getChartOVJsonDataConfigFromPresentationObjectConfig(
              resultsValue,
              effectiveConfig,
              effectiveValueProps,
              indicatorLabelReplacements,
              localization,
              ih.items,
            ),
          },
          ...commonSurrounds,
        },
      };
    }

    if (effectiveConfig.d.type === "map") {
      if (!geoJson) {
        const level = getAdminAreaLevelFromMapConfig(effectiveConfig);
        return { status: "error", err: `[INFO] Map files not yet uploaded for Admin Area ${level ?? ""}` };
      }
      const mapDataConfig = getMapJsonDataConfigFromPresentationObjectConfig(
        resultsValue,
        effectiveConfig,
        effectiveValueProps,
        indicatorLabelReplacements,
      );

      const mapItems = ih.items.map((row: Record<string, string>) => {
        const raw = row[mapDataConfig.valueProp];
        if (raw !== undefined && raw !== null) {
          const num = Number(raw);
          if (!isNaN(num)) {
            return { ...row, [mapDataConfig.valueProp]: num as unknown as string };
          }
        }
        return row;
      });

      return {
        status: "ready",
        data: {
          mapData: {
            geoData: geoJson,
            jsonArray: mapItems,
            jsonDataConfig: mapDataConfig,
          },
          caption: withDateRange(
            withReplicant(config.t.caption, config, indicatorLabelReplacements, localization.countryIso3),
            ih.dateRange,
            localization,
          ),
          subCaption: withDateRange(
            withReplicant(config.t.subCaption, config, indicatorLabelReplacements, localization.countryIso3),
            ih.dateRange,
            localization,
          ),
          footnote: withDateRange(
            withReplicant(config.t.footnote, config, indicatorLabelReplacements, localization.countryIso3),
            ih.dateRange,
            localization,
          ),
          style: getStyleFromPresentationObject(config, effectiveFormatAs, localization.calendar, undefined, ih.indicatorMetadata),
          legend: config.s.hideLegend ? undefined : buildMapAutoLegend(config, effectiveFormatAs, localization),
        },
      };
    }

    return { status: "error", err: "Bad presentation type" };
  } catch (e) {
    console.error(e);
    return {
      status: "error",
      err:
        "Problem making figure inputs from presentation object: " +
        (e instanceof Error ? e.message : ""),
    };
  }
}

///////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////

function buildMapAutoLegend(
  config: PresentationObjectConfig,
  formatAs: "percent" | "number",
  localization: Pick<FigureLocalization, "language">,
) {
  const cf = selectCf(config.s);

  if (cf.type === "thresholds") {
    return getLegendFromConfig(config, formatAs, localization);
  }

  const noData = {
    color: "#f0f0f0",
    label: localization.language === "fr" ? "Aucune donnée" : "No data",
  };
  const domain =
    cf.type === "scale" && cf.domain.kind === "fixed"
      ? { min: cf.domain.min, max: cf.domain.max }
      : undefined;
  const steps = cf.type === "scale" ? cf.steps : undefined;
  if (steps !== undefined && steps >= 2) {
    return {
      type: "stepped-auto" as const,
      nSteps: steps,
      domain,
      format: formatAs,
      noData,
    };
  }
  return {
    type: "gradient-auto" as const,
    nTicks: 5,
    domain,
    format: formatAs,
    noData,
  };
}

function withDateRange(
  str: string,
  dateRange: PeriodBounds | undefined,
  localization: Pick<FigureLocalization, "calendar" | "language">,
): string {
  if (!str.includes("DATE_RANGE") && !str.includes("PLAGE_DE_DATES")) {
    return str;
  }
  if (!dateRange) {
    return str;
  }
  const { calendar, language } = localization;
  const periodType: PeriodType = getPeriodTypeFromValue(dateRange.min) ?? "year";
  if (dateRange.min === dateRange.max) {
    const d = formatPeriod(dateRange.min, periodType, calendar);
    return str.replaceAll("DATE_RANGE", d).replaceAll("PLAGE_DE_DATES", d);
  }
  const separator = language === "fr" ? " à " : " to ";
  const d =
    formatPeriod(dateRange.min, periodType, calendar) +
    separator +
    formatPeriod(dateRange.max, periodType, calendar);
  return str.replaceAll("DATE_RANGE", d).replaceAll("PLAGE_DE_DATES", d);
}
