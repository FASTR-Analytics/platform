// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { Csv } from "./csv.ts";
import type { CompareResult } from "./types.ts";

export function compareCsvs<T>(
  a: Csv<T>,
  b: Csv<T>,
  asNumbers?: "as-numbers",
): CompareResult {
  const differences: string[] = [];

  if (!arraysAreEqual(a.colHeaders, b.colHeaders, asNumbers)) {
    differences.push("Column headers differ");
  }

  if (!a.rowHeaders && b.rowHeaders) {
    differences.push("Row headers mismatch: a has none, b has headers");
  }
  if (a.rowHeaders && !b.rowHeaders) {
    differences.push("Row headers mismatch: a has headers, b has none");
  }
  if (
    a.rowHeaders &&
    b.rowHeaders &&
    !arraysAreEqual(a.rowHeaders, b.rowHeaders, asNumbers)
  ) {
    differences.push("Row headers content differs");
  }

  if (a.aoa.length !== b.aoa.length) {
    differences.push(
      `Row count mismatch: a has ${a.aoa.length}, b has ${b.aoa.length}`,
    );
  } else {
    for (let i = 0; i < a.aoa.length; i++) {
      if (!arraysAreEqual(a.aoa[i], b.aoa[i], asNumbers)) {
        differences.push(`Row ${i} content differs`);
      }
    }
  }

  return {
    identical: differences.length === 0,
    differences: differences.length > 0 ? differences : undefined,
  };
}

function arraysAreEqual<T>(
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
