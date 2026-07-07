// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { PlacementPass } from "./types.ts";

// layer-balance (DOC_VIZGRAPH_PLACEMENT.md): align the layers' centers of
// gravity with the layout's global center — the lv4 `layerAlignment=0.5`
// look — via RIGID per-layer shifts δₗ, so in-layer order and gaps hold by
// construction. δ minimizes
//   Σ_segments w (y_u + δ_{l(u)} − y_v − δ_{l(v)})²          (straightness)
// + λ Σ_layers m_l (c_l + δ_l − C)²                          (centering)
// Proper segments couple only adjacent layers → symmetric tridiagonal
// system, solved in closed form (Thomas algorithm). Deterministic.

export type LayerBalanceParams = {
  // Centering strength relative to per-segment straightness weight. Modest
  // by design: attachments should win locally; balance is the baseline pull.
  lambda: number;
  // Backward-edge chain segments barely resist layer shifts — a feedback
  // edge's bends are fine; it must not anchor the composition.
  backwardSegmentWeight: number;
  // Straightness hold: a segment that is currently straight is EXPENSIVE to
  // break (balance must spend its movement where bends already exist), so
  // centering never converts a clean run into a staircase of micro-jogs —
  // the deep-chain failure mode (bends 16 → 94 without this).
  straightTol: number;
  straightHoldWeight: number;
};

export const DEFAULT_BALANCE_PARAMS: LayerBalanceParams = {
  lambda: 0.5,
  backwardSegmentWeight: 0.05,
  straightTol: 0.5,
  straightHoldWeight: 50,
};

export function layerBalance(
  params?: Partial<LayerBalanceParams>,
): PlacementPass {
  const p = { ...DEFAULT_BALANCE_PARAMS, ...params };
  return {
    name: "layer-balance",
    run(proper) {
      const layerCount = proper.layers.length;
      if (layerCount < 2) {
        return;
      }

      // Per-layer centering mass + center of gravity from REAL nodes (dummies
      // must not define the visual center); dummy-only layers get mass 0 and
      // just follow their neighbors through the coupling terms.
      const mass: number[] = new Array(layerCount).fill(0);
      const centerSum: number[] = new Array(layerCount).fill(0);
      for (let l = 0; l < layerCount; l++) {
        for (const pnode of proper.layers[l]) {
          if (pnode.isDummy) {
            continue;
          }
          mass[l] += 1;
          centerSum[l] += pnode.y + pnode.h / 2;
        }
      }
      const totalMass = mass.reduce((acc, m) => acc + m, 0);
      if (totalMass === 0) {
        return;
      }
      const layerCenter = mass.map((m, l) => (m === 0 ? 0 : centerSum[l] / m));
      const globalCenter = centerSum.reduce((acc, s) => acc + s, 0) / totalMass;

      // Tridiagonal normal equations. diag/rhs accumulate segment terms
      // (coupling l ↔ l+1) plus the centering term.
      const diag: number[] = mass.map((m) => p.lambda * m);
      const off: number[] = new Array(layerCount - 1).fill(0); // l ↔ l+1
      const rhs: number[] = mass.map(
        (m, l) => p.lambda * m * (globalCenter - layerCenter[l]),
      );
      for (const layer of proper.layers) {
        for (const pnode of layer) {
          for (const neighbor of pnode.rightNeighbors) {
            const a = pnode.layerIndex;
            const d = pnode.y + pnode.h / 2 - (neighbor.y + neighbor.h / 2);
            const base = pnode.isBackwardDummy || neighbor.isBackwardDummy
              ? p.backwardSegmentWeight
              : 1;
            const w = Math.abs(d) < p.straightTol
              ? base * p.straightHoldWeight
              : base;
            diag[a] += w;
            diag[a + 1] += w;
            off[a] -= w;
            rhs[a] -= w * d;
            rhs[a + 1] += w * d;
          }
        }
      }

      const delta = solveTridiagonal(diag, off, rhs);
      for (let l = 0; l < layerCount; l++) {
        for (const pnode of proper.layers[l]) {
          pnode.y += delta[l];
        }
      }
    },
  };
}

// Thomas algorithm for a symmetric tridiagonal system (off = sub = sup).
// diag is strictly positive whenever any layer has mass (lambda·m > 0) and
// couplings only add diagonal dominance, so the solve is stable.
function solveTridiagonal(
  diag: number[],
  off: number[],
  rhs: number[],
): number[] {
  const n = diag.length;
  const cp: number[] = new Array(n).fill(0);
  const dp: number[] = new Array(n).fill(0);
  cp[0] = off.length > 0 ? off[0] / diag[0] : 0;
  dp[0] = rhs[0] / diag[0];
  for (let i = 1; i < n; i++) {
    const m = diag[i] - off[i - 1] * cp[i - 1];
    cp[i] = i < n - 1 ? off[i] / m : 0;
    dp[i] = (rhs[i] - off[i - 1] * dp[i - 1]) / m;
  }
  const x: number[] = new Array(n).fill(0);
  x[n - 1] = dp[n - 1];
  for (let i = n - 2; i >= 0; i--) {
    x[i] = dp[i] - cp[i] * x[i + 1];
  }
  return x;
}
