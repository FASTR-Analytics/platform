// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

export type APIResponseWithData<T> =
  | { success: true; data: T }
  | { success: false; err: string };

export type APIResponseNoData =
  | { success: true }
  | { success: false; err: string };

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
