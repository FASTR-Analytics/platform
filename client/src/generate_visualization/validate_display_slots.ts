import type {
  AiFigureConfigPatch,
  JsonArrayItem,
  MetricWithStatus,
  PeriodBounds,
  PresentationObjectConfig,
} from "lib";
import { AIToolFailure } from "panther";
import {
  FILTER_ONLY_DISAGGREGATION_OPTIONS,
  getEffectivePOConfig,
  getEffectiveRollupDimension,
  getSingleValueDimsFromItems,
  getValidValuesDisplayOptions,
  hasDuplicateDisaggregatorDisplayOptions,
  VIZ_TYPE_CONFIG,
} from "lib";

// Display-slot vocabularies come from VIZ_TYPE_CONFIG (exhaustively typed) and
// getValidValuesDisplayOptions — no local copies, no fail-open on an
// unrecognised type.

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

  // Per-dimension: the dimension exists on the metric and its slot is legal for
  // the type. (A slot that is invalid for the type silently drops the dimension
  // at render — getDisaggregatorDisplayProp never places it.)
  if (touchesDisagg) {
    const availableDims = metric.disaggregationOptions.map((o) => o.value);
    const validDisplay = VIZ_TYPE_CONFIG[type].disaggregationDisplayOptions;
    for (const d of config.d.disaggregateBy) {
      if (!availableDims.includes(d.disOpt)) {
        throw new AIToolFailure(
          `Invalid disaggregation dimension "${d.disOpt}". Available: ${availableDims.join(", ")}`,
        );
      }
      if (FILTER_ONLY_DISAGGREGATION_OPTIONS.has(d.disOpt)) {
        throw new AIToolFailure(
          `"${d.disOpt}" is filter-only and cannot be used as a disaggregation dimension.`,
        );
      }
      if (!validDisplay.includes(d.disDisplayOpt)) {
        throw new AIToolFailure(
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
      throw new AIToolFailure(
        `Disaggregation "${opt.value}" is required for this metric and must remain in disaggregateBy. No changes were applied.`,
      );
    }
  }

  // valuesDisDisplayOpt set EXPLICITLY — always checked, whatever the value-prop
  // count. Both failures below are silent no-ops at render, so without this the
  // tool saves a dead field and reports success having changed nothing.
  //
  // The slot enum is shared across presentation types (`mapArea` is a member for
  // disaggregations), so Zod cannot reject a per-type-illegal slot; only this
  // table can. And on a single-value-prop figure the field is inert whatever it
  // holds — getDisaggregatorDisplayProp only places the value dimension when
  // effectiveValueProps.length > 1.
  if (patch.valuesDisDisplayOpt !== undefined) {
    const validValues = getValidValuesDisplayOptions(type);
    if (!validValues.includes(patch.valuesDisDisplayOpt)) {
      throw new AIToolFailure(
        `Invalid valuesDisDisplayOpt "${patch.valuesDisDisplayOpt}" for type "${type}". Valid: ${validValues.join(", ")}. No changes were applied.`,
      );
    }
    if (!hasMultipleValueProps) {
      throw new AIToolFailure(
        `valuesDisDisplayOpt has no effect on this figure: it shows a single data `
        + `value, so there is no value dimension to place. It is NOT a label, `
        + `caption or styling control. No changes were applied.`,
      );
    }
  }

  // valuesFilter can flip the figure TO multiple value props, making an
  // INHERITED (unpatched) slot live — validate the resulting config's slot.
  if (hasMultipleValueProps && patch.valuesFilter !== undefined) {
    const validValues = getValidValuesDisplayOptions(type);
    if (!validValues.includes(config.d.valuesDisDisplayOpt)) {
      throw new AIToolFailure(
        `Invalid valuesDisDisplayOpt "${config.d.valuesDisDisplayOpt}" for type "${type}". Valid: ${validValues.join(", ")}`,
      );
    }
  }

  // Roll-up gate: only when the patch EXPLICITLY turns it on — via
  // `rollupDimension` or via `rollup: true` stated on disaggregateBy entries.
  // An explicitly-requested roll-up that leaves the gate closed (wrong
  // dimension, two flagged entries, ineligible metric) must error, not
  // silently render nothing. A flag that merely became latent through other
  // edits degrades gracefully (getFetchConfig drops it when the gate closes).
  const explicitlyFlagged =
    typeof patch.rollupDimension === "string" ||
    (patch.disaggregateBy?.some((e) => e.rollup === true) ?? false);
  if (
    explicitlyFlagged &&
    getEffectiveRollupDimension(metric, config) === undefined
  ) {
    throw new AIToolFailure(
      "The requested roll-up is not available for this configuration: exactly "
      + "ONE disaggregated dimension may carry it, it must be an admin level "
      + "(admin_area_2/3/4) or facility column, not shown as replicant/map "
      + "area, not filtered to a single value, not on a map, and the metric "
      + "must be re-aggregatable. No changes were applied.",
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
  items: JsonArrayItem[],
): void {
  const resultsValueForViz = {
    formatAs: metric.formatAs,
    valueProps: metric.valueProps,
    valueLabelReplacements: metric.valueLabelReplacements,
  };
  const { config: effectiveConfig, effectiveValueProps } = getEffectivePOConfig(config, {
    dateRange,
    valueProps: metric.valueProps,
    singleValueDims: getSingleValueDimsFromItems(config, items),
  });
  if (hasDuplicateDisaggregatorDisplayOptions(resultsValueForViz, effectiveConfig, effectiveValueProps)) {
    throw new AIToolFailure(
      `Two display elements share the same slot for a "${config.d.type}" figure (a disaggregation, or the value dimension, collides). The figure would not render correctly. No changes were applied.`,
    );
  }
}
