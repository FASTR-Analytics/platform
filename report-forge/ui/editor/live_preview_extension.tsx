// ⚠️  SYNCED FROM report-forge (github.com/NicholasWillmott/report-forge)
// ⚠️  DO NOT EDIT HERE - changes are overwritten on the next sync.
//     Edit the report-forge repo, then run its ./sync.

// =============================================================================
// Live preview — the Obsidian-style editing surface for FASTR reports.
//
// The markdown stays the CodeMirror document (so yCollab, per-user undo and
// the toolbar are untouched); this file only DECORATES it. Three layers:
//
//   • Region widgets: every top-level `:::` region, table and embed line
//     (report-forge/engine/fastr_live_regions.ts) is replaced by a block widget holding its
//     TRUE render — the slice compiled through the real markdown-it renderer,
//     sanitized, styled by the scoped theme sheet, with live figures mounted
//     inside. Reveal is DERIVED: a region whose range the selection touches is
//     not replaced, so click-to-reveal is just a selection dispatch and
//     collapse-on-leave is the same derivation on the next selection change.
//     Deliberately NOT atomic (unlike embedWidgets): arrowing into a hidden
//     region reveals it in the same transaction, caret on real text.
//   • Inline conceal: heading/emphasis/code/link markup and `[x]{.role}` /
//     `[x]{size=12}` marks hide off-cursor and reveal when the selection
//     touches the construct.
//   • Surface lines: heading lines get cm-fm-hN classes so the theme's type
//     scale applies in the editor (buildFastrEditorSurfaceCss).
//
// The scoped theme stylesheet (scope class on the editor wrapper) is rendered
// by the host as a plain <style> element — a theme switch re-renders that one
// element and never touches the editor.
// =============================================================================

import {
  type BlockInfo,
  BlockType,
  Decoration,
  type DecorationSet,
  EditorView,
  keymap,
  layer,
  type Rect,
  RectangleMarker,
  ViewPlugin,
  type ViewUpdate,
  WidgetType,
} from "@codemirror/view";
import {
  Annotation,
  EditorSelection,
  type EditorState,
  EditorState as CMEditorState,
  type Extension,
  Facet,
  MapMode,
  Prec,
  type Range,
  RangeSetBuilder,
  StateEffect,
  StateField,
  type Text as DocText,
  Transaction,
} from "@codemirror/state";
import { ensureSyntaxTree, syntaxTree } from "@codemirror/language";
import { Dynamic, render } from "solid-js/web";
import { Show } from "solid-js";
import type { Awareness } from "y-protocols/awareness";
import * as Y from "yjs";
import { hideMenu, type MenuItem, showMenu } from "../kit/menu.tsx";
import {
  applyStepsChildAction,
  applyTableCellAction,
  applyTilesChildAction,
  deleteFastrBlockEdit,
  FASTR_ALIGN_SUFFIX_RE,
  FASTR_BLOCK_NAMES,
  FASTR_FIGURE_PAGE_CEILING,
  FASTR_FIGURE_RESERVE_PROBE_HTML,
  FASTR_FIGURE_RESERVE_SLACK_PX,
  FASTR_FIGURE_RESERVE_VAR,
  FASTR_TEMPLATE_SLACK_PX,
  fastrAlignAwareInsert,
  fastrAlignSuffixOf,
  fastrBlockFillsPage,
  type FastrBlockName,
  fastrDocumentOutline,
  fastrFigureShare,
  fastrFigureWidthOfLine,
  type FastrLayoutBlock,
  type FastrLayoutGeometry,
  type FastrLayoutHint,
  type FastrLiveRegion,
  fastrLiveRegions,
  fastrMarkAwareChange,
  fastrMarkAwareRewrite,
  fastrMarkClass,
  fastrMarkLineBreak,
  fastrMarkStyle,
  type FastrOpenFence,
  fastrOpenFenceOnLine,
  fastrPageArea,
  type FastrPagedPage,
  type FastrPagedResult,
  fastrPageTemplate,
  fastrParagraphAligns,
  fastrStripInlineSyntax,
  fastrSuffixInsertOffset,
  fastrSurfaceTone,
  fastrTemplateOverflow,
  fastrTocOptions,
  fillPageSlotEdit,
  findReportEmbeds,
  FM_BOX_GAP,
  FM_BOX_INSET,
  FM_BOX_PAD_BOTTOM,
  isDarkCssColor,
  isFastrEmbedLine,
  isFastrLeafBlock,
  isFastrProseLine,
  layoutFastrPages,
  linePrefixLength,
  parseContainerFence,
  parseFastrMarkAttrs,
  readFastrDocumentSettings,
  renderFastrMarkdownToHtml,
  renderFastrTocHtml,
  safeCssColor,
  scanContainerLines,
  scanFastrPages,
  type StepsChildAction,
  stepsChildInfo,
  TILES_MAX_COLS,
  tilesChildInfo,
  updateContainerFenceLine,
} from "../../engine/mod.ts";
import { t3 } from "../../engine/i18n.ts";
import {
  materializeReportBackgrounds,
  sanitizeReportHtml,
} from "../report_html.ts";
import {
  fastrBlockLabel,
  fastrTemplateAreaLabel,
} from "./fastr_block_labels.ts";
import { attachTemplateChrome } from "./template_chrome.ts";
import {
  cellSlices,
  escapeCellText,
  isTableRowText,
  tableRowCells,
} from "../../engine/fastr_table_rows.ts";
import type { EmbedResolver } from "./embed_resolver.ts";
import { clearOwnedCaret } from "../collab.ts";

// The scope class the host puts on the editor wrapper and passes to
// buildFastrReportCss / buildFastrEditorSurfaceCss. One name, three users.
export const FM_LIVE_SCOPE_CLASS = "fm-live-scope";

// ── Document-aware helpers ───────────────────────────────────────────────────
// Every selection, range and listener belongs to the element's OWN document,
// and a menu anchored to an iframe event needs the frame's offset (the
// in-place editors once also ran on the pages of an iframe; kept general).
function docOf(el: Node): Document {
  return el.ownerDocument ?? document;
}
function winOf(el: Node): Window {
  return docOf(el).defaultView ?? window;
}
// What a block is CALLED in the menu that deletes it: the vocabulary's own
// name for a fence, and the plain word for the two regions that have no fence
// (a markdown table, a lone figure or image line).
function fastrRegionLabel(
  kind: FastrLiveRegion["kind"],
  source: string,
  startLine: number,
): string {
  const fence = fastrOpenFenceOnLine(
    source.split("\n")[0] ?? "",
    startLine + 1,
  );
  if (fence && (FASTR_BLOCK_NAMES as readonly string[]).includes(fence.name)) {
    return fastrBlockLabel(fence.name as FastrBlockName);
  }
  if (kind === "table") return t3({ en: "Table", fr: "Tableau", pt: "Tabela" });
  if (kind === "embed") {
    return /\(image:/.test(source)
      ? t3({ en: "Image", fr: "Image", pt: "Imagem" })
      : t3({ en: "Visualization", fr: "Visualisation", pt: "Visualização" });
  }
  return t3({ en: "Block", fr: "Bloc", pt: "Bloco" });
}

// ── Held lines ───────────────────────────────────────────────────────────────
// A context menu stays open for as long as its author takes to choose, and
// the document keeps moving meanwhile (a collaborator, the host's applyBody).
// So no menu action uses the lines it was opened on: the clicked lines are
// held here, mapped through every change that lands, and handed back at click
// time only while their text is still what was clicked. One menu is open at a
// time, so one hold per view.
type HeldLines = { from: number; to: number; text: string };
const heldLinesPlugin = ViewPlugin.fromClass(
  class {
    held: HeldLines | undefined;
    update(u: ViewUpdate) {
      if (!u.docChanged || !this.held) return;
      // Text inserted at the start moves the lines down; text added at the end
      // is a change to them, which the text check below refuses.
      this.held.from = u.changes.mapPos(this.held.from, 1);
      this.held.to = u.changes.mapPos(this.held.to, -1);
    }
  },
);

function holdLines(
  view: EditorView,
  first1: number,
  last1: number,
): () => { first1: number; last1: number } | undefined {
  const doc = view.state.doc;
  if (first1 < 1 || last1 < first1 || last1 > doc.lines) return () => undefined;
  const from = doc.line(first1).from;
  const to = doc.line(last1).to;
  const held: HeldLines = { from, to, text: doc.sliceString(from, to) };
  const plugin = view.plugin(heldLinesPlugin);
  if (plugin) plugin.held = held;
  return () => {
    const cur = view.state.doc;
    if (cur !== doc && plugin?.held !== held) return undefined;
    if (held.from > held.to || held.to > cur.length) return undefined;
    if (cur.sliceString(held.from, held.to) !== held.text) return undefined;
    const a = cur.lineAt(held.from);
    const b = cur.lineAt(held.to);
    if (a.from !== held.from || b.to !== held.to) return undefined;
    return { first1: a.number, last1: b.number };
  };
}

// Right-click a block: the one thing a whole block needs that nothing else in
// Edit offers, which is getting rid of it. A cover, a band, a table, a figure
// and a page break all delete the same way (deleteFastrBlockEdit takes the
// region's lines and the blank line beside them), and the first row NAMES what
// will go: a right-click inside a nested block is claimed by that block's own
// menu, so the author has to be able to see which one this is.
//
// `region` is read at click time, not closed over: a widget's element outlives
// the widget when the region is re-rendered in place (updateDOM).
function attachBlockContextMenu(
  el: HTMLElement,
  view: EditorView,
  region: () => { startLine: number; endLine: number; label: string },
) {
  el.addEventListener("contextmenu", (e) => {
    // A read-only editor (a viewer, or a dead room) gets the browser's own
    // menu here and opens no island or widget menu below: CodeMirror's
    // readOnly stops typing but not a dispatch, and a host's collaboration
    // room may refuse a viewer's update.
    if (view.state.readOnly) return;
    const { startLine, endLine, label } = region();
    if (startLine < 0 || endLine >= view.state.doc.lines) return;
    e.preventDefault();
    e.stopPropagation();
    const held = holdLines(view, startLine + 1, endLine + 1);
    showMenu({
      anchor: menuAnchor(e),
      items: [
        { label, disabled: true, onClick: () => {} },
        { type: "divider" },
        {
          label: t3({ en: "Delete", fr: "Supprimer", pt: "Eliminar" }),
          intent: "danger",
          onClick: () => {
            // Gone or changed since the right-click: nothing to delete.
            const now = held();
            if (!now || view.state.readOnly) return;
            const r = deleteFastrBlockEdit(
              view.state.doc.toString(),
              now.first1 - 1,
              now.last1 - 1,
            );
            if (r.changes.length === 0) return;
            view.dispatch({
              changes: r.changes,
              selection: r.selection,
              scrollIntoView: true,
            });
            view.focus();
          },
        },
      ],
    });
  });
}

function menuAnchor(
  e: MouseEvent,
): { x: number; y: number; width: number; height: number } {
  const target = e.target as Node | null;
  const frame = target?.ownerDocument?.defaultView?.frameElement;
  const r = frame?.getBoundingClientRect();
  return {
    x: e.clientX + (r?.left ?? 0),
    y: e.clientY + (r?.top ?? 0),
    width: 0,
    height: 0,
  };
}

// The block chrome that edits in place: [root class, child class, attr,
// placeholder, whether an untitled block grows a ghost row to click into].
// Each row: the block's class, the class path of the element showing the
// attribute (` > ` between levels), the attribute, its placeholder, and
// whether an active block that lacks it grows a ghost to type into (or,
// for a page template's own attributes, whether its layout takes it).
export type ChromeAttrRow = [
  string,
  string,
  string,
  string,
  boolean | ((container: HTMLElement) => boolean),
];

// A page template's attribute (`kicker`, `number`, `delta`) gets a ghost
// only when its layout declares it; a slot's (`title`, `label`, `cite`)
// only when its layout's slot does.
function templateTakes(attr: string): (container: HTMLElement) => boolean {
  return (container) => {
    const tpl = container.closest(".fm-tpl");
    const layout = /\bfm-tpl--([a-z0-9-]+)\b/.exec(tpl?.className ?? "")?.[1];
    const template = fastrPageTemplate(layout);
    if (template === undefined) return false;
    if (container.classList.contains("fm-tpl")) {
      return template.attrs.some((a) => a.name === attr);
    }
    const slot = /\bfm-tpl-slot--([a-z0-9-]+)\b/.exec(container.className)?.[1];
    return template.slots.find((s) => s.name === slot)?.attrs?.includes(attr) ??
      false;
  };
}

export function chromeAttrRows(): ChromeAttrRow[] {
  return [
    [
      "fm-callout",
      "fm-callout__title",
      "title",
      t3({ en: "Title…", fr: "Titre…", pt: "Título…" }),
      true,
    ],
    [
      "fm-card",
      "fm-card__title",
      "title",
      t3({ en: "Title…", fr: "Titre…", pt: "Título…" }),
      true,
    ],
    [
      "fm-band",
      "fm-kicker",
      "kicker",
      t3({ en: "Kicker…", fr: "Surtitre…", pt: "Antetítulo…" }),
      true,
    ],
    [
      "fm-cover",
      "fm-kicker",
      "kicker",
      t3({ en: "Kicker…", fr: "Surtitre…", pt: "Antetítulo…" }),
      true,
    ],
    [
      "fm-band",
      "fm-dek",
      "sub",
      t3({ en: "Subtitle…", fr: "Sous-titre…", pt: "Subtítulo…" }),
      false,
    ],
    [
      "fm-cover",
      "fm-dek",
      "sub",
      t3({ en: "Subtitle…", fr: "Sous-titre…", pt: "Subtítulo…" }),
      false,
    ],
    [
      "fm-quote",
      "fm-quote__cite",
      "cite",
      t3({ en: "Source…", fr: "Source…", pt: "Fonte…" }),
      false,
    ],
    // A target card's progress: where it stands today, and the words for it.
    [
      "fm-card",
      "fm-card__progress > fm-card__progress-value",
      "progress",
      t3({ en: "Progress…", fr: "Progrès…", pt: "Progresso…" }),
      false,
    ],
    [
      "fm-card",
      "fm-card__progress > fm-card__progress-label",
      "progress-label",
      t3({ en: "Label…", fr: "Libellé…", pt: "Rótulo…" }),
      false,
    ],
    // A page template's own words: its kicker, an opener's number, the
    // change between the halves of a comparison.
    [
      "fm-tpl",
      "fm-kicker",
      "kicker",
      t3({ en: "Kicker…", fr: "Surtitre…", pt: "Antetítulo…" }),
      templateTakes("kicker"),
    ],
    [
      "fm-tpl",
      "fm-tpl__number",
      "number",
      t3({ en: "Number…", fr: "Numéro…", pt: "Número…" }),
      templateTakes("number"),
    ],
    [
      "fm-tpl",
      "fm-tpl__delta",
      "delta",
      t3({ en: "Change…", fr: "Évolution…", pt: "Variação…" }),
      templateTakes("delta"),
    ],
    // A template area's label, title and the cite under its quote.
    [
      "fm-tpl-slot",
      "fm-tpl-slot__label",
      "label",
      t3({ en: "Label…", fr: "Libellé…", pt: "Rótulo…" }),
      templateTakes("label"),
    ],
    [
      "fm-tpl-slot",
      "fm-tpl-slot__title",
      "title",
      t3({ en: "Title…", fr: "Titre…", pt: "Título…" }),
      templateTakes("title"),
    ],
    [
      "fm-tpl-slot",
      "fm-quote__cite",
      "cite",
      t3({ en: "Source…", fr: "Source…", pt: "Fonte…" }),
      false,
    ],
  ];
}

// ── Region ranges ────────────────────────────────────────────────────────────

type RegionRange = {
  region: FastrLiveRegion;
  from: number;
  to: number;
  // Whether the region contains any editable TEXT line (prose, card content,
  // table rows). A region without one — a tiles row of stats, a lone embed,
  // the page-setup line — NEVER reveals: its labels edit in place and its
  // attrs belong to the toolbar, so opening the source only breaks the
  // layout for nothing.
  hasText: boolean;
};

function regionRanges(state: EditorState): RegionRange[] {
  return fastrLiveRegions(state.doc.iterLines(1, state.doc.lines + 1)).map(
    (region) => {
      const from = state.doc.line(region.startLine + 1).from;
      const to = state.doc.line(region.endLine + 1).to;
      let hasText = false;
      for (
        const sc of scanContainerLines(
          state.sliceDoc(from, to).split("\n"),
        )
      ) {
        if (sc.inCode) {
          hasText = true;
          break;
        }
        if (sc.fence !== undefined) continue;
        if (isFastrEmbedLine(sc.text)) continue;
        if (sc.text.trim().length === 0) continue;
        hasText = true;
        break;
      }
      return { region, from, to, hasText };
    },
  );
}

function selectionTouches(
  state: EditorState,
  from: number,
  to: number,
): boolean {
  return state.selection.ranges.some((r) => r.from <= to && r.to >= from);
}

// ── The widgets ──────────────────────────────────────────────────────────────

class RegionWidget extends WidgetType {
  constructor(
    readonly kind: FastrLiveRegion["kind"],
    readonly source: string,
    readonly startLine: number,
    readonly endLine: number,
    readonly resolver: EmbedResolver,
    readonly active = false,
    // The document's FIRST visible block: View gives it no top margin (a
    // cover even pulls itself up), so the editor must not open with a strip
    // of page ground above it either.
    readonly first = false,
    // What eq compares instead of the source. Normally the source itself; an
    // island's live commit carries the PREVIOUS key forward, so the widget
    // the user is typing in is kept rather than rebuilt under the cursor.
    readonly sourceKey = source,
    // The collapsed gap above a block with no blank line over it, px
    // (docRhythmOf): the first content child's margin-top.
    readonly gapTop = 0,
  ) {
    super();
  }

  override eq(other: RegionWidget): boolean {
    // Source + kind only — theming is external CSS, so a re-theme never
    // touches the editor; a remote edit inside the region changes the source
    // and re-creates just this widget.
    return other.kind === this.kind && other.sourceKey === this.sourceKey &&
      other.startLine === this.startLine && other.active === this.active &&
      other.first === this.first && other.gapTop === this.gapTop;
  }

  override toDOM(view: EditorView): HTMLElement {
    const dom = document.createElement("div");
    // Vertical PADDING, never margins: CodeMirror measures the widget's box
    // for vertical layout and margins fall outside it, desyncing cursor
    // positions below (the embedWidgets rule).
    // The root and its listeners are created ONCE: a later widget for the
    // same region updates this element in place (updateDOM), so the
    // listeners read the current widget through `self()` rather than closing
    // over the one that built the element.
    const self = () => (dom as unknown as { _widget: RegionWidget })._widget;
    // Presses inside the widget stopPropagation (cells, islands, the press
    // claim below), which starves the menu's document-level dismiss, so an
    // open context menu is closed HERE, in the capture phase, before any
    // child handler can swallow the event.
    dom.addEventListener("mousedown", () => hideMenu(), true);
    dom.style.display = "flow-root";
    dom.style.position = "relative";
    dom.contentEditable = "false";
    // MOUSEDOWN, not click, and with the default prevented: the browser's
    // native behaviour on pressing a contentEditable=false island is to
    // select the WHOLE island — and if a micro-drag swallows the click, that
    // full-widget highlight would stick. Claiming the press parks the caret
    // immediately and no native selection ever starts. Labels and figures
    // keep their own behaviour.

    dom.addEventListener("mousedown", (e) => {
      const target = e.target as HTMLElement;
      if (target.closest(".cm-fm-attr") || target.closest("[data-embed-id]")) {
        return;
      }
      e.preventDefault();
      // A page seam inside the block (the ending page's empty foot, its
      // footer, the next page's head) belongs to the page it ends: the caret
      // goes to the end of the last line before it. A block that opens a
      // page carries the seam at its top, so a press on the empty foot of
      // the page above would otherwise land in the block (a page template
      // took the toolbar from a click on the blank page before it).
      // The seam takes no pointer events (the press falls through to the
      // widget), so it is found by where the press is.
      const seam = Array.from(
        dom.querySelectorAll<HTMLElement>(
          ".fm-page-gutter, .fm-page-gutter-row, .fm-page-split",
        ),
      ).find((g) => {
        const r = g.getBoundingClientRect();
        return r.height > 0 && e.clientY >= r.top && e.clientY < r.bottom;
      });
      if (seam !== undefined) {
        const before = lineBeforeSeam(
          dom,
          seam,
          self().startLine,
          view.state.doc,
        );
        if (before !== undefined && before <= view.state.doc.lines) {
          view.dispatch({
            selection: { anchor: view.state.doc.line(before).to },
          });
          view.focus();
          return;
        }
      }
      // Caret on the clicked line. data-line values are region-relative
      // (the renderer saw only the slice).
      const anchorEl = target.closest<HTMLElement>("[data-line]");
      const rel = anchorEl ? Number(anchorEl.getAttribute("data-line")) : NaN;
      const fallback = self().kind === "container"
        ? self().startLine + 2
        : self().startLine + 1;
      const line1 = Math.max(
        self().startLine + 1,
        Math.min(
          Number.isFinite(rel) ? self().startLine + rel + 1 : fallback,
          self().endLine + 1,
          view.state.doc.lines,
        ),
      );
      view.dispatch({
        selection: { anchor: view.state.doc.line(line1).from },
        scrollIntoView: true,
      });
      view.focus();
    });
    attachBlockContextMenu(dom, view, () => ({
      startLine: self().startLine,
      endLine: self().endLine,
      label: fastrRegionLabel(self().kind, self().source, self().startLine),
    }));
    dom.addEventListener("click", (e) => {
      const embed = (e.target as HTMLElement).closest<HTMLElement>(
        "[data-embed-id]",
      );
      if (embed) {
        e.stopPropagation();
        const kind = (embed.getAttribute("data-embed-kind") ?? "figure") as
          | "figure"
          | "image";
        const id = embed.getAttribute("data-embed-id") ?? "";
        self().resolver.onSelectEmbed(
          kind,
          id,
          embedTokenPos(view, dom, embed, self().startLine, self().endLine),
        );
      }
    });
    this.fill(dom, view);
    return dom;
  }

  // A remote keystroke inside the region, or a toolbar patch to its fence,
  // arrives as a widget with a different key. Re-rendering INTO the existing
  // element keeps CodeMirror's measured height for it — a fresh element is
  // laid out at its estimated height until the next measure, and that
  // estimate-then-correct is what made everything below a block jolt for
  // every peer on every keystroke. Only the same region qualifies: after a
  // structural change the element at this slot may stand for another one.
  override updateDOM(dom: HTMLElement, view: EditorView): boolean {
    if (
      dom.getAttribute("data-region-kind") !== this.kind ||
      dom.getAttribute("data-region-line") !== String(this.startLine)
    ) {
      return false;
    }
    (dom as unknown as { _dispose?: () => void })._dispose?.();
    this.fill(dom, view);
    return true;
  }

  // Everything that depends on the widget's content and state: the classes,
  // the anchors, the render, the figure mounts and the in-place editors.
  private fill(dom: HTMLElement, view: EditorView): void {
    (dom as unknown as { _widget: RegionWidget })._widget = this;
    // Drawn from the current source: no closed island is waiting on a
    // redraw (closeIsland).
    (dom as unknown as { _fmDirty?: boolean })._fmDirty = false;
    dom.className = [
      "fm-live-region",
      this.active ? "fm-live-region--active" : "",
      this.first ? "fm-live-region--first" : "",
      "w-full cursor-text",
    ].filter((c) => c.length > 0).join(" ");
    dom.style.setProperty("--fm-gap-top", `${this.gapTop}px`);
    dom.setAttribute("data-region-kind", this.kind);
    dom.setAttribute("data-region-line", String(this.startLine));
    dom.setAttribute("data-region-end", String(this.endLine));

    dom.innerHTML = sanitizeReportHtml(
      renderFastrMarkdownToHtml(this.source, { lineAnchors: true }),
    );
    // Peer carets and presence go in a layer that is ALWAYS the first child:
    // the sheet clamps the widget's first/last CONTENT child's margins, so an
    // overlay appended last would hand the last block its full margin back
    // (a 37px jolt on every repaint), and one placed inside an open island
    // would be committed as text.
    const layer = document.createElement("div");
    layer.className = "fm-peer-layer";
    dom.prepend(layer);
    materializeReportBackgrounds(dom, (id) => {
      const img = this.resolver.getImage(id);
      return img ? this.resolver.assetUrl(img.imgFile) : undefined;
    });

    attachLogoRows(dom, view, this.resolver, (rel) => this.startLine + rel + 1);
    attachPhotoSlots(dom, this.resolver, (rel) => this.startLine + rel + 1);
    attachSlotTextGhosts(dom, view, this.startLine, this.source);
    const chrome = attachTemplateChrome({
      dom,
      view,
      startLine: this.startLine,
      source: this.source,
      resolver: this.resolver,
    });
    const disposers: (() => void)[] = [];
    // A page template's areas are fixed: one that holds more than it shows
    // is hatched at its foot. Measured whenever an area's box changes, an
    // element comes or goes inside it (the page layout's first pass can seat
    // a page seam in a template and take it out again: a measure taken then
    // hatched a column that fits, and nothing re-measured), an image in it
    // lands, or a font finishes loading.
    if (dom.querySelector(".fm-tpl") !== null) {
      const mark = () => {
        markOverfullAreas(dom);
        chrome?.measure();
      };
      const sized = new ResizeObserver(mark);
      const changed = new MutationObserver(mark);
      for (const tpl of Array.from(dom.querySelectorAll(".fm-tpl"))) {
        for (const area of Array.from(tpl.children)) sized.observe(area);
        changed.observe(tpl, { childList: true, subtree: true });
      }
      for (const img of Array.from(dom.querySelectorAll("img"))) {
        img.addEventListener("load", mark, { once: true });
      }
      document.fonts.addEventListener("loadingdone", mark);
      disposers.push(() => {
        sized.disconnect();
        changed.disconnect();
        document.fonts.removeEventListener("loadingdone", mark);
      });
    }

    // Figures mount the LIVE component (same as the standalone embed widget) —
    // not the preview's raster path — inside the true themed <figure> chrome.
    for (const img of Array.from(dom.querySelectorAll("img"))) {
      if (img.classList.contains("fm-logo")) continue;
      const m = /^(figure|image):(.+)$/.exec(img.getAttribute("src") ?? "");
      if (!m) continue;
      const kind = m[1] as "figure" | "image";
      const id = m[2];
      if (kind === "image") {
        const entry = this.resolver.getImage(id);
        if (entry) {
          img.setAttribute("src", this.resolver.assetUrl(entry.imgFile));
          applyImageSize(img, this.resolver.imageSize?.(id));
          img.addEventListener("load", () => {
            img.removeAttribute("data-fm-pending");
            view.requestMeasure();
          });
        } else {
          img.replaceWith(missingNote("image", id));
        }
        img.setAttribute("data-embed-id", id);
        img.setAttribute("data-embed-kind", kind);
        continue;
      }
      const mount = document.createElement("div");
      mount.setAttribute("data-embed-id", id);
      mount.setAttribute("data-embed-kind", kind);
      applyFigureSize(mount, figureSizeOf(this.resolver, id));
      applyFigureFit(
        mount,
        view.state.field(paginationField, false)?.pagination?.figureFits?.get(
          this.startLine,
        ),
      );
      img.replaceWith(mount);
      disposers.push(render(
        () => (
          <Show
            when={this.resolver.FigureView !== undefined &&
              this.resolver.hasFigure(id)}
            fallback={
              <div class="rf:text-danger rf:text-xs">
                {t3({
                  en: "Missing visualization:",
                  fr: "Visualisation manquante :",
                  pt: "Visualização em falta:",
                })} {id}
              </div>
            }
          >
            <Dynamic
              component={this.resolver.FigureView}
              id={id}
              onMeasured={() => view.requestMeasure()}
              inkFor={this.resolver.inkFor}
              chartPalette={this.resolver.chartPalette}
            />
          </Show>
        ),
        mount,
      ));
    }
    (dom as unknown as { _dispose?: () => void })._dispose = () => {
      for (const d of disposers) d();
    };

    // Everything inside the render edits IN PLACE — the block never has to
    // reveal its source to be edited.
    const sourceLines = this.source.split("\n");
    for (
      const statEl of Array.from(
        dom.querySelectorAll<HTMLElement>(".fm-stat[data-line]"),
      )
    ) {
      const rel = Number(statEl.getAttribute("data-line"));
      const text = sourceLines[rel];
      if (!Number.isFinite(rel) || text === undefined) continue;
      attachStatEditors(
        statEl,
        view,
        this.startLine + rel + 1,
        text,
        this.active,
        () =>
          view.contentDOM.querySelector<HTMLElement>(
            `[data-region-line="${this.startLine}"] .fm-stat[data-line="${rel}"]`,
          ),
      );
      attachTilesChildContextMenu(statEl, view, this.startLine + rel + 1);
    }
    // Prose: paragraphs, list items and headings swap to their raw source
    // lines on press, keeping the block's layout around them.
    for (
      const textEl of Array.from(
        dom.querySelectorAll<HTMLElement>(
          "p[data-line], li[data-line], h1[data-line], h2[data-line], h3[data-line], h4[data-line], h5[data-line], h6[data-line]",
        ),
      )
    ) {
      if (textEl.closest(".fm-stat") || textEl.querySelector("img")) continue;
      const rel = Number(textEl.getAttribute("data-line"));
      if (!Number.isFinite(rel) || sourceLines[rel] === undefined) continue;
      attachTextEditor(textEl, view, this.startLine, sourceLines, rel);
    }
    // A step is any DIRECT child of a steps block (a paragraph, mostly): its
    // right-click adds a step either side or removes it.
    for (
      const stepEl of Array.from(
        dom.querySelectorAll<HTMLElement>(".fm-steps > [data-line]"),
      )
    ) {
      const rel = Number(stepEl.getAttribute("data-line"));
      if (!Number.isFinite(rel) || sourceLines[rel] === undefined) continue;
      attachStepsChildContextMenu(stepEl, view, this.startLine + rel + 1);
    }
    // Block chrome text — the callout/card TITLE, a band's kicker and dek, a
    // quote's citation — edits in place through the fence-attr path (the same
    // editors the stats use). A container element's data-line IS its opening
    // fence line. When a titled block has no title yet, an ACTIVE widget
    // (caret inside) grows a ghost title row to click into — idle widgets
    // stay exactly as the preview renders them.
    const CHROME_ATTRS = chromeAttrRows();
    for (
      const container of Array.from(
        dom.querySelectorAll<HTMLElement>("[data-line]"),
      )
    ) {
      const rel = Number(container.getAttribute("data-line"));
      const text = sourceLines[rel];
      if (!Number.isFinite(rel) || text === undefined) continue;
      const fence = fastrOpenFenceOnLine(text, this.startLine + rel + 1);
      if (!fence) continue;
      if (fence.name === "card" || fence.name === "col") {
        attachTilesChildContextMenu(container, view, this.startLine + rel + 1);
      }
      if (
        fence.name === "col" && this.active &&
        columnNeedsHeadingGhost(view.state.doc, this.startLine + rel + 1) &&
        container.querySelector(":scope > .cm-fm-col-ghost") === null
      ) {
        const ghostEl = document.createElement("h3");
        container.prepend(ghostEl);
        const startLine = this.startLine;
        attachColumnHeadingGhost(
          ghostEl,
          view,
          this.startLine + rel + 1,
          () =>
            view.contentDOM.querySelector<HTMLElement>(
              `[data-region-line="${startLine}"] [data-line="${rel}"] > .cm-fm-col-ghost`,
            ),
          () =>
            Array.from(
              view.contentDOM.querySelectorAll<HTMLElement>(
                `[data-region-line="${startLine}"] [data-line="${rel + 1}"]`,
              ),
            ).find((n) => /^H[1-6]$/.test(n.tagName)),
        );
      }
      for (
        const [rootCls, childCls, attr, placeholder, ghost] of CHROME_ATTRS
      ) {
        if (!container.classList.contains(rootCls)) continue;
        const childSel = childCls.split(" > ").map((c) => `.${c}`).join(
          " > ",
        );
        let el = container.querySelector<HTMLElement>(`:scope > ${childSel}`);
        const ghosts = typeof ghost === "function" ? ghost(container) : ghost;
        if (!el && ghosts && this.active && !childCls.includes(" > ")) {
          el = document.createElement("div");
          el.className = childCls;
          container.prepend(el);
        }
        if (!el || (el as unknown as { _wired?: boolean })._wired) continue;
        (el as unknown as { _wired?: boolean })._wired = true;
        const original = typeof fence.attrs[attr] === "string"
          ? (fence.attrs[attr] as string)
          : "";
        const startLine = this.startLine;
        attachAttrEditor(
          el,
          view,
          this.startLine + rel + 1,
          attr,
          original,
          placeholder,
          () =>
            view.contentDOM.querySelector<HTMLElement>(
              `[data-region-line="${startLine}"] [data-line="${rel}"] > ${childSel}`,
            ),
        );
      }
    }
    // Table cells: the row line carries the anchor; the cell's position in
    // the row is its column.
    for (
      const rowEl of Array.from(
        dom.querySelectorAll<HTMLElement>("tr[data-line]"),
      )
    ) {
      const rel = Number(rowEl.getAttribute("data-line"));
      if (!Number.isFinite(rel)) continue;
      const cells = Array.from(rowEl.querySelectorAll<HTMLElement>("td, th"));
      const startLine = this.startLine;
      cells.forEach((cell, i) => {
        attachCellEditor(cell, view, this.startLine + rel + 1, i, () => {
          const row = view.contentDOM.querySelector<HTMLElement>(
            `[data-region-line="${startLine}"] tr[data-line="${rel}"]`,
          );
          return row
            ? Array.from(row.querySelectorAll<HTMLElement>("td, th"))[i]
            : undefined;
        });
        attachCellContextMenu(cell, view, this.startLine + rel + 1, i);
      });
    }
    // Page seams and split flags inside this block, from the last pagination.
    applyRegionPagination(dom, this.startLine, view);
  }

  override destroy(dom: HTMLElement): void {
    (dom as unknown as { _dispose?: () => void })._dispose?.();
  }

  override coordsAt(dom: HTMLElement, pos: number): Rect | null {
    return blockCaretRect(dom, this.source, pos);
  }

  override get estimatedHeight(): number {
    const seen = measuredBlockHeights.get(blockKey("r", this.source));
    if (seen !== undefined) return seen;
    if (this.kind === "embed") return 260;
    const lines = this.endLine - this.startLine + 1;
    return Math.max(40, Math.min(1200, 28 * lines));
  }
}

// Where the clicked embed's token starts in the document: the same copy in
// render order among the region's tokens of that kind and id (a document may
// show one figure twice).
function embedTokenPos(
  view: EditorView,
  root: HTMLElement,
  embed: HTMLElement,
  startLine: number,
  endLine: number,
): number | undefined {
  const kind = embed.getAttribute("data-embed-kind") ?? "figure";
  const id = embed.getAttribute("data-embed-id") ?? "";
  const doc = view.state.doc;
  if (endLine + 1 > doc.lines) return undefined;
  const same = (el: Element) =>
    (el.getAttribute("data-embed-kind") ?? "figure") === kind &&
    el.getAttribute("data-embed-id") === id;
  const nth = Array.from(root.querySelectorAll("[data-embed-id]"))
    .filter(same)
    .indexOf(embed);
  const from = doc.line(startLine + 1).from;
  const ref = findReportEmbeds(doc.sliceString(from, doc.line(endLine + 1).to))
    .filter((r) => r.kind === kind && r.id === id)[nth];
  return ref === undefined ? undefined : from + ref.start;
}

// The caret parked in a rendered block (a press on its padding, or arrowing
// onto it): one line tall, where the line's own element starts.
// CodeMirror's default draws it the height of the whole widget, which ran
// it down the block's side and, when a page seam opens the block, from the
// last page's foot across the gap between the sheets.
function blockCaretRect(
  dom: HTMLElement,
  source: string,
  pos: number,
): Rect | null {
  const rel = source.slice(0, pos).split("\n").length - 1;
  const onPage = (el: Element) =>
    el.closest(
        ".fm-page-gutter, .fm-page-gutter-row, .fm-page-split, .fm-peer-layer",
      ) === null && el.getClientRects().length > 0;
  // The element of the nearest line at or above the caret's.
  let target: HTMLElement | undefined;
  let best = -1;
  for (
    const el of Array.from(dom.querySelectorAll<HTMLElement>("[data-line]"))
  ) {
    const n = Number(el.getAttribute("data-line"));
    if (!(n <= rel) || n <= best || !onPage(el)) continue;
    target = el;
    best = n;
  }
  target ??= Array.from(dom.children).find((c): c is HTMLElement =>
    c instanceof HTMLElement && onPage(c)
  );
  if (target === undefined) return null;
  const r = target.getBoundingClientRect();
  const style = getComputedStyle(target);
  const top = r.top + (parseFloat(style.borderTopWidth) || 0) +
    (parseFloat(style.paddingTop) || 0);
  const lh = parseFloat(style.lineHeight) ||
    1.5 * (parseFloat(style.fontSize) || 16);
  const bottom = Math.max(top, Math.min(top + lh, r.bottom));
  return { left: r.left, right: r.left, top, bottom };
}

// A figure's size as its own drawn chart reports it: a host that lays a
// figure out at a reference frame whatever the display gives the live
// canvas a backing size with the same aspect as the PDF's raster. Once a
// chart has drawn, its aspect is the truth for the editor, ahead of the host's
// size cache (which can be late, or fail, and then a figure stood a page
// tall: Nick's "test 22", a figure alone on the page after a heading and
// three lines). By figure id.
const derivedFigureSizes = new Map<string, { width: number; height: number }>();
function figureSizeOf(
  resolver: EmbedResolver,
  id: string,
): { width: number; height: number } | undefined {
  const cached = resolver.hasFigure(id) ? resolver.figureSize?.(id) : undefined;
  const drawn = derivedFigureSizes.get(id);
  if (drawn === undefined) return cached;
  // The raster's aspect (the cache's) is exact; a drawn canvas's is whole
  // CSS pixels, half a pixel off print's box over a page-wide figure. The
  // drawn size is for a chart the cache never sized, or one that really drew
  // to another shape, so the cache wins whenever the two agree.
  if (cached !== undefined && sameAspect(cached, drawn)) return cached;
  return drawn;
}
// The size a mount's drawn canvas gives, or undefined while it has not
// drawn (no canvas, or a canvas still at the element's 300x150 default).
function drawnCanvasSize(
  mount: HTMLElement,
): { width: number; height: number } | undefined {
  const canvas = mount.querySelector("canvas");
  if (canvas === null || !(canvas.width > 0) || !(canvas.height > 0)) {
    return undefined;
  }
  if (canvas.width === 300 && canvas.height === 150) return undefined;
  if (canvas.clientWidth === 0) return undefined;
  return { width: canvas.width, height: canvas.height };
}
function sameAspect(
  a: { width: number; height: number },
  b: { width: number; height: number },
): boolean {
  return Math.abs(a.width / a.height - b.width / b.height) <=
    0.02 * (a.width / a.height);
}

// A figure's live mount takes the box its raster has in print BEFORE the
// chart draws (report_fastr_css.ts sizes it from these: the raster's aspect,
// capped at the same share of the page area, narrowed and centred), so the
// widget's height is right on its first measure. Without a size yet the
// mount is flagged pending, and the page layout leaves the block's height
// alone until the size lands (a chart draws a beat after its mount, at a
// canvas's default size first: measured, that transient moved the pages
// and, with the chart re-drawn on every re-mount, moved them back and
// forth for as long as the figure was near the screen).
function applyFigureSize(
  mount: HTMLElement,
  size: { width: number; height: number } | undefined,
): boolean {
  if (size === undefined || !(size.width > 0) || !(size.height > 0)) {
    mount.setAttribute("data-fm-pending", "");
    return false;
  }
  mount.style.setProperty("--fm-fig-w", String(size.width));
  mount.style.setProperty("--fm-fig-h", String(size.height));
  mount.setAttribute("data-fm-sized", "");
  mount.removeAttribute("data-fm-pending");
  return true;
}
// An image's natural size as its width and height attributes: the browser
// lays the box out from them before the bytes arrive.
function applyImageSize(
  img: HTMLImageElement,
  size: { width: number; height: number } | undefined,
): boolean {
  if (size === undefined || !(size.width > 0) || !(size.height > 0)) {
    if (!img.complete || img.naturalWidth === 0) {
      img.setAttribute("data-fm-pending", "");
    }
    return false;
  }
  img.width = size.width;
  img.height = size.height;
  img.removeAttribute("data-fm-pending");
  return true;
}

// The height the page layout shrank a figure's image to, on its mount
// (report_fastr_css.ts caps the box at --fm-fig-fit); none restores the
// natural size.
function applyFigureFit(mount: HTMLElement, fit: number | undefined): void {
  if (fit === undefined) mount.style.removeProperty("--fm-fig-fit");
  else mount.style.setProperty("--fm-fig-fit", `${fit}px`);
}

// A rendered block at least this share of the page area tall offers its
// inner boundaries to the layout (a shorter one always fits under a heading).
const INNER_SHARE = 0.8;

// A figure block's image box, px: the raster's aspect (the host's size
// cache) at the figure's own width (its share of the column, or the sheet
// for width=full), under the page ceiling, which is what the mount takes
// before the chart draws (applyFigureSize). The same box wherever the figure
// falls: a figure offers the layout no `flex`, so it never shrinks to the
// room left on its page (fastr_markdown_blocks.ts, "Figure widths"). The
// `fitted` half reads back a fit the layout no longer makes; it stays
// undefined. Undefined while the size is unknown.
function figureImageBox(
  view: EditorView,
  resolver: EmbedResolver,
  text: string,
  geometry: PageBoxGeometry,
  columnW: number,
  dom: HTMLElement | null,
): { imgH: number; fitted: number | undefined } | undefined {
  const m = /\(figure:([^)\s]+)\)/.exec(text);
  if (m === null) return undefined;
  const size = figureSizeOf(resolver, m[1]);
  if (size === undefined || !(size.width > 0) || !(size.height > 0)) {
    return undefined;
  }
  const width = fastrFigureWidthOfLine(text);
  const w = width === "full"
    ? (geometry.sheetPx ?? view.scrollDOM.clientWidth)
    : columnW * fastrFigureShare(width);
  const area = geometry.pageH - 2 * geometry.marginPx;
  const reserve = view.state.field(printMetricsField, false)?.figReserve;
  const cap = reserve !== undefined
    ? area - reserve
    : FASTR_FIGURE_PAGE_CEILING * area;
  const imgH = Math.min(cap, w * size.height / size.width);
  const mount = dom?.querySelector<HTMLElement>(
    '[data-embed-kind="figure"][data-fm-sized]',
  );
  const fit = mount
    ? parseFloat(mount.style.getPropertyValue("--fm-fig-fit"))
    : NaN;
  return {
    imgH,
    fitted: Number.isFinite(fit) ? Math.min(fit, imgH) : undefined,
  };
}

// The host says an embed's size landed: every rendered embed still waiting
// for its box takes it now.
export const refreshEmbedSizes = StateEffect.define<null>();
function embedSizePlugin(resolver: EmbedResolver) {
  return ViewPlugin.fromClass(
    class {
      update(u: ViewUpdate) {
        const asked = u.transactions.some((tr) =>
          tr.effects.some((e) => e.is(refreshEmbedSizes))
        );
        if (!asked) return;
        let changed = false;
        for (
          const mount of Array.from(
            u.view.contentDOM.querySelectorAll<HTMLElement>(
              '[data-embed-kind="figure"][data-fm-pending]',
            ),
          )
        ) {
          const id = mount.getAttribute("data-embed-id") ?? "";
          if (
            applyFigureSize(mount, figureSizeOf(resolver, id))
          ) {
            changed = true;
            const line = Number(
              mount.closest("[data-region-line]")?.getAttribute(
                "data-region-line",
              ),
            );
            applyFigureFit(
              mount,
              u.view.state.field(paginationField, false)?.pagination?.figureFits
                ?.get(line),
            );
          }
        }
        for (
          const img of Array.from(
            u.view.contentDOM.querySelectorAll<HTMLImageElement>(
              'img[data-embed-kind="image"][data-fm-pending]',
            ),
          )
        ) {
          if (
            applyImageSize(
              img,
              resolver.imageSize?.(img.getAttribute("data-embed-id") ?? ""),
            )
          ) changed = true;
        }
        if (changed) u.view.requestMeasure();
      }
    },
  );
}

// A `:::logos` row: its logos resolve through the image registry like an
// inline image, but the ROW is the block (no logo is a selectable embed, and
// the row's height is the sheet's, so nothing waits on a load). A double-click,
// or a press on a row with no logos yet, opens the picker. `lineOf` maps the
// row's region-relative data-line to its 1-based document line.
// A page template's empty photo slots: a press asks the host for a photo.
// On the press, as for an empty logo row: the first press activates the
// region and rebuilds this DOM, so a click's release lands elsewhere.
function attachPhotoSlots(
  dom: HTMLElement,
  resolver: EmbedResolver,
  lineOf: (rel: number) => number,
): void {
  if (resolver.onAddPhoto === undefined) return;
  for (
    const slot of Array.from(
      dom.querySelectorAll<HTMLElement>(
        ".fm-tpl-slot--media.fm-tpl-slot--empty[data-line]",
      ),
    )
  ) {
    slot.addEventListener("mousedown", (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      const line1 = lineOf(Number(slot.getAttribute("data-line")));
      if (Number.isFinite(line1)) resolver.onAddPhoto?.(line1);
    });
  }
}

// The 1-based document line a press on `seam` inside region `dom` (whose
// first line is 0-based `startLine`) stands for: the last anchored line
// rendered before the seam, or, when the seam is at the region's top, what
// ends the page above: the last line of the prose there (as a press under
// the last words of a page does in a word processor), else the blank line
// between that block and this one. Undefined at the document's first line.
function lineBeforeSeam(
  dom: HTMLElement,
  seam: HTMLElement,
  startLine: number,
  doc: { lines: number; line: (n: number) => { text: string } },
): number | undefined {
  let rel: number | undefined;
  for (
    const a of Array.from(dom.querySelectorAll<HTMLElement>("[data-line]"))
  ) {
    if (a.contains(seam) || a.closest(".fm-page-gutter, .fm-peer-layer")) {
      continue;
    }
    if (!(seam.compareDocumentPosition(a) & Node.DOCUMENT_POSITION_PRECEDING)) {
      break;
    }
    const n = Number(a.getAttribute("data-line"));
    if (Number.isFinite(n)) rel = n;
  }
  if (rel !== undefined) return startLine + rel + 1;
  if (startLine < 1) return undefined;
  let above = startLine;
  while (above > 1 && doc.line(above).text.trim().length === 0) above--;
  // Text a caret can end: prose, a heading, a list item, a quote. Not a
  // fence (the caret would park in that block), a table row or an embed.
  const text = doc.line(above).text;
  const typed = text.trim().length > 0 && !/^\s*(:::|```|~~~|\|)/.test(text) &&
    !isFastrEmbedLine(text);
  return typed ? above : startLine;
}

// A page template's empty text areas (prose, items, a quote, the story's
// heading column): a ghost line to type into, as an empty column has
// (attachColumnHeadingGhost). The first keystroke writes the line into the
// slot (fillPageSlotEdit) and carries on in its island. Every other empty
// area is the template chrome's (attachTemplateChrome) or a photo's
// (attachPhotoSlots).
function attachSlotTextGhosts(
  dom: HTMLElement,
  view: EditorView,
  startLine: number,
  source: string,
): void {
  const page = scanFastrPages(source).pages[0];
  if (page === undefined) return;
  for (const slot of page.slots) {
    const accepts = slot.spec?.accepts;
    if (
      !slot.empty || slot.name === undefined ||
      (accepts !== "markdown" && accepts !== "paragraphs" &&
        accepts !== "quote")
    ) continue;
    const rel = slot.line - 1;
    const area = dom.querySelector<HTMLElement>(
      `.fm-tpl > .fm-tpl-slot[data-line="${rel}"]`,
    );
    if (area === null) continue;
    const heading = page.template?.headingArea === slot.name;
    const ghost = document.createElement(heading ? "h2" : "p");
    area.append(ghost);
    attachSlotTextGhost(ghost, view, startLine, rel, heading, slot.name);
  }
}

function attachSlotTextGhost(
  el: HTMLElement,
  view: EditorView,
  startLine: number,
  fenceRel: number,
  heading: boolean,
  name: string,
) {
  const fenceLine1 = startLine + fenceRel + 1;
  const selector =
    `[data-region-line="${startLine}"] .fm-tpl-slot[data-line="${fenceRel}"]`;
  el.classList.add("cm-fm-attr", "cm-fm-slot-ghost");
  el.setAttribute(
    "data-placeholder",
    `${fastrTemplateAreaLabel(name)}: ${
      t3({ en: "type here…", fr: "saisir ici…", pt: "escreva aqui…" })
    }`,
  );
  const activate = () => {
    try {
      el.contentEditable = "plaintext-only";
    } catch {
      el.contentEditable = "true";
    }
    el.focus();
  };
  (el as unknown as { _fmAttrActivate?: () => void })._fmAttrActivate =
    activate;
  // As the column's ghost: park the caret on the slot's fence (the flip to
  // active rebuilds the widget), then activate what stands there now.
  el.addEventListener("mousedown", (e) => {
    if (view.state.readOnly) return;
    e.stopPropagation();
    if (el.isContentEditable) return;
    if (fenceLine1 <= view.state.doc.lines) {
      view.dispatch({
        selection: { anchor: view.state.doc.line(fenceLine1).from },
      });
    }
    const next = view.contentDOM.querySelector<HTMLElement>(
      `${selector} > .cm-fm-slot-ghost`,
    ) ?? el;
    if (next !== el) e.preventDefault();
    ((next as unknown as { _fmAttrActivate?: () => void })._fmAttrActivate ??
      activate)();
  });
  el.addEventListener("click", (e) => e.stopPropagation());
  el.addEventListener("input", () => {
    if (!el.isContentEditable || !el.isConnected || islandCarried(el)) return;
    const typed = el.textContent ?? "";
    const value = typed.replace(/\s+/g, " ").trim();
    if (value.length === 0) return;
    const r = fillPageSlotEdit(
      view.state.doc.toString(),
      fenceLine1,
      heading ? `## ${value}` : value,
    );
    // A collaborator filled the slot meanwhile.
    if (r.changes.length === 0) return;
    const lead = typed.length - typed.trimStart().length;
    const caret = Math.max(0, islandCaretOffset(el) - lead);
    el.contentEditable = "false";
    el.textContent = "";
    view.dispatch({
      changes: r.changes,
      // Not kept: the area re-renders with its line, which opens below.
      annotations: islandCommit.of(false),
    });
    const line = Array.from(
      view.contentDOM.querySelectorAll<HTMLElement>(
        `${selector} > [data-line="${fenceRel + 1}"]`,
      ),
    ).find((n) => n.tagName === (heading ? "H2" : "P"));
    if (!line) return;
    (line as unknown as { _fmEnterCloses?: boolean })._fmEnterCloses = heading;
    (line as unknown as { _fmActivate?: (caretAt?: number) => void })
      ._fmActivate?.(Math.min(caret, value.length));
  });
  setIslandHandle(el, {
    key: "ghost",
    line1: fenceLine1,
    caret: () => ({ offset: islandCaretOffset(el) }),
    open: (c) => {
      activate();
      if (c.offset !== undefined) placeIslandCaret(el, c.offset);
    },
    drop: () => {
      el.contentEditable = "false";
    },
  });
  el.addEventListener("blur", (e) => {
    if (islandCarried(el) || !el.isContentEditable) return;
    el.contentEditable = "false";
    el.textContent = "";
    releaseIslandCaret(view, e);
  });
  el.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      el.blur();
    } else if (e.key === "Escape") {
      e.preventDefault();
      el.textContent = "";
      el.blur();
    }
  });
}

// Hatch each area of a page template that holds more than it shows
// (fastrTemplateOverflow, the measure print's runner reports with).
function markOverfullAreas(dom: HTMLElement): void {
  for (const tpl of Array.from(dom.querySelectorAll(".fm-tpl"))) {
    const over = new Set(fastrTemplateOverflow(tpl).map((o) => o.area));
    for (const kid of Array.from(tpl.children)) {
      const m = /\bfm-tpl-slot--([a-z0-9-]+)\b/.exec(kid.className);
      const area = kid.classList.contains("fm-tpl-main") ? "main" : m?.[1];
      kid.classList.toggle("is-overfull", area !== undefined && over.has(area));
    }
  }
}

function attachLogoRows(
  dom: HTMLElement,
  view: EditorView,
  resolver: EmbedResolver,
  lineOf: (rel: number) => number,
): void {
  for (
    const row of Array.from(
      dom.querySelectorAll<HTMLElement>(".fm-logos[data-line]"),
    )
  ) {
    for (
      const img of Array.from(
        row.querySelectorAll<HTMLImageElement>("img.fm-logo"),
      )
    ) {
      const m = /^image:(.+)$/.exec(img.getAttribute("src") ?? "");
      const entry = m ? resolver.getImage(m[1]) : undefined;
      if (entry) img.setAttribute("src", resolver.assetUrl(entry.imgFile));
      else img.remove();
    }
    const open = () => {
      const line1 = lineOf(Number(row.getAttribute("data-line")));
      if (
        !Number.isFinite(line1) || line1 < 1 || line1 > view.state.doc.lines
      ) return;
      const fence = fastrOpenFenceOnLine(
        view.state.doc.line(line1).text,
        line1,
      );
      if (fence?.name === "logos") resolver.onEditLogos?.(fence);
    };
    const empty = row.querySelector("img.fm-logo") === null;
    // On the press, not dblclick/click: the first press activates the region
    // and rebuilds this DOM, so the release (and a dblclick) land on a new
    // element. A press always lands on the row that is there.
    row.addEventListener("mousedown", (e) => {
      if (e.button === 0 && (empty || e.detail >= 2)) open();
    });
    if (!empty) continue;
    row.classList.add("fm-logos--empty");
    const label = document.createElement("span");
    label.className = "fm-logos__empty";
    label.textContent = t3({
      en: "Choose logos",
      fr: "Choisir des logos",
      pt: "Escolher logótipos",
    });
    row.append(label);
  }
}

function missingNote(kind: string, id: string): HTMLElement {
  const el = document.createElement("div");
  el.className = "text-danger text-xs";
  el.textContent = `${
    kind === "image"
      ? t3({
        en: "Missing image:",
        fr: "Image manquante :",
        pt: "Imagem em falta:",
      })
      : t3({
        en: "Missing visualization:",
        fr: "Visualisation manquante :",
        pt: "Visualização em falta:",
      })
  } ${id}`;
  return el;
}

// `:::report` renders nothing in View, and in Edit its settings are edited
// from the toolbar's Page setup control — so the line is fully hidden here,
// and an atomic range (provided by the region field) makes the caret skip
// over it rather than sit invisibly on it. The empty div still anchors the
// presence overlay and geometry queries.
class PageSetupWidget extends WidgetType {
  constructor(readonly source: string, readonly startLine: number) {
    super();
  }
  override eq(other: PageSetupWidget): boolean {
    return other.source === this.source;
  }
  override toDOM(): HTMLElement {
    const dom = document.createElement("div");
    dom.className = "h-0 w-full overflow-hidden";
    dom.contentEditable = "false";
    dom.setAttribute("data-region-line", String(this.startLine));
    dom.setAttribute("data-region-end", String(this.startLine));
    return dom;
  }
  override get estimatedHeight(): number {
    return 0;
  }
}

// ── Revealed regions: structured in-place editing ────────────────────────────
// A revealed region never shows `:::` syntax. Its lines decompose into:
//   • chrome  — the fences, rendered as the block's real header (a callout's
//     title bar, a band's kicker) and a silent end cap; PROTECTED from typing.
//   • leaves  — stat lines, fully rendered (they are pure attrs); PROTECTED.
//   • embeds  — figure/image lines, rendered live; PROTECTED (captions are
//     edited in the left panel).
//   • text    — everything else: ordinary editable lines painted with the
//     INNERMOST enclosing block's ground.
// The caret may sit on a protected line (that is how the toolbar targets the
// fence), but a user edit that touches one is refused by the transaction
// filter below — the attrs are reachable only through specialised controls.

const CALLOUT_KINDS = new Set(["note", "info", "success", "warning", "danger"]);

// Only LAYOUT-FREE classes from the scoped sheet are reused per line: the tone
// rules and the callout-kind custom-prop setters. Structural block classes
// (.fm-callout, .fm-card) carry margins that would repeat on every line.
function validTone(attrs: FastrOpenFence["attrs"]): string | undefined {
  return fastrSurfaceTone(attrs);
}

// The REAL sheet classes for a frame's box, or undefined when the preview
// draws no box either (an untoned tiles grid is transparent there too).
// Absolutely-positioned layer elements ignore margins, which is exactly why
// the structural classes are safe HERE and never on a .cm-line.
function boxClassesFor(frame: FastrOpenFence): string | undefined {
  const attrs = frame.attrs;
  let cls = "";
  if (frame.name === "callout") {
    const kind =
      typeof attrs["kind"] === "string" && CALLOUT_KINDS.has(attrs["kind"])
        ? attrs["kind"]
        : "note";
    cls = `fm-callout fm-callout--${kind}`;
  } else if (frame.name === "card") {
    cls = "fm-card";
  } else if (frame.name === "quote") {
    cls = "fm-quote";
  }
  const tone = validTone(attrs);
  if (tone !== undefined) cls = `${cls} fm-tone fm-tone--${tone}`.trim();
  return cls.length === 0 ? undefined : cls;
}

function frameLineMeta(
  frame: FastrOpenFence | undefined,
  depth = 0,
): { cls: string; style?: string } {
  let cls = `cm-fm-revealed cm-fm-d${Math.min(Math.max(depth, 0), 4)}`;
  if (!frame) return { cls };
  const attrs = frame.attrs;
  if (frame.name === "quote") cls += " cm-fm-quote-line";
  const boxed = boxClassesFor(frame) !== undefined;
  const tone = validTone(attrs);
  if (tone !== undefined) {
    // The tone class re-scopes the ink tokens; the BOX paints the ground, so
    // the line's own background goes transparent or it would sit over the
    // box's borders.
    return {
      cls: `${cls} fm-tone fm-tone--${tone}`,
      style: "background: transparent",
    };
  }
  if (frame.name === "callout") {
    const kind =
      typeof attrs["kind"] === "string" && CALLOUT_KINDS.has(attrs["kind"])
        ? attrs["kind"]
        : "note";
    cls += ` fm-callout--${kind}`;
  }
  if (boxed) return { cls };
  // A literal FLAT colour paints the lines directly (a gradient would repeat
  // per line as stripes).
  const bg = attrs["bg"] ?? attrs["background"];
  if (typeof bg === "string") {
    const color = safeCssColor(bg);
    if (color !== undefined) {
      return {
        cls: isDarkCssColor(color) ? `${cls} fm-ink--light` : cls,
        style: `background-color: ${color}`,
      };
    }
  }
  return { cls };
}

// Click-to-edit for a text-valued attr shown in chrome (a title, a kicker, a
// stat's value/label/delta). The element becomes contentEditable on click;
// Enter or blur commits the new text as a fence patch — the same
// updateContainerFenceLine path the toolbar uses, so an unchanged value
// rewrites nothing — and Escape reverts. The commit dispatch carries no
// userEvent, so the structure guard lets it through: this IS the specialised
// way to edit what typing cannot reach.
// A column without a heading grows a ghost heading to click into, the way a
// kickerless cover grows a ghost kicker: in the live editor while the column's
// region is active, on the pages on hover (the surface's ghost CSS). Unlike a
// kicker the heading is not a fence attribute but a `### ` line: the ghost's
// first keystroke inserts that line under the `:::col` fence and typing
// carries on in it as an ordinary heading island (committed as typed, like
// every island, so nothing waits on a blur that a re-render can steal).
export function columnNeedsHeadingGhost(
  doc: { lines: number; line: (n: number) => { text: string } },
  fenceLine1: number,
): boolean {
  if (fenceLine1 >= doc.lines) return false;
  return !/^#{1,6}\s/.test(doc.line(fenceLine1 + 1).text);
}
export function attachColumnHeadingGhost(
  el: HTMLElement,
  view: EditorView,
  fenceLine1: number,
  locate?: () => HTMLElement | null | undefined,
  // The heading the first keystroke creates, once it is rendered.
  locateHeading?: () => HTMLElement | null | undefined,
) {
  el.classList.add("cm-fm-attr", "cm-fm-col-ghost");
  el.setAttribute(
    "data-placeholder",
    t3({ en: "Heading…", fr: "Titre…", pt: "Título…" }),
  );
  const activate = () => {
    try {
      el.contentEditable = "plaintext-only";
    } catch {
      el.contentEditable = "true";
    }
    el.focus();
  };
  (el as unknown as { _fmAttrActivate?: () => void })._fmAttrActivate =
    activate;
  // As the labels: activate on MOUSEDOWN, after parking the caret on the
  // fence (which may rebuild the widget: activate what stands there now).
  el.addEventListener("mousedown", (e) => {
    if (view.state.readOnly) return;
    e.stopPropagation();
    if (el.isContentEditable) return;
    if (fenceLine1 <= view.state.doc.lines) {
      view.dispatch({
        selection: { anchor: view.state.doc.line(fenceLine1).from },
      });
    }
    const next = locate?.() ?? el;
    if (next !== el) e.preventDefault();
    ((next as unknown as { _fmAttrActivate?: () => void })._fmAttrActivate ??
      activate)();
  });
  el.addEventListener("click", (e) => e.stopPropagation());
  // The ghost is re-created with every render of its block, so fenceLine1 is
  // the fence's line in the document the ghost was drawn from.
  const headingFits = () => {
    const doc = view.state.doc;
    // The fence must still be this column's, and still headingless (a
    // collaborator may have added one meanwhile).
    return fenceLine1 <= doc.lines &&
      fastrOpenFenceOnLine(doc.line(fenceLine1).text, fenceLine1)?.name ===
        "col" &&
      columnNeedsHeadingGhost(doc, fenceLine1);
  };
  el.addEventListener("input", () => {
    if (!el.isContentEditable || !el.isConnected || islandCarried(el)) return;
    const typed = el.textContent ?? "";
    const value = typed.replace(/\s+/g, " ").trim();
    if (value.length === 0 || !headingFits()) return;
    const lead = typed.length - typed.trimStart().length;
    const caret = Math.max(0, islandCaretOffset(el) - lead);
    el.contentEditable = "false";
    el.textContent = "";
    view.dispatch({
      changes: {
        from: view.state.doc.line(fenceLine1).to,
        insert: `\n### ${value}`,
      },
      // Not kept: the block re-renders with its heading, which opens below.
      annotations: islandCommit.of(false),
    });
    const heading = locateHeading?.();
    if (!heading) return;
    // Enter closes it, as it closed the ghost.
    (heading as unknown as { _fmEnterCloses?: boolean })._fmEnterCloses = true;
    (heading as unknown as { _fmActivate?: (caretAt?: number) => void })
      ._fmActivate?.(Math.min(caret, value.length));
  });
  setIslandHandle(el, {
    key: "ghost",
    line1: fenceLine1,
    caret: () => ({ offset: islandCaretOffset(el) }),
    open: (c) => {
      activate();
      if (c.offset !== undefined) placeIslandCaret(el, c.offset);
    },
    drop: () => {
      el.contentEditable = "false";
    },
  });
  el.addEventListener("blur", (e) => {
    if (islandCarried(el) || !el.isContentEditable) return;
    el.contentEditable = "false";
    el.textContent = "";
    releaseIslandCaret(view, e);
  });
  el.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      el.blur();
    } else if (e.key === "Escape") {
      e.preventDefault();
      el.textContent = "";
      el.blur();
    }
  });
}

export function attachAttrEditor(
  el: HTMLElement,
  view: EditorView,
  line1: number,
  attr: string,
  original: string,
  placeholder: string,
  // Finds this element's equivalent after a widget rebuild: parking the caret
  // flips the region active, which recreates the widget DOM (ghost pieces
  // included), so activation must land on the POST-rebuild element.
  locate?: () => HTMLElement | null | undefined,
) {
  el.classList.add("cm-fm-attr");
  el.setAttribute("data-placeholder", placeholder);
  // Committed as typed (see attachTextEditor): each keystroke is a fence
  // patch annotated as this island's own, so the widget is kept, not rebuilt.
  let committed = original.trim();
  const patchTo = (value: string, keep: boolean) => {
    if (value === committed) return;
    if (line1 > view.state.doc.lines) return;
    const line = view.state.doc.line(line1);
    const patched = updateContainerFenceLine(line.text, { [attr]: value });
    committed = value;
    if (patched === undefined || patched === line.text) return;
    view.dispatch({
      changes: { from: line.from, to: line.to, insert: patched },
      annotations: islandCommit.of(keep),
    });
  };
  const commitLive = () => {
    if (!el.isContentEditable || !el.isConnected) return;
    patchTo((el.textContent ?? "").replace(/\s+/g, " ").trim(), true);
  };
  const activate = () => {
    try {
      el.contentEditable = "plaintext-only";
    } catch {
      el.contentEditable = "true";
    }
    el.focus();
    if (line1 <= view.state.doc.lines) {
      const at = view.state.doc.line(line1).from;
      publishIslandCaret(view, at, at);
    }
    const sel = winOf(el).getSelection();
    if (sel) {
      const range = docOf(el).createRange();
      range.selectNodeContents(el);
      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);
    }
  };
  (el as unknown as { _fmAttrActivate?: () => void })._fmAttrActivate =
    activate;
  // Activation happens on MOUSEDOWN, before the browser decides what the
  // press selects: a label that only becomes editable on click is still a
  // non-editable island at that moment, so the browser would select the
  // WHOLE surrounding widget (visibly, when the press lands mid-edit of
  // another label). Editable by the time the default runs, the press just
  // places the caret where it landed.
  el.addEventListener("mousedown", (e) => {
    if (view.state.readOnly) return;
    e.stopPropagation();
    if (el.isContentEditable) return;
    // Park the caret on the fence line FIRST (no focus steal): the toolbar
    // reads its block context from the selection, so the block's controls
    // (tone, ink, the stat's pieces) appear on the very FIRST click — then
    // activate whatever now stands where this element did, since the park
    // may have rebuilt the widget.
    if (line1 <= view.state.doc.lines) {
      view.dispatch({
        selection: { anchor: view.state.doc.line(line1).from },
      });
    }
    const next = locate?.() ?? el;
    if (next !== el) e.preventDefault();
    ((next as unknown as { _fmAttrActivate?: () => void })._fmAttrActivate ??
      activate)();
  });
  // Clicks stay inside the label — the widget's own handlers (reveal, embed
  // select) must not see them.
  el.addEventListener("click", (e) => e.stopPropagation());
  el.addEventListener("input", commitLive);
  setIslandHandle(el, {
    key: `attr:${attr}`,
    line1,
    caret: () => ({ offset: islandCaretOffset(el) }),
    open: (c) => {
      activate();
      if (c.offset !== undefined) placeIslandCaret(el, c.offset);
    },
    drop: () => {
      el.contentEditable = "false";
    },
  });
  el.addEventListener("blur", (e) => {
    if (islandCarried(el)) return;
    commitLive();
    el.contentEditable = "false";
    closeIsland(view, el, committed !== original.trim());
    releaseIslandCaret(view, e);
  });
  el.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      el.blur();
    } else if (e.key === "Escape") {
      e.preventDefault();
      el.textContent = original;
      el.blur();
    }
  });
}

// A stat's value/label/delta edit in place wherever the stat renders — in
// the revealed leaf widget AND inside a collapsed region's grid, so a tiles
// row of stats never needs to break its layout to be edited. When the region
// is ACTIVE, the pieces the stat does not carry yet appear as ghost
// placeholders to click into (the same affordance a titleless callout or a
// kickerless cover gets), inserted in the renderer's value→label→delta order.
export function attachStatEditors(
  root: HTMLElement,
  view: EditorView,
  line1: number,
  lineText: string,
  active = false,
  locateRoot?: () => HTMLElement | null | undefined,
) {
  const attrs = fastrOpenFenceOnLine(lineText, line1)?.attrs ?? {};
  const dir = typeof attrs["dir"] === "string" ? attrs["dir"] : "flat";
  const pieces: [string, string, string, string][] = [
    [
      "fm-stat__value",
      "value",
      t3({ en: "Value…", fr: "Valeur…", pt: "Valor…" }),
      "fm-stat__value",
    ],
    [
      "fm-stat__label",
      "label",
      t3({ en: "Label…", fr: "Libellé…", pt: "Rótulo…" }),
      "fm-stat__label",
    ],
    [
      "fm-stat__delta",
      "delta",
      t3({ en: "Change…", fr: "Évolution…", pt: "Variação…" }),
      `fm-stat__delta fm-stat__delta--${dir}`,
    ],
  ];
  let prev: HTMLElement | undefined;
  for (const [cls, attr, placeholder, ghostClass] of pieces) {
    let el = root.querySelector<HTMLElement>(`.${cls}`);
    if (!el && active) {
      el = root.ownerDocument.createElement("div");
      el.className = ghostClass;
      if (prev) prev.after(el);
      else root.prepend(el);
    }
    if (!el) continue;
    prev = el;
    const original = typeof attrs[attr] === "string"
      ? (attrs[attr] as string)
      : "";
    attachAttrEditor(
      el,
      view,
      line1,
      attr,
      original,
      placeholder,
      locateRoot === undefined
        ? undefined
        : () => locateRoot()?.querySelector<HTMLElement>(`.${cls}`),
    );
  }
}

// In-place editing for a rendered TEXT element (p, li, headings inside
// blocks): on press, the element's content swaps to the RAW source of its
// line(s) — inline markdown stays authorable — while the surrounding block
// keeps its rendered form. Enter/blur commits (a changed text is one
// dispatch; the widget re-renders), Escape restores the rendered content.
// The last source line (relative) of the island starting at `rel`: a
// paragraph runs over consecutive non-blank lines (breaks render as <br>).
export function textIslandEndRel(
  sourceLines: string[],
  rel: number,
  tag: string,
): number {
  let endRel = rel;
  if (tag === "P") {
    while (
      endRel + 1 < sourceLines.length &&
      sourceLines[endRel + 1].trim().length > 0 &&
      parseContainerFence(sourceLines[endRel + 1]) === undefined &&
      !isFastrEmbedLine(sourceLines[endRel + 1])
    ) endRel++;
  }
  return endRel;
}

// The editing surface of an island is the raw source, but the syntax the
// toolbar OWNS stays invisible while editing: a heading's leading marker and
// role-mark wrappers are swapped in as display:none spans (textContent still
// includes them, so a commit round-trips byte-identically and a Range-based
// selection offset stays a source offset), and the marked phrase keeps its
// real colour and size. Emphasis/code/link syntax stays visible: it is typed.
// Shared by the paragraph islands and the table cell editor.
// The caret in an island at a source offset (textContent offsets, hidden
// spans included), or at its end.
function placeIslandCaret(el: HTMLElement, caretAt?: number): void {
  const sel = winOf(el).getSelection();
  if (!sel) return;
  const range = docOf(el).createRange();
  range.selectNodeContents(el);
  range.collapse(false);
  if (caretAt !== undefined) {
    // Never INSIDE a hidden run (a heading's `# `, a mark's `]{…}`): typing
    // there lands in syntax the author cannot see. A caret on a hidden run's
    // edge goes to the visible text after it, or after the run.
    const walker = docOf(el).createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let remaining = caretAt;
    let node: Text | null;
    let afterHidden: Element | undefined;
    let placed = false;
    while ((node = walker.nextNode() as Text | null) !== null) {
      const hidden = node.parentElement?.closest(".cm-fm-island-syntax") ??
        undefined;
      if (remaining < node.length || (remaining === node.length && !hidden)) {
        if (hidden && remaining > 0) range.setStartAfter(hidden);
        else if (hidden) range.setStartBefore(hidden);
        else range.setStart(node, remaining);
        range.collapse(true);
        placed = true;
        break;
      }
      remaining -= node.length;
      afterHidden = hidden;
    }
    if (!placed && afterHidden) {
      range.setStartAfter(afterHidden);
      range.collapse(true);
    }
  }
  sel.removeAllRanges();
  sel.addRange(range);
}

// The caret's source offset in an island (textContent offsets, hidden spans
// included), or its end.
function islandCaretOffset(el: HTMLElement): number {
  const text = el.textContent ?? "";
  const sel = winOf(el).getSelection();
  if (
    !sel || sel.rangeCount === 0 || !sel.focusNode ||
    !el.contains(sel.focusNode)
  ) return text.length;
  const r = docOf(el).createRange();
  r.selectNodeContents(el);
  try {
    r.setEnd(sel.focusNode, sel.focusOffset);
  } catch {
    return text.length;
  }
  return r.toString().length;
}

// A hidden run of an island's source (display:none, still in textContent).
function islandSyntaxSpan(el: HTMLElement, text: string): HTMLSpanElement {
  const s = docOf(el).createElement("span");
  s.className = "cm-fm-island-syntax";
  s.textContent = text;
  return s;
}

export function renderEditableIsland(
  el: HTMLElement,
  source: string,
  heading: boolean,
): void {
  el.textContent = "";
  const hiddenSpan = (t: string) => islandSyntaxSpan(el, t);
  // Text, with each `<br>` as its hidden tag and a real line break (a <br>
  // element has no text, so textContent stays the source).
  const appendText = (parent: ParentNode, text: string) => {
    for (const part of text.split(/(<br\s*\/?>)/i)) {
      if (/^<br\s*\/?>$/i.test(part)) {
        parent.append(hiddenSpan(part), docOf(el).createElement("br"));
      } else if (part.length > 0) {
        parent.append(docOf(el).createTextNode(part));
      }
    }
  };
  // Emphasis runs: same-length `*` fences, content not space-flanked (so a
  // list bullet or a lone `*` in prose never matches). The markers hide,
  // the content styles — inside role phrases too.
  const EMPH_RE = /(\*{3}|\*{2}|\*)(?!\s)([^*]*?)(?<!\s)\1/g;
  const appendWithEmphasis = (parent: ParentNode, text: string) => {
    EMPH_RE.lastIndex = 0;
    let last = 0;
    let m: RegExpExecArray | null;
    while ((m = EMPH_RE.exec(text)) !== null) {
      appendText(parent, text.slice(last, m.index));
      parent.append(hiddenSpan(m[1]));
      const styled = docOf(el).createElement("span");
      if (m[1].length >= 2) styled.style.fontWeight = "700";
      if (m[1].length !== 2) styled.style.fontStyle = "italic";
      styled.textContent = m[2];
      parent.append(styled);
      parent.append(hiddenSpan(m[1]));
      last = m.index + m[0].length;
    }
    appendText(parent, text.slice(last));
  };
  const frag = docOf(el).createDocumentFragment();
  let rest = source;
  // A paragraph's or heading's `{align=…}` ends the source: hidden, kept in
  // textContent so the island's text stays byte-identical to it.
  const alignAt = fastrSuffixInsertOffset(rest);
  const alignTail = alignAt === undefined ? "" : rest.slice(alignAt);
  if (alignAt !== undefined) rest = rest.slice(0, alignAt);
  const hm = /^(#{1,6} )/.exec(rest);
  if (hm && heading) {
    frag.append(hiddenSpan(hm[1]));
    rest = rest.slice(hm[1].length);
  }
  MARK_RE.lastIndex = 0;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = MARK_RE.exec(rest)) !== null) {
    const attrs = parseFastrMarkAttrs(m[2]);
    if (!attrs) continue;
    appendWithEmphasis(frag, rest.slice(last, m.index));
    frag.append(hiddenSpan("["));
    const marked = docOf(el).createElement("span");
    marked.className = fastrMarkClass(attrs);
    if (attrs.color !== undefined) marked.style.color = attrs.color;
    if (attrs.size !== undefined) marked.style.fontSize = `${attrs.size}pt`;
    if (attrs.underline === true) marked.style.textDecoration = "underline";
    appendWithEmphasis(marked, m[1]);
    frag.append(marked);
    // m[2] verbatim, so textContent stays byte-identical to the source.
    frag.append(hiddenSpan(`]{${m[2]}}`));
    last = m.index + m[0].length;
  }
  appendWithEmphasis(frag, rest.slice(last));
  if (alignTail.length > 0) frag.append(hiddenSpan(alignTail));
  el.append(frag);
}

export function attachTextEditor(
  el: HTMLElement,
  view: EditorView,
  regionStartLine: number,
  sourceLines: string[],
  rel: number,
) {
  const sourceOf = (lines: string[]) =>
    lines.slice(rel, textIslandEndRel(lines, rel, el.tagName) + 1).join("\n");
  let original = sourceOf(sourceLines);
  // What the document holds for this island right now. Edits are committed
  // AS THEY ARE TYPED (peers see them live, and nothing can be lost on a
  // missed blur); the island's own commit is annotated so the region field
  // keeps this DOM instead of rebuilding it under the cursor.
  let committed = original;
  // A heading's `# ` is not in the island at all: the island holds the
  // words, and every commit puts the marker back in front of them. As a
  // hidden span inside the editable heading it could be deleted with the
  // words (Backspacing an old title away left the new one a paragraph:
  // Nick, 2026-10-07, "the size of the text turned wrong"), and Chrome
  // placed the next typing around it. Island offsets (the caret, the
  // selection mirror) are offsets into the words; the mirror adds the
  // marker back for the document.
  const prefix = /^H[1-6]$/.test(el.tagName)
    ? (/^(#{1,6} )/.exec(original)?.[1] ?? "")
    : "";
  const committedEndLine1 = () =>
    regionStartLine + rel + committed.split("\n").length;
  const commitLive = () => {
    // A detached island (the widget was rebuilt under it) is stale DOM: the
    // document already holds everything it committed while it was live.
    if (!el.isContentEditable || !el.isConnected) return;
    // A line break at the very end waits for the text after it: committed
    // alone it would be a blank line, which ends the paragraph.
    let next = prefix +
      (el.textContent ?? "").replace(/\r/g, "").replace(/\n+$/, "");
    // A heading's line break at its very end waits for the words after it,
    // as a paragraph's newline does.
    if (/^H[1-6]$/.test(el.tagName)) next = next.replace(/(<br\s*\/?>)+$/i, "");
    if (next === committed) return;
    // A formatted phrase stays whole or goes whole: its hidden markers are
    // spans in this island, which a selection or a Backspace can take apart
    // from the words (fastrMarkAwareRewrite). The corrected text is redrawn
    // here with the caret where the edit left it.
    const fixed = fastrMarkAwareRewrite(committed, next);
    if (fixed !== undefined) {
      next = fixed.text;
      renderEditableSource(next);
      placeCaret(Math.max(0, fixed.caret - prefix.length));
      if (next === committed) return;
    }
    const doc = view.state.doc;
    const line1 = regionStartLine + rel + 1;
    const endLine1 = committedEndLine1();
    if (endLine1 > doc.lines) return;
    // A change of LINE COUNT moves every island below this one, so the
    // widget must rebuild; the island is then re-opened on the rebuilt
    // element with the caret where it was (a line break typed mid-text
    // keeps typing there, not at the end).
    const sameShape = next.split("\n").length === committed.split("\n").length;
    const caretAt = sameShape ? undefined : caretOffset().at;
    committed = next;
    // Reopened below on the rebuilt element: its blur in the rebuild closes
    // nothing.
    if (!sameShape) handle.carried = true;
    view.dispatch({
      changes: {
        from: doc.line(line1).from,
        to: doc.line(endLine1).to,
        insert: next,
      },
      annotations: islandCommit.of(sameShape),
    });
    if (el.isConnected) handle.carried = false;
    if (!sameShape) {
      const host = view.contentDOM.querySelector(
        `[data-region-line="${regionStartLine}"]`,
      );
      if (!host) return;
      stopMirror();
      const target = [
        ...host.querySelectorAll<HTMLElement>(`[data-line="${rel}"]`),
      ]
        .find((n) => n.tagName === el.tagName);
      (target as unknown as
        | { _fmActivate?: (caretAt?: number) => void }
        | undefined)
        ?._fmActivate?.(caretAt);
    }
  };
  el.classList.add("cm-fm-text-edit");
  // The raw source with the toolbar's syntax hidden (renderEditableIsland).
  const renderEditableSource = (source = original) =>
    renderEditableIsland(
      el,
      source.startsWith(prefix) ? source.slice(prefix.length) : source,
      false,
    );
  const activate = (caretAt?: number) => {
    (el as unknown as { _rendered: string })._rendered = el.innerHTML;
    renderEditableSource();
    try {
      el.contentEditable = "plaintext-only";
    } catch {
      el.contentEditable = "true";
    }
    // A line break is a newline in the source: it must show as one while
    // editing (the paged frame's paragraphs do not preserve newlines).
    el.style.whiteSpace = "pre-wrap";
    el.focus();
    // Caret at the end: the swap changed the text under the press, so a
    // precise position is not meaningful. A re-open after a line break
    // passes the source offset the caret stood at instead.
    placeCaret(caretAt);
  };
  // The caret at a source offset (textContent offsets, hidden spans
  // included), or at the end.
  const placeCaret = (caretAt?: number) => placeIslandCaret(el, caretAt);
  (el as unknown as { _fmActivate?: (caretAt?: number) => void })._fmActivate =
    activate;
  el.addEventListener("mousedown", (e) => {
    if (view.state.readOnly) return;
    e.stopPropagation();
    if (el.isContentEditable) return;
    // A right-click is for the context menu: never swap to source under it
    // (and the region root must not rebuild the widget under it either).
    if (e.button !== 0) return;
    e.preventDefault();
    // Park the CM selection inside the region FIRST: the flip to active
    // rebuilds the widget DOM, so the island must be activated on the
    // POST-flip element — activating this one would put a contentEditable on
    // a node the rebuild is about to throw away (the selection mirror would
    // otherwise trigger that same rebuild mid-edit and kill the island).
    const doc = view.state.doc;
    const line1 = regionStartLine + rel + 1;
    if (line1 > doc.lines) return;
    view.dispatch({ selection: { anchor: doc.line(line1).from } });
    const host = view.contentDOM.querySelector(
      `[data-region-line="${regionStartLine}"]`,
    );
    const target = host
      ? [...host.querySelectorAll<HTMLElement>(`[data-line="${rel}"]`)].find(
        (n) => n.tagName === el.tagName,
      )
      : undefined;
    ((target ?? el) as unknown as { _fmActivate?: () => void })
      ._fmActivate?.();
  });
  el.addEventListener("click", (e) => e.stopPropagation());
  el.addEventListener("input", commitLive);
  // Mirror the island's DOM selection into the CM selection while editing:
  // the toolbar's text actions (role colour, bold, italic) read the CM
  // selection, and without the mirror they would act on wherever the caret
  // was parked instead of what the user actually selected in this island.
  const mirrorSelection = () => {
    if (!el.isContentEditable) return;
    const sel = winOf(el).getSelection();
    if (!sel || sel.rangeCount === 0 || !el.contains(sel.anchorNode)) return;
    const doc = view.state.doc;
    const line1 = regionStartLine + rel + 1;
    const endLine1 = committedEndLine1();
    if (endLine1 > doc.lines) return;
    const base = doc.line(line1).from + prefix.length;
    const max = doc.line(endLine1).to;
    const offsetOf = (node: Node, offset: number) => {
      const r = docOf(el).createRange();
      r.selectNodeContents(el);
      try {
        r.setEnd(node, offset);
      } catch {
        return 0;
      }
      return r.toString().length;
    };
    const anchor = Math.min(
      base + offsetOf(sel.anchorNode!, sel.anchorOffset),
      max,
    );
    const head = Math.min(
      base + offsetOf(sel.focusNode!, sel.focusOffset),
      max,
    );
    // Peers: the CM view has no focus while an island does, so yCollab
    // publishes nothing — this is where the caret reaches them.
    publishIslandCaret(view, anchor, head);
    const cur = view.state.selection.main;
    if (cur.anchor === anchor && cur.head === head) return;
    view.dispatch({ selection: { anchor, head } });
  };
  // Document-level, so it must live exactly as long as the island is ACTIVE —
  // widgets rebuild on every regional keystroke, and a listener left behind
  // would accumulate one copy per rebuild.
  const stopMirror = () =>
    docOf(el).removeEventListener("selectionchange", mirrorSelection);
  el.addEventListener(
    "focus",
    () => docOf(el).addEventListener("selectionchange", mirrorSelection),
  );
  const restore = () => {
    stopMirror();
    el.contentEditable = "false";
    const rendered = (el as unknown as { _rendered?: string })._rendered;
    if (rendered !== undefined) el.innerHTML = rendered;
  };
  // Closing the island: whatever was typed is already in the document, so
  // this only has to stop editing and, when something changed, ask the
  // region field to render the committed text properly.
  const finish = () => {
    commitLive();
    stopMirror();
    el.contentEditable = "false";
    // A heading inside a block cleared of its words leaves no empty heading
    // behind: the line goes, and a column grows its ghost heading again.
    if (
      // Emptied with or without its marker (a select-all takes the hidden
      // `### ` too).
      /^H[1-6]$/.test(el.tagName) && /^(#{1,6})?\s*$/.test(committed) &&
      el.closest(".fm-card, .fm-col, .fm-callout, .fm-band, .fm-quote") !== null
    ) {
      const doc = view.state.doc;
      const line1 = regionStartLine + rel + 1;
      if (line1 <= doc.lines && /^(#{1,6})?\s*$/.test(doc.line(line1).text)) {
        const line = doc.line(line1);
        dispatchAfterUpdate(view, {
          changes: {
            from: line.from,
            to: Math.min(line.to + 1, doc.length),
            insert: "",
          },
          effects: rebuildRegions.of(null),
        });
        return;
      }
    }
    // Already rebuilt when the island turns out detached: that is what
    // detached it (decided a tick later; see dispatchAfterUpdate).
    if (!closeIsland(view, el, committed !== original)) restore();
  };
  const handle: IslandHandle = {
    key: `text:${el.tagName}`,
    line1: regionStartLine + rel + 1,
    caret: (doc) => {
      const line1 = regionStartLine + rel + 1;
      if (line1 > doc.lines) return {};
      return { pos: doc.line(line1).from + prefix.length + caretOffset().at };
    },
    open: (c) => {
      const doc = view.state.doc;
      const line1 = regionStartLine + rel + 1;
      const base = line1 <= doc.lines
        ? doc.line(line1).from + prefix.length
        : undefined;
      activate(
        c.pos === undefined || base === undefined
          ? undefined
          : Math.max(0, c.pos - base),
      );
    },
    drop: () => {
      stopMirror();
      el.contentEditable = "false";
    },
  };
  setIslandHandle(el, handle);
  el.addEventListener("blur", (e) => {
    if (handle.carried || !el.isContentEditable) return;
    finish();
    releaseIslandCaret(view, e);
  });
  // Enter inside a step: a NEW step, the way Enter in a list makes a new
  // item. The text after the caret becomes the next step — a placeholder
  // when there is none, since an empty paragraph would not render and there
  // would be nothing to click — and that step's island is activated with the
  // placeholder selected, so typing replaces it. ONE dispatch commits this
  // step's text and adds the next.
  const splitStep = () => {
    const doc = view.state.doc;
    const line1 = regionStartLine + rel + 1;
    const endLine1 = committedEndLine1();
    if (endLine1 > doc.lines) {
      el.blur();
      return;
    }
    const text = (el.textContent ?? "").replace(/\r/g, "");
    let at = text.length;
    const sel = winOf(el).getSelection();
    if (
      sel && sel.rangeCount > 0 && sel.focusNode && el.contains(sel.focusNode)
    ) {
      const r = docOf(el).createRange();
      r.selectNodeContents(el);
      try {
        r.setEnd(sel.focusNode, sel.focusOffset);
        at = r.toString().length;
      } catch {
        // An unreachable focus node: split at the end.
      }
    }
    const label = t3({
      en: "New step",
      fr: "Nouvelle étape",
      pt: "Novo passo",
    });
    // A step split inside a formatted phrase: each step keeps the phrase.
    const cut = fastrMarkLineBreak(text, at);
    const splitAt = cut?.at ?? at;
    const before = (text.slice(0, splitAt) + (cut?.close ?? "")).trimEnd() ||
      label;
    const after = ((cut?.open ?? "") + text.slice(splitAt)).trimStart();
    stopMirror();
    el.contentEditable = "false";
    const from = doc.line(line1).from;
    committed = `${before}\n\n${after || label}`;
    view.dispatch({
      changes: { from, to: doc.line(endLine1).to, insert: committed },
      selection: { anchor: from + before.length + 2 },
    });
    const newRel = rel + before.split("\n").length + 1;
    const host = view.contentDOM.querySelector(
      `[data-region-line="${regionStartLine}"]`,
    );
    const target = host?.querySelector<HTMLElement>(`p[data-line="${newRel}"]`);
    if (!target) return;
    (target as unknown as { _fmActivate?: () => void })._fmActivate?.();
    const next = winOf(el).getSelection();
    if (!next) return;
    if (after) next.collapse(target, 0);
    else next.selectAllChildren(target);
  };
  // The caret's offset in the island's text (the source), or the end.
  const caretOffset = () => {
    const text = (el.textContent ?? "").replace(/\r/g, "");
    let at = text.length;
    const sel = winOf(el).getSelection();
    if (
      sel && sel.rangeCount > 0 && sel.focusNode && el.contains(sel.focusNode)
    ) {
      const r = docOf(el).createRange();
      r.selectNodeContents(el);
      try {
        r.setEnd(sel.focusNode, sel.focusOffset);
        at = r.toString().length;
      } catch {
        // An unreachable focus node: the end.
      }
    }
    return { text, at };
  };
  // Inside a block (a card in a tiles row, a column, a callout, a band, a
  // quote, a cover), Enter is a LINE BREAK in the same text, as in a word
  // processor's text box, not a new paragraph or the end of editing: a
  // newline in the source, which renders as a break (`breaks: true`).
  // Steps keep Enter for a new step; top-level prose on the pages keeps
  // Enter for a new paragraph.
  const inBlock = /^(P|LI)$/.test(el.tagName) &&
    el.closest(
        ".fm-card, .fm-col, .fm-callout, .fm-band, .fm-quote, .fm-cover",
      ) !== null;
  // The newline goes in as a TEXT node (the browser's own editing commands
  // turn it into markup that textContent, which is the source, drops), then
  // commits like typing. At the very end a <br> after it makes the new line
  // visible without entering the text; the commit waits for what follows.
  const insertLineBreak = () => {
    const sel = winOf(el).getSelection();
    if (!sel || sel.rangeCount === 0 || !el.contains(sel.anchorNode)) return;
    const range = sel.getRangeAt(0);
    range.deleteContents();
    const nl = docOf(el).createTextNode("\n");
    range.insertNode(nl);
    const after = docOf(el).createRange();
    after.setStartAfter(nl);
    after.setEndAfter(el.lastChild ?? nl);
    if (after.toString().length === 0 && el.lastChild?.nodeName !== "BR") {
      el.appendChild(docOf(el).createElement("br"));
    }
    const caret = docOf(el).createRange();
    caret.setStartAfter(nl);
    caret.collapse(true);
    sel.removeAllRanges();
    sel.addRange(caret);
    commitLive();
  };
  // A heading inside a block (a cover's or a band's title, a column's
  // heading): a source heading is one line, so its line break is a `<br>`,
  // drawn here as the hidden tag and a real break (renderEditableIsland).
  const headingInBlock = /^H[1-6]$/.test(el.tagName) &&
    el.closest(
        ".fm-card, .fm-col, .fm-callout, .fm-band, .fm-quote, .fm-cover",
      ) !== null;
  const insertHeadingBreak = () => {
    const sel = winOf(el).getSelection();
    if (!sel || sel.rangeCount === 0 || !el.contains(sel.anchorNode)) return;
    const range = sel.getRangeAt(0);
    range.deleteContents();
    const br = docOf(el).createElement("br");
    range.insertNode(br);
    range.insertNode(islandSyntaxSpan(el, "<br>"));
    const after = docOf(el).createRange();
    after.setStartAfter(br);
    after.setEndAfter(el.lastChild ?? br);
    if (after.toString().length === 0) {
      el.appendChild(docOf(el).createElement("br"));
    }
    const caret = docOf(el).createRange();
    caret.setStartAfter(br);
    caret.collapse(true);
    sel.removeAllRanges();
    sel.addRange(caret);
    commitLive();
  };
  el.addEventListener("keydown", (e) => {
    // A heading a column's ghost just created closes on Enter, as the ghost
    // did.
    if (
      e.key === "Enter" &&
      (el as unknown as { _fmEnterCloses?: boolean })._fmEnterCloses === true
    ) {
      e.preventDefault();
      el.blur();
      return;
    }
    if (
      e.key === "Enter" && inBlock &&
      !el.parentElement?.classList.contains("fm-steps")
    ) {
      e.preventDefault();
      insertLineBreak();
      return;
    }
    if (e.key === "Enter" && headingInBlock) {
      e.preventDefault();
      insertHeadingBreak();
      return;
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (
        el.tagName === "P" && el.parentElement?.classList.contains("fm-steps")
      ) {
        splitStep();
      } else {
        el.blur();
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      // The live commits already changed the document: put the original
      // back (one more island commit), then close.
      renderEditableSource(original);
      commitLive();
      stopMirror();
      el.contentEditable = "false";
      dispatchAfterUpdate(view, { effects: rebuildRegions.of(null) });
    }
  });
}

// Right-click on a step: a step either side, delete it (the kit's showMenu,
// same as tiles). A paragraph inside `:::steps` IS a step (the renderer
// numbers the block's direct children), so this menu and Enter are the only
// chrome a step needs (applyStepsChildAction).
export function attachStepsChildContextMenu(
  el: HTMLElement,
  view: EditorView,
  line1: number,
) {
  el.addEventListener("contextmenu", (e) => {
    if (view.state.readOnly) return;
    if (!stepsChildInfo(view.state.doc.toString(), line1)) return;
    e.preventDefault();
    e.stopPropagation();
    const held = holdLines(view, line1, line1);
    const run = (action: StepsChildAction) => {
      // A step still being typed in commits first (its blur is a dispatch),
      // so the action reads the document the author sees.
      const active = docOf(el).activeElement;
      if (
        active instanceof HTMLElement && active.isContentEditable &&
        (el.closest(".fm-live-region") ?? docOf(el).body).contains(active)
      ) active.blur();
      // Where the step is NOW; nothing when it went or changed meanwhile.
      const now = held();
      if (!now || view.state.readOnly) return;
      const doc = view.state.doc.toString();
      if (!stepsChildInfo(doc, now.first1)) return;
      const r = applyStepsChildAction(
        doc,
        now.first1,
        action,
        t3({ en: "New step", fr: "Nouvelle étape", pt: "Novo passo" }),
      );
      if (r.changes.length > 0) view.dispatch({ changes: r.changes });
    };
    const items: MenuItem[] = [
      {
        label: t3({
          en: "Add step before",
          fr: "Ajouter une étape avant",
          pt: "Adicionar passo antes",
        }),
        onClick: () => run("insertBefore"),
      },
      {
        label: t3({
          en: "Add step after",
          fr: "Ajouter une étape après",
          pt: "Adicionar passo depois",
        }),
        onClick: () => run("insertAfter"),
      },
      { type: "divider" as const },
      {
        label: t3({
          en: "Delete step",
          fr: "Supprimer l'étape",
          pt: "Eliminar passo",
        }),
        intent: "danger" as const,
        onClick: () => run("delete"),
      },
    ];
    showMenu({
      anchor: menuAnchor(e),
      items,
    });
  });
}

// The cell's right-click menu — the Google Docs table set, through the same
// showMenu system the project lists use. Table bounds are re-derived from the
// live doc at menu time (the clicked row could sit inside a container region,
// so the REGION's bounds are not the table's).
// Right-click on a stat tile, a card or a column: add a sibling either side,
// pick the grid's column count, delete it (the kit's showMenu, same as
// table cells).
// The column count follows the child count while it fits
// (applyTilesChildAction).
export function attachTilesChildContextMenu(
  el: HTMLElement,
  view: EditorView,
  line1: number,
) {
  el.addEventListener("contextmenu", (e) => {
    if (view.state.readOnly) return;
    const doc = view.state.doc.toString();
    const info = tilesChildInfo(doc, line1);
    if (!info) return;
    e.preventDefault();
    e.stopPropagation();
    const labels = {
      tile: t3({ en: "New tile", fr: "Nouvelle tuile", pt: "Novo mosaico" }),
      body: t3({ en: "Text", fr: "Texte", pt: "Texto" }),
      heading: t3({ en: "Heading", fr: "Titre", pt: "Título" }),
    };
    const held = holdLines(view, line1, line1);
    // Against the document as it is at the click, where the child is now;
    // nothing when it went or changed meanwhile.
    const run = (action: Parameters<typeof applyTilesChildAction>[2]) => {
      const now = held();
      if (!now || view.state.readOnly) return;
      const current = view.state.doc.toString();
      if (!tilesChildInfo(current, now.first1)) return;
      const r = applyTilesChildAction(current, now.first1, action, labels);
      if (r.changes.length > 0) view.dispatch({ changes: r.changes });
    };
    const noun = info.kind === "stat"
      ? {
        before: t3({
          en: "Add tile before",
          fr: "Ajouter une tuile avant",
          pt: "Adicionar mosaico antes",
        }),
        after: t3({
          en: "Add tile after",
          fr: "Ajouter une tuile après",
          pt: "Adicionar mosaico depois",
        }),
        remove: t3({
          en: "Delete tile",
          fr: "Supprimer la tuile",
          pt: "Eliminar mosaico",
        }),
      }
      : info.kind === "card"
      ? {
        before: t3({
          en: "Add card before",
          fr: "Ajouter une carte avant",
          pt: "Adicionar cartão antes",
        }),
        after: t3({
          en: "Add card after",
          fr: "Ajouter une carte après",
          pt: "Adicionar cartão depois",
        }),
        remove: t3({
          en: "Delete card",
          fr: "Supprimer la carte",
          pt: "Eliminar cartão",
        }),
      }
      : {
        before: t3({
          en: "Add column before",
          fr: "Ajouter une colonne avant",
          pt: "Adicionar coluna antes",
        }),
        after: t3({
          en: "Add column after",
          fr: "Ajouter une colonne après",
          pt: "Adicionar coluna depois",
        }),
        remove: t3({
          en: "Delete column",
          fr: "Supprimer la colonne",
          pt: "Eliminar coluna",
        }),
      };
    const items: MenuItem[] = [
      { label: noun.before, onClick: () => run("insertBefore") },
      { label: noun.after, onClick: () => run("insertAfter") },
      ...(info.grid
        ? [
          {
            label: t3({ en: "Columns", fr: "Colonnes", pt: "Colunas" }),
            subMenu: Array.from({ length: TILES_MAX_COLS }, (_, i) => ({
              label: `${i + 1}${info.grid?.cols === i + 1 ? " ✓" : ""}`,
              onClick: () => run({ cols: i + 1 }),
            })),
          } satisfies MenuItem,
        ]
        : []),
      { type: "divider" as const },
      {
        label: noun.remove,
        intent: "danger" as const,
        onClick: () => run("delete"),
      },
    ];
    showMenu({
      anchor: menuAnchor(e),
      items,
    });
  });
}

export function attachCellContextMenu(
  el: HTMLElement,
  view: EditorView,
  rowLine1: number,
  cellIndex: number,
) {
  // The table around a row line of `doc`, 1-based inclusive.
  const tableAround = (doc: DocText, row1: number) => {
    let start1 = row1;
    while (start1 > 1 && isTableRowText(doc.line(start1 - 1).text)) start1--;
    let end1 = row1;
    while (end1 < doc.lines && isTableRowText(doc.line(end1 + 1).text)) end1++;
    return { start1, end1 };
  };
  el.addEventListener("contextmenu", (e) => {
    if (view.state.readOnly) return;
    e.preventDefault();
    e.stopPropagation();
    const doc = view.state.doc;
    if (rowLine1 > doc.lines) return;
    const { start1 } = tableAround(doc, rowLine1);
    const rowRel = rowLine1 - start1;
    const colCount = cellSlices(doc.line(start1).text).length;
    const held = holdLines(view, rowLine1, rowLine1);
    // The table as it is at the click, found again from the clicked row's
    // current line; nothing when that row went or changed meanwhile.
    const tableNow = () => {
      const now = held();
      if (!now || view.state.readOnly) return undefined;
      const cur = view.state.doc;
      if (cellIndex >= cellSlices(cur.line(now.first1).text).length) {
        return undefined;
      }
      return { doc: cur, row1: now.first1, ...tableAround(cur, now.first1) };
    };

    const applyAction = (
      action: Parameters<typeof applyTableCellAction>[3],
    ) => {
      const t = tableNow();
      if (!t) return;
      const lines: string[] = [];
      for (let l = t.start1; l <= t.end1; l++) lines.push(t.doc.line(l).text);
      const next = applyTableCellAction(
        lines,
        t.row1 - t.start1,
        cellIndex,
        action,
        t3({ en: "New column", fr: "Nouvelle colonne", pt: "Nova coluna" }),
      );
      if (next === undefined) return;
      view.dispatch({
        changes: {
          from: t.doc.line(t.start1).from,
          to: t.doc.line(t.end1).to,
          insert: next.join("\n"),
        },
      });
    };

    const items: MenuItem[] = [
      ...(rowRel >= 2
        ? [{
          label: t3({
            en: "Insert row above",
            fr: "Insérer une ligne au-dessus",
            pt: "Inserir linha acima",
          }),
          onClick: () => applyAction("insertRowAbove"),
        }]
        : []),
      {
        label: t3({
          en: "Insert row below",
          fr: "Insérer une ligne en dessous",
          pt: "Inserir linha abaixo",
        }),
        onClick: () => applyAction("insertRowBelow"),
      },
      {
        label: t3({
          en: "Insert column left",
          fr: "Insérer une colonne à gauche",
          pt: "Inserir coluna à esquerda",
        }),
        onClick: () => applyAction("insertColLeft"),
      },
      {
        label: t3({
          en: "Insert column right",
          fr: "Insérer une colonne à droite",
          pt: "Inserir coluna à direita",
        }),
        onClick: () => applyAction("insertColRight"),
      },
      ...(rowRel >= 2
        ? [{
          label: t3({
            en: "Delete row",
            fr: "Supprimer la ligne",
            pt: "Eliminar linha",
          }),
          onClick: () => applyAction("deleteRow"),
        }]
        : []),
      ...(colCount > 1
        ? [{
          label: t3({
            en: "Delete column",
            fr: "Supprimer la colonne",
            pt: "Eliminar coluna",
          }),
          onClick: () => applyAction("deleteCol"),
        }]
        : []),
      {
        label: t3({
          en: "Delete table",
          fr: "Supprimer le tableau",
          pt: "Eliminar tabela",
        }),
        onClick: () => {
          const t = tableNow();
          if (!t) return;
          const from = t.doc.line(t.start1).from;
          const to = Math.min(t.doc.line(t.end1).to + 1, t.doc.length);
          view.dispatch({ changes: { from, to, insert: "" } });
        },
      },
    ];
    showMenu({
      anchor: menuAnchor(e),
      items,
    });
  });
}

// Table cells edit in place: the row's source line is split on its
// separator pipes (cellSlices, whose offsets let the selection mirror map
// island positions onto doc positions inside the row line), the pressed cell
// swaps to its raw text, and a commit rebuilds the row line.

export function attachCellEditor(
  el: HTMLElement,
  view: EditorView,
  rowLine1: number,
  cellIndex: number,
  locate?: () => HTMLElement | undefined,
) {
  el.classList.add("cm-fm-text-edit");
  const cellsOf = tableRowCells;
  // Doc offset of this cell's trimmed content, and its length — the mirror's
  // coordinate frame. Recomputed per call: the row line moves as the doc does.
  const contentRange = (
    doc: DocText = view.state.doc,
  ): { from: number; len: number } | undefined => {
    if (rowLine1 > doc.lines) return undefined;
    const line = doc.line(rowLine1);
    const slice = cellSlices(line.text)[cellIndex];
    if (!slice) return undefined;
    const lead = slice.raw.length - slice.raw.trimStart().length;
    return {
      from: line.from + slice.start + lead,
      len: slice.raw.trim().length,
    };
  };
  // Mirror the island's DOM selection into the CM selection while editing, so
  // the toolbar's text actions (size, colour, bold) act on what is selected
  // IN THE CELL — same contract as attachTextEditor's mirror. The cell's
  // mark syntax is hidden spans (renderEditableIsland), whose text Range
  // lengths still count, so they are cell offsets directly.
  const mirrorSelection = () => {
    if (!el.isContentEditable) return;
    const sel = winOf(el).getSelection();
    if (!sel || sel.rangeCount === 0 || !el.contains(sel.anchorNode)) return;
    const range = contentRange();
    if (!range) return;
    const offsetOf = (node: Node, offset: number) => {
      const r = docOf(el).createRange();
      r.selectNodeContents(el);
      try {
        r.setEnd(node, offset);
      } catch {
        return 0;
      }
      return r.toString().length;
    };
    const clamp = (n: number) => Math.max(0, Math.min(n, range.len));
    const anchor = range.from +
      clamp(offsetOf(sel.anchorNode!, sel.anchorOffset));
    const head = range.from + clamp(offsetOf(sel.focusNode!, sel.focusOffset));
    publishIslandCaret(view, anchor, head);
    const cur = view.state.selection.main;
    if (cur.anchor === anchor && cur.head === head) return;
    view.dispatch({ selection: { anchor, head } });
  };
  const stopMirror = () =>
    docOf(el).removeEventListener("selectionchange", mirrorSelection);
  // Committed as typed (see attachTextEditor): the row is rewritten on each
  // keystroke under the island's own annotation, so the table widget is kept.
  let committed: string | undefined;
  let original: string | undefined;
  const writeCell = (value: string, keep: boolean) => {
    if (value === committed) return;
    if (rowLine1 > view.state.doc.lines) return;
    const line = view.state.doc.line(rowLine1);
    const cells = cellsOf(line.text);
    cells[cellIndex] = value;
    committed = value;
    view.dispatch({
      changes: {
        from: line.from,
        to: line.to,
        insert: `| ${cells.join(" | ")} |`,
      },
      annotations: islandCommit.of(keep),
    });
  };
  const commitLive = () => {
    if (!el.isContentEditable || !el.isConnected) return;
    const raw = el.textContent ?? "";
    const typed = raw.trim();
    let next = escapeCellText(typed);
    // A typed pipe goes in escaped (a bare one would split the cell): the
    // island shows the escape too, so its text stays the cell's source.
    if (next !== typed) {
      const lead = raw.length - raw.trimStart().length;
      const at = Math.max(0, islandCaretOffset(el) - lead);
      renderEditableIsland(el, next, false);
      placeIslandCaret(el, escapeCellText(typed.slice(0, at)).length);
    }
    // A formatted phrase stays whole or goes whole (fastrMarkAwareRewrite,
    // as in a paragraph island).
    const fixed = committed === undefined
      ? undefined
      : fastrMarkAwareRewrite(committed, next);
    if (fixed !== undefined) {
      next = fixed.text;
      renderEditableIsland(el, next, false);
      placeIslandCaret(el, fixed.caret);
    }
    writeCell(next, true);
  };
  const activate = () => {
    if (rowLine1 > view.state.doc.lines) return;
    const cells = cellsOf(view.state.doc.line(rowLine1).text);
    (el as unknown as { _rendered: string })._rendered = el.innerHTML;
    original = cells[cellIndex] ?? "";
    committed = original;
    // The cell's source, its colour/size marks hidden and still styled.
    renderEditableIsland(el, original, false);
    try {
      el.contentEditable = "plaintext-only";
    } catch {
      el.contentEditable = "true";
    }
    el.focus();
    const sel = winOf(el).getSelection();
    if (sel) {
      const r = docOf(el).createRange();
      r.selectNodeContents(el);
      r.collapse(false);
      sel.removeAllRanges();
      sel.addRange(r);
    }
    const range = contentRange();
    if (range) {
      publishIslandCaret(view, range.from + range.len, range.from + range.len);
    }
    docOf(el).addEventListener("selectionchange", mirrorSelection);
  };
  (el as unknown as { _fmCellActivate?: () => void })._fmCellActivate =
    activate;
  el.addEventListener("mousedown", (e) => {
    if (view.state.readOnly) return;
    e.stopPropagation();
    if (el.isContentEditable) return;
    e.preventDefault();
    // Park the CM caret at the cell's content FIRST (the active flip rebuilds
    // the widget), then activate the POST-rebuild cell — the same
    // park-then-activate the text islands and attr editors use. The park is
    // what shows the toolbar this table's context on the first click.
    const range = contentRange();
    if (!range) return;
    view.dispatch({ selection: { anchor: range.from } });
    const target = locate?.();
    ((target ?? el) as unknown as { _fmCellActivate?: () => void })
      ._fmCellActivate?.();
  });
  el.addEventListener("click", (e) => e.stopPropagation());
  el.addEventListener("input", commitLive);
  const finish = () => {
    commitLive();
    stopMirror();
    el.contentEditable = "false";
    if (closeIsland(view, el, committed !== original)) return;
    const rendered = (el as unknown as { _rendered?: string })._rendered;
    if (rendered !== undefined) el.innerHTML = rendered;
  };
  setIslandHandle(el, {
    key: `cell:${cellIndex}`,
    line1: rowLine1,
    caret: (doc) => {
      const range = contentRange(doc);
      return range ? { pos: range.from + islandCaretOffset(el) } : {};
    },
    open: (c) => {
      activate();
      const range = contentRange();
      if (c.pos !== undefined && range) {
        placeIslandCaret(
          el,
          Math.max(0, Math.min(c.pos - range.from, range.len)),
        );
      }
    },
    drop: () => {
      stopMirror();
      el.contentEditable = "false";
    },
  });
  el.addEventListener("blur", (e) => {
    if (islandCarried(el)) return;
    if (!el.isContentEditable) {
      stopMirror();
      return;
    }
    finish();
    releaseIslandCaret(view, e);
  });
  el.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      el.blur();
    } else if (e.key === "Escape") {
      e.preventDefault();
      // Put the original cell back (one more island commit), then close.
      if (original !== undefined) writeCell(original, true);
      stopMirror();
      el.contentEditable = "false";
      dispatchAfterUpdate(view, { effects: rebuildRegions.of(null) });
    }
  });
}

function chromeRoot(view: EditorView, line1: number): HTMLElement {
  const dom = document.createElement("div");
  // flow-root contains the sheet classes' own margins — a block widget must
  // never let a child margin escape its box (the CM measurement rule).
  dom.className = "cm-fm-chrome w-full";
  dom.style.display = "flow-root";
  dom.contentEditable = "false";
  dom.addEventListener("mousedown", (e) => {
    if ((e.target as HTMLElement).closest(".cm-fm-attr")) return;
    // Prevent the browser island-selecting the widget; park the caret on the
    // (hidden) fence line instead — typing there is refused by the guard, but
    // the toolbar reads the caret and shows this block's controls.
    e.preventDefault();
    view.dispatch({ selection: { anchor: view.state.doc.line(line1).from } });
    view.focus();
  });
  return dom;
}

// An open fence's visible face: the chrome the RENDER gives that fence — a
// callout or card title, a kicker — or nothing at all (a tiles grid has no
// header when rendered, so it has none here either).
class ChromeOpenWidget extends WidgetType {
  constructor(
    readonly fence: FastrOpenFence,
    readonly sourceLine: string,
    readonly depth: number,
  ) {
    super();
  }
  override eq(other: ChromeOpenWidget): boolean {
    return other.sourceLine === this.sourceLine &&
      other.fence.line === this.fence.line && other.depth === this.depth;
  }
  override toDOM(view: EditorView): HTMLElement {
    const dom = chromeRoot(view, this.fence.line);
    // Transparent root: the page shows through the gap above the box, and the
    // BOX (layer) paints the ground behind the title. The inner wrapper takes
    // the frame's classes with its background inlined away, so the tone and
    // kind CUSTOM PROPERTIES still re-scope the title's colour without
    // painting a second ground over the box's border.
    dom.className += ` cm-fm-chrome-open cm-fm-d${Math.min(this.depth, 4)}`;
    const attrs = this.fence.attrs;
    const text = (k: string) =>
      typeof attrs[k] === "string" ? (attrs[k] as string) : undefined;
    if (this.fence.name === "callout" || this.fence.name === "card") {
      const title = text("title") ?? "";
      const kind =
        typeof attrs["kind"] === "string" && CALLOUT_KINDS.has(attrs["kind"])
          ? attrs["kind"]
          : "note";
      const wrap = document.createElement("div");
      const meta = frameLineMeta(this.fence, this.depth);
      wrap.className = this.fence.name === "callout"
        ? `${meta.cls} fm-callout--${kind}`
        : meta.cls;
      wrap.style.background = "transparent";
      const t = document.createElement("div");
      t.className = this.fence.name === "callout"
        ? "fm-callout__title"
        : "fm-card__title";
      t.textContent = title;
      attachAttrEditor(
        t,
        view,
        this.fence.line,
        "title",
        title,
        t3({ en: "Title…", fr: "Titre…", pt: "Título…" }),
      );
      wrap.appendChild(t);
      dom.appendChild(wrap);
    } else if (this.fence.name === "band" || this.fence.name === "cover") {
      const kicker = text("kicker") ?? "";
      const wrap = document.createElement("div");
      wrap.className = frameLineMeta(this.fence, this.depth).cls;
      wrap.style.background = "transparent";
      dom.appendChild(wrap);
      const k = document.createElement("div");
      k.className = "fm-kicker";
      k.textContent = kicker;
      attachAttrEditor(
        k,
        view,
        this.fence.line,
        "kicker",
        kicker,
        t3({ en: "Kicker…", fr: "Surtitre…", pt: "Antetítulo…" }),
      );
      wrap.appendChild(k);
    }
    return dom;
  }
  override get estimatedHeight(): number {
    return 24;
  }
}

// The close fence: nothing to show — the ground's last content line carries
// the bottom padding and radius.
class ChromeCapWidget extends WidgetType {
  constructor(readonly line1: number, readonly depth: number) {
    super();
  }
  override eq(other: ChromeCapWidget): boolean {
    return other.line1 === this.line1 && other.depth === this.depth;
  }
  override toDOM(view: EditorView): HTMLElement {
    const dom = chromeRoot(view, this.line1);
    dom.className += ` cm-fm-chrome-cap cm-fm-d${Math.min(this.depth, 4)}`;
    return dom;
  }
  override get estimatedHeight(): number {
    return FM_BOX_GAP + FM_BOX_PAD_BOTTOM;
  }
}

// A leaf line (a stat) is pure attributes, so it is never text-edited — it
// renders exactly as the document renders it and is driven by the toolbar.
// A `:::contents` block's content is the document, so its widget needs a key
// that changes exactly when the outline does.
function tocOutlineKey(doc: string, fence: FastrOpenFence | undefined): string {
  const { title, depth } = fastrTocOptions(fence?.attrs ?? {});
  return `${title ?? ""}|${depth}|` +
    fastrDocumentOutline(doc, depth)
      .map((it) => `${it.level}:${it.line}:${it.text}`)
      .join("\n");
}

class LeafRenderWidget extends WidgetType {
  // `outline` is set only for `:::contents`, whose content is the DOCUMENT
  // rather than its own line — serialized so eq re-renders the list exactly
  // when a heading changes, and never for an edit elsewhere.
  constructor(
    readonly source: string,
    readonly line1: number,
    readonly outline = "",
    // The collapsed gap above a block with no blank line over it, px
    // (docRhythmOf).
    readonly gapTop = 0,
  ) {
    super();
  }
  override eq(other: LeafRenderWidget): boolean {
    return other.source === this.source && other.line1 === this.line1 &&
      other.outline === this.outline && other.gapTop === this.gapTop;
  }
  override toDOM(view: EditorView): HTMLElement {
    const dom = chromeRoot(view, this.line1);
    // A leaf is a region of the document like any other: found by its
    // start line (measured and remembered by the page layout), with the
    // block's margins clamped like a region widget's (report_fastr_css.ts).
    dom.classList.add("cm-fm-leaf");
    dom.style.setProperty("--fm-gap-top", `${this.gapTop}px`);
    dom.setAttribute("data-region-line", String(this.line1 - 1));
    attachBlockContextMenu(dom, view, () => ({
      startLine: this.line1 - 1,
      endLine: this.line1 - 1,
      label: fastrRegionLabel("leaf", this.source, this.line1 - 1),
    }));
    const fence = fastrOpenFenceOnLine(this.source, this.line1);
    if (fence?.name === "contents") {
      // The renderer's own markup, from the same builder — but fed the live
      // document, so the editor shows the contents the report will have.
      const { title, depth } = fastrTocOptions(fence.attrs);
      const items = fastrDocumentOutline(view.state.doc.toString(), depth);
      const nav = document.createElement("nav");
      nav.className = "fm-toc";
      nav.innerHTML = sanitizeReportHtml(renderFastrTocHtml(items, {
        title,
        empty: t3({
          en: "No headings yet",
          fr: "Aucun titre pour l'instant",
          pt: "Ainda sem títulos",
        }),
      }));
      dom.append(nav);
      // An anchor cannot navigate inside the editor, so an entry puts the
      // CARET on its heading instead — the document's own outline, clickable.
      nav.addEventListener("mousedown", (e) => {
        const a = (e.target as HTMLElement).closest<HTMLElement>(
          "[data-toc-line]",
        );
        if (!a) return;
        const line1 = Number(a.getAttribute("data-toc-line"));
        if (
          !Number.isFinite(line1) || line1 < 1 || line1 > view.state.doc.lines
        ) {
          return;
        }
        e.preventDefault();
        e.stopPropagation();
        view.dispatch({
          selection: { anchor: view.state.doc.line(line1).from },
          scrollIntoView: true,
        });
        view.focus();
      });
      return dom;
    }
    if (fence?.name === "pagebreak") {
      // Invisible on the page; in the editor a labelled dashed rule, so the
      // forced break can be seen and deleted. Pressing it parks the caret on
      // the line (chromeRoot's own behaviour) for the block segment.
      dom.classList.add("cm-fm-leaf--marker");
      const rule = document.createElement("div");
      rule.className = "fm-pagebreak fm-pagebreak--editor";
      rule.setAttribute("data-line", "0");
      const label = document.createElement("span");
      label.textContent = t3({
        en: "Page break",
        fr: "Saut de page",
        pt: "Quebra de página",
      });
      rule.append(label);
      dom.append(rule);
      return dom;
    }
    dom.innerHTML = sanitizeReportHtml(
      renderFastrMarkdownToHtml(this.source, { lineAnchors: false }),
    );
    attachStatEditors(dom, view, this.line1, this.source, true);
    return dom;
  }
  override coordsAt(dom: HTMLElement, pos: number): Rect | null {
    return blockCaretRect(dom, this.source, pos);
  }
  // The page break marker takes no room (a rule laid over the page's foot).
  override get estimatedHeight(): number {
    return fastrOpenFenceOnLine(this.source, this.line1)?.name === "pagebreak"
      ? 0
      : 110;
  }
}

function buildRevealedRegion(
  state: EditorState,
  r: RegionRange,
  builder: RangeSetBuilder<Decoration>,
  protectedLines: ProtectedLine[],
  boxes: BoxInfo[],
  resolver: EmbedResolver,
) {
  const region = r.region;
  const sliceLines = state.sliceDoc(r.from, r.to).split("\n");
  type OpenFrame = {
    fence: FastrOpenFence | undefined;
    depth: number;
    boxClasses: string | undefined;
    openLine1: number;
  };
  const stack: OpenFrame[] = [];
  type Item =
    | { kind: "chrome-open"; line1: number; depth: number }
    | { kind: "chrome-close"; line1: number; depth: number }
    | { kind: "leaf" | "embed"; line1: number }
    | {
      kind: "text";
      line1: number;
      frame: FastrOpenFence | undefined;
      depth: number;
    };
  const items: Item[] = [];
  for (const sc of scanContainerLines(sliceLines)) {
    const line1 = region.startLine + sc.index + 1;
    if (!sc.inCode && sc.fence?.kind === "open") {
      if (isFastrLeafBlock(sc.fence.name)) {
        items.push({ kind: "leaf", line1 });
      } else {
        const fence = fastrOpenFenceOnLine(sc.text, line1);
        const depth = stack.length + 1;
        items.push({ kind: "chrome-open", line1, depth });
        stack.push({
          fence,
          depth,
          boxClasses: fence ? boxClassesFor(fence) : undefined,
          openLine1: line1,
        });
      }
      continue;
    }
    if (!sc.inCode && sc.fence?.kind === "close") {
      const frame = stack.pop();
      items.push({ kind: "chrome-close", line1, depth: frame?.depth ?? 1 });
      if (frame?.boxClasses !== undefined) {
        boxes.push({
          openLine1: frame.openLine1,
          endLine1: line1,
          capped: true,
          classes: frame.boxClasses,
          depth: frame.depth,
        });
      }
      continue;
    }
    if (!sc.inCode && isFastrEmbedLine(sc.text)) {
      items.push({ kind: "embed", line1 });
      continue;
    }
    const top = stack[stack.length - 1];
    items.push({
      kind: "text",
      line1,
      frame: top?.fence,
      depth: top?.depth ?? 0,
    });
  }
  // Unclosed frames (the block rule runs them to EOF): their box runs to the
  // region's last line, with no cap gap below.
  for (const frame of stack) {
    if (frame.boxClasses !== undefined) {
      boxes.push({
        openLine1: frame.openLine1,
        endLine1: region.endLine + 1,
        capped: false,
        classes: frame.boxClasses,
        depth: frame.depth,
      });
    }
  }

  const protect = (line1: number) => {
    const line = state.doc.line(line1);
    protectedLines.push({
      from: line.from,
      to: line.to,
      regionFrom: r.from,
      regionTo: r.to,
    });
  };

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const line = state.doc.line(item.line1);
    switch (item.kind) {
      case "chrome-open": {
        const fence = fastrOpenFenceOnLine(line.text, item.line1);
        if (fence) {
          builder.add(
            line.from,
            line.to,
            Decoration.replace({
              widget: new ChromeOpenWidget(fence, line.text, item.depth),
              block: true,
            }),
          );
        }
        protect(item.line1);
        break;
      }
      case "chrome-close":
        builder.add(
          line.from,
          line.to,
          Decoration.replace({
            widget: new ChromeCapWidget(item.line1, item.depth),
            block: true,
          }),
        );
        protect(item.line1);
        break;
      case "leaf": {
        // A stat renders exactly as the document renders it. `:::report`
        // renders SILENT, which would leave an invisible protected line —
        // the page-setup chip stands in for it, here as when collapsed.
        const isReport =
          fastrOpenFenceOnLine(line.text, item.line1)?.name === "report";
        builder.add(
          line.from,
          line.to,
          Decoration.replace({
            widget: isReport
              ? new PageSetupWidget(line.text, item.line1 - 1)
              : new LeafRenderWidget(
                line.text,
                item.line1,
                fastrOpenFenceOnLine(line.text, item.line1)?.name === "contents"
                  ? tocOutlineKey(
                    state.doc.toString(),
                    fastrOpenFenceOnLine(line.text, item.line1),
                  )
                  : "",
              ),
            block: true,
          }),
        );
        protect(item.line1);
        break;
      }
      case "embed":
        builder.add(
          line.from,
          line.to,
          Decoration.replace({
            widget: new RegionWidget(
              "embed",
              line.text,
              item.line1 - 1,
              item.line1 - 1,
              resolver,
              false,
              false,
              line.text,
            ),
            block: true,
          }),
        );
        protect(item.line1);
        break;
      case "text": {
        const meta = frameLineMeta(item.frame, item.depth);
        const prev = items[i - 1];
        const next = items[i + 1];
        // Chrome, leaves and embeds continue their block's ground; only a
        // text line under a DIFFERENT frame (or the region edge) breaks it.
        const continues = (o: Item | undefined) =>
          o !== undefined && !(o.kind === "text" && o.frame !== item.frame);
        let cls = meta.cls;
        if (!continues(prev)) cls += " cm-fm-revealed-first";
        if (!continues(next)) cls += " cm-fm-revealed-last";
        builder.add(
          line.from,
          line.from,
          Decoration.line({
            class: cls,
            ...(meta.style ? { attributes: { style: meta.style } } : {}),
          }),
        );
        break;
      }
    }
  }
}

// ── The region field ─────────────────────────────────────────────────────────

type LiveState = {
  ranges: RegionRange[];
  deco: DecorationSet;
  // Each region's widget key (see RegionWidget.sourceKey) and the source it
  // was built from, by start line. A region whose source is unchanged keeps
  // its key across any transaction (a caret move must never rebuild the
  // island being typed in); an island's own live commit keeps it even though
  // the source changed.
  keys: Map<number, { key: string; source: string }>;
  // Bumped by rebuildRegions: it is part of every ACTIVE region's key, which
  // is what makes a closing island's region re-render even when the text it
  // committed equals the text it started with (an Escape).
  rev: number;
  // Fence/leaf lines of REVEALED regions plus the whole span of every region:
  // what the transaction filter consults to refuse user edits into structure.
  protectedLines: ProtectedLine[];
  // One BOX per box-worthy revealed frame, drawn by the layer below the text:
  // the block's REAL sheet classes, so the theme's borders, radius and shadow
  // match the preview exactly.
  boxes: BoxInfo[];
  // The hidden `:::report` line(s): atomic, so the caret skips the invisible
  // page-setup rather than landing on it.
  atomic: DecorationSet;
};

type BoxInfo = {
  // 1-based line of the open fence and of the line the box ends on (the cap,
  // or the region's last line when unclosed).
  openLine1: number;
  endLine1: number;
  capped: boolean;
  classes: string;
  // 1 = the region's own block; children nest deeper and inset accordingly.
  depth: number;
};

type ProtectedLine = {
  from: number;
  to: number;
  // The enclosing region's span — a user change that swallows the WHOLE
  // region is a clean block delete and stays allowed.
  regionFrom: number;
  regionTo: number;
};

// The first line the reader actually SEES: the `:::report` header renders
// nothing and leading blank lines are View's non-content, so both are skipped.
// Returns undefined for a document with nothing in it yet.
function firstVisibleLine(state: EditorState): number | undefined {
  for (let n = 1; n <= state.doc.lines; n++) {
    const text = state.doc.line(n).text;
    if (text.trim().length === 0) continue;
    if (fastrOpenFenceOnLine(text, n)?.name === "report") continue;
    return n;
  }
  return undefined;
}

function buildLiveState(
  state: EditorState,
  resolver: EmbedResolver,
  cached?: RegionRange[],
  // The previous state and whether this build is an island's own live
  // commit: then the ACTIVE region keeps its previous widget key.
  prev?: LiveState,
  keepActive = false,
  rev = prev?.rev ?? 0,
  // Regions to draw afresh whatever their source: those naming an image
  // whose record changed (redrawImages).
  redraw?: (source: string) => boolean,
): LiveState {
  const ranges = cached ?? regionRanges(state);
  const firstLine = firstVisibleLine(state);
  const rhythm = docRhythmOf(state, state.field(printMetricsField, false));
  const keys = new Map<number, { key: string; source: string }>();
  const builder = new RangeSetBuilder<Decoration>();
  const protectedLines: ProtectedLine[] = [];
  const boxes: BoxInfo[] = [];
  const atomicRanges: { from: number; to: number }[] = [];
  for (const r of ranges) {
    // Derived reveal: a region the selection touches opens for editing IN
    // PLACE, still looking like the block. Fence lines never show as syntax —
    // the open fence becomes the block's real chrome (a callout's title bar,
    // a kicker) and the close fence a silent end cap; leaf lines (stats) and
    // embeds stay fully rendered; only the prose lines are editable text,
    // painted with the innermost block's ground. The fence and leaf lines are
    // recorded as PROTECTED: a transaction filter refuses user edits that
    // touch them, so the attrs are reachable only through the toolbar.
    const touched = selectionTouches(state, r.from, r.to);
    // No region reveals its source any more: every block edits IN PLACE in
    // its rendered form (paragraph/cell/label editors below), so the caret
    // inside a region shows as the widget's active ring. Live preview off remains
    // the raw-source view. buildRevealedRegion is kept for a possible explicit
    // keyboard-driven source mode.
    void buildRevealedRegion;
    protectedLines.push({
      from: r.from,
      to: r.to,
      regionFrom: r.from,
      regionTo: r.to,
    });
    const source = state.sliceDoc(r.from, r.to);
    const isPageSetup = r.region.kind === "leaf" &&
      r.region.fence?.name === "report";
    if (isPageSetup) {
      atomicRanges.push({
        from: r.from,
        to: Math.min(r.to + 1, state.doc.length),
      });
    }
    const isToc = r.region.kind === "leaf" &&
      r.region.fence?.name === "contents";
    // A page break renders as nothing on the page; the leaf widget draws its
    // labelled divider so the author can see and delete it.
    const isPagebreak = r.region.kind === "leaf" &&
      r.region.fence?.name === "pagebreak";
    const before = prev?.keys.get(r.region.startLine);
    const carried = before !== undefined &&
        (before.source === source || (keepActive && touched))
      ? before.key
      : undefined;
    const sourceKey = redraw?.(source)
      ? `${rev}\u0000${source}`
      : carried ?? (touched ? `${rev}\u0000${source}` : source);
    keys.set(r.region.startLine, { key: sourceKey, source });
    const gapTop = rhythm.gapTop.get(r.region.startLine) ?? 0;
    const widget = isPageSetup
      ? new PageSetupWidget(source, r.region.startLine)
      : isToc
      ? new LeafRenderWidget(
        source,
        r.region.startLine + 1,
        tocOutlineKey(state.doc.toString(), r.region.fence),
        gapTop,
      )
      : isPagebreak
      ? new LeafRenderWidget(source, r.region.startLine + 1, "", gapTop)
      : new RegionWidget(
        r.region.kind,
        source,
        r.region.startLine,
        r.region.endLine,
        resolver,
        // A text-free region with the caret inside stays rendered — the ring
        // is its only sign of selection, since there is no source to show.
        touched,
        firstLine !== undefined && r.region.startLine + 1 === firstLine,
        sourceKey,
        gapTop,
      );
    builder.add(r.from, r.to, Decoration.replace({ widget, block: true }));
  }
  const atomicBuilder = new RangeSetBuilder<Decoration>();
  for (const a of atomicRanges) {
    atomicBuilder.add(a.from, a.to, Decoration.replace({}));
  }
  return {
    ranges,
    keys,
    rev,
    deco: builder.finish(),
    protectedLines,
    boxes,
    atomic: atomicBuilder.finish(),
  };
}

export function liveRegionExtensions(resolver: EmbedResolver): Extension[] {
  const field = StateField.define<LiveState>({
    create(state) {
      return buildLiveState(state, resolver);
    },
    update(value, tr) {
      const redraw = tr.effects.find((e) => e.is(redrawImages));
      if (redraw?.is(redrawImages)) {
        // Only the regions that name a changed image: a figure's widget must
        // not be rebuilt for it (a chart re-mounts when its widget does).
        const tokens = redraw.value.map((id) => `image:${id}`);
        return buildLiveState(
          tr.state,
          resolver,
          undefined,
          value,
          false,
          value.rev + 1,
          (source) =>
            tokens.some((t) => source.includes(t)) ||
            redraw.value.some((id) =>
              source.includes(id) && /:::logos/.test(source)
            ),
        );
      }
      if (tr.effects.some((e) => e.is(rebuildRegions))) {
        return buildLiveState(
          tr.state,
          resolver,
          undefined,
          undefined,
          false,
          value.rev + 1,
        );
      }
      // Print's margins landing (or changing with the theme) move the gap
      // above a block that has no blank line over it.
      if (tr.effects.some((e) => e.is(setPrintMetrics))) {
        return buildLiveState(tr.state, resolver, undefined, value);
      }
      if (tr.docChanged) {
        return buildLiveState(
          tr.state,
          resolver,
          undefined,
          value,
          tr.annotation(islandCommit) === true,
        );
      }
      if (tr.selection) {
        return buildLiveState(tr.state, resolver, value.ranges, value);
      }
      return value;
    },
    provide: (f) => [
      EditorView.decorations.from(f, (v) => v.deco),
      EditorView.atomicRanges.of((view) => view.state.field(f).atomic),
    ],
  });

  // The structure guard: USER edits (typing, deleting, pasting — anything
  // carrying a userEvent annotation) may not touch a protected line, so the
  // fences and their attrs are only reachable through the toolbar and other
  // specialised controls. Everything programmatic — the toolbar's
  // setBlockAttrs, the AI's rebased hunks, remote yCollab transactions —
  // carries no userEvent and passes untouched. One exception: a change that
  // swallows an ENTIRE region (fences and all) is a clean block delete and
  // stays a legitimate user gesture.
  const guard = CMEditorState.transactionFilter.of((tr) => {
    if (!tr.docChanged) return tr;
    if (!tr.annotation(Transaction.userEvent)) return tr;
    const prot = tr.startState.field(field).protectedLines;
    if (prot.length === 0) return tr;
    let blocked = false;
    tr.changes.iterChangedRanges((fromA, toA) => {
      if (blocked) return;
      for (const pr of prot) {
        if (toA < pr.from || fromA > pr.to) continue;
        if (fromA <= pr.regionFrom && toA >= pr.regionTo) continue;
        blocked = true;
        return;
      }
    });
    return blocked ? [] : tr;
  });

  // The boxes: one absolutely-positioned element per box-worthy revealed
  // frame, drawn BELOW the text by a layer (the mechanism selection
  // backgrounds use). It carries the block's REAL sheet classes, so the
  // theme's borders, radius and shadows match the preview exactly — and
  // because a layer element is absolutely positioned, the structural classes'
  // margins are inert here.
  const boxLayer = layer({
    above: false,
    class: "cm-fm-box-layer",
    update: (u) =>
      u.docChanged || u.selectionSet || u.geometryChanged || u.viewportChanged,
    markers(view) {
      const boxes = view.state.field(field).boxes;
      if (boxes.length === 0) return [];
      const scrollRect = view.scrollDOM.getBoundingClientRect();
      const base = {
        left: scrollRect.left - view.scrollDOM.scrollLeft,
        top: scrollRect.top - view.scrollDOM.scrollTop,
      };
      const contentRect = view.contentDOM.getBoundingClientRect();
      // The sheet's text inset is computed CSS (the bleed-pad formula) — read
      // it rather than duplicating the calculation in pixels.
      const padX = parseFloat(getComputedStyle(view.contentDOM).paddingLeft) ||
        0;
      const out: RectangleMarker[] = [];
      for (const b of boxes) {
        if (
          b.openLine1 > view.state.doc.lines ||
          b.endLine1 > view.state.doc.lines
        ) continue;
        const openBlock = view.lineBlockAt(
          view.state.doc.line(b.openLine1).from,
        );
        const endBlock = view.lineBlockAt(view.state.doc.line(b.endLine1).from);
        const top = openBlock.top + view.documentTop - base.top + FM_BOX_GAP;
        const bottom = endBlock.bottom + view.documentTop - base.top -
          (b.capped ? FM_BOX_GAP : 0);
        if (bottom <= top) continue;
        const inset = padX + (b.depth - 1) * FM_BOX_INSET;
        out.push(
          new RectangleMarker(
            `cm-fm-box ${b.classes}`,
            contentRect.left - base.left + inset,
            top,
            contentRect.width - 2 * inset,
            bottom - top,
          ),
        );
      }
      return out;
    },
  });

  // Enter with the caret PARKED in a region (a click on a widget parks it
  // on the block's first line; the guard refuses typing there): a blank
  // line opens beside the block — above it, so the block moves down, or
  // below it when the caret stands at the region's very end — and the
  // caret lands on that line. Without this, a tiles row of stats, a figure
  // or a table at the end of a document had no way to get a line after it
  // from the keyboard. Dispatched without a userEvent, so the guard lets
  // the insertion at the region's edge through; undo sees it as any edit.
  const enterBeside = Prec.high(keymap.of([{
    key: "Enter",
    run: (view) => {
      const sel = view.state.selection.main;
      if (!sel.empty || view.state.readOnly) return false;
      const r = view.state.field(field).ranges.find((x) =>
        x.from <= sel.head && sel.head <= x.to
      );
      if (r === undefined) return false;
      if (r.region.kind === "leaf" && r.region.fence?.name === "report") {
        return false;
      }
      const below = sel.head >= r.to;
      const at = below ? r.to : r.from;
      view.dispatch({
        changes: { from: at, insert: "\n" },
        selection: { anchor: below ? at + 1 : at },
        scrollIntoView: true,
      });
      return true;
    },
  }]));

  return [field, guard, boxLayer, enterBeside];
}

// ── Surface lines (heading scale) ────────────────────────────────────────────

const HEADING_LINE_RE = /^(#{1,6})\s/;

// Whole-doc StateField, not a viewport plugin: heading classes change LINE
// HEIGHT, and height-affecting decorations must exist for off-screen lines or
// scroll estimates jitter.
const surfaceLineField = StateField.define<DecorationSet>({
  create: buildSurfaceLines,
  update(deco, tr) {
    return tr.docChanged || tr.effects.some((e) => e.is(setPrintMetrics))
      ? buildSurfaceLines(tr.state)
      : deco;
  },
  provide: (f) => EditorView.decorations.from(f),
});

const LIST_LINE_RE = /^\s*(?:[-*+]|\d+[.)])\s/;
// A list line's depth from its indentation: two spaces nest a bullet, three
// an ordered item (their content offsets); the same rounding serves both.
export function listDepthOf(text: string): number {
  const indent =
    (/^[ \t]*/.exec(text)?.[0] ?? "").replace(/\t/g, "    ").length;
  return Math.min(4, 1 + Math.round(indent / 2.5));
}
const listDepthCls = (text: string) => {
  const d = listDepthOf(text);
  return d > 1 ? ` cm-fm-li-d${d}` : "";
};

// `1. ` / `1.1 ` in front of a numbered section. The rendered document gets
// these from a CSS counter on the renderer's fm-numbered--sec/--sub; the
// editor's own heading lines are
// cm-lines rather than real headings, so the same numbers are computed here —
// doc-wide, since a viewport-scoped counter would count only what is on
// screen and renumber as you scroll.
class SectionNumberWidget extends WidgetType {
  constructor(readonly text: string) {
    super();
  }
  override eq(other: SectionNumberWidget): boolean {
    return other.text === this.text;
  }
  override toDOM(): HTMLElement {
    const dom = document.createElement("span");
    dom.className = "cm-fm-secnum";
    dom.textContent = this.text;
    dom.contentEditable = "false";
    return dom;
  }
}

function buildSurfaceLines(state: EditorState): DecorationSet {
  const ranges: Range<Decoration>[] = [];
  // Section numbering is a document setting; a heading inside a block is not
  // a section, so only depth-0 headings are numbered here, at the level the
  // document writes its sections (the shallowest depth-0 heading, as the
  // renderer's fastrSectionLevel reads it) and the one below. A page
  // template's heading is a section too: its widget draws it, but it counts,
  // so the sections after it carry print's numbers.
  const numbered = readFastrDocumentSettings(state.doc.sliceString(0, 4096))
    .className.includes("fm-doc--numbered");
  let secLevel = 0;
  if (numbered) {
    let d = 0;
    for (
      const { text, inCode, fence } of scanContainerLines(
        state.doc.iterLines(1, state.doc.lines + 1),
      )
    ) {
      if (inCode) continue;
      if (fence) {
        if (fence.kind === "open") {
          if (!isFastrLeafBlock(fence.name)) d++;
        } else d = Math.max(0, d - 1);
        continue;
      }
      const h = d === 0 ? HEADING_LINE_RE.exec(text) : null;
      if (h && (secLevel === 0 || h[1].length < secLevel)) {
        secLevel = h[1].length;
      }
    }
    if (secLevel === 0) secLevel = 2;
  }
  let depth = 0;
  let sec = 0;
  let sub = 0;
  // Inside a page template whose heading has not been counted yet.
  let templateHeading = false;
  // The document's vertical rhythm: what every blank line, line of space
  // and unseparated block edge measures, from print's margins.
  const rhythm = docRhythmOf(state, state.field(printMetricsField, false));
  // Blank lines ABOVE the first visible block render nothing in View, so they
  // must not open the editor with a strip of page ground. Only collapsed when
  // there IS content below them — an all-blank document keeps its clickable
  // lines.
  const firstLine = rhythm.firstVisible === undefined
    ? undefined
    : rhythm.firstVisible + 1;
  const px = (v: number) => `${snapPx(v)}px`;
  const gapCls = (index: number) =>
    rhythm.gapTop.has(index) ? " cm-fm-gap" : "";
  const gapAttrs = (index: number) => {
    const g = rhythm.gapTop.get(index);
    return g === undefined ? undefined : { style: `--fm-gap-top: ${px(g)}` };
  };
  // The first blank line after content is the paragraph separator; each
  // further one is a line of space, as the renderer's fm_spaces makes it.
  let prevBlank = false;
  // Every line of an aligned paragraph takes its paragraph's alignment
  // (the suffix is on the last line, so it is read ahead of the loop).
  const aligns = fastrParagraphAligns([
    ...state.doc.iterLines(1, state.doc.lines + 1),
  ]);
  // scanContainerLines flags code-fence interiors, where a # line is content.
  for (
    const { index, text, inCode, fence } of scanContainerLines(
      state.doc.iterLines(1, state.doc.lines + 1),
    )
  ) {
    const from = state.doc.line(index + 1).from;
    if (inCode) {
      // A fenced code block as print's pre: the fence lines are its padding
      // rows, the code lines its rows with the code in a monospace span
      // (report_fastr_css.ts). A blank line inside is code, not a separator.
      prevBlank = false;
      const f = rhythm.fenceAt.get(index);
      if (f !== undefined) {
        ranges.push(
          Decoration.line({
            class: `cm-fm-code-fence cm-fm-code-${f}${
              f === "open" ? gapCls(index) : ""
            }`,
            attributes: f === "open" ? gapAttrs(index) : undefined,
          }).range(from),
        );
      } else {
        ranges.push(Decoration.line({ class: "cm-fm-code-line" }).range(from));
        if (text.length > 0) {
          ranges.push(
            Decoration.mark({ class: "cm-fm-codetext" }).range(
              from,
              from + text.length,
            ),
          );
        }
      }
      continue;
    }
    if (fence) {
      // Leaf fences (a stat, the header, a contents block) open nothing.
      if (fence.kind === "open") {
        if (!isFastrLeafBlock(fence.name)) depth++;
        if (fence.name === "page" && depth === 1) templateHeading = true;
      } else {
        depth = Math.max(0, depth - 1);
        if (depth === 0) templateHeading = false;
      }
    }
    const blank = text.trim().length === 0;
    if (blank) {
      // A blank source line is View's paragraph margin, collapsed with the
      // neighbouring block's (--fm-gap, the rhythm), not a full text line. A
      // second blank line in a row is a line of space (full height), the
      // last of them carrying the next block's top margin under it.
      const lead = firstLine !== undefined && index + 1 < firstLine;
      const first = !prevBlank;
      const g = rhythm.blankGap.get(index);
      const sb = rhythm.spaceBottom.get(index);
      const style = lead
        ? undefined
        : first
        ? (g === undefined ? undefined : `--fm-gap: ${px(g)}`)
        : (sb === undefined ? undefined : `--fm-gap-bottom: ${px(sb)}`);
      ranges.push(
        Decoration.line({
          class: lead
            ? "cm-fm-blank cm-fm-lead"
            : first
            ? "cm-fm-blank"
            : "cm-fm-space",
          attributes: style === undefined ? undefined : { style },
        }).range(from),
      );
      prevBlank = !lead;
      continue;
    }
    prevBlank = false;
    if (index + 1 === firstLine) {
      ranges.push(Decoration.line({ class: "cm-fm-first" }).range(from));
    }
    // A heading's own suffix aligns its line (paragraphs come from `aligns`).
    const align = aligns.get(index) ??
      (HEADING_LINE_RE.test(text)
        ? fastrAlignSuffixOf(text)?.align
        : undefined);
    if (align !== undefined) {
      ranges.push(
        Decoration.line({ class: `cm-fm-align-${align}` }).range(from),
      );
    }
    const m = HEADING_LINE_RE.exec(text);
    if (m) {
      ranges.push(
        Decoration.line({
          class: `cm-fm-h${m[1].length}${gapCls(index)}`,
          attributes: gapAttrs(index),
        })
          .range(from),
      );
      const level = m[1].length;
      if (numbered && depth > 0 && templateHeading) {
        templateHeading = false;
        sec++;
        sub = 0;
      }
      if (
        numbered && depth === 0 &&
        (level === secLevel || level === secLevel + 1)
      ) {
        if (level === secLevel) {
          sec++;
          sub = 0;
        } else {
          sub++;
        }
        ranges.push(
          Decoration.widget({
            widget: new SectionNumberWidget(
              level === secLevel ? `${sec}. ` : `${sec}.${sub} `,
            ),
            side: -1,
          }).range(from),
        );
      }
    } else if (LIST_LINE_RE.test(text)) {
      ranges.push(
        Decoration.line({
          class: `cm-fm-li${listDepthCls(text)}${
            rhythm.liNext.has(index) ? " cm-fm-li-next" : ""
          }${gapCls(index)}`,
          attributes: gapAttrs(index),
        }).range(from),
      );
    } else if (/^\s*>\s?/.test(text)) {
      ranges.push(
        Decoration.line({
          class: `cm-fm-bq${
            rhythm.bqFirst.has(index) ? " cm-fm-bq-first" : ""
          }${rhythm.bqLast.has(index) ? " cm-fm-bq-last" : ""}${gapCls(index)}`,
          attributes: gapAttrs(index),
        }).range(from),
      );
    } else if (rhythm.gapTop.has(index)) {
      ranges.push(
        Decoration.line({ class: "cm-fm-gap", attributes: gapAttrs(index) })
          .range(from),
      );
    }
    // `[x]{.role}` / `[x]{size=12}` label styling — here and not in the
    // conceal plugin because a font-size changes LINE HEIGHT, and
    // height-affecting decorations must exist for off-screen lines or scroll
    // estimates jitter (the same rule that puts heading classes here). The
    // conceal plugin hides the markers; this styles the phrase between them.
    MARK_RE.lastIndex = 0;
    let mm: RegExpExecArray | null;
    while ((mm = MARK_RE.exec(text)) !== null) {
      const attrs = parseFastrMarkAttrs(mm[2]);
      // Mark decorations may not be empty — a bare `[]{.role}` styles nothing.
      if (!attrs || mm[1].length === 0) continue;
      // Inside inline code the renderer keeps the syntax literal, so the
      // styling must too (same check the conceal makes).
      const nodeAt = syntaxTree(state).resolveInner(from + mm.index, 1);
      if (/Code/.test(nodeAt.name)) continue;
      ranges.push(
        Decoration.mark({
          class: fastrMarkClass(attrs),
          attributes: fastrMarkStyle(attrs) === ""
            ? undefined
            : { style: fastrMarkStyle(attrs) },
        }).range(from + mm.index + 1, from + mm.index + 1 + mm[1].length),
      );
    }
  }
  return Decoration.set(ranges, true);
}

// ── Inline conceal ───────────────────────────────────────────────────────────

// How long the conceal set may spend pushing the parser forward to the end of
// what is on screen, per visible range. Generous: a 145KB report parses whole
// in about 18ms and the parser keeps what it did, so this is paid once on the
// way down a document rather than per scroll.
const CONCEAL_PARSE_BUDGET_MS = 50;

// `[label]{…}` — parseFastrMarkAttrs decides whether the braces make it a
// mark (role, size, or both); anything else stays literal text.
const MARK_RE = /\[([^\]]*)\]\{([^}]*)\}/g;

// A thematic break renders as the theme's own rule (the hr element picks up
// the scoped sheet), revealing its --- source only while the caret touches it.
class HrWidget extends WidgetType {
  override toDOM(): HTMLElement {
    const dom = document.createElement("div");
    // Print's hr: the rule alone (its margins are the blank lines' beside
    // it, docRhythmOf), with a click target that takes no room.
    dom.className = "w-full cm-fm-hr";
    dom.style.display = "flow-root";
    dom.contentEditable = "false";
    dom.appendChild(document.createElement("hr"));
    return dom;
  }
  override eq(): boolean {
    return true;
  }
  override get estimatedHeight(): number {
    return 34;
  }
}
const HR = new HrWidget();

class BulletWidget extends WidgetType {
  // An ordered item's own marker text ("3."), or none for a bullet: the
  // theme's glyph (--fm-bullet), drawn by the sheet as print draws it.
  constructor(readonly text = "") {
    super();
  }
  override toDOM(): HTMLElement {
    const el = document.createElement("span");
    el.className = this.text === ""
      ? "cm-fm-bullet cm-fm-bullet--glyph"
      : "cm-fm-bullet";
    el.textContent = this.text;
    return el;
  }
  override eq(other: BulletWidget): boolean {
    return other.text === this.text;
  }
}
const BULLET = new BulletWidget();

function buildConceal(
  view: EditorView,
  atomicOut: { from: number; to: number }[],
): DecorationSet {
  const { state } = view;
  const conceal = Decoration.replace({});
  const ranges: {
    from: number;
    to: number;
    deco: Decoration;
    replace: boolean;
  }[] = [];
  const add = (from: number, to: number, deco: Decoration, replace = true) => {
    if (to > from || deco.spec.widget) ranges.push({ from, to, deco, replace });
  };
  // Reveal rule: the construct shows its syntax while the selection touches
  // its full range — Obsidian semantics.
  const revealed = (from: number, to: number) =>
    selectionTouches(state, from, to);

  for (const { from, to } of view.visibleRanges) {
    // The tree, parsed as far as this range when it is not already. This is
    // the reason a heading arrived wearing its `#`: CodeMirror parses about
    // 3KB up front and the rest in a background pseudo-thread, so scrolling
    // into a part of a long report the parser had not reached yet iterated an
    // EMPTY tree here. No HeaderMark, no conceal, and every heading on screen
    // showed its marker until something else rebuilt the set. Forcing the
    // parse to the visible end is cheap (a 145KB report parses in about 18ms,
    // once, and the parse is incremental after that), and the budget keeps a
    // pathological document from blowing a frame: whatever it does not reach
    // arrives through the tree-change check in ConcealPluginValue.update.
    const tree = ensureSyntaxTree(state, to, CONCEAL_PARSE_BUDGET_MS) ??
      syntaxTree(state);
    tree.iterate({
      from,
      to,
      enter(node) {
        switch (node.name) {
          case "ATXHeading1":
          case "ATXHeading2":
          case "ATXHeading3":
          case "ATXHeading4":
          case "ATXHeading5":
          case "ATXHeading6": {
            // Heading markers NEVER reveal (same rule as role marks): the
            // toolbar owns heading levels, so the `#` stays hidden with the
            // caret on the line, and the atomic range makes the caret skip
            // it — with the nice side effect that Backspace at the text
            // start removes the whole marker (heading -> paragraph).
            const mark = node.node.getChild("HeaderMark");
            if (mark) {
              const to = Math.min(mark.to + 1, node.to);
              add(mark.from, to, conceal);
              atomicOut.push({ from: mark.from, to });
            }
            return;
          }
          case "StrongEmphasis":
          case "Emphasis": {
            // Emphasis markers NEVER reveal (same rule as headings and role
            // marks): the toolbar owns bold/italic, the styled text is the
            // display, and the atomic markers keep the caret out of the
            // invisible syntax.
            for (const mark of node.node.getChildren("EmphasisMark")) {
              add(mark.from, mark.to, conceal);
              atomicOut.push({ from: mark.from, to: mark.to });
            }
            return;
          }
          case "InlineCode": {
            if (revealed(node.from, node.to)) return;
            const marks = node.node.getChildren("CodeMark");
            if (marks.length >= 2) {
              add(marks[0].from, marks[0].to, conceal);
              add(
                marks[0].to,
                marks[marks.length - 1].from,
                Decoration.mark({ class: "cm-fm-code" }),
                false,
              );
              add(
                marks[marks.length - 1].from,
                marks[marks.length - 1].to,
                conceal,
              );
            }
            return;
          }
          case "Link": {
            // A bracket followed by a mark block ({.role}, {size=12}) is a
            // MARK, not a link — the Lezer grammar still tokenizes the
            // shortcut-reference form, and claiming it here would both paint
            // link styling and knock out the mark conceal's tail in the
            // overlap dedupe below.
            const tail = state.sliceDoc(
              node.to,
              Math.min(node.to + 40, state.doc.length),
            );
            const markTail = /^\{([^}]*)\}/.exec(tail);
            if (markTail && parseFastrMarkAttrs(markTail[1])) return;
            if (revealed(node.from, node.to)) return;
            // Only a REAL link (with a URL) conceals and takes link styling.
            // Lezer also tokenizes bare [bracketed text] as a shortcut
            // reference; with no definition the renderer leaves it literal,
            // so the editor must too.
            if (!node.node.getChild("URL")) return;
            const marks = node.node.getChildren("LinkMark");
            if (marks.length >= 2) {
              // [label](url) → show only the label, styled as a link.
              add(marks[0].from, marks[0].to, conceal);
              add(
                marks[0].to,
                marks[1].from,
                Decoration.mark({ class: "cm-fm-link" }),
                false,
              );
              add(marks[1].from, node.to, conceal);
            }
            return;
          }
          case "HorizontalRule": {
            if (revealed(node.from, node.to)) return;
            add(
              node.from,
              node.to,
              Decoration.replace({ widget: HR, block: false }),
            );
            return;
          }
          case "QuoteMark": {
            // The `>` of a plain markdown quote; the line class supplies the
            // preview's blockquote indent.
            if (revealed(node.from, node.to)) return;
            add(
              node.from,
              Math.min(node.to + 1, state.doc.length),
              conceal,
            );
            return;
          }
          case "ListMark": {
            // The marker becomes a glyph drawn in the line's indent (a
            // bullet, or the ordered marker's own text), and the item's
            // indentation and the space after the marker go with it: the
            // text then starts at the padding edge, where print's does.
            if (revealed(node.from, node.to)) return;
            const mark = state.sliceDoc(node.from, node.to);
            const line = state.doc.lineAt(node.from);
            const from = /^\s*$/.test(state.sliceDoc(line.from, node.from))
              ? line.from
              : node.from;
            const to = state.sliceDoc(node.to, node.to + 1) === " "
              ? node.to + 1
              : node.to;
            add(
              from,
              to,
              Decoration.replace({
                widget: /^[-*+]$/.test(mark) ? BULLET : new BulletWidget(mark),
              }),
            );
            return;
          }
        }
      },
    });

    // A paragraph's `{align=…}` (fastr_paragraph_align.ts): hidden like a
    // mark's attributes and atomic, on the paragraph's last line only (the
    // one the renderer reads it from), never in code. The toolbar owns it.
    for (let pos = from; pos <= to;) {
      const line = state.doc.lineAt(pos);
      pos = line.to + 1;
      const suffix = fastrAlignSuffixOf(line.text);
      if (suffix === undefined) continue;
      const heading = HEADING_LINE_RE.test(line.text);
      if (!heading && !isFastrProseLine(line.text)) continue;
      if (!heading && line.number < state.doc.lines) {
        const next = state.doc.line(line.number + 1).text;
        if (
          isFastrProseLine(next) && parseContainerFence(next) === undefined
        ) continue;
      }
      // In an empty `# {align=…}` the marker's space stays the marker's.
      const start = line.from + (fastrSuffixInsertOffset(line.text) ?? 0);
      if (/Code/.test(tree.resolveInner(start, 1).name)) continue;
      add(start, line.to, conceal);
      atomicOut.push({ from: start, to: line.to });
    }

    // `[x]{.role}` / `[x]{size=12}` is FASTR syntax the Lezer grammar doesn't
    // know — regex over the visible text, skipping code (the tree query above
    // would be costly per match; code spans render the syntax anyway, which
    // is correct). Mark markers NEVER reveal: the phrase stays styled even
    // with the caret inside it (the toolbar owns the attributes), and the
    // hidden markers are ATOMIC so the caret steps over them instead of
    // sitting invisibly inside. The label's own styling (class + font-size)
    // lives in surfaceLineField, NOT here: a size changes LINE HEIGHT, and
    // height-affecting decorations must exist for off-screen lines too.
    const text = state.sliceDoc(from, to);
    MARK_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = MARK_RE.exec(text)) !== null) {
      if (!parseFastrMarkAttrs(m[2])) continue;
      const start = from + m.index;
      const end = start + m[0].length;
      // Inside code spans/fences the renderer keeps the syntax literal, so
      // the conceal must too.
      const nodeAt = tree.resolveInner(start, 1);
      if (/Code/.test(nodeAt.name)) continue;
      add(start, start + 1, conceal);
      add(start + 1 + m[1].length, end, conceal);
      atomicOut.push({ from: start, to: start + 1 });
      atomicOut.push({ from: start + 1 + m[1].length, to: end });
    }
  }
  ranges.sort((a, b) => a.from - b.from || a.to - b.to);
  const builder = new RangeSetBuilder<Decoration>();
  // Replace decorations may not overlap each other; marks may overlap freely.
  let lastConcealEnd = -1;
  for (const r of ranges) {
    if (r.replace) {
      if (r.from < lastConcealEnd) continue;
      lastConcealEnd = r.to;
    }
    builder.add(r.from, r.to, r.deco);
  }
  return builder.finish();
}

class ConcealPluginValue {
  decorations: DecorationSet;
  // Concealed role markers — atomic so the caret skips over the invisible
  // syntax rather than sitting inside it.
  atomic: DecorationSet;
  constructor(view: EditorView) {
    [this.decorations, this.atomic] = buildConcealSets(view);
  }
  update(u: ViewUpdate) {
    // The tree comparison is not optional: background parsing reaches the
    // view as `view.dispatch({})` (forceParsing in @codemirror/language), an
    // update with no doc, selection or viewport change, so without this a
    // conceal set built from a tree that fell short of the viewport was never
    // rebuilt and the `#` stayed on screen until an unrelated update nudged
    // it. Trees are immutable and shared, so the check is an identity test.
    if (
      u.docChanged || u.selectionSet || u.viewportChanged ||
      syntaxTree(u.startState) !== syntaxTree(u.state)
    ) {
      [this.decorations, this.atomic] = buildConcealSets(u.view);
    }
  }
}

function buildConcealSets(view: EditorView): [DecorationSet, DecorationSet] {
  const atomic: { from: number; to: number }[] = [];
  const deco = buildConceal(view, atomic);
  const builder = new RangeSetBuilder<Decoration>();
  atomic.sort((a, b) => a.from - b.from);
  for (const r of atomic) builder.add(r.from, r.to, Decoration.replace({}));
  return [deco, builder.finish()];
}

const concealPlugin = ViewPlugin.fromClass(ConcealPluginValue, {
  decorations: (v) => v.decorations,
  provide: (plugin) =>
    EditorView.atomicRanges.of((view) =>
      view.plugin(plugin)?.atomic ?? Decoration.none
    ),
});

// Deleting or typing over a formatted phrase: its hidden markers go with its
// last word or stay with the words left, never alone; a line break typed or
// pasted inside one closes it before the break and reopens it after
// (fastrMarkAwareChange).
// One user edit at a time, as the keyboard makes them; a multi-cursor or
// programmatic change passes through untouched.
const markAwareEdits = CMEditorState.transactionFilter.of((tr) => {
  if (
    !tr.docChanged || !(tr.isUserEvent("delete") || tr.isUserEvent("input"))
  ) {
    return tr;
  }
  let single: { from: number; to: number; insert: string } | undefined;
  let count = 0;
  tr.changes.iterChanges((fromA, toA, _fromB, _toB, inserted) => {
    count++;
    single = { from: fromA, to: toA, insert: inserted.toString() };
  });
  if (count !== 1 || !single) return tr;
  const doc = tr.startState.doc;
  const first = doc.lineAt(single.from);
  const last = doc.lineAt(single.to);
  const base = first.from;
  const edit = fastrMarkAwareChange(
    doc.sliceString(first.from, last.to),
    single.from - base,
    single.to - base,
    single.insert,
  );
  if (!edit || (edit.deletes.length === 0 && edit.insert.length === 0)) {
    return tr;
  }
  const changes: { from: number; to?: number; insert?: string }[] = edit.deletes
    .map(
      ([a, b]) => ({ from: base + a, to: base + b }),
    );
  if (edit.insert.length > 0) {
    changes.push({ from: base + edit.insertAt, insert: edit.insert });
  }
  const set = tr.startState.changes(changes);
  const caret = set.mapPos(
    edit.insert.length > 0 || edit.deletes.length === 0
      ? base + edit.insertAt
      : base + edit.deletes[0][0],
    1,
  );
  return {
    changes: set,
    selection: EditorSelection.cursor(caret),
    userEvent: tr.annotation(Transaction.userEvent),
    scrollIntoView: tr.scrollIntoView,
  };
});

// Typing against a paragraph's hidden `{align=…}`: text typed at the line's
// visible end (or after End) goes in front of the suffix, and a line break
// that splits the paragraph gives both halves the alignment
// (fastrAlignAwareInsert). Plain inserts only, one at a time; a deletion or
// replacement passes through.
const alignAwareEdits = CMEditorState.transactionFilter.of((tr) => {
  if (!tr.docChanged || !tr.isUserEvent("input")) return tr;
  let single: { from: number; to: number; insert: string } | undefined;
  let count = 0;
  tr.changes.iterChanges((fromA, toA, _fromB, _toB, inserted) => {
    count++;
    single = { from: fromA, to: toA, insert: inserted.toString() };
  });
  if (count !== 1 || !single) return tr;
  const doc = tr.startState.doc;
  // Enter's own newline command trims the whitespace it splits at; at the
  // start of a suffix's line that is the suffix's separating space, so a
  // whitespace-only deletion that comes with a line break is kept.
  if (single.to !== single.from) {
    const gone = doc.sliceString(single.from, single.to);
    if (!/^[ \t]+$/.test(gone) || !single.insert.includes("\n")) return tr;
  }
  // The paragraph around the insert only: a few lines, not the document.
  const line = doc.lineAt(single.from);
  let a = line.number;
  while (a > 1 && isFastrProseLine(doc.line(a - 1).text)) a--;
  let b = line.number;
  while (b < doc.lines && isFastrProseLine(doc.line(b + 1).text)) b++;
  const base = doc.line(a).from;
  const r = fastrAlignAwareInsert(
    doc.sliceString(base, doc.line(b).to),
    single.from - base,
    single.insert,
  );
  if (r === undefined) return tr;
  const changes = [{ from: base + r.at, insert: r.insert }];
  if (r.extra) {
    changes.push({ from: base + r.extra.at, insert: r.extra.insert });
  }
  const set = tr.startState.changes(changes);
  return {
    changes: set,
    selection: EditorSelection.cursor(set.mapPos(base + r.at, 1)),
    userEvent: tr.annotation(Transaction.userEvent),
    scrollIntoView: tr.scrollIntoView,
  };
});

// A space typed right in front of a paragraph's hidden `{align=…}` never
// reaches the document when the browser types it (the DOM has nowhere
// visible to put a trailing space before a concealed range, and no input
// event follows), so "Second para." came out as "Secondpara.". The key
// itself inserts it there instead; letters arrive as usual.
const alignEdgeSpace = Prec.high(keymap.of([{
  key: "Space",
  run: (view) => {
    const sel = view.state.selection.main;
    if (!sel.empty || view.state.readOnly) return false;
    const line = view.state.doc.lineAt(sel.head);
    const offset = fastrSuffixInsertOffset(line.text);
    if (offset === undefined || sel.head < line.from + offset) return false;
    const at = line.from + offset;
    view.dispatch({
      changes: { from: at, insert: " " },
      selection: EditorSelection.cursor(at + 1),
      userEvent: "input.type",
      scrollIntoView: true,
    });
    return true;
  },
}]));

// ── Peer presence on collapsed regions ───────────────────────────────────────
// yCollab draws remote carets in TEXT; a caret inside a collapsed region has
// no text to sit in, so the widget itself carries the peer's colour and name.
// DOM-only writes (no dispatch), recomputed on awareness change and doc
// change — never on local cursor movement.

export type PresenceDeps = { yText: Y.Text; awareness: Awareness };

// The collab binding, reachable from inside a widget: islands publish their
// own caret through it (y-codemirror publishes only while the CM view has
// focus, and an island takes focus away from it).
const presenceFacet = Facet.define<
  PresenceDeps | undefined,
  PresenceDeps | undefined
>({ combine: (v) => (v.length > 0 ? v[v.length - 1] : undefined) });

// Marks a transaction as an ISLAND's own live commit: the region field keeps
// the active widget's DOM (the island being typed in) instead of rebuilding
// it under the cursor. Remote and toolbar transactions never carry it, so
// those still re-render the region as before.
const islandCommit = Annotation.define<boolean>();

// Forces the region field to rebuild every widget from its current source —
// dispatched when an island closes, so the text it committed live is finally
// rendered rather than shown as the island's raw source.
const rebuildRegions = StateEffect.define<null>();

// The host changed the file behind these image ids: the regions that show
// them draw again (their source, and so their widget key, did not change).
export const redrawImages = StateEffect.define<string[]>();

// An island's closing dispatch, made safe to issue from a blur handler: a
// widget rebuild removes the focused island and Chrome fires its blur while
// CodeMirror's update is still in progress, where a dispatch throws. Deferred
// to a microtask, and skipped when the view is gone.
//
// `unless` is checked at that later tick, not now: Chrome fires the blur
// BEFORE the node is actually detached, so an island asking "am I still in
// the document?" during its own removal is told yes.
function dispatchAfterUpdate(
  view: EditorView,
  spec: Parameters<EditorView["dispatch"]>[0],
  unless?: () => boolean,
) {
  queueMicrotask(() => {
    if (!view.dom.isConnected || unless?.()) return;
    try {
      view.dispatch(spec);
    } catch {
      // A view torn down between the blur and this tick.
    }
  });
}

// Tell peers where this user is while an island (not the CM view) has focus:
// the same `cursor` field yCollab publishes, with relative positions, so the
// peers' caret layer and the region presence border both keep working.
export function publishIslandCaret(
  view: EditorView,
  anchor: number,
  head: number,
) {
  const deps = view.state.facet(presenceFacet);
  if (!deps || !deps.yText.doc) return;
  const clamp = (n: number) => Math.max(0, Math.min(n, deps.yText.length));
  try {
    deps.awareness.setLocalStateField("cursor", {
      anchor: Y.createRelativePositionFromTypeIndex(deps.yText, clamp(anchor)),
      head: Y.createRelativePositionFromTypeIndex(deps.yText, clamp(head)),
    });
  } catch {
    // A destroyed awareness (editor teardown mid-edit) has nothing to tell.
  }
}

// An island losing focus to something outside the editor takes its caret
// with it. yCaretHygiene clears on CodeMirror's own blur, which never comes:
// CodeMirror counted itself unfocused when the island took focus. Focus
// moving to the editor's text or to another island is not leaving: those
// publish their own caret.
function releaseIslandCaret(view: EditorView, e?: FocusEvent): void {
  const next = e?.relatedTarget;
  if (next instanceof Node && view.contentDOM.contains(next)) return;
  const deps = view.state.facet(presenceFacet);
  if (deps) clearOwnedCaret(deps.yText, deps.awareness);
}

// ── Island carry ─────────────────────────────────────────────────────────────
// A widget re-renders whenever its region's source or place changes: a
// collaborator typing in or above the block, the host's applyBody, a closing
// island's rebuild. That throws away the element of the island being typed
// in, focus falls to <body>, and the next keystrokes go nowhere. Islands
// commit as they type, so the document already holds every keystroke; what
// has to survive is WHICH island was open and where its caret stood. Noted
// before the redraw, mapped through the changes, and reopened on the new
// element after it (the way a text island reopens itself after a line break).
type IslandCaret = { pos?: number; offset?: number };
type IslandHandle = {
  // Tells the islands on one source line apart ("text:P", "attr:title",
  // "cell:2", "ghost").
  key: string;
  // The 1-based source line the island stands for, as rendered.
  line1: number;
  // The caret: a document position (in `doc`) where the island's text is
  // source text, else an offset into the island.
  caret: (doc: DocText) => IslandCaret;
  // Open this element as the island, caret where it was.
  open: (caret: IslandCaret) => void;
  // Stop a detached island's listeners without committing anything.
  drop: () => void;
  // Set while carried: a carried island's blur closes nothing.
  carried?: boolean;
};

function setIslandHandle(el: HTMLElement, h: IslandHandle): void {
  (el as unknown as { _fmIsland?: IslandHandle })._fmIsland = h;
}
function islandHandle(el: Element): IslandHandle | undefined {
  return (el as unknown as { _fmIsland?: IslandHandle })._fmIsland;
}
function islandCarried(el: Element): boolean {
  return islandHandle(el)?.carried === true;
}

const islandCarryPlugin = ViewPlugin.fromClass(
  class {
    pending:
      | {
        h: IslandHandle;
        el: HTMLElement;
        linePos: number;
        caret: IslandCaret;
      }
      | undefined;
    constructor(readonly view: EditorView) {}
    // Runs before CodeMirror redraws, while the island is still in place.
    update(u: ViewUpdate) {
      this.pending = undefined;
      if (!u.docChanged && !u.transactions.some((tr) => tr.effects.length)) {
        return;
      }
      // An island's own commit keeps its widget, or reopens the island itself.
      if (
        u.transactions.some((tr) => tr.annotation(islandCommit) !== undefined)
      ) {
        return;
      }
      const el = this.view.root.activeElement;
      if (
        !(el instanceof HTMLElement) || !el.isContentEditable ||
        !this.view.contentDOM.contains(el)
      ) return;
      const h = islandHandle(el);
      const start = u.startState.doc;
      if (!h || h.line1 < 1 || h.line1 > start.lines) return;
      const line = start.line(h.line1);
      // The island's line deleted: the island goes with it.
      const from = u.changes.mapPos(line.from, 1, MapMode.TrackDel);
      const to = u.changes.mapPos(line.to, -1, MapMode.TrackDel);
      if (from === null || to === null) return;
      const caret = h.caret(start);
      this.pending = {
        h,
        el,
        linePos: from,
        caret: {
          offset: caret.offset,
          pos: caret.pos === undefined
            ? undefined
            : u.changes.mapPos(caret.pos, -1),
        },
      };
      h.carried = true;
    }
  },
);

// After the redraw: the island's element kept means nothing to do; else the
// element standing for the same island now is opened in its place.
const islandCarryListener = EditorView.updateListener.of((u) => {
  const plugin = u.view.plugin(islandCarryPlugin);
  const p = plugin?.pending;
  if (!plugin || !p) return;
  plugin.pending = undefined;
  if (p.el.isConnected) {
    p.h.carried = false;
    return;
  }
  p.h.drop();
  const line0 = u.state.doc.lineAt(p.linePos).number - 1;
  for (
    const root of Array.from(
      u.view.contentDOM.querySelectorAll<HTMLElement>("[data-region-line]"),
    )
  ) {
    const start = Number(root.getAttribute("data-region-line"));
    const end = Number(root.getAttribute("data-region-end") ?? start);
    if (line0 < start || line0 > end) continue;
    for (
      const el of Array.from(
        root.querySelectorAll<HTMLElement>(".cm-fm-text-edit, .cm-fm-attr"),
      )
    ) {
      const h = islandHandle(el);
      if (h?.key === p.h.key && h.line1 === line0 + 1) {
        h.open(p.caret);
        return;
      }
    }
  }
  // Nothing stands for it any more: the caret leaves with it.
  releaseIslandCaret(u.view);
});

// An island closing asks for its region to be drawn from source again, but
// not while the author has moved straight into ANOTHER island of the same
// block (a title, then the text under it): that rebuild would throw the new
// island away under the caret. The block is marked instead, and the last of
// its islands to close draws it. False when there is nothing to draw.
function closeIsland(
  view: EditorView,
  el: HTMLElement,
  changed: boolean,
): boolean {
  const region = el.closest<HTMLElement>(".fm-live-region");
  const marks = region as unknown as { _fmDirty?: boolean } | null;
  if (!changed && marks?._fmDirty !== true) return false;
  dispatchAfterUpdate(view, { effects: rebuildRegions.of(null) }, () => {
    if (!el.isConnected) return true;
    const active = docOf(el).activeElement;
    if (
      region && marks && active instanceof HTMLElement && active !== el &&
      active.isContentEditable && region.contains(active)
    ) {
      marks._fmDirty = true;
      return true;
    }
    return false;
  });
  return true;
}

function regionPresencePlugin(deps: PresenceDeps): Extension {
  return ViewPlugin.fromClass(
    class {
      raf = 0;
      onAwareness = () => this.schedule();
      constructor(readonly view: EditorView) {
        deps.awareness.on("change", this.onAwareness);
        this.schedule();
      }
      update(u: ViewUpdate) {
        if (u.docChanged || u.viewportChanged || u.geometryChanged) {
          this.schedule();
        }
      }
      // Coalesced on a plain tick rather than an animation frame: the DOM
      // writes are a few small elements, and a frame can be a long time
      // coming in a background tab (or a headless run), which left a peer's
      // caret sitting where they used to be.
      schedule() {
        if (this.raf) return;
        this.raf = setTimeout(() => {
          this.raf = 0;
          this.paint();
        }, 0) as unknown as number;
      }
      // A peer's caret drawn INSIDE the rendered block, at the place in the
      // text their document position maps to — the same bar-and-name caret
      // yCollab draws in a paragraph, since the block's text is a widget and
      // the text layer cannot reach into it. The whole-widget border is the
      // fallback for a position nothing rendered stands for (a bare fence).
      paint() {
        const widgets = Array.from(
          this.view.dom.querySelectorAll<HTMLElement>("[data-region-line]"),
        );
        for (const w of widgets) {
          w.style.outline = "";
          w.querySelector(":scope > .fm-peer-layer")?.replaceChildren();
        }
        if (widgets.length === 0) return;
        const doc = this.view.state.doc;
        for (const [clientId, s] of deps.awareness.getStates()) {
          if (clientId === deps.awareness.clientID) continue;
          const state = s as {
            cursor?: { head?: unknown } | null;
            user?: { name?: string; color?: string } | null;
          };
          if (!state.cursor?.head || !state.user || !deps.yText.doc) continue;
          let pos: number | undefined;
          try {
            const abs = Y.createAbsolutePositionFromRelativePosition(
              Y.createRelativePositionFromJSON(
                state.cursor.head as Y.RelativePosition,
              ),
              deps.yText.doc,
            );
            if (abs?.type === deps.yText) pos = abs.index;
          } catch {
            continue;
          }
          if (pos === undefined || pos > doc.length) continue;
          const line0 = doc.lineAt(pos).number - 1;
          const target = widgets.find((w) => {
            const start = Number(w.getAttribute("data-region-line"));
            // The widget spans start..end, but only start is on the DOM; the
            // end comes from the next widget or a conservative height check —
            // cheap and exact: ask the region field.
            return start === line0 || this.containsLine(w, line0);
          });
          if (!target) continue;
          const color = state.user.color ?? "#888888";
          if (this.placeCaret(target, pos, color, state.user.name ?? "")) {
            continue;
          }
          target.style.outline = `2px solid ${color}`;
          const layer = target.querySelector<HTMLElement>(
            ":scope > .fm-peer-layer",
          );
          if (layer && !layer.querySelector(".fm-live-presence")) {
            const chip = document.createElement("div");
            chip.className =
              "fm-live-presence pointer-events-none absolute -top-0 right-0 rounded px-1.5 text-xs text-white";
            chip.style.background = color;
            chip.textContent = state.user.name ?? "";
            layer.appendChild(chip);
          }
        }
      }
      containsLine(w: HTMLElement, line0: number): boolean {
        const start = Number(w.getAttribute("data-region-line"));
        const end = Number(w.getAttribute("data-region-end") ?? start);
        return line0 >= start && line0 <= end;
      }
      // Map a document position to a point in the widget's rendered text and
      // draw the caret there. False when nothing rendered stands for it.
      placeCaret(
        widget: HTMLElement,
        pos: number,
        color: string,
        name: string,
      ): boolean {
        const doc = this.view.state.doc;
        const line = doc.lineAt(pos);
        const start = Number(widget.getAttribute("data-region-line"));
        const rel = line.number - 1 - start;
        const col = pos - line.from;
        // The element rendered for this source line: prose first (a paragraph,
        // heading, list item), then a table row, whose cell the pipes name.
        let anchor: HTMLElement | null = null;
        let offset = 0;
        const prose = Array.from(
          widget.querySelectorAll<HTMLElement>(`[data-line="${rel}"]`),
        ).find((el) => /^(P|H[1-6]|LI|BLOCKQUOTE)$/.test(el.tagName));
        if (prose) {
          anchor = prose;
          offset = prose.isContentEditable
            // An open island shows the raw source (syntax in hidden spans):
            // its text IS the line, so the column is the offset.
            ? col
            : fastrStripInlineSyntax(
              line.text.slice(linePrefixLength(line.text), col),
            ).length;
        } else {
          const row = Array.from(
            widget.querySelectorAll<HTMLElement>(`tr[data-line="${rel}"]`),
          )[0];
          if (row) {
            const slices = cellSlices(line.text);
            const idx = Math.max(
              0,
              slices.findIndex((c, i) =>
                col < c.start + c.raw.length ||
                i === slices.length - 1
              ),
            );
            const cell = row.children[idx] as HTMLElement | undefined;
            const slice = slices[idx];
            if (cell && slice) {
              anchor = cell;
              const lead = slice.raw.length - slice.raw.trimStart().length;
              const within = Math.max(0, col - slice.start - lead);
              offset = cell.isContentEditable
                ? within
                : fastrStripInlineSyntax(slice.raw.trim().slice(0, within))
                  .length;
            }
          }
        }
        if (!anchor) {
          const block =
            widget.querySelector<HTMLElement>(`[data-line="${rel}"]`) ??
              (rel === 0
                ? widget.querySelector<HTMLElement>(
                  ":scope > :not(.fm-peer-layer)",
                )
                : null);
          if (!block) return false;
          anchor = block;
          offset = 0;
        }
        // Walk the text nodes to the offset — skipping hidden syntax spans
        // and the whitespace between block tags, which a rendered block
        // (but not an open island, whose text IS the source) is full of.
        const walker = document.createTreeWalker(anchor, NodeFilter.SHOW_TEXT);
        let node: Text | null = null;
        let at = 0;
        let remaining = offset;
        let last: Text | null = null;
        while ((node = walker.nextNode() as Text | null)) {
          if (!anchor.isContentEditable) {
            const hidden =
              (node.parentElement?.closest(".cm-fm-island-syntax") ?? null) !==
                null;
            if (hidden || node.data.trim().length === 0) continue;
          }
          last = node;
          if (remaining <= node.length) {
            at = remaining;
            break;
          }
          remaining -= node.length;
          node = null;
        }
        const range = document.createRange();
        if (node) range.setStart(node, at);
        else if (last) range.setStart(last, last.length);
        else range.setStart(anchor, 0);
        range.collapse(true);
        let rect: DOMRect | undefined = range.getClientRects()[0];
        if (!rect || (rect.width === 0 && rect.height === 0)) {
          const r = anchor.getBoundingClientRect();
          rect = new DOMRect(r.left, r.top, 0, r.height);
        }
        // Into the widget's peer layer (see fill), positioned against the
        // widget — the layer covers it exactly.
        const container = widget.querySelector<HTMLElement>(
          ":scope > .fm-peer-layer",
        );
        if (!container) return false;
        const base = widget.getBoundingClientRect();
        const caret = document.createElement("span");
        caret.className = "fm-peer-caret";
        caret.style.left = `${rect.left - base.left}px`;
        caret.style.top = `${rect.top - base.top}px`;
        caret.style.height = `${
          rect.height || parseFloat(getComputedStyle(anchor).lineHeight) || 16
        }px`;
        caret.style.background = color;
        const flag = document.createElement("span");
        flag.className = "fm-peer-caret__name";
        flag.style.background = color;
        flag.textContent = name;
        caret.appendChild(flag);
        container.appendChild(caret);
        return true;
      }
      destroy() {
        deps.awareness.off("change", this.onAwareness);
        if (this.raf) clearTimeout(this.raf);
      }
    },
  );
}

// ── The document-surface theme ───────────────────────────────────────────────
// Every value is a token reference, so this theme never needs reconfiguring on
// a theme switch — the host's <style> element moves, the vars follow.

const livePreviewTheme = EditorView.theme({
  ".cm-content": {
    fontFamily: "var(--fm-font-body)",
    color: "var(--fm-ink)",
    // The theme's body type (fastrBodyType), read from the same two vars
    // print sets on <body>, so the editor's lines and the PDF's keep one
    // rhythm. Named vars, not inheritance from the scope root: inheriting
    // moved BOTH sides once (the scope root also sizes the app chrome around
    // the page). A theme sets its body through the bodySize/bodyLeading
    // tokens, never with a `body { line-height }` in its extraCss, which
    // reaches print and not these lines.
    fontSize: "var(--fm-body-size, 16px)",
    lineHeight: "var(--fm-body-leading, 1.55)",
    // The theme's body tracking (FastrThemeSpec.bodyTracking), as print's
    // root sets it: the lines wrap where print's do.
    letterSpacing: "var(--fm-body-tracking, 0em)",
    caretColor: "var(--fm-ink)",
  },
  ".cm-gutters": { display: "none" },
  // No scrollbar on the page surface: it still scrolls (wheel, keys, touch),
  // the bar just isn't drawn beside the sheets.
  ".cm-scroller": { scrollbarWidth: "none" },
  ".cm-scroller::-webkit-scrollbar": { display: "none" },
});

// ── Assembly ─────────────────────────────────────────────────────────────────

// The sheet-bleed variables, measured rather than derived: the surface sheet's
// calc assumes the scroller's full border box, but the vertical scrollbar eats
// into it, so a calc-derived bleed margin overshoots the real content padding
// by half the scrollbar and a band pokes out of the sheet (spawning a
// horizontal scrollbar). The content padding is the ground truth — read it and
// pin the two bleed properties to it as an inline style, which also tracks the
// clamped padding of a narrow pane for free.
const sheetBleedVars = ViewPlugin.fromClass(
  class {
    private last = -1;
    constructor(view: EditorView) {
      this.schedule(view);
    }
    update(u: ViewUpdate) {
      if (u.geometryChanged || u.viewportChanged || u.docChanged) {
        this.schedule(u.view);
      }
    }
    schedule(view: EditorView) {
      view.requestMeasure({
        read: () =>
          parseFloat(getComputedStyle(view.contentDOM).paddingLeft) || 0,
        write: (pad) => {
          if (pad === this.last) return;
          this.last = pad;
          view.scrollDOM.style.setProperty("--fm-bleed-margin", `${-pad}px`);
          view.scrollDOM.style.setProperty("--fm-bleed-pad", `${pad}px`);
        },
      });
    }
  },
);

// The `:::report` document ground, painted on the sheet. View hangs the
// header's classes/style on the iframe <html>; the sheet's equivalent is the
// scroller: given the same classes, the scoped structure rules (fm-tone--*,
// fm-has-bg, fm-ink--*) style it exactly as they style View's page — the ink
// re-scoping a dark ground needs then cascades into lines and widgets for
// free. The width classes are deliberately dropped: the host pins the measure
// in px, and the rem-based fm-doc--wide rule would re-shear it against the
// app's root font size. Everything applied is tracked and removed on destroy,
// so turning live preview off leaves no tint behind.
function docGroundPlugin(resolver: EmbedResolver) {
  return ViewPlugin.fromClass(
    class {
      private classes: string[] = [];
      private styleProps: string[] = [];
      private key: string | undefined;
      constructor(private view: EditorView) {
        this.apply();
      }
      update(u: ViewUpdate) {
        if (u.docChanged) this.apply();
      }
      destroy() {
        this.clear();
      }
      private clear() {
        const el = this.view.scrollDOM;
        for (const c of this.classes) el.classList.remove(c);
        for (const p of this.styleProps) el.style.removeProperty(p);
        this.classes = [];
        this.styleProps = [];
      }
      private apply() {
        // The header must be the document's first content line by the
        // format's rules; the slice keeps the per-keystroke rescan cheap.
        const settings = readFastrDocumentSettings(
          this.view.state.doc.sliceString(0, 4096),
        );
        const key =
          `${settings.className}|${settings.style}|${settings.extraAttrs}`;
        if (key === this.key) return;
        this.key = key;
        this.clear();
        const el = this.view.scrollDOM;
        this.classes = settings.className
          .split(/\s+/)
          .filter((c) => c.length > 0 && !c.startsWith("fm-doc"));
        for (const c of this.classes) el.classList.add(c);
        const colon = settings.style.indexOf(":");
        let literal: { prop: string; value: string } | undefined;
        if (colon > 0) {
          const prop = settings.style.slice(0, colon).trim();
          const value = settings.style
            .slice(colon + 1)
            .replace(/;\s*$/, "")
            .trim();
          el.style.setProperty(prop, value);
          this.styleProps.push(prop);
          literal = { prop, value };
        }
        // The document's ground as ONE property every descendant reads: the
        // seam drawn inside a block paints with it (report_fastr_css.ts,
        // --fm-page-ground), where the theme's page colour showed as a
        // lighter block on a toned document (Nick, 2026-09-10). A tone's
        // ground goes by reference, so a theme change follows; a literal
        // colour as written; a gradient or an image keeps the fallback.
        const tone = /\bfm-tone--([a-z]+)\b/.exec(settings.className)?.[1];
        const ground = tone !== undefined
          ? `var(--fm-${tone}-ground)`
          : literal?.prop === "background-color"
          ? literal.value
          : undefined;
        if (ground !== undefined) {
          el.style.setProperty("--fm-page-ground", ground);
          this.styleProps.push("--fm-page-ground");
        }
        const img = /data-bg-image="image:([^"]+)"/.exec(settings.extraAttrs);
        if (img) {
          const entry = resolver.getImage(img[1]);
          if (entry) {
            el.style.setProperty(
              "background-image",
              `url("${
                resolver.assetUrl(entry.imgFile).replaceAll('"', "%22")
              }")`,
            );
            this.styleProps.push("background-image");
          }
        }
      }
    },
  );
}

// ── Page boxes ───────────────────────────────────────────────────────────────
// Where the printed pages start, from the host's paginator (paginate_report.ts:
// the SAME paged document the server prints, laid out in a hidden frame). The
// editor draws a seam before each page's first line: between plain lines as a
// block widget, inside a rendered block as an element injected before the
// child that starts the page. Blocks the paginator had to split (taller than a
// page) are flagged. Results are in 0-based source lines and may be a beat
// stale after an edit, so every line is clamped and nothing here throws.

export type EditorPagination = {
  result: FastrPagedResult;
  // The running footer's title, drawn on the seam.
  title: string;
  // Per page number, the padding (px) that brings the page box up to the
  // printed page's height at the sheet's scale, written in place by
  // pageBoxPlugin as pages are measured; a seam re-created on scroll reads
  // its size from here.
  fillers?: Map<number, number>;
  // Per page number, the padding (px) under the head of the seam that opens
  // the page: what the page's first block grows by at the top of a page
  // (FastrLayoutBlock.topExtra), the seam's rather than the block's, written
  // by pageBoxPlugin like the fillers.
  topExtras?: Map<number, number>;
  // Per figure's source line, the image height (px) the layout shrank it
  // to so it fills the room left on its page (FastrLayoutBlock.flex):
  // written by pageBoxPlugin as --fm-fig-fit on the mount, read back by a
  // widget created later, and handed to print (getPageLayout).
  figureFits?: Map<number, number>;
  // Per page number, the document position a page that opens INSIDE a source
  // line starts at (FastrPagedPage.firstRow): the head of that wrapped row,
  // found by pageBoxPlugin once the line is rendered. Until then the seam
  // stands before the line.
  rowPos?: Map<number, number>;
  // Per page number, the ground of a page template that takes the page on
  // a ground of its own (tone=…): print paints the whole sheet with it, so
  // the seams paint the page's margins with it too. Set by
  // buildPaginationState from the document.
  grounds?: Map<number, string>;
};

export const setPagination = StateEffect.define<EditorPagination | undefined>();

// Print's height for every block, by the block's source text, from the
// host's background layout of the whole document (paginate_report.ts): the
// page layout takes them for blocks the editor has not rendered.
export const setLayoutHints = StateEffect.define<
  Map<string, FastrLayoutHint>
>();
export const layoutHintsField = StateField.define<Map<string, FastrLayoutHint>>(
  {
    create: () => new Map(),
    update(value, tr) {
      for (const e of tr.effects) if (e.is(setLayoutHints)) return e.value;
      return value;
    },
  },
);

// The page box geometry the host sets on the editor's scope: the printed
// page's height and its margin at the sheet's scale (report_fastr_css.ts
// draws the margins; the plugin measures against them).
export type PageBoxGeometry = {
  pageH: number;
  marginPx: number;
  sheetPx?: number;
};

// What a page's content may fill: the sheet less the top and bottom margins;
// less the bottom one only for a page a natural cover opens (no top
// margin); the whole sheet for a filling cover (no margins at all).
type PageMargins = { cover: boolean; flushTop?: boolean };
function pageAreaPx(g: PageBoxGeometry, page: PageMargins): number {
  if (page.cover) return g.pageH;
  return g.pageH - (page.flushTop === true ? 1 : 2) * g.marginPx;
}

function readPageBoxGeometry(view: EditorView): PageBoxGeometry | undefined {
  const style = getComputedStyle(view.dom);
  const pageH = parseFloat(style.getPropertyValue("--fm-page-h"));
  const marginPx = parseFloat(style.getPropertyValue("--fm-page-margin"));
  const sheetPx = parseFloat(style.getPropertyValue("--fm-sheet"));
  if (!Number.isFinite(pageH) || pageH <= 0) return undefined;
  return {
    pageH,
    marginPx: Number.isFinite(marginPx) && marginPx >= 0 ? marginPx : 0,
    sheetPx: Number.isFinite(sheetPx) && sheetPx > 0 ? sheetPx : undefined,
  };
}

type PaginationState = {
  pagination: EditorPagination | undefined;
  // Seams between plain lines, as decorations.
  deco: DecorationSet;
  // Seams inside regions, by region start line: the region-relative line the
  // page starts on, and the page number.
  regionSeams: Map<number, { rel: number; page: number }[]>;
  // Regions flagged as split, by region start line → continuation page.
  regionSplits: Map<number, number>;
};

const EMPTY_PAGINATION: PaginationState = {
  pagination: undefined,
  deco: Decoration.none,
  regionSeams: new Map(),
  regionSplits: new Map(),
};

function footerText(pag: EditorPagination, page: number): string {
  const total = pag.result.total;
  return `${t3({ en: "Page", fr: "Page", pt: "Página" })} ${page} ${
    t3({ en: "of", fr: "sur", pt: "de" })
  } ${total}`;
}

// The seam element before page `page`: the filler that pads the ENDING page
// (page − 1) to the printed page's content area (its padding-top, measured
// by pageBoxPlugin), that page's bottom margin with the running footer in
// it, the gap between two sheets, then the starting page's top margin. A
// cover page has no margins and no footer in the PDF, so its seam shows
// neither. After the last page (`end`) there is a foot and a filler only.
function seamElement(
  pag: EditorPagination,
  page: number,
  end = false,
): HTMLElement {
  const el = document.createElement("div");
  el.className = end ? "fm-page-gutter fm-page-gutter--end" : "fm-page-gutter";
  el.contentEditable = "false";
  el.setAttribute("data-page", String(page));
  const endGround = pag.grounds?.get(page - 1);
  const startGround = end ? undefined : pag.grounds?.get(page);
  if (endGround !== undefined) el.setAttribute("data-end-ground", endGround);
  if (startGround !== undefined) {
    el.setAttribute("data-start-ground", startGround);
  }
  seamPadding(el, pag, page, end);
  el.append(...seamParts(pag, page, end));
  return el;
}

// The seam's padding: the page's room under its content (a page full to
// the pixel keeps its trailing separator line by letting it run into the
// foot, which the parts read as a negative filler), and the extra of the
// block that opens the next page. No page opens after the end element.
function seamPadding(
  el: HTMLElement,
  pag: EditorPagination,
  page: number,
  end: boolean,
): void {
  const filler = pag.fillers?.get(page - 1);
  if (filler !== undefined && filler > 0) el.style.paddingTop = `${filler}px`;
  // How far an ending page's ground reaches into the seam: its filler.
  el.style.setProperty("--fm-seam-fill", `${Math.max(0, filler ?? 0)}px`);
  const extra = end ? undefined : pag.topExtras?.get(page);
  if (extra !== undefined && extra > 0) el.style.paddingBottom = `${extra}px`;
}

// The seam's parts: the ending page's foot with the running footer (none
// after a cover page), the band between the sheets, and the starting
// page's head (none before a cover page or a page a natural cover opens).
function seamParts(
  pag: EditorPagination,
  page: number,
  end: boolean,
): HTMLElement[] {
  const parts: HTMLElement[] = [];
  const ending = pag.result.pages[page - 2];
  const starting = pag.result.pages[page - 1];
  const filler = pag.fillers?.get(page - 1);
  const shift = filler !== undefined && filler < 0 ? filler : 0;
  if (ending !== undefined && !ending.cover) {
    const foot = document.createElement("div");
    foot.className = "fm-page-gutter__foot";
    const title = document.createElement("span");
    title.textContent = pag.title;
    const num = document.createElement("span");
    num.textContent = footerText(pag, page - 1);
    foot.append(title, num);
    if (shift < 0) foot.style.marginTop = `${shift}px`;
    parts.push(foot);
  }
  if (!end) {
    const band = document.createElement("div");
    band.className = "fm-page-gutter__band";
    parts.push(band);
    if (starting === undefined || (!starting.cover && !starting.flushTop)) {
      const head = document.createElement("div");
      head.className = "fm-page-gutter__head";
      parts.push(head);
    }
  }
  return parts;
}

// A seam inside a table, before the row that opens the page: a row of its
// own, one cell across every column, so the table's layout is untouched.
// A block dropped between rows lands in an anonymous cell of the first
// column, and the sheet-wide strip made that column as wide as itself. The
// cell carries the seam's padding and classes; the strip stands in a box
// with no intrinsic inline size (contain: inline-size), so it does not
// widen the table, and reaches the sheet's edges from there.
function seamRow(
  pag: EditorPagination,
  page: number,
  cols: number,
): HTMLTableRowElement {
  const row = document.createElement("tr");
  row.className = "fm-page-gutter-row";
  row.contentEditable = "false";
  const cell = document.createElement("td");
  cell.className = "fm-page-gutter fm-page-gutter--inner fm-page-gutter--cell";
  cell.setAttribute("data-page", String(page));
  cell.colSpan = Math.max(1, cols);
  seamPadding(cell, pag, page, false);
  const contain = document.createElement("div");
  contain.className = "fm-page-gutter__contain";
  const sheet = document.createElement("div");
  sheet.className = "fm-page-gutter__sheet";
  sheet.append(...seamParts(pag, page, false));
  contain.append(sheet);
  cell.append(contain);
  row.append(cell);
  return row;
}

// Before the document's first line when page 1 is not a cover: its top
// margin.
class PageHeadWidget extends WidgetType {
  // Page 1's template ground, when a toned page template takes page 1.
  constructor(readonly ground: string | undefined) {
    super();
  }
  override eq(other: PageHeadWidget): boolean {
    return other.ground === this.ground;
  }
  override toDOM(): HTMLElement {
    const dom = document.createElement("div");
    dom.className = "cm-fm-page-head";
    dom.contentEditable = "false";
    if (this.ground !== undefined) {
      dom.setAttribute("data-start-ground", this.ground);
    }
    const head = document.createElement("div");
    head.className = "fm-page-gutter__head";
    dom.append(head);
    return dom;
  }
  override get estimatedHeight(): number {
    return 77;
  }
  override ignoreEvent(): boolean {
    return false;
  }
}

function splitFlag(page: number): HTMLElement {
  const el = document.createElement("div");
  el.className = "fm-page-split";
  el.contentEditable = "false";
  el.textContent = t3({
    en: `Longer than a page: continues on page ${page}`,
    fr: `Plus long qu'une page : continue en page ${page}`,
    pt: `Mais longo que uma página: continua na página ${page}`,
  });
  return el;
}

class PageGutterWidget extends WidgetType {
  constructor(readonly pag: EditorPagination, readonly page: number) {
    super();
  }
  override eq(other: PageGutterWidget): boolean {
    return other.page === this.page && other.pag.title === this.pag.title &&
      other.pag.result.total === this.pag.result.total;
  }
  override toDOM(): HTMLElement {
    const dom = document.createElement("div");
    dom.className = "cm-fm-page-gutter";
    dom.append(seamElement(this.pag, this.page));
    return dom;
  }
  override get estimatedHeight(): number {
    return 182 + Math.max(0, this.pag.fillers?.get(this.page - 1) ?? 0) +
      (this.pag.topExtras?.get(this.page) ?? 0);
  }
  override ignoreEvent(): boolean {
    return false;
  }
}

// The seam INSIDE a source line, before the wrapped row that opens the page
// (see "Paragraphs that run on to the next page"): an inline widget whose
// element floats across the whole line box, so it lands between two rows.
class PageRowSeamWidget extends WidgetType {
  constructor(readonly pag: EditorPagination, readonly page: number) {
    super();
  }
  override eq(other: PageRowSeamWidget): boolean {
    return other.page === this.page && other.pag.title === this.pag.title &&
      other.pag.result.total === this.pag.result.total;
  }
  override toDOM(): HTMLElement {
    const el = seamElement(this.pag, this.page);
    el.classList.add("fm-page-gutter--row");
    return el;
  }
  override ignoreEvent(): boolean {
    return false;
  }
}

// After the document's last line: the last page's foot and its filler, so
// the final page is a full sheet too.
class PageEndWidget extends WidgetType {
  constructor(readonly pag: EditorPagination) {
    super();
  }
  override eq(other: PageEndWidget): boolean {
    return other.pag.title === this.pag.title &&
      other.pag.result.total === this.pag.result.total;
  }
  override toDOM(): HTMLElement {
    const dom = document.createElement("div");
    dom.className = "cm-fm-page-end";
    dom.append(seamElement(this.pag, this.pag.result.total + 1, true));
    return dom;
  }
  override get estimatedHeight(): number {
    return 77 + Math.max(0, this.pag.fillers?.get(this.pag.result.total) ?? 0);
  }
  override ignoreEvent(): boolean {
    return false;
  }
}

// The pages a page template takes on a ground of its own, and that ground:
// a tone (`tone=ink`, or a slot layout's default never reaches the page) by
// name. A literal bg= keeps the seam plain.
function templateGroundsOf(
  result: FastrPagedResult,
  regionAt: (line: number) => FastrLiveRegion | undefined,
): Map<number, string> {
  const out = new Map<number, string>();
  for (const page of result.pages) {
    if (page.firstLine === undefined) continue;
    const r = regionAt(page.firstLine);
    if (r?.startLine !== page.firstLine || r.fence?.name !== "page") continue;
    const tone = fastrSurfaceTone(r.fence.attrs);
    if (tone !== undefined) out.set(page.number, tone);
  }
  return out;
}

function buildPaginationState(
  state: EditorState,
  pag: EditorPagination | undefined,
): PaginationState {
  if (pag === undefined) return EMPTY_PAGINATION;
  if (pag.result.total === 0) return { ...EMPTY_PAGINATION, pagination: pag };
  const ranges = regionRanges(state);
  const regionAt = (line: number) =>
    ranges.find((r) => r.region.startLine <= line && line <= r.region.endLine);
  const regionSeams = new Map<number, { rel: number; page: number }[]>();
  const regionSplits = new Map<number, number>();
  const decos: Range<Decoration>[] = [];
  pag.grounds = templateGroundsOf(pag.result, (line) => regionAt(line)?.region);
  const first = pag.result.pages[0];
  if (first !== undefined && !first.cover && !first.flushTop) {
    decos.push(
      Decoration.widget({
        widget: new PageHeadWidget(pag.grounds.get(1)),
        block: true,
        side: -2,
      })
        .range(0),
    );
  }
  for (const page of pag.result.pages) {
    if (page.number < 2 || page.firstLine === undefined) continue;
    const line = page.firstLine;
    if (line >= state.doc.lines) continue;
    const r = regionAt(line);
    // A page starting inside a rendered block gets its seam injected into
    // that block's DOM. A leaf or embed (one line, rendered by its own
    // widget) and a plain line take a block widget placed before the line.
    if (
      r !== undefined && r.region.kind !== "leaf" && r.region.kind !== "embed"
    ) {
      const list = regionSeams.get(r.region.startLine) ?? [];
      list.push({ rel: line - r.region.startLine, page: page.number });
      regionSeams.set(r.region.startLine, list);
      continue;
    }
    // A page that opens inside the line (a paragraph running on): the seam
    // goes in at the row's head once pageBoxPlugin has found it.
    const at = page.firstRow !== undefined && page.firstRow > 0
      ? pag.rowPos?.get(page.number)
      : undefined;
    const docLine = state.doc.line(line + 1);
    if (at !== undefined && at > docLine.from && at <= docLine.to) {
      decos.push(
        Decoration.widget({
          widget: new PageRowSeamWidget(pag, page.number),
          side: -1,
        }).range(at),
      );
      continue;
    }
    decos.push(
      Decoration.widget({
        widget: new PageGutterWidget(pag, page.number),
        block: true,
        side: -1,
      }).range(state.doc.line(line + 1).from),
    );
  }
  for (const s of pag.result.splits) {
    if (s.line >= state.doc.lines) continue;
    const r = regionAt(s.line);
    if (r !== undefined) {
      if (!regionSplits.has(r.region.startLine)) {
        regionSplits.set(r.region.startLine, s.page + 1);
      }
      continue;
    }
    decos.push(
      Decoration.line({ class: "cm-fm-split" }).range(
        state.doc.line(s.line + 1).from,
      ),
    );
  }
  decos.push(
    Decoration.widget({ widget: new PageEndWidget(pag), block: true, side: 1 })
      .range(state.doc.length),
  );
  decos.sort((a, b) =>
    a.from - b.from || a.value.startSide - b.value.startSide
  );
  return {
    pagination: pag,
    deco: Decoration.set(decos, true),
    regionSeams,
    regionSplits,
  };
}

export const paginationField = StateField.define<PaginationState>({
  create: () => EMPTY_PAGINATION,
  update(value, tr) {
    for (const e of tr.effects) {
      if (e.is(setPagination)) return buildPaginationState(tr.state, e.value);
    }
    // An edit shifts lines under a result computed for the previous text;
    // the result's lines follow the edit (so the seams stay where they were
    // and a provisional move rebuilds from current lines) until the
    // paginator answers again, rather than flashing away on every key.
    if (tr.docChanged && value.pagination !== undefined) {
      const mapLine = lineMapper(tr);
      const fits = value.pagination.figureFits;
      let figureFits: Map<number, number> | undefined;
      if (fits !== undefined) {
        figureFits = new Map();
        for (const [line, px] of fits) {
          const to = mapLine(line);
          if (to !== undefined) figureFits.set(to, px);
        }
      }
      let rowPos: Map<number, number> | undefined;
      if (value.pagination.rowPos !== undefined) {
        rowPos = new Map();
        // Typing at the row's head goes on that row, after the seam.
        for (const [n, pos] of value.pagination.rowPos) {
          rowPos.set(n, tr.changes.mapPos(pos, -1));
        }
      }
      return buildPaginationState(tr.state, {
        ...value.pagination,
        result: mapResultThroughChanges(value.pagination.result, tr),
        figureFits,
        rowPos,
      });
    }
    return value;
  },
  provide: (f) => EditorView.decorations.from(f, (v) => v.deco),
});

// A 0-based source line before a transaction to the line it is on after.
function lineMapper(
  tr: Transaction,
): (line: number | undefined) => number | undefined {
  const before = tr.startState.doc;
  const after = tr.state.doc;
  return (line) => {
    if (line === undefined || line < 0 || line >= before.lines) return line;
    const pos = tr.changes.mapPos(before.line(line + 1).from, -1);
    return after.lineAt(pos).number - 1;
  };
}

function mapResultThroughChanges(
  result: FastrPagedResult,
  tr: Transaction,
): FastrPagedResult {
  const mapLine = lineMapper(tr);
  return {
    ...result,
    pages: result.pages.map((p) => ({
      ...p,
      firstLine: mapLine(p.firstLine),
      para: p.para === undefined
        ? undefined
        : { ...p.para, line: mapLine(p.para.line) ?? p.para.line },
    })),
    splits: result.splits.map((sp) => ({
      ...sp,
      line: mapLine(sp.line) ?? sp.line,
    })),
    fits: (result.fits ?? []).map((f) => ({
      ...f,
      line: mapLine(f.line) ?? f.line,
    })),
  };
}

// Seams and flags INSIDE a rendered block: applied to the widget's DOM after
// each fill, and re-applied to every mounted widget when a new result lands
// (the widgets themselves do not change, so eq cannot drive it).
function applyRegionPagination(
  dom: HTMLElement,
  startLine: number,
  view: EditorView,
): void {
  for (
    const old of Array.from(
      dom.querySelectorAll(
        ".fm-page-gutter-row, .fm-page-gutter-repeat, .fm-page-gutter, .fm-page-split",
      ),
    )
  ) {
    old.remove();
  }
  dom.classList.remove("fm-live-region--split");
  const ps = view.state.field(paginationField, false);
  if (ps === undefined || ps.pagination === undefined) return;
  const seams = ps.regionSeams.get(startLine);
  if (seams !== undefined) {
    for (const seam of seams) {
      const el = seamElement(ps.pagination, seam.page);
      el.classList.add("fm-page-gutter--inner");
      // The child that starts the page: the innermost anchored element for
      // that region-relative line, or the block's own top when the page
      // starts at its fence (rel 0) or no anchor matches.
      const anchor = seam.rel === 0 ? undefined : Array.from(
        dom.querySelectorAll<HTMLElement>(`[data-line="${seam.rel}"]`),
      ).pop();
      const target = anchor ??
        dom.querySelector<HTMLElement>(".fm-peer-layer + *");
      const row = target?.closest<HTMLTableRowElement>("tr") ?? null;
      if (row !== null && row.parentElement) {
        // Inside a table: a row of the seam before the row that opens the
        // page, then the table's header rows again, as print repeats them
        // on every page a table runs on to (the layout counts them:
        // FastrLayoutBlock.repeat). The copies are inert: no anchors (the
        // break candidates come from the rows), no editing.
        row.parentElement.insertBefore(
          seamRow(ps.pagination, seam.page, row.cells.length),
          row,
        );
        const thead = row.closest("table")?.querySelector<
          HTMLTableSectionElement
        >(":scope > thead");
        for (const hr of Array.from(thead?.rows ?? [])) {
          const copy = hr.cloneNode(true) as HTMLTableRowElement;
          copy.classList.add("fm-page-gutter-repeat");
          copy.contentEditable = "false";
          copy.setAttribute("aria-hidden", "true");
          copy.removeAttribute("data-line");
          for (const a of Array.from(copy.querySelectorAll("[data-line]"))) {
            a.removeAttribute("data-line");
          }
          row.parentElement.insertBefore(copy, row);
        }
      } else if (
        target !== null && target !== undefined && target.parentElement
      ) {
        target.parentElement.insertBefore(el, target);
      } else {
        dom.append(el);
      }
    }
  }
  const split = ps.regionSplits.get(startLine);
  if (split !== undefined) {
    dom.classList.add("fm-live-region--split");
    // At the top of the block's own content: after a seam that opens the
    // block's page (rel 0), or the flag would stand at the foot of the page
    // before, counted by the layout as the block's and drawn as the other
    // page's.
    let first = dom.querySelector<HTMLElement>(".fm-peer-layer + *");
    while (first !== null && first.classList.contains("fm-page-gutter")) {
      first = first.nextElementSibling as HTMLElement | null;
    }
    const flag = splitFlag(split);
    if (first && first.parentElement) {
      first.parentElement.insertBefore(flag, first);
    } else dom.append(flag);
  }
}
// ── Page layout ─────────────────────────────────────────────────────────────
// The EDITOR decides where the pages break, on every measure, from
// CodeMirror's height map: every block's own box (a line's, a region
// widget's), the space between blocks, and the paged sheet's rules, run
// through layoutFastrPages (report-forge/engine/fastr_markdown_pages.ts). The result is
// the pagination the seams draw, at once: nothing waits on a paginator, so
// Enter moves a block to the next page in the same frame and Backspace
// brings it back. The PDF export forces Paged.js to break on these lines
// (fastrForcedBreaksCss), so the printed page is the page box.
//
// Heights are measured where a line has been on screen and estimated
// elsewhere. Two things make the estimates good: a block's height is
// remembered by its source text once it has been rendered
// (measuredBlockHeights), and the host hands over print's own height for
// every block, by text, from a background layout (setLayoutHints), so a
// page far below the viewport is laid out from real heights rather than
// CodeMirror's guess, and a seam does not move when the page scrolls in.
//
// A block's box is the same wherever it stands: the stylesheet lets no
// seam change a margin, or the layout that placed the seam would find
// another height and move it away, then back, every frame. What print adds
// at the top of a page (a block's whole top margin, where the editor's box
// keeps only what exceeds the separator) is the block's topExtra: the
// layout counts it when the block opens a page, and the seam carries it as
// padding under its head, so the page reads as print's.
//
// Every seam's filler (the padding that brings a page box to the sheet's
// height) comes from the layout's own numbers, on screen or not.

type FlowBlock = FastrLayoutBlock & {
  top: number;
  bottom: number;
  text: string;
  rendered: boolean;
  // The widget's height on screen when it differs from the block's (an
  // embed still pending its size): the page's filler absorbs the
  // difference, so the box keeps the sheet's height while the layout keeps
  // the steady figure.
  domHeight?: number;
  // A figure block's image height at its natural size, px (figureImageBox):
  // what a fit is taken from.
  imgH?: number;
  // A region, a run of plain lines, or a line of space.
  kind: "r" | "p" | "s";
  // Print's margins above and below the block, px (the structure sheet's):
  // what a stretched gap is written as for print.
  printMt: number;
  printMb: number;
};

// The document-space extent of a source line's OWN box: the text line, or
// the widget standing in for a replaced region, without the block widgets
// (a seam, the page head) attached before or after it.
function lineBox(
  view: EditorView,
  line0: number,
): { top: number; bottom: number } {
  const block = view.lineBlockAt(view.state.doc.line(line0 + 1).from);
  if (!Array.isArray(block.type)) {
    return { top: block.top, bottom: block.bottom };
  }
  const parts = block.type as readonly BlockInfo[];
  const own = parts.filter((p) =>
    p.type === BlockType.Text || p.type === BlockType.WidgetRange
  );
  if (own.length === 0) return { top: block.top, bottom: block.bottom };
  return { top: own[0].top, bottom: own[own.length - 1].bottom };
}

// ── Vertical rhythm ─────────────────────────────────────────────────────────
// The editor's flow stands where print's does, to the pixel, from print's
// own block margins measured in the editor's sheet (HeightOracle, once per
// geometry) and the source alone. Two blocks a blank source line apart are
// max(margin-bottom, margin-top) apart in print, their margins collapsed:
// the blank line is exactly that tall (--fm-gap). Margins do not collapse
// through a line of space: a run of blank lines is the previous block's
// whole bottom margin, the lines of space, and the next block's whole top
// margin under the last of them (--fm-gap-bottom). Two blocks with no blank
// line between (a paragraph straight under its heading) put the collapsed
// gap above the second block's first line, or a widget's first content
// child (--fm-gap-top). Blocks carry nothing else, so a block's box never
// depends on where it stands, and print keeps a block's whole top margin at
// a page top (the seam's topExtra, pageBoxPlugin).
export type PrintMetrics = {
  // By block key (blockKeyOfLine, regionKeyOf): print's margins, px.
  margins: Record<string, { mt: number; mb: number }>;
  // Print's paragraph margin (the separator's base), a list item's margin,
  // a quote's own padding, px: CSS variables on the editor.
  pMargin: number;
  liGap: number;
  // A list's indent (the ul's padding), px: the line's padding per depth.
  liIndent: number;
  bqPad: number;
  // The figure reserve (FASTR_FIGURE_PAGE_CEILING's note), px, or undefined
  // when the sheet could not lay the probe out: a CSS variable on the
  // editor, which the figure cap reads.
  figReserve: number | undefined;
};
export const setPrintMetrics = StateEffect.define<PrintMetrics>();
export const printMetricsField = StateField.define<PrintMetrics | undefined>({
  create: () => undefined,
  update(value, tr) {
    for (const e of tr.effects) if (e.is(setPrintMetrics)) return e.value;
    return value;
  },
});
const NO_MARGINS = { mt: 0, mb: 0 };
// Layout units: the browser keeps lengths in 1/64 px and truncates a float
// margin to one; every px the rhythm writes is such a unit, so the editor's
// line boxes and print's margins are the same number, not a rounding apart.
export function snapPx(v: number): number {
  return Math.floor(v * 64 + 1e-6) / 64;
}
function marginsOf(
  metrics: PrintMetrics | undefined,
  key: string | undefined,
): { mt: number; mb: number } {
  return (key !== undefined ? metrics?.margins[key] : undefined) ?? NO_MARGINS;
}
const HR_LINE_RE = /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/;
const CODE_FENCE_LINE_RE = /^ {0,3}(`{3,}|~{3,})/;
// The block a plain source line belongs to, as print renders it.
function blockKeyOfLine(text: string): string {
  const h = HEADING_LINE_RE.exec(text);
  if (h) return `h${h[1].length}`;
  if (LIST_LINE_RE.test(text)) return "list";
  if (/^\s*>/.test(text)) return "bq";
  if (CODE_FENCE_LINE_RE.test(text)) return "pre";
  if (HR_LINE_RE.test(text)) return "hr";
  return "p";
}
// The block a region renders as: the structure sheet's class.
function regionKeyOf(r: FastrLiveRegion): string {
  if (r.kind === "table") return "table";
  if (r.kind === "embed") return "figure";
  const name = r.fence?.name ?? "";
  if (name === "contents") return "fm-toc";
  if (name === "pagebreak" || name === "report") return name;
  return `fm-${name}`;
}
// Print's margins for every block kind, measured in the editor's own sheet.
function measurePrintMetrics(oracle: HeightOracle): PrintMetrics {
  const margins: Record<string, { mt: number; mb: number }> = {};
  const m = (tag: string, cls = "") => ({
    mt: oracle.printMarginTop(tag, cls),
    mb: oracle.printMarginBottom(tag, cls),
  });
  margins.p = m("p");
  for (let n = 1; n <= 6; n++) margins[`h${n}`] = m(`h${n}`, "fm-top");
  margins.bq = m("blockquote");
  margins.pre = m("pre");
  margins.hr = m("hr");
  // A list's items carry the margins: the first item's collapses through
  // the list's top, the last item's into the list's bottom margin.
  margins.list = {
    mt: oracle.printMarginTop("li"),
    mb: Math.max(
      oracle.printMarginBottom("ul"),
      oracle.printMarginBottom("li"),
    ),
  };
  margins.table = oracle.regionMargins("", "table");
  margins.figure = oracle.regionMargins("fm-figure", "figure");
  for (const name of FASTR_BLOCK_NAMES) {
    if (name === "pagebreak" || name === "report") {
      margins[name] = { mt: 0, mb: 0 };
    } else if (name === "contents") {
      margins["fm-toc"] = oracle.regionMargins("fm-toc", "div");
    } // A page template opens and ends its page: no margins of its own.
    else if (name === "page" || name === "slot") {
      margins[`fm-${name}`] = { mt: 0, mb: 0 };
    } // A cover is a band (its bottom margin is the band's); it opens the
    // document or a page, where print gives it no top margin.
    else if (name === "cover") {
      margins["fm-cover"] = {
        mt: 0,
        mb: oracle.regionMargins("fm-band fm-cover", "section").mb,
      };
    } else margins[`fm-${name}`] = oracle.regionMargins(`fm-${name}`, "div");
  }
  // To the 1/64 px the browser lays out at, floored as it floors a margin:
  // a line height or padding of the same float would round up instead, a
  // sixty-fourth per block that adds up and moves a text row by a pixel.
  for (const k of Object.keys(margins)) {
    margins[k] = { mt: snapPx(margins[k].mt), mb: snapPx(margins[k].mb) };
  }
  return {
    margins,
    pMargin: margins.p.mb,
    liGap: margins.list.mt,
    liIndent: snapPx(oracle.printPaddingLeft("ul")),
    bqPad: snapPx(oracle.printPaddingTop("blockquote")),
    figReserve: oracle.figureReserve(),
  };
}
type DocRhythm = {
  // A blank source line outside a code block (inside one it is code).
  blank: (line: number) => boolean;
  // Every non-blank line's block key.
  key: (string | undefined)[];
  inCode: boolean[];
  fenceAt: Map<number, "open" | "close">;
  // The first blank line of a run: its height, px.
  blankGap: Map<number, number>;
  // The last line of space of a run: the next block's top margin, px.
  spaceBottom: Map<number, number>;
  // A block's first line with no blank line above it: the collapsed gap, px.
  gapTop: Map<number, number>;
  // Every such line (0-based), whatever its gap: where a run of non-blank
  // lines holds more than one block (a heading straight over another, a
  // paragraph straight under its heading). The page layout splits there.
  starts: Set<number>;
  bqFirst: Set<number>;
  bqLast: Set<number>;
  liNext: Set<number>;
  // 0-based.
  firstVisible: number | undefined;
};
const rhythmCache = new WeakMap<
  DocText,
  { metrics: PrintMetrics | undefined; rhythm: DocRhythm }
>();
function docRhythmOf(
  state: EditorState,
  metrics: PrintMetrics | undefined,
): DocRhythm {
  const cached = rhythmCache.get(state.doc);
  if (cached !== undefined && cached.metrics === metrics) return cached.rhythm;
  const doc = state.doc;
  const n = doc.lines;
  const db = docBlocksOf(state);
  const firstVisible = db.firstVisible !== undefined
    ? db.firstVisible - 1
    : undefined;
  const inCode: boolean[] = new Array(n).fill(false);
  const fenceAt = new Map<number, "open" | "close">();
  let codeOpen = false;
  for (const sc of scanContainerLines(doc.iterLines(1, n + 1))) {
    inCode[sc.index] = sc.inCode;
    if (!sc.inCode) {
      codeOpen = false;
      continue;
    }
    if (!codeOpen) {
      fenceAt.set(sc.index, "open");
      codeOpen = true;
    } else if (CODE_FENCE_LINE_RE.test(sc.text)) {
      fenceAt.set(sc.index, "close");
      codeOpen = false;
    }
  }
  const blank = (i: number) =>
    i >= 0 && i < n && !inCode[i] && doc.line(i + 1).text.trim().length === 0;
  const key: (string | undefined)[] = new Array(n).fill(undefined);
  for (let i = 0; i < n; i++) {
    if (blank(i)) continue;
    const owner = db.owner[i];
    key[i] = owner !== undefined
      ? regionKeyOf(owner)
      : inCode[i]
      ? "pre"
      : blockKeyOfLine(doc.line(i + 1).text);
  }
  const bqFirst = new Set<number>();
  const bqLast = new Set<number>();
  const liNext = new Set<number>();
  for (let i = 0; i < n; i++) {
    if (db.owner[i] !== undefined) continue;
    if (key[i] === "bq") {
      if (i === 0 || key[i - 1] !== "bq") bqFirst.add(i);
      if (i + 1 >= n || key[i + 1] !== "bq") bqLast.add(i);
    }
    if (
      key[i] === "list" && i > 0 && key[i - 1] === "list" &&
      db.owner[i - 1] === undefined
    ) liNext.add(i);
  }
  const blankGap = new Map<number, number>();
  const spaceBottom = new Map<number, number>();
  const gapTop = new Map<number, number>();
  const starts = new Set<number>();
  // A cover that fills its page ends it: nothing stands under it on the page.
  const fillCoverAt = (i: number) => {
    const o = db.owner[i];
    return fastrBlockFillsPage(o?.fence?.name, o?.fence?.attrs) !== undefined;
  };
  // Two adjacent non-blank lines of one block (no gap between them).
  const sameBlock = (a: number, b: number): boolean => {
    const oa = db.owner[a];
    const ob = db.owner[b];
    if (oa !== undefined || ob !== undefined) return oa === ob;
    if (inCode[a] || inCode[b]) {
      return inCode[a] && inCode[b] && fenceAt.get(a) !== "close" &&
        fenceAt.get(b) !== "open";
    }
    const ka = key[a];
    const kb = key[b];
    if (ka === "hr" || kb === "hr") return false;
    if (kb !== undefined && /^h[1-6]$/.test(kb)) return false;
    if (ka !== undefined && /^h[1-6]$/.test(ka)) return false;
    if (ka === kb) return true;
    // A plain line straight under a list item or a quote line continues it.
    return kb === "p" && (ka === "list" || ka === "bq");
  };
  if (metrics !== undefined) {
    let prev: number | undefined;
    let i = 0;
    while (i < n) {
      if (blank(i)) {
        let j = i;
        while (j + 1 < n && blank(j + 1)) j++;
        const k = j - i + 1;
        const next = j + 1 < n ? j + 1 : undefined;
        const lead = firstVisible === undefined || i < firstVisible;
        if (!lead && prev !== undefined) {
          const fill = fillCoverAt(prev);
          const mbPrev = fill ? 0 : marginsOf(metrics, key[prev]).mb;
          const mtNext = next !== undefined
            ? marginsOf(metrics, key[next]).mt
            : 0;
          if (k === 1) blankGap.set(i, fill ? 0 : Math.max(mbPrev, mtNext));
          else {
            blankGap.set(i, mbPrev);
            if (next !== undefined) spaceBottom.set(j, mtNext);
          }
        }
        i = j + 1;
        continue;
      }
      if (prev === i - 1 && i !== firstVisible && !sameBlock(prev, i)) {
        starts.add(i);
        const g = fillCoverAt(prev) ? marginsOf(metrics, key[i]).mt : Math.max(
          marginsOf(metrics, key[prev]).mb,
          marginsOf(metrics, key[i]).mt,
        );
        if (g > 0) gapTop.set(i, g);
      } else if (
        prev === i - 1 && key[prev] === "list" && key[i] === "list" &&
        db.owner[i] === undefined &&
        listDepthOf(doc.line(i + 1).text) < listDepthOf(doc.line(prev + 1).text)
      ) {
        // A nested list ends: its bottom margin collapses into the next
        // item's (the item line already carries the items' own margin).
        const g = marginsOf(metrics, "list").mb - metrics.liGap;
        if (g > 0) gapTop.set(i, g);
      }
      prev = i;
      i++;
    }
  }
  const rhythm: DocRhythm = {
    blank,
    key,
    inCode,
    fenceAt,
    blankGap,
    spaceBottom,
    gapTop,
    starts,
    bqFirst,
    bqLast,
    liNext,
    firstVisible,
  };
  rhythmCache.set(state.doc, { metrics, rhythm });
  return rhythm;
}
// A source line as the editor shows it (editorLineOf) with the rhythm's own
// classes and gap, for the oracle.
function rowOf(rhythm: DocRhythm, text: string, line: number): OracleRow {
  const gap = rhythm.gapTop.get(line);
  const style = gap === undefined ? undefined : `--fm-gap-top: ${gap}px`;
  const gapCls = gap === undefined ? "" : " cm-fm-gap";
  const fence = rhythm.fenceAt.get(line);
  if (fence !== undefined) {
    return {
      cls: `cm-fm-code-fence cm-fm-code-${fence}${
        fence === "open" ? gapCls : ""
      }`,
      text,
      style: fence === "open" ? style : undefined,
    };
  }
  if (rhythm.inCode[line]) {
    return { cls: "cm-fm-code-line", text, inner: "cm-fm-codetext" };
  }
  // A thematic break's line is the rule alone (HrWidget).
  if (HR_LINE_RE.test(text)) {
    return {
      cls: "",
      text: "",
      style: "height: 1px; line-height: 1px; font-size: 0; overflow: hidden",
    };
  }
  const base = editorLineOf(text);
  let cls = base.cls;
  if (cls === "cm-fm-bq") {
    if (rhythm.bqFirst.has(line)) cls += " cm-fm-bq-first";
    if (rhythm.bqLast.has(line)) cls += " cm-fm-bq-last";
  }
  if (cls === "cm-fm-li") {
    cls += listDepthCls(text);
    if (rhythm.liNext.has(line)) cls += " cm-fm-li-next";
  }
  return { cls: `${cls}${gapCls}`.trim(), text: base.text, style };
}

// The document's regions by line, computed once per document version.
type DocBlocks = {
  owner: (FastrLiveRegion | undefined)[];
  firstVisible: number | undefined;
};
const docBlocksCache = new WeakMap<DocText, DocBlocks>();
function docBlocksOf(state: EditorState): DocBlocks {
  const cached = docBlocksCache.get(state.doc);
  if (cached !== undefined) return cached;
  const owner: (FastrLiveRegion | undefined)[] = new Array(state.doc.lines)
    .fill(undefined);
  for (
    const r of fastrLiveRegions(state.doc.iterLines(1, state.doc.lines + 1))
  ) {
    for (
      let i = r.startLine;
      i <= r.endLine && i < owner.length;
      i++
    ) owner[i] = r;
  }
  const out = { owner, firstVisible: firstVisibleLine(state) };
  docBlocksCache.set(state.doc, out);
  return out;
}

// Heights for blocks the editor has not rendered, measured the editor's own
// way: the block's lines as line boxes with their editor classes, off
// screen inside the editor (so every rule that shapes a line applies), at
// the content column's width. CodeMirror's estimate for an unrendered line
// is a guess from its character count, which puts a heading at a third of
// its height, and a page laid out from guesses moves when it scrolls in.
class HeightOracle {
  private box: HTMLDivElement | undefined;
  private width = -1;
  private readonly cache = new Map<string, number>();
  constructor(private readonly view: EditorView) {}
  private ensure(): HTMLDivElement | undefined {
    const content = this.view.contentDOM;
    const cs = getComputedStyle(content);
    const w = content.clientWidth - (parseFloat(cs.paddingLeft) || 0) -
      (parseFloat(cs.paddingRight) || 0);
    if (!(w > 0)) return undefined;
    if (this.box === undefined) {
      const b = document.createElement("div");
      // The editor wraps its lines (cm-lineWrapping); without the class a
      // row measures as one line however long it runs.
      b.className = "cm-content cm-lineWrapping";
      b.setAttribute("aria-hidden", "true");
      b.style.cssText =
        "position:absolute;left:-100000px;top:0;visibility:hidden;pointer-events:none;padding:0 !important;max-width:none;";
      this.view.dom.append(b);
      this.box = b;
    }
    if (w !== this.width) {
      this.width = w;
      this.box.style.width = `${w}px`;
      this.cache.clear();
    }
    return this.box;
  }
  // A run of lines as the editor would show them (consecutive lines of a
  // paragraph, the items of a list), as one box.
  lines(rows: OracleRow[]): number | undefined {
    const key = rows.map((r) =>
      `${r.cls}\u0001${r.style ?? ""}\u0001${r.inner ?? ""}\u0001${r.text}`
    ).join("\u0000");
    const hit = this.cache.get(key);
    if (hit !== undefined) return hit;
    const box = this.ensure();
    if (box === undefined) return undefined;
    const els = rows.map((r) => {
      const el = document.createElement("div");
      el.className = `cm-line ${r.cls}`.trim();
      if (r.style !== undefined) el.style.cssText = r.style;
      if (r.inner !== undefined && r.text.length > 0) {
        const span = document.createElement("span");
        span.className = r.inner;
        span.textContent = r.text;
        el.append(span);
      } else {
        el.textContent = r.text.length > 0 ? r.text : "\u200b";
      }
      return el;
    });
    box.replaceChildren(...els);
    const h = els.length === 0
      ? 0
      : els[els.length - 1].getBoundingClientRect().bottom -
        els[0].getBoundingClientRect().top;
    this.cache.set(key, h);
    return h;
  }
  // A region's flow margins as the structure sheet declares them for print
  // (the --fm-mt/--fm-mb tokens beside every margin), px.
  regionMargins(cls: string, tag = "div"): { mt: number; mb: number } {
    const key = `\u0002${tag}.${cls}`;
    const mt = this.cache.get(`${key}|mt`);
    const mb = this.cache.get(`${key}|mb`);
    if (mt !== undefined && mb !== undefined) return { mt, mb };
    const box = this.ensure();
    if (box === undefined) return { mt: 0, mb: 0 };
    const el = document.createElement(tag);
    el.className = cls;
    box.replaceChildren(el);
    const cs = getComputedStyle(el);
    const fs = parseFloat(cs.fontSize) || 16;
    const px = (v: string) => {
      const t = v.trim();
      const n = parseFloat(t);
      if (!Number.isFinite(n)) return 0;
      return t.endsWith("em") && !t.endsWith("rem") ? n * fs : n;
    };
    // A block whose rule declares no tokens (a cover) has its computed margins.
    const vt = cs.getPropertyValue("--fm-mt");
    const vb = cs.getPropertyValue("--fm-mb");
    const out = {
      mt: vt.trim().length > 0 ? px(vt) : parseFloat(cs.marginTop) || 0,
      mb: vb.trim().length > 0 ? px(vb) : parseFloat(cs.marginBottom) || 0,
    };
    this.cache.set(`${key}|mt`, out.mt);
    this.cache.set(`${key}|mb`, out.mb);
    return out;
  }
  // Print's top margin of an element of this tag and class, px, as the
  // structure sheet rules it inside the editor's scope (a heading's 1.8em,
  // a blockquote's 1.4em, a code block's browser default).
  printMarginTop(tag: string, cls = ""): number {
    const key = `\u0003${tag}.${cls}`;
    const hit = this.cache.get(key);
    if (hit !== undefined) return hit;
    const box = this.ensure();
    if (box === undefined) return 0;
    const el = document.createElement(tag);
    if (cls.length > 0) el.className = cls;
    box.replaceChildren(el);
    const mt = parseFloat(getComputedStyle(el).marginTop) || 0;
    this.cache.set(key, mt);
    return mt;
  }
  // Print's bottom margin of an element of this tag and class, px.
  printMarginBottom(tag: string, cls = ""): number {
    const key = `\u0006${tag}.${cls}`;
    const hit = this.cache.get(key);
    if (hit !== undefined) return hit;
    const box = this.ensure();
    if (box === undefined) return 0;
    const el = document.createElement(tag);
    if (cls.length > 0) el.className = cls;
    box.replaceChildren(el);
    const mb = parseFloat(getComputedStyle(el).marginBottom) || 0;
    this.cache.set(key, mb);
    return mb;
  }
  // Print's left padding of an element of this tag, px (a list's indent).
  printPaddingLeft(tag: string): number {
    const key = `\u0005${tag}`;
    const hit = this.cache.get(key);
    if (hit !== undefined) return hit;
    const box = this.ensure();
    if (box === undefined) return 0;
    const el = document.createElement(tag);
    box.replaceChildren(el);
    const pl = parseFloat(getComputedStyle(el).paddingLeft) || 0;
    this.cache.set(key, pl);
    return pl;
  }
  // Print's top padding of an element of this tag, px (a quote's 0.2em).
  printPaddingTop(tag: string): number {
    const key = `\u0004${tag}`;
    const hit = this.cache.get(key);
    if (hit !== undefined) return hit;
    const box = this.ensure();
    if (box === undefined) return 0;
    const el = document.createElement(tag);
    box.replaceChildren(el);
    const pt = parseFloat(getComputedStyle(el).paddingTop) || 0;
    this.cache.set(key, pt);
    return pt;
  }
  // The figure reserve, px, measured as print's runner measures it
  // (FASTR_FIGURE_PAGE_CEILING's note): the probe in this sheet at the
  // column's width.
  figureReserve(): number | undefined {
    const key = "\u0007reserve";
    const hit = this.cache.get(key);
    if (hit !== undefined) return hit;
    const box = this.ensure();
    if (box === undefined) return undefined;
    const holder = document.createElement("div");
    holder.style.whiteSpace = "normal";
    holder.innerHTML = FASTR_FIGURE_RESERVE_PROBE_HTML;
    box.replaceChildren(holder);
    let reserve = 0;
    for (
      const probe of Array.from(
        holder.querySelectorAll<HTMLElement>("[data-fm-reserve-probe]"),
      )
    ) {
      const fig = probe.querySelector("figure");
      if (fig === null) continue;
      reserve = Math.max(
        reserve,
        fig.getBoundingClientRect().bottom - probe.getBoundingClientRect().top,
      );
    }
    box.replaceChildren();
    if (!(reserve > 0)) return undefined;
    const out = Math.ceil(reserve) + FASTR_FIGURE_RESERVE_SLACK_PX;
    this.cache.set(key, out);
    return out;
  }
  // The content column's width, px: what a block's line boxes wrap at.
  columnWidth(): number {
    this.ensure();
    return Math.max(0, this.width);
  }
  // The measures belong to one geometry (keepMeasuredEpoch).
  reset() {
    this.cache.clear();
    this.width = -1;
  }
  dispose() {
    this.box?.remove();
    this.box = undefined;
  }
}

type OracleRow = { cls: string; text: string; style?: string; inner?: string };
// A source line as the editor shows it: its line class and its text with
// the syntax the live preview conceals stripped (close enough to wrap the
// same).
const ORACLE_LIST_LINE_RE = /^\s*(?:[-*+]|\d+[.)])\s+/;
function editorLineOf(text: string): { cls: string; text: string } {
  const h = HEADING_LINE_RE.exec(text);
  if (h) {
    return {
      cls: `cm-fm-h${h[1].length}`,
      text: concealed(text.slice(h[0].length)),
    };
  }
  if (ORACLE_LIST_LINE_RE.test(text)) {
    return {
      cls: "cm-fm-li",
      text: concealed(text.replace(ORACLE_LIST_LINE_RE, "")),
    };
  }
  // A quote's line carries print's margins as padding (report_fastr_css.ts):
  // measured the editor's way, never taken for a plain paragraph.
  if (/^\s*>\s?/.test(text)) {
    return { cls: "cm-fm-bq", text: concealed(text.replace(/^\s*>\s?/, "")) };
  }
  return { cls: "", text: concealed(text) };
}
function concealed(text: string): string {
  return text
    .replace(FASTR_ALIGN_SUFFIX_RE, "")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]*)\]\{[^}]*\}/g, "$1")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\*\*|__|~~|`/g, "");
}

// The structure-sheet class a region renders with, for the widget clamp.
function regionClassOf(r: FastrLiveRegion): { cls: string; tag: string } {
  if (r.kind === "table") return { cls: "", tag: "table" };
  if (r.kind === "embed") return { cls: "fm-figure", tag: "figure" };
  const name = r.fence?.name ?? "";
  if (name === "contents") return { cls: "fm-toc", tag: "div" };
  return { cls: `fm-${name}`, tag: "div" };
}

// Every block's height as measured on screen, by kind and source text: a
// block that has been rendered keeps its real height wherever it goes and
// whether or not it is rendered now, so a page laid out once does not
// change as its blocks scroll out of CodeMirror's rendered range (their
// heights would otherwise fall back to estimates that differ by a pixel or
// two, and a seam that moves on scroll is the flicker Nick saw). The cache
// belongs to one geometry: the content column's width and the body font;
// a theme or page-size change starts it over.
const measuredBlockHeights = new Map<string, number>();
// Where a measured block may continue on the next page (innerCandidates),
// by the same key, as region-relative lines: a block that was split keeps
// its boundaries when it leaves the viewport, or the layout would lay it
// whole again and move every page after it.
const measuredInner = new Map<string, { rel: number; top: number }[]>();
// A table's header height (its repeat on continuation pages), by key.
const measuredRepeat = new Map<string, number>();
// A page's exact extent from the height map, by its blocks (pageBoxPlugin).
const measuredPageExtents = new Map<string, number>();
// The first height seen of a block whose embed is still pending, by key.
const pendingBlockHeights = new Map<string, number>();
let measuredEpoch = "";
const MEASURED_CAP = 4000;
function blockKey(kind: "r" | "p" | "s", text: string): string {
  return `${kind}\u0000${text}`;
}
function rememberBlockHeight(key: string, height: number): void {
  if (measuredBlockHeights.size >= MEASURED_CAP) {
    const first = measuredBlockHeights.keys().next().value;
    if (first !== undefined) {
      measuredBlockHeights.delete(first);
      measuredInner.delete(first);
      measuredRepeat.delete(first);
    }
  }
  measuredBlockHeights.set(key, height);
}
function keepMeasuredEpoch(view: EditorView): boolean {
  const cs = getComputedStyle(view.contentDOM);
  const epoch =
    `${view.contentDOM.clientWidth}|${cs.fontFamily}|${cs.fontSize}|${cs.lineHeight}`;
  if (epoch === measuredEpoch) return false;
  measuredEpoch = epoch;
  measuredBlockHeights.clear();
  measuredInner.clear();
  measuredParaRows.clear();
  paraRowHeight = undefined;
  measuredRepeat.clear();
  measuredPageExtents.clear();
  pendingBlockHeights.clear();
  return true;
}

// A region widget's inner break candidates, from its rendered DOM: every
// anchored descendant's top as an offset from the widget's content top (the
// seams already inside the widget do not count), ascending.
function innerCandidates(
  view: EditorView,
  startLine: number,
): { line: number; top: number }[] | undefined {
  const dom = view.contentDOM.querySelector<HTMLElement>(
    `[data-region-line="${startLine}"]`,
  );
  if (dom === null) return undefined;
  const domTop = dom.getBoundingClientRect().top;
  const seams = Array.from(
    dom.querySelectorAll<HTMLElement>(
      ".fm-page-gutter, .fm-page-gutter-repeat",
    ),
  )
    .map((s) => s.getBoundingClientRect())
    .sort((a, b) => a.top - b.top);
  const out: { line: number; top: number }[] = [];
  for (
    const el of Array.from(dom.querySelectorAll<HTMLElement>("[data-line]"))
  ) {
    const rel = Number(el.getAttribute("data-line"));
    if (!Number.isFinite(rel) || rel <= 0) continue;
    const r = el.getBoundingClientRect();
    let above = 0;
    for (const sr of seams) if (sr.bottom <= r.top + 0.5) above += sr.height;
    const top = r.top - domTop - above;
    if (top <= 0.5) continue;
    out.push({ line: startLine + rel, top });
  }
  out.sort((a, b) => a.top - b.top);
  // One candidate per position: the outermost anchor at a top wins (the
  // first pushed at that top, after the sort is stable by insertion).
  const dedup: { line: number; top: number }[] = [];
  for (const c of out) {
    if (
      dedup.length > 0 && Math.abs(dedup[dedup.length - 1].top - c.top) < 0.5
    ) continue;
    dedup.push(c);
  }
  return dedup;
}

// ── Paragraphs that run on to the next page ─────────────────────────────────
// A paragraph written on one source line is ONE CodeMirror line however many
// rows it wraps to, and a block widget only goes between lines. So the seam
// inside a paragraph is an INLINE widget whose element is a full-width float
// (PageRowSeamWidget): a float as wide as its line box never fits beside
// text, so the browser sets it down between two rows, and the rows wrap
// exactly as they would without it. That is the invariant everything here
// leans on: wherever the anchor drifts to as the text is edited, the rows
// measured are the paragraph's true rows, and the next measure moves the
// anchor back to the head of its row.
//
// At least this many rows stay at the foot of a page and carry over. Two
// and two (Nick, 2026-11-02): a single row alone at the head of a page
// ("above 93% the same month.") read as a mistake in print, so a split
// costs the page above at most a row.
const PARA_ORPHANS = 2;
const PARA_WIDOWS = 2;
// A paragraph line's rows, by the block's key: per source line, for a
// paragraph that has left the viewport.
const measuredParaRows = new Map<string, number[]>();
// A plain paragraph row's height, px, as last measured (one geometry).
let paraRowHeight: number | undefined;

function lineElementOf(view: EditorView, line0: number): HTMLElement | null {
  const at = view.domAtPos(view.state.doc.line(line0 + 1).from).node;
  const el = at instanceof HTMLElement ? at : at.parentElement;
  const line = el?.closest<HTMLElement>(".cm-line") ?? null;
  return line !== null && view.contentDOM.contains(line) ? line : null;
}

// The seams standing inside a rendered line (row seams), top to bottom.
function rowSeamsOf(el: HTMLElement): DOMRect[] {
  return Array.from(el.querySelectorAll<HTMLElement>(".fm-page-gutter--row"))
    .map((seam) => seam.getBoundingClientRect())
    .sort((a, b) => a.top - b.top);
}

// A rendered plain line's own height (without the row seams inside it) and
// its rows, when they are all one height; `lead` is what stands over the
// first row (the gap a line carries when no blank line is above it).
function lineRowsOf(
  view: EditorView,
  line0: number,
  lead: number,
): { own: number; rows: number; lh: number } | undefined {
  const el = lineElementOf(view, line0);
  if (el === null) return undefined;
  let own = el.getBoundingClientRect().height;
  for (const r of rowSeamsOf(el)) own -= r.height;
  const lh = parseFloat(getComputedStyle(el).lineHeight);
  if (!(lh > 0)) return { own, rows: 0, lh: 0 };
  const rows = Math.round((own - lead) / lh);
  // Rows of another height (a sized mark, an inline image): no boundaries.
  if (rows < 1 || Math.abs(lead + rows * lh - own) > 1.5) {
    return { own, rows: 0, lh };
  }
  // The row height the browser laid out at (its 1/64 px grid), not the
  // declared one: a page's foot stands on the sum of these.
  return { own, rows, lh: (own - lead) / rows };
}

// The document position that opens row `row` (0-based) of a rendered line.
function rowStartPos(
  view: EditorView,
  line0: number,
  row: number,
  lead: number,
): number | undefined {
  const el = lineElementOf(view, line0);
  if (el === null) return undefined;
  const line = view.state.doc.line(line0 + 1);
  const rect = el.getBoundingClientRect();
  const lh = parseFloat(getComputedStyle(el).lineHeight);
  if (!(lh > 0)) return undefined;
  // The row's top on screen: the rows above it, and the seams above it.
  let y = rect.top + lead + row * lh;
  let above = 0;
  for (const seam of rowSeamsOf(el)) {
    const k = Math.round((seam.top - rect.top - lead - above) / lh);
    if (k <= row) {
      y += seam.height;
      above += seam.height;
    }
  }
  let pos = view.posAtCoords({ x: rect.left + 2, y: y + lh / 2 }, false);
  if (pos <= line.from || pos > line.to) return undefined;
  // The first position drawn on that row.
  const topOf = (at: number) => view.coordsAtPos(at, 1)?.top;
  for (let n = 0; n < 4; n++) {
    const t = topOf(pos);
    if (t === undefined || t >= y - lh / 2) break;
    pos++;
  }
  for (let n = 0; n < 4 && pos - 1 > line.from; n++) {
    const t = topOf(pos - 1);
    if (t === undefined || t < y - lh / 2) break;
    pos--;
  }
  return pos > line.from && pos <= line.to ? pos : undefined;
}

// Up and Down across a row seam. CodeMirror moves the caret by asking what
// stands half a line above or below it; from the row beside a row seam that
// point is inside the seam, which answers with its own anchor, so Down
// landed on the row's head whatever the column and Up did not move at all.
// When the step would land in a row seam, step over it to the row beyond,
// keeping the goal column.
function moveAcrossRowSeam(
  view: EditorView,
  forward: boolean,
  extend: boolean,
): boolean {
  const sel = view.state.selection.main;
  const coords = view.coordsAtPos(sel.head, sel.assoc || (forward ? 1 : -1));
  if (coords === null) return false;
  const at = view.domAtPos(sel.head).node;
  const lineEl =
    (at instanceof HTMLElement ? at : at.parentElement)?.closest<HTMLElement>(
      ".cm-line",
    ) ?? null;
  if (lineEl === null) return false;
  const rowH = coords.bottom - coords.top;
  const probe = forward ? coords.bottom + rowH / 2 : coords.top - rowH / 2;
  for (const seam of rowSeamsOf(lineEl)) {
    if (probe < seam.top || probe > seam.bottom) continue;
    const content = view.contentDOM.getBoundingClientRect();
    const goal = sel.goalColumn ?? coords.left - content.left;
    const y = forward ? seam.bottom + rowH / 2 : seam.top - rowH / 2;
    const found = view.posAndSideAtCoords({ x: content.left + goal, y }, false);
    const range = extend
      ? EditorSelection.range(sel.anchor, found.pos, goal)
      : EditorSelection.cursor(found.pos, found.assoc, undefined, goal);
    view.dispatch({
      selection: range,
      scrollIntoView: true,
      userEvent: "select",
    });
    return true;
  }
  return false;
}
const rowSeamKeymap = Prec.high(keymap.of([
  {
    key: "ArrowDown",
    run: (v) => moveAcrossRowSeam(v, true, false),
    shift: (v) => moveAcrossRowSeam(v, true, true),
  },
  {
    key: "ArrowUp",
    run: (v) => moveAcrossRowSeam(v, false, false),
    shift: (v) => moveAcrossRowSeam(v, false, true),
  },
]));

// The caret's 0-based line when it stands in the blank lines that end the
// document (nothing but blank lines from it to the end), else -1.
function caretTrailingLine(state: EditorState): number {
  const doc = state.doc;
  const at = doc.lineAt(state.selection.main.head).number;
  for (let n = doc.lines; n >= at; n--) {
    if (doc.line(n).text.trim().length > 0) return -1;
  }
  return at - 1;
}

// Every block of the document with its height and the space above it, in
// document order: what layoutFastrPages lays out.
function flowBlocksOf(
  view: EditorView,
  hints: ReadonlyMap<string, FastrLayoutHint>,
  area: number,
  oracle: HeightOracle,
  geometry: PageBoxGeometry,
  resolver: EmbedResolver,
): FlowBlock[] {
  const doc = view.state.doc;
  const db = docBlocksOf(view.state);
  const metrics = view.state.field(printMetricsField, false);
  const rhythm = docRhythmOf(view.state, metrics);
  const vp = view.viewport;
  const rendered = (from: number, to: number) =>
    doc.line(from + 1).from >= vp.from && doc.line(to + 1).to <= vp.to;
  const blank = rhythm.blank;
  const textOf = (from: number, to: number) =>
    doc.sliceString(doc.line(from + 1).from, doc.line(to + 1).to);
  const blocks: FlowBlock[] = [];
  // The space above a block: the blank line over it, as tall as the rhythm
  // makes it (print's collapsed margins), nothing when the blocks touch.
  // From the source, never from positions: the height map places an
  // unrendered line by guesswork, so the source is the stable answer.
  const gapAt = (line: number) =>
    (line > 0 ? rhythm.blankGap.get(line - 1) : undefined) ?? 0;
  const push = (b: Omit<FlowBlock, "gap">) => {
    blocks.push({ ...b, gap: blocks.length === 0 ? 0 : gapAt(b.line) });
  };
  const start = db.firstVisible !== undefined
    ? Math.max(0, db.firstVisible - 1)
    : 0;
  let prevBlank = false;
  let i = 0;
  while (i < doc.lines) {
    const r = db.owner[i];
    if (r !== undefined) {
      const fence = r.fence;
      const name = fence?.name;
      if (name === "report") {
        i = r.endLine + 1;
        continue;
      }
      const top = lineBox(view, r.startLine).top;
      const bottom = lineBox(view, r.endLine).bottom;
      const text = textOf(r.startLine, r.endLine);
      let height = bottom - top;
      let domHeight: number | undefined;
      let imgH: number | undefined;
      let inner: { line: number; top: number }[] | undefined;
      let repeat: number | undefined;
      const isRendered = rendered(r.startLine, r.endLine);
      const key = blockKey("r", text);
      const { cls, tag } = regionClassOf(r);
      const figureBox = (dom: HTMLElement | null) =>
        r.kind === "embed"
          ? figureImageBox(
            view,
            resolver,
            text,
            geometry,
            oracle.columnWidth(),
            dom,
          )
          : undefined;
      if (isRendered) {
        // The widget's box holds the seams inside it (a block continued
        // across pages): the block's own height is the rest.
        const dom = view.contentDOM.querySelector<HTMLElement>(
          `[data-region-line="${r.startLine}"]`,
        );
        if (dom !== null) {
          for (
            const seam of Array.from(
              dom.querySelectorAll<HTMLElement>(
                ".fm-page-gutter, .fm-page-gutter-repeat",
              ),
            )
          ) {
            height -= seam.getBoundingClientRect().height;
          }
          // A table's header rows, repeated at the top of every page it
          // continues on to.
          if (r.kind === "table") {
            const thead = dom.querySelector<HTMLElement>("table > thead");
            repeat = thead !== null
              ? thead.getBoundingClientRect().height
              : undefined;
            if (repeat !== undefined) measuredRepeat.set(key, repeat);
          }
          // A figure the layout fitted shows its image shrunk: the block's
          // own height is the natural one, or the layout would find the
          // room it made and give it back.
          const fig = figureBox(dom);
          if (fig !== undefined) {
            imgH = fig.imgH;
            if (fig.fitted !== undefined) height += fig.imgH - fig.fitted;
          }
          if (dom.querySelector("[data-fm-pending]") !== null) {
            // An embed whose box is not known yet (applyFigureSize): the
            // widget's height is transient, not the block's. What was
            // measured before, else print's height, else the first height
            // seen while pending (steady, if wrong, rather than a chart's
            // canvas growing under the layout) stands until the size lands.
            const seen = measuredBlockHeights.get(key);
            const hint = hints.get(text);
            const provisional = pendingBlockHeights.get(key);
            domHeight = height;
            if (seen !== undefined) height = seen;
            else if (hint !== undefined) {
              height = hint.height + (rhythm.gapTop.get(r.startLine) ?? 0);
            } else if (provisional !== undefined) height = provisional;
            else pendingBlockHeights.set(key, height);
          } else {
            rememberBlockHeight(key, height);
            // Where the block may continue on the next page when it is
            // taller than a page, or than the room under the heading that
            // opened its page. Never a cover: it is its page.
            if (
              name !== "cover" && name !== "page" && height > area * INNER_SHARE
            ) {
              inner = innerCandidates(view, r.startLine);
              if (inner !== undefined) {
                measuredInner.set(
                  key,
                  inner.map((c) => ({ rel: c.line - r.startLine, top: c.top })),
                );
              } else measuredInner.delete(key);
            } else {
              measuredInner.delete(key);
            }
          }
        }
      } else {
        const seen = measuredBlockHeights.get(key);
        const hint = hints.get(text);
        repeat = measuredRepeat.get(key);
        if (seen !== undefined) {
          height = seen;
          inner = measuredInner.get(key)?.map((c) => ({
            line: r.startLine + c.rel,
            top: c.top,
          }));
        } else if (fastrBlockFillsPage(name, fence?.attrs) === "cover") {
          // A cover that fills its page is the sheet, whatever print's
          // height for its content.
          height = geometry.pageH;
        } else if (name === "pagebreak") {
          // The marker takes no room, in print or on the sheet (a rule laid
          // over the page's foot), whatever the height map guesses.
          height = 0;
        } else if (hint !== undefined) {
          // Print's height for the block, plus the gap its widget carries
          // when no blank line stands over it.
          height = hint.height + (rhythm.gapTop.get(r.startLine) ?? 0);
          // Print's boundaries for one taller than half a page, until the
          // editor has rendered and measured its own.
          if (name !== "cover" && name !== "page") {
            inner = hint.inner?.map((c) => ({
              line: r.startLine + c.rel,
              top: c.top,
            }));
          }
        }
        imgH = figureBox(null)?.imgH;
      }
      const fills = fastrBlockFillsPage(name, fence?.attrs);
      // A page template is its page's content area, whatever its contents
      // measure (they are clipped to it, and an overfull area is reported).
      if (fills === "template") {
        height = area - FASTR_TEMPLATE_SLACK_PX;
        inner = undefined;
      }
      // What print gives the block at the top of a page beyond its box: its
      // whole top margin, less what the widget carries itself (a gap over a
      // block with no blank line above it). The first block of the document
      // and a cover have no top margin in print either; a page break marker
      // has no box.
      const rm = marginsOf(metrics, regionKeyOf(r));
      const topExtra =
        name === "pagebreak" || name === "cover" || name === "page" ||
          r.startLine === start
          ? 0
          : Math.max(0, rm.mt - (rhythm.gapTop.get(r.startLine) ?? 0));
      const attrs = fence?.attrs ?? {};
      const brk = typeof attrs["break"] === "string"
        ? attrs["break"].toLowerCase()
        : "";
      push({
        line: r.startLine,
        endLine: r.endLine,
        top,
        bottom: top + height,
        text,
        height,
        heading: false,
        pagebreak: name === "pagebreak",
        // A page template and the contents are pages of their own.
        breakBefore: brk === "before" || fills === "template" ||
          name === "contents",
        breakAfter: brk === "after" || fills === "template" ||
          name === "contents",
        introduces: r.kind === "table" || r.kind === "embed",
        cover: name === "cover"
          ? (fills === "cover" ? "fill" : "natural")
          : undefined,
        inner,
        repeat,
        topExtra,
        // No flex: a figure is the size its author gave it wherever it
        // falls, so short of room at the foot of a page it moves whole to
        // the next, like every other block (the page it leaves shares its
        // leftover among its gaps instead: stretchesOf). It used to give up
        // to four tenths of its height here, which made one chart a
        // different size from the next (2026-10-01).
        flex: undefined,
        tail: undefined,
        rendered: isRendered,
        domHeight,
        imgH,
        kind: "r",
        printMt: rm.mt,
        printMb: rm.mb,
      });
      prevBlank = false;
      i = r.endLine + 1;
      continue;
    }
    if (blank(i)) {
      // The first blank line after content is the separator (space between
      // blocks); each further one is a line of space, a block of its own.
      if (prevBlank && i >= start) {
        const box = lineBox(view, i);
        const isRendered = rendered(i, i);
        // The last line of space before a block carries that block's top
        // margin under it (the rhythm): a space of its own height.
        const bottom = rhythm.spaceBottom.get(i);
        const key = blockKey("s", bottom === undefined ? "" : String(bottom));
        let height = box.bottom - box.top;
        if (isRendered) rememberBlockHeight(key, height);
        else {
          height = measuredBlockHeights.get(key) ??
            oracle.lines([{
              cls: "cm-fm-space",
              text: "",
              style: bottom === undefined
                ? undefined
                : `--fm-gap-bottom: ${bottom}px`,
            }]) ??
            height;
        }
        push({
          line: i,
          endLine: i,
          top: box.top,
          bottom: box.bottom,
          text: "",
          height,
          heading: false,
          pagebreak: false,
          breakBefore: false,
          breakAfter: false,
          rendered: isRendered,
          space: true,
          kind: "s",
          printMt: 0,
          printMb: 0,
        });
      }
      prevBlank = i >= start;
      i++;
      continue;
    }
    // One block per run of lines, split where the rhythm starts another (a
    // run of headings taken as ONE block could never break and ran past the
    // page's foot).
    let j = i;
    while (
      j + 1 < doc.lines && db.owner[j + 1] === undefined && !blank(j + 1) &&
      !rhythm.starts.has(j + 1)
    ) j++;
    const top = lineBox(view, i).top;
    const bottom = lineBox(view, j).bottom;
    const text = textOf(i, j);
    let height = bottom - top;
    const isRendered = rendered(i, j);
    const key = blockKey("p", text);
    // A plain paragraph may run on to the next page at a row boundary.
    let plainPara = true;
    for (let k = i; k <= j; k++) if (rhythm.key[k] !== "p") plainPara = false;
    let rowsPer: number[] | undefined;
    if (isRendered && plainPara) {
      // Its own box: the lines without the row seams standing inside them.
      let own = 0;
      let uniform = true;
      const per: number[] = [];
      for (let k = i; k <= j; k++) {
        const lr = lineRowsOf(view, k, rhythm.gapTop.get(k) ?? 0);
        if (lr === undefined) {
          uniform = false;
          own += lineBox(view, k).bottom - lineBox(view, k).top;
          continue;
        }
        own += lr.own;
        if (lr.rows === 0) uniform = false;
        else paraRowHeight = lr.lh;
        per.push(lr.rows);
      }
      height = own;
      if (uniform) {
        rowsPer = per;
        measuredParaRows.set(key, per);
      } else measuredParaRows.delete(key);
    }
    if (isRendered) rememberBlockHeight(key, height);
    else {
      // Once measured, that; else print's height for a plain paragraph
      // (it wraps in print exactly as in the editor); else the lines
      // measured the editor's way (a heading or a list carries editor-only
      // padding).
      const seen = measuredBlockHeights.get(key);
      if (seen !== undefined) height = seen;
      else {
        const rows: OracleRow[] = [];
        for (let k = i; k <= j; k++) {
          rows.push(rowOf(rhythm, doc.line(k + 1).text, k));
        }
        const plain = rows.every((row) =>
          row.cls === "" && row.style === undefined
        );
        const hint = plain ? hints.get(text)?.height : undefined;
        height = hint ?? oracle.lines(rows) ?? height;
      }
    }
    // What print gives the block at the top of a page beyond its box: the
    // first line's block's whole top margin (a heading's, a quote's, a code
    // block's; a paragraph has none), less the gap the line carries itself
    // when no blank line stands over it.
    const hm = HEADING_LINE_RE.exec(doc.line(i + 1).text);
    const pm = marginsOf(metrics, rhythm.key[i]);
    const topExtra = i === start
      ? 0
      : Math.max(0, pm.mt - (rhythm.gapTop.get(i) ?? 0));
    // The row boundaries it may continue at, orphans and widows kept.
    let paraInner: FlowBlock["inner"];
    if (plainPara && paraRowHeight !== undefined) {
      const lh = paraRowHeight;
      const lead = rhythm.gapTop.get(i) ?? 0;
      if (rowsPer === undefined) {
        rowsPer = measuredParaRows.get(key);
        // One source line never seen: its rows are its height's.
        if (rowsPer === undefined && i === j) {
          const n = Math.round((height - lead) / lh);
          if (n >= 1 && Math.abs(lead + n * lh - height) <= 1.5) rowsPer = [n];
        }
      }
      if (rowsPer !== undefined && rowsPer.length === j - i + 1) {
        const total = rowsPer.reduce((a, b) => a + b, 0);
        paraInner = [];
        let before = 0;
        for (let k = 0; k < rowsPer.length; k++) {
          for (let r = 0; r < rowsPer[k]; r++) {
            const q = before + r;
            if (q < PARA_ORPHANS || total - q < PARA_WIDOWS) continue;
            paraInner.push({
              line: i + k,
              row: r,
              blockRow: q,
              top: lead + q * lh,
            });
          }
          before += rowsPer[k];
        }
        if (paraInner.length === 0) paraInner = undefined;
      }
    }
    push({
      line: i,
      endLine: j,
      top,
      bottom: top + height,
      text,
      height,
      inner: paraInner,
      flow: paraInner !== undefined,
      heading: hm !== null,
      prose: hm === null &&
        (rhythm.key[i] === "p" || rhythm.key[i] === "list"),
      pagebreak: false,
      breakBefore: false,
      breakAfter: false,
      topExtra,
      rendered: isRendered,
      kind: "p",
      printMt: pm.mt,
      printMb: marginsOf(metrics, rhythm.key[j]).mb,
    });
    prevBlank = false;
    i = j + 1;
  }
  // Blank lines at the document's end are not content: print renders none,
  // and the layout keeps them on the last block's page (FastrLayoutBlock).
  // Except up to the caret: someone writing at the end of a full page gets
  // the next page to write on, not a caret under the footer. A stray blank
  // line nobody is on still opens nothing.
  const caret = caretTrailingLine(view.state);
  for (let k = blocks.length - 1; k > 0 && blocks[k].space; k--) {
    if (blocks[k].line > caret) blocks[k].trailing = true;
  }
  return blocks;
}

// ── Gap stretch ─────────────────────────────────────────────────────────────
// A page that ends because its next block did not fit shares the room left
// at its foot among the gaps between its blocks (the blank separator
// lines), each within a cap, so the page reads as set rather than cut
// short; the seam's filler takes what the gaps do not. A stretch is a line
// decoration on the separator (--fm-stretch, its padding-bottom in
// report_fastr_css.ts). The layout never sees it (gaps come from the
// source), and print gets the same gap as the next block's top margin
// (fastrGapStretchCss, from `print`).
type Stretches = {
  // Separator line → px added under it.
  lines: Map<number, number>;
  // The block after a stretched gap → its whole top margin in print, px.
  print: Map<number, number>;
  // The blank line at a page's foot (before the block that opens the next
  // page) → its height, px: the room the page has left for it, at most its
  // own. Print drops a margin that runs past the page's foot; the blank line
  // stands for it and must not run into the seam (a foot pulled up over it
  // stood the next page's box that much too tall).
  ends: Map<number, number>;
};
export const setStretches = StateEffect.define<Stretches>();
export const stretchField = StateField.define<
  Stretches & { deco: DecorationSet }
>({
  create: () => ({
    lines: new Map(),
    print: new Map(),
    ends: new Map(),
    deco: Decoration.none,
  }),
  update(value, tr) {
    for (const e of tr.effects) {
      if (e.is(setStretches)) {
        const ranges: Range<Decoration>[] = [];
        for (const [line, px] of e.value.lines) {
          if (line < 0 || line >= tr.state.doc.lines) continue;
          ranges.push(
            Decoration.line({ attributes: { style: `--fm-stretch: ${px}px` } })
              .range(tr.state.doc.line(line + 1).from),
          );
        }
        for (const [line, px] of e.value.ends) {
          if (line < 0 || line >= tr.state.doc.lines) continue;
          ranges.push(
            Decoration.line({ attributes: { style: `--fm-gap-end: ${px}px` } })
              .range(tr.state.doc.line(line + 1).from),
          );
        }
        ranges.sort((a, b) => a.from - b.from);
        return { ...e.value, deco: Decoration.set(ranges, true) };
      }
    }
    if (tr.docChanged) {
      const mapLine = lineMapper(tr);
      const remap = (m: Map<number, number>) => {
        const out = new Map<number, number>();
        for (const [line, px] of m) {
          const to = mapLine(line);
          if (to !== undefined) out.set(to, px);
        }
        return out;
      };
      return {
        lines: remap(value.lines),
        print: remap(value.print),
        ends: remap(value.ends),
        deco: value.deco.map(tr.changes),
      };
    }
    return value;
  },
  provide: (f) => EditorView.decorations.from(f, (v) => v.deco),
});
// A gap ABOVE a heading may grow this much (a section start welcomes
// room); one beside a figure or a block this much; one between two
// paragraphs this much; the gap under a heading never (a heading keeps its
// text); a leftover under the minimum is not worth spreading.
// OFF (Nick, 2026-09-21): a block moving to the next page re-spaced every
// paragraph on the page it left, and text shifting under the author while
// they type further down read as a bug each time it showed. A page now keeps
// its source spacing and the room left stays at its foot, in the editor and
// (no stretches being carried) in print. The machinery stays for a ruling
// the other way: flip this.
const GAP_STRETCH_ENABLED = false;
const STRETCH_CAP_HEADING_PX = 48;
const STRETCH_CAP_PX = 32;
const STRETCH_CAP_PROSE_PX = 12;
const STRETCH_MIN_PX = 20;
function sameStretches(
  a: Map<number, number>,
  b: Map<number, number>,
): boolean {
  if (a.size !== b.size) return false;
  for (const [k, v] of a) {
    const w = b.get(k);
    if (w === undefined || Math.abs(w - v) > 0.5) return false;
  }
  return true;
}
// The stretches for every page, and each page's total.
function stretchesOf(
  pages: readonly FastrPagedPage[],
  pageBlocks: readonly (readonly FlowBlock[])[],
  leftovers: readonly number[],
): Omit<Stretches, "ends"> & { totals: Map<number, number> } {
  const lines = new Map<number, number>();
  const print = new Map<number, number>();
  const totals = new Map<number, number>();
  const prose = (fb: FlowBlock) => fb.kind === "p" && !fb.heading;
  if (!GAP_STRETCH_ENABLED) return { lines, print, totals };
  for (let i = 0; i + 1 < pages.length; i++) {
    const list = pageBlocks[i];
    const last = list[list.length - 1];
    const nextFirst = pageBlocks[i + 1][0];
    // A page cut inside a block, or ended by a break or a cover, keeps its
    // foot: only the page whose next block did not fit is set.
    if (last === undefined || nextFirst === undefined) continue;
    if (pages[i + 1].firstLine !== nextFirst.line) continue;
    if (last.pagebreak || last.breakAfter || last.cover === "fill") continue;
    if (nextFirst.breakBefore || nextFirst.cover !== undefined) continue;
    // Nor one whose next page opens on a line of space: empty lines ran
    // over (someone pressing Enter at the page's end), no block was cut
    // off, and the paragraphs above must not shift as the page opens.
    if (nextFirst.space) continue;
    const leftover = leftovers[i];
    if (leftover < STRETCH_MIN_PX) continue;
    const gaps: { at: FlowBlock; prev: FlowBlock; cap: number }[] = [];
    for (let k = 1; k < list.length; k++) {
      const prev = list[k - 1];
      const cur = list[k];
      if (cur.gap <= 0 || prev.cover !== undefined || prev.heading) continue;
      const cap = cur.heading
        ? STRETCH_CAP_HEADING_PX
        : prose(prev) && prose(cur)
        ? STRETCH_CAP_PROSE_PX
        : STRETCH_CAP_PX;
      gaps.push({ at: cur, prev, cap });
    }
    if (gaps.length === 0) continue;
    // The same share to every gap, each capped at its own: the smallest
    // caps first, so what they cannot take goes to the others.
    gaps.sort((a, b) => a.cap - b.cap);
    let remaining = leftover;
    let total = 0;
    for (let g = 0; g < gaps.length; g++) {
      const share = Math.round(
        Math.min(gaps[g].cap, remaining / (gaps.length - g)),
      );
      if (share <= 0) continue;
      remaining -= share;
      total += share;
      lines.set(gaps[g].at.line - 1, share);
      // To the hundredth, as the editor's blank line is: a rounded print
      // margin stood the heading under it up to half a pixel off.
      print.set(
        gaps[g].at.line,
        snapPx(Math.max(gaps[g].prev.printMb, gaps[g].at.printMt) + share),
      );
    }
    if (total > 0) totals.set(pages[i].number, total);
  }
  return { lines, print, totals };
}

type BoxMeasure = {
  pag: EditorPagination;
  move?: FastrPagedResult;
  // With a move: where each page that opens inside a line starts.
  rowPos?: Map<number, number>;
  // Print's margins, measured: to land in printMetricsField before any
  // layout (the rhythm depends on them).
  metrics?: PrintMetrics;
  // The contents block's entries and the page each one's heading falls on.
  tocPages: { el: HTMLElement; text: string }[];
  // A seam's filler: the element when it is rendered, else the map only
  // (the widget's estimated height reads the map).
  writes: { el: HTMLElement | undefined; page: number; px: number }[];
  // The padding under the head of the seam that opens each page: what the
  // page's first block grows by at the top of a page (its topExtra).
  extras: { el: HTMLElement | undefined; page: number; px: number }[];
  // The figures to draw shrunk to their pages (--fm-fig-fit on the mount),
  // or restored (undefined): the layout's fits against what stands.
  fits: { el: HTMLElement | undefined; line: number; px: number | undefined }[];
  // The gaps to stretch, when they differ from those standing.
  stretch?: Stretches;
  // Mounts to size from their own drawn canvas (drawnCanvasSize): waiting
  // ones, and sized ones whose chart drew to another aspect.
  sizes: {
    mount: HTMLElement;
    id: string;
    line: number;
    size: { width: number; height: number };
  }[];
  // In-block seams to shift onto the sheet's edges (their stylesheet
  // centring assumes the block's content box is centred on the sheet; a
  // callout's left border alone puts it 2px off, and 2px past the sheet is
  // a horizontal scrollbar).
  aligns: { el: HTMLElement; marginLeft: number; width: number }[];
};

// Room kept free at the foot of every page: the editor's measure of a block
// and print's differ by a pixel or two on some blocks, and print must never
// find a page fuller than the editor did.
const LAYOUT_SAFETY_PX = 6;

function samePages(a: FastrPagedResult, b: FastrPagedResult): boolean {
  return a.total === b.total &&
    a.pages.every((p, i) => {
      const q = b.pages[i];
      return q !== undefined && p.firstLine === q.firstLine &&
        (p.firstRow ?? 0) === (q.firstRow ?? 0) &&
        p.para?.line === q.para?.line && p.para?.row === q.para?.row &&
        p.cover === q.cover &&
        p.flushTop === q.flushTop;
    }) &&
    a.splits.length === b.splits.length &&
    a.splits.every((s, i) => s.line === b.splits[i]?.line);
}

function pageBoxPlugin(resolver: EmbedResolver) {
  return ViewPlugin.fromClass(
    class {
      // A layout found but not yet dispatched: the next pass would find it
      // again from the same heights.
      pendingMove = false;
      // caretTrailingLine as last laid out: the layout depends on it.
      caretTrail = -1;
      // A widget that grows after it is measured (a figure's raster arriving)
      // changes the page under it without an editor update; the content box's
      // size says so.
      resize: ResizeObserver | undefined;
      readonly oracle: HeightOracle;
      constructor(readonly view: EditorView) {
        this.oracle = new HeightOracle(view);
        if (typeof ResizeObserver !== "undefined") {
          this.resize = new ResizeObserver(() => {
            view.requestMeasure();
            this.measure();
          });
          this.resize.observe(view.contentDOM);
        }
        this.markPaged(view.state);
        this.measure();
      }
      destroy() {
        this.resize?.disconnect();
        this.oracle.dispose();
        // The live-preview extensions leave with the mode (live preview off): the
        // flowing surface takes its scroll-past-end pad back.
        this.view.scrollDOM.classList.remove("cm-fm-paged");
      }
      update(u: ViewUpdate) {
        const landed = u.transactions.some((tr) =>
          tr.effects.some((e) =>
            e.is(setPagination) || e.is(setLayoutHints) || e.is(setPrintMetrics)
          )
        );
        const caretTrail = caretTrailingLine(u.state);
        const caretMoved = caretTrail !== this.caretTrail;
        this.caretTrail = caretTrail;
        if (
          landed || u.docChanged || u.viewportChanged || u.geometryChanged ||
          caretMoved
        ) {
          this.measure();
        }
        if (landed || u.docChanged) this.markPaged(u.state);
      }
      // While pages are DRAWN the sheet ends at the last page's foot: the
      // flowing surface's scroll-past-end pad would leave a strip of paper
      // below the last page's bottom edge, and the document would look like it
      // ran on past its own end (report_fastr_css.ts, .cm-fm-paged).
      //
      // The class goes on the SCROLLER, never on the content: CodeMirror's DOM
      // observer watches the content element for attributes as well as nodes
      // (it is how a browser rewriting the editor's DOM is caught), reads a
      // class of our own there as the browser having changed the document, and
      // answers it with EditorView.update([]) from its next forced flush,
      // which lands inside whatever update is running and throws "Calls to
      // EditorView.update are not allowed while an update is in progress".
      // CodeMirror also OWNS that class attribute (updateAttrs rewrites it
      // from its own facets), so the class would not have survived anyway.
      markPaged(state: EditorState) {
        const total =
          state.field(paginationField, false)?.pagination?.result.total ?? 0;
        this.view.scrollDOM.classList.toggle("cm-fm-paged", total > 0);
      }
      measure() {
        this.view.requestMeasure<BoxMeasure | undefined>({
          read: (view) => this.read(view),
          write: (m, view) => {
            if (!m) return;
            if (m.metrics !== undefined) {
              // The measured margins become the sheet's variables now and the
              // field's value on the next tick (a dispatch cannot run inside
              // the measure cycle); the layout waits for them.
              const { metrics, pag } = m;
              view.dom.style.setProperty(
                "--fm-p-margin",
                `${metrics.pMargin}px`,
              );
              view.dom.style.setProperty("--fm-li-gap", `${metrics.liGap}px`);
              view.dom.style.setProperty(
                "--fm-li-indent",
                `${metrics.liIndent}px`,
              );
              view.dom.style.setProperty("--fm-bq-pad", `${metrics.bqPad}px`);
              if (metrics.figReserve === undefined) {
                view.dom.style.removeProperty(FASTR_FIGURE_RESERVE_VAR);
              } else {
                view.dom.style.setProperty(
                  FASTR_FIGURE_RESERVE_VAR,
                  `${metrics.figReserve}px`,
                );
              }
              this.oracle.reset();
              setTimeout(() => {
                if (
                  view.state.field(paginationField, false)?.pagination !== pag
                ) return;
                view.dispatch({ effects: setPrintMetrics.of(metrics) });
              }, 0);
              return;
            }
            if (m.move !== undefined) {
              const { pag, move, rowPos } = m;
              // Pages the new layout no longer has leave nothing behind: a
              // seam created later for the end would read a stale extra.
              for (const map of [pag.fillers, pag.topExtras]) {
                if (map === undefined) continue;
                for (const n of Array.from(map.keys())) {
                  if (n > move.total) map.delete(n);
                }
              }
              this.pendingMove = true;
              // A dispatch cannot run inside the measure cycle that found the
              // layout; and only against the pagination it was measured on.
              setTimeout(() => {
                this.pendingMove = false;
                if (
                  view.state.field(paginationField, false)?.pagination !== pag
                ) {
                  // The document moved on while this waited (fast typing): the
                  // measures made meanwhile found the move pending and stood
                  // by, so ask again or the last one is never laid out.
                  this.measure();
                  return;
                }
                view.dispatch({
                  effects: setPagination.of({ ...pag, result: move, rowPos }),
                });
              }, 0);
              return;
            }
            for (const a of m.aligns) {
              a.el.style.marginLeft = `${a.marginLeft}px`;
              a.el.style.width = `${a.width}px`;
            }
            if (m.stretch !== undefined) {
              const { pag, stretch } = m;
              setTimeout(() => {
                if (
                  view.state.field(paginationField, false)?.pagination !== pag
                ) return;
                view.dispatch({ effects: setStretches.of(stretch) });
              }, 0);
            }
            for (const sz of m.sizes) {
              derivedFigureSizes.set(sz.id, sz.size);
              applyFigureSize(sz.mount, sz.size);
              applyFigureFit(sz.mount, m.pag.figureFits?.get(sz.line));
            }
            for (const t of m.tocPages) {
              t.el.setAttribute("data-fm-page", t.text);
            }
            if (
              m.writes.length === 0 && m.aligns.length === 0 &&
              m.extras.length === 0 &&
              m.fits.length === 0 && m.sizes.length === 0
            ) return;
            m.pag.fillers ??= new Map();
            m.pag.topExtras ??= new Map();
            m.pag.figureFits ??= new Map();
            for (const w of m.writes) {
              if (w.el !== undefined) {
                w.el.style.paddingTop = `${Math.max(0, w.px)}px`;
                const foot = w.el.querySelector<HTMLElement>(
                  ".fm-page-gutter__foot",
                );
                if (foot !== null) {
                  foot.style.marginTop = w.px < 0 ? `${w.px}px` : "";
                }
              }
              m.pag.fillers.set(w.page, w.px);
            }
            for (const x of m.extras) {
              if (x.el !== undefined) x.el.style.paddingBottom = `${x.px}px`;
              m.pag.topExtras.set(x.page, x.px);
            }
            for (const f of m.fits) {
              if (f.el !== undefined) applyFigureFit(f.el, f.px);
              if (f.px === undefined) m.pag.figureFits.delete(f.line);
              else m.pag.figureFits.set(f.line, f.px);
            }
            view.requestMeasure();
          },
        });
      }
      read(view: EditorView): BoxMeasure | undefined {
        const pag = view.state.field(paginationField, false)?.pagination;
        if (!pag) return undefined;
        const geometry = readPageBoxGeometry(view);
        if (geometry === undefined) return undefined;
        const hints = view.state.field(layoutHintsField, false) ??
          new Map<string, FastrLayoutHint>();
        const layoutGeometry: FastrLayoutGeometry = {
          pageH: geometry.pageH,
          marginPx: geometry.marginPx,
          sheetW: geometry.sheetPx ?? pag.result.sheet.width,
          safety: LAYOUT_SAFETY_PX,
        };
        const area = geometry.pageH - 2 * geometry.marginPx - LAYOUT_SAFETY_PX;
        const epochChanged = keepMeasuredEpoch(view);
        if (epochChanged) this.oracle.reset();
        // Print's margins, measured in this sheet, before any layout: the
        // rhythm (every blank line's height) is made of them. Measured again
        // when the geometry changes (another theme, another width).
        const metricsStanding = view.state.field(printMetricsField, false);
        if (metricsStanding === undefined || epochChanged) {
          const measured = measurePrintMetrics(this.oracle);
          if (
            metricsStanding === undefined ||
            JSON.stringify(measured) !== JSON.stringify(metricsStanding)
          ) {
            return {
              pag,
              metrics: measured,
              writes: [],
              aligns: [],
              extras: [],
              fits: [],
              sizes: [],
              tocPages: [],
            };
          }
        }
        const rhythm = docRhythmOf(view.state, metricsStanding);
        // The layout, from the heights as they stand.
        const blocks = flowBlocksOf(
          view,
          hints,
          area,
          this.oracle,
          geometry,
          resolver,
        );
        const laid = layoutFastrPages(blocks, layoutGeometry);
        // Where the pages that open inside a line start: the head of the row,
        // from the rendered line (the row seam never re-wraps its paragraph,
        // so the rows read are the true ones wherever the anchor has drifted);
        // a line not rendered keeps the position it had.
        const rowPos = new Map<number, number>();
        let rowsMoved = false;
        for (const page of laid.pages) {
          if (
            page.firstLine === undefined || page.firstRow === undefined ||
            page.firstRow <= 0
          ) continue;
          const had = pag.rowPos?.get(page.number);
          const found = rowStartPos(
            view,
            page.firstLine,
            page.firstRow,
            rhythm.gapTop.get(page.firstLine) ?? 0,
          );
          const at = found ?? had;
          if (at !== undefined) rowPos.set(page.number, at);
          if (at !== had) rowsMoved = true;
        }
        if (!this.pendingMove && (!samePages(laid, pag.result) || rowsMoved)) {
          return {
            pag,
            move: laid,
            rowPos,
            writes: [],
            aligns: [],
            extras: [],
            fits: [],
            sizes: [],
            tocPages: [],
          };
        }
        const writes: BoxMeasure["writes"] = [];
        const aligns: BoxMeasure["aligns"] = [];
        const sheetRect = view.scrollDOM.getBoundingClientRect();
        // In-block seams, aligned to the sheet from their rendered position.
        for (
          const seam of Array.from(
            view.contentDOM.querySelectorAll<HTMLElement>(
              ".fm-page-gutter--inner",
            ),
          )
        ) {
          // The strip that must span the sheet: the seam itself, or inside a
          // table its sheet box (seamRow).
          const strip =
            seam.querySelector<HTMLElement>(".fm-page-gutter__sheet") ?? seam;
          const r = strip.getBoundingClientRect();
          const dx = r.left - sheetRect.left;
          const dw = r.width - sheetRect.width;
          if (Math.abs(dx) > 0.5 || Math.abs(dw) > 0.5) {
            const current = parseFloat(getComputedStyle(strip).marginLeft) || 0;
            aligns.push({
              el: strip,
              marginLeft: current - dx,
              width: sheetRect.width,
            });
          }
        }
        // Every seam element by the page it starts (the end element by
        // total + 1), for the fillers.
        const seamEls = new Map<number, HTMLElement>();
        for (
          const el of Array.from(
            view.contentDOM.querySelectorAll<HTMLElement>(".fm-page-gutter"),
          )
        ) {
          const n = Number(el.getAttribute("data-page"));
          if (Number.isFinite(n) && !seamEls.has(n)) seamEls.set(n, el);
        }
        // Each page's filler from the layout's own numbers (the blocks and
        // gaps it stacked, plus the blank separator line that trails the
        // page's last block), never from the DOM: the same heights that
        // placed the seam pad the page, on screen or not, so a box is the
        // same size before and after its lines are rendered.
        const doc = view.state.doc;
        const pages = laid.pages;
        // The blocks that START on each page, in order (a block continued from
        // the page before is that page's).
        const pageBlocks: FlowBlock[][] = pages.map(() => []);
        {
          let b = 0;
          for (let i = 0; i < pages.length; i++) {
            const to = pages[i + 1]?.firstLine ?? doc.lines;
            // A paragraph the next page opens inside of starts on this one.
            const inside = (pages[i + 1]?.firstRow ?? 0) > 0;
            while (
              b < blocks.length &&
              (blocks[b].line < to || (inside && blocks[b].line === to))
            ) {
              pageBlocks[i].push(blocks[b++]);
            }
          }
        }
        // What each page has left under its content: beyond the heights the
        // layout stacked, what the page's widgets show (an embed pending its
        // size) and the separator line trailing the page's last block stay on
        // the page before the seam.
        // A rendered page that starts and ends between blocks measures its
        // extent from the height map instead (the same heights, to the 1/64
        // px the browser laid them out at, less the stretches standing on its
        // separators): the sum of the layout's rounded numbers drifts from the
        // browser's by hundredths, and a page box a hundredth off the sheet
        // puts every page after it off the pixel grid, its glyphs drawn on
        // another sub-pixel phase than print's.
        const standingStretch = view.state.field(stretchField, false)?.lines;
        const vp = view.viewport;
        const renderedRange = (from: number, to: number) =>
          doc.line(from + 1).from >= vp.from && doc.line(to + 1).to <= vp.to;
        const pageKeyOf = (i: number) =>
          `${i === 0 ? 1 : 0}\u0000${
            pageBlocks[i].map((fb) => fb.text).join("\u0001")
          }`;
        const measuredExtent = (i: number): number | undefined => {
          const startLine = i === 0
            ? pageBlocks[0][0]?.line
            : pages[i].firstLine;
          const nextLine = pages[i + 1]?.firstLine;
          if (
            startLine === undefined || nextLine === undefined ||
            nextLine <= startLine
          ) return undefined;
          if (
            pageBlocks[i][0]?.line !== startLine ||
            pageBlocks[i + 1][0]?.line !== nextLine
          ) return undefined;
          // Remembered by the page's content once measured: a page that has
          // scrolled out of view keeps its exact extent rather than falling
          // back to the layout's sum, or its seam would move by a fraction
          // every time it left the viewport and came back.
          const pageKey = pageKeyOf(i);
          if (!renderedRange(startLine, nextLine - 1)) {
            return measuredPageExtents.get(pageKey);
          }
          let top = lineBox(view, startLine).top;
          if (i > 0 && pageBlocks[i][0]?.kind === "r") {
            // A region that opens a page holds the page's seam inside its own
            // widget (applyRegionPagination): the page's content starts under it.
            const own = view.contentDOM.querySelector<HTMLElement>(
              `[data-region-line="${startLine}"] .fm-page-gutter[data-page="${
                i + 1
              }"]`,
            );
            if (own === null) return undefined;
            top += own.getBoundingClientRect().height;
          }
          let extent = lineBox(view, nextLine - 1).bottom - top;
          if (standingStretch !== undefined) {
            for (const [line, px] of standingStretch) {
              if (line >= startLine && line < nextLine) extent -= px;
            }
          }
          if (measuredPageExtents.size >= MEASURED_CAP) {
            const first = measuredPageExtents.keys().next().value;
            if (first !== undefined) measuredPageExtents.delete(first);
          }
          measuredPageExtents.set(pageKey, extent);
          return extent;
        };
        const ends = new Map<number, number>();
        const leftovers = pages.map((page, i) => {
          const list = pageBlocks[i];
          const last = list[list.length - 1];
          const to = pages[i + 1]?.firstLine ?? doc.lines;
          let extent = page.contentHeight;
          for (const fb of list) {
            if (fb.domHeight !== undefined) {
              extent += fb.domHeight - fb.height;
            }
          }
          if (last !== undefined && last.endLine < to) {
            const after = last.endLine + 1;
            if (after < doc.lines && after < to && rhythm.blank(after)) {
              // The blank line at the page's foot takes the room left, at
              // most its own height (Stretches.ends).
              const trail = rhythm.blankGap.get(after) ?? 0;
              const endGap = Math.max(
                0,
                Math.min(trail, fastrPageArea(layoutGeometry, page) - extent),
              );
              if (endGap < trail - 0.01) ends.set(after, snapPx(endGap));
              extent += endGap;
            }
          }
          // The measured extent stands in for the sum only when it is the
          // same page to within a couple of pixels: while a move is pending
          // the seams on screen are the last layout's, and one standing
          // inside the page would be measured as content (and remembered).
          const measured = this.pendingMove ? undefined : measuredExtent(i);
          if (measured !== undefined) {
            const extra = i === 0 ? 0 : (list[0]?.topExtra ?? 0);
            if (Math.abs(measured + extra - extent) <= 2) {
              return fastrPageArea(layoutGeometry, page) - extra - measured;
            }
            measuredPageExtents.delete(pageKeyOf(i));
          }
          return fastrPageArea(layoutGeometry, page) - extent;
        });
        const stretch = stretchesOf(pages, pageBlocks, leftovers);
        // The filler pads what the stretched gaps leave. A page full to the
        // pixel (its trailing separator line past the area, within the
        // safety) has a negative filler: the seam's foot moves up by it.
        for (let i = 0; i < pages.length; i++) {
          const page = pages[i];
          // To the 1/64 px the browser lays out at: a filler rounded to the
          // pixel left every page top a fraction off the sheet's grid, and
          // the glyphs on it drawn on another sub-pixel phase than print's.
          const filler = Math.round(
            (leftovers[i] - (stretch.totals.get(page.number) ?? 0)) * 64,
          ) / 64;
          const el = seamEls.get(page.number + 1);
          const current = el !== undefined
            ? (parseFloat(el.style.paddingTop) || 0) +
              (parseFloat(
                el.querySelector<HTMLElement>(".fm-page-gutter__foot")?.style
                  .marginTop ?? "",
              ) || 0)
            : pag.fillers?.get(page.number) ?? -1000;
          if (Math.abs(filler - current) > 0.05) {
            writes.push({ el, page: page.number, px: filler });
          }
        }
        const standing = view.state.field(stretchField, false);
        const stretchOut = standing !== undefined &&
            (!sameStretches(standing.lines, stretch.lines) ||
              !sameStretches(standing.ends, ends))
          ? { lines: stretch.lines, print: stretch.print, ends }
          : undefined;
        // The seam that opens each page carries the page's first block's
        // extra under its head (a page a continuation opens has none).
        const extras: BoxMeasure["extras"] = [];
        const byLine = new Map<number, FlowBlock>();
        for (const fb of blocks) byLine.set(fb.line, fb);
        for (const page of pages) {
          if (page.number < 2 || page.firstLine === undefined) continue;
          // To the hundredth: print keeps the block's exact margin at the page
          // top, and a rounded seam stood the whole page up to half a pixel off.
          // None for a page a paragraph runs on to: no block begins there.
          const px = page.para !== undefined
            ? 0
            : snapPx(byLine.get(page.firstLine)?.topExtra ?? 0);
          const el = seamEls.get(page.number);
          const current = el !== undefined
            ? parseFloat(el.style.paddingBottom) || 0
            : pag.topExtras?.get(page.number) ?? 0;
          if (Math.abs(px - current) > 0.05) {
            extras.push({ el, page: page.number, px });
          }
        }
        // The contents block's entries: the page each heading falls on, as
        // print's target-counter gives it (the CSS draws data-fm-page).
        const tocPages: BoxMeasure["tocPages"] = [];
        for (
          const a of Array.from(
            view.contentDOM.querySelectorAll<HTMLElement>(
              ".cm-fm-leaf a[data-toc-line]",
            ),
          )
        ) {
          const line1 = Number(a.getAttribute("data-toc-line"));
          if (!Number.isFinite(line1)) continue;
          let page = 1;
          for (const p of pages) {
            if ((p.firstLine ?? 0) <= line1 - 1) page = p.number;
          }
          const text = String(page);
          if (a.getAttribute("data-fm-page") !== text) {
            tocPages.push({ el: a, text });
          }
        }
        // Mounts whose drawn chart says their size: one still waiting for
        // it, or one boxed to another aspect than the chart drew.
        const sizes: BoxMeasure["sizes"] = [];
        for (
          const mount of Array.from(
            view.contentDOM.querySelectorAll<HTMLElement>(
              '[data-embed-kind="figure"]',
            ),
          )
        ) {
          const drawn = drawnCanvasSize(mount);
          if (drawn === undefined) continue;
          const w = parseFloat(mount.style.getPropertyValue("--fm-fig-w"));
          const h = parseFloat(mount.style.getPropertyValue("--fm-fig-h"));
          const boxed = Number.isFinite(w) && Number.isFinite(h) && h > 0
            ? { width: w, height: h }
            : undefined;
          if (boxed !== undefined && sameAspect(boxed, drawn)) continue;
          const id = mount.getAttribute("data-embed-id") ?? "";
          const line = Number(
            mount.closest("[data-region-line]")?.getAttribute(
              "data-region-line",
            ),
          );
          if (id.length === 0 || !Number.isFinite(line)) continue;
          sizes.push({ mount, id, line, size: drawn });
        }
        // The figures the layout shrank to their pages, against what their
        // mounts show (or the map, for one not rendered).
        const fits: BoxMeasure["fits"] = [];
        const shrinkByLine = new Map<number, number>();
        for (const f of laid.fits ?? []) shrinkByLine.set(f.line, f.shrink);
        for (const fb of blocks) {
          if (fb.imgH === undefined) continue;
          const shrink = shrinkByLine.get(fb.line);
          // To the hundredth, as the layout placed it: a fit rounded to the
          // pixel stood the page's foot up to half a pixel off the grid.
          const px = shrink !== undefined
            ? snapPx(fb.imgH - shrink)
            : undefined;
          const mount = view.contentDOM.querySelector<HTMLElement>(
            `[data-region-line="${fb.line}"] [data-embed-kind="figure"][data-fm-sized]`,
          );
          const shown = mount !== null
            ? parseFloat(mount.style.getPropertyValue("--fm-fig-fit"))
            : pag.figureFits?.get(fb.line);
          const cur = shown !== undefined && Number.isFinite(shown)
            ? shown
            : undefined;
          const same = px === cur ||
            (px !== undefined && cur !== undefined &&
              Math.abs(px - cur) <= 0.05);
          if (!same) fits.push({ el: mount ?? undefined, line: fb.line, px });
        }
        return {
          pag,
          writes,
          aligns,
          extras,
          fits,
          stretch: stretchOut,
          sizes,
          tocPages,
        };
      }
    },
  );
}

const paginationPlugin = ViewPlugin.fromClass(
  class {
    update(u: ViewUpdate) {
      const landed = u.transactions.some((tr) =>
        tr.effects.some((e) => e.is(setPagination))
      );
      if (!landed) return;
      for (
        const el of Array.from(
          u.view.contentDOM.querySelectorAll<HTMLElement>(
            ".fm-live-region[data-region-line]",
          ),
        )
      ) {
        const start = Number(el.getAttribute("data-region-line"));
        if (Number.isFinite(start)) applyRegionPagination(el, start, u.view);
      }
      u.view.requestMeasure();
    }
  },
);

// ── Stable text metrics ──────────────────────────────────────────────────────
// CodeMirror estimates the height of every line it has not rendered from ONE
// sample: the first rendered line of at most 20 characters whose children are
// plain text (docView.measureTextSize). On this surface those short lines are
// headings, kickers and the line being typed, each in its own font, so the
// sampled character width flips as the rendered range shifts (7.6px, then
// 12px, then 10.5px…). A change of more than 0.1px makes CodeMirror THROW
// AWAY its whole height map and rebuild it from estimates, which then
// converge over several frames: pressing Enter and typing at the start of a
// new line made the page above the caret shuffle in line-height steps for a
// second. A mark over the text of every short line turns its children into
// mark views, which the sampler skips, so CodeMirror always falls back to its
// dummy line (a plain cm-line in the body font, off-screen): one constant
// measure. The mark carries no style.
const noSampleMark = Decoration.mark({ class: "cm-fm-nosample" });
const stableTextMetricsPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = this.build(view);
    }
    update(u: ViewUpdate) {
      if (u.docChanged || u.viewportChanged) {
        this.decorations = this.build(u.view);
      }
    }
    build(view: EditorView): DecorationSet {
      const builder = new RangeSetBuilder<Decoration>();
      const doc = view.state.doc;
      for (const { from, to } of view.visibleRanges) {
        for (let pos = from; pos <= to;) {
          const line = doc.lineAt(pos);
          if (line.length > 0 && line.length <= 20) {
            builder.add(line.from, line.to, noSampleMark);
          }
          if (line.to >= to) break;
          pos = line.to + 1;
        }
      }
      return builder.finish();
    }
  },
  { decorations: (v) => v.decorations },
);

export function livePreviewExtensions(
  resolver: EmbedResolver,
  collab?: PresenceDeps,
): Extension[] {
  return [
    stableTextMetricsPlugin,
    printMetricsField,
    ...liveRegionExtensions(resolver),
    surfaceLineField,
    concealPlugin,
    markAwareEdits,
    alignAwareEdits,
    alignEdgeSpace,
    livePreviewTheme,
    sheetBleedVars,
    docGroundPlugin(resolver),
    embedSizePlugin(resolver),
    paginationField,
    layoutHintsField,
    stretchField,
    paginationPlugin,
    pageBoxPlugin(resolver),
    rowSeamKeymap,
    heldLinesPlugin,
    islandCarryPlugin,
    islandCarryListener,
    ...(collab ? [regionPresencePlugin(collab), presenceFacet.of(collab)] : []),
  ];
}
