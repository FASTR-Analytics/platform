import {
  getFilteredValueProps,
  hasOnlyOneFilteredValue,
} from "./get_fetch_config_from_po.ts";
import type { DisaggregationOption } from "./types/disaggregation_options.ts";
import type { PresentationObjectConfig } from "./types/_presentation_object_config.ts";

export function normalizePOConfigForStorage(
  config: PresentationObjectConfig
): PresentationObjectConfig {
  return {
    ...config,
    d: {
      ...config.d,
      filterBy: config.d.filterBy.filter((f) => f.values.length > 0),
      valuesFilter: config.d.valuesFilter?.length
        ? config.d.valuesFilter
        : undefined,
    },
  };
}

export type IneffectiveReason =
  | "filtered_to_one_value"
  | "single_period"
  | "single_year";

export type IneffectiveDisaggregator = {
  disOpt: DisaggregationOption;
  reason: IneffectiveReason;
};

export type EffectivePOConfigResult = {
  config: PresentationObjectConfig;
  effectiveValueProps: string[];
  hasMultipleValueProps: boolean;
  ineffectiveDisaggregators: IneffectiveDisaggregator[];
};

const TIME_COLUMNS = new Set<string>(["period_id", "quarter_id", "year", "month"]);

export function getEffectivePOConfig(
  config: PresentationObjectConfig,
  context?: {
    dateRange?: { min: number; max: number };
    valueProps?: string[];
  }
): EffectivePOConfigResult {
  const dateRange = context?.dateRange;
  const valueProps = context?.valueProps;

  const singlePeriod = dateRange && dateRange.min === dateRange.max;
  const singleYear =
    dateRange && Math.floor(dateRange.min / 100) === Math.floor(dateRange.max / 100);

  const ineffectiveDisaggregators: IneffectiveDisaggregator[] = [];

  const effectiveDisaggregateBy = config.d.disaggregateBy.filter((d) => {
    if (hasOnlyOneFilteredValue(config, d.disOpt)) {
      ineffectiveDisaggregators.push({ disOpt: d.disOpt, reason: "filtered_to_one_value" });
      return false;
    }

    if (singlePeriod && TIME_COLUMNS.has(d.disOpt)) {
      ineffectiveDisaggregators.push({ disOpt: d.disOpt, reason: "single_period" });
      return false;
    }

    if (singleYear && d.disOpt === "year") {
      ineffectiveDisaggregators.push({ disOpt: d.disOpt, reason: "single_year" });
      return false;
    }

    return true;
  });

  const effectiveConfig: PresentationObjectConfig = {
    ...config,
    d: {
      ...config.d,
      disaggregateBy: effectiveDisaggregateBy,
    },
  };

  const effectiveValueProps = valueProps
    ? getFilteredValueProps(valueProps, config)
    : [];

  return {
    config: effectiveConfig,
    effectiveValueProps,
    hasMultipleValueProps: effectiveValueProps.length > 1,
    ineffectiveDisaggregators,
  };
}
