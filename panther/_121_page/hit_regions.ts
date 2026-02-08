// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { RectCoordsDims as RCD } from "./deps.ts";
import type { LayoutGap, MeasuredLayoutNode, RectCoordsDims } from "./deps.ts";
import type {
  MeasuredFreeformPage,
  MeasuredPage,
  PageContentItem,
  PagePrimitiveText,
} from "./types.ts";

// Text-based hit target (from primitives)
export type PageHitTargetText = {
  type:
    | "coverTitle"
    | "coverSubTitle"
    | "coverAuthor"
    | "coverDate"
    | "sectionTitle"
    | "sectionSubTitle"
    | "headerText"
    | "subHeaderText"
    | "dateText"
    | "footerText";
  rcd: RectCoordsDims;
};

// Layout item hit target (from freeform content)
export type PageHitTargetLayoutItem = {
  type: "layoutItem";
  rcd: RectCoordsDims;
  node: MeasuredLayoutNode<PageContentItem>;
};

// Gap hit targets (from freeform layout gaps)
export type PageHitTargetRowGap = {
  type: "rowGap";
  rcd: RectCoordsDims;
  gap: LayoutGap & { type: "row-gap" };
};

export type PageHitTargetColGap = {
  type: "colGap";
  rcd: RectCoordsDims;
  gap: LayoutGap & { type: "col-gap" };
};

export type PageHitTargetColDivider = {
  type: "colDivider";
  rcd: RectCoordsDims;
  gap: LayoutGap & { type: "col-divider" };
};

// Union of all hit target types
export type PageHitTarget =
  | PageHitTargetText
  | PageHitTargetLayoutItem
  | PageHitTargetRowGap
  | PageHitTargetColGap
  | PageHitTargetColDivider;

export function buildHitRegions(mPage: MeasuredPage): PageHitTarget[] {
  const regions: PageHitTarget[] = [];

  // Extract text primitives from all page types
  for (const prim of mPage.primitives) {
    if (prim.type === "text") {
      const rcd = getTextPrimitiveRcd(prim);
      regions.push({
        type: prim.id as PageHitTargetText["type"],
        rcd,
      });
    }
  }

  // For freeform pages, add layout and gap regions
  if (mPage.type === "freeform") {
    collectItemHitRegions(mPage.mLayout, regions);
    addGapHitRegions(mPage, regions);
  }

  return regions;
}

// Helper to get bounding rect from text primitive
function getTextPrimitiveRcd(prim: PagePrimitiveText): RectCoordsDims {
  // Use maxWidth if available (for full-width hit areas), otherwise use measured text width
  const w = prim.maxWidth ?? prim.mText.dims.w();
  const h = prim.mText.dims.h();

  let x = prim.x;
  if (prim.hAlign === "center") {
    x = prim.x - w / 2;
  } else if (prim.hAlign === "right") {
    x = prim.x - w;
  }

  let y = prim.y;
  if (prim.vAlign === "center") {
    y = prim.y - h / 2;
  } else if (prim.vAlign === "bottom") {
    y = prim.y - h;
  }

  return new RCD([x, y, w, h]);
}

const COL_DIVIDER_HIT_WIDTH = 10;

function addGapHitRegions(
  mPage: MeasuredFreeformPage,
  regions: PageHitTarget[],
): void {
  for (const gap of mPage.gaps) {
    if (gap.type === "col-divider") {
      // Create a hit region around the divider line
      const rcd = mPage.rcdContentInner.getAdjusted({
        x: gap.line.x - COL_DIVIDER_HIT_WIDTH / 2,
        y: gap.line.y1,
        w: COL_DIVIDER_HIT_WIDTH,
        h: gap.line.y2 - gap.line.y1,
      });
      regions.push({ type: "colDivider", gap, rcd });
    }
  }
}

function collectItemHitRegions(
  node: MeasuredLayoutNode<PageContentItem>,
  regions: PageHitTarget[],
): void {
  if (node.type === "item") {
    regions.push({ type: "layoutItem", rcd: node.rpd, node });
  } else if (node.type === "cols") {
    for (const child of node.children) {
      if (child.type === "item") {
        const rcd = new RCD([
          child.rpd.x(),
          child.rpd.y(),
          child.rpd.w(),
          node.rpd.h(),
        ]);
        regions.push({ type: "layoutItem", rcd, node: child });
      } else {
        collectItemHitRegions(child, regions);
      }
    }
  } else {
    for (const child of node.children) {
      collectItemHitRegions(child, regions);
    }
  }
}

export function findHitTarget(
  regions: PageHitTarget[],
  x: number,
  y: number,
): PageHitTarget | undefined {
  for (const region of regions) {
    if (isPointInRcd(region.rcd, x, y)) {
      return region;
    }
  }
  return undefined;
}

function isPointInRcd(rcd: RectCoordsDims, x: number, y: number): boolean {
  return (
    x >= rcd.x() &&
    x <= rcd.x() + rcd.w() &&
    y >= rcd.y() &&
    y <= rcd.y() + rcd.h()
  );
}
