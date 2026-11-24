// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  type LogosSizing,
  measureLogos,
  RectCoordsDims,
  type RenderContext,
  type TextInfoUnkeyed,
} from "../../deps.ts";
import { headerFooterOverflow } from "../page_overflow.ts";
import type {
  PageHeaderFooterPartId,
  PageHeaderFooterPartNeed,
  PageOverflowCause,
} from "../../types.ts";

type HeaderFooterText = {
  id: PageHeaderFooterPartId;
  text: string | undefined;
  textInfo: TextInfoUnkeyed;
};

type HeaderFooterLogos = {
  id: PageHeaderFooterPartId;
  images: { width: number; height: number }[];
  sizing: LogosSizing;
};

type LogoRowAllotment = {
  textMaxWidth: number;
  logosMaxWidth: number;
  logosHeight: number;
  overflowCauses: PageOverflowCause[];
};

// Only the logos' sizes are read, never their places.
const UNPLACED = new RectCoordsDims([0, 0, 0, 0]);

// How a header or a footer splits its inner width between its texts and its
// logo row. The logos keep their size while the texts keep their widest word,
// and past that the row shrinks to the room the texts leave. The header or
// footer does not fit when its widest word and the gap before any logos are
// wider than it.
export function allotLogoRow(
  rc: RenderContext,
  where: "header" | "footer",
  innerW: number,
  texts: HeaderFooterText[],
  logos: HeaderFooterLogos | undefined,
): LogoRowAllotment {
  const widestWords = texts.flatMap(({ id, text, textInfo }) => {
    const trimmed = text?.trim();
    return trimmed
      ? [{ id, need: rc.mText(trimmed, textInfo, 0).dims.w() }]
      : [];
  });
  const textMinW = Math.max(0, ...widestWords.map((w) => w.need));
  const widest = widestWords.filter((w) => w.need === textMinW);
  if (!logos) {
    return {
      textMaxWidth: innerW,
      logosMaxWidth: 0,
      logosHeight: 0,
      overflowCauses: headerFooterOverflow(where, widest, textMinW, innerW),
    };
  }
  const gapX = widestWords.length > 0 ? logos.sizing.gapX : 0;
  const measureRow = (rowMaxWidth: number) =>
    measureLogos(UNPLACED, {
      images: logos.images,
      style: logos.sizing,
      alignH: "left",
      alignV: "top",
      rowMaxWidth,
    });
  const room = innerW - textMinW - gapX;
  const logosMaxWidth = Math.max(
    0,
    Math.min(measureRow(Infinity).totalWidth, room),
  );
  const neededBy: PageHeaderFooterPartNeed[] = [
    ...widest,
    { id: logos.id, need: gapX },
  ];
  return {
    textMaxWidth: Math.max(textMinW, innerW - (logosMaxWidth + gapX)),
    logosMaxWidth,
    logosHeight: measureRow(logosMaxWidth).totalHeight,
    overflowCauses: headerFooterOverflow(
      where,
      neededBy,
      textMinW + gapX,
      innerW,
    ),
  };
}
