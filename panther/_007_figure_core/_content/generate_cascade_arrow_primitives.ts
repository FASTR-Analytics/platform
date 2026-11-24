// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type {
  ChartBarPrimitive,
  ChartCascadeArrowPrimitive,
  DataLabel,
  MeasuredText,
  PathSegment,
} from "../deps.ts";
import { Coordinates, RectCoordsDims, Z_INDEX } from "../deps.ts";
import type {
  ContentGenerationContext,
  ResolvedCascadeArrow,
  SubChartContent,
} from "./content_generation_types.ts";

export function generateCascadeArrowPrimitives(
  bars: ChartBarPrimitive[],
  content: SubChartContent,
  ctx: ContentGenerationContext,
): ChartCascadeArrowPrimitive[] {
  const barByValue = new Map(bars.map((bar) => [bar.meta.value, bar]));
  return content.resolvedCascadeArrows.flatMap((arrow) => {
    const fromBar = barByValue.get(arrow.from);
    const toBar = barByValue.get(arrow.to);
    return fromBar === undefined || toBar === undefined
      ? []
      : [computeCascadeArrow(fromBar, toBar, arrow, ctx)];
  });
}

export function cascadeArrowLabelStandoff(
  mText: MeasuredText,
  style: ResolvedCascadeArrow["style"],
): number {
  const dl = style.dataLabel;
  return mText.dims.h() + dl.padding.pb() +
    (dl.borderWidth > 0 ? dl.borderWidth / 2 : 0) + style.arrowLabelGap +
    dl.offset;
}

function computeCascadeArrow(
  fromBar: ChartBarPrimitive,
  toBar: ChartBarPrimitive,
  arrow: ResolvedCascadeArrow,
  ctx: ContentGenerationContext,
): ChartCascadeArrowPrimitive {
  const s = arrow.style;
  const sw = s.strokeWidth;

  const fromX = fromBar.bounds.rightX() - sw / 2;
  const fromY = fromBar.bounds.y() + sw / 2;
  const toX = toBar.bounds.x() + sw / 2;
  const toY = toBar.bounds.y() + sw / 2;

  const midX = (fromX + toX) / 2;
  const diffY = toY - fromY;
  const lengthOfArrowWithGracefulTrunk = s.arrowHeadLength + s.arrowTrunkLength;

  const arrowGap = ((toX - fromX) * (1 - s.arrowLengthFractionOfSpace)) / 2;

  let pathSegments: PathSegment[];
  let arrowEndX: number;
  let arrowEndY: number;
  let cpX: number;
  let cpY: number;

  if (diffY < 0) {
    const absDiffY = -diffY;
    const diffX = toX - fromX;

    if (diffX < lengthOfArrowWithGracefulTrunk + arrowGap) {
      // Tight arrival: not enough horizontal room for arrowhead
      const hypot = lengthOfArrowWithGracefulTrunk + arrowGap;
      const arrowGapPct = arrowGap / hypot;
      const yShiftUp = Math.sqrt(hypot * hypot - diffX * diffX);
      const arrowGapX = arrowGapPct * diffX;
      const arrowGapY = arrowGapPct * yShiftUp;
      cpX = fromX;
      cpY = toY - yShiftUp;
      arrowEndX = toX - arrowGapX;
      arrowEndY = toY - arrowGapY;

      pathSegments = [
        { type: "moveTo", x: fromX, y: fromY - arrowGap },
        {
          type: "bezierCurveTo",
          cp1x: cpX,
          cp1y: cpY,
          cp2x: cpX,
          cp2y: cpY,
          x: arrowEndX,
          y: arrowEndY,
        },
      ];
    } else if (absDiffY < lengthOfArrowWithGracefulTrunk + arrowGap) {
      // Tight departure: not enough vertical room for graceful start
      const hypot = lengthOfArrowWithGracefulTrunk + arrowGap;
      const arrowGapPct = arrowGap / hypot;
      const xShiftRight = Math.sqrt(hypot * hypot - absDiffY * absDiffY);
      const arrowGapX = arrowGapPct * xShiftRight;
      const arrowGapY = arrowGapPct * absDiffY;
      cpX = fromX + xShiftRight;
      cpY = toY;
      arrowEndX = toX - arrowGap;
      arrowEndY = toY;

      pathSegments = [
        { type: "moveTo", x: fromX + arrowGapX, y: fromY - arrowGapY },
        {
          type: "bezierCurveTo",
          cp1x: cpX,
          cp1y: cpY,
          cp2x: cpX,
          cp2y: cpY,
          x: arrowEndX,
          y: arrowEndY,
        },
      ];
    } else {
      // Generous: enough room in both directions
      cpX = fromX;
      cpY = toY;
      arrowEndX = toX - arrowGap;
      arrowEndY = toY;

      pathSegments = [
        { type: "moveTo", x: fromX, y: fromY - arrowGap },
        {
          type: "bezierCurveTo",
          cp1x: cpX,
          cp1y: cpY,
          cp2x: cpX,
          cp2y: cpY,
          x: arrowEndX,
          y: arrowEndY,
        },
      ];
    }
  } else if (diffY === 0) {
    cpX = midX;
    cpY = fromY;
    arrowEndX = toX - arrowGap;
    arrowEndY = fromY;

    pathSegments = [
      { type: "moveTo", x: fromX + arrowGap, y: fromY },
      { type: "lineTo", x: arrowEndX, y: arrowEndY },
    ];
  } else if (diffY < lengthOfArrowWithGracefulTrunk + arrowGap) {
    const hypot = lengthOfArrowWithGracefulTrunk + arrowGap;
    const arrowGapPct = arrowGap / hypot;
    const xShiftLeft = Math.sqrt(hypot * hypot - diffY * diffY);
    const arrowGapX = arrowGapPct * xShiftLeft;
    const arrowGapY = arrowGapPct * diffY;
    cpX = toX - xShiftLeft;
    cpY = fromY;
    arrowEndX = toX - arrowGapX;
    arrowEndY = toY - arrowGapY;

    pathSegments = [
      { type: "moveTo", x: fromX + arrowGap, y: fromY },
      {
        type: "bezierCurveTo",
        cp1x: cpX,
        cp1y: cpY,
        cp2x: cpX,
        cp2y: cpY,
        x: arrowEndX,
        y: arrowEndY,
      },
    ];
  } else {
    cpX = toX;
    cpY = fromY;
    arrowEndX = toX;
    arrowEndY = toY - arrowGap;

    pathSegments = [
      { type: "moveTo", x: fromX + arrowGap, y: fromY },
      {
        type: "bezierCurveTo",
        cp1x: cpX,
        cp1y: cpY,
        cp2x: cpX,
        cp2y: cpY,
        x: arrowEndX,
        y: arrowEndY,
      },
    ];
  }

  const angle = Math.atan2(arrowEndY - cpY, arrowEndX - cpX);

  const dl = s.dataLabel;
  const label = arrow.label;
  const highestY = Math.min(fromY, toY);
  const dlPadTop = dl.padding.pt();
  const dlBorderHalf = dl.borderWidth > 0 ? dl.borderWidth / 2 : 0;
  const labelY = label
    ? highestY - (sw / 2 + cascadeArrowLabelStandoff(label.mText, s))
    : highestY;

  const dataLabel: DataLabel | undefined = label === undefined ? undefined : {
    mText: label.mText,
    position: new Coordinates({ x: midX, y: labelY }),
    alignH: "center",
    alignV: "top",
    halo: label.halo,
  };

  const minX = Math.min(fromX + arrowGap, arrowEndX) - sw;
  const labelTopY = label ? labelY - dlPadTop - dlBorderHalf : labelY;
  const minY = Math.min(fromY, arrowEndY, labelTopY) - sw;
  const maxX = Math.max(fromX + arrowGap, arrowEndX) + sw;
  const maxY = Math.max(fromY, arrowEndY) + sw;
  const bounds = new RectCoordsDims({
    x: minX,
    y: minY,
    w: maxX - minX,
    h: maxY - minY,
  });

  return {
    type: "chart-cascade-arrow",
    key:
      `chart-cascade-arrow-${ctx.subChart.i_pane}-${ctx.subChart.i_tier}-${ctx.subChart.i_lane}-${arrow.from.i_series}-${arrow.from.i_value}`,
    item: fromBar.item,
    part: "link",
    bounds,
    hitBounds: bounds,
    zIndex: Z_INDEX.CASCADE_ARROW,
    meta: {
      from: fromBar.meta.value,
      to: toBar.meta.value,
      relRetention: arrow.info.relRetention,
    },
    pathSegments,
    pathStyle: {
      stroke: {
        color: s.strokeColor,
        width: s.strokeWidth,
      },
    },
    arrowhead: s.showArrowhead
      ? {
        position: new Coordinates({ x: arrowEndX, y: arrowEndY }),
        angle,
        size: s.arrowHeadLength,
      }
      : undefined,
    dataLabel,
  };
}
