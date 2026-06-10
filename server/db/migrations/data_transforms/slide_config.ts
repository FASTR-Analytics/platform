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
// 10. (Re)compute scaleAxisLimits from values when missing OR wrong-length
//     (truncated tierLimits/laneLimits → overflow); includes chartOHData
// 11. Convert text block style.textSize number → semantic key
// 12. Normalize figureInputs string[] headers → HeaderItem[] ({ id, label })
//
// PRE-VALIDATION BLOCK (runs on ALL rows):
// A. One-time force of the figureInputs migration (Blocks 9/10/12). Needed
//    because the skip gate validates figureInputs as z.unknown(), so figure
//    drift is invisible to it. DELETE AFTER ALL INSTANCES UPDATED
//
// =============================================================================

import { slideConfigSchema, TEXT_SIZE_KEYS, TEXT_SIZE_REL } from "lib";
import type { TextSizeKey } from "lib";
import type { Sql } from "postgres";
import {
  transformFigureBlock,
  transformFigureInputs,
} from "./_figure_block.ts";
import {
  type MigrationStats,
  rawJsonNeedsForcedTransform,
} from "./po_config.ts";

// Map an old numeric textSize multiplier to the nearest semantic key.
// Old data stored the raw relFontSize numbers (0.41, 1, 1.56, …); the new shape
// stores the key and resolves the number at render time via TEXT_SIZE_REL.
function relToTextSizeKey(value: number): TextSizeKey {
  let closest: TextSizeKey = "m";
  let minDiff = Infinity;
  for (const key of TEXT_SIZE_KEYS) {
    const diff = Math.abs(TEXT_SIZE_REL[key] - value);
    if (diff < minDiff) {
      minDiff = diff;
      closest = key;
    }
  }
  return closest;
}

export type { MigrationStats };

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

// ONE-TIME PRE-VALIDATION helper: force the figureInputs migration on every
// figure block in a layout, returning whether anything changed. Needed because
// the skip gate in migrateSlideConfigs validates against slideConfigSchema,
// which treats figureInputs as z.unknown() — so figureInputs drift (old
// yScaleAxisData / missing scaleAxisLimits) is invisible to it and would
// otherwise never get transformed. DELETE after all instances are updated.
function forceMigrateFigureInputs(node: LayoutNode): boolean {
  if (
    node.type === "item" &&
    node.data?.type === "figure" &&
    node.data.figureInputs
  ) {
    const before = JSON.stringify(node.data.figureInputs);
    transformFigureInputs(node.data.figureInputs);
    return JSON.stringify(node.data.figureInputs) !== before;
  }
  if ((node.type === "rows" || node.type === "cols") && node.children) {
    let changed = false;
    for (const child of node.children) {
      if (forceMigrateFigureInputs(child)) changed = true;
    }
    return changed;
  }
  return false;
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
    // Blocks 4/5/9/10/12: figure-block transforms (source rename + snapshotAt,
    // embedded PO config, figureInputs normalization) — shared with the
    // dashboard/report sweeps via _figure_block.ts.
    if (node.data.type === "figure") {
      transformFigureBlock(node.data);
    }
    // Block 11: Convert text block style.textSize number → semantic key
    if (node.data.type === "text") {
      const style = (node.data as Record<string, unknown>).style as
        | { textSize?: unknown }
        | undefined;
      if (style && typeof style.textSize === "number") {
        style.textSize = relToTextSizeKey(style.textSize);
      }
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
    const storedCanonical = JSON.stringify(config);

    // =========================================================================
    // PRE-VALIDATION BLOCK A: One-time force of the figureInputs migration.
    // Runs on ALL rows regardless of validation status, because the skip gate
    // below validates against slideConfigSchema, which treats figureInputs as
    // z.unknown() — so stale figureInputs (old yScaleAxisData / missing
    // scaleAxisLimits) pass validation and would otherwise never be transformed.
    // TODO: DELETE THIS BLOCK after all instances have received this update.
    // =========================================================================
    let preValidationChanged = false;
    if (config.type === "content" && config.layout) {
      preValidationChanged = forceMigrateFigureInputs(
        config.layout as LayoutNode,
      );
    }

    // Already valid? Skip (unless pre-validation made changes, or legacy keys
    // — which safeParse silently strips — still need the embedded-config
    // rename).
    if (
      !preValidationChanged &&
      slideConfigSchema.safeParse(config).success &&
      !rawJsonNeedsForcedTransform(row.config)
    ) {
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

    // Output identical to stored (e.g. a forced-scan false positive)? Skip the
    // write so the row doesn't churn last_updated on every boot.
    const out = JSON.stringify(validated);
    if (out === storedCanonical) {
      continue;
    }

    await tx`
      UPDATE slides
      SET config = ${out}, last_updated = ${now}
      WHERE id = ${row.id}
    `;
    rowsTransformed++;
  }

  return { rowsChecked: rows.length, rowsTransformed };
}
