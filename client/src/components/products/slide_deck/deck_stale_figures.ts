import { resolveScope } from "~/state/instance/t1_store";
import {
  type ContentSlide,
  type FigureBundle,
  type PackageScope,
  type RunAuthoringContext,
  type Slide,
  t3,
} from "lib";
import { type SetStoreFunction, unwrap } from "solid-js/store";
import { serverActions } from "~/server_actions";
import {
  _SLIDE_CACHE,
  getSlideFromCacheOrFetch,
} from "~/state/products/t2_slides";
import {
  findStaleFiguresInLayout,
  type StaleSlideFigure,
} from "~/generate_visualization/mod";
import { updateFigureToScope } from "~/components/_shared/figure_editor/mod.ts";
import type { OpenSlide } from "~/components/instance/copilot/mod.ts";
import { updateBlockInLayout } from "./slide_transforms/mod.ts";

// Deck-level staleness: which figures across
// the deck were resolved under a pair other than the container's current
// one. The deck header shows the count and offers one action to re-resolve
// them all; each slide's own editor shows the same thing per figure block.
// The open slide is read from its editor's draft and written back through
// it, as the copilot's slide tools do: the draft runs ahead of the stored
// row until the room checkpoints, so a write of the stored row would merge
// an older slide over what the user is typing, and the badge count would
// lag a figure the user had just updated. Every other slide is read through
// the per-slide cache, so this costs nothing extra once the slide cards have
// rendered.

export type DeckStaleFigure = {
  slideId: string;
  blockId: string;
  bundle: FigureBundle;
};

// Synchronous, for the reason on collectDeckStaleFigures.
function openSlideStaleFigures(
  open: OpenSlide,
  scope: PackageScope,
): StaleSlideFigure[] {
  const draft = open.getDraft();
  return draft.type === "content"
    ? findStaleFiguresInLayout(draft.layout, resolveScope(scope))
    : [];
}

export async function collectDeckStaleFigures(
  productId: string,
  slideIds: readonly string[],
  scope: PackageScope,
  open: OpenSlide | undefined,
): Promise<DeckStaleFigure[]> {
  const out: DeckStaleFigure[] = [];
  // The open slide first, before any await, so an effect that calls this
  // tracks its draft: the layout's node tree and each figure block's bundle,
  // never the text beside it, so a keystroke or a divider drag re-runs
  // nothing.
  if (open !== undefined && slideIds.includes(open.slideId)) {
    for (const stale of openSlideStaleFigures(open, scope)) {
      out.push({ slideId: open.slideId, ...stale });
    }
  }
  for (const slideId of slideIds) {
    if (slideId === open?.slideId) continue;
    const res = await getSlideFromCacheOrFetch(productId, slideId);
    if (!res.success || res.data.slide.type !== "content") continue;
    for (
      const stale of findStaleFiguresInLayout(
        res.data.slide.layout,
        resolveScope(scope),
      )
    ) {
      out.push({ slideId, ...stale });
    }
  }
  return out;
}

export type UpdateAllResult = {
  updated: number;
  failures: { slideId: string; reason: string }[];
};

// Re-resolve every stale figure in the deck under the container's current
// pair, one slide at a time, so a single unresolvable figure never blocks
// the rest: its reason is reported back and its old bundle stays in place.
export async function updateAllDeckFigures(
  productId: string,
  slideIds: readonly string[],
  scope: PackageScope,
  authoringContext: RunAuthoringContext,
  open: OpenSlide | undefined,
): Promise<UpdateAllResult> {
  const failures: UpdateAllResult["failures"] = [];
  let updated = 0;

  const resolveAll = async (
    slideId: string,
    stale: readonly StaleSlideFigure[],
  ): Promise<Map<string, FigureBundle>> => {
    const resolved = new Map<string, FigureBundle>();
    for (const s of stale) {
      const r = await updateFigureToScope(scope, authoringContext, s.bundle);
      if (r.ok) {
        resolved.set(s.blockId, r.bundle);
      } else {
        failures.push({ slideId, reason: r.reason });
      }
    }
    return resolved;
  };

  for (const slideId of slideIds) {
    if (open !== undefined && slideId === open.slideId) {
      const draft = unwrap(open.getDraft());
      if (draft.type !== "content") continue;
      const resolved = await resolveAll(
        slideId,
        findStaleFiguresInLayout(draft.layout, resolveScope(scope)),
      );
      if (resolved.size === 0) continue;
      // The path set the slide editor's own figure writes use: a fresh
      // reference on the path, which the CRDT sync sees and the editor
      // pushes to the room, or saves when it next flushes.
      (open.setDraft as SetStoreFunction<ContentSlide>)(
        "layout",
        replaceFigureBundles(draft.layout, resolved),
      );
      updated += resolved.size;
      continue;
    }

    const res = await getSlideFromCacheOrFetch(productId, slideId);
    if (!res.success) {
      failures.push({ slideId, reason: res.err });
      continue;
    }
    if (res.data.slide.type !== "content") continue;
    const resolved = await resolveAll(
      slideId,
      findStaleFiguresInLayout(res.data.slide.layout, resolveScope(scope)),
    );
    if (resolved.size === 0) continue;

    const nextSlide: Slide = {
      ...res.data.slide,
      layout: replaceFigureBundles(res.data.slide.layout, resolved),
    };
    const writeRes = await serverActions.updateSlide({
      product_id: productId,
      slide_id: slideId,
      slide: nextSlide,
      expectedLastUpdated: res.data.lastUpdated,
    });
    if (!writeRes.success) {
      failures.push({
        slideId,
        reason: writeRes.err === "CONFLICT"
          ? t3({
            en:
              "A slide changed while its visualizations were being updated. Update again.",
            fr:
              "Une diapositive a changé pendant la mise à jour de ses visualisations. Relancez la mise à jour.",
            pt:
              "Um diapositivo mudou enquanto as suas visualizações eram atualizadas. Atualize de novo.",
          })
          : writeRes.err,
      });
      continue;
    }
    updated += resolved.size;
    // Refill the per-slide cache under the new version now, the way the slide
    // editor does after its own save, so the card re-renders before the SSE
    // version flip lands.
    const refetch = serverActions.getSlide({
      product_id: productId,
      slide_id: slideId,
    });
    await _SLIDE_CACHE.setPromise(
      refetch,
      { productId, slideId },
      writeRes.data.lastUpdated,
    );
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
    next = updateBlockInLayout(
      next,
      blockId,
      (b) => b.type !== "figure" ? b : { type: "figure", bundle },
    );
  }
  return next;
}
