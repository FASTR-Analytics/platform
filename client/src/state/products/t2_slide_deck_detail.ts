import type { APIResponseWithData, SlideDeckDetail } from "lib";
import { serverActions } from "~/server_actions";
import { createReactiveCache } from "../_infra/reactive_cache";

// A deck's own content (plan, config, slide ordering), versioned by THE
// product stamp: `products.last_updated` is bumped by every content mutation
// and every metadata write in the same transaction, and it arrives on the
// product's `products_upserted` summary rather than a `last_updated` message
// (PLAN_PRODUCTS_RESTRUCTURE D8). Per-entity (Variant B) invalidation.
const _SLIDE_DECK_DETAIL_CACHE = createReactiveCache<
  { productId: string },
  SlideDeckDetail
>({
  name: "slide_deck_detail",
  uniquenessKeys: (params) => [params.productId],
  instanceVersionKey: (params, ins) =>
    ins.lastUpdated.products[params.productId] ?? "unknown",
});

export async function getSlideDeckDetailFromCacheOrFetch(
  productId: string,
): Promise<APIResponseWithData<SlideDeckDetail>> {
  const { data, version } = await _SLIDE_DECK_DETAIL_CACHE.get({ productId });
  if (data) {
    return { success: true, data } as const;
  }
  const promise = serverActions.getSlideDeckDetail({
    product_id: productId,
  });
  _SLIDE_DECK_DETAIL_CACHE.setPromise(promise, { productId }, version);
  return await promise;
}
