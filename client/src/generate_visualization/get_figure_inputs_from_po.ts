import {
  FigureInputs,
  PeriodType,
  formatPeriod,
  getTimeseriesDataTransformed,
} from "panther";
import {
  ItemsHolderPresentationObject,
  PeriodBounds,
  PresentationObjectConfig,
  ResultsValueForVisualization,
  getCalendar,
  isFrench,
  withReplicant,
} from "lib";
import { getLegendItemsFromConfig } from "./conditional_formatting";
import {
  getChartOVJsonDataConfigFromPresentationObjectConfig,
  getTableJsonDataConfigFromPresentationObjectConfig,
  getTimeseriesJsonDataConfigFromPresentationObjectConfig,
} from "./get_data_config_from_po";
import { getStyleFromPresentationObject } from "./get_style_from_po";
import { getSpecialScorecardTableFigureInputs } from "./conditional_formatting_scorecard";

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
): StateHolder<FigureInputs> {
  // Type guard - this function should only be called with status: "ok"
  if (ih.status !== "ok") {
    throw new Error("getFigureInputsFromPresentationObject called with non-ok status");
  }

  try {
    if (config.d.type === "timeseries") {
      const j = getTimeseriesJsonDataConfigFromPresentationObjectConfig(
        resultsValue,
        config,
        ih.indicatorLabelReplacements,
        ih.items,
      );
      const d = getTimeseriesDataTransformed(
        {
          jsonArray: ih.items,
          jsonDataConfig: j,
        },
        config.s.content === "bars" && config.s.barsStacked,
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
          legendItemsOrLabels: getLegendItemsFromConfig(config),
        },
      };
    }

    if (config.d.type === "table") {
      if (config.s.specialScorecardTable) {
        return {
          status: "ready",
          data: getSpecialScorecardTableFigureInputs(resultsValue, ih, config),
        };
      }
      return {
        status: "ready",
        data: {
          tableData: {
            jsonArray: ih.items,
            jsonDataConfig: getTableJsonDataConfigFromPresentationObjectConfig(
              resultsValue,
              config,
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
          legendItemsOrLabels: getLegendItemsFromConfig(config),
        },
      };
    }

    if (config.d.type === "chart") {
      return {
        status: "ready",
        data: {
          chartData: {
            jsonArray: ih.items,
            jsonDataConfig:
              getChartOVJsonDataConfigFromPresentationObjectConfig(
                resultsValue,
                config,
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
    (isFrench() ? " à " : " to ") +
    formatPeriod(dateRange.max, periodType, calendar);
  return str.replaceAll("DATE_RANGE", d).replaceAll("PLAGE_DE_DATES", d);
}
