import type { Awareness } from "y-protocols/awareness";
import {
  createPointerBroadcast,
  CursorChatInput,
  LiveCursorsOverlay,
  type PointerAwarenessState,
  pointerFromPane,
  viewportFromPane,
} from "../live_cursors";

// =============================================================================
// Live cursors in the report editor — "report-code" + "report-preview"
// =============================================================================
//
// Surface glue only (coordinate mapping + scope gate); the engine is shared
// (../live_cursors.tsx). Two zones on the report session's awareness:
//   report-code — the CodeMirror pane. Coordinates anchor to `.cm-content`
//     (its rect moves with the scroller's internal scroll; its width is
//     capped at the editor column max for every user — best cross-user
//     stability). Queried live per event: buildView recreates the whole
//     EditorView when the collab binding appears or canEdit flips.
//   report-preview — the rendered preview. Coordinates anchor to the
//     centered CONTENT div (max-w-4xl — stable across split/view widths).
// The mode matrix costs nothing: View hides the CM pane (zero rect), Edit
// unmounts the preview (element absent) — both sides bail on geometry. The
// host must disable/suppress while its figure modal is open: that modal
// broadcasts fig:-scoped pointers on this SAME awareness, and two
// broadcasters must not fight over the one "pointer" field.

function codePane(): { pane: Element; content: Element } | null {
  const pane = document.querySelector('[data-report-cursor="code-pane"]');
  const content = pane?.querySelector(".cm-content");
  return pane && content ? { pane, content } : null;
}

function previewPane(): { pane: Element; content: Element } | null {
  const pane = document.querySelector('[data-report-cursor="preview-pane"]');
  const content = document.querySelector(
    '[data-report-cursor="preview-content"]',
  );
  return pane && content ? { pane, content } : null;
}

export function ReportEditorCursors(p: {
  reportId: string;
  awareness: () => Awareness | undefined | null;
  enabled: () => boolean;
  /** True while a figure/embed sub-editor covers the panes. */
  covered: () => boolean;
}) {
  function toPointer(cx: number, cy: number): PointerAwarenessState | null {
    const code = codePane();
    if (code) {
      const pos = pointerFromPane(code.pane, code.content, cx, cy);
      if (pos) {
        return { surface: "report-code", scope: p.reportId, x: pos.x, y: pos.y };
      }
    }
    const preview = previewPane();
    if (preview) {
      const pos = pointerFromPane(preview.pane, preview.content, cx, cy);
      if (pos) {
        return {
          surface: "report-preview",
          scope: p.reportId,
          x: pos.x,
          y: pos.y,
        };
      }
    }
    return null;
  }

  createPointerBroadcast({
    awareness: p.awareness,
    enabled: p.enabled,
    toPointer,
  });

  function accepts(
    pointer: PointerAwarenessState,
  ): { x: number; y: number } | null {
    if (pointer.scope !== p.reportId) return null;
    if (pointer.surface === "report-code") {
      const code = codePane();
      if (!code) return null;
      return viewportFromPane(code.pane, code.content, pointer);
    }
    if (pointer.surface === "report-preview") {
      const preview = previewPane();
      if (!preview) return null;
      return viewportFromPane(preview.pane, preview.content, pointer);
    }
    return null; // foreign surfaces on the shared awareness (fig:* zones)
  }

  return (
    <>
      <LiveCursorsOverlay
        awareness={p.awareness()}
        suppressed={p.covered()}
        accepts={accepts}
      />
      {/* Cursor chat: "/" over either pane opens a message bubble on your
          live cursor (refused while focus is inside the CM editor). */}
      <CursorChatInput
        awareness={p.awareness}
        enabled={p.enabled}
        isOverSurface={(x, y) => toPointer(x, y) !== null}
      />
    </>
  );
}
