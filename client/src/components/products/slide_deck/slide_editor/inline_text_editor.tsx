// Typing directly on the slide canvas.
//
// The canvas stays the only thing drawn: a hidden, focused CodeMirror holds the
// text (bound to the block's or title's Y.Text through yCollab, so merge,
// remote carets and the slide's shared undo stack all work unchanged), and this
// component paints the caret, selection and collaborators' carets on top of
// the canvas from text_geometry.ts. Every keystroke is mirrored into the
// editor's working slide (onText), which re-renders the canvas; the caret then
// follows the new geometry.
//
// Markdown body blocks are pure WYSIWYG: syntax is never shown. Typed text is
// escaped, deletions and bold/italic go through lib/slide_text_offsets.ts so
// formatting survives, and the caret only ever rests on rendered positions.
// Title fields are plain text, drawn by panther's plain text measurer.

import {
  analyzeSlideMarkdown,
  findNodeMap,
  findRootTextField,
  PAGE_WIDTH_DU,
  slideBackspace,
  slideDeleteForward,
  slideDeleteRange,
  slideInsertText,
  slideRangeHasStyle,
  type SlideEditResult,
  slideToggleStyle,
  slideWordAt,
  SRC_BREAK,
  SRC_VISIBLE,
  t3,
} from "lib";
import type { MeasuredPage } from "panther";
import { defaultKeymap } from "@codemirror/commands";
import { insertNewlineContinueMarkup, markdown } from "@codemirror/lang-markdown";
import { EditorSelection, EditorState, Prec } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { yCollab, yUndoManagerKeymap } from "y-codemirror.next";
import * as Y from "yjs";
import {
  createEffect,
  createMemo,
  createSignal,
  For,
  onCleanup,
  onMount,
  Show,
  untrack,
} from "solid-js";
import { Portal } from "solid-js/web";
import { yCaretHygiene } from "~/components/_shared/mod.ts";
import type { SlideSession } from "~/state/instance/collab";
import {
  buildBlockGeometry,
  buildTitleGeometry,
  type CaretBox,
  caretAt,
  type DuRect,
  lineEdgeOffset,
  offsetAt,
  selectionRects,
  stepOffset,
  type TextGeometry,
  verticalOffset,
} from "./text_geometry";

export type InlineEditTarget =
  | { kind: "block"; id: string }
  | { kind: "title"; field: string; primitiveId: string };

type Props = {
  target: InlineEditTarget;
  measured: MeasuredPage | undefined;
  /** DOM id of the slide canvas (page DU → screen px). */
  canvasId: string;
  session: SlideSession | null;
  collabReady: boolean;
  /** The text as the working slide has it: seeds the editor when collab is
   *  not live (no Y.Text to bind). */
  initialText: string;
  /** Where the double-click landed (page DU): the first caret goes there. */
  initialPoint?: { x: number; y: number };
  /** Mirror the text into the working slide so the canvas re-renders. */
  onText: (text: string) => void;
  onExit: () => void;
  /** A modal covers the canvas: hide everything painted over it. */
  covered: boolean;
  /** Start with the whole text selected (a just-added field's placeholder). */
  selectAll?: boolean;
  /** Receives the formatting commands and state, for the toolbar. */
  onApi?: (api: InlineTextApi | undefined) => void;
};

/** What the slide toolbar drives while text is being edited on the canvas. */
export type InlineTextApi = {
  isMarkdown: boolean;
  toggleStyle: (prop: "bold" | "italic") => void;
  toggleList: (ordered: boolean) => void;
  /** Bold/italic at the caret (or over the whole selection) and the list
   *  kind of the caret's line. */
  marks: () => { bold: boolean; italic: boolean; list?: "bullet" | "numbered" };
  focus: () => void;
};

/** Elements carrying this attribute (the slide toolbar) do not end editing
 *  when clicked. */
export const INLINE_EDIT_KEEP_ATTR = "data-inline-edit-keep";

type PeerMark = {
  key: string;
  name: string;
  color: string;
  colorLight: string;
  caret: CaretBox;
  rects: DuRect[];
};

const LIST_LINE = /^\s*([-*+]|\d+[.)])\s/;

const CARET_CSS =
  "@keyframes slide-inline-caret-blink{0%,55%{opacity:1}56%,100%{opacity:0}}" +
  ".slide-inline-caret{animation:slide-inline-caret-blink 1.1s step-end infinite}";

export function InlineTextEditor(p: Props) {
  const isMarkdown = p.target.kind === "block";
  let view: EditorView | undefined;
  let host!: HTMLDivElement;
  let yText: Y.Text | undefined;

  const [docText, setDocText] = createSignal(p.initialText);
  const [sel, setSel] = createSignal({ anchor: 0, head: 0 });
  const [focused, setFocused] = createSignal(false);
  const [blinkKey, setBlinkKey] = createSignal(0);
  const [tick, setTick] = createSignal(0);
  const [peers, setPeers] = createSignal<PeerMark[]>([]);
  // The typing state: what Bold/Italic toggled with nothing selected, which
  // the next typed text takes instead of the style it would inherit (bold
  // off at the end of a bold word). Cleared when the caret moves on its own.
  const [pending, setPending] = createSignal<{ bold?: boolean; italic?: boolean }>({});
  // Up/down keep the column they started from.
  let goalX: number | undefined;

  // The newest geometry, and the newest one that matches the doc: while the
  // canvas catches up with a keystroke, the caret stays where it was drawn
  // rather than jumping through a stale layout.
  const geometry = createMemo<TextGeometry | undefined>(() => {
    const m = p.measured;
    if (!m) return undefined;
    const t = p.target;
    return t.kind === "block"
      ? buildBlockGeometry(m, t.id)
      : buildTitleGeometry(m, t.primitiveId, docText());
  });
  const [liveGeom, setLiveGeom] = createSignal<TextGeometry>();
  createEffect(() => {
    const g = geometry();
    const text = docText();
    if (g && g.inSync && (g.kind === "plain" || g.source === text)) {
      setLiveGeom(g);
    } else if (!g && text === "") {
      // An emptied title draws nothing (no primitive): keep a caret where
      // its text began.
      const last = untrack(liveGeom);
      if (last) {
        setLiveGeom({ ...last, source: "", stops: [], boxes: [], lines: [] });
      }
    }
  });

  function analysis() {
    const g = liveGeom();
    return g?.analysis && g.source === docText()
      ? g.analysis
      : analyzeSlideMarkdown(docText());
  }

  const marks = createMemo(() => {
    const s = sel();
    const text = docText();
    if (!isMarkdown) return { bold: false, italic: false };
    const an = analysis();
    const from = Math.min(s.anchor, s.head);
    const to = Math.max(s.anchor, s.head);
    let bold: boolean;
    let italic: boolean;
    if (from !== to) {
      bold = slideRangeHasStyle(an, from, to, "bold");
      italic = slideRangeHasStyle(an, from, to, "italic");
    } else {
      // The char the caret follows: what typing here continues.
      let i = from - 1;
      while (i >= 0 && an.kind[i] !== SRC_VISIBLE && text[i] !== "\n") i--;
      const st = i >= 0 && an.kind[i] === SRC_VISIBLE ? an.srcStyle[i] : undefined;
      const pd = pending();
      bold = pd.bold ?? !!st?.bold;
      italic = pd.italic ?? !!st?.italic;
    }
    const lineStart = text.lastIndexOf("\n", s.head - 1) + 1;
    const line = text.slice(lineStart, text.indexOf("\n", s.head) < 0 ? text.length : text.indexOf("\n", s.head));
    const m = /^\s*([-*+]|\d+[.)])\s/.exec(line);
    return {
      bold,
      italic,
      list: m ? (/\d/.test(m[1]) ? "numbered" as const : "bullet" as const) : undefined,
    };
  });

  // ── Screen mapping ─────────────────────────────────────────────────────────

  function canvasRect(): DOMRect | undefined {
    tick();
    const c = document.getElementById(p.canvasId);
    const r = c?.getBoundingClientRect();
    return r && r.width > 0 ? r : undefined;
  }
  function toPx(r: DOMRect, x: number, y: number) {
    const s = r.width / PAGE_WIDTH_DU;
    return { x: r.left + x * s, y: r.top + y * s, s };
  }
  function toDu(clientX: number, clientY: number) {
    const r = canvasRect();
    if (!r) return undefined;
    const s = r.width / PAGE_WIDTH_DU;
    return { x: (clientX - r.left) / s, y: (clientY - r.top) / s };
  }

  // ── Editor ────────────────────────────────────────────────────────────────

  function dispatchEdit(r: SlideEditResult | undefined): boolean {
    if (!view || !r) return false;
    view.dispatch({
      changes: r.changes,
      selection: EditorSelection.single(r.anchor, r.head),
      userEvent: "input",
      scrollIntoView: false,
    });
    goalX = undefined;
    return true;
  }

  function setSelection(anchor: number, head: number) {
    if (!view) return;
    const len = view.state.doc.length;
    view.dispatch({
      selection: EditorSelection.single(
        Math.max(0, Math.min(len, anchor)),
        Math.max(0, Math.min(len, head)),
      ),
      userEvent: "select",
      scrollIntoView: false,
    });
  }

  // Visible chars in source order, for word-wise moves and copy.
  function visibleChars(): { src: number; ch: string }[] {
    const g = liveGeom();
    if (isMarkdown) {
      const an = analysis();
      const out: { src: number; ch: string }[] = [];
      for (let i = 0; i < an.kind.length; i++) {
        if (an.kind[i] === SRC_VISIBLE) out.push({ src: i, ch: an.srcChar[i] ?? an.src[i] });
        else if (an.kind[i] === SRC_BREAK && an.src[i] === "\n") out.push({ src: i, ch: "\n" });
      }
      return out;
    }
    const text = docText();
    return (g?.boxes ?? [])
      .map((b) => ({ src: b.from, ch: text[b.from] ?? " " }))
      .sort((a, b) => a.src - b.src);
  }

  function wordStep(head: number, dir: -1 | 1): number {
    const chars = visibleChars();
    const ws = (c: string) => /\s/.test(c);
    if (dir < 0) {
      let i = chars.length - 1;
      while (i >= 0 && chars[i].src >= head) i--;
      while (i >= 0 && ws(chars[i].ch)) i--;
      while (i > 0 && !ws(chars[i - 1].ch)) i--;
      return i >= 0 ? chars[i].src : 0;
    }
    let i = 0;
    while (i < chars.length && chars[i].src < head) i++;
    while (i < chars.length && !ws(chars[i].ch)) i++;
    while (i < chars.length && ws(chars[i].ch)) i++;
    return i < chars.length ? chars[i].src : (view?.state.doc.length ?? head);
  }

  function renderedText(from: number, to: number): string {
    return visibleChars()
      .filter((c) => c.src >= from && c.src < to)
      .map((c) => c.ch)
      .join("");
  }

  function move(fn: (g: TextGeometry, head: number) => number, extend: boolean): boolean {
    const g = liveGeom();
    if (!view || !g) return true;
    const s = view.state.selection.main;
    const head = fn(g, s.head);
    setSelection(extend ? s.anchor : head, head);
    return true;
  }

  function horizontal(dir: -1 | 1, extend: boolean): boolean {
    goalX = undefined;
    const s = view?.state.selection.main;
    if (s && !extend && !s.empty) {
      setSelection(dir < 0 ? s.from : s.to, dir < 0 ? s.from : s.to);
      return true;
    }
    return move((g, head) => stepOffset(g, head, dir), extend);
  }

  function vertical(dir: -1 | 1, extend: boolean): boolean {
    return move((g, head) => {
      goalX ??= caretAt(g, head).x;
      return verticalOffset(g, head, dir, goalX);
    }, extend);
  }

  function deleteSelectionIfAny(): boolean {
    const s = view?.state.selection.main;
    if (!view || !s || s.empty) return false;
    if (isMarkdown) {
      dispatchEdit(slideDeleteRange(analysis(), s.from, s.to));
    } else {
      view.dispatch({ changes: { from: s.from, to: s.to, insert: "" }, userEvent: "delete" });
    }
    return true;
  }

  // Insert typed/pasted text at the caret. Markdown goes through
  // slideInsertText: escaped, styled like the text it joins, and placed where
  // it renders that way (never inside delimiters it would break).
  function insertText(text: string, userEvent: string, want = pending()) {
    if (!view) return;
    const at = view.state.selection.main.head;
    if (!isMarkdown) {
      view.dispatch({
        changes: { from: at, insert: text },
        selection: EditorSelection.cursor(at + text.length),
        userEvent,
        scrollIntoView: false,
      });
      return;
    }
    const r = slideInsertText(
      analysis(),
      at,
      text,
      want.bold === undefined && want.italic === undefined ? undefined : want,
    );
    view.dispatch({
      changes: r.changes,
      selection: EditorSelection.single(r.anchor, r.head),
      userEvent,
      scrollIntoView: false,
    });
    goalX = undefined;
  }

  // Like a word processor: a selection is restyled; a caret INSIDE a word
  // restyles that word; a caret at a word's edge (the end of what was just
  // typed) or on nothing sets what typing does next.
  function toggle(prop: "bold" | "italic"): boolean {
    if (!view || !isMarkdown) return true;
    const an = analysis();
    const s = view.state.selection.main;
    if (s.empty) {
      const word = slideWordAt(an, s.head);
      const inside = word !== undefined && s.head > word.from && s.head < word.to;
      if (!inside) {
        setPending({ ...pending(), [prop]: !marks()[prop] });
        return true;
      }
      dispatchEdit(slideToggleStyle(an, word.from, word.to, prop));
      return true;
    }
    setPending({});
    dispatchEdit(slideToggleStyle(an, s.from, s.to, prop));
    return true;
  }

  function toggleList(ordered: boolean): boolean {
    if (!view || !isMarkdown) return true;
    const state = view.state;
    const s = state.selection.main;
    const first = state.doc.lineAt(s.from).number;
    const last = state.doc.lineAt(s.to).number;
    const changes: { from: number; to: number; insert: string }[] = [];
    const lines = [];
    for (let n = first; n <= last; n++) lines.push(state.doc.line(n));
    const marker = ordered ? /^(\s*)\d+[.)]\s+/ : /^(\s*)[-*+]\s+/;
    const allOn = lines.every((l) => marker.test(l.text) || !l.text.trim());
    let k = 1;
    for (const l of lines) {
      if (!l.text.trim()) continue;
      const any = /^(\s*)([-*+]|\d+[.)])\s+/.exec(l.text);
      if (allOn) {
        if (any) changes.push({ from: l.from + any[1].length, to: l.from + any[0].length, insert: "" });
      } else {
        const ins = ordered ? `${k++}. ` : "- ";
        if (any) {
          changes.push({ from: l.from + any[1].length, to: l.from + any[0].length, insert: ins });
        } else {
          const lead = /^\s*/.exec(l.text)![0].length;
          changes.push({ from: l.from + lead, to: l.from + lead, insert: ins });
        }
      }
    }
    if (changes.length) {
      view.dispatch({ changes, userEvent: "input", scrollIntoView: false });
    }
    return true;
  }

  function enter(): boolean {
    if (!view) return true;
    if (!isMarkdown) {
      p.onExit();
      return true;
    }
    deleteSelectionIfAny();
    const s = view.state.selection.main;
    const line = view.state.doc.lineAt(s.head);
    if (LIST_LINE.test(line.text) && insertNewlineContinueMarkup(view)) return true;
    insertText("\n", "input");
    return true;
  }

  function indentList(out: boolean): boolean {
    if (!view || !isMarkdown) return true;
    const line = view.state.doc.lineAt(view.state.selection.main.head);
    if (!LIST_LINE.test(line.text)) return true;
    if (out) {
      const lead = /^ {1,2}/.exec(line.text);
      if (lead) {
        view.dispatch({ changes: { from: line.from, to: line.from + lead[0].length }, userEvent: "input" });
      }
    } else {
      view.dispatch({ changes: { from: line.from, insert: "  " }, userEvent: "input" });
    }
    return true;
  }

  const keys = [
    { key: "ArrowLeft", run: () => horizontal(-1, false), shift: () => horizontal(-1, true) },
    { key: "ArrowRight", run: () => horizontal(1, false), shift: () => horizontal(1, true) },
    { key: "ArrowUp", run: () => vertical(-1, false), shift: () => vertical(-1, true) },
    { key: "ArrowDown", run: () => vertical(1, false), shift: () => vertical(1, true) },
    {
      key: "Home",
      run: () => move((g, h) => lineEdgeOffset(g, h, false), false),
      shift: () => move((g, h) => lineEdgeOffset(g, h, false), true),
    },
    {
      key: "End",
      run: () => move((g, h) => lineEdgeOffset(g, h, true), false),
      shift: () => move((g, h) => lineEdgeOffset(g, h, true), true),
    },
    {
      key: "Mod-ArrowLeft",
      run: () => move((_g, h) => wordStep(h, -1), false),
      shift: () => move((_g, h) => wordStep(h, -1), true),
    },
    {
      key: "Mod-ArrowRight",
      run: () => move((_g, h) => wordStep(h, 1), false),
      shift: () => move((_g, h) => wordStep(h, 1), true),
    },
    {
      key: "Backspace",
      run: () => {
        if (!isMarkdown) return false;
        if (deleteSelectionIfAny()) return true;
        const r = slideBackspace(analysis(), view!.state.selection.main.head);
        return r ? dispatchEdit(r) : false;
      },
    },
    {
      key: "Delete",
      run: () => {
        if (!isMarkdown) return false;
        if (deleteSelectionIfAny()) return true;
        const r = slideDeleteForward(analysis(), view!.state.selection.main.head);
        return r ? dispatchEdit(r) : false;
      },
    },
    {
      key: "Mod-Backspace",
      run: () => {
        if (!isMarkdown) return false;
        if (deleteSelectionIfAny()) return true;
        const head = view!.state.selection.main.head;
        return dispatchEdit(slideDeleteRange(analysis(), wordStep(head, -1), head));
      },
    },
    { key: "Enter", run: enter },
    {
      key: "Shift-Enter",
      run: () => {
        if (!view) return true;
        deleteSelectionIfAny();
        insertText("\n", "input");
        return true;
      },
    },
    { key: "Tab", run: () => indentList(false) },
    { key: "Shift-Tab", run: () => indentList(true) },
    { key: "Mod-b", run: () => toggle("bold") },
    { key: "Mod-i", run: () => toggle("italic") },
    {
      key: "Mod-a",
      run: () => {
        setSelection(0, view?.state.doc.length ?? 0);
        return true;
      },
    },
    {
      key: "Escape",
      run: () => {
        p.onExit();
        return true;
      },
    },
  ];

  onMount(() => {
    const session = p.session;
    if (p.collabReady && session) {
      const t = p.target;
      if (t.kind === "block") {
        const m = findNodeMap(session.doc, t.id);
        if (m && m.get("blockType") === "text") {
          yText = m.get("markdown") as Y.Text | undefined;
        }
      } else {
        yText = findRootTextField(session.doc, t.field) ?? undefined;
      }
    }
    const initial = yText ? yText.toString() : p.initialText;
    setDocText(initial);

    view = new EditorView({
      parent: host,
      state: EditorState.create({
        doc: initial,
        extensions: [
          Prec.highest(keymap.of(keys)),
          keymap.of([...yUndoManagerKeymap, ...defaultKeymap]),
          ...(isMarkdown ? [markdown()] : []),
          ...(yText && session
            ? [
              yCollab(yText, session.awareness, { undoManager: session.undoManager }),
              yCaretHygiene(yText, session.awareness),
            ]
            : []),
          EditorView.inputHandler.of((v, from, to, text) => {
            // A second space in a row would never be drawn (panther
            // collapses whitespace runs): keep the one rather than add
            // invisible text.
            if (text === " " && from === to && v.state.doc.sliceString(from - 1, from) === " ") {
              return true;
            }
            if (!isMarkdown) return false;
            // The typing state, before any caret repair below clears it.
            const want = pending();
            // Typing over a selection keeps the formatting around it.
            if (from !== to) {
              const r = slideDeleteRange(analysis(), from, to);
              v.dispatch({
                changes: r.changes,
                selection: EditorSelection.cursor(r.anchor),
                userEvent: "delete",
                scrollIntoView: false,
              });
            } else if (v.state.selection.main.head !== from) {
              v.dispatch({ selection: EditorSelection.cursor(from) });
            }
            insertText(text, "input.type", want);
            return true;
          }),
          EditorView.domEventHandlers({
            copy: (e) => clip(e, false),
            cut: (e) => clip(e, true),
            paste: (e) => {
              const text = e.clipboardData?.getData("text/plain");
              if (!view || text == null) return false;
              e.preventDefault();
              deleteSelectionIfAny();
              insertText(text, "input.paste");
              return true;
            },
            focus: () => {
              setFocused(true);
              return false;
            },
            blur: () => {
              setFocused(false);
              return false;
            },
          }),
          EditorView.updateListener.of((u) => {
            if (u.docChanged) {
              const text = u.state.doc.toString();
              setDocText(text);
              p.onText(text);
            }
            if (u.selectionSet || u.docChanged) {
              const m = u.state.selection.main;
              setSel({ anchor: m.anchor, head: m.head });
              setBlinkKey((k) => k + 1);
            }
            // A caret that moved on its own (click, arrows) leaves the
            // typing state behind; typing carries it along.
            if (u.selectionSet && !u.docChanged) setPending({});
          }),
        ],
      }),
    });

    // First caret: where the double-click landed, else the end.
    const g = liveGeom();
    const at = g && p.initialPoint
      ? offsetAt(g, p.initialPoint.x, p.initialPoint.y)
      : initial.length;
    view.dispatch({
      selection: p.selectAll
        ? EditorSelection.single(0, initial.length)
        : EditorSelection.cursor(Math.min(at, initial.length)),
    });
    view.focus();

    p.onApi?.({
      isMarkdown,
      toggleStyle: (prop) => {
        toggle(prop);
        view?.focus();
      },
      toggleList: (ordered) => {
        toggleList(ordered);
        view?.focus();
      },
      marks,
      focus: () => view?.focus(),
    });

    const onMove = () => setTick((t) => t + 1);
    window.addEventListener("resize", onMove);
    window.addEventListener("scroll", onMove, true);
    document.addEventListener("pointerdown", onOutside, true);
    let detachPeers: (() => void) | undefined;
    if (yText && session) {
      const aw = session.awareness;
      const refresh = () => setPeers(readPeers());
      aw.on("change", refresh);
      yText.observe(refresh);
      detachPeers = () => {
        aw.off("change", refresh);
        yText?.unobserve(refresh);
      };
    }
    onCleanup(() => {
      window.removeEventListener("resize", onMove);
      window.removeEventListener("scroll", onMove, true);
      document.removeEventListener("pointerdown", onOutside, true);
      detachPeers?.();
      p.onApi?.(undefined);
      view?.destroy();
      view = undefined;
    });
  });

  function clip(e: ClipboardEvent, cut: boolean): boolean {
    const s = view?.state.selection.main;
    if (!view || !s || s.empty || !e.clipboardData) return false;
    e.preventDefault();
    e.clipboardData.setData(
      "text/plain",
      isMarkdown ? renderedText(s.from, s.to) : view.state.sliceDoc(s.from, s.to),
    );
    if (cut) deleteSelectionIfAny();
    return true;
  }

  let captureEl: HTMLDivElement | undefined;
  function onOutside(e: PointerEvent) {
    const t = e.target as Node | null;
    if (!t) return;
    if (captureEl?.contains(t) || host.contains(t)) return;
    // The toolbar (and its popovers) acts on this editor: not "outside".
    if ((t as Element).closest?.(`[${INLINE_EDIT_KEEP_ATTR}]`)) return;
    p.onExit();
  }

  // ── Pointer ───────────────────────────────────────────────────────────────

  let dragAnchor: number | undefined;
  let dragRange: { from: number; to: number } | undefined;

  function rangeForClick(g: TextGeometry, at: number, detail: number) {
    if (detail === 2 && isMarkdown) {
      return slideWordAt(analysis(), at) ?? { from: at, to: at };
    }
    if (detail === 2) {
      const text = docText();
      let a = at;
      let b = at;
      while (a > 0 && !/\s/.test(text[a - 1])) a--;
      while (b < text.length && !/\s/.test(text[b])) b++;
      return { from: a, to: b };
    }
    if (detail >= 3) {
      // The whole paragraph / list item / title under the pointer.
      if (isMarkdown) {
        const an = analysis();
        for (const u of an.units) {
          const srcs = u.toSrc.filter((s) => s >= 0);
          if (!srcs.length) continue;
          const lo = Math.min(...srcs);
          const hi = Math.max(...srcs) + 1;
          if (at >= lo && at <= hi) return { from: lo, to: hi };
        }
      }
      return { from: 0, to: g.source.length };
    }
    return { from: at, to: at };
  }

  function onPointerDown(e: PointerEvent) {
    if (e.button !== 0) return;
    const g = liveGeom();
    const du = toDu(e.clientX, e.clientY);
    if (!g || !du || !view) return;
    e.preventDefault();
    e.stopPropagation();
    view.focus();
    goalX = undefined;
    const at = offsetAt(g, du.x, du.y);
    if (e.shiftKey) {
      setSelection(view.state.selection.main.anchor, at);
      dragAnchor = view.state.selection.main.anchor;
      dragRange = undefined;
    } else {
      const r = rangeForClick(g, at, e.detail);
      setSelection(r.from, r.to);
      dragAnchor = r.from;
      dragRange = r.from !== r.to ? r : undefined;
    }
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: PointerEvent) {
    if (dragAnchor === undefined) return;
    const g = liveGeom();
    const du = toDu(e.clientX, e.clientY);
    if (!g || !du) return;
    const at = offsetAt(g, du.x, du.y);
    if (dragRange) {
      // Word/paragraph drag: extend by whole units.
      if (at < dragRange.from) setSelection(dragRange.to, at);
      else setSelection(dragRange.from, Math.max(at, dragRange.to));
      return;
    }
    setSelection(dragAnchor, at);
  }

  function onPointerUp(e: PointerEvent) {
    dragAnchor = undefined;
    dragRange = undefined;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      // Already released.
    }
  }

  // ── Collaborators ─────────────────────────────────────────────────────────

  function readPeers(): PeerMark[] {
    const session = p.session;
    const g = liveGeom();
    if (!session || !yText || !yText.doc || !g) return [];
    const aw = session.awareness;
    const me = aw.getLocalState()?.user as { email?: string } | undefined;
    const out: PeerMark[] = [];
    aw.getStates().forEach((state, clientId) => {
      if (clientId === aw.clientID) return;
      const user = state.user as
        | { name?: string; color?: string; colorLight?: string; email?: string }
        | undefined;
      if (!user || (me?.email && user.email === me.email)) return;
      const cur = state.cursor as { anchor?: unknown; head?: unknown } | null | undefined;
      if (!cur?.anchor || !cur.head) return;
      const abs = (rel: unknown) => {
        try {
          const a = Y.createAbsolutePositionFromRelativePosition(
            Y.createRelativePositionFromJSON(rel as Y.RelativePosition),
            yText!.doc!,
          );
          return a && a.type === yText ? a.index : undefined;
        } catch {
          return undefined;
        }
      };
      const a = abs(cur.anchor);
      const h = abs(cur.head);
      if (a === undefined || h === undefined) return;
      out.push({
        key: String(clientId),
        name: user.name ?? "",
        color: user.color ?? "#888",
        colorLight: user.colorLight ?? "#8883",
        caret: caretAt(g, h),
        rects: a === h ? [] : selectionRects(g, Math.min(a, h), Math.max(a, h)),
      });
    });
    return out;
  }
  createEffect(() => {
    liveGeom();
    setPeers(readPeers());
  });

  // ── Paint ─────────────────────────────────────────────────────────────────

  const paint = createMemo(() => {
    const r = canvasRect();
    const g = liveGeom();
    if (!r || !g || p.covered) return undefined;
    const s = sel();
    const px = (x: number, y: number) => toPx(r, x, y);
    const b = px(g.bounds.x, g.bounds.y);
    const caret = caretAt(g, s.head);
    const c = px(caret.x, caret.top);
    return {
      bounds: { left: b.x, top: b.y, width: g.bounds.w * b.s, height: g.bounds.h * b.s },
      caret: {
        left: c.x,
        top: c.y,
        height: Math.max(8, (caret.bottom - caret.top) * c.s),
      },
      rects: s.anchor === s.head
        ? []
        : selectionRects(g, Math.min(s.anchor, s.head), Math.max(s.anchor, s.head)).map((q) => {
          const o = px(q.x, q.y);
          return { left: o.x, top: o.y, width: q.w * o.s, height: q.h * o.s };
        }),
      editable: g.editable,
      scale: b.s,
    };
  });

  // Keep the hidden editor under the caret so IME candidate windows open there.
  createEffect(() => {
    const pt = paint();
    if (!pt || !host) return;
    host.style.left = `${pt.caret.left}px`;
    host.style.top = `${pt.caret.top}px`;
  });

  // A block this editor cannot address (a table, a code fence) goes back to
  // the side panel rather than half-working.
  createEffect(() => {
    const g = geometry();
    if (g && g.inSync && !g.editable) p.onExit();
  });

  const peerPaint = createMemo(() => {
    const r = canvasRect();
    if (!r || p.covered) return [];
    return peers().map((peer) => {
      const c = toPx(r, peer.caret.x, peer.caret.top);
      return {
        ...peer,
        left: c.x,
        top: c.y,
        height: Math.max(8, (peer.caret.bottom - peer.caret.top) * c.s),
        boxes: peer.rects.map((q) => {
          const o = toPx(r, q.x, q.y);
          return { left: o.x, top: o.y, width: q.w * o.s, height: q.h * o.s };
        }),
      };
    });
  });

  return (
    <Portal mount={document.body}>
      <style>{CARET_CSS}</style>
      {/* The hidden editor: focused, invisible, parked under the caret. */}
      <div
        ref={host}
        aria-label={t3({ en: "Slide text", fr: "Texte de la diapositive", pt: "Texto do diapositivo" })}
        style={{
          position: "fixed",
          width: "1px",
          height: "1px",
          overflow: "hidden",
          opacity: "0",
          "pointer-events": "none",
          "z-index": "81",
        }}
      />
      <Show when={paint()}>
        {(pt) => (
          <div class="pointer-events-none fixed inset-0 z-[82]">
            <For each={pt().rects}>
              {(q) => (
                <div
                  class="absolute"
                  style={{
                    left: `${q.left}px`,
                    top: `${q.top}px`,
                    width: `${q.width}px`,
                    height: `${q.height}px`,
                    "background-color": "rgba(0, 112, 243, 0.28)",
                  }}
                />
              )}
            </For>
            <For each={peerPaint()}>
              {(peer) => (
                <>
                  <For each={peer.boxes}>
                    {(q) => (
                      <div
                        class="absolute"
                        style={{
                          left: `${q.left}px`,
                          top: `${q.top}px`,
                          width: `${q.width}px`,
                          height: `${q.height}px`,
                          "background-color": peer.colorLight,
                        }}
                      />
                    )}
                  </For>
                  <div
                    class="absolute"
                    style={{
                      left: `${peer.left - 1}px`,
                      top: `${peer.top}px`,
                      width: "2px",
                      height: `${peer.height}px`,
                      "background-color": peer.color,
                    }}
                  >
                    <div
                      class="font-700 absolute -top-[16px] left-0 rounded px-1 text-[10px] whitespace-nowrap text-white"
                      style={{ "background-color": peer.color }}
                    >
                      {peer.name}
                    </div>
                  </div>
                </>
              )}
            </For>
            <Show when={focused() && pt().rects.length === 0}>
              {/* Keyed on blinkKey so every move restarts the blink visible. */}
              <For each={[blinkKey()]}>
                {() => (
                  <div
                    class="slide-inline-caret absolute"
                    style={{
                      left: `${pt().caret.left - 1}px`,
                      top: `${pt().caret.top}px`,
                      width: "2px",
                      height: `${pt().caret.height}px`,
                      "background-color": "#111",
                      "box-shadow": "0 0 0 1px rgba(255,255,255,0.7)",
                    }}
                  />
                )}
              </For>
            </Show>
            {/* Pointer capture over the block: caret placement and drag. */}
            <div
              ref={captureEl}
              class="pointer-events-auto absolute cursor-text"
              style={{
                left: `${pt().bounds.left - 4}px`,
                top: `${pt().bounds.top - 4}px`,
                width: `${pt().bounds.width + 8}px`,
                height: `${pt().bounds.height + 8}px`,
                outline: "2px dashed rgba(0, 112, 243, 0.7)",
                "outline-offset": "0px",
              }}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onDblClick={(e) => e.stopPropagation()}
              onContextMenu={(e) => e.stopPropagation()}
            />
          </div>
        )}
      </Show>
    </Portal>
  );
}
