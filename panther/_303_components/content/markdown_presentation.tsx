// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { createEffect, createMemo } from "solid-js";
import markdownItKatex from "@vscode/markdown-it-katex";
import "katex/dist/katex.min.css";
import type { CustomMarkdownStyleOptions, ImageMap } from "../deps.ts";
import { createMarkdownIt } from "../deps.ts";
import {
  deriveMarkdownCssVars,
  MARKDOWN_BASE_STYLES,
} from "../utils/markdown_tailwind.ts";

type Props = {
  markdown: string;
  style?: CustomMarkdownStyleOptions;
  scale?: number;
  images?: ImageMap;
  contentWidth?: string;
};

const md = createMarkdownIt();
md.use(markdownItKatex);

export function MarkdownPresentation(p: Props) {
  let containerRef: HTMLDivElement | undefined;

  const htmlContent = createMemo(() => {
    return md.render(p.markdown);
  });

  createEffect(() => {
    if (!p.images || !containerRef) return;

    containerRef.querySelectorAll("img").forEach((img) => {
      const src = img.getAttribute("src");
      if (src) {
        const imageInfo = p.images!.get(src);
        if (imageInfo) {
          img.src = imageInfo.dataUrl;
          img.width = imageInfo.width;
          img.height = imageInfo.height;
        }
      }
    });
  });

  const allStyles = createMemo(() => {
    return {
      "font-size": `${p.scale ?? 1}em`,
      "--md-content-width": p.contentWidth ?? "100%",
      ...deriveMarkdownCssVars(p.style),
    };
  });

  return (
    <div
      ref={containerRef}
      class={MARKDOWN_BASE_STYLES}
      style={allStyles()}
      innerHTML={htmlContent()}
    />
  );
}
