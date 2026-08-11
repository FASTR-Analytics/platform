import {
  ChartSeriesInfo,
  ChartValueInfo,
  ColorKeyOrString,
  CustomFigureStyleOptions,
} from "panther";
import { type CalendarType } from "panther";
import {
  _CF_GREEN,
  _CF_RED,
  type DeckStyleContext,
  type IndicatorFormat,
  PresentationObjectConfig,
} from "lib";
import {
  formatIndicatorValue,
  getScaleTickLabelFormatter,
  getTextStyle,
} from "./_0_common";

export function buildDisruptionsChartStyle(
  config: PresentationObjectConfig,
  formatAs: IndicatorFormat,
  calendar: CalendarType,
  allowNegativeScale: boolean,
  deckStyle?: DeckStyleContext,
): CustomFigureStyleOptions {
  const inverted = config.s.diffInverted;

  return {
    seriesColorFunc: getDisruptionsSeriesColorFunc(inverted),
    text: getTextStyle(config, deckStyle),
    panes: {
      nCols: config.s.nColsInCellDisplay,
    },
    xPeriodAxis: { calendar },
    yScaleAxis: {
      allowIndividualTierLimits: config.s.allowIndividualRowLimits,
      max: config.s.forceYMax1 && formatAs === "percent" ? 1 : undefined,
      min: config.s.forceYMinAuto
        ? "auto"
        : allowNegativeScale
        ? "auto-zero"
        : undefined,
      tickLabelFormatter: getScaleTickLabelFormatter(formatAs),
    },
    content: {
      points: { func: { show: false } },
      bars: { func: { show: false } },
      lines: {
        func: (info) => ({
          show: true,
          color: "#000000",
          lineDash: info.i_series === 0 ? "solid" : "dashed",
          strokeWidth: info.i_series === 0 ? 3 : 1.5,
          dataLabel: { show: config.s.showDataLabelsLineCharts },
        }),
        textFormatter: (info: ChartValueInfo) =>
          formatIndicatorValue(info.val, formatAs, config.s.decimalPlaces ?? 0),
      },
      areas: {
        func: { show: true },
        diff: { enabled: true },
      },
    },
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
