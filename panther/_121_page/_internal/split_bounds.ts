// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { type MergedSplitConfig, RectCoordsDims } from "../deps.ts";

export function computeSplitBounds(
  fullBounds: RectCoordsDims,
  splitConfig: MergedSplitConfig,
): { splitBounds: RectCoordsDims; contentBounds: RectCoordsDims } {
  const pct = splitConfig.sizeAsPct;
  switch (splitConfig.placement) {
    case "left": {
      const splitW = fullBounds.w() * pct;
      return {
        splitBounds: new RectCoordsDims([
          fullBounds.x(),
          fullBounds.y(),
          splitW,
          fullBounds.h(),
        ]),
        contentBounds: new RectCoordsDims([
          fullBounds.x() + splitW,
          fullBounds.y(),
          fullBounds.w() - splitW,
          fullBounds.h(),
        ]),
      };
    }
    case "right": {
      const splitW = fullBounds.w() * pct;
      return {
        splitBounds: new RectCoordsDims([
          fullBounds.x() + fullBounds.w() - splitW,
          fullBounds.y(),
          splitW,
          fullBounds.h(),
        ]),
        contentBounds: new RectCoordsDims([
          fullBounds.x(),
          fullBounds.y(),
          fullBounds.w() - splitW,
          fullBounds.h(),
        ]),
      };
    }
    case "top": {
      const splitH = fullBounds.h() * pct;
      return {
        splitBounds: new RectCoordsDims([
          fullBounds.x(),
          fullBounds.y(),
          fullBounds.w(),
          splitH,
        ]),
        contentBounds: new RectCoordsDims([
          fullBounds.x(),
          fullBounds.y() + splitH,
          fullBounds.w(),
          fullBounds.h() - splitH,
        ]),
      };
    }
    case "bottom": {
      const splitH = fullBounds.h() * pct;
      return {
        splitBounds: new RectCoordsDims([
          fullBounds.x(),
          fullBounds.y() + fullBounds.h() - splitH,
          fullBounds.w(),
          splitH,
        ]),
        contentBounds: new RectCoordsDims([
          fullBounds.x(),
          fullBounds.y(),
          fullBounds.w(),
          fullBounds.h() - splitH,
        ]),
      };
    }
    case "none":
      throw new Error("computeSplitBounds called with placement 'none'");
  }
}
