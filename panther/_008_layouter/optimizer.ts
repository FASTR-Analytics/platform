// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { RectCoordsDims } from "./deps.ts";
import { createColsNode, createRowsNode } from "./id.ts";
import { measureLayout } from "./measure.ts";
import {
  isMeasuredColsLayoutNode,
  isMeasuredRowsLayoutNode,
} from "./types.ts";
import type {
  HeightConstraints,
  ItemHeightMeasurer,
  ItemLayoutNode,
  LayoutNode,
  MeasuredLayoutNode,
} from "./types.ts";

const MAX_OPTIMIZER_ITEMS = 4;

export type LayoutStyleConfig = {
  gapX: number;
  gapY: number;
  nColumns: number;
};

export type OptimizerConstraint = {
  type?: "rows" | "cols";
  colCount?: number;
};

export type OptimizerConfig = {
  constraint?: OptimizerConstraint;
  minSpan?: number; // Minimum span for columns (default: 4)
  debug?: boolean; // Print debug info about scoring
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
  total: number = 12,
  minSpan: number = 2,
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

  // Sort by balance (most balanced first)
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

// Generate all contiguous partitions of items into 2+ groups
function generatePartitions<T>(items: T[]): T[][][] {
  const n = items.length;
  if (n <= 1) return [];

  const results: T[][][] = [];
  const numDividers = n - 1;

  // Each bit pattern represents where to place dividers
  // Skip 0 (no dividers = would be single group)
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

// Cartesian product of arrays
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

// Recursively generate all possible layouts for a set of items
// insideCols: if true, we're generating children for a cols container
//   - cols children must be single items wrapped in rows (no nested containers)
//   - this prevents both nested cols AND rows-inside-cols that compress items
function generateCandidatesExhaustive<U>(
  items: ItemLayoutNode<U>[],
  minSpan: number,
  constraint?: OptimizerConstraint,
  insideCols: boolean = false,
): LayoutNode<U>[] {
  const n = items.length;

  if (n === 0) return [];

  // Base case: single item - wrap in rows
  if (n === 1) {
    return [createRowsNode([items[0]])];
  }

  // If we're inside cols, each "group" must be a single item
  // This prevents stacking items inside a column (which compresses them)
  if (insideCols) {
    // Only valid layout: all items as separate cols children
    // Return a single rows node containing all items (will be cols children)
    // Actually, for cols children, each child should be a single item
    // The caller will handle wrapping in cols
    return [];
  }

  const candidates: LayoutNode<U>[] = [];
  const allowRows = !constraint?.type || constraint.type === "rows";
  const allowCols = !constraint?.type || constraint.type === "cols";

  // Get all partitions (splits into 2+ groups)
  const partitions = generatePartitions(items);

  for (const partition of partitions) {
    const k = partition.length;

    // For rows: children can have any structure
    const groupLayoutsForRows: LayoutNode<U>[][] = partition.map((group) =>
      generateCandidatesExhaustive(group, minSpan, undefined, false)
    );

    // Generate rows combinations
    if (allowRows) {
      const combinations = cartesianProduct(groupLayoutsForRows);
      for (const combo of combinations) {
        candidates.push(createRowsNode([...combo]));
      }
    }

    // For cols: each partition group must be exactly 1 item
    // This means cols can only directly contain items, not nested structures
    if (allowCols && k * minSpan <= 12) {
      const allSingleItems = partition.every((group) => group.length === 1);
      if (!allSingleItems) continue;

      // Check if constraint specifies colCount
      if (constraint?.colCount && constraint.colCount !== k) {
        continue;
      }

      const spanCombinations = generateSpanCombinations(k, 12, minSpan);
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
      // Only penalize stretch for items with bounded maxH (can't visually fill)
      // Items with very large maxH (like charts) look fine when stretched
      if (maxH < 10000) {
        stretchPenalty += actualH - idealH;
      }
    }

    // Penalize width scaling (items that had to shrink to fit width)
    const scale = node.neededScalingToFitWidth;
    if (typeof scale === "number" && scale < 1.0) {
      scalePenalty += (1.0 - scale) * 100;
    }
  });

  const heightImbalance = calculateHeightImbalance(measured);

  const overflowPenalty = overflow ? 100 : 0;
  const wastedSpace = Math.max(0, bounds.h() - measured.rpd.h());

  const total =
    overflowPenalty * 1000 +
    shrinkPenalty * 10 +
    stretchPenalty * 5 +
    scalePenalty * 8 +
    heightImbalance * 2 +
    wastedSpace;

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

// =============================================================================
// Measurement Cache
// =============================================================================

function createCachedMeasurer<T, U>(
  itemMeasurer: ItemHeightMeasurer<T, U>,
): ItemHeightMeasurer<T, U> {
  const cache = new Map<string, HeightConstraints>();

  return (ctx: T, node: ItemLayoutNode<U>, width: number): HeightConstraints => {
    const key = `${node.id}:${width.toFixed(1)}`;
    const cached = cache.get(key);
    if (cached) {
      return cached;
    }
    const result = itemMeasurer(ctx, node, width);
    cache.set(key, result);
    return result;
  };
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
  // cols
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
  // Error if too many items
  if (items.length > MAX_OPTIMIZER_ITEMS) {
    throw new Error(
      `Optimizer supports at most ${MAX_OPTIMIZER_ITEMS} items, got ${items.length}. ` +
        `Use layoutType: "explicit" for more complex layouts.`,
    );
  }

  const { gapX, gapY, nColumns } = style;
  const minSpan = config?.minSpan ?? 4;
  const debug = config?.debug ?? false;
  const transform = layoutTransform ?? ((l) => l);

  // Create cached measurer
  const cachedMeasurer = createCachedMeasurer(itemMeasurer);

  // Generate all candidate layouts
  const candidates = generateCandidatesExhaustive(
    items,
    minSpan,
    config?.constraint,
  );

  if (candidates.length === 0) {
    // Fallback: single rows node with no children
    const fallback = transform(createRowsNode<U>([]));
    const result = measureLayout(
      ctx,
      fallback,
      bounds,
      gapX,
      gapY,
      cachedMeasurer,
      nColumns,
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
      nColumns,
    );
    const score = scoreLayout(result.measured, bounds, result.overflow);

    if (debug) {
      debugScores.push({ layout: layoutToString(transformed), score });
    }

    if (score.total < bestScore.total) {
      bestLayout = transformed;
      bestMeasured = result.measured;
      bestScore = score;
    }

    // Early exit on perfect score
    if (score.total === 0) break;
  }

  if (debug) {
    debugScores.sort((a, b) => a.score.total - b.score.total);
    console.log(`\n=== Optimizer Debug (${candidates.length} candidates) ===`);
    for (const { layout, score } of debugScores.slice(0, 10)) {
      console.log(
        `  ${score.total.toFixed(0).padStart(6)} | overflow=${score.overflow} shrink=${score.shrinkPenalty.toFixed(0)} stretch=${score.stretchPenalty.toFixed(0)} scale=${score.scalePenalty.toFixed(0)} imbal=${score.heightImbalance.toFixed(0)} waste=${score.wastedSpace.toFixed(0)} | ${layout}`,
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
