// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

export type APIResponseWithData<T> =
  | { success: true; data: T }
  | { success: false; err: string };

export type APIResponseNoData =
  | { success: true }
  | { success: false; err: string };

export type QueryState<T> =
  | { status: "loading"; msg?: string }
  | { status: "error"; err: string }
  | { status: "ready"; data: T };

export function throwIfErrWithData<T>(
  apiResponse: APIResponseWithData<T>,
): asserts apiResponse is { success: true; data: T } {
  if (apiResponse.success === false) {
    throw new Error(apiResponse.err);
  }
}

export function throwIfErrNoData(
  apiResponse: APIResponseNoData,
): asserts apiResponse is { success: true } {
  if (apiResponse.success === false) {
    throw new Error(apiResponse.err);
  }
}

export function getQueryStateFromApiResponse<T>(
  res: APIResponseWithData<T>,
): QueryState<T> {
  return res.success
    ? { status: "ready", data: res.data }
    : { status: "error", err: res.err };
}

export function getApiResponseFromQueryState<T>(
  state: QueryState<T>,
): APIResponseWithData<T> {
  if (state.status === "ready") {
    return { success: true, data: state.data };
  }
  return {
    success: false,
    err: state.status === "error" ? state.err : "Still loading",
  };
}

export async function getApiResponseFromGenerator<T>(
  gen: AsyncGenerator<QueryState<T>>,
): Promise<APIResponseWithData<T>> {
  let last: QueryState<T> | undefined;
  for await (const state of gen) {
    last = state;
  }
  if (!last || last.status === "loading") {
    return { success: false, err: "Generator did not complete" };
  }
  return getApiResponseFromQueryState(last);
}
