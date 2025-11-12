// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  Coordinates,
  CustomFigureStyle,
  getColor,
  getFont,
  RectCoordsDims,
} from "../deps.ts";
import type {
  ArrowPrimitive,
  BoxPrimitive,
  LineStyle,
  MeasuredText,
  MergedSimpleVizStyle,
  Primitive,
  RectStyle,
  RenderContext,
  TextInfoUnkeyed,
} from "../deps.ts";
import type { RawArrow, RawBox, SimpleVizData } from "../types.ts";
import {
  anchorToTopLeft,
  type BoxDimensions,
  calculateBoxDimensions,
} from "./box_dimensions.ts";
import { mergeBoxStyle } from "./style.ts";

////////////////////////////////////////////////////////////////////////////////
//                                                                            //
//    Main Transform Function                                                 //
//                                                                            //
////////////////////////////////////////////////////////////////////////////////

export function transformDataToPrimitives(
  rc: RenderContext,
  contentArea: RectCoordsDims,
  data: SimpleVizData,
  customFigureStyle: CustomFigureStyle,
  coordinateScale: number,
  _responsiveScale?: number,
): Primitive[] {
  const primitives: Primitive[] = [];

  // Get merged simpleviz styles from customFigureStyle
  const mergedSimpleVizStyle = customFigureStyle.simpleviz();

  ////////////////////////////////////////////////////////////////////////////////
  //                                                                            //
  //    Two-Pass Measurement System                                             //
  //                                                                            //
  ////////////////////////////////////////////////////////////////////////////////

  // Apply coordinate scale to all box positions (BEFORE auto-fit calculation)
  const scaledBoxes = data.boxes.map((box) => ({
    ...box,
    x: box.x * coordinateScale,
    y: box.y * coordinateScale,
  }));

  // PASS 1: Calculate dimensions at scale=1 to determine scale factor
  const pass1BoxDims = new Map<string, BoxDimensions>();
  for (const box of scaledBoxes) {
    const mergedBoxStyle = mergeBoxStyle(
      box,
      mergedSimpleVizStyle.boxes,
    );
    const dims = calculateBoxDimensions(
      rc,
      box,
      mergedSimpleVizStyle,
      mergedBoxStyle,
      1, // scale = 1 for first pass
    );
    pass1BoxDims.set(box.id, dims);
  }

  // Calculate bounds using pass 1 dimensions
  const bounds = calculateBoundsWithDimensions(scaledBoxes, pass1BoxDims);
  if (!bounds) return primitives;

  // Calculate scale factor to fit content area (no padding)
  const scaleX = contentArea.w() / bounds.width;
  const scaleY = contentArea.h() / bounds.height;
  const scale = Math.min(scaleX, scaleY);

  // PASS 2: Re-calculate dimensions at actual scale
  const pass2BoxDims = new Map<string, BoxDimensions>();
  const boxStrokeWidths = new Map<string, number>();
  for (const box of scaledBoxes) {
    const mergedBoxStyle = mergeBoxStyle(
      box,
      mergedSimpleVizStyle.boxes,
    );
    const dims = calculateBoxDimensions(
      rc,
      box,
      mergedSimpleVizStyle,
      mergedBoxStyle,
      scale,
    );
    pass2BoxDims.set(box.id, dims);
    boxStrokeWidths.set(box.id, mergedBoxStyle.strokeWidth * scale);
  }

  // Re-calculate bounds with scaled dimensions and coordinates
  const scaledBounds = calculateBoundsWithDimensions(
    scaledBoxes,
    pass2BoxDims,
    scale,
  );
  if (!scaledBounds) return primitives;

  // Recalculate scale to ensure content fills the ENTIRE content area
  const finalScaleX = contentArea.w() / scaledBounds.width;
  const finalScaleY = contentArea.h() / scaledBounds.height;
  const finalScale = Math.min(finalScaleX, finalScaleY);

  // Apply final scale adjustment to all dimensions
  for (const [boxId, dims] of pass2BoxDims) {
    dims.width *= finalScale;
    dims.height *= finalScale;
  }
  for (const [boxId, strokeWidth] of boxStrokeWidths) {
    boxStrokeWidths.set(boxId, strokeWidth * finalScale);
  }

  // Recalculate final bounds after scale adjustment
  const finalBounds = {
    minX: scaledBounds.minX * finalScale,
    minY: scaledBounds.minY * finalScale,
    maxX: scaledBounds.maxX * finalScale,
    maxY: scaledBounds.maxY * finalScale,
    width: scaledBounds.width * finalScale,
    height: scaledBounds.height * finalScale,
  };

  // Calculate offset to align content to top-left of content area
  const offsetX = contentArea.x() - finalBounds.minX;
  const offsetY = contentArea.y() - finalBounds.minY;

  // Update scale for coordinate transformation
  const combinedScale = scale * finalScale;

  ////////////////////////////////////////////////////////////////////////////////
  //                                                                            //
  //    Transform to Primitives                                                 //
  //                                                                            //
  ////////////////////////////////////////////////////////////////////////////////

  // Transform boxes to primitives
  for (const box of scaledBoxes) {
    const dims = pass2BoxDims.get(box.id)!;
    const boxPrim = transformBox(
      rc,
      box,
      dims,
      combinedScale,
      offsetX,
      offsetY,
      mergedSimpleVizStyle,
    );
    primitives.push(boxPrim);
  }

  // Transform arrows to primitives (use scaledBoxes for coordinate lookups)
  for (const arrow of data.arrows) {
    const arrowPrim = transformArrow(
      arrow,
      scaledBoxes,
      pass2BoxDims,
      boxStrokeWidths,
      combinedScale,
      offsetX,
      offsetY,
      mergedSimpleVizStyle,
    );
    primitives.push(arrowPrim);
  }

  return primitives;
}

////////////////////////////////////////////////////////////////////////////////
//                                                                            //
//    Box Transformation                                                      //
//                                                                            //
////////////////////////////////////////////////////////////////////////////////

function transformBox(
  rc: RenderContext,
  box: RawBox,
  dims: BoxDimensions,
  scale: number,
  offsetX: number,
  offsetY: number,
  mergedSimpleVizStyle: MergedSimpleVizStyle,
): BoxPrimitive {
  const mergedStyle = mergeBoxStyle(
    box,
    mergedSimpleVizStyle.boxes,
  );

  // Convert anchor point to top-left (dims already scaled, so scale coordinates)
  const anchor = box.anchor ?? "center";
  const topLeft = anchorToTopLeft(
    box.x * scale,
    box.y * scale,
    dims.width,
    dims.height,
    anchor,
  );

  const x = topLeft.x + offsetX;
  const y = topLeft.y + offsetY;
  const width = dims.width;
  const height = dims.height;

  const rcd = new RectCoordsDims([x, y, width, height]);

  const rectStyle: RectStyle = {
    fillColor: getColor(mergedStyle.fillColor),
    strokeColor: getColor(mergedStyle.strokeColor),
    strokeWidth: mergedStyle.strokeWidth * scale,
  };

  let text: BoxPrimitive["text"] | undefined;
  let secondaryText: BoxPrimitive["secondaryText"] | undefined;

  // Measure both texts if present
  let mTextPrimary: MeasuredText | undefined;
  let mTextSecondary: MeasuredText | undefined;

  if (box.text) {
    const textStr = Array.isArray(box.text) ? box.text.join("\n") : box.text;
    const textInfo: TextInfoUnkeyed = {
      ...mergedSimpleVizStyle.text.primary,
      fontSize: mergedSimpleVizStyle.text.primary.fontSize * scale,
    };
    mTextPrimary = rc.mText(textStr, textInfo, Infinity);
  }

  if (box.secondaryText) {
    const textStr = Array.isArray(box.secondaryText)
      ? box.secondaryText.join("\n")
      : box.secondaryText;
    const textInfo: TextInfoUnkeyed = {
      ...mergedSimpleVizStyle.text.secondary,
      fontSize: mergedSimpleVizStyle.text.secondary.fontSize * scale,
    };
    mTextSecondary = rc.mText(textStr, textInfo, Infinity);
  }

  // Position texts as a unit
  if (mTextPrimary || mTextSecondary) {
    const scaledGap = mergedStyle.textGap * scale;

    // Calculate combined dimensions
    const primaryHeight = mTextPrimary ? mTextPrimary.dims.h() : 0;
    const secondaryHeight = mTextSecondary ? mTextSecondary.dims.h() : 0;
    const gapHeight = mTextPrimary && mTextSecondary ? scaledGap : 0;
    const totalHeight = primaryHeight + gapHeight + secondaryHeight;

    // Calculate horizontal position (same for both texts based on box alignment)
    let unitCenterX: number;
    switch (mergedStyle.textHorizontalAlign) {
      case "left":
        // For left align, use the widest text to determine center offset
        const primaryWidth = mTextPrimary ? mTextPrimary.dims.w() : 0;
        const secondaryWidth = mTextSecondary ? mTextSecondary.dims.w() : 0;
        const maxWidth = Math.max(primaryWidth, secondaryWidth);
        unitCenterX = x + width * 0.05 + maxWidth / 2;
        break;
      case "right":
        const primaryW = mTextPrimary ? mTextPrimary.dims.w() : 0;
        const secondaryW = mTextSecondary ? mTextSecondary.dims.w() : 0;
        const maxW = Math.max(primaryW, secondaryW);
        unitCenterX = x + width - width * 0.05 - maxW / 2;
        break;
      case "center":
      default:
        unitCenterX = x + width / 2;
    }

    // Calculate vertical position of unit center
    let unitCenterY: number;
    switch (mergedStyle.textVerticalAlign) {
      case "top":
        unitCenterY = y + height * 0.05 + totalHeight / 2;
        break;
      case "bottom":
        unitCenterY = y + height - height * 0.05 - totalHeight / 2;
        break;
      case "center":
      default:
        unitCenterY = y + height / 2;
    }

    // Position primary text relative to unit center
    if (mTextPrimary) {
      const primaryY = unitCenterY - totalHeight / 2 + primaryHeight / 2;
      text = {
        mText: mTextPrimary,
        position: new Coordinates([unitCenterX, primaryY]),
      };
    }

    // Position secondary text relative to unit center
    if (mTextSecondary) {
      const secondaryY = unitCenterY + totalHeight / 2 - secondaryHeight / 2;
      secondaryText = {
        mText: mTextSecondary,
        position: new Coordinates([unitCenterX, secondaryY]),
      };
    }
  }

  return {
    type: "simpleviz-box",
    key: `box-${box.id}`,
    layer: "content-bar",
    rcd,
    rectStyle,
    text,
    secondaryText,
    boxId: box.id,
  };
}

////////////////////////////////////////////////////////////////////////////////
//                                                                            //
//    Arrow Transformation                                                    //
//                                                                            //
////////////////////////////////////////////////////////////////////////////////

function resolveArrowPoints(
  arrow: RawArrow,
  boxes: RawBox[],
  boxDims: Map<string, BoxDimensions>,
  boxStrokeWidths: Map<string, number>,
  scale: number,
  offsetX: number,
  offsetY: number,
  strokeWidth: number,
  arrowDefaults: MergedSimpleVizStyle["arrows"],
): [number, number][] {
  if (arrow.type === "points") {
    return arrow.points as [number, number][];
  }

  // Type is "box-ids" - resolve to points
  const fromBox = boxes.find((b) => b.id === arrow.fromBoxID);
  const toBox = boxes.find((b) => b.id === arrow.toBoxID);

  if (!fromBox) {
    throw new Error(
      `Arrow ${arrow.id}: fromBoxID "${arrow.fromBoxID}" not found`,
    );
  }
  if (!toBox) {
    throw new Error(`Arrow ${arrow.id}: toBoxID "${arrow.toBoxID}" not found`);
  }

  const fromDims = boxDims.get(fromBox.id);
  const toDims = boxDims.get(toBox.id);

  if (!fromDims) {
    throw new Error(
      `Arrow ${arrow.id}: dimensions not found for fromBoxID "${arrow.fromBoxID}"`,
    );
  }
  if (!toDims) {
    throw new Error(
      `Arrow ${arrow.id}: dimensions not found for toBoxID "${arrow.toBoxID}"`,
    );
  }

  // Calculate center points of boxes using anchor + dimensions
  // boxDims are already scaled, so scale coordinates and apply offset to match transformBox
  const fromAnchor = fromBox.anchor ?? "center";
  const toAnchor = toBox.anchor ?? "center";

  const fromTopLeft = anchorToTopLeft(
    fromBox.x * scale,
    fromBox.y * scale,
    fromDims.width,
    fromDims.height,
    fromAnchor,
  );
  const toTopLeft = anchorToTopLeft(
    toBox.x * scale,
    toBox.y * scale,
    toDims.width,
    toDims.height,
    toAnchor,
  );

  const fromCenter: [number, number] = [
    fromTopLeft.x + fromDims.width / 2 + offsetX,
    fromTopLeft.y + fromDims.height / 2 + offsetY,
  ];
  const toCenter: [number, number] = [
    toTopLeft.x + toDims.width / 2 + offsetX,
    toTopLeft.y + toDims.height / 2 + offsetY,
  ];

  // Find intersection points on box edges, adjusted for stroke widths and truncation
  // The offset moves the arrow centerline away from the box edge
  // This ensures the OUTER edge of the arrow stroke is 'truncate' pixels from the OUTER edge of box stroke
  // NOTE: truncation is in FINAL OUTPUT PIXELS and should NOT be scaled by auto-fit scale
  const arrowHalfStroke = strokeWidth / 2;
  const fromBoxStrokeWidth = boxStrokeWidths.get(fromBox.id) || 0;
  const toBoxStrokeWidth = boxStrokeWidths.get(toBox.id) || 0;
  const fromBoxHalfStroke = fromBoxStrokeWidth / 2;
  const toBoxHalfStroke = toBoxStrokeWidth / 2;
  const truncateStart = arrow.truncateStart ?? arrowDefaults.truncateStart;
  const truncateEnd = arrow.truncateEnd ?? arrowDefaults.truncateEnd;
  const startOffset = fromBoxHalfStroke + arrowHalfStroke + truncateStart;
  const endOffset = toBoxHalfStroke + arrowHalfStroke + truncateEnd;

  const fromPoint = getBoxEdgeIntersection(
    fromCenter,
    toCenter,
    { x: fromTopLeft.x + offsetX, y: fromTopLeft.y + offsetY },
    fromDims,
    startOffset,
  );
  const toPoint = getBoxEdgeIntersection(
    toCenter,
    fromCenter,
    { x: toTopLeft.x + offsetX, y: toTopLeft.y + offsetY },
    toDims,
    endOffset,
  );

  return [fromPoint, toPoint];
}

function getBoxEdgeIntersection(
  from: [number, number],
  to: [number, number],
  topLeft: { x: number; y: number },
  dims: BoxDimensions,
  offset: number,
): [number, number] {
  const [x1, y1] = from;
  const [x2, y2] = to;

  // Box boundaries
  const left = topLeft.x;
  const right = topLeft.x + dims.width;
  const top = topLeft.y;
  const bottom = topLeft.y + dims.height;

  // Direction vector
  const dx = x2 - x1;
  const dy = y2 - y1;

  // If no movement, return center
  if (dx === 0 && dy === 0) {
    return [x1, y1];
  }

  // Normalize direction vector
  const length = Math.sqrt(dx * dx + dy * dy);
  const ndx = dx / length;
  const ndy = dy / length;

  // Calculate intersection with each edge
  const intersections: Array<[number, number, number]> = [];

  // Left edge (x = left)
  if (dx !== 0) {
    const t = (left - x1) / dx;
    const y = y1 + t * dy;
    if (t >= 0 && y >= top && y <= bottom) {
      intersections.push([left, y, t]);
    }
  }

  // Right edge (x = right)
  if (dx !== 0) {
    const t = (right - x1) / dx;
    const y = y1 + t * dy;
    if (t >= 0 && y >= top && y <= bottom) {
      intersections.push([right, y, t]);
    }
  }

  // Top edge (y = top)
  if (dy !== 0) {
    const t = (top - y1) / dy;
    const x = x1 + t * dx;
    if (t >= 0 && x >= left && x <= right) {
      intersections.push([x, top, t]);
    }
  }

  // Bottom edge (y = bottom)
  if (dy !== 0) {
    const t = (bottom - y1) / dy;
    const x = x1 + t * dx;
    if (t >= 0 && x >= left && x <= right) {
      intersections.push([x, bottom, t]);
    }
  }

  // Get the intersection with smallest t > 0 (closest to start point)
  if (intersections.length === 0) {
    return [x1, y1];
  }

  intersections.sort((a, b) => a[2] - b[2]);
  const [ix, iy] = [intersections[0][0], intersections[0][1]];

  // Move the intersection point outward by the offset distance
  // Offset includes: halfStroke (to prevent stroke penetration) + truncate (for gap)
  return [ix + ndx * offset, iy + ndy * offset];
}

function transformArrow(
  arrow: RawArrow,
  boxes: RawBox[],
  boxDims: Map<string, BoxDimensions>,
  boxStrokeWidths: Map<string, number>,
  scale: number,
  offsetX: number,
  offsetY: number,
  mergedSimpleVizStyle: MergedSimpleVizStyle,
): ArrowPrimitive {
  const arrowDefaults = mergedSimpleVizStyle.arrows;

  // Get stroke widths (unscaled and scaled)
  const rawStrokeWidth = arrow.style?.strokeWidth ?? arrowDefaults.strokeWidth;
  const scaledStrokeWidth = rawStrokeWidth * scale;

  // Resolve arrow to points (already in final coordinates - no scaling needed)
  const points = resolveArrowPoints(
    arrow,
    boxes,
    boxDims,
    boxStrokeWidths,
    scale,
    offsetX,
    offsetY,
    scaledStrokeWidth,
    arrowDefaults,
  );

  // Points are already in final coordinates
  const pathCoords = points.map((p) => new Coordinates(p));

  if (pathCoords.length < 2) {
    throw new Error(`Arrow ${arrow.id} must have at least 2 points`);
  }

  // Get line style with defaults
  const lineStyle: LineStyle = {
    strokeColor: arrow.style?.strokeColor ?? arrowDefaults.strokeColor,
    strokeWidth: scaledStrokeWidth,
    lineDash: arrow.style?.lineDash ?? arrowDefaults.lineDash,
  };

  // Calculate arrowhead size (default: strokeWidth * 5)
  const arrowheadSize = arrow.arrowheadSize
    ? arrow.arrowheadSize * scale
    : scaledStrokeWidth * 5;

  // Calculate arrowheads
  // For box-ids: always end arrow, no start arrow
  // For points: use explicit startArrow/endArrow
  let arrowheads: ArrowPrimitive["arrowheads"] | undefined;

  const hasStartArrow = arrow.type === "points" && arrow.startArrow;
  const hasEndArrow = arrow.type === "box-ids" ||
    (arrow.type === "points" && arrow.endArrow);

  if (hasStartArrow || hasEndArrow) {
    arrowheads = {};

    if (hasStartArrow) {
      const angle = calculateAngle(pathCoords[1], pathCoords[0]);
      arrowheads.start = {
        position: pathCoords[0],
        angle,
      };
    }

    if (hasEndArrow) {
      const len = pathCoords.length;
      const angle = calculateAngle(pathCoords[len - 2], pathCoords[len - 1]);
      arrowheads.end = {
        position: pathCoords[len - 1],
        angle,
      };
    }
  }

  return {
    type: "simpleviz-arrow",
    key: `arrow-${arrow.id}`,
    layer: "content-line",
    pathCoords,
    lineStyle,
    arrowheadSize,
    arrowheads,
    arrowId: arrow.id,
  };
}

////////////////////////////////////////////////////////////////////////////////
//                                                                            //
//    Helper Functions                                                        //
//                                                                            //
////////////////////////////////////////////////////////////////////////////////

function calculateBoundsWithDimensions(
  boxes: RawBox[],
  boxDims: Map<string, BoxDimensions>,
  coordScale: number = 1,
): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
} | null {
  if (boxes.length === 0) return null;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const box of boxes) {
    const dims = boxDims.get(box.id);
    if (!dims) continue;

    const anchor = box.anchor ?? "center";
    const topLeft = anchorToTopLeft(
      box.x * coordScale,
      box.y * coordScale,
      dims.width,
      dims.height,
      anchor,
    );

    minX = Math.min(minX, topLeft.x);
    minY = Math.min(minY, topLeft.y);
    maxX = Math.max(maxX, topLeft.x + dims.width);
    maxY = Math.max(maxY, topLeft.y + dims.height);
  }

  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

// DEPRECATED: Legacy function for backwards compatibility with explicit width/height
export function calculateBounds(boxes: RawBox[]): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
} | null {
  if (boxes.length === 0) return null;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const box of boxes) {
    if (box.width === undefined || box.height === undefined) {
      throw new Error(
        `Box "${box.id}" is missing width or height. Use auto-sizing with text and padding, or provide explicit dimensions.`,
      );
    }
    minX = Math.min(minX, box.x);
    minY = Math.min(minY, box.y);
    maxX = Math.max(maxX, box.x + box.width);
    maxY = Math.max(maxY, box.y + box.height);
  }

  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

function calculateAngle(from: Coordinates, to: Coordinates): number {
  const dx = to.x() - from.x();
  const dy = to.y() - from.y();
  return Math.atan2(dy, dx);
}
