import { Packer } from "docx";
import { createFastrMarkdownIt } from "../../engine/report_fastr_markdown.ts";
import {
  buildFastrWordDocument,
  dataUrlToWordImage,
  fastrWordDarkFigures,
  type FastrWordFigure,
} from "../../engine/report_fastr_word.ts";
import { fastrPagedFooter } from "./paged_pdf.ts";
import {
  loadReportEmbeds,
  type ReportDocument,
  type ReportExportHost,
} from "./standalone_html.ts";
import { loadThemeFontsForWord } from "./word_theme_fonts.ts";

// The Word file of a document (engine/report_fastr_word.ts): a plain,
// editable .docx. Built entirely in the browser, which is where the figures
// are drawn; nothing is asked of a server.

// An inlined image's pixel size, which the document builder needs to scale it.
async function imageSize(
  dataUrl: string,
): Promise<{ width: number; height: number }> {
  const img = new Image();
  img.src = dataUrl;
  await img.decode();
  return { width: img.naturalWidth, height: img.naturalHeight };
}

export async function buildReportWordBlob(
  doc: ReportDocument,
  host: ReportExportHost,
  progress: (pct: number) => void,
): Promise<Blob> {
  const tokens = createFastrMarkdownIt().parse(doc.body, {});
  const base = {
    tokens,
    body: doc.body,
    title: doc.title,
    theme: doc.theme,
    colors: doc.colors,
    footer: fastrPagedFooter(doc.title),
  };
  // Each figure is drawn in the ink of the ground it stands on in the Word
  // document, which is not always its ground on screen.
  const dark = fastrWordDarkFigures(base);
  progress(0.05);
  const embeds = await loadReportEmbeds(
    doc,
    host,
    (id) => dark.has(id),
    (v) => progress(0.05 + v * 0.75),
  );
  const fonts = await loadThemeFontsForWord(doc.theme);
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
  const document = buildFastrWordDocument({
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
  return await Packer.toBlob(document);
}
