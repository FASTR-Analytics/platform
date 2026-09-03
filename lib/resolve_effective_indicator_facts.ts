import type { PresentationObjectConfig } from "./types/_presentation_object_config.ts";
import type { ThresholdsRule } from "./types/conditional_formatting.ts";
import {
  INDICATOR_DISAGGREGATION_OPTIONS,
  type DisaggregationOption,
} from "./types/disaggregation_options.ts";
import type { IndicatorFormat, IndicatorMetadata } from "./types/indicators.ts";
import type { MetricFormatAs } from "./types/modules.ts";
import type { DisaggregationPossibleValuesStatus } from "./types/presentation_objects.ts";

// ============================================================================
// The one effective-indicator-facts resolver. Two catalog facts — an
// indicator's FORMAT and its CF RULE — resolved per value through the same id
// chain and the same stopping rule. Format has a DECLARED source:
//
// - `formatAs: "percent" | "number"` — the values are the metric's own
//   quantity. The format is a constant: every value, axis and label uses it
//   unconditionally, whatever indicators are on display. m10-02's don't-know
//   RATES stay percent even on count questions; m9-02-01's CIX/SII stays
//   number over percent indicators. Such a metric has no per-value rule: the
//   values are not any indicator's own quantity, so no indicator's rule
//   applies to them.
// - `formatAs: "indicator"` — the values ARE the displayed indicator's own
//   quantity, so format AND rule are per-value facts carried by the indicator
//   catalog (IndicatorMetadata.format_as / .thresholds). True of every
//   indicator family: HFA (getHfaIndicatorMeasure), common indicators, ICEH.
//
// `EffectiveIndicatorFacts` therefore exposes per-value sources and collapsed
// answers, and which one a caller wants is decided by what it is doing, never
// by a flag:
//
//   formatForValue(ids) — THE source for any individual value's format. The
//     caller passes the ids that identify the value (its headers, most
//     specific first) and the first one that DECLARES a format wins.
//   ruleForValue(ids) — THE source for any individual value's CF rule under
//     the `indicator` source: the first id in the chain that DECLARES a rule.
//     When the chain carries NO id at all (the indicator is pinned by
//     filterBy — the one-indicator map or bar chart) and exactly one
//     indicator is displayed, that indicator's rule. An id that declares no
//     rule — a count beside percents — is never coloured by a neighbour's.
//   axisFormat — the collapsed format, ONLY for figure-wide decisions that
//     cannot be per-value: a shared scale axis and the things derived from it.
//   displayedRules — the distinct rules among the displayed indicators, each
//     with its owning format, for the derived `indicator` legend.
//
// Which surface takes which, and why, is the wiring map in SYSTEM_10 — not
// restated here.
//
// The format collapse is lossy by nature (mixed indicators share one numeric
// axis), which is exactly why it must never reach an individual value. A
// single scalar plus a "format per cell?" boolean was the old shape, and it
// forced every surface to re-derive the per-value truth for itself — or,
// mostly, to skip it and print a percentage as a bare fraction.
//
// Two entry points, one rule, in one file so they cannot drift.
// resolveEffectiveIndicatorFacts is PRE-QUERY (the editor), enumerating the
// displayed set from the config plus the possible-values catalog; an
// items-based derivation reads the facts backwards on a figure that pins its
// indicator in `filterBy`, because no indicator column comes back at all.
// Config-based also means the percent-only controls react to a draft filter
// edit with no refetch. resolveEffectiveIndicatorFactsFromItems is the RENDER
// twin over a stored FigureBundle, which carries no possible-values catalog,
// so it enumerates disaggregated dimensions from the returned rows instead.
// Only `axisFormat` and `displayedRules` can differ between them, and only for
// an "indicator" metric whose possible-values status disagrees with the
// actual rows — see SYSTEM_10.
// ============================================================================

export type DisplayedRule = { rule: ThresholdsRule; formatAs: IndicatorFormat };

export type EffectiveIndicatorFacts = {
  axisFormat: IndicatorFormat;
  formatForValue: (ids: (string | undefined)[]) => IndicatorFormat;
  // The same walk as formatForValue, but reporting the MISS instead of
  // absorbing it. Only for a surface whose honest answer to "nothing declares
  // a format for this value" is something other than the collapsed axis
  // format. Everything else wants formatForValue, which is this plus the
  // axisFormat fallback.
  declaredFormatForValue: (
    ids: (string | undefined)[],
  ) => IndicatorFormat | undefined;
  ruleForValue: (ids: (string | undefined)[]) => ThresholdsRule | undefined;
  displayedRules: DisplayedRule[];
};

type FactsLookup = {
  format: (id: string) => IndicatorFormat | undefined;
  rule: (id: string) => ThresholdsRule | undefined;
};

export function resolveEffectiveIndicatorFacts(args: {
  metricFormatAs: MetricFormatAs;
  config: PresentationObjectConfig;
  indicatorFormats: Record<string, IndicatorFormat>;
  indicatorRules: Record<string, ThresholdsRule>;
  possibleValues: {
    [K in DisaggregationOption]?: DisaggregationPossibleValuesStatus;
  };
}): EffectiveIndicatorFacts {
  const { metricFormatAs, config, indicatorFormats, indicatorRules, possibleValues } = args;
  const lookup: FactsLookup = {
    format: (id) =>
      Object.hasOwn(indicatorFormats, id) ? indicatorFormats[id] : undefined,
    rule: (id) =>
      Object.hasOwn(indicatorRules, id) ? indicatorRules[id] : undefined,
  };

  if (metricFormatAs !== "indicator") {
    return constantFacts(metricFormatAs);
  }

  const displayed = getDisplayedIndicatorDimensionValues(config, (disOpt) => {
    const status = possibleValues[disOpt];
    return status?.status === "ok" ? status.values.map((v) => v.id) : undefined;
  });
  return indicatorFacts(displayed, lookup);
}

// Render-side twin over a stored FigureBundle: pins (replicant, filterBy) come
// from the frozen config, disaggregated dimensions are enumerated from the
// returned rows, and facts come from bundle.indicatorMetadata — the FULL
// module catalog, so a filter-pinned indicator is still visible.
export function resolveEffectiveIndicatorFactsFromItems(args: {
  metricFormatAs: MetricFormatAs;
  config: PresentationObjectConfig;
  items: Record<string, string | number | null>[];
  indicatorMetadata: IndicatorMetadata[];
}): EffectiveIndicatorFacts {
  const { metricFormatAs, config, items, indicatorMetadata } = args;
  const byId = new Map(indicatorMetadata.map((m) => [m.id, m] as const));
  const lookup: FactsLookup = {
    format: (id) => byId.get(id)?.format_as,
    rule: (id) => byId.get(id)?.thresholds,
  };

  if (metricFormatAs !== "indicator") {
    return constantFacts(metricFormatAs);
  }

  const displayed = getDisplayedIndicatorDimensionValues(config, (disOpt) =>
    items.map((row) => row[disOpt]));
  return indicatorFacts(displayed, lookup);
}

// A metric that owns its format: the declaration answers every question, so
// the per-value sources ignore the ids they are handed. declaredFormatForValue
// is never undefined here — the declaration IS the answer, so a surface with a
// miss branch correctly never takes it. No rule ever applies (see header).
function constantFacts(formatAs: "percent" | "number"): EffectiveIndicatorFacts {
  return {
    axisFormat: formatAs,
    formatForValue: () => formatAs,
    declaredFormatForValue: () => formatAs,
    ruleForValue: () => undefined,
    displayedRules: [],
  };
}

function indicatorFacts(
  displayed: (string | number | null | undefined)[] | undefined,
  lookup: FactsLookup,
): EffectiveIndicatorFacts {
  const axisFormat = unanimousFormat(displayed, lookup);
  // First id that DECLARES the fact — not the first id that happens to be in
  // the catalog. The catalog deliberately carries label-only entries (HFA
  // categories and variant items, ICEH strat codes, raw common indicators),
  // so stopping at the first entry found would let a fact-less column header
  // mask the indicator beside it.
  const declaredFormatForValue = (ids: (string | undefined)[]) =>
    firstDeclared(ids, lookup.format);
  const displayedIds = displayed === undefined
    ? undefined
    : displayed.filter((v): v is string => typeof v === "string");
  const pinnedRule = displayedIds !== undefined && displayedIds.length === 1
    ? lookup.rule(displayedIds[0])
    : undefined;
  const ruleForValue = (ids: (string | undefined)[]) => {
    const declared = firstDeclared(ids, lookup.rule);
    if (declared !== undefined) return declared;
    return ids.every((id) => id === undefined) ? pinnedRule : undefined;
  };
  return {
    axisFormat,
    declaredFormatForValue,
    formatForValue: (ids) => declaredFormatForValue(ids) ?? axisFormat,
    ruleForValue,
    displayedRules: distinctDisplayedRules(displayedIds, lookup),
  };
}

function firstDeclared<T>(
  ids: (string | undefined)[],
  lookup: (id: string) => T | undefined,
): T | undefined {
  for (const id of ids) {
    if (id === undefined) continue;
    const fact = lookup(id);
    if (fact !== undefined) return fact;
  }
  return undefined;
}

// The distinct rules on display, in first-appearance order. Two rules are the
// same when count, colours, labels, cutoffs AND the owning indicator's format
// all agree — colours-and-labels alone would let one indicator's cutoffs
// print as universal. An un-enumerable display has no rules.
function distinctDisplayedRules(
  displayedIds: string[] | undefined,
  lookup: FactsLookup,
): DisplayedRule[] {
  if (displayedIds === undefined) return [];
  const seen = new Set<string>();
  const out: DisplayedRule[] = [];
  for (const id of displayedIds) {
    const rule = lookup.rule(id);
    if (rule === undefined) continue;
    const formatAs = lookup.format(id) ?? "number";
    const key = displayedRuleKey(rule, formatAs);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ rule, formatAs });
  }
  return out;
}

function displayedRuleKey(rule: ThresholdsRule, formatAs: IndicatorFormat): string {
  return JSON.stringify([
    formatAs,
    rule.direction ?? "higher-is-better",
    rule.cutoffs,
    rule.buckets.map((b) => [b.color, b.label ?? null]),
  ]);
}

// The single format every displayed indicator agrees on, else "number" — the
// honest shared-axis answer for a mixed or un-enumerable display. Ids without
// a declared format say nothing and are skipped rather than counted as
// disagreement: the displayed set legitimately includes ids the catalog does
// not format.
function unanimousFormat(
  displayed: (string | number | null | undefined)[] | undefined,
  lookup: FactsLookup,
): IndicatorFormat {
  if (displayed === undefined) return "number";
  let resolved: IndicatorFormat | undefined;
  for (const value of displayed) {
    if (typeof value !== "string") continue;
    const format = lookup.format(value);
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
// derived indicator named `anc1` must not collide with a `source_indicator`
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
