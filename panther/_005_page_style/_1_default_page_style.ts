// Copyright 2023-2026, Tim Roberton, All rights reserved.
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
  DefaultSplitConfig,
  LogosPlacement,
  LogosSizing,
  PageBackgroundStyle,
  PageNumberBackground,
} from "./types.ts";
import { typed } from "./deps.ts";

const _DS = {
  cover: {
    padding: typed<PaddingOptions>([200, 300]),
    background: typed<PageBackgroundStyle>({ key: "base300" }),
    split: typed<DefaultSplitConfig>({
      placement: "none",
      sizeAsPct: 0.3,
      background: "none",
    }),
    logosSizing: typed<LogosSizing>({
      targetArea: 102400,
      maxHeight: 10000,
      maxWidth: 10000,
      gapX: 40,
    }),
    logosPlacement: typed<LogosPlacement>({
      position: "above-content",
      gap: 30,
    }),
    titleBottomPadding: 30,
    subTitleBottomPadding: 30,
    authorBottomPadding: 30,
    alignH: typed<AlignH>("center"),
    alignV: typed<AlignV>("middle"),
  },
  section: {
    padding: typed<PaddingOptions>([200, 300]),
    background: typed<PageBackgroundStyle>({ key: "base300" }),
    split: typed<DefaultSplitConfig>({
      placement: "none",
      sizeAsPct: 0.3,
      background: "none",
    }),
    sectionTitleBottomPadding: 30,
    alignH: typed<AlignH>("center"),
    alignV: typed<AlignV>("middle"),
  },
  freeform: {
    split: typed<DefaultSplitConfig>({
      placement: "none",
      sizeAsPct: 0.3,
      background: "none",
    }),
    header: {
      padding: typed<PaddingOptions>([10, 15]),
      logosSizing: typed<LogosSizing>({
        targetArea: 90000,
        maxHeight: 10000,
        maxWidth: 10000,
        gapX: 40,
      }),
      background: typed<PageBackgroundStyle>({ key: "base200" }),
      headerBottomPadding: 20,
      subHeaderBottomPadding: 20,
      bottomBorderStrokeWidth: 0,
      bottomBorderColor: typed<ColorKeyOrString>({ key: "primary" }),
      alignH: typed<AlignH>("left"),
    },
    footer: {
      padding: typed<PaddingOptions>([10, 15]),
      logosSizing: typed<LogosSizing>({
        targetArea: 40000,
        maxHeight: 10000,
        maxWidth: 10000,
        gapX: 20,
      }),
      background: typed<PageBackgroundStyle>({ key: "base200" }),
      alignH: typed<AlignH>("left"),
    },
    content: {
      padding: typed<PaddingOptions>([10, 15]),
      background: typed<PageBackgroundStyle>({ key: "base100" }),
      gapX: 20,
      gapY: 20,
      figureMaxStretch: 1.5,
    },
    layoutContainers: {
      padding: typed<PaddingOptions>(0),
      backgroundColor: typed<ColorKeyOrString>("none"),
      borderColor: typed<ColorKeyOrString>("none"),
      borderWidth: 0,
      rectRadius: 0,
    },
  },
  pageNumber: {
    placement: "bottom-right" as
      | "bottom-right"
      | "bottom-left"
      | "bottom-center",
    padding: typed<PaddingOptions>(15),
    background: typed<PageNumberBackground>("none"),
    backgroundColor: typed<ColorKeyOrString>({ key: "base100" }),
  },
};

export type DefaultPageStyle = typeof _DS;

export function getDefaultPageStyle(): DefaultPageStyle {
  return _DS;
}
