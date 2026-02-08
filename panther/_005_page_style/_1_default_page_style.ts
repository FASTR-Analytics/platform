// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { ColorKeyOrString, PaddingOptions } from "./deps.ts";

const _DS = {
  scale: 1,

  cover: {
    padding: [200, 300] as PaddingOptions,
    backgroundColor: { key: "base300" } as ColorKeyOrString,
    logoHeight: 320,
    logoGapX: 40,
    gapY: 30,
  },
  section: {
    padding: [200, 300] as PaddingOptions,
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
    gapX: 40,
    gapY: 40,
  },
  layoutContainers: {
    padding: 0 as PaddingOptions,
    backgroundColor: "none" as ColorKeyOrString,
    borderColor: "none" as ColorKeyOrString,
    borderWidth: 0,
  },
};

export type DefaultPageStyle = typeof _DS;

export function getDefaultPageStyle(): DefaultPageStyle {
  return _DS;
}
