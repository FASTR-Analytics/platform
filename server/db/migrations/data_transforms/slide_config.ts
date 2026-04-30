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
    source?: { type: string; config?: Record<string, unknown>; snapshotAt?: string };
  };
  children?: LayoutNode[];
};

// Block 9: Migrate figureInputs from old panther schema
// - yScaleAxisData.tierHeaders → top-level tierHeaders (if missing)
// - yScaleAxisData → scaleAxisLimits (with added laneLimits)
// - yScaleAxisData.yScaleAxisLabel → top-level yScaleAxisLabel
function transformFigureInputs(fi: Record<string, unknown>): void {
  for (const dataKey of ["timeseriesData", "chartData"]) {
    const d = fi[dataKey] as Record<string, unknown> | undefined;
    if (!d || d.isTransformed !== true) continue;

    const needsTierHeaders = !d.tierHeaders;
    const yScaleAxisData = d.yScaleAxisData as Record<string, unknown> | undefined;
    const needsScaleAxisLimits = !d.scaleAxisLimits && yScaleAxisData;

    if (!needsTierHeaders && !needsScaleAxisLimits) continue;

    if (needsTierHeaders) {
      const oldTierHeaders = yScaleAxisData?.tierHeaders as string[] | undefined;
      d.tierHeaders = oldTierHeaders ?? ["default"];
    }

    if (needsScaleAxisLimits && yScaleAxisData) {
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

    // Clean up old field
    delete d.yScaleAxisData;
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
    if (node.data.type === "figure" && node.data.source?.type === "from_metric") {
      node.data.source.type = "from_data";
      if (!node.data.source.snapshotAt) {
        node.data.source.snapshotAt = new Date().toISOString();
      }
    }
    // Block 5: Transform embedded PO configs in figure blocks
    if (node.data.type === "figure" && node.data.source?.type === "from_data" && node.data.source.config) {
      node.data.source.config = transformPOConfigData(node.data.source.config);
    }
    // Block 9: Migrate figureInputs yScaleAxisData → scaleAxisLimits
    if (node.data.type === "figure" && node.data.figureInputs) {
      transformFigureInputs(node.data.figureInputs);
    }
  } else if ((node.type === "rows" || node.type === "cols") && node.children) {
    for (const child of node.children) {
      transformLayoutNode(child);
    }
  }
}

export async function migrateSlideConfigs(tx: Sql, _projectId: string): Promise<MigrationStats> {
  const rows = await tx<{ id: string; config: string }[]>`
    SELECT id, config FROM slides
  `;
  const now = new Date().toISOString();
  let rowsTransformed = 0;

  for (const row of rows) {
    const config = JSON.parse(row.config);

    // Already valid? Skip.
    if (slideConfigSchema.safeParse(config).success) {
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
