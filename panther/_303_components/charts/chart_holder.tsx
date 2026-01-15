// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  createEffect,
  createSignal,
  onCleanup,
  onMount,
  Setter,
  Show,
} from "solid-js";
import {
  fontsReady,
  loadFont,
  releaseCanvasGPUMemory,
  trackCanvas,
  untrackCanvas,
} from "../deps.ts";
import type { FigureInputs, TextRenderingOptions } from "../deps.ts";
import {
  _GLOBAL_CANVAS_PIXEL_WIDTH,
  CanvasRenderContext,
  CustomStyle,
  FigureRenderer,
  RectCoordsDims,
} from "../deps.ts";
import type { FontInfo } from "../deps.ts";

type Props = {
  chartInputs: FigureInputs;
  height: "flex" | "ideal" | number;
  noRescaleWithWidthChange?: boolean;
  canvasElementId?: string;
  textRenderingOptions?: TextRenderingOptions;
  scalePixelResolution?: number;
};

export function ChartHolder(p: Props) {
  let div!: HTMLDivElement;
  let canvas!: HTMLCanvasElement;
  let resizeTimer: ReturnType<typeof setTimeout> | undefined;
  let animationFrameId: number | undefined;
  let cachedContext: CanvasRenderingContext2D | undefined;
  let canvasTrackingId: string | undefined;
  let isScaleApplied = false;

  // Static scale value - never changes
  const scale = p.scalePixelResolution ?? 1;
  const fixedCanvasW = Math.round(_GLOBAL_CANVAS_PIXEL_WIDTH * scale);
  const unscaledW = _GLOBAL_CANVAS_PIXEL_WIDTH;

  const [err, setErr] = createSignal<string>("");

  createEffect(() => {
    fontsReady(); // Track the signal - will trigger re-render when fonts load
    const parentDomW = div.getBoundingClientRect().width;
    const parentDomH = div.getBoundingClientRect().height;
    updateChart(
      canvas,
      p.chartInputs,
      p.height,
      fixedCanvasW,
      unscaledW,
      parentDomW,
      parentDomH,
      setErr,
      p.noRescaleWithWidthChange,
      p.textRenderingOptions,
      animationFrameId,
      (id) => {
        animationFrameId = id;
      },
      cachedContext,
      (ctx) => {
        cachedContext = ctx;
      },
      scale,
      isScaleApplied,
      (applied) => {
        isScaleApplied = applied;
      },
    );
  });

  onMount(() => {
    // Track canvas for debugging
    if (canvas) {
      canvasTrackingId = trackCanvas(canvas, "ChartHolder");
    }

    // Preload fonts used by this figure
    if (p.chartInputs) {
      const style = new CustomStyle(p.chartInputs.style);
      const fonts = style.getFontsToRegister();
      fonts.forEach((fontInfo: FontInfo) => {
        loadFont(fontInfo.fontFamily);
      });

      // Also preload fonts from textRenderingOptions
      if (p.textRenderingOptions?.fallbackFonts) {
        p.textRenderingOptions.fallbackFonts.forEach((fontInfo) => {
          loadFont(fontInfo.fontFamily);
        });
      }
    }

    const observer = new ResizeObserver((entries) => {
      // Clear any pending resize timer
      if (resizeTimer !== undefined) {
        clearTimeout(resizeTimer);
      }

      // Debounce resize updates
      resizeTimer = setTimeout(() => {
        for (const entry of entries) {
          if (entry.contentBoxSize && p.chartInputs) {
            const parentDomW = entry.contentBoxSize[0].inlineSize;
            const parentDomH = entry.contentBoxSize[0].blockSize;
            updateChart(
              canvas,
              p.chartInputs,
              p.height,
              fixedCanvasW,
              unscaledW,
              parentDomW,
              parentDomH,
              setErr,
              p.noRescaleWithWidthChange,
              p.textRenderingOptions,
              animationFrameId,
              (id) => {
                animationFrameId = id;
              },
              cachedContext,
              (ctx) => {
                cachedContext = ctx;
              },
              scale,
              isScaleApplied,
              (applied) => {
                isScaleApplied = applied;
              },
            );
          }
        }
      }, 10); // Debounce resize events
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

  // Component cleanup
  onCleanup(() => {
    // Cancel any pending timers
    if (resizeTimer !== undefined) {
      clearTimeout(resizeTimer);
    }
    if (animationFrameId !== undefined) {
      cancelAnimationFrame(animationFrameId);
    }

    // Restore context state if scale was applied
    if (isScaleApplied && cachedContext) {
      cachedContext.restore();
    }

    // Untrack canvas from debugger
    if (canvasTrackingId) {
      untrackCanvas(canvasTrackingId);
    }

    // Release GPU memory
    if (canvas) {
      releaseCanvasGPUMemory(canvas);
    }

    // Clear cached context
    cachedContext = undefined;
  });

  return (
    <div
      ref={div!}
      class="relative w-full data-[flexToContainer=true]:h-full data-[flexToContainer=true]:overflow-hidden"
      data-flexToContainer={p.height === "flex"}
    >
      <Show when={err()}>
        <div class="ui-pad text-danger pointer-events-none absolute text-xs">
          {err()}
        </div>
      </Show>
      <canvas
        ref={canvas!}
        id={p.canvasElementId}
        class="w-full"
        width={fixedCanvasW}
        height={0}
      />
    </div>
  );
}

function updateChart(
  canvas: HTMLCanvasElement,
  chartInputs: FigureInputs,
  height: "flex" | "ideal" | number,
  fixedCanvasW: number,
  unscaledW: number,
  parentDomW: number,
  parentDomH: number,
  setErr: Setter<string>,
  noRescaleWithWidthChange: boolean | undefined,
  textRenderingOptions: TextRenderingOptions | undefined,
  currentFrameId?: number,
  setFrameId?: (id: number | undefined) => void,
  cachedContext?: CanvasRenderingContext2D,
  setCachedContext?: (ctx: CanvasRenderingContext2D) => void,
  scale?: number,
  isScaleApplied?: boolean,
  setScaleApplied?: (applied: boolean) => void,
) {
  // Cancel any pending animation frame
  if (currentFrameId !== undefined) {
    cancelAnimationFrame(currentFrameId);
  }

  const frameId = requestAnimationFrame(() => {
    // Clear the frame ID since we're executing
    if (setFrameId) setFrameId(undefined);
    if (parentDomW === 0) {
      return;
    }
    try {
      setErr(""); // Clear any previous errors
      const responsiveScale = noRescaleWithWidthChange
        ? undefined
        : unscaledW / parentDomW;
      if (height === "flex") {
        const domH = parentDomH;
        const scaledHeight = Math.round((fixedCanvasW * domH) / parentDomW);
        const dimensionsChanged = canvas.height !== scaledHeight;

        if (dimensionsChanged) {
          canvas.height = scaledHeight;
          // Need to restore old transform before getting new context
          if (isScaleApplied && cachedContext) {
            cachedContext.restore();
            if (setScaleApplied) setScaleApplied(false);
          }
          cachedContext = undefined;
        }

        let ctx = cachedContext;
        if (!ctx || dimensionsChanged) {
          ctx = canvas.getContext("2d", { willReadFrequently: false })!;
          if (setCachedContext) {
            setCachedContext(ctx);
          }
          // Apply scale transform to new context
          if (scale && scale !== 1) {
            ctx.save();
            ctx.scale(scale, scale);
            if (setScaleApplied) setScaleApplied(true);
          }
        }

        const rc = new CanvasRenderContext(ctx, textRenderingOptions);
        // Use unscaled dimensions since transform is applied
        const unscaledHeight = (unscaledW * domH) / parentDomW;

        // Always clear the canvas before rendering to avoid opacity buildup
        ctx.clearRect(0, 0, unscaledW, unscaledHeight);

        const rcd = new RectCoordsDims([0, 0, unscaledW, unscaledHeight]);
        FigureRenderer.measureAndRender(rc, rcd, chartInputs, responsiveScale);
        return;
      }
      if (height === "ideal") {
        // Get or reuse context for measuring
        let ctx = cachedContext;
        if (!ctx) {
          ctx = canvas.getContext("2d", { willReadFrequently: false })!;
          if (setCachedContext) {
            setCachedContext(ctx);
          }
          // Apply scale transform to new context
          if (scale && scale !== 1) {
            ctx.save();
            ctx.scale(scale, scale);
            if (setScaleApplied) setScaleApplied(true);
          }
        }

        const rc = new CanvasRenderContext(ctx, textRenderingOptions);
        const hFigure = FigureRenderer.getIdealHeight(
          rc,
          unscaledW,
          chartInputs,
          responsiveScale,
        );

        const scaledHeight = Math.round(hFigure * (scale || 1));
        if (scaledHeight !== canvas.height) {
          canvas.height = scaledHeight;
          // Need to restore old transform before getting new context
          if (isScaleApplied && cachedContext) {
            cachedContext.restore();
            if (setScaleApplied) setScaleApplied(false);
          }
          // Need new context after height change
          ctx = canvas.getContext("2d", { willReadFrequently: false })!;
          if (setCachedContext) {
            setCachedContext(ctx);
          }
          // Apply scale transform to new context
          if (scale && scale !== 1) {
            ctx.save();
            ctx.scale(scale, scale);
            if (setScaleApplied) setScaleApplied(true);
          }
        }

        // Always clear the canvas before rendering to avoid opacity buildup
        ctx.clearRect(0, 0, unscaledW, hFigure);

        const rcd = new RectCoordsDims([0, 0, unscaledW, hFigure]);
        FigureRenderer.measureAndRender(rc, rcd, chartInputs, responsiveScale);
        return;
      }
      const domH = height;
      const scaledHeight = Math.round((fixedCanvasW * domH) / parentDomW);
      const dimensionsChanged = canvas.height !== scaledHeight;

      if (dimensionsChanged) {
        canvas.height = scaledHeight;
        // Need to restore old transform before getting new context
        if (isScaleApplied && cachedContext) {
          cachedContext.restore();
          if (setScaleApplied) setScaleApplied(false);
        }
        cachedContext = undefined;
      }

      let ctx = cachedContext;
      if (!ctx || dimensionsChanged) {
        ctx = canvas.getContext("2d", { willReadFrequently: false })!;
        if (setCachedContext) {
          setCachedContext(ctx);
        }
        // Apply scale transform to new context
        if (scale && scale !== 1) {
          ctx.save();
          ctx.scale(scale, scale);
          if (setScaleApplied) setScaleApplied(true);
        }
      }

      const rc = new CanvasRenderContext(ctx, textRenderingOptions);
      // Use unscaled dimensions since transform is applied
      const unscaledHeight = (unscaledW * domH) / parentDomW;

      // Always clear the canvas before rendering to avoid opacity buildup
      ctx.clearRect(0, 0, unscaledW, unscaledHeight);

      const rcd = new RectCoordsDims([0, 0, unscaledW, unscaledHeight]);
      FigureRenderer.measureAndRender(rc, rcd, chartInputs, responsiveScale);
    } catch (e) {
      console.error("ChartHolder render error:", e);
      const errorMessage = e instanceof Error ? e.message : String(e);
      setErr("Bad chart config: " + errorMessage);
    }
  });

  // Store the frame ID for potential cancellation
  if (setFrameId) setFrameId(frameId);
}
