import { createEffect } from "solid-js";
import {
  acceptZonePointer,
  createPointerBroadcast,
  CursorChatInput,
  LiveCursorsOverlay,
  type PointerAwarenessState,
  pointerFromPane,
  viewportFromPane,
  zonePointerAt,
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

/** First VISIBLE tagged surface — hidden-but-mounted elements under an
 *  editor overlay stay in the DOM at zero size. A surface may carry its own
 *  scope as the attribute VALUE (e.g. `deck:<id>` on the deck overview,
 *  which renders as an editor overlay ABOVE the tab pages and must not share
 *  their scope); an empty value means the tab-derived scope. */
function currentSurface(): { el: Element; scope: string } | null {
  for (const el of document.querySelectorAll("[data-page-cursor-surface]")) {
    if (el.getBoundingClientRect().width <= 0) {
      continue;
    }
    const scope = el.getAttribute("data-page-cursor-surface") || pageScope();
    return scope ? { el, scope } : null;
  }
  return null;
}

function toPagePointer(
  clientX: number,
  clientY: number,
): PointerAwarenessState | null {
  const surface = currentSurface();
  if (!surface) {
    return null;
  }
  const pos = pointerFromPane(surface.el, surface.el, clientX, clientY);
  if (pos) {
    return { surface: "page", scope: surface.scope, x: pos.x, y: pos.y };
  }
  // Chrome (tabs nav / folder panel / top bar) — shared zone fallback, same
  // scope so only same-view peers see the cursor cross it.
  return zonePointerAt(surface.scope, clientX, clientY);
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
    const surface = currentSurface();
    if (!surface) {
      return null;
    }
    if (pointer.surface === "zone") {
      return acceptZonePointer(pointer, surface.scope);
    }
    if (pointer.surface !== "page") {
      return null;
    }
    if (pointer.scope !== surface.scope) {
      return null;
    }
    return viewportFromPane(surface.el, surface.el, {
      x: pointer.x,
      y: pointer.y,
    });
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
