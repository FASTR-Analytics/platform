import { createEffect } from "solid-js";
import type { Awareness } from "y-protocols/awareness";
import {
  acceptZonePointer,
  createPointerBroadcast,
  CursorChatInput,
  LiveCursorsOverlay,
  panelClientFromContent,
  panelContentFromClient,
  type PointerAwarenessState,
  zonePointerAt,
} from "../live_cursors";

// =============================================================================
// Live cursors in the visualization editor — "viz-preview" + "viz-panel"
// =============================================================================
//
// Surface glue only (coordinate mapping + scope gate); the engine is shared
// (../live_cursors.tsx). Two zones on one awareness:
//   viz-preview — the chart canvas (#VIZ_PREVIEW_CANVAS), normalized 0..1 of
//     its rect (the preview reflows per user; approximate landing accepted).
//   viz-panel — the settings panel's active-tab scroll container
//     (#VIZ_PANEL_ROOT [data-viz-panel-scroll]): x normalized, y content-px,
//     tagged with the tab so cursors only show to peers on the SAME tab.
// scope = `po:<id>` (standalone editor) or `fig:<figureId>` (ephemeral editor
// bound into a host slide/report doc); the host passes it reactively.

const PREVIEW_ID = "VIZ_PREVIEW_CANVAS";

function panelScrollEl(): HTMLElement | null {
  return document
    .getElementById("VIZ_PANEL_ROOT")
    ?.querySelector("[data-viz-panel-scroll]") ?? null;
}

export function VizEditorCursors(p: {
  scope: () => string | undefined;
  awareness: () => Awareness | undefined | null;
  enabled: () => boolean;
  panelTab: () => "data" | "style" | "text";
}) {
  function toPointer(cx: number, cy: number): PointerAwarenessState | null {
    const scope = p.scope();
    if (!scope) return null;
    const canvas = document.getElementById(PREVIEW_ID);
    if (canvas) {
      const r = canvas.getBoundingClientRect();
      if (
        r.width > 0 && cx >= r.left && cx <= r.right && cy >= r.top &&
        cy <= r.bottom
      ) {
        return {
          surface: "viz-preview",
          scope,
          x: (cx - r.left) / r.width,
          y: (cy - r.top) / r.height,
        };
      }
    }
    const scrollEl = panelScrollEl();
    if (scrollEl) {
      const sr = scrollEl.getBoundingClientRect();
      if (
        sr.width > 0 && cx >= sr.left && cx <= sr.right && cy >= sr.top &&
        cy <= sr.bottom
      ) {
        const pos = panelContentFromClient(sr, scrollEl.scrollTop, {
          x: cx,
          y: cy,
        });
        return { surface: "viz-panel", scope, tab: p.panelTab(), ...pos };
      }
    }
    // Chrome (header, tab row, the area around the preview) — shared zones.
    return zonePointerAt(scope, cx, cy);
  }

  const broadcast = createPointerBroadcast({
    awareness: p.awareness,
    enabled: p.enabled,
    toPointer,
  });
  // A tab click under a stationary pointer must restamp the pointer's tab.
  createEffect(() => {
    p.panelTab();
    broadcast.resend();
  });

  function accepts(
    pointer: PointerAwarenessState,
  ): { x: number; y: number } | null {
    if (pointer.surface === "zone") {
      return acceptZonePointer(pointer, p.scope());
    }
    if (pointer.scope !== p.scope()) return null;
    if (pointer.surface === "viz-preview") {
      const canvas = document.getElementById(PREVIEW_ID);
      if (!canvas) return null;
      const r = canvas.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return null;
      // Backstop: hide while another modal covers the preview.
      const topEl = document.elementFromPoint(
        r.left + r.width / 2,
        r.top + r.height / 2,
      );
      if (topEl && topEl !== canvas && !topEl.contains(canvas)) return null;
      return {
        x: r.left + pointer.x * r.width,
        y: r.top + pointer.y * r.height,
      };
    }
    if (pointer.surface === "viz-panel") {
      if (pointer.tab !== p.panelTab()) return null;
      const scrollEl = panelScrollEl();
      if (!scrollEl) return null;
      const sr = scrollEl.getBoundingClientRect();
      if (sr.width === 0 || sr.height === 0) return null;
      const pos = panelClientFromContent(sr, scrollEl.scrollTop, pointer);
      // Clip: a cursor scrolled out of THIS viewer's panel view must not float
      // over the tab bar or the chart.
      if (
        pos.y < sr.top - 4 || pos.y > sr.top + sr.height + 4 ||
        pos.x < sr.left - 4 || pos.x > sr.left + sr.width + 4
      ) {
        return null;
      }
      const topEl = document.elementFromPoint(
        sr.left + sr.width / 2,
        sr.top + sr.height / 2,
      );
      if (topEl && topEl !== scrollEl && !scrollEl.contains(topEl)) return null;
      return pos;
    }
    return null; // foreign surfaces on a shared host awareness (e.g. "slide")
  }

  return (
    <>
      {/* Figma-style live cursors over the preview + settings panel. Renders
          nothing when no collab target / no peers. */}
      <LiveCursorsOverlay awareness={p.awareness()} accepts={accepts} />
      {/* Cursor chat: "/" over the preview or panel opens a message bubble on
          your live cursor. */}
      <CursorChatInput
        awareness={p.awareness}
        enabled={p.enabled}
        isOverSurface={(x, y) => toPointer(x, y) !== null}
      />
    </>
  );
}
