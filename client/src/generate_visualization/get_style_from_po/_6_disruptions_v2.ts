import { ChartValueInfo, CustomFigureStyleOptions } from "panther";
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

export const BAND_GREY = "#e2e2e2";

// Series axis = the m011 value props in declared order (enforced by the
// build_figure_inputs guard): 0 observed, 1 expected, 2 ppi_lwr, 3 ppi_upr.
export function buildDisruptionsChartV2Style(
  config: PresentationObjectConfig,
  formatAs: IndicatorFormat,
  calendar: CalendarType,
  deckStyle?: DeckStyleContext,
): CustomFigureStyleOptions {
  const inverted = config.s.diffInverted;
  const aboveBandColor = inverted ? _CF_RED : _CF_GREEN;
  const belowBandColor = inverted ? _CF_GREEN : _CF_RED;

  return {
    text: getTextStyle(config, deckStyle),
    panes: {
      nCols: config.s.nColsInCellDisplay,
    },
    xPeriodAxis: { calendar },
    yScaleAxis: {
      allowIndividualTierLimits: config.s.allowIndividualRowLimits,
      max: config.s.forceYMax1 && formatAs === "percent" ? 1 : undefined,
      min: config.s.forceYMinAuto ? "auto" : undefined,
      tickLabelFormatter: getScaleTickLabelFormatter(formatAs),
    },
    content: {
      points: { func: { show: false } },
      bars: { func: { show: false } },
      lines: {
        func: (info) => ({
          show: info.i_series <= 1,
          color: "#000000",
          lineDash: info.i_series === 0 ? "solid" : "dashed",
          strokeWidth: info.i_series === 0 ? 3 : 1.5,
          dataLabel: { show: config.s.showDataLabelsLineCharts },
        }),
        textFormatter: (info: ChartValueInfo) =>
          formatIndicatorValue(info.val, formatAs, config.s.decimalPlaces ?? 0),
      },
      areas: {
        // Diff areas are styled with i_series = the attributed series: 0 for
        // observed-above-upper, 2 for observed-below-lower, 3 for the band.
        func: (info) => ({
          show: true,
          fillColor: info.i_series === 0
            ? aboveBandColor
            : info.i_series === 2
            ? belowBandColor
            : BAND_GREY,
          fillColorAdjustmentStrategy: { opacity: 1 },
        }),
        diff: {
          enabled: true,
          pairs: [
            { series: [3, 2], emit: "over" },
            { series: [0, 3], emit: "over" },
            { series: [0, 2], emit: "under" },
          ],
        },
      },
    },
  };
}
