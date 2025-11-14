// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  Coordinates,
  type CustomFigureStyle,
  getColor,
  type MeasuredText,
  Padding,
  type Primitive,
  RectCoordsDims,
  type RenderContext,
  Z_INDEX,
} from "../deps.ts";
import type { SimpleVizData } from "../types.ts";
import {
  anchorToTopLeft,
  type BoxDimensions,
  calculateBoxDimensions,
} from "./box_dimensions.ts";
import { calculateXCoordinatesFromLayers } from "./box_layout.ts";
import { getTextInfoWithBoxOverride, mergeBoxStyle } from "./style.ts";
import { buildArrowPrimitives } from "./build_arrow_primitives.ts";

export function buildBoxPrimitives(
  rc: RenderContext,
  contentArea: RectCoordsDims,
  data: SimpleVizData,
  customFigureStyle: CustomFigureStyle,
  responsiveScale: number | undefined,
): Primitive[] {
  const primitives: Primitive[] = [];
  const mergedSimpleVizStyle = customFigureStyle.simpleviz();

  ////////////////////////////////////////////////////////////////////////////////
  //                                                                            //
  //  STEP 1: Scale box properties by style.scale                              //
  //                                                                            //
  //  Input: Raw box data with unscaled dimensions and style overrides         //
  //  Output: Boxes scaled by style.scale (e.g., scale=2 means 2x larger)      //
  //  Note: Width, height, leftOffset, strokeWidth, textGap, padding all scale //
  //        Boxes use layer/order layout, not manual x/y coordinates           //
  //                                                                            //
  ////////////////////////////////////////////////////////////////////////////////

  const styleScale = mergedSimpleVizStyle.alreadyScaledValue;
  const styleScaledBoxes = data.boxes.map((box) => ({
    ...box,
    width: box.width !== undefined ? box.width * styleScale : undefined,
    height: box.height !== undefined ? box.height * styleScale : undefined,
    leftOffset: box.leftOffset !== undefined
      ? box.leftOffset * styleScale
      : undefined,
    strokeWidth: box.strokeWidth !== undefined
      ? box.strokeWidth * styleScale
      : undefined,
    textGap: box.textGap !== undefined ? box.textGap * styleScale : undefined,
    padding: box.padding !== undefined
      ? new Padding(box.padding).toScaled(styleScale)
      : undefined,
  }));

  ////////////////////////////////////////////////////////////////////////////////
  //                                                                            //
  //  STEP 2: Measure the WIDTH of each box at natural size                    //
  //                                                                            //
  //  Input: Style-scaled boxes                                                //
  //  Output: Box widths (just width, not height yet)                          //
  //  Note: Width is either explicit (box.width + padding) or auto-sized       //
  //        from text at full style.scale fontSize                             //
  //                                                                            //
  ////////////////////////////////////////////////////////////////////////////////

  const naturalBoxWidths = new Map<string, number>();
  for (const box of styleScaledBoxes) {
    let width: number;
    if (box.width !== undefined) {
      // Explicit width - this is the TOTAL box width
      width = box.width;
    } else {
      // Auto width: measure both texts and take the wider one, then add horizontal padding
      const mergedBoxStyle = mergeBoxStyle(box, mergedSimpleVizStyle.boxes);

      let maxTextWidth = 0;

      if (box.text) {
        const textInfo = getTextInfoWithBoxOverride(
          box.primaryTextStyle,
          mergedSimpleVizStyle.text.primary,
          mergedSimpleVizStyle.text.base,
        );
        const text = Array.isArray(box.text) ? box.text.join("\n") : box.text;
        const mText = rc.mText(text, textInfo, Infinity);
        maxTextWidth = Math.max(maxTextWidth, mText.dims.w());
      }

      if (box.secondaryText) {
        const textInfo = getTextInfoWithBoxOverride(
          box.secondaryTextStyle,
          mergedSimpleVizStyle.text.secondary,
          mergedSimpleVizStyle.text.base,
        );
        const text = Array.isArray(box.secondaryText)
          ? box.secondaryText.join("\n")
          : box.secondaryText;
        const mText = rc.mText(text, textInfo, Infinity);
        maxTextWidth = Math.max(maxTextWidth, mText.dims.w());
      }

      width = maxTextWidth + mergedBoxStyle.padding.totalPx();
    }
    naturalBoxWidths.set(box.id, width);
  }

  ////////////////////////////////////////////////////////////////////////////////
  //                                                                            //
  //  STEP 3-5: Calculate x-coordinates and fitted widths                      //
  //                                                                            //
  //  Input: Style-scaled boxes + their widths + availableWidth                //
  //  Output: Boxes with x-coordinates and fittedWidth, plus widthScale        //
  //  Note: Layout function handles scaling and positioning in one pass        //
  //        Only scales down if needed (widthScale <= 1)                       //
  //        Only calculates x-coordinates, not y (that comes later)            //
  //                                                                            //
  ////////////////////////////////////////////////////////////////////////////////

  const availableWidth = contentArea.w();
  const contentOriginX = contentArea.x();
  const contentOriginY = contentArea.y();

  const boxesWithX = calculateXCoordinatesFromLayers(
    styleScaledBoxes,
    naturalBoxWidths,
    mergedSimpleVizStyle.orderGap,
    availableWidth,
    mergedSimpleVizStyle.layerAlign,
  );

  ////////////////////////////////////////////////////////////////////////////////
  //                                                                            //
  //  STEP 4: Calculate heights and measure text for fitted boxes              //
  //                                                                            //
  //  Input: Boxes with fittedWidth (text may wrap due to narrower width)      //
  //  Output: Map of box id -> { height, mTextPrimary, mTextSecondary }        //
  //  Note: Text fontSize stays at style.scale size (no text scaling)          //
  //        Height may be taller than natural due to text wrapping             //
  //        mText objects are stored for use in primitive rendering            //
  //                                                                            //
  ////////////////////////////////////////////////////////////////////////////////

  const fittedBoxData = new Map<
    string,
    {
      height: number;
      mTextPrimary?: MeasuredText;
      mTextSecondary?: MeasuredText;
      mergedBoxStyle: ReturnType<typeof mergeBoxStyle>;
    }
  >();

  for (const box of boxesWithX) {
    const mergedBoxStyle = mergeBoxStyle(box, mergedSimpleVizStyle.boxes);

    let height: number;
    let mTextPrimary: MeasuredText | undefined;
    let mTextSecondary: MeasuredText | undefined;

    if (box.height !== undefined) {
      // Explicit height - already scaled by styleScale in STEP 1
      height = box.height;
    } else {
      // Auto height - measure text at fitted width
      const textMaxWidth = box.fittedWidth - mergedBoxStyle.padding.totalPx();

      let primaryHeight = 0;
      let secondaryHeight = 0;

      if (box.text) {
        const textInfo = getTextInfoWithBoxOverride(
          box.primaryTextStyle,
          mergedSimpleVizStyle.text.primary,
          mergedSimpleVizStyle.text.base,
        );
        const textStr = Array.isArray(box.text)
          ? box.text.join("\n")
          : box.text;
        mTextPrimary = rc.mText(
          textStr,
          textInfo,
          textMaxWidth,
        );
        primaryHeight = mTextPrimary.dims.h();
      }

      if (box.secondaryText) {
        const textInfo = getTextInfoWithBoxOverride(
          box.secondaryTextStyle,
          mergedSimpleVizStyle.text.secondary,
          mergedSimpleVizStyle.text.base,
        );
        const textStr = Array.isArray(box.secondaryText)
          ? box.secondaryText.join("\n")
          : box.secondaryText;
        mTextSecondary = rc.mText(
          textStr,
          textInfo,
          textMaxWidth,
        );
        secondaryHeight = mTextSecondary.dims.h();
      }

      const gapHeight = box.text && box.secondaryText
        ? mergedBoxStyle.textGap
        : 0;
      const totalTextHeight = primaryHeight + gapHeight + secondaryHeight;

      height = totalTextHeight + mergedBoxStyle.padding.totalPy();
    }

    fittedBoxData.set(box.id, {
      height,
      mTextPrimary,
      mTextSecondary,
      mergedBoxStyle,
    });
  }

  ////////////////////////////////////////////////////////////////////////////////
  //                                                                            //
  //  STEP 5: Calculate y-coordinates for boxes                                //
  //                                                                            //
  //  Input: Boxes with x-coordinates + fitted heights                         //
  //  Output: Boxes with both x,y coordinates                                  //
  //  Note: Position layers vertically with layerGap between them              //
  //        Y-coordinate is the CENTER of the box                              //
  //                                                                            //
  ////////////////////////////////////////////////////////////////////////////////

  // Group boxes by layer
  const boxesByLayer = new Map<number, typeof boxesWithX>();
  for (const box of boxesWithX) {
    const layer = box.layer ?? 0;
    if (!boxesByLayer.has(layer)) {
      boxesByLayer.set(layer, []);
    }
    boxesByLayer.get(layer)!.push(box);
  }

  const sortedLayers = Array.from(boxesByLayer.keys()).sort((a, b) => a - b);

  // Calculate y-coordinate for each layer
  const layerYPositions = new Map<number, number>();
  let currentY = 0;

  for (const layer of sortedLayers) {
    const layerBoxes = boxesByLayer.get(layer)!;
    const maxLayerHeight = Math.max(
      ...layerBoxes.map((b) => fittedBoxData.get(b.id)!.height),
    );

    // Center point of this layer
    layerYPositions.set(layer, currentY + maxLayerHeight / 2);

    // Move down for next layer
    currentY += maxLayerHeight + mergedSimpleVizStyle.layerGap;
  }

  // Create final boxes with both x and y coordinates (offset by content area origin)
  const finalBoxes = boxesWithX.map((box) => ({
    ...box,
    x: box.x + contentOriginX,
    y: layerYPositions.get(box.layer ?? 0)! + contentOriginY,
  }));

  ////////////////////////////////////////////////////////////////////////////////
  //                                                                            //
  //  STEP 6: Transform boxes to primitives                                    //
  //                                                                            //
  //  Input: Boxes with final x,y coordinates + fitted dimensions              //
  //  Output: Box primitives ready to render                                   //
  //                                                                            //
  ////////////////////////////////////////////////////////////////////////////////

  for (const box of finalBoxes) {
    const boxData = fittedBoxData.get(box.id)!;
    const { height, mTextPrimary, mTextSecondary, mergedBoxStyle } = boxData;

    // Convert center coordinates to top-left
    const topLeft = anchorToTopLeft(
      box.x,
      box.y,
      box.fittedWidth,
      height,
      "center",
    );

    const rcd = new RectCoordsDims([
      topLeft.x,
      topLeft.y,
      box.fittedWidth,
      height,
    ]);

    const rectStyle = {
      fillColor: getColor(mergedBoxStyle.fillColor),
      strokeColor: getColor(mergedBoxStyle.strokeColor),
      strokeWidth: mergedBoxStyle.strokeWidth,
    };

    // Calculate text positions if we have text
    let text: { mText: MeasuredText; position: Coordinates } | undefined;
    let secondaryText:
      | { mText: MeasuredText; position: Coordinates }
      | undefined;

    if (mTextPrimary || mTextSecondary) {
      const primaryHeight = mTextPrimary ? mTextPrimary.dims.h() : 0;
      const secondaryHeight = mTextSecondary ? mTextSecondary.dims.h() : 0;
      const gapHeight = mTextPrimary && mTextSecondary
        ? mergedBoxStyle.textGap
        : 0;
      const totalTextHeight = primaryHeight + gapHeight + secondaryHeight;

      // Calculate horizontal position
      let unitCenterX: number;
      switch (mergedBoxStyle.textHorizontalAlign) {
        case "left": {
          const primaryWidth = mTextPrimary ? mTextPrimary.dims.w() : 0;
          const secondaryWidth = mTextSecondary ? mTextSecondary.dims.w() : 0;
          const maxWidth = Math.max(primaryWidth, secondaryWidth);
          unitCenterX = topLeft.x + box.fittedWidth * 0.05 + maxWidth / 2;
          break;
        }
        case "right": {
          const primaryW = mTextPrimary ? mTextPrimary.dims.w() : 0;
          const secondaryW = mTextSecondary ? mTextSecondary.dims.w() : 0;
          const maxW = Math.max(primaryW, secondaryW);
          unitCenterX = topLeft.x + box.fittedWidth - box.fittedWidth * 0.05 -
            maxW / 2;
          break;
        }
        case "center":
        default: {
          unitCenterX = topLeft.x + box.fittedWidth / 2;
        }
      }

      // Calculate vertical position
      let unitCenterY: number;
      switch (mergedBoxStyle.textVerticalAlign) {
        case "top": {
          unitCenterY = topLeft.y + height * 0.05 + totalTextHeight / 2;
          break;
        }
        case "bottom": {
          unitCenterY = topLeft.y + height - height * 0.05 -
            totalTextHeight / 2;
          break;
        }
        case "center":
        default: {
          unitCenterY = topLeft.y + height / 2;
        }
      }

      if (mTextPrimary) {
        const primaryY = unitCenterY - totalTextHeight / 2 + primaryHeight / 2;
        text = {
          mText: mTextPrimary,
          position: new Coordinates([unitCenterX, primaryY]),
        };
      }

      if (mTextSecondary) {
        const secondaryY = unitCenterY + totalTextHeight / 2 -
          secondaryHeight / 2;
        secondaryText = {
          mText: mTextSecondary,
          position: new Coordinates([unitCenterX, secondaryY]),
        };
      }
    }

    const boxPrimitive: Primitive = {
      type: "simpleviz-box",
      key: `box-${box.id}`,
      zIndex: box.zIndex ?? Z_INDEX.SIMPLEVIZ_BOX,
      rcd,
      rectStyle,
      text,
      secondaryText,
      boxId: box.id,
    };

    primitives.push(boxPrimitive);
  }

  ////////////////////////////////////////////////////////////////////////////////
  //                                                                            //
  //  STEP 7: Transform arrows to primitives                                   //
  //                                                                            //
  //  Input: Box primitives + raw arrows                                       //
  //  Output: Arrow primitives using exact box positions                       //
  //                                                                            //
  ////////////////////////////////////////////////////////////////////////////////

  const boxPrimitives = primitives.filter(
    (p): p is Extract<Primitive, { type: "simpleviz-box" }> =>
      p.type === "simpleviz-box",
  );

  const arrowPrimitives = buildArrowPrimitives(
    data.arrows,
    data.boxes,
    boxPrimitives,
    mergedSimpleVizStyle,
  );

  primitives.push(...arrowPrimitives);

  return primitives;
}
