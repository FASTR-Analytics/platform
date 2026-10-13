// The collab seam's two helpers around y-codemirror.next: a name flag over a
// hovered peer selection, and the caret hygiene yCollab itself lacks. The
// editor installs both when a host hands it a Y.Text and an awareness; a
// host with other CodeMirror editors on the same awareness may use them too.

import type { Extension } from "@codemirror/state";
import { ViewPlugin } from "@codemirror/view";
import type { Awareness } from "y-protocols/awareness";
import * as Y from "yjs";

// ── Selection hover name flag ────────────────────────────────────────────────
// yCollab names a peer when you hover their CARET (its own CSS hover on
// .cm-ySelectionCaret), but a selection HIGHLIGHT is a separate mark
// decoration with no name element: hovering it named nobody. This helper
// watches mousemoves over an editor, resolves a hovered .cm-ySelection span
// back to its owner by matching the span's background color to the awareness
// users (the highlight is the user's translucent colorLight: same RGB as
// their identity color, alpha aside), and floats a caret-style name flag
// above it. One shared flag element serves every editor (there is one mouse).

let hoverFlagEl: HTMLDivElement | null = null;
function hoverFlag(): HTMLDivElement {
  if (!hoverFlagEl) {
    hoverFlagEl = document.createElement("div");
    hoverFlagEl.style.cssText =
      "position:fixed;z-index:95;padding:1px 6px;border-radius:4px;" +
      "font-size:0.75rem;font-weight:600;color:#fff;pointer-events:none;" +
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

// Forgiveness around each highlight rect: hovering NEAR the highlight (line
// padding, the gap between wrapped segments) still counts.
const HOVER_SLACK_PX = 8;

/** Attach the selection-hover name flag to a CodeMirror editor DOM. Returns
 *  the detach function.
 *
 *  Detection is GEOMETRIC, not DOM hit-testing: a selection renders as many
 *  thin inline spans (one or more client rects each: wrapped lines split),
 *  and the pointer target between lines or in padding is the line element,
 *  not the span. Checking the mouse against every span's client rects (with
 *  slack) makes the whole highlighted region (every line of a multi-line
 *  selection) a reliable hover target. rAF-throttled; selections on screen
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
    // decorations on fully-covered middle lines: both carry the owner's
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
    // end of the selection, so hovering there would show BOTH flags: suppress
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
  // rides this same instance at up to ~20 msg/s): NEVER blind-hide on it,
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

// ── Caret hygiene ────────────────────────────────────────────────────────────
// yCollab is supposed to null the local "cursor" awareness field (the text
// caret peers render) when the editor loses focus — but in y-codemirror.next
// (0.3.5, and upstream main at the time of writing) that branch is dead code:
// `else if (cursor != null && hasFocus)` sits inside the path only reached
// when hasFocus is FALSE. It also does nothing on view teardown. Verified in a
// jsdom harness: after blur, and after view.destroy(), the caret stays set.
// So without help a caret would sit in every peer's editor after its owner
// clicked away, tabbed out, or closed the editor — and a background tab's
// caret would blink in and out as the browser throttles the awareness
// keepalive below the peers' 30 s sweep. This plugin restores the contract the
// awareness field is documented to keep ("nulled on every editor blur"):
//   • focus lost (in-document click-away, window blur, tab switch — CodeMirror
//     reports every one as `focusChanged`) → clear;
//   • view destroyed while the field still points into THIS Y.Text (destroyed
//     while focused, e.g. a panel closing) → clear. The ownership check keeps
//     a teardown from clobbering a caret another editor bound to the same
//     awareness has since taken (click from textbox A's editor into B's).
// Re-focus needs no help: yCollab's own update() sets the field again.
export function yCaretHygiene(yText: Y.Text, awareness: Awareness): Extension {
  const clear = () => {
    // No-op after awareness destroy (getLocalState() is null).
    if (awareness.getLocalState()?.cursor != null) {
      awareness.setLocalStateField("cursor", null);
    }
  };
  const ownsCaret = () => {
    const cur = awareness.getLocalState()?.cursor as
      | { anchor?: unknown }
      | null
      | undefined;
    if (!cur?.anchor || !yText.doc) {
      return false;
    }
    try {
      const abs = Y.createAbsolutePositionFromRelativePosition(
        Y.createRelativePositionFromJSON(cur.anchor as Y.RelativePosition),
        yText.doc,
      );
      return abs?.type === yText;
    } catch {
      return false;
    }
  };
  return ViewPlugin.define(() => ({
    update(u) {
      // Focus moving INTO the editor's own content — a live-preview island
      // (a block's title, a table cell) is a contentEditable inside
      // contentDOM — is not leaving the editor: the island publishes the
      // caret itself, and clearing here would erase it a tick later.
      const active = u.view.root.activeElement;
      const inContent = active !== null && u.view.contentDOM.contains(active);
      if (u.focusChanged && !u.view.hasFocus && !inContent) {
        clear();
      }
    },
    destroy() {
      if (ownsCaret()) {
        clear();
      }
    },
  }));
}
