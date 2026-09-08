// =============================================================================
// The paged edit surface: the Edit pane as the PRINTED PAGES. An iframe holds
// the exact document the PDF is printed from (same builder, same theme sheet,
// same rasters, Paged.js laying it into A4 boxes), and the in-place editors
// the CodeMirror widgets already use (live_preview_extension.tsx: text
// islands, block labels, stat pieces, table cells) are attached to the page
// DOM. Every edit is dispatched into the CodeMirror view, which stays the
// model (undo, collab, the toolbar API); the surface re-lays the pages out
// after a pause and swaps the new frame in, restoring the caret from the
// CodeMirror selection the islands keep mirrored.
//
// Two frames, double-buffered: the next layout renders in the hidden one, so a
// re-layout never flashes and the user keeps typing in the visible island
// until the swap. Same origin (srcdoc) so the parent reaches the page DOM;
// scripts allowed for Paged.js.
// =============================================================================

import type { EditorView } from "@codemirror/view";
import { hideMenu } from "panther";
import * as Y from "yjs";
import {
  FASTR_PAGED_GLOBAL,
  type FastrPagedResult,
  fastrOpenFenceOnLine,
  fastrStripInlineSyntax,
  linePrefixLength,
  t3,
} from "lib";
import {
  attachAttrEditor,
  attachCellContextMenu,
  attachCellEditor,
  attachStatEditors,
  attachStepsChildContextMenu,
  attachTextEditor,
  attachTilesChildContextMenu,
  chromeAttrRows,
  pagedCaretIntent,
  type PresenceDeps,
  textIslandEndRel,
} from "./live_preview_extension";

export type PagedSurfaceDeps = {
  view: () => EditorView | undefined;
  // The paged standalone document for a body (the host owns rasters, theme,
  // label): what the PDF prints.
  buildHtml: (body: string) => Promise<string>;
  onSelectEmbed: (kind: "figure" | "image", id: string) => void;
};

export type PagedSurface = {
  setActive: (on: boolean) => void;
  // After a doc change: re-lay out once typing pauses.
  schedule: () => void;
  // Now (theme, rasters, label).
  refresh: () => void;
  setPresence: (deps: PresenceDeps | undefined) => void;
  dispose: () => void;
};

const DEBOUNCE_MS = 500;
const LAYOUT_TIMEOUT_MS = 30_000;
const POLL_MS = 60;

const TEXT_ISLANDS =
  "p[data-line], li[data-line], h1[data-line], h2[data-line], h3[data-line], h4[data-line], h5[data-line], h6[data-line]";

// Editor-only additions to the printed document: the app's ground around the
// sheets, the in-place editing affordances, ghost rows revealed on hover, the
// page-break divider, peer carets. Nothing here changes a page's own pixels.
function surfaceCss(): string {
  const pageBreak = t3({ en: "page break", fr: "saut de page", pt: "quebra de página" })
    .replace(/["\\]/g, "");
  return `
html { background: #e5e7eb !important; overflow-y: scroll; }
.pagedjs_pages { padding: 24px 0 48px; }
.pagedjs_page { box-shadow: 0 1px 3px rgba(0,0,0,.25), 0 10px 28px rgba(0,0,0,.14); margin: 0 auto 28px; }
.cm-fm-text-edit { cursor: text; }
.cm-fm-text-edit:hover { text-decoration: underline dotted; text-underline-offset: 3px; }
.cm-fm-text-edit:focus { outline: 1px dashed var(--fm-accent-text); outline-offset: 2px; text-decoration: none; }
.cm-fm-attr { cursor: text; }
.cm-fm-attr:hover { text-decoration: underline dotted; text-underline-offset: 3px; }
.cm-fm-attr:focus { outline: none; text-decoration: underline dotted; text-underline-offset: 3px; }
.cm-fm-attr:empty::before { content: attr(data-placeholder); color: var(--fm-ink-muted); font-style: italic; }
/* Ghost rows (an untitled block's title, a stat's missing pieces) exist only
   to click into: shown on hover or while a piece of the block is being
   edited, so a page at rest is exactly the printed page. */
.cm-fm-attr:empty { display: none; }
[data-line]:hover > .cm-fm-attr:empty, [data-line]:focus-within > .cm-fm-attr:empty,
.fm-stat:hover > .cm-fm-attr:empty, .fm-stat:focus-within > .cm-fm-attr:empty { display: block; }
.cm-fm-island-syntax { display: none; }
.fm-pagebreak {
  display: flex; align-items: center; gap: 0.8em; height: auto; margin: 0.6em 0; overflow: visible;
  color: var(--fm-ink-muted); font-family: var(--fm-font-body); font-size: 0.7em;
  letter-spacing: 0.08em; text-transform: uppercase; cursor: pointer;
}
.fm-pagebreak::before, .fm-pagebreak::after { content: ""; flex: 1; border-top: 1px dashed var(--fm-ink-muted); }
.fm-pagebreak::before { content: "${pageBreak}"; flex: 0; border: 0; }
.fm-pagebreak::after { content: ""; }
.fm-pagebreak > span { display: none; }
img[data-embed-kind], .report-embed-pending, .report-embed-missing { cursor: pointer; }
.fm-peer-layer { position: absolute; left: 0; top: 0; width: 0; height: 0; pointer-events: none; z-index: 20; }
.fm-peer-caret { position: absolute; width: 2px; margin-left: -1px; border-radius: 1px; }
.fm-peer-caret__name {
  position: absolute; left: -1px; top: -1.35em; white-space: nowrap; padding: 0 0.4em;
  border-radius: 3px; font: 600 10px/1.5 system-ui, sans-serif; color: #fff;
}
`;
}

type FocusMemo =
  | { kind: "text"; selectAll: boolean }
  | { kind: "attr"; line: number; cls: string }
  | { kind: "cell"; row: number; index: number };

type ActivatableEl = HTMLElement & {
  _fmActivate?: () => void;
  _fmAttrActivate?: () => void;
  _fmCellActivate?: () => void;
};

function firstClass(el: Element): string {
  return el.className.split(" ")[0] ?? "";
}

function pageOf(el: Element): Element | null {
  return el.closest(".pagedjs_page");
}

// Place the caret at a source offset inside an island: every text node
// counts, hidden syntax spans included, because the island's textContent IS
// the source and the offset comes from the CodeMirror selection.
function setCaretAt(el: HTMLElement, offset: number): void {
  const doc = el.ownerDocument;
  const win = doc.defaultView;
  if (!win) return;
  const walker = doc.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let node: Text | null;
  let remaining = offset;
  let last: Text | null = null;
  const range = doc.createRange();
  while ((node = walker.nextNode() as Text | null)) {
    last = node;
    if (remaining <= node.length) {
      range.setStart(node, remaining);
      range.collapse(true);
      const sel = win.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
      return;
    }
    remaining -= node.length;
  }
  if (last) range.setStart(last, last.length);
  else range.setStart(el, 0);
  range.collapse(true);
  const sel = win.getSelection();
  sel?.removeAllRanges();
  sel?.addRange(range);
}

export function createPagedEditSurface(
  host: HTMLElement,
  deps: PagedSurfaceDeps,
): PagedSurface {
  let active = false;
  let disposed = false;
  let front: HTMLIFrameElement | undefined;
  let back: HTMLIFrameElement | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let running = false;
  let queued = false;
  let presence: PresenceDeps | undefined;
  let presenceOff: (() => void) | undefined;
  let paintTimer: ReturnType<typeof setTimeout> | undefined;
  // A placeholder paragraph was just added: select it whole once it renders.
  let pendingSelectAll = false;

  function makeFrame(): HTMLIFrameElement {
    const f = document.createElement("iframe");
    f.setAttribute("sandbox", "allow-same-origin allow-scripts");
    f.setAttribute("title", "pages");
    f.style.cssText =
      "position:absolute;inset:0;width:100%;height:100%;border:0;visibility:hidden;background:#e5e7eb;";
    host.append(f);
    return f;
  }

  function clearTimer() {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
  }

  function schedule(delay: number) {
    if (!active || disposed) return;
    clearTimer();
    timer = setTimeout(() => {
      timer = undefined;
      void run();
    }, delay);
  }

  async function run(): Promise<void> {
    if (!active || disposed) return;
    if (running) {
      queued = true;
      return;
    }
    const view = deps.view();
    if (!view || !back) return;
    running = true;
    try {
      const html = await deps.buildHtml(view.state.doc.toString());
      if (!active || disposed || !back) return;
      const doc = await loadFrame(back, html.replace("</head>", `<style>${surfaceCss()}</style></head>`));
      if (!active || disposed || doc === undefined) return;
      attach(doc);
      swap();
    } catch (e) {
      console.warn("Page layout failed", e);
    } finally {
      running = false;
      if (queued && active && !disposed) {
        queued = false;
        schedule(0);
      }
    }
  }

  function loadFrame(frame: HTMLIFrameElement, html: string): Promise<Document | undefined> {
    return new Promise((resolve) => {
      const started = Date.now();
      const poll = () => {
        if (disposed || frame !== back) {
          resolve(undefined);
          return;
        }
        const win = frame.contentWindow as
          | (Window & Record<string, FastrPagedResult | undefined>)
          | null;
        const result = win?.[FASTR_PAGED_GLOBAL];
        if (result !== undefined) {
          if (result.error !== undefined) console.warn("Page layout error", result.error);
          resolve(frame.contentDocument ?? undefined);
          return;
        }
        if (Date.now() - started > LAYOUT_TIMEOUT_MS) {
          resolve(undefined);
          return;
        }
        setTimeout(poll, POLL_MS);
      };
      frame.addEventListener("load", () => setTimeout(poll, POLL_MS), { once: true });
      frame.srcdoc = html;
    });
  }

  // ── Editing on the pages ──────────────────────────────────────────────────

  function attach(doc: Document): void {
    const view = deps.view();
    if (!view) return;
    const lines = view.state.doc.toString().split("\n");
    doc.addEventListener("mousedown", () => hideMenu(), true);
    // Islands: every prose element is one. Continuations of an element split
    // across pages are not (their text is a fragment); the first fragment is,
    // and opening it hides its continuation until the next layout.
    for (const el of Array.from(doc.querySelectorAll<HTMLElement>(TEXT_ISLANDS))) {
      if (el.closest(".fm-stat, .fm-toc") || el.querySelector("img")) continue;
      if (el.hasAttribute("data-split-from")) continue;
      const rel = Number(el.getAttribute("data-line"));
      if (!Number.isFinite(rel) || lines[rel] === undefined) continue;
      attachTextEditor(el, view, 0, lines, rel, { paged: true });
      if (el.hasAttribute("data-split-to")) {
        const ref = el.getAttribute("data-ref");
        el.addEventListener("mousedown", () => {
          if (!ref) return;
          for (const c of Array.from(doc.querySelectorAll<HTMLElement>(`[data-ref="${ref}"][data-split-from]`))) {
            c.style.display = "none";
          }
        }, true);
      }
    }
    for (const statEl of Array.from(doc.querySelectorAll<HTMLElement>(".fm-stat[data-line]"))) {
      const rel = Number(statEl.getAttribute("data-line"));
      if (!Number.isFinite(rel) || lines[rel] === undefined) continue;
      attachStatEditors(statEl, view, rel + 1, lines[rel], true);
      attachTilesChildContextMenu(statEl, view, rel + 1);
    }
    for (const stepEl of Array.from(doc.querySelectorAll<HTMLElement>(".fm-steps > [data-line]"))) {
      const rel = Number(stepEl.getAttribute("data-line"));
      if (!Number.isFinite(rel) || lines[rel] === undefined) continue;
      attachStepsChildContextMenu(stepEl, view, rel + 1);
    }
    const rows = chromeAttrRows();
    for (const container of Array.from(doc.querySelectorAll<HTMLElement>("[data-line]"))) {
      if (container.hasAttribute("data-split-from")) continue;
      const rel = Number(container.getAttribute("data-line"));
      const text = lines[rel];
      if (!Number.isFinite(rel) || text === undefined) continue;
      const fence = fastrOpenFenceOnLine(text, rel + 1);
      if (!fence) continue;
      if (fence.name === "card" || fence.name === "col") {
        attachTilesChildContextMenu(container, view, rel + 1);
      }
      for (const [rootCls, childCls, attr, placeholder, ghost] of rows) {
        if (!container.classList.contains(rootCls)) continue;
        let el = container.querySelector<HTMLElement>(`:scope > .${childCls}`);
        if (!el && ghost) {
          el = doc.createElement("div");
          el.className = childCls;
          container.prepend(el);
        }
        if (!el || (el as unknown as { _wired?: boolean })._wired) continue;
        (el as unknown as { _wired?: boolean })._wired = true;
        const original = typeof fence.attrs[attr] === "string" ? (fence.attrs[attr] as string) : "";
        attachAttrEditor(el, view, rel + 1, attr, original, placeholder);
      }
    }
    for (const rowEl of Array.from(doc.querySelectorAll<HTMLElement>("tr[data-line]"))) {
      const rel = Number(rowEl.getAttribute("data-line"));
      if (!Number.isFinite(rel)) continue;
      Array.from(rowEl.querySelectorAll<HTMLElement>("td, th")).forEach((cell, i) => {
        attachCellEditor(cell, view, rel + 1, i);
        attachCellContextMenu(cell, view, rel + 1, i);
      });
    }
    for (const embed of Array.from(doc.querySelectorAll<HTMLElement>("[data-embed-kind][data-embed-id]"))) {
      embed.addEventListener("click", (e) => {
        e.stopPropagation();
        deps.onSelectEmbed(
          (embed.getAttribute("data-embed-kind") ?? "figure") as "figure" | "image",
          embed.getAttribute("data-embed-id") ?? "",
        );
      });
    }
    // A page break shows as a divider here; pressing it parks the caret on
    // its line so the toolbar's block segment can act on it.
    for (const pb of Array.from(doc.querySelectorAll<HTMLElement>(".fm-pagebreak[data-line]"))) {
      pb.addEventListener("mousedown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const rel = Number(pb.getAttribute("data-line"));
        if (!Number.isFinite(rel) || rel + 1 > view.state.doc.lines) return;
        view.dispatch({ selection: { anchor: view.state.doc.line(rel + 1).from } });
      });
    }
    // Pressing the empty part of a page: a new paragraph at the end of the
    // document, its placeholder selected so typing replaces it.
    doc.addEventListener("mousedown", (e) => {
      if (e.button !== 0) return;
      const target = e.target as HTMLElement | null;
      if (!target || !pageOf(target)) return;
      if (target.closest("[data-line], a, [data-embed-kind], .pagedjs_margin-bottom-left, .pagedjs_margin-bottom-right")) {
        return;
      }
      e.preventDefault();
      appendParagraph(view);
    });
    const layer = doc.createElement("div");
    layer.className = "fm-peer-layer";
    doc.body.append(layer);
  }

  function appendParagraph(view: EditorView) {
    const doc = view.state.doc;
    const placeholder = t3({ en: "New paragraph", fr: "Nouveau paragraphe", pt: "Novo parágrafo" });
    const tail = doc.sliceString(Math.max(0, doc.length - 2));
    const lead = doc.length === 0 ? "" : tail.endsWith("\n\n") ? "" : tail.endsWith("\n") ? "\n" : "\n\n";
    const insert = `${lead}${placeholder}`;
    const from = doc.length;
    pendingSelectAll = true;
    view.dispatch({
      changes: { from, insert },
      selection: { anchor: from + lead.length, head: from + insert.length },
    });
  }

  // ── Swapping frames, keeping the caret ────────────────────────────────────

  function captureFocus(doc: Document | null | undefined): FocusMemo | undefined {
    const a = doc?.activeElement as ActivatableEl | null | undefined;
    if (!a || !a.isContentEditable) {
      const intent = pagedCaretIntent.pending || pendingSelectAll;
      pagedCaretIntent.pending = false;
      return intent ? { kind: "text", selectAll: pendingSelectAll } : undefined;
    }
    if (a._fmCellActivate) {
      const row = a.closest("tr");
      const index = row ? Array.from(row.querySelectorAll("td, th")).indexOf(a) : -1;
      const line = Number(row?.getAttribute("data-line"));
      if (row && index >= 0 && Number.isFinite(line)) return { kind: "cell", row: line, index };
      return undefined;
    }
    if (a._fmAttrActivate) {
      const container = a.parentElement?.closest<HTMLElement>("[data-line]");
      const line = Number(container?.getAttribute("data-line"));
      if (Number.isFinite(line)) return { kind: "attr", line, cls: firstClass(a) };
      return undefined;
    }
    return { kind: "text", selectAll: pendingSelectAll };
  }

  function restoreFocus(doc: Document, memo: FocusMemo | undefined) {
    if (!memo) return;
    const view = deps.view();
    if (!view) return;
    if (memo.kind === "cell") {
      const row = doc.querySelector<HTMLElement>(`tr[data-line="${memo.row}"]`);
      const cell = row?.querySelectorAll<ActivatableEl>("td, th")[memo.index];
      cell?._fmCellActivate?.();
      return;
    }
    if (memo.kind === "attr") {
      const el = doc.querySelector<ActivatableEl>(`[data-line="${memo.line}"] > .${memo.cls}`) ??
        doc.querySelector<ActivatableEl>(`[data-line="${memo.line}"] .${memo.cls}`);
      el?._fmAttrActivate?.();
      return;
    }
    // Text: the island covering the CM selection's line.
    const sel = view.state.selection.main;
    const line = view.state.doc.lineAt(sel.head);
    const lineIdx = line.number - 1;
    const lines = view.state.doc.toString().split("\n");
    let best: ActivatableEl | undefined;
    let bestRel = -1;
    for (const el of Array.from(doc.querySelectorAll<ActivatableEl>(TEXT_ISLANDS))) {
      if (!el._fmActivate || el.hasAttribute("data-split-from")) continue;
      const rel = Number(el.getAttribute("data-line"));
      if (!Number.isFinite(rel) || rel > lineIdx || rel <= bestRel) continue;
      if (textIslandEndRel(lines, rel, el.tagName) < lineIdx) continue;
      best = el;
      bestRel = rel;
    }
    pendingSelectAll = false;
    if (!best) return;
    best._fmActivate?.();
    if (memo.selectAll) {
      doc.defaultView?.getSelection()?.selectAllChildren(best);
      return;
    }
    let offset = 0;
    for (let l = bestRel; l < lineIdx; l++) offset += (lines[l]?.length ?? 0) + 1;
    offset += sel.head - line.from;
    setCaretAt(best, offset);
    best.scrollIntoView({ block: "nearest" });
  }

  function swap() {
    if (!front || !back) return;
    const memo = captureFocus(front.contentDocument);
    const fw = front.contentWindow;
    const bw = back.contentWindow;
    if (fw && bw) bw.scrollTo(fw.scrollX, fw.scrollY);
    back.style.visibility = "visible";
    front.style.visibility = "hidden";
    const old = front;
    front = back;
    back = old;
    // Free the old document; the frame is the next layout's buffer.
    old.srcdoc = "";
    const doc = front.contentDocument;
    if (doc) {
      restoreFocus(doc, memo);
      paintPeers();
    }
  }

  // ── Peer carets ───────────────────────────────────────────────────────────

  function schedulePaint() {
    if (paintTimer !== undefined) return;
    paintTimer = setTimeout(() => {
      paintTimer = undefined;
      paintPeers();
    }, 0);
  }

  function paintPeers() {
    const doc = front?.contentDocument;
    const view = deps.view();
    if (!doc || !view) return;
    const layer = doc.querySelector<HTMLElement>("body > .fm-peer-layer");
    if (!layer) return;
    layer.replaceChildren();
    const p = presence;
    if (!p || !p.yText.doc) return;
    const win = doc.defaultView;
    if (!win) return;
    const cmDoc = view.state.doc;
    for (const [clientId, s] of p.awareness.getStates()) {
      if (clientId === p.awareness.clientID) continue;
      const state = s as {
        cursor?: { head?: unknown } | null;
        user?: { name?: string; color?: string } | null;
      };
      if (!state.cursor?.head || !state.user) continue;
      let pos: number | undefined;
      try {
        const abs = Y.createAbsolutePositionFromRelativePosition(
          Y.createRelativePositionFromJSON(state.cursor.head as Y.RelativePosition),
          p.yText.doc,
        );
        if (abs?.type === p.yText) pos = abs.index;
      } catch {
        continue;
      }
      if (pos === undefined || pos > cmDoc.length) continue;
      const line = cmDoc.lineAt(pos);
      const rel = line.number - 1;
      const col = pos - line.from;
      const anchor = Array.from(doc.querySelectorAll<HTMLElement>(`[data-line="${rel}"]`))
        .find((el) => !el.hasAttribute("data-split-from")) ??
        Array.from(doc.querySelectorAll<HTMLElement>(TEXT_ISLANDS))
          .filter((el) => !el.hasAttribute("data-split-from"))
          .reverse()
          .find((el) => Number(el.getAttribute("data-line")) <= rel);
      if (!anchor) continue;
      const island = /^(P|H[1-6]|LI)$/.test(anchor.tagName);
      const offset = island
        ? anchor.isContentEditable
          ? col
          : fastrStripInlineSyntax(line.text.slice(linePrefixLength(line.text), col)).length
        : 0;
      const walker = doc.createTreeWalker(anchor, NodeFilter.SHOW_TEXT);
      let node: Text | null = null;
      let at = 0;
      let remaining = offset;
      let last: Text | null = null;
      while ((node = walker.nextNode() as Text | null)) {
        if (!anchor.isContentEditable) {
          if (node.parentElement?.closest(".cm-fm-island-syntax") || node.data.trim().length === 0) continue;
        }
        last = node;
        if (remaining <= node.length) {
          at = remaining;
          break;
        }
        remaining -= node.length;
        node = null;
      }
      const range = doc.createRange();
      if (node) range.setStart(node, at);
      else if (last) range.setStart(last, last.length);
      else range.setStart(anchor, 0);
      range.collapse(true);
      let rect: DOMRect | undefined = range.getClientRects()[0];
      if (!rect || (rect.width === 0 && rect.height === 0)) {
        const r = anchor.getBoundingClientRect();
        rect = new DOMRect(r.left, r.top, 0, r.height);
      }
      const color = state.user.color ?? "#888888";
      const caret = doc.createElement("span");
      caret.className = "fm-peer-caret";
      caret.style.left = `${rect.left + win.scrollX}px`;
      caret.style.top = `${rect.top + win.scrollY}px`;
      caret.style.height = `${rect.height || 16}px`;
      caret.style.background = color;
      const flag = doc.createElement("span");
      flag.className = "fm-peer-caret__name";
      flag.style.background = color;
      flag.textContent = state.user.name ?? "";
      caret.append(flag);
      layer.append(caret);
    }
  }

  function setPresence(next: PresenceDeps | undefined) {
    presenceOff?.();
    presenceOff = undefined;
    presence = next;
    if (next) {
      const on = () => schedulePaint();
      next.awareness.on("change", on);
      presenceOff = () => next.awareness.off("change", on);
    }
    schedulePaint();
  }

  function setActive(on: boolean) {
    if (disposed || on === active) return;
    active = on;
    if (on) {
      front = makeFrame();
      back = makeFrame();
      schedule(0);
    } else {
      clearTimer();
      front?.remove();
      back?.remove();
      front = undefined;
      back = undefined;
      queued = false;
    }
  }

  return {
    setActive,
    schedule: () => schedule(DEBOUNCE_MS),
    refresh: () => schedule(0),
    setPresence,
    dispose: () => {
      disposed = true;
      setActive(false);
      presenceOff?.();
      if (paintTimer !== undefined) clearTimeout(paintTimer);
    },
  };
}
