import { minimalSetup } from "codemirror";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { markdown } from "@codemirror/lang-markdown";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags } from "@lezer/highlight";
import { yCollab, yUndoManagerKeymap } from "y-codemirror.next";
import type { Awareness } from "y-protocols/awareness";
import type * as Y from "yjs";
import { createEffect, onCleanup } from "solid-js";
import { darkMode } from "~/state/t4_ui";

// A CodeMirror markdown/plain editor bound directly to a Y.Text via
// y-codemirror.next. It renders remote collaborators' carets and selections
// (from Yjs awareness) and preserves the local caret through remote edits —
// things a plain <textarea> can't do. Shared by the slide editor (text-block
// body + title/header fields) and the visualization editor (caption fields);
// the caller supplies `canEdit` (each surface has its own configure permission),
// so this component is decoupled from any one project-state permission.

// ── Selection hover name flag ────────────────────────────────────────────────
// yCollab names a peer when you hover their CARET (its own CSS hover on
// .cm-ySelectionCaret), but a selection HIGHLIGHT is a separate mark
// decoration with no name element — hovering it named nobody. This helper
// watches mousemoves over an editor, resolves a hovered .cm-ySelection span
// back to its owner by matching the span's background color to the awareness
// users (the highlight is the user's translucent colorLight — same RGB as
// their identity color, alpha aside), and floats a caret-style name flag
// above it. One shared flag element serves every editor (there is one mouse).

let hoverFlagEl: HTMLDivElement | null = null;
function hoverFlag(): HTMLDivElement {
  if (!hoverFlagEl) {
    hoverFlagEl = document.createElement("div");
    hoverFlagEl.style.cssText =
      "position:fixed;z-index:95;padding:1px 6px;border-radius:4px;" +
      "font-size:11px;font-weight:600;color:#fff;pointer-events:none;" +
      "white-space:nowrap;display:none;";
    document.body.appendChild(hoverFlagEl);
  }
  return hoverFlagEl;
}
function hideHoverFlag(): void {
  if (hoverFlagEl) {
    hoverFlagEl.style.display = "none";
  }
}

function rgbOfHex(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6})/i.exec(hex.trim());
  if (!m) {
    return null;
  }
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// Forgiveness around each highlight rect — hovering NEAR the highlight (line
// padding, the gap between wrapped segments) still counts.
const HOVER_SLACK_PX = 8;

/** Attach the selection-hover name flag to a CodeMirror editor DOM. Returns
 *  the detach function.
 *
 *  Detection is GEOMETRIC, not DOM hit-testing: a selection renders as many
 *  thin inline spans (one or more client rects each — wrapped lines split),
 *  and the pointer target between lines or in padding is the line element,
 *  not the span. Checking the mouse against every span's client rects (with
 *  slack) makes the whole highlighted region — every line of a multi-line
 *  selection — a reliable hover target. rAF-throttled; selections on screen
 *  are few. */
export function attachSelectionNameHover(
  dom: HTMLElement,
  awareness: Awareness,
): () => void {
  let raf: number | undefined;

  function resolve(x: number, y: number) {
    let hitSpan: HTMLElement | null = null;
    let hitRect: DOMRect | null = null;
    // Two decoration kinds per multi-line selection: .cm-ySelection text
    // marks on the (partial) first/last lines, .cm-yLineSelection LINE
    // decorations on fully-covered middle lines — both carry the owner's
    // colorLight background.
    for (
      const span of dom.querySelectorAll<HTMLElement>(
        ".cm-ySelection, .cm-yLineSelection",
      )
    ) {
      for (const r of span.getClientRects()) {
        if (
          x >= r.left - HOVER_SLACK_PX && x <= r.right + HOVER_SLACK_PX &&
          y >= r.top - HOVER_SLACK_PX && y <= r.bottom + HOVER_SLACK_PX
        ) {
          hitSpan = span;
          hitRect = r;
          break;
        }
      }
      if (hitSpan) {
        break;
      }
    }
    if (!hitSpan || !hitRect) {
      return hideHoverFlag();
    }

    const bg = getComputedStyle(hitSpan).backgroundColor;
    const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(bg);
    if (!m) {
      return hideHoverFlag();
    }
    const r = Number(m[1]);
    const g = Number(m[2]);
    const b = Number(m[3]);
    // yCollab's caret already names its owner while hovered (its own CSS shows
    // .cm-ySelectionInfo on .cm-ySelectionCaret:hover). The caret sits at one
    // end of the selection, so hovering there would show BOTH flags — suppress
    // ours when the hovered caret is the same user's (caret background = their
    // full-opacity identity color; the highlight is the same RGB, alpha aside).
    for (
      const caret of dom.querySelectorAll<HTMLElement>(".cm-ySelectionCaret")
    ) {
      if (!caret.matches(":hover")) {
        continue;
      }
      const cm = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(
        getComputedStyle(caret).backgroundColor,
      );
      if (
        cm && Number(cm[1]) === r && Number(cm[2]) === g && Number(cm[3]) === b
      ) {
        return hideHoverFlag();
      }
    }
    const names: string[] = [];
    let flagColor = "";
    for (const [clientID, state] of awareness.getStates()) {
      if (clientID === awareness.clientID) {
        continue;
      }
      const user = state.user as { name?: string; color?: string } | undefined;
      if (!user?.name || !user.color) {
        continue;
      }
      const rgb = rgbOfHex(user.color);
      if (
        rgb && rgb[0] === r && rgb[1] === g && rgb[2] === b &&
        !names.includes(user.name)
      ) {
        names.push(user.name);
        if (!flagColor) {
          flagColor = user.color;
        }
      }
    }
    if (names.length === 0) {
      return hideHoverFlag();
    }
    const el = hoverFlag();
    el.textContent = names.join(", ");
    el.style.backgroundColor = flagColor;
    el.style.left = `${Math.round(x)}px`;
    el.style.top = `${Math.round(hitRect.top - 22)}px`;
    el.style.display = "block";
  }

  // TRAILING throttle: always evaluate the LATEST coords. A guard that drops
  // newer events would evaluate stale positions (flicker while moving) and
  // could miss the final resting position entirely (stopping on a highlight
  // showing nothing).
  let lastX = 0;
  let lastY = 0;
  let hasPos = false;
  function schedule() {
    if (raf !== undefined) {
      return;
    }
    raf = requestAnimationFrame(() => {
      raf = undefined;
      resolve(lastX, lastY);
    });
  }
  function onMove(e: MouseEvent) {
    lastX = e.clientX;
    lastY = e.clientY;
    hasPos = true;
    schedule();
  }
  function onLeave() {
    hasPos = false;
    hideHoverFlag();
  }
  // Awareness changes constantly while peers are active (their live cursor
  // rides this same instance at up to ~20 msg/s) — NEVER blind-hide on it,
  // or the flag flickers and a stationary mouse loses it for good. Instead
  // RE-EVALUATE at the last known position: still over a highlight → flag
  // stays rock steady; the selection actually vanished → it hides.
  const onAwarenessChange = () => {
    if (hasPos) {
      schedule();
    } else {
      hideHoverFlag();
    }
  };
  dom.addEventListener("mousemove", onMove, { passive: true });
  dom.addEventListener("mouseleave", onLeave);
  awareness.on("change", onAwarenessChange);
  return () => {
    dom.removeEventListener("mousemove", onMove);
    dom.removeEventListener("mouseleave", onLeave);
    awareness.off("change", onAwarenessChange);
    if (raf !== undefined) {
      cancelAnimationFrame(raf);
    }
    hideHoverFlag();
  };
}

// The setups bundle defaultHighlightStyle as a FALLBACK highlighter, and its
// markdown token colors assume a light background — the #/-/*/> marks come out
// near-black and vanish on dark bases. In dark mode we add this non-fallback
// highlighter (which then fully replaces the default one; uncovered tags
// inherit the editor's text color). CSS vars keep it in sync with app.css.
const darkMarkdownHighlight = HighlightStyle.define([
  {
    tag: [
      tags.processingInstruction,
      tags.meta,
      tags.punctuation,
      tags.labelName,
      tags.string,
      tags.contentSeparator,
      tags.quote,
    ],
    color: "var(--color-neutral)",
  },
  { tag: tags.heading, fontWeight: "bold" },
  { tag: [tags.link, tags.url], color: "var(--color-primary)" },
  { tag: tags.emphasis, fontStyle: "italic" },
  { tag: tags.strong, fontWeight: "bold" },
  { tag: tags.strikethrough, textDecoration: "line-through" },
]);

// Reads the darkMode signal — call inside a tracked scope (the effect that
// builds the EditorView) so a theme toggle rebuilds the editor.
export function darkMarkdownExtensions() {
  return darkMode() ? [syntaxHighlighting(darkMarkdownHighlight)] : [];
}

function buildExtensions(
  yText: Y.Text,
  awareness: Awareness,
  height: string,
  plain: boolean,
  canEdit: boolean,
) {
  return [
    // yCollab's per-user undo takes precedence over the base keymap.
    keymap.of([...yUndoManagerKeymap]),
    minimalSetup,
    ...darkMarkdownExtensions(),
    ...(plain ? [] : [markdown()]),
    // View-only users get a read-only editor: their keystrokes would otherwise
    // flow into the local doc, be rejected server-side ("No edit permission"),
    // and silently diverge this client from every peer.
    ...(canEdit ? [] : [EditorState.readOnly.of(true), EditorView.editable.of(false)]),
    EditorView.lineWrapping,
    EditorView.theme({
      "&": {
        fontSize: "14px",
        border: "1px solid rgba(0,0,0,0.15)",
        borderRadius: "6px",
        backgroundColor: "#fff",
      },
      "&.cm-focused": { outline: "none" },
      ".cm-scroller": { overflow: "auto", maxHeight: height, fontFamily: "inherit" },
      ".cm-content": { minHeight: height, padding: "8px" },
    }),
    yCollab(yText, awareness),
  ];
}

export function CollabMarkdownEditor(p: {
  yText: Y.Text;
  awareness: Awareness;
  /** Whether this user may edit — false renders a read-only editor. */
  canEdit: boolean;
  /** Mirror the text into the host's working state so it re-renders as you type. */
  onTextChange: (markdown: string) => void;
  height?: string;
  /** Plain text (no markdown highlighting) — used for title/header/caption fields. */
  plain?: boolean;
}) {
  let parent!: HTMLDivElement;
  let view: EditorView | undefined;

  // Recreate the editor when the bound Y.Text or edit permission changes
  // (permissions can arrive after mount; the reactive read re-runs this effect).
  createEffect(() => {
    const yText = p.yText;
    const canEdit = p.canEdit;
    view?.destroy();
    view = new EditorView({
      parent,
      doc: yText.toString(),
      extensions: buildExtensions(yText, p.awareness, p.height ?? "300px", !!p.plain, canEdit),
    });
    const observer = () => p.onTextChange(yText.toString());
    yText.observe(observer);
    const detachHover = attachSelectionNameHover(view.dom, p.awareness);
    onCleanup(() => {
      yText.unobserve(observer);
      detachHover();
    });
  });

  onCleanup(() => view?.destroy());

  return <div ref={parent} class="w-full" />;
}
