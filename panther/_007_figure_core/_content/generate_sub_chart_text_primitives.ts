// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  buildItem,
  type ChartSubChartTextPrimitive,
  type Padding,
  type RectCoordsDims,
  type RenderContext,
  SUB_CHART_TEXT_ITEM_KEY,
  textBoxInAlignRcd,
  type TextInfoUnkeyed,
  Z_INDEX,
} from "../deps.ts";
import type { ChartItemDataDimensions } from "../chart_items.ts";
import {
  namesSubChart,
  subChartItemCoordinates,
  type SubChartMembers,
} from "../sub_chart_members.ts";
import type { SubChartTextDataConfig } from "../types.ts";

export type SubChartTextContext = {
  i_pane: number;
  i_tier: number;
  i_lane: number;
  rcd: RectCoordsDims;
  members: SubChartMembers;
  itemDataDimensions: ChartItemDataDimensions;
  padding: Padding;
  textStyle: TextInfoUnkeyed;
};

export function generateSubChartTextPrimitives(
  rc: RenderContext,
  ctx: SubChartTextContext,
  subChartTexts: SubChartTextDataConfig[],
): ChartSubChartTextPrimitive[] {
  const alignRcd = ctx.rcd.getPadded(ctx.padding);
  return subChartTexts.flatMap((subChartText, i_text) => {
    const { text } = subChartText;
    if (text === "" || !namesSubChart(subChartText, ctx.members)) {
      return [];
    }
    const { alignH, alignV } = subChartText;
    const mText = rc.mText(text, ctx.textStyle, Math.max(0, alignRcd.w()));
    const bounds = textBoxInAlignRcd(mText, alignRcd, alignH, alignV);
    return [{
      type: "chart-sub-chart-text",
      key: `sub-chart-text-${ctx.i_pane}-${ctx.i_tier}-${ctx.i_lane}-${i_text}`,
      item: buildItem([
        ...subChartItemCoordinates(ctx.itemDataDimensions, ctx.members),
        [SUB_CHART_TEXT_ITEM_KEY, subChartText.id],
      ]),
      part: "label",
      hitBounds: bounds,
      bounds,
      zIndex: Z_INDEX.LABEL,
      meta: {
        id: subChartText.id,
        i_pane: ctx.i_pane,
        i_tier: ctx.i_tier,
        i_lane: ctx.i_lane,
        ...ctx.members,
      },
      mText,
      alignRcd,
      alignH,
      alignV,
    }];
  });
}
