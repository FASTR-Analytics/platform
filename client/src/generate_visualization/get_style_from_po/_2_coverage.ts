import {
  ChartSeriesInfo,
  ChartValueInfo,
  ColorKeyOrString,
  CustomFigureStyleOptions,
  getFormatterFunc,
  toPct0,
} from "panther";
import { getCalendar, PresentationObjectConfig } from "lib";
import {
  getMapRegionsContent,
  getMapValuesColorFunc,
  getTableCellsContent,
  getTableLayoutStyle,
  getTextStyle,
} from "./_0_common";

export function buildCoverageChartStyle(
  config: PresentationObjectConfig,
  formatAs: "percent" | "number",
): CustomFigureStyleOptions {
  return {
    scale: config.s.scale,
    seriesColorFunc: getCoverageSeriesColorFunc(),
    text: getTextStyle(config),
    surrounds: {
      backgroundColor: "none",
    },
    legend: { reverseOrder: false },
    grid: { showGrid: true },
    panes: { nCols: config.s.nColsInCellDisplay, headerGap: 9, gapX: 30, gapY: 30 },
    lanes: { paddingLeft: 8 },
    tiers: { paddingBottom: 8 },
    xTextAxis: { tickLabelGap: 5, tickHeight: 7 },
    xPeriodAxis: { forceSideTicksWhenYear: false, calendar: getCalendar() },
    yScaleAxis: {
      allowIndividualTierLimits: false,
      max: config.s.forceYMax1 ? 1 : undefined,
      min: config.s.forceYMinAuto ? "auto" : undefined,
      tickLabelFormatter: getFormatterFunc(formatAs, 0),
    },
    content: {
      points: {
        func: {
          show: true,
          innerColorStrategy: { brighten: 0.5 },
          dataLabel: { show: true },
        },
        textFormatter: (info: ChartValueInfo) => {
          const thisSeries = info.seriesValArrays.at(info.i_series);
          if (!thisSeries) return "";
          let lastGoodIndex = 0;
          for (let i = 0; i < thisSeries.length; i++) {
            if (thisSeries[i] !== undefined) lastGoodIndex = i;
          }
          return info.i_val === lastGoodIndex ? toPct0(info.val) : "";
        },
      },
      bars: {
        func: { show: false },
        textFormatter: () => "",
        stacking: "none",
      },
      lines: {
        func: { show: true, dataLabel: { show: false } },
        textFormatter: (info: ChartValueInfo) =>
          getFormatterFunc(formatAs, 0)(info.val),
      },
      areas: {
        func: { show: false },
        diff: { enabled: false },
      },
      tableCells: getTableCellsContent(config, formatAs),
      mapRegions: getMapRegionsContent(config, formatAs),
    },
    table: getTableLayoutStyle(config),
    valuesColorFunc:
      config.d.type === "map" ? getMapValuesColorFunc(config) : undefined,
    map:
      config.d.type === "map"
        ? { projection: config.s.mapProjection ?? "equirectangular", dataLabelMode: "centroid" }
        : undefined,
  };
}

function getCoverageSeriesColorFunc(): (
  info: ChartSeriesInfo,
) => ColorKeyOrString {
  return (info) => {
    if (info.seriesHeader.startsWith("default")) return "#000000";
    if (
      info.seriesHeader.startsWith("Survey") ||
      info.seriesHeader.startsWith("Estimation basée")
    )
      return "#000000";
    if (
      info.seriesHeader.startsWith("Projected") ||
      info.seriesHeader.startsWith("Estimation projetée")
    )
      return "#F04D44";
    return "#CED4DB";
  };
}
