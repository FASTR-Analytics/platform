import type { PresentationObjectConfig } from "./types/_presentation_object_config.ts";
import {
  INDICATOR_DISAGGREGATION_OPTIONS,
  type DisaggregationOption,
} from "./types/disaggregation_options.ts";
import type { IndicatorFormat, IndicatorMetadata } from "./types/indicators.ts";
import type { MetricFormatAs } from "./types/modules.ts";
import type { DisaggregationPossibleValuesStatus } from "./types/presentation_objects.ts";

// ============================================================================
// The one effective-format resolver. Declared source, no inference:
//
// - `formatAs: "percent" | "number"` — the metric's values are the metric's
//   own quantity. The format is a constant; nothing is inferred, anywhere.
// - `formatAs: "indicator"` — the values ARE the displayed indicator's own
//   quantity, so format is a per-value fact carried by the indicator catalog
//   (IndicatorMetadata.format_as). Every value-formatting surface formats by
//   that value's indicator (perCell). A shared axis/legend uses the displayed
//   indicators' format when they all agree; when they mix — or when the
//   displayed set cannot be enumerated — it is numeric.
//
// Two resolvers, one rule, side by side so they cannot drift:
// resolveEffectiveFormat is PRE-QUERY (editor), enumerating displayed values
// from the config plus the possible-values catalog; an items-based derivation
// reads the format backwards on a figure that pins its indicator in
// `filterBy`, because no indicator column comes back at all. Config-based also
// means the editor's percent-only controls react to a filter edit with no
// refetch. resolveEffectiveFormatFromItems is the RENDER twin over a stored
// FigureBundle, which carries no possible-values catalog — it enumerates
// disaggregated dimensions from the returned rows instead. The two can
// disagree only for an "indicator" metric whose possible-values status
// (too_many_values / error / possible-but-empty) disagrees with actual rows —
// documented in SYSTEM_10.
// ============================================================================

export type EffectiveFormat = {
  formatAs: IndicatorFormat;
  // Table cells format per-cell by their own indicator — true exactly when the
  // metric declares "indicator" (values legitimately mix percent and count
  // rows). A "percent"/"number" metric's cells all carry the metric's own
  // quantity, even when attributed to indicators of another format (e.g.
  // m10-02 don't-know RATES on count questions).
  perCell: boolean;
};

export function resolveEffectiveFormat(args: {
  metricFormatAs: MetricFormatAs;
  config: PresentationObjectConfig;
  indicatorFormats: Record<string, IndicatorFormat>;
  possibleValues: {
    [K in DisaggregationOption]?: DisaggregationPossibleValuesStatus;
  };
}): EffectiveFormat {
  const { metricFormatAs, config, indicatorFormats, possibleValues } = args;

  if (metricFormatAs !== "indicator") {
    return { formatAs: metricFormatAs, perCell: false };
  }

  const displayed = getDisplayedIndicatorDimensionValues(
    config,
    (disOpt) => {
      const status = possibleValues[disOpt];
      return status?.status === "ok"
        ? status.values.map((v) => v.id)
        : undefined;
    },
  );
  return {
    formatAs: unanimousFormat(displayed, (id) =>
      Object.hasOwn(indicatorFormats, id) ? indicatorFormats[id] : undefined),
    perCell: true,
  };
}

// Render-side twin over a stored FigureBundle: pins (replicant, filterBy) come
// from the frozen config, disaggregated dimensions are enumerated from the
// returned rows, and formats come from bundle.indicatorMetadata — the FULL
// module catalog, so filter-pinned indicators are visible.
export function resolveEffectiveFormatFromItems(args: {
  metricFormatAs: MetricFormatAs;
  config: PresentationObjectConfig;
  items: Record<string, string | number | null>[];
  indicatorMetadata: IndicatorMetadata[];
}): EffectiveFormat {
  const { metricFormatAs, config, items, indicatorMetadata } = args;

  if (metricFormatAs !== "indicator") {
    return { formatAs: metricFormatAs, perCell: false };
  }

  const displayed = getDisplayedIndicatorDimensionValues(
    config,
    (disOpt) => items.map((row) => row[disOpt]),
  );
  const formatById = new Map(
    indicatorMetadata
      .filter((m) => m.format_as !== undefined)
      .map((m) => [m.id, m.format_as!] as const),
  );
  return {
    formatAs: unanimousFormat(displayed, (id) => formatById.get(id)),
    perCell: true,
  };
}

// The single format every displayed indicator agrees on, else "number" — the
// honest shared-axis answer for a mixed or un-enumerable display. Values
// without a declared format say nothing (they are skipped, not counted as
// disagreement): the displayed set can legitimately include ids the catalog
// does not format.
function unanimousFormat(
  displayed: (string | number | null | undefined)[] | undefined,
  formatFor: (id: string) => IndicatorFormat | undefined,
): IndicatorFormat {
  if (displayed === undefined) return "number";
  let resolved: IndicatorFormat | undefined;
  for (const value of displayed) {
    if (typeof value !== "string") continue;
    const format = formatFor(value);
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
// that carries no values), so no honest per-indicator answer exists.
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
      if (config.d.selectedReplicantValue === undefined) return undefined;
      displayed.push(config.d.selectedReplicantValue);
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
