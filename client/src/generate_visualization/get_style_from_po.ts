import { CustomFigureStyleOptions, type CalendarType } from "panther";
import { type DeckStyleContext, type IndicatorMetadata, PresentationObjectConfig } from "lib";
import { buildStandardStyle } from "./get_style_from_po/_1_standard";
import { buildCoverageChartStyle } from "./get_style_from_po/_2_coverage";
import { buildPercentChangeChartStyle } from "./get_style_from_po/_3_percent_change";
import { buildDisruptionsChartStyle } from "./get_style_from_po/_4_disruptions";
import { buildScorecardStyle } from "./get_style_from_po/_5_scorecard";
import {
  isSpecialBarChartActive,
  isSpecialCoverageChartActive,
  isSpecialDisruptionsChartActive,
  isSpecialScorecardTableActive,
} from "./special_chart_checks";

export function getStyleFromPresentationObject(
  config: PresentationObjectConfig,
  formatAs: "percent" | "number",
  calendar: CalendarType,
  deckStyle: DeckStyleContext | undefined,
  indicatorMetadata: IndicatorMetadata[] | undefined,
  allowNegativeScale: boolean,
  obeyMetricFormat: boolean,
  effectiveValueProps: string[],
): CustomFigureStyleOptions {
  if (isSpecialScorecardTableActive(config) && indicatorMetadata) {
    return buildScorecardStyle(config, indicatorMetadata, effectiveValueProps, deckStyle);
  }
  if (isSpecialCoverageChartActive(config)) {
    return buildCoverageChartStyle(config, formatAs, calendar, deckStyle);
  }
  if (isSpecialBarChartActive(config)) {
    return buildPercentChangeChartStyle(config, formatAs, calendar, deckStyle);
  }
  if (isSpecialDisruptionsChartActive(config)) {
    return buildDisruptionsChartStyle(config, formatAs, calendar, deckStyle);
  }
  return buildStandardStyle(
    config,
    formatAs,
    calendar,
    deckStyle,
    indicatorMetadata,
    allowNegativeScale,
    obeyMetricFormat,
    effectiveValueProps,
  );
}
