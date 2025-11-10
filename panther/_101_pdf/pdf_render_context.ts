// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type {
  AreaStyle,
  jsPDF,
  LineStyle,
  MeasuredRichText,
  PointStyle,
  RectStyle,
  RichText,
} from "./deps.ts";
import {
  CanvasRenderContext,
  Color,
  Coordinates,
  type CoordinatesOptions,
  getAdjustedColor,
  getColor,
  getRectAlignmentCoords,
  type MeasuredText,
  RectCoordsDims,
  type RectCoordsDimsOptions,
  type RenderContext,
  type TextInfoUnkeyed,
} from "./deps.ts";

function cleanFontFamilyForJsPdf(fontFamily: string): string {
  return fontFamily.replaceAll("'", "");
}

export class PdfRenderContext implements RenderContext {
  _jsPdf: jsPDF;
  _crc: CanvasRenderContext;
  _createCanvas: (width: number, height: number) => any;

  constructor(
    pdf: jsPDF,
    ctx: CanvasRenderingContext2D,
    createCanvas: (width: number, height: number) => any,
  ) {
    this._jsPdf = pdf;
    this._crc = new CanvasRenderContext(ctx);
    this._createCanvas = createCanvas;
  }

  mText(
    text: string,
    ti: TextInfoUnkeyed,
    maxWidth: number,
    opts?: {
      keepLineBreaks?: boolean;
      rotation?: "horizontal" | "anticlockwise" | "clockwise";
    },
  ): MeasuredText {
    return this._crc.mText(text, ti, maxWidth, opts);
  }

  mRichText(
    text: string | RichText,
    ti: TextInfoUnkeyed,
    maxWidth: number,
    opts?: {
      keepLineBreaks?: boolean;
      rotation?: "horizontal" | "anticlockwise" | "clockwise";
    },
  ): MeasuredRichText {
    return this._crc.mRichText(text, ti, maxWidth, opts);
  }

  rRichText(
    mRichText: MeasuredRichText,
    coordsOrBounds: CoordinatesOptions | RectCoordsDimsOptions,
    hAlign: "center" | "left" | "right",
    vAlign?: "top" | "center" | "bottom",
  ): void {
    try {
      // Check if it's a RectCoordsDims
      let coords: CoordinatesOptions;
      if (
        coordsOrBounds instanceof RectCoordsDims ||
        (typeof coordsOrBounds === "object" &&
          !Array.isArray(coordsOrBounds) &&
          "w" in coordsOrBounds &&
          "h" in coordsOrBounds)
      ) {
        coords = getRectAlignmentCoords(
          coordsOrBounds as RectCoordsDimsOptions,
          hAlign,
          vAlign ?? "top",
        );
      } else {
        coords = coordsOrBounds as CoordinatesOptions;
      }

      // Check for vertical text
      if (
        mRichText.rotation === "anticlockwise" ||
        mRichText.rotation === "clockwise"
      ) {
        this.rVerticalRichText(mRichText, coords, hAlign, vAlign);
        return;
      }

      const c = new Coordinates(coords);

      let y = c.y();
      if (vAlign === "center") {
        y -= mRichText.dims.h() / 2;
      }
      if (vAlign === "bottom") {
        y -= mRichText.dims.h();
      }

      // Process each line
      for (const line of mRichText.lines) {
        let x = c.x();

        // Calculate starting x position based on alignment
        if (hAlign === "center") {
          x -= line.totalWidth / 2;
        } else if (hAlign === "right") {
          x -= line.totalWidth;
        }

        // Render each segment in the line
        for (const segment of line.segments) {
          // Skip empty segments
          if (!segment.text || segment.text.length === 0) {
            continue;
          }

          // Set font for this segment
          const fontFamily = cleanFontFamilyForJsPdf(
            segment.ti.font.fontFamily,
          );
          const fontStyle = segment.ti.font.italic ? "italic" : "normal";
          const fontWeight = String(segment.ti.font.weight);

          this._jsPdf.setFont(fontFamily, fontStyle, fontWeight);

          // Set font size
          const fontSizeInPoints = segment.ti.fontSize *
            this._jsPdf.internal.scaleFactor;
          this._jsPdf.setFontSize(fontSizeInPoints);

          // Only set color if it's not "none" (matching Canvas behavior)
          if (segment.ti.color !== "none") {
            if (segment.ti.color.at(0) === "#") {
              //@ts-ignore
              const newGState = new this._jsPdf.GState({ opacity: 1 });
              this._jsPdf.setGState(newGState);
              this._jsPdf.setTextColor(segment.ti.color);
            } else {
              const rgba = new Color(segment.ti.color).rgba();
              //@ts-ignore
              const newGState = new this._jsPdf.GState({ opacity: rgba.a });
              this._jsPdf.setGState(newGState);
              this._jsPdf.setTextColor(rgba.r, rgba.g, rgba.b);
            }
          }

          // Handle letter spacing
          let charSpace = undefined;
          if (segment.ti.letterSpacing.includes("em")) {
            const multiplier = Number(
              segment.ti.letterSpacing.replaceAll("em", ""),
            );
            if (!isNaN(multiplier)) {
              charSpace = segment.ti.fontSize * multiplier;
            }
          }

          // Render the segment text
          this._jsPdf.text(segment.text, x, y + line.y, {
            maxWidth: 0,
            charSpace,
            align: "left", // Always left align individual segments
            baseline: "alphabetic",
            lineHeightFactor: segment.ti.lineHeight,
          });

          // Move x position for next segment
          x += segment.w;
        }
      }
    } catch (e) {
      throw e;
    }
  }

  rText(
    mText: MeasuredText,
    coordsOrBounds: CoordinatesOptions | RectCoordsDimsOptions,
    hAlign: "center" | "left" | "right",
    vAlign?: "top" | "center" | "bottom",
  ): void {
    try {
      // Check if it's a RectCoordsDims
      let coords: CoordinatesOptions;
      if (
        coordsOrBounds instanceof RectCoordsDims ||
        (typeof coordsOrBounds === "object" &&
          !Array.isArray(coordsOrBounds) &&
          "w" in coordsOrBounds &&
          "h" in coordsOrBounds)
      ) {
        coords = getRectAlignmentCoords(
          coordsOrBounds as RectCoordsDimsOptions,
          hAlign,
          vAlign ?? "top",
        );
      } else {
        coords = coordsOrBounds as CoordinatesOptions;
      }

      // Check for vertical text
      if (
        mText.rotation === "anticlockwise" ||
        mText.rotation === "clockwise"
      ) {
        this.rVerticalText(mText, coords, hAlign, vAlign);
        return;
      }

      // Continue with existing horizontal text implementation
      const c = new Coordinates(coords);
      // Clean font family name for jsPDF compatibility
      const fontFamily = cleanFontFamilyForJsPdf(mText.ti.font.fontFamily);
      const fontStyle = mText.ti.font.italic ? "italic" : "normal";
      const fontWeight = String(mText.ti.font.weight);

      // jsPDF expects setFont(fontFamily, fontStyle, fontWeight)
      this._jsPdf.setFont(fontFamily, fontStyle, fontWeight);

      // The "internal.scaleFactor" const is the scaling between POINT and PIXEL units
      // This is needed to convert the font size to POINTs
      // Should always equal 1.33333 but using the internal const just in case
      const fontSizeInPoints = mText.ti.fontSize *
        this._jsPdf.internal.scaleFactor;
      this._jsPdf.setFontSize(fontSizeInPoints);

      // Only set color if it's not "none" (matching Canvas behavior)
      if (mText.ti.color !== "none") {
        if (mText.ti.color.at(0) === "#") {
          //@ts-ignore
          const newGState = new this._jsPdf.GState({ opacity: 1 });
          this._jsPdf.setGState(newGState);
          this._jsPdf.setTextColor(mText.ti.color);
        } else {
          const rgba = new Color(mText.ti.color).rgba();
          //@ts-ignore
          const newGState = new this._jsPdf.GState({ opacity: rgba.a });
          this._jsPdf.setGState(newGState);
          this._jsPdf.setTextColor(rgba.r, rgba.g, rgba.b);
        }
      }

      // Handle letter spacing - only "0px" and "-0.02em" are supported values
      let charSpace = undefined;
      if (mText.ti.letterSpacing.includes("em")) {
        const multiplier = Number(mText.ti.letterSpacing.replaceAll("em", ""));
        if (!isNaN(multiplier)) {
          // Character spacing in jsPDF is of the PIXEL size, not the POINT size
          charSpace = mText.ti.fontSize * multiplier;
        }
      }
      // Note: "0px" results in undefined charSpace, which is correct (default spacing)

      let y = c.y();
      if (vAlign === "center") {
        y -= mText.dims.h() / 2;
      }
      if (vAlign === "bottom") {
        y -= mText.dims.h();
      }

      for (const line of mText.lines) {
        this._jsPdf.text(line.text, c.x(), y + line.y, {
          maxWidth: 0,
          charSpace,
          align: hAlign,
          baseline: "alphabetic",
          lineHeightFactor: mText.ti.lineHeight,
        });
      }
    } catch (e) {
      throw e;
    }
  }

  private rVerticalText(
    mText: MeasuredText,
    coords: CoordinatesOptions,
    hAlign: "center" | "left" | "right",
    vAlign?: "top" | "center" | "bottom",
  ): void {
    const c = new Coordinates(coords);
    const rotation = mText.rotation;

    // Set up font and colors (same as horizontal text)
    // Clean font family name for jsPDF compatibility
    const fontFamily = cleanFontFamilyForJsPdf(mText.ti.font.fontFamily);
    const fontStyle = mText.ti.font.italic ? "italic" : "normal";
    const fontWeight = String(mText.ti.font.weight);

    // jsPDF expects setFont(fontFamily, fontStyle, fontWeight)
    this._jsPdf.setFont(fontFamily, fontStyle, fontWeight);

    const fontSizeInPoints = mText.ti.fontSize *
      this._jsPdf.internal.scaleFactor;
    this._jsPdf.setFontSize(fontSizeInPoints);

    // Only set color if it's not "none" (matching Canvas behavior)
    if (mText.ti.color !== "none") {
      if (mText.ti.color.at(0) === "#") {
        //@ts-ignore
        const newGState = new this._jsPdf.GState({ opacity: 1 });
        this._jsPdf.setGState(newGState);
        this._jsPdf.setTextColor(mText.ti.color);
      } else {
        const rgba = new Color(mText.ti.color).rgba();
        //@ts-ignore
        const newGState = new this._jsPdf.GState({ opacity: rgba.a });
        this._jsPdf.setGState(newGState);
        this._jsPdf.setTextColor(rgba.r, rgba.g, rgba.b);
      }
    }

    // Handle letter spacing - only "0px" and "-0.02em" are supported values
    let charSpace = undefined;
    if (mText.ti.letterSpacing.includes("em")) {
      const multiplier = Number(mText.ti.letterSpacing.replaceAll("em", ""));
      if (!isNaN(multiplier)) {
        // Character spacing in jsPDF is of the PIXEL size, not the POINT size
        charSpace = mText.ti.fontSize * multiplier;
      }
    }
    // Note: "0px" results in undefined charSpace, which is correct (default spacing)

    // Match Canvas implementation exactly
    const align2 = rotation === "anticlockwise"
      ? vAlign === "top" ? "right" : vAlign === "bottom" ? "left" : "center"
      : vAlign === "top"
      ? "left"
      : vAlign === "bottom"
      ? "right"
      : "center";

    const y2 = rotation === "anticlockwise"
      ? hAlign === "left"
        ? 0
        : hAlign === "center"
        ? (0 - mText.dims.w()) / 2
        : 0 - mText.dims.w()
      : hAlign === "left"
      ? 0 - mText.dims.w()
      : hAlign === "center"
      ? (0 - mText.dims.w()) / 2
      : 0;

    // Save context
    this._jsPdf.saveGraphicsState();

    // The Canvas implementation does:
    // 1. ctx.translate(x, y)
    // 2. ctx.rotate(Math.PI * angle) where angle is -0.5 or 0.5
    // 3. ctx.fillText(line.text, 0, y2 + line.y)

    // We need to simulate this with jsPDF's angle parameter
    // jsPDF rotates text around its anchor point, not the origin

    // Calculate the angle in degrees
    const angleInDegrees = rotation === "anticlockwise" ? 90 : -90;

    // When jsPDF rotates text, it rotates around the text position
    // To match Canvas behavior, we need to calculate where the text would be
    // after the Canvas-style transform

    for (const line of mText.lines) {
      // In Canvas, after rotation, text is drawn at (0, y2 + line.y)
      // But jsPDF might handle the rotation differently

      // For vertical text, line.y represents the vertical offset between lines
      // After rotation, this becomes a horizontal offset
      let finalX, finalY;

      if (rotation === "anticlockwise") {
        // 90 degree anticlockwise rotation
        // The first line (smallest line.y) should be rightmost
        // Each subsequent line moves left
        finalX = c.x() + (y2 + line.y); // Note: positive, not negative
        finalY = c.y();
      } else {
        // 90 degree clockwise rotation
        // The first line (smallest line.y) should be leftmost
        // Each subsequent line moves right
        finalX = c.x() - (y2 + line.y); // Note: negative, not positive
        finalY = c.y();
      }

      this._jsPdf.text(line.text, finalX, finalY, {
        maxWidth: 0,
        charSpace,
        align: align2,
        baseline: "alphabetic",
        lineHeightFactor: mText.ti.lineHeight,
        angle: angleInDegrees,
      });
    }

    this._jsPdf.restoreGraphicsState();
  }

  private rVerticalRichText(
    mRichText: MeasuredRichText,
    coords: CoordinatesOptions,
    hAlign: "center" | "left" | "right",
    vAlign?: "top" | "center" | "bottom",
  ): void {
    const c = new Coordinates(coords);
    const rotation = mRichText.rotation;

    // Calculate rotation angle and alignment adjustments
    const angle = rotation === "anticlockwise" ? -90 : 90;

    // Map vertical alignment to horizontal alignment after rotation
    const rotatedAlign = rotation === "anticlockwise"
      ? vAlign === "top" ? "right" : vAlign === "bottom" ? "left" : "center"
      : vAlign === "top"
      ? "left"
      : vAlign === "bottom"
      ? "right"
      : "center";

    // Calculate y offset based on horizontal alignment (which becomes vertical after rotation)
    const yOffset = rotation === "anticlockwise"
      ? hAlign === "left"
        ? 0
        : hAlign === "center"
        ? -mRichText.dims.w() / 2
        : -mRichText.dims.w()
      : hAlign === "left"
      ? -mRichText.dims.w()
      : hAlign === "center"
      ? -mRichText.dims.w() / 2
      : 0;

    // Save context
    this._jsPdf.saveGraphicsState();

    // Process each line
    for (const line of mRichText.lines) {
      // Calculate starting position for the line based on rotated alignment
      let lineStartOffset = 0;
      if (rotatedAlign === "center") {
        lineStartOffset = -line.totalWidth / 2;
      } else if (rotatedAlign === "right") {
        lineStartOffset = -line.totalWidth;
      }

      let currentOffset = 0;

      // Render each segment in the line
      for (const segment of line.segments) {
        // Skip empty segments
        if (!segment.text || segment.text.length === 0) {
          continue;
        }

        // Set font for this segment
        const fontFamily = cleanFontFamilyForJsPdf(segment.ti.font.fontFamily);
        const fontStyle = segment.ti.font.italic ? "italic" : "normal";
        const fontWeight = String(segment.ti.font.weight);

        this._jsPdf.setFont(fontFamily, fontStyle, fontWeight);

        // Set font size
        const fontSizeInPoints = segment.ti.fontSize *
          this._jsPdf.internal.scaleFactor;
        this._jsPdf.setFontSize(fontSizeInPoints);

        // Only set color if it's not "none" (matching Canvas behavior)
        if (segment.ti.color !== "none") {
          if (segment.ti.color.at(0) === "#") {
            //@ts-ignore
            const newGState = new this._jsPdf.GState({ opacity: 1 });
            this._jsPdf.setGState(newGState);
            this._jsPdf.setTextColor(segment.ti.color);
          } else {
            const rgba = new Color(segment.ti.color).rgba();
            //@ts-ignore
            const newGState = new this._jsPdf.GState({ opacity: rgba.a });
            this._jsPdf.setGState(newGState);
            this._jsPdf.setTextColor(rgba.r, rgba.g, rgba.b);
          }
        }

        // Handle letter spacing
        let charSpace = undefined;
        if (segment.ti.letterSpacing.includes("em")) {
          const multiplier = Number(
            segment.ti.letterSpacing.replaceAll("em", ""),
          );
          if (!isNaN(multiplier)) {
            charSpace = segment.ti.fontSize * multiplier;
          }
        }

        // For vertical text, we need to apply the rotation and calculate position
        // The text position needs to account for the segment offset within the line
        const segmentX = c.x() + lineStartOffset + currentOffset;
        const segmentY = c.y() + yOffset + line.y;

        // Render the segment text with rotation
        this._jsPdf.text(segment.text, segmentX, segmentY, {
          maxWidth: 0,
          charSpace,
          align: "left", // Always left align individual segments
          baseline: "alphabetic",
          lineHeightFactor: segment.ti.lineHeight,
          angle: angle,
        });

        // Move offset for next segment
        currentOffset += segment.w;
      }
    }

    this._jsPdf.restoreGraphicsState();
  }

  rLine(coordArray: CoordinatesOptions[], s: LineStyle): void {
    try {
      if (s.show === false) {
        return;
      }
      const f = getColor(s.strokeColor);
      if (f.at(0) === "#") {
        //@ts-ignore
        const newGState = new this._jsPdf.GState({ opacity: 1 });
        this._jsPdf.setGState(newGState);
        this._jsPdf.setDrawColor(f);
      } else {
        const rgba = new Color(f).rgba();
        //@ts-ignore
        const newGState = new this._jsPdf.GState({ opacity: rgba.a });
        this._jsPdf.setGState(newGState);
        this._jsPdf.setDrawColor(rgba.r, rgba.g, rgba.b);
      }
      this._jsPdf.setLineWidth(s.strokeWidth);
      this._jsPdf.setLineJoin("round");
      if (s.lineDash === "dashed") {
        this._jsPdf.setLineDashPattern(
          [s.strokeWidth * 5, s.strokeWidth * 4],
          0,
        );
      } else {
        this._jsPdf.setLineDashPattern([], 0);
      }
      if (coordArray.length === 2) {
        const co1 = coordArray.at(0);
        const co2 = coordArray.at(1);
        if (co1 === undefined || co2 === undefined) {
          return;
        }
        const c1 = new Coordinates(co1);
        const c2 = new Coordinates(co2);
        this._jsPdf.line(c1.x(), c1.y(), c2.x(), c2.y(), "S");
      } else {
        const arr = coordArray.map((co, i_co) => {
          const c = new Coordinates(co);
          return { op: i_co === 0 ? "m" : "l", c: [c.x(), c.y()] };
        });
        this._jsPdf.path(arr);
        this._jsPdf.stroke();
      }

      // Safety measure
      this._jsPdf.setLineDashPattern([], 0);
    } catch (e) {
      throw e;
    }
  }

  rArea(coordArray: CoordinatesOptions[], s: AreaStyle): void {
    try {
      if (s.show === false) {
        return;
      }
      const f = getAdjustedColor(s.fillColor, s.fillColorAdjustmentStrategy);
      if (f.at(0) === "#") {
        //@ts-ignore
        const newGState = new this._jsPdf.GState({ opacity: 1 });
        this._jsPdf.setGState(newGState);
        this._jsPdf.setFillColor(f);
      } else {
        const rgba = new Color(f).rgba();
        //@ts-ignore
        const newGState = new this._jsPdf.GState({ opacity: rgba.a });
        this._jsPdf.setGState(newGState);
        this._jsPdf.setFillColor(rgba.r, rgba.g, rgba.b);
      }
      if (coordArray.length === 2) {
        // Skip rendering for 2 coordinates - cannot form a fillable area
        return;
      } else {
        const arr = coordArray.map((co, i_co) => {
          const c = new Coordinates(co);
          return { op: i_co === 0 ? "m" : "l", c: [c.x(), c.y()] };
        });
        this._jsPdf.path(arr);
        this._jsPdf.fill();
      }
    } catch (e) {
      throw e;
    }
  }

  rRect(rcd: RectCoordsDimsOptions, s: RectStyle): void {
    try {
      if (s.show === false) {
        return;
      }
      const r = new RectCoordsDims(rcd);
      const f = getColor(s.fillColor);
      if (f.at(0) === "#") {
        //@ts-ignore
        const newGState = new this._jsPdf.GState({ opacity: 1 });
        this._jsPdf.setGState(newGState);
        this._jsPdf.setFillColor(f);
      } else {
        const rgba = new Color(f).rgba();
        //@ts-ignore
        const newGState = new this._jsPdf.GState({ opacity: rgba.a });
        this._jsPdf.setGState(newGState);
        this._jsPdf.setFillColor(rgba.r, rgba.g, rgba.b);
      }
      this._jsPdf.rect(r.x(), r.y(), r.w(), r.h(), "F");
    } catch (e) {
      throw e;
    }
  }

  rPoint(coords: CoordinatesOptions, s: PointStyle): void {
    try {
      if (s.show === false) {
        return;
      }
      const c = new Coordinates(coords);
      const fillColor = getAdjustedColor(s.color, s.innerColorStrategy);
      const strokeColor = getColor(s.color);

      // Set up fill color
      if (fillColor.at(0) === "#") {
        //@ts-ignore
        const newGState = new this._jsPdf.GState({ opacity: 1 });
        this._jsPdf.setGState(newGState);
        this._jsPdf.setFillColor(fillColor);
      } else {
        const rgba = new Color(fillColor).rgba();
        //@ts-ignore
        const newGState = new this._jsPdf.GState({ opacity: rgba.a });
        this._jsPdf.setGState(newGState);
        this._jsPdf.setFillColor(rgba.r, rgba.g, rgba.b);
      }

      // Constants for shape calculations (matching Canvas implementation)
      const COSINE_45 = 0.7071067811865476;
      const SINE_60 = 0.8660254037844386;
      const COSINE_60 = 0.5;

      switch (s.pointStyle) {
        case "circle":
          this._jsPdf.circle(c.x(), c.y(), s.radius, "F");
          break;

        case "cross":
          // Cross doesn't have fill, only stroke
          break;

        case "rect": {
          const side = s.radius * COSINE_45;
          this._jsPdf.rect(c.x() - side, c.y() - side, side * 2, side * 2, "F");
          break;
        }

        case "crossRot":
          // CrossRot doesn't have fill, only stroke
          break;

        case "rectRot": {
          const arr = [
            { op: "m", c: [c.x(), c.y() - s.radius] },
            { op: "l", c: [c.x() + s.radius, c.y()] },
            { op: "l", c: [c.x(), c.y() + s.radius] },
            { op: "l", c: [c.x() - s.radius, c.y()] },
            { op: "l", c: [c.x(), c.y() - s.radius] },
          ];
          this._jsPdf.path(arr);
          this._jsPdf.fill();
          break;
        }

        case "triangle": {
          const arr = [
            { op: "m", c: [c.x(), c.y() - s.radius] },
            {
              op: "l",
              c: [c.x() + s.radius * SINE_60, c.y() + s.radius * COSINE_60],
            },
            {
              op: "l",
              c: [c.x() - s.radius * SINE_60, c.y() + s.radius * COSINE_60],
            },
            { op: "l", c: [c.x(), c.y() - s.radius] },
          ];
          this._jsPdf.path(arr);
          this._jsPdf.fill();
          break;
        }
      }

      // Set up stroke color
      if (strokeColor.at(0) === "#") {
        //@ts-ignore
        const newGState = new this._jsPdf.GState({ opacity: 1 });
        this._jsPdf.setGState(newGState);
        this._jsPdf.setDrawColor(strokeColor);
      } else {
        const rgba = new Color(strokeColor).rgba();
        //@ts-ignore
        const newGState = new this._jsPdf.GState({ opacity: rgba.a });
        this._jsPdf.setGState(newGState);
        this._jsPdf.setDrawColor(rgba.r, rgba.g, rgba.b);
      }
      this._jsPdf.setLineWidth(s.strokeWidth);

      // Draw stroke
      switch (s.pointStyle) {
        case "circle":
          this._jsPdf.circle(c.x(), c.y(), s.radius, "D");
          break;

        case "cross":
          this._jsPdf.line(
            c.x(),
            c.y() - s.radius,
            c.x(),
            c.y() + s.radius,
            "S",
          );
          this._jsPdf.line(
            c.x() - s.radius,
            c.y(),
            c.x() + s.radius,
            c.y(),
            "S",
          );
          break;

        case "rect": {
          const side = s.radius * COSINE_45;
          this._jsPdf.rect(c.x() - side, c.y() - side, side * 2, side * 2, "D");
          break;
        }

        case "crossRot": {
          const side = s.radius * COSINE_45;
          this._jsPdf.line(
            c.x() - side,
            c.y() - side,
            c.x() + side,
            c.y() + side,
            "S",
          );
          this._jsPdf.line(
            c.x() + side,
            c.y() - side,
            c.x() - side,
            c.y() + side,
            "S",
          );
          break;
        }

        case "rectRot": {
          const arr = [
            { op: "m", c: [c.x(), c.y() - s.radius] },
            { op: "l", c: [c.x() + s.radius, c.y()] },
            { op: "l", c: [c.x(), c.y() + s.radius] },
            { op: "l", c: [c.x() - s.radius, c.y()] },
            { op: "l", c: [c.x(), c.y() - s.radius] },
          ];
          this._jsPdf.path(arr);
          this._jsPdf.stroke();
          break;
        }

        case "triangle": {
          const arr = [
            { op: "m", c: [c.x(), c.y() - s.radius] },
            {
              op: "l",
              c: [c.x() + s.radius * SINE_60, c.y() + s.radius * COSINE_60],
            },
            {
              op: "l",
              c: [c.x() - s.radius * SINE_60, c.y() + s.radius * COSINE_60],
            },
            { op: "l", c: [c.x(), c.y() - s.radius] },
          ];
          this._jsPdf.path(arr);
          this._jsPdf.stroke();
          break;
        }
      }
    } catch (e) {
      throw e;
    }
  }

  rImage(image: HTMLImageElement | HTMLCanvasElement, ...args: number[]): void {
    try {
      if (args.length === 4) {
        // 5-parameter version: drawImage(image, dx, dy, dw, dh)
        const [dx, dy, dw, dh] = args;

        // Handle our custom image wrapper from @gfx/canvas
        if (
          image &&
          typeof image === "object" &&
          "_isGfxCanvas" in (image as any)
        ) {
          // This is our wrapped @gfx/canvas Image
          const wrapper = image as any;
          const gfxImage = wrapper._gfxCanvasImage;

          // Create a temporary canvas matching the destination size
          const tempCanvas = this._createCanvas(Math.ceil(dw), Math.ceil(dh));
          const tempCtx = tempCanvas.getContext("2d");
          if (!tempCtx) {
            throw new Error("Failed to create temporary canvas context");
          }

          // Draw the image to the canvas at the destination size
          tempCtx.drawImage(gfxImage, 0, 0, dw, dh);

          // Add to PDF using canvas directly
          this._jsPdf.addImage(tempCanvas, "PNG", dx, dy, dw, dh);
        } else {
          // Regular HTMLImageElement or HTMLCanvasElement
          this._jsPdf.addImage(image, "PNG", dx, dy, dw, dh);
        }
      } else if (args.length === 8) {
        // 9-parameter version: drawImage(image, sx, sy, sw, sh, dx, dy, dw, dh)
        const [sx, sy, sw, sh, dx, dy, dw, dh] = args;

        // Create a temporary canvas to hold the cropped image
        const tempCanvas = this._createCanvas(Math.ceil(dw), Math.ceil(dh));
        const tempCtx = tempCanvas.getContext("2d");

        if (!tempCtx) {
          throw new Error("Failed to create temporary canvas context");
        }

        // Get the actual image to draw
        let actualImage = image;
        if (
          image &&
          typeof image === "object" &&
          "_isGfxCanvas" in (image as any)
        ) {
          actualImage = (image as any)._gfxCanvasImage;
        }

        // Draw the cropped portion of the source image
        tempCtx.drawImage(actualImage as any, sx, sy, sw, sh, 0, 0, dw, dh);

        // Add to PDF using canvas directly
        this._jsPdf.addImage(tempCanvas, "PNG", dx, dy, dw, dh);
      } else {
        throw new Error(
          `Invalid number of arguments for rImage: ${args.length + 1}`,
        );
      }
    } catch (e) {
      throw e;
    }
  }
}
