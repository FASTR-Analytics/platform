// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { _GLOBAL_LAYOUT_COLUMNS, type RectCoordsDims } from "./deps.ts";
import { createColsNode, createRowsNode } from "./id.ts";
import { measureLayout } from "./measure.ts";
import {
  isMeasuredColsLayoutNode,
  isMeasuredItemLayoutNode,
  isMeasuredRowsLayoutNode,
} from "./types.ts";
import type {
  ItemHeightMeasurer,
  ItemLayoutNode,
  LayoutNode,
  MeasuredItemLayoutNode,
  MeasuredLayoutNode,
  ResolvedContainerStyle,
} from "./types.ts";

const MAX_OPTIMIZER_ITEMS = 4;

export type LayoutStyleConfig = {
  gapX: number;
  gapY: number;
  containerDefaults?: ResolvedContainerStyle;
  alreadyScaledValue?: number;
};

export type OptimizerConstraint = {
  type?: "rows" | "cols";
  colCount?: number;
};

export type OptimizerConfig = {
  constraint?: OptimizerConstraint;
  minSpan?: number;
};

export type LayoutScore = {
  overflow: 0 | 1;
  shrinkPenalty: number;
  stretchPenalty: number;
  scalePenalty: number;
  heightImbalance: number;
  wastedSpace: number;
};

export type ScoredLayout<U> = {
  layout: LayoutNode<U>;
  measured: MeasuredLayoutNode<U>;
  score: LayoutScore;
};

export type LayoutScoreWeights = {
  overflow?: number;
  shrinkPenalty?: number;
  stretchPenalty?: number;
  scalePenalty?: number;
  heightImbalance?: number;
  wastedSpace?: number;
};

const DEFAULT_WEIGHTS: Required<LayoutScoreWeights> = {
  overflow: 100_000,
  shrinkPenalty: 10,
  stretchPenalty: 5,
  scalePenalty: 8,
  heightImbalance: 2,
  wastedSpace: 0,
};

// =============================================================================
// Phase 1: Generate Candidates
// =============================================================================

export function generateCandidates<U>(
  items: ItemLayoutNode<U>[],
  config?: OptimizerConfig,
): LayoutNode<U>[] {
  if (items.length > MAX_OPTIMIZER_ITEMS) {
    throw new Error(
      `Optimizer supports at most ${MAX_OPTIMIZER_ITEMS} items, got ${items.length}. ` +
        `Use an explicit layout for more complex layouts.`,
    );
  }

  const nColumns = _GLOBAL_LAYOUT_COLUMNS;
  const minSpan = config?.minSpan ?? 1;

  return generateCandidatesExhaustive(
    items,
    nColumns,
    minSpan,
    config?.constraint,
  );
}

// =============================================================================
// Phase 2: Score Layouts
// =============================================================================

export function scoreLayouts<T, U>(
  ctx: T,
  candidates: LayoutNode<U>[],
  bounds: RectCoordsDims,
  style: LayoutStyleConfig,
  itemMeasurer: ItemHeightMeasurer<T, U>,
): ScoredLayout<U>[] {
  return candidates.map((candidate) => {
    const result = measureLayout(ctx, candidate, bounds, style, itemMeasurer);
    const score = scoreOneMeasured(result.measured, bounds, result.overflow);
    return { layout: candidate, measured: result.measured, score };
  });
}

// =============================================================================
// Phase 3: Pick Best
// =============================================================================

export function computeWeightedScore(
  score: LayoutScore,
  weights?: LayoutScoreWeights,
): number {
  const w = { ...DEFAULT_WEIGHTS, ...weights };
  return score.overflow * w.overflow +
    score.shrinkPenalty * w.shrinkPenalty +
    score.stretchPenalty * w.stretchPenalty +
    score.scalePenalty * w.scalePenalty +
    score.heightImbalance * w.heightImbalance +
    score.wastedSpace * w.wastedSpace;
}

export function pickBestLayout<U>(
  scored: ScoredLayout<U>[],
  weights?: LayoutScoreWeights,
): ScoredLayout<U> {
  let best = scored[0];
  let bestTotal = computeWeightedScore(best.score, weights);
  for (let i = 1; i < scored.length; i++) {
    const total = computeWeightedScore(scored[i].score, weights);
    if (total < bestTotal) {
      best = scored[i];
      bestTotal = total;
    }
  }
  return best;
}

// =============================================================================
// Convenience wrapper (all three phases)
// =============================================================================

export function optimizeLayout<T, U>(
  ctx: T,
  items: ItemLayoutNode<U>[],
  bounds: RectCoordsDims,
  style: LayoutStyleConfig,
  itemMeasurer: ItemHeightMeasurer<T, U>,
  config?: OptimizerConfig,
): ScoredLayout<U> {
  const candidates = generateCandidates(items, config);

  if (candidates.length === 0) {
    const fallback = createRowsNode<U>([]);
    const result = measureLayout(ctx, fallback, bounds, style, itemMeasurer);
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
      },
    };
  }

  const scored = scoreLayouts(ctx, candidates, bounds, style, itemMeasurer);
  return pickBestLayout(scored);
}

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
// Internal Scoring
// =============================================================================

function scoreOneMeasured<U>(
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

    if (worstScale < 1.0) {
      const scaleDiff = 1.0 - worstScale;
      scalePenalty += scaleDiff * scaleDiff * 10000;
    }
  });

  const heightImbalance = calculateHeightImbalance(measured);

  const totalIdealHeight = sumIdealHeights(measured);
  const wastedSpace = Math.max(0, bounds.h() - totalIdealHeight);

  return {
    overflow: overflow ? 1 : 0,
    shrinkPenalty,
    stretchPenalty,
    scalePenalty,
    heightImbalance,
    wastedSpace,
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

function walkMeasuredItems<U>(
  node: MeasuredLayoutNode<U>,
  callback: (node: MeasuredItemLayoutNode<U>) => void,
): void {
  if (isMeasuredItemLayoutNode(node)) {
    callback(node);
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
