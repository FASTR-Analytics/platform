import {
  type APIResponseWithData,
  decodeGridItems,
  type GenericLongFormFetchConfig,
  type GridItemsHolder,
  hashFetchConfig,
  type IndicatorMetadataDisplay,
  type JsonArrayItem,
  type PackageScope,
  type PeriodBounds,
  scopeToken,
} from "lib";
import { createReactiveCache } from "../_infra/reactive_cache";
import { poItemsQueue } from "~/state/_infra/request_queue";
import { serverActions } from "~/server_actions";

// The Explore Data table's rows under one PackageScope: the grid read
// (getRunGridItems), keyed like the items read in t2_figure_data.ts. The
// encoded payload is what is stored; callers get the decoded rows.

export type GridRows =
  | {
    status: "ok";
    items: JsonArrayItem[];
    indicatorMetadata: IndicatorMetadataDisplay[];
    dateRange: PeriodBounds | undefined;
  }
  | { status: "too_many_cells" }
  | { status: "no_data_available" };

type GridItemsParams = {
  scope: PackageScope;
  resultsObjectId: string;
  fetchConfig: GenericLongFormFetchConfig;
};

const _GRID_ITEMS_CACHE = createReactiveCache<GridItemsParams, GridItemsHolder>(
  {
    name: "run_grid_items",
    uniquenessKeys: (params) => [
      params.scope.runId,
      scopeToken(params.scope.adminArea2),
      params.resultsObjectId,
      hashFetchConfig(params.fetchConfig),
    ],
    versionKey: () => "immutable",
  },
);

function toGridRows(holder: GridItemsHolder): GridRows {
  if (holder.status !== "ok") return { status: holder.status };
  return {
    status: "ok",
    items: decodeGridItems(holder, holder.fetchConfig.groupBys),
    indicatorMetadata: holder.indicatorMetadata,
    dateRange: holder.dateRange,
  };
}

export async function getGridRowsFromCacheOrFetch(
  scope: PackageScope,
  resultsObjectId: string,
  fetchConfig: GenericLongFormFetchConfig,
): Promise<APIResponseWithData<GridRows>> {
  const params = { scope, resultsObjectId, fetchConfig };
  const { data, version } = await _GRID_ITEMS_CACHE.get(params);
  if (data) return { success: true, data: toGridRows(data) };

  const newPromise = poItemsQueue.enqueue(() =>
    serverActions.getRunGridItems({
      run_id: scope.runId,
      resultsObjectId,
      fetchConfig,
      adminArea2: scope.adminArea2,
    })
  );
  _GRID_ITEMS_CACHE.setPromise(newPromise, params, version);
  const res = await newPromise;
  return res.success ? { success: true, data: toGridRows(res.data) } : res;
}
