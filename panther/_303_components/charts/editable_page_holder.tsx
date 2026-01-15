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
  buildHitRegions,
  findHitTarget,
  fontsReady,
  loadFont,
  releaseCanvasGPUMemory,
  trackCanvas,
  untrackCanvas,
} from "../deps.ts";
import type {
  LayoutWarning,
  MeasuredPage,
  PageHitTarget,
  PageInputs,
  TextRenderingOptions,
} from "../deps.ts";
import {
  _GLOBAL_CANVAS_PIXEL_WIDTH,
  CanvasRenderContext,
  CustomStyle,
  PageRenderer,
  RectCoordsDims,
} from "../deps.ts";
import type { FontInfo } from "../deps.ts";

export type EditableHoverStyle = {
  fillColor?: string;
  strokeColor?: string;
  strokeWidth?: number;
};

type Props = {
  pageInputs?: PageInputs;
  canvasElementId?: string;
  fixedCanvasH: number;
  fitWithin?: boolean;
  textRenderingOptions?: TextRenderingOptions;
  simpleError?: boolean;
  externalError?: string;
  scalePixelResolution?: number;
  hoverStyle?: EditableHoverStyle;
  onClick?: (target: PageHitTarget) => void;
  onContextMenu?: (e: MouseEvent, target: PageHitTarget) => void;
  onHover?: (target: PageHitTarget | undefined) => void;
  onMeasured?: (measured: MeasuredPage) => void;
};

const DEFAULT_HOVER_STYLE: EditableHoverStyle = {
  fillColor: "rgba(0, 112, 243, 0.1)",
  strokeColor: "rgba(0, 112, 243, 0.8)",
  strokeWidth: 2,
};

export function EditablePageHolder(p: Props) {
  let div!: HTMLDivElement;
  let mainCanvas!: HTMLCanvasElement;
  let overlayCanvas!: HTMLCanvasElement;
  let animationFrameId: number | undefined;
  let mainCachedContext: CanvasRenderingContext2D | undefined;
  let overlayCachedContext: CanvasRenderingContext2D | undefined;
  let mainCanvasTrackingId: string | undefined;
  let overlayCanvasTrackingId: string | undefined;

  const scale = p.scalePixelResolution ?? 1;
  const fixedCanvasW = Math.round(_GLOBAL_CANVAS_PIXEL_WIDTH * scale);
  const fixedCanvasH = Math.round(p.fixedCanvasH * scale);
  const unscaledW = _GLOBAL_CANVAS_PIXEL_WIDTH;
  const unscaledH = p.fixedCanvasH;

  const [err, setErr] = createSignal<string>("");
  const [warnings, setWarnings] = createSignal<LayoutWarning[]>([]);
  const [hitRegions, setHitRegions] = createSignal<PageHitTarget[]>([]);
  const [currentHit, setCurrentHit] = createSignal<PageHitTarget | undefined>(
    undefined,
  );

  onMount(() => {
    mainCanvas.width = fixedCanvasW;
    mainCanvas.height = fixedCanvasH;
    overlayCanvas.width = fixedCanvasW;
    overlayCanvas.height = fixedCanvasH;

    mainCachedContext = mainCanvas.getContext("2d", {
      willReadFrequently: false,
    })!;
    overlayCachedContext = overlayCanvas.getContext("2d", {
      willReadFrequently: false,
    })!;

    if (scale !== 1) {
      mainCachedContext.save();
      mainCachedContext.scale(scale, scale);
      overlayCachedContext.save();
      overlayCachedContext.scale(scale, scale);
    }

    mainCanvasTrackingId = trackCanvas(mainCanvas, "EditablePageHolder-main");
    overlayCanvasTrackingId = trackCanvas(
      overlayCanvas,
      "EditablePageHolder-overlay",
    );

    if (p.pageInputs) {
      const style = new CustomStyle(p.pageInputs.style);
      const fonts = style.getFontsToRegister();
      fonts.forEach((fontInfo: FontInfo) => {
        loadFont(fontInfo.fontFamily);
      });
    }

    if (p.textRenderingOptions?.fallbackFonts) {
      p.textRenderingOptions.fallbackFonts.forEach((fontInfo) => {
        loadFont(fontInfo.fontFamily);
      });
    }
  });

  createEffect(() => {
    fontsReady();

    updatePage(
      mainCachedContext!,
      p.pageInputs,
      setErr,
      setWarnings,
      setHitRegions,
      unscaledW,
      unscaledH,
      p.textRenderingOptions,
      p.externalError,
      p.onMeasured,
      animationFrameId,
      (id) => {
        animationFrameId = id;
      },
    );

    onCleanup(() => {
      if (animationFrameId !== undefined) {
        cancelAnimationFrame(animationFrameId);
      }
    });
  });

  createEffect(() => {
    const hit = currentHit();
    const ctx = overlayCachedContext;
    if (!ctx) return;

    ctx.clearRect(0, 0, unscaledW, unscaledH);

    if (hit) {
      const style = p.hoverStyle ?? DEFAULT_HOVER_STYLE;
      renderHover(ctx, hit, style);
    }

    p.onHover?.(hit);
  });

  onCleanup(() => {
    if (animationFrameId !== undefined) {
      cancelAnimationFrame(animationFrameId);
    }

    if (scale !== 1) {
      if (mainCachedContext) mainCachedContext.restore();
      if (overlayCachedContext) overlayCachedContext.restore();
    }

    if (mainCanvasTrackingId) untrackCanvas(mainCanvasTrackingId);
    if (overlayCanvasTrackingId) untrackCanvas(overlayCanvasTrackingId);

    if (mainCanvas) releaseCanvasGPUMemory(mainCanvas);
    if (overlayCanvas) releaseCanvasGPUMemory(overlayCanvas);

    mainCachedContext = undefined;
    overlayCachedContext = undefined;
  });

  function handlePointerMove(e: PointerEvent) {
    const coords = getCanvasCoords(e, overlayCanvas, scale);
    const hit = findHitTarget(hitRegions(), coords.x, coords.y);
    setCurrentHit(hit);
  }

  function handlePointerOut() {
    setCurrentHit(undefined);
  }

  function handleClick() {
    const hit = currentHit();
    if (hit) {
      p.onClick?.(hit);
    }
  }

  function handleContextMenu(e: MouseEvent) {
    if (!p.onContextMenu) return;
    const coords = getCanvasCoords(e, overlayCanvas, scale);
    const hit = findHitTarget(hitRegions(), coords.x, coords.y);
    if (hit) {
      e.preventDefault();
      p.onContextMenu(e, hit);
    }
  }

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
        ref={mainCanvas!}
        class="pointer-events-none data-[fitWithin=true]:max-h-full data-[fitWithin=false]:w-full data-[fitWithin=true]:max-w-full"
        data-fitWithin={!!p.fitWithin}
      />

      <canvas
        ref={overlayCanvas!}
        id={p.canvasElementId}
        class="absolute left-0 top-0 data-[fitWithin=true]:max-h-full data-[fitWithin=false]:w-full data-[fitWithin=true]:max-w-full"
        data-fitWithin={!!p.fitWithin}
        style={{ cursor: currentHit() ? "pointer" : "default" }}
        onPointerMove={handlePointerMove}
        onPointerOut={handlePointerOut}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
      />
    </div>
  );
}

function updatePage(
  ctx: CanvasRenderingContext2D,
  pageInputs: PageInputs | undefined,
  setErr: Setter<string>,
  setWarnings: Setter<LayoutWarning[]>,
  setHitRegions: Setter<PageHitTarget[]>,
  unscaledW: number,
  unscaledH: number,
  textRenderingOptions: TextRenderingOptions | undefined,
  externalError: string | undefined,
  onMeasured: ((measured: MeasuredPage) => void) | undefined,
  currentFrameId?: number,
  setFrameId?: (id: number | undefined) => void,
) {
  if (currentFrameId !== undefined) {
    cancelAnimationFrame(currentFrameId);
  }

  const frameId = requestAnimationFrame(() => {
    if (setFrameId) setFrameId(undefined);
    if (externalError) {
      setErr(externalError);
      return;
    }
    if (!pageInputs) {
      return;
    }

    setErr("");

    (async () => {
      try {
        const rc = new CanvasRenderContext(ctx, textRenderingOptions);
        const rcd = new RectCoordsDims([0, 0, unscaledW, unscaledH]);

        const mPage = await PageRenderer.measure(rc, rcd, pageInputs);
        setWarnings(mPage.warnings);

        const regions = buildHitRegions(mPage);
        setHitRegions(regions);

        onMeasured?.(mPage);

        await PageRenderer.render(rc, mPage);
      } catch (e) {
        console.error("EditablePageHolder render error:", e);
        const errorMessage = e instanceof Error ? e.message : String(e);
        setErr("Bad chart config: " + errorMessage);
      }
    })();
  });

  if (setFrameId) setFrameId(frameId);
}

function getCanvasCoords(
  e: { clientX: number; clientY: number },
  canvas: HTMLCanvasElement,
  scale: number,
): { x: number; y: number } {
  const rect = canvas.getBoundingClientRect();
  return {
    x: ((canvas.width * (e.clientX - rect.left)) / rect.width) / scale,
    y: ((canvas.height * (e.clientY - rect.top)) / rect.height) / scale,
  };
}

function renderHover(
  ctx: CanvasRenderingContext2D,
  target: PageHitTarget,
  style: EditableHoverStyle,
) {
  const { rcd } = target;

  if (style.fillColor) {
    ctx.fillStyle = style.fillColor;
    ctx.fillRect(rcd.x(), rcd.y(), rcd.w(), rcd.h());
  }

  if (style.strokeColor) {
    ctx.strokeStyle = style.strokeColor;
    ctx.lineWidth = style.strokeWidth ?? 2;
    ctx.strokeRect(rcd.x(), rcd.y(), rcd.w(), rcd.h());
  }
}
