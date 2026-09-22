import { FASTR_THEME_TOKENS, type FastrReportTheme, type FastrWordFont } from "lib";

// The theme's typefaces for embedding in a Word file. Word embeds TrueType,
// and the browser cannot ask Google Fonts for TrueType (the user agent is not
// ours to set; Google answers a browser with woff2 only), so the faces are
// vendored under client/public/fonts/word: one face per family, the regular
// of a body family and the weight a heading-only family is used at. docx
// embeds one face per name, so the other weights are Word's to synthesize.
// Every family is under the SIL Open Font License, which permits embedding.
const WORD_FONT_FILES: Record<string, { file: string; weight: number }> = {
  "Inter": { file: "Inter-400.ttf", weight: 400 },
  "Source Sans 3": { file: "SourceSans3-400.ttf", weight: 400 },
  "Merriweather": { file: "Merriweather-700.ttf", weight: 700 },
  "Playfair Display": { file: "PlayfairDisplay-700.ttf", weight: 700 },
  "IBM Plex Sans": { file: "IBMPlexSans-400.ttf", weight: 400 },
  "IBM Plex Serif": { file: "IBMPlexSerif-400.ttf", weight: 400 },
  "Space Grotesk": { file: "SpaceGrotesk-400.ttf", weight: 400 },
  "Archivo": { file: "Archivo-700.ttf", weight: 700 },
  "Source Serif 4": { file: "SourceSerif4-400.ttf", weight: 400 },
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
      const resp = await fetch(`/fonts/word/${entry.file}`);
      if (!resp.ok) throw new Error(`${resp.status} fetching ${entry.file}`);
      const data = new Uint8Array(await resp.arrayBuffer());
      return { name: family, data, weight: entry.weight };
    })().catch((e) => {
      console.warn(`The ${family} face could not be loaded for embedding; Word will substitute.`, e);
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
export async function loadThemeFontsForWord(theme: FastrReportTheme): Promise<FastrWordFont[]> {
  const tokens = FASTR_THEME_TOKENS[theme] ?? FASTR_THEME_TOKENS.default;
  const families = [...new Set([firstFamily(tokens.fontBody), firstFamily(tokens.fontHeading)])];
  const faces = await Promise.all(families.map(load));
  return faces.filter((f): f is FastrWordFont => f !== undefined);
}
