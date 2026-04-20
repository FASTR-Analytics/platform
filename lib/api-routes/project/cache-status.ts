import { route } from "../route-utils.ts";

export const cacheStatusRouteRegistry = {
  getCacheStatus: route({
    path: "/cache_status",
    method: "GET",
    response: {} as {
      valkeyConnected: boolean;
      visualizations: {
        id: string;
        label: string;
        poDetailCached: boolean;
        metricInfoCached: boolean;
      }[];
      slideDecks: {
        id: string;
        label: string;
      }[];
    },
    requiresProject: true,
  }),
};
