import { CustomFigureStyleOptions } from "panther";
import { type DeckStyleContext, PresentationObjectConfig } from "lib";
import { buildStandardStyle } from "./get_style_from_po/_1_standard";
import { buildCoverageChartStyle } from "./get_style_from_po/_2_coverage";
import { buildPercentChangeChartStyle } from "./get_style_from_po/_3_percent_change";
import { buildDisruptionsChartStyle } from "./get_style_from_po/_4_disruptions";

export function getStyleFromPresentationObject(
  config: PresentationObjectConfig,
  formatAs: "percent" | "number",
  deckStyle?: DeckStyleContext,
): CustomFigureStyleOptions {
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
