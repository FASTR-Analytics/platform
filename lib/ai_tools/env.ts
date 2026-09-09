import type {
  APIResponseWithData,
  GenericLongFormFetchConfig,
  ItemsHolderPresentationObject,
  PeriodOption,
  ResultsValueInfoForPresentationObject,
} from "../types/mod.ts";

// The injected environment for the SHARED AI tools (the metric tools both the
// SPA copilot and the /mcp surface expose). An env is a package data source
// bound to ONE (package, scope) pair: the SPA binds the open product's pair,
// or the instance pin at national scope when no editor is open (D15), through
// its cache-backed getters; the /mcp surface binds the pinned package at
// national scope. The SPA reads its pair per call rather than capturing it, so
// a result can come from a different package than the previous one: hence the
// source header (lib/ai_tools/source_header.ts). The tools never learn which:
// no run id crosses this seam and none appears in a tool schema. Getters the
// SPA-only tools need on top of these (module script/logs/settings, product
// content: slides, replicant options, dimension labels) live on the client's
// ClientAIToolEnv extension, not here.
export type AIToolEnv = {
  getItems: (params: {
    resultsObjectId: string;
    fetchConfig: GenericLongFormFetchConfig;
    firstPeriodOption: PeriodOption | undefined;
  }) => Promise<APIResponseWithData<ItemsHolderPresentationObject>>;
  getResultsValueInfo: (
    metricId: string,
  ) => Promise<APIResponseWithData<ResultsValueInfoForPresentationObject>>;
};
