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
import { setOpaque, syncText } from "./crdt_util.ts";

/** The slice of a report that lives in (and is persisted from) the shared doc. */
export type ReportDocContent = Pick<ReportDetail, "body" | "figures" | "images">;

const BODY_KEY = "body";
const FIGURES_KEY = "figures";
const IMAGES_KEY = "images";

/** Seed an (assumed empty) Y.Doc from report content. */
export function seedReportDoc(doc: Y.Doc, content: ReportDocContent): void {
  const body = doc.getText(BODY_KEY);
  if (content.body.length > 0) body.insert(0, content.body);
  const figures = doc.getMap<unknown>(FIGURES_KEY);
  for (const [id, block] of Object.entries(content.figures)) {
    figures.set(id, block);
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
  for (const [id, block] of doc.getMap<unknown>(FIGURES_KEY).entries()) {
    figures[id] = block;
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

/** Diff the figure/image registries onto the doc (opaque LWW per id; entries
 *  absent from the target are deleted). Idempotent. Callers must honor the
 *  setOpaque fresh-reference invariant: a changed block must be a NEW object
 *  (the editor's `{...figures(), [id]: block}` spreads guarantee this). */
export function syncReportRegistries(
  doc: Y.Doc,
  figures: ReportDocContent["figures"],
  images: ReportDocContent["images"],
): void {
  syncRegistry(doc.getMap<unknown>(FIGURES_KEY), figures);
  syncRegistry(doc.getMap<unknown>(IMAGES_KEY), images);
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

/** Diff full report content onto the doc (minimal mergeable ops). Idempotent —
 *  a no-op when the doc already matches, which is what makes it safe to call
 *  unconditionally (echo guard; no latched "was this remote?" flags). */
export function syncReportToDoc(doc: Y.Doc, target: ReportDocContent): void {
  syncText(doc.getText(BODY_KEY), target.body);
  syncReportRegistries(doc, target.figures, target.images);
}
