// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

// import { createSignal } from "solid-js";
// import { RectCoordsDims, _GLOBAL_CANVAS_PIXEL_WIDTH } from "../../panther/mod";

// export type HitItem<T> = {
//   data: T;
//   rcd: RectCoordsDims;
// };

// type EditableCanvasProps<T> = {
//   onClick: (hitItem: HitItem<T> | undefined) => void;
// };

// export function getEditableCanvas<T>() {
//   let mainCtx: CanvasRenderingContext2D | undefined = undefined;

//   const [hitItems, setHitItems] = createSignal<HitItem<T>[]>([]);

//   async function updateCanvas(
//     renderFunc: (
//       ctx: CanvasRenderingContext2D | undefined,
//     ) => Promise<HitItem<T>[]>,
//   ) {
//     const hitItems = await renderFunc(mainCtx);
//     setHitItems(hitItems);
//   }

//   function EditableCanvas(p: EditableCanvasProps<T>) {
//     let overlayCanvas!: HTMLCanvasElement;
//     let overlayCtx!: CanvasRenderingContext2D;

//     const fixedCanvasW = _GLOBAL_CANVAS_PIXEL_WIDTH;
//     const fixedCanvasH = Math.round(fixedCanvasW * 0.75);

//     let currentlyHitItem: HitItem<T> | undefined = undefined;

//     function hoverCanvas(
//       e: PointerEvent & {
//         currentTarget: HTMLCanvasElement;
//         target: Element;
//       },
//     ) {
//       const bbox = overlayCanvas.getBoundingClientRect();
//       const mx = (overlayCanvas.width * (e.clientX - bbox.left)) / bbox.width;
//       const my = (overlayCanvas.height * (e.clientY - bbox.top)) / bbox.height;
//       const _hitItems = hitItems();
//       for (const hitItem of _hitItems) {
//         if (hitItem.rcd.contains(mx, my)) {
//           if (hitItem === currentlyHitItem) {
//             return;
//           }
//           overlayCanvas.style.cursor = "pointer";
//           currentlyHitItem = hitItem;
//           overlayCtx.fillStyle = "rgba(40,40,40,0.5)";
//           overlayCtx.fillRect(
//             hitItem.rcd.x(),
//             hitItem.rcd.y(),
//             hitItem.rcd.w(),
//             hitItem.rcd.h(),
//           );
//           // overlayCtx.strokeStyle = "blue";
//           // overlayCtx.lineWidth = 20;
//           // overlayCtx.strokeRect(
//           //   hitItem.rcd.x() - 20,
//           //   hitItem.rcd.y() - 20,
//           //   hitItem.rcd.w() + 40,
//           //   hitItem.rcd.h() + 40,
//           // );
//           return;
//         }
//       }
//       handleOut();
//     }

//     function clickCanvas() {
//       if (currentlyHitItem) {
//         p.onClick(currentlyHitItem);
//       }
//     }

//     function handleOut() {
//       overlayCanvas.style.cursor = "default";
//       currentlyHitItem = undefined;
//       overlayCtx.clearRect(0, 0, fixedCanvasW, fixedCanvasH);
//     }

//     return (
//       <div class="relative w-full">
//         <canvas
//           ref={(ref) => {
//             mainCtx = ref.getContext("2d")!;
//           }}
//           class="pointer-events-none absolute w-full border"
//           width={fixedCanvasW}
//           height={fixedCanvasH}
//         />
//         <canvas
//           ref={(ref) => {
//             overlayCanvas = ref;
//             overlayCtx = ref.getContext("2d")!;
//           }}
//           class="absolute w-full border"
//           width={fixedCanvasW}
//           height={fixedCanvasH}
//           onPointerMove={hoverCanvas}
//           onClick={clickCanvas}
//           onPointerOut={handleOut}
//         />
//       </div>
//     );
//   }

//   return { updateCanvas, EditableCanvas };
// }
