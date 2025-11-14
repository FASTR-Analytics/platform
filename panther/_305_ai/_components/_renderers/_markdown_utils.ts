// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { MarkdownIt } from "../../deps.ts";

export const md = new MarkdownIt();

export const MARKDOWN_STYLES =
  "[&_code]:bg-base-200 [&_code]:rounded [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-xs [&_code]:font-mono [&_em]:italic [&_h1]:mb-2 [&_h1]:mt-3 [&_h1]:text-lg [&_h1]:font-bold [&_h2]:mb-2 [&_h2]:mt-3 [&_h2]:text-base [&_h2]:font-bold [&_h3]:mt-2 [&_h3]:font-bold [&_li]:ml-2 [&_ol]:my-2 [&_ol]:ml-6 [&_ol]:list-decimal [&_p]:my-2 [&>p:first-child]:mt-0 [&>p:last-child]:mb-0 [&_pre]:my-3 [&_pre]:rounded [&_pre]:p-2 [&_pre]:bg-base-200 [&_pre]:font-mono [&_strong]:font-bold [&_ul]:my-2 [&_ul]:ml-6 [&_ul]:list-disc";
