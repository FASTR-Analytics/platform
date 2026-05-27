import { APIResponseWithData, DashboardDetail } from "lib";
import { createReactiveCache } from "../_infra/reactive_cache";
import { serverActions } from "~/server_actions";

export const _DASHBOARD_DETAIL_CACHE = createReactiveCache<
  {
    projectId: string;
    dashboardId: string;
  },
  DashboardDetail
>({
  name: "dashboard_detail",
  uniquenessKeys: (params) => [params.projectId, params.dashboardId],
  versionKey: (params, pds) =>
    pds.lastUpdated.dashboards[params.dashboardId] ?? "unknown",
});

export async function getDashboardDetailFromCacheOrFetch(
  projectId: string,
  dashboardId: string,
): Promise<APIResponseWithData<DashboardDetail>> {
  const { data, version } = await _DASHBOARD_DETAIL_CACHE.get({
    projectId,
    dashboardId,
  });

  if (data) {
    return { success: true, data } as const;
  }

  const newPromise = serverActions.getDashboardDetail({
    projectId,
    dashboard_id: dashboardId,
  });

  _DASHBOARD_DETAIL_CACHE.setPromise(
    newPromise,
    {
      projectId,
      dashboardId,
    },
    version,
  );

  return await newPromise;
}
