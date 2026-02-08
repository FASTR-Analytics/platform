// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { _GLOBAL_LAYOUT_COLUMNS, type RectCoordsDims } from "./deps.ts";
import { createColsNode, createRowsNode } from "./id.ts";
import { createCachedMeasurer, measureLayout } from "./measure.ts";
import { isMeasuredColsLayoutNode, isMeasuredRowsLayoutNode } from "./types.ts";
import type {
  ItemHeightMeasurer,
  ItemLayoutNode,
  LayoutNode,
  MeasuredLayoutNode,
} from "./types.ts";

const MAX_OPTIMIZER_ITEMS = 4;

export type LayoutStyleConfig = {
  gapX: number;
  gapY: number;
};

export type OptimizerConstraint = {
  type?: "rows" | "cols";
  colCount?: number;
};

export type OptimizerConfig = {
  constraint?: OptimizerConstraint;
  minSpan?: number;
  debug?: boolean;
};

export type LayoutScore = {
  overflow: number;
  shrinkPenalty: number;
  stretchPenalty: number;
  scalePenalty: number;
  heightImbalance: number;
  wastedSpace: number;
  total: number;
};

export type OptimizeResult<U> = {
  layout: LayoutNode<U>;
  measured: MeasuredLayoutNode<U>;
  score: LayoutScore;
};

// =============================================================================
// Span Combinations
// =============================================================================

function generateSpanCombinations(
  n: number,
  total: number,
  minSpan: number,
): number[][] {
  if (n === 1) return [[total]];

  const results: number[][] = [];

  function recurse(remaining: number, cols: number, current: number[]) {
    if (cols === 1) {
      if (remaining >= minSpan) {
        results.push([...current, remaining]);
      }
      return;
    }

    const maxForThis = remaining - (cols - 1) * minSpan;
    for (let span = minSpan; span <= maxForThis; span++) {
      recurse(remaining - span, cols - 1, [...current, span]);
    }
  }

  recurse(total, n, []);

  const mean = total / n;
  results.sort((a, b) => {
    const balanceA = a.reduce((sum, s) => sum + (s - mean) ** 2, 0);
    const balanceB = b.reduce((sum, s) => sum + (s - mean) ** 2, 0);
    return balanceA - balanceB;
  });

  return results;
}

// =============================================================================
// Exhaustive Layout Generation
// =============================================================================

function generatePartitions<T>(items: T[]): T[][][] {
  const n = items.length;
  if (n <= 1) return [];

  const results: T[][][] = [];
  const numDividers = n - 1;

  for (let mask = 1; mask < 1 << numDividers; mask++) {
    const partition: T[][] = [];
    let start = 0;

    for (let i = 0; i < numDividers; i++) {
      if (mask & (1 << i)) {
        partition.push(items.slice(start, i + 1));
        start = i + 1;
      }
    }
    partition.push(items.slice(start));

    results.push(partition);
  }

  return results;
}

function cartesianProduct<T>(arrays: T[][]): T[][] {
  if (arrays.length === 0) return [[]];
  if (arrays.length === 1) return arrays[0].map((x) => [x]);

  const result: T[][] = [];

  function recurse(index: number, current: T[]) {
    if (index === arrays.length) {
      result.push([...current]);
      return;
    }
    for (const item of arrays[index]) {
      current.push(item);
      recurse(index + 1, current);
      current.pop();
    }
  }

  recurse(0, []);
  return result;
}

function generateCandidatesExhaustive<U>(
  items: ItemLayoutNode<U>[],
  nColumns: number,
  minSpan: number,
  constraint?: OptimizerConstraint,
  insideCols: boolean = false,
): LayoutNode<U>[] {
  const n = items.length;

  if (n === 0) return [];

  if (n === 1) {
    return [createRowsNode([items[0]])];
  }

  if (insideCols) {
    return [];
  }

  const candidates: LayoutNode<U>[] = [];
  const allowRows = !constraint?.type || constraint.type === "rows";
  const allowCols = !constraint?.type || constraint.type === "cols";

  const partitions = generatePartitions(items);

  for (const partition of partitions) {
    const k = partition.length;

    const groupLayoutsForRows: LayoutNode<U>[][] = partition.map((group) =>
      generateCandidatesExhaustive(group, nColumns, minSpan, undefined, false)
    );

    if (allowRows) {
      const combinations = cartesianProduct(groupLayoutsForRows);
      for (const combo of combinations) {
        candidates.push(createRowsNode([...combo]));
      }
    }

    if (allowCols && k * minSpan <= nColumns) {
      const allSingleItems = partition.every((group) => group.length === 1);
      if (!allSingleItems) continue;

      if (constraint?.colCount && constraint.colCount !== k) {
        continue;
      }

      const spanCombinations = generateSpanCombinations(k, nColumns, minSpan);
      for (const spans of spanCombinations) {
        const colsChildren = partition.map((group, i) => ({
          ...createRowsNode([group[0]]),
          span: spans[i],
        }));
        candidates.push(createColsNode(colsChildren));
      }
    }
  }

  return candidates;
}

// =============================================================================
// Scoring
// =============================================================================

function scoreLayout<U>(
  measured: MeasuredLayoutNode<U>,
  bounds: RectCoordsDims,
  overflow: boolean,
  debug: boolean = false,
): LayoutScore {
  let shrinkPenalty = 0;
  let stretchPenalty = 0;
  let scalePenalty = 0;

  walkMeasuredItems(measured, (node) => {
    const actualH = node.rpd.h();
    const idealH = node.idealH;
    const maxH = node.maxH;
    if (actualH < idealH) {
      shrinkPenalty += idealH - actualH;
    } else if (actualH > idealH) {
      if (maxH < 10000) {
        stretchPenalty += actualH - idealH;
      }
    }

    let worstScale = 1.0;

    const widthScale = node.neededScalingToFitWidth;
    if (typeof widthScale === "number") {
      worstScale = Math.min(worstScale, widthScale);
    }

    let heightScale = 1.0;
    if (actualH < idealH) {
      heightScale = actualH / idealH;
      worstScale = Math.min(worstScale, heightScale);
    }

    if (debug && worstScale < 1.0) {
      console.log(
        `  Item w=${node.rpd.w().toFixed(0)} actualH=${
          actualH.toFixed(
            0,
          )
        } idealH=${idealH.toFixed(0)} ` +
          `widthScale=${
            typeof widthScale === "number" ? widthScale.toFixed(2) : "none"
          } ` +
          `heightScale=${heightScale.toFixed(2)} worstScale=${
            worstScale.toFixed(
              2,
            )
          }`,
      );
    }

    if (worstScale < 1.0) {
      const scaleDiff = 1.0 - worstScale;
      scalePenalty += scaleDiff * scaleDiff * 10000;
    }
  });

  const heightImbalance = calculateHeightImbalance(measured);

  const overflowPenalty = overflow ? 100 : 0;
  const totalIdealHeight = sumIdealHeights(measured);
  const wastedSpace = Math.max(0, bounds.h() - totalIdealHeight);

  const total = overflowPenalty * 1000 +
    shrinkPenalty * 10 +
    stretchPenalty * 5 +
    scalePenalty * 8 +
    heightImbalance * 2;

  return {
    overflow: overflowPenalty,
    shrinkPenalty,
    stretchPenalty,
    scalePenalty,
    heightImbalance,
    wastedSpace,
    total,
  };
}

function calculateHeightImbalance<U>(node: MeasuredLayoutNode<U>): number {
  let totalImbalance = 0;

  if (isMeasuredColsLayoutNode(node)) {
    const children = node.children as MeasuredLayoutNode<U>[];
    const heights = children.map((child) => child.rpd.h());
    if (heights.length >= 2) {
      const maxH = Math.max(...heights);
      const minH = Math.min(...heights);
      totalImbalance += maxH - minH;
    }
    for (const child of children) {
      totalImbalance += calculateHeightImbalance(child);
    }
  } else if (isMeasuredRowsLayoutNode(node)) {
    const children = node.children as MeasuredLayoutNode<U>[];
    for (const child of children) {
      totalImbalance += calculateHeightImbalance(child);
    }
  }

  return totalImbalance;
}

type MeasuredItemWithIdeal<U> = MeasuredLayoutNode<U> & {
  type: "item";
  idealH: number;
  maxH: number;
  neededScalingToFitWidth?: "none" | number;
};

function walkMeasuredItems<U>(
  node: MeasuredLayoutNode<U>,
  callback: (node: MeasuredItemWithIdeal<U>) => void,
): void {
  if (node.type === "item") {
    callback(node as MeasuredItemWithIdeal<U>);
  } else {
    for (const child of node.children) {
      walkMeasuredItems(child, callback);
    }
  }
}

function sumIdealHeights<U>(node: MeasuredLayoutNode<U>): number {
  let total = 0;
  walkMeasuredItems(node, (item) => {
    total += item.idealH;
  });
  return total;
}

// =============================================================================
// Debug Helpers
// =============================================================================

function layoutToString<U>(node: LayoutNode<U>): string {
  if (node.type === "item") {
    return `item(${node.id})`;
  }
  if (node.type === "rows") {
    return `rows([${node.children.map(layoutToString).join(", ")}])`;
  }
  const spans = node.children.map((c) => c.span ?? "?").join(",");
  return `cols[${spans}]([${node.children.map(layoutToString).join(", ")}])`;
}

// =============================================================================
// Main Optimizer
// =============================================================================

export function optimizeLayout<T, U>(
  ctx: T,
  items: ItemLayoutNode<U>[],
  bounds: RectCoordsDims,
  style: LayoutStyleConfig,
  itemMeasurer: ItemHeightMeasurer<T, U>,
  layoutTransform?: (layout: LayoutNode<U>) => LayoutNode<U>,
  config?: OptimizerConfig,
): OptimizeResult<U> {
  if (items.length > MAX_OPTIMIZER_ITEMS) {
    throw new Error(
      `Optimizer supports at most ${MAX_OPTIMIZER_ITEMS} items, got ${items.length}. ` +
        `Use layoutType: "explicit" for more complex layouts.`,
    );
  }

  const nColumns = _GLOBAL_LAYOUT_COLUMNS;
  const { gapX, gapY } = style;
  const minSpan = config?.minSpan ?? 1;
  const debug = config?.debug ?? false;
  const transform = layoutTransform ?? ((l) => l);

  const cachedMeasurer = createCachedMeasurer(itemMeasurer);

  const candidates = generateCandidatesExhaustive(
    items,
    nColumns,
    minSpan,
    config?.constraint,
  );

  if (candidates.length === 0) {
    const fallback = transform(createRowsNode<U>([]));
    const result = measureLayout(
      ctx,
      fallback,
      bounds,
      gapX,
      gapY,
      cachedMeasurer,
    );
    return {
      layout: fallback,
      measured: result.measured,
      score: {
        overflow: 0,
        shrinkPenalty: 0,
        stretchPenalty: 0,
        scalePenalty: 0,
        heightImbalance: 0,
        wastedSpace: bounds.h(),
        total: bounds.h(),
      },
    };
  }

  let bestLayout: LayoutNode<U> = transform(candidates[0]);
  let bestMeasured: MeasuredLayoutNode<U> | null = null;
  let bestScore: LayoutScore = {
    overflow: Infinity,
    shrinkPenalty: 0,
    stretchPenalty: 0,
    scalePenalty: 0,
    heightImbalance: 0,
    wastedSpace: 0,
    total: Infinity,
  };

  const debugScores: { layout: string; score: LayoutScore }[] = [];

  for (const candidate of candidates) {
    const transformed = transform(candidate);
    const result = measureLayout(
      ctx,
      transformed,
      bounds,
      gapX,
      gapY,
      cachedMeasurer,
    );
    const score = scoreLayout(result.measured, bounds, result.overflow, debug);

    if (debug) {
      debugScores.push({ layout: layoutToString(transformed), score });
    }

    if (score.total < bestScore.total) {
      bestLayout = transformed;
      bestMeasured = result.measured;
      bestScore = score;
    }

    if (score.total === 0) break;
  }

  if (debug) {
    debugScores.sort((a, b) => a.score.total - b.score.total);
    console.log(`\n=== Optimizer Debug (${candidates.length} candidates) ===`);
    for (const { layout, score } of debugScores.slice(0, 10)) {
      console.log(
        `  ${
          score.total
            .toFixed(0)
            .padStart(
              6,
            )
        } | overflow=${score.overflow} shrink=${
          score.shrinkPenalty.toFixed(
            0,
          )
        } stretch=${score.stretchPenalty.toFixed(0)} scale=${
          score.scalePenalty.toFixed(
            0,
          )
        } imbal=${score.heightImbalance.toFixed(0)} waste=${
          score.wastedSpace.toFixed(
            0,
          )
        } | ${layout}`,
      );
    }
    console.log(`=== Best: ${layoutToString(bestLayout)} ===\n`);
  }

  return {
    layout: bestLayout,
    measured: bestMeasured!,
    score: bestScore,
  };
}
