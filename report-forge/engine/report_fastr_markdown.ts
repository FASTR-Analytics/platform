// ⚠️  SYNCED FROM report-forge (github.com/NicholasWillmott/report-forge)
// ⚠️  DO NOT EDIT HERE - changes are overwritten on the next sync.
//     Edit the report-forge repo, then run its ./sync.

// =============================================================================
// FASTR Markdown → HTML. Ordinary CommonMark (markdown-it, so plain prose
// reads as it does in any CommonMark renderer) plus the `:::` container blocks defined in fastr_markdown_blocks.ts.
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
  FASTR_TOC_DEFAULT_DEPTH,
  type FastrContainerAttrs,
  type FastrLiteralBackground,
  fastrLogoImageIds,
  type FastrMarkAttrs,
  fastrMarkClass,
  fastrMarkStyle,
  fastrPlainInlineText,
  type FastrTocItem,
  fastrTocOptions,
  fastrTocSlug,
  fastrToneOf,
  figureWidthClass,
  isFastrLeafBlock,
  parseContainerAttrs,
  parseContainerFence,
  parseFastrMarkAttrs,
  readFastrDocumentSettings,
  renderFastrTocHtml,
  stepCodeFence,
} from "./fastr_markdown_blocks.ts";
import { escapeReportHtml } from "./embeds.ts";
import { FASTR_ALIGN_SUFFIX_RE } from "./fastr_paragraph_align.ts";
import { fastrPageTemplate } from "./fastr_page_templates.ts";

type ContainerMeta = {
  name: string;
  attrs: FastrContainerAttrs;
  // `:::columns` only: some direct child column is coloured, so the row is a
  // set of panels and every column takes the panel inset (fm-columns--panels).
  panels?: boolean;
  // Set by the fm_toc core rule on a `:::contents` token: the document's
  // outline, already trimmed to the depth that block asked for.
  toc?: FastrTocItem[];
  // `:::slot` only: nothing is in it (the editor's Add photo box).
  empty?: boolean;
};
type MarkMeta = FastrMarkAttrs;
export type FastrMarkdownToken = ReturnType<MarkdownIt["parse"]>[number];
type Token = FastrMarkdownToken;

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
  // The typographer is wanted for quotes/dashes, but the (c)/(tm)/±-style
  // substitutions mangle report text.
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
      // longer markers on the outer block. A `:::` inside fenced code is the
      // code's text, as scanContainerLines reads it for the editor and the
      // validator.
      let closeLine = endLine;
      if (!leaf) {
        let depth = 1;
        let code: string | undefined;
        for (let line = startLine + 1; line < endLine; line++) {
          if (state.sCount[line] - state.blkIndent >= 4) continue;
          const s = state.bMarks[line] + state.tShift[line];
          const text = state.src.slice(s, state.eMarks[line]);
          const step = stepCodeFence(text.trim(), code);
          code = step.open;
          if (step.inCode) continue;
          const f = parseContainerFence(text);
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
      if (fence.name === "columns" && !leaf) {
        // Its DIRECT child columns, by depth, asked what the renderer would
        // make of them (so a tone and a literal bg count alike).
        let depth = 0;
        let code: string | undefined;
        for (let line = startLine + 1; line < contentEnd; line++) {
          const s = state.bMarks[line] + state.tShift[line];
          const text = state.src.slice(s, state.eMarks[line]);
          const step = stepCodeFence(text.trim(), code);
          code = step.open;
          if (step.inCode) continue;
          const f = parseContainerFence(text);
          if (!f) continue;
          if (f.kind === "close") {
            depth--;
            continue;
          }
          if (depth === 0 && f.name === "col") {
            const cls = containerHtmlFor("col", f.attrs).className;
            if (/\bfm-(tone|has-bg)\b/.test(cls)) meta.panels = true;
          }
          if (!isFastrLeafBlock(f.name)) depth++;
        }
      }
      const tag = containerHtmlFor(fence.name, fence.attrs).tag;

      const openIndex = state.tokens.length;
      const open = state.push("fm_container_open", tag, 1);
      open.markup = ":".repeat(fence.markerLength);
      open.block = true;
      // A leaf is its own line: closeLine is the document's end for one, and
      // a map that long swallowed the blank lines after it (fm_spaces).
      open.map = [
        startLine,
        leaf ? startLine + 1 : Math.min(closeLine + 1, endLine),
      ];
      open.meta = meta;

      if (!leaf) {
        const oldLineMax = state.lineMax;
        state.lineMax = contentEnd;
        state.md.block.tokenize(state, startLine + 1, contentEnd);
        state.lineMax = oldLineMax;
        if (fence.name === "page") {
          gatherPageMain(state.tokens, openIndex, state.Token);
          applySlotDefaults(state.tokens, openIndex, fence.attrs);
        }
        if (
          fence.name === "slot" &&
          state.tokens.slice(openIndex + 1).every((t) => t.type === "fm_space")
        ) {
          meta.empty = true;
        }
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
    // A silent pass is markdown-it looking for the `]` of a label AROUND
    // this mark (a link's text, a caption, another mark). Declining leaves
    // it to count this mark's brackets as plain nested ones, which is right
    // for all three. Answering true without moving the position made it
    // throw, which failed the whole document on any nested mark; answering
    // true past the mark would read as a link inside a link and unmake the
    // outer one.
    if (silent) return false;
    const labelStart = state.pos + 1;
    // markdown-it's own helper, so nested brackets behave exactly as in a link.
    const labelEnd = state.md.helpers.parseLinkLabel(state, state.pos, false);
    if (labelEnd < 0) return false;
    const m = MARK_ATTR_RE.exec(state.src.slice(labelEnd + 1));
    const attrs = m ? parseFastrMarkAttrs(m[1]) : undefined;
    if (!m || !attrs) return false;
    const end = labelEnd + 1 + m[0].length;
    const oldMax = state.posMax;
    if (end > oldMax) return false;

    state.pos = labelStart;
    state.posMax = labelEnd;
    state.push("fm_mark_open", "span", 1).meta = attrs;
    // Tokenize the label so `[**bold** phrase]{.danger}` keeps its emphasis.
    state.md.inline.tokenize(state);
    state.push("fm_mark_close", "span", -1);
    state.pos = end;
    state.posMax = oldMax;
    return true;
  });

  // ── Marks broken across blocks ─────────────────────────────────────────────
  // A mark is line-local: its `[` and `]{…}` stand in one block. A line break
  // typed inside a formatted phrase used to leave the `[` at the end of one
  // paragraph and the `]{size=13}` in the next, and such bodies exist. The
  // editor hides both markers and styles neither half, so every export must
  // print neither: the pair is taken out of the text here, once, for the
  // preview, the PDF and the Word file alike. Only a pair in two DIFFERENT
  // blocks goes (in one block the mark rule above already took it, or the
  // text is the author's own brackets), only the nearest `[` with no `]`
  // between counts, and code is never touched (it holds no text token). Run
  // straight after `inline`, while an escaped `\[` is still a text_special
  // token and so cannot be mistaken for a marker.
  md.core.ruler.after("inline", "fm_broken_marks", (state) => {
    type Hit = { token: Token; at: number; length: number };
    let open: { token: Token; at: number; block: Token } | undefined;
    const hits: Hit[] = [];
    for (const block of state.tokens) {
      if (block.type !== "inline") continue;
      for (const token of block.children ?? []) {
        if (token.type !== "text") continue;
        const text = token.content;
        for (let i = 0; i < text.length; i++) {
          if (text[i] === "[") {
            open = { token, at: i, block };
            continue;
          }
          if (text[i] !== "]") continue;
          const pair = open;
          open = undefined;
          if (pair === undefined || pair.block === block) continue;
          const m = MARK_ATTR_RE.exec(text.slice(i + 1));
          if (!m || !parseFastrMarkAttrs(m[1])) continue;
          hits.push({ token: pair.token, at: pair.at, length: 1 });
          hits.push({ token, at: i, length: 1 + m[0].length });
          i += m[0].length;
        }
      }
    }
    // Last first, so an earlier offset in the same token stays true.
    for (const hit of hits.reverse()) {
      const text = hit.token.content;
      hit.token.content = text.slice(0, hit.at) +
        text.slice(hit.at + hit.length);
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
    const anchor = line === null
      ? ""
      : ` data-line="${escapeReportHtml(line)}"`;
    const style = h.style === "" ? "" : ` style="${escapeReportHtml(h.style)}"`;
    // A table of contents is the one block whose CONTENT is the document
    // rather than the author's lines: the fm_toc rule left the outline on the
    // token, and the same builder the editor's widget uses turns it into the
    // list (leaf block — the close rule emits the tag and nothing else).
    const inner = meta.name === "contents"
      ? renderFastrTocHtml(meta.toc ?? [], fastrTocOptions(meta.attrs))
      : h.leadingHtml;
    const className = meta.panels
      ? `${h.className} fm-columns--panels`
      : meta.empty
      ? `${h.className} fm-tpl-slot--empty`
      : h.className;
    return `<${h.tag} class="${className}"${style}${h.extraAttrs}${anchor}>\n${inner}`;
  };

  md.renderer.rules.fm_tpl_main_open = () => `<div class="fm-tpl-main">\n`;
  md.renderer.rules.fm_tpl_main_close = () => "</div>\n";

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
  // collapses them. Blank lines at the end of the document are nothing too:
  // no content follows them, and on a nearly full page they opened an empty
  // last page (the editor's layout keeps them on the last block's page).
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
          containerHtmlFor(
            (tok.meta as ContainerMeta).name,
            (tok.meta as ContainerMeta).attrs,
          ).silent;
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
            end = end === undefined
              ? consumedTo(map)
              : Math.max(end, consumedTo(map));
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
    return true;
  });
  md.renderer.rules.fm_space = (tokens, idx) => {
    const line = tokens[idx].attrGet("data-line");
    const anchor = line === null
      ? ""
      : ` data-line="${escapeReportHtml(line)}"`;
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

  // ── Paragraph alignment ────────────────────────────────────────────────────
  // `{align=…}` ending a paragraph's last line, or a heading's line
  // (fastr_paragraph_align.ts), is claimed here and removed, and the
  // paragraph or heading takes `fm-align-<x>`. Read off the last text token,
  // so a suffix anywhere else stays literal. A suffix on its own line leaves
  // its line break behind, which goes too.
  md.core.ruler.push("fm_align", (state) => {
    const toks = state.tokens;
    for (let i = 0; i + 2 < toks.length; i++) {
      const open = toks[i];
      const paragraph = open.type === "paragraph_open" && open.tag === "p";
      if (!paragraph && open.type !== "heading_open") continue;
      const inline = toks[i + 1];
      const close = paragraph ? "paragraph_close" : "heading_close";
      if (inline.type !== "inline" || toks[i + 2].type !== close) continue;
      const kids = inline.children ?? [];
      const last = kids[kids.length - 1];
      if (last === undefined || last.type !== "text") continue;
      const m = FASTR_ALIGN_SUFFIX_RE.exec(last.content);
      if (m === null) continue;
      last.content = last.content.slice(0, m.index);
      if (last.content.trim().length === 0) {
        kids.pop();
        const br = kids[kids.length - 1];
        if (br?.type === "softbreak" || br?.type === "hardbreak") kids.pop();
      }
      open.attrJoin("class", `fm-align-${m[1]}`);
    }
    return true;
  });

  // ── Table of contents ──────────────────────────────────────────────────────
  // The outline and the heading ids come from the same walk over these
  // tokens (outlineOfTokens), so every entry links to the heading the
  // document actually draws. Only when the document contains a `:::contents`
  // block, so an ordinary report's html is unchanged.
  md.core.ruler.after("inline", "fm_toc", (state) => {
    const contents = state.tokens.filter(
      (t) =>
        t.type === "fm_container_open" &&
        (t.meta as ContainerMeta | undefined)?.name === "contents",
    );
    if (contents.length === 0) return true;
    const outline = outlineOfTokens(state.tokens);
    const listed = outline.filter((h) => h.listed).map((h) => h.item);
    for (const token of contents) {
      const meta = token.meta as ContainerMeta;
      const { depth } = fastrTocOptions(meta.attrs);
      meta.toc = listed.filter((it) => it.level <= depth);
    }
    for (const h of outline) state.tokens[h.index].attrSet("id", h.item.slug);
    return true;
  });

  // ── Top-level headings ─────────────────────────────────────────────────────
  // A heading outside every block is a document SECTION (the format's own
  // rule) and carries `fm-top` so a stylesheet can address it without the
  // structural `body > h2`, which no longer holds once a paginator has moved
  // the flow into page boxes.
  md.core.ruler.push("fm_top_headings", (state) => {
    const where = new HeadingPlace();
    for (const token of state.tokens) {
      if (where.step(token)) continue;
      if (token.type === "heading_open" && where.isSection()) {
        token.attrJoin("class", "fm-top");
      }
    }
    // `numbering=sections`: the numbered ones also carry fm-numbered and
    // their rank (fm-numbered--sec, fm-numbered--sub), which is what the
    // stylesheets and Word count (print's selectors must match the source
    // alone, without the document root's class). The ranks follow the level
    // the document writes its sections at (fastrSectionLevel), and a page
    // template's own heading is a section whatever its tag.
    if (
      readFastrDocumentSettings(state.src ?? "").className.includes(
        "fm-doc--numbered",
      )
    ) {
      const level = fastrSectionLevel(state.tokens);
      for (const s of fastrSectionHeadings(state.tokens)) {
        const token = state.tokens[s.index];
        const own = Number(token.tag.slice(1));
        const rank = s.pageLine !== undefined || own === level
          ? "sec"
          : own === level + 1
          ? "sub"
          : undefined;
        if (rank !== undefined) {
          token.attrJoin("class", `fm-numbered fm-numbered--${rank}`);
        }
      }
    }
    // A cover's title carries its longest word's length, which the cover
    // layouts size the title by so no word breaks inside itself.
    const open: string[] = [];
    for (let i = 0; i < state.tokens.length; i++) {
      const t = state.tokens[i];
      const meta = t.meta as ContainerMeta | undefined;
      if (
        t.type === "fm_container_open" && !isFastrLeafBlock(meta?.name ?? "")
      ) {
        open.push(meta?.name ?? "");
      } else if (
        t.type === "fm_container_close" && !isFastrLeafBlock(meta?.name ?? "")
      ) {
        open.pop();
      } else if (t.type === "heading_open" && open.at(-1) === "cover") {
        const inline = state.tokens[i + 1];
        const text = fastrPlainInlineText(
          inline?.type === "inline" ? inline.content : "",
        ).replace(FASTR_ALIGN_SUFFIX_RE, "");
        const longest = Math.max(
          0,
          ...text.split(/[\s\-\u2010-\u2014/]+/).map((w) => [...w].length),
        );
        if (longest > 0) t.attrSet("style", `--fm-title-chars: ${longest}`);
      }
    }
    return true;
  });

  // ── Line anchors (preview only; env-driven so one instance serves both) ────
  // markdown-it renders a fence's attrs on the code element; the anchor
  // belongs on the pre, the block that stands in the flow (the paged runner
  // and the editor's gap stretches address the outermost element of a line).
  const renderFence = md.renderer.rules.fence;
  if (renderFence !== undefined) {
    md.renderer.rules.fence = (tokens, idx, options, env, self) => {
      const html = renderFence(tokens, idx, options, env, self);
      return html.replace(
        /^<pre><code([^>]*?) data-line="(\d+)"/,
        (_m, rest: string, line: string) =>
          `<pre data-line="${line}"><code${rest}`,
      );
    };
  }
  md.core.ruler.push("fm_line_anchors", (state) => {
    if (state.env?.lineAnchors !== true) return true;
    for (const token of state.tokens) {
      if (token.block && token.nesting >= 0 && token.map) {
        token.attrSet("data-line", String(token.map[0]));
      }
    }
    return true;
  });

  // ── Author raw HTML: no style ──────────────────────────────────────────────
  // Raw HTML is an escape hatch for structure, not for styling: a <style>
  // element or a style attribute in a body lands in the editor's own page
  // (its widgets inject the compiled html), so a collaborator's body or a
  // model's could restyle or overlay the app. DOMPurify cannot tell those
  // from the inline styles this renderer writes (a mark's colour, a block's
  // bg), so they go here, before any of ours exist: registered last, this
  // rule runs first after `inline`.
  // What went is counted on the env (fastrBodyReferences reads it).
  md.core.ruler.after("inline", "fm_raw_html", (state) => {
    let removed = 0;
    const clean = (html: string) => {
      const r = withoutAuthorStyle(html);
      removed += r.removed;
      return r.html;
    };
    for (const token of state.tokens) {
      if (token.type === "html_block") {
        token.content = clean(token.content);
        continue;
      }
      if (token.type !== "inline") continue;
      for (const child of token.children ?? []) {
        if (child.type === "html_inline") child.content = clean(child.content);
      }
    }
    if (removed > 0 && state.env) {
      const env = state.env as FastrParseEnv;
      env.authorStyle = (env.authorStyle ?? 0) + removed;
    }
    return true;
  });

  return md;
}

// markdown-it's own attribute grammar (its html_re), so a tag reads here as
// it did when markdown-it decided it was one.
const RAW_ATTR_NAME = "[a-zA-Z_:][a-zA-Z0-9:._-]*";
const RAW_ATTR_VALUE = "(?:[^\"'=<>`\\x00-\\x20]+|'[^']*'|\"[^\"]*\")";
const RAW_OPEN_TAG_RE = new RegExp(
  `<([A-Za-z][A-Za-z0-9-]*)((?:\\s+${RAW_ATTR_NAME}(?:\\s*=\\s*${RAW_ATTR_VALUE})?)*)\\s*(\\/?)>`,
  "y",
);
const RAW_ATTR_RE = new RegExp(
  `(${RAW_ATTR_NAME})(?:\\s*=\\s*(${RAW_ATTR_VALUE}))?`,
  "g",
);
const RAW_CLOSE_TAG_RE = /<\/([A-Za-z][A-Za-z0-9-]*)\s*>/y;
// Whitespace to `\s` that is not whitespace to an HTML tokenizer.
const NON_HTML_SPACE_RE = /[^\S \t\n\r\f]/;
// Elements whose content the browser reads as text up to their end tag. None
// of them is anything a report shows (the sanitizer forbids them all), so
// each goes whole, content and all.
const RAW_TEXT_TAGS = new Set([
  "iframe",
  "noembed",
  "noframes",
  "noscript",
  "plaintext",
  "script",
  "style",
  "textarea",
  "title",
  "xmp",
]);

// Raw HTML with every <style> element and style attribute gone. The output
// is built so the browser cannot read a tag this did not: each tag is
// re-serialized from its parse (attributes space-separated and quoted), every
// other `<` becomes `&lt;` (which shows as the same character), and comments
// and `<!…>`/`<?…>` constructs, which draw nothing, are dropped rather than
// copied, so no span this did not parse reaches the page.
function withoutAuthorStyle(html: string): { html: string; removed: number } {
  let out = "";
  let removed = 0;
  let i = 0;
  while (i < html.length) {
    const lt = html.indexOf("<", i);
    if (lt < 0) {
      out += html.slice(i);
      break;
    }
    out += html.slice(i, lt);
    i = lt;
    if (html.startsWith("<!--", i)) {
      const end = commentEnd(html, i);
      if (end === undefined) {
        out += "&lt;";
        i++;
      } else i = end;
      continue;
    }
    if (html[i + 1] === "!" || html[i + 1] === "?") {
      const gt = html.indexOf(">", i);
      if (gt < 0) {
        out += "&lt;";
        i++;
      } else i = gt + 1;
      continue;
    }
    RAW_OPEN_TAG_RE.lastIndex = i;
    const open = RAW_OPEN_TAG_RE.exec(html);
    if (open !== null) {
      i += open[0].length;
      const name = open[1].toLowerCase();
      if (RAW_TEXT_TAGS.has(name)) {
        if (name === "style") removed++;
        i = rawTextEnd(html, i, name);
        continue;
      }
      // A tag with nothing to remove is kept as written when its whitespace
      // is the browser's own: `\s` also matches characters (a vertical tab,
      // a no-break space) that HTML reads as part of a name, and then the
      // browser's attributes are not the ones read here.
      const before = removed;
      const attrs: string[] = [];
      RAW_ATTR_RE.lastIndex = 0;
      let a: RegExpExecArray | null;
      while ((a = RAW_ATTR_RE.exec(open[2])) !== null) {
        if (a[1].toLowerCase() === "style") {
          removed++;
          continue;
        }
        const v = a[2];
        attrs.push(
          v === undefined
            ? a[1]
            : v.startsWith('"') || v.startsWith("'")
            ? `${a[1]}=${v}`
            : `${a[1]}="${v}"`,
        );
      }
      if (removed === before && !NON_HTML_SPACE_RE.test(open[0])) {
        out += open[0];
        continue;
      }
      out += `<${open[1]}${attrs.map((x) => ` ${x}`).join("")}${
        open[3] === "/" ? " /" : ""
      }>`;
      continue;
    }
    RAW_CLOSE_TAG_RE.lastIndex = i;
    const close = RAW_CLOSE_TAG_RE.exec(html);
    if (close !== null) {
      i += close[0].length;
      if (!RAW_TEXT_TAGS.has(close[1].toLowerCase())) {
        out += NON_HTML_SPACE_RE.test(close[0]) ? `</${close[1]}>` : close[0];
      }
      continue;
    }
    out += "&lt;";
    i++;
  }
  return { html: out, removed };
}

// Where the browser ends a comment opened at `at`: the first `-->` or `--!>`,
// or at once for `<!-->` and `<!--->`. Undefined when it never ends.
function commentEnd(html: string, at: number): number | undefined {
  if (html.startsWith("<!-->", at)) return at + 5;
  if (html.startsWith("<!--->", at)) return at + 6;
  const a = html.indexOf("-->", at + 4);
  const b = html.indexOf("--!>", at + 4);
  if (a < 0 && b < 0) return undefined;
  return a < 0 ? b + 4 : b < 0 || a < b ? a + 3 : b + 4;
}

// One past the end tag that closes a raw-text element (`</name` followed by
// whitespace, `/` or `>`, through its `>`); the end of the html when nothing
// closes it, since the browser reads the rest as its text.
function rawTextEnd(html: string, from: number, name: string): number {
  if (name === "plaintext") return html.length;
  const re = new RegExp(`</${name}(?=[\\t\\n\\f\\r />])`, "gi");
  re.lastIndex = from;
  const m = re.exec(html);
  if (m === null) return html.length;
  const gt = html.indexOf(">", m.index);
  return gt < 0 ? html.length : gt + 1;
}

let cachedMd: MarkdownIt | undefined;

// What a parse reports back besides its tokens.
type FastrParseEnv = {
  // Author-written <style> elements and style attributes the compiler removed.
  authorStyle?: number;
};

// The token stream the renderer draws from, for readers that must agree with
// it (the outline, the AI's headings index, the AI's checks).
export function parseFastrMarkdown(
  body: string,
  env: FastrParseEnv = {},
): Token[] {
  cachedMd ??= createFastrMarkdownIt();
  return cachedMd.parse(body, env);
}

// The block tokens alone, without the inline pass or the core rules: what
// the outline and the headings index need, at a fraction of a full parse
// (the editor asks for the outline on every change). Normalised as
// markdown-it's own first core rule does.
export function parseFastrMarkdownBlocks(body: string): Token[] {
  cachedMd ??= createFastrMarkdownIt();
  const src = body.replace(/\r\n?|\n/g, "\n").replace(/\0/g, "\uFFFD");
  const tokens: Token[] = [];
  cachedMd.block.parse(src, cachedMd, {}, tokens);
  return tokens;
}

// ── What a body references ───────────────────────────────────────────────────

export type FastrBodyReferences = {
  // Every figure:/image: the document will try to resolve: an image in any
  // markdown form (inline, `<…>`, titled, reference-style), a block's
  // `bg=image:<id>`, a logo row's sources.
  embeds: { kind: "figure" | "image"; id: string; line: number }[];
  // Literal colours, as listFastrLiteralBackgrounds describes them, but read
  // off the marks and fences the renderer actually makes.
  literals: FastrLiteralBackground[];
  // Author-written <style> elements and style attributes, which the compiler
  // removes (fm_raw_html).
  authorStyle: number;
};

const EMBED_REF_RE = /^(figure|image):(.+)$/;

// The references a body makes, read from the renderer's own tokens, so a
// check built on it sees exactly what the document will draw.
export function fastrBodyReferences(body: string): FastrBodyReferences {
  const env: FastrParseEnv = {};
  const tokens = parseFastrMarkdown(body, env);
  const out: FastrBodyReferences = {
    embeds: [],
    literals: [],
    authorStyle: env.authorStyle ?? 0,
  };
  const embed = (src: string, line: number) => {
    const m = EMBED_REF_RE.exec(src.trim());
    if (m === null) return;
    let id = m[2];
    // markdown-it percent-encodes a link destination.
    try {
      id = decodeURIComponent(id);
    } catch {
      // Not encoded after all: the id as written.
    }
    out.embeds.push({ kind: m[1] as "figure" | "image", id, line });
  };
  const inline = (children: Token[], line: number): number => {
    for (const c of children) {
      if (c.type === "softbreak" || c.type === "hardbreak") line++;
      if (c.type === "image") {
        embed(c.attrGet("src") ?? "", line);
        line = inline(c.children ?? [], line);
      }
      if (c.type === "fm_mark_open") {
        const attrs = c.meta as FastrMarkAttrs;
        if (attrs.color !== undefined) {
          out.literals.push({ line, attr: "color", value: attrs.color });
        }
        if (attrs.highlight !== undefined) {
          out.literals.push({
            line,
            attr: "highlight",
            value: attrs.highlight,
          });
        }
      }
    }
    return line;
  };
  for (const t of tokens) {
    const line = (t.map?.[0] ?? 0) + 1;
    if (t.type === "inline") {
      inline(t.children ?? [], line);
      continue;
    }
    if (t.type !== "fm_container_open") continue;
    const meta = t.meta as ContainerMeta;
    for (const key of ["bg", "background"]) {
      const v = meta.attrs[key];
      if (typeof v !== "string" || v.length === 0) continue;
      if (fastrToneOf(v) === undefined) {
        out.literals.push({ line, attr: "bg", value: v });
      }
      embed(v, line);
    }
    if (meta.name === "logos") {
      for (const id of fastrLogoImageIds(meta.attrs)) {
        out.embeds.push({ kind: "image", id, line });
      }
    }
  }
  return out;
}

// Unsanitized HTML — every caller must run it through sanitizeReportHtml.
export function renderFastrMarkdownToHtml(
  body: string,
  opts: { lineAnchors: boolean },
): string {
  cachedMd ??= createFastrMarkdownIt();
  return cachedMd.render(body, { lineAnchors: opts.lineAnchors });
}

// ── Page templates ───────────────────────────────────────────────────────────

// A page's main text is everything in it but its slots, gathered into one
// element (fm-tpl-main) so the layout's grid can place it. The validator
// asks for one run; should an author write two, the second joins the first
// rather than overlap it in the grid. Called with the page's open token at
// `openIndex` and its contents after it, before its close is pushed.
function gatherPageMain(
  tokens: Token[],
  openIndex: number,
  TokenOf: new (type: string, tag: string, nesting: -1 | 0 | 1) => Token,
): void {
  const inner = tokens.splice(openIndex + 1);
  const main: Token[] = [];
  const out: Token[] = [];
  let mainAt = -1;
  let depth = 0;
  let item: Token[] = [];
  let isSlot = false;
  for (const t of inner) {
    if (depth === 0) {
      item = [];
      isSlot = t.type === "fm_container_open" &&
        (t.meta as ContainerMeta | undefined)?.name === "slot";
    }
    item.push(t);
    depth += t.nesting;
    if (depth > 0) continue;
    if (isSlot) {
      out.push(...item);
    } else {
      if (mainAt < 0) mainAt = out.length;
      main.push(...item);
    }
  }
  if (main.length > 0) {
    // At the level of the page's children: the blank-line rule (fm_spaces)
    // pairs a close with the open of its own level, and a wrapper at the
    // page's level would end the page early there.
    const level = tokens[openIndex].level + 1;
    const open = new TokenOf("fm_tpl_main_open", "div", 1);
    open.block = true;
    open.level = level;
    const close = new TokenOf("fm_tpl_main_close", "div", -1);
    close.block = true;
    close.level = level;
    out.splice(mainAt, 0, open, ...main, close);
  }
  tokens.push(...out);
}

// A slot whose fence names no ground takes its layout's default
// (FastrTemplateSlot.defaultTone): the exec sidebar's ink, the two halves of
// a comparison. On the token's attributes, so it renders like a written tone.
function applySlotDefaults(
  tokens: Token[],
  openIndex: number,
  pageAttrs: FastrContainerAttrs,
): void {
  const layout = pageAttrs["layout"];
  const template = fastrPageTemplate(
    typeof layout === "string" ? layout : undefined,
  );
  if (template === undefined) return;
  let depth = 0;
  for (let i = openIndex + 1; i < tokens.length; i++) {
    const t = tokens[i];
    if (depth === 0 && t.type === "fm_container_open") {
      const meta = t.meta as ContainerMeta;
      const name = meta.attrs["name"];
      const spec = meta.name === "slot" && typeof name === "string"
        ? template.slots.find((s) => s.name === name.toLowerCase())
        : undefined;
      if (
        spec?.defaultTone !== undefined && meta.attrs["tone"] === undefined &&
        meta.attrs["bg"] === undefined
      ) {
        meta.attrs = { ...meta.attrs, tone: spec.defaultTone };
      }
    }
    depth += t.nesting;
    if (depth < 0) break;
  }
}

// Where a token walk stands, for the one question headings ask: is a
// heading here a document SECTION? One outside every block is; inside a
// page template, one in the layout's heading area is (its main text, or a
// named slot); anywhere else is not.
class HeadingPlace {
  private stack: ContainerMeta[] = [];
  private inMain = false;
  // Follows one token; true when it was structure (a fence, a main wrapper).
  step(t: Token): boolean {
    if (t.type === "fm_container_open") {
      const meta = t.meta as ContainerMeta | undefined;
      if (meta !== undefined && !isFastrLeafBlock(meta.name)) {
        this.stack.push(meta);
      }
      return true;
    }
    if (t.type === "fm_container_close") {
      const meta = t.meta as ContainerMeta | undefined;
      if (meta !== undefined && !isFastrLeafBlock(meta.name)) this.stack.pop();
      return true;
    }
    if (t.type === "fm_tpl_main_open" || t.type === "fm_tpl_main_close") {
      this.inMain = t.type === "fm_tpl_main_open";
      return true;
    }
    return false;
  }
  isSection(): boolean {
    const s = this.stack;
    if (s.length === 0) return true;
    if (s[0].name !== "page") return false;
    const layout = s[0].attrs["layout"];
    const area = fastrPageTemplate(
      typeof layout === "string" ? layout : undefined,
    )?.headingArea;
    if (area === undefined) return false;
    if (s.length === 1) return area === "main" && this.inMain;
    const slot = s[1].attrs["name"];
    return s.length === 2 && s[1].name === "slot" &&
      typeof slot === "string" && slot.toLowerCase() === area;
  }
}

// Every heading the document treats as a SECTION, off the block tokens: one
// outside every block, list and quote, or one in a page template's heading
// area (HeadingPlace). `pageLine` is the 0-based line of the `:::page` a
// heading stands in: its section starts there, so a section rewrite takes
// the whole template rather than splice into it.
export function fastrSectionHeadings(
  tokens: Token[],
): { index: number; pageLine?: number }[] {
  const out: { index: number; pageLine?: number }[] = [];
  const where = new HeadingPlace();
  let nested = 0;
  let pageLine: number | undefined;
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.type === "fm_container_open" && t.level === 0) {
      const name = (t.meta as ContainerMeta | undefined)?.name;
      pageLine = name === "page" ? t.map?.[0] : undefined;
    }
    if (t.type === "fm_container_close" && t.level === 0) pageLine = undefined;
    if (where.step(t)) continue;
    if (
      t.type === "blockquote_open" || t.type === "bullet_list_open" ||
      t.type === "ordered_list_open"
    ) nested++;
    if (
      t.type === "blockquote_close" || t.type === "bullet_list_close" ||
      t.type === "ordered_list_close"
    ) nested--;
    if (t.type !== "heading_open" || nested > 0 || !where.isSection()) {
      continue;
    }
    out.push(pageLine === undefined ? { index: i } : { index: i, pageLine });
  }
  return out;
}

// The heading level a document writes its sections at: the shallowest
// section heading outside a page template (`#` in most reports, `##` in some
// older ones), so numbering and the contents read the document as written.
// With no other section, a template's own; with none at all, `##`.
export function fastrSectionLevel(tokens: Token[]): number {
  let plain = 0;
  let any = 0;
  for (const s of fastrSectionHeadings(tokens)) {
    const level = Number(tokens[s.index].tag.slice(1));
    if (any === 0 || level < any) any = level;
    if (s.pageLine === undefined && (plain === 0 || level < plain)) {
      plain = level;
    }
  }
  return plain || any || 2;
}

// ── Outline ──────────────────────────────────────────────────────────────────

type OutlineHeading = {
  // The heading_open token's index.
  index: number;
  item: FastrTocItem;
  // Whether a table of contents lists it: not a heading quoted in a
  // blockquote or written in a list item. Those still carry an anchor and
  // spend their slug, so the ones after them keep the same ids.
  listed: boolean;
};

// Every heading the document draws, in order, with the anchor it carries.
// Headings inside a `:::cover` are the title page, not sections, so they are
// skipped. Read off the tokens rather than the source lines, so a setext
// heading, an indented one and `## Title ##` count exactly as they render,
// and a `## ` line inside raw html (which renders as text) does not.
function outlineOfTokens(tokens: Token[]): OutlineHeading[] {
  const out: OutlineHeading[] = [];
  // A page template's heading is a section, listed at the sections' level.
  const sectionLevel = fastrSectionLevel(tokens);
  const seen = new Map<string, number>();
  const open: string[] = [];
  const where = new HeadingPlace();
  let nested = 0;
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    where.step(t);
    switch (t.type) {
      case "fm_container_open":
        open.push((t.meta as ContainerMeta | undefined)?.name ?? "");
        continue;
      case "fm_container_close":
        open.pop();
        continue;
      case "blockquote_open":
      case "bullet_list_open":
      case "ordered_list_open":
        nested++;
        continue;
      case "blockquote_close":
      case "bullet_list_close":
      case "ordered_list_close":
        nested--;
        continue;
    }
    if (t.type !== "heading_open" || open.includes("cover")) continue;
    if (open.includes("page") && !where.isSection()) continue;
    const inline = tokens[i + 1];
    // A heading's own `{align=…}` is not part of its text.
    const raw = (inline?.type === "inline" ? inline.content : "").replace(
      FASTR_ALIGN_SUFFIX_RE,
      "",
    );
    out.push({
      index: i,
      listed: nested === 0,
      item: {
        level: open.includes("page") ? sectionLevel : Number(t.tag.slice(1)),
        // A setext heading's content can run over several lines.
        text: fastrPlainInlineText(raw).split("\n").map((l) => l.trim())
          .join(" "),
        slug: fastrTocSlug(raw, seen),
        line: (t.map?.[0] ?? 0) + 1,
      },
    });
  }
  return out;
}

let outlineCache: { body: string; items: FastrTocItem[] } | undefined;

// Every heading a table of contents lists, as the renderer anchors it.
// Levels deeper than `depth` are left out; the slug is spent even for a
// skipped level, so a heading's anchor never depends on which depth a table
// of contents shows. The editor asks on every change, often twice for one
// body, so the last answer is kept.
export function fastrDocumentOutline(
  body: string,
  depth = FASTR_TOC_DEFAULT_DEPTH,
): FastrTocItem[] {
  if (outlineCache?.body !== body) {
    const items = outlineOfTokens(parseFastrMarkdownBlocks(body))
      .filter((h) => h.listed)
      .map((h) => h.item);
    outlineCache = { body, items };
  }
  return outlineCache.items.filter((it) => it.level <= depth);
}
