// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  type AlignH,
  type AlignV,
  buildItem,
  type ChartReferenceLinePrimitive,
  Coordinates,
  type DataLabel,
  type DataLabelStyle,
  type MergedContentStyle,
  RectCoordsDims,
  REFERENCE_LINE_ITEM_KEY,
  type ReferenceLineInfo,
  type RenderContext,
  type TextInfoUnkeyed,
  unionRectCoordsDims,
  Z_INDEX,
} from "../deps.ts";
import type { ChartItemDataDimensions } from "../chart_items.ts";
import { buildLabelHalo } from "../label_halo.ts";
import {
  namesSubChart,
  subChartItemCoordinates,
  type SubChartMembers,
} from "../sub_chart_members.ts";
import type { ReferenceLine, ReferenceLineLabelPosition } from "../types.ts";
import {
  valueAxisCoord,
  type ValueAxisMapping,
} from "./calculate_mapped_coordinates.ts";
import {
  buildDataLabelTextStyle,
  dataLabelBox,
} from "./content_generation_types.ts";

export type ReferenceLineContext = {
  i_pane: number;
  i_tier: number;
  i_lane: number;
  nPanes: number;
  nTiers: number;
  nLanes: number;
  members: SubChartMembers;
  itemDataDimensions: ChartItemDataDimensions;
  style: MergedContentStyle["referenceLines"];
  dataLabelsTextStyle: TextInfoUnkeyed;
};

// The lines of one value axis drawn in one sub-chart: each its selection
// names whose value lies in the axis's drawn range, since content is not
// clipped and a line past the sub-chart would cross the axis's tick labels.
export function generateReferenceLinePrimitives(
  rc: RenderContext,
  ctx: ReferenceLineContext,
  axis: {
    key: string;
    referenceLines: ReferenceLine[];
    mapping: ValueAxisMapping;
  },
): ChartReferenceLinePrimitive[] {
  const { valueMin, valueMax } = axis.mapping.valueRange;
  return axis.referenceLines.flatMap((line, i_line) => {
    if (
      !namesSubChart(line, ctx.members) || line.value < valueMin ||
      line.value > valueMax
    ) {
      return [];
    }
    const info: ReferenceLineInfo = {
      id: line.id,
      value: line.value,
      label: line.label,
      valueMin,
      valueMax,
      i_pane: ctx.i_pane,
      nPanes: ctx.nPanes,
      paneMember: ctx.members.paneMember,
      i_tier: ctx.i_tier,
      nTiers: ctx.nTiers,
      tierMember: ctx.members.tierMember,
      i_lane: ctx.i_lane,
      nLanes: ctx.nLanes,
      laneMember: ctx.members.laneMember,
    };
    const style = ctx.style.getStyle(info);
    if (!style.show) {
      return [];
    }
    const rcd = axis.mapping.subChartRcd;
    const coord = valueAxisCoord(line.value, axis.mapping);
    const isHorizontalLine = axis.mapping.orientation === "vertical";
    const halfStroke = style.strokeWidth / 2;
    const coords: [Coordinates, Coordinates] = isHorizontalLine
      ? [
        new Coordinates([rcd.x(), coord]),
        new Coordinates([rcd.rightX(), coord]),
      ]
      : [
        new Coordinates([coord, rcd.y()]),
        new Coordinates([coord, rcd.bottomY()]),
      ];
    const strokeBox = isHorizontalLine
      ? new RectCoordsDims({
        x: rcd.x(),
        y: coord - halfStroke,
        w: rcd.w(),
        h: style.strokeWidth,
      })
      : new RectCoordsDims({
        x: coord - halfStroke,
        y: rcd.y(),
        w: style.strokeWidth,
        h: rcd.h(),
      });
    const text = line.label ?? "";
    const label = style.label.show && text !== ""
      ? placeReferenceLineLabel(rc, {
        text,
        labelPosition: line.labelPosition ?? "top-right",
        rcd,
        coord,
        halfStroke,
        isHorizontalLine,
        labelStyle: style.label,
        dataLabelsTextStyle: ctx.dataLabelsTextStyle,
      })
      : undefined;
    const bounds = label === undefined
      ? strokeBox
      : unionRectCoordsDims([strokeBox, dataLabelBox(label, label)]);
    return [{
      type: "chart-reference-line",
      key:
        `reference-line-${axis.key}-${ctx.i_pane}-${ctx.i_tier}-${ctx.i_lane}-${i_line}`,
      item: buildItem([
        ...subChartItemCoordinates(ctx.itemDataDimensions, ctx.members),
        [REFERENCE_LINE_ITEM_KEY, line.id],
      ]),
      part: "body",
      hitBounds: bounds,
      bounds,
      zIndex: Z_INDEX.CONTENT_REFERENCE_LINE,
      meta: { referenceLine: info },
      coords,
      style: {
        strokeColor: style.strokeColor,
        strokeWidth: style.strokeWidth,
        lineDash: style.lineDash,
      },
      label,
    }];
  });
}

// On a horizontal line the horizontal word names the line's end and the
// vertical word the side; on a vertical line the other way round.
const LABEL_CORNERS: Record<
  ReferenceLineLabelPosition,
  { vertical: "top" | "bottom"; horizontal: "left" | "right" }
> = {
  "top-left": { vertical: "top", horizontal: "left" },
  "top-right": { vertical: "top", horizontal: "right" },
  "bottom-left": { vertical: "bottom", horizontal: "left" },
  "bottom-right": { vertical: "bottom", horizontal: "right" },
};

type LabelSpec = {
  text: string;
  labelPosition: ReferenceLineLabelPosition;
  rcd: RectCoordsDims;
  coord: number;
  halfStroke: number;
  isHorizontalLine: boolean;
  labelStyle: DataLabelStyle;
  dataLabelsTextStyle: TextInfoUnkeyed;
};

// The label's box stands its offset clear of the line's stroke and its offset
// inside the sub-chart's edge at its end. It takes the other side of the line
// only where its box would cross the sub-chart's edge on its own side and
// fits on the other.
function placeReferenceLineLabel(
  rc: RenderContext,
  spec: LabelSpec,
): DataLabel {
  const { rcd, coord, halfStroke, isHorizontalLine, labelStyle } = spec;
  const { offset } = labelStyle;
  const halo = buildLabelHalo(labelStyle);
  const halfBorder = (halo?.borderWidth ?? 0) / 2;
  const outset = {
    left: halfBorder + (halo?.padding.pl() ?? 0),
    right: halfBorder + (halo?.padding.pr() ?? 0),
    top: halfBorder + (halo?.padding.pt() ?? 0),
    bottom: halfBorder + (halo?.padding.pb() ?? 0),
  };
  const roomWidth = isHorizontalLine ? rcd.w() - 2 * offset : Math.max(
    coord - halfStroke - offset - (rcd.x() + offset),
    rcd.rightX() - offset - (coord + halfStroke + offset),
  );
  const mText = rc.mText(
    spec.text,
    buildDataLabelTextStyle(spec.dataLabelsTextStyle, labelStyle),
    Math.max(0, roomWidth - outset.left - outset.right),
  );
  const corner = LABEL_CORNERS[spec.labelPosition];
  const label = (
    x: number,
    y: number,
    alignH: AlignH,
    alignV: AlignV,
  ): DataLabel => ({
    mText,
    position: new Coordinates([x, y]),
    alignH,
    alignV,
    halo,
  });

  const besideHorizontalLine = (side: "top" | "bottom") =>
    label(
      corner.horizontal === "left"
        ? rcd.x() + offset + outset.left
        : rcd.rightX() - offset - outset.right,
      side === "top"
        ? coord - halfStroke - offset - outset.bottom
        : coord + halfStroke + offset + outset.top,
      corner.horizontal,
      side === "top" ? "bottom" : "top",
    );
  const besideVerticalLine = (side: "left" | "right") =>
    label(
      side === "left"
        ? coord - halfStroke - offset - outset.right
        : coord + halfStroke + offset + outset.left,
      corner.vertical === "top"
        ? rcd.y() + offset + outset.top
        : rcd.bottomY() - offset - outset.bottom,
      side === "left" ? "right" : "left",
      corner.vertical,
    );
  const fits = (placed: DataLabel) => {
    const box = dataLabelBox(placed, placed);
    return isHorizontalLine
      ? box.y() >= rcd.y() && box.bottomY() <= rcd.bottomY()
      : box.x() >= rcd.x() && box.rightX() <= rcd.rightX();
  };

  const [asked, other] = isHorizontalLine
    ? [
      besideHorizontalLine(corner.vertical),
      besideHorizontalLine(corner.vertical === "top" ? "bottom" : "top"),
    ]
    : [
      besideVerticalLine(corner.horizontal),
      besideVerticalLine(corner.horizontal === "left" ? "right" : "left"),
    ];
  return fits(asked) || !fits(other) ? asked : other;
}
