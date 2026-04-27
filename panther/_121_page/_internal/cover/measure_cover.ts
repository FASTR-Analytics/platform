// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type {
  AlignH,
  AlignV,
  LogosPlacement,
  MeasuredImage,
  MeasuredLogos,
  MeasuredText,
  MergedCoverStyle,
  RectCoordsDims,
  RenderContext,
} from "../../deps.ts";
import { measureLogos, Padding, RectCoordsDims as RCD } from "../../deps.ts";
import type {
  CoverPageInputs,
  MeasuredCoverPage,
  PagePrimitive,
} from "../../types.ts";

export function measureCover(
  rc: RenderContext,
  bounds: RectCoordsDims,
  item: CoverPageInputs,
  style: MergedCoverStyle,
  responsiveScale: number | undefined,
  fullPageBounds: RectCoordsDims,
  measuredSplitImage: MeasuredImage | undefined,
  mWatermark: MeasuredText | undefined,
): MeasuredCoverPage {
  const textMaxWidth = bounds.w() - style.padding.totalPx();

  const mTitle = item.title?.trim()
    ? rc.mText(item.title.trim(), style.text.coverTitle, textMaxWidth)
    : undefined;

  const mSubTitle = item.subTitle?.trim()
    ? rc.mText(item.subTitle.trim(), style.text.coverSubTitle, textMaxWidth)
    : undefined;

  const mAuthor = item.author?.trim()
    ? rc.mText(item.author.trim(), style.text.coverAuthor, textMaxWidth)
    : undefined;

  const mDate = item.date?.trim()
    ? rc.mText(item.date.trim(), style.text.coverDate, textMaxWidth)
    : undefined;

  const { primitives, totalH } = buildCoverPrimitives(
    bounds,
    item,
    style,
    mTitle,
    mSubTitle,
    mAuthor,
    mDate,
  );

  return {
    type: "cover",
    item,
    bounds,
    style,
    responsiveScale,
    overflow: totalH > bounds.h(),
    fullPageBounds,
    measuredSplitImage,
    mWatermark,
    primitives,
    mTitle,
    mSubTitle,
    mAuthor,
    mDate,
  };
}

type CoverResult = { primitives: PagePrimitive[]; totalH: number };

function buildCoverPrimitives(
  bounds: RectCoordsDims,
  item: CoverPageInputs,
  s: MergedCoverStyle,
  mTitle?: MeasuredText,
  mSubTitle?: MeasuredText,
  mAuthor?: MeasuredText,
  mDate?: MeasuredText,
): CoverResult {
  const primitives: PagePrimitive[] = [];

  if (s.background !== "none") {
    primitives.push({
      type: "background",
      id: "coverBackground",
      rcd: bounds,
      background: s.background,
    });
  }

  if (item.overlay) {
    primitives.push({
      type: "image",
      id: "coverOverlay",
      image: item.overlay,
      rcd: bounds,
    });
  }

  const hasLogos = item.titleLogos && item.titleLogos.length > 0;
  const isFixed = isFixedPlacement(s.logosPlacement);

  if (hasLogos && isFixed) {
    const result = buildFixedLogosCover(
      bounds,
      item.titleLogos!,
      s,
      mTitle,
      mSubTitle,
      mAuthor,
      mDate,
    );
    primitives.push(...result.primitives);
    return { primitives, totalH: result.totalH };
  }

  const result = buildFlowCover(
    bounds,
    hasLogos ? item.titleLogos : undefined,
    s,
    mTitle,
    mSubTitle,
    mAuthor,
    mDate,
  );
  primitives.push(...result.primitives);
  return { primitives, totalH: result.totalH };
}

function isFixedPlacement(p: LogosPlacement): boolean {
  return p.position.startsWith("top-") || p.position.startsWith("bottom-");
}

function buildFixedLogosCover(
  bounds: RectCoordsDims,
  logos: HTMLImageElement[],
  s: MergedCoverStyle,
  mTitle?: MeasuredText,
  mSubTitle?: MeasuredText,
  mAuthor?: MeasuredText,
  mDate?: MeasuredText,
): CoverResult {
  const primitives: PagePrimitive[] = [];
  const padding = s.padding;
  const placement = s.logosPlacement;

  const paddedBounds = new RCD([
    bounds.x() + padding.pl(),
    bounds.y() + padding.pt(),
    bounds.w() - padding.totalPx(),
    bounds.h() - padding.totalPy(),
  ]);

  const { alignH: logoAlignH, alignV: logoAlignV } =
    getFixedPlacementAlignment(placement);
  const mLogos = measureLogos(paddedBounds, {
    images: logos,
    style: s.logosSizing,
    alignH: logoAlignH,
    alignV: logoAlignV,
  });

  for (let i = 0; i < mLogos.items.length; i++) {
    const logo = mLogos.items[i];
    primitives.push({
      type: "image",
      id: `coverLogo${i}`,
      image: logo.image,
      rcd: new RCD([logo.x, logo.y, logo.width, logo.height]),
    });
  }

  const logoSpace = mLogos.totalHeight + placement.gap;
  const isTop = placement.position.startsWith("top-");

  const contentBounds = isTop
    ? new RCD([
        bounds.x(),
        bounds.y() + padding.pt() + logoSpace,
        bounds.w(),
        bounds.h() - padding.pt() - logoSpace,
      ])
    : new RCD([
        bounds.x(),
        bounds.y(),
        bounds.w(),
        bounds.h() - padding.pb() - logoSpace,
      ]);

  const contentPadding = isTop
    ? new Padding([0, padding.pr(), padding.pb(), padding.pl()])
    : new Padding([padding.pt(), padding.pr(), 0, padding.pl()]);

  const contentResult = buildContentStack(
    contentBounds,
    contentPadding,
    s.alignH,
    s.alignV,
    mTitle,
    mSubTitle,
    mAuthor,
    mDate,
    s.titleBottomPadding,
    s.subTitleBottomPadding,
    s.authorBottomPadding,
  );
  primitives.push(...contentResult.primitives);

  return { primitives, totalH: logoSpace + contentResult.totalH };
}

function buildFlowCover(
  bounds: RectCoordsDims,
  logos: HTMLImageElement[] | undefined,
  s: MergedCoverStyle,
  mTitle?: MeasuredText,
  mSubTitle?: MeasuredText,
  mAuthor?: MeasuredText,
  mDate?: MeasuredText,
): CoverResult {
  const primitives: PagePrimitive[] = [];
  const padding = s.padding;
  const placement = s.logosPlacement;
  const textMaxWidth = bounds.w() - padding.totalPx();

  let mLogos: MeasuredLogos<HTMLImageElement> | undefined;
  if (logos && logos.length > 0) {
    mLogos = measureLogos(new RCD([0, 0, textMaxWidth, 10000]), {
      images: logos,
      style: s.logosSizing,
      alignH: "left",
      alignV: "top",
    });
  }

  type StackItem = { type: string; h: number; gap: number };
  const items: StackItem[] = [];

  const addItem = (type: string, h: number, gap: number) => {
    if (h > 0) items.push({ type, h, gap });
  };

  if (placement.position === "above-content" && mLogos) {
    addItem("logo", mLogos.totalHeight, placement.gap);
  }

  addItem("title", mTitle?.dims.h() ?? 0, s.titleBottomPadding);
  addItem("subtitle", mSubTitle?.dims.h() ?? 0, s.subTitleBottomPadding);
  addItem("author", mAuthor?.dims.h() ?? 0, s.authorBottomPadding);
  addItem("date", mDate?.dims.h() ?? 0, 0);

  if (placement.position === "below-content" && mLogos) {
    addItem("logo", mLogos.totalHeight, 0);
  }

  let totalH = 0;
  for (let i = 0; i < items.length; i++) {
    totalH += items[i].h;
    if (i < items.length - 1) {
      totalH += items[i].gap;
    }
  }

  const textX = getTextX(bounds, padding, s.alignH);
  let currentY = getStartY(bounds, padding, s.alignV, totalH);

  for (let i = 0; i < items.length; i++) {
    const item = items[i];

    if (item.type === "logo" && mLogos && logos) {
      const positioned = measureLogos(
        new RCD([bounds.x() + padding.pl(), currentY, textMaxWidth, item.h]),
        { images: logos, style: s.logosSizing, alignH: s.alignH, alignV: "top" },
      );
      for (let j = 0; j < positioned.items.length; j++) {
        const logo = positioned.items[j];
        primitives.push({
          type: "image",
          id: `coverLogo${j}`,
          image: logo.image,
          rcd: new RCD([logo.x, logo.y, logo.width, logo.height]),
        });
      }
    } else if (item.type === "title" && mTitle) {
      primitives.push({
        type: "text",
        id: "coverTitle",
        mText: mTitle,
        x: textX,
        y: currentY,
        alignH: s.alignH,
        alignV: "top",
        maxWidth: textMaxWidth,
      });
    } else if (item.type === "subtitle" && mSubTitle) {
      primitives.push({
        type: "text",
        id: "coverSubTitle",
        mText: mSubTitle,
        x: textX,
        y: currentY,
        alignH: s.alignH,
        alignV: "top",
        maxWidth: textMaxWidth,
      });
    } else if (item.type === "author" && mAuthor) {
      primitives.push({
        type: "text",
        id: "coverAuthor",
        mText: mAuthor,
        x: textX,
        y: currentY,
        alignH: s.alignH,
        alignV: "top",
        maxWidth: textMaxWidth,
      });
    } else if (item.type === "date" && mDate) {
      primitives.push({
        type: "text",
        id: "coverDate",
        mText: mDate,
        x: textX,
        y: currentY,
        alignH: s.alignH,
        alignV: "top",
        maxWidth: textMaxWidth,
      });
    }

    currentY += item.h;
    if (i < items.length - 1) {
      currentY += item.gap;
    }
  }

  return { primitives, totalH };
}

function buildContentStack(
  bounds: RectCoordsDims,
  padding: Padding,
  alignH: AlignH,
  alignV: AlignV,
  mTitle?: MeasuredText,
  mSubTitle?: MeasuredText,
  mAuthor?: MeasuredText,
  mDate?: MeasuredText,
  titleGap: number = 0,
  subtitleGap: number = 0,
  authorGap: number = 0,
): { primitives: PagePrimitive[]; totalH: number } {
  const primitives: PagePrimitive[] = [];
  const textMaxWidth = bounds.w() - padding.totalPx();

  type StackItem = { type: string; mText: MeasuredText; gap: number };
  const items: StackItem[] = [];

  if (mTitle) items.push({ type: "title", mText: mTitle, gap: titleGap });
  if (mSubTitle)
    items.push({ type: "subtitle", mText: mSubTitle, gap: subtitleGap });
  if (mAuthor) items.push({ type: "author", mText: mAuthor, gap: authorGap });
  if (mDate) items.push({ type: "date", mText: mDate, gap: 0 });

  let totalH = 0;
  for (let i = 0; i < items.length; i++) {
    totalH += items[i].mText.dims.h();
    if (i < items.length - 1) {
      totalH += items[i].gap;
    }
  }

  const textX = getTextX(bounds, padding, alignH);
  let currentY = getStartY(bounds, padding, alignV, totalH);

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    primitives.push({
      type: "text",
      id: `cover${item.type.charAt(0).toUpperCase() + item.type.slice(1)}`,
      mText: item.mText,
      x: textX,
      y: currentY,
      alignH,
      alignV: "top",
      maxWidth: textMaxWidth,
    });
    currentY += item.mText.dims.h();
    if (i < items.length - 1) {
      currentY += item.gap;
    }
  }

  return { primitives, totalH };
}

function getFixedPlacementAlignment(placement: LogosPlacement): {
  alignH: AlignH;
  alignV: AlignV;
} {
  switch (placement.position) {
    case "top-left":
      return { alignH: "left", alignV: "top" };
    case "top-center":
      return { alignH: "center", alignV: "top" };
    case "top-right":
      return { alignH: "right", alignV: "top" };
    case "bottom-left":
      return { alignH: "left", alignV: "bottom" };
    case "bottom-center":
      return { alignH: "center", alignV: "bottom" };
    case "bottom-right":
      return { alignH: "right", alignV: "bottom" };
    default:
      return { alignH: "center", alignV: "top" };
  }
}

function getTextX(
  bounds: RectCoordsDims,
  padding: Padding,
  alignH: AlignH,
): number {
  switch (alignH) {
    case "left":
      return bounds.x() + padding.pl();
    case "right":
      return bounds.x() + bounds.w() - padding.pr();
    case "center":
      return bounds.centerX();
  }
}

function getStartY(
  bounds: RectCoordsDims,
  padding: Padding,
  alignV: AlignV,
  totalH: number,
): number {
  switch (alignV) {
    case "top":
      return bounds.y() + padding.pt();
    case "bottom":
      return bounds.y() + bounds.h() - padding.pb() - totalH;
    case "middle":
      return bounds.y() + (bounds.h() - totalH) / 2;
  }
}
