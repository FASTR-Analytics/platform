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
      padding: [180, 250],
      logosPlacement: { position: "above-content", gap: 60 },
      logosSizing: {
        targetArea: 100000,
        maxHeight: 180,
        maxWidth: 500,
        gapX: 80,
      },
      titleBottomPadding: 60,
      subTitleBottomPadding: 60,
      authorBottomPadding: 60,
    },
    section: {
      alignH: "center",
      alignV: "middle",
      padding: [180, 250],
      sectionTitleBottomPadding: 50,
    },
    freeform: {
      header: {
        alignH: "left",
        paddingIfFilled: [20, 30],
        paddingIfBordered: [20, 30],
        paddingIfNone: [20, 30, 0, 30],
        borderWidthIfBordered: 6,
        logosSizing: {
          targetArea: 80000,
          maxHeight: 150,
          maxWidth: 400,
          gapX: 80,
        },
        headerBottomPadding: 25,
        subHeaderBottomPadding: 18,
      },
      footer: {
        alignH: "left",
        paddingIfFilled: [15, 30],
        paddingIfBordered: [15, 30],
        paddingIfNone: [10, 30, 15, 30],
        borderWidthIfBordered: 6,
        logosSizing: {
          targetArea: 60000,
          maxHeight: 110,
          maxWidth: 300,
          gapX: 80,
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
      padding: [120, 180, 180, 180],
      logosPlacement: { position: "top-right", gap: 60 },
      logosSizing: {
        targetArea: 70000,
        maxHeight: 140,
        maxWidth: 400,
        gapX: 50,
      },
      titleBottomPadding: 40,
      subTitleBottomPadding: 35,
      authorBottomPadding: 30,
    },
    section: {
      alignH: "left",
      alignV: "bottom",
      padding: [150, 180],
      sectionTitleBottomPadding: 45,
    },
    freeform: {
      header: {
        alignH: "left",
        paddingIfFilled: [20, 30],
        paddingIfBordered: [20, 30],
        paddingIfNone: [20, 30, 0, 30],
        borderWidthIfBordered: 6,
        logosSizing: {
          targetArea: 70000,
          maxHeight: 140,
          maxWidth: 350,
          gapX: 45,
        },
        headerBottomPadding: 22,
        subHeaderBottomPadding: 16,
      },
      footer: {
        alignH: "left",
        paddingIfFilled: [15, 30],
        paddingIfBordered: [15, 30],
        paddingIfNone: [10, 30, 15, 30],
        borderWidthIfBordered: 6,
        logosSizing: {
          targetArea: 55000,
          maxHeight: 110,
          maxWidth: 280,
          gapX: 40,
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
      padding: [180, 180],
      logosPlacement: { position: "bottom-right", gap: 60 },
      logosSizing: {
        targetArea: 80000,
        maxHeight: 160,
        maxWidth: 450,
        gapX: 60,
      },
      titleBottomPadding: 50,
      subTitleBottomPadding: 50,
      authorBottomPadding: 50,
    },
    section: {
      alignH: "left",
      alignV: "top",
      padding: [180, 180],
      sectionTitleBottomPadding: 45,
    },
    freeform: {
      header: {
        alignH: "left",
        paddingIfFilled: [20, 30],
        paddingIfBordered: [20, 30],
        paddingIfNone: [20, 30, 0, 30],
        borderWidthIfBordered: 6,
        logosSizing: {
          targetArea: 75000,
          maxHeight: 145,
          maxWidth: 380,
          gapX: 60,
        },
        headerBottomPadding: 22,
        subHeaderBottomPadding: 16,
      },
      footer: {
        alignH: "left",
        paddingIfFilled: [15, 30],
        paddingIfBordered: [15, 30],
        paddingIfNone: [10, 30, 15, 30],
        borderWidthIfBordered: 6,
        logosSizing: {
          targetArea: 58000,
          maxHeight: 110,
          maxWidth: 290,
          gapX: 60,
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
      padding: [180, 180],
      split: { placement: "left", sizeAsPct: 0.1 },
      logosPlacement: { position: "bottom-right", gap: 60 },
      logosSizing: {
        targetArea: 80000,
        maxHeight: 160,
        maxWidth: 450,
        gapX: 60,
      },
      titleBottomPadding: 50,
      subTitleBottomPadding: 50,
      authorBottomPadding: 50,
    },
    section: {
      alignH: "left",
      alignV: "top",
      padding: [180, 180],
      split: { placement: "left", sizeAsPct: 0.1 },
      sectionTitleBottomPadding: 45,
    },
    freeform: {
      header: {
        alignH: "left",
        paddingIfFilled: [20, 30],
        paddingIfBordered: [20, 30],
        paddingIfNone: [20, 30, 0, 30],
        borderWidthIfBordered: 6,
        logosSizing: {
          targetArea: 75000,
          maxHeight: 145,
          maxWidth: 380,
          gapX: 60,
        },
        headerBottomPadding: 22,
        subHeaderBottomPadding: 16,
      },
      footer: {
        alignH: "left",
        paddingIfFilled: [15, 30],
        paddingIfBordered: [15, 30],
        paddingIfNone: [10, 30, 15, 30],
        borderWidthIfBordered: 6,
        logosSizing: {
          targetArea: 58000,
          maxHeight: 110,
          maxWidth: 290,
          gapX: 60,
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
