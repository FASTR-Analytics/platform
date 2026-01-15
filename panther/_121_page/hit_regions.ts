// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { LayoutGap, MeasuredLayoutNode, RectCoordsDims } from "./deps.ts";
import type {
  MeasuredFreeformPage,
  MeasuredPage,
  PageContentItem,
} from "./types.ts";

export type PageHitTargetHeader = {
  type: "header";
  rcd: RectCoordsDims;
};

export type PageHitTargetFooter = {
  type: "footer";
  rcd: RectCoordsDims;
};

export type PageHitTargetCover = {
  type: "cover";
  rcd: RectCoordsDims;
};

export type PageHitTargetSection = {
  type: "section";
  rcd: RectCoordsDims;
};

export type PageHitTargetLayoutItem = {
  type: "layoutItem";
  node: MeasuredLayoutNode<PageContentItem>;
  rcd: RectCoordsDims;
};

export type PageHitTargetRowGap = {
  type: "rowGap";
  gap: LayoutGap & { type: "row-gap" };
  rcd: RectCoordsDims;
};

export type PageHitTargetColGap = {
  type: "colGap";
  gap: LayoutGap & { type: "col-gap" };
  rcd: RectCoordsDims;
};

export type PageHitTargetColDivider = {
  type: "colDivider";
  gap: LayoutGap & { type: "col-divider" };
  rcd: RectCoordsDims;
};

export type PageHitTarget =
  | PageHitTargetHeader
  | PageHitTargetFooter
  | PageHitTargetCover
  | PageHitTargetSection
  | PageHitTargetLayoutItem
  | PageHitTargetRowGap
  | PageHitTargetColGap
  | PageHitTargetColDivider;

export function buildHitRegions(mPage: MeasuredPage): PageHitTarget[] {
  const regions: PageHitTarget[] = [];

  if (mPage.type === "freeform") {
    addFreeformHitRegions(mPage, regions);
  } else if (mPage.type === "cover") {
    regions.push({ type: "cover", rcd: mPage.bounds });
  } else if (mPage.type === "section") {
    regions.push({ type: "section", rcd: mPage.bounds });
  }

  return regions;
}

function addFreeformHitRegions(
  mPage: MeasuredFreeformPage,
  regions: PageHitTarget[],
): void {
  if (mPage.header) {
    regions.push({ type: "header", rcd: mPage.header.rcdHeaderOuter });
  }

  if (mPage.footer) {
    regions.push({ type: "footer", rcd: mPage.footer.rcdFooterOuter });
  }

  walkMeasuredLayoutForItems(mPage.mLayout, regions);
  addGapHitRegions(mPage, regions);
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

function walkMeasuredLayoutForItems(
  node: MeasuredLayoutNode<PageContentItem>,
  regions: PageHitTarget[],
): void {
  if (node.type === "item") {
    regions.push({ type: "layoutItem", node, rcd: node.rpd });
  } else {
    for (const child of node.children) {
      walkMeasuredLayoutForItems(child, regions);
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
