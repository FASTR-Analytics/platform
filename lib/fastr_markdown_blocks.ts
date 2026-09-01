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
  "report",
] as const;
export type FastrBlockName = (typeof FASTR_BLOCK_NAMES)[number];

// Leaf blocks are written as ONE line and take no closing fence — a stat is its
// attributes, and `report` is the document header, so demanding a `:::` after
// either is pure friction.
export const FASTR_LEAF_BLOCK_NAMES: readonly string[] = ["stat", "report"];

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
] as const;
export type FastrTone = (typeof FASTR_TONES)[number];

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

export type FastrDocumentSettings = {
  // Classes for <body> — the document ground, ink and column width.
  className: string;
  style: string;
  extraAttrs: string;
};

// The `:::report{...}` header, read straight from the body so page-level design
// is versioned and diffed with the document rather than living in config.
// First occurrence wins; fences inside code blocks are literal text.
export function readFastrDocumentSettings(body: string): FastrDocumentSettings {
  const empty = { className: "", style: "", extraAttrs: "" };
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
    return {
      className: ["fm-doc", `fm-doc--${width}`, ...surface.classes].join(" "),
      style: surface.style,
      extraAttrs: surface.extraAttrs,
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
    // single device that most makes a report read as designed.
    case "band":
      return {
        tag: "section",
        className: "fm-band",
        leadingHtml: "",
        trailingHtml: "",
      };
    // A title page — full bleed and tall, and it breaks the page in print.
    case "cover":
      return {
        tag: "section",
        className: "fm-band fm-cover",
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

// ── Defects ──────────────────────────────────────────────────────────────────

export type FastrContainerDefect = {
  // 1-based.
  line: number;
  message: string;
};

const CODE_FENCE_RE = /^([`~]{3,})/;

// Unclosed containers, stray closes and unknown block names. Fences inside a
// fenced code block are literal text and are skipped.
export function listFastrContainerDefects(body: string): FastrContainerDefect[] {
  const defects: FastrContainerDefect[] = [];
  const open: { name: string; line: number }[] = [];
  let codeFence: string | undefined;
  const lines = body.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
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
    if (!fence) continue;
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
