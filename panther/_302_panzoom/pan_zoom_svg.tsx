// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { onMount } from "./deps.ts";
import type { JSX, Rect } from "./deps.ts";
import type { PanZoomApi } from "./types.ts";
import { createCamera } from "./_internal/camera.ts";

export type PanZoomSvgProps = {
  bounds: Rect | undefined;
  api?: (api: PanZoomApi) => void;
  class?: string;
  children: JSX.Element;
};

// SVG-native camera: the pose IS the viewBox (the visible content rect).
// Zoom re-renders vector-crisp every frame — the capability an ancestor CSS
// transform cannot provide. Children are SVG elements in content (user-unit)
// coordinates; foreignObject makes HTML content a full citizen of this host.
// Native clicks on children work (drags never end as clicks; the camera
// suppresses those).
export function PanZoomSvg(p: PanZoomSvgProps) {
  const cam = createCamera(() => p.bounds);
  let svgEl!: SVGSVGElement;
  // api hands out in the component body, not onMount: a parent's own
  // body-registered onMount runs BEFORE children's (Solid user effects are
  // FIFO by creation), so an onMount-fired callback would arrive too late for
  // the parent to hand the api onward from its onMount. The api is pure
  // signal closures — safe pre-attach, every method no-ops at zero size.
  p.api?.(cam.api);
  onMount(() => {
    cam.attach(svgEl);
  });
  const viewBox = () => {
    const v = cam.visibleRect();
    return v === undefined ? "0 0 1 1" : `${v.x} ${v.y} ${v.w} ${v.h}`;
  };
  return (
    <svg
      ref={svgEl!}
      class={p.class}
      viewBox={viewBox()}
      preserveAspectRatio="none"
      style={{
        display: "block",
        width: "100%",
        height: "100%",
        "touch-action": "none",
        "user-select": "none",
      }}
    >
      {p.children}
    </svg>
  );
}
