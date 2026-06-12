import { routeRegistry } from "./combined.ts";
import type { APIResponseNoData, ProgressCallback } from "../types/mod.ts";

// Helper types for extracting route information directly from registry
export type RouteParams<T> = T extends { params: infer P } ? P : never;
export type RouteBody<T> = T extends { body: infer B } ? B : never;
// Extract the response type from the route.
// route-utils.ts resolves the response field to APIResponseNoData or APIResponseWithData<T>
// before it reaches the registry, so R is always a concrete envelope type.
export type RouteResponse<T> = T extends { response: infer R } ? R : APIResponseNoData;
export type RouteRequiresProject<T> = T extends { requiresProject: true }
  ? true
  : false;

export type RouteIsStreaming<T> = T extends { isStreaming: true }
  ? true
  : false;

// Handle the case where both params and body might be never
export type RouteArgs<T> = [RouteParams<T>] extends [never]
  ? [RouteBody<T>] extends [never]
    ? {}
    : RouteBody<T>
  : [RouteBody<T>] extends [never]
  ? RouteParams<T>
  : RouteParams<T> & RouteBody<T>;

// Add projectId to args if route requires it
export type RouteArgsWithProject<T> = RouteRequiresProject<T> extends true
  ? RouteArgs<T> & { projectId: string }
  : RouteArgs<T>;

// Create server action function type from registry entry
type ServerActionFromEntry<Entry> = RouteIsStreaming<Entry> extends true
  ? (
      args: RouteArgsWithProject<Entry>,
      onProgress?: ProgressCallback
    ) => Promise<RouteResponse<Entry>>
  : (args: RouteArgsWithProject<Entry>) => Promise<RouteResponse<Entry>>;

// The final server actions type based on the registry
export type ServerActionsType = {
  [K in keyof typeof routeRegistry]: ServerActionFromEntry<
    (typeof routeRegistry)[K]
  >;
};
