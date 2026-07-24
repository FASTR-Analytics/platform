import {
  type AiMetricQuery,
  type IndicatorMetadata,
  type JsonArrayItem,
  type MetricAIDescription,
  type MetricWithStatus,
  type PresentationObjectConfig,
  type TranslatableString,
  DisaggregationOption,
  GenericLongFormFetchConfig,
  ICEH_STRAT_INFO,
  ItemsHolderPresentationObject,
  getFiltersWithReplicant,
  inferPeriodFormatFromValue,
  periodFilterHasBounds,
} from "lib";
import { AIToolFailure } from "panther";
import { _PO_ITEMS_CACHE } from "~/state/project/t2_presentation_objects";
import { serverActions } from "~/server_actions";
import { poItemsQueue } from "~/state/_infra/request_queue";

export function inferPeriodFilter(
  startDate: number | undefined,
  endDate: number | undefined,
): { filterType: "custom"; min: number; max: number } | undefined {
  if (startDate == null || endDate == null) return undefined;
  // The value self-identifies its format downstream — no periodOption needed.
  return { filterType: "custom", min: startDate, max: endDate };
}

export async function getMetricDataForAI(
  projectId: string,
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
  const periodFilter = periodFilterOverride ?? inferPeriodFilter(startDate, endDate);

  const metric = metrics.find((m) => m.id === metricId);
  if (!metric) throw new AIToolFailure(`Metric "${metricId}" not found`);

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
  const valuePropsToFetch =
    valuesFilter && valuesFilter.length > 0
      ? valuesFilter.filter((vf) => metric.valueProps.includes(vf))
      : metric.valueProps;

  // Build fetchConfig. The admin-area roll-up row is DELIBERATELY excluded from
  // AI data: a total row mixed into the long-form rows would invite double
  // counting in the model's sums. Callers that mirror a viz with the roll-up
  // enabled must say so in the context text (see format_viz_editor_for_ai).
  const fetchConfig: GenericLongFormFetchConfig =
    metric.postAggregationExpression
      ? {
          values: metric.postAggregationExpression.ingredientValues,
          groupBys: uniqueDisaggregations,
          filters: filters,
          periodFilter,
          postAggregationExpression:
            metric.postAggregationExpression.expression,
          includeAdminAreaRollup: false,
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
          includeAdminAreaRollup: false,
        };

  const { data, version } = await _PO_ITEMS_CACHE.get({
    projectId,
    resultsObjectId: metric.resultsObjectId,
    fetchConfig,
  });

  let itemsHolder: ItemsHolderPresentationObject;

  if (data) {
    itemsHolder = data;
  } else {
    const newPromise = poItemsQueue.enqueue(() =>
      serverActions.getPresentationObjectItems({
        projectId,
        resultsObjectId: metric.resultsObjectId,
        fetchConfig,
        firstPeriodOption: metric.mostGranularTimePeriodColumnInResultsFile,
      }),
    );

    _PO_ITEMS_CACHE.setPromise(
      newPromise,
      {
        projectId,
        resultsObjectId: metric.resultsObjectId,
        fetchConfig,
      },
      version,
    );

    const res = await newPromise;
    if (!res.success) {
      throw new AIToolFailure(res.err);
    }
    itemsHolder = res.data;
  }

  const indicatorMetadata = itemsHolder.status === "ok" ? itemsHolder.indicatorMetadata : [];

  return formatItemsAsMarkdown(
    itemsHolder,
    metric,
    disaggregations,
    filters,
    periodFilter,
    aiDescription,
    indicatorMetadata,
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
): string {
  const lines: string[] = [];

  lines.push("# METRIC DATA");
  lines.push("=".repeat(80));
  lines.push("");
  lines.push(`**Metric ID (metricId):** ${metric.id}`);
  lines.push(
    `**Metric Label:** ${metric.label}${metric.variantLabel ? ` [${metric.variantLabel}]` : ""}`,
  );
  lines.push(`**Format:** ${metric.formatAs}`);

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
      lines.push(`**Disaggregation guidance:** ${toStr(aiDescription.disaggregationGuidance)}`);
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

  if (filters && filters.length > 0) {
    lines.push("**Filtered by:**");
    for (const f of filters) {
      lines.push(`- ${f.disOpt}: ${f.values.join(", ")}`);
    }
    lines.push("");
  }

  if (periodFilter) {
    if (periodFilterHasBounds(periodFilter)) {
      lines.push(
        `**Period filter:** ${inferPeriodFormatFromValue(periodFilter.min) ?? "unknown"} from ${periodFilter.min} to ${periodFilter.max}`,
      );
    } else if (periodFilter.filterType === "last_n_months") {
      lines.push(`**Period filter:** last ${periodFilter.nMonths} months`);
    } else if (periodFilter.filterType === "last_calendar_year") {
      lines.push(`**Period filter:** last calendar year`);
    } else if (periodFilter.filterType === "last_n_calendar_years") {
      lines.push(`**Period filter:** last ${periodFilter.nYears} calendar years`);
    } else if (periodFilter.filterType === "last_calendar_quarter") {
      lines.push(`**Period filter:** last calendar quarter`);
    } else if (periodFilter.filterType === "last_n_calendar_quarters") {
      lines.push(`**Period filter:** last ${periodFilter.nQuarters} calendar quarters`);
    }
    lines.push("");
  }

  if (itemsHolder.dateRange) {
    lines.push(
      `**Time range in data:** ${inferPeriodFormatFromValue(itemsHolder.dateRange.min) ?? "unknown"} (${itemsHolder.dateRange.min} to ${itemsHolder.dateRange.max})`,
    );
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
  const dimensionColumns = columns.filter((col) =>
    disaggregations.includes(col as DisaggregationOption),
  );

  const metadataById = new Map(indicatorMetadata?.map(m => [m.id, m]) ?? []);

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
        if (stats.uniqueCount <= 20) {
          const valuesWithLabels = stats.uniqueValues.map(val => {
            const meta = metadataById.get(val);
            if (meta?.label && meta.label !== val) {
              return `${val} (${meta.label})`;
            }
            if (col === "strat") {
              const stratInfo = ICEH_STRAT_INFO[val as keyof typeof ICEH_STRAT_INFO];
              if (stratInfo) return `${val} (${stratInfo.label})`;
            }
            return val;
          });
          lines.push(`  ${valuesWithLabels.join(", ")}`);
        }
      }
    }
    lines.push("");
  }

  // Format as CSV (with smart pivot)
  lines.push("## Data (CSV)");
  lines.push("");
  const csvData = pivotAndFormatAsCSV(
    items,
    columns,
    disaggregations,
    metric.formatAs,
  );
  lines.push(csvData);
  lines.push("");

  lines.push("=".repeat(80));
  lines.push("## Creating Visualizations from this Metric");
  lines.push("");
  lines.push(
    "To visualize this metric, use a `from_metric` block with a vizPresetId from get_available_metrics.",
  );
  lines.push("");
  lines.push("```");
  lines.push("{");
  lines.push('  "type": "from_metric",');
  lines.push(`  "metricId": "${metric.id}",`);
  lines.push('  "vizPresetId": "<preset_id>",');
  lines.push('  "chartTitle": "Your chart title here",');
  lines.push('  "filters": [{ "disOpt": "<dimension>", "values": ["<value>"] }],');
  lines.push('  "startDate": 202301,');
  lines.push('  "endDate": 202412');
  lines.push("}");
  lines.push("```");
  lines.push("");
  lines.push("**Notes:**");
  lines.push(`- Use get_available_metrics to see available vizPresetId values for metric "${metric.id}"`);
  lines.push("- filters and startDate/endDate are optional");
  lines.push("- Date format depends on the preset (YYYY or YYYYMM — shown in preset listing)");
  lines.push("- Only filter on dimensions listed in the preset's allowedFilters");
  lines.push("");

  return lines.join("\n");
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

function pivotAndFormatAsCSV(
  items: JsonArrayItem[],
  columns: string[],
  disaggregations: DisaggregationOption[],
  formatAs: "percent" | "number",
): string {
  if (items.length === 0) return "";

  const decimalPlaces = formatAs === "percent" ? 3 : 2;

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
      decimalPlaces,
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
      decimalPlaces,
    );
  }

  // Case 3: No pivot - return long format
  return formatLongCSV(items, columns, decimalPlaces);
}

function pivotToWide(
  items: JsonArrayItem[],
  rowDimensions: DisaggregationOption[],
  pivotDimension: string,
  pivotValues: string[],
  valueColumns: string[],
  decimalPlaces: number,
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

  // Group items by row dimensions
  const grouped = new Map<string, JsonArrayItem[]>();

  for (const item of items) {
    const rowKey = rowDimensions.map((dim) => item[dim] || "").join("|");
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
      const matchingItem = rowItems.find(
        (item) => String(item[pivotDimension]) === pivotVal,
      );

      if (matchingItem) {
        // Add all value columns for this pivot value
        for (const valueCol of valueColumns) {
          const val = matchingItem[valueCol];
          pivotedValues.push(formatValue(val, decimalPlaces));
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

export async function getDataFromConfig(
  projectId: string,
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
  return await getMetricDataForAI(projectId, query, metrics, config.d.valuesFilter, aiDescription, config.d.periodFilter);
}
