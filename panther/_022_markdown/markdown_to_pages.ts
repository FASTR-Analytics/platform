// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type {
  ADTItem,
  CoverPageInputs,
  CustomPageStyleOptions,
  FreeformPageInputs,
  ItemOrContainerForLayout,
  PageInputs,
  SectionPageInputs,
} from "./deps.ts";
import { parseMarkdownContent } from "./deps.ts";

export type MarkdownToPageConfig = {
  style?: CustomPageStyleOptions;
  author?: string;
  watermark?: string;
  titleLogos?: HTMLImageElement[];
  headerLogos?: HTMLImageElement[];
  footerLogos?: HTMLImageElement[];
  overlay?: HTMLImageElement;
  pageNumber?: string;
};

export function markdownToPages(
  markdown: string,
  config?: MarkdownToPageConfig,
): PageInputs[] {
  const pages: PageInputs[] = [];

  // Split markdown into potential pages
  // We'll process line by line and create new pages based on headers
  const lines = markdown.split("\n");

  let currentPageLines: string[] = [];
  let currentPageType: "cover" | "section" | "freeform" = "freeform";
  let inPage = false;

  let pageNumber = 1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmedLine = line.trim();

    // Check for page boundary markers
    if (trimmedLine === "---" || trimmedLine.match(/^#{1,3}\s+/)) {
      // Process current page if we have content
      if (inPage && currentPageLines.length > 0) {
        const page = parsePageContent(
          currentPageLines,
          currentPageType,
          pageNumber,
          config ?? {},
        );
        if (page) {
          pages.push(page);
          pageNumber += 1;
        }
      }

      // Determine new page type based on header level
      if (trimmedLine.match(/^#\s+/)) {
        currentPageType = "cover";
      } else if (trimmedLine.match(/^##\s+/)) {
        currentPageType = "section";
      } else if (trimmedLine.match(/^###\s+/)) {
        currentPageType = "freeform";
      } else {
        // --- separator, continue with freeform
        currentPageType = "freeform";
      }

      // Start new page
      currentPageLines = [];
      inPage = true;

      // If it's a header, include it in the new page
      if (trimmedLine !== "---") {
        currentPageLines.push(line);
      }
    } else {
      // Add line to current page
      currentPageLines.push(line);
      if (!inPage && trimmedLine !== "") {
        inPage = true;
      }
    }
  }

  // Process final page
  if (inPage && currentPageLines.length > 0) {
    pageNumber += 1;
    const page = parsePageContent(
      currentPageLines,
      currentPageType,
      pageNumber,
      config ?? {},
    );
    if (page) {
      pages.push(page);
      pageNumber += 1;
    }
  }

  return pages;
}

function parsePageContent(
  lines: string[],
  pageType: "freeform" | "cover" | "section" = "freeform",
  pageNumber: number,
  config: MarkdownToPageConfig,
): PageInputs | null {
  let header: string | undefined;
  const contentLines: string[] = [];

  // Process lines to extract headers based on page type
  for (const line of lines) {
    const trimmedLine = line.trim();

    if (pageType === "cover" && trimmedLine.match(/^#\s+/)) {
      // For cover pages, # becomes the main header
      header = trimmedLine.substring(2).trim();
    } else if (pageType === "section" && trimmedLine.match(/^##\s+/)) {
      // For section pages, ## becomes the main header
      header = trimmedLine.substring(3).trim();
    } else if (pageType === "freeform" && trimmedLine.match(/^###\s+/)) {
      // For freeform pages, ### becomes the header
      header = trimmedLine.substring(4).trim();
    } else {
      // All other content (including #### and ##### headers)
      contentLines.push(line);
    }
  }

  // Parse the content
  const contentMarkdown = contentLines.join("\n").trim();
  const contentItems = parseMarkdownContent(contentMarkdown);

  // For cover pages, extract subHeader and date from content paragraphs
  let subHeader: string | undefined;
  let date: string | undefined;

  if (pageType === "cover" && contentItems.length > 0) {
    // Look for paragraphs before any section headers or dividers
    let paragraphCount = 0;
    for (const item of contentItems) {
      // Check if item is a paragraph (string or object with 'p' property)
      if (
        typeof item === "string" ||
        (typeof item === "object" && "p" in item)
      ) {
        const paragraphText = typeof item === "string"
          ? item
          : Array.isArray(item.p)
          ? item.p.join(" ")
          : item.p;

        if (paragraphCount === 0) {
          subHeader = paragraphText;
        } else if (paragraphCount === 1) {
          date = paragraphText;
        }
        paragraphCount++;

        // Stop after finding subHeader and date
        if (paragraphCount >= 2) break;
      }
    }
  }

  // For cover and section pages, we don't need content items
  // For freeform pages, we need at least a header or content
  if (pageType === "cover" || pageType === "section") {
    if (!header) {
      return null; // Cover and section pages must have a header
    }
  } else if (!header && contentItems.length === 0) {
    return null; // Freeform pages need some content
  }

  // Create the content structure
  let content: ItemOrContainerForLayout<ADTItem>;
  if (pageType === "cover" || pageType === "section") {
    // Cover and section pages don't display content items, but we need a valid content structure
    content = { rows: [] };
  } else {
    // Freeform pages display content
    content = contentItems.length > 0
      ? { rows: contentItems as ADTItem[] }
      : { rows: [{ p: "" }] }; // Single empty paragraph if no content
  }

  // Build the appropriate page type
  if (pageType === "cover") {
    const page: CoverPageInputs = {
      type: "cover",
      style: config.style,
      title: header,
      subTitle: subHeader,
      date,
      author: config.author,
      titleLogos: config.titleLogos,
      overlay: config.overlay,
      watermark: config.watermark,
    };
    return page;
  } else if (pageType === "section") {
    const page: SectionPageInputs = {
      type: "section",
      style: config.style,
      sectionTitle: header,
      sectionSubTitle: subHeader,
      watermark: config.watermark,
    };
    return page;
  } else {
    const page: FreeformPageInputs = {
      type: "freeform",
      style: config.style,
      header,
      subHeader,
      date,
      footer: undefined,
      headerLogos: config.headerLogos,
      footerLogos: config.footerLogos,
      overlay: config.overlay,
      content,
      pageNumber: config.pageNumber ? String(pageNumber) : undefined,
      watermark: config.watermark,
    };
    return page;
  }
}
