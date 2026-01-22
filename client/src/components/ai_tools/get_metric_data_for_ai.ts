import {
  DisaggregationOption,
  GenericLongFormFetchConfig,
  getMetricStaticData,
  ItemsHolderPresentationObject,
  PeriodOption,
} from "lib";
import { _PO_ITEMS_CACHE } from "~/state/caches/visualizations";
import { serverActions } from "~/server_actions";
import { poItemsQueue } from "~/utils/request_queue";

export async function getMetricDataForAI(
  projectId: string,
  metricId: string,
  disaggregations: DisaggregationOption[],
  filters?: { col: DisaggregationOption; vals: string[] }[],
  periodFilter?: { periodOption: PeriodOption; min: number; max: number },
): Promise<string> {
  // Get static metric data from build-time map
  const staticData = getMetricStaticData(metricId);

  // Auto-merge required disaggregations (AI doesn't need to specify them)
  const allDisaggregations = [
    ...staticData.requiredDisaggregationOptions,
    ...disaggregations,
  ];
  const uniqueDisaggregations = [...new Set(allDisaggregations)] as DisaggregationOption[];

  // Build fetchConfig
  const fetchConfig: GenericLongFormFetchConfig = {
    values: staticData.valueProps.map((prop) => ({
      prop,
      func: staticData.valueFunc,
    })),
    groupBys: uniqueDisaggregations,
    filters: filters ?? [],
    periodFilter: periodFilter
      ? {
        periodOption: periodFilter.periodOption,
        min: periodFilter.min,
        max: periodFilter.max,
      }
      : undefined,
    postAggregationExpression: undefined,
    includeNationalForAdminArea2: false,
    includeNationalPosition: undefined,
  };

  // Follow same pattern as getPresentationObjectItemsFromCacheOrFetch_AsyncGenerator
  const { data, version } = await _PO_ITEMS_CACHE.get({
    projectId,
    resultsObjectId: staticData.resultsObjectId,
    fetchConfig,
  });

  let itemsHolder: ItemsHolderPresentationObject;

  if (data) {
    // Cache hit
    itemsHolder = data;
  } else {
    // Cache miss - fetch from server
    const newPromise = poItemsQueue.enqueue(() =>
      serverActions.getPresentationObjectItems({
        projectId,
        resultsObjectId: staticData.resultsObjectId,
        fetchConfig,
        firstPeriodOption: undefined,
      })
    );

    _PO_ITEMS_CACHE.setPromise(
      newPromise,
      {
        projectId,
        resultsObjectId: staticData.resultsObjectId,
        fetchConfig,
      },
      version,
    );

    const res = await newPromise;
    if (!res.success) {
      throw new Error(res.err);
    }
    itemsHolder = res.data;
  }

  // Format as markdown
  return formatItemsAsMarkdown(itemsHolder, metricId, disaggregations, filters, periodFilter);
}

function formatItemsAsMarkdown(
  itemsHolder: ItemsHolderPresentationObject,
  metricId: string,
  disaggregations: DisaggregationOption[],
  filters?: { col: DisaggregationOption; vals: string[] }[],
  periodFilter?: { periodOption: PeriodOption; min: number; max: number },
): string {
  const lines: string[] = [];
  const staticData = getMetricStaticData(metricId);

  lines.push("# METRIC DATA");
  lines.push("=".repeat(80));
  lines.push("");
  lines.push(`**Metric:** ${staticData.label}${staticData.variantLabel ? ` [${staticData.variantLabel}]` : ""}`);
  lines.push(`**Metric ID:** ${metricId}`);
  lines.push(`**Format:** ${staticData.formatAs}`);

  if (staticData.valueProps.length > 0) {
    lines.push("");
    lines.push("**Value properties:**");
    for (const prop of staticData.valueProps) {
      const propLabel = staticData.valueLabelReplacements?.[prop] || prop;
      lines.push(`  - ${prop}: ${propLabel}`);
    }
  }

  lines.push("");

  if (itemsHolder.status === "too_many_items") {
    lines.push("**STATUS: Too many items - add more filters or disaggregations to narrow results**");
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

  if (filters && filters.length > 0) {
    lines.push("**Filtered by:**");
    for (const f of filters) {
      lines.push(`- ${f.col}: ${f.vals.join(", ")}`);
    }
    lines.push("");
  }

  if (periodFilter) {
    lines.push(`**Period filter:** ${periodFilter.periodOption} from ${periodFilter.min} to ${periodFilter.max}`);
    lines.push("");
  }

  if (itemsHolder.dateRange) {
    lines.push(`**Time range in data:** ${itemsHolder.dateRange.periodOption} (${itemsHolder.dateRange.min} to ${itemsHolder.dateRange.max})`);
    lines.push("");
  }

  lines.push(`**Total rows:** ${items.length}`);
  lines.push("");

  if (items.length === 0) {
    lines.push("*No data available*");
    return lines.join("\n");
  }

  // Dimension summary (only for disaggregation dimensions, not value columns)
  const columns = Object.keys(items[0]);
  const dimensionColumns = columns.filter(col => disaggregations.includes(col as DisaggregationOption));

  if (dimensionColumns.length > 0) {
    const dimensionStats = getDimensionStats(items, dimensionColumns);
    lines.push("## Dimension Summary");
    lines.push("");
    for (const col of dimensionColumns) {
      const stats = dimensionStats[col];
      if (stats && stats.uniqueCount > 0) {
        lines.push(
          `**${col}:** ${stats.uniqueCount} unique value${stats.uniqueCount === 1 ? "" : "s"}`,
        );
        if (stats.uniqueCount <= 10) {
          lines.push(`  ${stats.uniqueValues.join(", ")}`);
        }
      }
    }
    lines.push("");
  }

  // Format as CSV (with smart pivot)
  lines.push("## Data (CSV)");
  lines.push("");
  const csvData = pivotAndFormatAsCSV(items, columns, disaggregations, staticData.formatAs);
  lines.push(csvData);
  lines.push("");

  return lines.join("\n");
}

function getDimensionStats(
  items: Record<string, string>[],
  columns: string[],
): Record<string, { uniqueCount: number; uniqueValues: string[] }> {
  const stats: Record<string, { uniqueCount: number; uniqueValues: string[] }> = {};

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

function pivotAndFormatAsCSV(
  items: Record<string, string>[],
  columns: string[],
  disaggregations: DisaggregationOption[],
  formatAs: "percent" | "number",
): string {
  if (items.length === 0) return "";

  const decimalPlaces = formatAs === "percent" ? 3 : 2;

  // Identify value columns (everything not in disaggregations)
  const valueColumns = columns.filter(col => !disaggregations.includes(col as DisaggregationOption));

  // Case 1: Has indicator_common_id → pivot indicators to columns
  if (disaggregations.includes("indicator_common_id")) {
    const rowDimensions = disaggregations.filter(d => d !== "indicator_common_id");
    const indicators = [...new Set(items.map(item => item.indicator_common_id))].sort();

    return pivotToWide(items, rowDimensions, "indicator_common_id", indicators, valueColumns, decimalPlaces);
  }

  // Case 2: Has time dimension → pivot time to columns
  const timeDimension = disaggregations.find(d =>
    d === "year" || d === "quarter_id" || d === "period_id"
  );

  if (timeDimension) {
    const rowDimensions = disaggregations.filter(d => d !== timeDimension);
    const timePeriods = [...new Set(items.map(item => item[timeDimension]))].sort();

    return pivotToWide(items, rowDimensions, timeDimension, timePeriods, valueColumns, decimalPlaces);
  }

  // Case 3: No pivot - return long format
  return formatLongCSV(items, columns, decimalPlaces);
}

function pivotToWide(
  items: Record<string, string>[],
  rowDimensions: DisaggregationOption[],
  pivotDimension: string,
  pivotValues: string[],
  valueColumns: string[],
  decimalPlaces: number,
): string {
  const lines: string[] = [];

  // Build header: rowDimensions + pivotValues (one col per pivot value)
  const headerCols = [...rowDimensions, ...pivotValues];
  lines.push(headerCols.join(","));

  // Group items by row dimensions
  const grouped = new Map<string, Record<string, string>[]>();

  for (const item of items) {
    const rowKey = rowDimensions.map(dim => item[dim] || "").join("|");
    if (!grouped.has(rowKey)) {
      grouped.set(rowKey, []);
    }
    grouped.get(rowKey)!.push(item);
  }

  // Build rows
  for (const [rowKey, rowItems] of grouped) {
    const rowDimValues = rowKey.split("|");
    const pivotedValues: string[] = [];

    for (const pivotVal of pivotValues) {
      // Find item matching this pivot value
      const matchingItem = rowItems.find(item => item[pivotDimension] === pivotVal);

      if (matchingItem && valueColumns.length > 0) {
        // Take first value column (assume single value per cell)
        const val = matchingItem[valueColumns[0]];
        pivotedValues.push(formatValue(val, decimalPlaces));
      } else {
        pivotedValues.push("");
      }
    }

    const rowValues = [...rowDimValues, ...pivotedValues];
    lines.push(rowValues.join(","));
  }

  return lines.join("\n");
}

function formatLongCSV(
  items: Record<string, string>[],
  columns: string[],
  decimalPlaces: number,
): string {
  const lines: string[] = [];

  // Header
  lines.push(columns.join(","));

  // Rows
  for (const item of items) {
    const values = columns.map((col) => formatValue(item[col], decimalPlaces));
    lines.push(values.join(","));
  }

  return lines.join("\n");
}

function formatValue(val: any, decimalPlaces: number): string {
  if (val === undefined || val === null || val === "") {
    return "";
  }

  // Round numeric values
  const num = parseFloat(val);
  if (!isNaN(num)) {
    return num.toFixed(decimalPlaces);
  }

  // Escape commas in text values
  const strVal = String(val);
  if (strVal.includes(",")) {
    return `"${strVal}"`;
  }

  return strVal;
}
