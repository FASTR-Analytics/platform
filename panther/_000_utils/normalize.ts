// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { sum } from "./sum_and_avg.ts";

export function normalizeToTotalOf1(arr: number[]): number[] {
  const total = sum(arr);
  if (total === 0) {
    throw new Error("Cannot normalize when total is zero");
  }
  return arr.map((val) => val / total);
}

export function normalizeToTotalOf1OrZeroIfSumToZero(arr: number[]): number[] {
  const total = sum(arr);
  if (total === 0) {
    return arr.map(() => 0);
  }
  return arr.map((val) => val / total);
}
