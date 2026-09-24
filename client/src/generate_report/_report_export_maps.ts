import { type FigureInputs, type FigureMap, type ImageMap } from "panther";
import type { FigureBlock, ImageBlock } from "lib";
import { buildFigureInputs } from "~/generate_visualization/mod";
import { resolveLogoUrl } from "~/generate_slide_deck/fastr_logos";

// Build the FigureMap markdownTo{Pdf,Word}Browser expect: keyed by the literal
// markdown src ("figure:<id>"), value = HYDRATED FigureInputs.
export async function buildReportFigureMap(
  figures: Record<string, FigureBlock>,
): Promise<FigureMap> {
  const map: FigureMap = new Map();
  for (const [id, block] of Object.entries(figures)) {
    if (!block.bundle) continue;
    try {
      map.set(`figure:${id}`, buildFigureInputs(block.bundle));
    } catch {
      // Skip a figure that fails to build; the exporter swaps its token for a
      // visible placeholder rather than aborting the whole report.
    }
  }
  return map;
}

export async function buildReportImageMap(
  images: Record<string, ImageBlock>,
): Promise<ImageMap> {
  const map: ImageMap = new Map();
  for (const [id, block] of Object.entries(images)) {
    if (!block.imgFile) continue;
    const entry = await loadImageEntry(resolveLogoUrl(block.imgFile));
    if (entry) map.set(`image:${id}`, entry);
  }
  return map;
}

export async function loadImageEntry(
  url: string,
): Promise<{ dataUrl: string; width: number; height: number } | undefined> {
  // Any failure (fetch, read, decode) returns undefined so the image is simply
  // absent from the map; the exporter then renders a placeholder in its place
  // instead of aborting the whole report.
  try {
    const resp = await fetch(url);
    if (!resp.ok) return undefined;
    const blob = await resp.blob();
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error("Failed to read image"));
      reader.readAsDataURL(blob);
    });
    const dims = await new Promise<{ width: number; height: number }>(
      (resolve, reject) => {
        const img = new Image();
        img.onload = () =>
          resolve({ width: img.naturalWidth, height: img.naturalHeight });
        img.onerror = () => reject(new Error("Failed to load image"));
        img.src = dataUrl;
      },
    );
    return { dataUrl, ...dims };
  } catch {
    return undefined;
  }
}

const DOWNLOAD_MARGIN_DU = 20;

// Background and margin are baked into the figure's surrounds so the plain
// panther export helper renders them: no manual canvas compositing. Every
// report caller wants the transparent, unpadded variant, because the report's
// own page supplies the ground and the spacing.
export function figureInputsForDownload(
  fi: FigureInputs,
  transparent: boolean,
  padding: boolean,
): FigureInputs {
  return {
    ...fi,
    style: {
      ...fi.style,
      surrounds: {
        ...fi.style?.surrounds,
        backgroundColor: transparent ? "none" : "#ffffff",
        padding: padding ? DOWNLOAD_MARGIN_DU : 0,
      },
    },
  };
}
