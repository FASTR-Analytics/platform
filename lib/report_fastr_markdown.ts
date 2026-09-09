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
  fastrDocumentOutline,
  type FastrContainerAttrs,
  type FastrTocItem,
  fastrMarkClass,
  type FastrMarkAttrs,
  fastrMarkStyle,
  figureWidthClass,
  isFastrLeafBlock,
  parseContainerAttrs,
  parseContainerFence,
  parseFastrMarkAttrs,
  readFastrDocumentSettings,
  fastrTocOptions,
  fastrTocSlug,
  renderFastrTocHtml,
} from "./fastr_markdown_blocks.ts";
import { escapeReportHtml } from "./types/reports.ts";

type ContainerMeta = {
  name: string;
  attrs: FastrContainerAttrs;
  // Set by the fm_toc core rule on a `:::contents` token: the document's
  // outline, already trimmed to the depth that block asked for.
  toc?: FastrTocItem[];
};
type MarkMeta = FastrMarkAttrs;

// The `{…}` that must follow the closing bracket, with nothing between;
// parseFastrMarkAttrs decides whether its contents make it a mark.
const MARK_ATTR_RE = /^\{([^}]*)\}/;

const EMBED_SRC_RE = /^(figure|image):/;
const ATTR_BLOCK_RE = /^\s*\{[^}]*\}\s*$/;

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

  // ── `[text]{.danger}` / `[text]{size=12}` → a styled span ──────────────────
  // Registered BEFORE `link` so we get first refusal on `[`. Everything that
  // is not `]` immediately followed by a `{…}` parseFastrMarkAttrs accepts
  // returns false and falls straight through to the real link rule, so
  // ordinary links, reference links and `![cap](figure:id){width=wide}` are
  // untouched — and an unknown role or malformed size renders as the author's
  // literal text rather than being swallowed.
  md.inline.ruler.before("link", "fm_mark", (state, silent) => {
    if (state.src.charCodeAt(state.pos) !== 0x5B /* [ */) return false;
    const labelStart = state.pos + 1;
    // markdown-it's own helper, so nested brackets behave exactly as in a link.
    const labelEnd = state.md.helpers.parseLinkLabel(state, state.pos, false);
    if (labelEnd < 0) return false;
    const m = MARK_ATTR_RE.exec(state.src.slice(labelEnd + 1));
    const attrs = m ? parseFastrMarkAttrs(m[1]) : undefined;
    if (!m || !attrs) return false;
    if (silent) return true;

    const oldPos = state.pos;
    const oldMax = state.posMax;
    state.pos = labelStart;
    state.posMax = labelEnd;
    state.push("fm_mark_open", "span", 1).meta = attrs;
    // Tokenize the label so `[**bold** phrase]{.danger}` keeps its emphasis.
    state.md.inline.tokenize(state);
    state.push("fm_mark_close", "span", -1);
    state.pos = labelEnd + 1 + m[0].length;
    state.posMax = oldMax;
    if (state.pos > oldMax) {
      state.pos = oldPos;
      state.posMax = oldMax;
      return false;
    }
    return true;
  });

  md.renderer.rules.fm_mark_open = (tokens, idx) => {
    const attrs = tokens[idx].meta as MarkMeta;
    const style = fastrMarkStyle(attrs);
    return `<span class="${fastrMarkClass(attrs)}"${
      style === "" ? "" : ` style="${escapeReportHtml(style)}"`
    }>`;
  };
  md.renderer.rules.fm_mark_close = () => "</span>";

  md.renderer.rules.fm_container_open = (tokens, idx) => {
    const token = tokens[idx];
    const meta = token.meta as ContainerMeta;
    const h = containerHtmlFor(meta.name, meta.attrs);
    if (h.silent) return "";
    const line = token.attrGet("data-line");
    const anchor = line === null ? "" : ` data-line="${escapeReportHtml(line)}"`;
    const style = h.style === ""
      ? ""
      : ` style="${escapeReportHtml(h.style)}"`;
    // A table of contents is the one block whose CONTENT is the document
    // rather than the author's lines: the fm_toc rule left the outline on the
    // token, and the same builder the editor's widget uses turns it into the
    // list (leaf block — the close rule emits the tag and nothing else).
    const inner = meta.name === "contents"
      ? renderFastrTocHtml(meta.toc ?? [], fastrTocOptions(meta.attrs))
      : h.leadingHtml;
    return `<${h.tag} class="${h.className}"${style}${h.extraAttrs}${anchor}>\n${inner}`;
  };

  md.renderer.rules.fm_container_close = (tokens, idx) => {
    const meta = tokens[idx].meta as ContainerMeta;
    const h = containerHtmlFor(meta.name, meta.attrs);
    if (h.silent) return "";
    return `${h.trailingHtml}</${h.tag}>\n`;
  };

  // ── Blank lines as vertical space ──────────────────────────────────────────
  // One blank line separates blocks, as in any markdown. Each blank line
  // beyond that is a line of empty space in the document, as Enter is in a
  // word processor. The editor's page flow depends on it: a blank line takes
  // height there, so it must take the same height in print or the two
  // disagree about where a page ends, and a block pushed onto the next page
  // by Enter snaps back when the paginator answers (Nick, 2026-09-09). One
  // element per blank line, so a run breaks across pages like lines of text.
  // Blank lines before the first rendered block stay nothing, as the editor
  // collapses them; blank lines at the end of the document count, as the
  // editor shows them.
  md.core.ruler.after("block", "fm_spaces", (state) => {
    const tokens = state.tokens;
    // One past the last source line consumed so far, undefined until a
    // block has rendered. A container's children start after its fence:
    // the line to return to when it closes is kept per nesting level.
    let end: number | undefined;
    const outer = new Map<number, number>();
    const lines = state.src.split("\n");
    // A list's (or a quote's) map runs on past its last line over the blank
    // lines that follow it, up to the next block: only the lines it actually
    // holds count as consumed.
    const consumedTo = (map: [number, number]) => {
      let e = map[1];
      while (e > map[0] + 1 && (lines[e - 1] ?? "").trim().length === 0) e--;
      return e;
    };
    const spaceAt = (line: number, level: number) => {
      const t = new state.Token("fm_space", "div", 0);
      t.block = true;
      t.map = [line, line + 1];
      t.level = level;
      return t;
    };
    for (let i = 0; i < tokens.length; i++) {
      const tok = tokens[i];
      const map = tok.map;
      if (map !== null && tok.block) {
        const silent = tok.type === "fm_container_open" &&
          containerHtmlFor((tok.meta as ContainerMeta).name, (tok.meta as ContainerMeta).attrs).silent;
        if (!silent) {
          if (end !== undefined) {
            for (let k = end + 1; k < map[0]; k++) {
              tokens.splice(i, 0, spaceAt(k, tok.level));
              i++;
            }
          }
          if (tok.nesting === 1) {
            outer.set(tok.level, consumedTo(map));
            end = map[0] + 1;
          } else {
            end = end === undefined ? consumedTo(map) : Math.max(end, consumedTo(map));
          }
        }
      }
      if (tok.nesting === -1) {
        const back = outer.get(tok.level);
        if (back !== undefined) {
          outer.delete(tok.level);
          end = back;
        }
      }
    }
    if (end !== undefined) {
      for (let k = end + 1; k < lines.length; k++) tokens.push(spaceAt(k, 0));
    }
    return true;
  });
  md.renderer.rules.fm_space = (tokens, idx) => {
    const line = tokens[idx].attrGet("data-line");
    const anchor = line === null ? "" : ` data-line="${escapeReportHtml(line)}"`;
    return `<div class="fm-space"${anchor}></div>\n`;
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
      // Either the image alone, or the image followed by an `{…}` attribute
      // block — markdown-it has no attribute syntax, so the trailing text is
      // claimed here and removed rather than rendered.
      const attrText = kids.length === 2 && kids[1].type === "text"
        ? ATTR_BLOCK_RE.exec(kids[1].content)?.[0]
        : undefined;
      if (kids.length !== 1 && attrText === undefined) continue;
      if (kids[0].type !== "image") continue;
      if (!EMBED_SRC_RE.test(kids[0].attrGet("src") ?? "")) continue;

      toks[i].tag = "figure";
      toks[i].attrJoin("class", "fm-figure");
      if (attrText !== undefined) {
        kids[1].content = "";
        inline.children = [kids[0]];
        const widthClass = figureWidthClass(parseContainerAttrs(attrText));
        if (widthClass !== "") toks[i].attrJoin("class", widthClass.trim());
      }
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

  // ── Table of contents ──────────────────────────────────────────────────────
  // The outline comes from the SOURCE (fastrDocumentOutline, shared with the
  // editor so a heading's anchor is the same in both), and the heading tokens
  // are given the ids it links to. Only when the document actually contains a
  // `:::contents` block, so an ordinary report's html is unchanged.
  md.core.ruler.after("inline", "fm_toc", (state) => {
    const contents = state.tokens.filter(
      (t) => t.type === "fm_container_open" &&
        (t.meta as ContainerMeta | undefined)?.name === "contents",
    );
    if (contents.length === 0) return true;
    const src = state.src ?? "";
    // Deepest depth any block asked for: one id pass serves them all.
    const outline = fastrDocumentOutline(src, 6);
    for (const token of contents) {
      const meta = token.meta as ContainerMeta & { toc?: typeof outline };
      const { depth } = fastrTocOptions(meta.attrs);
      meta.toc = outline.filter((it) => it.level <= depth);
    }
    // Ids, in document order — the same slug function, so they match.
    const seen = new Map<string, number>();
    let coverDepth = 0;
    let inCover = false;
    for (const token of state.tokens) {
      if (token.type === "fm_container_open") {
        const name = (token.meta as ContainerMeta | undefined)?.name;
        if (name === "contents" || name === "report") continue;
        coverDepth++;
        if (name === "cover" && !inCover) inCover = true;
        continue;
      }
      if (token.type === "fm_container_close") {
        const name = (token.meta as ContainerMeta | undefined)?.name;
        if (name === "contents" || name === "report") continue;
        coverDepth = Math.max(0, coverDepth - 1);
        if (coverDepth === 0) inCover = false;
        continue;
      }
      if (token.type !== "heading_open" || inCover) continue;
      const inline = state.tokens[state.tokens.indexOf(token) + 1];
      const text = inline?.type === "inline" ? inline.content : "";
      token.attrSet("id", fastrTocSlug(text, seen));
    }
    return true;
  });

  // ── Top-level headings ─────────────────────────────────────────────────────
  // A heading outside every block is a document SECTION (the format's own
  // rule) and carries `fm-top` so a stylesheet can address it without the
  // structural `body > h2`, which no longer holds once a paginator has moved
  // the flow into page boxes.
  md.core.ruler.push("fm_top_headings", (state) => {
    // `numbering=sections`: the numbered ones also carry fm-numbered, which
    // is what the paged stylesheet counts (its selectors must match the
    // source alone, without the document root's class).
    const numbered = readFastrDocumentSettings(state.src ?? "").className
      .includes("fm-doc--numbered");
    let depth = 0;
    for (const token of state.tokens) {
      if (token.type === "fm_container_open") {
        const name = (token.meta as ContainerMeta | undefined)?.name ?? "";
        if (!isFastrLeafBlock(name)) depth++;
        continue;
      }
      if (token.type === "fm_container_close") {
        const name = (token.meta as ContainerMeta | undefined)?.name ?? "";
        if (!isFastrLeafBlock(name)) depth = Math.max(0, depth - 1);
        continue;
      }
      if (token.type === "heading_open" && depth === 0) {
        token.attrJoin("class", "fm-top");
        if (numbered && (token.tag === "h2" || token.tag === "h3")) {
          token.attrJoin("class", "fm-numbered");
        }
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
