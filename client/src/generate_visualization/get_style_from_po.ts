import { CustomFigureStyleOptions } from "panther";
import { type DeckStyleContext, type IndicatorMetadata, PresentationObjectConfig } from "lib";
import { buildStandardStyle } from "./get_style_from_po/_1_standard";
import { buildCoverageChartStyle } from "./get_style_from_po/_2_coverage";
import { buildPercentChangeChartStyle } from "./get_style_from_po/_3_percent_change";
import { buildDisruptionsChartStyle } from "./get_style_from_po/_4_disruptions";
import { buildScorecardStyle } from "./get_style_from_po/_5_scorecard";

export function getStyleFromPresentationObject(
  config: PresentationObjectConfig,
  formatAs: "percent" | "number",
  deckStyle?: DeckStyleContext,
  indicatorMetadata?: IndicatorMetadata[],
): CustomFigureStyleOptions {
  if (config.s.specialScorecardTable && indicatorMetadata) {
    return buildScorecardStyle(config, indicatorMetadata, deckStyle);
  }
  if (config.s.specialCoverageChart) {
    return buildCoverageChartStyle(config, formatAs, deckStyle);
  }
  if (config.s.specialBarChart) {
    return buildPercentChangeChartStyle(config, formatAs, deckStyle);
  }
  if (config.s.specialDisruptionsChart) {
    return buildDisruptionsChartStyle(config, formatAs, deckStyle);
  }
  return buildStandardStyle(config, formatAs, deckStyle);
}
