// ⚠️  SYNCED FROM report-forge (github.com/NicholasWillmott/report-forge)
// ⚠️  DO NOT EDIT HERE - changes are overwritten on the next sync.
//     Edit the report-forge repo, then run its ./sync.

// Every built-in theme lays a body out to the default theme's boxes (the
// geometry rule at FASTR_THEME_SPECS): a report fitted to its pages on one
// theme is fitted on all of them. Each fixture, and a real AI-written report
// (tests/geometry/), is printed through the real paged path on every theme
// and held to the default theme's print:
//   • the same pages, opening on the same source lines and rows;
//   • every top-level block the same height, to half a pixel;
//   • no page template holding more than it shows where it did not before.
// A theme's face still wraps the odd line of prose at another word than the
// default theme's (bodyTracking matches the WIDTH of its lines, not where
// each one breaks), so a block of body text may stand whole body lines
// taller or shorter, and only that.
//
// Env-gated like the PDF render test: needs CHROME_PATH (a
// chrome-headless-shell binary). Run:
//   CHROME_PATH=... LD_LIBRARY_PATH=... \
//     deno test -A report-forge/tests/report_theme_geometry_test.ts

import { assertEquals } from "@std/assert";
import {
  buildFastrPagedCss,
  buildFastrReportCss,
  FASTR_REPORT_THEMES,
  fastrBodyLinePx,
  fastrThemeHasOwnGeometry,
  fastrThemeTokens,
  fastrPagedRunnerJs,
  fastrPrintTitleHtml,
  type FastrReportTheme,
  pagedDocumentScriptsHtml,
  readFastrDocumentSettings,
  renderFastrMarkdownToHtml,
  sizedPlaceholderImageSrc,
  wrapReportDocument,
} from "../engine/mod.ts";
import type { FastrPagedResult } from "../engine/report_fastr_paged.ts";
import { launchChrome, printPagedDocument } from "../server/paged_chrome.ts";

const CHROME_PATH = Deno.env.get("CHROME_PATH");
const POLYFILL_URL = new URL(
  "../ui/exports/vendor/paged.polyfill.min.js",
  import.meta.url,
);
const CORPUS = [
  new URL("./fixtures/", import.meta.url),
  new URL("./geometry/", import.meta.url),
];
// The body's line box: the house body every theme this test holds sets.
const BODY_LINE_PX = fastrBodyLinePx({});

async function corpus(): Promise<{ name: string; body: string }[]> {
  const out: { name: string; body: string }[] = [];
  for (const dir of CORPUS) {
    for await (const entry of Deno.readDir(dir)) {
      if (!entry.name.endsWith(".md")) continue;
      out.push({
        name: entry.name.replace(/\.md$/, ""),
        body: await Deno.readTextFile(new URL(entry.name, dir)),
      });
    }
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

// What the editor's layout frame does with a figure that has no raster: a
// sized 16:9 box.
function documentFor(body: string, theme: FastrReportTheme, polyfill: string) {
  const settings = readFastrDocumentSettings(body);
  return wrapReportDocument({
    title: "Geometry",
    bodyHtml: renderFastrMarkdownToHtml(body, { lineAnchors: true }).replace(
      /<img src="(?:figure|image):([^"]+)"/g,
      `<img src="${
        sizedPlaceholderImageSrc(1200, 675)
      }" width="1200" height="675" data-embed-kind="figure" data-embed-id="$1"`,
    ),
    themeCss: buildFastrReportCss(theme, undefined, "", {
      omitPrintRules: true,
    }),
    documentClass: settings.className,
    documentStyle: settings.style,
    headExtraCss: buildFastrPagedCss(settings.page, {
      title: "Geometry",
      pageWord: "Page",
      ofWord: "of",
    }),
    bodyPrefixHtml: fastrPrintTitleHtml("Geometry"),
    bodySuffixHtml: pagedDocumentScriptsHtml(polyfill, fastrPagedRunnerJs()),
  });
}

const pagesOf = (r: FastrPagedResult) =>
  r.pages.map((p) => `${p.firstLine}:${p.firstRow ?? 0}`).join(" ");
const overfullOf = (r: FastrPagedResult) =>
  r.pages.flatMap((p) => (p.overfull ?? []).map((o) => `${o.line}:${o.area}`));

// A height difference prose may make: whole body lines, give or take the
// half pixel the layout rounds to.
function wholeLines(diff: number): boolean {
  const lines = Math.round(Math.abs(diff) / BODY_LINE_PX);
  return lines > 0 && Math.abs(Math.abs(diff) - lines * BODY_LINE_PX) <= 0.6;
}

Deno.test({
  name: "every theme lays a report out exactly as the default theme does",
  ignore: CHROME_PATH === undefined,
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const polyfill = await Deno.readTextFile(POLYFILL_URL);
    const browser = await launchChrome(CHROME_PATH!);
    const failures: string[] = [];
    try {
      for (const { name, body } of await corpus()) {
        const lines = body.split("\n");
        const print = async (theme: FastrReportTheme) =>
          (await printPagedDocument(
            browser,
            documentFor(body, theme, polyfill),
            { timeoutMs: 120_000 },
          )).result;
        const base = await print("default");
        const baseHeights = new Map(
          (base.blocks ?? []).map((b) => [b.line, b.height]),
        );
        for (const theme of FASTR_REPORT_THEMES) {
          if (theme === "default") continue;
          // A theme on its own body is its own geometry, by design.
          if (fastrThemeHasOwnGeometry(fastrThemeTokens(theme))) continue;
          const r = await print(theme);
          if (pagesOf(r) !== pagesOf(base)) {
            failures.push(
              `${name} on ${theme}: pages open at ${pagesOf(r)}, default ${
                pagesOf(base)
              }`,
            );
          }
          const extra = overfullOf(r).filter((o) =>
            !overfullOf(base).includes(o)
          );
          if (extra.length > 0) {
            failures.push(`${name} on ${theme}: overfull ${extra.join(", ")}`);
          }
          for (const b of r.blocks ?? []) {
            const h = baseHeights.get(b.line);
            if (h === undefined) continue;
            const diff = b.height - h;
            if (Math.abs(diff) <= 0.5 || wholeLines(diff)) continue;
            failures.push(
              `${name} on ${theme}: line ${b.line + 1} (${
                lines[b.line].slice(0, 40)
              }) ${diff > 0 ? "+" : ""}${diff.toFixed(2)}px`,
            );
          }
        }
      }
    } finally {
      await browser.close();
    }
    assertEquals(failures, []);
  },
});
