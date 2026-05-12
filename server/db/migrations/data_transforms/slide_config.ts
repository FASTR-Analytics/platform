// =============================================================================
// DATA TRANSFORM: slides.config
// =============================================================================
//
// Table:    slides
// Column:   config (JSON)
// Schema:   lib/types/_slide_config.ts
//           → slideConfigSchema
//
// TRANSFORM BLOCKS:
// 1. Rename "heading" → "header" in content slides
// 2. Fix malformed layouts (missing type/id) → default empty text item
// 3. Convert "placeholder" blocks → empty figure blocks
// 4. Convert span from string → number
// 5. Clamp span to valid range 1-12
// 6. Rename source.type "from_metric" → "from_data" and add snapshotAt
// 7. Transform embedded PO configs in figure blocks (reuses po_config transforms)
// 8. Remove per-slide logo fields (now deck-level)
// 9. Migrate figureInputs: yScaleAxisData → scaleAxisLimits + tierHeaders
// 10. Compute missing scaleAxisLimits from values array (includes chartOHData)
//
// PRE-VALIDATION BLOCK (runs on ALL rows):
// A. One-time fix for missing scaleAxisLimits - DELETE AFTER ALL INSTANCES UPDATED
//
// =============================================================================

import { slideConfigSchema } from "lib";
import type { Sql } from "postgres";
import { transformPOConfigData } from "./po_config.ts";

export type MigrationStats = {
  rowsChecked: number;
  rowsTransformed: number;
};

type LayoutNode = {
  type: string;
  data?: {
    type: string;
    figureInputs?: Record<string, unknown>;
    source?: {
      type: string;
      config?: Record<string, unknown>;
      snapshotAt?: string;
    };
  };
  children?: LayoutNode[];
};

// Compute scaleAxisLimits from values array (mirrors panther's calculateChartScaleLimits)
function computeScaleAxisLimitsFromValues(
  values: (number | undefined)[][][][][],
  paneCount: number,
  tierCount: number,
  laneCount: number,
): {
  paneLimits: Array<{
    valueMin: number;
    valueMax: number;
    tierLimits: Array<{ valueMin: number; valueMax: number }>;
    laneLimits: Array<{ valueMin: number; valueMax: number }>;
  }>;
} {
  const paneLimits = Array.from({ length: paneCount }, () => ({
    valueMin: Number.POSITIVE_INFINITY,
    valueMax: Number.NEGATIVE_INFINITY,
    tierLimits: Array.from({ length: tierCount }, () => ({
      valueMin: Number.POSITIVE_INFINITY,
      valueMax: Number.NEGATIVE_INFINITY,
    })),
    laneLimits: Array.from({ length: laneCount }, () => ({
      valueMin: Number.POSITIVE_INFINITY,
      valueMax: Number.NEGATIVE_INFINITY,
    })),
  }));

  for (let i_pane = 0; i_pane < paneCount; i_pane++) {
    for (let i_tier = 0; i_tier < tierCount; i_tier++) {
      for (let i_lane = 0; i_lane < laneCount; i_lane++) {
        const seriesArray = values[i_pane]?.[i_tier]?.[i_lane];
        if (!seriesArray) continue;
        for (const lastDimArray of seriesArray) {
          if (!lastDimArray) continue;
          for (const value of lastDimArray) {
            if (value === undefined || value === null) continue;
            const p = paneLimits[i_pane];
            p.valueMin = Math.min(p.valueMin, value);
            p.valueMax = Math.max(p.valueMax, value);
            p.tierLimits[i_tier].valueMin = Math.min(p.tierLimits[i_tier].valueMin, value);
            p.tierLimits[i_tier].valueMax = Math.max(p.tierLimits[i_tier].valueMax, value);
            p.laneLimits[i_lane].valueMin = Math.min(p.laneLimits[i_lane].valueMin, value);
            p.laneLimits[i_lane].valueMax = Math.max(p.laneLimits[i_lane].valueMax, value);
          }
        }
      }
    }
  }

  // Fallback to 0..1 where no data was found
  for (const p of paneLimits) {
    if (!isFinite(p.valueMin)) p.valueMin = 0;
    if (!isFinite(p.valueMax)) p.valueMax = 1;
    for (const t of p.tierLimits) {
      if (!isFinite(t.valueMin)) t.valueMin = 0;
      if (!isFinite(t.valueMax)) t.valueMax = 1;
    }
    for (const l of p.laneLimits) {
      if (!isFinite(l.valueMin)) l.valueMin = 0;
      if (!isFinite(l.valueMax)) l.valueMax = 1;
    }
  }

  return { paneLimits };
}

function transformFigureInputs(fi: Record<string, unknown>): void {
  for (const dataKey of ["timeseriesData", "chartData", "chartOHData"]) {
    const d = fi[dataKey] as Record<string, unknown> | undefined;
    if (!d || d.isTransformed !== true) continue;

    // Block 9: Migrate yScaleAxisData → scaleAxisLimits + tierHeaders
    const yScaleAxisData = d.yScaleAxisData as
      | Record<string, unknown>
      | undefined;
    if (!d.tierHeaders) {
      const oldTierHeaders = yScaleAxisData?.tierHeaders as
        | string[]
        | undefined;
      d.tierHeaders = oldTierHeaders ?? ["default"];
    }
    if (!d.scaleAxisLimits && yScaleAxisData) {
      const oldPaneLimits = yScaleAxisData.paneLimits as Array<{
        valueMin: number;
        valueMax: number;
        tierLimits: Array<{ valueMin: number; valueMax: number }>;
      }>;
      const laneCount = (d.laneHeaders as string[] | undefined)?.length ?? 1;
      d.scaleAxisLimits = {
        paneLimits: oldPaneLimits.map((p) => ({
          valueMin: p.valueMin,
          valueMax: p.valueMax,
          tierLimits: p.tierLimits,
          laneLimits: Array.from({ length: laneCount }, () => ({
            valueMin: p.valueMin,
            valueMax: p.valueMax,
          })),
        })),
      };
      d.yScaleAxisLabel = yScaleAxisData.yScaleAxisLabel;
    }
    delete d.yScaleAxisData;

    // Block 10: Compute scaleAxisLimits from values if still missing
    const scaleAxisLimits = d.scaleAxisLimits as
      | { paneLimits?: unknown }
      | undefined;
    if (!scaleAxisLimits?.paneLimits && d.values) {
      const paneHeaders = (d.paneHeaders as string[] | undefined) ?? ["default"];
      const tierHeaders = (d.tierHeaders as string[] | undefined) ?? ["default"];
      const laneHeaders = (d.laneHeaders as string[] | undefined) ?? ["default"];
      d.scaleAxisLimits = computeScaleAxisLimitsFromValues(
        d.values as (number | undefined)[][][][][],
        paneHeaders.length,
        tierHeaders.length,
        laneHeaders.length,
      );
    }
  }
}

function transformLayoutNode(node: LayoutNode): void {
  // Block 3: Convert span from string → number (or delete if invalid)
  const nodeAny = node as Record<string, unknown>;
  if (typeof nodeAny.span === "string") {
    const parsed = Number(nodeAny.span);
    if (Number.isNaN(parsed)) {
      delete nodeAny.span;
    } else {
      nodeAny.span = parsed;
    }
  }

  // Block 6: Clamp numeric span to valid range 1-12
  if (typeof nodeAny.span === "number") {
    nodeAny.span = Math.max(1, Math.min(12, Math.round(nodeAny.span)));
  }

  if (node.type === "item" && node.data) {
    // Block 3: Convert "placeholder" → empty figure block
    if (node.data.type === "placeholder") {
      node.data = { type: "figure" };
    }
    // Block 4: Rename source.type "from_metric" → "from_data" and add snapshotAt
    if (
      node.data.type === "figure" &&
      node.data.source?.type === "from_metric"
    ) {
      node.data.source.type = "from_data";
      if (!node.data.source.snapshotAt) {
        node.data.source.snapshotAt = new Date().toISOString();
      }
    }
    // Block 5: Transform embedded PO configs in figure blocks
    if (
      node.data.type === "figure" &&
      node.data.source?.type === "from_data" &&
      node.data.source.config
    ) {
      node.data.source.config = transformPOConfigData(node.data.source.config);
    }
    if (node.data.type === "figure" && node.data.figureInputs) {
      transformFigureInputs(node.data.figureInputs);
    }
  } else if ((node.type === "rows" || node.type === "cols") && node.children) {
    for (const child of node.children) {
      transformLayoutNode(child);
    }
  }
}

export async function migrateSlideConfigs(
  tx: Sql,
  _projectId: string,
): Promise<MigrationStats> {
  const rows = await tx<{ id: string; config: string }[]>`
    SELECT id, config FROM slides
  `;
  const now = new Date().toISOString();
  let rowsTransformed = 0;

  for (const row of rows) {
    const config = JSON.parse(row.config);

    // =========================================================================
    // PRE-VALIDATION BLOCK A: One-time fix for missing scaleAxisLimits
    // Runs on ALL rows regardless of validation status.
    // TODO: DELETE THIS BLOCK after all instances have received this update
    // =========================================================================
    let preValidationChanged = false;
    if (config.type === "content" && config.layout) {
      const fixMissingScaleAxisLimits = (node: LayoutNode): void => {
        if (node.type === "item" && node.data?.type === "figure" && node.data.figureInputs) {
          const fi = node.data.figureInputs;
          for (const dataKey of ["timeseriesData", "chartData", "chartOHData"]) {
            const d = fi[dataKey] as Record<string, unknown> | undefined;
            if (!d || d.isTransformed !== true) continue;
            const scaleAxisLimits = d.scaleAxisLimits as { paneLimits?: unknown } | undefined;
            if (!scaleAxisLimits?.paneLimits && d.values) {
              const paneHeaders = (d.paneHeaders as string[] | undefined) ?? ["default"];
              const tierHeaders = (d.tierHeaders as string[] | undefined) ?? ["default"];
              const laneHeaders = (d.laneHeaders as string[] | undefined) ?? ["default"];
              d.scaleAxisLimits = computeScaleAxisLimitsFromValues(
                d.values as (number | undefined)[][][][][],
                paneHeaders.length,
                tierHeaders.length,
                laneHeaders.length,
              );
              preValidationChanged = true;
            }
          }
        } else if ((node.type === "rows" || node.type === "cols") && node.children) {
          for (const child of node.children) {
            fixMissingScaleAxisLimits(child);
          }
        }
      };
      fixMissingScaleAxisLimits(config.layout as LayoutNode);
    }
    // =========================================================================
    // END PRE-VALIDATION BLOCK A
    // =========================================================================

    // Already valid? Skip (unless pre-validation made changes).
    if (!preValidationChanged && slideConfigSchema.safeParse(config).success) {
      continue;
    }

    // Block 1: Rename "heading" → "header" in content slides
    if (config.type === "content" && config.heading !== undefined) {
      config.header = config.heading;
      delete config.heading;
    }

    // Block 2: Fix malformed layouts (missing type/id)
    if (config.type === "content" && config.layout && !config.layout.type) {
      config.layout = {
        type: "item",
        id: "a1a",
        data: { type: "text", markdown: "" },
      };
    }

    // Block 3+: Transform embedded PO configs in content slides
    if (config.type === "content" && config.layout) {
      transformLayoutNode(config.layout as LayoutNode);
    }

    // Block 8: Remove per-slide logo fields (now deck-level)
    if (config.type === "cover") {
      delete config.logos;
    }
    if (config.type === "content") {
      delete config.headerLogos;
      delete config.footerLogos;
    }

    const validated = slideConfigSchema.parse(config);

    await tx`
      UPDATE slides
      SET config = ${JSON.stringify(validated)}, last_updated = ${now}
      WHERE id = ${row.id}
    `;
    rowsTransformed++;
  }

  return { rowsChecked: rows.length, rowsTransformed };
}
