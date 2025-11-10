import { formatPeriod } from "panther";
import type { JsonArrayItem } from "panther";

type DatePropType = "month" | "quarter_id" | "period_id";

const DATE_PROPS: Set<DatePropType> = new Set([
  "month",
  "quarter_id",
  "period_id",
]);

// Match ui-panther's abbreviated month format for consistency
const MONTHS_THREE_CHARS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
];

export function getDateLabelReplacements(
  jsonArray: JsonArrayItem[],
  props: (string | undefined | null)[],
): Record<string, string> {
  const replacements: Record<string, string> = {};

  // Find which props are date-related
  const dateProps = props.filter(
    (prop): prop is DatePropType =>
      prop !== undefined &&
      prop !== null &&
      DATE_PROPS.has(prop as DatePropType),
  );

  if (dateProps.length === 0) {
    return replacements;
  }

  // Collect unique values for each date prop with their prop type
  const valuesByProp = new Map<string, DatePropType>();

  for (const item of jsonArray) {
    for (const prop of dateProps) {
      const value = item[prop];
      if (value !== undefined && value !== null) {
        valuesByProp.set(String(value), prop);
      }
    }
  }

  // Format each unique value based on its prop type
  for (const [value, prop] of valuesByProp) {
    if (prop === "month") {
      // Handle month prop (values are 1-12)
      const monthNum = parseInt(value, 10);
      if (!isNaN(monthNum) && monthNum >= 1 && monthNum <= 12) {
        replacements[value] = MONTHS_THREE_CHARS[monthNum - 1];
      }
    } else {
      // Handle period_id and quarter_id (YYYYMM format)
      const periodType = getPeriodTypeFromProp(prop);
      const formatted = formatDateValue(value, periodType);
      if (formatted !== value) {
        replacements[value] = formatted;
      }
    }
  }

  return replacements;
}

function getPeriodTypeFromProp(
  prop: Exclude<DatePropType, "month">,
): "year-month" | "year-quarter" {
  switch (prop) {
    case "period_id":
      return "year-month";
    case "quarter_id":
      return "year-quarter";
    default:
      return "year-month"; // Default fallback
  }
}

function formatDateValue(
  value: string,
  periodType: "year-month" | "year-quarter",
): string {
  // Use formatPeriod from panther with gregorian calendar as default
  return formatPeriod(value, periodType, "gregorian");
}
