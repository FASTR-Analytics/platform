// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { CustomMarkdownStyle } from "../../_004_markdown_style/mod.ts";
import type { CustomMarkdownStyleOptions } from "../../_004_markdown_style/mod.ts";
import { getColor } from "../../_001_color/mod.ts";
import type { JSX } from "solid-js";

// Static class string - always included in Tailwind build
// Uses CSS custom properties for dynamic values
export const MARKDOWN_BASE_STYLES = `
  grid
  grid-cols-[minmax(1rem,1fr)_min(var(--md-content-width,100%),calc(100%-2rem))_minmax(1rem,1fr)]
  [&>*]:col-start-2
  [&>breakout]:col-span-full [&>breakout]:block [&>breakout]:px-4
  [&>*:first-child]:mt-0

  [&_h1]:[font-family:var(--md-h1-family)] [&_h1]:[font-weight:var(--md-h1-weight)]
  [&_h1]:[font-style:var(--md-h1-style)]
  [&_h1]:text-[length:var(--md-h1-size)] [&_h1]:text-[color:var(--md-h1-color)]
  [&_h1]:mt-[var(--md-h1-mt)] [&_h1]:mb-[var(--md-h1-mb)] [&_h1]:leading-[var(--md-h1-lh)]

  [&_h2]:[font-family:var(--md-h2-family)] [&_h2]:[font-weight:var(--md-h2-weight)]
  [&_h2]:[font-style:var(--md-h2-style)]
  [&_h2]:text-[length:var(--md-h2-size)] [&_h2]:text-[color:var(--md-h2-color)]
  [&_h2]:mt-[var(--md-h2-mt)] [&_h2]:mb-[var(--md-h2-mb)] [&_h2]:leading-[var(--md-h2-lh)]

  [&_h3]:[font-family:var(--md-h3-family)] [&_h3]:[font-weight:var(--md-h3-weight)]
  [&_h3]:[font-style:var(--md-h3-style)]
  [&_h3]:text-[length:var(--md-h3-size)] [&_h3]:text-[color:var(--md-h3-color)]
  [&_h3]:mt-[var(--md-h3-mt)] [&_h3]:mb-[var(--md-h3-mb)] [&_h3]:leading-[var(--md-h3-lh)]

  [&_h4]:[font-family:var(--md-h4-family)] [&_h4]:[font-weight:var(--md-h4-weight)]
  [&_h4]:[font-style:var(--md-h4-style)]
  [&_h4]:text-[length:var(--md-h4-size)] [&_h4]:text-[color:var(--md-h4-color)]
  [&_h4]:mt-[var(--md-h4-mt)] [&_h4]:mb-[var(--md-h4-mb)] [&_h4]:leading-[var(--md-h4-lh)]

  [&_h5]:[font-family:var(--md-h5-family)] [&_h5]:[font-weight:var(--md-h5-weight)]
  [&_h5]:[font-style:var(--md-h5-style)]
  [&_h5]:text-[length:var(--md-h5-size)] [&_h5]:text-[color:var(--md-h5-color)]
  [&_h5]:mt-[var(--md-h5-mt)] [&_h5]:mb-[var(--md-h5-mb)] [&_h5]:leading-[var(--md-h5-lh)]

  [&_h6]:[font-family:var(--md-h6-family)] [&_h6]:[font-weight:var(--md-h6-weight)]
  [&_h6]:[font-style:var(--md-h6-style)]
  [&_h6]:text-[length:var(--md-h6-size)] [&_h6]:text-[color:var(--md-h6-color)]
  [&_h6]:mt-[var(--md-h6-mt)] [&_h6]:mb-[var(--md-h6-mb)] [&_h6]:leading-[var(--md-h6-lh)]

  [&_p]:[font-family:var(--md-p-family)] [&_p]:[font-weight:var(--md-p-weight)]
  [&_p]:[font-style:var(--md-p-style)]
  [&_p]:text-[color:var(--md-p-color)] [&_p]:leading-[var(--md-p-lh)]
  [&_p]:mt-[var(--md-p-mt)] [&_p]:mb-[var(--md-p-mb)]
  [&>p:last-child]:mb-0

  [&_ul]:[font-family:var(--md-list-family)] [&_ul]:[font-weight:var(--md-list-weight)]
  [&_ul]:[font-style:var(--md-list-style)]
  [&_ul]:list-disc [&_ul]:text-[length:var(--md-list-size)] [&_ul]:text-[color:var(--md-list-color)]
  [&_ul]:leading-[var(--md-list-lh)]
  [&_ul]:mt-[var(--md-list-mt)] [&_ul]:mb-[var(--md-list-mb)]
  [&_ul]:pl-[var(--md-bullet-indent)]
  [&_ul_li]:mt-[var(--md-bullet-gap)]
  [&_ul>li:first-child]:mt-0

  [&_ol]:[font-family:var(--md-list-family)] [&_ol]:[font-weight:var(--md-list-weight)]
  [&_ol]:[font-style:var(--md-list-style)]
  [&_ol]:list-decimal [&_ol]:text-[length:var(--md-list-size)] [&_ol]:text-[color:var(--md-list-color)]
  [&_ol]:leading-[var(--md-list-lh)]
  [&_ol]:mt-[var(--md-list-mt)] [&_ol]:mb-[var(--md-list-mb)]
  [&_ol]:pl-[var(--md-numbered-indent)]
  [&_ol_li]:mt-[var(--md-numbered-gap)]
  [&_ol>li:first-child]:mt-0

  [&_a]:text-[color:var(--md-link-color)] [&_a]:underline [&_a]:hover:opacity-80

  [&_code]:[font-family:var(--md-code-family)] [&_code]:[font-weight:var(--md-code-weight)]
  [&_code]:[font-style:var(--md-code-style)]
  [&_code]:leading-[var(--md-code-lh)]
  [&_code]:bg-[color:var(--md-code-bg)] [&_code]:rounded
  [&_code]:px-[0.4em] [&_code]:py-[0.2em]
  [&_code]:text-[length:var(--md-code-size)] [&_code]:text-[color:var(--md-code-color)]

  [&_pre]:[font-family:var(--md-code-family)] [&_pre]:[font-weight:var(--md-code-weight)]
  [&_pre]:[font-style:var(--md-code-style)]
  [&_pre]:leading-[var(--md-code-lh)]
  [&_pre]:bg-[color:var(--md-code-bg)] [&_pre]:rounded
  [&_pre]:px-[var(--md-code-px)] [&_pre]:py-[var(--md-code-py)] [&_pre]:my-[var(--md-code-my)]
  [&_pre]:overflow-x-auto
  [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_pre_code]:rounded-none
  [&_pre_code]:text-[length:var(--md-code-size)] [&_pre_code]:text-[color:var(--md-code-color)]

  [&_blockquote]:[font-family:var(--md-bq-family)] [&_blockquote]:[font-weight:var(--md-bq-weight)]
  [&_blockquote]:[font-style:var(--md-bq-style)]
  [&_blockquote]:leading-[var(--md-bq-lh)]
  [&_blockquote]:text-[length:var(--md-bq-size)] [&_blockquote]:text-[color:var(--md-bq-color)]
  [&_blockquote]:border-l-[length:var(--md-bq-border-width)]
  [&_blockquote]:border-[color:var(--md-bq-border-color)]
  [&_blockquote]:pt-[var(--md-bq-pt)] [&_blockquote]:pb-[var(--md-bq-pb)]
  [&_blockquote]:pl-[var(--md-bq-pl)] [&_blockquote]:pr-[var(--md-bq-pr)]
  [&_blockquote]:my-[var(--md-bq-my)]
  [&_blockquote>*+*]:mt-[var(--md-bq-gap)]

  [&_img]:mt-[var(--md-img-mt)] [&_img]:mb-[var(--md-img-mb)]

  [&_table]:border-collapse
  [&_table]:mt-[var(--md-table-mt)] [&_table]:mb-[var(--md-table-mb)]
  [&_th]:border-[length:var(--md-table-border-width)]
  [&_th]:border-[color:var(--md-table-border-color)]
  [&_th]:px-[var(--md-table-cell-px)] [&_th]:py-[var(--md-table-cell-py)]
  [&_th]:bg-[color:var(--md-table-header-bg)]
  [&_th]:font-700 [&_th]:text-left
  [&_td]:border-[length:var(--md-table-border-width)]
  [&_td]:border-[color:var(--md-table-border-color)]
  [&_td]:px-[var(--md-table-cell-px)] [&_td]:py-[var(--md-table-cell-py)]
  [&_td]:bg-base-100

  [&_hr]:my-[var(--md-hr-my)] [&_hr]:border-t [&_hr]:border-[color:var(--md-hr-color)]

  [&_strong]:font-700 [&_em]:italic

  [&_.katex-html]:[text-align:var(--md-math-align)]
`
  .replace(/\s+/g, " ")
  .trim();

function opacityToHex(opacity: number): string {
  if (opacity >= 1) return "";
  const alpha = Math.round(opacity * 255).toString(16).padStart(2, "0");
  return alpha;
}

// Generate CSS variable values from style config
// Uses CustomMarkdownStyle to handle all merging logic
export function deriveMarkdownCssVars(
  style?: CustomMarkdownStyleOptions,
): JSX.CSSProperties {
  const styleInstance = new CustomMarkdownStyle(style);
  const merged = styleInstance.getMergedMarkdownStyle();
  const em = styleInstance.getEmValues();

  const vars: Record<string, string> = {
    "--md-p-family": merged.text.paragraph.font.fontFamily,
    "--md-p-weight": `${merged.text.paragraph.font.weight}`,
    "--md-p-style": merged.text.paragraph.font.italic ? "italic" : "normal",
    "--md-p-lh": `${merged.text.paragraph.lineHeight}`,
    "--md-p-color": merged.text.paragraph.color,
    "--md-p-mt": `${em.margins.paragraph.top}em`,
    "--md-p-mb": `${em.margins.paragraph.bottom}em`,

    "--md-h1-family": merged.text.h1.font.fontFamily,
    "--md-h1-weight": `${merged.text.h1.font.weight}`,
    "--md-h1-style": merged.text.h1.font.italic ? "italic" : "normal",
    "--md-h1-size": `${
      merged.text.h1.fontSize / merged.text.paragraph.fontSize
    }em`,
    "--md-h1-lh": `${merged.text.h1.lineHeight}`,
    "--md-h1-color": merged.text.h1.color,
    "--md-h1-mt": `${em.margins.h1.top}em`,
    "--md-h1-mb": `${em.margins.h1.bottom}em`,

    "--md-h2-family": merged.text.h2.font.fontFamily,
    "--md-h2-weight": `${merged.text.h2.font.weight}`,
    "--md-h2-style": merged.text.h2.font.italic ? "italic" : "normal",
    "--md-h2-size": `${
      merged.text.h2.fontSize / merged.text.paragraph.fontSize
    }em`,
    "--md-h2-lh": `${merged.text.h2.lineHeight}`,
    "--md-h2-color": merged.text.h2.color,
    "--md-h2-mt": `${em.margins.h2.top}em`,
    "--md-h2-mb": `${em.margins.h2.bottom}em`,

    "--md-h3-family": merged.text.h3.font.fontFamily,
    "--md-h3-weight": `${merged.text.h3.font.weight}`,
    "--md-h3-style": merged.text.h3.font.italic ? "italic" : "normal",
    "--md-h3-size": `${
      merged.text.h3.fontSize / merged.text.paragraph.fontSize
    }em`,
    "--md-h3-lh": `${merged.text.h3.lineHeight}`,
    "--md-h3-color": merged.text.h3.color,
    "--md-h3-mt": `${em.margins.h3.top}em`,
    "--md-h3-mb": `${em.margins.h3.bottom}em`,

    "--md-h4-family": merged.text.h4.font.fontFamily,
    "--md-h4-weight": `${merged.text.h4.font.weight}`,
    "--md-h4-style": merged.text.h4.font.italic ? "italic" : "normal",
    "--md-h4-size": `${
      merged.text.h4.fontSize / merged.text.paragraph.fontSize
    }em`,
    "--md-h4-lh": `${merged.text.h4.lineHeight}`,
    "--md-h4-color": merged.text.h4.color,
    "--md-h4-mt": `${em.margins.h4.top}em`,
    "--md-h4-mb": `${em.margins.h4.bottom}em`,

    "--md-h5-family": merged.text.h5.font.fontFamily,
    "--md-h5-weight": `${merged.text.h5.font.weight}`,
    "--md-h5-style": merged.text.h5.font.italic ? "italic" : "normal",
    "--md-h5-size": `${
      merged.text.h5.fontSize / merged.text.paragraph.fontSize
    }em`,
    "--md-h5-lh": `${merged.text.h5.lineHeight}`,
    "--md-h5-color": merged.text.h5.color,
    "--md-h5-mt": `${em.margins.h5.top}em`,
    "--md-h5-mb": `${em.margins.h5.bottom}em`,

    "--md-h6-family": merged.text.h6.font.fontFamily,
    "--md-h6-weight": `${merged.text.h6.font.weight}`,
    "--md-h6-style": merged.text.h6.font.italic ? "italic" : "normal",
    "--md-h6-size": `${
      merged.text.h6.fontSize / merged.text.paragraph.fontSize
    }em`,
    "--md-h6-lh": `${merged.text.h6.lineHeight}`,
    "--md-h6-color": merged.text.h6.color,
    "--md-h6-mt": `${em.margins.h6.top}em`,
    "--md-h6-mb": `${em.margins.h6.bottom}em`,
    "--md-list-family": merged.text.list.font.fontFamily,
    "--md-list-weight": `${merged.text.list.font.weight}`,
    "--md-list-style": merged.text.list.font.italic ? "italic" : "normal",
    "--md-list-lh": `${merged.text.list.lineHeight}`,
    "--md-list-color": merged.text.list.color,
    "--md-list-size": `${
      merged.text.list.fontSize / merged.text.paragraph.fontSize
    }em`,
    "--md-list-mt": `${em.margins.list.top}em`,
    "--md-list-mb": `${em.margins.list.bottom}em`,
    "--md-bullet-indent": `${em.list.bullet.indent}em`,
    "--md-bullet-gap": `${em.margins.list.gap}em`,
    "--md-numbered-indent": `${em.list.numbered.indent}em`,
    "--md-numbered-gap": `${em.margins.list.gap}em`,

    "--md-bq-family": merged.text.blockquote.font.fontFamily,
    "--md-bq-weight": `${merged.text.blockquote.font.weight}`,
    "--md-bq-style": merged.text.blockquote.font.italic ? "italic" : "normal",
    "--md-bq-lh": `${merged.text.blockquote.lineHeight}`,
    "--md-bq-color": merged.text.blockquote.color,
    "--md-bq-size": `${
      merged.text.blockquote.fontSize / merged.text.paragraph.fontSize
    }em`,
    "--md-bq-border-width": `${merged.blockquote.leftBorderWidth}px`,
    "--md-bq-border-color": getColor(merged.blockquote.leftBorderColor),
    "--md-bq-pt": `${em.blockquote.paddingTop}em`,
    "--md-bq-pb": `${em.blockquote.paddingBottom}em`,
    "--md-bq-pl": `${em.blockquote.paddingLeft}em`,
    "--md-bq-pr": `${em.blockquote.paddingRight}em`,
    "--md-bq-gap": `${em.blockquote.paragraphGap}em`,
    "--md-bq-my": `${em.margins.blockquote.top}em`,

    "--md-code-family": merged.text.code.font.fontFamily,
    "--md-code-weight": `${merged.text.code.font.weight}`,
    "--md-code-style": merged.text.code.font.italic ? "italic" : "normal",
    "--md-code-lh": `${merged.text.code.lineHeight}`,
    "--md-code-color": merged.text.code.color,
    "--md-code-size": `${
      merged.text.code.fontSize / merged.text.paragraph.fontSize
    }em`,
    "--md-code-my": `${em.code.my}em`,
    "--md-code-px": `${em.code.paddingH}em`,
    "--md-code-py": `${em.code.paddingV}em`,
    "--md-code-bg": merged.code.backgroundColor,

    "--md-hr-my": `${em.hr.my}em`,
    "--md-hr-color": getColor(merged.horizontalRule.strokeColor),

    "--md-link-color": getColor(merged.link.color),

    "--md-img-mt": `${em.margins.image.top}em`,
    "--md-img-mb": `${em.margins.image.bottom}em`,

    "--md-table-mt": `${em.margins.table.top}em`,
    "--md-table-mb": `${em.margins.table.bottom}em`,
    "--md-table-border-width": `${merged.table.borderWidth}px`,
    "--md-table-border-color": merged.table.borderColor,
    "--md-table-cell-px": `${em.table.cellPaddingH}em`,
    "--md-table-cell-py": `${em.table.cellPaddingV}em`,
    "--md-table-header-bg": merged.table.headerShadingColor +
      opacityToHex(merged.table.headerShadingOpacity),

    "--md-math-align": merged.math.displayAlign,
  };

  return vars as JSX.CSSProperties;
}
