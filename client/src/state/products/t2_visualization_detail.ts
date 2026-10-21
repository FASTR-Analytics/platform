import type { APIResponseWithData, VisualizationDetail } from "lib";
import { serverActions } from "~/server_actions";
import { createReactiveCache } from "../_infra/reactive_cache";

// A saved visualization's own content (its bundle): the visualization half of
// the report cache next door, on the same product stamp
// (`lastUpdated.products[id]`, carried on the `products_upserted` summary)
// and the same per-entity (Variant B) invalidation. Read only by the
// visualization's own editor: no copilot tool reaches it.
const _VISUALIZATION_DETAIL_CACHE = createReactiveCache<
  { productId: string },
  VisualizationDetail
>({
  name: "visualization_detail",
  uniquenessKeys: (params) => [params.productId],
  versionKey: (params, ins) =>
    ins.lastUpdated.products[params.productId] ?? "unknown",
});

export async function getVisualizationDetailFromCacheOrFetch(
  productId: string,
): Promise<APIResponseWithData<VisualizationDetail>> {
  const { data, version } = await _VISUALIZATION_DETAIL_CACHE.get({
    productId,
  });
  if (data) {
    return { success: true, data } as const;
  }
  const promise = serverActions.getVisualizationDetail({
    product_id: productId,
  });
  _VISUALIZATION_DETAIL_CACHE.setPromise(promise, { productId }, version);
  return await promise;
}
