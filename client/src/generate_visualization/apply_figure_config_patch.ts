import type {
  AiFigureConfigPatch,
  PeriodOption,
  PresentationObjectConfig,
} from "lib";
import { convertPeriodValue } from "lib";
import { AIToolFailure } from "panther";

// Apply an AI config patch onto an existing figure config, returning a FRESH
// copy (never mutates the input). Pure — no fetches. Array fields replace whole;
// `null` clears a nullable field; periodFilter takes both min/max and becomes a
// `custom` filter. config.s (style) and the figure's `type` are preserved (type
// is not editable by the AI).
export function applyFigureConfigPatch(
  config: PresentationObjectConfig,
  patch: AiFigureConfigPatch,
  periodOption: PeriodOption | undefined, // metric.mostGranularTimePeriodColumnInResultsFile
): PresentationObjectConfig {
  const d = { ...config.d };
  const t = { ...config.t };

  if (patch.valuesDisDisplayOpt !== undefined) d.valuesDisDisplayOpt = patch.valuesDisDisplayOpt;
  if (patch.valuesFilter !== undefined) {
    d.valuesFilter = patch.valuesFilter === null ? undefined : patch.valuesFilter;
  }
  if (patch.disaggregateBy !== undefined) {
    // Carry the roll-up flag across the wholesale replacement: an entry that
    // doesn't state its own flag inherits the existing entry's (same disOpt),
    // so replacing disaggregations doesn't silently drop the roll-up. But if
    // ANY patch entry states a rollup field, the patch is authoritative for
    // ALL flags — mixing an explicit flag with a carried-over one would
    // produce two flagged entries, which the gate treats as no roll-up at all
    // and the save-time strip then deletes both.
    const anyExplicitFlag = patch.disaggregateBy.some(
      (e) => e.rollup !== undefined,
    );
    d.disaggregateBy = anyExplicitFlag
      ? patch.disaggregateBy
      : patch.disaggregateBy.map((e) => {
          const prev = config.d.disaggregateBy.find((x) => x.disOpt === e.disOpt);
          return prev?.rollup === true
            ? { ...e, rollup: true, rollupPosition: prev.rollupPosition }
            : e;
        });
  }
  if (patch.filterBy !== undefined) d.filterBy = patch.filterBy;
  if (patch.selectedReplicantValue !== undefined) {
    d.selectedReplicantValue = patch.selectedReplicantValue === null
      ? undefined
      : patch.selectedReplicantValue;
  }
  if (patch.rollupDimension !== undefined) {
    const dim = patch.rollupDimension;
    d.disaggregateBy = d.disaggregateBy.map((e) =>
      dim !== null && e.disOpt === dim
        ? { ...e, rollup: true, rollupPosition: e.rollupPosition ?? "bottom" }
        : { disOpt: e.disOpt, disDisplayOpt: e.disDisplayOpt });
  }
  if (patch.rollupPosition !== undefined) {
    d.disaggregateBy = d.disaggregateBy.map((e) =>
      e.rollup === true ? { ...e, rollupPosition: patch.rollupPosition } : e);
  }
  if (patch.periodFilter !== undefined) {
    if (patch.periodFilter === null) {
      d.periodFilter = undefined;
    } else {
      if (!periodOption) {
        throw new AIToolFailure("Cannot set periodFilter: metric has no time period column");
      }
      d.periodFilter = {
        filterType: "custom",
        min: convertPeriodValue(patch.periodFilter.min, periodOption, false),
        max: convertPeriodValue(patch.periodFilter.max, periodOption, true),
      };
    }
  }

  if (patch.caption !== undefined) t.caption = patch.caption;
  if (patch.subCaption !== undefined) t.subCaption = patch.subCaption;
  if (patch.footnote !== undefined) t.footnote = patch.footnote;

  return { ...config, d, t };
}
