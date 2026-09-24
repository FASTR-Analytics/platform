import {
  type APIResponseNoData,
  buildFastrWordDocument,
  createFastrMarkdownIt,
  dataUrlToWordImage,
  fastrWordRasterBlockIds,
  type FastrWordFigure,
  type FastrWordRasterBlock,
  getFastrReportTheme,
  getReportCustomStyle,
  readFastrDocumentSettings,
  type ReportDetail,
} from "lib";
import { Packer } from "docx";
import { saveAs } from "panther";
import { serverActions } from "~/server_actions";
import type { FigureRasterState } from "~/generate_report/mod";
import { buildStandaloneReportHtml } from "./export_report_as_html";
import { fastrPagedFooter } from "./export_report_as_paged_pdf";
import { loadThemeFontsForWord } from "./word_theme_fonts";

// The Word file of a FASTR Markdown report (lib/report_fastr_word.ts): the
// text as native Word structures, the decorative blocks as pictures made by
// the server's headless Chrome with editable text boxes over them. Built
// HERE, in the browser that owns the figure rasters, from the same standalone
// document the PDF prints; the server only pictures and measures the blocks.

// An inlined image's pixel size, which the document builder needs to scale it.
async function imageSize(dataUrl: string): Promise<{ width: number; height: number }> {
  const img = new Image();
  img.src = dataUrl;
  await img.decode();
  return { width: img.naturalWidth, height: img.naturalHeight };
}

async function buildWordBlob(
  detail: ReportDetail,
  progress: (pct: number) => void,
): Promise<Blob> {
  const md = createFastrMarkdownIt();
  const tokens = md.parse(detail.body, {});
  const blocks = fastrWordRasterBlockIds(tokens);
  const settings = readFastrDocumentSettings(detail.body);
  const collect = { figures: new Map<string, FigureRasterState>(), images: new Map<string, string>() };
  progress(0.05);
  const html = await buildStandaloneReportHtml(
    detail,
    (v) => progress(0.05 + v * 0.4),
    { inlineFonts: true, rasterFrame: { page: settings.page }, collect },
  );
  const theme = getFastrReportTheme(detail.config);
  const fonts = await loadThemeFontsForWord(theme);
  progress(0.5);

  // A report with no decorative block never needs the server.
  const rasters = new Map<number, FastrWordRasterBlock>();
  if (blocks.length > 0) {
    const res = await serverActions.rasterizeReportBlocks(
      { product_id: detail.id, html, blocks },
      (p) => progress(0.5 + Math.max(0, Math.min(1, p)) * 0.35),
    );
    if (!res.success) throw new Error(res.err);
    for (const b of res.data.blocks) rasters.set(b.id, b);
  }
  progress(0.85);

  const images = new Map<string, FastrWordFigure>();
  for (const [id, url] of collect.images) {
    try {
      const size = await imageSize(url);
      const fig = dataUrlToWordImage(url, size.width, size.height);
      if (fig) images.set(id, fig);
    } catch {
      // Left out: the builder writes the missing-image note in its place.
    }
  }
  const doc = buildFastrWordDocument({
    tokens,
    body: detail.body,
    title: detail.label,
    theme,
    colors: getReportCustomStyle(detail.config)?.colors ?? undefined,
    footer: fastrPagedFooter(detail.label),
    rasters,
    figure: (id) => {
      const r = collect.figures.get(id);
      return r?.state === "ready" ? dataUrlToWordImage(r.url, r.width, r.height) : undefined;
    },
    image: (id) => images.get(id),
    fonts,
  });
  progress(0.92);
  return await Packer.toBlob(doc);
}

export async function exportFastrReportAsWord(
  productId: string,
  progress: (pct: number) => void,
): Promise<APIResponseNoData> {
  try {
    await new Promise((res) => setTimeout(res, 0));
    progress(0.03);
    const res = await serverActions.getReportDetail({ product_id: productId });
    if (!res.success) return res;
    const blob = await buildWordBlob(res.data, (v) => progress(0.03 + v * 0.97));
    progress(1);
    saveAs(blob, `${res.data.label}.docx`);
    return { success: true };
  } catch (e) {
    return {
      success: false,
      err: "Error exporting the report as Word: " +
        (e instanceof Error ? e.message : String(e)),
    };
  }
}
