import {
  FigureInputs,
  PeriodType,
  formatPeriod,
  getTimeseriesDataTransformed,
  t3,
  type GeoJSONFeatureCollection,
} from "panther";
import {
  ItemsHolderPresentationObject,
  PeriodBounds,
  PresentationObjectConfig,
  ResultsValueForVisualization,
  getCalendar,
  getEffectivePOConfig,
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
        ih.indicatorLabelReplacements,
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
            withReplicant(
              config.t.caption,
              config,
              ih.indicatorLabelReplacements,
            ),
            ih.dateRange,
          ),
          subCaption: withDateRange(
            withReplicant(
              config.t.subCaption,
              config,
              ih.indicatorLabelReplacements,
            ),
            ih.dateRange,
          ),
          footnote: withDateRange(
            withReplicant(
              config.t.footnote,
              config,
              ih.indicatorLabelReplacements,
            ),
            ih.dateRange,
          ),
          style: getStyleFromPresentationObject(config, resultsValue.formatAs ?? "number"),
          legend: getLegendFromConfig(config, resultsValue.formatAs ?? "number"),
        },
      };
    }

    if (effectiveConfig.d.type === "table") {
      return {
        status: "ready",
        data: {
          tableData: {
            jsonArray: ih.items,
            jsonDataConfig: getTableJsonDataConfigFromPresentationObjectConfig(
              resultsValue,
              effectiveConfig,
              effectiveValueProps,
              ih.indicatorLabelReplacements,
              ih.items,
            ),
          },
          caption: withDateRange(
            withReplicant(
              config.t.caption,
              config,
              ih.indicatorLabelReplacements,
            ),
            ih.dateRange,
          ),
          subCaption: withDateRange(
            withReplicant(
              config.t.subCaption,
              config,
              ih.indicatorLabelReplacements,
            ),
            ih.dateRange,
          ),
          footnote: withDateRange(
            withReplicant(
              config.t.footnote,
              config,
              ih.indicatorLabelReplacements,
            ),
            ih.dateRange,
          ),
          style: getStyleFromPresentationObject(config, resultsValue.formatAs ?? "number"),
          legend: getLegendFromConfig(config, resultsValue.formatAs ?? "number"),
        },
      };
    }

    if (effectiveConfig.d.type === "chart") {
      const commonSurrounds = {
        caption: withDateRange(
          withReplicant(
            config.t.caption,
            config,
            ih.indicatorLabelReplacements,
          ),
          ih.dateRange,
        ),
        subCaption: withDateRange(
          withReplicant(
            config.t.subCaption,
            config,
            ih.indicatorLabelReplacements,
          ),
          ih.dateRange,
        ),
        footnote: withDateRange(
          withReplicant(
            config.t.footnote,
            config,
            ih.indicatorLabelReplacements,
          ),
          ih.dateRange,
        ),
        style: getStyleFromPresentationObject(config, resultsValue.formatAs ?? "number"),
        legend: getLegendFromConfig(config, resultsValue.formatAs ?? "number"),
      };

      if (effectiveConfig.s.horizontal) {
        return {
          status: "ready",
          data: {
            chartOHData: {
              jsonArray: ih.items,
              jsonDataConfig:
                getChartOHJsonDataConfigFromPresentationObjectConfig(
                  resultsValue,
                  effectiveConfig,
                  effectiveValueProps,
                  ih.indicatorLabelReplacements,
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
            jsonDataConfig:
              getChartOVJsonDataConfigFromPresentationObjectConfig(
                resultsValue,
                effectiveConfig,
                effectiveValueProps,
                ih.indicatorLabelReplacements,
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
        ih.indicatorLabelReplacements,
      );

      const mapItems = ih.items.map((row: any) => {
        const raw = row[mapDataConfig.valueProp];
        if (raw !== undefined && raw !== null && typeof raw === "string") {
          const num = Number(raw);
          if (!isNaN(num)) {
            return { ...row, [mapDataConfig.valueProp]: num };
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
            withReplicant(
              config.t.caption,
              config,
              ih.indicatorLabelReplacements,
            ),
            ih.dateRange,
          ),
          subCaption: withDateRange(
            withReplicant(
              config.t.subCaption,
              config,
              ih.indicatorLabelReplacements,
            ),
            ih.dateRange,
          ),
          footnote: withDateRange(
            withReplicant(
              config.t.footnote,
              config,
              ih.indicatorLabelReplacements,
            ),
            ih.dateRange,
          ),
          style: getStyleFromPresentationObject(config, resultsValue.formatAs ?? "number"),
          legend: config.s.hideLegend ? undefined : buildMapAutoLegend(config, resultsValue.formatAs ?? "number"),
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
) {
  const cf = selectCf(config.s);

  if (cf.type === "thresholds") {
    return getLegendFromConfig(config, formatAs);
  }

  const noData = {
    color: "#f0f0f0",
    label: t3({ en: "No data", fr: "Aucune donnée" }),
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
): string {
  if (!str.includes("DATE_RANGE") && !str.includes("PLAGE_DE_DATES")) {
    return str;
  }
  if (!dateRange) {
    return str;
  }
  const calendar = getCalendar();
  const periodType: PeriodType =
    dateRange.periodOption === "period_id"
      ? "year-month"
      : dateRange.periodOption === "quarter_id"
        ? "year-quarter"
        : "year";
  if (dateRange.min === dateRange.max) {
    const d = formatPeriod(dateRange.min, periodType, calendar);
    return str.replaceAll("DATE_RANGE", d).replaceAll("PLAGE_DE_DATES", d);
  }
  const d =
    formatPeriod(dateRange.min, periodType, calendar) +
    t3({ en: " to ", fr: " à " }) +
    formatPeriod(dateRange.max, periodType, calendar);
  return str.replaceAll("DATE_RANGE", d).replaceAll("PLAGE_DE_DATES", d);
}
