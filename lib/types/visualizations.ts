// Contract: the `visualizations` table in the PRODUCTS AND FOLDERS block of
// server/db/instance/_main_database.sql.

import type { FigureBundle } from "./_figure_bundle.ts";

// A visualization product is one saved figure: its bundle, resolved under the
// product's pair and kept as a snapshot like a slide's or a report's figure.
export type VisualizationDetail = {
  id: string;
  label: string;
  bundle: FigureBundle;
  lastUpdated: string;
};
