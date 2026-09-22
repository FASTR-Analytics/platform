// Pictures the decorative blocks of the kitchen-sink fixture through the REAL
// raster path (server/report_pdf/rasterize_blocks.ts): the standalone
// document with the Word raster frame (lib/report_fastr_word.ts), loaded in
// headless Chrome, each block measured and screenshotted with its glyphs
// hidden. Asserts the geometry the document builder relies on:
//   • a band and a filling cover are the sheet's width, a tile row the column's;
//   • every text element the boxes will carry was found, inside its block;
//   • the kicker is measured as uppercase, the title at its display size;
//   • the PNGs are PNGs.
// The PNGs are written to FASTR_PDF_OUT (when set) for eyeballing: the
// glyphs must be gone while rules, pills, bullets and grounds remain.
//
// Env-gated: needs CHROME_PATH (a chrome-headless-shell binary). Run:
//   CHROME_PATH=... LD_LIBRARY_PATH=... FASTR_PDF_OUT=/tmp/word_rasters \
//     deno test -A server/tests/report_word_raster_test.ts

import { assert, assertEquals } from "@std/assert";
import { decodeBase64 } from "@std/encoding/base64";
import {
  buildFastrReportCss,
  buildFastrWordRasterCss,
  createFastrMarkdownIt,
  fastrWordRasterBlockIds,
  readFastrDocumentSettings,
  renderFastrMarkdownToHtml,
  sizedPlaceholderImageSrc,
  wrapReportDocument,
} from "../../lib/mod.ts";
import { launchChrome } from "../../server/report_pdf/paged_chrome.ts";
import { rasterizeBlocksOnPage } from "../../server/report_pdf/rasterize_blocks.ts";

const CHROME_PATH = Deno.env.get("CHROME_PATH");
const OUT_DIR = Deno.env.get("FASTR_PDF_OUT");
const FIXTURE = new URL("./fixtures/fastr_pdf/kitchen_sink.md", import.meta.url);

// A figure token has no raster here: a sized transparent box stands in.
function withPlaceholderFigures(html: string): string {
  return html.replace(
    /<img src="figure:([^"]+)"/g,
    `<img src="${sizedPlaceholderImageSrc(1200, 675)}" width="1200" height="675" data-embed-kind="figure" data-embed-id="$1"`,
  );
}

Deno.test({
  name: "word rasters: kitchen sink blocks are pictured and measured",
  ignore: CHROME_PATH === undefined,
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const body = await Deno.readTextFile(FIXTURE);
    const settings = readFastrDocumentSettings(body);
    const html = wrapReportDocument({
      title: "Kitchen sink",
      bodyHtml: withPlaceholderFigures(renderFastrMarkdownToHtml(body, { lineAnchors: true })),
      themeCss: buildFastrReportCss("default", undefined, "", { omitPrintRules: true }),
      documentClass: settings.className,
      documentStyle: settings.style,
      headExtraCss: buildFastrWordRasterCss(settings.page),
    });
    const blocks = fastrWordRasterBlockIds(createFastrMarkdownIt().parse(body, {}));
    assertEquals(blocks.length, 4);

    const browser = await launchChrome(CHROME_PATH!);
    try {
      const page = await browser.newPage();
      const out = await rasterizeBlocksOnPage(page, html, blocks, { timeoutMs: 60_000 });
      await page.close();
      assertEquals(out.map((b) => b.kind), ["cover", "tiles", "band", "band"]);

      if (OUT_DIR !== undefined) {
        await Deno.mkdir(OUT_DIR, { recursive: true });
        for (const b of out) {
          await Deno.writeFile(`${OUT_DIR}/${b.kind}_${b.id}.png`, decodeBase64(b.png));
          await Deno.writeTextFile(
            `${OUT_DIR}/${b.kind}_${b.id}.json`,
            JSON.stringify({ ...b, png: `${b.png.length} chars` }, null, 2),
          );
        }
      }

      const sheetW = 794;
      const column = 658;
      for (const b of out) {
        assert(b.png.startsWith("iVBORw0KGgo"), `${b.kind} ${b.id} is not a PNG`);
        assert(b.texts.length > 0, `${b.kind} ${b.id} has no text elements`);
        for (const t of b.texts) {
          assert(t.left >= -1 && t.top >= -1, `${b.kind} ${b.id}: a box lies above/left of its block`);
          assert(t.left + t.width <= b.widthPx + 1, `${b.kind} ${b.id}: a box runs past the block's right edge`);
          assert(t.top + t.height <= b.heightPx + 1, `${b.kind} ${b.id}: a box runs past the block's bottom`);
          assert(t.runs.length > 0);
        }
      }
      const [cover, tiles, band] = out;
      // The filling cover is the whole sheet, bled past the column by the margin.
      assertEquals(Math.round(cover.widthPx), sheetW);
      assert(cover.heightPx >= 1123, `cover height ${cover.heightPx}`);
      assertEquals(Math.round(cover.leftPx), -68);
      const coverWords = cover.texts.flatMap((t) => t.runs.map((r) => r.text)).join(" ");
      assert(coverWords.includes("Quarterly service review"), coverWords);
      const kicker = cover.texts.find((t) => t.runs.some((r) => r.text.includes("Ministry")));
      assert(kicker !== undefined && kicker.runs[0].allCaps, "kicker measured as uppercase");
      const title = cover.texts.find((t) => t.runs.some((r) => r.text.includes("Quarterly")));
      assert(title !== undefined && title.runs[0].fontSizePx >= 40, `title at ${title?.runs[0].fontSizePx}px`);
      // The tile row is the column; its stats carry value, label and delta.
      assertEquals(Math.round(tiles.widthPx), column);
      assertEquals(Math.round(tiles.leftPx), 0);
      const tileWords = tiles.texts.flatMap((t) => t.runs.map((r) => r.text));
      for (const w of ["64%", "ANC4 coverage", "+3pp", "88%"]) {
        assert(tileWords.includes(w), `tiles: ${w} not measured in ${JSON.stringify(tileWords)}`);
      }
      // A band bleeds to the sheet's edges.
      assertEquals(Math.round(band.widthPx), sheetW);
      assertEquals(Math.round(band.leftPx), -68);
      assert(band.texts.some((t) => t.runs.some((r) => r.text.includes("Late reporting"))));
    } finally {
      await browser.close();
    }
  },
});
