// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  createEffect,
  createSignal,
  Match,
  onCleanup,
  onMount,
  Setter,
  Show,
  Switch,
} from "solid-js";
import {
  fontsReady,
  loadFont,
  releaseCanvasGPUMemory,
  trackCanvas,
  untrackCanvas,
} from "../deps.ts";
import type {
  LayoutWarning,
  PageInputs,
  TextRenderingOptions,
} from "../deps.ts";
import {
  _GLOBAL_CANVAS_PIXEL_WIDTH,
  CanvasRenderContext,
  CustomPageStyle,
  PageRenderer,
  RectCoordsDims,
} from "../deps.ts";

type Props = {
  pageInputs?: PageInputs;
  canvasElementId?: string;
  fixedCanvasH: number;
  fitWithin?: boolean;
  textRenderingOptions?: TextRenderingOptions;
  simpleError?: boolean;
  externalError?: string;
  scalePixelResolution?: number;
};

export function PageHolder(p: Props) {
  let div!: HTMLDivElement;
  let canvas!: HTMLCanvasElement;
  let animationFrameId: number | undefined;
  let cachedContext: CanvasRenderingContext2D | undefined;
  let canvasTrackingId: string | undefined;

  // Static values - calculated once and never change
  const scale = p.scalePixelResolution ?? 1;
  const fixedCanvasW = Math.round(_GLOBAL_CANVAS_PIXEL_WIDTH * scale);
  const fixedCanvasH = Math.round(p.fixedCanvasH * scale);
  const unscaledW = _GLOBAL_CANVAS_PIXEL_WIDTH;
  const unscaledH = p.fixedCanvasH;

  const [err, setErr] = createSignal<string>("");
  const [warnings, setWarnings] = createSignal<LayoutWarning[]>([]);

  onMount(() => {
    // Set canvas dimensions once - they never change
    canvas.width = fixedCanvasW;
    canvas.height = fixedCanvasH;

    // Get context once - dimensions are static
    cachedContext = canvas.getContext("2d", { willReadFrequently: false })!;

    // Apply scaling transform if needed (once, permanently)
    if (scale !== 1) {
      cachedContext.save();
      cachedContext.scale(scale, scale);
    }

    // Track canvas for debugging
    canvasTrackingId = trackCanvas(canvas, "PageHolder");

    // Preload fonts used by this page
    if (p.pageInputs) {
      const style = new CustomPageStyle(p.pageInputs.style);
      const fonts = style.getMergedPageFontsToRegister();
      fonts.forEach((fontInfo) => {
        loadFont(fontInfo.fontFamily);
      });
    }

    // Also preload fonts from textRenderingOptions
    if (p.textRenderingOptions?.fallbackFonts) {
      p.textRenderingOptions.fallbackFonts.forEach((fontInfo) => {
        loadFont(fontInfo.fontFamily);
      });
    }
  });

  createEffect(() => {
    fontsReady(); // Track the signal - will trigger re-render when fonts load

    // Call updatePage directly without debouncing
    updatePage(
      cachedContext!,
      p.pageInputs,
      setErr,
      setWarnings,
      unscaledW,
      unscaledH,
      p.textRenderingOptions,
      p.externalError,
      animationFrameId,
      (id) => {
        animationFrameId = id;
      },
    );

    // Cleanup function for this effect
    onCleanup(() => {
      if (animationFrameId !== undefined) {
        cancelAnimationFrame(animationFrameId);
      }
    });
  });

  // Component cleanup
  onCleanup(() => {
    // Cancel any pending animation frames
    if (animationFrameId !== undefined) {
      cancelAnimationFrame(animationFrameId);
    }

    // Restore context state if we scaled
    if (scale !== 1 && cachedContext) {
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
      class="relative w-full data-[fitWithin=true]:h-full"
      style={{
        "place-items": "center",
      }}
      data-fitWithin={!!p.fitWithin}
    >
      <Show when={err() || warnings().length > 0}>
        <Switch>
          <Match when={p.simpleError}>
            <div class="absolute inset-0 flex items-center justify-center">
              <div class="bg-danger text-base-100 pointer-events-none p-1 text-xs">
                <Show when={err()}>Config error</Show>
                <Show when={!err()}>Layout error</Show>
              </div>
            </div>
          </Match>
          <Match when={true}>
            <div class="ui-pad absolute left-0 top-0">
              <div class="ui-pad ui-spy-sm bg-danger text-base-100 pointer-events-none text-xs">
                <Show when={err()}>
                  <div class="">{err()}</div>
                </Show>
                <Show when={!err()}>
                  <div class="">{warnings().at(0)?.message}</div>
                </Show>
              </div>
            </div>
          </Match>
        </Switch>
      </Show>

      <canvas
        ref={canvas!}
        id={p.canvasElementId}
        class="data-[fitWithin=true]:max-h-full data-[fitWithin=false]:w-full data-[fitWithin=true]:max-w-full"
        data-fitWithin={!!p.fitWithin}
      />
    </div>
  );
}

function updatePage(
  ctx: CanvasRenderingContext2D,
  pageInputs: PageInputs | undefined,
  setErr: Setter<string>,
  setWarnings: Setter<LayoutWarning[]>,
  unscaledW: number,
  unscaledH: number,
  textRenderingOptions: TextRenderingOptions | undefined,
  externalError: string | undefined,
  currentFrameId?: number,
  setFrameId?: (id: number | undefined) => void,
) {
  // Cancel any pending animation frame
  if (currentFrameId !== undefined) {
    cancelAnimationFrame(currentFrameId);
  }

  const frameId = requestAnimationFrame(() => {
    // Clear the frame ID since we're executing
    if (setFrameId) setFrameId(undefined);
    if (externalError) {
      setErr(externalError);
      return;
    }
    if (!pageInputs) {
      return;
    }

    // Clear any previous errors
    setErr("");

    // Handle the async operations - no clearRect to avoid transparency
    (async () => {
      try {
        const rc = new CanvasRenderContext(ctx, textRenderingOptions);
        // Use unscaled dimensions since transform is already applied
        const rcd = new RectCoordsDims([0, 0, unscaledW, unscaledH]);

        const mPage = await PageRenderer.measure(rc, rcd, pageInputs);
        setWarnings(mPage.warnings);
        await PageRenderer.render(rc, mPage);
      } catch (e) {
        console.error("PageHolder render error:", e);
        const errorMessage = e instanceof Error ? e.message : String(e);
        setErr("Bad chart config: " + errorMessage);
      }
    })();
  });

  // Store the frame ID for potential cancellation
  if (setFrameId) setFrameId(frameId);
}
