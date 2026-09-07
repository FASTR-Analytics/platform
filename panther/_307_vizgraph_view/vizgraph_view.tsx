// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  createEffect,
  createMemo,
  createSelector,
  createSignal,
  DEFAULT_SPACING,
  FIT_PADDING_PX,
  For,
  layout,
  onCleanup,
  onMount,
  PanZoomSvg,
  Show,
  toSvgPathClosedRing,
  untrack,
} from "./deps.ts";
import type {
  Geometry,
  GraphModel,
  JSX,
  LayoutOptions,
  PanZoomApi,
} from "./deps.ts";
import type {
  VizGraphViewApi,
  VizGraphViewGroupInfo,
  VizGraphViewLaneInfo,
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
    groupOpacity: 1,
  });
  // undefined until the font gate resolves; a layout that measures waits
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
  // Unfolded groups only: a folded group IS its rep node (rendered through
  // nodeContent under the group id), so its rect ring would double-outline it.
  const groupIds = createMemo(() =>
    Object.keys(frame().geometry.groups).filter((id) =>
      !frame().geometry.groups[id].folded
    )
  );
  const laneIds = createMemo(() => Object.keys(frame().geometry.lanes));

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
  function resolvedOptions(
    model: GraphModel,
    m: DomMeasurer | undefined,
  ): LayoutOptions | undefined {
    const needsMeasure = model.nodes.some((n) => n.size === undefined) ||
      needsHeaderMeasure(model);
    const cap = p.maxNodeWidth;
    const w = fitWidth();
    const options: LayoutOptions = { ...p.layoutOptions };
    if (needsMeasure) {
      if (m === undefined) {
        return undefined;
      }
      // The probe wrapper is the view's: a shrink-to-fit block, so the
      // content element lays out in the same block formatting context it
      // renders in (.ui-vizgraph-node), at the width it will be given.
      options.measureNode = (id, maxWidth) =>
        m.measureElement(
          () => (
            <div class="ui-vizgraph-node-probe">{content(probeInfo(id))}</div>
          ),
          cap === undefined ? maxWidth : Math.min(maxWidth, cap),
        );
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
    const m = measurer();
    const options = resolvedOptions(model, m);
    if (options === undefined) {
      return;
    }
    const current = untrack(frame).geometry;
    if (Object.keys(current.nodes).length === 0) {
      const geometry = layoutModel(model, options, m);
      setFrame({ geometry, opacities: undefined, groupOpacity: 1 });
      setContentBounds(geometry.bounds);
      return;
    }
    const next = layoutModel(model, { ...options, prior: current }, m);
    runTransition(current, next, durationMs);
    setContentBounds(next.bounds);
  });

  function measuredGroups(model: GraphModel): boolean {
    return p.groupContent !== undefined &&
      (model.groups ?? []).some((g) =>
        g.label === undefined && g.folded !== true
      );
  }

  function measuredLanes(model: GraphModel): boolean {
    return p.laneContent !== undefined &&
      (model.lanes ?? []).some((l) => l.label === undefined);
  }

  function needsHeaderMeasure(model: GraphModel): boolean {
    return measuredGroups(model) || measuredLanes(model);
  }

  // Group and lane headers are measured like nodes but BEFORE layout
  // (GroupIn.label / LaneIn.label are data the engine reserves a row for):
  // pass 1 lays the model out as given (unsized headers absent), which
  // yields every group's first-layer strip width and every lane's natural
  // width; pass 2 measures each header wrapped at that width and lays out
  // again, so the reserved row always matches the rendered height and a
  // header never widens its lane. Header width never feeds layout, so the
  // widths of pass 2 equal pass 1's: exactly one extra layout,
  // deterministic.
  function layoutModel(
    model: GraphModel,
    options: LayoutOptions,
    m: DomMeasurer | undefined,
  ): Geometry {
    if (!needsHeaderMeasure(model) || m === undefined) {
      return layout(model, options);
    }
    const provisional = layout(model, options);
    const stripWidths = firstLayerStripWidths(model, provisional);
    const pad = options.spacing?.groupPad ?? DEFAULT_SPACING.groupPad;
    const measureGroup = measuredGroups(model)
      ? (id: string) =>
        m.measureElement(
          () => (
            <div class="ui-vizgraph-group-probe">
              {groupBody(probeGroupInfo(id))}
            </div>
          ),
          stripWidths.get(id) ?? Number.POSITIVE_INFINITY,
        )
      : undefined;
    const measureLane = measuredLanes(model)
      ? (id: string) => {
        const lane = provisional.lanes[id];
        return m.measureElement(
          () => (
            <div class="ui-vizgraph-lane-probe">
              {laneBody(probeLaneInfo(id))}
            </div>
          ),
          lane === undefined
            ? Number.POSITIVE_INFINITY
            : Math.max(0, lane.w - 2 * pad),
        );
      }
      : undefined;
    return layout(withHeaderSizes(model, measureGroup, measureLane), options);
  }

  function runTransition(
    from: Geometry,
    to: Geometry,
    durationMs: number,
  ): void {
    const version = ++transitionVersion;
    if (durationMs <= 0) {
      setFrame({ geometry: to, opacities: undefined, groupOpacity: 1 });
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
    // Container = the host, so measured content inherits the same CSS
    // context the foreignObject node divs render in (the strut rule —
    // decision log; CSS inherits into foreignObject normally). Always
    // created: any model may carry unsized nodes, and the probe renders the
    // same content element (the consumer's or the default) the body does.
    const m = createDomMeasurer({
      fonts: p.measureFonts,
      container: hostEl,
    });
    m.ready.then(() => setMeasurer(m));
    onCleanup(() => m.dispose());

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

  // Measurement-time info: no geometry yet, never selected (selection is an
  // outline with no layout effect, so measuring unselected is exact).
  function probeInfo(id: string): VizGraphViewNodeInfo {
    return { id, geom: undefined, selected: false };
  }

  // ONE content element for both duties — probe and node body. Presence of
  // nodeContent is read once (a function prop is static in Solid).
  function content(info: VizGraphViewNodeInfo): JSX.Element {
    const nodeContent = p.nodeContent;
    return nodeContent === undefined
      ? <div class="ui-vizgraph-node-default">{info.id}</div>
      : nodeContent(info);
  }

  function groupInfo(id: string): VizGraphViewGroupInfo {
    return {
      id,
      get geom() {
        return frame().geometry.groups[id];
      },
    };
  }

  function probeGroupInfo(id: string): VizGraphViewGroupInfo {
    return { id, geom: undefined };
  }

  // ONE header element for both duties; without groupContent the default
  // header shows the id in whatever row the model's label size reserved.
  function groupBody(info: VizGraphViewGroupInfo): JSX.Element {
    const groupContent = p.groupContent;
    return groupContent === undefined
      ? <div class="ui-vizgraph-group-header-default">{info.id}</div>
      : groupContent(info);
  }

  function laneInfo(id: string): VizGraphViewLaneInfo {
    return {
      id,
      get geom() {
        return frame().geometry.lanes[id];
      },
    };
  }

  function probeLaneInfo(id: string): VizGraphViewLaneInfo {
    return { id, geom: undefined };
  }

  function laneBody(info: VizGraphViewLaneInfo): JSX.Element {
    const laneContent = p.laneContent;
    return laneContent === undefined
      ? <div class="ui-vizgraph-lane-header-default">{info.id}</div>
      : laneContent(info);
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
        <g
          class="ui-vizgraph-lanes"
          opacity={frame().groupOpacity}
          style={{ "pointer-events": "none" }}
        >
          <For each={laneIds()}>
            {(id) => (
              <g>
                <rect
                  class="ui-vizgraph-lane"
                  x={frame().geometry.lanes[id].x}
                  y={frame().geometry.lanes[id].y}
                  width={frame().geometry.lanes[id].w}
                  height={frame().geometry.lanes[id].h}
                />
                <Show when={frame().geometry.lanes[id].header.h > 0}>
                  <foreignObject
                    x={frame().geometry.lanes[id].header.x}
                    y={frame().geometry.lanes[id].header.y}
                    width={frame().geometry.lanes[id].header.w}
                    height={frame().geometry.lanes[id].header.h}
                    style={{ overflow: "visible" }}
                  >
                    <div class="ui-vizgraph-lane-header">
                      {laneBody(laneInfo(id))}
                    </div>
                  </foreignObject>
                </Show>
              </g>
            )}
          </For>
        </g>
        <g
          class="ui-vizgraph-groups"
          opacity={frame().groupOpacity}
          style={{ "pointer-events": "none" }}
        >
          <For each={groupIds()}>
            {(id) => (
              <g>
                <For each={frame().geometry.groups[id].outline}>
                  {(ring) => (
                    <path
                      class="ui-vizgraph-group-outline"
                      d={toSvgPathClosedRing(ring)}
                    />
                  )}
                </For>
                <Show when={frame().geometry.groups[id].header.h > 0}>
                  <foreignObject
                    x={frame().geometry.groups[id].header.x}
                    y={frame().geometry.groups[id].header.y}
                    width={frame().geometry.groups[id].header.w}
                    height={frame().geometry.groups[id].header.h}
                    style={{ overflow: "visible" }}
                  >
                    <div class="ui-vizgraph-group-header">
                      {groupBody(groupInfo(id))}
                    </div>
                  </foreignObject>
                </Show>
              </g>
            )}
          </For>
        </g>
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
                {content(nodeInfo(id))}
              </div>
            </foreignObject>
          )}
        </For>
      </PanZoomSvg>
    </div>
  );
}

type MeasureHeader = (id: string) => { w: number; h: number };

// Injects measured header sizes for the kinds that are measured (an absent
// measurer leaves that kind exactly as the model gave it).
function withHeaderSizes(
  model: GraphModel,
  measureGroup: MeasureHeader | undefined,
  measureLane: MeasureHeader | undefined,
): GraphModel {
  return {
    ...model,
    groups: measureGroup === undefined ? model.groups : (model.groups ?? [])
      .map((g) =>
        g.label === undefined && g.folded !== true
          ? { ...g, label: measureGroup(g.id) }
          : g
      ),
    lanes: measureLane === undefined ? model.lanes : (model.lanes ?? []).map(
      (l) => l.label === undefined ? { ...l, label: measureLane(l.id) } : l,
    ),
  };
}

// The widest member in each group's first (minimum) layer, members collected
// through the nesting chain (a node belongs to its group and every ancestor).
function firstLayerStripWidths(
  model: GraphModel,
  geometry: Geometry,
): Map<string, number> {
  const parentById = new Map(
    (model.groups ?? []).map((g) => [g.id, g.parentId]),
  );
  const firstLayer = new Map<string, number>();
  const widths = new Map<string, number>();
  for (const node of model.nodes) {
    const geom = geometry.nodes[node.id];
    if (geom === undefined) {
      continue;
    }
    const seen = new Set<string>();
    let gid = node.groupId;
    while (gid !== undefined && parentById.has(gid) && !seen.has(gid)) {
      seen.add(gid);
      const layer = firstLayer.get(gid);
      if (layer === undefined || geom.layer < layer) {
        firstLayer.set(gid, geom.layer);
        widths.set(gid, geom.w);
      } else if (geom.layer === layer) {
        widths.set(gid, Math.max(widths.get(gid)!, geom.w));
      }
      gid = parentById.get(gid);
    }
  }
  return widths;
}
