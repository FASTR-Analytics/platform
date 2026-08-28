// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  createEffect,
  createMemo,
  createSelector,
  createSignal,
  FIT_PADDING_PX,
  For,
  layout,
  onCleanup,
  onMount,
  PanZoomSvg,
  Show,
  untrack,
} from "./deps.ts";
import type { Geometry, LayoutOptions, PanZoomApi } from "./deps.ts";
import type {
  VizGraphViewApi,
  VizGraphViewNodeInfo,
  VizGraphViewProps,
} from "./types.ts";
import { createDomMeasurer } from "./dom_measurer.ts";
import type { DomMeasurer } from "./dom_measurer.ts";
import {
  buildTransitionFrame,
  edgeOpacityKey,
  nodeOpacityKey,
} from "./_internal/transition.ts";
import type { TransitionFrame } from "./_internal/transition.ts";
import { arrowheadPath, shaftPath } from "./_internal/edge_paint.ts";

const DEFAULT_TRANSITION_MS = 500;
const DEFAULT_EDGE_THICKNESS = 1.5;
const RESIZE_RELAYOUT_DEBOUNCE_MS = 100;

const EMPTY_GEOMETRY: Geometry = {
  bounds: { x: 0, y: 0, w: 0, h: 0 },
  nodes: {},
  edges: {},
  lanes: {},
  groups: {},
  hitAreas: [],
  warnings: [],
  order: [],
};

export function VizGraphView(p: VizGraphViewProps) {
  let hostEl!: HTMLDivElement;
  let panZoom: PanZoomApi | undefined;

  const [internalSelected, setInternalSelected] = createSignal<string[]>([]);
  // All reactive deps read before any of them decides anything, here and in
  // every tracked computation below (PROTOCOL_UI_SOLIDJS rule 3).
  const selectedIds = createMemo(() => {
    const external = p.selected;
    const internal = internalSelected();
    return external ?? internal;
  });
  // O(1) per-node selection tracking: only the nodes whose selected state
  // actually changed re-run their reads.
  const isSelected = createSelector(
    selectedIds,
    (id: string, ids: string[]) => ids.includes(id),
  );
  const [frame, setFrame] = createSignal<TransitionFrame>({
    geometry: EMPTY_GEOMETRY,
    opacities: undefined,
  });
  // undefined until the font gate resolves (only used with measureNodeContent)
  const [measurer, setMeasurer] = createSignal<DomMeasurer | undefined>();
  // undefined until the viewport reports a size; the first layout waits for
  // it (unless an explicit layoutOptions.fit pins the width).
  const [fitWidth, setFitWidth] = createSignal<number | undefined>();
  // Settled bounds for the camera's follow policy: written once per relayout
  // (the layout TARGET, never the tween frame — _302's bounds contract).
  const [contentBounds, setContentBounds] = createSignal<
    Geometry["bounds"] | undefined
  >();

  const nodeIds = createMemo(() => Object.keys(frame().geometry.nodes));
  const edgeIds = createMemo(() => Object.keys(frame().geometry.edges));

  // Renderer style stays out of the engine: thickness is model data the view
  // paints; color/dash stay CSS-themed. Carries last-known values so removed
  // edges keep their width while fading out (they are absent from the new
  // model); a persisting edge whose thickness was removed drops to default.
  const thicknessByEdge = createMemo<Record<string, number>>((prev) => {
    const map: Record<string, number> = { ...prev };
    for (const e of p.model.edges) {
      if (e.thickness !== undefined) {
        map[e.id] = e.thickness;
      } else {
        delete map[e.id];
      }
    }
    return map;
  }, {});

  let transitionVersion = 0;
  let transitionRaf = 0;
  let resizeTimer: ReturnType<typeof setTimeout> | undefined;

  // undefined = a required async input (font gate, viewport width) is not
  // available yet; the layout effect waits for it. Runs inside the layout
  // effect's tracking scope, so every reactive dep is read up front, before
  // any conditional or early return (rule 3).
  function resolvedOptions(): LayoutOptions | undefined {
    const measureNodeContent = p.measureNodeContent;
    const m = measurer();
    const w = fitWidth();
    const options: LayoutOptions = { ...p.layoutOptions };
    if (measureNodeContent !== undefined) {
      if (m === undefined) {
        return undefined;
      }
      options.measureNode = (id, maxWidth) =>
        m.measureElement(() => measureNodeContent(id), maxWidth);
    }
    // The view lays out to its viewport width (the same padded budget the
    // camera fits into, so a fitted layout lands at scale 1); an explicit
    // layoutOptions.fit pins the width instead.
    if (options.fit === undefined) {
      if (w === undefined || w <= 0) {
        return undefined;
      }
      options.fit = { width: w - FIT_PADDING_PX * 2 };
    }
    return options;
  }

  // ONE layout effect: an empty PRIOR geometry (first layout, or content
  // replacing an empty canvas) swaps the frame in with no transition; later
  // changes relayout with prior = what is currently displayed (survivors
  // barely move) and run the two-phase transition.
  createEffect(() => {
    const model = p.model;
    const durationMs = p.transitionMs ?? DEFAULT_TRANSITION_MS;
    const options = resolvedOptions();
    if (options === undefined) {
      return;
    }
    const current = untrack(frame).geometry;
    if (Object.keys(current.nodes).length === 0) {
      const geometry = layout(model, options);
      setFrame({ geometry, opacities: undefined });
      setContentBounds(geometry.bounds);
      return;
    }
    const next = layout(model, { ...options, prior: current });
    runTransition(current, next, durationMs);
    setContentBounds(next.bounds);
  });

  function runTransition(
    from: Geometry,
    to: Geometry,
    durationMs: number,
  ): void {
    const version = ++transitionVersion;
    if (durationMs <= 0) {
      setFrame({ geometry: to, opacities: undefined });
      return;
    }
    const startTime = performance.now();
    function step(now: number): void {
      if (version !== transitionVersion) {
        return;
      }
      const t = Math.min(1, (now - startTime) / durationMs);
      setFrame(buildTransitionFrame(from, to, t));
      if (t < 1) {
        transitionRaf = requestAnimationFrame(step);
      }
    }
    transitionRaf = requestAnimationFrame(step);
  }

  function emitSelect(ids: string[]): void {
    if (p.selected === undefined) {
      setInternalSelected(ids);
    }
    p.onSelect?.(ids);
  }

  onMount(() => {
    if (p.measureNodeContent !== undefined) {
      // Container = the host, so measured content inherits the same CSS
      // context the foreignObject node divs render in (the strut rule —
      // decision log; CSS inherits into foreignObject normally).
      const m = createDomMeasurer({
        fonts: p.measureFonts,
        container: hostEl,
      });
      m.ready.then(() => setMeasurer(m));
      onCleanup(() => m.dispose());
    }

    // Debounced so a drag-resize relayouts once at rest; between reflows the
    // camera tracks the resize instantly (its own observer). With an explicit
    // layoutOptions.fit these updates are ignored by resolvedOptions and the
    // relayout reproduces the same geometry.
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width;
      if (width !== undefined && width > 0) {
        if (resizeTimer !== undefined) {
          clearTimeout(resizeTimer);
        }
        resizeTimer = setTimeout(
          () => setFitWidth(width),
          fitWidth() === undefined ? 0 : RESIZE_RELAYOUT_DEBOUNCE_MS,
        );
      }
    });
    observer.observe(hostEl);

    const api: VizGraphViewApi = {
      select: (ids) => emitSelect(ids),
      focus: (nodeId) => {
        const node = untrack(frame).geometry.nodes[nodeId];
        if (node !== undefined) {
          panZoom?.panTo({ x: node.x + node.w / 2, y: node.y + node.h / 2 });
        }
      },
      fit: () => panZoom?.fit(),
      getGeometry: () => untrack(frame).geometry,
    };
    // panZoom is set: PanZoomSvg fires its api callback in its component body
    // (during this component's return evaluation), before this onMount runs.
    p.onReady?.(api);
    onCleanup(() => {
      observer.disconnect();
      if (resizeTimer !== undefined) {
        clearTimeout(resizeTimer);
      }
      transitionVersion++;
      cancelAnimationFrame(transitionRaf);
    });
  });

  // Lazily reactive: creating the info object reads nothing, so the consumer
  // subtree is created once per node row; its own reads of geom/selected are
  // fine-grained.
  function nodeInfo(id: string): VizGraphViewNodeInfo {
    return {
      id,
      get geom() {
        return frame().geometry.nodes[id];
      },
      get selected() {
        return isSelected(id);
      },
    };
  }

  return (
    <div
      ref={hostEl!}
      class="ui-vizgraph-viewport"
      onClick={() => emitSelect([])}
    >
      <PanZoomSvg
        bounds={contentBounds()}
        api={(a) => {
          panZoom = a;
        }}
      >
        <g style={{ "pointer-events": "none" }}>
          <For each={edgeIds()}>
            {(id) => {
              const thickness = () =>
                thicknessByEdge()[id] ?? DEFAULT_EDGE_THICKNESS;
              return (
                <g opacity={frame().opacities?.[edgeOpacityKey(id)] ?? 1}>
                  <path
                    class="ui-vizgraph-edge"
                    d={shaftPath(frame().geometry.edges[id].path, thickness())}
                    stroke-width={thickness()}
                    stroke-linejoin="round"
                  />
                  <path
                    class="ui-vizgraph-arrowhead"
                    d={arrowheadPath(frame().geometry.edges[id].path)}
                    stroke-width={thickness()}
                    stroke-linejoin="round"
                  />
                </g>
              );
            }}
          </For>
        </g>
        <For each={nodeIds()}>
          {(id) => (
            <foreignObject
              x={frame().geometry.nodes[id].x}
              y={frame().geometry.nodes[id].y}
              width={frame().geometry.nodes[id].w}
              height={frame().geometry.nodes[id].h}
              style={{
                overflow: "visible",
                opacity: frame().opacities?.[nodeOpacityKey(id)] ?? 1,
                // Anything not fully opaque is mid-transition (a fading
                // newcomer or a removed ghost) and not a click target.
                "pointer-events":
                  (frame().opacities?.[nodeOpacityKey(id)] ?? 1) < 1
                    ? "none"
                    : undefined,
              }}
            >
              <div
                class="ui-vizgraph-node"
                classList={{
                  "ui-vizgraph-node-selected": isSelected(id),
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  emitSelect([id]);
                }}
              >
                <Show
                  when={p.nodeContent}
                  fallback={<div class="ui-vizgraph-node-default">{id}</div>}
                >
                  {(nodeContent) => nodeContent()(nodeInfo(id))}
                </Show>
              </div>
            </foreignObject>
          )}
        </For>
      </PanZoomSvg>
    </div>
  );
}
