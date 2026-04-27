// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  type ContentStyleOptions,
  type CoverStyleOptions,
  type CustomPageStyleOptions,
  type FooterStyleOptions,
  type FreeformStyleOptions,
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
  HeroSurfaceAssignment,
  PaletteSlot,
  ResolvedPageStyle,
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

function resolveHeroBackground(
  assignment: HeroSurfaceAssignment,
  palette: KeyColors,
  pattern?: Omit<PatternConfig, "baseColor">,
): PageBackgroundStyle {
  const baseColor = getColorForSlot(assignment.slot, palette);
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
  const splitBackground = layout.cover.split
    ? getColorForSlot("primary", palette)
    : undefined;

  return {
    padding: layout.cover.padding,
    background: resolveHeroBackground(
      treatment.surfaces.cover,
      palette,
      treatment.pattern,
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
  const splitBackground = layout.section.split
    ? getColorForSlot("primary", palette)
    : undefined;

  return {
    padding: layout.section.padding,
    background: resolveHeroBackground(
      treatment.surfaces.section,
      palette,
      treatment.pattern,
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
  const { treatment: surfaceTreatment, slot } = treatment.surfaces.header;
  const headerLayout = layout.freeform.header;

  const padding = getPaddingForTreatment(headerLayout, surfaceTreatment);

  if (surfaceTreatment === "filled") {
    return {
      padding,
      background: getColorForSlot(slot, palette),
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
      bottomBorderColor: getColor(palette.base300),
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
  const { treatment: surfaceTreatment, slot } = treatment.surfaces.footer;
  const footerLayout = layout.freeform.footer;

  const padding = getPaddingForTreatment(footerLayout, surfaceTreatment);

  if (surfaceTreatment === "filled") {
    return {
      padding,
      background: getColorForSlot(slot, palette),
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
  const { treatment: surfaceTreatment, slot } = treatment.surfaces.content;

  return {
    padding: layout.freeform.content.padding,
    background: surfaceTreatment === "filled"
      ? getColorForSlot(slot, palette)
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
  const splitBackground = layout.freeform.split
    ? getColorForSlot("primary", palette)
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

function resolveTextStyles(
  treatment: TreatmentPreset,
  palette: KeyColors,
): TextColorStyles {
  const coverText = getTextColorForSlot(
    treatment.surfaces.cover.slot,
    palette,
  );
  const sectionText = getTextColorForSlot(
    treatment.surfaces.section.slot,
    palette,
  );
  const headerText = treatment.surfaces.header.treatment === "filled"
    ? getTextColorForSlot(treatment.surfaces.header.slot, palette)
    : getColor(palette.baseContent);
  const footerText = treatment.surfaces.footer.treatment === "filled"
    ? getTextColorForSlot(treatment.surfaces.footer.slot, palette)
    : getColor(palette.baseContent);

  return {
    coverTitle: { color: coverText },
    coverSubTitle: { color: coverText },
    coverAuthor: { color: coverText },
    coverDate: { color: coverText },
    sectionTitle: { color: sectionText },
    sectionSubTitle: { color: sectionText },
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
