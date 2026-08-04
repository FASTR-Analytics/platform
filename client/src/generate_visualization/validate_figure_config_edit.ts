import type {
  AiVizConfigUpdate,
  DisaggregationOption,
  DisaggregationPossibleValuesStatus,
  JsonArrayItem,
  MetricWithStatus,
  PeriodBounds,
  PresentationObjectConfig,
  ResultsValue,
} from "lib";
import { AIToolFailure } from "panther";
import {
  FILTER_ONLY_DISAGGREGATION_OPTIONS,
  getEffectivePOConfig,
  getEffectiveRollupDimension,
  getReplicateByProp,
  getSingleValueDimsFromItems,
  getSingleValueDimsFromPossibleValues,
  getValidValuesDisplayOptions,
  hasDuplicateDisaggregatorDisplayOptions,
  VIZ_TYPE_CONFIG,
} from "lib";

// valuesFilter names that don't exist on the metric are NOT inert —
// getFilteredValueProps is a membership filter, so a bad name yields
// effectiveValueProps: [] and a figure with no data values. Pure; called by
// validateFigureConfigEdit below and by the from_metric create path.
export function validateValuesFilter(
  valuesFilter: string[] | null | undefined,
  metric: { id: string; valueProps: string[] },
): void {
  if (!valuesFilter?.length) return;
  const invalid = valuesFilter.filter((v) => !metric.valueProps.includes(v));
  if (invalid.length > 0) {
    throw new AIToolFailure(
      `Invalid value propert${invalid.length === 1 ? "y" : "ies"} in valuesFilter for metric "${metric.id}": ${invalid.join(", ")}. ` +
        `Valid value properties: ${metric.valueProps.join(", ")}. No changes were applied.`,
    );
  }
}

// PRE-WRITE validation for every AI config edit (update_figure,
// update_report_figure, update_viz_config), run on the config
// applyFigureConfigPatch produced, BEFORE any store write or server call —
// it threw ⇒ nothing changed. Pure config checks only; anything needing
// FETCHED data (filter/replicant values, period ranges) stays in
// validators/content_validators.ts. The change REPORT is a separate function
// (describeFigureConfigPatchEffect) — this one only throws.
//
// DELTA-AWARE (a contract, not an accident): only concerns the patch touches
// are validated, so a caption-only edit on a figure whose stored config has
// drifted is NOT blocked. A `type` change does not re-validate inherited
// slots — convertVisualizationType already made them legal; only
// patch-supplied slots are checked.
//
// The two CONDITIONALLY_APPLIED_FIELDS (rollupDimension, rollupPosition) get
// STRUCTURAL checks here — a config diff cannot attribute their no-ops (see
// apply_figure_config_patch.ts).
//
// NOTE: the collision check here is the editor UI's own pre-write guard
// (possible-values-derived singleValueDims, no dateRange). The STRONGER
// check is assertNoSlotCollision below, which needs the fetched data's real
// dateRange (single-period/single-year degeneracy) and stays post-fetch,
// figure-tools-only.
export function validateFigureConfigEdit(
  oldConfig: PresentationObjectConfig,
  newConfig: PresentationObjectConfig,
  patch: AiVizConfigUpdate,
  source: ResultsValue,
  opts: {
    disaggregationPossibleValues:
      | { [key in DisaggregationOption]?: DisaggregationPossibleValuesStatus }
      | undefined;
  },
): void {
  const type = newConfig.d.type;
  // effectiveValueProps depends only on valuesFilter (not dateRange), so the
  // multi-value-prop determination is correct without fetched data.
  const { hasMultipleValueProps } = getEffectivePOConfig(newConfig, {
    valueProps: source.valueProps,
  });

  const touchesType = patch.type !== undefined && patch.type !== oldConfig.d.type;
  const touchesDisagg = patch.disaggregateBy !== undefined;

  // Per-dimension: the dimension exists on the metric and its slot is legal for
  // the type. (A slot that is invalid for the type silently drops the dimension
  // at render — getDisaggregatorDisplayProp never places it.)
  if (touchesDisagg) {
    const availableDims = source.disaggregationOptions.map((o) => o.value);
    const validDisplay = VIZ_TYPE_CONFIG[type].disaggregationDisplayOptions;
    for (const d of newConfig.d.disaggregateBy) {
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
    const present = new Set(newConfig.d.disaggregateBy.map((d) => d.disOpt));
    for (const opt of source.disaggregationOptions) {
      if (!opt.isRequired || present.has(opt.value)) continue;
      if (opt.allowedPresentationOptions && !opt.allowedPresentationOptions.includes(type)) {
        continue;
      }
      throw new AIToolFailure(
        `Disaggregation "${opt.value}" is required for this metric and must remain in disaggregateBy. No changes were applied.`,
      );
    }
  }

  // timeseriesGrouping is read ONLY by timeseries configs (every query/render
  // reader gates on type === "timeseries"); on any other type it stores a dead
  // field the read-back would confirm. Only the viz-editor caller can supply it.
  if (patch.timeseriesGrouping !== undefined) {
    if (type !== "timeseries") {
      throw new AIToolFailure(
        `timeseriesGrouping has no effect on a "${type}" visualization — it is only read when the presentation type is "timeseries". No changes were applied.`,
      );
    }
    // Any time column the metric carries is a legal grouping — the same set
    // the human style panel offers (period/quarter/year radio), not just the
    // most granular one.
    const allowedGroupings = new Set<string>();
    if (source.mostGranularTimePeriodColumnInResultsFile) {
      allowedGroupings.add(source.mostGranularTimePeriodColumnInResultsFile);
    }
    for (const o of source.disaggregationOptions) {
      if (o.value === "period_id" || o.value === "quarter_id" || o.value === "year") {
        allowedGroupings.add(o.value);
      }
    }
    if (!allowedGroupings.has(patch.timeseriesGrouping)) {
      throw new AIToolFailure(
        `Invalid timeseriesGrouping "${patch.timeseriesGrouping}". Available: ${allowedGroupings.size > 0 ? [...allowedGroupings].join(", ") : "none"}. No changes were applied.`,
      );
    }
  }

  // valuesDisDisplayOpt set EXPLICITLY — always checked, whatever the value-prop
  // count. Both failures below are silent no-ops at render, so without this the
  // tool saves a dead field and reports success having changed nothing.
  //
  // The slot enum is shared across presentation types (`mapArea` is a member for
  // disaggregations), so Zod cannot reject a per-type-illegal slot; only the
  // per-type table can. And on a single-value-prop figure the field is inert
  // whatever it holds — getDisaggregatorDisplayProp only places the value
  // dimension when effectiveValueProps.length > 1.
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

  if (patch.valuesFilter !== undefined) {
    validateValuesFilter(patch.valuesFilter, source);
  }

  // valuesFilter can flip the figure TO multiple value props, making an
  // INHERITED (unpatched) slot live — validate the resulting config's slot.
  if (hasMultipleValueProps && patch.valuesFilter !== undefined) {
    const validValues = getValidValuesDisplayOptions(type);
    if (!validValues.includes(newConfig.d.valuesDisDisplayOpt)) {
      throw new AIToolFailure(
        `Invalid valuesDisDisplayOpt "${newConfig.d.valuesDisDisplayOpt}" for type "${type}". Valid: ${validValues.join(", ")}`,
      );
    }
  }

  // selectedReplicantValue liveness (Type 2): with no ACTIVE replicant the
  // value is stored and never read (assertReplicantValid early-returns). The
  // predicate is getReplicateByProp — NOT a scan for disDisplayOpt ===
  // "replicant" — because a replicant dimension filtered to a single value is
  // not a replicant (SYSTEM_09), and a raw scan would wave through exactly the
  // inert case this check exists to catch. (Deliberately the OPPOSITE
  // predicate to apply's write-time clear, which tests structural slot
  // absence — liveness is transient, structure is not.)
  if (
    typeof patch.selectedReplicantValue === "string" &&
    getReplicateByProp(newConfig) === undefined
  ) {
    throw new AIToolFailure(
      "selectedReplicantValue has no effect on this figure: it has no active " +
        "replicant (no dimension is displayed as 'replicant', or the replicant " +
        "dimension is filtered to a single value). Set a dimension's " +
        "disDisplayOpt to 'replicant' first. No changes were applied.",
    );
  }

  // STRUCTURAL check for rollupPosition (conditionally applied — a diff cannot
  // attribute its no-op): the new config must have a flagged entry to receive
  // the position. Accepted residual: a LATENT flag (gate closed) passes this
  // and renders nothing — the flag's own latency was already reported by the
  // roll-up gate on the edit that created it.
  if (
    patch.rollupPosition !== undefined &&
    !newConfig.d.disaggregateBy.some((e) => e.rollup === true)
  ) {
    throw new AIToolFailure(
      "rollupPosition has no effect on this figure: no disaggregated dimension " +
        "carries a roll-up. Set rollupDimension first. No changes were applied.",
    );
  }

  // STRUCTURAL check for rollupDimension: the named dimension must be
  // disaggregated to receive the flag (the write maps over disaggregateBy).
  // `rollupDimension: null` (remove) must NOT error when there is nothing to
  // remove — hence the string gate.
  if (
    typeof patch.rollupDimension === "string" &&
    !newConfig.d.disaggregateBy.some((e) => e.disOpt === patch.rollupDimension)
  ) {
    throw new AIToolFailure(
      `rollupDimension "${patch.rollupDimension}" is not a disaggregated dimension of this figure, so there is no entry to attach the roll-up to. Add it to disaggregateBy first. No changes were applied.`,
    );
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
    getEffectiveRollupDimension(source, newConfig) === undefined
  ) {
    throw new AIToolFailure(
      "The requested roll-up is not available for this configuration: exactly "
      + "ONE disaggregated dimension may carry it, it must be an admin level "
      + "(admin_area_2/3/4) or facility column, not shown as replicant/map "
      + "area, not filtered to a single value, not on a map or pie, and the "
      + "metric must be re-aggregatable. No changes were applied.",
    );
  }

  // PRE-WRITE slot-collision check — the editor UI's own guard (ruling F):
  // convert-then-patch (and patch-supplied slots colliding with each other)
  // can put two elements on one slot, which the renderer resolves by silently
  // dropping one. Delta-gated so a caption edit on a drifted stored config is
  // not blocked. Falls back to no singleValueDims when the possible-values
  // map is unavailable — still catches plain slot collisions.
  if (touchesType || touchesDisagg || patch.valuesDisDisplayOpt !== undefined) {
    const singleValueDims = opts.disaggregationPossibleValues
      ? getSingleValueDimsFromPossibleValues(opts.disaggregationPossibleValues)
      : undefined;
    const { config: effectiveConfig, effectiveValueProps } = getEffectivePOConfig(newConfig, {
      valueProps: source.valueProps,
      singleValueDims,
    });
    if (
      hasDuplicateDisaggregatorDisplayOptions(source, effectiveConfig, effectiveValueProps)
    ) {
      throw new AIToolFailure(
        `Two display elements share the same slot for a "${type}" figure (a disaggregation, or the value dimension, collides). The figure would not render correctly. Give each element a distinct display slot. No changes were applied.`,
      );
    }
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
