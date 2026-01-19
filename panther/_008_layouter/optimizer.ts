// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { RectCoordsDims } from "./deps.ts";
import { createColsNode, createRowsNode } from "./id.ts";
import { measureLayout } from "./measure.ts";
import type {
  ItemHeightMeasurer,
  ItemLayoutNode,
  LayoutNode,
  LayoutWarning,
  MeasuredLayoutNode,
} from "./types.ts";

export type OptimizerConfig = {
  maxCols?: number;
  spanConfigs?: number[][];
};

export type LayoutScore = {
  overflow: number;
  shrinkPenalty: number;
  stretchPenalty: number;
  wastedSpace: number;
  total: number;
};

export type OptimizeResult<U> = {
  layout: LayoutNode<U>;
  measured: MeasuredLayoutNode<U>;
  score: LayoutScore;
};

const DEFAULT_SPAN_CONFIGS: Record<number, number[][]> = {
  2: [[6, 6], [4, 8], [8, 4], [3, 9], [9, 3]],
  3: [[4, 4, 4], [6, 3, 3], [3, 6, 3], [3, 3, 6]],
  4: [[3, 3, 3, 3], [4, 4, 2, 2], [2, 2, 4, 4]],
};

function generateCandidates<U>(
  items: ItemLayoutNode<U>[],
  config?: OptimizerConfig,
): LayoutNode<U>[] {
  const candidates: LayoutNode<U>[] = [];
  const maxCols = config?.maxCols ?? 4;
  const n = items.length;

  if (n === 0) return candidates;

  // Single column - all items stacked vertically
  candidates.push(createRowsNode([...items]));

  // Single row - all items side-by-side (if within maxCols)
  if (n <= maxCols) {
    const spanConfigs = config?.spanConfigs ?? DEFAULT_SPAN_CONFIGS[n] ??
      [[Math.floor(12 / n)]];
    for (const spans of spanConfigs) {
      if (spans.length === n) {
        const children = items.map((item, i) => ({
          ...item,
          span: spans[i],
        }));
        candidates.push(createColsNode(children));
      }
    }
  }

  // Two rows - split at each position
  if (n >= 2 && n <= maxCols * 2) {
    for (let split = 1; split < n; split++) {
      const topItems = items.slice(0, split);
      const bottomItems = items.slice(split);

      // Skip if either row would exceed maxCols
      if (topItems.length > maxCols || bottomItems.length > maxCols) continue;

      // Equal spans for simplicity
      const topSpan = Math.floor(12 / topItems.length);
      const bottomSpan = Math.floor(12 / bottomItems.length);

      const topChildren = topItems.map((item) => ({ ...item, span: topSpan }));
      const bottomChildren = bottomItems.map((item) => ({
        ...item,
        span: bottomSpan,
      }));

      candidates.push(
        createRowsNode([
          createColsNode(topChildren),
          createColsNode(bottomChildren),
        ]),
      );
    }
  }

  return candidates;
}

function scoreLayout<U>(
  measured: MeasuredLayoutNode<U>,
  bounds: RectCoordsDims,
  warnings: LayoutWarning[],
): LayoutScore {
  let shrinkPenalty = 0;
  let stretchPenalty = 0;

  walkMeasuredItems(measured, (node) => {
    const actualH = node.rpd.h();
    const idealH = node.idealH;
    if (actualH < idealH) {
      shrinkPenalty += idealH - actualH;
    } else if (actualH > idealH) {
      stretchPenalty += actualH - idealH;
    }
  });

  const overflow = warnings.filter((w) => w.type === "HEIGHT_OVERFLOW").length *
    100;
  const wastedSpace = Math.max(0, bounds.h() - measured.rpd.h());

  const total = overflow * 1000 + shrinkPenalty * 10 + stretchPenalty * 5 +
    wastedSpace;

  return {
    overflow,
    shrinkPenalty,
    stretchPenalty,
    wastedSpace,
    total,
  };
}

function walkMeasuredItems<U>(
  node: MeasuredLayoutNode<U>,
  callback: (
    node: MeasuredLayoutNode<U> & { type: "item"; idealH: number },
  ) => void,
): void {
  if (node.type === "item") {
    callback(node as MeasuredLayoutNode<U> & { type: "item"; idealH: number });
  } else {
    for (const child of node.children) {
      walkMeasuredItems(child, callback);
    }
  }
}

export function optimizeLayout<T, U>(
  ctx: T,
  items: ItemLayoutNode<U>[],
  bounds: RectCoordsDims,
  gapX: number,
  gapY: number,
  nColumns: number,
  itemMeasurer: ItemHeightMeasurer<T, U>,
  config?: OptimizerConfig,
): OptimizeResult<U> {
  const candidates = generateCandidates(items, config);

  if (candidates.length === 0) {
    // Fallback: single rows node with no children
    const fallback = createRowsNode<U>([]);
    const result = measureLayout(
      ctx,
      fallback,
      bounds,
      gapX,
      gapY,
      itemMeasurer,
      nColumns,
    );
    return {
      layout: fallback,
      measured: result.measured,
      score: {
        overflow: 0,
        shrinkPenalty: 0,
        stretchPenalty: 0,
        wastedSpace: bounds.h(),
        total: bounds.h(),
      },
    };
  }

  // Pre-compute idealH for each item at its expected width
  // For now, we'll compute during scoring since width varies by layout

  let bestLayout: LayoutNode<U> = candidates[0];
  let bestMeasured: MeasuredLayoutNode<U> | null = null;
  let bestScore: LayoutScore = {
    overflow: Infinity,
    shrinkPenalty: 0,
    stretchPenalty: 0,
    wastedSpace: 0,
    total: Infinity,
  };

  for (const candidate of candidates) {
    const result = measureLayout(
      ctx,
      candidate,
      bounds,
      gapX,
      gapY,
      itemMeasurer,
      nColumns,
    );
    const score = scoreLayout(result.measured, bounds, result.warnings);

    if (score.total < bestScore.total) {
      bestLayout = candidate;
      bestMeasured = result.measured;
      bestScore = score;
    }

    // Early exit on perfect score
    if (score.total === 0) break;
  }

  return {
    layout: bestLayout,
    measured: bestMeasured!,
    score: bestScore,
  };
}
