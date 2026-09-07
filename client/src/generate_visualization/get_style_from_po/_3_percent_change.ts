import {
  ChartValueInfo,
  CustomFigureStyleOptions,
  getFormatterFunc,
} from "panther";
import { type CalendarType } from "panther";
import {
  _CF_COMPARISON,
  _CF_GREEN,
  _CF_RED,
  type DeckStyleContext,
  type FastrChartPalette,
  type IndicatorFormat,
  PresentationObjectConfig,
} from "lib";
import {
  getScaleTickLabelFormatter,
  getStandardSeriesColorFunc,
  getTextStyle,
} from "./_0_common";

export function buildPercentChangeChartStyle(
  config: PresentationObjectConfig,
  formatAs: IndicatorFormat,
  calendar: CalendarType,
  deckStyle?: DeckStyleContext,
  chartPalette?: FastrChartPalette,
): CustomFigureStyleOptions {
  const threshold = config.s.specialBarChartDiffThreshold ?? 0.1;
  const inverted = config.s.specialBarChartInverted;
  // A themed report's own good/bad/neutral (see getStandardSeriesColorFunc).
  const neutral = chartPalette?.neutral ?? _CF_COMPARISON;
  const good = chartPalette?.good ?? _CF_GREEN;
  const bad = chartPalette?.bad ?? _CF_RED;

  return {
    seriesColorFunc: getStandardSeriesColorFunc(config, chartPalette),
    text: getTextStyle(config, deckStyle),
    panes: { nCols: config.s.nColsInCellDisplay },
    xPeriodAxis: { forceSideTicksWhenYear: true, calendar },
    yScaleAxis: {
      allowIndividualTierLimits: config.s.allowIndividualRowLimits,
      max: config.s.forceYMax1 && formatAs === "percent" ? 1 : undefined,
      // No "auto-zero" here: the bars plot raw volumes (the percent change only
      // drives their color and label), so this axis never carries a negative.
      min: config.s.forceYMinAuto ? "auto" : undefined,
      tickLabelFormatter: getScaleTickLabelFormatter(formatAs),
    },
    content: {
      points: { func: { show: false } },
      bars: {
        func: (info) => {
          const diff = getSpecialBarChartDiff(info);
          if (diff === undefined) {
            return {
              show: true,
              fillColor: neutral,
              dataLabel: { show: config.s.showDataLabels },
            };
          }
          if (diff > threshold) {
            return {
              show: true,
              fillColor: inverted ? bad : good,
              dataLabel: { show: config.s.showDataLabels },
            };
          }
          if (diff < -1 * threshold) {
            return {
              show: true,
              fillColor: inverted ? good : bad,
              dataLabel: { show: config.s.showDataLabels },
            };
          }
          return {
            show: true,
            fillColor: neutral,
            dataLabel: { show: config.s.showDataLabels },
          };
        },
        textFormatter: (info: ChartValueInfo) => {
          const diff = getSpecialBarChartDiff(info);
          const formatter = getFormatterFunc(
            "percent",
            config.s.decimalPlaces ?? 0,
          );
          if (diff === undefined) return "";
          if (diff < -1 * threshold) return formatter(diff);
          if (diff > threshold) return "+" + formatter(diff);
          if (config.s.specialBarChartDataLabels === "all-values")
            return formatter(diff);
          return "";
        },
        stacking: "none",
      },
      lines: { func: { show: false } },
    },
  };
}

function getSpecialBarChartDiff(info: ChartValueInfo) {
  const currentV = info.val;
  if (currentV === undefined) {
    return undefined;
  }
  const prevV = info.seriesValArrays.at(info.i_series)?.[
    // Must use square brackets here (otherwise negative 1 issue)
    info.i_val - 1
  ];
  if (prevV !== undefined && prevV !== 0) {
    return currentV / prevV - 1;
  }
  return undefined;
}
