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
  instanceVersionKey: (p, ins) => ins.lastUpdated.slides[p.slideId] ?? "unknown",
});

export async function getSlideFromCacheOrFetch(
  productId: string,
  slideId: string,
): Promise<APIResponseWithData<SlideWithMeta>> {
  const cached = await _SLIDE_CACHE.get({ productId, slideId });
  if (cached.data) {
    return { success: true, data: cached.data };
  }
  const promise = serverActions.getProductSlide({
    product_id: productId,
    slide_id: slideId,
  });
  _SLIDE_CACHE.setPromise(promise, { productId, slideId }, cached.version);
  return promise;
}
