// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { createEffect, createSignal, onCleanup, untrack } from "../deps.ts";
import type { Pt, Rect } from "../deps.ts";
import type { Camera, PanZoomApi } from "../types.ts";

const MIN_SCALE = 0.1;
const MAX_SCALE = 4;
const MAX_FIT_SCALE = 1;
// Exported: _307_vizgraph_view lays content out to the same padded budget the
// camera fits into, so a width-fitted layout lands at exactly scale 1.
export const FIT_PADDING_PX = 40;
// van Wijk & Nuij glide: ρ trades zoom against pan (√2 = their recommended
// compromise); duration scales with path length S (ρ-units) so short refits
// stay quick and long jumps get time to breathe.
const RHO = Math.SQRT2;
const GLIDE_MS_PER_UNIT = 500;
const GLIDE_MIN_MS = 250;
const GLIDE_MAX_MS = 1200;
const ZOOM_INTENSITY = 0.0015;
const WHEEL_LINE_PX = 33; // ≈ one Chrome-notch (100px) per 3-line notch
const DRAG_THRESHOLD_PX = 4;

type Size = { w: number; h: number };

// Any host viewport: HTMLElement and SVGSVGElement both satisfy this, and the
// GlobalEventHandlers side keeps addEventListener's typed overloads (a plain
// union degrades them to the untyped EventListener signature).
export type ViewportElement = Element & GlobalEventHandlers;

export type CameraCore = {
  camera: () => Camera;
  viewportSize: () => Size;
  // The visible region of content space — the canvas host's view and the SVG
  // host's viewBox are this same rect. undefined while the viewport has no
  // size. Reads are tracked; untrack where coalescing matters.
  visibleRect: () => Rect | undefined;
  attach: (viewport: ViewportElement) => void;
  api: PanZoomApi;
};

// The camera: pose + gestures + follow policy. A settled-bounds CHANGE always
// refits and re-arms following (new content: the old framing was about the
// old content); a gesture or panTo holds the frame only between changes —
// resize-tracking stays off until a bounds change or fit() re-arms. Content
// replacing an empty canvas snap-fits; later changes glide.
export function createCamera(
  bounds: () => Rect | undefined,
  onGestureClick?: (contentPt: Pt, e: PointerEvent) => void,
): CameraCore {
  const [camera, setCamera] = createSignal<Camera>({ x: 0, y: 0, scale: 1 });
  const [viewportSize, setViewportSize] = createSignal<Size>({ w: 0, h: 0 });
  let viewportEl: ViewportElement | undefined;
  let following = true;
  let fitted = false;
  let lastFitBounds: Rect | undefined;
  let animVersion = 0;
  let animRaf = 0;

  function fitCamera(b: Rect, size: Size): Camera {
    const availW = Math.max(1, size.w - FIT_PADDING_PX * 2);
    const availH = Math.max(1, size.h - FIT_PADDING_PX * 2);
    const scale = clamp(
      Math.min(availW / b.w, availH / b.h, MAX_FIT_SCALE),
      MIN_SCALE,
      MAX_SCALE,
    );
    return {
      x: (size.w - b.w * scale) / 2 - b.x * scale,
      y: (size.h - b.h * scale) / 2 - b.y * scale,
      scale,
    };
  }

  // Follow policy. Hosts must pass SETTLED content bounds, not per-frame
  // animated bounds — every change restarts the glide.
  createEffect(() => {
    const b = bounds();
    const size = viewportSize();
    if (b === undefined || b.w <= 0 || b.h <= 0) {
      fitted = false;
      return;
    }
    if (size.w <= 0 || size.h <= 0) {
      // Hidden or unmounted viewport: retried when the observer reports size.
      return;
    }
    if (!fitted) {
      fitted = true;
      following = true;
      lastFitBounds = b;
      cancelAnimation();
      setCamera(fitCamera(b, size));
      return;
    }
    const boundsChanged = lastFitBounds === undefined ||
      !sameRect(b, lastFitBounds);
    lastFitBounds = b;
    if (boundsChanged) {
      // New content: the old framing was about the old content. Refit and
      // re-arm, gesture or not.
      following = true;
      animateTo(fitCamera(b, size));
    } else if (following) {
      // Viewport resize: track instantly (resizes are continuous).
      cancelAnimation();
      setCamera(fitCamera(b, size));
    }
  });

  function cancelAnimation(): void {
    animVersion++;
    cancelAnimationFrame(animRaf);
  }

  // The glide follows van Wijk & Nuij's optimal zoom-pan path ("Smooth and
  // efficient zooming and panning", InfoVis 2003), parameterized in the
  // visible rect: content-space center (cx, cy) and width w = size.w/scale.
  // Pan and zoom are COUPLED along the path so perceived screen velocity
  // stays even — a long jump zooms out, flies over, and dives back in. A
  // straight-line lerp (center linear, scale in log space) keeps the center
  // path straight but bunches screen motion mid-flight and reads as a swoop.
  // Scale may transiently pass MIN/MAX during the flyover; only gestures
  // clamp. Callers guarantee a nonzero viewport size.
  function animateTo(target: Camera): void {
    const version = ++animVersion;
    const start = untrack(camera);
    const size = untrack(viewportSize);
    const w0 = size.w / start.scale;
    const w1 = size.w / target.scale;
    const cx0 = (size.w / 2 - start.x) / start.scale;
    const cy0 = (size.h / 2 - start.y) / start.scale;
    const dx = (size.w / 2 - target.x) / target.scale - cx0;
    const dy = (size.h / 2 - target.y) / target.scale - cy0;
    const d = Math.hypot(dx, dy);
    // The path as (u, w): u ∈ [0, 1] along the line between centers.
    let S: number;
    let pathAt: (s: number) => { u: number; w: number };
    if (d < 1e-6 * Math.max(w0, w1)) {
      // Pure zoom: the general form divides by d.
      const k = w1 < w0 ? -1 : 1;
      S = Math.abs(Math.log(w1 / w0)) / RHO;
      pathAt = (s) => ({ u: 0, w: w0 * Math.exp(k * RHO * s) });
    } else {
      const rho2 = RHO * RHO;
      const b0 = (w1 * w1 - w0 * w0 + rho2 * rho2 * d * d) /
        (2 * w0 * rho2 * d);
      const b1 = (w1 * w1 - w0 * w0 - rho2 * rho2 * d * d) /
        (2 * w1 * rho2 * d);
      const r0 = Math.log(Math.sqrt(b0 * b0 + 1) - b0);
      const r1 = Math.log(Math.sqrt(b1 * b1 + 1) - b1);
      const coshR0 = Math.cosh(r0);
      const sinhR0 = Math.sinh(r0);
      S = (r1 - r0) / RHO;
      pathAt = (s) => ({
        u: (w0 / (rho2 * d)) * (coshR0 * Math.tanh(RHO * s + r0) - sinhR0),
        w: (w0 * coshR0) / Math.cosh(RHO * s + r0),
      });
    }
    if (S <= 0) {
      setCamera(target);
      return;
    }
    const durationMs = clamp(S * GLIDE_MS_PER_UNIT, GLIDE_MIN_MS, GLIDE_MAX_MS);
    const startTime = performance.now();
    function step(now: number): void {
      if (version !== animVersion) {
        return;
      }
      const t = Math.min(1, (now - startTime) / durationMs);
      if (t === 1) {
        // Land exactly on the target pose, not its floating-point neighbor.
        setCamera(target);
        return;
      }
      const p = pathAt(easeInOut(t) * S);
      const scale = size.w / p.w;
      setCamera({
        x: size.w / 2 - (cx0 + p.u * dx) * scale,
        y: size.h / 2 - (cy0 + p.u * dy) * scale,
        scale,
      });
      animRaf = requestAnimationFrame(step);
    }
    animRaf = requestAnimationFrame(step);
  }

  // The single apply-point: every gesture becomes a delta applied here, and
  // only here — clamped, animation cancelled, framing authority taken.
  function applyGesture(pan: Pt, scaleFactor: number, around: Pt): void {
    cancelAnimation();
    following = false;
    setCamera((prev) => {
      let { x, y, scale } = prev;
      if (scaleFactor !== 1) {
        const next = clamp(scale * scaleFactor, MIN_SCALE, MAX_SCALE);
        const f = next / scale;
        x = around.x - (around.x - x) * f;
        y = around.y - (around.y - y) * f;
        scale = next;
      }
      return { x: x + pan.x, y: y + pan.y, scale };
    });
  }

  const pointers = new Map<number, Pt>();
  let downAt: Pt = { x: 0, y: 0 };
  let dragging = false;
  let suppressClick = false;
  let hadSecondPointer = false;

  function viewportPt(clientPt: Pt): Pt {
    const r = viewportEl!.getBoundingClientRect();
    return { x: clientPt.x - r.left, y: clientPt.y - r.top };
  }

  function handlePointerDown(e: PointerEvent): void {
    if (e.pointerType === "mouse" && e.button !== 0) {
      return;
    }
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 1) {
      dragging = false;
      suppressClick = false;
      hadSecondPointer = false;
      downAt = { x: e.clientX, y: e.clientY };
    } else if (pointers.size === 2) {
      hadSecondPointer = true;
    }
  }

  // Capture is taken only once the gesture is real (threshold crossed, or a
  // second pointer lands), never on pointerdown: a captured pointerup targets
  // the viewport, and the derived click's target — the common ancestor of the
  // pointerdown and pointerup targets — then becomes the viewport too, which
  // silently kills native clicks on children (verified in Chromium). Until
  // then, moves over children reach the viewport by bubbling; touch needs no
  // explicit capture at all (implicit capture delivers through bubbling).
  // Ids come from the event being handled or its recorded pinch partner, so
  // they are provably active. The animation dies here — when a gesture takes
  // framing authority, not on contact.
  function startDrag(ids: number[]): void {
    dragging = true;
    cancelAnimation();
    for (const id of ids) {
      viewportEl!.setPointerCapture(id);
    }
  }

  function abandonPointer(id: number): void {
    if (pointers.delete(id) && pointers.size === 0) {
      dragging = false;
    }
  }

  function handlePointerMove(e: PointerEvent): void {
    const prev = pointers.get(e.pointerId);
    if (prev === undefined) {
      return;
    }
    if (e.buttons === 0) {
      // A hoverable pointer whose release we never heard (released outside
      // the viewport before capture). Touch can't reach here: contact implies
      // buttons !== 0, and implicit capture delivers its pointerup regardless.
      abandonPointer(e.pointerId);
      return;
    }
    const now = { x: e.clientX, y: e.clientY };
    if (pointers.size === 1) {
      if (!dragging) {
        if (
          Math.hypot(now.x - downAt.x, now.y - downAt.y) <= DRAG_THRESHOLD_PX
        ) {
          // Stored position stays at downAt: crossing the threshold applies
          // the full accumulated delta, so no motion is lost.
          return;
        }
        startDrag([e.pointerId]);
      }
      applyGesture({ x: now.x - prev.x, y: now.y - prev.y }, 1, now);
    } else if (pointers.size === 2) {
      const [otherId, other] = otherPointer(e.pointerId);
      if (!dragging) {
        startDrag([e.pointerId, otherId]);
      }
      const prevDist = Math.hypot(prev.x - other.x, prev.y - other.y);
      const nowDist = Math.hypot(now.x - other.x, now.y - other.y);
      const prevMid = midpoint(prev, other);
      const nowMid = midpoint(now, other);
      applyGesture(
        { x: nowMid.x - prevMid.x, y: nowMid.y - prevMid.y },
        prevDist > 0 ? nowDist / prevDist : 1,
        viewportPt(nowMid),
      );
    }
    pointers.set(e.pointerId, now);
  }

  function otherPointer(pointerId: number): [number, Pt] {
    for (const entry of pointers) {
      if (entry[0] !== pointerId) {
        return entry;
      }
    }
    throw new Error("panzoom: no other pointer");
  }

  function handlePointerLeave(e: PointerEvent): void {
    // Pre-drag only: once captured, boundary events stop firing for this
    // pointer, and a sub-threshold press that leaves the viewport can never
    // become a drag anyway (moves outside don't reach this listener).
    if (!dragging) {
      abandonPointer(e.pointerId);
    }
  }

  function handlePointerUp(e: PointerEvent): void {
    if (!pointers.delete(e.pointerId)) {
      return;
    }
    if (viewportEl!.hasPointerCapture(e.pointerId)) {
      viewportEl!.releasePointerCapture(e.pointerId);
    }
    if (pointers.size > 0) {
      return;
    }
    if (dragging) {
      suppressClick = true;
    } else if (!hadSecondPointer && onGestureClick !== undefined) {
      onGestureClick(toContent(viewportPt({ x: e.clientX, y: e.clientY })), e);
    }
    dragging = false;
  }

  function handlePointerCancel(e: PointerEvent): void {
    if (!pointers.delete(e.pointerId)) {
      return;
    }
    if (viewportEl!.hasPointerCapture(e.pointerId)) {
      viewportEl!.releasePointerCapture(e.pointerId);
    }
    if (pointers.size === 0) {
      dragging = false;
    }
    // No onGestureClick (a cancelled gesture is not a click) and no
    // suppressClick (no click follows a cancel; arming would eat the next
    // keyboard-synthesized click).
  }

  function handleWheel(e: WheelEvent): void {
    e.preventDefault();
    const dy = e.deltaMode === WheelEvent.DOM_DELTA_LINE
      ? e.deltaY * WHEEL_LINE_PX
      : e.deltaMode === WheelEvent.DOM_DELTA_PAGE
      ? e.deltaY * untrack(viewportSize).h
      : e.deltaY;
    applyGesture(
      { x: 0, y: 0 },
      Math.exp(-dy * ZOOM_INTENSITY),
      viewportPt({ x: e.clientX, y: e.clientY }),
    );
  }

  // A drag must not end as a click: suppress it before host handlers see it.
  function handleClickCapture(e: MouseEvent): void {
    if (suppressClick) {
      suppressClick = false;
      e.stopPropagation();
      e.preventDefault();
    }
  }

  function visibleRect(): Rect | undefined {
    const c = camera();
    const size = viewportSize();
    if (size.w <= 0 || size.h <= 0) {
      return undefined;
    }
    return {
      x: -c.x / c.scale,
      y: -c.y / c.scale,
      w: size.w / c.scale,
      h: size.h / c.scale,
    };
  }

  function attach(el: ViewportElement): void {
    viewportEl = el;
    const observer = new ResizeObserver(() => {
      setViewportSize({ w: el.clientWidth, h: el.clientHeight });
    });
    observer.observe(el);
    setViewportSize({ w: el.clientWidth, h: el.clientHeight });
    el.addEventListener("pointerdown", handlePointerDown);
    el.addEventListener("pointermove", handlePointerMove);
    el.addEventListener("pointerup", handlePointerUp);
    el.addEventListener("pointercancel", handlePointerCancel);
    el.addEventListener("pointerleave", handlePointerLeave);
    el.addEventListener("wheel", handleWheel, { passive: false });
    el.addEventListener("click", handleClickCapture, { capture: true });
    onCleanup(() => {
      observer.disconnect();
      cancelAnimation();
      el.removeEventListener("pointerdown", handlePointerDown);
      el.removeEventListener("pointermove", handlePointerMove);
      el.removeEventListener("pointerup", handlePointerUp);
      el.removeEventListener("pointercancel", handlePointerCancel);
      el.removeEventListener("pointerleave", handlePointerLeave);
      el.removeEventListener("wheel", handleWheel);
      el.removeEventListener("click", handleClickCapture, { capture: true });
    });
  }

  function toContent(screenPt: Pt): Pt {
    const c = untrack(camera);
    return { x: (screenPt.x - c.x) / c.scale, y: (screenPt.y - c.y) / c.scale };
  }

  function fit(): void {
    const b = untrack(bounds);
    const size = untrack(viewportSize);
    if (b === undefined || b.w <= 0 || b.h <= 0 || size.w <= 0 || size.h <= 0) {
      return;
    }
    following = true;
    lastFitBounds = b;
    animateTo(fitCamera(b, size));
  }

  function panTo(contentPt: Pt): void {
    const c = untrack(camera);
    const size = untrack(viewportSize);
    if (size.w <= 0 || size.h <= 0) {
      return;
    }
    following = false;
    animateTo({
      x: size.w / 2 - contentPt.x * c.scale,
      y: size.h / 2 - contentPt.y * c.scale,
      scale: c.scale,
    });
  }

  return {
    camera,
    viewportSize,
    visibleRect,
    attach,
    api: { fit, panTo, toContent },
  };
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) * (1 - t);
}

function sameRect(a: Rect, b: Rect): boolean {
  return a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;
}

function midpoint(a: Pt, b: Pt): Pt {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}
