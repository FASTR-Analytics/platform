// =============================================================================
// SHARED FIGURE-BLOCK TRANSFORMS (P2 — bundle backfill)
// =============================================================================
//
// A figure block stored in three surfaces — slides.config (layout tree),
// dashboard_items.figure_block, and reports.figures — is converted from the
// old shape { type:"figure", figureInputs?, source? } to the new bundle shape
// { type:"figure", bundle? }. The surface-specific sweeps call
// transformFigureBlockToBundle() after running any remaining pre-P2 migrations.
//
// CONVERSION by figure type:
//   chart/table/map  → items from jsonArray; valueProps from jsonDataConfig
//   timeseries       → reverse-transform stored grid → items; self-validates
//   empty placeholder (no source/figureInputs) → { type:"figure" } (no bundle)
//   custom source    → { type:"figure" } (custom had no data to capture)
//
// LOCALE: synthesized from _INSTANCE_LANGUAGE/_INSTANCE_CALENDAR (env) and
// countryIso3 passed from the surface-level caller (read from DB once per run).
//
// FAIL-FAST: timeseries round-trip failure throws (aborts boot per
// PROTOCOL_APP_MIGRATIONS decision 3). The dry-run gate catches these first.
//
// =============================================================================

import {
  figureBundleSchema,
  figureBlockSchema,
  isRollupActive,
  ROLLUP_PIN_IDS,
  presentationObjectConfigSchema,
} from "lib";
import {
  getTimeseriesDataTransformed,
  getPeriodIdFromTime,
  type PeriodType,
} from "@timroberton/panther";
import {
  _INSTANCE_LANGUAGE,
  _INSTANCE_CALENDAR,
} from "../../../exposed_env_vars.ts";
import { transformPOConfigData } from "./po_config.ts";

// ── Public types ──────────────────────────────────────────────────────────────

export type FigureBlockMut = {
  type: string;
  figureInputs?: Record<string, unknown>;
  source?: {
    type: string;
    config?: Record<string, unknown>;
    snapshotAt?: string;
    metricId?: string;
    indicatorMetadata?: unknown[];
  };
  bundle?: unknown;
};

export type FigureLocalizationForTransform = {
  language: "en" | "fr";
  calendar: "gregorian" | "ethiopian";
  countryIso3: string;
};

// ── Pre-P2 normalization (kept for any rows that still need it) ───────────────

// Normalize a figureInputs blob in place. Only acts on transformed chart data.
export function transformFigureInputs(fi: Record<string, unknown>): void {
  for (const dataKey of ["timeseriesData", "chartData", "chartOHData"]) {
    const d = fi[dataKey] as Record<string, unknown> | undefined;
    if (!d || d.isTransformed !== true) continue;

    // Block 9: Migrate yScaleAxisData → scaleAxisLimits + tierHeaders
    const yScaleAxisData = d.yScaleAxisData as Record<string, unknown> | undefined;
    if (!d.tierHeaders) {
      const oldTierHeaders = yScaleAxisData?.tierHeaders as string[] | undefined;
      d.tierHeaders = oldTierHeaders ?? ["default"];
    }
    if (!d.scaleAxisLimits && yScaleAxisData) {
      const oldPaneLimits = yScaleAxisData.paneLimits as Array<{
        valueMin: number; valueMax: number; tierLimits: Array<{ valueMin: number; valueMax: number }>;
      }>;
      const laneCount = (d.laneHeaders as string[] | undefined)?.length ?? 1;
      d.scaleAxisLimits = {
        paneLimits: oldPaneLimits.map((p) => ({
          valueMin: p.valueMin, valueMax: p.valueMax, tierLimits: p.tierLimits,
          laneLimits: Array.from({ length: laneCount }, () => ({ valueMin: p.valueMin, valueMax: p.valueMax })),
        })),
      };
      d.yScaleAxisLabel = yScaleAxisData.yScaleAxisLabel;
    }
    delete d.yScaleAxisData;

    // Block 10: Recompute scaleAxisLimits when missing or wrong-length
    if (d.values) {
      const paneCount = (d.paneHeaders as unknown[] | undefined)?.length ?? 1;
      const tierCount = (d.tierHeaders as unknown[] | undefined)?.length ?? 1;
      const laneCount = (d.laneHeaders as unknown[] | undefined)?.length ?? 1;
      const paneLimits = (d.scaleAxisLimits as { paneLimits?: { tierLimits?: unknown[]; laneLimits?: unknown[] }[] } | undefined)?.paneLimits;
      const malformed = !paneLimits || paneLimits.length !== paneCount ||
        paneLimits.some((p) => (p.tierLimits?.length ?? 0) !== tierCount || (p.laneLimits?.length ?? 0) !== laneCount);
      if (malformed) {
        d.scaleAxisLimits = recomputeScaleAxisLimits(
          d.values as (number | undefined)[][][][][],
          paneCount, tierCount, laneCount,
        );
      }
    }

    // Block 12: Normalize string[] headers → HeaderItem[]
    for (const headerKey of ["seriesHeaders", "laneHeaders", "tierHeaders", "paneHeaders", "indicatorHeaders"]) {
      const arr = d[headerKey];
      if (Array.isArray(arr)) {
        d[headerKey] = arr.map((h) => typeof h === "string" ? { id: h, label: h } : h);
      }
    }
  }
}

// Post-transform diagnostic: log stale figureInputs (the final parse throws).
export function warnIfFigureInputsStale(
  context: string,
  fi: Record<string, unknown> | undefined,
): void {
  // In P2, figureInputs are being removed entirely. This function is a no-op
  // since the bundle conversion handles all rows; old figureInputs that remain
  // after transformFigureBlockToBundle would indicate a conversion failure.
  if (fi !== undefined) {
    console.warn(`[data_transforms] ${context}: figureInputs still present after bundle conversion`);
  }
}

// Pre-P2 figure-block normalisation — run before bundle conversion.
export function transformFigureBlock(block: FigureBlockMut): void {
  if (block.type !== "figure") return;

  if (block.source?.type === "from_metric") {
    block.source.type = "from_data";
    if (!block.source.snapshotAt) {
      block.source.snapshotAt = new Date().toISOString();
    }
  }

  if (block.source?.type === "from_data" && block.source.config) {
    block.source.config = transformPOConfigData(block.source.config);
  }

  if (block.figureInputs) {
    transformFigureInputs(block.figureInputs);
  }
}

// ── P2 bundle conversion ──────────────────────────────────────────────────────

// Convert an old FigureBlock (figureInputs+source) to the new bundle shape.
// Mutates in place. Callers MUST run transformFigureBlock first.
// `geoData`: for dashboard items the stored geo_data column value (may be null);
//            for slides/reports pass null (geo will be a level reference).
export function transformFigureBlockToBundle(
  block: FigureBlockMut,
  localization: FigureLocalizationForTransform,
  geoData: unknown,
): void {
  if (block.type !== "figure") return;

  // Already in bundle format → nothing to do.
  if (block.bundle !== undefined) return;

  // No source or custom source → empty placeholder (no bundle).
  if (!block.source || block.source.type !== "from_data") {
    delete (block as Record<string, unknown>).figureInputs;
    delete (block as Record<string, unknown>).source;
    return;
  }

  const source = block.source;
  const fi = block.figureInputs;

  const config = source.config
    ? presentationObjectConfigSchema.safeParse(source.config)
    : undefined;

  if (!config?.success) {
    // source.config missing or invalid — fail-fast so the dry-run surfaces it
    // (a silent blank would pass figureBlockSchema and be masked as "empty").
    throw new Error(
      `[bundle-backfill] source.config missing or invalid for metricId=${source.metricId ?? "?"}: ` +
      (config ? JSON.stringify(config.error.issues.slice(0, 2)) : "no config"),
    );
  }

  const indicatorMetadata = Array.isArray(source.indicatorMetadata)
    ? (source.indicatorMetadata as unknown[]).filter(
        (m): m is Record<string, unknown> => m !== null && typeof m === "object",
      )
    : [];

  let bundle: Record<string, unknown> | undefined;

  if (fi) {
    bundle = buildBundleFromFigureInputs(
      fi,
      config.data,
      source.metricId ?? "",
      source.snapshotAt ?? new Date().toISOString(),
      indicatorMetadata,
      localization,
      geoData,
    );
  }

  if (bundle) {
    (block as Record<string, unknown>).bundle = bundle;
  }
  delete (block as Record<string, unknown>).figureInputs;
  delete (block as Record<string, unknown>).source;
}

// ── Bundle assembly from stored figureInputs ──────────────────────────────────

function buildBundleFromFigureInputs(
  fi: Record<string, unknown>,
  config: ReturnType<typeof presentationObjectConfigSchema.parse>,
  metricId: string,
  snapshotAt: string,
  indicatorMetadata: Record<string, unknown>[],
  localization: FigureLocalizationForTransform,
  geoData: unknown,
): Record<string, unknown> | undefined {
  const base = {
    config,
    localization,
    metricId,
    snapshotAt,
    indicatorMetadata,
    // moduleLastRun: best-effort (snapshot time ≠ run time; Phase 4 stale-flag
    // will be inaccurate for backfilled figures — acceptable for P2).
    provenance: { moduleLastRun: snapshotAt, datasetsVersion: "" },
  };

  // chart/table/map: extract items from jsonArray
  for (const dataKey of ["chartData", "chartOHData", "tableData", "mapData"] as const) {
    const d = fi[dataKey] as Record<string, unknown> | undefined;
    if (!d) continue;
    const jsonArray = d.jsonArray as Record<string, string>[] | undefined;
    const jdc = d.jsonDataConfig as Record<string, unknown> | undefined;
    if (!Array.isArray(jsonArray) || !jdc) continue;

    const valueProps = Array.isArray(jdc.valueProps) ? (jdc.valueProps as string[]) : [];
    const geo = resolveGeo(config, geoData);

    // Normalize all values to strings — stored jsonArrays may carry numeric
    // year/value columns (postgres returns integers as JS numbers), but the
    // bundle schema requires Record<string, string>.
    const stringItems: Record<string, string>[] = jsonArray.map((row) =>
      Object.fromEntries(
        Object.entries(row).map(([k, v]) => [k, v === null || v === undefined ? "" : String(v)]),
      )
    );

    return {
      ...base,
      items: stringItems,
      resultsValue: { formatAs: inferFormatAs(indicatorMetadata), valueProps },
      dateRange: deriveDateRangeFromItems(jsonArray),
      geo,
    };
  }

  // timeseries: reverse-transform stored grid → items
  const tsData = fi.timeseriesData as Record<string, unknown> | undefined;
  if (tsData && tsData.isTransformed === true) {
    try {
      const { items, jdc } = reverseTransformTimeseries(tsData, config as unknown as Record<string, unknown>);
      const valueProps = Array.isArray(jdc.valueProps) ? (jdc.valueProps as string[]) : [];
      const geo = resolveGeo(config, geoData);

      // Derive dateRange from stored timeMin/nTimePoints before validating,
      // so any round-trip mismatch is the only reason to throw.
      const periodType = tsData.periodType as PeriodType | undefined ?? "year";
      const timeMin = tsData.timeMin as number | undefined ?? 0;
      const nTimePoints = tsData.nTimePoints as number | undefined ?? 0;
      const tsDateRange = nTimePoints > 0
        ? {
            min: getPeriodIdFromTime(timeMin, periodType),
            max: getPeriodIdFromTime(timeMin + nTimePoints - 1, periodType),
          }
        : undefined;

      validateTimeseriesRoundTrip(items, jdc, tsData);

      return {
        ...base,
        items,
        resultsValue: { formatAs: inferFormatAs(indicatorMetadata), valueProps },
        dateRange: tsDateRange,
        geo,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`[bundle-backfill] timeseries round-trip FAIL for metric=${metricId}: ${msg}`);
    }
  }

  // figureInputs present but no recognized data key → drop (e.g. empty figure).
  return undefined;
}

// ── Timeseries reverse-transform ──────────────────────────────────────────────
//
// Stored TimeseriesDataTransformed has:
//   periodType, timeMin, nTimePoints, seriesHeaders, laneHeaders, tierHeaders,
//   paneHeaders, values[pane][tier][lane][series][time]
// Time labels are reconstructed via getPeriodIdFromTime(timeMin + i, periodType).
// --v wide format: seriesHeaders[i].id is a valueProp name.
// Single-valueProp: seriesProp column carries the series header id.

function reverseTransformTimeseries(
  tsData: Record<string, unknown>,
  sourceConfig: Record<string, unknown>,
): { items: Record<string, string>[]; jdc: Record<string, unknown> } {
  const periodType = tsData.periodType as PeriodType | undefined ?? "year";
  const timeMin = tsData.timeMin as number | undefined ?? 0;
  const nTimePoints = tsData.nTimePoints as number | undefined ?? 0;

  // Reconstruct time labels from stored numeric encoding.
  const timeLabels: string[] = [];
  for (let i = 0; i < nTimePoints; i++) {
    const periodId = getPeriodIdFromTime(timeMin + i, periodType);
    timeLabels.push(String(periodId));
  }

  const toHeaders = (arr: unknown): { id: string; label: string }[] => {
    if (!Array.isArray(arr) || arr.length === 0) return [{ id: "--v", label: "--v" }];
    return arr.map((h) =>
      typeof h === "string" ? { id: h, label: h } : (h as { id: string; label: string }),
    );
  };

  const paneHeaders = toHeaders(tsData.paneHeaders);
  const tierHeaders = toHeaders(tsData.tierHeaders);
  const laneHeaders = toHeaders(tsData.laneHeaders);
  const seriesHeaders = toHeaders(tsData.seriesHeaders);

  // 5D array: pane × tier × lane × series × time
  type V5D = (number | null | undefined)[][][][][];
  const values = tsData.values as V5D | undefined;
  if (!values) throw new Error("missing values array");

  // Derive periodProp from periodType
  const periodProp = periodType === "year" ? "year"
    : periodType === "year-month" ? "period_id"
    : "quarter_id";

  // Detect wide format (--v): first seriesHeader.id is a known valueProp name.
  // In wide format, seriesProp is "--v" and each series header maps to a valueProp.
  const configD = sourceConfig.d as Record<string, unknown> | undefined;
  const timeseriesGrouping = configD?.timeseriesGrouping as string | undefined ?? periodProp;
  const disaggregateBy = Array.isArray(configD?.disaggregateBy)
    ? (configD!.disaggregateBy as { disOpt: string; disDisplayOpt?: string }[])
    : [];

  // Reconstruct which columns map to which display axis.
  // seriesProp is the disaggregation option with disDisplayOpt "series", or "--v" if none.
  const seriesDisOpt = disaggregateBy.find((d) => d.disDisplayOpt === "series")?.disOpt;
  const panePanelDisOpt = disaggregateBy.find((d) => d.disDisplayOpt === "cell")?.disOpt;
  const laneDisOpt = disaggregateBy.find((d) => d.disDisplayOpt === "col" || d.disDisplayOpt === "colGroup")?.disOpt;
  const tierDisOpt = disaggregateBy.find((d) => d.disDisplayOpt === "row" || d.disDisplayOpt === "rowGroup")?.disOpt;

  const isWideFormat = !seriesDisOpt;
  const seriesProp = seriesDisOpt ?? "--v";
  const paneProp = panePanelDisOpt;
  const laneProp = laneDisOpt;
  const tierProp = tierDisOpt;

  // valueProps: in wide format, each series header id IS a valueProp.
  // In single-valueProp format, use the first disaggregation value column.
  const valueProps = isWideFormat
    ? seriesHeaders.map((h) => h.id)
    : [disaggregateBy.find((d) => d.disDisplayOpt === "series" || d.disDisplayOpt === "col")?.disOpt ?? "--v"];

  const rows: Record<string, string>[] = [];

  for (let iPn = 0; iPn < paneHeaders.length; iPn++) {
    for (let iTr = 0; iTr < tierHeaders.length; iTr++) {
      for (let iLn = 0; iLn < laneHeaders.length; iLn++) {
        if (isWideFormat) {
          for (let iT = 0; iT < nTimePoints; iT++) {
            const row: Record<string, string> = { [timeseriesGrouping]: timeLabels[iT] };
            if (paneProp && paneHeaders.length > 1) row[paneProp] = paneHeaders[iPn].id;
            if (tierProp && tierHeaders.length > 1) row[tierProp] = tierHeaders[iTr].id;
            if (laneProp && laneHeaders.length > 1) row[laneProp] = laneHeaders[iLn].id;
            let hasAnyValue = false;
            for (let iSr = 0; iSr < seriesHeaders.length; iSr++) {
              const v = values[iPn]?.[iTr]?.[iLn]?.[iSr]?.[iT];
              if (v !== undefined && v !== null) {
                row[seriesHeaders[iSr].id] = String(v);
                hasAnyValue = true;
              }
            }
            if (hasAnyValue) rows.push(row);
          }
        } else {
          const valueProp = valueProps[0] ?? "--v";
          for (let iSr = 0; iSr < seriesHeaders.length; iSr++) {
            for (let iT = 0; iT < nTimePoints; iT++) {
              const v = values[iPn]?.[iTr]?.[iLn]?.[iSr]?.[iT];
              if (v === undefined || v === null) continue;
              const row: Record<string, string> = {
                [timeseriesGrouping]: timeLabels[iT],
                [valueProp]: String(v),
              };
              if (paneProp && paneHeaders.length > 1) row[paneProp] = paneHeaders[iPn].id;
              if (tierProp && tierHeaders.length > 1) row[tierProp] = tierHeaders[iTr].id;
              if (laneProp && laneHeaders.length > 1) row[laneProp] = laneHeaders[iLn].id;
              if (seriesProp !== "--v") row[seriesProp] = seriesHeaders[iSr].id;
              rows.push(row);
            }
          }
        }
      }
    }
  }

  // Replicate getRollupAwareSort(config): the original capture used this for
  // all axes, so the round-trip validation must use the same sort. Mismatch
  // would produce a different header order → different values grid → FAIL.
  const parsedConfig = presentationObjectConfigSchema.safeParse(sourceConfig);
  const rollupSort: unknown = parsedConfig.success && isRollupActive(parsedConfig.data)
    ? parsedConfig.data.d.adminAreaRollupPosition === "top"
      ? { base: "by-label", first: ROLLUP_PIN_IDS }
      : { base: "by-label", last: ROLLUP_PIN_IDS }
    : "by-label";

  // Build a minimal jsonDataConfig for self-validation.
  const jdc: Record<string, unknown> = {
    valueProps,
    periodProp: timeseriesGrouping,
    periodType,
    seriesProp,
    paneProp,
    laneProp,
    tierProp,
    sort: { series: rollupSort, lane: rollupSort, tier: rollupSort, pane: rollupSort },
  };

  return { items: rows, jdc };
}

function validateTimeseriesRoundTrip(
  items: Record<string, string>[],
  jdc: Record<string, unknown>,
  storedTsData: Record<string, unknown>,
): void {
  const result = getTimeseriesDataTransformed(
    { jsonArray: items, jsonDataConfig: jdc } as Parameters<typeof getTimeseriesDataTransformed>[0],
    false,
  );

  const storedNTimePoints = storedTsData.nTimePoints as number | undefined ?? 0;
  if (result.nTimePoints !== storedNTimePoints) {
    throw new Error(
      `nTimePoints mismatch: stored=${storedNTimePoints}, reconstructed=${result.nTimePoints}`,
    );
  }

  const storedValues = storedTsData.values as unknown;
  const resultValues = result.values;
  const storedStr = JSON.stringify(storedValues);
  const resultStr = JSON.stringify(resultValues);
  if (storedStr !== resultStr) {
    throw new Error(`values grid mismatch (stored vs reconstructed, first 300 chars): ${storedStr.slice(0, 300)} != ${resultStr.slice(0, 300)}`);
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

// Scan items for known period columns and return min/max for DATE_RANGE tokens.
// If no period column is found, returns undefined (captions with DATE_RANGE will
// render the literal token — acceptable only if no such captions exist).
function deriveDateRangeFromItems(
  items: Record<string, string>[],
): { min: number; max: number } | undefined {
  const PERIOD_COLS = ["period_id", "year", "quarter_id", "month", "year_of_activity"];
  for (const col of PERIOD_COLS) {
    const values: number[] = [];
    for (const row of items) {
      const v = row[col];
      if (v !== undefined && v !== null) {
        const n = Number(v);
        if (!isNaN(n)) values.push(n);
      }
    }
    if (values.length > 0) {
      return { min: Math.min(...values), max: Math.max(...values) };
    }
  }
  return undefined;
}

function inferFormatAs(
  indicatorMetadata: Record<string, unknown>[],
): "percent" | "number" {
  if (indicatorMetadata.length === 0) return "number";
  const allPercent = indicatorMetadata.every(
    (m) => m.format_as === "percent",
  );
  return allPercent ? "percent" : "number";
}

function resolveGeo(
  config: ReturnType<typeof presentationObjectConfigSchema.parse>,
  geoData: unknown,
): { kind: "data"; data: unknown } | { kind: "level"; level: number } | undefined {
  if (config.d.type !== "map") return undefined;

  // If caller provided stored geoData (dashboard geo_data column), use it.
  if (geoData !== null && geoData !== undefined) {
    return { kind: "data", data: geoData };
  }

  // For slides/reports, geo was stripped; store the level so buildFigureInputs
  // can re-derive the GeoJSON from the sync cache at render time.
  const mapAdminArea = (config.d as Record<string, unknown>).adminArea;
  const level = typeof mapAdminArea === "number" ? mapAdminArea : undefined;
  if (level !== undefined) {
    return { kind: "level", level };
  }

  return undefined;
}

function recomputeScaleAxisLimits(
  values: (number | undefined)[][][][][],
  paneCount: number,
  tierCount: number,
  laneCount: number,
): { paneLimits: Array<{ valueMin: number; valueMax: number; tierLimits: Array<{ valueMin: number; valueMax: number }>; laneLimits: Array<{ valueMin: number; valueMax: number }> }> } {
  const paneLimits = Array.from({ length: paneCount }, () => ({
    valueMin: Number.POSITIVE_INFINITY, valueMax: Number.NEGATIVE_INFINITY,
    tierLimits: Array.from({ length: tierCount }, () => ({ valueMin: Number.POSITIVE_INFINITY, valueMax: Number.NEGATIVE_INFINITY })),
    laneLimits: Array.from({ length: laneCount }, () => ({ valueMin: Number.POSITIVE_INFINITY, valueMax: Number.NEGATIVE_INFINITY })),
  }));

  for (let iPn = 0; iPn < paneCount; iPn++) {
    for (let iTr = 0; iTr < tierCount; iTr++) {
      for (let iLn = 0; iLn < laneCount; iLn++) {
        const seriesArray = values[iPn]?.[iTr]?.[iLn];
        if (!seriesArray) continue;
        for (const lastDimArray of seriesArray) {
          if (!lastDimArray) continue;
          for (const value of lastDimArray) {
            if (value === undefined || value === null) continue;
            const p = paneLimits[iPn];
            p.valueMin = Math.min(p.valueMin, value);
            p.valueMax = Math.max(p.valueMax, value);
            p.tierLimits[iTr].valueMin = Math.min(p.tierLimits[iTr].valueMin, value);
            p.tierLimits[iTr].valueMax = Math.max(p.tierLimits[iTr].valueMax, value);
            p.laneLimits[iLn].valueMin = Math.min(p.laneLimits[iLn].valueMin, value);
            p.laneLimits[iLn].valueMax = Math.max(p.laneLimits[iLn].valueMax, value);
          }
        }
      }
    }
  }

  for (const p of paneLimits) {
    if (!isFinite(p.valueMin)) p.valueMin = 0;
    if (!isFinite(p.valueMax)) p.valueMax = 1;
    for (const t of p.tierLimits) {
      if (!isFinite(t.valueMin)) t.valueMin = 0;
      if (!isFinite(t.valueMax)) t.valueMax = 1;
    }
    for (const l of p.laneLimits) {
      if (!isFinite(l.valueMin)) l.valueMin = 0;
      if (!isFinite(l.valueMax)) l.valueMax = 1;
    }
  }

  return { paneLimits };
}

// ── Instance localization helper (used by surface-level callers) ──────────────

export function getTransformLocalization(
  countryIso3: string,
): FigureLocalizationForTransform {
  return {
    language: _INSTANCE_LANGUAGE as "en" | "fr",
    calendar: _INSTANCE_CALENDAR as "gregorian" | "ethiopian",
    countryIso3,
  };
}
