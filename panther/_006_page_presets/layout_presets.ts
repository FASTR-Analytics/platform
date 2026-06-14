// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { LayoutPresetConfig } from "./types.ts";

const X_PAD = 45;
const Y_PAD = 30;

// const FREEFORM_HEADERS_PADDING = {
//   paddingIfFilled: [Y_PAD, X_PAD],
//   paddingIfBordered: [Y_PAD, X_PAD],
//   paddingIfNone: [Y_PAD, X_PAD, 0, X_PAD],
// };

const FREEFORM_HEADERS_PADDING = {
  paddingIfFilled: [Y_PAD, X_PAD],
  paddingIfBordered: [Y_PAD, X_PAD],
  paddingIfNone: [Y_PAD, X_PAD, 0, X_PAD],
};

const FREEFORM_CONTENT_PADDING: LayoutPresetConfig["freeform"]["content"] = {
  padding: [Y_PAD, X_PAD],
  gapX: X_PAD,
  gapY: Y_PAD,
};

const FREEFORM_FOOTER_PADDING = {
  paddingIfFilled: [Y_PAD, X_PAD],
  paddingIfBordered: [Y_PAD, X_PAD],
  paddingIfNone: [10, X_PAD, Y_PAD, X_PAD],
};

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
        ...FREEFORM_HEADERS_PADDING,
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
        ...FREEFORM_FOOTER_PADDING,
        borderWidthIfBordered: 6,
        logosSizing: {
          targetArea: 6000,
          maxHeight: 60,
          maxWidth: 100,
          gapX: 20,
        },
      },
      content: FREEFORM_CONTENT_PADDING,
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
        ...FREEFORM_HEADERS_PADDING,
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
        ...FREEFORM_FOOTER_PADDING,
        borderWidthIfBordered: 6,
        logosSizing: {
          targetArea: 6000,
          maxHeight: 60,
          maxWidth: 100,
          gapX: 20,
        },
      },
      content: FREEFORM_CONTENT_PADDING,
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
        ...FREEFORM_HEADERS_PADDING,
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
        ...FREEFORM_FOOTER_PADDING,
        borderWidthIfBordered: 6,
        logosSizing: {
          targetArea: 6000,
          maxHeight: 60,
          maxWidth: 100,
          gapX: 20,
        },
      },
      content: FREEFORM_CONTENT_PADDING,
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
        ...FREEFORM_HEADERS_PADDING,
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
        ...FREEFORM_FOOTER_PADDING,
        borderWidthIfBordered: 6,
        logosSizing: {
          targetArea: 6000,
          maxHeight: 60,
          maxWidth: 100,
          gapX: 20,
        },
      },
      content: FREEFORM_CONTENT_PADDING,
    },
  },
} satisfies Record<string, LayoutPresetConfig>;

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
