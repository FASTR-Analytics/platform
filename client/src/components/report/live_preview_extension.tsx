// =============================================================================
// Live preview — the Obsidian-style editing surface for FASTR reports.
//
// The markdown stays the CodeMirror document (so yCollab, per-user undo and
// the toolbar are untouched); this file only DECORATES it. Three layers:
//
//   • Region widgets: every top-level `:::` region, table and embed line
//     (lib/fastr_live_regions.ts) is replaced by a block widget holding its
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
  layer,
  RectangleMarker,
  ViewPlugin,
  type ViewUpdate,
  WidgetType,
} from "@codemirror/view";
import {
  Annotation,
  EditorState as CMEditorState,
  Facet,
  RangeSetBuilder,
  StateEffect,
  StateField,
  Transaction,
  type EditorState,
  type Extension,
  type Range,
  type Text as DocText,
} from "@codemirror/state";
import { syntaxTree } from "@codemirror/language";
import { render } from "solid-js/web";
import { Show } from "solid-js";
import type { Awareness } from "y-protocols/awareness";
import * as Y from "yjs";
import { hideMenu, type MenuItem, showMenu } from "panther";
import {
  layoutFastrPages,
  fastrPageArea,
  type FastrLayoutBlock,
  type FastrLayoutGeometry,
  applyTableCellAction,
  applyStepsChildAction,
  applyTilesChildAction,
  fastrSurfaceTone,
  FM_BOX_GAP,
  FM_BOX_INSET,
  FM_BOX_PAD_BOTTOM,
  type FastrLiveRegion,
  type FastrOpenFence,
  type FastrPagedPage,
  type FastrPagedResult,
  fastrLiveRegions,
  fastrDocumentOutline,
  fastrMarkClass,
  fastrMarkStyle,
  fastrStripInlineSyntax,
  linePrefixLength,
  fastrTocOptions,
  fastrOpenFenceOnLine,
  isDarkCssColor,
  isFastrEmbedLine,
  isFastrLeafBlock,
  parseContainerFence,
  parseFastrMarkAttrs,
  readFastrDocumentSettings,
  renderFastrMarkdownToHtml,
  safeCssColor,
  scanContainerLines,
  t3,
  TILES_MAX_COLS,
  renderFastrTocHtml,
  type StepsChildAction,
  stepsChildInfo,
  tilesChildInfo,
  updateContainerFenceLine,
  FASTR_BLOCK_NAMES,
  type FastrLayoutHint,
  type FigureBlock,
} from "lib";
import {
  materializeReportBackgrounds,
  sanitizeReportHtml,
} from "./report_html";
import type { EmbedResolver } from "./figure_widget_extension";
import { ReportFigureEmbed } from "./ReportFigureEmbed";

// The scope class the host puts on the editor wrapper and passes to
// buildFastrReportCss / buildFastrEditorSurfaceCss. One name, three users.
export const FM_LIVE_SCOPE_CLASS = "fm-live-scope";



// ── Document-aware helpers ───────────────────────────────────────────────────
// The in-place editors run in two places: inside CodeMirror widgets (the app
// document) and on the pages of the paged surface, which live in an iframe.
// Every selection, range and listener must belong to the element's OWN
// document, and a menu anchored to an iframe event needs the frame's offset.
function docOf(el: Node): Document {
  return el.ownerDocument ?? document;
}
function winOf(el: Node): Window {
  return docOf(el).defaultView ?? window;
}
function menuAnchor(e: MouseEvent): { x: number; y: number; width: number; height: number } {
  const target = e.target as Node | null;
  const frame = target?.ownerDocument?.defaultView?.frameElement;
  const r = frame?.getBoundingClientRect();
  return { x: e.clientX + (r?.left ?? 0), y: e.clientY + (r?.top ?? 0), width: 0, height: 0 };
}

// The block chrome that edits in place: [root class, child class, attr,
// placeholder, whether an untitled block grows a ghost row to click into].
export function chromeAttrRows(): [string, string, string, string, boolean][] {
  return [
    ["fm-callout", "fm-callout__title", "title", t3({ en: "Title…", fr: "Titre…", pt: "Título…" }), true],
    ["fm-card", "fm-card__title", "title", t3({ en: "Title…", fr: "Titre…", pt: "Título…" }), true],
    ["fm-band", "fm-kicker", "kicker", t3({ en: "Kicker…", fr: "Surtitre…", pt: "Antetítulo…" }), true],
    ["fm-cover", "fm-kicker", "kicker", t3({ en: "Kicker…", fr: "Surtitre…", pt: "Antetítulo…" }), true],
    ["fm-band", "fm-dek", "sub", t3({ en: "Subtitle…", fr: "Sous-titre…", pt: "Subtítulo…" }), false],
    ["fm-cover", "fm-dek", "sub", t3({ en: "Subtitle…", fr: "Sous-titre…", pt: "Subtítulo…" }), false],
    ["fm-quote", "fm-quote__cite", "cite", t3({ en: "Source…", fr: "Source…", pt: "Fonte…" }), false],
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

function selectionTouches(state: EditorState, from: number, to: number): boolean {
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
    // claim below), which starves panther's document-level menu dismiss — so
    // an open context menu is closed HERE, in the capture phase, before any
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
    dom.addEventListener("click", (e) => {
      const embed = (e.target as HTMLElement).closest<HTMLElement>(
        "[data-embed-id]",
      );
      if (embed) {
        e.stopPropagation();
        self().resolver.onSelectEmbed(
          (embed.getAttribute("data-embed-kind") ?? "figure") as
            | "figure"
            | "image",
          embed.getAttribute("data-embed-id") ?? "",
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

    // Figures mount the LIVE component (same as the standalone embed widget) —
    // not the preview's raster path — inside the true themed <figure> chrome.
    const disposers: (() => void)[] = [];
    for (const img of Array.from(dom.querySelectorAll("img"))) {
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
      applyFigureSize(mount, figureSizeOf(this.resolver, id, this.resolver.getFigure(id)));
      applyFigureFit(mount, view.state.field(paginationField, false)?.pagination?.figureFits?.get(this.startLine));
      img.replaceWith(mount);
      disposers.push(render(
        () => (
          <Show when={this.resolver.getFigure(id)} fallback={
            <div class="text-danger text-xs">
              {t3({
                en: "Missing visualization:",
                fr: "Visualisation manquante :",
                pt: "Visualização em falta:",
              })} {id}
            </div>
          }>
            {(fig) => (
              <ReportFigureEmbed
                figure={fig()}
                onMeasured={() => view.requestMeasure()}
                inkFor={this.resolver.inkFor}
                chartPalette={this.resolver.chartPalette}
              />
            )}
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
      for (const [rootCls, childCls, attr, placeholder, ghost] of CHROME_ATTRS) {
        if (!container.classList.contains(rootCls)) continue;
        let el = container.querySelector<HTMLElement>(`:scope > .${childCls}`);
        if (!el && ghost && this.active) {
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
              `[data-region-line="${startLine}"] [data-line="${rel}"] > .${childCls}`,
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

  override get estimatedHeight(): number {
    const seen = measuredBlockHeights.get(blockKey("r", this.source));
    if (seen !== undefined) return seen;
    if (this.kind === "embed") return 260;
    const lines = this.endLine - this.startLine + 1;
    return Math.max(40, Math.min(1200, 28 * lines));
  }
}

// A figure's size as its own drawn chart reports it: panther lays a figure
// out at its reference frame whatever the display, so the live canvas's
// backing size carries the same aspect as the PDF's raster. Once a chart
// has drawn, its aspect is the truth for the editor, ahead of the host's
// size cache (which can be late, or fail, and then a figure stood a page
// tall: Nick's "test 22", a figure alone on the page after a heading and
// three lines). By figure id.
const derivedFigureSizes = new Map<string, { width: number; height: number }>();
function figureSizeOf(
  resolver: EmbedResolver,
  id: string,
  block: FigureBlock | undefined,
): { width: number; height: number } | undefined {
  return derivedFigureSizes.get(id) ?? (block ? resolver.figureSize?.(id, block) : undefined);
}
// The size a mount's drawn canvas gives, or undefined while it has not
// drawn (no canvas, or a canvas still at the element's 300x150 default).
function drawnCanvasSize(mount: HTMLElement): { width: number; height: number } | undefined {
  const canvas = mount.querySelector("canvas");
  if (canvas === null || !(canvas.width > 0) || !(canvas.height > 0)) return undefined;
  if (canvas.width === 300 && canvas.height === 150) return undefined;
  if (canvas.clientWidth === 0) return undefined;
  return { width: canvas.width, height: canvas.height };
}
function sameAspect(a: { width: number; height: number }, b: { width: number; height: number }): boolean {
  return Math.abs(a.width / a.height - b.width / b.height) <= 0.02 * (a.width / a.height);
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
    if (!img.complete || img.naturalWidth === 0) img.setAttribute("data-fm-pending", "");
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

// The share of the page's content area a figure's image may take: the
// stylesheet's cap (report_fastr_css.ts, .fm-figure img and the live mount).
const FIGURE_PAGE_SHARE = 0.42;
// A rendered block at least this share of the page area tall offers its
// inner boundaries to the layout (a shorter one always fits under a heading).
const INNER_SHARE = 0.8;
// How far a figure may shrink to fill the room left on its page: never
// below this share of its natural size.
const FIGURE_FLOOR = 0.6;

// A figure block's image box at its natural size, px: the raster's aspect
// (the host's size cache) at the figure's width, under the page cap, which
// is what the mount takes before the chart draws (applyFigureSize); and
// the height the layout last fitted it to when its rendered mount carries
// one. Undefined while the size is unknown.
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
  const size = figureSizeOf(resolver, m[1], resolver.getFigure(m[1]));
  if (size === undefined || !(size.width > 0) || !(size.height > 0)) return undefined;
  const full = /\{[^}]*\bwidth=full\b/.test(text);
  const w = full ? (geometry.sheetPx ?? view.scrollDOM.clientWidth) : columnW;
  const cap = FIGURE_PAGE_SHARE * (geometry.pageH - 2 * geometry.marginPx);
  const imgH = Math.min(cap, w * size.height / size.width);
  const mount = dom?.querySelector<HTMLElement>('[data-embed-kind="figure"][data-fm-sized]');
  const fit = mount ? parseFloat(mount.style.getPropertyValue("--fm-fig-fit")) : NaN;
  return { imgH, fitted: Number.isFinite(fit) ? Math.min(fit, imgH) : undefined };
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
            u.view.contentDOM.querySelectorAll<HTMLElement>('[data-embed-kind="figure"][data-fm-pending]'),
          )
        ) {
          const id = mount.getAttribute("data-embed-id") ?? "";
          if (applyFigureSize(mount, figureSizeOf(resolver, id, resolver.getFigure(id)))) {
            changed = true;
            const line = Number(mount.closest("[data-region-line]")?.getAttribute("data-region-line"));
            applyFigureFit(mount, u.view.state.field(paginationField, false)?.pagination?.figureFits?.get(line));
          }
        }
        for (
          const img of Array.from(
            u.view.contentDOM.querySelectorAll<HTMLImageElement>('img[data-embed-kind="image"][data-fm-pending]'),
          )
        ) {
          if (applyImageSize(img, resolver.imageSize?.(img.getAttribute("data-embed-id") ?? ""))) changed = true;
        }
        if (changed) u.view.requestMeasure();
      }
    },
  );
}

function missingNote(kind: string, id: string): HTMLElement {
  const el = document.createElement("div");
  el.className = "text-danger text-xs";
  el.textContent = `${
    kind === "image"
      ? t3({ en: "Missing image:", fr: "Image manquante :", pt: "Imagem em falta:" })
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
    const kind = typeof attrs["kind"] === "string" && CALLOUT_KINDS.has(attrs["kind"])
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
    const kind = typeof attrs["kind"] === "string" && CALLOUT_KINDS.has(attrs["kind"])
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
  (el as unknown as { _fmAttrActivate?: () => void })._fmAttrActivate = activate;
  // Activation happens on MOUSEDOWN, before the browser decides what the
  // press selects: a label that only becomes editable on click is still a
  // non-editable island at that moment, so the browser would select the
  // WHOLE surrounding widget (visibly, when the press lands mid-edit of
  // another label). Editable by the time the default runs, the press just
  // places the caret where it landed.
  el.addEventListener("mousedown", (e) => {
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
  const commit = () => {
    commitLive();
    el.contentEditable = "false";
    if (committed !== original.trim()) {
      dispatchAfterUpdate(view, { effects: rebuildRegions.of(null) }, () => !el.isConnected);
    }
  };
  el.addEventListener("blur", commit);
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
    const original = typeof attrs[attr] === "string" ? (attrs[attr] as string) : "";
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
// Set by a paged-mode island action that closes the island and moves the
// CodeMirror selection on purpose (Enter splitting a paragraph, Backspace
// removing an empty one): the paged surface reads it at its next swap and
// reopens the island at that selection.
export const pagedCaretIntent = { pending: false };

export type TextIslandOptions = {
  // The paged surface (paged_edit_surface.ts): no widget rebuilds, the
  // island's source is read from the LIVE doc on activation (the frame may
  // be a beat behind a remote edit), Enter splits the paragraph and
  // Backspace on an empty one removes it — the paragraph-level editing a
  // page needs when every line is an island.
  paged?: boolean;
};

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

export function attachTextEditor(
  el: HTMLElement,
  view: EditorView,
  regionStartLine: number,
  sourceLines: string[],
  rel: number,
  opts?: TextIslandOptions,
) {
  const sourceOf = (lines: string[]) =>
    lines.slice(rel, textIslandEndRel(lines, rel, el.tagName) + 1).join("\n");
  let original = sourceOf(sourceLines);
  // What the document holds for this island right now. Edits are committed
  // AS THEY ARE TYPED (peers see them live, and nothing can be lost on a
  // missed blur); the island's own commit is annotated so the region field
  // keeps this DOM instead of rebuilding it under the cursor.
  let committed = original;
  const committedEndLine1 = () =>
    regionStartLine + rel + committed.split("\n").length;
  const commitLive = () => {
    // A detached island (the widget was rebuilt under it) is stale DOM: the
    // document already holds everything it committed while it was live.
    if (!el.isContentEditable || !el.isConnected) return;
    const next = (el.textContent ?? "").replace(/\r/g, "");
    if (next === committed) return;
    const doc = view.state.doc;
    const line1 = regionStartLine + rel + 1;
    const endLine1 = committedEndLine1();
    if (endLine1 > doc.lines) return;
    // A change of LINE COUNT moves every island below this one, so the
    // widget must rebuild; the island is then re-opened on the rebuilt
    // element, caret at the end (Shift+Enter is the only way here).
    const sameShape = next.split("\n").length === committed.split("\n").length;
    committed = next;
    view.dispatch({
      changes: { from: doc.line(line1).from, to: doc.line(endLine1).to, insert: next },
      annotations: islandCommit.of(sameShape),
    });
    if (!sameShape) {
      const host = view.contentDOM.querySelector(
        `[data-region-line="${regionStartLine}"]`,
      );
      // No host (the paged surface): nothing rebuilds under the island, so
      // it stays open and mirrored; the surface re-lays the page out later.
      if (!host) return;
      stopMirror();
      const target = [...host.querySelectorAll<HTMLElement>(`[data-line="${rel}"]`)]
        .find((n) => n.tagName === el.tagName);
      (target as unknown as { _fmActivate?: () => void } | undefined)?._fmActivate?.();
    }
  };
  el.classList.add("cm-fm-text-edit");
  // The editing surface is the raw source, but the syntax the toolbar OWNS
  // stays invisible while editing: the leading heading marker and role-mark
  // wrappers are swapped in as display:none spans (textContent still includes
  // them, so a commit round-trips byte-identically and the selection mirror's
  // Range-based offsets stay source offsets), and the marked phrase keeps its
  // real colour. Emphasis/code/link syntax stays visible — it is typed.
  const renderEditableSource = () => {
    el.textContent = "";
    const hiddenSpan = (t: string) => {
      const s = docOf(el).createElement("span");
      s.className = "cm-fm-island-syntax";
      s.textContent = t;
      return s;
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
        parent.append(docOf(el).createTextNode(text.slice(last, m.index)));
        parent.append(hiddenSpan(m[1]));
        const styled = docOf(el).createElement("span");
        if (m[1].length >= 2) styled.style.fontWeight = "700";
        if (m[1].length !== 2) styled.style.fontStyle = "italic";
        styled.textContent = m[2];
        parent.append(styled);
        parent.append(hiddenSpan(m[1]));
        last = m.index + m[0].length;
      }
      parent.append(docOf(el).createTextNode(text.slice(last)));
    };
    const frag = docOf(el).createDocumentFragment();
    let rest = original;
    const hm = /^(#{1,6} )/.exec(rest);
    if (hm && /^H[1-6]$/.test(el.tagName)) {
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
    el.append(frag);
  };
  const activate = () => {
    (el as unknown as { _rendered: string })._rendered = el.innerHTML;
    if (opts?.paged) {
      // The frame is rendered from the doc as it was; the island edits the
      // doc as it IS.
      original = sourceOf(view.state.doc.toString().split("\n"));
      committed = original;
    }
    renderEditableSource();
    try {
      el.contentEditable = "plaintext-only";
    } catch {
      el.contentEditable = "true";
    }
    el.focus();
    // Caret at the end — the swap changed the text under the press, so a
    // precise position is not meaningful.
    const sel = winOf(el).getSelection();
    if (sel) {
      const range = docOf(el).createRange();
      range.selectNodeContents(el);
      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);
    }
  };
  (el as unknown as { _fmActivate?: () => void })._fmActivate = activate;
  el.addEventListener("mousedown", (e) => {
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
    const base = doc.line(line1).from;
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
    const anchor = Math.min(base + offsetOf(sel.anchorNode!, sel.anchorOffset), max);
    const head = Math.min(base + offsetOf(sel.focusNode!, sel.focusOffset), max);
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
  el.addEventListener("focus", () =>
    docOf(el).addEventListener("selectionchange", mirrorSelection));
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
    if (committed === original) {
      restore();
      return;
    }
    // Already rebuilt when the island turns out detached — that is what
    // detached it (decided a tick later; see dispatchAfterUpdate).
    dispatchAfterUpdate(view, { effects: rebuildRegions.of(null) }, () => !el.isConnected);
  };
  el.addEventListener("blur", () => {
    if (!el.isContentEditable) return;
    finish();
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
    if (sel && sel.rangeCount > 0 && sel.focusNode && el.contains(sel.focusNode)) {
      const r = docOf(el).createRange();
      r.selectNodeContents(el);
      try {
        r.setEnd(sel.focusNode, sel.focusOffset);
        at = r.toString().length;
      } catch {
        // An unreachable focus node: split at the end.
      }
    }
    const label = t3({ en: "New step", fr: "Nouvelle étape", pt: "Novo passo" });
    const before = text.slice(0, at).trimEnd() || label;
    const after = text.slice(at).trimStart();
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
    if (sel && sel.rangeCount > 0 && sel.focusNode && el.contains(sel.focusNode)) {
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
  // Paged editing: Enter splits the island at the caret into two paragraphs
  // (a list item gets a sibling item with the same marker), and the caret is
  // placed at the start of the new one — the surface re-lays the page out
  // and opens that island from the CM selection.
  const splitParagraph = () => {
    const doc = view.state.doc;
    const line1 = regionStartLine + rel + 1;
    const endLine1 = committedEndLine1();
    if (endLine1 > doc.lines) {
      el.blur();
      return;
    }
    const { text, at } = caretOffset();
    const before = text.slice(0, at).trimEnd();
    const after = text.slice(at).trimStart();
    const marker = el.tagName === "LI"
      ? (/^(\s*(?:[-*+]|\d+\.)\s+)/.exec(text)?.[1] ?? "- ")
      : undefined;
    const joiner = marker !== undefined ? `\n${marker}` : "\n\n";
    const insert = `${before}${joiner}${after}`;
    stopMirror();
    el.contentEditable = "false";
    pagedCaretIntent.pending = true;
    const from = doc.line(line1).from;
    committed = insert;
    view.dispatch({
      changes: { from, to: doc.line(endLine1).to, insert },
      selection: { anchor: from + before.length + joiner.length },
    });
  };
  // Paged editing: Backspace in an EMPTY island removes the line (and the
  // blank line above it), leaving the caret at the end of what came before.
  const removeEmptyLine = () => {
    const doc = view.state.doc;
    const line1 = regionStartLine + rel + 1;
    if (line1 > doc.lines) return;
    const line = doc.line(line1);
    let from = line1 > 1 ? doc.line(line1 - 1).to : line.from;
    if (line1 > 2 && doc.line(line1 - 1).text.trim().length === 0) {
      from = doc.line(line1 - 2).to;
    }
    stopMirror();
    el.contentEditable = "false";
    pagedCaretIntent.pending = true;
    view.dispatch({ changes: { from, to: line.to, insert: "" }, selection: { anchor: from } });
  };
  el.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (el.tagName === "P" && el.parentElement?.classList.contains("fm-steps")) {
        splitStep();
      } else if (opts?.paged && /^(P|LI|H[1-6])$/.test(el.tagName)) {
        splitParagraph();
      } else {
        el.blur();
      }
    } else if (
      opts?.paged && e.key === "Backspace" &&
      (el.textContent ?? "").trim().length === 0 && el.tagName === "P"
    ) {
      e.preventDefault();
      removeEmptyLine();
    } else if (e.key === "Escape") {
      e.preventDefault();
      // The live commits already changed the document: put the original
      // back (one more island commit), then close.
      el.textContent = original;
      commitLive();
      stopMirror();
      el.contentEditable = "false";
      dispatchAfterUpdate(view, { effects: rebuildRegions.of(null) });
    }
  });
}

// Right-click on a step: a step either side, delete it — panther's showMenu,
// same as tiles. A paragraph inside `:::steps` IS a step (the renderer
// numbers the block's direct children), so this menu and Enter are the only
// chrome a step needs (applyStepsChildAction).
export function attachStepsChildContextMenu(
  el: HTMLElement,
  view: EditorView,
  line1: number,
) {
  el.addEventListener("contextmenu", (e) => {
    if (!stepsChildInfo(view.state.doc.toString(), line1)) return;
    e.preventDefault();
    e.stopPropagation();
    const run = (action: StepsChildAction) => {
      // A step still being typed in commits first (its blur is a dispatch),
      // so the action reads the document the author sees.
      const active = docOf(el).activeElement;
      if (
        active instanceof HTMLElement && active.isContentEditable &&
        (el.closest(".fm-live-region") ?? docOf(el).body).contains(active)
      ) active.blur();
      const r = applyStepsChildAction(
        view.state.doc.toString(),
        line1,
        action,
        t3({ en: "New step", fr: "Nouvelle étape", pt: "Novo passo" }),
      );
      if (r.changes.length > 0) view.dispatch({ changes: r.changes });
    };
    const items: MenuItem[] = [
      {
        label: t3({ en: "Add step before", fr: "Ajouter une étape avant", pt: "Adicionar passo antes" }),
        onClick: () => run("insertBefore"),
      },
      {
        label: t3({ en: "Add step after", fr: "Ajouter une étape après", pt: "Adicionar passo depois" }),
        onClick: () => run("insertAfter"),
      },
      { type: "divider" as const },
      {
        label: t3({ en: "Delete step", fr: "Supprimer l'étape", pt: "Eliminar passo" }),
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
// pick the grid's column count, delete it — panther's showMenu, same as
// table cells.
// The column count follows the child count while it fits
// (applyTilesChildAction).
export function attachTilesChildContextMenu(
  el: HTMLElement,
  view: EditorView,
  line1: number,
) {
  el.addEventListener("contextmenu", (e) => {
    const doc = view.state.doc.toString();
    const info = tilesChildInfo(doc, line1);
    if (!info) return;
    e.preventDefault();
    e.stopPropagation();
    const labels = {
      tile: t3({ en: "New tile", fr: "Nouvelle tuile", pt: "Novo mosaico" }),
      card: t3({ en: "New card", fr: "Nouvelle carte", pt: "Novo cartão" }),
      body: t3({ en: "Text", fr: "Texte", pt: "Texto" }),
    };
    const run = (action: Parameters<typeof applyTilesChildAction>[2]) => {
      const r = applyTilesChildAction(doc, line1, action, labels);
      if (r.changes.length > 0) view.dispatch({ changes: r.changes });
    };
    const noun = info.kind === "stat"
      ? { before: t3({ en: "Add tile before", fr: "Ajouter une tuile avant", pt: "Adicionar mosaico antes" }),
          after: t3({ en: "Add tile after", fr: "Ajouter une tuile après", pt: "Adicionar mosaico depois" }),
          remove: t3({ en: "Delete tile", fr: "Supprimer la tuile", pt: "Eliminar mosaico" }) }
      : info.kind === "card"
      ? { before: t3({ en: "Add card before", fr: "Ajouter une carte avant", pt: "Adicionar cartão antes" }),
          after: t3({ en: "Add card after", fr: "Ajouter une carte après", pt: "Adicionar cartão depois" }),
          remove: t3({ en: "Delete card", fr: "Supprimer la carte", pt: "Eliminar cartão" }) }
      : { before: t3({ en: "Add column before", fr: "Ajouter une colonne avant", pt: "Adicionar coluna antes" }),
          after: t3({ en: "Add column after", fr: "Ajouter une colonne après", pt: "Adicionar coluna depois" }),
          remove: t3({ en: "Delete column", fr: "Supprimer la colonne", pt: "Eliminar coluna" }) };
    const items: MenuItem[] = [
      { label: noun.before, onClick: () => run("insertBefore") },
      { label: noun.after, onClick: () => run("insertAfter") },
      ...(info.grid
        ? [{
          label: t3({ en: "Columns", fr: "Colonnes", pt: "Colunas" }),
          subMenu: Array.from({ length: TILES_MAX_COLS }, (_, i) => ({
            label: `${i + 1}${info.grid?.cols === i + 1 ? " ✓" : ""}`,
            onClick: () => run({ cols: i + 1 }),
          })),
        } satisfies MenuItem]
        : []),
      { type: "divider" as const },
      { label: noun.remove, intent: "danger" as const, onClick: () => run("delete") },
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
  const isTableRow = (text: string) =>
    text.trim().length > 0 && text.includes("|") &&
    parseContainerFence(text) === undefined;
  el.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    e.stopPropagation();
    const doc = view.state.doc;
    if (rowLine1 > doc.lines) return;
    let start1 = rowLine1;
    while (start1 > 1 && isTableRow(doc.line(start1 - 1).text)) start1--;
    let end1 = rowLine1;
    while (end1 < doc.lines && isTableRow(doc.line(end1 + 1).text)) end1++;
    const rowRel = rowLine1 - start1;
    const colCount = doc.line(start1).text.split("|").length - 2;

    const applyAction = (action: Parameters<typeof applyTableCellAction>[3]) => {
      const lines: string[] = [];
      for (let l = start1; l <= end1; l++) lines.push(doc.line(l).text);
      const next = applyTableCellAction(
        lines,
        rowRel,
        cellIndex,
        action,
        t3({ en: "New column", fr: "Nouvelle colonne", pt: "Nova coluna" }),
      );
      if (next === undefined) return;
      view.dispatch({
        changes: {
          from: doc.line(start1).from,
          to: doc.line(end1).to,
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
          const from = doc.line(start1).from;
          const to = Math.min(doc.line(end1).to + 1, doc.length);
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

// Table cells edit in place: the row's source line is split on pipes, the
// pressed cell swaps to its raw text, and a commit rebuilds the row line.
// The raw `|`-separated segments of a table row, WITH their offsets in the
// line — cellSlices(text)[i].raw.trim() is exactly what the cell island shows,
// and the offset is what lets the selection mirror map island positions onto
// doc positions inside the row line.
function cellSlices(text: string): { start: number; raw: string }[] {
  const parts = text.split("|");
  const out: { start: number; raw: string }[] = [];
  let pos = 0;
  for (const raw of parts) {
    out.push({ start: pos, raw });
    pos += raw.length + 1;
  }
  const trimmed = text.trim();
  let arr = out;
  if (trimmed.startsWith("|")) arr = arr.slice(1);
  if (trimmed.endsWith("|") && arr.length > 0) arr = arr.slice(0, -1);
  return arr;
}

export function attachCellEditor(
  el: HTMLElement,
  view: EditorView,
  rowLine1: number,
  cellIndex: number,
  locate?: () => HTMLElement | undefined,
) {
  el.classList.add("cm-fm-text-edit");
  const cellsOf = (text: string) => cellSlices(text).map((c) => c.raw.trim());
  // Doc offset of this cell's trimmed content, and its length — the mirror's
  // coordinate frame. Recomputed per call: the row line moves as the doc does.
  const contentRange = (): { from: number; len: number } | undefined => {
    if (rowLine1 > view.state.doc.lines) return undefined;
    const line = view.state.doc.line(rowLine1);
    const slice = cellSlices(line.text)[cellIndex];
    if (!slice) return undefined;
    const lead = slice.raw.length - slice.raw.trimStart().length;
    return { from: line.from + slice.start + lead, len: slice.raw.trim().length };
  };
  // Mirror the island's DOM selection into the CM selection while editing, so
  // the toolbar's text actions (size, colour, bold) act on what is selected
  // IN THE CELL — same contract as attachTextEditor's mirror. The island is
  // plain text (no hidden spans), so Range lengths are cell offsets directly.
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
    const anchor = range.from + clamp(offsetOf(sel.anchorNode!, sel.anchorOffset));
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
      changes: { from: line.from, to: line.to, insert: `| ${cells.join(" | ")} |` },
      annotations: islandCommit.of(keep),
    });
  };
  const commitLive = () => {
    if (!el.isContentEditable || !el.isConnected) return;
    writeCell((el.textContent ?? "").replace(/[\r\n|]/g, " ").trim(), true);
  };
  const activate = () => {
    if (rowLine1 > view.state.doc.lines) return;
    const cells = cellsOf(view.state.doc.line(rowLine1).text);
    (el as unknown as { _rendered: string })._rendered = el.innerHTML;
    el.textContent = cells[cellIndex] ?? "";
    original = cells[cellIndex] ?? "";
    committed = original;
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
    if (range) publishIslandCaret(view, range.from + range.len, range.from + range.len);
    docOf(el).addEventListener("selectionchange", mirrorSelection);
  };
  (el as unknown as { _fmCellActivate?: () => void })._fmCellActivate = activate;
  el.addEventListener("mousedown", (e) => {
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
    if (committed === original) {
      const rendered = (el as unknown as { _rendered?: string })._rendered;
      if (rendered !== undefined) el.innerHTML = rendered;
      return;
    }
    dispatchAfterUpdate(view, { effects: rebuildRegions.of(null) }, () => !el.isConnected);
  };
  el.addEventListener("blur", () => {
    if (!el.isContentEditable) {
      stopMirror();
      return;
    }
    finish();
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
      const kind = typeof attrs["kind"] === "string" && CALLOUT_KINDS.has(attrs["kind"])
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
        const a = (e.target as HTMLElement).closest<HTMLElement>("[data-toc-line]");
        if (!a) return;
        const line1 = Number(a.getAttribute("data-toc-line"));
        if (!Number.isFinite(line1) || line1 < 1 || line1 > view.state.doc.lines) {
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
  // The page break marker takes no room (a rule laid over the page's foot).
  override get estimatedHeight(): number {
    return fastrOpenFenceOnLine(this.source, this.line1)?.name === "pagebreak" ? 0 : 110;
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
        const isReport = fastrOpenFenceOnLine(line.text, item.line1)?.name === "report";
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
    // inside a region shows as the widget's active ring. Split remains the
    // raw-source view. buildRevealedRegion is kept for a possible explicit
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
    const sourceKey = carried ?? (touched ? `${rev}\u0000${source}` : source);
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
      if (tr.effects.some((e) => e.is(rebuildRegions))) {
        return buildLiveState(tr.state, resolver, undefined, undefined, false, value.rev + 1);
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
      const padX = parseFloat(getComputedStyle(view.contentDOM).paddingLeft) || 0;
      const out: RectangleMarker[] = [];
      for (const b of boxes) {
        if (
          b.openLine1 > view.state.doc.lines ||
          b.endLine1 > view.state.doc.lines
        ) continue;
        const openBlock = view.lineBlockAt(view.state.doc.line(b.openLine1).from);
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

  return [field, guard, boxLayer];
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
  const indent = (/^[ \t]*/.exec(text)?.[0] ?? "").replace(/\t/g, "    ").length;
  return Math.min(4, 1 + Math.round(indent / 2.5));
}
const listDepthCls = (text: string) => {
  const d = listDepthOf(text);
  return d > 1 ? ` cm-fm-li-d${d}` : "";
};

// `1. ` / `1.1 ` in front of a numbered section. The rendered document gets
// these from a CSS counter on `body > h2`; the editor's own heading lines are
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
  // a section, so only depth-0 headings count (the CSS rule is body > hN).
  const numbered = readFastrDocumentSettings(state.doc.sliceString(0, 4096))
    .className.includes("fm-doc--numbered");
  let depth = 0;
  let sec = 0;
  let sub = 0;
  // The document's vertical rhythm: what every blank line, line of space
  // and unseparated block edge measures, from print's margins.
  const rhythm = docRhythmOf(state, state.field(printMetricsField, false));
  // Blank lines ABOVE the first visible block render nothing in View, so they
  // must not open the editor with a strip of page ground. Only collapsed when
  // there IS content below them — an all-blank document keeps its clickable
  // lines.
  const firstLine = rhythm.firstVisible === undefined ? undefined : rhythm.firstVisible + 1;
  const px = (v: number) => `${snapPx(v)}px`;
  const gapCls = (index: number) => rhythm.gapTop.has(index) ? " cm-fm-gap" : "";
  const gapAttrs = (index: number) => {
    const g = rhythm.gapTop.get(index);
    return g === undefined ? undefined : { style: `--fm-gap-top: ${px(g)}` };
  };
  // The first blank line after content is the paragraph separator; each
  // further one is a line of space, as the renderer's fm_spaces makes it.
  let prevBlank = false;
  // scanContainerLines flags code-fence interiors, where a # line is content.
  for (const { index, text, inCode, fence } of scanContainerLines(
    state.doc.iterLines(1, state.doc.lines + 1),
  )) {
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
            class: `cm-fm-code-fence cm-fm-code-${f}${f === "open" ? gapCls(index) : ""}`,
            attributes: f === "open" ? gapAttrs(index) : undefined,
          }).range(from),
        );
      } else {
        ranges.push(Decoration.line({ class: "cm-fm-code-line" }).range(from));
        if (text.length > 0) {
          ranges.push(Decoration.mark({ class: "cm-fm-codetext" }).range(from, from + text.length));
        }
      }
      continue;
    }
    if (fence) {
      // Leaf fences (a stat, the header, a contents block) open nothing.
      if (fence.kind === "open") {
        if (!isFastrLeafBlock(fence.name)) depth++;
      } else {
        depth = Math.max(0, depth - 1);
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
          class: lead ? "cm-fm-blank cm-fm-lead" : first ? "cm-fm-blank" : "cm-fm-space",
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
    const m = HEADING_LINE_RE.exec(text);
    if (m) {
      ranges.push(
        Decoration.line({ class: `cm-fm-h${m[1].length}${gapCls(index)}`, attributes: gapAttrs(index) })
          .range(from),
      );
      const level = m[1].length;
      if (numbered && depth === 0 && (level === 2 || level === 3)) {
        if (level === 2) {
          sec++;
          sub = 0;
        } else {
          sub++;
        }
        ranges.push(
          Decoration.widget({
            widget: new SectionNumberWidget(
              level === 2 ? `${sec}. ` : `${sec}.${sub} `,
            ),
            side: -1,
          }).range(from),
        );
      }
    } else if (LIST_LINE_RE.test(text)) {
      ranges.push(
        Decoration.line({
          class: `cm-fm-li${listDepthCls(text)}${rhythm.liNext.has(index) ? " cm-fm-li-next" : ""}${gapCls(index)}`,
          attributes: gapAttrs(index),
        }).range(from),
      );
    } else if (/^\s*>\s?/.test(text)) {
      ranges.push(
        Decoration.line({
          class: `cm-fm-bq${rhythm.bqFirst.has(index) ? " cm-fm-bq-first" : ""}${
            rhythm.bqLast.has(index) ? " cm-fm-bq-last" : ""
          }${gapCls(index)}`,
          attributes: gapAttrs(index),
        }).range(from),
      );
    } else if (rhythm.gapTop.has(index)) {
      ranges.push(Decoration.line({ class: "cm-fm-gap", attributes: gapAttrs(index) }).range(from));
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
  // A bullet, or an ordered item's own marker text ("3.").
  constructor(readonly text = "\u2022") {
    super();
  }
  override toDOM(): HTMLElement {
    const el = document.createElement("span");
    el.className = "cm-fm-bullet";
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
  const ranges: { from: number; to: number; deco: Decoration; replace: boolean }[] =
    [];
  const add = (from: number, to: number, deco: Decoration, replace = true) => {
    if (to > from || deco.spec.widget) ranges.push({ from, to, deco, replace });
  };
  // Reveal rule: the construct shows its syntax while the selection touches
  // its full range — Obsidian semantics.
  const revealed = (from: number, to: number) =>
    selectionTouches(state, from, to);

  for (const { from, to } of view.visibleRanges) {
    syntaxTree(state).iterate({
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
              add(marks[marks.length - 1].from, marks[marks.length - 1].to, conceal);
            }
            return;
          }
          case "Link": {
            // A bracket followed by a mark block ({.role}, {size=12}) is a
            // MARK, not a link — the Lezer grammar still tokenizes the
            // shortcut-reference form, and claiming it here would both paint
            // link styling and knock out the mark conceal's tail in the
            // overlap dedupe below.
            const tail = state.sliceDoc(node.to, Math.min(node.to + 40, state.doc.length));
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
            const from = /^\s*$/.test(state.sliceDoc(line.from, node.from)) ? line.from : node.from;
            const to = state.sliceDoc(node.to, node.to + 1) === " " ? node.to + 1 : node.to;
            add(
              from,
              to,
              Decoration.replace({ widget: /^[-*+]$/.test(mark) ? BULLET : new BulletWidget(mark) }),
            );
            return;
          }
        }
      },
    });

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
      const nodeAt = syntaxTree(state).resolveInner(start, 1);
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
    if (u.docChanged || u.selectionSet || u.viewportChanged) {
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
export function publishIslandCaret(view: EditorView, anchor: number, head: number) {
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
          if (this.placeCaret(target, pos, color, state.user.name ?? "")) continue;
          target.style.outline = `2px solid ${color}`;
          const layer = target.querySelector<HTMLElement>(":scope > .fm-peer-layer");
          if (layer && !layer.querySelector(".fm-live-presence")) {
            const chip = document.createElement("div");
            chip.className =
              "fm-live-presence pointer-events-none absolute -top-0 right-0 rounded px-1.5 text-[10px] text-white";
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
      placeCaret(widget: HTMLElement, pos: number, color: string, name: string): boolean {
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
                : fastrStripInlineSyntax(slice.raw.trim().slice(0, within)).length;
            }
          }
        }
        if (!anchor) {
          const block = widget.querySelector<HTMLElement>(`[data-line="${rel}"]`) ??
            (rel === 0
              ? widget.querySelector<HTMLElement>(":scope > :not(.fm-peer-layer)")
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
              (node.parentElement?.closest(".cm-fm-island-syntax") ?? null) !== null;
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
        const container = widget.querySelector<HTMLElement>(":scope > .fm-peer-layer");
        if (!container) return false;
        const base = widget.getBoundingClientRect();
        const caret = document.createElement("span");
        caret.className = "fm-peer-caret";
        caret.style.left = `${rect.left - base.left}px`;
        caret.style.top = `${rect.top - base.top}px`;
        caret.style.height = `${rect.height || parseFloat(getComputedStyle(anchor).lineHeight) || 16}px`;
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
    fontSize: "16px",
    lineHeight: "1.55",
    caretColor: "var(--fm-ink)",
  },
  ".cm-gutters": { display: "none" },
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
// so flipping to Split leaves no tint behind.
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
              `url("${resolver.assetUrl(entry.imgFile).replaceAll('"', "%22")}")`,
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
};

export const setPagination = StateEffect.define<EditorPagination | undefined>();

// Print's height for every block, by the block's source text, from the
// host's background layout of the whole document (paginate_report.ts): the
// page layout takes them for blocks the editor has not rendered.
export const setLayoutHints = StateEffect.define<Map<string, FastrLayoutHint>>();
export const layoutHintsField = StateField.define<Map<string, FastrLayoutHint>>({
  create: () => new Map(),
  update(value, tr) {
    for (const e of tr.effects) if (e.is(setLayoutHints)) return e.value;
    return value;
  },
});

// The page box geometry the host sets on the editor's scope: the printed
// page's height and its margin at the sheet's scale (report_fastr_css.ts
// draws the margins; the plugin measures against them).
export type PageBoxGeometry = { pageH: number; marginPx: number; sheetPx?: number };

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
function seamElement(pag: EditorPagination, page: number, end = false): HTMLElement {
  const el = document.createElement("div");
  el.className = end ? "fm-page-gutter fm-page-gutter--end" : "fm-page-gutter";
  el.contentEditable = "false";
  el.setAttribute("data-page", String(page));
  seamPadding(el, pag, page, end);
  el.append(...seamParts(pag, page, end));
  return el;
}

// The seam's padding: the page's room under its content (a page full to
// the pixel keeps its trailing separator line by letting it run into the
// foot, which the parts read as a negative filler), and the extra of the
// block that opens the next page. No page opens after the end element.
function seamPadding(el: HTMLElement, pag: EditorPagination, page: number, end: boolean): void {
  const filler = pag.fillers?.get(page - 1);
  if (filler !== undefined && filler > 0) el.style.paddingTop = `${filler}px`;
  const extra = end ? undefined : pag.topExtras?.get(page);
  if (extra !== undefined && extra > 0) el.style.paddingBottom = `${extra}px`;
}

// The seam's parts: the ending page's foot with the running footer (none
// after a cover page), the band between the sheets, and the starting
// page's head (none before a cover page or a page a natural cover opens).
function seamParts(pag: EditorPagination, page: number, end: boolean): HTMLElement[] {
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
function seamRow(pag: EditorPagination, page: number, cols: number): HTMLTableRowElement {
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
  override eq(): boolean {
    return true;
  }
  override toDOM(): HTMLElement {
    const dom = document.createElement("div");
    dom.className = "cm-fm-page-head";
    dom.contentEditable = "false";
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

// After the document's last line: the last page's foot and its filler, so
// the final page is a full sheet too.
class PageEndWidget extends WidgetType {
  constructor(readonly pag: EditorPagination) {
    super();
  }
  override eq(other: PageEndWidget): boolean {
    return other.pag.title === this.pag.title && other.pag.result.total === this.pag.result.total;
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
  const first = pag.result.pages[0];
  if (first !== undefined && !first.cover && !first.flushTop) {
    decos.push(
      Decoration.widget({ widget: new PageHeadWidget(), block: true, side: -2 }).range(0),
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
    if (r !== undefined && r.region.kind !== "leaf" && r.region.kind !== "embed") {
      const list = regionSeams.get(r.region.startLine) ?? [];
      list.push({ rel: line - r.region.startLine, page: page.number });
      regionSeams.set(r.region.startLine, list);
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
      Decoration.line({ class: "cm-fm-split" }).range(state.doc.line(s.line + 1).from),
    );
  }
  decos.push(
    Decoration.widget({ widget: new PageEndWidget(pag), block: true, side: 1 })
      .range(state.doc.length),
  );
  decos.sort((a, b) => a.from - b.from || a.value.startSide - b.value.startSide);
  return { pagination: pag, deco: Decoration.set(decos, true), regionSeams, regionSplits };
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
      return buildPaginationState(tr.state, {
        ...value.pagination,
        result: mapResultThroughChanges(value.pagination.result, tr),
        figureFits,
      });
    }
    return value;
  },
  provide: (f) => EditorView.decorations.from(f, (v) => v.deco),
});

// A 0-based source line before a transaction to the line it is on after.
function lineMapper(tr: Transaction): (line: number | undefined) => number | undefined {
  const before = tr.startState.doc;
  const after = tr.state.doc;
  return (line) => {
    if (line === undefined || line < 0 || line >= before.lines) return line;
    const pos = tr.changes.mapPos(before.line(line + 1).from, -1);
    return after.lineAt(pos).number - 1;
  };
}

function mapResultThroughChanges(result: FastrPagedResult, tr: Transaction): FastrPagedResult {
  const mapLine = lineMapper(tr);
  return {
    ...result,
    pages: result.pages.map((p) => ({ ...p, firstLine: mapLine(p.firstLine) })),
    splits: result.splits.map((sp) => ({ ...sp, line: mapLine(sp.line) ?? sp.line })),
    fits: (result.fits ?? []).map((f) => ({ ...f, line: mapLine(f.line) ?? f.line })),
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
  for (const old of Array.from(dom.querySelectorAll(".fm-page-gutter-row, .fm-page-gutter-repeat, .fm-page-gutter, .fm-page-split"))) {
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
      const target = anchor ?? dom.querySelector<HTMLElement>(".fm-peer-layer + *");
      const row = target?.closest<HTMLTableRowElement>("tr") ?? null;
      if (row !== null && row.parentElement) {
        // Inside a table: a row of the seam before the row that opens the
        // page, then the table's header rows again, as print repeats them
        // on every page a table runs on to (the layout counts them:
        // FastrLayoutBlock.repeat). The copies are inert: no anchors (the
        // break candidates come from the rows), no editing.
        row.parentElement.insertBefore(seamRow(ps.pagination, seam.page, row.cells.length), row);
        const thead = row.closest("table")?.querySelector<HTMLTableSectionElement>(":scope > thead");
        for (const hr of Array.from(thead?.rows ?? [])) {
          const copy = hr.cloneNode(true) as HTMLTableRowElement;
          copy.classList.add("fm-page-gutter-repeat");
          copy.contentEditable = "false";
          copy.setAttribute("aria-hidden", "true");
          copy.removeAttribute("data-line");
          for (const a of Array.from(copy.querySelectorAll("[data-line]"))) a.removeAttribute("data-line");
          row.parentElement.insertBefore(copy, row);
        }
      } else if (target !== null && target !== undefined && target.parentElement) {
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
    if (first && first.parentElement) first.parentElement.insertBefore(flag, first);
    else dom.append(flag);
  }
}
// ── Page layout ─────────────────────────────────────────────────────────────
// The EDITOR decides where the pages break, on every measure, from
// CodeMirror's height map: every block's own box (a line's, a region
// widget's), the space between blocks, and the paged sheet's rules, run
// through layoutFastrPages (lib/fastr_markdown_pages.ts). The result is
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
function lineBox(view: EditorView, line0: number): { top: number; bottom: number } {
  const block = view.lineBlockAt(view.state.doc.line(line0 + 1).from);
  if (!Array.isArray(block.type)) return { top: block.top, bottom: block.bottom };
  const parts = block.type as readonly BlockInfo[];
  const own = parts.filter((p) => p.type === BlockType.Text || p.type === BlockType.WidgetRange);
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
function marginsOf(metrics: PrintMetrics | undefined, key: string | undefined): { mt: number; mb: number } {
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
  const m = (tag: string, cls = "") => ({ mt: oracle.printMarginTop(tag, cls), mb: oracle.printMarginBottom(tag, cls) });
  margins.p = m("p");
  for (let n = 1; n <= 6; n++) margins[`h${n}`] = m(`h${n}`, "fm-top");
  margins.bq = m("blockquote");
  margins.pre = m("pre");
  margins.hr = m("hr");
  // A list's items carry the margins: the first item's collapses through
  // the list's top, the last item's into the list's bottom margin.
  margins.list = { mt: oracle.printMarginTop("li"), mb: Math.max(oracle.printMarginBottom("ul"), oracle.printMarginBottom("li")) };
  margins.table = oracle.regionMargins("", "table");
  margins.figure = oracle.regionMargins("fm-figure", "figure");
  for (const name of FASTR_BLOCK_NAMES) {
    if (name === "pagebreak" || name === "report") margins[name] = { mt: 0, mb: 0 };
    else if (name === "contents") margins["fm-toc"] = oracle.regionMargins("fm-toc", "div");
    // A cover is a band (its bottom margin is the band's); it opens the
    // document or a page, where print gives it no top margin.
    else if (name === "cover") margins["fm-cover"] = { mt: 0, mb: oracle.regionMargins("fm-band fm-cover", "section").mb };
    else margins[`fm-${name}`] = oracle.regionMargins(`fm-${name}`, "div");
  }
  // To the 1/64 px the browser lays out at, floored as it floors a margin:
  // a line height or padding of the same float would round up instead, a
  // sixty-fourth per block that adds up and moves a text row by a pixel.
  for (const k of Object.keys(margins)) margins[k] = { mt: snapPx(margins[k].mt), mb: snapPx(margins[k].mb) };
  return {
    margins,
    pMargin: margins.p.mb,
    liGap: margins.list.mt,
    liIndent: snapPx(oracle.printPaddingLeft("ul")),
    bqPad: snapPx(oracle.printPaddingTop("blockquote")),
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
  bqFirst: Set<number>;
  bqLast: Set<number>;
  liNext: Set<number>;
  // 0-based.
  firstVisible: number | undefined;
};
const rhythmCache = new WeakMap<DocText, { metrics: PrintMetrics | undefined; rhythm: DocRhythm }>();
function docRhythmOf(state: EditorState, metrics: PrintMetrics | undefined): DocRhythm {
  const cached = rhythmCache.get(state.doc);
  if (cached !== undefined && cached.metrics === metrics) return cached.rhythm;
  const doc = state.doc;
  const n = doc.lines;
  const db = docBlocksOf(state);
  const firstVisible = db.firstVisible !== undefined ? db.firstVisible - 1 : undefined;
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
  const blank = (i: number) => i >= 0 && i < n && !inCode[i] && doc.line(i + 1).text.trim().length === 0;
  const key: (string | undefined)[] = new Array(n).fill(undefined);
  for (let i = 0; i < n; i++) {
    if (blank(i)) continue;
    const owner = db.owner[i];
    key[i] = owner !== undefined ? regionKeyOf(owner) : inCode[i] ? "pre" : blockKeyOfLine(doc.line(i + 1).text);
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
    if (key[i] === "list" && i > 0 && key[i - 1] === "list" && db.owner[i - 1] === undefined) liNext.add(i);
  }
  const blankGap = new Map<number, number>();
  const spaceBottom = new Map<number, number>();
  const gapTop = new Map<number, number>();
  // A cover that fills its page ends it: nothing stands under it on the page.
  const fillCoverAt = (i: number) => {
    const o = db.owner[i];
    return o?.fence?.name === "cover" && o.fence.attrs["fill"] === "page";
  };
  // Two adjacent non-blank lines of one block (no gap between them).
  const sameBlock = (a: number, b: number): boolean => {
    const oa = db.owner[a];
    const ob = db.owner[b];
    if (oa !== undefined || ob !== undefined) return oa === ob;
    if (inCode[a] || inCode[b]) return inCode[a] && inCode[b] && fenceAt.get(a) !== "close" && fenceAt.get(b) !== "open";
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
          const mtNext = next !== undefined ? marginsOf(metrics, key[next]).mt : 0;
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
        const g = fillCoverAt(prev)
          ? marginsOf(metrics, key[i]).mt
          : Math.max(marginsOf(metrics, key[prev]).mb, marginsOf(metrics, key[i]).mt);
        if (g > 0) gapTop.set(i, g);
      } else if (
        prev === i - 1 && key[prev] === "list" && key[i] === "list" && db.owner[i] === undefined &&
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
  const rhythm: DocRhythm = { blank, key, inCode, fenceAt, blankGap, spaceBottom, gapTop, bqFirst, bqLast, liNext, firstVisible };
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
  if (fence !== undefined) return { cls: `cm-fm-code-fence cm-fm-code-${fence}${fence === "open" ? gapCls : ""}`, text, style: fence === "open" ? style : undefined };
  if (rhythm.inCode[line]) return { cls: "cm-fm-code-line", text, inner: "cm-fm-codetext" };
  // A thematic break's line is the rule alone (HrWidget).
  if (HR_LINE_RE.test(text)) return { cls: "", text: "", style: "height: 1px; line-height: 1px; font-size: 0; overflow: hidden" };
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
  const owner: (FastrLiveRegion | undefined)[] = new Array(state.doc.lines).fill(undefined);
  for (const r of fastrLiveRegions(state.doc.iterLines(1, state.doc.lines + 1))) {
    for (let i = r.startLine; i <= r.endLine && i < owner.length; i++) owner[i] = r;
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
    const w = content.clientWidth - (parseFloat(cs.paddingLeft) || 0) - (parseFloat(cs.paddingRight) || 0);
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
    const key = rows.map((r) => `${r.cls}\u0001${r.style ?? ""}\u0001${r.inner ?? ""}\u0001${r.text}`).join("\u0000");
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
      : els[els.length - 1].getBoundingClientRect().bottom - els[0].getBoundingClientRect().top;
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
  if (h) return { cls: `cm-fm-h${h[1].length}`, text: concealed(text.slice(h[0].length)) };
  if (ORACLE_LIST_LINE_RE.test(text)) {
    return { cls: "cm-fm-li", text: concealed(text.replace(ORACLE_LIST_LINE_RE, "")) };
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
  const epoch = `${view.contentDOM.clientWidth}|${cs.fontFamily}|${cs.fontSize}|${cs.lineHeight}`;
  if (epoch === measuredEpoch) return false;
  measuredEpoch = epoch;
  measuredBlockHeights.clear();
  measuredInner.clear();
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
  const dom = view.contentDOM.querySelector<HTMLElement>(`[data-region-line="${startLine}"]`);
  if (dom === null) return undefined;
  const domTop = dom.getBoundingClientRect().top;
  const seams = Array.from(dom.querySelectorAll<HTMLElement>(".fm-page-gutter, .fm-page-gutter-repeat"))
    .map((s) => s.getBoundingClientRect())
    .sort((a, b) => a.top - b.top);
  const out: { line: number; top: number }[] = [];
  for (const el of Array.from(dom.querySelectorAll<HTMLElement>("[data-line]"))) {
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
    if (dedup.length > 0 && Math.abs(dedup[dedup.length - 1].top - c.top) < 0.5) continue;
    dedup.push(c);
  }
  return dedup;
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
  const textOf = (from: number, to: number) => doc.sliceString(doc.line(from + 1).from, doc.line(to + 1).to);
  const blocks: FlowBlock[] = [];
  // The space above a block: the blank line over it, as tall as the rhythm
  // makes it (print's collapsed margins), nothing when the blocks touch.
  // From the source, never from positions: the height map places an
  // unrendered line by guesswork, so the source is the stable answer.
  const gapAt = (line: number) => (line > 0 ? rhythm.blankGap.get(line - 1) : undefined) ?? 0;
  const push = (b: Omit<FlowBlock, "gap">) => {
    blocks.push({ ...b, gap: blocks.length === 0 ? 0 : gapAt(b.line) });
  };
  const start = db.firstVisible !== undefined ? Math.max(0, db.firstVisible - 1) : 0;
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
          ? figureImageBox(view, resolver, text, geometry, oracle.columnWidth(), dom)
          : undefined;
      if (isRendered) {
        // The widget's box holds the seams inside it (a block continued
        // across pages): the block's own height is the rest.
        const dom = view.contentDOM.querySelector<HTMLElement>(`[data-region-line="${r.startLine}"]`);
        if (dom !== null) {
          for (const seam of Array.from(dom.querySelectorAll<HTMLElement>(".fm-page-gutter, .fm-page-gutter-repeat"))) {
            height -= seam.getBoundingClientRect().height;
          }
          // A table's header rows, repeated at the top of every page it
          // continues on to.
          if (r.kind === "table") {
            const thead = dom.querySelector<HTMLElement>("table > thead");
            repeat = thead !== null ? thead.getBoundingClientRect().height : undefined;
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
            else if (hint !== undefined) height = hint.height + (rhythm.gapTop.get(r.startLine) ?? 0);
            else if (provisional !== undefined) height = provisional;
            else pendingBlockHeights.set(key, height);
          } else {
            rememberBlockHeight(key, height);
            // Where the block may continue on the next page when it is
            // taller than a page, or than the room under the heading that
            // opened its page. Never a cover: it is its page.
            if (name !== "cover" && height > area * INNER_SHARE) {
              inner = innerCandidates(view, r.startLine);
              if (inner !== undefined) measuredInner.set(key, inner.map((c) => ({ rel: c.line - r.startLine, top: c.top })));
              else measuredInner.delete(key);
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
          inner = measuredInner.get(key)?.map((c) => ({ line: r.startLine + c.rel, top: c.top }));
        } else if (name === "cover" && fence?.attrs?.["fill"] === "page") {
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
          if (name !== "cover") inner = hint.inner?.map((c) => ({ line: r.startLine + c.rel, top: c.top }));
        }
        imgH = figureBox(null)?.imgH;
      }
      // What print gives the block at the top of a page beyond its box: its
      // whole top margin, less what the widget carries itself (a gap over a
      // block with no blank line above it). The first block of the document
      // and a cover have no top margin in print either; a page break marker
      // has no box.
      const rm = marginsOf(metrics, regionKeyOf(r));
      const topExtra = name === "pagebreak" || name === "cover" || r.startLine === start
        ? 0
        : Math.max(0, rm.mt - (rhythm.gapTop.get(r.startLine) ?? 0));
      const attrs = fence?.attrs ?? {};
      const brk = typeof attrs["break"] === "string" ? attrs["break"].toLowerCase() : "";
      push({
        line: r.startLine,
        endLine: r.endLine,
        top,
        bottom: top + height,
        text,
        height,
        heading: false,
        pagebreak: name === "pagebreak",
        breakBefore: brk === "before",
        breakAfter: brk === "after",
        cover: name === "cover" ? (attrs["fill"] === "page" ? "fill" : "natural") : undefined,
        inner,
        repeat,
        topExtra,
        flex: imgH !== undefined ? imgH * (1 - FIGURE_FLOOR) : undefined,
        // The separator line after it stays on the page when it shrinks.
        tail: imgH !== undefined && r.endLine + 1 < doc.lines && blank(r.endLine + 1)
          ? rhythm.blankGap.get(r.endLine + 1) ?? 0
          : undefined,
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
            oracle.lines([{ cls: "cm-fm-space", text: "", style: bottom === undefined ? undefined : `--fm-gap-bottom: ${bottom}px` }]) ??
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
    let j = i;
    while (j + 1 < doc.lines && db.owner[j + 1] === undefined && !blank(j + 1)) j++;
    const top = lineBox(view, i).top;
    const bottom = lineBox(view, j).bottom;
    const text = textOf(i, j);
    let height = bottom - top;
    const isRendered = rendered(i, j);
    const key = blockKey("p", text);
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
        for (let k = i; k <= j; k++) rows.push(rowOf(rhythm, doc.line(k + 1).text, k));
        const plain = rows.every((row) => row.cls === "" && row.style === undefined);
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
    const topExtra = i === start ? 0 : Math.max(0, pm.mt - (rhythm.gapTop.get(i) ?? 0));
    push({
      line: i,
      endLine: j,
      top,
      bottom: top + height,
      text,
      height,
      heading: hm !== null,
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
export const stretchField = StateField.define<Stretches & { deco: DecorationSet }>({
  create: () => ({ lines: new Map(), print: new Map(), ends: new Map(), deco: Decoration.none }),
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
      return { lines: remap(value.lines), print: remap(value.print), ends: remap(value.ends), deco: value.deco.map(tr.changes) };
    }
    return value;
  },
  provide: (f) => EditorView.decorations.from(f, (v) => v.deco),
});
// A gap ABOVE a heading may grow this much (a section start welcomes
// room); one beside a figure or a block this much; one between two
// paragraphs this much; the gap under a heading never (a heading keeps its
// text); a leftover under the minimum is not worth spreading.
const STRETCH_CAP_HEADING_PX = 48;
const STRETCH_CAP_PX = 32;
const STRETCH_CAP_PROSE_PX = 12;
const STRETCH_MIN_PX = 20;
function sameStretches(a: Map<number, number>, b: Map<number, number>): boolean {
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
      const share = Math.round(Math.min(gaps[g].cap, remaining / (gaps.length - g)));
      if (share <= 0) continue;
      remaining -= share;
      total += share;
      lines.set(gaps[g].at.line - 1, share);
      // To the hundredth, as the editor's blank line is: a rounded print
      // margin stood the heading under it up to half a pixel off.
      print.set(gaps[g].at.line, snapPx(Math.max(gaps[g].prev.printMb, gaps[g].at.printMt) + share));
    }
    if (total > 0) totals.set(pages[i].number, total);
  }
  return { lines, print, totals };
}

type BoxMeasure = {
  pag: EditorPagination;
  move?: FastrPagedResult;
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
  sizes: { mount: HTMLElement; id: string; line: number; size: { width: number; height: number } }[];
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
      return q !== undefined && p.firstLine === q.firstLine && p.cover === q.cover &&
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
      this.measure();
    }
    destroy() {
      this.resize?.disconnect();
      this.oracle.dispose();
    }
    update(u: ViewUpdate) {
      const landed = u.transactions.some((tr) =>
        tr.effects.some((e) => e.is(setPagination) || e.is(setLayoutHints) || e.is(setPrintMetrics))
      );
      if (landed || u.docChanged || u.viewportChanged || u.geometryChanged) {
        this.measure();
      }
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
            view.dom.style.setProperty("--fm-p-margin", `${metrics.pMargin}px`);
            view.dom.style.setProperty("--fm-li-gap", `${metrics.liGap}px`);
            view.dom.style.setProperty("--fm-li-indent", `${metrics.liIndent}px`);
            view.dom.style.setProperty("--fm-bq-pad", `${metrics.bqPad}px`);
            this.oracle.reset();
            setTimeout(() => {
              if (view.state.field(paginationField, false)?.pagination !== pag) return;
              view.dispatch({ effects: setPrintMetrics.of(metrics) });
            }, 0);
            return;
          }
          if (m.move !== undefined) {
            const { pag, move } = m;
            // Pages the new layout no longer has leave nothing behind: a
            // seam created later for the end would read a stale extra.
            for (const map of [pag.fillers, pag.topExtras]) {
              if (map === undefined) continue;
              for (const n of Array.from(map.keys())) if (n > move.total) map.delete(n);
            }
            this.pendingMove = true;
            // A dispatch cannot run inside the measure cycle that found the
            // layout; and only against the pagination it was measured on.
            setTimeout(() => {
              this.pendingMove = false;
              if (view.state.field(paginationField, false)?.pagination !== pag) return;
              view.dispatch({ effects: setPagination.of({ ...pag, result: move }) });
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
              if (view.state.field(paginationField, false)?.pagination !== pag) return;
              view.dispatch({ effects: setStretches.of(stretch) });
            }, 0);
          }
          for (const sz of m.sizes) {
            derivedFigureSizes.set(sz.id, sz.size);
            applyFigureSize(sz.mount, sz.size);
            applyFigureFit(sz.mount, m.pag.figureFits?.get(sz.line));
          }
          for (const t of m.tocPages) t.el.setAttribute("data-fm-page", t.text);
          if (
            m.writes.length === 0 && m.aligns.length === 0 && m.extras.length === 0 &&
            m.fits.length === 0 && m.sizes.length === 0
          ) return;
          m.pag.fillers ??= new Map();
          m.pag.topExtras ??= new Map();
          m.pag.figureFits ??= new Map();
          for (const w of m.writes) {
            if (w.el !== undefined) {
              w.el.style.paddingTop = `${Math.max(0, w.px)}px`;
              const foot = w.el.querySelector<HTMLElement>(".fm-page-gutter__foot");
              if (foot !== null) foot.style.marginTop = w.px < 0 ? `${w.px}px` : "";
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
      const hints = view.state.field(layoutHintsField, false) ?? new Map<string, FastrLayoutHint>();
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
        if (metricsStanding === undefined || JSON.stringify(measured) !== JSON.stringify(metricsStanding)) {
          return { pag, metrics: measured, writes: [], aligns: [], extras: [], fits: [], sizes: [], tocPages: [] };
        }
      }
      const rhythm = docRhythmOf(view.state, metricsStanding);
      // The layout, from the heights as they stand.
      const blocks = flowBlocksOf(view, hints, area, this.oracle, geometry, resolver);
      const laid = layoutFastrPages(blocks, layoutGeometry);
      if (!this.pendingMove && !samePages(laid, pag.result)) {
        return { pag, move: laid, writes: [], aligns: [], extras: [], fits: [], sizes: [], tocPages: [] };
      }
      const writes: BoxMeasure["writes"] = [];
      const aligns: BoxMeasure["aligns"] = [];
      const sheetRect = view.scrollDOM.getBoundingClientRect();
      // In-block seams, aligned to the sheet from their rendered position.
      for (
        const seam of Array.from(
          view.contentDOM.querySelectorAll<HTMLElement>(".fm-page-gutter--inner"),
        )
      ) {
        // The strip that must span the sheet: the seam itself, or inside a
        // table its sheet box (seamRow).
        const strip = seam.querySelector<HTMLElement>(".fm-page-gutter__sheet") ?? seam;
        const r = strip.getBoundingClientRect();
        const dx = r.left - sheetRect.left;
        const dw = r.width - sheetRect.width;
        if (Math.abs(dx) > 0.5 || Math.abs(dw) > 0.5) {
          const current = parseFloat(getComputedStyle(strip).marginLeft) || 0;
          aligns.push({ el: strip, marginLeft: current - dx, width: sheetRect.width });
        }
      }
      // Every seam element by the page it starts (the end element by
      // total + 1), for the fillers.
      const seamEls = new Map<number, HTMLElement>();
      for (const el of Array.from(view.contentDOM.querySelectorAll<HTMLElement>(".fm-page-gutter"))) {
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
          while (b < blocks.length && blocks[b].line < to) pageBlocks[i].push(blocks[b++]);
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
      const pageKeyOf = (i: number) => `${i === 0 ? 1 : 0}\u0000${pageBlocks[i].map((fb) => fb.text).join("\u0001")}`;
      const measuredExtent = (i: number): number | undefined => {
        const startLine = i === 0 ? pageBlocks[0][0]?.line : pages[i].firstLine;
        const nextLine = pages[i + 1]?.firstLine;
        if (startLine === undefined || nextLine === undefined || nextLine <= startLine) return undefined;
        if (pageBlocks[i][0]?.line !== startLine || pageBlocks[i + 1][0]?.line !== nextLine) return undefined;
        // Remembered by the page's content once measured: a page that has
        // scrolled out of view keeps its exact extent rather than falling
        // back to the layout's sum, or its seam would move by a fraction
        // every time it left the viewport and came back.
        const pageKey = pageKeyOf(i);
        if (!renderedRange(startLine, nextLine - 1)) return measuredPageExtents.get(pageKey);
        let top = lineBox(view, startLine).top;
        if (i > 0 && pageBlocks[i][0]?.kind === "r") {
          // A region that opens a page holds the page's seam inside its own
          // widget (applyRegionPagination): the page's content starts under it.
          const own = view.contentDOM.querySelector<HTMLElement>(
            `[data-region-line="${startLine}"] .fm-page-gutter[data-page="${i + 1}"]`,
          );
          if (own === null) return undefined;
          top += own.getBoundingClientRect().height;
        }
        let extent = lineBox(view, nextLine - 1).bottom - top;
        if (standingStretch !== undefined) {
          for (const [line, px] of standingStretch) if (line >= startLine && line < nextLine) extent -= px;
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
        for (const fb of list) if (fb.domHeight !== undefined) extent += fb.domHeight - fb.height;
        if (last !== undefined && last.endLine < to) {
          const after = last.endLine + 1;
          if (after < doc.lines && after < to && rhythm.blank(after)) {
            // The blank line at the page's foot takes the room left, at
            // most its own height (Stretches.ends).
            const trail = rhythm.blankGap.get(after) ?? 0;
            const endGap = Math.max(0, Math.min(trail, fastrPageArea(layoutGeometry, page) - extent));
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
          if (Math.abs(measured + extra - extent) <= 2) return fastrPageArea(layoutGeometry, page) - extra - measured;
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
        const filler = Math.round((leftovers[i] - (stretch.totals.get(page.number) ?? 0)) * 64) / 64;
        const el = seamEls.get(page.number + 1);
        const current = el !== undefined
          ? (parseFloat(el.style.paddingTop) || 0) + (parseFloat(el.querySelector<HTMLElement>(".fm-page-gutter__foot")?.style.marginTop ?? "") || 0)
          : pag.fillers?.get(page.number) ?? -1000;
        if (Math.abs(filler - current) > 0.05) writes.push({ el, page: page.number, px: filler });
      }
      const standing = view.state.field(stretchField, false);
      const stretchOut = standing !== undefined &&
          (!sameStretches(standing.lines, stretch.lines) || !sameStretches(standing.ends, ends))
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
        const px = snapPx(byLine.get(page.firstLine)?.topExtra ?? 0);
        const el = seamEls.get(page.number);
        const current = el !== undefined
          ? parseFloat(el.style.paddingBottom) || 0
          : pag.topExtras?.get(page.number) ?? 0;
        if (Math.abs(px - current) > 0.05) extras.push({ el, page: page.number, px });
      }
      // The contents block's entries: the page each heading falls on, as
      // print's target-counter gives it (the CSS draws data-fm-page).
      const tocPages: BoxMeasure["tocPages"] = [];
      for (const a of Array.from(view.contentDOM.querySelectorAll<HTMLElement>(".cm-fm-leaf a[data-toc-line]"))) {
        const line1 = Number(a.getAttribute("data-toc-line"));
        if (!Number.isFinite(line1)) continue;
        let page = 1;
        for (const p of pages) if ((p.firstLine ?? 0) <= line1 - 1) page = p.number;
        const text = String(page);
        if (a.getAttribute("data-fm-page") !== text) tocPages.push({ el: a, text });
      }
      // Mounts whose drawn chart says their size: one still waiting for
      // it, or one boxed to another aspect than the chart drew.
      const sizes: BoxMeasure["sizes"] = [];
      for (
        const mount of Array.from(
          view.contentDOM.querySelectorAll<HTMLElement>('[data-embed-kind="figure"]'),
        )
      ) {
        const drawn = drawnCanvasSize(mount);
        if (drawn === undefined) continue;
        const w = parseFloat(mount.style.getPropertyValue("--fm-fig-w"));
        const h = parseFloat(mount.style.getPropertyValue("--fm-fig-h"));
        const boxed = Number.isFinite(w) && Number.isFinite(h) && h > 0 ? { width: w, height: h } : undefined;
        if (boxed !== undefined && sameAspect(boxed, drawn)) continue;
        const id = mount.getAttribute("data-embed-id") ?? "";
        const line = Number(mount.closest("[data-region-line]")?.getAttribute("data-region-line"));
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
        const px = shrink !== undefined ? snapPx(fb.imgH - shrink) : undefined;
        const mount = view.contentDOM.querySelector<HTMLElement>(
          `[data-region-line="${fb.line}"] [data-embed-kind="figure"][data-fm-sized]`,
        );
        const shown = mount !== null
          ? parseFloat(mount.style.getPropertyValue("--fm-fig-fit"))
          : pag.figureFits?.get(fb.line);
        const cur = shown !== undefined && Number.isFinite(shown) ? shown : undefined;
        const same = px === cur || (px !== undefined && cur !== undefined && Math.abs(px - cur) <= 0.05);
        if (!same) fits.push({ el: mount ?? undefined, line: fb.line, px });
      }
      return { pag, writes, aligns, extras, fits, stretch: stretchOut, sizes, tocPages };
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

export function livePreviewExtensions(
  resolver: EmbedResolver,
  collab?: PresenceDeps,
): Extension[] {
  return [
    printMetricsField,
    ...liveRegionExtensions(resolver),
    surfaceLineField,
    concealPlugin,
    livePreviewTheme,
    sheetBleedVars,
    docGroundPlugin(resolver),
    embedSizePlugin(resolver),
    paginationField,
    layoutHintsField,
    stretchField,
    paginationPlugin,
    pageBoxPlugin(resolver),
    ...(collab ? [regionPresencePlugin(collab), presenceFacet.of(collab)] : []),
  ];
}
