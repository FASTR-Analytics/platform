// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  batch,
  createEffect,
  createMemo,
  createSignal,
  createUniqueId,
  For,
  layout,
  onCleanup,
  onMount,
  toSvgPath,
  untrack,
} from "./deps.ts";
import type { Geometry, LayoutOptions } from "./deps.ts";
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

const DEFAULT_TRANSITION_MS = 500;
const CAMERA_ANIMATION_MS = 300;
const MIN_SCALE = 0.1;
const MAX_SCALE = 4;
const ZOOM_INTENSITY = 0.0015;
const FIT_PADDING_PX = 40;
const CLICK_DRAG_THRESHOLD_PX = 4;
const DEFAULT_EDGE_THICKNESS = 1.5;
const ARROW_SIZE = 7;
const RESIZE_RELAYOUT_DEBOUNCE_MS = 100;

const EMPTY_GEOMETRY: Geometry = {
  bounds: { x: 0, y: 0, w: 0, h: 0 },
  nodes: {},
  edges: {},
  lanes: {},
  groups: {},
  hitAreas: [],
  warnings: [],
};

export function VizGraphView(p: VizGraphViewProps) {
  let viewportEl!: HTMLDivElement;
  const markerId = `vizgraph-arrow-${createUniqueId()}`;

  const [camera, setCamera] = createSignal({ x: 0, y: 0, scale: 1 });
  const [internalSelected, setInternalSelected] = createSignal<string[]>([]);
  const selectedIds = createMemo(() => p.selected ?? internalSelected());
  const [frame, setFrame] = createSignal<TransitionFrame>({
    geometry: EMPTY_GEOMETRY,
    opacities: undefined,
  });
  // undefined until the font gate resolves (only used with measureNodeContent)
  const [measurer, setMeasurer] = createSignal<DomMeasurer | undefined>();
  // undefined until the viewport reports a size (only used with fitToWidth)
  const [fitWidth, setFitWidth] = createSignal<number | undefined>();

  const nodeIds = createMemo(() => Object.keys(frame().geometry.nodes));
  const edgeIds = createMemo(() => Object.keys(frame().geometry.edges));

  // Renderer style stays out of the engine: thickness is model data the view
  // paints; color/dash stay CSS-themed.
  const thicknessByEdge = createMemo(() => {
    const map: Record<string, number> = {};
    for (const e of p.model.edges) {
      if (e.thickness !== undefined) {
        map[e.id] = e.thickness;
      }
    }
    return map;
  });

  let transitionVersion = 0;
  let transitionRaf = 0;
  let cameraVersion = 0;
  let cameraRaf = 0;
  let laidOut = false;
  let hasFitted = false;
  let userMovedCamera = false;
  let resizeTimer: ReturnType<typeof setTimeout> | undefined;

  // undefined = a required async input (font gate, viewport width) is not
  // available yet; the layout effect waits for it.
  function resolvedOptions(): LayoutOptions | undefined {
    const options: LayoutOptions = { ...p.layoutOptions };
    if (p.measureNodeContent !== undefined) {
      const m = measurer();
      if (m === undefined) {
        return undefined;
      }
      options.measureNode = (id, maxWidth) =>
        m.measureElement(() => p.measureNodeContent!(id), maxWidth);
    }
    if (p.fitToWidth) {
      const w = fitWidth();
      if (w === undefined || w <= 0) {
        return undefined;
      }
      options.fit = { width: w - FIT_PADDING_PX * 2 };
    }
    return options;
  }

  // ONE layout effect: first resolvable input set lays out without prior and
  // fits the camera; later changes relayout with prior = what is currently
  // displayed (survivors barely move) and run the two-phase transition.
  createEffect(() => {
    const model = p.model;
    const options = resolvedOptions();
    if (options === undefined) {
      return;
    }
    const current = untrack(frame).geometry;
    if (!laidOut) {
      laidOut = true;
      setFrame({ geometry: layout(model, options), opacities: undefined });
      fitInitialIfPossible();
      return;
    }
    const next = layout(model, { ...options, prior: current });
    runTransition(current, next);
    if (p.fitToWidth && !userMovedCamera) {
      setCameraForFit(true, next.bounds);
    }
  });

  function runTransition(from: Geometry, to: Geometry): void {
    const version = ++transitionVersion;
    const durationMs = p.transitionMs ?? DEFAULT_TRANSITION_MS;
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

  function setCameraForFit(
    animate: boolean,
    boundsOverride?: Geometry["bounds"],
  ): void {
    const bounds = boundsOverride ?? untrack(frame).geometry.bounds;
    const vw = viewportEl.clientWidth;
    const vh = viewportEl.clientHeight;
    if (vw === 0 || vh === 0 || bounds.w === 0 || bounds.h === 0) {
      return;
    }
    const scale = Math.min(
      MAX_SCALE,
      Math.max(
        MIN_SCALE,
        Math.min(
          (vw - FIT_PADDING_PX * 2) / bounds.w,
          (vh - FIT_PADDING_PX * 2) / bounds.h,
        ),
      ),
    );
    const target = {
      x: (vw - bounds.w * scale) / 2 - bounds.x * scale,
      y: (vh - bounds.h * scale) / 2 - bounds.y * scale,
      scale,
    };
    if (animate) {
      animateCameraTo(target);
    } else {
      setCamera(target);
    }
  }

  // Mounting hidden (0×0 viewport) or laying out before mount both skip the
  // fit; every later source of "now it is possible" re-tries until it lands.
  function fitInitialIfPossible(): void {
    if (hasFitted) {
      return;
    }
    const bounds = untrack(frame).geometry.bounds;
    if (
      viewportEl.clientWidth > 0 && viewportEl.clientHeight > 0 &&
      bounds.w > 0 && bounds.h > 0
    ) {
      setCameraForFit(false);
      hasFitted = true;
    }
  }

  function focusNode(nodeId: string): void {
    const node = frame().geometry.nodes[nodeId];
    if (node === undefined) {
      return;
    }
    const c = camera();
    const vw = viewportEl.clientWidth;
    const vh = viewportEl.clientHeight;
    animateCameraTo({
      x: vw / 2 - (node.x + node.w / 2) * c.scale,
      y: vh / 2 - (node.y + node.h / 2) * c.scale,
      scale: c.scale,
    });
  }

  function animateCameraTo(
    target: { x: number; y: number; scale: number },
  ): void {
    const version = ++cameraVersion;
    const start = camera();
    const startTime = performance.now();
    function step(now: number): void {
      if (version !== cameraVersion) {
        return;
      }
      const t = Math.min(1, (now - startTime) / CAMERA_ANIMATION_MS);
      const e = t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) * (1 - t);
      setCamera({
        x: start.x + (target.x - start.x) * e,
        y: start.y + (target.y - start.y) * e,
        scale: start.scale + (target.scale - start.scale) * e,
      });
      if (t < 1) {
        cameraRaf = requestAnimationFrame(step);
      }
    }
    cameraRaf = requestAnimationFrame(step);
  }

  let panPointerId: number | undefined;
  let panStart = { x: 0, y: 0, camX: 0, camY: 0 };
  let panMoved = false;

  function handlePointerDown(e: PointerEvent): void {
    if (e.button !== 0) {
      return;
    }
    panPointerId = e.pointerId;
    panMoved = false;
    const c = camera();
    panStart = { x: e.clientX, y: e.clientY, camX: c.x, camY: c.y };
    viewportEl.setPointerCapture(e.pointerId);
  }

  function handlePointerMove(e: PointerEvent): void {
    if (panPointerId !== e.pointerId) {
      return;
    }
    const dx = e.clientX - panStart.x;
    const dy = e.clientY - panStart.y;
    if (Math.hypot(dx, dy) > CLICK_DRAG_THRESHOLD_PX) {
      panMoved = true;
      userMovedCamera = true;
    }
    if (panMoved) {
      cameraVersion++;
      setCamera((prev) => ({
        x: panStart.camX + dx,
        y: panStart.camY + dy,
        scale: prev.scale,
      }));
    }
  }

  function handlePointerUp(e: PointerEvent): void {
    if (panPointerId !== e.pointerId) {
      return;
    }
    viewportEl.releasePointerCapture(e.pointerId);
    panPointerId = undefined;
    if (!panMoved) {
      emitSelect([]);
    }
  }

  function handleWheel(e: WheelEvent): void {
    e.preventDefault();
    userMovedCamera = true;
    const rect = viewportEl.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    cameraVersion++;
    batch(() => {
      setCamera((prev) => {
        const scale = Math.min(
          MAX_SCALE,
          Math.max(
            MIN_SCALE,
            prev.scale * Math.exp(-e.deltaY * ZOOM_INTENSITY),
          ),
        );
        return {
          x: sx - ((sx - prev.x) / prev.scale) * scale,
          y: sy - ((sy - prev.y) / prev.scale) * scale,
          scale,
        };
      });
    });
  }

  onMount(() => {
    if (p.measureNodeContent !== undefined) {
      // Container = the viewport, so measured content inherits the same CSS
      // context the node divs render in (the strut rule — decision log).
      const m = createDomMeasurer({
        fonts: p.measureFonts,
        container: viewportEl,
      });
      m.ready.then(() => setMeasurer(m));
      onCleanup(() => m.dispose());
    }

    const observer = new ResizeObserver((entries) => {
      fitInitialIfPossible();
      if (p.fitToWidth) {
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
      }
    });
    observer.observe(viewportEl);

    fitInitialIfPossible();
    viewportEl.addEventListener("wheel", handleWheel, { passive: false });
    const api: VizGraphViewApi = {
      select: (ids) => emitSelect(ids),
      focus: (nodeId) => focusNode(nodeId),
      fit: () => setCameraForFit(true),
      getGeometry: () => frame().geometry,
    };
    p.onReady?.(api);
    onCleanup(() => {
      observer.disconnect();
      if (resizeTimer !== undefined) {
        clearTimeout(resizeTimer);
      }
      viewportEl.removeEventListener("wheel", handleWheel);
      transitionVersion++;
      cameraVersion++;
      cancelAnimationFrame(transitionRaf);
      cancelAnimationFrame(cameraRaf);
    });
  });

  function nodeInfo(id: string): VizGraphViewNodeInfo {
    return {
      id,
      geom: frame().geometry.nodes[id],
      selected: selectedIds().includes(id),
    };
  }

  return (
    <div
      ref={viewportEl!}
      class="ui-vizgraph-viewport"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      <div
        style={{
          position: "absolute",
          left: "0",
          top: "0",
          "transform-origin": "0 0",
          transform:
            `translate(${camera().x}px, ${camera().y}px) scale(${camera().scale})`,
        }}
      >
        <svg
          style={{
            position: "absolute",
            left: "0",
            top: "0",
            width: "1px",
            height: "1px",
            overflow: "visible",
            "pointer-events": "none",
          }}
        >
          <defs>
            <marker
              id={markerId}
              viewBox="0 0 10 10"
              refX="10"
              refY="5"
              markerWidth={ARROW_SIZE}
              markerHeight={ARROW_SIZE}
              orient="auto-start-reverse"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" class="ui-vizgraph-arrowhead" />
            </marker>
          </defs>
          <For each={edgeIds()}>
            {(id) => (
              <path
                class="ui-vizgraph-edge"
                d={toSvgPath(frame().geometry.edges[id].path)}
                stroke-width={thicknessByEdge()[id] ?? DEFAULT_EDGE_THICKNESS}
                marker-end={`url(#${markerId})`}
                opacity={frame().opacities?.[edgeOpacityKey(id)] ?? 1}
              />
            )}
          </For>
        </svg>
        <For each={nodeIds()}>
          {(id) => (
            <div
              class="ui-vizgraph-node"
              classList={{
                "ui-vizgraph-node-selected": selectedIds().includes(id),
              }}
              style={{
                left: `${frame().geometry.nodes[id].x}px`,
                top: `${frame().geometry.nodes[id].y}px`,
                width: `${frame().geometry.nodes[id].w}px`,
                height: `${frame().geometry.nodes[id].h}px`,
                opacity: frame().opacities?.[nodeOpacityKey(id)] ?? 1,
              }}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                emitSelect([id]);
              }}
            >
              {p.nodeContent === undefined
                ? <div class="ui-vizgraph-node-default">{id}</div>
                : p.nodeContent(nodeInfo(id))}
            </div>
          )}
        </For>
      </div>
    </div>
  );
}
