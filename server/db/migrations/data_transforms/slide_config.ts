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
// SKIP GATE: figureBlockSchema validates figureInputs against panther's
// zFigureInputs (lib/types figureInputsSchema), so the plain safeParse gate sees
// figureInputs drift: old-shape blobs fail → the transform runs precisely on
// those rows, and a row still stale after the transform aborts startup at the
// final parse. (Replaced the one-time PRE-VALIDATION force block, deleted
// 2026-06.)
//
// =============================================================================

import { slideConfigSchema, TEXT_SIZE_KEYS, TEXT_SIZE_REL } from "lib";
import type { TextSizeKey } from "lib";
import type { Sql } from "postgres";
import {
  type FigureLocalizationForTransform,
  transformFigureBlock,
  transformFigureBlockToBundle,
  warnIfFigureInputsStale,
  getTransformLocalization,
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

// Collect every figure block's figureInputs in a layout tree (read-only) so
// the skip gate can check them against panther's zFigureInputs.
function collectFigureInputs(
  node: LayoutNode,
  out: Record<string, unknown>[],
): void {
  if (
    node.type === "item" &&
    node.data?.type === "figure" &&
    node.data.figureInputs
  ) {
    out.push(node.data.figureInputs);
  }
  if ((node.type === "rows" || node.type === "cols") && node.children) {
    for (const child of node.children) {
      collectFigureInputs(child, out);
    }
  }
}

function getFigureInputsInConfig(
  config: Record<string, unknown>,
): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  if (config.type === "content" && config.layout) {
    collectFigureInputs(config.layout as LayoutNode, out);
  }
  return out;
}

function transformLayoutNode(node: LayoutNode, localization: FigureLocalizationForTransform): void {
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
      transformFigureBlockToBundle(node.data, localization, null);
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
      transformLayoutNode(child, localization);
    }
  }
}

export async function migrateSlideConfigs(
  tx: Sql,
  _projectId: string,
): Promise<MigrationStats> {
  // countryIso3 not available in project-DB context; "" is correct for all
  // non-Nigeria instances. Nigeria render still works: buildFigureInputs reads
  // localization from the bundle, which captures the real value on new captures.
  const localization = getTransformLocalization("");

  const rows = await tx<{ id: string; config: string }[]>`
    SELECT id, config FROM slides
  `;
  const now = new Date().toISOString();
  let rowsTransformed = 0;

  for (const row of rows) {
    const config = JSON.parse(row.config);
    const storedCanonical = JSON.stringify(config);

    // Already valid? Skip — unless legacy keys (which safeParse silently
    // strips) still need the embedded-config rename. figureInputs drift is
    // covered by this same safeParse: figureBlockSchema validates figureInputs
    // against panther's zFigureInputs (lib/types figureInputsSchema).
    if (
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
      transformLayoutNode(config.layout as LayoutNode, localization);
    }

    // Block 8: Remove per-slide logo fields (now deck-level)
    if (config.type === "cover") {
      delete config.logos;
    }
    if (config.type === "content") {
      delete config.headerLogos;
      delete config.footerLogos;
    }

    // P2: figureInputs removed by transformFigureBlockToBundle; nothing to warn.

    // Throws if the row is still invalid after every transform (including
    // figureInputs drift the upgrader does not fix) — the runner then refuses
    // to start the server. The warn above names the offending figure block.
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
