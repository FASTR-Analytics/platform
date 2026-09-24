import type { APIResponseWithData, SlideWithMeta } from "lib";
import { serverActions } from "~/server_actions";
import { createReactiveCache } from "../_infra/reactive_cache";

// One slide's content, versioned by its own optimistic-lock stamp (the
// `last_updated` message): per-entity (Variant B), so a flip is one
// incremental change to the slide on screen and consumers leave stale
// content visible while the refetch runs. Slide ids are instance-wide unique
// (D14), so the slide id alone is the uniqueness key; the product id only
// scopes the read on the wire.
export const _SLIDE_CACHE = createReactiveCache<
  { productId: string; slideId: string },
  SlideWithMeta
>({
  name: "slide",
  uniquenessKeys: (p) => [p.slideId],
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
