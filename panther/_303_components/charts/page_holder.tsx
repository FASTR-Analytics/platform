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
  type Setter,
  Show,
  Switch,
} from "solid-js";
import type {
  FontInfo,
  MeasuredColsLayoutNode,
  MeasuredLayoutNode,
  MeasuredPage,
  PageContentItem,
  PageHitTarget,
  PageHitTargetColDivider,
  PageInputs,
  TextRenderingOptions,
} from "../deps.ts";
import {
  _GLOBAL_CANVAS_PIXEL_WIDTH,
  buildHitRegions,
  CanvasRenderContext,
  CustomStyle,
  findHitTarget,
  fontsReady,
  getMinimumSpan,
  loadFont,
  PageRenderer,
  RectCoordsDims,
  releaseCanvasGPUMemory,
  trackCanvas,
  untrackCanvas,
} from "../deps.ts";

export type EditableHoverStyle = {
  fillColor?: string;
  strokeColor?: string;
  strokeWidth?: number;
  showLayoutBoundaries?: boolean;
};

export type DividerDragUpdate = {
  colsNodeId: string;
  leftNodeId: string;
  rightNodeId: string;
  suggestedSpans: {
    left: number;
    right: number;
  };
  totalSpans: number;
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
  onDividerDrag?: (update: DividerDragUpdate) => void;
};

const DEFAULT_HOVER_STYLE: EditableHoverStyle = {
  fillColor: "rgba(0, 112, 243, 0.1)",
  strokeColor: "rgba(0, 112, 243, 0.8)",
  strokeWidth: 2,
};

export function PageHolder(p: Props) {
  // Auto-detect interactive mode from callbacks
  const needsInteractive = !!(
    p.onClick ||
    p.onContextMenu ||
    p.onHover ||
    p.onDividerDrag ||
    p.onMeasured
  );

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
  const [measuredPage, setMeasuredPage] = createSignal<
    MeasuredPage | undefined
  >();
  const [dragState, setDragState] = createSignal<
    | {
      target: PageHitTargetColDivider;
      startX: number;
      currentX: number;
      colsNode: MeasuredColsLayoutNode<PageContentItem>;
    }
    | undefined
  >();

  onMount(() => {
    mainCanvas.width = fixedCanvasW;
    mainCanvas.height = fixedCanvasH;

    mainCachedContext = mainCanvas.getContext("2d", {
      willReadFrequently: false,
    })!;

    if (scale !== 1) {
      mainCachedContext.save();
      mainCachedContext.scale(scale, scale);
    }

    mainCanvasTrackingId = trackCanvas(mainCanvas, "PageHolder-main");

    if (needsInteractive) {
      overlayCanvas.width = fixedCanvasW;
      overlayCanvas.height = fixedCanvasH;

      overlayCachedContext = overlayCanvas.getContext("2d", {
        willReadFrequently: false,
      })!;

      if (scale !== 1) {
        overlayCachedContext.save();
        overlayCachedContext.scale(scale, scale);
      }

      overlayCanvasTrackingId = trackCanvas(
        overlayCanvas,
        "PageHolder-overlay",
      );

      document.addEventListener("keydown", handleKeyDown);
    }

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
      needsInteractive,
      setHitRegions,
      setMeasuredPage,
      unscaledW,
      unscaledH,
      p.textRenderingOptions,
      p.externalError,
      p.onMeasured,
      animationFrameId,
      (id: number | undefined) => {
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
    if (!needsInteractive) return;

    const hit = currentHit();
    const regions = hitRegions();
    const canvasHovered = isCanvasHovered();
    const drag = dragState();
    const ctx = overlayCachedContext;
    if (!ctx) return;

    ctx.clearRect(0, 0, unscaledW, unscaledH);

    const style = p.hoverStyle ?? DEFAULT_HOVER_STYLE;
    const displayedWidth = overlayCanvas.getBoundingClientRect().width;
    const screenPixelSize = displayedWidth > 0 ? unscaledW / displayedWidth : 1;

    if (canvasHovered && style.showLayoutBoundaries) {
      // Layout items - dotted rect boundaries
      const layoutItems = regions.filter((r) => r.type === "layoutItem");
      const hitLayoutId = hit?.type === "layoutItem" ? hit.node.id : undefined;
      for (const region of layoutItems) {
        renderBoundary(
          ctx,
          region,
          hitLayoutId === region.node.id,
          screenPixelSize,
        );
      }

      // Text items - dotted rect boundaries
      const textItems = regions.filter((r) => isTextHitTarget(r));
      for (const region of textItems) {
        const isThisHovered = hit?.type === region.type;
        renderBoundary(ctx, region, isThisHovered, screenPixelSize);
      }

      // Dividers - thin lines (not rects)
      const dividers = regions.filter(
        (r): r is PageHitTargetColDivider => r.type === "colDivider",
      );
      for (const region of dividers) {
        const isThisHovered = hit?.type === "colDivider" &&
          hit.gap.colsNodeId === region.gap.colsNodeId &&
          hit.gap.afterColIndex === region.gap.afterColIndex;
        if (!isThisHovered) {
          renderDividerLine(ctx, region, false, screenPixelSize);
        }
      }
    }

    if (drag) {
      const { target, startX, currentX } = drag;
      const gap = target.gap;
      const deltaX = currentX - startX;
      const snappedX = calculateSnappedDividerX(drag, deltaX);

      ctx.strokeStyle = "rgba(0, 112, 243, 0.9)";
      ctx.lineWidth = 2 * screenPixelSize;
      ctx.beginPath();
      ctx.moveTo(snappedX, gap.line.y1);
      ctx.lineTo(snappedX, gap.line.y2);
      ctx.stroke();
    } else if (hit) {
      renderHover(ctx, hit, style, screenPixelSize);
    }

    p.onHover?.(drag ? undefined : hit);
  });

  onCleanup(() => {
    if (animationFrameId !== undefined) {
      cancelAnimationFrame(animationFrameId);
    }

    if (scale !== 1 && mainCachedContext) {
      mainCachedContext.restore();
    }

    if (mainCanvasTrackingId) untrackCanvas(mainCanvasTrackingId);
    if (mainCanvas) releaseCanvasGPUMemory(mainCanvas);
    mainCachedContext = undefined;

    if (needsInteractive) {
      if (scale !== 1 && overlayCachedContext) {
        overlayCachedContext.restore();
      }

      if (overlayCanvasTrackingId) untrackCanvas(overlayCanvasTrackingId);
      if (overlayCanvas) releaseCanvasGPUMemory(overlayCanvas);
      overlayCachedContext = undefined;

      setDragState(undefined);
      document.removeEventListener("keydown", handleKeyDown);
    }
  });

  function handlePointerEnter() {
    setIsCanvasHovered(true);
  }

  function handlePointerMove(e: PointerEvent) {
    const coords = getCanvasCoords(e, overlayCanvas, scale);
    const drag = dragState();

    if (drag) {
      setDragState({ ...drag, currentX: coords.x });
      return;
    }

    const hit = findHitTarget(hitRegions(), coords.x, coords.y);
    setCurrentHit(hit);
  }

  function handlePointerDown(e: PointerEvent) {
    const hit = currentHit();
    if (hit?.type !== "colDivider" || !p.onDividerDrag) return;

    const mPage = measuredPage();
    if (!mPage || mPage.type !== "freeform") return;

    const colsNode = findColsNodeById(mPage.mLayout, hit.gap.colsNodeId);
    if (!colsNode) return;

    e.preventDefault();
    overlayCanvas.setPointerCapture(e.pointerId);

    const coords = getCanvasCoords(e, overlayCanvas, scale);
    setDragState({
      target: hit,
      startX: coords.x,
      currentX: coords.x,
      colsNode,
    });
  }

  function handlePointerUp(e: PointerEvent) {
    const drag = dragState();
    if (!drag) return;

    overlayCanvas.releasePointerCapture(e.pointerId);
    justFinishedDrag = true;

    const coords = getCanvasCoords(e, overlayCanvas, scale);
    const deltaX = coords.x - drag.startX;

    if (Math.abs(deltaX) > 5) {
      const update = calculateDividerDragUpdate(drag, deltaX);
      if (update) {
        p.onDividerDrag?.(update);
      }
    }

    setDragState(undefined);
  }

  function handlePointerCancel(e: PointerEvent) {
    if (dragState()) {
      overlayCanvas.releasePointerCapture(e.pointerId);
      setDragState(undefined);
    }
  }

  function handlePointerLeave() {
    setIsCanvasHovered(false);
    if (!dragState()) {
      setCurrentHit(undefined);
    }
  }

  let justFinishedDrag = false;

  function handleClick() {
    if (justFinishedDrag) {
      justFinishedDrag = false;
      return;
    }
    const hit = currentHit();
    if (hit) {
      p.onClick?.(hit);
    }
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === "Escape" && dragState()) {
      setDragState(undefined);
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
        classList={{
          "pointer-events-none absolute left-1/2 top-0 -translate-x-1/2":
            needsInteractive,
          "data-[fitWithin=true]:max-h-full": true,
          "data-[fitWithin=false]:w-full": true,
          "data-[fitWithin=true]:max-w-full": true,
        }}
        data-fitWithin={!!p.fitWithin}
        id={needsInteractive ? undefined : p.canvasElementId}
      />

      <Show when={needsInteractive}>
        <canvas
          ref={overlayCanvas!}
          id={p.canvasElementId}
          class="absolute left-1/2 top-0 -translate-x-1/2 data-[fitWithin=true]:max-h-full data-[fitWithin=false]:w-full data-[fitWithin=true]:max-w-full"
          data-fitWithin={!!p.fitWithin}
          style={{
            cursor: dragState()
              ? "col-resize"
              : currentHit()?.type === "colDivider"
              ? "col-resize"
              : currentHit()
              ? "pointer"
              : "default",
          }}
          onPointerEnter={handlePointerEnter}
          onPointerMove={handlePointerMove}
          onPointerLeave={handlePointerLeave}
          onPointerDown={handlePointerDown}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerCancel}
          onClick={handleClick}
          onContextMenu={handleContextMenu}
        />
      </Show>
    </div>
  );
}

function updatePage(
  ctx: CanvasRenderingContext2D,
  pageInputs: PageInputs | undefined,
  setErr: Setter<string>,
  setOverflow: Setter<boolean>,
  needsInteractive: boolean,
  setHitRegions: Setter<PageHitTarget[]>,
  setMeasuredPage: Setter<MeasuredPage | undefined>,
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

        if (needsInteractive) {
          const regions = buildHitRegions(mPage);
          setHitRegions(regions);
          setMeasuredPage(mPage);
          onMeasured?.(mPage);
        }

        await PageRenderer.render(rc, mPage);
      } catch (e) {
        console.error("PageHolder render error:", e);
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
    x: (canvas.width * (e.clientX - rect.left)) / rect.width / scale,
    y: (canvas.height * (e.clientY - rect.top)) / rect.height / scale,
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
  // Dividers get a thicker blue line, not a rect
  if (target.type === "colDivider") {
    renderDividerLine(ctx, target, true, screenPixelSize);
    return;
  }

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

function isTextHitTarget(target: PageHitTarget): boolean {
  return [
    "coverTitle",
    "coverSubTitle",
    "coverAuthor",
    "coverDate",
    "sectionTitle",
    "sectionSubTitle",
    "headerText",
    "subHeaderText",
    "dateText",
    "footerText",
  ].includes(target.type);
}

function renderDividerLine(
  ctx: CanvasRenderingContext2D,
  target: PageHitTargetColDivider,
  isHovered: boolean,
  screenPixelSize: number,
) {
  const { gap } = target;

  if (isHovered) {
    ctx.strokeStyle = "rgba(0, 112, 243, 0.9)";
    ctx.lineWidth = 2 * screenPixelSize;
  } else {
    ctx.strokeStyle = "rgba(100, 100, 100, 0.6)";
    ctx.lineWidth = screenPixelSize;
  }

  ctx.beginPath();
  ctx.moveTo(gap.line.x, gap.line.y1);
  ctx.lineTo(gap.line.x, gap.line.y2);
  ctx.stroke();
}

function calculateSnappedDividerX(
  drag: DragStateValue,
  deltaX: number,
): number {
  const { target, colsNode } = drag;
  const allSnapPositions = target.gap.snapPositions;

  if (!allSnapPositions || allSnapPositions.length === 0) {
    return target.gap.line.x;
  }

  const leftNode = colsNode.children[target.gap.afterColIndex];
  const rightNode = colsNode.children[target.gap.afterColIndex + 1];
  if (!leftNode || !rightNode) return target.gap.line.x;

  // Calculate minimum spans based on nested content
  const leftMinSpan = getMinimumSpan(leftNode);
  const rightMinSpan = getMinimumSpan(rightNode);

  // Filter to valid positions with minimum span constraints
  const combinedSpan = target.gap.leftSpan + target.gap.rightSpan;
  const startCol = target.gap.leftStartColumn;
  const endCol = startCol + combinedSpan;

  const validPositions: number[] = [];
  for (let i = 0; i < allSnapPositions.length; i++) {
    // snapPositions[i] is the divider between column i and column i+1
    // Snapping to it gives a left boundary at column (i+1)
    const dividerBoundary = i + 1;
    // Only include if within this divider's column range
    if (dividerBoundary > startCol && dividerBoundary < endCol) {
      const potentialLeftSpan = dividerBoundary - startCol;
      const potentialRightSpan = endCol - dividerBoundary;
      if (
        potentialLeftSpan >= leftMinSpan &&
        potentialRightSpan >= rightMinSpan
      ) {
        validPositions.push(allSnapPositions[i]);
      }
    }
  }

  if (validPositions.length === 0) {
    return target.gap.line.x;
  }

  // Find nearest valid snap position
  const mouseX = target.gap.line.x + deltaX;
  let nearestPos = validPositions[0];
  let nearestDist = Math.abs(mouseX - nearestPos);

  for (const pos of validPositions) {
    const dist = Math.abs(mouseX - pos);
    if (dist < nearestDist) {
      nearestDist = dist;
      nearestPos = pos;
    }
  }

  return nearestPos;
}

function findColsNodeById<T>(
  node: MeasuredLayoutNode<T>,
  id: string,
): MeasuredColsLayoutNode<T> | undefined {
  if (node.type === "cols" && node.id === id) {
    return node;
  }
  if (node.type === "rows" || node.type === "cols") {
    for (const child of node.children) {
      const found = findColsNodeById(child, id);
      if (found) return found;
    }
  }
  return undefined;
}

type DragStateValue = {
  target: PageHitTargetColDivider;
  startX: number;
  currentX: number;
  colsNode: MeasuredColsLayoutNode<PageContentItem>;
};

function calculateDividerDragUpdate(
  drag: DragStateValue,
  deltaX: number,
): DividerDragUpdate | undefined {
  const { target, colsNode } = drag;
  const { afterColIndex } = target.gap;
  const allSnapPositions = target.gap.snapPositions;

  const leftNode = colsNode.children[afterColIndex];
  const rightNode = colsNode.children[afterColIndex + 1];
  if (!leftNode || !rightNode) return undefined;

  if (!allSnapPositions || allSnapPositions.length === 0) return undefined;

  // Calculate minimum spans based on nested content
  const leftMinSpan = getMinimumSpan(leftNode);
  const rightMinSpan = getMinimumSpan(rightNode);

  // Filter snap positions to valid range AND minimum span constraints
  const combinedSpan = target.gap.leftSpan + target.gap.rightSpan;
  const startCol = target.gap.leftStartColumn;
  const endCol = startCol + combinedSpan;

  const validSnapIndices: number[] = [];
  for (let i = 0; i < allSnapPositions.length; i++) {
    // snapPositions[i] is the divider between column i and column i+1
    // Snapping to it gives a left boundary at column (i+1)
    const dividerBoundary = i + 1;
    // Only include if within this divider's column range
    if (dividerBoundary > startCol && dividerBoundary < endCol) {
      const potentialLeftSpan = dividerBoundary - startCol;
      const potentialRightSpan = endCol - dividerBoundary;
      // Only allow if both nodes meet their minimum span requirements
      if (
        potentialLeftSpan >= leftMinSpan &&
        potentialRightSpan >= rightMinSpan
      ) {
        validSnapIndices.push(i);
      }
    }
  }

  if (validSnapIndices.length === 0) return undefined;

  // Find which valid snap position the mouse is closest to
  const mouseX = target.gap.line.x + deltaX;
  let nearestIndex = validSnapIndices[0];
  let nearestDist = Math.abs(mouseX - allSnapPositions[nearestIndex]);

  for (const i of validSnapIndices) {
    const dist = Math.abs(mouseX - allSnapPositions[i]);
    if (dist < nearestDist) {
      nearestDist = dist;
      nearestIndex = i;
    }
  }

  // Calculate new spans based on which divider was snapped to
  // snapPositions[nearestIndex] is the divider between column nearestIndex and nearestIndex+1
  const dividerBoundary = nearestIndex + 1;
  const newLeftSpan = dividerBoundary - target.gap.leftStartColumn;
  const newRightSpan = combinedSpan - newLeftSpan;

  if (
    newLeftSpan === target.gap.leftSpan ||
    newLeftSpan < 1 ||
    newRightSpan < 1
  ) {
    return undefined;
  }

  return {
    colsNodeId: colsNode.id,
    leftNodeId: leftNode.id,
    rightNodeId: rightNode.id,
    suggestedSpans: {
      left: newLeftSpan,
      right: newRightSpan,
    },
    totalSpans: combinedSpan,
  };
}
