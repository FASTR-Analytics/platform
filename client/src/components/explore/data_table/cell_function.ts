import {
  thresholdBucketIndex,
  type DatasetType,
  type EffectiveIndicatorFacts,
  type GridColumns,
} from "lib";
import { getColor, type DataGridCellFunction } from "panther";
import { formatIndicatorValue } from "~/generate_visualization/get_style_from_po/_0_common";

// Each cell formatted by its own indicator's format, the raw number kept as
// the sort key, and HMIS cells coloured by the indicator's own threshold rule.
// The indicator is the column in Indicators mode and the column group in Time
// mode; when the canvas pipeline collapsed a single-indicator axis away,
// `onlyIndicator` names it.
export function gridCellFunction(args: {
  family: DatasetType;
  columns: GridColumns;
  facts: EffectiveIndicatorFacts;
  decimalPlaces: 0 | 1 | 2 | 3;
  onlyIndicator: string | undefined;
}): DataGridCellFunction {
  return (raw, position) => {
    if (raw === undefined) return undefined;
    const value = Number(raw);
    if (Number.isNaN(value)) return { text: String(raw) };
    const indicator =
      (args.columns === "indicators" ? position.colId : position.colGroupId) ??
        args.onlyIndicator;
    const ids = indicator === undefined ? [] : [indicator];
    const text = formatIndicatorValue(
      value,
      args.facts.formatForValue(ids),
      args.decimalPlaces,
    );
    if (args.family !== "hmis") return { text, value };
    const rule = args.facts.ruleForValue(ids);
    const bucket = rule === undefined
      ? undefined
      : thresholdBucketIndex(rule, value);
    return rule === undefined || bucket === undefined
      ? { text, value }
      : { text, value, bg: getColor(rule.buckets[bucket].color) };
  };
}
