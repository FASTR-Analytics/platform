// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { createMemo } from "solid-js";
import MarkdownIt from "markdown-it";
import type Token from "markdown-it/lib/token.mjs";
import markdownItKatex from "@vscode/markdown-it-katex";
import "katex/dist/katex.min.css";

type Props = {
  markdown: string;
};

const md = new MarkdownIt();
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

export function MarkdownPresentation(p: Props) {
  const htmlContent = createMemo(() => {
    let html = md.render(p.markdown);

    html = html.replace(/<h1>/g, '<h1 class="text-2xl font-700 mt-8 mb-4">');
    html = html.replace(/<h2>/g, '<h2 class="text-xl font-700 mt-8 mb-3">');
    html = html.replace(/<h3>/g, '<h3 class="text-lg font-700 mt-4 mb-2">');
    html = html.replace(/<p>/g, '<p class="my-3 leading-relaxed">');
    html = html.replace(/<ul>/g, '<ul class="list-disc my-3 ml-6 space-y-1">');
    html = html.replace(
      /<ol>/g,
      '<ol class="list-decimal my-3 ml-6 space-y-1">',
    );
    html = html.replace(/<strong>/g, '<strong class="font-700">');

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
