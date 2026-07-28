// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { AnyApiRoute, RouteBodyOf, RouteParamsOf } from "./route.ts";

export type RouteInput = {
  params?: Record<string, string | undefined>;
  query?: URLSearchParams | Record<string, string | undefined>;
  body?: unknown;
};

export type ValidatedRouteInput<R extends AnyApiRoute> =
  | { success: true; params: RouteParamsOf<R>; body: RouteBodyOf<R> }
  | { success: false; err: string };

export function validateRouteInput<R extends AnyApiRoute>(
  routeDef: R,
  input: RouteInput,
): ValidatedRouteInput<R> {
  const rawParams: Record<string, string> = {};
  if (input.query instanceof URLSearchParams) {
    for (const [key, value] of input.query.entries()) {
      rawParams[key] = value;
    }
  } else if (input.query !== undefined) {
    for (const [key, value] of Object.entries(input.query)) {
      if (value !== undefined) {
        rawParams[key] = value;
      }
    }
  }
  if (input.params !== undefined) {
    for (const [key, value] of Object.entries(input.params)) {
      if (value !== undefined) {
        rawParams[key] = value;
      }
    }
  }
  let params: unknown = {};
  if (routeDef.params !== undefined) {
    const parsed = routeDef.params.safeParse(rawParams);
    if (!parsed.success) {
      return { success: false, err: `Invalid params: ${parsed.error.message}` };
    }
    params = parsed.data;
  }
  let body: unknown = undefined;
  if (routeDef.body !== undefined) {
    const parsed = routeDef.body.safeParse(input.body);
    if (!parsed.success) {
      return { success: false, err: `Invalid body: ${parsed.error.message}` };
    }
    body = parsed.data;
  }
  return {
    success: true,
    params: params as RouteParamsOf<R>,
    body: body as RouteBodyOf<R>,
  };
}
