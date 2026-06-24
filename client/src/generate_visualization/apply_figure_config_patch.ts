import type {
  AiFigureConfigPatch,
  PeriodOption,
  PresentationObjectConfig,
} from "lib";
import { convertPeriodValue } from "lib";

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
  if (patch.disaggregateBy !== undefined) d.disaggregateBy = patch.disaggregateBy;
  if (patch.filterBy !== undefined) d.filterBy = patch.filterBy;
  if (patch.selectedReplicantValue !== undefined) {
    d.selectedReplicantValue = patch.selectedReplicantValue === null
      ? undefined
      : patch.selectedReplicantValue;
  }
  if (patch.includeAdminAreaRollup !== undefined) d.includeAdminAreaRollup = patch.includeAdminAreaRollup;
  if (patch.adminAreaRollupPosition !== undefined) d.adminAreaRollupPosition = patch.adminAreaRollupPosition;
  if (patch.periodFilter !== undefined) {
    if (patch.periodFilter === null) {
      d.periodFilter = undefined;
    } else {
      if (!periodOption) {
        throw new Error("Cannot set periodFilter: metric has no time period column");
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
