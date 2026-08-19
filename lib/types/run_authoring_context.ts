// =============================================================================
// RunAuthoringContext — everything an author needs FROM a package
// =============================================================================
//
// A pure function of the run directory: which modules ran, which metrics they
// produced and whether each is available, which datasets were captured, the
// indicator vocabularies, and the presets (the default visualizations derived
// from the manifest). This is the projection `getProjectDetail` used to build
// per project — but a package is immutable, so keyed by `runId` alone it is
// immutable by identity, which is what lets the client cache it forever
// (PLAN_PRODUCTS_RESTRUCTURE D7).
//
// It carries NO scope: scope changes what a figure QUERY returns, never what
// exists to author against. And no `timePoints` on the taxonomy — HFA survey
// rounds are instance-wide T1 state, so the client composes them in rather
// than freezing an instance fact into an immutable per-run payload.
// =============================================================================

import type { DerivedDefaultVisualization } from "../derive_default_visualizations.ts";
import type { HfaTaxonomyForAI } from "./hfa_types.ts";
import type { InstalledModuleSummary, MetricWithStatus } from "./modules.ts";
import type { RunDataset } from "./run_datasets.ts";

export type RunAuthoringContextHfaTaxonomy = Omit<HfaTaxonomyForAI, "timePoints">;

export type RunAuthoringContext = {
  runId: string;
  modules: InstalledModuleSummary[];
  metrics: MetricWithStatus[];
  datasets: RunDataset[];
  commonIndicators: { id: string; label: string }[];
  icehIndicators: { id: string; label: string; category: string }[];
  hfaTaxonomy: RunAuthoringContextHfaTaxonomy;
  // The metric → preset gallery both editors and the Explore tab author from.
  // Presets are not products: no rows, no detail read — they render through
  // the run-keyed items read with their own config.
  presets: DerivedDefaultVisualization[];
};
