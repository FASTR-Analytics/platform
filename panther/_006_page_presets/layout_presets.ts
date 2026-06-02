// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { LayoutPresetConfig } from "./types.ts";

const LAYOUT_PRESETS = {
  default: {
    name: "Default",
    description: "Original wb-fastr layout values",
    cover: {
      alignH: "center",
      alignV: "middle",
      padding: [60, 80],
      logosPlacement: { position: "above-content", gap: 60 },
      logosSizing: {
        targetArea: 10000,
        maxHeight: 80,
        maxWidth: 120,
        gapX: 20,
      },
      titleBottomPadding: 20,
      subTitleBottomPadding: 20,
      authorBottomPadding: 20,
    },
    section: {
      alignH: "center",
      alignV: "middle",
      padding: [60, 80],
      sectionTitleBottomPadding: 20,
    },
    freeform: {
      header: {
        alignH: "left",
        paddingIfFilled: [20, 30],
        paddingIfBordered: [20, 30],
        paddingIfNone: [20, 30, 0, 30],
        borderWidthIfBordered: 6,
        logosSizing: {
          targetArea: 6000,
          maxHeight: 60,
          maxWidth: 100,
          gapX: 20,
        },
        headerBottomPadding: 8,
        subHeaderBottomPadding: 5,
      },
      footer: {
        alignH: "left",
        paddingIfFilled: [20, 30],
        paddingIfBordered: [20, 30],
        paddingIfNone: [10, 30, 20, 30],
        borderWidthIfBordered: 6,
        logosSizing: {
          targetArea: 6000,
          maxHeight: 60,
          maxWidth: 100,
          gapX: 20,
        },
      },
      content: { padding: [20, 30], gapX: 30, gapY: 20 },
    },
  },
  modern: {
    name: "Modern",
    description: "Asymmetric left-aligned layout with contemporary feel",
    cover: {
      alignH: "left",
      alignV: "bottom",
      padding: [60, 80],
      logosPlacement: { position: "top-right", gap: 60 },
      logosSizing: {
        targetArea: 10000,
        maxHeight: 80,
        maxWidth: 120,
        gapX: 20,
      },
      titleBottomPadding: 20,
      subTitleBottomPadding: 20,
      authorBottomPadding: 20,
    },
    section: {
      alignH: "left",
      alignV: "bottom",
      padding: [60, 80],
      sectionTitleBottomPadding: 20,
    },
    freeform: {
      header: {
        alignH: "left",
        paddingIfFilled: [20, 30],
        paddingIfBordered: [20, 30],
        paddingIfNone: [20, 30, 0, 30],
        borderWidthIfBordered: 6,
        logosSizing: {
          targetArea: 6000,
          maxHeight: 60,
          maxWidth: 100,
          gapX: 20,
        },
        headerBottomPadding: 8,
        subHeaderBottomPadding: 5,
      },
      footer: {
        alignH: "left",
        paddingIfFilled: [20, 30],
        paddingIfBordered: [20, 30],
        paddingIfNone: [10, 30, 20, 30],
        borderWidthIfBordered: 6,
        logosSizing: {
          targetArea: 6000,
          maxHeight: 60,
          maxWidth: 100,
          gapX: 20,
        },
      },
      content: { padding: [20, 30], gapX: 30, gapY: 20 },
    },
  },
  corporate: {
    name: "Corporate",
    description: "Top-left content with logos in bottom right",
    cover: {
      alignH: "left",
      alignV: "top",
      padding: [60, 80],
      logosPlacement: { position: "bottom-right", gap: 60 },
      logosSizing: {
        targetArea: 10000,
        maxHeight: 80,
        maxWidth: 120,
        gapX: 20,
      },
      titleBottomPadding: 20,
      subTitleBottomPadding: 20,
      authorBottomPadding: 20,
    },
    section: {
      alignH: "left",
      alignV: "top",
      padding: [60, 80],
      sectionTitleBottomPadding: 20,
    },
    freeform: {
      header: {
        alignH: "left",
        paddingIfFilled: [20, 30],
        paddingIfBordered: [20, 30],
        paddingIfNone: [20, 30, 0, 30],
        borderWidthIfBordered: 6,
        logosSizing: {
          targetArea: 6000,
          maxHeight: 60,
          maxWidth: 100,
          gapX: 20,
        },
        headerBottomPadding: 8,
        subHeaderBottomPadding: 5,
      },
      footer: {
        alignH: "left",
        paddingIfFilled: [20, 30],
        paddingIfBordered: [20, 30],
        paddingIfNone: [10, 30, 20, 30],
        borderWidthIfBordered: 6,
        logosSizing: {
          targetArea: 6000,
          maxHeight: 60,
          maxWidth: 100,
          gapX: 20,
        },
      },
      content: { padding: [20, 30], gapX: 30, gapY: 20 },
    },
  },
  split: {
    name: "Split",
    description: "Left accent panel with content on right",
    cover: {
      alignH: "left",
      alignV: "top",
      padding: [60, 80],
      split: { placement: "left", sizeAsPct: 0.1 },
      logosPlacement: { position: "bottom-right", gap: 60 },
      logosSizing: {
        targetArea: 10000,
        maxHeight: 80,
        maxWidth: 120,
        gapX: 20,
      },
      titleBottomPadding: 20,
      subTitleBottomPadding: 20,
      authorBottomPadding: 20,
    },
    section: {
      alignH: "left",
      alignV: "top",
      padding: [60, 80],
      split: { placement: "left", sizeAsPct: 0.1 },
      sectionTitleBottomPadding: 20,
    },
    freeform: {
      header: {
        alignH: "left",
        paddingIfFilled: [20, 30],
        paddingIfBordered: [20, 30],
        paddingIfNone: [20, 30, 0, 30],
        borderWidthIfBordered: 6,
        logosSizing: {
          targetArea: 6000,
          maxHeight: 60,
          maxWidth: 100,
          gapX: 20,
        },
        headerBottomPadding: 8,
        subHeaderBottomPadding: 5,
      },
      footer: {
        alignH: "left",
        paddingIfFilled: [20, 30],
        paddingIfBordered: [20, 30],
        paddingIfNone: [10, 30, 20, 30],
        borderWidthIfBordered: 6,
        logosSizing: {
          targetArea: 6000,
          maxHeight: 60,
          maxWidth: 100,
          gapX: 20,
        },
      },
      content: { padding: [20, 30], gapX: 30, gapY: 20 },
    },
  },
} as const satisfies Record<string, LayoutPresetConfig>;

export const LAYOUT_PRESET_IDS = [
  "default",
  "modern",
  "corporate",
  "split",
] as const;

export type LayoutPresetId = (typeof LAYOUT_PRESET_IDS)[number];

export type LayoutPreset = LayoutPresetConfig & { id: LayoutPresetId };

export function getLayoutPresets(): LayoutPreset[] {
  return Object.entries(LAYOUT_PRESETS).map(([id, config]) => ({
    id: id as LayoutPresetId,
    ...config,
  }));
}

export function getLayoutPreset(id: LayoutPresetId): LayoutPreset {
  const config = LAYOUT_PRESETS[id];
  return { id, ...config };
}
