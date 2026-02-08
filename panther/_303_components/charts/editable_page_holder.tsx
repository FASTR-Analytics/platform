// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

// import {
//   createEffect,
//   createSignal,
//   Match,
//   onCleanup,
//   onMount,
//   Setter,
//   Show,
//   Switch,
// } from "solid-js";
// import {
//   buildHitRegions,
//   findHitTarget,
//   fontsReady,
//   loadFont,
//   releaseCanvasGPUMemory,
//   trackCanvas,
//   untrackCanvas,
// } from "../deps.ts";
// import type {
//   MeasuredColsLayoutNode,
//   MeasuredFreeformPage,
//   MeasuredLayoutNode,
//   MeasuredPage,
//   PageContentItem,
//   PageHitTarget,
//   PageHitTargetColDivider,
//   PageInputs,
//   TextRenderingOptions,
// } from "../deps.ts";
// import {
//   _GLOBAL_CANVAS_PIXEL_WIDTH,
//   CanvasRenderContext,
//   CustomStyle,
//   PageRenderer,
//   RectCoordsDims,
// } from "../deps.ts";
// import type { FontInfo } from "../deps.ts";

// export type EditableHoverStyle = {
//   fillColor?: string;
//   strokeColor?: string;
//   strokeWidth?: number;
//   showLayoutBoundaries?: boolean;
// };

// export type DividerDragUpdate = {
//   colsNodeId: string;
//   leftNodeId: string;
//   rightNodeId: string;
//   suggestedSpans: {
//     left: number;
//     right: number;
//   };
//   totalSpans: number;
// };

// type Props = {
//   pageInputs?: PageInputs;
//   canvasElementId?: string;
//   fixedCanvasH: number;
//   fitWithin?: boolean;
//   textRenderingOptions?: TextRenderingOptions;
//   simpleError?: boolean;
//   externalError?: string;
//   scalePixelResolution?: number;
//   hoverStyle?: EditableHoverStyle;
//   onClick?: (target: PageHitTarget) => void;
//   onContextMenu?: (e: MouseEvent, target: PageHitTarget) => void;
//   onHover?: (target: PageHitTarget | undefined) => void;
//   onMeasured?: (measured: MeasuredPage) => void;
//   onDividerDrag?: (update: DividerDragUpdate) => void;
// };

// const DEFAULT_HOVER_STYLE: EditableHoverStyle = {
//   fillColor: "rgba(0, 112, 243, 0.1)",
//   strokeColor: "rgba(0, 112, 243, 0.8)",
//   strokeWidth: 2,
// };

// export function EditablePageHolder(p: Props) {
//   let div!: HTMLDivElement;
//   let mainCanvas!: HTMLCanvasElement;
//   let overlayCanvas!: HTMLCanvasElement;
//   let animationFrameId: number | undefined;
//   let mainCachedContext: CanvasRenderingContext2D | undefined;
//   let overlayCachedContext: CanvasRenderingContext2D | undefined;
//   let mainCanvasTrackingId: string | undefined;
//   let overlayCanvasTrackingId: string | undefined;

//   const scale = p.scalePixelResolution ?? 1;
//   const fixedCanvasW = Math.round(_GLOBAL_CANVAS_PIXEL_WIDTH * scale);
//   const fixedCanvasH = Math.round(p.fixedCanvasH * scale);
//   const unscaledW = _GLOBAL_CANVAS_PIXEL_WIDTH;
//   const unscaledH = p.fixedCanvasH;

//   const [err, setErr] = createSignal<string>("");
//   const [overflow, setOverflow] = createSignal<boolean>(false);
//   const [hitRegions, setHitRegions] = createSignal<PageHitTarget[]>([]);
//   const [currentHit, setCurrentHit] = createSignal<PageHitTarget | undefined>(
//     undefined,
//   );
//   const [isCanvasHovered, setIsCanvasHovered] = createSignal(false);
//   const [measuredPage, setMeasuredPage] = createSignal<
//     MeasuredPage | undefined
//   >();
//   const [dragState, setDragState] = createSignal<
//     {
//       target: PageHitTargetColDivider;
//       startX: number;
//       currentX: number;
//       colsNode: MeasuredColsLayoutNode<PageContentItem>;
//       nColumns: number;
//     } | undefined
//   >();

//   onMount(() => {
//     mainCanvas.width = fixedCanvasW;
//     mainCanvas.height = fixedCanvasH;
//     overlayCanvas.width = fixedCanvasW;
//     overlayCanvas.height = fixedCanvasH;

//     mainCachedContext = mainCanvas.getContext("2d", {
//       willReadFrequently: false,
//     })!;
//     overlayCachedContext = overlayCanvas.getContext("2d", {
//       willReadFrequently: false,
//     })!;

//     if (scale !== 1) {
//       mainCachedContext.save();
//       mainCachedContext.scale(scale, scale);
//       overlayCachedContext.save();
//       overlayCachedContext.scale(scale, scale);
//     }

//     mainCanvasTrackingId = trackCanvas(mainCanvas, "EditablePageHolder-main");
//     overlayCanvasTrackingId = trackCanvas(
//       overlayCanvas,
//       "EditablePageHolder-overlay",
//     );

//     if (p.pageInputs) {
//       const style = new CustomStyle(p.pageInputs.style);
//       const fonts = style.getFontsToRegister();
//       fonts.forEach((fontInfo: FontInfo) => {
//         loadFont(fontInfo.fontFamily);
//       });
//     }

//     if (p.textRenderingOptions?.fallbackFonts) {
//       p.textRenderingOptions.fallbackFonts.forEach((fontInfo) => {
//         loadFont(fontInfo.fontFamily);
//       });
//     }

//     document.addEventListener("keydown", handleKeyDown);
//   });

//   createEffect(() => {
//     fontsReady();

//     updatePage(
//       mainCachedContext!,
//       p.pageInputs,
//       setErr,
//       setOverflow,
//       setHitRegions,
//       setMeasuredPage,
//       unscaledW,
//       unscaledH,
//       p.textRenderingOptions,
//       p.externalError,
//       p.onMeasured,
//       animationFrameId,
//       (id: number | undefined) => {
//         animationFrameId = id;
//       },
//     );

//     onCleanup(() => {
//       if (animationFrameId !== undefined) {
//         cancelAnimationFrame(animationFrameId);
//       }
//     });
//   });

//   createEffect(() => {
//     const hit = currentHit();
//     const regions = hitRegions();
//     const canvasHovered = isCanvasHovered();
//     const drag = dragState();
//     const ctx = overlayCachedContext;
//     if (!ctx) return;

//     ctx.clearRect(0, 0, unscaledW, unscaledH);

//     const style = p.hoverStyle ?? DEFAULT_HOVER_STYLE;
//     const displayedWidth = overlayCanvas.getBoundingClientRect().width;
//     const screenPixelSize = displayedWidth > 0 ? unscaledW / displayedWidth : 1;

//     if (canvasHovered && style.showLayoutBoundaries) {
//       // Layout items - dotted rect boundaries
//       const layoutItems = regions.filter((r) => r.type === "layoutItem");
//       const hitLayoutId = hit?.type === "layoutItem" ? hit.node.id : undefined;
//       for (const region of layoutItems) {
//         renderBoundary(
//           ctx,
//           region,
//           hitLayoutId === region.node.id,
//           screenPixelSize,
//         );
//       }

//       // Text items - dotted rect boundaries
//       const textItems = regions.filter((r) => isTextHitTarget(r));
//       for (const region of textItems) {
//         const isThisHovered = hit?.type === region.type;
//         renderBoundary(ctx, region, isThisHovered, screenPixelSize);
//       }

//       // Dividers - thin lines (not rects)
//       const dividers = regions.filter(
//         (r): r is PageHitTargetColDivider => r.type === "colDivider",
//       );
//       for (const region of dividers) {
//         const isThisHovered = hit?.type === "colDivider" &&
//           hit.gap.colsNodeId === region.gap.colsNodeId &&
//           hit.gap.afterColIndex === region.gap.afterColIndex;
//         if (!isThisHovered) {
//           renderDividerLine(ctx, region, false, screenPixelSize);
//         }
//       }
//     }

//     if (drag) {
//       const { target, startX, currentX } = drag;
//       const gap = target.gap;
//       const deltaX = currentX - startX;
//       const snappedX = calculateSnappedDividerX(drag, deltaX);

//       ctx.strokeStyle = "rgba(0, 112, 243, 0.9)";
//       ctx.lineWidth = 2 * screenPixelSize;
//       ctx.beginPath();
//       ctx.moveTo(snappedX, gap.line.y1);
//       ctx.lineTo(snappedX, gap.line.y2);
//       ctx.stroke();
//     } else if (hit) {
//       renderHover(ctx, hit, style, screenPixelSize);
//     }

//     p.onHover?.(drag ? undefined : hit);
//   });

//   onCleanup(() => {
//     if (animationFrameId !== undefined) {
//       cancelAnimationFrame(animationFrameId);
//     }

//     if (scale !== 1) {
//       if (mainCachedContext) mainCachedContext.restore();
//       if (overlayCachedContext) overlayCachedContext.restore();
//     }

//     if (mainCanvasTrackingId) untrackCanvas(mainCanvasTrackingId);
//     if (overlayCanvasTrackingId) untrackCanvas(overlayCanvasTrackingId);

//     if (mainCanvas) releaseCanvasGPUMemory(mainCanvas);
//     if (overlayCanvas) releaseCanvasGPUMemory(overlayCanvas);

//     mainCachedContext = undefined;
//     overlayCachedContext = undefined;

//     setDragState(undefined);
//     document.removeEventListener("keydown", handleKeyDown);
//   });

//   function handlePointerEnter() {
//     setIsCanvasHovered(true);
//   }

//   function handlePointerMove(e: PointerEvent) {
//     const coords = getCanvasCoords(e, overlayCanvas, scale);
//     const drag = dragState();

//     if (drag) {
//       setDragState({ ...drag, currentX: coords.x });
//       return;
//     }

//     const hit = findHitTarget(hitRegions(), coords.x, coords.y);
//     setCurrentHit(hit);
//   }

//   function handlePointerDown(e: PointerEvent) {
//     const hit = currentHit();
//     if (hit?.type !== "colDivider" || !p.onDividerDrag) return;

//     const mPage = measuredPage();
//     if (!mPage || mPage.type !== "freeform") return;

//     const colsNode = findColsNodeById(mPage.mLayout, hit.gap.colsNodeId);
//     if (!colsNode) return;

//     e.preventDefault();
//     overlayCanvas.setPointerCapture(e.pointerId);

//     const coords = getCanvasCoords(e, overlayCanvas, scale);
//     setDragState({
//       target: hit,
//       startX: coords.x,
//       currentX: coords.x,
//       colsNode,
//       nColumns: mPage.mergedPageStyle.content.nColumns,
//     });
//   }

//   function handlePointerUp(e: PointerEvent) {
//     const drag = dragState();
//     if (!drag) return;

//     overlayCanvas.releasePointerCapture(e.pointerId);
//     justFinishedDrag = true;

//     const coords = getCanvasCoords(e, overlayCanvas, scale);
//     const deltaX = coords.x - drag.startX;

//     if (Math.abs(deltaX) > 5) {
//       const update = calculateDividerDragUpdate(drag, deltaX);
//       if (update) {
//         p.onDividerDrag?.(update);
//       }
//     }

//     setDragState(undefined);
//   }

//   function handlePointerCancel(e: PointerEvent) {
//     if (dragState()) {
//       overlayCanvas.releasePointerCapture(e.pointerId);
//       setDragState(undefined);
//     }
//   }

//   function handlePointerLeave() {
//     setIsCanvasHovered(false);
//     if (!dragState()) {
//       setCurrentHit(undefined);
//     }
//   }

//   let justFinishedDrag = false;

//   function handleClick() {
//     if (justFinishedDrag) {
//       justFinishedDrag = false;
//       return;
//     }
//     const hit = currentHit();
//     if (hit) {
//       p.onClick?.(hit);
//     }
//   }

//   function handleKeyDown(e: KeyboardEvent) {
//     if (e.key === "Escape" && dragState()) {
//       setDragState(undefined);
//     }
//   }

//   function handleContextMenu(e: MouseEvent) {
//     if (!p.onContextMenu) return;
//     const coords = getCanvasCoords(e, overlayCanvas, scale);
//     const hit = findHitTarget(hitRegions(), coords.x, coords.y);
//     if (hit) {
//       e.preventDefault();
//       p.onContextMenu(e, hit);
//     }
//   }

//   return (
//     <div
//       ref={div!}
//       class="relative w-full data-[fitWithin=true]:h-full"
//       data-fitWithin={!!p.fitWithin}
//     >
//       <Show when={err() || overflow()}>
//         <Switch>
//           <Match when={p.simpleError}>
//             <div class="absolute inset-0 flex items-center justify-center">
//               <div class="bg-danger text-base-100 pointer-events-none p-1 text-xs">
//                 <Show when={err()}>Config error</Show>
//                 <Show when={!err()}>Layout overflow</Show>
//               </div>
//             </div>
//           </Match>
//           <Match when={true}>
//             <div class="ui-pad absolute left-0 top-0">
//               <div class="ui-pad ui-spy-sm bg-danger text-base-100 pointer-events-none text-xs">
//                 <Show when={err()}>
//                   <div class="">{err()}</div>
//                 </Show>
//                 <Show when={!err()}>
//                   <div class="">Content exceeds available space</div>
//                 </Show>
//               </div>
//             </div>
//           </Match>
//         </Switch>
//       </Show>

//       <canvas
//         ref={mainCanvas!}
//         class="pointer-events-none absolute left-1/2 top-0 -translate-x-1/2 data-[fitWithin=true]:max-h-full data-[fitWithin=false]:w-full data-[fitWithin=true]:max-w-full"
//         data-fitWithin={!!p.fitWithin}
//       />

//       <canvas
//         ref={overlayCanvas!}
//         id={p.canvasElementId}
//         class="absolute left-1/2 top-0 -translate-x-1/2 data-[fitWithin=true]:max-h-full data-[fitWithin=false]:w-full data-[fitWithin=true]:max-w-full"
//         data-fitWithin={!!p.fitWithin}
//         style={{
//           cursor: dragState()
//             ? "col-resize"
//             : currentHit()?.type === "colDivider"
//             ? "col-resize"
//             : currentHit()
//             ? "pointer"
//             : "default",
//         }}
//         onPointerEnter={handlePointerEnter}
//         onPointerMove={handlePointerMove}
//         onPointerLeave={handlePointerLeave}
//         onPointerDown={handlePointerDown}
//         onPointerUp={handlePointerUp}
//         onPointerCancel={handlePointerCancel}
//         onClick={handleClick}
//         onContextMenu={handleContextMenu}
//       />
//     </div>
//   );
// }

// function updatePage(
//   ctx: CanvasRenderingContext2D,
//   pageInputs: PageInputs | undefined,
//   setErr: Setter<string>,
//   setOverflow: Setter<boolean>,
//   setHitRegions: Setter<PageHitTarget[]>,
//   setMeasuredPage: Setter<MeasuredPage | undefined>,
//   unscaledW: number,
//   unscaledH: number,
//   textRenderingOptions: TextRenderingOptions | undefined,
//   externalError: string | undefined,
//   onMeasured: ((measured: MeasuredPage) => void) | undefined,
//   currentFrameId?: number,
//   setFrameId?: (id: number | undefined) => void,
// ) {
//   if (currentFrameId !== undefined) {
//     cancelAnimationFrame(currentFrameId);
//   }

//   const frameId = requestAnimationFrame(() => {
//     if (setFrameId) setFrameId(undefined);
//     if (externalError) {
//       setErr(externalError);
//       return;
//     }
//     if (!pageInputs) {
//       return;
//     }

//     setErr("");

//     (async () => {
//       try {
//         const rc = new CanvasRenderContext(ctx, textRenderingOptions);
//         const rcd = new RectCoordsDims([0, 0, unscaledW, unscaledH]);

//         const mPage = await PageRenderer.measure(rc, rcd, pageInputs);
//         setOverflow(mPage.overflow);

//         const regions = buildHitRegions(mPage);
//         setHitRegions(regions);
//         setMeasuredPage(mPage);

//         onMeasured?.(mPage);

//         await PageRenderer.render(rc, mPage);
//       } catch (e) {
//         console.error("EditablePageHolder render error:", e);
//         const errorMessage = e instanceof Error ? e.message : String(e);
//         setErr("Bad chart config: " + errorMessage);
//       }
//     })();
//   });

//   if (setFrameId) setFrameId(frameId);
// }

// function getCanvasCoords(
//   e: { clientX: number; clientY: number },
//   canvas: HTMLCanvasElement,
//   scale: number,
// ): { x: number; y: number } {
//   const rect = canvas.getBoundingClientRect();
//   return {
//     x: ((canvas.width * (e.clientX - rect.left)) / rect.width) / scale,
//     y: ((canvas.height * (e.clientY - rect.top)) / rect.height) / scale,
//   };
// }

// function renderBoundary(
//   ctx: CanvasRenderingContext2D,
//   target: PageHitTarget,
//   isHovered: boolean,
//   screenPixelSize: number,
// ) {
//   if (isHovered) return;
//   const { rcd } = target;
//   ctx.save();
//   ctx.strokeStyle = "rgba(100, 100, 100, 0.6)";
//   ctx.lineWidth = screenPixelSize;
//   ctx.setLineDash([6 * screenPixelSize, 4 * screenPixelSize]);
//   const inset = screenPixelSize;
//   ctx.strokeRect(
//     rcd.x() + inset,
//     rcd.y() + inset,
//     rcd.w() - inset * 2,
//     rcd.h() - inset * 2,
//   );
//   ctx.restore();
// }

// function renderHover(
//   ctx: CanvasRenderingContext2D,
//   target: PageHitTarget,
//   style: EditableHoverStyle,
//   screenPixelSize: number,
// ) {
//   // Dividers get a thicker blue line, not a rect
//   if (target.type === "colDivider") {
//     renderDividerLine(ctx, target, true, screenPixelSize);
//     return;
//   }

//   const { rcd } = target;

//   if (style.fillColor) {
//     ctx.fillStyle = style.fillColor;
//     ctx.fillRect(rcd.x(), rcd.y(), rcd.w(), rcd.h());
//   }

//   if (style.strokeColor) {
//     ctx.strokeStyle = style.strokeColor;
//     ctx.lineWidth = (style.strokeWidth ?? 2) * screenPixelSize;
//     ctx.strokeRect(rcd.x(), rcd.y(), rcd.w(), rcd.h());
//   }
// }

// function isTextHitTarget(target: PageHitTarget): boolean {
//   return [
//     "coverTitle",
//     "coverSubTitle",
//     "coverAuthor",
//     "coverDate",
//     "sectionTitle",
//     "sectionSubTitle",
//     "headerText",
//     "subHeaderText",
//     "dateText",
//     "footerText",
//   ].includes(target.type);
// }

// function renderDividerLine(
//   ctx: CanvasRenderingContext2D,
//   target: PageHitTargetColDivider,
//   isHovered: boolean,
//   screenPixelSize: number,
// ) {
//   const { gap } = target;

//   if (isHovered) {
//     ctx.strokeStyle = "rgba(0, 112, 243, 0.9)";
//     ctx.lineWidth = 2 * screenPixelSize;
//   } else {
//     ctx.strokeStyle = "rgba(100, 100, 100, 0.6)";
//     ctx.lineWidth = screenPixelSize;
//   }

//   ctx.beginPath();
//   ctx.moveTo(gap.line.x, gap.line.y1);
//   ctx.lineTo(gap.line.x, gap.line.y2);
//   ctx.stroke();
// }

// function calculateSnappedDividerX(
//   drag: DragStateValue,
//   deltaX: number,
// ): number {
//   const { target } = drag;
//   const snapPositions = target.gap.snapPositions;

//   if (!snapPositions || snapPositions.length === 0) {
//     return target.gap.line.x;
//   }

//   // Current mouse position for the divider
//   const mouseX = target.gap.line.x + deltaX;

//   // Find nearest snap position
//   let nearestPos = snapPositions[0];
//   let nearestDist = Math.abs(mouseX - nearestPos);

//   for (const pos of snapPositions) {
//     const dist = Math.abs(mouseX - pos);
//     if (dist < nearestDist) {
//       nearestDist = dist;
//       nearestPos = pos;
//     }
//   }

//   return nearestPos;
// }

// function findColsNodeById<T>(
//   node: MeasuredLayoutNode<T>,
//   id: string,
// ): MeasuredColsLayoutNode<T> | undefined {
//   if (node.type === "cols" && node.id === id) {
//     return node;
//   }
//   if (node.type === "rows" || node.type === "cols") {
//     for (const child of node.children) {
//       const found = findColsNodeById(child, id);
//       if (found) return found;
//     }
//   }
//   return undefined;
// }

// type DragStateValue = {
//   target: PageHitTargetColDivider;
//   startX: number;
//   currentX: number;
//   colsNode: MeasuredColsLayoutNode<PageContentItem>;
//   nColumns: number;
// };

// function calculateDividerDragUpdate(
//   drag: DragStateValue,
//   deltaX: number,
// ): DividerDragUpdate | undefined {
//   const { target, colsNode } = drag;
//   const { afterColIndex } = target.gap;
//   const snapPositions = target.gap.snapPositions;

//   const leftNode = colsNode.children[afterColIndex];
//   const rightNode = colsNode.children[afterColIndex + 1];
//   if (!leftNode || !rightNode) return undefined;

//   if (!snapPositions || snapPositions.length === 0) return undefined;

//   // Find which snap position (and thus span) the mouse is closest to
//   const mouseX = target.gap.line.x + deltaX;
//   let nearestIndex = 0;
//   let nearestDist = Math.abs(mouseX - snapPositions[0]);

//   for (let i = 1; i < snapPositions.length; i++) {
//     const dist = Math.abs(mouseX - snapPositions[i]);
//     if (dist < nearestDist) {
//       nearestDist = dist;
//       nearestIndex = i;
//     }
//   }

//   // Snap positions correspond to left span of (index + 1) within combinedSpan
//   const currentLeftSpan = leftNode.span ?? 1;
//   const currentRightSpan = rightNode.span ?? 1;
//   const combinedSpan = currentLeftSpan + currentRightSpan;

//   const newLeftSpan = nearestIndex + 1;
//   const newRightSpan = combinedSpan - newLeftSpan;

//   if (newLeftSpan === currentLeftSpan) return undefined;

//   return {
//     colsNodeId: colsNode.id,
//     leftNodeId: leftNode.id,
//     rightNodeId: rightNode.id,
//     suggestedSpans: {
//       left: newLeftSpan,
//       right: newRightSpan,
//     },
//     totalSpans: combinedSpan,
//   };
// }
