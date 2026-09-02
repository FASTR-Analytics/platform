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
  ViewPlugin,
  type ViewUpdate,
  WidgetType,
} from "@codemirror/view";
import {
  type EditorState,
  type Extension,
  RangeSetBuilder,
  StateField,
} from "@codemirror/state";
import { syntaxTree } from "@codemirror/language";
import { render } from "solid-js/web";
import { Show } from "solid-js";
import type { Awareness } from "y-protocols/awareness";
import * as Y from "yjs";
import {
  type FastrLiveRegion,
  fastrLiveRegions,
  isFastrInkRole,
  renderFastrMarkdownToHtml,
  scanContainerLines,
  t3,
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
    dom.className = "fm-live-region w-full cursor-text py-2";
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

// ── The region field ─────────────────────────────────────────────────────────

type LiveState = { ranges: RegionRange[]; deco: DecorationSet };

function buildLiveState(
  state: EditorState,
  resolver: EmbedResolver,
  cached?: RegionRange[],
): LiveState {
  const ranges = cached ?? regionRanges(state);
  const builder = new RangeSetBuilder<Decoration>();
  for (const r of ranges) {
    // Derived reveal: a region the selection touches stays raw source. This
    // maps through remote transactions for free and cannot desync.
    if (selectionTouches(state, r.from, r.to)) continue;
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
  return { ranges, deco: builder.finish() };
}

export function liveRegionField(resolver: EmbedResolver) {
  return StateField.define<LiveState>({
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
    provide: (f) =>
      EditorView.decorations.from(f, (v) => v.deco),
  });
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
    liveRegionField(resolver),
    surfaceLineField,
    concealPlugin,
    livePreviewTheme,
    ...(collab ? [regionPresencePlugin(collab)] : []),
  ];
}
