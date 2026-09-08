import type { APIResponseWithData, ReportDetail } from "lib";
import { serverActions } from "~/server_actions";
import { createReactiveCache } from "../_infra/reactive_cache";

// A report's own content (body, figures, images, config): the report half of
// the deck cache next door, on the same product stamp
// (`lastUpdated.products[id]`, carried on the `products_upserted` summary)
// and the same per-entity (Variant B) invalidation.
const _REPORT_DETAIL_CACHE = createReactiveCache<
  { productId: string },
  ReportDetail
>({
  name: "report_detail",
  uniquenessKeys: (params) => [params.productId],
  instanceVersionKey: (params, ins) =>
    ins.lastUpdated.products[params.productId] ?? "unknown",
});

export async function getReportDetailFromCacheOrFetch(
  productId: string,
): Promise<APIResponseWithData<ReportDetail>> {
  const { data, version } = await _REPORT_DETAIL_CACHE.get({ productId });
  if (data) {
    return { success: true, data } as const;
  }
  const promise = serverActions.getProductReportDetail({
    product_id: productId,
  });
  _REPORT_DETAIL_CACHE.setPromise(promise, { productId }, version);
  return await promise;
}
