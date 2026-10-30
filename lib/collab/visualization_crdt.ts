// =============================================================================
// Visualization CRDT model (Yjs)
// =============================================================================
//
// A visualization product is one saved figure, modelled as a Y.Doc so several
// users can edit it at once. Shared by client (editor) and server (relay +
// persistence), so it lives in `lib/`:
//
//   doc.getMap("figure") : the figure entry, the same shape as one report
//                          figure registry entry (figure_entry_crdt.ts):
//                          "figConfig" (co-editable Y.Map of the bundle
//                          config) + "figData" (opaque remainder)
//
// `label` is deliberately NOT in the doc: it is edited through the rename
// route, never inside the editor.

import type * as Y from "yjs";
import type { FigureBundle } from "../types/_figure_bundle.ts";
import { canonicalJson, setOpaque } from "./crdt_util.ts";
import { syncFigureConfigToMap } from "./figure_config_crdt.ts";
import {
  FIG_DATA_KEY,
  findFigureEntryConfigMap,
  forgetSyncedFigureBundle,
  readFigureEntry,
  seedFigureEntry,
  syncFigureEntry,
} from "./figure_entry_crdt.ts";

/** The slice of a visualization that lives in (and is persisted from) the
 *  shared doc. */
export type VisualizationDocContent = { bundle: FigureBundle };

const FIGURE_KEY = "figure";

function figureEntry(doc: Y.Doc): Y.Map<unknown> {
  return doc.getMap<unknown>(FIGURE_KEY);
}

/** Seed an (assumed empty) Y.Doc from visualization content. */
export function seedVisualizationDoc(
  doc: Y.Doc,
  content: VisualizationDocContent,
): void {
  seedFigureEntry(figureEntry(doc), { type: "figure", bundle: content.bundle });
}

/** Project the Y.Doc back into visualization content (the server re-validates
 *  the bundle with figureBundleSchema before persisting). Throws on a doc with
 *  no figure: the same doc reproduces that forever, so the checkpoint treats
 *  it as a permanent failure. */
export function materializeVisualization(
  doc: Y.Doc,
): VisualizationDocContent {
  const block = readFigureEntry(figureEntry(doc));
  if (block.bundle === undefined) {
    throw new Error("Visualization doc holds no figure");
  }
  return { bundle: block.bundle };
}

/** The metric the doc's figure is on, read from figData without
 *  materializing the bundle; undefined before the doc holds a figure. */
export function visualizationDocMetricId(doc: Y.Doc): string | undefined {
  const figData = figureEntry(doc).get(FIG_DATA_KEY);
  if (figData === null || typeof figData !== "object") return undefined;
  const metricId = (figData as { metricId?: unknown }).metricId;
  return typeof metricId === "string" ? metricId : undefined;
}

/** The figConfig Y.Map, for binding the figure editor to co-edit the config;
 *  undefined before the doc holds a figure. */
export function findVisualizationConfigMap(
  doc: Y.Doc,
): Y.Map<unknown> | undefined {
  return findFigureEntryConfigMap(figureEntry(doc));
}

// The data half of a bundle, without the fields that change on every fetch
// whatever the figure: `snapshotAt` is stamped at each resolve, so comparing
// it would make merely opening a visualization write the doc, checkpoint and
// bump the product to the top of the list.
function figDataForCompare(figData: unknown): string {
  if (figData === null || typeof figData !== "object") {
    return canonicalJson(figData);
  }
  const { snapshotAt: _snapshotAt, ...rest } = figData as Record<
    string,
    unknown
  >;
  return canonicalJson(rest);
}

/** Write a freshly resolved bundle's data half (items, metadata, scope,
 *  provenance) onto the doc, leaving the co-edited config alone: the figure
 *  editor owns figConfig live. A no-op when only `snapshotAt` differs. With no
 *  figConfig map yet, writes the whole bundle (data alone would read back as
 *  a figure without a bundle). */
export function syncVisualizationFigData(
  doc: Y.Doc,
  bundle: FigureBundle,
): void {
  const entry = figureEntry(doc);
  if (findFigureEntryConfigMap(entry) === undefined) {
    syncFigureEntry(entry, { type: "figure", bundle }, false);
    return;
  }
  const { config: _config, ...figData } = bundle;
  if (
    figDataForCompare(entry.get(FIG_DATA_KEY)) === figDataForCompare(figData)
  ) {
    return;
  }
  setOpaque(entry, FIG_DATA_KEY, figData);
  forgetSyncedFigureBundle(entry);
}

/** Diff full visualization content onto the doc (config and data).
 *  Idempotent: a no-op when the doc already matches, `snapshotAt` aside (see
 *  syncVisualizationFigData), so a re-resolve that found nothing new writes
 *  nothing. */
export function syncVisualizationToDoc(
  doc: Y.Doc,
  target: VisualizationDocContent,
): void {
  const cfg = findVisualizationConfigMap(doc);
  if (cfg === undefined) {
    syncFigureEntry(
      figureEntry(doc),
      { type: "figure", bundle: target.bundle },
      false,
    );
    return;
  }
  syncFigureConfigToMap(cfg, target.bundle.config);
  syncVisualizationFigData(doc, target.bundle);
}
