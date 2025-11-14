// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { RawBox } from "../types.ts";

////////////////////////////////////////////////////////////////////////////////
//                                                                            //
//  Layout: Calculate X-coordinates from Layer/Order System                  //
//                                                                            //
//  Purpose: Position boxes horizontally within layers, scaling to fit        //
//                                                                            //
//  Input:                                                                    //
//    - boxes: Array of boxes with layer, order, leftOffset, id              //
//    - boxWidths: Map of box id -> natural width (before any scaling)       //
//    - orderGap: Horizontal spacing between boxes (before any scaling)      //
//    - availableWidth: Width to fit within (e.g., canvas width)             //
//    - layerAlign: How to align each layer ("left", "center", "right")      //
//                                                                            //
//  Output:                                                                   //
//    - boxes: Array of boxes with x-coordinates and fitted widths           //
//                                                                            //
//  Assumptions:                                                              //
//    - All boxes use layer/order layout (no manual x/y)                     //
//    - Layer numbers can be non-consecutive (e.g., just layer 2)            //
//    - Boxes in same layer positioned left-to-right by order                //
//    - leftOffset adds extra left margin before a box                       //
//    - Box x-coordinate is the CENTER of the box                            //
//    - If natural width > availableWidth, scale DOWN to fit                 //
//    - If natural width <= availableWidth, NO scaling (widthScale = 1)      //
//    - Scaling applies to widths, leftOffsets, and orderGap consistently    //
//    - NO y-coordinates calculated here (separate pass)                     //
//    - NO heights used here (only widths)                                   //
//                                                                            //
////////////////////////////////////////////////////////////////////////////////

export function calculateXCoordinatesFromLayers(
  boxes: RawBox[],
  boxWidths: Map<string, number>,
  orderGap: number,
  availableWidth: number,
  layerAlign: "left" | "center" | "right" | Array<"left" | "center" | "right">,
): Array<RawBox & { x: number; fittedWidth: number }> {
  ////////////////////////////////////////////////////////////////////////////////
  //  STEP 1: Group and sort boxes by layer                                    //
  ////////////////////////////////////////////////////////////////////////////////

  const boxesByLayer = new Map<number, RawBox[]>();
  for (const box of boxes) {
    const layer = box.layer ?? 0;
    if (!boxesByLayer.has(layer)) {
      boxesByLayer.set(layer, []);
    }
    boxesByLayer.get(layer)!.push(box);
  }

  const sortedLayers = Array.from(boxesByLayer.keys()).sort((a, b) => a - b);

  // Sort boxes within each layer by order
  for (const layerBoxes of boxesByLayer.values()) {
    layerBoxes.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  }

  ////////////////////////////////////////////////////////////////////////////////
  //  STEP 2: For each layer, calculate width, scale, and position boxes       //
  ////////////////////////////////////////////////////////////////////////////////

  const finalBoxData = new Map<string, { x: number; fittedWidth: number }>();

  for (const layer of sortedLayers) {
    const layerBoxes = boxesByLayer.get(layer)!;

    // Calculate natural width for this layer
    let layerNaturalWidth = 0;

    for (let i = 0; i < layerBoxes.length; i++) {
      const box = layerBoxes[i];
      const width = boxWidths.get(box.id)!;

      if (box.leftOffset) {
        layerNaturalWidth += box.leftOffset;
      }

      layerNaturalWidth += width;

      if (i < layerBoxes.length - 1) {
        layerNaturalWidth += orderGap;
      }
    }

    // Calculate widthScale for THIS layer only
    const layerWidthScale = layerNaturalWidth > availableWidth
      ? availableWidth / layerNaturalWidth
      : 1;

    const layerFittedWidth = layerNaturalWidth * layerWidthScale;
    const scaledOrderGap = orderGap * layerWidthScale;

    // Get alignment for this layer
    const alignment = Array.isArray(layerAlign)
      ? (layerAlign[layer] ?? "left")
      : layerAlign;

    // Calculate alignment offset
    let alignmentOffset = 0;
    switch (alignment) {
      case "center":
        alignmentOffset = (availableWidth - layerFittedWidth) / 2;
        break;
      case "right":
        alignmentOffset = availableWidth - layerFittedWidth;
        break;
      case "left":
      default:
        alignmentOffset = 0;
    }

    // Position boxes left-to-right
    let currentLeft = alignmentOffset;

    for (const box of layerBoxes) {
      const naturalWidth = boxWidths.get(box.id)!;
      const fittedWidth = naturalWidth * layerWidthScale;

      if (box.leftOffset) {
        currentLeft += box.leftOffset * layerWidthScale;
      }

      // Box x-coordinate is CENTER of box
      const centerX = currentLeft + fittedWidth / 2;

      finalBoxData.set(box.id, { x: centerX, fittedWidth });

      // Move to next box position
      currentLeft += fittedWidth + scaledOrderGap;
    }
  }

  ////////////////////////////////////////////////////////////////////////////////
  //  STEP 5: Create output boxes with x-coordinates and fitted widths         //
  ////////////////////////////////////////////////////////////////////////////////

  return boxes.map((box) => {
    const data = finalBoxData.get(box.id)!;
    return {
      ...box,
      x: data.x,
      fittedWidth: data.fittedWidth,
    };
  });
}
