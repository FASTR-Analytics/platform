// Copyright 2023-2026, Tim Roberton, All rights reserved.
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
  getKeyColorsFromPrimaryColor,
  type HeaderStyleOptions,
  type PageBackgroundStyle,
  type PatternConfig,
  type SectionStyleOptions,
  type SplitPlacement,
} from "./deps.ts";
import type { ColorPreset } from "./color_presets.ts";
import {
  type CoverTreatment,
  type CoverTreatmentId,
  getCoverTreatment,
} from "./cover_treatment_presets.ts";
import {
  type FreeformTreatment,
  type FreeformTreatmentId,
  getFreeformTreatment,
} from "./freeform_treatment_presets.ts";
import {
  getLayoutPreset,
  type LayoutPreset,
  type LayoutPresetId,
} from "./layout_presets.ts";
import type {
  PaletteSlot,
  ResolvedPageStyle,
  SplitAdjustment,
  SurfacePaddingConfig,
  TextColorStyles,
} from "./types.ts";

function getSlotColor(slot: PaletteSlot, preset: ColorPreset): string {
  return preset[slot];
}

function resolveSplitColor(
  baseColor: string,
  adjustment: SplitAdjustment,
  preset: ColorPreset,
): string {
  if ("slot" in adjustment) {
    return getSlotColor(adjustment.slot, preset);
  }
  const color = new Color(baseColor);
  if ("brighten" in adjustment) {
    return color.lighten(adjustment.brighten).css();
  }
  return color.darken(adjustment.darken).css();
}

function resolveHeroBackground(
  backgroundSlot: PaletteSlot,
  preset: ColorPreset,
  pattern?: Omit<PatternConfig, "baseColor">,
): PageBackgroundStyle {
  const baseColor = getSlotColor(backgroundSlot, preset);
  if (pattern) {
    return { ...pattern, baseColor };
  }
  return baseColor;
}

// Shared hero-page surface resolution (cover + section pages): full-bleed
// background plus the optional split panel with its adjusted color.
function resolveHeroSurface(
  split: { placement: SplitPlacement; sizeAsPct: number } | undefined,
  coverTreatment: CoverTreatment,
  preset: ColorPreset,
  pattern?: Omit<PatternConfig, "baseColor">,
): {
  background: PageBackgroundStyle;
  split:
    | {
      placement: SplitPlacement;
      sizeAsPct: number;
      background?: PageBackgroundStyle;
    }
    | undefined;
} {
  const heroBg = getSlotColor(coverTreatment.background, preset);
  const hasSplit = !!split;

  const splitBackgroundColor = hasSplit
    ? resolveSplitColor(heroBg, coverTreatment.splitAdjust, preset)
    : undefined;

  const splitBackground: PageBackgroundStyle | undefined = splitBackgroundColor
    ? (pattern
      ? { ...pattern, baseColor: splitBackgroundColor }
      : splitBackgroundColor)
    : undefined;

  return {
    background: resolveHeroBackground(
      coverTreatment.background,
      preset,
      hasSplit ? undefined : pattern,
    ),
    split: split
      ? {
        placement: split.placement,
        sizeAsPct: split.sizeAsPct,
        background: splitBackground,
      }
      : undefined,
  };
}

function resolveCoverStyle(
  layout: LayoutPreset,
  coverTreatment: CoverTreatment,
  preset: ColorPreset,
  pattern?: Omit<PatternConfig, "baseColor">,
): CoverStyleOptions {
  const surface = resolveHeroSurface(
    layout.cover.split,
    coverTreatment,
    preset,
    pattern,
  );

  return {
    padding: layout.cover.padding,
    background: surface.background,
    split: surface.split,
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
  coverTreatment: CoverTreatment,
  preset: ColorPreset,
  pattern?: Omit<PatternConfig, "baseColor">,
): SectionStyleOptions {
  const surface = resolveHeroSurface(
    layout.section.split,
    coverTreatment,
    preset,
    pattern,
  );

  return {
    padding: layout.section.padding,
    background: surface.background,
    split: surface.split,
    sectionTitleBottomPadding: layout.section.sectionTitleBottomPadding,
    alignH: layout.section.alignH,
    alignV: layout.section.alignV,
  };
}

function resolveHeaderStyle(
  layout: LayoutPreset,
  freeformTreatment: FreeformTreatment,
  preset: ColorPreset,
): HeaderStyleOptions {
  const { treatment: surfaceTreatment, background } = freeformTreatment.header;
  const headerLayout = layout.freeform.header;
  const padding = getPaddingForTreatment(headerLayout, surfaceTreatment);

  if (surfaceTreatment === "filled") {
    return {
      padding,
      background: getSlotColor(background, preset),
      logosSizing: headerLayout.logosSizing,
      headerBottomPadding: headerLayout.headerBottomPadding,
      subHeaderBottomPadding: headerLayout.subHeaderBottomPadding,
      alignH: headerLayout.alignH,
    };
  }

  if (surfaceTreatment === "bordered") {
    return {
      padding,
      background: preset.base100,
      logosSizing: headerLayout.logosSizing,
      headerBottomPadding: headerLayout.headerBottomPadding,
      subHeaderBottomPadding: headerLayout.subHeaderBottomPadding,
      bottomBorderStrokeWidth: headerLayout.borderWidthIfBordered,
      bottomBorderColor: preset.primary,
      alignH: headerLayout.alignH,
    };
  }

  return {
    padding,
    background: preset.base100,
    logosSizing: headerLayout.logosSizing,
    headerBottomPadding: headerLayout.headerBottomPadding,
    subHeaderBottomPadding: headerLayout.subHeaderBottomPadding,
    alignH: headerLayout.alignH,
  };
}

function resolveFooterStyle(
  layout: LayoutPreset,
  freeformTreatment: FreeformTreatment,
  preset: ColorPreset,
): FooterStyleOptions {
  const { treatment: surfaceTreatment, background } = freeformTreatment.footer;
  const footerLayout = layout.freeform.footer;
  const padding = getPaddingForTreatment(footerLayout, surfaceTreatment);

  if (surfaceTreatment === "filled") {
    return {
      padding,
      background: getSlotColor(background, preset),
      logosSizing: footerLayout.logosSizing,
      alignH: footerLayout.alignH,
    };
  }

  return {
    padding,
    background: preset.base100,
    logosSizing: footerLayout.logosSizing,
    alignH: footerLayout.alignH,
  };
}

function resolveContentStyle(
  layout: LayoutPreset,
  freeformTreatment: FreeformTreatment,
  preset: ColorPreset,
): ContentStyleOptions {
  return {
    padding: layout.freeform.content.padding,
    background: getSlotColor(freeformTreatment.content.background, preset),
    gapX: layout.freeform.content.gapX,
    gapY: layout.freeform.content.gapY,
  };
}

function resolveFreeformStyle(
  layout: LayoutPreset,
  freeformTreatment: FreeformTreatment,
  preset: ColorPreset,
): FreeformStyleOptions {
  const contentBg = getSlotColor(freeformTreatment.content.background, preset);
  const splitBackground = layout.freeform.split
    ? resolveSplitColor(contentBg, freeformTreatment.splitAdjust, preset)
    : undefined;

  return {
    split: layout.freeform.split
      ? {
        placement: layout.freeform.split.placement,
        sizeAsPct: layout.freeform.split.sizeAsPct,
        background: splitBackground,
      }
      : undefined,
    header: resolveHeaderStyle(layout, freeformTreatment, preset),
    footer: resolveFooterStyle(layout, freeformTreatment, preset),
    content: resolveContentStyle(layout, freeformTreatment, preset),
  };
}

function resolveTextStyles(
  coverTreatment: CoverTreatment,
  freeformTreatment: FreeformTreatment,
  preset: ColorPreset,
): TextColorStyles {
  return {
    coverTitle: { color: getSlotColor(coverTreatment.title, preset) },
    coverSubTitle: { color: getSlotColor(coverTreatment.subTitle, preset) },
    coverAuthor: { color: getSlotColor(coverTreatment.author, preset) },
    coverDate: { color: getSlotColor(coverTreatment.date, preset) },
    sectionTitle: { color: getSlotColor(coverTreatment.title, preset) },
    sectionSubTitle: { color: getSlotColor(coverTreatment.subTitle, preset) },
    header: { color: getSlotColor(freeformTreatment.header.text, preset) },
    subHeader: { color: getSlotColor(freeformTreatment.header.text, preset) },
    date: { color: getSlotColor(freeformTreatment.header.text, preset) },
    footer: { color: getSlotColor(freeformTreatment.footer.text, preset) },
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
  coverAndSectionTreatmentId: CoverTreatmentId,
  freeformTreatmentId: FreeformTreatmentId,
  preset: ColorPreset,
  options?: ResolveOptions,
): ResolvedPageStyle {
  const layout = getLayoutPreset(layoutId);
  const coverTreatment = getCoverTreatment(coverAndSectionTreatmentId);
  const freeformTreatment = getFreeformTreatment(freeformTreatmentId);

  const style: CustomPageStyleOptions = {
    text: resolveTextStyles(coverTreatment, freeformTreatment, preset),
    cover: resolveCoverStyle(layout, coverTreatment, preset, options?.pattern),
    section: resolveSectionStyle(
      layout,
      coverTreatment,
      preset,
      options?.pattern,
    ),
    freeform: resolveFreeformStyle(layout, freeformTreatment, preset),
  };

  // Mirror the preset's actually-applied colors; only the semantic colors
  // (neutral/success/warning/danger) that the preset doesn't define are taken
  // from the generated palette.
  const palette = {
    ...getKeyColorsFromPrimaryColor(preset.primary),
    base100: preset.base100,
    base200: preset.base200,
    base300: preset.base300,
    baseContent: preset.baseContent,
    primary: preset.primary,
    primaryContent: preset.primaryContent,
  };

  return { style, palette, preset };
}
