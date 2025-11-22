// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { createMemo } from "solid-js";
import MarkdownIt from "markdown-it";
import type Token from "markdown-it/lib/token.mjs";
import markdownItKatex from "@vscode/markdown-it-katex";
import "katex/dist/katex.min.css";

export type MarkdownPresentationStyleId = "default" | "github";

type Props = {
  markdown: string;
  styleId?: MarkdownPresentationStyleId;
};

const STYLE_CONFIGS = {
  github: {
    h1: "text-[2em] font-700 mt-6 mb-4 leading-[1.25]",
    h2: "text-[1.5em] font-700 mt-6 mb-4 leading-[1.25]",
    h3: "text-[1.25em] font-700 mt-6 mb-4 leading-[1.25]",
    h4: "text-[1em] font-700 mt-6 mb-4 leading-[1.25]",
    h5: "text-[0.875em] font-700 mt-6 mb-4 leading-[1.25]",
    h6: "text-[0.85em] font-700 mt-6 mb-4 leading-[1.25]",
    p: "mt-0 mb-[0.8em] leading-normal",
    ul: "list-disc mt-0 mb-[1em] pl-8 [&_li]:mt-[0.5em] [&_li]:leading-[1.375]",
    ol:
      "list-decimal mt-0 mb-[1em] pl-8 [&_li]:mt-[0.5em] [&_li]:leading-[1.375]",
    strong: "font-700",
  },
};

const md = new MarkdownIt({ breaks: true });
md.use(markdownItKatex);

md.renderer.rules.image = (tokens: Token[], idx: number) => {
  const token = tokens[idx];
  const src = token.attrGet("src") || "";
  const alt = token.content || "";
  return `<div class="my-6 border border-base-300 rounded p-4"><img src="${src}" alt="${alt}" class="w-full" /></div>`;
};

md.renderer.rules.table_open = () => {
  return '<div class="overflow-x-auto my-6"><table class="w-full border-collapse">';
};

md.renderer.rules.table_close = () => {
  return "</table></div>";
};

md.renderer.rules.thead_open = () => {
  return '<thead class="bg-base-200">';
};

md.renderer.rules.th_open = () => {
  return '<th class="border border-base-300 px-4 py-2 text-left font-700">';
};

md.renderer.rules.td_open = () => {
  return '<td class="border border-base-300 px-4 py-2">';
};

md.renderer.rules.hr = () => {
  return '<hr class="my-8 border-t border-base-300" />';
};

md.renderer.rules.blockquote_open = () => {
  return '<blockquote class="border-l-4 border-base-300 pl-4 my-6 italic text-neutral">';
};

md.renderer.rules.blockquote_close = () => {
  return "</blockquote>";
};

export function MarkdownPresentation(p: Props) {
  const config = () => STYLE_CONFIGS.github;

  const htmlContent = createMemo(() => {
    const c = config();
    let html = md.render(p.markdown);

    html = html.replace(/<h1>/g, `<h1 class="${c.h1}">`);
    html = html.replace(/<h2>/g, `<h2 class="${c.h2}">`);
    html = html.replace(/<h3>/g, `<h3 class="${c.h3}">`);
    html = html.replace(/<h4>/g, `<h4 class="${c.h4}">`);
    html = html.replace(/<h5>/g, `<h5 class="${c.h5}">`);
    html = html.replace(/<h6>/g, `<h6 class="${c.h6}">`);
    html = html.replace(/<p>/g, `<p class="${c.p}">`);
    html = html.replace(/<ul>/g, `<ul class="${c.ul}">`);
    html = html.replace(/<ol>/g, `<ol class="${c.ol}">`);
    html = html.replace(/<strong>/g, `<strong class="${c.strong}">`);

    return html;
  });

  return (
    <>
      <style>
        {`
          .markdown-content > :first-child {
            margin-top: 0 !important;
          }
        `}
      </style>
      <div
        class="markdown-content ui-spy max-w-none"
        innerHTML={htmlContent()}
      />
    </>
  );
}
