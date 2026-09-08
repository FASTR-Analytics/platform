// =============================================================================
// FASTR Markdown → printed pages. The stylesheet and the in-document runner
// that lay a report out as PAGES with Paged.js, appended to the same
// standalone document the .html export builds (theme sheet, rasters, fonts).
//
// The same two strings run in two places, which is the whole point:
//   • the editor's hidden layout frame, whose result draws the page boxes
//     between the author's lines;
//   • the server's headless Chrome, which prints the laid-out pages to PDF.
// One paginator, so the editor and the PDF cannot disagree about where a page
// starts. The result is published on window[FASTR_PAGED_GLOBAL] as a
// FastrPagedResult, in source-line terms (every rendered block carries a
// data-line anchor), which is what the editor needs and what the tests assert.
//
// Design rules the sheet enforces (grilled 2026-09-08):
//   • No designed block ever splits while it fits on a page; a heading keeps
//     with what follows it; table header rows repeat; orphans/widows at 3.
//   • A block taller than a page splits at row/item/paragraph boundaries as a
//     last resort, and the result lists it so the editor can flag it.
//   • The cover takes a whole page and bleeds to the paper edge on all sides
//     (a named page with zero margins); bands bleed side to side.
//   • Footer: title left, "Page N of M" right, nothing on a cover page.
// =============================================================================

import {
  FASTR_PAGE_MARGIN_MM,
  type FastrPageSetup,
  fastrSheetMm,
} from "./fastr_markdown_blocks.ts";
import { escapeReportHtml } from "./types/reports.ts";

// window[FASTR_PAGED_GLOBAL] once the runner has finished (or failed).
export const FASTR_PAGED_GLOBAL = "__fmPaged";

// The visually hidden element carrying the running footer's title.
export const FASTR_PRINT_TITLE_CLASS = "fm-print-title";

// The named page a cover takes. Letters only: it becomes part of a class name
// (pagedjs_<name>_page) and an @page identifier.
const COVER_PAGE_NAME = "fmcover";

// Blocks that never split while they fit on a page. Exported so the runner,
// the tests and the editor agree on what "atomic" means.
export const FASTR_PAGED_ATOMIC_SELECTORS: readonly string[] = [
  ".fm-callout",
  ".fm-card",
  ".fm-stat",
  ".fm-tiles",
  ".fm-columns",
  ".fm-quote",
  ".fm-band",
  ".fm-steps",
  ".fm-steps > *",
  ".fm-toc",
  ".fm-figure",
  "figure",
  "table",
  "tr",
  "ul",
  "ol",
  "li",
  "blockquote",
  "pre",
  "img",
];

export type FastrPagedFooter = {
  // The report label; goes bottom-left on every page but a cover's.
  title: string;
  // "Page" and "of", localised: `Page 3 of 12`.
  pageWord: string;
  ofWord: string;
};

export type FastrPagedPage = {
  // 1-based, as printed.
  number: number;
  // 0-based source line of the first anchored block on the page, or undefined
  // for a page with no anchored content (should not happen; kept honest).
  firstLine: number | undefined;
  // Every anchored source line on the page, ascending. The editor uses
  // firstLine for the gutter and this list to place breaks inside a rendered
  // block.
  lines: number[];
  // True when the page is a cover's (zero margins, no footer).
  cover: boolean;
};

export type FastrPagedSplit = {
  // 0-based source line of an ATOMIC block that had to be split because it
  // was taller than a page, and the page it starts on.
  line: number;
  page: number;
};

export type FastrPagedResult = {
  total: number;
  // The page box in CSS px, as laid out (sheet size at 96dpi).
  sheet: { width: number; height: number };
  pages: FastrPagedPage[];
  splits: FastrPagedSplit[];
  // Set when pagination could not run; pages is then empty.
  error?: string;
};

function cssString(s: string): string {
  return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

// The paged stylesheet. Appended AFTER the theme sheet (so it wins on order at
// equal specificity) and only in a paged render — the .html export keeps the
// browser's own print rules.
export function buildFastrPagedCss(
  page: FastrPageSetup,
  footer: FastrPagedFooter,
): string {
  const [w, h] = fastrSheetMm(page);
  const m = FASTR_PAGE_MARGIN_MM[page.margin];
  const footerType = `font-family: var(--fm-font-body);
    font-size: 8.5pt;
    color: var(--fm-ink-muted);
    vertical-align: middle;`;
  return `/* ── Paged layout (Paged.js) ─────────────────────────────────────────── */
/* The side margins are ZERO on the page and live on the content wrapper
   instead: a band that bleeds side to side then stays inside Paged.js's page
   box (its overflow test compares content width to the box), while the text
   column is inset by the same distance. Top and bottom margins stay on the
   page, where the running footer lives. */
@page {
  size: ${w}mm ${h}mm;
  margin: ${m}mm 0;
  @bottom-left {
    content: string(fm-title);
    text-align: left;
    padding-left: ${m}mm;
    ${footerType}
  }
  @bottom-right {
    content: ${cssString(footer.pageWord + " ")} counter(page) ${
    cssString(" " + footer.ofWord + " ")
  } counter(pages);
    text-align: right;
    padding-right: ${m}mm;
    font-variant-numeric: tabular-nums;
    ${footerType}
  }
}
/* A cover's page: no margins, no footer, so its ground reaches the paper edge. */
@page ${COVER_PAGE_NAME} {
  margin: 0;
  @bottom-left { content: none; }
  @bottom-right { content: none; }
}

/* The page is Paged.js's box now, not the viewport: no column cap, no page
   padding, and the bleed geometry is exactly the side inset. The runner reads
   the two --fm-print-* lengths to lay the source out at the column width
   before pagination (to find blocks taller than a page). */
html { overflow: visible; }
body { max-width: none; margin: 0; padding: 0; }
.pagedjs_page_content > div { padding: 0 ${m}mm; box-sizing: border-box; }
/* body too: the theme's html, body rule re-sets the bleed pair on <body>,
   which would otherwise win over the inherited root value. */
:root, body, .fm-doc--wide, .fm-doc--full {
  --fm-measure: 100%;
  --fm-bleed-margin: -${m}mm;
  --fm-bleed-pad: ${m}mm;
  --fm-print-column: ${w - 2 * m}mm;
  --fm-print-area: ${h - 2 * m}mm;
}
/* Each sheet paints the document ground; the runner copies a toned or
   image ground from <html> onto the boxes since a page is not the root. */
.pagedjs_pagebox { background: var(--fm-page); }
.${FASTR_PRINT_TITLE_CLASS} {
  display: block;
  height: 0;
  margin: 0;
  padding: 0;
  overflow: hidden;
  font-size: 1px;
  line-height: 0;
  string-set: fm-title content(text);
}
.${FASTR_PRINT_TITLE_CLASS} + * { margin-top: 0; }
/* The title span sits first in the flow; when a cover follows it, it must
   share the cover's named page, or Paged.js opens a blank default page for
   it and the cover lands on page 2. */
.${FASTR_PRINT_TITLE_CLASS}:has(+ .fm-cover) { page: ${COVER_PAGE_NAME}; }

/* ── Cover: its own page, edge to edge ─────────────────────────────────────── */
.fm-band.fm-cover {
  page: ${COVER_PAGE_NAME};
  break-after: page;
  break-inside: avoid;
  /* Side bleed through the wrapper's inset, no block margins: the named
     page's margins are 0, so the box below is the whole sheet. */
  margin: 0 var(--fm-bleed-margin);
  min-height: calc(var(--pagedjs-pagebox-height) - var(--pagedjs-margin-top) - var(--pagedjs-margin-bottom));
  box-sizing: border-box;
}

/* ── Keep-together, keep-with-next, orphans ────────────────────────────────── */
${FASTR_PAGED_ATOMIC_SELECTORS.join(",\n")} { break-inside: avoid; }
h1, h2, h3, h4, h5, h6 { break-after: avoid; break-inside: avoid; }
p, li, blockquote, .fm-toc__item { orphans: 3; widows: 3; }
/* Repeated header rows (cloned by the runner) never split from their table. */
thead { display: table-header-group; break-inside: avoid; }

/* ── Explicit breaks ───────────────────────────────────────────────────────── */
.fm-pagebreak { display: block; height: 0; margin: 0; padding: 0; break-after: page; }
[data-break="before"] { break-before: page; }
[data-break="after"] { break-after: page; }

/* ── Numbered sections under pagination ───────────────────────────────────── */
/* The theme sheet numbers body > h2. Paged.js applies counter declarations
   by matching each rule's selector against the SOURCE fragment at parse time
   (neither body nor the page boxes exist there), so the renderer stamps
   fm-numbered on the top-level headings of a numbered document and the
   counters ride on that class alone. Every counter is reset once on
   .pagedjs_pages by Paged.js itself. */
h2.fm-numbered {
  counter-increment: fm-sec;
  counter-reset: fm-sub 0;
}
h2.fm-numbered::before {
  content: counter(fm-sec) ". ";
  color: var(--fm-accent-text);
}
h3.fm-numbered { counter-increment: fm-sub; }
h3.fm-numbered::before {
  content: counter(fm-sec) "." counter(fm-sub) " ";
  color: var(--fm-accent-text);
}

/* ── Contents: page numbers ────────────────────────────────────────────────── */
.fm-toc__item a {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 1em;
}
.fm-toc__item a::after {
  content: target-counter(attr(href url), page);
  color: var(--fm-ink-muted);
  font-variant-numeric: tabular-nums;
}
`;
}

// The hidden title element the builder puts first in <body>: `string-set`
// reads its text into the running footer.
export function fastrPrintTitleHtml(title: string): string {
  return `<span class="${FASTR_PRINT_TITLE_CLASS}">${escapeReportHtml(title)}</span>`;
}

// The in-document runner. Assumes the Paged.js polyfill has loaded with
// window.PagedConfig = { auto: false } (so nothing runs before this) and
// publishes a FastrPagedResult on window[FASTR_PAGED_GLOBAL]. Plain ES5-ish
// script text on purpose: it is inlined into a document, not bundled.
export function fastrPagedRunnerJs(): string {
  const atomic = JSON.stringify(FASTR_PAGED_ATOMIC_SELECTORS.join(", "));
  return `(function () {
  var G = ${JSON.stringify(FASTR_PAGED_GLOBAL)};
  var ATOMIC = ${atomic};
  // The same blocks, minus the ones the pre-pass released as taller than a page.
  var ATOMIC_WHOLE = ATOMIC.split(", ").map(function (s) { return s + ":not([data-fm-overflow])"; }).join(", ");
  function publish(r) { window[G] = r; }
  function fail(e) {
    publish({ total: 0, sheet: { width: 0, height: 0 }, pages: [], splits: [],
      error: String(e && e.message ? e.message : e) });
  }
  if (!window.Paged || !window.PagedPolyfill) { fail("Paged.js did not load"); return; }
  var html = document.documentElement;
  var ground = window.getComputedStyle(html);
  // Blocks taller than a page cannot keep together. Paged.js would push such
  // a block whole to the next page (stranding its heading) and split it
  // there; releasing it here lets it start in place and split at the first
  // boundary its children allow (rows, items, paragraphs keep their own
  // rule). Measured with the source laid out at the print column's width,
  // which is the only moment that width is knowable before pagination.
  function releaseOverTall() {
    var mm = function (name) { return parseFloat(ground.getPropertyValue(name)) || 0; };
    var pxPerMm = 96 / 25.4;
    var column = mm("--fm-print-column");
    var area = mm("--fm-print-area") * pxPerMm;
    if (!(column > 0) || !(area > 0)) return;
    var body = document.body;
    var prev = { width: body.style.width, margin: body.style.margin };
    body.style.width = column + "mm";
    body.style.margin = "0";
    var blocks = document.querySelectorAll(ATOMIC);
    for (var i = 0; i < blocks.length; i++) {
      var b = blocks[i];
      if (b.classList.contains("fm-cover")) continue;
      if (b.getBoundingClientRect().height > area * 0.97) {
        b.style.breakInside = "auto";
        b.setAttribute("data-fm-overflow", "");
      }
    }
    body.style.width = prev.width;
    body.style.margin = prev.margin;
  }
  var groundStyle = {
    backgroundColor: ground.backgroundColor,
    backgroundImage: ground.backgroundImage,
    backgroundSize: ground.backgroundSize,
    backgroundPosition: ground.backgroundPosition,
    backgroundRepeat: ground.backgroundRepeat
  };
  // Paged.Handler is an ES class: it must be extended with class syntax.
  class FmHandler extends window.Paged.Handler {
    constructor(chunker, polisher, caller) { super(chunker, polisher, caller); }
    // A table continued on a new page gets its header row back. Paged.js
    // builds the continuation's table/tbody/tr chain itself (rebuildAncestors)
    // and then appends the first cell through this hook, so the header is
    // inserted the moment the first node lands inside a split table: before
    // the remaining rows are measured, so its height counts against the page.
    renderNode(clone, source) {
      var el = clone && clone.nodeType === 1 ? clone : clone && clone.parentElement;
      if (!el || !el.closest) return;
      var table = el.closest("table[data-split-from]");
      if (!table || table.querySelector(":scope > thead")) return;
      var src = source && source.nodeType === 1 ? source : source && source.parentElement;
      var srcTable = src && src.closest ? src.closest("table") : null;
      var thead = srcTable && srcTable.querySelector(":scope > thead");
      if (thead) table.insertBefore(thead.cloneNode(true), table.firstChild);
    }
    // Paged.js copies the stylesheet's break-inside: avoid onto the source as
    // a data attribute at parse time, and its text walker trusts that
    // attribute. A block the pre-pass released (taller than a page) must lose
    // it too, or the walker refuses every break inside it and the layout
    // loops back to re-render the block whole.
    afterParsed(parsed) {
      var released = parsed.querySelectorAll("[data-fm-overflow]");
      for (var i = 0; i < released.length; i++) {
        released[i].removeAttribute("data-break-inside");
      }
      // Paged.js marks "the displayed element after" a break-after: avoid
      // heading so its walker keeps the two together; in the detached source
      // it skips the heading's real neighbour and marks a later block, which
      // then drags an unrelated block back as the break point. Re-derive the
      // flag from plain sibling order: only the next element sibling of a
      // flagged element carries it.
      var flagged = parsed.querySelectorAll("[data-previous-break-after]");
      for (var f = 0; f < flagged.length; f++) {
        var el = flagged[f];
        var before = el.previousElementSibling;
        while (before && before.classList.contains(${JSON.stringify(FASTR_PRINT_TITLE_CLASS)})) {
          before = before.previousElementSibling;
        }
        if (!before || before.getAttribute("data-break-after") !== el.getAttribute("data-previous-break-after")) {
          el.removeAttribute("data-previous-break-after");
        }
      }
      var avoiders = parsed.querySelectorAll("[data-break-after]");
      for (var a = 0; a < avoiders.length; a++) {
        var next = avoiders[a].nextElementSibling;
        if (next && !next.hasAttribute("data-previous-break-after")) {
          next.setAttribute("data-previous-break-after", avoiders[a].getAttribute("data-break-after"));
        }
      }
    }
    // Keep-together and keep-with-next, made robust. Paged.js finds where the
    // overflow starts; when that is INSIDE a block that must stay whole (and
    // fits on a page), the break moves to the block itself, so the whole
    // block moves to the next page instead of leaving an empty shell behind.
    // Then, if a heading sits directly before that block, the break moves to
    // the heading, which keeps it with what follows. The overflow range is
    // widened to match, or the moved content would print twice. A block that
    // is already the first thing on the page is left to split (it cannot
    // move any further up).
    onBreakToken(breakToken, overflow, rendered) {
      if (!breakToken || !breakToken.node || !rendered) return;
      var node = breakToken.node;
      var el = node.nodeType === 1 ? node : node.parentElement;
      if (!el || !el.closest) return;
      var parent = rendered.parentElement;
      var box = parent ? parent.getBoundingClientRect() : null;
      var top = rendered.getBoundingClientRect().top;
      var renderedOf = function (source) {
        var ref = source.getAttribute && source.getAttribute("data-ref");
        return ref ? rendered.querySelector('[data-ref="' + ref + '"]') : null;
      };
      var firstOnPage = function (source) {
        var r = renderedOf(source);
        return r !== null && r.getBoundingClientRect().top - top < 4;
      };
      // A break at the page's FIRST block while that block fits would leave
      // the page empty and start the block over on the next one (the loop a
      // stray keep-with-next flag produced). Break at the first thing that
      // actually overflows instead: the first wrapper child beyond the page's
      // bottom or in Paged.js's overflow column to the right.
      var kids = rendered.children;
      var firstContent = kids[0];
      while (firstContent && firstContent.classList.contains(${JSON.stringify(FASTR_PRINT_TITLE_CLASS)})) {
        firstContent = firstContent.nextElementSibling;
      }
      if (box && el.nodeType === 1 && firstContent && renderedOf(el) === firstContent && breakToken.offset === 0) {
        var fr = firstContent.getBoundingClientRect();
        if (fr.bottom <= box.bottom + 1 && fr.left < box.right) {
          for (var k = 0; k < kids.length; k++) {
            var kr = kids[k].getBoundingClientRect();
            if (kr.top >= box.bottom || kr.left >= box.right) {
              var ref = kids[k].getAttribute("data-ref");
              var src = ref ? node.ownerDocument.querySelector('[data-ref="' + ref + '"]') : null;
              if (!src) src = breakToken.node.parentNode ? breakToken.node.parentNode.querySelector('[data-ref="' + ref + '"]') : null;
              if (src) {
                breakToken.node = src;
                breakToken.offset = 0;
                overflow.setStartBefore(kids[k]);
              }
              return;
            }
          }
          return;
        }
      }
      var block = el.closest(ATOMIC_WHOLE);
      if (!block) return;
      if (firstOnPage(block)) return;
      var target = block;
      for (;;) {
        var prev = target.previousElementSibling;
        while (prev && prev.classList && prev.classList.contains(${JSON.stringify(FASTR_PRINT_TITLE_CLASS)})) {
          prev = prev.previousElementSibling;
        }
        if (!prev || !/^H[1-6]$/.test(prev.tagName) || firstOnPage(prev)) break;
        target = prev;
      }
      breakToken.node = target;
      breakToken.offset = 0;
      var rt = renderedOf(target);
      if (rt) overflow.setStartBefore(rt);
    }
    // The document ground (a tone, a literal colour, an image) belongs to
    // every sheet; the page box is what the PDF prints.
    afterPageLayout(pageElement) {
      var box = pageElement.querySelector(".pagedjs_pagebox");
      if (!box) return;
      if (groundStyle.backgroundColor && groundStyle.backgroundColor !== "rgba(0, 0, 0, 0)") {
        box.style.backgroundColor = groundStyle.backgroundColor;
      }
      if (groundStyle.backgroundImage && groundStyle.backgroundImage !== "none") {
        box.style.backgroundImage = groundStyle.backgroundImage;
        box.style.backgroundSize = groundStyle.backgroundSize;
        box.style.backgroundPosition = groundStyle.backgroundPosition;
        box.style.backgroundRepeat = groundStyle.backgroundRepeat;
      }
    }
  }
  window.Paged.registerHandlers(FmHandler);
  function collect() {
    var pages = [];
    var splits = [];
    var boxes = document.querySelectorAll(".pagedjs_page");
    var sheet = { width: 0, height: 0 };
    for (var i = 0; i < boxes.length; i++) {
      var el = boxes[i];
      if (i === 0) {
        var r = el.getBoundingClientRect();
        sheet = { width: Math.round(r.width), height: Math.round(r.height) };
      }
      var anchored = el.querySelectorAll("[data-line]");
      var lines = [];
      for (var j = 0; j < anchored.length; j++) {
        var n = parseInt(anchored[j].getAttribute("data-line"), 10);
        if (!isNaN(n) && lines.indexOf(n) === -1) lines.push(n);
      }
      lines.sort(function (a, b) { return a - b; });
      var splitHeads = el.querySelectorAll("[data-split-to]");
      for (var k = 0; k < splitHeads.length; k++) {
        var s = splitHeads[k];
        if (!s.matches(ATOMIC)) continue;
        // Only the OUTERMOST split block is reported: a split band's inner
        // paragraph is the same event, not a second one.
        var outer = s.parentElement && s.parentElement.closest("[data-split-to]");
        if (outer && outer.matches(ATOMIC)) continue;
        var ln = parseInt(s.getAttribute("data-line"), 10);
        if (!isNaN(ln)) splits.push({ line: ln, page: i + 1 });
      }
      pages.push({
        number: i + 1,
        firstLine: lines.length > 0 ? lines[0] : undefined,
        lines: lines,
        cover: el.classList.contains("pagedjs_" + ${JSON.stringify(COVER_PAGE_NAME)} + "_page")
      });
    }
    publish({ total: boxes.length, sheet: sheet, pages: pages, splits: splits });
  }
  function ready() {
    var imgs = Array.prototype.slice.call(document.images);
    var decodes = imgs.map(function (img) {
      return img.decode ? img.decode().catch(function () {}) : Promise.resolve();
    });
    var fonts = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
    return Promise.all(decodes.concat([fonts]));
  }
  ready().then(function () {
    releaseOverTall();
    return window.PagedPolyfill.preview();
  }).then(function () {
    // A macrotask so target-counters and string-sets have been written. A
    // timer rather than an animation frame: a hidden layout frame (the
    // editor's) is not guaranteed frames, and neither is a headless run.
    return new Promise(function (res) { setTimeout(res, 0); });
  }).then(collect).catch(fail);
})();`;
}
