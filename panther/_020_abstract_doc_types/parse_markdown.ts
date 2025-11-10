// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  type ADTBullet,
  type ADTBullets,
  getBulletLevelFromIndentation,
} from "./bullets.ts";
import type { ADTParagraph } from "./paragraph.ts";

export function parseMarkdownContent(
  markdown: string,
): (ADTParagraph | ADTBullets)[] {
  const result: (ADTParagraph | ADTBullets)[] = [];

  // Split into lines and clean up
  const lines = markdown.split("\n");

  let currentBullets: ADTBullet[] = [];
  let currentParagraphLines: string[] = [];
  let isNumberedList = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmedLine = line.trim();

    // Skip empty lines if we're not building anything
    if (
      trimmedLine === "" &&
      currentParagraphLines.length === 0 &&
      currentBullets.length === 0
    ) {
      continue;
    }

    // Check if it's a bullet point (-, *, or numbered)
    const dashStarMatch = trimmedLine.match(/^[-*]\s+(.*)/);
    const numberedMatch = trimmedLine.match(/^\d+\.\s+(.*)/);
    const bulletMatch = dashStarMatch || numberedMatch;

    if (bulletMatch) {
      // First, flush any pending paragraph
      if (currentParagraphLines.length > 0) {
        result.push({ p: currentParagraphLines.join(" ").trim() });
        currentParagraphLines = [];
      }

      // If starting a new bullet list, track if it's numbered
      if (currentBullets.length === 0) {
        isNumberedList = !!numberedMatch;
      }

      // Determine bullet level based on indentation
      const leadingSpaces = line.match(/^(\s*)/)?.[1].length ?? 0;
      const level = getBulletLevelFromIndentation(leadingSpaces);

      // Add to current bullets
      const bulletText = bulletMatch[1].trim();
      currentBullets.push({ bullet: bulletText, level });
    } // Check if it's a heading (#, ##, ###, ####, #####)
    else if (trimmedLine.match(/^#{1,5}\s+/)) {
      // Flush any pending bullets
      if (currentBullets.length > 0) {
        const bulletItem: ADTBullets = { bullets: currentBullets };
        if (isNumberedList) {
          bulletItem.s = { numbered: true };
        }
        result.push(bulletItem);
        currentBullets = [];
        isNumberedList = false;
      }

      // Flush any pending paragraph
      if (currentParagraphLines.length > 0) {
        result.push({ p: currentParagraphLines.join(" ").trim() });
        currentParagraphLines = [];
      }

      // Extract the heading text (remove the # symbols)
      const headingText = trimmedLine.replace(/^#+\s+/, "").trim();
      result.push({ p: headingText });
    } // Empty line - end current paragraph or bullets
    else if (trimmedLine === "") {
      // Flush bullets if any
      if (currentBullets.length > 0) {
        const bulletItem: ADTBullets = { bullets: currentBullets };
        if (isNumberedList) {
          bulletItem.s = { numbered: true };
        }
        result.push(bulletItem);
        currentBullets = [];
        isNumberedList = false;
      }

      // Flush paragraph if any
      if (currentParagraphLines.length > 0) {
        result.push({ p: currentParagraphLines.join(" ").trim() });
        currentParagraphLines = [];
      }
    } // Regular text line
    else {
      // Flush bullets if switching from bullets to paragraph
      if (currentBullets.length > 0) {
        const bulletItem: ADTBullets = { bullets: currentBullets };
        if (isNumberedList) {
          bulletItem.s = { numbered: true };
        }
        result.push(bulletItem);
        currentBullets = [];
        isNumberedList = false;
      }

      // Add to current paragraph
      currentParagraphLines.push(trimmedLine);
    }
  }

  // Flush any remaining content
  if (currentBullets.length > 0) {
    const bulletItem: ADTBullets = { bullets: currentBullets };
    if (isNumberedList) {
      bulletItem.s = { numbered: true };
    }
    result.push(bulletItem);
  }
  if (currentParagraphLines.length > 0) {
    result.push({ p: currentParagraphLines.join(" ").trim() });
  }

  return result;
}
