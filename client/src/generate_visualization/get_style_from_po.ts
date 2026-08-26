import { CustomFigureStyleOptions, type CalendarType } from "panther";
import {
  type DeckStyleContext,
  type EffectiveFormat,
  type FigureLocalization,
  type IndicatorMetadata,
  PresentationObjectConfig,
  resolveFigureCalendar,
} from "lib";
import { buildStandardStyle } from "./get_style_from_po/_1_standard";
import { buildCoverageChartStyle } from "./get_style_from_po/_2_coverage";
import { buildPercentChangeChartStyle } from "./get_style_from_po/_3_percent_change";
import { buildDisruptionsChartStyle } from "./get_style_from_po/_4_disruptions";
import { buildScorecardStyle } from "./get_style_from_po/_5_scorecard";
import { buildDisruptionsChartV2Style } from "./get_style_from_po/_6_disruptions_v2";
import {
  isSpecialBarChartActive,
  isSpecialCoverageChartActive,
  isSpecialDisruptionsChartActive,
  isSpecialDisruptionsChartV2Active,
  isSpecialScorecardTableActive,
} from "./special_chart_checks";

export function getStyleFromPresentationObject(
  config: PresentationObjectConfig,
  effectiveFormat: EffectiveFormat,
  localization: FigureLocalization,
  deckStyle: DeckStyleContext | undefined,
  indicatorMetadata: IndicatorMetadata[] | undefined,
  allowNegativeScale: boolean,
  effectiveValueProps: string[],
): CustomFigureStyleOptions {
  const calendar = resolveFigureCalendar(config, localization);
  if (isSpecialScorecardTableActive(config) && indicatorMetadata) {
    return buildScorecardStyle(
      config,
      effectiveFormat,
      indicatorMetadata,
      effectiveValueProps,
      deckStyle,
    );
  }
  // The special chart modes are all constant-format metrics (m3/m4/m6/m11), so
  // their declaration IS the axis format and nothing they draw is per-value.
  const formatAs = effectiveFormat.axisFormat;
  if (isSpecialCoverageChartActive(config)) {
    return buildCoverageChartStyle(config, formatAs, calendar, deckStyle);
  }
  if (isSpecialBarChartActive(config)) {
    return buildPercentChangeChartStyle(config, formatAs, calendar, deckStyle);
  }
  if (isSpecialDisruptionsChartActive(config)) {
    return buildDisruptionsChartStyle(config, formatAs, calendar, allowNegativeScale, deckStyle);
  }
  if (isSpecialDisruptionsChartV2Active(config)) {
    return buildDisruptionsChartV2Style(config, formatAs, calendar, deckStyle);
  }
  return buildStandardStyle(
    config,
    effectiveFormat,
    calendar,
    deckStyle,
    allowNegativeScale,
    effectiveValueProps,
  );
}
