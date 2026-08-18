import type {
  APIResponseWithData,
  GenericLongFormFetchConfig,
  InstalledModuleWithConfigSelections,
  ItemsHolderPresentationObject,
  PeriodOption,
  ResultsValueInfoForPresentationObject,
} from "../types/mod.ts";

// The injected environment for the SHARED AI tools (metrics + modules — the
// tools both the SPA copilot and the /mcp surface expose). An env is a
// package data source, bound at construction to ONE results package and
// scope: the SPA binds a project (its attached package, its AA2 scope, its
// cache-backed getters over the project routes); the /mcp surface binds the
// instance's pinned package (national scope, run-keyed instance routes). The
// tools never learn which — no project or run id crosses this seam, and none
// appears in a tool schema. Getters the SPA-only tools need on top of these
// (project content: PO detail, slides, replicant options, dimension labels)
// live on the client's ClientAIToolEnv extension, not here.
export type AIToolEnv = {
  getItems: (params: {
    resultsObjectId: string;
    fetchConfig: GenericLongFormFetchConfig;
    firstPeriodOption: PeriodOption | undefined;
  }) => Promise<APIResponseWithData<ItemsHolderPresentationObject>>;
  getResultsValueInfo: (
    metricId: string,
  ) => Promise<APIResponseWithData<ResultsValueInfoForPresentationObject>>;
  getModuleScript: (
    moduleId: string,
  ) => Promise<APIResponseWithData<{ script: string }>>;
  getModuleLogs: (
    moduleId: string,
  ) => Promise<APIResponseWithData<{ logs: string }>>;
  getModuleSettings: (
    moduleId: string,
  ) => Promise<APIResponseWithData<InstalledModuleWithConfigSelections>>;
};
