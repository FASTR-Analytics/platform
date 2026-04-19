import {
  ChartValueInfo,
  CustomFigureStyleOptions,
  getFormatterFunc,
} from "panther";
import { getCalendar, PresentationObjectConfig } from "lib";
import { getColorFuncGivenConditionalFormatting } from "../conditional_formatting";
import {
  getMapRegionsContent,
  getMapValuesColorFunc,
  getStandardSeriesColorFunc,
  getTableCellsContent,
  getTableLayoutStyle,
  getTextStyle,
} from "./_0_common";

export function buildStandardStyle(
  config: PresentationObjectConfig,
  formatAs: "percent" | "number",
): CustomFigureStyleOptions {
  const dataFormat = formatAs;
  const colorFuncGivenCF = getColorFuncGivenConditionalFormatting(config);

  return {
    scale: config.s.scale,
    seriesColorFunc: getStandardSeriesColorFunc(config),
    text: getTextStyle(config),
    surrounds: {
      legendPosition: config.s.hideLegend ? "none" : undefined,
    },
    legend: {
      reverseOrder: config.s.content === "bars" && config.s.barsStacked,
    },
    grid: {
      showGrid:
        config.d.type !== "table" || config.s.conditionalFormatting === "none",
    },
    panes: {
      nCols: config.s.nColsInCellDisplay,
    },
    xTextAxis: {
      verticalTickLabels: config.s.verticalTickLabels,
      tickPosition: config.s.content === "points" ? "center" : undefined,
    },
    xPeriodAxis: {
      forceSideTicksWhenYear: config.s.content === "bars",
      calendar: getCalendar(),
    },
    yScaleAxis: {
      allowIndividualTierLimits: config.s.allowIndividualRowLimits,
      max: config.s.forceYMax1 ? 1 : undefined,
      min: config.s.forceYMinAuto ? "auto" : undefined,
      tickLabelFormatter: getFormatterFunc(
        dataFormat,
        config.s.decimalPlaces ?? 0,
      ),
    },
    xScaleAxis: {
      allowIndividualLaneLimits: config.s.allowIndividualRowLimits,
      max: config.s.forceYMax1 ? 1 : undefined,
      min: config.s.forceYMinAuto ? "auto" : undefined,
      tickLabelFormatter: getFormatterFunc(
        dataFormat,
        config.s.decimalPlaces ?? 0,
      ),
    },
    content: {
      points: {
        func: {
          show: config.s.content === "points",
          dataLabel: { show: config.s.showDataLabels },
        },
        textFormatter: (info: ChartValueInfo) =>
          getFormatterFunc(dataFormat, config.s.decimalPlaces ?? 0)(info.val),
      },
      bars: {
        func:
          config.s.content !== "bars"
            ? { show: false }
            : colorFuncGivenCF
              ? (info) => ({
                  show: true,
                  color: colorFuncGivenCF(info.val),
                  dataLabel: { show: config.s.showDataLabels },
                })
              : { show: true, dataLabel: { show: config.s.showDataLabels } },
        textFormatter: (info: ChartValueInfo) =>
          getFormatterFunc(dataFormat, config.s.decimalPlaces ?? 0)(info.val),
        stacking:
          config.s.content === "bars" && config.s.barsStacked
            ? "stacked"
            : "none",
      },
      lines: {
        func: {
          show: config.s.content === "lines" || config.s.content === "areas",
          dataLabel: { show: config.s.showDataLabelsLineCharts },
        },
        textFormatter: (info: ChartValueInfo) =>
          getFormatterFunc(dataFormat, config.s.decimalPlaces ?? 0)(info.val),
      },
      areas: {
        func: { show: config.s.content === "areas" },
      },
      tableCells: getTableCellsContent(config, formatAs),
      mapRegions: getMapRegionsContent(config, formatAs),
    },
    table: getTableLayoutStyle(config),
    valuesColorFunc:
      config.d.type === "map" ? getMapValuesColorFunc(config) : undefined,
    map:
      config.d.type === "map"
        ? {
            projection: config.s.mapProjection ?? "equirectangular",
            dataLabelMode: "centroid",
          }
        : undefined,
  };
}
