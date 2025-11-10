// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { ColorKeyOrString, PaddingOptions, TextInfo } from "./deps.ts";
import { DEFAULT_BULLET_MARKERS } from "./bullet_types.ts";

const _DS = {
  scale: 1,
  baseText: {
    font: { key: "main400" },
    fontSize: 24,
    color: { key: "baseContent" },
    lineHeight: 1.4,
    lineBreakGap: 0.5,
    letterSpacing: "0px",
    fontVariants: {
      bold: { key: "main700" },
    },
  } as TextInfo,
  cover: {
    backgroundColor: { key: "base300" } as ColorKeyOrString,
    logoHeight: 320,
    logoGapX: 40,
    gapY: 30,
  },
  section: {
    backgroundColor: { key: "base300" } as ColorKeyOrString,
    gapY: 30,
  },
  header: {
    padding: [40, 60] as PaddingOptions,
    logoHeight: 300,
    logoGapX: 40,
    logoPlacement: "left" as "left" | "right",
    backgroundColor: { key: "base200" } as ColorKeyOrString,
    logoBottomPadding: 20,
    headerBottomPadding: 20,
    subHeaderBottomPadding: 20,
    bottomBorderStrokeWidth: 0,
    bottomBorderColor: { key: "primary" } as ColorKeyOrString,
  },
  footer: {
    padding: 60 as PaddingOptions,
    logoHeight: 200,
    logoGapX: 40,
    backgroundColor: { key: "base200" } as ColorKeyOrString,
  },
  content: {
    padding: 60 as PaddingOptions,
    backgroundColor: { key: "base100" } as ColorKeyOrString,
    tabWidth: 10,
    gapX: 40,
    gapY: 40,
    bullets: {
      bullet1: {
        marker: DEFAULT_BULLET_MARKERS[0],
        markerIndent: 0,
        textIndent: 40,
        topGapToPreviousBullet: 0.3, // 0x line height
      },
      bullet2: {
        marker: DEFAULT_BULLET_MARKERS[1],
        markerIndent: 40,
        textIndent: 80,
        topGapToPreviousBullet: 0.3, // 0x line height
      },
      bullet3: {
        marker: DEFAULT_BULLET_MARKERS[2],
        markerIndent: 80,
        textIndent: 120,
        topGapToPreviousBullet: 0.3, // 0x line height
      },
    },
    itemLayoutDefaults: {
      spacer: { stretch: false, fillArea: true },
      paragraph: { stretch: false, fillArea: false },
      heading: { stretch: false, fillArea: false },
      bullets: { stretch: false, fillArea: false },
      quote: { stretch: false, fillArea: false },
      figure: { stretch: true, fillArea: true },
      htmlImage: { stretch: true, fillArea: true },
    },
  },
};

export type DefaultPageStyle = typeof _DS;

export function getDefaultPageStyle(): DefaultPageStyle {
  return _DS;
}
