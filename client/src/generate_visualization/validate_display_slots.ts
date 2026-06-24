import type {
  AiFigureConfigPatch,
  MetricWithStatus,
  PeriodBounds,
  PresentationObjectConfig,
} from "lib";
import {
  getEffectivePOConfig,
  getEffectiveRollupLevel,
  hasDuplicateDisaggregatorDisplayOptions,
} from "lib";

// Per-presentation-type display-slot vocabularies. Single source of truth —
// also consumed by the viz editor's runtime checks.
export const VALID_DIS_DISPLAY: Record<string, string[]> = {
  timeseries: ["series", "cell", "row", "col", "replicant"],
  table: ["row", "col", "rowGroup", "colGroup", "replicant"],
  chart: ["indicator", "series", "cell", "row", "col", "replicant"],
  map: ["mapArea", "cell", "row", "col", "replicant"],
};

export const VALID_VALUES_DISPLAY: Record<string, string[]> = {
  timeseries: ["series", "cell", "row", "col"],
  table: ["row", "col", "rowGroup", "colGroup"],
  chart: ["indicator", "series", "cell", "row", "col"],
  map: ["cell", "row", "col"],
};

// PRE-FETCH validation for an update_figure edit. Throws a clear, "nothing
// changed" style error so the caller bails BEFORE the expensive re-resolve.
// Pure; needs no fetched data.
//
// DELTA-AWARE (mirrors the viz editor's conditional checks): only validates
// concerns the patch actually touches, so a caption-only edit on a figure whose
// stored config has drifted is NOT blocked.
//
// NOTE: slot COLLISIONS are NOT checked here — that requires the effective
// config, which depends on the data's date range (single-period/single-year
// degeneracy) only known after the fetch. See `assertNoSlotCollision`, called
// post-resolve with the bundle's real dateRange.
export function validateDisplaySlots(
  config: PresentationObjectConfig,
  metric: MetricWithStatus,
  patch: AiFigureConfigPatch,
): void {
  const type = config.d.type;
  // effectiveValueProps depends only on valuesFilter (not dateRange), so the
  // multi-value-prop determination is correct without fetched data.
  const { hasMultipleValueProps } = getEffectivePOConfig(config, {
    valueProps: metric.valueProps,
  });

  const touchesDisagg = patch.disaggregateBy !== undefined;
  // valuesFilter is included: it flips how many value props are shown, which
  // makes valuesDisDisplayOpt a live (validatable) slot.
  const touchesValuesSlot =
    patch.valuesDisDisplayOpt !== undefined ||
    patch.valuesFilter !== undefined;

  // Per-dimension: the dimension exists on the metric and its slot is legal for
  // the type. (A slot that is invalid for the type silently drops the dimension
  // at render — getDisaggregatorDisplayProp never places it.)
  if (touchesDisagg) {
    const availableDims = metric.disaggregationOptions.map((o) => o.value);
    const validDisplay = VALID_DIS_DISPLAY[type];
    for (const d of config.d.disaggregateBy) {
      if (!availableDims.includes(d.disOpt)) {
        throw new Error(
          `Invalid disaggregation dimension "${d.disOpt}". Available: ${availableDims.join(", ")}`,
        );
      }
      if (validDisplay && !validDisplay.includes(d.disDisplayOpt)) {
        throw new Error(
          `Invalid disDisplayOpt "${d.disDisplayOpt}" for type "${type}". Valid: ${validDisplay.join(", ")}`,
        );
      }
    }
    // Required dimensions must stay grouped — omitting one re-aggregates across a
    // dimension the metric mandates, producing silently-wrong (e.g. double-counted)
    // values. The figure fetch does NOT auto-merge required dims (only the metric
    // data tool does), so this is the one path that could drop them.
    //
    // EXCEPTION (mirrors build_definitions.ts + getStartingConfigForPresentationObject):
    // a required dim NOT allowed for the current presentation type lives elsewhere
    // — e.g. a required time dim (year/period_id, allowed only for table/chart) is
    // the timeseries axis and is grouped via timeseriesGrouping, not disaggregateBy.
    // Demanding it in disaggregateBy would wrongly block every timeseries/map edit.
    const present = new Set(config.d.disaggregateBy.map((d) => d.disOpt));
    for (const opt of metric.disaggregationOptions) {
      if (!opt.isRequired || present.has(opt.value)) continue;
      if (opt.allowedPresentationOptions && !opt.allowedPresentationOptions.includes(type)) {
        continue;
      }
      throw new Error(
        `Disaggregation "${opt.value}" is required for this metric and must remain in disaggregateBy. No changes were applied.`,
      );
    }
  }

  // valuesDisDisplayOpt legality — only meaningful (and only checked) when the
  // figure shows more than one value prop; a stale value on a single-prop figure
  // is ignored at render.
  if (hasMultipleValueProps && touchesValuesSlot) {
    const validValues = VALID_VALUES_DISPLAY[type];
    if (validValues && !validValues.includes(config.d.valuesDisDisplayOpt)) {
      throw new Error(
        `Invalid valuesDisDisplayOpt "${config.d.valuesDisDisplayOpt}" for type "${type}". Valid: ${validValues.join(", ")}`,
      );
    }
  }

  // Roll-up gate: only when the patch turns it ON. Leaving it on while an
  // unrelated change makes it ineligible degrades gracefully (getFetchConfig
  // drops it when the level is undefined).
  if (
    patch.includeAdminAreaRollup === true &&
    getEffectiveRollupLevel(metric, config) === undefined
  ) {
    throw new Error(
      "includeAdminAreaRollup is not available for this configuration: it "
      + "requires exactly one disaggregated admin level (admin_area_2/3/4) not "
      + "shown as replicant/map area and not filtered to a single value, not on a "
      + "map, and a re-aggregatable metric. No changes were applied.",
    );
  }
}

// POST-FETCH slot-collision check. Run AFTER the re-resolve with the bundle's
// actual dateRange so the effective config matches EXACTLY what the renderer
// computes (same getEffectivePOConfig inputs) — no false positive on
// temporally-degenerate dims, and it catches the value-dimension-vs-disaggregation
// collision the renderer would otherwise silently drop. Throws before commit.
export function assertNoSlotCollision(
  config: PresentationObjectConfig,
  metric: MetricWithStatus,
  dateRange: PeriodBounds | undefined,
): void {
  const resultsValueForViz = {
    formatAs: metric.formatAs,
    valueProps: metric.valueProps,
    valueLabelReplacements: metric.valueLabelReplacements,
  };
  const { config: effectiveConfig, effectiveValueProps } = getEffectivePOConfig(config, {
    dateRange,
    valueProps: metric.valueProps,
  });
  if (hasDuplicateDisaggregatorDisplayOptions(resultsValueForViz, effectiveConfig, effectiveValueProps)) {
    throw new Error(
      `Two display elements share the same slot for a "${config.d.type}" figure (a disaggregation, or the value dimension, collides). The figure would not render correctly. No changes were applied.`,
    );
  }
}
