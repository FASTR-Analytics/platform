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
  type FastrChartPalette,
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
  // A themed report's own good/bad and ink (see getStandardSeriesColorFunc).
  chartPalette?: FastrChartPalette,
): CustomFigureStyleOptions {
  const inverted = config.s.diffInverted;

  return {
    seriesColorFunc: getDisruptionsSeriesColorFunc(inverted, chartPalette),
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
          // The document's ink on a themed page (black vanishes on a dark one).
          color: chartPalette?.strong ?? "#000000",
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
  chartPalette: FastrChartPalette | undefined,
): (info: ChartSeriesInfo) => ColorKeyOrString {
  const good = chartPalette?.good ?? _CF_GREEN;
  const bad = chartPalette?.bad ?? _CF_RED;
  return (info) => {
    if (inverted) {
      return [bad, good][info.i_series] ?? bad;
    }
    return [good, bad][info.i_series] ?? good;
  };
}
