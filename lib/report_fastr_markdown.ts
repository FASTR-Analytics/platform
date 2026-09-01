// =============================================================================
// FASTR Markdown → HTML. Ordinary CommonMark (markdown-it, configured exactly
// like panther's parser so plain prose reads identically to a markdown report)
// plus the `:::` container blocks defined in fastr_markdown_blocks.ts.
//
// Output is UNSANITIZED: the client hands it to DOMPurify with
// REPORT_PURIFY_CONFIG on the way into the preview / export, exactly as the html
// format does. Keeping this module DOM-free is what lets the Deno tests render
// fixture bodies end to end.
//
// Two conveniences the html format cannot offer, both of which exist because we
// own the renderer:
//   • `data-line` anchors come from markdown-it's own token.map, so scroll sync
//     points at MARKDOWN source lines (no lezer anchor injection pass).
//   • an embed alone on a line becomes a <figure> with its caption rendered as
//     a <figcaption> — the caption is the alt text, so authors get captions for
//     free instead of hand-writing them.
// =============================================================================

import MarkdownIt from "markdown-it";
import {
  containerHtmlFor,
  type FastrContainerAttrs,
  isFastrLeafBlock,
  parseContainerFence,
} from "./fastr_markdown_blocks.ts";
import { escapeReportHtml } from "./types/reports.ts";

type ContainerMeta = { name: string; attrs: FastrContainerAttrs };

const EMBED_SRC_RE = /^(figure|image):/;

export function createFastrMarkdownIt(): MarkdownIt {
  const md = new MarkdownIt({
    breaks: true,
    html: true,
    linkify: false,
    typographer: true,
  });
  // Same as panther: typographer is wanted for quotes/dashes, but the
  // (c)/(tm)/±-style substitutions mangle report text.
  md.disable("replacements", true);

  // ── `:::` containers ───────────────────────────────────────────────────────
  // `alt` lets a fence interrupt a paragraph or list, which is how people
  // actually type these.
  md.block.ruler.before(
    "fence",
    "fm_container",
    (state, startLine, endLine, silent) => {
      if (state.sCount[startLine] - state.blkIndent >= 4) return false;
      const start = state.bMarks[startLine] + state.tShift[startLine];
      const fence = parseContainerFence(
        state.src.slice(start, state.eMarks[startLine]),
      );
      if (!fence || fence.kind !== "open") return false;
      if (silent) return true;

      const leaf = isFastrLeafBlock(fence.name);
      // Depth counting on the fences themselves, so the natural
      // `:::tiles` / `:::card` / `:::` / `:::` shape nests without needing
      // longer markers on the outer block.
      let closeLine = endLine;
      if (!leaf) {
        let depth = 1;
        for (let line = startLine + 1; line < endLine; line++) {
          if (state.sCount[line] - state.blkIndent >= 4) continue;
          const s = state.bMarks[line] + state.tShift[line];
          const f = parseContainerFence(state.src.slice(s, state.eMarks[line]));
          if (!f) continue;
          if (f.kind === "open") {
            if (!isFastrLeafBlock(f.name)) depth++;
            continue;
          }
          depth--;
          if (depth === 0) {
            closeLine = line;
            break;
          }
        }
      }
      // An unclosed container runs to the end of the document rather than
      // swallowing the block silently; validateFastrContainers reports it.
      const contentEnd = leaf ? startLine + 1 : closeLine;
      const meta: ContainerMeta = { name: fence.name, attrs: fence.attrs };
      const tag = containerHtmlFor(fence.name, fence.attrs).tag;

      const open = state.push("fm_container_open", tag, 1);
      open.markup = ":".repeat(fence.markerLength);
      open.block = true;
      open.map = [startLine, Math.min(closeLine + 1, endLine)];
      open.meta = meta;

      if (!leaf) {
        const oldLineMax = state.lineMax;
        state.lineMax = contentEnd;
        state.md.block.tokenize(state, startLine + 1, contentEnd);
        state.lineMax = oldLineMax;
      }

      const close = state.push("fm_container_close", tag, -1);
      close.block = true;
      close.meta = meta;

      state.line = leaf
        ? startLine + 1
        : closeLine < endLine
        ? closeLine + 1
        : endLine;
      return true;
    },
    { alt: ["paragraph", "reference", "blockquote", "list"] },
  );

  md.renderer.rules.fm_container_open = (tokens, idx) => {
    const token = tokens[idx];
    const meta = token.meta as ContainerMeta;
    const h = containerHtmlFor(meta.name, meta.attrs);
    const line = token.attrGet("data-line");
    const anchor = line === null ? "" : ` data-line="${escapeReportHtml(line)}"`;
    return `<${h.tag} class="${h.className}"${anchor}>\n${h.leadingHtml}`;
  };

  md.renderer.rules.fm_container_close = (tokens, idx) => {
    const meta = tokens[idx].meta as ContainerMeta;
    const h = containerHtmlFor(meta.name, meta.attrs);
    return `${h.trailingHtml}</${h.tag}>\n`;
  };

  // ── Embed lines → <figure> + <figcaption> ──────────────────────────────────
  md.core.ruler.after("inline", "fm_figures", (state) => {
    const toks = state.tokens;
    for (let i = 0; i + 2 < toks.length; i++) {
      if (toks[i].type !== "paragraph_open") continue;
      const inline = toks[i + 1];
      if (inline.type !== "inline" || toks[i + 2].type !== "paragraph_close") {
        continue;
      }
      const kids = (inline.children ?? []).filter(
        (k) =>
          k.type !== "softbreak" &&
          !(k.type === "text" && k.content.trim().length === 0),
      );
      if (kids.length !== 1 || kids[0].type !== "image") continue;
      if (!EMBED_SRC_RE.test(kids[0].attrGet("src") ?? "")) continue;

      toks[i].tag = "figure";
      toks[i].attrJoin("class", "fm-figure");
      toks[i + 2].tag = "figure";

      const caption = state.md.renderer
        .renderInlineAsText(kids[0].children ?? [], state.md.options, state.env)
        .trim();
      if (caption.length > 0) {
        const cap = new state.Token("html_block", "", 0);
        cap.block = true;
        cap.content = `<figcaption class="fm-figure__caption">${
          escapeReportHtml(caption)
        }</figcaption>\n`;
        toks.splice(i + 2, 0, cap);
        i++;
      }
    }
    return true;
  });

  // ── Line anchors (preview only; env-driven so one instance serves both) ────
  md.core.ruler.push("fm_line_anchors", (state) => {
    if (state.env?.lineAnchors !== true) return true;
    for (const token of state.tokens) {
      if (token.block && token.nesting >= 0 && token.map) {
        token.attrSet("data-line", String(token.map[0]));
      }
    }
    return true;
  });

  return md;
}

let cachedMd: MarkdownIt | undefined;

// Unsanitized HTML — every caller must run it through sanitizeReportHtml.
export function renderFastrMarkdownToHtml(
  body: string,
  opts: { lineAnchors: boolean },
): string {
  cachedMd ??= createFastrMarkdownIt();
  return cachedMd.render(body, { lineAnchors: opts.lineAnchors });
}
