import type {
  APIResponseWithData,
  GenericLongFormFetchConfig,
  ItemsHolderPresentationObject,
  PeriodOption,
  ResultsValueInfoForPresentationObject,
} from "../types/mod.ts";

// The injected environment for the SHARED AI tools (the metric tools both
// the SPA copilot and the /mcp surface expose). An env is a package data
// source, bound at construction to ONE (package, scope) pair: the SPA binds
// the open product's pair — or the pin at national scope when no editor is
// open (D15) — through its cache-backed getters; the /mcp surface binds the
// instance's pinned package at national scope. The tools never learn which —
// no run id crosses this seam, and none appears in a tool schema. Getters the
// SPA-only tools need on top of these (module script/logs/settings, product
// content: slides, report bodies, replicant options, dimension labels) live
// on the client's ClientAIToolEnv extension, not here.
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
