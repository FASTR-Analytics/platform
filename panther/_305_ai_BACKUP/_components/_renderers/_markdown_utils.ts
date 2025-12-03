// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { MarkdownIt } from "../../deps.ts";

export const md = new MarkdownIt({ breaks: true });

export const MARKDOWN_STYLES =
  "[&_code]:bg-primary/15 [&_code]:rounded [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-xs [&_code]:font-mono [&_em]:italic [&_h1]:mb-2 [&_h1]:mt-3 [&_h1]:text-lg [&_h1]:font-700 [&_h2]:mb-2 [&_h2]:mt-3 [&_h2]:text-base [&_h2]:font-700 [&_h3]:mt-2 [&_h3]:font-700 [&_hr]:my-4 [&_li]:ml-2 [&_ol]:my-2 [&_ol]:ml-6 [&_ol]:list-decimal [&_p]:my-2 [&>p:first-child]:mt-0 [&>p:last-child]:mb-0 [&_pre]:my-3 [&_pre]:rounded [&_pre]:p-2 [&_pre]:bg-primary/15 [&_pre]:font-mono [&_strong]:font-700 [&_table]:border-collapse [&_table]:my-2 [&_table]:font-mono [&_table]:text-xs [&_th]:border [&_th]:border-primary/50 [&_th]:px-2 [&_th]:py-1 [&_th]:bg-primary/15 [&_th]:font-700 [&_td]:border [&_td]:border-primary/50 [&_td]:px-2 [&_td]:py-1 [&_ul]:my-2 [&_ul]:ml-6 [&_ul]:list-disc";
