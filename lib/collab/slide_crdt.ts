// =============================================================================
// Slide CRDT model (Yjs) — Milestone 2
// =============================================================================
//
// A single slide is modelled as a Y.Doc so multiple users can edit it
// concurrently. This module is the bridge between the stored `Slide` config
// shape and the Yjs document, and it is shared by client (editor) and server
// (relay + persistence), so it lives in `lib/`.
//
//   root: Y.Map  ( doc.getMap("slide") )
//     "type": "cover" | "section" | "content"
//     cover / section : every scalar field as an LWW map entry
//     content:
//       scalar fields (header, subHeader, date, footer, showHeaderLogos,
//         showFooterLogos) as LWW entries
//       "split": opaque LWW object (small; never co-edited field-by-field)
//       "layout": a node Y.Map (see below)
//
//   Layout node (recursive Y.Map):
//     "id", "type" ("item" | "rows" | "cols"), optional "minH"/"maxH"/"span"
//     "fracIndex": string — present on every NON-root node; orders it within
//        its parent. Reordering is an LWW update of one node's fracIndex, which
//        converges cleanly — this is the fix for the layout-swap hazard (an
//        array move can duplicate/drop a node under concurrency). Children are
//        materialized sorted by (fracIndex, id), so even a fracIndex collision
//        between two concurrently-inserted nodes resolves deterministically.
//     item nodes:
//       "blockType": "text" | "figure" | "image"
//       text:   "markdown": Y.Text (true character-level co-editing);
//               "blockStyle"? opaque
//       image:  "imgFile": string; "blockStyle"? opaque
//       figure: "bundle"? opaque LWW object (the FigureBundle snapshot)
//       "itemStyle"? opaque (layout-node style record); "alignV"?
//     container nodes:
//       "children": Y.Map ( childId -> child node Y.Map )

import * as Y from "yjs";
import { generateKeyBetween, generateNKeysBetween } from "fractional-indexing";
import type { LayoutNode } from "@timroberton/panther";
import type { ContentBlock, Slide } from "../types/slides.ts";
import type { FigureBundle } from "../types/_figure_bundle.ts";
import { setOpaque, setScalar, syncText } from "./crdt_util.ts";
import {
  materializeFigureConfig,
  seedFigureConfigMap,
  syncFigureConfigToMap,
} from "./figure_config_crdt.ts";

// ── Figure node representation (decomposed) ──────────────────────────────────
//
// A figure item node splits the FigureBundle into two keys so the config can be
// co-edited field-by-field (like a standalone visualization) while the heavy,
// derived data rides as one opaque blob:
//   "figConfig": Y.Map  — the bundle's `config` (the figure-config bridge shape)
//   "figData":   opaque — the bundle MINUS config (items, geo, resultsValue,
//                         indicatorMetadata, dateRange, localization, metricId,
//                         snapshotAt, provenance)
// Legacy docs stored the whole bundle opaque under "bundle"; that is honored on
// read (materialize) and converted (the key deleted) on the next sync.

const FIG_CONFIG_KEY = "figConfig";
const FIG_DATA_KEY = "figData";
const FIG_BUNDLE_LEGACY_KEY = "bundle";

/** Split a FigureBundle into its co-editable config and the opaque remainder. */
function splitBundle(
  bundle: FigureBundle,
): { config: FigureBundle["config"]; figData: Record<string, unknown> } {
  const { config, ...figData } = bundle;
  return { config, figData };
}

/** Read a figure node's bundle (decomposed shape, else legacy opaque), or
 *  undefined when the node has no figure yet. */
function readFigureBundle(m: Y.Map<unknown>): FigureBundle | undefined {
  const cfgMap = m.get(FIG_CONFIG_KEY);
  if (cfgMap instanceof Y.Map) {
    const figData = (m.get(FIG_DATA_KEY) as Record<string, unknown>) ?? {};
    return { ...figData, config: materializeFigureConfig(cfgMap) } as FigureBundle;
  }
  const legacy = m.get(FIG_BUNDLE_LEGACY_KEY);
  return legacy === undefined ? undefined : (legacy as FigureBundle);
}

// Fast path: remembers the last whole-bundle object reference synced per figure
// node, so a slide push that didn't touch this figure (the common case — a text
// block edited elsewhere) skips re-serializing its (potentially multi-MB) data.
// Mirrors setOpaque's reference-cache discipline; a changed bundle must be a
// fresh object (the editor's path-set guarantees this — slide_editor index.tsx).
const lastFigureBundleRef = new WeakMap<Y.Map<unknown>, unknown>();

const ROOT_KEY = "slide";

// Root-level TEXT fields per slide type. These are stored as Y.Text (not scalar
// strings) so they support character-level co-editing + remote cursors, exactly
// like a text block's body. Everything else on the slide root (booleans,
// numbers, enums like showHeaderLogos) stays a scalar. Exported for the
// version-history element diff (which compares these fields between configs).
export const TEXT_FIELDS_BY_TYPE: Record<Slide["type"], readonly string[]> = {
  content: ["header", "subHeader", "date", "footer"],
  cover: ["title", "subtitle", "presenter", "date"],
  section: ["sectionTitle", "sectionSubtitle"],
};

const ALL_TEXT_FIELDS = new Set(Object.values(TEXT_FIELDS_BY_TYPE).flat());

// Text fields that are required (never omitted, even when empty). Optional text
// fields are omitted from the materialized config when empty (matching the
// editor's `value || undefined` convention).
const REQUIRED_TEXT_FIELDS = new Set(["title", "sectionTitle"]);

// Non-text scalar fields on a content slide root.
const CONTENT_SCALAR_FIELDS = ["showHeaderLogos", "showFooterLogos"] as const;

type SlideNode = LayoutNode<ContentBlock>;

function newYText(value: unknown): Y.Text {
  const t = new Y.Text();
  if (typeof value === "string" && value.length > 0) t.insert(0, value);
  return t;
}

// ── Build: Slide -> Y.Doc ────────────────────────────────────────────────────

function buildNode(node: SlideNode, fracIndex: string | null): Y.Map<unknown> {
  const m = new Y.Map<unknown>();
  m.set("id", node.id);
  m.set("type", node.type);
  if (fracIndex !== null) m.set("fracIndex", fracIndex);
  if (node.minH !== undefined) m.set("minH", node.minH);
  if (node.maxH !== undefined) m.set("maxH", node.maxH);
  if (node.span !== undefined) m.set("span", node.span);

  if (node.type === "item") {
    const block = node.data;
    m.set("blockType", block.type);
    if (block.type === "text") {
      const t = new Y.Text();
      if (block.markdown) t.insert(0, block.markdown);
      m.set("markdown", t);
      if (block.style !== undefined) m.set("blockStyle", block.style);
    } else if (block.type === "image") {
      m.set("imgFile", block.imgFile);
      if (block.style !== undefined) m.set("blockStyle", block.style);
    } else if (block.type === "figure") {
      if (block.bundle !== undefined) {
        const { config, figData } = splitBundle(block.bundle);
        const cfgMap = new Y.Map<unknown>();
        seedFigureConfigMap(cfgMap, config);
        m.set(FIG_CONFIG_KEY, cfgMap);
        m.set(FIG_DATA_KEY, figData);
      }
    }
    if (node.style !== undefined) m.set("itemStyle", node.style);
    if (node.alignV !== undefined) m.set("alignV", node.alignV);
  } else {
    const childrenMap = new Y.Map<unknown>();
    const keys = generateNKeysBetween(null, null, node.children.length);
    node.children.forEach((child, i) => {
      childrenMap.set(child.id, buildNode(child, keys[i]));
    });
    m.set("children", childrenMap);
  }
  return m;
}

/** Seed an (assumed empty) Y.Doc from a slide config. */
export function seedSlideDoc(doc: Y.Doc, slide: Slide): void {
  const root = doc.getMap<unknown>(ROOT_KEY);
  root.set("type", slide.type);

  const rec = slide as unknown as Record<string, unknown>;
  const textFields = TEXT_FIELDS_BY_TYPE[slide.type];
  // Text fields become Y.Text — always created (even when empty) so the editor
  // can bind a CodeMirror to it and a peer can type into an empty title.
  for (const f of textFields) {
    root.set(f, newYText(rec[f]));
  }

  if (slide.type === "content") {
    for (const f of CONTENT_SCALAR_FIELDS) {
      if (rec[f] !== undefined) root.set(f, rec[f]);
    }
    if (slide.split !== undefined) root.set("split", slide.split);
    root.set("layout", buildNode(slide.layout, null));
  } else {
    const textSet = new Set(textFields);
    for (const [k, v] of Object.entries(rec)) {
      if (k === "type" || textSet.has(k)) continue;
      if (v !== undefined) root.set(k, v);
    }
  }
}

export function slideToYDoc(slide: Slide): Y.Doc {
  const doc = new Y.Doc();
  seedSlideDoc(doc, slide);
  return doc;
}

// ── Materialize: Y.Doc -> Slide ──────────────────────────────────────────────

function compareChildren(a: Y.Map<unknown>, b: Y.Map<unknown>): number {
  const fa = (a.get("fracIndex") as string | undefined) ?? "";
  const fb = (b.get("fracIndex") as string | undefined) ?? "";
  if (fa < fb) return -1;
  if (fa > fb) return 1;
  // Deterministic tie-break so concurrently-inserted siblings with an equal
  // fracIndex order identically on every client.
  const ia = a.get("id") as string;
  const ib = b.get("id") as string;
  return ia < ib ? -1 : ia > ib ? 1 : 0;
}

function materializeNode(m: Y.Map<unknown>): SlideNode {
  const type = m.get("type") as "item" | "rows" | "cols";
  const out: Record<string, unknown> = { id: m.get("id"), type };
  if (m.get("minH") !== undefined) out.minH = m.get("minH");
  if (m.get("maxH") !== undefined) out.maxH = m.get("maxH");
  if (m.get("span") !== undefined) out.span = m.get("span");

  if (type === "item") {
    const blockType = m.get("blockType") as "text" | "figure" | "image";
    const data: Record<string, unknown> = { type: blockType };
    if (blockType === "text") {
      data.markdown = (m.get("markdown") as Y.Text).toString();
      if (m.get("blockStyle") !== undefined) data.style = m.get("blockStyle");
    } else if (blockType === "image") {
      data.imgFile = m.get("imgFile");
      if (m.get("blockStyle") !== undefined) data.style = m.get("blockStyle");
    } else {
      const bundle = readFigureBundle(m);
      if (bundle !== undefined) data.bundle = bundle;
    }
    out.data = data;
    if (m.get("itemStyle") !== undefined) out.style = m.get("itemStyle");
    if (m.get("alignV") !== undefined) out.alignV = m.get("alignV");
  } else {
    const childrenMap = m.get("children") as Y.Map<unknown>;
    const children = ([...childrenMap.values()] as Y.Map<unknown>[])
      .sort(compareChildren)
      .map(materializeNode);
    out.children = children;
  }
  return out as unknown as SlideNode;
}

/** Project the Y.Doc back into a `Slide` config (deep-equal to what was seeded;
 *  the server re-validates with slideConfigSchema before persisting). */
export function materializeSlide(doc: Y.Doc): Slide {
  const root = doc.getMap<unknown>(ROOT_KEY);
  const type = root.get("type") as Slide["type"];
  const out: Record<string, unknown> = { type };
  const textFields = TEXT_FIELDS_BY_TYPE[type];

  // Text fields: read the Y.Text; omit optional ones when empty.
  for (const f of textFields) {
    const v = root.get(f);
    const s = v instanceof Y.Text ? v.toString() : typeof v === "string" ? v : "";
    if (REQUIRED_TEXT_FIELDS.has(f) || s.length > 0) out[f] = s;
  }

  if (type === "content") {
    for (const f of CONTENT_SCALAR_FIELDS) {
      if (root.get(f) !== undefined) out[f] = root.get(f);
    }
    if (root.get("split") !== undefined) out.split = root.get("split");
    out.layout = materializeNode(root.get("layout") as Y.Map<unknown>);
  } else {
    const textSet = new Set(textFields);
    for (const k of root.keys()) {
      if (k === "type" || textSet.has(k)) continue;
      out[k] = root.get(k);
    }
  }
  return out as unknown as Slide;
}

/** Get a root-level text field's Y.Text (for binding a CodeMirror to a title/
 *  header field), or undefined if absent. */
export function findRootTextField(
  doc: Y.Doc,
  fieldKey: string,
): Y.Text | undefined {
  const v = doc.getMap<unknown>(ROOT_KEY).get(fieldKey);
  return v instanceof Y.Text ? v : undefined;
}

// ── Element observer (version-history attribution) ──────────────────────────
//
// Reports which slide ELEMENTS a transaction touched, as stable keys the
// version-history element diff also produces:
//   "field:<name>"  root text field (header, title, ...)
//   "block:<id>"    a layout block (text / figure / image item)
//   "layout"        structure only (blocks added/removed/reordered)
//   "props"         everything else on the slide root (split, logos, ...)
// On top of the plain "touched" set, the transaction's ops are classified so
// deletions attribute exactly (the deck-side analogue of the report body's
// tombstones): `added`/`removed` from children-map key actions, `textDeleted`
// from Y.Text delete deltas. A block MOVE can surface as a children-map
// delete+add pair, so a `removed` entry alone doesn't prove the element is
// gone — consumers pair it with the version diff, which only shows "removed"
// for elements genuinely absent from the newer snapshot.
// The callback receives the transaction origin so the caller can attribute
// (a RoomConn's identity for collab edits, applyToLiveRoom's versionEditor
// tag for HTTP-routed writes). Attach AFTER the doc holds its initial content.

export type SlideElementTouches = {
  /** Every element the transaction touched, in any way. */
  touched: string[];
  /** Elements created by this transaction (children-map key inserts). */
  added: string[];
  /** Elements structurally removed by this transaction (key deletes). */
  removed: string[];
  /** Elements the transaction deleted TEXT from (Y.Text delete ops, or a
   *  root text field's key removed). */
  textDeleted: string[];
};

export function observeSlideDocElements(
  doc: Y.Doc,
  cb: (touches: SlideElementTouches, origin: unknown) => void,
): void {
  const root = doc.getMap<unknown>(ROOT_KEY);
  root.observeDeep((events, transaction) => {
    const touched = new Set<string>();
    const added = new Set<string>();
    const removed = new Set<string>();
    const textDeleted = new Set<string>();
    // Y.Text events carry delete ops in `delta`; map events leave it empty.
    const hasTextDelete = (event: Y.YEvent<Y.AbstractType<unknown>>): boolean =>
      event.changes.delta.some(
        (d) => typeof (d as { delete?: number }).delete === "number",
      );
    for (const event of events) {
      const path = event.path;
      if (path.length === 0) {
        for (const [k, change] of event.changes.keys) {
          if (k === "layout") touched.add("layout");
          else if (ALL_TEXT_FIELDS.has(k)) {
            touched.add(`field:${k}`);
            // Removing the field's key discards its text content.
            if (change.action === "delete") textDeleted.add(`field:${k}`);
          } else touched.add("props");
        }
      } else if (path[0] !== "layout") {
        // A Y.Text event on a root text field.
        touched.add(`field:${path[0]}`);
        if (hasTextDelete(event)) textDeleted.add(`field:${path[0]}`);
      } else {
        // Layout subtree: the innermost node id is the element after the last
        // "children" key in the path.
        let nodeId: string | undefined;
        for (let i = 0; i < path.length - 1; i++) {
          if (path[i] === "children" && typeof path[i + 1] === "string") {
            nodeId = path[i + 1] as string;
          }
        }
        if (path[path.length - 1] === "children") {
          // The children map itself changed: blocks added/removed.
          for (const [k, change] of event.changes.keys) {
            touched.add(`block:${k}`);
            if (change.action === "add") added.add(`block:${k}`);
            else if (change.action === "delete") removed.add(`block:${k}`);
          }
          touched.add("layout");
        } else if (nodeId) {
          const changed = [...event.changes.keys.keys()];
          // A fracIndex-only change is a reorder, not a content edit.
          if (changed.length > 0 && changed.every((k) => k === "fracIndex")) {
            touched.add("layout");
          } else {
            touched.add(`block:${nodeId}`);
            if (hasTextDelete(event)) textDeleted.add(`block:${nodeId}`);
          }
        } else {
          touched.add("layout");
        }
      }
    }
    if (touched.size > 0) {
      cb(
        {
          touched: [...touched],
          added: [...added],
          removed: [...removed],
          textDeleted: [...textDeleted],
        },
        transaction.origin,
      );
    }
  });
}

// ── Navigation helper (for the editor / relay) ───────────────────────────────

/** Find a layout node's Y.Map by its stable node id, or undefined. */
export function findNodeMap(
  doc: Y.Doc,
  nodeId: string,
): Y.Map<unknown> | undefined {
  const root = doc.getMap<unknown>(ROOT_KEY);
  if (root.get("type") !== "content") return undefined;
  const layout = root.get("layout") as Y.Map<unknown> | undefined;
  if (!layout) return undefined;

  function walk(m: Y.Map<unknown>): Y.Map<unknown> | undefined {
    if (m.get("id") === nodeId) return m;
    if (m.get("type") !== "item") {
      const childrenMap = m.get("children") as Y.Map<unknown> | undefined;
      if (childrenMap) {
        for (const child of childrenMap.values()) {
          const hit = walk(child as Y.Map<unknown>);
          if (hit) return hit;
        }
      }
    }
    return undefined;
  }
  return walk(layout);
}

/** The figConfig Y.Map for a figure layout block (for binding the figure-editor
 *  modal to co-edit its config), or undefined when the block isn't a decomposed
 *  figure (no bundle yet, or a legacy opaque bundle). */
export function findSlideFigureConfigMap(
  doc: Y.Doc,
  blockId: string,
): Y.Map<unknown> | undefined {
  const node = findNodeMap(doc, blockId);
  if (!node) return undefined;
  const cfg = node.get(FIG_CONFIG_KEY);
  return cfg instanceof Y.Map ? cfg : undefined;
}

// ── Reconcile: apply a target Slide onto an existing Y.Doc (minimal ops) ──────
//
// The editor keeps mutating its working `tempSlide` (existing code path); this
// diffs that target onto the shared doc so local edits become granular,
// mergeable Yjs ops: text -> Y.Text deltas (so concurrent typing merges),
// scalar/opaque fields -> LWW sets, structure -> add/remove + fractional-index
// reorder. Idempotent — a no-op when the doc already matches the target.

type SlideItemNode = Extract<SlideNode, { type: "item" }>;

/** Options threaded through the reconcile so the host's full-slide push can be
 *  told which figures are owned by an open figure-editor modal. */
export type SyncSlideOpts = {
  /** Layout-block ids whose figConfig is currently owned by an open figure
   *  modal; the host push must not sync those (its tempSlide copy lags the
   *  modal's live per-keystroke edits). figData is still synced so coherent
   *  bundle pushes (refetched items) reach peers. */
  skipFigureConfigForBlockIds?: Set<string>;
};

// Diff a figure node's bundle onto the decomposed figConfig/figData shape.
function syncFigureNode(
  m: Y.Map<unknown>,
  blockId: string,
  bundle: FigureBundle | undefined,
  opts?: SyncSlideOpts,
): void {
  if (bundle === undefined) {
    for (const k of [FIG_CONFIG_KEY, FIG_DATA_KEY, FIG_BUNDLE_LEGACY_KEY]) {
      if (m.has(k)) m.delete(k);
    }
    lastFigureBundleRef.delete(m);
    return;
  }
  // Same whole-bundle object as the last push → nothing changed on this figure.
  if (lastFigureBundleRef.get(m) === bundle) return;
  const skipConfig = opts?.skipFigureConfigForBlockIds?.has(blockId) ?? false;
  const { config, figData } = splitBundle(bundle);
  if (!skipConfig) {
    let cfgMap = m.get(FIG_CONFIG_KEY);
    if (!(cfgMap instanceof Y.Map)) {
      cfgMap = new Y.Map<unknown>();
      m.set(FIG_CONFIG_KEY, cfgMap);
    }
    syncFigureConfigToMap(cfgMap as Y.Map<unknown>, config);
  }
  setOpaque(m, FIG_DATA_KEY, figData);
  if (m.has(FIG_BUNDLE_LEGACY_KEY)) m.delete(FIG_BUNDLE_LEGACY_KEY); // convert legacy
  lastFigureBundleRef.set(m, bundle);
}

function syncItemContent(
  m: Y.Map<unknown>,
  node: SlideItemNode,
  opts?: SyncSlideOpts,
): void {
  const block = node.data;
  if (m.get("blockType") !== block.type) {
    for (
      const k of ["markdown", "imgFile", "bundle", "figConfig", "figData", "blockStyle"]
    ) {
      if (m.has(k)) m.delete(k);
    }
    lastFigureBundleRef.delete(m);
    m.set("blockType", block.type);
  }
  if (block.type === "text") {
    let t = m.get("markdown");
    if (!(t instanceof Y.Text)) {
      t = new Y.Text();
      m.set("markdown", t);
    }
    syncText(t as Y.Text, block.markdown ?? "");
    setOpaque(m, "blockStyle", block.style);
  } else if (block.type === "image") {
    setScalar(m, "imgFile", block.imgFile);
    setOpaque(m, "blockStyle", block.style);
  } else {
    syncFigureNode(m, node.id, block.bundle, opts);
  }
  setOpaque(m, "itemStyle", node.style);
  setScalar(m, "alignV", node.alignV);
}

function rebuildNodeInPlace(
  m: Y.Map<unknown>,
  node: SlideNode,
  opts?: SyncSlideOpts,
): void {
  for (const k of [...m.keys()]) {
    if (k !== "id" && k !== "fracIndex") m.delete(k);
  }
  m.set("type", node.type);
  setScalar(m, "minH", node.minH);
  setScalar(m, "maxH", node.maxH);
  setScalar(m, "span", node.span);
  if (node.type === "item") {
    m.set("blockType", node.data.type);
    syncItemContent(m, node, opts);
  } else {
    m.set("children", new Y.Map<unknown>());
    syncChildren(m, node.children, opts);
  }
}

function syncNode(
  m: Y.Map<unknown>,
  node: SlideNode,
  opts?: SyncSlideOpts,
): void {
  if (m.get("type") !== node.type) {
    rebuildNodeInPlace(m, node, opts);
    return;
  }
  setScalar(m, "minH", node.minH);
  setScalar(m, "maxH", node.maxH);
  setScalar(m, "span", node.span);
  if (node.type === "item") {
    syncItemContent(m, node, opts);
  } else {
    syncChildren(m, node.children, opts);
  }
}

function syncChildren(
  parentMap: Y.Map<unknown>,
  target: SlideNode[],
  opts?: SyncSlideOpts,
): void {
  let childrenMap = parentMap.get("children") as Y.Map<unknown> | undefined;
  if (!childrenMap) {
    childrenMap = new Y.Map<unknown>();
    parentMap.set("children", childrenMap);
  }
  const targetIds = new Set(target.map((c) => c.id));
  for (const id of [...childrenMap.keys()]) {
    if (!targetIds.has(id)) childrenMap.delete(id);
  }
  for (const child of target) {
    const existing = childrenMap.get(child.id) as Y.Map<unknown> | undefined;
    if (existing) {
      syncNode(existing, child, opts);
    } else {
      childrenMap.set(child.id, buildNode(child, null));
    }
  }
  // Reorder: ensure fracIndex is strictly increasing in target order,
  // reassigning ONLY nodes that are out of order (or newly added) — so a local
  // reorder doesn't churn every sibling's key and clobber a concurrent move.
  let prevKey: string | null = null;
  target.forEach((child, i) => {
    const cm = childrenMap!.get(child.id) as Y.Map<unknown>;
    const k = cm.get("fracIndex") as string | undefined;
    if (k !== undefined && k !== "" && (prevKey === null || k > prevKey)) {
      prevKey = k;
      return;
    }
    // Find the next already-keyed sibling after this one to anchor against.
    let nextKey: string | null = null;
    for (let j = i + 1; j < target.length; j++) {
      const nm = childrenMap!.get(target[j].id) as Y.Map<unknown>;
      const nk = nm.get("fracIndex") as string | undefined;
      if (nk !== undefined && nk !== "" && (prevKey === null || nk > prevKey)) {
        nextKey = nk;
        break;
      }
    }
    const newKey = generateKeyBetween(prevKey, nextKey);
    cm.set("fracIndex", newKey);
    prevKey = newKey;
  });
}

/** Diff `target` onto the doc, applying minimal mergeable ops. `opts` lets a
 *  host with an open figure-editor modal exclude that figure's config from the
 *  push (see SyncSlideOpts). */
export function syncSlideToDoc(
  doc: Y.Doc,
  target: Slide,
  opts?: SyncSlideOpts,
): void {
  const root = doc.getMap<unknown>(ROOT_KEY);

  if (root.get("type") !== target.type) {
    for (const k of [...root.keys()]) root.delete(k);
    seedSlideDoc(doc, target);
    return;
  }

  const rec = target as unknown as Record<string, unknown>;
  const textFields = TEXT_FIELDS_BY_TYPE[target.type];
  const textSet = new Set(textFields);
  // Text fields -> minimal Y.Text diff (idempotent, so a CodeMirror binding that
  // owns the Y.Text and mirrors into tempSlide won't fight this path).
  for (const f of textFields) {
    let t = root.get(f);
    if (!(t instanceof Y.Text)) {
      t = newYText(rec[f]);
      root.set(f, t);
    } else {
      syncText(t, typeof rec[f] === "string" ? (rec[f] as string) : "");
    }
  }

  if (target.type === "content") {
    for (const f of CONTENT_SCALAR_FIELDS) setScalar(root, f, rec[f]);
    setOpaque(root, "split", target.split);
    const layout = root.get("layout") as Y.Map<unknown> | undefined;
    if (!layout) {
      root.set("layout", buildNode(target.layout, null));
    } else {
      syncNode(layout, target.layout, opts);
    }
  } else {
    const targetKeys = new Set(Object.keys(rec));
    for (const k of [...root.keys()]) {
      if (k === "type" || textSet.has(k)) continue;
      if (!targetKeys.has(k)) root.delete(k);
    }
    for (const [k, v] of Object.entries(rec)) {
      if (k === "type" || textSet.has(k)) continue;
      setScalar(root, k, v);
    }
  }
}
