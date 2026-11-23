import type { TimeseriesMode } from "./figure_config/schema.ts";

// The metrics each special timeseries mode draws: the editor offers a mode
// only on these, and the figure validator refuses a mode on any other.
// m2-02-01 draws the percent-change chart because a retired m3-01-01 figure
// that compares adjustment bases or uses a facility column is carried to it.
// The band's metrics are deliberately not in ALLOW_NEGATIVE_SCALE_VALUES_METRICS:
// unlike M3's expected-volume model, the M11 NegBin model and its credible
// bounds are non-negative by construction.
export const SPECIAL_CHART_METRICS: Record<
  Exclude<TimeseriesMode, "standard">,
  readonly string[]
> = {
  coverage: ["m4-01-01", "m6-01-01", "m6-02-01", "m6-03-01"],
  percentChange: ["m12-01-01", "m3-01-01", "m2-02-01"],
  disruptions: ["m3-02-01", "m3-03-01", "m3-04-01", "m3-05-01"],
  disruptionsBand: ["m11-01-01", "m11-01-02", "m11-01-03", "m11-01-04"],
};
