// =============================================================================
// FASTR Markdown container blocks — the pure syntax layer behind the format's
// `:::` blocks. No markdown-it and no DOM here, so the markdown-it block rule
// (report_fastr_markdown.ts), the AI validator and the Deno tests all read one
// definition of the syntax.
//
//   :::callout{kind=warning title="Data caveat"}   … :::
//   :::tiles{cols=3}  :::card{title="ANC4"} … :::  :::
//   :::stat{value="64%" label="ANC4" delta="+3pp" dir=up}      ← leaf, no close
//   :::columns{cols=2}  :::col{span=2} … :::      :::
//   :::quote{cite="Dr N. Kamara"} … :::
//
// A container's design lives entirely in the theme stylesheet (report_fastr_css.ts)
// — the body never carries CSS, which is what makes the format hand-editable and
// the theme swappable after creation.
// =============================================================================

import { escapeReportHtml } from "./types/reports.ts";

export const FASTR_BLOCK_NAMES = [
  "callout",
  "tiles",
  "card",
  "stat",
  "columns",
  "col",
  "quote",
  "band",
  "cover",
  "steps",
  "contents",
  "report",
] as const;
export type FastrBlockName = (typeof FASTR_BLOCK_NAMES)[number];

// Leaf blocks are written as ONE line and take no closing fence — a stat is its
// attributes, and `report` is the document header, so demanding a `:::` after
// either is pure friction.
export const FASTR_LEAF_BLOCK_NAMES: readonly string[] = [
  "stat",
  "contents",
  "report",
];

export function isFastrBlockName(name: string): name is FastrBlockName {
  return (FASTR_BLOCK_NAMES as readonly string[]).includes(name);
}

export function isFastrLeafBlock(name: string): boolean {
  return FASTR_LEAF_BLOCK_NAMES.includes(name);
}

// ── Fence parsing ────────────────────────────────────────────────────────────

// Bare flags are `true`; everything else is the literal string.
export type FastrContainerAttrs = Record<string, string | true>;

export type FastrContainerFence =
  | { kind: "open"; markerLength: number; name: string; attrs: FastrContainerAttrs }
  | { kind: "close"; markerLength: number };

const FENCE_RE = /^(:{3,})[ \t]*([A-Za-z][A-Za-z0-9-]*)?[ \t]*(\{[^}]*\})?[ \t]*$/;
const ATTR_RE =
  /([A-Za-z_][A-Za-z0-9_-]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'}]+)))?/g;

// `{kind=warning title="Data caveat" accent}` → { kind: "warning", title: "Data caveat", accent: true }
export function parseContainerAttrs(raw: string): FastrContainerAttrs {
  const inner = raw.startsWith("{") ? raw.slice(1, -1) : raw;
  const attrs: FastrContainerAttrs = {};
  const re = new RegExp(ATTR_RE.source, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(inner)) !== null) {
    if (m[0].length === 0) {
      re.lastIndex++;
      continue;
    }
    const value = m[2] ?? m[3] ?? m[4];
    attrs[m[1].toLowerCase()] = value === undefined ? true : value;
  }
  return attrs;
}

// A `:::` line with no name closes the innermost open container.
export function parseContainerFence(line: string): FastrContainerFence | undefined {
  const m = FENCE_RE.exec(line.trim());
  if (!m) return undefined;
  const markerLength = m[1].length;
  if (m[2] === undefined) {
    // `:::{…}` with attributes but no name is not a close fence, and not a
    // container either — leave it to the paragraph rule rather than guess.
    return m[3] === undefined ? { kind: "close", markerLength } : undefined;
  }
  return {
    kind: "open",
    markerLength,
    name: m[2].toLowerCase(),
    attrs: m[3] === undefined ? {} : parseContainerAttrs(m[3]),
  };
}

export function isFastrContainerFenceLine(line: string): boolean {
  return parseContainerFence(line) !== undefined;
}

// ── Fence → markup ───────────────────────────────────────────────────────────

export type FastrContainerHtml = {
  tag: string;
  className: string;
  // Inline style — a literal `bg` colour only. A STANDARD property, never a
  // custom property: DOMPurify's style handling is the gate here, and a
  // standard declaration is what it reliably keeps.
  style: string;
  // Pre-escaped extra attributes, e.g. ` data-bg-image="image:<uuid>"`, which
  // the client resolves at materialize time like any other embed.
  extraAttrs: string;
  // Emitted immediately after the opening tag (a callout/card title).
  leadingHtml: string;
  // Emitted immediately before the closing tag (a quote's citation).
  trailingHtml: string;
  // `report` configures the document rather than rendering anything.
  silent: boolean;
};

// Grounds by ROLE, not by colour: each theme maps these to its own palette, so
// `tone=dark` is deep green in Ministry and black in Swiss, and a re-theme
// keeps every band readable. A tone re-scopes the `--fm-ink*`/`--fm-border`
// tokens on the block, so descendants (headings, muted labels, rules) follow.
export const FASTR_TONES = [
  "default",
  "muted",
  "accent",
  "solid",
  "dark",
  "inverse",
  // The theme's own accent-into-dark sweep — a gradient you do not have to
  // spell out, and the only one that survives a re-theme.
  "gradient",
  // The four MEANING grounds. They reuse the semantic colours the callout kinds
  // and stat deltas already carry, so "this is the bad news" is a role rather
  // than a colour — and unlike bg="#c62828" it stays coherent across themes.
  "danger",
  "warning",
  "success",
  "info",
] as const;
export type FastrTone = (typeof FASTR_TONES)[number];

// Inline colour roles — `[fell 12 points]{.danger}`. Same principle as the
// tones one level up: the author names a ROLE, the theme owns the colour, so a
// marked phrase survives a re-theme. `fm-mark`, NOT `fm-ink--*`: that prefix
// already belongs to the block-level ink=light|dark override.
export const FASTR_INK_ROLES = [
  "accent",
  "muted",
  "danger",
  "warning",
  "success",
  "info",
] as const;
export type FastrInkRole = (typeof FASTR_INK_ROLES)[number];

export function isFastrInkRole(v: string): v is FastrInkRole {
  return (FASTR_INK_ROLES as readonly string[]).includes(v);
}

export function inkRoleClass(role: FastrInkRole): string {
  return `fm-mark fm-mark--${role}`;
}

// The `{…}` attribute block a `[text]` span can carry: a colour role, a point
// size, an underline, in any combination and order — `{.danger}`,
// `{size=12}`, `{underline}`, `{.danger size=12 underline}`. This is THE
// parser for that block: the renderer, the editor's conceal/island layers and
// the toolbar all call it, so they cannot disagree about what is a mark.
// `undefined` means "not a mark" and the caller leaves the author's text
// literal — exactly how an unknown role behaved before sizes existed.
// Underline is a mark attribute rather than `<u>` because markdown has no
// underline and this way it inherits everything the marks already do.
export type FastrMarkAttrs = {
  role?: FastrInkRole;
  // A literal colour (`color=#c62828`) — the same trade as a literal `bg=`:
  // any colour, at the price of not following a theme switch. The toolbar
  // keeps role and colour mutually exclusive; the parser accepts both so a
  // hand-written mark never turns into literal text over it.
  color?: string;
  size?: number;
  underline?: true;
};

export function isEmptyFastrMarkAttrs(a: FastrMarkAttrs): boolean {
  return a.role === undefined && a.color === undefined && a.size === undefined &&
    a.underline !== true;
}

export function sameFastrMarkAttrs(a: FastrMarkAttrs, b: FastrMarkAttrs): boolean {
  return a.role === b.role && a.color === b.color && a.size === b.size &&
    (a.underline === true) === (b.underline === true);
}

// Points, like a word processor — `size=12` reads as "12pt text". Bounds are
// Google Docs' own (1–400); anything outside is not a mark.
const MARK_SIZE_RE = /^size=(\d{1,3}(?:\.\d)?)$/;

export function parseFastrMarkAttrs(
  inner: string,
): FastrMarkAttrs | undefined {
  const items = inner.trim().split(/\s+/).filter((s) => s.length > 0);
  if (items.length === 0) return undefined;
  const out: FastrMarkAttrs = {};
  for (const item of items) {
    if (item.startsWith(".")) {
      const role = item.slice(1);
      if (out.role !== undefined || !isFastrInkRole(role)) return undefined;
      out.role = role;
      continue;
    }
    if (item === "underline") {
      if (out.underline !== undefined) return undefined;
      out.underline = true;
      continue;
    }
    if (item.startsWith("color=")) {
      // safeCssColor is the one gate for colours in a style attribute; the
      // item has no whitespace by construction, so rgb() with spaces is not
      // writable here — hex and named colours are the form the toolbar writes.
      const color = safeCssColor(item.slice("color=".length));
      if (color === undefined || out.color !== undefined) return undefined;
      out.color = color;
      continue;
    }
    const m = MARK_SIZE_RE.exec(item);
    if (!m || out.size !== undefined) return undefined;
    const size = Number(m[1]);
    if (size < 1 || size > 400) return undefined;
    out.size = size;
  }
  return out;
}

// Canonical form, role first: `{.danger size=12 underline}`. Empty attrs are
// the caller's cue to unwrap the mark entirely, never to write `{}`.
export function serializeFastrMarkAttrs(attrs: FastrMarkAttrs): string {
  const parts: string[] = [];
  if (attrs.role !== undefined) parts.push(`.${attrs.role}`);
  if (attrs.color !== undefined) parts.push(`color=${attrs.color}`);
  if (attrs.size !== undefined) parts.push(`size=${attrs.size}`);
  if (attrs.underline === true) parts.push("underline");
  return `{${parts.join(" ")}}`;
}

// `fm-mark--u` rides along with the inline style: the editor surface strips
// text-decoration from marks with !important (the highlighter underlines
// bracketed text), so the underline needs a class the sheet can re-assert
// at the same strength.
export function fastrMarkClass(attrs: FastrMarkAttrs): string {
  const base = attrs.role !== undefined ? inkRoleClass(attrs.role) : "fm-mark";
  return attrs.underline === true ? `${base} fm-mark--u` : base;
}

// The colour passed safeCssColor, the size is a validated number and
// underline a fixed declaration, so the style cannot smuggle anything.
export function fastrMarkStyle(attrs: FastrMarkAttrs): string {
  const parts: string[] = [];
  if (attrs.color !== undefined) parts.push(`color:${attrs.color}`);
  if (attrs.size !== undefined) parts.push(`font-size:${attrs.size}pt`);
  if (attrs.underline === true) parts.push("text-decoration:underline");
  return parts.join(";");
}

const INK_MODES = ["light", "dark"] as const;
const OVERLAY_MODES = ["dark", "light", "none"] as const;

// Colour literals only — no `url(`, no `;`, nothing that could smuggle a second
// declaration into the style attribute. DOMPurify would also catch it; this
// keeps the compiled output predictable in the first place.
const HEX_RE = /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const FUNC_COLOR_RE = /^(?:rgba?|hsla?)\(\s*[0-9a-z.,%/\s]+\)$/i;
// A curated list, NOT any bare word: `background=muted` is a tone name, and
// letting it through as a CSS colour emitted `background-color: muted` — an
// invalid declaration that silently painted nothing.
const NAMED_COLORS = new Set([
  "transparent",
  "white",
  "black",
  "silver",
  "gray",
  "grey",
  "red",
  "maroon",
  "orange",
  "yellow",
  "olive",
  "lime",
  "green",
  "teal",
  "aqua",
  "cyan",
  "blue",
  "navy",
  "purple",
  "fuchsia",
  "magenta",
  "pink",
  "brown",
  "beige",
  "ivory",
  "gold",
  "indigo",
  "violet",
  "khaki",
  "salmon",
  "tan",
  "turquoise",
  "crimson",
]);

export function safeCssColor(v: string): string | undefined {
  const t = v.trim();
  return HEX_RE.test(t) || FUNC_COLOR_RE.test(t) ||
      NAMED_COLORS.has(t.toLowerCase())
    ? t
    : undefined;
}

// Gradients are the one thing html reports could paint that a tone cannot.
// Allowed conservatively: the gradient functions only, a character set that
// cannot express a second declaration, balanced parens, and an explicit ban on
// the CSS functions that fetch or indirect (url/var/image/element/attr).
const GRADIENT_RE =
  /^(?:repeating-)?(?:linear|radial|conic)-gradient\((.*)\)$/i;
const GRADIENT_CHARS_RE = /^[0-9a-z#%.,()/\s+-]*$/i;
const GRADIENT_BANNED_RE = /\b(?:url|var|image|element|attr|expression)\s*\(/i;
const GRADIENT_MAX = 400;

function parensBalanced(v: string): boolean {
  let depth = 0;
  for (const ch of v) {
    if (ch === "(") depth++;
    else if (ch === ")" && --depth < 0) return false;
  }
  return depth === 0;
}

export function safeCssGradient(v: string): string | undefined {
  const t = v.trim();
  if (t.length > GRADIENT_MAX) return undefined;
  const m = GRADIENT_RE.exec(t);
  if (!m) return undefined;
  const inner = m[1];
  return GRADIENT_CHARS_RE.test(inner) && !GRADIENT_BANNED_RE.test(inner) &&
      parensBalanced(inner)
    ? t
    : undefined;
}

// A colour or a gradient, with the CSS property each one needs.
export function safeCssBackground(
  v: string,
): { property: "background-color" | "background"; value: string } | undefined {
  const color = safeCssColor(v);
  if (color !== undefined) return { property: "background-color", value: color };
  const gradient = safeCssGradient(v);
  return gradient === undefined
    ? undefined
    : { property: "background", value: gradient };
}

const EMBED_BG_RE = /^image:([A-Za-z0-9_-]+)$/;

function parseColorChannels(
  v: string,
): { r: number; g: number; b: number } | undefined {
  const t = v.trim();
  if (HEX_RE.test(t)) {
    const h = t.slice(1);
    const full = h.length <= 4
      ? h.slice(0, 3).split("").map((c) => c + c).join("")
      : h.slice(0, 6);
    return {
      r: parseInt(full.slice(0, 2), 16),
      g: parseInt(full.slice(2, 4), 16),
      b: parseInt(full.slice(4, 6), 16),
    };
  }
  const m = /^rgba?\(([^)]+)\)$/i.exec(t);
  if (!m) return undefined;
  const parts = m[1].split(/[,\s/]+/).filter((x) => x.length > 0).map(parseFloat);
  if (parts.length < 3 || parts.some((x) => Number.isNaN(x))) return undefined;
  return { r: parts[0], g: parts[1], b: parts[2] };
}

// Exported for the stylesheet builder, which has to decide at build time
// whether a theme's accent can serve as TEXT on that theme's own surface.
export function cssColorLuminance(v: string): number | undefined {
  return luminanceOf(v);
}

function luminanceOf(v: string): number | undefined {
  const c = parseColorChannels(v);
  return c === undefined
    ? undefined
    : (0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b) / 255;
}

// Same threshold as the figure ground detection, so a band's chart ink and its
// text ink agree about whether the ground is dark.
export function isDarkCssColor(v: string): boolean | undefined {
  const l = luminanceOf(v);
  return l === undefined ? undefined : l < 0.45;
}

const COLOR_STOP_RE = /#[0-9a-f]{3,8}\b|rgba?\([^)]*\)/gi;

// A gradient is judged by the MEAN of its colour stops, not its first: text
// sits across the whole sweep, and a dark-to-light fade reads either way from
// one end. `ink=` overrides when the author knows better.
export function isDarkCssBackground(v: string): boolean | undefined {
  const flat = isDarkCssColor(v);
  if (flat !== undefined) return flat;
  if (safeCssGradient(v) === undefined) return undefined;
  const stops = [...v.matchAll(COLOR_STOP_RE)]
    .map((m) => luminanceOf(m[0]))
    .filter((l): l is number => l !== undefined);
  if (stops.length === 0) return undefined;
  return stops.reduce((a, b) => a + b, 0) / stops.length < 0.45;
}

export type FastrSurface = {
  classes: string[];
  style: string;
  extraAttrs: string;
};

// `tone` / `bg` / `ink` / `overlay` — understood by every block AND by the
// document header, so they are resolved in one place.
export function surfaceFor(attrs: FastrContainerAttrs): FastrSurface {
  const classes: string[] = [];
  let style = "";
  let extraAttrs = "";

  const tone = attrText(attrs, "tone")?.toLowerCase();
  if (tone !== undefined && tone !== "default") {
    classes.push(
      (FASTR_TONES as readonly string[]).includes(tone)
        ? `fm-tone fm-tone--${tone}`
        : "fm-tone fm-tone--muted",
    );
  }

  // A literal background wins over the tone — and stops following the theme,
  // which is the documented trade of using it.
  const bg = attrText(attrs, "bg");
  let bgIsImage = false;
  let bgIsDark: boolean | undefined;
  if (bg !== undefined) {
    const embed = EMBED_BG_RE.exec(bg.trim());
    if (embed) {
      bgIsImage = true;
      classes.push("fm-has-bgimage");
      // The loose `referencedReportEmbedIds(body, "any")` prune scan reads the
      // BODY text, so the source `bg=image:<id>` is what keeps the asset alive.
      extraAttrs += ` data-bg-image="${escapeReportHtml(bg.trim())}"`;
    } else {
      const background = safeCssBackground(bg);
      if (background !== undefined) {
        style = `${background.property}: ${background.value}`;
        classes.push("fm-has-bg");
        bgIsDark = isDarkCssBackground(background.value);
      }
    }
  }

  // Ink follows the ground: explicit `ink=` wins, then a literal colour's own
  // luminance, then the assumption that a photo needs light text.
  const inkAttr = attrText(attrs, "ink")?.toLowerCase();
  const ink = (INK_MODES as readonly string[]).includes(inkAttr ?? "")
    ? inkAttr
    : bgIsImage
    ? "light"
    : bgIsDark === undefined
    ? undefined
    : bgIsDark
    ? "light"
    : "dark";
  if (ink !== undefined) classes.push(`fm-ink--${ink}`);

  if (bgIsImage) {
    const overlayAttr = attrText(attrs, "overlay")?.toLowerCase();
    const overlay = (OVERLAY_MODES as readonly string[]).includes(
        overlayAttr ?? "",
      )
      ? overlayAttr!
      : "dark";
    if (overlay !== "none") classes.push(`fm-overlay fm-overlay--${overlay}`);
  }

  return { classes, style, extraAttrs };
}

const DOC_WIDTHS = ["normal", "wide", "full"] as const;

// ── Print setup (`:::report`) ────────────────────────────────────────────────

export const FASTR_PAGE_SIZES = ["a4", "letter", "legal"] as const;
export type FastrPageSize = (typeof FASTR_PAGE_SIZES)[number];
export const FASTR_PAGE_ORIENTATIONS = ["portrait", "landscape"] as const;
export type FastrPageOrientation = (typeof FASTR_PAGE_ORIENTATIONS)[number];
export const FASTR_PAGE_MARGINS = ["narrow", "normal", "wide"] as const;
export type FastrPageMargin = (typeof FASTR_PAGE_MARGINS)[number];

export type FastrPageSetup = {
  size: FastrPageSize;
  orientation: FastrPageOrientation;
  margin: FastrPageMargin;
};

export const FASTR_PAGE_MARGIN_MM: Record<FastrPageMargin, number> = {
  narrow: 10,
  normal: 18,
  wide: 28,
};

// The printed sheet, in mm — what `@page { size }` names.
const PAGE_SIZE_MM: Record<FastrPageSize, [number, number]> = {
  a4: [210, 297],
  letter: [216, 279],
  legal: [216, 356],
};

// The `@page` rule the export and the print frame carry. The browser's own
// print dialog still owns headers, footers and page numbers — CSS cannot
// switch those on — so this sets the sheet and the margins only.
export function fastrPageRuleCss(page: FastrPageSetup): string {
  const [w, h] = PAGE_SIZE_MM[page.size];
  const [width, height] = page.orientation === "landscape" ? [h, w] : [w, h];
  return `@page { size: ${width}mm ${height}mm; margin: ${
    FASTR_PAGE_MARGIN_MM[page.margin]
  }mm; }`;
}

export type FastrDocumentSettings = {
  // Classes for <body> — the document ground, ink and column width.
  className: string;
  style: string;
  extraAttrs: string;
  // The printed sheet, and the `@page` rule that expresses it.
  page: FastrPageSetup;
  pageCss: string;
};

// The `:::report{...}` header, read straight from the body so page-level design
// is versioned and diffed with the document rather than living in config.
// First occurrence wins; fences inside code blocks are literal text.
export function readFastrDocumentSettings(body: string): FastrDocumentSettings {
  const defaultPage: FastrPageSetup = {
    size: "a4",
    orientation: "portrait",
    margin: "normal",
  };
  const empty = {
    className: "",
    style: "",
    extraAttrs: "",
    page: defaultPage,
    pageCss: fastrPageRuleCss(defaultPage),
  };
  let codeFence: string | undefined;
  for (const line of body.split("\n")) {
    const trimmed = line.trim();
    const cf = CODE_FENCE_RE.exec(trimmed);
    if (codeFence !== undefined) {
      if (cf && trimmed.startsWith(codeFence)) codeFence = undefined;
      continue;
    }
    if (cf) {
      codeFence = cf[1];
      continue;
    }
    const fence = parseContainerFence(line);
    if (fence?.kind !== "open" || fence.name !== "report") continue;
    const attrs = fence.attrs;
    // `background` is the document-level spelling, and it takes EITHER a tone
    // name or a literal colour — resolve which before handing it on, or a tone
    // name reaches the colour path and emits an invalid declaration.
    const background = attrs["background"] ?? attrs["bg"];
    const isTone = typeof background === "string" &&
      (FASTR_TONES as readonly string[]).includes(background.toLowerCase());
    const surface = surfaceFor({
      ...attrs,
      ...(isTone
        ? { tone: background as string, bg: "" }
        : background !== undefined
        ? { bg: background }
        : {}),
    });
    const width = oneOf(attrs, "width", DOC_WIDTHS, "normal");
    // `numbering=sections` numbers the TOP-LEVEL headings through a CSS
    // counter — a heading inside a block is not a document section, which is
    // the format's own rule, so nesting one never disturbs the sequence.
    const numbered = oneOf(attrs, "numbering", ["none", "sections"], "none") ===
      "sections";
    const page: FastrPageSetup = {
      size: oneOf(attrs, "pagesize", FASTR_PAGE_SIZES, "a4") as FastrPageSize,
      orientation: oneOf(
        attrs,
        "orientation",
        FASTR_PAGE_ORIENTATIONS,
        "portrait",
      ) as FastrPageOrientation,
      margin: oneOf(attrs, "margin", FASTR_PAGE_MARGINS, "normal") as FastrPageMargin,
    };
    return {
      className: [
        "fm-doc",
        `fm-doc--${width}`,
        ...(numbered ? ["fm-doc--numbered"] : []),
        ...surface.classes,
      ].join(" "),
      style: surface.style,
      extraAttrs: surface.extraAttrs,
      page,
      pageCss: fastrPageRuleCss(page),
    };
  }
  return empty;
}

// Figures take a width so a chart can break the text column — `wide` overhangs
// it, `full` goes edge to edge (same grid mechanism as a band).
export function figureWidthClass(attrs: FastrContainerAttrs): string {
  const w = oneOf(attrs, "width", DOC_WIDTHS, "normal");
  return w === "normal" ? "" : ` fm-figure--${w}`;
}

function attrText(attrs: FastrContainerAttrs, key: string): string | undefined {
  const v = attrs[key];
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

function oneOf(
  attrs: FastrContainerAttrs,
  key: string,
  allowed: readonly string[],
  fallback: string,
): string {
  const v = attrText(attrs, key)?.toLowerCase();
  return v !== undefined && allowed.includes(v) ? v : fallback;
}

function countAttr(
  attrs: FastrContainerAttrs,
  key: string,
  min: number,
  max: number,
  fallback: number,
): number {
  const raw = attrText(attrs, key);
  const n = raw === undefined ? NaN : Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function titleHtml(cls: string, text: string | undefined): string {
  return text === undefined
    ? ""
    : `<div class="${cls}">${escapeReportHtml(text)}</div>`;
}

const CALLOUT_KINDS = ["note", "info", "success", "warning", "danger"] as const;

// The cover compositions the stylesheet knows (`.fm-cover--<layout>`); the
// Insert menu's cover picker and the block segment's Layout control both read
// this list, so a layout cannot exist in one and not the other.
export const FASTR_COVER_LAYOUTS = [
  "classic",
  "centered",
  "poster",
  "spine",
  "frame",
  "split",
  "minimal",
  "block",
] as const;
export type FastrCoverLayout = (typeof FASTR_COVER_LAYOUTS)[number];
const STAT_DIRS = ["up", "down", "flat"] as const;

// Per-block markup, BEFORE the shared surface attributes are folded in.
function blockShapeFor(
  name: string,
  attrs: FastrContainerAttrs,
): Pick<FastrContainerHtml, "tag" | "className" | "leadingHtml" | "trailingHtml"> {
  switch (name) {
    case "callout": {
      const kind = oneOf(attrs, "kind", CALLOUT_KINDS, "note");
      return {
        tag: "div",
        className: `fm-callout fm-callout--${kind}`,
        leadingHtml: titleHtml("fm-callout__title", attrText(attrs, "title")),
        trailingHtml: "",
      };
    }
    case "tiles": {
      const cols = countAttr(attrs, "cols", 1, 4, 3);
      return {
        tag: "div",
        className: `fm-tiles fm-tiles--${cols}`,
        leadingHtml: "",
        trailingHtml: "",
      };
    }
    case "card": {
      // The historical `accent` flag is the old spelling of `tone=solid`; both
      // resolve to the same rule so existing bodies keep rendering.
      const accent = attrs["accent"] !== undefined ? " fm-card--accent" : "";
      return {
        tag: "div",
        className: `fm-card${accent}`,
        leadingHtml: titleHtml("fm-card__title", attrText(attrs, "title")),
        trailingHtml: "",
      };
    }
    case "stat": {
      const value = attrText(attrs, "value");
      const label = attrText(attrs, "label");
      const delta = attrText(attrs, "delta");
      const dir = oneOf(attrs, "dir", STAT_DIRS, "flat");
      const parts = [
        value === undefined
          ? ""
          : `<div class="fm-stat__value">${escapeReportHtml(value)}</div>`,
        label === undefined
          ? ""
          : `<div class="fm-stat__label">${escapeReportHtml(label)}</div>`,
        delta === undefined
          ? ""
          : `<div class="fm-stat__delta fm-stat__delta--${dir}">${
            escapeReportHtml(delta)
          }</div>`,
      ];
      return {
        tag: "div",
        className: "fm-stat",
        leadingHtml: parts.join(""),
        trailingHtml: "",
      };
    }
    case "columns": {
      const cols = countAttr(attrs, "cols", 1, 4, 2);
      return {
        tag: "div",
        className: `fm-columns fm-columns--${cols}`,
        leadingHtml: "",
        trailingHtml: "",
      };
    }
    case "col": {
      const span = countAttr(attrs, "span", 1, 4, 1);
      return {
        tag: "div",
        className: span > 1 ? `fm-col fm-col--span${span}` : "fm-col",
        leadingHtml: "",
        trailingHtml: "",
      };
    }
    case "quote": {
      const cite = attrText(attrs, "cite");
      return {
        tag: "blockquote",
        className: "fm-quote",
        leadingHtml: "",
        trailingHtml: cite === undefined
          ? ""
          : `<cite class="fm-quote__cite">${escapeReportHtml(cite)}</cite>`,
      };
    }
    // A full-bleed section: it escapes the text column entirely, which is the
    // single device that most makes a report read as designed. `kicker` and
    // `sub` are the masthead lines above and below the title — the small
    // letterspaced line and the rule-topped standfirst.
    case "band":
      return {
        tag: "section",
        className: "fm-band",
        leadingHtml: titleHtml("fm-kicker", attrText(attrs, "kicker")),
        trailingHtml: titleHtml("fm-dek", attrText(attrs, "sub")),
      };
    // A title page — full bleed and tall, and it breaks the page in print.
    // `layout` picks its composition (the stylesheet's fm-cover--* rules);
    // classic is the bare class, so existing covers render byte-identically.
    case "cover": {
      const layout = oneOf(attrs, "layout", FASTR_COVER_LAYOUTS, "classic");
      return {
        tag: "section",
        className: layout === "classic"
          ? "fm-band fm-cover"
          : `fm-band fm-cover fm-cover--${layout}`,
        leadingHtml: titleHtml("fm-kicker", attrText(attrs, "kicker")),
        trailingHtml: titleHtml("fm-dek", attrText(attrs, "sub")),
      };
    }
    // A table of contents. The renderer replaces the empty nav with the
    // document's own outline (fastrDocumentOutline + renderFastrTocHtml); an
    // author's `:::contents` line carries nothing but its attributes.
    case "contents":
      return {
        tag: "nav",
        className: "fm-toc",
        leadingHtml: "",
        trailingHtml: "",
      };
    // A numbered process list. The numbers come from a CSS counter, so the
    // author writes plain paragraphs and never renumbers by hand.
    case "steps":
      return {
        tag: "div",
        className: "fm-steps",
        leadingHtml: "",
        trailingHtml: "",
      };
    default:
      // An unknown name still renders (as a plain grouping div) so a typo never
      // swallows the author's content; listFastrContainerDefects flags it.
      return {
        tag: "div",
        className: `fm-block fm-block--${
          escapeReportHtml(name).replace(/[^a-z0-9-]/gi, "")
        }`,
        leadingHtml: "",
        trailingHtml: "",
      };
  }
}

// The class taxonomy here is the contract between this renderer, the theme
// stylesheets and the AI brief — renaming a class means updating all three.
export function containerHtmlFor(
  name: string,
  attrs: FastrContainerAttrs,
): FastrContainerHtml {
  // `report` is a document header, not content: it is read separately by
  // readFastrDocumentSettings and emits nothing here.
  if (name === "report") {
    return {
      tag: "div",
      className: "",
      style: "",
      extraAttrs: "",
      leadingHtml: "",
      trailingHtml: "",
      silent: true,
    };
  }
  const shape = blockShapeFor(name, attrs);
  const surface = surfaceFor(attrs);
  return {
    ...shape,
    className: [shape.className, ...surface.classes].join(" "),
    style: surface.style,
    extraAttrs: surface.extraAttrs,
    silent: false,
  };
}

// ── Table of contents ────────────────────────────────────────────────────────

export type FastrTocItem = {
  // 1..6, as written.
  level: number;
  // The heading's words, with inline syntax removed.
  text: string;
  // The anchor the heading carries and the entry links to.
  slug: string;
  // 1-based source line, so the editor can put the caret on the heading.
  line: number;
};

// The deepest heading level a table of contents shows unless asked otherwise.
export const FASTR_TOC_DEFAULT_DEPTH = 3;

const HEADING_SOURCE_RE = /^(#{1,6})\s+(.*)$/;

// A heading's words without the inline syntax: emphasis and code delimiters
// go, a `[phrase]{…}` mark keeps its phrase, a link keeps its label.
export function fastrPlainInlineText(text: string): string {
  return text
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]*)\]\{[^}]*\}/g, "$1")
    .replace(/(\*{1,3}|_{1,3}|`+)/g, "")
    .trim();
}

// A stable anchor. `seen` makes repeated headings unique in document order,
// so two "Findings" sections never link to the same place.
export function fastrTocSlug(text: string, seen: Map<string, number>): string {
  const base = fastrPlainInlineText(text)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  const stem = base.length > 0 ? base : "section";
  const n = (seen.get(stem) ?? 0) + 1;
  seen.set(stem, n);
  return n === 1 ? `fm-${stem}` : `fm-${stem}-${n}`;
}

// Every heading a table of contents lists. Headings inside a `:::cover` are
// the title page, not sections, so they are skipped; a heading in a code
// fence is literal text. Levels deeper than `depth` are left out.
export function fastrDocumentOutline(
  body: string,
  depth = FASTR_TOC_DEFAULT_DEPTH,
): FastrTocItem[] {
  const items: FastrTocItem[] = [];
  const seen = new Map<string, number>();
  // Depth of open containers, and the depth at which a cover opened.
  let open = 0;
  let coverAt: number | undefined;
  for (const { index, text, inCode, fence } of scanContainerLines(body.split("\n"))) {
    if (inCode) continue;
    if (fence) {
      if (fence.kind === "open") {
        if (isFastrLeafBlock(fence.name)) continue;
        open++;
        if (fence.name === "cover" && coverAt === undefined) coverAt = open;
        continue;
      }
      if (coverAt !== undefined && open === coverAt) coverAt = undefined;
      open = Math.max(0, open - 1);
      continue;
    }
    const m = HEADING_SOURCE_RE.exec(text);
    if (!m || coverAt !== undefined) continue;
    const level = m[1].length;
    // The slug is spent even for a skipped level, so a heading's anchor never
    // depends on which depth the table of contents happens to show.
    const slug = fastrTocSlug(m[2], seen);
    if (level > depth) continue;
    items.push({ level, text: fastrPlainInlineText(m[2]), slug, line: index + 1 });
  }
  return items;
}

// The markup both the renderer and the editor widget emit. An empty outline
// still renders the frame, so an author who inserts the block before writing
// any headings sees something rather than nothing.
export function renderFastrTocHtml(
  items: FastrTocItem[],
  opts: { title?: string; empty?: string } = {},
): string {
  const title = opts.title === undefined || opts.title.length === 0
    ? ""
    : `<div class="fm-toc__title">${escapeReportHtml(opts.title)}</div>`;
  const body = items.length === 0
    ? `<div class="fm-toc__empty">${
      escapeReportHtml(opts.empty ?? "No headings yet")
    }</div>`
    : `<ol class="fm-toc__list">${
      items.map((it) =>
        `<li class="fm-toc__item fm-toc__item--${it.level}"><a href="#${
          escapeReportHtml(it.slug)
        }" data-toc-line="${it.line}">${escapeReportHtml(it.text)}</a></li>`
      ).join("")
    }</ol>`;
  return `${title}${body}`;
}

// `:::contents{title="Contents" depth=3}` — what the block asked for.
export function fastrTocOptions(
  attrs: FastrContainerAttrs,
): { title: string | undefined; depth: number } {
  const depthText = attrText(attrs, "depth");
  const depth = depthText !== undefined && /^[1-6]$/.test(depthText)
    ? Number(depthText)
    : FASTR_TOC_DEFAULT_DEPTH;
  return { title: attrText(attrs, "title"), depth };
}

// ── The shared walk ──────────────────────────────────────────────────────────

const CODE_FENCE_RE = /^([`~]{3,})/;

export type FastrScannedLine = {
  // 0-based index into the input.
  index: number;
  text: string;
  // Inside a fenced code block — INCLUDING the opening and closing fence lines
  // themselves. A `:::` in there is literal text, not a container.
  inCode: boolean;
  // Parsed only when the line is not in a code block.
  fence: FastrContainerFence | undefined;
};

// The one code-fence-aware walk over a body. Three consumers need the same
// "is this line literal text?" answer and the same fence parse — the defect
// lister, the top-level line mask (report_sections.ts) and the container stack.
// They keep their own depth/stack/defect logic, which genuinely differs; what
// they must NOT keep is a private copy of this loop, because a drifting copy
// mis-nests an entire document in silence.
//
// `Iterable<string>` rather than `string[]` so CodeMirror can pass
// `doc.iterLines(1, n)` and never materialise the document as a string.
export function* scanContainerLines(
  lines: Iterable<string>,
): Generator<FastrScannedLine> {
  let codeFence: string | undefined;
  let index = 0;
  for (const text of lines) {
    const trimmed = text.trim();
    const cf = CODE_FENCE_RE.exec(trimmed);
    if (codeFence !== undefined) {
      if (cf && trimmed.startsWith(codeFence)) codeFence = undefined;
      yield { index, text, inCode: true, fence: undefined };
    } else if (cf) {
      codeFence = cf[1];
      yield { index, text, inCode: true, fence: undefined };
    } else {
      yield { index, text, inCode: false, fence: parseContainerFence(text) };
    }
    index++;
  }
}

// ── Defects ──────────────────────────────────────────────────────────────────

export type FastrContainerDefect = {
  // 1-based.
  line: number;
  message: string;
};

// Unclosed containers, stray closes and unknown block names. Fences inside a
// fenced code block are literal text and are skipped.
export function listFastrContainerDefects(body: string): FastrContainerDefect[] {
  const defects: FastrContainerDefect[] = [];
  const open: { name: string; line: number }[] = [];
  for (const { index: i, inCode, fence } of scanContainerLines(body.split("\n"))) {
    if (inCode || !fence) continue;
    if (fence.kind === "close") {
      if (open.length === 0) {
        defects.push({
          line: i + 1,
          message: "A `:::` close has no matching open block.",
        });
        continue;
      }
      open.pop();
      continue;
    }
    if (!isFastrBlockName(fence.name)) {
      defects.push({
        line: i + 1,
        message: `Unknown block \`${fence.name}\`. Available blocks: ${
          FASTR_BLOCK_NAMES.join(", ")
        }.`,
      });
    }
    // A background value that is neither an image, a colour nor a gradient used
    // to be dropped in silence — the author sees no background and no reason
    // why, which is worse than not supporting it.
    const bgAttr = fence.attrs["bg"] ?? fence.attrs["background"];
    if (
      typeof bgAttr === "string" && bgAttr.length > 0 &&
      !EMBED_BG_RE.test(bgAttr.trim()) &&
      safeCssBackground(bgAttr) === undefined &&
      !(FASTR_TONES as readonly string[]).includes(bgAttr.toLowerCase())
    ) {
      defects.push({
        line: i + 1,
        message:
          `\`${bgAttr}\` is not a background. Use a colour (#0b3d2e, rgb(…)), a gradient (linear-gradient(…)), an uploaded image (image:<id>), or a tone name.`,
      });
    }
    // A misspelt tone renders as the mildest one, which reads as "my styling
    // was ignored" rather than as a mistake — so say so.
    const tone = fence.attrs["tone"];
    if (
      typeof tone === "string" &&
      !(FASTR_TONES as readonly string[]).includes(tone.toLowerCase())
    ) {
      defects.push({
        line: i + 1,
        message: `Unknown tone \`${tone}\`. Available tones: ${
          FASTR_TONES.join(", ")
        }.`,
      });
    }
    if (!isFastrLeafBlock(fence.name)) {
      open.push({ name: fence.name, line: i + 1 });
    }
  }
  for (const o of open) {
    defects.push({
      line: o.line,
      message: `Block \`${o.name}\` is never closed with \`:::\`.`,
    });
  }
  return defects;
}

// Every `bg=`/`background=` whose value is a LITERAL — a colour, gradient or
// image, anything but a tone name. Literals deliberately do not follow a theme
// switch, so the AI write tools gate on this list: a model that reaches for
// one without the user having asked for an exact colour is steered back to
// tones. (Whether a literal value is a VALID background is
// listFastrContainerDefects' business, not this one's.)
export type FastrLiteralBackground = {
  // 1-based.
  line: number;
  value: string;
};

export function listFastrLiteralBackgrounds(
  body: string,
): FastrLiteralBackground[] {
  const literals: FastrLiteralBackground[] = [];
  for (
    const { index: i, inCode, fence } of scanContainerLines(body.split("\n"))
  ) {
    if (inCode || fence?.kind !== "open") continue;
    const bgAttr = fence.attrs["bg"] ?? fence.attrs["background"];
    if (
      typeof bgAttr === "string" && bgAttr.length > 0 &&
      !(FASTR_TONES as readonly string[]).includes(bgAttr.toLowerCase())
    ) {
      literals.push({ line: i + 1, value: bgAttr });
    }
  }
  return literals;
}

// ── Container stack + fence rewriting ────────────────────────────────────────
// What the editor toolbar stands on: "which block is my cursor in", and
// "change one attribute on that block's opening fence without disturbing
// anything else the author wrote on that line".

export type FastrOpenFence = {
  name: string;
  attrs: FastrContainerAttrs;
  // 1-based.
  line: number;
  markerLength: number;
  // Leading whitespace, so a rewrite can put the line back where it was.
  indent: string;
};

function openFenceFrom(
  text: string,
  fence: FastrContainerFence,
  line: number,
): FastrOpenFence | undefined {
  if (fence.kind !== "open") return undefined;
  return {
    name: fence.name,
    attrs: fence.attrs,
    line,
    markerLength: fence.markerLength,
    indent: text.slice(0, text.length - text.trimStart().length),
  };
}

// The open fence ON this line, if it is one. Leaf blocks never appear on the
// stack below, so this is the only way `:::stat` and `:::report` are reachable.
export function fastrOpenFenceOnLine(
  text: string,
  line: number,
): FastrOpenFence | undefined {
  const fence = parseContainerFence(text);
  return fence === undefined ? undefined : openFenceFrom(text, fence, line);
}

// The blocks still OPEN after walking `lines` — innermost last. Pass the
// document prefix you care about (lines 1..N-1 to ask what encloses line N).
// Leaf blocks are never pushed, exactly as listFastrContainerDefects treats
// them: they carry no closing fence, so pushing one mis-nests the rest of the
// document.
export function fastrContainerStackUpTo(
  lines: Iterable<string>,
): FastrOpenFence[] {
  const open: FastrOpenFence[] = [];
  for (const { index, text, inCode, fence } of scanContainerLines(lines)) {
    if (inCode || fence === undefined) continue;
    if (fence.kind === "close") {
      open.pop();
      continue;
    }
    if (isFastrLeafBlock(fence.name)) continue;
    open.push(openFenceFrom(text, fence, index + 1)!);
  }
  return open;
}

// Values that need no quoting. Deliberately narrow: it covers every value the
// blocks actually take (`3`, `up`, `wide`, `#0b3d2e`, `50%`) and quotes the
// rest rather than guessing.
const BARE_ATTR_VALUE_RE = /^[A-Za-z0-9_.:#%+\-\/]+$/;

export function serializeAttrValue(value: string): string {
  // A fence is one line and FENCE_RE's `\{[^}]*\}` cannot survive a `}`.
  const clean = value.replace(/[}\r\n]/g, "");
  if (BARE_ATTR_VALUE_RE.test(clean)) return clean;
  if (!clean.includes('"')) return `"${clean}"`;
  if (!clean.includes("'")) return `'${clean}'`;
  // ATTR_RE has no escape mechanism, so a value carrying both quote characters
  // cannot round-trip. A substituted curly quote beats a fence that no longer
  // parses — that would swallow the author's whole block.
  return `"${clean.replace(/"/g, "”")}"`;
}

function attrPairText(key: string, value: string | true): string {
  return value === true ? key : `${key}=${serializeAttrValue(value)}`;
}

// `{kind=warning title="Data caveat" accent}` — "" when nothing survives.
// A bare `true` emits the flag alone; an empty string drops the key, so
// clearing a title is "delete the attribute", not `title=""`.
export function serializeContainerAttrs(attrs: FastrContainerAttrs): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(attrs)) {
    if (value === "") continue;
    parts.push(attrPairText(key, value));
  }
  return parts.length === 0 ? "" : `{${parts.join(" ")}}`;
}

export function serializeContainerFence(
  name: string,
  attrs: FastrContainerAttrs = {},
  markerLength = 3,
): string {
  return `${":".repeat(Math.max(3, markerLength))}${name}${
    serializeContainerAttrs(attrs)
  }`;
}

type RawAttr = { key: string; start: number; end: number };

// Each attribute's key and its span within the `{…}` interior, in source order.
function rawAttrSpans(inner: string): RawAttr[] {
  const out: RawAttr[] = [];
  const re = new RegExp(ATTR_RE.source, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(inner)) !== null) {
    if (m[0].length === 0) {
      re.lastIndex++;
      continue;
    }
    out.push({
      key: m[1].toLowerCase(),
      start: m.index,
      end: m.index + m[0].length,
    });
  }
  return out;
}

export type FastrFencePatch = Record<string, string | true | undefined>;

// Rewrite ONE open-fence line. Untouched attributes keep their exact source
// spelling and position; `undefined` or "" deletes a key; a new key is
// appended. Returns undefined when the line is not an open fence.
//
// This is what keeps the format hand-editable under a GUI: a patch of `{}` is
// byte-identical to its input, so a toolbar click never rewrites the author's
// quoting, never churns the version-history diff, and never turns a one-word
// change into a whole-line replacement in a collab session.
export function updateContainerFenceLine(
  line: string,
  patch: FastrFencePatch,
): string | undefined {
  const trimmed = line.trim();
  const m = FENCE_RE.exec(trimmed);
  if (!m || m[2] === undefined) return undefined;
  const indent = line.slice(0, line.length - line.trimStart().length);
  const raw = m[3] ?? "";
  const head = raw.length === 0 ? trimmed : trimmed.slice(0, trimmed.indexOf("{"));
  const inner = raw.length === 0 ? "" : raw.slice(1, -1);

  const spans = rawAttrSpans(inner);
  const seen = new Set(spans.map((s) => s.key));
  let changed = false;
  let next = inner;
  // Back to front, so earlier spans keep their offsets.
  for (let i = spans.length - 1; i >= 0; i--) {
    const span = spans[i];
    if (!(span.key in patch)) continue;
    const value = patch[span.key];
    if (value === undefined || value === "") {
      // Swallow the separator in front of the attribute too, or the removal
      // leaves a double space behind.
      const from = i === 0 ? span.start : spans[i - 1].end;
      next = next.slice(0, from) + next.slice(span.end);
      changed = true;
      continue;
    }
    const replacement = attrPairText(span.key, value);
    if (replacement === next.slice(span.start, span.end)) continue;
    next = next.slice(0, span.start) + replacement + next.slice(span.end);
    changed = true;
  }
  const added: string[] = [];
  for (const [key, value] of Object.entries(patch)) {
    const k = key.toLowerCase();
    if (seen.has(k) || value === undefined || value === "") continue;
    added.push(attrPairText(k, value));
    changed = true;
  }
  // Nothing to do — hand back the author's exact line. This is the guarantee
  // the toolbar rests on: a click that changes nothing rewrites nothing, so
  // no diff, no Y.Text op, no churn in anyone else's collab session.
  if (!changed) return line;
  const body = [next.trim(), ...added].filter((s) => s.length > 0).join(" ");
  return `${indent}${head.trimEnd()}${body.length === 0 ? "" : `{${body}}`}`;
}
