import type {
  ContentSlide,
  FigureBundle,
  PackageScope,
  RunAuthoringContext,
  Slide,
} from "lib";
import { serverActions } from "~/server_actions";
import { _SLIDE_CACHE, getSlideFromCacheOrFetch } from "~/state/project/t2_slides";
import { findStaleFiguresInLayout } from "~/generate_visualization/mod";
import { updateFigureToScope } from "~/components/figure_editor/stale_figure_badge";
import { updateBlockInLayout } from "./slide_transforms/update_block_in_layout";

// Deck-level staleness (PLAN_PRODUCTS_RESTRUCTURE D4): which figures across
// the deck were resolved under a pair other than the container's current
// one. The deck header shows the count and offers one action to re-resolve
// them all; each slide's own editor shows the same thing per figure block.
// Slides are read through the normal per-slide cache, so this costs nothing
// extra once the slide cards have rendered.

export type DeckStaleFigure = {
  slideId: string;
  blockId: string;
  bundle: FigureBundle;
};

export async function collectDeckStaleFigures(
  projectId: string,
  slideIds: readonly string[],
  scope: PackageScope,
): Promise<DeckStaleFigure[]> {
  const out: DeckStaleFigure[] = [];
  for (const slideId of slideIds) {
    const res = await getSlideFromCacheOrFetch(projectId, slideId);
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

// Re-resolve every stale figure in the deck under the container's current
// pair, one slide at a time, so a single unresolvable figure never blocks
// the rest: its reason is reported back and its old bundle stays in place.
export async function updateAllDeckFigures(
  projectId: string,
  slideIds: readonly string[],
  scope: PackageScope,
  authoringContext: RunAuthoringContext,
): Promise<UpdateAllResult> {
  const failures: UpdateAllResult["failures"] = [];
  let updated = 0;

  for (const slideId of slideIds) {
    const res = await getSlideFromCacheOrFetch(projectId, slideId);
    if (!res.success || res.data.slide.type !== "content") continue;
    const stale = findStaleFiguresInLayout(res.data.slide.layout, scope);
    if (stale.length === 0) continue;

    const resolved = new Map<string, FigureBundle>();
    for (const s of stale) {
      const r = await updateFigureToScope(projectId, scope, authoringContext, s.bundle);
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
      projectId,
      slide_id: slideId,
      slide: nextSlide,
      expectedLastUpdated: res.data.lastUpdated,
    });
    if (!writeRes.success) {
      for (const blockId of resolved.keys()) {
        failures.push({ slideId, blockId, reason: writeRes.err });
      }
      continue;
    }
    updated += resolved.size;
    // Refill the per-slide cache under the new version now, the way the slide
    // editor does after its own save, so the card re-renders before the SSE
    // version flip lands.
    const refetch = serverActions.getSlide({ projectId, slide_id: slideId });
    await _SLIDE_CACHE.setPromise(refetch, { projectId, slideId }, writeRes.data.lastUpdated);
    await refetch;
  }

  return { updated, failures };
}

function replaceFigureBundles(
  layout: ContentSlide["layout"],
  byBlockId: ReadonlyMap<string, FigureBundle>,
): ContentSlide["layout"] {
  let next = layout;
  for (const [blockId, bundle] of byBlockId) {
    next = updateBlockInLayout(next, blockId, (b) =>
      b.type !== "figure" ? b : { type: "figure", bundle },
    );
  }
  return next;
}
