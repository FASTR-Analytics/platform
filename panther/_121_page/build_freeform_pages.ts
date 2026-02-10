// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { CustomPageStyleOptions, LayoutNode } from "./deps.ts";
import { createRowsNode } from "./deps.ts";
import type { FreeformPageInputs, PageContentItem } from "./types.ts";

export type FreeformPagesConfig = {
  header?: string;
  subHeader?: string;
  footer?: string;
  date?: string;
  pageNumbers?: boolean;
  firstPageHeader?: string;
  firstPageSubHeader?: string;
  skipHeaderOnFirstPage?: boolean;
  style?: CustomPageStyleOptions;
};

export function buildFreeformPages<T extends PageContentItem>(
  pageContents: LayoutNode<T>[][],
  config: FreeformPagesConfig,
): FreeformPageInputs[] {
  return pageContents.map((content, i) => {
    const isFirstPage = i === 0;

    const header = isFirstPage && config.skipHeaderOnFirstPage
      ? undefined
      : config.firstPageHeader && isFirstPage
      ? config.firstPageHeader
      : config.header;

    const subHeader = isFirstPage && config.skipHeaderOnFirstPage
      ? undefined
      : isFirstPage && config.firstPageSubHeader
      ? config.firstPageSubHeader
      : config.subHeader;

    return {
      type: "freeform" as const,
      header,
      subHeader,
      footer: config.footer,
      date: config.date,
      pageNumber: config.pageNumbers ? String(i + 1) : undefined,
      content: {
        layoutType: "explicit" as const,
        layout: createRowsNode(content) as LayoutNode<PageContentItem>,
      },
      style: config.style,
    };
  });
}
