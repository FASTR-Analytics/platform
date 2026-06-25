import { ICEH_STRAT_INFO, getReplicateByProp, type HfaTaxonomyForAI, type MetricWithStatus } from "lib";

type IcehIndicator = { id: string; label: string; category: string };

export function formatMetricsListForAI(
  metrics: MetricWithStatus[],
  icehIndicators: IcehIndicator[],
  hfaTaxonomy: HfaTaxonomyForAI
): string {
  const lines: string[] = [
    "AVAILABLE METRICS",
    "=".repeat(80),
    "",
    "Query with get_metric_data for data and detailed context.",
    "Visualize with from_metric blocks using vizPresetId.",
    "Required disaggregations are auto-included.",
    "Period formats: period_id (YYYYMM), year (YYYY), month (1-12 for seasonal).",
    "",
  ];

  // HFA module active → surface the full indicator taxonomy up front so the
  // model has every category / sub-category / service-category / time-point ID.
  if (hfaTaxonomy.indicators.length > 0) {
    lines.push(...formatHfaTaxonomyForAI(hfaTaxonomy));
  }

  const readyMetrics = metrics.filter(m => m.status === "ready");

  if (readyMetrics.length === 0) {
    lines.push("No metrics available.");
    return lines.join("\n");
  }

  const sorted = [...readyMetrics].sort((a, b) => a.id.localeCompare(b.id));

  for (const metric of sorted) {
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
      const propStrs = metric.valueProps.map(prop => {
        const propLabel = metric.valueLabelReplacements?.[prop] || prop;
        return propLabel !== prop ? `${prop} (${propLabel})` : prop;
      });
      lines.push(`  Values: ${propStrs.join(", ")}`);
    }

    const required = metric.disaggregationOptions.filter(opt => opt.isRequired && opt.value !== "quarter_id");
    const optional = metric.disaggregationOptions.filter(opt => !opt.isRequired && opt.value !== "quarter_id");

    if (required.length > 0) {
      lines.push(`  Auto-disaggregated by: ${required.map(opt => opt.value).join(", ")}`);
    }

    if (optional.length > 0) {
      lines.push(`  Optional disaggregations: ${optional.map(opt => opt.value).join(", ")}`);
    }

    const isIcehMetric = metric.disaggregationOptions.some(opt => opt.value === "iceh_indicator");
    if (isIcehMetric && icehIndicators.length > 0) {
      const grouped = new Map<string, IcehIndicator[]>();
      for (const ind of icehIndicators) {
        const cat = ind.category || "Other";
        if (!grouped.has(cat)) grouped.set(cat, []);
        grouped.get(cat)!.push(ind);
      }
      lines.push(`  ICEH indicators (iceh_indicator column values):`);
      for (const [category, indicators] of grouped) {
        lines.push(`    [${category}]`);
        for (const ind of indicators) {
          lines.push(`      - ${ind.id}: ${ind.label}`);
        }
      }
      lines.push(`  ICEH stratifiers (strat column values):`);
      for (const [stratCode, info] of Object.entries(ICEH_STRAT_INFO)) {
        const levelsStr = info.levels
          ? ` → levels: ${Object.entries(info.levels).map(([k, v]) => `${k} (${v})`).join(", ")}`
          : "";
        const equityNote = info.isEquityDimension ? " [equity dimension]" : "";
        lines.push(`    - ${stratCode}: ${info.label}${equityNote}${levelsStr}`);
      }
    }

    if (metric.vizPresets && metric.vizPresets.length > 0) {
      lines.push(`  Visualization presets:`);
      for (const preset of metric.vizPresets) {
        const dateFormat = preset.config.d.timeseriesGrouping === "year" ? "YYYY" : "YYYYMM";
        const filterNote = preset.allowedFilters && preset.allowedFilters.length > 0
          ? ` — filters: ${preset.allowedFilters.join(", ")}`
          : "";
        const hasReplicant = getReplicateByProp(preset.config) !== undefined;
        const replicantNote = hasReplicant ? " ** REQUIRES selectedReplicant **" : "";
        lines.push(`    - ${preset.id}: ${preset.label.en} (${dateFormat})${filterNote}${replicantNote}`);
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

function formatHfaTaxonomyForAI(tax: HfaTaxonomyForAI): string[] {
  const lines: string[] = [];
  const catLabel = new Map(tax.categories.map((c) => [c.id, c.label]));
  const subLabel = new Map(tax.subCategories.map((s) => [s.id, s.label]));

  lines.push("HFA INDICATORS (Health Facility Assessment)");
  lines.push("=".repeat(80));
  lines.push(
    "The HFA module is active. Query HFA data with get_metric_data using the HFA",
  );
  lines.push("metric(s) below. Filter / disaggregate with these columns + IDs:");
  lines.push("  hfa_indicator        → indicator IDs (var names)");
  lines.push("  hfa_category         → category IDs");
  lines.push("  hfa_sub_category     → sub-category IDs");
  lines.push("  hfa_service_category → service-category IDs");
  lines.push("  time_point           → time-point IDs (survey rounds)");
  lines.push("");

  lines.push("Categories (id: label) with their sub-categories:");
  for (const cat of tax.categories) {
    lines.push(`  - ${cat.id}: ${cat.label}`);
    const subs = tax.subCategories.filter((s) => s.categoryId === cat.id);
    for (const sub of subs) {
      lines.push(`      - ${sub.id}: ${sub.label}`);
    }
  }
  lines.push("");

  lines.push("Service categories (id: label):");
  for (const svc of tax.serviceCategories) {
    lines.push(`  - ${svc.id}: ${svc.label}`);
  }
  lines.push("");

  lines.push("Time points / survey rounds (time_point value → period):");
  for (const tp of tax.timePoints) {
    lines.push(`  - ${tp.id} (period ${tp.periodId})`);
  }
  lines.push("");

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
    const svcStr =
      ind.serviceCategoryIds.length > 0
        ? `  [service categories: ${ind.serviceCategoryIds.join(", ")}]`
        : "";
    lines.push(`      - ${ind.id}: ${ind.label} [${ind.measure}]${svcStr}`);
  }
  lines.push("");

  return lines;
}
