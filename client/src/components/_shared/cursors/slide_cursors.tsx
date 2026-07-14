import { PAGE_HEIGHT_DU, PAGE_WIDTH_DU } from "lib";
import type { Awareness } from "y-protocols/awareness";
import {
  createPointerBroadcast,
  CursorChatInput,
  duToViewport,
  LiveCursorsOverlay,
  type PointerAwarenessState,
  viewportToDu,
} from "../live_cursors";

// =============================================================================
// Live cursors on the slide editor canvas — "slide" surface
// =============================================================================
//
// Surface glue only (coordinate mapping + scope gate); the engine is shared
// (../live_cursors.tsx). Coordinates travel in slide DU space
// (PAGE_WIDTH_DU × PAGE_HEIGHT_DU) so they land on the same slide CONTENT for
// every viewer regardless of zoom/window size. The canvas is looked up by id
// PER EVENT — it lives inside a keyed <Show> that recreates on edits, so
// element refs would go stale. Rides the slide session's awareness; the host
// editor disables/suppresses while a sub-editor modal covers the canvas (the
// figure modal's own broadcaster takes over the shared "pointer" field).

const CANVAS_ID = "SLIDE_EDITOR_CANVAS";

export function SlideEditorCursors(p: {
  slideId: string;
  awareness: () => Awareness | undefined | null;
  enabled: () => boolean;
  /** True while a sub-editor modal covers the canvas. */
  covered: () => boolean;
}) {
  function toPointer(cx: number, cy: number): PointerAwarenessState | null {
    const canvas = document.getElementById(CANVAS_ID);
    if (!canvas) return null;
    const r = canvas.getBoundingClientRect();
    if (
      r.width === 0 || cx < r.left || cx > r.right || cy < r.top ||
      cy > r.bottom
    ) {
      return null;
    }
    const du = viewportToDu(r, { x: cx, y: cy }, PAGE_WIDTH_DU, PAGE_HEIGHT_DU);
    return { surface: "slide", scope: p.slideId, x: du.x, y: du.y };
  }

  createPointerBroadcast({
    awareness: p.awareness,
    enabled: p.enabled,
    toPointer,
  });

  function accepts(
    pointer: PointerAwarenessState,
  ): { x: number; y: number } | null {
    if (pointer.surface !== "slide" || pointer.scope !== p.slideId) {
      return null;
    }
    const canvas = document.getElementById(CANVAS_ID);
    if (!canvas) return null;
    const r = canvas.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return null;
    // Backstop for any covering modal (see PeerSelectionOverlay).
    const topEl = document.elementFromPoint(
      r.left + r.width / 2,
      r.top + r.height / 2,
    );
    if (topEl && topEl !== canvas && !topEl.contains(canvas)) {
      return null;
    }
    return duToViewport(r, pointer, PAGE_WIDTH_DU, PAGE_HEIGHT_DU);
  }

  return (
    <>
      <LiveCursorsOverlay
        awareness={p.awareness()}
        suppressed={p.covered()}
        accepts={accepts}
      />
      {/* Cursor chat: "/" over the canvas opens a message bubble on your
          live cursor. */}
      <CursorChatInput
        awareness={p.awareness}
        enabled={p.enabled}
        isOverSurface={(x, y) => toPointer(x, y) !== null}
      />
    </>
  );
}
