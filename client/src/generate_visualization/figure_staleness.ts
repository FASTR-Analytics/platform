import type { ContentBlock, ContentSlide, FigureBlock, FigureBundle, PackageScope } from "lib";

// Staleness (PLAN_PRODUCTS_RESTRUCTURE D4): a per-figure comparison of the
// pair a bundle was resolved under against the pair its container serves
// from. Nothing rewrites stored bundles behind the user's back, so a
// mixed-package document is a visible, intentional state, and the badge is
// the whole mechanism: reattach and scope change never block. Pure: no
// fetches, no stores, no components. The update action lives in
// components/figure_editor/stale_figure_badge.tsx.
//
// Transitional until step 9b stamps every stored bundle: a bundle with no
// `scope`, or a null `provenance.runId`, cannot be judged on that half and
// that half reads as not stale. Type-only imports, so the server test can
// load this file under Deno.

export function isFigureBundleStale(
  bundle: FigureBundle,
  containerScope: PackageScope,
): boolean {
  const runStale = bundle.provenance.runId !== null &&
    bundle.provenance.runId !== containerScope.runId;
  const scopeStale = bundle.scope !== undefined &&
    bundle.scope.adminArea2 !== containerScope.adminArea2;
  return runStale || scopeStale;
}

// The stale figures of a slide layout, in layout order. `blockId` is the
// layout item id the update action path-sets the new bundle back into.
export type StaleSlideFigure = {
  blockId: string;
  bundle: FigureBundle;
};

type SlideLayout = ContentSlide["layout"];

export function findStaleFiguresInLayout(
  layout: SlideLayout,
  containerScope: PackageScope,
): StaleSlideFigure[] {
  const out: StaleSlideFigure[] = [];
  walkLayout(layout, (blockId, block) => {
    if (block.type !== "figure" || !block.bundle) return;
    if (isFigureBundleStale(block.bundle, containerScope)) {
      out.push({ blockId, bundle: block.bundle });
    }
  });
  return out;
}

function walkLayout(
  node: SlideLayout,
  visit: (blockId: string, block: ContentBlock) => void,
): void {
  if (node.type === "item") {
    visit(node.id, node.data);
    return;
  }
  for (const child of node.children) {
    walkLayout(child as SlideLayout, visit);
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
  containerScope: PackageScope,
): StaleReportFigure[] {
  const out: StaleReportFigure[] = [];
  for (const [figureId, entry] of Object.entries(figures)) {
    if (!entry.bundle) continue;
    if (isFigureBundleStale(entry.bundle, containerScope)) {
      out.push({ figureId, bundle: entry.bundle });
    }
  }
  return out;
}
