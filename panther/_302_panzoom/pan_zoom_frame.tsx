// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { onMount } from "./deps.ts";
import type { JSX, Rect } from "./deps.ts";
import type { PanZoomApi } from "./types.ts";
import { createCamera } from "./_internal/camera.ts";

export type PanZoomFrameProps = {
  bounds: Rect | undefined;
  api?: (api: PanZoomApi) => void;
  class?: string;
  children: JSX.Element;
};

// Retained-mode camera: children are the scene, the browser renders it. A
// camera change touches one transform — the scene is never re-rendered, so
// native clicks, CSS hover, and focus inside children keep working (drags
// never end as clicks; the camera suppresses those).
export function PanZoomFrame(p: PanZoomFrameProps) {
  const cam = createCamera(() => p.bounds);
  let viewportEl!: HTMLDivElement;
  // Body, not onMount — same rationale as PanZoomSvg: parents' onMount runs
  // before children's, and the api is safe to hand out pre-attach.
  p.api?.(cam.api);
  onMount(() => {
    cam.attach(viewportEl);
  });
  return (
    <div
      ref={viewportEl!}
      class={p.class}
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        overflow: "hidden",
        "touch-action": "none",
        "user-select": "none",
      }}
    >
      <div
        style={{
          position: "absolute",
          left: "0",
          top: "0",
          "transform-origin": "0 0",
          transform:
            `translate(${cam.camera().x}px, ${cam.camera().y}px) scale(${cam.camera().scale})`,
        }}
      >
        {p.children}
      </div>
    </div>
  );
}
