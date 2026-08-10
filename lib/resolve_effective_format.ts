import type { PresentationObjectConfig } from "./types/_presentation_object_config.ts";
import {
  INDICATOR_DISAGGREGATION_OPTIONS,
  type DisaggregationOption,
} from "./types/disaggregation_options.ts";
import type { IndicatorFormat, IndicatorMetadata } from "./types/indicators.ts";
import type { MetricFormatAs } from "./types/modules.ts";
import type { DisaggregationPossibleValuesStatus } from "./types/presentation_objects.ts";

// ============================================================================
// The one effective-format resolver. Format has a DECLARED source:
//
// - `formatAs: "percent" | "number"` — the values are the metric's own
//   quantity. The format is a constant: every value, axis and label uses it
//   unconditionally, whatever indicators are on display. m10-02's don't-know
//   RATES stay percent even on count questions; m9-02-01's CIX/SII stays
//   number over percent indicators.
// - `formatAs: "indicator"` — the values ARE the displayed indicator's own
//   quantity, so format is a per-value fact carried by the indicator catalog
//   (IndicatorMetadata.format_as). True of every indicator family: HFA
//   (getHfaIndicatorMeasure), calculated indicators (their required 3-way
//   field), and ICEH.
//
// `EffectiveFormat` therefore exposes TWO things, and which one a caller wants
// is decided by what it is formatting, never by a flag:
//
//   formatForValue(ids) — THE source for any individual value. The caller
//     passes the ids that identify the value (its headers, most specific
//     first) and the first one that DECLARES a format wins.
//   axisFormat — the collapsed answer, and ONLY for figure-wide decisions that
//     cannot be per-value: a shared scale axis and the things derived from it.
//
// Which surface takes which, and why, is the wiring map in SYSTEM_10 — not
// restated here.
//
// The collapse is lossy by nature (mixed indicators share one numeric axis),
// which is exactly why it must never reach an individual value. A single
// scalar plus a "format per cell?" boolean was the old shape, and it forced
// every surface to re-derive the per-value truth for itself — or, mostly, to
// skip it and print a percentage as a bare fraction.
//
// Two entry points, one rule, in one file so they cannot drift.
// resolveEffectiveFormat is PRE-QUERY (the editor), enumerating the displayed
// set from the config plus the possible-values catalog; an items-based
// derivation reads the format backwards on a figure that pins its indicator in
// `filterBy`, because no indicator column comes back at all. Config-based also
// means the percent-only controls react to a draft filter edit with no
// refetch. resolveEffectiveFormatFromItems is the RENDER twin over a stored
// FigureBundle, which carries no possible-values catalog, so it enumerates
// disaggregated dimensions from the returned rows instead. Only `axisFormat`
// can differ between them, and only for an "indicator" metric whose
// possible-values status disagrees with the actual rows — see SYSTEM_10.
// ============================================================================

export type EffectiveFormat = {
  axisFormat: IndicatorFormat;
  formatForValue: (ids: (string | undefined)[]) => IndicatorFormat;
  // The same walk as formatForValue, but reporting the MISS instead of
  // absorbing it. Only for a surface whose honest answer to "nothing declares a
  // format for this value" is something other than the collapsed axis format —
  // today just the scorecard, which prints the raw stored value rather than
  // rendering a fraction as a whole number. Everything else wants
  // formatForValue, which is this plus the axisFormat fallback.
  declaredFormatForValue: (
    ids: (string | undefined)[],
  ) => IndicatorFormat | undefined;
};

type FormatLookup = (id: string) => IndicatorFormat | undefined;

export function resolveEffectiveFormat(args: {
  metricFormatAs: MetricFormatAs;
  config: PresentationObjectConfig;
  indicatorFormats: Record<string, IndicatorFormat>;
  possibleValues: {
    [K in DisaggregationOption]?: DisaggregationPossibleValuesStatus;
  };
}): EffectiveFormat {
  const { metricFormatAs, config, indicatorFormats, possibleValues } = args;
  const lookup: FormatLookup = (id) =>
    Object.hasOwn(indicatorFormats, id) ? indicatorFormats[id] : undefined;

  if (metricFormatAs !== "indicator") {
    return constantFormat(metricFormatAs);
  }

  const displayed = getDisplayedIndicatorDimensionValues(config, (disOpt) => {
    const status = possibleValues[disOpt];
    return status?.status === "ok" ? status.values.map((v) => v.id) : undefined;
  });
  return indicatorFormat(displayed, lookup);
}

// Render-side twin over a stored FigureBundle: pins (replicant, filterBy) come
// from the frozen config, disaggregated dimensions are enumerated from the
// returned rows, and formats come from bundle.indicatorMetadata — the FULL
// module catalog, so a filter-pinned indicator is still visible.
export function resolveEffectiveFormatFromItems(args: {
  metricFormatAs: MetricFormatAs;
  config: PresentationObjectConfig;
  items: Record<string, string | number | null>[];
  indicatorMetadata: IndicatorMetadata[];
}): EffectiveFormat {
  const { metricFormatAs, config, items, indicatorMetadata } = args;
  const formatById = new Map(
    indicatorMetadata
      .filter((m) => m.format_as !== undefined)
      .map((m) => [m.id, m.format_as!] as const),
  );
  const lookup: FormatLookup = (id) => formatById.get(id);

  if (metricFormatAs !== "indicator") {
    return constantFormat(metricFormatAs);
  }

  const displayed = getDisplayedIndicatorDimensionValues(config, (disOpt) =>
    items.map((row) => row[disOpt]));
  return indicatorFormat(displayed, lookup);
}

// A metric that owns its format: the declaration answers every question, so
// the per-value sources ignore the ids they are handed. declaredFormatForValue
// is never undefined here — the declaration IS the answer, so a surface with a
// miss branch correctly never takes it.
function constantFormat(formatAs: "percent" | "number"): EffectiveFormat {
  return {
    axisFormat: formatAs,
    formatForValue: () => formatAs,
    declaredFormatForValue: () => formatAs,
  };
}

function indicatorFormat(
  displayed: (string | number | null | undefined)[] | undefined,
  lookup: FormatLookup,
): EffectiveFormat {
  const axisFormat = unanimousFormat(displayed, lookup);
  // First id that DECLARES a format — not the first id that happens to be in
  // the catalog. The catalog deliberately carries label-only entries (HFA
  // categories and variant items, ICEH strat codes, raw common indicators),
  // so stopping at the first entry found would let a format-less column
  // header mask the formatted row indicator beside it.
  const declaredFormatForValue = (ids: (string | undefined)[]) => {
    for (const id of ids) {
      if (id === undefined) continue;
      const format = lookup(id);
      if (format !== undefined) return format;
    }
    return undefined;
  };
  return {
    axisFormat,
    declaredFormatForValue,
    formatForValue: (ids) => declaredFormatForValue(ids) ?? axisFormat,
  };
}

// The single format every displayed indicator agrees on, else "number" — the
// honest shared-axis answer for a mixed or un-enumerable display. Ids without
// a declared format say nothing and are skipped rather than counted as
// disagreement: the displayed set legitimately includes ids the catalog does
// not format.
function unanimousFormat(
  displayed: (string | number | null | undefined)[] | undefined,
  lookup: FormatLookup,
): IndicatorFormat {
  if (displayed === undefined) return "number";
  let resolved: IndicatorFormat | undefined;
  for (const value of displayed) {
    if (typeof value !== "string") continue;
    const format = lookup(value);
    if (format === undefined) continue;
    if (resolved === undefined) {
      resolved = format;
    } else if (resolved !== format) {
      return "number";
    }
  }
  return resolved ?? "number";
}

// The indicator-dimension values a figure actually puts on display. Candidates
// come ONLY from indicator dimensions (INDICATOR_DISAGGREGATION_OPTIONS) — a
// calculated indicator named `anc1` must not collide with a `source_indicator`
// value that happens to share the id.
//
// `undefined` means an indicator dimension is on display but could not be
// enumerated (a replicant with nothing selected, or a possible-values status
// carrying no values), so no honest shared answer exists.
function getDisplayedIndicatorDimensionValues(
  config: PresentationObjectConfig,
  enumerateDimension: (
    disOpt: DisaggregationOption,
  ) => (string | number | null | undefined)[] | undefined,
): (string | number | null | undefined)[] | undefined {
  const displayed: (string | number | null | undefined)[] = [];

  for (const dis of config.d.disaggregateBy) {
    if (!isIndicatorDisaggregationOption(dis.disOpt)) continue;

    if (dis.disDisplayOpt === "replicant") {
      // A replicated figure shows exactly one value of the replicant dimension.
      // A PO config stores no-selection as undefined (the field is optional and
      // the starting config leaves it unset), but "" also reaches here: the
      // deck config's default is "", and ReplicateByOptions feeds
      // `selectedReplicantValue || ""` into tempConfig. Both mean "nothing
      // selected".
      //
      // Returning undefined here (rather than falling through to enumeration)
      // is a latent behaviour change from the pre-per-value code, reachable
      // only with a metric carrying TWO indicator dimensions where the second
      // is pinned in filterBy — no such metric exists. Recorded, deliberate.
      const selected = config.d.selectedReplicantValue;
      if (selected === undefined || selected === "") return undefined;
      displayed.push(selected);
      continue;
    }

    const filtered = getFilterValues(config, dis.disOpt);
    if (filtered.length > 0) {
      displayed.push(...filtered);
      continue;
    }

    const values = enumerateDimension(dis.disOpt);
    if (values === undefined) return undefined;
    displayed.push(...values);
  }

  // Indicator dimensions pinned by a filter without being disaggregated. These
  // carry no column in the returned rows at all, which is exactly why an
  // items-only derivation cannot see them.
  const disaggregated = new Set(config.d.disaggregateBy.map((d) => d.disOpt));
  for (const filter of config.d.filterBy) {
    if (disaggregated.has(filter.disOpt)) continue;
    if (!isIndicatorDisaggregationOption(filter.disOpt)) continue;
    displayed.push(...filter.values);
  }

  return displayed;
}

function getFilterValues(
  config: PresentationObjectConfig,
  disOpt: DisaggregationOption,
): (string | number)[] {
  return config.d.filterBy
    .filter((f) => f.disOpt === disOpt)
    .flatMap((f) => f.values);
}

function isIndicatorDisaggregationOption(disOpt: DisaggregationOption): boolean {
  return (INDICATOR_DISAGGREGATION_OPTIONS as readonly string[]).includes(
    disOpt,
  );
}
