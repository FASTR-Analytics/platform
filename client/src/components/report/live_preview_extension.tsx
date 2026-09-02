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
//   • Inline conceal: heading/emphasis/code/link markup and `[x]{.role}` marks
//     hide off-cursor and reveal when the selection touches the construct.
//   • Surface lines: heading lines get cm-fm-hN classes so the theme's type
//     scale applies in the editor (buildFastrEditorSurfaceCss).
//
// The scoped theme stylesheet (scope class on the editor wrapper) is rendered
// by the host as a plain <style> element — a theme switch re-renders that one
// element and never touches the editor.
// =============================================================================

import {
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
  type EditorState,
  EditorState as CMEditorState,
  type Extension,
  RangeSetBuilder,
  StateField,
  Transaction,
} from "@codemirror/state";
import { syntaxTree } from "@codemirror/language";
import { render } from "solid-js/web";
import { Show } from "solid-js";
import type { Awareness } from "y-protocols/awareness";
import * as Y from "yjs";
import {
  FASTR_TONES,
  FM_BOX_GAP,
  FM_BOX_INSET,
  FM_BOX_PAD_BOTTOM,
  type FastrLiveRegion,
  type FastrOpenFence,
  fastrLiveRegions,
  fastrOpenFenceOnLine,
  isDarkCssColor,
  isFastrEmbedLine,
  isFastrInkRole,
  isFastrLeafBlock,
  renderFastrMarkdownToHtml,
  safeCssColor,
  scanContainerLines,
  t3,
  updateContainerFenceLine,
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



// ── Region ranges ────────────────────────────────────────────────────────────

type RegionRange = { region: FastrLiveRegion; from: number; to: number };

function regionRanges(state: EditorState): RegionRange[] {
  return fastrLiveRegions(state.doc.iterLines(1, state.doc.lines + 1)).map(
    (region) => ({
      region,
      from: state.doc.line(region.startLine + 1).from,
      to: state.doc.line(region.endLine + 1).to,
    }),
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
  ) {
    super();
  }

  override eq(other: RegionWidget): boolean {
    // Source + kind only — theming is external CSS, so a re-theme never
    // touches the editor; a remote edit inside the region changes the source
    // and re-creates just this widget.
    return other.kind === this.kind && other.source === this.source &&
      other.startLine === this.startLine;
  }

  override toDOM(view: EditorView): HTMLElement {
    const dom = document.createElement("div");
    // Vertical PADDING, never margins: CodeMirror measures the widget's box
    // for vertical layout and margins fall outside it, desyncing cursor
    // positions below (the embedWidgets rule).
    dom.className = "fm-live-region w-full cursor-text";
    dom.style.display = "flow-root";
    dom.contentEditable = "false";
    dom.setAttribute("data-region-line", String(this.startLine));
    dom.setAttribute("data-region-end", String(this.endLine));

    dom.innerHTML = sanitizeReportHtml(
      renderFastrMarkdownToHtml(this.source, { lineAnchors: true }),
    );
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
          img.addEventListener("load", () => view.requestMeasure());
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

    dom.addEventListener("click", (e) => {
      const target = e.target as HTMLElement;
      const embed = target.closest<HTMLElement>("[data-embed-id]");
      if (embed) {
        e.stopPropagation();
        this.resolver.onSelectEmbed(
          (embed.getAttribute("data-embed-kind") ?? "figure") as
            | "figure"
            | "image",
          embed.getAttribute("data-embed-id") ?? "",
        );
        return;
      }
      // Whole-region reveal, caret on the clicked line. data-line values are
      // region-relative (the renderer saw only the slice).
      const anchorEl = target.closest<HTMLElement>("[data-line]");
      const rel = anchorEl ? Number(anchorEl.getAttribute("data-line")) : NaN;
      const fallback = this.kind === "container"
        ? this.startLine + 2
        : this.startLine + 1;
      const line1 = Math.max(
        this.startLine + 1,
        Math.min(
          Number.isFinite(rel) ? this.startLine + rel + 1 : fallback,
          this.endLine + 1,
          view.state.doc.lines,
        ),
      );
      view.dispatch({
        selection: { anchor: view.state.doc.line(line1).from },
        scrollIntoView: true,
      });
      view.focus();
    });
    return dom;
  }

  override destroy(dom: HTMLElement): void {
    (dom as unknown as { _dispose?: () => void })._dispose?.();
  }

  override get estimatedHeight(): number {
    if (this.kind === "embed") return 260;
    const lines = this.endLine - this.startLine + 1;
    return Math.max(40, Math.min(1200, 28 * lines));
  }
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

// `:::report` renders nothing (silent), so its widget is an honest chip — an
// invisible widget would make the line unfindable forever.
class PageSetupWidget extends WidgetType {
  constructor(readonly source: string, readonly startLine: number) {
    super();
  }
  override eq(other: PageSetupWidget): boolean {
    return other.source === this.source;
  }
  override toDOM(view: EditorView): HTMLElement {
    const dom = document.createElement("div");
    dom.className = "fm-live-region w-full cursor-pointer py-1";
    dom.contentEditable = "false";
    dom.setAttribute("data-region-line", String(this.startLine));
    dom.setAttribute("data-region-end", String(this.startLine));
    const chip = document.createElement("span");
    chip.className =
      "inline-block rounded border px-2 py-0.5 font-mono text-xs opacity-60";
    chip.textContent = `⚙ ${
      t3({ en: "Page setup", fr: "Mise en page", pt: "Configuração da página" })
    } · ${this.source.trim()}`;
    dom.appendChild(chip);
    dom.addEventListener("click", () => {
      view.dispatch({
        selection: { anchor: view.state.doc.line(this.startLine + 1).from },
        scrollIntoView: true,
      });
      view.focus();
    });
    return dom;
  }
  override get estimatedHeight(): number {
    return 34;
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
  const tone = attrs["tone"];
  if (
    typeof tone === "string" &&
    (FASTR_TONES as readonly string[]).includes(tone.toLowerCase()) &&
    tone.toLowerCase() !== "default"
  ) return tone.toLowerCase();
  return undefined;
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
    cls = attrs["accent"] !== undefined ? "fm-card fm-card--accent" : "fm-card";
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
function attachAttrEditor(
  el: HTMLElement,
  view: EditorView,
  line1: number,
  attr: string,
  original: string,
  placeholder: string,
) {
  el.classList.add("cm-fm-attr");
  el.setAttribute("data-placeholder", placeholder);
  el.addEventListener("click", (e) => {
    e.stopPropagation();
    if (el.isContentEditable) return;
    // Caret onto the fence line (no focus steal) so the toolbar shows this
    // block's controls while the label is being edited.
    if (line1 <= view.state.doc.lines) {
      view.dispatch({
        selection: { anchor: view.state.doc.line(line1).from },
      });
    }
    try {
      el.contentEditable = "plaintext-only";
    } catch {
      el.contentEditable = "true";
    }
    el.focus();
  });
  const commit = () => {
    const next = (el.textContent ?? "").replace(/\s+/g, " ").trim();
    el.contentEditable = "false";
    if (next === original.trim()) return;
    if (line1 > view.state.doc.lines) return;
    const line = view.state.doc.line(line1);
    const patched = updateContainerFenceLine(line.text, { [attr]: next });
    if (patched === undefined || patched === line.text) return;
    view.dispatch({
      changes: { from: line.from, to: line.to, insert: patched },
    });
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

function chromeRoot(view: EditorView, line1: number): HTMLElement {
  const dom = document.createElement("div");
  // flow-root contains the sheet classes' own margins — a block widget must
  // never let a child margin escape its box (the CM measurement rule).
  dom.className = "cm-fm-chrome w-full";
  dom.style.display = "flow-root";
  dom.contentEditable = "false";
  dom.addEventListener("click", () => {
    // Caret onto the (hidden) fence line: typing there is refused by the
    // guard, but the toolbar reads the caret and shows this block's controls.
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
class LeafRenderWidget extends WidgetType {
  constructor(readonly source: string, readonly line1: number) {
    super();
  }
  override eq(other: LeafRenderWidget): boolean {
    return other.source === this.source && other.line1 === this.line1;
  }
  override toDOM(view: EditorView): HTMLElement {
    const dom = chromeRoot(view, this.line1);
    dom.innerHTML = sanitizeReportHtml(
      renderFastrMarkdownToHtml(this.source, { lineAnchors: false }),
    );
    // The stat's own text edits in place — each piece maps to its attr.
    const attrs = fastrOpenFenceOnLine(this.source, this.line1)?.attrs ?? {};
    const pieces: [string, string, string][] = [
      ["fm-stat__value", "value", "0"],
      ["fm-stat__label", "label", t3({ en: "Label…", fr: "Libellé…", pt: "Rótulo…" })],
      ["fm-stat__delta", "delta", ""],
    ];
    for (const [cls, attr, placeholder] of pieces) {
      const el = dom.querySelector<HTMLElement>(`.${cls}`);
      if (!el) continue;
      const original = typeof attrs[attr] === "string" ? (attrs[attr] as string) : "";
      attachAttrEditor(el, view, this.line1, attr, original, placeholder);
    }
    return dom;
  }
  override get estimatedHeight(): number {
    return 110;
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
              : new LeafRenderWidget(line.text, item.line1),
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
  // Fence/leaf lines of REVEALED regions plus the whole span of every region:
  // what the transaction filter consults to refuse user edits into structure.
  protectedLines: ProtectedLine[];
  // One BOX per box-worthy revealed frame, drawn by the layer below the text:
  // the block's REAL sheet classes, so the theme's borders, radius and shadow
  // match the preview exactly.
  boxes: BoxInfo[];
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

function buildLiveState(
  state: EditorState,
  resolver: EmbedResolver,
  cached?: RegionRange[],
): LiveState {
  const ranges = cached ?? regionRanges(state);
  const builder = new RangeSetBuilder<Decoration>();
  const protectedLines: ProtectedLine[] = [];
  const boxes: BoxInfo[] = [];
  for (const r of ranges) {
    // Derived reveal: a region the selection touches opens for editing IN
    // PLACE, still looking like the block. Fence lines never show as syntax —
    // the open fence becomes the block's real chrome (a callout's title bar,
    // a kicker) and the close fence a silent end cap; leaf lines (stats) and
    // embeds stay fully rendered; only the prose lines are editable text,
    // painted with the innermost block's ground. The fence and leaf lines are
    // recorded as PROTECTED: a transaction filter refuses user edits that
    // touch them, so the attrs are reachable only through the toolbar.
    if (selectionTouches(state, r.from, r.to)) {
      buildRevealedRegion(state, r, builder, protectedLines, boxes, resolver);
      continue;
    }
    protectedLines.push({
      from: r.from,
      to: r.to,
      regionFrom: r.from,
      regionTo: r.to,
    });
    const source = state.sliceDoc(r.from, r.to);
    const widget = r.region.kind === "leaf" && r.region.fence?.name === "report"
      ? new PageSetupWidget(source, r.region.startLine)
      : new RegionWidget(
        r.region.kind,
        source,
        r.region.startLine,
        r.region.endLine,
        resolver,
      );
    builder.add(r.from, r.to, Decoration.replace({ widget, block: true }));
  }
  return { ranges, deco: builder.finish(), protectedLines, boxes };
}

export function liveRegionExtensions(resolver: EmbedResolver): Extension[] {
  const field = StateField.define<LiveState>({
    create(state) {
      return buildLiveState(state, resolver);
    },
    update(value, tr) {
      if (tr.docChanged) return buildLiveState(tr.state, resolver);
      if (tr.selection) {
        return buildLiveState(tr.state, resolver, value.ranges);
      }
      return value;
    },
    provide: (f) => EditorView.decorations.from(f, (v) => v.deco),
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
        const inset = (b.depth - 1) * FM_BOX_INSET;
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
    return tr.docChanged ? buildSurfaceLines(tr.state) : deco;
  },
  provide: (f) => EditorView.decorations.from(f),
});

function buildSurfaceLines(state: EditorState): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  // scanContainerLines flags code-fence interiors, where a # line is content.
  for (const { index, text, inCode } of scanContainerLines(
    state.doc.iterLines(1, state.doc.lines + 1),
  )) {
    if (inCode) continue;
    const m = HEADING_LINE_RE.exec(text);
    if (!m) continue;
    const from = state.doc.line(index + 1).from;
    builder.add(from, from, Decoration.line({ class: `cm-fm-h${m[1].length}` }));
  }
  return builder.finish();
}

// ── Inline conceal ───────────────────────────────────────────────────────────

const ROLE_MARK_RE = /\[([^\]]*)\]\{\.([a-z][a-z0-9-]*)\}/g;

class BulletWidget extends WidgetType {
  override toDOM(): HTMLElement {
    const el = document.createElement("span");
    el.className = "cm-fm-bullet";
    el.textContent = "•";
    return el;
  }
  override eq(): boolean {
    return true;
  }
}
const BULLET = new BulletWidget();

function buildConceal(view: EditorView): DecorationSet {
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
            if (revealed(node.from, node.to)) return;
            const mark = node.node.getChild("HeaderMark");
            if (mark) {
              add(
                mark.from,
                Math.min(mark.to + 1, node.to),
                conceal,
              );
            }
            return;
          }
          case "StrongEmphasis":
          case "Emphasis": {
            if (revealed(node.from, node.to)) return;
            for (const mark of node.node.getChildren("EmphasisMark")) {
              add(mark.from, mark.to, conceal);
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
            if (revealed(node.from, node.to)) return;
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
          case "ListMark": {
            // Bullets become glyphs; ordered markers stay (they carry info).
            if (!/^[-*+]$/.test(state.sliceDoc(node.from, node.to))) return;
            if (revealed(node.from, node.to)) return;
            add(
              node.from,
              node.to,
              Decoration.replace({ widget: BULLET }),
            );
            return;
          }
        }
      },
    });

    // `[x]{.role}` is FASTR syntax the Lezer grammar doesn't know — regex over
    // the visible text, skipping code (the tree query above would be costly
    // per match; code spans render the syntax anyway, which is correct).
    const text = state.sliceDoc(from, to);
    ROLE_MARK_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = ROLE_MARK_RE.exec(text)) !== null) {
      if (!isFastrInkRole(m[2])) continue;
      const start = from + m.index;
      const end = start + m[0].length;
      if (revealed(start, end)) continue;
      // Inside code spans/fences the renderer keeps the syntax literal, so
      // the conceal must too.
      const nodeAt = syntaxTree(state).resolveInner(start, 1);
      if (/Code/.test(nodeAt.name)) continue;
      add(start, start + 1, conceal);
      add(
        start + 1,
        start + 1 + m[1].length,
        // The REAL mark classes — the scoped theme sheet styles them.
        Decoration.mark({ class: `fm-mark fm-mark--${m[2]}` }),
        false,
      );
      add(start + 1 + m[1].length, end, conceal);
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

const concealPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = buildConceal(view);
    }
    update(u: ViewUpdate) {
      if (u.docChanged || u.selectionSet || u.viewportChanged) {
        this.decorations = buildConceal(u.view);
      }
    }
  },
  { decorations: (v) => v.decorations },
);

// ── Peer presence on collapsed regions ───────────────────────────────────────
// yCollab draws remote carets in TEXT; a caret inside a collapsed region has
// no text to sit in, so the widget itself carries the peer's colour and name.
// DOM-only writes (no dispatch), recomputed on awareness change and doc
// change — never on local cursor movement.

type PresenceDeps = { yText: Y.Text; awareness: Awareness };

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
        if (u.docChanged || u.viewportChanged) this.schedule();
      }
      schedule() {
        if (this.raf) return;
        this.raf = requestAnimationFrame(() => {
          this.raf = 0;
          this.paint();
        });
      }
      paint() {
        const widgets = Array.from(
          this.view.dom.querySelectorAll<HTMLElement>("[data-region-line]"),
        );
        for (const w of widgets) {
          w.style.outline = "";
          w.querySelector(".fm-live-presence")?.remove();
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
          target.style.outline = `2px solid ${color}`;
          if (!target.querySelector(".fm-live-presence")) {
            const chip = document.createElement("div");
            chip.className =
              "fm-live-presence pointer-events-none absolute -top-0 right-0 rounded px-1.5 text-[10px] text-white";
            chip.style.background = color;
            chip.textContent = state.user.name ?? "";
            target.style.position = "relative";
            target.appendChild(chip);
          }
        }
      }
      containsLine(w: HTMLElement, line0: number): boolean {
        const start = Number(w.getAttribute("data-region-line"));
        const end = Number(w.getAttribute("data-region-end") ?? start);
        return line0 >= start && line0 <= end;
      }
      destroy() {
        deps.awareness.off("change", this.onAwareness);
        if (this.raf) cancelAnimationFrame(this.raf);
      }
    },
  );
}

// ── The document-surface theme ───────────────────────────────────────────────
// Every value is a token reference, so this theme never needs reconfiguring on
// a theme switch — the host's <style> element moves, the vars follow.

const livePreviewTheme = EditorView.theme({
  ".cm-content": {
    maxWidth: "var(--fm-measure)",
    fontFamily: "var(--fm-font-body)",
    color: "var(--fm-ink)",
    fontSize: "16px",
    lineHeight: "1.55",
    caretColor: "var(--fm-ink)",
  },
  ".cm-scroller": { background: "var(--fm-page)" },
  ".cm-gutters": { display: "none" },
});

// ── Assembly ─────────────────────────────────────────────────────────────────

export function livePreviewExtensions(
  resolver: EmbedResolver,
  collab?: PresenceDeps,
): Extension[] {
  return [
    ...liveRegionExtensions(resolver),
    surfaceLineField,
    concealPlugin,
    livePreviewTheme,
    ...(collab ? [regionPresencePlugin(collab)] : []),
  ];
}
