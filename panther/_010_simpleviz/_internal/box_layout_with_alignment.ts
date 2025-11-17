// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { RawArrow, RawBox } from "../types.ts";

////////////////////////////////////////////////////////////////////////////////
//                                                                            //
//  Layout: Calculate X-coordinates with Cross-Layer Alignment              //
//                                                                            //
//  Two-pass algorithm:                                                      //
//    Pass 1: Place all boxes at natural scale based on alignment            //
//    Pass 2: Apply uniform scaling to fit canvas                            //
//                                                                            //
////////////////////////////////////////////////////////////////////////////////

export function calculateXCoordinatesWithAlignment(
  boxes: RawBox[],
  arrows: RawArrow[],
  layerPlacementOrder: number[][],
  boxWidths: Map<string, number>,
  orderGap: number,
  availableWidth: number,
): Array<RawBox & { x: number; fittedWidth: number }> {
  if (layerPlacementOrder.length === 0) {
    throw new Error("layerPlacementOrder must contain at least one sequence");
  }

  ////////////////////////////////////////////////////////////////////////////////
  //  PASS 1 & 2: Place and scale each sequence independently                  //
  ////////////////////////////////////////////////////////////////////////////////

  // Group boxes by layer
  const boxesByLayer = new Map<number, RawBox[]>();
  for (const box of boxes) {
    const layer = box.layer ?? 0;
    if (!boxesByLayer.has(layer)) {
      boxesByLayer.set(layer, []);
    }
    boxesByLayer.get(layer)!.push(box);
  }

  // Sort boxes within each layer by order
  for (const layerBoxes of boxesByLayer.values()) {
    layerBoxes.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  }

  // Final result: all boxes with x-coordinates and fitted widths
  const allPlacedBoxes = new Map<string, { x: number; fittedWidth: number }>();

  // Track maximum width across all sequences for centering
  let maxSequenceWidth = 0;

  // Process each placement sequence independently
  for (let i = 0; i < layerPlacementOrder.length; i++) {
    const sequence = layerPlacementOrder[i];
    if (sequence.length === 0) {
      throw new Error(
        "Each placement sequence must contain at least one layer",
      );
    }

    const sourceLayer = sequence[0];
    const sequencePlacedBoxes = new Map<string, { x: number; width: number }>();

    ////////////////////////////////////////////////////////////////////////////
    //  PASS 1: Place boxes in this sequence at natural scale                //
    ////////////////////////////////////////////////////////////////////////////

    for (const layerNum of sequence) {
      const layerBoxes = boxesByLayer.get(layerNum);
      if (!layerBoxes) continue;

      if (layerNum === sourceLayer) {
        // Source layer: manual left-to-right placement
        placeSourceLayer(layerBoxes, boxWidths, orderGap, sequencePlacedBoxes);
      } else {
        // Other layers: alignment-based placement
        const isUpward = isLayerUpwardFromSource(
          layerNum,
          sourceLayer,
          arrows,
          boxesByLayer,
        );
        placeAlignedLayer(
          layerBoxes,
          boxWidths,
          orderGap,
          sequencePlacedBoxes,
          arrows,
          isUpward,
        );
      }
    }

    ////////////////////////////////////////////////////////////////////////////
    //  PASS 2: Scale this sequence to fit canvas                            //
    ////////////////////////////////////////////////////////////////////////////

    const { scale, offsetX } = calculateUnifiedScaleAndOffset(
      sequencePlacedBoxes,
      availableWidth,
    );

    // Calculate final width of this sequence
    let minX = Infinity;
    let maxX = -Infinity;
    for (const [_, placed] of sequencePlacedBoxes.entries()) {
      const scaledX = (placed.x + offsetX) * scale;
      const scaledWidth = placed.width * scale;
      const left = scaledX - scaledWidth / 2;
      const right = scaledX + scaledWidth / 2;
      minX = Math.min(minX, left);
      maxX = Math.max(maxX, right);
    }
    const sequenceWidth = maxX - minX;

    // Update max width (consider both sequence widths and availableWidth)
    if (i === 0) {
      maxSequenceWidth = Math.max(sequenceWidth, availableWidth);
    } else {
      maxSequenceWidth = Math.max(maxSequenceWidth, sequenceWidth);
    }

    // Calculate centering offset
    const centeringOffset = (maxSequenceWidth - sequenceWidth) / 2;

    // Store scaled results with centering
    for (const [boxId, placed] of sequencePlacedBoxes.entries()) {
      allPlacedBoxes.set(boxId, {
        x: (placed.x + offsetX) * scale + centeringOffset,
        fittedWidth: placed.width * scale,
      });
    }
  }

  ////////////////////////////////////////////////////////////////////////////////
  //  Return boxes with scaled and shifted positions and widths                //
  ////////////////////////////////////////////////////////////////////////////////

  return boxes.map((box) => {
    const placed = allPlacedBoxes.get(box.id);
    if (!placed) {
      throw new Error(`Box ${box.id} was not placed`);
    }
    return {
      ...box,
      x: placed.x,
      fittedWidth: placed.fittedWidth,
    };
  });
}

////////////////////////////////////////////////////////////////////////////////
//                                                                            //
//  Helper: Place Source Layer                                               //
//                                                                            //
////////////////////////////////////////////////////////////////////////////////

function placeSourceLayer(
  boxes: RawBox[],
  boxWidths: Map<string, number>,
  orderGap: number,
  placedBoxes: Map<string, { x: number; width: number }>,
): void {
  let currentX = 0;

  for (const box of boxes) {
    const width = boxWidths.get(box.id)!;

    // Apply leftOffset if specified
    if (box.leftOffset) {
      currentX += box.leftOffset;
    }

    // Center X position
    const centerX = currentX + width / 2;

    placedBoxes.set(box.id, { x: centerX, width });

    // Move to next position
    currentX += width + orderGap;
  }
}

////////////////////////////////////////////////////////////////////////////////
//                                                                            //
//  Helper: Place Aligned Layer                                              //
//                                                                            //
////////////////////////////////////////////////////////////////////////////////

function placeAlignedLayer(
  boxes: RawBox[],
  boxWidths: Map<string, number>,
  orderGap: number,
  placedBoxes: Map<string, { x: number; width: number }>,
  arrows: RawArrow[],
  isUpward: boolean,
): void {
  // Group boxes by order number
  const boxGroups = new Map<number, RawBox[]>();
  for (const box of boxes) {
    const order = box.order ?? 0;
    if (!boxGroups.has(order)) {
      boxGroups.set(order, []);
    }
    boxGroups.get(order)!.push(box);
  }

  const sortedOrders = Array.from(boxGroups.keys()).sort((a, b) => a - b);

  // Track rightmost X within THIS layer only (not all placed boxes)
  const currentLayerBoxIds = new Set<string>();
  let rightmostXInCurrentLayer = 0;

  for (const order of sortedOrders) {
    const group = boxGroups.get(order)!;

    // Calculate target position for this group
    const targetX = calculateGroupTargetX(group, placedBoxes, arrows, isUpward);

    if (targetX !== null) {
      // Connected boxes: place at target
      placeGroupAtTarget(group, boxWidths, targetX, orderGap, placedBoxes);
    } else {
      // Unconnected boxes: place to right of rightmost IN THIS LAYER
      placeGroupToRight(
        group,
        boxWidths,
        orderGap,
        rightmostXInCurrentLayer,
        placedBoxes,
      );
    }

    // Update rightmost X for this layer
    for (const box of group) {
      currentLayerBoxIds.add(box.id);
      const placed = placedBoxes.get(box.id)!;
      const rightEdge = placed.x + placed.width / 2;
      rightmostXInCurrentLayer = Math.max(rightmostXInCurrentLayer, rightEdge);
    }
  }

  // After placing all groups in this layer, adjust any alignToRightEdge boxes
  const rightmostX = getRightmostX(placedBoxes);
  for (const box of boxes) {
    if (box.alignToRightEdge) {
      const placed = placedBoxes.get(box.id)!;
      const newX = rightmostX - placed.width / 2;
      placedBoxes.set(box.id, { x: newX, width: placed.width });
    }
  }
}

////////////////////////////////////////////////////////////////////////////////
//                                                                            //
//  Helper: Calculate Group Target X Position                                //
//                                                                            //
////////////////////////////////////////////////////////////////////////////////

function calculateGroupTargetX(
  group: RawBox[],
  placedBoxes: Map<string, { x: number; width: number }>,
  arrows: RawArrow[],
  isUpward: boolean,
): number | null {
  // Find all connections from this group to already-placed boxes
  const connectedBoxIds = new Set<string>();

  for (const box of group) {
    for (const arrow of arrows) {
      if (arrow.type !== "box-ids") continue;
      if (arrow.ignoreDuringPlacement) continue; // Skip arrows marked to ignore

      if (arrow.fromBoxID === box.id && placedBoxes.has(arrow.toBoxID)) {
        connectedBoxIds.add(arrow.toBoxID);
      }
      if (arrow.toBoxID === box.id && placedBoxes.has(arrow.fromBoxID)) {
        connectedBoxIds.add(arrow.fromBoxID);
      }
    }
  }

  if (connectedBoxIds.size === 0) {
    return null; // Unconnected
  }

  if (isUpward) {
    // Tree-aware: calculate subtree span center
    // Get max depth from first box in group (all boxes in group should have same depth setting)
    const maxDepth = group[0].subtreeDepth;
    return calculateSubtreeCenter(
      connectedBoxIds,
      placedBoxes,
      arrows,
      maxDepth,
    );
  } else {
    // Simple average
    let sum = 0;
    for (const boxId of connectedBoxIds) {
      sum += placedBoxes.get(boxId)!.x;
    }
    return sum / connectedBoxIds.size;
  }
}

////////////////////////////////////////////////////////////////////////////////
//                                                                            //
//  Helper: Calculate Subtree Center (Tree-Aware)                            //
//                                                                            //
////////////////////////////////////////////////////////////////////////////////

function calculateSubtreeCenter(
  rootBoxIds: Set<string>,
  placedBoxes: Map<string, { x: number; width: number }>,
  arrows: RawArrow[],
  maxDepth: number | undefined,
): number {
  // Find descendants up to maxDepth (or unlimited if maxDepth is undefined)
  // Depth semantics: 1 = only roots (no recursion), 2 = roots + children, etc.
  const allDescendants = new Set<string>(rootBoxIds);

  // If maxDepth is 1, don't recurse at all (just use the roots)
  if (maxDepth === 1) {
    // Skip recursion, just use rootBoxIds
  } else {
    // Recurse to find descendants
    const toExplore: Array<{ id: string; depth: number }> = Array.from(
      rootBoxIds,
    ).map((id) => ({ id, depth: 1 })); // Roots are at depth 1

    const effectiveMaxDepth = maxDepth; // undefined or a number >= 2

    while (toExplore.length > 0) {
      const current = toExplore.pop()!;
      const currentDepth = current.depth;

      // Stop if we've reached max depth
      if (
        effectiveMaxDepth !== undefined &&
        currentDepth >= effectiveMaxDepth
      ) {
        continue;
      }

      for (const arrow of arrows) {
        if (arrow.type !== "box-ids") continue;
        if (arrow.ignoreDuringPlacement) continue; // Skip arrows marked to ignore

        // Find children (boxes this one points to)
        if (arrow.fromBoxID === current.id && placedBoxes.has(arrow.toBoxID)) {
          if (!allDescendants.has(arrow.toBoxID)) {
            allDescendants.add(arrow.toBoxID);
            toExplore.push({ id: arrow.toBoxID, depth: currentDepth + 1 });
          }
        }
      }
    }
  }

  // Calculate span of all descendants
  let minX = Infinity;
  let maxX = -Infinity;

  for (const boxId of allDescendants) {
    const box = placedBoxes.get(boxId)!;
    const left = box.x - box.width / 2;
    const right = box.x + box.width / 2;
    minX = Math.min(minX, left);
    maxX = Math.max(maxX, right);
  }

  return (minX + maxX) / 2;
}

////////////////////////////////////////////////////////////////////////////////
//                                                                            //
//  Helper: Place Group at Target Position                                   //
//                                                                            //
////////////////////////////////////////////////////////////////////////////////

function placeGroupAtTarget(
  group: RawBox[],
  boxWidths: Map<string, number>,
  targetX: number,
  orderGap: number,
  placedBoxes: Map<string, { x: number; width: number }>,
): void {
  if (group.length === 1) {
    // Single box: place at target
    const box = group[0];
    const width = boxWidths.get(box.id)!;
    placedBoxes.set(box.id, { x: targetX, width });
  } else {
    // Multiple boxes: center group at target
    // Calculate total group width (with orderGap between boxes)
    let totalWidth = 0;
    for (let i = 0; i < group.length; i++) {
      totalWidth += boxWidths.get(group[i].id)!;
      if (i < group.length - 1) {
        totalWidth += orderGap;
      }
    }

    // Place boxes left-to-right, centered at target
    let currentX = targetX - totalWidth / 2;
    for (const box of group) {
      const width = boxWidths.get(box.id)!;
      const centerX = currentX + width / 2;
      placedBoxes.set(box.id, { x: centerX, width });
      currentX += width + orderGap;
    }
  }
}

////////////////////////////////////////////////////////////////////////////////
//                                                                            //
//  Helper: Place Group to Right of Rightmost                                //
//                                                                            //
////////////////////////////////////////////////////////////////////////////////

function placeGroupToRight(
  group: RawBox[],
  boxWidths: Map<string, number>,
  orderGap: number,
  startX: number,
  placedBoxes: Map<string, { x: number; width: number }>,
): void {
  // Regular placement to right of current layer
  let currentX = startX + orderGap;

  // Apply leftOffset if specified (only for first box in group)
  if (group.length > 0 && group[0].leftOffset) {
    currentX += group[0].leftOffset;
  }

  for (const box of group) {
    const width = boxWidths.get(box.id)!;
    const centerX = currentX + width / 2;
    placedBoxes.set(box.id, { x: centerX, width });
    currentX += width + orderGap;
  }
}

////////////////////////////////////////////////////////////////////////////////
//                                                                            //
//  Helper: Get Rightmost X Position                                         //
//                                                                            //
////////////////////////////////////////////////////////////////////////////////

function getRightmostX(
  placedBoxes: Map<string, { x: number; width: number }>,
): number {
  let rightmost = 0;
  for (const box of placedBoxes.values()) {
    const right = box.x + box.width / 2;
    rightmost = Math.max(rightmost, right);
  }
  return rightmost;
}

////////////////////////////////////////////////////////////////////////////////
//                                                                            //
//  Helper: Calculate Unified Scale Factor and Offset                        //
//                                                                            //
////////////////////////////////////////////////////////////////////////////////

function calculateUnifiedScaleAndOffset(
  placedBoxes: Map<string, { x: number; width: number }>,
  availableWidth: number,
): { scale: number; offsetX: number } {
  let minX = Infinity;
  let maxX = -Infinity;

  for (const box of placedBoxes.values()) {
    const left = box.x - box.width / 2;
    const right = box.x + box.width / 2;
    minX = Math.min(minX, left);
    maxX = Math.max(maxX, right);
  }

  const totalWidth = maxX - minX;

  // Offset to shift everything to start at x=0
  const offsetX = -minX;

  let scale: number;
  if (totalWidth <= availableWidth) {
    scale = 1.0; // No scaling needed
  } else {
    scale = availableWidth / totalWidth;
  }

  return { scale, offsetX };
}

////////////////////////////////////////////////////////////////////////////////
//                                                                            //
//  Helper: Determine if Layer is Upward from Source                         //
//                                                                            //
////////////////////////////////////////////////////////////////////////////////

function isLayerUpwardFromSource(
  layerNum: number,
  sourceLayer: number,
  arrows: RawArrow[],
  boxesByLayer: Map<number, RawBox[]>,
): boolean {
  // Check arrow direction between this layer and source layer
  const layerBoxIds = new Set(
    (boxesByLayer.get(layerNum) ?? []).map((b) => b.id),
  );
  const sourceBoxIds = new Set(
    (boxesByLayer.get(sourceLayer) ?? []).map((b) => b.id),
  );

  let arrowsToSource = 0;
  let arrowsFromSource = 0;

  for (const arrow of arrows) {
    if (arrow.type !== "box-ids") continue;
    if (arrow.ignoreDuringPlacement) continue; // Skip arrows marked to ignore

    if (layerBoxIds.has(arrow.fromBoxID) && sourceBoxIds.has(arrow.toBoxID)) {
      arrowsToSource++;
    }
    if (sourceBoxIds.has(arrow.fromBoxID) && layerBoxIds.has(arrow.toBoxID)) {
      arrowsFromSource++;
    }
  }

  // If more arrows go TO source, this layer is below (downward = leaves)
  // If more arrows come FROM source, this layer is above (upward = root)
  return arrowsToSource > arrowsFromSource;
}
