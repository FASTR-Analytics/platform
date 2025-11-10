// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { Csv } from "./csv_class.ts";

export function csvsAreTheSame<T>(
  a: Csv<T>,
  b: Csv<T>,
  asNumbers?: "as-numbers",
): boolean {
  const aColHeaders = a.colHeaders();
  const bColHeaders = b.colHeaders();
  const aRowHeaders = a.rowHeaders();
  const bRowHeaders = b.rowHeaders();
  const aAoa = a.aoa();
  const bAoa = b.aoa();
  if (aColHeaders === "none" && bColHeaders !== "none") {
    return false;
  }
  if (aColHeaders !== "none" && bColHeaders === "none") {
    return false;
  }
  if (
    aColHeaders !== "none" &&
    bColHeaders !== "none" &&
    !arraysAreTheSame(aColHeaders, bColHeaders, asNumbers)
  ) {
    return false;
  }
  if (aRowHeaders === "none" && bRowHeaders !== "none") {
    return false;
  }
  if (aRowHeaders !== "none" && bRowHeaders === "none") {
    return false;
  }
  if (
    aRowHeaders !== "none" &&
    bRowHeaders !== "none" &&
    !arraysAreTheSame(aRowHeaders, bRowHeaders, asNumbers)
  ) {
    return false;
  }
  if (aAoa.length !== bAoa.length) {
    return false;
  }
  for (let i = 0; i < aAoa.length; i++) {
    if (!arraysAreTheSame(aAoa[i], bAoa[i], asNumbers)) {
      return false;
    }
  }
  return true;
}

function arraysAreTheSame<T>(
  a: T[],
  b: T[],
  asNumbers: "as-numbers" | undefined,
): boolean {
  if (a.length !== b.length) {
    return false;
  }
  for (let i = 0; i < a.length; i++) {
    if (asNumbers === "as-numbers") {
      if (Number(a[i]) !== Number(b[i])) {
        if (isNaN(Number(a[i])) && isNaN(Number(b[i]))) {
          continue;
        }
        console.log(a[i], b[i]);
        return false;
      }
    } else {
      if (a[i] !== b[i]) {
        return false;
      }
    }
  }
  return true;
}
