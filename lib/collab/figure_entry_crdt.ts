// =============================================================================
// Figure entry CRDT model (Yjs)
// =============================================================================
//
// One stored FigureBlock as a Y.Map, shared by the report figure registry
// (one entry per figure id) and the visualization doc (one root entry). The
// bundle's `config` becomes a co-editable Y.Map ("figConfig", via the
// figure-config bridge) and the heavy remainder rides opaque ("figData").
// Legacy entries stored the whole FigureBlock as a plain object; that is
// honored on read and converted on the next sync.

import * as Y from "yjs";
import type { FigureBlock, FigureBundle } from "../types/_figure_bundle.ts";
import { setOpaque } from "./crdt_util.ts";
import {
  materializeFigureConfig,
  seedFigureConfigMap,
  syncFigureConfigToMap,
} from "./figure_config_crdt.ts";

export const FIG_CONFIG_KEY = "figConfig";
export const FIG_DATA_KEY = "figData";

/** Fill an (assumed empty) entry map from a FigureBlock. */
export function seedFigureEntry(entry: Y.Map<unknown>, block: FigureBlock) {
  if (block.bundle !== undefined) {
    const { config, ...figData } = block.bundle;
    const cfgMap = new Y.Map<unknown>();
    seedFigureConfigMap(cfgMap, config);
    entry.set(FIG_CONFIG_KEY, cfgMap);
    entry.set(FIG_DATA_KEY, figData);
  }
}

/** Build a decomposed figure entry Y.Map from a FigureBlock. */
export function buildFigureEntry(block: FigureBlock): Y.Map<unknown> {
  const entry = new Y.Map<unknown>();
  seedFigureEntry(entry, block);
  return entry;
}

/** Read a figure entry (decomposed Y.Map, else legacy plain object). */
export function readFigureEntry(entry: unknown): FigureBlock {
  if (entry instanceof Y.Map) {
    const cfgMap = entry.get(FIG_CONFIG_KEY);
    if (cfgMap instanceof Y.Map) {
      const figData = (entry.get(FIG_DATA_KEY) as Record<string, unknown>) ??
        {};
      return {
        type: "figure",
        bundle: {
          ...figData,
          config: materializeFigureConfig(cfgMap),
        } as FigureBundle,
      };
    }
    return { type: "figure" };
  }
  return entry as FigureBlock;
}

/** The entry's figConfig Y.Map, or undefined when it has none. */
export function findFigureEntryConfigMap(
  entry: unknown,
): Y.Map<unknown> | undefined {
  if (!(entry instanceof Y.Map)) {
    return undefined;
  }
  const cfg = entry.get(FIG_CONFIG_KEY);
  return cfg instanceof Y.Map ? cfg : undefined;
}

// Fast path (see slide_crdt): skip re-serializing a figure entry whose bundle
// object reference is unchanged since the last sync.
const lastFigureBundleRef = new WeakMap<Y.Map<unknown>, unknown>();

/** Drop the entry's fast-path reference: call after writing the entry by any
 *  path other than syncFigureEntry, so the next sync compares content. */
export function forgetSyncedFigureBundle(entry: Y.Map<unknown>): void {
  lastFigureBundleRef.delete(entry);
}

/** Diff a FigureBlock onto an existing entry map. `skipConfig` leaves the
 *  figConfig map alone (a figure-editor modal owns it live). Idempotent. */
export function syncFigureEntry(
  entry: Y.Map<unknown>,
  block: FigureBlock,
  skipConfig: boolean,
): void {
  const bundle = block.bundle;
  if (bundle === undefined) {
    for (const k of [FIG_CONFIG_KEY, FIG_DATA_KEY]) {
      if (entry.has(k)) {
        entry.delete(k);
      }
    }
    lastFigureBundleRef.delete(entry);
    return;
  }
  if (lastFigureBundleRef.get(entry) === bundle) {
    return;
  }
  const { config, ...figData } = bundle;
  // Honor the skip only when there IS a figConfig map for the modal to own:
  // see the same guard in slide_crdt.ts syncFigureNode. Without a map, writing
  // figData alone makes readFigureEntry report a bundle-less figure, so the
  // checkpoint stores an empty one and stamps crdt_state trusted.
  const existingConfig = entry.get(FIG_CONFIG_KEY);
  if (!skipConfig || !(existingConfig instanceof Y.Map)) {
    let cfgMap = existingConfig;
    if (!(cfgMap instanceof Y.Map)) {
      cfgMap = new Y.Map<unknown>();
      entry.set(FIG_CONFIG_KEY, cfgMap);
    }
    syncFigureConfigToMap(cfgMap as Y.Map<unknown>, config);
  }
  setOpaque(entry, FIG_DATA_KEY, figData);
  lastFigureBundleRef.set(entry, bundle);
}
