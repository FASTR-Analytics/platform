// =============================================================================
// Report CRDT model (Yjs)
// =============================================================================
//
// A report is modelled as a Y.Doc so multiple users can edit it concurrently.
// This module is the bridge between the stored report columns and the Yjs
// document; it is shared by client (editor) and server (relay + persistence),
// so it lives in `lib/`. Far simpler than the slide model — a report is one
// flat markdown string plus two flat registries:
//
//   doc.getText("body")    — the whole document markdown (character co-editing;
//                            the editor binds CodeMirror to it via yCollab)
//   doc.getMap("figures")  — figureId -> FigureBlock (opaque LWW entries)
//   doc.getMap("images")   — imageId  -> ImageBlock  (opaque LWW entries)
//
// `label` and `config` are deliberately NOT in the doc: they are edited via
// separate routes/UI (rename, settings), never inside the editor, and giving
// them a second writer path here would only create conflicts.

import * as Y from "yjs";
import type { ReportDetail } from "../types/reports.ts";
import type { FigureBlock, FigureBundle } from "../types/_figure_bundle.ts";
import { setOpaque, syncText } from "./crdt_util.ts";
import {
  materializeFigureConfig,
  seedFigureConfigMap,
  syncFigureConfigToMap,
} from "./figure_config_crdt.ts";

/** The slice of a report that lives in (and is persisted from) the shared doc. */
export type ReportDocContent = Pick<ReportDetail, "body" | "figures" | "images">;

const BODY_KEY = "body";
const FIGURES_KEY = "figures";
const IMAGES_KEY = "images";

// A report figure registry entry is decomposed like a slide figure node: the
// bundle's `config` becomes a co-editable Y.Map ("figConfig") and the heavy
// remainder rides opaque ("figData"). Legacy entries stored the whole FigureBlock
// as a plain object; that is honored on read and converted on the next sync.
const FIG_CONFIG_KEY = "figConfig";
const FIG_DATA_KEY = "figData";

/** Build a decomposed figure entry Y.Map from a FigureBlock. */
function buildFigureEntry(block: FigureBlock): Y.Map<unknown> {
  const entry = new Y.Map<unknown>();
  if (block.bundle !== undefined) {
    const { config, ...figData } = block.bundle;
    const cfgMap = new Y.Map<unknown>();
    seedFigureConfigMap(cfgMap, config);
    entry.set(FIG_CONFIG_KEY, cfgMap);
    entry.set(FIG_DATA_KEY, figData);
  }
  return entry;
}

/** Read a figure registry entry (decomposed Y.Map, else legacy plain object). */
function readFigureEntry(entry: unknown): FigureBlock {
  if (entry instanceof Y.Map) {
    const cfgMap = entry.get(FIG_CONFIG_KEY);
    if (cfgMap instanceof Y.Map) {
      const figData = (entry.get(FIG_DATA_KEY) as Record<string, unknown>) ?? {};
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

// Fast path (see slide_crdt): skip re-serializing a figure entry whose bundle
// object reference is unchanged since the last sync.
const lastFigureBundleRef = new WeakMap<Y.Map<unknown>, unknown>();

/** Seed an (assumed empty) Y.Doc from report content. */
export function seedReportDoc(doc: Y.Doc, content: ReportDocContent): void {
  const body = doc.getText(BODY_KEY);
  if (content.body.length > 0) body.insert(0, content.body);
  const figures = doc.getMap<unknown>(FIGURES_KEY);
  for (const [id, block] of Object.entries(content.figures)) {
    figures.set(id, buildFigureEntry(block));
  }
  const images = doc.getMap<unknown>(IMAGES_KEY);
  for (const [id, block] of Object.entries(content.images)) {
    images.set(id, block);
  }
}

/** Project the Y.Doc back into report content (the server re-validates the
 *  registries with reportFiguresSchema/reportImagesSchema before persisting). */
export function materializeReport(doc: Y.Doc): ReportDocContent {
  const figures: Record<string, unknown> = {};
  for (const [id, entry] of doc.getMap<unknown>(FIGURES_KEY).entries()) {
    figures[id] = readFigureEntry(entry);
  }
  const images: Record<string, unknown> = {};
  for (const [id, block] of doc.getMap<unknown>(IMAGES_KEY).entries()) {
    images[id] = block;
  }
  return {
    body: doc.getText(BODY_KEY).toString(),
    figures: figures as ReportDocContent["figures"],
    images: images as ReportDocContent["images"],
  };
}

/** The body Y.Text, for binding the editor's CodeMirror via yCollab. */
export function findReportBodyText(doc: Y.Doc): Y.Text {
  return doc.getText(BODY_KEY);
}

/** The figConfig Y.Map for a report figure id (for binding the figure-editor
 *  modal to co-edit its config), or undefined when the figure has no bundle or
 *  hasn't been decomposed yet (legacy entry). */
export function findReportFigureConfigMap(
  doc: Y.Doc,
  figureId: string,
): Y.Map<unknown> | undefined {
  const entry = doc.getMap<unknown>(FIGURES_KEY).get(figureId);
  if (!(entry instanceof Y.Map)) return undefined;
  const cfg = entry.get(FIG_CONFIG_KEY);
  return cfg instanceof Y.Map ? cfg : undefined;
}

/** Options for a registry sync — lets a host with an open figure-editor modal
 *  exclude that figure's config from the push (the modal owns it live). */
export type SyncReportOpts = {
  skipFigureConfigForFigureIds?: Set<string>;
};

/** Diff the figure/image registries onto the doc; entries absent from the target
 *  are deleted; an undefined registry is skipped (partial external writes).
 *  Idempotent. Figures are decomposed (figConfig co-editable + figData opaque);
 *  images stay opaque LWW (callers honor the fresh-reference invariant for the
 *  block objects). */
export function syncReportRegistries(
  doc: Y.Doc,
  figures?: ReportDocContent["figures"],
  images?: ReportDocContent["images"],
  opts?: SyncReportOpts,
): void {
  if (figures !== undefined) {
    syncFigureRegistry(doc.getMap<unknown>(FIGURES_KEY), figures, opts);
  }
  if (images !== undefined) {
    syncRegistry(doc.getMap<unknown>(IMAGES_KEY), images);
  }
}

function syncRegistry(
  m: Y.Map<unknown>,
  target: Record<string, unknown>,
): void {
  for (const id of [...m.keys()]) {
    if (!(id in target)) m.delete(id);
  }
  for (const [id, block] of Object.entries(target)) {
    setOpaque(m, id, block);
  }
}

function syncFigureRegistry(
  m: Y.Map<unknown>,
  target: Record<string, FigureBlock>,
  opts?: SyncReportOpts,
): void {
  for (const id of [...m.keys()]) {
    if (!(id in target)) m.delete(id);
  }
  for (const [id, block] of Object.entries(target)) {
    let entry = m.get(id);
    if (!(entry instanceof Y.Map)) {
      // New id, or converting a legacy plain-object entry to the nested shape.
      m.set(id, buildFigureEntry(block));
      continue;
    }
    syncFigureEntry(
      entry as Y.Map<unknown>,
      block,
      opts?.skipFigureConfigForFigureIds?.has(id) ?? false,
    );
  }
}

function syncFigureEntry(
  entry: Y.Map<unknown>,
  block: FigureBlock,
  skipConfig: boolean,
): void {
  const bundle = block.bundle;
  if (bundle === undefined) {
    for (const k of [FIG_CONFIG_KEY, FIG_DATA_KEY]) {
      if (entry.has(k)) entry.delete(k);
    }
    lastFigureBundleRef.delete(entry);
    return;
  }
  if (lastFigureBundleRef.get(entry) === bundle) return;
  const { config, ...figData } = bundle;
  if (!skipConfig) {
    let cfgMap = entry.get(FIG_CONFIG_KEY);
    if (!(cfgMap instanceof Y.Map)) {
      cfgMap = new Y.Map<unknown>();
      entry.set(FIG_CONFIG_KEY, cfgMap);
    }
    syncFigureConfigToMap(cfgMap as Y.Map<unknown>, config);
  }
  setOpaque(entry, FIG_DATA_KEY, figData);
  lastFigureBundleRef.set(entry, bundle);
}

/** Diff full report content onto the doc (minimal mergeable ops). Idempotent —
 *  a no-op when the doc already matches, which is what makes it safe to call
 *  unconditionally (echo guard; no latched "was this remote?" flags). */
export function syncReportToDoc(doc: Y.Doc, target: ReportDocContent): void {
  syncText(doc.getText(BODY_KEY), target.body);
  syncReportRegistries(doc, target.figures, target.images);
}
