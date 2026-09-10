// Pure/dispatcher logic for the DHIS2 import run worker, kept out of
// worker.ts so it can be imported (and verified) outside a worker context:
// worker.ts touches worker globals at module scope.

import type { DatasetHmisLedgerSkippedValue, Dhis2FetchErrorKind } from "lib";
import type { DHIS2FetchError } from "../../dhis2/common/mod.ts";
import type { FetchOptions } from "../../dhis2/common/base_fetcher.ts";
import {
  type DHIS2DataValue,
  getExistingMetadataIds,
} from "../../dhis2/goal5_data_value_sets/mod.ts";

const UID_RE = /^[a-zA-Z][a-zA-Z0-9]{10}$/;
const OPERAND_RE = /^([a-zA-Z][a-zA-Z0-9]{10})\.([a-zA-Z][a-zA-Z0-9]{10})$/;

// Dispatcher classification per raw indicator. "dvs" is a data element or
// operand, fetched from dataValueSets: the values facilities reported, the
// importer's only route. "unknown" gets no fetch and a permanent ledger
// error: a DHIS2 indicator is a formula the importer never evaluates (it is
// re-created through the decomposition importer), and anything else matches
// no DHIS2 metadata at all.
export type RawRoute =
  | { kind: "dvs"; baseElementId: string; coc: string | undefined }
  | { kind: "unknown"; reason: "not_found" | "dhis2_indicator" };

// Dynamic per run: DHIS2 metadata is the source of truth, no stored type
// field to drift (robustness ruling).
export async function classifyRawIndicators(
  rawIds: string[],
  fetchOptions: FetchOptions,
): Promise<Map<string, RawRoute>> {
  const parsed = rawIds.map((id) => {
    const operandMatch = id.match(OPERAND_RE);
    if (operandMatch) {
      return {
        id,
        base: operandMatch[1] as string | undefined,
        coc: operandMatch[2] as string | undefined,
      };
    }
    if (UID_RE.test(id)) {
      return { id, base: id as string | undefined, coc: undefined };
    }
    // Not UID-shaped at all: cannot be a valid dx.
    return { id, base: undefined, coc: undefined };
  });

  const bases = parsed
    .filter((p) => p.base !== undefined)
    .map((p) => p.base as string);
  const dataElementSet = bases.length
    ? await getExistingMetadataIds("dataElements", bases, fetchOptions)
    : new Set<string>();

  const indicatorCandidates = parsed
    .filter(
      (p) =>
        p.base !== undefined &&
        p.coc === undefined &&
        !dataElementSet.has(p.base),
    )
    .map((p) => p.id);
  const indicatorSet = indicatorCandidates.length
    ? await getExistingMetadataIds("indicators", indicatorCandidates, fetchOptions)
    : new Set<string>();

  const cocCandidates = parsed
    .filter(
      (p) =>
        p.coc !== undefined &&
        p.base !== undefined &&
        dataElementSet.has(p.base),
    )
    .map((p) => p.coc as string);
  const cocSet = cocCandidates.length
    ? await getExistingMetadataIds("categoryOptionCombos", cocCandidates, fetchOptions)
    : new Set<string>();

  const routes = new Map<string, RawRoute>();
  for (const p of parsed) {
    if (p.base === undefined) {
      routes.set(p.id, { kind: "unknown", reason: "not_found" });
    } else if (p.coc !== undefined) {
      routes.set(
        p.id,
        dataElementSet.has(p.base) && cocSet.has(p.coc)
          ? { kind: "dvs", baseElementId: p.base, coc: p.coc }
          : { kind: "unknown", reason: "not_found" },
      );
    } else if (dataElementSet.has(p.base)) {
      routes.set(p.id, { kind: "dvs", baseElementId: p.base, coc: undefined });
    } else if (indicatorSet.has(p.id)) {
      routes.set(p.id, { kind: "unknown", reason: "dhis2_indicator" });
    } else {
      routes.set(p.id, { kind: "unknown", reason: "not_found" });
    }
  }
  return routes;
}

export function pairKey(p: { indicatorRawId: string; periodId: number }): string {
  return `${p.indicatorRawId}|${p.periodId}`;
}

// Size/timeout never shrink on an identical retry: the caller splits by
// org-unit subtree instead.
export function isSplittableDvsError(message: string): boolean {
  return (
    message.includes("response exceeded") || message.includes("timeout after")
  );
}

// Mirrors the connector's default shouldRetry (retry_utils): 4xx≠429 never.
export function defaultShouldRetry(message: string): boolean {
  if (
    message.includes("API Error (4") ||
    message.includes("download failed: 4")
  ) {
    return message.includes("429");
  }
  return true;
}

// 4xx (except 429) is a deterministic config error: the connector never
// retries it and re-running without a config fix will fail again. Everything
// else (5xx/timeout/network/size) is server health and may succeed on a
// later re-run.
export function describeFetchError(error: unknown): {
  message: string;
  kind: Dhis2FetchErrorKind;
} {
  const message = error instanceof Error ? error.message : String(error);
  const status = (error as DHIS2FetchError).status;
  if (typeof status === "number") {
    return {
      message,
      kind:
        status >= 400 && status < 500 && status !== 429
          ? "permanent"
          : "transient",
    };
  }
  if (
    message.includes("API Error (4") &&
    !message.includes("API Error (429")
  ) {
    return { message, kind: "permanent" };
  }
  return { message, kind: "transient" };
}

export const SKIPPED_VALUES_SAMPLE_CAP = 10;

export type DvsCoveredPair = {
  indicatorRawId: string;
  coc: string | undefined;
  periodId: number;
};

export type DvsPairReduction = {
  rows: Array<{ facilityId: string; count: number }>;
  skippedValues: number;
  skippedValuesSample: DatasetHmisLedgerSkippedValue[];
};

// A stored count is a non-negative integer, so that is the only facility
// value accepted; blank, non-numeric, fractional and negative values are
// skipped. Numeric parsing (not a digit-only pattern) because NUMBER-typed
// elements report integers as "12.0".
export function parseNonNegativeInteger(raw: string): number | undefined {
  const trimmed = raw.trim();
  if (trimmed === "") {
    return undefined;
  }
  const n = Number(trimmed);
  return Number.isInteger(n) && n >= 0 ? n : undefined;
}

// Client-side reduce of one dataValueSets pull (one base element, one month)
// into every pair it covers: deleted values and facilities outside the run
// scope are ignored; an operand's pair takes only its COC; accepted values
// are summed per facility across COC×AOC, so the sum is a non-negative
// integer by construction and nothing truncates. A skipped value is counted
// on the pair with a capped sample, and the pair still integrates: failing
// it would block the source-month for every facility in the country on one
// facility's decimal, and the ledger has no per-facility grain, so
// skip-and-record is what keeps refresh alive and the anomaly visible.
export function reduceDvsValues(
  values: DHIS2DataValue[],
  coveredPairs: DvsCoveredPair[],
  facilitySet: Set<string>,
): Map<string, DvsPairReduction> {
  const sums = new Map<string, Map<string, number>>();
  const reductions = new Map<string, DvsPairReduction>();
  for (const covered of coveredPairs) {
    sums.set(pairKey(covered), new Map());
    reductions.set(pairKey(covered), {
      rows: [],
      skippedValues: 0,
      skippedValuesSample: [],
    });
  }
  for (const v of values) {
    if (v.deleted || !facilitySet.has(v.orgUnit)) {
      continue;
    }
    const count = parseNonNegativeInteger(v.value);
    for (const covered of coveredPairs) {
      if (covered.coc !== undefined && v.categoryOptionCombo !== covered.coc) {
        continue;
      }
      const key = pairKey(covered);
      if (count === undefined) {
        const reduction = reductions.get(key)!;
        reduction.skippedValues++;
        if (reduction.skippedValuesSample.length < SKIPPED_VALUES_SAMPLE_CAP) {
          reduction.skippedValuesSample.push({
            facilityId: v.orgUnit,
            value: v.value,
          });
        }
        continue;
      }
      const facilityMap = sums.get(key)!;
      facilityMap.set(v.orgUnit, (facilityMap.get(v.orgUnit) ?? 0) + count);
    }
  }
  for (const [key, facilityMap] of sums) {
    reductions.get(key)!.rows = Array.from(
      facilityMap,
      ([facilityId, count]) => ({ facilityId, count }),
    );
  }
  return reductions;
}
