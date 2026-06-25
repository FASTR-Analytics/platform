import type { TranslatableString } from "./translate/mod.ts";
import type { HfaIndicator } from "./types/mod.ts";

// Derived from the domain type so they can never drift from it.
export type HfaIndicatorType = HfaIndicator["type"];
export type HfaIndicatorAggregation = HfaIndicator["aggregation"];

export type HfaIndicatorMeasure = {
  // How a value of this indicator should be formatted in charts / tables.
  kind: "percent" | "number";
  // Human description of what the aggregated value means, e.g. "% of facilities".
  // Surfaced as a SEPARATE annotation (never concatenated into the indicator
  // label) so a reader — including the AI — knows the measurement. Edit the
  // wording here; this is the single source of truth, never inline these
  // strings at call sites.
  label: TranslatableString;
};

// Single source of truth mapping (type, aggregation) → how the indicator is
// measured. Drives both value formatting (format_as) and the measure annotation.
export function getHfaIndicatorMeasure(
  type: HfaIndicatorType,
  aggregation: HfaIndicatorAggregation,
): HfaIndicatorMeasure {
  if (type === "binary" && aggregation === "avg") {
    return {
      kind: "percent",
      label: { en: "% of facilities", fr: "% d'établissements" },
    };
  }
  if (aggregation === "avg") {
    return {
      kind: "number",
      label: {
        en: "average across facilities",
        fr: "moyenne entre établissements",
      },
    };
  }
  return {
    kind: "number",
    label: { en: "total across facilities", fr: "total entre établissements" },
  };
}

export type HfaLabelFields = {
  shortLabel: string;
  definition: string;
};

// compact → short label, falling back to the long definition.
//           For dense contexts: axis ticks, legends, chips, bar labels.
// full    → long definition, falling back to short.
//           For tooltips, table headers, chart titles, and the AI taxonomy.
export type HfaLabelContext = "compact" | "full";

export function composeHfaIndicatorLabel(
  fields: HfaLabelFields,
  context: HfaLabelContext,
): string {
  const short = fields.shortLabel.trim();
  const long = fields.definition.trim();
  return context === "compact" ? short || long : long || short;
}
