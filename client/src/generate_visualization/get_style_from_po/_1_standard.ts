import {
  ChartValueInfo,
  CustomFigureStyleOptions,
  getFormatterFunc,
  type TickLabelFormatterOption,
} from "panther";
import { getCalendar, PresentationObjectConfig, selectCf } from "lib";
import { compileCfToValuesColorFunc } from "../conditional_formatting/compile";
import {
  getMapRegionsContent,
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
  const cf = selectCf(config.s);
  const cfOn = cf.type !== "none";

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
      showGrid: config.d.type !== "table" || cf.type === "none",
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
      tickLabelFormatter: (dataFormat === "percent"
        ? "auto-percent"
        : "auto-number") as TickLabelFormatterOption,
    },
    xScaleAxis: {
      allowIndividualLaneLimits: config.s.allowIndividualRowLimits,
      max: config.s.forceYMax1 ? 1 : undefined,
      min: config.s.forceYMinAuto ? "auto" : undefined,
      tickLabelFormatter: (dataFormat === "percent"
        ? "auto-percent"
        : "auto-number") as TickLabelFormatterOption,
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
            : cfOn
              ? {
                  show: true,
                  fillColor: 777 as const,
                  dataLabel: { show: config.s.showDataLabels },
                }
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
    valuesColorFunc: compileCfToValuesColorFunc(cf),
    map:
      config.d.type === "map"
        ? {
            projection: config.s.mapProjection ?? "equirectangular",
            dataLabelMode: "centroid",
          }
        : undefined,
  };
}
