// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { RawBox } from "../types.ts";
import type { BoxDimensions } from "./box_dimensions.ts";

export function calculateCoordinatesFromLayers(
  boxes: RawBox[],
  boxDimensions: Map<string, BoxDimensions>,
  layerGap: number,
  orderGap: number,
  layerAlign: "left" | "center" | "right" | Array<"left" | "center" | "right">,
): { boxes: RawBox[]; maxLayerWidth: number; maxLayerHeight: number } {
  // Separate boxes by layout method
  const coordBoxes = boxes.filter((b) =>
    b.layer === undefined && b.x !== undefined && b.y !== undefined
  );
  const layerBoxes = boxes.filter((b) => b.layer !== undefined);

  if (layerBoxes.length === 0) {
    return { boxes: coordBoxes, maxLayerWidth: 0, maxLayerHeight: 0 };
  }

  // Group boxes by layer
  const boxesByLayer = new Map<number, RawBox[]>();
  for (const box of layerBoxes) {
    const layer = box.layer!;
    if (!boxesByLayer.has(layer)) {
      boxesByLayer.set(layer, []);
    }
    boxesByLayer.get(layer)!.push(box);
  }

  // Calculate coordinates for each layer
  const processedBoxes: RawBox[] = [];
  const boxPositions = new Map<string, { x: number; y: number }>();

  // Sort layers
  const sortedLayers = Array.from(boxesByLayer.keys()).sort((a, b) => a - b);

  // Find minimum layer to normalize positions (so first layer starts at y=0)
  const minLayer = Math.min(...sortedLayers);

  // First pass: calculate positions within each layer and track widths
  const layerWidths = new Map<number, number>();

  for (const layer of sortedLayers) {
    const layerBoxArray = boxesByLayer.get(layer)!;

    // Sort all boxes in this layer by order
    layerBoxArray.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

    // Grid layout: position boxes left-to-right with leftOffset support
    let currentX = 0;
    const y = (layer - minLayer) * layerGap;

    for (const box of layerBoxArray) {
      const dims = boxDimensions.get(box.id);
      if (!dims) continue;

      // Add leftOffset if present (leftOffset is already scaled by style.scale, like width/height)
      if (box.leftOffset) {
        currentX += box.leftOffset;
      }

      const centerX = currentX + dims.width / 2;
      // Store center point of box (before alignment adjustment)
      boxPositions.set(box.id, { x: centerX, y });

      currentX += dims.width + orderGap;
    }

    // Store layer width (subtract final orderGap)
    layerWidths.set(layer, currentX - orderGap);
  }

  // Find maximum layer width and height for bounds
  const maxLayerWidth = Math.max(...layerWidths.values());

  // Calculate actual height based on y-coordinates and dimensions of all layer boxes
  // Boxes are positioned with center at y, so bounds go from (y - height/2) to (y + height/2)
  let minY = Infinity;
  let maxY = -Infinity;
  for (const box of layerBoxes) {
    const dims = boxDimensions.get(box.id);
    if (dims && box.layer !== undefined) {
      const y = (box.layer - minLayer) * layerGap;
      const topY = y - dims.height / 2;
      const bottomY = y + dims.height / 2;
      minY = Math.min(minY, topY);
      maxY = Math.max(maxY, bottomY);
    }
  }
  const maxLayerHeight = maxY > -Infinity && minY < Infinity ? maxY - minY : 0;

  // Second pass: apply alignment adjustments
  for (const layer of sortedLayers) {
    const layerWidth = layerWidths.get(layer)!;

    // Get alignment for this layer
    const alignment = Array.isArray(layerAlign)
      ? (layerAlign[layer] ?? "left")
      : layerAlign;

    // Calculate alignment offset
    let alignmentOffset = 0;
    switch (alignment) {
      case "center":
        alignmentOffset = (maxLayerWidth - layerWidth) / 2;
        break;
      case "right":
        alignmentOffset = maxLayerWidth - layerWidth;
        break;
      case "left":
      default:
        alignmentOffset = 0;
    }

    // Apply alignment offset to all boxes in this layer
    const layerBoxArray = boxesByLayer.get(layer)!;
    for (const box of layerBoxArray) {
      const pos = boxPositions.get(box.id);
      if (pos) {
        boxPositions.set(box.id, {
          x: pos.x + alignmentOffset,
          y: pos.y,
        });
      }
    }
  }

  // Create final boxes with calculated coordinates
  for (const box of layerBoxes) {
    const pos = boxPositions.get(box.id);
    if (pos) {
      processedBoxes.push({
        ...box,
        x: pos.x,
        y: pos.y,
      });
    }
  }

  return {
    boxes: [...coordBoxes, ...processedBoxes],
    maxLayerWidth,
    maxLayerHeight,
  };
}
