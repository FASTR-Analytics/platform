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
// 22. Delete needsReplicant (now derived from disaggregateBy at runtime)
//
// viz_presets.config.d and config.s:
// → Uses shared transformConfigD/transformConfigS from po_config.ts
//
// viz_presets.config.t:
// 20. Fill caption/subCaption/footnote fields if missing (nullable for viz presets)
//
// =============================================================================

import { z } from "zod";
import { metricAIDescriptionInstalled, vizPresetInstalled } from "lib";
import type { Sql } from "postgres";
import { _METRIC_INFO_CACHE } from "../../../routes/caches/visualizations.ts";
import { transformConfigD, transformConfigS } from "./po_config.ts";

export type MigrationStats = {
  rowsChecked: number;
  rowsTransformed: number;
};

// Block 20: Fill caption/subCaption/footnote fields if missing (viz preset specific)
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

  // ─── Apply shared config transforms + viz preset text config ───────
  // config.d and config.s: see po_config.ts for block details
  // config.t: Block 20 (viz preset specific, nullable fields)
  const cfg = (vp.config ?? {}) as Record<string, unknown>;
  const d = (cfg.d ?? {}) as Record<string, unknown>;
  const s = (cfg.s ?? {}) as Record<string, unknown>;
  const t = (cfg.t ?? {}) as Record<string, unknown>;

  transformConfigD(d);
  transformConfigS(s, d.type === "map");
  transformVizPresetTextConfig(t);

  cfg.d = d;
  cfg.s = s;
  cfg.t = t;
  vp.config = cfg;
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
