import { APIResponseWithData, ReportDetail } from "lib";
import { serverActions } from "~/server_actions";
import { createReactiveCache } from "../_infra/reactive_cache";

// A report's own content (body, figures, images, config) — the report half of
// the deck cache next door, on the same product stamp
// (`lastUpdated.products[id]`, carried on the `products_upserted` summary) and
// the same per-entity (Variant B) invalidation.
const _REPORT_DETAIL_CACHE = createReactiveCache<
  { reportId: string },
  ReportDetail
>({
  name: "report_detail",
  uniquenessKeys: (params) => [params.reportId],
  versionKey: (params, ins) => ins.lastUpdated.products[params.reportId] ?? "unknown",
});

export async function getReportDetailFromCacheOrFetch(
  reportId: string,
): Promise<APIResponseWithData<ReportDetail>> {
  const { data, version } = await _REPORT_DETAIL_CACHE.get({ reportId });

  if (data) {
    return { success: true, data } as const;
  }

  const newPromise = serverActions.getReportDetail({ report_id: reportId });

  _REPORT_DETAIL_CACHE.setPromise(newPromise, { reportId }, version);

  return await newPromise;
}
