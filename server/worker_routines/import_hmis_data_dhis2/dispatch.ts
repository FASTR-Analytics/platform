// Pure/dispatcher logic for the DHIS2 import run worker, kept out of
// worker.ts so it can be imported (and verified) outside a worker context —
// worker.ts touches worker globals at module scope.

import type { Dhis2Credentials, Dhis2FetchErrorKind } from "lib";
import { buildUrl, type DHIS2FetchError } from "../../dhis2/common/mod.ts";
import type { FetchOptions } from "../../dhis2/common/base_fetcher.ts";
import { getExistingMetadataIds } from "../../dhis2/goal5_data_value_sets/mod.ts";

const UID_RE = /^[a-zA-Z][a-zA-Z0-9]{10}$/;
const OPERAND_RE = /^([a-zA-Z][a-zA-Z0-9]{10})\.([a-zA-Z][a-zA-Z0-9]{10})$/;

// Dispatcher classification per raw indicator (PLAN_DHIS2_IMPORTER §4.4
// rules 1-4).
export type RawRoute =
  | { kind: "dvs"; baseElementId: string; coc: string | undefined }
  | { kind: "analytics" }
  | { kind: "unknown" };

// Dynamic per run — DHIS2 metadata is the source of truth, no stored type
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
    // Not UID-shaped at all — cannot be a valid dx.
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
      routes.set(p.id, { kind: "unknown" });
    } else if (p.coc !== undefined) {
      routes.set(
        p.id,
        dataElementSet.has(p.base) && cocSet.has(p.coc)
          ? { kind: "dvs", baseElementId: p.base, coc: p.coc }
          : { kind: "unknown" },
      );
    } else if (dataElementSet.has(p.base)) {
      routes.set(p.id, { kind: "dvs", baseElementId: p.base, coc: undefined });
    } else if (indicatorSet.has(p.id)) {
      // Computed DHIS2 indicator: keep the analytics engine for formulas —
      // never hand-reconstruct numerators (robustness ruling).
      routes.set(p.id, { kind: "analytics" });
    } else {
      routes.set(p.id, { kind: "unknown" });
    }
  }
  return routes;
}

export function pairKey(p: { indicatorRawId: string; periodId: number }): string {
  return `${p.indicatorRawId}|${p.periodId}`;
}

// Size/timeout never shrink on an identical retry — the caller splits by
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

export function assertUrlWithinLimit(args: {
  rawIndicatorId: string;
  period: string;
  facilityBatch: string[];
  credentials: Dhis2Credentials;
  maxUrlLength: number;
  facilityBatchSize: number;
}): void {
  // Measure the URL exactly as getAnalyticsFromDHIS2 builds it.
  const searchParams = new URLSearchParams();
  searchParams.append("dimension", `dx:${args.rawIndicatorId}`);
  searchParams.append("dimension", `pe:${args.period}`);
  searchParams.append("dimension", `ou:${args.facilityBatch.join(";")}`);
  searchParams.set("skipMeta", "true");
  const fullUrl = buildUrl(
    "/api/analytics.json",
    args.credentials.url,
    searchParams,
  );
  if (fullUrl.length > args.maxUrlLength) {
    // Marker string matched by describeFetchError — deterministic config
    // error (batch size), permanent until the env changes.
    throw new Error(
      `URL length ${fullUrl.length} exceeds safe limit of ${args.maxUrlLength} characters for batch with ${args.facilityBatch.length} facilities. ` +
        `Reduce the DHIS2_FACILITY_BATCH_SIZE env variable (currently ${args.facilityBatchSize}).`,
    );
  }
}

// 4xx (except 429) is a deterministic config error — the connector never
// retries it and re-running without a config fix will fail again. The URL
// guard is likewise deterministic. Everything else (5xx/timeout/network/size)
// is server health and may succeed on a later re-run.
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
  if (message.includes("exceeds safe limit")) {
    return { message, kind: "permanent" };
  }
  if (message.includes("unrecognized headers")) {
    // Header shape is a deterministic property of the DHIS2 server/version —
    // the pair fails identically on every retry until the config changes.
    return { message, kind: "permanent" };
  }
  return { message, kind: "transient" };
}
