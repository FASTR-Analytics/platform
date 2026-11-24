// Copyright 2023-2026, Tim Roberton. MIT license.
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
  PageStackPartId,
} from "../../types.ts";
import {
  pageOverflow,
  stackOverflow,
  type StackPart,
} from "../page_overflow.ts";
import { getStartY, getTextX } from "../stack_placement.ts";

export function measureCover(
  rc: RenderContext,
  bounds: RectCoordsDims,
  inputs: CoverPageInputs,
  style: MergedCoverStyle,
  fullPageBounds: RectCoordsDims,
  measuredSplitImage: MeasuredImage | undefined,
  mWatermark: MeasuredText | undefined,
): MeasuredCoverPage {
  const paddedBounds = bounds.getPadded(style.padding);
  const textMaxWidth = paddedBounds.w();

  const mTitle = inputs.title?.trim()
    ? rc.mText(inputs.title.trim(), style.text.coverTitle, textMaxWidth)
    : undefined;

  const mSubtitle = inputs.subtitle?.trim()
    ? rc.mText(inputs.subtitle.trim(), style.text.coverSubtitle, textMaxWidth)
    : undefined;

  const mAuthor = inputs.author?.trim()
    ? rc.mText(inputs.author.trim(), style.text.coverAuthor, textMaxWidth)
    : undefined;

  const mDate = inputs.date?.trim()
    ? rc.mText(inputs.date.trim(), style.text.coverDate, textMaxWidth)
    : undefined;

  const { primitives, totalH, parts } = buildCoverPrimitives(
    bounds,
    paddedBounds,
    inputs,
    style,
    mTitle,
    mSubtitle,
    mAuthor,
    mDate,
  );

  return {
    type: "cover",
    inputs,
    bounds,
    style,
    ...pageOverflow(stackOverflow(parts, totalH, paddedBounds)),
    fullPageBounds,
    measuredSplitImage,
    mWatermark,
    primitives,
    mTitle,
    mSubtitle,
    mAuthor,
    mDate,
  };
}

type CoverResult = {
  primitives: PagePrimitive[];
  totalH: number;
  parts: StackPart[];
};

function buildCoverPrimitives(
  bounds: RectCoordsDims,
  paddedBounds: RectCoordsDims,
  inputs: CoverPageInputs,
  s: MergedCoverStyle,
  mTitle?: MeasuredText,
  mSubtitle?: MeasuredText,
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

  if (inputs.overlay) {
    primitives.push({
      type: "image",
      id: "coverOverlay",
      image: inputs.overlay,
      rcd: bounds,
    });
  }

  const hasLogos = inputs.titleLogos && inputs.titleLogos.length > 0;
  const isFixed = isFixedPlacement(s.logosPlacement);

  if (hasLogos && isFixed) {
    const result = buildFixedLogosCover(
      bounds,
      paddedBounds,
      inputs.titleLogos!,
      s,
      mTitle,
      mSubtitle,
      mAuthor,
      mDate,
    );
    primitives.push(...result.primitives);
    return { ...result, primitives };
  }

  const result = buildFlowCover(
    paddedBounds,
    hasLogos ? inputs.titleLogos : undefined,
    s,
    mTitle,
    mSubtitle,
    mAuthor,
    mDate,
  );
  primitives.push(...result.primitives);
  return { ...result, primitives };
}

function isFixedPlacement(p: LogosPlacement): boolean {
  return p.position.startsWith("top-") || p.position.startsWith("bottom-");
}

function buildFixedLogosCover(
  bounds: RectCoordsDims,
  paddedBounds: RectCoordsDims,
  logos: HTMLImageElement[],
  s: MergedCoverStyle,
  mTitle?: MeasuredText,
  mSubtitle?: MeasuredText,
  mAuthor?: MeasuredText,
  mDate?: MeasuredText,
): CoverResult {
  const primitives: PagePrimitive[] = [];
  const padding = s.padding;
  const placement = s.logosPlacement;

  const { alignH: logoAlignH, alignV: logoAlignV } = getFixedPlacementAlignment(
    placement,
  );
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
    mSubtitle,
    mAuthor,
    mDate,
    s.titleBottomPadding,
    s.subtitleBottomPadding,
    s.authorBottomPadding,
  );
  primitives.push(...contentResult.primitives);

  const totalH = contentResult.totalH > 0
    ? logoSpace + contentResult.totalH
    : mLogos.totalHeight;
  const logoRow: StackPart = {
    id: "coverLogos",
    height: mLogos.totalHeight,
    width: 0,
  };
  return {
    primitives,
    totalH,
    parts: isTop
      ? [logoRow, ...contentResult.parts]
      : [...contentResult.parts, logoRow],
  };
}

function buildFlowCover(
  paddedBounds: RectCoordsDims,
  logos: HTMLImageElement[] | undefined,
  s: MergedCoverStyle,
  mTitle?: MeasuredText,
  mSubtitle?: MeasuredText,
  mAuthor?: MeasuredText,
  mDate?: MeasuredText,
): CoverResult {
  const primitives: PagePrimitive[] = [];
  const placement = s.logosPlacement;
  const textMaxWidth = paddedBounds.w();

  let mLogos: MeasuredLogos<HTMLImageElement> | undefined;
  if (logos && logos.length > 0) {
    mLogos = measureLogos(new RCD([0, 0, textMaxWidth, 10000]), {
      images: logos,
      style: s.logosSizing,
      alignH: "left",
      alignV: "top",
    });
  }

  type StackItem = {
    id: PageStackPartId;
    h: number;
    gap: number;
    mText?: MeasuredText;
  };
  const items: StackItem[] = [];

  const addItem = (
    id: PageStackPartId,
    h: number,
    gap: number,
    mText?: MeasuredText,
  ) => {
    if (h > 0) {
      items.push({ id, h, gap, mText });
    }
  };

  if (placement.position === "above-content" && mLogos) {
    addItem("coverLogos", mLogos.totalHeight, placement.gap);
  }

  addItem("coverTitle", mTitle?.dims.h() ?? 0, s.titleBottomPadding, mTitle);
  addItem(
    "coverSubtitle",
    mSubtitle?.dims.h() ?? 0,
    s.subtitleBottomPadding,
    mSubtitle,
  );
  addItem(
    "coverAuthor",
    mAuthor?.dims.h() ?? 0,
    s.authorBottomPadding,
    mAuthor,
  );
  addItem("coverDate", mDate?.dims.h() ?? 0, 0, mDate);

  if (placement.position === "below-content" && mLogos) {
    const last = items.at(-1);
    if (last) last.gap = placement.gap;
    addItem("coverLogos", mLogos.totalHeight, 0);
  }

  let totalH = 0;
  for (let i = 0; i < items.length; i++) {
    totalH += items[i].h;
    if (i < items.length - 1) {
      totalH += items[i].gap;
    }
  }

  const textX = getTextX(paddedBounds, s.alignH);
  let currentY = getStartY(paddedBounds, s.alignV, totalH);

  for (let i = 0; i < items.length; i++) {
    const item = items[i];

    if (item.mText) {
      primitives.push({
        type: "text",
        id: item.id,
        mText: item.mText,
        x: textX,
        y: currentY,
        alignH: s.alignH,
        alignV: "top",
        maxWidth: textMaxWidth,
      });
    } else if (logos) {
      const positioned = measureLogos(
        new RCD([paddedBounds.x(), currentY, textMaxWidth, item.h]),
        {
          images: logos,
          style: s.logosSizing,
          alignH: s.alignH,
          alignV: "top",
        },
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
    }

    currentY += item.h;
    if (i < items.length - 1) {
      currentY += item.gap;
    }
  }

  return {
    primitives,
    totalH,
    parts: items.map(({ id, h, mText }) => ({
      id,
      height: h,
      width: mText?.dims.w() ?? 0,
    })),
  };
}

function buildContentStack(
  bounds: RectCoordsDims,
  padding: Padding,
  alignH: AlignH,
  alignV: AlignV,
  mTitle?: MeasuredText,
  mSubtitle?: MeasuredText,
  mAuthor?: MeasuredText,
  mDate?: MeasuredText,
  titleGap: number = 0,
  subtitleGap: number = 0,
  authorGap: number = 0,
): CoverResult {
  const primitives: PagePrimitive[] = [];
  const paddedBounds = bounds.getPadded(padding);
  const textMaxWidth = paddedBounds.w();

  type StackItem = { id: PageStackPartId; mText: MeasuredText; gap: number };
  const items: StackItem[] = [];

  if (mTitle) {
    items.push({ id: "coverTitle", mText: mTitle, gap: titleGap });
  }
  if (mSubtitle) {
    items.push({ id: "coverSubtitle", mText: mSubtitle, gap: subtitleGap });
  }
  if (mAuthor) {
    items.push({ id: "coverAuthor", mText: mAuthor, gap: authorGap });
  }
  if (mDate) {
    items.push({ id: "coverDate", mText: mDate, gap: 0 });
  }

  let totalH = 0;
  for (let i = 0; i < items.length; i++) {
    totalH += items[i].mText.dims.h();
    if (i < items.length - 1) {
      totalH += items[i].gap;
    }
  }

  const textX = getTextX(paddedBounds, alignH);
  let currentY = getStartY(paddedBounds, alignV, totalH);

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    primitives.push({
      type: "text",
      id: item.id,
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

  return {
    primitives,
    totalH,
    parts: items.map(({ id, mText }) => ({
      id,
      height: mText.dims.h(),
      width: mText.dims.w(),
    })),
  };
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
