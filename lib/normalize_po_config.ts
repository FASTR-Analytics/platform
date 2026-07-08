import type { RollupEligibilityInputs } from "./admin_area_rollup.ts";
import {
  getEffectiveRollupLevel,
  getFilteredValueProps,
} from "./get_fetch_config_from_po.ts";
import { hasOnlyOneFilteredValue } from "./get_disaggregator_display_prop.ts";
import type { DisaggregationOption } from "./types/disaggregation_options.ts";
import type { PresentationObjectConfig } from "./types/_presentation_object_config.ts";
import { inferPeriodFormatFromValue } from "./types/_metric_installed.ts";
import type { JsonArrayItem } from "./types/_figure_bundle.ts";
import type { DisaggregationPossibleValuesStatus } from "./types/presentation_objects.ts";

export function normalizePOConfigForStorage(
  config: PresentationObjectConfig,
  resultsValue: RollupEligibilityInputs
): PresentationObjectConfig {
  // Canonical roll-up off-state is both fields absent. The flag survives
  // transient gate closures while editing (the editor no longer eagerly clears
  // it) and is stripped here, at save time, when the gate is closed.
  const rollupOn =
    !!config.d.includeAdminAreaRollup &&
    getEffectiveRollupLevel(resultsValue, config) !== undefined;
  return {
    ...config,
    d: {
      ...config.d,
      filterBy: config.d.filterBy.filter((f) => f.values.length > 0),
      valuesFilter: config.d.valuesFilter?.length
        ? config.d.valuesFilter
        : undefined,
      includeAdminAreaRollup: rollupOn ? true : undefined,
      adminAreaRollupPosition: rollupOn
        ? (config.d.adminAreaRollupPosition ?? "bottom")
        : undefined,
    },
  };
}

export type IneffectiveReason =
  | "filtered_to_one_value"
  | "single_value"
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
    singleValueDims?: ReadonlySet<DisaggregationOption>;
  }
): EffectivePOConfigResult {
  const dateRange = context?.dateRange;
  const valueProps = context?.valueProps;
  const singleValueDims = context?.singleValueDims;

  const singlePeriod = dateRange && dateRange.min === dateRange.max;
  const dateRangeFmt = dateRange
    ? inferPeriodFormatFromValue(dateRange.min)
    : undefined;
  const singleYear =
    dateRange &&
    (dateRangeFmt === "year"
      ? dateRange.min === dateRange.max
      : dateRangeFmt === "quarter_id"
        ? Math.floor(dateRange.min / 10) === Math.floor(dateRange.max / 10)
        : Math.floor(dateRange.min / 100) === Math.floor(dateRange.max / 100));

  const ineffectiveDisaggregators: IneffectiveDisaggregator[] = [];

  const effectiveDisaggregateBy = config.d.disaggregateBy.filter((d) => {
    if (hasOnlyOneFilteredValue(config, d.disOpt)) {
      ineffectiveDisaggregators.push({ disOpt: d.disOpt, reason: "filtered_to_one_value" });
      return false;
    }

    // Replicant slots are exempt: fetches are pinned to the selected replicant
    // value, so items-derived counts would see every replicant as single-valued.
    if (
      d.disDisplayOpt !== "replicant" &&
      singleValueDims?.has(d.disOpt)
    ) {
      ineffectiveDisaggregators.push({ disOpt: d.disOpt, reason: "single_value" });
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

// Post-fetch derivation for getEffectivePOConfig's singleValueDims context:
// distinct values per disaggregated column in the fetched rows (slice
// semantics, mirroring how dateRange reflects the fetched slice). Replicant
// slots skipped — the fetch is pinned to the selected replicant value.
export function getSingleValueDimsFromItems(
  config: { d: Pick<PresentationObjectConfig["d"], "disaggregateBy"> },
  items: JsonArrayItem[],
): Set<DisaggregationOption> {
  const out = new Set<DisaggregationOption>();
  if (items.length === 0) return out;
  for (const d of config.d.disaggregateBy) {
    if (d.disDisplayOpt === "replicant") continue;
    const distinct = new Set(items.map((item) => item[d.disOpt]));
    if (distinct.size === 1) out.add(d.disOpt);
  }
  return out;
}

// Editor-side derivation (pre-fetch): whole-table distinct counts from the
// possible-values statuses in ResultsValueInfoForPresentationObject.
export function getSingleValueDimsFromPossibleValues(
  disaggregationPossibleValues: {
    [key in DisaggregationOption]?: DisaggregationPossibleValuesStatus;
  },
): Set<DisaggregationOption> {
  const out = new Set<DisaggregationOption>();
  for (const [disOpt, status] of Object.entries(disaggregationPossibleValues)) {
    if (status.status === "ok" && status.values.length === 1) {
      out.add(disOpt as DisaggregationOption);
    }
  }
  return out;
}
