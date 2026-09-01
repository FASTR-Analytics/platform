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
] as const;
export type FastrBlockName = (typeof FASTR_BLOCK_NAMES)[number];

// Leaf blocks are written as ONE line and take no closing fence — a stat is its
// attributes, so demanding a `:::` after it is pure friction.
export const FASTR_LEAF_BLOCK_NAMES: readonly string[] = ["stat"];

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
  // Emitted immediately after the opening tag (a callout/card title).
  leadingHtml: string;
  // Emitted immediately before the closing tag (a quote's citation).
  trailingHtml: string;
};

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

// The class taxonomy here is the contract between this renderer, the theme
// stylesheets and the AI brief — renaming a class means updating all three.
export function containerHtmlFor(
  name: string,
  attrs: FastrContainerAttrs,
): FastrContainerHtml {
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
