import type { APIResponseWithData, FastrPageSetup } from "lib";
import { FASTR_PAGE_MARGIN_MM } from "lib";

// Turning a RENDERED report into page images, which is the only way to make a
// PDF of an html/fastr report without the browser's print dialog (that dialog
// cannot hand a file back to the page). The document is mounted in a hidden
// iframe, rasterized with html2canvas, and cut into pages at safe boundaries.
//
// Two things are load-bearing:
//   • foreignObject rendering. html2canvas's default path draws text word by
//     word and drops the SPACES between them on this document's fonts; the
//     foreignObject path hands the markup to the browser and comes back
//     faithful.
//   • a colour pass. html2canvas is old enough that it cannot parse CSS Color
//     4, and Chrome serializes every color-mix() in the theme as
//     `color(srgb …)`. Each offending declaration is rewritten to rgba() —
//     using the browser itself as the converter — before the capture.

const MM_PER_IN = 25.4;
const CSS_PX_PER_IN = 96;
const PT_PER_IN = 72;

const PAGE_MM: Record<FastrPageSetup["size"], [number, number]> = {
  a4: [210, 297],
  letter: [216, 279],
  legal: [216, 356],
};

export type ReportPageImages = {
  // JPEG data URLs, one per page, already sized to the sheet.
  pages: string[];
  // The sheet, in points — what jsPDF wants.
  pageWidthPt: number;
  pageHeightPt: number;
  marginPt: number;
};

const MODERN_COLOR_RE = /\b(?:color|oklch|oklab|lab|lch|hwb)\([^()]*\)/g;
const MODERN_COLOR_TEST = /\b(?:color|oklch|oklab|lab|lch|hwb)\(/;

// The browser as the converter: painting the colour and reading the PIXEL
// back gives concrete rgba whatever the input syntax was (reading fillStyle
// back just returns CSS Color 4 again).
function makeColorConverter(): (value: string) => string {
  const probe = document.createElement("canvas").getContext("2d");
  if (!probe) return (v) => v;
  return (value: string) =>
    value.replace(MODERN_COLOR_RE, (m) => {
      probe.clearRect(0, 0, 1, 1);
      probe.fillStyle = "rgba(0,0,0,0)";
      probe.fillStyle = m;
      probe.fillRect(0, 0, 1, 1);
      const [r, g, b, a] = probe.getImageData(0, 0, 1, 1).data;
      return `rgba(${r}, ${g}, ${b}, ${(a / 255).toFixed(3)})`;
    });
}

// Rewrite every declaration html2canvas would choke on, elements and their
// ::before/::after alike (a pseudo-element takes an injected rule, since it
// has no inline style of its own).
function modernizeColors(doc: Document): void {
  const convert = makeColorConverter();
  const rules: string[] = [];
  const all = [doc.documentElement, ...doc.querySelectorAll("*")];
  all.forEach((el, i) => {
    const view = doc.defaultView;
    if (!view) return;
    const cs = view.getComputedStyle(el);
    for (let k = 0; k < cs.length; k++) {
      const prop = cs[k];
      const value = cs.getPropertyValue(prop);
      if (!MODERN_COLOR_TEST.test(value)) continue;
      (el as HTMLElement).style.setProperty(prop, convert(value));
    }
    for (const pseudo of ["::before", "::after"]) {
      const pcs = view.getComputedStyle(el, pseudo);
      const decls: string[] = [];
      for (let k = 0; k < pcs.length; k++) {
        const prop = pcs[k];
        const value = pcs.getPropertyValue(prop);
        if (!MODERN_COLOR_TEST.test(value)) continue;
        decls.push(`${prop}: ${convert(value)} !important`);
      }
      if (decls.length === 0) continue;
      (el as HTMLElement).setAttribute("data-fm-pdf", String(i));
      rules.push(`[data-fm-pdf="${i}"]${pseudo} { ${decls.join("; ")} }`);
    }
  });
  if (rules.length === 0) return;
  const style = doc.createElement("style");
  style.textContent = rules.join("\n");
  doc.head.append(style);
}

// Where a page may end without cutting through a block: the bottom of every
// top-level element, plus the bottom of anything that asked for its own page.
function safeCuts(
  doc: Document,
): { cuts: number[]; forced: Map<number, string>; contentEnd: number } {
  const cuts: number[] = [];
  // A block that takes a page to itself, and the ground that page is painted
  // with — a cover shorter than the sheet must still LOOK like a title page.
  const forced = new Map<number, string>();
  let contentEnd = 0;
  for (const el of Array.from(doc.body.children)) {
    const box = el as HTMLElement;
    const bottom = box.offsetTop + box.offsetHeight;
    cuts.push(bottom);
    contentEnd = Math.max(contentEnd, bottom);
    if (box.classList.contains("fm-cover")) {
      const ground = doc.defaultView?.getComputedStyle(box).backgroundColor;
      forced.set(bottom, ground && ground !== "rgba(0, 0, 0, 0)" ? ground : "#ffffff");
    }
  }
  return { cuts: cuts.sort((a, b) => a - b), forced, contentEnd };
}

// The frame is the PAGE, not the document: `vh` units (a cover's height, for
// one) must resolve against the printed sheet or the cover comes out sized to
// whatever the hidden frame happened to be.
function mountFrame(
  html: string,
  widthPx: number,
  heightPx: number,
): Promise<HTMLIFrameElement> {
  const frame = document.createElement("iframe");
  frame.setAttribute("sandbox", "allow-same-origin");
  frame.setAttribute("aria-hidden", "true");
  frame.tabIndex = -1;
  frame.style.cssText =
    `position:fixed;left:-20000px;top:0;width:${widthPx}px;height:${heightPx}px;border:0;pointer-events:none;`;
  document.body.append(frame);
  return new Promise((resolve) => {
    frame.addEventListener("load", () => resolve(frame), { once: true });
    frame.srcdoc = html;
  });
}

// The standalone report document → one JPEG per printed page.
export async function rasterizeReportPages(
  html: string,
  page: FastrPageSetup,
  progress: (pct: number) => void,
): Promise<APIResponseWithData<ReportPageImages>> {
  const [mmW, mmH] = PAGE_MM[page.size];
  const [sheetW, sheetH] = page.orientation === "landscape"
    ? [mmH, mmW]
    : [mmW, mmH];
  const marginMm = FASTR_PAGE_MARGIN_MM[page.margin];
  const pxPerMm = CSS_PX_PER_IN / MM_PER_IN;
  // The document is laid out at the printable width, so its own measure and
  // bleed rules resolve exactly as they would on paper.
  const contentPx = Math.round((sheetW - marginMm * 2) * pxPerMm);
  const pageContentPx = Math.round((sheetH - marginMm * 2) * pxPerMm);
  let frame: HTMLIFrameElement | undefined;
  try {
    frame = await mountFrame(html, contentPx, pageContentPx);
    const doc = frame.contentDocument;
    if (!doc) throw new Error("no document");
    await doc.fonts.ready;
    // Images in the export are data URLs, so one frame is enough for layout.
    await new Promise((r) => setTimeout(r, 150));
    progress(0.15);
    modernizeColors(doc);
    const { cuts, forced, contentEnd } = safeCuts(doc);
    // The document's own end, NOT scrollHeight: a trailing margin would
    // otherwise become a blank final page.
    const total = Math.max(1, Math.min(doc.body.scrollHeight, Math.ceil(contentEnd)));
    const html2canvas = (await import("html2canvas")).default;
    const canvas = await html2canvas(doc.body, {
      scale: 2,
      backgroundColor: null,
      width: contentPx,
      height: total,
      windowWidth: contentPx,
      // The sheet again, so vh-sized blocks match what was measured.
      windowHeight: pageContentPx,
      useCORS: true,
      logging: false,
      foreignObjectRendering: true,
    });
    progress(0.6);
    const scale = canvas.height / Math.max(1, total);
    const pages: string[] = [];
    let y = 0;
    let guard = 0;
    while (y < total - 1 && guard++ < 200) {
      const ideal = y + pageContentPx;
      const force = [...forced.keys()].find((f) => f > y + 4 && f <= ideal);
      const fit = cuts.filter((c) => c > y + 4 && c <= ideal);
      const end = force ?? (fit.length > 0 ? fit[fit.length - 1] : ideal);
      const sliceH = Math.max(1, Math.min(total - y, end - y));
      const out = document.createElement("canvas");
      out.width = canvas.width;
      // A page that takes the whole sheet (a cover) keeps the sheet's height,
      // so its ground runs to the edges instead of stopping short.
      out.height = Math.round(
        (force !== undefined ? pageContentPx : sliceH) * scale,
      );
      const ctx = out.getContext("2d");
      if (!ctx) throw new Error("no 2d context");
      // The report's own page colour, so a short page is not transparent.
      const pageGround = doc.defaultView?.getComputedStyle(doc.documentElement)
        .backgroundColor;
      const ground = force !== undefined
        ? forced.get(force)!
        : pageGround && pageGround !== "rgba(0, 0, 0, 0)"
        ? pageGround
        : "#ffffff";
      ctx.fillStyle = ground;
      ctx.fillRect(0, 0, out.width, out.height);
      const srcH = Math.round(sliceH * scale);
      ctx.drawImage(
        canvas,
        0,
        Math.round(y * scale),
        canvas.width,
        srcH,
        0,
        0,
        out.width,
        srcH,
      );
      pages.push(out.toDataURL("image/jpeg", 0.9));
      y = end;
      progress(0.6 + 0.3 * Math.min(1, y / Math.max(1, total)));
    }
    return {
      success: true,
      data: {
        pages,
        pageWidthPt: (sheetW / MM_PER_IN) * PT_PER_IN,
        pageHeightPt: (sheetH / MM_PER_IN) * PT_PER_IN,
        marginPt: (marginMm / MM_PER_IN) * PT_PER_IN,
      },
    };
  } catch (e) {
    return {
      success: false,
      err: "Error rendering the report pages: " +
        (e instanceof Error ? e.message : String(e)),
    };
  } finally {
    frame?.remove();
  }
}
