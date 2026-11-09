// ⚠️  SYNCED FROM report-forge (github.com/NicholasWillmott/report-forge)
// ⚠️  DO NOT EDIT HERE - changes are overwritten on the next sync.
//     Edit the report-forge repo, then run its ./sync.

// A theme's width fits (the geometry rule at FASTR_THEME_SPECS): how much
// wider than the default theme's its headings (headingFit) and restyled text
// roles (textFit) set, and the body tracking that sets its body face to the
// default theme's width (bodyTracking), measured in headless Chrome on the
// theme's own sheet with its web fonts loaded.
//
//   CHROME_PATH=... deno run -A -c deno.json report-forge/harness/theme_fit.ts
//
// The corpus is real report text: every heading in tests/fixtures and the
// page templates' examples, and their paragraphs, set on one unwrapped line
// in each role through the real renderer. A theme is measured WITH its
// current numbers applied, so what it prints is the current number corrected
// by what is left over: width is linear in size and in tracking, so a run on
// fitted themes prints their numbers back, which is the check that the ones in
// report_fastr_themes.ts are current. Roles inherit the body tracking, so after
// changing a theme's bodyTracking run it again.

import { dirname, fromFileUrl, join } from "@std/path";
import {
  buildFastrReportCss,
  FASTR_HEADING_TAGS,
  FASTR_PAGE_TEMPLATES,
  FASTR_REPORT_THEMES,
  FASTR_TEXT_ROLES,
  fastrHeadingFit,
  type FastrTextRole,
  fastrTextFit,
  fastrThemeHasOwnGeometry,
  fastrThemeTokens,
  renderFastrMarkdownToHtml,
  wrapReportDocument,
} from "../engine/mod.ts";
import { launchChrome } from "../server/paged_chrome.ts";

const chromePath = Deno.env.get("CHROME_PATH");
if (!chromePath) {
  console.error("CHROME_PATH must name a Chrome or chrome-headless-shell");
  Deno.exit(2);
}

const here = dirname(fromFileUrl(import.meta.url));
const fixtures = join(here, "..", "tests", "fixtures");
const sources: string[] = FASTR_PAGE_TEMPLATES.map((t) => t.example);
for (const f of Deno.readDirSync(fixtures)) {
  if (f.name.endsWith(".md")) {
    sources.push(Deno.readTextFileSync(join(fixtures, f.name)));
  }
}
const lines = sources.flatMap((s) => s.split("\n"));
const headings = [
  ...new Set(
    lines.map((l) => /^#{1,6}\s+(.+?)\s*$/.exec(l)?.[1])
      .filter((h): h is string => h !== undefined && h.length > 2),
  ),
];
// Prose without markup: a role's sample is plain words.
const prose = [
  ...new Set(
    lines.filter((l) => /^[A-Z][^:|#!*[\]{}<>`]{60,}$/.test(l.trim()))
      .map((l) => l.trim()),
  ),
].slice(0, 60);
// Attribute text goes in quotes: none of the samples may carry one.
const attr = (t: string) => t.replace(/"/g, "");

// One body per role and the body text itself: each sample is its own element.
const ROLE_SELECTOR: Record<FastrTextRole | "body", string> = {
  body: "body > p",
  caption: ".fm-figure__caption",
  "callout-title": ".fm-callout__title",
  "card-title": ".fm-card__title",
  "stat-value": ".fm-stat__value",
  "stat-label": ".fm-stat__label",
  kicker: ".fm-kicker",
  th: "thead th",
  quote: ".fm-quote > p",
  cite: ".fm-quote__cite",
};
const values = ["90%", "1.5%", "73%", "98%", "12,480", "+7pp", "0.62", "4 of 6"];
const markdown = [
  ...prose.map((p) => p),
  ...prose.map((p, i) => `![${attr(p)}](image:sample${i})`),
  ...prose.map((p) => `:::callout{kind=note title="${attr(p)}"}\nx\n:::`),
  ...headings.map((h) => `:::card{title="${attr(h)}"}\nx\n:::`),
  ...values.map((v) => `:::stat{value="${v}" label="x"}`),
  ...prose.map((p) => `:::stat{value="1" label="${attr(p)}"}`),
  ...headings.map((h) => `:::band{kicker="${attr(h)}"}\nx\n:::`),
  ...headings.map((h) => `| ${h} |\n|---|\n| x |`),
  ...prose.map((p) => `:::quote{cite="${attr(p)}"}\n${p}\n:::`),
].join("\n\n");
const roleHtml = renderFastrMarkdownToHtml(markdown, { lineAnchors: false });
const escape = (t: string) =>
  t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const headingHtml = FASTR_HEADING_TAGS.map((tag) =>
  headings.map((h) => `<${tag} data-fit="${tag}">${escape(h)}</${tag}>`).join(
    "",
  )
).join("");
// Every sample on one line, measured as its text run (a Range), whatever box
// the role draws around it.
const NOWRAP = `<style>[data-fit], ${
  Object.values(ROLE_SELECTOR).join(", ")
} { white-space: nowrap !important; }</style>`;

type Measured = { width: number; chars: number; fontPx: number };
const browser = await launchChrome(chromePath);
const measured: Record<string, Record<string, Measured>> = {};
try {
  for (const theme of FASTR_REPORT_THEMES) {
    const html = wrapReportDocument({
      title: "fit",
      themeCss: buildFastrReportCss(theme, undefined, "", {
        omitPrintRules: true,
      }),
      bodyHtml: NOWRAP + headingHtml + roleHtml,
      documentClass: "",
      documentStyle: "",
    });
    const page = await browser.newPage();
    await page.setContent(html);
    // Every face the samples ask for, loaded: a fallback face measures a fit
    // for a font nobody sees.
    let loaded = false;
    for (let i = 0; i < 80 && !loaded; i++) {
      loaded = await page.evaluate(() => {
        const fams = new Set<string>();
        for (const e of Array.from(document.querySelectorAll("body *"))) {
          const cs = getComputedStyle(e);
          fams.add(`${cs.fontStyle} ${cs.fontWeight} 20px ${cs.fontFamily}`);
        }
        return Promise.all(Array.from(fams).map((f) => document.fonts.load(f)))
          .then((r) => r.every((x) => x.length > 0));
      });
      if (!loaded) await new Promise((r) => setTimeout(r, 250));
    }
    if (!loaded) throw new Error(`${theme}: its fonts never loaded`);
    const selectors: Record<string, string> = { ...ROLE_SELECTOR };
    for (const tag of FASTR_HEADING_TAGS) {
      selectors[tag] = `[data-fit="${tag}"]`;
    }
    measured[theme] = await page.evaluate((sel: Record<string, string>) => {
      const out: Record<string, Measured> = {};
      for (const [key, s] of Object.entries(sel)) {
        let width = 0;
        let chars = 0;
        let fontPx = 0;
        for (const e of Array.from(document.querySelectorAll(s))) {
          const r = document.createRange();
          r.selectNodeContents(e);
          width += r.getBoundingClientRect().width;
          chars += (e.textContent ?? "").length;
          fontPx = parseFloat(getComputedStyle(e).fontSize);
        }
        out[key] = { width, chars, fontPx };
      }
      return out;
    }, { args: [selectors] });
    await page.close();
  }
} finally {
  await browser.close();
}

const base = measured["default"];
// A theme on its own body is its own geometry: nothing to fit it to.
const fitted = FASTR_REPORT_THEMES.filter((t) =>
  !fastrThemeHasOwnGeometry(fastrThemeTokens(t))
);
const round = (n: number) => Number(n.toFixed(3));
console.log(`${headings.length} headings, ${prose.length} paragraphs`);
for (const theme of fitted) {
  const tokens = fastrThemeTokens(theme);
  const m = measured[theme];
  const ratio = (key: string) => m[key].width / base[key].width;
  const headingFit = FASTR_HEADING_TAGS.map((tag) =>
    round(fastrHeadingFit(tokens, tag) * ratio(tag))
  );
  const textFit = FASTR_TEXT_ROLES.map((r) =>
    round(fastrTextFit(tokens, r) * ratio(r))
  );
  // Tracking adds one letter-space per character: the shortfall in width,
  // spread over the characters, in the body's em.
  const b = m.body;
  const tracking = (Number.parseFloat(tokens.bodyTracking ?? "0") || 0) +
    (base.body.width - b.width) / (b.chars * b.fontPx);
  console.log(`${theme}:`);
  console.log(
    `    headingFit: { ${
      FASTR_HEADING_TAGS.map((t, i) => `${t}: ${headingFit[i]}`).join(", ")
    } },`,
  );
  console.log(
    `    textFit: { ${
      FASTR_TEXT_ROLES.map((r, i) => `"${r}": ${textFit[i]}`).join(", ")
    } },`,
  );
  console.log(`    bodyTracking: "${round(tracking)}em",`);
}
