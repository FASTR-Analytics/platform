// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { z } from "./deps.ts";
import type { APIResponseNoData, APIResponseWithData } from "./api_response.ts";

export type RouteMethod = "GET" | "POST" | "PUT" | "DELETE" | "PATCH";

export type ParamScalar = string | number | boolean;

export type ParamsSchema = z.ZodType<Record<string, ParamScalar | undefined>>;

export type BodySchema = z.ZodType<Record<string, unknown>>;

declare const responsePayload: unique symbol;

export type ResponsePhantom<T> = { readonly [responsePayload]?: T };

export type ApiRoute<
  TParamsSchema extends ParamsSchema | undefined,
  TBodySchema extends BodySchema | undefined,
  TResponse,
  TStreaming extends boolean,
> = {
  path: string;
  method: RouteMethod;
  params: TParamsSchema;
  body: TBodySchema;
  response: ResponsePhantom<TResponse>;
  isStreaming: TStreaming;
  timeoutMs: number | undefined;
};

export type AnyApiRoute = ApiRoute<
  ParamsSchema | undefined,
  BodySchema | undefined,
  unknown,
  boolean
>;

export type ApiRegistry = Record<string, AnyApiRoute>;

export type ApiRouteConfig<
  TParamsSchema extends ParamsSchema | undefined,
  TBodySchema extends BodySchema | undefined,
  TResponse,
  TStreaming extends boolean,
> = {
  path: string;
  method: RouteMethod;
  params?: TParamsSchema;
  body?: TBodySchema;
  response?: ResponsePhantom<TResponse>;
  isStreaming?: TStreaming;
  timeoutMs?: number;
};

export type RouteParamsOf<R extends AnyApiRoute> = R["params"] extends
  ParamsSchema ? z.infer<R["params"]> : Record<never, never>;

export type RouteBodyOf<R extends AnyApiRoute> = R["body"] extends BodySchema
  ? z.infer<R["body"]>
  : undefined;

export type RouteArgsOf<R extends AnyApiRoute> =
  & (R["params"] extends ParamsSchema ? z.infer<R["params"]> : unknown)
  & (R["body"] extends BodySchema ? z.infer<R["body"]> : unknown);

export type RouteResponseOf<R extends AnyApiRoute> = R extends
  { response: ResponsePhantom<infer T> }
  ? ([T] extends [void] ? APIResponseNoData : APIResponseWithData<T>)
  : APIResponseNoData;

export function route<
  TParamsSchema extends ParamsSchema | undefined = undefined,
  TBodySchema extends BodySchema | undefined = undefined,
  TResponse = void,
  TStreaming extends boolean = false,
>(
  config: ApiRouteConfig<TParamsSchema, TBodySchema, TResponse, TStreaming>,
): ApiRoute<TParamsSchema, TBodySchema, TResponse, TStreaming> {
  if (config.method === "GET" && config.body !== undefined) {
    throw new Error(
      `Route "${config.path}": GET routes cannot have a body schema`,
    );
  }
  return {
    path: config.path,
    method: config.method,
    params: config.params as TParamsSchema,
    body: config.body as TBodySchema,
    response: config.response ?? {},
    isStreaming: (config.isStreaming ?? false) as TStreaming,
    timeoutMs: config.timeoutMs,
  };
}

export function responseOf<T>(): ResponsePhantom<T> {
  return {};
}

export function assertNoCollisions(...registries: ApiRegistry[]): void {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const registry of registries) {
    for (const key of Object.keys(registry)) {
      if (seen.has(key)) {
        duplicates.add(key);
      }
      seen.add(key);
    }
  }
  if (duplicates.size > 0) {
    throw new Error(
      `Duplicate route keys across registries: ${[...duplicates].join(", ")}`,
    );
  }
}

export function getPathParamNames(path: string): string[] {
  return [...path.matchAll(PATH_PARAM_REGEX)].map((m) => m[1]);
}

const PATH_PARAM_REGEX = /:([A-Za-z0-9_]+)/g;
