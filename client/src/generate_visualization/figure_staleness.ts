import type { ContentBlock, FigureBlock, FigureBundle, PackageScope } from "lib";
import type { LayoutNode } from "panther";

// =============================================================================
// Staleness (D4) — a per-figure comparison, never a pre-flight
// =============================================================================
//
// A FigureBundle captures the pair it was resolved under (`provenance.runId` +
// `scope.adminArea2`). A product carries exactly one pair. A figure is STALE
// when the two disagree — which happens when the product is reattached to a
// different package or its scope changes, and NOT before: nothing rewrites
// stored bundles behind the user's back.
//
// Mixed-package products are therefore a visible, intentional state (a Q2
// figure kept deliberately beside a Q3 one). Reattach and scope change never
// block and have no compatibility report — the badge is the whole mechanism.
//
// Pure: no fetches, no stores, no components. The update ACTION that acts on
// this predicate lives in `figure_editor/stale_figure_badge.tsx`.
// =============================================================================

export function isFigureBundleStale(bundle: FigureBundle, productScope: PackageScope): boolean {
  return (
    bundle.provenance.runId !== productScope.runId ||
    bundle.scope.adminArea2 !== productScope.adminArea2
  );
}

// The stale figures of a slide layout, in layout order — one entry per figure
// block that carries a bundle resolved under a different pair. `blockId` is the
// layout item id the update action path-sets back into.
export type StaleSlideFigure = {
  blockId: string;
  bundle: FigureBundle;
};

export function findStaleFiguresInLayout(
  layout: LayoutNode<ContentBlock>,
  productScope: PackageScope,
): StaleSlideFigure[] {
  const out: StaleSlideFigure[] = [];
  walkLayout(layout, (blockId, block) => {
    if (block.type !== "figure" || !block.bundle) return;
    if (isFigureBundleStale(block.bundle, productScope)) {
      out.push({ blockId, bundle: block.bundle });
    }
  });
  return out;
}

function walkLayout(
  node: LayoutNode<ContentBlock>,
  visit: (blockId: string, block: ContentBlock) => void,
): void {
  if (node.type === "item") {
    visit(node.id, node.data);
    return;
  }
  for (const child of node.children) {
    walkLayout(child as LayoutNode<ContentBlock>, visit);
  }
}

// The stale figures of a report, keyed by the figure registry id the update
// action writes back to.
export type StaleReportFigure = {
  figureId: string;
  bundle: FigureBundle;
};

export function findStaleFiguresInReport(
  figures: Record<string, FigureBlock>,
  productScope: PackageScope,
): StaleReportFigure[] {
  const out: StaleReportFigure[] = [];
  for (const [figureId, entry] of Object.entries(figures)) {
    if (!entry.bundle) continue;
    if (isFigureBundleStale(entry.bundle, productScope)) {
      out.push({ figureId, bundle: entry.bundle });
    }
  }
  return out;
}
