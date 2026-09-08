// Renders the pagination fixtures (server/tests/fixtures/fastr_pdf/) through
// the REAL print path — the same document shell, theme sheet, paged sheet and
// Paged.js runner the client builds, printed by headless Chrome
// (server/report_pdf/paged_chrome.ts) — and asserts the pagination rules on
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
//     deno test -A server/tests/report_pdf_render_test.ts

import { assert, assertEquals } from "@std/assert";
import {
  buildFastrPagedCss,
  buildFastrReportCss,
  FASTR_PAGED_ATOMIC_SELECTORS,
  FASTR_REPORT_THEMES,
  type FastrReportTheme,
  fastrPagedRunnerJs,
  fastrPrintTitleHtml,
  pagedDocumentScriptsHtml,
  readFastrDocumentSettings,
  renderFastrMarkdownToHtml,
  wrapReportDocument,
} from "../../lib/mod.ts";
import {
  launchChrome,
  printPagedDocument,
} from "../../server/report_pdf/paged_chrome.ts";

const CHROME_PATH = Deno.env.get("CHROME_PATH");
const OUT_DIR = Deno.env.get("FASTR_PDF_OUT");
const POLYFILL_URL = new URL(
  "../../client/node_modules/pagedjs/dist/paged.polyfill.min.js",
  import.meta.url,
);
const FIXTURE_DIR = new URL("./fixtures/fastr_pdf/", import.meta.url);

const TRANSPARENT_PIXEL =
  "data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==";

// A figure token has no raster here: a sized transparent box stands in, which
// is exactly what the editor's own layout frame does.
function withPlaceholderFigures(html: string): string {
  return html.replace(
    /<img src="figure:([^"]+)"/g,
    `<img src="${TRANSPARENT_PIXEL}" width="1200" height="675" data-embed-kind="figure" data-embed-id="$1"`,
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
    themeCss: buildFastrReportCss(theme),
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
  cover?: { page: number; fillsWidth: boolean; fillsHeight: boolean; footer: string };
  continuedBands?: number;
  continuedSteps?: number;
  stepsContinuation?: string;
  page2Footer?: string;
  splitTables: number;
};

// Runs inside the laid-out document. Plain JS by construction (it is
// serialized), so no lib helpers here.
function inspectPages(atomic: string): Inspection {
  const pages = Array.from(document.querySelectorAll<HTMLElement>(".pagedjs_page"));
  const problems: string[] = [];
  let splitTables = 0;
  const visible = (e: Element) =>
    e.getBoundingClientRect().height > 2 && (e.textContent ?? "").trim().length > 0;
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
    for (const el of Array.from(pg.querySelectorAll<HTMLElement>("[data-split-to]"))) {
      if (!el.matches(atomic)) continue;
      const outer = el.parentElement?.closest("[data-split-to]");
      if (outer && outer.matches(atomic)) continue;
      const ref = el.getAttribute("data-ref");
      let total = 0;
      for (const frag of Array.from(document.querySelectorAll(`[data-ref="${ref}"]`))) {
        total += frag.getBoundingClientRect().height;
      }
      if (total <= areaH * 0.98) {
        problems.push(
          `page ${i + 1}: ${el.tagName.toLowerCase()}.${
            el.className.split(" ")[0]
          } was split although it fits (${Math.round(total)}px of ${Math.round(areaH)}px)`,
        );
      }
    }
    for (const h of Array.from(pg.querySelectorAll("h1, h2, h3, h4, h5, h6"))) {
      if (h.closest(".fm-cover")) continue;
      if (!followedByContent(h, content)) {
        problems.push(
          `page ${i + 1}: heading "${(h.textContent ?? "").trim().slice(0, 40)}" ends the page`,
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
        problems.push(`page ${i + 1}: content follows a page break on the same page`);
      }
    }
  });
  const out: Inspection = { pages: pages.length, problems, splitTables };
  out.continuedBands = document.querySelectorAll(".fm-band[data-split-from]").length;
  out.continuedSteps = document.querySelectorAll(".fm-steps[data-split-from]").length;
  // Paged.js carries the step counter into a continuation by stamping the
  // running value on the first continued step (generated content itself is
  // not readable from script): it must not have started over.
  const cont = document.querySelector<HTMLElement>(".fm-steps[data-split-from] > *");
  out.stepsContinuation = cont?.getAttribute("data-counter-fm-step-value") ?? undefined;
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
const SCREENSHOT_THEMES: FastrReportTheme[] = ["default", "ministry", "terminal"];

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
      for (const theme of FASTR_REPORT_THEMES) matrix.push({ fixture: sink, theme });
      for (const theme of SCREENSHOT_THEMES) {
        for (const fixture of all) {
          if (fixture.name !== "kitchen_sink") matrix.push({ fixture, theme });
        }
      }
      for (const { fixture, theme } of matrix) {
        const label = `${fixture.name}@${theme}`;
        const html = await buildDocument(fixture.body, theme, `Fixture ${fixture.name}`);
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
                await Deno.writeFile(`${dir}/page-${String(n).padStart(2, "0")}.png`, png);
              }
            }
          },
        });
        if (OUT_DIR && SCREENSHOT_THEMES.includes(theme)) {
          await Deno.mkdir(`${OUT_DIR}/${theme}/${fixture.name}`, { recursive: true });
          await Deno.writeFile(`${OUT_DIR}/${theme}/${fixture.name}/report.pdf`, pdf);
        }
        const ins = inspection!;
        const local: string[] = [...ins.problems];
        if (ins.pages !== result.total) {
          local.push(`runner counted ${result.total} pages, DOM has ${ins.pages}`);
        }
        const printed = pdfPageCount(pdf);
        if (printed !== result.total) {
          local.push(`PDF has ${printed} pages, layout has ${result.total}`);
        }
        if (fixture.body.includes(":::cover")) {
          const fills = /:::cover\{[^}]*\bfill=page\b/.test(fixture.body);
          if (!ins.cover) local.push("cover missing from the laid-out pages");
          else if (fills) {
            if (ins.cover.page !== 1) local.push(`cover on page ${ins.cover.page}`);
            if (!ins.cover.fillsWidth || !ins.cover.fillsHeight) {
              local.push("cover does not fill its page");
            }
            if (ins.cover.footer !== "none" && ins.cover.footer !== "normal") {
              local.push(`cover page carries a footer: ${ins.cover.footer}`);
            }
            if (!result.pages[0]?.cover) local.push("runner did not mark page 1 as a cover");
          } else {
            if (ins.cover.page !== 1) local.push(`cover on page ${ins.cover.page}`);
            if (!ins.cover.fillsWidth) local.push("cover does not bleed to the sheet's sides");
            if (ins.cover.fillsHeight) local.push("a natural cover fills its page");
            if (ins.cover.footer === "none" || ins.cover.footer === "normal" || ins.cover.footer === "missing") {
              local.push("page 1 with a natural cover has no footer");
            }
            if (result.pages[0]?.cover) local.push("runner marked page 1 as a cover page");
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
        // A band or a steps block continues across pages as a matter of
        // course: nothing to report, and the continuation keeps counting.
        if (fixture.name === "long_band") {
          if (ins.continuedBands === 0) local.push("the long band did not continue onto a second page");
          if (result.splits.length > 0) local.push("the runner reported the long band as an overflow split");
        }
        if (fixture.name === "long_steps") {
          if (ins.continuedSteps === 0) local.push("the long steps block did not continue onto a second page");
          const first = Number(ins.stepsContinuation);
          if (!(first > 1)) {
            local.push(`the continued steps restarted their numbering (first continued step: ${ins.stepsContinuation ?? "unstamped"})`);
          }
        }
        if (fixture.name === "explicit_breaks" && result.total !== 4) {
          local.push(`explicit breaks laid out to ${result.total} pages, expected 4`);
        }
        if (fixture.name === "landscape" && result.sheet.width < result.sheet.height) {
          local.push("landscape sheet is portrait");
        }
        // Every page (bar the first) starts at a known source line, and
        // reports how much of the sheet its content fills (the editor seeds
        // its page boxes from it): more than nothing, never past the sheet.
        for (const pg of result.pages) {
          if (pg.number > 1 && pg.firstLine === undefined) {
            local.push(`page ${pg.number} has no first line`);
          }
          if (!(pg.contentHeight > 0) || pg.contentHeight > result.sheet.height) {
            local.push(`page ${pg.number} content height ${pg.contentHeight} of a ${result.sheet.height}px sheet`);
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
