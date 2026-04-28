// =============================================================================
// DATA TRANSFORM: metrics.ai_description + metrics.viz_presets
// =============================================================================
//
// Table:    metrics
// Columns:  ai_description (JSON), viz_presets (JSON)
// Schema:   lib/types/_metric_installed.ts
//           → metricAIDescriptionInstalled (ai_description)
//           → z.array(vizPresetInstalled) (viz_presets)
//
// HOW THIS WORKS:
// - Runs at startup in a transaction
// - For each row: validate both columns against current schemas
// - If valid: skip (no work needed)
// - If invalid: apply transforms, validate, write
// - If any row fails validation after transforms: rollback, boot fails
//
// TRANSFORM BLOCKS:
//
// ai_description:
// 1. Fill caveats if missing
// 2. Fill importantNotes if missing (DEPRECATED - see block 21)
// 3. Fill relatedMetrics if missing (DEPRECATED - see block 21)
// 21. Delete deprecated fields: useCases, relatedMetrics, importantNotes
//
// viz_presets (top level):
// 4. Delete defaultPeriodFilterForDefaultVisualizations
// 5. Fill importantNotes if missing
// 6. Fill createDefaultVisualizationOnInstall if missing
// 7. Fill needsReplicant if missing
// 8. Fill allowedFilters if missing
//
// viz_presets.config.d:
// 9. periodOpt → timeseriesGrouping
// 10. periodFilter.filterType "last_12_months" → "last_n_months"
// 11. periodFilter.filterType undefined → "custom"
// 12. Strip periodOption/min/max from relative filter types
// 13. Empty valuesFilter → undefined
// 14. Remove filterBy entries with empty values
//
// viz_presets.config.s:
// 15. Legacy conditionalFormatting string preset → capture as legacyCf
// 16. Legacy mapColor* fields → capture as legacyCf (maps only)
// 17. Strip legacy mapColor* fields
// 18. Fill flat cf* fields from captured legacyCf or defaults
// 19. diffAreas → specialDisruptionsChart
// 23. Rename content "areas" → "lines-area"
//
// viz_presets.config.t:
// 20. Fill caption/subCaption/footnote fields if missing
//
// viz_presets (cleanup):
// 22. Delete needsReplicant (now derived from disaggregateBy at runtime)
//
// =============================================================================

import { z } from "zod";
import {
  metricAIDescriptionInstalled,
  vizPresetInstalled,
  flattenCf,
  CF_STORAGE_DEFAULTS,
  LEGACY_CF_PRESETS,
  type ConditionalFormatting,
  type ConditionalFormattingScale,
} from "lib";
import type { Sql } from "postgres";
import { _METRIC_INFO_CACHE } from "../../../routes/caches/visualizations.ts";

export type MigrationStats = {
  rowsChecked: number;
  rowsTransformed: number;
};

const RELATIVE_FILTER_TYPES = new Set([
  "last_n_months",
  "last_calendar_year",
  "last_calendar_quarter",
  "last_n_calendar_years",
  "last_n_calendar_quarters",
]);

const MAP_COLOR_PRESET_STOPS: Record<string, [string, string]> = {
  "red-green": ["#de2d26", "#31a354"],
  red: ["#fee0d2", "#de2d26"],
  blue: ["#deebf7", "#3182bd"],
  green: ["#e5f5e0", "#31a354"],
};

const MAP_NO_DATA_COLOR = "#f0f0f0";

function buildCfFromLegacyMapFields(
  s: Record<string, unknown>,
): ConditionalFormattingScale | undefined {
  const preset = (s.mapColorPreset as string | undefined) ?? "red-green";
  const reverse = Boolean(s.mapColorReverse);
  const [rawFrom, rawTo] =
    preset === "custom"
      ? [
          (s.mapColorFrom as string | undefined) ?? "#fee0d2",
          (s.mapColorTo as string | undefined) ?? "#de2d26",
        ]
      : MAP_COLOR_PRESET_STOPS[preset] ?? MAP_COLOR_PRESET_STOPS["red-green"];
  const [from, to] = reverse ? [rawTo, rawFrom] : [rawFrom, rawTo];

  const scaleType = (s.mapScaleType as string | undefined) ?? "continuous";
  const steps =
    scaleType === "discrete"
      ? (s.mapDiscreteSteps as number | undefined) ?? 5
      : undefined;

  const domainType = (s.mapDomainType as string | undefined) ?? "auto";
  const domain: ConditionalFormattingScale["domain"] =
    domainType === "fixed"
      ? {
          kind: "fixed",
          min: (s.mapDomainMin as number | undefined) ?? 0,
          max: (s.mapDomainMax as number | undefined) ?? 1,
        }
      : { kind: "auto" };

  return {
    type: "scale",
    scale: { min: from, max: to },
    steps,
    domain,
    noDataColor: MAP_NO_DATA_COLOR,
  };
}

function transformConfigD(d: Record<string, unknown>): void {
  // Block 9: periodOpt → timeseriesGrouping
  if (d.periodOpt !== undefined) {
    d.timeseriesGrouping ??= d.periodOpt;
    delete d.periodOpt;
  }

  const pf = d.periodFilter as Record<string, unknown> | undefined;

  // Block 10: periodFilter.filterType "last_12_months" → "last_n_months"
  if (pf?.filterType === "last_12_months") {
    pf.filterType = "last_n_months";
    pf.nMonths = 12;
    delete pf.periodOption;
    delete pf.min;
    delete pf.max;
  }

  // Block 11: periodFilter.filterType undefined → "custom"
  if (pf && pf.filterType === undefined) {
    pf.filterType = "custom";
  }

  // Block 12: Strip periodOption/min/max from relative filter types
  if (pf && RELATIVE_FILTER_TYPES.has(pf.filterType as string)) {
    delete pf.periodOption;
    delete pf.min;
    delete pf.max;
  }

  // Block 13: Empty valuesFilter → undefined
  if (Array.isArray(d.valuesFilter) && d.valuesFilter.length === 0) {
    d.valuesFilter = undefined;
  }

  // Block 14: Remove filterBy entries with empty values
  if (Array.isArray(d.filterBy)) {
    d.filterBy = (d.filterBy as { disOpt: string; values: unknown[] }[]).filter(
      (f) => Array.isArray(f.values) && f.values.length > 0
    );
  }
}

function transformConfigS(s: Record<string, unknown>, isMap: boolean): void {
  let legacyCf: ConditionalFormatting | undefined;

  // Block 15: Legacy conditionalFormatting string preset → capture as legacyCf
  if (s.conditionalFormatting !== undefined) {
    const cfRaw = s.conditionalFormatting;
    if (typeof cfRaw === "string" && cfRaw in LEGACY_CF_PRESETS) {
      legacyCf = LEGACY_CF_PRESETS[cfRaw as keyof typeof LEGACY_CF_PRESETS].value;
    }
    delete s.conditionalFormatting;
  }

  // Block 16: Legacy mapColor* fields → capture as legacyCf (maps only)
  if (isMap && (!legacyCf || legacyCf.type === "none")) {
    if (
      s.mapColorPreset !== undefined ||
      s.mapColorFrom !== undefined ||
      s.mapColorTo !== undefined ||
      s.mapColorReverse !== undefined ||
      s.mapScaleType !== undefined ||
      s.mapDiscreteSteps !== undefined ||
      s.mapDomainType !== undefined ||
      s.mapDomainMin !== undefined ||
      s.mapDomainMax !== undefined
    ) {
      const scaleCf = buildCfFromLegacyMapFields(s);
      if (scaleCf) legacyCf = scaleCf;
    }
  }

  // Block 17: Strip legacy mapColor* fields
  delete s.mapColorPreset;
  delete s.mapColorFrom;
  delete s.mapColorTo;
  delete s.mapColorReverse;
  delete s.mapScaleType;
  delete s.mapDiscreteSteps;
  delete s.mapDomainType;
  delete s.mapDomainMin;
  delete s.mapDomainMax;

  // Block 18: Fill flat cf* fields from captured legacyCf or defaults
  const flatSource = legacyCf ? flattenCf(legacyCf) : CF_STORAGE_DEFAULTS;
  for (const [key, value] of Object.entries(flatSource)) {
    if (!(key in s)) s[key] = value;
  }

  // Block 19: diffAreas → specialDisruptionsChart
  if (!("specialDisruptionsChart" in s)) {
    s.specialDisruptionsChart = s.diffAreas === true;
  }
  delete s.diffAreas;
  delete s.diffAreasOrder;

  // Block 23: Rename content "areas" → "lines-area"
  if (s.content === "areas") s.content = "lines-area";
}

// Block 20: Fill caption/subCaption/footnote fields if missing
function transformVizPresetTextConfig(t: Record<string, unknown>): void {
  if (!("caption" in t)) t.caption = null;
  if (!("captionRelFontSize" in t)) t.captionRelFontSize = null;
  if (!("subCaption" in t)) t.subCaption = null;
  if (!("subCaptionRelFontSize" in t)) t.subCaptionRelFontSize = null;
  if (!("footnote" in t)) t.footnote = null;
  if (!("footnoteRelFontSize" in t)) t.footnoteRelFontSize = null;
}

function transformVizPreset(vp: Record<string, unknown>): void {
  // Block 4: Delete defaultPeriodFilterForDefaultVisualizations
  delete vp.defaultPeriodFilterForDefaultVisualizations;

  // Block 5: Fill importantNotes if missing
  if (!("importantNotes" in vp)) vp.importantNotes = null;

  // Block 6: Fill createDefaultVisualizationOnInstall if missing
  if (!("createDefaultVisualizationOnInstall" in vp)) {
    vp.createDefaultVisualizationOnInstall = null;
  }

  // Block 7: Fill needsReplicant if missing
  if (!("needsReplicant" in vp)) vp.needsReplicant = false;

  // Block 8: Fill allowedFilters if missing
  if (!("allowedFilters" in vp)) vp.allowedFilters = [];

  // Block 22: Delete needsReplicant (now derived from disaggregateBy at runtime)
  delete vp.needsReplicant;

  if (vp.config && typeof vp.config === "object" && !Array.isArray(vp.config)) {
    const cfg = vp.config as Record<string, unknown>;
    let isMap = false;

    if (cfg.d && typeof cfg.d === "object" && !Array.isArray(cfg.d)) {
      const d = cfg.d as Record<string, unknown>;
      transformConfigD(d);
      isMap = d.type === "map";
    } else {
      cfg.d = {};
    }

    if (cfg.s && typeof cfg.s === "object" && !Array.isArray(cfg.s)) {
      transformConfigS(cfg.s as Record<string, unknown>, isMap);
    } else {
      cfg.s = {};
    }

    if (cfg.t && typeof cfg.t === "object" && !Array.isArray(cfg.t)) {
      transformVizPresetTextConfig(cfg.t as Record<string, unknown>);
    } else {
      cfg.t = {};
      transformVizPresetTextConfig(cfg.t as Record<string, unknown>);
    }
  } else {
    const newConfig = { d: {}, s: {}, t: {} as Record<string, unknown> };
    transformVizPresetTextConfig(newConfig.t);
    vp.config = newConfig;
  }
}

function transformMetricAIDescription(ai: Record<string, unknown>): void {
  // Fill caveats if missing
  if (!("caveats" in ai)) ai.caveats = null;
  // Remove deprecated fields
  delete ai.importantNotes;
  delete ai.relatedMetrics;
  delete ai.useCases;
}

const vizPresetsArraySchema = z.array(vizPresetInstalled);

export async function migrateMetricsColumns(tx: Sql, projectId: string): Promise<MigrationStats> {
  const rows = await tx<{
    id: string;
    ai_description: string | null;
    viz_presets: string | null;
  }[]>`
    SELECT id, ai_description, viz_presets FROM metrics
  `;
  const now = new Date().toISOString();
  let rowsTransformed = 0;

  for (const row of rows) {
    let aiNeedsUpdate = false;
    let vizPresetsNeedsUpdate = false;
    let transformedAi: unknown = null;
    let transformedVizPresets: unknown = null;

    // Check and transform ai_description
    if (row.ai_description) {
      const ai = JSON.parse(row.ai_description);
      if (!metricAIDescriptionInstalled.safeParse(ai).success) {
        const cloned = structuredClone(ai) as Record<string, unknown>;
        transformMetricAIDescription(cloned);
        transformedAi = metricAIDescriptionInstalled.parse(cloned);
        aiNeedsUpdate = true;
      }
    }

    // Check and transform viz_presets
    if (row.viz_presets) {
      const vizPresets = JSON.parse(row.viz_presets);
      if (!vizPresetsArraySchema.safeParse(vizPresets).success) {
        const cloned = structuredClone(vizPresets) as Record<string, unknown>[];
        for (const vp of cloned) {
          transformVizPreset(vp);
        }
        transformedVizPresets = vizPresetsArraySchema.parse(cloned);
        vizPresetsNeedsUpdate = true;
      }
    }

    // Skip if nothing needs update
    if (!aiNeedsUpdate && !vizPresetsNeedsUpdate) {
      continue;
    }

    // Build update query based on what changed
    if (aiNeedsUpdate && vizPresetsNeedsUpdate) {
      await tx`
        UPDATE metrics
        SET ai_description = ${JSON.stringify(transformedAi)},
            viz_presets = ${JSON.stringify(transformedVizPresets)}
        WHERE id = ${row.id}
      `;
    } else if (aiNeedsUpdate) {
      await tx`
        UPDATE metrics
        SET ai_description = ${JSON.stringify(transformedAi)}
        WHERE id = ${row.id}
      `;
    } else {
      await tx`
        UPDATE metrics
        SET viz_presets = ${JSON.stringify(transformedVizPresets)}
        WHERE id = ${row.id}
      `;
    }

    // Clear Valkey cache for this metric
    _METRIC_INFO_CACHE.clear({ projectId, metricId: row.id });

    rowsTransformed++;
  }

  return { rowsChecked: rows.length, rowsTransformed };
}
