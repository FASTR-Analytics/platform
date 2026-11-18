import type {
  HfaTaxonomyForAI,
  InstalledModuleSummary,
  MetricWithStatus,
} from "../types/mod.ts";
import { ICEH_STRAT_INFO } from "../types/iceh_strats.ts";
import { getReplicateByProp } from "../get_disaggregator_display_prop.ts";
import { compareModules } from "../group_metrics.ts";
import { AI_INLINE_LIST_MAX } from "./read_bounds.ts";

export type ModuleForAI = Pick<
  InstalledModuleSummary,
  "id" | "label" | "family" | "tier" | "sortOrder"
>;

// Metrics are listed in module order (compareModules: family, the primary
// module first, declared sort order), each module introduced by one heading
// line, so the model meets each family's primary result before its
// supporting analyses. A metric whose module is not in the list goes last.
export function formatMetricsListForAI(
  metrics: MetricWithStatus[],
  modules: ModuleForAI[],
  hfaTaxonomy: HfaTaxonomyForAI,
): string {
  const lines: string[] = [
    "AVAILABLE METRICS",
    "=".repeat(80),
    "",
    "Query with get_metric_data for data and detailed context.",
    "Required disaggregations are auto-included.",
    "Period formats: period_id (YYYYMM), year (YYYY), month (1-12 for seasonal).",
    "",
  ];

  // HFA module active → surface the taxonomy up front so the model has every
  // category / sub-category / service-category / time-point ID.
  if (hfaTaxonomy.indicators.length > 0) {
    lines.push(...formatHfaTaxonomyForAI(hfaTaxonomy));
  }

  const readyMetrics = metrics.filter((m) => m.status === "ready");

  if (readyMetrics.length === 0) {
    lines.push("No metrics available.");
    return lines.join("\n");
  }

  if (readyMetrics.some(isIcehMetric)) {
    lines.push(...formatIcehStratifiersForAI());
  }

  const orderedModules = modules.toSorted(compareModules);
  const modulePosition = new Map(orderedModules.map((m, i) => [m.id, i]));
  const position = (m: MetricWithStatus) =>
    modulePosition.get(m.moduleId) ?? orderedModules.length;
  const sorted = [...readyMetrics].sort((a, b) =>
    position(a) - position(b) || a.id.localeCompare(b.id)
  );

  let currentModuleId: string | undefined = undefined;
  for (const metric of sorted) {
    if (metric.moduleId !== currentModuleId) {
      currentModuleId = metric.moduleId;
      const mod = orderedModules.find((m) => m.id === metric.moduleId);
      lines.push(
        mod === undefined
          ? `MODULE ${metric.moduleId}`
          : `MODULE ${mod.id}: ${mod.label} [${mod.family}, ${
            mod.tier === "primary" ? "primary result" : "supporting analysis"
          }]`,
      );
      lines.push("");
    }
    const label = metric.variantLabel
      ? `${metric.label} [${metric.variantLabel}]`
      : metric.label;

    lines.push(`${metric.id}: ${label} [${metric.formatAs}]`);

    if (metric.aiDescription?.summary) {
      lines.push(`  ${getAIStr(metric.aiDescription.summary)}`);
    }

    if (metric.importantNotes) {
      lines.push(`  NOTE: ${metric.importantNotes}`);
    }

    if (metric.valueProps.length > 0) {
      const propStrs = metric.valueProps.map((prop) => {
        const propLabel = metric.valueLabelReplacements?.[prop] || prop;
        return propLabel !== prop ? `${prop} (${propLabel})` : prop;
      });
      lines.push(`  Values: ${propStrs.join(", ")}`);
    }

    const required = metric.disaggregationOptions.filter((opt) =>
      opt.isRequired && opt.value !== "quarter_id"
    );
    const optional = metric.disaggregationOptions.filter((opt) =>
      !opt.isRequired && opt.value !== "quarter_id"
    );

    if (required.length > 0) {
      lines.push(
        `  Auto-disaggregated by: ${
          required.map((opt) => opt.value).join(", ")
        }`,
      );
    }

    if (optional.length > 0) {
      lines.push(
        `  Optional disaggregations: ${
          optional.map((opt) => opt.value).join(", ")
        }`,
      );
    }

    if (metric.vizPresets && metric.vizPresets.length > 0) {
      lines.push(`  Visualization presets:`);
      for (const preset of metric.vizPresets) {
        const dateFormat = preset.config.d.timeseriesGrouping === "year"
          ? "YYYY"
          : "YYYYMM";
        const filterNote =
          preset.allowedFilters && preset.allowedFilters.length > 0
            ? ` — filters: ${preset.allowedFilters.join(", ")}`
            : "";
        const replicateBy = getReplicateByProp(preset.config);
        const replicantNote = replicateBy !== undefined
          ? ` ** REQUIRES selectedReplicant: one ${replicateBy} value **`
          : "";
        lines.push(
          `    - ${preset.id}: ${preset.label.en} (${dateFormat})${filterNote}${replicantNote}`,
        );
        if (preset.importantNotes) {
          lines.push(`      NOTE: ${getAIStr(preset.importantNotes)}`);
        }
      }
    }

    lines.push("");
  }

  return lines.join("\n");
}

function getAIStr(val: string | { en: string; fr?: string }): string {
  if (typeof val === "string") return val;
  return val.en;
}

function isIcehMetric(metric: MetricWithStatus): boolean {
  return metric.disaggregationOptions.some((opt) =>
    opt.value === "iceh_indicator"
  );
}

function formatIcehStratifiersForAI(): string[] {
  return [
    "ICEH STRATIFIERS",
    "=".repeat(80),
    "Every ICEH metric below has a strat column, which takes these values. get_dimension_values lists an ICEH metric's indicators (iceh_indicator values), each with its category.",
    ...Object.entries(ICEH_STRAT_INFO).map(([stratCode, info]) => {
      const levelsStr = info.levels
        ? ` → levels: ${
          Object.entries(info.levels).map(([k, v]) => `${k} (${v})`).join(", ")
        }`
        : "";
      const equityNote = info.isEquityDimension ? " [equity dimension]" : "";
      return `  - ${stratCode}: ${info.label}${equityNote}${levelsStr}`;
    }),
    "",
  ];
}

function indicatorCount(n: number): string {
  return `${n} ${n === 1 ? "indicator" : "indicators"}`;
}

function formatHfaTaxonomyForAI(tax: HfaTaxonomyForAI): string[] {
  const lines: string[] = [];
  const inCategory = Map.groupBy(tax.indicators, (i) => i.categoryId);
  const inSubCategory = Map.groupBy(tax.indicators, (i) => i.subCategoryId);
  const countIn = (
    groups: Map<string | null, unknown[]>,
    id: string | null,
  ) => indicatorCount(groups.get(id)?.length ?? 0);

  lines.push("HFA INDICATORS (Health Facility Assessment)");
  lines.push("=".repeat(80));
  lines.push(
    "The HFA module is active. Query HFA data with get_metric_data using the HFA",
  );
  lines.push(
    "metric(s) below. Filter / disaggregate with these columns + IDs:",
  );
  lines.push("  hfa_indicator        → indicator ids");
  lines.push("  hfa_category         → category IDs");
  lines.push("  hfa_sub_category     → sub-category IDs");
  lines.push(
    "  hfa_service_category → service-category IDs (filter-only, cannot disaggregate; filter matches indicators in ANY selected category)",
  );
  lines.push("  time_point           → time-point IDs (survey rounds)");
  if (tax.variantItems.length > 0) {
    lines.push(
      "  hfa_variant_item     → variant-item IDs (only on the by-variant metric; hfa_indicator there carries the parent indicator)",
    );
  }
  lines.push("");

  lines.push(
    `Categories (id: label (how many of all ${
      indicatorCount(tax.indicators.length)
    } it holds)) with their sub-categories:`,
  );
  for (const cat of tax.categories) {
    lines.push(`  - ${cat.id}: ${cat.label} (${countIn(inCategory, cat.id)})`);
    const subs = tax.subCategories.filter((s) => s.categoryId === cat.id);
    for (const sub of subs) {
      lines.push(
        `      - ${sub.id}: ${sub.label} (${countIn(inSubCategory, sub.id)})`,
      );
    }
  }
  if (inCategory.has(null)) {
    lines.push(`  - no category (${countIn(inCategory, null)})`);
  }
  lines.push("");

  lines.push("Service categories (id: label):");
  for (const svc of tax.serviceCategories) {
    lines.push(`  - ${svc.id}: ${svc.label}`);
  }
  lines.push("");

  if (tax.variantGroups.length > 0) {
    lines.push(
      "Variant groups (per-indicator response-option breakdowns) with their items (id: label):",
    );
    for (const group of tax.variantGroups) {
      lines.push(`  - ${group.id}: ${group.label}`);
      const items = tax.variantItems.filter((i) => i.groupId === group.id);
      for (const item of items) {
        lines.push(`      - ${item.id}: ${item.label}`);
      }
      const members = tax.indicators
        .filter((i) => i.variantGroupId === group.id)
        .map((i) => i.id);
      if (members.length > AI_INLINE_LIST_MAX) {
        lines.push(
          `      [${members.length} indicators in this group, more than ${AI_INLINE_LIST_MAX}, too many to list here: get_dimension_values on the by-variant metric with disOpt "hfa_indicator" and search ["variant group ${group.id}"] lists them]`,
        );
      } else if (members.length > 0) {
        lines.push(`      [indicators in this group: ${members.join(", ")}]`);
      }
    }
    lines.push("");
  }

  lines.push("Time points / survey rounds (time_point value → period):");
  for (const tp of tax.timePoints) {
    lines.push(`  - ${tp.id} (period ${tp.periodId})`);
  }
  lines.push("");

  if (tax.indicators.length > AI_INLINE_LIST_MAX) {
    lines.push(
      `Indicators (hfa_indicator values): ${tax.indicators.length}, more than ${AI_INLINE_LIST_MAX}, too many to list here. get_dimension_values with disOpt "hfa_indicator" and the id of an HFA metric below lists them, each with its measure, category, sub-category, service categories and variant group, and its search finds them by name or by a category or variant group id.`,
    );
    lines.push("");
    return lines;
  }

  const catLabel = new Map(tax.categories.map((c) => [c.id, c.label]));
  const subLabel = new Map(tax.subCategories.map((s) => [s.id, s.label]));
  lines.push(
    "Indicators (hfa_indicator values), grouped by category › sub-category:",
  );
  let curCat: string | null | undefined = undefined;
  let curSub: string | null | undefined = undefined;
  for (const ind of tax.indicators) {
    if (ind.categoryId !== curCat) {
      curCat = ind.categoryId;
      curSub = undefined;
      const label = ind.categoryId
        ? catLabel.get(ind.categoryId) ?? ind.categoryId
        : "Uncategorised";
      const idStr = ind.categoryId ? ` (category: ${ind.categoryId})` : "";
      lines.push(`  [${label}]${idStr}`);
    }
    if (ind.subCategoryId !== curSub) {
      curSub = ind.subCategoryId;
      const label = ind.subCategoryId
        ? subLabel.get(ind.subCategoryId) ?? ind.subCategoryId
        : "(no sub-category)";
      const idStr = ind.subCategoryId
        ? ` (sub-category: ${ind.subCategoryId})`
        : "";
      lines.push(`    [${label}]${idStr}`);
    }
    const svcStr = ind.serviceCategoryIds.length > 0
      ? `  [service categories: ${ind.serviceCategoryIds.join(", ")}]`
      : "";
    lines.push(`      - ${ind.id}: ${ind.label} [${ind.measure}]${svcStr}`);
  }
  lines.push("");

  return lines;
}
