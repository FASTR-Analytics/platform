import {
  ChartSeriesInfo,
  ChartValueInfo,
  ColorKeyOrString,
  CustomFigureStyleOptions,
  getFormatterFunc,
} from "panther";
import { _CF_GREEN, _CF_RED, getCalendar, PresentationObjectConfig } from "lib";
import {
  getMapRegionsContent,
  getMapValuesColorFunc,
  getTableCellsContent,
  getTableLayoutStyle,
  getTextStyle,
} from "./_0_common";

export function buildDisruptionsChartStyle(
  config: PresentationObjectConfig,
  formatAs: "percent" | "number",
): CustomFigureStyleOptions {
  const inverted = config.s.diffInverted;

  return {
    scale: config.s.scale,
    seriesColorFunc: getDisruptionsSeriesColorFunc(inverted),
    text: getTextStyle(config),
    surrounds: {
      backgroundColor: "none",
    },
    legend: { reverseOrder: false },
    grid: { showGrid: true },
    panes: {
      nCols: config.s.nColsInCellDisplay,
      headerGap: 9,
      gapX: 30,
      gapY: 30,
    },
    lanes: { paddingLeft: 8 },
    tiers: { paddingBottom: 8 },
    xTextAxis: { tickLabelGap: 5, tickHeight: 7 },
    xPeriodAxis: { forceSideTicksWhenYear: false, calendar: getCalendar() },
    yScaleAxis: {
      allowIndividualTierLimits: config.s.allowIndividualRowLimits,
      max: config.s.forceYMax1 ? 1 : undefined,
      min: config.s.forceYMinAuto ? "auto" : undefined,
      tickLabelFormatter: getFormatterFunc(
        formatAs,
        config.s.decimalPlaces ?? 0,
      ),
    },
    content: {
      points: {
        func: {
          show: false,
          innerColorStrategy: { brighten: 0.5 },
          dataLabel: { show: false },
        },
        textFormatter: () => "",
      },
      bars: {
        func: { show: false },
        textFormatter: () => "",
        stacking: "none",
      },
      lines: {
        func: (info) => ({
          show: true,
          color: "#000000",
          lineDash: info.i_series === 0 ? "solid" : "dashed",
          strokeWidth: info.i_series === 0 ? 3 : 1.5,
          dataLabel: { show: config.s.showDataLabelsLineCharts },
        }),
        textFormatter: (info: ChartValueInfo) =>
          getFormatterFunc(formatAs, config.s.decimalPlaces ?? 0)(info.val),
      },
      areas: {
        func: { show: true },
        diff: { enabled: true },
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

function getDisruptionsSeriesColorFunc(
  inverted: boolean,
): (info: ChartSeriesInfo) => ColorKeyOrString {
  return (info) => {
    if (inverted) {
      return [_CF_RED, _CF_GREEN][info.i_series] ?? _CF_RED;
    }
    return [_CF_GREEN, _CF_RED][info.i_series] ?? _CF_GREEN;
  };
}
