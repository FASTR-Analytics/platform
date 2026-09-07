// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  createEffect,
  createSignal,
  onCleanup,
  onMount,
  untrack,
} from "./deps.ts";
import type { Pt, Rect } from "./deps.ts";
import type { CanvasView, PanZoomApi } from "./types.ts";
import { createCamera } from "./_internal/camera.ts";

export type PanZoomCanvasProps = {
  bounds: Rect | undefined;
  draw: (ctx: CanvasRenderingContext2D, view: CanvasView) => void;
  onClick?: (contentPt: Pt) => void;
  api?: (api: PanZoomApi) => void;
  class?: string;
};

// Immediate-mode camera: owns the <canvas> outright — backing store sized to
// viewport × devicePixelRatio, context pre-transformed so draw works in plain
// content coordinates, camera writes RAF-coalesced to at most one draw per
// frame. draw runs tracked: scene signals read inside it re-run the draw
// effect directly (batched within a tick, not RAF-coalesced). Paint only
// what intersects view.
export function PanZoomCanvas(p: PanZoomCanvasProps) {
  const cam = createCamera(() => p.bounds, (pt) => p.onClick?.(pt));
  let canvasEl!: HTMLCanvasElement;
  const [frameTick, setFrameTick] = createSignal(0);
  let framePending = false;
  let frameRaf = 0;

  function scheduleFrame(): void {
    if (framePending) {
      return;
    }
    framePending = true;
    frameRaf = requestAnimationFrame(() => {
      framePending = false;
      setFrameTick((t) => t + 1);
    });
  }

  // Body, not onMount — same rationale as PanZoomSvg: parents' onMount runs
  // before children's, and the api is safe to hand out pre-attach.
  p.api?.(cam.api);
  onMount(() => {
    cam.attach(canvasEl);
    const ctx = canvasEl.getContext("2d");
    if (ctx === null) {
      throw new Error("PanZoomCanvas: could not get 2d context");
    }
    // Redraw when devicePixelRatio changes (monitor move). One cleanup over
    // the current mq: re-arming registers no owner-bound cleanup of its own
    // (the change callback runs outside any reactive owner).
    let dprMq: MediaQueryList | undefined;
    const onDprChange = () => {
      scheduleFrame();
      watchDpr();
    };
    function watchDpr(): void {
      dprMq = matchMedia(`(resolution: ${globalThis.devicePixelRatio}dppx)`);
      dprMq.addEventListener("change", onDprChange, { once: true });
    }
    watchDpr();
    onCleanup(() => dprMq?.removeEventListener("change", onDprChange));
    createEffect(() => {
      cam.camera();
      cam.viewportSize();
      scheduleFrame();
    });
    createEffect(() => {
      frameTick();
      const c = untrack(cam.camera);
      const size = untrack(cam.viewportSize);
      const v = untrack(cam.visibleRect);
      if (v === undefined) {
        return;
      }
      const dpr = globalThis.devicePixelRatio || 1;
      const backingW = Math.round(size.w * dpr);
      const backingH = Math.round(size.h * dpr);
      if (canvasEl.width !== backingW) {
        canvasEl.width = backingW;
      }
      if (canvasEl.height !== backingH) {
        canvasEl.height = backingH;
      }
      // Clear the full backing store in device pixels: a content-space clear
      // leaves an uncleared right/bottom edge under fractional DPR rounding.
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
      ctx.setTransform(
        dpr * c.scale,
        0,
        0,
        dpr * c.scale,
        dpr * c.x,
        dpr * c.y,
      );
      const view: CanvasView = { ...v, scale: c.scale };
      p.draw(ctx, view);
    });
    onCleanup(() => cancelAnimationFrame(frameRaf));
  });

  return (
    <canvas
      ref={canvasEl!}
      class={p.class}
      style={{
        display: "block",
        width: "100%",
        height: "100%",
        "touch-action": "none",
        "user-select": "none",
      }}
    />
  );
}
