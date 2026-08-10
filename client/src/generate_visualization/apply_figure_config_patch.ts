import type {
  AiVizConfigUpdate,
  PeriodBounds,
  PresentationObjectConfig,
  ResultsValue,
} from "lib";
import { convertPeriodValue, convertVisualizationType } from "lib";
import { AIToolFailure } from "panther";

// Every patch field except these two is written unconditionally
// (`if (patch.X !== undefined) d.X = patch.X`), so a no-diff on one of those
// can ONLY mean "the value already equalled the stored one". These two are
// written through a filter over disaggregateBy, so for THEM a no-diff is
// uninformative — they get structural checks in validateFigureConfigEdit
// instead. A future field written through a filter or conditional rather than
// a plain assignment MUST be added here AND given its own structural check —
// otherwise its silent no-op is reported as "value already equal", this bug
// class re-entering through its own detector. applyFigureConfigPatch below is
// the authority for which fields qualify.
//
// EXCEPTION kept OFF this list: the selectedReplicantValue clear at the end of
// apply makes that field conditionally applied by the letter of the rule, but
// the clear can never silently swallow a patch-supplied value — structural
// slot absence implies getReplicateByProp returns undefined, so the liveness
// check in validateFigureConfigEdit has already thrown before any report is
// computed. The clear only ever runs on the not-patch-supplied stale-repair
// case, where "no change reported" is the truth.
export const CONDITIONALLY_APPLIED_FIELDS = [
  "rollupDimension",
  "rollupPosition",
] as const;

// Apply an AI config patch onto an existing figure config, returning a FRESH
// copy (never mutates the input). Pure — no fetches; `dataBounds` (the
// metric's real period range) is fetched by the CALLER, and only when the
// patch's periodFilter omits a side. Array fields replace whole; `null` clears
// a nullable field.
//
// `type` and `timeseriesGrouping` are reachable only from the viz-editor
// caller (the figure patch schema does not carry them — figure type stays
// immutable). A differing `type` runs convertVisualizationType FIRST — the
// same transform the editor's type dropdown uses, rewriting
// valuesDisDisplayOpt and every disDisplayOpt — then the rest of the patch
// applies on top, so an explicit patch slot wins over the conversion's
// fallback. config.s is untouched by a plain patch; a type change rewrites
// s.content + styleResets by design (matching the human dropdown).
export function applyFigureConfigPatch(
  config: PresentationObjectConfig,
  patch: AiVizConfigUpdate,
  source: ResultsValue,
  dataBounds: PeriodBounds | undefined,
): PresentationObjectConfig {
  let base = config;
  if (patch.type !== undefined && patch.type !== config.d.type) {
    base = convertVisualizationType(
      config,
      patch.type,
      source.disaggregationOptions,
    );
    if (patch.type === "timeseries") {
      // convertVisualizationType defaults the grouping to "period_id" without
      // consulting the metric; on a year-granularity metric that pushes a
      // column that isn't in the results file into groupBys. The metric's own
      // granularity is the correct default. (The human dropdown drops the
      // converted grouping on the floor, so this default is AI-path-only.)
      base = {
        ...base,
        d: {
          ...base.d,
          timeseriesGrouping: config.d.timeseriesGrouping ??
            source.mostGranularTimePeriodColumnInResultsFile,
        },
      };
    }
  }

  const d = { ...base.d };
  const t = { ...base.t };

  if (patch.timeseriesGrouping !== undefined) {
    d.timeseriesGrouping = patch.timeseriesGrouping;
  }
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
    // and the save-time strip then deletes both. The carry-over reads the
    // (possibly converted) base config — convert remaps disDisplayOpt but
    // never disOpt, so the match still holds.
    const anyExplicitFlag = patch.disaggregateBy.some(
      (e) => e.rollup !== undefined,
    );
    d.disaggregateBy = anyExplicitFlag
      ? patch.disaggregateBy
      : patch.disaggregateBy.map((e) => {
          const prev = base.d.disaggregateBy.find((x) => x.disOpt === e.disOpt);
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
      const periodOption = source.mostGranularTimePeriodColumnInResultsFile;
      if (!periodOption) {
        throw new AIToolFailure("Cannot set periodFilter: metric has no time period column");
      }
      const rawMin = patch.periodFilter.min;
      const rawMax = patch.periodFilter.max;
      if (rawMin == null && rawMax == null) {
        // No constraint → clear (all time), not an empty custom filter.
        d.periodFilter = undefined;
      } else if (rawMin != null && rawMax != null) {
        d.periodFilter = {
          filterType: "custom",
          min: convertPeriodValue(rawMin, periodOption, false),
          max: convertPeriodValue(rawMax, periodOption, true),
        };
      } else {
        // An open-ended side is filled with the metric's REAL data bounds so
        // every stored bound self-identifies (no sentinels).
        if (!dataBounds) {
          throw new AIToolFailure(
            "Cannot set an open-ended periodFilter: the metric's data period range is unavailable. Provide both min and max.",
          );
        }
        // Year-granularity data: the query engine collapses every non-custom
        // filter to the latest year (getPeriodFilterExactBounds), so a stored
        // from_month would read back "from X to present" while rendering the
        // latest year only. Bounded custom is the only faithful form.
        if (rawMin != null && periodOption === "year") {
          throw new AIToolFailure(
            "Cannot set an open-ended periodFilter on an annual metric: 'from X onward' is not supported for year-granularity data and would render only the latest year. Provide both min and max (e.g. {min: 2020, max: 2024}).",
          );
        }
        d.periodFilter = rawMin != null
          // Open upper ("from X onward") → from_month: the stored max is
          // schema-mandated but ignored at query time — the range re-anchors
          // to the live data ("to present").
          ? {
              filterType: "from_month",
              min: convertPeriodValue(rawMin, periodOption, false),
              max: dataBounds.max,
            }
          // Open lower ("up to X") → custom from the data's earliest period.
          : {
              filterType: "custom",
              min: dataBounds.min,
              max: convertPeriodValue(rawMax!, periodOption, true),
            };
      }
    }
  }

  if (patch.caption !== undefined) t.caption = patch.caption;
  if (patch.subCaption !== undefined) t.subCaption = patch.subCaption;
  if (patch.footnote !== undefined) t.footnote = patch.footnote;

  // Clear a selectedReplicantValue with no replicant SLOT to read it —
  // STRUCTURAL absence only (e.g. a type conversion dropped the slot;
  // convertVisualizationType never clears the value). Deliberately NOT
  // getReplicateByProp: that also returns undefined for a replicant dimension
  // transiently filtered to one value, and clearing on that would destroy the
  // user's stored value on a filter edit. Same policy as the roll-up flag —
  // no eager clearing on transient gate closures; stripped at save instead.
  if (
    d.selectedReplicantValue !== undefined &&
    !d.disaggregateBy.some((e) => e.disDisplayOpt === "replicant")
  ) {
    d.selectedReplicantValue = undefined;
  }

  return { ...base, d, t };
}
