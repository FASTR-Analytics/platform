import {
  ChartSeriesInfo,
  ChartValueInfo,
  ColorKeyOrString,
  CustomFigureStyleOptions,
  toPct0,
} from "panther";
import { type CalendarType } from "panther";
import {
  type DeckStyleContext,
  type FastrChartPalette,
  type IndicatorFormat,
  PresentationObjectConfig,
} from "lib";
import { getTextStyle, getValueAxisTickLabelFormatter } from "./_0_common";

export function buildCoverageChartStyle(
  config: PresentationObjectConfig,
  formatAs: IndicatorFormat,
  calendar: CalendarType,
  deckStyle?: DeckStyleContext,
  // A themed report's own ink / bad / faded neutral (see
  // getStandardSeriesColorFunc): the observed line, the projection and the
  // background series keep their roles in the document's colours.
  chartPalette?: FastrChartPalette,
): CustomFigureStyleOptions {
  return {
    seriesColorFunc: getCoverageSeriesColorFunc(chartPalette),
    text: getTextStyle(config, deckStyle, chartPalette),
    panes: { nCols: config.s.nColsInCellDisplay },
    xPeriodAxis: { calendar },
    yValueAxis: {
      max: config.s.forceYMax1 && formatAs === "percent" ? 1 : undefined,
      min: config.s.forceYMinAuto ? "auto" : undefined,
      tickLabelFormatter: getValueAxisTickLabelFormatter(formatAs),
    },
    content: {
      points: {
        func: {
          show: true,
          dataLabel: { show: true },
        },
        textFormatter: (info: ChartValueInfo) => {
          const thisSeries = info.seriesValueArrays.at(info.i_series);
          if (!thisSeries) return "";
          let lastGoodIndex = 0;
          for (let i = 0; i < thisSeries.length; i++) {
            if (thisSeries[i] !== undefined) lastGoodIndex = i;
          }
          return info.i_value === lastGoodIndex ? toPct0(info.value) : "";
        },
      },
      bars: { func: { show: false } },
      lines: { func: { show: true } },
    },
  };
}

function getCoverageSeriesColorFunc(
  chartPalette: FastrChartPalette | undefined,
): (
  info: ChartSeriesInfo,
) => ColorKeyOrString {
  const strong = chartPalette?.strong ?? "#000000";
  const bad = chartPalette?.bad ?? "#F04D44";
  const faint = chartPalette?.faint ?? "#CED4DB";
  return (info) => {
    // TODO: switch to .id matching once raw series ids are confirmed
    // (and drop the French branches: id is locale-stable, label is not)
    // Stored figures may carry seriesMember as a bare string instead of
    // { id, label }; fall back to the string (or empty) so .startsWith is safe.
    const member = info.seriesMember as unknown;
    const label = typeof member === "string"
      ? member
      : (member as { label?: string } | undefined)?.label ?? "";
    // A chart with no series disaggregation has no series member.
    if (member === undefined) return strong;
    if (
      label.startsWith("Survey") ||
      label.startsWith("Estimation basée")
    ) {
      return strong;
    }
    if (
      label.startsWith("Projected") ||
      label.startsWith("Estimation projetée")
    ) {
      return bad;
    }
    return faint;
  };
}
