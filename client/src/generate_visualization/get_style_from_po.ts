import { CustomFigureStyleOptions } from "panther";
import {
  type DeckStyleContext,
  type EffectiveIndicatorFacts,
  type FastrChartPalette,
  type FigureLocalization,
  PresentationObjectConfig,
  resolveFigureCalendar,
} from "lib";
import { buildStandardStyle } from "./get_style_from_po/_1_standard";
import { buildCoverageChartStyle } from "./get_style_from_po/_2_coverage";
import { buildPercentChangeChartStyle } from "./get_style_from_po/_3_percent_change";
import { buildDisruptionsChartStyle } from "./get_style_from_po/_4_disruptions";
import { buildDisruptionsChartV2Style } from "./get_style_from_po/_6_disruptions_v2";
import {
  isSpecialBarChartActive,
  isSpecialCoverageChartActive,
  isSpecialDisruptionsChartActive,
  isSpecialDisruptionsChartV2Active,
} from "./special_chart_checks";

export function getStyleFromPresentationObject(
  config: PresentationObjectConfig,
  facts: EffectiveIndicatorFacts,
  localization: FigureLocalization,
  deckStyle: DeckStyleContext | undefined,
  allowNegativeScale: boolean,
  effectiveValueProps: string[],
  chartPalette?: FastrChartPalette,
): CustomFigureStyleOptions {
  const calendar = resolveFigureCalendar(config, localization);
  // The special chart modes read the collapsed axis format alone: the coverage
  // and disruptions metrics (m4/m6/m11) are constant-format, so it is their
  // declaration, and the percent-change chart (m3, m12) formats its axis as the
  // standard builder does while its change labels are always a percent.
  const formatAs = facts.axisFormat;
  if (isSpecialCoverageChartActive(config)) {
    return buildCoverageChartStyle(
      config,
      formatAs,
      calendar,
      deckStyle,
      chartPalette,
    );
  }
  if (isSpecialBarChartActive(config)) {
    return buildPercentChangeChartStyle(
      config,
      formatAs,
      calendar,
      deckStyle,
      chartPalette,
    );
  }
  if (isSpecialDisruptionsChartActive(config)) {
    return buildDisruptionsChartStyle(
      config,
      formatAs,
      calendar,
      allowNegativeScale,
      deckStyle,
      chartPalette,
    );
  }
  if (isSpecialDisruptionsChartV2Active(config)) {
    return buildDisruptionsChartV2Style(config, formatAs, calendar, deckStyle);
  }
  return buildStandardStyle(
    config,
    facts,
    calendar,
    deckStyle,
    allowNegativeScale,
    effectiveValueProps,
    chartPalette,
  );
}
