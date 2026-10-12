import type {
  APIResponseWithData,
  GenericLongFormFetchConfig,
  ItemsHolderPresentationObject,
  ResultsValueInfoForPresentationObject,
} from "../types/mod.ts";

// The injected environment for the SHARED AI tools (the metric tools both the
// SPA copilot and the /mcp surface expose). An env is a package data source
// bound to ONE (package, scope) pair, and each surface builds its tools over
// one env per pair and binds the registered tool to them per call: the SPA
// to the pair the call's view shows, through cache-backed getters
// (client/src/components/instance/copilot/bind_package_tools.ts); /mcp to
// the pinned package under the "All data" scope (server/mcp/). The pair
// behind a registered tool can therefore move between two calls of one
// conversation, so both surfaces open every package read with the source
// line (lib/ai_tools/source_header.ts). The tools never learn which pair:
// no run id crosses this seam and none appears in a tool schema. Getters the
// SPA-only tools need on top of these (module script/logs/settings, product
// content: slides, replicant options, dimension labels) live on the client's
// ClientAIToolEnv extension, not here.
export type AIToolEnv = {
  getItems: (params: {
    resultsObjectId: string;
    fetchConfig: GenericLongFormFetchConfig;
  }) => Promise<APIResponseWithData<ItemsHolderPresentationObject>>;
  getResultsValueInfo: (
    metricId: string,
  ) => Promise<APIResponseWithData<ResultsValueInfoForPresentationObject>>;
};
