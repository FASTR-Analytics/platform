// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { CustomPageStyleOptions, LayoutNode } from "./deps.ts";
import { createRowsNode } from "./deps.ts";
import type { FreeformPageInputs, PageContentItem } from "./types.ts";

export type PageNumberFormat =
  | "number"
  | "n-of-total"
  | ((page: number, total: number) => string);

export type FreeformPagesConfig = {
  header?: string;
  subHeader?: string;
  footer?: string;
  date?: string;
  pageNumbers?: boolean | PageNumberFormat;
  firstPageHeader?: string;
  firstPageSubHeader?: string;
  skipHeaderOnFirstPage?: boolean;
  style?: CustomPageStyleOptions;
};

export function buildFreeformPages<T extends PageContentItem>(
  pageContents: LayoutNode<T>[][],
  config: FreeformPagesConfig,
): FreeformPageInputs[] {
  const total = pageContents.length;
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
      pageNumber: formatPageNumber(config.pageNumbers, i + 1, total),
      content: createRowsNode(content) as LayoutNode<PageContentItem>,
      style: config.style,
    };
  });
}

function formatPageNumber(
  format: boolean | PageNumberFormat | undefined,
  page: number,
  total: number,
): string | undefined {
  if (!format) return undefined;
  if (format === true || format === "number") return String(page);
  if (format === "n-of-total") return `${page} of ${total}`;
  return format(page, total);
}
