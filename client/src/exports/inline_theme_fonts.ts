// A FASTR theme's web fonts, made self-contained. The theme sheet loads its
// typefaces with one Google Fonts `@import`; the paged PDF is printed by a
// headless Chrome on the instance host, which must not depend on reaching
// Google (a blocked or slow host would silently fall back to system fonts and
// every page break would move). So the browser, which has the fonts already,
// fetches the CSS and the font files and hands the server a stylesheet with
// the faces embedded as data URLs: byte-identical fonts on both sides.
//
// Only the Latin and Latin Extended subsets are kept (the instances write in
// English, French and Portuguese); the Cyrillic, Greek and Vietnamese subsets
// Google serves alongside would triple the payload for glyphs no report uses.

const IMPORT_URL_RE = /@import\s+url\(\s*['"]?([^'")]+)['"]?\s*\)/;
const FONT_URL_RE = /url\(\s*['"]?([^'")]+)['"]?\s*\)/;
// The subset ranges Google Fonts labels /* latin */ and /* latin-ext */.
const KEEP_RANGE_RE = /unicode-range:\s*U\+0(000|100)/i;

const cache = new Map<string, Promise<string>>();

async function toDataUrl(url: string): Promise<string> {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`${resp.status} fetching ${url}`);
  const blob = await resp.blob();
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error(`Failed to read ${url}`));
    reader.readAsDataURL(blob);
  });
}

async function inline(fontImport: string): Promise<string> {
  const m = IMPORT_URL_RE.exec(fontImport);
  if (!m) return fontImport;
  const cssResp = await fetch(m[1]);
  if (!cssResp.ok) throw new Error(`${cssResp.status} fetching ${m[1]}`);
  const css = await cssResp.text();
  // Each @font-face block is one subset of one weight; keep the Latin ones.
  const blocks = css.split(/(?=@font-face)/).filter((b) => b.startsWith("@font-face"));
  const kept = blocks.filter((b) => !/unicode-range:/i.test(b) || KEEP_RANGE_RE.test(b));
  const out: string[] = [];
  for (const block of kept) {
    const u = FONT_URL_RE.exec(block);
    if (!u) continue;
    const dataUrl = await toDataUrl(u[1]);
    out.push(block.replace(u[0], `url(${dataUrl})`));
  }
  if (out.length === 0) throw new Error("no font faces found");
  return out.join("\n");
}

// The `@font-face` rules that replace the theme's `@import` line, or the
// original `@import` if the fonts could not be fetched (the server then loads
// them live, which is the second-best outcome rather than no fonts at all).
export function inlineThemeFontCss(fontImport: string): Promise<string> {
  if (fontImport.trim().length === 0) return Promise.resolve("");
  let p = cache.get(fontImport);
  if (p === undefined) {
    p = inline(fontImport).catch((e) => {
      console.warn("Theme fonts could not be inlined; the PDF loads them live.", e);
      cache.delete(fontImport);
      return fontImport;
    });
    cache.set(fontImport, p);
  }
  return p;
}
