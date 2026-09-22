// =============================================================================
// FASTR Markdown → Word (.docx). Two kinds of content, one document:
//
//   • Text-carrying blocks (headings, paragraphs, lists, tables, callouts,
//     quotes, steps, columns, marks) become NATIVE Word structures, so the
//     file reflows, edits and pastes into a ministry's own template.
//   • The decorative blocks (cover, band, tiles, card, stat) have no Word
//     equivalent. The client asks the server's headless Chrome to rasterize
//     each one (server/report_pdf/rasterize_blocks.ts) with its glyphs hidden,
//     and to MEASURE where every text element sits; the document then carries
//     the picture behind an anchor paragraph and one editable text box per
//     text element on top of it, in the same font, size, colour and place.
//
// DOM-free, like the markdown compiler: the builder walks markdown-it's token
// stream (createFastrMarkdownIt, report_fastr_markdown.ts) rather than the
// rendered HTML, so the Deno tests build documents from fixture bodies with no
// browser, and the container attrs arrive parsed rather than scraped.
//
// What the measure script runs against is the same standalone document the
// PDF prints (buildStandaloneReportHtml), laid out at the print column's
// width by buildFastrWordRasterCss, so a band's PNG is the width of the
// printed band and its text sits where print put it.
// =============================================================================

import type MarkdownIt from "markdown-it";
import {
  AlignmentType,
  BorderStyle,
  BuilderElement,
  Column,
  ColumnBreak,
  Document,
  ExternalHyperlink,
  Footer,
  HeadingLevel,
  HorizontalPositionRelativeFrom,
  ImageRun,
  LevelFormat,
  LineRuleType,
  PageBreak,
  PageNumber,
  PageOrientation,
  Paragraph,
  Run,
  SectionType,
  ShadingType,
  Tab,
  Table,
  TableCell,
  TableLayoutType,
  TableOfContents,
  TableRow,
  TabStopType,
  TextRun,
  TextWrappingType,
  VerticalPositionRelativeFrom,
  WidthType,
  type IBorderOptions,
  type IParagraphOptions,
  type IPropertiesOptions,
  type ISectionPropertiesOptions,
  type ParagraphChild,
} from "docx";
import {
  type FastrContainerAttrs,
  fastrBreakMode,
  fastrPageMarginPx,
  type FastrPageSetup,
  fastrSheetPx,
  fastrSurfaceTone,
  fastrTocOptions,
  type FastrMarkAttrs,
  isFastrLeafBlock,
  readFastrDocumentSettings,
} from "./fastr_markdown_blocks.ts";
import { fastrAccentTextFor, fastrDerivedColorsFor } from "./report_fastr_css.ts";
import type { FastrPagedFooter } from "./report_fastr_paged.ts";
import {
  FASTR_THEME_TOKENS,
  type FastrGround,
  type FastrReportTheme,
  type FastrThemeColorOverride,
  type FastrThemeSemantic,
  mixFastrColor,
} from "./types/report_fastr_themes.ts";

type Token = ReturnType<MarkdownIt["parse"]>[number];

// ── Contracts with the rasterizer ─────────────────────────────────────────────

// The blocks that become pictures with text boxes over them. Anything nested
// inside one of these is part of its picture.
export const FASTR_WORD_RASTER_BLOCKS = ["cover", "band", "tiles", "card", "stat"] as const;
export type FastrWordRasterKind = (typeof FASTR_WORD_RASTER_BLOCKS)[number];

// The class the server toggles on a block to hide its glyphs before the
// screenshot; the rule ships in buildFastrWordRasterCss.
export const FASTR_WORD_HIDE_CLASS = "fm-word-hide";

// One run of text inside a measured element, as Chrome computed it.
export type FastrWordRasterRun = {
  // Whitespace collapsed like CSS; "" with break for a <br>.
  text: string;
  break?: true;
  // First family of the computed font-family, quotes stripped.
  fontFamily: string;
  fontSizePx: number;
  // Computed font-weight >= 600.
  bold: boolean;
  italic: boolean;
  // "rrggbb".
  color: string;
  // 0 for "normal".
  letterSpacingPx: number;
  underline: boolean;
  // text-transform: uppercase; the text stays as authored, Word applies caps.
  allCaps: boolean;
};

// One text element (heading, paragraph, item, kicker, dek, stat value/label/
// delta, card title, caption, cell, citation).
export type FastrWordRasterText = {
  // Content box, CSS px, relative to the block's border box.
  left: number;
  top: number;
  width: number;
  height: number;
  align: "left" | "center" | "right" | "justify";
  lineHeightPx: number;
  runs: FastrWordRasterRun[];
};

export type FastrWordRasterBlock = {
  // token.map[0], the 0-based source line of the fence == its data-line.
  id: number;
  kind: FastrWordRasterKind;
  // CSS px of the border box; the PNG is 2x.
  widthPx: number;
  heightPx: number;
  // The block's left edge relative to the text column's (negative for a band,
  // which bleeds into the margins), and its vertical margins, CSS px.
  leftPx: number;
  marginTopPx: number;
  marginBottomPx: number;
  // base64 PNG.
  png: string;
  texts: FastrWordRasterText[];
};

export type FastrWordRasterMeta = Omit<FastrWordRasterBlock, "png">;

// Which blocks of a body the rasterizer must picture: every decorative block
// that is not inside another decorative block, by its fence line.
export function fastrWordRasterBlockIds(
  tokens: readonly Token[],
): { id: number; kind: FastrWordRasterKind }[] {
  const out: { id: number; kind: FastrWordRasterKind }[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.type !== "fm_container_open") continue;
    const kind = rasterKindOf(t);
    if (kind === undefined || t.map === null) continue;
    out.push({ id: t.map[0], kind });
    i = matchingClose(tokens, i);
  }
  return out;
}

function rasterKindOf(t: Token): FastrWordRasterKind | undefined {
  const name = containerName(t);
  return (FASTR_WORD_RASTER_BLOCKS as readonly string[]).includes(name)
    ? name as FastrWordRasterKind
    : undefined;
}

function containerName(t: Token): string {
  return (t.meta as { name?: string } | undefined)?.name ?? "";
}
function containerAttrs(t: Token): FastrContainerAttrs {
  return (t.meta as { attrs?: FastrContainerAttrs } | undefined)?.attrs ?? {};
}

// Index of the fm_container_close that closes the open at `i`.
function matchingClose(tokens: readonly Token[], i: number): number {
  const level = tokens[i].level;
  for (let k = i + 1; k < tokens.length; k++) {
    const t = tokens[k];
    if (t.type === "fm_container_close" && t.level === level) return k;
  }
  return tokens.length - 1;
}

// ── The raster frame ──────────────────────────────────────────────────────────

// Appended after the theme sheet in the document the rasterizer loads: the
// same geometry as the printed page (report_fastr_paged.ts), without Paged.js.
// The body is the text column; a band's negative bleed margin takes it to the
// sheet's edge and its bleed pad brings its text back to the column, exactly
// as print does, so a band's PNG is a printed band. A filling cover is a
// whole sheet. The glyph-hiding rule ships here so the server only toggles a
// class: fill-color rather than visibility or color, so layout, backgrounds,
// currentColor rules, bullets and counters (pseudo-elements) stay painted and
// only the text nodes' glyphs vanish, which are exactly what the text boxes
// carry.
export function buildFastrWordRasterCss(page: FastrPageSetup): string {
  const [w, h] = fastrSheetPx(page);
  const m = fastrPageMarginPx(page.margin);
  const column = w - 2 * m;
  return `/* ── Word raster frame ─────────────────────────────────────────────────── */
html { overflow: visible; --fm-page-area: ${h - 2 * m}px; }
html, body { max-width: none; }
body { width: ${column}px; margin: 0 auto; padding: 0; }
:root, body, .fm-doc--wide, .fm-doc--full {
  --fm-measure: 100%;
  --fm-bleed-margin: -${m}px;
  --fm-bleed-pad: ${m}px;
  --fm-print-column: ${column}px;
  --fm-print-area: ${h - 2 * m}px;
}
.fm-band.fm-cover { min-height: 544px; margin-top: 0; }
.fm-band.fm-cover.fm-cover--fill { min-height: ${h}px; box-sizing: border-box; margin-top: 0; margin-bottom: 0; }
.${FASTR_WORD_HIDE_CLASS}, .${FASTR_WORD_HIDE_CLASS} * {
  -webkit-text-fill-color: transparent !important;
  text-decoration-color: transparent !important;
}
.${FASTR_WORD_HIDE_CLASS}::before, .${FASTR_WORD_HIDE_CLASS}::after,
.${FASTR_WORD_HIDE_CLASS} *::before, .${FASTR_WORD_HIDE_CLASS} *::after {
  -webkit-text-fill-color: currentcolor !important;
}
`;
}

// The selector for a block by its fence line: the outermost element carrying
// that anchor (a fence is one line, so it is unique).
export function fastrWordBlockSelector(id: number): string {
  return `[data-line="${id}"]:not([data-line="${id}"] *)`;
}

// The in-page measure function, as source: `(function (id) { ... })`, so the
// server evaluates `${fastrWordMeasureJs()}(${id})`. Plain ES5-ish on purpose
// (inlined into a page, not bundled). Returns a FastrWordRasterMeta without
// `kind`, or null when the block is not in the document.
export function fastrWordMeasureJs(): string {
  return `(function (id) {
  var sel = '[data-line="' + id + '"]:not([data-line="' + id + '"] *)';
  var root = document.querySelector(sel);
  if (!root) return null;
  var rootRect = root.getBoundingClientRect();
  var bodyRect = document.body.getBoundingClientRect();
  var rootStyle = window.getComputedStyle(root);
  function isInlineDisplay(el) {
    var d = window.getComputedStyle(el).display;
    return d === "inline" || d === "contents";
  }
  function blank(s) { return s.replace(/\\s+/g, "").length === 0; }
  // Own text: a text node, or text inside an inline descendant.
  function hasOwnText(el) {
    for (var n = el.firstChild; n; n = n.nextSibling) {
      if (n.nodeType === 3 && !blank(n.nodeValue)) return true;
      if (n.nodeType === 1 && isInlineDisplay(n) && hasOwnText(n)) return true;
    }
    return false;
  }
  // A computed colour as channels. Chrome serializes legacy colours as
  // rgb()/rgba() and a color-mix() result (the muted ink, a pill) as
  // color(srgb r g b / a); anything else goes through a canvas, which
  // normalizes whatever it can paint.
  var canvasCtx = null;
  function parseColor(css) {
    css = (css || "").trim();
    var m = /^rgba?\\(([^)]+)\\)$/.exec(css);
    if (m) {
      var p = m[1].split(/[\\s,\\/]+/).filter(function (x) { return x.length > 0; }).map(parseFloat);
      if (p.length >= 3) return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
    }
    m = /^color\\(srgb\\s+([^)]+)\\)$/.exec(css);
    if (m) {
      var q = m[1].replace("/", " ").split(/\\s+/).filter(function (x) { return x.length > 0; })
        .map(function (x) { return x === "none" ? 0 : parseFloat(x); });
      if (q.length >= 3) return { r: q[0] * 255, g: q[1] * 255, b: q[2] * 255, a: q.length > 3 ? q[3] : 1 };
    }
    m = /^#([0-9a-f]{6})$/i.exec(css);
    if (m) return { r: parseInt(m[1].slice(0, 2), 16), g: parseInt(m[1].slice(2, 4), 16), b: parseInt(m[1].slice(4, 6), 16), a: 1 };
    try {
      if (!canvasCtx) canvasCtx = document.createElement("canvas").getContext("2d");
      canvasCtx.fillStyle = "#010203";
      canvasCtx.fillStyle = css;
      var s = canvasCtx.fillStyle;
      if (s !== css) return parseColor(s);
    } catch (e) { /* not a colour */ }
    return null;
  }
  function over(top, bottom) {
    var a = top.a;
    return { r: top.r * a + bottom.r * (1 - a), g: top.g * a + bottom.g * (1 - a), b: top.b * a + bottom.b * (1 - a), a: 1 };
  }
  // The opaque colour behind an element: its ancestors' grounds composited
  // down to the page (white when nothing paints).
  function groundBehind(el) {
    var layers = [];
    for (var e = el; e; e = e.parentElement) {
      var c = parseColor(window.getComputedStyle(e).backgroundColor);
      if (c && c.a > 0) { layers.push(c); if (c.a >= 1) break; }
    }
    var out = { r: 255, g: 255, b: 255, a: 1 };
    for (var i = layers.length - 1; i >= 0; i--) out = over(layers[i], out);
    return out;
  }
  // Word has no alpha: a translucent ink is composited on what is behind it.
  function hexOf(css, el) {
    var c = parseColor(css);
    if (!c) return "000000";
    if (c.a < 1) c = over(c, groundBehind(el));
    return [c.r, c.g, c.b].map(function (v) {
      var s = Math.max(0, Math.min(255, Math.round(v))).toString(16);
      return s.length < 2 ? "0" + s : s;
    }).join("");
  }
  function styleOf(el) {
    var cs = window.getComputedStyle(el);
    var fam = (cs.fontFamily || "").split(",")[0].replace(/["']/g, "").trim();
    var ls = parseFloat(cs.letterSpacing);
    return {
      fontFamily: fam,
      fontSizePx: parseFloat(cs.fontSize) || 16,
      bold: (parseInt(cs.fontWeight, 10) || 400) >= 600,
      italic: cs.fontStyle === "italic" || cs.fontStyle === "oblique",
      color: hexOf(cs.color, el),
      letterSpacingPx: isFinite(ls) ? ls : 0,
      underline: (cs.textDecorationLine || "").indexOf("underline") >= 0,
      allCaps: cs.textTransform === "uppercase"
    };
  }
  function runsOf(host) {
    var runs = [];
    function walk(el) {
      for (var n = el.firstChild; n; n = n.nextSibling) {
        if (n.nodeType === 3) {
          var text = n.nodeValue.replace(/\\s+/g, " ");
          if (text.length === 0) continue;
          var st = styleOf(n.parentElement || host);
          st.text = text;
          runs.push(st);
        } else if (n.nodeType === 1) {
          if (n.tagName === "BR") { runs.push({ text: "", break: true, fontFamily: "", fontSizePx: 0, bold: false, italic: false, color: "000000", letterSpacingPx: 0, underline: false, allCaps: false }); continue; }
          if (!isInlineDisplay(n)) continue;
          walk(n);
        }
      }
    }
    walk(host);
    // Trim the edges: leading and trailing whitespace is nothing on a line.
    var out = [];
    for (var i = 0; i < runs.length; i++) {
      var r = runs[i];
      if (i === 0 || (i > 0 && runs[i - 1].break)) r.text = r.text.replace(/^ +/, "");
      if (i === runs.length - 1 || (i + 1 < runs.length && runs[i + 1].break)) r.text = r.text.replace(/ +$/, "");
      if (r.text.length === 0 && !r.break) continue;
      out.push(r);
    }
    return out;
  }
  var texts = [];
  var all = [root].concat(Array.prototype.slice.call(root.querySelectorAll("*")));
  for (var i = 0; i < all.length; i++) {
    var el = all[i];
    if (isInlineDisplay(el)) continue;
    if (!hasOwnText(el)) continue;
    var cs = window.getComputedStyle(el);
    var rect = el.getBoundingClientRect();
    var pl = parseFloat(cs.paddingLeft) || 0, pr = parseFloat(cs.paddingRight) || 0;
    var pt = parseFloat(cs.paddingTop) || 0, pb = parseFloat(cs.paddingBottom) || 0;
    var bl = parseFloat(cs.borderLeftWidth) || 0, br = parseFloat(cs.borderRightWidth) || 0;
    var bt = parseFloat(cs.borderTopWidth) || 0, bb = parseFloat(cs.borderBottomWidth) || 0;
    var ta = cs.textAlign;
    var align = ta === "center" ? "center" : (ta === "right" || ta === "end") ? "right" : ta === "justify" ? "justify" : "left";
    var lh = parseFloat(cs.lineHeight);
    if (!isFinite(lh)) lh = (parseFloat(cs.fontSize) || 16) * 1.2;
    var runs = runsOf(el);
    if (runs.length === 0) continue;
    texts.push({
      left: rect.left - rootRect.left + bl + pl,
      top: rect.top - rootRect.top + bt + pt,
      width: Math.max(1, rect.width - bl - br - pl - pr),
      height: Math.max(1, rect.height - bt - bb - pt - pb),
      align: align,
      lineHeightPx: lh,
      runs: runs
    });
  }
  return {
    id: id,
    widthPx: rootRect.width,
    heightPx: rootRect.height,
    leftPx: rootRect.left - bodyRect.left,
    marginTopPx: parseFloat(rootStyle.marginTop) || 0,
    marginBottomPx: parseFloat(rootStyle.marginBottom) || 0,
    texts: texts
  };
})`;
}

// ── Units and colours ─────────────────────────────────────────────────────────

const BODY_PX = 16;
// Half-points, twips and EMU from CSS px at 96dpi.
export function fastrWordHalfPoints(px: number): number {
  return Math.round(px * 1.5);
}
export function fastrWordTwips(px: number): number {
  return Math.round(px * 15);
}
function emu(px: number): number {
  return Math.round(px * 9525);
}
function pt(px: number): number {
  return Math.round(px * 75) / 100;
}

const NAMED_HEX: Record<string, string> = {
  transparent: "ffffff",
  white: "ffffff",
  black: "000000",
  silver: "c0c0c0",
  gray: "808080",
  grey: "808080",
  red: "ff0000",
  maroon: "800000",
  orange: "ffa500",
  yellow: "ffff00",
  olive: "808000",
  lime: "00ff00",
  green: "008000",
  teal: "008080",
  aqua: "00ffff",
  cyan: "00ffff",
  blue: "0000ff",
  navy: "000080",
  purple: "800080",
  fuchsia: "ff00ff",
  magenta: "ff00ff",
  pink: "ffc0cb",
  brown: "a52a2a",
  beige: "f5f5dc",
  ivory: "fffff0",
  gold: "ffd700",
  indigo: "4b0082",
  violet: "ee82ee",
  khaki: "f0e68c",
  salmon: "fa8072",
  tan: "d2b48c",
  turquoise: "40e0d0",
  crimson: "dc143c",
};

// A CSS colour as Word's "rrggbb", or undefined when it cannot be expressed
// (a gradient, a var()).
export function cssColorToHex(v: string | undefined): string | undefined {
  if (v === undefined) return undefined;
  const t = v.trim().toLowerCase();
  const hex = /^#([0-9a-f]{3,8})$/.exec(t);
  if (hex) {
    const h = hex[1];
    if (h.length === 3 || h.length === 4) {
      return h.slice(0, 3).split("").map((c) => c + c).join("");
    }
    if (h.length === 6 || h.length === 8) return h.slice(0, 6);
    return undefined;
  }
  const fn = /^rgba?\(([^)]+)\)$/.exec(t);
  if (fn) {
    const p = fn[1].split(/[\s,/]+/).filter((x) => x.length > 0).map(parseFloat);
    if (p.length < 3 || p.slice(0, 3).some((x) => Number.isNaN(x))) return undefined;
    return p.slice(0, 3).map((x) =>
      Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, "0")
    ).join("");
  }
  return NAMED_HEX[t];
}

function hexOrUndefined(v: string): string | undefined {
  return cssColorToHex(v);
}

// ── Palette: the colours in scope, re-scoped by tones like the stylesheet ─────

type Palette = {
  ground: string;
  ink: string;
  inkMuted: string;
  accent: string;
  accentText: string;
  border: string;
  surface: string;
  surfaceAlt: string;
  semantic: FastrThemeSemantic;
  // On the accent and warm grounds a hue-named mark returns to the ink
  // (markOnFlatGroundCss).
  flat: boolean;
  // Whether the ground is dark: which status set reads on it.
  dark: boolean;
};

type Derived = ReturnType<typeof fastrDerivedColorsFor>;

function basePalette(c: Derived): Palette {
  const dark = c.scheme === "dark";
  return {
    ground: c.page,
    ink: c.ink,
    inkMuted: c.inkMuted,
    accent: c.accent,
    accentText: fastrAccentTextFor(c.accent, c.surfaceAlt, c.ink),
    border: c.border,
    surface: c.surface,
    surfaceAlt: c.surfaceAlt,
    semantic: dark ? c.semanticOnDark : c.semanticOnLight,
    flat: false,
    dark,
  };
}

// toneRuleCss, as colours: the ground's ink, and the muted ink, border and
// surfaces as that ink mixed into the ground at the same opacities.
function tonePalette(c: Derived, base: Palette, tone: FastrGround): Palette {
  const g = c.grounds[tone];
  const dark = g.ink === c.lightInk;
  const paper = tone === "paper";
  return {
    ground: g.color,
    ink: g.ink,
    inkMuted: mixFastrColor(g.ink, g.color, 0.28),
    accent: paper ? c.grounds.accent.color : g.ink,
    accentText: paper ? base.accentText : g.ink,
    border: mixFastrColor(g.ink, g.color, 0.74),
    surface: mixFastrColor(g.ink, g.color, 0.9),
    surfaceAlt: mixFastrColor(g.ink, g.color, 0.84),
    semantic: dark ? c.semanticOnDark : c.semanticOnLight,
    flat: tone === "accent" || tone === "warm",
    dark,
  };
}

// ── The build ─────────────────────────────────────────────────────────────────

export type FastrWordFigure = {
  bytes: Uint8Array;
  width: number;
  height: number;
  type: "png" | "jpg" | "gif" | "bmp";
};

export type FastrWordFont = {
  // The family name the CSS uses ("Inter", "IBM Plex Sans").
  name: string;
  // TrueType bytes.
  data: Uint8Array;
  // The face's weight: a heading family embedded at 700 must not be bolded
  // again by Word on top of the face.
  weight: number;
};

export type FastrWordBuildInput = {
  tokens: readonly Token[];
  body: string;
  title: string;
  theme: FastrReportTheme;
  colors?: FastrThemeColorOverride;
  footer: FastrPagedFooter;
  rasters: ReadonlyMap<number, FastrWordRasterBlock>;
  figure: (id: string) => FastrWordFigure | undefined;
  image: (id: string) => FastrWordFigure | undefined;
  fonts?: readonly FastrWordFont[];
};

type Block = Paragraph | Table | TableOfContents;

type SectionDraft = {
  kind: "normal" | "cover" | "columns";
  column?: { count: number; widths: number[]; space: number };
  children: Block[];
};

// The run formatting in scope: a base per block, modified by inline tokens.
type RunStyle = {
  font: string;
  size: number;
  color: string | undefined;
  bold?: boolean;
  italics?: boolean;
  strike?: boolean;
  underline?: boolean;
  allCaps?: boolean;
  characterSpacing?: number;
  shading?: string;
};

// What a containing block lends to the paragraphs inside it.
type Decoration = {
  borderLeft?: IBorderOptions;
  borderBottom?: IBorderOptions;
  indentLeft?: number;
  run?: Partial<RunStyle>;
  shading?: string;
  line?: number;
  align?: (typeof AlignmentType)[keyof typeof AlignmentType];
};

type ListFrame = {
  reference: "fm-bullets" | "fm-numbers";
  instance: number;
  level: number;
  // The first paragraph of the current item carries the number.
  itemFresh: boolean;
};

const HEADING_EM: Record<string, number> = { h1: 2.15, h2: 1.55, h3: 1.2, h4: 1, h5: 1, h6: 1 };
const HEADING_LEVELS = [
  HeadingLevel.HEADING_1,
  HeadingLevel.HEADING_2,
  HeadingLevel.HEADING_3,
  HeadingLevel.HEADING_4,
  HeadingLevel.HEADING_5,
  HeadingLevel.HEADING_6,
];
const MONO_FONT = "Consolas";
const COLUMN_GAP_PX = 24;

function firstFamily(stack: string): string {
  return stack.split(",")[0].replace(/["']/g, "").trim();
}

function noBorder(): IBorderOptions {
  return { style: BorderStyle.NONE, size: 0, color: "auto" };
}

function noBorders() {
  return {
    top: noBorder(),
    bottom: noBorder(),
    left: noBorder(),
    right: noBorder(),
    insideHorizontal: noBorder(),
    insideVertical: noBorder(),
  };
}

// A VML text box as a RUN, so several can hang off one anchor paragraph with
// the picture. docx's own Textbox is a paragraph with a filled, stroked,
// auto-inset, grow-to-fit shape and no way to change any of that; this one is
// unfilled, unstroked, zero-inset and placed by absolute offsets relative to
// the anchor paragraph and the column (or the page, for a filling cover).
// mso-fit-shape-to-text lets the box grow downward when someone types more,
// so an edit shows rather than clips.
export class FastrTextboxRun extends Run {
  constructor(o: {
    id: number;
    leftPt: number;
    topPt: number;
    widthPt: number;
    heightPt: number;
    relative: "text" | "page";
    children: Paragraph[];
  }) {
    super({});
    const style = [
      "position:absolute",
      `margin-left:${o.leftPt}pt`,
      `margin-top:${o.topPt}pt`,
      `width:${o.widthPt}pt`,
      `height:${o.heightPt}pt`,
      `z-index:${251659264 + o.id}`,
      "mso-position-horizontal:absolute",
      `mso-position-horizontal-relative:${o.relative}`,
      "mso-position-vertical:absolute",
      `mso-position-vertical-relative:${o.relative}`,
      "mso-wrap-style:none",
    ].join(";");
    this.root.push(
      new BuilderElement({
        name: "w:pict",
        children: [
          new BuilderElement({
            name: "v:shape",
            attributes: {
              id: { key: "id", value: `fmtb${o.id}` },
              type: { key: "type", value: "#_x0000_t202" },
              filled: { key: "filled", value: "f" },
              stroked: { key: "stroked", value: "f" },
              style: { key: "style", value: style },
            },
            children: [
              new BuilderElement({
                name: "v:textbox",
                attributes: {
                  insetmode: { key: "insetmode", value: "custom" },
                  inset: { key: "inset", value: "0,0,0,0" },
                  style: { key: "style", value: "mso-fit-shape-to-text:t" },
                },
                children: [
                  new BuilderElement({ name: "w:txbxContent", children: o.children }),
                ],
              }),
            ],
          }),
        ],
      }),
    );
  }
}

class Builder {
  private readonly tokens: readonly Token[];
  private readonly input: FastrWordBuildInput;
  private readonly c: Derived;
  private readonly page: FastrPageSetup;
  private readonly sheetPx: [number, number];
  private readonly marginPx: number;
  private readonly columnPx: number;
  private readonly bodyFont: string;
  private readonly headingFont: string;
  private readonly headingWeight: number;
  private readonly headingTracking: string;
  private readonly headingCaps: boolean;
  private readonly numbered: boolean;
  private readonly pageGround: { color: string; palette: Palette } | undefined;
  private readonly embeddedWeight = new Map<string, number>();

  private sections: SectionDraft[] = [];
  private sinks: Block[][] = [];
  private palettes: Palette[] = [];
  private decorations: Decoration[] = [];
  private widths: number[] = [];
  private lists: ListFrame[] = [];
  private instances = { bullets: 0, numbers: 0, steps: 0 };
  private steps: { instance: number; level: number }[] = [];
  private depth = 0;
  private sec = 0;
  private sub = 0;
  private pendingBreak = false;
  private emitted = false;
  private hasToc = false;
  private textboxSeq = 0;
  // In a columns section: the left edge of the current col, px from the
  // text column's left, so a picture inside it is placed within the col.
  private colLeftPx = 0;

  constructor(input: FastrWordBuildInput) {
    this.tokens = input.tokens;
    this.input = input;
    const tokens = FASTR_THEME_TOKENS[input.theme] ?? FASTR_THEME_TOKENS.default;
    this.c = fastrDerivedColorsFor(tokens, input.colors);
    const settings = readFastrDocumentSettings(input.body);
    this.page = settings.page;
    this.sheetPx = fastrSheetPx(this.page);
    this.marginPx = fastrPageMarginPx(this.page.margin);
    this.columnPx = this.sheetPx[0] - 2 * this.marginPx;
    this.bodyFont = firstFamily(tokens.fontBody);
    this.headingFont = firstFamily(tokens.fontHeading);
    this.headingWeight = Number.parseInt(tokens.headingWeight, 10) || 700;
    this.headingTracking = tokens.headingTracking;
    this.headingCaps = tokens.headingCase === "uppercase";
    this.numbered = settings.className.includes("fm-doc--numbered");
    for (const f of input.fonts ?? []) this.embeddedWeight.set(f.name, f.weight);
    const base = basePalette(this.c);
    this.pageGround = this.readPageGround(settings.className, settings.style, base);
    this.palettes.push(this.pageGround?.palette ?? base);
    this.widths.push(this.columnPx);
    this.openSection("normal");
  }

  // `background=ink|accent|warm` (a tone class on the document root) or a
  // literal colour: Word's page colour, with the ink the sheet would use.
  private readPageGround(
    className: string,
    style: string,
    base: Palette,
  ): { color: string; palette: Palette } | undefined {
    const tone = /fm-tone--(paper|ink|accent|warm)/.exec(className)?.[1] as FastrGround | undefined;
    if (tone !== undefined && tone !== "paper") {
      const palette = tonePalette(this.c, base, tone);
      return { color: palette.ground, palette };
    }
    const literal = /background-color:\s*([^;]+)/.exec(style)?.[1];
    const hex = cssColorToHex(literal);
    if (hex === undefined) return undefined;
    const light = className.includes("fm-ink--light");
    const dark = className.includes("fm-ink--dark");
    const ink = light ? this.c.lightInk : dark ? this.c.darkInk : base.ink;
    const ground = `#${hex}`;
    return {
      color: ground,
      palette: {
        ...base,
        ground,
        ink,
        inkMuted: mixFastrColor(ink, ground, 0.28),
        border: mixFastrColor(ink, ground, 0.74),
        surface: mixFastrColor(ink, ground, 0.9),
        surfaceAlt: mixFastrColor(ink, ground, 0.84),
        dark: light,
      },
    };
  }

  // ── Output plumbing ───────────────────────────────────────────────────────

  private get pal(): Palette {
    return this.palettes[this.palettes.length - 1];
  }
  private get width(): number {
    return this.widths[this.widths.length - 1];
  }
  private get sink(): Block[] {
    return this.sinks[this.sinks.length - 1];
  }
  private get section(): SectionDraft {
    return this.sections[this.sections.length - 1];
  }

  private openSection(kind: SectionDraft["kind"], column?: SectionDraft["column"]): void {
    const current = this.sections[this.sections.length - 1];
    // An empty section is replaced rather than left as a blank page.
    if (current !== undefined && current.children.length === 0 && this.sinks.length <= 1) {
      this.sections.pop();
    }
    const draft: SectionDraft = { kind, column, children: [] };
    this.sections.push(draft);
    this.sinks = [draft.children];
  }

  private push(block: Block): void {
    this.sink.push(block);
    this.emitted = true;
  }

  private takeBreak(): boolean {
    const b = this.pendingBreak;
    this.pendingBreak = false;
    return b;
  }

  private baseRun(): RunStyle {
    const p = this.pal;
    return { font: this.bodyFont, size: fastrWordHalfPoints(BODY_PX), color: hexOrUndefined(p.ink) };
  }

  // The run base and paragraph properties the enclosing blocks lend.
  private decorated(): { run: RunStyle; opts: Record<string, unknown>; line: number | undefined } {
    let run = this.baseRun();
    const opts: Record<string, unknown> = {};
    let indent = 0;
    let line: number | undefined;
    const borders: Record<string, IBorderOptions> = {};
    for (const d of this.decorations) {
      if (d.run) run = { ...run, ...d.run };
      if (d.indentLeft) indent += d.indentLeft;
      if (d.borderLeft) borders.left = d.borderLeft;
      if (d.borderBottom) borders.bottom = d.borderBottom;
      if (d.shading) opts.shading = { type: ShadingType.CLEAR, fill: d.shading, color: "auto" };
      if (d.line) line = d.line;
      if (d.align) opts.alignment = d.align;
    }
    if (indent > 0) opts.indent = { left: indent };
    if (Object.keys(borders).length > 0) opts.border = borders;
    return { run, opts, line };
  }

  private paragraph(
    children: ParagraphChild[],
    extra: Partial<IParagraphOptions> = {},
    spacing: { before?: number; after?: number; line?: number } = {},
  ): Paragraph {
    const { opts, line } = this.decorated();
    const list = this.lists[this.lists.length - 1];
    let numbering: IParagraphOptions["numbering"];
    if (list !== undefined) {
      if (list.itemFresh) {
        numbering = { reference: list.reference, level: list.level, instance: list.instance };
        list.itemFresh = false;
      } else {
        opts.indent = { left: 336 * (list.level + 1) };
      }
    }
    const steps = this.steps[this.steps.length - 1];
    if (steps !== undefined && this.depth === steps.level + 1 && numbering === undefined) {
      numbering = { reference: "fm-steps", level: 0, instance: steps.instance };
    }
    return new Paragraph({
      ...(opts as Partial<IParagraphOptions>),
      ...extra,
      numbering: extra.numbering ?? numbering,
      pageBreakBefore: extra.pageBreakBefore ?? this.takeBreak(),
      spacing: {
        before: spacing.before ?? 0,
        after: spacing.after ?? fastrWordTwips(BODY_PX),
        line: spacing.line ?? line ?? 372,
        ...(extra.spacing ?? {}),
      },
      children,
    });
  }

  // ── Inline ────────────────────────────────────────────────────────────────

  private textRun(text: string, s: RunStyle): TextRun {
    return new TextRun({
      text,
      font: s.font,
      size: s.size,
      color: s.color,
      bold: s.bold === true && !this.embeddedIsBold(s.font),
      italics: s.italics === true,
      strike: s.strike === true,
      underline: s.underline === true ? {} : undefined,
      allCaps: s.allCaps === true,
      characterSpacing: s.characterSpacing,
      shading: s.shading === undefined
        ? undefined
        : { type: ShadingType.CLEAR, fill: s.shading, color: "auto" },
    });
  }

  // A family embedded at a bold weight is already bold: Word must not
  // synthesize a second bold on top of the face.
  private embeddedIsBold(font: string): boolean {
    return (this.embeddedWeight.get(font) ?? 400) >= 600;
  }

  private markStyle(s: RunStyle, m: FastrMarkAttrs): RunStyle {
    const p = this.pal;
    const out: RunStyle = { ...s };
    if (m.role !== undefined) {
      switch (m.role) {
        case "accent":
          out.color = hexOrUndefined(p.accentText);
          if (p.accentText === p.ink) out.bold = true;
          break;
        case "muted":
          out.color = hexOrUndefined(p.inkMuted);
          break;
        default:
          out.color = hexOrUndefined(p.flat ? p.ink : p.semantic[m.role]);
      }
    }
    if (m.color !== undefined) out.color = cssColorToHex(m.color) ?? out.color;
    if (m.highlight !== undefined) out.shading = cssColorToHex(m.highlight);
    if (m.size !== undefined) out.size = Math.round(m.size * 2);
    if (m.underline === true) out.underline = true;
    return out;
  }

  private inline(children: readonly Token[], base: RunStyle): ParagraphChild[] {
    const out: ParagraphChild[] = [];
    const stack: RunStyle[] = [base];
    const cur = () => stack[stack.length - 1];
    let link: { href: string; children: ParagraphChild[] } | undefined;
    const emit = (r: ParagraphChild) => (link ? link.children : out).push(r);
    for (let i = 0; i < children.length; i++) {
      const t = children[i];
      switch (t.type) {
        case "text":
          emit(this.textRun(t.content, cur()));
          break;
        case "softbreak":
        case "hardbreak":
          emit(new TextRun({ break: 1 }));
          break;
        case "strong_open":
          stack.push({ ...cur(), bold: true });
          break;
        case "em_open":
          stack.push({ ...cur(), italics: true });
          break;
        case "s_open":
          stack.push({ ...cur(), strike: true });
          break;
        case "fm_mark_open":
          stack.push(this.markStyle(cur(), (t.meta ?? {}) as FastrMarkAttrs));
          break;
        case "strong_close":
        case "em_close":
        case "s_close":
        case "fm_mark_close":
          if (stack.length > 1) stack.pop();
          break;
        case "code_inline":
          emit(this.textRun(t.content, {
            ...cur(),
            font: MONO_FONT,
            size: Math.round(cur().size * 0.9),
            shading: hexOrUndefined(this.pal.surfaceAlt),
          }));
          break;
        case "link_open": {
          const href = t.attrGet("href") ?? "";
          link = { href, children: [] };
          stack.push({ ...cur(), color: hexOrUndefined(this.pal.accent), underline: true });
          break;
        }
        case "link_close": {
          if (stack.length > 1) stack.pop();
          if (link !== undefined) {
            const l = link;
            link = undefined;
            if (/^https?:|^mailto:/i.test(l.href)) {
              out.push(new ExternalHyperlink({ link: l.href, children: l.children }));
            } else {
              out.push(...l.children);
            }
          }
          break;
        }
        case "image": {
          const run = this.inlineImage(t);
          if (run !== undefined) emit(run);
          else emit(this.textRun(inlineText(t.children ?? []), cur()));
          break;
        }
        case "html_inline":
          if (/^<br\s*\/?>$/i.test(t.content.trim())) emit(new TextRun({ break: 1 }));
          else {
            const text = stripTags(t.content);
            if (text.length > 0) emit(this.textRun(text, cur()));
          }
          break;
        default:
          break;
      }
    }
    if (link !== undefined) out.push(...link.children);
    return out;
  }

  // ── Figures ───────────────────────────────────────────────────────────────

  private resolveEmbed(src: string): FastrWordFigure | undefined {
    const m = /^(figure|image):(.+)$/.exec(src);
    if (!m) return undefined;
    return m[1] === "figure" ? this.input.figure(m[2]) : this.input.image(m[2]);
  }

  private imageSize(fig: FastrWordFigure): { width: number; height: number } {
    // The column, and the sheet's 42% cap on a figure's height, like the
    // sheet; a capped figure narrows with its aspect kept.
    const maxW = this.width;
    const maxH = 0.42 * (this.sheetPx[1] - 2 * this.marginPx);
    let w = Math.min(maxW, fig.width);
    let h = w * fig.height / fig.width;
    if (h > maxH) {
      h = maxH;
      w = h * fig.width / fig.height;
    }
    return { width: Math.round(w), height: Math.round(h) };
  }

  private inlineImage(t: Token): ImageRun | undefined {
    const fig = this.resolveEmbed(t.attrGet("src") ?? "");
    if (fig === undefined) return undefined;
    return new ImageRun({
      type: fig.type,
      data: fig.bytes,
      transformation: this.imageSize(fig),
    });
  }

  private figure(inline: Token): void {
    const img = (inline.children ?? []).find((k) => k.type === "image");
    if (img === undefined) return;
    const caption = inlineText(img.children ?? []).trim();
    const run = this.inlineImage(img);
    const p = this.pal;
    if (run === undefined) {
      this.push(this.paragraph([
        this.textRun(`[Missing visualization: ${img.attrGet("src") ?? ""}]`, {
          ...this.baseRun(),
          color: hexOrUndefined(p.semantic.danger),
          size: fastrWordHalfPoints(BODY_PX * 0.85),
        }),
      ]));
      return;
    }
    this.push(this.paragraph([run], {
      alignment: AlignmentType.CENTER,
      keepNext: caption.length > 0,
      keepLines: true,
    }, {
      before: fastrWordTwips(BODY_PX * 0.6),
      after: caption.length > 0 ? fastrWordTwips(BODY_PX * 0.5) : fastrWordTwips(BODY_PX * 1.6),
      line: 240,
    }));
    if (caption.length > 0) {
      this.push(this.paragraph(
        [this.textRun(caption, {
          ...this.baseRun(),
          size: fastrWordHalfPoints(BODY_PX * 0.85),
          color: hexOrUndefined(p.inkMuted),
        })],
        { style: "Caption" },
        { after: fastrWordTwips(BODY_PX * 1.6), line: 336 },
      ));
    }
  }

  // ── Overlay blocks ────────────────────────────────────────────────────────

  private overlay(open: Token, kind: FastrWordRasterKind): void {
    const id = open.map?.[0] ?? -1;
    const block = this.input.rasters.get(id);
    if (block === undefined) {
      throw new Error(
        `The ${kind} block at line ${id + 1} was not rasterized, so the Word file cannot be built.`,
      );
    }
    const attrs = containerAttrs(open);
    const fill = kind === "cover" && String(attrs["fill"] ?? "").toLowerCase() === "page";
    // A cover at the head of the report is pulled up through the top margin,
    // flush with the sheet, as print does.
    const flush = kind === "cover" && !fill && !this.emitted && this.sinks.length === 1;
    const relative: "text" | "page" = fill ? "page" : "text";
    const originLeft = fill ? 0 : block.leftPx - this.colLeftPx;
    const originTop = flush ? -this.marginPx : 0;
    const boxes = block.texts.map((text) => this.textbox(text, originLeft, originTop, relative));
    const image = new ImageRun({
      type: "png",
      data: decodeBase64Bytes(block.png),
      transformation: { width: Math.round(block.widthPx), height: Math.round(block.heightPx) },
      floating: {
        horizontalPosition: {
          relative: fill ? HorizontalPositionRelativeFrom.PAGE : HorizontalPositionRelativeFrom.COLUMN,
          offset: emu(originLeft),
        },
        verticalPosition: {
          relative: fill ? VerticalPositionRelativeFrom.PAGE : VerticalPositionRelativeFrom.PARAGRAPH,
          offset: emu(originTop),
        },
        behindDocument: true,
        allowOverlap: true,
        lockAnchor: true,
        layoutInCell: false,
        wrap: { type: TextWrappingType.NONE },
        zIndex: 0,
      },
    });
    if (fill) {
      this.openSection("cover");
      this.push(new Paragraph({
        spacing: { before: 0, after: 0, line: 20, lineRule: LineRuleType.EXACT },
        children: [image, ...boxes],
      }));
      this.pendingBreak = false;
      this.openSection("normal");
      return;
    }
    const height = Math.max(1, block.heightPx + originTop);
    this.push(new Paragraph({
      pageBreakBefore: this.takeBreak(),
      spacing: {
        before: flush ? 0 : fastrWordTwips(block.marginTopPx),
        after: fastrWordTwips(block.marginBottomPx),
        line: fastrWordTwips(height),
        lineRule: LineRuleType.EXACT,
      },
      children: [image, ...boxes],
    }));
  }

  private textbox(
    text: FastrWordRasterText,
    originLeft: number,
    originTop: number,
    relative: "text" | "page",
  ): FastrTextboxRun {
    const align = text.align === "center"
      ? AlignmentType.CENTER
      : text.align === "right"
      ? AlignmentType.RIGHT
      : text.align === "justify"
      ? AlignmentType.JUSTIFIED
      : AlignmentType.LEFT;
    // One paragraph per line-break group, exact line height as measured.
    const groups: FastrWordRasterRun[][] = [[]];
    for (const r of text.runs) {
      if (r.break) groups.push([]);
      else groups[groups.length - 1].push(r);
    }
    const paragraphs = groups.map((g) =>
      new Paragraph({
        alignment: align,
        spacing: {
          before: 0,
          after: 0,
          line: fastrWordTwips(text.lineHeightPx),
          lineRule: LineRuleType.EXACT,
        },
        children: g.map((r) =>
          new TextRun({
            text: r.text,
            font: r.fontFamily.length > 0 ? r.fontFamily : this.bodyFont,
            size: fastrWordHalfPoints(r.fontSizePx),
            bold: r.bold && !this.embeddedIsBold(r.fontFamily),
            italics: r.italic,
            color: r.color,
            allCaps: r.allCaps,
            underline: r.underline ? {} : undefined,
            characterSpacing: r.letterSpacingPx === 0 ? undefined : fastrWordTwips(r.letterSpacingPx),
          })
        ),
      })
    );
    return new FastrTextboxRun({
      id: ++this.textboxSeq,
      leftPt: pt(originLeft + text.left),
      topPt: pt(originTop + text.top),
      // A pixel of slack against a re-wrap at the box's edge.
      widthPt: pt(text.width + 1),
      heightPt: pt(text.height + 1),
      relative,
      children: paragraphs,
    });
  }

  // ── Block walk ────────────────────────────────────────────────────────────

  build(): Document {
    this.walk(0, this.tokens.length, false);
    return this.document();
  }

  private container(i: number): number {
    const open = this.tokens[i];
    const name = containerName(open);
    const attrs = containerAttrs(open);
    const close = matchingClose(this.tokens, i);
    if (name === "report") return close;
    const breakMode = fastrBreakMode(attrs);
    if (breakMode === "before") this.pendingBreak = true;
    const raster = rasterKindOf(open);
    if (raster !== undefined) {
      this.overlay(open, raster);
      if (breakMode === "after") this.pendingBreak = true;
      return close;
    }
    switch (name) {
      case "pagebreak":
        this.pendingBreak = true;
        return close;
      case "contents":
        this.contents(attrs);
        break;
      case "callout":
        this.callout(i, close, attrs);
        break;
      case "quote":
        this.quote(i, close, attrs);
        break;
      case "steps":
        this.stepsBlock(i, close, attrs);
        break;
      case "columns":
        this.columns(i, close);
        break;
      default:
        // col outside columns, or an unknown name: its content, plainly.
        this.walk(i + 1, close);
        break;
    }
    if (breakMode === "after") this.pendingBreak = true;
    return close;
  }

  // Walk the tokens strictly between an open and its close, at one more
  // container depth (the document itself is depth 0).
  private walk(from: number, to: number, nested = true): void {
    if (nested) this.depth++;
    const tokens = this.tokens;
    for (let i = from; i < to; i++) {
      const t = tokens[i];
      switch (t.type) {
        case "fm_container_open":
          i = this.container(i);
          break;
        case "heading_open":
          i = this.heading(i);
          break;
        case "paragraph_open":
          i = this.paragraphToken(i);
          break;
        case "table_open":
          i = this.table(i);
          break;
        default:
          // Lists, quotes, spaces, rules and code share the top-level
          // handling: re-dispatch through a one-token view.
          i = this.simple(i);
          break;
      }
    }
    if (nested) this.depth--;
  }

  private simple(i: number): number {
    const t = this.tokens[i];
    switch (t.type) {
      case "fm_space":
        this.push(this.paragraph([], {}, { after: 0, line: 372 }));
        return i;
      case "bullet_list_open":
      case "ordered_list_open": {
        const bullets = t.type === "bullet_list_open";
        const key = bullets ? "bullets" : "numbers";
        const parentLevel = this.lists.length;
        this.lists.push({
          reference: bullets ? "fm-bullets" : "fm-numbers",
          instance: parentLevel === 0 ? ++this.instances[key] : this.lists[parentLevel - 1].instance,
          level: Math.min(2, parentLevel),
          itemFresh: false,
        });
        return i;
      }
      case "bullet_list_close":
      case "ordered_list_close":
        this.lists.pop();
        return i;
      case "list_item_open": {
        const list = this.lists[this.lists.length - 1];
        if (list) list.itemFresh = true;
        return i;
      }
      case "blockquote_open":
        this.decorations.push({
          borderLeft: { style: BorderStyle.SINGLE, size: 18, color: hexOrUndefined(this.pal.border) ?? "auto", space: 12 },
          indentLeft: fastrWordTwips(BODY_PX * 1.1),
          run: { color: hexOrUndefined(this.pal.inkMuted) },
        });
        return i;
      case "blockquote_close":
        this.decorations.pop();
        return i;
      case "hr":
        this.push(this.paragraph([], {
          border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: hexOrUndefined(this.pal.border) ?? "auto", space: 1 } },
        }, { before: fastrWordTwips(BODY_PX), after: fastrWordTwips(BODY_PX * 2), line: 240 }));
        return i;
      case "fence":
      case "code_block":
        this.code(t.content);
        return i;
      case "html_block": {
        const text = stripTags(t.content).trim();
        if (text.length > 0) this.push(this.paragraph([this.textRun(text, this.baseRun())]));
        return i;
      }
      default:
        return i;
    }
  }

  private heading(i: number): number {
    const open = this.tokens[i];
    const inline = this.tokens[i + 1];
    const level = Math.max(1, Math.min(6, Number.parseInt(open.tag.slice(1), 10) || 1));
    const em = HEADING_EM[open.tag] ?? 1;
    const px = BODY_PX * em;
    const p = this.pal;
    const base: RunStyle = {
      font: this.headingFont,
      size: fastrWordHalfPoints(px),
      color: hexOrUndefined(p.ink),
      bold: this.headingWeight >= 600,
      allCaps: this.headingCaps,
      characterSpacing: trackingTwips(this.headingTracking, px),
    };
    const children: ParagraphChild[] = [];
    if (this.numbered && this.depth === 0 && (open.tag === "h2" || open.tag === "h3")) {
      let prefix: string;
      if (open.tag === "h2") {
        this.sec++;
        this.sub = 0;
        prefix = `${this.sec}. `;
      } else {
        this.sub++;
        prefix = `${this.sec}.${this.sub} `;
      }
      children.push(this.textRun(prefix, { ...base, color: hexOrUndefined(p.accentText) }));
    }
    children.push(...this.inline(inline?.children ?? [], base));
    const before = open.tag === "h1" ? px * 1.3 : px * 1.8;
    this.push(this.paragraph(children, {
      heading: HEADING_LEVELS[level - 1],
      keepNext: true,
      keepLines: true,
    }, {
      before: this.emitted ? fastrWordTwips(before) : 0,
      after: fastrWordTwips(px * 0.6),
      line: 288,
    }));
    return i + 2;
  }

  private paragraphToken(i: number): number {
    const open = this.tokens[i];
    const inline = this.tokens[i + 1];
    let end = i + 2;
    if (open.tag === "figure") {
      if (inline?.type === "inline") this.figure(inline);
      // The figcaption the compiler inserted after the close.
      if (this.tokens[end + 1]?.type === "html_block" && /figcaption/.test(this.tokens[end + 1].content)) {
        end++;
      }
      return end;
    }
    const { run } = this.decorated();
    const children = inline?.type === "inline" ? this.inline(inline.children ?? [], run) : [];
    const inList = this.lists.length > 0;
    this.push(this.paragraph(children, {}, {
      after: inList ? fastrWordTwips(BODY_PX * 0.25) : undefined,
    }));
    return end;
  }

  private code(content: string): void {
    const lines = content.replace(/\n$/, "").split("\n");
    const style: RunStyle = {
      ...this.baseRun(),
      font: MONO_FONT,
      size: fastrWordHalfPoints(BODY_PX * 0.9),
    };
    lines.forEach((line, k) => {
      this.push(this.paragraph([this.textRun(line, style)], {
        shading: { type: ShadingType.CLEAR, fill: hexOrUndefined(this.pal.surfaceAlt), color: "auto" },
        indent: { left: fastrWordTwips(BODY_PX * 1.1), right: fastrWordTwips(BODY_PX * 1.1) },
      }, {
        before: k === 0 ? fastrWordTwips(BODY_PX) : 0,
        after: k === lines.length - 1 ? fastrWordTwips(BODY_PX) : 0,
        line: 300,
      }));
    });
  }

  // ── Containers ────────────────────────────────────────────────────────────

  private withTone(attrs: FastrContainerAttrs, fn: () => void): void {
    const tone = fastrSurfaceTone(attrs);
    const pushed = tone !== undefined && tone !== "default";
    if (pushed) this.palettes.push(tonePalette(this.c, basePalette(this.c), tone));
    try {
      fn();
    } finally {
      if (pushed) this.palettes.pop();
    }
  }

  private collect(from: number, to: number): Block[] {
    const out: Block[] = [];
    this.sinks.push(out);
    try {
      this.walk(from, to);
    } finally {
      this.sinks.pop();
    }
    return out;
  }

  // A shaded one-cell table: the callout's panel and the steps' frame.
  private panel(
    children: Block[],
    o: { fill: string; left?: IBorderOptions; frame?: IBorderOptions; padX: number; padY: number },
  ): Table {
    const width = fastrWordTwips(this.width);
    const b = o.frame ?? noBorder();
    return new Table({
      width: { size: width, type: WidthType.DXA },
      columnWidths: [width],
      layout: TableLayoutType.FIXED,
      borders: noBorders(),
      rows: [
        new TableRow({
          cantSplit: true,
          children: [
            new TableCell({
              width: { size: width, type: WidthType.DXA },
              shading: { type: ShadingType.CLEAR, fill: o.fill, color: "auto" },
              margins: {
                top: fastrWordTwips(o.padY),
                bottom: fastrWordTwips(o.padY),
                left: fastrWordTwips(o.padX),
                right: fastrWordTwips(o.padX),
              },
              borders: { top: b, bottom: b, right: b, left: o.left ?? b },
              children: children.length > 0 ? children as (Paragraph | Table)[] : [new Paragraph({})],
            }),
          ],
        }),
      ],
    });
  }

  private callout(i: number, close: number, attrs: FastrContainerAttrs): void {
    const kindRaw = String(attrs["kind"] ?? "note").toLowerCase();
    const kind = ["note", "info", "success", "warning", "danger"].includes(kindRaw) ? kindRaw : "note";
    this.withTone(attrs, () => {
      const p = this.pal;
      const toned = fastrSurfaceTone(attrs) !== undefined;
      const color = toned
        ? p.accent
        : kind === "note"
        ? p.accentText
        : p.semantic[kind as keyof FastrThemeSemantic];
      const padX = BODY_PX * 1.2;
      const padY = BODY_PX;
      this.widths.push(this.width - 2 * padX - 4);
      const children: Block[] = [];
      const title = attrs["title"];
      this.sinks.push(children);
      try {
        if (typeof title === "string" && title.length > 0) {
          this.push(this.paragraph(
            [this.textRun(title, {
              font: this.headingFont,
              size: fastrWordHalfPoints(BODY_PX),
              color: hexOrUndefined(color),
              bold: true,
            })],
            { keepNext: true },
            { after: fastrWordTwips(BODY_PX * 0.35), line: 300 },
          ));
        }
        this.walk(i + 1, close);
      } finally {
        this.sinks.pop();
        this.widths.pop();
      }
      // The last paragraph inside a panel brings no bottom margin to it.
      const fill = hexOrUndefined(toned ? p.ground : p.surface) ?? "auto";
      this.push(this.panel(children, {
        fill,
        left: { style: BorderStyle.SINGLE, size: 24, color: hexOrUndefined(color) ?? "auto" },
        padX,
        padY,
      }));
      this.spaceAfter(BODY_PX * 1.5);
    });
  }

  // A table cannot carry spacing after it; a slim empty paragraph does.
  private spaceAfter(px: number): void {
    this.push(new Paragraph({
      spacing: { before: 0, after: 0, line: fastrWordTwips(px), lineRule: LineRuleType.EXACT },
    }));
  }

  private quote(i: number, close: number, attrs: FastrContainerAttrs): void {
    this.withTone(attrs, () => {
      const p = this.pal;
      const size = BODY_PX * 1.2;
      this.decorations.push({
        borderLeft: { style: BorderStyle.SINGLE, size: 24, color: hexOrUndefined(p.accent) ?? "auto", space: 14 },
        indentLeft: fastrWordTwips(BODY_PX * 1.2),
        run: { font: this.headingFont, size: fastrWordHalfPoints(size), color: hexOrUndefined(p.ink) },
        line: 348,
        shading: fastrSurfaceTone(attrs) !== undefined ? hexOrUndefined(p.ground) : undefined,
      });
      try {
        this.walk(i + 1, close);
        const cite = attrs["cite"];
        if (typeof cite === "string" && cite.length > 0) {
          this.push(this.paragraph(
            [this.textRun(cite, {
              font: this.bodyFont,
              size: fastrWordHalfPoints(size * 0.72),
              color: hexOrUndefined(p.inkMuted),
            })],
            {},
            { before: 0, line: 300 },
          ));
        }
      } finally {
        this.decorations.pop();
      }
    });
  }

  private stepsBlock(i: number, close: number, attrs: FastrContainerAttrs): void {
    this.withTone(attrs, () => {
      const p = this.pal;
      const instance = ++this.instances.steps;
      const padX = BODY_PX * 1.2;
      this.widths.push(this.width - 2 * padX - 2);
      this.steps.push({ instance, level: this.depth });
      this.decorations.push({
        borderBottom: { style: BorderStyle.SINGLE, size: 6, color: hexOrUndefined(p.border) ?? "auto", space: 8 },
      });
      let children: Block[];
      try {
        children = this.collect(i + 1, close);
      } finally {
        this.decorations.pop();
        this.steps.pop();
        this.widths.pop();
      }
      const toned = fastrSurfaceTone(attrs) !== undefined;
      this.push(this.panel(children, {
        fill: hexOrUndefined(toned ? p.ground : p.surface) ?? "auto",
        frame: { style: BorderStyle.SINGLE, size: 6, color: hexOrUndefined(p.border) ?? "auto" },
        padX,
        padY: BODY_PX * 0.5,
      }));
      this.spaceAfter(BODY_PX * 1.6);
    });
  }

  private contents(attrs: FastrContainerAttrs): void {
    const { title, depth } = fastrTocOptions(attrs);
    const p = this.pal;
    if (title !== undefined && title.length > 0) {
      this.push(this.paragraph(
        [this.textRun(title, {
          font: this.headingFont,
          size: fastrWordHalfPoints(BODY_PX * 0.85),
          color: hexOrUndefined(p.accentText),
          bold: this.headingWeight >= 600,
          allCaps: this.headingCaps,
        })],
        { keepNext: true },
        { before: fastrWordTwips(BODY_PX * 1.6), after: fastrWordTwips(BODY_PX * 0.7), line: 300 },
      ));
    }
    this.hasToc = true;
    this.push(new TableOfContents(title ?? "Contents", {
      hyperlink: true,
      headingStyleRange: `1-${depth}`,
    }));
    this.spaceAfter(BODY_PX * 1.6);
  }

  private columns(i: number, close: number): void {
    // The direct col children and their spans.
    const cols: { open: number; close: number; span: number }[] = [];
    for (let k = i + 1; k < close; k++) {
      const t = this.tokens[k];
      if (t.type !== "fm_container_open") continue;
      const end = matchingClose(this.tokens, k);
      if (containerName(t) === "col") {
        const span = Number.parseInt(String(containerAttrs(t)["span"] ?? "1"), 10);
        cols.push({ open: k, close: end, span: Number.isFinite(span) ? Math.min(4, Math.max(1, span)) : 1 });
      }
      k = end;
    }
    // Only a top-level columns block becomes Word columns; nested, its cols
    // simply follow one another.
    if (cols.length < 2 || this.sinks.length !== 1 || this.section.kind === "columns") {
      this.walk(i + 1, close);
      return;
    }
    const spans = cols.reduce((a, c) => a + c.span, 0);
    const gapPx = COLUMN_GAP_PX;
    const usable = this.width - gapPx * (cols.length - 1);
    const widthsPx = cols.map((c) => usable * c.span / spans);
    this.openSection("columns", {
      count: cols.length,
      widths: widthsPx.map((w) => fastrWordTwips(w)),
      space: fastrWordTwips(gapPx),
    });
    let left = 0;
    cols.forEach((c, k) => {
      if (k > 0) {
        this.push(new Paragraph({
          spacing: { before: 0, after: 0, line: 20, lineRule: LineRuleType.EXACT },
          children: [new ColumnBreak()],
        }));
      }
      this.colLeftPx = left;
      this.widths.push(widthsPx[k]);
      try {
        this.walk(c.open + 1, c.close);
      } finally {
        this.widths.pop();
      }
      left += widthsPx[k] + gapPx;
    });
    this.colLeftPx = 0;
    this.openSection("normal");
  }

  private table(i: number): number {
    const tokens = this.tokens;
    let end = i;
    for (let k = i + 1; k < tokens.length; k++) {
      if (tokens[k].type === "table_close" && tokens[k].level === tokens[i].level) {
        end = k;
        break;
      }
    }
    type Cell = { children: readonly Token[]; header: boolean; align: string | null };
    const rows: { header: boolean; cells: Cell[] }[] = [];
    let inHead = false;
    let row: { header: boolean; cells: Cell[] } | undefined;
    for (let k = i + 1; k < end; k++) {
      const t = tokens[k];
      if (t.type === "thead_open") inHead = true;
      else if (t.type === "thead_close") inHead = false;
      else if (t.type === "tr_open") row = { header: inHead, cells: [] };
      else if (t.type === "tr_close" && row) {
        rows.push(row);
        row = undefined;
      } else if ((t.type === "th_open" || t.type === "td_open") && row) {
        const inline = tokens[k + 1];
        const style = t.attrGet("style") ?? "";
        const align = /text-align:\s*(left|center|right)/.exec(style)?.[1] ?? null;
        row.cells.push({
          children: inline?.type === "inline" ? inline.children ?? [] : [],
          header: t.type === "th_open",
          align,
        });
      }
    }
    if (rows.length === 0) return end;
    const colCount = Math.max(...rows.map((r) => r.cells.length));
    const weights = Array.from({ length: colCount }, (_, c) =>
      Math.max(4, Math.min(60, ...rows.map((r) => inlineText(r.cells[c]?.children ?? []).length))));
    const sum = weights.reduce((a, b) => a + b, 0);
    const total = fastrWordTwips(this.width);
    const widths = weights.map((w) => Math.round(total * w / sum));
    const p = this.pal;
    const fontPx = BODY_PX * 0.94;
    const hair: IBorderOptions = { style: BorderStyle.SINGLE, size: 6, color: hexOrUndefined(p.border) ?? "auto" };
    const heavy: IBorderOptions = { style: BorderStyle.SINGLE, size: 12, color: hexOrUndefined(p.ink) ?? "auto" };
    const docRows = rows.map((r) =>
      new TableRow({
        cantSplit: true,
        tableHeader: r.header,
        children: Array.from({ length: colCount }, (_, c) => {
          const cell = r.cells[c] ?? { children: [], header: r.header, align: null };
          const base: RunStyle = {
            ...this.baseRun(),
            size: fastrWordHalfPoints(fontPx),
            bold: cell.header,
          };
          return new TableCell({
            width: { size: widths[c], type: WidthType.DXA },
            shading: cell.header
              ? { type: ShadingType.CLEAR, fill: hexOrUndefined(p.surfaceAlt), color: "auto" }
              : undefined,
            margins: {
              top: fastrWordTwips(fontPx * 0.5),
              bottom: fastrWordTwips(fontPx * 0.5),
              left: fastrWordTwips(fontPx * 0.7),
              right: fastrWordTwips(fontPx * 0.7),
            },
            borders: {
              top: noBorder(),
              left: noBorder(),
              right: noBorder(),
              bottom: cell.header ? heavy : hair,
            },
            children: [
              new Paragraph({
                alignment: cell.align === "center"
                  ? AlignmentType.CENTER
                  : cell.align === "right"
                  ? AlignmentType.RIGHT
                  : AlignmentType.LEFT,
                spacing: { before: 0, after: 0, line: 336 },
                children: this.inline(cell.children, base),
              }),
            ],
          });
        }),
      })
    );
    if (this.pendingBreak) {
      // A table cannot break the page before itself; the slim paragraph can.
      this.push(new Paragraph({
        pageBreakBefore: this.takeBreak(),
        spacing: { before: 0, after: 0, line: 20, lineRule: LineRuleType.EXACT },
      }));
    }
    this.push(new Table({
      width: { size: total, type: WidthType.DXA },
      columnWidths: widths,
      layout: TableLayoutType.FIXED,
      borders: noBorders(),
      rows: docRows,
    }));
    this.spaceAfter(BODY_PX * 1.4);
    return end;
  }

  // ── The document ──────────────────────────────────────────────────────────

  private footer(): Footer {
    const p = this.pageGround?.palette ?? basePalette(this.c);
    const style: RunStyle = {
      font: this.bodyFont,
      size: 17,
      color: hexOrUndefined(p.inkMuted),
    };
    return new Footer({
      children: [
        new Paragraph({
          tabStops: [{ type: TabStopType.RIGHT, position: fastrWordTwips(this.columnPx) }],
          spacing: { before: 0, after: 0, line: 240 },
          children: [
            this.textRun(this.input.title, style),
            new TextRun({
              font: style.font,
              size: style.size,
              color: style.color,
              children: [
                new Tab(),
                `${this.input.footer.pageWord} `,
                PageNumber.CURRENT,
                ` ${this.input.footer.ofWord} `,
                PageNumber.TOTAL_PAGES,
              ],
            }),
          ],
        }),
      ],
    });
  }

  private pageProperties(margins: boolean): NonNullable<ISectionPropertiesOptions["page"]> {
    const [w, h] = this.sheetPx;
    const m = margins ? fastrWordTwips(this.marginPx) : 0;
    return {
      size: {
        width: fastrWordTwips(w),
        height: fastrWordTwips(h),
        orientation: this.page.orientation === "landscape" ? PageOrientation.LANDSCAPE : PageOrientation.PORTRAIT,
      },
      margin: { top: m, right: m, bottom: m, left: m, header: 0, footer: Math.round(m / 2) },
    };
  }

  private document(): Document {
    const drafts = this.sections.filter((s, k) => s.children.length > 0 || k === 0);
    const p = this.pageGround?.palette ?? basePalette(this.c);
    const sections = drafts.map((s, k) => {
      const prev = drafts[k - 1];
      const continuous = s.kind === "columns" || prev?.kind === "columns";
      const properties: ISectionPropertiesOptions = s.kind === "cover"
        ? { page: this.pageProperties(false), type: k === 0 ? undefined : SectionType.NEXT_PAGE }
        : {
          page: this.pageProperties(true),
          type: k === 0 ? undefined : continuous ? SectionType.CONTINUOUS : SectionType.NEXT_PAGE,
          column: s.column === undefined ? { count: 1 } : {
            count: s.column.count,
            space: s.column.space,
            equalWidth: false,
            children: s.column.widths.map((w) => new Column({ width: w, space: s.column!.space })),
          },
        };
      return {
        properties,
        footers: s.kind === "cover" ? { default: new Footer({ children: [] }) } : { default: this.footer() },
        children: s.children,
      };
    });
    const headingStyles = HEADING_LEVELS.map((id, k) => {
      const tag = `h${k + 1}`;
      const px = BODY_PX * (HEADING_EM[tag] ?? 1);
      return {
        id,
        name: `Heading ${k + 1}`,
        basedOn: "Normal",
        next: "Normal",
        quickFormat: true,
        run: {
          font: this.headingFont,
          size: fastrWordHalfPoints(px),
          bold: this.headingWeight >= 600 && !this.embeddedIsBold(this.headingFont),
          color: hexOrUndefined(p.ink),
          allCaps: this.headingCaps,
          characterSpacing: trackingTwips(this.headingTracking, px),
        },
        paragraph: {
          spacing: { before: fastrWordTwips(px * (tag === "h1" ? 1.3 : 1.8)), after: fastrWordTwips(px * 0.6), line: 288 },
          keepNext: true,
          keepLines: true,
          outlineLevel: k,
        },
      };
    });
    const bulletLevels = [0, 1, 2].map((level) => ({
      level,
      format: LevelFormat.BULLET,
      text: level === 0 ? "•" : level === 1 ? "◦" : "▪",
      alignment: AlignmentType.LEFT,
      style: { paragraph: { indent: { left: 336 * (level + 1), hanging: 336 } } },
    }));
    const numberLevels = [0, 1, 2].map((level) => ({
      level,
      format: LevelFormat.DECIMAL,
      text: `%${level + 1}.`,
      alignment: AlignmentType.LEFT,
      style: { paragraph: { indent: { left: 336 * (level + 1), hanging: 336 } } },
    }));
    return new Document({
      creator: "FASTR Analytics",
      title: this.input.title,
      features: { updateFields: this.hasToc },
      // docx types the bytes as a Node Buffer; a Uint8Array is what it reads.
      fonts: (this.input.fonts ?? []).map((f) => ({ name: f.name, data: f.data })) as unknown as
        IPropertiesOptions["fonts"],
      background: this.pageGround === undefined
        ? undefined
        : { color: hexOrUndefined(this.pageGround.color) },
      styles: {
        default: {
          document: {
            run: { font: this.bodyFont, size: fastrWordHalfPoints(BODY_PX), color: hexOrUndefined(p.ink) },
            paragraph: { spacing: { line: 372, after: fastrWordTwips(BODY_PX) } },
          },
        },
        paragraphStyles: [
          ...headingStyles,
          {
            id: "Caption",
            name: "Caption",
            basedOn: "Normal",
            next: "Normal",
            quickFormat: true,
            run: { size: fastrWordHalfPoints(BODY_PX * 0.85), color: hexOrUndefined(p.inkMuted) },
            paragraph: { spacing: { before: 0, after: fastrWordTwips(BODY_PX * 1.6), line: 336 } },
          },
        ],
      },
      numbering: {
        config: [
          { reference: "fm-bullets", levels: bulletLevels },
          { reference: "fm-numbers", levels: numberLevels },
          {
            reference: "fm-steps",
            levels: [{
              level: 0,
              format: LevelFormat.DECIMAL_ZERO,
              text: "%1",
              alignment: AlignmentType.LEFT,
              style: {
                run: {
                  font: this.headingFont,
                  size: fastrWordHalfPoints(BODY_PX * 0.85),
                  bold: !this.embeddedIsBold(this.headingFont),
                  color: hexOrUndefined(p.accentText),
                },
                paragraph: { indent: { left: fastrWordTwips(BODY_PX * 3), hanging: fastrWordTwips(BODY_PX * 3) } },
              },
            }],
          },
        ],
      },
      sections,
    });
  }
}

// Build the Word document for a FASTR Markdown report. Throws when a
// decorative block has no raster (the export then fails, as the PDF does
// without Chrome); the caller packs the Document with docx's Packer.
export function buildFastrWordDocument(input: FastrWordBuildInput): Document {
  return new Builder(input).build();
}

// ── Small helpers ─────────────────────────────────────────────────────────────

// A heading's tracking (`-0.01em`) in twentieths of a point at its size.
function trackingTwips(tracking: string, px: number): number | undefined {
  const m = /^(-?[\d.]+)em$/.exec(tracking.trim());
  if (!m) return undefined;
  const v = Number.parseFloat(m[1]);
  if (!Number.isFinite(v) || v === 0) return undefined;
  return fastrWordTwips(v * px);
}

function inlineText(children: readonly Token[]): string {
  let out = "";
  for (const t of children) {
    if (t.type === "text" || t.type === "code_inline") out += t.content;
    else if (t.type === "softbreak" || t.type === "hardbreak") out += " ";
    else if (t.type === "image") out += inlineText(t.children ?? []);
  }
  return out;
}

function stripTags(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ");
}

function decodeBase64Bytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// A data URL's bytes and image type for docx, or undefined for a type Word
// cannot embed.
export function dataUrlToWordImage(
  dataUrl: string,
  width: number,
  height: number,
): FastrWordFigure | undefined {
  const m = /^data:image\/(\w+);base64,(.+)$/s.exec(dataUrl);
  if (!m) return undefined;
  const raw = m[1].toLowerCase();
  const type = raw === "jpeg" ? "jpg" : raw;
  if (type !== "png" && type !== "jpg" && type !== "gif" && type !== "bmp") return undefined;
  return { bytes: decodeBase64Bytes(m[2]), width, height, type };
}
