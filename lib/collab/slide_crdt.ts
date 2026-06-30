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
import { generateNKeysBetween } from "fractional-indexing";
import type { LayoutNode } from "@timroberton/panther";
import type { ContentBlock, Slide } from "../types/slides.ts";

const ROOT_KEY = "slide";

const CONTENT_SCALAR_FIELDS = [
  "header",
  "subHeader",
  "date",
  "footer",
  "showHeaderLogos",
  "showFooterLogos",
] as const;

type SlideNode = LayoutNode<ContentBlock>;

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
      if (block.bundle !== undefined) m.set("bundle", block.bundle);
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

  if (slide.type === "content") {
    const rec = slide as unknown as Record<string, unknown>;
    for (const f of CONTENT_SCALAR_FIELDS) {
      if (rec[f] !== undefined) root.set(f, rec[f]);
    }
    if (slide.split !== undefined) root.set("split", slide.split);
    root.set("layout", buildNode(slide.layout, null));
  } else {
    for (const [k, v] of Object.entries(slide)) {
      if (k === "type") continue;
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
      if (m.get("bundle") !== undefined) data.bundle = m.get("bundle");
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

  if (type === "content") {
    for (const f of CONTENT_SCALAR_FIELDS) {
      if (root.get(f) !== undefined) out[f] = root.get(f);
    }
    if (root.get("split") !== undefined) out.split = root.get("split");
    out.layout = materializeNode(root.get("layout") as Y.Map<unknown>);
  } else {
    for (const k of root.keys()) {
      if (k === "type") continue;
      out[k] = root.get(k);
    }
  }
  return out as unknown as Slide;
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
