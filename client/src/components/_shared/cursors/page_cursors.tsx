import { createEffect } from "solid-js";
import {
  createPointerBroadcast,
  CursorChatInput,
  LiveCursorsOverlay,
  type PointerAwarenessState,
  pointerFromPane,
  viewportFromPane,
} from "../live_cursors";
import { projectAwareness } from "~/state/project/collab";
import {
  deckGroupingMode,
  deckSelectedGroup,
  projectTab,
  reportGroupingMode,
  reportSelectedGroup,
  vizGroupingMode,
  vizSelectedGroup,
} from "~/state/t4_ui";

// =============================================================================
// Live cursors on the project tab pages — "page" surface
// =============================================================================
//
// One file per cursor surface lives in this folder (slide/viz/report/page) —
// each supplies only its surface's coordinate mapping and scope gate; the
// rendering engine is shared (../live_cursors.tsx).
//
// Rides the PROJECT-level awareness (state/project/collab.ts) — the tab pages
// have no doc room. Each page tags its app-owned content element with
// [data-page-cursor-surface]; coordinates are x normalized to that element's
// width and y in content px against its own scrollTop (one formula covers the
// self-scrolling card grids AND the content divs whose panther ancestor
// scrolls — see pointerFromPane).
//
// Scope = tab, PLUS the folder/grouping selection on the list tabs: two users
// on the same tab but different folders see entirely different cards, so a
// cursor must only render for peers looking at the same view. Residual reflow
// drift (window width changes the grid's column count, per-user sort modes
// reorder cards) is accepted, per the live_cursors.tsx header doctrine.
//
// There is deliberately NO editor-open counter here: every editor overlay
// (incl. the LOCAL EditorWrappers inside the data/modules pages) hides the
// page content via display:none, which zeroes the tagged element's rect —
// sender and receiver both bail on geometry. z-50 modals are rejected by the
// elementFromPoint containment in the pane helpers.

function pageScope(): string | null {
  const tab = projectTab();
  switch (tab) {
    case "reports":
      return `reports:${reportGroupingMode()}:${reportSelectedGroup() ?? ""}`;
    case "decks":
      return `decks:${deckGroupingMode()}:${deckSelectedGroup() ?? ""}`;
    case "visualizations":
      return `visualizations:${vizGroupingMode()}:${vizSelectedGroup() ?? ""}`;
    default:
      return tab;
  }
}

/** First VISIBLE tagged surface — hidden-but-mounted elements under a local
 *  EditorWrapper stay in the DOM at zero size. */
function findPageSurfaceEl(): Element | null {
  for (const el of document.querySelectorAll("[data-page-cursor-surface]")) {
    if (el.getBoundingClientRect().width > 0) return el;
  }
  return null;
}

function toPagePointer(
  clientX: number,
  clientY: number,
): PointerAwarenessState | null {
  const scope = pageScope();
  if (!scope) return null;
  const el = findPageSurfaceEl();
  if (!el) return null;
  const pos = pointerFromPane(el, el, clientX, clientY);
  if (!pos) return null;
  return { surface: "page", scope, x: pos.x, y: pos.y };
}

export function ProjectPageCursors() {
  const broadcast = createPointerBroadcast({
    awareness: projectAwareness,
    enabled: () => !!projectAwareness(),
    toPointer: toPagePointer,
  });

  // Tab or folder switch under a stationary pointer must restamp the scope
  // (mirrors the viz editor's panelTab resend effect).
  createEffect(() => {
    pageScope();
    broadcast.resend();
  });

  function acceptsPagePointer(
    pointer: PointerAwarenessState,
  ): { x: number; y: number } | null {
    if (pointer.surface !== "page") return null;
    if (pointer.scope !== pageScope()) return null;
    const el = findPageSurfaceEl();
    if (!el) return null;
    return viewportFromPane(el, el, { x: pointer.x, y: pointer.y });
  }

  return (
    <>
      <LiveCursorsOverlay
        awareness={projectAwareness()}
        accepts={acceptsPagePointer}
      />
      <CursorChatInput
        awareness={projectAwareness}
        enabled={() => !!projectAwareness()}
        isOverSurface={(x, y) => toPagePointer(x, y) !== null}
      />
    </>
  );
}
