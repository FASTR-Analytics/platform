// ⚠️  SYNCED FROM report-forge (github.com/NicholasWillmott/report-forge)
// ⚠️  DO NOT EDIT HERE - changes are overwritten on the next sync.
//     Edit the report-forge repo, then run its ./sync.

// =============================================================================
// The editor's page-template operations, as pure functions over a string:
// switch a page to another layout, add an item to a slot, add a missing
// slot, put content into an empty one. Like fastr_markdown_edits.ts, each
// returns changes with PRE-TRANSACTION offsets for ONE transaction, and the
// tests settle the rules without a browser.
//
// What a page holds (its slots, their items, what each lacks) is read from
// scanFastrPages, the validator's own scan, so an editor control and the AI
// validator never disagree about a page.
// =============================================================================

import {
  type FastrContainerAttrs,
  type FastrPageScan,
  type FastrSlotScan,
  isFastrLeafBlock,
  parseContainerFence,
  scanContainerLines,
  scanFastrPages,
  updateContainerFenceLine,
} from "./fastr_markdown_blocks.ts";
import type { EditResult } from "./fastr_markdown_edits.ts";
import {
  type FastrPageTemplate,
  fastrPageTemplate,
  type FastrTemplateAccepts,
  type FastrTemplateSlot,
} from "./fastr_page_templates.ts";

const NONE: EditResult = { changes: [] };

// Character offset of the start of 1-based `line1` (the document's length
// past its last line).
function lineFrom(lines: readonly string[], line1: number): number {
  let pos = 0;
  for (let i = 0; i < line1 - 1 && i < lines.length; i++) {
    pos += lines[i].length + 1;
  }
  return Math.min(pos, lines.join("\n").length);
}

// The page template a 1-based line stands in: on its fence, on its close or
// anywhere between. A page with no close is no page to edit.
export function fastrPageAtLine(
  doc: string,
  line1: number,
): FastrPageScan | undefined {
  return scanFastrPages(doc).pages.find((p) =>
    p.endLine !== undefined && p.line <= line1 && line1 <= p.endLine
  );
}

// The slot whose fence is on 1-based `line1`, and its page.
export function fastrSlotAtLine(
  doc: string,
  line1: number,
): { page: FastrPageScan; slot: FastrSlotScan } | undefined {
  const page = fastrPageAtLine(doc, line1);
  const slot = page?.slots.find((s) => s.line === line1);
  return page === undefined || slot === undefined || slot.endLine === undefined
    ? undefined
    : { page, slot };
}

// ── Items ────────────────────────────────────────────────────────────────────

// What an item a slot counts is: a stat, a card or a paragraph.
export type FastrSlotItemKind = "stats" | "cards" | "paragraphs";

export function fastrSlotItemKind(
  accepts: FastrTemplateAccepts | undefined,
): FastrSlotItemKind | undefined {
  return accepts === "stats" || accepts === "cards" || accepts === "paragraphs"
    ? accepts
    : undefined;
}

// Whether the slot on `line1` takes another item: it counts items and is
// under its layout's max.
export function fastrSlotTakesItem(slot: FastrSlotScan): boolean {
  const spec = slot.spec;
  if (fastrSlotItemKind(spec?.accepts) === undefined) return false;
  return spec?.max === undefined || slot.items < spec.max;
}

// The text a new item starts with, in the user's language (the caller's).
export type FastrSlotItemText = {
  statLabel: string;
  card: string;
  paragraph: string;
};

// One more item at the foot of the slot on 1-based `slotLine1`: a stat, a
// card or a paragraph after a blank line. Nothing at the layout's max. The
// selection covers the new item's text, to type over.
export function addPageSlotItemEdit(
  doc: string,
  slotLine1: number,
  text: FastrSlotItemText,
): EditResult {
  const at = fastrSlotAtLine(doc, slotLine1);
  if (at === undefined || at.slot.endLine === undefined) return NONE;
  const kind = fastrSlotItemKind(at.slot.spec?.accepts);
  if (kind === undefined || !fastrSlotTakesItem(at.slot)) return NONE;
  const lines = doc.split("\n");
  const close1 = at.slot.endLine;
  const above = lines[close1 - 2] ?? "";
  const from = lineFrom(lines, close1);
  if (kind === "stats") {
    const line = `:::stat{value="0" label="${quoteSafe(text.statLabel)}"}`;
    const start = from + ':::stat{value="'.length;
    return {
      changes: [{ from, to: from, insert: `${line}\n` }],
      selection: { anchor: start, head: start + 1 },
    };
  }
  if (kind === "cards") {
    const insert = `:::card\n${text.card}\n:::\n`;
    const start = from + ":::card\n".length;
    return {
      changes: [{ from, to: from, insert }],
      selection: { anchor: start, head: start + text.card.length },
    };
  }
  // A paragraph is an item when a blank line stands before it.
  const gap = at.slot.empty || above.trim().length === 0 ? "" : "\n";
  const start = from + gap.length;
  return {
    changes: [{ from, to: from, insert: `${gap}${text.paragraph}\n` }],
    selection: { anchor: start, head: start + text.paragraph.length },
  };
}

// A fence attribute value can hold anything but its own quote.
function quoteSafe(s: string): string {
  return s.replace(/"/g, "'");
}

// ── Slots ────────────────────────────────────────────────────────────────────

// The slots of its layout a page does not have, in the layout's order.
export function fastrMissingSlots(page: FastrPageScan): FastrTemplateSlot[] {
  const have = new Set(page.slots.map((s) => s.name));
  return (page.template?.slots ?? []).filter((s) => !have.has(s.name));
}

// An empty `name` slot just before the close of the page on `pageLine1`
// (after every other slot, so the main text stays one run).
export function addPageSlotEdit(
  doc: string,
  pageLine1: number,
  name: string,
): EditResult {
  const page = fastrPageAtLine(doc, pageLine1);
  if (page === undefined || page.line !== pageLine1) return NONE;
  if (page.endLine === undefined) return NONE;
  if (!fastrMissingSlots(page).some((s) => s.name === name)) return NONE;
  const lines = doc.split("\n");
  const from = lineFrom(lines, page.endLine);
  const fence = `:::slot{name=${name}}`;
  return {
    changes: [{ from, to: from, insert: `${fence}\n:::\n` }],
    selection: { anchor: from },
  };
}

// `content` (one or more lines) as the whole of the EMPTY slot on
// 1-based `slotLine1`: its blank lines go. Nothing when the slot holds
// anything already (a collaborator filled it meanwhile).
export function fillPageSlotEdit(
  doc: string,
  slotLine1: number,
  content: string,
): EditResult {
  const at = fastrSlotAtLine(doc, slotLine1);
  if (at === undefined || at.slot.endLine === undefined) return NONE;
  if (!at.slot.empty) return NONE;
  const lines = doc.split("\n");
  const from = lineFrom(lines, slotLine1 + 1);
  const to = lineFrom(lines, at.slot.endLine);
  return {
    changes: [{ from, to, insert: `${content}\n` }],
    selection: { anchor: from, head: from + content.length },
  };
}

// ── Layout ───────────────────────────────────────────────────────────────────

// What kind of content a slot holds, for matching slots across layouts.
type Family = "stats" | "cards" | "text" | "table" | "embed";

function familyOf(accepts: FastrTemplateAccepts | undefined): Family {
  switch (accepts) {
    case "stats":
      return "stats";
    case "cards":
      return "cards";
    case "table":
      return "table";
    case "media":
    case "figure":
      return "embed";
    default:
      return "text";
  }
}

// One `:::slot` of a page as written: its fence attributes and inner lines.
type WrittenSlot = {
  name: string | undefined;
  attrs: FastrContainerAttrs;
  fence: string;
  inner: string[];
  family: Family;
};

// A page's top level: its main lines (text in no slot) and its slots.
function readPage(
  lines: readonly string[],
  page: FastrPageScan,
): { main: string[]; slots: WrittenSlot[] } | undefined {
  if (page.endLine === undefined) return undefined;
  const main: string[] = [];
  const slots: WrittenSlot[] = [];
  let i = page.line; // 0-based index of the first line inside the page
  const close0 = page.endLine - 1;
  for (const s of page.slots) {
    if (s.endLine === undefined) return undefined;
    for (; i < s.line - 1; i++) main.push(lines[i]);
    const fenceText = lines[s.line - 1];
    const fence = parseContainerFence(fenceText);
    slots.push({
      name: s.name,
      attrs: fence?.kind === "open" ? fence.attrs : {},
      fence: fenceText,
      inner: lines.slice(s.line, s.endLine - 1),
      family: familyOf(s.spec?.accepts),
    });
    i = s.endLine;
  }
  for (; i < close0; i++) main.push(lines[i]);
  return { main, slots };
}

function trimBlank(lines: string[]): string[] {
  let a = 0;
  let b = lines.length;
  while (a < b && lines[a].trim().length === 0) a++;
  while (b > a && lines[b - 1].trim().length === 0) b--;
  return lines.slice(a, b);
}

const HEADING_RE = /^#{1,6}\s/;

// The first run of top-level `name` items (`:::stat` lines or `:::card`
// blocks, blank lines between them allowed) in `lines`, taken out.
function pullItemRun(
  lines: string[],
  name: "stat" | "card",
): { items: string[]; rest: string[] } | undefined {
  let depth = 0;
  let start = -1;
  let end = -1;
  let itemOpen = false;
  for (const { index, inCode, fence, text } of scanContainerLines(lines)) {
    if (inCode) {
      if (start >= 0 && !itemOpen) break;
      continue;
    }
    const blank = text.trim().length === 0;
    if (depth === 0 && fence?.kind === "open" && fence.name === name) {
      if (start < 0) start = index;
      if (isFastrLeafBlock(name)) end = index;
      else itemOpen = true;
    } else if (depth === 0 && start >= 0 && !blank) {
      break;
    }
    if (fence?.kind === "open" && !isFastrLeafBlock(fence.name)) depth++;
    if (fence?.kind === "close") {
      depth--;
      if (depth === 0 && itemOpen) {
        itemOpen = false;
        end = index;
      }
    }
  }
  if (start < 0 || end < start) return undefined;
  return {
    items: lines.slice(start, end + 1),
    rest: trimBlank([...lines.slice(0, start), ...lines.slice(end + 1)]),
  };
}

// The slots a layout's Insert-menu page writes even when empty (a photo or
// map box to fill), beside the ones it requires.
function writtenEmptySlots(t: FastrPageTemplate): Set<string> {
  const out = new Set<string>();
  for (const line of t.placeholder.split("\n")) {
    const fence = parseContainerFence(line);
    const name = fence?.kind === "open" && fence.name === "slot"
      ? fence.attrs["name"]
      : undefined;
    if (typeof name === "string") out.add(name.toLowerCase());
  }
  return out;
}

// The fence attributes a page or slot keeps in its new layout: its ground,
// and the ones the new layout declares. Anything else belongs to the old
// layout and would render where the new one does not style it.
const KEPT_ATTRS = ["tone", "bg", "background"];

// Attributes that hold the author's words (a slot's title, label or cite,
// a page's kicker, number or delta). One the new layout does not declare
// is not dropped with its fence: its words move into the content, a title
// or kicker as a bold line above it, a cite as an italic line under it.
const TEXT_ATTRS = ["title", "label", "kicker", "number", "delta", "cite"];

function carriedText(
  attrs: FastrContainerAttrs,
  keep: readonly string[],
): { lead: string[]; tail: string[] } {
  const lead: string[] = [];
  const tail: string[] = [];
  for (const k of TEXT_ATTRS) {
    const v = attrs[k];
    if (typeof v !== "string" || v.trim().length === 0 || keep.includes(k)) {
      continue;
    }
    if (k === "cite") tail.push(`*${v}*`);
    else if (k === "number" || k === "delta") lead.push(v);
    else lead.push(`**${v}**`);
  }
  return { lead, tail };
}

// A slot's lines in a slot that keeps `keep` of its attributes (none when
// it joins the main text).
function carriedInner(s: WrittenSlot, keep: readonly string[]): string[] {
  const { lead, tail } = carriedText(s.attrs, keep);
  if (lead.length === 0 && tail.length === 0) return s.inner;
  const parts = [lead, s.inner, tail].filter((p) => p.length > 0);
  return parts.flatMap((p, i) => i === 0 ? p : ["", ...p]);
}

function keptFence(
  text: string,
  keep: readonly string[],
  set: Record<string, string>,
): string {
  const fence = parseContainerFence(text);
  const patch: Record<string, string | undefined> = { ...set };
  if (fence?.kind === "open") {
    for (const k of Object.keys(fence.attrs)) {
      if (k in set) continue;
      if (!KEPT_ATTRS.includes(k) && !keep.includes(k)) patch[k] = undefined;
    }
  }
  return updateContainerFenceLine(text, patch) ?? text;
}

// The page on `pageLine1` rewritten in `layout`, keeping all of its content.
// Each old slot goes to the new slot of the same name and kind, then to any
// free slot of its kind; text that finds neither, and an embed or a grid
// with nowhere to go, joins the main text, so nothing is lost and the
// template chrome says what no longer fits. The page's heading moves to the
// new layout's heading area. The slots the new layout requires, and the
// photo or map boxes its Insert page writes, are added empty to be filled.
export function switchPageLayoutEdit(
  doc: string,
  pageLine1: number,
  layout: string,
): EditResult {
  const next = fastrPageTemplate(layout);
  const page = fastrPageAtLine(doc, pageLine1);
  if (next === undefined || page === undefined || page.line !== pageLine1) {
    return NONE;
  }
  if (page.template?.layout === next.layout) return NONE;
  const lines = doc.split("\n");
  const read = readPage(lines, page);
  if (read === undefined || page.endLine === undefined) return NONE;
  const oldHead = page.template?.headingArea ?? "main";
  const newHead = next.headingArea;

  let main = trimBlank(read.main);
  const old = read.slots.map((s) => ({ ...s, inner: trimBlank(s.inner) }));

  // The heading leaves the old heading area when the new layout keeps its
  // heading elsewhere.
  let heading: string | undefined;
  if (oldHead !== newHead) {
    const from = oldHead === "main"
      ? main
      : old.find((s) => s.name === oldHead)?.inner;
    const k = from?.findIndex((l) => HEADING_RE.test(l)) ?? -1;
    if (from !== undefined && k >= 0) {
      heading = from[k];
      from.splice(k, 1);
      const rest = trimBlank(from);
      from.splice(0, from.length, ...rest);
    }
  }

  // Old slots to new ones: by name and kind, then by kind. The new heading
  // area takes only what was the heading area, by name.
  const placed = new Map<string, WrittenSlot>();
  const homeless: WrittenSlot[] = [];
  const pending = old.filter((s) => s.inner.length > 0 || s.attrs["tone"]);
  const take = (s: WrittenSlot, spec: FastrTemplateSlot | undefined) => {
    if (spec === undefined) return false;
    placed.set(spec.name, s);
    return true;
  };
  const rest: WrittenSlot[] = [];
  for (const s of pending) {
    const spec = next.slots.find((n) =>
      n.name === s.name && !placed.has(n.name) &&
      familyOf(n.accepts) === s.family
    );
    if (!take(s, spec)) rest.push(s);
  }
  for (const s of rest) {
    const spec = next.slots.find((n) =>
      n.name !== newHead && !placed.has(n.name) &&
      familyOf(n.accepts) === s.family
    );
    if (!take(s, spec)) homeless.push(s);
  }
  // A stats or cards slot still empty takes a run of stats or cards from
  // the main text: what an earlier switch had nowhere to put comes back.
  for (const spec of next.slots) {
    const family = familyOf(spec.accepts);
    if (placed.has(spec.name) || (family !== "stats" && family !== "cards")) {
      continue;
    }
    const run = pullItemRun(main, family === "stats" ? "stat" : "card");
    if (run === undefined) continue;
    main = run.rest;
    placed.set(spec.name, {
      name: spec.name,
      attrs: {},
      fence: `:::slot{name=${spec.name}}`,
      inner: run.items,
      family,
    });
  }

  // Main text: the heading (when main is the new heading area), what was
  // main, then whatever found no slot, a blank line between each.
  const pageFence = parseContainerFence(lines[page.line - 1]);
  const pageText = carriedText(
    pageFence?.kind === "open" ? pageFence.attrs : {},
    next.attrs.map((a) => a.name),
  );
  const runs: string[][] = [];
  if (pageText.lead.length > 0) runs.push(pageText.lead);
  if (main.length > 0) runs.push(main);
  for (const s of homeless) {
    const inner = carriedInner(s, []);
    if (inner.length > 0) runs.push(inner);
  }
  main = runs.flatMap((r, i) => i === 0 ? r : ["", ...r]);
  if (heading !== undefined && newHead === "main") main = [heading, ...main];

  const out: string[] = [
    keptFence(
      lines[page.line - 1],
      next.attrs.map((a) => a.name),
      { layout: next.layout },
    ),
    ...main,
  ];
  const written = writtenEmptySlots(next);
  for (const spec of next.slots) {
    const s = placed.get(spec.name);
    if (spec.name === newHead && heading !== undefined) {
      out.push(
        s === undefined
          ? `:::slot{name=${spec.name}}`
          : keptFence(s.fence, spec.attrs ?? [], { name: spec.name }),
        heading,
        ...(s === undefined || s.inner.length === 0
          ? []
          : ["", ...carriedInner(s, spec.attrs ?? [])]),
        ":::",
      );
      continue;
    }
    if (s !== undefined) {
      out.push(
        keptFence(s.fence, spec.attrs ?? [], { name: spec.name }),
        ...carriedInner(s, spec.attrs ?? []),
        ":::",
      );
      continue;
    }
    if (spec.required || written.has(spec.name)) {
      out.push(`:::slot{name=${spec.name}}`, ":::");
    }
  }
  out.push(lines[page.endLine - 1]);

  const from = lineFrom(lines, page.line);
  const end = lineFrom(lines, page.endLine) + lines[page.endLine - 1].length;
  return {
    changes: [{ from, to: end, insert: out.join("\n") }],
    selection: { anchor: from },
  };
}
