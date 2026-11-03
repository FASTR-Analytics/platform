// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { getAdjustedText, getColor } from "../deps.ts";
import type {
  MeasuredText,
  MergedSceneStyle,
  Padding,
  RenderContext,
  TextInfoUnkeyed,
} from "../deps.ts";
import type { BoxContent, BoxElement, SceneBadgeStyle } from "../types.ts";

// Wrap guard: re-measuring at a tight measured width must not re-wrap.
export const TEXT_WIDTH_EPS = 0.1;

export type BoxTextStyles = {
  title: TextInfoUnkeyed;
  sub: TextInfoUnkeyed;
  line: TextInfoUnkeyed;
  badge: TextInfoUnkeyed;
};

export type BoxGeometry = {
  textGap: number;
  badgePadding: Padding;
  badgeGap: number;
};

export type MeasuredBadge = {
  mText: MeasuredText;
  w: number;
  h: number;
};

// The builder (scale 1) and the lowering (scale sf) derive a box's text
// styles and gaps from the same two sources, so the height the builder gave
// the box is the height the lowering fills.
export function boxTextStyles(
  s: MergedSceneStyle,
  box: Pick<BoxElement, "variant" | "style">,
): BoxTextStyles {
  const { style } = box;
  return {
    title: getAdjustedText(
      box.variant === "pill" ? s.text.badge : s.text.boxTitle,
      style.title,
    ),
    sub: getAdjustedText(s.text.boxSub, style.sub),
    line: s.text.boxLine,
    badge: s.text.badge,
  };
}

export function boxGeometry(s: MergedSceneStyle): BoxGeometry {
  return {
    textGap: s.boxes.textGap,
    badgePadding: s.badges.padding,
    badgeGap: s.badges.gap,
  };
}

export type MeasuredBoxContent = {
  title: MeasuredText;
  sub: MeasuredText | undefined;
  lines: MeasuredText[];
  badgeRows: MeasuredBadge[][];
  h: number;
};

// The stack inside a box: title, sub, lines, then badge pills in rows that
// wrap at the inner width. Styles and geometry arrive at the caller's scale.
export function measureBoxContent(
  rc: RenderContext,
  content: BoxContent,
  innerW: number,
  text: BoxTextStyles,
  geometry: BoxGeometry,
  badgeStyles?: SceneBadgeStyle[],
): MeasuredBoxContent {
  const budget = Math.max(0, innerW) + TEXT_WIDTH_EPS;
  const title = rc.mText(content.title, text.title, budget);
  const sub = content.sub === undefined
    ? undefined
    : rc.mText(content.sub, text.sub, budget);
  const lines = (content.lines ?? []).map((line) =>
    rc.mText(line, text.line, budget)
  );
  const padX = geometry.badgePadding.totalPx();
  const padY = geometry.badgePadding.totalPy();
  const badges = (content.badges ?? []).map((badge, i) => {
    const textColor = badgeStyles?.[i]?.textColor;
    const mText = rc.mText(
      badge.text,
      textColor === undefined
        ? text.badge
        : { ...text.badge, color: getColor(textColor) },
      Math.max(0, innerW - padX) + TEXT_WIDTH_EPS,
    );
    return { mText, w: mText.dims.w() + padX, h: mText.dims.h() + padY };
  });
  const badgeRows = wrapBadges(badges, innerW, geometry.badgeGap);

  let h = title.dims.h();
  if (sub !== undefined) {
    h += geometry.textGap + sub.dims.h();
  }
  for (const line of lines) {
    h += geometry.textGap + line.dims.h();
  }
  badgeRows.forEach((row, i) => {
    h += (i === 0 ? geometry.textGap : geometry.badgeGap) + rowHeight(row);
  });
  return { title, sub, lines, badgeRows, h };
}

export function rowHeight(row: MeasuredBadge[]): number {
  return Math.max(...row.map((b) => b.h));
}

export function rowWidth(row: MeasuredBadge[], gap: number): number {
  return row.reduce((sum, b) => sum + b.w, 0) + gap * (row.length - 1);
}

function wrapBadges(
  badges: MeasuredBadge[],
  innerW: number,
  gap: number,
): MeasuredBadge[][] {
  const rows: MeasuredBadge[][] = [];
  let row: MeasuredBadge[] = [];
  let w = 0;
  for (const badge of badges) {
    const next = row.length === 0 ? badge.w : w + gap + badge.w;
    if (row.length > 0 && next > innerW + TEXT_WIDTH_EPS) {
      rows.push(row);
      row = [badge];
      w = badge.w;
    } else {
      row.push(badge);
      w = next;
    }
  }
  if (row.length > 0) {
    rows.push(row);
  }
  return rows;
}
