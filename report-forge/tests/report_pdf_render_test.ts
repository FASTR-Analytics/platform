// ⚠️  SYNCED FROM report-forge (github.com/NicholasWillmott/report-forge)
// ⚠️  DO NOT EDIT HERE - changes are overwritten on the next sync.
//     Edit the report-forge repo, then run its ./sync.

// Renders the pagination fixtures (tests/fixtures/) through
// the REAL print path — the same document shell, theme sheet, paged sheet and
// Paged.js runner the client builds, printed by headless Chrome
// (server/paged_chrome.ts) — and asserts the pagination rules on
// the laid-out pages before printing:
//   • no atomic block is split while it fits on a page;
//   • no heading ends a page;
//   • a continued table starts with its header row;
//   • a cover with fill=page fills page 1 edge to edge and carries no footer;
//     any other cover is a band at the head of page 1, which keeps its footer;
//   • a :::pagebreak ends its page;
//   • the runner's page count is the PDF's page count.
// Per-page screenshots and the PDFs of a few themes are written to
// FASTR_PDF_OUT (when set) for eyeballing.
//
// Env-gated: needs CHROME_PATH (a chrome-headless-shell binary). Run:
//   CHROME_PATH=... LD_LIBRARY_PATH=... FASTR_PDF_OUT=/tmp/pdf_pages \
//     deno test -A report-forge/tests/report_pdf_render_test.ts

import { assert, assertEquals } from "@std/assert";
import {
  buildFastrPagedCss,
  buildFastrReportCss,
  FASTR_PAGED_ATOMIC_SELECTORS,
  FASTR_REPORT_THEMES,
  fastrPagedRunnerJs,
  fastrParagraphSplitsCss,
  fastrPrintTitleHtml,
  type FastrReportTheme,
  pagedDocumentScriptsHtml,
  readFastrDocumentSettings,
  renderFastrMarkdownToHtml,
  sizedPlaceholderImageSrc,
  wrapReportDocument,
} from "../engine/mod.ts";
import {
  isPrintRequestAllowed,
  launchChrome,
  printPagedDocument,
} from "../server/paged_chrome.ts";
import { createReportPdfRenderer } from "../server/renderer.ts";
import { FASTR_PAGED_GLOBAL } from "../engine/report_fastr_paged.ts";

const CHROME_PATH = Deno.env.get("CHROME_PATH");
const OUT_DIR = Deno.env.get("FASTR_PDF_OUT");
const POLYFILL_URL = new URL(
  "../ui/exports/vendor/paged.polyfill.min.js",
  import.meta.url,
);
const FIXTURE_DIR = new URL("./fixtures/", import.meta.url);

// A figure token has no raster here: a sized transparent box stands in, which
// is exactly what the editor's own layout frame does.
// A 16:9 box with those INTRINSIC dimensions: a 1px pixel with size
// attributes lays out square once it loads.
function withPlaceholderFigures(html: string): string {
  return html.replace(
    /<img src="figure:([^"]+)"/g,
    `<img src="${
      sizedPlaceholderImageSrc(1200, 675)
    }" width="1200" height="675" data-embed-kind="figure" data-embed-id="$1"`,
  );
}

async function buildDocument(
  body: string,
  theme: FastrReportTheme,
  title: string,
): Promise<string> {
  const polyfill = await Deno.readTextFile(POLYFILL_URL);
  const settings = readFastrDocumentSettings(body);
  return wrapReportDocument({
    title,
    bodyHtml: withPlaceholderFigures(
      renderFastrMarkdownToHtml(body, { lineAnchors: true }),
    ),
    themeCss: buildFastrReportCss(theme, undefined, "", {
      omitPrintRules: true,
    }),
    documentClass: settings.className,
    documentStyle: settings.style,
    headExtraCss: buildFastrPagedCss(settings.page, {
      title,
      pageWord: "Page",
      ofWord: "of",
    }),
    bodyPrefixHtml: fastrPrintTitleHtml(title),
    bodySuffixHtml: pagedDocumentScriptsHtml(polyfill, fastrPagedRunnerJs()),
  });
}

type Inspection = {
  pages: number;
  problems: string[];
  cover?: {
    page: number;
    fillsWidth: boolean;
    fillsHeight: boolean;
    flushTop: boolean;
    followed: boolean;
    footer: string;
  };
  continuedBands?: number;
  continuedSteps?: number;
  stepsContinuation?: string;
  page2Footer?: string;
  splitTables: number;
  // Every page template as laid out: the page it stands on, whether a page
  // cut it, and for one on a ground, that ground and the page box's.
  templates?: {
    page: number;
    split: boolean;
    toned: boolean;
    ground: string;
    box: string;
  }[];
  // Blank-line spaces in the laid-out document, and how many stand a line tall.
  spaces?: number;
  spacesTall?: number;
};

// Runs inside the laid-out document. Plain JS by construction (it is
// serialized), so no lib helpers here.
function inspectPages(atomic: string): Inspection {
  const pages = Array.from(
    document.querySelectorAll<HTMLElement>(".pagedjs_page"),
  );
  const problems: string[] = [];
  let splitTables = 0;
  const visible = (e: Element) =>
    e.getBoundingClientRect().height > 2 &&
    (e.textContent ?? "").trim().length > 0;
  const followedByContent = (h: Element, content: Element): boolean => {
    const walker = document.createTreeWalker(content, NodeFilter.SHOW_ELEMENT);
    walker.currentNode = h;
    while (walker.nextNode()) {
      const e = walker.currentNode as Element;
      if (h.contains(e)) continue;
      if (visible(e)) return true;
    }
    return false;
  };
  pages.forEach((pg, i) => {
    const content = pg.querySelector<HTMLElement>(".pagedjs_page_content");
    if (!content) {
      problems.push(`page ${i + 1}: no content box`);
      return;
    }
    const areaH = content.getBoundingClientRect().height;
    for (
      const el of Array.from(
        pg.querySelectorAll<HTMLElement>("[data-split-to]"),
      )
    ) {
      if (!el.matches(atomic)) continue;
      const outer = el.parentElement?.closest("[data-split-to]");
      if (outer && outer.matches(atomic)) continue;
      const ref = el.getAttribute("data-ref");
      let total = 0;
      for (
        const frag of Array.from(
          document.querySelectorAll(`[data-ref="${ref}"]`),
        )
      ) {
        total += frag.getBoundingClientRect().height;
      }
      if (total <= areaH * 0.98) {
        problems.push(
          `page ${i + 1}: ${el.tagName.toLowerCase()}.${
            el.className.split(" ")[0]
          } was split although it fits (${Math.round(total)}px of ${
            Math.round(areaH)
          }px)`,
        );
      }
    }
    for (const h of Array.from(pg.querySelectorAll("h1, h2, h3, h4, h5, h6"))) {
      if (h.closest(".fm-cover")) continue;
      if (!followedByContent(h, content)) {
        problems.push(
          `page ${i + 1}: heading "${
            (h.textContent ?? "").trim().slice(0, 40)
          }" ends the page`,
        );
      }
    }
    for (const t of Array.from(pg.querySelectorAll("table[data-split-from]"))) {
      splitTables++;
      if (!t.querySelector(":scope > thead")) {
        problems.push(`page ${i + 1}: continued table has no header row`);
      }
    }
    for (const pb of Array.from(pg.querySelectorAll(".fm-pagebreak"))) {
      if (followedByContent(pb, content)) {
        problems.push(
          `page ${i + 1}: content follows a page break on the same page`,
        );
      }
    }
  });
  const out: Inspection = { pages: pages.length, problems, splitTables };
  out.continuedBands =
    document.querySelectorAll(".fm-band[data-split-from]").length;
  const spaces = Array.from(document.querySelectorAll(".fm-space"));
  out.spaces = spaces.length;
  out.spacesTall =
    spaces.filter((s) => s.getBoundingClientRect().height > 8).length;
  out.templates = [];
  pages.forEach((pg, i) => {
    for (const t of Array.from(pg.querySelectorAll<HTMLElement>(".fm-tpl"))) {
      out.templates!.push({
        page: i + 1,
        split: t.hasAttribute("data-split-to") ||
          t.hasAttribute("data-split-from"),
        toned: t.classList.contains("fm-tone"),
        ground: getComputedStyle(t).backgroundColor,
        box: getComputedStyle(pg.querySelector(".pagedjs_pagebox")!)
          .backgroundColor,
      });
    }
  });
  out.continuedSteps =
    document.querySelectorAll(".fm-steps[data-split-from]").length;
  // Paged.js carries the step counter into a continuation by stamping the
  // running value on the first continued step (generated content itself is
  // not readable from script): it must not have started over.
  const cont = document.querySelector<HTMLElement>(
    ".fm-steps[data-split-from] > *",
  );
  out.stepsContinuation = cont?.getAttribute("data-counter-fm-step-value") ??
    undefined;
  const cover = document.querySelector<HTMLElement>(".fm-cover");
  if (cover) {
    const pg = cover.closest<HTMLElement>(".pagedjs_page");
    if (pg) {
      const pr = pg.getBoundingClientRect();
      const cr = cover.getBoundingClientRect();
      const foot = pg.querySelector<HTMLElement>(
        ".pagedjs_margin-bottom-right .pagedjs_margin-content",
      );
      out.cover = {
        page: pages.indexOf(pg) + 1,
        fillsWidth: Math.abs(cr.width - pr.width) < 3,
        fillsHeight: Math.abs(cr.height - pr.height) < 3,
        flushTop: Math.abs(cr.top - pr.top) < 3,
        // The report continues on the cover's page (a natural cover is not
        // a page of its own).
        followed: cover.nextElementSibling !== null,
        footer: foot ? getComputedStyle(foot, "::after").content : "missing",
      };
    }
  }
  const p2 = pages[1]?.querySelector<HTMLElement>(
    ".pagedjs_margin-bottom-right .pagedjs_margin-content",
  );
  if (p2) out.page2Footer = getComputedStyle(p2, "::after").content;
  return out;
}

function pdfPageCount(pdf: Uint8Array): number {
  const text = new TextDecoder("latin1").decode(pdf);
  return (text.match(/\/Type\s*\/Page(?![s\w])/g) ?? []).length;
}

async function fixtures(): Promise<{ name: string; body: string }[]> {
  const out: { name: string; body: string }[] = [];
  for await (const entry of Deno.readDir(FIXTURE_DIR)) {
    if (!entry.name.endsWith(".md")) continue;
    out.push({
      name: entry.name.replace(/\.md$/, ""),
      body: await Deno.readTextFile(new URL(entry.name, FIXTURE_DIR)),
    });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

// The full sweep: the kitchen sink on every theme; every fixture on a light,
// a dark and a loud theme. Screenshots for that second set only.
const SCREENSHOT_THEMES: FastrReportTheme[] = [
  "default",
  "ministry",
  "bauhaus",
];

Deno.test({
  name: "fixture reports paginate by the rules on every theme, and print",
  ignore: CHROME_PATH === undefined,
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const browser = await launchChrome(CHROME_PATH!);
    const atomic = FASTR_PAGED_ATOMIC_SELECTORS.join(", ");
    const failures: string[] = [];
    try {
      const all = await fixtures();
      assert(all.length >= 6, "fixture corpus present");
      const sink = all.find((f) => f.name === "kitchen_sink")!;
      const matrix: { fixture: typeof sink; theme: FastrReportTheme }[] = [];
      for (const theme of FASTR_REPORT_THEMES) {
        matrix.push({ fixture: sink, theme });
      }
      for (const theme of SCREENSHOT_THEMES) {
        for (const fixture of all) {
          if (fixture.name !== "kitchen_sink") matrix.push({ fixture, theme });
        }
      }
      for (const { fixture, theme } of matrix) {
        const label = `${fixture.name}@${theme}`;
        const html = await buildDocument(
          fixture.body,
          theme,
          `Fixture ${fixture.name}`,
        );
        let inspection: Inspection | undefined;
        const { pdf, result } = await printPagedDocument(browser, html, {
          timeoutMs: 60_000,
          inspect: async (page, res) => {
            inspection = await page.evaluate(inspectPages, { args: [atomic] });
            if (OUT_DIR && SCREENSHOT_THEMES.includes(theme)) {
              const dir = `${OUT_DIR}/${theme}/${fixture.name}`;
              await Deno.mkdir(dir, { recursive: true });
              for (let n = 1; n <= res.total; n++) {
                const el = await page.$(`.pagedjs_page:nth-child(${n})`);
                if (!el) continue;
                await el.scrollIntoView();
                const png = await el.screenshot();
                await Deno.writeFile(
                  `${dir}/page-${String(n).padStart(2, "0")}.png`,
                  png,
                );
              }
            }
          },
        });
        if (OUT_DIR && SCREENSHOT_THEMES.includes(theme)) {
          await Deno.mkdir(`${OUT_DIR}/${theme}/${fixture.name}`, {
            recursive: true,
          });
          await Deno.writeFile(
            `${OUT_DIR}/${theme}/${fixture.name}/report.pdf`,
            pdf,
          );
        }
        const ins = inspection!;
        const local: string[] = [...ins.problems];
        if (ins.pages !== result.total) {
          local.push(
            `runner counted ${result.total} pages, DOM has ${ins.pages}`,
          );
        }
        const printed = pdfPageCount(pdf);
        if (printed !== result.total) {
          local.push(`PDF has ${printed} pages, layout has ${result.total}`);
        }
        if (fixture.body.includes(":::cover")) {
          const fills = /:::cover\{[^}]*\bfill=page\b/.test(fixture.body);
          if (!ins.cover) local.push("cover missing from the laid-out pages");
          else if (fills) {
            if (ins.cover.page !== 1) {
              local.push(`cover on page ${ins.cover.page}`);
            }
            if (!ins.cover.fillsWidth || !ins.cover.fillsHeight) {
              local.push("cover does not fill its page");
            }
            if (ins.cover.footer !== "none" && ins.cover.footer !== "normal") {
              local.push(`cover page carries a footer: ${ins.cover.footer}`);
            }
            if (!result.pages[0]?.cover) {
              local.push("runner did not mark page 1 as a cover");
            }
          } else {
            if (ins.cover.page !== 1) {
              local.push(`cover on page ${ins.cover.page}`);
            }
            if (!ins.cover.fillsWidth) {
              local.push("cover does not bleed to the sheet's sides");
            }
            if (ins.cover.fillsHeight) {
              local.push("a natural cover fills its page");
            }
            if (!ins.cover.flushTop) {
              local.push("a natural cover does not hug the top of its page");
            }
            // The report continues on the cover's page when the next block
            // fits (many_sections opens with prose; landscape's next block
            // is a table taller than the room left).
            if (fixture.name === "many_sections" && !ins.cover.followed) {
              local.push("nothing follows the natural cover on its page");
            }
            if (!result.pages[0]?.flushTop) {
              local.push("runner did not mark page 1 as flush to the top");
            }
            if (
              ins.cover.footer === "none" || ins.cover.footer === "normal" ||
              ins.cover.footer === "missing"
            ) {
              local.push("page 1 with a natural cover has no footer");
            }
            if (result.pages[0]?.cover) {
              local.push("runner marked page 1 as a cover page");
            }
          }
        }
        if (result.total > 1 && !fixture.body.includes(":::cover")) {
          if (ins.page2Footer === undefined || ins.page2Footer === "none") {
            local.push("page 2 has no footer");
          }
        }
        if (fixture.name === "long_table") {
          if (ins.splitTables === 0) local.push("the long table never split");
          if (!result.splits.some((s) => s.page === 1)) {
            local.push("the runner reported no split for the long table");
          }
        }
        // A band or a steps block keeps whole like every block; one taller
        // than a page continues, reported as an overflow split, and the
        // continuation keeps counting.
        if (fixture.name === "long_band") {
          if (ins.continuedBands === 0) {
            local.push("the long band did not continue onto a second page");
          }
          if (result.splits.length === 0) {
            local.push(
              "the runner did not report the long band as an overflow split",
            );
          }
        }
        if (fixture.name === "long_steps") {
          if (ins.continuedSteps === 0) {
            local.push(
              "the long steps block did not continue onto a second page",
            );
          }
          const first = Number(ins.stepsContinuation);
          if (!(first > 1)) {
            local.push(
              `the continued steps restarted their numbering (first continued step: ${
                ins.stepsContinuation ?? "unstamped"
              })`,
            );
          }
        }
        // Sixty blank lines: the first is the separator, the other fifty-nine
        // are lines of space, each a line tall, and the run breaks across the
        // page like text, so page 2 opens on one of them.
        if (fixture.name === "spaces") {
          if (ins.spaces !== 59) {
            local.push(`${ins.spaces} spaces laid out, expected 59`);
          }
          if (ins.spacesTall !== ins.spaces) {
            local.push(
              `${ins.spacesTall} of ${ins.spaces} spaces stand a line tall`,
            );
          }
          const first = result.pages[1]?.firstLine;
          if (
            result.total < 2 || first === undefined || first < 4 || first > 62
          ) {
            local.push(
              `page 2 opens on line ${first} (${result.total} pages), expected inside the run of blank lines`,
            );
          }
        }
        // Every template takes exactly one page, holds its example without
        // an overfull area, and a toned one paints its whole sheet.
        if (fixture.name === "page_templates") {
          const tpls = ins.templates ?? [];
          const count = (fixture.body.match(/^:::page\{/gm) ?? []).length;
          if (tpls.length !== count) {
            local.push(`${tpls.length} templates laid out, expected ${count}`);
          }
          if (result.total !== count + 1) {
            local.push(`${result.total} pages, expected ${count + 1}`);
          }
          if (new Set(tpls.map((t) => t.page)).size !== tpls.length) {
            local.push("two templates share a page");
          }
          for (const t of tpls) {
            if (t.split) local.push(`page ${t.page}: a template was cut`);
            if (t.toned && t.ground !== t.box) {
              local.push(
                `page ${t.page}: the template's ground ${t.ground} is not the sheet's ${t.box}`,
              );
            }
          }
          for (const p of result.pages) {
            for (const o of p.overfull ?? []) {
              local.push(
                `page ${p.number}: the ${o.area} area is ${o.px}px overfull`,
              );
            }
          }
        }
        if (fixture.name === "explicit_breaks" && result.total !== 4) {
          local.push(
            `explicit breaks laid out to ${result.total} pages, expected 4`,
          );
        }
        if (
          fixture.name === "landscape" &&
          result.sheet.width < result.sheet.height
        ) {
          local.push("landscape sheet is portrait");
        }
        // Every page (bar the first) starts at a known source line, and
        // reports how much of the sheet its content fills (the editor seeds
        // its page boxes from it): more than nothing, never past the sheet.
        for (const pg of result.pages) {
          if (pg.number > 1 && pg.firstLine === undefined) {
            local.push(`page ${pg.number} has no first line`);
          }
          if (
            !(pg.contentHeight > 0) || pg.contentHeight > result.sheet.height
          ) {
            local.push(
              `page ${pg.number} content height ${pg.contentHeight} of a ${result.sheet.height}px sheet`,
            );
          }
        }
        for (const l of local) failures.push(`${label}: ${l}`);
        console.log(
          `${label}: ${result.total} pages, ${result.splits.length} splits${
            local.length > 0 ? `, ${local.length} PROBLEMS` : ""
          }`,
        );
      }
    } finally {
      await browser.close();
    }
    assertEquals(failures, []);
  },
});

// A paragraph the editor ran on to the next page: the export names the row
// (fastrParagraphSplitsCss) and the runner cuts the paragraph there, so the
// page ends on the row before it and the next opens on it.
Deno.test({
  name: "a paragraph splits across pages at the row the editor chose",
  ignore: CHROME_PATH === undefined,
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const lorem =
      "Lorem ipsum dolor sit amet consectetur adipiscing elit. Quisque faucibus ex sapien vitae pellentesque sem placerat. In id cursus mi pretium tellus duis convallis. Tempus leo eu aenean sed diam urna tempor. Pulvinar vivamus fringilla lacus nec metus bibendum egestas. Iaculis massa nisl malesuada lacinia integer nunc posuere. Ut hendrerit semper vel class aptent taciti sociosqu. Ad litora torquent per conubia nostra inceptos himenaeos.";
    const lines = ["# Long paragraph test", ""];
    for (let k = 0; k < 8; k++) lines.push(`(${k + 1}) ${lorem}`, "");
    const body = lines.join("\n");
    // Paragraph (6) is on source line 12; the editor keeps three rows of it
    // on page 1 (probe, 2026-09-21).
    const html = (await buildDocument(body, "default", "T")).replace(
      "</head>",
      `<style>${
        fastrParagraphSplitsCss([{ line: 12, rows: [3] }])
      }</style></head>`,
    );
    const browser = await launchChrome(CHROME_PATH!);
    try {
      let texts: string[] = [];
      const { result } = await printPagedDocument(browser, html, {
        timeoutMs: 60_000,
        inspect: async (page) => {
          texts = await page.evaluate(() =>
            Array.from(document.querySelectorAll(".pagedjs_page_content")).map((
              el,
            ) => (el as HTMLElement).innerText.replace(/\s+/g, " ").trim())
          );
        },
      });
      assertEquals(result.total, 2);
      assert(
        texts[0].endsWith("(6) " + lorem.slice(0, lorem.indexOf(" bibendum"))),
        `page 1 ends: ${texts[0].slice(-60)}`,
      );
      assert(
        texts[1].startsWith("bibendum egestas."),
        `page 2 starts: ${texts[1].slice(0, 60)}`,
      );
    } finally {
      await browser.close();
    }
  },
});

// The regression this pins (2026-10-14): a figure shaped taller than the page
// (a stack of small multiples) under a section heading. The image's ceiling
// left room for its caption but not for the heading, so the two could not
// share a page and print left the heading alone on one. The ceiling is now
// the page less the MEASURED figure reserve (FASTR_FIGURE_PAGE_CEILING's
// note), on every theme, whatever its heading cut and figure frame.
Deno.test({
  name:
    "a portrait figure under a section heading shares its page, on every theme",
  ignore: CHROME_PATH === undefined,
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const prose =
      "Completeness is not uniform across the six regions. Two regions report above 98% while two sit in the mid-80s, a gap of roughly fifteen percentage points.";
    const body = [
      prose,
      "",
      "## Where completeness is slipping",
      "",
      "![Geographic pattern of completeness, 2025 year-to-date](figure:tall)",
      "",
      "# Regional variation",
      "",
      "![Completeness by region and month](figure:tall2)",
      "",
      prose,
    ].join("\n");
    const browser = await launchChrome(CHROME_PATH!);
    const failures: string[] = [];
    try {
      for (const theme of FASTR_REPORT_THEMES) {
        const html = (await buildDocument(body, theme, "T")).replace(
          /<img src="[^"]*" width="1200" height="675" data-embed-kind="figure" data-embed-id="(tall2?)"/g,
          `<img src="${
            sizedPlaceholderImageSrc(1200, 2000)
          }" width="1200" height="2000" data-embed-kind="figure" data-embed-id="$1"`,
        );
        let seen: {
          reserve: string;
          pages: { headings: string[]; figures: number; overflow: number }[];
        } | undefined;
        const { result } = await printPagedDocument(browser, html, {
          timeoutMs: 60_000,
          inspect: async (page) => {
            seen = await page.evaluate(() => ({
              reserve: document.documentElement.style.getPropertyValue(
                "--fm-fig-reserve",
              ),
              pages: Array.from(
                document.querySelectorAll<HTMLElement>(".pagedjs_page"),
              ).map((pg) => {
                const box = pg.querySelector(".pagedjs_page_content")!
                  .getBoundingClientRect();
                const figs = Array.from(pg.querySelectorAll("figure"));
                return {
                  headings: Array.from(pg.querySelectorAll("h1, h2")).map((
                    h,
                  ) => (h.textContent ?? "").trim()),
                  figures: figs.length,
                  overflow: Math.max(
                    0,
                    ...figs.map((f) =>
                      f.getBoundingClientRect().bottom - box.bottom
                    ),
                  ),
                };
              }),
            }));
          },
        });
        const s = seen!;
        const local: string[] = [];
        if (!(parseFloat(s.reserve) > 0)) local.push("no figure reserve");
        // Each heading opens a page with its figure under it; nothing else
        // decides the count (the closing prose may or may not fit under the
        // second figure, by theme).
        for (
          const h of ["Where completeness is slipping", "Regional variation"]
        ) {
          const pg = s.pages.findIndex((p) =>
            p.headings.some((t) => t.toLowerCase() === h.toLowerCase())
          );
          if (pg < 0) local.push(`heading "${h}" missing`);
          else if (s.pages[pg].figures !== 1) {
            local.push(
              `heading "${h}" on page ${pg + 1} with ${
                s.pages[pg].figures
              } figures`,
            );
          }
        }
        for (const [n, pg] of s.pages.entries()) {
          if (pg.headings.length > 0 && pg.figures === 0) {
            local.push(`page ${n + 1}: heading without its figure`);
          }
          if (pg.overflow > 0.5) {
            local.push(
              `page ${n + 1}: figure runs ${pg.overflow}px past the page`,
            );
          }
        }
        for (const l of local) failures.push(`${theme}: ${l}`);
        console.log(
          `${theme}: reserve ${s.reserve}, ${result.total} pages${
            local.length > 0 ? `, ${local.length} PROBLEMS` : ""
          }`,
        );
      }
    } finally {
      await browser.close();
    }
    assertEquals(failures, []);
  },
});

// ── The printer itself (regressions from the 2026-10-14 audit) ──────────────

// A tiny document whose "runner" publishes after `delayMs`, so a test can
// choose how long the layout takes.
function readyAfter(delayMs: number, extraScript = ""): string {
  return `<!doctype html><html><body><p id=o>x</p><script>${extraScript}` +
    `setTimeout(()=>{globalThis["${FASTR_PAGED_GLOBAL}"]={total:1,pages:[]};}, ${delayMs});` +
    `</script></body></html>`;
}

// The printed html is the caller's: only self-contained URLs, and the Google
// Fonts hosts the font fallback needs, may be fetched.
Deno.test("the printer allows data:, blob: and the font hosts only", () => {
  for (
    const url of [
      "data:font/woff2;base64,AAAA",
      "blob:null/1b2c",
      "about:blank",
      "https://fonts.googleapis.com/css2?family=Inter",
      "https://fonts.gstatic.com/s/inter/v1/x.woff2",
    ]
  ) {
    assert(isPrintRequestAllowed(url), url);
  }
  for (
    const url of [
      "http://127.0.0.1:8080/metadata",
      "http://169.254.169.254/latest/meta-data/",
      "http://localhost/x",
      "http://fonts.googleapis.com/css2",
      "https://fonts.googleapis.com:8443/css2",
      "https://fonts.googleapis.com.evil.example/x",
      "file:///etc/passwd",
      "ws://127.0.0.1:1/",
      "not a url",
    ]
  ) {
    assert(!isPrintRequestAllowed(url), url);
  }
});

Deno.test({
  name:
    "a document that never yields is rejected in time and the queue moves on",
  ignore: CHROME_PATH === undefined,
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const printer = createReportPdfRenderer({
      chromePath: CHROME_PATH!,
      timeoutMs: 3000,
    });
    try {
      const started = Date.now();
      const stuck = await printer.render(
        "<html><body><script>for(;;){}</script></body></html>",
      ).then(() => "resolved", (e: Error) => e.message);
      assertEquals(stuck, "Timed out printing the report.");
      assert(Date.now() - started < 20_000, `${Date.now() - started} ms`);
      const next = await printer.render(readyAfter(0));
      assertEquals(next.pages, 1);
    } finally {
      await printer.close();
    }
  },
});

Deno.test({
  name: "the idle close armed by one render does not fire under the next",
  ignore: CHROME_PATH === undefined,
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const printer = createReportPdfRenderer({
      chromePath: CHROME_PATH!,
      timeoutMs: 20_000,
      idleCloseMs: 1500,
    });
    try {
      assertEquals((await printer.render(readyAfter(0))).pages, 1);
      await new Promise((r) => setTimeout(r, 1000));
      // Starts 1 s into the 1.5 s idle window and lays out for 2 s.
      assertEquals((await printer.render(readyAfter(2000))).pages, 1);
    } finally {
      await printer.close();
    }
  },
});

Deno.test({
  name: "the printed page cannot reach the network",
  ignore: CHROME_PATH === undefined,
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const hits: string[] = [];
    const server = Deno.serve(
      { port: 0, hostname: "127.0.0.1", onListen() {} },
      (req) => {
        hits.push(new URL(req.url).pathname);
        if (req.headers.get("upgrade") === "websocket") {
          const { socket, response } = Deno.upgradeWebSocket(req);
          socket.onopen = () => socket.send("WS-SECRET");
          return response;
        }
        return new Response("HTTP-SECRET", {
          headers: { "access-control-allow-origin": "*" },
        });
      },
    );
    const base = `127.0.0.1:${server.addr.port}`;
    // The page reports what it could reach, then publishes its "layout".
    const html = `<!doctype html><html><body><p id=o>x</p>` +
      `<img src="http://${base}/img.png"><link rel=stylesheet href="http://${base}/css">` +
      `<script>const out=[];` +
      `const f=fetch("http://${base}/metadata").then(r=>r.text()).then(t=>out.push(t),()=>out.push("fetch-blocked"));` +
      `const w=new Promise(res=>{const s=new WebSocket("ws://${base}/ws");s.onmessage=m=>{out.push(m.data);res();};s.onerror=()=>{out.push("ws-blocked");res();};});` +
      `const d=fetch("data:text/plain,DATA-OK").then(r=>r.text()).then(t=>out.push(t));` +
      `Promise.all([f,w,d]).then(()=>{document.getElementById("o").textContent=out.join("|");` +
      `globalThis["${FASTR_PAGED_GLOBAL}"]={total:1,pages:[]};});</script></body></html>`;
    const browser = await launchChrome(CHROME_PATH!);
    try {
      let seen = "";
      await printPagedDocument(browser, html, {
        timeoutMs: 20_000,
        inspect: async (page) => {
          seen = await page.evaluate(() =>
            document.getElementById("o")!.textContent ?? ""
          );
        },
      });
      assertEquals(seen.split("|").sort(), [
        "DATA-OK",
        "fetch-blocked",
        "ws-blocked",
      ]);
      assertEquals(hits, []);
    } finally {
      await browser.close();
      await server.shutdown();
    }
  },
});
