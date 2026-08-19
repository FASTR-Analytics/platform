import type {
  ContentBlock,
  FigureBundle,
  PackageScope,
  Slide,
  RunAuthoringContext,
} from "lib";
import type { LayoutNode } from "panther";
import { serverActions } from "~/server_actions";
import { getSlideFromCacheOrFetch } from "~/state/products/t2_slides";
import { findStaleFiguresInLayout } from "~/generate_visualization/mod";
import { updateFigureToScope } from "~/components/figure_editor/stale_figure_badge";

// Deck-level staleness (D4): which figures ACROSS the deck were resolved under
// a pair other than the product's current one. The deck header shows the count
// and offers one action to re-resolve them all; each slide's own editor shows
// the same thing per figure block.
//
// Slides are read through the normal per-slide cache, so this costs nothing
// extra once the slide cards have rendered.

export type DeckStaleFigure = {
  slideId: string;
  blockId: string;
  bundle: FigureBundle;
};

export async function collectDeckStaleFigures(
  slideIds: readonly string[],
  scope: PackageScope,
): Promise<DeckStaleFigure[]> {
  const out: DeckStaleFigure[] = [];
  for (const slideId of slideIds) {
    const res = await getSlideFromCacheOrFetch(slideId);
    if (!res.success || res.data.slide.type !== "content") continue;
    for (const stale of findStaleFiguresInLayout(res.data.slide.layout, scope)) {
      out.push({ slideId, blockId: stale.blockId, bundle: stale.bundle });
    }
  }
  return out;
}

export type UpdateAllResult = {
  updated: number;
  failures: { slideId: string; blockId: string; reason: string }[];
};

// Re-resolve every stale figure in the deck under the product's current pair,
// one slide at a time so a single unresolvable figure never blocks the rest —
// its reason is reported back and its OLD bundle stays in place (D4).
export async function updateAllDeckFigures(
  slideIds: readonly string[],
  scope: PackageScope,
  authoringContext: RunAuthoringContext,
): Promise<UpdateAllResult> {
  const failures: UpdateAllResult["failures"] = [];
  let updated = 0;

  for (const slideId of slideIds) {
    const res = await getSlideFromCacheOrFetch(slideId);
    if (!res.success || res.data.slide.type !== "content") continue;
    const stale = findStaleFiguresInLayout(res.data.slide.layout, scope);
    if (stale.length === 0) continue;

    const resolved = new Map<string, FigureBundle>();
    for (const s of stale) {
      const r = await updateFigureToScope(scope, authoringContext, s.bundle);
      if (r.ok) {
        resolved.set(s.blockId, r.bundle);
      } else {
        failures.push({ slideId, blockId: s.blockId, reason: r.reason });
      }
    }
    if (resolved.size === 0) continue;

    const nextSlide: Slide = {
      ...res.data.slide,
      layout: replaceFigureBundles(res.data.slide.layout, resolved),
    };
    const writeRes = await serverActions.updateSlide({
      slide_id: slideId,
      slide: nextSlide,
      expectedLastUpdated: res.data.lastUpdated,
    });
    if (writeRes.success) {
      updated += resolved.size;
    } else {
      for (const blockId of resolved.keys()) {
        failures.push({ slideId, blockId, reason: writeRes.err });
      }
    }
  }

  return { updated, failures };
}

// Structural replace — a FRESH node object for every touched item, so the CRDT
// sync's reference cache cannot skip the write (the same reason the slide
// editor path-sets a new bundle rather than reconciling one in place).
function replaceFigureBundles(
  node: LayoutNode<ContentBlock>,
  byBlockId: ReadonlyMap<string, FigureBundle>,
): LayoutNode<ContentBlock> {
  if (node.type === "item") {
    const bundle = byBlockId.get(node.id);
    if (bundle === undefined || node.data.type !== "figure") {
      return node;
    }
    return { ...node, data: { type: "figure", bundle } };
  }
  return {
    ...node,
    children: node.children.map((child) =>
      replaceFigureBundles(child as LayoutNode<ContentBlock>, byBlockId),
    ),
  };
}
