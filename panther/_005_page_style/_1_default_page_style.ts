// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type {
  AlignH,
  AlignV,
  ColorKeyOrString,
  PaddingOptions,
} from "./deps.ts";
import type {
  LogosPlacement,
  LogosSizing,
  PageBackgroundStyle,
  PageNumberBackground,
  SplitConfig,
} from "./types.ts";

const _DS = {
  scale: 1,

  cover: {
    padding: [200, 300] as PaddingOptions,
    background: { key: "base300" } as PageBackgroundStyle,
    split: {
      placement: "none",
      sizeAsPct: 0.3,
      background: "none",
    } as SplitConfig,
    logosSizing: {
      targetArea: 102400,
      maxHeight: 10000,
      maxWidth: 10000,
      gapX: 40,
    } as LogosSizing,
    logosPlacement: {
      position: "above-content",
      gap: 30,
    } as LogosPlacement,
    titleBottomPadding: 30,
    subTitleBottomPadding: 30,
    authorBottomPadding: 30,
    alignH: "center" as AlignH,
    alignV: "middle" as AlignV,
  },
  section: {
    padding: [200, 300] as PaddingOptions,
    background: { key: "base300" } as PageBackgroundStyle,
    split: {
      placement: "none",
      sizeAsPct: 0.3,
      background: "none",
    } as SplitConfig,
    sectionTitleBottomPadding: 30,
    alignH: "center" as AlignH,
    alignV: "middle" as AlignV,
  },
  freeform: {
    split: {
      placement: "none",
      sizeAsPct: 0.3,
      background: "none",
    } as SplitConfig,
    header: {
      padding: [40, 60] as PaddingOptions,
      logosSizing: {
        targetArea: 90000,
        maxHeight: 10000,
        maxWidth: 10000,
        gapX: 40,
      } as LogosSizing,
      background: { key: "base200" } as PageBackgroundStyle,
      headerBottomPadding: 20,
      subHeaderBottomPadding: 20,
      bottomBorderStrokeWidth: 0,
      bottomBorderColor: { key: "primary" } as ColorKeyOrString,
      alignH: "left" as AlignH,
    },
    footer: {
      padding: 60 as PaddingOptions,
      logosSizing: {
        targetArea: 40000,
        maxHeight: 10000,
        maxWidth: 10000,
        gapX: 40,
      } as LogosSizing,
      background: { key: "base200" } as PageBackgroundStyle,
      alignH: "left" as AlignH,
    },
    content: {
      padding: 60 as PaddingOptions,
      background: { key: "base100" } as PageBackgroundStyle,
      gapX: 40,
      gapY: 40,
    },
    layoutContainers: {
      padding: 0 as PaddingOptions,
      backgroundColor: "none" as ColorKeyOrString,
      borderColor: "none" as ColorKeyOrString,
      borderWidth: 0,
      rectRadius: 0,
    },
  },
  pageNumber: {
    placement: "bottom-right" as
      | "bottom-right"
      | "bottom-left"
      | "bottom-center",
    padding: 15 as PaddingOptions,
    background: "none" as PageNumberBackground,
    backgroundColor: { key: "base100" } as ColorKeyOrString,
  },
};

export type DefaultPageStyle = typeof _DS;

export function getDefaultPageStyle(): DefaultPageStyle {
  return _DS;
}
