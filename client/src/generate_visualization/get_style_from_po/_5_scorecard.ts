import { CustomFigureStyleOptions } from "panther";
import { type DeckStyleContext, PresentationObjectConfig } from "lib";
import { buildStandardStyle } from "./_1_standard";

// TODO: Extract scorecard-specific style logic from _1_standard.ts and
// conditional_formatting_scorecard.ts into this file, following the same
// pattern as coverage/percent-change/disruptions.

export function buildScorecardTableStyle(
  config: PresentationObjectConfig,
  formatAs: "percent" | "number",
  deckStyle?: DeckStyleContext,
): CustomFigureStyleOptions {
  return buildStandardStyle(config, formatAs, deckStyle);
}
