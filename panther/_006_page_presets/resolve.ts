// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  Color,
  type ContentStyleOptions,
  type CoverStyleOptions,
  type CustomPageStyleOptions,
  type FooterStyleOptions,
  type FreeformStyleOptions,
  getAdjustedColor,
  getColor,
  getKeyColorsFromPrimaryColor,
  type HeaderStyleOptions,
  type KeyColors,
  type PageBackgroundStyle,
  type PatternConfig,
  type SectionStyleOptions,
} from "./deps.ts";
import {
  getLayoutPreset,
  type LayoutPreset,
  type LayoutPresetId,
} from "./layout_presets.ts";
import {
  getTreatmentPreset,
  type TreatmentPreset,
  type TreatmentPresetId,
} from "./treatment_presets.ts";
import type {
  PaletteSlot,
  ResolvedPageStyle,
  SplitBackgroundConfig,
  SurfacePaddingConfig,
  TextColorStyles,
} from "./types.ts";

function getColorForSlot(slot: PaletteSlot, palette: KeyColors): string {
  if (slot === "primary") return getColor(palette.primary);
  if (slot === "base200") return getColor(palette.base200);
  if (slot === "base300") return getColor(palette.base300);
  return getColor(palette.base100);
}

function getTextColorForSlot(slot: PaletteSlot, palette: KeyColors): string {
  if (slot === "primary") return getColor(palette.primaryContent);
  return getColor(palette.baseContent);
}

function resolveSplitBackground(
  config: SplitBackgroundConfig,
  coverBg: string,
  sectionBg: string,
  palette: KeyColors,
): string {
  if (typeof config === "string") {
    return getColorForSlot(config, palette);
  }
  if ("adjustCoverBackground" in config) {
    return getAdjustedColor(coverBg, config.adjustCoverBackground);
  }
  if ("adjustSectionBackground" in config) {
    return getAdjustedColor(sectionBg, config.adjustSectionBackground);
  }
  throw new Error("Invalid SplitBackgroundConfig");
}

function resolveHeroBackground(
  backgroundSlot: PaletteSlot,
  palette: KeyColors,
  pattern?: Omit<PatternConfig, "baseColor">,
): PageBackgroundStyle {
  const baseColor = getColorForSlot(backgroundSlot, palette);
  if (pattern) {
    return { ...pattern, baseColor };
  }
  return baseColor;
}

function resolveCoverStyle(
  layout: LayoutPreset,
  treatment: TreatmentPreset,
  palette: KeyColors,
): CoverStyleOptions {
  const coverBg = getColorForSlot(treatment.surfaces.cover.background, palette);
  const sectionBg = getColorForSlot(treatment.surfaces.section.background, palette);
  const hasSplit = !!layout.cover.split;

  const splitBackgroundColor = hasSplit && treatment.surfaces.coverSplit
    ? resolveSplitBackground(treatment.surfaces.coverSplit.background, coverBg, sectionBg, palette)
    : undefined;

  const splitBackground: PageBackgroundStyle | undefined = splitBackgroundColor
    ? (treatment.pattern ? { ...treatment.pattern, baseColor: splitBackgroundColor } : splitBackgroundColor)
    : undefined;

  return {
    padding: layout.cover.padding,
    background: resolveHeroBackground(
      treatment.surfaces.cover.background,
      palette,
      hasSplit ? undefined : treatment.pattern,
    ),
    split: layout.cover.split
      ? {
        placement: layout.cover.split.placement,
        sizeAsPct: layout.cover.split.sizeAsPct,
        background: splitBackground,
      }
      : undefined,
    logosSizing: layout.cover.logosSizing,
    logosPlacement: layout.cover.logosPlacement,
    titleBottomPadding: layout.cover.titleBottomPadding,
    subTitleBottomPadding: layout.cover.subTitleBottomPadding,
    authorBottomPadding: layout.cover.authorBottomPadding,
    alignH: layout.cover.alignH,
    alignV: layout.cover.alignV,
  };
}

function resolveSectionStyle(
  layout: LayoutPreset,
  treatment: TreatmentPreset,
  palette: KeyColors,
): SectionStyleOptions {
  const coverBg = getColorForSlot(treatment.surfaces.cover.background, palette);
  const sectionBg = getColorForSlot(treatment.surfaces.section.background, palette);
  const hasSplit = !!layout.section.split;

  const splitBackgroundColor = hasSplit && treatment.surfaces.sectionSplit
    ? resolveSplitBackground(treatment.surfaces.sectionSplit.background, coverBg, sectionBg, palette)
    : undefined;

  const splitBackground: PageBackgroundStyle | undefined = splitBackgroundColor
    ? (treatment.pattern ? { ...treatment.pattern, baseColor: splitBackgroundColor } : splitBackgroundColor)
    : undefined;

  return {
    padding: layout.section.padding,
    background: resolveHeroBackground(
      treatment.surfaces.section.background,
      palette,
      hasSplit ? undefined : treatment.pattern,
    ),
    split: layout.section.split
      ? {
        placement: layout.section.split.placement,
        sizeAsPct: layout.section.split.sizeAsPct,
        background: splitBackground,
      }
      : undefined,
    sectionTitleBottomPadding: layout.section.sectionTitleBottomPadding,
    alignH: layout.section.alignH,
    alignV: layout.section.alignV,
  };
}

function resolveHeaderStyle(
  layout: LayoutPreset,
  treatment: TreatmentPreset,
  palette: KeyColors,
): HeaderStyleOptions {
  const { treatment: surfaceTreatment, background } = treatment.surfaces.header;
  const headerLayout = layout.freeform.header;

  const padding = getPaddingForTreatment(headerLayout, surfaceTreatment);

  if (surfaceTreatment === "filled") {
    return {
      padding,
      background: getColorForSlot(background, palette),
      logosSizing: headerLayout.logosSizing,
      headerBottomPadding: headerLayout.headerBottomPadding,
      subHeaderBottomPadding: headerLayout.subHeaderBottomPadding,
      alignH: headerLayout.alignH,
    };
  }

  if (surfaceTreatment === "bordered") {
    return {
      padding,
      background: getColor(palette.base100),
      logosSizing: headerLayout.logosSizing,
      headerBottomPadding: headerLayout.headerBottomPadding,
      subHeaderBottomPadding: headerLayout.subHeaderBottomPadding,
      bottomBorderStrokeWidth: headerLayout.borderWidthIfBordered,
      bottomBorderColor: getColor(palette.primary),
      alignH: headerLayout.alignH,
    };
  }

  return {
    padding,
    background: getColor(palette.base100),
    logosSizing: headerLayout.logosSizing,
    headerBottomPadding: headerLayout.headerBottomPadding,
    subHeaderBottomPadding: headerLayout.subHeaderBottomPadding,
    alignH: headerLayout.alignH,
  };
}

function resolveFooterStyle(
  layout: LayoutPreset,
  treatment: TreatmentPreset,
  palette: KeyColors,
): FooterStyleOptions {
  const { treatment: surfaceTreatment, background } = treatment.surfaces.footer;
  const footerLayout = layout.freeform.footer;

  const padding = getPaddingForTreatment(footerLayout, surfaceTreatment);

  if (surfaceTreatment === "filled") {
    return {
      padding,
      background: getColorForSlot(background, palette),
      logosSizing: footerLayout.logosSizing,
      alignH: footerLayout.alignH,
    };
  }

  return {
    padding,
    background: getColor(palette.base100),
    logosSizing: footerLayout.logosSizing,
    alignH: footerLayout.alignH,
  };
}

function resolveContentStyle(
  layout: LayoutPreset,
  treatment: TreatmentPreset,
  palette: KeyColors,
): ContentStyleOptions {
  const { treatment: surfaceTreatment, background } = treatment.surfaces.content;

  return {
    padding: layout.freeform.content.padding,
    background: surfaceTreatment === "filled"
      ? getColorForSlot(background, palette)
      : getColor(palette.base100),
    gapX: layout.freeform.content.gapX,
    gapY: layout.freeform.content.gapY,
  };
}

function resolveFreeformStyle(
  layout: LayoutPreset,
  treatment: TreatmentPreset,
  palette: KeyColors,
): FreeformStyleOptions {
  const splitBackground = layout.freeform.split && treatment.surfaces.freeformSplit
    ? getColorForSlot(treatment.surfaces.freeformSplit.background, palette)
    : undefined;

  return {
    split: layout.freeform.split
      ? {
        placement: layout.freeform.split.placement,
        sizeAsPct: layout.freeform.split.sizeAsPct,
        background: splitBackground,
      }
      : undefined,
    header: resolveHeaderStyle(layout, treatment, palette),
    footer: resolveFooterStyle(layout, treatment, palette),
    content: resolveContentStyle(layout, treatment, palette),
  };
}

function applyOpacity(color: string, opacity: number | undefined): string {
  if (opacity === undefined || opacity === 1) return color;
  const c = new Color(color);
  const rgba = c.rgba();
  return new Color([rgba.r, rgba.g, rgba.b, opacity]).css();
}

function resolveTextColor(
  override: { color?: PaletteSlot; opacity?: number } | undefined,
  defaultColor: string,
  backgroundSlot: PaletteSlot,
  palette: KeyColors,
): string {
  let baseColor = defaultColor;
  if (override?.color) {
    const overrideColor = getColorForSlot(override.color, palette);
    const bgIsLight = backgroundSlot !== "primary";
    const colorIsLight = new Color(overrideColor).isLight();
    if (bgIsLight && colorIsLight) {
      baseColor = getColor(palette.baseContent);
    } else {
      baseColor = overrideColor;
    }
  }
  return applyOpacity(baseColor, override?.opacity);
}

function resolveTextStyles(
  treatment: TreatmentPreset,
  palette: KeyColors,
): TextColorStyles {
  const cover = treatment.surfaces.cover;
  const section = treatment.surfaces.section;

  const defaultCoverText = getTextColorForSlot(cover.background, palette);
  const defaultSectionText = getTextColorForSlot(section.background, palette);

  const headerText = treatment.surfaces.header.treatment === "filled"
    ? getTextColorForSlot(treatment.surfaces.header.background, palette)
    : getColor(palette.baseContent);
  const footerText = treatment.surfaces.footer.treatment === "filled"
    ? getTextColorForSlot(treatment.surfaces.footer.background, palette)
    : getColor(palette.baseContent);

  return {
    coverTitle: { color: resolveTextColor(cover.title, defaultCoverText, cover.background, palette) },
    coverSubTitle: { color: resolveTextColor(cover.subTitle, defaultCoverText, cover.background, palette) },
    coverAuthor: { color: resolveTextColor(cover.author, defaultCoverText, cover.background, palette) },
    coverDate: { color: resolveTextColor(cover.date, defaultCoverText, cover.background, palette) },
    sectionTitle: { color: resolveTextColor(section.title, defaultSectionText, section.background, palette) },
    sectionSubTitle: { color: resolveTextColor(section.subTitle, defaultSectionText, section.background, palette) },
    header: { color: headerText },
    subHeader: { color: headerText },
    date: { color: headerText },
    footer: { color: footerText },
  };
}

function getPaddingForTreatment(
  config: SurfacePaddingConfig,
  treatment: "filled" | "bordered" | "none",
) {
  if (treatment === "filled") return config.paddingIfFilled;
  if (treatment === "bordered") return config.paddingIfBordered;
  return config.paddingIfNone;
}

export type ResolveOptions = {
  pattern?: Omit<PatternConfig, "baseColor">;
};

export function resolvePageStyle(
  layoutId: LayoutPresetId,
  treatmentId: TreatmentPresetId,
  primaryColor: string,
  options?: ResolveOptions,
): ResolvedPageStyle {
  const layout = getLayoutPreset(layoutId);
  const treatment = getTreatmentPreset(treatmentId);
  const palette = getKeyColorsFromPrimaryColor(primaryColor);

  const effectiveTreatment: TreatmentPreset = options?.pattern
    ? { ...treatment, pattern: options.pattern }
    : treatment;

  const style: CustomPageStyleOptions = {
    text: resolveTextStyles(effectiveTreatment, palette),
    cover: resolveCoverStyle(layout, effectiveTreatment, palette),
    section: resolveSectionStyle(layout, effectiveTreatment, palette),
    freeform: resolveFreeformStyle(layout, effectiveTreatment, palette),
  };

  return { style, palette };
}
