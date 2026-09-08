import type { DerivedDefaultVisualization } from "../derive_default_visualizations.ts";
import type { HfaTaxonomyForAI } from "./hfa_types.ts";
import type { InstalledModuleSummary, MetricWithStatus } from "./modules.ts";
import type { RunDataset } from "./run_datasets.ts";

// Everything an author needs FROM a package: which modules ran, which metrics
// they produced and whether each is available, which datasets were captured,
// the indicator vocabularies, and the presets (the default visualizations
// derived from the manifest). A pure function of the run directory, so keyed
// by `runId` alone the payload is immutable by identity and the client caches
// it without revalidating (PLAN_PRODUCTS_RESTRUCTURE D7).
//
// It carries no scope (scope changes what a figure QUERY returns, never what
// exists to author against) and no `timePoints` on the taxonomy (HFA survey
// rounds are instance-wide T1 state, so each consumer composes them in).

export type RunAuthoringContextHfaTaxonomy = Omit<
  HfaTaxonomyForAI,
  "timePoints"
>;

export type RunAuthoringContext = {
  runId: string;
  modules: InstalledModuleSummary[];
  metrics: MetricWithStatus[];
  datasets: RunDataset[];
  commonIndicators: { id: string; label: string }[];
  icehIndicators: { id: string; label: string; category: string }[];
  hfaTaxonomy: RunAuthoringContextHfaTaxonomy;
  // Presets are not products: no rows, no detail read. They render through
  // the run-keyed items read with their own config (D6).
  presets: DerivedDefaultVisualization[];
};
