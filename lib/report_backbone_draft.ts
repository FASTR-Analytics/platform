// =============================================================================
// Drafting a report backbone (lib/types/report_backbone.ts) from an example
// report. The model reads the example (a PDF document block, or a Word
// file's text and pictures) and fills a FLAT schema with no optional or
// nullable field ("" or 0 is "none": structured outputs refuse a schema with
// many unions, the deck blueprint's lesson), which backboneFromDraft then
// checks against the platform's own vocabularies and turns into a backbone.
// A person reviews the result in the style editor before it is saved.
//
// The model call is injected (ReportBackboneDraftCall), so the browser's
// proxy client and a test harness drive the same code.
// =============================================================================

import { z } from "zod";
import {
  FASTR_COVER_LAYOUTS,
  FASTR_FRAME_STYLES,
  type FastrContainerAttrs,
  fastrCoverAccentsOf,
  fastrReportHeaderAttrs,
  fastrThemeIds,
  fastrThemeTokens,
  isFastrLeafBlock,
  isFastrReportTheme,
  scanContainerLines,
} from "../report-forge/engine/mod.ts";
import {
  REPORT_BACKBONE_CHART_TYPES,
  REPORT_BACKBONE_COMPARISONS,
  REPORT_BACKBONE_FREQUENCIES,
  REPORT_BACKBONE_HEADER_ATTRS,
  REPORT_BACKBONE_OFFERED_WIDGETS,
  REPORT_BACKBONE_REGISTERS,
  type ReportBackbone,
  type ReportBackboneChartType,
  type ReportBackboneFrequency,
  reportBackboneSchema,
  type ReportBackboneWidget,
} from "./types/report_backbone.ts";
import type { ReportStyleColors } from "./types/report_styles.ts";

const freqOrNone = z.enum(["", ...REPORT_BACKBONE_FREQUENCIES]);

// What the example shows, each named only when it does (the prompt says
// what each means).
export const REPORT_BACKBONE_DRAFT_TRAITS = [
  "figuresNumbered",
  "captionsAbove",
  "captionsBold",
  "pageNumbers",
  "numberedSections",
  "sectionBars",
  "sectionHeadings",
  "introduction",
  "conclusion",
  "figureIntroSentence",
  "oneFigurePerSection",
  "justified",
  "coverFillsPage",
  "coverTitleCapitals",
  "signoffRight",
] as const;
type DraftTrait = (typeof REPORT_BACKBONE_DRAFT_TRAITS)[number];

// The cover's ground as the model sees it, and the tone each one is.
const COVER_GROUNDS = ["white", "dark", "accent", "pale"] as const;
const COVER_TONES: Record<(typeof COVER_GROUNDS)[number], string> = {
  white: "default",
  dark: "ink",
  accent: "accent",
  pale: "paper",
};

export const reportBackboneDraftOutputSchema = z.object({
  // The yes-or-no traits, as one list: a boolean field each made the
  // compiled grammar too large for structured outputs.
  traits: z.array(z.enum(REPORT_BACKBONE_DRAFT_TRAITS)),
  name: z.string(),
  description: z.string(),
  pageColor: z.string(),
  inkColor: z.string(),
  accentColor: z.string(),
  theme: z.string(),
  sourceLine: z.string(),
  headerText: z.string(),
  footerText: z.string(),
  frame: z.enum(["", ...FASTR_FRAME_STYLES]),
  frameColor: z.string(),
  footerRuleColors: z.array(z.string()),
  coverLayout: z.string(),
  coverGround: z.enum(["", ...COVER_GROUNDS]),
  coverColors: z.string(),
  coverKicker: z.string(),
  coverSub: z.string(),
  coverIssue: z.string(),
  coverDate: z.string(),
  ministryLines: z.array(z.string()),
  logoCount: z.number(),
  signoffLabels: z.array(z.string()),
  pagesTypical: z.number(),
  wordsPerPage: z.number(),
  wordsPerFigure: z.number(),
  leastPageFillPercent: z.number(),
  outline: z.array(z.object({
    role: z.string(),
    purpose: z.string(),
    repeat: z.boolean(),
  })),
  figureLeadIn: z.string(),
  templates: freqOrNone,
  widgets: z.object(
    Object.fromEntries(
      REPORT_BACKBONE_OFFERED_WIDGETS.map((w) => [w, freqOrNone]),
    ) as Record<
      (typeof REPORT_BACKBONE_OFFERED_WIDGETS)[number],
      typeof freqOrNone
    >,
  ),
  chartTypes: z.array(z.enum(REPORT_BACKBONE_CHART_TYPES)),
  chartBreakdown: z.string(),
  chartComparison: z.enum(["", ...REPORT_BACKBONE_COMPARISONS]),
  chartsNotPossible: z.array(z.string()),
  language: z.string(),
  register: z.enum(["", ...REPORT_BACKBONE_REGISTERS]),
  notes: z.string(),
});
export type ReportBackboneDraftOutput = z.infer<
  typeof reportBackboneDraftOutputSchema
>;

// One line per theme the model may name: its faces and colours, from the
// engine's own tokens, so a new theme is offered without editing this file.
// Not offered: `legacy` is the old markdown look, kept for converting
// markdown reports, not a house style to write to.
const UNOFFERED_THEMES = new Set(["legacy"]);
function themeLines(): string {
  return fastrThemeIds().filter((id) => !UNOFFERED_THEMES.has(id)).map((id) => {
    const t = fastrThemeTokens(id);
    const face = (f: string) => f.split(",")[0].replaceAll('"', "").trim();
    return `- ${id}: headings in ${face(t.fontHeading)}, text in ${
      face(t.fontBody)
    }; page ${t.palette.paper}, ink ${t.palette.ink}, accent ${t.palette.accent}`;
  }).join("\n");
}

export function reportBackboneDraftSystem(): string {
  return `You read an example report and describe its HOUSE STYLE, so that new reports on other subjects can be written to look and read like it. You describe how it is built, never what it says: no finding, number, name of a person or place-specific fact of the example goes into your answer, except where a field asks for a word-for-word line (the masthead). Where a line of the example names its place, period or issue number (a header, a cover line), write the line with the tokens {Place}, {Period}, {Year} and {Issue} in their place.

MEASURE, do not guess: count the pages, the words on typical pages (body text, not tables), the words in the paragraph or two that read each chart, how many figures a section holds, and look at how full the pages are. Read the colours off the pages as hex.

Answer every field. "" or 0 or [] means the example has none of it, or it cannot be told.

Fields:
- traits: every one of these the example shows (leave out those it does not): figuresNumbered (figures and tables carry numbers, "Figure 3", "Tableau 2"); captionsAbove (their titles stand over them); captionsBold (the WHOLE caption is bold in the accent colour, not just its number); pageNumbers (the pages carry page numbers); numberedSections (the section headings carry numbers); sectionBars (the section headings are set as filled bars); sectionHeadings (the body has section headings, larger titles over its sections; leave it out when its only titles are the figure and table captions); introduction (an introduction section); conclusion (a conclusion or recommendations section); figureIntroSentence (a sentence before a figure announces it, "The chart below shows…"; leave it out when a caption follows the previous analysis directly); oneFigurePerSection (each section is one figure or table and its analysis); justified (the body text is justified, both edges straight); coverFillsPage (the cover is a page of its own); coverTitleCapitals (the cover title is set in capitals); signoffRight (the signature block stands at the right).
- name: a short name for the style, in the example's language ("Bulletin mensuel de district"). description: one line saying what kind of report it is.
- pageColor, inkColor, accentColor: hex colours of the page, the body text and the accent the BODY uses (figure captions, headings, rules). A cover's own colours are asked for separately (coverBoxColor), so take the accent from the inner pages.
- theme: the closest of these themes, chosen by the BODY TEXT's typeface first (the colours are set separately): a plain office sans (Arial, Calibri, Century Gothic, Helvetica, Verdana) is "default"; a condensed sans is "assessment"; a serif body is "editorial" or "broadsheet"; a serif headline over a sans body is "ministry" or "executive". The rest are designed looks an office document rarely has. The themes:
${themeLines()}
- sourceLine: the source printed under figures, without its label ("DHIS2 SNIS", not "Source : DHIS2 SNIS"), or "".
- headerText / footerText: the line printed at the top / foot of every page (tokens for its place, period, issue), or "". frame: a border drawn round every page: "line" (a hairline), "double" (a medium line with a thin one inside), "bold" (one heavy line), "heavy" (a broad coloured band, clearly thicker than a rule, usually with a fine line of another colour beside it: an official Word page border), or "". frameColor: its hex, or two ("#000080 #0070c0") when its fine line is another colour: the main line's first. footerRuleColors: the colours of a stripe across the foot of each page (e.g. a national flag's), left to right, or [].
- coverLayout: the cover's composition, one of ${
    FASTR_COVER_LAYOUTS.join(", ")
  }, or "" when there is no cover. A ministry's cover with its logos and ministry lines is one of the official four: "bulletin" (a logo each side of the centred ministry lines, the title in a filled box, an issue strip, the date at the foot), "letterhead" (the logos in a row across the top, the lines set left under them over a rule, the title set left), "seal" (the logos centred over the centred lines, the title on the axis with no box) or "banner" (the logos and lines in a coloured band across the top of the page, the title below). The others: "frame" a framed formal cover, "centered" all on the axis. coverGround: the cover page's background: white (the plain page, the usual for an official bulletin), dark, accent (the whole page in a colour) or pale. coverColors: the hex of the filled box the title sits in (or of a banner's band), then of the strip holding the issue number ("#c4e0a0 #548235"; one hex when they match), when the cover has them (they are often not the body's accent: a green title box over blue captions), else "". coverKicker / coverSub / coverIssue / coverDate: its small line over the title, its line under it, its issue number and its date line, with tokens.
- ministryLines: the ministry's lines at the head of the cover (the country, the ministry, the directorate), word for word, top to bottom, EXCEPT that the name of the region, district or town the example is about is written {Place} ("Direction Préfectorale de la santé de {Place}"); the country's own lines stay as printed. Or []. logoCount: how many logos the cover carries.
- signoffLabels: the labels of a signature block at the end ("Prepared by", "Approved by"), never the names, or [].
- pagesTypical: its length in pages. wordsPerPage: words of body text on a typical page. wordsPerFigure: words that read each chart. leastPageFillPercent: how full its emptier pages normally are (a page holding one chart and a short analysis may be 35).
- outline: its usual sections in order, each a role ("Data quality", "Indicator") and a one-line purpose in general terms; repeat=true for a section repeated for each indicator or topic. figureLeadIn: the words that open the analysis after each figure, as printed ("Analyse :"), or "".
- templates: how often it uses whole designed pages laid out in the document itself (summary pages of boxes, divider pages): never, rare, normal, often. A screenshot or exported image of a dashboard, a matrix or a chart pasted into a page is a FIGURE (count it in chartTypes), never a template.
- widgets: how often it uses each kind of block, counted on the pages: callout (a boxed caveat or finding), tiles and stat (key-number boxes), columns (text set beside text or a chart), quote, band (a full-width coloured strip holding text), steps (numbered actions), contents (a table of contents), logos, masthead, signoff. "never" for any it does not show: a coloured chart, table or screenshot is not a band, and a masthead and logos on the cover alone are "rare".
- chartTypes: the kinds of figure it uses, most used first: chart (bars), table, timeseries (lines over time), map, pie. chartBreakdown: what its charts are broken down by, in words ("by health facility"). chartComparison: what a period is compared with. chartsNotPossible: forms it draws that the platform cannot, in words, from these only: a target or threshold line drawn across a chart, bars with a line on a second axis, a running (year-to-date) total beside the period's value. The platform DOES draw grouped and stacked bars, horizontal ranked bars, tables with cells coloured by thresholds (data-quality matrices included), lines over time, maps and pies: never list those.
- language: the report's language code ("fr"). register: formal, plain or technical. notes: a few sentences on how it reads (how analysis paragraphs are built, what they always say, what tone), in general terms, for a writer of a new report in this style.`;
}

export type ReportBackboneDraftCall = (
  system: string,
  content: unknown[],
  schema: typeof reportBackboneDraftOutputSchema,
) => Promise<
  { data: ReportBackboneDraftOutput | null; stopReason: string | null }
>;

export type DraftedReportBackbone = {
  label: string;
  description: string;
  colors: ReportStyleColors | null;
  backbone: ReportBackbone;
  // What was dropped or corrected on the way in, for the reviewer.
  warnings: string[];
};

// The model's reading of the example, `content` being the example as message
// blocks (a PDF document block, or text and images).
export async function runReportBackboneDraft(args: {
  content: unknown[];
  call: ReportBackboneDraftCall;
}): Promise<DraftedReportBackbone> {
  const res = await args.call(
    reportBackboneDraftSystem(),
    [
      ...args.content,
      {
        type: "text",
        text:
          "Describe this example report's house style in the fields asked for.",
      },
    ],
    reportBackboneDraftOutputSchema,
  );
  if (res.data === null) {
    throw new Error(
      res.stopReason === "max_tokens"
        ? "The example was too long to read in one go."
        : `The example could not be read (${res.stopReason ?? "no answer"}).`,
    );
  }
  return backboneFromDraft(res.data);
}

const HEX_RE = /^#[0-9a-f]{6}$/i;
const TOKENED = (s: string) => s.replace(/\s+/g, " ").trim();

// The model's flat answer as a backbone, every id checked against the
// platform's own lists: what does not fit is dropped and said.
export function backboneFromDraft(
  d: ReportBackboneDraftOutput,
): DraftedReportBackbone {
  const warnings: string[] = [];
  const hex = (v: string, what: string) => {
    const t = v.trim();
    if (t === "") return undefined;
    if (HEX_RE.test(t)) return t.toLowerCase();
    warnings.push(`${what} "${v}" is not a colour; left out.`);
    return undefined;
  };
  const words = (v: string, max: number) => {
    const t = TOKENED(v);
    return t === "" ? undefined : t.slice(0, max);
  };
  const count = (n: number, lo: number, hi: number) =>
    Number.isFinite(n) && n > 0
      ? Math.round(Math.min(hi, Math.max(lo, n)))
      : undefined;

  const has = (t: DraftTrait) => d.traits.includes(t);
  const hexes = (v: string, what: string) =>
    [
      ...new Set(
        v.split(/[\s,]+/).map((c) => hex(c, what)).filter((c): c is string =>
          c !== undefined
        ),
      ),
    ].slice(0, 2);
  const page = hex(d.pageColor, "The page colour");
  const ink = hex(d.inkColor, "The text colour");
  const accent = hex(d.accentColor, "The accent colour");
  const colors = page && ink && accent ? { page, ink, accent } : null;

  let theme: string | undefined = d.theme.trim();
  if (theme === "") theme = undefined;
  else if (!isFastrReportTheme(theme)) {
    warnings.push(
      `The theme "${d.theme}" is not one the platform has; left out.`,
    );
    theme = undefined;
  }

  const report: Record<string, string> = {};
  if (has("figuresNumbered")) report.figures = "numbered";
  if (has("captionsAbove")) report.captions = "above";
  // "Source : DHIS2 SNIS" is the label and the source; the label is printed
  // by the report (in its own language), so only the source is kept.
  const source = words(
    d.sourceLine.replace(/^\s*(sources?|fontes?)\s*:\s*/i, ""),
    120,
  );
  if (source) report.source = source;
  const header = words(d.headerText, 200);
  if (header) report.header = header;
  const footer = words(d.footerText, 200);
  if (footer) report.footer = footer;
  if (d.frame !== "") {
    report.frame = d.frame;
    const fc = hexes(d.frameColor, "The frame colour");
    if (fc.length > 0) report.framecolor = fc.join(" ");
  }
  if (has("captionsBold")) report.captionstyle = "bold";
  if (!has("pageNumbers")) {
    report.pagenumbers = "none";
    // No page number and no footer line: the foot of the page is empty.
    if (report.footer === undefined) report.footer = "none";
  }
  const rule = d.footerRuleColors.map((c) => hex(c, "A footer rule colour"))
    .filter((c): c is string => c !== undefined).slice(0, 4);
  if (rule.length > 0) report.footerrule = rule.join(" ");
  if (has("sectionBars")) report.sections = "bar";

  let layout: string | undefined = d.coverLayout.trim();
  if (layout === "") layout = undefined;
  else if (!(FASTR_COVER_LAYOUTS as readonly string[]).includes(layout)) {
    warnings.push(
      `The cover layout "${d.coverLayout}" is unknown; left to the AI.`,
    );
    layout = undefined;
  }
  const masthead = d.ministryLines.map((l) => words(l, 200)).filter(
    (l): l is string => l !== undefined,
  ).slice(0, 6);
  const hasCover = layout !== undefined || masthead.length > 0 ||
    d.coverIssue.trim() !== "" || d.coverDate.trim() !== "";
  const boxColors = hexes(d.coverColors, "A cover colour");

  const widgets: Record<string, string> = {};
  for (const w of REPORT_BACKBONE_OFFERED_WIDGETS) {
    if (d.widgets[w] !== "") widgets[w] = d.widgets[w];
  }
  const outline = d.outline.map((o) => ({
    role: TOKENED(o.role).slice(0, 80),
    purpose: TOKENED(o.purpose).slice(0, 300),
    ...(o.repeat ? { repeat: true } : {}),
  })).filter((o) => o.role !== "").slice(0, 30);
  const pages = count(d.pagesTypical, 1, 200);
  const fill = count(d.leastPageFillPercent, 10, 90);
  const labels = d.signoffLabels.map((l) => words(l, 60)).filter(
    (l): l is string => l !== undefined,
  ).slice(0, 3);
  const notPossible = d.chartsNotPossible.map((c) => words(c, 120)).filter(
    (c): c is string => c !== undefined,
  ).slice(0, 10);

  const raw: ReportBackbone = {
    version: 1,
    look: {
      ...(theme ? { theme } : {}),
      ...(Object.keys(report).length > 0 ? { report } : {}),
    },
    ...(hasCover
      ? {
        cover: {
          ...(layout ? { layout } : {}),
          ...(d.coverGround !== "" ? { tone: COVER_TONES[d.coverGround] } : {}),
          ...(has("coverFillsPage") ? { fill: true } : {}),
          ...(boxColors.length > 0 ? { boxColor: boxColors.join(" ") } : {}),
          ...(has("coverTitleCapitals") ? { upperTitle: true } : {}),
          ...(words(d.coverKicker, 200)
            ? { kicker: words(d.coverKicker, 200) }
            : {}),
          ...(words(d.coverSub, 200) ? { sub: words(d.coverSub, 200) } : {}),
          ...(words(d.coverIssue, 80)
            ? { issue: words(d.coverIssue, 80) }
            : {}),
          ...(words(d.coverDate, 80) ? { date: words(d.coverDate, 80) } : {}),
          ...(masthead.length > 0 ? { masthead } : {}),
          ...(count(d.logoCount, 0, 4)
            ? { logoSlots: count(d.logoCount, 0, 4) }
            : {}),
        },
      }
      : {}),
    ...(labels.length > 0
      ? {
        signoff: { labels, ...(has("signoffRight") ? { right: true } : {}) },
      }
      : {}),
    length: {
      ...(pages
        ? {
          pagesMin: Math.max(1, Math.round(pages * 0.75)),
          pagesMax: Math.round(pages * 1.25),
        }
        : {}),
      ...(count(d.wordsPerPage, 20, 1000)
        ? { wordsPerPage: count(d.wordsPerPage, 20, 1000) }
        : {}),
      ...(count(d.wordsPerFigure, 1, 600)
        ? { wordsPerFigure: count(d.wordsPerFigure, 1, 600) }
        : {}),
      ...(fill ? { minPageFill: fill / 100 } : {}),
    },
    structure: {
      ...(outline.length > 0 ? { outline } : {}),
      ...(has("numberedSections") ? { numberedSections: true } : {}),
      ...(has("oneFigurePerSection") ? { oneFigurePerSection: true } : {}),
      ...(words(d.figureLeadIn, 40)
        ? { figureLeadIn: words(d.figureLeadIn, 40) }
        : {}),
      // Said only when the example departs from the format's defaults.
      ...(has("sectionHeadings") ? {} : { headings: false }),
      ...(has("introduction") ? {} : { introduction: false }),
      ...(has("conclusion") ? {} : { conclusion: false }),
      ...(has("figureIntroSentence") ? {} : { figureIntro: false }),
      ...(has("justified") ? { justified: true } : {}),
    },
    ...(d.templates !== "" ? { templates: { use: d.templates } } : {}),
    ...(Object.keys(widgets).length > 0 ? { widgets } : {}),
    charts: {
      ...(d.chartTypes.length > 0
        ? { preferred: [...new Set(d.chartTypes)].slice(0, 5) }
        : {}),
      ...(words(d.chartBreakdown, 120)
        ? { breakdown: words(d.chartBreakdown, 120) }
        : {}),
      ...(d.chartComparison !== "" ? { comparison: d.chartComparison } : {}),
      ...(notPossible.length > 0 ? { approximated: notPossible } : {}),
    },
    voice: {
      ...(words(d.language, 10)
        ? { language: words(d.language, 10)!.toLowerCase() }
        : {}),
      ...(d.register !== "" ? { register: d.register } : {}),
      ...(d.notes.trim() ? { notes: d.notes.trim().slice(0, 3000) } : {}),
    },
  };
  // The schema is the last word: anything that slipped through the checks
  // above fails here rather than reaching the library.
  const backbone = reportBackboneSchema.parse(raw);
  return {
    label: words(d.name, 80) ?? "Report backbone",
    description: words(d.description, 200) ?? "",
    colors,
    backbone,
    warnings,
  };
}

// ── Measuring a FASTR report ─────────────────────────────────────────────────
// "Save as report backbone" on a report the platform already has: its look
// and the use it makes of each block are read off the body and its figures,
// exactly, with no model. What only reading can tell (its usual outline in
// general terms, its voice) is left for the person to write or keep empty;
// the section headings are offered as the outline to start from.

const SECTION_HEADING_RE = /^(#{1,2})\s+(.+?)\s*(\{[^}]*\})?\s*$/;

function frequencyOf(count: number): ReportBackboneFrequency {
  return count === 0
    ? "never"
    : count <= 2
    ? "rare"
    : count <= 6
    ? "normal"
    : "often";
}

export function measureReportBackbone(args: {
  label: string;
  body: string;
  theme: string | undefined;
  colors: ReportStyleColors | null;
  // Each figure's presentation type (its bundle's config.d.type).
  figureTypes: string[];
  // How many pages the editor laid the report out on, when it has.
  pages: number | undefined;
}): DraftedReportBackbone {
  const { body } = args;
  const lines = body.split("\n");
  const header = fastrReportHeaderAttrs(body) ?? {};
  const report: Record<string, string> = {};
  for (const k of REPORT_BACKBONE_HEADER_ATTRS) {
    const v = header[k];
    if (typeof v === "string" && v.trim() !== "") report[k] = v;
  }
  const numbered = header["numbering"] === "sections";
  delete report.numbering;

  const counts = new Map<string, number>();
  let cover: FastrContainerAttrs | undefined;
  const masthead: string[] = [];
  let coverTitled = false;
  let coverLogos = 0;
  const signers: string[] = [];
  let signoffRight = false;
  let paragraphs = 0;
  let justified = 0;
  const open: string[] = [];
  const outline: { role: string; purpose: string }[] = [];
  let proseWords = 0;
  for (const { text, inCode, fence } of scanContainerLines(lines)) {
    if (inCode) continue;
    if (fence?.kind === "open") {
      counts.set(fence.name, (counts.get(fence.name) ?? 0) + 1);
      if (fence.name === "cover" && cover === undefined) cover = fence.attrs;
      if (fence.name === "logos" && open.includes("cover")) {
        coverLogos = Math.max(
          coverLogos,
          typeof fence.attrs.src === "string"
            ? fence.attrs.src.split(/\s+/).filter((s) => s !== "").length
            : 1,
        );
      }
      if (fence.name === "signer" && typeof fence.attrs.label === "string") {
        signers.push(fence.attrs.label);
      }
      if (fence.name === "signoff" && fence.attrs.align === "right") {
        signoffRight = true;
      }
      if (!isFastrLeafBlock(fence.name)) open.push(fence.name);
      continue;
    }
    if (fence?.kind === "close") {
      open.pop();
      continue;
    }
    const t = text.trim();
    if (t === "") continue;
    // An official cover's ministry lines: its own lines before its title
    // (a cover saved with the retired masthead block holds them there).
    if (
      (open.at(-1) === "masthead" ||
        (open.at(-1) === "cover" && !coverTitled)) && masthead.length < 6
    ) {
      if (/^#{1,6}\s/.test(t)) {
        coverTitled = true;
      } else {
        masthead.push(t.slice(0, 200));
        continue;
      }
    }
    if (open.at(-1) === "cover") continue;
    const h = open.length === 0 ? SECTION_HEADING_RE.exec(t) : null;
    if (h) {
      if (outline.length < 30) {
        outline.push({ role: h[2].slice(0, 80), purpose: "" });
      }
      continue;
    }
    if (open.length === 0 && !t.startsWith("|") && !t.startsWith("![")) {
      proseWords += t.split(/\s+/).length;
      paragraphs++;
      if (/\{align=justify\}\s*$/.test(t)) justified++;
    }
  }

  const widgets: Partial<
    Record<ReportBackboneWidget, ReportBackboneFrequency>
  > = {};
  for (const w of REPORT_BACKBONE_OFFERED_WIDGETS) {
    widgets[w] = frequencyOf(counts.get(w) ?? 0);
  }
  const typeCounts = new Map<ReportBackboneChartType, number>();
  for (const t of args.figureTypes) {
    if ((REPORT_BACKBONE_CHART_TYPES as readonly string[]).includes(t)) {
      const k = t as ReportBackboneChartType;
      typeCounts.set(k, (typeCounts.get(k) ?? 0) + 1);
    }
  }
  const preferred = [...typeCounts.entries()].sort((a, b) => b[1] - a[1])
    .map(([t]) => t);
  const figures = args.figureTypes.length;
  const pages = args.pages !== undefined && args.pages > 0
    ? args.pages
    : undefined;
  // The cover's own colours as the backbone keeps them: the box's (or
  // band's), then the issue number's when it differs.
  const coverColors = (attrs: NonNullable<typeof cover>) => {
    const a = fastrCoverAccentsOf(attrs);
    const box = a.box?.bg;
    const issue = a.issue?.bg;
    if (box === undefined) return issue;
    return issue === undefined || issue === box ? box : `${box} ${issue}`;
  };
  const coverText = (k: string) =>
    typeof cover?.[k] === "string"
      ? (cover[k] as string).slice(0, 200)
      : undefined;

  const raw: ReportBackbone = {
    version: 1,
    look: {
      ...(args.theme !== undefined && isFastrReportTheme(args.theme)
        ? { theme: args.theme }
        : {}),
      ...(Object.keys(report).length > 0 ? { report } : {}),
    },
    ...(cover !== undefined
      ? {
        cover: {
          ...(coverText("layout") ? { layout: coverText("layout") } : {}),
          ...(coverText("tone")
            ? { tone: coverText("tone")!.slice(0, 20) }
            : {}),
          ...(coverColors(cover) !== undefined
            ? { boxColor: coverColors(cover) }
            : {}),
          ...(cover.fill === "page" ? { fill: true } : {}),
          ...(coverText("kicker") ? { kicker: coverText("kicker") } : {}),
          ...(coverText("sub") ? { sub: coverText("sub") } : {}),
          ...(coverText("issue")
            ? { issue: coverText("issue")!.slice(0, 80) }
            : {}),
          ...(coverText("date")
            ? { date: coverText("date")!.slice(0, 80) }
            : {}),
          ...(masthead.length > 0 ? { masthead } : {}),
          ...(coverLogos > 0 ? { logoSlots: Math.min(4, coverLogos) } : {}),
        },
      }
      : {}),
    ...(signers.length > 0
      ? {
        signoff: {
          labels: signers.slice(0, 3).map((l) => l.slice(0, 60)),
          ...(signoffRight ? { right: true } : {}),
        },
      }
      : {}),
    length: {
      ...(pages !== undefined
        ? {
          pagesMin: Math.max(1, Math.round(pages * 0.75)),
          pagesMax: Math.max(1, Math.round(pages * 1.25)),
          wordsPerPage: Math.min(
            1000,
            Math.max(20, Math.round(proseWords / pages)),
          ),
        }
        : {}),
      ...(figures > 0
        ? {
          wordsPerFigure: Math.min(600, Math.round(proseWords / figures)),
        }
        : {}),
    },
    structure: {
      ...(outline.length > 0 ? { outline } : { headings: false }),
      ...(numbered ? { numberedSections: true } : {}),
      // Most of its paragraphs are justified: the style is.
      ...(paragraphs > 0 && justified * 2 > paragraphs
        ? { justified: true }
        : {}),
    },
    templates: { use: frequencyOf(counts.get("page") ?? 0) },
    widgets,
    ...(preferred.length > 0 ? { charts: { preferred } } : {}),
  };
  return {
    label: `${args.label}`.slice(0, 80),
    description: "",
    colors: args.colors,
    backbone: reportBackboneSchema.parse(raw),
    warnings: [
      "Measured from this report. Its cover lines, header and outline are this report's own words: put {Place}, {Period}, {Year} and {Issue} where they name its place, period or number, and say in general terms what each section is for.",
    ],
  };
}
