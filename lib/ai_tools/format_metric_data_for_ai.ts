import type {
  AiMetricQuery,
  DisaggregationOption,
  GenericLongFormFetchConfig,
  IndicatorMetadata,
  ItemsHolderPresentationObject,
  JsonArrayItem,
  MetricAIDescription,
  IndicatorFormat,
  MetricFormatAs,
  MetricWithStatus,
  PeriodBounds,
  PresentationObjectConfig,
} from "../types/mod.ts";
import type { TranslatableString } from "../translate/types.ts";
import { ICEH_STRAT_INFO } from "../types/iceh_strats.ts";
import { INDICATOR_DISAGGREGATION_OPTIONS } from "../types/disaggregation_options.ts";
import { inferPeriodFormatFromValue } from "../types/_metric_installed.ts";
import { getFiltersWithReplicant } from "../get_fetch_config_from_po.ts";
import { isSampleNProp, sampleNProp } from "../sample_n.ts";
import { AIToolFailure } from "@timroberton/panther";
import type { AIToolEnv } from "./env.ts";
import { validateMetricInputsAgainstValueInfo } from "./content_validators.ts";

export function inferPeriodFilter(
  startDate: number | undefined,
  endDate: number | undefined,
): { filterType: "custom"; min: number; max: number } | undefined {
  if (startDate == null || endDate == null) return undefined;
  // The value self-identifies its format downstream — no periodOption needed.
  return { filterType: "custom", min: startDate, max: endDate };
}

export async function getMetricDataForAI(
  env: AIToolEnv,
  query: AiMetricQuery,
  metrics: MetricWithStatus[],
  valuesFilter?: string[],
  aiDescription?: MetricAIDescription,
  periodFilterOverride?: GenericLongFormFetchConfig["periodFilter"],
): Promise<string> {
  const {
    metricId,
    disaggregations: inputDisaggregations,
    filters: inputFilters,
    startDate,
    endDate,
  } = query;
  const disaggregations = (inputDisaggregations ??
    []) as DisaggregationOption[];
  const filters = (inputFilters ?? []) as {
    disOpt: DisaggregationOption;
    values: (string | number)[];
  }[];
  const dateRangeFilter = inferPeriodFilter(startDate, endDate);
  const periodFilter = periodFilterOverride ?? dateRangeFilter;

  const metric = metrics.find((m) => m.id === metricId);
  if (!metric) throw new AIToolFailure(`Metric "${metricId}" not found`);

  // ONE value-info read serves two purposes: validating the query's filters
  // and date range against the metric's real dimensions and bounds (fail
  // fast, before the items query — a caller-supplied periodFilterOverride is
  // engine-typed, not a model input, and is not checked), and the "Period
  // coverage" line — the metric's FULL range, independent of this query's
  // filters, which lets the model tell "the data ends here" from "I didn't
  // ask for later periods". Context, not data: a failed read skips both
  // rather than failing the tool.
  const valueInfoRes = await env.getResultsValueInfo(metricId);
  if (valueInfoRes.success) {
    validateMetricInputsAgainstValueInfo(
      valueInfoRes.data,
      metricId,
      filters,
      dateRangeFilter,
    );
  }
  const periodCoverage = valueInfoRes.success
    ? valueInfoRes.data.periodBounds ?? null
    : undefined;

  // Auto-merge required disaggregations (AI doesn't need to specify them)
  const requiredDisaggregationOptions = metric.disaggregationOptions
    .filter((opt) => opt.isRequired)
    .map((opt) => opt.value);
  const allDisaggregations = [
    ...requiredDisaggregationOptions,
    ...disaggregations,
  ];
  const uniqueDisaggregations = [
    ...new Set(allDisaggregations),
  ] as DisaggregationOption[];

  // Determine which value properties to fetch
  const valuePropsToFetch = valuesFilter && valuesFilter.length > 0
    ? valuesFilter.filter((vf) => metric.valueProps.includes(vf))
    : metric.valueProps;

  // Build fetchConfig. The admin-area roll-up row is DELIBERATELY excluded from
  // AI data: a total row mixed into the long-form rows would invite double
  // counting in the model's sums. Callers that mirror a viz with the roll-up
  // enabled must say so in the context text (see format_viz_editor_for_ai).
  const fetchConfig: GenericLongFormFetchConfig = metric
      .catalogExpressionEvaluation
    // A catalog-evaluated metric (PLAN_1a §1.6): the wire carries the declared
    // ingredient columns, SUMmed, and the server returns one computed `value`.
    // Its valueProps are ["value"], which is NOT a column of the results
    // object, so without this branch every query is rejected by the §1.7
    // guard. Same wire/display split as the PAE branch below.
    ? {
      values: metric.catalogExpressionEvaluation.ingredientProps.map(
        (prop) => ({ prop, func: "SUM" as const }),
      ),
      groupBys: uniqueDisaggregations,
      filters: filters,
      periodFilter,
      postAggregationExpression: undefined,
      rollupDim: undefined,
    }
    : metric.postAggregationExpression
      ? {
        values: metric.postAggregationExpression.ingredientValues,
        groupBys: uniqueDisaggregations,
        filters: filters,
        periodFilter,
        postAggregationExpression: metric.postAggregationExpression.expression,
        rollupDim: undefined,
      }
      : {
        values: valuePropsToFetch.map((prop) => ({
          prop,
          func: metric.valueFunc,
        })),
        groupBys: uniqueDisaggregations,
        filters: filters,
        periodFilter,
        postAggregationExpression: undefined,
        rollupDim: undefined,
      };

  const res = await env.getItems({
    resultsObjectId: metric.resultsObjectId,
    fetchConfig,
    firstPeriodOption: metric.mostGranularTimePeriodColumnInResultsFile,
  });
  if (!res.success) {
    throw new AIToolFailure(res.err);
  }
  const itemsHolder = res.data;

  const indicatorMetadata = itemsHolder.status === "ok"
    ? itemsHolder.indicatorMetadata
    : [];

  // uniqueDisaggregations, not the model's own list: the required options were
  // merged into the QUERY, so they are real columns of the rows below. Passing
  // the shorter list left the indicator dimension out of the Dimension Summary
  // — the very place the "Format: varies by indicator" line promises the
  // per-indicator formats are listed — and made the CSV treat it as a value
  // column instead of pivoting on it.
  return formatItemsAsMarkdown(
    itemsHolder,
    metric,
    uniqueDisaggregations,
    filters,
    periodFilter,
    aiDescription,
    indicatorMetadata,
    periodCoverage,
  );
}

function toStr(val: TranslatableString): string {
  if (typeof val === "string") return val;
  return val.en;
}

function formatItemsAsMarkdown(
  itemsHolder: ItemsHolderPresentationObject,
  metric: MetricWithStatus,
  disaggregations: DisaggregationOption[],
  filters?: { disOpt: DisaggregationOption; values: (string | number)[] }[],
  periodFilter?: GenericLongFormFetchConfig["periodFilter"],
  aiDescription?: MetricAIDescription,
  indicatorMetadata?: IndicatorMetadata[],
  // null = the metric is not time-indexed; undefined = unknown (value info
  // could not be read), which prints nothing.
  periodCoverage?: PeriodBounds | null,
): string {
  const lines: string[] = [];

  lines.push("# METRIC DATA");
  lines.push("=".repeat(80));
  lines.push("");
  lines.push(`**Metric ID (metricId):** ${metric.id}`);
  lines.push(
    `**Metric Label:** ${metric.label}${
      metric.variantLabel ? ` [${metric.variantLabel}]` : ""
    }`,
  );
  if (metric.formatAs === "indicator") {
    lines.push(
      "**Format:** varies by indicator — each value is in its own indicator's format (percent values are 0-1 fractions; rate_per_10k values are written in the CSV already scaled to counts per 10,000; per-indicator formats are listed in the Dimension Summary below)",
    );
  } else {
    lines.push(`**Format:** ${metric.formatAs}`);
  }

  if (metric.valueProps.length > 0) {
    lines.push("");
    lines.push("**Value properties:**");
    for (const prop of metric.valueProps) {
      const propLabel = metric.valueLabelReplacements?.[prop] || prop;
      lines.push(`  - ${prop}: ${propLabel}`);
    }
  }

  if (metric.importantNotes) {
    lines.push("");
    lines.push(`**IMPORTANT:** ${metric.importantNotes}`);
  }

  if (aiDescription) {
    lines.push("");
    if (aiDescription.methodology) {
      lines.push(`**Methodology:** ${toStr(aiDescription.methodology)}`);
    }
    if (aiDescription.interpretation) {
      lines.push(`**Interpretation:** ${toStr(aiDescription.interpretation)}`);
    }
    if (aiDescription.typicalRange) {
      lines.push(`**Typical range:** ${toStr(aiDescription.typicalRange)}`);
    }
    if (aiDescription.caveats) {
      lines.push(`**Caveats:** ${toStr(aiDescription.caveats)}`);
    }
    if (aiDescription.disaggregationGuidance) {
      lines.push(
        `**Disaggregation guidance:** ${
          toStr(aiDescription.disaggregationGuidance)
        }`,
      );
    }
  }

  lines.push("");

  if (itemsHolder.status === "too_many_items") {
    lines.push(
      "**STATUS: Too many items - add more filters or disaggregations to narrow results**",
    );
    return lines.join("\n");
  }

  if (itemsHolder.status === "no_data_available") {
    lines.push("**STATUS: No data available**");
    return lines.join("\n");
  }

  const items = itemsHolder.items;

  if (disaggregations.length > 0) {
    lines.push("**Disaggregated by:** " + disaggregations.join(", "));
    lines.push("");
  }

  if (periodCoverage !== undefined) {
    lines.push(
      periodCoverage === null
        ? "**Period coverage (all data for this metric):** not time-indexed"
        : `**Period coverage (all data for this metric):** ${
          inferPeriodFormatFromValue(periodCoverage.min) ?? "unknown"
        } ${periodCoverage.min} to ${periodCoverage.max}`,
    );
    lines.push("");
  }

  if (filters && filters.length > 0) {
    lines.push("**Filtered by:**");
    for (const f of filters) {
      lines.push(`- ${f.disOpt}: ${f.values.join(", ")}`);
    }
    lines.push("");
  }

  if (periodFilter) {
    if (periodFilter.filterType === "custom") {
      lines.push(
        `**Period filter:** ${
          inferPeriodFormatFromValue(periodFilter.min) ?? "unknown"
        } from ${periodFilter.min} to ${periodFilter.max}`,
      );
    } else if (periodFilter.filterType === "from_month") {
      // from_month's stored max is ignored at query time ("to present").
      lines.push(
        `**Period filter:** from ${periodFilter.min} to present (extends automatically as new data lands)`,
      );
    } else if (periodFilter.filterType === "last_n_months") {
      lines.push(`**Period filter:** last ${periodFilter.nMonths} months`);
    } else if (periodFilter.filterType === "last_calendar_year") {
      lines.push(`**Period filter:** last calendar year`);
    } else if (periodFilter.filterType === "last_n_calendar_years") {
      lines.push(
        `**Period filter:** last ${periodFilter.nYears} calendar years`,
      );
    } else if (periodFilter.filterType === "last_calendar_quarter") {
      lines.push(`**Period filter:** last calendar quarter`);
    } else if (periodFilter.filterType === "last_n_calendar_quarters") {
      lines.push(
        `**Period filter:** last ${periodFilter.nQuarters} calendar quarters`,
      );
    }
    lines.push("");
  }

  if (itemsHolder.dateRange) {
    lines.push(
      `**Time range in data:** ${
        inferPeriodFormatFromValue(itemsHolder.dateRange.min) ?? "unknown"
      } (${itemsHolder.dateRange.min} to ${itemsHolder.dateRange.max})`,
    );
    lines.push("");
  }

  lines.push(`**Total rows:** ${items.length}`);
  lines.push("");

  if (items.length === 0) {
    lines.push("*No data available*");
    return lines.join("\n");
  }

  // Dimension summary (only for disaggregation dimensions, not value columns).
  // Sample-size columns are deliberately NOT columns of their own: they are
  // concatenated onto their value below. A second value column would flip
  // pivotToWide out of its single-value header shape, doubling the table's
  // width and renaming every existing column.
  const columns = Object.keys(items[0]).filter((col) => !isSampleNProp(col));
  const hasSampleN = Object.keys(items[0]).some(isSampleNProp);
  const dimensionColumns = columns.filter((col) =>
    disaggregations.includes(col as DisaggregationOption)
  );

  const metadataById = new Map(indicatorMetadata?.map((m) => [m.id, m]) ?? []);

  if (dimensionColumns.length > 0) {
    const dimensionStats = getDimensionStats(items, dimensionColumns);
    lines.push("## Dimension Summary");
    lines.push("");
    for (const col of dimensionColumns) {
      const stats = dimensionStats[col];
      if (stats && stats.uniqueCount > 0) {
        lines.push(
          `**${col}:** ${stats.uniqueCount} unique value${
            stats.uniqueCount === 1 ? "" : "s"
          }`,
        );
        if (stats.uniqueCount <= 20) {
          const valuesWithLabels = stats.uniqueValues.map((val) => {
            const meta = metadataById.get(val);
            // "indicator" metric: the value's format is a per-indicator fact
            // the model needs to read the CSV honestly. Direction and
            // thresholds, where the indicator declares them, are what
            // "good"/"bad" means for that row.
            const format = metric.formatAs === "indicator"
              ? meta?.format_as
              : undefined;
            const notes = [
              ...(format ? [format] : []),
              ...(meta ? [formatIndicatorThresholds(meta)] : []),
            ].filter((n) => n !== "");
            if (meta?.label && meta.label !== val) {
              return notes.length > 0
                ? `${val} (${meta.label} — ${notes.join("; ")})`
                : `${val} (${meta.label})`;
            }
            if (notes.length > 0) {
              return `${val} (${notes.join("; ")})`;
            }
            if (col === "strat") {
              const stratInfo =
                ICEH_STRAT_INFO[val as keyof typeof ICEH_STRAT_INFO];
              if (stratInfo) return `${val} (${stratInfo.label})`;
            }
            return val;
          });
          lines.push(`  ${valuesWithLabels.join(", ")}`);
        } else {
          // Over the cap the labels are dropped as noise, but on an "indicator"
          // metric the FORMATS cannot be: the header above tells the model that
          // percent values are 0-1 fractions and rates are pre-scaled, and
          // without this the two are indistinguishable in the CSV — 0.853
          // (85.3%) sits beside 4.20 (per 10,000) with nothing to tell them
          // apart. Grouped by format so the cost is O(formats), not O(values).
          if (metric.formatAs === "indicator") {
            for (
              const [format, ids] of groupIdsByFormat(
                stats.uniqueValues,
                metadataById,
              )
            ) {
              lines.push(`  ${format}: ${ids.join(", ")}`);
            }
          }
        }
      }
    }
    lines.push("");
  }

  // Format as CSV (with smart pivot)
  lines.push("## Data (CSV)");
  lines.push("");
  if (hasSampleN) {
    lines.push(
      "Values are followed by `(n=…)`: the number of surveyed facilities contributing to that value. Only survey (HFA) metrics carry it.",
    );
    lines.push("");
  }
  const csvData = pivotAndFormatAsCSV(
    items,
    columns,
    disaggregations,
    resolveItemFormat(metric.formatAs, metadataById),
  );
  lines.push(csvData);

  return lines.join("\n");
}

// "higher is better; green ≥ 80, yellow ≥ 50 (in % points)" from what the
// indicator declares; "" when it declares nothing. Mirrors the scorecard's
// cutoff rule (client _5_scorecard.ts getScorecardCutoffColor): thresholds
// are compared against the DISPLAY-scaled value — percent as 0-100 points,
// rate_per_10k as counts per 10,000 — inclusive toward green in both
// directions (higher_is_better → ≥, lower_is_better → ≤). The CSV prints
// percent values as 0-1 fractions, so the unit is spelled out.
function formatIndicatorThresholds(meta: IndicatorMetadata): string {
  const parts: string[] = [];
  if (meta.threshold_direction) {
    parts.push(
      meta.threshold_direction === "higher_is_better"
        ? "higher is better"
        : "lower is better",
    );
  }
  const cmp = meta.threshold_direction === "lower_is_better" ? "≤" : "≥";
  const bands: string[] = [];
  if (meta.threshold_green !== undefined) {
    bands.push(`green ${cmp} ${meta.threshold_green}`);
  }
  if (meta.threshold_yellow !== undefined) {
    bands.push(`yellow ${cmp} ${meta.threshold_yellow}`);
  }
  if (bands.length > 0) {
    const unit = meta.format_as === "percent"
      ? " (in % points; the CSV shows 0-1 fractions)"
      : meta.format_as === "rate_per_10k"
      ? " (per 10,000)"
      : "";
    parts.push(bands.join(", ") + unit);
  }
  return parts.join("; ");
}

// Ids that DECLARE a format, bucketed by it, in first-seen format order. Ids
// with no declared format are omitted rather than bucketed as "unknown": on a
// dimension whose values are not indicators at all (an admin area, an HFA
// category) that would print the entire value list under a meaningless
// heading, which is exactly the noise the 20-value cap exists to prevent.
function groupIdsByFormat(
  values: string[],
  metadataById: Map<string, IndicatorMetadata>,
): Map<IndicatorFormat, string[]> {
  const byFormat = new Map<IndicatorFormat, string[]>();
  for (const val of values) {
    const format = metadataById.get(val)?.format_as;
    if (format === undefined) continue;
    const bucket = byFormat.get(format);
    if (bucket) {
      bucket.push(val);
    } else {
      byFormat.set(format, [val]);
    }
  }
  return byFormat;
}

function getDimensionStats(
  items: JsonArrayItem[],
  columns: string[],
): Record<string, { uniqueCount: number; uniqueValues: string[] }> {
  const stats: Record<string, { uniqueCount: number; uniqueValues: string[] }> =
    {};

  for (const col of columns) {
    const uniqueValues = new Set<string>();
    for (const item of items) {
      const val = item[col];
      if (val !== undefined && val !== null && val !== "") {
        uniqueValues.add(String(val));
      }
    }
    stats[col] = {
      uniqueCount: uniqueValues.size,
      uniqueValues: Array.from(uniqueValues).sort(),
    };
  }

  return stats;
}

// The format of ONE row's value. A "percent"/"number" metric owns its format
// and every row shares it; an "indicator" metric's rows are each in their own
// indicator's format, read off the row's indicator dimension. Rows whose
// indicator declares nothing fall back to "number" — the same honest answer
// the renderer's collapse gives.
function resolveItemFormat(
  metricFormatAs: MetricFormatAs,
  metadataById: Map<string, IndicatorMetadata>,
): (item: JsonArrayItem) => IndicatorFormat {
  if (metricFormatAs !== "indicator") {
    return () => metricFormatAs;
  }
  return (item) => {
    for (const disOpt of INDICATOR_DISAGGREGATION_OPTIONS) {
      const val = item[disOpt];
      if (typeof val !== "string") continue;
      const format = metadataById.get(val)?.format_as;
      if (format !== undefined) return format;
    }
    return "number";
  };
}

// A CSV cell, in the units the model is told to read. percent stays a 0-1
// fraction (3 decimals, so a sub-1% value survives); rate_per_10k is scaled to
// its per-10,000 count, because a bare rate at ANY shared decimal count rounds
// to 0.000 — the whole column read as zeros.
function formatIndicatorValueForCsv(
  val: unknown,
  formatAs: IndicatorFormat,
): string {
  if (val === undefined || val === null || val === "") return "";
  const num = parseFloat(String(val));
  if (isNaN(num)) {
    const strVal = String(val);
    return strVal.includes(",") ? `"${strVal}"` : strVal;
  }
  if (formatAs === "rate_per_10k") return (num * 10000).toFixed(2);
  return num.toFixed(formatAs === "number" ? 2 : 3);
}

function pivotAndFormatAsCSV(
  items: JsonArrayItem[],
  columns: string[],
  disaggregations: DisaggregationOption[],
  formatFor: (item: JsonArrayItem) => IndicatorFormat,
): string {
  if (items.length === 0) return "";

  // Identify value columns (everything not in disaggregations)
  const valueColumns = columns.filter(
    (col) => !disaggregations.includes(col as DisaggregationOption),
  );

  // Case 1: Has indicator_common_id → pivot indicators to columns
  if (disaggregations.includes("indicator_common_id")) {
    const rowDimensions = disaggregations.filter(
      (d) => d !== "indicator_common_id",
    );
    const indicators = [
      ...new Set(items.map((item) => String(item.indicator_common_id))),
    ].sort();

    return pivotToWide(
      items,
      rowDimensions,
      "indicator_common_id",
      indicators,
      valueColumns,
      formatFor,
    );
  }

  // Case 2: Has time dimension → pivot time to columns
  const timeDimension = disaggregations.find(
    (d) => d === "year" || d === "quarter_id" || d === "period_id",
  );

  if (timeDimension) {
    const rowDimensions = disaggregations.filter((d) => d !== timeDimension);
    const timePeriods = [
      ...new Set(items.map((item) => String(item[timeDimension]))),
    ].sort();

    return pivotToWide(
      items,
      rowDimensions,
      timeDimension,
      timePeriods,
      valueColumns,
      formatFor,
    );
  }

  // Case 3: No pivot - return long format
  return formatLongCSV(items, columns, formatFor);
}

function pivotToWide(
  items: JsonArrayItem[],
  rowDimensions: DisaggregationOption[],
  pivotDimension: string,
  pivotValues: string[],
  valueColumns: string[],
  formatFor: (item: JsonArrayItem) => IndicatorFormat,
): string {
  const lines: string[] = [];

  // Build header: rowDimensions + (pivotValue_valueCol for each combination)
  const headerCols: string[] = [...rowDimensions];

  if (valueColumns.length === 1) {
    // Single value column: just use pivot values as headers
    headerCols.push(...pivotValues);
  } else {
    // Multiple value columns: create combined headers like "2023_count_adjusted", "2023_count_unadjusted"
    for (const pivotVal of pivotValues) {
      for (const valueCol of valueColumns) {
        headerCols.push(`${pivotVal}_${valueCol}`);
      }
    }
  }

  lines.push(headerCols.join(","));

  // Group items by row dimensions.
  //
  // The joined string is ONLY a grouping key — the dimension values are carried
  // alongside it, never recovered by splitting it back apart. Reconstructing
  // them with rowKey.split("|") was wrong in two ways, both of which emitted a
  // row with a different field count from the header, silently shifting every
  // column for a positional parser:
  //   - with NO row dimensions the key is "", and "".split("|") is [""], not
  //     [] — so every row gained a leading empty field (9 headers, 10 values).
  //   - a dimension VALUE containing "|" (e.g. a region label) split into two
  //     or more fields.
  const grouped = new Map<
    string,
    { dimValues: string[]; items: JsonArrayItem[] }
  >();

  for (const item of items) {
    const dimValues = rowDimensions.map((dim) => String(item[dim] ?? ""));
    const rowKey = dimValues.join("|");
    if (!grouped.has(rowKey)) {
      grouped.set(rowKey, { dimValues, items: [] });
    }
    grouped.get(rowKey)!.items.push(item);
  }

  // Build rows
  for (const { dimValues: rowDimValues, items: rowItems } of grouped.values()) {
    const pivotedValues: string[] = [];

    for (const pivotVal of pivotValues) {
      // Find item matching this pivot value
      const matchingItem = rowItems.find(
        (item) => String(item[pivotDimension]) === pivotVal,
      );

      if (matchingItem) {
        // Add all value columns for this pivot value
        for (const valueCol of valueColumns) {
          pivotedValues.push(
            formatValueWithN(matchingItem, valueCol, formatFor(matchingItem)),
          );
        }
      } else {
        // No data for this pivot value - add empty cells for all value columns
        for (let i = 0; i < valueColumns.length; i++) {
          pivotedValues.push("");
        }
      }
    }

    const rowValues = [...rowDimValues, ...pivotedValues];
    lines.push(rowValues.join(","));
  }

  return lines.join("\n");
}

function formatLongCSV(
  items: JsonArrayItem[],
  columns: string[],
  formatFor: (item: JsonArrayItem) => IndicatorFormat,
): string {
  const lines: string[] = [];

  // Header
  lines.push(columns.join(","));

  // Rows
  for (const item of items) {
    const values = columns.map((col) =>
      formatValueWithN(item, col, formatFor(item))
    );
    lines.push(values.join(","));
  }

  return lines.join("\n");
}

// A value plus its sample size, as one cell: "0.453 (n=120)". Dimension columns
// have no n column and pass through unchanged. The count is written plain, with
// no thousands separator — rows are joined on "," without quoting, so a grouped
// number would break the column count.
function formatValueWithN(
  item: JsonArrayItem,
  col: string,
  formatAs: IndicatorFormat,
): string {
  const formatted = formatIndicatorValueForCsv(item[col], formatAs);
  if (formatted === "") {
    return formatted;
  }
  const raw = item[sampleNProp(col)];
  const n = typeof raw === "number"
    ? raw
    : typeof raw === "string" && raw.trim() !== ""
    ? Number(raw)
    : NaN;
  if (!Number.isFinite(n) || n <= 0) {
    return formatted;
  }
  return `${formatted} (n=${n})`;
}

export async function getDataFromConfig(
  env: AIToolEnv,
  metricId: string,
  metrics: MetricWithStatus[],
  config: PresentationObjectConfig,
  aiDescription?: MetricAIDescription,
): Promise<string> {
  const disaggregations = config.d.disaggregateBy.map((d) => d.disOpt);
  if (config.d.type === "timeseries") {
    if (!config.d.timeseriesGrouping) {
      throw new Error("Timeseries config missing timeseriesGrouping");
    }
    disaggregations.push(config.d.timeseriesGrouping);
  }

  // Fold in the replicant pin so the excerpt matches what the figure renders
  // (the figure's items are filtered to selectedReplicantValue). Only when a
  // value is actually selected — otherwise getFiltersWithReplicant would pin the
  // "UNSELECTED" sentinel and return no rows (the viz editor's live config may
  // leave the replicant unresolved).
  const filters = config.d.selectedReplicantValue
    ? getFiltersWithReplicant(config)
    : config.d.filterBy;

  const query: AiMetricQuery = {
    metricId,
    disaggregations,
    filters,
  };
  return await getMetricDataForAI(
    env,
    query,
    metrics,
    config.d.valuesFilter,
    aiDescription,
    config.d.periodFilter,
  );
}
