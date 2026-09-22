// Caret geometry for text edited ON the slide canvas.
//
// panther draws a text block with MarkdownRenderer.measureAndRender(rc,
// node.contentRpd, node.data) and keeps nothing afterwards. Re-running the
// public MarkdownRenderer.measure on the same (contentRpd, data) is
// deterministic, so it returns exactly the lines and runs on screen; the run
// placement below mirrors panther's placeRuns (formatted_text.ts). The source
// offsets come from lib/slide_text_offsets.ts. Title fields are plain
// MeasuredText primitives, placed the way CanvasRenderContext.rText writes them.
//
// Everything here is in page DU (the same space as the measured page and the
// hit regions); the overlay converts to screen pixels.

import {
  analyzeSlideMarkdown,
  assignRunsToUnit,
  type SlideTextAnalysis,
  type SlideTextUnit,
} from "lib";
import {
  CanvasRenderContext,
  MarkdownRenderer,
  quotedFontFamilyForCanvas,
  RectCoordsDims,
} from "panther";
import type {
  MarkdownRendererInput,
  MeasuredFormattedText,
  MeasuredMarkdownItem,
  MeasuredPage,
  MeasuredText,
  TextInfoUnkeyed,
} from "panther";

export type DuRect = { x: number; y: number; w: number; h: number };

type CaretStop = { src: number; x: number; line: number };

type VisualLine = {
  top: number;
  bottom: number;
  caretTop: number;
  caretBottom: number;
  /** Width of a space in this line's base font: where a caret after typed
   *  but not-yet-drawn spaces goes (markdown trims trailing whitespace and
   *  panther collapses whitespace runs, so those spaces have no glyph). */
  spaceW: number;
};

// One drawn char (or one drawn space standing for a whitespace run): the
// source range it covers and its horizontal extent.
type CharBox = { from: number; to: number; x0: number; x1: number; line: number };

export type TextGeometry = {
  kind: "markdown" | "plain";
  /** The source text this geometry was measured from. */
  source: string;
  /** The drawn text matches `source`: false while the canvas has not yet
   *  re-rendered the latest keystroke (a title's primitive is measured from
   *  the working slide, not from `source`). */
  inSync: boolean;
  editable: boolean;
  analysis?: SlideTextAnalysis;
  /** The block's (or title's) rectangle: outline + pointer capture. */
  bounds: DuRect;
  lines: VisualLine[];
  /** Sorted by src; a src can appear twice (a wrapped trailing space). */
  stops: CaretStop[];
  boxes: CharBox[];
  /** Where a caret on a line with no text sits (empty block, typed newline). */
  emptyLine: {
    x: number;
    top: number;
    caretTop: number;
    caretBottom: number;
    height: number;
    spaceW: number;
  };
};

export type CaretBox = { x: number; top: number; bottom: number };

let measureCtx: CanvasRenderingContext2D | undefined;
function ctx2d(): CanvasRenderingContext2D {
  if (!measureCtx) {
    measureCtx = document.createElement("canvas").getContext("2d")!;
  }
  return measureCtx;
}

function setFont(ctx: CanvasRenderingContext2D, ti: TextInfoUnkeyed) {
  const family = quotedFontFamilyForCanvas(ti.font.fontFamily);
  ctx.font = `${ti.font.italic ? "italic " : ""}${ti.font.weight} ${ti.fontSize}px ${family}`;
  try {
    (ctx as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing =
      ti.letterSpacing;
  } catch {
    // Older lib.dom without letterSpacing: measured without it, as panther.
  }
}

// ── Markdown blocks ─────────────────────────────────────────────────────────

type MeasuredNode = {
  type: "item" | "rows" | "cols";
  id: string;
  data?: unknown;
  contentRpd?: RectCoordsDims;
  rpd: RectCoordsDims;
  children?: MeasuredNode[];
};

function findItemNode(root: MeasuredNode, id: string): MeasuredNode | undefined {
  if (root.type === "item") return root.id === id ? root : undefined;
  for (const c of root.children ?? []) {
    const hit = findItemNode(c, id);
    if (hit) return hit;
  }
  return undefined;
}

function formattedTextOf(
  item: MeasuredMarkdownItem,
  groupIndex: number,
): { mft: MeasuredFormattedText; x: number; y: number } | undefined {
  switch (item.type) {
    case "paragraph":
    case "heading":
      return { mft: item.mFormattedText, x: item.position.x(), y: item.position.y() };
    case "list-item":
      return {
        mft: item.content.mFormattedText,
        x: item.content.position.x(),
        y: item.content.position.y(),
      };
    case "blockquote": {
      const p = item.paragraphs[groupIndex];
      return p ? { mft: p.mFormattedText, x: p.position.x(), y: p.position.y() } : undefined;
    }
    default:
      return undefined;
  }
}

function lineLeft(mft: MeasuredFormattedText, x: number, totalWidth: number): number {
  return mft.alignH === "left"
    ? x
    : mft.alignH === "right"
    ? x + mft.maxWidth - totalWidth
    : x + (mft.maxWidth - totalWidth) / 2;
}

function breakLength(src: string, at: number): number {
  if (src[at] === "<") {
    const m = /^<br\s*\/?>/i.exec(src.slice(at));
    if (m) return m[0].length;
  }
  return 1;
}

function addUnit(
  g: TextGeometry,
  rc: CanvasRenderContext,
  unit: SlideTextUnit,
  mft: MeasuredFormattedText,
  x: number,
  y: number,
): void {
  const lineHeight = mft.baseStyle.fontSize * mft.baseStyle.lineHeight;
  const spaceW = rc.mText(" ", mft.baseStyle, 99999).dims.w();
  const spans = assignRunsToUnit(
    unit.text,
    mft.lines.map((l) => l.runs.map((r) => r.mText.lines[0]?.text ?? "")),
  );
  let prevEnd = 0;
  mft.lines.forEach((line, li) => {
    const lx = lineLeft(mft, x, line.totalWidth);
    const top = y + line.y;
    const baseline = top + line.maxBaseline;
    let desc = 0;
    for (const r of line.runs) {
      const asc = r.mText.lines[0]?.y ?? 0;
      desc = Math.max(desc, r.mText.dims.h() - asc);
    }
    const asc = line.runs.length ? line.maxBaseline : mft.baseStyle.fontSize * 0.95;
    if (!line.runs.length) desc = mft.baseStyle.fontSize * 0.3;
    const lineIdx = g.lines.length;
    g.lines.push({
      top,
      bottom: top + lineHeight,
      caretTop: (line.runs.length ? baseline : top + asc) - asc,
      caretBottom: (line.runs.length ? baseline : top + asc) + desc,
      spaceW,
    });

    if (!line.runs.length) {
      // A line made by a break: the caret sits after that break.
      const k = unit.text.indexOf("\n", prevEnd);
      if (k >= 0) {
        const idx = k + 1;
        const src = idx < unit.text.length
          ? unit.toSrc[idx]
          : unit.toSrc[k] >= 0
          ? unit.toSrc[k] + breakLength(g.source, unit.toSrc[k])
          : -1;
        if (src >= 0) g.stops.push({ src, x: lx, line: lineIdx });
        prevEnd = idx;
      }
      return;
    }

    line.runs.forEach((run, ri) => {
      const span = spans[li]?.[ri];
      if (!span) return;
      const textX = lx + run.x + (run.background?.paddingLeft ?? 0);
      if (span.isSpace) {
        if (span.end <= span.start) return;
        const a = unit.toSrc[span.start];
        const b = unit.toSrc[span.end - 1];
        if (a < 0 || b < 0) return;
        const w = run.mText.dims.w();
        g.stops.push({ src: a, x: textX, line: lineIdx });
        g.stops.push({ src: b + 1, x: textX + w, line: lineIdx });
        g.boxes.push({ from: a, to: b + 1, x0: textX, x1: textX + w, line: lineIdx });
      } else {
        const text = run.mText.lines[0]?.text ?? "";
        const ti = run.mText.ti;
        const xs: number[] = [];
        for (let k = 0; k <= text.length; k++) {
          xs.push(
            k === 0
              ? 0
              : k === text.length
              ? run.mText.dims.w()
              : rc.mText(text.slice(0, k), ti, 99999).dims.w(),
          );
        }
        for (let k = 0; k < text.length; k++) {
          const s = unit.toSrc[span.start + k];
          if (s < 0) continue;
          g.stops.push({ src: s, x: textX + xs[k], line: lineIdx });
          g.stops.push({ src: s + 1, x: textX + xs[k + 1], line: lineIdx });
          g.boxes.push({
            from: s,
            to: s + 1,
            x0: textX + xs[k],
            x1: textX + xs[k + 1],
            line: lineIdx,
          });
        }
      }
      prevEnd = span.end;
    });
  });
}

function finalize(g: TextGeometry): TextGeometry {
  // Sort by src, then visual order; drop exact duplicates.
  g.stops.sort((a, b) => a.src - b.src || a.line - b.line || a.x - b.x);
  g.stops = g.stops.filter((s, i, arr) => {
    const p = arr[i - 1];
    return !p || p.src !== s.src || p.line !== s.line || Math.abs(p.x - s.x) > 0.01;
  });
  return g;
}

/** Geometry of a text layout block, or undefined when the block is not a text
 *  item on this measured page. */
export function buildBlockGeometry(
  mPage: MeasuredPage,
  blockId: string,
): TextGeometry | undefined {
  if (mPage.type !== "freeform") return undefined;
  const node = findItemNode(mPage.mLayout as unknown as MeasuredNode, blockId);
  if (!node || !node.contentRpd || !MarkdownRenderer.isType(node.data)) return undefined;
  const input = node.data as MarkdownRendererInput;
  const bounds = node.contentRpd;
  const rc = new CanvasRenderContext(ctx2d());
  const measured = MarkdownRenderer.measure(rc, bounds, input);
  const analysis = analyzeSlideMarkdown(input.markdown);

  // A one-letter block in the same style gives the metrics of an empty line.
  const probe = MarkdownRenderer.measure(rc, bounds, { ...input, markdown: "X" });
  const pItem = probe.markdownItems[0];
  const pft = pItem ? formattedTextOf(pItem, 0) : undefined;
  let emptyLine: TextGeometry["emptyLine"];
  if (pft && pft.mft.lines[0]) {
    const l = pft.mft.lines[0];
    const top = pft.y + l.y;
    const run = l.runs[0];
    const asc = run?.mText.lines[0]?.y ?? pft.mft.baseStyle.fontSize * 0.95;
    const desc = run ? run.mText.dims.h() - asc : pft.mft.baseStyle.fontSize * 0.3;
    const baseline = top + l.maxBaseline;
    emptyLine = {
      x: lineLeft(pft.mft, pft.x, 0),
      top,
      caretTop: baseline - asc,
      caretBottom: baseline + desc,
      height: pft.mft.baseStyle.fontSize * pft.mft.baseStyle.lineHeight,
      spaceW: rc.mText(" ", pft.mft.baseStyle, 99999).dims.w(),
    };
  } else {
    emptyLine = {
      x: bounds.x(),
      top: bounds.y(),
      caretTop: bounds.y(),
      caretBottom: bounds.y() + 30,
      height: 36,
      spaceW: 8,
    };
  }

  const g: TextGeometry = {
    kind: "markdown",
    source: input.markdown,
    inSync: true,
    editable: analysis.editable,
    analysis,
    bounds: { x: bounds.x(), y: bounds.y(), w: bounds.w(), h: bounds.h() },
    lines: [],
    stops: [],
    boxes: [],
    emptyLine,
  };
  if (!analysis.editable) return g;
  for (const unit of analysis.units) {
    const item = measured.markdownItems[unit.itemIndex];
    if (!item || item.type !== unit.itemType) {
      g.editable = false;
      return g;
    }
    const ft = formattedTextOf(item, unit.groupIndex);
    if (!ft) continue;
    addUnit(g, rc, unit, ft.mft, ft.x, ft.y);
  }
  return finalize(g);
}

// ── Title fields ────────────────────────────────────────────────────────────

type TextPrimitive = {
  type: "text";
  id: string;
  mText: MeasuredText;
  x: number;
  y: number;
  alignH: "left" | "center" | "right";
  alignV?: "top" | "middle" | "bottom";
  maxWidth?: number;
};

/** Geometry of a title/header text primitive over its plain-text field. */
export function buildTitleGeometry(
  mPage: MeasuredPage,
  primitiveId: string,
  source: string,
): TextGeometry | undefined {
  const prim = mPage.primitives.find(
    (p) => p.type === "text" && (p as TextPrimitive).id === primitiveId,
  ) as TextPrimitive | undefined;
  if (!prim) return undefined;
  const m = prim.mText;
  const h = m.dims.h();
  const top0 = prim.alignV === "middle" ? prim.y - h / 2 : prim.alignV === "bottom" ? prim.y - h : prim.y;
  const ctx = ctx2d();
  setFont(ctx, m.ti);
  const hitW = prim.maxWidth ?? m.dims.w();
  const hitX = prim.alignH === "center" ? prim.x - hitW / 2 : prim.alignH === "right" ? prim.x - hitW : prim.x;

  const words = (t: string) => t.split(/\s+/).filter(Boolean).join(" ");
  const g: TextGeometry = {
    kind: "plain",
    source,
    inSync: words(m.lines.map((l) => l.text).join(" ")) === words(source),
    editable: true,
    bounds: { x: hitX, y: top0, w: hitW, h },
    lines: [],
    stops: [],
    boxes: [],
    emptyLine: {
      x: prim.x,
      top: top0,
      caretTop: top0,
      caretBottom: top0 + m.ti.fontSize,
      height: m.ti.fontSize * 1.2,
      spaceW: ctx.measureText(" ").width,
    },
  };

  // measureText collapses whitespace and splits words on " ": walk the source
  // alongside each drawn line.
  let j = 0;
  let mapped = 0;
  let total = 0;
  m.lines.forEach((line, li) => {
    const w = line.w;
    const lx = prim.alignH === "center" ? prim.x - w / 2 : prim.alignH === "right" ? prim.x - w : prim.x;
    const metrics = ctx.measureText(line.text || "X");
    const asc = metrics.fontBoundingBoxAscent ?? m.ti.fontSize * 0.95;
    const desc = metrics.fontBoundingBoxDescent ?? m.ti.fontSize * 0.3;
    const baseline = top0 + line.y;
    const spaceW = ctx.measureText(" ").width;
    g.lines.push({
      top: baseline - asc,
      bottom: baseline + desc,
      caretTop: baseline - asc,
      caretBottom: baseline + desc,
      spaceW,
    });
    if (li === 0) {
      g.emptyLine = {
        x: lx,
        top: baseline - asc,
        caretTop: baseline - asc,
        caretBottom: baseline + desc,
        height: asc + desc,
        spaceW,
      };
    }
    const xs: number[] = [0];
    for (let k = 1; k <= line.text.length; k++) {
      xs.push(k === line.text.length ? w : ctx.measureText(line.text.slice(0, k)).width);
    }
    for (let k = 0; k < line.text.length; k++) {
      const c = line.text[k];
      total++;
      let s = -1;
      let end = -1;
      if (c === " ") {
        while (j < source.length && source[j] !== " " && /\s/.test(source[j])) j++;
        if (source[j] === " " || (j < source.length && /\s/.test(source[j]))) {
          s = j;
          while (j < source.length && source[j] !== "\n" && /\s/.test(source[j])) j++;
          end = j;
        }
      } else {
        let q = j;
        while (q < source.length && source[q] !== c && /\s/.test(source[q])) q++;
        if (source[q] === c) {
          s = q;
          end = q + 1;
          j = q + 1;
        }
      }
      if (s < 0) continue;
      mapped++;
      g.stops.push({ src: s, x: lx + xs[k], line: li });
      g.stops.push({ src: end, x: lx + xs[k + 1], line: li });
      g.boxes.push({ from: s, to: end, x0: lx + xs[k], x1: lx + xs[k + 1], line: li });
    }
  });
  // A field rendered through a transform we can't follow is not editable
  // on the canvas (the side panel still is).
  if (total > 0 && mapped < total) g.editable = false;
  return finalize(g);
}

// ── Queries ─────────────────────────────────────────────────────────────────

function newlinesBetween(src: string, a: number, b: number): number {
  let n = 0;
  for (let i = a; i < b; i++) if (src[i] === "\n") n++;
  return n;
}

function stopBox(g: TextGeometry, s: CaretStop): CaretBox {
  const l = g.lines[s.line];
  return { x: s.x, top: l.caretTop, bottom: l.caretBottom };
}

/** Where the caret for a source offset is drawn. */
export function caretAt(g: TextGeometry, offset: number): CaretBox {
  const { stops } = g;
  if (!stops.length) {
    const e = g.emptyLine;
    const before = g.source.slice(0, offset);
    const extra = newlinesBetween(g.source, 0, offset) * e.height;
    const spaces = before.length - before.lastIndexOf("\n") - 1;
    return {
      x: e.x + spaces * e.spaceW,
      top: e.caretTop + extra,
      bottom: e.caretBottom + extra,
    };
  }
  // Exact stop: the LAST one (a wrapped trailing space ends one line and
  // starts the next; the caret belongs at the next line's start).
  let lo = 0;
  let hi = stops.length - 1;
  let prev = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (stops[mid].src <= offset) {
      prev = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  if (prev >= 0 && stops[prev].src === offset) return stopBox(g, stops[prev]);
  const next = prev + 1 < stops.length ? prev + 1 : -1;
  const pSrc = prev >= 0 ? stops[prev].src : 0;
  const nPrev = newlinesBetween(g.source, pSrc, offset);
  if (next >= 0 && (prev < 0 || (nPrev > 0 && newlinesBetween(g.source, offset, stops[next].src) === 0))) {
    return stopBox(g, stops[next]);
  }
  if (prev < 0) return stopBox(g, stops[0]);
  if (nPrev > 0) {
    // A typed newline with nothing drawn after it yet: a virtual line below.
    const l = g.lines[stops[prev].line];
    const h = l.bottom - l.top || g.emptyLine.height;
    const dy = l.bottom - l.top + (nPrev - 1) * h;
    const x = g.emptyLine.x;
    const tail = g.source.slice(g.source.lastIndexOf("\n", offset - 1) + 1, offset);
    const spaces = /^[ \t]*$/.test(tail) ? tail.length : 0;
    return {
      x: x + spaces * g.emptyLine.spaceW,
      top: l.caretTop + dy,
      bottom: l.caretBottom + dy,
    };
  }
  // Typed spaces with no glyph yet: step the caret right by a space each,
  // never past the next glyph on the same line.
  const box = stopBox(g, stops[prev]);
  const gap = g.source.slice(pSrc, offset);
  if (/^[ \t]+$/.test(gap)) {
    const line = g.lines[stops[prev].line];
    const onLine = next >= 0 && stops[next].line === stops[prev].line;
    const room = onLine ? Math.max(0, stops[next].x - box.x) : Infinity;
    box.x += Math.min(gap.length * line.spaceW, room);
  }
  return box;
}

/** The source offset nearest a point (page DU). */
export function offsetAt(g: TextGeometry, x: number, y: number): number {
  if (!g.stops.length) return g.source.length;
  let best = -1;
  let bestD = Infinity;
  g.lines.forEach((l, i) => {
    const d = y < l.top ? l.top - y : y > l.bottom ? y - l.bottom : 0;
    if (d < bestD && g.stops.some((s) => s.line === i)) {
      bestD = d;
      best = i;
    }
  });
  let pick: CaretStop | undefined;
  let pickD = Infinity;
  for (const s of g.stops) {
    if (s.line !== best) continue;
    const d = Math.abs(s.x - x);
    if (d < pickD - 0.01 || (Math.abs(d - pickD) <= 0.01 && pick && s.src < pick.src)) {
      pick = s;
      pickD = d;
    }
  }
  return pick?.src ?? 0;
}

/** Highlight rectangles for a selection, one per visual line. */
export function selectionRects(g: TextGeometry, from: number, to: number): DuRect[] {
  if (from > to) [from, to] = [to, from];
  const byLine = new Map<number, { x0: number; x1: number }>();
  for (const b of g.boxes) {
    if (b.to <= from || b.from >= to) continue;
    const cur = byLine.get(b.line);
    if (cur) {
      cur.x0 = Math.min(cur.x0, b.x0);
      cur.x1 = Math.max(cur.x1, b.x1);
    } else byLine.set(b.line, { x0: b.x0, x1: b.x1 });
  }
  return [...byLine.entries()].map(([li, r]) => {
    const l = g.lines[li];
    return { x: r.x0, y: l.caretTop, w: r.x1 - r.x0, h: l.caretBottom - l.caretTop };
  });
}

export function isStop(g: TextGeometry, offset: number): boolean {
  return g.stops.some((s) => s.src === offset);
}

function posKey(s: CaretStop): string {
  return `${s.line}:${s.x.toFixed(2)}`;
}

/** One visual step left/right (logical order), landing on the lowest source
 *  offset of the target position so typing inherits the preceding style. */
export function stepOffset(g: TextGeometry, offset: number, dir: -1 | 1): number {
  const { stops } = g;
  if (!stops.length) return offset;
  const here = caretAt(g, offset);
  const hereKey = stops.find((s) => s.src === offset);
  const sameSpot = (s: CaretStop) =>
    hereKey ? posKey(s) === posKey(hereKey) : Math.abs(s.x - here.x) < 0.01;
  if (dir > 0) {
    const nxt = stops.find((s) => s.src > offset && !sameSpot(s));
    if (!nxt) {
      // Past the last glyph: typed trailing newlines are still reachable.
      return newlinesBetween(g.source, offset, g.source.length) > 0 ? g.source.length : offset;
    }
    return lowestAt(g, nxt);
  }
  for (let i = stops.length - 1; i >= 0; i--) {
    const s = stops[i];
    if (s.src < offset && !sameSpot(s)) return lowestAt(g, s);
  }
  return offset;
}

function lowestAt(g: TextGeometry, target: CaretStop): number {
  const key = posKey(target);
  let lowest = target.src;
  for (const s of g.stops) if (posKey(s) === key && s.src < lowest) lowest = s.src;
  return lowest;
}

function lineOf(g: TextGeometry, offset: number): number {
  const c = caretAt(g, offset);
  let best = 0;
  let bestD = Infinity;
  g.lines.forEach((l, i) => {
    const d = Math.abs((l.caretTop + l.caretBottom) / 2 - (c.top + c.bottom) / 2);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  });
  return best;
}

/** Up/down one visual line, keeping `goalX`. */
export function verticalOffset(
  g: TextGeometry,
  offset: number,
  dir: -1 | 1,
  goalX: number,
): number {
  if (!g.lines.length) return offset;
  const order = g.lines
    .map((l, i) => ({ i, mid: (l.caretTop + l.caretBottom) / 2 }))
    .sort((a, b) => a.mid - b.mid);
  const cur = order.findIndex((o) => o.i === lineOf(g, offset));
  const target = order[cur + dir];
  if (!target) {
    return dir < 0 ? (g.stops[0]?.src ?? 0) : g.source.length;
  }
  const l = g.lines[target.i];
  return offsetAt(g, goalX, (l.top + l.bottom) / 2);
}

/** Start or end of the caret's visual line. */
export function lineEdgeOffset(g: TextGeometry, offset: number, end: boolean): number {
  const li = lineOf(g, offset);
  const on = g.stops.filter((s) => s.line === li);
  if (!on.length) return offset;
  const pick = on.reduce((a, b) =>
    end ? (b.x > a.x || (b.x === a.x && b.src > a.src) ? b : a) : (b.x < a.x || (b.x === a.x && b.src < a.src) ? b : a)
  );
  return end ? pick.src : lowestAt(g, pick);
}
