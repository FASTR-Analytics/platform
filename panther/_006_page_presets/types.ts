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

export type SurfaceTreatment = "filled" | "bordered" | "none";

export type PaletteSlot = "primary" | "base100" | "base200" | "base300";

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

export type HeroSurfaceAssignment = {
  slot: PaletteSlot;
};

export type SurfaceAssignment = {
  treatment: SurfaceTreatment;
  slot: PaletteSlot;
};

export type ContentAssignment = {
  treatment: "filled" | "none";
  slot: PaletteSlot;
};

export type TreatmentPresetConfig = {
  name: string;
  description: string;

  surfaces: {
    cover: HeroSurfaceAssignment;
    section: HeroSurfaceAssignment;
    header: SurfaceAssignment;
    footer: SurfaceAssignment;
    content: ContentAssignment;
  };

  pattern?: Omit<PatternConfig, "baseColor">;
};

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
};
