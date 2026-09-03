import type { Language } from "@timroberton/panther";
import { unscaleValueForFormat } from "./indicator_value_scale.ts";
import {
  _CF_LIGHTER_GREEN,
  _CF_LIGHTER_RED,
  _CF_LIGHTER_YELLOW,
} from "./key_colors.ts";
import { pickLang } from "./translate/t-func.ts";
import type { ThresholdsRule } from "./types/conditional_formatting.ts";
import type { IndicatorFormat } from "./types/indicators.ts";

// The traffic-light threshold pair (direction + green + yellow, in DISPLAY
// units) that pre-restructure packages and pre-P2 figure snapshots carry, as
// the rule it always meant. This is the same conversion instance migration
// 079 performs in SQL on the live dictionary; the two must agree (§5.7 / 5.8
// of PLAN_1d verify both against the scorecard's truth table).
//
//   higher_is_better {green, yellow} → cutoffs [yellow, green], buckets
//     [red, yellow, green]; lower_is_better → cutoffs [green, yellow],
//     buckets [green, yellow, red]. Cutoffs are unscaled into STORED units by
//     the row's own format.
//   Degenerate pairs (green == yellow, or inverted — nothing ever enforced
//     the order): a TWO-bucket rule at the green cutoff. In the scorecard's
//     truth table the yellow band was unreachable for such a row, so this is
//     the faithful conversion.
//   Labels are seeded in the given language so a legend prints what the
//     scorecard printed.
export type TrafficLightThresholds = {
  direction: "higher_is_better" | "lower_is_better";
  green: number;
  yellow: number;
};

export function trafficLightThresholdsToRule(
  thresholds: TrafficLightThresholds,
  formatAs: IndicatorFormat,
  language: Language,
): ThresholdsRule {
  const labels = trafficLightLabels(language);
  const red = { color: _CF_LIGHTER_RED, label: labels.red };
  const yellow = { color: _CF_LIGHTER_YELLOW, label: labels.yellow };
  const green = { color: _CF_LIGHTER_GREEN, label: labels.green };
  const g = unscaleValueForFormat(thresholds.green, formatAs);
  const y = unscaleValueForFormat(thresholds.yellow, formatAs);
  if (thresholds.direction === "higher_is_better") {
    return thresholds.yellow < thresholds.green
      ? {
        cutoffs: [y, g],
        buckets: [red, yellow, green],
        direction: "higher-is-better",
      }
      : { cutoffs: [g], buckets: [red, green], direction: "higher-is-better" };
  }
  return thresholds.green < thresholds.yellow
    ? {
      cutoffs: [g, y],
      buckets: [green, yellow, red],
      direction: "lower-is-better",
    }
    : { cutoffs: [g], buckets: [green, red], direction: "lower-is-better" };
}

export function trafficLightLabels(
  language: Language,
): { red: string; yellow: string; green: string } {
  return {
    green: pickLang(language, { en: "On track", fr: "En bonne voie", pt: "No bom caminho" }),
    yellow: pickLang(language, { en: "Progress needed", fr: "Progrès nécessaire", pt: "Progresso necessário" }),
    red: pickLang(language, { en: "Not on track", fr: "Pas en bonne voie", pt: "Fora do bom caminho" }),
  };
}
