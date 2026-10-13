import {
  type FastrReportTheme,
  fastrThemeTokens,
} from "../../engine/report_fastr_themes.ts";
import type { FastrWordFont } from "../../engine/report_fastr_word.ts";

// The theme's typefaces for embedding in a Word file. Word embeds TrueType,
// and the browser cannot ask Google Fonts for TrueType (the user agent is not
// ours to set; Google answers a browser with woff2 only), so the faces ship
// with the package under assets/fonts/word: one face per family, the regular
// of a body family and the weight a heading-only family is used at. docx
// embeds one face per name, so the other weights are Word's to synthesize.
// Every family is under the SIL Open Font License, which permits embedding
// (assets/fonts/word/README.md).
//
// Each URL is written out in full: the bundler follows `new URL(literal,
// import.meta.url)` to ship the file, and cannot follow a computed path.
const face = (url: URL, weight: number) => ({ url: url.href, weight });
const WORD_FONT_FILES: Record<string, { url: string; weight: number }> = {
  "Inter": face(
    new URL("../../assets/fonts/word/Inter-400.ttf", import.meta.url),
    400,
  ),
  "Source Sans 3": face(
    new URL("../../assets/fonts/word/SourceSans3-400.ttf", import.meta.url),
    400,
  ),
  "Merriweather": face(
    new URL("../../assets/fonts/word/Merriweather-700.ttf", import.meta.url),
    700,
  ),
  "Playfair Display": face(
    new URL(
      "../../assets/fonts/word/PlayfairDisplay-700.ttf",
      import.meta.url,
    ),
    700,
  ),
  "IBM Plex Sans": face(
    new URL("../../assets/fonts/word/IBMPlexSans-400.ttf", import.meta.url),
    400,
  ),
  "IBM Plex Serif": face(
    new URL("../../assets/fonts/word/IBMPlexSerif-400.ttf", import.meta.url),
    400,
  ),
  "Space Grotesk": face(
    new URL("../../assets/fonts/word/SpaceGrotesk-400.ttf", import.meta.url),
    400,
  ),
  "Archivo": face(
    new URL("../../assets/fonts/word/Archivo-700.ttf", import.meta.url),
    700,
  ),
  "Source Serif 4": face(
    new URL("../../assets/fonts/word/SourceSerif4-400.ttf", import.meta.url),
    400,
  ),
};

const cache = new Map<string, Promise<FastrWordFont | undefined>>();

function firstFamily(stack: string): string {
  return stack.split(",")[0].replace(/["']/g, "").trim();
}

function load(family: string): Promise<FastrWordFont | undefined> {
  let p = cache.get(family);
  if (p === undefined) {
    p = (async () => {
      const entry = WORD_FONT_FILES[family];
      if (entry === undefined) return undefined;
      const resp = await fetch(entry.url);
      if (!resp.ok) throw new Error(`${resp.status} fetching ${entry.url}`);
      const data = new Uint8Array(await resp.arrayBuffer());
      return { name: family, data, weight: entry.weight };
    })().catch((e) => {
      console.warn(
        `The ${family} face could not be loaded for embedding; Word will substitute.`,
        e,
      );
      cache.delete(family);
      return undefined;
    });
    cache.set(family, p);
  }
  return p;
}

// The faces a theme's body and headings use, ready for the document's
// `fonts`. Never throws: a face that cannot be fetched is left out and the
// document still names it, so Word substitutes rather than the export failing.
export async function loadThemeFontsForWord(
  theme: FastrReportTheme,
): Promise<FastrWordFont[]> {
  const tokens = fastrThemeTokens(theme);
  const families = [
    ...new Set([firstFamily(tokens.fontBody), firstFamily(tokens.fontHeading)]),
  ];
  const faces = await Promise.all(families.map(load));
  return faces.filter((f): f is FastrWordFont => f !== undefined);
}
