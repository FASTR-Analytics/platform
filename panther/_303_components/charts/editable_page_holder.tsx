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
  showLayoutBoundaries?: boolean;
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
  const [overflow, setOverflow] = createSignal<boolean>(false);
  const [hitRegions, setHitRegions] = createSignal<PageHitTarget[]>([]);
  const [currentHit, setCurrentHit] = createSignal<PageHitTarget | undefined>(
    undefined,
  );
  const [isCanvasHovered, setIsCanvasHovered] = createSignal(false);

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
      setOverflow,
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
    const regions = hitRegions();
    const canvasHovered = isCanvasHovered();
    const ctx = overlayCachedContext;
    if (!ctx) return;

    ctx.clearRect(0, 0, unscaledW, unscaledH);

    const style = p.hoverStyle ?? DEFAULT_HOVER_STYLE;
    const displayedWidth = overlayCanvas.getBoundingClientRect().width;
    const screenPixelSize = displayedWidth > 0 ? unscaledW / displayedWidth : 1;

    if (canvasHovered && style.showLayoutBoundaries) {
      const layoutItems = regions.filter((r) => r.type === "layoutItem");
      const hitNodeId = hit?.type === "layoutItem" ? hit.node.id : undefined;
      for (const region of layoutItems) {
        renderBoundary(
          ctx,
          region,
          hitNodeId === region.node.id,
          screenPixelSize,
        );
      }
    }

    if (hit) {
      renderHover(ctx, hit, style, screenPixelSize);
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

  function handlePointerEnter() {
    setIsCanvasHovered(true);
  }

  function handlePointerMove(e: PointerEvent) {
    const coords = getCanvasCoords(e, overlayCanvas, scale);
    const hit = findHitTarget(hitRegions(), coords.x, coords.y);
    setCurrentHit(hit);
  }

  function handlePointerLeave() {
    setIsCanvasHovered(false);
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
      data-fitWithin={!!p.fitWithin}
    >
      <Show when={err() || overflow()}>
        <Switch>
          <Match when={p.simpleError}>
            <div class="absolute inset-0 flex items-center justify-center">
              <div class="bg-danger text-base-100 pointer-events-none p-1 text-xs">
                <Show when={err()}>Config error</Show>
                <Show when={!err()}>Layout overflow</Show>
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
                  <div class="">Content exceeds available space</div>
                </Show>
              </div>
            </div>
          </Match>
        </Switch>
      </Show>

      <canvas
        ref={mainCanvas!}
        class="pointer-events-none absolute left-1/2 top-0 -translate-x-1/2 data-[fitWithin=true]:max-h-full data-[fitWithin=false]:w-full data-[fitWithin=true]:max-w-full"
        data-fitWithin={!!p.fitWithin}
      />

      <canvas
        ref={overlayCanvas!}
        id={p.canvasElementId}
        class="absolute left-1/2 top-0 -translate-x-1/2 data-[fitWithin=true]:max-h-full data-[fitWithin=false]:w-full data-[fitWithin=true]:max-w-full"
        data-fitWithin={!!p.fitWithin}
        style={{ cursor: currentHit() ? "pointer" : "default" }}
        onPointerEnter={handlePointerEnter}
        onPointerMove={handlePointerMove}
        onPointerLeave={handlePointerLeave}
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
  setOverflow: Setter<boolean>,
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
        setOverflow(mPage.overflow);

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

function renderBoundary(
  ctx: CanvasRenderingContext2D,
  target: PageHitTarget,
  isHovered: boolean,
  screenPixelSize: number,
) {
  if (isHovered) return;
  const { rcd } = target;
  ctx.save();
  ctx.strokeStyle = "rgba(100, 100, 100, 0.6)";
  ctx.lineWidth = screenPixelSize;
  ctx.setLineDash([6 * screenPixelSize, 4 * screenPixelSize]);
  const inset = screenPixelSize;
  ctx.strokeRect(
    rcd.x() + inset,
    rcd.y() + inset,
    rcd.w() - inset * 2,
    rcd.h() - inset * 2,
  );
  ctx.restore();
}

function renderHover(
  ctx: CanvasRenderingContext2D,
  target: PageHitTarget,
  style: EditableHoverStyle,
  screenPixelSize: number,
) {
  const { rcd } = target;

  if (style.fillColor) {
    ctx.fillStyle = style.fillColor;
    ctx.fillRect(rcd.x(), rcd.y(), rcd.w(), rcd.h());
  }

  if (style.strokeColor) {
    ctx.strokeStyle = style.strokeColor;
    ctx.lineWidth = (style.strokeWidth ?? 2) * screenPixelSize;
    ctx.strokeRect(rcd.x(), rcd.y(), rcd.w(), rcd.h());
  }
}
