import { CustomFigureStyleOptions } from "panther";
import { PresentationObjectConfig } from "lib";
import { buildStandardStyle } from "./get_style_from_po/_1_standard";
import { buildCoverageChartStyle } from "./get_style_from_po/_2_coverage";
import { buildPercentChangeChartStyle } from "./get_style_from_po/_3_percent_change";
import { buildDisruptionsChartStyle } from "./get_style_from_po/_4_disruptions";
import { buildScorecardTableStyle } from "./get_style_from_po/_5_scorecard";

export function getStyleFromPresentationObject(
  config: PresentationObjectConfig,
  formatAs: "percent" | "number",
): CustomFigureStyleOptions {
  if (config.s.specialCoverageChart) {
    return buildCoverageChartStyle(config, formatAs);
  }
  if (config.s.specialBarChart) {
    return buildPercentChangeChartStyle(config, formatAs);
  }
  if (
    config.s.specialDisruptionsChart ||
    (config.s.content === "areas" && config.s.diffAreas) // Legacy adapter — remove once all configs migrated
  ) {
    return buildDisruptionsChartStyle(config, formatAs);
  }
  if (config.s.specialScorecardTable) {
    return buildScorecardTableStyle(config, formatAs);
  }
  return buildStandardStyle(config, formatAs);
}
