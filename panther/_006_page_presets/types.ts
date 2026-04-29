// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type {
  AlignH,
  AlignV,
  CustomPageStyleOptions,
  KeyColors,
  LogosPlacementOptions,
  LogosSizingOptions,
  PaddingOptions,
  PatternConfig,
  SplitPlacement,
} from "./deps.ts";
import type { ColorPreset } from "./color_presets.ts";

// =============================================================================
// Palette Slots
// =============================================================================

export type PaletteSlot =
  | "base100"
  | "base200"
  | "base300"
  | "baseContent"
  | "baseContentMuted"
  | "primary"
  | "primaryContent"
  | "primaryContentMuted";

// =============================================================================
// Split Adjustment
// =============================================================================

export type SplitAdjustment =
  | { brighten: number }
  | { darken: number }
  | { slot: PaletteSlot };

// =============================================================================
// Layout Types (unchanged)
// =============================================================================

export type SurfaceTreatment = "filled" | "bordered" | "none";

export type SurfacePaddingConfig = {
  paddingIfFilled: PaddingOptions;
  paddingIfBordered: PaddingOptions;
  paddingIfNone: PaddingOptions;
  borderWidthIfBordered: number;
};

export type LayoutPresetConfig = {
  name: string;
  description: string;

  cover: {
    alignH: AlignH;
    alignV: AlignV;
    padding: PaddingOptions;
    split?: { placement: SplitPlacement; sizeAsPct: number };
    logosPlacement: LogosPlacementOptions;
    logosSizing: LogosSizingOptions;
    titleBottomPadding: number;
    subTitleBottomPadding: number;
    authorBottomPadding: number;
  };

  section: {
    alignH: AlignH;
    alignV: AlignV;
    padding: PaddingOptions;
    split?: { placement: SplitPlacement; sizeAsPct: number };
    sectionTitleBottomPadding: number;
  };

  freeform: {
    split?: { placement: SplitPlacement; sizeAsPct: number };
    header: SurfacePaddingConfig & {
      alignH: AlignH;
      logosSizing: LogosSizingOptions;
      headerBottomPadding: number;
      subHeaderBottomPadding: number;
    };
    footer: SurfacePaddingConfig & {
      alignH: AlignH;
      logosSizing: LogosSizingOptions;
    };
    content: {
      padding: PaddingOptions;
      gapX: number;
      gapY: number;
    };
  };
};

// =============================================================================
// Treatment Types (NEW - fully explicit)
// =============================================================================

export type CoverSurface = {
  background: PaletteSlot;
  title: PaletteSlot;
  subTitle: PaletteSlot;
  author: PaletteSlot;
  date: PaletteSlot;
};

export type SectionSurface = {
  background: PaletteSlot;
  title: PaletteSlot;
  subTitle: PaletteSlot;
};

export type HeaderSurface = {
  treatment: SurfaceTreatment;
  background: PaletteSlot;
  text: PaletteSlot;
};

export type FooterSurface = {
  treatment: SurfaceTreatment;
  background: PaletteSlot;
  text: PaletteSlot;
};

export type ContentSurface = {
  background: PaletteSlot;
};

// =============================================================================
// Legacy Types (keep for backwards compat during migration)
// =============================================================================

/** @deprecated Use PaletteSlot instead */
export type TextOverride = {
  color?: "primary" | "base100" | "base200" | "base300";
  opacity?: number;
};

/** @deprecated Use CoverSurface instead */
export type CoverSurfaceAssignment = {
  background: "primary" | "base100" | "base200" | "base300";
  title?: TextOverride;
  subTitle?: TextOverride;
  author?: TextOverride;
  date?: TextOverride;
};

/** @deprecated Use SectionSurface instead */
export type SectionSurfaceAssignment = {
  background: "primary" | "base100" | "base200" | "base300";
  title?: TextOverride;
  subTitle?: TextOverride;
};

/** @deprecated Use HeaderSurface or FooterSurface instead */
export type SurfaceAssignment = {
  treatment: SurfaceTreatment;
  background: "primary" | "base100" | "base200" | "base300";
};

/** @deprecated Use ContentSurface instead */
export type ContentAssignment = {
  treatment: "filled" | "none";
  background: "primary" | "base100" | "base200" | "base300";
};

/** @deprecated Use SplitAdjustment instead */
export type SplitBackgroundConfig =
  | "primary"
  | "base100"
  | "base200"
  | "base300"
  | { adjustCoverBackground: { brighten?: number; darken?: number } }
  | { adjustSectionBackground: { brighten?: number; darken?: number } };

/** @deprecated Use SplitAdjustment instead */
export type SplitSurfaceAssignment = {
  background: SplitBackgroundConfig;
};

/** @deprecated Use SplitAdjustment instead */
export type FreeformSplitAssignment = {
  background: "primary" | "base100" | "base200" | "base300";
};

// =============================================================================
// Resolved Style Types
// =============================================================================

export type TextColorStyles = {
  coverTitle: { color: string };
  coverSubTitle: { color: string };
  coverAuthor: { color: string };
  coverDate: { color: string };
  sectionTitle: { color: string };
  sectionSubTitle: { color: string };
  header: { color: string };
  subHeader: { color: string };
  date: { color: string };
  footer: { color: string };
};

export type ResolvedPageStyle = {
  style: CustomPageStyleOptions;
  palette: KeyColors;
  preset?: ColorPreset;
};
