import type { APIResponseWithData, SlideWithMeta } from "lib";
import { serverActions } from "~/server_actions";
import { createReactiveCache } from "../_infra/reactive_cache";

// One slide's content, versioned by its own optimistic-lock stamp (the
// `last_updated` message): per-entity (Variant B), so a flip is one
// incremental change to the slide on screen and consumers leave stale
// content visible while the refetch runs. The DECK is part of the uniqueness
// key: ids are unique over the LIVE rows only (`generateUniqueSlideId` checks
// nothing else), so a deleted slide's id is free to be re-minted in another
// deck, and a removal stamps nothing for the row it removed, so this client's
// entry for the old row stays reachable at the old stamp. Keyed by the id
// alone, that entry would be served as the successor's content the first time
// this client could see the deck that re-minted it.
export const _SLIDE_CACHE = createReactiveCache<
  { productId: string; slideId: string },
  SlideWithMeta
>({
  name: "slide",
  uniquenessKeys: (p) => [p.productId, p.slideId],
  versionKey: (p, ins) => ins.lastUpdated.slides[p.slideId] ?? "unknown",
});

export async function getSlideFromCacheOrFetch(
  productId: string,
  slideId: string,
): Promise<APIResponseWithData<SlideWithMeta>> {
  const cached = await _SLIDE_CACHE.get({ productId, slideId });
  if (cached.data) {
    return { success: true, data: cached.data };
  }
  const promise = serverActions.getSlide({
    product_id: productId,
    slide_id: slideId,
  });
  _SLIDE_CACHE.setPromise(promise, { productId, slideId }, cached.version);
  return promise;
}

// The slide already in memory, if it is: lets the deck swap editors inside the
// click, instead of unmounting one and mounting the other a tick apart.
export function peekSlide(
  productId: string,
  slideId: string,
): SlideWithMeta | undefined {
  return _SLIDE_CACHE.peekMemory({ productId, slideId });
}
