import {
  type ConditionalFormatting,
  type DisaggregationDisplayOption,
  type EffectiveIndicatorFacts,
  thresholdBucketIndex,
  type ThresholdsRule,
} from "lib";
import { type DataGridCellFunction, getColor } from "panther";
import { formatIndicatorValue } from "~/generate_visualization/get_style_from_po/_0_common";

// Each cell formatted by its own indicator's format, the raw number kept as
// the sort key, and coloured by the config's conditional formatting (R11):
// a thresholds rule applies to every cell, the indicator mode applies each
// indicator's own rule, anything else leaves the cell uncoloured.
// `indicatorAxis` is the grid axis the indicator dimension is laid out on;
// when the canvas pipeline collapsed a single-indicator axis away, or the
// indicator is pinned, `onlyIndicator` names it.
export function gridCellFunction(args: {
  cf: ConditionalFormatting;
  indicatorAxis: DisaggregationDisplayOption | undefined;
  facts: EffectiveIndicatorFacts;
  decimalPlaces: 0 | 1 | 2 | 3;
  onlyIndicator: string | undefined;
}): DataGridCellFunction {
  const ruleFor = (ids: string[]): ThresholdsRule | undefined =>
    args.cf.type === "thresholds"
      ? args.cf
      : args.cf.type === "indicator"
      ? args.facts.ruleForValue(ids)
      : undefined;
  return (raw, position) => {
    if (raw === undefined) return undefined;
    const value = Number(raw);
    if (Number.isNaN(value)) return { text: String(raw) };
    const onAxis = args.indicatorAxis === "row"
      ? position.rowId
      : args.indicatorAxis === "rowGroup"
      ? position.rowGroupId
      : args.indicatorAxis === "col"
      ? position.colId
      : args.indicatorAxis === "colGroup"
      ? position.colGroupId
      : undefined;
    const indicator = onAxis ?? args.onlyIndicator;
    const ids = indicator === undefined ? [] : [indicator];
    const text = formatIndicatorValue(
      value,
      args.facts.formatForValue(ids),
      args.decimalPlaces,
    );
    const rule = ruleFor(ids);
    const bucket = rule === undefined
      ? undefined
      : thresholdBucketIndex(rule, value);
    return rule === undefined || bucket === undefined
      ? { text, value }
      : { text, value, bg: getColor(rule.buckets[bucket].color) };
  };
}
