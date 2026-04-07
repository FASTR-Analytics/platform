// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type {
  CascadeArrowInfo,
  CascadeArrowPrimitive,
  CascadeArrowStyle,
  ChartBarPrimitive,
  DataLabel,
  MergedCascadeArrowStyle,
  PathSegment,
  RenderContext,
} from "../deps.ts";
import {
  Coordinates,
  getAdjustedFont,
  getColor,
  RectCoordsDims,
  Z_INDEX,
} from "../deps.ts";

export function generateCascadeArrowPrimitives(
  barPrimitives: ChartBarPrimitive[],
  arrowStyle: MergedCascadeArrowStyle,
  rc: RenderContext,
  orientation: "vertical" | "horizontal",
): CascadeArrowPrimitive[] {
  if (orientation !== "vertical") {
    return [];
  }

  const result: CascadeArrowPrimitive[] = [];

  const groups = new Map<string, ChartBarPrimitive[]>();
  for (const bar of barPrimitives) {
    const v = bar.meta.value;
    const key = `${v.i_pane}-${v.i_tier}-${v.i_lane}-${v.i_series}`;
    const arr = groups.get(key);
    if (arr) {
      arr.push(bar);
    } else {
      groups.set(key, [bar]);
    }
  }

  for (const bars of groups.values()) {
    bars.sort((a, b) => a.meta.value.i_val - b.meta.value.i_val);

    const nArrows = bars.length - 1;

    let biggestDropoffIdx = -1;
    let biggestDropoff = 0;
    for (let i = 0; i < nArrows; i++) {
      const fv = bars[i].meta.value.val;
      const tv = bars[i + 1].meta.value.val;
      if (fv === undefined || fv === 0 || tv === undefined) continue;
      const drop = fv - tv;
      if (drop > biggestDropoff) {
        biggestDropoff = drop;
        biggestDropoffIdx = i;
      }
    }

    for (let i = 0; i < nArrows; i++) {
      const fromBar = bars[i];
      const toBar = bars[i + 1];
      const fromVal = fromBar.meta.value.val;
      const toVal = toBar.meta.value.val;

      if (fromVal === undefined || fromVal === 0 || toVal === undefined) {
        continue;
      }

      const absDropoff = fromVal - toVal;
      const relDropoff = absDropoff / fromVal;
      const relRetention = toVal / fromVal;

      const cascadeArrowInfo: CascadeArrowInfo = {
        ...fromBar.meta.value,
        i_arrow: i,
        nArrows,
        isFirstArrow: i === 0,
        isLastArrow: i === nArrows - 1,
        fromVal,
        toVal,
        absDropoff,
        relDropoff,
        relRetention,
        isBiggestDropoff: i === biggestDropoffIdx,
      };

      const s = arrowStyle.getStyle(cascadeArrowInfo);
      if (!s.show) {
        continue;
      }

      const arrow = computeCascadeArrow(
        fromBar,
        toBar,
        cascadeArrowInfo,
        s,
        arrowStyle,
        rc,
      );
      result.push(arrow);
    }
  }

  return result;
}

function computeCascadeArrow(
  fromBar: ChartBarPrimitive,
  toBar: ChartBarPrimitive,
  cascadeArrowInfo: CascadeArrowInfo,
  s: CascadeArrowStyle,
  arrowStyle: MergedCascadeArrowStyle,
  rc: RenderContext,
): CascadeArrowPrimitive {
  const { relRetention } = cascadeArrowInfo;
  const sw = s.strokeWidth;

  const fromX = fromBar.bounds.rightX() - sw / 2;
  const fromY = fromBar.bounds.y() + sw / 2;
  const toX = toBar.bounds.x() + sw / 2;
  const toY = toBar.bounds.y() + sw / 2;

  const midX = (fromX + toX) / 2;
  const diffY = toY - fromY;
  const lengthOfArrowWithGracefulTrunk = s.arrowHeadLength * 1.5;

  const arrowGap = ((toX - fromX) * (1 - s.arrowLengthPctOfSpace)) / 2;

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
  const labelText = dl.show
    ? arrowStyle.textFormatter !== "none"
      ? arrowStyle.textFormatter(cascadeArrowInfo)
      : String(cascadeArrowInfo.relRetention)
    : undefined;
  const labelTextInfo =
    (dl.color !== undefined || dl.relFontSize !== undefined ||
        dl.font !== undefined)
      ? {
        ...arrowStyle.text.labels,
        ...(dl.color !== undefined ? { color: getColor(dl.color) } : {}),
        ...(dl.relFontSize !== undefined
          ? {
            fontSize: arrowStyle.text.labels.fontSize * dl.relFontSize,
          }
          : {}),
        ...(dl.font !== undefined
          ? {
            font: getAdjustedFont(arrowStyle.text.labels.font, dl.font),
          }
          : {}),
      }
      : arrowStyle.text.labels;
  const mText = labelText
    ? rc.mText(labelText, labelTextInfo, Infinity)
    : undefined;
  const highestY = Math.min(fromY, toY);
  const dlPadTop = dl.padding.pt();
  const dlPadBottom = dl.padding.pb();
  const dlBorderHalf = dl.border !== "none" ? dl.border.width / 2 : 0;
  const labelY = mText
    ? highestY -
      (sw / 2 + mText.dims.h() + dlPadBottom + dlBorderHalf +
        s.arrowLabelGap + dl.offset)
    : highestY;

  let dataLabel: DataLabel | undefined;
  if (mText) {
    const hasDecoration = dl.backgroundColor !== "none" ||
      dl.border !== "none";
    dataLabel = {
      mText,
      position: new Coordinates({ x: midX, y: labelY }),
      alignH: "center",
      alignV: "top",
      style: hasDecoration
        ? {
          backgroundColor: dl.backgroundColor !== "none"
            ? getColor(dl.backgroundColor)
            : undefined,
          padding: dl.padding,
          border: dl.border !== "none"
            ? {
              color: getColor(dl.border.color),
              width: dl.border.width,
            }
            : undefined,
          rectRadius: dl.rectRadius,
        }
        : undefined,
    };
  }

  const minX = Math.min(fromX + arrowGap, arrowEndX) - sw;
  const labelTopY = mText ? labelY - dlPadTop - dlBorderHalf : labelY;
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
    type: "cascade-arrow",
    key:
      `cascade-arrow-${fromBar.meta.value.i_series}-${fromBar.meta.value.i_val}`,
    bounds,
    zIndex: Z_INDEX.CASCADE_ARROW,
    meta: {
      i_fromStage: fromBar.meta.value.i_val,
      i_toStage: toBar.meta.value.i_val,
      i_series: fromBar.meta.value.i_series,
      relRetention,
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
