// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  Coordinates,
  getColor,
  RectCoordsDims,
  type CustomFigureStyle,
  type Primitive,
  type RenderContext,
} from "../deps.ts";
import type { SimpleVizData } from "../types.ts";
import {
  anchorToTopLeft,
  calculateBoxDimensions,
  type BoxDimensions,
} from "./box_dimensions.ts";
import { calculateCoordinatesFromLayers } from "./layout.ts";
import { mergeBoxStyle } from "./style.ts";

export function transformDataToPrimitives(
  rc: RenderContext,
  contentArea: RectCoordsDims,
  data: SimpleVizData,
  customFigureStyle: CustomFigureStyle,
  coordinateScale: number,
  responsiveScale: number | undefined,
): Primitive[] {
  const primitives: Primitive[] = [];
  const mergedSimpleVizStyle = customFigureStyle.simpleviz();

  // Scale all box properties by style.scale upfront
  const styleScale = mergedSimpleVizStyle.alreadyScaledValue;
  const styleScaledBoxes = data.boxes.map((box) => ({
    ...box,
    width: box.width !== undefined ? box.width * styleScale : undefined,
    height: box.height !== undefined ? box.height * styleScale : undefined,
    leftOffset: box.leftOffset !== undefined ? box.leftOffset * styleScale : undefined,
    x: box.x !== undefined ? box.x * coordinateScale : undefined,
    y: box.y !== undefined ? box.y * coordinateScale : undefined,
  }));

  // Calculate dimensions at full style scale
  const naturalBoxDims = new Map<string, BoxDimensions>();
  for (const box of styleScaledBoxes) {
    const mergedBoxStyle = mergeBoxStyle(box, mergedSimpleVizStyle.boxes);
    const dims = calculateBoxDimensions(
      rc,
      box,
      mergedSimpleVizStyle,
      mergedBoxStyle,
    );
    naturalBoxDims.set(box.id, dims);
  }

  // Calculate layout at full scale to determine natural width
  const naturalLayout = calculateCoordinatesFromLayers(
    styleScaledBoxes,
    naturalBoxDims,
    mergedSimpleVizStyle.layerGap,
    mergedSimpleVizStyle.orderGap,
    mergedSimpleVizStyle.layerAlign,
  );

  // Calculate scale factor to fit available width
  const availableWidth = contentArea.w();
  const naturalWidth = naturalLayout.maxLayerWidth;
  const widthScale = naturalWidth > availableWidth ? availableWidth / naturalWidth : 1;

  console.log(`Available width: ${availableWidth}, Natural width: ${naturalWidth}, Width scale: ${widthScale}`);

  // Scale boxes by widthScale to fit
  const fittedBoxes = styleScaledBoxes.map((box) => ({
    ...box,
    width: box.width !== undefined ? box.width * widthScale : undefined,
    height: box.height !== undefined ? box.height * widthScale : undefined,
    leftOffset: box.leftOffset !== undefined ? box.leftOffset * widthScale : undefined,
  }));

  // Recalculate dimensions at fitted scale (text may wrap differently)
  const fittedBoxDims = new Map<string, BoxDimensions>();
  for (const box of fittedBoxes) {
    console.log(`Fitted box ${box.id}: width=${box.width}`);
    const mergedBoxStyle = mergeBoxStyle(box, mergedSimpleVizStyle.boxes);
    const dims = calculateBoxDimensions(
      rc,
      box,
      mergedSimpleVizStyle,
      mergedBoxStyle,
    );
    console.log(`  Calculated dims: width=${dims.width}, height=${dims.height}`);
    fittedBoxDims.set(box.id, dims);
  }

  // Calculate layout at fitted scale - this gives us FINAL x,y coordinates
  const layoutResult = calculateCoordinatesFromLayers(
    fittedBoxes,
    fittedBoxDims,
    mergedSimpleVizStyle.layerGap * widthScale,
    mergedSimpleVizStyle.orderGap * widthScale,
    mergedSimpleVizStyle.layerAlign,
  );

  // NOW recalculate box heights using the ACTUAL final widths from layout
  // The width from fittedBoxDims is correct, we just need to recalculate height
  // in case text wrapping changed
  const finalBoxDims = new Map<string, BoxDimensions>();
  for (const box of layoutResult.boxes) {
    const fittedBox = fittedBoxes.find(b => b.id === box.id)!;
    const mergedBoxStyle = mergeBoxStyle(fittedBox, mergedSimpleVizStyle.boxes);

    // Use the width we already calculated (it's correct)
    const width = fittedBoxDims.get(box.id)!.width;

    // Recalculate dimensions with that width
    const dims = calculateBoxDimensions(
      rc,
      fittedBox,
      mergedSimpleVizStyle,
      mergedBoxStyle,
    );

    finalBoxDims.set(box.id, dims);
  }

  // Create final box dataset with actual final dimensions
  const finalBoxes = layoutResult.boxes.map((box) => {
    const dims = finalBoxDims.get(box.id)!;
    return {
      ...box,
      fittedWidth: dims.width,
      fittedHeight: dims.height,
    };
  });

  // Transform boxes to primitives using final dataset
  for (const box of finalBoxes) {
    if (box.x === undefined || box.y === undefined) continue;

    const dims = {
      width: box.fittedWidth,
      height: box.fittedHeight,
    };

    const mergedBoxStyle = mergeBoxStyle(box, mergedSimpleVizStyle.boxes);
    const boxPrim = transformBox(
      rc,
      box,
      dims,
      mergedBoxStyle,
      mergedSimpleVizStyle,
    );
    primitives.push(boxPrim);
  }

  // TODO: Transform arrows to primitives

  return primitives;
}

////////////////////////////////////////////////////////////////////////////////
//                                                                            //
//    Box Transformation                                                      //
//                                                                            //
////////////////////////////////////////////////////////////////////////////////

function transformBox(
  rc: RenderContext,
  box: ReturnType<typeof calculateCoordinatesFromLayers>["boxes"][0],
  dims: BoxDimensions,
  mergedBoxStyle: ReturnType<typeof mergeBoxStyle>,
  mergedSimpleVizStyle: ReturnType<CustomFigureStyle["simpleviz"]>,
): Primitive {
  console.log(`transformBox ${box.id}: dims.width=${dims.width}, dims.height=${dims.height}, box.width=${box.width}`);

  // Convert anchor point to top-left
  const anchor = box.anchor ?? "center";
  const topLeft = anchorToTopLeft(
    box.x!,
    box.y!,
    dims.width,
    dims.height,
    anchor,
  );

  const rcd = new RectCoordsDims([topLeft.x, topLeft.y, dims.width, dims.height]);

  const rectStyle = {
    fillColor: getColor(mergedBoxStyle.fillColor),
    strokeColor: getColor(mergedBoxStyle.strokeColor),
    strokeWidth: mergedBoxStyle.strokeWidth,
  };

  // Handle text rendering
  let text: { mText: any; position: any } | undefined;
  let secondaryText: { mText: any; position: any } | undefined;

  const textMaxWidth = box.width !== undefined
    ? dims.width - mergedBoxStyle.padding.pl() - mergedBoxStyle.padding.pr()
    : Infinity;

  let mTextPrimary: any | undefined;
  let mTextSecondary: any | undefined;

  if (box.text) {
    const textStr = Array.isArray(box.text) ? box.text.join("\n") : box.text;
    const textInfo: any = {
      ...mergedSimpleVizStyle.text.primary,
      // fontSize already scaled by style.scale - no additional scaling needed
    };
    mTextPrimary = rc.mText(textStr, textInfo, textMaxWidth);
  }

  if (box.secondaryText) {
    const textStr = Array.isArray(box.secondaryText)
      ? box.secondaryText.join("\n")
      : box.secondaryText;
    const textInfo: any = {
      ...mergedSimpleVizStyle.text.secondary,
      // fontSize already scaled by style.scale - no additional scaling needed
    };
    mTextSecondary = rc.mText(textStr, textInfo, textMaxWidth);
  }

  // Position texts as a unit
  if (mTextPrimary || mTextSecondary) {
    const scaledGap = mergedBoxStyle.textGap;

    const primaryHeight = mTextPrimary ? mTextPrimary.dims.h() : 0;
    const secondaryHeight = mTextSecondary ? mTextSecondary.dims.h() : 0;
    const gapHeight = mTextPrimary && mTextSecondary ? scaledGap : 0;
    const totalHeight = primaryHeight + gapHeight + secondaryHeight;

    // Calculate horizontal position
    let unitCenterX: number;
    switch (mergedBoxStyle.textHorizontalAlign) {
      case "left":
        const primaryWidth = mTextPrimary ? mTextPrimary.dims.w() : 0;
        const secondaryWidth = mTextSecondary ? mTextSecondary.dims.w() : 0;
        const maxWidth = Math.max(primaryWidth, secondaryWidth);
        unitCenterX = topLeft.x + dims.width * 0.05 + maxWidth / 2;
        break;
      case "right":
        const primaryW = mTextPrimary ? mTextPrimary.dims.w() : 0;
        const secondaryW = mTextSecondary ? mTextSecondary.dims.w() : 0;
        const maxW = Math.max(primaryW, secondaryW);
        unitCenterX = topLeft.x + dims.width - dims.width * 0.05 - maxW / 2;
        break;
      case "center":
      default:
        unitCenterX = topLeft.x + dims.width / 2;
    }

    // Calculate vertical position
    let unitCenterY: number;
    switch (mergedBoxStyle.textVerticalAlign) {
      case "top":
        unitCenterY = topLeft.y + dims.height * 0.05 + totalHeight / 2;
        break;
      case "bottom":
        unitCenterY = topLeft.y + dims.height - dims.height * 0.05 - totalHeight / 2;
        break;
      case "center":
      default:
        unitCenterY = topLeft.y + dims.height / 2;
    }

    if (mTextPrimary) {
      const primaryY = unitCenterY - totalHeight / 2 + primaryHeight / 2;
      text = {
        mText: mTextPrimary,
        position: new Coordinates([unitCenterX, primaryY]),
      };
    }

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
