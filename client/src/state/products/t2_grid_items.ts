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
  type ResolvedPackageScope,
} from "lib";
import { createReactiveCache } from "../_infra/reactive_cache";
import { poItemsQueue } from "~/state/_infra/request_queue";
import { answersKeyedScope, resolveScope } from "~/state/instance/t1_store";
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
    scopeToken: string;
  }
  | { status: "too_many_cells" }
  | { status: "no_data_available" };

type GridItemsParams = {
  scope: ResolvedPackageScope;
  resultsObjectId: string;
  fetchConfig: GenericLongFormFetchConfig;
};

const _GRID_ITEMS_CACHE = createReactiveCache<GridItemsParams, GridItemsHolder>(
  {
    name: "run_grid_items_v2",
    uniquenessKeys: (params) => [
      params.scope.runId,
      params.scope.definitionHash,
      params.resultsObjectId,
      hashFetchConfig(params.fetchConfig),
    ],
    versionKey: () => "immutable",
    shouldStore: answersKeyedScope,
  },
);

function toGridRows(holder: GridItemsHolder): GridRows {
  if (holder.status !== "ok") return { status: holder.status };
  return {
    status: "ok",
    items: decodeGridItems(holder, holder.fetchConfig.groupBys),
    indicatorMetadata: holder.indicatorMetadata,
    dateRange: holder.dateRange,
    scopeToken: holder.scopeToken,
  };
}

export async function getGridRowsFromCacheOrFetch(
  scope: PackageScope,
  resultsObjectId: string,
  fetchConfig: GenericLongFormFetchConfig,
): Promise<APIResponseWithData<GridRows>> {
  const params = { scope: resolveScope(scope), resultsObjectId, fetchConfig };
  const { data, version } = await _GRID_ITEMS_CACHE.get(params);
  if (data) return { success: true, data: toGridRows(data) };

  const newPromise = poItemsQueue.enqueue(() =>
    serverActions.getRunGridItems({
      run_id: scope.runId,
      resultsObjectId,
      fetchConfig,
      scopeId: scope.scopeId,
    })
  );
  _GRID_ITEMS_CACHE.setPromise(newPromise, params, version);
  const res = await newPromise;
  return res.success ? { success: true, data: toGridRows(res.data) } : res;
}
