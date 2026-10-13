import {
  type APIResponseNoData,
  buildFastrWordDocument,
  createFastrMarkdownIt,
  dataUrlToWordImage,
  fastrWordDarkFigures,
  type FastrWordFigure,
  getFastrReportTheme,
  getReportCustomStyle,
  type ReportDetail,
} from "lib";
import { Packer } from "docx";
import { saveAs } from "panther";
import { serverActions } from "~/server_actions";
import { loadReportEmbeds } from "./export_report_as_html";
import { fastrPagedFooter } from "./export_report_as_paged_pdf";
import { loadThemeFontsForWord } from "./word_theme_fonts";

// The Word file of a FASTR Markdown report (report-forge/engine/report_fastr_word.ts): a
// plain, editable document. Built entirely HERE, in the browser that draws
// the figures; the server is asked for the report and nothing else.

// An inlined image's pixel size, which the document builder needs to scale it.
async function imageSize(
  dataUrl: string,
): Promise<{ width: number; height: number }> {
  const img = new Image();
  img.src = dataUrl;
  await img.decode();
  return { width: img.naturalWidth, height: img.naturalHeight };
}

async function buildWordBlob(
  detail: ReportDetail,
  progress: (pct: number) => void,
): Promise<Blob> {
  const tokens = createFastrMarkdownIt().parse(detail.body, {});
  const theme = getFastrReportTheme(detail.config);
  const base = {
    tokens,
    body: detail.body,
    title: detail.label,
    theme,
    colors: getReportCustomStyle(detail.config)?.colors ?? undefined,
    footer: fastrPagedFooter(detail.label),
  };
  // Each figure is drawn in the ink of the ground it stands on in the Word
  // document, which is not always its ground on screen.
  const dark = fastrWordDarkFigures(base);
  progress(0.05);
  const embeds = await loadReportEmbeds(
    detail,
    (id) => dark.has(id),
    (v) => progress(0.05 + v * 0.75),
  );
  const fonts = await loadThemeFontsForWord(theme);
  progress(0.85);

  const images = new Map<string, FastrWordFigure>();
  for (const [id, url] of embeds.images) {
    try {
      const size = await imageSize(url);
      const fig = dataUrlToWordImage(url, size.width, size.height);
      if (fig) images.set(id, fig);
    } catch {
      // Left out: the builder writes the missing-image note in its place.
    }
  }
  const doc = buildFastrWordDocument({
    ...base,
    figure: (id) => {
      const r = embeds.figures.get(id);
      return r?.state === "ready"
        ? dataUrlToWordImage(r.url, r.width, r.height)
        : undefined;
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
    const blob = await buildWordBlob(
      res.data,
      (v) => progress(0.03 + v * 0.97),
    );
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
