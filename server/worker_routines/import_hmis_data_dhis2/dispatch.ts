// Pure/dispatcher logic for the DHIS2 import run worker, kept out of
// worker.ts so it can be imported (and verified) outside a worker context:
// worker.ts touches worker globals at module scope.

import {
  type DatasetHmisLedgerSkippedValue,
  DHIS2_OPERAND_PATTERN,
  DHIS2_UID_PATTERN,
  type Dhis2FetchErrorKind,
  type Dhis2PullBy,
  type Dhis2RunPair,
} from "lib";
import type { DHIS2FetchError } from "../../dhis2/common/mod.ts";
import type { FetchOptions } from "../../dhis2/common/base_fetcher.ts";
import { parseDhis2Release } from "../../dhis2/common/system_info.ts";
import {
  type DHIS2DataValue,
  type Dhis2ValueSelector,
  getExistingMetadataIds,
} from "../../dhis2/goal5_data_value_sets/mod.ts";

// Dispatcher classification per data id. "dvs" is a data element or
// operand, fetched from dataValueSets: the values facilities reported, the
// importer's only route. "unknown" gets no fetch and a permanent ledger
// error: a DHIS2 indicator is a formula the importer never evaluates (it is
// re-created through the decomposition importer), and anything else matches
// no DHIS2 metadata at all.
export type ElementRoute =
  | { kind: "dvs"; dataElementId: string; coc: string | undefined }
  | { kind: "unknown"; reason: "not_found" | "dhis2_indicator" };

// Dynamic per run: DHIS2 metadata is the source of truth, no stored type
// field to drift (robustness ruling).
export async function classifyElements(
  dataIds: string[],
  fetchOptions: FetchOptions,
): Promise<Map<string, ElementRoute>> {
  const parsed = dataIds.map((id) => {
    const operandMatch = id.match(DHIS2_OPERAND_PATTERN);
    if (operandMatch) {
      return {
        id,
        element: operandMatch[1] as string | undefined,
        coc: operandMatch[2] as string | undefined,
      };
    }
    if (DHIS2_UID_PATTERN.test(id)) {
      return { id, element: id as string | undefined, coc: undefined };
    }
    // Not UID-shaped at all: cannot be a valid dx.
    return { id, element: undefined, coc: undefined };
  });

  const elements = parsed
    .filter((p) => p.element !== undefined)
    .map((p) => p.element as string);
  const dataElementSet = elements.length
    ? await getExistingMetadataIds("dataElements", elements, fetchOptions)
    : new Set<string>();

  const indicatorCandidates = parsed
    .filter(
      (p) =>
        p.element !== undefined &&
        p.coc === undefined &&
        !dataElementSet.has(p.element),
    )
    .map((p) => p.id);
  const indicatorSet = indicatorCandidates.length
    ? await getExistingMetadataIds(
      "indicators",
      indicatorCandidates,
      fetchOptions,
    )
    : new Set<string>();

  const cocCandidates = parsed
    .filter(
      (p) =>
        p.coc !== undefined &&
        p.element !== undefined &&
        dataElementSet.has(p.element),
    )
    .map((p) => p.coc as string);
  const cocSet = cocCandidates.length
    ? await getExistingMetadataIds(
      "categoryOptionCombos",
      cocCandidates,
      fetchOptions,
    )
    : new Set<string>();

  const routes = new Map<string, ElementRoute>();
  for (const p of parsed) {
    if (p.element === undefined) {
      routes.set(p.id, { kind: "unknown", reason: "not_found" });
    } else if (p.coc !== undefined) {
      routes.set(
        p.id,
        dataElementSet.has(p.element) && cocSet.has(p.coc)
          ? { kind: "dvs", dataElementId: p.element, coc: p.coc }
          : { kind: "unknown", reason: "not_found" },
      );
    } else if (dataElementSet.has(p.element)) {
      routes.set(p.id, {
        kind: "dvs",
        dataElementId: p.element,
        coc: undefined,
      });
    } else if (indicatorSet.has(p.id)) {
      routes.set(p.id, { kind: "unknown", reason: "dhis2_indicator" });
    } else {
      routes.set(p.id, { kind: "unknown", reason: "not_found" });
    }
  }
  return routes;
}

export function pairKey(p: { dataId: string; periodId: number }): string {
  return `${p.dataId}|${p.periodId}`;
}

// The dataValueSets export reads dataElement= from DHIS2 2.39. An earlier
// release ignores it, resolves an empty selection and answers 409 E2001, so
// there every pull names the monthly data set the element is collected in.
// Undefined when the reported version cannot be read: the caller fails the
// run rather than guess.
const DATA_ELEMENT_SELECTOR_FROM_RELEASE = 39;

export function pullByForVersion(
  version: string | undefined,
): Dhis2PullBy | undefined {
  const release = parseDhis2Release(version);
  if (release === undefined) {
    return undefined;
  }
  return release >= DATA_ELEMENT_SELECTOR_FROM_RELEASE
    ? "dataElement"
    : "dataSet";
}

export type PullTask = {
  selector: Dhis2ValueSelector;
  // One pull = one month: the fetch unit matches the import unit.
  periodId: number;
  // Every data id this pull covers for that month: operands sharing a data
  // element share one pull, and so do elements sharing a data set.
  coveredPairs: DvsCoveredPair[];
};

// One task per pull: the pairs sharing a selector and a month, months in
// order. By data set, a pair whose element is in no monthly data set has no
// selector and no task: the caller already refused it.
export function buildPullTasks(
  pairs: Dhis2RunPair[],
  routes: Map<string, ElementRoute>,
  pullBy: Dhis2PullBy,
  dataSetByElement: Map<string, string>,
): PullTask[] {
  const bySelector = new Map<string, Map<number, DvsCoveredPair[]>>();
  for (const pair of pairs) {
    const route = routes.get(pair.dataId);
    if (route?.kind !== "dvs") {
      continue;
    }
    const selectorId = pullBy === "dataElement"
      ? route.dataElementId
      : dataSetByElement.get(route.dataElementId);
    if (selectorId === undefined) {
      continue;
    }
    let byPeriod = bySelector.get(selectorId);
    if (!byPeriod) {
      byPeriod = new Map();
      bySelector.set(selectorId, byPeriod);
    }
    let covered = byPeriod.get(pair.periodId);
    if (!covered) {
      covered = [];
      byPeriod.set(pair.periodId, covered);
    }
    covered.push({
      dataId: pair.dataId,
      dataElementId: route.dataElementId,
      coc: route.coc,
      periodId: pair.periodId,
    });
  }
  const tasks: PullTask[] = [];
  for (const [id, byPeriod] of bySelector) {
    const periods = Array.from(byPeriod.keys()).sort((a, b) => a - b);
    for (const periodId of periods) {
      tasks.push({
        selector: { kind: pullBy, id },
        periodId,
        coveredPairs: byPeriod.get(periodId)!,
      });
    }
  }
  return tasks;
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
      kind: status >= 400 && status < 500 && status !== 429
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
  dataId: string;
  // The element whose values the pair takes: a pull by data set carries
  // every element of the set.
  dataElementId: string;
  coc: string | undefined;
  periodId: number;
};

export type DvsPairReduction = {
  rows: Array<{ facilityId: string; count: number }>;
  skippedValues: number;
  skippedValuesSample: DatasetHmisLedgerSkippedValue[];
};

// A stored count is a non-negative integer, so that is the only facility
// value accepted; missing, null, blank, non-numeric, fractional and negative
// values are skipped. Numeric parsing (not a digit-only pattern) because
// NUMBER-typed elements report integers as "12.0".
export function parseNonNegativeInteger(
  raw: string | null | undefined,
): number | undefined {
  const trimmed = raw?.trim() ?? "";
  if (trimmed === "") {
    return undefined;
  }
  const n = Number(trimmed);
  return Number.isInteger(n) && n >= 0 ? n : undefined;
}

// Client-side reduce of one dataValueSets pull (one selector, one month)
// into every pair it covers: deleted values and facilities outside the run
// scope are ignored; a pair takes only its element's values (a pull by data
// set carries every element of the set) and an operand's pair only its COC;
// accepted values
// are summed per facility across COC×AOC, so the sum is a non-negative
// integer by construction and nothing truncates. A skipped value is counted
// on the pair with a capped sample, and the pair still integrates: failing
// it would block the data id's month for every facility in the country on
// one facility's decimal, and the ledger has no per-facility grain, so
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
    if (v.deleted || v.orgUnit == null || !facilitySet.has(v.orgUnit)) {
      continue;
    }
    const count = parseNonNegativeInteger(v.value);
    for (const covered of coveredPairs) {
      if (
        v.dataElement !== covered.dataElementId ||
        (covered.coc !== undefined && v.categoryOptionCombo !== covered.coc)
      ) {
        continue;
      }
      const key = pairKey(covered);
      if (count === undefined) {
        const reduction = reductions.get(key)!;
        reduction.skippedValues++;
        if (reduction.skippedValuesSample.length < SKIPPED_VALUES_SAMPLE_CAP) {
          reduction.skippedValuesSample.push({
            facilityId: v.orgUnit,
            value: v.value ?? "",
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
