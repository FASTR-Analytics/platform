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
  scale?: number;
  leftAlignMath?: boolean;
};

const STYLE_CONFIGS = {
  github: {
    h1: "text-[2em] font-700 mt-[0.75em] mb-[0.5em] leading-[1.25]",
    h2: "text-[1.5em] font-700 mt-[1em] mb-[0.67em] leading-[1.25]",
    h3: "text-[1.25em] font-700 mt-[1.2em] mb-[0.8em] leading-[1.25]",
    h4: "text-[1em] font-700 mt-[1.5em] mb-[1em] leading-[1.25]",
    h5: "text-[0.875em] font-700 mt-[1.71em] mb-[1.14em] leading-[1.25]",
    h6: "text-[0.85em] font-700 mt-[2.33em] mb-[1.18em] leading-[1.25]",
    p: "mt-0 mb-[0.8em] leading-normal",
    ul:
      "list-disc mt-0 mb-[1em] pl-[2em] [&_li]:mt-[0.5em] [&_li]:leading-[1.375]",
    ol:
      "list-decimal mt-0 mb-[1em] pl-[2em] [&_li]:mt-[0.5em] [&_li]:leading-[1.375]",
    strong: "font-700",
  },
};

const md = new MarkdownIt({ breaks: true, html: true });
md.use(markdownItKatex);

md.renderer.rules.image = (tokens: Token[], idx: number) => {
  const token = tokens[idx];
  const src = token.attrGet("src") || "";
  const alt = token.content || "";
  return `<div class="my-[1.5em] border border-base-300 rounded p-[1em]"><img src="${src}" alt="${alt}" class="w-full" /></div>`;
};

md.renderer.rules.table_open = () => {
  return '<div class="overflow-x-auto my-[1.5em]"><table class="w-full border-collapse">';
};

md.renderer.rules.table_close = () => {
  return "</table></div>";
};

md.renderer.rules.thead_open = () => {
  return '<thead class="bg-base-200">';
};

md.renderer.rules.th_open = () => {
  return '<th class="border border-base-300 px-[1em] py-[0.5em] text-left font-700">';
};

md.renderer.rules.td_open = () => {
  return '<td class="border border-base-300 px-[1em] py-[0.5em]">';
};

md.renderer.rules.hr = () => {
  return '<hr class="my-[2em] border-t border-base-300" />';
};

md.renderer.rules.blockquote_open = () => {
  return '<blockquote class="border-l-4 border-base-300 pl-[1em] my-[1.5em] italic text-neutral">';
};

md.renderer.rules.blockquote_close = () => {
  return "</blockquote>";
};

md.renderer.rules.link_open = (tokens: Token[], idx: number) => {
  const token = tokens[idx];
  const href = token.attrGet("href") || "";
  return `<a href="${href}" class="text-primary underline hover:opacity-80">`;
};

md.renderer.rules.code_inline = (tokens: Token[], idx: number) => {
  const token = tokens[idx];
  const content = token.content;
  return `<code class="bg-base-200 px-[0.4em] py-[0.2em] rounded font-mono text-[0.9em]">${content}</code>`;
};

md.renderer.rules.fence = (tokens: Token[], idx: number) => {
  const token = tokens[idx];
  const content = token.content;
  const lang = token.info || "";
  return `<pre class="bg-base-200 p-[1em] rounded my-[1.5em] overflow-x-auto"><code class="font-mono text-[0.9em]">${content}</code></pre>`;
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
          ${
          p.leftAlignMath
            ? ".markdown-content .katex-display { text-align: left !important; }"
            : ""
        }
        `}
      </style>
      <div
        class="markdown-content ui-spy max-w-none"
        style={{ "font-size": `${p.scale ?? 1}em` }}
        innerHTML={htmlContent()}
      />
    </>
  );
}
