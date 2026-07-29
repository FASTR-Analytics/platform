import type { CalendarType } from "@timroberton/panther";
import type { FigureLocalization } from "./types/_figure_bundle.ts";
import type { PresentationObjectConfig } from "./types/_presentation_object_config.ts";

// The one place fiscal-year reporting turns into a panther calendar.
//
// "gregorian-fy-july" is a pure relabeling of the quarterly x-axis: large ticks
// move to July and the band reads FY2025/26 instead of 2025. It changes nothing
// about how periods are stored, filtered, sorted or fetched, so the period-range
// filter above a chart still reads calendar quarters. That inconsistency is
// intended, not a bug to chase later.
//
// Three guards, each load-bearing:
//   - quarterly only — the relabeling is defined on quarter ids, and July falls
//     on a calendar-quarter boundary so no re-bucketing is needed. Monthly and
//     annual axes fall through to the plain calendar.
//   - timeseries only — it is an x-period-axis feature, and no other figure
//     type has one.
//   - gregorian only — FY-July is a gregorian variant. Ethiopian quarters span
//     different months and would be mislabelled. The server also refuses the
//     combination at boot; this is the second line of defence, and the one that
//     protects already-stored bundles.
export function resolveFigureCalendar(
  config: PresentationObjectConfig,
  localization: FigureLocalization,
): CalendarType {
  if (localization.fiscalYear !== "july") {
    return localization.calendar;
  }
  if (localization.calendar !== "gregorian") {
    return localization.calendar;
  }
  if (config.d.type !== "timeseries") {
    return localization.calendar;
  }
  if (config.d.timeseriesGrouping !== "quarter_id") {
    return localization.calendar;
  }
  return "gregorian-fy-july";
}
