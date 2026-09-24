// =============================================================================
// Source ↔ rendered text mapping for slide text edited ON the canvas.
//
// A slide text block is markdown, drawn by panther's MarkdownRenderer. Inline
// editing keeps that canvas as the only thing on screen: a hidden CodeMirror
// owns the markdown (and the Y.Text binding), while the caret and selection
// are painted over the canvas. That needs a map from every source offset to
// the glyph it produces, and panther keeps no source offsets (panther is a
// synced external library, so this cannot be fixed there).
//
// So the map is rebuilt here from panther's own exported parser: the same
// `parseMarkdown` the renderer runs gives the rendered text of every item, and
// markdown-it's block tokens (same config via `createMarkdownIt`) give where
// each item's inline source sits. A greedy, line-bounded alignment of rendered
// characters against that inline source classifies every source character:
//
//   VISIBLE        drawn as a glyph (the caret can sit before/after it)
//   INLINE_SYNTAX  `**`, `_`, `[`, `](url)`, escapes, inline html: invisible
//   BREAK          a newline that draws as a line break inside an item
//   BLOCK          everything else: list markers, `> `, `#`, blank lines, …
//
// DOM-free and canvas-free (the geometry lives client-side), so every rule is
// pinned by server/tests/slide_text_offsets_test.ts.
//
// The edit helpers at the bottom make the canvas editor WYSIWYG without ever
// showing syntax: deletions keep inline syntax (so a half-selected bold span
// stays bold rather than leaking `**` onto the slide) and bold/italic toggles
// re-serialize the touched lines and are VERIFIED by re-parsing: an edit that
// would not render as intended is refused rather than applied.
// =============================================================================

import { createMarkdownIt, parseMarkdown } from "@timroberton/panther";
import type { MarkdownInline, ParsedMarkdownItem } from "@timroberton/panther";

export const SRC_BLOCK = 0;
export const SRC_VISIBLE = 1;
export const SRC_INLINE_SYNTAX = 2;
export const SRC_BREAK = 3;

export type SlideCharStyle = {
  bold: boolean;
  italic: boolean;
  code: boolean;
  link?: string;
};

/** One run of formatted text as panther measures it: a paragraph, heading or
 *  list item's content, or ONE paragraph of a blockquote. */
export type SlideTextUnit = {
  /** Index into parseMarkdown(src).items === MeasuredMarkdown.markdownItems. */
  itemIndex: number;
  /** Blockquote paragraph index (the renderer splits quotes at double
   *  breaks); 0 for every other item type. */
  groupIndex: number;
  itemType: ParsedMarkdownItem["type"];
  /** The rendered inline text: "\n" is a line break. */
  text: string;
  /** Per char of `text`: its source offset, or -1 when it has none. */
  toSrc: number[];
  styles: SlideCharStyle[];
};

export type SlideTextAnalysis = {
  src: string;
  /** False when the block holds content the canvas editor cannot address
   *  (tables, code fences, block images): the side panel edits those. */
  editable: boolean;
  units: SlideTextUnit[];
  /** Per source char: SRC_BLOCK | SRC_VISIBLE | SRC_INLINE_SYNTAX | SRC_BREAK. */
  kind: Uint8Array;
  /** Per source char: the style it renders with (VISIBLE chars only). */
  srcStyle: (SlideCharStyle | undefined)[];
  /** Per source char: the char it renders as (VISIBLE chars only), with a
   *  typographer-curled quote given back as its source quote. */
  srcChar: (string | undefined)[];
};

// ── Tokens (the parts of markdown-it's token we read) ────────────────────────

type MdToken = {
  type: string;
  tag: string;
  level: number;
  map: [number, number] | null;
  content: string;
  children: MdToken[] | null;
};

type MdItem =
  | { kind: "inline"; tokens: MdToken[] }
  | { kind: "none" }
  | { kind: "unsupported" };

// Walks the token stream in EXACTLY the order panther's parseMarkdown does
// (see panther/_105_markdown/parser.ts), collecting each item's inline tokens.
// The item counts are compared afterwards: any drift disables editing rather
// than mis-mapping.
function collectItems(tokens: MdToken[]): MdItem[] {
  const out: MdItem[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.type === "hr") {
      out.push({ kind: "none" });
    } else if (t.type === "fence") {
      out.push({ kind: "unsupported" });
    } else if (t.type === "blockquote_open") {
      const inl: MdToken[] = [];
      let j = i + 1;
      while (j < tokens.length && tokens[j].type !== "blockquote_close") {
        if (tokens[j].type === "inline") inl.push(tokens[j]);
        j++;
      }
      out.push({ kind: "inline", tokens: inl });
      i = j;
    } else if (t.type === "heading_open") {
      const c = tokens[i + 1];
      if (c && c.type === "inline") {
        out.push({ kind: "inline", tokens: [c] });
      }
      i += 2;
    } else if (t.type === "table_open") {
      out.push({ kind: "unsupported" });
      let j = i + 1;
      while (j < tokens.length && tokens[j].type !== "table_close") j++;
      i = j;
    } else if (t.type === "paragraph_open" && t.level === 0) {
      const c = tokens[i + 1];
      if (c && c.type === "inline") {
        const kids = c.children ?? [];
        if (kids.length === 1 && kids[0].type === "image") {
          out.push({ kind: "unsupported" });
        } else {
          out.push({ kind: "inline", tokens: [c] });
        }
      }
      i += 2;
    } else if (t.type === "list_item_open") {
      let j = i + 1;
      while (j < tokens.length && tokens[j].type !== "list_item_close") {
        if (tokens[j].type === "inline") {
          out.push({ kind: "inline", tokens: [tokens[j]] });
          break;
        }
        j++;
      }
    }
  }
  return out;
}

// ── Raw inline source ────────────────────────────────────────────────────────

type RawChar = { ch: string; src: number };

function lineStartsOf(src: string): number[] {
  const starts = [0];
  for (let i = 0; i < src.length; i++) {
    if (src[i] === "\n") starts.push(i + 1);
  }
  return starts;
}

// An inline token's `content` is its source lines with the block prefixes
// (list marker, `> `, `#`, indentation) stripped. Each content line is a
// suffix-ish slice of its source line, so it is found by searching from the
// right: a heading's `# a #` holds "a" at 2, a list's `1. 1st` holds "1st" at 3.
function rawCharsOf(
  tok: MdToken,
  srcLines: string[],
  lineStarts: number[],
): RawChar[] {
  const out: RawChar[] = [];
  if (!tok.map) return out;
  const lines = tok.content.split("\n");
  for (let k = 0; k < lines.length; k++) {
    const lineNo = tok.map[0] + k;
    const S = srcLines[lineNo];
    if (S === undefined) break;
    const L = lines[k];
    let col = L.length ? S.lastIndexOf(L) : S.length;
    if (col < 0) {
      const trimmed = L.trim();
      col = trimmed ? S.lastIndexOf(trimmed) : -1;
      if (col >= 0) {
        // Re-anchor so the untrimmed content still lines up char by char.
        col -= L.indexOf(trimmed);
      }
    }
    if (col < 0) col = Math.max(0, S.length - L.length);
    const base = lineStarts[lineNo] + col;
    for (let c = 0; c < L.length; c++) {
      out.push({ ch: L[c], src: base + c });
    }
    if (k < lines.length - 1) {
      // The newline ending this source line.
      out.push({ ch: "\n", src: lineStarts[lineNo] + S.length });
    }
  }
  return out;
}

type RawMarks = {
  /** Never matched against a rendered char (url, tag, image, escape `\`). */
  blocked: boolean[];
  /** Entity start → { end (exclusive raw index), decoded text }. */
  entities: Map<number, { end: number; decoded: string }>;
  /** Raw index of a `<br>` start → raw index just past its `>`. */
  brEnd: Map<number, number>;
};

const ESCAPABLE = /[!-/:-@[-`{-~]/;

function decodeEntity(entity: string): string {
  const m = /^&#(x?)([0-9a-f]+);$/i.exec(entity);
  if (m) {
    const code = parseInt(m[2], m[1] ? 16 : 10);
    try {
      return String.fromCodePoint(code);
    } catch {
      return "�";
    }
  }
  const named: Record<string, string> = {
    amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
    copy: "©", reg: "®", trade: "™", hellip: "…", mdash: "\u2014", ndash: "\u2013",
    lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”", times: "×", middot: "·",
    deg: "°", euro: "€", pound: "£", bull: "•",
  };
  return named[entity.slice(1, -1)] ?? entity;
}

function markRaw(raw: RawChar[]): RawMarks {
  const s = raw.map((r) => r.ch).join("");
  const blocked = new Array<boolean>(raw.length).fill(false);
  const entities = new Map<number, { end: number; decoded: string }>();
  const brEnd = new Map<number, number>();
  const block = (from: number, to: number) => {
    for (let i = from; i < to && i < blocked.length; i++) blocked[i] = true;
  };

  // Code spans: literal content, no escapes / entities / tags inside.
  const inCode = new Array<boolean>(raw.length).fill(false);
  for (let i = 0; i < s.length; i++) {
    if (s[i] !== "`" || (i > 0 && s[i - 1] === "\\")) continue;
    let n = 1;
    while (s[i + n] === "`") n++;
    const fence = "`".repeat(n);
    let j = i + n;
    let close = -1;
    while (j < s.length) {
      const k = s.indexOf(fence, j);
      if (k < 0) break;
      let m = k + n;
      if (s[m] === "`") {
        while (s[m] === "`") m++;
        j = m;
        continue;
      }
      close = k;
      break;
    }
    if (close < 0) {
      i += n - 1;
      continue;
    }
    for (let x = i + n; x < close; x++) inCode[x] = true;
    i = close + n - 1;
  }

  // Images `![alt](src)`: nothing of them is drawn inline.
  for (const m of s.matchAll(/!\[[^\]\n]*\]\([^)\n]*\)/g)) {
    if (!inCode[m.index!]) block(m.index!, m.index! + m[0].length);
  }
  // Link destinations `](url "title")`, with one level of nested parens.
  for (const m of s.matchAll(/\]\((?:[^()\n]|\([^()\n]*\))*\)/g)) {
    if (!inCode[m.index!]) block(m.index!, m.index! + m[0].length);
  }
  // Inline html is dropped by the renderer, except <br> which is a break.
  for (const m of s.matchAll(/<\/?[A-Za-z][A-Za-z0-9-]*(?:\s[^<>\n]*)?\/?>|<!--[\s\S]*?-->/g)) {
    const at = m.index!;
    if (inCode[at]) continue;
    if (/^<br\s*\/?>$/i.test(m[0])) {
      brEnd.set(at, at + m[0].length);
      block(at + 1, at + m[0].length);
    } else {
      block(at, at + m[0].length);
    }
  }
  for (const m of s.matchAll(/&(?:#\d{1,7}|#x[0-9a-f]{1,6}|[a-z][a-z0-9]{1,31});/gi)) {
    const at = m.index!;
    if (inCode[at] || blocked[at]) continue;
    entities.set(at, { end: at + m[0].length, decoded: decodeEntity(m[0]) });
    block(at + 1, at + m[0].length);
  }
  // Backslash escapes: the backslash is syntax, the escaped char is text.
  for (let i = 0; i < s.length - 1; i++) {
    if (s[i] === "\\" && !inCode[i] && !blocked[i] && ESCAPABLE.test(s[i + 1])) {
      blocked[i] = true;
      i++;
    }
  }
  return { blocked, entities, brEnd };
}

function sameChar(rendered: string, source: string): boolean {
  if (rendered === source) return true;
  if ((rendered === "‘" || rendered === "’") && source === "'") return true;
  if ((rendered === "“" || rendered === "”") && source === '"') return true;
  return false;
}

// Greedy, LINE-BOUNDED alignment: a rendered char is looked for only up to the
// end of the current source line, so one unmatched char (an odd entity) can
// never swallow the rest of the item.
function alignItem(rendered: string, raw: RawChar[], marks: RawMarks): number[] {
  const toSrc = new Array<number>(rendered.length).fill(-1);
  let j = 0;
  for (let i = 0; i < rendered.length; i++) {
    const c = rendered[i];
    if (c === "\n") {
      for (let k = j; k < raw.length; k++) {
        if (marks.brEnd.has(k)) {
          toSrc[i] = raw[k].src;
          j = marks.brEnd.get(k)!;
          break;
        }
        if (raw[k].ch === "\n") {
          toSrc[i] = raw[k].src;
          j = k + 1;
          break;
        }
      }
      continue;
    }
    for (let k = j; k < raw.length; k++) {
      if (raw[k].ch === "\n" || marks.brEnd.has(k)) break;
      const ent = marks.entities.get(k);
      if (ent) {
        if (ent.decoded === c) {
          toSrc[i] = raw[k].src;
          j = ent.end;
          break;
        }
        continue;
      }
      if (marks.blocked[k]) continue;
      if (sameChar(c, raw[k].ch)) {
        toSrc[i] = raw[k].src;
        j = k + 1;
        break;
      }
    }
  }
  return toSrc;
}

function styleOf(inline: MarkdownInline): SlideCharStyle {
  switch (inline.type) {
    case "bold":
      return { bold: true, italic: false, code: false };
    case "italic":
      return { bold: false, italic: true, code: false };
    case "bold-italic":
      return { bold: true, italic: true, code: false };
    case "link":
      return {
        bold: inline.style === "bold" || inline.style === "bold-italic",
        italic: inline.style === "italic" || inline.style === "bold-italic",
        code: false,
        link: inline.url,
      };
    case "code-inline":
      return { bold: false, italic: false, code: true };
    default:
      return { bold: false, italic: false, code: false };
  }
}

// The renderer splits a blockquote into paragraphs at double breaks (and
// drops a trailing single one): see measureBlockquote. Returns, per inline,
// its group index or -1 when the inline is a separator the renderer drops.
function blockquoteGroups(inlines: MarkdownInline[]): number[] {
  const groupOf = new Array<number>(inlines.length).fill(-1);
  let group = 0;
  let groupLen = 0;
  let pendingBreaks: number[] = [];
  for (let i = 0; i < inlines.length; i++) {
    if (inlines[i].type === "break") {
      pendingBreaks.push(i);
      if (pendingBreaks.length >= 2) {
        if (groupLen > 0) {
          group++;
          groupLen = 0;
        }
        pendingBreaks = [];
      }
    } else {
      for (const b of pendingBreaks) {
        groupOf[b] = group;
        groupLen++;
      }
      pendingBreaks = [];
      groupOf[i] = group;
      groupLen++;
    }
  }
  return groupOf;
}

export function analyzeSlideMarkdown(src: string): SlideTextAnalysis {
  const kind = new Uint8Array(src.length);
  const srcStyle = new Array<SlideCharStyle | undefined>(src.length);
  const srcChar = new Array<string | undefined>(src.length);
  const result: SlideTextAnalysis = {
    src,
    editable: true,
    units: [],
    kind,
    srcStyle,
    srcChar,
  };

  const parsed = parseMarkdown(src).items;
  const md = createMarkdownIt({ html: true });
  const tokens = md.parse(src, {}) as unknown as MdToken[];
  const mdItems = collectItems(tokens);
  if (mdItems.length !== parsed.length) {
    result.editable = false;
    return result;
  }

  const srcLines = src.split("\n");
  const lineStarts = lineStartsOf(src);

  for (let itemIndex = 0; itemIndex < parsed.length; itemIndex++) {
    const item = parsed[itemIndex];
    const mdItem = mdItems[itemIndex];
    if (mdItem.kind === "unsupported") {
      result.editable = false;
      continue;
    }
    if (mdItem.kind === "none" || !("content" in item)) continue;
    const inlines = item.content;

    // Raw inline source, with two synthetic breaks between a blockquote's
    // paragraphs (the renderer's separator, which has no source char).
    const raw: RawChar[] = [];
    mdItem.tokens.forEach((tok, ti) => {
      if (ti > 0) {
        raw.push({ ch: "\n", src: -1 }, { ch: "\n", src: -1 });
      }
      raw.push(...rawCharsOf(tok, srcLines, lineStarts));
    });
    for (const r of raw) {
      if (r.src >= 0 && r.src < src.length) {
        kind[r.src] = r.ch === "\n" ? SRC_BREAK : SRC_INLINE_SYNTAX;
      }
    }

    // Rendered text, with each char's inline index.
    let rendered = "";
    const inlineOf: number[] = [];
    inlines.forEach((inl, ii) => {
      const t = inl.type === "break" ? "\n" : inl.text;
      rendered += t;
      for (let k = 0; k < t.length; k++) inlineOf.push(ii);
    });
    const toSrc = alignItem(rendered, raw, markRaw(raw));

    for (let i = 0; i < rendered.length; i++) {
      const s = toSrc[i];
      if (s < 0 || s >= src.length) continue;
      if (rendered[i] === "\n") {
        kind[s] = SRC_BREAK;
      } else {
        kind[s] = SRC_VISIBLE;
        srcStyle[s] = styleOf(inlines[inlineOf[i]]);
        const c = rendered[i];
        srcChar[s] = c === "‘" || c === "’" || c === "“" || c === "”"
          ? src[s]
          : c;
      }
    }

    const groups = item.type === "blockquote"
      ? blockquoteGroups(inlines)
      : inlines.map(() => 0);
    const byGroup = new Map<number, SlideTextUnit>();
    for (let i = 0; i < rendered.length; i++) {
      const g = groups[inlineOf[i]];
      if (g < 0) continue;
      let unit = byGroup.get(g);
      if (!unit) {
        unit = {
          itemIndex,
          groupIndex: g,
          itemType: item.type,
          text: "",
          toSrc: [],
          styles: [],
        };
        byGroup.set(g, unit);
      }
      unit.text += rendered[i];
      unit.toSrc.push(toSrc[i]);
      unit.styles.push(styleOf(inlines[inlineOf[i]]));
    }
    for (const g of [...byGroup.keys()].sort((a, b) => a - b)) {
      result.units.push(byGroup.get(g)!);
    }
  }
  return result;
}

// ── Measured runs → unit text ────────────────────────────────────────────────

export type RunSpan = {
  /** [start, end) in the unit's text. */
  start: number;
  end: number;
  /** A space chunk: panther draws any whitespace run as ONE space. */
  isSpace: boolean;
};

/** Assign each measured run (by its drawn text, line by line) to its span of
 *  the unit text. Mirrors panther's splitRunsIntoChunks/wrapIntoLines: words
 *  are drawn as-is, a whitespace run as a single " ", and whitespace dropped at
 *  a wrap point or a line start (plus breaks) has no run at all. */
export function assignRunsToUnit(
  unitText: string,
  lines: string[][],
): RunSpan[][] {
  let p = 0;
  const isWs = (c: string) => c !== "\n" && /\s/.test(c);
  return lines.map((runs) =>
    runs.map((t): RunSpan => {
      if (t.trim() === "") {
        // Space chunk. Its source whitespace may follow a dropped break.
        while (p < unitText.length && unitText[p] === "\n") p++;
        const start = p;
        while (p < unitText.length && isWs(unitText[p])) p++;
        return { start, end: p, isSpace: true };
      }
      let at = p;
      while (
        at < unitText.length &&
        (unitText[at] === "\n" || isWs(unitText[at]))
      ) at++;
      if (!unitText.startsWith(t, at)) {
        const found = unitText.indexOf(t, p);
        if (found >= 0) at = found;
      }
      p = Math.min(unitText.length, at + t.length);
      return { start: at, end: p, isSpace: false };
    })
  );
}

// ── Navigation helpers ───────────────────────────────────────────────────────

/** The word around a source offset, as a source range over VISIBLE chars
 *  (word = maximal run of non-whitespace rendered chars in one unit). */
export function slideWordAt(
  an: SlideTextAnalysis,
  offset: number,
): { from: number; to: number } | undefined {
  for (const unit of an.units) {
    for (let i = 0; i < unit.text.length; i++) {
      const s = unit.toSrc[i];
      if (s < 0) continue;
      // The rendered char at or just before the caret.
      const hit = s === offset || s + 1 === offset;
      if (!hit || /\s/.test(unit.text[i])) continue;
      let a = i;
      let b = i;
      while (a > 0 && !/\s/.test(unit.text[a - 1]) && unit.toSrc[a - 1] >= 0) a--;
      while (
        b < unit.text.length - 1 && !/\s/.test(unit.text[b + 1]) &&
        unit.toSrc[b + 1] >= 0
      ) b++;
      // Prefer the word the caret is INSIDE of when it touches two.
      if (s + 1 === offset && i + 1 < unit.text.length && unit.toSrc[i + 1] === offset &&
        !/\s/.test(unit.text[i + 1])) {
        continue;
      }
      return { from: unit.toSrc[a], to: unit.toSrc[b] + 1 };
    }
  }
  return undefined;
}

/** First and last visible source offsets: the "content" range of the block. */
export function slideVisibleBounds(
  an: SlideTextAnalysis,
): { from: number; to: number } | undefined {
  let first = -1;
  let last = -1;
  for (let i = 0; i < an.kind.length; i++) {
    if (an.kind[i] === SRC_VISIBLE) {
      if (first < 0) first = i;
      last = i;
    }
  }
  return first < 0 ? undefined : { from: first, to: last + 1 };
}

// ── Edits ────────────────────────────────────────────────────────────────────
//
// Every edit is built as whole-document candidates, each re-parsed and
// VERIFIED against the rendered text and styles it must produce; the first
// that verifies is returned as a minimal change. Markdown emphasis has enough
// flanking rules that "just delete the characters" or "just insert `**`" is
// wrong in real cases (`**a** *b*` joined, a bold word split mid-span): a
// verified candidate never leaks syntax onto the slide.

export type SlideTextEdit = { from: number; to: number; insert: string };
export type SlideEditResult = {
  changes: SlideTextEdit[];
  /** Selection in the NEW document. */
  anchor: number;
  head: number;
};

type VisibleChar = { ch: string; src: number; style: SlideCharStyle };

function normQuote(c: string): string {
  if (c === "‘" || c === "’") return "'";
  if (c === "“" || c === "”") return '"';
  return c;
}

/** Every drawn char, in rendered order (breaks excluded). */
function visibleSeq(an: SlideTextAnalysis): VisibleChar[] {
  const out: VisibleChar[] = [];
  for (const u of an.units) {
    for (let k = 0; k < u.text.length; k++) {
      if (u.text[k] === "\n" || u.toSrc[k] < 0) continue;
      out.push({ ch: normQuote(u.text[k]), src: u.toSrc[k], style: u.styles[k] });
    }
  }
  return out;
}

function sameStyle(a: SlideCharStyle, b: SlideCharStyle): boolean {
  return a.bold === b.bold && a.italic === b.italic && a.code === b.code &&
    (a.link ?? "") === (b.link ?? "");
}

function wholeDocChange(before: string, after: string): SlideTextEdit[] {
  if (before === after) return [];
  let p = 0;
  while (p < before.length && p < after.length && before[p] === after[p]) p++;
  let s = 0;
  while (
    s < before.length - p && s < after.length - p &&
    before[before.length - 1 - s] === after[after.length - 1 - s]
  ) s++;
  return [{ from: p, to: before.length - s, insert: after.slice(p, after.length - s) }];
}

/** The first candidate whose render matches `expected` exactly: the same
 *  chars with the same styles (whitespace's own emphasis is not compared: a
 *  space outside `**` draws the same), and when `units` is given, the same
 *  item structure too. */
function firstVerified(
  candidates: string[],
  expected: { ch: string; style: SlideCharStyle }[],
  units?: string[],
): { next: string; seq: VisibleChar[] } | undefined {
  const seen = new Set<string>();
  for (const next of candidates) {
    if (seen.has(next)) continue;
    seen.add(next);
    const after = analyzeSlideMarkdown(next);
    if (!after.editable) continue;
    if (units && unitTexts(after).join("\u0000") !== units.join("\u0000")) continue;
    const seq = visibleSeq(after);
    if (sameInk(seq, expected)) return { next, seq };
  }
  return undefined;
}

// Compared as ink: every non-space char with its style, and whether a space
// separates it from the one before. Whitespace's own emphasis, and the
// whitespace markdown trims at item edges, draw nothing.
function sameInk(
  a: { ch: string; style: SlideCharStyle }[],
  b: { ch: string; style: SlideCharStyle }[],
): boolean {
  const ink = (seq: { ch: string; style: SlideCharStyle }[]) => {
    const out: { ch: string; style: SlideCharStyle; gap: boolean }[] = [];
    let gap = false;
    for (const c of seq) {
      if (/\s/.test(c.ch)) {
        gap = true;
        continue;
      }
      out.push({ ch: c.ch, style: c.style, gap: out.length > 0 && gap });
      gap = false;
    }
    return out;
  };
  const x = ink(a);
  const y = ink(b);
  if (x.length !== y.length) return false;
  for (let i = 0; i < x.length; i++) {
    if (x[i].ch !== y[i].ch || x[i].gap !== y[i].gap) return false;
    if (!sameStyle(x[i].style, y[i].style)) return false;
  }
  return true;
}

function unitTexts(an: SlideTextAnalysis): string[] {
  return an.units.map((u) => [...u.text].map(normQuote).join(""));
}

// ── Serializing a region from its rendered chars ────────────────────────────

type Atom =
  | { kind: "text"; ch: string; style: SlideCharStyle }
  | { kind: "br" };

function escapeChar(ch: string): string {
  return /[\\*_`[\]~<&]/.test(ch) ? "\\" + ch : ch;
}

function wrapEmphasis(core: string, bold: boolean, italic: boolean, em: string): string {
  if (!core) return core;
  let s = core;
  if (italic) s = em + s + em;
  if (bold) s = "**" + s + "**";
  return s;
}

function serializeRun(atoms: Atom[], em: string): string {
  let s = "";
  let k = 0;
  while (k < atoms.length) {
    const a0 = atoms[k];
    if (a0.kind === "br") {
      s += "<br>";
      k++;
      continue;
    }
    let e = k + 1;
    while (e < atoms.length) {
      const a = atoms[e];
      if (
        a.kind !== "text" || a.style.bold !== a0.style.bold ||
        a.style.italic !== a0.style.italic || a.style.code !== a0.style.code
      ) break;
      e++;
    }
    const chars = atoms.slice(k, e).map((a) => (a as { ch: string }).ch);
    if (a0.style.code) {
      const code = chars.join("");
      let fence = "`";
      while (code.includes(fence)) fence += "`";
      const pad = code.startsWith("`") || code.endsWith("`") ? " " : "";
      s += wrapEmphasis(fence + pad + code + pad + fence, a0.style.bold, a0.style.italic, em);
    } else {
      const body = chars.map(escapeChar).join("");
      const lead = /^\s*/.exec(body)![0];
      const rest = body.slice(lead.length);
      const trail = /\s*$/.exec(rest)![0];
      const core = rest.slice(0, rest.length - trail.length);
      s += lead + wrapEmphasis(core, a0.style.bold, a0.style.italic, em) + trail;
    }
    k = e;
  }
  return s;
}

function linkDest(url: string): string {
  return /[\s()<>]/.test(url) ? "<" + url.replace(/[<>]/g, encodeURIComponent) + ">" : url;
}

// Links group first (their text keeps its own emphasis), then emphasis runs
// with delimiters hugging non-whitespace (`** x **` is not bold).
function serializeAtoms(atoms: Atom[], em: string, atLineStart: boolean): string {
  let out = "";
  let i = 0;
  while (i < atoms.length) {
    const a = atoms[i];
    const url = a.kind === "text" ? a.style.link : undefined;
    let e = i + 1;
    while (e < atoms.length) {
      const b = atoms[e];
      const bUrl = b.kind === "text" ? b.style.link : undefined;
      if (bUrl !== url) break;
      e++;
    }
    const run = serializeRun(atoms.slice(i, e), em);
    out += url !== undefined ? "[" + run + "](" + linkDest(url) + ")" : run;
    i = e;
  }
  if (atLineStart) {
    // Text that would read as block syntax at a line start stays text.
    out = out.replace(/^(\s*)([#>+\-=])/, "$1\\$2").replace(/^(\s*\d+)([.)])/, "$1\\$2");
  }
  return out;
}

function lineBounds(src: string, pos: number): { start: number; end: number } {
  const start = src.lastIndexOf("\n", pos - 1) + 1;
  let end = src.indexOf("\n", pos);
  if (end < 0) end = src.length;
  return { start, end };
}

// A line's block prefix (`- `, `> `, `## `, indentation): its leading chars
// that are neither text nor inline syntax.
function prefixEnd(an: SlideTextAnalysis, lineStart: number, lineEnd: number): number {
  let i = lineStart;
  while (i < lineEnd && an.kind[i] === SRC_BLOCK) i++;
  return i;
}

/** Rebuild each source line touched by [from, to) on its own, keeping its
 *  block prefix: the restyle path, which must not change structure. */
function serializeLines(
  an: SlideTextAnalysis,
  from: number,
  to: number,
  pick: (srcOffset: number) => SlideCharStyle,
  em: string,
): string {
  const { src } = an;
  const first = lineBounds(src, from);
  const last = lineBounds(src, Math.max(from, to - 1));
  let out = src.slice(0, first.start);
  let ls = first.start;
  while (true) {
    const le = src.indexOf("\n", ls) < 0 ? src.length : src.indexOf("\n", ls);
    out += serializeRegion(an, ls, le, pick, em, true);
    if (le >= last.end || le >= src.length) {
      out += src.slice(le);
      break;
    }
    out += "\n";
    ls = le + 1;
  }
  return out;
}

/** Rebuild the source lines spanning [from, to) from atoms, as ONE line (the
 *  deletion path: whatever lies between is deleted). `pick` supplies each
 *  visible char's style, or undefined to drop it. With `lineOnly`, returns
 *  just the rebuilt [line start, line end) text for one line. */
function serializeRegion(
  an: SlideTextAnalysis,
  from: number,
  to: number,
  pick: (srcOffset: number) => SlideCharStyle | undefined,
  em: string,
  lineOnly = false,
): string {
  const { src, kind } = an;
  const first = lineBounds(src, from);
  const last = lineBounds(src, Math.max(from, to - 1 < from ? from : to));
  const rs = lineOnly
    ? prefixEnd(an, first.start, first.end)
    : Math.min(from, prefixEnd(an, first.start, first.end));
  const atoms: Atom[] = [];
  for (let i = rs; i < last.end; i++) {
    if (kind[i] === SRC_VISIBLE) {
      const style = pick(i);
      if (style) atoms.push({ kind: "text", ch: an.srcChar[i] ?? src[i], style });
    } else if (
      kind[i] === SRC_BREAK && src[i] === "<" && (lineOnly || !(i >= from && i < to))
    ) {
      atoms.push({ kind: "br" });
    }
  }
  const body = serializeAtoms(atoms, em, rs === first.start);
  if (lineOnly) return src.slice(first.start, rs) + body;
  return src.slice(0, rs) + body + src.slice(last.end);
}

// ── Deletion ────────────────────────────────────────────────────────────────

const PAIR_DELIMS = ["~~", "**", "__", "*", "_"];

// Syntax left enclosing nothing: `****` after deleting all of `**x**`,
// `[](url)` after deleting a link's text. One candidate among several; the
// verifier decides whether it was right.
function cleanSyntaxRun(s: string): string {
  let prev: string;
  do {
    prev = s;
    s = s.replace(/\[\]\((?:[^()\n]|\([^()\n]*\))*\)/g, "");
    for (const d of PAIR_DELIMS) s = s.split(d + d).join("");
  } while (s !== prev);
  return s;
}

function hasStructure(an: SlideTextAnalysis, from: number, to: number): boolean {
  for (let i = from; i < to; i++) {
    if (an.kind[i] === SRC_BREAK || an.kind[i] === SRC_BLOCK) return true;
  }
  return false;
}

function prevVisible(an: SlideTextAnalysis, pos: number): number {
  for (let i = pos - 1; i >= 0; i--) if (an.kind[i] === SRC_VISIBLE) return i;
  return -1;
}

function nextVisible(an: SlideTextAnalysis, pos: number): number {
  for (let i = pos; i < an.kind.length; i++) if (an.kind[i] === SRC_VISIBLE) return i;
  return -1;
}

/** Where the caret lands after an edit: after the visible char that preceded
 *  the edit point (keeping its formatting for typing), or before the next one
 *  when the edit point starts a line. */
function caretAfterEdit(
  seq: VisibleChar[],
  keptBefore: number,
  attachRight: boolean,
  nextLen: number,
): number {
  if (attachRight || keptBefore === 0) {
    return keptBefore < seq.length ? seq[keptBefore].src : nextLen;
  }
  return seq[keptBefore - 1].src + 1;
}

/** Delete [from, to) like a word processor: text, breaks and block structure
 *  go, the formatting of what remains is preserved. */
export function slideDeleteRange(
  an: SlideTextAnalysis,
  from: number,
  to: number,
): SlideEditResult {
  const { src, kind } = an;
  if (from >= to) return { changes: [], anchor: from, head: from };
  const bounds = slideVisibleBounds(an);
  if (!bounds || (from <= bounds.from && to >= bounds.to)) {
    return { changes: wholeDocChange(src, ""), anchor: 0, head: 0 };
  }
  const before = visibleSeq(an);
  const expected = before.filter((c) => c.src < from || c.src >= to);
  const keptBefore = before.filter((c) => c.src < from).length;
  const pv = prevVisible(an, from);
  const attachRight = pv < 0 || hasStructure(an, pv + 1, from);

  // Candidate 1: drop everything but the inline syntax inside the range.
  let kept = "";
  for (let i = from; i < to; i++) {
    if (kind[i] !== SRC_INLINE_SYNTAX) continue;
    if (src[i] === "\\" && i + 1 < to && kind[i + 1] === SRC_VISIBLE) continue;
    kept += src[i];
  }
  const keptDoc = src.slice(0, from) + kept + src.slice(to);
  // Candidate 2: the same, with the syntax run around the join cleaned.
  let a = from;
  while (a > 0 && kind[a - 1] === SRC_INLINE_SYNTAX) a--;
  let b = to;
  while (b < src.length && kind[b] === SRC_INLINE_SYNTAX) b++;
  const cleanedDoc = src.slice(0, a) +
    cleanSyntaxRun(src.slice(a, from) + kept + src.slice(to, b)) + src.slice(b);
  // Candidates 3-4: the touched lines rebuilt from their remaining text.
  const pick = (i: number) =>
    i >= from && i < to ? undefined : an.srcStyle[i] ?? { bold: false, italic: false, code: false };
  // Cleaned first: an invisible leftover (`[](url)` renders nothing) would
  // verify too, and is junk.
  const candidates = [
    cleanedDoc,
    keptDoc,
    serializeRegion(an, from, to, pick, "*"),
    serializeRegion(an, from, to, pick, "_"),
  ];
  const hit = firstVerified(candidates, expected);
  const next = hit?.next ?? keptDoc;
  const seq = hit?.seq ?? visibleSeq(analyzeSlideMarkdown(next));
  const caret = caretAfterEdit(seq, Math.min(keptBefore, seq.length), attachRight, next.length);
  return { changes: wholeDocChange(src, next), anchor: caret, head: caret };
}

function hasBlockOnly(an: SlideTextAnalysis, from: number, to: number): boolean {
  let any = false;
  for (let i = from; i < to; i++) {
    if (an.kind[i] === SRC_BLOCK) any = true;
    else if (an.kind[i] !== SRC_INLINE_SYNTAX) return false;
  }
  return any;
}

/** Backspace at a caret. Undefined when plain character deletion is right
 *  (the caret is off rendered text, e.g. on a freshly typed empty line). */
export function slideBackspace(
  an: SlideTextAnalysis,
  caret: number,
): SlideEditResult | undefined {
  const line = lineBounds(an.src, caret);
  const pe = prefixEnd(an, line.start, line.end);
  // At the start of a line's text with a block prefix (`- `, `# `): the prefix
  // goes first (bullet → plain line), like a word processor.
  if (caret > line.start && caret <= pe + countSyntaxAt(an, pe) && hasBlockOnly(an, line.start, caret)) {
    const next = an.src.slice(0, line.start) + an.src.slice(pe);
    const at = line.start + (caret - pe > 0 ? caret - pe : 0);
    return { changes: wholeDocChange(an.src, next), anchor: at, head: at };
  }
  const v = prevVisible(an, caret);
  if (v < 0) return undefined;
  if (hasStructure(an, v + 1, caret)) {
    return slideDeleteRange(an, v + 1, caret);
  }
  return slideDeleteRange(an, v, caret);
}

function countSyntaxAt(an: SlideTextAnalysis, pos: number): number {
  let n = 0;
  while (pos + n < an.kind.length && an.kind[pos + n] === SRC_INLINE_SYNTAX) n++;
  return n;
}

/** Delete (forward) at a caret. */
export function slideDeleteForward(
  an: SlideTextAnalysis,
  caret: number,
): SlideEditResult | undefined {
  const w = nextVisible(an, caret);
  if (w < 0) return undefined;
  if (hasStructure(an, caret, w)) {
    return slideDeleteRange(an, caret, w);
  }
  return slideDeleteRange(an, caret, w + 1);
}

/** Escape typed text so it renders literally (pure WYSIWYG: typing `*` never
 *  starts emphasis). Block shortcuts at a line start (`- `, `1. `, `# `, `> `)
 *  are left alone on purpose: they are the autoformat convention. */
export function escapeTypedSlideText(text: string): string {
  return text.replace(/[\\*_`[\]~]/g, (c) => "\\" + c)
    .replace(/<(?=[A-Za-z/!])/g, "\\<")
    .replace(/&(?=#?[A-Za-z0-9]+;)/g, "\\&");
}

/** Type `typed` at `pos` (after any selection was deleted). The new text
 *  takes the style of the visible char before it (or after it, at the start
 *  of a line), like a word processor, and lands where it renders that way:
 *  a space typed at the end of `**bold|**` cannot go inside the delimiters
 *  (`**bold **` is not bold, it prints the asterisks), so it goes after them;
 *  a letter typed after that space joins the bold again (`**bold w**`).
 *  `want` is the typing state a toolbar toggle set with nothing selected
 *  (bold off at the end of a bold word): it overrides what would be
 *  inherited, and the text lands where it renders that way too
 *  (`**bold**x`). */
export function slideInsertText(
  an: SlideTextAnalysis,
  pos: number,
  typed: string,
  want?: Partial<Pick<SlideCharStyle, "bold" | "italic">>,
): SlideEditResult {
  const { src, kind } = an;
  const plain: SlideCharStyle = { bold: false, italic: false, code: false };
  const pv = prevVisible(an, pos);
  const nv = nextVisible(an, pos);
  // Spaces markdown trims (a trailing one) read as block structure; they do
  // not separate the typed text from the char it inherits from.
  const separated = (from: number, to: number) => {
    for (let i = from; i < to; i++) {
      if (kind[i] === SRC_BREAK || (kind[i] === SRC_BLOCK && !/[ \t]/.test(src[i]))) {
        return true;
      }
    }
    return false;
  };
  const inherited: SlideCharStyle = pv >= 0 && !separated(pv + 1, pos)
    ? an.srcStyle[pv] ?? plain
    : nv >= 0 && !separated(pos, nv)
    ? an.srcStyle[nv] ?? plain
    : plain;
  const inherit: SlideCharStyle = want === undefined || inherited.code
    ? inherited
    : { ...inherited, ...want };
  // Inside a code span text is literal: no escapes.
  const ins = inherit.code ? typed : escapeTypedSlideText(typed);
  const at = (p: number) => src.slice(0, p) + ins + src.slice(p);

  let b = pos;
  while (b < src.length && kind[b] === SRC_INLINE_SYNTAX) b++;
  let a = pos;
  while (a > 0 && kind[a - 1] === SRC_INLINE_SYNTAX) a--;

  const before = visibleSeq(an);
  const k = before.filter((c) => c.src < pos).length;
  // Whitespace markdown trimmed before the caret (a trailing space) is drawn
  // once text follows it.
  const lead = pv >= 0 && /[ \t]/.test(src.slice(pv + 1, pos).replace(/[^ \t]/g, "")) &&
      !separated(pv + 1, pos)
    ? " "
    : "";
  const added = [...(lead + typed)].filter((c) => c !== "\n").map((ch) => ({
    ch: normQuote(ch),
    style: inherit,
  }));
  const expected = [
    ...before.slice(0, k).map((c) => ({ ch: c.ch, style: c.style })),
    ...added,
    ...before.slice(k).map((c) => ({ ch: c.ch, style: c.style })),
  ];

  const positions = [pos, b, a].filter((p, i, arr) => arr.indexOf(p) === i);
  const simple = positions.map(at);
  // Last resort: rebuild the line with the typed text styled as inherited.
  const basePos = b;
  const base = analyzeSlideMarkdown(at(basePos));
  // The typed text, and any bare whitespace joining it to the char it
  // inherits from, take the inherited style.
  const from = lead && pv >= 0 ? pv + 1 : basePos;
  const pick = (i: number) =>
    i >= from && i < basePos + ins.length ? inherit : base.srcStyle[i] ?? plain;
  const rebuilt = ["*", "_"].map((em) =>
    serializeLines(base, from, basePos + ins.length, pick, em)
  );
  const hit = firstVerified([...simple, ...rebuilt], expected);
  if (!hit) {
    return { changes: [{ from: pos, to: pos, insert: ins }], anchor: pos + ins.length, head: pos + ins.length };
  }
  const si = simple.indexOf(hit.next);
  let caret: number;
  if (si >= 0) {
    caret = positions[si] + ins.length;
  } else {
    // After the last typed glyph, plus any whitespace typed after it.
    const ink = (c: { ch: string }) => !/\s/.test(c.ch);
    const inkBefore = before.slice(0, k).filter(ink).length;
    const inkTyped = added.filter(ink).length;
    const trailing = /\s*$/.exec(typed)![0].length;
    const inked = hit.seq.filter(ink);
    const last = inked[inkBefore + inkTyped - 1];
    caret = last ? last.src + 1 + trailing : basePos + ins.length;
  }
  return { changes: wholeDocChange(src, hit.next), anchor: caret, head: caret };
}

// ── Bold / italic ────────────────────────────────────────────────────────────

export type SlideStyleProp = "bold" | "italic";

/** Whether every visible char in [from, to) has `prop` (false if none). */
export function slideRangeHasStyle(
  an: SlideTextAnalysis,
  from: number,
  to: number,
  prop: SlideStyleProp,
): boolean {
  let any = false;
  for (let i = from; i < to; i++) {
    if (an.kind[i] !== SRC_VISIBLE) continue;
    any = true;
    if (!an.srcStyle[i]?.[prop]) return false;
  }
  return any;
}

/** Toggle bold/italic over [from, to): on unless the whole range already has
 *  it. Undefined when the range holds no text, or when no serialization
 *  renders exactly as intended (refused, never applied wrong). The result
 *  selects the restyled text; with `caret` (a source offset, the caret that
 *  restyled the word it sits in) it is that caret again, mapped into the new
 *  source, so typing continues where it was rather than over the word. */
export function slideToggleStyle(
  an: SlideTextAnalysis,
  from: number,
  to: number,
  prop: SlideStyleProp,
  caret?: number,
): SlideEditResult | undefined {
  const on = !slideRangeHasStyle(an, from, to, prop);
  const before = visibleSeq(an);
  const inRange = (s: number) => s >= from && s < to;
  if (!before.some((c) => inRange(c.src))) return undefined;
  const restyle = (s: number, style: SlideCharStyle): SlideCharStyle =>
    inRange(s) && !style.code ? { ...style, [prop]: on } : style;
  const expected = before.map((c) => ({ ch: c.ch, style: restyle(c.src, c.style) }));
  const pick = (i: number) =>
    restyle(i, an.srcStyle[i] ?? { bold: false, italic: false, code: false });
  const hit = firstVerified(
    [
      serializeLines(an, from, to, pick, "*"),
      serializeLines(an, from, to, pick, "_"),
    ],
    expected,
    unitTexts(an),
  );
  if (!hit) return undefined;
  const changes = wholeDocChange(an.src, hit.next);
  if (caret !== undefined) {
    const k = before.filter((c) => c.src < caret).length;
    const at = k === 0 ? hit.seq[0].src : hit.seq[k - 1].src + 1;
    return { changes, anchor: at, head: at };
  }
  const firstIdx = before.findIndex((c) => inRange(c.src));
  let lastIdx = -1;
  before.forEach((c, i) => {
    if (inRange(c.src)) lastIdx = i;
  });
  return {
    changes,
    anchor: hit.seq[firstIdx].src,
    head: hit.seq[lastIdx].src + 1,
  };
}
