// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  createEffect,
  createSignal,
  type JSX,
  onCleanup,
  onMount,
  Show,
} from "solid-js";
import {
  loadFontsWithTimeout,
  releaseCanvasGPUMemory,
  trackCanvas,
  untrackCanvas,
} from "../deps.ts";
import type { FigureInputs, SizingMode } from "../deps.ts";
import {
  CanvasRenderContext,
  CustomFigureStyle,
  FigureRenderer,
  getStage2Sizing,
  RectCoordsDims,
} from "../deps.ts";

type Props = {
  chartInputs: FigureInputs;
  height: "flex" | "ideal" | number;
  // "reflow" (default): lay out at the container width (1 DU = 1 CSS px).
  // "zoom": lay out at the reference frame and scale to fit.
  sizing?: SizingMode;
  canvasElementId?: string;
  // Sharpness only (Stage 2). 1 = native-crisp on screen. Never changes layout.
  resolution?: number;
  // Called after each render with whether shrink-to-fit hit the floor and the
  // content still overflows.
  onCramped?: (cramped: boolean) => void;
  renderError?: (err: string) => JSX.Element;
};

export function ChartHolder(p: Props) {
  let div!: HTMLDivElement;
  let canvas!: HTMLCanvasElement;
  let resizeTimer: ReturnType<typeof setTimeout> | undefined;
  let animationFrameId: number | undefined;
  let canvasTrackingId: string | undefined;

  const [err, setErr] = createSignal<string>("");
  const [fontsLoaded, setFontsLoaded] = createSignal(false);

  const fontKey = () => {
    const style = new CustomFigureStyle(p.chartInputs?.style);
    return style
      .getFontsToRegister()
      .map((f) => `${f.fontFamily}-${f.weight}-${f.italic}`)
      .join(",");
  };

  let fontLoadVersion = 0;

  createEffect(() => {
    const _key = fontKey();
    const style = new CustomFigureStyle(p.chartInputs?.style);
    const fonts = style.getFontsToRegister();

    const thisVersion = ++fontLoadVersion;
    setFontsLoaded(false);

    loadFontsWithTimeout(fonts).then(() => {
      if (thisVersion === fontLoadVersion) {
        setFontsLoaded(true);
      }
    });
  });

  // Schedules a render on the next animation frame, cancelling any pending one.
  function scheduleRender(parentDomW: number, parentDomH: number) {
    if (animationFrameId !== undefined) {
      cancelAnimationFrame(animationFrameId);
    }
    animationFrameId = requestAnimationFrame(() => {
      animationFrameId = undefined;
      renderChart(parentDomW, parentDomH);
    });
  }

  function renderChart(parentDomW: number, parentDomH: number) {
    // R1 guard: a 0-width container (hidden tab, collapsed flex, pre-layout)
    // would make devicePxPerDu = 0/0 = NaN → setTransform(NaN,…) → blank canvas.
    // Bail and wait for the next resize tick.
    if (parentDomW === 0) {
      return;
    }

    try {
      setErr("");
      const sizing: SizingMode = p.sizing ?? "reflow";
      const resolution = p.resolution ?? 1;
      const dpr = globalThis.devicePixelRatio || 1;

      const { frameWidthDu: frameW, backingWidthPx: backingW, devicePxPerDu } =
        getStage2Sizing({
          sizing,
          displayedWidthPx: parentDomW,
          devicePixelRatio: dpr,
          resolution,
        });

      const ctx = canvas.getContext("2d", { willReadFrequently: false })!;

      // Height: "ideal" measures the figure; "flex" fills the container; a number
      // is a fixed CSS-px height. frameH/backingH are derived from devicePxPerDu.
      let frameH: number;
      let backingH: number;
      if (p.height === "ideal") {
        ctx.setTransform(devicePxPerDu, 0, 0, devicePxPerDu, 0, 0);
        frameH = FigureRenderer.getIdealHeight(
          new CanvasRenderContext(ctx),
          frameW,
          p.chartInputs,
        ).idealH;
        backingH = Math.round(frameH * devicePxPerDu);
      } else {
        const domH = p.height === "flex" ? parentDomH : p.height;
        backingH = Math.round(domH * dpr * resolution);
        frameH = backingH / devicePxPerDu;
      }

      // Assigning width/height resets the 2D transform to identity — so size
      // FIRST, then setTransform. The guards realloc only on a real change.
      if (canvas.width !== backingW) {
        canvas.width = backingW;
      }
      if (canvas.height !== backingH) {
        canvas.height = backingH;
      }

      // Absolute transform → idempotent every frame, double-application impossible.
      ctx.setTransform(devicePxPerDu, 0, 0, devicePxPerDu, 0, 0);
      ctx.clearRect(0, 0, frameW, frameH);

      const rc = new CanvasRenderContext(ctx);
      const rcd = new RectCoordsDims([0, 0, frameW, frameH]);
      const measured = FigureRenderer.measure(rc, rcd, p.chartInputs);
      p.onCramped?.(measured.cramped ?? false);
      FigureRenderer.render(rc, measured);
    } catch (e) {
      console.error("ChartHolder render error:", e);
      const errorMessage = e instanceof Error ? e.message : String(e);
      setErr("Bad chart config: " + errorMessage);
    }
  }

  createEffect(() => {
    // Track the inputs and the sizing props so a change to any of them
    // re-renders even without a resize.
    const loaded = fontsLoaded();
    const inputs = p.chartInputs;
    const _height = p.height;
    const _sizing = p.sizing;
    const _resolution = p.resolution;
    if (loaded && inputs) {
      const rect = div.getBoundingClientRect();
      scheduleRender(rect.width, rect.height);
    }
  });

  onMount(() => {
    if (canvas) {
      canvasTrackingId = trackCanvas(canvas, "ChartHolder");
    }

    const observer = new ResizeObserver((entries) => {
      if (resizeTimer !== undefined) {
        clearTimeout(resizeTimer);
      }
      // Debounce resize updates
      resizeTimer = setTimeout(() => {
        for (const entry of entries) {
          if (entry.contentBoxSize && p.chartInputs && fontsLoaded()) {
            const parentDomW = entry.contentBoxSize[0].inlineSize;
            const parentDomH = entry.contentBoxSize[0].blockSize;
            scheduleRender(parentDomW, parentDomH);
          }
        }
      }, 10);
    });
    observer.observe(div);

    onCleanup(() => {
      observer.disconnect();
      if (resizeTimer !== undefined) {
        clearTimeout(resizeTimer);
      }
      if (animationFrameId !== undefined) {
        cancelAnimationFrame(animationFrameId);
      }
    });
  });

  onCleanup(() => {
    if (resizeTimer !== undefined) {
      clearTimeout(resizeTimer);
    }
    if (animationFrameId !== undefined) {
      cancelAnimationFrame(animationFrameId);
    }
    if (canvasTrackingId) {
      untrackCanvas(canvasTrackingId);
    }
    if (canvas) {
      releaseCanvasGPUMemory(canvas);
    }
  });

  return (
    <div
      ref={div!}
      class="relative w-full data-[flexToContainer=true]:h-full data-[flexToContainer=true]:overflow-hidden"
      data-flexToContainer={p.height === "flex"}
    >
      <Show when={err()}>
        {p.renderError
          ? (
            p.renderError(err())
          )
          : (
            <div class="ui-pad text-danger pointer-events-none absolute text-xs">
              {err()}
            </div>
          )}
      </Show>
      <canvas ref={canvas!} id={p.canvasElementId} class="w-full" />
    </div>
  );
}
